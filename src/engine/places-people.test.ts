// Places, people and world gates: per-person targets and per-place indoor temperature.

import { describe, expect, test } from "bun:test";
import { lintRuleset } from "./lint.js";
import { normalizeRuleset } from "./ruleset.js";
import { availableChoices, resolveTurn } from "./resolve.js";
import { foldEvents, initialState, makeEnv, type GameState } from "./state.js";
import { presentPeople, temperatureAt } from "./world.js";

const BASE = {
  clock: { start: "Mon 08:00", date: "Jan 10" },
  start: { location: "market" },
  weather: { temps: { winter: 2 }, indoors: 18 },
  stats: {
    level: { kind: "attribute", start: 1, max: 99 },
    gold: { kind: "money", start: 0 },
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
      maud: { name: "Maud" },
      hesper: { name: "Mother Hesper" },
      kael: { name: "Kael" },
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
const here = (r: ReturnType<typeof load>["r"], s: GameState) => presentPeople(r, s);
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
  test("schedules and per-person traits were removed: they warn, and presence follows the story", () => {
    const { r, issues } = load({ relationships: { people: { maud: { name: "Maud", schedule: [{ at: "market" }], traits: ["shy"] } } } });
    const gone = issues.filter((i) => i.message.includes("was removed from Warp")).map((i) => i.where).sort();
    expect(gone).toEqual(["Relationships › people › maud › schedule", "Relationships › people › maud › traits"]);
    expect(Object.keys(r.people.maud).sort()).toEqual(["age", "desc", "id", "name", "start"]);
    expect(here(r, initialState(r))).toEqual([]);
  });

  test("targets: limits a per-person action to those people; `target` works in when:", () => {
    const { r } = load();
    const s = initialState(r);
    for (const id of ["maud", "hesper", "kael"]) s.scene[id] = { here: true, loc: s.location, at: s.minutes };
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

