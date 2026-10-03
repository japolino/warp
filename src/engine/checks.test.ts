// Checks (CORE-DESIGN §2.3): one style, d20 + modifier vs a difficulty. The shown % is the real %, every tier
// gives the narrator a direction, and the old styles are refused.

import { describe, expect, test } from "bun:test";
import { d20Odds, d20Tier, rollD20, seededRng } from "./dice.js";
import { normalizeRuleset, DEFAULT_DIRECTIONS, type Tier } from "./ruleset.js";
import { foldEvents, initialState } from "./state.js";
import { findAction, odds, resolveTurn, type TurnRecord } from "./resolve.js";
import { buildChoices, outcomePacket } from "./view.js";

const load = (raw: Record<string, unknown>) => {
  const { ruleset, issues } = normalizeRuleset({ clock: { start: "Day 1 12:00" }, ...raw });
  if (!ruleset) throw new Error(issues.map((i) => `${i.where}: ${i.message}`).join("\n"));
  return { r: ruleset, issues };
};

/** A seed whose d20 shows this face. */
function seedFor(face: number): string {
  for (let i = 0; i < 2000; i++) if (rollD20(seededRng(`s${i}`)) === face) return `s${i}`;
  throw new Error(`no seed for ${face}`);
}

describe("T-C1 the shown % is the real %", () => {
  test("the enumeration counts faces exactly; natural 20 always succeeds, natural 1 always fails", () => {
    for (let add = -2; add <= 10; add++) for (let dc = 6; dc <= 22; dc++) {
      let ok = 0, part = 0;
      for (let face = 1; face <= 20; face++) {
        const t = d20Tier(face, add, dc, 3);
        if (t === "success" || t === "crit_success") ok++;
        else if (t === "partial") part++;
      }
      const o = d20Odds(add, dc, 3);
      expect(o.success).toBe(ok / 20);
      expect(o.partial).toBe(part / 20);
    }
    expect(d20Odds(100, 12, 3).success).toBe(0.95);
    expect(d20Odds(-100, 12, 3).success).toBe(0.05);
  });

  test("seeded rolls through resolveTurn land on the shown odds (within 0.5 %)", () => {
    const { r } = load({ stats: { body: { kind: "attribute", max: 10, start: 3 } }, actions: { leap: { label: "Leap", check: { vs: "hard", add: "body" }, partial: { body: +0 } } } });
    const s = initialState(r);
    const shown = odds(r, s, r.actions.leap)!;
    expect(shown.success).toBe(0.4); // 13..19 and a natural 20
    let ok = 0, part = 0;
    const N = 40000;
    for (let i = 0; i < N; i++) {
      const tier = resolveTurn(r, s, { actionId: "leap", via: "choice" }, { seed: `t${i}` }).check!.tier;
      if (tier === "success" || tier === "crit_success") ok++;
      else if (tier === "partial") part++;
    }
    expect(Math.abs(ok / N - shown.success)).toBeLessThan(0.005);
    expect(Math.abs(part / N - shown.partial)).toBeLessThan(0.005);
  });

  test("difficulty words, numbers and formulas set the target; a tag without vs: follows the written word", () => {
    const { r } = load({
      stats: { body: { kind: "attribute", max: 10, start: 3 }, mind: { kind: "attribute", max: 10, start: 3 } },
      live_choices: { tags: {
        bold: { desc: "Daring", check: { add: "body", label: "Body" }, success: { body: +0 } },
        clever: { desc: "Clever", check: { add: "mind", label: "Mind" } },
        pinned: { desc: "Pinned", check: { vs: 10, add: "mind" } },
      } },
      checks: { dc: { hard: 15 } },
    });
    const s = initialState(r);
    const live = [
      { label: "Shove past him", tag: "bold", difficulty: "easy" as const },
      { label: "Talk shop", tag: "clever", difficulty: "fair" as const },
      { label: "Vault the bar", tag: "bold", difficulty: "hard" as const },
      { label: "Count the exits", tag: "pinned", difficulty: "extreme" as const },
    ];
    const view = buildChoices(r, s, { lines: [], veils: [], live });
    // Body 3 / Mind 3 (+3): easy 8 → 80 %, fair 12 → 60 %, hard 15 (the ruleset's own) → 45 %; a pinned vs keeps 10.
    expect(view.map((c) => Math.round(c.odds! * 100))).toEqual([80, 60, 45, 70]);
    expect(view.map((c) => c.difficulty)).toEqual(["easy", "fair", "hard", "extreme"]);
    // The click rolls against the same target the button showed.
    const rec = resolveTurn(r, s, { actionId: "live:bold", params: { difficulty: "hard" }, via: "choice", label: "Vault the bar" }, { seed: "x" });
    expect(rec.check).toMatchObject({ target: 15, add: 3, difficulty: "hard" });
    // The older idiom works too: a tag with its own difficulty param and `vs: difficulty` (fair = normal).
    const { r: old } = load({ stats: { body: { kind: "attribute", max: 10, start: 3 } }, live_choices: { tags: {
      bold: { desc: "Daring", params: { difficulty: { easy: 8, normal: 12, hard: 16, extreme: 20 } }, check: { vs: "difficulty", add: "body" } },
    } } });
    const o = buildChoices(old, initialState(old), { lines: [], veils: [], live: [{ label: "a", tag: "bold", difficulty: "fair" }, { label: "b", tag: "bold", difficulty: "hard" }] });
    expect(o.map((c) => c.odds)).toEqual([0.6, 0.4]);
    expect(resolveTurn(old, initialState(old), { actionId: "live:bold", params: { difficulty: "fair" }, via: "choice" }, { seed: "x" }).check?.target).toBe(12);
    // "none" = no roll: only the tag's always-on effects.
    expect(resolveTurn(r, s, { actionId: "live:bold", params: { difficulty: "none" }, via: "choice" }, { seed: "x" }).check).toBeUndefined();
  });
});

describe("T-C3 every tier carries a direction", () => {
  const { r } = load({
    stats: { body: { kind: "attribute", max: 10, start: 3 }, health: { kind: "meter" } },
    actions: {
      plain: { label: "Plain", check: { vs: "fair", add: "body" } },
      hinted: { label: "Hinted", check: { vs: "fair", add: "body" }, fail: { hint: "The rope snaps." }, success: { health: +1 } },
    },
    live_choices: { tags: { bold: { desc: "Daring", check: { add: "body" }, fail: { health: -5 } } } },
    checks: { directions: { crit_fail: "It goes horribly wrong." } },
  });
  const s = initialState(r);
  const faces: Record<Tier, number> = { crit_success: 20, success: 15, partial: 7, fail: 3, crit_fail: 1 };
  const packet = (rec: TurnRecord) => outcomePacket(r, rec, s, foldEvents(r, [rec.events], s), "Sam")!;

  test("authored actions, live tags and typed attempts: partial, fail and crit fail always have a Direction line", () => {
    for (const tier of ["partial", "fail", "crit_fail"] as Tier[]) {
      const seed = seedFor(faces[tier]);
      for (const intent of [{ actionId: "plain" }, { actionId: "hinted" }, { actionId: "live:bold", params: { difficulty: "fair" } }, { actionId: "try:body", params: { difficulty: "fair" } }]) {
        const rec = resolveTurn(r, s, { ...intent, via: "choice" }, { seed });
        expect(rec.check!.tier).toBe(tier);
        expect(packet(rec)).toContain("Direction:");
      }
    }
  });

  test("the default directions, the ruleset's own, and an effect's hint", () => {
    const fail = resolveTurn(r, s, { actionId: "plain", via: "choice" }, { seed: seedFor(3) });
    expect(fail.hints).toContain(DEFAULT_DIRECTIONS.fail);
    expect(resolveTurn(r, s, { actionId: "plain", via: "choice" }, { seed: seedFor(1) }).hints).toContain("It goes horribly wrong.");
    // The author's hint is the direction; no default on top of it.
    const own = resolveTurn(r, s, { actionId: "hinted", via: "choice" }, { seed: seedFor(3) }).hints;
    expect(own).toContain("The rope snaps.");
    expect(own).not.toContain(DEFAULT_DIRECTIONS.fail);
    // A partial that falls back to the success effects still says "not cleanly".
    expect(resolveTurn(r, s, { actionId: "hinted", via: "choice" }, { seed: seedFor(7) }).hints).toContain(DEFAULT_DIRECTIONS.partial);
    // Typed attempts keep {{user}}'s own words.
    expect(resolveTurn(r, s, { actionId: "try:body", params: { difficulty: "hard" }, via: "adjudicator" }, { seed: "y" }).hints.join(" ")).toContain("Keep {{user}}'s own words");
  });

  test("the outcome packet says the check plainly", () => {
    const rec = resolveTurn(r, s, { actionId: "plain", via: "choice" }, { seed: seedFor(15) });
    expect(packet(rec)).toContain("Check: Plain — d20 15 + 3 = 18 vs 12 (fair) → SUCCESS");
  });
});

describe("T-C5 old styles are refused", () => {
  test("chance: and PbtA are warnings (a legacy ruleset still loads), other dice an error; the action runs its effects without a roll", () => {
    const { r, issues } = load({
      stats: { coin: { kind: "money", start: 0 } },
      actions: {
        d100: { label: "Old", check: { chance: 40 }, effects: { coin: +1 }, success: { coin: +10 } },
        pbta: { label: "PbtA", check: { style: "pbta", add: 1 }, effects: { coin: +1 } },
        dice: { label: "2d6", check: { vs: 7, dice: "2d6" }, effects: { coin: +1 } },
        crit: { label: "Crit", check: { vs: 12, crit: 10 } },
      },
    });
    for (const id of ["d100", "pbta"]) {
      const issue = issues.find((i) => i.where === `Actions › ${id} › check`);
      expect(issue?.level).toBe("warning");
      expect(issue?.message).toContain("`legacy` branch");
    }
    expect(issues.filter((i) => i.level === "error").map((i) => i.where)).toEqual(["Actions › dice › check › dice"]);
    expect(issues.find((i) => i.where === "Actions › dice › check › dice")?.level).toBe("error");
    expect(issues.find((i) => i.where === "Actions › crit › check › crit")?.level).toBe("warning");
    expect(r.actions.d100.check).toBeUndefined();
    expect(r.actions.crit.check).toBeDefined();
    const s = initialState(r);
    const rec = resolveTurn(r, s, { actionId: "d100", via: "choice" }, { seed: "x" });
    expect(rec.check).toBeUndefined();
    expect(foldEvents(r, [rec.events], s).stats.coin).toBe(1);
  });

  test("typed attempts lean on attributes and skills only (never levels or points)", () => {
    const { r } = load({ stats: { level: { kind: "attribute", start: 1 }, body: { kind: "attribute", max: 10, start: 3 }, health: { kind: "meter" }, xp: { kind: "skill" } } });
    expect(r.checks.stats).toEqual(["body"]);
    expect(findAction(r, initialState(r), "try:body")!.a.check!.add).toBe(3);
  });
});
