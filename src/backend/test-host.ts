// A fake Spindle host for backend tests: chats, characters, lorebooks, a scripted helper LLM and a scripted
// Jev endpoint, with call counters (helper = generate.quiet calls, Jev = calls to the classifier URL).
// Not a test file itself; test files import it. No real model calls.

import type { Answers, Questions } from "../engine/decide.js";

type Fn = (...a: any[]) => any;

export interface FakeMsg {
  id: string; chat_id: string; index_in_chat: number; is_user: boolean; name: string; content: string;
  swipe_id: number; swipes: string[]; swipe_dates: number[]; extra: Record<string, unknown>;
  parent_message_id: null; branch_id: null; created_at: number; send_date: number;
}

export interface HelperCall { system: string; user: string; kind: "greeting" | "read" | "writer" | "other" }

export const JEV_TEST_URL = "https://jev.test/v1/systemone";

/** Answer a typed question the safe way: the first option, the lowest level, "no". */
export function defaultAnswer(q: Questions[string]): Answers[string] {
  if (q.type === "choice") {
    const keys = Object.keys(q.criteria);
    return { type: "choice", choice: keys[0], confidence: 0.9, probabilities: Object.fromEntries(keys.map((k, i) => [k, i === 0 ? 0.9 : 0.1 / Math.max(1, keys.length - 1)])) };
  }
  if (q.type === "score") return { type: "score", score: 0, confidence: 0.8, probabilities: {} };
  return { type: "noul", noul: 0.1 };
}

export const pick = (q: Questions[string], choice: string, p = 0.9): Answers[string] => {
  const keys = q.type === "choice" ? Object.keys(q.criteria) : [];
  return { type: "choice", choice, confidence: p, probabilities: Object.fromEntries(keys.map((k) => [k, k === choice ? p : (1 - p) / Math.max(1, keys.length - 1)])) };
};

export function makeHost(userId: string) {
  const handlers = new Map<string, Fn[]>();
  const books: Record<string, { id: string; name: string; entries: any[]; metadata?: unknown }> = {};
  const characters: Record<string, any> = {};
  const chats: Record<string, { id: string; character_id: string; messages: FakeMsg[] }> = {};
  const storage: Record<string, unknown> = {};
  const secrets: Record<string, string> = {};
  const sent: any[] = [];
  const appended: any[] = [];
  const counts = { helper: 0, jev: 0 };
  const helperCalls: HelperCall[] = [];
  const jevBatches: { state: any; questions: Questions }[] = [];
  let interceptor!: Fn;
  let frontend!: Fn;
  let gen = 0;

  const h = {
    userId, books, characters, chats, sent, appended, counts, helperCalls, jevBatches,
    /** The helper LLM: return a reply text (or an object to send as JSON). Default: safe replies per call kind. */
    helper: (_c: HelperCall): unknown | Promise<unknown> => ({}),
    /** Jev: answer each question; return undefined for the safe default. */
    jev: (_id: string, _q: Questions[string], _state: any): Answers[string] | undefined => undefined,
    /** Make Jev fail (HTTP 500). */
    jevDown: false,
    resetCounts() { counts.helper = 0; counts.jev = 0; helperCalls.length = 0; jevBatches.length = 0; },
    fake: null as any,
    interceptor: (...a: any[]) => interceptor(...a),
    frontend: (msg: any) => frontend(msg, userId),
    async emit(ev: string, payload: unknown) { for (const fn of handlers.get(ev) ?? []) await fn(payload, userId); },
    lastState(chatId: string) { return [...sent].reverse().find((m) => m.type === "state" && m.chatId === chatId); },
    msg(chatId: string, id: string, isUser: boolean, content: string, metadata?: Record<string, unknown>): FakeMsg {
      const list = chats[chatId].messages;
      const m: FakeMsg = {
        id, chat_id: chatId, index_in_chat: list.length, is_user: isUser, name: isUser ? "Sam" : "Mira", content,
        swipe_id: 0, swipes: [content], swipe_dates: [0], extra: metadata ? { spindle_metadata: metadata } : {},
        parent_message_id: null, branch_id: null, created_at: 0, send_date: 0,
      };
      list.push(m);
      return m;
    },
    /** A chat whose character has these rules in a `warp-ruleset` lorebook, opening with this greeting. */
    chat(chatId: string, yaml: string, greeting: string | null, opts: { metadata?: unknown } = {}) {
      const charId = `char-${chatId}`;
      const bookId = `book-${chatId}`;
      books[bookId] = { id: bookId, name: "warp-ruleset", entries: [{ id: `e-${chatId}`, world_book_id: bookId, comment: "warp-ruleset · rules", content: yaml, disabled: true, key: [] }], ...(opts.metadata ? { metadata: opts.metadata } : {}) };
      characters[charId] = { id: charId, name: "Mira", description: "Mira runs a harbour bar.", world_book_ids: [bookId], extensions: {} };
      chats[chatId] = { id: chatId, character_id: charId, messages: [] };
      if (greeting !== null) h.msg(chatId, `${chatId}-g`, false, greeting);
    },
    messages(chatId: string) { return chats[chatId].messages; },
    meta(m: FakeMsg): any { return (m.extra.spindle_metadata as any)?.warp ?? {}; },
    record(m: FakeMsg): any { return h.meta(m).swipes?.[String(m.swipe_id)]; },
    async settings(patch: Record<string, unknown>) { await frontend({ type: "settings", patch }, userId); },
    /**
     * Run one host generation the way Lumiverse does: GENERATION_STARTED, stage the reply, the interceptor
     * (no generation id in its context), then GENERATION_ENDED with the reply text.
     */
    async generate(chatId: string, reply: string, type: "normal" | "swipe" = "normal") {
      const list = chats[chatId].messages;
      let target: FakeMsg;
      if (type === "swipe") {
        target = [...list].reverse().find((m) => !m.is_user)!;
        target.swipes.push(""); target.swipe_dates.push(0); target.swipe_id = target.swipes.length - 1; target.content = "";
      } else target = h.msg(chatId, `${chatId}-r${list.length}`, false, "");
      const generationId = `${chatId}-gen${++gen}`;
      await h.emit("GENERATION_STARTED", { generationId, chatId, targetMessageId: target.id, generationType: type });
      const user = [...list].reverse().find((m) => m.is_user);
      const out = await interceptor([{ role: "system", content: "sys" }, { role: "user", content: user?.content ?? "" }], { chatId, userId, generationType: type });
      const injected = Array.isArray(out) ? "" : String(out.messages[out.breakdown[0].messageIndex].content);
      target.content = reply; target.swipes[target.swipe_id] = reply;
      await h.emit("GENERATION_ENDED", { generationId, chatId, messageId: target.id, content: reply, generationType: type });
      return { injected, target, record: h.record(target) };
    },
    async say(chatId: string, text: string) { h.msg(chatId, `${chatId}-u${chats[chatId].messages.length}`, true, text); },
  };

  const view = (m: FakeMsg) => {
    const { spindle_metadata, ...extra } = m.extra as any;
    return { ...m, role: m.is_user ? "user" : "assistant", extra, metadata: spindle_metadata };
  };
  const kindOf = (system: string): HelperCall["kind"] =>
    system.startsWith("You read the opening message") ? "greeting" : system.startsWith("You answer typed questions") ? "read" : system.startsWith("You keep the books") ? "writer" : "other";

  h.fake = {
    on: (ev: string, fn: Fn) => { handlers.set(ev, [...(handlers.get(ev) ?? []), fn]); return () => {}; },
    registerInterceptor: (fn: Fn) => { interceptor = fn; return () => {}; },
    registerWorldInfoInterceptor: () => {},
    onFrontendMessage: (fn: Fn) => { frontend = fn; return () => {}; },
    sendToFrontend: (m: unknown) => { sent.push(m); },
    commands: { register: () => {}, onInvoked: () => () => {} },
    log: { info: () => {}, error: () => {}, warn: () => {} },
    toast: { info: () => {}, success: () => {}, warning: () => {}, error: () => {} },
    userStorage: {
      getJson: async (p: string, o: any) => (p in storage ? structuredClone(storage[p]) : o?.fallback),
      setJson: async (p: string, v: unknown) => { storage[p] = structuredClone(v); },
    },
    enclave: { get: async (k: string) => secrets[k] ?? null, has: async (k: string) => k in secrets, put: async (k: string, v: string) => { secrets[k] = v; }, delete: async (k: string) => { delete secrets[k]; } },
    connections: { list: async () => [] },
    macros: { resolve: async (t: string) => ({ text: t === "{{user}}" ? "Sam" : t === "{{persona}}" ? "Sam, a sailor in a long coat." : t }) },
    chats: { get: async (id: string) => (chats[id] ? { id, character_id: chats[id].character_id } : null) },
    characters: {
      get: async (id: string) => characters[id] ?? null,
      update: async (id: string, input: any) => { Object.assign(characters[id], input); return characters[id]; },
    },
    world_books: {
      get: async (id: string) => books[id] ?? null,
      create: async (input: any) => { const id = `wb${Object.keys(books).length + 1}`; books[id] = { id, name: input.name, entries: [], metadata: input.metadata }; return { id, ...input }; },
      delete: async (id: string) => { delete books[id]; },
      entries: {
        list: async (bookId: string) => ({ data: books[bookId]?.entries ?? [], total: books[bookId]?.entries.length ?? 0 }),
        create: async (bookId: string, input: any) => { const e = { id: `e${Math.random()}`, world_book_id: bookId, ...input }; books[bookId].entries.push(e); return e; },
      },
    },
    chat: {
      getMessages: async (chatId: string) => (chats[chatId]?.messages ?? []).map(view),
      updateMessage: async (chatId: string, id: string, patch: any) => {
        const m = chats[chatId].messages.find((x) => x.id === id)!;
        if (patch.metadata !== undefined) m.extra = { ...m.extra, spindle_metadata: structuredClone(patch.metadata) };
        if (patch.content !== undefined) m.content = patch.content;
      },
      deleteMessage: async (chatId: string, id: string) => {
        const list = chats[chatId].messages;
        const i = list.findIndex((x) => x.id === id);
        if (i >= 0) list.splice(i, 1);
        list.forEach((m, j) => { m.index_in_chat = j; });
      },
      appendMessage: async (chatId: string, msg: any, opts: any) => {
        appended.push({ chatId, msg, opts });
        const m = h.msg(chatId, `${chatId}-a${appended.length}`, msg.role === "user", msg.content, msg.metadata);
        return { id: m.id };
      },
    },
    generate: {
      quiet: async (req: any) => {
        counts.helper++;
        const call: HelperCall = { system: req.messages[0].content, user: req.messages[1].content, kind: kindOf(req.messages[0].content) };
        helperCalls.push(call);
        const out = await h.helper(call);
        return { content: typeof out === "string" ? out : JSON.stringify(out) };
      },
    },
    cors: async (url: string, init: any) => {
      if (url !== JEV_TEST_URL) throw new Error(`unexpected url ${url}`);
      counts.jev++;
      const body = JSON.parse(init.body);
      jevBatches.push({ state: body.state, questions: body.questions });
      if (h.jevDown) return { status: 500, body: "down" };
      const answers: Answers = {};
      for (const [id, q] of Object.entries(body.questions as Questions)) answers[id] = h.jev(id, q, body.state) ?? defaultAnswer(q);
      return { status: 200, body: JSON.stringify({ answers }) };
    },
  };
  return h;
}

export type FakeHost = ReturnType<typeof makeHost>;

export const settle = () => new Promise((r) => setTimeout(r, 20));

// ───────────────────────── inline rulesets (not the templates, which step 4 rebuilds) ─────────────────────────

const DIFF = "{ difficulty: { easy: 8, fair: 12, hard: 16, extreme: 20 } }";

export const ADVENTURE_YAML = `
name: Adventure fixture
style: adventure
clock: { start: greeting, fallback: "Day 1 09:00", minutes_per_action: 10, narrator_max: 480 }
start: { place: greeting }
hud: { bars: [health, energy] }
stats:
  health: { kind: meter, narrator: 20, bands: { 0: Near collapse., 50: Bruised., 80: Healthy. } }
  energy: { kind: meter, narrator: 15 }
  body: { kind: attribute, max: 10, start: 3 }
  mind: { kind: attribute, max: 10, start: 3 }
  charm: { kind: attribute, max: 10, start: 3 }
checks: { typed: true, stats: [body, mind, charm] }
relationships:
  open: true
  stats:
    trust: { start: 20, narrator: 5, bands: { 0: Suspicious, 25: Wary, 50: Trusting } }
  people:
    mira: { name: Mira }
live_choices:
  count: 3
  tags:
    bold: { desc: "A daring, physical or risky move", check: { vs: difficulty, add: body, label: Body }, params: ${DIFF}, success: { energy: -2 }, fail: { health: -5 } }
    clever: { desc: "Noticing or working something out", check: { vs: difficulty, add: mind, label: Mind }, params: ${DIFF}, success: { energy: -1 }, fail: { energy: -2 } }
    kind: { desc: "Something kind toward someone here (no roll)", per_person: true, effects: { rel: { target: { trust: 2 } } } }
    careful: { desc: "The cautious option (no roll)", effects: { energy: 2 } }
actions:
  rest: { label: Rest a while, say: "*I rest a while.*", time: 60, effects: { energy: 10 } }
conflict:
  kinds:
    fight: { label: Fight, stats: [body, mind], escape: body, cost: { fail: { health: -8 } }, won: { hint: "{opponent} yields." }, lost: { health: -10 }, escaped: { energy: -5 } }
`;

export const STORY_YAML = `
name: Story fixture
style: story
clock: { start: greeting, fallback: "Day 1 18:00", minutes_per_action: 15, narrator_max: 720 }
start: { place: greeting }
relationships:
  open: true
  stats:
    affection: { start: 10, narrator: 4, bands: { 0: Cold, 10: Neutral, 25: Warm } }
    trust: { start: 15, narrator: 4, bands: { 0: Guarded, 20: Wary, 40: Open } }
  people:
    mira: { name: Mira }
live_choices:
  count: 3
  tags:
    tender: { desc: "Something warm toward someone here", per_person: true, effects: { rel: { target: { affection: 2 } } } }
    honest: { desc: "Saying something true to someone here", per_person: true, effects: { rel: { target: { trust: 1 } } } }
    space: { desc: "Giving room, letting a silence sit", effects: {} }
    onward: { desc: "Moving the story along", effects: {} }
`;

export const GREETING = "The bar closes at midnight, and Mira is wiping down the counter of the Rusty Anchor while rain drums on the windows.";

/** Valid choices for either fixture (the writer's and the greeting read's default). */
export function defaultChoices(system: string): unknown[] {
  if (system.includes("contest:body")) return [{ label: "Feint left and sweep his legs", tag: "contest:body" }, { label: "Bait him into over-reaching", tag: "contest:mind" }];
  if (system.includes("- tender:")) return [{ label: "Offer Mira a hand with the glasses", tag: "tender", target: "Mira" }, { label: "Let the rain fill the silence", tag: "space" }, { label: "Ask where she grew up", tag: "honest", target: "Mira" }];
  return [{ label: "Vault the bar for the keys", tag: "bold", difficulty: "hard" }, { label: "Study the lock", tag: "clever", difficulty: "fair" }, { label: "Thank Mira for the drink", tag: "kind", target: "Mira", difficulty: "none" }];
}

/** The scripted helper: greeting reads, typed reads and the post-reply writer, all valid and safe by default. */
export function defaultHelper(c: HelperCall): unknown {
  if (c.kind === "greeting") {
    const dawn = c.user.includes("Dawn");
    return {
      time: dawn ? { hour: 6, minute: 0 } : { hour: 23, minute: 40 },
      place: dawn ? "The harbour wall" : "The Rusty Anchor",
      present: ["Mira"],
      you: { outfit: "a rain-soaked coat" },
      people: { Mira: { appearance: "tall, red braid, freckles", outfit: "green apron over a black shirt" } },
      choices: defaultChoices(c.system),
    };
  }
  if (c.kind === "read") {
    if (/vault|climb|grab/i.test(c.user)) return { action: { choice: "attempt", confidence: 0.9 }, risky: { p: 0.9 }, contested: { p: 0.8 }, difficulty: { level: 2, confidence: 0.8 }, approach: { choice: "body", confidence: 0.8 } };
    return {};
  }
  if (c.kind === "writer") return { answers: { "here:mira": { p: 0.9 } }, choices: defaultChoices(c.system), texts: {} };
  return {};
}

/** The scripted Jev: safe defaults, Mira stays here, and an attempt when the typed text vaults or climbs. */
export function defaultJev(id: string, q: Questions[string], state: any): Answers[string] | undefined {
  const action = String(state?.player_action ?? "");
  if (id === "action" && /vault|climb|grab/i.test(action) && q.type === "choice") return pick(q, "attempt", 0.92);
  if ((id === "risky" || id === "contested") && /vault|climb|grab/i.test(action)) return { type: "noul", noul: 0.85 };
  if (id === "difficulty" || id.startsWith("diff:")) return { type: "score", score: 2, confidence: 0.8, probabilities: {} };
  if (id === "here:mira") return { type: "noul", noul: 0.9 };
  if (id === "start_phase" && q.type === "choice") return pick(q, "night");
  if (id === "place" && q.type === "choice") { const cand = Object.entries(q.criteria).find(([, v]) => v.includes("Rusty Anchor")); if (cand) return pick(q, cand[0]); }
  return undefined;
}
