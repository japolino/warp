// In-chat systems taken out of Warp (family, being seen, the mind, money pressure, errands,
// the living world, companion lives, checkpoints, perks, the map, the wardrobe and body…) leave
// old rulesets and old chats working: each removed key gets one plain warning and is ignored,
// formula names of removed parts read as 0, and the events they recorded are skipped.
// The old version is on the `legacy` branch.

import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { lintRuleset } from "./lint.js";
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

describe("removed in-chat systems", () => {
  test("each removed key or effect gets one plain warning and is ignored", () => {
    const { ruleset: r, issues } = load();
    expect(r).not.toBeNull();
    expect(removedWhere()).toEqual([
      "Actions › nap › errand", "Actions › night › effects › arc", "Actions › night › effects › bond", "Actions › night › effects › conceive",
      "Actions › night › effects › front", "Actions › night › effects › gauge", "Actions › night › effects › learn", "Actions › night › effects › unlock",
      "Actions › nap › requires › perk", "Stats › str › allocate",
      "Actions › night › effects › body", "Actions › night › effects › damage", "Actions › night › effects › transform",
      "Actions › night › effects › undress", "Actions › night › effects › wear",
      "Items › shirt › integrity", "Items › shirt › reveal", "Items › shirt › slot", "Items › shirt › traits", "Items › shirt › warmth",
      "Locations › attic › temp",
      "Abilities", "Body", "Checkpoints", "Codex", "Companions", "Discovery", "Endings", "Feats", "Fronts", "Jobs", "Lineage", "Mind", "Obligations", "Observers", "Perks",
      "Random Events", "Wardrobe", "Weather",
      "Relationships › people › robin › schedule", "Relationships › people › robin › traits",
    ].sort());
    for (const i of issues.filter((x) => x.message.includes("was removed from Warp"))) {
      expect(i.level).toBe("warning");
      expect(i.message).toContain("`legacy` branch");
    }
    for (const k of ["lineage", "observers", "mind", "obligations", "jobs", "discovery", "companions", "bonds", "fronts", "randomEvents", "checkpoints", "endings", "legacy",
      "codex", "feats", "perks", "perkPoints", "perkPick", "abilities", "weather", "wardrobe", "body"]) expect(Object.keys(r!)).not.toContain(k);
    expect(Object.keys(r!.items.shirt).sort()).toEqual(["armor", "bonus", "desc", "id", "keep", "name", "tags", "uses"]);
    expect(Object.keys(r!.locations.attic).sort()).toEqual(["board", "desc", "id", "indoors", "name"]);
    expect(Object.keys(r!.stats.str)).not.toContain("allocate");
    expect(r!.actions.nap.requires).toEqual([]);
    expect(JSON.stringify(r!.actions.night)).not.toContain("conceive");
  });

  test("formula names of removed parts read as 0, and the lint says why", () => {
    const r = load().ruleset!;
    const msgs = lintRuleset(r).map((i) => i.message);
    const gone = (name: string, what: string) => msgs.some((m) => m.includes(`"${name}" (${what}) was removed from Warp`));
    for (const name of ["pregnant", "children()", "pregnancy_weeks"]) expect(gone(name, "family and pregnancy")).toBe(true);
    for (const name of ["seen_by()", "fame()"]) expect(gone(name, "being seen")).toBe(true);
    for (const name of ["owed()", "missed()", "days_until()"]) expect(gone(name, "bills and debts")).toBe(true);
    expect(gone("at_work", "work shifts")).toBe(true);
    expect(gone("bond()", "feelings between people")).toBe(true);
    expect(gone("arc()", "companion lives")).toBe(true);
    expect(gone("where()", "schedules")).toBe(true);
    for (const name of ["front()", "front_stage()"]) expect(gone(name, "hidden world clocks (fronts)")).toBe(true);
    expect(gone("happened()", "random events")).toBe(true);
    expect(gone("saved()", "checkpoints")).toBe(true);
    expect(gone("loops", "checkpoints")).toBe(true);
    expect(gone("runs", "endings and new playthroughs")).toBe(true);
    expect(gone("codex()", "the codex")).toBe(true);
    expect(gone("feat()", "feats")).toBe(true);
    expect(gone("perk()", "perks")).toBe(true);
    for (const name of ["weather", "temperature", "warmth", "too_cold"]) expect(gone(name, "weather and temperature")).toBe(true);
    for (const name of ["naked", "exposed", "reveal", "wearing()", "worn()", "integrity()", "trait()"]) expect(gone(name, "the wardrobe")).toBe(true);
    for (const name of ["body()", "transformed()"]) expect(gone(name, "the body and transformations")).toBe(true);
    const rec = resolveTurn(r, initialState(r), { actionId: "night", via: "choice" }, { seed: "x" });
    expect(rec.events.some((e) => (e.t as string) === "conceive")).toBe(false);
    expect(rec.events.some((e) => e.t === "stat" && e.id === "mood")).toBe(true);
    // No mind override takes the wheel, and nothing filters the narration.
    expect(JSON.stringify(rec)).not.toContain("Panic");
    expect(stateDigest(r, initialState(r))).not.toContain("grey");
  });

  test("an old chat with events of removed systems still folds", () => {
    const r = load().ruleset!;
    const old = [
      { t: "conceive", carrier: "player", with: "robin", src: "action" },
      { t: "preg_stage", n: 1, src: "world" },
      { t: "birth", id: "child_1", kin: { name: "Ada", sex: "girl", born: 0, parents: ["player", "robin"], body: {}, joined: false }, src: "world" },
      { t: "kin_join", id: "child_1", src: "world" },
      { t: "seen", who: "robin", what: "exposed: top", where: "Park", src: "world" },
      { t: "due", id: "rent", due: 100, owed: 10, missed: 1, src: "world" },
      { t: "job", job: { id: "cafe", n: 0, patron: 0, earned: 0, tips: 0, log: [] }, src: "action" },
      { t: "explored", loc: "park", found: true, src: "action" },
      { t: "discovered", id: "cove", src: "action" },
      { t: "bond", a: "robin", b: "sam", d: 5, src: "world" },
      { t: "clock", id: "gangs", d: 30, src: "world" },
      { t: "stage", id: "gangs", n: 0, src: "world" },
      { t: "gauge", d: 40, src: "world" },
      { t: "omen", id: "storm", src: "world" },
      { t: "happen", id: "storm", src: "world" },
      { t: "rest", days: 1, src: "world" },
      { t: "news", text: "A shop burns.", src: "world" },
      { t: "save", slot: "1", label: "Before", src: "manual" },
      { t: "end", id: "broke", told: false, src: "trigger" },
      { t: "end_told", src: "world" },
      { t: "load", slot: "1", src: "manual" },
      { t: "restart", src: "manual" },
      { t: "codex", id: "docks", src: "trigger" },
      { t: "feat", id: "owl", src: "trigger" },
      { t: "perk", id: "lucky", src: "manual" },
      { t: "learn", id: "haste", src: "action" },
      { t: "seed", v: "world-1", src: "start" },
      { t: "wear", slot: "top", item: "shirt", src: "manual" },
      { t: "dmg", item: "shirt", d: -10, src: "action" },
      { t: "body", part: "hair", trait: "color", v: "red", src: "narrator" },
      { t: "tf", id: "fox", stage: 1, src: "action" },
      { t: "stat", id: "coin", d: 5, src: "action" },
    ] as unknown as WarpEvent[];
    const s = foldEvents(r, [old]);
    expect(s.stats.coin).toBe(55);
    expect(Object.keys(s)).not.toContain("pregnancy");
    for (const k of ["kin", "seen", "dues", "job", "explored", "discovered", "bonds", "fronts", "gauge", "news", "saves", "ended", "runs", "loops", "codex", "feats", "perks", "learned",
      "seed", "worn", "integrity", "body", "tf"]) expect(Object.keys(s)).not.toContain(k);
    expect(s.items.shirt).toBeUndefined();
    expect(s.people.child_1).toBeUndefined();
    expect(buildHud(r, s)).toBeTruthy();
    expect(buildChoices(r, s, { lines: [], veils: [] }).length).toBeGreaterThan(0);
    expect(stateDigest(r, s)).not.toContain("pregnant");
  });
});
