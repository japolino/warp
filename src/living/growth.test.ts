import { expect, test } from "bun:test";
import { emptyMechanics, readMechanicalObservations, applyObservations, prepareMechanical, prepareExchange, commitMechanical, conditionInfluence, mechanicalNotes, mechanicalPacket, readMechanicalPlan, type MechanicalState, type MechanicalOperation } from "./mechanics.js";
import { readAbilityDefinitions } from "./abilities.js";
import { resolveAttempt } from "./world.js";
import { growthNotes, practiceBenefit, type LearningWitness } from "./growth.js";
import { inspectMechanics } from "./inspector.js";
import { revision } from "../shared/revision.js";

const scene = { id: "start", is_user: false, content: "You have 30 Focus. Ada, Bryn, Cora, Tutor, Uma and Vera are beside you, within reach. Pulse costs 2 Focus and briefly disorients another person." };
function setup() {
  const raw = [
    { kind: "resource", id: "focus", owner: "you", name: "Focus", current: 30, message: scene.id, quote: scene.content },
    ...["Ada", "Bryn", "Cora", "Tutor", "Uma", "Vera"].map(name => ({ kind: "entity", name, entityKind: "person", present: true, message: scene.id, quote: scene.content })),
    ...["Ada", "Bryn", "Cora"].flatMap(to => ["you", "Ada"].filter(from => from !== to).map(from => ({ kind: "distance", from, to, band: "touch", message: scene.id, quote: scene.content }))),
  ];
  let state = applyObservations(emptyMechanics(), readMechanicalObservations(raw, emptyMechanics(), [scene]));
  const a = readAbilityDefinitions([{ owner: "you", name: "Pulse", approach: "concentration", target: "other", costs: [{ kind: "resource", id: "focus", amount: 2 }], effects: [{ kind: "condition", target: "target", name: "Disoriented", hinders: ["perception"], ending: "After a pause" }], requires: [], unsupported: [], message: scene.id, quote: scene.content }], state, [scene])[0];
  return applyObservations(state, [{ kind: "ability", value: a }]);
}
function witness(seed: string): LearningWitness {
  const d = resolveAttempt({ risky: true, contested: true, tier: "uncertain", intent: "Disorient the opponent", stakes: "Lose the opening", reasons: ["The opponent is resisting"] }, seed)!;
  return { seed, tier: d.tier, roll: d.roll!, result: d.result };
}
function action(state: MechanicalState, target: string, w?: LearningWitness): Extract<MechanicalOperation, { kind: "ability" }> {
  const a = state.abilities![0]; return { kind: "ability", ability: a.id, version: a.version, target, outcome: w?.result ?? "clean" };
}
function use(state: MechanicalState, seed: string, target: string) {
  const w = witness(seed), receipt = prepareMechanical(state, seed, "you", [action(state, target, w)], seed, w);
  expect(receipt.status).toBe("ready"); return { after: commitMechanical(state, receipt), receipt };
}

test("three distinct committed challenges earn scoped familiarity without changing source costs or effects", () => {
  let state = setup(); const definition = structuredClone(state.abilities![0]);
  const one = use(state, "one", "Ada"); state = one.after;
  expect(one.receipt.engine).toBe(8); expect(state.growth![0].familiar).toBe(false);
  expect(mechanicalNotes(one.receipt).some(n => n.includes("Pulse"))).toBe(false); expect(mechanicalPacket(state)).not.toHaveProperty("growth");
  const saved = revision(state); expect(mechanicalPacket(state, "How much practice have I gained with Pulse?").growth?.[0]).toMatchObject({ opportunities: 1, milestoneAt: 3, familiar: false, basis: "warp" }); expect(revision(state)).toBe(saved);
  state = use(state, "two", "Bryn").after;
  const before = revision(state), three = use(state, "three", "Cora");
  expect(revision(state)).toBe(before); state = three.after;
  expect(state.growth![0].credits).toHaveLength(3); expect(state.growth![0].familiar).toBe(true);
  expect(mechanicalNotes(three.receipt)).toContain("Pulse: familiar"); expect(three.receipt.beats?.some(b => b.kind === "milestone")).toBe(true);
  expect(state.resources[0].current).toBe(24); expect(state.abilities![0]).toEqual(definition);
  expect(conditionInfluence(state, "you", "concentration", "Ada", undefined, true, action(state, "Ada")).shift).toBe(1);
  expect(conditionInfluence(state, "you", "concentration", "Ada").shift).toBe(0);
  expect(commitMechanical(state, three.receipt)).toBe(state);
});

test("repetition, aliases, routine casts and rejected or cancelled uses cannot farm growth", () => {
  let state = setup(); state = use(state, "one", "Ada").after; state.entities![0].aliases.push("Captain Ada");
  state = use(state, "again", "Captain Ada").after;
  state = use(state, "again2", "Ada").after;
  expect(state.growth![0].credits).toHaveLength(1);
  const routine = prepareMechanical(state, "routine", "you", [action(state, "Bryn")]); state = commitMechanical(state, routine);
  expect(state.growth![0].credits).toHaveLength(1);
  const saved = revision(state), pending = prepareMechanical(state, "discarded", "you", [action(state, "Bryn", witness("discarded"))], "discarded", witness("discarded"));
  expect(pending.status).toBe("ready"); expect(revision(state)).toBe(saved);
  const poor = structuredClone(state); poor.resources[0].current = 0;
  const w = witness("poor"); expect(prepareMechanical(poor, "poor", "you", [action(poor, "Bryn", w)], "poor", w).status).toBe("blocked");
  expect(poor.growth![0].credits).toHaveLength(1);
});

test("a paid setback can teach, but a forged roll, mismatched result or multi-action blanket check cannot", () => {
  const state = setup(); let seed = "fail", w = witness(seed);
  for (let i = 0; w.result !== "setback"; i++) { seed = `fail-${i}`; w = witness(seed); }
  const r = prepareMechanical(state, seed, "you", [action(state, "Ada", w)], seed, w), after = commitMechanical(state, r);
  expect(after.growth![0].credits).toHaveLength(1); expect(after.resources[0].current).toBe(28); expect(after.conditions).toEqual([]);
  expect(prepareMechanical(state, "fake", "you", [action(state, "Ada", w)], seed, { ...w, roll: w.roll === 100 ? 1 : w.roll + 1 }).status).toBe("blocked");
  expect(prepareMechanical(state, "different", "you", [{ ...action(state, "Ada", w), outcome: "clean" }], seed, w).status).toBe("blocked");
  expect(prepareMechanical(state, "many", "you", [action(state, "Ada", w), action(state, "Bryn", w)], seed, w).status).toBe("blocked");
});

test("familiarity never stacks into arbitrary odds or crosses into another action or changed definition", () => {
  let state = setup(); for (const [seed, target] of [["a", "Ada"], ["b", "Bryn"], ["c", "Cora"]]) state = use(state, seed, target).after;
  const op = action(state, "Ada"), source = { message: scene.id, quote: scene.content };
  state.conditions.push({ id: "other-help", owner: "you", name: "Prepared", helps: ["concentration"], blocks: [], hinders: [], ending: "After the attempt", source });
  expect(conditionInfluence(state, "you", "concentration", "Ada", undefined, true, op).shift).toBe(1);
  expect(practiceBenefit(state, "you", { kind: "strike", target: "Ada" })).toEqual([]);
  state.abilities![0].fingerprint = "changed"; state.abilities![0].version++;
  expect(practiceBenefit(state, "you", action(state, "Ada"))).toEqual([]); expect(mechanicalPacket(state)).not.toHaveProperty("growth");
});

test("completed instruction teaches once per actual instructor and produces one milestone", () => {
  let state = setup(); const before = structuredClone(state);
  for (const teacher of ["Tutor", "Tutor", "Uma", "Vera"]) {
    const m = { id: `lesson-${teacher}`, is_user: false, content: `${teacher} coaches you in Pulse until you complete the taught exercise.` };
    state = applyObservations(state, readMechanicalObservations([{ kind: "practice", owner: "you", ability: "Pulse", teacher, message: m.id, quote: m.content }], state, [scene, m]));
  }
  expect(state.growth![0].credits).toHaveLength(3); expect(growthNotes(before, state)).toEqual(["Pulse: familiar"]);
  expect(growthNotes(state, state)).toEqual([]); expect(state.resources[0].current).toBe(30);
  const question = { id: "question", is_user: true, content: "Can Tutor teach me Pulse?" };
  expect(readMechanicalObservations([{ kind: "practice", owner: "you", ability: "Pulse", teacher: "Tutor", message: question.id, quote: question.content }], before, [scene, question])).toEqual([]);
  const preview = revision(state); expect(inspectMechanics(state)).toContain("Warp practice"); expect(revision(state)).toBe(preview);
});

test("a real named student acquires a durable self alias for historical instruction replay", () => {
  const state = setup(), m = { id: "named", is_user: false, content: "Tutor coaches Sam in Pulse until Sam completes the taught exercise." };
  const raw = [{ kind: "practice", owner: "Sam", ability: "Pulse", teacher: "Tutor", message: m.id, quote: m.content }];
  const observations = readMechanicalObservations(raw, state, [scene, m], "Sam"), after = applyObservations(state, observations);
  expect(after.entities?.find(e => e.name === "you")?.aliases).toContain("Sam"); expect(after.growth![0].credits).toHaveLength(1);
  const persisted = observations.flatMap(o => "value" in o ? [{ kind: o.kind, ...o.value, ...o.value.source }] : []);
  expect(applyObservations(state, readMechanicalObservations(persisted, state, [scene, m], undefined, true))).toEqual(after);
  const other = { ...m, content: m.content.replaceAll("Sam", "Samara") };
  expect(readMechanicalObservations(raw.map(r => ({ ...r, quote: other.content })), state, [scene, other], "Sam")).toEqual([]);
});

test("NPCs earn their own bounded familiarity through actual opposed responses", () => {
  let state = setup();
  for (const [i, target] of ["Bryn", "Cora", "you"].entries()) {
    const r = prepareExchange(state, `npc-${i}`, "you", [{ kind: "wait" }], [{ actor: "Ada", action: { kind: "strike", target }, source: { message: scene.id, quote: scene.content }, assessment: { contested: true, tier: "uncertain", intent: "Strike", stakes: "Miss the opening", reasons: ["The other participant resists"] } }]);
    expect(r.status).toBe("ready"); state = commitMechanical(state, r);
  }
  expect(state.growth?.find(g => g.owner === "Ada")?.familiar).toBe(true); expect(state.growth?.some(g => g.owner === "you")).toBe(false);
});

test("a player can instruct an NPC in its established technique without earning the NPC's progress", () => {
  let state = setup();
  const definition = { id: "known", is_user: false, content: "Ada knows Pulse, which briefly disorients another person." };
  const a = readAbilityDefinitions([{ owner: "Ada", name: "Pulse", approach: "concentration", target: "other", costs: [], effects: [{ kind: "condition", target: "target", name: "Disoriented", hinders: ["perception"], ending: "After a pause" }], requires: [], unsupported: [], message: definition.id, quote: definition.content }], state, [scene, definition])[0];
  state = applyObservations(state, [{ kind: "ability", value: a }]);
  const lesson = { id: "taught", is_user: false, content: "Sam coaches Ada in Pulse until Ada completes the taught exercise." };
  const rows = readMechanicalObservations([{ kind: "practice", owner: "Ada", ability: a.id, teacher: "Sam", message: lesson.id, quote: lesson.content }], state, [scene, definition, lesson], "Sam");
  const after = applyObservations(state, rows);
  expect(after.growth?.[0].owner).toBe("Ada"); expect(after.growth?.[0].credits[0].context).toBe("entity:you");
});

test("a quoted cost question cannot execute a cast, while a real action following a question still can", () => {
  const state = setup(), a = state.abilities![0], question = '"How would I cast Pulse at Ada?"';
  expect(readMechanicalPlan([{ kind: "ability", ability: a.id, target: "Ada", quote: "cast Pulse" }], state, question)).toEqual([]);
  const mixed = '"What would it cost?" I cast Pulse at Ada.';
  expect(readMechanicalPlan([{ kind: "ability", ability: a.id, target: "Ada", quote: "I cast Pulse at Ada." }], state, mixed)).toHaveLength(1);
});
