import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { describeSim, simulateEncounter } from "./simulate.js";

const r = normalizeRuleset({
  stats: { stress: { kind: "meter", start: 0 } },
  encounters: {
    brawl: {
      name: "Brawl", foe: { stats: { hp: { start: 10 } } },
      actions: {
        hit: { label: "Hit", check: { chance: 60 }, success: { foe: { hp: -4 } }, fail: { stress: 10 } },
        wait: { label: "Wait" },
        run: { label: "Run", check: { chance: 30 }, success: { end: "escaped" }, fail: { stress: 5 } },
      },
      foe_moves: { punch: { desc: "Punches", weight: 1, stress: 6 } },
      end_when: { won: "foe.hp <= 0", beaten: "stress >= 80" },
    },
  },
}).ruleset!;

describe("encounter simulation", () => {
  test("each strategy plays out many times, with outcomes, length and dead rounds", () => {
    const sim = simulateEncounter(r, "brawl", { runs: 60 })!;
    expect(sim.policies.map((p) => p.policy)).toEqual(["always Hit", "always Wait", "always Run", "a random mix"]);
    const hit = sim.policies[0];
    expect(Object.keys(hit.outcomes)).toContain("won");
    expect(hit.medianRounds).toBeGreaterThan(1);
    // Waiting never makes progress: every run is lost to the foe's punches.
    const wait = sim.policies[1];
    expect(wait.outcomes).toEqual({ beaten: 60 });
    expect(wait.stalled).toBeGreaterThan(0.9); // only the losing round itself "moves"
    expect(sim.notes.some((n) => n.includes('"always Wait" almost always ends "beaten"'))).toBe(true);
    expect(describeSim(sim)).toContain("always Run:");
    // Deterministic: the same ruleset simulates the same way.
    expect(simulateEncounter(r, "brawl", { runs: 60 })).toEqual(sim);
  });
});
