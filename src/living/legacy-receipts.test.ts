import { expect, test } from "bun:test";
import { commitMechanical, type MechanicalState, type MechanicalReceipt } from "./mechanics.js";
import { foldMechanics } from "./mechanical-history.js";
import type { Msg } from "../backend/ledger.js";

const fixtures = await Bun.file(new URL("./fixtures/legacy-receipts.json", import.meta.url)).json() as {
  generatedFrom: string; cases: { name: string; before: MechanicalState; receipt: MechanicalReceipt; after: MechanicalState }[];
  history: { messages: Msg[]; after: MechanicalState };
};
for (const fixture of fixtures.cases) test(`${fixture.name} replays the actual prior resolver receipt unchanged`, () => {
  expect(fixtures.generatedFrom).toBe("887d0271b37620659c503e7010df82f390e06d2f");
  if (fixture.receipt.status === "ready") expect(commitMechanical(fixture.before, fixture.receipt)).toEqual(fixture.after);
  else { expect(() => commitMechanical(fixture.before, fixture.receipt)).toThrow(); expect(fixture.after).toEqual(fixture.before); }
});
test("legacy narrative condition endings do not acquire new bookkeeping or change later receipt bases", () => {
  expect(foldMechanics(fixtures.history.messages)).toEqual(fixtures.history.after);
  expect(foldMechanics(fixtures.history.messages).closedConditions).toBeUndefined();
});
