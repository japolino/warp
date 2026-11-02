import { expect, test } from "bun:test";
import { revision } from "../shared/revision.js";
import type { Msg } from "../backend/ledger.js";
import { pathOf } from "./world.js";
import { definitionSource, readAbilityDefinitions } from "./abilities.js";
import { emptyMechanics, applyObservations, readMechanicalObservations, prepareMechanical, commitMechanical, readMechanicalPlan, conditionInfluence, type MechanicalState, type MechanicalOperation } from "./mechanics.js";
import { actorName, actionCount, distance, cooldownRemaining } from "./encounters.js";
import { foldMechanics, MECHANICS_KEY } from "./mechanical-history.js";

const story = { id: "scene", is_user: false, content: "Jo, the masked guard, stands near you. You have 20 of 20 Energy and 40 of 40 Health. Jo has 40 of 40 Health, a shield of 5, and 1 equipped vest with 4 armor. Jo's ward resists 25 percent physical damage and reflects 50 percent. Lee waits far from you." };
const evidence = { message: story.id, quote: story.content };
const source = definitionSource("persona", "Pulse costs 2 Energy and deals 20 physical Health damage at near range, with a cooldown of 1 action. Ward costs 2 Energy and absorbs 10 damage for 2 actions. Bind blocks movement for 1 action.")!;
function initial(): MechanicalState {
  const raw = [
    { kind: "entity", name: "Jo", displayName: "Masked guard", aliases: ["the guard"], entityKind: "person", present: true },
    { kind: "entity", name: "Lee", entityKind: "person", present: true },
    { kind: "distance", from: "you", to: "Jo", band: "near" },
    { kind: "distance", from: "you", to: "Lee", band: "far" },
    { kind: "resource", id: "energy", name: "Energy", owner: "you", current: 20, max: 20, role: "effort" },
    { kind: "resource", id: "hp", name: "Health", owner: "you", current: 40, max: 40, role: "vital" },
    { kind: "resource", id: "jo-hp", name: "Health", owner: "the guard", current: 40, max: 40, role: "vital" },
    { kind: "resource", id: "jo-shield", name: "Shield", owner: "Jo", current: 5, max: 5, role: "shield" },
    { kind: "item", id: "vest", name: "Vest", owner: "Jo", quantity: 1, equipped: true, defenses: [{ kind: "armor", amount: 4, damageType: "all" }] },
    { kind: "condition", id: "ward", name: "Mirror ward", owner: "Jo", ending: "When dispelled", defenses: [{ kind: "resistance", amount: 25, damageType: "physical" }, { kind: "reflect", amount: 50, damageType: "physical" }] },
  ].map(row => ({ ...row, ...evidence }));
  const before = applyObservations(emptyMechanics(), readMechanicalObservations(raw, emptyMechanics(), [story]));
  const abilities = readAbilityDefinitions([
    { owner: "you", name: "Pulse", approach: "precision", target: "other", range: "near", cooldown: 1, costs: [{ kind: "resource", id: "energy", amount: 2 }], effects: [{ kind: "damage", target: "target", resource: "Health", amount: 20, damageType: "physical" }], message: source.id, quote: source.text },
    { owner: "you", name: "Ward", approach: "concentration", target: "self", costs: [{ kind: "resource", id: "energy", amount: 2 }], effects: [{ kind: "defense", target: "self", name: "Ward", defense: { kind: "shield", amount: 10, damageType: "all" }, ending: "After 2 owner actions or depletion", duration: 2 }], message: source.id, quote: source.text },
    { owner: "you", name: "Bind", approach: "concentration", target: "other", costs: [], effects: [{ kind: "condition", target: "target", name: "Bound", hinders: [], helps: [], blocks: ["movement"], ending: "After 1 owner action", duration: 1 }], message: source.id, quote: source.text },
  ], before, [], [source]);
  return applyObservations(before, abilities.map(value => ({ kind: "ability", value })));
}
function use(s: MechanicalState, name: string, target?: string): MechanicalOperation {
  const a = s.abilities!.find(a => a.name === name)!;
  return { kind: "ability", ability: a.id, version: a.version, ...(target ? { target } : {}) };
}
const act = (s: MechanicalState, id: string, actor: string, ...ops: MechanicalOperation[]) => commitMechanical(s, prepareMechanical(s, id, actor, ops));
const value = (s: MechanicalState, id: string) => s.resources.find(r => r.id === id)!.current;

test("one sourced action pays once and combines armor, resistance, shield depletion and bounded reflection", () => {
  const before = initial(), receipt = prepareMechanical(before, "pulse", "you", [use(before, "Pulse", "the guard")]);
  expect(receipt.status).toBe("ready");
  const after = commitMechanical(before, receipt);
  expect(value(after, "energy")).toBe(18);
  expect(value(after, "jo-shield")).toBe(0);
  expect(value(after, "jo-hp")).toBe(33);
  expect(value(after, "hp")).toBe(36.5);
  expect(receipt.beats!.filter(e => e.kind === "damage")).toHaveLength(2);
  expect(receipt.beats![0]).toMatchObject({ actor: "you", target: "Jo", amount: 7, absorbed: 5, resisted: 8, reflected: 3.5 });
  expect(commitMechanical(after, receipt)).toBe(after);
  expect(value(before, "jo-shield")).toBe(5);
});

test("immunity and unavailable targets reject before cost, while zero health does not imply death", () => {
  const s = initial(); s.conditions[0].defenses!.push({ kind: "immunity", amount: 0, damageType: "physical" });
  expect(prepareMechanical(s, "immune", "you", [use(s, "Pulse", "Jo")]).reason).toContain("immunity");
  s.conditions = []; s.entities![0].present = false;
  expect(prepareMechanical(s, "absent", "you", [use(s, "Pulse", "Jo")]).reason).toContain("present");
  s.entities![0].present = true; s.resources.find(r => r.id === "jo-hp")!.current = 0;
  expect(prepareMechanical(s, "down", "you", [use(s, "Pulse", "Jo")]).status).toBe("blocked");
  expect(s.entities![0].status).toBe("active");
  expect(value(s, "energy")).toBe(20);
});

test("range makes movement useful and a failed dependent plan rolls back its movement too", () => {
  const s = initial(); s.resources.push({ ...s.resources[2], id: "lee-hp", owner: "Lee" });
  expect(prepareMechanical(s, "too-far", "you", [use(s, "Pulse", "Lee")]).reason).toContain("outside near range");
  const close = act(s, "advance", "you", { kind: "move", target: "Lee", direction: "closer" }, use(s, "Pulse", "Lee"));
  expect(distance(close, "you", "Lee")).toBe("near");
  expect(value(close, "lee-hp")).toBe(20);
  expect(actionCount(close, "you")).toBe(2);
  s.resources[0].current = 0;
  const blocked = prepareMechanical(s, "poor-plan", "you", [{ kind: "move", target: "Lee", direction: "closer" }, use(s, "Pulse", "Lee")]);
  expect(blocked.status).toBe("blocked");
  expect(blocked.changes).toEqual([]);
  expect(distance(s, "you", "Lee")).toBe("far");
});

test("cooldowns follow the owner's actual actions, never inspection or another participant's actions", () => {
  let s = initial(); const id = s.abilities![0].id;
  s = act(s, "first", "you", use(s, "Pulse", "Jo"));
  expect(cooldownRemaining(s, "you", id)).toBe(1);
  expect(prepareMechanical(s, "early", "you", [use(s, "Pulse", "Jo")]).status).toBe("blocked");
  const ownClock = actionCount(s, "you");
  s = act(s, "jo-waits", "Jo", { kind: "wait" });
  expect(actionCount(s, "you")).toBe(ownClock);
  expect(cooldownRemaining(s, "you", id)).toBe(1);
  s = act(s, "wait", "you", { kind: "wait" });
  expect(cooldownRemaining(s, "you", id)).toBe(0);
  expect(prepareMechanical(s, "again", "you", [use(s, "Pulse", "Jo")]).status).toBe("ready");
});

test("using a carried supply advances an existing cooldown once, while ability costs never tick it twice", () => {
  let s = initial(); s.items.push({ id: "supply", name: "Supply", owner: "you", quantity: 2, equipped: false, source: evidence });
  s = act(s, "pulse", "you", use(s, "Pulse", "Jo"));
  expect(actionCount(s, "you")).toBe(1);
  s = act(s, "supply", "you", { kind: "consume", item: "supply", amount: 1 });
  expect(actionCount(s, "you")).toBe(2);
  expect(cooldownRemaining(s, "you", s.abilities![0].id)).toBe(0);
});

test("guarding reduces physical damage until the defender next acts", () => {
  let s = initial(); s = act(s, "guard", "Jo", { kind: "defend" });
  s = act(s, "shot", "you", use(s, "Pulse", "Jo"));
  // 20 - 4 armor; 25% ward + 50% guard; 5 shield absorbs all remaining 4.
  expect(value(s, "jo-hp")).toBe(40);
  expect(value(s, "jo-shield")).toBe(1);
  expect(s.conditions.some(c => c.name === "Guarding")).toBe(true);
  s = act(s, "step-away", "Jo", { kind: "move", target: "you", direction: "away" });
  expect(s.conditions.some(c => c.name === "Guarding")).toBe(false);
});

test("temporary effects follow their affected owner and a repeat refreshes without stacking", () => {
  let s = initial(); s = act(s, "bind", "you", use(s, "Bind", "Jo"));
  expect(conditionInfluence(s, "Jo", "movement", "you", undefined, true).blocked).toContain("Bound");
  expect(prepareMechanical(s, "blocked-step", "Jo", [{ kind: "move", target: "you", direction: "away" }]).status).toBe("blocked");
  s = act(s, "skip", "Jo", { kind: "wait" });
  expect(prepareMechanical(s, "free-step", "Jo", [{ kind: "move", target: "you", direction: "away" }]).status).toBe("ready");
  s = act(s, "ward", "you", use(s, "Ward"));
  s = act(s, "ward-again", "you", use(s, "Ward"));
  expect(s.conditions.filter(c => c.name === "Ward")).toHaveLength(1);
  expect(s.conditions.find(c => c.name === "Ward")?.defenses?.[0].amount).toBe(10);
  s = act(s, "pass-1", "you", { kind: "wait" });
  s = act(s, "pass-2", "you", { kind: "wait" });
  expect(s.conditions.some(c => c.name === "Ward")).toBe(true);
  s = act(s, "pass-3", "you", { kind: "wait" });
  expect(s.conditions.some(c => c.name === "Ward")).toBe(false);
});

test("identity observations unify ownership aliases while profile text cannot materialize people in the scene", () => {
  const s = initial(); expect(s.resources.find(r => r.id === "jo-hp")!.owner).toBe("Jo");
  expect(actorName(s, "Masked guard")).toBe("Jo");
  const profile = definitionSource("card", "Lee is alive and is here at touch distance.")!;
  const rows = [{ kind: "entity", name: "Lee", entityKind: "person", present: true, status: "dead", message: profile.id, quote: profile.text }];
  const projected = applyObservations(emptyMechanics(), readMechanicalObservations(rows, emptyMechanics(), [{ id: profile.id, content: profile.text, is_user: false }]));
  expect(projected.entities![0]).toMatchObject({ present: false, status: "active" });
  const later = { id: "later", content: "The masked guard reveals her name is Mara.", is_user: false };
  const changed = applyObservations(s, readMechanicalObservations([{ kind: "entity", name: "Masked guard", displayName: "Mara", aliases: ["Mara"], entityKind: "person", present: true, message: later.id, quote: later.content }], s, [story, later]));
  expect(changed.entities![0].id).toBe(s.entities![0].id);
  expect(actorName(changed, "Mara")).toBe("Jo");
  expect(changed.resources.find(r => r.id === "jo-hp")!.owner).toBe("Jo");
});

test("source definitions reject invented timers/defenses and one player quote cannot duplicate an execution", () => {
  const s = initial(), a = s.abilities![0];
  const attempt = [{ kind: "ability", ability: a.id, quote: "I use Pulse on Jo." }];
  expect(() => readMechanicalPlan([...attempt, ...attempt], s, attempt[0].quote)).toThrow("twice");
  expect(readMechanicalObservations([{ kind: "item", id: "fake", owner: "you", name: "Vest", quantity: 1, equipped: true, defenses: [{ kind: "armor", amount: 100, damageType: "all" }], ...evidence }], s, [story])).toEqual([]);
  const raw = { ...a, cooldown: 17, message: source.id, quote: source.text };
  expect(readAbilityDefinitions([raw], emptyMechanics(), [], [source])).toEqual([]);
});

test("later movement evidence can update distance, while the receipt's own reply cannot contradict it", () => {
  const s = initial(), receipt = prepareMechanical(s, "retreat", "you", [{ kind: "move", target: "Jo", direction: "away" }]);
  const moved = commitMechanical(s, receipt);
  const ownReply = { id: "retreat-reply", is_user: false, content: "You step away from Jo.", metadata: { [MECHANICS_KEY]: { "0": { receipt } } } };
  const contradiction = { kind: "distance", from: "you", to: "Jo", band: "near", message: ownReply.id, quote: ownReply.content };
  expect(readMechanicalObservations([contradiction], moved, [story, ownReply])).toEqual([]);
  const later = { id: "later-move", is_user: false, content: "Jo approaches and is near you again." };
  const changed = applyObservations(moved, readMechanicalObservations([{ ...contradiction, message: later.id, quote: later.content }], moved, [story, ownReply, later]));
  expect(distance(changed, "you", "Jo")).toBe("near");
  const correction = { id: "fix", is_user: true, content: "(OOC correction: Jo is at touch distance.)" };
  const corrected = applyObservations(moved, readMechanicalObservations([{ ...contradiction, band: "touch", message: correction.id, quote: correction.content }], moved, [story, ownReply, correction]));
  expect(distance(corrected, "you", "Jo")).toBe("touch");
});

test("actual presence supersedes a profile identity even when profile sources follow the scene in helper context", () => {
  const card = definitionSource("card", "Jo is a guard with the alias Masked guard.")!;
  const profile = { id: card.id, is_user: false, content: card.text };
  const identity = { kind: "entity", name: "Jo", aliases: ["Masked guard"], entityKind: "person", present: true, message: card.id, quote: card.text };
  const first = applyObservations(emptyMechanics(), readMechanicalObservations([identity], emptyMechanics(), [profile]));
  expect(first.entities![0].present).toBe(false);
  const observed = applyObservations(first, readMechanicalObservations([{ ...identity, message: story.id, quote: "Jo, the masked guard, stands near you." }], first, [story, profile]));
  expect(observed.entities![0].present).toBe(true);
  expect(readMechanicalObservations([identity], observed, [story, profile])).toEqual([]);
});

test("adding shared identity preserves existing ownership and cannot merge two established people", () => {
  const s = initial(); s.entities = [];
  const row = { kind: "entity", name: "Masked guard", aliases: ["jo"], entityKind: "person", present: true, ...evidence };
  const identified = applyObservations(s, readMechanicalObservations([row], s, [story]));
  expect(identified.entities![0].name).toBe("Jo");
  expect(actorName(identified, "Masked guard")).toBe("Jo");
  expect(identified.resources).toEqual(s.resources);
  s.resources.push({ ...s.resources[0], id: "lee-energy", owner: "Lee" });
  expect(readMechanicalObservations([{ ...row, aliases: ["Jo", "Lee"] }], s, [story])).toEqual([]);
  const player = applyObservations(emptyMechanics(), readMechanicalObservations([{ ...row, name: "Sam", aliases: [] }], emptyMechanics(), [story], "Sam"));
  expect(player.entities![0].name).toBe("you");
  expect(actorName(player, "Sam")).toBe("you");
});

test("shields using a labelled Warp magnitude survive definition replay with their timer", () => {
  const card = definitionSource("persona", "Ward creates a small shield for 2 subsequent actions.")!;
  const a = readAbilityDefinitions([{ owner: "you", name: "Ward", approach: "concentration", target: "self", costs: [], effects: [{ kind: "defense", target: "self", name: "Small ward", defense: { kind: "shield", damageType: "all" }, magnitude: "minor", ending: "After 2 owner actions", duration: 2 }], message: card.id, quote: card.text }], emptyMechanics(), [], [card])[0];
  expect(a.effects[0]).toMatchObject({ basis: "warp", defense: { amount: 5 }, duration: 2 });
  const m = { ...story, role: "assistant", swipe_id: 0, index_in_chat: 0, metadata: { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf([]), text: revision(story.content), observations: [{ kind: "ability", value: a }], sources: [card] } } } } as unknown as Msg;
  const projected = foldMechanics([m]);
  expect(projected.abilities).toEqual([a]);
  const after = act(projected, "ward", "you", use(projected, "Ward"));
  expect(after.conditions[0].defenses![0].amount).toBe(5);
  expect(after.conditions[0].expiresAt).toBe(4);
});

test("two reflecting targets cannot recurse and a spent shield cannot absorb the next independent packet", () => {
  let s = initial();
  s.conditions.push({ ...s.conditions[0], id: "self-reflect", name: "Mirror", owner: "you", defenses: [{ kind: "reflect", damageType: "all", amount: 100 }] });
  const one = prepareMechanical(s, "first", "you", [use(s, "Pulse", "Jo")]);
  expect(one.beats!.filter(b => b.kind === "damage")).toHaveLength(2);
  s = commitMechanical(s, one); s = act(s, "wait", "you", { kind: "wait" });
  const two = prepareMechanical(s, "second", "you", [use(s, "Pulse", "Jo")]);
  expect(two.beats!.filter(b => b.kind === "damage")).toHaveLength(2);
  expect(two.beats![0]).toMatchObject({ amount: 12, absorbed: 0, resisted: 8, reflected: 6 });
  expect(s.resources.every(r => r.current >= 0)).toBe(true);
});

test("saved encounter receipts replay clocks, exhausted shields, aliases and timed effects exactly", () => {
  const start = initial();
  const greeting = { ...story, role: "assistant", swipe_id: 0, index_in_chat: 0 } as Msg;
  const observations: any[] = [
    ...start.entities!.map(value => ({ kind: "entity", value })), ...start.distances!.map(value => ({ kind: "distance", value })),
    ...start.resources.map(value => ({ kind: "resource", value })), ...start.items.map(value => ({ kind: "item", value })), ...start.conditions.map(value => ({ kind: "condition", value })), ...start.abilities!.map(value => ({ kind: "ability", value })),
  ];
  greeting.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf([]), text: revision(story.content), observations, sources: [source] } } };
  const before = foldMechanics([greeting]); expect(before).toEqual(start);
  const player = { id: "player", role: "user", is_user: true, content: "I use Pulse on the guard.", swipe_id: 0, index_in_chat: 1 } as Msg;
  const reply = { id: "reply", role: "assistant", is_user: false, content: "The shield absorbs part of the pulse.", swipe_id: 0, index_in_chat: 2 } as Msg;
  const receipt = prepareMechanical(before, "pulse", "you", [use(before, "Pulse", "the guard")]);
  reply.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf([greeting, player]), text: revision(reply.content), receipt, observations: [] } } };
  expect(foldMechanics([greeting, player, reply])).toEqual(commitMechanical(before, receipt));
  const tampered = structuredClone(receipt); tampered.beats![0].amount = 900;
  expect(() => commitMechanical(before, tampered)).toThrow("resolution");
  const alteredClock = structuredClone(receipt); alteredClock.result = "fake";
  expect(() => commitMechanical(before, alteredClock)).toThrow("resolution");
  reply.swipe_id = 1; expect(foldMechanics([greeting, player, reply])).toEqual(before);
});

test("pre-encounter receipts retain their saved arithmetic and never gain new clocks or defenses", () => {
  const s = initial(), operation = use(s, "Pulse", "Jo");
  s.abilities![0].range = undefined; s.abilities![0].cooldown = undefined;
  const resource = s.resources.find(r => r.id === "jo-hp")!, energy = s.resources[0];
  const legacy = { version: 1 as const, id: "old", input: "old-input", base: revision(s), actor: "you", operations: [operation], status: "ready" as const,
    changes: [
      { kind: "resource" as const, id: energy.id, before: structuredClone(energy), after: { ...energy, current: 18 } },
      { kind: "resource" as const, id: resource.id, before: structuredClone(resource), after: { ...resource, current: 20 } },
    ] };
  const after = commitMechanical(s, legacy);
  expect(value(after, "jo-hp")).toBe(20);
  expect(value(after, "jo-shield")).toBe(5);
  expect(after.clocks).toBeUndefined();
});
