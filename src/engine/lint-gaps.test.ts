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

describe("names inside functions and paths (ADVENTURE-9, LONG-2)", () => {
  test("typos in flag(), cond(), has(), rel(), present(), person.stat and flag effects warn", () => {
    const out = issuesOf(`name: function args
style: story
stats:
  clues: { kind: meter, max: 12, start: 0, narrator: 3 }
flags:
  solved: { start: false }
conditions:
  focused: { label: Focused }
relationships:
  stats: { trust: { start: 20, narrator: 5 } }
  people: { jo: { name: Jo } }
items:
  lockpick: Lockpick
inventory: { open: false }
actions:
  ask: { label: Ask, when: "jo.trsut >= 40 and flags.solvd", effects: { clues: 1 } }
triggers:
  solve: { when: "clues >= 8", do: { flags: { sovled: true } } }
  spent: { when: "cond('focussed')", do: { remove_condition: [focused] } }
  picky: { when: "has('lock_pick') and rel('jo', 'trsut') > 50 and present('joe')", do: { hint: "x" } }
goals:
  list:
    case: { text: "Solve the case", done_when: "flag('solved')" }
`);
    expect(has(out, "Triggers › solve › flags › sovled", /did you mean "solved"/)).toBe(true);
    expect(has(out, "Triggers › spent › when", /cond\('focussed'\).*did you mean "focused"/)).toBe(true);
    expect(has(out, "Triggers › picky › when", /has\('lock_pick'\).*lockpick/)).toBe(true);
    expect(has(out, "Triggers › picky › when", /rel\(…, 'trsut'\).*trust/)).toBe(true);
    expect(has(out, "Triggers › picky › when", /present\('joe'\).*jo/)).toBe(true);
    expect(has(out, "Actions › ask › when", /jo\.trsut.*trust/)).toBe(true);
    expect(has(out, "Actions › ask › when", /flags\.solvd.*solved/)).toBe(true);
    expect(out.some((l) => l.startsWith("Goals"))).toBe(false);
  });
  test("an open list only flags a near miss", () => {
    const out = issuesOf(`style: story
relationships: { open: true, stats: { trust: { start: 20 } }, people: { jo: { name: Jo } } }
inventory: { open: true }
items: { lockpick: Lockpick }
triggers:
  a: { when: "has('rope') and met('selene')", do: { hint: "x" } }
`);
    expect(out).toEqual([]);
  });
});

describe("dice and built-ins (ADVENTURE-12, LIFE-4, LIFE-3)", () => {
  test("roll() in a rule's when: warns; bad dice warn; a stat named turn warns", () => {
    const out = issuesOf(`style: story
stats:
  gold: { kind: money }
  turn: { kind: hidden, max: 100000 }
triggers:
  windfall: { when: "roll('1d100') <= 30", repeat: true, do: { gold: 10 } }
  big: { when: "gold > 5", do: { gold: "roll('1d8001')" } }
  typo: { when: "gold > 6", do: { gold: "roll('2d')" } }
`);
    expect(has(out, "Triggers › windfall › when", /rolls again before and after each reply/)).toBe(true);
    expect(has(out, "Triggers › big › gold", /roll\('1d8001'\).*always gives 0/)).toBe(true);
    expect(has(out, "Triggers › typo › gold", /roll\('2d'\).*always gives 0/)).toBe(true);
    expect(has(out, "Stats › turn", /built-in/)).toBe(true);
    expect(out.some((l) => /big › when|typo › when/.test(l))).toBe(false);
  });
});

describe("flags (PRESSURE-4, PRESSURE-5)", () => {
  test("narrator: true on a text or number flag, and a typo in a flag formula, warn", () => {
    const out = issuesOf(`style: story
stats:
  rol_v: { kind: hidden }
flags:
  met_boss: { start: false, narrator: true }
  alert: { start: calm, narrator: true }
  coins: { start: 0, narrator: true }
  verdict: { start: none }
  mood_word: { start: "" }
triggers:
  vote: { when: "rol_v > 0", do: { flags: { verdict: "rol_v <= 50 ? 'passed' : 'failed'" } } }
  typo: { when: "rol_v > 1", do: { flags: { verdict: "rol_vv <= 50 ? 'passed' : 'failed'", mood_word: "bright" } } }
`);
    expect(has(out, "Flags › alert › narrator", /only set true\/false/)).toBe(true);
    expect(has(out, "Flags › coins › narrator", /only set true\/false/)).toBe(true);
    expect(out.some((l) => l.startsWith("Flags › met_boss"))).toBe(false);
    expect(has(out, "Triggers › typo › flags › verdict", /"rol_vv".*formula's own text/)).toBe(true);
    expect(out.some((l) => l.startsWith("Triggers › vote"))).toBe(false);
    expect(out.some((l) => l.includes("mood_word"))).toBe(false);
  });
});

describe("stamps, panel and check adds (CREW-3, ADVENTURE-5, F4)", () => {
  test("a turn stamp in a small hidden stat, a meter left off hud.bars, and a 0–100 skill added raw warn", () => {
    const out = issuesOf(`style: adventure
hud: { bars: [health] }
stats:
  health: { kind: meter }
  stress: { kind: meter, start: 0 }
  secret_count: { kind: hidden }
  rest_at: { kind: hidden }
  ok_at: { kind: hidden, max: 100000 }
  talk: { kind: skill, max: 100, start: 45 }
  body: { kind: attribute, max: 10, start: 3 }
conflict: false
actions:
  rest: { label: Rest, effects: { set: { rest_at: turn, ok_at: turn } } }
  plead: { label: Plead, check: { vs: fair, add: talk } }
  plead2: { label: Plead well, check: { vs: fair, add: "talk / 10" } }
  lift: { label: Lift, check: { vs: fair, add: body } }
`);
    expect(has(out, "Actions › rest › effects › set › rest_at", /stops at 100/)).toBe(true);
    expect(out.some((l) => l.includes("ok_at"))).toBe(false);
    expect(has(out, "HUD › bars", /"stress" isn't in hud.bars/)).toBe(true);
    expect(out.some((l) => l.includes("secret_count"))).toBe(false);
    expect(has(out, "Actions › plead › check › add", /talk \(0–100\) as it is/)).toBe(true);
    expect(out.some((l) => l.startsWith("Actions › plead2") || l.startsWith("Actions › lift"))).toBe(false);
  });
});

describe("an adventure without conflict: (PRESSURE-7, LONG-4)", () => {
  test("default contest kinds that lean on no stat warn; conflict: false or player stats don't", () => {
    expect(has(issuesOf(`style: adventure
stats: { capital: { kind: meter } }
`), "Conflict", /no conflict: block.*no stat/)).toBe(true);
    expect(issuesOf(`style: adventure
stats: { capital: { kind: meter } }
conflict: false
`)).toEqual([]);
    expect(issuesOf(`style: adventure
stats: { body: { kind: attribute, max: 10 }, mind: { kind: attribute, max: 10 }, charm: { kind: attribute, max: 10 } }
`).filter((l) => l.startsWith("Conflict"))).toEqual([]);
  });
});

describe("the order inside one effect block (ADVENTURE-10, LONG-7)", () => {
  test("a change and a set: of the same stat, or a change reading a stat the block sets, warn", () => {
    const out = issuesOf(`style: story
stats:
  rnd: { kind: hidden }
  sold: { kind: hidden, max: 1000 }
  cash: { kind: money }
  food: { kind: meter }
  hp: { kind: meter }
triggers:
  a: { when: "rnd > 0", do: { set: { rnd: 0 }, rnd: 5 } }
  b: { when: "rnd > 1", do: { set: { sold: 10 }, cash: "sold * 5" } }
  c: { when: "rnd > 2", do: { set: { food: "max(food - 2, 0)" }, hp: "food <= 1 ? -10 : 5" } }
  d: { when: "rnd > 3", do: { food: -3, hp: "food" } }
`);
    expect(has(out, "Triggers › a › rnd", /changed and set:/)).toBe(true);
    expect(has(out, "Triggers › b › cash", /reads sold/)).toBe(true);
    expect(has(out, "Triggers › c › hp", /reads food/)).toBe(true);
    expect(out.some((l) => l.startsWith("Triggers › d"))).toBe(false);
  });
});
