import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { initialState } from "./state.js";
import { narratorKnowledge } from "./view.js";
import { buildInjection } from "../backend/inject.js";

function fixture(full: unknown = false) {
  const r = loadRuleset([{ label: "warp-ruleset", order: 0, content: JSON.stringify({
    people: { sage: { name: "Sage" } }, companions: { sage: { knows: ["vault"], knows_full: full } },
    secrets: { vault: { about: "The vault", cue: "Sage avoids the door.", stages: [
      { text: "OPENED_TOKEN", when: "false" }, { text: "HIDDEN_TOKEN", when: "false" },
    ] } },
  }) }]).ruleset!;
  const s = initialState(r);
  s.people.sage = { name: "Sage" } as typeof s.people[string];
  // Sage is in the scene: what a companion knows only rides along while they're here.
  s.scene.sage = { here: true, loc: s.location, at: s.minutes };
  return { r, s };
}

describe("secret prompt isolation", () => {
  test("knowledgeable companions retain portrayal without gated text", () => {
    const { r, s } = fixture(); s.secrets.vault = 0;
    const prompt = buildInjection(r, null, s, s, "Player");
    expect(prompt).toContain("Sage knows more");
    expect(prompt).toContain("Sage avoids the door.");
    expect(prompt).not.toContain("OPENED_TOKEN"); expect(prompt).not.toContain("HIDDEN_TOKEN");
  });
  test("opened stages reach the prompt, later stages do not", () => {
    const { r, s } = fixture(); s.secrets.vault = 1;
    const prompt = buildInjection(r, null, s, s, "Player");
    expect(prompt).toContain("OPENED_TOKEN"); expect(prompt).not.toContain("HIDDEN_TOKEN");
  });
  test("explicit boolean author opt-in restores full knowledge", () => {
    const { r, s } = fixture(true); s.secrets.vault = -1;
    expect(narratorKnowledge(r, s)).toContain("HIDDEN_TOKEN");
    expect(narratorKnowledge(r, s)).toContain("author opted in");
    const strict = fixture("true"); strict.s.secrets.vault = -1;
    expect(narratorKnowledge(strict.r, strict.s)).not.toContain("HIDDEN_TOKEN");
  });
  test("a companion who isn't here brings none of it", () => {
    const { r, s } = fixture(true); s.scene.sage = { here: false, loc: s.location, at: s.minutes }; s.secrets.vault = -1;
    const known = narratorKnowledge(r, s) ?? "";
    expect(known).not.toContain("HIDDEN_TOKEN");
    expect(known).not.toContain("Sage knows more");
  });
  test("missing companion does not leak full knowledge", () => {
    const { r, s } = fixture(true); delete s.people.sage; s.secrets.vault = -1;
    expect(narratorKnowledge(r, s) ?? "").not.toContain("HIDDEN_TOKEN");
  });
});
