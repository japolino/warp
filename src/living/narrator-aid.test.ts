import { expect, test } from "bun:test";
import legacy from "./fixtures/resolver10-receipts.json";
import { narratorAidChoices, narratorAidNeedsScene, nativeAidNeedsSchemaRepair, nativeAidRepairPreservesTerms, sourceAidTerms, validateNarratorAid, NARRATOR_AID_TOOL } from "./narrator-aid.js";
import { prepareMechanical, commitMechanical, emptyMechanics, type MechanicalState } from "./mechanics.js";
import { bindDefinitionCitations, definitionSource } from "./abilities.js";

function clinic() { const state = structuredClone(legacy.cases[0].before) as MechanicalState; delete state.aidOffers; return state; }
const request = '"Could you treat my arm?"';
test("native aid leaves NPC choice to the narrator while validating the known beneficial definition and its original costs", () => {
  const state = clinic(), before = structuredClone(state), ability = narratorAidChoices(state, request)[0];
  expect(ability.name).toBe("Mend"); expect(state).toEqual(before);
  expect(validateNarratorAid(state, request, "Jo", ability.id)).toEqual(ability);
  const receipt = prepareMechanical(state, "narrator-choice", "Jo", [{ kind: "ability", ability: ability.id, version: ability.version, target: "you" }]);
  expect(receipt.status).toBe("ready"); expect(state).toEqual(before);
  const after = commitMechanical(state, receipt);
  expect(after.resources[0].current).toBe(8); expect(after.conditions).toEqual([]);
  expect(commitMechanical(after, receipt)).toBe(after);
  expect(NARRATOR_AID_TOOL.parameters.properties).not.toHaveProperty("turn");
  expect(NARRATOR_AID_TOOL.parameters.required).toEqual(["actor", "ability"]);
});

test("read-only questions, third-person requests, unspecified recipients and ambiguous addressed NPCs cannot authorize native aid", () => {
  const state = clinic();
  for (const text of ["How much does your healing cost?", "Could you heal Jo?", "Could you help?", "Could you treat my arm? I hand over five coins.", "OOC: could you heal my arm?"]) expect(narratorAidChoices(state, text)).toEqual([]);
  state.entities!.push({ ...structuredClone(state.entities![0]), id: "dex", name: "Dex", displayName: "Dex", aliases: [] });
  expect(narratorAidChoices(state, request)).toEqual([]);
  expect(narratorAidChoices(state, '"Could you treat my arm?" I ask Jo.')).toHaveLength(1);
  expect(narratorAidChoices(state, '"Could you treat my arm?" I ask Major.')).toEqual([]);
});

test("the narrator cannot bypass a price, owed work, unsupported service terms or shared player costs", () => {
  for (const field of [{ fee: { kind: "resource", id: "coins", amount: 5 } }, { work: [{ message: "work", quote: "Sweep the steps" }] }, { unsupported: ["only after sunset"] }, { agreement: "earned" }]) {
    const state = clinic(); state.aidOffers = [{ ...structuredClone(legacy.cases[0].before.aidOffers[0]), ...field }] as MechanicalState["aidOffers"];
    expect(narratorAidChoices(state, request)).toEqual([]);
  }
  const state = clinic(); state.resources[0].owner = "you";
  expect(narratorAidChoices(state, request)).toEqual([]);
  state.resources[0].owner = "Jo";
  state.abilities![0].effects = [{ kind: "damage", target: "target", amount: 5, basis: "source" }];
  expect(narratorAidChoices(state, request)).toEqual([]);
});

test("actual eligibility, missing range, an absent NPC and special injuries retain their existing engine constraints", () => {
  const state = clinic(), ability = state.abilities![0];
  delete ability.range; state.distances = [];
  ability.source.quote = "Jo's Mend gently treats routine injury at touch range and costs 2 Focus.";
  expect(() => validateNarratorAid(state, request, "Jo", ability.id)).toThrow("quoted range");
  state.entities![0].present = false;
  expect(narratorAidChoices(state, request)).toEqual([]);
  const special = clinic(); special.conditions[0].recovery = "special";
  const selected = validateNarratorAid(special, request, "Jo", special.abilities![0].id);
  const receipt = prepareMechanical(special, "not-a-cure", "Jo", [{ kind: "ability", ability: selected.id, version: selected.version, target: "you" }]);
  expect(receipt.status).toBe("blocked"); expect(receipt.changes).toEqual([]);
  special.abilities![0].effects = [{ kind: "clear_condition", target: "target", name: special.conditions[0].name }];
  expect(() => validateNarratorAid(special, request, "Jo", special.abilities![0].id)).toThrow("special injury");
});

test("first-use citation binding uses only a unique exact supplied source without changing the helper's quote or raw response", () => {
  const card = definitionSource("card", "Jo's Mend treats routine injuries at touch range.")!, lore = definitionSource("lore", card.text)!;
  const raw = [{ message: "request", quote: card.text }], before = structuredClone(raw);
  expect(bindDefinitionCitations(raw, [], [card])).toEqual([{ message: card.id, quote: card.text }]);
  expect(raw).toEqual(before);
  expect(bindDefinitionCitations(raw, [], [card, lore])).toEqual(raw);
  expect(bindDefinitionCitations([{ message: "request", quote: "Jo regenerates lost limbs." }], [], [card])).toEqual([{ message: "request", quote: "Jo regenerates lost limbs." }]);
  const wrapped = definitionSource("card", "Jo learned medicine from the forest.\r\nJo became a folk healer.")!, wrappedQuote = [{ message: "request", quote: wrapped.text }];
  expect(bindDefinitionCitations(wrappedQuote, [], [wrapped])).toEqual([{ message: wrapped.id, quote: "Jo learned medicine from the forest. Jo became a folk healer." }]);
  expect(wrappedQuote[0].quote).toBe(wrapped.text);
  expect(bindDefinitionCitations([{ message: wrapped.id, quote: wrapped.text }], [], [wrapped])).toEqual([{ message: wrapped.id, quote: "Jo learned medicine from the forest. Jo became a folk healer." }]);
});

test("unknown initial scene data can be prepared, but a recorded absence is not treated as ignorance", () => {
  expect(narratorAidNeedsScene(emptyMechanics(), request)).toBe(true);
  expect(narratorAidNeedsScene(emptyMechanics(), "What does healing cost?")).toBe(false);
  const state = clinic(); state.entities![0].present = false;
  expect(narratorAidNeedsScene(state, request)).toBe(false);
  state.entities![0].source.message = "warp-source:card:identity-only";
  expect(narratorAidNeedsScene(state, request)).toBe(true);
});

test("an address prefix is ordinary dialogue, and an absent addressee cannot authorize the one recorded NPC", () => {
  const state = clinic();
  expect(narratorAidChoices(state, '"Jo, could you treat my arm?"')).toHaveLength(1);
  expect(narratorAidChoices(state, '"Please, could you treat my arm?"')).toHaveLength(1);
  expect(narratorAidChoices(state, '"Major, could you treat my arm?"')).toEqual([]);
});

test("a missing offer cannot erase quoted terms, while a later actual explicit fee waiver and a distinct named ability retain their scope", () => {
  const state = clinic(), fee = { id: "fee", is_user: false, content: "Jo offers Mend for five coins." };
  expect(sourceAidTerms(state, [fee], "Jo", "Mend")).toContain("five coins");
  expect(sourceAidTerms(state, [{ ...fee, content: "Major offers Mend for five coins." }], "Jo", "Mend")).toBeUndefined();
  state.abilities!.push({ ...structuredClone(state.abilities![0]), id: "ward", name: "Ward" });
  expect(sourceAidTerms(state, [fee], "Jo", "Ward")).toBeUndefined();
  const free = { id: "free", is_user: false, content: "Jo offers Mend at no fee." };
  state.aidOffers = [{ ...structuredClone(legacy.cases[0].before.aidOffers[0]), source: { message: free.id, quote: free.content } }] as MechanicalState["aidOffers"];
  expect(sourceAidTerms(state, [fee, free], "Jo", "Mend")).toBeUndefined();
  expect(sourceAidTerms(state, [free, fee], "Jo", "Mend")).toContain("five coins");
  const work = { id: "work", is_user: false, content: "Jo offers Mend if you sweep the steps." };
  expect(sourceAidTerms(state, [work, free], "Jo", "Mend")).toContain("sweep");
});

test("only an incomplete supplied definition needs schema repair; missing ownership or restrictions cannot become defaults", () => {
  const complete = { owner: "Jo", name: "Mend", approach: "concentration", target: "other", costs: [], requires: [], unsupported: [], effects: [{ kind: "mend", target: "target", impact: "minor" }] };
  expect(nativeAidNeedsSchemaRepair({ abilityDefinitions: [complete] })).toBe(false);
  const incomplete: any = structuredClone(complete); delete incomplete.requires; delete incomplete.effects[0].target;
  expect(nativeAidNeedsSchemaRepair({ abilityDefinitions: [incomplete] })).toBe(true);
  for (const value of [null, {}, { abilityDefinitions: [] }, { abilityDefinitions: [null] }]) expect(nativeAidNeedsSchemaRepair(value)).toBe(false);
  expect(nativeAidNeedsSchemaRepair({ abilityDefinitions: [{ ...complete, unsupported: ["unknown source constraint"] }] })).toBe(false);
});

test("schema repair can fill missing structure but cannot waive known costs, change ownership or replace supplied effects", () => {
  const before = { abilityDefinitions: [{ owner: "Jo", name: "Mend", target: "other", approach: "precision", range: "touch", cooldown: 2, costs: [{ kind: "resource", id: "focus", amount: 2 }], effects: [{ kind: "mend", impact: "minor" }], unsupported: [] }] };
  const fixed: any = structuredClone(before); fixed.abilityDefinitions[0].requires = []; fixed.abilityDefinitions[0].effects[0].target = "target";
  expect(nativeAidRepairPreservesTerms(before, fixed)).toBe(true);
  for (const change of [{ costs: [] }, { owner: "you" }, { range: "far" }, { cooldown: 0 }, { effects: [{ kind: "mend", impact: "major", target: "target" }] }]) {
    const changed: any = structuredClone(fixed); Object.assign(changed.abilityDefinitions[0], change);
    expect(nativeAidRepairPreservesTerms(before, changed)).toBe(false);
  }
  expect(nativeAidRepairPreservesTerms(before, { abilityDefinitions: [] })).toBe(true);
});
