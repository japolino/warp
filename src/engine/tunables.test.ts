import { describe, expect, test } from "bun:test";
import { practise, practiceKey, practiceRepetition } from "./freeform.js";
import { loadRuleset } from "./loader.js";
import type { TurnBuilder } from "./resolve.js";
import { DEFAULT_PRACTICE_REPEAT, type Ruleset } from "./ruleset.js";
import { applyEvent, initialState, type GameState, type WarpEvent } from "./state.js";

const BASE = `
name: Tunables
start: { location: room }
locations:
  room: { name: Room }
relationships:
  people:
    robin: { name: Robin, age: 25 }
stats:
  perception: { kind: skill, start: 0, max: 100 }
actions:
  look_around:
    check: { chance: "50 + perception / 10" }
`;

function load(extra = "") {
  const out = loadRuleset([{ label: "t", content: BASE + extra, order: 0 }]);
  if (!out.ruleset) throw new Error(JSON.stringify(out.issues));
  return { r: out.ruleset, warnings: out.issues.filter((i) => i.level === "warning") };
}

function practice(r: Ruleset, s: GameState, gain = 0.2) {
  const events: WarpEvent[] = [];
  const builder = { r, s, push(e: WarpEvent) { events.push(e); applyEvent(s, e, r); } } as TurnBuilder;
  practise(builder, { perception: gain }, "Checked practice", { actionId: "look_around" });
  return events;
}
const progress = (s: GameState) => s.stats.perception + (s.practice.perception ?? 0);
const mult = (r: Ruleset, s: GameState) => practiceRepetition(s, practiceKey(s, { actionId: "look_around" }), r.growth.repeat).multiplier;

describe("growth.repeat", () => {
  test("defaults equal the previous fixed constants", () => {
    const { r, warnings } = load();
    expect(warnings).toEqual([]);
    expect(r.growth.repeat).toEqual({ step: 0.5, floor: 0.1, recoverMinutes: 120, recoverTurns: 8 });
    expect(DEFAULT_PRACTICE_REPEAT).toEqual({ step: 0.5, floor: 0.1, recoverMinutes: 120, recoverTurns: 8 });
    for (const extra of ["growth: true\n", "growth: 2\n", "growth: { rate: 1 }\n"]) expect(load(extra).r.growth.repeat).toEqual(r.growth.repeat);
    const s = initialState(r);
    practice(r, s);
    expect(mult(r, s)).toBeCloseTo(1 / 1.5);
    // The two-argument call keeps its old meaning.
    expect(practiceRepetition(s, practiceKey(s, { actionId: "look_around" })).multiplier).toBeCloseTo(1 / 1.5);
  });

  test("custom step, floor and recovery change the taper", () => {
    const { r, warnings } = load("growth: { repeat: { step: 1, floor: 0.25, recover_minutes: 30, recover_turns: 3 } }\n");
    expect(warnings).toEqual([]);
    const s = initialState(r);
    practice(r, s);
    expect(mult(r, s)).toBeCloseTo(0.5);
    for (let i = 0; i < 10; i++) practice(r, s);
    expect(mult(r, s)).toBeCloseTo(0.25);
    s.minutes += 30;
    expect(mult(r, s)).toBe(1);
    s.minutes -= 30;
    s.turn += 3;
    expect(mult(r, s)).toBe(1);
  });

  test("zero recovery values turn that recovery path off", () => {
    const { r } = load("growth: { repeat: { recover_minutes: 0, recover_turns: 0 } }\n");
    const s = initialState(r);
    practice(r, s);
    s.minutes += 100000;
    s.turn += 1000;
    expect(mult(r, s)).toBeCloseTo(1 / 1.5);
  });

  test("repeat: false disables the taper and records no history", () => {
    for (const extra of ["growth: { repeat: false }\n", "growth: { repeat: { enabled: false } }\n"]) {
      const { r, warnings } = load(extra);
      expect(warnings).toEqual([]);
      expect(r.growth.repeat).toBe(false);
      const s = initialState(r);
      for (let i = 0; i < 5; i++) {
        const before = progress(s);
        const events = practice(r, s);
        expect(progress(s) - before).toBeCloseTo(0.2);
        expect(events.some((e) => e.t === "practice_use")).toBe(false);
      }
      expect(s.practiceUse).toEqual({});
    }
  });

  test("out-of-range and malformed values warn readably and clamp or fall back", () => {
    const { r, warnings } = load("growth: { repeat: { step: -1, floor: 2, recover_minutes: fast, recover_turns: 2.6, bogus: 1 } }\n");
    expect(r.growth.repeat).toEqual({ step: 0, floor: 1, recoverMinutes: 120, recoverTurns: 3 });
    const text = warnings.map((w) => `${w.where}: ${w.message}`).join("\n");
    expect(text).toContain("Growth › repeat › step: -1 is outside 0–10");
    expect(text).toContain("Growth › repeat › floor: 2 is outside 0–1");
    expect(text).toContain("Growth › repeat › recover_minutes");
    expect(text).toContain("Growth › repeat › bogus: unknown setting");
    const bad = load("growth: { repeat: often }\n");
    expect(bad.r.growth.repeat).toEqual(DEFAULT_PRACTICE_REPEAT);
    expect(bad.warnings.some((w) => w.where === "Growth › repeat")).toBe(true);
  });
});
