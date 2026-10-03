import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { foldEvents, initialState } from "./state.js";
import { applyProposal, resolveTurn } from "./resolve.js";
import { summarizeEvents } from "./view.js";

const r = loadRuleset([{ label: "t", content: `
name: Why
clock: { start: "Mon 08:00" }
stats:
  stress: { start: 0, good: low, narrator: 10, per_hour: 1 }
  pain: { start: 0, good: low }
actions:
  lift: { label: Lift the crate, time: 60, cost: { stress: +2 }, check: { vs: -20, label: Strength }, success: { pain: +5 }, fail: { pain: +5 } }
triggers:
  strain: { when: "pain >= 5", do: { stress: +10 } }
`, order: 0 }]).ruleset!;

describe("the Why? trace", () => {
  test("every change says what caused it", () => {
    const s0 = initialState(r);
    const rec = resolveTurn(r, s0, { actionId: "lift", via: "choice" }, { seed: "w" });
    const s1 = foldEvents(r, [rec.events], s0);
    const why = Object.fromEntries(summarizeEvents(r, s0, s1, rec.events).map((c) => [c.text.split(" ")[0], c.why ?? []]));
    expect(why.Pain.join()).toContain('"Lift the crate": Strength rolled');
    expect(why.Stress.join(" | ")).toContain('Cost of "Lift the crate"');
    expect(why.Stress.join(" | ")).toContain('Rule "strain" (pain >= 5)');
  });

  test("story updates say so", () => {
    const s0 = initialState(r);
    const events = applyProposal(r, s0, { stats: { stress: 4 } });
    const s1 = foldEvents(r, [events], s0);
    expect(summarizeEvents(r, s0, s1, events)[0].why).toEqual(["Read from the story"]);
  });
});
