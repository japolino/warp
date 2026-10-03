// Formulas, conditions, gear and the sidebar: eff()/gear(), formula bonus and per_hour, show:,
// and currency after the amount.

import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { applyEvent, cloneState, initialState, makeEnv, type GameState } from "./state.js";
import { gearFor, resolveTurn, type TurnRecord } from "./resolve.js";
import { evalNumber } from "./expr.js";
import { lintRuleset } from "./lint.js";
import { statAdd } from "./freeform.js";
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
    ring: { name: "Ring", bonus: { str: 2 } },
  },
  conditions: {
    mighty: { label: "Mighty", bonus: { str: "level" } },
  },
  start: { items: { sword: 1, ring: 1 } },
  actions: {
    swing: { label: "Swing", effects: { hp: "-eff('atk')" } },
    lift: { label: "Lift", check: { vs: 10, add: "str / 10" }, success: { hp: +1 } },
  },
  ...extra,
});

describe("eff() and gear()", () => {
  test("eff counts gear and statuses; gear counts carried gear alone; formulas are worked out now", () => {
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

  test("lint names a wrong stat inside eff/gear", () => {
    const { r } = gearRules({ triggers: { t1: { when: "eff('strr') > 3 and gear('atk') > 0", do: { hp: +1 } } } });
    const msgs = lintRuleset(r).map((i) => i.message);
    expect(msgs.some((m) => m.includes("eff('strr')") && m.includes('did you mean "str"'))).toBe(true);
    expect(msgs.some((m) => m.includes("gear('atk')"))).toBe(false);
    expect(msgs.some((m) => m.includes("isn't a known function"))).toBe(false);
  });
});

describe("formula bonus and per_hour", () => {
  test("bad bonus formulas are errors; armor was removed with a warning", () => {
    const { issues } = normalizeRuleset({
      stats: { hp: { kind: "meter" } },
      conditions: { x: { bonus: { hp: "level +" }, armor: { hp: 5 } } },
      items: { y: { armor: 2 } },
    });
    const text = issues.map((i) => `${i.level} ${i.where}: ${i.message}`);
    expect(text.some((t) => t.startsWith("error Conditions › x › bonus › hp"))).toBe(true);
    expect(text.some((t) => t.startsWith("warning Conditions › x › armor") && t.includes("removed"))).toBe(true);
    expect(text.some((t) => t.startsWith("warning Items › y › armor") && t.includes("removed"))).toBe(true);
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
  });
});

describe("lint fixes", () => {
  test("unknown keys in live-choice tags and actions warn; known ones don't", () => {
    const { warns } = load({
      stats: { hp: { kind: "meter" } },
      live_choices: { tags: { hard_hand: { desc: "Violence", bogus_key: 3, effects: { hp: -1 } } } },
      actions: { rest: { label: "Rest", effect: { hp: +1 }, efects: { hp: 2 }, success: { hp: 1 }, check: { vs: 12 } } },
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
    stats: { pennies: { kind: "money", start: 18, ...extra } }, hud: { currency }, conflict: false,
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

describe("gear on a stat at its max (ADVENTURE-2)", () => {
  test("a typed attempt and a contest move count the charm past the max", () => {
    const { r } = load({ style: "adventure", stats: { body: { kind: "attribute", max: 10, start: 10 } }, checks: { bonus: 10 },
      items: { charm: { name: "Lucky Charm", bonus: { body: 3 } } }, start: { items: { charm: 1 } } });
    const s = initialState(r);
    expect(statAdd(r, s, "body")).toBe(13);
    expect(statAdd(r, { ...s, items: {} }, "body")).toBe(10);
    expect(statAdd(r, { ...s, stats: { ...s.stats, body: 8 } }, "body")).toBe(11);
  });
});

describe("a max formula that drops (PRESSURE-2)", () => {
  test("the stat follows its max down when the max's inputs change", () => {
    const { r } = load({ stats: { people: { kind: "meter", max: 1000, start: 10 }, sick: { kind: "meter", start: 0, max: "people" } } });
    let s = initialState(r);
    s = { ...s, stats: { ...s.stats, sick: 8 } };
    const n = cloneState(s);
    applyEvent(n, { t: "stat", id: "people", d: -9, src: "manual" }, r);
    expect(n.stats.people).toBe(1);
    expect(n.stats.sick).toBe(1);
  });
});
