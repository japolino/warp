import { expect, test } from "bun:test";
import { applyObservations, emptyMechanics, readMechanicalObservations, prepareMechanical, prepareExchange, commitMechanical, mechanicalPacket } from "./mechanics.js";
import { readAbilityDefinitions } from "./abilities.js";
import { actorName, actionCount, entityFor } from "./encounters.js";
import { readResponsePlans } from "./exchanges.js";
import { costPayer } from "./companions.js";
import { revision } from "../shared/revision.js";
import { foldMechanics, MECHANICS_KEY } from "./mechanical-history.js";
import { pathOf } from "./world.js";
import { storyRevision } from "./story-text.js";
import type { Msg } from "../backend/ledger.js";
import { inspectMechanics } from "./inspector.js";

const content = "You have 12 of 12 Focus. Echo has 0 of 8 Focus. Echo is your summoned familiar and is absent. Echo's Focus costs are paid one for one from your Focus. Recall costs 2 Focus and summons Echo for 1 subsequent action of yours. Dismiss dismisses Echo. Echo's Beacon costs 3 Focus and grants Echo a Beacon condition until dismissed. Echo has an injured wing.";
const scene = { id: "opening", is_user: false, content };
const cite = (row: object, quote = content) => ({ ...row, message: scene.id, quote });
function setup() {
  const rows = [
    cite({ kind: "companion", actor: "Echo", controller: "you", companionKind: "summon" }),
    cite({ kind: "cost_link", from: "echo-focus", to: "focus", enabled: true, unsupported: [] }),
    cite({ kind: "resource", id: "focus", owner: "you", name: "Focus", current: 12, max: 12, role: "effort" }),
    cite({ kind: "resource", id: "echo-focus", owner: "Echo", name: "Focus", current: 0, max: 8, role: "effort" }),
    cite({ kind: "entity", name: "Echo", aliases: ["familiar"], entityKind: "person", present: false }),
    cite({ kind: "condition", id: "wing", owner: "Echo", name: "Injured wing", hinders: ["movement"], ending: "After treatment" }),
  ];
  let state = applyObservations(emptyMechanics(), readMechanicalObservations(rows, emptyMechanics(), [scene]));
  const definition = (owner: string, name: string, effects: object[], costs: object[] = []) => ({ owner, name, approach: "concentration", target: "self", costs, effects, requires: [], unsupported: [], message: scene.id, quote: content });
  const abilities = readAbilityDefinitions([
    definition("you", "Recall", [{ kind: "summon", target: "self", companion: "Echo", duration: 1 }], [{ kind: "resource", id: "focus", amount: 2 }]),
    definition("you", "Dismiss", [{ kind: "dismiss", target: "self", companion: "Echo" }]),
    definition("Echo", "Beacon", [{ kind: "condition", target: "self", name: "Beacon", ending: "Until dismissed", untilDismissed: true }], [{ kind: "resource", id: "echo-focus", amount: 3 }]),
  ], state, [scene]);
  state = applyObservations(state, abilities.map(value => ({ kind: "ability", value })));
  return { state, observations: [...readMechanicalObservations(rows, emptyMechanics(), [scene]), ...abilities.map(value => ({ kind: "ability" as const, value }))] };
}
function invocation(state: ReturnType<typeof setup>["state"], name: string) {
  const a = state.abilities!.find(a => a.name === name)!;
  return { kind: "ability" as const, ability: a.id, version: a.version };
}
function cast(state: ReturnType<typeof setup>["state"], id: string, name: string, actor = "you") {
  const receipt = prepareMechanical(state, id, actor, [invocation(state, name)]);
  expect(receipt.status).toBe("ready"); return commitMechanical(state, receipt);
}

test("ordinary sourced relationships reuse the same identity and prepare relevant capabilities in one read", () => {
  const { state } = setup();
  expect(state.companions).toHaveLength(1); expect(state.abilities).toHaveLength(3); expect(state.costLinks).toHaveLength(1);
  expect(actorName(state, "familiar")).toBe("Echo"); expect(state.companions![0].actor).toBe("Echo");
  expect(entityFor(state, "Echo")?.present).toBe(false);
  expect(mechanicalPacket(state).companions?.[0].companionKind).toBe("summon");
});

test("recall/dismiss/recall conserves identity, injuries and resources and uses saved costs exactly once", () => {
  const { state } = setup(), identity = structuredClone(state.entities![0]);
  const receipt = prepareMechanical(state, "recall", "you", [invocation(state, "Recall")]);
  expect(receipt.engine).toBe(7); expect(state.resources[0].current).toBe(12); expect(entityFor(state, "Echo")?.present).toBe(false);
  const recalled = commitMechanical(state, receipt); expect(recalled.resources[0].current).toBe(10);
  expect(commitMechanical(recalled, receipt)).toBe(recalled); expect(recalled.conditions).toEqual(state.conditions);
  expect(prepareMechanical(recalled, "again", "you", [invocation(recalled, "Recall")]).status).toBe("blocked");
  const dismissed = cast(recalled, "dismiss", "Dismiss"); expect(entityFor(dismissed, "Echo")?.present).toBe(false);
  const returned = cast(dismissed, "return", "Recall");
  expect(returned.resources[0].current).toBe(8); expect(returned.resources[1].current).toBe(0); expect(returned.conditions).toEqual(state.conditions);
  expect(returned.entities![0]).toEqual({ ...identity, present: true });
});

test("a shared ability cost debits the actual payer without ticking that payer or filling the borrower", () => {
  const initial = cast(setup().state, "recall", "Recall"), before = revision(initial);
  const receipt = prepareMechanical(initial, "beacon", "Echo", [invocation(initial, "Beacon")]);
  expect(receipt.status).toBe("ready"); expect(revision(initial)).toBe(before);
  const after = commitMechanical(initial, receipt);
  expect(after.resources[0].current).toBe(7); expect(after.resources[1].current).toBe(0);
  expect(actionCount(after, "you")).toBe(1); expect(actionCount(after, "Echo")).toBe(1);
  expect(after.conditions.some(c => c.owner === "Echo" && c.name === "Beacon")).toBe(true);
  expect(receipt.changes.filter(c => c.kind === "resource").map(c => c.id)).toEqual(["focus"]);
});

test("an unavailable shared payer rolls back the whole compound action; a real setback pays its cost", () => {
  const initial = cast(setup().state, "recall", "Recall"); initial.resources[0].current = 4;
  const before = revision(initial), action = invocation(initial, "Beacon");
  const blocked = prepareMechanical(initial, "two", "Echo", [action, action]);
  expect(blocked.status).toBe("blocked"); expect(blocked.changes).toEqual([]); expect(revision(initial)).toBe(before);
  const failed = prepareMechanical(initial, "failed", "Echo", [{ ...action, outcome: "setback" }]);
  expect(failed.status).toBe("ready"); const after = commitMechanical(initial, failed);
  expect(after.resources[0].current).toBe(1); expect(after.conditions.some(c => c.name === "Beacon")).toBe(false);
});

test("a link does not authorize direct foreign spending, transfer damage, restoration or a fresh ability", () => {
  const initial = cast(setup().state, "recall", "Recall");
  expect(prepareMechanical(initial, "steal", "Echo", [{ kind: "spend", resource: "focus", amount: 2 }]).status).toBe("blocked");
  expect(prepareMechanical(initial, "local", "Echo", [{ kind: "spend", resource: "echo-focus", amount: 2 }]).status).toBe("blocked");
  expect(prepareMechanical(initial, "restore", "Echo", [{ kind: "restore", resource: "echo-focus", amount: 2 }]).status).toBe("ready");
  const after = commitMechanical(initial, prepareMechanical(initial, "restore", "Echo", [{ kind: "restore", resource: "echo-focus", amount: 2 }]));
  expect(after.resources[0].current).toBe(10); expect(after.resources[1].current).toBe(2);
});

test("explicit subsequent-controller-action lifetime ignores chat reads and companion actions", () => {
  let state = cast(setup().state, "recall", "Recall"); const before = revision(state);
  mechanicalPacket(state); readMechanicalObservations([], state, [scene]); expect(revision(state)).toBe(before);
  state = cast(state, "beacon", "Beacon", "Echo"); expect(entityFor(state, "Echo")?.present).toBe(true);
  state = commitMechanical(state, prepareMechanical(state, "wait1", "you", [{ kind: "wait" }])); expect(entityFor(state, "Echo")?.present).toBe(true);
  state = commitMechanical(state, prepareMechanical(state, "wait2", "you", [{ kind: "wait" }])); expect(entityFor(state, "Echo")?.present).toBe(false);
  expect(state.companions![0].manifestation?.active).toBe(false); expect(state.resources[0].current).toBe(7);
  expect(state.conditions.some(c => c.id === "wing")).toBe(true);
});

test("dead summons cannot be recalled and ordinary re-extraction cannot resurrect them", () => {
  const { state } = setup(); state.entities![0].status = "dead";
  const receipt = prepareMechanical(state, "dead", "you", [invocation(state, "Recall")]);
  expect(receipt.status).toBe("blocked"); expect(state.resources[0].current).toBe(12);
  const next = { id: "later", is_user: false, content: "Echo appears beside you." };
  const observed = applyObservations(state, readMechanicalObservations([{ kind: "entity", name: "Echo", entityKind: "person", present: true, status: "active", message: next.id, quote: next.content }], state, [scene, next]));
  expect(entityFor(observed, "Echo")?.status).toBe("dead");
});

test("unsupported grant conditions block rather than waive a shared cost", () => {
  const initial = cast(setup().state, "recall", "Recall"); initial.costLinks![0].unsupported = ["Only while touching the controller"];
  const receipt = prepareMechanical(initial, "beacon", "Echo", [invocation(initial, "Beacon")]);
  expect(receipt.status).toBe("blocked"); expect(receipt.unresolved).toBe(true); expect(initial.resources[0].current).toBe(10);
});

test("revocation needs newer evidence and repeating an older permission cannot reopen the pool", () => {
  let initial = cast(setup().state, "recall", "Recall");
  const revoke = { id: "revoked", is_user: false, content: "You revoke Echo's access to your Focus." };
  initial = applyObservations(initial, readMechanicalObservations([{ kind: "cost_link", from: "echo-focus", to: "focus", enabled: false, unsupported: [], message: revoke.id, quote: revoke.content }], initial, [scene, revoke]));
  expect(initial.costLinks![0].enabled).toBe(false);
  const stale = readMechanicalObservations([cite({ kind: "cost_link", from: "echo-focus", to: "focus", enabled: true, unsupported: [] })], initial, [scene, revoke]);
  expect(stale).toEqual([]); expect(prepareMechanical(initial, "beacon", "Echo", [invocation(initial, "Beacon")]).status).toBe("blocked");
});

test("cycles, ambiguous payers and incompatible or vital pools are rejected even in persisted state", () => {
  const { state } = setup(); const original = structuredClone(state);
  expect(readMechanicalObservations([cite({ kind: "cost_link", from: "focus", to: "echo-focus", enabled: true, unsupported: [] })], state, [scene])).toEqual([]);
  state.costLinks!.push({ ...state.costLinks![0], id: "bad", from: "focus", to: "echo-focus" }); expect(() => costPayer(state, "focus")).toThrow("Cyclic");
  state.costLinks = structuredClone(original.costLinks); state.resources[0].role = "vital"; expect(() => costPayer(state, "echo-focus")).toThrow("compatible");
  state.resources = structuredClone(original.resources); state.resources[0].unit = "kWh"; state.resources[1].unit = "mana"; expect(() => costPayer(state, "echo-focus")).toThrow("compatible");
  state.resources = structuredClone(original.resources); state.costLinks!.push({ ...state.costLinks![0], id: "duplicate" }); expect(() => costPayer(state, "echo-focus")).toThrow("Ambiguous");
});

test("a bounded chain debits its terminal pool once without drawing from intermediate balances", () => {
  const state = cast(setup().state, "recall", "Recall");
  state.resources.push({ ...state.resources[0], id: "supply", owner: "Jo", current: 20 });
  state.costLinks!.push({ ...state.costLinks![0], id: "link2", from: "focus", to: "supply" });
  const after = cast(state, "beacon", "Beacon", "Echo");
  expect(after.resources.map(r => r.current)).toEqual([10, 0, 17]);
});

test("relationship evidence does not grant an NPC action", () => {
  const state = cast(setup().state, "recall", "Recall");
  expect(() => readResponsePlans([{ actor: "Echo", action: { kind: "ability", ability: "Beacon" }, assessment: { contested: false }, quote: "I order Echo to use Beacon." }], state, [scene, { id: "order", is_user: true, content: "I order Echo to use Beacon." }], true)).toThrow();
  const receipt = prepareExchange(state, "wait", "you", [{ kind: "wait" }], []);
  expect(receipt.responses).toEqual([]); expect(receipt.changes.some(c => c.kind === "resource")).toBe(false);
});

test("history revalidates companion evidence and replays one saved receipt on the selected branch", () => {
  const { state, observations } = setup();
  const opening = { ...scene, swipe_id: 0, metadata: { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf([]), text: storyRevision(scene.content), observations } } } } as unknown as Msg;
  expect(foldMechanics([opening])).toEqual(state);
  const user = { id: "user", is_user: true, content: "I use Recall.", metadata: {}, swipe_id: 0 } as unknown as Msg;
  const receipt = prepareMechanical(state, "recall", "you", [invocation(state, "Recall")]);
  const reply = { id: "reply", is_user: false, content: "Echo appears.", swipe_id: 0, metadata: { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf([opening, user]), text: storyRevision("Echo appears."), receipt, observations: [] } } } } as unknown as Msg;
  expect(foldMechanics([opening, user, reply])).toEqual(commitMechanical(state, receipt));
  const edited = { ...opening, content: opening.content.replace("summoned familiar", "unrelated bird") };
  expect(foldMechanics([edited, user, reply]).companions).toBeUndefined();
});

test("the reply carrying a dismissal cannot undo that transition with a conflicting entity row", () => {
  const state = cast(cast(setup().state, "recall", "Recall"), "dismiss", "Dismiss");
  const reply = { id: "dismissed", is_user: false, content: "Echo remains beside you.", metadata: { warpMechanics: { "0": { receipt: { id: "dismiss" } } } } };
  const rows = readMechanicalObservations([{ kind: "entity", name: "Echo", entityKind: "person", present: true, message: reply.id, quote: reply.content }], state, [scene, reply]);
  expect(entityFor(applyObservations(state, rows), "Echo")?.present).toBe(false);
});

test("a companion away in another room is not teleported by repeating its summon", () => {
  const state = cast(setup().state, "recall", "Recall"); state.entities![0].present = false;
  expect(prepareMechanical(state, "teleport", "you", [invocation(state, "Recall")]).status).toBe("blocked");
  expect(state.resources[0].current).toBe(10);
});

test("unknown relationships, grants without both owners and ordinary friends do not become summon abilities", () => {
  const { state } = setup();
  expect(readMechanicalObservations([cite({ kind: "companion", actor: "Stranger", controller: "you", companionKind: "summon" })], state, [scene])).toEqual([]);
  expect(readMechanicalObservations([cite({ kind: "cost_link", from: "echo-focus", to: "focus", enabled: true, unsupported: [] }, "Echo has 0 of 8 Focus.")], state, [scene])).toEqual([]);
  state.companions![0].companionKind = "companion";
  const prior = state.abilities![0]; state.abilities = [];
  expect(readAbilityDefinitions([{ ...prior, message: scene.id, quote: content }], state, [scene])).toEqual([]);
});

test("ordinary default states retain resolver 5 and do not acquire companion or cost-link fields", () => {
  const state = emptyMechanics(), receipt = prepareMechanical(state, "wait", "you", [{ kind: "wait" }]);
  expect(receipt.engine).toBe(5); expect(mechanicalPacket(state)).not.toHaveProperty("companions"); expect(mechanicalPacket(state)).not.toHaveProperty("costLinks");
});

test("optional inspection names the summon, lasting injury and actual shared payer without mutating state", () => {
  const { state } = setup(), before = revision(state), html = inspectMechanics(state);
  expect(html).toContain("Recall Echo"); expect(html).toContain("Injured wing"); expect(html).toContain("from you");
  expect(html).not.toContain("undefined"); expect(html).not.toContain("No established player mechanics yet"); expect(revision(state)).toBe(before);
});

test("shared routing cannot turn an unowned ability cost into access to another person's pool", () => {
  const state = cast(setup().state, "recall", "Recall");
  state.abilities!.find(a => a.name === "Beacon")!.costs[0].id = "focus";
  expect(prepareMechanical(state, "unowned", "Echo", [invocation(state, "Beacon")]).status).toBe("blocked");
  expect(state.resources[0].current).toBe(10);
});

test("dismissal ends only effects explicitly bound to the summon and retains the lasting injury", () => {
  let state = cast(cast(setup().state, "recall", "Recall"), "beacon", "Beacon", "Echo");
  expect(state.conditions.some(c => c.name === "Beacon" && c.summon === state.companions![0].id)).toBe(true);
  state = cast(state, "dismiss", "Dismiss");
  expect(state.conditions.map(c => c.id)).toEqual(["wing"]);
  expect(state.closedConditions?.some(c => c.name === "Beacon")).toBe(true);
  expect(state.resources.map(r => r.current)).toEqual([7, 0]);
  state = cast(state, "return", "Recall"); expect(state.conditions.map(c => c.id)).toEqual(["wing"]);
});

test("a unique literal given name grounds a known full-name controller without merging ambiguous people", () => {
  const { state } = setup(); delete state.companions;
  const message = { id: "introduced", is_user: false, content: "Norma works beside Echo, her regular autonomous assistant." };
  const source = { message: message.id, quote: message.content };
  state.entities!.push({ id: "norma", name: "Norma Hollowell", displayName: "Norma Hollowell", aliases: [], entityKind: "person", present: true, status: "active", source });
  const row = { kind: "companion", actor: "Echo", controller: "Norma", companionKind: "companion", ...source };
  const rows = readMechanicalObservations([row], state, [scene, message]);
  expect(rows).toHaveLength(1); expect(rows[0].kind === "companion" && rows[0].value.controller).toBe("Norma Hollowell");
  expect(state.entities!.at(-1)!.aliases).toEqual([]);
  state.entities!.push({ ...state.entities!.at(-1)!, id: "other", name: "Norma Vale", displayName: "Norma Vale" });
  expect(readMechanicalObservations([row], state, [scene, message])).toEqual([]);
});
