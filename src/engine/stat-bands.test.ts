import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { initialState } from "./state.js";
import { buildHud } from "./view.js";

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
