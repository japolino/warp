import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { foldEvents, initialState, type GameState } from "./state.js";
import { resolveTurn } from "./resolve.js";
import type { Ruleset } from "./ruleset.js";

const r: Ruleset = loadRuleset([{ label: "t", content: `
name: Duel
stats: { pain: { start: 0, good: low } }
actions:
  pick_fight: { label: Pick a fight, effects: { start_encounter: duel } }
encounters:
  duel:
    name: A duel
    foe: { name: The Captain, stats: { guard: { start: 10, max: 10 } } }
    momentum: { win: won, lose: beaten, start: 0, swing: { success: 50 } }
    actions:
      strike: { label: Strike, check: { chance: 100, crits: false }, success: { foe: { guard: -1 } } }
      stumble: { label: Stumble, check: { chance: 0, crits: false } }
    foe_moves: { press: { desc: "Presses forward", weight: 1, momentum: -10 } }
    outcomes: { won: { hint: "The Captain yields." }, beaten: { pain: +20 } }
`, order: 0 }]).ruleset!;

const turn = (s: GameState, id: string | null, playerText = "") => {
  const rec = resolveTurn(r, s, id ? { actionId: id, via: id === "strike" ? "adjudicator" : "choice" } : null, { seed: "m", playerText });
  return { s: foldEvents(r, [rec.events], s), rec };
};

describe("fights that swing", () => {
  test("checks and foe moves swing momentum; only a full swing ends it", () => {
    let s = turn(initialState(r), "pick_fight").s;
    expect(s.encounter?.momentum).toBe(0);
    let t = turn(s, "strike");
    expect(t.s.encounter?.momentum).toBe(40); // +50, then the Captain presses −10
    expect(t.rec.hints.join("\n")).toContain("This round's beats");
    expect(t.rec.hints.join("\n")).toContain("Presses forward");
    expect(t.rec.hints.join("\n")).toContain("don't finish it early");
    s = t.s;
    t = turn(s, "strike");
    t = turn(t.s, "strike");
    expect(t.s.encounter).toBeNull();
    expect(t.rec.hints.join(" ")).toContain("The Captain yields.");
  });

  test("losing the swing loses the fight", () => {
    let s = turn(initialState(r), "pick_fight").s;
    for (let i = 0; i < 6 && s.encounter; i++) s = turn(s, "stumble").s;
    expect(s.encounter).toBeNull();
    expect(s.stats.pain).toBe(20);
  });

  test("a long described move is kept as written; a short one becomes the opening beat", () => {
    const s = turn(initialState(r), "pick_fight").s;
    expect(turn(s, "strike", "I lunge.").rec.hints.join(" ")).toContain("opening beat");
    expect(turn(s, "strike", "x".repeat(300)).rec.hints.join(" ")).toContain("exactly as {{user}} wrote it");
  });
});
