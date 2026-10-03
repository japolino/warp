// The builder writes against REFERENCE; the engine reads the ruleset. If the engine
// learns a field the reference doesn't mention, a model can never use it.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { DESIGN_GUIDE, REFERENCE } from "./reference.js";

/** Aliases the normalizer accepts for older or alternative spellings. */
const ALIASES = new Set(["debts", "events", "improvised", "inventory", "people", "practice", "rules"]);

describe("the builder's reference", () => {
  test("mentions every top-level field the engine reads", () => {
    const src = readFileSync(new URL("./ruleset.ts", import.meta.url), "utf8");
    const body = src.slice(src.indexOf("export function normalizeRuleset"));
    const keys = [...new Set([...body.matchAll(/raw\.([a-z_]+)/g)].map((m) => m[1]))].filter((k) => !ALIASES.has(k));
    const missing = keys.filter((k) => !new RegExp(`(^|\n|[\s{,])${k}:`).test(REFERENCE));
    expect(missing).toEqual([]);
  });

  test("mentions every effect key", () => {
    const src = readFileSync(new URL("./ruleset.ts", import.meta.url), "utf8");
    const fn = src.slice(src.indexOf("export function normEffect"), src.indexOf("function normCheck"));
    const EFFECT_ALIASES = new Set(["flag", "minutes", "add_conditions", "remove_conditions", "cure", "end_encounter", "put_on", "take_off", "events_gauge", "afflict", "status", "quests", "memory"]);
    const keys = [...new Set([...fn.matchAll(/case "([a-z_]+)"/g)].map((m) => m[1]))].filter((k) => !EFFECT_ALIASES.has(k));
    const missing = keys.filter((k) => !REFERENCE.includes(`${k}:`) && !REFERENCE.includes(`${k} `));
    expect(missing).toEqual([]);
  });

  test("carries design guidance, not just syntax", () => {
    for (const topic of ["items", "encounters", "stats", "places", "people", "money", "conditions"]) expect(DESIGN_GUIDE).toContain(`## ${topic}`);
  });
});
