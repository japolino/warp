import { describe, expect, test } from "bun:test";
import { loadRuleset } from "../loader.js";
import { lintRuleset } from "../lint.js";
import { runLoopSim } from "../loop-sim.js";
import { initialState } from "../state.js";
import { getTemplate, looksLikeScenario, TEMPLATES, withCharacter, type Template } from "./index.js";

/** A template as installed: one lorebook entry per part, the card's character added to the people part. */
function install(t: Template, who: string | null = "Mira") {
  const parts = t.parts.map((p, i) => ({ label: `warp-ruleset · ${p.label}`, content: p.label === "people" && who ? withCharacter(p.yaml, who) : p.yaml, order: (i + 1) * 10 }));
  const { ruleset, issues } = loadRuleset(parts);
  return { r: ruleset!, issues: ruleset ? [...issues, ...lintRuleset(ruleset)] : issues };
}

describe("scenario vs character cards", () => {
  test("ordinary character cards are characters", () => {
    expect(looksLikeScenario({ name: "Chono Aina", description: "{{char}} is a catgirl who shares a dorm with {{user}}.", personality: "tsundere" })).toBe(false);
    expect(looksLikeScenario({ name: "Robin", description: "A kind orphan.", personality: "gentle", tags: ["female", "romance"] })).toBe(false);
  });

  test("scenario, narrator and world cards are recognised", () => {
    expect(looksLikeScenario({ name: "Lust Academy", description: "A magical academy full of students.", tags: ["Scenario"] })).toBe(true);
    expect(looksLikeScenario({ name: "Wasteland", description: "{{char}} is the narrator of a post-apocalyptic world.", personality: "" })).toBe(true);
    expect(looksLikeScenario({ name: "Tavern Tales", description: "{{char}} will play all the characters in the tavern.", personality: "" })).toBe(true);
    expect(looksLikeScenario({ name: "Dungeon RPG", description: "Explore floors of monsters.", personality: "" })).toBe(true);
  });

  test("withCharacter adds the named person once, also under an empty `people: {}`", () => {
    for (const t of TEMPLATES) {
      const people = t.parts.find((p) => p.label === "people")!.yaml;
      expect(people).toMatch(/^  people: \{\}/m);
      const once = withCharacter(people, "Chono Aina");
      expect(withCharacter(once, "Chono Aina")).toBe(once);
      const { r, issues } = install(t, "Chono Aina");
      expect(issues).toEqual([]);
      expect(initialState(r).people.chono_aina.name).toBe("Chono Aina");
      // Seeded without starting feelings → not calibrated, so the story's first read sets them.
      expect(initialState(r).calibrated.chono_aina).toBeUndefined();
    }
  });
});

describe("the two templates", () => {
  test("Story and Adventure, nothing else; the old ids still find them", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(["story", "adventure"]);
    expect(getTemplate("romance")?.id).toBe("story");
    expect(getTemplate("universal")?.id).toBe("adventure");
    expect(getTemplate("hometown")).toBeUndefined();
  });

  for (const t of TEMPLATES) {
    test(`${t.name} loads with 0 errors and 0 warnings, with and without the card's character`, () => {
      expect(install(t).issues).toEqual([]);
      expect(install(t, null).issues).toEqual([]);
      // Only the parts of the format (CORE-DESIGN §1.1).
      for (const p of t.parts) expect(["core", "stats", "people", "world", "actions", "story", "conflict"]).toContain(p.label);
    });

    test(`${t.name} starts from the greeting: the time and the place are read, later places come from the story`, () => {
      const { r } = install(t);
      expect(r.clock.start).toBe("greeting");
      expect(r.startPlace).toBe("greeting");
      expect(r.peopleOpen).toBe(true);
      expect(r.goals.fromStory).toBe(true);
      expect(initialState(r).locationName).toBeNull();
    });
  }

  test("Story: no dice anywhere, slow burn, attraction off by default", () => {
    const { r } = install(getTemplate("story")!);
    expect(r.style).toBe("story");
    expect(r.checks.typed).toBe(false);
    expect(r.statOrder).toEqual([]);
    expect(r.relStatOrder).toEqual(["affection", "trust"]);
    expect(Object.values(r.liveChoices.tags).every((a) => !a.check)).toBe(true);
    expect(Object.values(r.actions).every((a) => !a.check)).toBe(true);
    expect(Object.keys(r.conflict.kinds)).toEqual([]);
    // Slow burn: no reply moves a feeling more than 4, and a big moment may go past it.
    expect(Object.values(r.relStats).every((d) => d.narrator <= 4)).toBe(true);
    expect(r.relBigMoment).toEqual({ factor: 3, cooldown: 10 });
    // Band crossings come with a story line, and the warmer bands change how people speak.
    expect(r.relStats.trust.bands.find((b) => b.text === "Open")).toMatchObject({ say: expect.any(String), voice: expect.any(String) });
  });

  test("Adventure: d20 checks at risky moments, three contest kinds, live odds follow the words", () => {
    const { r } = install(getTemplate("adventure")!);
    expect(r.style).toBe("adventure");
    expect(r.checks).toMatchObject({ typed: true, partial: 3, bonus: 10, stats: ["body", "mind", "charm"], dc: { easy: 8, fair: 12, hard: 16, extreme: 20 } });
    expect(Object.keys(r.conflict.kinds)).toEqual(["fight", "chase", "argument"]);
    // A tag check has no fixed target: the written choice's difficulty word sets it.
    for (const tag of ["bold", "clever", "charm"]) expect(r.liveChoices.tags[tag].check?.target).toBeUndefined();
    expect(r.liveChoices.taper).toEqual({ step: 0.75, floor: 0.1 });
    // No dating, no fixed places, no hidden feat actions.
    expect(Object.values(r.actions).every((a) => !a.hidden)).toBe(true);
  });
});

describe("the loop simulator's gate on the real templates (CORE-DESIGN §2.7)", () => {
  for (const t of TEMPLATES) {
    test(`${t.name}: every gate passes over 50 turns × 30 seeds`, () => {
      const report = runLoopSim(install(t).r, { turns: 50, seeds: 30, contestRuns: 1000 });
      const failed = report.gates.filter((g) => !g.pass).map((g) => `${g.id}: ${g.value} (bar ${g.bar})`);
      expect(failed).toEqual([]);
      if (t.id === "adventure") {
        expect(report.gates.map((g) => g.id)).toEqual([
          "clock", "scene", "crossing-lines", "story-ends-contest", "odds-shown-real", "typed-rolls", "fail-direction", "odds-spread",
          "contest-rounds", "contest-3-6", "contest-break-off", "greedy-tag-share", "always-kind",
        ]);
        expect(report.counts.checks).toBeGreaterThan(500);
        expect(report.counts.contestsStarted).toBeGreaterThan(0);
      } else {
        expect(report.counts.checks).toBe(0);
        expect(report.contests).toEqual([]);
      }
      expect(report.counts.crossings).toBeGreaterThan(0);
    });
  }
});
