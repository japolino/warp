import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import type { InterceptorContextDTO } from "lumiverse-spindle-types";
import { makeHost, type HelperCall } from "../backend/test-host.js";
import { getMessages } from "../backend/ledger.js";
import { syncLiving, livingStarted, livingStopped, livingIntercept } from "./runtime.js";
import { foldMechanics, MECHANICS_KEY } from "./mechanical-history.js";
import { revision } from "../shared/revision.js";

const h = makeHost("growth-runtime-owner", false);
const opening = "You have 30 Focus. Ada, Bryn and Cora face you in the practice ring. Pulse costs 2 Focus and briefly disorients another person.";
let previous: unknown, serial = 0, reads = 0;
beforeAll(async () => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; await import("../backend.ts" + "?growth-runtime-test"); (globalThis as any).spindle = previous; });
beforeEach(() => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; reads = 0; h.helper = helper; });
afterEach(() => { (globalThis as any).spindle = previous; });
const state = async (id: string) => foldMechanics(await getMessages(id));
function data(id: string) {
  const cite = (row: object) => ({ ...row, message: `${id}-g`, quote: opening });
  return { changes: [], mechanicalObservations: [cite({ kind: "resource", id: "focus", owner: "you", name: "Focus", current: 30 }), ...["Ada", "Bryn", "Cora"].map(name => cite({ kind: "entity", name, entityKind: "person", present: true }))], abilityDefinitions: [cite({ owner: "you", name: "Pulse", approach: "concentration", target: "other", costs: [{ kind: "resource", id: "focus", amount: 2 }], effects: [{ kind: "condition", target: "target", name: "Disoriented", hinders: ["perception"], ending: "After a pause" }], requires: [], unsupported: [] })] };
}
function helper(c: HelperCall) {
  const attempt = c.system.includes("Determine whether"), entries = JSON.parse(c.user.split(attempt ? "Scene:\n" : "Messages:\n")[1]);
  const root = entries.find((m: any) => m.content === opening), id = root?.id.slice(0, -2);
  if (!attempt) return id ? data(id) : { changes: [] };
  reads++; const action = entries.at(-1).content, target = ["Ada", "Bryn", "Cora"].find(n => action.includes(n));
  return { risky: true, contested: true, tier: "uncertain", approach: "concentration", target, intent: "Disorient the resisting opponent", stakes: "Lose the opening", reasons: ["The opponent is resisting"], mechanicalActions: [{ kind: "ability", ability: "Pulse", target, quote: action }] };
}
async function chat() { const id = `growth-runtime-${++serial}`; h.chat(id, "", opening); h.characters[`char-${id}`].world_book_ids = []; await syncLiving(id, h.userId); return id; }

test("ordinary checked uses grow once after narration, reuse a swipe and preserve progress across reload", async () => {
  const id = await chat();
  for (const target of ["Ada", "Bryn"]) { await h.say(id, `I cast Pulse at ${target}.`); await h.generate(id, `${target} reacts to the attempt.`); }
  expect((await state(id)).growth![0].credits).toHaveLength(2);
  await h.say(id, "I cast Pulse at Cora.");
  const result = await h.generate(id, async prompt => {
    expect((await state(id)).growth![0].familiar).toBe(false); expect((await state(id)).resources[0].current).toBe(26);
    expect(JSON.stringify(prompt)).toContain("milestone"); return "Cora reacts to the attempt. The technique feels more familiar.";
  });
  const after = await state(id), receipt = (result.target.extra.spindle_metadata as any)[MECHANICS_KEY]["0"].receipt;
  expect(after.growth![0].familiar).toBe(true); expect(after.resources[0].current).toBe(24);
  const readCount = reads; await h.generate(id, "You recognize the familiar flow of the technique.", "swipe");
  expect(reads).toBe(readCount); expect((await state(id)).growth![0].credits).toHaveLength(3);
  expect((result.target.extra.spindle_metadata as any)[MECHANICS_KEY]["1"].receipt).toEqual(receipt);
  await syncLiving(id, h.userId); expect(await state(id)).toEqual(after);
  const beforePreview = revision(await state(id)); await livingIntercept([{ role: "user", content: "What can I do?" }], { chatId: id, userId: h.userId, generationType: "normal", isDryRun: true } as InterceptorContextDTO);
  expect(revision(await state(id))).toBe(beforePreview); expect(h.characters[`char-${id}`].world_book_ids).toEqual([]);
  h.messages(id)[0].content += " The previous ability description is void.";
  expect((await state(id)).growth).toBeUndefined();
});

test("Stop cannot turn a prepared practice opportunity into earned growth or a charged cost", async () => {
  const id = await chat(); await h.say(id, "I cast Pulse at Ada.");
  const before = await state(id), player = h.messages(id).at(-1)!, reply = h.msg(id, `${id}-pending`, false, "");
  livingStarted({ chatId: id, generationId: "stopped-growth", targetMessageId: reply.id });
  await livingIntercept([{ role: "user", content: player.content }], { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO);
  livingStopped({ chatId: id, generationId: "stopped-growth" }); expect(await state(id)).toEqual(before);
});

test("first-use instruction binds after its new ability definition without a rulebook or earlier read", async () => {
  const id = `growth-runtime-${++serial}`, content = "Tutor coaches Sam in Pulse until Sam completes the taught exercise. Pulse briefly disorients another person.";
  h.fake.macros.resolve = async (text: string) => ({ text: text === "{{user}}" ? "Sam" : text === "{{persona}}" ? "" : text });
  h.helper = () => ({ changes: [], mechanicalObservations: [{ kind: "entity", name: "Tutor", entityKind: "person", present: true, message: `${id}-g`, quote: content }, { kind: "practice", owner: "Sam", ability: "Pulse", teacher: "Tutor", message: `${id}-g`, quote: content }], abilityDefinitions: [{ owner: "you", name: "Pulse", approach: "concentration", target: "other", costs: [], effects: [{ kind: "condition", target: "target", name: "Disoriented", hinders: ["perception"], ending: "After a pause" }], requires: [], unsupported: [], message: `${id}-g`, quote: content }] });
  h.chat(id, "", content); h.characters[`char-${id}`].world_book_ids = []; await syncLiving(id, h.userId);
  expect((await state(id)).growth![0].credits).toHaveLength(1); expect((await state(id)).entities?.find(e => e.name === "you")?.aliases).toContain("Sam");
});

test("earned familiarity cannot erase an outmatched base assessment", async () => {
  const id = await chat(), original = h.helper;
  h.helper = c => { const result = original(c) as any; return c.system.includes("Determine whether") ? { ...result, tier: "outmatched" } : result; };
  for (const target of ["Ada", "Bryn", "Cora"]) { await h.say(id, `I cast Pulse at ${target}.`); await h.generate(id, `${target} resists the attempt.`); }
  expect((await state(id)).growth![0].familiar).toBe(true);
  await h.say(id, "I cast Pulse at Ada."); const result = await h.generate(id, "Ada remains a daunting opponent.");
  const decision = (result.target.extra.spindle_metadata as any).warpLiving["0"].decision;
  expect(decision.tier).toBe("outmatched"); expect(decision.reasons).not.toContain("Practiced Pulse");
});

test("quoted metagame questions cannot spend, roll or train even with a helper inclined to execute casts", async () => {
  const id = await chat(), before = await state(id);
  await h.say(id, '"How much Focus would it cost to cast Pulse at Ada?"'); await h.generate(id, "Pulse costs two Focus.");
  expect(await state(id)).toEqual(before); expect(reads).toBe(0);
});

test("a quiet sourced cast becomes available on its first real exchange before range rows are read", async () => {
  const id = `growth-runtime-${++serial}`, content = "In the practice ring, Jo throws a punch at you within arm's reach.";
  h.chat(id, "", content);
  h.helper = c => c.system.includes("Determine whether") ? {
    risky: true, contested: true, tier: "uncertain", intent: "Strike Jo", stakes: "Lose the opening", reasons: ["Jo is resisting"],
    mechanicalObservations: [{ kind: "distance", from: "you", to: "Jo", band: "touch", message: `${id}-g`, quote: content }],
    mechanicalActions: [{ kind: "strike", target: "Jo", quote: "I punch Jo's arm." }], exchange: true,
    responses: [{ actor: "Jo", action: { kind: "strike", target: "you" }, quote: content, assessment: { contested: true, tier: "uncertain", intent: "Strike back", stakes: "Leave an opening", reasons: ["You resist"] } }],
  } : { changes: [], scene: { place: "practice ring", present: ["Jo"], message: `${id}-g`, quote: content } };
  await syncLiving(id, h.userId);
  expect((await state(id)).entities).toBeUndefined();
  await h.say(id, "I punch Jo's arm.");
  const result = await h.generate(id, "Jo reacts to the recorded exchange.\n\n[體+1] [攻+1]");
  const after = await state(id);
  expect(after.applied).toHaveLength(1);
  expect(after.growth!.find(g => g.owner === "you")!.credits).toHaveLength(1);
  expect(after.growth!.find(g => g.owner === "Jo")!.credits).toHaveLength(1);
  expect(after.resources).toEqual([]);
  result.target.content = "Jo reacts to the recorded exchange.";
  expect(await state(id)).toEqual(after);
});
