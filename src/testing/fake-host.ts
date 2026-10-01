import type { Msg } from "../backend/ledger.js";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";

export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** In-memory Spindle boundary. No sockets, credentials or production services. */
export function fakeHost(chatId = "fixture") {
  const messages: Msg[] = [], sent: unknown[] = [], updates: unknown[] = [], requests: unknown[] = [];
  const books = new Map<string, { id: string; name: string; entries: any[] }>();
  const character: any = { id: `${chatId}-character`, name: "Town Scenario", description: "Robin is a local resident.", world_book_ids: [] };
  const storage = new Map<string, unknown>();
  let next = 0;
  const controls: { beforeUpdate?: () => Promise<void>; quiet?: (request: any) => Promise<unknown> } = {};
  function message(content: string, user = false, metadata?: Record<string, unknown>): Msg {
    const m = { id: `${chatId}-${++next}`, chat_id: chatId, index_in_chat: messages.length, is_user: user, role: user ? "user" : "assistant", name: user ? "Player" : "Narrator", content,
      swipe_id: 0, swipes: [content], swipe_dates: [0], metadata, extra: {}, send_date: 0, created_at: 0, parent_message_id: null, branch_id: null } as Msg;
    messages.push(m); return m;
  }
  const api: any = {
    sendToFrontend: (value: unknown) => sent.push(value),
    log: { error() {}, warn() {}, info() {} }, toast: { error() {}, warning() {}, success() {}, info() {} },
    macros: { resolve: async () => ({ text: "Player" }) }, connections: { list: async () => [] }, imageGen: { listConnections: async () => [] },
    userStorage: { getJson: async (p: string) => storage.get(p) ?? { ...DEFAULT_SETTINGS, decider: "rules", narratorUpdates: false, prewrite: 0 }, setJson: async (p: string, v: unknown) => { storage.set(p, structuredClone(v)); } },
    enclave: { get: async () => null, has: async () => false },
    chats: { get: async () => ({ id: chatId, character_id: character.id }) },
    characters: { get: async () => structuredClone(character), update: async (_id: string, p: unknown) => Object.assign(character, p) },
    world_books: { get: async (id: string) => structuredClone(books.get(id)), entries: { list: async (id: string) => ({ data: structuredClone(books.get(id)?.entries ?? []), total: books.get(id)?.entries.length ?? 0 }) } },
    chat: {
      getMessages: async () => JSON.parse(JSON.stringify(messages)),
      updateMessage: async (_chat: string, id: string, patch: any) => {
        await controls.beforeUpdate?.();
        const m = messages.find((m) => m.id === id); if (!m) throw new Error("Message not found");
        Object.assign(m, JSON.parse(JSON.stringify(patch))); updates.push(patch);
        if (patch.swipes) m.content = m.swipes[m.swipe_id];
      },
      appendMessage: async (_chat: string, input: any) => ({ id: message(input.content, input.role === "user", input.metadata).id }),
      deleteMessage: async (_chat: string, id: string) => { const i = messages.findIndex((m) => m.id === id); if (i >= 0) messages.splice(i, 1); messages.forEach((m, i) => m.index_in_chat = i); },
    },
    generate: { quiet: async (request: unknown) => { requests.push(request); if (!controls.quiet) throw new Error("Unscripted provider call in offline fixture"); return controls.quiet(request); } },
    cors: async () => { throw new Error("Network calls are forbidden in this offline fixture"); },
  };
  return { api, messages, sent, updates, requests, books, character, storage, controls, message };
}
