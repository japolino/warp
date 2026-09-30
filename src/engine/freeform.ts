// Freeform play: what typed roleplay does when it matches nothing the ruleset lists.
//   • improvised attempts — d20 plus the stat's share of a bonus, against a difficulty
//     class the decision model picks, run through the same machinery as any action;
//   • growth by use — every check (listed or improvised), and practice the story
//     describes, moves the stats it leaned on toward their next point.

import { identifiers } from "./expr.js";
import type { TurnBuilder } from "./resolve.js";
import { DIFFICULTIES, emptyEffect, type ActionDef, type Difficulty, type Ruleset, type Tier } from "./ruleset.js";
import { statMax, type GameState } from "./state.js";

/** An improvised attempt: `try:<stat>` (or `try:` with nothing to lean on). */
export const IMPROV = "try:";

export const DIFFICULTY_WORD: Record<Difficulty, string> = { easy: "easy", fair: "a fair challenge", hard: "hard", extreme: "extreme" };

/** How much a check of each difficulty teaches. */
const HARDNESS: Record<Difficulty, number> = { easy: 0.5, fair: 1, hard: 1.5, extreme: 2 };

/** Failing still teaches, a little less. */
const LEARN: Record<Tier, number> = { crit_success: 1.2, success: 1, partial: 1, fail: 0.7, crit_fail: 0.5 };

export const IMPROV_DIRECTION: Record<Tier, string> = {
  crit_success: "It goes better than {{user}} could have hoped — a clean success with something extra.",
  success: "It works.",
  partial: "It works, but not cleanly — add a cost, a complication or a price.",
  fail: "It doesn't work. Show the failure and a consequence that makes things harder.",
  crit_fail: "It goes badly wrong — a failure that costs {{user}} something real.",
};

/** Stats an attempt can lean on. */
export function improvStats(r: Ruleset): string[] {
  return r.improvise.stats.filter((id) => r.stats[id]);
}

export function isDifficulty(v: unknown): v is Difficulty {
  return typeof v === "string" && (DIFFICULTIES as string[]).includes(v);
}

function position(r: Ruleset, s: GameState, stat: string): number {
  const def = r.stats[stat];
  const max = statMax(r, def, s);
  const v = s.stats[stat] ?? def.start;
  return max > def.min ? Math.max(0, Math.min(1, (v - def.min) / (max - def.min))) : 0;
}

/** What a stat adds to an attempt: its share of the ruleset's bonus. */
export function improvBonus(r: Ruleset, s: GameState, stat: string): number {
  return r.stats[stat] ? Math.round(position(r, s, stat) * r.improvise.bonus) : 0;
}

/** The attempt as an action, so it runs through the same machinery as any listed one (odds, the mind, fights). */
export function improvAction(r: Ruleset, s: GameState, actionId: string): ActionDef | null {
  if (!r.improvise.enabled || !actionId.startsWith(IMPROV)) return null;
  const stat = actionId.slice(IMPROV.length);
  if (stat && !r.stats[stat]) return null;
  const label = stat ? r.stats[stat].label : "Luck";
  return {
    id: actionId,
    label: `Attempt (${label})`,
    at: [],
    hidden: true,
    ...(r.improvise.time !== undefined ? { time: r.improvise.time } : {}),
    cost: emptyEffect(),
    check: { style: "vs", dice: "d20", target: "difficulty", add: stat ? improvBonus(r, s, stat) : 0, partialMargin: r.improvise.partial, label, crits: true },
    outcomes: r.improvise.outcomes,
    effects: emptyEffect(),
    params: [{ id: "difficulty", label: "Difficulty", options: Object.fromEntries(DIFFICULTIES.map((d) => [d, r.improvise.dc[d]])), default: "fair" }],
    tags: ["improvised"],
    order: 0,
    perPerson: false,
  };
}

/** Stats a check leans on: the skills and attributes its formulas read. */
export function checkStats(r: Ruleset, a: ActionDef): string[] {
  if (a.id.startsWith(IMPROV)) {
    const st = a.id.slice(IMPROV.length);
    return st && r.stats[st] ? [st] : [];
  }
  if (!a.check) return [];
  const names = new Set([...identifiers(a.check.add as string), ...identifiers(a.check.target as string)]);
  return r.statOrder.filter((id) => names.has(id) && (r.stats[id].kind === "skill" || r.stats[id].kind === "attribute"));
}

/**
 * Progress from one use, in the stat's own units: 2% of its range for a fair
 * check at the bottom, more for harder checks, slower toward the top.
 * Attributes move at `growth.attributes` of that.
 */
export function practiceGain(r: Ruleset, s: GameState, stat: string, hardness: number, learn: number): number {
  const def = r.stats[stat];
  if (!def || !r.growth.enabled || def.growth <= 0) return 0;
  const max = statMax(r, def, s);
  if ((s.stats[stat] ?? def.start) >= max) return 0;
  const kind = def.kind === "attribute" ? r.growth.attributes : 1;
  return (max - def.min) * 0.02 * r.growth.rate * def.growth * kind * hardness * learn * (1 - 0.6 * position(r, s, stat));
}

/** Hardness of a check from its chance of success: sure things teach little, long shots a lot. */
export function hardnessFrom(success: number | null, difficulty?: string): number {
  if (isDifficulty(difficulty)) return HARDNESS[difficulty];
  return success === null ? 1 : 0.5 + 1.5 * (1 - Math.max(0, Math.min(1, success)));
}

/** What using these stats in a check teaches. */
export function checkGains(r: Ruleset, s: GameState, stats: string[], hardness: number, tier: Tier): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of stats) {
    const g = practiceGain(r, s, id, hardness, LEARN[tier]);
    if (g > 0) out[id] = g;
  }
  return out;
}

/** Practice the story described (training, studying): a fair check's worth per hour, times 1.5, for up to four hours. */
export function trainingGain(r: Ruleset, s: GameState, stat: string, minutes: number | undefined): number {
  if (!r.growth.train) return 0;
  const hours = Math.max(0.5, Math.min(4, (minutes ?? 60) / 60));
  return practiceGain(r, s, stat, 1, 1.5 * hours);
}

/** Add progress; every whole point reached raises the stat. */
export function practise(t: TurnBuilder, gains: Record<string, number>, why: string): void {
  for (const [id, g] of Object.entries(gains)) {
    const def = t.r.stats[id];
    if (!def || !(g > 0)) continue;
    const pool = (t.s.practice[id] ?? 0) + g;
    const room = Math.max(0, statMax(t.r, def, t.s) - (t.s.stats[id] ?? def.start));
    const up = Math.min(Math.floor(pool), Math.floor(room));
    // What's left toward the next point (nothing to carry once the top is reached).
    const left = room - up < 1 ? 0 : pool - up;
    const d = left - (t.s.practice[id] ?? 0);
    if (Math.abs(d) > 1e-9) t.push({ t: "practice", id, d, src: "check", why });
    if (up > 0) t.push({ t: "stat", id, d: up, src: "check", why: `${why} — ${def.label} improved with practice` });
  }
}

/** Progress toward the next point, 0–1 (null when the stat doesn't grow or is maxed). */
export function practiceProgress(r: Ruleset, s: GameState, stat: string): number | null {
  const def = r.stats[stat];
  if (!def || !r.growth.enabled || def.growth <= 0) return null;
  if ((s.stats[stat] ?? def.start) >= statMax(r, def, s)) return null;
  return Math.max(0, Math.min(0.999, s.practice[stat] ?? 0));
}
