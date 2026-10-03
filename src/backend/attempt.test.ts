import { describe, expect, test } from "bun:test";
import { loadRuleset } from "../engine/loader.js";
import { resolveTurnFull } from "../engine/resolve.js";
import { initialState } from "../engine/state.js";
import { scriptedAttempt, tellable } from "./attempt.js";

const r = loadRuleset([{ label: "t", content: `
name: Gym
stats:
  athletics: { kind: skill, max: 100, start: 30 }
actions:
  course: { label: Run the timing course, check: { chance: 50, label: Athletics }, success: { athletics: +1 }, fail: {} }
  wave: { label: Wave }
`, order: 0 }]).ruleset!;

describe("a clicked move told in the player's message", () => {
  test("the roll made on the click is the roll the reply gets (same seed), and a told tier stands", () => {
    const s = initialState(r);
    const intent = { actionId: "course", via: "choice" as const };
    const first = resolveTurnFull(r, s, { ...intent, seed: "click-1" }, { seed: "click-1" }).record;
    // The reply re-resolves with the intent's seed: the same dice, the same tier.
    const again = resolveTurnFull(r, s, { ...intent, seed: "click-1", tier: first.check!.tier }, { seed: "click-1" }).record;
    expect(again.check!.faces).toEqual(first.check!.faces);
    expect(again.check!.tier).toBe(first.check!.tier);
    // Even with a different seed (a state that shifted), what the message told stands.
    const told = first.check!.tier === "fail" ? "success" : "fail";
    expect(resolveTurnFull(r, s, { ...intent, tier: told }, { seed: "other" }).record.check!.tier).toBe(told);
  });

  test("only a move with a roll has something to tell", () => {
    const s = initialState(r);
    expect(tellable(resolveTurnFull(r, s, { actionId: "course", via: "choice" }, { seed: "x" }).record)).toBe(true);
    expect(tellable(resolveTurnFull(r, s, { actionId: "wave", via: "choice" }, { seed: "x" }).record)).toBe(false);
  });

  test("the set line, when no helper writes one, says how it went", () => {
    expect(scriptedAttempt("*I run the timing course.*", "success")).toBe("*I run the timing course — and it comes off well.*");
    expect(scriptedAttempt("Run the timing course", "crit_fail")).toBe("*Run the timing course — and it goes badly wrong.*");
    expect(scriptedAttempt("", "partial")).toContain("mostly works");
  });
});
