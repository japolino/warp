import { expect, test } from "bun:test";
import { applyObservations, commitMechanical, emptyMechanics, prepareMechanical, prepareExchange, readMechanicalObservations, readMechanicalPlan, mechanicalNotes, conditionInfluence } from "./mechanics.js";
import { currentSite, placeId, explorationPacket, findPlace } from "./exploration.js";
import { foldMechanics, MECHANICS_KEY } from "./mechanical-history.js";
import { pathOf } from "./world.js";
import { storyRevision } from "./story-text.js";
import type { Msg } from "../backend/ledger.js";

const opening = { id: "g", is_user: false, content: "You stand in the Dock. The wall map shows an open corridor between the Dock and Clinic in both directions, and a locked hatch from the Clinic to the Attic. The supply log lists three free Rations within reach in the Clinic. A broken scanner lies in the Dock." };
const cited = (quote: string, extra: object) => ({ ...extra, message: opening.id, quote });
const rows = [
  cited("The supply log lists three free Rations within reach in the Clinic.", { kind: "stock", site: "Clinic", name: "Rations", quantity: 3, available: true }),
  cited("You stand in the Dock.", { kind: "place", name: "Dock", entered: true }),
  cited("an open corridor between the Dock and Clinic in both directions", { kind: "place", name: "Clinic" }),
  cited("a locked hatch from the Clinic to the Attic", { kind: "place", name: "Attic" }),
  cited("an open corridor between the Dock and Clinic in both directions", { kind: "route", from: "Dock", to: "Clinic", via: "corridor", bidirectional: true, status: "open" }),
  cited("a locked hatch from the Clinic to the Attic", { kind: "route", from: "Clinic", to: "Attic", via: "hatch", bidirectional: false, status: "blocked", reason: "Locked" }),
  cited("A broken scanner lies in the Dock.", { kind: "discovery", site: "Dock", name: "Scanner", text: "Broken scanner" }),
];
const bootstrap = () => applyObservations(emptyMechanics(), readMechanicalObservations(rows, emptyMechanics(), [opening]));
const go = (state = bootstrap(), route = state.routes![0].id) => prepareMechanical(state, "travel", "you", [{ kind: "travel", route }]);

test("actual map knowledge prepares topology without moving to unvisited rooms or creating other meters", () => {
  const state = bootstrap();
  expect(state.places?.map(p => [p.name, p.visited])).toEqual([["Dock", true], ["Clinic", false], ["Attic", false]]);
  expect(currentSite(state)?.site).toBe(placeId("Dock"));
  expect(state.routes).toHaveLength(2); expect(state.stocks![0].quantity).toBe(3);
  expect(state.resources).toEqual([]); expect(state.items).toEqual([]); expect(state.clocks).toBeUndefined();
});

test("travel, gathering and returning preserve the broken object and conserve the actual remaining stock", () => {
  const before = bootstrap(), travel = go(before);
  expect(travel.engine).toBe(6); expect(currentSite(before)?.site).toBe(placeId("Dock"));
  const clinic = commitMechanical(before, travel); expect(currentSite(clinic)?.site).toBe(placeId("Clinic"));
  expect(currentSite(applyObservations(clinic, readMechanicalObservations(rows, clinic, [opening])))?.site).toBe(placeId("Clinic"));
  const gather = prepareMechanical(clinic, "gather", "you", [{ kind: "gather", stock: clinic.stocks![0].id, amount: 2 }]);
  const collected = commitMechanical(clinic, gather);
  expect(mechanicalNotes(gather)).toEqual(["Rations: 1 left here", "Collected 2 Rations"]);
  expect(collected.stocks![0].quantity).toBe(1); expect(collected.items[0].quantity).toBe(2);
  expect(commitMechanical(collected, gather)).toBe(collected);
  const returned = commitMechanical(collected, prepareMechanical(collected, "return", "you", [{ kind: "travel", route: collected.routes![0].id }]));
  expect(currentSite(returned)?.site).toBe(placeId("Dock"));
  expect(returned.discoveries![0].text).toBe("Broken scanner"); expect(returned.stocks![0].quantity).toBe(1);
  const reobserved = applyObservations(returned, readMechanicalObservations(rows, returned, [opening]));
  expect(reobserved.stocks![0].quantity).toBe(1); expect(reobserved.items[0].quantity).toBe(2);
});

test("locked, unknown and wrongly directed routes block before spending or moving", () => {
  const before = bootstrap(), clinic = commitMechanical(before, go(before)), hatch = clinic.routes![1].id;
  expect(prepareMechanical(clinic, "locked", "you", [{ kind: "travel", route: hatch }]).reason).toContain("Locked");
  const unknown = structuredClone(clinic); unknown.routes![1].status = "unknown";
  expect(prepareMechanical(unknown, "unknown", "you", [{ kind: "travel", route: hatch }]).unresolved).toBe(true);
  expect(prepareMechanical(before, "wrong-place", "you", [{ kind: "travel", route: hatch }]).status).toBe("blocked");
  const oneWay = structuredClone(clinic); oneWay.routes![0].bidirectional = false;
  expect(prepareMechanical(oneWay, "reverse", "you", [{ kind: "travel", route: oneWay.routes![0].id }]).status).toBe("blocked");
  expect(currentSite(clinic)?.site).toBe(placeId("Clinic")); expect(clinic.items).toEqual([]);
  const toll = structuredClone(clinic); toll.routes![0].unsupported = ["An established toll still needs payment"];
  expect(prepareMechanical(toll, "unmapped-toll", "you", [{ kind: "travel", route: toll.routes![0].id }]).unresolved).toBe(true);
});

test("a later bad operation rolls back the whole travel-and-gather plan, and a setback grants no destination or supplies", () => {
  const state = bootstrap(), stock = state.stocks![0].id, route = state.routes![0].id;
  const blocked = prepareMechanical(state, "too-many", "you", [{ kind: "travel", route }, { kind: "gather", stock, amount: 4 }]);
  expect(blocked.status).toBe("blocked"); expect(blocked.changes).toEqual([]);
  expect(currentSite(state)?.site).toBe(placeId("Dock")); expect(state.stocks![0].quantity).toBe(3);
  const failed = commitMechanical(state, prepareMechanical(state, "failed-trip", "you", [{ kind: "travel", route, outcome: "setback" }]));
  expect(currentSite(failed)?.site).toBe(placeId("Dock")); expect(failed.items).toEqual([]);
  const clinic = commitMechanical(state, go(state));
  const missed = commitMechanical(clinic, prepareMechanical(clinic, "failed-gather", "you", [{ kind: "gather", stock, amount: 2, outcome: "setback" }]));
  expect(missed.stocks![0].quantity).toBe(3); expect(missed.items).toEqual([]);
});

test("gathering cannot reach another place, take inaccessible supplies, or invent a count", () => {
  const state = bootstrap(), stock = state.stocks![0].id;
  expect(prepareMechanical(state, "remote", "you", [{ kind: "gather", stock, amount: 1 }]).status).toBe("blocked");
  const clinic = commitMechanical(state, go(state)); clinic.stocks![0].available = false;
  expect(prepareMechanical(clinic, "locked-cache", "you", [{ kind: "gather", stock, amount: 1 }]).status).toBe("blocked");
  expect(() => readMechanicalPlan([{ kind: "gather", stock, amount: 2, quote: "I take one Ration." }], clinic, "I take one Ration.")).toThrow();
  expect(readMechanicalPlan([{ kind: "gather", stock, amount: 1, quote: "I take one Ration." }], clinic, "I take one Ration.")).toEqual([{ kind: "gather", stock, amount: 1 }]);
});

test("player attempts and hidden card maps cannot create places, clues, access or inventory", () => {
  const attempt = { ...opening, id: "u", is_user: true }, card = { ...opening, id: "warp-source:card:hidden" };
  expect(readMechanicalObservations(rows.map(r => ({ ...r, message: "u" })), emptyMechanics(), [attempt])).toEqual([]);
  expect(readMechanicalObservations(rows.map(r => ({ ...r, message: card.id })), emptyMechanics(), [card])).toEqual([]);
  expect(readMechanicalObservations([cited("You stand in the Dock.", { kind: "place", name: "Secret cellar", entered: true })], emptyMechanics(), [opening])).toEqual([]);
});

test("narrated access and local changes update independently without refilling a depleted cache", () => {
  const state = bootstrap(), clinic = commitMechanical(state, go(state));
  const used = commitMechanical(clinic, prepareMechanical(clinic, "empty", "you", [{ kind: "gather", stock: clinic.stocks![0].id, amount: 3 }]));
  const change = { id: "change", is_user: false, content: "The hatch to the Attic opens. The cabinet in the Clinic is now locked." };
  const obs = readMechanicalObservations([{ kind: "route", id: used.routes![1].id, status: "open", message: change.id, quote: "The hatch to the Attic opens." }, { kind: "stock_access", site: "Clinic", stock: used.stocks![0].id, available: false, message: change.id, quote: "The cabinet in the Clinic is now locked." }], used, [opening, change]);
  const updated = applyObservations(used, obs);
  expect(updated.routes![1].status).toBe("open"); expect(updated.stocks![0].available).toBe(false); expect(updated.stocks![0].quantity).toBe(0);
  expect(updated.discoveries![0].text).toBe("Broken scanner");
  const stale = applyObservations(updated, readMechanicalObservations(rows, updated, [opening, change]));
  expect(stale.routes![1].status).toBe("open"); expect(stale.stocks![0].quantity).toBe(0);
});

test("saved exploration receipts replay on the selected branch and real history edits invalidate the projection", () => {
  const greeting = { ...opening, index_in_chat: 0, role: "assistant", swipe_id: 0 } as Msg;
  const observations = readMechanicalObservations(rows, emptyMechanics(), [greeting]);
  greeting.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf([]), text: storyRevision(greeting.content), observations } } };
  const player = { id: "u", content: "I go to the Clinic and take two Rations.", is_user: true, index_in_chat: 1, role: "user", swipe_id: 0 } as Msg;
  const before = foldMechanics([greeting]), receipt = prepareMechanical(before, "trip-and-gather", "you", [{ kind: "travel", route: before.routes![0].id }, { kind: "gather", stock: before.stocks![0].id, amount: 2 }]);
  const reply = { id: "r", content: "You arrive and take the rations.", is_user: false, role: "assistant", index_in_chat: 2, swipe_id: 0, metadata: { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf([greeting, player]), text: storyRevision("You arrive and take the rations."), receipt, observations: [] } } } } as unknown as Msg;
  expect(foldMechanics([greeting, player, reply])).toEqual(commitMechanical(before, receipt));
  reply.swipe_id = 1; expect(foldMechanics([greeting, player, reply]).stocks![0].quantity).toBe(3);
  reply.swipe_id = 0; player.content = "I stay in the Dock.";
  expect(foldMechanics([greeting, player, reply]).places).toBeUndefined();
});

test("prompt retrieval stays bounded while retaining an explicitly requested distant place and older named supplies", () => {
  const state = bootstrap(), source = state.places![0].source;
  for (let i = 0; i < 1000; i++) state.places!.push({ id: `site-${i}`, name: `Annex ${i}`, visited: false, source });
  for (let i = 0; i < 60; i++) state.stocks!.push({ id: `s-${i}`, name: `Supply ${i}`, site: state.places![0].id, quantity: i, available: true, source });
  const packet = explorationPacket(state, "Tell me about Annex 999 and Supply 0.");
  expect(packet.places!.length).toBeLessThanOrEqual(24); expect(packet.stocks!.length).toBeLessThanOrEqual(24); expect(packet.routes!.length).toBeLessThanOrEqual(48);
  expect(packet.places!.some(p => p.id === "site-999")).toBe(true); expect(packet.stocks!.some(s => s.id === "s-0")).toBe(true);
  expect(state.places).toHaveLength(1003); expect(state.stocks).toHaveLength(61);
});

test("a successful departure leaves people and loose objects behind, carries owned equipment, and prevents an old-scene counterattack", () => {
  const state = bootstrap(), source = { message: "guard", quote: "A masked guard waits in the Dock and reaches for you." };
  const guard = { id: "guard", name: "guard", displayName: "masked guard", aliases: [], entityKind: "person" as const, present: true, status: "active" as const, source };
  state.entities = [guard, { ...guard, id: "scanner", name: "scanner", displayName: "scanner", entityKind: "object" }, { ...guard, id: "compass", name: "compass", displayName: "Compass", entityKind: "object" }];
  state.items.push({ id: "owned-compass", owner: "you", name: "Compass", quantity: 1, equipped: true, source });
  state.distances = [{ id: "near-guard", from: "you", to: "guard", band: "touch", source }];
  const receipt = prepareExchange(state, "escape", "you", [{ kind: "travel", route: state.routes![0].id }], [{ actor: "guard", action: { kind: "strike", target: "you" }, source, assessment: { contested: true, tier: "uncertain", intent: "Grab the visitor", stakes: "Miss the grab", reasons: ["The guard is close"] } }]);
  expect(receipt.status).toBe("ready");
  const after = commitMechanical(state, receipt);
  expect(after.entities?.map(e => [e.name, e.present])).toEqual([["guard", false], ["scanner", false], ["compass", true]]);
  expect(after.entities![0].source).toEqual(source); expect(after.distances).toEqual([]); expect(after.conditions).toEqual([]);
  expect(receipt.beats?.some(b => b.kind === "skipped" && b.actor === "guard")).toBe(true);
});

test("same-named rooms retain their containing places, and a local effect cannot leak into the other Bedroom", () => {
  const story = { id: "rooms", is_user: false, content: "You stand in the Tower's Bedroom. The Cottage also has a Bedroom. The floor in the Tower's Bedroom hums." };
  const quote = story.content, row = (extra: object) => ({ ...extra, message: story.id, quote });
  const raw = [row({ kind: "place", name: "Bedroom", parent: "Tower", entered: true }), row({ kind: "place", name: "Bedroom", parent: "Cottage" }), row({ kind: "place", name: "Tower" }), row({ kind: "place", name: "Cottage" })];
  const state = applyObservations(emptyMechanics(), readMechanicalObservations(raw, emptyMechanics(), [story]));
  expect(state.places).toHaveLength(4); expect(findPlace(state, "Bedroom")).toBeUndefined();
  const towerRoom = state.places!.find(p => p.name === "Bedroom" && p.parent === placeId("Tower"))!, cottageRoom = state.places!.find(p => p.name === "Bedroom" && p.parent === placeId("Cottage"))!;
  expect(towerRoom.id).not.toBe(cottageRoom.id); expect(currentSite(state)?.site).toBe(towerRoom.id);
  const hazard = row({ kind: "condition", id: "hum", name: "Humming floor", owner: "you", place: towerRoom.id, hinders: ["concentration"], blocks: [], helps: [], ending: "Until the hum stops" });
  const affected = applyObservations(state, readMechanicalObservations([hazard], state, [story]));
  expect(conditionInfluence(affected, "you", "concentration", undefined, "Bedroom").shift).toBe(-1);
  affected.positions![0].site = cottageRoom.id;
  expect(conditionInfluence(affected, "you", "concentration", undefined, "Bedroom").shift).toBe(0);
  expect(readMechanicalObservations([{ ...hazard, place: "Bedroom" }], state, [story])).toEqual([]);
  expect(readMechanicalObservations([row({ kind: "place", name: "Bedroom", entered: true })], state, [story])).toEqual([]);
});

test("a cyclic or ungrounded parent cannot invent a room hierarchy", () => {
  const story = { id: "cycle", is_user: false, content: "The Tower has a Bedroom." }, row = (extra: object) => ({ ...extra, message: story.id, quote: story.content });
  expect(readMechanicalObservations([row({ kind: "place", name: "Tower", parent: "Bedroom" }), row({ kind: "place", name: "Bedroom", parent: "Tower" })], emptyMechanics(), [story])).toEqual([]);
  const state = applyObservations(emptyMechanics(), readMechanicalObservations([row({ kind: "place", name: "Tower", entered: true })], emptyMechanics(), [story]));
  const cottage = { id: "cottage", is_user: false, content: "A map names the distant Cottage." };
  const known = applyObservations(state, readMechanicalObservations([{ kind: "place", name: "Cottage", message: cottage.id, quote: cottage.content }], state, [story, cottage]));
  const room = { id: "room", is_user: false, content: "A Bedroom opens to a balcony." };
  expect(readMechanicalObservations([{ kind: "place", name: "Bedroom", parent: "Cottage", entered: true, message: room.id, quote: room.content }], known, [story, cottage, room])).toEqual([]);
});
