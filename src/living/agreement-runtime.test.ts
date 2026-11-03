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
let previous: unknown, serial = 0, reads = 0, extractionDown = false, omitEntity = false, routine = false;
beforeAll(async () => {
  previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake;
  await import("../backend.ts" + "?agreement-runtime-test"); (globalThis as any).spindle = previous;
});
beforeEach(() => {
  previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake;
  h.helper = helper; reads = 0; extractionDown = false; omitEntity = false; routine = false;
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
  if (last.content === cups) mechanicalObservations.push({ kind: "agreement_progress", agreement: "Help at the café", requirement: "clean the cups", message: last.id, quote: cups }, { kind: "reward_ready", agreement: "Help at the café", reward: "Coins", ready: true, ...(routine ? { uncontested: true } : {}), message: last.id, quote: cups });
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

test("one later extraction recovers a missed acceptance and separate completion without an extra helper call", async () => {
  const id = await chat(); extractionDown = true;
  await h.say(id, accept); await h.generate(id, "Jo nods at your agreement.");
  const missedAcceptance = h.messages(id).at(-1)!.id;
  await h.say(id, "I cover the counter."); await h.generate(id, shift);
  const missedCompletion = h.messages(id).at(-1)!.id;
  expect((await state(id)).agreements).toBeUndefined();
  expect(needsMechanicalRead("I collect my pay.", await state(id))).toBe(true);
  extractionDown = false; let backgroundCalls = 0;
  h.helper = c => {
    if (c.system.includes("Determine whether")) return helper(c);
    backgroundCalls++; expect(c.system).toContain("Recover previously unread exchanges");
    const entries = JSON.parse(c.user.split("Messages:\n")[1]);
    expect(entries.some((m: any) => m.id === missedAcceptance)).toBe(true);
    expect(entries.some((m: any) => m.id === missedCompletion)).toBe(true);
    const output = helper(c) as any;
    output.mechanicalObservations.splice(-2, 0, { kind: "agreement_progress", agreement: "Help at the café", requirement: "cover the counter", message: missedCompletion, quote: shift });
    output.mechanicalObservations.reverse(); // Local dependency ordering cannot rely on JSON array order.
    return output;
  };
  await h.say(id, "I clean the cups."); await h.generate(id, cups);
  expect(backgroundCalls).toBe(1);
  const agreement = (await state(id)).agreements![0];
  expect(agreement.requirements.every(r => r.done)).toBe(true);
  expect(agreement.rewards[0].ready?.allowed).toBe(true);
  const record = (await getMessages(id)).at(-1)!.metadata?.warpLiving as any;
  expect(record["0"].reads).toContain(missedAcceptance); expect(record["0"].reads).toContain(missedCompletion);
  expect(latest(id).retry).toBe(false);
  h.helper = helper; await h.say(id, "I collect my pay."); await h.generate(id, "Jo hands over your earned pay.");
  expect((await state(id)).resources.map(r => r.current)).toEqual([10, 13]);
});

test("catching up after a payment preserves its exact saved receipt and does not pay a second time", async () => {
  const id = await chat(); await earn(id); extractionDown = true;
  const evidence = "Jo sets aside 7 Stamps in a tin.";
  await h.say(id, '"Anything else?"'); await h.generate(id, evidence);
  const sourceId = h.messages(id).at(-1)!.id;
  await h.say(id, "I collect my pay."); await h.generate(id, "Jo hands over the earned pay.");
  const target = (await getMessages(id)).at(-1)!, receipt = structuredClone(mechanicalRecordOf(target)!.receipt);
  expect((await state(id)).resources.map(r => r.current)).toEqual([10, 13]);
  extractionDown = false;
  h.helper = c => {
    if (c.system.includes("Determine whether")) return helper(c);
    expect(c.user).toContain(sourceId);
    return { changes: [], mechanicalObservations: [{ kind: "resource", owner: "Jo", name: "Stamps", current: 7, message: sourceId, quote: evidence }] };
  };
  await syncLiving(id, h.userId);
  expect(mechanicalRecordOf((await getMessages(id)).at(-1)!)?.receipt).toEqual(receipt);
  expect((await state(id)).resources.map(r => r.current)).toEqual([10, 13, 7]);
  expect((await state(id)).agreements![0].rewards[0].paid).toBeDefined();
  await syncLiving(id, h.userId);
  expect((await state(id)).resources.map(r => r.current)).toEqual([10, 13, 7]);
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

test("a fresh routine reward skips the pre-read, preserves preparation/commit, and reuses its receipt on another swipe", async () => {
  routine = true; const id = await chat(); await earn(id);
  expect((await state(id)).agreements![0].rewards[0].ready?.uncontested).toBe(true);
  const previousReads = reads;
  h.helper = c => { if (c.system.includes("Determine whether")) throw new Error("A routine collection must not call the interpreter"); return helper(c); };
  await h.say(id, "I collect my pay.");
  await h.generate(id, async prompt => {
    expect(reads).toBe(previousReads);
    expect((await state(id)).resources.map(r => r.current)).toEqual([20, 3]);
    expect(JSON.stringify(prompt)).toContain('\\"kind\\":\\"reward\\"');
    return "Jo hands you the agreed pay.";
  });
  const after = await state(id);
  expect(after.resources.map(r => r.current)).toEqual([10, 13]);
  expect(latest(id).notice).toBeUndefined();
  await h.generate(id, "Jo passes over the promised Coins.", "swipe");
  expect(await state(id)).toEqual(after); expect(reads).toBe(previousReads);
});

test("a cancelled local collection spends nothing and its retry can commit even when later extraction fails", async () => {
  routine = true; const id = await chat(); await earn(id); await h.say(id, "I collect my pay.");
  const target = h.msg(id, `${id}-local-partial`, false, ""), previousReads = reads;
  livingStarted({ chatId: id, generationId: "local-stopped", targetMessageId: target.id });
  const history = await getMessages(id);
  await livingIntercept(history.map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id })), { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO);
  livingStopped({ chatId: id, generationId: "local-stopped" }); await livingEnded({ chatId: id, generationId: "local-stopped", messageId: target.id }, h.userId);
  expect((await state(id)).resources.map(r => r.current)).toEqual([20, 3]);
  h.messages(id).pop(); extractionDown = true; await h.generate(id, "Jo hands over the agreed pay.");
  expect((await state(id)).resources.map(r => r.current)).toEqual([10, 13]);
  expect(reads).toBe(previousReads); expect(latest(id).retry).toBe(true);
});

test("a routine offer followed by another event still invokes interpretation before collection", async () => {
  routine = true; const id = await chat(); await earn(id);
  await h.say(id, '"Hello."'); await h.generate(id, "Jo turns toward a new customer.");
  const previousReads = reads; await h.say(id, "I collect my pay."); await h.generate(id, "Jo returns to the payment.");
  expect(reads).toBe(previousReads + 1);
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
test("captured Flash output recovers a missed acceptance and binds short dialogue citations to their actual named paragraphs", async () => {
  const data = await Bun.file(new URL("./fixtures/cafe-flash-citations.json", import.meta.url)).json();
  const id = "live-flash-citations"; h.chat(id, "", data.greeting); h.characters[`char-${id}`].world_book_ids = [];
  let preReads = 0;
  h.helper = c => {
    if (c.system.includes("Determine whether")) { preReads++; return { risky: false, contested: false }; }
    const entries = JSON.parse(c.user.split("Messages:\n")[1]), last = entries.at(-1).content;
    if (last === data.turns[0].reply) throw new Error("A missed first read");
    return last === data.greeting ? data.bootstrap : data.turns.find((t: any) => t.reply === last)?.extraction ?? { changes: [] };
  };
  // Use the actual captured message IDs; they are part of the evidence, not substituted quotes.
  h.messages(id)[0].id = "live-agreement-g";
  await syncLiving(id, h.userId);
  for (const [i, turn] of data.turns.entries()) {
    await h.say(id, turn.player); h.messages(id).at(-1)!.id = `live-agreement-u${i * 2 + 1}`;
    const reply = h.msg(id, `live-agreement-r${i * 2 + 2}`, false, turn.reply);
    await syncLiving(id, h.userId, undefined, reply.id);
  }
  const before = await state(id), agreement = before.agreements![0];
  expect(agreement.requirements.every(r => r.done)).toBe(true); expect(agreement.rewards[0].ready?.uncontested).toBe(true);
  expect(agreement.offer!.quote).toContain("Jo says");
  expect(agreement.rewards[0].ready!.source.quote).toContain("Jo sets");
  expect(latest(id).retry).toBe(false);
  await h.say(id, data.claim); await h.generate(id, "Jo hands over the earned Coins.");
  expect(preReads).toBe(0); expect((await state(id)).resources.map(r => r.current)).toEqual([10, 13]);
  expect((await state(id)).agreements![0].rewards[0].paid).toBeDefined();
});

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
