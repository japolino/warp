// The ruleset format after the core cut (format 2): the 21 top-level keys, renamed keys, and systems that were
// taken out. An old ruleset still loads: each removed key, effect or formula name gets one plain warning (with what
// to use instead) and is ignored; an old chat with events of removed systems still folds.

import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { lintRuleset, REMOVED_FORMULA_NAMES, REMOVED_FORMULAS } from "./lint.js";
import { normalizeRuleset, REMOVED_EFFECT_NAMES, REMOVED_EFFECTS, REMOVED_KEYS, RULESET_FORMAT, TOP_LEVEL_KEYS } from "./ruleset.js";
import { foldEvents, initialState, type WarpEvent } from "./state.js";
import { buildChoices, buildHud, stateDigest } from "./view.js";
import { resolveTurn } from "./resolve.js";

const OLD = `
name: Old life sim
stats:
  coin: { kind: money, start: 50 }
  mood: { kind: meter, start: 50 }
  str: { kind: attribute, start: 5, allocate: { with: coin } }
weather: { temps: { autumn: 8 } }
wardrobe: { slots: [top], start: [shirt] }
body: { parts: { hair: { color: brown } }, transforms: { fox: { stages: [ { set: { ears: { type: fox } } } ] } } }
items:
  shirt: { name: Shirt, slot: top, warmth: 3, integrity: 50, reveal: 1, traits: [cotton] }
locations:
  park: { name: Park }
  attic: { name: Attic, indoors: true, temp: 8 }
relationships:
  stats: { trust: { start: 10 } }
  people: { robin: { name: Robin, age: 30, schedule: [ { at: park } ], traits: [shy] } }
lineage:
  pregnancy: { weeks: 36 }
observers:
  when: "exposed > 0"
discovery: { at: [park], people: true }
companions:
  robin: { goal: Open a bakery, jealous_of: [anyone], bonds: { sam: 30 } }
fronts:
  gangs: { per_day: 20, stages: [ { at: 40, surface: "A shop burns." } ] }
random_events:
  events: { storm: { text: "A storm hits." } }
checkpoints: { slots: 3, auto: day, loop: { when: "hour >= 23" } }
codex: { docks: { title: The Docks, unlock: "mood > 10" } }
feats: { owl: { name: Night owl, unlock: "hour >= 2" } }
abilities: { haste: { name: Haste, cost: { mood: -5 } } }
perks:
  points: coin
  lucky: { name: Lucky, rule: { reroll: { stats: [str] } } }
endings:
  broke: { when: "coin <= 0", text: "{{user}} leaves town." }
obligations:
  rent: { amount: 10, every: 7 }
jobs:
  cafe: { label: Café shift, patrons: [ { who: A regular } ] }
mind:
  overrides: { freeze: { when: "mood < 99", chance: 100, cause: Panic, resist_cost: { mood: 5 } } }
  perception: [ { when: "mood < 99", text: "Everything looks grey." } ]
  reactions: { interested: { rel: { target: { trust: +4 } } } }
actions:
  night:
    label: A night with Robin
    effects: { conceive: { with: robin, chance: 100 }, mood: +1, arc: { robin: 5 }, bond: { robin: { sam: 5 } }, front: { gangs: 10 }, gauge: 20, unlock: [docks], learn: [haste],
      wear: [shirt], undress: [top], damage: { top: 10 }, body: { hair: { color: red } }, transform: { fox: 1 } }
  nap:
    label: Nap
    errand: rest
    requires: { perk: lucky }
    time: 60
    effects: { mood: +2 }
triggers:
  family: { when: "pregnant or children() > 0 or pregnancy_weeks > 2", do: { coin: +1 } }
  famous: { when: "seen_by('robin') or fame() > 2", do: { coin: +1 } }
  replay: { when: "saved('1') or loops > 0 or runs > 1", do: { coin: +1 } }
  world: { when: "front('gangs') > 10 or front_stage('gangs') > 0 or happened('storm')", do: { coin: +1 } }
  close: { when: "bond('robin', 'sam') > 0 or arc('robin') > 0 or where('robin') == 'park'", do: { coin: +1 } }
  journal: { when: "codex('docks') or feat('owl') or perk('lucky')", do: { coin: +1 } }
  dressed: { when: "too_cold or warmth > 3 or temperature > 40 or weather == 'rain' or naked or exposed > 0 or reveal > 1 or wearing('shirt') or worn('top') == 'shirt' or integrity('shirt') > 20 or trait('cotton') or body('hair', 'color') == 'red' or transformed('fox') > 0", do: { coin: +1 } }
  broke: { when: "owed('rent') > 0 or missed('rent') > 0 or days_until('rent') < 0 or at_work", do: { coin: +1 } }
`;

const load = () => loadRuleset([{ label: "t", content: OLD, order: 0 }]);
const removedWhere = () => load().issues.filter((i) => i.message.includes("was removed from Warp")).map((i) => i.where).sort();

describe("the format", () => {
  test("format 2: 21 top-level keys plus inventory, and the removed keys Studio checks against", () => {
    expect(RULESET_FORMAT).toBe(2);
    expect(TOP_LEVEL_KEYS.filter((k) => k !== "inventory")).toHaveLength(21);
    for (const k of ["encounters", "quests", "locations", "weather", "wardrobe", "body", "perks", "dungeons", "dating"]) expect(REMOVED_KEYS[k]).toBeTruthy();
    expect(REMOVED_KEYS.encounters.hint).toContain("conflict:");
    expect(REMOVED_KEYS.quests.hint).toContain("goals:");
    for (const k of ["foe", "end", "start_encounter", "quest", "progress", "wear", "inflict", "harm"]) expect(REMOVED_EFFECT_NAMES).toContain(k);
    for (const k of ["quest", "wearing", "in_dungeon", "season", "indoors"]) expect(REMOVED_FORMULA_NAMES).toContain(k);
    expect(Object.keys(REMOVED_EFFECTS).length).toBe(REMOVED_EFFECT_NAMES.length);
    expect(Object.keys(REMOVED_FORMULAS).length).toBe(REMOVED_FORMULA_NAMES.length);
  });

  test("an unknown top-level key warns with a did-you-mean; renamed keys are read with a warning", () => {
    const { ruleset, issues } = normalizeRuleset({ secret: { x: {} }, player: { age: 30 }, improvise: { bonus: 5 }, style: "adventure" });
    expect(issues.find((i) => i.where === "Secret")?.message).toContain('did you mean "secrets"');
    expect(issues.find((i) => i.where === "You")?.message).toContain("renamed to `you:`");
    expect(issues.find((i) => i.where === "Checks")?.message).toContain("renamed to `checks:`");
    expect(ruleset!.you.age).toBe(30);
    expect(ruleset!.checks.bonus).toBe(5);
    // Aliases that stay quiet: rules → triggers, practice → growth, people → relationships.people.
    expect(normalizeRuleset({ rules: [], practice: 2, people: { jo: { name: "Jo" } } }).issues).toEqual([]);
  });

  test("defaults: adventure, time and place from the greeting, story goals, three contest kinds, taper and big moments", () => {
    const { ruleset: r } = normalizeRuleset({ stats: { body: { kind: "attribute", max: 10, start: 3 }, health: { kind: "meter" } }, relationships: { stats: { trust: {} } } });
    expect(r!.style).toBe("adventure");
    expect(r!.clock.start).toBe("greeting");
    expect(r!.clock.fallback).toBe(9 * 60);
    expect(r!.startPlace).toBe("greeting");
    expect(initialState(r!).minutes).toBe(9 * 60);
    expect(r!.goals).toEqual({ fromStory: true, max: 3, list: {} });
    expect(Object.keys(r!.conflict.kinds)).toEqual(["fight", "chase", "argument"]);
    // Default kinds keep costs only on stats that exist.
    expect(r!.conflict.kinds.fight.cost.fail?.stats).toEqual({ health: -8 });
    expect(r!.conflict.kinds.argument.cost.fail?.stats).toEqual({});
    expect(r!.liveChoices.taper).toEqual({ step: 0.75, floor: 0.1 });
    expect(r!.relBigMoment).toEqual({ factor: 3, cooldown: 10 });
    expect(r!.checks.dc).toEqual({ easy: 8, fair: 12, hard: 16, extreme: 20 });
  });

  test("a story never rolls: checks are errors (the action runs its effects), typed reads are off, conflict is ignored", () => {
    const { ruleset: r, issues } = normalizeRuleset({
      style: "story", stats: { mood: { kind: "meter", start: 50 } },
      actions: { flirt: { label: "Flirt", check: { vs: "fair" }, effects: { mood: +1 } } },
      conflict: { kinds: { fight: { stats: [] } } },
    });
    expect(issues.find((i) => i.where === "Actions › flirt › check")?.level).toBe("error");
    expect(issues.some((i) => i.where === "Conflict")).toBe(true);
    expect(r!.actions.flirt.check).toBeUndefined();
    expect(r!.checks.typed).toBe(false);
    expect(r!.conflict.kinds).toEqual({});
    const s = initialState(r!);
    const rec = resolveTurn(r!, s, { actionId: "flirt", via: "choice" }, { seed: "x" });
    expect(rec.check).toBeUndefined();
    expect(foldEvents(r!, [rec.events], s).stats.mood).toBe(51);
  });

  test("you: and people carry looks as text", () => {
    const { ruleset: r } = normalizeRuleset({ you: { name: "Sam", appearance: "tall, freckles", outfit: "grey hoodie" }, relationships: { stats: { trust: {} }, people: { mira: { name: "Mira", outfit: "green apron" } } } });
    const s = initialState(r!);
    expect(s.look.you).toMatchObject({ appearance: "tall, freckles", outfit: "grey hoodie" });
    expect(s.look.mira).toMatchObject({ outfit: "green apron" });
    expect(buildHud(r!, s).you).toEqual({ appearance: "tall, freckles", outfit: "grey hoodie" });
  });
});

describe("removed systems", () => {
  test("each removed key or effect gets one plain warning and is ignored", () => {
    const { ruleset: r, issues } = load();
    expect(r).not.toBeNull();
    const where = removedWhere();
    for (const w of ["Abilities", "Body", "Checkpoints", "Codex", "Companions", "Discovery", "Endings", "Feats", "Fronts", "Jobs", "Lineage", "Locations", "Mind", "Obligations", "Observers", "Perks",
      "Random Events", "Wardrobe", "Weather", "Actions › nap › errand", "Actions › night › effects › conceive", "Actions › night › effects › wear", "Actions › nap › requires › perk",
      "Stats › str › allocate", "Items › shirt › slot", "Relationships › people › robin › schedule"]) expect(where).toContain(w);
    for (const i of issues.filter((x) => x.message.includes("was removed from Warp"))) {
      expect(i.level).toBe("warning");
      expect(i.message).toContain("`legacy` branch");
    }
    // One warning per key.
    expect(new Set(where).size).toBe(where.length);
    expect(Object.keys(r!.items.shirt).sort()).toEqual(["bonus", "desc", "id", "keep", "name", "tags", "uses"]);
    expect("locations" in r!).toBe(false);
    expect(JSON.stringify(r!.actions.night)).not.toContain("conceive");
  });

  test("encounters, quests and old check styles are gone with plain warnings and errors", () => {
    const { ruleset: r, issues } = normalizeRuleset({
      stats: { hp: { kind: "meter" } },
      encounters: { brawl: { foe: { name: "Thug" } } },
      quests: { wolves: { name: "Wolves" } },
      actions: {
        old: { label: "Old", check: { chance: 40 }, effects: { hp: -1 } },
        pbta: { label: "PbtA", check: { style: "pbta", add: 1 } },
        fight: { label: "Fight", effects: { start_encounter: "brawl", foe: { hp: -3 }, quest: { wolves: "done" } } },
      },
    });
    expect(issues.find((i) => i.where === "Encounters")?.message).toContain("Use `conflict:`");
    expect(issues.find((i) => i.where === "Quests")?.message).toContain("Use `goals:`");
    const oldCheck = issues.find((i) => i.where === "Actions › old › check");
    expect(oldCheck?.level).toBe("warning");
    expect(oldCheck?.message).toContain("(Also in 1 more place.)");
    for (const k of ["start_encounter", "foe", "quest"]) expect(issues.some((i) => i.where === `Actions › fight › effects › ${k}` && i.message.includes("removed"))).toBe(true);
    expect(r!.actions.old.check).toBeUndefined();
    expect("encounters" in r!).toBe(false);
    expect("quests" in r!).toBe(false);
  });

  test("formula names of removed parts read as 0, and the lint says why", () => {
    const r = load().ruleset!;
    const msgs = lintRuleset(r).map((i) => i.message);
    const gone = (name: string, what: string) => msgs.some((m) => m.includes(`"${name}" (${what}) was removed from Warp`));
    for (const name of ["pregnant", "children()", "pregnancy_weeks"]) expect(gone(name, "family and pregnancy")).toBe(true);
    for (const name of ["seen_by()", "fame()"]) expect(gone(name, "being seen")).toBe(true);
    for (const name of ["owed()", "missed()", "days_until()"]) expect(gone(name, "bills and debts")).toBe(true);
    expect(gone("bond()", "feelings between people")).toBe(true);
    expect(gone("where()", "schedules")).toBe(true);
    expect(gone("codex()", "the codex")).toBe(true);
    for (const name of ["naked", "wearing()", "worn()"]) expect(gone(name, "the wardrobe")).toBe(true);
    const rec = resolveTurn(r, initialState(r), { actionId: "night", via: "choice" }, { seed: "x" });
    expect(rec.events.some((e) => (e.t as string) === "conceive")).toBe(false);
    expect(rec.events.some((e) => e.t === "stat" && e.id === "mood")).toBe(true);
    expect(stateDigest(r, initialState(r))).not.toContain("grey");
  });

  test("an old chat with events of removed systems still folds", () => {
    const r = load().ruleset!;
    const old = [
      { t: "conceive", carrier: "player", with: "robin", src: "action" },
      { t: "seen", who: "robin", what: "exposed: top", where: "Park", src: "world" },
      { t: "due", id: "rent", due: 100, owed: 10, missed: 1, src: "world" },
      { t: "clock", id: "gangs", d: 30, src: "world" },
      { t: "save", slot: "1", label: "Before", src: "manual" },
      { t: "perk", id: "lucky", src: "manual" },
      { t: "wear", slot: "top", item: "shirt", src: "manual" },
      { t: "dg_enter", run: { id: "mines", depth: 1 }, src: "action" },
      { t: "dt_pref", who: "robin", key: "tag:music", v: 2, src: "action" },
      { t: "enc", id: "brawl", foe: { hp: 10 }, src: "trigger" },
      { t: "foe", stat: "hp", d: -3, src: "check" },
      { t: "quest", id: "wolves", st: "active", src: "trigger" },
      { t: "qprog", id: "wolves", goal: "kills", d: 1, src: "trigger" },
      { t: "fcond", id: "poisoned", on: true, rounds: 2, src: "check" },
      { t: "charge", key: "x", day: 0, src: "action" },
      { t: "stat", id: "coin", d: 5, src: "action" },
    ] as unknown as WarpEvent[];
    const s = foldEvents(r, [old]);
    expect(s.stats.coin).toBe(55);
    expect(s.contest).toBeNull();
    expect(Object.keys(s.goals)).toEqual([]);
    expect(s.items.shirt).toBeUndefined();
    expect(buildHud(r, s)).toBeTruthy();
    expect(buildChoices(r, s, { lines: [], veils: [] }).length).toBeGreaterThan(0);
  });
});
