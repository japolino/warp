// What the dungeon screen shows.

import { evalNumber } from "../expr.js";
import type { Ruleset } from "../ruleset.js";
import { itemName, makeEnv, type GameState } from "../state.js";
import { canUse, skillCost } from "./battle.js";
import { SHOP, SKILLS } from "./content.js";
import { adjacent, generateFloor, key } from "./floor.js";
import { bondOf, choicesFor, dungeonOf, dungeonsHere, eligibleCompanions, levelOf, memberFighter } from "./run.js";
import type { Fighter } from "./types.js";
import type { DungeonEntryView, DungeonView, FighterView } from "../../shared/protocol.js";

function fighterView(f: Fighter, active: string | null): FighterView {
  return {
    id: f.id, name: f.name, side: f.side, sprite: f.sprite,
    hp: f.hp, mhp: f.mhp, mp: f.mp, mmp: f.mmp, tp: f.tp,
    alive: f.hp > 0, active: f.id === active, guard: f.guard,
    ...(f.elite ? { elite: true } : {}), ...(f.boss ? { boss: true } : {}),
  };
}

export function buildDungeonEntries(r: Ruleset, s: GameState): DungeonEntryView[] {
  return dungeonsHere(r, s).map((d) => ({
    id: d.id, name: d.name, desc: d.desc ?? null, theme: d.theme,
    deepest: s.deepest[d.id] ?? 0, floors: d.floors, max: d.party.max,
    companions: eligibleCompanions(r, s, d),
  }));
}

export function buildDungeonView(r: Ruleset, s: GameState): DungeonView | null {
  const run = s.dungeon;
  const d = run && dungeonOf(r, run);
  if (!run || !d) return null;
  const floor = generateFloor(d, run.seed, run.depth);
  const seen = new Set(run.seen);
  const cleared = new Set(run.cleared);
  const busy = !!run.battle || !!run.pending;
  const tiles: DungeonView["tiles"] = [];
  for (let y = 0; y < floor.size; y++) for (let x = 0; x < floor.size; x++) {
    const k = key(x, y);
    const kind = floor.tiles[y][x];
    const here = run.pos[0] === x && run.pos[1] === y;
    const known = seen.has(k);
    // The way down shows once reached; a defeated guardian leaves it open.
    const shown = known ? (kind === "boss" && cleared.has(k) ? "stairs" : kind) : null;
    tiles.push({
      x, y, kind: shown,
      state: here ? "here" : known ? "seen" : "hidden",
      cleared: cleared.has(k),
      reachable: !busy && adjacent(run.pos, [x, y]),
    });
  }
  const hereKind = floor.tiles[run.pos[1]][run.pos[0]];
  const hereKey = key(...run.pos);
  const onStairs = hereKey === key(...floor.stairs) && (!floor.boss || cleared.has(hereKey));
  const level = levelOf(run.xp);

  const open = choicesFor(r, s);
  const event: DungeonView["event"] = open ? {
    text: open.ev.text.replace(/\{target\}/g, open.target ? s.people[open.target]?.name ?? open.target : ""),
    romance: run.pending?.kind === "romance",
    choices: open.choices.map((c) => {
      let chance: number | null = null;
      if (c.chance !== undefined) {
        const e = makeEnv(r, s, { depth: run.depth, target: open.target ?? "" });
        try { chance = Math.max(0, Math.min(100, Math.round(evalNumber(c.chance, { lookup: e.lookup, call: (n, a) => (n === "rel_bond" ? bondOf(r, s, String(a[0] ?? "")) : n === "bag" ? run.bag[String(a[0])] ?? 0 : e.call?.(n, a)) }, 50)))); } catch { chance = null; }
      }
      return { id: c.id, label: c.label.replace(/\{target\}/g, open.target ? s.people[open.target]?.name ?? open.target : ""), ok: c.ok, chance, cost: c.cost ?? null };
    }),
  } : null;

  const b = run.battle;
  let battle: DungeonView["battle"] = null;
  if (b) {
    const active = b.fighters.find((f) => f.id === b.active) ?? null;
    battle = {
      kind: b.kind, round: b.round, active: b.active,
      fighters: b.fighters.map((f) => fighterView(f, b.active)),
      skills: active ? ["attack", ...active.skills, "guard"].map((id) => SKILLS[id]).filter(Boolean).map((sk) => ({
        id: sk.id, name: sk.name, cost: skillCost(sk), target: sk.target, usable: canUse(active, sk),
      })) : [],
      log: b.log,
      canEscape: b.kind !== "boss",
      over: b.over,
    };
  }

  return {
    id: d.id, name: d.name, theme: d.theme,
    depth: run.depth, floors: d.floors, size: floor.size, boss: floor.boss,
    tiles,
    here: {
      kind: hereKind === "boss" && cleared.has(hereKey) ? "stairs" : hereKind,
      canDescend: onStairs && !busy && (!d.floors || run.depth < d.floors),
      bottom: !!d.floors && run.depth >= d.floors && onStairs,
      shop: hereKind === "shop" && !busy
        ? Object.entries(SHOP).map(([id, w]) => ({ id, name: w.name, price: w.price(run.depth), sprite: w.sprite, desc: w.desc, affordable: run.gold >= w.price(run.depth) }))
        : null,
    },
    event,
    battle,
    party: run.party.map((m) => fighterView(memberFighter(r, s, d, run, m), null)),
    level, xp: run.xp, xpNext: 12 * level * level,
    gold: run.gold,
    bag: Object.entries(run.bag).filter(([, n]) => n > 0).map(([id, count]) => ({ id, name: SHOP[id]?.name ?? id, count, sprite: SHOP[id]?.sprite ?? "potion" })),
    loot: Object.entries(run.loot).map(([id, count]) => ({ name: itemName(r, s, id), count })),
    log: run.log.slice().reverse(),
  };
}
