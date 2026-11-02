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

const resolver4 = await Bun.file(new URL("./fixtures/resolver4-receipts.json", import.meta.url)).json() as Pick<typeof fixtures, "generatedFrom" | "cases">;
for (const fixture of resolver4.cases) test(`${fixture.name} replays the installed resolver 4 result unchanged`, () => {
  expect(resolver4.generatedFrom).toBe("e7ec33c3cbdbe2665e7074546386c3a44058ed1e");
  expect(fixture.receipt.engine).toBe(4);
  expect(commitMechanical(fixture.before, fixture.receipt)).toEqual(fixture.after);
});

const resolver5 = await Bun.file(new URL("./fixtures/resolver5-receipts.json", import.meta.url)).json() as Pick<typeof fixtures, "generatedFrom" | "cases">;
for (const fixture of resolver5.cases) test(`${fixture.name} replays before optional local-routing annotations existed`, () => {
  expect(resolver5.generatedFrom).toBe("61a8f49329676d9b94743a94836db614507ece26");
  expect(fixture.receipt.engine).toBe(5);
  expect(commitMechanical(fixture.before, fixture.receipt)).toEqual(fixture.after);
});
