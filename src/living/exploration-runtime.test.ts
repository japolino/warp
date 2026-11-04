import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import type { InterceptorContextDTO } from "lumiverse-spindle-types";
import { makeHost, settle, type HelperCall } from "../backend/test-host.js";
import { getMessages } from "../backend/ledger.js";
import { syncLiving, livingStarted, livingEnded, livingIntercept, livingStopped } from "./runtime.js";
import { foldMechanics, MECHANICS_KEY } from "./mechanical-history.js";
import { currentSite } from "./exploration.js";

const h = makeHost("exploration-runtime-owner", false);
const opening = "You stand in the Dock. A sign shows an open corridor between the Dock and Clinic in both directions, and a locked hatch from the Clinic to the Attic. The supply log lists three free Rations in the Clinic. A broken scanner is in the Dock.";
let previous: unknown, serial = 0, reads = 0, offline = false;
beforeAll(async () => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; await import("../backend.ts" + "?exploration-runtime-test"); (globalThis as any).spindle = previous; });
beforeEach(() => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; reads = 0; offline = false; h.helper = helper; });
afterEach(async () => { await h.settings({ decisionConnectionId: "" }); delete h.fake.decisions; (globalThis as any).spindle = previous; });
const state = async (id: string) => foldMechanics(await getMessages(id));
const latest = (id: string) => [...h.sent].reverse().find(m => m.type === "living" && m.chatId === id);
function observations(id: string) { const cite = (quote: string, row: object) => ({ ...row, message: `${id}-g`, quote }); return [
  cite("You stand in the Dock.", { kind: "place", name: "Dock", entered: true }),
  cite("an open corridor between the Dock and Clinic in both directions", { kind: "place", name: "Clinic" }),
  cite("a locked hatch from the Clinic to the Attic", { kind: "place", name: "Attic" }),
  cite("an open corridor between the Dock and Clinic in both directions", { kind: "route", from: "Dock", to: "Clinic", via: "corridor", status: "open", bidirectional: true }),
  cite("a locked hatch from the Clinic to the Attic", { kind: "route", from: "Clinic", to: "Attic", via: "hatch", status: "blocked", reason: "Locked", bidirectional: false }),
  cite("The supply log lists three free Rations in the Clinic.", { kind: "stock", site: "Clinic", name: "Rations", quantity: 3, available: true }),
  cite("A broken scanner is in the Dock.", { kind: "discovery", site: "Dock", name: "Scanner", text: "Broken scanner" }),
]; }
function helper(c: HelperCall): unknown {
  const entries = JSON.parse(c.user.split(c.system.includes("Determine whether") ? "Scene:\n" : "Messages:\n")[1]), first = entries.find((m: any) => m.content === opening), id = first?.id.slice(0, -2);
  if (c.system.includes("Determine whether")) {
    reads++; const packet = JSON.parse(c.user.split("State:\n")[1].split("\nScene:")[0]), mechanics = packet.mechanics, action = entries.at(-1).content;
    const route = mechanics.routes?.find((r: any) => /Attic/.test(action) ? r.via === "hatch" : r.via === "corridor");
    return { risky: false, contested: false, approach: "movement", mechanicalActions: /take|가져/.test(action) ? [{ kind: "gather", stock: mechanics.stocks[0].id, amount: 2, quote: action }] : route ? [{ kind: "travel", route: route.id, quote: action }] : [] };
  }
  if (offline) throw new Error("Fixture reader offline");
  return { changes: [], ...(id ? { mechanicalObservations: observations(id) } : {}) };
}
async function chat() { const id = `exploration-runtime-${++serial}`; h.chat(id, "", opening); h.characters[`char-${id}`].world_book_ids = []; await syncLiving(id, h.userId); return id; }

test("normal chat travels, collects once across swipes, returns to its lasting change and rejects a locked route", async () => {
  const id = await chat(); expect(currentSite(await state(id))?.name).toBe("Dock");
  await h.say(id, "I walk through the corridor to the Clinic.");
  await h.generate(id, async prompt => { expect(currentSite(await state(id))?.name).toBe("Dock"); expect(JSON.stringify(prompt)).toContain('travel'); return "You enter the Clinic."; });
  expect(currentSite(await state(id))?.name).toBe("Clinic"); expect(latest(id).world.place).toBe("Clinic");
  offline = true; await h.say(id, "I take two Rations."); const first = await h.generate(id, "You collect the two rations.");
  expect((await state(id)).stocks![0].quantity).toBe(1); expect((await state(id)).items[0].quantity).toBe(2);
  const receipt = (first.target.extra.spindle_metadata as any)[MECHANICS_KEY]["0"].receipt, before = reads;
  await h.generate(id, "You put the same two rations in your bag.", "swipe");
  expect(reads).toBe(before); expect((first.target.extra.spindle_metadata as any)[MECHANICS_KEY]["1"].receipt).toEqual(receipt);
  offline = false; await h.say(id, "I return to the Dock through the corridor."); await h.generate(id, "You return to the Dock.");
  expect(currentSite(await state(id))?.name).toBe("Dock"); expect((await state(id)).stocks![0].quantity).toBe(1); expect((await state(id)).discoveries![0].text).toBe("Broken scanner");
  await h.say(id, "I walk to the Clinic."); await h.generate(id, "You enter the Clinic.");
  await h.say(id, "I go through the hatch to the Attic."); await h.generate(id, async prompt => { expect(JSON.stringify(prompt)).toContain("Locked"); return "The hatch is still locked."; });
  expect(currentSite(await state(id))?.name).toBe("Clinic"); expect(latest(id).notice).toContain("blocked");
  expect(h.characters[`char-${id}`].world_book_ids).toEqual([]);
});

test("map questions and prompt previews neither interpret a travel action nor move or deplete anything", async () => {
  const id = await chat(), before = await state(id);
  await h.say(id, "What routes do I know?"); await h.generate(id, "The corridor leads to the Clinic.");
  expect(reads).toBe(0); expect(await state(id)).toEqual(before);
  const prompt = await livingIntercept([{ role: "user", content: "What routes do I know?" }], { chatId: id, userId: h.userId, generationType: "normal", isDryRun: true } as InterceptorContextDTO);
  expect(JSON.stringify(prompt)).toContain("explorationBoundary"); expect(await state(id)).toEqual(before); expect(reads).toBe(0);
});

test("a native original-language travel uses the existing route without requiring a ruleset", async () => {
  const id = await chat(); await h.settings({ decisionConnectionId: "native" });
  h.fake.decisions = { evaluate: async () => ({ answers: { operation: { type: "choice", choice: "travel" }, preparation: { type: "choice", choice: "mechanics" }, roll: { type: "choice", choice: "none" } } }) };
  await h.say(id, "복도를 따라 진료실로 간다."); await h.generate(id, "You enter the Clinic.");
  expect(currentSite(await state(id))?.name).toBe("Clinic"); expect(reads).toBe(1);
});

test("an extraction already running when completion commits cannot erase the receipt or its new supplies", async () => {
  const id = await chat(); await h.say(id, "I walk to the Clinic."); await h.generate(id, "You enter the Clinic.");
  await h.say(id, "I take two Rations.");
  const reply = h.msg(id, `${id}-race`, false, "You collect two Rations. A blue lantern lights the Clinic.");
  const generationId = `${id}-race`; livingStarted({ chatId: id, generationId, targetMessageId: reply.id });
  await livingIntercept([{ role: "user", content: "I take two Rations." }], { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO);
  const original = h.helper; let release!: () => void;
  h.helper = async c => { await new Promise<void>(resolve => { release = resolve; }); return { ...(original(c) as any), mechanicalObservations: [{ kind: "discovery", site: "Clinic", name: "Lantern", text: "Blue lantern", message: reply.id, quote: "A blue lantern lights the Clinic." }] }; };
  const read = syncLiving(id, h.userId, undefined, reply.id); await settle();
  const ended = livingEnded({ chatId: id, generationId, messageId: reply.id }, h.userId); await settle();
  expect((reply.extra.spindle_metadata as any)[MECHANICS_KEY]["0"].receipt.status).toBe("ready");
  release(); await Promise.all([read, ended]);
  expect((await state(id)).stocks![0].quantity).toBe(1); expect((await state(id)).items[0].quantity).toBe(2);
  expect((await state(id)).discoveries?.some(d => d.name === "Lantern")).toBe(true);
  expect((reply.extra.spindle_metadata as any)[MECHANICS_KEY]["0"].receipt.status).toBe("ready");
  livingStopped({ chatId: id, generationId });
});

test("metadata updates to an ordinary player message do not start another scene read", async () => {
  const id = await chat(); await h.say(id, "I walk to the Clinic.");
  const player = h.messages(id).at(-1)!; let extractions = 0;
  const original = h.helper; h.helper = c => { if (!c.system.includes("Determine whether")) extractions++; return original(c); };
  await h.emit("MESSAGE_EDITED", { chatId: id, message: { id: player.id } }); await settle();
  expect(extractions).toBe(0);
  const reply = h.msg(id, `${id}-pending`, false, "");
  livingStarted({ chatId: id, generationId: "metadata-test", targetMessageId: reply.id });
  await livingIntercept([{ role: "user", content: player.content }], { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO);
  await h.emit("MESSAGE_EDITED", { chatId: id, message: { id: player.id } }); await settle();
  expect(extractions).toBe(0); expect(currentSite(await state(id))?.name).toBe("Dock");
  livingStopped({ chatId: id, generationId: "metadata-test" });
});

test("editing the action during narration invalidates its preparation even when the old base balance is unchanged", async () => {
  const id = await chat(); await h.say(id, "I walk to the Clinic."); await h.generate(id, "You enter the Clinic.");
  await h.say(id, "I take two Rations."); const player = h.messages(id).at(-1)!;
  const reply = h.msg(id, `${id}-edited`, false, ""); livingStarted({ chatId: id, generationId: "edit-in-flight", targetMessageId: reply.id });
  await livingIntercept([{ role: "user", content: player.content }], { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO);
  player.content = "I leave the rations alone."; reply.content = "You look at the cabinet.";
  await livingEnded({ chatId: id, generationId: "edit-in-flight", messageId: reply.id }, h.userId);
  expect((await state(id)).stocks![0].quantity).toBe(3); expect((await state(id)).items).toEqual([]);
  expect((reply.extra.spindle_metadata as any)[MECHANICS_KEY]?.["0"]?.receipt).toBeUndefined();
});

test("route-only reads reuse sourced visited scenes without requiring repeated place declarations", async () => {
  const id = `exploration-runtime-${++serial}`;
  h.chat(id, "", "You arrive at B1 사무구역."); h.characters[`char-${id}`].world_book_ids = [];
  const scene = (message: string, place: string, quote: string) => ({ place, present: [], message, quote });
  h.helper = () => ({ scene: scene(`${id}-g`, "B1 사무구역", "You arrive at B1 사무구역."), changes: [] });
  await syncLiving(id, h.userId); expect((await state(id)).places).toBeUndefined();
  for (let i = 0; i < 26; i++) {
    const quiet = h.msg(id, `${id}-quiet-${i}`, false, "You remain in B1 사무구역.");
    h.helper = () => ({ scene: scene(quiet.id, "B1 사무구역", quiet.content), changes: [] });
    await syncLiving(id, h.userId);
  }
  const next = h.msg(id, `${id}-next`, false, "You arrive at B3 연구실 앞.");
  h.helper = () => ({ scene: scene(next.id, "B3 연구실 앞", next.content), changes: [] });
  await syncLiving(id, h.userId); expect((await state(id)).places).toBeUndefined();
  const route = h.msg(id, `${id}-route`, false, "The stairs return to B1 사무구역. The emergency shaft is locked.");
  h.helper = () => ({ mechanicalObservations: [
    { kind: "route", from: "B3 연구실 앞", to: "B1 사무구역", via: "stairs", bidirectional: true, status: "open", message: route.id, quote: "The stairs return to B1 사무구역." },
    { kind: "route", from: "B3 연구실 앞", to: "B1 사무구역", via: "emergency shaft", status: "blocked", reason: "Locked", message: route.id, quote: "The emergency shaft is locked." },
    { kind: "route", from: "B3 연구실 앞", to: "Secret vault", via: "hidden tunnel", status: "open", message: route.id, quote: "The emergency shaft is locked." },
  ] });
  await syncLiving(id, h.userId);
  const after = await state(id);
  expect(after.places?.map(p => p.name)).toEqual(["B1 사무구역", "B3 연구실 앞"]);
  expect(after.places?.every(p => p.visited)).toBe(true);
  expect(currentSite(after)?.name).toBe("B3 연구실 앞");
  expect(currentSite(after)?.source.message).toBe(next.id);
  expect(after.routes?.map(r => r.status)).toEqual(["open", "blocked"]);
  expect(latest(id).retry).toBe(false);
  expect((route.extra.spindle_metadata as any).warpLiving["0"].reads).toContain(route.id);
});

test("preparation recovers visited route endpoints without moving the player before narration", async () => {
  const id = `exploration-runtime-${++serial}`;
  h.chat(id, "", "You stand in the Dock."); h.characters[`char-${id}`].world_book_ids = [];
  h.helper = () => ({ changes: [], scene: { place: "Dock", present: [], message: `${id}-g`, quote: "You stand in the Dock." } });
  await syncLiving(id, h.userId);
  const next = h.msg(id, `${id}-next`, false, "You enter the Clinic. The stairs return to the Dock.");
  h.helper = () => ({ changes: [], scene: { place: "Clinic", present: [], message: next.id, quote: "You enter the Clinic." } });
  await syncLiving(id, h.userId);
  await h.settings({ decisionConnectionId: "native" });
  h.fake.decisions = { evaluate: async () => ({ answers: { operation: { type: "choice", choice: "travel" }, preparation: { type: "choice", choice: "mechanics" }, roll: { type: "choice", choice: "none" } } }) };
  h.helper = c => c.system.includes("Determine whether") ? { risky: false, contested: false, mechanicalActions: [], mechanicalObservations: [
    { kind: "route", from: "Clinic", to: "Dock", via: "stairs", bidirectional: true, status: "open", message: next.id, quote: "The stairs return to the Dock." },
  ] } : { changes: [] };
  await h.say(id, "I look down the stairs before returning to the Dock.");
  await h.generate(id, async () => {
    expect((await state(id)).routes?.length).toBe(1);
    expect(currentSite(await state(id))?.name).toBe("Clinic");
    return "You look down the stairs from the Clinic.";
  });
  expect(currentSite(await state(id))?.name).toBe("Clinic");
});

test("route scene recovery rejects edited historical scenes and hidden card destinations", async () => {
  const id = `exploration-runtime-${++serial}`;
  h.chat(id, "", "You stand in the Dock.");
  h.characters[`char-${id}`].description = "A Secret vault exists under the Clinic.";
  h.characters[`char-${id}`].world_book_ids = [];
  h.helper = () => ({ scene: { place: "Dock", present: [], message: `${id}-g`, quote: "You stand in the Dock." }, changes: [] });
  await syncLiving(id, h.userId);
  h.messages(id)[0].content = "You stand in the Garden.";
  const next = h.msg(id, `${id}-next`, false, "You arrive at the Clinic. A sealed doorway blocks passage.");
  h.helper = () => ({ scene: { place: "Clinic", present: [], message: next.id, quote: "You arrive at the Clinic." }, mechanicalObservations: [
    { kind: "route", from: "Clinic", to: "Dock", via: "doorway", status: "blocked", message: next.id, quote: "A sealed doorway blocks passage." },
    { kind: "route", from: "Clinic", to: "Secret vault", via: "doorway", status: "blocked", message: next.id, quote: "A sealed doorway blocks passage." },
  ] });
  await syncLiving(id, h.userId);
  expect((await state(id)).places?.map(p => p.name)).toEqual(["Clinic"]);
  expect((await state(id)).routes).toBeUndefined();
  expect(currentSite(await state(id))?.name).toBe("Clinic");
});
