import { describe, expect, test } from "bun:test";
import { checkGains, practise, practiceKey, practiceRepetition, trainingGain } from "./freeform.js";
import { loadRuleset } from "./loader.js";
import { applyProposal, resolveTurnFull, type TurnBuilder } from "./resolve.js";
import { applyEvent, foldEvents, initialState, type GameState, type WarpEvent } from "./state.js";

const r = loadRuleset([{ label: "practice", order: 0, content: `
name: Practice
start: { place: Room }
stats:
  perception: { kind: skill, start: 0, max: 100 }
  focus: { kind: attribute, start: 0, max: 10 }
actions:
  look_around:
    check: { vs: 11, add: "perception / 10" }
  listen:
    check: { vs: 11, add: "perception / 10" }
` }]).ruleset!;

function practice(s: GameState, actionId = "look_around", gain = 0.2) {
  const events: WarpEvent[] = [];
  const builder = { r, s, push(e: WarpEvent) { events.push(e); applyEvent(s, e, r); } } as TurnBuilder;
  practise(builder, { perception: gain }, "Checked practice", { actionId });
  return events;
}
const progress = (s: GameState) => s.stats.perception + (s.practice.perception ?? 0);

describe("checked practice repetition", () => {
  test("same look_around in the same scene diminishes without eliminating learning", () => {
    const s = initialState(r);
    practice(s);
    expect(progress(s)).toBeCloseTo(0.2);
    const before = progress(s);
    practice(s);
    expect(progress(s) - before).toBeCloseTo(0.2 / 1.5);
    for (let i = 0; i < 200; i++) practice(s);
    const repeated = practiceRepetition(s, practiceKey(s, { actionId: "look_around" }));
    expect(repeated.multiplier).toBe(0.1);
    expect(repeated.n).toBe(100);
  });

  test("different action, location, participants and contest are fresh opportunities", () => {
    const s = initialState(r);
    practice(s);
    for (const change of [
      () => practice(s, "listen"),
      () => { s.location = "garden"; practice(s); },
      () => { s.scene.friend = { here: true, loc: "garden", at: 0 }; practice(s); },
      () => { s.contest = { kind: "fight", opponent: "Duelist", threat: "fair", dc: 12, round: 0, momentum: 0, at: 1 }; practice(s); },
    ]) {
      const before = progress(s);
      change();
      expect(progress(s) - before).toBeCloseTo(0.2);
    }
  });

  test("returning immediately to an old action does not bypass diminishing; breaks recover", () => {
    const s = initialState(r);
    practice(s);
    practice(s, "listen");
    expect(practiceRepetition(s, practiceKey(s, { actionId: "look_around" })).multiplier).toBeLessThan(1);
    s.minutes += 120;
    const before = progress(s);
    practice(s);
    expect(progress(s) - before).toBeCloseTo(0.2);
    s.turn += 8;
    expect(practiceRepetition(s, practiceKey(s, { actionId: "look_around" })).multiplier).toBe(1);
  });

  test("cosmetic and resistance params cannot reset practice; improvised difficulty is canonical", () => {
    const s = initialState(r);
    const key = practiceKey(s, { actionId: "look_around" });
    expect(practiceKey(s, { actionId: "look_around", params: { label: "new", mind_resist: "yes" } })).toBe(key);
    expect(practiceKey(s, { actionId: "try:focus", params: { difficulty: "invalid" } }))
      .toBe(practiceKey(s, { actionId: "try:focus", params: { difficulty: "fair" } }));
    expect(practiceKey(s, { actionId: "try:focus", params: { difficulty: "hard" } }))
      .not.toBe(practiceKey(s, { actionId: "try:focus", params: { difficulty: "fair" } }));
  });

  test("failures and critical failures still teach", () => {
    const s = initialState(r);
    expect(checkGains(r, s, ["perception"], 1, "fail").perception).toBeGreaterThan(0);
    const failed = checkGains(r, s, ["perception"], 1, "crit_fail").perception;
    for (let i = 0; i < 30; i++) practice(s, "look_around", 0.01);
    const before = progress(s);
    practice(s, "look_around", failed);
    expect(progress(s)).toBeGreaterThan(before);
  });

  test("event replay is deterministic and old state defaults to fresh practice", () => {
    const old = initialState(r);
    delete old.practiceUse;
    const s = structuredClone(old);
    const events = [...practice(s), ...practice(s)];
    expect(foldEvents(r, [events], old)).toEqual(s);
    const replay = foldEvents(r, [events], old);
    expect(practice(replay)).toEqual(practice(s));
    expect(replay).toEqual(s);
  });

  test("history and stat bounds stay bounded; invalid gain does not poison state", () => {
    const s = initialState(r);
    for (let i = 0; i < 100; i++) practice(s, `new_${i}`);
    expect(Object.keys(s.practiceUse ?? {})).toHaveLength(64);
    const before = structuredClone(s);
    expect(practice(s, "invalid", Infinity)).toEqual([]);
    expect(s).toEqual(before);
    s.stats.perception = 99;
    practice(s, "last", 1000);
    expect(s.stats.perception).toBe(100);
    expect(s.practice.perception).toBe(0);
  });

  test("narrated training remains the original gain regardless of checked repetition", () => {
    const s = initialState(r);
    for (let i = 0; i < 40; i++) practice(s);
    const fresh = initialState(r);
    fresh.stats = { ...s.stats };
    expect(trainingGain(r, s, "perception", 120)).toBe(trainingGain(r, fresh, "perception", 120));
    const events = applyProposal(r, s, { train: ["perception"], minutes: 120 }, { text: "Training" });
    expect(events.some(e => e.t === "practice_use")).toBe(false);
    const next = foldEvents(r, [events], s);
    expect(progress(next) - progress(s)).toBeCloseTo(trainingGain(r, s, "perception", 120));
  });

  test("native turn resolution records practice context and replay keeps it", () => {
    let s = initialState(r);
    for (let i = 0; i < 3; i++) {
      const rec = resolveTurnFull(r, s, { actionId: "look_around", via: "choice" }, { seed: "same" }).record;
      expect(rec.events.some(e => e.t === "practice_use")).toBe(true);
      s = foldEvents(r, [rec.events], s);
    }
    expect(Object.values(s.practiceUse ?? {})[0]?.n).toBe(3);
  });
});
