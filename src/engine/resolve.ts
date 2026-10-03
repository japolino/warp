// Turn resolution: the only place outcomes are decided.

import type { ExprEnv, Value } from "./expr.js";
import { evalBool, evalNumber, evaluate, identifiers } from "./expr.js";
import { d20Odds, d20Tier, rollD20, rollDice, seededRng, type Rng } from "./dice.js";
import type { ActionDef, DecideSpec, Difficulty, DifficultyWord, Effect, NarratorGate, Requirement, Ruleset, Tier } from "./ruleset.js";
import { DEFAULT_DIRECTIONS, difficultyOf, percentOf, slug } from "./ruleset.js";
import { normalize, sample } from "./decide.js";
import { bonusSources, applyEvent, cloneState, formatNumber, itemName, makeEnv, personName, placeId, statMax, amountValue, type EventSource, type GameState, type WarpEvent } from "./state.js";
import { checkGains, checkStats, hardnessFrom, IMPROV, improvAction, isDifficulty, practise, practiceRepetition, trainingGain } from "./freeform.js";
import { presentPeople } from "./world.js";
import { bandCrossings, crossingLines } from "./people.js";
import { BREAK_OFF, GIVE_IN, CONTEST_PREFIX, bestStat, busyRound, breakOff, contestAction, contestId, contestRound, giveIn, kindOf, startContest, type RoundResult } from "./contest.js";
import { goalLife, goalOp, storyGoalNews, type GoalNews } from "./goals.js";

export interface CheckResult {
  label: string;
  /** Always "vs" (d20 + modifier vs a target); kept for the record view. */
  style: string;
  dice: string;
  faces: { sides: number; value: number; kept: boolean }[];
  roll: number;
  add: number;
  total: number;
  target: number | null;
  tier: Tier;
  seed: string;
  /** The difficulty word the target came from, when it came from one. */
  difficulty?: Difficulty;
  /** Gear and buffs that helped ("Running Sneakers: +5 Athletics"). */
  gear?: string[];
}

export interface TurnRecord {
  v: 1;
  /** Backend provenance of the rules and preceding active message path. */
  path?: string;
  action?: { id: string; label: string; params?: Record<string, string>; via: Intent["via"] };
  check?: CheckResult;
  /** Directions for the narrator, in order. */
  hints: string[];
  events: WarpEvent[];
  /** The outcome should be narrated off-screen. */
  veiled?: boolean;
  /** Uncertain reactions the engine rolled on, with the odds it used. */
  decisions?: DecisionResult[];
  /** How sure the adjudicator was when it read the player's message (0–1). */
  confidence?: number;
  /** The post-reply read's answers to `when_scene` triggers, by trigger id; the next turn's resolve fires them. */
  sceneRead?: Record<string, boolean>;
  /** Model calls this turn cost (the budget meter). */
  calls?: { helper: number; jev: number };
  /** Band-crossing story lines of this turn ("Mira is warming to you."), shown first in its "what changed" line. */
  lines?: string[];
  /** A contest round's block for the narrator: the check and the ordered beats. */
  beats?: string;
  at: number;
}

export interface DecisionResult {
  id: string;
  ask: string;
  picked: string;
  pickedDesc: string;
  /** Odds used for the draw. */
  p: Record<string, number>;
  /** Where the odds came from. */
  source: "model" | "weights";
  /** Option descriptions, for rolls that aren't `decide:` blocks in the ruleset. */
  descs?: Record<string, string>;
}

export interface Intent {
  actionId: string;
  params?: Record<string, string>;
  /** choice = clicked; adjudicator = read from typed text; confirmed = player accepted a suggestion. */
  via: "choice" | "adjudicator" | "command" | "confirmed";
  /** The label the player saw, for choices written on the spot (live choices). */
  label?: string;
}

/**
 * A choice written for the moment: the label is the writer's, the tag decides what happens.
 * `difficulty` is the writer's (or Jev's) word for how hard it is: it sets the target of a tag's check that has
 * no `vs:` (so the odds follow the words); `none` = no roll. In a contest the tag is `contest:<stat>` (a move
 * leaning on that stat) or `contest:break_off`.
 */
export interface LiveChoice {
  label: string; tag: string; target?: string;
  difficulty?: DifficultyWord;
}

/** Run `fn` with a cause stamped on every event it pushes (nested causes read "outer → inner"). */
function because<T>(w: Working, cause: string, fn: () => T): T {
  const prev = w.cause;
  w.cause = prev ? `${prev} → ${cause}` : cause;
  try { return fn(); } finally { w.cause = prev; }
}

/** Mutable working copy: every pushed event is applied immediately so later formulas see it. */
class Working {
  events: WarpEvent[] = [];
  hints: string[] = [];
  decisions: DecisionResult[] = [];
  /** Decide specs reached without model odds — the backend asks and re-resolves. */
  needs: DecideSpec[] = [];
  /**
   * World happenings wait for the next turn instead of joining this one's directions.
   * Only turn resolution (before the reply is written) narrates them right away.
   */
  defer = true;
  /** Live-tag taper: gains (not costs) of the tag's effects are multiplied by this. */
  taper = 1;
  constructor(
    public r: Ruleset,
    public s: GameState,
    private rng: Rng = seededRng("effects"),
    public seed = "effects",
    public odds: Record<string, Record<string, number>> = {},
    public scene: Record<string, boolean> = {},
  ) {}
  /** The cause stamped on events pushed right now (the "Why?" trace). */
  cause: string | null = null;
  push(e: WarpEvent) {
    if (this.cause && !e.why) e = { ...e, why: this.cause };
    applyEvent(this.s, e, this.r);
    this.events.push(e);
  }
  env(extra: Record<string, Value> = {}): ExprEnv {
    const base = makeEnv(this.r, this.s, extra);
    return {
      lookup: base.lookup,
      call: (name, args) => {
        // roll('2d10') inside effects — results are stored as concrete deltas, so replay stays stable.
        if (name === "roll") {
          try { return rollDice(String(args[0] ?? "d6"), this.rng).total; } catch { return 0; }
        }
        return base.call?.(name, args);
      },
    };
  }
}

// ───────────────────────── availability & odds ─────────────────────────

/** Per-person actions are addressed as "talk@robin". */
export const TARGET_SEP = "@";

/** Difficulty words that name the same option (`fair` and `normal`, `medium`). */
const WORD_ALIASES: Record<string, string[]> = { fair: ["normal", "medium"], normal: ["fair", "medium"], medium: ["fair", "normal"] };

export function paramValues(a: ActionDef, chosen?: Record<string, string>, target?: string): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const p of a.params) {
    const want = chosen?.[p.id];
    const key = want && p.options[want] !== undefined ? want
      : want && WORD_ALIASES[want]?.find((k) => p.options[k] !== undefined) || p.default;
    out[p.id] = p.options[key];
  }
  if (target) out.target = target;
  return out;
}

/** The authored actions in play. */
export function actionPool(r: Ruleset, _s: GameState): { defs: Record<string, ActionDef>; order: string[]; tags: string[] } {
  return { defs: r.actions, order: r.actionOrder, tags: [] };
}

/** `when:` and `requires:` allow it, before what it costs. */
export function whenHolds(r: Ruleset, s: GameState, a: ActionDef, target?: string): boolean {
  if (a.when && !evalBool(a.when, makeEnv(r, s, paramValues(a, undefined, target)), true)) return false;
  return true;
}

export function isAvailable(r: Ruleset, s: GameState, a: ActionDef, target?: string): boolean {
  if (a.targets && target !== undefined && !a.targets.includes(target)) return false; // per_person `targets:`
  return whenHolds(r, s, a, target) && !spentLock(r, s, a, target);
}

/**
 * One stat's cost as the turn will charge it: "-15%" is a share of the stat's current maximum
 * (whole numbers once it's at least one, as in effects); anything else is a formula.
 */
export function costValue(r: Ruleset, s: GameState, stat: string, raw: string | number, env: ExprEnv): number {
  const p = percentOf(raw);
  if (p === null) return evalNumber(raw, env, 0);
  const def = r.stats[stat];
  const x = p * (def ? statMax(r, def, s) : 100);
  return Math.abs(x) >= 1 ? Math.round(x) : x;
}

/**
 * The first `cost:` it can't pay ("Needs 8 Mana"), or null. A drop must fit above the stat's min.
 * Stats that are better low (stress, dread) never gate on a drop: that's relief, not a price.
 * Rises (positive costs) are allowed and never gate.
 */
export function costShortfall(r: Ruleset, s: GameState, a: ActionDef, target?: string, params?: Record<string, string>): string | null {
  const costs = Object.entries(a.cost.stats);
  if (!costs.length) return null;
  const env = makeEnv(r, s, paramValues(a, params, target));
  for (const [stat, d] of costs) {
    const def = r.stats[stat];
    if (def?.good === "low") continue;
    const v = costValue(r, s, stat, d, env);
    const have = s.stats[stat] ?? def?.start ?? 0;
    if (v < 0 && have + v < (def?.min ?? 0)) return `Needs ${formatNumber(-v)} ${def?.label ?? stat}`;
  }
  return null;
}

/** Does this effect do anything at all? (Empty maps and lists don't; any other key that's set does.) */
export function hasEffect(e: Effect): boolean {
  return Object.values(e).some((v) => v !== undefined && v !== null && v !== false
    && (typeof v !== "object" || (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0)));
}

/** Every combination of an action's param options (bounded), for "can any choice be paid for?". */
function paramCombos(a: ActionDef): Record<string, string>[] {
  let out: Record<string, string>[] = [{}];
  for (const p of a.params) {
    out = out.flatMap((c) => Object.keys(p.options).map((k) => ({ ...c, [p.id]: k })));
    if (out.length > 64) return out.slice(0, 64);
  }
  return out;
}

/**
 * Why an action that is otherwise allowed can't be taken now: a cost it can't pay.
 * With `params` the exact choice is judged; without them, an action with params is open while ANY option is affordable.
 */
export function spentLock(r: Ruleset, s: GameState, a: ActionDef, target?: string, params?: Record<string, string>): string | null {
  if (params || !a.params.length) return costShortfall(r, s, a, target, params);
  const combos = paramCombos(a);
  return combos.some((c) => !costShortfall(r, s, a, target, c)) ? null : costShortfall(r, s, a, target, combos[0]);
}

export function availableActions(r: Ruleset, s: GameState, lines: string[] = []): ActionDef[] {
  const blocked = new Set(lines.map((l) => l.toLowerCase()));
  return r.actionOrder
    .map((id) => r.actions[id])
    .filter((a) => !a.tags.some((t) => blocked.has(t)) && (a.perPerson || isAvailable(r, s, a)));
}

export interface ActionChoice { id: string; a: ActionDef; target?: string; label: string }

/**
 * Concrete choices: per-person actions expand to one entry per person present. During a contest the contest's
 * own moves come first (one per approach stat, Break off, Give in), so a clicked one resolves like any choice.
 */
export function availableChoices(r: Ruleset, s: GameState, lines: string[] = []): ActionChoice[] {
  const out: ActionChoice[] = [];
  if (s.contest) {
    const kind = kindOf(r, s.contest.kind);
    for (const id of [...kind.stats.map((st) => `${CONTEST_PREFIX}${st}`), BREAK_OFF, GIVE_IN]) {
      const a = contestAction(r, s, id);
      if (a) out.push({ id, a, label: a.label });
    }
  }
  const here = presentPeople(r, s);
  for (const a of availableActions(r, s, lines)) {
    if (!a.perPerson) { out.push({ id: a.id, a, label: a.label }); continue; }
    for (const pid of here) {
      if (!isAvailable(r, s, a, pid)) continue;
      const name = personName(r, s, pid);
      const label = /\btarget\b|\{\{target\}\}|\{target\}/i.test(a.label) ? a.label.replace(/\{\{target\}\}|\{target\}/gi, name) : `${a.label} (${name})`;
      out.push({ id: `${a.id}${TARGET_SEP}${pid}`, a, target: pid, label });
    }
  }
  return out;
}

/** Live choices resolve through their tag: `live:<tag>` (or `live:<tag>@<person>`). */
export const LIVE_PREFIX = "live:";
/** Using an item: `item:<id>` runs the item's `use:` action, wherever the player is. */
export const ITEM_PREFIX = "item:";

/** Items the player holds that can be used right now. Locked uses come back with their reason. */
export function usableItems(r: Ruleset, s: GameState): { id: string; a: ActionDef; locked: string | null }[] {
  const out: { id: string; a: ActionDef; locked: string | null }[] = [];
  for (const [id, n] of Object.entries(s.items)) {
    const a = r.items[id]?.use;
    if (!a || n <= 0) continue;
    out.push({ id: `${ITEM_PREFIX}${id}`, a, locked: isAvailable(r, s, a) ? null : lockReason(r, s, a) });
  }
  return out;
}

/** One unmet requirement, in words: "Lockpicking 30 (you have 18)", "Brann with you". */
export function requirementText(r: Ruleset, s: GameState, q: Requirement): string {
  const id = q.id ?? "";
  switch (q.kind) {
    case "stat": {
      const def = r.stats[id];
      const have = s.stats[id] ?? def?.start ?? 0;
      return `${def?.label ?? id} ${formatNumber(q.n ?? 0)} (you have ${formatNumber(Math.floor(have * 10) / 10)})`;
    }
    case "with": return `${personName(r, s, id)} with you`;
    case "has": return `${(q.n ?? 1) > 1 ? `${q.n}× ` : ""}${itemName(r, s, id)}`;
    case "rel": return `${personName(r, s, id)}'s ${r.relStats[q.stat ?? ""]?.label ?? q.stat} at ${formatNumber(q.n ?? 0)}`;
    case "goal": {
      const text = s.goals?.[id]?.text ?? r.goals.list[id]?.text ?? id;
      return q.state === "open" ? `the goal "${text}"` : `"${text}" ${q.state}`;
    }
    case "flag": return `${q.state === "off" ? "not " : ""}${r.flags[id]?.label ?? id.replace(/_/g, " ")}`;
    default: return q.text ?? "the right moment";
  }
}

/** A plain reason a choice is locked, read from simple conditions ("Needs a Cream Brioche"). */
export function lockReason(r: Ruleset, s: GameState, a: ActionDef): string {
  // Allowed now, but unaffordable: say that, not the `when:` text.
  const spent = whenHolds(r, s, a) ? spentLock(r, s, a) : null;
  if (spent) return spent;
  if (a.whyNot) return a.whyNot;
  if (a.requires.length) {
    const env = makeEnv(r, s);
    const unmet = a.requires.filter((q) => !evalBool(q.when, env, false));
    const needs = unmet.filter((q) => q.kind !== "formula").map((q) => requirementText(r, s, q));
    const other = unmet.filter((q) => q.kind === "formula").map((q) => requirementText(r, s, q));
    const words = [needs.length ? `Needs ${needs.join(", ")}` : "", ...other].filter(Boolean).join(" · ");
    if (words) return words;
  }
  const need = [...(a.when ?? "").matchAll(/has\(\s*'([^']+)'/g)].map((m) => m[1]).filter((id) => !(s.items[id] > 0));
  if (need.length && /\bor\b/.test(a.when ?? "")) return `Needs ${need.map((id) => itemName(r, s, id)).join(" or ")}`;
  if (need.length) return `Needs ${need.map((id) => itemName(r, s, id)).join(" and ")}`;
  return "Not possible right now";
}

/**
 * What adds to the stats a check reads: carried gear and buffs or debuffs from conditions. Each counts as that
 * much more of the stat, for this check only.
 */
export function gearFor(r: Ruleset, s: GameState, a: ActionDef): { stats: Record<string, number>; notes: string[] } {
  const stats: Record<string, number> = {};
  const notes: string[] = [];
  if (!a.check) return { stats, notes };
  const reads = new Set([...identifiers(a.check.add as string), ...identifiers(a.check.target as string)]);
  for (const src of bonusSources(r, s)) {
    for (const [stat, b] of Object.entries(src.bonus)) {
      if (!b || !reads.has(stat)) continue;
      stats[stat] = (stats[stat] ?? 0) + b;
      notes.push(`${src.from}: ${b > 0 ? "+" : ""}${formatNumber(b)} ${r.stats[stat]?.label ?? stat}`);
    }
  }
  return { stats, notes };
}

/** "-25%" → a quarter of `max`; otherwise the formula's value. Whole numbers once they're bigger than one. */
function amountOf(w: Working, v: string | number, extra: Record<string, Value>, max: number): number {
  const p = percentOf(v);
  const x = p !== null ? p * max : evalNumber(v, w.env(extra), 0);
  return Math.abs(x) >= 1 && p !== null ? Math.round(x) : x;
}

/** Look up an intent's action (and target): items, typed attempts, the contest's moves, live tags, authored actions. */
export function findAction(r: Ruleset, s: GameState, actionId: string): { a: ActionDef; target?: string } | null {
  const contest = contestId(actionId);
  if (contest) {
    const a = contestAction(r, s, contest);
    return a ? { a } : null;
  }
  const [base, target] = actionId.split(TARGET_SEP);
  const allowed = (a: ActionDef) => isAvailable(r, s, a, target)
    && (!a.perPerson || !!target)
    && (!target || presentPeople(r, s).includes(target));
  if (base.startsWith(ITEM_PREFIX)) {
    const id = base.slice(ITEM_PREFIX.length);
    const item = r.items[id];
    const a = item?.use;
    return a && (s.items[id] ?? 0) > 0 && !(item.uses > 0 && (s.uses[id] ?? item.uses) <= 0) && allowed(a)
      ? { a, ...(target ? { target } : {}) } : null;
  }
  if (base.startsWith(IMPROV)) {
    const a = improvAction(r, s, base);
    return a ? { a } : null;
  }
  const a = base.startsWith(LIVE_PREFIX) ? r.liveChoices.tags[base.slice(LIVE_PREFIX.length)] : r.actions[base];
  return a && allowed(a) ? { a, ...(target ? { target } : {}) } : null;
}

/** The narrator's direction for a tier ("fail forward"): the ruleset's own, or the default. */
export function tierDirection(r: Ruleset, tier: Tier): string {
  return r.checks.directions[tier] ?? DEFAULT_DIRECTIONS[tier];
}

/**
 * The numbers of a check: the modifier, the target (a difficulty word, a number or a formula; absent = the
 * move's difficulty word, default fair) and the partial margin. Gear counts as more of the stats it reads.
 */
export function checkNumbers(r: Ruleset, s: GameState, a: ActionDef, params?: Record<string, string>, who?: string): { add: number; target: number; partial: number; difficulty?: Difficulty } {
  const check = a.check!;
  const gear = gearFor(r, s, a).stats;
  const eff = Object.keys(gear).length ? { ...s, stats: Object.fromEntries(Object.entries(s.stats).map(([k, v]) => [k, v + (gear[k] ?? 0)])) } : s;
  const adjusted = makeEnv(r, eff, paramValues(a, params, who));
  const plain = makeEnv(r, s, paramValues(a, params, who));
  // eff('str') / gear('str') add the gear themselves, so they read the unadjusted state (no double count).
  const env: ExprEnv = { lookup: adjusted.lookup, call: (n, args) => (n === "eff" || n === "gear" ? plain.call?.(n, args) : adjusted.call?.(n, args)) };
  const add = check.add !== undefined ? Math.round(evalNumber(check.add, env, 0)) : 0;
  const word = typeof check.target === "string" ? difficultyOf(check.target) : null;
  let difficulty: Difficulty | undefined;
  let target: number;
  if (check.target === undefined) {
    // The move's own word: a live choice's difficulty, or a typed attempt's; fair when nothing says.
    difficulty = difficultyOf(params?.difficulty) ?? "fair";
    target = r.checks.dc[difficulty];
  } else if (word) {
    difficulty = word;
    target = r.checks.dc[word];
  } else target = Math.round(evalNumber(check.target, env, r.checks.dc.fair));
  return { add, target, partial: check.partialMargin ?? r.checks.partial, ...(difficulty ? { difficulty } : {}) };
}

export interface Odds { success: number; partial: number }

/** Probability of success-or-better (and of partial) for the UI: exact, so the shown % is the real %. */
export function odds(r: Ruleset, s: GameState, a: ActionDef, params?: Record<string, string>, who?: string): Odds | null {
  if (!a.check || params?.difficulty === "none") return null;
  const { add, target, partial } = checkNumbers(r, s, a, params, who);
  return d20Odds(add, target, partial);
}

// ───────────────────────── effects ─────────────────────────

/** Flag values may be formulas ("enemy_defense - 3") or plain text ("well-known"). Formulas only count if every name resolves. */
function flagValue(v: Value, env: ExprEnv): Value {
  if (typeof v !== "string") return v;
  try {
    const unknown = new Set<string>();
    const out = evaluate(v, env, { unknown });
    return unknown.size ? v : out;
  } catch {
    return v;
  }
}

/** Is this change a gain for {{user}} (the part a taper shrinks)? */
function isGain(good: "high" | "low" | "none" | undefined, v: number): boolean {
  return good === "low" ? v < 0 : v > 0;
}

function effectToEvents(w: Working, e: Effect, src: EventSource, extra: Record<string, Value>) {
  const r = w.r;
  for (const [id, d] of Object.entries(e.stats)) {
    const def = r.stats[id];
    let v = amountOf(w, d, extra, def ? statMax(r, def, w.s) : 100);
    if (w.taper < 1 && isGain(def?.good, v)) v *= w.taper;
    if (Math.abs(v) > 1e-9) w.push({ t: "stat", id, d: v, src });
  }
  for (const [id, d] of Object.entries(e.set)) {
    w.push({ t: "stat", id, set: evalNumber(d, w.env(extra), 0), src });
  }
  for (const [key, v] of Object.entries(e.flags)) {
    w.push({ t: "flag", key, v: flagValue(v, w.env(extra)), src });
  }
  for (const [id, n] of Object.entries(e.items)) {
    if (n < 0 && !(w.s.items[id] > 0)) continue;
    w.push({ t: "item", id, d: n, src });
  }
  for (const [key, m] of Object.entries(e.rel)) {
    // `rel: { target: … }` = whoever a per-person move is aimed at; `opponent` = the contest's opponent (when tracked).
    const who = key === "target" ? (typeof extra.target === "string" ? extra.target : null)
      : key === "opponent" ? (typeof extra.opponent === "string" ? extra.opponent : w.s.contest?.who ?? null) : key;
    if (!who) continue;
    if (!w.s.people[who]) w.push({ t: "person", id: who, name: r.people[who]?.name ?? who, src });
    for (const [stat, d] of Object.entries(m)) {
      let v = evalNumber(d, w.env(extra), 0);
      if (w.taper < 1 && isGain(r.relStats[stat]?.good, v)) v *= w.taper;
      if (Math.abs(v) > 1e-9) w.push({ t: "rel", who, stat, d: v, src });
    }
  }
  if (e.place) {
    const name = fillTarget(w, e.place, extra);
    if (name.toLowerCase() !== (w.s.locationName ?? "").toLowerCase()) w.push({ t: "move", to: placeId(name), name, src });
  }
  for (const [key, l] of Object.entries(e.look)) {
    const who = key === "you" ? "you" : key === "target" ? (typeof extra.target === "string" ? extra.target : null) : key === "opponent" ? w.s.contest?.who ?? null : findPerson(r, w.s, key);
    if (!who) continue;
    for (const field of ["appearance", "outfit"] as const) if (field in l) w.push({ t: "look", who, field, text: l[field] ?? null, src });
  }
  for (const [id, dur] of Object.entries(e.addConditions)) w.push(condOn(w, id, dur, src));
  for (const id of e.removeConditions) if (w.s.conditions[id]) w.push({ t: "cond", id, on: false, src });
  for (const [id, op] of Object.entries(e.goal)) goalOp(builderOf(w), id, op, src);
  for (const [who, text] of Object.entries(e.remember)) {
    const person = who === "target" ? (typeof extra.target === "string" ? extra.target : null) : who === "opponent" ? w.s.contest?.who ?? null : who;
    if (person) w.push({ t: "memory", who: person, text: fillTarget(w, text, extra), src });
  }
  // Secrets.
  for (const id of e.reveal) {
    const sec = r.secrets[id];
    const cur = w.s.secrets[id] ?? -1;
    if (sec && cur + 1 < sec.stages.length) w.push({ t: "secret", id, stage: cur + 1, src });
  }
  if (e.swing !== undefined && w.s.contest) {
    const v = evalNumber(e.swing, w.env(extra), 0);
    if (v !== 0) w.push({ t: "swing", d: v, src });
  }
  if (e.contest && !w.s.contest) startContest(builderOf(w), { kind: e.contest.kind, opponent: fillTarget(w, e.contest.with, extra), threat: e.contest.threat }, src === "narrator" ? "narrator" : "trigger");
  if (e.time) advanceTime(w, e.time, src);
  if (e.hint) announce(w, fillTarget(w, e.hint, extra));
  for (const d of e.decide) decide(w, d, src, extra);
}

/** A condition put on {{user}}: it lasts its minutes (or until removed). */
function condOn(w: Working, id: string, minutes: number | null, src: EventSource): WarpEvent {
  const def = w.r.conditions[id];
  return { t: "cond", id, on: true, until: minutes === null ? (def?.lasts ? w.s.minutes + def.lasts : null) : w.s.minutes + minutes, src };
}

// ───────────────────────── notices and secrets ─────────────────────────

/** Something happened in the world: tell the narrator now, or on the next turn if the reply is already written. */
function announce(w: Working, text: string) {
  if (w.defer) w.push({ t: "notice", text, src: "world" });
  else w.hints.push(text);
}

/** Open every secret stage whose condition now holds — in order; a ladder never skips a rung. */
function openSecrets(w: Working) {
  for (const sec of Object.values(w.r.secrets)) {
    let cur = w.s.secrets[sec.id] ?? -1;
    while (cur + 1 < sec.stages.length) {
      const st = sec.stages[cur + 1];
      if (st.when && !evalBool(st.when, w.env(), false)) break;
      cur++;
      w.push({ t: "secret", id: sec.id, stage: cur, src: "trigger" });
    }
  }
}

function decide(w: Working, d: DecideSpec, src: EventSource, extra: Record<string, Value>) {
  if (w.decisions.some((x) => x.id === d.id)) return; // one draw per decision per turn
  // Options with `when:` are weighed only while it holds; if none holds, every option is.
  if (d.options.some((o) => o.when !== undefined)) {
    const env = w.env(extra);
    const open = d.options.filter((o) => o.when === undefined || evalBool(o.when, env, false));
    if (open.length && open.length < d.options.length) d = { ...d, options: open };
  }
  const keys = d.options.map((o) => o.id);
  const model = w.odds[d.id];
  if (!model) w.needs.push(d);
  const p = normalize(model ?? Object.fromEntries(d.options.map((o) => [o.id, o.weight])), keys);
  const picked = sample(p, seededRng(`${w.seed}:decide:${d.id}`));
  const opt = d.options.find((o) => o.id === picked)!;
  w.decisions.push({ id: d.id, ask: fillTarget(w, d.ask, extra), picked, pickedDesc: fillTarget(w, opt.desc, extra), p, source: model ? "model" : "weights" });
  because(w, `${fillTarget(w, d.ask, extra)} → ${fillTarget(w, opt.desc, extra)} (${Math.round((p[picked] ?? 0) * 100)}% odds)`, () => effectToEvents(w, opt.effect, src, extra));
}

function advanceTime(w: Working, minutes: number, src: EventSource) {
  if (!w.r.clock.enabled || minutes <= 0) return;
  w.push({ t: "time", min: minutes, src });
  for (const id of w.r.statOrder) {
    const def = w.r.stats[id];
    // A formula (or "+6%" of the maximum) is worked out as the time passes.
    const rate = def.perHourExpr !== undefined ? amountValue(def.perHourExpr, w.env(), statMax(w.r, def, w.s)) : def.perHour;
    if (!rate) continue;
    const d = (rate * minutes) / 60;
    if (Math.abs(d) > 1e-9) w.push({ t: "stat", id, d, src: "drift", why: `${minutes >= 60 ? `${Math.round(minutes / 6) / 10}h` : `${minutes} min`} passed (${def.label} drifts ${rate > 0 ? "+" : ""}${formatNumber(rate)}/h)` });
  }
  for (const [id, c] of Object.entries(w.s.conditions)) {
    if (c.until !== null && c.until <= w.s.minutes) w.push({ t: "cond", id, on: false, src: "drift", note: "expired" });
  }
}

function runTriggers(w: Working, includeRepeat: boolean) {
  const fired = new Set<string>();
  const limit = Math.max(5, Math.min(256, w.r.triggers.length * 2 + 1));
  for (let pass = 0; pass < limit; pass++) {
    let changed = false;
    for (const t of w.r.triggers) {
      // Scene triggers only move when the post-reply read judged them.
      if (t.whenScene && !(t.id in w.scene)) continue;
      const now = (t.when === undefined || evalBool(t.when, w.env(), false)) && (!t.whenScene || w.scene[t.id] === true);
      const prev = w.s.triggers[t.id] ?? false;
      const why = `Rule "${t.id.replace(/_/g, " ")}"${t.when ? ` (${t.when})` : ""}${t.whenScene ? ` — judged: ${t.whenScene}` : ""}`;
      if (now && !prev) {
        w.push({ t: "trig", id: t.id, v: true, src: "trigger" });
        because(w, why, () => effectToEvents(w, t.effects, "trigger", {}));
        fired.add(t.id);
        changed = true;
      } else if (now && t.repeat && includeRepeat && !fired.has(t.id)) {
        because(w, `${why}, every turn while true`, () => effectToEvents(w, t.effects, "trigger", {}));
        fired.add(t.id);
        changed = true;
      } else if (!now && prev) {
        w.push({ t: "trig", id: t.id, v: false, src: "trigger" });
        changed = true;
      }
    }
    if (!changed) break;
    if (pass === limit - 1 && w.r.triggers.some((t) => {
      if (t.whenScene && !(t.id in w.scene)) return false;
      const now = (t.when === undefined || evalBool(t.when, w.env(), false)) && (!t.whenScene || w.scene[t.id] === true);
      return now !== (w.s.triggers[t.id] ?? false);
    })) {
      announce(w, "Rule processing reached its safety limit. Some rules still disagree with the state; check for a cycle in the ruleset.");
    }
  }
  openSecrets(w);
  goalLife(builderOf(w));
}

// ───────────────────────── the turn ─────────────────────────

export const TIER_FALLBACK: Record<Tier, Tier[]> = {
  crit_success: ["crit_success", "success"],
  success: ["success"],
  partial: ["partial", "success"],
  fail: ["fail"],
  crit_fail: ["crit_fail", "fail"],
};

export const TIER_LABEL: Record<Tier, string> = {
  crit_success: "Critical success",
  success: "Success",
  partial: "Partial success",
  fail: "Failure",
  crit_fail: "Critical failure",
};

export interface ResolveOptions {
  seed: string;
  /** What the player wrote this turn (a long described move is kept as written). */
  playerText?: string;
  veils?: string[];
  /** Model odds for decide blocks, by decide id. Missing ones fall back to author weights and are listed in `needs`. */
  odds?: Record<string, Record<string, number>>;
  /** Judged plain-language trigger conditions, by trigger id (the previous reply's record `sceneRead`). */
  scene?: Record<string, boolean>;
  /** A typed message starts a contest: it begins before the move lands, and this message is round 1. */
  contest?: { kind: string; opponent: string; threat?: Difficulty };
}

export interface Resolution { record: TurnRecord; needs: DecideSpec[] }

/** Resolve, reporting decide blocks that still need model odds. Same seed → same dice on a second pass. */
export function resolveTurnFull(r: Ruleset, before: GameState, intent: Intent | null, opts: ResolveOptions): Resolution {
  const needs: DecideSpec[] = [];
  const record = resolveInner(r, before, intent, opts, needs);
  return { record, needs };
}

/** Decide the outcome of a turn before narration. `intent` is null for plain free-text turns. */
export function resolveTurn(r: Ruleset, before: GameState, intent: Intent | null, opts: ResolveOptions): TurnRecord {
  return resolveInner(r, before, intent, opts, []);
}

/** The live tag's taper key: the same tag on the same person. */
export function tagKey(tag: string, target?: string): string {
  return `tag:${tag}:${target ?? ""}`;
}

/**
 * The taper settings as a practice-repetition rule: uses in the last 8 turns count; a long break (8 in-game hours)
 * also resets it. (A story that skips an hour per reply must not make the same kind move fresh every few turns.)
 */
export function taperRule(r: Ruleset) {
  return r.liveChoices.taper === false ? false as const : { step: r.liveChoices.taper.step, floor: r.liveChoices.taper.floor, recoverMinutes: 480, recoverTurns: 8 };
}

function resolveInner(r: Ruleset, before: GameState, intent: Intent | null, opts: ResolveOptions, needs: DecideSpec[]): TurnRecord {
  const w = new Working(r, cloneState(before), seededRng(`${opts.seed}:fx`), opts.seed, opts.odds ?? {}, opts.scene ?? {});
  w.defer = false;
  const rec: TurnRecord = { v: 1, hints: [], events: [], at: Date.now() };
  const t = builderOf(w);
  // World happenings that surfaced after the last reply are this turn's news.
  if (before.notices.length) {
    w.hints.push(...before.notices);
    w.push({ t: "noticed", src: "world" });
  }
  // A contest a typed message starts begins before the move lands: this message is round 1.
  if (opts.contest && !w.s.contest) because(w, "The scene: a contest breaks out", () => startContest(t, opts.contest!, "trigger"));

  if (w.s.contest) {
    contestTurn(w, rec, intent, opts);
  } else if (intent) {
    const found = findAction(r, w.s, intent.actionId);
    if (!found) return { ...rec, hints: ["The attempted action isn't available in the current state. It did not happen and spent no turn or resources."] };
    // The chosen params decide the price ("buy ten" costs more than "buy one"): judge the exact choice.
    const short = found.a.params.length ? spentLock(r, w.s, found.a, found.target, intent.params) : null;
    if (short) return { ...rec, hints: [`The attempted action can't be paid for with that choice (${short}). It did not happen and spent no turn or resources.`] };
    actionTurn(w, rec, intent, found.a, found.target, opts);
  }

  runTriggers(w, true);
  // A band crossing before the narrator writes is shown in this very reply.
  const lines = crossingLines(bandCrossings(r, before, w.s));
  if (lines.length) {
    rec.lines = lines;
    w.hints.push(`Show in this reply: ${lines.join(" ")}`);
  }
  w.push({ t: "turn", src: "action" });
  rec.events = w.events;
  rec.hints = w.hints;
  if (w.decisions.length) {
    rec.decisions = w.decisions;
    for (const d of w.decisions) if (!d.descs) rec.hints.push(`${d.ask} → ${d.pickedDesc}`);
  }
  needs.push(...w.needs);
  return rec;
}

/** An ordinary action (authored, a live tag, an item, a typed attempt): costs, the check, effects, time. */
function actionTurn(w: Working, rec: TurnRecord, intent: Intent, a: ActionDef, who: string | undefined, opts: ResolveOptions) {
  const r = w.r;
  const before = cloneState(w.s);
  const extra = paramValues(a, intent.params, who);
  const improvised = a.id.startsWith(IMPROV);
  const live = intent.actionId.startsWith(LIVE_PREFIX) ? intent.actionId.slice(LIVE_PREFIX.length).split(TARGET_SEP)[0] : null;
  const word = intent.params?.difficulty;
  const noRoll = live !== null && word === "none";
  const difficulty = isDifficulty(word) ? word : "fair";
  const label = improvised
    ? `Attempt: ${a.check?.label ?? "luck"}, ${difficulty}`
    : intent.label ?? (who ? `${a.label} (${personName(r, before, who)})` : a.label);
  rec.action = { id: intent.actionId, label, via: intent.via, ...(a.params.length ? { params: Object.fromEntries(a.params.map((p) => [p.id, intent.params?.[p.id] ?? p.default])) } : {}) };
  // A live tag used again soon on the same person gives less (its gains taper; costs don't).
  if (live !== null) {
    const rule = taperRule(r);
    if (rule) {
      const rep = practiceRepetition(before, tagKey(live, who), rule);
      w.taper = rep.multiplier;
      w.push({ t: "practice_use", key: tagKey(live, who), n: rep.n, turn: before.turn, minutes: before.minutes, src: "action" });
    }
  }
  // Check numbers and gear describe the committed attempt, before its costs.
  because(w, `Cost of "${label}"`, () => effectToEvents(w, a.cost, "cost", extra));
  // Using an item spends a charge, or one of it — unless it's a tool that keeps.
  if (a.id.startsWith(ITEM_PREFIX)) {
    const itemId = a.id.slice(ITEM_PREFIX.length);
    const it = r.items[itemId];
    if (it && !it.keep && (w.s.items[itemId] ?? 0) > 0) because(w, `Used ${it.name}`, () => w.push(it.uses > 0 ? { t: "use", id: itemId, n: 1, src: "action" } : { t: "item", id: itemId, d: -1, src: "action" }));
  }
  if (a.check && !noRoll) {
    const params = { ...(intent.params ?? {}), ...(improvised || live !== null ? { difficulty } : {}) };
    const { add, target, partial, difficulty: dw } = checkNumbers(r, before, a, params, who);
    const natural = rollD20(seededRng(opts.seed));
    const tier = d20Tier(natural, add, target, partial);
    rec.check = {
      label: a.check.label ?? a.label, style: "vs", dice: "d20", faces: [{ sides: 20, value: natural, kept: true }],
      roll: natural, add, total: natural + add, target, tier, seed: opts.seed, ...(dw ? { difficulty: dw } : {}),
    };
    const gear = gearFor(r, before, a).notes;
    if (gear.length) rec.check.gear = gear;
    // `effects:` next to a check always happen, whatever the dice say (then the tier's own effects).
    if (hasEffect(a.effects)) because(w, `"${label}"`, () => effectToEvents(w, a.effects, "action", extra));
    const key = TIER_FALLBACK[tier].find((t) => a.outcomes[t]);
    const how = `rolled ${rec.check.total} vs ${target}`;
    if (key) because(w, `"${label}": ${rec.check.label} ${how} → ${TIER_LABEL[tier]}`, () => effectToEvents(w, a.outcomes[key]!, "check", extra));
    if (improvised) {
      // Typed freely: keep what the player wrote they do; the dice only decide how it turns out.
      w.hints.push(`{{user}} attempts what they wrote (${a.check.label}, ${difficulty}). ${tierDirection(r, tier)} Keep {{user}}'s own words and choices; the dice decide only how it turns out.`);
    } else if (!key || !a.outcomes[key]!.hint || key !== tier) w.hints.push(tierDirection(r, tier));
    // Using a skill or attribute in a check is how it grows.
    const used = checkStats(r, a);
    if (used.length) {
      const hard = hardnessFrom(improvised ? null : odds(r, before, a, params, who)?.success ?? null, improvised ? difficulty : dw);
      const gains = checkGains(r, w.s, used, hard, tier);
      if (Object.keys(gains).length) practise(builderOf(w), gains, `Used in "${label}" (${TIER_LABEL[tier].toLowerCase()})`, { actionId: a.id, target: who, params: intent.params });
    }
  } else {
    because(w, `"${label}"`, () => effectToEvents(w, a.effects, "action", extra));
  }
  w.taper = 1;
  advanceTime(w, a.time ?? (improvised && r.checks.time !== undefined ? r.checks.time : r.clock.minutesPerAction), "action");
  const veils = new Set((opts.veils ?? []).map((v) => v.toLowerCase()));
  if (a.tags.some((t) => veils.has(t))) rec.veiled = true;
}

/** A turn while a contest runs: every message is a move (or Break off / Give in / a busy round). */
function contestTurn(w: Working, rec: TurnRecord, intent: Intent | null, opts: ResolveOptions) {
  const r = w.r;
  const t = builderOf(w);
  const c = w.s.contest!;
  const kind = kindOf(r, c.kind);
  const cid = intent ? contestId(intent.actionId) : null;
  let res: RoundResult;
  if (cid === GIVE_IN) {
    rec.action = { id: GIVE_IN, label: "Give in", via: intent!.via };
    res = because(w, `Gave in to ${c.opponent}`, () => giveIn(t));
  } else if (cid === BREAK_OFF) {
    rec.action = { id: BREAK_OFF, label: intent!.label ?? "Break off", via: intent!.via };
    res = because(w, `Tried to break off from ${c.opponent}`, () => breakOff(t, opts.seed));
  } else if (cid || !intent || intent.actionId.startsWith(IMPROV)) {
    // A move: the clicked stat, a typed attempt's stat, or (typed, unread) the kind's best stat for {{user}}.
    const stat = cid ? cid.slice(CONTEST_PREFIX.length) : intent?.actionId.startsWith(IMPROV) ? intent.actionId.slice(IMPROV.length) : bestStat(r, w.s, kind);
    const a = cid ? contestAction(r, w.s, cid) : null;
    // Clicked: the words on the button. Typed: kept exactly as {{user}} wrote it.
    const clicked = intent && intent.via !== "adjudicator" ? intent.label ?? a?.label : undefined;
    rec.action = { id: `${CONTEST_PREFIX}${stat}`, label: clicked ?? `${kind.label}: ${r.stats[stat]?.label ?? (stat || "luck")}`, via: intent?.via ?? "adjudicator" };
    res = because(w, `${kind.label} with ${c.opponent}, round ${c.round + 1}`, () => contestRound(t, { stat, ...(clicked ? { label: clicked } : {}), typed: !clicked }, opts.seed));
  } else {
    // Something else (an item, an authored action): its effects apply, no roll, and the opponent presses.
    const found = findAction(r, w.s, intent.actionId);
    if (found) actionTurn(w, rec, intent, found.a, found.target, opts);
    const label = rec.action?.label ?? "something else";
    res = because(w, `Busy during the ${kind.label.toLowerCase()}`, () => busyRound(t, label));
  }
  if (res.check) rec.check = res.check;
  rec.beats = res.beats;
  advanceTime(w, 1, "action");
}

// ───────────────────────── narrator proposals ─────────────────────────

/**
 * What the post-reply read proposes: the only interface between the pipeline's interpreters and the engine.
 * Every field is optional; `applyProposal` enforces the ruleset's limits (caps, gates, open/closed lists).
 */
export interface Proposal {
  minutes?: number;
  stats?: Record<string, number>;
  rel?: Record<string, Record<string, number>>;
  /** Newly introduced people, with where they stand toward the player right now, and whether they are adults (null = unclear). */
  people?: { id?: string; name: string; feelings?: Record<string, number>; adult?: boolean | null }[];
  /** One-time starting feelings for tracked people who have never been calibrated. */
  feelings?: Record<string, Record<string, number>>;
  items?: Record<string, number>;
  /** Where {{user}} is at the end of the reply, in words. */
  place?: string;
  /** Looks and clothes that changed, keyed "you" or a person's name (null clears a line). */
  looks?: Record<string, { appearance?: string | null; outfit?: string | null }>;
  /** Big-moment people (a rescue, betrayal, confession), highest probability first; the engine uses the first. */
  moments?: string[];
  /** A contest broke out in the reply (kind, the opponent's name, how dangerous). */
  contest?: { kind: string; opponent: string; threat?: Difficulty };
  /** Story goals: new ones (text, what counts as done, who asked, what's at stake), and ids that moved, closed or failed. */
  goals?: { new?: { text: string; done?: string; from?: string; stakes?: string }[]; advanced?: string[]; done?: string[]; failed?: string[] };
  conditions?: { add?: string[]; remove?: string[] };
  flags?: Record<string, Value>;
  /** Who is (true) or isn't (false) in the scene at the end of the reply, by name. */
  scene?: Record<string, boolean>;
  /** Items with uses that were used, by name → times. */
  used?: Record<string, number>;
  /** Skills or attributes {{user}} practised, trained or studied during the reply. */
  train?: string[];
  /** Moments people will remember about {{user}}, by name. */
  memories?: Record<string, string>;
}

/** What the story's changes are checked against: the exchange's text and the action that was taken. */
export interface GateContext { text: string; action?: { id: string; tags: string[] } }

/** Tags of an action by id (authored actions and live-choice tags). */
export function actionTags(r: Ruleset, actionId: string): string[] {
  const base = actionId.split(TARGET_SEP)[0];
  const a = base.startsWith(LIVE_PREFIX) ? r.liveChoices.tags[base.slice(LIVE_PREFIX.length)] : r.actions[base];
  return [...(a?.tags ?? [])];
}

function gateOpen(g: NarratorGate | undefined, w: Working, ctx: GateContext | undefined): boolean {
  if (!g) return true;
  if (g.when && !evalBool(g.when, w.env(), false)) return false;
  if (g.words) {
    const text = ctx?.text.toLowerCase() ?? "";
    if (!g.words.some((x) => text.includes(x))) return false;
  }
  if (g.actions) {
    const a = ctx?.action;
    if (!a) return false;
    const id = a.id.split(TARGET_SEP)[0].toLowerCase();
    if (!g.actions.some((x) => x === id || a.tags.includes(x))) return false;
  }
  return true;
}

function clampAbs(v: number, lim: number) {
  return Math.max(-lim, Math.min(lim, v));
}

/** A tracked person's id from a name or id ("Miu" finds "Miu Tanaka" when only one fits), or null. */
export function findPerson(r: Ruleset, s: GameState, key: string): string | null {
  const k = String(key).trim().toLowerCase();
  if (!k) return null;
  const sl = slug(k);
  for (const [id, p] of Object.entries(s.people)) if (id === k || id === sl || p.name.toLowerCase() === k) return id;
  for (const p of Object.values(r.people)) if (p.id === k || p.id === sl || p.name.toLowerCase() === k) return p.id;
  // "Miu" for "Miu Tanaka" (or the other way round) — only when just one tracked person fits.
  const first = (n: string) => n.toLowerCase().split(/\s+/)[0];
  const hits = Object.entries(s.people).filter(([, p]) => first(p.name) === first(k));
  return hits.length === 1 ? hits[0][0] : null;
}

/**
 * A big moment lets the story move one person past the slow-burn cap (× factor), crossing at most one band.
 * Returns the person it applies to this reply (the first that is tracked and off cooldown), or null.
 */
function bigMomentPerson(r: Ruleset, s: GameState, moments: unknown): string | null {
  if (!r.relBigMoment || !Array.isArray(moments)) return null;
  for (const name of moments) {
    if (typeof name !== "string") continue;
    const id = findPerson(r, s, name);
    if (!id) continue;
    const last = s.big?.[id];
    if (last === undefined || s.turn - last >= r.relBigMoment.cooldown) return id;
    return null; // the strongest moment is still cooling down: no other person takes its place
  }
  return null;
}

/** Keep a big moment's move within one band of where the value starts. */
function oneBand(def: { bands: { at: number }[]; min: number; max: number }, cur: number, v: number): number {
  const bands = def.bands.map((b) => b.at).sort((a, b) => a - b);
  if (!bands.length) return v;
  let i = 0;
  for (let k = 0; k < bands.length; k++) if (cur >= bands[k]) i = k;
  if (v > 0 && i + 2 < bands.length) return Math.min(v, bands[i + 2] - 1 - cur);
  if (v < 0 && i - 1 >= 0) return Math.max(v, bands[i - 1] - cur);
  return v;
}

/** Turn a model's suggested changes into events, enforcing every limit the ruleset sets. */
export function applyProposal(r: Ruleset, before: GameState, p: Proposal, ctx?: GateContext): WarpEvent[] {
  const w = new Working(r, cloneState(before), seededRng(`narrator:${before.turn}`));
  w.cause = "Read from the story";
  const src: EventSource = "narrator";
  const t = builderOf(w);
  // Who the story has in the scene; people who appear count as here.
  const scene: Record<string, boolean> = {};

  for (const person of p.people ?? []) {
    if (!person?.name) continue;
    const known = findPerson(r, w.s, person.name);
    if (known) {
      // Already tracked: treat any feelings as a starting read if they've never been calibrated.
      if (person.feelings) calibrate(w, known, person.feelings, src);
      if (typeof person.adult === "boolean" && w.s.adults[known] !== person.adult && r.people[known]?.age === undefined) w.push({ t: "adult", who: known, adult: person.adult, src });
      scene[known] = true;
      continue;
    }
    if (!r.peopleOpen) continue;
    const id = slug(person.id || person.name);
    if (!w.s.people[id]) w.push({ t: "person", id, name: person.name, src });
    calibrate(w, id, person.feelings ?? {}, src);
    if (typeof person.adult === "boolean" && w.s.adults[id] !== person.adult) w.push({ t: "adult", who: id, adult: person.adult, src });
    scene[id] = true;
  }
  for (const [who, feelings] of Object.entries(p.feelings ?? {})) {
    const id = findPerson(r, w.s, who);
    if (id) calibrate(w, id, feelings ?? {}, src);
  }

  for (const [id, d] of Object.entries(p.stats ?? {})) {
    const def = r.stats[id];
    if (!def || def.narrator <= 0 || typeof d !== "number" || !Number.isFinite(d)) continue;
    if (!gateOpen(def.gate, w, ctx)) continue;
    const v = clampAbs(d, def.narrator);
    if (v !== 0) w.push({ t: "stat", id, d: v, src });
  }

  const big = bigMomentPerson(r, w.s, p.moments);
  let bigUsed = false;
  for (const [who, m] of Object.entries(p.rel ?? {})) {
    let id = findPerson(r, w.s, who);
    if (!id) {
      if (!r.peopleOpen) continue;
      id = slug(who);
      w.push({ t: "person", id, name: who, src });
    }
    for (const [stat, d] of Object.entries(m ?? {})) {
      const def = r.relStats[stat];
      if (!def || def.narrator <= 0 || typeof d !== "number" || !Number.isFinite(d)) continue;
      if (!gateOpen(def.gate, w, ctx)) continue;
      let v = clampAbs(d, def.narrator);
      if (id === big && r.relBigMoment && Math.abs(d) > def.narrator) {
        const cur = w.s.rel[id]?.[stat] ?? def.start;
        v = oneBand(def, cur, clampAbs(d, def.narrator * r.relBigMoment.factor));
        if (Math.abs(v) < def.narrator) v = clampAbs(d, def.narrator);
        else bigUsed = true;
      }
      if (v !== 0) w.push({ t: "rel", who: id, stat, d: v, src });
    }
  }
  if (big && bigUsed) w.push({ t: "big", who: big, src });

  for (const [key, d] of Object.entries(p.items ?? {})) {
    if (typeof d !== "number" || !Number.isFinite(d) || d === 0) continue;
    const k = key.toLowerCase();
    const declared = Object.values(r.items).find((i) => i.id === k || i.name.toLowerCase() === k);
    const held = Object.keys(w.s.items).find((id) => id === k || (w.s.itemNames[id] ?? "").toLowerCase() === k);
    const id = declared?.id ?? held ?? slug(key);
    if (!declared && !r.itemsOpen) continue;
    const n = Math.round(clampAbs(d, 10));
    if (n < 0 && !(w.s.items[id] > 0)) continue;
    w.push({ t: "item", id, d: n, ...(declared ? {} : { name: key }), src });
  }
  // Items with uses (a spray, a first-aid kit): each use spends one, and the last one spends the item.
  for (const [key, n] of Object.entries(p.used ?? {})) {
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) continue;
    const k = key.toLowerCase();
    const id = Object.keys(w.s.items).find((i) => i === k || itemName(r, w.s, i).toLowerCase() === k);
    const item = id ? r.items[id] : undefined;
    const alreadyUsed = id && ctx?.action?.id.split(TARGET_SEP)[0] === `${ITEM_PREFIX}${id}` ? 1 : 0;
    const available = id && item && !item.keep && item.uses > 0 ? (w.s.uses[id] ?? item.uses) + Math.max(0, (w.s.items[id] ?? 0) - 1) * item.uses : 10;
    const count = Math.min(available, Math.max(0, Math.min(10, Math.round(n)) - alreadyUsed));
    if (id && item && !item.keep && item.uses > 0 && count > 0) w.push({ t: "use", id, n: count, src });
    // Each genuine additional use applies its non-check effect. Uses with a check need the dice.
    const use = id ? r.items[id]?.use : undefined;
    if (id && use && !use.check && count > 0) {
      for (let useIndex = 0; useIndex < count; useIndex++) because(w, `${itemName(r, w.s, id)} used in the story`, () => effectToEvents(w, use.effects, src, {}));
    }
  }

  // Where {{user}} is at the end of the reply, in words.
  const placeWords = typeof p.place === "string" && p.place.trim() ? p.place.trim().slice(0, 120) : null;
  if (placeWords && placeWords.toLowerCase() !== (w.s.locationName ?? "").toLowerCase()) w.push({ t: "move", to: placeId(placeWords), name: placeWords, src });

  for (const id of p.conditions?.add ?? []) {
    const def = r.conditions[id];
    if (def?.narrator && !w.s.conditions[id] && gateOpen(def.gate, w, ctx)) w.push(condOn(w, id, null, src));
  }
  for (const id of p.conditions?.remove ?? []) {
    const def = r.conditions[id];
    if (def?.narrator && w.s.conditions[id] && gateOpen(def.gate, w, ctx)) w.push({ t: "cond", id, on: false, src });
  }

  for (const [key, v] of Object.entries(p.flags ?? {})) {
    if (r.flags[key]?.narrator && gateOpen(r.flags[key].gate, w, ctx)) w.push({ t: "flag", key, v, src });
  }

  if (typeof p.minutes === "number" && Number.isFinite(p.minutes) && p.minutes > 0) {
    advanceTime(w, Math.round(Math.min(p.minutes, r.clock.narratorMax)), src);
  }

  // Who's in the scene at the end of the reply — after any move and the time it took, so it's judged here and now.
  for (const [who, here] of Object.entries(p.scene ?? {})) {
    const id = findPerson(r, w.s, who);
    if (id && typeof here === "boolean") scene[id] = here;
  }
  const hereNow = new Set(presentPeople(r, w.s));
  for (const [id, here] of Object.entries(scene)) {
    if (!w.s.people[id]) continue;
    if (hereNow.has(id) !== here) w.push({ t: "scene", who: id, here, src });
  }

  // Looks and clothes the reply changed ("you" or a person's name).
  for (const [key, l] of Object.entries(p.looks ?? {})) {
    const who = key.trim().toLowerCase() === "you" ? "you" : findPerson(r, w.s, key);
    if (!who || !l || typeof l !== "object") continue;
    for (const field of ["appearance", "outfit"] as const) {
      if (!(field in l)) continue;
      const v = l[field];
      const text = typeof v === "string" && v.trim() ? v.trim().slice(0, 160) : null;
      if (text !== (w.s.look?.[who]?.[field] ?? null)) w.push({ t: "look", who, field, text, src });
    }
  }

  // A contest the prose started (only the rules end one: there is no "it's over" from the story).
  if (p.contest && typeof p.contest === "object" && !w.s.contest && r.conflict.fromStory) {
    because(w, "A contest broke out in the story", () => startContest(t, { kind: String(p.contest!.kind ?? ""), opponent: String(p.contest!.opponent ?? ""), threat: p.contest!.threat }, src));
  }

  // Goals the story made, finished or failed; moments people will remember.
  if (p.goals && typeof p.goals === "object") because(w, "Goals", () => storyGoalNews(t, p.goals as GoalNews, (name) => findPerson(r, w.s, name)));
  let remembered = 0;
  for (const [who, text] of Object.entries(p.memories ?? {})) {
    const id = findPerson(r, w.s, who);
    if (!id || typeof text !== "string" || !text.trim() || remembered >= 3) continue;
    w.push({ t: "memory", who: id, text: text.trim().slice(0, 200), src });
    remembered++;
  }

  // Practice the story described: training, studying, rehearsing.
  if (r.growth.enabled && r.growth.train) {
    const gains: Record<string, number> = {};
    for (const key of (Array.isArray(p.train) ? p.train : []).slice(0, 2)) {
      const k = String(key).toLowerCase();
      const id = r.statOrder.find((s) => s === k || r.stats[s].label.toLowerCase() === k);
      if (id && (r.stats[id].kind === "skill" || r.stats[id].kind === "attribute")) gains[id] = (gains[id] ?? 0) + trainingGain(r, w.s, id, p.minutes);
    }
    if (Object.keys(gains).length) practise(t, gains, "Practice the story described");
  }

  w.cause = null;
  runTriggers(w, false);
  // A band the reply crossed: its line shows first in this reply's "what changed", and opens the next narrator block.
  const lines = crossingLines(bandCrossings(r, before, w.s));
  if (lines.length) w.push({ t: "notice", text: `Since the last reply: ${lines.join(" ")}`, src: "world" });
  return w.events;
}

/** A handle for systems that make their own turns outside the action flow (goals, contests, growth). */
export interface TurnBuilder {
  readonly r: Ruleset;
  /** The live working state: every pushed event is already applied. */
  readonly s: GameState;
  readonly seed: string;
  push(e: WarpEvent): void;
  env(extra?: Record<string, Value>): ExprEnv;
  /** Apply a ruleset effect (stats, relationships, items…). */
  apply(effect: Effect, src: EventSource, extra?: Record<string, Value>): void;
  time(minutes: number, src: EventSource): void;
  /** Tell the narrator: on this reply during turn resolution, otherwise on the next one. */
  announce(text: string): void;
  /** The decision model's odds for a question; when missing it's listed for the backend to ask, and null comes back. */
  modelOdds(spec: DecideSpec): Record<string, number> | null;
  /** Roll on odds with this turn's seeded dice. */
  roll(id: string, ask: string, p: Record<string, number>, descs: Record<string, string>, source: "model" | "weights"): string;
}

function builderOf(w: Working): TurnBuilder {
  return {
    r: w.r, get s() { return w.s; }, seed: w.seed,
    push: (e) => w.push(e),
    env: (extra = {}) => w.env(extra),
    apply: (effect, src, extra = {}) => effectToEvents(w, effect, src, extra),
    time: (minutes, src) => advanceTime(w, minutes, src),
    announce: (text) => announce(w, text),
    modelOdds: (spec) => {
      const model = w.odds[spec.id];
      if (model) return normalize(model, spec.options.map((o) => o.id));
      if (!w.needs.some((n) => n.id === spec.id)) w.needs.push(spec);
      return null;
    },
    roll: (id, ask, p, descs, source) => {
      const keys = Object.keys(p);
      const odds = normalize(p, keys);
      const picked = sample(odds, seededRng(`${w.seed}:roll:${id}`));
      w.decisions.push({ id, ask, picked, pickedDesc: descs[picked] ?? picked, p: odds, source, descs });
      return picked;
    },
  };
}

/** Build events against a working copy; rules, clocks and the world react as usual. */
export function buildTurn(r: Ruleset, before: GameState, seed: string, fn: (t: TurnBuilder) => void): WarpEvent[] {
  const w = new Working(r, cloneState(before), seededRng(`${seed}:fx`), seed);
  fn(builderOf(w));
  runTriggers(w, false);
  return w.events;
}

/** Apply a manual HUD edit (player adjusting a number by hand). */
export function manualSet(r: Ruleset, before: GameState, stat: string, value: number): WarpEvent[] {
  const w = new Working(r, cloneState(before));
  if (r.stats[stat]) w.push({ t: "stat", id: stat, set: value, src: "manual" });
  runTriggers(w, false);
  return w.events;
}

/** "{target}" and "{opponent}" in hints and questions become names. */
function fillTarget(w: Working, text: string, extra: Record<string, Value>): string {
  let out = text;
  if (typeof extra.target === "string" && extra.target && out.includes("{target}")) out = out.replace(/\{target\}/g, personName(w.r, w.s, extra.target));
  const opp = w.s.contest?.opponent ?? w.s.lastContest?.opponent;
  if (opp && out.includes("{opponent}")) out = out.replace(/\{opponent\}/g, opp);
  return out;
}

/**
 * One-time starting feelings. A person first seen in the story (or seeded with
 * defaults) gets their relationship values set to where the story shows them —
 * not nudged a few points per reply. Only stats the ruleset lets the story move.
 */
function calibrate(w: Working, who: string, feelings: Record<string, number>, src: EventSource) {
  if (w.s.calibrated[who]) return;
  let read = false;
  for (const [stat, v] of Object.entries(feelings)) {
    const def = w.r.relStats[stat];
    if (!def || def.narrator <= 0 || typeof v !== "number" || !Number.isFinite(v)) continue;
    read = true;
    const value = Math.max(def.min, Math.min(def.max, v));
    if (value !== (w.s.rel[who]?.[stat] ?? def.start)) w.push({ t: "rel", who, stat, set: value, src });
  }
  // No usable read yet (e.g. they barely appeared) — try again next time they show up.
  if (read) w.push({ t: "calib", who, src });
}

/** Hand-edit a relationship value from the sheet. */
export function manualSetRel(r: Ruleset, before: GameState, who: string, stat: string, value: number): WarpEvent[] | string {
  if (!before.people[who]) return "Unknown person.";
  if (!r.relStats[stat]) return "Unknown relationship stat.";
  const w = new Working(r, cloneState(before));
  w.push({ t: "rel", who, stat, set: value, src: "manual" });
  if (!w.s.calibrated[who]) w.push({ t: "calib", who, src: "manual" });
  runTriggers(w, false);
  return w.events;
}

/** Stop tracking a person (e.g. a scenario card's name that isn't a character). */
export function forgetPerson(r: Ruleset, before: GameState, who: string): WarpEvent[] | string {
  if (!before.people[who]) return "Unknown person.";
  return [{ t: "forget", who, src: "manual" }];
}
