// Conflict: one contest system for fights, chases and arguments (CORE-DESIGN §2.5).
// A momentum gauge from −100 (the opponent wins) to +100 ({{user}} wins). Every player message is one round:
// one d20 check against the threat's DC swings the gauge, the stakes rise each round, nothing ends before
// round `rounds.min` (the gauge stops at ±90), and round `rounds.max` is the last (then it breaks off).
// Only the rules end a contest: a full swing, Break off, Give in, or the last round.

export { statAdd };

import { d20Odds, d20Tier, rollD20, seededRng } from "./dice.js";
import { checkGains, practise, statAdd } from "./freeform.js";
import { emptyEffect, type ActionDef, type Difficulty, type Effect, type KindDef, type Ruleset, type Tier } from "./ruleset.js";
import type { ContestOutcome, EventSource, GameState } from "./state.js";
import { findPerson, type CheckResult, type TurnBuilder } from "./resolve.js";

/** Intent ids of contest moves: `contest:<stat>` (a move leaning on that stat), Break off and Give in. */
export const CONTEST_PREFIX = "contest:";
export const BREAK_OFF = "contest:break_off";
export const GIVE_IN = "contest:give_in";

/** The intent id of a move that leans on `stat`. */
export function contestMoveId(stat: string): string {
  return `${CONTEST_PREFIX}${stat}`;
}

/** Is this an intent id (or a written choice's tag) for the contest? `live:contest:body` counts too. */
export function contestId(id: string): string | null {
  const bare = id.startsWith("live:") ? id.slice(5) : id;
  return bare.startsWith(CONTEST_PREFIX) ? bare.split("@")[0] : null;
}

/** Where a contest stands, in words (the narrator's and the panel's). */
export function momentumWords(m: number, opponent: string, you = "{{user}}"): string {
  const second = you.toLowerCase() === "you";
  if (m >= 100) return `${you} ${second ? "have" : "has"} won`;
  if (m <= -100) return `${opponent} has won`;
  if (m >= 60) return `${you} ${second ? "are" : "is"} close to winning`;
  if (m >= 20) return `${you} ${second ? "have" : "has"} the upper hand`;
  if (m > -20) return "evenly matched";
  if (m > -60) return `${opponent} has the upper hand`;
  return `${opponent} is close to winning`;
}

const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const an = (w: string) => (/^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);

/** The definition of a running contest's kind (a kind the rules no longer have still plays, on the checks' stats). */
export function kindOf(r: Ruleset, kind: string): KindDef {
  return r.conflict.kinds[kind] ?? { id: kind, label: cap(kind.replace(/_/g, " ")), stats: r.checks.stats.slice(0, 2), escape: r.checks.stats[0] ?? "", cost: {}, won: emptyEffect(), lost: emptyEffect(), escaped: emptyEffect() };
}

/** A kind by id or label ("Fight"), or null. */
export function findKind(r: Ruleset, key: string): KindDef | null {
  const k = String(key ?? "").trim().toLowerCase();
  return r.conflict.kinds[k] ?? Object.values(r.conflict.kinds).find((x) => x.label.toLowerCase() === k) ?? null;
}

/** The kind's stat that adds most for {{user}} now (the first on a tie): typed moves without a read lean on it. */
export function bestStat(r: Ruleset, s: GameState, kind: KindDef): string {
  let best = kind.stats[0] ?? "", top = -Infinity;
  for (const st of kind.stats) { const a = statAdd(r, s, st); if (a > top) { top = a; best = st; } }
  return best;
}

/** How much more is at stake in round `n` (1-based). */
export function multiplier(r: Ruleset, n: number): number {
  return 1 + r.conflict.escalate * (Math.max(1, n) - 1);
}

/** The gauge's swing for a tier in round `n`. */
export function swingFor(r: Ruleset, tier: Tier, n: number): number {
  return Math.round(r.conflict.swing[tier] * multiplier(r, n));
}

/** The gauge after a swing in round `n`: before `rounds.min` it stops at ±90 ("close to winning"). */
export function nextMomentum(r: Ruleset, m: number, d: number, n: number): number {
  const lim = n < r.conflict.rounds.min ? 90 : 100;
  return Math.max(-lim, Math.min(lim, m + d));
}

/** The target of a Break off: the threat's DC, easier when ahead (+50 momentum = DC −2). */
export function breakOffDc(s: GameState): number {
  return s.contest ? s.contest.dc - Math.round(s.contest.momentum / 25) : 12;
}

/** A contest move (or Break off) as an action, for odds on the buttons and for finding a clicked id. */
export function contestAction(r: Ruleset, s: GameState, id: string): ActionDef | null {
  const c = s.contest;
  const key = contestId(id);
  if (!c || !key) return null;
  const kind = kindOf(r, c.kind);
  const base = { cost: emptyEffect(), outcomes: {}, effects: emptyEffect(), params: [], tags: ["contest"], perPerson: false, requires: [], showLocked: false, hidden: false };
  if (key === GIVE_IN) return { ...base, id: GIVE_IN, label: "Give in", say: "*I give in.*" };
  if (key === BREAK_OFF) {
    const stat = kind.escape || bestStat(r, s, kind);
    return { ...base, id: BREAK_OFF, label: "Break off", say: "*I try to break away.*", check: { target: breakOffDc(s), add: statAdd(r, s, stat), partialMargin: r.checks.partial, label: r.stats[stat]?.label ?? "Luck" } };
  }
  const stat = key.slice(CONTEST_PREFIX.length);
  if (!kind.stats.includes(stat) && !r.stats[stat]) return null;
  return { ...base, id: key, label: `Press on (${r.stats[stat]?.label ?? stat})`, say: `*I press on (${r.stats[stat]?.label ?? stat}).*`, check: { target: c.dc, add: statAdd(r, s, stat), partialMargin: r.checks.partial, label: r.stats[stat]?.label ?? stat } };
}

/** The odds of a contest move on `stat` now. */
export function moveOdds(r: Ruleset, s: GameState, stat: string): number {
  if (!s.contest) return 0;
  return d20Odds(statAdd(r, s, stat), s.contest.dc, r.checks.partial).success;
}

/** Start a contest (from the story, a typed message or an effect). False when it can't start now. */
export function startContest(t: TurnBuilder, req: { kind: string; opponent: string; threat?: Difficulty | null }, src: "narrator" | "trigger" | "action" | "check"): boolean {
  const { r } = t;
  if (r.style === "story" || t.s.contest) return false;
  const kind = findKind(r, req.kind);
  const opponent = String(req.opponent ?? "").trim().slice(0, 60);
  if (!kind || !opponent) return false;
  const who = findPerson(r, t.s, opponent) ?? undefined;
  // The same incident told again isn't a new contest: the same opponent can't restart one within 15 minutes.
  const last = t.s.lastContest;
  if (last && t.s.minutes - last.at <= 15 && (last.opponent.toLowerCase() === opponent.toLowerCase() || (who && last.who === who))) return false;
  const threat: Difficulty = req.threat && r.checks.dc[req.threat] !== undefined ? req.threat : "fair";
  const name = who ? t.s.people[who]?.name ?? opponent : opponent;
  t.push({ t: "contest", kind: kind.id, opponent: name, ...(who ? { who } : {}), threat, dc: r.checks.dc[threat], src });
  t.announce(`${cap(an(kind.label.toLowerCase()))} with ${name} starts (${threat}). It runs until the rules end it: only a full swing of momentum, a Break off or giving in ends it.`);
  return true;
}

const OPPONENT_BEAT: Record<Tier, string> = {
  crit_success: "{opponent} is thrown badly off balance.",
  success: "{opponent} gives ground.",
  partial: "{opponent} answers back: both land something.",
  fail: "{opponent} takes the advantage.",
  crit_fail: "{opponent} turns it hard against {{user}}.",
};
const LANDS: Record<Tier, string> = {
  crit_success: "and it lands perfectly", success: "and it lands well", partial: "and it half lands",
  fail: "but it doesn't land", crit_fail: "and it goes badly wrong",
};
const ENDING: Record<ContestOutcome, string> = {
  won: "{{user}} wins", lost: "{opponent} wins", escaped: "{{user}} gets away", gave_in: "{{user}} gives in", broken_off: "Neither side can finish it; it breaks off",
};
const NOT_OVER = "Narrate these beats in order, in the story's voice. The contest is not over until the rules end it — do not finish it, do not knock anyone out, do not let anyone walk away.";

const fillOpp = (text: string, opponent: string) => text.replace(/^\{opponent\}/, cap(opponent)).replace(/\{opponent\}/g, opponent);

/** What happens at the end: the kind's effects (their hint goes into the beats), a memory, and the end event. */
function endContest(t: TurnBuilder, outcome: ContestOutcome, src: "check" | "action"): string | null {
  const c = t.s.contest;
  if (!c) return null;
  const kind = kindOf(t.r, c.kind);
  const fx: Effect = outcome === "won" ? kind.won : outcome === "lost" || outcome === "gave_in" ? kind.lost : kind.escaped;
  const hint = fx.hint ? fillOpp(fx.hint, c.opponent) : null;
  t.apply({ ...fx, hint: undefined }, src, { ...(c.who ? { opponent: c.who } : {}) });
  if (c.who && t.s.people[c.who]) {
    const what = kind.label.toLowerCase();
    const text = outcome === "won" ? `{{user}} beat them in ${an(what)}.` : outcome === "lost" || outcome === "gave_in" ? `{{user}} lost ${an(what)} to them.` : outcome === "escaped" ? "{{user}} got away from them." : `{{user}} and they fought ${an(what)} to a standstill.`;
    t.push({ t: "memory", who: c.who, text, src: "trigger" });
  }
  t.push({ t: "contest_end", outcome, src });
  return hint;
}

/**
 * A `swing:` effect moves the gauge as a check does: before `rounds.min` it stops at ±90, and a full swing ends the
 * contest (won at +100, lost at −100) with the kind's effects (ADVENTURE-3).
 */
export function effectSwing(t: TurnBuilder, d: number, src: EventSource) {
  const c = t.s.contest;
  if (!c || !d) return;
  const next = nextMomentum(t.r, c.momentum, d, c.round);
  if (next !== c.momentum) t.push({ t: "swing", d: next - c.momentum, src });
  if (Math.abs(next) < 100) return;
  const outcome: ContestOutcome = next >= 100 ? "won" : "lost";
  const kind = kindOf(t.r, c.kind);
  const hint = endContest(t, outcome, "action");
  t.announce(`This ends the ${kind.label.toLowerCase()}: ${fillOpp(ENDING[outcome], c.opponent)}.${hint ? ` ${hint}` : ""}`);
}

export interface RoundResult { check: CheckResult | null; beats: string; outcome: ContestOutcome | null }

/** The beats block for one round (the outcome packet shows it as is). */
function beatsBlock(t: TurnBuilder, o: { n: number; check: CheckResult | null; you: string; them: string | null; momentum: number; shift: number; outcome: ContestOutcome | null; ending: string | null; kind: KindDef; opponent: string; max: number }): string {
  const lines = [`Contest: ${o.kind.label.toLowerCase()} with ${o.opponent} — round ${o.n} of at most ${o.max}.`];
  if (o.check) lines.push(`Check: ${o.check.label} — d20 ${o.check.roll}${o.check.add ? ` ${o.check.add > 0 ? "+" : "−"} ${Math.abs(o.check.add)}` : ""} = ${o.check.total} vs ${o.check.target}${o.check.difficulty ? ` (${o.check.difficulty})` : ""} → ${TIER_WORD[o.check.tier]}`);
  lines.push("This round's beats, in order:");
  const beats = [`{{user}}: ${o.you}.`];
  if (o.them) beats.push(fillOpp(o.them, o.opponent));
  if (o.outcome) beats.push(`This round ends it: ${fillOpp(ENDING[o.outcome], o.opponent)}.${o.ending ? ` Write the ending: ${o.ending}` : ""}`);
  else beats.push(`Where it stands: ${momentumWords(o.momentum, o.opponent)}${o.shift ? ` (it swung toward ${o.shift > 0 ? "{{user}}" : o.opponent})` : ""}.`);
  beats.forEach((b, i) => lines.push(`${i + 1}. ${b}`));
  lines.push(o.outcome ? "Narrate these beats in order, in the story's voice, and end the contest here." : NOT_OVER);
  return lines.join("\n");
}

const TIER_WORD: Record<Tier, string> = { crit_success: "CRITICAL SUCCESS", success: "SUCCESS", partial: "PARTIAL SUCCESS", fail: "FAILURE", crit_fail: "CRITICAL FAILURE" };

/** Roll one d20 check for a contest. */
function contestCheck(t: TurnBuilder, stat: string, target: number, seed: string): CheckResult {
  const add = statAdd(t.r, t.s, stat);
  const natural = rollD20(seededRng(seed));
  const tier = d20Tier(natural, add, target, t.r.checks.partial);
  return {
    label: t.r.stats[stat]?.label ?? (stat || "Luck"), style: "vs", dice: "d20", faces: [{ sides: 20, value: natural, kept: true }],
    roll: natural, add, total: natural + add, target, tier, seed, ...(t.s.contest ? { difficulty: t.s.contest.threat } : {}),
  };
}

/** Swing the gauge, pay the kind's cost for the tier, and see whether it ends. */
function swingAndCost(t: TurnBuilder, tier: Tier | null, d: number, n: number, src: "check" | "action"): { shift: number; outcome: ContestOutcome | null } {
  const c = t.s.contest!;
  const next = nextMomentum(t.r, c.momentum, d, n);
  const shift = next - c.momentum;
  if (shift) t.push({ t: "swing", d: shift, src });
  const kind = kindOf(t.r, c.kind);
  const cost = tier ? kind.cost[tier] : undefined;
  if (cost) t.apply(cost, src, { ...(c.who ? { opponent: c.who } : {}) });
  const m = t.s.contest?.momentum ?? next;
  const outcome: ContestOutcome | null = m >= 100 ? "won" : m <= -100 ? "lost" : n >= t.r.conflict.rounds.max ? "broken_off" : null;
  return { shift, outcome };
}

/** One round: a move that leans on `stat`. `label` = the clicked words; typed moves are kept as written. */
export function contestRound(t: TurnBuilder, move: { stat: string; label?: string; typed?: boolean }, seed: string): RoundResult {
  const c = t.s.contest!;
  const kind = kindOf(t.r, c.kind);
  const stat = move.stat && (kind.stats.includes(move.stat) || t.r.stats[move.stat]) ? move.stat : bestStat(t.r, t.s, kind);
  t.push({ t: "round", src: "check" });
  const n = t.s.contest!.round;
  const check = contestCheck(t, stat, c.dc, seed);
  const { shift, outcome } = swingAndCost(t, check.tier, swingFor(t.r, check.tier, n), n, "check");
  // Using a stat in a contest is how it grows (keyed by the opponent: a new opponent is fresh practice).
  const gains = checkGains(t.r, t.s, [stat], HARDNESS[c.threat], check.tier);
  if (Object.keys(gains).length) practise(t, gains, `Used in ${an(kind.label.toLowerCase())} (${check.tier.replace("_", " ")})`, { actionId: contestMoveId(stat), target: c.who ?? c.opponent.toLowerCase() });
  const momentum = t.s.contest?.momentum ?? c.momentum + shift;
  const ending = outcome ? endContest(t, outcome, "check") : null;
  const you = `${move.typed || !move.label ? "keep the move exactly as {{user}} wrote it" : move.label.replace(/[.!]+$/, "")}, ${LANDS[check.tier]}`;
  return { check, outcome, beats: beatsBlock(t, { n, check, you, them: OPPONENT_BEAT[check.tier], momentum, shift, outcome, ending, kind, opponent: c.opponent, max: t.r.conflict.rounds.max }) };
}

const HARDNESS: Record<Difficulty, number> = { easy: 0.5, fair: 1, hard: 1.5, extreme: 2 };

/** Break off: a check on the kind's escape stat, easier when ahead. Success gets away; failure is a failed round. */
export function breakOff(t: TurnBuilder, seed: string): RoundResult {
  const c = t.s.contest!;
  const kind = kindOf(t.r, c.kind);
  const stat = kind.escape || bestStat(t.r, t.s, kind);
  const target = breakOffDc(t.s);
  t.push({ t: "round", src: "check" });
  const n = t.s.contest!.round;
  const check = contestCheck(t, stat, target, seed);
  const got = check.tier === "success" || check.tier === "crit_success" || check.tier === "partial";
  let shift = 0;
  let outcome: ContestOutcome | null;
  if (got) {
    if (check.tier === "partial" && kind.cost.partial) t.apply(kind.cost.partial, "check", { ...(c.who ? { opponent: c.who } : {}) });
    outcome = "escaped";
  } else {
    ({ shift, outcome } = swingAndCost(t, check.tier, swingFor(t.r, check.tier, n), n, "check"));
  }
  const momentum = t.s.contest?.momentum ?? c.momentum + shift;
  const ending = outcome ? endContest(t, outcome, "check") : null;
  const you = got ? `tries to break off, and gets clear${check.tier === "partial" ? " (at a cost)" : ""}` : `tries to break off, ${LANDS[check.tier]}`;
  return { check, outcome, beats: beatsBlock(t, { n, check, you, them: got ? null : OPPONENT_BEAT[check.tier], momentum, shift, outcome, ending, kind, opponent: c.opponent, max: t.r.conflict.rounds.max }) };
}

/** Give in: it ends at once as a loss, with no roll. */
export function giveIn(t: TurnBuilder): RoundResult {
  const c = t.s.contest!;
  const kind = kindOf(t.r, c.kind);
  const n = c.round + 1;
  const ending = endContest(t, "gave_in", "action");
  return { check: null, outcome: "gave_in", beats: beatsBlock(t, { n, check: null, you: "gives in", them: null, momentum: c.momentum, shift: 0, outcome: "gave_in", ending, kind, opponent: c.opponent, max: t.r.conflict.rounds.max }) };
}

/** A round spent on something else (an item, an authored action): no roll, and the opponent presses. */
export function busyRound(t: TurnBuilder, label: string): RoundResult {
  const c = t.s.contest!;
  const kind = kindOf(t.r, c.kind);
  t.push({ t: "round", src: "action" });
  const n = t.s.contest!.round;
  const { shift, outcome } = swingAndCost(t, null, Math.round(-20 * multiplier(t.r, n)), n, "action");
  const momentum = t.s.contest?.momentum ?? c.momentum + shift;
  const ending = outcome ? endContest(t, outcome, "action") : null;
  return { check: null, outcome, beats: beatsBlock(t, { n, check: null, you: `${label.replace(/[.!]+$/, "")} (not a move in the ${kind.label.toLowerCase()})`, them: "{opponent} presses while {{user}} is busy.", momentum, shift, outcome, ending, kind, opponent: c.opponent, max: t.r.conflict.rounds.max }) };
}

// ───────────────────────── simulation (Studio's contest table, the loop-sim gate) ─────────────────────────

export interface ContestSim {
  runs: number;
  won: number;
  lost: number;
  brokenOff: number;
  meanRounds: number;
  /** Share of contests that ended within `rounds.min`–6 rounds. */
  within: number;
  /** P(success or better) of one move. */
  odds: number;
}

/**
 * Play `runs` contests of a kind with one steady move per round (d20 + `add` vs the threat's DC).
 * Deterministic per seed. Costs are not applied; this measures the gauge.
 */
export function simulateContest(r: Ruleset, kind: string, add: number, threat: Difficulty, runs = 2000, seed = "sim"): ContestSim {
  const dc = r.checks.dc[threat] ?? 12;
  const rng = seededRng(`${seed}:${kind}:${add}:${threat}`);
  let won = 0, lost = 0, broken = 0, rounds = 0, within = 0;
  const max = r.conflict.rounds.max;
  for (let i = 0; i < runs; i++) {
    let m = 0, n = 0;
    let end: "won" | "lost" | "broken" | null = null;
    while (!end) {
      n++;
      const tier = d20Tier(rollD20(rng), add, dc, r.checks.partial);
      m = nextMomentum(r, m, swingFor(r, tier, n), n);
      if (m >= 100) end = "won"; else if (m <= -100) end = "lost"; else if (n >= max) end = "broken";
    }
    if (end === "won") won++; else if (end === "lost") lost++; else broken++;
    rounds += n;
    if (n >= r.conflict.rounds.min && n <= 6) within++;
  }
  return { runs, won: won / runs, lost: lost / runs, brokenOff: broken / runs, meanRounds: rounds / runs, within: within / runs, odds: d20Odds(add, dc, r.checks.partial).success };
}
