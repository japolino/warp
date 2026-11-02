import { expect, test } from "bun:test";
import { definitionSource, readAbilityDefinitions } from "./abilities.js";
import { emptyMechanics, applyObservations, prepareMechanical, commitMechanical, readMechanicalPlan } from "./mechanics.js";
import { readMechanicalObservations } from "./mechanics.js";
import { foldMechanics, MECHANICS_KEY } from "./mechanical-history.js";
import { pathOf } from "./world.js";
import { revision } from "../shared/revision.js";
import type { Msg } from "../backend/ledger.js";

const persona = "Sam has 10 Focus and 2 of 10 Composure. Grounding costs 2 Focus and restores 3 Composure.";
const source = definitionSource("persona", persona)!;
function state() {
  const state = emptyMechanics();
  const evidence = { message: source.id, quote: persona };
  state.resources = [{ id: "focus", name: "Focus", owner: "you", current: 10, max: 10, source: evidence }, { id: "composure", name: "Composure", owner: "you", current: 2, max: 10, source: evidence }];
  return state;
}
const raw = () => ({ owner: "you", name: "Grounding", description: "Regain composure", approach: "concentration", target: "self", costs: [{ kind: "resource", id: "focus", amount: 2 }], effects: [{ kind: "restore", target: "self", resource: "Composure", amount: 3 }], requires: [], unsupported: [], message: source.id, quote: "Grounding costs 2 Focus and restores 3 Composure." });
const compiled = () => {
  const before = state(), ability = readAbilityDefinitions([raw()], before, [], [source])[0];
  return applyObservations(before, [{ kind: "ability", value: ability }]);
};

test("source-backed content compiles to a stable owned definition without a rulebook", () => {
  const before = state(), ability = readAbilityDefinitions([raw()], before, [], [source])[0];
  expect(ability.version).toBe(1); expect(ability.owner).toBe("you");
  expect(ability.effects[0].basis).toBe("source");
  const withAbility = applyObservations(before, [{ kind: "ability", value: ability }]);
  expect(readAbilityDefinitions([{ ...raw(), costs: [{ kind: "resource", id: "focus", amount: 3 }] }], withAbility, [], [source])).toEqual([]);
  expect(withAbility.abilities?.[0].costs[0].amount).toBe(2);
});

test("ability costs and positive effects execute once and remain atomic", () => {
  const before = compiled(), ability = before.abilities![0];
  const receipt = prepareMechanical(before, "ground", "you", [{ kind: "ability", ability: ability.id, version: 1, target: "you" }]);
  expect(receipt.status).toBe("ready");
  const after = commitMechanical(before, receipt);
  expect(after.resources[0].current).toBe(8); expect(after.resources[1].current).toBe(5);
  expect(commitMechanical(after, receipt)).toBe(after);
  const depleted = structuredClone(before); depleted.resources[0].current = 1;
  expect(prepareMechanical(depleted, "fail", "you", receipt.operations).status).toBe("blocked");
  expect(depleted.resources[1].current).toBe(2);
});

test("an executed setback spends the established cost without the successful effect", () => {
  const before = compiled(), ability = before.abilities![0];
  const after = commitMechanical(before, prepareMechanical(before, "failed", "you", [{ kind: "ability", ability: ability.id, version: 1, outcome: "setback" }]));
  expect(after.resources[0].current).toBe(8); expect(after.resources[1].current).toBe(2);
});

test("a changed source creates a new version without rewriting the old definition", () => {
  const before = compiled(), old = structuredClone(before.abilities![0]);
  const changed = definitionSource("persona", persona.replace("costs 2", "costs 1"))!;
  const next = readAbilityDefinitions([{ ...raw(), costs: [{ kind: "resource", id: "focus", amount: 1 }], quote: "Grounding costs 1 Focus and restores 3 Composure.", message: changed.id }], before, [], [changed])[0];
  expect(next.version).toBe(2); expect(next.id).toBe(old.id);
  expect(old.costs[0].amount).toBe(2);
  const upgraded = applyObservations(before, [{ kind: "ability", value: next }]);
  expect(prepareMechanical(upgraded, "stale", "you", [{ kind: "ability", ability: next.id, version: 1 }]).status).toBe("blocked");
});

test("unsourced numbers, unowned costs and invented player abilities do not compile", () => {
  expect(readAbilityDefinitions([{ ...raw(), effects: [{ kind: "restore", target: "self", resource: "Composure", amount: 999 }] }], state(), [], [source])).toEqual([]);
  expect(readAbilityDefinitions([{ ...raw(), costs: [{ kind: "resource", id: "not-owned", amount: 2 }] }], state(), [], [source])).toEqual([]);
  const player = { id: "attempt", is_user: true, content: "I create Grounding costs 2 Focus and restores 3 Composure." };
  expect(readAbilityDefinitions([{ ...raw(), message: player.id }], state(), [player])).toEqual([]);
});

test("a missing numerical effect uses a fixed labelled magnitude, not model arithmetic", () => {
  const source = definitionSource("card", "Jo's breathing exercise restores composure without consuming resources.")!;
  const rows = readAbilityDefinitions([{ ...raw(), owner: "Jo", costs: [], message: source.id, quote: source.text, effects: [{ kind: "restore", target: "self", resource: "Composure", magnitude: "minor" }] }], state(), [], [source]);
  expect(rows[0].effects[0].amount).toBe(5); expect(rows[0].effects[0].basis).toBe("warp");
  expect(rows[0].owner).toBe("Jo");
  const withAbility = applyObservations(state(), [{ kind: "ability", value: rows[0] }]);
  expect(prepareMechanical(withAbility, "stolen", "you", [{ kind: "ability", ability: rows[0].id, version: 1 }]).status).toBe("blocked");
});

test("unsupported restrictions, absent targets and missing effect resources block before spending", () => {
  const before = compiled(), ability = before.abilities![0];
  ability.unsupported = ["Requires a full combat round of preparation"];
  expect(prepareMechanical(before, "unsupported", "you", [{ kind: "ability", ability: ability.id, version: 1 }]).status).toBe("blocked");
  ability.unsupported = []; ability.target = "other";
  expect(prepareMechanical(before, "target", "you", [{ kind: "ability", ability: ability.id, version: 1 }]).status).toBe("blocked");
  ability.target = "self"; ability.effects[0].resource = "unknown";
  expect(prepareMechanical(before, "unknown", "you", [{ kind: "ability", ability: ability.id, version: 1, outcome: "setback" }]).status).toBe("blocked");
  expect(before.resources[0].current).toBe(10);
});

test("a saved Warp-valued definition replays with exactly the same generated amount", () => {
  const greeting = { id: "greeting", is_user: false, role: "assistant", content: "You have 2 of 10 Composure.", swipe_id: 0, index_in_chat: 0 } as Msg;
  const source = definitionSource("persona", "Grounding restores composure through a breathing exercise.")!;
  const observations = readMechanicalObservations([{ kind: "resource", id: "composure", owner: "you", name: "Composure", current: 2, max: 10, message: "greeting", quote: greeting.content }], emptyMechanics(), [greeting]);
  const ability = readAbilityDefinitions([{ ...raw(), costs: [], message: source.id, quote: source.text, effects: [{ kind: "restore", target: "self", resource: "Composure", magnitude: "minor" }] }], applyObservations(emptyMechanics(), observations), [greeting], [source])[0];
  greeting.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf([]), text: revision(greeting.content), observations: [...observations, { kind: "ability", value: ability }], sources: [source] } } };
  const projected = foldMechanics([greeting]);
  expect(projected.abilities?.[0]).toEqual(ability);
  const receipt = prepareMechanical(projected, "use", "you", [{ kind: "ability", ability: ability.id, version: 1 }]);
  expect(commitMechanical(projected, receipt).resources[0].current).toBe(7);
});

test("first aid combines a consumable cost with another person's recovery in one transaction", () => {
  const before = state(); before.resources.push({ ...before.resources[1], id: "dex-health", name: "Health", owner: "Dex", current: 4 });
  before.items.push({ id: "bandage", name: "Bandage", owner: "you", quantity: 1, equipped: false, source: { message: "greeting", quote: "one bandage" } });
  const source = definitionSource("persona", "First aid uses one bandage and restores 5 Health to another person.")!;
  const ability = readAbilityDefinitions([{ ...raw(), name: "First aid", target: "other", approach: "precision", costs: [{ kind: "item", id: "bandage", amount: 1 }], effects: [{ kind: "restore", target: "target", resource: "Health", amount: 5 }], message: source.id, quote: source.text }], before, [], [source])[0];
  const compiled = applyObservations(before, [{ kind: "ability", value: ability }]);
  const operations = [{ kind: "ability" as const, ability: ability.id, version: 1, target: "Dex" }];
  const after = commitMechanical(compiled, prepareMechanical(compiled, "treat", "you", operations));
  expect(after.items[0].quantity).toBe(0);
  expect(after.resources.find(r => r.id === "dex-health")?.current).toBe(9);
  expect(before.items[0].quantity).toBe(1);
  expect(prepareMechanical(compiled, "absent", "you", [{ ...operations[0], target: "Absent stranger" }]).status).toBe("blocked");
});

test("unsupported formulas and effect fields cannot silently disappear from a compiled definition", () => {
  expect(readAbilityDefinitions([{ ...raw(), cooldown: 5 }], state(), [], [source])).toEqual([]);
  expect(readAbilityDefinitions([{ ...raw(), effects: [{ kind: "restore", target: "self", resource: "Composure", amount: 3, formula: "infinite()" }] }], state(), [], [source])).toEqual([]);
  expect(readAbilityDefinitions([{ ...raw(), costs: [{ kind: "resource", id: "focus", amount: 2, payer: "someone-else" }] }], state(), [], [source])).toEqual([]);
});

test("invocation numbers cannot override stored costs or charge those costs a second time", () => {
  const before = compiled();
  const operations = readMechanicalPlan([{ kind: "ability", ability: "Grounding", amount: 999, quote: "I use Grounding." }], before, "I use Grounding.");
  const after = commitMechanical(before, prepareMechanical(before, "invoke", "you", operations));
  expect(after.resources[0].current).toBe(8);
  expect(() => readMechanicalPlan([
    { kind: "ability", ability: "Grounding", quote: "I use Grounding and spend 2 Focus." },
    { kind: "spend", resource: "focus", amount: 2, quote: "I use Grounding and spend 2 Focus." },
  ], before, "I use Grounding and spend 2 Focus.")).toThrow("must not also be charged");
});
