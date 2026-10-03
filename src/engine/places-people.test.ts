// Places, people and world gates: "away" schedules, per-person targets, conditional front
// stages, always-offered perks with their own points, and per-place indoor temperature.

import { describe, expect, test } from "bun:test";
import { lintRuleset } from "./lint.js";
import { normalizeRuleset } from "./ruleset.js";
import { availableChoices, buyPerk, perkBlocker, perkOffers, resolveTurn } from "./resolve.js";
import { foldEvents, initialState, makeEnv, type GameState } from "./state.js";
import { personLocation, temperatureAt } from "./world.js";

const BASE = {
  clock: { start: "Mon 08:00", date: "Jan 10" },
  start: { location: "market" },
  weather: { temps: { winter: 2 }, indoors: 18 },
  stats: {
    level: { kind: "attribute", start: 1, max: 99 },
    gold: { kind: "money", start: 0 },
    talent_points: { kind: "attribute", start: 0, max: 10 },
    class_points: { kind: "attribute", start: 0, max: 10 },
  },
  flags: { gate_found: false, maud_gone: false },
  locations: {
    market: { name: "Market" },
    north_road: { name: "North Road" },
    garret: { name: "Garret", indoors: true, temp: 6 },
    tavern: { name: "Tavern", indoors: true },
  },
  relationships: {
    stats: { trust: { start: 10 } },
    people: {
      maud: { name: "Maud", schedule: [{ when: "flag('maud_gone')", at: "away" }, { at: "market" }] },
      hesper: { name: "Mother Hesper", schedule: [{ when: "flag('maud_gone')", at: null }, { at: "market" }] },
      kael: { name: "Kael", schedule: { market: true } },
    },
  },
  actions: {
    train: { label: "Train with {target}", targets: ["maud", "kael"], effects: { rel: { target: { trust: 2 } } } },
    chat: { label: "Chat with {target}", per_person: true, when: "target != 'hesper'", effects: { rel: { target: { trust: 1 } } } },
    to_garret: { label: "Go up to the garret", effects: { move: "garret" } },
    to_tavern: { label: "Go to the tavern", effects: { move: "tavern" } },
  },
};

const load = (extra: Record<string, unknown> = {}) => {
  const { ruleset, issues } = normalizeRuleset({ ...BASE, ...extra });
  return { r: ruleset!, issues };
};
const step = (r: ReturnType<typeof load>["r"], s: GameState, actionId: string, seed = "t") =>
  foldEvents(r, [resolveTurn(r, s, { actionId, via: "choice" }, { seed }).events], s);

describe("places", () => {
  test("loads clean and lints clean", () => {
    const { r, issues } = load();
    expect(issues).toEqual([]);
    expect(lintRuleset(r)).toEqual([]);
  });

  test("the travel graph and the map were removed: their keys warn and are ignored", () => {
    const { r, issues } = load({ locations: { ...BASE.locations, market: { name: "Market", exits: { garret: 2 }, travel: 5, requires: { level: 5 }, why_not: "x", when: "true", pos: [1, 2] } } });
    const gone = issues.filter((i) => i.message.includes("was removed from Warp")).map((i) => i.where).sort();
    expect(gone).toEqual(["exits", "pos", "requires", "travel", "when", "why_not"].map((k) => `Locations › market › ${k}`).sort());
    expect(Object.keys(r.locations.market).sort()).toEqual(["board", "desc", "id", "indoors", "name"]);
    expect(availableChoices(r, initialState(r)).some((c) => c.id.startsWith("go:"))).toBe(false);
  });

  test("an indoor place can have its own temperature; others use weather: { indoors }", () => {
    const { r } = load();
    let s = initialState(r);
    s = step(r, s, "to_garret");
    expect(temperatureAt(r, s)).toBe(6);
    s = step(r, s, "to_tavern");
    expect(temperatureAt(r, s)).toBe(18);
    const { issues } = load({ locations: { ...BASE.locations, north_road: { name: "North Road", temp: -5 } } });
    expect(issues.some((i) => i.where === "Locations › north_road › temp")).toBe(true);
  });
});

describe("people", () => {
  test("an away schedule entry takes someone out of the world without lint warnings", () => {
    const { r, issues } = load();
    expect(issues).toEqual([]);
    expect(r.people.maud.schedule[0].at).toBeNull();
    expect(r.people.hesper.schedule[0].at).toBeNull();
    const s = initialState(r);
    expect(personLocation(r, s, "maud", makeEnv(r, s))).toBe("market");
    s.flags.maud_gone = true;
    expect(personLocation(r, s, "maud", makeEnv(r, s))).toBeNull();
    expect(personLocation(r, s, "hesper", makeEnv(r, s))).toBeNull();
    expect(personLocation(r, s, "kael", makeEnv(r, s))).toBe("market"); // later default still applies to others
  });

  test("a misspelt schedule place still warns and points at `away`", () => {
    const { issues } = load({ relationships: { people: { maud: { schedule: [{ at: "nowhere" }] } } } });
    expect(issues.find((i) => i.where.includes("maud › schedule"))?.message).toContain("at: away");
  });

  test("targets: limits a per-person action to those people; `target` works in when:", () => {
    const { r } = load();
    const s = initialState(r);
    const ids = availableChoices(r, s).map((c) => c.id);
    expect(ids).toContain("train@maud");
    expect(ids).toContain("train@kael");
    expect(ids).not.toContain("train@hesper");
    expect(ids).toContain("chat@maud");
    expect(ids).not.toContain("chat@hesper");
    expect(r.actions.train.perPerson).toBe(true);
    const rec = resolveTurn(r, s, { actionId: "train@hesper", via: "choice" }, { seed: "x" });
    expect(rec.hints[0]).toContain("isn't available");
  });

  test("targets: naming someone unknown warns", () => {
    const { issues } = load({ actions: { train: { label: "Train", targets: ["maud", "nobody"] } } });
    expect(issues.some((i) => i.where === "Actions › train › targets" && i.message.includes("nobody"))).toBe(true);
  });
});

describe("fronts", () => {
  const front = (stage: Record<string, unknown>) => load({
    flags: { ...BASE.flags, seized: false, spared: false },
    actions: { wait: { label: "Wait", effects: {} } },
    fronts: { purge: { per_turn: 50, stages: [{ at: 40, surface: "The purge comes.", ...stage }] } },
  });

  test("a stage's do: only happens when its if: holds; else: happens otherwise", () => {
    const st = { if: "not flag('maud_gone')", do: { flags: { seized: true } }, else: { flags: { spared: true } } };
    const { r, issues } = front(st);
    expect(issues).toEqual([]);
    let s = step(r, initialState(r), "wait");
    expect(s.fronts.purge.stage).toBe(0);
    expect(s.flags.seized).toBe(true);
    expect(s.flags.spared).toBe(false);
    let g = initialState(r);
    g.flags.maud_gone = true;
    g = step(r, g, "wait");
    expect(g.fronts.purge.stage).toBe(0);
    expect(g.flags.seized).toBe(false);
    expect(g.flags.spared).toBe(true);
  });

  test("when: is an alias for if:; else: without a condition warns", () => {
    const { r } = front({ when: "flag('maud_gone')", do: { flags: { seized: true } } });
    expect(step(r, initialState(r), "wait").flags.seized).toBe(false);
    expect(front({ else: { flags: { spared: true } } }).issues.some((i) => i.where.endsWith("› else"))).toBe(true);
  });

  test("a stage without if: behaves as before", () => {
    const { r } = front({ do: { flags: { seized: true } } });
    expect(step(r, initialState(r), "wait").flags.seized).toBe(true);
  });
});

describe("perks", () => {
  const perks = {
    points: "talent_points",
    pick: 2,
    knight: { name: "Knight", offer: "always", points: "class_points" },
    mage: { name: "Mage", offer: "always", points: "class_points", excludes: ["knight"] },
    a: { name: "A" }, b: { name: "B" }, c: { name: "C" }, d: { name: "D" },
  };

  test("offer: always perks sit beside the random pick and draw from their own points", () => {
    const { r, issues } = load({ perks });
    expect(issues).toEqual([]);
    let s = initialState(r);
    expect(perkOffers(r, s)).toEqual([]);
    s.stats.class_points = 1;
    expect(perkOffers(r, s)).toEqual(["knight", "mage"]); // no talent points: only the class choice
    s.stats.talent_points = 1;
    const offers = perkOffers(r, s);
    expect(offers.filter((x) => ["a", "b", "c", "d"].includes(x)).length).toBe(2);
    expect(offers.slice(-2)).toEqual(["knight", "mage"]);
    const ev = buyPerk(r, s, "knight");
    expect(Array.isArray(ev)).toBe(true);
    s = foldEvents(r, [ev as never], s);
    expect(s.stats.class_points).toBe(0);
    expect(s.stats.talent_points).toBe(1); // the talent pool is untouched
    expect(perkOffers(r, s)).not.toContain("mage"); // excluded now
    expect(perkBlocker(r, s, "mage")).toContain("Can't go with");
  });

  test("a perk's own pool must be a stat; offer: always without pick warns", () => {
    const bad = load({ perks: { points: "talent_points", x: { name: "X", points: "nope", offer: "sometimes" } } });
    expect(bad.issues.some((i) => i.where === "Perks › x › points")).toBe(true);
    expect(bad.issues.some((i) => i.where === "Perks › x › offer")).toBe(true);
    expect(bad.r.perks.x.points).toBeUndefined();
    const nopick = load({ perks: { points: "talent_points", x: { name: "X", offer: "always" } } });
    expect(nopick.issues.some((i) => i.where === "Perks › x › offer")).toBe(true);
  });
});
