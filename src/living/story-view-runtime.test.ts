import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import type { InterceptorContextDTO } from "lumiverse-spindle-types";
import { makeHost } from "../backend/test-host.js";
import { getMessages } from "../backend/ledger.js";
import { syncLiving, livingStarted, livingStopped, livingIntercept, livingEnded } from "./runtime.js";
import { foldMechanics } from "./mechanical-history.js";
import { STORY_VIEW, storyView } from "./story-view.js";
import { captureStoryViews } from "./story-view-capture.js";
import { pathOf } from "./world.js";

const h = makeHost("view-runtime-owner", false);
const raw = '{{#when::en}}Clinic. Jo has {{focus}} Focus.{{/when}}\n{{#when::jp}}Hidden Hall. Evil has 999 Focus.{{/when}}';
const visible = "Clinic. Jo stands beside Sam and has 10 Focus.";
let previous: unknown, serial = 0;
beforeAll(async () => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; await import("../backend.ts" + "?story-view-runtime"); (globalThis as any).spindle = previous; });
beforeEach(() => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; });
afterEach(() => { (globalThis as any).spindle = previous; });
const chat = () => { const id = `view-runtime-${++serial}`; h.chat(id, "", raw); return id; };

test("initial entry does not ask a model to read hidden routes; the actual prompt view supplies future evidence", async () => {
 const id = chat(); let calls = 0;
 h.helper = () => { calls++; throw Error("No selected story has been supplied yet"); };
 await syncLiving(id, h.userId); expect(calls).toBe(0);
 const before = await getMessages(id), stamp = pathOf(before);
 await h.say(id, "How much Focus does Jo have?");
 const user = h.messages(id).at(-1)!, target = h.msg(id, `${id}-reply`, false, "");
 livingStarted({ chatId: id, generationId: "view", targetMessageId: target.id });
 const prompt = await livingIntercept([{ role: "assistant", content: visible, sourceMessageId: `${id}-g` }, { role: "user", content: user.content, sourceMessageId: user.id }], { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO);
 expect(prompt[0].content).toBe(visible); expect(calls).toBe(0);
 const saved = (await getMessages(id))[0]; expect(storyView(saved)?.text).toBe(visible); expect(saved.content).toBe(raw); expect(pathOf([saved])).toBe(stamp);
 target.content = target.swipes[0] = "Jo has 10 Focus.";
 h.helper = c => {
   calls++; expect(c.user).toContain(visible); expect(c.user).not.toContain("Hidden Hall"); expect(c.user).not.toContain("999"); expect(c.user).not.toContain("#when");
   return { changes: [], scene: { place: "Clinic", present: ["Jo"], message: `${id}-g`, quote: "Clinic." }, mechanicalObservations: [{ kind: "resource", id: "focus", owner: "Jo", name: "Focus", current: 10, message: `${id}-g`, quote: "has 10 Focus." }] };
 };
 await livingEnded({ chatId: id, generationId: "view", messageId: target.id }, h.userId);
 expect(calls).toBe(1); expect(foldMechanics(await getMessages(id)).resources[0].current).toBe(10);
 await syncLiving(id, h.userId); expect(calls).toBe(1);
});

test("missing, duplicate, unresolved and cancelled prompt views cannot manufacture a source", async () => {
 const id = chat(), history = await getMessages(id), source = history[0];
 for (const input of [[], [{ role: "assistant", content: visible, sourceMessageId: "different" }], [{ role: "assistant", content: raw, sourceMessageId: source.id }], [{ role: "assistant", content: visible, sourceMessageId: source.id }, { role: "assistant", content: "Conflicting text", sourceMessageId: source.id }], [{ role: "user", content: visible, sourceMessageId: source.id }]] as any[]) {
   await captureStoryViews(id, input, history, () => true); expect((await getMessages(id))[0].metadata?.[STORY_VIEW]).toBeUndefined();
 }
 await captureStoryViews(id, [{ role: "assistant", content: visible, sourceMessageId: source.id }], history, () => false);
 expect((await getMessages(id))[0].metadata?.[STORY_VIEW]).toBeUndefined();
});

test("a frozen source view survives reload and does not follow later live variable values", async () => {
 const id = chat(), initial = await getMessages(id), source = initial[0];
 const captured = await captureStoryViews(id, [{ role: "assistant", content: visible, sourceMessageId: source.id }], initial, () => true);
 expect(storyView(captured[0])?.text).toBe(visible);
 const stable = await captureStoryViews(id, [{ role: "assistant", content: "Clinic. Jo has 2 Focus now.", sourceMessageId: source.id }], await getMessages(id), () => true);
 expect(storyView(stable[0])?.text).toBe(visible);
 expect(storyView((await getMessages(id))[0])?.text).toBe(visible);
});
