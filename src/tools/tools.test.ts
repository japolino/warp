// Rulebooks written outside Lumiverse: one file split into Warp's sections and
// joined back without losing anything, the checker's report, and the guide kept
// in step with the format reference.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { joinRulebook, splitRulebook } from "../engine/rulebook.js";
import { TEMPLATES } from "../engine/templates/index.js";
import { checkReport, checkText, guideMarkdown, previewText, simulateText, templateText } from "./rulebook-tools.js";

describe("one file ↔ sections", () => {
  test("an exported rulebook imports back into the same sections", () => {
    for (const t of TEMPLATES) {
      const back = splitRulebook(joinRulebook(t.parts, t.name));
      expect(back.map((p) => p.label)).toEqual(t.parts.map((p) => p.label));
      back.forEach((p, i) => expect(p.yaml.trim()).toBe(t.parts[i].yaml.trim()));
    }
  });

  test("a plain file is cut at its top-level keys, comments travel with the key below them", () => {
    const parts = splitRulebook([
      "name: Test", "stats:", "  hp: { kind: meter }", "", "# Where things happen", "locations:", "  home: { name: Home }",
      "quests:", "  q: { name: Q, board: true }", "actions:", "  rest: { label: Rest }", "encounters:", "  e: { name: E }",
    ].join("\n"));
    expect(parts.map((p) => p.label)).toEqual(["core", "stats", "world", "actions", "encounters", "quests"]);
    expect(parts.find((p) => p.label === "world")!.yaml).toBe("# Where things happen\nlocations:\n  home: { name: Home }\n");
  });
});

describe("the checker", () => {
  test("every shipped template comes out clean", () => {
    for (const t of TEMPLATES) {
      const rep = checkReport([templateText(t.id)!]);
      expect({ t: t.id, ok: rep.ok, warnings: rep.warnings, balance: rep.balance }).toEqual({ t: t.id, ok: true, warnings: [], balance: [] });
      expect(rep.gaps.filter((g) => g.severity === "gap")).toEqual([]);
    }
  }, 30000);

  test("it says what's wrong, where, and how to fix it", () => {
    const rep = checkReport(["name: Broken\nstats:\n  hp: { kind: meter, good: high }\nlocations:\n  a: { name: A, exits: [b] }\n  b: { name: B, exits: [a] }\n  c: { name: C, exits: [a] }\nactions:\n  hit: { label: Hit, effects: { hpp: -1, quest: { nope: start } } }\n"]);
    const text = checkText(rep);
    expect(rep.ok).toBe(true);
    expect(text).toContain('"hpp" isn\'t a stat or a known effect');
    expect(text).toContain('"nope" isn\'t a quest');
    expect(text).toContain("There's no notice board");
    expect(checkReport(["stats: [oops"]).ok).toBe(false);
  });

  test("simulate and preview read the same file", () => {
    const qb = templateText("questbound")!;
    expect(simulateText([qb], "wolves", 50)).toMatch(/The Wolf Pack \(wolves\) — ends well \d+%/);
    const p = previewText([qb]);
    expect(p).toContain("SIDEBAR AT THE START");
    expect(p).toContain("WHAT THE NARRATOR IS TOLD");
  });
});

test("docs/RULEBOOK_GUIDE.md is the generated guide (run `bun run guide` after changing the reference)", () => {
  expect(readFileSync(new URL("../../docs/RULEBOOK_GUIDE.md", import.meta.url), "utf8")).toBe(guideMarkdown());
});
