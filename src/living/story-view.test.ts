import { expect, test } from "bun:test";
import { STORY_VIEW, conditionalStory, makeStoryView, storyView, storyReadContent, readStoryEvidence, storyEvidenceMatches } from "./story-view.js";
import { readChanges, foldWorld, emptyWorld, pathOf } from "./world.js";
import { readMechanicalObservations, applyObservations, emptyMechanics, prepareMechanical, commitMechanical } from "./mechanics.js";
import { readAbilityDefinitions } from "./abilities.js";
import { foldMechanics, MECHANICS_KEY } from "./mechanical-history.js";
import { storyRevision } from "./story-text.js";
import { extractionWindow } from "./read-window.js";
import type { Msg } from "../backend/ledger.js";

const raw = '{{#when::en}}Clinic. Jo has {{focus}} Focus. Jo offers Mend to Sam.{{/when}}\n{{#when::jp}}Hidden Hall. Evil has 999 Focus.{{/when}}';
const visible = "Clinic. Jo stands beside Sam within arm's reach. Jo has 10 Focus. Sam has a minor routine cooking burn. Jo's Mend treats minor routine injury at touch range and costs 2 Focus. Jo offers Mend to treat Sam's burn.";
const message = () => ({ id: "g", content: raw, is_user: false, swipe_id: 0, metadata: {} } as Msg);
function projected() { const m = message(); m.metadata![STORY_VIEW] = { "0": makeStoryView(m, visible)! }; return m; }
const rows = (m: Msg) => {
 const cite = (row: object) => ({ ...row, message: m.id, quote: visible });
 return [cite({ kind: "entity", name: "Jo", entityKind: "person", present: true }), cite({ kind: "distance", from: "you", to: "Jo", band: "touch" }), cite({ kind: "resource", id: "focus", name: "Focus", owner: "Jo", current: 10, role: "effort" }), cite({ kind: "condition", id: "burn", name: "Cooking burn", owner: "you", category: "physical_injury", severity: "minor", recovery: "routine", helps: [], hinders: ["movement"], blocks: [], ending: "Treatment" })];
};

test("unresolved branches and decorative-only views are not readable events", () => {
 const m = message(); expect(conditionalStory(raw)).toBe(true); expect(storyReadContent(m)).toBe("");
 expect(extractionWindow([m], () => undefined)).toBeUndefined();
 expect(makeStoryView(m, raw)).toBeUndefined();
 expect(makeStoryView({ ...m, is_user: true }, visible)).toBeUndefined();
 m.metadata![STORY_VIEW] = { "0": makeStoryView(m, "❤️💚㉿★□\n")! }; expect(storyReadContent(m)).toBe("");
 expect(storyReadContent({ ...m, is_user: true })).toBe(raw);
});

test("views bind the actual source and swipe, and never change its story path", () => {
 const m = message(), path = pathOf([m]); const seen = projected();
 expect(pathOf([seen])).toBe(path); expect(seen.content).toBe(raw); expect(storyReadContent(seen)).toBe(visible);
 expect(storyView({ ...seen, swipe_id: 1 })).toBeUndefined();
 expect(storyView({ ...seen, content: raw + " edited" })).toBeUndefined();
 const changed = structuredClone(seen); (changed.metadata![STORY_VIEW] as any)["0"].text += " forged";
 expect(storyView(changed)).toBeUndefined(); expect(storyReadContent(changed)).toBe("");
});

test("new facts require selected text even when an inactive branch is present in raw storage", () => {
 const m = projected();
 const proposed = { changes: [{ op: "put", id: "clinic", kind: "fact", subject: "Jo", text: "Jo is at the clinic", message: m.id, quote: "Jo stands beside Sam" }, { op: "put", id: "hidden", kind: "fact", subject: "Evil", text: "Evil is here", message: m.id, quote: "Evil has 999 Focus." }], scene: { place: "Clinic", present: ["Jo"], message: m.id, quote: "Clinic." } };
 expect(readChanges(proposed, emptyWorld(), [message()]).events).toEqual([]);
 const read = readChanges(proposed, emptyWorld(), [m]); expect(read.events.map(e => e.id)).toEqual(["clinic"]);
 expect(read.events[0].evidence.viewRevision).toBe(storyView(m)!.revision);
 const record = { version: 1 as const, path: pathOf([]), text: storyRevision(raw), ...read };
 const world = foldWorld([{ ...m, record }]); expect(world.facts.map(f => f.id)).toEqual(["clinic"]); expect(world.place).toBe("Clinic");
 const tampered = structuredClone(m); (tampered.metadata![STORY_VIEW] as any)["0"].revision = "wrong";
 expect(foldWorld([{ ...tampered, record }]).facts).toEqual([]);
});

test("a raw conditional scene is not accepted merely because its old narrative record has a matching path", () => {
 const m = projected(), evidence = { message: m.id, quote: "Evil has 999 Focus.", sourceRevision: storyRevision(raw) };
 const record = { version: 1 as const, path: pathOf([]), text: storyRevision(raw), notes: [], events: [{ op: "put" as const, id: "evil", evidence, fact: { ...evidence, id: "evil", kind: "fact" as const, subject: "Evil", text: "Evil is here", status: "open" as const } }], scene: { place: "Hidden Hall", present: ["Evil"], ...evidence } };
 expect(foldWorld([{ ...m, record }])).toEqual(emptyWorld());
});

test("rendered numerical evidence compiles an NPC ability and replays one accepted aid cost", () => {
 const m = projected(), observed = readMechanicalObservations(rows(m), emptyMechanics(), [m], "Sam");
 let state = applyObservations(emptyMechanics(), observed);
 expect(state.resources[0].current).toBe(10); expect(state.resources[0].source.viewRevision).toBeTruthy();
 expect(readMechanicalObservations([{ kind: "resource", id: "evil", owner: "Evil", name: "Focus", current: 999, message: m.id, quote: "Evil has 999 Focus." }], state, [m])).toEqual([]);
 const abilities = readAbilityDefinitions([{ owner: "Jo", name: "Mend", approach: "concentration", target: "other", range: "touch", costs: [{ kind: "resource", id: "focus", amount: 2 }], effects: [{ kind: "mend", target: "target", impact: "minor" }], requires: [], unsupported: [], message: m.id, quote: visible }], state, [m], [], "Sam");
 expect(abilities).toHaveLength(1); expect(abilities[0].source.viewRevision).toBeTruthy();
 const defs = abilities.map(value => ({ kind: "ability" as const, value })); state = applyObservations(state, defs);
 const offers = readMechanicalObservations([{ kind: "aid_offer", actor: "Jo", target: "Sam", ability: "Mend", uncontested: true, unsupported: [], message: m.id, quote: "Jo offers Mend to treat Sam's burn." }], state, [m], "Sam");
 state = applyObservations(state, offers); expect(state.aidOffers).toHaveLength(1);
 m.metadata![MECHANICS_KEY] = { "0": { version: 1, path: pathOf([]), text: storyRevision(raw), observations: [...observed, ...defs, ...offers] } };
 expect(foldMechanics([m])).toEqual(state);
 const player = { id: "u", content: "Yes, please.", is_user: true, swipe_id: 0 } as Msg;
 const offer = state.aidOffers![0], receipt = prepareMechanical(state, "aid", "you", [{ kind: "accept_aid", offer: offer.id, version: offer.version }]);
 expect(receipt.status).toBe("ready"); const after = commitMechanical(state, receipt);
 const reply = { id: "r", content: "Jo treats the burn.", is_user: false, swipe_id: 0, metadata: { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf([m, player]), text: storyRevision("Jo treats the burn."), receipt, observations: [] } } } } as unknown as Msg;
 expect(foldMechanics([m, player, reply])).toEqual(after); expect(after.resources[0].current).toBe(8); expect(after.conditions).toEqual([]);
 expect(foldMechanics([m, player, reply])).toEqual(after);
});

test("historical mechanics without a rendered-view witness keep their original replay semantics", () => {
 const m = projected(), input = { kind: "resource", id: "old", name: "Focus", owner: "Evil", current: 999, message: m.id, quote: "Evil has 999 Focus.", sourceRevision: storyRevision(raw) };
 expect(readMechanicalObservations([input], emptyMechanics(), [m], undefined, true)).toHaveLength(1);
 const source = readStoryEvidence(m, "Jo has 10 Focus.")!; expect(storyEvidenceMatches(m, source)).toBe(true);
 expect(storyEvidenceMatches(m, { ...source, viewRevision: "changed" })).toBe(false);
});


test("ordinary macro names and numerical values also require the host view", () => {
 const m = { ...message(), content: "Jo has {{focus}} Focus and waits for {{user}}." };
 expect(conditionalStory(m.content)).toBe(false); expect(storyReadContent(m)).toBe("");
 m.metadata![STORY_VIEW] = { "0": makeStoryView(m, "Jo has 10 Focus and waits for Sam.")! };
 expect(readStoryEvidence(m, "Jo has 10 Focus and waits for Sam.")?.viewRevision).toBeTruthy();
 expect(storyReadContent(m)).toBe("Jo has 10 Focus and waits for Sam.");
});
