import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import type { InterceptorContextDTO } from "lumiverse-spindle-types";
import { makeHost, type HelperCall } from "../backend/test-host.js";
import { getMessages } from "../backend/ledger.js";
import { syncLiving, livingStarted, livingStopped, livingEnded, livingIntercept, needsMechanicalRead } from "./runtime.js";
import { foldMechanics, mechanicalRecordOf } from "./mechanical-history.js";

const h = makeHost("agreement-runtime-owner", false);
const greeting = "Jo waits in the café. Jo has 20 Coins. You have 3 Coins. Jo says, 'If you cover the counter and clean the cups, I will give you 10 Coins.'";
const accept = "I accept. I will cover the counter and clean the cups.";
const shift = "You finish covering the counter.";
const cups = "You finish cleaning the cups. Jo holds out the promised 10 Coins.";
let previous: unknown, serial = 0, reads = 0, extractionDown = false, omitEntity = false;
beforeAll(async () => {
  previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake;
  await import("../backend.ts" + "?agreement-runtime-test"); (globalThis as any).spindle = previous;
});
beforeEach(() => {
  previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake;
  h.helper = helper; reads = 0; extractionDown = false; omitEntity = false;
  h.fake.world_books.getActivated = async () => [];
});
afterEach(() => { (globalThis as any).spindle = previous; });
const state = async (id: string) => foldMechanics(await getMessages(id));
const latest = (id: string) => [...h.sent].reverse().find(m => m.type === "living" && m.chatId === id);
async function chat() {
  const id = `agreement-runtime-${++serial}`; h.chat(id, "", greeting); h.characters[`char-${id}`].world_book_ids = [];
  await syncLiving(id, h.userId); return id;
}
function helper(c: HelperCall): unknown {
  if (c.system.includes("Determine whether")) {
    reads++;
    const entries = JSON.parse(c.user.split("Scene:\n")[1]), action = entries.at(-1).content;
    return { risky: false, contested: false, approach: "other", mechanicalActions: /collect/.test(action) ? [{ kind: "claim", agreement: "Help at the café", reward: "Coins", quote: action }] : [] };
  }
  if (extractionDown) throw new Error("Fixture scene read offline");
  const entries = JSON.parse(c.user.split("Messages:\n")[1]), opening = entries.find((m: any) => m.content === greeting), acceptance = entries.find((m: any) => m.content === accept), last = entries.at(-1);
  const mechanicalObservations: any[] = [
    { kind: "entity", name: "Jo", entityKind: "person", present: true, message: opening.id, quote: "Jo waits in the café." },
    { kind: "resource", owner: "Jo", name: "Coins", role: "money", current: 20, message: opening.id, quote: "Jo has 20 Coins." },
    { kind: "resource", owner: "you", name: "Coins", role: "money", current: 3, message: opening.id, quote: "You have 3 Coins." },
  ];
  if (acceptance) mechanicalObservations.push({ kind: "agreement", owner: "you", name: "Help at the café", from: "Jo", offer: { message: opening.id, quote: "Jo says, 'If you cover the counter and clean the cups, I will give you 10 Coins.'" }, requirements: ["cover the counter", "clean the cups"].map(quote => ({ message: opening.id, quote })), rewards: [{ kind: "resource", asset: "Coins", amount: 10, message: opening.id, quote: "10 Coins" }], message: acceptance.id, quote: accept });
  if (last.content === shift) mechanicalObservations.push({ kind: "agreement_progress", agreement: "Help at the café", requirement: "cover the counter", message: last.id, quote: shift });
  if (last.content === cups) mechanicalObservations.push({ kind: "agreement_progress", agreement: "Help at the café", requirement: "clean the cups", message: last.id, quote: cups }, { kind: "reward_ready", agreement: "Help at the café", reward: "Coins", ready: true, message: last.id, quote: cups });
  return { changes: [], ...(omitEntity ? { scene: { place: "Café", present: last.content === "Jo leaves the café." ? [] : ["Jo"], message: last.content === "Jo leaves the café." ? last.id : opening.id, quote: last.content === "Jo leaves the café." ? last.content : "Jo waits in the café." } } : {}), mechanicalObservations: omitEntity ? mechanicalObservations.filter(o => o.kind !== "entity") : mechanicalObservations };
}
async function earn(id: string) {
  await h.say(id, accept); await h.generate(id, "Jo nods at your agreement.");
  await h.say(id, "I cover the counter."); await h.generate(id, shift);
  await h.say(id, "I clean the cups."); await h.generate(id, cups);
}

test("ordinary chat prepares an accepted multi-part promise, shows progress, and pays its actual offered reward before narration", async () => {
  const id = await chat(); expect((await state(id)).agreements).toBeUndefined();
  await earn(id);
  expect(latest(id).notes).toContain("Help at the café · 2/2 done");
  const before = await state(id); expect(before.agreements![0].rewards[0].ready?.allowed).toBe(true);
  expect(needsMechanicalRead("I collect my pay.", before)).toBe(true);
  expect(needsMechanicalRead("How much would I collect?", before)).toBe(false);
  await h.say(id, "I collect my pay.");
  await h.generate(id, async prompt => {
    expect((await state(id)).resources.map(r => r.current)).toEqual([20, 3]);
    expect(JSON.stringify(prompt)).toContain('\\"kind\\":\\"reward\\"');
    return "Jo hands over your earned pay.";
  });
  const after = await state(id);
  expect(after.resources.map(r => r.current)).toEqual([10, 13]);
  expect(after.agreements![0].rewards[0].paid).toBeDefined();
  expect(latest(id).decision).toBeFalsy();
  expect(latest(id).notes.some((s: string) => s.includes("Coins: 13"))).toBe(true);
  expect(h.characters[`char-${id}`].world_book_ids).toEqual([]);
  const count = reads; await h.generate(id, "Jo passes the agreed coins across the counter.", "swipe");
  expect(await state(id)).toEqual(after); expect(reads).toBe(count);
  await h.say(id, "I collect my pay."); await h.generate(id, "Jo points out that she already paid you.");
  expect((await state(id)).resources.map(r => r.current)).toEqual([10, 13]);
  expect(latest(id).notice).toContain("already received");
});

test("stopping a prepared reward pays nobody; retry reuses the plan and extraction failure cannot erase a completed payment", async () => {
  const id = await chat(); await earn(id); await h.say(id, "I collect my pay.");
  const target = h.msg(id, `${id}-partial`, false, "");
  livingStarted({ chatId: id, generationId: "stopped-reward", targetMessageId: target.id });
  const history = await getMessages(id);
  await livingIntercept(history.map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id })), { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO);
  expect((await state(id)).resources.map(r => r.current)).toEqual([20, 3]);
  livingStopped({ chatId: id, generationId: "stopped-reward" }); await livingEnded({ chatId: id, generationId: "stopped-reward", messageId: target.id }, h.userId);
  expect((await state(id)).agreements![0].rewards[0].paid).toBeUndefined();
  const count = reads; h.messages(id).pop(); extractionDown = true;
  await h.generate(id, "Jo hands over the earned coins.");
  expect((await state(id)).resources.map(r => r.current)).toEqual([10, 13]);
  expect(reads).toBe(count); expect(latest(id).retry).toBe(true);
  expect(mechanicalRecordOf((await getMessages(id)).at(-1)!)?.receipt?.status).toBe("ready");
});

test("a completion swipe that leaves one requirement unfinished makes collection unavailable", async () => {
  const id = await chat(); await earn(id);
  await h.generate(id, "Some cups are still dirty; the work is not done.", "swipe");
  const agreement = (await state(id)).agreements![0];
  expect(agreement.requirements.filter(r => r.done)).toHaveLength(1);
  expect(agreement.rewards[0].ready).toBeUndefined();
  await h.say(id, "I collect my pay."); await h.generate(id, "Jo asks you to finish the cups first.");
  expect((await state(id)).resources.map(r => r.current)).toEqual([20, 3]);
  expect(latest(id).notice).toContain("not all fulfilled");
});

test("a normal sourced cast supplies payment identity without an entity setup, and a later departure blocks collection", async () => {
  omitEntity = true; const id = await chat(); await earn(id);
  expect((await state(id)).entities?.find(e => e.name === "Jo")?.present).toBe(true);
  await h.say(id, '"See you later, Jo."'); await h.generate(id, "Jo leaves the café.");
  expect((await state(id)).entities?.find(e => e.name === "Jo")?.present).toBe(false);
  await h.say(id, "I collect my pay."); await h.generate(id, "Jo is still outside.");
  expect((await state(id)).resources.map(r => r.current)).toEqual([20, 3]);
  expect(latest(id).notice).toContain("not made this exchange available");
});

test("a saved setback while an established guard obstructs collection does not pay or settle the reward", async () => {
  let exercised = false;
  for (let sample = 0; sample < 8 && !exercised; sample++) {
    const id = await chat(); await earn(id);
    await h.say(id, "I wait."); await h.generate(id, "An alert guard grabs your wrist before you can reach the offered pay.");
    h.helper = c => c.system.includes("Determine whether") ? { risky: true, contested: true, tier: "outmatched", approach: "movement", intent: "Reach the offered pay", stakes: "Your hand is stopped", reasons: ["The guard is already holding your wrist"], mechanicalActions: [{ kind: "claim", agreement: "Help at the café", reward: "Coins", quote: "I try to collect my pay." }] } : helper(c);
    await h.say(id, "I try to collect my pay."); await h.generate(id, "The attempt is resolved.");
    const decision = latest(id).decision;
    if (decision?.result === "setback") {
      exercised = true;
      expect((await state(id)).resources.map(r => r.current)).toEqual([20, 3]);
      expect((await state(id)).agreements![0].rewards[0].paid).toBeUndefined();
      expect(mechanicalRecordOf((await getMessages(id)).at(-1)!)?.receipt?.beats?.some(b => b.kind === "reward")).toBe(false);
    }
    h.helper = helper;
  }
  expect(exercised).toBe(true);
});

const live = await Bun.file(new URL("./fixtures/cafe-agreement.json", import.meta.url)).json() as { greeting: string; bootstrap: unknown; turns: { player: string; reply: string; extraction: unknown }[]; claim: string; claimRead: unknown };
test("captured live café output collects a fully earned reward using scene presence even when the model emits no mechanical entity", async () => {
  const id = "live-agreement"; h.chat(id, "", live.greeting); h.characters[`char-${id}`].world_book_ids = [];
  h.helper = c => {
    if (c.system.includes("Determine whether")) return c.user.includes(live.claim) ? live.claimRead : { risky: false, contested: false };
    const entries = JSON.parse(c.user.split("Messages:\n")[1]), last = entries.at(-1).content;
    return last === live.greeting ? live.bootstrap : live.turns.find(t => t.reply === last)?.extraction ?? { changes: [] };
  };
  await syncLiving(id, h.userId);
  for (const turn of live.turns) { await h.say(id, turn.player); await h.generate(id, turn.reply); }
  const before = await state(id);
  expect(before.agreements![0].requirements.every(r => r.done)).toBe(true);
  expect(before.entities?.find(e => e.name === "Jo")?.present).toBe(true);
  await h.say(id, live.claim); await h.generate(id, "Jo hands over the earned Coins.");
  expect((await state(id)).resources.map(r => r.current)).toEqual([10, 13]);
  expect((await state(id)).agreements![0].rewards[0].paid).toBeDefined();
  expect(latest(id).notice).toBeUndefined();
});
