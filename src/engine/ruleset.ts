// Ruleset: the declarative "game" attached to a card (format 2, the core after the cut).
//
// Authors write loose YAML; `normalizeRuleset` turns it into this strict shape,
// fills defaults, and collects friendly issues instead of throwing. A broken
// section is skipped with a warning so the rest of the ruleset keeps working.
// Keys of systems that were taken out still load: each gets one plain warning and is ignored.

import { compile, ExprError } from "./expr.js";

export type Tone = "good" | "warn" | "bad" | "neutral";
export type StatKind = "meter" | "attribute" | "skill" | "money" | "hidden";
export type ShowMode = "text" | "number" | "both" | "hidden";
export type Tier = "crit_success" | "success" | "partial" | "fail" | "crit_fail";
export const TIERS: Tier[] = ["crit_success", "success", "partial", "fail", "crit_fail"];

export { RULESET_FORMAT } from "./format-version.js";

/** `story` = no rolls anywhere; `adventure` = d20 checks on risky, contested moves and contests. */
export type Style = "story" | "adventure";

/**
 * A band of a stat. `say` is the one story line shown when the value enters this band from below,
 * `sayDown` when it enters from above, and `voice` is a directive for how a person speaks and acts while
 * their value is in this band (relationship stats; ignored on the player's meters).
 */
export interface Band { at: number; text: string; tone: Tone; say?: string; sayDown?: string; voice?: string }

/**
 * Limits on what the story may change after a reply, on top of the per-reply cap:
 * only while a formula holds, only when the exchange mentions certain words, or
 * only after certain actions (ids or tags).
 */
export interface NarratorGate { when?: string; words?: string[]; actions?: string[] }

export interface StatDef {
  id: string;
  label: string;
  kind: StatKind;
  min: number;
  max: number;
  /** Expression allowed so caps can scale, e.g. "level * 5". Evaluated at clamp time. */
  maxExpr?: string;
  start: number;
  /** A start worked out when the game begins (`start: full`, "50%" of a max formula, or a formula), then clamped to the max then. */
  startExpr?: string;
  /** Which end is desirable. Drives default band tones and bar colours. */
  good: "high" | "low" | "none";
  perHour: number;
  /** `per_hour:` written as a formula or "+6%" of the maximum: worked out as time passes (perHour is 0 then). */
  perHourExpr?: string;
  show: ShowMode;
  /** A heading the sidebar files it under ("Attributes", "Combat"); default: by kind. */
  group?: string;
  /** The author wrote show: (absent: the sidebar keeps the number beside band words for skills and money). */
  showSet?: true;
  /** Max absolute change the narrator may make per turn. 0 = engine only. */
  narrator: number;
  gate?: NarratorGate;
  /** How fast it improves with use (skills and attributes; 0 = never). */
  growth: number;
  bands: Band[];
  /** Bands given in percent of the stat's (current) maximum: `75%: Hale` — for stats whose max grows. */
  pctBands?: boolean;
  grades?: string[];
  color?: string;
  desc?: string;
}

export interface Effect {
  stats: Record<string, string | number>;
  set: Record<string, string | number>;
  flags: Record<string, string | number | boolean | null>;
  items: Record<string, number>;
  /** `rel: { mira: { trust: +3 } }`; `target` = whoever a per-person move is aimed at, `opponent` = the contest's opponent. */
  rel: Record<string, Record<string, string | number>>;
  /** Where {{user}} is now, in words (`place: "The docks"`, alias `move:`). */
  place?: string;
  time?: number;
  addConditions: Record<string, number | null>;
  removeConditions: string[];
  hint?: string;
  /** Uncertain reactions: a decision model supplies odds, the engine rolls. */
  decide: DecideSpec[];
  /** Open the next stage of these secrets, whatever their conditions say. */
  reveal: string[];
  /** Swing the running contest's momentum toward {{user}} (+) or the opponent (−). */
  swing?: string | number;
  /** Looks and clothes as text: `look: { you: { outfit: "..." }, mira: { appearance: "..." } }` (null clears). */
  look: Record<string, { appearance?: string | null; outfit?: string | null }>;
  /** Story goals: `goal: { find_sister: done }` (start, done or fail). */
  goal: Record<string, GoalOp>;
  /** Start a contest: `contest: { kind: fight, with: "the bouncer", threat: hard }`. */
  contest?: { kind: string; with: string; threat?: Difficulty };
  /** Something a person will remember about {{user}}: `remember: { mia: "{{user}} burned her breakfast" }`. */
  remember: Record<string, string>;
}

export type GoalOp = "start" | "done" | "fail";

export interface DecideOption {
  id: string; desc: string; weight: number; effect: Effect;
  /** Only weighed while this holds. When no option holds, every option is weighed as before. */
  when?: string;
}
export interface DecideSpec { id: string; ask: string; options: DecideOption[] }

/**
 * A check: d20 + `add` vs `target`. `target` is a difficulty word (easy, fair, hard, extreme), a number or a
 * formula; absent, the move's difficulty word decides it (a live choice's word, or `params.difficulty`,
 * default fair). Natural 20 is a critical success, natural 1 a critical failure; missing by `partialMargin`
 * or less (default `checks.partial`) is a partial success.
 */
export interface CheckDef {
  target?: string | number;
  /** Modifier added to the d20 (a formula over stats). */
  add?: string | number;
  partialMargin?: number;
  label?: string;
}

export interface ParamDef {
  id: string;
  label: string;
  options: Record<string, number>;
  default: string;
}

export interface ActionDef {
  id: string;
  label: string;
  say?: string;
  desc?: string;
  when?: string;
  hidden: boolean;
  /** Shown on the locked choice when `when` doesn't hold ("Needs a lighter"). */
  whyNot?: string;
  time?: number;
  cost: Effect;
  check?: CheckDef;
  outcomes: Partial<Record<Tier, Effect>>;
  /** Applied when there is no check; next to a check, always applied whatever the roll. */
  effects: Effect;
  params: ParamDef[];
  tags: string[];
  /** One choice per person present ("Talk to X"); `target` is that person in formulas and `rel: { target: … }`. */
  perPerson: boolean;
  /** Per-person actions: only these people are offered as the target. */
  targets?: string[];
  /** Readable requirements (already folded into `when`): each says what's missing on the locked choice. */
  requires: Requirement[];
  /** Show it locked, with what's missing, when the requirements aren't met (default when it has `requires:`). */
  showLocked: boolean;
}

/** One requirement of an action, kept readable so a locked choice can say exactly what's missing. */
export interface Requirement {
  /** A formula that holds when it's met. */
  when: string;
  kind: "stat" | "with" | "has" | "rel" | "goal" | "flag" | "formula";
  /** The stat, person, item, goal or flag it's about. */
  id?: string;
  /** The relationship stat (rel). */
  stat?: string;
  /** How much is needed (stat, rel, has), or the goal state / flag value wanted. */
  n?: number;
  state?: string;
  /** Words for a formula requirement. */
  text?: string;
}

export interface TriggerDef {
  id: string;
  when?: string;
  /** Plain-language condition judged after each reply (it fires on the next turn), e.g. "{{user}} is in danger". */
  whenScene?: string;
  repeat: boolean;
  effects: Effect;
}

export interface ItemDef {
  id: string; name: string; desc?: string; tags: string[];
  /** Uses per item (a spray with 5 sprays); each use spends one, and at 0 the item is gone. 0 = not used up by use. */
  uses: number;
  /** What using it does: an action like any other (`item:<id>`), offered while it's held. */
  use?: ActionDef;
  /** A tool that isn't spent by using it (keys, a phone). */
  keep: boolean;
  /** Gear: added to every check that reads these stats (and to `eff()`/`gear()`), while it's carried. Numbers or formulas. */
  bonus: Record<string, Amount>;
}
export interface ConditionDef {
  id: string; label: string; tone: Tone; desc?: string; narrator: boolean; gate?: NarratorGate;
  /** While it lasts: counts as this much more (or less) of each stat in checks and `eff()` — a buff or a debuff. Numbers or formulas. */
  bonus: Record<string, Amount>;
  /** Minutes it lasts when nothing says (absent = until removed). */
  lasts?: number;
}
export interface PersonDef {
  id: string; name: string; age?: number; start: Record<string, number>; desc?: string;
  /** Looks and clothes as plain text (≤160 chars each); empty = read from the greeting and the story. */
  appearance?: string; outfit?: string;
}
export interface FlagDef { id: string; label?: string; narrator: boolean; start: string | number | boolean | null; gate?: NarratorGate }

/**
 * A secret is a ladder of stages. Only opened stages ever reach the narrator's
 * prompt — what isn't in the prompt can't leak. Stage 0 is often a cue with no
 * reason ("flinches at the crest"), so the narrator can play someone hiding
 * something without knowing what.
 */
export interface SecretStage { when?: string; text: string; lore: string[] }
export interface SecretDef {
  id: string;
  /** Who or what it's about ("Professor Ward"). */
  about: string;
  /** The tracked person it is about (an id in relationships.people): stage `band:` sugar reads their stats. */
  person?: string;
  /** exists = the narrator is told there's more it doesn't know, so it deflects instead of inventing. */
  tell: "none" | "exists";
  stages: SecretStage[];
}

/**
 * Choices written for the moment. A model writes each label, but it must pick a
 * tag from this fixed list — the tag, not the model, decides the check and effects.
 */
export interface LiveChoicesDef {
  enabled: boolean;
  label: string;
  count: number;
  when?: string;
  guide?: string;
  tags: Record<string, ActionDef>;
  /** Positive effects of a tag shrink with recent use on the same target: × max(floor, 1 / (1 + step × n)). */
  taper: { step: number; floor: number } | false;
}

export type Difficulty = "easy" | "fair" | "hard" | "extreme";
export const DIFFICULTIES: Difficulty[] = ["easy", "fair", "hard", "extreme"];
/** A move's difficulty as the writer or the reader gives it: `none` = no roll. */
export type DifficultyWord = Difficulty | "none";
export const DIFFICULTY_WORDS: DifficultyWord[] = ["none", "easy", "fair", "hard", "extreme"];

/**
 * `checks:` — the one check style (d20 + modifier vs a difficulty) and typed attempts.
 * Replaces `improvise:` (read as an alias). Only used with `style: adventure`.
 */
export interface ChecksDef {
  /** Read risky typed text and roll it (adventure only; always false in a story). */
  typed: boolean;
  /** Difficulty words → d20 target. */
  dc: Record<Difficulty, number>;
  /** Missing by this much or less is a partial success. */
  partial: number;
  /** Stats a typed attempt may lean on (default: attributes and skills; never hidden, money or meters). */
  stats: string[];
  /** What a maxed stat adds to the d20 on a typed attempt. */
  bonus: number;
  /** The narrator's direction per tier, replacing the defaults. */
  directions: Partial<Record<Tier, string>>;
  /** Effects of typed attempts per tier. */
  outcomes: Partial<Record<Tier, Effect>>;
  /** Minutes a typed attempt takes (default: the clock's minutes_per_action). */
  time?: number;
}

/** One kind of contest (fight, chase, argument, or the author's own). */
export interface KindDef {
  id: string;
  label: string;
  /** Approaches a move may lean on (attributes or skills; the first is the default). */
  stats: string[];
  /** The stat a Break off rolls (default: the first of `stats`). */
  escape: string;
  /** The opponent's pressure on {{user}} per tier of {{user}}'s move. */
  cost: Partial<Record<Tier, Effect>>;
  won: Effect;
  lost: Effect;
  escaped: Effect;
}

/** `conflict:` — one momentum gauge for fights, chases and arguments. Replaces `encounters:`. */
export interface ConflictDef {
  /** The story (or a typed message) can start one. */
  fromStory: boolean;
  /** No end before round `min`; round `max` is the last (then it breaks off). */
  rounds: { min: number; max: number };
  /** Stakes rise each round: swing × (1 + escalate × (round − 1)). */
  escalate: number;
  /** Base swing of the gauge per tier of {{user}}'s move. */
  swing: Record<Tier, number>;
  kinds: Record<string, KindDef>;
}

/** An authored story goal. Story goals the reply makes have no definition. */
export interface GoalDef {
  id: string;
  text: string;
  /** Formulas that close it. */
  doneWhen?: string;
  failWhen?: string;
  /** Plain-language conditions judged in the post-reply read. */
  judge?: string;
  judgeFail?: string;
  /** What is at stake, in a line. */
  stakes?: string;
  /** Applied once when it is done. */
  reward: Effect;
}

/** `goals:` — a short list of story goals. Replaces `quests:`. */
export interface GoalsDef {
  /** Promises, favours and plans the story makes are tracked. */
  fromStory: boolean;
  /** Open at once. */
  max: number;
  list: Record<string, GoalDef>;
}

/** Skills and attributes improve with use: every check, and practice the story describes, adds progress. */
export interface GrowthDef {
  enabled: boolean;
  /** Overall speed (2 = twice as fast). */
  rate: number;
  /** Attributes improve at this fraction of the skill rate. */
  attributes: number;
  /** Training, studying and practising the story describes counts too. */
  train: boolean;
  /** Repeated checked practice in the same context teaches less (`false` turns the taper off). */
  repeat: PracticeRepeatDef | false;
}

/** `growth.repeat`: learning × `1 / (1 + step × repeats)`, never below `floor`; a break of `recover_minutes` or `recover_turns` resets it. */
export interface PracticeRepeatDef {
  step: number;
  floor: number;
  recoverMinutes: number;
  recoverTurns: number;
}

export const DEFAULT_PRACTICE_REPEAT: PracticeRepeatDef = { step: 0.5, floor: 0.1, recoverMinutes: 120, recoverTurns: 8 };

export interface Ruleset {
  name: string;
  description?: string;
  /** story = no rolls anywhere; adventure = checks, typed attempts and contests. */
  style: Style;
  /** The player (`you:`, alias `player:`). Empty text fields are read from the persona and the greeting. */
  you: { name?: string; age?: number; appearance?: string; outfit?: string };
  stats: Record<string, StatDef>;
  statOrder: string[];
  relStats: Record<string, StatDef>;
  relStatOrder: string[];
  people: Record<string, PersonDef>;
  /** Narrator may introduce new people. */
  peopleOpen: boolean;
  items: Record<string, ItemDef>;
  /** Narrator may grant/remove items (declared or not). */
  itemsOpen: boolean;
  startItems: Record<string, number>;
  /** Where the game starts, in words; "greeting" = read it from the greeting; null = unknown. */
  startPlace: string | null;
  conditions: Record<string, ConditionDef>;
  flags: Record<string, FlagDef>;
  actions: Record<string, ActionDef>;
  actionOrder: string[];
  triggers: TriggerDef[];
  clock: {
    enabled: boolean;
    /** Start in minutes, or "greeting": read the time (and day) from the greeting; `fallback` until then. */
    start: number | "greeting";
    /** Minutes used when the greeting gives no time (and before it is read). */
    fallback: number;
    minutesPerAction: number;
    /** Max minutes the narrator may advance in one turn. */
    narratorMax: number;
    weekdays: string[];
    /** The start names a weekday ("Mon 07:00"): the weekday is shown from the start. */
    weekdayKnown?: boolean;
    /** Calendar date of day 1 (month 1–12, day of month), when dates are shown. */
    startDate: { month: number; day: number } | null;
  };
  /** currency: the sign; currencyAfter: written after the amount ("18d") instead of before ("$18"). */
  hud: { bars: string[]; money?: string; currency: string; currencyAfter?: boolean };
  narration: { notes?: string; numbers: boolean };
  secrets: Record<string, SecretDef>;
  liveChoices: LiveChoicesDef;
  checks: ChecksDef;
  conflict: ConflictDef;
  goals: GoalsDef;
  /** A big moment (rescue, betrayal, confession) multiplies one person's caps for one reply; null = off. */
  relBigMoment: { factor: number; cooldown: number } | null;
  growth: GrowthDef;
}

export interface Issue {
  level: "error" | "warning";
  where: string;
  message: string;
}

// ───────────────────────── helpers ─────────────────────────

export type Raw = Record<string, any>;
export const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);

export function titleCase(id: string): string {
  return id.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function slug(s: string): string {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x";
}

const DEFAULT_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "Mon 07:00", "Day 3 18:30", "07:00", or a number of minutes. */
export function parseClockStart(v: unknown, weekdays: string[]): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v !== "string") return null;
  const s = v.trim();
  const m = /^(?:(?:day\s*(\d+))|([A-Za-z]{3,}))?\s*(\d{1,2}):(\d{2})$/i.exec(s);
  if (!m) return null;
  let day = 0;
  if (m[1]) day = Math.max(0, Number(m[1]) - 1);
  else if (m[2]) {
    const idx = weekdays.findIndex((w) => w.toLowerCase().startsWith(m[2].toLowerCase().slice(0, 3)));
    if (idx < 0) return null;
    day = idx;
  }
  const h = Number(m[3]);
  const min = Number(m[4]);
  if (h > 23 || min > 59) return null;
  return day * 1440 + h * 60 + min;
}

// ───────────────────────── normalizer ─────────────────────────

export class Ctx {
  issues: Issue[] = [];
  err(where: string, message: string) { this.issues.push({ level: "error", where, message }); }
  /** The same warning in many places (an old ruleset's removed keys) is listed once, with how many more places have it. */
  private repeats = new Map<string, { issue: Issue; base: string; more: number }>();
  warn(where: string, message: string) {
    const seen = this.repeats.get(message);
    if (seen) {
      seen.more++;
      seen.issue.message = `${seen.base} (Also in ${seen.more} more place${seen.more === 1 ? "" : "s"}.)`;
      return;
    }
    const issue: Issue = { level: "warning", where, message };
    this.repeats.set(message, { issue, base: message, more: 0 });
    this.issues.push(issue);
  }
  /** A key from a part of Warp that was taken out: say so plainly (with what to use instead); the key is ignored. */
  removed(where: string, key: string, what: string, hint?: string) {
    this.warn(where, `\`${key}:\` (${what}) was removed from Warp, so it's ignored. The old version is on the \`legacy\` branch.${hint ? ` ${hint}` : ""}`);
  }

  num(v: unknown, where: string, fallback: number): number {
    if (v === undefined || v === null || v === "") return fallback;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) { this.warn(where, `"${v}" should be a number — using ${fallback}`); return fallback; }
    return n;
  }

  expr(v: unknown, where: string): string | number | undefined {
    if (v === undefined || v === null) return undefined;
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    const s = String(v);
    // "-25%": a share of the stat's maximum, worked out when it's applied.
    if (percentOf(s) !== null) return s.trim();
    try { compile(s); return s; } catch (e) {
      this.err(where, e instanceof ExprError ? `Formula "${s}": ${e.message}` : `Formula "${s}" couldn't be read`);
      return undefined;
    }
  }
}

/** "-25%" → −0.25: an amount written as a share of a stat's maximum. Null for anything else. */
export function percentOf(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^\s*([+-]?)\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(v);
  return m ? (m[1] === "-" ? -1 : 1) * Number(m[2]) / 100 : null;
}

/** Minutes from 90, "90", "30m", "2h", "1d", "3 days". */
export function minutesOf(v: unknown, where: string, c: Ctx, fallback: number): number {
  if (typeof v === "string") {
    const m = /^\s*(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?|h|hrs?|hours?|d|days?)?\s*$/i.exec(v);
    if (m) {
      const n = Number(m[1]);
      const u = (m[2] ?? "m").toLowerCase();
      return Math.round(u.startsWith("d") ? n * 1440 : u.startsWith("h") ? n * 60 : n);
    }
  }
  return c.num(v, where, fallback);
}

/** A number or a formula worked out when it's used (`armor: "2 + level / 5"`). */
export type Amount = number | string;

/** A number, or a formula (checked now, worked out when it's applied). Percentages aren't allowed here. */
function amount(v: unknown, where: string, c: Ctx): Amount {
  if (typeof v === "string" && !Number.isFinite(Number(v)) && percentOf(v) === null) {
    const x = c.expr(v, where);
    return typeof x === "string" ? x : typeof x === "number" ? x : 0;
  }
  return c.num(v, where, 0);
}

/** `per_hour: -0.5`, `per_hour: "+6%"` (of the current maximum) or `per_hour: "vit / 10"` (worked out as time passes). */
function perHourOf(v: unknown, where: string, c: Ctx): { perHour: number; perHourExpr?: string } {
  if (typeof v === "string" && !Number.isFinite(Number(v))) {
    if (percentOf(v) !== null) return { perHour: 0, perHourExpr: v.trim() };
    const x = c.expr(v, where);
    return typeof x === "string" ? { perHour: 0, perHourExpr: x } : { perHour: typeof x === "number" ? x : 0 };
  }
  return { perHour: c.num(v, where, 0) };
}

/** `currency: "$"`, `currency: "{n}d"` (the amount goes where {n} is) or `currency: { symbol: d, after: true }`. */
function normCurrency(v: unknown, c: Ctx): { currency: string; currencyAfter?: true } {
  if (v === undefined || v === null) return { currency: "$" };
  if (typeof v === "string" || typeof v === "number") {
    const t = String(v);
    const at = t.indexOf("{n}");
    if (at < 0) return { currency: t };
    const before = t.slice(0, at), after = t.slice(at + 3);
    if (before && after) c.warn("HUD › currency", `"${t}" — put the sign on one side of {n} only; using "${after}" after the amount`);
    return after ? { currency: after, currencyAfter: true } : { currency: before };
  }
  if (isObj(v)) {
    const known = new Set(["symbol", "sign", "after"]);
    for (const k of Object.keys(v)) if (!known.has(k)) c.warn(`HUD › currency › ${k}`, "currency takes `symbol:` and `after: true`");
    const sym = v.symbol ?? v.sign;
    if (typeof sym !== "string" && typeof sym !== "number") { c.warn("HUD › currency", "needs `symbol:` (e.g. `{ symbol: d, after: true }`) — using $"); return { currency: "$" }; }
    if (v.after !== undefined && typeof v.after !== "boolean") c.warn("HUD › currency › after", "should be true or false");
    return v.after === true ? { currency: String(sym), currencyAfter: true } : { currency: String(sym) };
  }
  c.warn("HUD › currency", `expected a sign like "$", "{n}d" or { symbol: d, after: true } — using $`);
  return { currency: "$" };
}

/** `narrator_when:`, `narrator_words:` and `narrator_actions:` on anything the story may change. */
export function normGate(r: Raw, where: string, c: Ctx): NarratorGate | undefined {
  const g: NarratorGate = {};
  if (r.narrator_when !== undefined) { const x = c.expr(r.narrator_when, `${where} › narrator_when`); if (x !== undefined) g.when = String(x); }
  const words = list(r.narrator_words ?? r.narrator_keywords).map((w) => w.toLowerCase()).filter(Boolean);
  if (words.length) g.words = words;
  const actions = list(r.narrator_actions).map((a) => a.toLowerCase()).filter(Boolean);
  if (actions.length) g.actions = actions;
  return g.when || g.words || g.actions ? g : undefined;
}

function toneFor(index: number, count: number, good: StatDef["good"]): Tone {
  if (good === "none" || count <= 1) return "neutral";
  const pos = index / (count - 1); // 0 = lowest band
  const goodness = good === "high" ? pos : 1 - pos;
  return goodness >= 0.67 ? "good" : goodness >= 0.34 ? "warn" : "bad";
}

function normBands(raw: unknown, good: StatDef["good"], where: string, c: Ctx): Band[] {
  if (raw === undefined || raw === null) return [];
  const list: { at: number; text: string; tone?: Tone; say?: string; sayDown?: string; voice?: string }[] = [];
  // The long form adds the story line on entering the band (say / say_down) and how a person acts in it (voice).
  const lines = (b: Raw) => ({
    ...(typeof b.say === "string" && b.say.trim() ? { say: b.say.trim() } : {}),
    ...(typeof b.say_down === "string" && b.say_down.trim() ? { sayDown: b.say_down.trim() } : {}),
    ...(typeof b.voice === "string" && b.voice.trim() ? { voice: b.voice.trim() } : {}),
  });
  if (Array.isArray(raw)) {
    raw.forEach((b, i) => {
      if (!isObj(b)) { c.warn(`${where} › #${i + 1}`, "each band needs `at` and `text`"); return; }
      const at = c.num(b.at ?? b.from ?? b.min, `${where} › #${i + 1}`, NaN);
      if (!Number.isFinite(at) || typeof b.text !== "string") { c.warn(`${where} › #${i + 1}`, "each band needs a numeric `at` and a `text`"); return; }
      const tone = ["good", "warn", "bad", "neutral"].includes(b.tone) ? (b.tone as Tone) : undefined;
      list.push({ at, text: b.text, tone, ...lines(b) });
    });
  } else if (isObj(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      const at = Number(k.replace(/%\s*$/, ""));
      if (!Number.isFinite(at)) { c.warn(where, `band key "${k}" should be a number (the value where this text starts), or a percentage like 75%`); continue; }
      if (typeof v === "string") list.push({ at, text: v });
      else if (isObj(v) && typeof v.text === "string") list.push({ at, text: v.text, tone: v.tone, ...lines(v) });
      else c.warn(`${where} › ${k}`, "band should be a line of text");
    }
  } else {
    c.warn(where, "bands should be a map like `0: You feel fine.`");
  }
  list.sort((a, b) => a.at - b.at);
  return list.map((b, i) => ({ ...b, tone: b.tone ?? toneFor(i, list.length, good) }));
}

const KIND_ALIASES: Record<string, StatKind> = {
  meter: "meter", bar: "meter", pool: "meter", resource: "meter",
  attribute: "attribute", attr: "attribute", stat: "attribute",
  skill: "skill", money: "money", currency: "money", hidden: "hidden",
};

function normStat(id: string, raw: unknown, where: string, c: Ctx, forRel = false): StatDef | null {
  const r: Raw = isObj(raw) ? raw : typeof raw === "number" ? { start: raw } : {};
  if (!isObj(raw) && typeof raw !== "number" && raw !== null && raw !== undefined) {
    c.warn(where, "expected a stat definition — using defaults");
  }
  const kind = KIND_ALIASES[String(r.kind ?? r.type ?? (forRel ? "meter" : "meter")).toLowerCase()];
  if (!kind) c.warn(where, `unknown kind "${r.kind}" — use meter, attribute, skill, money or hidden`);
  const k: StatKind = kind ?? "meter";
  const defaultMax = k === "money" ? 1e12 : k === "skill" ? 1000 : 100;
  const min = c.num(r.min, `${where} › min`, 0);
  let max = defaultMax;
  let maxExpr: string | undefined;
  if (typeof r.max === "string" && !Number.isFinite(Number(r.max))) {
    const e = c.expr(r.max, `${where} › max`);
    if (typeof e === "string") { maxExpr = e; max = defaultMax; }
  } else max = c.num(r.max, `${where} › max`, defaultMax);
  if (max <= min) { c.warn(where, `max (${max}) must be above min (${min})`); max = min + 100; }
  const goodRaw = String(r.good ?? (k === "meter" ? "high" : k === "hidden" ? "none" : "high")).toLowerCase();
  const good: StatDef["good"] = goodRaw === "low" ? "low" : goodRaw === "none" || goodRaw === "neutral" ? "none" : "high";
  const showRaw = String(r.show ?? (r.bands ? "text" : "both")).toLowerCase();
  const show: ShowMode = (["text", "number", "both", "hidden"].includes(showRaw) ? showRaw : "both") as ShowMode;
  let narrator = 0;
  if (r.narrator === true) narrator = Math.max(1, Math.round((max - min) / 10));
  else if (r.narrator !== undefined && r.narrator !== false) narrator = Math.abs(c.num(r.narrator, `${where} › narrator`, 0));
  // `start:` may be a number, `full` (= max), a share of the max ("50%") or a formula ("10 + vit * 5").
  // Anything that depends on other stats, or a max formula, is worked out (and clamped) once the game begins.
  let startRaw: unknown = r.start ?? r.value;
  let startExpr: string | undefined;
  if (typeof startRaw === "string" && startRaw.trim() && !Number.isFinite(Number(startRaw))) {
    const word = startRaw.trim().toLowerCase();
    const pct = percentOf(startRaw);
    if (word === "full" || word === "max") { startExpr = maxExpr; startRaw = max; }
    else if (pct !== null) {
      if (pct < 0 || pct > 1) c.warn(`${where} › start`, `"${startRaw}" — a share of the max should be 0% to 100%`);
      const p = Math.max(0, Math.min(1, pct));
      startExpr = maxExpr ? `(${maxExpr}) * ${p}` : undefined;
      startRaw = min + (max - min) * p;
    } else {
      const e = c.expr(startRaw, `${where} › start`);
      if (typeof e === "string") startExpr = e;
      startRaw = undefined;
    }
  }
  // No start: on a meter with a max formula keeps its long-standing start (100, then clamped at game start) so existing
  // chats replay the same. Write start: full for a full pool.
  const start = c.num(startRaw, `${where} › start`, good === "low" ? min : k === "meter" ? max : min);
  const gate = narrator > 0 ? normGate(r, where, c) : undefined;
  const def: StatDef = {
    id,
    label: typeof r.label === "string" ? r.label : titleCase(id),
    kind: k,
    min, max, maxExpr,
    // A max formula is clamped against at game start, not against the placeholder max.
    start: maxExpr ? Math.max(min, start) : Math.min(max, Math.max(min, start)),
    ...(startExpr !== undefined ? { startExpr } : {}),
    good,
    ...perHourOf(r.per_hour ?? r.perHour, `${where} › per_hour`, c),
    show: k === "hidden" ? "hidden" : show,
    // Written by the author (absent = the default; the sidebar then keeps numbers beside band words).
    ...(r.show !== undefined ? { showSet: true as const } : {}),
    ...groupOf(r.group, `${where} › group`, c),
    narrator,
    ...(gate ? { gate } : {}),
    growth: 0,
    bands: normBands(r.bands, good, `${where} › bands`, c),
    ...(isObj(r.bands) && Object.keys(r.bands).some((k) => /%\s*$/.test(k)) ? { pctBands: true } : {}),
    color: typeof r.color === "string" ? r.color : undefined,
    desc: typeof r.desc === "string" ? r.desc : typeof r.description === "string" ? r.description : undefined,
  };
  if (Array.isArray(r.grades) && r.grades.length) def.grades = r.grades.map(String);
  if (r.allocate !== undefined) c.removed(`${where} › allocate`, "allocate", "spending points on stats");
  // Skills and attributes improve with use unless told otherwise (`growth: 0` or a speed multiplier).
  const grows = k === "skill" || k === "attribute";
  def.growth = r.growth === false ? 0 : r.growth === true ? 1 : r.growth !== undefined ? Math.max(0, c.num(r.growth, `${where} › growth`, grows ? 1 : 0)) : grows ? 1 : 0;
  return def;
}

export function emptyEffect(): Effect {
  return { stats: {}, set: {}, flags: {}, items: {}, rel: {}, addConditions: {}, removeConditions: [], decide: [], reveal: [], look: {}, goal: {}, remember: {} };
}

const GOAL_OPS: Record<string, GoalOp> = {
  start: "start", begin: "start", open: "start",
  done: "done", complete: "done", completed: "done", succeed: "done", success: "done", finish: "done",
  fail: "fail", failed: "fail", lose: "fail",
};

/** A difficulty word (`normal` = fair), or null. */
export function difficultyOf(v: unknown): Difficulty | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "normal" || s === "medium") return "fair";
  return (DIFFICULTIES as string[]).includes(s) ? (s as Difficulty) : null;
}

export const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : []);

function normDecide(raw: unknown, where: string, c: Ctx, known: { stats: Set<string> }, minOptions = 2): DecideSpec[] {
  if (!isObj(raw)) { c.warn(where, "decide needs `ask:` and `options:`"); return []; }
  // Either one spec ({ ask, options }) or a map of named specs. Unnamed specs get a stable id from their location.
  const entries: [string, unknown][] = typeof raw.ask === "string" ? [[slug(where), raw]] : Object.entries(raw);
  const out: DecideSpec[] = [];
  for (const [id, spec] of entries) {
    const w = `${where} › ${id}`;
    if (!isObj(spec) || typeof spec.ask !== "string" || !isObj(spec.options)) { c.warn(w, "decide needs `ask:` (a question) and `options:`"); continue; }
    const options: DecideOption[] = [];
    for (const [oid, o] of Object.entries(spec.options)) {
      const r: Raw = isObj(o) ? { ...o } : typeof o === "string" ? { desc: o } : {};
      const desc = typeof r.desc === "string" ? r.desc : typeof r.label === "string" ? r.label : titleCase(oid);
      const weight = c.num(r.weight, `${w} › ${oid} › weight`, 1);
      const when = r.when !== undefined ? c.expr(r.when, `${w} › ${oid} › when`) : undefined;
      delete r.desc; delete r.label; delete r.weight; delete r.when;
      options.push({ id: oid, desc, weight: Math.max(0, weight), effect: normEffect(r, `${w} › ${oid}`, c, known), ...(when !== undefined ? { when: String(when) } : {}) });
    }
    if (options.length < minOptions) { c.warn(w, minOptions > 1 ? "decide needs at least two options" : "needs at least one option"); continue; }
    out.push({ id: typeof spec.id === "string" ? spec.id : id, ask: spec.ask, options });
  }
  return out;
}

/**
 * Effect keys of systems removed from Warp, with what they were and what to use instead. An old ruleset that
 * uses them gets one plain warning per key; a stat of the same name keeps its shorthand.
 */
export const REMOVED_EFFECTS: Record<string, { what: string; hint?: string }> = {
  foe: { what: "foe stats", hint: "Contests have no foe stats: use `swing:` or a contest kind's `cost:`." },
  end: { what: "ending an encounter", hint: "Only a full swing (or Break off / Give in) ends a contest." },
  end_encounter: { what: "ending an encounter", hint: "Only a full swing (or Break off / Give in) ends a contest." },
  start_encounter: { what: "encounters", hint: "Use `contest: { kind: fight, with: \"…\" }`." },
  encounter: { what: "encounters", hint: "Use `contest: { kind: fight, with: \"…\" }`." },
  harm: { what: "encounter damage", hint: "Use `swing:`." },
  hits: { what: "multi-hit blows" }, pierce: { what: "armor" },
  inflict: { what: "statuses on others" }, afflict: { what: "statuses on others" }, status: { what: "statuses on others" }, cleanse: { what: "statuses on others" },
  quest: { what: "quests", hint: "Use `goal: { id: done }`." }, quests: { what: "quests", hint: "Use `goal: { id: done }`." },
  progress: { what: "quest goal counts", hint: "Use `goal:` or a flag." },
  unlock: { what: "the codex" }, codex: { what: "the codex" }, learn: { what: "abilities" },
  wear: { what: "the wardrobe", hint: "Use `look: { you: { outfit: \"…\" } }`." }, put_on: { what: "the wardrobe", hint: "Use `look:`." },
  undress: { what: "the wardrobe", hint: "Use `look:`." }, take_off: { what: "the wardrobe", hint: "Use `look:`." }, damage: { what: "the wardrobe" },
  body: { what: "the body and transformations", hint: "Use `look: { you: { appearance: \"…\" } }`." }, transform: { what: "the body and transformations", hint: "Use `look:`." },
  front: { what: "hidden world clocks (fronts)" }, fronts: { what: "hidden world clocks (fronts)" },
  gauge: { what: "random events" }, events_gauge: { what: "random events" },
  arc: { what: "companion lives" }, bond: { what: "feelings between people" }, bonds: { what: "feelings between people" },
  conceive: { what: "family and pregnancy" }, pregnancy: { what: "family and pregnancy" },
};
/** Every removed effect key (Studio's "never suggest a removed system" check). */
export const REMOVED_EFFECT_NAMES: string[] = Object.keys(REMOVED_EFFECTS);

/** Effects accept both a structured form and a flat shorthand: `{ fatigue: +20, hint: "..." }`. */
export function normEffect(raw: unknown, where: string, c: Ctx, known: { stats: Set<string> }): Effect {
  const e = emptyEffect();
  if (raw === undefined || raw === null) return e;
  if (typeof raw === "string") { e.hint = raw; return e; }
  if (!isObj(raw)) { c.warn(where, "expected a map of effects"); return e; }
  for (const [k, v] of Object.entries(raw)) {
    const w = `${where} › ${k}`;
    // Effects of parts that were taken out: said plainly, then ignored (a stat of the same name keeps its shorthand).
    const gone = REMOVED_EFFECTS[k];
    if (gone && !known.stats.has(k)) { c.removed(w, k, gone.what, gone.hint); continue; }
    switch (k) {
      case "stats": case "change":
        if (isObj(v)) for (const [s, d] of Object.entries(v)) { const x = c.expr(d, `${w} › ${s}`); if (x !== undefined) e.stats[s] = x; }
        break;
      case "set":
        if (isObj(v)) for (const [s, d] of Object.entries(v)) { const x = c.expr(d, `${w} › ${s}`); if (x !== undefined) e.set[s] = x; }
        break;
      case "flags": case "flag":
        if (isObj(v)) Object.assign(e.flags, v);
        else if (typeof v === "string") e.flags[v] = true;
        break;
      case "items": case "give": case "take":
        if (isObj(v)) for (const [it, n] of Object.entries(v)) e.items[it] = (k === "take" ? -1 : 1) * c.num(n, `${w} › ${it}`, 1);
        else if (typeof v === "string") e.items[v] = k === "take" ? -1 : 1;
        else if (Array.isArray(v)) for (const it of v) e.items[String(it)] = k === "take" ? -1 : 1;
        break;
      case "rel": case "relationships":
        if (isObj(v)) for (const [who, m] of Object.entries(v)) {
          if (!isObj(m)) { c.warn(`${w} › ${who}`, "expected stat changes like `trust: +5`"); continue; }
          e.rel[who] = {};
          for (const [s, d] of Object.entries(m)) { const x = c.expr(d, `${w} › ${who} › ${s}`); if (x !== undefined) e.rel[who][s] = x; }
        }
        break;
      case "place": case "move": case "go": case "location":
        if (typeof v === "string" && v.trim()) e.place = v.trim().slice(0, 120);
        else c.warn(w, "expected where {{user}} is now, in words (`place: The docks`)");
        break;
      case "time": case "minutes":
        e.time = minutesOf(v, w, c, 0);
        break;
      case "add_condition": case "add_conditions": case "condition":
        if (typeof v === "string") e.addConditions[v] = null;
        else if (Array.isArray(v)) for (const x of v) e.addConditions[String(x)] = null;
        else if (isObj(v)) for (const [x, d] of Object.entries(v)) e.addConditions[x] = d === null || d === true ? null : minutesOf(d, `${w} › ${x}`, c, 60);
        break;
      case "remove_condition": case "remove_conditions": case "cure":
        if (typeof v === "string") e.removeConditions.push(v);
        else if (Array.isArray(v)) e.removeConditions.push(...v.map(String));
        break;
      case "hint": case "narrate": case "text":
        e.hint = String(v);
        break;
      case "decide":
        e.decide.push(...normDecide(v, w, c, known));
        break;
      case "reveal":
        e.reveal.push(...list(v));
        break;
      case "swing": case "momentum": {
        const x = c.expr(v, w);
        if (x !== undefined) e.swing = x;
        break;
      }
      case "look": case "looks":
        if (!isObj(v)) { c.warn(w, "expected `look: { you: { outfit: \"...\" }, mira: { appearance: \"...\" } }`"); break; }
        for (const [who, m] of Object.entries(v)) {
          if (!isObj(m)) { c.warn(`${w} › ${who}`, "expected `appearance:` and/or `outfit:`"); continue; }
          const out: { appearance?: string | null; outfit?: string | null } = {};
          for (const f of ["appearance", "outfit"] as const) if (f in m) out[f] = typeof m[f] === "string" && m[f].trim() ? m[f].trim().slice(0, 160) : null;
          for (const k2 of Object.keys(m)) if (k2 !== "appearance" && k2 !== "outfit") c.warn(`${w} › ${who} › ${k2}`, "a look has `appearance:` and `outfit:`");
          if (Object.keys(out).length) e.look[who] = out;
        }
        break;
      case "goal": case "goals":
        if (typeof v === "string") e.goal[v] = "start";
        else if (Array.isArray(v)) for (const id of v) e.goal[String(id)] = "start";
        else if (isObj(v)) for (const [id, op] of Object.entries(v)) {
          const o = GOAL_OPS[String(op).toLowerCase()];
          if (o) e.goal[id] = o;
          else c.warn(`${w} › ${id}`, `"${op}" isn't a goal step (start, done, fail)`);
        }
        break;
      case "contest": {
        if (!isObj(v)) { c.warn(w, "expected `contest: { kind: fight, with: \"the bouncer\", threat: hard }`"); break; }
        const kind = typeof v.kind === "string" ? v.kind : "";
        const who = typeof v.with === "string" ? v.with : typeof v.opponent === "string" ? v.opponent : "";
        const threat = v.threat === undefined ? undefined : difficultyOf(v.threat);
        if (!kind || !who.trim()) { c.warn(w, "a contest needs `kind:` and `with:` (the opponent's name)"); break; }
        if (v.threat !== undefined && !threat) c.warn(`${w} › threat`, `"${v.threat}" — use easy, fair, hard or extreme`);
        e.contest = { kind, with: who.trim().slice(0, 60), ...(threat ? { threat } : {}) };
        break;
      }
      case "remember": case "memory":
        if (isObj(v)) for (const [who, text] of Object.entries(v)) { if (typeof text === "string" && text.trim()) e.remember[who] = text.trim(); }
        else c.warn(w, "expected who remembers what, like `mia: \"{{user}} burned her breakfast\"`");
        break;
      default:
        // Flat shorthand: a known stat name maps to a delta.
        if (known.stats.has(k)) { const x = c.expr(v, w); if (x !== undefined) e.stats[k] = x; }
        else c.warn(w, `"${k}" isn't a stat or a known effect (stats, set, flags, give, take, rel, place, look, time, add_condition, remove_condition, hint, decide, remember, reveal, goal, contest, swing)`);
    }
  }
  return e;
}

/**
 * Old check styles (legacy d100 `chance:` and PbtA): the check is dropped with one plain warning, and the action
 * still runs its `effects:`. A warning, not an error, so a legacy ruleset keeps loading and playing.
 */
const OLD_CHECK_KEYS = ["chance", "under"];

/** `check: { vs: hard, add: body, label: Body }` — d20 + add vs a difficulty word, a number or a formula. */
function normCheck(raw: unknown, where: string, c: Ctx, style: Style): CheckDef | undefined {
  if (!isObj(raw)) { c.err(where, "a check should be a map, e.g. `{ vs: fair, add: body, label: Body }`"); return undefined; }
  if (style === "story") { c.err(where, "Story rulesets don't roll; remove `check:` or use `style: adventure`. The action runs its `effects:` without a roll."); return undefined; }
  if (OLD_CHECK_KEYS.some((k) => raw[k] !== undefined) || raw.style === "pbta" || raw.bands === "pbta" || raw.pbta !== undefined) {
    c.warn(where, "d100 (`chance:`) and PbtA checks were removed from Warp, so this check is ignored and the move runs its `effects:` without a roll. The old version is on the `legacy` branch. Use `check: { vs: fair, add: <stat> }` (d20 + the stat vs a difficulty).");
    return undefined;
  }
  const dice = raw.dice ?? raw.roll;
  if (dice !== undefined && !/^\s*1?d20\s*$/i.test(String(dice))) {
    c.err(`${where} › dice`, `"${dice}": other dice were removed from Warp — every check is a d20 (+ a modifier vs a difficulty). This check is dropped; the action runs its \`effects:\` without a roll.`);
    return undefined;
  }
  for (const k of ["crit", "crit_chance", "crits"]) if (raw[k] !== undefined) c.removed(`${where} › ${k}`, k, "crit chances", "A natural 20 is a critical success, a natural 1 a critical failure.");
  for (const k of ["game", "games", "minigame"]) if (raw[k] !== undefined) c.removed(`${where} › ${k}`, k, "minigames");
  const vs = raw.vs ?? raw.dc;
  let target: string | number | undefined;
  if (vs !== undefined) {
    const word = typeof vs === "string" ? difficultyOf(vs) : null;
    target = word ?? c.expr(vs, `${where} › vs`);
  }
  const add = c.expr(raw.add ?? raw.bonus ?? raw.mod, `${where} › add`);
  const known = new Set(["vs", "dc", "add", "bonus", "mod", "partial", "partial_margin", "label", "skill", "dice", "roll", "crit", "crit_chance", "crits", "game", "games", "minigame"]);
  for (const k of Object.keys(raw)) if (!known.has(k)) c.warn(`${where} › ${k}`, `"${k}" isn't something a check reads (vs, add, partial, label)`);
  return {
    ...(target !== undefined ? { target } : {}),
    ...(add !== undefined ? { add } : {}),
    ...(raw.partial !== undefined || raw.partial_margin !== undefined ? { partialMargin: Math.max(0, c.num(raw.partial ?? raw.partial_margin, `${where} › partial`, 3)) } : {}),
    ...(typeof raw.label === "string" ? { label: raw.label } : typeof raw.skill === "string" ? { label: raw.skill } : {}),
  };
}

const TIER_KEYS: Record<string, Tier> = {
  crit_success: "crit_success", critical_success: "crit_success", crit: "crit_success",
  success: "success", pass: "success",
  partial: "partial", mixed: "partial",
  fail: "fail", failure: "fail", miss: "fail",
  crit_fail: "crit_fail", critical_fail: "crit_fail", fumble: "crit_fail",
};

/**
 * Every key an action (or a live-choice tag, an item's use) may have. A key outside it is a typo or a misplaced
 * block, and gets a warning instead of being dropped silently. Add new action keys here.
 */
export const ACTION_KEYS = new Set([
  "label", "say", "desc", "description", "when", "hidden", "why_not", "locked", "time", "cost", "costs", "check",
  "outcomes", "effects", "effect", "params", "tags", "per_person", "with", "targets", "requires", "needs", "show_locked",
  // Removed from Warp: read only to say so (`group:` is ignored quietly: authored actions show in one row).
  "at", "group", "order", "per_day", "per_encounter", "gamble", "errand",
]);

/** Action keys of removed systems. */
const REMOVED_ACTION_KEYS: Record<string, { what: string; hint?: string }> = {
  at: { what: "places on a map", hint: "Use `when:` (e.g. a flag the story sets)." },
  order: { what: "choice order", hint: "Actions show in the order they are written." },
  per_day: { what: "use limits", hint: "Gate it with `when:` and a flag." },
  per_encounter: { what: "use limits", hint: "Gate it with `when:` and a flag." },
  gamble: { what: "gambling tables" },
  errand: { what: "the errands window" },
};

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Warn (with a "did you mean") about keys a block doesn't read. */
function warnUnknownKeys(raw: Raw, keys: Set<string>, where: string, c: Ctx) {
  for (const k of Object.keys(raw)) {
    if (keys.has(k) || TIER_KEYS[k]) continue;
    const near = [...keys, ...Object.keys(TIER_KEYS)].find((x) => editDistance(x, k.toLowerCase()) <= (k.length > 4 ? 2 : 1));
    c.warn(`${where} › ${k}`, `"${k}" isn't something this block reads, so it does nothing${near ? ` — did you mean "${near}"?` : ""} (it reads ${[...keys].slice(0, 12).join(", ")}…)`);
  }
}

function normAction(id: string, raw: unknown, where: string, c: Ctx, known: { stats: Set<string> }, style: Style): ActionDef | null {
  if (typeof raw === "string") raw = { label: raw };
  if (!isObj(raw)) { c.warn(where, "expected an action definition"); return null; }
  const params: ParamDef[] = [];
  if (isObj(raw.params)) {
    for (const [pid, p] of Object.entries(raw.params)) {
      const pw = `${where} › params › ${pid}`;
      const opts = isObj(p) && isObj(p.options) ? p.options : isObj(p) ? p : null;
      if (!opts) { c.warn(pw, "params need options, e.g. `{ easy: 8, hard: 16 }`"); continue; }
      const options: Record<string, number> = {};
      for (const [o, v] of Object.entries(opts)) if (o !== "default" && o !== "label") options[o] = c.num(v, `${pw} › ${o}`, 0);
      const keys = Object.keys(options);
      if (!keys.length) continue;
      const def = isObj(p) && typeof p.default === "string" && keys.includes(p.default) ? p.default : keys[Math.floor(keys.length / 2)];
      params.push({ id: pid, label: isObj(p) && typeof p.label === "string" ? p.label : titleCase(pid), options, default: def });
    }
  }
  const outcomes: Partial<Record<Tier, Effect>> = {};
  for (const [k, v] of Object.entries(raw)) {
    const tier = TIER_KEYS[k];
    if (tier) outcomes[tier] = normEffect(v, `${where} › ${k}`, c, known);
  }
  if (isObj(raw.outcomes)) for (const [k, v] of Object.entries(raw.outcomes)) {
    const tier = TIER_KEYS[k];
    if (tier) outcomes[tier] = normEffect(v, `${where} › outcomes › ${k}`, c, known);
    else c.warn(`${where} › outcomes › ${k}`, "outcomes are crit_success, success, partial, fail, crit_fail");
  }
  const check = raw.check !== undefined ? normCheck(raw.check, `${where} › check`, c, style) : undefined;
  if (raw.check === undefined && Object.keys(outcomes).length) c.warn(where, "has outcomes but no check — put always-on changes under `effects:`");
  for (const [k, gone] of Object.entries(REMOVED_ACTION_KEYS)) if (raw[k] !== undefined) c.removed(`${where} › ${k}`, k, gone.what, gone.hint);
  warnUnknownKeys(raw, ACTION_KEYS, where, c);
  const own = raw.when !== undefined ? c.expr(raw.when, `${where} › when`) : undefined;
  // Requirements fold into `when`, and stay readable so a locked choice can say what's missing.
  const requires = normRequires(raw.requires ?? raw.needs, `${where} › requires`, c, known);
  const parts = [...(own !== undefined ? [String(own)] : []), ...requires.map((q) => q.when)];
  const when = parts.length > 1 ? parts.map((p) => `(${p})`).join(" and ") : parts[0];
  return {
    id,
    label: typeof raw.label === "string" ? raw.label : titleCase(id),
    say: typeof raw.say === "string" ? raw.say : undefined,
    desc: typeof raw.desc === "string" ? raw.desc : typeof raw.description === "string" ? raw.description : undefined,
    when: when === undefined ? undefined : String(when),
    hidden: raw.hidden === true,
    ...(typeof raw.why_not === "string" ? { whyNot: raw.why_not } : typeof raw.locked === "string" ? { whyNot: raw.locked } : {}),
    time: raw.time !== undefined ? minutesOf(raw.time, `${where} › time`, c, 0) : undefined,
    cost: normEffect(raw.cost ?? raw.costs, `${where} › cost`, c, known),
    check,
    outcomes,
    effects: normEffect(raw.effects ?? raw.effect, `${where} › effects`, c, known),
    params,
    tags: Array.isArray(raw.tags) ? raw.tags.map((t: unknown) => String(t).toLowerCase()) : [],
    perPerson: raw.per_person === true || raw.with === "person" || raw.with === "people" || raw.targets !== undefined,
    ...(raw.targets !== undefined ? { targets: list(raw.targets) } : {}),
    requires,
    showLocked: raw.show_locked === true || (raw.show_locked !== false && requires.length > 0),
  };
}

/**
 * `requires:` — what an action needs, in a form a locked choice can explain:
 *   { lockpicking: 30, with: brann, has: crowbar, rel: { brann: { trust: 40 } }, goal: heist, flag: vault_found,
 *     when: { "hour >= 20": "After dark" } }
 * Also a list of formulas or { when, text } pairs.
 */
export function normRequires(raw: unknown, where: string, c: Ctx, known: { stats: Set<string> }): Requirement[] {
  const out: Requirement[] = [];
  if (raw === undefined || raw === null) return out;
  const formula = (f: unknown, text: string | undefined, w: string) => {
    const x = c.expr(f, w);
    if (x !== undefined) out.push({ when: String(x), kind: "formula", ...(text ? { text } : {}) });
  };
  if (typeof raw === "string") { formula(raw, undefined, where); return out; }
  if (Array.isArray(raw)) {
    raw.forEach((x, i) => {
      if (isObj(x) && x.when !== undefined) formula(x.when, typeof x.text === "string" ? x.text : undefined, `${where} #${i + 1}`);
      else if (isObj(x)) out.push(...normRequires(x, `${where} #${i + 1}`, c, known));
      else formula(x, undefined, `${where} #${i + 1}`);
    });
    return out;
  }
  if (!isObj(raw)) { c.warn(where, "expected requirements like `{ lockpicking: 30, with: brann, has: crowbar }`"); return out; }
  const q = (s: string) => s.replace(/'/g, "");
  for (const [k, v] of Object.entries(raw)) {
    const w = `${where} › ${k}`;
    if (known.stats.has(k)) {
      const n = c.num(v, w, 0);
      out.push({ when: `${k} >= ${n}`, kind: "stat", id: k, n });
      continue;
    }
    switch (k) {
      case "with": case "present": case "companion":
        for (const p of list(v)) out.push({ when: `present('${q(p)}')`, kind: "with", id: p });
        break;
      case "has": case "item": case "items":
        if (isObj(v)) for (const [it, n] of Object.entries(v)) { const m = c.num(n, `${w} › ${it}`, 1); out.push({ when: `has('${q(it)}', ${m})`, kind: "has", id: it, n: m }); }
        else for (const it of list(v)) out.push({ when: `has('${q(it)}')`, kind: "has", id: it, n: 1 });
        break;
      case "rel":
        if (isObj(v)) for (const [who, m] of Object.entries(v)) {
          if (!isObj(m)) { c.warn(`${w} › ${who}`, "expected `trust: 40`"); continue; }
          for (const [stat, n] of Object.entries(m)) {
            const x = c.num(n, `${w} › ${who} › ${stat}`, 0);
            out.push({ when: `rel('${q(who)}', '${q(stat)}') >= ${x}`, kind: "rel", id: who, stat, n: x });
          }
        }
        break;
      case "goal": case "goals":
        if (isObj(v)) for (const [id, st] of Object.entries(v)) out.push({ when: `goal('${q(id)}') == '${q(String(st))}'`, kind: "goal", id, state: String(st) });
        else for (const id of list(v)) out.push({ when: `goal('${q(id)}') == 'open'`, kind: "goal", id, state: "open" });
        break;
      case "quest": case "quests":
        c.removed(w, k, "quests", "Use `goal:` (a goal id, or `{ id: done }`).");
        break;
      case "flag": case "flags":
        if (isObj(v)) for (const [f, val] of Object.entries(v)) out.push({ when: val === false ? `not flag('${q(f)}')` : `flag('${q(f)}')`, kind: "flag", id: f, state: val === false ? "off" : "on" });
        else for (const f of list(v)) out.push({ when: `flag('${q(f)}')`, kind: "flag", id: f, state: "on" });
        break;
      case "perk": case "perks":
        c.removed(w, k, "perks");
        break;
      case "when": case "formula":
        if (isObj(v)) for (const [f, text] of Object.entries(v)) formula(f, typeof text === "string" ? text : undefined, w);
        else formula(v, undefined, w);
        break;
      default:
        c.warn(w, `"${k}" isn't a stat or a requirement (with, has, rel, goal, flag, when)`);
    }
  }
  return out;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Sep 4", "4 Sep", "September 4th", or { month, day }. */
export function parseDate(v: unknown): { month: number; day: number } | null {
  if (isObj(v)) {
    const m = Number(v.month), d = Number(v.day);
    return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? { month: m, day: d } : null;
  }
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  const a = /^([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?$/.exec(s);
  const b = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})\.?$/.exec(s);
  const name = a?.[1] ?? b?.[2];
  const day = Number(a?.[2] ?? b?.[1]);
  const month = name ? MONTHS.indexOf(name.slice(0, 3)) + 1 : 0;
  return month >= 1 && day >= 1 && day <= 31 ? { month, day } : null;
}

/** Keys of an item's `use:` that describe the action itself; everything else is its effect. */
const USE_KEYS = new Set(["label", "say", "desc", "description", "when", "time", "tags", "check", "params", "why_not", "locked", "cost", "effects", "effect", "outcomes", "per_person", "hidden", "success", "fail", "partial", "crit_success", "crit_fail", "critical_success", "critical_fail", "failure", "requires", "needs", "show_locked", "at", "group", "gamble"]);

/** An item's `use:` (an action, or plain effects) and `bonus:` (gear that helps checks). */
function applyItemUse(it: ItemDef, r: Raw, w: string, c: Ctx, known: { stats: Set<string> }, style: Style) {
  if (r.keep === true) it.keep = true;
  if (isObj(r.bonus)) {
    for (const [stat, v] of Object.entries(r.bonus)) {
      if (!known.stats.has(stat)) { c.warn(`${w} › bonus › ${stat}`, `"${stat}" isn't a declared stat`); continue; }
      it.bonus[stat] = amount(v, `${w} › bonus › ${stat}`, c);
    }
  }
  const u = r.use;
  if (u !== undefined && u !== false) {
    const raw: Raw = isObj(u) ? u : typeof u === "string" ? { hint: u } : {};
    const action: Raw = {};
    const rest: Raw = {};
    for (const [k, v] of Object.entries(raw)) (USE_KEYS.has(k) || TIER_KEYS[k] ? action : rest)[k] = v;
    if (Object.keys(rest).length && !action.effects && !action.check) action.effects = rest;
    // The item is in hand, or this isn't offered.
    const has = `has('${it.id}')`;
    action.when = action.when !== undefined ? `(${String(action.when)}) and ${has}` : has;
    if (!action.label) action.label = `Use the ${it.name}`;
    const def = normAction(`item:${it.id}`, action, `${w} › use`, c, known, style);
    if (def) { def.tags = [...new Set([...def.tags, "item"])]; it.use = def; }
  }
}

/** `{ str: 2, atk: "level / 2" }` over declared stats: numbers or formulas. */
function statAmounts(v: unknown, where: string, c: Ctx, known: { stats: Set<string> }): Record<string, Amount> {
  const out: Record<string, Amount> = {};
  if (!isObj(v)) return out;
  for (const [stat, n] of Object.entries(v)) {
    if (!known.stats.has(stat)) { c.warn(`${where} › ${stat}`, `"${stat}" isn't a declared stat`); continue; }
    out[stat] = amount(n, `${where} › ${stat}`, c);
  }
  return out;
}

function groupOf(v: unknown, where: string, c: Ctx): { group?: string } {
  if (v === undefined || v === null) return {};
  if (typeof v === "string" && v.trim()) return { group: v.trim() };
  c.warn(where, "expected a heading, like `group: Combat`");
  return {};
}

/**
 * `secrets:` — ladders of stages that open by condition, in order. `person:` names who it is about; a stage's
 * `band: { trust: Open }` compiles to `rel('<person>', 'trust') >= <where the band Open starts>`.
 */
function normSecrets(raw: unknown, c: Ctx, rel: { stats: Record<string, StatDef>; people: Record<string, PersonDef> }): Record<string, SecretDef> {
  const out: Record<string, SecretDef> = {};
  if (raw === undefined) return out;
  if (!isObj(raw)) { c.warn("Secrets", "should be a map of secret names to definitions"); return out; }
  for (const [id, sRaw] of Object.entries(raw)) {
    const w = `Secrets › ${id}`;
    const r: Raw = isObj(sRaw) ? sRaw : typeof sRaw === "string" ? { stages: [sRaw] } : {};
    const person = typeof r.person === "string" && r.person.trim() ? r.person.trim() : undefined;
    if (person && !rel.people[person]) c.warn(`${w} › person`, `"${person}" isn't a person in relationships › people${near(person, Object.keys(rel.people))}`);
    const stages: SecretStage[] = [];
    // `cue:` is stage 0 — behaviour without a reason, known from the start.
    if (typeof r.cue === "string") stages.push({ text: r.cue, lore: [] });
    const stageList: unknown[] = Array.isArray(r.stages) ? r.stages : typeof r.text === "string" ? [{ text: r.text, when: r.when, lore: r.lore, band: r.band }] : [];
    stageList.forEach((st, i) => {
      const sw = `${w} › stage ${i + 1}`;
      const sr: Raw = isObj(st) ? st : typeof st === "string" ? { text: st } : {};
      if (typeof sr.text !== "string" || !sr.text.trim()) { c.warn(sw, "each stage needs `text:`"); return; }
      const conds: string[] = [];
      if (sr.when !== undefined) { const x = c.expr(sr.when, `${sw} › when`); if (x !== undefined) conds.push(String(x)); }
      if (sr.band !== undefined) conds.push(...bandConditions(sr.band, person, `${sw} › band`, c, rel));
      const when = conds.length > 1 ? conds.map((x) => `(${x})`).join(" and ") : conds[0];
      stages.push({ text: sr.text, lore: list(sr.lore), ...(when !== undefined ? { when } : {}) });
    });
    if (!stages.length) { c.warn(w, "has no stages — add `cue:` and/or `stages:`"); continue; }
    const tell = r.tell === true || r.tell === "exists" ? "exists" : "none";
    const about = typeof r.about === "string" ? r.about : person && rel.people[person] ? rel.people[person].name : titleCase(id);
    out[id] = { id, about, ...(person ? { person } : {}), tell, stages };
  }
  return out;
}

/** A stage's `band: { trust: Open }` as formulas; an unknown band never opens (with a warning). */
function bandConditions(raw: unknown, person: string | undefined, where: string, c: Ctx, rel: { stats: Record<string, StatDef> }): string[] {
  if (!isObj(raw)) { c.warn(where, "expected `band: { trust: Open }` (a relationship stat and one of its band names)"); return ["0 > 1"]; }
  if (!person) { c.warn(where, "a stage opened by `band:` needs the secret's `person:` (whose feelings it reads)"); return ["0 > 1"]; }
  const out: string[] = [];
  for (const [stat, name] of Object.entries(raw)) {
    const def = rel.stats[stat];
    if (!def) { c.warn(`${where} › ${stat}`, `"${stat}" isn't a relationship stat${near(stat, Object.keys(rel.stats))}`); out.push("0 > 1"); continue; }
    const band = def.bands.find((b) => b.text.toLowerCase() === String(name).trim().toLowerCase());
    if (!band) { c.warn(`${where} › ${stat}`, `"${name}" isn't one of ${def.label}'s bands${near(String(name), def.bands.map((b) => b.text))} — this stage never opens`); out.push("0 > 1"); continue; }
    out.push(`rel('${person.replace(/'/g, "")}', '${stat}') >= ${band.at}`);
  }
  return out;
}

/** " — did you mean "x"?" for a close name, or nothing. */
function near(name: string, pool: string[]): string {
  const n = name.toLowerCase();
  let best = "", bestD = Infinity;
  for (const p of pool) { const d = editDistance(n, p.toLowerCase()); if (d < bestD) { bestD = d; best = p; } }
  return best && bestD <= Math.max(2, Math.floor(name.length / 3)) ? ` — did you mean "${best}"?` : "";
}

function normLiveChoices(raw: unknown, c: Ctx, known: { stats: Set<string> }, style: Style): LiveChoicesDef {
  const def: LiveChoicesDef = { enabled: false, label: "Right now", count: 3, tags: {}, taper: { ...DEFAULT_TAPER } };
  if (raw === undefined || raw === false) return def;
  if (!isObj(raw)) { c.warn("Live choices", "should be a map with `tags:`"); return def; }
  def.label = typeof raw.label === "string" ? raw.label : def.label;
  def.count = Math.max(1, Math.min(6, Math.round(c.num(raw.count, "Live choices › count", def.count))));
  if (raw.when !== undefined) { const x = c.expr(raw.when, "Live choices › when"); if (x !== undefined) def.when = String(x); }
  if (typeof raw.guide === "string") def.guide = raw.guide;
  def.taper = normTaper(raw.taper, c);
  for (const [id, t] of Object.entries(isObj(raw.tags) ? raw.tags : {})) {
    const a = normAction(id, typeof t === "string" ? { desc: t } : t, `Live choices › tags › ${id}`, c, known, style);
    if (!a) continue;
    if (!a.desc) c.warn(`Live choices › tags › ${id}`, "add `desc:` — it tells the writer when to use this tag");
    def.tags[id] = a;
  }
  def.enabled = Object.keys(def.tags).length > 0;
  if (!def.enabled) c.warn("Live choices", "has no tags — add some under `tags:`");
  return def;
}


/**
 * Live tags taper by default: the same tag on the same person soon again gives less (57% the second time, 40% the
 * third, never below 10%). The loop simulator's "always kind" gate passes with it on every seed base tried; 0.5/0.25
 * failed it on a custom ruleset on 2 of 8 bases.
 */
export const DEFAULT_TAPER = { step: 0.75, floor: 0.1 };

function normTaper(raw: unknown, c: Ctx): LiveChoicesDef["taper"] {
  if (raw === undefined || raw === true || raw === null) return { ...DEFAULT_TAPER };
  if (raw === false) return false;
  if (!isObj(raw)) { c.warn("Live choices › taper", "expected `taper: false` or `{ step: 0.75, floor: 0.1 }`"); return { ...DEFAULT_TAPER }; }
  return {
    step: tuned(c, raw.step, "Live choices › taper › step", DEFAULT_TAPER.step, 0, 10, "0 means repeats never taper"),
    floor: tuned(c, raw.floor, "Live choices › taper › floor", DEFAULT_TAPER.floor, 0, 1, "the smallest share a repeat keeps"),
  };
}

/** `appearance:` and `outfit:` as short plain text. */
function lookText(r: Raw, where: string, c: Ctx): { appearance?: string; outfit?: string } {
  const out: { appearance?: string; outfit?: string } = {};
  for (const f of ["appearance", "outfit"] as const) {
    const v = r[f];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v !== "string") { c.warn(`${where} › ${f}`, "should be a line of text"); continue; }
    if (v.length > 160) c.warn(`${where} › ${f}`, "is longer than 160 characters; it is cut there");
    out[f] = v.trim().slice(0, 160);
  }
  return out;
}

/** What the narrator is told for each tier when an effect gives no direction of its own ("fail forward"). */
export const DEFAULT_DIRECTIONS: Record<Tier, string> = {
  crit_success: "It goes better than {{user}} hoped: a clean success with something extra.",
  success: "It works.",
  partial: "It works, but not cleanly: add a cost, a complication or a price.",
  fail: "It doesn't work. Show a concrete consequence, a lost chance or a changed situation that makes the next choice different. No identical retry. Do not grant the intended success.",
  crit_fail: "It goes badly wrong: a failure that costs {{user}} something real.",
};

export const DEFAULT_DC: Record<Difficulty, number> = { easy: 8, fair: 12, hard: 16, extreme: 20 };

/** Stats a typed attempt never leans on by default, even when they are attributes (levels, points). */
const NOT_A_SKILL = /^(level|lvl|xp|exp|experience|perk_?points|skill_?points|stat_?points|points)$/i;

/** `checks:` (alias `improvise:`): the one check style, and what typed attempts may lean on. */
function normChecks(raw: unknown, c: Ctx, known: { stats: Set<string> }, stats: Record<string, StatDef>, order: string[], where: string): ChecksDef {
  const usable = order.filter((id) => (stats[id].kind === "skill" || stats[id].kind === "attribute") && !NOT_A_SKILL.test(id));
  const def: ChecksDef = { typed: true, dc: { ...DEFAULT_DC }, partial: 3, stats: usable, bonus: 10, directions: {}, outcomes: {} };
  if (raw === undefined || raw === true) return def;
  if (raw === false) return { ...def, typed: false };
  if (!isObj(raw)) { c.warn(where, "expected `checks: false` or a map of settings"); return def; }
  if (raw.enabled === false || raw.typed === false) def.typed = false;
  if (isObj(raw.dc)) for (const [k, v] of Object.entries(raw.dc)) {
    const d = difficultyOf(k);
    if (d) def.dc[d] = c.num(v, `${where} › dc › ${k}`, def.dc[d]);
    else c.warn(`${where} › dc › ${k}`, "difficulty words are easy, fair, hard and extreme");
  }
  def.bonus = c.num(raw.bonus, `${where} › bonus`, 10);
  def.partial = Math.max(0, c.num(raw.partial, `${where} › partial`, 3));
  if (raw.stats !== undefined) {
    const want = list(raw.stats);
    for (const id of want) if (!stats[id]) c.warn(`${where} › stats`, `"${id}" isn't a stat`);
    def.stats = want.filter((id) => stats[id]);
  }
  if (raw.time !== undefined) def.time = Math.max(0, c.num(raw.time, `${where} › time`, 10));
  if (isObj(raw.directions)) for (const [k, v] of Object.entries(raw.directions)) {
    const tier = TIER_KEYS[k];
    if (tier && typeof v === "string" && v.trim()) def.directions[tier] = v.trim();
    else c.warn(`${where} › directions › ${k}`, "directions are lines of text per tier: crit_success, success, partial, fail, crit_fail");
  }
  if (isObj(raw.outcomes)) for (const [k, v] of Object.entries(raw.outcomes)) {
    const tier = TIER_KEYS[k];
    if (tier) def.outcomes[tier] = normEffect(v, `${where} › outcomes › ${k}`, c, known);
    else c.warn(`${where} › outcomes › ${k}`, "tiers are crit_success, success, partial, fail, crit_fail");
  }
  return def;
}

/** Contest defaults (CORE-DESIGN §2.5, tuned by simulation). */
export const DEFAULT_SWING: Record<Tier, number> = { crit_success: 50, success: 35, partial: 15, fail: -35, crit_fail: -50 };
export const DEFAULT_ROUNDS = { min: 3, max: 8 };
export const DEFAULT_ESCALATE = 0.4;

/** The three kinds an adventure gets when it declares none (costs only on stats that exist). */
const DEFAULT_KINDS: Record<string, Raw> = {
  fight: {
    label: "Fight", stats: ["body", "mind"], escape: "body",
    cost: { partial: { health: -3 }, fail: { health: -8 }, crit_fail: { health: -15 } },
    won: { mood: 5, hint: "{opponent} is beaten or yields." },
    lost: { health: -10, mood: -5, hint: "{{user}} is beaten. {opponent} gets what they wanted; {{user}} is hurt but alive." },
    escaped: { energy: -10, hint: "{{user}} gets away." },
  },
  chase: {
    label: "Chase", stats: ["body", "mind"], escape: "body",
    cost: { fail: { energy: -8 }, crit_fail: { energy: -12, health: -5 } },
    won: { hint: "{{user}} wins the chase: catches {opponent} or loses them for good." },
    lost: { energy: -10, hint: "{opponent} wins the chase." },
    escaped: { hint: "The chase breaks off." },
  },
  argument: {
    label: "Argument", stats: ["charm", "mind"], escape: "charm",
    cost: { fail: { mood: -4 }, crit_fail: { mood: -8 } },
    won: { mood: 4, hint: "{opponent} gives in, or is won over." },
    lost: { mood: -6, hint: "{opponent} wins the argument; {{user}} has to give ground." },
    escaped: { hint: "{{user}} walks away from it." },
  },
};

/** Keep only effects on stats that exist (the default kinds fit any ruleset). */
function onlyKnown(e: unknown, known: { stats: Set<string> }): unknown {
  if (!isObj(e)) return e;
  return Object.fromEntries(Object.entries(e).filter(([k]) => k === "hint" || known.stats.has(k)));
}

/** `conflict:` — contests on one momentum gauge. */
function normConflict(raw: unknown, c: Ctx, known: { stats: Set<string> }, stats: Record<string, StatDef>, checkStats: string[], style: Style): ConflictDef {
  const def: ConflictDef = { fromStory: true, rounds: { ...DEFAULT_ROUNDS }, escalate: DEFAULT_ESCALATE, swing: { ...DEFAULT_SWING }, kinds: {} };
  if (style === "story") {
    if (raw !== undefined && raw !== false) c.warn("Conflict", "story rulesets don't roll, so `conflict:` is ignored (use `style: adventure`)");
    return { ...def, fromStory: false };
  }
  if (raw === false) return { ...def, fromStory: false };
  const r: Raw = isObj(raw) ? raw : {};
  if (raw !== undefined && !isObj(raw) && raw !== true) c.warn("Conflict", "expected a map with `kinds:`");
  def.fromStory = r.from_story !== false;
  if (isObj(r.rounds)) {
    def.rounds.min = Math.round(tuned(c, r.rounds.min, "Conflict › rounds › min", DEFAULT_ROUNDS.min, 1, 20));
    def.rounds.max = Math.round(tuned(c, r.rounds.max, "Conflict › rounds › max", DEFAULT_ROUNDS.max, 1, 30));
    if (def.rounds.max < def.rounds.min) { c.warn("Conflict › rounds", "max is below min — using max = min"); def.rounds.max = def.rounds.min; }
  } else if (r.rounds !== undefined) c.warn("Conflict › rounds", "expected `{ min: 3, max: 8 }`");
  def.escalate = tuned(c, r.escalate, "Conflict › escalate", DEFAULT_ESCALATE, 0, 3, "how much the stakes rise per round");
  if (isObj(r.swing)) for (const [k, v] of Object.entries(r.swing)) {
    const tier = TIER_KEYS[k];
    if (tier) def.swing[tier] = c.num(v, `Conflict › swing › ${k}`, def.swing[tier]);
    else c.warn(`Conflict › swing › ${k}`, "tiers are crit_success, success, partial, fail, crit_fail");
  }
  const authored = isObj(r.kinds);
  const kinds: Record<string, unknown> = authored ? r.kinds : DEFAULT_KINDS;
  for (const [id, kRaw] of Object.entries(kinds)) {
    const w = `Conflict › kinds › ${id}`;
    if (!isObj(kRaw)) { c.warn(w, "expected a kind (label, stats, cost, won, lost, escaped)"); continue; }
    const fix = (e: unknown) => (authored ? e : onlyKnown(e, known));
    let kStats = list(kRaw.stats).filter((s) => {
      if (stats[s]) {
        if (stats[s].kind !== "attribute" && stats[s].kind !== "skill" && authored) c.warn(`${w} › stats`, `"${s}" isn't an attribute or skill — moves lean on it anyway`);
        return true;
      }
      if (authored) c.warn(`${w} › stats`, `"${s}" isn't a stat`);
      return false;
    });
    if (!kStats.length) {
      if (authored) { c.err(w, "a contest kind needs `stats:` (the attributes or skills its moves lean on)"); continue; }
      kStats = checkStats.slice(0, 2);
    }
    const escRaw = typeof kRaw.escape === "string" ? kRaw.escape : undefined;
    if (escRaw && !stats[escRaw] && authored) c.warn(`${w} › escape`, `"${escRaw}" isn't a stat — using ${kStats[0] ?? "luck"}`);
    const cost: Partial<Record<Tier, Effect>> = {};
    if (isObj(kRaw.cost)) for (const [k, v] of Object.entries(kRaw.cost)) {
      const tier = TIER_KEYS[k];
      if (tier) cost[tier] = normEffect(fix(v), `${w} › cost › ${k}`, c, known);
      else c.warn(`${w} › cost › ${k}`, "tiers are crit_success, success, partial, fail, crit_fail");
    }
    if (authored) warnUnknownKeys(kRaw, KIND_KEYS, w, c);
    def.kinds[id] = {
      id,
      label: typeof kRaw.label === "string" ? kRaw.label : titleCase(id),
      stats: kStats,
      escape: escRaw && stats[escRaw] ? escRaw : kStats[0] ?? "",
      cost,
      won: normEffect(fix(kRaw.won), `${w} › won`, c, known),
      lost: normEffect(fix(kRaw.lost), `${w} › lost`, c, known),
      escaped: normEffect(fix(kRaw.escaped), `${w} › escaped`, c, known),
    };
  }
  return def;
}

const KIND_KEYS = new Set(["label", "stats", "escape", "cost", "won", "lost", "escaped", "desc"]);

/** `goals:` — story goals: from the story (up to `max` open), and the author's own. */
function normGoals(raw: unknown, c: Ctx, known: { stats: Set<string> }): GoalsDef {
  const def: GoalsDef = { fromStory: true, max: 3, list: {} };
  if (raw === undefined || raw === true) return def;
  if (raw === false) return { ...def, fromStory: false };
  if (!isObj(raw)) { c.warn("Goals", "expected `goals: { from_story: true, max: 3, list: … }`"); return def; }
  def.fromStory = raw.from_story !== false;
  def.max = Math.round(tuned(c, raw.max, "Goals › max", 3, 0, 10, "goals open at once"));
  if (raw.list !== undefined && !isObj(raw.list)) c.warn("Goals › list", "should be a map of goal ids to goals");
  for (const [id, g] of Object.entries(isObj(raw.list) ? raw.list : {})) {
    const w = `Goals › ${id}`;
    const r: Raw = isObj(g) ? g : typeof g === "string" ? { text: g } : {};
    if (typeof r.text !== "string" || !r.text.trim()) { c.warn(w, "a goal needs `text:`"); continue; }
    const doneWhen = r.done_when !== undefined ? c.expr(r.done_when, `${w} › done_when`) : undefined;
    const failWhen = r.fail_when !== undefined ? c.expr(r.fail_when, `${w} › fail_when`) : undefined;
    for (const k of Object.keys(r)) if (!GOAL_KEYS.has(k)) c.warn(`${w} › ${k}`, `"${k}" isn't something a goal reads (text, done_when, fail_when, judge, judge_fail, stakes, reward)`);
    def.list[id] = {
      id,
      text: r.text.trim(),
      ...(doneWhen !== undefined ? { doneWhen: String(doneWhen) } : {}),
      ...(failWhen !== undefined ? { failWhen: String(failWhen) } : {}),
      ...(typeof r.judge === "string" && r.judge.trim() ? { judge: r.judge.trim() } : {}),
      ...(typeof r.judge_fail === "string" && r.judge_fail.trim() ? { judgeFail: r.judge_fail.trim() } : {}),
      ...(typeof r.stakes === "string" && r.stakes.trim() ? { stakes: r.stakes.trim() } : {}),
      reward: normEffect(r.reward, `${w} › reward`, c, known),
    };
  }
  return def;
}

const GOAL_KEYS = new Set(["text", "done_when", "fail_when", "judge", "judge_fail", "stakes", "reward"]);

function normGrowth(raw: unknown, c: Ctx): GrowthDef {
  const def: GrowthDef = { enabled: true, rate: 1, attributes: 0.5, train: true, repeat: { ...DEFAULT_PRACTICE_REPEAT } };
  if (raw === undefined || raw === true) return def;
  if (raw === false) return { ...def, enabled: false };
  if (typeof raw === "number") return { ...def, rate: Math.max(0, raw), enabled: raw > 0 };
  if (!isObj(raw)) { c.warn("Growth", "expected `growth: false`, a speed, or a map of settings"); return def; }
  if (raw.enabled === false) def.enabled = false;
  def.rate = Math.max(0, c.num(raw.rate, "Growth › rate", 1));
  def.attributes = Math.max(0, c.num(raw.attributes, "Growth › attributes", 0.5));
  def.train = raw.train !== false;
  if (raw.repeat !== undefined) def.repeat = normPracticeRepeat(raw.repeat, c);
  return def;
}

/** A tuning number kept inside [lo, hi] with a readable warning; out-of-range values are clamped. */
export function tuned(c: Ctx, v: unknown, where: string, fallback: number, lo: number, hi: number, hint = ""): number {
  if (v === undefined) return fallback;
  const n = c.num(v, where, fallback);
  if (n < lo || n > hi) {
    const x = Math.max(lo, Math.min(hi, n));
    c.warn(where, `${n} is outside ${lo}–${hi}${hint ? ` (${hint})` : ""} — using ${x}`);
    return x;
  }
  return n;
}

function normPracticeRepeat(raw: unknown, c: Ctx): PracticeRepeatDef | false {
  const def = { ...DEFAULT_PRACTICE_REPEAT };
  if (raw === false) return false;
  if (raw === true || raw === null) return def;
  if (!isObj(raw)) { c.warn("Growth › repeat", "expected `repeat: false` or a map like `{ step: 0.5, floor: 0.1, recover_minutes: 120, recover_turns: 8 }`"); return def; }
  if (raw.enabled === false) return false;
  const known = new Set(["enabled", "step", "floor", "recover_minutes", "recover_turns"]);
  for (const k of Object.keys(raw)) if (!known.has(k)) c.warn(`Growth › repeat › ${k}`, "unknown setting — use step, floor, recover_minutes or recover_turns");
  def.step = tuned(c, raw.step, "Growth › repeat › step", def.step, 0, 10, "0 means repeats never taper");
  def.floor = tuned(c, raw.floor, "Growth › repeat › floor", def.floor, 0, 1, "the smallest share of learning a repeat keeps");
  def.recoverMinutes = tuned(c, raw.recover_minutes, "Growth › repeat › recover_minutes", def.recoverMinutes, 0, 525600, "in-game minutes; 0 never recovers by time");
  def.recoverTurns = Math.round(tuned(c, raw.recover_turns, "Growth › repeat › recover_turns", def.recoverTurns, 0, 1000, "turns; 0 never recovers by turns"));
  return def;
}


/**
 * Top-level keys of systems removed from Warp (CORE-DESIGN §1.5): an old ruleset that has them still loads,
 * with one plain warning per key (and what to use instead); the section is ignored.
 */
export const REMOVED_KEYS: Record<string, { what: string; hint?: string }> = {
  encounters: { what: "encounters", hint: "Use `conflict:` (fights, chases, arguments run on one momentum gauge)." },
  quests: { what: "quests", hint: "Use `goals:`." },
  locations: { what: "places and the travel graph", hint: "Places come from the story now; set `start.place`." },
  locations_open: { what: "places and the travel graph", hint: "Places come from the story now; set `start.place`." },
  weather: { what: "weather and temperature", hint: "Describe looks and clothes as text in `you:` / people (`appearance`, `outfit`)." },
  wardrobe: { what: "the wardrobe", hint: "Describe looks and clothes as text in `you:` / people (`appearance`, `outfit`)." },
  body: { what: "the body and transformations", hint: "Describe looks and clothes as text in `you:` / people (`appearance`, `outfit`)." },
  item_uses: { what: "drafted item uses", hint: "Give the item its own `use:`." },
  discovery: { what: "discovering places" },
  observers: { what: "being seen" }, being_seen: { what: "being seen" },
  lineage: { what: "family and pregnancy" },
  companions: { what: "companion lives and jealousy" }, bonds: { what: "feelings between people" },
  obligations: { what: "bills and debts" }, debts: { what: "bills and debts" }, jobs: { what: "work shifts" },
  fronts: { what: "hidden world clocks (fronts)", hint: "Use `triggers:` with `when_scene:` for story beats." },
  random_events: { what: "random events", hint: "Use `triggers:` with `when_scene:` for story beats." },
  events: { what: "random events", hint: "Use `triggers:` with `when_scene:` for story beats." },
  mind: { what: "mind overrides and perception filters" },
  checkpoints: { what: "checkpoints and time loops" }, endings: { what: "endings and new playthroughs" },
  codex: { what: "the codex" }, feats: { what: "feats" }, perks: { what: "perks" }, abilities: { what: "abilities" },
  dungeons: { what: "dungeons" }, dating: { what: "dating" }, minigames: { what: "minigames" }, look: { what: "the stage and minigame looks" },
};

/** The top-level keys Warp reads (21, plus `inventory: { open }`), and the aliases it still accepts. */
export const TOP_LEVEL_KEYS = [
  "name", "description", "style", "you", "clock", "start", "hud", "narration", "stats", "growth", "checks",
  "relationships", "items", "inventory", "conditions", "flags", "triggers", "actions", "secrets", "live_choices", "goals", "conflict",
];
const KEY_ALIASES: Record<string, string> = { player: "you", improvise: "checks", improvised: "checks", practice: "growth", rules: "triggers", people: "relationships" };

const SEXUAL_TAGS = new Set(["sexual", "sex", "nsfw", "lewd", "explicit", "erotic", "smut"]);

export function normalizeRuleset(raw: unknown): { ruleset: Ruleset | null; issues: Issue[] } {
  const c = new Ctx();
  if (!isObj(raw)) {
    c.err("Ruleset", "is empty or isn't a YAML map");
    return { ruleset: null, issues: c.issues };
  }

  // Parts of Warp that were taken out (the old version is on the `legacy` branch), renamed keys, and typos.
  for (const k of Object.keys(raw)) {
    const gone = REMOVED_KEYS[k];
    if (gone) { c.removed(titleCase(k), k, gone.what, gone.hint); continue; }
    if (TOP_LEVEL_KEYS.includes(k)) continue;
    if (k === "player") { c.warn("You", "`player:` was renamed to `you:` — it is read as `you:`."); continue; }
    if (k === "improvise" || k === "improvised") { c.warn("Checks", `\`${k}:\` was renamed to \`checks:\` — it is read as \`checks:\`.`); continue; }
    if (KEY_ALIASES[k]) continue;
    c.warn(titleCase(k), `"${k}" isn't a part of a Warp ruleset, so it's ignored${near(k, TOP_LEVEL_KEYS)} (the parts are ${TOP_LEVEL_KEYS.join(", ")})`);
  }

  const styleRaw = raw.style === undefined ? "adventure" : String(raw.style).trim().toLowerCase();
  if (styleRaw !== "story" && styleRaw !== "adventure") c.warn("Style", `"${raw.style}" — use story (no dice) or adventure (dice); using adventure`);
  const style: Style = styleRaw === "story" ? "story" : "adventure";
  const weekdays = Array.isArray(raw.clock?.weekdays) ? raw.clock.weekdays.map(String) : DEFAULT_WEEKDAYS;

  // Stats first — effects use their names for shorthand.
  const stats: Record<string, StatDef> = {};
  const statOrder: string[] = [];
  if (raw.stats !== undefined && !isObj(raw.stats)) c.err("Stats", "should be a map of stat names to definitions");
  for (const [id, def] of Object.entries(isObj(raw.stats) ? raw.stats : {})) {
    const s = normStat(id, def, `Stats › ${id}`, c);
    if (s) { stats[id] = s; statOrder.push(id); }
  }
  const known = { stats: new Set(statOrder) };

  // Relationships
  const relRaw: Raw = isObj(raw.relationships) ? raw.relationships : isObj(raw.people) ? { people: raw.people } : {};
  const relStats: Record<string, StatDef> = {};
  const relStatOrder: string[] = [];
  for (const [id, def] of Object.entries(isObj(relRaw.stats) ? relRaw.stats : {})) {
    const s = normStat(id, def, `Relationships › stats › ${id}`, c, true);
    if (s) {
      if (s.start === s.max && (def as Raw)?.start === undefined) s.start = s.min; // relationships start low by default
      relStats[id] = s; relStatOrder.push(id);
    }
  }
  const people: Record<string, PersonDef> = {};
  for (const [id, p] of Object.entries(isObj(relRaw.people) ? relRaw.people : {})) {
    const r: Raw = isObj(p) ? p : typeof p === "string" ? { name: p } : {};
    const start: Record<string, number> = {};
    if (isObj(r.start)) for (const [s, v] of Object.entries(r.start)) start[s] = c.num(v, `Relationships › people › ${id} › start › ${s}`, 0);
    // Schedules (who is where, when) and per-person traits were taken out.
    for (const k of ["schedule", "routine"]) if (r[k] !== undefined) c.removed(`Relationships › people › ${id} › ${k}`, k, "schedules", "Who is here comes from the story.");
    if (r.traits !== undefined) c.removed(`Relationships › people › ${id} › traits`, "traits", "per-person traits", "Put it in `desc:`.");
    people[id] = {
      id,
      name: typeof r.name === "string" ? r.name : titleCase(id),
      age: r.age !== undefined ? c.num(r.age, `Relationships › people › ${id} › age`, 0) : undefined,
      start,
      desc: typeof r.desc === "string" ? r.desc : undefined,
      ...lookText(r, `Relationships › people › ${id}`, c),
    };
  }
  const bigRaw = relRaw.big_moment;
  const relBigMoment = bigRaw === false || bigRaw === null ? null : {
    factor: isObj(bigRaw) ? tuned(c, bigRaw.factor, "Relationships › big_moment › factor", 3, 1, 10) : 3,
    cooldown: isObj(bigRaw) ? Math.round(tuned(c, bigRaw.cooldown, "Relationships › big_moment › cooldown", 10, 0, 1000, "turns")) : 10,
  };
  if (bigRaw !== undefined && bigRaw !== false && bigRaw !== null && bigRaw !== true && !isObj(bigRaw)) c.warn("Relationships › big_moment", "expected `{ factor: 3, cooldown: 10 }` or false");

  // Items
  const invRaw: Raw = isObj(raw.inventory) ? raw.inventory : {};
  const items: Record<string, ItemDef> = {};
  for (const [id, it] of Object.entries(isObj(raw.items) ? raw.items : isObj(invRaw.items) ? invRaw.items : {})) {
    const r: Raw = isObj(it) ? it : typeof it === "string" ? { name: it } : {};
    const w = `Items › ${id}`;
    // Clothing (the wardrobe) and armor were taken out.
    for (const k of ["slot", "warmth", "integrity", "reveal", "traits"]) if (r[k] !== undefined) c.removed(`${w} › ${k}`, k, "the wardrobe", "Describe clothes as text (`look:` / `outfit:`).");
    if (r.armor !== undefined) c.removed(`${w} › armor`, "armor", "armor", "Contests have no armor; use `bonus:` on the stats it helps.");
    items[id] = {
      id,
      name: typeof r.name === "string" ? r.name : titleCase(id),
      desc: r.desc,
      tags: list(r.tags),
      // `uses: 5` — five uses per item; a `consumable` tag means one.
      uses: Math.max(0, Math.round(c.num(r.uses ?? r.charges, `${w} › uses`, list(r.tags).map((t) => t.toLowerCase()).includes("consumable") ? 1 : 0))),
      keep: r.keep === true,
      bonus: {},
    };
    applyItemUse(items[id], r, w, c, known, style);
  }

  // Conditions
  const conditions: Record<string, ConditionDef> = {};
  for (const [id, d] of Object.entries(isObj(raw.conditions) ? raw.conditions : {})) {
    const r: Raw = isObj(d) ? d : typeof d === "string" ? { label: d } : {};
    const w = `Conditions › ${id}`;
    const gate = normGate(r, w, c);
    for (const k of ["rounds", "dot", "heal", "per_round", "damage", "stat", "every", "skip", "stun", "lose_turn", "armor", "tick", "each"]) {
      if (r[k] !== undefined) c.removed(`${w} › ${k}`, k, "statuses that tick in fights", "A condition has `label`, `tone`, `desc`, `narrator`, `bonus` and `lasts`.");
    }
    const lastsRaw = r.lasts ?? r.minutes ?? r.duration;
    conditions[id] = {
      id,
      label: typeof r.label === "string" ? r.label : titleCase(id),
      tone: ["good", "warn", "bad", "neutral"].includes(r.tone) ? r.tone : "warn",
      desc: typeof r.desc === "string" ? r.desc : undefined,
      narrator: r.narrator === true,
      ...(gate ? { gate } : {}),
      bonus: statAmounts(r.bonus, `${w} › bonus`, c, known),
      ...(lastsRaw !== undefined ? { lasts: Math.max(1, minutesOf(lastsRaw, `${w} › lasts`, c, 60)) } : {}),
    };
  }

  // Flags
  const flags: Record<string, FlagDef> = {};
  for (const [id, d] of Object.entries(isObj(raw.flags) ? raw.flags : {})) {
    const r: Raw = isObj(d) ? d : { start: d };
    const gate = normGate(r, `Flags › ${id}`, c);
    flags[id] = { id, label: r.label, narrator: r.narrator === true, start: r.start ?? false, ...(gate ? { gate } : {}) };
  }

  // Start
  const startRaw: Raw = isObj(raw.start) ? raw.start : {};
  const startItems: Record<string, number> = {};
  const si = startRaw.items ?? invRaw.start;
  if (isObj(si)) for (const [it, n] of Object.entries(si)) startItems[it] = c.num(n, `Start › items › ${it}`, 1);
  else if (Array.isArray(si)) for (const it of si) startItems[String(it)] = 1;
  if (isObj(startRaw.stats)) for (const [s, v] of Object.entries(startRaw.stats)) {
    if (stats[s]) { stats[s].start = c.num(v, `Start › stats › ${s}`, stats[s].start); delete stats[s].startExpr; }
    else c.warn(`Start › stats › ${s}`, "isn't a declared stat");
  }
  // `start.money: 50` sets the money stat's start.
  const moneyStat = isObj(raw.hud) && typeof raw.hud.money === "string" ? raw.hud.money : statOrder.find((s) => stats[s].kind === "money");
  if (startRaw.money !== undefined) {
    if (moneyStat && stats[moneyStat]) stats[moneyStat].start = c.num(startRaw.money, "Start › money", stats[moneyStat].start);
    else c.warn("Start › money", "there is no `kind: money` stat to start");
  }
  if (startRaw.location !== undefined) c.removed("Start › location", "location", "places and the travel graph", "Use `start.place:` (words, or greeting).");
  for (const k of Object.keys(startRaw)) if (!["place", "items", "money", "stats", "time", "date", "location"].includes(k)) c.warn(`Start › ${k}`, `"${k}" isn't something start: reads (place, items, money, stats)`);
  const placeRaw = startRaw.place ?? "greeting";
  const startPlace = typeof placeRaw === "string" && placeRaw.trim() ? (placeRaw.trim().toLowerCase() === "greeting" ? "greeting" : placeRaw.trim().slice(0, 120)) : null;

  // Clock: read from the greeting unless the ruleset sets a fixed start.
  const clockRaw: Raw = isObj(raw.clock) ? raw.clock : {};
  const clockStartRaw = startRaw.time ?? clockRaw.start ?? "greeting";
  const fromGreeting = typeof clockStartRaw === "string" && clockStartRaw.trim().toLowerCase() === "greeting";
  const clockStart = fromGreeting ? null : parseClockStart(clockStartRaw, weekdays);
  if (clockStart === null && !fromGreeting) c.warn("Clock › start", `"${clockStartRaw}" should look like greeting, "Day 1 07:30" or "Mon 07:30"`);
  const fallbackRaw = clockRaw.fallback ?? "Day 1 09:00";
  const clockFallback = parseClockStart(fallbackRaw, weekdays);
  if (clockFallback === null) c.warn("Clock › fallback", `"${fallbackRaw}" should look like "Day 1 09:00"`);
  const dateRaw = clockRaw.date ?? clockRaw.start_date ?? startRaw.date;
  // `date: greeting`: a calendar date only if the greeting gives one (the greeting read does not set one yet).
  const dateFromGreeting = typeof dateRaw === "string" && dateRaw.trim().toLowerCase() === "greeting";
  const startDate = dateRaw === undefined || dateFromGreeting ? null : parseDate(dateRaw);
  if (dateRaw !== undefined && !dateFromGreeting && !startDate) c.warn("Clock › date", `"${dateRaw}" should look like "Sep 4" or greeting`);

  // Actions
  const actions: Record<string, ActionDef> = {};
  const actionOrder: string[] = [];
  for (const [id, a] of Object.entries(isObj(raw.actions) ? raw.actions : {})) {
    const def = normAction(id, a, `Actions › ${id}`, c, known, style);
    if (def) { actions[id] = def; actionOrder.push(id); }
  }

  // Triggers
  const triggers: TriggerDef[] = [];
  const trigRaw = raw.triggers ?? raw.rules;
  const trigList: [string, unknown][] = Array.isArray(trigRaw)
    ? trigRaw.map((t, n) => [isObj(t) && typeof t.id === "string" ? t.id : `rule_${n + 1}`, t])
    : isObj(trigRaw) ? Object.entries(trigRaw) : [];
  for (const [id, t] of trigList) {
    const w = `Triggers › ${id}`;
    if (!isObj(t)) { c.warn(w, "expected `when:` and `do:`"); continue; }
    const when = t.when ?? t.if;
    const whenExpr = when !== undefined ? c.expr(when, `${w} › when`) : undefined;
    const whenScene = typeof t.when_scene === "string" ? t.when_scene : typeof t.scene === "string" ? t.scene : undefined;
    if (whenExpr === undefined && !whenScene) { c.err(w, "needs `when:` (a formula) or `when_scene:` (a plain-language condition)"); continue; }
    const effRaw = t.do ?? t.then ?? t.effects ?? {};
    const effects = normEffect(isObj(effRaw) ? { ...effRaw, ...(t.hint ? { hint: t.hint } : {}) } : effRaw, `${w} › do`, c, known);
    triggers.push({ id, when: whenExpr === undefined ? undefined : String(whenExpr), whenScene, repeat: t.repeat === true || t.every_turn === true, effects });
  }

  // HUD
  const hudRaw: Raw = isObj(raw.hud) ? raw.hud : {};
  const bars = Array.isArray(hudRaw.bars) ? hudRaw.bars.map(String).filter((b: string) => {
    if (!stats[b]) { c.warn("HUD › bars", `"${b}" isn't a declared stat`); return false; }
    return true;
  }) : statOrder.filter((s) => stats[s].kind === "meter");

  const narrRaw: Raw = isObj(raw.narration) ? raw.narration : {};
  const youRaw: Raw = isObj(raw.you) ? raw.you : isObj(raw.player) ? raw.player : {};

  // Story machinery: secrets, choices written for the moment, goals, contests.
  const secrets = normSecrets(raw.secrets, c, { stats: relStats, people });
  const liveChoices = normLiveChoices(raw.live_choices, c, known, style);
  const checksRaw = raw.checks ?? raw.improvise ?? raw.improvised;
  const checks = normChecks(checksRaw, c, known, stats, statOrder, "Checks");
  if (style === "story") {
    if (checksRaw !== undefined && checksRaw !== false && isObj(checksRaw) && checksRaw.typed === true) c.warn("Checks › typed", "story rulesets never roll typed messages (use `style: adventure`)");
    checks.typed = false;
  }
  const conflict = normConflict(raw.conflict, c, known, stats, checks.stats, style);
  const goals = normGoals(raw.goals, c, known);
  const growth = normGrowth(raw.growth ?? raw.practice, c);

  const ruleset: Ruleset = {
    name: typeof raw.name === "string" ? raw.name : "Untitled ruleset",
    description: typeof raw.description === "string" ? raw.description : undefined,
    style,
    you: {
      name: typeof youRaw.name === "string" ? youRaw.name : undefined,
      age: youRaw.age !== undefined ? c.num(youRaw.age, "You › age", 0) : undefined,
      ...lookText(youRaw, "You", c),
    },
    stats, statOrder, relStats, relStatOrder, people,
    peopleOpen: relRaw.open !== false && (relStatOrder.length > 0),
    items,
    itemsOpen: invRaw.open !== false,
    startItems,
    startPlace,
    conditions, flags, actions, actionOrder, triggers,
    clock: {
      enabled: clockRaw.enabled !== false,
      start: fromGreeting ? "greeting" : clockStart ?? clockFallback ?? 540,
      fallback: clockFallback ?? 540,
      minutesPerAction: c.num(clockRaw.minutes_per_action, "Clock › minutes_per_action", 10),
      narratorMax: c.num(clockRaw.narrator_max ?? clockRaw.narrator, "Clock › narrator_max", 480),
      weekdays,
      weekdayKnown: !fromGreeting && typeof clockStartRaw === "string" && /^\s*[a-z]{3,}/i.test(clockStartRaw) && !/^\s*day\b/i.test(clockStartRaw),
      startDate,
    },
    hud: { bars, money: moneyStat && stats[moneyStat] ? moneyStat : undefined, ...normCurrency(hudRaw.currency, c) },
    narration: { notes: typeof narrRaw.notes === "string" ? narrRaw.notes : undefined, numbers: narrRaw.numbers === true },
    secrets, liveChoices, checks, conflict, goals, relBigMoment, growth,
  };

  // Cross-references that need everything loaded.
  for (const a of Object.values(actions)) for (const who of a.targets ?? []) {
    if (!people[who]) c.warn(`Actions › ${a.id} › targets`, `"${who}" isn't a person in relationships › people`);
  }
  for (const a of Object.values(actions)) if (a.targets && !a.targets.length) c.warn(`Actions › ${a.id} › targets`, "names no one — list the people it can be aimed at");

  // Hard floor: sexual content and minors never mix, whatever the tags or settings.
  const minors = [
    ...(ruleset.you.age !== undefined && ruleset.you.age < 18 ? ["the player"] : []),
    ...Object.values(people).filter((p) => p.age !== undefined && p.age < 18).map((p) => p.name),
  ];
  const sexualActions = [...Object.values(actions), ...Object.values(liveChoices.tags)].filter((a) => a.tags.some((t) => SEXUAL_TAGS.has(t)));
  if (minors.length && sexualActions.length) {
    c.err("Ruleset", `declares characters under 18 (${minors.join(", ")}) alongside sexual actions — Warp won't run this ruleset`);
    return { ruleset: null, issues: c.issues };
  }

  return { ruleset, issues: c.issues };
}
