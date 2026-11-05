import { expect, test } from "bun:test";
import type { Msg } from "../backend/ledger.js";
import { pathsOf } from "./world.js";
import { PROMPT_KEY, replayPrompt, preparePrompt, type PromptSnapshot } from "./prompt-cache.js";
import { STORY_BINDINGS, storyRevision } from "./story-text.js";
import { emptyMechanics, prepareMechanical, prepareExchange, mechanicalPacket, receiptPacket } from "./mechanics.js";
import omittedMechanicalPrompt from "./fixtures/omitted-mechanical-prompt.json";

const msg = (id: string, is_user: boolean, content: string): Msg => ({ id, is_user, content, role: is_user ? "user" : "assistant", index_in_chat: Number(id), swipe_id: 0 } as Msg);
const packet = (text: string) => ({ place: "Cafe", present: ["Jo"], preferences: { exclude: [], offScreen: [] }, established: [{ id: "jacket", text }], possibleMotives: [] });
function store(history: Msg[], target: Msg, text: string) {
  const snapshot: PromptSnapshot = { version: 1, path: pathsOf(history).get(target.id)!, packet: packet(text) };
  target.metadata = { [PROMPT_KEY]: { "0": snapshot } };
  return snapshot;
}
const prompt = (history: Msg[]) => [{ role: "system" as const, content: "Stable card and preset", cache_control: { type: "ephemeral" } }, ...history.map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id }))];
function publish(history: Msg[], target: Msg, input = prompt(history), director = "Director") {
  const snapshot = (target.metadata![PROMPT_KEY] as Record<string, PromptSnapshot>)["0"];
  const result = preparePrompt(input, history, director, { id: target.id, snapshot });
  target.metadata = { ...target.metadata, [PROMPT_KEY]: { "0": result.snapshot } };
  return result.messages;
}

test("new state previously omitted by the installed formatter is delivered once without rewriting its old wire", () => {
  const { history, wire } = structuredClone(omittedMechanicalPrompt) as unknown as { history: Msg[]; wire: ReturnType<typeof prompt> };
  const previous = (history.at(-1)!.metadata![PROMPT_KEY] as Record<string, PromptSnapshot>)["0"];
  const next = msg("2", true, "What practice progress is saved?"); history.push(next);
  const snapshot = store(history, next, "Jacket"); snapshot.packet = structuredClone(previous.packet);
  const corrected = publish(history, next, history.map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id })));
  expect(corrected.slice(0, wire.length)).toEqual(wire);
  for (const key of ["companions", "costLinks", "growth", "companionBoundary", "growthBoundary"]) expect(corrected.at(-1)!.content).toContain(`"${key}"`);
  expect(corrected.at(-1)!.content).toContain('"opportunities":1,"milestoneAt":3');
  const following = msg("3", true, "Same question"); history.push(following);
  store(history, following, "Jacket").packet = structuredClone(snapshot.packet);
  const stable = publish(history, following, history.map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id })));
  expect(stable.slice(0, corrected.length)).toEqual(corrected);
  expect(stable.at(-1)!.content).toBe("Same question");
  const revoked = msg("4", true, "Access is withdrawn"); history.push(revoked);
  const changed = store(history, revoked, "Jacket"); changed.packet = structuredClone(snapshot.packet);
  changed.packet.mechanics.costLinks[0].enabled = false;
  const update = publish(history, revoked, history.map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id })));
  expect(update.slice(0, stable.length)).toEqual(stable);
  expect(update.at(-1)!.content).toContain('"enabled":false');
  expect(update.at(-1)!.content).not.toContain('"growth"');
});

test("recovering an omitted legacy snapshot leaves prior wire bytes unchanged and appends recovered state to the new turn", () => {
  const a = msg("0", true, "First"), b = msg("1", true, "Second"), c = msg("2", true, "Third"), history = [a, b, c];
  store(history, a, "Green jacket"); const recovered = store(history, b, "Blue jacket");
  recovered.packet.established.push({ id: "old-hint", text: "A disclosed route" });
  recovered.path = "verifiable-legacy-path";
  store(history, c, "Blue jacket");
  const first = publish(history, c);
  expect(first[2].content).toBe("Second");
  expect(first[3].content).not.toContain('"remove":["old-hint"]');
  const paths = pathsOf(history);
  b.metadata = { ...b.metadata, [STORY_BINDINGS]: { "0": { text: storyRevision(b.content), rawText: "old-text", prefix: paths.get(a.id), rawPrefix: "old-prefix", path: paths.get(b.id), rawPath: recovered.path } } };
  const d = msg("3", true, "Fourth"); history.push(d);
  const next = store(history, d, "Blue jacket"); next.packet.established.push({ id: "old-hint", text: "A disclosed route" });
  const second = publish(history, d);
  expect(second.slice(0, first.length)).toEqual(first);
  expect(second.at(-1)!.content).toContain('"put":[{"id":"old-hint"');
  expect(second[2].content).toBe("Second");
  expect(recovered.packet.established).toHaveLength(2);
});

test("wire forms freeze formatter/director policy, bootstrap trimmed windows and store each form once", () => {
  const a = msg("0", true, "First"), b = msg("1", true, "Second"), history = [a, b];
  store(history, a, "Green jacket"); store(history, b, "Blue jacket");
  const first = publish(history, b);
  expect(first[1].content).toContain("Director");
  const c = msg("2", true, "Third"); history.push(c); store(history, c, "Blue jacket");
  const next = publish(history, c, prompt(history), "A future director");
  expect(next.slice(0, first.length)).toEqual(first);
  const d = msg("3", true, "Fourth"); history.push(d); store(history, d, "Blue jacket");
  const trimmed = publish(history, d, prompt([b, c, d]), "A future director");
  expect(trimmed[1].content).toContain("A future director");
  expect(trimmed[1].content).toContain('"established":[{"id":"jacket","text":"Blue jacket"}]');
  for (let i = 4; i < 20; i++) {
    const row = msg(String(i), true, `Turn ${i}`); history.push(row); store(history, row, "Blue jacket");
    const request = publish(history, row, prompt(history.slice(1)), "Another director");
    expect(request.slice(0, trimmed.length)).toEqual(trimmed);
  }
  const saved = history.flatMap(m => ((m.metadata?.[PROMPT_KEY] as Record<string, PromptSnapshot>)?.["0"]?.renderings ?? []));
  expect(saved).toHaveLength(21); // One form per turn plus B's legitimate full-state bootstrap.
  expect(new Set(saved.map(r => JSON.stringify([r.id, r.basis, r.mode]))).size).toBe(saved.length);
});

test("frozen wire records cannot replay across real edits or swipes, and previews do not publish them", () => {
  const a = msg("0", true, "First"), reply = msg("1", false, "Original"), b = msg("2", true, "Second"), history = [a, reply, b];
  store(history, a, "Green jacket"); store(history, b, "Blue jacket"); publish(history, b);
  const frozen = JSON.stringify(history);
  preparePrompt(prompt(history), history, "Preview director", { id: b.id, snapshot: (b.metadata![PROMPT_KEY] as Record<string, PromptSnapshot>)["0"] });
  expect(JSON.stringify(history)).toBe(frozen);
  reply.content = "Edited";
  expect(replayPrompt(prompt(history), history, "Director").at(-1)!.content).toBe("Second");
  reply.content = "Original"; reply.swipe_id = 1;
  expect(replayPrompt(prompt(history), history, "Director").at(-1)!.content).toBe("Second");
});

test("malformed saved rendering collections are ignored without losing valid state", () => {
  const a = msg("0", true, "First"), history = [a], snapshot = store(history, a, "Green jacket");
  (snapshot as any).renderings = { broken: true };
  expect(replayPrompt(prompt(history), history, "Director")[1].content).toContain("Green jacket");
  expect(preparePrompt(prompt(history), history, "Director", { id: a.id, snapshot }).snapshot?.renderings).toHaveLength(1);
});

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

test("a new listener appends their knowledge and its boundary without changing the earlier secret or prompt prefix", () => {
  const first = msg("0", true, "I read the letter."), history = [first];
  const initial = store(history, first, "Private letter");
  const a = replayPrompt(prompt(history), history, "Director");
  history.push(msg("1", false, "You tell Jo privately."), msg("2", true, "I greet Dex."));
  const next = store(history, history.at(-1)!, "Private letter");
  next.packet.knowledgeBoundary = "Only recorded learners have established access.";
  next.packet.established.push({ id: "knowledge-jo", kind: "knowledge", subject: "Jo", text: "Private letter", access: { about: "jacket", version: "saved", via: "told", from: "you", fromKnowledge: "knowledge-you" } });
  const b = replayPrompt(prompt(history), history, "Director");
  expect(b.slice(0, a.length)).toEqual(a);
  expect(b.at(-1)!.content).toContain('"knowledgeBoundary":"Only recorded learners');
  expect(b.at(-1)!.content).toContain('"subject":"Jo"');
  expect(b.at(-1)!.content).not.toContain('"subject":"Dex"');
  expect(initial.packet.established).toHaveLength(1);
});

test("agreement progress and a paid reward append state deltas while preserving the original offer and prior prompt bytes", () => {
  const first = msg("0", true, "I accept Jo's offer."), history = [first], initial = store(history, first, "Café");
  initial.packet.mechanics = { agreements: [{ id: "cafe", owner: "you", requirements: [{ id: "counter", done: false }, { id: "cups", done: false }], rewards: [{ id: "pay", amount: 10, paid: false }] }] };
  const a = replayPrompt(prompt(history), history, "Director");
  history.push(msg("1", false, "The work is completed and Jo offers the pay."), msg("2", true, "I collect it."));
  const next = store(history, history.at(-1)!, "Café");
  next.packet.agreementBoundary = "Offer a completed reward; transfer only with its receipt.";
  next.packet.mechanics = structuredClone(initial.packet.mechanics); next.packet.mechanics.agreements[0].requirements.forEach((r: any) => r.done = true); next.packet.mechanics.agreements[0].rewards[0].paid = true;
  const b = replayPrompt(prompt(history), history, "Director");
  expect(b.slice(0, a.length)).toEqual(a);
  expect(b.at(-1)!.content).toContain('"agreements":{"put":[{"id":"cafe"');
  expect(b.at(-1)!.content).toContain('"paid":true');
  expect(b.at(-1)!.content).toContain('"agreementBoundary":"Offer a completed reward');
  expect(initial.packet.mechanics.agreements[0].rewards[0].paid).toBe(false);
});

test("asset and missed-read boundaries append and clear without rewriting historical narrator prompts", () => {
  const first = msg("0", true, "I accept the offer."), history = [first];
  const initial = store(history, first, "Café");
  const a = replayPrompt(prompt(history), history, "Director");
  const nextMessage = msg("1", true, "I collect my pay."); history.push(nextMessage);
  const next = store(history, nextMessage, "Café");
  next.packet.assetBoundary = "A transfer needs its saved receipt.";
  next.packet.readBoundary = "Some earlier exchanges are unrecorded.";
  next.packet.preparationBoundary = "Missing preparation is not a fictional obstacle.";
  const b = replayPrompt(prompt(history), history, "Director");
  expect(b.slice(0, a.length)).toEqual(a);
  expect(b.at(-1)!.content).toContain('"assetBoundary":"A transfer');
  expect(b.at(-1)!.content).toContain('"readBoundary":"Some earlier');
  expect(b.at(-1)!.content).toContain('"preparationBoundary":"Missing preparation');
  const recovered = msg("2", true, "Thanks."); history.push(recovered);
  const after = store(history, recovered, "Café"); after.packet.assetBoundary = next.packet.assetBoundary;
  const c = replayPrompt(prompt(history), history, "Director");
  expect(c.slice(0, b.length)).toEqual(b); expect(c.at(-1)!.content).toContain('"readBoundary":null');
  expect(c.at(-1)!.content).toContain('"preparationBoundary":null');
  expect(initial.packet.readBoundary).toBeUndefined();
});

test("travel and depleted stocks append spatial deltas without rewriting an earlier narrator prefix", () => {
  const first = msg("0", true, "I enter the Dock."), history = [first], snapshot = store(history, first, "Broken scanner");
  snapshot.packet.mechanics = { places: [{ id: "dock", name: "Dock", visited: true }, { id: "clinic", name: "Clinic", visited: false }], positions: [{ id: "you", owner: "you", site: "dock" }], stocks: [{ id: "rations", site: "clinic", quantity: 3 }] };
  const a = replayPrompt(prompt(history), history, "Director");
  const player = msg("1", true, "I visit the Clinic and gather two Rations."); history.push(player);
  const next = store(history, player, "Broken scanner"); next.packet.mechanics = structuredClone(snapshot.packet.mechanics);
  next.packet.explorationBoundary = "Known places and remaining supplies persist.";
  next.packet.mechanics.places[1].visited = true; next.packet.mechanics.positions[0].site = "clinic"; next.packet.mechanics.stocks[0].quantity = 1;
  const b = replayPrompt(prompt(history), history, "Director");
  expect(b.slice(0, a.length)).toEqual(a); expect(b.at(-1)!.content).toContain('"positions":{"put":[{"id":"you","owner":"you","site":"clinic"}]');
  expect(b.at(-1)!.content).toContain('"stocks":{"put":[{"id":"rations","site":"clinic","quantity":1}]');
  expect(b.at(-1)!.content).toContain('"explorationBoundary":"Known places'); expect(snapshot.packet.mechanics.stocks[0].quantity).toBe(3);
});

test("periodic schedules and buildup append their changes and removals without changing old prompt bytes", () => {
  const first = msg("0", true, "I use the supported power."), history = [first];
  const initial = store(history, first, "Clinic");
  initial.packet.mechanics = { conditions: [{ id: "burn", owner: "you", name: "Burning", periodic: { remaining: 3, timingBasis: "source", pulse: { kind: "damage", resource: "Health", amount: 5 } } }], buildups: [{ id: "venom", owner: "Jo", current: 2, threshold: 5 }] };
  initial.packet.lingeringBoundary = "Only completed affected-owner actions advance saved effects.";
  const a = publish(history, first);
  const nextMessage = msg("1", true, "I wait."); history.push(nextMessage);
  const next = store(history, nextMessage, "Clinic"); next.packet = structuredClone(initial.packet);
  next.packet.mechanics.conditions[0].periodic.remaining = 2; next.packet.mechanics.buildups[0].current = 4;
  const b = publish(history, nextMessage);
  expect(b.slice(0, a.length)).toEqual(a);
  expect(b.at(-1)!.content).toContain('"conditions":{"put":[{"id":"burn"');
  expect(b.at(-1)!.content).toContain('"remaining":2');
  expect(b.at(-1)!.content).toContain('"buildups":{"put":[{"id":"venom","owner":"Jo","current":4');
  const cured = msg("2", true, "I use the supported cure."); history.push(cured);
  const last = store(history, cured, "Clinic"); last.packet = structuredClone(next.packet); last.packet.mechanics.conditions = []; last.packet.mechanics.buildups = [];
  const c = publish(history, cured);
  expect(c.slice(0, b.length)).toEqual(b);
  expect(c.at(-1)!.content).toContain('"conditions":{"put":[],"remove":["burn"]}');
  expect(c.at(-1)!.content).toContain('"buildups":{"put":[],"remove":["venom"]}');
});


test("aid offers and their removal append deltas while previous narrator request bytes stay frozen", () => {
  const first = msg("0", true, "Could you treat my burn?"), history = [first];
  store(history, first, "Jacket").packet.mechanics = { aidOffers: [] };
  const initial = publish(history, first);
  const offered = msg("1", false, "Jo offers Mend, using two of his Focus.");
  const question = msg("2", true, "How much does that cost?"); history.push(offered, question);
  const pending = store(history, question, "Jacket");
  pending.packet.aidBoundary = "Offer only. Ask or accept in ordinary chat.";
  pending.packet.mechanics = { aidOffers: [{ id: "aid-jo", version: 1, actor: "Jo", status: "offered", ability: "mend" }] };
  const withOffer = publish(history, question);
  expect(withOffer.slice(0, initial.length)).toEqual(initial);
  expect(withOffer.at(-1)!.content).toContain('"aidOffers"');
  expect(withOffer.at(-1)!.content).toContain('"aidBoundary"');
  history.push(msg("3", false, "Two of my Focus."));
  const acceptance = msg("4", true, "Yes, please."); history.push(acceptance);
  store(history, acceptance, "Jacket").packet = structuredClone(pending.packet);
  const stable = publish(history, acceptance);
  expect(stable.slice(0, withOffer.length)).toEqual(withOffer);
  expect(stable.at(-1)!.content).toBe("Yes, please.");
  history.push(msg("5", false, "Jo treats your burn."));
  const after = msg("6", true, "Thank you."); history.push(after);
  const consumed = store(history, after, "Jacket"); consumed.packet.mechanics = { aidOffers: [] };
  const final = publish(history, after);
  expect(final.slice(0, stable.length)).toEqual(stable);
  expect(final.at(-1)!.content).toContain('"remove":["aid-jo"]');
  expect(final.at(-1)!.content).toContain('"aidBoundary":null');
});
