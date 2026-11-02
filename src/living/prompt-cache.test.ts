import { expect, test } from "bun:test";
import type { Msg } from "../backend/ledger.js";
import { pathsOf } from "./world.js";
import { PROMPT_KEY, replayPrompt, type PromptSnapshot } from "./prompt-cache.js";
import { emptyMechanics, prepareMechanical, prepareExchange, mechanicalPacket, receiptPacket } from "./mechanics.js";

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

test("mechanical receipts and resource deltas preserve all prior prompt bytes", () => {
  const first = msg("0", true, "I spend 5 coins."), history = [first];
  const before = emptyMechanics();
  before.resources.push({ id: "coins", owner: "you", name: "Coins", current: 20, source: { message: "source", quote: "20 coins" } });
  const initial = store(history, first, "Jacket");
  initial.packet.mechanics = { resources: before.resources, items: [], conditions: [] };
  initial.receipt = prepareMechanical(before, "pay", "you", [{ kind: "spend", resource: "coins", amount: 5 }]);
  const a = replayPrompt(prompt(history), history, "Stable director");
  const reply = msg("1", false, "Payment accepted."), next = msg("2", true, "What can I afford?"); history.push(reply, next);
  const updated = store(history, next, "Jacket");
  updated.packet.mechanics = { resources: [{ ...before.resources[0], current: 15 }], items: [], conditions: [] };
  const b = replayPrompt(prompt(history), history, "Stable director");
  expect(b.slice(0, a.length)).toEqual(a);
  expect(b.at(-1)!.content).toContain('"mechanics":{"resources":{"put":');
  expect(b.at(-1)!.content).toContain('"current":15');
  expect(b.at(-1)!.content).not.toContain("mechanical receipt");
  const after = msg("3", true, "Hello."); history.push(after); store(history, after, "Jacket");
  const c = replayPrompt(prompt(history), history, "Stable director");
  expect(c.at(-1)!.content).toContain('"remove":["coins"]');
});

test("encounter timing, movement and identity append deltas without rewriting previous requests", () => {
  const first = msg("0", true, "I approach Jo."), history = [first], state = emptyMechanics();
  const source = { message: "scene", quote: "Jo stands near you." };
  state.entities = [{ id: "jo", name: "Jo", displayName: "Jo", aliases: [], entityKind: "person", present: true, status: "active", source }];
  state.distances = [{ id: "range", from: "you", to: "Jo", band: "near", source }];
  store(history, first, "Jacket").packet.mechanics = mechanicalPacket(state);
  const a = replayPrompt(prompt(history), history, "Director");
  history.push(msg("1", false, "You move closer."), msg("2", true, "I wait."));
  state.clocks = [{ id: "you", actor: "you", actions: 1 }];
  state.cooldowns = [{ id: "pulse", actor: "you", readyAt: 3 }];
  state.distances[0].band = "touch";
  state.entities[0].displayName = "Mara";
  store(history, history.at(-1)!, "Jacket").packet.mechanics = mechanicalPacket(state);
  const b = replayPrompt(prompt(history), history, "Director");
  expect(b.slice(0, a.length)).toEqual(a);
  expect(b.at(-1)!.content).toContain('"clocks":{"put":[{"id":"you","actor":"you","actions":1}]');
  expect(b.at(-1)!.content).toContain('"band":"touch"');
  expect(b.at(-1)!.content).toContain('"displayName":"Mara"');
  expect(b.at(-1)!.content).not.toContain('"quote"');
});

test("saved receipt presentation remains frozen when future turns use a different presentation policy", () => {
  const first = msg("0", true, "I wait."), history = [first], initial = store(history, first, "Jacket");
  initial.receipt = prepareExchange(emptyMechanics(), "old-policy", "you", [{ kind: "wait" }], []);
  initial.receiptPacket = { ...receiptPacket(initial.receipt), boundary: "Previously saved narration policy" };
  const a = replayPrompt(prompt(history), history, "Director");
  expect(a.at(-1)!.content).toContain("Previously saved narration policy");
  history.push(msg("1", false, "You hold position."), msg("2", true, "I wait again."));
  const next = store(history, history.at(-1)!, "Jacket");
  next.receipt = prepareExchange(emptyMechanics(), "new-policy", "you", [{ kind: "wait" }], []);
  next.receiptPacket = receiptPacket(next.receipt);
  const b = replayPrompt(prompt(history), history, "Director");
  expect(b.slice(0, a.length)).toEqual(a);
  expect(b.at(-1)!.content).toContain("Leave arithmetic and resource totals");
});

test("resilience and healed-injury changes append deltas without publishing retirement bookkeeping or rewriting old prompts", () => {
  const first = msg("0", true, "I try to get past Jo."), history = [first], state = emptyMechanics();
  const source = { message: "old", quote: "Sam has a tough body." };
  state.resilience = [{ id: "body", owner: "you", band: "tough", version: 1, basis: "warp", source }];
  state.conditions = [{ id: "wound", owner: "you", name: "Hurt", hinders: [], blocks: [], helps: [], ending: "Treatment", injury: { rule: 1, load: 1, basis: "warp" }, source }];
  store(history, first, "Jacket").packet.mechanics = mechanicalPacket(state);
  const original = replayPrompt(prompt(history), history, "Director");
  state.conditions = []; state.resilience[0] = { ...state.resilience[0], band: "exceptional", version: 2 };
  state.closedConditions = [{ id: "wound", owner: "you", name: "Hurt", after: { kind: "receipt", id: "treated" } }];
  history.push(msg("1", false, "Jo treats the wound."), msg("2", true, "I stand up."));
  store(history, history.at(-1)!, "Jacket").packet.mechanics = mechanicalPacket(state);
  const next = replayPrompt(prompt(history), history, "Director");
  expect(next.slice(0, original.length)).toEqual(original);
  expect(next.at(-1)!.content).toContain('"conditions":{"put":[],"remove":["wound"]}');
  expect(next.at(-1)!.content).toContain('"resilience":{"put":[{"id":"body"');
  expect(next.at(-1)!.content).not.toContain("closedConditions");
  expect(next.at(-1)!.content).not.toContain('"load":1');
});
