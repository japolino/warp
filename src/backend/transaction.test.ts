// Offline transaction regressions: real backend functions, snapshot reads, scripted timing.
import { beforeAll, expect, test } from "bun:test";
import { loadRuleset } from "../engine/loader.js";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";
import { busyChats, lastStates } from "./state-push.js";
import { appendDrafts, encounterLogOf, foldPath, liveChoicesOf, patchMeta, patchWarpMeta, reconcilePath, recordPath, shiftAfterSwipeDelete, warpMeta, withRecordPath, writeRecord } from "./ledger.js";
import { interceptor, onGenerationEnded, onGenerationStarted, onGenerationStopped } from "./turn.js";
import { foldEvents, initialState } from "../engine/state.js";
import { enterDungeon, leaveDungeon } from "../engine/dungeon/run.js";
import { playScene, sceneViewFor, dropScene } from "./scene.js";
import { characterBrief, characterForChat, personProfile } from "./source.js";
import { runDungeonOp } from "./dungeon.js";
import { discoverPlace } from "./discover.js";
import { playRound } from "./encounter.js";
import { prewrite, momentKey, readyChoices, takePrewritten } from "./drafts.js";
import { RulesDecider } from "./deciders.js";
import { takeOperation, releaseOperation } from "./operations.js";

let seq = 0;
let frontendMessage!: (message: any, userId?: string) => Promise<void>;
let worldInfo!: (context: any) => Promise<any>;
const listeners = new Map<string, (payload: any, userId?: string) => unknown>();
const fixtures = new Map<string, any>();
const raw = { stats: { health: { start: 50, max: 100, narrator: 20 } }, actions: { touch: { effects: { health: -10 } } } };
const record = (events: any[] = []) => ({ v: 1 as const, hints: [], events, at: 0 });
function fixture(input: any = raw) {
  const id = `transaction-${++seq}`;
  const f: any = { id, messages: [], sent: [], calls: 0, failWrite: false, emitEdits: true,
    settings: { ...DEFAULT_SETTINGS, decider: "llm", sceneLines: "scripted", draftItemUses: false, themeDating: false, dateImages: false },
    raw: input, extraEntries: [], r: loadRuleset([{ label: "warp-ruleset", content: JSON.stringify(input), order: 0 }]).ruleset!,
    quiet: async () => ({ content: "{}" }),
  };
  f.add = (role: string, content: string, metadata: any = {}) => {
    const m = { id: `${id}-m${f.messages.length}`, chat_id: id, index_in_chat: f.messages.length, role,
      is_user: role === "user", content, swipe_id: 0, swipes: [content], metadata };
    f.messages.push(m); return m;
  };
  fixtures.set(id, f);
  return f;
}
const get = (id: string) => fixtures.get(id)!;
beforeAll(async () => {
  (globalThis as any).spindle = {
    registerInterceptor() {}, registerWorldInfoInterceptor(fn: typeof worldInfo) { worldInfo = fn; }, on(event: string, fn: any) { listeners.set(event, fn); },
    commands: { register() {}, onInvoked() {} },
    onFrontendMessage(fn: typeof frontendMessage) { frontendMessage = fn; },
    sendToFrontend: (msg: any, userId: string) => get(userId)?.sent.push(structuredClone(msg)),
    log: { error() {}, info() {} }, toast: { info() {}, warning() {} },
    macros: { resolve: async () => ({ text: "Sam" }) },
    chats: { get: async (id: string) => ({ id, character_id: get(id).characterId ?? id }) },
    characters: { get: async (id: string) => ({ id, name: "Robin", description: get(id).description ?? "", world_book_ids: [id] }) },
    world_books: { get: async (id: string) => ({ id, name: "warp-ruleset" }), entries: {
      list: async (id: string) => ({ data: [{ id: `${id}-book`, comment: "warp-ruleset", content: JSON.stringify(get(id).raw) }, ...get(id).extraEntries], total: 1 + get(id).extraEntries.length }),
      create: async (id: string, input: any) => {
        if (get(id).failCreate) throw new Error("scripted map write failure");
        const entry = { id: `${id}-extra-${get(id).extraEntries.length}`, ...input };
        get(id).extraEntries.push(entry); return entry;
      },
    } },
    userStorage: { getJson: async (_: string, opts: any) => structuredClone(get(opts.userId).settings) },
    chat: {
      getMessages: async (id: string) => structuredClone(get(id).messages),
      updateMessage: async (id: string, mid: string, patch: any) => {
        const f = get(id);
        if (f.failWrite) { f.failWrite = false; throw new Error("scripted storage failure"); }
        const message = f.messages.find((m: any) => m.id === mid);
        Object.assign(message, structuredClone(patch));
        if (f.emitEdits) await listeners.get("MESSAGE_EDITED")!({ chatId: id, message: structuredClone(message) }, id);
      },
      appendMessage: async (id: string, msg: any, opts: any) => { if (opts?.triggerGeneration) get(id).narratorCalls = (get(id).narratorCalls ?? 0) + 1; return get(id).add(msg.role, msg.content, msg.metadata); },
    },
    generate: { quiet: async (req: any) => { const f = get(req.userId); f.calls++; return f.quiet(req); } },
  };
  await import("../backend.ts" + "?transaction-harness");
});

const start = async (f: any, generationId = f.id) => {
  if (!f.messages.length) {
    f.add("assistant", "The story.");
  }
  f.add("user", "Touch", { warp: { intent: { actionId: "touch", via: "choice" } } });
  const target = f.add("assistant", "");
  await onGenerationStarted({ generationId, chatId: f.id, targetMessageId: target.id }, f.id);
  await interceptor([{ role: "user", content: "Touch" }], { chatId: f.id, userId: f.id, generationType: "normal", generationId } as any);
  target.content = "You touch it.";
  return { target, payload: { generationId, chatId: f.id, messageId: target.id, content: target.content } };
};

function deferExtraction(f: any) {
  let release!: (value: any) => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => { entered = resolve; });
  f.quiet = () => { entered(); return new Promise((resolve) => { release = resolve; }); };
  return { waiting, release: (health = 5) => release({ content: JSON.stringify({ stats: { health } }) }) };
}

test("metadata patches retain simultaneous swipe records, hints and unrelated keys", async () => {
  const f = fixture(); const m = f.add("assistant", "Reply", { companion: { value: 1 } });
  await Promise.all([
    ...[0, 1, 2, 3].map((swipe) => writeRecord(f.id, m.id, swipe, record([{ t: "stat", id: "health", d: swipe, src: "action" }]))),
    patchMeta(f.id, m.id, "vn_hints", { moods: { Robin: "happy" } }),
    patchMeta(f.id, m.id, "other", true),
  ]);
  expect(Object.keys(warpMeta(m).swipes!)).toEqual(["0", "1", "2", "3"]);
  expect(m.metadata.companion).toEqual({ value: 1 });
  expect(m.metadata.vn_hints).toBeDefined();
  expect(m.metadata.other).toBe(true);
});

test("a failed metadata write does not block the queued repair", async () => {
  const f = fixture(); const m = f.add("assistant", "Reply"); f.failWrite = true;
  const results = await Promise.allSettled([patchMeta(f.id, m.id, "failed", true), patchMeta(f.id, m.id, "repaired", true)]);
  expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled"]);
  expect(m.metadata).toEqual({ repaired: true });
});

for (const deleted of [0, 1, 2]) test(`swipe deletion ${deleted} keeps records and live choices aligned`, async () => {
  const f = fixture(); const m = f.add("assistant", "Reply", { warp: {
    swipes: Object.fromEntries([0, 1, 2].map((i) => [i, { ...record(), hints: [`slot-${i}`] }])),
    live: Object.fromEntries([0, 1, 2].map((i) => [i, [{ label: `slot-${i}`, tag: "test" }]])),
  } });
  await shiftAfterSwipeDelete(f.id, m.id, deleted);
  const retained = [0, 1, 2].filter((i) => i !== deleted);
  for (let swipe = 0; swipe < 2; swipe++) {
    m.swipe_id = swipe;
    expect(warpMeta(m).swipes![String(swipe)].hints[0]).toBe(`slot-${retained[swipe]}`);
    expect(liveChoicesOf(m)[0].label).toBe(`slot-${retained[swipe]}`);
  }
  expect(warpMeta(m).swipes!["2"]).toBeUndefined();
});

test("Stop without End closes the generation and permits the next action", async () => {
  const f = fixture(); const old = await start(f);
  await onGenerationStopped({ chatId: f.id, generationId: f.id }, f.id);
  expect(busyChats.has(f.id)).toBe(false);
  expect(f.sent.at(-1).busy).toBe(false);
  await onGenerationEnded(old.payload, f.id);
  expect(warpMeta(old.target).swipes).toBeUndefined();
  const next = await start(f, `${f.id}-next`);
  await onGenerationEnded(next.payload, f.id);
  expect(foldPath(f.r, f.messages).state.stats.health).toBe(40);
  expect(busyChats.has(f.id)).toBe(false);
});

test("late Stop and End from a superseded generation do not unlock or book the newer one", async () => {
  const f = fixture(); const old = await start(f, `${f.id}-old`);
  const next = await start(f, `${f.id}-new`);
  await onGenerationStopped({ chatId: f.id, generationId: old.payload.generationId }, f.id);
  await onGenerationEnded(old.payload, f.id);
  expect(busyChats.has(f.id)).toBe(true);
  expect(warpMeta(old.target).swipes).toBeUndefined();
  await onGenerationEnded(next.payload, f.id);
  expect(busyChats.has(f.id)).toBe(false);
});

test("a duplicate host Stop cannot unlock a subsequent local operation", async () => {
  const f = fixture(); const old = await start(f);
  await onGenerationStopped({ chatId: f.id, generationId: old.payload.generationId }, f.id);
  const token = takeOperation(f.id)!;
  expect(token).not.toBeNull();
  await onGenerationStopped({ chatId: f.id, generationId: old.payload.generationId }, f.id);
  await onGenerationStopped({ chatId: f.id }, f.id);
  expect(busyChats.has(f.id)).toBe(true);
  expect(takeOperation(f.id)).toBeNull();
  expect(releaseOperation(f.id, token)).toBe(true);
  expect(busyChats.has(f.id)).toBe(false);
});

test("postprocessing stays busy and preserves a manual adjustment made during extraction", async () => {
  const f = fixture(); const { target, payload } = await start(f);
  const gate = deferExtraction(f);
  const ending = onGenerationEnded(payload, f.id);
  await gate.waiting;
  expect(busyChats.has(f.id)).toBe(true);
  await patchWarpMeta(f.id, target.id, (w) => {
    const rec = w.swipes!["0"];
    return { ...w, swipes: { ...w.swipes, "0": { ...rec, events: [...rec.events, { t: "stat", id: "health", set: 80, src: "manual" }] } } };
  });
  gate.release(-5); await ending;
  expect(foldPath(f.r, f.messages).state.stats.health).toBe(75);
  expect(busyChats.has(f.id)).toBe(false);
});

for (const edit of ["swipe", "content", "delete", "history"]) test(`late extraction is discarded after a ${edit} change`, async () => {
  const f = fixture(); const { target, payload } = await start(f);
  const gate = deferExtraction(f); const ending = onGenerationEnded(payload, f.id);
  await gate.waiting;
  if (edit === "swipe") target.swipe_id = 1;
  if (edit === "content") target.content = "An edited reply.";
  if (edit === "delete") f.messages.splice(f.messages.indexOf(target), 1);
  if (edit === "history") f.messages[0].content = "A different starting scene.";
  gate.release(); await ending;
  expect(warpMeta(target).swipes!["0"].events.some((e) => e.src === "narrator")).toBe(false);
  expect(busyChats.has(f.id)).toBe(false);
});

test("Stop during extraction prevents its late commit and duplicate End never re-extracts", async () => {
  const f = fixture(); const { target, payload } = await start(f);
  const gate = deferExtraction(f); const ending = onGenerationEnded(payload, f.id);
  await gate.waiting;
  await onGenerationStopped({ chatId: f.id, generationId: f.id }, f.id);
  expect(busyChats.has(f.id)).toBe(false);
  gate.release(); await ending;
  await onGenerationEnded(payload, f.id);
  expect(f.calls).toBe(1);
  expect(warpMeta(target).swipes!["0"].events.some((e) => e.src === "narrator")).toBe(false);
});

test("Stop during interpretation cannot create a pending action when the model returns late", async () => {
  const f = fixture(); f.add("assistant", "The story."); f.add("user", "Touch");
  const target = f.add("assistant", "");
  await onGenerationStarted({ generationId: f.id, chatId: f.id, targetMessageId: target.id }, f.id);
  const gate = deferExtraction(f);
  const reading = interceptor([{ role: "user", content: "Touch" }], { chatId: f.id, userId: f.id, generationType: "normal" } as any);
  await gate.waiting;
  await onGenerationStopped({ chatId: f.id, generationId: f.id }, f.id);
  gate.release(); await reading;
  target.content = "A late response.";
  await onGenerationEnded({ generationId: f.id, chatId: f.id, messageId: target.id, content: target.content }, f.id);
  expect(warpMeta(target).swipes).toBeUndefined();
  expect(busyChats.has(f.id)).toBe(false);
});

test("duplicate successful End extracts and commits exactly once", async () => {
  const f = fixture(); const { payload } = await start(f);
  f.quiet = async () => ({ content: '{"stats":{"health":5}}' });
  await Promise.all([onGenerationEnded(payload, f.id), onGenerationEnded(payload, f.id)]);
  await onGenerationEnded(payload, f.id);
  expect(f.calls).toBe(1);
  expect(foldPath(f.r, f.messages).state.stats.health).toBe(45);
});

test("failed map writes preserve the current location; retry creates both routes before arrival", async () => {
  const f = fixture({ start: { location: "home" }, locations: { home: { name: "Home", exits: ["town"] }, town: { exits: ["home"] } }, discovery: true });
  f.failCreate = true;
  f.quiet = async () => ({ content: '{"name":"Courtyard","desc":"A small courtyard.","indoors":false}' });
  const failed = { ...record(), discover: { from: "home" } };
  const loaded = { bookIds: [f.id], characterId: f.id } as any;
  await discoverPlace(loaded, f.r, initialState(f.r), failed, f.id, f.settings, f.id);
  const unchanged = foldEvents(f.r, [failed.events]);
  expect(unchanged.location).toBe("home");
  expect(unchanged.discovered).toEqual([]);
  expect(f.extraEntries).toEqual([]);
  f.failCreate = false;
  const retried = { ...record(), discover: { from: "home" } };
  await discoverPlace(loaded, f.r, initialState(f.r), retried, f.id, f.settings, f.id);
  const grown = loadRuleset([{ label: "base", content: JSON.stringify(f.raw), order: 0 },
    { label: "discovered", content: f.extraEntries[0].content, order: 900 }]).ruleset!;
  expect(grown.locations.home.exits).toEqual(["town", "courtyard"]);
  expect(grown.locations.courtyard.exits).toEqual(["home"]);
  expect(foldEvents(grown, [retried.events]).location).toBe("courtyard");
});

const dungeonRaw = { stats: { health: { start: 50, max: 100 }, money: { kind: "money", start: 0, max: 100 } },
  conditions: { poison: { every: "turn", dot: 5, stat: "health" } },
  start: { location: "town" }, locations: { town: "Town" }, dungeons: { mines: { name: "The Mines" } } };

test("presenting a committed dungeon step cannot change mechanics or tick poison", async () => {
  const f = fixture(dungeonRaw);
  const entry = enterDungeon(f.r, initialState(f.r), "mines", [], "run");
  f.add("assistant", "The story", { warp: { swipes: { "0": record([...entry.events, { t: "cond", id: "poison", on: true, src: "manual" }]) } } });
  const before = foldPath(f.r, f.messages).state;
  await playScene({ chatId: f.id, userId: f.id, kind: "dungeon", intent: null, said: entry.narrate!.say });
  expect(foldPath(f.r, f.messages).state).toEqual(before);
});

test("dungeon presentation uses the already resolved leave result and reports capped retained gold", async () => {
  const f = fixture(dungeonRaw);
  const run = foldEvents(f.r, [enterDungeon(f.r, initialState(f.r), "mines", [], "run").events]).dungeon!;
  run.gold = 37;
  f.add("assistant", "In the mine", { warp: { swipes: { "0": record([
    { t: "stat", id: "money", set: 90, src: "manual" }, { t: "dg_enter", run, src: "action" }, { t: "cond", id: "poison", on: true, src: "manual" },
  ]) } } });
  const before = foldPath(f.r, f.messages).state;
  const expected = foldEvents(f.r, [leaveDungeon(f.r, before).events], before);
  await runDungeonOp({ chatId: f.id, op: "leave" }, f.id);
  expect(foldPath(f.r, f.messages).state).toEqual(expected);
  expect(f.messages.at(-1).content).toContain("banking 10 gold");
  expect(f.messages.at(-1).content).not.toContain("37 gold");
});

test("a forced dungeon defeat loses the haul and records a defeat summary", async () => {
  const f = fixture(dungeonRaw);
  const run = foldEvents(f.r, [enterDungeon(f.r, initialState(f.r), "mines", [], "run").events]).dungeon!;
  run.gold = 37;
  run.battle = { kind: "normal", at: "1,1", round: 1, active: "you", queue: ["you", "foe"], log: [], over: null,
    fighters: [
      { id: "you", side: "party", name: "Sam", hp: 1, mhp: 100, mp: 0, mmp: 0, tp: 0, atk: 1, def: 0, mat: 0, mdf: 0, agi: 0, skills: ["attack"], guard: false },
      { id: "foe", side: "foe", name: "Guardian", hp: 10000, mhp: 10000, mp: 0, mmp: 0, tp: 0, atk: 1000, def: 1000, mat: 1000, mdf: 1000, agi: 100, skills: ["attack"], guard: false },
    ] } as any;
  f.add("assistant", "The party is fighting", { warp: { swipes: { "0": record([{ t: "dg_enter", run, src: "action" }]) } } });
  await runDungeonOp({ chatId: f.id, op: "battle", skill: "attack" }, f.id);
  const after = foldPath(f.r, f.messages).state;
  expect(after.dungeon).toBeNull();
  expect(after.stats.money).toBe(0);
  expect(f.messages.at(-1).content).toContain("was defeated");
  expect(f.messages.at(-1).content).toContain("losing the run's haul of 37 gold");
});

for (const change of ["edit", "delete", "swipe", "rules"] as const) {
  test(`dependent results pause after ${change}; explicit keep rebases without rerolling`, async () => {
    const f = fixture();
    const first = f.add("assistant", "Hit", { warp: { swipes: { "0": record([{ t: "stat", id: "health", d: -20, src: "action" }]) } } });
    const later = f.add("assistant", "Heal");
    later.metadata = { warp: { swipes: { "0": withRecordPath(record([{ t: "stat", id: "health", d: 10, src: "action" }]), f.r, [first]) } } };
    expect(foldPath(f.r, f.messages).state.stats.health).toBe(40);
    if (change === "edit") first.content = "A different event";
    if (change === "delete") f.messages.splice(0, 1);
    if (change === "swipe") { first.swipe_id = 1; first.content = "Miss"; }
    if (change === "rules") { f.r = structuredClone(f.r); f.r.stats.health.start = 60; }
    expect(foldPath(f.r, f.messages).conflict).toBe(later.id);
    expect(foldPath(f.r, f.messages).steps.some((step) => step.message.id === later.id)).toBe(false);
    const seedBefore = JSON.stringify(warpMeta(later).swipes?.["0"].events);
    await reconcilePath(f.id, f.r, true);
    expect(foldPath(f.r, f.messages).conflict).toBeNull();
    expect(JSON.stringify(warpMeta(later).swipes?.["0"].events)).toBe(seedBefore);
  });
}

test("discard clears affected active results and choices, preserving chat and inactive swipes", async () => {
  const f = fixture(); const first = f.add("assistant", "Original"); const later = f.add("assistant", "Result");
  later.metadata = { companion: { untouched: true }, warp: { live: { "0": [{ label: "Stale", tag: "x" }] }, swipes: {
    "0": withRecordPath(record([{ t: "stat", id: "health", d: 5, src: "action" }]), f.r, [first]), "1": record(),
  } } };
  first.content = "Edited";
  await reconcilePath(f.id, f.r, false);
  expect(later.content).toBe("Result");
  expect(later.metadata.companion).toEqual({ untouched: true });
  expect(warpMeta(later).swipes?.["0"]).toBeUndefined();
  expect(warpMeta(later).swipes?.["1"]).toBeDefined();
  expect(liveChoicesOf(later)).toEqual([]);
  expect(foldPath(f.r, f.messages).conflict).toBeNull();
});

test("quiet logs belong to their swipe and revisions remain bounded for long paths", async () => {
  const f = fixture(); const log: any = { enc: "e", foe: "Foe", status: "on", rounds: [] };
  const m = f.add("assistant", "Log", { warp: { encounters: { "0": log } } });
  expect(encounterLogOf(m)).toEqual(log);
  m.swipe_id = 1; expect(encounterLogOf(m)).toBeUndefined();
  for (let i = 0; i < 1000; i++) f.add("assistant", "Long prose ".repeat(50));
  expect(recordPath(f.r, f.messages).length).toBeLessThan(20);
});

test("Continue books only appended prose, keeps the original action, and duplicate End does not charge twice", async () => {
  const f = fixture(); const { target, payload } = await start(f);
  await onGenerationEnded(payload, f.id);
  const original = target.content, action = structuredClone(warpMeta(target).swipes!["0"].action);
  let seen = "";
  f.quiet = async (req: any) => { seen = req.messages[1].content; return { content: JSON.stringify({ stats: { health: 5 } }) }; };
  const generationId = `${f.id}-continue`;
  await onGenerationStarted({ chatId: f.id, generationId, targetMessageId: target.id, generationType: "continue" }, f.id);
  await interceptor([{ role: "assistant", content: original }], { chatId: f.id, userId: f.id, generationType: "continue", generationId } as any);
  target.content = `${original}\nThe medic heals you.`;
  const done = { chatId: f.id, generationId, messageId: target.id, content: target.content };
  await onGenerationEnded(done, f.id); await onGenerationEnded(done, f.id);
  expect(seen.split("Narrator's reply:\n")[1].split("Already applied")[0].trim()).toBe("The medic heals you.");
  expect(foldPath(f.r, f.messages).state.stats.health).toBe(45);
  expect(warpMeta(target).swipes!["0"].action).toEqual(action);
  expect(f.calls).toBe(2);
});

test("a broken interpreter configuration still resolves a clicked action with visible rules fallback", async () => {
  const f = fixture(); f.settings.decider = "jev"; f.settings.jevFormat = "openai";
  const { target, payload } = await start(f);
  await onGenerationEnded(payload, f.id);
  expect(warpMeta(target).swipes!["0"].action?.id).toBe("touch");
  expect(foldPath(f.r, f.messages).state.stats.health).toBe(40);
  expect(f.calls).toBe(0);
});

test("state-only and trimmed replay match full replay through saves and branch edits", () => {
  const f = fixture();
  for (let i = 0; i < 160; i++) f.add("assistant", `Turn ${i}`, { warp: { swipes: { "0": record([
    { t: "stat", id: "health", d: i % 2 ? 5 : -4, src: "action" },
    ...(i === 50 ? [{ t: "save", slot: "1", label: "Checkpoint", src: "manual" }] : []),
    ...(i === 100 ? [{ t: "load", slot: "1", src: "manual" }] : []),
  ]) } } });
  for (const mutate of [() => {}, () => { f.messages[30].swipe_id = 1; }, () => { f.messages.splice(20, 1); }]) {
    mutate(); const full = foldPath(f.r, f.messages);
    const short = foldPath(f.r, f.messages, 60);
    expect(short.state).toEqual(full.state);
    expect(short.steps).toEqual(full.steps.slice(-60));
    expect(foldPath(f.r, f.messages, 0).state).toEqual(full.state);
  }
});

test("medium-confidence encounter text waits for the actual confirmation handler and never starts the narrator", async () => {
  const f = fixture({ stats: { health: { start: 50 } }, encounters: { fight: { round_limit: 20,
    actions: { talk: { effects: { health: 1 } } }, foe_moves: { wait: { desc: "Waits", weight: 1 } }, end_when: { won: "round >= 10" },
  } } });
  f.add("assistant", "A confrontation starts.", { warp: { swipes: { "0": record([{ t: "enc", id: "fight", foe: {}, src: "trigger" }]) } } });
  f.quiet = async () => ({ content: '{"action":{"choice":"talk","confidence":0.55}}' });
  await playRound({ chatId: f.id, userId: f.id, intent: null, typed: "I pause and look around." });
  const suggestion = f.messages.at(-1);
  expect(suggestion.is_user).toBe(true); expect(warpMeta(suggestion).suggest?.actionId).toBe("talk");
  expect(foldPath(f.r, f.messages).state.encounter!.round).toBe(0);
  await frontendMessage({ type: "redo", chatId: f.id, userMessageId: suggestion.id, actionId: "talk" }, f.id);
  expect(foldPath(f.r, f.messages).state.encounter!.round).toBe(1);
  expect(f.narratorCalls ?? 0).toBe(0);
  expect(warpMeta(suggestion).suggest).toBeUndefined();
});

test("a genuinely prepared reply becomes unavailable after a prose edit", async () => {
  const f = fixture(); f.settings.prewrite = 1;
  const reply = f.add("assistant", "A closed door."); f.quiet = async () => ({ content: "You touch the closed door." });
  const settings = f.settings, state = foldPath(f.r, f.messages).state;
  await prewrite({ chatId: f.id, userId: f.id, r: f.r, settings, decider: new RulesDecider(), prompt: [], reply: reply.content, player: "Sam", onReady() {} });
  const before = momentKey(f.messages, state, { r: f.r, settings });
  expect(readyChoices(f.id, before).has("touch")).toBe(true);
  reply.content = "An open door.";
  const after = momentKey(f.messages, state, { r: f.r, settings });
  expect(takePrewritten(f.id, after, "touch")).toBeNull();
  expect(readyChoices(f.id, after).size).toBe(0);
});

test("registered sheet adjustments merge their newly computed deltas instead of overwriting", async () => {
  const f = fixture(); f.add("assistant", "Story");
  await Promise.all([60, 70].map((value) => frontendMessage({ type: "adjust", chatId: f.id, stat: "health", value }, f.id)));
  expect(foldPath(f.r, f.messages).state.stats.health).toBe(70);
  expect(warpMeta(f.messages[0]).swipes!["0"].events.filter((e) => e.src === "manual")).toHaveLength(2);
});

test("a superseded quiet operation cannot commit its late round or unlock a host generation", async () => {
  const f = fixture({ stats: { health: { start: 50 } }, encounters: { fight: { actions: { wait: { effects: { health: -1 } } }, foe_moves: { wait: { desc: "Waits", weight: 1 } } } } });
  f.settings.sceneLines = "model";
  const m = f.add("assistant", "Fight", { warp: { swipes: { "0": record([{ t: "enc", id: "fight", foe: {}, src: "trigger" }]) } } });
  const gate = deferExtraction(f);
  const round = playRound({ chatId: f.id, userId: f.id, intent: { actionId: "wait", via: "choice" } });
  await gate.waiting;
  const generationId = `${f.id}-host`;
  await onGenerationStarted({ chatId: f.id, generationId, targetMessageId: m.id }, f.id);
  gate.release(); await round;
  expect(busyChats.has(f.id)).toBe(true);
  expect(foldPath(f.r, f.messages).state.encounter!.round).toBe(0);
  await onGenerationStopped({ chatId: f.id, generationId }, f.id);
});

test("the registered undo handler clears presentation history on a still-active dungeon", async () => {
  const f = fixture({ dungeons: { mines: { name: "Mines" } } });
  const entry = enterDungeon(f.r, initialState(f.r), "mines", [], "session");
  const m = f.add("assistant", "Dungeon", { warp: { swipes: { "0": record(entry.events) } } });
  await playScene({ chatId: f.id, userId: f.id, kind: "dungeon", intent: null, said: "You look around." });
  const state = foldPath(f.r, f.messages).state;
  expect(sceneViewFor(f.id, f.r, state)!.lines.length).toBeGreaterThan(0);
  await frontendMessage({ type: "undo", chatId: f.id, messageId: m.id, swipe: 0, events: [] }, f.id);
  expect(sceneViewFor(f.id, f.r, state)).toMatchObject({ seq: 0, lines: [], image: null, writing: false });
});

test("card edits invalidate profiles and CHAT_CHANGED rebinding uses the new character immediately", async () => {
  const f = fixture(), next = fixture();
  f.description = "Robin is a librarian.";
  expect(await characterBrief(f.id, f.id)).toContain("librarian");
  expect((await personProfile(f.id, "Robin", f.id)).text).toContain("librarian");
  f.description = "Robin is a pilot.";
  listeners.get("CHARACTER_EDITED")!({ characterId: f.id }, f.id);
  expect((await personProfile(f.id, "Robin", f.id)).text).toContain("pilot");
  expect(await characterForChat(f.id, f.id)).toBe(f.id);
  f.characterId = next.id;
  listeners.get("CHAT_CHANGED")!({ chat: { id: f.id } }, f.id);
  expect(await characterForChat(f.id, f.id)).toBe(next.id);
});

test("draft alternatives retain adjustments made after the original roll and unrelated metadata", async () => {
  const f = fixture(); const rec = record([{ t: "stat", id: "health", d: -10, src: "action" }]);
  const m = f.add("assistant", "Original", { companion: { value: 3 }, warp: { swipes: { "0": rec } } });
  await patchWarpMeta(f.id, m.id, (w) => ({ ...w, swipes: { ...w.swipes, "0": { ...w.swipes!["0"], events: [...w.swipes!["0"].events, { t: "stat", id: "health", d: 30, src: "manual" }] } } }));
  await appendDrafts(f.id, m.id, ["Alternative"], 1, rec, async () => true);
  expect(m.swipe_id).toBe(1); expect(m.content).toBe("Alternative");
  expect(foldPath(f.r, f.messages).state.stats.health).toBe(70);
  expect(m.metadata.companion).toEqual({ value: 3 });
});

test("the registered lore gate folds the selected generation path instead of the stale HUD cache", async () => {
  const f = fixture({ stats: { health: { start: 50 } }, codex: { secret: { title: "Secret", text: "Hidden", lore: ["Secret Lore"] } } });
  const m = f.add("assistant", "Revealed", { warp: { swipes: { "0": record([{ t: "codex", id: "secret", src: "world" }]) } } });
  lastStates.set(f.id, foldPath(f.r, f.messages).state);
  const ctx = { chatId: f.id, userId: f.id, entries: [{ id: "spoiler", world_book_id: "story", comment: "Secret Lore" }] };
  m.swipe_id = 1;
  expect((await worldInfo(ctx)).disabled).toContain("spoiler");
  m.swipe_id = 0;
  const generationId = `${f.id}-regen`;
  await onGenerationStarted({ chatId: f.id, generationId, targetMessageId: m.id, generationType: "normal" }, f.id);
  expect((await worldInfo(ctx)).disabled).toContain("spoiler");
  await onGenerationStopped({ chatId: f.id, generationId }, f.id);
  await onGenerationStarted({ chatId: f.id, generationId: `${generationId}-continue`, targetMessageId: m.id, generationType: "continue" }, f.id);
  expect((await worldInfo(ctx)).forced).toContain("spoiler");
  await onGenerationStopped({ chatId: f.id, generationId: `${generationId}-continue` }, f.id);
});

function dateFixture() {
  const f = fixture({ start: { location: "home" }, locations: { home: { name: "Garden" } }, dating: true,
    relationships: { people: { mira: { name: "Mira", age: 25, schedule: [{ at: "home" }] } } } });
  f.settings.decider = "rules";
  f.settings.dateImages = true;
  f.add("assistant", "At the garden.");
  return f;
}

for (const mode of ["scripted", "model"] as const) test(`host metadata edit events preserve ${mode} dating dialogue and its pending Cue picture`, async () => {
  const f = dateFixture();
  f.settings.sceneLines = mode;
  f.quiet = async () => ({ content: JSON.stringify({ lines: [{ speaker: "Mira", text: `Helper reply ${f.calls}.` }] }) });
  await frontendMessage({ type: "act", chatId: f.id, actionId: "date:talk@mira" }, f.id);
  let state = foldPath(f.r, f.messages).state;
  const first = sceneViewFor(f.id, f.r, state)!;
  expect(first.lines.length).toBeGreaterThan(0);
  expect(first.seq).toBe(1);
  expect(first.imageRequest).toBeDefined();
  await frontendMessage({ type: "act", chatId: f.id, actionId: "date:topic:music" }, f.id);
  state = foldPath(f.r, f.messages).state;
  const next = sceneViewFor(f.id, f.r, state)!;
  expect(next.seq).toBe(2);
  expect(next.lines.length).toBeGreaterThan(0);
  if (mode === "model") expect(next.lines[0].text).toBe("Helper reply 2.");
  expect(next.imageRequest?.requestId).toBe(first.imageRequest!.requestId);
  // Cue or another extension may also update unrelated metadata while generating.
  await patchMeta(f.id, f.messages[0].id, "vn_hints", { moods: { Mira: "happy" } });
  expect(sceneViewFor(f.id, f.r, state)!.seq).toBe(2);
  const request = next.imageRequest!;
  await frontendMessage({ type: "cue_image_result", chatId: f.id, result: {
    version: 1, provider: "warp", chatId: f.id, requestId: request.requestId,
    status: "ready", imageUrl: "/api/v1/images/date", fit: "contain",
  } }, f.id);
  expect(sceneViewFor(f.id, f.r, state)).toMatchObject({ seq: 2, image: "/api/v1/images/date", writing: false });
  expect(f.sent.filter((m: any) => m.type === "state").at(-1).scene.lines.length).toBeGreaterThan(0);
  expect(f.calls).toBe(mode === "model" ? 2 : 0);
  expect(f.narratorCalls ?? 0).toBe(0);
  dropScene(f.id);
});

test("real narrative edits during a date discard late helper text and Cue results", async () => {
  const f = dateFixture();
  f.settings.sceneLines = "model";
  await frontendMessage({ type: "act", chatId: f.id, actionId: "date:talk@mira" }, f.id);
  const request = sceneViewFor(f.id, f.r, foldPath(f.r, f.messages).state)!.imageRequest!;
  const gate = deferExtraction(f);
  const move = frontendMessage({ type: "act", chatId: f.id, actionId: "date:topic:music" }, f.id);
  await gate.waiting;
  f.messages[0].content = "The scene was rewritten.";
  await listeners.get("MESSAGE_EDITED")!({ chatId: f.id, message: f.messages[0] }, f.id);
  gate.release(); await move;
  await frontendMessage({ type: "cue_image_result", chatId: f.id, result: {
    version: 1, provider: "warp", chatId: f.id, requestId: request.requestId,
    status: "ready", imageUrl: "/api/v1/images/stale", fit: "cover",
  } }, f.id);
  const view = sceneViewFor(f.id, f.r, foldPath(f.r, f.messages).state)!;
  expect(view).toMatchObject({ seq: 0, lines: [], image: null, writing: false });
  expect(busyChats.has(f.id)).toBe(false);
});

test("date pictures request Cue by name only, apply fit, retry without a turn, and reject stale results", async () => {
  const f = fixture({ start: { location: "home" }, locations: { home: { name: "Garden" } }, dating: true,
    relationships: { people: { mira: { name: "Mira", desc: "TRAIT_MUST_NOT_LEAVE_WARP", schedule: [{ at: "home" }] } } } });
  f.settings.dateImages = true;
  const session = { who: "mira", kind: "talk", at: "home", venue: null, beat: 0, beats: 4, fatigue: 0,
    mood: 1, combo: 0, enjoy: 0, used: {}, last: null, offer: [], closing: false, started: 0 };
  f.add("assistant", "At the garden.", { warp: { swipes: { "0": record([{ t: "dt_start", session, src: "manual" }]) } } });
  const before = foldPath(f.r, f.messages).state;
  await frontendMessage({ type: "retry_date_image", chatId: f.id }, f.id);
  const pending = sceneViewFor(f.id, f.r, before)!;
  expect(pending.imageBusy).toBe(true);
  expect(pending.imageRequest!.characterName).toBe("Mira");
  expect(pending.imageRequest!.venue).toBe("Garden");
  expect(Object.keys(pending.imageRequest!).sort()).toEqual(["version", "provider", "chatId", "requestId", "characterName", "venue", "timeOfDay", "mood"].sort());
  expect(JSON.stringify(pending.imageRequest)).not.toContain("TRAIT_MUST_NOT");
  expect(f.calls).toBe(0); // Warp's helper is never used for this picture.
  const result = { ...pending.imageRequest, status: "ready", imageUrl: "/api/v1/images/date", fit: "fill" };
  await frontendMessage({ type: "cue_image_result", chatId: f.id, result: { ...result, requestId: "wrong" } }, f.id);
  expect(sceneViewFor(f.id, f.r, before)!.image).toBeNull();
  await frontendMessage({ type: "cue_image_result", chatId: f.id, result }, "other-user");
  expect(sceneViewFor(f.id, f.r, before)!.image).toBeNull();
  await frontendMessage({ type: "cue_image_result", chatId: f.id, result }, f.id);
  expect(sceneViewFor(f.id, f.r, before)).toMatchObject({ image: "/api/v1/images/date", imageFit: "fill", imageBusy: false });
  await frontendMessage({ type: "cue_image_fit", chatId: f.id, fit: "scale-down" }, f.id);
  expect(sceneViewFor(f.id, f.r, before)!.imageFit).toBe("scale-down");
  await frontendMessage({ type: "retry_date_image", chatId: f.id }, f.id);
  const next = sceneViewFor(f.id, f.r, before)!.imageRequest!;
  expect(next.requestId).not.toBe(result.requestId);
  expect(foldPath(f.r, f.messages).state).toEqual(before);
  dropScene(f.id);
  await frontendMessage({ type: "cue_image_result", chatId: f.id, result: { ...result, requestId: next.requestId } }, f.id);
  expect(sceneViewFor(f.id, f.r, before)!.image).toBeNull();
  expect(f.calls).toBe(0); expect(f.narratorCalls ?? 0).toBe(0);
});
