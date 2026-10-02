// Costs and resources: every cost path reads the same value grammar as effects ("-15%" of the current max),
// meters whose max is a formula can start full, unaffordable action costs lock the choice everywhere,
// resist costs move a stat in its bad direction, encounter moves can be limited per encounter or per day,
// and abilities that roll can still have effects that always apply.

import { describe, expect, test } from "bun:test";
import { normalizeRuleset, type Issue } from "./ruleset.js";
import { applyEvent, cloneState, initialState, type GameState } from "./state.js";
import { abilityStatus, availableChoices, findAction, isAvailable, lockReason, resolveTurn, usableItems, type TurnRecord } from "./resolve.js";
import { buildChoices, buildHud } from "./view.js";
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
const choices = (r: R, s: GameState) => buildChoices(r, s, { lines: [], veils: [], minigames: "off" });
const warned = (issues: Issue[], where: RegExp) => issues.filter((i) => where.test(i.where));

describe("percentage costs (bug: abilities crashed on `cost: { hp: \"-15%\" }`)", () => {
  const book = () => load({
    stats: { hp: { kind: "meter", label: "HP", start: 50, max: 200 }, mp: { kind: "meter", start: 50 } },
    actions: { rest: { label: "Rest", effects: { hp: +5 } }, bleed: { label: "Bleed for it", cost: { hp: "-10%" }, effects: { mp: +1 } } },
    abilities: { rage: { name: "Rage", cost: { hp: "-15%" }, mp: +5 } },
  }).r;

  test("the ability's status, sidebar and choices work it out as a share of the current max", () => {
    const r = book();
    const s = initialState(r);
    expect(abilityStatus(r, s, "rage").locked).toBeNull();
    expect(buildHud(r, s).abilities[0].cost).toBe("30 HP");
    expect(choices(r, s).some((c) => c.id === "ability:rage")).toBe(true);
    s.stats.hp = 29;
    expect(abilityStatus(r, s, "rage").locked).toBe("Needs 30 HP");
  });

  test("using it charges the same amount the choice showed; actions take percentage costs too", () => {
    const r = book();
    const used = turn(r, initialState(r), "ability:rage").s;
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
      actions: { rest: { label: "Rest", effects: { hp: +5 } } },
      abilities: { odd: { name: "Odd", known: false, cost: { hp: "min()" }, hp: +1 }, fine: { name: "Fine", known: false, cost: { hp: "-15%" }, hp: +1 } },
    });
    const lint = lintRuleset(r);
    expect(warned(lint, /Abilities › odd › cost › hp/)).toHaveLength(1);
    expect(warned(lint, /Abilities › fine/)).toHaveLength(0);
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

  test("in a fight with every move priced out, only the cheapest stay open and take what's left", () => {
    const { r } = load({
      stats: { hp: { kind: "meter", start: 30 }, stamina: { kind: "meter", start: 5 } },
      encounters: { wight: { name: "Wight", foe: { name: "W", stats: { hp: { start: 20, max: 20 } } },
        actions: { strike: { label: "Strike", cost: { stamina: -8 }, effects: { foe: { hp: -5 } } }, flee: { label: "Flee", cost: { stamina: -15 }, effects: { end: "escaped" } }, shove: { label: "Shove", cost: { stamina: -3 }, effects: { foe: { hp: -1 } } } },
        end_when: { won: "foe.hp <= 0", beaten: "hp <= 0" } } },
    });
    const s = initialState(r);
    applyEvent(s, { t: "enc", id: "wight", foe: { hp: 20 }, src: "manual" }, r);
    const open = choices(r, s);
    expect(open.find((c) => c.id === "shove")!.locked).toBeUndefined();
    expect(open.find((c) => c.id === "strike")!.locked).toBe("Needs 8 Stamina");
    s.stats.stamina = 2;
    // Being broke never makes the expensive moves free: only the cheapest priced-out move stays open.
    expect(availableChoices(r, s).map((c) => c.id).sort()).toEqual(["shove"]);
    expect(choices(r, s).find((c) => c.id === "strike")!.locked).toBe("Needs 8 Stamina");
    expect(turn(r, s, "strike").rec.events.some((e) => e.t === "foe")).toBe(false);
    const after = turn(r, s, "shove").s;
    expect(after.stats.stamina).toBe(0);
    expect(after.encounter!.foe.hp).toBe(19);
  });
});

describe("resist_cost in the stat's bad direction", () => {
  const book = (resist: unknown, start = 10) => load({
    stats: { dread: { kind: "meter", start, good: "low" }, control: { kind: "meter", start: 20 }, bruises: { kind: "attribute", start: 0 } },
    actions: { punch: { label: "Punch", tags: ["violence"], check: { chance: 100 }, success: { bruises: +1 }, fail: { bruises: +5 } } },
    mind: { overrides: { freeze: { on: ["violence"], do: "fail", cause: "Panic", resist_cost: resist } } },
  });

  test("a plain amount on a good-low meter raises it; affordability is against the max", () => {
    const { r, issues } = book({ dread: 8 });
    expect(warned(issues, /resist_cost/)).toEqual([]);
    const rec = turn(r, initialState(r), "punch", { mind_resist: "freeze" });
    expect(rec.rec.mind?.kind).toBe("alter");
    expect(rec.s.stats.dread).toBe(18);
    expect(rec.rec.hints.join(" ")).toContain("Resistance costs +8 Dread");
    const full = book({ dread: 8 }, 95).r;
    expect(turn(full, initialState(full), "punch", { mind_resist: "freeze" }).rec.mind?.kind).toBe("fail");
    expect(choices(full, initialState(full)).find((c) => c.id === "punch")!.desc).toContain("Not enough resources to resist.");
  });

  test("quoted signs are explicit; costs that would help or name non-meters are refused with a warning", () => {
    expect(book({ dread: "+8", control: "-5" }).r.mind.overrides[0].resistCost).toEqual({ dread: 8, control: -5 });
    expect(book({ control: 10 }).r.mind.overrides[0].resistCost).toEqual({ control: -10 });
    for (const bad of [{ dread: "-8" }, { control: "+5" }, { control: -1 }, { bruises: 3 }, { nope: 3 }, {}]) {
      const { r, issues } = book(bad);
      expect(r.mind.overrides[0].resistCost).toBeUndefined();
      expect(warned(issues, /resist_cost/)).toHaveLength(1);
    }
  });
});

describe("per_encounter / per_day on encounter moves", () => {
  const book = () => load({
    clock: { start: "Mon 12:00" },
    stats: { hp: { kind: "meter", start: 30 } },
    actions: { rest: { label: "Rest", per_day: 1, effects: { hp: +1 } } },
    encounters: { vault: { name: "Vault", foe: { name: "Guard", stats: { hp: { start: 20, max: 20 } } },
      actions: {
        snatch: { label: "Snatch the reliquary", per_encounter: 1, effects: { foe: { hp: -1 } } },
        signal: { label: "Signal", per_day: 2, effects: { foe: { hp: -1 } } },
        wait: { label: "Wait", per_encounter: "lots", effects: {} },
      },
      end_when: { won: "foe.hp <= 0", beaten: "hp <= 0" } } },
  });
  const fight = (r: R, s = initialState(r)) => { applyEvent(s, { t: "enc", id: "vault", foe: { hp: 20 }, src: "manual" }, r); return s; };

  test("bad values and use limits outside encounters warn", () => {
    const { issues } = book();
    expect(warned(issues, /wait › per_encounter/)).toHaveLength(1);
    expect(warned(issues, /Actions › rest › per_day/)).toHaveLength(1);
  });

  test("a once-per-encounter move locks after use, with why, and comes back next encounter", () => {
    const { r } = book();
    const s1 = turn(r, fight(r), "snatch").s;
    expect(s1.encounter!.foe.hp).toBe(19);
    expect(choices(r, s1).find((c) => c.id === "snatch")!.locked).toBe("Used up for this encounter");
    expect(findAction(r, s1, "snatch")).toBeNull();
    expect(turn(r, s1, "snatch").s.encounter!.foe.hp).toBe(19);
    const later = cloneState(s1);
    later.encounter = null;
    later.minutes += 30;
    expect(findAction(r, fight(r, later), "snatch")).not.toBeNull();
  });

  test("per_day counts across encounters until the day turns", () => {
    const { r } = book();
    let s = turn(r, fight(r), "signal").s;
    s = turn(r, s, "signal").s;
    expect(lockReason(r, s, r.encounters.vault.actions.signal)).toBe("Used up for today");
    const next = cloneState(s);
    next.encounter = null;
    next.minutes += 5;
    expect(findAction(r, fight(r, next), "signal")).toBeNull();
    next.minutes += 1440;
    expect(findAction(r, fight(r, next), "signal")).not.toBeNull();
  });
});

describe("effects next to a check always apply", () => {
  test("an ability with a check keeps its explicit effects whatever the roll, plus the tier's own", () => {
    const { r, issues } = load({
      stats: { nerve: { kind: "meter", start: 50 }, suspicion: { kind: "meter", start: 0, good: "low" }, coin: { kind: "money", start: 0 } },
      abilities: {
        pick: { name: "Pick a pocket", check: { chance: 0 }, effects: { suspicion: +3 }, success: { coin: +5 }, fail: { nerve: -2 } },
        lift: { name: "Lift", check: { chance: 100 }, cost: { nerve: -5, suspicion: +3 }, success: { coin: +5 } },
      },
    });
    expect(issues.filter((i) => /pick|lift/.test(i.where))).toEqual([]);
    const fail = turn(r, initialState(r), "ability:pick").s;
    expect([fail.stats.suspicion, fail.stats.nerve, fail.stats.coin]).toEqual([3, 48, 0]);
    const ok = turn(r, initialState(r), "ability:lift").s;
    expect([ok.stats.suspicion, ok.stats.nerve, ok.stats.coin]).toEqual([3, 45, 5]);
    expect(buildHud(r, initialState(r)).abilities.find((a) => a.id === "lift")!.cost).toBe("5 Nerve, +3 Suspicion");
  });
});
