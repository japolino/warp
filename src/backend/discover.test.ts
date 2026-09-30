import { describe, expect, test } from "bun:test";
import { loadRuleset } from "../engine/loader.js";
import { foldEvents, initialState } from "../engine/state.js";
import { EXPLORE, resolveTurn } from "../engine/resolve.js";
import { buildChoices, buildMap } from "../engine/view.js";
import { placeYaml } from "./discover.js";

const YAML = `
name: Growing
clock: { start: "Mon 10:00" }
start: { location: docks }
locations:
  docks: { name: The Docks, exits: [town] }
  town: { name: Town, exits: [docks] }
discovery: { at: [docks], chance: 0, max: 2 }
`;
const r = loadRuleset([{ label: "t", content: YAML, order: 0 }]).ruleset!;

describe("a world that grows", () => {
  test("exploring rolls; each fruitless try raises the next chance by 10", () => {
    let s = initialState(r);
    expect(buildChoices(r, s, { lines: [], veils: [] }).some((c) => c.id === EXPLORE)).toBe(true);
    let found = false;
    for (let i = 0; i < 12 && !found; i++) {
      const rec = resolveTurn(r, s, { actionId: EXPLORE, via: "choice" }, { seed: `e${i}` });
      found = !!rec.discover;
      s = foldEvents(r, [rec.events], s);
    }
    expect(found).toBe(true);
    expect(s.explored.docks).toBe(0);
  });

  test("not everywhere: only where the ruleset allows", () => {
    const s = foldEvents(r, [[{ t: "move", to: "town", src: "manual" }]], initialState(r));
    expect(buildChoices(r, s, { lines: [], veils: [] }).some((c) => c.id === EXPLORE)).toBe(false);
  });

  test("a found place merges into the ruleset with an exit each way", () => {
    const yaml = placeYaml("docks", { id: "smugglers_cove", name: "Smugglers' Cove", desc: "A hidden inlet.", indoors: false });
    const grown = loadRuleset([{ label: "t", content: YAML, order: 0 }, { label: "warp-ruleset · discovered", content: yaml, order: 900 }]).ruleset!;
    expect(grown.locations.docks.name).toBe("The Docks");
    expect(grown.locations.docks.exits).toEqual(["town", "smugglers_cove"]);
    expect(grown.locations.smugglers_cove).toMatchObject({ name: "Smugglers' Cove", exits: ["docks"] });
    expect(buildMap(grown, initialState(grown))!.nodes.map((n) => n.id)).toContain("smugglers_cove");
  });
});
