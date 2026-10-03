import { expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { applyEvent, foldEvents, initialState, type GameState } from "./state.js";
import { applyProposal, encounterStartEvents, odds, resolveTurn, runOp } from "./resolve.js";
import { buildChoices } from "./view.js";
import { encounterGuide } from "./encounter-view.js";
import { intentFor } from "../backend/intents.js";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";

const rules = (raw: any) => normalizeRuleset(raw).ruleset!;
const step = (r: ReturnType<typeof rules>, s: GameState, id: string | null, seed = "ux") => {
  const rec = resolveTurn(r, s, id ? { actionId: id, via: "choice" } : null, { seed });
  return { rec, s: foldEvents(r, [rec.events], s) };
};

test("an unowned item or gated saved action produces no effects or turn consumption", () => {
  const r = rules({ stats: { health: { start: 10, max: 100 }, skill: { kind: "skill", start: 0 } },
    items: { tonic: { use: { health: 20 } } }, actions: { expert: { requires: { skill: 50 }, effects: { health: 20 } } } });
  const s = initialState(r);
  for (const id of ["item:tonic", "expert", "missing"]) {
    const rejected = step(r, s, id);
    expect(rejected.rec.events).toEqual([]);
    expect(rejected.rec.hints.join(" ")).toContain("isn't available");
    expect(rejected.s).toEqual(s);
  }
});

test("travel choices are gone: a go: move does nothing, in or out of an encounter", () => {
  const r = rules({ start: { location: "home" }, locations: { home: {}, town: {} },
    encounters: { test: { actions: { wait: { effects: {} } } } } });
  const s = initialState(r);
  expect(step(r, s, "go:town").rec.events).toEqual([]);
  const fight = foldEvents(r, [encounterStartEvents(r, s, "test", "fight")], s);
  expect(step(r, fight, "go:town").rec.events).toEqual([]);
});

test("live choice gates hold in display, click interpretation and execution", () => {
  const r = rules({ stats: { skill: { kind: "skill", start: 0 } }, live_choices: {
    tags: { expert: { requires: { skill: 50 }, effects: { skill: 10 } } },
  } });
  const s = initialState(r); const live = [{ label: "Try the expert technique", tag: "expert" }];
  const msgs = [{ id: "live", swipe_id: 0, metadata: { warp: { live: { "0": live } } } }] as any;
  expect(buildChoices(r, s, { lines: [], veils: [], live }).some((c) => c.id === "live:0")).toBe(false);
  expect("error" in intentFor(r, s, DEFAULT_SETTINGS, msgs, "live:0")).toBe(true);
  expect(step(r, s, "live:expert").rec.events).toEqual([]);
  s.stats.skill = 50;
  expect(buildChoices(r, s, { lines: [], veils: [], live }).some((c) => c.id === "live:0")).toBe(true);
  expect("intent" in intentFor(r, s, DEFAULT_SETTINGS, msgs, "live:0")).toBe(true);
  expect(step(r, s, "live:expert").s.stats.skill).toBe(60);
});

test("bookkeeping counts an already clicked use once and still counts an additional use", () => {
  const r = rules({ start: { items: { spray: 1 } }, items: { spray: { name: "Spray", uses: 5, use: { hint: "Works" } } } });
  const before = initialState(r); const clicked = step(r, before, "item:spray").s;
  const context = { text: "", action: { id: "item:spray", tags: [] } };
  expect(clicked.uses.spray).toBe(4);
  expect(foldEvents(r, [applyProposal(r, clicked, { used: { Spray: 1 } }, context)], clicked).uses.spray).toBe(4);
  expect(foldEvents(r, [applyProposal(r, clicked, { used: { Spray: 2 } }, context)], clicked).uses.spray).toBe(3);
  expect(foldEvents(r, [applyProposal(r, before, { used: { Spray: 1 } })], before).uses.spray).toBe(4);
});

test("additional narrated uses respect stack capacity and apply each non-check effect once", () => {
  const r = rules({ stats: { health: { start: 0, max: 100 } }, start: { items: { spray: 2 } },
    items: { spray: { name: "Spray", uses: 2, use: { health: 3 } } } });
  const clicked = step(r, initialState(r), "item:spray").s;
  const context = { text: "", action: { id: "item:spray", tags: [] } };
  const after = foldEvents(r, [applyProposal(r, clicked, { used: { Spray: 10 } }, context)], clicked);
  expect(after.stats.health).toBe(12); // One clicked use and three remaining charges.
  expect(after.items.spray).toBeUndefined();
  expect(after.uses.spray).toBeUndefined();
  const exhausted = foldEvents(r, [applyProposal(r, after, { used: { Spray: 10 } }, context)], after);
  expect(exhausted.stats.health).toBe(12);
});

test("reusable items keep their stock and checked uses do not invent a successful effect", () => {
  const r = rules({ stats: { health: { start: 0, max: 100 } }, start: { items: { tool: 1, kit: 1 } }, items: {
    tool: { keep: true, use: { health: 2 } },
    kit: { uses: 5, use: { check: { chance: 0, crits: false }, success: { health: 10 } } },
  } });
  const before = initialState(r);
  const after = foldEvents(r, [applyProposal(r, before, { used: { tool: 3, kit: 2 } })], before);
  expect(after.items.tool).toBe(1);
  expect(after.stats.health).toBe(6);
  expect(after.uses.kit).toBe(3);
});

test("reverse-ordered trigger chains settle beyond five passes and report a capped backlog", () => {
  for (const length of [20, 300]) {
    const flags = Object.fromEntries(Array.from({ length: length + 1 }, (_, i) => [`f${i}`, i === 0]));
    const triggers = Array.from({ length }, (_, i) => ({ id: `t${i}`, when: `flag('f${i}')`, effects: { flags: { [`f${i + 1}`]: true } } })).reverse();
    const r = rules({ flags, triggers });
    const result = step(r, initialState(r), null);
    if (length === 20) {
      expect(result.s.flags.f20).toBe(true);
      expect(result.rec.hints.join(" ")).not.toContain("safety limit");
    } else {
      expect(result.s.flags.f300).toBe(false);
      expect(result.rec.hints.join(" ")).toContain("safety limit");
    }
  }
});

test("d100 odds include additive modifiers and match deterministic check outcomes", () => {
  for (const [chance, add, expected] of [[100, 100, 0], [50, 25, 0.25], [50, -25, 0.75], [100, -100, 1]]) {
    const r = rules({ actions: { attempt: { check: { chance, add, crits: false } } } });
    const s = initialState(r);
    expect(odds(r, s, r.actions.attempt)!.success).toBe(expected);
    let successes = 0;
    for (let i = 0; i < 3000; i++) if (step(r, s, "attempt", `sample:${i}`).rec.check!.tier === "success") successes++;
    expect(Math.abs(successes / 3000 - expected)).toBeLessThan(0.035);
  }
});

test("check numbers use the visible pre-cost context; the cost still applies", () => {
  const r = rules({ stats: { stamina: { start: 100, max: 100 } }, actions: { sprint: {
    cost: { stamina: -100 }, check: { chance: "stamina", crits: false },
  } } });
  const s = initialState(r); const result = step(r, s, "sprint");
  expect(odds(r, s, r.actions.sprint)!.success).toBe(1);
  expect(result.rec.check!.target).toBe(100);
  expect(result.rec.check!.tier).toBe("success");
  expect(result.s.stats.stamina).toBe(0);
});

test("Keep playing acknowledges an ending until its predicate becomes false, then rearms it", () => {
  const r = rules({ stats: { health: { start: 0 } }, endings: { fallen: { when: "health <= 0", text: "The end" } }, checkpoints: true,
    actions: { recover: { effects: { health: 10 } }, hurt: { effects: { health: -20 } } } });
  const ended = step(r, initialState(r), null).s;
  const operation = runOp(r, ended, { op: "continue" });
  if (typeof operation === "string") throw new Error(operation);
  let s = foldEvents(r, [operation], ended);
  s = step(r, s, null).s;
  expect(s.ended).toBeNull();
  expect(s.dismissedEndings).toEqual(["fallen"]);
  s = step(r, s, "recover").s;
  expect(s.dismissedEndings).toEqual([]);
  expect(step(r, s, "hurt").s.ended!.id).toBe("fallen");
});

test("automatic recurring quests restart after cooldown without a duplicate reward", () => {
  const r = rules({ clock: { start: "Mon 08:00" }, stats: { gold: { kind: "money" } },
    quests: { daily: { auto: true, repeat: 1, goals: [{ count: 1 }], reward: { gold: 10 } } },
    actions: { finish: { effects: { progress: { daily: 1 } } }, wait: { time: 1440, effects: {} } } });
  let s = step(r, initialState(r), null).s;
  s = step(r, s, "finish").s;
  expect(s.quests.daily.st).toBe("done"); expect(s.stats.gold).toBe(10);
  s = step(r, s, null).s;
  expect(s.quests.daily.st).toBe("done"); expect(s.stats.gold).toBe(10);
  s = step(r, s, "wait").s;
  expect(s.quests.daily.st).toBe("active"); expect(s.stats.gold).toBe(10);
  s = step(r, s, "finish").s;
  expect(s.stats.gold).toBe(20);
});

test("an encounter started directly initializes start effects and momentum like the live transition", () => {
  const r = rules({ flags: { ready: false }, encounters: { contest: { momentum: true,
    start: { flags: { ready: true } }, actions: { advance: { when: "flag('ready')", check: { chance: 100, crits: false } } },
    foe_moves: { wait: { desc: "Waits", weight: 1 } },
  } }, actions: { enter: { effects: { encounter: "contest" } } } });
  const initial = initialState(r);
  const real = step(r, initial, "enter").s;
  const simulated = foldEvents(r, [encounterStartEvents(r, initial, "contest", "entry")], initial);
  expect(simulated.flags).toEqual(real.flags);
  expect(simulated.encounter).toEqual(real.encounter);
});

test("unproductive encounters end at a visible budget with the configured consequence", () => {
  const r = rules({ stats: { gold: { kind: "money", start: 50 } }, encounters: { loop: {
    round_limit: 3, timeout_outcome: "lost", actions: { wait: { effects: {} } },
    foe_moves: { wait: { desc: "Waits", weight: 1 } }, end_when: { won: "round >= 1000000" }, outcomes: { lost: { gold: -10 } },
  } } });
  let s = foldEvents(r, [encounterStartEvents(r, initialState(r), "loop", "entry")]);
  expect(encounterGuide(r, s)!.dangerText).toContain("3 rounds left");
  s = step(r, s, "wait").s; s = step(r, s, "wait").s;
  expect(s.encounter!.round).toBe(2);
  s = step(r, s, "wait").s;
  expect(s.encounter).toBeNull(); expect(s.lastEncounter!.outcome).toBe("lost");
  expect(s.stats.gold).toBe(40);
});

test("winning on the last allowed round takes precedence over the timeout", () => {
  const r = rules({ encounters: { contest: { round_limit: 3, actions: { wait: { effects: {} } },
    end_when: { won: "round >= 3" }, foe_moves: { wait: { desc: "Waits", weight: 1 } },
  } } });
  let s = foldEvents(r, [encounterStartEvents(r, initialState(r), "contest", "entry")]);
  for (let i = 0; i < 3; i++) s = step(r, s, "wait").s;
  expect(s.lastEncounter!.outcome).toBe("won");
});

