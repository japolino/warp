// Regressions for the engine review of the format-limits work.
import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { applyProposal, availableChoices, odds, resolveTurn, findAction } from "./resolve.js";
import { applyEvent, foldEvents, initialState } from "./state.js";
import { buildChoices, buildHud } from "./view.js";

const load = (y: string) => loadRuleset([{ label: "t", order: 0, content: y }]).ruleset!;
const turn = (r: any, s: any, actionId: string, params?: Record<string, string>) => {
  const rec = resolveTurn(r, s, { actionId, via: "choice", ...(params ? { params } : {}) }, { seed: "x" });
  return { rec, s: foldEvents(r, [rec.events], s) };
};

describe("being broke in a fight never makes the expensive moves free", () => {
  const r = load(`stats:
  hp: { kind: meter, start: 30 }
  sta: { kind: meter, start: 10, max: 10 }
encounters:
  duel:
    foe: { name: F, stats: { hp: { start: 100, max: 100 } } }
    actions:
      jab: { label: Jab, cost: { sta: -5 }, effects: { foe: { hp: -1 } } }
      nuke: { label: Nuke, cost: { sta: -50 }, effects: { foe: { hp: -40 } } }
    end_when: { won: "foe.hp <= 0", beaten: "hp <= 0" }
`);
  test("only the cheapest priced-out move stays open; the nuke stays locked", () => {
    const s = initialState(r);
    applyEvent(s, { t: "enc", id: "duel", foe: { hp: 100 }, src: "manual" } as any, r);
    s.stats.sta = 0;
    expect(availableChoices(r, s).map((c) => c.id)).toEqual(["jab"]);
    expect(turn(r, s, "nuke").rec.events.some((e: any) => e.t === "foe")).toBe(false);
  });
});

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

describe("the story moves between places (no travel gates any more)", () => {
  const r = load(`locations:
  hall: { name: Hall }
  vault: { name: Vault }
start: { location: hall }
`);
  test("a story move to a declared place goes there", () => {
    const s = initialState(r);
    expect(applyProposal(r, s, { move: "Vault" } as any).some((e: any) => e.t === "move" && e.to === "vault")).toBe(true);
  });
});

test("eff() in a check formula doesn't count gear twice", () => {
  const r = load(`stats:
  str: { kind: attribute, start: 10, max: 99 }
items: { belt: { name: Belt, bonus: { str: 5 } } }
start: { items: { belt: 1 } }
actions:
  lift: { label: Lift, check: { chance: "str + eff('str') - str" }, success: { str: +0 } }
`);
  const s = initialState(r);
  expect(odds(r, s, findAction(r, s, "lift")!.a)!.success).toBeCloseTo(0.15, 5);
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
