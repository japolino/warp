// Game state and the primitive event log.
//
// State is never stored directly: it's the fold of concrete events recorded on
// each message swipe. Events hold final deltas (not formulas), so replaying a
// chat gives the same numbers even if the author edits the ruleset later —
// only clamping follows the current ruleset.

import type { Value, ExprEnv } from "./expr.js";
import { evalNumber } from "./expr.js";
import type { Ruleset, StatDef, Band, Difficulty } from "./ruleset.js";
import { presentPeople } from "./world.js";
import { idFrom } from "./ids.js";

/** Something a person remembers about {{user}}. */
export interface Memory { text: string; at: number }

/** Looks and clothes as plain text, for "you" or a person id; `at` = the minute it was last set. */
export interface LookState { appearance?: string; outfit?: string; at: number; turn?: number }

/** How a contest ended. `gave_in` and `lost` use the kind's `lost` effects; `broken_off` uses `escaped`. */
export type ContestOutcome = "won" | "lost" | "escaped" | "gave_in" | "broken_off";

/** A running contest: one momentum gauge from −100 (the opponent wins) to +100 ({{user}} wins). */
export interface ContestState {
  kind: string;
  /** The opponent's name; `who` = their person id when they are tracked. */
  opponent: string;
  who?: string;
  threat: Difficulty;
  /** The d20 target every move (and Break off, before momentum) rolls against. */
  dc: number;
  /** Rounds played so far (0 before the first move). */
  round: number;
  momentum: number;
  /** In-game minute it started. */
  at: number;
}

export type GoalStatus = "open" | "done" | "failed";
/** A story goal: authored (id from `goals.list`) or made by the story. */
export interface GoalState {
  st: GoalStatus; text: string;
  /** The minute and the turn it opened (the narrator sees a new goal for 3 turns). */
  at: number; turn?: number;
  /** Who it is for (a person id), what is at stake, and what counts as done (judged after each reply). */
  from?: string; stakes?: string; judge?: string;
  ended?: number;
}

export interface GameState {
  /** The contest running now (fight, chase, argument), or null. */
  contest: ContestState | null;
  /** The last contest that ended (the same opponent can't restart one within 15 in-game minutes). */
  lastContest: { kind: string; opponent: string; who?: string; outcome: ContestOutcome; at: number } | null;
  /** Looks and clothes as text: "you" and person ids. */
  look: Record<string, LookState>;
  /** Person → the turn of their last big moment (the cap exception has a cooldown). */
  big: Record<string, number>;
  /** Story goals: open, done or failed. */
  goals: Record<string, GoalState>;
  /** The weekday is known (the ruleset's start or the greeting gave one): only then is it shown. */
  weekday?: boolean;
  /** People whose starting feelings have been set (by the author, the story or by hand). */
  calibrated: Record<string, true>;
  /** Ruleset people the player removed from tracking. */
  forgotten: Record<string, true>;
  stats: Record<string, number>;
  flags: Record<string, Value>;
  items: Record<string, number>;
  /** Display names for items the narrator introduced without a declaration. */
  itemNames: Record<string, string>;
  rel: Record<string, Record<string, number>>;
  people: Record<string, { name: string }>;
  location: string | null;
  locationName: string | null;
  minutes: number;
  /** until: the minute it wears off (null = until removed). */
  conditions: Record<string, { until: number | null; rounds?: number }>;
  /** What people remember about {{user}}, oldest first. */
  memories: Record<string, Memory[]>;
  triggers: Record<string, boolean>;
  turn: number;
  /** Secret id → index of the highest stage the narrator has been told (−1 = none). */
  secrets: Record<string, number>;
  /** What happened after a reply (a rule fired, a condition wore off) — told to the narrator on the next turn. */
  notices: string[];
  /** Who is known to be an adult (true) or not (false), when the ruleset gives no age: asked once, then remembered. */
  adults: Record<string, boolean>;
  /** Progress toward the next point, per stat (in the stat's own units; a point is gained at 1). */
  practice: Record<string, number>;
  /** Recent checked action/context uses. Optional for saves made before diminishing practice. */
  practiceUse?: Record<string, { n: number; turn: number; minutes: number }>;
  /** Who the story has in the scene: judged here or gone, at the place and time it was judged. */
  scene: Record<string, { here: boolean; loc: string | null; at: number; turn?: number }>;
  /** Where {{user}} was before the last move (people there may or may not have come along). */
  lastLocation: string | null;
  /** Uses left in the item in hand, for items with uses (absent = a fresh one). */
  uses: Record<string, number>;
}

export type EventSource = "cost" | "check" | "action" | "drift" | "trigger" | "narrator" | "manual" | "start" | "world";

/** `why`: what caused this change, in words (for the "Why?" view). */
export type WarpEvent = { src: EventSource; note?: string; why?: string } & (
  | { t: "stat"; id: string; d?: number; set?: number }
  | { t: "flag"; key: string; v: Value }
  | { t: "item"; id: string; d: number; name?: string }
  | { t: "rel"; who: string; stat: string; d?: number; set?: number }
  | { t: "person"; id: string; name: string }
  /** {{user}} is now at this place: `to` = its id (a slug of the words), `name` = the words. */
  | { t: "move"; to: string; name?: string }
  | { t: "time"; min: number }
  | { t: "cond"; id: string; on: boolean; until?: number | null; rounds?: number }
  | { t: "memory"; who: string; text: string }
  | { t: "trig"; id: string; v: boolean }
  | { t: "turn" }
  /** The contest's gauge moves (+ toward {{user}}). */
  | { t: "swing"; d: number }
  /** A contest round passes. */
  | { t: "round" }
  | { t: "calib"; who: string }
  | { t: "forget"; who: string }
  | { t: "secret"; id: string; stage: number }
  | { t: "notice"; text: string }
  | { t: "noticed" }
  | { t: "adult"; who: string; adult: boolean }
  | { t: "practice"; id: string; d: number }
  | { t: "practice_use"; key: string; n: number; turn: number; minutes: number }
  | { t: "scene"; who: string; here: boolean }
  | { t: "use"; id: string; n: number }
  /** The clock set outright (the greeting read, or the player's fix). */
  | { t: "set_time"; minutes: number; weekday?: boolean }
  /** A look or outfit line ("you" or a person id); null clears it. */
  | { t: "look"; who: string; field: "appearance" | "outfit"; text: string | null }
  /** A contest starts (round 0, momentum 0). */
  | { t: "contest"; kind: string; opponent: string; who?: string; threat: Difficulty; dc: number }
  | { t: "contest_end"; outcome: ContestOutcome }
  /** A big moment for this person (their caps were multiplied this reply). */
  | { t: "big"; who: string }
  /** A goal opens, closes or is dropped (st null). Story goals carry their text. */
  | { t: "goal"; id: string; st: GoalStatus | null; text?: string; from?: string; stakes?: string; judge?: string }
);

/** Memories kept per person (the oldest fade first). */
const MEMORIES_KEPT = 12;

export function initialState(r: Ruleset): GameState {
  const s: GameState = {
    contest: null,
    lastContest: null,
    look: {},
    big: {},
    goals: {},
    weekday: !!r.clock.weekdayKnown,
    calibrated: {},
    forgotten: {},
    stats: {},
    flags: {},
    items: { ...r.startItems },
    itemNames: {},
    rel: {},
    people: {},
    location: r.startPlace && r.startPlace !== "greeting" ? placeId(r.startPlace) : null,
    locationName: r.startPlace && r.startPlace !== "greeting" ? r.startPlace : null,
    minutes: startMinutes(r),
    conditions: {},
    triggers: {},
    turn: 0,
    secrets: {},
    notices: [],
    adults: {},
    practice: {},
    practiceUse: {},
    scene: {},
    lastLocation: null,
    uses: {},
    memories: {},
  };
  for (const id of r.statOrder) s.stats[id] = r.stats[id].start;
  // Starts that read other stats (`start: full` against a max formula, a start formula), and any stat with a max
  // formula, are worked out now that the plain starts are in — and clamped to the max they evaluate to.
  for (const id of r.statOrder) {
    const def = r.stats[id];
    if (!def.maxExpr && def.startExpr === undefined) continue;
    const v = def.startExpr !== undefined ? evalNumber(def.startExpr, makeEnv(r, s), def.start) : def.start;
    s.stats[id] = Math.min(statMax(r, def, s), Math.max(def.min, Number.isFinite(v) ? v : def.start));
  }
  // Stages with no condition at the top of a secret's ladder are known from the start.
  for (const sec of Object.values(r.secrets)) {
    let open = -1;
    while (open + 1 < sec.stages.length && !sec.stages[open + 1].when) open++;
    s.secrets[sec.id] = open;
  }
  for (const f of Object.values(r.flags)) s.flags[f.id] = f.start;
  // Authored goals start open.
  for (const g of Object.values(r.goals.list)) s.goals[g.id] = { st: "open", text: g.text, at: s.minutes, turn: 0, ...(g.stakes ? { stakes: g.stakes } : {}), ...(g.judge ? { judge: g.judge } : {}) };
  // Looks and clothes the ruleset gives (the greeting and the story fill in the rest).
  const firstLook = (appearance?: string, outfit?: string): LookState | null =>
    appearance || outfit ? { ...(appearance ? { appearance } : {}), ...(outfit ? { outfit } : {}), at: s.minutes } : null;
  const mine = firstLook(r.you.appearance, r.you.outfit);
  if (mine) s.look.you = mine;
  for (const p of Object.values(r.people)) {
    const theirs = firstLook(p.appearance, p.outfit);
    if (theirs) s.look[p.id] = theirs;
  }
  for (const p of Object.values(r.people)) {
    s.people[p.id] = { name: p.name };
    s.rel[p.id] = {};
    for (const rs of r.relStatOrder) s.rel[p.id][rs] = p.start[rs] ?? r.relStats[rs].start;
    // An author who wrote starting feelings has calibrated them; a bare entry gets read from the story on first appearance.
    if (Object.keys(p.start).length) s.calibrated[p.id] = true;
  }
  return s;
}

/** The minute the game starts at: the ruleset's start, or its fallback until the greeting is read. */
export function startMinutes(r: Ruleset): number {
  return typeof r.clock.start === "number" ? r.clock.start : r.clock.fallback;
}

/** A place's id from its words ("The Rusty Anchor" → "the_rusty_anchor"). */
export function placeId(name: string): string {
  return idFrom(name);
}

export function statMax(r: Ruleset, def: StatDef, s: GameState): number {
  if (!def.maxExpr) return def.max;
  const m = evalNumber(def.maxExpr, makeEnv(r, s), def.max);
  return Math.max(def.min + 1, m);
}

/**
 * A number a rulebook may write as a formula (gear and status `armor:`/`bonus:`, `per_hour:`), worked out now.
 * "+6%" is a share of `max` (when given). Anything that can't be read counts as 0.
 */
export function amountValue(v: number | string | undefined, env: ExprEnv, max?: number): number {
  if (v === undefined) return 0;
  if (typeof v === "number") return v;
  const pm = /^\s*([+-]?)\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(v);
  if (pm) return max === undefined ? 0 : ((pm[1] === "-" ? -1 : 1) * Number(pm[2]) / 100) * max;
  const n = evalNumber(v, env, 0);
  return Number.isFinite(n) ? n : 0;
}

/** One place a stat bonus comes from right now: carried gear or a condition. */
export interface BonusSource { from: string; kind: "gear" | "cond"; id: string; bonus: Record<string, number> }

// Bonus formulas may read eff()/gear() themselves; past this depth they count as 0 (no endless loops).
let bonusDepth = 0;

/** Every bonus in force on {{user}}'s stats, with formulas worked out. Checks, `eff()` and `gear()` all read this. */
export function bonusSources(r: Ruleset, s: GameState, env?: ExprEnv): BonusSource[] {
  if (bonusDepth > 2) return [];
  bonusDepth++;
  try {
    const e = env ?? makeEnv(r, s);
    const nums = (m: Record<string, number | string>) => {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(m)) { const n = amountValue(v, e); if (n) out[k] = n; }
      return out;
    };
    const out: BonusSource[] = [];
    for (const [id, n] of Object.entries(s.items)) {
      const it = r.items[id];
      if (!it || n <= 0 || !Object.keys(it.bonus).length) continue;
      out.push({ from: it.name, kind: "gear", id, bonus: nums(it.bonus) });
    }
    for (const id of Object.keys(s.conditions)) {
      const c = r.conditions[id];
      if (c && Object.keys(c.bonus).length) out.push({ from: c.label, kind: "cond", id, bonus: nums(c.bonus) });
    }
    return out;
  } finally { bonusDepth--; }
}

/** A stat plus everything that helps or hinders it right now (`eff('str')`); `gearOnly` counts carried gear alone (`gear('atk')`). */
export function effectiveStat(r: Ruleset, s: GameState, stat: string, env: ExprEnv, gearOnly = false): number {
  let n = 0;
  for (const src of bonusSources(r, s, env)) if (!gearOnly || src.kind === "gear") n += src.bonus[stat] ?? 0;
  if (gearOnly) return n;
  const base = s.stats[stat] ?? r.stats[stat]?.start ?? 0;
  return base + n;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function applyEvent(s: GameState, e: WarpEvent, r: Ruleset): void {
  applyOne(s, e, r);
  // A max formula can drop when its inputs change: the stat follows it down (PRESSURE-2).
  for (const id of formulaMaxStats(r)) {
    const def = r.stats[id];
    const v = s.stats[id];
    if (v !== undefined && v > def.min && v > statMax(r, def, s)) s.stats[id] = Math.max(def.min, statMax(r, def, s));
  }
}

const maxFormulaCache = new WeakMap<Ruleset, string[]>();
function formulaMaxStats(r: Ruleset): string[] {
  let ids = maxFormulaCache.get(r);
  if (!ids) { ids = r.statOrder.filter((id) => r.stats[id].maxExpr); maxFormulaCache.set(r, ids); }
  return ids;
}

function applyOne(s: GameState, e: WarpEvent, r: Ruleset): void {
  // Chats from before dating was removed: "is an adult" was remembered as a dating taste.
  const old = e as unknown as { t: string; who?: unknown; key?: unknown; v?: unknown };
  if (old.t === "dt_pref" && old.key === "__adult" && typeof old.who === "string") { s.adults = { ...s.adults, [old.who]: Number(old.v) > 0 }; return; }
  switch (e.t) {
    case "stat": {
      const def = r.stats[e.id];
      const cur = s.stats[e.id] ?? def?.start ?? 0;
      const next = e.set !== undefined ? e.set : cur + (e.d ?? 0);
      s.stats[e.id] = def ? clamp(next, def.min, statMax(r, def, s)) : next;
      break;
    }
    case "flag": s.flags[e.key] = e.v; break;
    case "item": {
      const n = (s.items[e.id] ?? 0) + e.d;
      if (n <= 0) {
        delete s.items[e.id];
        if (s.uses[e.id] !== undefined) { const u = { ...s.uses }; delete u[e.id]; s.uses = u; }
      } else s.items[e.id] = n;
      if (e.name && !r.items[e.id]) s.itemNames[e.id] = e.name;
      break;
    }
    case "swing":
      if (s.contest) s.contest = { ...s.contest, momentum: clamp(s.contest.momentum + e.d, -100, 100) };
      break;
    case "round":
      if (s.contest) s.contest = { ...s.contest, round: s.contest.round + 1 };
      break;
    case "set_time":
      if (Number.isFinite(e.minutes)) s.minutes = Math.max(0, Math.floor(e.minutes));
      if (e.weekday !== undefined) s.weekday = e.weekday;
      break;
    case "look": {
      const cur: LookState = { ...(s.look?.[e.who] ?? { at: s.minutes }) };
      if (e.text) cur[e.field] = e.text; else delete cur[e.field];
      cur.at = s.minutes;
      cur.turn = s.turn;
      const look = { ...(s.look ?? {}) };
      if (cur.appearance || cur.outfit) look[e.who] = cur; else delete look[e.who];
      s.look = look;
      break;
    }
    case "contest":
      s.contest = { kind: e.kind, opponent: e.opponent, ...(e.who ? { who: e.who } : {}), threat: e.threat, dc: e.dc, round: 0, momentum: 0, at: s.minutes };
      break;
    case "contest_end":
      if (s.contest) s.lastContest = { kind: s.contest.kind, opponent: s.contest.opponent, ...(s.contest.who ? { who: s.contest.who } : {}), outcome: e.outcome, at: s.minutes };
      s.contest = null;
      break;
    case "big": s.big = { ...(s.big ?? {}), [e.who]: s.turn }; break;
    case "goal": {
      const all = { ...(s.goals ?? {}) };
      const cur = all[e.id];
      if (e.st === null) delete all[e.id];
      else if (e.st === "open") {
        const from = e.from ?? cur?.from, stakes = e.stakes ?? cur?.stakes, judge = e.judge ?? cur?.judge;
        all[e.id] = { st: "open", text: e.text ?? cur?.text ?? e.id, at: s.minutes, turn: s.turn, ...(from ? { from } : {}), ...(stakes ? { stakes } : {}), ...(judge ? { judge } : {}) };
      }
      else if (cur) all[e.id] = { ...cur, st: e.st, ended: s.minutes };
      s.goals = all;
      break;
    }
    case "calib": s.calibrated[e.who] = true; break;
    case "forget":
      if (s.scene[e.who]) { const sc = { ...s.scene }; delete sc[e.who]; s.scene = sc; }
      delete s.people[e.who];
      delete s.rel[e.who];
      delete s.calibrated[e.who];
      s.forgotten[e.who] = true;
      break;
    case "person":
      s.people[e.id] = { name: e.name };
      delete s.forgotten[e.id];
      if (!s.rel[e.id]) {
        s.rel[e.id] = {};
        for (const rs of r.relStatOrder) s.rel[e.id][rs] = r.relStats[rs].start;
      }
      break;
    case "rel": {
      if (!s.rel[e.who]) {
        s.rel[e.who] = {};
        for (const rs of r.relStatOrder) s.rel[e.who][rs] = r.relStats[rs].start;
      }
      const def = r.relStats[e.stat];
      const cur = s.rel[e.who][e.stat] ?? def?.start ?? 0;
      const next = e.set !== undefined ? e.set : cur + (e.d ?? 0);
      s.rel[e.who][e.stat] = def ? clamp(next, def.min, def.max) : next;
      break;
    }
    case "move":
      if (e.to !== s.location) s.lastLocation = s.location;
      s.location = e.to;
      s.locationName = e.name ?? e.to.replace(/_/g, " ");
      break;
    case "practice": s.practice = { ...s.practice, [e.id]: Math.max(0, (s.practice[e.id] ?? 0) + e.d) }; break;
    case "practice_use": {
      if (!Number.isFinite(e.n) || !Number.isFinite(e.turn) || !Number.isFinite(e.minutes)) break;
      // Keep this history small. Event order, not wall-clock time, controls eviction.
      const uses = { ...(s.practiceUse ?? {}) };
      delete uses[e.key];
      uses[e.key] = { n: clamp(Math.floor(e.n), 1, 100), turn: e.turn, minutes: e.minutes };
      const keys = Object.keys(uses);
      for (const key of keys.slice(0, Math.max(0, keys.length - 64))) delete uses[key];
      s.practiceUse = uses;
      break;
    }
    case "scene": s.scene = { ...s.scene, [e.who]: { here: e.here, loc: s.location, at: s.minutes, turn: s.turn } }; break;
    case "use": {
      const per = r.items[e.id]?.uses ?? 0;
      let have = s.items[e.id] ?? 0;
      if (per <= 0 || have <= 0 || e.n <= 0) break;
      let left = (s.uses[e.id] ?? per) - e.n;
      while (left <= 0 && have > 0) { have -= 1; left += per; }
      const uses = { ...s.uses };
      if (have <= 0) {
        delete s.items[e.id];
        delete uses[e.id];
      } else {
        s.items[e.id] = have;
        if (left >= per) delete uses[e.id]; else uses[e.id] = left;
      }
      s.uses = uses;
      break;
    }
    case "time": s.minutes += Math.max(0, e.min); break;
    case "cond":
      if (e.on) s.conditions[e.id] = { until: e.until ?? null, ...(e.rounds !== undefined ? { rounds: e.rounds } : {}) };
      else delete s.conditions[e.id];
      break;
    case "memory": {
      const list = [...(s.memories?.[e.who] ?? []), { text: e.text, at: s.minutes }].slice(-MEMORIES_KEPT);
      s.memories = { ...(s.memories ?? {}), [e.who]: list };
      break;
    }
    case "trig": s.triggers[e.id] = e.v; break;
    case "turn": s.turn += 1; break;
    case "secret": s.secrets[e.id] = Math.max(s.secrets[e.id] ?? -1, e.stage); break;
    case "notice": s.notices = [...s.notices, e.text]; break;
    case "noticed": s.notices = []; break;
    case "adult": s.adults = { ...s.adults, [e.who]: e.adult }; break;
    // Events of removed systems (encounters, quests, dungeons, dates, family…) in old chats are ignored.
    default: break;
  }
}

export function dayOf(s: GameState): number { return Math.floor(s.minutes / 1440); }

export function cloneState(s: GameState): GameState {
  return structuredClone(s);
}

export function foldEvents(r: Ruleset, batches: Iterable<WarpEvent[]>, from?: GameState): GameState {
  const s = from ? cloneState(from) : initialState(r);
  for (const batch of batches) for (const e of batch) applyEvent(s, e, r);
  return s;
}

// ───────────────────────── expression environment ─────────────────────────

/** Every built-in name formulas can use (for the linter and the AI builder's reference). */
export const BUILTIN_NAMES = [
  "minutes", "hour", "minute", "day", "weekday", "turn", "place", "round", "momentum", "in_contest", "target",
];

export function makeEnv(r: Ruleset, s: GameState, extra: Record<string, Value> = {}): ExprEnv {
  const day = Math.floor(s.minutes / 1440);
  const names: Record<string, Value> = {
    minutes: s.minutes,
    hour: Math.floor((s.minutes % 1440) / 60),
    minute: s.minutes % 60,
    day: day + 1,
    weekday: r.clock.weekdays[day % r.clock.weekdays.length] ?? "",
    turn: s.turn,
    // Where {{user}} is, in words ('' when unknown).
    place: s.locationName ?? "",
    // The running contest (0 / false when none).
    round: s.contest?.round ?? 0,
    momentum: s.contest?.momentum ?? 0,
    in_contest: !!s.contest,
    // Old name for in_contest.
    in_encounter: !!s.contest,
    target: "",
  };
  const base: ExprEnv = {
    lookup(path) {
      const [head, ...rest] = path;
      if (rest.length === 0) {
        if (head in extra) return extra[head];
        if (head in s.stats) return s.stats[head];
        if (r.stats[head]) return r.stats[head].start;
        if (head in names) return names[head];
        if (head in s.flags) return s.flags[head];
        if (r.flags[head]) return r.flags[head].start;
        return undefined;
      }
      if (head === "target" && typeof extra.target === "string" && rest.length === 1) {
        return s.rel[extra.target]?.[rest[0]] ?? r.relStats[rest[0]]?.start ?? 0;
      }
      if (head === "flags") return s.flags[rest[0]] ?? (r.flags[rest[0]] ? r.flags[rest[0]].start : false);
      if (head === "items") return s.items[rest[0]] ?? 0;
      if (head === "rel" && rest.length === 2) return s.rel[rest[0]]?.[rest[1]] ?? r.relStats[rest[1]]?.start ?? 0;
      if (s.rel[head] && rest.length === 1) return s.rel[head][rest[0]] ?? 0;
      if (r.people[head] && rest.length === 1) return r.relStats[rest[0]]?.start ?? 0;
      return undefined;
    },
    call(name, args) {
      const a0 = String(args[0] ?? "");
      switch (name) {
        case "has": return (s.items[a0] ?? 0) >= (typeof args[1] === "number" ? args[1] : 1);
        case "count": return s.items[a0] ?? 0;
        case "flag": return s.flags[a0] ?? false;
        case "cond": return a0 in s.conditions;
        case "rel": return s.rel[a0]?.[String(args[1] ?? "")] ?? r.relStats[String(args[1] ?? "")]?.start ?? 0;
        // A declared person is met once they have been in a scene with {{user}} or remember something; someone the
        // story introduced is met from then on (ADVENTURE-11).
        case "met": return a0 in s.people && (!r.people[a0] || !!s.scene[a0] || (s.memories?.[a0]?.length ?? 0) > 0);
        case "between": {
          // between(hour, 20, 6) handles wrap-around ranges like night hours.
          const v = Number(args[0]); const lo = Number(args[1]); const hi = Number(args[2]);
          return lo <= hi ? v >= lo && v < hi : v >= lo || v < hi;
        }
        // A stat with gear and conditions counted (as checks see it), and gear alone.
        case "eff": return effectiveStat(r, s, a0, base);
        case "gear": return effectiveStat(r, s, a0, base, true);
        // Whether someone is in the scene now (the story's word on who is here).
        case "present": return presentPeople(r, s).includes(a0);
        // How many stages of a secret the narrator knows (0 = none).
        case "secret": return (s.secrets[a0] ?? -1) + 1;
        // A goal's state: '' (none), 'open', 'done' or 'failed'.
        case "goal": return s.goals?.[a0]?.st ?? "";
        // in_contest() = any contest; in_contest('fight') = a contest of that kind.
        case "in_contest": case "in_encounter": return args.length ? s.contest?.kind === a0 : !!s.contest;
      }
      return undefined;
    },
  };
  return base;
}

// ───────────────────────── presentation helpers ─────────────────────────

export function bandFor(def: StatDef, value: number, max?: number): Band | null {
  let hit: Band | null = null;
  // Percentage bands compare against the current maximum (HP that grows with level).
  const top = max ?? def.max;
  const v = def.pctBands ? (top > def.min ? ((value - def.min) / (top - def.min)) * 100 : 0) : value;
  for (const b of def.bands) if (v >= b.at) hit = b;
  return hit ?? def.bands[0] ?? null;
}

export function gradeFor(def: StatDef, value: number, max: number): string | null {
  if (!def.grades?.length) return null;
  const span = max - def.min;
  if (span <= 0) return def.grades[0];
  const idx = Math.min(def.grades.length - 1, Math.floor(((value - def.min) / span) * def.grades.length));
  return def.grades[Math.max(0, idx)];
}

/** The clock in words. The weekday shows only when it is known (the ruleset's start or the greeting gave one). */
export function formatClock(r: Ruleset, minutes: number, weekday = true): { label: string; time: string; day: string; phase: string } {
  const day = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const wd = weekday ? r.clock.weekdays[day % r.clock.weekdays.length] ?? "" : "";
  const dayLabel = wd ? `${wd} · Day ${day + 1}` : `Day ${day + 1}`;
  const phase = h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
  return { label: `${dayLabel} · ${time}`, time, day: dayLabel, phase };
}

export function formatNumber(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** An amount of money with the ruleset's sign before ("$18") or after ("18d") it. */
export function formatMoney(r: Ruleset, n: number): string {
  return r.hud.currencyAfter ? `${formatNumber(n)}${r.hud.currency}` : `${r.hud.currency}${formatNumber(n)}`;
}

export function itemName(r: Ruleset, s: GameState, id: string): string {
  return r.items[id]?.name ?? s.itemNames[id] ?? id.replace(/[_-]+/g, " ");
}

export function personName(r: Ruleset, s: GameState, id: string): string {
  return s.people[id]?.name ?? r.people[id]?.name ?? id;
}
