// Regressions for the engine review of the format-limits work.
import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { applyProposal, odds, resolveTurn, findAction } from "./resolve.js";
import { foldEvents, initialState } from "./state.js";
import { buildChoices, buildHud } from "./view.js";

const load = (y: string) => loadRuleset([{ label: "t", order: 0, content: y }]).ruleset!;
const turn = (r: any, s: any, actionId: string, params?: Record<string, string>) => {
  const rec = resolveTurn(r, s, { actionId, via: "choice", ...(params ? { params } : {}) }, { seed: "x" });
  return { rec, s: foldEvents(r, [rec.events], s) };
};

describe("the price follows the chosen params", () => {
  const book = (dflt: string) => load(`stats:
  gold: { kind: money, start: 5 }
  food: { kind: attribute, start: 0, max: 99 }
actions:
  buy:
    label: Buy food
    params: { qty: { ${dflt === "ten" ? "ten: 10, one: 1" : "one: 1, ten: 10"} } }
    cost: { gold: "-5 * qty" }
    effects: { food: "+qty" }
`);
  test("open while any option is affordable, even if the default isn't", () => {
    const r = book("ten");
    const s = initialState(r);
    expect(buildChoices(r, s, { lines: [], veils: [] }).find((c) => c.id === "buy")!.locked).toBeUndefined();
    const out = turn(r, s, "buy", { qty: "one" }).s;
    expect(out.stats.food).toBe(1);
    expect(out.stats.gold).toBe(0);
  });
  test("an option it can't pay for is refused, not underpaid", () => {
    const r = book("one");
    const s = initialState(r);
    const { rec, s: out } = turn(r, s, "buy", { qty: "ten" });
    expect(out.stats.food ?? 0).toBe(0);
    expect(rec.hints.join(" ")).toContain("can't be paid for");
  });
});

describe("the story moves between places (no travel graph)", () => {
  const r = load(`start: { place: Hall }
`);
  test("a story move goes to the place it names, in words", () => {
    const s = initialState(r);
    expect(s.locationName).toBe("Hall");
    expect(applyProposal(r, s, { place: "The Vault" }).some((e: any) => e.t === "move" && e.to === "the_vault" && e.name === "The Vault")).toBe(true);
    // The old alias still works.
    expect(applyProposal(r, s, { move: "Vault" }).some((e: any) => e.t === "move" && e.name === "Vault")).toBe(true);
    // The same place again is no move.
    expect(applyProposal(r, s, { place: "hall" })).toEqual([]);
  });
});

test("eff() in a check formula doesn't count gear twice", () => {
  const r = load(`stats:
  str: { kind: attribute, start: 10, max: 99 }
items: { belt: { name: Belt, bonus: { str: 5 } } }
start: { items: { belt: 1 } }
actions:
  lift: { label: Lift, check: { vs: 20, add: "(str + eff('str') - str) / 5" }, success: { str: +0 } }
`);
  const s = initialState(r);
  // eff('str') = 15 (10 + the belt), read once: add = 3 → succeeds on 17+ (4 faces of 20).
  expect(odds(r, s, findAction(r, s, "lift")!.a)!.success).toBeCloseTo(0.2, 5);
});

test("a meter with a max formula and no start keeps its old start; start: full fills it", () => {
  const r = load(`stats:
  level: { kind: attribute, start: 10, max: 100 }
  hp: { kind: meter, max: "50 + level * 10" }
  mp: { kind: meter, max: "50 + level * 10", start: full }
`);
  const s = initialState(r);
  expect(s.stats.hp ?? r.stats.hp.start).toBe(100);
  expect(s.stats.mp).toBe(150);
});

test("banded skills and money keep their numbers in the sidebar unless show: says otherwise", () => {
  const r = load(`stats:
  money: { kind: money, start: 40, bands: { 0: Broke, 30: Enough } }
  craft: { kind: skill, start: 20, max: 100, bands: { 0: Novice, 15: Journeyman } }
  rank: { kind: attribute, start: 1, max: 5, bands: { 0: Iron }, show: text }
hud: { money: money }
`);
  const h = buildHud(r, initialState(r));
  expect(h.money).toContain("40");
  expect(h.skills.find((x) => x.id === "craft")!.text).toBe("Journeyman (20)");
  expect(h.skills.find((x) => x.id === "rank")!.text).toBe("Iron");
});

test("uses: on an action warns instead of silently doing nothing", () => {
  const x = loadRuleset([{ label: "t", order: 0, content: `stats: { hp: { kind: meter } }
actions: { rest: { label: Rest, uses: 1, effects: { hp: +1 } } }` }]);
  expect(x.issues.some((i) => /uses/.test(i.message))).toBe(true);
});
