import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { foldEvents, initialState, makeEnv, type GameState } from "./state.js";
import { applyProposal, resolveTurn, resolveTurnFull } from "./resolve.js";
import { evaluate } from "./expr.js";
import { buildHud, narratorKnowledge, stateDigest } from "./view.js";

const r = loadRuleset([{ label: "t", content: `
name: Crew
clock: { start: "Mon 20:00" }
relationships:
  stats: { love: { start: 10, narrator: 10 } }
  people:
    jo: { name: Jo }
    dex: { name: Dex }
secrets:
  heist: { about: The warehouse job, stages: [ { when: "flag('told')", text: "Dex robbed the warehouse." } ] }
companions:
  jo:
    goal: Buy the café outright
    arc:
      stages: [ { at: 10, surface: "Jo makes an offer on the café." } ]
    daily:
      ask: How does Jo spend her evening?
      options:
        shift: { desc: Works an extra shift, weight: 1, arc: +12 }
        out: { desc: Goes out with Dex, weight: 0, bond: { dex: +10 } }
    jealous_of: [dex]
    bonds: { dex: 30 }
  dex:
    knows: [heist]
actions:
  sleep: { label: Sleep, time: 720 }
  charm_dex: { label: Charm Dex, effects: { rel: { dex: { love: +10 } } } }
`, order: 0 }]).ruleset!;

const act = (s: GameState, id: string, odds?: Record<string, Record<string, number>>) => {
  const res = resolveTurnFull(r, s, { actionId: id, via: "choice" }, { seed: "c", odds });
  return { s: foldEvents(r, [res.record.events], s), rec: res.record, needs: res.needs };
};

describe("companions with lives of their own", () => {
  test("each in-game day they choose for themselves; the choice moves their arc", () => {
    const t = act(initialState(r), "sleep");
    expect(t.needs.some((n) => n.id === "companion_jo_daily")).toBe(true);
    expect(t.rec.hints.join(" ")).toContain("Off-screen, Jo: works an extra shift");
    expect(evaluate("arc('jo')", makeEnv(r, t.s))).toBe(12);
    // The arc crossed a stage, which surfaces (on the next turn — it happened between days).
    expect(t.s.news.map((n) => n.text).join(" ")).toContain("offer on the café");
    // With the model's odds, the other choice can win.
    const out = act(initialState(r), "sleep", { companion_jo_daily: { shift: 0, out: 1 } });
    expect(out.s.bonds.jo.dex).toBe(40);
  });

  test("jealousy: growing close to a rival cools them, toward you and the rival", () => {
    const t = act(initialState(r), "charm_dex");
    expect(t.s.rel.jo.love).toBe(5);
    expect(t.s.bonds.jo.dex).toBe(25);
    expect(t.rec.hints.join(" ")).toContain("Jo notices");
    // Story updates count too.
    const s2 = foldEvents(r, [applyProposal(r, initialState(r), { rel: { Dex: { love: 6 } } })], initialState(r));
    expect(s2.rel.jo.love).toBe(7);
  });

  test("the narrator knows who knows what, and how people feel about each other", () => {
    const s = initialState(r);
    expect(narratorKnowledge(r, s)).toContain("Only Dex knows this");
    expect(stateDigest(r, s)).toContain("Jo is fond of Dex");
    expect(buildHud(r, s).people.find((p) => p.id === "jo")?.goal).toBe("Buy the café outright");
    expect(resolveTurn(r, s, null, { seed: "x" }).events.some((e) => e.t === "clock")).toBe(false);
  });
});
