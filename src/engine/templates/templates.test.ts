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
