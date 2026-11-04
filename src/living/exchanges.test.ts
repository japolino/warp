import { expect, test } from "bun:test";
import { revision } from "../shared/revision.js";
import type { Msg } from "../backend/ledger.js";
import { pathOf, resolveAttempt } from "./world.js";
import { definitionSource, readAbilityDefinitions } from "./abilities.js";
import { actorName, actionCount, cooldownRemaining } from "./encounters.js";
import { emptyMechanics, readMechanicalObservations, readMechanicalPlan, applyObservations, prepareExchange, commitMechanical, type MechanicalState, type MechanicalOperation } from "./mechanics.js";
import { readResponsePlans, responseDecision, responseChecks, type ResponsePlan } from "./exchanges.js";
import { MECHANICS_KEY, foldMechanics } from "./mechanical-history.js";

const story = { id: "greeting", is_user: false, content: "Jo stands at touch distance and prepares to strike you. You have 40 of 40 Health and 10 of 10 Focus. Jo has 40 of 40 Health and 10 of 10 Focus." };
const persona = definitionSource("persona", "You can use Jab, costing 2 Focus to deal 10 physical Health damage at touch range. Bind prevents force for 1 action.")!;
const card = definitionSource("card", "Jo can use Jab, costing 2 Focus to deal 10 physical Health damage at touch range with a cooldown of 1 action.")!;
const evidence = { message: story.id, quote: story.content };
const assessment = { contested: true, tier: "uncertain" as const, intent: "Strike the opponent", stakes: "An exposed opening", reasons: ["Both can fight"] };
function fixture() {
  const raw = [
    { kind: "entity", name: "Jo", aliases: ["the guard"], entityKind: "person", present: true },
    { kind: "entity", name: "you", aliases: ["Sam"], entityKind: "person", present: true },
    { kind: "distance", from: "you", to: "Jo", band: "touch" },
    ...["you", "Jo"].flatMap(owner => [{ kind: "resource", id: `${owner}-hp`, owner, name: "Health", current: 40, max: 40, role: "vital" }, { kind: "resource", id: `${owner}-focus`, owner, name: "Focus", current: 10, max: 10, role: "effort" }]),
  ].map(row => ({ ...row, ...evidence }));
  let state = applyObservations(emptyMechanics(), readMechanicalObservations(raw, emptyMechanics(), [story]));
  const abilities = readAbilityDefinitions([...["you", "Jo"].map(owner => {
    const source = owner === "you" ? persona : card;
    return { owner, name: "Jab", approach: "force", target: "other", range: "touch", ...(owner === "Jo" ? { cooldown: 1 } : {}), costs: [{ kind: "resource", id: `${owner}-focus`, amount: 2 }], effects: [{ kind: "damage", target: "target", resource: "Health", amount: 10, damageType: "physical" }], message: source.id, quote: source.text };
  }), { owner: "you", name: "Bind", approach: "concentration", target: "other", costs: [], effects: [{ kind: "condition", target: "target", name: "Bound", hinders: [], helps: [], blocks: ["force"], ending: "After one action", duration: 1 }], message: persona.id, quote: persona.text }], state, [], [persona, card]);
  state = applyObservations(state, abilities.map(value => ({ kind: "ability", value })));
  return { state, observations: [...readMechanicalObservations(raw, emptyMechanics(), [story]), ...abilities.map(value => ({ kind: "ability" as const, value }))] };
}
const value = (s: MechanicalState, id: string) => s.resources.find(r => r.id === id)!.current;
const ownAbility = (s: MechanicalState, owner: string, name = "Jab", target = "you"): MechanicalOperation => {
  const a = s.abilities!.find(a => a.owner === owner && a.name === name)!;
  return { kind: "ability", ability: a.id, version: a.version, target };
};
function plans(s: MechanicalState, action: any = { kind: "ability", ability: "Jab", target: "you" }): ResponsePlan[] {
  return readResponsePlans([{ actor: "the guard", action, assessment, ...evidence }], s, [story], true);
}
function seedFor(plan: ResponsePlan, result: "clean" | "mixed" | "setback") {
  for (let i = 0; i < 1000; i++) if (responseDecision(plan, `action-${i}`, 0, [])?.result === result) return `action-${i}`;
  throw new Error("No deterministic fixture seed");
}

test("an NPC pays its saved cost and rolls against an explicit player guard in the same atomic receipt", () => {
  const { state } = fixture(), responses = plans(state), id = seedFor(responses[0], "clean");
  const receipt = prepareExchange(state, id, "you", [{ kind: "defend" }], responses);
  expect(receipt.status).toBe("ready"); expect(receipt.engine).toBe(8);
  expect(value(state, "you-hp")).toBe(40); expect(value(state, "Jo-focus")).toBe(10);
  const after = commitMechanical(state, receipt);
  expect(value(after, "you-hp")).toBe(35); expect(value(after, "Jo-focus")).toBe(8);
  expect(actionCount(after, "you")).toBe(1); expect(actionCount(after, "Jo")).toBe(1);
  expect(receipt.beats!.find(b => b.kind === "response")?.decision?.roll).toBe(responseDecision(responses[0], id, 0, [])!.roll);
  expect(commitMechanical(after, receipt)).toBe(after);
});

test("an executed NPC setback still pays its advertised cost without damage or a replacement roll", () => {
  const { state } = fixture(), responses = plans(state), id = seedFor(responses[0], "setback");
  const receipt = prepareExchange(state, id, "you", [{ kind: "wait" }], responses), after = commitMechanical(state, receipt);
  expect(value(after, "Jo-focus")).toBe(8); expect(value(after, "you-hp")).toBe(40);
  expect(receipt.beats!.find(b => b.kind === "response")?.decision?.result).toBe("setback");
  expect(prepareExchange(state, id, "you", [{ kind: "wait" }], responses)).toEqual(receipt);
});

test("incapacitating the opponent prevents its response, roll and cost", () => {
  const { state } = fixture(); state.resources.find(r => r.id === "Jo-hp")!.current = 5;
  const receipt = prepareExchange(state, "finish", "you", [ownAbility(state, "you", "Jab", "Jo")], plans(state));
  const after = commitMechanical(state, receipt);
  expect(value(after, "Jo-hp")).toBe(0); expect(value(after, "Jo-focus")).toBe(10);
  expect(value(after, "you-hp")).toBe(40); expect(actionCount(after, "Jo")).toBe(0);
  expect(receipt.beats!.some(b => b.kind === "skipped")).toBe(true);
  expect(receipt.beats!.some(b => b.kind === "response")).toBe(false);
});

test("a forced lost opportunity consumes no ability cost and short blocks/cooldowns can expire", () => {
  let { state } = fixture();
  state = commitMechanical(state, prepareExchange(state, "bind", "you", [ownAbility(state, "you", "Bind", "Jo")], plans(state)));
  expect(value(state, "Jo-focus")).toBe(10); expect(actionCount(state, "Jo")).toBe(1);
  state = commitMechanical(state, prepareExchange(state, "second", "you", [{ kind: "wait" }], plans(state)));
  expect(value(state, "Jo-focus")).toBe(8); expect(actionCount(state, "Jo")).toBe(2);
  state = commitMechanical(state, prepareExchange(state, "third", "you", [{ kind: "wait" }], plans(state)));
  expect(value(state, "Jo-focus")).toBe(8); expect(actionCount(state, "Jo")).toBe(3);
  expect(cooldownRemaining(state, "Jo", state.abilities!.find(a => a.owner === "Jo")!.id)).toBe(0);
});

test("retreat invalidates a touch-range response, without automatic pursuit or extra reactions", () => {
  const { state } = fixture(), receipt = prepareExchange(state, "retreat", "you", [{ kind: "move", target: "Jo", direction: "away" }], plans(state));
  const after = commitMechanical(state, receipt);
  expect(value(after, "Jo-focus")).toBe(10); expect(value(after, "you-hp")).toBe(40);
  expect(receipt.beats!.find(b => b.kind === "skipped")?.reason).toContain("outside touch range");
  expect(after.distances![0].band).toBe("near");
  expect(prepareExchange(state, "empty", "you", [], plans(state)).status).toBe("blocked");
  expect(prepareExchange(state, "duplicate", "you", [{ kind: "wait" }], [...plans(state), ...plans(state)]).status).toBe("blocked");
});

test("responses require current narrator evidence and cannot make player decisions or inject a die result", () => {
  const { state } = fixture(), row = { actor: "Jo", action: { kind: "ability", ability: "Jab", target: "you" }, assessment, ...evidence };
  expect(() => readResponsePlans([row], state, [story], false)).toThrow("actual player action");
  expect(() => readResponsePlans([{ ...row, actor: "Sam" }], state, [story], true)).toThrow("actor");
  expect(() => readResponsePlans([row], state, [story, { id: "later", content: "Jo puts away the weapon and sits down.", is_user: false }], true)).toThrow("current scene");
  expect(() => readResponsePlans([{ ...row, assessment: { ...assessment, roll: 1 } }], state, [story], true)).toThrow("assessment");
  expect(() => readResponsePlans([{ ...row, action: { ...row.action, amount: 999 } }], state, [story], true)).toThrow("override");
  expect(() => readResponsePlans([row, row, row, row], state, [story], true)).toThrow("Too many");
});

test("a quoted current opportunity binds its real message ID locally, even when the helper drafts prose in that field", () => {
  const { state } = fixture();
  const [plan] = readResponsePlans([{ actor: "Jo", action: { kind: "ability", ability: "Jab", target: "you" }, assessment, message: "Jo follows through with a jab.", quote: "Jo stands at touch distance and prepares to strike you." }], state, [story], true);
  expect(plan.source.message).toBe(story.id);
  expect(plan.source.sourceRevision).toBe(revision(story.content));
  expect(() => readResponsePlans([{ actor: "Jo", action: { kind: "wait" }, assessment: { contested: false }, quote: "An invented threat" }], state, [story], true)).toThrow("evidence");
});

test("NPC offense cannot become a guaranteed hit through contested:false", () => {
  const { state } = fixture();
  const response = readResponsePlans([{ actor: "Jo", action: { kind: "strike", target: "you" }, assessment: { ...assessment, contested: false }, ...evidence }], state, [story], true)[0];
  expect(response.assessment.contested).toBe(true);
  const receipt = prepareExchange(state, "forced-roll", "you", [{ kind: "wait" }], [{ ...response, assessment: { ...response.assessment, contested: false } }]);
  expect(receipt.beats!.find(b => b.kind === "response")?.decision?.roll).toBeGreaterThan(0);
});

test("ordinary assistance applies a sourced benefit without treating it as an attack or forcing a die roll", () => {
  let { state } = fixture();
  const source = definitionSource("card", "Jo can Guide another person, costing 2 Focus and helping their concentration until the task ends.")!;
  const definition = readAbilityDefinitions([{ owner: "Jo", name: "Guide", approach: "speech", target: "other", costs: [{ kind: "resource", id: "Jo-focus", amount: 2 }], effects: [{ kind: "condition", target: "target", name: "Guided", helps: ["concentration"], hinders: [], blocks: [], ending: "Until the task ends" }], message: source.id, quote: source.text }], state, [], [source])[0];
  state = applyObservations(state, [{ kind: "ability", value: definition }]);
  const current = { id: "guidance", is_user: false, content: "Jo starts guiding your work through the next delicate step." };
  const response = readResponsePlans([{ actor: "Jo", action: { kind: "ability", ability: "Guide", target: "you" }, assessment: { contested: false }, quote: current.content }], state, [story, current], true);
  const receipt = prepareExchange(state, "guidance", "you", [{ kind: "wait" }], response), after = commitMechanical(state, receipt);
  expect(after.conditions.find(c => c.name === "Guided")?.helps).toEqual(["concentration"]);
  expect(value(after, "Jo-focus")).toBe(8);
  expect(receipt.beats!.find(b => b.kind === "response")?.decision).toBeUndefined();
});

test("missing response or reflection data leaves the whole exchange unresolved instead of granting one side free damage", () => {
  const { state } = fixture(); state.resources = state.resources.filter(r => r.id !== "you-hp");
  const receipt = prepareExchange(state, "missing-health", "you", [ownAbility(state, "you", "Jab", "Jo")], plans(state));
  expect(receipt.status).toBe("blocked"); expect(receipt.reason).toContain("Health"); expect(receipt.changes).toEqual([]);
  expect(value(state, "Jo-hp")).toBe(40); expect(value(state, "you-focus")).toBe(10);
  state.conditions.push({ id: "mirror", name: "Mirror", owner: "Jo", hinders: [], helps: [], blocks: [], ending: "When removed", defenses: [{ kind: "reflect", damageType: "all", amount: 50 }], source: evidence });
  const reflected = prepareExchange(state, "missing-reflection", "you", [ownAbility(state, "you", "Jab", "Jo")], []);
  expect(reflected.status).toBe("ready");
  const afterReflection = commitMechanical(state, reflected);
  expect(afterReflection.conditions.some(c => c.owner === "you" && c.injury)).toBe(true);
  expect(afterReflection.resources.some(r => r.id === "you-hp")).toBe(false);
});

test("active exchange records replay both actors exactly and reject changed plans, rolls or source evidence", () => {
  const { state, observations } = fixture();
  const greeting = { ...story, role: "assistant", swipe_id: 0, index_in_chat: 0, metadata: { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf([]), text: revision(story.content), observations, sources: [persona, card] } } } } as unknown as Msg;
  expect(foldMechanics([greeting])).toEqual(state);
  const player = { id: "player", role: "user", is_user: true, content: "I guard my flank.", index_in_chat: 1, swipe_id: 0 } as Msg;
  const receipt = prepareExchange(state, "exchange", "you", [{ kind: "defend" }], plans(state));
  const reply = { id: "reply", role: "assistant", is_user: false, content: "Jo makes the attack.", index_in_chat: 2, swipe_id: 0, metadata: { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf([greeting, player]), text: revision("Jo makes the attack."), receipt, observations: [] } } } } as unknown as Msg;
  expect(foldMechanics([greeting, player, reply])).toEqual(commitMechanical(state, receipt));
  const bad = structuredClone(receipt); bad.beats!.find(b => b.kind === "response")!.decision!.roll = 0;
  expect(() => commitMechanical(state, bad)).toThrow("resolution");
  bad.beats = receipt.beats; bad.responses![0].assessment.tier = "favorable";
  expect(() => commitMechanical(state, bad)).toThrow();
  receipt.responses![0].source.quote = "Invented hostility";
  expect(foldMechanics([greeting, player, reply]).resources).toEqual([]);
});

test("public response checks show the visible actor and actual action, without private reasons or identities", () => {
  const { state } = fixture(), receipt = prepareExchange(state, "public", "you", [{ kind: "wait" }], plans(state));
  const beat = receipt.beats!.find(b => b.kind === "response")!; beat.decision!.reasons = ["A secret identity and motive"];
  const checks = responseChecks(receipt, state, ["the guard"]);
  expect(checks[0].actor).toBe("the guard"); expect(checks[0].decision.intent).toBe("Jab · you");
  expect(JSON.stringify(checks)).not.toContain("secret"); expect(JSON.stringify(checks)).not.toContain('"Jo"');
  expect(responseChecks({ ...receipt, status: "blocked" }, state)).toEqual([]);
  expect(actorName(state, checks[0].actor)).toBe("Jo");
});

test("an unmodified strike works without creating an ability, but cannot override damage or invent health", () => {
  const { state } = fixture();
  const receipt = prepareExchange(state, "punch", "you", [{ kind: "strike", target: "Jo", outcome: "clean" }], []);
  expect(value(commitMechanical(state, receipt), "Jo-hp")).toBe(35);
  expect(() => readMechanicalPlan([{ kind: "strike", target: "Jo", amount: 999, quote: "I punch Jo." }], state, "I punch Jo.")).toThrow("no model-selected damage");
  state.resources = state.resources.filter(r => r.id !== "Jo-hp");
  const noPool = commitMechanical(state, prepareExchange(state, "unknown", "you", [{ kind: "strike", target: "Jo" }], []));
  expect(noPool.conditions.some(c => c.owner === "Jo" && c.injury)).toBe(true);
  expect(noPool.resources.some(r => r.owner === "Jo" && r.role === "vital")).toBe(false);
});

test("bounded exchanges reflect power differences and resource starvation without free regeneration", () => {
  const run = (tier: "uncertain" | "outmatched", enemyTier: "uncertain" | "favorable") => {
    let playerWins = 0, npcWins = 0, exhausted = 0, invalid = false;
    for (let seed = 0; seed < 60; seed++) {
      let { state } = fixture(); for (const r of state.resources) if (r.role === "vital") { r.current = 80; r.max = 80; }
      for (let round = 0; round < 40 && value(state, "you-hp") > 0 && value(state, "Jo-hp") > 0; round++) {
        const id = `sim-${seed}-${round}`, result = resolveAttempt({ ...assessment, risky: true, contested: true, tier, reasons: ["Known training"], intent: "Strike", stakes: "An opening" }, `${id}:player`)!;
        const player: MechanicalOperation = value(state, "you-focus") >= 2 ? { ...ownAbility(state, "you", "Jab", "Jo") as Extract<MechanicalOperation, { kind: "ability" }>, outcome: result.result } : { kind: "strike", target: "Jo", outcome: result.result };
        const npcAbility = state.abilities!.find(a => a.owner === "Jo")!;
        const response = plans(state, value(state, "Jo-focus") >= 2 && !cooldownRemaining(state, "Jo", npcAbility.id) ? { kind: "ability", ability: "Jab", target: "you" } : { kind: "strike", target: "you" });
        response[0].assessment.tier = enemyTier;
        const receipt = prepareExchange(state, id, "you", [player], response);
        if (receipt.status !== "ready") { invalid = true; break; }
        state = commitMechanical(state, receipt);
        if (state.resources.some(r => r.current < 0 || r.current > r.max!)) invalid = true;
      }
      if (value(state, "you-focus") === 0 && value(state, "Jo-focus") === 0) exhausted++;
      if (!value(state, "Jo-hp")) playerWins++; else if (!value(state, "you-hp")) npcWins++;
    }
    return { playerWins, npcWins, exhausted, invalid };
  };
  const equal = run("uncertain", "uncertain"), disadvantaged = run("outmatched", "favorable");
  expect(equal.invalid || disadvantaged.invalid).toBe(false);
  expect(equal.playerWins).toBeGreaterThan(0); expect(equal.npcWins).toBeGreaterThan(0);
  expect(disadvantaged.npcWins).toBeGreaterThan(equal.npcWins);
  expect(equal.exhausted).toBeGreaterThan(0); expect(disadvantaged.exhausted).toBeGreaterThan(0);
});
