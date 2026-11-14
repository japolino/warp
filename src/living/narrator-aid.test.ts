import { expect, test } from "bun:test";
import legacy from "./fixtures/resolver10-receipts.json";
import { narratorAidChoices, validateNarratorAid, NARRATOR_AID_TOOL } from "./narrator-aid.js";
import { prepareMechanical, commitMechanical, type MechanicalState } from "./mechanics.js";
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
  expect(NARRATOR_AID_TOOL.parameters).not.toHaveProperty("turn");
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
});
