// Freeform play: what typed roleplay does when it matches nothing the ruleset lists.
//   • typed attempts — d20 plus the stat's share of `checks.bonus`, against the difficulty
//     the read picks, run through the same machinery as any action;
//   • growth by use — every check (listed or improvised), and practice the story
//     describes, moves the stats it leaned on toward their next point.

import { identifiers } from "./expr.js";
import type { TurnBuilder } from "./resolve.js";
import { DEFAULT_PRACTICE_REPEAT, DIFFICULTIES, emptyEffect, type ActionDef, type Difficulty, type PracticeRepeatDef, type Ruleset, type Tier } from "./ruleset.js";
import { effectiveStat, makeEnv, statMax, type GameState } from "./state.js";

/** An improvised attempt: `try:<stat>` (or `try:` with nothing to lean on). */
export const IMPROV = "try:";

/** How much a check of each difficulty teaches. */
const HARDNESS: Record<Difficulty, number> = { easy: 0.5, fair: 1, hard: 1.5, extreme: 2 };

/** Failing still teaches, a little less. */
const LEARN: Record<Tier, number> = { crit_success: 1.2, success: 1, partial: 1, fail: 0.7, crit_fail: 0.5 };

export function isDifficulty(v: unknown): v is Difficulty {
  return typeof v === "string" && (DIFFICULTIES as string[]).includes(v);
}

function position(r: Ruleset, s: GameState, stat: string): number {
  const def = r.stats[stat];
  const max = statMax(r, def, s);
  const v = s.stats[stat] ?? def.start;
  return max > def.min ? Math.max(0, Math.min(1, (v - def.min) / (max - def.min))) : 0;
}

/**
 * What a stat adds to the d20 (typed attempts and contest moves): its share of `checks.bonus`, with gear and
 * conditions counted (a maxed stat adds the whole bonus; Body 3/10 with bonus 10 adds +3).
 */
export function statAdd(r: Ruleset, s: GameState, stat: string): number {
  const def = r.stats[stat];
  if (!def) return 0;
  const max = statMax(r, def, s);
  const v = effectiveStat(r, s, stat, makeEnv(r, s));
  const pos = max > def.min ? Math.max(0, Math.min(1, (v - def.min) / (max - def.min))) : 0;
  return Math.round(pos * r.checks.bonus);
}

/** The typed attempt as an action, so it runs through the same machinery as any listed one (odds, growth, contests). */
export function improvAction(r: Ruleset, s: GameState, actionId: string): ActionDef | null {
  if (r.style === "story" || !r.checks.typed || !actionId.startsWith(IMPROV)) return null;
  const stat = actionId.slice(IMPROV.length);
  if (stat && !r.stats[stat]) return null;
  const label = stat ? r.stats[stat].label : "Luck";
  return {
    id: actionId,
    label: `Attempt (${label})`,
    hidden: true,
    ...(r.checks.time !== undefined ? { time: r.checks.time } : {}),
    cost: emptyEffect(),
    // No target: the read's difficulty word (params.difficulty) sets it.
    check: { add: stat ? statAdd(r, s, stat) : 0, partialMargin: r.checks.partial, label },
    outcomes: r.checks.outcomes,
    effects: emptyEffect(),
    params: [],
    tags: ["improvised"],
    perPerson: false,
    requires: [],
    showLocked: false,
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

/** Identity of a checked opportunity. Training deliberately has no such identity. */
export interface PracticeContext {
  actionId: string;
  target?: string;
  params?: Record<string, string>;
}

/** A stable key: changing actions, opponents, places or scene participants is fresh practice. */
export function practiceKey(s: GameState, context: PracticeContext): string {
  const people = Object.entries(s.scene ?? {}).filter(([, v]) => v.here && v.loc === s.location).map(([id]) => id).sort();
  // Only a typed attempt's difficulty is a known mechanical opportunity here. Cosmetic
  // labels and arbitrary intent params must not reset repetition.
  const difficulty = context.actionId.startsWith(IMPROV)
    ? (isDifficulty(context.params?.difficulty) ? context.params!.difficulty : "fair") : null;
  // A contest is its own opportunity: a new opponent (or a new contest) is fresh practice.
  const contest = s.contest ? `${s.contest.kind}@${s.contest.at}` : null;
  return JSON.stringify([context.actionId, s.location, people, context.target ?? null, difficulty, contest, s.contest?.opponent ?? null]);
}

/** Repeated checks in the same context teach less, but failures still teach.
 * By default a two-hour break or eight intervening turns restores full learning
 * (`growth.repeat` tunes this; a recovery value of 0 turns that path off).
 */
export function practiceRepetition(s: GameState, key: string, repeat: PracticeRepeatDef | false = DEFAULT_PRACTICE_REPEAT): { multiplier: number; n: number } {
  if (repeat === false) return { multiplier: 1, n: 1 };
  const previous = s.practiceUse?.[key];
  const recovered = !previous
    || (repeat.recoverMinutes > 0 && s.minutes - previous.minutes >= repeat.recoverMinutes)
    || (repeat.recoverTurns > 0 && s.turn - previous.turn >= repeat.recoverTurns);
  const repeats = recovered ? 0 : Math.max(0, Math.min(100, previous.n));
  return { multiplier: Math.min(1, Math.max(repeat.floor, 1 / (1 + repeat.step * repeats))), n: Math.min(100, repeats + 1) };
}

/** Add progress; every whole point reached raises the stat. */
export function practise(t: TurnBuilder, gains: Record<string, number>, why: string, context?: PracticeContext): void {
  let multiplier = 1;
  if (context && t.r.growth.repeat !== false && Object.entries(gains).some(([id, g]) => t.r.stats[id] && Number.isFinite(g) && g > 0)) {
    const key = practiceKey(t.s, context);
    const repetition = practiceRepetition(t.s, key, t.r.growth.repeat);
    multiplier = repetition.multiplier;
    t.push({ t: "practice_use", key, n: repetition.n, turn: t.s.turn, minutes: t.s.minutes, src: "check", why });
  }
  for (const [id, raw] of Object.entries(gains)) {
    const g = raw * multiplier;
    const def = t.r.stats[id];
    if (!def || !Number.isFinite(g) || !(g > 0)) continue;
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
