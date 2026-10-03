// The sidebar files stats under headings.
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
  str: { kind: attribute, start: 5, max: 99 }
  agi: { kind: attribute, start: 5, max: 99 }
  atk: { kind: attribute, start: 20, max: 999, group: Combat }
  blades: { kind: skill, start: 10, max: 100 }
`;

describe("stats under headings", () => {
  test("group: files stats; the rest go under Attributes or Skills", () => {
    const { r, warns } = load(BOOK);
    expect(warns).toEqual([]);
    const h = buildHud(r, initialState(r));
    expect(h.skills.map((x) => `${x.group}:${x.id}`)).toEqual(["Level:level", "Level:tier", "Attributes:str", "Attributes:agi", "Combat:atk", "Skills:blades"]);
    const html = renderHud(h, { editing: null, compact: false });
    for (const g of ["Level", "Attributes", "Combat", "Skills"]) expect(html).toContain(`<div class="warp-group-head">${g}</div>`);
  });

  test("a book with one kind and no group: renders as before, with no headings", () => {
    const { r } = load(`stats: { str: { kind: attribute, start: 5 }, dex: { kind: attribute, start: 5 } }`);
    expect(renderHud(buildHud(r, initialState(r)), { editing: null, compact: false })).not.toContain("warp-group-head");
  });

  test("a bad group warns", () => {
    expect(load(`stats: { str: { kind: attribute, group: [a] } }`).warns.some((w) => /group/.test(w))).toBe(true);
  });
});
