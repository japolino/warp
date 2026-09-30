// Ruleset: the declarative "game" attached to a card.
//
// Authors write loose YAML; `normalizeRuleset` turns it into this strict shape,
// fills defaults, and collects friendly issues instead of throwing. A broken
// section is skipped with a warning so the rest of the ruleset keeps working.

import { compile, ExprError } from "./expr.js";
import { parseDice, DiceError } from "./dice.js";

export type Tone = "good" | "warn" | "bad" | "neutral";
export type StatKind = "meter" | "attribute" | "skill" | "money" | "hidden";
export type ShowMode = "text" | "number" | "both" | "hidden";
export type Tier = "crit_success" | "success" | "partial" | "fail" | "crit_fail";
export const TIERS: Tier[] = ["crit_success", "success", "partial", "fail", "crit_fail"];

export interface Band { at: number; text: string; tone: Tone }

export interface StatDef {
  id: string;
  label: string;
  kind: StatKind;
  min: number;
  max: number;
  /** Expression allowed so caps can scale, e.g. "level * 5". Evaluated at clamp time. */
  maxExpr?: string;
  start: number;
  /** Which end is desirable. Drives default band tones and bar colours. */
  good: "high" | "low" | "none";
  perHour: number;
  show: ShowMode;
  /** Max absolute change the narrator may make per turn. 0 = engine only. */
  narrator: number;
  bands: Band[];
  grades?: string[];
  color?: string;
  desc?: string;
}

export interface Effect {
  stats: Record<string, string | number>;
  set: Record<string, string | number>;
  flags: Record<string, string | number | boolean | null>;
  items: Record<string, number>;
  rel: Record<string, Record<string, string | number>>;
  move?: string;
  time?: number;
  addConditions: Record<string, number | null>;
  removeConditions: string[];
  hint?: string;
  /** Uncertain reactions: a decision model supplies odds, the engine rolls. */
  decide: DecideSpec[];
}

export interface DecideOption { id: string; desc: string; weight: number; effect: Effect }
export interface DecideSpec { id: string; ask: string; options: DecideOption[] }

export type CheckStyle = "chance" | "vs" | "pbta";

export interface CheckDef {
  style: CheckStyle;
  dice: string;
  /** chance: target percentage (roll-under). vs: difficulty to meet or beat. */
  target?: string | number;
  /** Modifier added to the roll (vs / pbta). */
  add?: string | number;
  /** vs only: missing by this much or less counts as a partial success. */
  partialMargin: number;
  label?: string;
  crits: boolean;
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
  group?: string;
  at: string[];
  when?: string;
  hidden: boolean;
  time?: number;
  cost: Effect;
  check?: CheckDef;
  outcomes: Partial<Record<Tier, Effect>>;
  /** Applied when there is no check. */
  effects: Effect;
  params: ParamDef[];
  tags: string[];
  order: number;
}

export interface TriggerDef {
  id: string;
  when?: string;
  /** Plain-language condition judged by the decision model each turn, e.g. "{{user}} is in danger". */
  whenScene?: string;
  repeat: boolean;
  effects: Effect;
}

export interface LocationDef { id: string; name: string; desc?: string; exits: string[]; travel: number }
export interface ItemDef { id: string; name: string; desc?: string; tags: string[] }
export interface ConditionDef { id: string; label: string; tone: Tone; desc?: string; narrator: boolean }
export interface PersonDef { id: string; name: string; age?: number; start: Record<string, number>; desc?: string }
export interface FlagDef { id: string; label?: string; narrator: boolean; start: string | number | boolean | null }

export interface Ruleset {
  name: string;
  description?: string;
  player: { name?: string; age?: number };
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
  locations: Record<string, LocationDef>;
  /** Narrator may move the player, including to undeclared places. */
  locationsOpen: boolean;
  startLocation: string | null;
  conditions: Record<string, ConditionDef>;
  flags: Record<string, FlagDef>;
  actions: Record<string, ActionDef>;
  actionOrder: string[];
  triggers: TriggerDef[];
  clock: {
    enabled: boolean;
    start: number;
    minutesPerAction: number;
    /** Max minutes the narrator may advance in one turn. */
    narratorMax: number;
    weekdays: string[];
  };
  hud: { bars: string[]; money?: string; currency: string };
  narration: { notes?: string; numbers: boolean };
}

export interface Issue {
  level: "error" | "warning";
  where: string;
  message: string;
}

// ───────────────────────── helpers ─────────────────────────

type Raw = Record<string, any>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);

function titleCase(id: string): string {
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

class Ctx {
  issues: Issue[] = [];
  err(where: string, message: string) { this.issues.push({ level: "error", where, message }); }
  warn(where: string, message: string) { this.issues.push({ level: "warning", where, message }); }

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
    try { compile(s); return s; } catch (e) {
      this.err(where, e instanceof ExprError ? `Formula "${s}": ${e.message}` : `Formula "${s}" couldn't be read`);
      return undefined;
    }
  }
}

function toneFor(index: number, count: number, good: StatDef["good"]): Tone {
  if (good === "none" || count <= 1) return "neutral";
  const pos = index / (count - 1); // 0 = lowest band
  const goodness = good === "high" ? pos : 1 - pos;
  return goodness >= 0.67 ? "good" : goodness >= 0.34 ? "warn" : "bad";
}

function normBands(raw: unknown, good: StatDef["good"], where: string, c: Ctx): Band[] {
  if (raw === undefined || raw === null) return [];
  const list: { at: number; text: string; tone?: Tone }[] = [];
  if (Array.isArray(raw)) {
    raw.forEach((b, i) => {
      if (!isObj(b)) { c.warn(`${where} › #${i + 1}`, "each band needs `at` and `text`"); return; }
      const at = c.num(b.at ?? b.from ?? b.min, `${where} › #${i + 1}`, NaN);
      if (!Number.isFinite(at) || typeof b.text !== "string") { c.warn(`${where} › #${i + 1}`, "each band needs a numeric `at` and a `text`"); return; }
      const tone = ["good", "warn", "bad", "neutral"].includes(b.tone) ? (b.tone as Tone) : undefined;
      list.push({ at, text: b.text, tone });
    });
  } else if (isObj(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      const at = Number(k);
      if (!Number.isFinite(at)) { c.warn(where, `band key "${k}" should be a number (the value where this text starts)`); continue; }
      if (typeof v === "string") list.push({ at, text: v });
      else if (isObj(v) && typeof v.text === "string") list.push({ at, text: v.text, tone: v.tone });
      else c.warn(`${where} › ${k}`, "band should be a line of text");
    }
  } else {
    c.warn(where, "bands should be a map like `0: You feel fine.`");
  }
  list.sort((a, b) => a.at - b.at);
  return list.map((b, i) => ({ at: b.at, text: b.text, tone: b.tone ?? toneFor(i, list.length, good) }));
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
  const start = c.num(r.start ?? r.value, `${where} › start`, good === "low" ? min : k === "meter" ? max : min);
  const def: StatDef = {
    id,
    label: typeof r.label === "string" ? r.label : titleCase(id),
    kind: k,
    min, max, maxExpr,
    start: Math.min(max, Math.max(min, start)),
    good,
    perHour: c.num(r.per_hour ?? r.perHour, `${where} › per_hour`, 0),
    show: k === "hidden" ? "hidden" : show,
    narrator,
    bands: normBands(r.bands, good, `${where} › bands`, c),
    color: typeof r.color === "string" ? r.color : undefined,
    desc: typeof r.desc === "string" ? r.desc : typeof r.description === "string" ? r.description : undefined,
  };
  if (Array.isArray(r.grades) && r.grades.length) def.grades = r.grades.map(String);
  return def;
}

function emptyEffect(): Effect {
  return { stats: {}, set: {}, flags: {}, items: {}, rel: {}, addConditions: {}, removeConditions: [], decide: [] };
}

function normDecide(raw: unknown, where: string, c: Ctx, known: { stats: Set<string> }): DecideSpec[] {
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
      delete r.desc; delete r.label; delete r.weight;
      options.push({ id: oid, desc, weight: Math.max(0, weight), effect: normEffect(r, `${w} › ${oid}`, c, known) });
    }
    if (options.length < 2) { c.warn(w, "decide needs at least two options"); continue; }
    out.push({ id: typeof spec.id === "string" ? spec.id : id, ask: spec.ask, options });
  }
  return out;
}

/** Effects accept both a structured form and a flat shorthand: `{ fatigue: +20, hint: "..." }`. */
function normEffect(raw: unknown, where: string, c: Ctx, known: { stats: Set<string> }): Effect {
  const e = emptyEffect();
  if (raw === undefined || raw === null) return e;
  if (typeof raw === "string") { e.hint = raw; return e; }
  if (!isObj(raw)) { c.warn(where, "expected a map of effects"); return e; }
  for (const [k, v] of Object.entries(raw)) {
    const w = `${where} › ${k}`;
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
      case "move": case "go": case "location":
        e.move = String(v);
        break;
      case "time": case "minutes":
        e.time = c.num(v, w, 0);
        break;
      case "add_condition": case "add_conditions": case "condition":
        if (typeof v === "string") e.addConditions[v] = null;
        else if (Array.isArray(v)) for (const x of v) e.addConditions[String(x)] = null;
        else if (isObj(v)) for (const [x, d] of Object.entries(v)) e.addConditions[x] = d === null || d === true ? null : c.num(d, `${w} › ${x}`, 60);
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
      default:
        // Flat shorthand: a known stat name maps to a delta.
        if (known.stats.has(k)) { const x = c.expr(v, w); if (x !== undefined) e.stats[k] = x; }
        else c.warn(w, `"${k}" isn't a stat or a known effect (stats, set, flags, give, take, rel, move, time, add_condition, remove_condition, hint)`);
    }
  }
  return e;
}

function normCheck(raw: unknown, where: string, c: Ctx): CheckDef | undefined {
  if (!isObj(raw)) { c.warn(where, "check should be a map, e.g. `chance: 40 + athletics / 10`"); return undefined; }
  let style: CheckStyle;
  if (raw.chance !== undefined || raw.under !== undefined) style = "chance";
  else if (raw.style === "pbta" || raw.bands === "pbta" || raw.pbta !== undefined) style = "pbta";
  else if (raw.vs !== undefined || raw.dc !== undefined) style = "vs";
  else { c.err(where, "a check needs `chance:` (percent), `vs:` (difficulty) or `style: pbta`"); return undefined; }
  const dice = String(raw.dice ?? raw.roll ?? (style === "chance" ? "d100" : style === "pbta" ? "2d6" : "d20"));
  try { parseDice(dice); } catch (e) { c.err(`${where} › dice`, e instanceof DiceError ? e.message : "bad dice"); return undefined; }
  const target = c.expr(style === "chance" ? (raw.chance ?? raw.under) : raw.vs ?? raw.dc, `${where} › ${style === "chance" ? "chance" : "vs"}`);
  const add = c.expr(raw.add ?? raw.bonus ?? raw.mod ?? (style === "pbta" ? raw.pbta : undefined), `${where} › add`);
  return {
    style, dice, target, add,
    partialMargin: c.num(raw.partial ?? raw.partial_margin, `${where} › partial`, 0),
    label: typeof raw.label === "string" ? raw.label : typeof raw.skill === "string" ? raw.skill : undefined,
    crits: raw.crits !== false,
  };
}

const TIER_KEYS: Record<string, Tier> = {
  crit_success: "crit_success", critical_success: "crit_success", crit: "crit_success",
  success: "success", pass: "success",
  partial: "partial", mixed: "partial",
  fail: "fail", failure: "fail", miss: "fail",
  crit_fail: "crit_fail", critical_fail: "crit_fail", fumble: "crit_fail",
};

function normAction(id: string, raw: unknown, where: string, c: Ctx, known: { stats: Set<string> }, order: number): ActionDef | null {
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
  const check = raw.check !== undefined ? normCheck(raw.check, `${where} › check`, c) : undefined;
  if (!check && Object.keys(outcomes).length) c.warn(where, "has outcomes but no check — put always-on changes under `effects:`");
  const at = raw.at === undefined ? [] : Array.isArray(raw.at) ? raw.at.map(String) : [String(raw.at)];
  const when = raw.when !== undefined ? c.expr(raw.when, `${where} › when`) : undefined;
  return {
    id,
    label: typeof raw.label === "string" ? raw.label : titleCase(id),
    say: typeof raw.say === "string" ? raw.say : undefined,
    desc: typeof raw.desc === "string" ? raw.desc : typeof raw.description === "string" ? raw.description : undefined,
    group: typeof raw.group === "string" ? raw.group : undefined,
    at,
    when: when === undefined ? undefined : String(when),
    hidden: raw.hidden === true,
    time: raw.time !== undefined ? c.num(raw.time, `${where} › time`, 0) : undefined,
    cost: normEffect(raw.cost ?? raw.costs, `${where} › cost`, c, known),
    check,
    outcomes,
    effects: normEffect(raw.effects ?? raw.effect, `${where} › effects`, c, known),
    params,
    tags: Array.isArray(raw.tags) ? raw.tags.map((t: unknown) => String(t).toLowerCase()) : [],
    order: typeof raw.order === "number" ? raw.order : order,
  };
}

const SEXUAL_TAGS = new Set(["sexual", "sex", "nsfw", "lewd", "explicit", "erotic", "smut"]);

export function normalizeRuleset(raw: unknown): { ruleset: Ruleset | null; issues: Issue[] } {
  const c = new Ctx();
  if (!isObj(raw)) {
    c.err("Ruleset", "is empty or isn't a YAML map");
    return { ruleset: null, issues: c.issues };
  }

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
    people[id] = {
      id,
      name: typeof r.name === "string" ? r.name : titleCase(id),
      age: r.age !== undefined ? c.num(r.age, `Relationships › people › ${id} › age`, 0) : undefined,
      start,
      desc: typeof r.desc === "string" ? r.desc : undefined,
    };
  }

  // Items
  const invRaw: Raw = isObj(raw.inventory) ? raw.inventory : {};
  const items: Record<string, ItemDef> = {};
  for (const [id, it] of Object.entries(isObj(raw.items) ? raw.items : isObj(invRaw.items) ? invRaw.items : {})) {
    const r: Raw = isObj(it) ? it : typeof it === "string" ? { name: it } : {};
    items[id] = { id, name: typeof r.name === "string" ? r.name : titleCase(id), desc: r.desc, tags: Array.isArray(r.tags) ? r.tags.map(String) : [] };
  }

  // Locations
  const locations: Record<string, LocationDef> = {};
  for (const [id, l] of Object.entries(isObj(raw.locations) ? raw.locations : {})) {
    const r: Raw = isObj(l) ? l : typeof l === "string" ? { name: l } : {};
    locations[id] = {
      id,
      name: typeof r.name === "string" ? r.name : titleCase(id),
      desc: typeof r.desc === "string" ? r.desc : undefined,
      exits: Array.isArray(r.exits) ? r.exits.map(String) : [],
      travel: c.num(r.travel, `Locations › ${id} › travel`, 10),
    };
  }
  for (const l of Object.values(locations)) for (const x of l.exits) {
    if (!locations[x]) c.warn(`Locations › ${l.id} › exits`, `"${x}" isn't a declared location`);
  }

  // Conditions
  const conditions: Record<string, ConditionDef> = {};
  for (const [id, d] of Object.entries(isObj(raw.conditions) ? raw.conditions : {})) {
    const r: Raw = isObj(d) ? d : typeof d === "string" ? { label: d } : {};
    conditions[id] = {
      id,
      label: typeof r.label === "string" ? r.label : titleCase(id),
      tone: ["good", "warn", "bad", "neutral"].includes(r.tone) ? r.tone : "warn",
      desc: typeof r.desc === "string" ? r.desc : undefined,
      narrator: r.narrator === true,
    };
  }

  // Flags
  const flags: Record<string, FlagDef> = {};
  for (const [id, d] of Object.entries(isObj(raw.flags) ? raw.flags : {})) {
    const r: Raw = isObj(d) ? d : { start: d };
    flags[id] = { id, label: r.label, narrator: r.narrator === true, start: r.start ?? false };
  }

  // Start
  const startRaw: Raw = isObj(raw.start) ? raw.start : {};
  const startItems: Record<string, number> = {};
  const si = startRaw.items ?? invRaw.start;
  if (isObj(si)) for (const [it, n] of Object.entries(si)) startItems[it] = c.num(n, `Start › items › ${it}`, 1);
  else if (Array.isArray(si)) for (const it of si) startItems[String(it)] = 1;
  if (isObj(startRaw.stats)) for (const [s, v] of Object.entries(startRaw.stats)) {
    if (stats[s]) stats[s].start = c.num(v, `Start › stats › ${s}`, stats[s].start);
    else c.warn(`Start › stats › ${s}`, "isn't a declared stat");
  }
  let startLocation: string | null = typeof startRaw.location === "string" ? startRaw.location : null;
  if (!startLocation && Object.keys(locations).length) startLocation = Object.keys(locations)[0];
  if (startLocation && Object.keys(locations).length && !locations[startLocation]) {
    c.warn("Start › location", `"${startLocation}" isn't a declared location`);
  }

  // Clock
  const clockRaw: Raw = isObj(raw.clock) ? raw.clock : {};
  const clockStartRaw = startRaw.time ?? clockRaw.start ?? "Mon 08:00";
  const clockStart = parseClockStart(clockStartRaw, weekdays);
  if (clockStart === null) c.warn("Clock › start", `"${clockStartRaw}" should look like "Mon 07:30" or "Day 1 07:30"`);

  // Actions
  const actions: Record<string, ActionDef> = {};
  const actionOrder: string[] = [];
  let i = 0;
  for (const [id, a] of Object.entries(isObj(raw.actions) ? raw.actions : {})) {
    const def = normAction(id, a, `Actions › ${id}`, c, known, i++);
    if (def) { actions[id] = def; actionOrder.push(id); }
  }
  actionOrder.sort((a, b) => actions[a].order - actions[b].order);
  for (const a of Object.values(actions)) for (const loc of a.at) {
    if (Object.keys(locations).length && !locations[loc]) c.warn(`Actions › ${a.id} › at`, `"${loc}" isn't a declared location`);
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
  const moneyStat = typeof hudRaw.money === "string" ? hudRaw.money : statOrder.find((s) => stats[s].kind === "money");
  const bars = Array.isArray(hudRaw.bars) ? hudRaw.bars.map(String).filter((b: string) => {
    if (!stats[b]) { c.warn("HUD › bars", `"${b}" isn't a declared stat`); return false; }
    return true;
  }) : statOrder.filter((s) => stats[s].kind === "meter");

  const narrRaw: Raw = isObj(raw.narration) ? raw.narration : {};
  const playerRaw: Raw = isObj(raw.player) ? raw.player : {};

  const ruleset: Ruleset = {
    name: typeof raw.name === "string" ? raw.name : "Untitled ruleset",
    description: typeof raw.description === "string" ? raw.description : undefined,
    player: {
      name: typeof playerRaw.name === "string" ? playerRaw.name : undefined,
      age: playerRaw.age !== undefined ? c.num(playerRaw.age, "Player › age", 0) : undefined,
    },
    stats, statOrder, relStats, relStatOrder, people,
    peopleOpen: relRaw.open !== false && (relStatOrder.length > 0),
    items,
    itemsOpen: invRaw.open !== false,
    startItems,
    locations,
    locationsOpen: raw.locations_open === true || Object.keys(locations).length === 0,
    startLocation,
    conditions, flags, actions, actionOrder, triggers,
    clock: {
      enabled: clockRaw.enabled !== false,
      start: clockStart ?? 480,
      minutesPerAction: c.num(clockRaw.minutes_per_action, "Clock › minutes_per_action", 10),
      narratorMax: c.num(clockRaw.narrator_max ?? clockRaw.narrator, "Clock › narrator_max", 480),
      weekdays,
    },
    hud: { bars, money: moneyStat && stats[moneyStat] ? moneyStat : undefined, currency: typeof hudRaw.currency === "string" ? hudRaw.currency : "$" },
    narration: { notes: typeof narrRaw.notes === "string" ? narrRaw.notes : undefined, numbers: narrRaw.numbers === true },
  };

  // Hard floor: sexual content and minors never mix, whatever the tags or settings.
  const minors = [
    ...(ruleset.player.age !== undefined && ruleset.player.age < 18 ? ["the player"] : []),
    ...Object.values(people).filter((p) => p.age !== undefined && p.age < 18).map((p) => p.name),
  ];
  const sexualActions = Object.values(actions).filter((a) => a.tags.some((t) => SEXUAL_TAGS.has(t)));
  if (minors.length && sexualActions.length) {
    c.err("Ruleset", `declares characters under 18 (${minors.join(", ")}) alongside sexual actions — Warp won't run this ruleset`);
    return { ruleset: null, issues: c.issues };
  }

  return { ruleset, issues: c.issues };
}
