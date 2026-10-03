// End-to-end test of the backend against a fake Spindle host.

import { beforeAll, expect, test } from "bun:test";
import { TEMPLATES } from "./engine/templates/index.js";
import { TOWN_YAML } from "./engine/town.fixture.js";

type Fn = (...a: any[]) => any;
interface Msg {
  id: string; chat_id: string; index_in_chat: number; is_user: boolean; name: string; content: string;
  swipe_id: number; swipes: string[]; swipe_dates: number[]; extra: Record<string, unknown>;
  parent_message_id: null; branch_id: null; created_at: number; send_date: number;
}

const handlers = new Map<string, Fn[]>();
let interceptor: Fn;
let wiInterceptor: Fn;
let frontendHandler: Fn;
const sent: any[] = [];
const quietReplies: string[] = [];
const appended: any[] = [];
const books: Record<string, { id: string; name: string; entries: any[] }> = {};
const character = { id: "ch1", name: "Robin", world_book_ids: [] as string[], extensions: {} };
const messages: Msg[] = [];
let storage: Record<string, unknown> = {};

function mkMsg(id: string, isUser: boolean, content: string, metadata?: Record<string, unknown>): Msg {
  return {
    id, chat_id: "c1", index_in_chat: messages.length, is_user: isUser, name: isUser ? "Sam" : "Robin", content,
    swipe_id: 0, swipes: [content], swipe_dates: [0], extra: metadata ? { spindle_metadata: metadata } : {},
    parent_message_id: null, branch_id: null, created_at: 0, send_date: 0,
  };
}

const view = (m: Msg) => {
  const { spindle_metadata, ...extra } = m.extra as any;
  return { ...m, role: m.is_user ? "user" : "assistant", extra, metadata: spindle_metadata };
};

const fake: any = {
  on: (ev: string, fn: Fn) => { handlers.set(ev, [...(handlers.get(ev) ?? []), fn]); return () => {}; },
  registerInterceptor: (fn: Fn) => { interceptor = fn; return () => {}; },
  registerWorldInfoInterceptor: (fn: Fn) => { wiInterceptor = fn; },
  onFrontendMessage: (fn: Fn) => { frontendHandler = fn; return () => {}; },
  sendToFrontend: (m: unknown) => { sent.push(m); },
  commands: { register: () => {}, onInvoked: () => () => {} },
  log: { info: () => {}, error: (m: string) => console.error(m), warn: () => {} },
  toast: { info: () => {}, success: () => {}, warning: () => {}, error: (m: string) => console.error("toast", m) },
  userStorage: {
    getJson: async (p: string, o: any) => (p in storage ? storage[p] : o?.fallback),
    setJson: async (p: string, v: unknown) => { storage[p] = v; },
  },
  connections: { list: async () => [] },
  macros: { resolve: async () => ({ text: "Sam" }) },
  chats: { get: async (id: string) => (id === "c1" ? { id: "c1", character_id: "ch1" } : null) },
  characters: {
    get: async () => character,
    update: async (_id: string, input: any) => { Object.assign(character, input); return character; },
  },
  world_books: {
    get: async (id: string) => books[id] ?? null,
    create: async (input: any) => { const id = `wb${Object.keys(books).length + 1}`; books[id] = { id, name: input.name, entries: [] }; return { id, ...input }; },
    entries: {
      list: async (bookId: string) => ({ data: books[bookId].entries, total: books[bookId].entries.length }),
      create: async (bookId: string, input: any) => { const e = { id: `e${Math.random()}`, world_book_id: bookId, ...input }; books[bookId].entries.push(e); return e; },
    },
  },
  chat: {
    getMessages: async () => messages.map(view),
    updateMessage: async (_c: string, id: string, patch: any) => {
      const m = messages.find((x) => x.id === id)!;
      if (patch.metadata !== undefined) m.extra = { ...m.extra, spindle_metadata: patch.metadata };
    },
    deleteMessage: async (_c: string, id: string) => {
      const i = messages.findIndex((x) => x.id === id);
      if (i >= 0) messages.splice(i, 1);
      messages.forEach((m, j) => { m.index_in_chat = j; });
    },
    appendMessage: async (_c: string, msg: any, opts: any) => {
      appended.push({ msg, opts });
      const m = mkMsg(`a${appended.length}`, msg.role === "user", msg.content, msg.metadata);
      messages.push(m);
      return { id: m.id };
    },
  },
  generate: { quiet: async () => ({ content: quietReplies.shift() ?? "{}" }) },
};

const lastState = () => [...sent].reverse().find((m) => m.type === "state");
const emit = async (ev: string, payload: unknown) => { for (const fn of handlers.get(ev) ?? []) await fn(payload, undefined); };
const settle = () => new Promise((r) => setTimeout(r, 30));

beforeAll(async () => {
  (globalThis as any).spindle = fake;
  messages.push(mkMsg("m0", false, "You wake up in your cramped apartment."));
  await import("./backend.js");
});

test("full loop: install → choose → roll → narrate → bookkeeping → swipe → free text", async () => {
  // No ruleset yet: the UI offers setup.
  await frontendHandler({ type: "hello", chatId: "c1" });
  expect(lastState().status.state).toBe("none");

  // Install the Universal template.
  await frontendHandler({ type: "install_template", chatId: "c1", templateId: "universal" });
  const book = Object.values(books)[0];
  expect(book.name).toBe("warp-ruleset");
  expect(book.entries.length).toBe(TEMPLATES.find((t) => t.id === "universal")!.parts.length);
  expect(book.entries.every((e) => e.disabled === true && e.comment.startsWith("warp-ruleset"))).toBe(true);
  expect(character.world_book_ids).toContain(book.id);
  let st = lastState();
  expect(st.status.state).toBe("ok");
  expect(st.status.issues).toEqual([]);
  // The card's own character is tracked from the start.
  expect(st.hud.people.map((p: any) => p.name)).toContain("Robin");

  // The author swaps in a rulebook of their own (a small town with places to go) and reloads.
  book.entries.splice(0, book.entries.length, { id: "town", world_book_id: book.id, comment: "warp-ruleset · town", content: TOWN_YAML, disabled: true, key: [] });
  await frontendHandler({ type: "reload", chatId: "c1" });
  st = lastState();
  expect(st.status.issues).toEqual([]);
  expect(st.hud.location.name).toBe("Your Apartment");
  expect(st.choices.map((c: any) => c.id)).toContain("head_out");
  expect(st.choicesAnchor).toBe("m0");

  // Click "Head out to the High Street".
  await frontendHandler({ type: "act", chatId: "c1", actionId: "head_out" });
  expect(appended[0].opts).toEqual({ triggerGeneration: true });
  expect(appended[0].msg.metadata.warp.intent.actionId).toBe("head_out");

  const prompt = [{ role: "system", content: "sys" }, { role: "user", content: appended[0].msg.content }];
  const out = await interceptor(prompt, { userId: undefined, chatId: "c1", generationId: "g1", generationType: "normal", isDryRun: false, interceptorDeadlineAt: Date.now() + 30000 });
  const injected = out.messages[out.breakdown[0].messageIndex].content as string;
  expect(injected).toContain("<warp>");
  expect(injected).toContain("Sam chose: Head out to the High Street");
  expect(injected).toContain("Location: High Street");

  // The narrator replies; the extractor reports 20 minutes and a stress bump (clamped by the ruleset).
  messages.push(mkMsg("m2", false, "You step out into the bustle of the High Street. A man jostles you roughly."));
  quietReplies.push('{"minutes": 20, "stats": {"stress": 999999, "skulduggery": 50}}');
  await emit("GENERATION_ENDED", { generationId: "g1", chatId: "c1", messageId: "m2", content: messages[2].content, generationType: "normal" });
  await settle();
  const rec = (messages[2].extra.spindle_metadata as any).warp.swipes["0"];
  expect(rec.action.id).toBe("head_out");
  const narr = rec.events.filter((e: any) => e.src === "narrator");
  expect(narr.find((e: any) => e.t === "stat" && e.id === "stress").d).toBe(15);
  expect(narr.some((e: any) => e.id === "skulduggery")).toBe(false);
  st = lastState();
  expect(st.hud.location.name).toBe("High Street");
  expect(st.choicesAnchor).toBe("m2");
  const chips = st.records.find((r: any) => r.messageId === "m2");
  expect(chips.changes.some((c: any) => c.text.startsWith("Stress") && c.src === "narrator")).toBe(true);

  // Undo the narrator's stress change from its chip.
  const stressChip = chips.changes.find((c: any) => c.text.startsWith("Stress"));
  await frontendHandler({ type: "undo", chatId: "c1", messageId: "m2", swipe: 0, events: stressChip.undo });
  st = lastState();
  expect(st.records.find((r: any) => r.messageId === "m2").changes.some((c: any) => c.text.startsWith("Stress"))).toBe(false);

  // Free text: a pickpocket attempt, read by the adjudicator and rolled by the engine.
  messages.push(mkMsg("m3", true, "I try to slip my hand into the tourist's bag and lift their wallet."));
  quietReplies.push('{"action": {"choice": "pickpocket", "confidence": 0.9}}');
  const out2 = await interceptor([{ role: "user", content: messages[3].content }], { chatId: "c1", generationId: "g2", generationType: "normal", isDryRun: false, interceptorDeadlineAt: Date.now() + 30000 });
  const text2 = out2.messages[out2.breakdown[0].messageIndex].content as string;
  expect(text2).toContain("Sam chose: Pick a pocket");
  expect(text2).toMatch(/Check: Skulduggery — d100: \d+, needed \d+ or less → /);

  messages.push(mkMsg("m4", false, "Your fingers close around leather..."));
  quietReplies.push("{}");
  await emit("GENERATION_ENDED", { generationId: "g2", chatId: "c1", messageId: "m4", content: "Your fingers close around leather...", generationType: "normal" });
  await settle();
  const rec4 = (messages[4].extra.spindle_metadata as any).warp.swipes["0"];
  expect(rec4.check.label).toBe("Skulduggery");
  expect(rec4.action.via).toBe("adjudicator");

  // Swipe (Casual): a new roll for the new swipe, and state follows the active swipe.
  const m4 = messages[4];
  m4.swipes.push("(swipe)"); m4.swipe_dates.push(0); m4.swipe_id = 1;
  const seeds = new Set<string>([rec4.check.seed]);
  await interceptor([{ role: "user", content: messages[3].content }], { chatId: "c1", generationId: "g3", generationType: "swipe", excludeMessageId: "m4", isDryRun: false, interceptorDeadlineAt: Date.now() + 30000 });
  quietReplies.push("{}");
  await emit("GENERATION_ENDED", { generationId: "g3", chatId: "c1", messageId: "m4", content: "(swipe)", generationType: "swipe" });
  await settle();
  const swipes = (messages[4].extra.spindle_metadata as any).warp.swipes;
  expect(Object.keys(swipes).sort()).toEqual(["0", "1"]);
  seeds.add(swipes["1"].check.seed);
  expect(seeds.size).toBe(2);
  // The verdict was saved on the player's message, so the swipe rerolled the same action without asking again.
  expect((messages[3].extra.spindle_metadata as any).warp).toMatchObject({ judged: true, intent: { actionId: "pickpocket" } });
  expect(swipes["1"].action.id).toBe("pickpocket");
  // Deleting swipe 0 shifts records so swipe 1 becomes 0.
  const kept = swipes["1"];
  m4.swipes.splice(0, 1); m4.swipe_dates.splice(0, 1); m4.swipe_id = 0;
  await emit("MESSAGE_SWIPED", { chatId: "c1", message: view(m4), action: "deleted", swipeId: 0, previousSwipeId: 1 });
  await settle();
  expect((messages[4].extra.spindle_metadata as any).warp.swipes["0"]).toEqual(kept);

  // Ruleset entries never reach the prompt.
  const wi = await wiInterceptor({ entries: book.entries.map((e) => ({ ...e })).concat([{ id: "lore1", world_book_id: "other", comment: "Town lore" }]) });
  expect(wi.disabled.length).toBe(book.entries.length);
  expect(wi.disabled).not.toContain("lore1");

  // Manual adjust from the HUD.
  await frontendHandler({ type: "adjust", chatId: "c1", stat: "money", value: 999 });
  expect(lastState().hud.money).toBe("£999");

  // Medium confidence: no roll, but a one-tap suggestion on the player's message; "Roll it" redoes the turn.
  messages.push(mkMsg("m5", true, "I eye the tourist's bag again."));
  quietReplies.push('{"action": {"choice": "pickpocket", "confidence": 0.55}}');
  const out3 = await interceptor([{ role: "user", content: messages[5].content }], { chatId: "c1", generationId: "g4", generationType: "normal", isDryRun: false, interceptorDeadlineAt: Date.now() + 30000 });
  expect(out3.messages[0].content).not.toContain("chose:");
  messages.push(mkMsg("m6", false, "The tourist wanders off."));
  quietReplies.push("{}");
  await emit("GENERATION_ENDED", { generationId: "g4", chatId: "c1", messageId: "m6", content: "The tourist wanders off.", generationType: "normal" });
  await settle();
  st = lastState();
  expect(st.suggestions).toEqual([expect.objectContaining({ messageId: "m5", actionId: "pickpocket", label: "Pick a pocket", canRedo: true })]);
  appended.length = 0;
  await frontendHandler({ type: "redo", chatId: "c1", userMessageId: "m5", actionId: "pickpocket" });
  expect(appended[0].msg.content).toBe("I eye the tourist's bag again.");
  expect(appended[0].msg.metadata.warp).toMatchObject({ judged: true, intent: { actionId: "pickpocket", via: "confirmed" } });
  expect(appended[0].opts).toEqual({ triggerGeneration: true });

  // Dry runs (Prompt Breakdown previews) never call the adjudicator or store rolls.
  const before = quietReplies.length;
  messages.push(mkMsg("m5", true, "I try to climb the fence."));
  const dry = await interceptor([{ role: "user", content: "I try to climb the fence." }], { chatId: "c1", generationId: "gdry", generationType: "normal", isDryRun: true, interceptorDeadlineAt: Date.now() + 30000 });
  expect(quietReplies.length).toBe(before);
  expect(dry.messages[0].content).toContain("<warp>");
});

test("real host shape: no generationId in the interceptor context, reply pre-staged before assembly", async () => {
  // Fresh chat state: greeting only, ruleset already installed on the character by the previous test.
  messages.length = 0;
  messages.push(mkMsg("g0", false, "You wake up in your cramped apartment."));
  await frontendHandler({ type: "refresh", chatId: "c1" });
  expect(lastState().hud.location.name).toBe("Your Apartment");

  // Click "Go to High Street" → Lumiverse appends the user message, fires GENERATION_STARTED,
  // stages an empty assistant reply, THEN runs interceptors with a context lacking generationId.
  appended.length = 0;
  await frontendHandler({ type: "act", chatId: "c1", actionId: "head_out" });
  const staged = mkMsg("staged1", false, "");
  messages.push(staged);
  await emit("GENERATION_STARTED", { generationId: "real-1", chatId: "c1", targetMessageId: "staged1", generationType: "normal" });
  const hostCtx = { chatId: "c1", generationType: "normal", dryRun: false, userId: undefined };
  const out = await interceptor([{ role: "user", content: appended[0].msg.content }], hostCtx);
  const injected = out.messages[out.breakdown[0].messageIndex].content as string;
  expect(injected).toContain("chose: Head out to the High Street");
  expect(injected).toContain("Location: High Street");

  // The reply lands in the staged message.
  staged.content = "You step out onto the High Street.";
  staged.swipes = [staged.content];
  quietReplies.push("{}");
  await emit("GENERATION_ENDED", { generationId: "real-1", chatId: "c1", messageId: "staged1", content: staged.content, generationType: "normal" });
  await settle();
  expect((staged.extra.spindle_metadata as any).warp.swipes["0"].action.id).toBe("head_out");
  const st = lastState();
  expect(st.hud.location.name).toBe("High Street");
  const ids = st.choices.map((c: any) => c.id);
  expect(ids).toContain("cafe_shift");
  expect(ids).not.toContain("sleep");

  // A Prompt Breakdown preview (host flag `dryRun`) never asks the decision model.
  const q = quietReplies.length;
  messages.push(mkMsg("u9", true, "I try to pick a pocket."));
  await interceptor([{ role: "user", content: "I try to pick a pocket." }], { chatId: "c1", generationType: "normal", dryRun: true });
  expect(quietReplies.length).toBe(q);
});
