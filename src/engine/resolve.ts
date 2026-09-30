// Turn resolution: the only place outcomes are decided.

import type { ExprEnv, Value } from "./expr.js";
import { evalBool, evalNumber, evaluate } from "./expr.js";
import { rollDice, seededRng, type Rng } from "./dice.js";
import type { ActionDef, CheckDef, DecideSpec, Effect, RandomEventDef, Ruleset, Tier } from "./ruleset.js";
import { normalize, sample } from "./decide.js";
import { emptyEffect, slug } from "./ruleset.js";
import { applyEvent, cloneState, makeEnv, personName, timeKey, type EventSource, type GameState, type WarpEvent } from "./state.js";
import { presentPeople } from "./world.js";

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
  /** The label the player saw, for choices written on the spot (live choices). */
  label?: string;
}

/** A choice written for the moment: the label is the writer's, the tag decides what happens. */
export interface LiveChoice { label: string; tag: string; target?: string }

/** Mutable working copy: every pushed event is applied immediately so later formulas see it. */
class Working {
  events: WarpEvent[] = [];
  hints: string[] = [];
  decisions: DecisionResult[] = [];
  /** Outcome requested by an `end:` effect, applied at the end of the round. */
  pendingEnd: string | null = null;
  /** Decide specs reached without model odds — the backend asks and re-resolves. */
  needs: DecideSpec[] = [];
  /**
   * World happenings wait for the next turn instead of joining this one's directions.
   * Only turn resolution (before the reply is written) narrates them right away.
   */
  defer = true;
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
  if (s.encounter) return []; // no walking away mid-encounter; use its actions
  const here = s.location ? r.locations[s.location] : undefined;
  return here ? here.exits.filter((x) => r.locations[x]) : [];
}

// ───────────────────────── availability & odds ─────────────────────────

/** Per-person actions are addressed as "talk@robin". */
export const TARGET_SEP = "@";

export function paramValues(a: ActionDef, chosen?: Record<string, string>, target?: string): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const p of a.params) {
    const key = chosen?.[p.id] && p.options[chosen[p.id]] !== undefined ? chosen[p.id] : p.default;
    out[p.id] = p.options[key];
  }
  if (target) out.target = target;
  return out;
}

/** The actions in play: the encounter's moves during an encounter, the ruleset's actions otherwise. */
export function actionPool(r: Ruleset, s: GameState): { defs: Record<string, ActionDef>; order: string[]; tags: string[] } {
  const enc = s.encounter ? r.encounters[s.encounter.id] : undefined;
  if (enc) return { defs: enc.actions, order: enc.actionOrder, tags: enc.tags };
  return { defs: r.actions, order: r.actionOrder, tags: [] };
}

export function isAvailable(r: Ruleset, s: GameState, a: ActionDef, target?: string): boolean {
  if (!s.encounter && a.at.length && !a.at.includes(s.location ?? "")) return false;
  if (a.when && !evalBool(a.when, makeEnv(r, s, paramValues(a, undefined, target)), true)) return false;
  return true;
}

export function availableActions(r: Ruleset, s: GameState, lines: string[] = []): ActionDef[] {
  const blocked = new Set(lines.map((l) => l.toLowerCase()));
  const pool = actionPool(r, s);
  if (pool.tags.some((t) => blocked.has(t))) return [];
  return pool.order
    .map((id) => pool.defs[id])
    .filter((a) => !a.tags.some((t) => blocked.has(t)) && (a.perPerson || isAvailable(r, s, a)));
}

export interface ActionChoice { id: string; a: ActionDef; target?: string; label: string }

/** Concrete choices: per-person actions expand to one entry per person present. */
export function availableChoices(r: Ruleset, s: GameState, lines: string[] = []): ActionChoice[] {
  const out: ActionChoice[] = [];
  const here = presentPeople(r, s, makeEnv(r, s));
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

/** Look up an intent's action (and target) in whatever pool is live. */
export function findAction(r: Ruleset, s: GameState, actionId: string): { a: ActionDef; target?: string } | null {
  const [base, target] = actionId.split(TARGET_SEP);
  const a = base.startsWith(LIVE_PREFIX) ? r.liveChoices.tags[base.slice(LIVE_PREFIX.length)] : actionPool(r, s).defs[base];
  return a ? { a, ...(target ? { target } : {}) } : null;
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

function checkNumbers(r: Ruleset, s: GameState, a: ActionDef, params?: Record<string, string>, who?: string) {
  const check = a.check!;
  const env = makeEnv(r, s, paramValues(a, params, who));
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
export function odds(r: Ruleset, s: GameState, a: ActionDef, params?: Record<string, string>, who?: string): Odds | null {
  const check = a.check;
  if (!check) return null;
  const { add, target } = checkNumbers(r, s, a, params, who);
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
  for (const [key, m] of Object.entries(e.rel)) {
    // `rel: { target: … }` means whoever a per-person action is aimed at.
    const who = key === "target" && typeof extra.target === "string" ? extra.target : key;
    if (key === "target" && who === "target") continue;
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

  // Clothing
  for (const id of e.wear) {
    const slot = r.items[id]?.slot;
    if (slot && w.s.worn[slot] !== id) w.push({ t: "wear", slot, item: id, src });
  }
  for (const slot of e.undress) if (w.s.worn[slot]) w.push({ t: "wear", slot, item: null, src });
  for (const [slot, d] of Object.entries(e.damage)) {
    const item = w.s.worn[slot];
    const v = evalNumber(d, w.env(extra), 0);
    if (item && v > 0) w.push({ t: "dmg", item, d: -v, src });
  }

  // Encounters
  if (w.s.encounter) {
    for (const [stat, d] of Object.entries(e.foe)) {
      const v = evalNumber(d, w.env(extra), 0);
      if (v !== 0) w.push({ t: "foe", stat, d: v, src });
    }
    if (e.end) w.pendingEnd = e.end;
  }
  if (e.startEncounter && !w.s.encounter) startEncounter(w, e.startEncounter, src);

  for (const id of e.unlock) if (w.r.codex[id] && !w.s.codex[id]) w.push({ t: "codex", id, src });

  // World clocks, secrets and the event gauge.
  for (const [id, d] of Object.entries(e.front)) {
    if (!r.fronts[id]) continue;
    const v = evalNumber(d, w.env(extra), 0);
    if (v !== 0) w.push({ t: "clock", id, d: v, src });
  }
  for (const id of e.reveal) {
    const sec = r.secrets[id];
    const cur = w.s.secrets[id] ?? -1;
    if (sec && cur + 1 < sec.stages.length) w.push({ t: "secret", id, stage: cur + 1, src });
  }
  if (e.gauge !== undefined && r.randomEvents.enabled) {
    const v = evalNumber(e.gauge, w.env(extra), 0);
    if (v !== 0) w.push({ t: "gauge", d: v, src });
  }

  if (e.time) advanceTime(w, e.time, src);
  if (e.hint) announce(w, fillTarget(w, e.hint, extra));
  for (const d of e.decide) decide(w, d, src, extra);
}

// ───────────────────────── the living world ─────────────────────────

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

/** Surface every front stage the clock has reached. */
function openFrontStages(w: Working) {
  for (const f of Object.values(w.r.fronts)) {
    for (let n = (w.s.fronts[f.id]?.stage ?? -1) + 1; n < f.stages.length; n++) {
      const st = f.stages[n];
      if ((w.s.fronts[f.id]?.v ?? f.start) < st.at) break;
      w.push({ t: "stage", id: f.id, n, src: "world" });
      effectToEvents(w, st.effects, "world", {});
      if (st.surface) announce(w, `In the wider world: ${st.surface}`);
    }
  }
}

function eligibleEvents(w: Working): RandomEventDef[] {
  const now = timeKey(w.r, w.s);
  const unit = w.r.clock.enabled ? 1440 : 1;
  return Object.values(w.r.randomEvents.events).filter((e) => {
    if (e.weight <= 0) return false;
    const last = w.s.gauge.last[e.id];
    if (last !== undefined && (now - last) / unit < e.cooldownDays) return false;
    return !e.when || evalBool(e.when, w.env(), false);
  });
}

export const NEXT_EVENT = "world:next_event";

/** Which event comes next: the author's weights, sharpened by the decision model's sense of the story when it has one. */
function pickEvent(w: Working, candidates: RandomEventDef[]): string {
  const keys = candidates.map((e) => e.id);
  const model = w.odds[NEXT_EVENT];
  if (!model && !w.needs.some((n) => n.id === NEXT_EVENT)) {
    w.needs.push({
      id: NEXT_EVENT,
      ask: "Which of these would the story most plausibly bring next, given everything so far?",
      options: candidates.map((e) => ({ id: e.id, desc: e.text, weight: e.weight, effect: emptyEffect() })),
    });
  }
  const p = model
    ? normalize(Object.fromEntries(candidates.map((e) => [e.id, (model[e.id] ?? 0) * e.weight])), keys)
    : normalize(Object.fromEntries(candidates.map((e) => [e.id, e.weight])), keys);
  return sample(p, seededRng(`${w.seed}:event:${w.s.turn}:${Math.floor(w.s.minutes)}`));
}

/** The event gauge: fills with in-game time, shows an omen near the top, and fires at 100. */
function tickGauge(w: Working, days: number, turns: number) {
  const ev = w.r.randomEvents;
  if (!ev.enabled) return;
  let fillDays = days;
  if (w.s.gauge.rest > 0 && days > 0) {
    const used = Math.min(w.s.gauge.rest, days);
    w.push({ t: "rest", days: w.s.gauge.rest - used, src: "world" });
    fillDays -= used;
  }
  const candidates = eligibleEvents(w);
  // Nothing can happen right now: don't bank a full gauge to fire the moment something can.
  if (!candidates.length) {
    if (w.s.gauge.next) w.push({ t: "omen", id: null, src: "world" });
    return;
  }
  if (w.s.gauge.rest <= 0) {
    const env = w.env();
    const base = evalNumber(ev.perDay, env, 0) * Math.max(0, fillDays) + evalNumber(ev.perTurn, env, 0) * turns;
    if (base > 0) {
      const rng = seededRng(`${w.seed}:gauge:${w.s.turn}:${Math.floor(w.s.minutes)}`);
      const fill = base * (1 + ev.jitter * (rng() * 2 - 1));
      if (fill > 0) w.push({ t: "gauge", d: fill, src: "world" });
    }
  }
  const g = w.s.gauge;
  if (g.v >= 100) {
    const id = g.next && candidates.some((c) => c.id === g.next) ? g.next : pickEvent(w, candidates);
    const e = ev.events[id];
    w.push({ t: "happen", id, src: "world" });
    w.push({ t: "gauge", set: 0, src: "world" });
    if (w.s.gauge.next) w.push({ t: "omen", id: null, src: "world" });
    if (ev.restDays > 0) w.push({ t: "rest", days: ev.restDays, src: "world" });
    effectToEvents(w, e.effects, "world", {});
    announce(w, e.text);
  } else if (ev.omenAt > 0 && g.v >= ev.omenAt && !g.next) {
    w.push({ t: "omen", id: pickEvent(w, candidates), src: "world" });
  } else if (g.next && (ev.omenAt <= 0 || g.v < ev.omenAt)) {
    // Pushed back below the line by the story: the sign fades.
    w.push({ t: "omen", id: null, src: "world" });
  }
}

/** Time passed: world clocks run, stages surface, the event gauge fills. */
function tickWorld(w: Working, days: number, turns: number) {
  for (const f of Object.values(w.r.fronts)) {
    if (f.when && !evalBool(f.when, w.env(), false)) continue;
    let add = 0;
    if (days > 0) add += evalNumber(f.rate, w.env(), 0) * days;
    if (turns > 0) add += evalNumber(f.perTurn, w.env(), 0) * turns;
    f.pushes.forEach((p, i) => { if (w.scene[`front:${f.id}:${i}`] === true) add += p.add; });
    if (Math.abs(add) > 1e-9) w.push({ t: "clock", id: f.id, d: add, src: "world" });
  }
  openFrontStages(w);
  tickGauge(w, days, turns);
}

function startEncounter(w: Working, id: string, src: EventSource) {
  const enc = w.r.encounters[id];
  if (!enc) return;
  const foe = Object.fromEntries(enc.foe.stats.map((s) => [s.id, s.start]));
  w.push({ t: "enc", id, foe, src });
  announce(w, `An encounter begins: ${enc.name}${enc.desc ? ` — ${enc.desc}` : ""}. Opponent: ${enc.foe.name}.`);
  effectToEvents(w, enc.start, src, {});
}

function encounterOutcome(w: Working): string | null {
  const s = w.s.encounter;
  if (!s) return null;
  if (w.pendingEnd) return w.pendingEnd;
  const enc = w.r.encounters[s.id];
  for (const e of enc?.endWhen ?? []) if (evalBool(e.when, w.env(), false)) return e.outcome;
  return null;
}

function endEncounter(w: Working, outcome: string, src: EventSource) {
  const s = w.s.encounter;
  if (!s) return;
  const enc = w.r.encounters[s.id];
  w.pendingEnd = null;
  w.push({ t: "enc", id: null, outcome, src });
  announce(w, `The encounter ends: ${outcome.replace(/_/g, " ")}.`);
  const eff = enc?.outcomes[outcome];
  if (eff) effectToEvents(w, eff, src, {});
}

/** After the player's move: a round passes, the foe acts (odds from the decider or weights), then end checks. */
function encounterRound(w: Working, src: EventSource) {
  if (!w.s.encounter) return;
  let out = encounterOutcome(w);
  if (out) { endEncounter(w, out, src); return; }
  w.push({ t: "round", src });
  const enc = w.r.encounters[w.s.encounter.id];
  if (enc?.foeMoves) decide(w, enc.foeMoves, src, {});
  out = encounterOutcome(w);
  if (out) endEncounter(w, out, src);
}

function decide(w: Working, d: DecideSpec, src: EventSource, extra: Record<string, Value>) {
  if (w.decisions.some((x) => x.id === d.id)) return; // one draw per decision per turn
  const keys = d.options.map((o) => o.id);
  const model = w.odds[d.id];
  if (!model) w.needs.push(d);
  const p = normalize(model ?? Object.fromEntries(d.options.map((o) => [o.id, o.weight])), keys);
  const picked = sample(p, seededRng(`${w.seed}:decide:${d.id}`));
  const opt = d.options.find((o) => o.id === picked)!;
  w.decisions.push({ id: d.id, ask: fillTarget(w, d.ask, extra), picked, pickedDesc: fillTarget(w, opt.desc, extra), p, source: model ? "model" : "weights" });
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
  // Codex entries and feats unlock themselves when their formula first holds.
  for (const c of Object.values(w.r.codex)) {
    if (c.unlock && !w.s.codex[c.id] && evalBool(c.unlock, w.env(), false)) w.push({ t: "codex", id: c.id, src: "trigger" });
  }
  for (const f of Object.values(w.r.feats)) {
    if (!w.s.feats[f.id] && evalBool(f.unlock, w.env(), false)) {
      w.push({ t: "feat", id: f.id, src: "trigger" });
      effectToEvents(w, f.reward, "trigger", {});
    }
  }
  openSecrets(w);
  openFrontStages(w);
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
  w.defer = false;
  const rec: TurnRecord = { v: 1, hints: [], events: [], at: Date.now() };
  // First turn of a chat fixes its world seed (weather etc.).
  if (!w.s.seed) w.push({ t: "seed", v: opts.seed, src: "start" });
  // World happenings that surfaced after the last reply are this turn's news.
  if (before.notices.length) {
    w.hints.push(...before.notices);
    w.push({ t: "noticed", src: "world" });
  }
  const found = intent && !intent.actionId.startsWith(TRAVEL_PREFIX) ? findAction(r, before, intent.actionId) : null;
  const a = found?.a;
  const inEncounter = !!before.encounter;

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
    const who = found?.target;
    const extra = paramValues(a, intent!.params, who);
    const label = intent!.label ?? (who ? `${a.label} (${personName(r, before, who)})` : a.label);
    rec.action = { id: intent!.actionId, label, via: intent!.via, ...(a.params.length ? { params: Object.fromEntries(a.params.map((p) => [p.id, intent!.params?.[p.id] ?? p.default])) } : {}) };
    effectToEvents(w, a.cost, "cost", extra);

    if (a.check) {
      const rng: Rng = seededRng(opts.seed);
      const { add, target } = checkNumbers(r, w.s, a, intent!.params, who);
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

    // Encounter rounds are quick; ordinary actions take the ruleset's default.
    advanceTime(w, a.time ?? (inEncounter ? 1 : r.clock.minutesPerAction), "action");
    const veils = new Set((opts.veils ?? []).map((v) => v.toLowerCase()));
    const encTags = inEncounter ? r.encounters[before.encounter!.id]?.tags ?? [] : [];
    if ([...a.tags, ...encTags].some((t) => veils.has(t))) rec.veiled = true;
    if (inEncounter) encounterRound(w, "action");
  } else if (inEncounter && w.s.encounter) {
    // Typed a non-move during an encounter: the opponent still gets their turn.
    encounterRound(w, "action");
  }

  runTriggers(w, true);
  // The world moves with in-game time (without a clock, each turn counts as a day).
  const days = r.clock.enabled ? (w.s.minutes - before.minutes) / 1440 : 1;
  const worldBefore = w.events.length;
  tickWorld(w, days, 1);
  if (w.events.length > worldBefore) runTriggers(w, false);
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
  /** Newly introduced people, with where they stand toward the player right now. */
  people?: { id?: string; name: string; feelings?: Record<string, number> }[];
  /** One-time starting feelings for tracked people who have never been calibrated. */
  feelings?: Record<string, Record<string, number>>;
  items?: Record<string, number>;
  move?: string;
  conditions?: { add?: string[]; remove?: string[] };
  flags?: Record<string, Value>;
  /** Slots the player's clothes came off from. */
  undress?: string[];
  /** Owned clothing the player put on. */
  wear?: string[];
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
    const known = findPerson(r, w.s, person.name);
    if (known) {
      // Already tracked: treat any feelings as a starting read if they've never been calibrated.
      if (person.feelings) calibrate(w, known, person.feelings, src);
      continue;
    }
    const id = slug(person.id || person.name);
    if (!w.s.people[id]) w.push({ t: "person", id, name: person.name, src });
    calibrate(w, id, person.feelings ?? {}, src);
  }
  for (const [who, feelings] of Object.entries(p.feelings ?? {})) {
    const id = findPerson(r, w.s, who);
    if (id) calibrate(w, id, feelings ?? {}, src);
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

  if (r.wardrobe.enabled && r.wardrobe.narrator) {
    for (const slot of p.undress ?? []) if (w.s.worn[slot]) w.push({ t: "wear", slot, item: null, src });
    for (const id of p.wear ?? []) {
      const slot = r.items[id]?.slot;
      if (slot && w.s.items[id] > 0 && w.s.worn[slot] !== id) w.push({ t: "wear", slot, item: id, src });
    }
  }

  if (typeof p.minutes === "number" && Number.isFinite(p.minutes) && p.minutes > 0) {
    advanceTime(w, Math.round(Math.min(p.minutes, r.clock.narratorMax)), src);
  }

  runTriggers(w, false);
  // Time the story itself covered moves the world too; whatever surfaces is told next turn.
  if (r.clock.enabled && w.s.minutes > before.minutes) {
    const n = w.events.length;
    tickWorld(w, (w.s.minutes - before.minutes) / 1440, 0);
    if (w.events.length > n) runTriggers(w, false);
  }
  return w.events;
}

/** Apply a manual HUD edit (player adjusting a number by hand). */
export function manualSet(r: Ruleset, before: GameState, stat: string, value: number): WarpEvent[] {
  const w = new Working(r, cloneState(before));
  if (r.stats[stat]) w.push({ t: "stat", id: stat, set: value, src: "manual" });
  runTriggers(w, false);
  return w.events;
}

/** Put on (item) or take off (null) clothing from the wardrobe panel. */
export function changeClothes(r: Ruleset, before: GameState, slot: string, item: string | null): WarpEvent[] | string {
  if (!r.wardrobe.enabled) return "This ruleset has no wardrobe.";
  if (item) {
    const def = r.items[item];
    if (!def?.slot) return "That isn't clothing.";
    if (!(before.items[item] > 0)) return "You don't have that.";
    slot = def.slot;
  } else if (!before.worn[slot]) {
    return "Nothing is worn there.";
  }
  const w = new Working(r, cloneState(before));
  w.push({ t: "wear", slot, item, src: "manual" });
  runTriggers(w, false);
  return w.events;
}

/** Why a perk can't be bought right now, or null if it can. */
export function perkBlocker(r: Ruleset, s: GameState, id: string): string | null {
  const p = r.perks[id];
  if (!p) return "Unknown perk.";
  if (s.perks[id]) return "Already taken.";
  if (p.requires && !evalBool(p.requires, makeEnv(r, s), false)) return "Requirements not met.";
  if (r.perkPoints && (s.stats[r.perkPoints] ?? 0) < p.cost) return `Needs ${p.cost} point${p.cost === 1 ? "" : "s"}.`;
  return null;
}

export function buyPerk(r: Ruleset, before: GameState, id: string): WarpEvent[] | string {
  const blocked = perkBlocker(r, before, id);
  if (blocked) return blocked;
  const p = r.perks[id];
  const w = new Working(r, cloneState(before));
  w.push({ t: "perk", id, src: "manual" });
  if (r.perkPoints && p.cost) w.push({ t: "stat", id: r.perkPoints, d: -p.cost, src: "manual" });
  effectToEvents(w, p.effects, "manual", {});
  runTriggers(w, false);
  return w.events;
}

/** "{target}" in hints and questions becomes the name of the person a per-person action is aimed at. */
function fillTarget(w: Working, text: string, extra: Record<string, Value>): string {
  if (typeof extra.target !== "string" || !extra.target || !text.includes("{target}")) return text;
  return text.replace(/\{target\}/g, personName(w.r, w.s, extra.target));
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
