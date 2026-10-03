// Checker gaps found by rebuilding SimCore templates: things that load but silently do nothing (warnings only).

import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { lintRuleset } from "./lint.js";

const issuesOf = (yaml: string) => {
  const { ruleset, issues } = loadRuleset([{ label: "t", content: yaml, order: 0 }]);
  return [...issues, ...(ruleset ? lintRuleset(ruleset) : [])].map((i) => `${i.where}: ${i.message}`);
};
const has = (list: string[], where: string, words: RegExp) => list.some((l) => l.startsWith(where) && words.test(l));

describe("keys a block doesn't read (ADVENTURE-4, PRESSURE-6)", () => {
  test("stats, people and triggers warn like actions do", () => {
    const out = issuesOf(`style: story
stats:
  hp: { kind: meter, init: 50, maxDelta: 15 }
relationships:
  stats: { regard: { start: 20 } }
  people: { jo: { name: Jo, init: { regard: 70 } } }
triggers:
  t1: { when: "hp < 10", once: true, notify: "Low!", do: { hp: 1 } }
  t2: { when: "1", repat: true, do: { hp: 1 } }
`);
    expect(has(out, "Stats › hp › init", /isn't something this block reads/)).toBe(true);
    expect(has(out, "Stats › hp › maxDelta", /does nothing/)).toBe(true);
    expect(has(out, "Relationships › people › jo › init", /does nothing/)).toBe(true);
    expect(has(out, "Triggers › t1 › once", /does nothing/)).toBe(true);
    expect(has(out, "Triggers › t1 › notify", /does nothing/)).toBe(true);
    expect(has(out, "Triggers › t2 › repat", /did you mean "repeat"/)).toBe(true);
  });
});

describe("a start outside min..max (CREW-3, LIFE-2)", () => {
  test("is clamped with a warning", () => {
    const out = issuesOf(`style: story
stats:
  food: { kind: attribute, start: 500 }
  stamp: { kind: hidden, start: -99 }
  ok: { kind: meter, start: 40 }
`);
    expect(has(out, "Stats › food › start", /outside 0–100/)).toBe(true);
    expect(has(out, "Stats › stamp › start", /outside 0–100/)).toBe(true);
    expect(out.some((l) => l.startsWith("Stats › ok"))).toBe(false);
  });
});
