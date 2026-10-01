// Encounters that explain themselves, items that do things, and endings that stay ended.

import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { applyEvent, cloneState, initialState, type GameState } from "./state.js";
import { applyProposal, encounterJustEnded, odds, resolveTurn, resolveTurnFull, type TurnRecord } from "./resolve.js";
import { buildChoices, buildHud } from "./view.js";
import { encounterGuide, itemRelevance, roundCard, thresholds } from "./encounter-view.js";

const rules = (extra: Record<string, unknown> = {}) => normalizeRuleset({
  clock: { start: "Mon 12:00" },
  stats: {
    stress: { kind: "meter", start: 10, good: "low" },
    visibility: { kind: "meter", start: 60, good: "low" },
    persuasion: { kind: "skill", max: 100, start: 20 },
    athletics: { kind: "skill", max: 100, start: 15 },
  },
  conditions: { scented: { label: "Scented", tone: "bad" } },
  locations: { street: { name: "The Street" } },
  start: { location: "street", items: { spray: 2, sneakers: 1, keys: 1 } },
  items: {
    spray: { name: "Blocker Spray", uses: 3, use: { label: "Spray yourself", visibility: -25, remove_condition: ["scented"], hint: "{{user}} mists the spray." } },
    treat: { name: "Sweet Bun" },
    sneakers: { name: "Running Shoes", slot: "feet", bonus: { athletics: 20 } },
    keys: { name: "Keys", keep: true, use: { label: "Jangle the keys", stress: -1 } },
  },
  wardrobe: { slots: ["feet"], start: ["sneakers"] },
  encounters: {
    cornered: {
      name: "Cornered",
      foe: { name: "The Pack", stats: { resolve: { start: 10, max: 10 } } },
      actions: {
        talk: { label: "Talk them down", check: { chance: "40 + persuasion / 2" }, success: { foe: { resolve: -5 }, hint: "They hesitate." }, fail: { stress: 10 } },
        distract: { label: "Stage a diversion", check: { chance: "60 - visibility / 2" }, success: { foe: { resolve: -6 } }, fail: { visibility: 10 } },
        treat: { label: "Toss a treat", when: "has('treat')", effects: { take: "treat", foe: { resolve: -7 } } },
        bolt: { label: "Bolt", check: { chance: "10 + athletics / 2" }, success: { end: "escaped" }, fail: { stress: 5 } },
      },
      foe_moves: { press: { desc: "Presses in close", weight: 1, stress: 5 } },
      end_when: { won: "foe.resolve <= 0", overwhelmed: "stress >= 80" },
      labels: { won: "You talked them down" },
      outcomes: { won: { stress: -5 }, overwhelmed: { stress: -20 } },
    },
  },
  ...extra,
}).ruleset!;

function begin(r: ReturnType<typeof rules>): GameState {
  const s = initialState(r);
  applyEvent(s, { t: "enc", id: "cornered", foe: { resolve: 10 }, src: "manual" }, r);
  applyEvent(s, { t: "cond", id: "scented", on: true, src: "manual" }, r);
  return s;
}
const fold = (r: ReturnType<typeof rules>, s: GameState, rec: TurnRecord) => { const n = cloneState(s); rec.events.forEach((e) => applyEvent(n, e, r)); return n; };
function seedFor(r: ReturnType<typeof rules>, s: GameState, actionId: string, tier: string): TurnRecord {
  for (let i = 0; i < 400; i++) {
    const rec = resolveTurn(r, s, { actionId, via: "choice" }, { seed: `${actionId}:${i}` });
    if (rec.check?.tier === tier) return rec;
  }
  throw new Error(`no ${tier} for ${actionId}`);
}

describe("items that do things", () => {
  test("a use: block becomes an action that spends a charge, and keys that keep don't run out", () => {
    const r = rules();
    expect(r.items.spray.use).toMatchObject({ id: "item:spray", label: "Spray yourself" });
    expect(r.items.treat.use).toBeUndefined();
    const s = begin(r);
    const rec = resolveTurn(r, s, { actionId: "item:spray", via: "choice" }, { seed: "x" });
    const after = fold(r, s, rec);
    expect(after.stats.visibility).toBe(35);
    expect(after.conditions.scented).toBeUndefined();
    expect(after.uses.spray).toBe(2);
    expect(after.items.spray).toBe(2);
    // Using an item mid-encounter costs the round: the other side still moves.
    expect(rec.events.some((e) => e.t === "round")).toBe(true);
    const k = fold(r, initialState(r), resolveTurn(r, initialState(r), { actionId: "item:keys", via: "choice" }, { seed: "k" }));
    expect(k.items.keys).toBe(1);
  });

  test("gear adds to the checks that read its stat, and says so", () => {
    const r = rules();
    const s = begin(r);
    const bolt = r.encounters.cornered.actions.bolt;
    const worn = odds(r, s, bolt)!.success;
    const bare = cloneState(s); bare.worn = {};
    expect(worn).toBeCloseTo(odds(r, bare, bolt)!.success + 0.1, 5);
    const rec = resolveTurn(r, s, { actionId: "bolt", via: "choice" }, { seed: "g" });
    expect(rec.check?.gear).toEqual(["Running Shoes: +20 Athletics"]);
  });

  test("in an encounter, items that bear on it are offered with a reason; out of reach moves say why", () => {
    const r = rules();
    const s = begin(r);
    const choices = buildChoices(r, s, { lines: [], veils: [] });
    const spray = choices.find((c) => c.id === "item:spray");
    expect(spray?.group).toBe("Items");
    expect(spray?.why).toBe("Clears Scented");
    expect(choices.find((c) => c.id === "treat")?.locked).toBe("Needs Sweet Bun");
    // Out of an encounter, only clearly helpful items show up.
    const calm = initialState(r);
    calm.stats.visibility = 20;
    expect(buildChoices(r, calm, { lines: [], veils: [] }).some((c) => c.id.startsWith("item:"))).toBe(false);
    calm.stats.visibility = 90;
    expect(itemRelevance(r, calm, r.items.spray.use!)).toMatchObject({ why: "Visibility is high" });
    expect(buildChoices(r, calm, { lines: [], veils: [] }).find((c) => c.id === "item:spray")?.why).toBe("Visibility is high");
  });

  test("the inventory carries a Use button and gear notes", () => {
    const r = rules();
    const h = buildHud(r, begin(r));
    expect(h.items.find((i) => i.id === "spray")?.use).toEqual({ id: "item:spray", label: "Spray yourself", locked: null, drafted: false });
    expect(h.items.find((i) => i.id === "sneakers")?.bonus).toBe("+20 Athletics while worn");
  });

  test("item_uses gives uses to items declared elsewhere (drafted ones are marked), never over the item's own", () => {
    const r = rules({ item_uses: { treat: { drafted: true, label: "Eat it", stress: -5 }, spray: { label: "Ignored", stress: -1 } } });
    expect(r.items.treat.use?.label).toBe("Eat it");
    expect(r.items.treat.drafted).toBe(true);
    expect(r.items.spray.use?.label).toBe("Spray yourself");
  });
});

describe("encounters that explain themselves", () => {
  test("the goal and the danger come from the endings when the author didn't write them", () => {
    const r = rules();
    expect(thresholds(r.encounters.cornered).map((t) => `${t.outcome}:${t.stat}`)).toEqual(["won:resolve", "overwhelmed:stress"]);
    const g = encounterGuide(r, begin(r))!;
    expect(g.goal).toBe("Bring their resolve to 0 — or bolt (escaped)");
    expect(g.progress).toEqual([{ label: "Resolve", value: 10, target: 0, max: 10 }]);
    expect(g.danger[0]).toMatchObject({ label: "Stress", value: 10, at: 80, close: false });
    expect(g.dangerText).toContain("Stress at 80 and you're overwhelmed");
    expect(g.dangerText).toContain("rounds left");
    expect(buildHud(r, begin(r)).encounter).toMatchObject({ quiet: true, goal: g.goal });
  });

  test("a successful check is not a won encounter; only the rules' ending says so, in the author's words", () => {
    const r = rules();
    let s = begin(r);
    const first = seedFor(r, s, "talk", "success");
    const after = fold(r, s, first);
    const card = roundCard(r, first, s, after, 0.5);
    expect(card.check?.tier).toBe("success");
    expect(card.ended).toBeNull();
    expect(card.changes.find((c) => c.label.endsWith("Resolve"))).toMatchObject({ from: 10, to: 5, good: true });
    s = after;
    const second = seedFor(r, s, "talk", "success");
    const end = roundCard(r, second, s, fold(r, s, second), 0.5);
    expect(end.ended).toEqual({ outcome: "won", label: "You talked them down", loss: false });
  });

  test("encounters play quietly unless marked narrate", () => {
    expect(rules().encounters.cornered.narrate).toBe(false);
    const r = rules({ encounters: { loud: { narrate: true, actions: { wait: {} }, end_when: { done: "stress >= 100" } } } });
    expect(r.encounters.loud.narrate).toBe(true);
  });
});

describe("an ended encounter stays ended", () => {
  test("the story can't restart it in the same exchange, nor soon after in the same place, unless it's genuinely new", () => {
    const r = rules();
    let s = begin(r);
    for (const _ of [0, 1]) s = fold(r, s, seedFor(r, s, "talk", "success"));
    expect(s.encounter).toBeNull();
    expect(s.lastEncounter).toMatchObject({ id: "cornered", outcome: "won", loc: "street" });
    const restart = (st: GameState, fresh = false) => applyProposal(r, st, { encounter: "cornered", ...(fresh ? { encounterFresh: true } : {}) }).some((e) => e.t === "enc" && e.id === "cornered");
    expect(restart(s)).toBe(false);
    expect(restart(s, true)).toBe(false); // same exchange: never
    const later = cloneState(s); later.minutes += 30;
    expect(restart(later)).toBe(false);
    expect(restart(later, true)).toBe(true);
    const muchLater = cloneState(s); muchLater.minutes += 120;
    expect(restart(muchLater)).toBe(true);
    expect(encounterJustEnded(muchLater, "cornered", false)).toBe(false);
    // A fight read from the player's own message follows the same rule.
    const res = resolveTurnFull(r, s, null, { seed: "z", encounter: { id: "cornered" } });
    expect(res.record.events.some((e) => e.t === "enc" && e.id === "cornered")).toBe(false);
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
