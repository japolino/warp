import { expect, test } from "bun:test";
import { emptyMechanics, readMechanicalObservations, applyObservations, prepareMechanical, commitMechanical, readMechanicalPlan, conditionInfluence } from "./mechanics.js";

const scene = { id: "scene", is_user: false, content: "You have 20 coins, 8 of 10 oxygen, and three bandages. Your ankle is injured until treated." };
const raw = [
  { kind: "resource", id: "cash", owner: "you", name: "Coins", current: 20, message: "scene", quote: "You have 20 coins" },
  { kind: "resource", id: "air", owner: "you", name: "Oxygen", current: 8, max: 10, message: "scene", quote: "8 of 10 oxygen" },
  { kind: "item", id: "bandages", owner: "you", name: "Bandages", quantity: 3, message: "scene", quote: "three bandages" },
  { kind: "condition", id: "ankle", owner: "you", name: "Injured ankle", hinders: ["movement"], blocks: [], helps: [], ending: "until treated", message: "scene", quote: "Your ankle is injured until treated." },
];
const bootstrap = () => applyObservations(emptyMechanics(), readMechanicalObservations(raw, emptyMechanics(), [scene]));

test("explicit numeric observations bootstrap a modern scene without inventing other meters", () => {
  const state = bootstrap();
  expect(state.resources.map(r => r.name)).toEqual(["Coins", "Oxygen"]);
  expect(state.items[0].quantity).toBe(3);
  expect(state.resources[0].max).toBeUndefined();
  expect(state.conditions[0].hinders).toEqual(["movement"]);
  const corrupt = raw.map(r => ({ ...r, message: "missing" }));
  expect(readMechanicalObservations(corrupt, emptyMechanics(), [scene])).toEqual([]);
  expect(readMechanicalObservations([{ ...raw[0], current: 999 }], emptyMechanics(), [scene])).toEqual([]);
  expect(readMechanicalObservations(raw, emptyMechanics(), [{ ...scene, is_user: true }])).toEqual([]);
});

test("cost and item consumption are atomic, immutable, and exactly once", () => {
  const before = bootstrap(), receipt = prepareMechanical(before, "pay", "you", [{ kind: "spend", resource: "cash", amount: 5 }, { kind: "consume", item: "bandages", amount: 1 }]);
  expect(receipt.status).toBe("ready");
  expect(before.resources[0].current).toBe(20);
  const after = commitMechanical(before, receipt);
  expect(after.resources[0].current).toBe(15);
  expect(after.items[0].quantity).toBe(2);
  expect(commitMechanical(after, receipt)).toBe(after);
  expect(() => commitMechanical(after, { ...receipt, input: "different" })).toThrow("conflict");
  const blocked = prepareMechanical(before, "bad", "you", [{ kind: "spend", resource: "cash", amount: 5 }, { kind: "consume", item: "bandages", amount: 4 }]);
  expect(blocked.status).toBe("blocked");
  expect(blocked.changes).toEqual([]);
  expect(() => commitMechanical(before, blocked)).toThrow();
  expect(before.resources[0].current).toBe(20);
});

test("stale or tampered receipts cannot change state", () => {
  const before = bootstrap(), receipt = prepareMechanical(before, "cost", "you", [{ kind: "spend", resource: "cash", amount: 5 }]);
  const altered = structuredClone(before); altered.resources[0].current = 19;
  expect(() => commitMechanical(altered, receipt)).toThrow("stale");
  expect(() => commitMechanical(before, { ...receipt, changes: [] })).toThrow("does not match");
  expect(prepareMechanical(before, "wrong-owner", "Dex", [{ kind: "consume", item: "bandages", amount: 1 }]).status).toBe("blocked");
  expect(prepareMechanical(before, "negative", "you", [{ kind: "spend", resource: "cash", amount: -1 }]).status).toBe("blocked");
});

test("fresh prose and repeated old quotes cannot reset authoritative balances", () => {
  const before = bootstrap(), after = commitMechanical(before, prepareMechanical(before, "cost", "you", [{ kind: "spend", resource: "cash", amount: 5 }]));
  expect(readMechanicalObservations(raw, after, [scene])).toEqual([]);
  const wrong = { id: "wrong", is_user: false, content: "You still have 20 coins." };
  expect(readMechanicalObservations([{ ...raw[0], message: "wrong", quote: wrong.content }], after, [scene, wrong])).toEqual([]);
  const fix = { id: "fix", is_user: true, content: "(OOC correction: I have 12 coins.)" };
  const observations = readMechanicalObservations([{ ...raw[0], current: 12, message: "fix", quote: "I have 12 coins." }], after, [scene, fix]);
  expect(applyObservations(after, observations).resources[0].current).toBe(12);
  // An alternate ID cannot be used to mint a second wallet.
  expect(readMechanicalObservations([{ ...raw[0], id: "other-cash" }], after, [scene])).toEqual([]);
});

test("transferring part of a stack conserves quantity and does not equip the recipient", () => {
  const before = bootstrap(), receipt = prepareMechanical(before, "gift", "you", [{ kind: "transfer", item: "bandages", amount: 2, to: "Dex" }]);
  const after = commitMechanical(before, receipt);
  expect(after.items.reduce((n, i) => n + i.quantity, 0)).toBe(3);
  expect(after.items.find(i => i.owner === "you")?.quantity).toBe(1);
  expect(after.items.find(i => i.owner === "Dex")?.quantity).toBe(2);
  expect(after.items.find(i => i.owner === "Dex")?.equipped).toBe(false);
});

test("recovery respects a known cap and cannot invent a missing maximum", () => {
  const before = bootstrap();
  const restored = commitMechanical(before, prepareMechanical(before, "air", "you", [{ kind: "restore", resource: "air", amount: 20 }]));
  expect(restored.resources.find(r => r.id === "air")?.current).toBe(10);
  expect(prepareMechanical(before, "money", "you", [{ kind: "restore", resource: "cash", amount: 1 }]).status).toBe("blocked");
});

test("conditions affect only the relevant approach and end only on evidenced recovery", () => {
  const before = bootstrap();
  expect(conditionInfluence(before, "you", "movement").shift).toBe(-1);
  expect(conditionInfluence(before, "you", "speech").shift).toBe(0);
  expect(conditionInfluence(before, "Dex", "movement").shift).toBe(0);
  const healed = { id: "healed", is_user: false, content: "Your ankle has healed after treatment." };
  const observed = readMechanicalObservations([{ kind: "condition_end", id: "ankle", message: "healed", quote: healed.content }], before, [scene, healed]);
  expect(conditionInfluence(applyObservations(before, observed), "you", "movement").shift).toBe(0);
});

test("suspicion and local terrain do not become universal social or movement penalties", () => {
  const before = bootstrap();
  before.conditions = [{ ...before.conditions[0], id: "suspect", name: "Guard witnessed a lie", targets: ["Guard"], hinders: ["speech"] },
    { ...before.conditions[0], id: "mud", name: "Mud", place: "Courtyard" }];
  expect(conditionInfluence(before, "you", "speech", "Guard").shift).toBe(-1);
  expect(conditionInfluence(before, "you", "speech", "Jo").shift).toBe(0);
  expect(conditionInfluence(before, "you", "speech").shift).toBe(0);
  expect(conditionInfluence(before, "you", "movement", undefined, "Courtyard").shift).toBe(-1);
  expect(conditionInfluence(before, "you", "movement", undefined, "Cafe").shift).toBe(0);
});

test("preparation admits explicit player operations without inventing costs or effects", () => {
  const state = bootstrap();
  expect(readMechanicalPlan([{ kind: "consume", item: "bandages", amount: 1, quote: "I use a bandage." }], state, "I use a bandage.")).toEqual([{ kind: "consume", item: "bandages", amount: 1 }]);
  expect(() => readMechanicalPlan([{ kind: "spend", resource: "cash", amount: 8, quote: "I pay 5 coins." }], state, "I pay 5 coins.")).toThrow();
  expect(() => readMechanicalPlan([{ kind: "spend", resource: "cash", amount: 5, quote: "I have 5 coins." }], state, "I have 5 coins.")).toThrow();
  expect(() => readMechanicalPlan([{ kind: "restore", resource: "air", amount: 100, quote: "I breathe." }], state, "I breathe.")).toThrow();
});
