import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { makeHost, type HelperCall } from "../backend/test-host.js";
import { getMessages } from "../backend/ledger.js";
import { livingStarted, livingStopped, livingEnded, livingIntercept, syncLiving, needsMechanicalRead, livingSwipeDeleted } from "./runtime.js";
import { foldMechanics, MECHANICS_KEY } from "./mechanical-history.js";
import type { InterceptorContextDTO } from "lumiverse-spindle-types";

const h = makeHost("mechanical-runtime-owner", false);
let previous: unknown, serial = 0, reads = 0, extractionDown = false;
const greeting = "Jo waits in the café. You have 20 coins and three bandages. Your ankle is injured until treated.";
beforeAll(async () => {
  previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake;
  await import("../backend.ts" + "?mechanical-runtime-test"); (globalThis as any).spindle = previous;
});
beforeEach(() => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; h.helper = helper; reads = 0; extractionDown = false; });
afterEach(() => { (globalThis as any).spindle = previous; });
const latest = (id: string) => [...h.sent].reverse().find(m => m.type === "living" && m.chatId === id);
const state = async (id: string) => foldMechanics(await getMessages(id));
async function chat() {
  const id = `mechanical-runtime-${++serial}`; h.chat(id, "", greeting); h.characters[`char-${id}`].world_book_ids = [];
  await syncLiving(id, h.userId); return id;
}
function helper(c: HelperCall): unknown {
  if (c.system.includes("Determine whether")) {
    reads++;
    const content = JSON.parse(c.user.split("Scene:\n")[1]).at(-1).content as string;
    const operation = content.includes("pay") ? { kind: "spend", resource: "cash", amount: 5, quote: "I pay 5 coins." }
      : content.includes("bandage") ? { kind: "consume", item: "bandages", amount: content.includes("four") ? 4 : 1, quote: content }
      : undefined;
    if (content.includes("vault")) return { risky: true, contested: true, tier: "uncertain", approach: "movement", intent: "Vault the wall", stakes: "Exposure", reasons: ["The wall is guarded"] };
    return { risky: false, contested: false, approach: "other", mechanicalActions: operation ? [operation] : [] };
  }
  if (extractionDown) throw new Error("Reader offline");
  const messages = JSON.parse(c.user.split("Messages:\n")[1]) as { id: string; content: string }[];
  const original = messages.find(m => m.content === greeting);
  return { changes: [], ...(original ? { mechanicalObservations: [
    { kind: "resource", id: "cash", owner: "you", name: "Coins", current: 20, message: original.id, quote: "You have 20 coins" },
    { kind: "item", id: "bandages", owner: "you", name: "Bandages", quantity: 3, message: original.id, quote: "three bandages" },
    { kind: "condition", id: "ankle", owner: "you", name: "Injured ankle", hinders: ["movement"], blocks: [], helps: [], ending: "until treated", message: original.id, quote: "Your ankle is injured until treated." },
  ] } : {}) };
}

test("ordinary chat gains explicit mechanical state without a rulebook or fantasy meters", async () => {
  const id = await chat(), initial = await state(id);
  expect(initial.resources.map(r => r.name)).toEqual(["Coins"]);
  expect(initial.items[0].quantity).toBe(3);
  expect(latest(id).world.mechanics.resources[0].current).toBe(20);
  expect(h.characters[`char-${id}`].world_book_ids).toEqual([]);
  await h.say(id, "I pay 5 coins.");
  const first = await h.generate(id, async prompt => {
    expect((await state(id)).resources[0].current).toBe(20); // reserved, not committed mid-generation
    expect(JSON.stringify(prompt)).toContain("Mechanical receipt");
    return "Jo accepts the payment.";
  });
  expect((await state(id)).resources[0].current).toBe(15);
  expect(latest(id).notes).toContain("Coins: 15");
  const receipt = (first.target.extra.spindle_metadata as any)[MECHANICS_KEY]["0"].receipt;
  await h.generate(id, "Jo takes the coins with a nod.", "swipe");
  expect((await state(id)).resources[0].current).toBe(15);
  expect(reads).toBe(1);
  expect((first.target.extra.spindle_metadata as any)[MECHANICS_KEY]["1"].receipt).toEqual(receipt);
});

test("completed spending survives failed extraction and reload projection", async () => {
  const id = await chat(); await h.say(id, "I use a bandage."); extractionDown = true;
  await h.generate(id, "You bind the wound.");
  expect((await state(id)).items[0].quantity).toBe(2);
  expect(latest(id).retry).toBe(true);
  expect(latest(id).notes).toContain("Bandages: 2 left");
  extractionDown = false; await syncLiving(id, h.userId);
  expect((await state(id)).items[0].quantity).toBe(2); // repeated bootstrap quote cannot refill it
});

test("a rejected stack use spends nothing and the narrator receives the rejection", async () => {
  const id = await chat(); await h.say(id, "I use four bandages.");
  await h.generate(id, async prompt => {
    expect(JSON.stringify(prompt)).toContain('blocked');
    return "You do not have four bandages.";
  });
  expect((await state(id)).items[0].quantity).toBe(3);
  expect(latest(id).notice).toContain("spent nothing");
});

test("an interrupted preparation spends nothing and can be reused on retry", async () => {
  const id = await chat(); await h.say(id, "I pay 5 coins.");
  const target = h.msg(id, `${id}-partial`, false, "");
  livingStarted({ chatId: id, generationId: "stopped", targetMessageId: target.id });
  const history = await getMessages(id);
  await livingIntercept(history.map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id })), { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO);
  livingStopped({ chatId: id, generationId: "stopped" });
  await livingEnded({ chatId: id, generationId: "stopped", messageId: target.id }, h.userId);
  expect((await state(id)).resources[0].current).toBe(20);
  h.messages(id).pop(); // disposable staged empty reply, as the host does on cancellation
  await h.generate(id, "Jo accepts the coins.");
  expect((await state(id)).resources[0].current).toBe(15);
  expect(reads).toBe(1);
});

test("a dry-run preserves the already prepared mechanical prompt without calls or spending", async () => {
  const id = await chat(); await h.say(id, "I pay 5 coins.");
  const target = h.msg(id, `${id}-preview`, false, "");
  livingStarted({ chatId: id, generationId: "preview", targetMessageId: target.id });
  const history = await getMessages(id), messages = history.map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id }));
  const context = { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO;
  const actual = await livingIntercept(messages, context);
  const calls = h.counts.helper, before = structuredClone(h.messages(id));
  const preview = await livingIntercept(messages, { ...context, isDryRun: true });
  expect(preview).toEqual(actual);
  expect(h.counts.helper).toBe(calls);
  expect(h.messages(id)).toEqual(before);
  expect((await state(id)).resources[0].current).toBe(20);
  livingStopped({ chatId: id, generationId: "preview" });
});

test("a movement injury changes an attempt's saved tier, without a social penalty", async () => {
  const id = await chat(); await h.say(id, "I try to vault the wall.");
  const result = await h.generate(id, "You approach the wall.");
  const decision = (result.target.extra.spindle_metadata as any).warpLiving["0"].decision;
  expect(decision.tier).toBe("outmatched");
  expect(decision.reasons).toContain("Injured ankle");
  const before = reads; await h.say(id, '"Hello, Jo."'); await h.generate(id, "Jo smiles.");
  expect(reads).toBe(before);
});

test("a supported blocking condition prevents the roll and sends a blocked receipt to the narrator", async () => {
  h.helper = c => {
    const result = helper(c) as any;
    if (result.mechanicalObservations) result.mechanicalObservations = result.mechanicalObservations.map((o: any) => o.kind === "condition" ? { ...o, blocks: ["movement"] } : o);
    return result;
  };
  const id = await chat(); await h.say(id, "I try to vault the wall.");
  await h.generate(id, async prompt => {
    expect(JSON.stringify(prompt)).toContain("blocked by Injured ankle");
    return "You cannot attempt the jump in this condition.";
  });
  expect(latest(id).decision ?? null).toBeNull();
  expect((await state(id)).resources[0].current).toBe(20);
});

test("incomplete mechanical interpretation is visibly unresolved and spends nothing", async () => {
  const id = await chat(); h.helper = c => c.system.includes("Determine whether") ? { risky: false, contested: false } : helper(c);
  await h.say(id, "I use a bandage.");
  await h.generate(id, async prompt => {
    expect(JSON.stringify(prompt)).toContain("Mechanical action unresolved");
    return "The action has not been resolved.";
  });
  expect((await state(id)).items[0].quantity).toBe(3);
  expect(latest(id).notice).toContain("No mechanical cost was paid");
});

test("swipe deletion projects the remaining receipt once and history edits drop stale balances", async () => {
  const id = await chat(); await h.say(id, "I pay 5 coins.");
  const first = await h.generate(id, "You pay Jo."); await h.generate(id, "Jo receives the payment.", "swipe");
  first.target.swipes.splice(0, 1); first.target.swipe_dates.splice(0, 1); first.target.swipe_id = 0;
  await livingSwipeDeleted(id, first.target.id, 0);
  expect((await state(id)).resources[0].current).toBe(15);
  h.messages(id).find(m => m.is_user)!.content = "I keep my money.";
  expect((await state(id)).resources).toEqual([]);
});

test("read-only questions and OOC edits do not execute item/resource actions", () => {
  expect(needsMechanicalRead("How many bandages can I use?")).toBe(false);
  expect(needsMechanicalRead("Show my inventory.")).toBe(false);
  expect(needsMechanicalRead("(OOC: use shorter replies)")).toBe(false);
  expect(needsMechanicalRead("I use a bandage.")).toBe(true);
});

test("an existing inventory does not turn an affectionate gesture into an extra mechanical read", async () => {
  const id = await chat(); await h.say(id, "I give Jo a warm smile.");
  await h.generate(id, "Jo smiles back.");
  expect(reads).toBe(0);
  expect((await state(id)).resources[0].current).toBe(20);
  expect((await state(id)).items[0].quantity).toBe(3);
});
