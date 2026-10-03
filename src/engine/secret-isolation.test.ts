import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { initialState } from "./state.js";
import { narratorKnowledge } from "./view.js";
import { buildInjection } from "../backend/inject.js";

function fixture(full: unknown = false) {
  const { ruleset: r, issues } = loadRuleset([{ label: "warp-ruleset", order: 0, content: JSON.stringify({
    // `companions:` (with knows/knows_full) was removed from Warp: it is ignored, and opens nothing.
    people: { sage: { name: "Sage" } }, companions: { sage: { knows: ["vault"], knows_full: full } },
    secrets: { vault: { about: "The vault", cue: "Sage avoids the door.", stages: [
      { text: "OPENED_TOKEN", when: "false" }, { text: "HIDDEN_TOKEN", when: "false" },
    ] } },
  }) }]);
  const s = initialState(r!);
  s.people.sage = { name: "Sage" } as typeof s.people[string];
  s.scene.sage = { here: true, loc: s.location, at: s.minutes };
  return { r: r!, s, issues };
}

describe("secret prompt isolation", () => {
  test("only the cue reaches the prompt before any stage opens", () => {
    const { r, s, issues } = fixture(); s.secrets.vault = 0;
    expect(issues.some((i) => i.where === "Companions" && i.message.includes("was removed from Warp"))).toBe(true);
    const prompt = buildInjection(r, null, s, s, "Player");
    expect(prompt).toContain("Sage avoids the door.");
    expect(prompt).not.toContain("OPENED_TOKEN"); expect(prompt).not.toContain("HIDDEN_TOKEN");
  });
  test("opened stages reach the prompt, later stages do not", () => {
    const { r, s } = fixture(); s.secrets.vault = 1;
    const prompt = buildInjection(r, null, s, s, "Player");
    expect(prompt).toContain("OPENED_TOKEN"); expect(prompt).not.toContain("HIDDEN_TOKEN");
  });
  test("an old companion's knows_full no longer opens unopened stages", () => {
    const { r, s } = fixture(true); s.secrets.vault = -1;
    expect(narratorKnowledge(r, s) ?? "").not.toContain("HIDDEN_TOKEN");
    expect(narratorKnowledge(r, s) ?? "").not.toContain("Sage knows more");
  });
});
