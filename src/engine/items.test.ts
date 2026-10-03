// Items that do things: uses, gear, the Use button, and items the story uses.

import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { applyEvent, cloneState, initialState, type GameState } from "./state.js";
import { applyProposal, odds, resolveTurn, type TurnRecord } from "./resolve.js";
import { buildChoices, buildHud, itemRelevance } from "./view.js";

const rules = (extra: Record<string, unknown> = {}) => normalizeRuleset({
  clock: { start: "Mon 12:00" },
  stats: {
    stress: { kind: "meter", start: 10, good: "low" },
    visibility: { kind: "meter", start: 60, good: "low" },
    persuasion: { kind: "skill", max: 100, start: 20 },
    athletics: { kind: "skill", max: 100, start: 15 },
  },
  conditions: { scented: { label: "Scented", tone: "bad" } },
  start: { place: "The Street", items: { spray: 2, sneakers: 1, keys: 1 } },
  items: {
    spray: { name: "Blocker Spray", uses: 3, use: { label: "Spray yourself", visibility: -25, remove_condition: ["scented"], hint: "{{user}} mists the spray." } },
    treat: { name: "Sweet Bun" },
    sneakers: { name: "Running Shoes", bonus: { athletics: 20 } },
    keys: { name: "Keys", keep: true, use: { label: "Jangle the keys", stress: -1 } },
  },
  actions: {
    bolt: { label: "Bolt", check: { vs: 12, add: "athletics / 10" }, success: { stress: -2 }, fail: { stress: 5 } },
    treat: { label: "Toss a treat", when: "has('treat')", show_locked: true, effects: { take: "treat" } },
  },
  ...extra,
}).ruleset!;

const fold = (r: ReturnType<typeof rules>, s: GameState, rec: TurnRecord) => { const n = cloneState(s); rec.events.forEach((e) => applyEvent(n, e, r)); return n; };

describe("items that do things", () => {
  test("a use: block becomes an action that spends a charge, and keys that keep don't run out", () => {
    const r = rules();
    expect(r.items.spray.use).toMatchObject({ id: "item:spray", label: "Spray yourself" });
    expect(r.items.treat.use).toBeUndefined();
    const s = initialState(r);
    s.conditions.scented = { until: null };
    const after = fold(r, s, resolveTurn(r, s, { actionId: "item:spray", via: "choice" }, { seed: "x" }));
    expect(after.stats.visibility).toBe(35);
    expect(after.conditions.scented).toBeUndefined();
    expect(after.uses.spray).toBe(2);
    expect(after.items.spray).toBe(2);
    const k = fold(r, initialState(r), resolveTurn(r, initialState(r), { actionId: "item:keys", via: "choice" }, { seed: "k" }));
    expect(k.items.keys).toBe(1);
  });

  test("gear adds to the checks that read its stat, and says so", () => {
    const r = rules();
    const s = initialState(r);
    const bolt = r.actions.bolt;
    const carried = odds(r, s, bolt)!.success;
    const bare = cloneState(s); delete bare.items.sneakers;
    // +20 athletics = +2 on the d20 = 10 points of odds.
    expect(carried).toBeCloseTo(odds(r, bare, bolt)!.success + 0.1, 5);
    const rec = resolveTurn(r, s, { actionId: "bolt", via: "choice" }, { seed: "g" });
    expect(rec.check?.gear).toEqual(["Running Shoes: +20 Athletics"]);
  });

  test("helpful items are offered with a reason; out of reach moves say why", () => {
    const r = rules();
    const s = initialState(r);
    s.conditions.scented = { until: null };
    const choices = buildChoices(r, s, { lines: [], veils: [] });
    expect(choices.find((c) => c.id === "item:spray")).toMatchObject({ group: "Items", why: "Clears Scented" });
    expect(choices.find((c) => c.id === "treat")?.locked).toBe("Needs Sweet Bun");
    const calm = initialState(r);
    calm.stats.visibility = 20;
    expect(buildChoices(r, calm, { lines: [], veils: [] }).some((c) => c.id.startsWith("item:"))).toBe(false);
    calm.stats.visibility = 90;
    expect(itemRelevance(r, calm, r.items.spray.use!)).toMatchObject({ why: "Visibility is high" });
  });

  test("the inventory carries a Use button and gear notes", () => {
    const r = rules();
    const h = buildHud(r, initialState(r));
    expect(h.items.find((i) => i.id === "spray")?.use).toEqual({ id: "item:spray", label: "Spray yourself", locked: null, drafted: false });
    expect(h.items.find((i) => i.id === "sneakers")?.bonus).toBe("+20 Athletics");
  });

  test("item_uses was removed: one warning, the item keeps its own", () => {
    const { ruleset, issues } = normalizeRuleset({ items: { treat: { name: "Bun" } }, item_uses: { treat: { label: "Eat it" } } });
    expect(ruleset!.items.treat.use).toBeUndefined();
    expect(issues.filter((i) => i.where === "Item Uses")).toHaveLength(1);
  });
});

describe("items the story uses", () => {
  test("the story using an item applies its effect once; a clicked use isn't applied twice", () => {
    const r = rules();
    const s = initialState(r);
    s.stats.visibility = 70;
    const told = applyProposal(r, s, { used: { "Blocker Spray": 1 } });
    const after = cloneState(s); told.forEach((e) => applyEvent(after, e, r));
    expect(after.stats.visibility).toBe(45);
    expect(after.uses.spray).toBe(2);
    const clicked = applyProposal(r, s, { used: { spray: 1 } }, { text: "", action: { id: "item:spray", tags: [] } });
    expect(clicked.some((e) => e.t === "stat")).toBe(false);
  });
});
