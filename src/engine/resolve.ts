// Turn resolution: the only place outcomes are decided.

import type { ExprEnv, Value } from "./expr.js";
import { evalBool, evalNumber, evaluate } from "./expr.js";
import { rollDice, seededRng, type Rng } from "./dice.js";
import type { ActionDef, CheckDef, DecideSpec, Effect, Ruleset, Tier } from "./ruleset.js";
import { normalize, sample } from "./decide.js";
import { slug } from "./ruleset.js";
import { applyEvent, cloneState, makeEnv, type EventSource, type GameState, type WarpEvent } from "./state.js";

export interface CheckResult {
  label: string;
  style: CheckDef["style"];
  dice: string;
  faces: { sides: number; value: number; kept: boolean }[];
  roll: number;
  add: number;
  total: number;
  target: number | null;
  tier: Tier;
  seed: string;
}

export interface TurnRecord {
  v: 1;
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
  /** Consistency check: probability the reply contradicts the state. */
  contradiction?: number;
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
}

export interface Intent {
  actionId: string;
  params?: Record<string, string>;
  /** choice = clicked; adjudicator = read from typed text; confirmed = player accepted a suggestion. */
  via: "choice" | "adjudicator" | "command" | "confirmed";
}

/** Mutable working copy: every pushed event is applied immediately so later formulas see it. */
class Working {
  events: WarpEvent[] = [];
  hints: string[] = [];
  decisions: DecisionResult[] = [];
  /** Decide specs reached without model odds — the backend asks and re-resolves. */
  needs: DecideSpec[] = [];
  constructor(
    public r: Ruleset,
    public s: GameState,
    private rng: Rng = seededRng("effects"),
    public seed = "effects",
    public odds: Record<string, Record<string, number>> = {},
    public scene: Record<string, boolean> = {},
  ) {}
  push(e: WarpEvent) {
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

/** Pseudo-actions for walking between connected locations: `go:<location id>`. */
export const TRAVEL_PREFIX = "go:";

export function travelTargets(r: Ruleset, s: GameState): string[] {
  const here = s.location ? r.locations[s.location] : undefined;
  return here ? here.exits.filter((x) => r.locations[x]) : [];
}

// ───────────────────────── availability & odds ─────────────────────────

export function paramValues(a: ActionDef, chosen?: Record<string, string>): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const p of a.params) {
    const key = chosen?.[p.id] && p.options[chosen[p.id]] !== undefined ? chosen[p.id] : p.default;
    out[p.id] = p.options[key];
  }
  return out;
}

export function isAvailable(r: Ruleset, s: GameState, a: ActionDef): boolean {
  if (a.at.length && !a.at.includes(s.location ?? "")) return false;
  if (a.when && !evalBool(a.when, makeEnv(r, s, paramValues(a)), true)) return false;
  return true;
}

export function availableActions(r: Ruleset, s: GameState, lines: string[] = []): ActionDef[] {
  const blocked = new Set(lines.map((l) => l.toLowerCase()));
  return r.actionOrder
    .map((id) => r.actions[id])
    .filter((a) => !a.tags.some((t) => blocked.has(t)) && isAvailable(r, s, a));
}

function tierFor(check: CheckDef, roll: ReturnType<typeof rollDice>, add: number, target: number | null): Tier {
  const total = roll.total + add;
  const sides = roll.primarySides;
  const single = roll.natural !== null;
  const critBand = Math.max(1, Math.floor(sides * 0.05));
  switch (check.style) {
    case "chance": {
      const t = target ?? 50;
      const ok = total <= t;
      if (check.crits && single && ok && roll.natural! <= critBand) return "crit_success";
      if (check.crits && single && !ok && roll.natural! > sides - critBand) return "crit_fail";
      return ok ? "success" : "fail";
    }
    case "vs": {
      const t = target ?? 10;
      if (check.crits && single && roll.natural === sides) return "crit_success";
      if (check.crits && single && roll.natural === 1) return "crit_fail";
      if (total >= t) return "success";
      if (check.partialMargin > 0 && total >= t - check.partialMargin) return "partial";
      return "fail";
    }
    case "pbta":
      if (check.crits && total >= 12) return "crit_success";
      if (total >= 10) return "success";
      if (total >= 7) return "partial";
      return "fail";
  }
}

function checkNumbers(r: Ruleset, s: GameState, a: ActionDef, params?: Record<string, string>) {
  const check = a.check!;
  const env = makeEnv(r, s, paramValues(a, params));
  const add = check.add !== undefined ? Math.round(evalNumber(check.add, env, 0)) : 0;
  let target: number | null = null;
  if (check.target !== undefined) {
    target = Math.round(evalNumber(check.target, env, check.style === "chance" ? 50 : 10));
    if (check.style === "chance") target = Math.max(0, Math.min(100, target));
  }
  return { add, target };
}

export interface Odds { success: number; partial: number }

/** Probability of success-or-better (and of partial) for the UI. Deterministic. */
export function odds(r: Ruleset, s: GameState, a: ActionDef, params?: Record<string, string>): Odds | null {
  const check = a.check;
  if (!check) return null;
  const { add, target } = checkNumbers(r, s, a, params);
  if (check.style === "chance" && check.dice === "d100" && target !== null) {
    return { success: target / 100, partial: 0 };
  }
  const rng = seededRng(`odds:${a.id}`);
  const N = 2000;
  let ok = 0, part = 0;
  for (let i = 0; i < N; i++) {
    const t = tierFor(check, rollDice(check.dice, rng), add, target);
    if (t === "success" || t === "crit_success") ok++;
    else if (t === "partial") part++;
  }
  return { success: ok / N, partial: part / N };
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

function effectToEvents(w: Working, e: Effect, src: EventSource, extra: Record<string, Value>) {
  const r = w.r;
  for (const [id, d] of Object.entries(e.stats)) {
    const v = evalNumber(d, w.env(extra), 0);
    if (v !== 0) w.push({ t: "stat", id, d: v, src });
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
  for (const [who, m] of Object.entries(e.rel)) {
    if (!w.s.people[who]) w.push({ t: "person", id: who, name: r.people[who]?.name ?? who, src });
    for (const [stat, d] of Object.entries(m)) {
      const v = evalNumber(d, w.env(extra), 0);
      if (v !== 0) w.push({ t: "rel", who, stat, d: v, src });
    }
  }
  if (e.move) w.push({ t: "move", to: e.move, src });
  for (const [id, dur] of Object.entries(e.addConditions)) {
    w.push({ t: "cond", id, on: true, until: dur === null ? null : w.s.minutes + dur, src });
  }
  for (const id of e.removeConditions) if (w.s.conditions[id]) w.push({ t: "cond", id, on: false, src });
  if (e.time) advanceTime(w, e.time, src);
  if (e.hint) w.hints.push(e.hint);
  for (const d of e.decide) decide(w, d, src, extra);
}

function decide(w: Working, d: DecideSpec, src: EventSource, extra: Record<string, Value>) {
  if (w.decisions.some((x) => x.id === d.id)) return; // one draw per decision per turn
  const keys = d.options.map((o) => o.id);
  const model = w.odds[d.id];
  if (!model) w.needs.push(d);
  const p = normalize(model ?? Object.fromEntries(d.options.map((o) => [o.id, o.weight])), keys);
  const picked = sample(p, seededRng(`${w.seed}:decide:${d.id}`));
  const opt = d.options.find((o) => o.id === picked)!;
  w.decisions.push({ id: d.id, ask: d.ask, picked, pickedDesc: opt.desc, p, source: model ? "model" : "weights" });
  effectToEvents(w, opt.effect, src, extra);
}

function advanceTime(w: Working, minutes: number, src: EventSource) {
  if (!w.r.clock.enabled || minutes <= 0) return;
  w.push({ t: "time", min: minutes, src });
  for (const id of w.r.statOrder) {
    const def = w.r.stats[id];
    if (!def.perHour) continue;
    const d = (def.perHour * minutes) / 60;
    if (Math.abs(d) > 1e-9) w.push({ t: "stat", id, d, src: "drift" });
  }
  for (const [id, c] of Object.entries(w.s.conditions)) {
    if (c.until !== null && c.until <= w.s.minutes) w.push({ t: "cond", id, on: false, src: "drift", note: "expired" });
  }
}

function runTriggers(w: Working, includeRepeat: boolean) {
  const fired = new Set<string>();
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (const t of w.r.triggers) {
      // Scene triggers only move when the decision model judged them this phase.
      if (t.whenScene && !(t.id in w.scene)) continue;
      const now = (t.when === undefined || evalBool(t.when, w.env(), false)) && (!t.whenScene || w.scene[t.id] === true);
      const prev = w.s.triggers[t.id] ?? false;
      if (now && !prev) {
        w.push({ t: "trig", id: t.id, v: true, src: "trigger" });
        effectToEvents(w, t.effects, "trigger", {});
        fired.add(t.id);
        changed = true;
      } else if (now && t.repeat && includeRepeat && !fired.has(t.id)) {
        effectToEvents(w, t.effects, "trigger", {});
        fired.add(t.id);
        changed = true;
      } else if (!now && prev) {
        w.push({ t: "trig", id: t.id, v: false, src: "trigger" });
        changed = true;
      }
    }
    if (!changed) break;
  }
}

// ───────────────────────── the turn ─────────────────────────

const TIER_FALLBACK: Record<Tier, Tier[]> = {
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
  veils?: string[];
  /** Model odds for decide blocks, by decide id. Missing ones fall back to author weights and are listed in `needs`. */
  odds?: Record<string, Record<string, number>>;
  /** Judged plain-language trigger conditions, by trigger id. */
  scene?: Record<string, boolean>;
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

function resolveInner(r: Ruleset, before: GameState, intent: Intent | null, opts: ResolveOptions, needs: DecideSpec[]): TurnRecord {
  const w = new Working(r, cloneState(before), seededRng(`${opts.seed}:fx`), opts.seed, opts.odds ?? {}, opts.scene ?? {});
  const rec: TurnRecord = { v: 1, hints: [], events: [], at: Date.now() };
  const a = intent ? r.actions[intent.actionId] : undefined;

  if (intent?.actionId.startsWith(TRAVEL_PREFIX)) {
    const to = intent.actionId.slice(TRAVEL_PREFIX.length);
    const dest = r.locations[to];
    if (dest) {
      const from = before.location ? r.locations[before.location] : undefined;
      rec.action = { id: intent.actionId, label: `Go to ${dest.name}`, via: intent.via };
      w.push({ t: "move", to, src: "action" });
      advanceTime(w, from?.travel ?? dest.travel, "action");
      if (dest.desc) w.hints.push(`Arriving at ${dest.name}: ${dest.desc}`);
    }
  } else if (a) {
    const extra = paramValues(a, intent!.params);
    rec.action = { id: a.id, label: a.label, via: intent!.via, ...(a.params.length ? { params: Object.fromEntries(a.params.map((p) => [p.id, intent!.params?.[p.id] ?? p.default])) } : {}) };
    effectToEvents(w, a.cost, "cost", extra);

    if (a.check) {
      const rng: Rng = seededRng(opts.seed);
      const { add, target } = checkNumbers(r, w.s, a, intent!.params);
      const roll = rollDice(a.check.dice, rng);
      const tier = tierFor(a.check, roll, add, target);
      rec.check = {
        label: a.check.label ?? a.label,
        style: a.check.style,
        dice: a.check.dice,
        faces: roll.dice,
        roll: roll.total,
        add,
        total: roll.total + add,
        target,
        tier,
        seed: opts.seed,
      };
      const key = TIER_FALLBACK[tier].find((t) => a.outcomes[t]);
      if (key) effectToEvents(w, a.outcomes[key]!, "check", extra);
      if (tier === "partial" && key === "success") w.hints.push("It works, but not cleanly — introduce a cost or complication.");
    } else {
      effectToEvents(w, a.effects, "action", extra);
    }

    advanceTime(w, a.time ?? r.clock.minutesPerAction, "action");
    const veils = new Set((opts.veils ?? []).map((v) => v.toLowerCase()));
    if (a.tags.some((t) => veils.has(t))) rec.veiled = true;
  }

  runTriggers(w, true);
  w.push({ t: "turn", src: "action" });
  rec.events = w.events;
  rec.hints = w.hints;
  if (w.decisions.length) {
    rec.decisions = w.decisions;
    for (const d of w.decisions) rec.hints.push(`${d.ask} → ${d.pickedDesc}`);
  }
  needs.push(...w.needs);
  return rec;
}

// ───────────────────────── narrator proposals ─────────────────────────

export interface Proposal {
  minutes?: number;
  stats?: Record<string, number>;
  rel?: Record<string, Record<string, number>>;
  people?: { id?: string; name: string }[];
  items?: Record<string, number>;
  move?: string;
  conditions?: { add?: string[]; remove?: string[] };
  flags?: Record<string, Value>;
}

function clampAbs(v: number, lim: number) {
  return Math.max(-lim, Math.min(lim, v));
}

function findPerson(r: Ruleset, s: GameState, key: string): string | null {
  const k = key.toLowerCase();
  for (const [id, p] of Object.entries(s.people)) if (id === k || p.name.toLowerCase() === k) return id;
  for (const p of Object.values(r.people)) if (p.id === k || p.name.toLowerCase() === k) return p.id;
  return null;
}

/** Turn a model's suggested changes into events, enforcing every limit the ruleset sets. */
export function applyProposal(r: Ruleset, before: GameState, p: Proposal): WarpEvent[] {
  const w = new Working(r, cloneState(before), seededRng(`narrator:${before.turn}`));
  const src: EventSource = "narrator";

  for (const person of p.people ?? []) {
    if (!person?.name || !r.peopleOpen) continue;
    if (findPerson(r, w.s, person.name)) continue;
    const id = slug(person.id || person.name);
    if (!w.s.people[id]) w.push({ t: "person", id, name: person.name, src });
  }

  for (const [id, d] of Object.entries(p.stats ?? {})) {
    const def = r.stats[id];
    if (!def || def.narrator <= 0 || typeof d !== "number" || !Number.isFinite(d)) continue;
    const v = clampAbs(d, def.narrator);
    if (v !== 0) w.push({ t: "stat", id, d: v, src });
  }

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
      const v = clampAbs(d, def.narrator);
      if (v !== 0) w.push({ t: "rel", who: id, stat, d: v, src });
    }
  }

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

  if (p.move) {
    const k = p.move.toLowerCase();
    const loc = Object.values(r.locations).find((l) => l.id === k || l.name.toLowerCase() === k);
    if (loc && loc.id !== w.s.location) w.push({ t: "move", to: loc.id, src });
    else if (!loc && r.locationsOpen && k !== (w.s.locationName ?? "").toLowerCase()) w.push({ t: "move", to: slug(p.move), name: p.move, src });
  }

  for (const id of p.conditions?.add ?? []) {
    const def = r.conditions[id];
    if (def?.narrator && !w.s.conditions[id]) w.push({ t: "cond", id, on: true, until: null, src });
  }
  for (const id of p.conditions?.remove ?? []) {
    const def = r.conditions[id];
    if (def?.narrator && w.s.conditions[id]) w.push({ t: "cond", id, on: false, src });
  }

  for (const [key, v] of Object.entries(p.flags ?? {})) {
    if (r.flags[key]?.narrator) w.push({ t: "flag", key, v, src });
  }

  if (typeof p.minutes === "number" && Number.isFinite(p.minutes) && p.minutes > 0) {
    advanceTime(w, Math.round(Math.min(p.minutes, r.clock.narratorMax)), src);
  }

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
