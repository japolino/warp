import { expect, test } from "bun:test";
import { definitionSource, readAbilityDefinitions, type AbilityEffect } from "./abilities.js";
import { applyObservations, commitMechanical, emptyMechanics, prepareMechanical, readMechanicalObservations, mechanicalPacket, type MechanicalOperation, type MechanicalState } from "./mechanics.js";
import { actionCount } from "./encounters.js";
import { lingeringInput, readLingeringEffect } from "./lingering.js";
import { offensiveAction } from "./exchanges.js";
import { inspectMechanics } from "./inspector.js";
import { revision } from "../shared/revision.js";

const opening = { id: "opening", is_user: false, content: "Jo faces you within arm's reach. You have 40 of 50 Health and 20 of 20 Energy. Jo has 40 of 50 Health." };
const source = definitionSource("persona", "Burn costs 2 Energy and applies Burning for 3 subsequent actions of the affected owner, dealing 5 fire Health damage after each action. Salve costs 1 Energy and clears Burning. Regen restores 4 Health after each of your next 2 actions. Venom adds 2 toward its threshold of 5 and applies Slowed, hindering movement for 2 owner actions. Toxin slowly accumulates until it causes Poisoned, inflicting minor poison harm for three subsequent affected-owner actions. Neutralize clears both Toxin accumulation and Poisoned. Recovery gently treats physical injury for 2 subsequent actions.")!;
const periodic: AbilityEffect = { kind: "periodic", target: "target", name: "Burning", ending: "After 3 subsequent affected-owner actions", duration: 3, cadence: "owner_action", pulse: { kind: "damage", resource: "Health", amount: 5, basis: "source", damageType: "fire" } };
const trigger = { kind: "condition", name: "Slowed", ending: "After 2 owner actions", hinders: ["movement"], helps: [], blocks: [], duration: 2 };
function setup() {
  const cite = (row: object) => ({ ...row, message: opening.id, quote: opening.content });
  const observations = readMechanicalObservations([cite({ kind: "entity", name: "Jo", entityKind: "person", present: true }), cite({ kind: "distance", from: "you", to: "Jo", band: "touch" }),
    cite({ kind: "resource", id: "hp", owner: "you", name: "Health", current: 40, max: 50, role: "vital" }), cite({ kind: "resource", id: "jo-hp", owner: "Jo", name: "Health", current: 40, max: 50, role: "vital" }), cite({ kind: "resource", id: "energy", owner: "you", name: "Energy", current: 20, max: 20, role: "effort" })], emptyMechanics(), [opening]);
  let state = applyObservations(emptyMechanics(), observations);
  const def = (name: string, effects: unknown[], cost = 0) => ({ owner: "you", name, approach: "concentration", target: "either", costs: cost ? [{ kind: "resource", id: "energy", amount: cost }] : [], effects, requires: [], unsupported: [], message: source.id, quote: source.text });
  const definitions = readAbilityDefinitions([
    def("Burn", [periodic], 2), def("Salve", [{ kind: "clear_condition", target: "target", name: "Burning" }], 1),
    def("Regen", [{ ...periodic, target: "self", name: "Regeneration", ending: "After 2 owner actions", duration: 2, pulse: { kind: "restore", resource: "Health", amount: 4 } }]),
    def("Venom", [{ kind: "buildup", target: "target", name: "Venom", amount: 2, threshold: 5, trigger }]),
    def("Toxin", [{ kind: "buildup", target: "target", name: "Toxin", magnitude: "minor", trigger: { kind: "periodic", name: "Poisoned", ending: "After three owner actions", duration: 3, cadence: "owner_action", pulse: { kind: "harm", impact: "minor", damageType: "poison" } } }]),
    def("Neutralize", [{ kind: "clear_buildup", target: "target", name: "Toxin" }, { kind: "clear_condition", target: "target", name: "Poisoned" }]),
  ], state, [opening], [source]);
  expect(definitions).toHaveLength(6);
  state = applyObservations(state, definitions.map(value => ({ kind: "ability" as const, value })));
  return { state, observations, definitions };
}
function invocation(s: MechanicalState, name: string, target = "Jo", outcome: "clean" | "mixed" | "setback" = "clean"): MechanicalOperation {
  const a = s.abilities!.find(a => a.name === name)!; return { kind: "ability", ability: a.id, version: a.version, target, outcome };
}
let serial = 0;
function act(s: MechanicalState, actor: string, operations: MechanicalOperation[]) {
  const receipt = prepareMechanical(s, `lingering-${++serial}`, actor, operations);
  expect(receipt.status).toBe("ready");
  return { receipt, state: commitMechanical(s, receipt) };
}
const hp = (s: MechanicalState, owner = "Jo") => s.resources.find(r => r.owner === owner && r.name === "Health")!.current;

test("finite pulses use only the affected owner's subsequent actions and commit no changes in preparation", () => {
  const { state: initial } = setup(), frozen = structuredClone(initial);
  const prepared = prepareMechanical(initial, "apply-burn", "you", [invocation(initial, "Burn")]);
  expect(prepared.engine).toBe(9); expect(initial).toEqual(frozen);
  let state = commitMechanical(initial, prepared);
  expect(hp(state)).toBe(40); expect(state.conditions[0].periodic?.remaining).toBe(3);
  expect(state.resources.find(r => r.id === "energy")!.current).toBe(18);
  state = act(state, "you", [{ kind: "wait" }]).state;
  expect(hp(state)).toBe(40); expect(state.conditions[0].periodic?.remaining).toBe(3);
  for (const value of [35, 30, 25]) { state = act(state, "Jo", [{ kind: "wait" }]).state; expect(hp(state)).toBe(value); }
  expect(state.conditions.some(c => c.periodic)).toBe(false);
  expect(act(state, "Jo", [{ kind: "wait" }]).state.resources).toEqual(state.resources);
  expect(commitMechanical(state, prepared)).toBe(state);
});

test("a supported cure cancels a due pulse, but refreshing and an executed setback cannot evade it", () => {
  let state = setup().state;
  state = act(state, "you", [invocation(state, "Burn", "you")]).state;
  const refreshed = act(state, "you", [invocation(state, "Burn", "you")]); state = refreshed.state;
  expect(hp(state, "you")).toBe(35); expect(state.conditions[0].periodic?.remaining).toBe(3);
  expect(refreshed.receipt.beats?.filter(b => b.kind === "pulse")).toHaveLength(1);
  state = act(state, "you", [invocation(state, "Burn", "you", "setback")]).state;
  expect(hp(state, "you")).toBe(30); expect(state.conditions[0].periodic?.remaining).toBe(2);
  state = act(state, "you", [invocation(state, "Salve", "you")]).state;
  expect(hp(state, "you")).toBe(30); expect(state.conditions.some(c => c.periodic)).toBe(false);
  expect(state.resources.find(r => r.id === "energy")!.current).toBe(13);
});

test("missing quantities or unavailable payment cannot create a pulse or advance an existing one", () => {
  let state = setup().state; state.resources = state.resources.filter(r => r.id !== "jo-hp");
  const unknown = prepareMechanical(state, "unknown-health", "you", [invocation(state, "Burn")]);
  expect(unknown.status).toBe("blocked"); expect(unknown.unresolved).toBe(true); expect(unknown.changes).toEqual([]);
  state = setup().state; state = act(state, "you", [invocation(state, "Burn", "you")]).state;
  state.resources.find(r => r.id === "energy")!.current = 0;
  const before = structuredClone(state), denied = prepareMechanical(state, "no-payment", "you", [invocation(state, "Burn", "you")]);
  expect(denied.status).toBe("blocked"); expect(state).toEqual(before); expect(denied.changes).toEqual([]);
});

test("recovery clamps to a known maximum and a full target still consumes its finite scheduled pulse", () => {
  let state = setup().state; state.resources.find(r => r.id === "hp")!.current = 49;
  state = act(state, "you", [invocation(state, "Regen", "you")]).state;
  expect(hp(state, "you")).toBe(49);
  state = act(state, "you", [{ kind: "wait" }]).state;
  expect(hp(state, "you")).toBe(50); expect(state.conditions[0].periodic?.remaining).toBe(1);
  state = act(state, "you", [{ kind: "wait" }]).state;
  expect(hp(state, "you")).toBe(50); expect(state.conditions).toEqual([]);
});

test("periodic damage follows armor, resistance, finite shields and one reflection packet", () => {
  let state = setup().state;
  const source = { message: opening.id, quote: opening.content };
  state.conditions.push({ id: "protection", owner: "Jo", name: "Protection", helps: [], hinders: [], blocks: [], ending: "Until removed", source, defenses: [{ kind: "armor", amount: 1, damageType: "fire" }, { kind: "resistance", amount: 50, damageType: "fire" }, { kind: "shield", amount: 4, damageType: "fire" }, { kind: "reflect", amount: 100, damageType: "fire" }] });
  state.conditions.push({ id: "return", owner: "you", name: "Return", helps: [], hinders: [], blocks: [], ending: "Until removed", source, defenses: [{ kind: "reflect", amount: 100, damageType: "fire" }] });
  state = act(state, "you", [invocation(state, "Burn")]).state;
  for (let i = 0; i < 2; i++) { state = act(state, "Jo", [{ kind: "wait" }]).state; expect(hp(state)).toBe(40); expect(hp(state, "you")).toBe(40); }
  const last = act(state, "Jo", [{ kind: "wait" }]);
  expect(hp(last.state)).toBe(38); expect(hp(last.state, "you")).toBe(38);
  expect(last.receipt.beats?.filter(b => b.kind === "damage")).toHaveLength(2);
});

test("buildup conserves its remainder and refreshes one lasting constraint at a threshold", () => {
  let state = setup().state;
  for (const expected of [2, 4, 1]) { state = act(state, "you", [invocation(state, "Venom")]).state; expect(state.buildups![0].current).toBe(expected); }
  expect(state.conditions.filter(c => c.name === "Slowed")).toHaveLength(1);
  expect(state.conditions[0].hinders).toEqual(["movement"]);
  const heavy = definitionSource("lore", "Heavy Venom adds 12 Venom toward threshold 5 and applies Slowed for 2 owner actions.")!;
  const definitions = readAbilityDefinitions([{ owner: "you", name: "Heavy Venom", approach: "concentration", target: "other", costs: [], effects: [{ kind: "buildup", target: "target", name: "Venom", amount: 12, threshold: 5, trigger }], requires: [], unsupported: [], message: heavy.id, quote: heavy.text }], state, [], [heavy]);
  state = applyObservations(state, definitions.map(value => ({ kind: "ability", value })));
  const crossed = act(state, "you", [invocation(state, "Heavy Venom")]);
  expect(crossed.state.buildups![0].current).toBe(3); expect(crossed.state.conditions.filter(c => c.name === "Slowed")).toHaveLength(1);
  expect(crossed.receipt.beats?.find(b => b.kind === "threshold")?.amount).toBe(2);
});

test("qualitative accumulation can trigger poison, and clearing accumulation does not invent a cure", () => {
  let state = setup().state;
  for (let i = 0; i < 3; i++) state = act(state, "you", [invocation(state, "Toxin")]).state;
  expect(state.buildups![0].basis).toBe("warp"); expect(state.buildups![0].threshold).toBe(3); expect(state.buildups![0].current).toBe(0);
  expect(state.conditions.find(c => c.name === "Poisoned")?.periodic?.remaining).toBe(3);
  expect(hp(state)).toBe(40);
  state = act(state, "Jo", [{ kind: "wait" }]).state; expect(hp(state)).toBe(35);
  state = act(state, "you", [invocation(state, "Toxin")]).state; expect(state.buildups![0].current).toBe(1);
  state = act(state, "you", [invocation(state, "Neutralize")]).state;
  expect(state.buildups![0].current).toBe(0); expect(state.conditions.find(c => c.name === "Poisoned")).toBeUndefined();
  expect(act(state, "Jo", [{ kind: "wait" }]).state.resources).toEqual(state.resources);
});

test("a sourced initial buildup uses its compiled trigger and cannot rewind a later receipt", () => {
  let state = setup().state;
  const status = { id: "status", is_user: false, content: "Jo already has 3 Venom accumulated." };
  const row = { kind: "buildup", owner: "Jo", name: "Venom", current: 3, caster: "you", ability: "Venom", message: status.id, quote: status.content };
  const observation = readMechanicalObservations([row], state, [opening, status]);
  expect(observation).toHaveLength(1); state = applyObservations(state, observation);
  state = act(state, "you", [invocation(state, "Venom")]).state;
  expect(state.buildups![0].current).toBe(0); expect(state.conditions.some(c => c.name === "Slowed")).toBe(true);
  expect(readMechanicalObservations([row], state, [opening, status])).toEqual([]);
});

test("periodic and accumulating attacks remain offensive; unsupported scheduling and recursive triggers are rejected", () => {
  const state = setup().state;
  expect(offensiveAction(invocation(state, "Burn"), state, "you")).toBe(true);
  expect(offensiveAction(invocation(state, "Toxin"), state, "you")).toBe(true);
  expect(offensiveAction(invocation(state, "Regen", "you"), state, "you")).toBe(false);
  expect(() => readLingeringEffect({ ...periodic, cadence: "seconds" }, source.text)).toThrow();
  expect(() => readLingeringEffect(periodic as unknown as Record<string, unknown>, "Burning lasts 3 seconds and deals 5 Health damage.")).toThrow();
  expect(() => readLingeringEffect({ ...periodic, pulse: { ...periodic, duration: 3 } }, source.text)).toThrow();
  expect(() => readLingeringEffect({ kind: "buildup", target: "target", name: "Venom", amount: 2, threshold: 5, trigger: { kind: "buildup" } }, source.text)).toThrow();
  const effects = state.abilities!.flatMap(a => a.effects);
  for (const e of effects.filter(e => ["periodic", "buildup", "clear_buildup"].includes(e.kind))) expect(readLingeringEffect(lingeringInput(e) as unknown as Record<string, unknown>, source.text)).toEqual(e);
});

test("prose cannot erase a paid periodic schedule or turn an uncounted request into elapsed actions", () => {
  let state = setup().state; state = act(state, "you", [invocation(state, "Burn")]).state;
  const narration = { id: "free-cure", is_user: false, content: "The Burning is gone." }, pending = state.conditions.find(c => c.periodic)!;
  expect(readMechanicalObservations([{ kind: "condition_end", id: pending.id, message: narration.id, quote: narration.content }], state, [opening, narration])).toEqual([]);
  expect(actionCount(state, "Jo")).toBe(0); expect(pending.periodic?.remaining).toBe(3);
});

test("an actual source ending supports ongoing effects without manufacturing a duration", () => {
  let state = setup().state;
  const ongoing = definitionSource("lore", "Ember causes minor fire harm while Burning persists, until extinguished.")!;
  const e = { kind: "periodic", target: "target", name: "Burning", ending: "until extinguished", untilCleared: true, cadence: "owner_action", pulse: { kind: "harm", impact: "minor", damageType: "fire" } };
  const definitions = readAbilityDefinitions([{ owner: "you", name: "Ember", approach: "concentration", target: "other", costs: [], effects: [e], requires: [], unsupported: [], message: ongoing.id, quote: ongoing.text }], state, [], [ongoing]);
  expect(definitions).toHaveLength(1); expect(definitions[0].effects[0].timingBasis).toBe("warp");
  expect(definitions[0].effects[0].duration).toBeUndefined();
  state = applyObservations(state, definitions.map(value => ({ kind: "ability", value })));
  state = act(state, "you", [invocation(state, "Ember")]).state;
  const after = act(state, "Jo", [{ kind: "wait" }]).state;
  expect(hp(after)).toBe(35); expect(after.conditions.find(c => c.periodic)?.periodic?.remaining).toBeUndefined();
  expect(after.conditions.find(c => c.periodic)?.ending).toBe("until extinguished");
  state = act(after, "you", [invocation(after, "Salve")]).state;
  expect(state.conditions.some(c => c.periodic)).toBe(false);
  expect(() => readLingeringEffect({ ...e, duration: 3 }, ongoing.text)).toThrow();
  expect(() => readLingeringEffect({ ...e, ending: "until a priest charges 5 coins" }, ongoing.text)).toThrow();
});

test("refreshes inside one compound receipt cannot skip a previously scheduled pulse", () => {
  const state = setup().state;
  const after = act(state, "you", [invocation(state, "Burn", "you"), invocation(state, "Burn", "you")]).state;
  expect(hp(after, "you")).toBe(35); expect(after.conditions[0].periodic?.remaining).toBe(3);
  expect(after.resources.find(r => r.id === "energy")!.current).toBe(16);
});

test("established immunity blocks wholly ineffective applications before any payment", () => {
  const state = setup().state;
  state.conditions.push({ id: "fireproof", owner: "Jo", name: "Fireproof", ending: "Until removed", helps: [], hinders: [], blocks: [], source: { message: opening.id, quote: opening.content }, defenses: [{ kind: "immunity", damageType: "fire", amount: 0 }] });
  const receipt = prepareMechanical(state, "immune", "you", [invocation(state, "Burn")]);
  expect(receipt.status).toBe("blocked"); expect(receipt.reason).toContain("immunity"); expect(receipt.changes).toEqual([]);
  expect(state.resources.find(r => r.id === "energy")!.current).toBe(20);
});

test("a conflicting threshold cannot rewrite accumulation and read-only inspection changes nothing", () => {
  let state = setup().state; state = act(state, "you", [invocation(state, "Venom", "you")]).state;
  const a = structuredClone(state.abilities!.find(a => a.name === "Venom")!); a.id = "conflicting"; a.name = "Conflicting Venom"; a.effects[0].threshold = 4; state.abilities!.push(a);
  const rejected = prepareMechanical(state, "conflict", "you", [invocation(state, "Conflicting Venom", "you")]);
  expect(rejected.status).toBe("blocked"); expect(rejected.unresolved).toBe(true); expect(state.buildups![0].current).toBe(2);
  state = act(state, "you", [invocation(state, "Burn", "you")]).state;
  const before = revision(state), html = inspectMechanics(state);
  expect(html).toContain("Venom: 2 / 5"); expect(html).toContain("3 pulses left"); expect(html).toContain("after your next supported action"); expect(revision(state)).toBe(before);
  const packet = mechanicalPacket(state);
  expect(JSON.stringify(packet)).not.toContain("startedBy"); expect(JSON.stringify(packet)).not.toContain("nextAt");
});

test("a current narrated affliction adopts only its explicit remaining schedule and rejects stale resurrection", () => {
  let state = setup().state;
  const current = { id: "current-affliction", is_user: false, content: "Jo is Burning; 2 affected-owner pulses remain." };
  const row = { kind: "periodic", owner: "Jo", name: "Burning", caster: "you", ability: "Burn", remaining: 2, message: current.id, quote: current.content };
  const observations = readMechanicalObservations([row], state, [opening, current]);
  expect(observations).toHaveLength(1); state = applyObservations(state, observations);
  expect(hp(state)).toBe(40); expect(state.resources.find(r => r.id === "energy")!.current).toBe(20);
  expect(state.conditions[0].periodic?.remaining).toBe(2);
  expect(readMechanicalObservations([row], state, [opening, current])).toEqual([]);
  const cured = act(state, "you", [invocation(state, "Salve")]); state = cured.state;
  const cureMessage = { id: "cured", is_user: false, content: "Salve clears Burning.", metadata: { warpMechanics: { "0": { receipt: cured.receipt } } } };
  expect(readMechanicalObservations([row], state, [opening, current, cureMessage])).toEqual([]);
  const fresh = { id: "new-affliction", is_user: false, content: current.content };
  expect(readMechanicalObservations([{ ...row, message: fresh.id }], state, [opening, current, cureMessage, fresh])).toHaveLength(1);
  expect(readMechanicalObservations([{ ...row, remaining: undefined }], state, [opening, current])).toEqual([]);
});

test("a current ongoing affliction needs no invented caster power and can end at its actual free environmental trigger", () => {
  let state = emptyMechanics();
  const current = { id: "burning-now", is_user: false, content: "You are Burning from the flames, until extinguished." };
  const row = { kind: "periodic", owner: "you", name: "Burning", message: current.id, quote: current.content, effect: { kind: "periodic", target: "self", name: "Burning", ending: "until extinguished", untilCleared: true, cadence: "owner_action", pulse: { kind: "harm", impact: "minor", damageType: "fire" } } };
  const observations = readMechanicalObservations([row], state, [current]);
  expect(observations).toHaveLength(1); state = applyObservations(state, observations);
  expect(state.abilities).toBeUndefined(); expect(state.resources).toEqual([]); expect(state.applied).toEqual([]);
  expect(state.conditions[0].periodic?.timingBasis).toBe("warp");
  const end = { id: "extinguished", is_user: false, content: "The uncounted stream puts the flames out; Burning is extinguished." };
  const ending = { kind: "condition_end", id: state.conditions[0].id, ending: "until extinguished", natural: true, message: end.id, quote: end.content };
  expect(readMechanicalObservations([{ ...ending, natural: undefined }], state, [current, end])).toEqual([]);
  expect(readMechanicalObservations([{ ...ending, ending: "until it times out" }], state, [current, end])).toEqual([]);
  const negative = { id: "failed", is_user: false, content: "The flames are not extinguished." };
  expect(readMechanicalObservations([{ ...ending, message: negative.id, quote: negative.content }], state, [current, negative])).toEqual([]);
  state = applyObservations(state, readMechanicalObservations([ending], state, [current, end]));
  expect(state.conditions).toEqual([]); expect(state.resources).toEqual([]); expect(state.applied).toEqual([]);
  expect(readMechanicalObservations([row], state, [current, end])).toEqual([]);
});

test("ongoing recovery gradually treats routine narrative injury and ends at recovery without an invented duration", () => {
  let state = emptyMechanics();
  const current = { id: "recovering-now", is_user: false, content: "You have severe but routinely treatable burns. Spring Tide gently regenerates your physical injuries continuously." };
  const cite = (row: object) => ({ ...row, message: current.id, quote: current.content });
  state = applyObservations(state, readMechanicalObservations([
    cite({ kind: "condition", id: "burn-wound", owner: "you", name: "Burn wounds", category: "physical_injury", severity: "major", recovery: "routine", helps: [], hinders: ["movement"], blocks: [], ending: "Appropriate treatment" }),
    cite({ kind: "periodic", owner: "you", name: "Spring Tide", effect: { kind: "periodic", target: "self", name: "Spring Tide", untilCleared: true, endingRule: "recover", cadence: "owner_action", pulse: { kind: "mend", impact: "minor" } } }),
  ], state, [current]));
  expect(state.conditions).toHaveLength(2); expect(state.resources).toEqual([]);
  for (const severity of ["standard", "minor"] as const) {
    state = act(state, "you", [{ kind: "wait" }]).state;
    const wound = state.conditions.find(c => c.id === "burn-wound")!;
    expect(wound.severity).toBe(severity); expect(wound.hinders).toEqual(["movement"]);
    expect(state.conditions.find(c => c.periodic)?.periodic?.remaining).toBeUndefined();
  }
  state = act(state, "you", [{ kind: "wait" }]).state;
  expect(state.conditions).toEqual([]); expect(state.closedConditions).toHaveLength(2);
  expect(state.resources).toEqual([]); expect(act(state, "you", [{ kind: "wait" }]).state.conditions).toEqual([]);
});

test("ongoing recovery respects severity limits and special treatment requirements", () => {
  let state = emptyMechanics();
  const current = { id: "limited-recovery", is_user: false, content: "Minor Recovery continuously treats minor injuries only. You have a major routine wound and a cursed minor wound needing special treatment." };
  const cite = (row: object) => ({ ...row, message: current.id, quote: current.content });
  state = applyObservations(state, readMechanicalObservations([
    cite({ kind: "condition", id: "major-wound", owner: "you", name: "Major wound", category: "physical_injury", severity: "major", recovery: "routine", helps: [], hinders: ["force"], blocks: [], ending: "Treatment" }),
    cite({ kind: "condition", id: "curse", owner: "you", name: "Cursed wound", category: "physical_injury", severity: "minor", recovery: "special", helps: [], hinders: ["movement"], blocks: [], ending: "Special treatment" }),
    cite({ kind: "periodic", owner: "you", name: "Minor Recovery", effect: { kind: "periodic", target: "self", name: "Minor Recovery", untilCleared: true, endingRule: "recover", cadence: "owner_action", pulse: { kind: "mend", impact: "minor", maxInjury: "minor" } } }),
  ], state, [current]));
  expect(state.conditions).toHaveLength(3);
  const wounds = structuredClone(state.conditions.filter(c => !c.periodic));
  for (let i = 0; i < 4; i++) state = act(state, "you", [{ kind: "wait" }]).state;
  expect(state.conditions.filter(c => !c.periodic)).toEqual(wounds);
  expect(state.conditions.find(c => c.periodic)).toBeDefined();
  expect(state.resources).toEqual([]);
});

test("resource recovery ends at its known cap and fixed ending rules cannot be mismatched", () => {
  let state = setup().state;
  const current = { id: "resource-recovery", is_user: false, content: "Recovery continuously restores 4 Health to you." };
  state.resources.find(r => r.id === "hp")!.current = 49;
  const row = { kind: "periodic", owner: "you", name: "Recovery", message: current.id, quote: current.content, effect: { kind: "periodic", target: "self", name: "Recovery", untilCleared: true, endingRule: "recover", cadence: "owner_action", pulse: { kind: "restore", resource: "Health", amount: 4 } } };
  state = applyObservations(state, readMechanicalObservations([row], state, [opening, current]));
  expect(state.conditions).toHaveLength(1);
  state = act(state, "you", [{ kind: "wait" }]).state;
  expect(hp(state, "you")).toBe(50); expect(state.conditions).toEqual([]);
  for (const endingRule of ["extinguish", "stanch", "detox"]) expect(() => readLingeringEffect({ ...row.effect, endingRule }, current.content)).toThrow();
  expect(() => readLingeringEffect({ ...row.effect, pulse: { kind: "harm", impact: "minor", damageType: "fire" } }, current.content)).toThrow();
});

test("qualitative regeneration cannot spend its price against a pool with an unknown recovery limit", () => {
  let state = setup().state; delete state.resources.find(r => r.id === "hp")!.max;
  const lore = definitionSource("persona", "Regenerate costs 2 Energy and continuously treats physical injury.")!;
  const definitions = readAbilityDefinitions([{ owner: "you", name: "Regenerate", approach: "concentration", target: "self", costs: [{ kind: "resource", id: "energy", amount: 2 }], effects: [{ kind: "periodic", target: "self", name: "Regenerating", untilCleared: true, endingRule: "recover", cadence: "owner_action", pulse: { kind: "mend", impact: "minor" } }], requires: [], unsupported: [], message: lore.id, quote: lore.text }], state, [], [lore]);
  expect(definitions).toHaveLength(1); state = applyObservations(state, definitions.map(value => ({ kind: "ability", value })));
  const before = structuredClone(state), prepared = prepareMechanical(state, "unknown-recovery-cap", "you", [invocation(state, "Regenerate", "you")]);
  expect(prepared.status).toBe("blocked"); expect(prepared.unresolved).toBe(true); expect(prepared.changes).toEqual([]); expect(state).toEqual(before);
});
