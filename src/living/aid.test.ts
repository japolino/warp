import { applyInjury } from "./injuries.js";
import { expect, test } from "bun:test";
import { definitionSource, readAbilityDefinitions } from "./abilities.js";
import { applyObservations, commitMechanical, emptyMechanics, prepareMechanical, prepareExchange, readMechanicalObservations, readMechanicalPlan, type MechanicalState } from "./mechanics.js";
import { actionCount } from "./encounters.js";
import { aidRequestIntent, aidOfferText } from "./aid.js";
import { foldMechanics } from "./mechanical-history.js";
import { storyRevision } from "./story-text.js";
import { pathOf } from "./world.js";
import type { Msg } from "../backend/ledger.js";

const opening = { id: "clinic", is_user: false, content: "Jo is beside you within arm's reach. Jo has 10 Focus. You have a minor routine cooking burn on your arm. Jo offers Mend to treat your burn." };
const profile = definitionSource("card", "Jo's Mend gently treats routine physical injury at touch range and costs 2 Focus.")!;
function setup() {
  const cite = (row: object) => ({ ...row, message: opening.id, quote: opening.content });
  const initial = readMechanicalObservations([
    cite({ kind: "entity", name: "Jo", entityKind: "person", present: true }), cite({ kind: "distance", from: "you", to: "Jo", band: "touch" }),
    cite({ kind: "resource", id: "focus", owner: "Jo", name: "Focus", current: 10, role: "effort" }),
    cite({ kind: "condition", id: "burn", owner: "you", name: "Cooking burn", category: "physical_injury", severity: "minor", recovery: "routine", helps: [], hinders: ["movement"], blocks: [], ending: "Appropriate treatment" }),
  ], emptyMechanics(), [opening]);
  let state = applyObservations(emptyMechanics(), initial);
  const definitions = readAbilityDefinitions([{ owner: "Jo", name: "Mend", approach: "concentration", target: "other", range: "touch", costs: [{ kind: "resource", id: "focus", amount: 2 }], effects: [{ kind: "mend", target: "target", impact: "minor" }], requires: [], unsupported: [], message: profile.id, quote: profile.text }], state, [opening], [profile]);
  expect(definitions).toHaveLength(1); state = applyObservations(state, definitions.map(value => ({ kind: "ability", value })));
  const offered = readMechanicalObservations([cite({ kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [] })], state, [opening]);
  expect(offered).toHaveLength(1); state = applyObservations(state, offered);
  state.clocks = [{ id: "you", actor: "you", actions: 4 }, { id: "Jo", actor: "Jo", actions: 2 }];
  return { state, observations: [...initial, ...definitions.map(value => ({ kind: "ability" as const, value })), ...offered] };
}
const consent = (s: MechanicalState, kind: "accept_aid" | "decline_aid" = "accept_aid") => ({ kind, offer: s.aidOffers![0].id, version: s.aidOffers![0].version });

test("one accepted aid applies the NPC's own source-backed ability, cost and clock, without a player action", () => {
  const { state } = setup(), before = structuredClone(state);
  const prepared = prepareMechanical(state, "accepted", "you", [consent(state)]);
  expect(prepared.status).toBe("ready"); expect(prepared.engine).toBe(10); expect(state).toEqual(before);
  const after = commitMechanical(state, prepared);
  expect(after.resources.find(r => r.id === "focus")!.current).toBe(8); expect(after.resources).toHaveLength(1);
  expect(after.conditions).toEqual([]); expect(actionCount(after, "you")).toBe(4); expect(actionCount(after, "Jo")).toBe(3);
  expect(prepared.beats?.find(b => b.kind === "mend")?.actor).toBe("Jo");
  expect(after.aidOffers![0].status).toBe("used"); expect(after.abilities?.map(a => a.owner)).toEqual(["Jo"]);
  expect(commitMechanical(after, prepared)).toBe(after);
  const twice = prepareMechanical(after, "another-acceptance", "you", [consent(after)]);
  expect(twice.status).toBe("blocked"); expect(twice.changes).toEqual([]); expect(after.resources[0].current).toBe(8);
});

test("declining permission spends no resource or action, even when the offered action cannot execute", () => {
  const { state } = setup(); state.entities![0].present = false; state.resources[0].current = 0;
  const receipt = prepareMechanical(state, "declined", "you", [consent(state, "decline_aid")]);
  expect(receipt.status).toBe("ready"); const after = commitMechanical(state, receipt);
  expect(after.aidOffers![0].status).toBe("withdrawn"); expect(after.resources).toEqual(state.resources); expect(after.clocks).toEqual(state.clocks); expect(after.conditions).toEqual(state.conditions);
});

test("missing actors, range, payment, treatment eligibility and changed definitions block atomically", () => {
  const mutations: ((s: MechanicalState) => void)[] = [
    s => { s.entities![0].present = false; }, s => { s.resources[0].current = 1; }, s => { s.distances = []; },
    s => { s.conditions[0].recovery = "special"; }, s => { s.abilities![0].version++; },
    s => { s.aidOffers![0].unsupported = ["Requires an unpaid fee"]; },
    s => { s.abilities![0].effects.push({ kind: "harm", target: "target", impact: "minor", damageType: "poison" }); },
  ];
  for (const mutate of mutations) {
    const { state } = setup(); mutate(state); const before = structuredClone(state);
    const receipt = prepareMechanical(state, "blocked", "you", [consent(state)]);
    expect(receipt.status).toBe("blocked"); expect(receipt.changes).toEqual([]); expect(state).toEqual(before);
    expect(state.aidOffers![0].status).toBe("offered");
  }
});

test("aid cannot bundle extra actions, another responder or another person's permission", () => {
  const { state } = setup(), op = consent(state);
  expect(prepareMechanical(state, "bundle", "you", [op, { kind: "wait" }]).status).toBe("blocked");
  expect(prepareMechanical(state, "not-yours", "Jo", [op]).status).toBe("blocked");
  expect(prepareExchange(state, "response", "you", [op], [{ actor: "Jo", action: { kind: "wait" }, source: { message: opening.id, quote: opening.content }, assessment: { contested: false, tier: "uncertain", intent: "", stakes: "", reasons: [] } }]).status).toBe("blocked");
});

test("requests invite an offer while informational and compound messages retain their normal meaning", () => {
  for (const text of ["Could you heal my arm?", '"Can you treat this burn?" I ask Jo.', "Would you please heal me?"]) expect(aidRequestIntent(text)).toBe(true);
  for (const text of ["How much does healing cost?", "Can you tell me how this spell works?", "Could you heal my arm? I attack the guard.", "OOC: could you heal my arm?", "Can you help with my homework?", "Can you help me?", "If you could heal me, I would pay."]) expect(aidRequestIntent(text)).toBe(false);
  const { state } = setup(), row = { ...consent(state), quote: "Yes, please." };
  expect(readMechanicalPlan([row], state, "Yes, please.")).toEqual([consent(state)]);
  expect(readMechanicalPlan([row], state, "Can I accept your offer?")).toEqual([]);
});

test("an offer needs actual current narrator willingness and a beneficial owned definition", () => {
  const { state } = setup(); state.aidOffers = [];
  const row = { kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [], message: opening.id, quote: opening.content };
  expect(readMechanicalObservations([{ ...row, message: profile.id, quote: profile.text }], state, [{ id: profile.id, is_user: false, content: profile.text }])).toEqual([]);
  expect(readMechanicalObservations([{ ...row, uncontested: false }], state, [opening])).toEqual([]);
  expect(readMechanicalObservations([{ ...row, target: "Jo" }], state, [opening])).toEqual([]);
  expect(readMechanicalObservations([row], state, [opening, { id: "later", is_user: false, content: "Jo is discussing something else." }])).toEqual([]);
  const after = commitMechanical(setup().state, prepareMechanical(setup().state, "used", "you", [consent(setup().state)]));
  expect(readMechanicalObservations([row], after, [opening])).toEqual([]);
});


test("saved offers and their consumed state replay without reopening or repeating NPC payment", () => {
  const { observations } = setup();
  const greeting = { ...opening, index_in_chat: 0, metadata: { warpMechanics: { "0": { version: 1, path: pathOf([]), text: storyRevision(opening.content), observations, sources: [profile] } } } } as unknown as Msg;
  const before = foldMechanics([greeting]);
  expect(before.aidOffers?.[0].status).toBe("offered"); expect(before.resources[0].current).toBe(10);
  const player = { id: "accepted", content: "Yes, please.", is_user: true, index_in_chat: 1 } as Msg;
  const receipt = prepareMechanical(before, "accepted-aid", "you", [consent(before)]);
  const after = commitMechanical(before, receipt);
  const content = "Jo uses Mend to treat your burn.";
  const reply = { id: "treated", is_user: false, content, index_in_chat: 2, metadata: { warpMechanics: { "0": { version: 1, path: pathOf([greeting, player]), text: storyRevision(content), observations: [], receipt } } } } as unknown as Msg;
  expect(foldMechanics([greeting, player, reply])).toEqual(after);
  expect(foldMechanics([greeting, player, reply])).toEqual(after);
  expect(after.aidOffers![0].status).toBe("used"); expect(after.resources[0].current).toBe(8);
  const changed = { ...player, content: "No, thanks." };
  expect(foldMechanics([greeting, changed, reply]).applied).toEqual([]);
});

test("an NPC's own due effect advances once while accepting aid does not pulse the player", () => {
  let { state } = setup();
  const current = { id: "burning", is_user: false, content: "Jo is Burning from fire until extinguished. You are Burning from fire until extinguished." };
  const effect = { kind: "periodic", target: "self", name: "Burning", untilCleared: true, endingRule: "extinguish", cadence: "owner_action", pulse: { kind: "harm", impact: "minor", damageType: "fire" } };
  state = applyObservations(state, readMechanicalObservations(["Jo", "you"].map(owner => ({ kind: "periodic", owner, name: "Burning", effect, message: current.id, quote: current.content })), state, [opening, current]));
  expect(state.conditions.filter(c => c.periodic)).toHaveLength(2);
  const playerSchedule = structuredClone(state.conditions.find(c => c.owner === "you" && c.periodic));
  const receipt = prepareMechanical(state, "aid-with-pulses", "you", [consent(state)]); expect(receipt.status).toBe("ready");
  const after = commitMechanical(state, receipt);
  expect(after.conditions.find(c => c.owner === "you" && c.periodic)).toEqual(playerSchedule);
  expect(after.conditions.find(c => c.owner === "Jo" && c.injury)?.injury?.load).toBe(1);
  expect(receipt.beats?.filter(b => b.kind === "pulse")).toHaveLength(1);
  expect(actionCount(after, "you")).toBe(4); expect(actionCount(after, "Jo")).toBe(3);
});

test("a living incapacitated player may grant aid permission but explicit death is not resurrection", () => {
  const { state } = setup();
  state.conditions = []; applyInjury(state, "Jo", "you", 20, "physical", [], [], "injured");
  const receipt = prepareMechanical(state, "incapacitated-aid", "you", [consent(state)]); expect(receipt.status).toBe("ready");
  expect(commitMechanical(state, receipt).conditions[0].injury?.load).toBe(3); expect(actionCount(commitMechanical(state, receipt), "you")).toBe(4);
  state.entities!.push({ id: "you", name: "you", displayName: "Sam", aliases: [], entityKind: "person", present: true, status: "dead", source: { message: opening.id, quote: opening.content } });
  expect(prepareMechanical(state, "dead-aid", "you", [consent(state)]).status).toBe("blocked");
  expect(prepareMechanical(state, "dead-decline", "you", [consent(state, "decline_aid")]).status).toBe("ready");
});

test("an explicit price cannot disappear from an offered aid", () => {
  const { state } = setup(); state.aidOffers = [];
  const priced = { id: "priced", is_user: false, content: "Jo offers Mend for five coins." };
  const read = readMechanicalObservations([{ kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [], message: priced.id, quote: priced.content }], state, [opening, priced]);
  expect(read).toHaveLength(1); const offered = applyObservations(state, read);
  expect(offered.aidOffers![0].unsupported).toHaveLength(1);
  expect(aidOfferText(offered.aidOffers![0], offered)).toContain("needs clarification");
  const receipt = prepareMechanical(offered, "unpaid", "you", [consent(offered)]);
  expect(receipt.status).toBe("blocked"); expect(receipt.unresolved).toBe(true); expect(receipt.changes).toEqual([]);
  expect(aidOfferText(setup().state.aidOffers![0], setup().state)).toBe("Jo offers Mend · uses 2 Focus");
});


test("a shared payer is forecast and charged once, without advancing the player's clock", () => {
  const { state } = setup(); state.resources[0].current = 0;
  const source = { message: "sharing", quote: "Jo's Focus costs are paid one for one from your Focus with your permission. You have 10 Focus." };
  state.resources.push({ id: "your-focus", owner: "you", name: "Focus", current: 10, role: "effort", source });
  const sharing = { id: source.message, is_user: false, content: source.quote };
  const observations = readMechanicalObservations([{ kind: "cost_link", from: "focus", to: "your-focus", enabled: true, unsupported: [], ...source }], state, [opening, sharing]);
  expect(observations).toHaveLength(1); const linked = applyObservations(state, observations);
  expect(aidOfferText(linked.aidOffers![0], linked)).toBe("Jo offers Mend · uses 2 of your Focus");
  const receipt = prepareMechanical(linked, "shared-aid", "you", [consent(linked)]); expect(receipt.status).toBe("ready");
  const after = commitMechanical(linked, receipt);
  expect(after.resources.find(r => r.id === "your-focus")!.current).toBe(8); expect(after.resources.find(r => r.id === "focus")!.current).toBe(0);
  expect(actionCount(after, "you")).toBe(4); expect(actionCount(after, "Jo")).toBe(3);
});

test("a pending aid cannot be replaced by an unrecorded prose cure", () => {
  const { state } = setup(), reply = { id: "free-treatment", is_user: false, content: "Jo heals your Cooking burn without executing the offered action." };
  expect(readMechanicalObservations([{ kind: "condition_end", id: "burn", message: reply.id, quote: reply.content }], state, [opening, reply])).toEqual([]);
  const beforeFeature = structuredClone(state); delete beforeFeature.aidOffers;
  // Historical ordinary recovery keeps its earlier semantics when no aid feature was published.
  expect(readMechanicalObservations([{ kind: "condition_end", id: "burn", message: reply.id, quote: reply.content }], beforeFeature, [opening, reply], undefined, true)).toHaveLength(1);
});
