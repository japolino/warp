// Formulas, conditions, gear and the sidebar: eff()/gear()/integrity(), formula armor, bonus and
// per_hour, crit: on checks, perk gains on relationship stats, [round, hour] statuses, show:, currency
// after the amount, and points spent by hand (allocate:).

import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { applyEvent, cloneState, initialState, makeEnv, type GameState } from "./state.js";
import { allocateStats, gearFor, playerArmor, resolveTurn, type TurnRecord } from "./resolve.js";
import { evalNumber } from "./expr.js";
import { lintRuleset } from "./lint.js";
import { auditRuleset } from "./audit.js";
import { buildHud, stateDigest } from "./view.js";
import { renderHud } from "../frontend/render.js";

type R = NonNullable<ReturnType<typeof normalizeRuleset>["ruleset"]>;
const load = (raw: Record<string, unknown>) => {
  const { ruleset, issues } = normalizeRuleset({ clock: { start: "Mon 12:00" }, ...raw });
  if (!ruleset) throw new Error(issues.map((i) => `${i.where}: ${i.message}`).join("\n"));
  return { r: ruleset, issues, warns: issues.map((i) => `${i.where}: ${i.message}`) };
};
const fold = (r: R, s: GameState, rec: TurnRecord) => { const n = cloneState(s); rec.events.forEach((e) => applyEvent(n, e, r)); return n; };
const play = (r: R, s: GameState, actionId: string, seed = "a") => fold(r, s, resolveTurn(r, s, { actionId, via: "choice" }, { seed }));
const num = (r: R, s: GameState, f: string) => evalNumber(f, makeEnv(r, s), NaN);

const gearRules = (extra: Record<string, unknown> = {}) => load({
  stats: {
    hp: { kind: "meter", start: 50, max: 100 },
    str: { kind: "attribute", start: 10, max: 99 },
    atk: { kind: "attribute", start: 0, max: 999, growth: 0 },
    level: { kind: "attribute", start: 3, max: 99, growth: 0 },
  },
  items: {
    sword: { name: "Sword", bonus: { atk: "5 + level * 2", str: 1 } },
    cloak: { name: "Cloak", slot: "outer", integrity: 40 },
    ring: { name: "Ring", bonus: { str: 2 } },
  },
  wardrobe: { slots: ["outer"], cover: [], start: ["cloak"] },
  conditions: {
    mighty: { label: "Mighty", bonus: { str: "level" }, armor: { hp: "level * 2" } },
    shielded: { label: "Shielded", armor: 4 },
  },
  start: { items: { sword: 1, ring: 1 } },
  actions: {
    swing: { label: "Swing", effects: { hp: "-eff('atk')" } },
    lift: { label: "Lift", check: { chance: "str" }, success: { hp: +1 } },
  },
  ...extra,
});

describe("eff(), gear() and integrity()", () => {
  test("eff counts gear, perks and statuses; gear counts carried gear alone; formulas are worked out now", () => {
    const { r, warns } = gearRules();
    expect(warns).toEqual([]);
    const s = initialState(r);
    expect(num(r, s, "gear('atk')")).toBe(11); // 5 + 3 * 2
    expect(num(r, s, "eff('atk')")).toBe(11);
    expect(num(r, s, "eff('str')")).toBe(13); // 10 + sword 1 + ring 2
    expect(num(r, s, "gear('str')")).toBe(3);
    applyEvent(s, { t: "cond", id: "mighty", on: true, until: null, src: "manual" }, r);
    expect(num(r, s, "eff('str')")).toBe(16); // + level from the status
    expect(num(r, s, "gear('str')")).toBe(3); // statuses aren't gear
    applyEvent(s, { t: "stat", id: "level", d: 2, src: "manual" }, r);
    expect(num(r, s, "gear('atk')")).toBe(15);
  });

  test("eff() works in effects (weapon damage) and checks read the same formula bonuses", () => {
    const { r } = gearRules();
    const s = initialState(r);
    const after = play(r, s, "swing");
    expect(after.stats.hp).toBe(50 - 11);
    const lift = r.actions.lift;
    expect(gearFor(r, s, lift).stats.str).toBe(3);
    expect(gearFor(r, s, lift).notes).toContain("Ring: +2 Str");
  });

  test("integrity() reads a piece of clothing by item or slot; 0 when not held", () => {
    const { r } = gearRules();
    const s = initialState(r);
    expect(num(r, s, "integrity('cloak')")).toBe(40);
    expect(num(r, s, "integrity('outer')")).toBe(40);
    applyEvent(s, { t: "dmg", item: "cloak", d: -15, src: "manual" } as never, r);
    expect(num(r, s, "integrity('cloak')")).toBe(25);
    expect(num(r, s, "integrity('sword')")).toBe(100); // not clothing, default integrity
    const t = initialState(r); t.items = {};
    expect(num(r, t, "integrity('cloak')")).toBe(0);
  });

  test("lint names a wrong stat, item or slot inside eff/gear/integrity", () => {
    const { r } = gearRules({ triggers: { t1: { when: "eff('strr') > 3 and gear('atk') > 0 and integrity('cape') < 10", do: { hp: +1 } } } });
    const msgs = lintRuleset(r).map((i) => i.message);
    expect(msgs.some((m) => m.includes("eff('strr')") && m.includes('did you mean "str"'))).toBe(true);
    expect(msgs.some((m) => m.includes("integrity('cape')"))).toBe(true);
    expect(msgs.some((m) => m.includes("gear('atk')"))).toBe(false);
    expect(msgs.some((m) => m.includes("isn't a known function"))).toBe(false);
  });
});

describe("formula armor, bonus and per_hour", () => {
  test("condition and item armor accept formulas, worked out when the blow lands; numbers still work", () => {
    const { r } = gearRules({ items: { plate: { name: "Plate", armor: { hp: "level + 1" } } }, start: { items: { plate: 1 } } });
    const s = initialState(r);
    expect(playerArmor(r, s, "hp")).toBe(4);
    applyEvent(s, { t: "cond", id: "mighty", on: true, until: null, src: "manual" }, r);
    expect(playerArmor(r, s, "hp")).toBe(4 + 6);
    expect(r.conditions.shielded.armor).toEqual({ _: 4 });
  });

  test("bad formulas are errors; percentages in armor warn", () => {
    const { issues } = normalizeRuleset({
      stats: { hp: { kind: "meter" } },
      conditions: { x: { bonus: { hp: "level +" }, armor: { hp: "5%" } } },
      items: { y: { armor: "2 *" } },
    });
    const text = issues.map((i) => `${i.level} ${i.where}: ${i.message}`);
    expect(text.some((t) => t.startsWith("error Conditions › x › bonus › hp"))).toBe(true);
    expect(text.some((t) => t.startsWith("warning Conditions › x › armor › hp"))).toBe(true);
    expect(text.some((t) => t.startsWith("error Items › y › armor"))).toBe(true);
  });

  test("per_hour takes a formula or a share of the maximum", () => {
    const { r, warns } = load({
      stats: {
        hp: { kind: "meter", start: 50, max: 200, per_hour: "+5%" },
        vit: { kind: "attribute", start: 20, growth: 0 },
        mp: { kind: "meter", start: 10, max: 100, per_hour: "vit / 10" },
        hunger: { kind: "meter", start: 0, good: "low", per_hour: 2 },
      },
      actions: { wait: { label: "Wait", time: 120, effects: {} } },
    });
    expect(warns).toEqual([]);
    expect(r.stats.hp.perHourExpr).toBe("+5%");
    expect(r.stats.hunger.perHourExpr).toBeUndefined();
    const s = play(r, initialState(r), "wait");
    expect(s.stats.hp).toBeCloseTo(50 + 2 * 10);
    expect(s.stats.mp).toBeCloseTo(10 + 2 * 2);
    expect(s.stats.hunger).toBeCloseTo(4);
    const audit = auditRuleset(r);
    expect(audit.gaps.some((g) => g.id === "stat-static:mp")).toBe(false);
  });
});

describe("crit: on a check", () => {
  const crit = (c: unknown) => load({
    stats: { luk: { kind: "attribute", start: 40, growth: 0 }, hp: { kind: "meter", start: 50 } },
    actions: { go: { label: "Go", check: { chance: 100, crit: c }, success: { hp: +1 }, crit_success: { hp: +10 } } },
  });
  const tiers = (r: R, n = 40) => Array.from({ length: n }, (_, i) => resolveTurn(r, initialState(r), { actionId: "go", via: "choice" }, { seed: `s${i}` }).check!.tier);

  test("a formula chance replaces the fixed 5% band", () => {
    const { r, warns } = crit("luk + 60"); // 100%
    expect(warns).toEqual([]);
    expect(new Set(tiers(r))).toEqual(new Set(["crit_success"]));
    const none = crit(0).r;
    expect(tiers(none).includes("crit_success")).toBe(false);
  });

  test("without crit: checks behave as before", () => {
    const { r } = load({ stats: { hp: { kind: "meter", start: 50 } }, actions: { go: { label: "Go", check: { chance: 100 }, success: { hp: +1 } } } });
    const t = tiers(r, 200);
    const share = t.filter((x) => x === "crit_success").length / t.length;
    expect(share).toBeGreaterThan(0.01);
    expect(share).toBeLessThan(0.12);
  });

  test("vs checks: crit widens the top band; out-of-range values warn", () => {
    const { r } = load({ stats: { hp: { kind: "meter", start: 50 } }, actions: { go: { label: "Go", check: { vs: 2, crit: "50%" }, success: { hp: +1 } } } });
    const t = tiers(r, 200);
    const share = t.filter((x) => x === "crit_success").length / t.length;
    expect(share).toBeGreaterThan(0.35);
    expect(share).toBeLessThan(0.65);
    expect(crit(150).warns.some((w) => w.includes("crit is a chance in percent"))).toBe(true);
    const off = load({ stats: { hp: { kind: "meter" } }, actions: { go: { label: "Go", check: { chance: 50, crits: false, crit: 20 } } } });
    expect(off.warns.some((w) => w.includes("crits: false"))).toBe(true);
  });
});

describe("perk gains and losses on relationship stats", () => {
  test("a drawback can slow how fast anyone warms to {{user}}", () => {
    const { r, warns } = load({
      stats: { tp: { kind: "attribute", start: 1, growth: 0 } },
      relationships: { stats: { fondness: { start: 0, min: -100, max: 100 } }, people: { maud: { name: "Maud" } } },
      perks: { points: "tp", cold: { name: "Cold", drawback: { desc: "Hard to like", gains: { fondness: "-50%" } } } },
      actions: { charm: { label: "Charm", effects: { rel: { maud: { fondness: +10 } } } } },
    });
    expect(warns).toEqual([]);
    const s = initialState(r);
    s.people.maud = { name: "Maud" };
    expect(play(r, s, "charm").rel.maud.fondness).toBe(10);
    applyEvent(s, { t: "perk", id: "cold", src: "manual" }, r);
    expect(play(r, s, "charm").rel.maud.fondness).toBe(5);
  });

  test("names that are neither still warn", () => {
    const { warns } = load({ stats: { tp: { kind: "attribute" } }, perks: { points: "tp", x: { name: "X", rule: { gains: { nonsense: "10%" } } } } });
    expect(warns.some((w) => w.includes('"nonsense" isn\'t a declared stat or relationship stat'))).toBe(true);
  });
});

describe("statuses that tick each round in a fight and each hour outside", () => {
  const bleed = (extra: Record<string, unknown> = {}) => load({
    stats: { hp: { kind: "meter", start: 100, max: 100 } },
    conditions: { bleeding: { label: "Bleeding", every: ["round", "hour"], dot: 2, stat: "hp", lasts: "3h", ...extra } },
    actions: { wait: { label: "Wait", time: 60, effects: {} }, cut: { label: "Cut", effects: { add_condition: ["bleeding"] } } },
    encounters: {
      fight: {
        name: "Fight", foe: { name: "F", stats: { hp: { start: 50, max: 50 } } },
        actions: { poke: { label: "Poke", effects: { foe: { hp: -1 } } }, cut: { label: "Cut", effects: { add_condition: ["bleeding"] } } },
        end_when: { won: "foe.hp <= 0", beaten: "hp <= 0" },
      },
    },
  });

  test("ticks per round in an encounter, and keeps going (by lasts:) after it", () => {
    const { r, warns } = bleed();
    expect(warns).toEqual([]);
    expect(r.conditions.bleeding.every).toBe("both");
    let s = initialState(r);
    applyEvent(s, { t: "enc", id: "fight", foe: { hp: 50 }, src: "manual" }, r);
    s = play(r, s, "cut");
    expect(s.conditions.bleeding.rounds).toBeUndefined();
    const hp0 = s.stats.hp;
    s = play(r, s, "poke", "p1");
    s = play(r, s, "poke", "p2");
    expect(hp0 - s.stats.hp).toBeCloseTo(4, 0); // 2 a round, not scaled by fight minutes
    applyEvent(s, { t: "enc", id: null, src: "manual" } as never, r);
    expect(s.conditions.bleeding).toBeDefined();
    const before = s.stats.hp;
    s = play(r, s, "wait");
    expect(before - s.stats.hp).toBeCloseTo(2);
  });

  test("rounds: is ignored with a warning; plain hour statuses are unchanged", () => {
    expect(bleed({ rounds: 3 }).warns.some((w) => w.includes("`rounds:` is ignored"))).toBe(true);
    expect(bleed({ every: "sometimes" }).warns.some((w) => w.includes("use round, turn, hour"))).toBe(true);
    expect(bleed({ every: "hour" }).r.conditions.bleeding.every).toBe("hour");
    expect(bleed({ every: "round and hour" }).r.conditions.bleeding.every).toBe("both");
  });
});

describe("lint and audit fixes", () => {
  test("an hourly hurt that an item cures isn't 'never wears off'; one nothing cures still is", () => {
    const base = {
      stats: { health: { kind: "meter", start: 100 } },
      conditions: { festering: { label: "F", every: "hour", dot: 1, stat: "health" } },
    };
    const cured = load({ ...base, items: { salve: { name: "Salve", use: { remove_condition: ["festering"] } } } }).r;
    expect(lintRuleset(cured).some((i) => i.message.includes("never wears off"))).toBe(false);
    const timed = load({ ...base, actions: { fall: { label: "Fall", effects: { add_condition: { festering: 120 } } } } }).r;
    expect(lintRuleset(timed).some((i) => i.message.includes("never wears off"))).toBe(false);
    const stuck = load({ ...base, actions: { fall: { label: "Fall", effects: { add_condition: ["festering"] } } } }).r;
    expect(lintRuleset(stuck).some((i) => i.message.includes("never wears off"))).toBe(true);
  });

  test("armor-only clothing isn't 'clothing with no effect'", () => {
    const { r } = load({
      stats: { hp: { kind: "meter", start: 50 } },
      items: { jerkin: { name: "Jerkin", slot: "armor", armor: { hp: 2 } }, rag: { name: "Rag", slot: "armor" } },
      wardrobe: { slots: ["armor"], cover: [], start: ["jerkin"] },
    });
    const ids = auditRuleset(r).gaps.map((g) => g.id);
    expect(ids).not.toContain("item-flat:jerkin");
    expect(ids).toContain("item-flat:rag");
  });

  test("unknown keys in live-choice tags and actions warn; known ones don't", () => {
    const { warns } = load({
      stats: { hp: { kind: "meter" } },
      live_choices: { tags: { hard_hand: { desc: "Violence", bogus_key: 3, effects: { hp: -1 } } } },
      actions: { rest: { label: "Rest", effect: { hp: +1 }, efects: { hp: 2 }, success: { hp: 1 }, check: { chance: 50 } } },
    });
    expect(warns.some((w) => w.startsWith("Live choices › tags › hard_hand › bogus_key"))).toBe(true);
    expect(warns.some((w) => w.startsWith("Actions › rest › efects") && w.includes('did you mean "effects"'))).toBe(true);
    expect(warns.filter((w) => /› (effect|success|check|label)\b/.test(w) && w.includes("isn't something"))).toEqual([]);
  });
});

describe("show: in the sidebar and for the narrator", () => {
  const shown = (show?: string) => load({
    stats: {
      tier: { kind: "attribute", start: 1, max: 10, growth: 0, ...(show ? { show } : {}), bands: { 0: "Iron", 3: "Bronze" } },
      str: { kind: "attribute", start: 5, max: 999, growth: 0 },
      hp: { kind: "meter", start: 80, max: 120 },
    },
  }).r;

  test("by default the sidebar shows words with the number and the narrator the words; text, number and both are honoured", () => {
    for (const [mode, side, narr] of [
      [undefined, "Iron (1)", "Tier: Iron"],
      ["text", "Iron", "Tier: Iron"],
      ["number", "1", "Tier: 1"],
      ["both", "Iron (1)", "Tier: Iron (1)"],
    ] as const) {
      const r = shown(mode);
      const s = initialState(r);
      const hud = buildHud(r, s);
      const sk = hud.skills.find((x) => x.id === "tier")!;
      expect(sk.text ?? sk.display).toBe(side);
      expect(renderHud(hud, { editing: null, compact: false })).toContain(`>${side}<`);
      expect(stateDigest(r, s)).toContain(narr);
    }
  });

  test("the narrator sees attributes as a value, meters as value/max", () => {
    const r = shown();
    const d = stateDigest(r, initialState(r));
    expect(d).toContain("Str: 5");
    expect(d).not.toContain("5/999");
    expect(d).toContain("80/120");
  });

  test("show: hidden keeps an attribute out of the sidebar", () => {
    const r = shown("hidden");
    expect(buildHud(r, initialState(r)).skills.map((x) => x.id)).not.toContain("tier");
  });
});

describe("currency after the amount", () => {
  const money = (currency: unknown, extra: Record<string, unknown> = {}) => load({
    stats: { pennies: { kind: "money", start: 18, ...extra } }, hud: { currency },
  });

  test("{n}d and { symbol, after } put the sign after; plain signs stay before", () => {
    for (const [c, want] of [["{n}d", "18d"], [{ symbol: "d", after: true }, "18d"], ["£", "£18"], ["£{n}", "£18"], [undefined, "$18"]] as const) {
      const { r, warns } = money(c);
      expect(warns).toEqual([]);
      const s = initialState(r);
      expect(buildHud(r, s).money).toBe(want);
      expect(stateDigest(r, s)).toContain(want);
    }
  });

  test("bad currency settings warn; a banded purse keeps its amount unless show: text", () => {
    expect(money({ sym: "d" }).warns.length).toBeGreaterThan(0);
    expect(money(["d"]).warns.some((w) => w.startsWith("HUD › currency"))).toBe(true);
    const { r } = money("{n}d", { bands: { 0: "Nearly broke.", 50: "Comfortable." } });
    expect(buildHud(r, initialState(r)).money).toBe("Nearly broke. (18d)");
    const words = money("{n}d", { bands: { 0: "Nearly broke." }, show: "text" }).r;
    expect(buildHud(words, initialState(words)).money).toBe("Nearly broke.");
    const both = money("{n}d", { bands: { 0: "Nearly broke." }, show: "both" }).r;
    expect(buildHud(both, initialState(both)).money).toBe("Nearly broke. (18d)");
  });
});

describe("allocate: points spent by hand", () => {
  const alloc = (extra: Record<string, unknown> = {}) => load({
    stats: {
      stat_points: { kind: "attribute", start: 3, max: 99, growth: 0 },
      str: { kind: "attribute", start: 5, max: 7, growth: 0, allocate: { with: "stat_points", step: 1 } },
      dex: { kind: "attribute", start: 5, max: 99, growth: 0, allocate: "stat_points" },
      ...extra,
    },
  });

  test("normalized, shown with +/- in the sidebar, spent all at once", () => {
    const { r, warns } = alloc();
    expect(warns).toEqual([]);
    expect(r.stats.str.allocate).toEqual({ with: "stat_points", step: 1, cost: 1 });
    const s = initialState(r);
    const hud = buildHud(r, s);
    expect(hud.skills.find((x) => x.id === "str")!.allocate).toMatchObject({ pool: "stat_points", left: 3, room: 2 });
    const html = renderHud(hud, { editing: null, compact: false, alloc: { str: 1 } });
    expect(html).toContain('data-alloc-add="dex"');
    expect(html).toContain('data-alloc-sub="str"');
    expect(html).toContain("data-alloc-confirm");
    const ev = allocateStats(r, s, { str: 2, dex: 1 });
    expect(Array.isArray(ev)).toBe(true);
    const after = cloneState(s); (ev as never[]).forEach((e) => applyEvent(after, e, r));
    expect(after.stats).toMatchObject({ stat_points: 0, str: 7, dex: 6 });
    expect(renderHud(buildHud(r, after), { editing: null, compact: false })).not.toContain("data-alloc-add");
  });

  test("refuses what it can't do, as a whole", () => {
    const { r } = alloc();
    const s = initialState(r);
    expect(allocateStats(r, s, { str: 3 })).toContain("can't go above");
    expect(allocateStats(r, s, { dex: 4 })).toContain("Not enough");
    expect(allocateStats(r, s, { stat_points: 1 })).toContain("can't be raised");
    expect(allocateStats(r, s, { dex: -1 })).toContain("whole steps");
    expect(allocateStats(r, s, { dex: 0.5 })).toContain("whole steps");
    expect(allocateStats(r, s, {})).toBe("Nothing to spend.");
  });

  test("bad settings warn", () => {
    expect(alloc({ luk: { kind: "attribute", allocate: { with: "nope" } } }).warns.some((w) => w.includes('"nope" isn\'t a declared stat'))).toBe(true);
    expect(alloc({ luk: { kind: "attribute", allocate: { with: "stat_points", step: -1, colour: 1 } } }).warns.length).toBe(2);
    expect(alloc({ luk: { kind: "attribute", allocate: 5 } }).warns.some((w) => w.includes("expected `{ with: stat_points"))).toBe(true);
  });
});
