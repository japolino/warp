import { describe, expect, test } from "bun:test";
import yaml from "js-yaml";
import { seededRng } from "../dice.js";
import { lintRuleset } from "../lint.js";
import { normalizeRuleset, type Ruleset } from "../ruleset.js";
import { resolveTurn } from "../resolve.js";
import { foldEvents, initialState, type GameState } from "../state.js";
import { buildChoices, narratorKnowledge, stateDigest } from "../view.js";
import { generateFloor, key } from "./floor.js";
import {
  battleCommand, chooseEvent, choicesFor, descend, enterDungeon, leaveDungeon, memberFighter, classFor, moveTo, shopBuy, useItem, type DungeonResult,
} from "./run.js";
import { buildDungeonEntries, buildDungeonView } from "./view.js";

const RULES = yaml.load(`
name: Dungeon Test
start: { location: town }
stats:
  money: { kind: money, start: 10 }
  stress: { kind: meter, good: low, start: 0 }
locations:
  town: { name: Town, exits: [field] }
  field: { name: Field, exits: [town] }
items:
  relic: Old relic
relationships:
  stats:
    trust: { start: 50, narrator: 5 }
    lust: { start: 0, good: none, narrator: 5 }
  people:
    mira: { name: Mira, age: 24 }
dungeons:
  mines:
    name: The Old Mines
    at: [town]
    loot: { relic: 1 }
    on_defeat: { stress: +20 }
`);

function rules(): Ruleset {
  const { ruleset, issues } = normalizeRuleset(RULES);
  expect(issues.filter((i) => i.level === "error")).toEqual([]);
  return ruleset!;
}

function apply(r: Ruleset, s: GameState, res: DungeonResult): GameState {
  expect(res.error).toBeUndefined();
  return foldEvents(r, [res.events], s);
}

function enter(r: Ruleset, seed = "seed-1", mates: string[] = ["mira"]) {
  return apply(r, initialState(r), enterDungeon(r, initialState(r), "mines", mates, seed));
}

describe("dungeon basics", () => {
  test("a bare entry gets the built-in content and lints clean", () => {
    const r = rules();
    const d = r.dungeons.mines;
    expect(Object.keys(d.monsters).length).toBeGreaterThan(30);
    expect(Object.keys(d.events).length).toBeGreaterThan(5);
    expect(d.tiles.enemy).toBeGreaterThan(0);
    expect(lintRuleset(r)).toEqual([]);
  });

  test("floors are dealt from the seed: one way down, the start is safe", () => {
    const r = rules();
    const a = generateFloor(r.dungeons.mines, "s", 1);
    const b = generateFloor(r.dungeons.mines, "s", 1);
    expect(a).toEqual(b);
    const flat = a.tiles.flat();
    expect(flat.filter((k) => k === "stairs")).toHaveLength(1);
    expect(a.tiles[a.start[1]][a.start[0]]).toBe("start");
    const boss = generateFloor(r.dungeons.mines, "s", 5);
    expect(boss.tiles[boss.stairs[1]][boss.stairs[0]]).toBe("boss");
    expect(boss.size).toBeGreaterThan(a.size);
  });

  test("the entrance shows only where the dungeon is", () => {
    const r = rules();
    const s = initialState(r);
    expect(buildChoices(r, s, { lines: [], veils: [] }).some((c) => c.id === "dungeon:enter:mines")).toBe(true);
    expect(buildDungeonEntries(r, s)[0].companions.map((c) => c.id)).toContain("mira");
    const away = foldEvents(r, [[{ t: "move", to: "field", src: "action" }]], s);
    expect(buildDungeonEntries(r, away)).toEqual([]);
  });

  test("entering starts a run, tells the narrator, and swaps the choices", () => {
    const r = rules();
    const res = enterDungeon(r, initialState(r), "mines", ["mira"], "seed-1");
    expect(res.narrate?.say).toContain("The Old Mines");
    const s = apply(r, initialState(r), res);
    expect(s.dungeon?.party.map((p) => p.id)).toEqual(["you", "mira"]);
    expect(s.notices.join(" ")).toContain("goes down into The Old Mines with Mira");
    expect(buildChoices(r, s, { lines: [], veils: [] }).map((c) => c.id)).toEqual(["dungeon:open", "dungeon:leave"]);
    expect(stateDigest(r, s)).toContain("IN A DUNGEON: The Old Mines, floor 1");
    const next = resolveTurn(r, s, { actionId: "dungeon", via: "choice" }, { seed: "n" });
    expect(next.hints.join(" ")).toContain("The Old Mines");
  });

  test("you move one tile at a time; stepping flips the tile", () => {
    const r = rules();
    const s = enter(r);
    const [x, y] = s.dungeon!.pos;
    expect(moveTo(r, s, x + 2, y).error).toBeTruthy();
    const view = buildDungeonView(r, s)!;
    const target = view.tiles.find((t) => t.reachable)!;
    const after = apply(r, s, moveTo(r, s, target.x, target.y));
    expect(after.dungeon!.pos).toEqual([target.x, target.y]);
    expect(buildDungeonView(r, after)!.tiles.find((t) => t.x === target.x && t.y === target.y)!.state).toBe("here");
    expect(after.minutes).toBeGreaterThan(s.minutes);
  });
});

describe("fights, events and the way out", () => {
  /** Find a tile of a kind on the current floor and teleport next to it (tests only). */
  function nextTo(r: Ruleset, s: GameState, kind: string): { s: GameState; x: number; y: number } | null {
    const f = generateFloor(r.dungeons.mines, s.dungeon!.seed, s.dungeon!.depth);
    for (let y = 0; y < f.size; y++) for (let x = 0; x < f.size; x++) {
      if (f.tiles[y][x] !== kind) continue;
      const from: [number, number] | null = x > 0 ? [x - 1, y] : x < f.size - 1 ? [x + 1, y] : null;
      if (!from) continue;
      return { s: foldEvents(r, [[{ t: "dg_step", x: from[0], y: from[1], src: "action" }, { t: "dg_clear", key: key(...from), src: "action" }]], s), x, y };
    }
    return null;
  }

  function findSeed(r: Ruleset, kind: string): { s: GameState; x: number; y: number } {
    for (let i = 0; i < 200; i++) {
      const hit = nextTo(r, enter(r, `seed-${i}`), kind);
      if (hit) return hit;
    }
    throw new Error(`no ${kind} tile found`);
  }

  test("an enemy tile starts a fight; winning pays out and clears the tile", () => {
    const r = rules();
    const { s, x, y } = findSeed(r, "enemy");
    let st = apply(r, s, moveTo(r, s, x, y));
    expect(st.dungeon!.battle).not.toBeNull();
    expect(moveTo(r, st, x, y).error).toBeTruthy(); // can't walk away mid-fight
    st = apply(r, st, battleCommand(r, st, { auto: "battle" }));
    expect(st.dungeon?.battle ?? null).toBeNull();
    if (st.dungeon) {
      expect(st.dungeon.xp).toBeGreaterThan(0);
      expect(st.dungeon.cleared).toContain(key(x, y));
    }
  });

  test("events wait for a choice, then tell the narrator", () => {
    const r = rules();
    const { s, x, y } = findSeed(r, "event");
    let st = apply(r, s, moveTo(r, s, x, y));
    const open = choicesFor(r, st)!;
    expect(open).not.toBeNull();
    const res = chooseEvent(r, st, open.choices[open.choices.length - 1].id);
    expect(res.narrate).toBeTruthy();
    st = apply(r, st, res);
    expect(st.dungeon?.pending ?? null).toBeNull();
    expect(st.notices.join(" ")).toContain("chose");
  });

  test("romance moments are with a companion and move the relationship", () => {
    const r = rules();
    const { s, x, y } = findSeed(r, "romance");
    let st = apply(r, s, moveTo(r, s, x, y));
    const open = choicesFor(r, st)!;
    expect(open.target).toBe("mira");
    const trust = st.rel.mira.trust;
    const safe = open.choices.find((c) => c.chance === undefined)!;
    st = apply(r, st, chooseEvent(r, st, safe.id));
    expect(st.rel.mira.trust).toBeGreaterThan(trust);
  });

  test("a generated resident with no known age never gets a dungeon romance scene", () => {
    const raw = structuredClone(RULES) as any;
    raw.locations.cove = { name: "Cove", exits: ["town"] };
    raw.relationships.people.drift = { name: "Drift", schedule: [{ at: "cove" }] };
    const { ruleset } = normalizeRuleset(raw);
    const r = ruleset!;
    for (let i = 0; i < 200; i++) {
      // The resident's place was discovered, so they count as generated.
      const base = foldEvents(r, [[{ t: "discovered", id: "cove", src: "action" }]], initialState(r));
      const s = apply(r, base, enterDungeon(r, base, "mines", ["drift"], `seed-${i}`));
      const hit = nextTo(r, s, "romance");
      if (!hit) continue;
      const st = apply(r, hit.s, moveTo(r, hit.s, hit.x, hit.y));
      expect(choicesFor(r, st)?.target).not.toBe("drift");
      // Once the story establishes they're an adult, romance can include them.
      const known = foldEvents(r, [[{ t: "dt_pref", who: "drift", key: "__adult", v: 1, src: "action" }]], hit.s);
      const after = apply(r, known, moveTo(r, known, hit.x, hit.y));
      expect(choicesFor(r, after)?.target).toBe("drift");
      return;
    }
    throw new Error("no romance tile found");
  });

  test("the shop sells for run gold", () => {
    const r = rules();
    const { s, x, y } = findSeed(r, "shop");
    let st = apply(r, s, moveTo(r, s, x, y));
    expect(shopBuy(r, st, "potion").error).toBeTruthy(); // no gold yet
    st = foldEvents(r, [[{ t: "dg_gold", d: 100, src: "action" }]], st);
    st = apply(r, st, shopBuy(r, st, "potion"));
    expect(st.dungeon!.bag.potion).toBe(3);
  });

  test("going down needs the stairs; leaving banks gold and loot", () => {
    const r = rules();
    let s = enter(r);
    expect(descend(r, s).error).toBeTruthy();
    const f = generateFloor(r.dungeons.mines, s.dungeon!.seed, 1);
    s = foldEvents(r, [[{ t: "dg_step", x: f.stairs[0], y: f.stairs[1], src: "action" }]], s);
    s = apply(r, s, descend(r, s));
    expect(s.dungeon!.depth).toBe(2);
    expect(s.deepest.mines).toBe(2);
    s = foldEvents(r, [[{ t: "dg_gold", d: 40, src: "action" }, { t: "dg_loot", item: "relic", d: 1, src: "action" }]], s);
    const out = leaveDungeon(r, s);
    expect(out.narrate).toBeTruthy();
    s = apply(r, s, out);
    expect(s.dungeon).toBeNull();
    expect(s.stats.money).toBe(50);
    expect(s.items.relic).toBe(1);
  });

  test("being wiped out loses the run's haul and applies on_defeat", () => {
    const r = rules();
    const { s, x, y } = findSeed(r, "elite");
    let st = foldEvents(r, [[{ t: "dg_gold", d: 99, src: "action" }]], s);
    st = apply(r, st, moveTo(r, st, x, y));
    // Knock the party down to almost nothing, then let the fight play out.
    const b = structuredClone(st.dungeon!.battle!);
    for (const f of b.fighters) if (f.side === "party") f.hp = 1;
    st = foldEvents(r, [[{ t: "dg_battle", battle: b, src: "action" }]], st);
    for (let i = 0; i < 50 && st.dungeon?.battle; i++) st = apply(r, st, battleCommand(r, st, { skill: "guard" }));
    expect(st.dungeon).toBeNull();
    expect(st.stats.money).toBe(10);
    expect(st.stats.stress).toBe(20);
    expect(narratorKnowledge(r, st)).toBeNull();
    expect(st.notices.join(" ")).toContain("overwhelmed");
  });
});

describe("balance", () => {
  /** A simple player: explore toward unvisited tiles, auto-battle, take the safe option, go down when found. */
  function dive(r: Ruleset, seed: string, maxDepth: number): { depth: number; died: boolean; fights: number; won: number } {
    let s = enter(r, seed);
    const rng = seededRng(`bot:${seed}`);
    let fights = 0, won = 0;
    for (let step = 0; step < 600 && s.dungeon; step++) {
      const run = s.dungeon;
      if (run.battle) {
        const was = run.battle;
        s = apply(r, s, battleCommand(r, s, { auto: "battle" }));
        fights++;
        if (!s.dungeon) return { depth: was ? run.depth : 0, died: true, fights, won };
        won++;
        continue;
      }
      if (run.pending) {
        const open = choicesFor(r, s)!;
        const safe = open.choices.find((c) => c.chance === undefined && c.ok) ?? open.choices[0];
        s = apply(r, s, chooseEvent(r, s, safe.id));
        continue;
      }
      const v = buildDungeonView(r, s)!;
      if (v.here.canDescend) {
        if (run.depth >= maxDepth) return { depth: run.depth, died: false, fights, won };
        s = apply(r, s, descend(r, s));
        continue;
      }
      const options = v.tiles.filter((t) => t.reachable);
      const fresh = options.filter((t) => t.state === "hidden");
      const pick = (fresh.length ? fresh : options)[Math.floor(rng() * (fresh.length ? fresh.length : options.length))];
      // Drink a potion when someone is low.
      const low = v.party.find((p) => p.alive && p.hp < p.mhp * 0.4);
      if (low && (run.bag.potion ?? 0) > 0) { s = apply(r, s, useItem(r, s, "potion", low.id)); continue; }
      s = apply(r, s, moveTo(r, s, pick.x, pick.y));
    }
    return { depth: s.dungeon?.depth ?? 0, died: !s.dungeon, fights, won };
  }

  test("floor 1 is survivable, and depth gets dangerous", () => {
    const r = rules();
    const shallow = Array.from({ length: 40 }, (_, i) => dive(r, `b1-${i}`, 2));
    const survived = shallow.filter((x) => !x.died).length / shallow.length;
    const deep = Array.from({ length: 40 }, (_, i) => dive(r, `b2-${i}`, 12));
    const reached = (n: number) => deep.filter((x) => x.depth >= n).length / deep.length;
    // Printed for tuning; the bars below are loose on purpose.
    console.log(`floors 1–2 survival ${Math.round(survived * 100)}% · reached floor 5: ${Math.round(reached(5) * 100)}% · floor 10: ${Math.round(reached(10) * 100)}%`);
    expect(survived).toBeGreaterThan(0.8);
    expect(reached(5)).toBeGreaterThan(0.6);
    expect(reached(10)).toBeLessThan(0.5);
  }, 30000);
});


describe("authored dungeon carryover", () => {
  function configured(extra: Record<string, unknown> = {}) {
    const raw = structuredClone(RULES) as any;
    raw.stats.sword = { kind: "skill", start: 10, max: 12, growth: 1 };
    raw.dungeons.mines = { ...raw.dungeons.mines,
      party: { classes: { mira: "healer" }, stats: { mira: { atk: "10 + rel_bond(target) / 5", hp: "sword * 10" } } },
      supplies: { bomb: 3 },
      exit_rewards: { money: { amount: "run_gold + run_xp", cap: 4 } },
      exit_practice: { sword: { amount: "run_xp / 10", cap: 2.5 } }, ...extra };
    return normalizeRuleset(raw);
  }

  test("defaults keep run-only growth and original supplies", () => {
    const r = rules();
    let s = enter(r);
    expect(s.dungeon!.bag).toEqual({ potion: 2, ether: 0, bomb: 0 });
    const before = structuredClone(s.stats);
    s = foldEvents(r, [[{ t: "dg_xp", d: 500, src: "action" }]], s);
    s = apply(r, s, leaveDungeon(r, s));
    expect(s.stats).toEqual(before);
    expect(s.practice).toEqual({});
  });

  test("companion formulas use live relationships but retain authored class and skills", () => {
    const r = configured().ruleset!;
    let s = enter(r);
    const d = r.dungeons.mines;
    const m = s.dungeon!.party.find((p) => p.id === "mira")!;
    const f = memberFighter(r, s, d, s.dungeon!, m);
    expect(classFor(d, "mira")).toBe("healer");
    expect(f.mhp).toBe(100);
    expect(f.atk).toBe(20);
    s = foldEvents(r, [[{ t: "rel", who: "mira", stat: "trust", set: 100, src: "action" }]], s);
    const warmer = memberFighter(r, s, d, s.dungeon!, m);
    expect(warmer.atk).toBe(30);
    expect(warmer.skills).toEqual(f.skills);
    expect(s.dungeon!.bag).toEqual({ potion: 2, ether: 0, bomb: 3 });
  });

  test("earned exit retains bounded stat and practice improvements and cannot pay twice", () => {
    const r = configured().ruleset!;
    let s = enter(r);
    s = foldEvents(r, [[{ t: "dg_xp", d: 100, src: "action" }]], s);
    const res = leaveDungeon(r, s);
    s = apply(r, s, res);
    expect(s.stats.money).toBe(14);
    expect(s.stats.sword).toBe(12);
    expect(s.practice.sword ?? 0).toBe(0);
    expect(leaveDungeon(r, s).error).toBeTruthy();
    expect(s.dungeon).toBeNull();
  });

  test("reward events report only retained room under live stat caps", () => {
    const r = configured().ruleset!;
    r.stats.money.max = 12;
    let s = enter(r);
    s = foldEvents(r, [[{ t: "dg_xp", d: 100, src: "action" }]], s);
    const res = leaveDungeon(r, s);
    expect(res.events.filter((e) => e.t === "stat" && e.id === "money")).toEqual([{ t: "stat", id: "money", d: 2, src: "action" }]);
    expect(apply(r, s, res).stats.money).toBe(12);
  });

  test("banked gold reports only the gold actually retained at the money cap", () => {
    const r = rules();
    r.stats.money.max = 12;
    let s = enter(r);
    s = foldEvents(r, [[{ t: "dg_gold", d: 99, src: "action" }]], s);
    const res = leaveDungeon(r, s);
    expect(res.events.filter((e) => e.t === "stat" && e.id === "money")).toEqual([{ t: "stat", id: "money", d: 2, src: "action" }]);
    s = apply(r, s, res);
    expect(s.stats.money).toBe(12);
    expect(s.notices.join(" ")).toContain("carrying 2 gold");
  });

  test("fractional practice survives below its cap and grants whole points normally", () => {
    const r = configured().ruleset!;
    r.stats.sword.max = 100;
    let s = enter(r);
    s = foldEvents(r, [[{ t: "dg_xp", d: 100, src: "action" }]], s);
    s = apply(r, s, leaveDungeon(r, s));
    expect(s.stats.sword).toBe(12);
    expect(s.practice.sword).toBe(0.5);
  });

  test("empty exits, negative and nonfinite formulas do not grant carryover", () => {
    const r = configured().ruleset!;
    const empty = apply(r, enter(r), leaveDungeon(r, enter(r)));
    expect(empty.stats.money).toBe(10);
    expect(empty.stats.sword).toBe(10);
    r.dungeons.mines.exitRewards!.money.amount = "-5";
    r.dungeons.mines.exitPractice!.sword.amount = "1 / 0";
    let s = enter(r);
    s = foldEvents(r, [[{ t: "dg_xp", d: 100, src: "action" }]], s);
    s = apply(r, s, leaveDungeon(r, s));
    expect(s.stats.money).toBe(10);
    expect(s.stats.sword).toBe(10);
    expect(Object.values(s.stats).every(Number.isFinite)).toBe(true);
  });

  test("malformed configuration warns and omits unsafe mappings", () => {
    const res = configured({ party: { stats: { mira: { luck: 3, atk: {} } } },
      supplies: { potion: -5, unknown: 1 },
      exit_rewards: { missing: { amount: 5, cap: 2 }, money: { amount: 5, cap: Infinity } },
      exit_practice: { sword: { amount: 1 } } });
    expect(res.issues.length).toBeGreaterThanOrEqual(6);
    const d = res.ruleset!.dungeons.mines;
    expect(d.exitRewards).toBeUndefined();
    expect(d.exitPractice).toBeUndefined();
    expect(d.supplies).toEqual({ potion: 0 });
    expect(d.party.stats!.mira).toEqual({});
  });

  test("defeat never grants the authored exit carryover", () => {
    const r = configured().ruleset!;
    let s = enter(r);
    const f = generateFloor(r.dungeons.mines, s.dungeon!.seed, 1);
    let at: [number, number] | undefined;
    for (let y = 0; y < f.size; y++) for (let x = 0; x < f.size; x++) if (f.tiles[y][x] === "enemy") at = [x, y];
    expect(at).toBeDefined();
    const [x, y] = at!;
    s = foldEvents(r, [[{ t: "dg_step", x: x > 0 ? x - 1 : x + 1, y, src: "action" }, { t: "dg_xp", d: 100, src: "action" }]], s);
    s = apply(r, s, moveTo(r, s, x, y));
    const b = structuredClone(s.dungeon!.battle!);
    for (const fighter of b.fighters) if (fighter.side === "party") { fighter.hp = 1; fighter.def = 0; }
    s = foldEvents(r, [[{ t: "dg_battle", battle: b, src: "action" }]], s);
    for (let i = 0; i < 50 && s.dungeon; i++) s = apply(r, s, battleCommand(r, s, { skill: "guard" }));
    expect(s.dungeon).toBeNull();
    expect(s.stats.money).toBe(10);
    expect(s.stats.sword).toBe(10);
    expect(s.practice.sword ?? 0).toBe(0);
  });
});
