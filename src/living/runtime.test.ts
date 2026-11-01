import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { makeHost, settle, type HelperCall } from "../backend/test-host.js";
import { livingEnded, livingIntercept, livingStarted, livingStopped, livingSwipeDeleted, needsAttemptRead, repairLiving, syncLiving } from "./runtime.js";
import type { InterceptorContextDTO } from "lumiverse-spindle-types";

const h = makeHost("living-runtime-user", false);
let previous: unknown, serial = 0;
const greeting = "Jo waits in the café. You own a distinctive jacket.";
beforeAll(async () => {
  previous = (globalThis as any).spindle;
  (globalThis as any).spindle = h.fake;
  await import("../backend.ts" + "?living-runtime-test");
  (globalThis as any).spindle = previous;
});
beforeEach(() => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; h.helper = extract; });
afterEach(() => { (globalThis as any).spindle = previous; });
function chat() {
  const id = `living-runtime-${++serial}`;
  h.chat(id, "name: unused", greeting);
  h.characters[`char-${id}`].world_book_ids = [];
  return id;
}
function extract(c: HelperCall): unknown {
  if (c.system.includes("Determine whether")) return { risky: false, contested: false };
  if (c.system.includes("Suggest up to")) return { ideas: ["I ask Jo what is troubling her."] };
  const entries = JSON.parse(c.user.split("Messages:\n")[1] ?? "[]") as { id: string; content: string }[];
  const first = entries[0], last = entries.at(-1)!;
  return {
    scene: { place: "The café", present: ["Jo"], message: first.id, quote: "Jo waits in the café." },
    changes: last.content.includes("Dex takes")
      ? [{ op: "transfer", id: "jacket", from: "you", to: "Dex", message: last.id, quote: "Dex takes the jacket." }]
      : [{ op: "put", id: "jacket", kind: "possession", subject: "jacket", holder: "you", text: "Distinctive jacket", message: first.id, quote: "You own a distinctive jacket." }],
  };
}
const latest = (id: string) => [...h.sent].reverse().find(m => m.type === "living" && m.chatId === id);

test("install-and-play: no ruleset install, no scores, no invented clock", async () => {
  const id = chat(), books = Object.keys(h.books);
  await syncLiving(id, h.userId);
  const state = latest(id);
  expect(state.world.place).toBe("The café");
  expect(state.world.facts[0].holder).toBe("you");
  expect(state.world.clock).toBeUndefined();
  expect(state.world.relStats).toBeUndefined();
  expect(h.characters[`char-${id}`].world_book_ids).toEqual([]);
  expect(Object.keys(h.books)).toEqual(books);
});

test("existing rulebooks are preserved but do not put the default back into the old tracker", async () => {
  const id = `living-existing-${++serial}`;
  h.chat(id, "name: Old rules\nstyle: story\nrelationships: { stats: { affection: { start: 90 } } }", greeting);
  const original = structuredClone(h.books[`book-${id}`]);
  await h.frontend({ type: "hello", chatId: id }); await settle();
  expect(latest(id)?.world.place).toBe("The café");
  expect(latest(id)?.world.relStats).toBeUndefined();
  expect(h.books[`book-${id}`]).toEqual(original);
  expect(h.sent.some(m => m.type === "state" && m.chatId === id)).toBe(false);
});

test("the actual registered generation path commits transfers and injects their consequences", async () => {
  const id = chat();
  await syncLiving(id, h.userId);
  await h.say(id, "I lend Dex my jacket and ask Jo to cover for me.");
  const generated = await h.generate(id, "Dex takes the jacket. Jo watches him leave.");
  expect(latest(id).world.facts.find((f: any) => f.id === "jacket").holder).toBe("Dex");
  expect((generated.target.extra.spindle_metadata as any).warpLiving["0"].events).toHaveLength(1);
  const preview = await h.interceptor([{ role: "user", content: "What now?" }], { chatId: id, userId: h.userId, generationType: "normal", isDryRun: true });
  expect(JSON.stringify(preview)).toContain('\\"holder\\":\\"Dex\\"');
  expect(JSON.stringify(preview)).toContain("Let prior choices");
});

test("a stopped extraction cannot publish later, even if the provider ignores abort", async () => {
  const id = chat();
  await syncLiving(id, h.userId);
  await h.say(id, "I lend Dex my jacket.");
  const target = h.msg(id, `${id}-delayed`, false, "Dex takes the jacket.");
  let release!: () => void;
  h.helper = async c => { await new Promise<void>(r => { release = r; }); return extract(c); };
  livingStarted({ chatId: id, generationId: "delayed", targetMessageId: target.id });
  const completion = livingEnded({ chatId: id, generationId: "delayed", messageId: target.id }, h.userId);
  await settle();
  livingStopped({ chatId: id, generationId: "delayed" });
  await completion;
  release(); await settle();
  expect((target.extra.spindle_metadata as any)?.warpLiving).toBeUndefined();
});

test("a dry-run prompt preview does not make helper calls or prepare outcomes", async () => {
  const id = chat(); await syncLiving(id, h.userId);
  h.resetCounts();
  await livingIntercept([{ role: "user", content: "I try to vault the wall." }], { chatId: id, userId: h.userId, generationType: "normal", isDryRun: true } as InterceptorContextDTO);
  expect(h.counts.helper).toBe(0);
});

test("dialogue skips the pre-read while action following dialogue can still be judged", () => {
  expect(needsAttemptRead('"How have you been?"')).toBe(false);
  expect(needsAttemptRead('"Hello," I say, smiling.')).toBe(false);
  expect(needsAttemptRead('"Look away," I whisper. I try to vault the wall.')).toBe(true);
  expect(needsAttemptRead("(OOC: make the reply shorter please)")).toBe(false);
});

test("swipes reuse the prepared attempt rather than asking for a more favorable interpretation", async () => {
  const id = chat(); await syncLiving(id, h.userId);
  let reads = 0;
  h.helper = c => {
    if (c.system.includes("Determine whether")) { reads++; return { risky: true, contested: true, tier: "uncertain", intent: "Vault the wall", stakes: "The guard may hear", reasons: ["The guard is nearby"] }; }
    return extract(c);
  };
  await h.say(id, "I try to vault the wall before the guard sees me.");
  const first = await h.generate(id, "You move toward the wall.");
  const firstDecision = (first.target.extra.spindle_metadata as any).warpLiving["0"].decision;
  await h.generate(id, "You move toward the wall differently.", "swipe");
  const alternate = (first.target.extra.spindle_metadata as any).warpLiving["1"].decision;
  expect(reads).toBe(1);
  expect(alternate).toEqual(firstDecision);
  expect(alternate.intent).toBe("Vault the wall");
});

test("a source edited far outside the recent window can be repaired in place", async () => {
  const id = chat(); await syncLiving(id, h.userId);
  const source = h.messages(id)[0];
  for (let i = 0; i < 30; i++) h.msg(id, `${id}-f${i}`, false, "They talk quietly about the rain.");
  source.content = "Jo waits in the café. You own a red scarf.";
  h.helper = c => {
    const entries = JSON.parse(c.user.split("Messages:\n")[1] ?? "[]");
    const target = entries.find((m: any) => m.id === source.id);
    expect(target.content).toContain("red scarf");
    return { changes: [{ op: "put", id: "scarf", kind: "possession", subject: "scarf", holder: "you", text: "Red scarf", message: source.id, quote: "You own a red scarf." }] };
  };
  await repairLiving(id, source.id, h.userId);
  expect(latest(id).world.facts.map((f: any) => f.id)).toEqual(["scarf"]);
});

test("deleting an earlier swipe retains the later swipe's own record", async () => {
  const id = chat(); await syncLiving(id, h.userId);
  await h.say(id, "I try to vault the wall before anyone sees me.");
  const { target } = await h.generate(id, "The evening is quiet.");
  await h.generate(id, "Dex takes the jacket.", "swipe");
  const oldRecord = (target.extra.spindle_metadata as any).warpLiving["1"];
  target.swipes.splice(0, 1); target.swipe_dates.splice(0, 1); target.swipe_id = 0;
  await livingSwipeDeleted(id, target.id, 0);
  expect((target.extra.spindle_metadata as any).warpLiving["0"]).toEqual(oldRecord);
  expect((target.extra.spindle_metadata as any).warpLiving["1"]).toBeUndefined();
});

test("native decision profiles route attempt reads and fall back when unavailable", async () => {
  const previous = (h.fake as any).decisions;
  let native = 0, helper = 0;
  (h.fake as any).decisions = { evaluate: async () => { native++; return { answers: { roll: { type: "choice", choice: "none" } } }; } };
  await h.settings({ decisionConnectionId: "native-profile" });
  h.helper = c => { if (c.system.includes("Determine whether")) helper++; return extract(c); };
  try {
    const id = chat(); await h.say(id, "I try to vault the wall."); await h.generate(id, "You move toward the wall.");
    expect(native).toBe(1); expect(helper).toBe(0);
    (h.fake as any).decisions.evaluate = async () => { throw new Error("Unavailable profile"); };
    const next = chat(); await h.say(next, "I try to vault the wall."); await h.generate(next, "You move toward the wall.");
    expect(helper).toBe(1);
  } finally { await h.settings({ decisionConnectionId: "" }); (h.fake as any).decisions = previous; }
});

test("production interceptor persists snapshots and extends the prior prompt without changing it", async () => {
  const { getMessages } = await import("../backend/ledger.js");
  const id = chat(); await syncLiving(id, h.userId); await h.say(id, '"Hello, Jo."');
  const promptFor = async () => (await getMessages(id)).map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id }));
  const context = { chatId: id, userId: h.userId, generationType: "normal", signal: new AbortController().signal } as InterceptorContextDTO;
  const first = await livingIntercept(await promptFor(), context);
  const player = (await getMessages(id)).at(-1)!;
  expect(player.metadata?.warpLivingPrompt).toBeDefined();
  h.msg(id, `${id}-reply`, false, "Jo nods."); await h.say(id, '"How are you?"');
  const second = await livingIntercept(await promptFor(), context);
  expect(second.slice(0, first.length)).toEqual(first);
  expect(second[first.length].content).toBe("Jo nods.");
  const repeated = await livingIntercept(await promptFor(), context);
  expect(repeated).toEqual(second);
  const before = structuredClone((await getMessages(id)).at(-1)!.metadata);
  await livingIntercept(await promptFor(), { ...context, isDryRun: true });
  expect((await getMessages(id)).at(-1)!.metadata).toEqual(before);
});
