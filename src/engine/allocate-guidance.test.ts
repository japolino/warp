import { expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { lintRuleset } from "./lint.js";
import { initialState } from "./state.js";
import { buildChoices } from "./view.js";
import { previewText } from "../tools/rulebook-tools.js";

const BASE = `stats:
  stat_points: { kind: attribute, start: 5, max: 99 }
  str: { kind: attribute, start: 5, max: 99 }
  money: { kind: money, start: 50 }
  smithing: { kind: skill, start: 0, max: 100 }
`;
const load = (extra: string) => loadRuleset([{ label: "t", order: 0, content: BASE + extra }]).ruleset!;

test("a button that only spends points on a stat is flagged: use allocate:", () => {
  const r = load(`actions:
  alloc_str: { label: "+1 STR", group: Status, time: 0, when: "stat_points >= 1", effects: { stat_points: -1, str: +1, hint: "[System] STR +1" } }
`);
  const w = lintRuleset(r).filter((i) => i.where === "Actions › alloc_str");
  expect(w).toHaveLength(1);
  expect(w[0].message).toContain("allocate: stat_points on str");
  expect(w[0].message).toContain("story turn");
});

test("real story actions that cost something are not flagged", () => {
  const r = load(`actions:
  forge: { label: Work the forge, check: { chance: 50 }, success: { money: +10 }, fail: { money: -2 } }
  lesson: { label: Pay for a smithing lesson, cost: { money: -20 }, effects: { smithing: +2, give: hammer } }
  study: { label: Study, effects: { smithing: +1 } }
items: { hammer: Hammer }
`);
  expect(lintRuleset(r).filter((i) => i.where.startsWith("Actions ›"))).toEqual([]);
});

test("allocate: replaces the buttons — no choices, a sidebar pool, and the preview says so", () => {
  const yaml = `stats:
  stat_points: { kind: attribute, label: Stat Points, start: 5, max: 99 }
  str: { kind: attribute, label: STR, start: 5, max: 99, allocate: stat_points }
  agi: { kind: attribute, label: AGI, start: 5, max: 99, allocate: stat_points }
actions: { rest: { label: Rest, effects: { str: +0 } } }
`;
  const r = loadRuleset([{ label: "t", order: 0, content: yaml }]).ruleset!;
  expect(lintRuleset(r).filter((i) => i.message.includes("allocate:"))).toEqual([]);
  expect(buildChoices(r, initialState(r), { lines: [], veils: [] }).some((c) => /STR|AGI/.test(c.label))).toBe(false);
  expect(previewText([yaml])).toContain("Spend Stat Points (5 now) with + beside: STR, AGI");
});
