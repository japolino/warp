import { afterEach, beforeEach, expect, test } from "bun:test";
import { makeHost } from "../backend/test-host.js";
import { getSettings, patchSettings } from "../backend/settings.js";
import { anyChatEnabled, chatEnabled, setChatEnabled } from "./activation.js";

let previous: unknown, serial = 0, owner = "", h: ReturnType<typeof makeHost>;
let storage: Map<string, unknown>, reads = 0, writes = 0, rejectWrite = false;
function attach() {
  h = makeHost(owner, false);
  h.fake.userStorage = {
    getJson: async (path: string, options: any) => { reads++; return structuredClone(storage.get(`${options.userId}:${path}`) ?? options.fallback); },
    setJson: async (path: string, value: unknown, options: any) => { if (rejectWrite) throw Error("Storage unavailable"); writes++; storage.set(`${options.userId}:${path}`, structuredClone(value)); },
  };
  (globalThis as any).spindle = h.fake;
}
beforeEach(() => { previous = (globalThis as any).spindle; owner = `chat-activation-owner-${++serial}`; storage = new Map(); reads = writes = 0; rejectWrite = false; attach(); });
afterEach(() => { (globalThis as any).spindle = previous; });

test("an untouched chat inherits the global default without a saved local choice or repeated storage reads", async () => {
  expect(await chatEnabled("first", owner)).toBe(true);
  const count = reads;
  expect(await chatEnabled("second", owner)).toBe(true); expect(reads).toBe(count); expect(writes).toBe(0);
  await patchSettings({ enabled: false }, owner);
  expect(await chatEnabled("first", owner)).toBe(false); expect(await anyChatEnabled(owner)).toBe(false);
  expect(storage.has(`${owner}:chat-activation.json`)).toBe(false);
});

test("resuming or pausing one conversation preserves other chats and the user's global pause", async () => {
  await patchSettings({ enabled: false }, owner);
  await setChatEnabled("pilot", true, owner);
  expect(await chatEnabled("pilot", owner)).toBe(true); expect(await chatEnabled("existing", owner)).toBe(false);
  expect((await getSettings(owner)).enabled).toBe(false); expect(await anyChatEnabled(owner)).toBe(true);
  await setChatEnabled("pilot", false, owner);
  expect(await chatEnabled("pilot", owner)).toBe(false); expect(await anyChatEnabled(owner)).toBe(false);
  await patchSettings({ enabled: true }, owner);
  expect(await chatEnabled("pilot", owner)).toBe(false); expect(await chatEnabled("new", owner)).toBe(true);
});

test("concurrent local choices preserve each other and a failed write cannot publish a choice or poison later writes", async () => {
  await Promise.all([setChatEnabled("one", true, owner), setChatEnabled("two", false, owner)]);
  expect((storage.get(`${owner}:chat-activation.json`) as any).chats).toEqual({ one: true, two: false });
  rejectWrite = true;
  await expect(setChatEnabled("two", true, owner)).rejects.toThrow("Storage unavailable");
  expect(await chatEnabled("two", owner)).toBe(false);
  rejectWrite = false; await setChatEnabled("three", false, owner);
  expect((storage.get(`${owner}:chat-activation.json`) as any).chats).toEqual({ one: true, two: false, three: false });
});

test("choices survive worker replacement and remain private to the user", async () => {
  await patchSettings({ enabled: false }, owner); await setChatEnabled("pilot", true, owner);
  attach(); expect(await chatEnabled("pilot", owner)).toBe(true);
  const other = `${owner}-other`; await patchSettings({ enabled: false }, other);
  expect(await chatEnabled("pilot", other)).toBe(false);
  await setChatEnabled("pilot", false, other);
  expect(await chatEnabled("pilot", owner)).toBe(true);
  expect((storage.get(`${owner}:chat-activation.json`) as any).chats.pilot).toBe(true);
});

test("malformed and nonboolean persisted choices cannot silently enable a paused user's chats", async () => {
  await patchSettings({ enabled: false }, owner);
  storage.set(`${owner}:chat-activation.json`, { version: 1, chats: { good: true, bad: "true", nil: null, no: false, "": true } });
  expect(await chatEnabled("good", owner)).toBe(true); expect(await chatEnabled("bad", owner)).toBe(false); expect(await chatEnabled("nil", owner)).toBe(false);
  expect(await chatEnabled("no", owner)).toBe(false); expect(await chatEnabled("", owner)).toBe(false);
  await setChatEnabled("next", true, owner);
  expect((storage.get(`${owner}:chat-activation.json`) as any).chats).toEqual({ good: true, no: false, next: true });
});
