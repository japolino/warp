import { host } from "../backend/host.js";
import { getSettings } from "../backend/settings.js";

const FILE = "chat-activation.json";
type Choices = Record<string, boolean>;
interface UserStore { loaded?: Promise<Choices>; choices?: Choices; writes: Promise<void> }
const stores = new WeakMap<object, Map<string, UserStore>>();

function store(): Map<string, UserStore> {
  const api = host(), existing = stores.get(api);
  if (existing) return existing;
  const next = new Map<string, UserStore>(); stores.set(api, next); return next;
}
function userStore(userId?: string): UserStore {
  const users = store(), key = userId ?? "_";
  let entry = users.get(key);
  if (!entry) { entry = { writes: Promise.resolve() }; users.set(key, entry); }
  return entry;
}
function normalize(value: unknown): Choices {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as { version?: unknown; chats?: unknown };
  if (record.version !== 1 || !record.chats || typeof record.chats !== "object" || Array.isArray(record.chats)) return {};
  return Object.fromEntries(Object.entries(record.chats).filter(([id, enabled]) => id.length > 0 && id.length <= 200 && typeof enabled === "boolean"));
}
async function choices(userId?: string): Promise<Choices> {
  const entry = userStore(userId);
  if (entry.choices) return entry.choices;
  entry.loaded ??= host().userStorage.getJson<unknown>(FILE, { fallback: {}, userId }).then(value => entry.choices = normalize(value));
  return entry.loaded;
}

/** Existing global preferences remain the default; an inline choice belongs to one chat. */
export async function chatEnabled(chatId: string, userId?: string): Promise<boolean> {
  const local = await choices(userId);
  return Object.hasOwn(local, chatId) ? local[chatId] : (await getSettings(userId)).enabled;
}

/** Inline tools are registered once for all eligible chats, never changed on ordinary navigation. */
export async function anyChatEnabled(userId?: string): Promise<boolean> {
  return (await getSettings(userId)).enabled || Object.values(await choices(userId)).some(Boolean);
}

export async function setChatEnabled(chatId: string, enabled: boolean, userId?: string): Promise<void> {
  if (!chatId || chatId.length > 200) throw Error("A valid chat is required");
  const entry = userStore(userId), api = host();
  const operation = entry.writes.then(async () => {
    const previous = await choices(userId), next = { ...previous, [chatId]: enabled };
    await api.userStorage.setJson(FILE, { version: 1, chats: next }, { indent: 2, userId });
    entry.choices = next;
  });
  entry.writes = operation.catch(() => {});
  await operation;
}
