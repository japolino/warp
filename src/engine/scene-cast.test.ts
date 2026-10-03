import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { initialState, type GameState } from "./state.js";
import { narratorKnowledge, stateDigest } from "./view.js";

const r = loadRuleset([{ label: "t", content: `
name: Crew
clock: { start: "Mon 20:00" }
relationships:
  stats: { love: { start: 10, narrator: 10 } }
  people:
    jo: { name: Jo }
    dex: { name: Dex }
secrets:
  heist: { about: Dex, tell: exists, stages: [ { when: "flag('told')", text: "Dex robbed the warehouse." } ] }
`, order: 0 }]).ruleset!;

/** Put people in the scene with {{user}}. */
const withHere = (s: GameState, ...ids: string[]) => { for (const id of ids) s.scene[id] = { here: true, loc: s.location, at: s.minutes }; return s; };

describe("who's in the scene, for the narrator", () => {
  test("a secret about someone rides along only while they're here, and only its opened stages", () => {
    const s = initialState(r);
    expect(narratorKnowledge(r, s) ?? "").not.toContain("Dex");
    withHere(s, "dex");
    expect(narratorKnowledge(r, s)).toContain("Dex is keeping something you don't know");
    expect(narratorKnowledge(r, s)).not.toContain("Dex robbed the warehouse.");
    // Never met: not named as someone who just left, either.
    expect(stateDigest(r, initialState(r))).not.toContain("Not in this scene");
  });

  test("someone who just left is named (no feelings); someone last seen days ago isn't", () => {
    const s = initialState(r);
    s.scene.jo = { here: false, loc: s.location, at: s.minutes - 60 };
    s.scene.dex = { here: false, loc: s.location, at: s.minutes - 3 * 1440 };
    const line = stateDigest(r, s).split("\n").find((l) => l.startsWith("Not in this scene")) ?? "";
    expect(line).toContain("Jo");
    expect(line).not.toContain("Dex");
    expect(line).not.toContain("Love");
  });
});
