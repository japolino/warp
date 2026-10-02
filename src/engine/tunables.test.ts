import { describe, expect, test } from "bun:test";
import { practise, practiceKey, practiceRepetition } from "./freeform.js";
import { loadRuleset } from "./loader.js";
import { resolveTurnFull, type TurnBuilder } from "./resolve.js";
import { DEFAULT_PRACTICE_REPEAT, type Ruleset } from "./ruleset.js";
import { applyEvent, foldEvents, initialState, type GameState, type WarpEvent } from "./state.js";
import { recentCount, restedFatigue, SOCIAL_KEYS_KEPT, SOCIAL_RECOVERY_MINUTES } from "./date/memory.js";
import { DEFAULT_SOCIAL_MEMORY } from "./date/types.js";

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

describe("dating.memory", () => {
  const recent = (key: string, at: number, count = 1, fatigue = 0): WarpEvent => ({ t: "dt_recent", who: "robin", key, at, count, fatigue, src: "action" });

  test("defaults equal the previous fixed constants", () => {
    const { r, warnings } = load("dating: true\n");
    expect(warnings).toEqual([]);
    expect(r.dating.memory).toEqual({ recoveryMinutes: 240, keys: 64, restPerMinute: 1 });
    expect(SOCIAL_RECOVERY_MINUTES).toBe(240);
    expect(SOCIAL_KEYS_KEPT).toBe(64);
    expect(DEFAULT_SOCIAL_MEMORY).toEqual({ recoveryMinutes: 240, keys: 64, restPerMinute: 1 });
    let s = initialState(r);
    s = foldEvents(r, [[recent("music", s.minutes, 1, 60)]], s);
    s.minutes += 120;
    expect(recentCount(s, "robin", "music", r.dating.memory)).toBeCloseTo(0.5);
    expect(recentCount(s, "robin", "music")).toBeCloseTo(0.5);
    expect(restedFatigue(s, "robin", r.dating.memory)).toBe(0);
  });

  test("custom recovery, rest rate and key cap apply to reads and the reducer", () => {
    const { r, warnings } = load("dating: { memory: { recovery_minutes: 60, keys: 3, rest_per_minute: 0.25 } }\n");
    expect(warnings).toEqual([]);
    let s = initialState(r);
    const t0 = s.minutes;
    s = foldEvents(r, [[recent("a", t0), recent("b", t0), recent("c", t0), recent("d", t0, 1, 40)]], s);
    expect(Object.keys(s.dating.recent!.robin.topics)).toEqual(["b", "c", "d"]);
    s.minutes += 30;
    expect(recentCount(s, "robin", "d", r.dating.memory)).toBeCloseTo(0.5);
    expect(restedFatigue(s, "robin", r.dating.memory)).toBeCloseTo(32.5);
    s = foldEvents(r, [[recent("e", t0 + 60)]], s);
    expect(Object.keys(s.dating.recent!.robin.topics)).toEqual(["e"]);
  });

  test("out-of-range and malformed values warn readably", () => {
    const { r, warnings } = load("dating: { memory: { recovery_minutes: 0, keys: 9999, rest_per_minute: -2, extra: 1 } }\n");
    expect(r.dating.memory).toEqual({ recoveryMinutes: 1, keys: 512, restPerMinute: 0 });
    const text = warnings.map((w) => `${w.where}: ${w.message}`).join("\n");
    expect(text).toContain("Dating › memory › recovery_minutes: 0 is outside 1–525600");
    expect(text).toContain("Dating › memory › keys: 9999 is outside 1–512");
    expect(text).toContain("Dating › memory › rest_per_minute: -2 is outside 0–100");
    expect(text).toContain("Dating › memory › extra: unknown setting");
    const bad = load("dating: { memory: 5 }\n");
    expect(bad.r.dating.memory).toEqual(DEFAULT_SOCIAL_MEMORY);
    expect(bad.warnings.some((w) => w.where === "Dating › memory")).toBe(true);
  });
});

describe("dating.memory through the talk path", () => {
  test("reopening a talk uses the tuned rest rate and recovery", () => {
    const yaml = `\ndating:\n  memory: { recovery_minutes: 1000, rest_per_minute: 0.1 }\n  people:\n    robin: { loves: [music] }\n`;
    const out = loadRuleset([{ label: "t", content: BASE.replace("start: { location: room }", "start: { location: room }\nclock: { start: \"Mon 10:00\" }") + yaml, order: 0 }]);
    const r = out.ruleset!;
    const go = (s: GameState, actionId: string) => foldEvents(r, [resolveTurnFull(r, s, { actionId, via: "choice" }, { seed: "s1" }).record.events], s);
    let s = initialState(r);
    s = foldEvents(r, [[{ t: "dt_recent", who: "robin", key: "music", at: s.minutes, count: 1, fatigue: 70, src: "action" }, { t: "time", min: 240, src: "action" }]], s);
    const reopened = go(s, "date:talk@robin");
    expect(reopened.date?.who).toBe("robin");
    expect(reopened.date!.fatigue).toBeCloseTo(46);
    expect(recentCount(reopened, "robin", "music", r.dating.memory)).toBeGreaterThan(0.7);
  });
});
