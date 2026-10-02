// The sidebar files stats and perks under headings, keeps point pools out of the stat rows,
// folds perks you can't have yet, and drops roads not taken.
import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { initialState } from "./state.js";
import { buildHud } from "./view.js";
import { renderHud } from "../frontend/render.js";

const load = (y: string) => {
  const x = loadRuleset([{ label: "t", order: 0, content: y }]);
  return { r: x.ruleset!, warns: x.issues.map((i) => `${i.where}: ${i.message}`) };
};

const BOOK = `stats:
  level: { kind: attribute, start: 1, max: 100, group: Level }
  tier: { kind: attribute, start: 1, max: 5, bands: { 1: Iron, 2: Bronze }, group: Level }
  stat_points: { kind: attribute, start: 3, max: 99 }
  perk_points: { kind: attribute, start: 1, max: 99 }
  str: { kind: attribute, start: 5, max: 99, allocate: stat_points }
  agi: { kind: attribute, start: 5, max: 99, allocate: stat_points }
  atk: { kind: attribute, start: 20, max: 999, group: Combat }
  blades: { kind: skill, start: 10, max: 100 }
perks:
  points: perk_points
  warrior: { name: Warrior, group: Classes, requires: "level >= 10", excludes: [rogue] }
  rogue: { name: Rogue, group: Classes, requires: "level >= 10", excludes: [warrior] }
  assassin: { name: Assassin, group: Advanced classes, requires: "tier >= 2 and perk('rogue')" }
  berserker: { name: Berserker, group: Advanced classes, requires: "tier >= 2 and perk('warrior')" }
  gravewalker: { name: Gravewalker, group: Hidden, requires: "flag('pact')", hidden: true }
  tough: { name: Tough, group: Talents }
  saint: { name: Sword Saint, group: Evolutions, requires: "level >= 5 and quest_done('trial')" }
quests:
  trial: { name: The Trial, hidden: true, goals: ["level >= 50"] }
flags: { pact: { start: false } }
`;

describe("stats under headings", () => {
  test("group: files stats; the rest go under Attributes or Skills; pools don't take a row", () => {
    const { r, warns } = load(BOOK);
    expect(warns).toEqual([]);
    const h = buildHud(r, initialState(r));
    expect(h.skills.map((x) => `${x.group}:${x.id}`)).toEqual(["Level:level", "Level:tier", "Attributes:str", "Attributes:agi", "Combat:atk", "Skills:blades"]);
    const html = renderHud(h, { editing: null, compact: false });
    for (const g of ["Level", "Attributes", "Combat", "Skills"]) expect(html).toContain(`<div class="warp-group-head">${g}</div>`);
    // The points to spend sit on the Attributes heading, before STR.
    expect(html.indexOf("to spend")).toBeGreaterThan(html.indexOf(">Attributes<"));
    expect(html.indexOf("to spend")).toBeLessThan(html.indexOf("data-alloc-add=\"str\""));
  });

  test("a book with one kind and no group: renders as before, with no headings", () => {
    const { r } = load(`stats: { str: { kind: attribute, start: 5 }, dex: { kind: attribute, start: 5 } }`);
    expect(renderHud(buildHud(r, initialState(r)), { editing: null, compact: false })).not.toContain("warp-group-head");
  });

  test("a bad group warns", () => {
    expect(load(`stats: { str: { kind: attribute, group: [a] } }`).warns.some((w) => /group/.test(w))).toBe(true);
  });
});

describe("perks: what you can have, what's later, what's gone", () => {
  test("at the start: talents open, classes folded with what they need, the secret class absent", () => {
    const { r } = load(BOOK);
    const h = buildHud(r, initialState(r));
    const by = Object.fromEntries(h.perks.map((p) => [p.id, p]));
    expect(by.gravewalker).toBeUndefined();
    expect(by.tough.locked).toBe(false);
    expect(by.warrior.needs).toBe("Level 10+");
    expect(by.assassin.needs).toBe("Tier: Bronze, Rogue");
    const html = renderHud(h, { editing: null, compact: false });
    expect(by.saint.needs).toBe("Level 5+, and more"); // a hidden quest isn't named before it turns up
    expect(html).toContain("Not yet · 5");
    expect(html).toContain("Needs Level 10+");
  });

  test("once a class is taken, the other class and its branch drop out", () => {
    const { r } = load(BOOK);
    const s = initialState(r);
    s.stats.level = 10;
    s.perks.warrior = true as any;
    const ids = buildHud(r, s).perks.map((p) => p.id);
    expect(ids).toContain("berserker");
    expect(ids).not.toContain("rogue");
    expect(ids).not.toContain("assassin");
  });

  test("a hidden perk turns up when its requirement holds", () => {
    const { r } = load(BOOK);
    const s = initialState(r);
    s.flags.pact = true;
    const g = buildHud(r, s).perks.find((p) => p.id === "gravewalker")!;
    expect(g.locked).toBe(false);
  });
});
