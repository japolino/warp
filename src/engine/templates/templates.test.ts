import { describe, expect, test } from "bun:test";
import { loadRuleset } from "../loader.js";
import { initialState } from "../state.js";
import { looksLikeScenario, TEMPLATES, withCharacter } from "./index.js";

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

  test("withCharacter only adds the named person, once", () => {
    const t = TEMPLATES.find((x) => x.id === "hometown")!;
    const people = t.parts.find((p) => p.label === "people")!.yaml;
    const once = withCharacter(people, "Chono Aina");
    expect(withCharacter(once, "Chono Aina")).toBe(once);
    const r = loadRuleset(t.parts.map((p, i) => ({ label: p.label, content: p.label === "people" ? once : p.yaml, order: i }))).ruleset!;
    expect(initialState(r).people.chono_aina.name).toBe("Chono Aina");
    // Seeded without starting feelings → not calibrated, so the story's first read sets them.
    expect(initialState(r).calibrated.chono_aina).toBeUndefined();
    // Template NPCs without start values are read from the story too.
    expect(initialState(r).calibrated.jo).toBeUndefined();
  });
});

describe("the Romance template", () => {
  const t = TEMPLATES.find((x) => x.id === "romance")!;
  const parts = t.parts.map((p, i) => ({ label: p.label, content: p.label === "people" ? withCharacter(p.yaml, "Mira") : p.yaml, order: i }));
  const { ruleset: r, issues } = loadRuleset(parts);

  test("just romance: feelings, time, choices for the moment — no stats, money, skills or dice", () => {
    expect(issues.filter((x) => x.level === "error")).toEqual([]);
    expect(r!.statOrder).toEqual([]);
    expect(r!.relStatOrder).toEqual(["affection", "trust", "attraction"]);
    // Typed messages are never turned into checks, and no choice rolls.
    expect(r!.improvise.enabled).toBe(false);
    expect(Object.values(r!.liveChoices.tags).every((a) => !a.check)).toBe(true);
    expect(Object.values(r!.actions).every((a) => !a.check)).toBe(true);
    // Slow burn: no reply can move a feeling more than a few points.
    expect(Object.values(r!.relStats).every((d) => d.narrator <= 6)).toBe(true);
    // Places come from the story, and the card's character is tracked from the start.
    expect(r!.locationsOpen).toBe(true);
    expect(initialState(r!).people.mira.name).toBe("Mira");
  });
});
