import { expect, test } from "bun:test";
import type { Msg } from "../backend/ledger.js";
import { pathsOf } from "./world.js";
import { PROMPT_KEY, replayPrompt, type PromptSnapshot } from "./prompt-cache.js";

const msg = (id: string, is_user: boolean, content: string): Msg => ({ id, is_user, content, role: is_user ? "user" : "assistant", index_in_chat: Number(id), swipe_id: 0 } as Msg);
const packet = (text: string) => ({ place: "Cafe", present: ["Jo"], preferences: { exclude: [], offScreen: [] }, established: [{ id: "jacket", text }], possibleMotives: [] });
function store(history: Msg[], target: Msg, text: string) {
  const snapshot: PromptSnapshot = { version: 1, path: pathsOf(history).get(target.id)!, packet: packet(text) };
  target.metadata = { [PROMPT_KEY]: { "0": snapshot } };
  return snapshot;
}
const prompt = (history: Msg[]) => [{ role: "system" as const, content: "Stable card and preset", cache_control: { type: "ephemeral" } }, ...history.map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id }))];

test("the next request preserves the entire previous request and reply, using only changed facts", () => {
  const first = msg("0", true, "I arrive."); const history = [first]; store(history, first, "Green jacket");
  const a = replayPrompt(prompt(history), history, "Stable director");
  const reply = msg("1", false, "Jo greets you."); const next = msg("2", true, "The jacket is blue."); history.push(reply, next); store(history, next, "Blue jacket");
  const b = replayPrompt(prompt(history), history, "Stable director");
  expect(b.slice(0, a.length)).toEqual(a);
  expect(b[a.length].content).toBe(reply.content);
  expect(b.at(-1)!.content).toContain('"put":[{"id":"jacket","text":"Blue jacket"}]');
  expect(b.at(-1)!.content).not.toContain("Stable director");
  expect(b[0].cache_control).toEqual({ type: "ephemeral" });
  expect(first.content).toBe("I arrive.");
});

test("a trimmed window bootstraps full state, then stays stable as history grows", () => {
  const a = msg("0", true, "First"); const b = msg("1", true, "Second"); const history = [a, b];
  store(history, a, "Green jacket"); store(history, b, "Blue jacket");
  const trimmed = prompt([b]); const first = replayPrompt(trimmed, history, "Director");
  expect(first[1].content).toContain("Director"); expect(first[1].content).toContain('"established":[{"id":"jacket","text":"Blue jacket"}]');
  const c = msg("2", true, "Third"); history.push(c); store(history, c, "Blue jacket");
  expect(replayPrompt(prompt([b, c]), history, "Director").slice(0, first.length)).toEqual(first);
});

test("edited or alternate source paths cannot replay stale snapshots", () => {
  const a = msg("0", true, "First"); const reply = msg("1", false, "Original"); const b = msg("2", true, "Second"); const history = [a, reply, b];
  store(history, a, "Green jacket"); store(history, b, "Blue jacket");
  reply.content = "Edited";
  expect(replayPrompt(prompt(history), history, "Director").at(-1)!.content).toBe("Second");
  reply.content = "Original"; reply.swipe_id = 1;
  expect(replayPrompt(prompt(history), history, "Director").at(-1)!.content).toBe("Second");
});

test("multimodal parts and provider cache/signature fields survive without modifying the input", () => {
  const a = msg("0", true, "First"); const history = [a]; store(history, a, "Jacket");
  const parts: any[] = [{ type: "text", text: "Transformed first" }, { type: "image_url", image_url: { url: "image" } }];
  const input: any[] = [{ role: "user", sourceMessageId: a.id, content: parts, thought_signature: "opaque", cache_control: { type: "ephemeral" } }];
  const output = replayPrompt(input, history, "Director");
  expect(parts).toHaveLength(2); expect(output[0].content).toHaveLength(3);
  expect((output[0].content as any[]).slice(0, 2)).toEqual(parts);
  expect(output[0].thought_signature).toBe("opaque"); expect(output[0].cache_control).toEqual(input[0].cache_control);
});
