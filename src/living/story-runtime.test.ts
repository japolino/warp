import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { makeHost, settle, type HelperCall } from "../backend/test-host.js";
import { getMessages } from "../backend/ledger.js";
import { livingIntercept, livingStarted, livingStopped, repairLiving, syncLiving } from "./runtime.js";
import { foldMechanics } from "./mechanical-history.js";
import { rawPathOf, resolveAttempt } from "./world.js";
import { STORY_BINDINGS } from "./story-text.js";
import type { InterceptorContextDTO } from "lumiverse-spindle-types";

const h = makeHost("story-runtime-owner", false);
const opening = "A guard watches the wagon. You have 3 Tonics.";
const image = (id: string) => `<div data-inlay-illustrator="true" data-image-id="${id}"><div><img src="${id}"></div></div>\n\n`;
let previous: unknown, serial = 0;
beforeAll(async () => {
  previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake;
  await import("../backend.ts" + "?story-runtime-test"); (globalThis as any).spindle = previous;
});
beforeEach(() => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; h.helper = helper; });
afterEach(async () => { await h.settings({ decisionConnectionId: "" }); delete h.fake.decisions; (globalThis as any).spindle = previous; });
function chat() { const id = `story-runtime-${++serial}`; h.chat(id, "", opening); h.characters[`char-${id}`].world_book_ids = []; return id; }
function helper(c: HelperCall): unknown {
  if (c.system.includes("Determine whether")) return { risky: false, contested: false };
  return { changes: [] };
}
const latest = (id: string) => [...h.sent].reverse().find(m => m.type === "living" && m.chatId === id);

test("a short Korean theft and Run reach the native classifier, save one roll and avoid cold definition reads", async () => {
  await h.settings({ decisionConnectionId: "native-profile" });
  let native = 0, cardReads = 0;
  h.fake.decisions = { evaluate: async () => { native++; return { answers: {
    preparation: { type: "choice", choice: "story" }, roll: { type: "choice", choice: "contested" },
    tier: { type: "choice", choice: "uncertain" }, cost: { type: "choice", choice: "exposure" },
  } }; } };
  const original = h.fake.characters.get;
  h.fake.characters.get = async (...args: any[]) => { cardReads++; return original(...args); };
  try {
    for (const action of ["표사들의 눈을 피해 수레의 보따리를 훔친다.", "Run!"]) {
      const id = chat(); await h.say(id, action); const before = cardReads;
      const first = await h.generate(id, async prompt => {
        expect(cardReads).toBe(before); expect(JSON.stringify(prompt).toLowerCase()).toContain("resolved attempt"); return "The guard reacts.";
      });
      const saved = (first.target.extra.spindle_metadata as any).warpLiving["0"].decision;
      expect(saved.roll).toBeGreaterThanOrEqual(1); expect(saved.roll).toBeLessThanOrEqual(100);
      const calls = native; h.messages(id)[0].content += image("new-image");
      await h.generate(id, "The guard reacts differently.", "swipe");
      expect(native).toBe(calls);
      expect((first.target.extra.spindle_metadata as any).warpLiving["1"].decision).toEqual(saved);
      await h.say(id, '"Hello."'); await h.generate(id, "The next scene is quiet.");
      expect(latest(id).decision).toBeUndefined();
      expect(latest(id).checks.find((check: any) => check.messageId === first.target.id)?.decision).toEqual(saved);
    }
    expect(native).toBe(2);
  } finally { h.fake.characters.get = original; }
});

test("a short non-English consumable use escalates to validated preparation and spends once", async () => {
  const id = chat(), action = "약 1개를 마신다.";
  await h.settings({ decisionConnectionId: "native-profile" });
  let native = 0, preparation = 0;
  h.fake.decisions = { evaluate: async () => { native++; return { answers: { preparation: { type: "choice", choice: "mechanics" }, operation: { type: "choice", choice: "consume" }, roll: { type: "choice", choice: "none" } } }; } };
  h.helper = c => {
    if (!c.system.includes("Determine whether")) return { changes: [] };
    preparation++;
    expect(c.system).toContain("mechanicalActions");
    return { risky: false, contested: false, mechanicalObservations: [{ kind: "item", id: "tonics", name: "Tonics", owner: "you", quantity: 3, equipped: false, message: `${id}-g`, quote: "You have 3 Tonics." }], mechanicalActions: [{ kind: "consume", item: "tonics", amount: 1, quote: action }] };
  };
  await h.say(id, action);
  const first = await h.generate(id, "You drink a tonic.");
  expect(latest(id).notice).toBeUndefined();
  const paid = (first.target.extra.spindle_metadata as any).warpMechanics["0"].receipt;
  expect(foldMechanics(await getMessages(id)).items[0].quantity).toBe(2);
  h.messages(id)[0].content += image("opening"); first.target.content += image("reply");
  await repairLiving(id, first.target.id, h.userId);
  expect(foldMechanics(await getMessages(id)).items[0].quantity).toBe(2);
  await h.generate(id, "You finish the same tonic.", "swipe");
  expect(foldMechanics(await getMessages(id)).items[0].quantity).toBe(2);
  expect((first.target.extra.spindle_metadata as any).warpMechanics["1"].receipt).toEqual(paid);
  expect(native).toBe(1); expect(preparation).toBe(1);
});

test("illustrations added during extraction neither cancel its read nor discard its evidence", async () => {
  const id = chat(); let reads = 0, release!: () => void;
  h.helper = async c => {
    reads++; await new Promise<void>(resolve => { release = resolve; });
    const entries = JSON.parse(c.user.split("Messages:\n")[1]);
    expect(entries[0].content).toBe(opening);
    return { changes: [], scene: { place: "Market", present: ["Guard"], message: entries[0].id, quote: "A guard watches the wagon." } };
  };
  const read = syncLiving(id, h.userId); await settle();
  h.messages(id)[0].content += image("x".repeat(20000));
  const repair = repairLiving(id, `${id}-g`, h.userId);
  release(); await Promise.all([read, repair]);
  expect(reads).toBe(1); expect(latest(id).world.present).toEqual(["Guard"]); expect(latest(id).retry).toBe(false);
  await syncLiving(id, h.userId); expect(reads).toBe(1);
});

test("a legacy prepared roll is reused after canonical migration without a new interpretation", async () => {
  const id = chat(); h.messages(id)[0].content += image("old"); await h.say(id, "Run!");
  const history = await getMessages(id), player = h.messages(id).at(-1)!;
  const decision = resolveAttempt({ risky: true, contested: true, tier: "uncertain", intent: "Escape", stakes: "Exposure", reasons: ["The guard watches"] }, "legacy-seed");
  player.extra.spindle_metadata = { warpLivingAttempt: { path: rawPathOf(history), decision } };
  let calls = 0; h.helper = () => { calls++; throw new Error("Should reuse the preparation"); };
  livingStarted({ chatId: id, generationId: "migration" });
  const ctx = { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO;
  const first = await livingIntercept([{ role: "user", content: "Run!", sourceMessageId: player.id }], ctx);
  expect(player.extra.spindle_metadata).toHaveProperty(STORY_BINDINGS);
  h.messages(id)[0].content = h.messages(id)[0].content.replace("old", "regenerated");
  const second = await livingIntercept([{ role: "user", content: "Run!", sourceMessageId: player.id }], ctx);
  expect(second).toEqual(first); expect(JSON.stringify(second)).toContain(JSON.stringify(decision).replaceAll('"', '\\"'));
  expect(calls).toBe(0); livingStopped({ chatId: id, generationId: "migration" });
});
