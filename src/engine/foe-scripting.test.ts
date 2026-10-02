// Foe scripting: foes whose stats and armor scale with {{user}} (formulas worked out
// once when the encounter starts), boss phases (foe_moves with `when:`, in_encounter('id'),
// encounter_round), rules that can't restart the encounter that just ended, and lint
// for moves that wear a foe stat the foe doesn't have.

import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { applyEvent, cloneState, initialState, makeEnv, type GameState } from "./state.js";
import { encounterStartEvents, resolveTurn, type TurnRecord } from "./resolve.js";
import { buildHud } from "./view.js";
import { lintRuleset } from "./lint.js";
import { evaluate } from "./expr.js";

const load = (raw: Record<string, unknown>) => {
  const { ruleset, issues } = normalizeRuleset(raw);
  if (!ruleset) throw new Error(issues.map((i) => `${i.where}: ${i.message}`).join("\n"));
  return { r: ruleset, issues };
};
type R = ReturnType<typeof load>["r"];
const fold = (r: R, s: GameState, rec: TurnRecord) => { const n = cloneState(s); rec.events.forEach((e) => applyEvent(n, e, r)); return n; };
const turn = (r: R, s: GameState, actionId: string, seed = "a") => { const rec = resolveTurn(r, s, { actionId, via: "choice" }, { seed }); return { rec, s: fold(r, s, rec) }; };
const begin = (r: R, s: GameState, id: string) => { const n = cloneState(s); for (const e of encounterStartEvents(r, s, id, "seed")) applyEvent(n, e, r); return n; };
const ev = (r: R, s: GameState, f: string) => evaluate(f, makeEnv(r, s));

// rulebooks/_repro_foe.yaml, with a harder hit.
const scaling = (foe: Record<string, unknown> = { name: "F", armor: "level * 2", stats: { hp: { start: "100 * level", max: "100 * level" } } }) => load({
  stats: { level: { kind: "attribute", start: 3, max: 100 }, hp: { kind: "meter", start: 50 } },
  actions: { train: { label: "Train", effects: { level: +1 } } },
  encounters: {
    e: {
      name: "E", foe,
      actions: { hit: { label: "Hit", effects: { foe: { hp: -10 } } }, train: { label: "Train", effects: { level: +5 } } },
      end_when: { won: "foe.hp <= 0", beaten: "hp <= 0" },
    },
  },
});

describe("foes that scale: formula start, max and armor", () => {
  test("worked out once at the start, against {{user}}'s level; no load warnings", () => {
    const { r, issues } = scaling();
    expect(issues.filter((i) => /Encounters/.test(i.where))).toEqual([]);
    const s = begin(r, initialState(r), "e");
    expect(s.encounter!.foe.hp).toBe(300);
    expect(s.encounter!.max).toEqual({ hp: 300 });
    expect(s.encounter!.armor).toEqual({ _: 6 });
    expect(ev(r, s, "foe_max('hp')")).toBe(300);
    expect(buildHud(r, s).encounter!.stats[0]).toMatchObject({ value: 300, max: 300 });
    // A blow of 10 meets armor 6.
    expect(turn(r, s, "hit").s.encounter!.foe.hp).toBe(296);
  });

  test("levelling mid-fight doesn't rescale the foe; a later encounter does", () => {
    const { r } = scaling();
    let s = begin(r, initialState(r), "e");
    s = turn(r, s, "train").s;
    expect(s.stats.level).toBe(8);
    expect(s.encounter!.max).toEqual({ hp: 300 });
    expect(turn(r, s, "hit", "b").s.encounter!.foe.hp).toBe(296);
    applyEvent(s, { t: "enc", id: null, outcome: "won", src: "manual" }, r);
    s = begin(r, s, "e");
    expect(s.encounter!.foe.hp).toBe(800);
    expect(s.encounter!.armor).toEqual({ _: 16 });
  });

  test("replaying the start event gives the same foe whatever the state is now", () => {
    const { r } = scaling();
    const events = encounterStartEvents(r, initialState(r), "e", "seed");
    const later = initialState(r);
    later.stats.level = 50;
    for (const e of events) applyEvent(later, e, r);
    expect(later.encounter!.foe.hp).toBe(300);
    expect(ev(r, later, "foe_max('hp')")).toBe(300);
  });

  test("a formula start with no max sets the max; start is capped by a formula max; healing caps at it", () => {
    const { r } = scaling({ name: "F", stats: { hp: { start: "40 * level" }, ward: { start: "level * 10", max: "level + 2" } } });
    const s = begin(r, initialState(r), "e");
    expect(s.encounter!.foe).toEqual({ hp: 120, ward: 5 });
    expect(s.encounter!.max).toEqual({ hp: 120, ward: 5 });
    applyEvent(s, { t: "foe", stat: "hp", d: +50, src: "manual" }, r);
    expect(s.encounter!.foe.hp).toBe(120);
  });

  test("plain numbers behave as before: no extra state in the start event", () => {
    const { r } = scaling({ name: "F", armor: 2, stats: { hp: { start: 30, max: 40 } } });
    const [start] = encounterStartEvents(r, initialState(r), "e", "seed");
    expect(start).toMatchObject({ t: "enc", id: "e", foe: { hp: 30 } });
    expect("max" in start || "armor" in start).toBe(false);
    const s = begin(r, initialState(r), "e");
    expect(ev(r, s, "foe_max('hp')")).toBe(40);
    expect(turn(r, s, "hit").s.encounter!.foe.hp).toBe(22);
  });

  test("bad values warn and fall back", () => {
    const { issues } = scaling({ name: "F", stats: { hp: { start: "level *", max: "50%" } } });
    const msgs = issues.filter((i) => i.where.startsWith("Encounters › e › foe")).map((i) => i.message).join("\n");
    expect(msgs).toMatch(/Formula "level \*"/);
    expect(msgs).toMatch(/can't be a percentage/);
  });

  test("lint names unknown stats in foe formulas", () => {
    const { r } = scaling({ name: "F", armor: { hp: "levl * 2" }, stats: { hp: { start: "100 * levl" } } });
    const w = lintRuleset(r).filter((i) => i.where.startsWith("Encounters › e › foe")).map((i) => `${i.where}: ${i.message}`).join("\n");
    expect(w).toMatch(/foe › hp: "levl" isn't a stat.*did you mean "level"/);
    expect(w).toMatch(/foe › armor › hp: "levl"/);
  });
});

const boss = () => load({
  stats: { hp: { kind: "meter", start: 100, max: 100, good: "high" } },
  actions: { rest: { label: "Rest", effects: {} } },
  encounters: {
    hollow_king: {
      name: "Hollow King",
      foe: { name: "The Hollow King", stats: { hp: { start: 100, max: 100 } } },
      actions: { wait: { label: "Wait", effects: {} }, cut: { label: "Cut", effects: { foe: { hp: -60 } } } },
      foe_moves: {
        swipe: { desc: "Swipes", weight: 1, when: "foe.hp > 50", hp: -1 },
        rage: { desc: "Rages", weight: 1, when: "foe.hp <= 50 and in_encounter('hollow_king')", hp: -10 },
        summon: { desc: "Summons", weight: 5, when: "encounter_round >= 99", hp: -30 },
      },
      end_when: { won: "foe.hp <= 0", beaten: "hp <= 0" },
    },
    rat: { name: "Rat", foe: { name: "Rat", stats: { hp: 5 } }, actions: { bite: { label: "Bite", effects: { foe: { hp: -1 } } } }, end_when: { won: "foe.hp <= 0" } },
  },
});

describe("boss phases: foe_moves with when:", () => {
  test("only moves whose when holds are weighed", () => {
    const { r, issues } = boss();
    expect(issues.filter((i) => /foe_moves/.test(i.where))).toEqual([]);
    let s = begin(r, initialState(r), "hollow_king");
    for (const seed of ["a", "b", "c", "d"]) {
      const { rec } = turn(r, s, "wait", seed);
      const d = rec.decisions!.find((x) => x.id === "enc_hollow_king_foe")!;
      expect(d.picked).toBe("swipe");
      expect(Object.keys(d.p)).toEqual(["swipe"]);
    }
    s = turn(r, s, "cut").s; // 100 → 40: phase two
    for (const seed of ["a", "b", "c", "d"]) expect(turn(r, s, "wait", seed).rec.decisions!.find((x) => x.id === "enc_hollow_king_foe")!.picked).toBe("rage");
  });

  test("if no move's when holds, every move is weighed (as before)", () => {
    const { r } = load({
      stats: { hp: { kind: "meter", start: 100, max: 100, good: "high" } },
      encounters: { e: {
        foe: { stats: { hp: 10 } }, actions: { wait: { label: "Wait", effects: {} } },
        foe_moves: { a: { when: "false", weight: 1, hp: -1 }, b: { when: "hp > 1000", weight: 1, hp: -1 } },
        end_when: { won: "foe.hp <= 0" },
      } },
    });
    const { rec } = turn(r, begin(r, initialState(r), "e"), "wait");
    expect(Object.keys(rec.decisions!.find((x) => x.id === "enc_e_foe")!.p).sort()).toEqual(["a", "b"]);
  });

  test("in_encounter('id'), encounter and encounter_round name the fight", () => {
    const { r } = boss();
    let s = initialState(r);
    expect(ev(r, s, "in_encounter('hollow_king')")).toBe(false);
    expect(ev(r, s, "encounter")).toBe("");
    s = begin(r, s, "hollow_king");
    expect(ev(r, s, "in_encounter('hollow_king')")).toBe(true);
    expect(ev(r, s, "in_encounter('rat')")).toBe(false);
    expect(ev(r, s, "in_encounter")).toBe(true);
    expect(ev(r, s, "encounter == 'hollow_king'")).toBe(true);
    s = turn(r, s, "wait").s;
    expect(ev(r, s, "encounter_round")).toBe(1);
  });

  test("lint: unknown names in move when, and in_encounter of an unknown encounter", () => {
    const { r } = load({
      stats: { hp: { kind: "meter", start: 100 } },
      triggers: { t: { when: "in_encounter('holow_king')", do: { hp: +1 } } },
      encounters: { hollow_king: {
        foe: { stats: { hp: 10 } }, actions: { wait: { label: "Wait", effects: {} } },
        foe_moves: { a: { when: "fo.hp > 3", hp: -1 } },
        end_when: { won: "foe.hp <= 0" },
      } },
    });
    const w = lintRuleset(r).map((i) => `${i.where}: ${i.message}`).join("\n");
    expect(w).toMatch(/foe_moves › a › when/);
    expect(w).toMatch(/in_encounter\('holow_king'\).*did you mean "hollow_king"/);
  });
});

// rulebooks/_lowfantasy_notes.md #7: the questioning restarted the moment it ended.
const questioning = () => load({
  stats: { suspicion: { kind: "meter", start: 50 }, nerve: { kind: "meter", start: 50, good: "high" } },
  locations: { market_square: { name: "Market", exits: ["lane"] }, lane: { name: "Lane", exits: ["market_square"] } },
  start: { location: "market_square" },
  actions: { wait: { label: "Wait", effects: {} }, go_lane: { label: "Lane", effects: { move: "lane" } }, go_market: { label: "Market", effects: { move: "market_square" } } },
  triggers: {
    questioned: { when: "suspicion >= 45 and at('market_square') and not in_encounter", do: { start_encounter: "the_questioning" } },
  },
  encounters: {
    the_questioning: {
      name: "The Questioning", foe: { name: "Witchfinder", stats: { will: { start: 10 } } },
      actions: { confess: { label: "Confess", effects: { end: "condemned" } }, run: { label: "Run", effects: { end: "fled" } } },
      end_when: { won: "foe.will <= 0" },
      outcomes: { fled: { start_encounter: "chase" } },
    },
    chase: { name: "Chase", foe: { stats: { breath: 5 } }, actions: { hide: { label: "Hide", effects: { end: "lost_them" } } }, end_when: { won: "foe.breath <= 0" } },
  },
});

describe("a rule can't restart the encounter that just ended", () => {
  test("the edge trigger starts it once; ending it doesn't restart it in the same turn", () => {
    const { r } = questioning();
    let s = turn(r, initialState(r), "wait").s;
    expect(s.encounter?.id).toBe("the_questioning");
    const { rec, s: after } = turn(r, s, "confess", "b");
    expect(after.encounter).toBeNull();
    expect(rec.events.filter((e) => e.t === "enc" && e.id)).toEqual([]);
    s = after;
    // Still standing in the market: the rule stays fired, so it doesn't come back next turn either…
    s = turn(r, s, "wait", "c").s;
    expect(s.encounter).toBeNull();
    // …but leaving and coming back later is a new edge.
    s = turn(r, s, "go_lane", "d").s;
    applyEvent(s, { t: "time", min: 120, src: "manual" }, r);
    s = turn(r, s, "go_market", "e").s;
    expect(s.encounter?.id).toBe("the_questioning");
  });

  test("an outcome can still chain into a different encounter", () => {
    const { r } = questioning();
    const s = turn(r, initialState(r), "wait").s;
    expect(turn(r, s, "run", "b").s.encounter?.id).toBe("chase");
  });
});

describe("lint: a move that wears a stat the foe doesn't have", () => {
  // rulebooks/_repro_misc.yaml, encounters e and f.
  const misc = () => load({
    stats: { hp: { kind: "meter", start: 50 } },
    abilities: { strike: { name: "Strike", effects: { foe: { hp: -5 } } } },
    encounters: {
      e: { foe: { stats: { hp: { start: 30, max: 30 } } }, actions: { hit: { label: "Hit", effects: { foe: { hp: -10 } } } }, end_when: { won: "foe.hp <= 0" } },
      f: {
        foe: { name: "G", stats: { seals: { start: 30, max: 30 } } },
        actions: {
          hit: { label: "Hit", effects: { foe: { hp: -10 } } },
          break: { label: "Break", check: { stat: "hp", target: 50 }, success: { foe: { seal: -1 } }, fail: { decide: { ask: "?", options: { a: { foe: { hp: -1 } }, b: { foe: { seals: -1 } } } } } },
        },
        foe_moves: { mend: { desc: "Mends", hp: -1, foe: { seal: +1 } } },
        start: { foe: { seals: -2 } },
        end_when: { won: "foe.seals <= 0", beaten: "hp <= 0" },
      },
    },
  });
  test("warns where the change does nothing, and only there", () => {
    const { r } = misc();
    const w = lintRuleset(r).filter((i) => /changes foe stat/.test(i.message)).map((i) => `${i.where}: ${i.message}`);
    expect(w.some((x) => x.startsWith("Encounters › f › actions › hit › effects:") && /"hp", but G only has seals/.test(x))).toBe(true);
    expect(w.some((x) => /f › actions › break › success:.*"seal".*did you mean "seals"/.test(x))).toBe(true);
    expect(w.some((x) => /f › actions › break › fail › decide › .* › a:.*"hp"/.test(x))).toBe(true);
    expect(w.some((x) => /f › foe_moves › mend:.*"seal"/.test(x))).toBe(true);
    expect(w.some((x) => /Encounters › e/.test(x))).toBe(false);
    expect(w.some((x) => /Abilities/.test(x))).toBe(false); // shared moves just miss foes without the stat
    expect(w.some((x) => /f › start/.test(x))).toBe(false);
  });
});
