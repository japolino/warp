// Costs and resources: every cost path reads the same value grammar as effects ("-15%" of the current max),
// meters whose max is a formula can start full, unaffordable action costs lock the choice everywhere,
// and actions that roll can still have effects that always apply.

import { describe, expect, test } from "bun:test";
import { normalizeRuleset, type Issue } from "./ruleset.js";
import { applyEvent, cloneState, initialState, type GameState } from "./state.js";
import { availableChoices, findAction, isAvailable, lockReason, resolveTurn, usableItems, type TurnRecord } from "./resolve.js";
import { buildChoices } from "./view.js";
import { lintRuleset } from "./lint.js";

const load = (raw: Record<string, unknown>) => {
  const { ruleset, issues } = normalizeRuleset({ name: "Costs", ...raw });
  if (!ruleset) throw new Error(issues.map((i) => `${i.where}: ${i.message}`).join("\n"));
  return { r: ruleset, issues };
};
type R = ReturnType<typeof load>["r"];
const fold = (r: R, s: GameState, rec: TurnRecord) => { const n = cloneState(s); rec.events.forEach((e) => applyEvent(n, e, r)); return n; };
const turn = (r: R, s: GameState, actionId: string, params?: Record<string, string>, seed = "c") => {
  const rec = resolveTurn(r, s, { actionId, via: "choice", ...(params ? { params } : {}) }, { seed });
  return { rec, s: fold(r, s, rec) };
};
const choices = (r: R, s: GameState) => buildChoices(r, s, { lines: [], veils: [] });
const warned = (issues: Issue[], where: RegExp) => issues.filter((i) => where.test(i.where));

describe("percentage costs (`cost: { hp: \"-15%\" }`)", () => {
  const book = () => load({
    stats: { hp: { kind: "meter", label: "HP", start: 50, max: 200 }, mp: { kind: "meter", start: 50 } },
    actions: { rest: { label: "Rest", effects: { hp: +5 } }, bleed: { label: "Bleed for it", cost: { hp: "-10%" }, effects: { mp: +1 } }, rage: { label: "Rage", cost: { hp: "-15%" }, effects: { mp: +5 } } },
  }).r;

  test("the choices work it out as a share of the current max", () => {
    const r = book();
    const s = initialState(r);
    expect(isAvailable(r, s, r.actions.rage)).toBe(true);
    expect(choices(r, s).some((c) => c.id === "rage")).toBe(true);
    s.stats.hp = 29;
    expect(lockReason(r, s, r.actions.rage)).toBe("Needs 30 HP");
  });

  test("using it charges the same amount the choice showed", () => {
    const r = book();
    const used = turn(r, initialState(r), "rage").s;
    expect(used.stats.hp).toBe(20);
    expect(used.stats.mp).toBe(55);
    const s = initialState(r);
    s.stats.hp = 19;
    expect(isAvailable(r, s, r.actions.bleed)).toBe(false);
    expect(lockReason(r, s, r.actions.bleed)).toBe("Needs 20 HP");
  });

  test("the checker catches a cost that can't be worked out instead of reporting clean", () => {
    const { r } = load({
      stats: { hp: { kind: "meter", start: 50 } },
      actions: { rest: { label: "Rest", effects: { hp: +5 } }, odd: { label: "Odd", cost: { hp: "min()" }, effects: { hp: +1 } }, fine: { label: "Fine", cost: { hp: "-15%" }, effects: { hp: +1 } } },
    });
    const lint = lintRuleset(r);
    expect(warned(lint, /Actions › odd › cost › hp/)).toHaveLength(1);
    expect(warned(lint, /Actions › fine/)).toHaveLength(0);
  });
});

describe("meter starts against a formula max (bug: start clamped to 100)", () => {
  test("a number above 100 survives; `full` and percentages follow the evaluated max", () => {
    const { r, issues } = load({
      stats: {
        str: { kind: "attribute", start: 5, max: 99 },
        hp: { kind: "meter", max: "100 + str * 10", start: 150 },
        mp: { kind: "meter", max: "50 + str * 10", start: "full" },
        sp: { kind: "meter", max: "100 + str * 20", start: "50%" },
        fp: { kind: "meter", max: "100 + str * 10", start: "str * 4" },
        ep: { kind: "meter", max: "100 + str * 10" },
        cap: { kind: "meter", max: "10 + str", start: 50 },
        plain: { kind: "meter", max: 40, start: "full" },
      },
      actions: { rest: { label: "Rest", effects: { hp: +1 } } },
    });
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    const s = initialState(r);
    expect(s.stats.hp).toBe(150);
    expect(s.stats.mp).toBe(100);
    expect(s.stats.sp).toBe(100);
    expect(s.stats.fp).toBe(20);
    expect(s.stats.ep).toBe(100); // no start: keeps its long-standing start (100) so existing chats replay the same
    expect(s.stats.cap).toBe(15); // clamped to the max it really has
    expect(s.stats.plain).toBe(40);
  });

  test("bad starts warn and the checker reads start formulas", () => {
    const { r, issues } = load({ stats: { hp: { kind: "meter", max: "100", start: "150%" }, mp: { kind: "meter", max: "10 + lvl", start: "lvel * 2" }, lvl: { kind: "attribute", start: 1 } } });
    expect(warned(issues, /hp › start/)).toHaveLength(1);
    expect(warned(lintRuleset(r), /Stats › mp › start/)[0].message).toMatch(/lvl/);
  });
});

describe("action costs gate (bug: an unaffordable cost could be repeated forever)", () => {
  const book = () => load({
    stats: { mp: { kind: "meter", label: "Mana", start: 50 }, hp: { kind: "meter", start: 50 }, stress: { kind: "meter", start: 0, good: "low" }, heat: { kind: "meter", start: 0, good: "low" } },
    actions: {
      free: { label: "Free", cost: { mp: -80 }, effects: { hp: +1 } },
      calm: { label: "Calm down", cost: { stress: -10 }, effects: { hp: +1 } },
      risky: { label: "Risky", cost: { heat: +5 }, effects: { hp: +1 } },
    },
    items: { tonic: { name: "Tonic", use: { cost: { mp: -60 }, effects: { hp: +5 } } } },
    start: { items: { tonic: 1 } },
  }).r;

  test("display, click and execution agree: locked, with why, and nothing happens", () => {
    const r = book();
    const s = initialState(r);
    expect(availableChoices(r, s).map((c) => c.id)).not.toContain("free");
    const shown = choices(r, s).find((c) => c.id === "free")!;
    expect(shown.locked).toBe("Needs 80 Mana");
    expect(findAction(r, s, "free")).toBeNull();
    const rec = turn(r, s, "free").rec;
    expect(rec.events.some((e) => e.t === "stat")).toBe(false);
    expect(usableItems(r, s).find((u) => u.id === "item:tonic")!.locked).toBe("Needs 60 Mana");
    expect(findAction(r, s, "item:tonic")).toBeNull();
  });

  test("drops on a stat that's better low are relief, and positive costs are prices that never gate", () => {
    const r = book();
    const s = initialState(r);
    expect(isAvailable(r, s, r.actions.calm)).toBe(true);
    s.stats.heat = 100;
    expect(isAvailable(r, s, r.actions.risky)).toBe(true);
    expect(choices(r, s).find((c) => c.id === "risky")!.locked).toBeUndefined();
  });

});

describe("use limits were removed", () => {
  test("per_day and per_encounter on an action warn and are ignored", () => {
    const { r, issues } = load({ stats: { hp: { kind: "meter", start: 30 } }, actions: { rest: { label: "Rest", per_day: 1, per_encounter: 2, effects: { hp: +1 } } } });
    expect(warned(issues, /Actions › rest › per_day/)).toHaveLength(1);
    expect(warned(issues, /Actions › rest › per_encounter/)).toHaveLength(1);
    let s = initialState(r);
    for (let i = 0; i < 3; i++) s = turn(r, s, "rest").s;
    expect(s.stats.hp).toBe(33);
  });
});

describe("effects next to a check always apply", () => {
  test("an action with a check keeps its explicit effects whatever the roll, plus the tier's own", () => {
    const { r, issues } = load({
      stats: { nerve: { kind: "meter", start: 50 }, suspicion: { kind: "meter", start: 0, good: "low" }, coin: { kind: "money", start: 0 } },
      actions: {
        pick: { label: "Pick a pocket", check: { vs: 30 }, effects: { suspicion: +3 }, success: { coin: +5 }, fail: { nerve: -2 } },
        lift: { label: "Lift", check: { vs: -10 }, cost: { nerve: -5, suspicion: +3 }, success: { coin: +5 } },
      },
    });
    expect(issues.filter((i) => /pick|lift/.test(i.where))).toEqual([]);
    // A seed that doesn't come up 20 (a natural 20 always succeeds; a natural 1 always fails).
    const seed = Array.from({ length: 50 }, (_, i) => `c${i}`).find((x) => { const t = turn(r, initialState(r), "pick", undefined, x).rec.check!.tier; return t === "fail"; })!;
    const fail = turn(r, initialState(r), "pick", undefined, seed).s;
    expect([fail.stats.suspicion, fail.stats.nerve, fail.stats.coin]).toEqual([3, 48, 0]);
    const seed2 = Array.from({ length: 50 }, (_, i) => `c${i}`).find((x) => turn(r, initialState(r), "lift", undefined, x).rec.check!.tier === "success")!;
    const ok = turn(r, initialState(r), "lift", undefined, seed2).s;
    expect([ok.stats.suspicion, ok.stats.nerve, ok.stats.coin]).toEqual([3, 45, 5]);
  });
});
