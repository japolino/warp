// A whole rulebook as one file: Warp Studio imports and exports with these functions (Warp no longer does).

import { describe, expect, test } from "bun:test";
import { joinRulebook, splitRulebook } from "./rulebook.js";
import { TEMPLATES } from "./templates/index.js";

describe("one rulebook file ⇄ sections", () => {
  test("each template's parts survive a round trip, and the header points to Warp Studio", () => {
    for (const t of TEMPLATES) {
      const text = joinRulebook(t.parts, t.name);
      expect(text).toContain("Warp Studio");
      expect(text).not.toContain("Warp → Ruleset → Import");
      expect(splitRulebook(text)).toEqual(t.parts.map((p) => ({ label: p.label, yaml: `${p.yaml.trim()}\n` })));
    }
  });

  test("a plain file is cut at its top-level keys into the format-2 parts, in order", () => {
    const parts = splitRulebook("conflict: {}\nname: X\nchecks: { typed: true }\nyou: { name: Sam }\nitems: {}\ngoals: { max: 2 }\nactions: {}\n");
    expect(parts.map((p) => p.label)).toEqual(["core", "stats", "people", "world", "actions", "story", "conflict"]);
  });
});
