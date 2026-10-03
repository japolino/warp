// The whole-loop simulator's gate (CORE-DESIGN §2.7) on inline Adventure-like and Story-like rulesets. The real
// templates get the same gate in templates/templates.test.ts.

import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { createLoopSim, runLoopSim } from "./loop-sim.js";

const ADVENTURE = `style: adventure
clock: { start: greeting, fallback: "Day 1 09:00", minutes_per_action: 10, narrator_max: 480 }
start: { place: greeting, money: 50 }
hud: { bars: [health, energy, mood] }
stats:
  health: { kind: meter, narrator: 20, bands: { 0: { text: Near collapse., say_down: "You can barely stand." }, 25: { text: Badly hurt., say_down: "You're badly hurt." }, 50: Bruised and sore., 80: { text: Healthy., say: "You feel like yourself again." } } }
  energy: { kind: meter, per_hour: -4, narrator: 15, bands: { 0: Exhausted., 30: Tired., 60: Alert. } }
  mood: { kind: meter, start: 60, narrator: 10, bands: { 0: Miserable., 25: Low., 50: Steady., 75: In good spirits. } }
  money: { kind: money, narrator: 100 }
  body: { kind: attribute, max: 10, start: 3 }
  mind: { kind: attribute, max: 10, start: 3 }
  charm: { kind: attribute, max: 10, start: 3 }
checks: { partial: 3, stats: [body, mind, charm], bonus: 10, outcomes: { fail: { energy: -5 }, crit_fail: { health: -10, energy: -5 } } }
conditions:
  exhausted: { label: Exhausted, tone: bad, bonus: { body: -2, mind: -2, charm: -2 } }
relationships:
  open: true
  stats:
    affection: { start: 20, narrator: 5, bands: { 0: Hostile, 15: Cool, 35: { text: Friendly, say: "{name} likes you." }, 60: Close, 85: Devoted } }
    trust: { start: 20, narrator: 5, bands: { 0: Suspicious, 25: Wary, 50: { text: Trusting, say: "{name} trusts you." }, 80: Unshakeable } }
  people:
    mira: { name: Mira, age: 28 }
goals: { from_story: true, max: 3 }
triggers:
  exhausted: { when: "energy <= 0", do: { add_condition: [exhausted] } }
  recovered: { when: "energy >= 30", do: { remove_condition: [exhausted] } }
live_choices:
  count: 3
  tags:
    bold: { desc: "A daring move", check: { add: body, label: Body }, success: { mood: +3 }, fail: { health: -5, mood: -3 } }
    clever: { desc: "A clever trick", check: { add: mind, label: Mind }, success: { mood: +2 }, fail: { mood: -2 } }
    charm: { desc: "Persuading someone here", per_person: true, check: { add: charm, label: Charm }, success: { rel: { target: { affection: +4, trust: +2 } } }, fail: { mood: -3, rel: { target: { trust: -2 } } } }
    kind: { desc: "Something kind (no roll)", per_person: true, effects: { rel: { target: { trust: +2 } } } }
    careful: { desc: "The cautious option (no roll)", effects: { energy: +2 } }
actions:
  rest: { label: Rest a while, time: 60, effects: { energy: +25, health: +5 } }`;

const STORY = `name: Story
style: story
clock: { start: greeting, fallback: "Day 1 18:00", minutes_per_action: 15, narrator_max: 720 }
start: { place: greeting }
relationships:
  open: true
  big_moment: { factor: 3, cooldown: 10 }
  stats:
    affection:
      start: 10
      narrator: 4
      bands:
        0: { text: Cold, say_down: "{name} has gone cold on you.", voice: "{name} is curt with {{user}}." }
        10: { text: Neutral, say_down: "{name} has cooled toward you." }
        25: { text: Warm, say: "{name} is warming to you.", voice: "{name} relaxes around {{user}}." }
        45: { text: Fond, say: "{name} is fond of you now." }
        65: { text: Smitten, say: "{name} can't hide how much they like you." }
        85: { text: In love, say: "{name} has fallen for you." }
    trust:
      start: 15
      narrator: 4
      bands:
        0: { text: Guarded, voice: "{name} gives nothing personal away." }
        20: { text: Wary, say_down: "{name} is wary of you again." }
        40: { text: Open, say: "{name} is starting to open up.", voice: "{name} shares small personal things." }
        65: { text: Trusting, say: "{name} trusts you." }
        85: { text: Devoted, say: "{name} would trust you with anything." }
  people:
    mira: { name: Mira, age: 27 }
goals: { from_story: true, max: 3 }
live_choices:
  count: 3
  tags:
    tender: { desc: "Something warm toward someone here", per_person: true, effects: { rel: { target: { affection: +2 } } } }
    playful: { desc: "Teasing someone here", per_person: true, effects: { rel: { target: { affection: +1, trust: +1 } } } }
    honest: { desc: "Something true to someone here", per_person: true, effects: { rel: { target: { trust: +2 } } } }
    space: { desc: "Giving room" }
    onward: { desc: "Moving the story along" }
actions:
  pass_time: { label: Let a few hours pass, time: 180 }`;

const load = (yaml: string) => {
  const { ruleset, issues } = loadRuleset([{ label: "t", content: yaml, order: 0 }]);
  expect(issues).toEqual([]);
  return ruleset!;
};

describe("the loop simulator's gate", () => {
  test("Adventure: every gate passes over 50 turns × 30 seeds", () => {
    const report = runLoopSim(load(ADVENTURE), { turns: 50, seeds: 30, contestRuns: 1000 });
    const failed = report.gates.filter((g) => !g.pass).map((g) => `${g.id}: ${g.value} (bar ${g.bar})`);
    expect(failed).toEqual([]);
    expect(report.gates.map((g) => g.id)).toEqual([
      "clock", "scene", "crossing-lines", "story-ends-contest", "odds-shown-real", "typed-rolls", "fail-direction", "odds-spread",
      "contest-rounds", "contest-3-6", "contest-break-off", "greedy-tag-share", "always-kind",
    ]);
    // It really played: checks, contests from the story, crossings with lines.
    expect(report.counts.checks).toBeGreaterThan(500);
    expect(report.counts.contestsStarted).toBeGreaterThan(0);
    expect(report.counts.crossings).toBeGreaterThan(0);
    // The odds table: what was shown is the exact odds; the empirical rate lands near it where there are enough rolls.
    for (const row of report.checks.filter((x) => x.n >= 400)) expect(Math.abs(row.real - row.shown)).toBeLessThan(0.07);
    expect(report.contests.length).toBe(3 * 7 * 4);
  });

  test("Story: no dice; the gates that apply pass", () => {
    const report = runLoopSim(load(STORY), { turns: 50, seeds: 30 });
    expect(report.gates.filter((g) => !g.pass)).toEqual([]);
    expect(report.counts.checks).toBe(0);
    expect(report.contests).toEqual([]);
    expect(report.gates.some((g) => g.id === "odds-spread")).toBe(false);
  });

  test("time: effects of a tag, an outcome or a trigger move the clock by the rules (no clock miss)", () => {
    const yaml = STORY
      .replace('space: { desc: "Giving room" }', 'space: { desc: "Giving room", effects: { time: 30 } }')
      .replace('onward: { desc: "Moving the story along" }', 'onward: { desc: "Moving the story along", time: 45, effects: { time: 15 } }')
      + `
triggers:
  late: { when: "hour >= 22", do: { time: 5, hint: "It's late." } }`;
    const report = runLoopSim(load(yaml), { turns: 40, seeds: 10 });
    expect(report.gates.find((g) => g.id === "clock")).toMatchObject({ value: 0, pass: true });
    const adventure = ADVENTURE.replace("success: { mood: +2 }, fail: { mood: -2 } }", "success: { mood: +2, time: 20 }, fail: { mood: -2 } }");
    const rolled = runLoopSim(load(adventure), { turns: 40, seeds: 10, contestRuns: 100 });
    expect(rolled.gates.find((g) => g.id === "clock")).toMatchObject({ value: 0, pass: true });
  });

  test("the chunked form gives the same report, a step at a time, with progress", () => {
    const r = load(ADVENTURE);
    const whole = runLoopSim(r, { turns: 20, seeds: 3, contestRuns: 200, seed: "chunk" });
    const sim = createLoopSim(r, { turns: 20, seeds: 3, contestRuns: 200, seed: "chunk" });
    let steps = 0;
    while (!sim.run(37)) { steps++; expect(sim.progress).toBeGreaterThan(0); expect(sim.progress).toBeLessThan(1); }
    expect(steps).toBeGreaterThan(3);
    expect(sim.progress).toBe(1);
    expect(sim.report()).toEqual(whole);
    // Another seed plays differently.
    expect(runLoopSim(r, { turns: 20, seeds: 3, contestRuns: 200, seed: "other" }).counts).not.toEqual(whole.counts);
  });
});
