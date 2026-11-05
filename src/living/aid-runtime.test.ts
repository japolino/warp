import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import type { InterceptorContextDTO } from "lumiverse-spindle-types";
import { makeHost, type HelperCall } from "../backend/test-host.js";
import { getMessages } from "../backend/ledger.js";
import { foldMechanics, MECHANICS_KEY } from "./mechanical-history.js";
import { syncLiving, livingStarted, livingStopped, livingEnded, livingIntercept } from "./runtime.js";

const h = makeHost("aid-runtime-owner", false);
const opening = "Jo stands beside you within arm's reach in the clinic. Jo has 10 Focus. You have a small routine cooking burn. Jo offers Mend to treat your burn.";
const profile = "Jo's Mend gently treats routine physical injury at touch range and costs 2 Focus.";
let previous: unknown, serial = 0, preparations = 0;
beforeAll(async () => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; await import("../backend.ts" + "?aid-runtime"); (globalThis as any).spindle = previous; });
beforeEach(() => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; preparations = 0; h.helper = helper; });
afterEach(() => { (globalThis as any).spindle = previous; });
const state = async (id: string) => foldMechanics(await getMessages(id));
const view = (id: string) => h.sent.filter(m => m.type === "living" && m.chatId === id).at(-1);
function helper(c: HelperCall) {
  if (c.system.includes("Determine whether")) { preparations++; throw Error("The fresh direct acceptance should use its saved offer"); }
  const sources = JSON.parse(c.user.split("\n").find(l => l.startsWith('[{"id":"warp-source:')) ?? "[]"), source = sources.find((s: any) => s.kind === "card");
  const rows = JSON.parse(c.user.split("Messages:\n")[1]), greeting = rows.find((m: any) => m.content === opening);
  if (!greeting) return { changes: [] };
  const cite = (row: object) => ({ ...row, message: greeting.id, quote: opening });
  return { changes: [], scene: { place: "clinic", present: ["Jo"], message: greeting.id, quote: opening }, mechanicalObservations: [
    cite({ kind: "aid_offer", actor: "Jo", target: "Sam", ability: "Mend", uncontested: true, unsupported: [] }),
    cite({ kind: "entity", name: "Jo", entityKind: "person", present: true }), cite({ kind: "distance", from: "you", to: "Jo", band: "touch" }),
    cite({ kind: "resource", id: "focus", owner: "Jo", name: "Focus", current: 10, role: "effort" }),
    cite({ kind: "condition", id: "burn", owner: "you", name: "Cooking burn", category: "physical_injury", severity: "minor", recovery: "routine", helps: [], hinders: ["movement"], blocks: [], ending: "Treatment" }),
  ], abilityDefinitions: [{ owner: "Jo", name: "Mend", approach: "concentration", target: "other", range: "touch", costs: [{ kind: "resource", id: "focus", amount: 2 }], effects: [{ kind: "mend", target: "target", impact: "minor" }], requires: [], unsupported: [], message: source.id, quote: profile }] };
}
async function chat() {
  const id = `aid-runtime-${++serial}`; h.chat(id, "", opening); Object.assign(h.characters[`char-${id}`], { description: profile, world_book_ids: [] });
  await syncLiving(id, h.userId); return id;
}

test("a normal card prepares an offer and its NPC ability, shows costs and accepts without a setup screen or another interpretation", async () => {
  const id = await chat(), before = await state(id);
  expect(before.aidOffers?.[0].status).toBe("offered"); expect(before.abilities?.map(a => a.owner)).toEqual(["Jo"]);
  expect(view(id).notes).toContain("Jo offers Mend · uses 2 Focus");
  expect(before.conditions).toHaveLength(1); expect(before.resources[0].current).toBe(10);
  await h.say(id, "Yes, please.");
  await h.generate(id, async prompt => {
    expect((await state(id)).resources[0].current).toBe(10); expect((await state(id)).conditions).toHaveLength(1);
    expect(prompt.map(m => m.content).join("\n")).toContain('"kind":"aid","actor":"Jo"'); return "Jo uses Mend and the recorded treatment clears your cooking burn.";
  });
  const after = await state(id);
  expect(after.resources[0].current).toBe(8); expect(after.conditions).toEqual([]); expect(after.aidOffers![0].status).toBe("used");
  expect(after.clocks).toEqual([{ id: "Jo", actor: "Jo", actions: 1 }]); expect(preparations).toBe(0);
  expect(h.characters[`char-${id}`].world_book_ids).toEqual([]);
  expect(view(id).notes).toContain("Cooking burn: cleared");
});

test("stop and a changed swipe do not duplicate or prematurely consume aid", async () => {
  const id = await chat(); await h.say(id, "Yes, please.");
  const before = await state(id), target = h.msg(id, `${id}-stopped`, false, "");
  livingStarted({ chatId: id, generationId: "stopped-aid", targetMessageId: target.id });
  await livingIntercept([{ role: "user", content: "Yes, please." }], { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO);
  livingStopped({ chatId: id, generationId: "stopped-aid" });
  expect(await state(id)).toEqual(before);
  await h.generate(id, "Jo treats the recorded cooking burn.", "swipe");
  const paid = await state(id); expect(paid.resources[0].current).toBe(8);
  await h.generate(id, "Jo applies the same saved treatment, described differently.", "swipe");
  expect(await state(id)).toEqual(paid); expect(preparations).toBe(0);
  await syncLiving(id, h.userId); expect(await state(id)).toEqual(paid);
});

test("a direct refusal consumes no NPC or player action, and questions preserve an offer", async () => {
  const id = await chat(), before = await state(id);
  h.helper = c => c.system.includes("Determine whether") ? (() => { preparations++; return { risky: false, contested: false, mechanicalActions: [{ kind: "decline_aid", offer: before.aidOffers![0].id, version: before.aidOffers![0].version, quote: "I decline your aid." }] }; })() : { changes: [] };
  await h.say(id, "How much Focus would that cost?"); await h.generate(id, "Jo explains that the offered Mend uses two of his Focus.");
  const queried = await state(id);
  expect(queried.aidOffers).toEqual(before.aidOffers); expect(queried.conditions).toEqual(before.conditions); expect(queried.resources).toEqual(before.resources); expect(queried.clocks).toEqual(before.clocks); expect(preparations).toBe(0);
  await h.say(id, "I decline your aid."); await h.generate(id, "Jo accepts your refusal and leaves the treatment unperformed.");
  const after = await state(id); expect(after.aidOffers![0].status).toBe("withdrawn"); expect(after.resources).toEqual(before.resources); expect(after.clocks).toEqual(before.clocks); expect(after.conditions).toEqual(before.conditions);
});

test("a request invites an NPC offer without casting a player-owned power or healing early", async () => {
  const id = `aid-runtime-${++serial}`, greeting = "Jo waits beside you in the clinic. You have a small routine cooking burn.";
  h.chat(id, "", greeting); Object.assign(h.characters[`char-${id}`], { description: profile, world_book_ids: [] });
  h.helper = c => {
    if (c.system.includes("Determine whether")) { preparations++; throw Error("A simple request executes no player action"); }
    const latest = h.messages(id).at(-1)!;
    return { changes: [], scene: { place: "clinic", present: ["Jo"], message: `${id}-g`, quote: greeting }, mechanicalObservations: latest.content.includes("offers") ? [{ kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [], message: latest.id, quote: latest.content }] : [] };
  };
  await syncLiving(id, h.userId); await h.say(id, "Could you treat my arm?");
  await h.generate(id, async prompt => { expect(prompt.map(m => m.content).join("\n")).toContain("aidBoundary"); return "Jo offers to treat your burn with Mend."; });
  expect(preparations).toBe(0); expect((await state(id)).applied).toEqual([]); expect((await state(id)).resources).toEqual([]); expect((await state(id)).abilities).toBeUndefined();
  // No phantom player spell or unsupported offer can appear when the NPC definition is missing.
  expect((await state(id)).aidOffers).toBeUndefined();
});


test("a fresh ordinary request prepares a voluntary NPC offer before a plain acceptance resolves it", async () => {
  const id = `aid-runtime-${++serial}`, greeting = "Jo stands within arm's reach in the clinic with 10 Focus. You have a small routine cooking burn.";
  h.chat(id, "", greeting); Object.assign(h.characters[`char-${id}`], { description: profile, world_book_ids: [] });
  h.helper = c => {
    if (c.system.includes("Determine whether")) { preparations++; throw Error("Fresh aid uses its prepared offer"); }
    const source = JSON.parse(c.user.split("\n").find(l => l.startsWith('[{"id":"warp-source:')) ?? "[]").find((s: any) => s.kind === "card");
    const latest = h.messages(id).at(-1)!;
    const cite = (row: object) => ({ ...row, message: `${id}-g`, quote: greeting });
    return { changes: [], scene: { place: "clinic", present: ["Jo"], message: `${id}-g`, quote: greeting }, mechanicalObservations: [
      cite({ kind: "entity", name: "Jo", entityKind: "person", present: true }), cite({ kind: "distance", from: "you", to: "Jo", band: "touch" }),
      cite({ kind: "resource", id: "focus", owner: "Jo", name: "Focus", current: 10, role: "effort" }),
      cite({ kind: "condition", id: "burn", owner: "you", name: "Cooking burn", category: "physical_injury", severity: "minor", recovery: "routine", helps: [], hinders: ["movement"], blocks: [], ending: "Treatment" }),
      ...(latest.content.includes("offers") ? [{ kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [], message: latest.id, quote: latest.content }] : []),
    ], ...(latest.content.includes("offers") ? { abilityDefinitions: [{ owner: "Jo", name: "Mend", approach: "concentration", target: "other", range: "touch", costs: [{ kind: "resource", id: "focus", amount: 2 }], effects: [{ kind: "mend", target: "target", impact: "minor" }], requires: [], unsupported: [], message: source.id, quote: profile }] } : {}) };
  };
  await syncLiving(id, h.userId); expect((await state(id)).abilities).toBeUndefined();
  await h.say(id, "Could you treat my arm?"); await h.generate(id, "Jo offers Mend to treat your burn.");
  const offered = await state(id);
  expect(offered.aidOffers![0].status).toBe("offered"); expect(offered.resources[0].current).toBe(10); expect(offered.conditions).toHaveLength(1); expect(offered.applied).toEqual([]);
  expect(view(id).notes).toContain("Jo offers Mend · uses 2 Focus");
  await h.say(id, "Yes, please."); const reply = await h.generate(id, "Jo uses the saved Mend and clears the burn.");
  expect((reply.target.extra.spindle_metadata as any)[MECHANICS_KEY]["0"].receipt.engine).toBe(10);
  expect((await state(id)).resources[0].current).toBe(8); expect((await state(id)).conditions).toEqual([]);
  expect((await state(id)).abilities!.some(a => a.owner === "you")).toBe(false); expect(preparations).toBe(0);
});


test("a card edit invalidates fresh local aid acceptance before any cost or cure", async () => {
  const id = await chat(), before = await state(id);
  h.characters[`char-${id}`].description = "Jo's Mend now costs 9 Focus and only treats frostbite at touch range.";
  await h.say(id, "Yes, please.");
  const reply = await h.generate(id, "Jo waits while the changed treatment is clarified.");
  const after = await state(id);
  expect(after.resources).toEqual(before.resources);
  expect(after.conditions).toEqual(before.conditions);
  expect(after.clocks).toEqual(before.clocks);
  expect(after.aidOffers).toEqual(before.aidOffers);
  const receipt = (h.messages(id).filter(m => m.is_user).at(-1)!.extra.spindle_metadata as any).warpLivingAttempt?.receipt;
  expect(receipt?.status).toBe("blocked");
  expect(preparations).toBe(0);
});


test("a stalled interpretation on a host without a deadline still publishes aid and unresolved boundaries inside ten seconds", async () => {
  const id = await chat(), before = await state(id);
  h.helper = c => c.system.includes("Determine whether") ? new Promise(() => {}) : { changes: [] };
  await h.say(id, 'I take a step closer. "Could you heal this cooking burn?"');
  const user = h.messages(id).filter(m => m.is_user).at(-1)!;
  const target = h.msg(id, `${id}-deadline-reply`, false, "");
  livingStarted({ chatId: id, generationId: "no-host-deadline", targetMessageId: target.id });
  const start = Date.now();
  const prompt = await livingIntercept([{ role: "user", content: user.content, sourceMessageId: user.id }], { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO);
  expect(Date.now() - start).toBeLessThan(9500);
  const wire = prompt.map(m => m.content).join("\n");
  expect(wire).toContain('"aidBoundary"');
  expect(wire).toContain('"preparationBoundary"');
  target.content = target.swipes[0] = "Jo waits while the offered treatment is clarified.";
  await livingEnded({ chatId: id, generationId: "no-host-deadline", messageId: target.id }, h.userId);
  expect((await state(id)).resources).toEqual(before.resources);
  expect((await state(id)).conditions).toEqual(before.conditions);
  expect((await state(id)).applied).toEqual([]);
  expect((user.extra.spindle_metadata as any).warpLivingPrompt["0"].packet.aidBoundary).toBeTruthy();
}, 12000);
