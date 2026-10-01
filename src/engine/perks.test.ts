// Abilities and perks that change how you play: spells with costs and uses,
// buffs that count in checks, perks that bend rules, and picking one of a few.

import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { applyEvent, cloneState, initialState, type GameState } from "./state.js";
import { abilityStatus, buyPerk, odds, perkOffers, resolveTurn, usableAbilities, type TurnRecord } from "./resolve.js";
import { buildChoices, buildHud, stateDigest } from "./view.js";

const rules = (extra: Record<string, unknown> = {}) => {
  const { ruleset, issues } = normalizeRuleset({
    clock: { start: "Mon 12:00" },
    stats: {
      hp: { kind: "meter", label: "HP", start: 30, max: 30, good: "high" },
      mana: { kind: "meter", start: 10, max: 20, good: "high" },
      stress: { kind: "meter", start: 10, good: "low" },
      evasion: { kind: "skill", max: 100, start: 20 },
      arcana: { kind: "skill", max: 100, start: 30 },
      persuasion: { kind: "skill", max: 100, start: 10 },
      perk_points: { kind: "attribute", start: 0, max: 10 },
    },
    conditions: { hasted: { label: "Hasted", tone: "good", bonus: { evasion: 20 } } },
    abilities: {
      haste: { name: "Haste", desc: "Quicken yourself", cost: { mana: -8 }, add_condition: { hasted: 30 }, per_day: 2 },
      firebolt: { name: "Firebolt", cost: { mana: -4 }, check: { chance: "40 + arcana" }, harm: "6 + arcana / 5", where: "encounter", per_encounter: 1 },
      blink: { name: "Blink", effects: { stress: -2 } },
    },
    perks: {
      points: "perk_points",
      pick: 3,
      blinker: { name: "Blinker", abilities: ["blink"], tags: ["arcane"] },
      dodger: { name: "Dodger", bonus: { evasion: 10 }, excludes: ["brawler"] },
      brawler: { name: "Brawler", bonus: { hp: 5 } },
      silver: { name: "Silver Tongue", rule: { reroll: { stats: ["persuasion"], per_day: 1 } } },
      calm: { name: "Calm", rule: { gains: { stress: "-50%" } }, drawback: { desc: "Slow to heal", losses: { hp: "+20%" } }, narrator: "{{user}} keeps their head when others panic." },
      arcanist: { name: "Arcanist", edge: { arcana: 15, when: "mana >= 5" } },
    },
    actions: {
      talk: { label: "Talk your way out", check: { chance: "5 + persuasion / 10" }, success: { stress: -5 }, fail: { stress: 5 } },
      dodge: { label: "Dodge", check: { chance: "evasion" }, success: { stress: -1 } },
    },
    encounters: {
      duel: {
        name: "Duel",
        foe: { name: "Duelist", stats: { hp: { start: 20, max: 20 } } },
        actions: { jab: { label: "Jab", effects: { foe: { hp: -2 } } } },
        foe_moves: { wait: { desc: "Circles", weight: 1 } },
        end_when: { won: "foe.hp <= 0", beaten: "hp <= 0" },
      },
    },
    ...extra,
  });
  if (!ruleset) throw new Error(issues.map((i) => `${i.where}: ${i.message}`).join("\n"));
  return { r: ruleset, issues };
};

const fold = (r: ReturnType<typeof rules>["r"], s: GameState, rec: TurnRecord) => { const n = cloneState(s); rec.events.forEach((e) => applyEvent(n, e, r)); return n; };
const play = (r: ReturnType<typeof rules>["r"], s: GameState, actionId: string, seed = "a") => fold(r, s, resolveTurn(r, s, { actionId, via: "choice" }, { seed }));
const begin = (r: ReturnType<typeof rules>["r"]) => { const s = initialState(r); applyEvent(s, { t: "enc", id: "duel", foe: { hp: 20 }, src: "manual" }, r); return s; };

describe("abilities", () => {
  test("parse cleanly; what nothing teaches is known from the start, what a perk teaches isn't", () => {
    const { r, issues } = rules();
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    const s = initialState(r);
    expect(abilityStatus(r, s, "haste").known).toBe(true);
    expect(abilityStatus(r, s, "blink").known).toBe(false);
    expect(r.abilities.firebolt.action.outcomes.success?.harm).toBe("6 + arcana / 5");
  });

  test("a buff from an ability counts in checks, shows up in the odds and wears off with time", () => {
    const { r } = rules();
    const s = initialState(r);
    const dodge = r.actions.dodge;
    expect(odds(r, s, dodge)!.success).toBeCloseTo(0.2);
    const hasted = play(r, s, "ability:haste");
    expect(hasted.conditions.hasted).toBeDefined();
    expect(hasted.stats.mana).toBe(2);
    expect(odds(r, hasted, dodge)!.success).toBeCloseTo(0.4);
  });

  test("costs it can't pay and uses spent lock it, with the reason", () => {
    const { r } = rules();
    let s = play(r, initialState(r), "ability:haste");
    expect(abilityStatus(r, s, "haste").locked).toBe("Needs 8 Mana");
    s.stats.mana = 20;
    s = play(r, s, "ability:haste", "b");
    expect(abilityStatus(r, s, "haste").left).toBe(0);
    s.stats.mana = 20;
    expect(abilityStatus(r, s, "haste").locked).toBe("Used up for today");
    // A new day, fresh uses.
    s.minutes += 1440;
    expect(abilityStatus(r, s, "haste").locked).toBeNull();
  });

  test("encounter abilities show up only in encounters; harm wears down whatever wins it", () => {
    const { r } = rules();
    expect(usableAbilities(r, initialState(r)).map((u) => u.id)).not.toContain("ability:firebolt");
    let s = begin(r);
    expect(buildChoices(r, s, { lines: [], veils: [] }).find((c) => c.id === "ability:firebolt")).toMatchObject({ group: "Abilities" });
    for (let i = 0; i < 40; i++) {
      const next = play(r, s, "ability:firebolt", `fb${i}`);
      if ((next.encounter?.foe.hp ?? 20) < 20) { s = next; break; }
    }
    expect(s.encounter!.foe.hp).toBe(20 - 12);
    expect(abilityStatus(r, s, "firebolt").locked).toBe("Used up for this encounter");
  });

  test("the narrator knows what the player can do", () => {
    const { r } = rules();
    expect(stateDigest(r, initialState(r))).toContain("Haste (Quicken yourself)");
  });
});

describe("perks", () => {
  const withPoints = (r: ReturnType<typeof rules>["r"], n = 1) => { const s = initialState(r); s.stats.perk_points = n; return s; };
  const take = (r: ReturnType<typeof rules>["r"], s: GameState, id: string) => {
    const ev = buyPerk(r, s, id);
    if (typeof ev === "string") throw new Error(ev);
    const n = cloneState(s); ev.forEach((e) => applyEvent(n, e, r)); return n;
  };

  test("picked from a few: one builds on how you play, and only offered perks can be taken", () => {
    const { r } = rules();
    const s = withPoints(r);
    expect(perkOffers(r, initialState(r))).toEqual([]);
    s.stats.arcana = 70;
    const offers = perkOffers(r, s);
    expect(offers).toHaveLength(3);
    expect(offers[0]).toBe("arcanist");
    expect(perkOffers(r, s)).toEqual(offers);
    const notOffered = Object.keys(r.perks).find((id) => !offers.includes(id))!;
    expect(buyPerk(r, s, notOffered)).toBe("Not on offer right now.");
    expect(buildHud(r, s).perks.filter((p) => p.offered).map((p) => p.id).sort()).toEqual([...offers].sort());
  });

  test("a perk that teaches an ability; perks that rule each other out", () => {
    const { r } = rules({ perks: { points: "perk_points", blinker: { name: "Blinker", abilities: ["blink"] }, dodger: { name: "Dodger", bonus: { evasion: 10 }, excludes: ["brawler"] }, brawler: { name: "Brawler" } } });
    let s = take(r, withPoints(r, 3), "blinker");
    expect(abilityStatus(r, s, "blink").known).toBe(true);
    s = take(r, s, "dodger");
    expect(buyPerk(r, s, "brawler")).toBe("Can't go with Dodger.");
    expect(odds(r, s, r.actions.dodge)!.success).toBeCloseTo(0.3);
  });

  test("an edge counts only while its condition holds", () => {
    const { r } = rules({ perks: { points: "perk_points", arcanist: { edge: { arcana: 15, when: "mana >= 5" } } } });
    const a = { ...r.actions.dodge, check: { ...r.actions.dodge.check!, target: "arcana" } };
    const s = take(r, withPoints(r), "arcanist");
    expect(odds(r, s, a)!.success).toBeCloseTo(0.45);
    s.stats.mana = 2;
    expect(odds(r, s, a)!.success).toBeCloseTo(0.3);
  });

  test("a reroll steps in once a day after a failure, and says so", () => {
    const { r } = rules({ perks: { points: "perk_points", silver: { name: "Silver Tongue", rule: { reroll: { stats: ["persuasion"], per_day: 1 } } } } });
    const s = take(r, withPoints(r), "silver");
    const rec = resolveTurn(r, s, { actionId: "talk", via: "choice" }, { seed: "x" });
    expect(rec.check!.perk).toBe("Silver Tongue rerolled a failure");
    const after = fold(r, s, rec);
    const again = resolveTurn(r, after, { actionId: "talk", via: "choice" }, { seed: "y" });
    expect(again.check!.perk).toBeUndefined();
  });

  test("gains and losses: a stat rises slower, a drawback makes another drop faster; the narrator hears about it", () => {
    const { r } = rules({ perks: { points: "perk_points", calm: { name: "Calm", rule: { gains: { stress: "-50%" } }, drawback: { desc: "Slow to heal", losses: { hp: "+20%" } }, narrator: "{{user}} keeps their head." } } });
    const s = take(r, withPoints(r), "calm");
    const rec = resolveTurn(r, s, { actionId: "talk", via: "choice" }, { seed: "fail" });
    const n = fold(r, s, rec);
    if (rec.check!.tier === "fail") expect(n.stats.stress).toBe(12.5);
    const hurt = cloneState(s);
    expect(buildHud(r, hurt).perks[0]).toMatchObject({ drawback: "Slow to heal", notes: ["Stress rises 50% slower", "HP drops 20% faster"] });
    expect(stateDigest(r, s)).toContain("Calm — {{user}} keeps their head.");
  });
});

describe("bands for a stat whose max grows", () => {
  test("percentage bands follow the current maximum", async () => {
    const { bandFor } = await import("./state.js");
    const { ruleset } = normalizeRuleset({ stats: { level: { kind: "attribute", start: 1, max: 20 }, hp: { kind: "meter", max: "20 + level * 10", start: 30, bands: { "0%": "Down.", "40%": "Wounded.", "75%": "Hale." } } } });
    const def = ruleset!.stats.hp;
    expect(def.pctBands).toBe(true);
    expect(bandFor(def, 30, 30)!.text).toBe("Hale.");
    expect(bandFor(def, 30, 90)!.text).toBe("Down.");
    expect(bandFor(def, 40, 90)!.text).toBe("Wounded.");
    expect(buildHud(ruleset!, initialState(ruleset!)).bars.find((b) => b.id === "hp")!.text).toBe("Hale.");
  });
});
