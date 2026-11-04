import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import type { InterceptorContextDTO } from "lumiverse-spindle-types";
import { makeHost, type HelperCall } from "../backend/test-host.js";
import { getMessages } from "../backend/ledger.js";
import { foldMechanics, MECHANICS_KEY } from "./mechanical-history.js";
import { syncLiving, livingStarted, livingIntercept, livingStopped } from "./runtime.js";
import { entityFor } from "./encounters.js";

const h = makeHost("companion-runtime-owner", false);
const opening = "Echo is your summoned familiar, currently absent. Echo has an injured wing. You have 12 of 12 Focus. Echo has 0 of 8 Focus. Echo's Focus costs are paid one for one from your Focus. Recall costs 2 Focus to summon Echo. Dismiss dismisses Echo. Echo's Beacon costs 3 Focus and grants a Beacon condition until dismissed.";
let previous: unknown, serial = 0, bootstrap = true, reads = 0;
beforeAll(async () => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; await import("../backend.ts" + "?companion-runtime-test"); (globalThis as any).spindle = previous; });
beforeEach(() => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; bootstrap = true; reads = 0; h.helper = helper; });
afterEach(() => { (globalThis as any).spindle = previous; });
const state = async (id: string) => foldMechanics(await getMessages(id));
function helper(c: HelperCall) {
  const attempt = c.system.includes("Determine whether"), entries = JSON.parse(c.user.split(attempt ? "Scene:\n" : "Messages:\n")[1]);
  const source = entries.find((m: any) => m.content === opening), cite = (row: object) => ({ ...row, message: source.id, quote: opening });
  if (!attempt && !bootstrap) return { changes: [] };
  const observations = source ? [
    cite({ kind: "entity", name: "Echo", aliases: ["familiar"], entityKind: "person", present: false }),
    cite({ kind: "companion", actor: "Echo", controller: "you", companionKind: "summon" }),
    cite({ kind: "resource", id: "focus", owner: "you", name: "Focus", current: 12, max: 12, role: "effort" }),
    cite({ kind: "resource", id: "echo-focus", owner: "Echo", name: "Focus", current: 0, max: 8, role: "effort" }),
    cite({ kind: "cost_link", from: "echo-focus", to: "focus", enabled: true, unsupported: [] }),
    cite({ kind: "condition", id: "wing", owner: "Echo", name: "Injured wing", hinders: ["movement"], ending: "After treatment" }),
  ] : [];
  const def = (owner: string, name: string, effects: object[], costs: object[] = []) => cite({ owner, name, approach: "concentration", target: "self", costs, effects, requires: [], unsupported: [] });
  const definitions = source ? [
    def("you", "Recall", [{ kind: "summon", target: "self", companion: "Echo" }], [{ kind: "resource", id: "focus", amount: 2 }]),
    def("you", "Dismiss", [{ kind: "dismiss", target: "self", companion: "Echo" }]),
    def("Echo", "Beacon", [{ kind: "condition", target: "self", name: "Beacon", ending: "Until dismissed", untilDismissed: true }], [{ kind: "resource", id: "echo-focus", amount: 3 }]),
  ] : [];
  if (!attempt) return { changes: [], mechanicalObservations: observations, abilityDefinitions: definitions };
  reads++;
  const action = entries.at(-1).content;
  if (/wait/.test(action)) {
    const prior = entries.filter((m: any) => !m.is_user).at(-1);
    return { risky: false, contested: false, exchange: true, mechanicalActions: [{ kind: "wait", quote: action }], responses: [{ actor: "Echo", action: { kind: "ability", ability: "Beacon" }, assessment: { contested: false }, message: prior.id, quote: "Echo offers to light Beacon." }] };
  }
  return { risky: false, contested: false, mechanicalObservations: observations, abilityDefinitions: definitions, mechanicalActions: [{ kind: "ability", ability: /dismiss/i.test(action) ? "Dismiss" : "Recall", quote: action }] };
}
async function chat() { const id = `companion-runtime-${++serial}`; h.chat(id, "", opening); h.characters[`char-${id}`].world_book_ids = []; await syncLiving(id, h.userId); return id; }

test("normal chat recalls and dismisses without setup, keeps the injury and reuses the receipt on swipes", async () => {
  const id = await chat(); expect((await state(id)).companions).toHaveLength(1);
  await h.say(id, "I summon Echo.");
  const result = await h.generate(id, async prompt => {
    expect((await state(id)).resources[0].current).toBe(12); expect(entityFor(await state(id), "Echo")?.present).toBe(false);
    expect(JSON.stringify(prompt)).toContain("companionBoundary"); return "Echo appears with the same injured wing.";
  });
  expect((await state(id)).resources[0].current).toBe(10); expect(entityFor(await state(id), "Echo")?.present).toBe(true);
  const receipt = (result.target.extra.spindle_metadata as any)[MECHANICS_KEY]["0"].receipt;
  await h.generate(id, "Echo is beside you, still favoring the wing.", "swipe");
  expect(reads).toBe(1); expect((result.target.extra.spindle_metadata as any)[MECHANICS_KEY]["1"].receipt).toEqual(receipt);
  await h.say(id, "I dismiss Echo."); await h.generate(id, "Echo fades from sight.");
  expect(entityFor(await state(id), "Echo")?.present).toBe(false);
  await h.say(id, "I summon Echo."); await h.generate(id, "Echo returns with the injury unchanged.");
  await syncLiving(id, h.userId);
  expect((await state(id)).resources.map(r => r.current)).toEqual([8, 0]); expect((await state(id)).conditions[0].id).toBe("wing");
  expect(h.characters[`char-${id}`].world_book_ids).toEqual([]);
});

test("first use prepares a missing companion in the same existing helper call", async () => {
  bootstrap = false; const id = await chat(); expect((await state(id)).companions).toBeUndefined();
  await h.say(id, "I summon Echo."); await h.generate(id, "Echo appears.");
  expect((await state(id)).companions).toHaveLength(1); expect((await state(id)).resources[0].current).toBe(10); expect(reads).toBe(1);
});

test("Stop and preview do not manifest or debit; a sourced companion response uses its linked payer once", async () => {
  const id = await chat(), before = await state(id);
  await h.say(id, "I summon Echo."); const player = h.messages(id).at(-1)!, target = h.msg(id, `${id}-cancel`, false, "");
  livingStarted({ chatId: id, generationId: "cancel", targetMessageId: target.id });
  await livingIntercept([{ role: "user", content: player.content }], { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO);
  livingStopped({ chatId: id, generationId: "cancel" }); expect(await state(id)).toEqual(before);
  await livingIntercept([{ role: "user", content: player.content }], { chatId: id, userId: h.userId, generationType: "normal", isDryRun: true } as InterceptorContextDTO);
  expect(await state(id)).toEqual(before);
  h.messages(id).pop();
  await h.generate(id, "Echo appears. Echo offers to light Beacon.");
  await h.say(id, "I wait."); const result = await h.generate(id, "Echo lights Beacon, keeping weight off the injured wing.");
  expect((await state(id)).resources.map(r => r.current)).toEqual([7, 0]);
  expect((await state(id)).conditions.map(c => c.name)).toEqual(["Injured wing", "Beacon"]);
  const checks = (result.target.extra.spindle_metadata as any)[MECHANICS_KEY]["0"].receipt;
  expect(checks.responses[0].actor).toBe("Echo"); expect(checks.changes.filter((c: any) => c.kind === "resource")).toHaveLength(1);
  await h.generate(id, "Echo's Beacon lights the room.", "swipe");
  expect((await state(id)).resources.map(r => r.current)).toEqual([7, 0]);
});

test("an NPC's newly introduced companion can use its controller from the same validated scene", async () => {
  const id = `companion-runtime-${++serial}`, content = "Norma waits beside Echo, her regular autonomous assistant.";
  h.helper = () => ({ changes: [], scene: { place: "Workshop", present: ["Norma", "Echo"], message: `${id}-g`, quote: content }, mechanicalObservations: [
    { kind: "entity", name: "Echo", entityKind: "object", present: true, message: `${id}-g`, quote: content },
    { kind: "companion", actor: "Echo", controller: "Norma", companionKind: "companion", message: `${id}-g`, quote: content },
  ] });
  h.chat(id, "", content); h.characters[`char-${id}`].world_book_ids = []; await syncLiving(id, h.userId);
  expect((await state(id)).companions?.[0].controller).toBe("Norma");
  expect((await state(id)).entities?.map(e => e.name)).toEqual(["Echo", "Norma"]);
  expect((await state(id)).resources).toEqual([]); expect((await state(id)).abilities).toBeUndefined();
});
