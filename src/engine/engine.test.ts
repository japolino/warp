import { describe, expect, test } from "bun:test";
import { compile, evalNumber, evalBool, type ExprEnv } from "./expr.js";
import { parseDice, rollDice, seededRng } from "./dice.js";
import { loadRuleset } from "./loader.js";
import { lintRuleset } from "./lint.js";
import { normalizeRuleset } from "./ruleset.js";
import { applyProposal, odds, resolveTurn } from "./resolve.js";
import { foldEvents, initialState } from "./state.js";
import { buildChoices, buildHud, outcomePacket, stateDigest } from "./view.js";
import { TEMPLATES } from "./templates/index.js";

const env = (vars: Record<string, number | string | boolean>): ExprEnv => ({
  lookup: (p) => vars[p.join(".")],
  call: (n, a) => (n === "has" ? a[0] === "lockpick" : undefined),
});

describe("expressions", () => {
  test("arithmetic, precedence, comparisons, logic", () => {
    expect(evalNumber("20 + skulduggery / 12 - 3", env({ skulduggery: 120 }))).toBe(27);
    expect(evalBool("has('lockpick') and hour >= 20", env({ hour: 21 }))).toBe(true);
    expect(evalBool("not has('rope') or hour < 5", env({ hour: 12 }))).toBe(true);
    expect(evalNumber("stress > 8000 ? 2 : 0", env({ stress: 9000 }))).toBe(2);
    expect(evalNumber("clamp(150, 0, 100)", env({}))).toBe(100);
    expect(evalNumber("-x * 2", env({ x: 3 }))).toBe(-6);
  });
  test("friendly errors", () => {
    expect(() => compile("1 +")).toThrow(/ended too early/);
    expect(() => compile("a $ b")).toThrow(/Unexpected "\$"/);
  });
});

describe("dice", () => {
  test("parses notation", () => {
    expect(parseDice("4d6kh3").groups[0]).toMatchObject({ count: 4, sides: 6, keep: { mode: "kh", n: 3 } });
    expect(parseDice("d%").groups[0].sides).toBe(100);
    expect(parseDice("2d6+1d4-1").flat).toBe(-1);
    expect(() => parseDice("2d6 banana")).toThrow();
  });
  test("seeded rolls are reproducible and in range", () => {
    const a = rollDice("3d6", seededRng("x"));
    const b = rollDice("3d6", seededRng("x"));
    expect(a.total).toBe(b.total);
    for (let i = 0; i < 500; i++) {
      const r = rollDice("d20", seededRng(`s${i}`));
      expect(r.total).toBeGreaterThanOrEqual(1);
      expect(r.total).toBeLessThanOrEqual(20);
      expect(r.natural).toBe(r.total);
    }
    const kh = rollDice("4d6kh3", seededRng("k"));
    expect(kh.dice.filter((d) => d.kept).length).toBe(3);
  });
});

describe("templates", () => {
  for (const t of TEMPLATES) {
    test(`${t.id} loads with no issues and lints clean`, () => {
      const { ruleset, issues } = loadRuleset(t.parts.map((p, i) => ({ label: `warp-ruleset · ${p.label}`, content: p.yaml, order: i })));
      expect(issues).toEqual([]);
      expect(ruleset).not.toBeNull();
      expect(lintRuleset(ruleset!)).toEqual([]);
      const s = initialState(ruleset!);
      const hud = buildHud(ruleset!, s);
      // Every template shows bars, except one with no stats on purpose (Romance: just feelings).
      expect(hud.bars.length > 0 || ruleset!.statOrder.length === 0).toBe(true);
      expect(buildChoices(ruleset!, s, { lines: [], veils: [] }).length).toBeGreaterThan(0);
      expect(stateDigest(ruleset!, s).length).toBeGreaterThan(20);
    });
  }
});

const hometown = () => loadRuleset(TEMPLATES.find((t) => t.id === "hometown")!.parts.map((p, i) => ({ label: p.label, content: p.yaml, order: i }))).ruleset!;

describe("turn resolution", () => {
  test("a check resolves deterministically from its seed and applies costs, outcomes and time", () => {
    const r = hometown();
    let s = initialState(r);
    s = foldEvents(r, [resolveTurn(r, s, { actionId: "go:high_street", via: "choice" }, { seed: "a" }).events], s);
    expect(s.location).toBe("high_street");
    const rec1 = resolveTurn(r, s, { actionId: "cafe_shift", via: "choice" }, { seed: "seed-1" });
    const rec2 = resolveTurn(r, s, { actionId: "cafe_shift", via: "choice" }, { seed: "seed-1" });
    expect(rec1.check!.roll).toBe(rec2.check!.roll);
    const after = foldEvents(r, [rec1.events], s);
    expect(after.minutes - s.minutes).toBe(240);
    expect(after.stats.money).toBeGreaterThan(s.stats.money);
    expect(after.stats.fatigue).toBeGreaterThan(s.stats.fatigue);
    expect(outcomePacket(r, rec1, s, after, "Sam")).toContain("Sam chose: Work a café shift");
  });

  test("casual swipes: different seeds can give different results", () => {
    const r = hometown();
    const s = foldEvents(r, [resolveTurn(r, initialState(r), { actionId: "go:high_street", via: "choice" }, { seed: "a" }).events]);
    const tiers = new Set<string>();
    for (let i = 0; i < 40; i++) tiers.add(resolveTurn(r, s, { actionId: "pickpocket", via: "choice" }, { seed: `swipe-${i}` }).check!.tier);
    expect(tiers.size).toBeGreaterThan(1);
  });

  test("odds match the chance formula for d100 roll-under", () => {
    const r = hometown();
    const s = initialState(r);
    s.location = "high_street";
    const o = odds(r, s, r.actions.cafe_shift)!;
    expect(o.success).toBeCloseTo(Math.round(55 + 5 / 1.5) / 100, 2);
  });

  test("triggers fire on the rising edge only", () => {
    const r = hometown();
    const s = initialState(r);
    s.stats.stress = 99;
    s.location = "apartment";
    const rec = resolveTurn(r, s, { actionId: "shower", via: "choice" }, { seed: "x" });
    // shower lowers stress, so no breakdown
    expect(rec.events.some((e) => e.t === "trig" && e.id === "breakdown")).toBe(false);
    s.stats.stress = 100;
    const rec2 = resolveTurn(r, s, null, { seed: "y" });
    expect(rec2.events.some((e) => e.t === "trig" && e.id === "breakdown" && e.v)).toBe(true);
    const after = foldEvents(r, [rec2.events], s);
    expect(after.stats.stress).toBe(60);
    expect(after.conditions.shaken).toBeDefined();
    const rec3 = resolveTurn(r, after, null, { seed: "z" });
    expect(rec3.events.some((e) => e.t === "trig" && e.id === "breakdown" && e.v)).toBe(false);
  });

  test("veiled tags are flagged; lined tags disappear from choices", () => {
    const r = hometown();
    const s = initialState(r);
    s.location = "high_street";
    expect(buildChoices(r, s, { lines: ["crime"], veils: [] }).some((c) => c.id === "pickpocket")).toBe(false);
    expect(buildChoices(r, s, { lines: [], veils: ["crime"] }).find((c) => c.id === "pickpocket")?.veiled).toBe(true);
    expect(resolveTurn(r, s, { actionId: "pickpocket", via: "choice" }, { seed: "v", veils: ["crime"] }).veiled).toBe(true);
  });
});

describe("narrator proposals are bounded", () => {
  test("clamps stat changes, ignores engine-only stats, adds people and items", () => {
    const r = hometown();
    const s = initialState(r);
    const ev = applyProposal(r, s, {
      stats: { stress: 99999, skulduggery: 500, pain: -5 },
      people: [{ name: "Robin" }],
      rel: { Robin: { trust: 50, love: 2 } },
      items: { "Bus ticket": 1, phone: -1 },
      minutes: 99999,
    });
    const after = foldEvents(r, [ev], s);
    expect(after.stats.stress).toBeLessThanOrEqual(s.stats.stress + 15 + 1);
    expect(after.stats.skulduggery).toBe(s.stats.skulduggery);
    expect(after.people.robin.name).toBe("Robin");
    expect(after.rel.robin.trust).toBe(10 + 5);
    expect(after.items.bus_ticket).toBe(1);
    expect(after.items.phone).toBeUndefined();
    expect(after.minutes - s.minutes).toBe(240);
  });
});

describe("normalizer", () => {
  test("keeps going past broken sections with readable messages", () => {
    const { ruleset, issues } = normalizeRuleset({
      stats: { hp: { max: "banana" }, focus: { kind: "sparkly" } },
      actions: { bad: { check: { vs: "1 +" } }, ok: { label: "Fine" } },
    });
    expect(ruleset).not.toBeNull();
    expect(ruleset!.actions.ok).toBeDefined();
    expect(issues.map((i) => i.message).join("\n")).toMatch(/banana|sparkly|ended too early/);
  });

  test("lint suggests close names", () => {
    const { ruleset } = normalizeRuleset({ stats: { athletics: {} }, actions: { run: { check: { chance: "athletcis / 10" } } } });
    expect(lintRuleset(ruleset!)[0].message).toContain('did you mean "athletics"');
  });

  test("refuses minors alongside sexual actions", () => {
    const { ruleset, issues } = normalizeRuleset({
      relationships: { people: { kid: { name: "Kid", age: 15 } } },
      actions: { flirt: { tags: ["sexual"] } },
    });
    expect(ruleset).toBeNull();
    expect(issues[0].level).toBe("error");
  });
});

describe("choices turned off", () => {
  test("no buttons under the story", () => {
    const r = hometown();
    const s = initialState(r);
    expect(buildChoices(r, s, { lines: [], veils: [] }).length).toBeGreaterThan(0);
    expect(buildChoices(r, s, { lines: [], veils: [], showChoices: false })).toEqual([]);
  });
});
