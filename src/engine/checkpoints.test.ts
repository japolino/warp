import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { foldEvents, initialState, type GameState, type WarpEvent } from "./state.js";
import { applyProposal, resolveTurn, runOp, RUN_EPILOGUE } from "./resolve.js";
import { buildChoices } from "./view.js";
import type { Ruleset } from "./ruleset.js";

const YAML = (extra = "") => `
name: Loops
clock: { start: "Mon 08:00", minutes_per_action: 60 }
stats:
  money: { kind: money, start: 10, narrator: 50 }
  insight: { start: 0 }
  despair: { start: 0, narrator: 100 }
flags: { knows_secret: false }
codex: { clue: { title: A clue, unlock: "insight >= 1" } }
actions:
  work: { label: Work, effects: { money: +5 } }
  think: { label: Think, effects: { insight: +1 } }
  wait: { label: Wait, time: 600 }
  nap: { label: Nap, time: 240 }
checkpoints:
  slots: 2
  auto: day
  keep: [codex, { stats: [insight] }]
  loop: { when: "hour >= 22", to: auto, text: "The clock strikes ten and the day folds back on itself." }
endings:
  despair: { when: "despair >= 100", title: Gone, kind: bad, text: "{{user}} gives up." }
  legacy: [codex]
${extra}`;

const load = (extra = ""): Ruleset => loadRuleset([{ label: "t", content: YAML(extra), order: 0 }]).ruleset!;
const act = (r: Ruleset, s: GameState, id: string | null, seed = "x") => {
  const rec = resolveTurn(r, s, id ? { actionId: id, via: "choice" } : null, { seed });
  return { s: foldEvents(r, [rec.events], s), rec };
};
const op = (r: Ruleset, s: GameState, o: Parameters<typeof runOp>[2]) => {
  const ev = runOp(r, s, o);
  if (typeof ev === "string") throw new Error(ev);
  return foldEvents(r, [ev as WarpEvent[]], s);
};

describe("checkpoints, loops and endings", () => {
  test("a save rewinds everything except what the ruleset keeps", () => {
    const r = load();
    let s = op(r, initialState(r), { op: "save", slot: "1" });
    s = act(r, s, "work").s;
    s = act(r, s, "think").s;
    expect(s.codex.clue).toBe(true);
    s = op(r, s, { op: "load", slot: "1" });
    expect(s.stats.money).toBe(10);
    expect(s.stats.insight).toBe(1);
    expect(s.codex.clue).toBe(true);
    expect(s.loops).toBe(1);
    expect(s.saves["1"]).toBeDefined();
    expect(s.notices.join(" ")).toContain("Time rewinds");
    expect(runOp(r, s, { op: "load", slot: "2" })).toBe("That slot is empty.");
  });

  test("the day autosaves, and the loop rewinds to it by itself", () => {
    const r = load();
    let s = initialState(r);
    // Past midnight into day 2: autosave.
    s = act(r, s, "wait").s; // 18:00
    s = act(r, s, "wait").s; // 04:00 day 2
    expect(s.saves.auto?.label).toContain("Day 2");
    s = act(r, s, "think").s;
    const money = s.stats.money;
    s = act(r, s, "work").s;
    // 06:00 → naps until 22:00 or later, still on day 2.
    let cur = act(r, s, "nap");
    for (let i = 0; i < 8 && cur.s.loops === 0; i++) cur = act(r, cur.s, "nap", `n${i}`);
    expect(cur.s.loops).toBe(1);
    expect(cur.s.stats.money).toBe(money);
    expect(cur.s.stats.insight).toBeGreaterThanOrEqual(1);
    expect(cur.rec.hints.join(" ")).toContain("folds back");
  });

  test("an ending reached in a turn is written at once; its choices take over", () => {
    const r = load();
    const s0 = foldEvents(r, [[{ t: "stat", id: "despair", set: 99, src: "manual" }]], initialState(r));
    const low = foldEvents(r, [[{ t: "stat", id: "despair", set: 100, src: "manual" }]], s0);
    const { s, rec } = act(r, low, null);
    expect(s.ended).toMatchObject({ id: "despair", told: true });
    expect(rec.hints.join(" ")).toContain("THE STORY REACHES AN ENDING");
    const ids = buildChoices(r, s, { lines: [], veils: [] }).map((c) => c.id);
    expect(ids).toContain("run:restart");
    expect(ids).toContain("run:continue");
    expect(ids).not.toContain(RUN_EPILOGUE);
    // Nothing more resolves after the ending is written.
    expect(act(r, s, "work").rec.action).toBeUndefined();
  });

  test("an ending reached between replies waits for the player to see it written", () => {
    const r = load();
    const events = applyProposal(r, initialState(r), { stats: { despair: 100 } });
    const s = foldEvents(r, [events], initialState(r));
    expect(s.ended?.told).toBe(false);
    expect(buildChoices(r, s, { lines: [], veils: [] })[0].id).toBe(RUN_EPILOGUE);
    const told = act(r, s, RUN_EPILOGUE);
    expect(told.s.ended?.told).toBe(true);
    expect(told.rec.action?.label).toContain("Gone");
    expect(told.rec.hints.filter((h) => h.includes("THE STORY REACHES AN ENDING")).length).toBe(1);
  });

  test("starting over keeps the legacy and counts the playthrough", () => {
    const r = load();
    let s = act(r, initialState(r), "think").s;
    s = op(r, s, { op: "save", slot: "1" });
    s = foldEvents(r, [[{ t: "stat", id: "despair", set: 100, src: "manual" }]], s);
    s = act(r, s, null).s;
    s = op(r, s, { op: "restart" });
    expect(s.runs).toBe(2);
    expect(s.ended).toBeNull();
    expect(s.codex.clue).toBe(true);
    expect(s.stats.insight).toBe(0);
    expect(s.saves).toEqual({});
  });

  test("hard mode: an ending can't be played past", () => {
    const r = load().checkpoints;
    const hard = load("");
    hard.checkpoints = { ...r, hard: true };
    let s = foldEvents(hard, [[{ t: "stat", id: "despair", set: 100, src: "manual" }]], initialState(hard));
    s = act(hard, s, null).s;
    expect(runOp(hard, s, { op: "continue" })).toBe("Hard mode: an ending is final.");
    expect(buildChoices(hard, s, { lines: [], veils: [] }).some((c) => c.id === "run:continue")).toBe(false);
  });
});
