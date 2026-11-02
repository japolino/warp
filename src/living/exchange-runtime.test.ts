import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import type { InterceptorContextDTO } from "lumiverse-spindle-types";
import { makeHost, type HelperCall } from "../backend/test-host.js";
import { getMessages } from "../backend/ledger.js";
import { syncLiving, livingStarted, livingStopped, livingEnded, livingIntercept } from "./runtime.js";
import { foldMechanics, MECHANICS_KEY, mechanicalRecordOf } from "./mechanical-history.js";
import { actionCount } from "./encounters.js";

const h = makeHost("exchange-runtime-owner", false);
const greeting = "Jo stands at touch distance and prepares to strike you. You have 40 of 40 Health. Jo has 40 of 40 Health and 10 of 10 Focus.";
const description = "Jo can use Jab, costing 2 Focus to deal 10 physical Health damage at touch range.";
const plainGreeting = "Jo stands at touch distance and prepares to strike you.";
const plainDescription = "Jo can use Jab, a light physical strike at touch range.";
let previous: unknown, serial = 0, reads = 0, bootstrap = true, extractionDown = false, forged = false, quiet = false, omitIDs = false, qualitative = false;
beforeAll(async () => {
  previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake;
  await import("../backend.ts" + "?exchange-runtime-test"); (globalThis as any).spindle = previous;
});
beforeEach(() => {
  previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake;
  reads = 0; bootstrap = true; extractionDown = false; forged = false; quiet = false; omitIDs = false; qualitative = false; h.helper = helper;
  h.fake.macros.resolve = async (text: string) => ({ text: text === "{{user}}" ? "Sam" : text === "{{persona}}" ? "Sam is visiting Jo." : text });
  h.fake.world_books.getActivated = async () => [];
});
afterEach(() => { (globalThis as any).spindle = previous; });
const state = async (id: string) => foldMechanics(await getMessages(id));
const latest = (id: string) => [...h.sent].reverse().find(m => m.type === "living" && m.chatId === id);
async function chat() {
  const id = `exchange-runtime-${++serial}`;
  h.chat(id, "", quiet ? "Jo puts away the weapon and invites you to sit down." : qualitative ? plainGreeting : greeting);
  Object.assign(h.characters[`char-${id}`], { name: "Jo", description: qualitative ? plainDescription : description, world_book_ids: [] });
  await syncLiving(id, h.userId); return id;
}
function helper(c: HelperCall): unknown {
  const attempt = c.system.includes("Determine whether");
  if (!attempt && (extractionDown || !bootstrap)) { if (extractionDown) throw new Error("Fixture extraction offline"); return { changes: [] }; }
  const messages = JSON.parse(c.user.split(attempt ? "Scene:\n" : "Messages:\n")[1]);
  const scene = messages.find((m: any) => m.content === (qualitative ? plainGreeting : greeting));
  const source = JSON.parse(c.user.split("\n").find(line => line.startsWith('[{"id":"warp-source:')) ?? "[]").find((s: any) => s.kind === "card");
  const data = { mechanicalObservations: scene ? [
    { kind: "entity", name: "Jo", entityKind: "person", present: true, message: scene.id, quote: "Jo stands at touch distance and prepares to strike you." },
    { kind: "distance", from: "you", to: "Jo", band: "touch", message: scene.id, quote: "Jo stands at touch distance and prepares to strike you." },
    { kind: "resource", id: "you-hp", name: "Health", owner: "you", current: 40, max: 40, role: "vital", message: scene.id, quote: "You have 40 of 40 Health." },
    { kind: "resource", id: "Jo-hp", name: "Health", owner: "Jo", current: 40, max: 40, role: "vital", message: scene.id, quote: "Jo has 40 of 40 Health and 10 of 10 Focus." },
    { kind: "resource", id: "Jo-focus", name: "Focus", owner: "Jo", current: 10, max: 10, role: "effort", message: scene.id, quote: "Jo has 40 of 40 Health and 10 of 10 Focus." },
  ] : [], abilityDefinitions: scene ? [{ owner: "Jo", name: "Jab", approach: "force", target: "other", range: "touch", costs: [{ kind: "resource", id: "Jo-focus", amount: 2 }], effects: [{ kind: "damage", target: "target", resource: "Health", amount: 10, damageType: "physical" }], message: source.id, quote: description }] : [] };
  if (qualitative) {
    data.mechanicalObservations = data.mechanicalObservations.filter(row => row.kind !== "resource");
    if (data.abilityDefinitions[0]) Object.assign(data.abilityDefinitions[0], { costs: [], effects: [{ kind: "harm", target: "target", impact: "minor", damageType: "physical" }], quote: plainDescription });
  }
  if (omitIDs) {
    for (const row of data.mechanicalObservations) delete (row as any).id;
    if (data.abilityDefinitions[0]) data.abilityDefinitions[0].costs[0].id = "Focus";
  }
  if (!attempt) return { changes: [], ...data };
  reads++;
  const action = messages.at(-1).content;
  const mechanicalActions = action.includes("guard") ? [{ kind: "defend", quote: action }] : action.includes("wait") ? [{ kind: "wait", quote: action }] : [];
  return { risky: false, contested: false, approach: "movement", exchange: !quiet, ...data, mechanicalActions,
    responses: scene && !quiet ? [{ actor: "Jo", action: { kind: "ability", ability: "Jab", target: "you" }, assessment: { contested: true, tier: "uncertain", intent: "Strike Sam", stakes: "Leave an opening", reasons: ["You can resist"], ...(forged ? { roll: 1 } : {}) }, message: scene.id, quote: "Jo stands at touch distance and prepares to strike you." }] : [] };
}

test("the normal composer prepares both sides on first use and exposes the actual saved NPC roll", async () => {
  bootstrap = false; const id = await chat();
  await h.say(id, "I guard my flank.");
  await h.generate(id, async prompt => {
    expect(actionCount(await state(id), "Jo")).toBe(0);
    expect((await state(id)).resources.find(r => r.id === "Jo-focus")?.current).toBe(10);
    expect(prompt.map(m => m.content).join("\n")).toContain('"kind":"response"');
    return "Jo makes the attack while you guard.";
  });
  const messages = await getMessages(id), record = mechanicalRecordOf(messages.at(-1)!)!, beat = record.receipt!.beats!.find(b => b.kind === "response")!;
  const after = await state(id);
  expect(record.receipt!.engine).toBe(4);
  expect(after.resources.find(r => r.id === "Jo-focus")?.current).toBe(8);
  expect(after.resources.find(r => r.id === "you-hp")?.current).toBe(beat.decision!.result === "setback" ? 40 : 35);
  expect(latest(id).responses[0].decision.roll).toBe(beat.decision!.roll);
  expect(latest(id).responses[0].actor).toBe("Jo");
  expect(reads).toBe(1);
  await h.generate(id, "Jo's attempt plays out differently in the telling.", "swipe");
  expect(await state(id)).toEqual(after); expect(reads).toBe(1);
});

test("first-use preparation assigns missing resource IDs locally and resolves a unique owned cost name", async () => {
  bootstrap = false; omitIDs = true; const id = await chat();
  await h.say(id, "I guard my flank."); await h.generate(id, "Jo attempts the jab while you guard.");
  const after = await state(id), focus = after.resources.find(r => r.owner === "Jo" && r.name === "Focus")!;
  expect(focus.current).toBe(8);
  expect(after.abilities![0].costs[0].id).toBe(focus.id);
  expect(latest(id).responses).toHaveLength(1);
  bootstrap = true; await syncLiving(id, h.userId);
  expect((await state(id)).resources.find(r => r.id === focus.id)?.current).toBe(8);
});

test("stopping a prepared exchange commits neither side and retry reuses the same plan", async () => {
  const id = await chat(); await h.say(id, "I guard my flank.");
  const target = h.msg(id, `${id}-partial`, false, "");
  livingStarted({ chatId: id, generationId: "stopped", targetMessageId: target.id });
  const history = await getMessages(id);
  await livingIntercept(history.map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id })), { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO);
  livingStopped({ chatId: id, generationId: "stopped" }); await livingEnded({ chatId: id, generationId: "stopped", messageId: target.id }, h.userId);
  expect(actionCount(await state(id), "Jo")).toBe(0); expect((await state(id)).resources.find(r => r.id === "Jo-focus")?.current).toBe(10);
  h.messages(id).pop(); await h.generate(id, "Jo attempts the strike.");
  expect(actionCount(await state(id), "Jo")).toBe(1); expect(reads).toBe(1);
});

test("failed scene extraction cannot erase a completed NPC roll or either side's committed state", async () => {
  const id = await chat(); extractionDown = true;
  await h.say(id, "I guard my flank."); await h.generate(id, "Jo attempts the strike.");
  expect((await state(id)).resources.find(r => r.id === "Jo-focus")?.current).toBe(8);
  expect(latest(id).responses).toHaveLength(1); expect(latest(id).retry).toBe(true);
  const last = (await getMessages(id)).at(-1)!;
  expect(last.metadata?.[MECHANICS_KEY]).toBeDefined();
});

test("model-supplied dice are visibly unresolved and never commit either side", async () => {
  const id = await chat(); forged = true;
  await h.say(id, "I guard my flank."); await h.generate(id, "The exchange remains unresolved.");
  expect(actionCount(await state(id), "Jo")).toBe(0);
  expect(latest(id).notice).toContain("assessment"); expect(latest(id).responses).toEqual([]);
});

test("ordinary questions and a quiet scene do not open a combat exchange", async () => {
  quiet = true; const id = await chat();
  await h.say(id, "How does Jab work?"); await h.generate(id, "Jo explains the technique.");
  expect(reads).toBe(0); expect(latest(id).responses).toEqual([]);
  await h.say(id, "I wait."); await h.generate(id, "Jo offers you a cup of tea.");
  expect(latest(id).responses).toEqual([]); expect((await state(id)).resources).toEqual([]);
});

test("a fresh card with no numerical stats prepares qualitative harm and preserves its saved result across swipes and failed extraction", async () => {
  qualitative = true; bootstrap = false; const id = await chat();
  await h.say(id, "I guard my flank.");
  await h.generate(id, async prompt => {
    expect((await state(id)).conditions.some(c => c.injury)).toBe(false);
    expect(prompt.map(m => m.content).join("\n")).toContain("Qualitative injuries are Warp interpretations");
    return "Jo attempts the jab against your guard.";
  });
  const after = await state(id), record = mechanicalRecordOf((await getMessages(id)).at(-1)!)!;
  const check = record.receipt!.beats!.find(b => b.kind === "response")!.decision!;
  expect(record.receipt!.status).toBe("ready");
  expect(after.resources).toEqual([]); expect(after.abilities![0].costs).toEqual([]);
  expect(after.conditions.find(c => c.owner === "you" && c.injury)?.injury?.load ?? 0).toBe(check.result === "setback" ? 0 : 0.5);
  expect(actionCount(after, "Jo")).toBe(1); expect(reads).toBe(1);
  extractionDown = true;
  await h.generate(id, "The same exchange, described another way.", "swipe");
  expect(await state(id)).toEqual(after); expect(latest(id).responses[0].decision.roll).toBe(check.roll);
  expect(reads).toBe(1);
});
