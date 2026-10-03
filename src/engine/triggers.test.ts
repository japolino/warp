// When rules run (ADVENTURE-12, PRESSURE-1, F1): an edge rule fires each time its condition goes from false to
// true and its state is read again after its own effect; a repeat rule runs once per player turn, only in the
// turn's own resolve; roll() in a condition gives one number per batch.

import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { foldEvents, initialState, type GameState } from "./state.js";
import { applyProposal, buildTurn, resolveTurn } from "./resolve.js";

const load = (raw: Record<string, unknown>) => normalizeRuleset(raw).ruleset!;
const num = { kind: "meter", max: 100000, start: 0, show: "number" };

describe("when rules run", () => {
  test("a repeat rule the post-reply read makes true runs once, in the next turn (F1)", () => {
    const r = load({ style: "story", stats: { x: { ...num, narrator: 5 }, y: num }, triggers: { drip: { when: "x >= 1", repeat: true, do: { y: 1, hint: "drip line" } } } });
    let s = initialState(r);
    s = foldEvents(r, [applyProposal(r, s, { stats: { x: 1 } })], s);
    expect(s.stats.y).toBe(0);
    expect(s.notices).toEqual([]);
    for (let i = 1; i <= 3; i++) {
      const rec = resolveTurn(r, s, null, { seed: `d${i}` });
      s = foldEvents(r, [rec.events], s);
      expect(s.stats.y).toBe(i);
      expect(rec.hints.filter((h) => h === "drip line")).toHaveLength(1);
      s = foldEvents(r, [applyProposal(r, s, {})], s);
      expect(s.stats.y).toBe(i);
    }
  });

  test("an always-on repeat rule doesn't run on the greeting read or a hand edit", () => {
    const r = load({ style: "story", stats: { month: { ...num, start: 1 } }, triggers: { tick: { when: "1", repeat: true, do: { month: 1 } } } });
    let s = initialState(r);
    s = foldEvents(r, [buildTurn(r, s, "greeting", () => {})], s);
    expect(s.stats.month).toBe(1);
    s = foldEvents(r, [resolveTurn(r, s, null, { seed: "t1" }).events], s);
    expect(s.stats.month).toBe(2);
    s = foldEvents(r, [applyProposal(r, s, {})], s);
    expect(s.stats.month).toBe(2);
  });

  test("a repeat rule runs once in a resolve even when its condition flips", () => {
    const r = load({ style: "story", stats: { a: num, n: num }, triggers: {
      count: { when: "a == 0", repeat: true, do: { n: 1, a: 1 } },
      reset: { when: "a == 1", do: { set: { a: 0 } } },
    } });
    let s = initialState(r);
    s = foldEvents(r, [resolveTurn(r, s, null, { seed: "t" }).events], s);
    expect(s.stats.n).toBe(1);
  });

  test("an edge rule whose effect makes it false fires again when a later rule makes it true (PRESSURE-1)", () => {
    const r = load({ style: "story", stats: { x: num, copy: num },
      actions: { bump: { label: "Bump x", effects: { x: 5 } } },
      triggers: { sync: { when: "copy != x", do: { set: { copy: "x" } } }, tick: { when: "1", repeat: true, do: { x: 1 } } } });
    let s = initialState(r);
    for (let i = 0; i < 5; i++) {
      s = foldEvents(r, [resolveTurn(r, s, i === 1 ? { actionId: "bump", via: "choice" as const } : null, { seed: `t${i}` }).events], s);
      s = foldEvents(r, [applyProposal(r, s, {})], s);
      expect(s.stats.copy).toBe(s.stats.x);
      expect(s.triggers.sync).toBe(false);
    }
    expect(s.stats.x).toBe(10);
  });

  test("roll() in a condition is one number per batch: the rule fires at most once, at the written odds (ADVENTURE-12)", () => {
    const r = load({ style: "story", stats: { gold: { kind: "money" } }, triggers: {
      windfall: { when: "roll('1d100') <= 30", repeat: true, do: { gold: 10 } },
      lucky: { when: "roll('1d100') <= 30", do: { gold: 1000 } },
    } });
    let s: GameState = initialState(r);
    let turns = 0, most = 0;
    for (let i = 0; i < 2000; i++) {
      const g0 = s.stats.gold;
      s = foldEvents(r, [resolveTurn(r, s, null, { seed: `r${i}` }).events], s);
      const d = (s.stats.gold - g0) % 1000;
      most = Math.max(most, d / 10);
      if (d) turns++;
    }
    expect(most).toBe(1);
    expect(turns / 2000).toBeGreaterThan(0.26);
    expect(turns / 2000).toBeLessThan(0.34);
  });

  test("a repeat rule's direction is dropped when a later rule undoes its condition in the same turn (LONG-9)", () => {
    const r = load({ style: "story", stats: { job: { kind: "hidden", start: 1, max: 9 } }, flags: { job_done: { start: false } },
      actions: { perform: { label: "Perform", effects: { flags: { job_done: true }, hint: "The show went well." } } },
      triggers: {
        dday: { when: "job > 0", repeat: true, do: { hint: "Today is the job day." } },
        clear: { when: "job_done", do: { set: { job: 0 }, flags: { job_done: false } } },
      } });
    const s = initialState(r);
    expect(resolveTurn(r, s, null, { seed: "a" }).hints).toEqual(["Today is the job day."]);
    expect(resolveTurn(r, s, { actionId: "perform", via: "choice" }, { seed: "b" }).hints).toEqual(["The show went well."]);
  });
});
