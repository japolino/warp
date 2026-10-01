import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { normalizeRuleset } from "../engine/ruleset.js";
import { initialState } from "../engine/state.js";
import type { TurnRecord } from "../engine/resolve.js";
import { fakeHost, deferred } from "../testing/fake-host.js";
import { foldPath, newPlaythrough, patchMeta, requireCurrentPath, shiftAfterSwipeDelete, startPlaythrough, warpMeta, writeRecord } from "./ledger.js";
import { serialQueue, runCommand } from "./serial.js";
import { resolveWithDecisions } from "./decision-loop.js";
import { resolveTurnFull } from "../engine/resolve.js";
import { withDeadline } from "./deadline.js";
import { worldInfoPolicy } from "./knowledge.js";
import { invalidateCharacter, personProfile } from "./source.js";
import { dropPrewritten, momentKey, prewrite, writeReply } from "./drafts.js";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";
import { JevDecider } from "./deciders.js";
import { afterReply, interceptor, onGenerationEnded, onGenerationStarted, onGenerationStopped } from "./turn.js";
import { busyChats } from "./state-push.js";
import { patchSettings } from "./settings.js";
import { getRuleset } from "./source.js";

let fixture: ReturnType<typeof fakeHost>, original: unknown, n = 0;
beforeEach(() => { original = (globalThis as any).spindle; fixture = fakeHost(`reliability-${++n}`); (globalThis as any).spindle = fixture.api; });
afterEach(async () => { if (busyChats.has(fixture.messages[0]?.chat_id)) await onGenerationStopped({ chatId: fixture.messages[0].chat_id, generationId: "fixture-cleanup" }, fixture.character.id); (globalThis as any).spindle = original; invalidateCharacter(); });
const rules = () => normalizeRuleset({ stats: { hp: { start: 80, max: 1000 } } }).ruleset!;
const record = (delta = -10): TurnRecord => ({ v: 1, hints: [], events: [{ t: "stat", id: "hp", d: delta, src: "action" }], at: 1 });
describe("metadata and replay", () => {
  test("concurrent metadata patches preserve both writes and other extensions", async () => {
    const m = fixture.message("Story", false, { other_extension: { keep: true } }), gate = deferred<void>();
    let updates = 0; fixture.controls.beforeUpdate = async () => { if (++updates === 1) await gate.promise; };
    const one = writeRecord(m.chat_id, m.id, 0, record());
    const two = patchMeta(m.chat_id, m.id, "vn_hints", { notes: ["Hint"] });
    await Promise.resolve(); gate.resolve(); await Promise.all([one, two]);
    expect(warpMeta(m).swipes!["0"].events).toHaveLength(1); expect(m.metadata!.vn_hints).toEqual({ notes: ["Hint"] }); expect(m.metadata!.other_extension).toEqual({ keep: true });
  });
  test("failed work does not poison queues, and duplicate command IDs execute once", async () => {
    const serial = serialQueue(); let writes = 0;
    await expect(serial("test", async () => { throw new Error("retry"); })).rejects.toThrow("retry");
    await serial("test", async () => ++writes);
    await Promise.all([runCommand(fixture.character.id, "same", async () => ++writes), runCommand(fixture.character.id, "same", async () => ++writes)]);
    expect(writes).toBe(2);
  });
  test("swipe deletion shifts records and live choices together", async () => {
    const m = fixture.message("Two", false, { warp: { swipes: { "0": record(), "1": record(-20) }, live: { "0": [{ label: "Old", tag: "old" }], "1": [{ label: "Kept", tag: "new" }] } } });
    await shiftAfterSwipeDelete(m.chat_id, m.id, 0);
    expect(warpMeta(m).swipes!["0"].events[0]).toMatchObject({ d: -20 }); expect(warpMeta(m).live!["0"][0].label).toBe("Kept");
  });
  test("pinned initial state and caps survive author edits and JSON persistence", async () => {
    const r = rules(), root = fixture.message("Hello"), reply = fixture.message("An injury");
    await writeRecord(reply.chat_id, reply.id, 0, record(), r);
    const edited = normalizeRuleset({ stats: { hp: { start: 40, max: 50 } } }).ruleset!;
    const fold = foldPath(edited, JSON.parse(JSON.stringify(fixture.messages)));
    expect(warpMeta(root).playthrough).toBeDefined(); expect(fold.state.stats.hp).toBe(70); expect(fold.ruleset.stats.hp.max).toBe(1000); expect(fold.stale).toEqual([]);
  });
  test("earlier swipe/text changes reject incompatible descendants", async () => {
    const r = rules(); fixture.message("Hello"); const first = fixture.message("One");
    await writeRecord(first.chat_id, first.id, 0, record(), r);
    const second = fixture.message("Two"); await writeRecord(second.chat_id, second.id, 0, record(-5), r);
    expect(foldPath(r, fixture.messages).state.stats.hp).toBe(65);
    first.content = "Edited scene";
    const fold = foldPath(r, fixture.messages);
    expect(fold.state.stats.hp).toBe(70); expect(fold.stale).toEqual([second.id]); expect(() => requireCurrentPath(fold)).toThrow("Regenerate");
    first.content = "One"; first.swipe_id = 1; first.swipes.push("Alternative");
    expect(foldPath(r, fixture.messages).stale).toEqual([second.id]);
  });
  test("corrupt records are flagged without partially applying events", () => {
    const r = rules(), root = fixture.message("Hello");
    root.metadata = { warp: { swipes: { "0": { ...record(), events: [...record().events, { t: "stat", id: "hp", d: NaN, src: "action" }] } } } };
    expect(foldPath(r, fixture.messages).state.stats.hp).toBe(80); expect(foldPath(r, fixture.messages).stale).toEqual([root.id]);
  });
  test("cached results are isolated and retained history stays bounded", () => {
    const r = rules(); for (let i = 0; i < 120; i++) fixture.message(`Turn ${i}`, false, { warp: { swipes: { "0": record(1) } } });
    const first = foldPath(r, fixture.messages); expect(first.state.stats.hp).toBe(200); expect(first.steps.length).toBe(60);
    first.state.stats.hp = 0; first.steps[0].record.events.length = 0;
    const cached = foldPath(r, fixture.messages); expect(cached.state.stats.hp).toBe(200); expect(cached.steps[0].record.events.length).toBe(1);
    fixture.message("Appended", false, { warp: { swipes: { "0": record(1) } } });
    expect(foldPath(r, fixture.messages).state.stats.hp).toBe(201);
  });
  test("explicit new playthrough resets the state even with identical rules and a stale old branch", async () => {
    const r = rules(); const root = fixture.message("Hello", false, { warp: { playthrough: newPlaythrough(r) } }); const first = fixture.message("One");
    await writeRecord(first.chat_id, first.id, 0, record(), r);
    const second = fixture.message("Two"); await writeRecord(second.chat_id, second.id, 0, record(), r);
    root.content = "Edited origin";
    await startPlaythrough(root.chat_id, r);
    const fold = foldPath(r, fixture.messages); expect(fold.stale).toEqual([]); expect(fold.state.stats.hp).toBe(80);
  });
});
describe("bounded decisions and speculation", () => {
  test("nested questions are resolved through all reached branches with one seed", async () => {
    const r = normalizeRuleset({ actions: { ask: { effects: { decide: { ask: "Outer?", options: { yes: { desc: "Yes", decide: { ask: "Inner?", options: { yes: { desc: "Yes", hint: "INNER" }, no: { desc: "No" } } } }, no: { desc: "No" } } } } } } }).ruleset!;
    const asks: string[] = [];
    const result = await resolveWithDecisions({ resolve: (odds) => resolveTurnFull(r, initialState(r), { actionId: "ask", via: "choice" }, { seed: "nested", odds }), deadlineAt: Date.now() + 1000,
      ask: async (specs) => { asks.push(...specs.map((s) => s.id)); return Object.fromEntries(specs.map((s) => [s.id, { yes: 1, no: 0 }])); } });
    expect(new Set(asks).size).toBe(2); expect(result.needs).toEqual([]); expect(result.record.hints.join(" ")).toContain("INNER"); expect(result.record.decisions!.every((d) => d.source === "model")).toBe(true);
  });
  test("deadline exhaustion makes no provider calls and records fallback reasons", async () => {
    const r = normalizeRuleset({ actions: { ask: { effects: { decide: { ask: "Yes?", options: { yes: { desc: "Yes" }, no: { desc: "No" } } } } } } }).ruleset!;
    let calls = 0;
    const result = await resolveWithDecisions({ resolve: (odds) => resolveTurnFull(r, initialState(r), { actionId: "ask", via: "choice" }, { seed: "bounded", odds }), ask: async () => { calls++; return {}; }, deadlineAt: Date.now() - 1 });
    expect(calls).toBe(0); expect(result.record.decisions![0].fallback).toContain("deadline");
  });
  test("transport cancellation and negative budgets finish promptly without leaked timers", async () => {
    let called = false;
    await expect(withDeadline({ timeoutMs: -1 }, 10, async () => { called = true; })).rejects.toThrow("deadline"); expect(called).toBe(false);
    const controller = new AbortController(), entered = deferred<void>();
    fixture.controls.quiet = async () => { entered.resolve(); return new Promise(() => {}); };
    const reply = writeReply([], undefined, 60000, controller.signal); await entered.promise; controller.abort(new Error("cancel fixture"));
    await expect(reply).rejects.toThrow("cancel fixture");
  });
  test("Jev retries share the original budget and reject malformed responses", async () => {
    let calls = 0; fixture.api.cors = async () => { calls++; return { status: 429, body: "" }; };
    const q = { x: { type: "noul" as const, instructions: "True?" } };
    await expect(new JevDecider("fixture", "fixture").ask({}, q, { timeoutMs: 20 })).rejects.toThrow("deadline"); expect(calls).toBe(1);
    fixture.api.cors = async () => ({ status: 200, body: '{"answers":{"x":{"type":"noul","noul":2}}}' });
    expect(await new JevDecider("fixture", "fixture").ask({}, q)).toEqual({});
  });
  test("text, rules and settings changes invalidate the speculative cache key", () => {
    const r = rules(), s = initialState(r), msgs = [{ id: "m", content: "Old scene", swipe_id: 0 }], settings = { ...DEFAULT_SETTINGS };
    const key = momentKey(msgs, s, r, settings);
    expect(momentKey([{ ...msgs[0], content: "Edited scene" }], s, r, settings)).not.toBe(key);
    expect(momentKey(msgs, s, { ...r, name: "Edited" }, settings)).not.toBe(key);
    expect(momentKey(msgs, s, r, { ...settings, helperConnectionId: "new" })).not.toBe(key);
  });
  test("prewriting runs at most two requests and cancellation discards queued and late replies", async () => {
    const r = normalizeRuleset({ actions: { a: {}, b: {}, c: {}, d: {} } }).ruleset!, entered = deferred<void>(), response = deferred<unknown>();
    fixture.message("Current scene"); let calls = 0, ready = 0;
    fixture.controls.quiet = async () => { if (++calls === 2) entered.resolve(); return response.promise; };
    const writing = prewrite({ chatId: fixture.messages[0].chat_id, userId: fixture.character.id, r, settings: { ...DEFAULT_SETTINGS, prewrite: 4 }, decider: { id: "rules", canWrite: false, ask: async () => ({}) }, prompt: [], reply: "Scene", player: "Player", onReady: () => ready++ });
    await entered.promise; expect(calls).toBe(2);
    dropPrewritten(fixture.messages[0].chat_id); await writing;
    response.resolve({ content: "Late reply" }); await Promise.resolve(); expect(calls).toBe(2); expect(ready).toBe(0);
  });
});
test("cold lore filtering and person profiles use the same gate and refresh after unlocks", async () => {
  const ruleBook = `${fixture.character.id}-rules`, loreBook = `${fixture.character.id}-lore`;
  fixture.character.world_book_ids = [ruleBook, loreBook];
  fixture.books.set(ruleBook, { id: ruleBook, name: "warp-ruleset", entries: [{ id: "stats-entry", world_book_id: ruleBook, comment: "Stats", content: 'secrets:\n  identity:\n    about: Robin\n    stages:\n      - when: "false"\n        text: CANARY\n        lore: [Robin private]\n' }] });
  const lore = { id: "private-entry", world_book_id: loreBook, comment: "Robin private", key: ["Robin"], content: "Robin's CANARY identity", disabled: true };
  fixture.books.set(loreBook, { id: loreBook, name: "Town Lore", entries: [lore] });
  const m = fixture.message("Robin waves."); invalidateCharacter();
  const cold = await worldInfoPolicy({ chatId: m.chat_id, entries: [...fixture.books.get(ruleBook)!.entries, lore] });
  expect(cold!.disabled).toContain("stats-entry"); expect(cold!.disabled).toContain("private-entry");
  expect((await personProfile(m.chat_id, "Robin")).text).not.toContain("CANARY");
  m.metadata = { warp: { swipes: { "0": { v: 1, events: [{ t: "secret", id: "identity", stage: 0, src: "manual" }], hints: [], at: 1 } } } };
  expect((await personProfile(m.chat_id, "Robin")).text).toContain("CANARY");
  const open = await worldInfoPolicy({ chatId: m.chat_id, entries: [lore] }); expect(open!.forced).toContain("private-entry");
});

async function stagedGeneration(id = "generation", yaml = 'clock: { start: "Mon 00:00", minutes_per_action: 10 }\nstats: { hp: { start: 50, narrator: 10 } }\nactions: { gain: { effects: { hp: 10 } } }') {
  const bookId = `${fixture.character.id}-rules`;
  fixture.character.world_book_ids = [bookId];
  fixture.books.set(bookId, { id: bookId, name: "warp-ruleset", entries: [{ id: `${bookId}-entry`, comment: "Rules", content: yaml }] });
  invalidateCharacter();
  const root = fixture.message("Hello"), user = fixture.message("I act", true, { warp: { intent: { actionId: "gain", via: "choice" } } }), target = fixture.message("");
  const payload = { chatId: root.chat_id, generationId: `${fixture.character.id}-${id}`, targetMessageId: target.id, generationType: "normal" };
  await onGenerationStarted(payload, fixture.character.id);
  await interceptor([{ role: "user", content: user.content }], { chatId: root.chat_id, generationType: "normal", userId: fixture.character.id } as never);
  return { root, user, target, payload };
}
describe("generation transaction", () => {
  test("bookkeeping and continuations cannot reopen a mechanically ended encounter", async () => {
    const r = normalizeRuleset({ encounters: { cornered: { actions: { escape: { effects: { end: "escaped" } } } } } }).ruleset!;
    const root = fixture.message("An encounter starts", false, { warp: { swipes: { "0": { v: 1, events: [{ t: "enc", id: "cornered", foe: {}, src: "manual" }], hints: [], at: 1 } } } });
    const user = fixture.message("I escape", true), target = fixture.message("The way is clear.");
    const before = foldPath(r, [root, user]).state;
    const rec = resolveTurnFull(r, before, { actionId: "escape", via: "choice" }, { seed: "escape" }).record;
    await writeRecord(root.chat_id, target.id, 0, rec, r);
    const ended = foldPath(r, fixture.messages).state;
    await patchSettings({ decider: "llm", narratorUpdates: true }, fixture.character.id);
    fixture.controls.quiet = async () => ({ content: '{"encounter":"cornered"}' });
    for (const replyBefore of [undefined, target.content]) {
      await afterReply({ chatId: root.chat_id, ruleset: r, rec, after: ended, origin: replyBefore === undefined ? before : ended,
        player: "Player", playerText: user.content, at: Date.now(), outcome: "The encounter ended: escaped.", replyBefore }, target, `${target.content} More narration.`, fixture.character.id);
      expect(foldPath(r, fixture.messages).state.encounter).toBeNull();
      expect(warpMeta(target).swipes!["0"].rejected).toContain("The encounter already ended in this exchange. Narration cannot restart it.");
    }
  });
  test("an empty stop aborts the prepared outcome and clears busy state", async () => {
    const { target, payload } = await stagedGeneration();
    expect(warpMeta(target).prepared!["0"].record.events.length).toBeGreaterThan(0);
    await onGenerationStopped(payload, fixture.character.id);
    expect(warpMeta(target).swipes).toBeUndefined(); expect(warpMeta(target).prepared).toEqual({}); expect(busyChats.has(payload.chatId)).toBe(false);
  });
  test("retained partial prose commits once across STOPPED and duplicate ENDED", async () => {
    const { target, payload } = await stagedGeneration(); target.content = "The action succeeds."; target.swipes[0] = target.content;
    await onGenerationStopped({ ...payload, content: target.content }, fixture.character.id);
    const r = (await getRuleset(payload.chatId, fixture.character.id))!.ruleset!;
    expect(foldPath(r, fixture.messages).state.stats.hp).toBe(60);
    await onGenerationEnded({ ...payload, messageId: target.id, content: target.content }, fixture.character.id);
    expect(foldPath(r, fixture.messages).state.stats.hp).toBe(60); expect(busyChats.has(payload.chatId)).toBe(false);
  });
  test("the outcome attaches to the captured swipe, even if the player switches during generation", async () => {
    const { target, payload } = await stagedGeneration();
    await onGenerationStopped(payload, fixture.character.id);
    target.swipes = ["Previous variant", ""]; target.swipe_id = 1; target.content = "";
    const next = { ...payload, generationId: `${payload.generationId}-swipe`, generationType: "swipe" };
    await onGenerationStarted(next, fixture.character.id);
    await interceptor([], { chatId: payload.chatId, generationType: "swipe", userId: fixture.character.id } as never);
    target.swipes[1] = "Generated variant"; target.swipe_id = 0; target.content = target.swipes[0];
    await onGenerationEnded({ ...next, messageId: target.id, content: target.swipes[1] }, fixture.character.id);
    expect(warpMeta(target).swipes!["1"].action!.id).toBe("gain"); expect(warpMeta(target).swipes!["0"]).toBeUndefined();
  });
  test("superseded callbacks cannot commit or clear the new generation's busy state", async () => {
    const { target, payload } = await stagedGeneration();
    const next = { ...payload, generationId: `${payload.generationId}-replacement` };
    await onGenerationStarted(next, fixture.character.id);
    await onGenerationEnded({ ...payload, messageId: target.id, content: "Old reply" }, fixture.character.id);
    expect(busyChats.has(payload.chatId)).toBe(true); expect(warpMeta(target).swipes).toBeUndefined();
    await onGenerationStopped(next, fixture.character.id);
    await onGenerationEnded({ ...payload, messageId: target.id, content: "Late old reply" }, fixture.character.id);
    expect(warpMeta(target).swipes).toBeUndefined(); expect(busyChats.has(payload.chatId)).toBe(false);
  });
  test("busy spans after-reply bookkeeping", async () => {
    const { target, payload } = await stagedGeneration();
    await patchSettings({ decider: "llm", narratorUpdates: true }, fixture.character.id);
    const entered = deferred<void>(), reply = deferred<unknown>();
    fixture.controls.quiet = async () => { entered.resolve(); return reply.promise; };
    target.content = "Success"; target.swipes[0] = target.content;
    const ended = onGenerationEnded({ ...payload, messageId: target.id, content: target.content }, fixture.character.id);
    await entered.promise; expect(busyChats.has(payload.chatId)).toBe(true);
    reply.resolve({ content: "{}" }); await ended; expect(busyChats.has(payload.chatId)).toBe(false);
  });
  test("continuations bookkeep only appended prose and keep the existing mechanical outcome", async () => {
    const { target, payload } = await stagedGeneration(); target.content = "Original reply."; target.swipes[0] = target.content;
    await onGenerationEnded({ ...payload, messageId: target.id, content: target.content }, fixture.character.id);
    await patchSettings({ decider: "llm", narratorUpdates: true }, fixture.character.id);
    fixture.controls.quiet = async (request) => { expect(request.messages[1].content).toContain("Additional narration"); expect(request.messages[1].content).not.toContain("Narrator's reply:\nOriginal reply."); return { content: '{"stats":{"hp":2},"minutes":5}' }; };
    const next = { ...payload, generationId: `${payload.generationId}-continue`, generationType: "continue" };
    await onGenerationStarted(next, fixture.character.id);
    await interceptor([], { chatId: payload.chatId, generationType: "continue", userId: fixture.character.id } as never);
    target.content += " Additional narration"; target.swipes[0] = target.content;
    await onGenerationEnded({ ...next, messageId: target.id, content: target.content }, fixture.character.id);
    const r = (await getRuleset(payload.chatId, fixture.character.id))!.ruleset!, fold = foldPath(r, fixture.messages);
    expect(fold.state.stats.hp).toBe(62); expect(warpMeta(target).swipes!["0"].events.filter((e) => e.t === "stat" && e.src === "action").length).toBe(1);
  });
  test("a history edit during generation prevents committing an obsolete outcome", async () => {
    const { root, target, payload } = await stagedGeneration(); root.content = "Changed scene"; target.content = "Old-context reply"; target.swipes[0] = target.content;
    await onGenerationEnded({ ...payload, messageId: target.id, content: target.content }, fixture.character.id);
    expect(warpMeta(target).swipes).toBeUndefined(); expect(warpMeta(target).prepared).toEqual({}); expect(busyChats.has(payload.chatId)).toBe(false);
  });
  test("a provider failure discards durable preparation without committing it", async () => {
    const { target, payload } = await stagedGeneration();
    await onGenerationEnded({ ...payload, messageId: target.id, error: "Provider unavailable" }, fixture.character.id);
    expect(warpMeta(target).swipes).toBeUndefined(); expect(warpMeta(target).prepared).toEqual({}); expect(busyChats.has(payload.chatId)).toBe(false);
  });
  test("a persisted preparation can be committed without an in-memory pending turn", async () => {
    const { target, user, payload } = await stagedGeneration(); await onGenerationStopped(payload, fixture.character.id);
    const r = (await getRuleset(payload.chatId, fixture.character.id))!.ruleset!, fold = foldPath(r, fixture.messages.slice(0, -1));
    const rec = resolveTurnFull(fold.ruleset, fold.state, { actionId: "gain", via: "choice" }, { seed: "recovered" }).record;
    rec.parent = fold.head; rec.rulesRevision = fold.revision;
    const next = { ...payload, generationId: `${payload.generationId}-recovered` };
    user.metadata = {};
    warpMeta(target).prepared = { "0": { generationId: next.generationId, record: rec, playerText: "I act", player: "Player", outcome: null, at: Date.now(), verdict: { messageId: user.id, intent: { actionId: "gain", via: "adjudicator" }, suggestion: null } } };
    target.content = "Recovered reply"; target.swipes[0] = target.content;
    await onGenerationStarted(next, fixture.character.id);
    await onGenerationEnded({ ...next, messageId: target.id, content: target.content }, fixture.character.id);
    expect(foldPath(r, fixture.messages).state.stats.hp).toBe(60); expect(warpMeta(target).prepared).toEqual({});
    expect(warpMeta(user).intent?.actionId).toBe("gain"); expect(warpMeta(user).accepted?.actionId).toBe("gain");
  });
  test("Ironman swipes reuse accepted probabilities as well as the seed", async () => {
    await patchSettings({ decider: "llm", swipesReroll: false, narratorUpdates: false }, fixture.character.id);
    fixture.controls.quiet = async () => ({ content: '{"decide:outcome":{"choice":"win","probabilities":{"win":1,"lose":0}}}' });
    const { target, user, payload } = await stagedGeneration("ironman", 'stats: { hp: { start: 50 } }\nactions:\n  gain:\n    effects:\n      decide:\n        outcome:\n          ask: Win?\n          options:\n            win: { desc: Win, hp: 10 }\n            lose: { desc: Lose, hp: -10 }');
    target.content = "First variant"; target.swipes[0] = target.content;
    await onGenerationEnded({ ...payload, messageId: target.id, content: target.content }, fixture.character.id);
    const first = warpMeta(target).swipes!["0"];
    expect(warpMeta(user).accepted!.inputs.odds.outcome.win).toBe(1);
    const requests = fixture.requests.length;
    fixture.controls.quiet = async () => { throw new Error("Ironman must not ask again"); };
    target.swipes.push(""); target.swipe_id = 1; target.content = "";
    const next = { ...payload, generationId: `${payload.generationId}-swipe`, generationType: "swipe" };
    await onGenerationStarted(next, fixture.character.id);
    await interceptor([], { chatId: payload.chatId, generationType: "swipe", userId: fixture.character.id } as never);
    target.content = "Second variant"; target.swipes[1] = target.content;
    await onGenerationEnded({ ...next, messageId: target.id, content: target.content }, fixture.character.id);
    expect(fixture.requests.length).toBe(requests); expect(warpMeta(target).swipes!["1"].inputs).toEqual(first.inputs); expect(warpMeta(target).swipes!["1"].events).toEqual(first.events);
  });
});
