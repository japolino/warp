import { describe, expect, test } from "bun:test";
import yaml from "js-yaml";
import { normalizeRuleset, type Ruleset } from "../ruleset.js";
import { foldEvents, initialState, type GameState, type WarpEvent } from "../state.js";
import { BOONS, learnable, rollBoonOffer } from "./boons.js";
import { generateFloor, key } from "./floor.js";
import {
  battleCommand, boonChoices, chooseBoon, chooseEvent, choicesFor, descend, enterDungeon, leaveDungeon, levelOf, memberFighter, moveTo, type DungeonResult,
} from "./run.js";
import { buildDungeonView } from "./view.js";

const base = (boons: boolean) => yaml.load(`
name: Boon Test
start: { location: town }
stats:
  money: { kind: money, start: 10 }
  stress: { kind: meter, good: low, start: 0 }
locations:
  town: { name: Town, exits: [field] }
  field: { name: Field, exits: [town] }
relationships:
  stats:
    trust: { start: 50 }
  people:
    mira: { name: Mira, age: 24 }
dungeons:
  mines:
    name: The Old Mines
    at: [town]
    on_defeat: { stress: +20 }
${boons ? "    boons: true" : ""}
`);

function rules(boons = true): Ruleset {
  const { ruleset, issues } = normalizeRuleset(base(boons));
  expect(issues.filter((i) => i.level === "error")).toEqual([]);
  return ruleset!;
}

/** Fold a result and keep the batch so the whole run can be replayed. */
function apply(r: Ruleset, s: GameState, res: DungeonResult, log?: WarpEvent[][]): GameState {
  expect(res.error).toBeUndefined();
  log?.push(res.events);
  return foldEvents(r, [res.events], s);
}

function enter(r: Ruleset, seed: string, log?: WarpEvent[][]) {
  return apply(r, initialState(r), enterDungeon(r, initialState(r), "mines", ["mira"], seed), log);
}

/** Teleport next to an enemy tile with 11 XP banked, so winning crosses level 2. */
function beforeLevelUp(r: Ruleset, log?: WarpEvent[][]): { s: GameState; x: number; y: number } {
  for (let i = 0; i < 200; i++) {
    const s0 = enter(r, `boon-${i}`, log);
    const f = generateFloor(r.dungeons.mines, s0.dungeon!.seed, 1);
    for (let y = 0; y < f.size; y++) for (let x = 1; x < f.size; x++) {
      if (f.tiles[y][x] !== "enemy") continue;
      const setup: WarpEvent[] = [{ t: "dg_step", x: x - 1, y, src: "action" }, { t: "dg_clear", key: key(x - 1, y), src: "action" }, { t: "dg_xp", d: 11, src: "action" }];
      log?.push(setup);
      return { s: foldEvents(r, [setup], s0), x, y };
    }
    log?.splice(0);
  }
  throw new Error("no enemy tile found");
}

function winFight(r: Ruleset, log?: WarpEvent[][]): GameState {
  const { s, x, y } = beforeLevelUp(r, log);
  let st = apply(r, s, moveTo(r, s, x, y), log);
  // Keep the party alive so the test is about boons, not luck.
  const b = structuredClone(st.dungeon!.battle!);
  for (const f of b.fighters) if (f.side === "foe") f.hp = 1;
  const rig: WarpEvent[] = [{ t: "dg_battle", battle: b, src: "action" }];
  log?.push(rig);
  st = foldEvents(r, [rig], st);
  for (let i = 0; i < 20 && st.dungeon?.battle; i++) st = apply(r, st, battleCommand(r, st, { auto: "battle" }), log);
  expect(st.dungeon?.battle ?? null).toBeNull();
  expect(levelOf(st.dungeon!.xp)).toBeGreaterThanOrEqual(2);
  return st;
}

const neighbour = (r: Ruleset, s: GameState) => {
  const f = generateFloor(r.dungeons.mines, s.dungeon!.seed, s.dungeon!.depth);
  const [x, y] = s.dungeon!.pos;
  return ([[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]).find(([a, b]) => a >= 0 && b >= 0 && a < f.size && b < f.size)!;
};

describe("level-up boons", () => {
  test("off by default: leveling up offers nothing and stats are unchanged", () => {
    const r = rules(false);
    expect(r.dungeons.mines.boons).toBeUndefined();
    const st = winFight(r);
    expect(st.dungeon!.boonOffer ?? null).toBeNull();
    expect(st.dungeon!.boons).toBeUndefined();
    expect(boonChoices(r, st)).toBeNull();
    const [x, y] = neighbour(r, st);
    expect(moveTo(r, st, x, y).error).toBeUndefined();
  });

  test("malformed boons key warns and stays off", () => {
    const { ruleset, issues } = normalizeRuleset(yaml.load(`
name: X
start: { location: town }
locations: { town: { name: Town } }
dungeons: { mines: { at: [town], boons: "yes" } }
`));
    expect(ruleset!.dungeons.mines.boons).toBeUndefined();
    expect(issues.some((i) => i.where.includes("boons"))).toBe(true);
  });

  test("offers are three distinct seeded boons, the same for the same run and picks", () => {
    const run = { seed: "abc", boons: [] as string[] };
    const a = rollBoonOffer(run, 2, "adventurer");
    expect(a).toEqual(rollBoonOffer({ ...run }, 2, "adventurer"));
    expect(a.options).toHaveLength(3);
    expect(new Set(a.options).size).toBe(3);
    expect(a.options.filter((o) => o.startsWith("learn:")).length).toBeLessThanOrEqual(1);
    for (const o of a.options) expect(o.startsWith("learn:") ? learnable("adventurer", []).includes(o.slice(6)) : !!BOONS[o]).toBe(true);
    // Different seeds or levels vary.
    const many = new Set(Array.from({ length: 20 }, (_, i) => rollBoonOffer({ seed: `s${i}`, boons: [] }, 2, "adventurer").options.join()));
    expect(many.size).toBeGreaterThan(1);
    // Maxed boons stop showing up.
    const maxed = rollBoonOffer({ seed: "abc", boons: ["second_wind"] }, 3, "adventurer");
    expect(maxed.options).not.toContain("second_wind");
    // Never offers a skill the class already has.
    expect(learnable("adventurer", [])).not.toContain("fire");
    expect(learnable("adventurer", ["learn:cleave"])).not.toContain("cleave");
  });

  test("a level-up blocks moving and descending until a boon is chosen", () => {
    const r = rules();
    const st = winFight(r);
    const offer = st.dungeon!.boonOffer!;
    expect(offer.level).toBe(2);
    expect(offer.options).toHaveLength(3);
    const [x, y] = neighbour(r, st);
    expect(moveTo(r, st, x, y).error).toBeTruthy();
    expect(descend(r, st).error).toBeTruthy();
    const v = buildDungeonView(r, st)!;
    expect(v.tiles.some((t) => t.reachable)).toBe(false);
    expect(v.event!.text).toContain("Level 2");
    expect(v.event!.choices.map((c) => c.id)).toEqual(offer.options.map((o) => `boon:${o}`));
    expect(chooseBoon(r, st, "nope").error).toBeTruthy();
    const next = apply(r, st, chooseEvent(r, st, v.event!.choices[0].id));
    expect(next.dungeon!.boonOffer ?? null).toBeNull();
    expect(next.dungeon!.boons).toEqual([offer.options[0]]);
    expect(moveTo(r, next, x, y).error).toBeUndefined();
  });

  test("each kind of boon applies for the run", () => {
    const r = rules();
    const st = winFight(r);
    const d = r.dungeons.mines;
    const run = st.dungeon!;
    const before = memberFighter(r, st, d, run, run.party[0]);
    const offer = (options: string[]) => foldEvents(r, [[{ t: "dg_boon_offer", offer: { level: 2, options }, src: "action" }]], st);
    const pick = (id: string) => { const s = offer([id]); return apply(r, s, chooseBoon(r, s, id)); };
    const f = (s: GameState) => memberFighter(r, s, d, s.dungeon!, s.dungeon!.party[0]);
    expect(f(pick("might")).atk).toBeGreaterThan(before.atk);
    expect(f(pick("bulwark")).def).toBeGreaterThan(before.def);
    expect(f(pick("arcana")).mat).toBeGreaterThan(before.mat);
    expect(f(pick("vigor")).mhp).toBeGreaterThan(before.mhp);
    expect(f(pick("keen")).crit).toBeCloseTo(0.1);
    expect(before.crit).toBeUndefined();
    expect(pick("supplies").dungeon!.bag.potion).toBe(run.bag.potion + 2);
    expect(pick("focus").dungeon!.bag.ether).toBe((run.bag.ether ?? 0) + 2);
    const learned = pick("learn:cleave");
    expect(f(learned).skills).toContain("cleave");
    // Companions keep their own class skills.
    expect(memberFighter(r, learned, d, learned.dungeon!, learned.dungeon!.party[1]).skills).not.toContain("cleave");
    // Second wind: the stairs heal more.
    const hurt = (s: GameState) => {
      const fl = generateFloor(d, s.dungeon!.seed, 1);
      return foldEvents(r, [[{ t: "dg_party", party: s.dungeon!.party.map((m) => ({ ...m, hp: 1 })), src: "action" }, { t: "dg_step", x: fl.stairs[0], y: fl.stairs[1], src: "action" }, { t: "dg_clear", key: key(...fl.stairs), src: "action" }]], s);
    };
    const plain = hurt(foldEvents(r, [[{ t: "dg_boon", id: "might", src: "action" }]], st));
    const windy = hurt(pick("second_wind"));
    const down = (s: GameState) => apply(r, s, descend(r, s)).dungeon!.party[0].hp;
    expect(down(windy)).toBeGreaterThan(down(plain));
  });

  test("several levels at once queue one offer after another", () => {
    const r = rules();
    const st = winFight(r);
    // Jump far past level 2 with a story reward.
    const s2 = foldEvents(r, [[{ t: "dg_xp", d: 200, src: "action" }]], st);
    let s = s2;
    const levels: number[] = [];
    for (let i = 0; i < 10 && s.dungeon!.boonOffer; i++) {
      levels.push(s.dungeon!.boonOffer!.level);
      s = apply(r, s, chooseBoon(r, s, s.dungeon!.boonOffer!.options[0]));
    }
    expect(levels).toEqual(Array.from({ length: levelOf(s.dungeon!.xp) - 1 }, (_, i) => i + 2));
    expect(s.dungeon!.boons).toHaveLength(levelOf(s.dungeon!.xp) - 1);
  });

  test("replaying the recorded events rebuilds the same offer and boons", () => {
    const r = rules();
    const log: WarpEvent[][] = [];
    let st = winFight(r, log);
    const res = chooseBoon(r, st, st.dungeon!.boonOffer!.options[1]);
    // Same state, same choice: the same events (a swipe or regenerate replays identically).
    expect(chooseBoon(r, st, st.dungeon!.boonOffer!.options[1]).events).toEqual(res.events);
    st = apply(r, st, res, log);
    const replayed = foldEvents(r, log);
    expect(replayed.dungeon).toEqual(st.dungeon);
    // Undo (drop the last batch): the offer is waiting again, unchanged.
    const undone = foldEvents(r, log.slice(0, -1));
    expect(undone.dungeon!.boonOffer).toEqual(winFight(r).dungeon!.boonOffer);
  });

  test("boons last only for the run; leaving clears them and any waiting offer", () => {
    const r = rules();
    const st = winFight(r);
    const picked = apply(r, st, chooseBoon(r, st, st.dungeon!.boonOffer!.options[0]));
    expect(picked.dungeon!.boons).toHaveLength(1);
    // Leave with a boon taken.
    const out = apply(r, picked, leaveDungeon(r, picked));
    expect(out.dungeon).toBeNull();
    // Leave with an offer still waiting.
    const out2 = apply(r, st, leaveDungeon(r, st));
    expect(out2.dungeon).toBeNull();
    // A new run starts clean.
    const again = apply(r, out, enterDungeon(r, out, "mines", ["mira"], "fresh"));
    expect(again.dungeon!.boons).toBeUndefined();
    expect(again.dungeon!.boonOffer).toBeUndefined();
    const d = r.dungeons.mines;
    const plain = rules(false);
    const plainRun = apply(plain, out, enterDungeon(plain, out, "mines", ["mira"], "fresh"));
    expect(memberFighter(r, again, d, again.dungeon!, again.dungeon!.party[0])).toEqual(memberFighter(plain, plainRun, plain.dungeons.mines, plainRun.dungeon!, plainRun.dungeon!.party[0]));
  });

  test("defeat clears a waiting offer with the run", () => {
    const r = rules();
    const st = winFight(r);
    expect(st.dungeon!.boonOffer).toBeTruthy();
    // Story fight while the offer waits: battles still play, the boon waits for the end.
    const f = generateFloor(r.dungeons.mines, st.dungeon!.seed, 1);
    let target: [number, number] | null = null;
    for (let y = 0; y < f.size && !target; y++) for (let x = 0; x < f.size; x++) if (f.tiles[y][x] === "enemy" && !st.dungeon!.cleared.includes(key(x, y))) { target = [x, y]; break; }
    expect(target).not.toBeNull();
    // Force a battle in (as an event `fight:` would) and lose it.
    const start = foldEvents(r, [[{ t: "dg_pending", pending: null, src: "action" }]], st);
    const b = { kind: "event" as const, at: `${key(...target!)}:fight`, round: 1, queue: [], active: "you", log: [], over: null,
      fighters: [
        { ...memberFighter(r, start, r.dungeons.mines, start.dungeon!, start.dungeon!.party[0]), hp: 1 },
        { ...memberFighter(r, start, r.dungeons.mines, start.dungeon!, start.dungeon!.party[1]), hp: 0 },
        { id: "ogre#1", side: "foe" as const, name: "Ogre", sprite: "ogre", hp: 999, mhp: 999, mp: 0, mmp: 0, tp: 0, atk: 99, def: 99, mat: 0, mdf: 0, agi: 1, skills: ["attack"], guard: false, xp: 0, gold: 0 },
      ] };
    let s = foldEvents(r, [[{ t: "dg_battle", battle: b, src: "action" }]], start);
    expect(chooseBoon(r, s, s.dungeon!.boonOffer!.options[0]).error).toBeTruthy(); // not mid-fight
    for (let i = 0; i < 30 && s.dungeon?.battle; i++) s = apply(r, s, battleCommand(r, s, { skill: "guard" }));
    expect(s.dungeon).toBeNull();
    expect(s.stats.stress).toBe(20);
  });

  test("a bot with boons on still completes runs", () => {
    const r = rules();
    let taken = 0;
    for (const seed of ["b1", "b2", "b3"]) {
      let s = enter(r, seed);
      for (let step = 0; step < 300 && s.dungeon; step++) {
        const run = s.dungeon;
        if (run.battle) { s = apply(r, s, battleCommand(r, s, { auto: "battle" })); continue; }
        if (run.boonOffer) { s = apply(r, s, chooseBoon(r, s, run.boonOffer.options[0])); continue; }
        if (run.pending) { const o = choicesFor(r, s)!; s = apply(r, s, chooseEvent(r, s, (o.choices.find((c) => c.chance === undefined && c.ok) ?? o.choices[0]).id)); continue; }
        const v = buildDungeonView(r, s)!;
        if (v.here.canDescend) { if (run.depth >= 3) break; s = apply(r, s, descend(r, s)); continue; }
        const opts = v.tiles.filter((t) => t.reachable);
        expect(opts.length).toBeGreaterThan(0);
        const fresh = opts.filter((t) => t.state === "hidden");
        const t = (fresh.length ? fresh : opts)[step % (fresh.length || opts.length)];
        s = apply(r, s, moveTo(r, s, t.x, t.y));
      }
      if (s.dungeon) {
        expect(s.dungeon.boons?.length ?? 0).toBe(levelOf(s.dungeon.xp) - 1 - (s.dungeon.boonOffer ? 1 : 0));
        taken += s.dungeon.boons?.length ?? 0;
      }
    }
    expect(taken).toBeGreaterThan(0);
  });
});
