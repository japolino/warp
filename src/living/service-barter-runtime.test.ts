import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import type { InterceptorContextDTO } from "lumiverse-spindle-types";
import { makeHost, type HelperCall } from "../backend/test-host.js";
import { getMessages } from "../backend/ledger.js";
import { foldMechanics } from "./mechanical-history.js";
import { syncLiving, livingStarted, livingStopped, livingIntercept } from "./runtime.js";

const h = makeHost("barter-runtime-owner", false);
const clauses = ["sweep the chapel steps", "wash the basin"];
const opening = "Jo stands beside you within arm's reach in the clinic. Jo has 10 Focus. You have 12 coins and a small routine cooking burn. Jo offers Mend for five coins if you sweep the chapel steps and wash the basin.";
const profile = "Jo's Mend gently treats routine physical injury at touch range and costs 2 Focus.";
const ack = "Jo acknowledges your agreement. The work and treatment have not happened yet.";
const swept = "You sweep the chapel steps completely. Jo checks that the steps are clean.";
const washed = "You wash the basin completely. Jo checks the completed work and offers Mend as promised.";
let previous: unknown, serial = 0, active = "", yesPreparations = 0;
beforeAll(async () => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; await import("../backend.ts" + "?barter-runtime"); (globalThis as any).spindle = previous; });
beforeEach(() => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; yesPreparations = 0; h.helper = helper; });
afterEach(() => { (globalThis as any).spindle = previous; });
const state = async () => foldMechanics(await getMessages(active));
function helper(call: HelperCall) {
  const all = h.messages(active), latest = [...all].reverse().find(m => !m.is_user && m.content)!;
  if (call.system.includes("Determine whether")) {
    if ([...all].reverse().find(m => m.is_user)?.content === "Yes, please.") { yesPreparations++; throw Error("A fresh yes must reuse its quoted terms"); }
    return { risky: false, contested: false, mechanicalActions: [], responses: [] };
  }
  const sources = JSON.parse(call.user.split("\n").find(l => l.startsWith('[{"id":"warp-source:')) ?? "[]"), source = sources.find((s: any) => s.kind === "card");
  const greeting = all[0], cite = (row: object) => ({ ...row, message: greeting.id, quote: opening });
  const acceptance = all.find(m => m.is_user && m.content === "Yes, please."), firstWork = all.find(m => !m.is_user && m.content === swept), secondWork = all.find(m => !m.is_user && m.content === washed);
  return { changes: [], scene: { place: "clinic", present: ["Jo"], message: latest.id, quote: latest.content }, mechanicalObservations: [
    cite({ kind: "entity", name: "Jo", entityKind: "person", present: true }), cite({ kind: "distance", from: "you", to: "Jo", band: "touch" }),
    cite({ kind: "resource", id: "focus", owner: "Jo", name: "Focus", current: 10, role: "effort" }),
    cite({ kind: "resource", id: "coins", owner: "you", name: "Coins", current: 12, role: "money", unit: "coin" }),
    cite({ kind: "condition", id: "burn", owner: "you", name: "Cooking burn", category: "physical_injury", severity: "minor", recovery: "routine", helps: [], hinders: ["movement"], blocks: [], ending: "Treatment" }),
    cite({ kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [], fee: { kind: "resource", id: "coins", amount: 5 }, work: clauses }),
    ...(acceptance ? [{ kind: "agreement", owner: "you", name: "Clinic work", from: "Jo", offer: { message: greeting.id, quote: opening }, requirements: clauses.map(quote => ({ message: greeting.id, quote })), rewards: [], service: { offer: "Mend" }, unsupported: [], message: acceptance.id, quote: acceptance.content }] : []),
    ...(firstWork ? [{ kind: "agreement_progress", agreement: "Clinic work", requirement: clauses[0], message: firstWork.id, quote: firstWork.content }] : []),
    ...(secondWork ? [{ kind: "agreement_progress", agreement: "Clinic work", requirement: clauses[1], message: secondWork.id, quote: secondWork.content }] : []),
    ...(latest.content === washed ? [{ kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [], agreement: "Clinic work", message: latest.id, quote: "Jo checks the completed work and offers Mend as promised." }] : []),
  ], abilityDefinitions: [{ owner: "Jo", name: "Mend", approach: "concentration", target: "other", range: "touch", costs: [{ kind: "resource", id: "focus", amount: 2 }], effects: [{ kind: "mend", target: "target", impact: "minor" }], requires: [], unsupported: [], message: source.id, quote: profile }] };
}
function chat() {
  active = `barter-runtime-${++serial}`; h.chat(active, "", opening); Object.assign(h.characters[`char-${active}`], { description: profile, world_book_ids: [] });
  return active;
}

test("ordinary yes agrees to work, questions preserve it, and a later yes receives exactly one earned treatment", async () => {
  const id = chat(); await syncLiving(id, h.userId);
  const proposed = await state(); expect(proposed.aidOffers![0].work).toHaveLength(2); expect(proposed.agreements).toBeUndefined();
  await h.say(id, "Yes, please.");
  await h.generate(id, async prompt => {
    expect(prompt.map(m => m.content).join("\n")).toContain("serviceBoundary"); expect((await state()).agreements).toBeUndefined();
    return ack;
  });
  const agreed = await state(); expect(agreed.agreements![0].service).toBeDefined(); expect(agreed.agreements![0].requirements.filter(r => r.done)).toHaveLength(0);
  expect(agreed.resources.find(r => r.id === "coins")!.current).toBe(12); expect(agreed.resources.find(r => r.id === "focus")!.current).toBe(10); expect(agreed.conditions).toHaveLength(1); expect(agreed.applied).toEqual([]);
  await h.say(id, "What work did we agree to?"); await h.generate(id, "Jo repeats that you agreed to sweep the chapel steps and wash the basin.");
  expect((await state()).agreements).toEqual(agreed.agreements);
  await h.say(id, "I sweep the chapel steps."); await h.generate(id, swept);
  const partial = await state(); expect(partial.agreements![0].requirements.filter(r => r.done)).toHaveLength(1); expect(partial.conditions).toHaveLength(1);
  await h.say(id, "I wash the basin."); await h.generate(id, washed);
  const earned = await state(); expect(earned.agreements![0].requirements.filter(r => r.done)).toHaveLength(2);
  expect(earned.aidOffers![0].agreement).toBe(earned.agreements![0].id); expect(earned.aidOffers![0].fee?.amount).toBe(5); expect(earned.conditions).toHaveLength(1);
  await h.say(id, "Yes, please.");
  const target = h.msg(id, `${id}-stopped`, false, "");
  livingStarted({ chatId: id, generationId: "barter-stopped", targetMessageId: target.id, generationType: "normal" });
  await livingIntercept([{ role: "user", content: "Yes, please." }], { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO);
  livingStopped({ chatId: id, generationId: "barter-stopped" });
  expect((await state()).resources).toEqual(earned.resources); expect((await state()).agreements).toEqual(earned.agreements);
  await h.generate(id, async prompt => {
    const text = prompt.map(m => m.content).join("\n"); expect(text).toContain('"kind":"payment"'); expect(text).toContain('"status":"ready"');
    return "Jo receives five coins and uses Mend to treat your cooking burn.";
  }, "swipe");
  const after = await state(); expect(after.resources.find(r => r.id === "coins")!.current).toBe(7); expect(after.resources.find(r => r.id === "focus")!.current).toBe(8);
  expect(after.conditions).toEqual([]); expect(after.agreements![0].service!.used).toBeDefined(); expect(after.aidOffers![0].status).toBe("used");
  const notes = h.sent.filter(m => m.type === "living" && m.chatId === id).at(-1).notes;
  expect(notes).toContain("Mend: received · paid 5 Coins"); expect(notes).not.toContain("Clinic work");
  await h.generate(id, "Jo's same recorded treatment is described differently.", "swipe");
  const swiped = await state();
  // Current presence can cite the selected narration; it cannot repeat payment or treatment.
  expect(swiped.resources).toEqual(after.resources); expect(swiped.conditions).toEqual(after.conditions); expect(swiped.clocks).toEqual(after.clocks);
  expect(swiped.agreements).toEqual(after.agreements); expect(swiped.aidOffers).toEqual(after.aidOffers); expect(swiped.applied).toEqual(after.applied);
  await syncLiving(id, h.userId); expect(await state()).toEqual(swiped); expect(yesPreparations).toBe(0);
});

test("first opening an existing conversation recovers its conditional proposal and acceptance in one read", async () => {
  const id = chat(); await h.say(id, "Yes, please."); h.msg(id, `${id}-ack`, false, ack);
  await syncLiving(id, h.userId);
  const recovered = await state(); expect(recovered.aidOffers![0].work).toHaveLength(2); expect(recovered.agreements![0].service!.offer).toBe(recovered.aidOffers![0].id);
  expect(recovered.agreements![0].requirements.filter(r => r.done)).toHaveLength(0); expect(recovered.resources.find(r => r.id === "coins")!.current).toBe(12);
  expect(recovered.conditions).toHaveLength(1); expect(recovered.applied).toEqual([]);
  await syncLiving(id, h.userId); expect(await state()).toEqual(recovered);
});
