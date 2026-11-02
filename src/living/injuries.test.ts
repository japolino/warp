import { expect, test } from "bun:test";
import { revision } from "../shared/revision.js";
import { definitionSource, readAbilityDefinitions } from "./abilities.js";
import { emptyMechanics, applyObservations, readMechanicalObservations, prepareMechanical, prepareExchange, commitMechanical, conditionInfluence, type MechanicalState, type MechanicalOperation } from "./mechanics.js";
import { capable, actionCount } from "./encounters.js";
import { readResponsePlans } from "./exchanges.js";
import { foldMechanics, MECHANICS_KEY } from "./mechanical-history.js";
import { pathOf } from "./world.js";
import type { Msg } from "../backend/ledger.js";

const story = { id: "scene", is_user: false, content: "Jo is beside you at touch distance, preparing a strike. Sam carries 3 bandages." };
const source = definitionSource("persona", "Sam can use Spark, a small physical blast. First aid uses one bandage to treat physical injuries on Sam or another person at touch range.")!;
const npc = definitionSource("card", "Jo can use Bash, a heavy physical strike at touch range. Jo also knows First aid, using one bandage to treat another person's physical injuries at touch range.")!;
const injury = (s: MechanicalState, owner = "Jo") => s.conditions.find(c => c.owner === owner && c.injury);
const act = (s: MechanicalState, id: string, actor: string, ...ops: MechanicalOperation[]) => commitMechanical(s, prepareMechanical(s, id, actor, ops));
function setup() {
  const raw = [{ kind: "entity", name: "Jo", entityKind: "person", present: true }, { kind: "distance", from: "you", to: "Jo", band: "touch" }, { kind: "item", id: "bandages", name: "Bandage", owner: "you", quantity: 3, equipped: false }].map(row => ({ ...row, message: story.id, quote: story.content }));
  const observations = readMechanicalObservations(raw, emptyMechanics(), [story], "Sam");
  let state = applyObservations(emptyMechanics(), observations);
  const abilities = readAbilityDefinitions([
    { owner: "you", name: "Spark", approach: "concentration", target: "other", costs: [], effects: [{ kind: "harm", target: "target", impact: "minor", damageType: "physical" }], message: source.id, quote: "Sam can use Spark, a small physical blast." },
    { owner: "you", name: "First aid", approach: "precision", target: "either", range: "touch", costs: [{ kind: "item", id: "bandages", amount: 1 }], effects: [{ kind: "mend", target: "target", impact: "minor" }], message: source.id, quote: "First aid uses one bandage to treat physical injuries on Sam or another person at touch range." },
    { owner: "Jo", name: "Bash", approach: "force", target: "other", range: "touch", costs: [], effects: [{ kind: "harm", target: "target", impact: "standard", damageType: "physical" }], message: npc.id, quote: "Jo can use Bash, a heavy physical strike at touch range." },
  ], state, [story], [source, npc], "Sam");
  state = applyObservations(state, abilities.map(value => ({ kind: "ability", value })));
  return { state, observations: [...observations, ...abilities.map(value => ({ kind: "ability" as const, value }))] };
}
function ability(s: MechanicalState, name: string, target = "Jo"): MechanicalOperation {
  const a = s.abilities!.find(a => a.name === name)!; return { kind: "ability", ability: a.id, version: a.version, target };
}

test("physical play works without invented Health and injuries change physical eligibility, not social odds", () => {
  let { state } = setup();
  state = act(state, "hit-1", "you", { kind: "strike", target: "Jo" });
  expect(injury(state)?.name).toBe("Hurt"); expect(state.resources).toEqual([]);
  state = act(state, "hit-2", "you", { kind: "strike", target: "Jo" });
  expect(conditionInfluence(state, "Jo", "force").shift).toBe(-1);
  expect(conditionInfluence(state, "Jo", "speech").shift).toBe(0);
  state = act(state, "hit-3", "you", { kind: "strike", target: "Jo" });
  expect(injury(state)?.name).toBe("Badly injured"); expect(capable(state, "Jo")).toBe(true);
  state = act(state, "hit-4", "you", { kind: "strike", target: "Jo" });
  expect(capable(state, "Jo")).toBe(false); expect(state.entities![0].status).toBe("active");
  expect(prepareMechanical(state, "extra-hit", "you", [{ kind: "strike", target: "Jo" }]).status).toBe("blocked");
});

test("sourced bodily resilience changes qualitative consequences and cannot drift from repeated prose", () => {
  let { state } = setup();
  const card = definitionSource("card", "Jo has a tough, stone-reinforced body that resists small physical blows.")!;
  const messages = [story, { id: card.id, content: card.text, is_user: false }];
  const row = { kind: "resilience", owner: "Jo", band: "tough", message: card.id, quote: card.text };
  state = applyObservations(state, readMechanicalObservations([row], state, messages));
  expect(state.resilience![0].version).toBe(1);
  state = act(state, "tough-hit", "you", { kind: "strike", target: "Jo" });
  expect(injury(state)?.injury?.load).toBe(0.5);
  const later = { id: "later", content: "Jo flexes after the blow.", is_user: false };
  expect(readMechanicalObservations([{ ...row, band: "exceptional", message: later.id, quote: later.content }], state, [...messages, later])).toEqual([]);
  const changed = definitionSource("card", "Jo now has an exceptionally durable physical body after reinforcement.")!;
  state = applyObservations(state, readMechanicalObservations([{ ...row, band: "exceptional", message: changed.id, quote: changed.text }], state, [story, ...messages.slice(1), { id: changed.id, content: changed.text, is_user: false }]));
  expect(state.resilience![0]).toMatchObject({ band: "exceptional", version: 2 });
  const before = injury(state)!.injury!.load;
  state = act(state, "exceptional-hit", "you", { kind: "strike", target: "Jo" });
  expect(injury(state)!.injury!.load - before).toBe(0.125);
});

test("guarding, shields and reflection work on the same injury path with bounded return effects", () => {
  let { state } = setup(); state = act(state, "guard", "Jo", { kind: "defend" });
  state = act(state, "guarded-hit", "you", { kind: "strike", target: "Jo" });
  expect(injury(state)?.injury?.load).toBe(0.5);
  state.conditions = state.conditions.filter(c => !c.injury && c.name !== "Guarding");
  state.conditions.push({ id: "shield", owner: "Jo", name: "Shield", hinders: [], helps: [], blocks: [], ending: "Until depleted", defenses: [{ kind: "shield", damageType: "all", amount: 5 }, { kind: "reflect", damageType: "all", amount: 100 }], source: { message: "fixture", quote: "A known shield and reflection" } });
  state.conditions.push({ ...state.conditions[0], id: "return-shield", owner: "you", name: "Mirror", defenses: [{ kind: "reflect", damageType: "all", amount: 100 }] });
  state = act(state, "shielded", "you", { kind: "strike", target: "Jo" });
  expect(injury(state)).toBeUndefined();
  const receipt = prepareMechanical(state, "unshielded", "you", [{ kind: "strike", target: "Jo" }]);
  expect(receipt.beats!.filter(b => b.kind === "harm")).toHaveLength(2);
  state = commitMechanical(state, receipt);
  expect(injury(state)?.injury?.load).toBe(1); expect(injury(state, "you")?.injury?.load).toBe(1);
});

test("source-backed treatment pays once, improves a real injury and rejects an unsupported treatment before spending", () => {
  let { state } = setup(); state = act(state, "first-hit", "you", ability(state, "Spark")); state = act(state, "second-hit", "you", ability(state, "Spark"));
  state = act(state, "treat-1", "you", ability(state, "First aid"));
  expect(injury(state)?.name).toBe("Hurt"); expect(state.items[0].quantity).toBe(2);
  const receipt = prepareMechanical(state, "treat-2", "you", [ability(state, "First aid")]);
  state = commitMechanical(state, receipt);
  expect(injury(state)).toBeUndefined(); expect(state.items[0].quantity).toBe(1); expect(commitMechanical(state, receipt)).toBe(state);
  expect(prepareMechanical(state, "unneeded", "you", [ability(state, "First aid")]).status).toBe("blocked");
  expect(state.items[0].quantity).toBe(1);
});

test("generic treatment distinguishes routine injuries from lost limbs and special recovery", () => {
  let { state } = setup();
  const m = { id: "injury", is_user: false, content: "You have a minor cut treatable with first aid, and an amputated arm requiring an exceptional cure." };
  state = applyObservations(state, readMechanicalObservations([
    { kind: "condition", id: "cut", owner: "you", name: "Minor cut", category: "physical_injury", severity: "minor", recovery: "routine", ending: "After first aid", message: m.id, quote: m.content },
    { kind: "condition", id: "arm", owner: "you", name: "Missing arm", category: "physical_injury", severity: "major", recovery: "special", blocks: ["precision"], ending: "After an exceptional cure", message: m.id, quote: m.content },
  ], state, [story, m]));
  // Precision is blocked, so a capable helper performs the treatment instead.
  state.items.push({ ...state.items[0], id: "helper-bandage", owner: "Jo", quantity: 1 });
  const helper = readAbilityDefinitions([{ owner: "Jo", name: "First aid", approach: "concentration", target: "other", costs: [{ kind: "item", id: "helper-bandage", amount: 1 }], effects: [{ kind: "mend", target: "target", impact: "minor" }], message: npc.id, quote: "Jo also knows First aid, using one bandage to treat another person's physical injuries at touch range." }], state, [story, m], [npc])[0];
  state = applyObservations(state, [{ kind: "ability", value: helper }]);
  state = act(state, "helper-treats-cut", "Jo", { kind: "ability", ability: helper.id, version: 1, target: "you" });
  expect(state.conditions.some(c => c.id === "cut")).toBe(false); expect(state.conditions.some(c => c.id === "arm")).toBe(true);
  expect(state.resources).toEqual([]);
});

test("an incapacitated living player can wait for sourced aid without spending or advancing their own clock", () => {
  let { state } = setup();
  for (let i = 0; i < 4; i++) state = act(state, `injure-player-${i}`, "Jo", { kind: "strike", target: "you" });
  expect(capable(state, "you")).toBe(false);
  state.items.push({ ...state.items[0], id: "helper-bandage", owner: "Jo", quantity: 1 });
  const helper = readAbilityDefinitions([{ owner: "Jo", name: "First aid", approach: "precision", target: "other", range: "touch", costs: [{ kind: "item", id: "helper-bandage", amount: 1 }], effects: [{ kind: "mend", target: "target", impact: "minor" }], message: npc.id, quote: "Jo also knows First aid, using one bandage to treat another person's physical injuries at touch range." }], state, [story], [npc])[0];
  state = applyObservations(state, [{ kind: "ability", value: helper }]);
  const current = { id: "aid-ready", is_user: false, content: "Jo kneels beside you and prepares to treat your injuries with a bandage." };
  const responses = readResponsePlans([{ actor: "Jo", action: { kind: "ability", ability: helper.id, target: "you" }, assessment: { contested: false }, quote: current.content }], state, [story, current], true);
  const beforeClock = actionCount(state, "you"), after = commitMechanical(state, prepareExchange(state, "rescue", "you", [{ kind: "wait" }], responses));
  expect(capable(after, "you")).toBe(true); expect(injury(after, "you")?.name).toBe("Badly injured");
  expect(actionCount(after, "you")).toBe(beforeClock); expect(after.items.find(i => i.id === "helper-bandage")?.quantity).toBe(0);
  expect(after.items.find(i => i.owner === "you")?.quantity).toBe(3);
});

test("old quoted wounds cannot resurrect after treatment, including when an NPC owned the treatment action", () => {
  let { state } = setup(); state = act(state, "hurt", "you", { kind: "strike", target: "Jo" });
  const receipt = prepareMechanical(state, "heal", "you", [ability(state, "First aid")]), healed = commitMechanical(state, receipt);
  const old = { id: "old-wound", is_user: false, content: "Jo is badly injured from the earlier blow." };
  const reply: any = { id: "healing-reply", is_user: false, content: "The injury is treated.", metadata: { [MECHANICS_KEY]: { "0": { receipt } } } };
  const row = { kind: "condition", id: "new-duplicate-id", owner: "Jo", name: "Badly injured", hinders: ["force"], ending: "Until treated", message: old.id, quote: old.content };
  expect(readMechanicalObservations([row], healed, [story, old, reply])).toEqual([]);
  const fresh = { id: "fresh-wound", is_user: false, content: "Jo trips on broken glass and suffers a new cut." };
  expect(readMechanicalObservations([{ ...row, name: "New cut", category: "physical_injury", severity: "minor", recovery: "routine", message: fresh.id, quote: fresh.content }], healed, [story, old, reply, fresh])).toHaveLength(1);
  const npcClosed = structuredClone(healed); npcClosed.closedConditions![0].after.id = "npc-root:response:Jo";
  const npcReply: any = { ...reply, metadata: { [MECHANICS_KEY]: { "0": { receipt: { id: "npc-root", responses: [{ actor: "Jo" }] } } } } };
  expect(readMechanicalObservations([row], npcClosed, [story, old, npcReply])).toEqual([]);
  expect(readMechanicalObservations([{ ...row, message: fresh.id, quote: fresh.content }], npcClosed, [story, old, npcReply, fresh])).toHaveLength(1);
});

test("numerical source damage stays numerical and qualitative fallback never creates money, effort or recovery caps", () => {
  let { state } = setup();
  state.resources.push({ id: "hp", owner: "Jo", name: "Health", current: 7, max: 20, role: "vital", source: { message: "fixture", quote: "Known 7 of 20 Health" } });
  state = act(state, "numeric-hit", "you", { kind: "strike", target: "Jo" });
  expect(state.resources[0].current).toBe(2); expect(injury(state)).toBeUndefined();
  const exact = definitionSource("persona", "Exact costs nothing and deals 10 physical Health damage.")!;
  const def = readAbilityDefinitions([{ owner: "you", name: "Exact", approach: "force", target: "other", costs: [], effects: [{ kind: "damage", target: "target", resource: "Health", amount: 10, damageType: "physical" }], message: exact.id, quote: exact.text }], state, [story], [exact])[0];
  state = applyObservations(state, [{ kind: "ability", value: def }]); state.resources = [];
  expect(prepareMechanical(state, "unknown-exact", "you", [ability(state, "Exact")]).status).toBe("blocked");
  expect(state.resources).toEqual([]);
});

test("minor-only treatment cannot be repeated to cure severe injuries or spend supplies on an unsupported cure", () => {
  let { state } = setup();
  const limited = definitionSource("persona", "Dress cut uses one bandage and treats only minor injuries.")!;
  const row = { owner: "you", name: "Dress cut", approach: "precision", target: "either", costs: [{ kind: "item", id: "bandages", amount: 1 }], effects: [{ kind: "mend", target: "target", impact: "minor", maxInjury: "minor" }], message: limited.id, quote: limited.text };
  const definition = readAbilityDefinitions([row], state, [story], [limited])[0];
  expect(definition.effects[0].maxInjury).toBe("minor");
  state = applyObservations(state, [{ kind: "ability", value: definition }]);
  state = act(state, "cut-1", "you", { kind: "strike", target: "Jo" });
  state = act(state, "cut-2", "you", { kind: "strike", target: "Jo" });
  const blocked = prepareMechanical(state, "limited-treatment", "you", [ability(state, "Dress cut")]);
  expect(blocked.status).toBe("blocked"); expect(state.items[0].quantity).toBe(3);
  state = act(state, "broader-treatment", "you", ability(state, "First aid"));
  state = act(state, "minor-treatment", "you", ability(state, "Dress cut"));
  expect(injury(state)).toBeUndefined(); expect(state.items[0].quantity).toBe(1);
  expect(readAbilityDefinitions([{ ...row, effects: [{ ...row.effects[0], maxInjury: "major" }] }], emptyMechanics(), [story], [limited])).toEqual([]);
});

test("new narrative recovery prevents stale condition resurrection and survives history folding", () => {
  const { state: initial, observations } = setup();
  const greeting = { ...story, role: "assistant", swipe_id: 0, index_in_chat: 0 } as Msg;
  const cut = { id: "cut", role: "assistant", is_user: false, content: "Jo has a minor cut.", swipe_id: 0, index_in_chat: 1 } as Msg;
  const raw = { kind: "condition", id: "minor-cut", owner: "Jo", name: "Minor cut", category: "physical_injury", severity: "minor", recovery: "routine", ending: "After treatment", message: cut.id, quote: cut.content };
  const added = readMechanicalObservations([raw], initial, [greeting, cut]);
  const recovered = { id: "recovery", role: "assistant", is_user: false, content: "The cut heals after treatment.", swipe_id: 0, index_in_chat: 2 } as Msg;
  const before = applyObservations(initial, added), ended = readMechanicalObservations([{ kind: "condition_end", id: "minor-cut", message: recovered.id, quote: recovered.content }], before, [greeting, cut, recovered]);
  expect(ended[0]).toMatchObject({ retire: true });
  const after = applyObservations(before, ended);
  expect(readMechanicalObservations([raw], after, [greeting, cut, recovered])).toEqual([]);
  for (const [message, prefix, obs] of [[greeting, [], observations], [cut, [greeting], added], [recovered, [greeting, cut], ended]] as const) {
    message.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf([...prefix]), text: revision(message.content), observations: obs, sources: [source, npc] } } };
  }
  expect(foldMechanics([greeting, cut, recovered])).toEqual(after);
});

test("an NPC movement receipt with no scene place replays and admits only later distance evidence", () => {
  const { state } = setup();
  const current = { id: "moving", is_user: false, content: "Jo steps back, ready to retreat from touch distance." };
  const responses = readResponsePlans([{ actor: "Jo", action: { kind: "move", target: "you", direction: "away" }, assessment: { contested: false }, quote: current.content }], state, [story, current], true);
  const receipt = prepareExchange(state, "retreat-exchange", "you", [{ kind: "wait" }], responses, "");
  expect(receipt.status).toBe("ready");
  const after = commitMechanical(state, JSON.parse(JSON.stringify(receipt)));
  expect(after.distances![0].band).toBe("near");
  const reply: any = { id: "moved", is_user: false, content: "Jo retreats.", metadata: { [MECHANICS_KEY]: { "0": { receipt } } } };
  const row = { kind: "distance", from: "you", to: "Jo", band: "touch", message: story.id, quote: story.content };
  expect(readMechanicalObservations([row], after, [story, current, reply])).toEqual([]);
  const later = { id: "returned", is_user: false, content: "Jo returns to touch distance." };
  const updated = applyObservations(after, readMechanicalObservations([{ ...row, message: later.id, quote: later.content }], after, [story, current, reply, later]));
  expect(updated.distances![0].band).toBe("touch");
});

test("source profiles, qualitative effects and injuries replay with the selected branch without invented stats", () => {
  const { state, observations } = setup(), greeting = { ...story, role: "assistant", swipe_id: 0, index_in_chat: 0 } as Msg;
  greeting.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf([]), text: revision(story.content), observations, sources: [source, npc] } } };
  const player = { id: "player", role: "user", is_user: true, content: "I use Spark on Jo.", swipe_id: 0, index_in_chat: 1 } as Msg;
  const reply = { id: "reply", role: "assistant", is_user: false, content: "The blast catches Jo.", swipe_id: 0, index_in_chat: 2 } as Msg;
  const receipt = prepareMechanical(state, "spark", "you", [ability(state, "Spark")]);
  reply.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf([greeting, player]), text: revision(reply.content), receipt, observations: [] } } };
  expect(foldMechanics([greeting])).toEqual(state);
  expect(foldMechanics([greeting, player, reply])).toEqual(commitMechanical(state, receipt));
  reply.swipe_id = 1; expect(foldMechanics([greeting, player, reply])).toEqual(state);
});
