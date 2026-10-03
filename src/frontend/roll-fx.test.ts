import { describe, expect, test } from "bun:test";
import { newRolls } from "./roll-fx.js";
import { check, record, stateMsg } from "./fixtures.js";

describe("the one roll animation", () => {
  const before = stateMsg({ records: [record({ messageId: "m1", check: check() })] });

  test("plays for a reply that just rolled, once", () => {
    const after = stateMsg({ records: [...before.records, record({ messageId: "m2", check: check({ total: 9, tier: "fail", tierLabel: "Failure" }) })] });
    expect(newRolls(before, after).map((r) => r.messageId)).toEqual(["m2"]);
    expect(newRolls(after, after)).toEqual([]);
  });

  test("a swipe that rolls again plays again", () => {
    const swiped = stateMsg({ records: [record({ messageId: "m1", swipe: 1, check: check() })] });
    expect(newRolls(before, swiped).map((r) => r.swipe)).toEqual([1]);
  });

  test("never on the first push, a chat switch, or a reply without a roll", () => {
    expect(newRolls(null, before)).toEqual([]);
    expect(newRolls(before, stateMsg({ chatId: "c2", records: [record({ messageId: "m9", check: check() })] }))).toEqual([]);
    expect(newRolls(before, stateMsg({ records: [...before.records, record({ messageId: "m2" })] }))).toEqual([]);
  });
});
