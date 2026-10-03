// The builder and Warp Studio write against REFERENCE; the engine reads the ruleset. If the engine learns a field the
// reference doesn't mention, a model can never use it; if the reference names a removed system, a model will write it.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { DESIGN_GUIDE, PART_CONTENTS, PART_LABELS, PART_OF_KEY, REFERENCE, partForIssue } from "./reference.js";
import { REMOVED_EFFECT_NAMES, REMOVED_KEYS, TOP_LEVEL_KEYS } from "./ruleset.js";
import { REMOVED_FORMULA_NAMES } from "./lint.js";
import { splitRulebook } from "./rulebook.js";
import { loadRuleset } from "./loader.js";
import { lintRuleset } from "./lint.js";
import { TEMPLATES } from "./templates/index.js";
import { runLoopSim } from "./loop-sim.js";

/** Aliases the normalizer accepts for older or alternative spellings (not taught). */
const ALIASES = new Set(["improvise", "improvised", "people", "player", "practice", "rules"]);
const mentions = (k: string) => new RegExp(`(^|[\\s{,(])${k}:`, "m").test(REFERENCE);

describe("the format reference (format 2)", () => {
  test("parts: core, stats, people, world, actions, story, conflict; every key has a part, and every part says what it holds", () => {
    expect([...PART_LABELS]).toEqual(["core", "stats", "people", "world", "actions", "story", "conflict"]);
    for (const k of TOP_LEVEL_KEYS) expect(PART_LABELS).toContain(PART_OF_KEY[k]);
    for (const l of PART_LABELS) {
      const keys = Object.entries(PART_OF_KEY).filter(([k, p]) => p === l && !ALIASES.has(k)).map(([k]) => k);
      for (const k of keys) expect(PART_CONTENTS[l]).toContain(k);
    }
    // Both templates are written in these parts.
    for (const t of TEMPLATES) for (const p of t.parts) expect(PART_LABELS).toContain(p.label as never);
  });

  test("mentions every top-level key the engine reads", () => {
    const src = readFileSync(new URL("./ruleset.ts", import.meta.url), "utf8");
    const body = src.slice(src.indexOf("export function normalizeRuleset"));
    const keys = [...new Set([...body.matchAll(/raw\.([a-z_]+)/g)].map((m) => m[1]))].filter((k) => !ALIASES.has(k));
    expect(keys.filter((k) => !mentions(k))).toEqual([]);
    expect(TOP_LEVEL_KEYS.filter((k) => !mentions(k))).toEqual([]);
  });

  test("mentions every effect key", () => {
    const src = readFileSync(new URL("./ruleset.ts", import.meta.url), "utf8");
    const fn = src.slice(src.indexOf("export function normEffect"), src.indexOf("function normCheck"));
    const EFFECT_ALIASES = new Set(["change", "flag", "relationships", "move", "go", "location", "minutes", "add_conditions", "condition", "remove_conditions", "cure", "narrate", "text", "momentum", "looks", "goals", "memory"]);
    const keys = [...new Set([...fn.matchAll(/case "([a-z_]+)"/g)].map((m) => m[1]))].filter((k) => !EFFECT_ALIASES.has(k));
    expect(keys.filter((k) => !REFERENCE.includes(`${k}:`))).toEqual([]);
  });

  test("teaches no removed key, effect, formula or check style", () => {
    // The closing "not in Warp any more" list names them on purpose; the rest of the text must not use them.
    const taught = REFERENCE.slice(0, REFERENCE.indexOf("NOT IN WARP ANY MORE"));
    for (const k of Object.keys(REMOVED_KEYS)) expect(taught).not.toMatch(new RegExp(`^${k}:`, "m"));
    for (const k of REMOVED_EFFECT_NAMES) if (k !== "body") expect(taught).not.toMatch(new RegExp(`[\\s{,]${k}: `));
    for (const name of REMOVED_FORMULA_NAMES) if (!["date", "body", "location", "reveal"].includes(name)) expect(taught).not.toMatch(new RegExp(`\\b${name}\\(`));
    for (const k of ["chance:", "pbta", "improvise:", "start_encounter", "end_when", "foe_moves", "quest_done", "in_encounter"]) expect(taught).not.toContain(k);
  });

  test("its example is a working ruleset: every part loads with no errors", () => {
    const parts = splitRulebook(REFERENCE.slice(REFERENCE.indexOf("--- # core"), REFERENCE.indexOf("EFFECTS (")));
    expect(parts.map((p) => p.label)).toEqual([...PART_LABELS]);
    const { ruleset, issues } = loadRuleset(parts.map((p, i) => ({ label: `warp-ruleset · ${p.label}`, content: p.yaml, order: i })));
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(issues).toEqual([]);
    expect(lintRuleset(ruleset!)).toEqual([]);
    expect(ruleset!.style).toBe("adventure");
    expect(Object.keys(ruleset!.conflict.kinds)).toEqual(["fight", "argument"]);
    expect(ruleset!.secrets.past.stages.length).toBe(3);
  });

  test("issues land in the part they belong to", () => {
    expect(partForIssue("Live choices › tags › charm › success")).toBe("story");
    expect(partForIssue("Goals › find_sister")).toBe("story");
    expect(partForIssue("Triggers › drain")).toBe("story");
    expect(partForIssue("Secrets › past › stage 1")).toBe("story");
    expect(partForIssue("Checks › stats")).toBe("stats");
    expect(partForIssue("Growth › repeat › step")).toBe("stats");
    expect(partForIssue("Relationships › people › jo › age")).toBe("people");
    expect(partForIssue("You › outfit")).toBe("people");
    expect(partForIssue("Items › rope")).toBe("world");
    expect(partForIssue("Conditions › exhausted")).toBe("world");
    expect(partForIssue("Actions › rest › effects")).toBe("actions");
    expect(partForIssue("Conflict › kinds › fight › stats")).toBe("conflict");
    expect(partForIssue("Clock › start")).toBe("core");
    expect(partForIssue("Encounters")).toBe("core");
    expect(partForIssue("warp-ruleset · people, line 3")).toBe("people");
  });

  test("the design guide covers the core, not removed systems", () => {
    for (const topic of ["the core loop", "stats", "people", "checks", "choices", "conflict", "goals", "secrets", "items", "conditions", "money"]) expect(DESIGN_GUIDE).toContain(`## ${topic}`);
    for (const gone of ["## encounters", "## quests", "## places", "notice board", "foe_moves"]) expect(DESIGN_GUIDE).not.toContain(gone);
  });
});

describe("the README's example ruleset", () => {
  test("loads with no issues and passes every loop-simulator gate", () => {
    const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
    const yaml = /```yaml\n([\s\S]*?)```/.exec(readme)![1];
    const parts = splitRulebook(yaml);
    expect(parts.map((p) => p.label)).toEqual(["core", "stats", "people", "world", "actions", "story", "conflict"]);
    const { ruleset, issues } = loadRuleset(parts.map((p, i) => ({ label: p.label, content: p.yaml, order: i })));
    expect([...issues, ...lintRuleset(ruleset!)]).toEqual([]);
    const report = runLoopSim(ruleset!, { turns: 50, seeds: 20, contestRuns: 300 });
    expect(report.gates.filter((g) => !g.pass).map((g) => `${g.id}: ${g.value}`)).toEqual([]);
  });
});
