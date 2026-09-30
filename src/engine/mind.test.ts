import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { foldEvents, initialState } from "./state.js";
import { resolveTurn } from "./resolve.js";
import { perception } from "./view.js";

const r = loadRuleset([{ label: "t", content: `
name: Mind
stats:
  control: { start: 80 }
  lust: { start: 0 }
  bruises: { start: 0, good: low }
actions:
  punch: { label: Punch the thug, tags: [violence], check: { chance: 100 }, success: { bruises: +1 }, fail: { bruises: +5 } }
  talk: { label: Talk it out }
  flirt: { label: Flirt shamelessly, effects: { lust: +5 } }
mind:
  overrides:
    freeze: { when: "control < 25", chance: 100, on: [violence], cause: Panic, text: "their body won't obey." }
    urge: { when: "lust >= 50", chance: 100, on: [talk], do: flirt, cause: Desire }
    shaky: { when: "control < 50 and control >= 25", chance: 100, do: alter, cause: Nerves }
  perception:
    - { when: "control < 25", text: "Everything feels too loud and too close." }
`, order: 0 }]).ruleset!;

const at = (stats: Record<string, number>) => foldEvents(r, [Object.entries(stats).map(([id, v]) => ({ t: "stat" as const, id, set: v, src: "manual" as const }))], initialState(r));

describe("the mind overrules the player", () => {
  test("calm: the action goes ahead as chosen", () => {
    const rec = resolveTurn(r, at({ control: 80 }), { actionId: "punch", via: "choice" }, { seed: "a" });
    expect(rec.mind).toBeUndefined();
    expect(rec.check?.tier).toBeDefined();
  });

  test("panic: it fails without a roll, and the narrator is told why", () => {
    const rec = resolveTurn(r, at({ control: 10 }), { actionId: "punch", via: "choice" }, { seed: "a" });
    expect(rec.mind).toMatchObject({ cause: "Panic", kind: "fail", meant: "Punch the thug" });
    expect(rec.check).toBeUndefined();
    expect(rec.events.some((e) => e.t === "stat" && e.id === "bruises" && e.d === 5)).toBe(true);
    expect(rec.hints.join(" ")).toContain("won't obey");
  });

  test("compulsion: something else happens instead", () => {
    const rec = resolveTurn(r, at({ lust: 60 }), { actionId: "talk", via: "choice" }, { seed: "a" });
    expect(rec.mind?.kind).toBe("redirect");
    expect(rec.action?.label).toBe("Flirt shamelessly");
    expect(rec.events.some((e) => e.t === "stat" && e.id === "lust")).toBe(true);
  });

  test("nerves: it goes ahead, coloured by the cause", () => {
    const rec = resolveTurn(r, at({ control: 40 }), { actionId: "punch", via: "choice" }, { seed: "a" });
    expect(rec.mind?.kind).toBe("alter");
    expect(rec.check).toBeDefined();
  });

  test("perception filters reach the narrator only while they hold", () => {
    expect(perception(r, at({ control: 80 }))).toBeNull();
    expect(perception(r, at({ control: 10 }))).toContain("too loud");
  });
});
