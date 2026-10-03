import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { namesIt, namesTitle } from "./mention.js";
import { initialState } from "./state.js";
import { stateDigest } from "./view.js";

const r = loadRuleset([{ label: "t", content: `
name: City
clock: { start: "Mon 09:00" }
start: { location: square, items: { phone: 1, grimoire: 1, soothing: 2, energy: 2 } }
locations: { square: { name: City square, board: true } }
items:
  phone: Phone
  grimoire: City grimoire
  soothing: Soothing potion
  energy: Energy potion
stats:
  energy_m: { kind: meter, label: Energy, start: 80, bands: { 0: Spent, 50: Fresh } }
  money: { kind: money, start: 100 }
  allure: { kind: attribute, max: 10, start: 3 }
quests:
  parcel: { name: A parcel across the city, board: true, goals: [ { text: Deliver it } ] }
  nectar: { name: Nectar for Tsukiko, board: true, goals: [ { text: Bring nectar } ] }
`, order: 0 }]).ruleset!;

describe("the narrator's block names only what the turn is about", () => {
  test("names: a shared head noun or a common word isn't enough", () => {
    expect(namesIt("I uncap the soothing potion", "Soothing potion", ["Energy potion"])).toBe(true);
    expect(namesIt("I uncap the soothing potion", "Energy potion", ["Soothing potion"])).toBe(false);
    expect(namesIt("I drink a potion", "Energy potion")).toBe(true);
    expect(namesIt("the tram to the city square", "City grimoire")).toBe(false);
    expect(namesTitle("the tram to the city square", "A parcel across the city")).toBe(false);
    expect(namesTitle("I ask Tsukiko about the nectar", "Nectar for Tsukiko")).toBe(true);
  });

  test("a plain turn: no bag contents, no board, no skill sheet, no ordinary meters", () => {
    const s = initialState(r);
    const d = stateDigest(r, s, { text: "I take the tram to the city square and look around." });
    expect(d).toContain("City square");
    expect(d).not.toContain("Posted on the notice board");
    expect(d).not.toMatch(/Soothing|Grimoire|Phone/i);
    expect(d).toContain("Carrying 4 things, none in play");
    expect(d).not.toContain("Energy:");
    expect(d).not.toContain("Allure");
    expect(d).not.toContain("Money");
    // The helpers still get everything.
    const full = stateDigest(r, s);
    expect(full).toContain("Posted on the notice board");
    expect(full).toContain("Soothing potion");
  });

  test("what the turn brings up comes in: the board, the item, money, a skill, a meter that changed", () => {
    const s = initialState(r);
    expect(stateDigest(r, s, { text: "I read the notice board." })).toContain('"Nectar for Tsukiko"');
    const potion = stateDigest(r, s, { text: "I sniff the soothing potion." });
    expect(potion).toContain("Carrying: Soothing potion ×2 (and 3 other things");
    expect(stateDigest(r, s, { text: "How much does it cost?" })).toContain("Money");
    expect(stateDigest(r, s, { text: "I turn on the allure." })).toContain("Allure");
    s.stats.energy_m = 20;
    expect(stateDigest(r, s, { text: "" })).toContain("Energy: Spent");
  });
});
