// Party battles: several fighters a side, turn order by agility, skills that cost
// MP or TP, guard, items and escape. Pure and seeded — the same commands always
// play out the same way.

import { seededRng, type Rng } from "../dice.js";
import { SKILLS } from "./content.js";
import type { BattleState, Fighter, SkillDef } from "./types.js";

export type Command =
  | { skill: string; target?: string }
  | { item: "potion" | "ether" | "bomb"; target?: string }
  | { escape: true };

const LOG_KEPT = 14;

export const alive = (f: Fighter) => f.hp > 0;
export const partyOf = (b: BattleState) => b.fighters.filter((f) => f.side === "party");
export const foesOf = (b: BattleState) => b.fighters.filter((f) => f.side === "foe");

function say(b: BattleState, line: string) {
  b.log = [...b.log, line].slice(-LOG_KEPT);
}

function rngFor(b: BattleState, seed: string, who: string): Rng {
  return seededRng(`${seed}:${b.at}:${b.round}:${b.queue.length}:${who}:${b.log.length}`);
}

function variance(rng: Rng) { return 0.85 + rng() * 0.3; }

export function skillCost(s: SkillDef): string {
  return s.mp ? `${s.mp} MP` : s.tp ? `${s.tp} TP` : "";
}

export function canUse(f: Fighter, s: SkillDef): boolean {
  if (f.side === "foe") return true;
  return f.mp >= s.mp && f.tp >= s.tp;
}

function hit(b: BattleState, a: Fighter, t: Fighter, s: SkillDef, rng: Rng, ignoreGuard = false): number {
  let dmg: number;
  if (s.kind === "phys") dmg = Math.max(1, a.atk * 3 - t.def * 1.5) * s.power;
  else dmg = Math.max(1, 15 + a.mat * 2.5 - t.mdf) * s.power;
  dmg *= variance(rng);
  const crit = s.kind === "phys" && rng() < 0.05 + (s.crit ?? 0);
  if (crit) dmg *= 1.8;
  if (t.guard && !ignoreGuard) dmg *= 0.5;
  const n = Math.max(1, Math.round(dmg));
  t.hp = Math.max(0, t.hp - n);
  // Taking hits builds TP.
  t.tp = Math.min(100, t.tp + Math.round((n / Math.max(1, t.mhp)) * 40));
  say(b, `${a.name} ${s.id === "attack" ? "hits" : `uses ${s.name} on`} ${t.name} for ${n}${crit ? " (critical!)" : ""}.${t.hp <= 0 ? ` ${t.name} ${t.side === "foe" ? "is defeated" : "goes down"}!` : ""}`);
  if (s.drain && n > 0) a.hp = Math.min(a.mhp, a.hp + Math.round(n * s.drain));
  return n;
}

function heal(b: BattleState, a: Fighter, t: Fighter, s: SkillDef, rng: Rng) {
  const n = Math.round((20 + a.mat * 2.5) * s.power * variance(rng));
  const before = t.hp;
  t.hp = Math.min(t.mhp, t.hp + n);
  say(b, `${a.name} uses ${s.name}${t.id === a.id ? "" : ` on ${t.name}`} (+${t.hp - before} HP).`);
}

function targetsFor(b: BattleState, a: Fighter, s: SkillDef, chosen: string | undefined, rng: Rng): Fighter[] {
  const mine = b.fighters.filter((f) => f.side === a.side && alive(f));
  const theirs = b.fighters.filter((f) => f.side !== a.side && alive(f));
  const byId = (list: Fighter[]) => list.find((f) => f.id === chosen);
  switch (s.target) {
    case "self": return [a];
    case "foes": return theirs;
    case "allies": return mine;
    case "ally": {
      const t = byId(mine);
      if (t) return [t];
      // Default: whoever is most hurt.
      return mine.length ? [mine.reduce((x, y) => (y.hp / y.mhp < x.hp / x.mhp ? y : x))] : [];
    }
    case "foe": {
      const t = byId(theirs);
      if (t) return [t];
      return theirs.length ? [theirs[Math.floor(rng() * theirs.length)]] : [];
    }
  }
}

function useSkill(b: BattleState, a: Fighter, s: SkillDef, target: string | undefined, rng: Rng) {
  if (a.side === "party") { a.mp -= s.mp; a.tp -= s.tp; }
  if (s.kind === "guard") {
    a.guard = true;
    a.tp = Math.min(100, a.tp + 10);
    say(b, `${a.name} guards.`);
    return;
  }
  const ts = targetsFor(b, a, s, target, rng);
  for (const t of ts) {
    if (s.kind === "heal") heal(b, a, t, s, rng);
    else hit(b, a, t, s, rng);
  }
  if (a.side === "party" && s.tp === 0) a.tp = Math.min(100, a.tp + 6);
}

function outcome(b: BattleState): BattleState["over"] {
  if (!foesOf(b).some(alive)) return "won";
  if (!partyOf(b).some(alive)) return "lost";
  return null;
}

function newRound(b: BattleState, seed: string) {
  b.round += 1;
  const rng = seededRng(`${seed}:${b.at}:order:${b.round}`);
  b.queue = b.fighters
    .filter(alive)
    .map((f) => ({ id: f.id, v: f.agi * (0.8 + rng() * 0.4) }))
    .sort((x, y) => y.v - x.v)
    .map((x) => x.id);
}

function foeTurn(b: BattleState, f: Fighter, seed: string) {
  const rng = rngFor(b, seed, f.id);
  const allies = foesOf(b).filter(alive);
  const hurtAlly = allies.some((x) => x.hp < x.mhp * 0.5);
  const options = f.skills
    .map((id) => SKILLS[id])
    .filter((s): s is SkillDef => !!s && (s.kind !== "heal" || hurtAlly));
  if (!options.length) options.push(SKILLS.attack);
  // The first listed move is the bread and butter.
  const weights = options.map((_, i) => (i === 0 ? 3 : 1));
  let x = rng() * weights.reduce((n, w) => n + w, 0);
  let pick = options[0];
  for (let i = 0; i < options.length; i++) { x -= weights[i]; if (x <= 0) { pick = options[i]; break; } }
  useSkill(b, f, pick, undefined, rng);
}

/** Run turns until a party member needs a command, or the battle ends. */
export function advance(b: BattleState, seed: string): BattleState {
  for (let guard = 0; guard < 200 && !b.over; guard++) {
    if (!b.queue.length) newRound(b, seed);
    const id = b.queue[0];
    const f = b.fighters.find((x) => x.id === id);
    if (!f || !alive(f)) { b.queue.shift(); continue; }
    f.guard = false;
    if (f.side === "party") { b.active = f.id; return b; }
    b.queue.shift();
    foeTurn(b, f, seed);
    b.over = outcome(b);
  }
  b.active = null;
  return b;
}

export function startBattle(kind: BattleState["kind"], at: string, party: Fighter[], foes: Fighter[], seed: string): BattleState {
  const b: BattleState = { kind, at, round: 0, fighters: [...party, ...foes].map((f) => ({ ...f, guard: false })), queue: [], active: null, log: [], over: null };
  say(b, foes.length === 1 ? `${foes[0].name} attacks!` : `${foes.length} enemies attack!`);
  return advance(b, seed);
}

/**
 * The active party member acts. Returns the new state and which bag item was used
 * (the caller checks the bag and pays for it).
 */
export function command(prev: BattleState, cmd: Command, seed: string, opts: { depth: number }): { b: BattleState; used: string | null; error?: string } {
  const b: BattleState = structuredClone(prev);
  const a = b.fighters.find((f) => f.id === b.active);
  if (!a || b.over) return { b: prev, used: null, error: "Nobody is waiting to act." };
  const rng = rngFor(b, seed, a.id);
  let used: string | null = null;

  if ("escape" in cmd) {
    if (b.kind === "boss") return { b: prev, used: null, error: "There's no escaping this fight." };
    const avg = (xs: Fighter[]) => xs.reduce((n, f) => n + f.agi, 0) / Math.max(1, xs.length);
    const chance = Math.min(0.9, Math.max(0.15, 0.5 + (avg(partyOf(b).filter(alive)) - avg(foesOf(b).filter(alive))) * 0.03));
    if (rng() < chance) {
      say(b, "The party escapes!");
      b.over = "fled";
      b.active = null;
      return { b, used };
    }
    say(b, "The party tries to flee, but can't get away!");
  } else if ("item" in cmd) {
    used = cmd.item;
    if (cmd.item === "bomb") {
      for (const t of foesOf(b).filter(alive)) {
        const n = Math.round((25 + opts.depth * 8) * variance(rng));
        t.hp = Math.max(0, t.hp - n);
        say(b, `The bomb blasts ${t.name} for ${n}.${t.hp <= 0 ? ` ${t.name} is defeated!` : ""}`);
      }
    } else {
      const mine = partyOf(b).filter(alive);
      const t = mine.find((f) => f.id === cmd.target) ?? a;
      if (cmd.item === "potion") {
        const before = t.hp;
        t.hp = Math.min(t.mhp, t.hp + Math.ceil(t.mhp / 2));
        say(b, `${a.name} uses a potion${t.id === a.id ? "" : ` on ${t.name}`} (+${t.hp - before} HP).`);
      } else {
        const before = t.mp;
        t.mp = Math.min(t.mmp, t.mp + Math.ceil(t.mmp / 2));
        say(b, `${a.name} uses an ether${t.id === a.id ? "" : ` on ${t.name}`} (+${t.mp - before} MP).`);
      }
    }
  } else {
    const s = SKILLS[cmd.skill];
    if (!s || (s.id !== "attack" && s.id !== "guard" && !a.skills.includes(s.id))) return { b: prev, used: null, error: "Unknown skill." };
    if (!canUse(a, s)) return { b: prev, used: null, error: `Not enough ${s.mp ? "MP" : "TP"}.` };
    useSkill(b, a, s, cmd.target, rng);
  }
  b.queue.shift();
  b.active = null;
  b.over = outcome(b);
  return { b: advance(b, seed), used };
}

/** A sensible move for the active member: heal the badly hurt, else hit the weakest enemy hard. */
export function autoCommand(b: BattleState, bag: Record<string, number>): Command {
  const a = b.fighters.find((f) => f.id === b.active)!;
  const mine = partyOf(b).filter(alive);
  const theirs = foesOf(b).filter(alive);
  const low = mine.filter((f) => f.hp < f.mhp * 0.35).sort((x, y) => x.hp / x.mhp - y.hp / y.mhp)[0];
  const usable = a.skills.map((id) => SKILLS[id]).filter((s): s is SkillDef => !!s && canUse(a, s));
  if (low) {
    const h = usable.find((s) => s.kind === "heal");
    if (h) return { skill: h.id, target: low.id };
    if ((bag.potion ?? 0) > 0 && low.hp < low.mhp * 0.25) return { item: "potion", target: low.id };
  }
  const weakest = theirs.sort((x, y) => x.hp - y.hp)[0];
  const aoe = usable.find((s) => s.target === "foes" && s.kind !== "heal");
  if (aoe && theirs.length >= 2) return { skill: aoe.id };
  const strong = usable.filter((s) => s.target === "foe" && s.kind !== "heal").sort((x, y) => y.power - x.power)[0];
  if (strong && (strong.tp > 0 || strong.mp <= a.mp - 4 || a.mmp === 0)) return { skill: strong.id, target: weakest?.id };
  return { skill: "attack", target: weakest?.id };
}
