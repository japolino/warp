// Review fixes: reserved ids and macros in generated residents.
import { expect, test } from "bun:test";
import { loadRuleset } from "../engine/loader.js";
import { initialState } from "../engine/state.js";
import { residentFrom } from "./discover.js";

const r = loadRuleset([{ label: "t", order: 0, content: "relationships: { stats: { trust: { start: 0 } } }\nlocations: { home: { name: Home } }" }]).ruleset!;

test("generated residents never take engine-reserved ids", () => {
  const s = initialState(r);
  for (const name of ["Player", "You", "User", "Target"]) {
    const res = residentFrom(r, s, { name, desc: "Someone." });
    expect(res).toBeDefined();
    expect(["player", "you", "user", "target"]).not.toContain(res!.id);
  }
});

test("generated text with host macros is rejected", () => {
  const s = initialState(r);
  expect(residentFrom(r, s, { name: "{{char}}", desc: "x" })).toBeUndefined();
  expect(residentFrom(r, s, { name: "Mara", desc: "Says {{user}} is late." })).toBeUndefined();
});
