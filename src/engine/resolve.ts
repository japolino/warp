// Turn resolution: the only place outcomes are decided.

import type { ExprEnv, Value } from "./expr.js";
import { evalBool, evalNumber, evaluate } from "./expr.js";
import { diceDistribution, rollDice, seededRng, type DiceRoll, type Rng } from "./dice.js";
import type { ActionDef, CheckDef, DecideSpec, Effect, LocationDef, NarratorGate, RandomEventDef, Ruleset, SeenReaction, Tier } from "./ruleset.js";
import { SEEN_REACTIONS } from "./ruleset.js";
import { normalize, sample } from "./decide.js";
import { emptyEffect, slug } from "./ruleset.js";
import { applyEvent, cloneState, foeName, formatClock, itemName, kinAge, makeEnv, personName, timeKey, type EventSource, type GameState, type WarpEvent } from "./state.js";
import { checkGains, checkStats, DIFFICULTY_WORD, hardnessFrom, IMPROV, IMPROV_DIRECTION, improvAction, isDifficulty, practise, trainingGain } from "./freeform.js";
import { endingDirection } from "./chronicle.js";
import { exposedSlots, isIndoors, presentPeople, revealOf, SCENE_HOLDS, sceneWord } from "./world.js";
import { DATE_PREFIX } from "./date/types.js";
import { activeSession, ADULT_KEY, resolveDate } from "./date/talk.js";
import { JOB_PREFIX, obligationLife, PAY_PREFIX, resolveWork } from "./work.js";
import { decodeProposal } from "./proposal.js";

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
  commandId?: string;
  /** State and definitions this outcome was resolved against. */
  parent?: string;
  rulesRevision?: string;
  /** Accepted inputs are saved so replay never consults a provider. */
  inputs?: { seed: string; scene: Record<string, boolean>; odds: Record<string, Record<string, number>>; encounter?: { id: string; foe?: string } };
  /** Additional operations attached to this message, with their own checks and decisions. */
  operations?: TurnRecord[];
  rejected?: string[];
  /** Places invented by exploration belong to the exact branch that found them. */
  locations?: Record<string, LocationDef>;
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
  /** Exploring found somewhere new: the backend writes the place and moves the player there. */
  discover?: { from: string };
  /** The player character's mind overruled the player this turn. */
  mind?: { id: string; cause: string; kind: "fail" | "alter" | "redirect"; meant: string; chance: number };
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
  fallback?: string;
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

/** A choice written for the moment: the label is the writer's, the tag decides what happens. */
export interface LiveChoice { label: string; tag: string; target?: string }

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

/** Exploring the current place for somewhere new: `explore:`. */
export const EXPLORE = "explore:";

/** Can the player explore here for somewhere new? */
export function canExplore(r: Ruleset, s: GameState): boolean {
  const d = r.discovery;
  if (!d.enabled || !s.location || s.encounter || s.dungeon || s.job || s.date || s.ended) return false;
  if (s.discovered.length >= d.max) return false;
  return !d.at.length || d.at.includes(s.location) || s.discovered.includes(s.location);
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

export function isAvailable(r: Ruleset, s: GameState, a: ActionDef, target?: string, params?: Record<string, string>): boolean {
  if (!s.encounter && a.at.length && !a.at.includes(s.location ?? "")) return false;
  if (a.when && !evalBool(a.when, makeEnv(r, s, paramValues(a, params, target)), false)) return false;
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
  if (base.startsWith(IMPROV)) {
    const a = improvAction(r, s, base);
    return a ? { a } : null;
  }
  const a = base.startsWith(LIVE_PREFIX) ? r.liveChoices.tags[base.slice(LIVE_PREFIX.length)] : actionPool(r, s).defs[base];
  return a ? { a, ...(target ? { target } : {}) } : null;
}

/** Validate at execution time: choices stored in old messages can become unavailable. */
export function validateIntent(r: Ruleset, s: GameState, intent: Intent, lines: string[] = []): string | null {
  if (typeof intent.actionId !== "string" || intent.actionId.length > 300) return "Invalid action.";
  const id = intent.actionId;
  if (s.ended?.told && id !== RUN_EPILOGUE) return "This playthrough has ended.";
  if (id.startsWith(TRAVEL_PREFIX)) return travelTargets(r, s).includes(id.slice(TRAVEL_PREFIX.length)) ? null : "That destination is not reachable now.";
  if (id === EXPLORE) return canExplore(r, s) ? null : "Exploration is not available now.";
  if (id === "dungeon" && s.dungeon) return null;
  // These subsystems validate their own session, balances and concrete choices.
  if (id.startsWith(DATE_PREFIX) || id.startsWith(PAY_PREFIX) || id.startsWith(JOB_PREFIX) || id === RUN_EPILOGUE) return null;
  const found = findAction(r, s, id);
  if (!found) return "Unknown action.";
  const { a, target } = found;
  if (a.perPerson && (!target || !presentPeople(r, s, makeEnv(r, s)).includes(target))) return "That person is not present now.";
  if (!a.perPerson && target && !presentPeople(r, s, makeEnv(r, s)).includes(target)) return "That person is not present now.";
  const blocked = new Set(lines.map((l) => l.toLowerCase()));
  if ([...a.tags, ...actionPool(r, s).tags].some((t) => blocked.has(t))) return "This action is blocked by your lines.";
  for (const [key, value] of Object.entries(intent.params ?? {})) {
    const param = a.params.find((p) => p.id === key);
    if (!param || !Object.hasOwn(param.options, value)) return "Invalid action parameter.";
  }
  return isAvailable(r, s, a, target, intent.params) ? null : "This action is not available now.";
}

function tierFor(check: CheckDef, roll: Pick<DiceRoll, "total" | "natural" | "primarySides">, add: number, target: number | null): Tier {
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

export interface Odds { success: number; partial: number; approximate?: boolean }

/** Probability of success-or-better (and of partial) for the UI. Deterministic. */
export function odds(r: Ruleset, s: GameState, a: ActionDef, params?: Record<string, string>, who?: string): Odds | null {
  const check = a.check;
  if (!check) return null;
  const randomCost = /\broll\s*\(/.test(JSON.stringify(a.cost)) || a.cost.decide.length > 0;
  const paid = new Working(r, cloneState(s), seededRng(`odds:${a.id}:cost`));
  effectToEvents(paid, a.cost, "cost", paramValues(a, params, who));
  const { add, target } = checkNumbers(r, paid.s, a, params, who);
  const exact = randomCost ? null : diceDistribution(check.dice);
  if (exact) {
    let success = 0, partial = 0;
    for (const roll of exact) {
      const tier = tierFor(check, roll, add, target);
      if (tier === "success" || tier === "crit_success") success += roll.p;
      else if (tier === "partial") partial += roll.p;
    }
    return { success: Math.min(1, success), partial: Math.min(1, partial) };
  }
  const rng = seededRng(`odds:${a.id}`);
  const N = 2000;
  let ok = 0, part = 0;
  for (let i = 0; i < N; i++) {
    let numbers = { add, target };
    if (randomCost) {
      const sample = new Working(r, cloneState(s), rng);
      effectToEvents(sample, a.cost, "cost", paramValues(a, params, who));
      numbers = checkNumbers(r, sample.s, a, params, who);
    }
    const t = tierFor(check, rollDice(check.dice, rng), numbers.add, numbers.target);
    if (t === "success" || t === "crit_success") ok++;
    else if (t === "partial") part++;
  }
  return { success: ok / N, partial: part / N, approximate: true };
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
  // Body: direct trait changes, then transformations stage by stage (each step rolls its chance).
  for (const [part, traits] of Object.entries(e.body)) for (const [trait, v] of Object.entries(traits)) {
    if ((w.s.body[part]?.[trait] ?? null) !== v) w.push({ t: "body", part, trait, v, src });
  }
  for (const [id, n] of Object.entries(e.transform)) {
    const t = r.body.transforms[id];
    if (!t) continue;
    const steps = Math.round(evalNumber(n, w.env(extra), 0));
    for (let i = 0; i < steps; i++) {
      const stage = w.s.tf[id] ?? 0;
      if (stage >= t.stages.length) break;
      const chance = Math.max(0, Math.min(100, evalNumber(t.chance, w.env(extra), 100)));
      if (seededRng(`${w.seed}:tf:${id}:${stage}:${w.s.turn}`)() * 100 >= chance) {
        announce(w, `${t.label}: nothing changes this time.`);
        break;
      }
      w.push({ t: "tf", id, stage: stage + 1, src });
      for (const [part, traits] of Object.entries(t.stages[stage].set)) for (const [trait, v] of Object.entries(traits)) {
        if ((w.s.body[part]?.[trait] ?? null) !== v) w.push({ t: "body", part, trait, v, src });
      }
      announce(w, t.stages[stage].text ?? `${t.label}: {{user}}'s body changes (stage ${stage + 1} of ${t.stages.length}).`);
    }
  }
  if (e.conceive) conceive(w, e.conceive, extra, src);
  for (const [id, d] of Object.entries(e.arc)) {
    const front = r.companions[id]?.arc;
    if (!front) continue;
    const v = evalNumber(d, w.env(extra), 0);
    if (v !== 0) w.push({ t: "clock", id: front, d: v, src });
  }
  for (const [a, m] of Object.entries(e.bond)) for (const [b, d] of Object.entries(m)) {
    const v = evalNumber(d, w.env(extra), 0);
    if (v !== 0 && a !== b) w.push({ t: "bond", a, b, d: v, src });
  }
  if (e.momentum !== undefined && w.s.encounter?.momentum !== undefined) {
    const v = evalNumber(e.momentum, w.env(extra), 0);
    if (v !== 0) w.push({ t: "swing", d: v, src });
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
      because(w, `World: ${f.label} reached stage ${n + 1}`, () => {
        w.push({ t: "stage", id: f.id, n, src: "world" });
        effectToEvents(w, st.effects, "world", {});
      });
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
    because(w, `Random event: ${e.label}`, () => effectToEvents(w, e.effects, "world", {}));
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

// ───────────────────────── being seen ─────────────────────────

const SEEN_DESC: Record<SeenReaction, string> = {
  unnoticed: "Doesn't notice", glance: "Notices, then looks away", interested: "Is interested — keeps looking",
  disapproving: "Disapproves", predatory: "Pays the wrong kind of attention",
};

/** What others can see of {{user}} right now, in words. */
function lookOf(r: Ruleset, s: GameState): string {
  const exposed = exposedSlots(r, s);
  const reveal = revealOf(r, s);
  const parts = [
    exposed.length ? `exposed: ${exposed.join(", ")}` : null,
    reveal > 0 ? `revealing clothes (${reveal})` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : "dressed ordinarily";
}

/**
 * Everyone present reacts to how {{user}} looks, one by one — the decision model
 * reads each person; the engine rolls. Only adults are ever asked; children and
 * anyone known to be under 18 are never part of it.
 */
function beingSeen(w: Working) {
  const r = w.r;
  const ob = r.observers;
  if (!ob.enabled || !w.s.location || !evalBool(ob.when, w.env(), false)) return;
  const look = lookOf(r, w.s);
  const here = new Set(presentPeople(r, w.s, makeEnv(r, w.s)));
  const watchers = Object.keys(w.s.people).filter((id) => here.has(id) || (r.people[id] && !r.people[id].schedule.length));
  const exposure = exposedSlots(r, w.s).length + revealOf(r, w.s) / 3;
  const prior: Record<SeenReaction, number> = {
    unnoticed: Math.max(0.5, 3 - exposure), glance: 2, interested: 0.6 + exposure * 0.4, disapproving: 0.5 + exposure * 0.3, predatory: 0.1 + exposure * 0.1,
  };
  const where = w.s.locationName ?? w.s.location;
  const lines: string[] = [];
  for (const who of watchers) {
    if (!knownAdult(w, who)) continue;
    const name = personName(r, w.s, who);
    const spec: DecideSpec = {
      id: `seen:${who}`,
      ask: `${name} can see {{user}} (${look}). Given who ${name} is, and the moment, how do they react?`,
      options: SEEN_REACTIONS.map((x) => ({ id: x, desc: SEEN_DESC[x], weight: prior[x], effect: ob.reactions[x] ?? emptyEffect() })),
    };
    const model = w.odds[spec.id];
    if (!model && !w.needs.some((n) => n.id === spec.id)) w.needs.push(spec);
    const p = normalize(model ? Object.fromEntries(SEEN_REACTIONS.map((x) => [x, Math.sqrt(prior[x]) * Math.max(model[x] ?? 0, 1e-6)])) : prior, SEEN_REACTIONS);
    const picked = sample(p, seededRng(`${w.seed}:seen:${who}`)) as SeenReaction;
    w.decisions.push({ id: spec.id, ask: `How does ${name} react to how {{user}} looks?`, picked, pickedDesc: SEEN_DESC[picked], p, source: model ? "model" : "weights", descs: SEEN_DESC });
    if (picked === "unnoticed") continue;
    w.push({ t: "seen", who, what: look, where, src: "world", why: `${name} saw {{user}} (${look})` });
    const eff = ob.reactions[picked];
    if (eff) because(w, `${name}: ${SEEN_DESC[picked].toLowerCase()}`, () => effectToEvents(w, eff, "world", { target: who }));
    lines.push(`${name}: ${SEEN_DESC[picked].toLowerCase()}`);
  }
  if (ob.crowd > 0 && !isIndoors(r, w.s)) {
    const rng = seededRng(`${w.seed}:crowd:${w.s.turn}`);
    const crowd = Array.from({ length: ob.crowd }, () => {
      const q = normalize(prior, SEEN_REACTIONS);
      return sample(q, rng) as SeenReaction;
    }).filter((x) => x !== "unnoticed");
    if (crowd.length) lines.push(`passers-by: ${crowd.map((x) => SEEN_DESC[x].toLowerCase()).join("; ")}`);
  }
  if (lines.length) w.hints.push(`How people react to {{user}} (${look}) — show it, individually: ${lines.join(" · ")}.`);
}

/** Word spreads: once a day, witnesses tell the people they're close to. */
function rumours(w: Working, before: GameState) {
  const r = w.r;
  if (!r.observers.enabled || !r.observers.rumours) return;
  if (Math.floor(w.s.minutes / 1440) <= Math.floor(before.minutes / 1440)) return;
  for (const [who, rec] of Object.entries(before.seen)) {
    if (rec.heard) continue;
    for (const [other, v] of Object.entries(w.s.bonds[who] ?? {})) {
      if (v < 25 || w.s.seen[other] || !w.s.people[other]) continue;
      w.push({ t: "seen", who: other, what: rec.what, where: rec.where, heard: true, src: "world", why: `${personName(r, w.s, who)} told ${personName(r, w.s, other)}` });
      announce(w, `Word gets around: ${personName(r, w.s, who)} told ${personName(r, w.s, other)} about seeing {{user}} (${rec.what}) at ${rec.where}.`);
    }
  }
}

// ───────────────────────── lineage ─────────────────────────

/** Known to be an adult? Declared ages first; otherwise the decision model is asked once (unsure = no). */
function knownAdult(w: Working, who: string): boolean {
  if (who === "player") return w.r.player.age === undefined || w.r.player.age >= 18;
  if (w.s.kin[who]) return false;
  const age = w.r.people[who]?.age;
  if (age !== undefined) return age >= 18;
  const known = w.s.dating.prefs[who]?.[ADULT_KEY];
  if (known !== undefined) return known > 0;
  const name = personName(w.r, w.s, who);
  const id = `date:adult:${who}`;
  const model = w.odds[id];
  if (!model) {
    if (!w.needs.some((n) => n.id === id)) w.needs.push({ id, ask: `Is ${name} an adult (18 or older), going by the story and the character card?`, options: [
      { id: "adult", desc: "Clearly an adult", weight: 1, effect: emptyEffect() },
      { id: "minor", desc: "Under 18", weight: 1, effect: emptyEffect() },
      { id: "unclear", desc: "Can't tell", weight: 1, effect: emptyEffect() },
    ] });
    return false;
  }
  const adult = (model.adult ?? 0) >= 0.8;
  w.push({ t: "dt_pref", who, key: ADULT_KEY, v: adult ? 1 : -1, src: "action" });
  return adult;
}

function conceive(w: Working, c: NonNullable<Effect["conceive"]>, extra: Record<string, Value>, src: EventSource) {
  const r = w.r;
  if (!r.lineage.enabled || w.s.pregnancy) return;
  const partner = c.with === "target" ? (typeof extra.target === "string" ? extra.target : "") : c.with;
  if (!partner || !w.s.people[partner]) return;
  const carrier = c.carrier === "partner" ? partner : c.carrier;
  // The hard floor: only ever between two people known to be adults (and never the player's own children).
  if (!knownAdult(w, "player") || !knownAdult(w, partner)) return;
  const chance = Math.max(0, Math.min(100, evalNumber(c.chance, w.env(extra), 100)));
  if (seededRng(`${w.seed}:conceive:${w.s.turn}`)() * 100 >= chance) return;
  w.push({ t: "conceive", carrier, with: partner, src });
}

/** Pregnancy stages and birth, and children coming of age. */
function lineageLife(w: Working) {
  const r = w.r;
  if (!r.lineage.enabled) return;
  const p = w.s.pregnancy;
  if (p) {
    const weeks = (w.s.minutes - p.since) / 1440 / 7;
    r.lineage.stages.forEach((st, i) => {
      if (i + 1 <= (w.s.pregnancy?.told ?? 0) || weeks < st.week) return;
      w.push({ t: "preg_stage", n: i + 1, src: "world" });
      because(w, `Pregnancy, week ${st.week}`, () => effectToEvents(w, st.effects, "world", {}));
      announce(w, st.text.replace(/\{carrier\}/g, p.carrier === "player" ? "{{user}}" : personName(r, w.s, p.carrier)));
    });
    if (weeks >= r.lineage.weeks) {
      const n = Object.keys(w.s.kin).length + 1;
      const rng = seededRng(`${w.seed}:birth:${n}`);
      const taken = new Set(Object.values(w.s.kin).map((k) => k.name));
      const names = r.lineage.names.filter((x) => !taken.has(x));
      const name = names.length ? names[Math.floor(rng() * names.length)] : `Child ${n}`;
      const sex = rng() < 0.5 ? "girl" : "boy";
      const body = Object.fromEntries(r.lineage.inherit.filter((part) => w.s.body[part]).map((part) => [part, { ...w.s.body[part] }]));
      const id = `child_${n}`;
      w.push({ t: "birth", id, kin: { name, sex, born: w.s.minutes, parents: ["player", p.with], body, joined: false }, src: "world" });
      const other = personName(r, w.s, p.with === "player" ? p.carrier : p.with);
      w.push({ t: "news", text: `${name} is born — a ${sex}, ${other}'s child with {{user}}.`, src: "world" });
      announce(w, `The baby is born: a ${sex}, named ${name} — ${other}'s child with {{user}}. ${name} is an infant: family, never part of anything romantic or sexual.`);
    }
  }
  for (const [id, k] of Object.entries(w.s.kin)) {
    if (k.joined || kinAge(r, w.s, id) < r.lineage.joinAt) continue;
    w.push({ t: "kin_join", id, src: "world" });
    announce(w, `${k.name}, {{user}}'s ${k.sex === "girl" ? "daughter" : "son"}, is grown up now (${kinAge(r, w.s, id)}) and steps into the story as an adult.`);
  }
}

// ───────────────────────── companions ─────────────────────────

/** The relationship stat that means "how much they like you" (for jealousy). */
function loveStat(r: Ruleset): string | null {
  if (r.dating.enabled) return r.dating.love;
  return r.relStatOrder.find((id) => r.relStats[id].good === "high") ?? null;
}

/**
 * Companions live between replies: each in-game day they make a choice of their own
 * (the decision model weighs it), and they notice when the player grows close to a rival.
 */
function companionLife(w: Working, before: GameState) {
  const r = w.r;
  const comps = Object.values(r.companions);
  if (!comps.length) return;
  const d0 = Math.floor(before.minutes / 1440);
  const d1 = r.clock.enabled ? Math.floor(w.s.minutes / 1440) : d0;
  const n = w.events.length;
  for (let day = d0 + 1; day <= Math.min(d1, d0 + 3); day++) {
    for (const c of comps) {
      if (!c.daily || !w.s.people[c.id]) continue;
      const spec = c.daily;
      const keys = spec.options.map((o) => o.id);
      const model = w.odds[spec.id];
      if (!model && !w.needs.some((n) => n.id === spec.id)) w.needs.push(spec);
      const p = normalize(model ?? Object.fromEntries(spec.options.map((o) => [o.id, o.weight])), keys);
      const picked = sample(p, seededRng(`${w.seed}:daily:${c.id}:${day}`));
      const opt = spec.options.find((o) => o.id === picked)!;
      because(w, `${personName(r, w.s, c.id)}'s own choice: ${opt.desc}`, () => effectToEvents(w, opt.effect, "world", {}));
      const line = `${personName(r, w.s, c.id)}: ${opt.desc.charAt(0).toLowerCase()}${opt.desc.slice(1)}`;
      w.push({ t: "news", text: line, src: "world" });
      announce(w, `Off-screen, ${line}. (Their own choice — it may come up later.)`);
    }
  }
  // Their choices can carry an arc to its next stage.
  if (w.events.length > n) runTriggers(w, false);
  const love = loveStat(r);
  if (!love) return;
  for (const c of comps) {
    if (!c.jealousOf.length || !w.s.people[c.id]) continue;
    const rivals = c.jealousOf.includes("anyone") ? Object.keys(w.s.people).filter((id) => id !== c.id) : c.jealousOf.filter((id) => id !== c.id);
    const gains = rivals.map((id) => [id, (w.s.rel[id]?.[love] ?? 0) - (before.rel[id]?.[love] ?? 0)] as const).filter(([, g]) => g >= 1);
    if (!gains.length) continue;
    const total = gains.reduce((a, [, g]) => a + g, 0);
    const drop = Math.max(1, Math.round(total / 2));
    const jealous = `${personName(r, w.s, c.id)} is jealous of ${gains.map(([id]) => personName(r, w.s, id)).join(" and ")}`;
    because(w, jealous, () => {
    w.push({ t: "rel", who: c.id, stat: love, d: -drop, src: "world" });
    for (const [id, g] of gains) w.push({ t: "bond", a: c.id, b: id, d: -Math.max(1, Math.round(g / 2)), src: "world" });
    });
    announce(w, `${personName(r, w.s, c.id)} notices {{user}} getting closer to ${gains.map(([id]) => personName(r, w.s, id)).join(" and ")} — and it stings.`);
  }
}

// ───────────────────────── checkpoints, loops and endings ─────────────────────────

/** Endings, the time loop and the daily autosave — checked after anything that changes the state. */
function checkRun(w: Working, before: GameState) {
  const r = w.r;
  if (!r.checkpoints.enabled) return;
  if (!w.s.ended) for (const e of Object.values(r.endings)) {
    if (!evalBool(e.when, w.env(), false)) continue;
    // Reached while resolving a turn, the reply about to be written tells it; otherwise the next one does.
    w.push({ t: "end", id: e.id, told: !w.defer, src: "trigger" });
    announce(w, endingDirection(r, w.s, e));
    return;
  }
  if (w.s.ended) return;
  const loop = r.checkpoints.loop;
  if (loop && evalBool(loop.when, w.env(), false)) {
    const to = loop.to !== "start" && w.s.saves[loop.to] ? loop.to : "start";
    const label = to === "start" ? "the very beginning" : w.s.saves[to].label;
    because(w, "Time loop", () => {
      w.push({ t: "load", slot: to, src: "world" });
      effectToEvents(w, loop.effects, "world", {});
    });
    announce(w, `${loop.text} The story rewinds to ${label}: treat everything after it as undone, except what {{user}} remembers.`);
    return;
  }
  if (r.checkpoints.auto && r.clock.enabled && Math.floor(w.s.minutes / 1440) > Math.floor(before.minutes / 1440)) {
    w.push({ t: "save", slot: "auto", label: `Autosave · ${formatClock(r, w.s.minutes).label}`, src: "world" });
  }
}

/** The player asks to see the ending written (after one was reached between replies). */
export const RUN_EPILOGUE = "run:epilogue";

export type RunOp = { op: "save"; slot: string } | { op: "load"; slot: string } | { op: "restart" } | { op: "continue" };

/** Save, load, start over or keep playing after an ending (from the journal or the ending's choices). */
export function runOp(r: Ruleset, before: GameState, op: RunOp): WarpEvent[] | string {
  const c = r.checkpoints;
  if (!c.enabled) return "This ruleset has no checkpoints.";
  const w = new Working(r, cloneState(before));
  switch (op.op) {
    case "save": {
      const n = Number(op.slot);
      if (!Number.isInteger(n) || n < 1 || n > c.slots) return "No such save slot.";
      if (before.ended) return "The story has ended — load a save or start over.";
      const where = before.locationName ? ` · ${before.locationName}` : "";
      w.push({ t: "save", slot: op.slot, label: `${r.clock.enabled ? formatClock(r, before.minutes).label : `Turn ${before.turn}`}${where}`, src: "manual" });
      break;
    }
    case "load": {
      if (op.slot !== "start" && !before.saves[op.slot]) return "That slot is empty.";
      const label = op.slot === "start" ? "the very beginning" : before.saves[op.slot].label;
      w.push({ t: "load", slot: op.slot, src: "manual" });
      w.push({ t: "notice", text: `Time rewinds to ${label}. Treat everything after that point as undone — except what {{user}} remembers.`, src: "world" });
      break;
    }
    case "restart":
      w.push({ t: "restart", src: "manual" });
      w.push({ t: "notice", text: "The story starts over from the very beginning: a new playthrough. Earlier events never happened, though some of what was learned carries over.", src: "world" });
      break;
    case "continue":
      if (!before.ended) return "The story hasn't ended.";
      if (c.hard) return "Hard mode: an ending is final.";
      w.push({ t: "unend", src: "manual" });
      w.push({ t: "notice", text: "The story goes on past its ending.", src: "world" });
      break;
  }
  runTriggers(w, false);
  return w.events;
}

function startEncounter(w: Working, id: string, src: EventSource, opponent?: string) {
  const enc = w.r.encounters[id];
  if (!enc) return;
  const foe = Object.fromEntries(enc.foe.stats.map((s) => [s.id, s.start]));
  w.push({ t: "enc", id, foe, ...(enc.momentum ? { momentum: enc.momentum.start } : {}), ...(opponent ? { foeName: opponent } : {}), src });
  announce(w, `An encounter begins: ${enc.name}${enc.desc ? ` — ${enc.desc}` : ""}. Opponent: ${opponent ?? enc.foe.name}.`);
  because(w, `${enc.name} begins`, () => effectToEvents(w, enc.start, src, {}));
}

function encounterOutcome(w: Working): string | null {
  const s = w.s.encounter;
  if (!s) return null;
  if (w.pendingEnd) return w.pendingEnd;
  const enc = w.r.encounters[s.id];
  // A fight that swings ends only when one side has it completely.
  if (enc?.momentum && s.momentum !== undefined) {
    if (s.momentum >= 100) return enc.momentum.win;
    if (s.momentum <= -100) return enc.momentum.lose;
  }
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
  if (eff) because(w, `${enc?.name ?? "Encounter"} ended: ${outcome.replace(/_/g, " ")}`, () => effectToEvents(w, eff, src, {}));
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

function momentumWords(m: number, foe: string): string {
  if (m >= 100) return "{{user}} has won the exchange";
  if (m <= -100) return `${foe} has won the exchange`;
  if (m >= 60) return "{{user}} is close to winning";
  if (m >= 20) return "{{user}} has the upper hand";
  if (m > -20) return "evenly matched";
  if (m > -60) return `${foe} has the upper hand`;
  return `${foe} is close to winning`;
}

/** A round of a swinging fight, as ordered beats for the narrator. */
function beatSheet(w: Working, before: GameState, rec: TurnRecord, playerText?: string) {
  const enc = before.encounter ? w.r.encounters[before.encounter.id] : undefined;
  if (!enc?.momentum || before.encounter?.momentum === undefined) return;
  const foe = foeName(w.r, before);
  const beats: string[] = [];
  const typed = (playerText ?? "").trim();
  const mine = rec.action ? `${rec.action.label}${rec.check ? ` — ${TIER_LABEL[rec.check.tier].toLowerCase()}` : ""}` : "no clear move";
  if (rec.action && typed.length >= 240) beats.push(`1. {{user}}: keep the move exactly as {{user}} wrote it; only how well it lands is decided (${rec.check ? TIER_LABEL[rec.check.tier].toLowerCase() : "it happens"}).`);
  else beats.push(`1. {{user}}: ${mine}.${typed.length < 80 ? " Write the move itself in your own words as the opening beat." : ""}`);
  const foeMove = enc.foeMoves ? w.decisions.find((d) => d.id === enc.foeMoves!.id) : undefined;
  if (foeMove) beats.push(`2. ${foe}: ${foeMove.pickedDesc}.`);
  const shift = w.events.reduce((sum, e) => sum + (e.t === "swing" ? e.d : 0), 0);
  const now = Math.max(-100, Math.min(100, before.encounter.momentum + shift));
  beats.push(`${beats.length + 1}. Where it stands: ${momentumWords(now, foe)}${shift ? ` (it swung ${shift > 0 ? "toward {{user}}" : `toward ${foe}`})` : ""}.`);
  w.hints.push(`This round's beats, in order:\n${beats.join("\n")}\nNarrate them in order. ${w.s.encounter ? "The fight isn't over until the rules end it — don't finish it early." : ""}`.trim());
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
  because(w, `${fillTarget(w, d.ask, extra)} → ${fillTarget(w, opt.desc, extra)} (${Math.round((p[picked] ?? 0) * 100)}% odds)`, () => effectToEvents(w, opt.effect, src, extra));
}

function advanceTime(w: Working, minutes: number, src: EventSource) {
  if (!w.r.clock.enabled || minutes <= 0) return;
  w.push({ t: "time", min: minutes, src });
  for (const id of w.r.statOrder) {
    const def = w.r.stats[id];
    if (!def.perHour) continue;
    const d = (def.perHour * minutes) / 60;
    if (Math.abs(d) > 1e-9) w.push({ t: "stat", id, d, src: "drift", why: `${minutes >= 60 ? `${Math.round(minutes / 6) / 10}h` : `${minutes} min`} passed (${def.label} drifts ${def.perHour > 0 ? "+" : ""}${def.perHour}/h)` });
  }
  for (const [id, c] of Object.entries(w.s.conditions)) {
    if (c.until !== null && c.until <= w.s.minutes) w.push({ t: "cond", id, on: false, src: "drift", note: "expired" });
  }
}

function runTriggers(w: Working, includeRepeat: boolean) {
  const fired = new Set<string>();
  const budget = Math.min(128, Math.max(5, w.r.triggers.length * 2 + 1));
  for (let pass = 0; pass < budget; pass++) {
    let changed = false;
    for (const t of w.r.triggers) {
      // Scene triggers only move when the decision model judged them this phase.
      if (t.whenScene && !(t.id in w.scene)) continue;
      const now = (t.when === undefined || evalBool(t.when, w.env(), false)) && (!t.whenScene || w.scene[t.id] === true);
      const prev = w.s.triggers[t.id] ?? false;
      const why = `Rule "${t.id.replace(/_/g, " ")}"${t.when ? ` (${t.when})` : ""}${t.whenScene ? ` — judged: ${t.whenScene}` : ""}`;
      if (now && !prev) {
        w.push({ t: "trig", id: t.id, v: true, src: "trigger" });
        if (!fired.has(t.id)) because(w, why, () => effectToEvents(w, t.effects, "trigger", {}));
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
    if (pass === budget - 1) w.hints.push("Rules did not settle within the trigger budget. Check for cyclic trigger conditions.");
  }
  // Codex entries and feats unlock themselves when their formula first holds.
  for (const c of Object.values(w.r.codex)) {
    if (c.unlock && !w.s.codex[c.id] && evalBool(c.unlock, w.env(), false)) w.push({ t: "codex", id: c.id, src: "trigger" });
  }
  for (const f of Object.values(w.r.feats)) {
    if (!w.s.feats[f.id] && evalBool(f.unlock, w.env(), false)) {
      w.push({ t: "feat", id: f.id, src: "trigger" });
      because(w, `Feat: ${f.name}`, () => effectToEvents(w, f.reward, "trigger", {}));
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
  /** What the player wrote this turn (for keeping a long described move as written). */
  playerText?: string;
  veils?: string[];
  /** Model odds for decide blocks, by decide id. Missing ones fall back to author weights and are listed in `needs`. */
  odds?: Record<string, Record<string, number>>;
  /** Judged plain-language trigger conditions, by trigger id. */
  scene?: Record<string, boolean>;
  /** The scene says an encounter is breaking out (and who the opponent is, when it's someone from the story). */
  encounter?: { id: string; foe?: string };
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

interface MindHit { id: string; cause: string; text: string; kind: "fail" | "alter" | "redirect"; to?: string; chance: number }

/** Does the character's mind overrule this action? First matching override that rolls under its chance wins. */
function mindOverride(r: Ruleset, s: GameState, a: ActionDef, target: string | undefined, seed: string): MindHit | null {
  for (const o of r.mind.overrides) {
    const applies = o.on.length ? o.on.some((x) => x === a.id || a.tags.includes(x)) : !!a.check;
    if (!applies || o.do === a.id) continue;
    const env = makeEnv(r, s, target ? { target } : {});
    if (!evalBool(o.when, env, false)) continue;
    const chance = Math.max(0, Math.min(100, evalNumber(o.chance, env, 0)));
    if (seededRng(`${seed}:mind:${o.id}`)() * 100 >= chance) continue;
    const kind = o.do === "fail" ? "fail" : o.do === "alter" ? "alter" : "redirect";
    return { id: o.id, cause: o.cause, text: o.text ?? `${o.cause} takes over.`, kind, ...(kind === "redirect" ? { to: o.do } : {}), chance };
  }
  return null;
}

function resolveInner(r: Ruleset, before: GameState, intent: Intent | null, opts: ResolveOptions, needs: DecideSpec[]): TurnRecord {
  if (before.ended?.told && intent?.actionId !== RUN_EPILOGUE) intent = null;
  if (intent) {
    const error = validateIntent(r, before, intent);
    if (error) return { v: 1, hints: [error], events: [], rejected: [error], at: Date.now() };
  }
  // After an ending has been written, nothing more resolves until the player loads, starts over or keeps playing.
  if (before.ended?.told && intent?.actionId !== RUN_EPILOGUE) intent = null;
  const w = new Working(r, cloneState(before), seededRng(`${opts.seed}:fx`), opts.seed, opts.odds ?? {}, opts.scene ?? {});
  w.defer = false;
  const rec: TurnRecord = { v: 1, hints: [], events: [], at: Date.now(), inputs: { seed: opts.seed, scene: { ...opts.scene }, odds: structuredClone(opts.odds ?? {}), encounter: opts.encounter } };
  // First turn of a chat fixes its world seed (weather etc.).
  if (!w.s.seed) w.push({ t: "seed", v: opts.seed, src: "start" });
  // World happenings that surfaced after the last reply are this turn's news.
  if (before.notices.length) {
    w.hints.push(...before.notices);
    w.push({ t: "noticed", src: "world" });
  }
  // An ending reached after the last reply is written now.
  if (before.ended && !before.ended.told) {
    const e = r.endings[before.ended.id];
    if (e && !before.notices.some((n) => n.startsWith("THE STORY REACHES AN ENDING"))) w.hints.push(endingDirection(r, before, e));
    w.push({ t: "end_told", src: "world" });
    rec.action = { id: RUN_EPILOGUE, label: `The end: ${e?.title ?? "the story ends"}`, via: intent?.via ?? "choice" };
  }
  // A fight (or any encounter) the scene says is breaking out starts before the player's move lands.
  let encBase = before;
  if (opts.encounter && !before.encounter && !before.dungeon && !before.job && !before.ended) {
    const enc = r.encounters[opts.encounter.id];
    if (enc?.fromStory) {
      because(w, `The scene: ${enc.name} breaks out`, () => startEncounter(w, enc.id, "trigger", opts.encounter!.foe));
      encBase = cloneState(w.s);
    }
  }
  let found = intent && !intent.actionId.startsWith(TRAVEL_PREFIX) && !intent.actionId.startsWith(DATE_PREFIX) && !intent.actionId.startsWith(PAY_PREFIX) && !intent.actionId.startsWith(JOB_PREFIX) ? findAction(r, before, intent.actionId) : null;
  // The character's mind may overrule the player: freeze, do something else, or colour the attempt.
  let mind = found ? mindOverride(r, before, found.a, found.target, opts.seed) : null;
  const meant = found ? (found.target ? `${found.a.label} (${personName(r, before, found.target)})` : intent!.label ?? found.a.label) : "";
  if (found && mind?.kind === "redirect") {
    const alt = findAction(r, before, mind.to!);
    if (alt) found = { a: alt.a, ...(found.target && alt.a.perPerson ? { target: found.target } : {}) };
    else mind = null;
  }
  const a = found?.a;
  const inEncounter = !!encBase.encounter;
  const improvised = !!a && a.id.startsWith(IMPROV);
  // A conversation or outing takes every turn until it ends; a typed line is the player's words in it.
  const dateIntent = intent?.actionId.startsWith(DATE_PREFIX) ? intent : activeSession(r, before) && !intent && !before.job ? { actionId: `${DATE_PREFIX}say`, via: "adjudicator" as const } : null;
  // Bills and work shifts; during a shift, a typed line is how {{user}} serves the customer.
  const workIntent = intent && (intent.actionId.startsWith(PAY_PREFIX) || intent.actionId.startsWith(JOB_PREFIX)) ? intent : before.job && !intent ? { actionId: `${JOB_PREFIX}say`, via: "adjudicator" as const } : null;

  // A conversation the player walked away from is over.
  if (before.date && !activeSession(r, before)) w.push({ t: "dt_end", src: "action" });

  if (intent?.actionId === EXPLORE) {
    if (canExplore(r, before)) {
      const loc = before.location!;
      const name = before.locationName ?? loc;
      rec.action = { id: EXPLORE, label: `Explore ${name}`, via: intent.via };
      const chance = Math.min(100, evalNumber(r.discovery.chance, w.env(), 25) + 10 * (before.explored[loc] ?? 0));
      const found = seededRng(`${opts.seed}:explore`)() * 100 < chance;
      w.push({ t: "explored", loc, found, src: "action" });
      advanceTime(w, r.discovery.time, "action");
      if (found) rec.discover = { from: loc };
      else w.hints.push(`{{user}} explores around ${name} but finds nothing new this time — though they're getting to know the area.`);
    }
  } else if (workIntent) {
    const label = because(w, "Work and bills", () => resolveWork(builderOf(w), workIntent));
    if (label) rec.action = { id: workIntent.actionId, label, via: workIntent.via };
  } else if (dateIntent) {
    const done = because(w, "Conversation", () => resolveDate(builderOf(w), dateIntent));
    if (done) {
      rec.action = { id: dateIntent.actionId, label: done.label, via: dateIntent.via };
      const veils = new Set((opts.veils ?? []).map((v) => v.toLowerCase()));
      if (done.tags.some((t) => veils.has(t))) rec.veiled = true;
    }
  } else if (intent?.actionId.startsWith(TRAVEL_PREFIX)) {
    const to = intent.actionId.slice(TRAVEL_PREFIX.length);
    const dest = r.locations[to];
    if (dest) {
      const from = before.location ? r.locations[before.location] : undefined;
      rec.action = { id: intent.actionId, label: `Go to ${dest.name}`, via: intent.via };
      because(w, `Travel to ${dest.name}`, () => {
        w.push({ t: "move", to, src: "action" });
        advanceTime(w, from?.travel ?? dest.travel, "action");
      });
      if (dest.desc) w.hints.push(`Arriving at ${dest.name}: ${dest.desc}`);
    }
  } else if (a) {
    const who = found?.target;
    const extra = paramValues(a, intent!.params, who);
    const own = mind?.kind === "redirect" ? (who ? `${a.label} (${personName(r, before, who)})` : a.label) : null;
    const difficulty = improvised && isDifficulty(intent!.params?.difficulty) ? intent!.params!.difficulty : "fair";
    const label = improvised
      ? `Attempt: ${a.check?.label ?? "luck"}, ${difficulty}`
      : own ?? intent!.label ?? (who ? `${a.label} (${personName(r, before, who)})` : a.label);
    rec.action = { id: mind?.kind === "redirect" ? `${a.id}${who ? `${TARGET_SEP}${who}` : ""}` : intent!.actionId, label, via: intent!.via, ...(a.params.length ? { params: Object.fromEntries(a.params.map((p) => [p.id, intent!.params?.[p.id] ?? p.default])) } : {}) };
    if (mind) {
      rec.mind = { id: mind.id, cause: mind.cause, kind: mind.kind, meant, chance: mind.chance };
      const why = mind.text.replace(/\{target\}/g, who ? personName(r, before, who) : "them");
      w.hints.push(mind.kind === "fail"
        ? `{{user}} tries to ${meant.toLowerCase()}, but can't: ${why} It fails — no roll.`
        : mind.kind === "redirect"
          ? `{{user}} meant to ${meant.toLowerCase()}, but ${why} What actually happens: ${label.toLowerCase()}.`
          : `{{user}} goes ahead, but ${mind.cause.toLowerCase()} colours it: ${why}`);
    }
    because(w, `Cost of "${label}"`, () => effectToEvents(w, a.cost, "cost", extra));

    if (mind?.kind === "fail") {
      const fail = a.outcomes.fail ?? a.outcomes.crit_fail;
      if (fail) because(w, `"${meant}" — ${mind.cause} stopped it`, () => effectToEvents(w, fail, "check", extra));
    } else if (a.check) {
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
      if (key) because(w, `"${label}": ${rec.check.label} rolled ${rec.check.total}${target !== null ? ` vs ${target}` : ""} → ${TIER_LABEL[tier]}`, () => effectToEvents(w, a.outcomes[key]!, "check", extra));
      if (improvised) {
        // Typed freely: keep what the player wrote they do; the dice only decide how it turns out.
        w.hints.push(`{{user}} attempts what they wrote (${a.check.label}, ${DIFFICULTY_WORD[difficulty as keyof typeof DIFFICULTY_WORD]}). ${IMPROV_DIRECTION[tier]} Keep {{user}}'s own words and choices; the dice decide only how it turns out.`);
      } else if (tier === "partial" && key === "success") w.hints.push("It works, but not cleanly — introduce a cost or complication.");
      // Using a skill or attribute in a check is how it grows.
      const used = checkStats(r, a);
      if (used.length) {
        const hard = hardnessFrom(improvised ? null : odds(r, before, a, intent!.params, who)?.success ?? null, improvised ? difficulty : undefined);
        const gains = checkGains(r, w.s, used, hard, tier);
        if (Object.keys(gains).length) practise(builderOf(w), gains, `Used in "${label}" (${TIER_LABEL[tier].toLowerCase()})`);
      }
    } else {
      because(w, `"${label}"`, () => effectToEvents(w, a.effects, "action", extra));
    }

    // Encounter rounds are quick; ordinary actions take the ruleset's default.
    advanceTime(w, a.time ?? (inEncounter ? 1 : r.clock.minutesPerAction), "action");
    const veils = new Set((opts.veils ?? []).map((v) => v.toLowerCase()));
    const encTags = inEncounter ? r.encounters[encBase.encounter!.id]?.tags ?? [] : [];
    if ([...a.tags, ...encTags].some((t) => veils.has(t))) rec.veiled = true;
    if (inEncounter) {
      // The move's result swings the fight (freezing up counts as a miss).
      const tier: Tier | null = rec.check?.tier ?? (rec.mind?.kind === "fail" ? "fail" : null);
      const m = r.encounters[encBase.encounter!.id]?.momentum;
      if (m && tier && w.s.encounter?.momentum !== undefined) w.push({ t: "swing", d: m.swing[tier], src: "check" });
      encounterRound(w, "action");
      beatSheet(w, encBase, rec, opts.playerText);
    }
  } else if (inEncounter && w.s.encounter) {
    // Typed a non-move during an encounter: the opponent still gets their turn.
    encounterRound(w, "action");
    beatSheet(w, encBase, rec, opts.playerText);
  }

  runTriggers(w, true);
  // The world moves with in-game time (without a clock, each turn counts as a day).
  const days = r.clock.enabled ? (w.s.minutes - before.minutes) / 1440 : 1;
  const worldBefore = w.events.length;
  tickWorld(w, days, 1);
  if (w.events.length > worldBefore) runTriggers(w, false);
  companionLife(w, before);
  lineageLife(w);
  obligationLife(builderOf(w));
  beingSeen(w);
  rumours(w, before);
  checkRun(w, before);
  w.push({ t: "turn", src: "action" });
  rec.events = w.events;
  rec.hints = w.hints;
  if (w.decisions.length) {
    rec.decisions = w.decisions;
    // Date rolls speak through their own directions; decide blocks are summarised here.
    for (const d of w.decisions) if (!d.descs) rec.hints.push(`${d.ask} → ${d.pickedDesc}`);
  }
  needs.push(...w.needs);
  return rec;
}

// ───────────────────────── narrator proposals ─────────────────────────

export interface Proposal {
  /** Total changes are reconciled against mechanics; additional changes are already residual. */
  basis?: "total" | "additional";
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
  /** Body changes: part → trait → value (null removes). */
  body?: Record<string, Record<string, string | null>>;
  /** Who is (true) or isn't (false) in the scene at the end of the reply, by name. */
  scene?: Record<string, boolean>;
  /** Items with uses that were used, by name → times. */
  used?: Record<string, number>;
  /** Skills or attributes {{user}} practised, trained or studied during the reply. */
  train?: string[];
  /** An encounter that broke out in the reply (id or name), and who the opponent is. */
  encounter?: string;
  foe?: string;
  /** The encounter in progress ended in the reply, with this outcome. */
  encounterEnd?: string;
}

/** What the story's changes are checked against: the exchange's text and the action that was taken. */
export interface GateContext {
  text: string;
  action?: { id: string; tags: string[] };
  /** Mechanical facts have authority for this exchange. Minutes describe total elapsed time. */
  applied?: WarpEvent[];
  origin?: GameState;
  rejected?: string[];
}

/** Tags of an action by id, wherever it's declared (ruleset, live-choice tags, encounters). */
export function actionTags(r: Ruleset, actionId: string): string[] {
  const base = actionId.split(TARGET_SEP)[0];
  const enc = Object.values(r.encounters).find((e) => e.actions[base]);
  const a = base.startsWith(LIVE_PREFIX) ? r.liveChoices.tags[base.slice(LIVE_PREFIX.length)] : r.actions[base] ?? enc?.actions[base];
  return [...(a?.tags ?? []), ...(enc?.tags ?? [])];
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

function findPerson(r: Ruleset, s: GameState, key: string): string | null {
  const k = String(key).normalize("NFKC").trim().toLowerCase();
  if (!k) return null;
  for (const [id, p] of Object.entries(s.people)) if (id.toLowerCase() === k || p.name.normalize("NFKC").toLowerCase() === k) return id;
  for (const p of Object.values(r.people)) if (p.id.toLowerCase() === k || p.name.normalize("NFKC").toLowerCase() === k) return p.id;
  // "Miu" for "Miu Tanaka" (or the other way round) — only when just one tracked person fits.
  const first = (n: string) => n.toLowerCase().split(/\s+/)[0];
  const hits = Object.entries(s.people).filter(([, p]) => first(p.name) === first(k) && (!/\s/.test(k) || !/\s/.test(p.name.trim())));
  return hits.length === 1 ? hits[0][0] : null;
}

/** Turn a model's suggested changes into events, enforcing every limit the ruleset sets. */
export function applyProposal(r: Ruleset, before: GameState, p: Proposal, ctx?: GateContext): WarpEvent[] {
  p = decodeProposal(p);
  const applied = ctx?.applied ?? [];
  const touched = (type: WarpEvent["t"], key: string) => applied.some((e) => e.t === type && ("id" in e ? e.id === key : "key" in e ? e.key === key : true));
  const reject = (reason: string) => { ctx?.rejected?.push(reason); };
  const residual = (kind: "stat" | "item" | "rel", id: string, value: number, who?: string) => {
    if (p.basis !== "total") return value;
    if (ctx?.origin) {
      const delta = kind === "stat" ? before.stats[id] - (ctx.origin.stats[id] ?? 0)
        : kind === "item" ? (before.items[id] ?? 0) - (ctx.origin.items[id] ?? 0)
        : (before.rel[who!]?.[id] ?? r.relStats[id]?.start ?? 0) - (ctx.origin.rel[who!]?.[id] ?? r.relStats[id]?.start ?? 0);
      return value - delta;
    }
    return value - applied.reduce((n, e) => n + (e.t === kind && "id" in e && e.id === id && "d" in e ? e.d ?? 0 : e.t === "rel" && kind === "rel" && e.who === who && e.stat === id ? e.d ?? 0 : 0), 0);
  };
  const w = new Working(r, cloneState(before), seededRng(`narrator:${before.turn}`));
  w.cause = "Read from the story";
  const src: EventSource = "narrator";
  // Who the story has in the scene; people who appear count as here.
  const scene: Record<string, boolean> = {};

  for (const person of p.people ?? []) {
    if (!person?.name) continue;
    const known = findPerson(r, w.s, person.name);
    if (known) {
      // Already tracked: treat any feelings as a starting read if they've never been calibrated.
      if (person.feelings) calibrate(w, known, person.feelings, src);
      scene[known] = true;
      continue;
    }
    if (!r.peopleOpen) continue;
    const base = slug(person.id || person.name);
    let id = base, suffix = 2;
    while (w.s.people[id] || r.people[id]) id = `${base}_${suffix++}`;
    if (!w.s.people[id]) w.push({ t: "person", id, name: person.name, src });
    calibrate(w, id, person.feelings ?? {}, src);
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
    const v = clampAbs(residual("stat", id, d), def.narrator);
    if (v !== 0) w.push({ t: "stat", id, d: v, src });
  }

  for (const [who, m] of Object.entries(p.rel ?? {})) {
    let id = findPerson(r, w.s, who);
    if (!id) {
      if (!r.peopleOpen) continue;
      const base = slug(who); id = base;
      for (let suffix = 2; w.s.people[id] || r.people[id]; suffix++) id = `${base}_${suffix}`;
      w.push({ t: "person", id, name: who, src });
    }
    for (const [stat, d] of Object.entries(m ?? {})) {
      const def = r.relStats[stat];
      if (!def || def.narrator <= 0 || typeof d !== "number" || !Number.isFinite(d)) continue;
      if (!gateOpen(def.gate, w, ctx)) continue;
      const v = clampAbs(residual("rel", stat, d, id), def.narrator);
      if (v !== 0) w.push({ t: "rel", who: id, stat, d: v, src });
    }
  }

  for (const [key, d] of Object.entries(p.items ?? {})) {
    if (typeof d !== "number" || !Number.isFinite(d) || d === 0) continue;
    const k = key.toLowerCase();
    const declared = Object.values(r.items).find((i) => i.id === k || i.name.toLowerCase() === k);
    const held = Object.keys(w.s.items).find((id) => id === k || (w.s.itemNames[id] ?? "").toLowerCase() === k);
    let id = declared?.id ?? held ?? slug(key);
    if (!declared && !held) { const base = id; for (let suffix = 2; w.s.items[id] || r.items[id]; suffix++) id = `${base}_${suffix}`; }
    if (!declared && !r.itemsOpen) continue;
    const n = Math.round(clampAbs(residual("item", id, d), 10));
    if (n === 0) continue;
    if (n < 0 && !(w.s.items[id] > 0)) continue;
    w.push({ t: "item", id, d: n, ...(declared ? {} : { name: key }), src });
  }
  // Items with uses (a spray, a first-aid kit): each use spends one, and the last one spends the item.
  for (const [key, n] of Object.entries(p.used ?? {})) {
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) continue;
    const k = key.toLowerCase();
    const id = Object.keys(w.s.items).find((i) => i === k || itemName(r, w.s, i).toLowerCase() === k);
    if (id && (r.items[id]?.uses ?? 0) > 0) w.push({ t: "use", id, n: Math.min(10, Math.round(n)), src });
  }

  if (p.move) {
    if (applied.some((e) => e.t === "move")) { reject("Narrator movement conflicts with the decided destination."); delete p.move; }
  }
  if (p.move) {
    const k = p.move.toLowerCase();
    const loc = Object.values(r.locations).find((l) => l.id === k || l.name.toLowerCase() === k);
    if (loc && loc.id !== w.s.location) w.push({ t: "move", to: loc.id, src });
    else if (!loc && r.locationsOpen && k !== (w.s.locationName ?? "").toLowerCase()) w.push({ t: "move", to: slug(p.move), name: p.move, src });
  }

  for (const id of p.conditions?.add ?? []) {
    if (touched("cond", id)) { reject(`Condition ${id} was already decided.`); continue; }
    const def = r.conditions[id];
    if (def?.narrator && !w.s.conditions[id] && gateOpen(def.gate, w, ctx)) w.push({ t: "cond", id, on: true, until: null, src });
  }
  for (const id of p.conditions?.remove ?? []) {
    if (touched("cond", id)) { reject(`Condition ${id} was already decided.`); continue; }
    const def = r.conditions[id];
    if (def?.narrator && w.s.conditions[id] && gateOpen(def.gate, w, ctx)) w.push({ t: "cond", id, on: false, src });
  }

  for (const [key, v] of Object.entries(p.flags ?? {})) {
    if (touched("flag", key)) { if (v !== before.flags[key]) reject(`Flag ${key} conflicts with the decided outcome.`); continue; }
    if (r.flags[key]?.narrator && gateOpen(r.flags[key].gate, w, ctx)) w.push({ t: "flag", key, v, src });
  }

  if (r.wardrobe.enabled && r.wardrobe.narrator) {
    for (const slot of p.undress ?? []) if (w.s.worn[slot]) w.push({ t: "wear", slot, item: null, src });
    for (const id of p.wear ?? []) {
      const slot = r.items[id]?.slot;
      if (slot && w.s.items[id] > 0 && w.s.worn[slot] !== id) w.push({ t: "wear", slot, item: id, src });
    }
  }

  if (r.body.enabled && r.body.narrator && p.body && typeof p.body === "object") {
    let n = 0;
    for (const [rawPart, traits] of Object.entries(p.body)) {
      const part = slug(rawPart);
      if (!traits || typeof traits !== "object") continue;
      if (!r.body.open && !(part in r.body.parts) && !(part in w.s.body)) continue;
      for (const [rawTrait, v] of Object.entries(traits)) {
        if (n >= 8) break;
        const trait = slug(rawTrait);
        const value = v === null || v === undefined || v === "" ? null : String(v).slice(0, 60);
        if ((w.s.body[part]?.[trait] ?? null) === value) continue;
        w.push({ t: "body", part, trait, v: value, src });
        n++;
      }
    }
  }

  if (typeof p.minutes === "number" && Number.isFinite(p.minutes) && p.minutes > 0) {
    const spent = applied.reduce((n, e) => n + (e.t === "time" ? e.min : 0), 0);
    advanceTime(w, Math.round(Math.min(Math.max(0, p.minutes - spent), r.clock.narratorMax)), src);
  }

  // Who's in the scene at the end of the reply — after any move and the time it took, so it's judged here and now.
  for (const [who, here] of Object.entries(p.scene ?? {})) {
    const id = findPerson(r, w.s, who);
    if (id && typeof here === "boolean") scene[id] = here;
  }
  const hereNow = new Set(presentPeople(r, w.s, w.env()));
  for (const [id, here] of Object.entries(scene)) {
    if (!w.s.people[id]) continue;
    const word = w.s.scene[id];
    if (hereNow.has(id) !== here) w.push({ t: "scene", who: id, here, src });
    // Still here: renew the story's word now and then so it keeps holding.
    else if (here && word && sceneWord(w.s, id) !== null && w.s.minutes - word.at > SCENE_HOLDS / 3) w.push({ t: "scene", who: id, here, src, note: "renew" });
  }

  // Fights (and other encounters) the prose started or finished.
  if (p.encounter && !w.s.encounter && !w.s.dungeon && !w.s.job) {
    if (applied.some((e) => e.t === "enc" && e.id === null)) {
      reject("The encounter already ended in this exchange. Narration cannot restart it.");
    } else {
      const k = String(p.encounter).toLowerCase();
      const enc = r.encounters[k] ?? Object.values(r.encounters).find((x) => x.name.toLowerCase() === k);
      if (enc?.fromStory) because(w, `${enc.name} broke out`, () => startEncounter(w, enc.id, src, typeof p.foe === "string" && p.foe.trim() ? p.foe.trim().slice(0, 60) : undefined));
    }
  } else if (p.encounterEnd && w.s.encounter) {
    const name = r.encounters[w.s.encounter.id]?.name ?? "The encounter";
    because(w, `${name} ended`, () => endEncounter(w, slug(String(p.encounterEnd)), src));
  }

  // Practice the story described: training, studying, rehearsing.
  if (r.growth.enabled && r.growth.train) {
    const gains: Record<string, number> = {};
    for (const key of (Array.isArray(p.train) ? p.train : []).slice(0, 2)) {
      const k = String(key).toLowerCase();
      const id = r.statOrder.find((s) => s === k || r.stats[s].label.toLowerCase() === k);
      if (id && applied.some((e) => e.t === "practice" && e.id === id)) { reject(`Practice in ${id} was already accounted for.`); continue; }
      if (id && (r.stats[id].kind === "skill" || r.stats[id].kind === "attribute")) gains[id] = (gains[id] ?? 0) + trainingGain(r, w.s, id, p.minutes);
    }
    if (Object.keys(gains).length) practise(builderOf(w), gains, "Practice the story described");
  }

  w.cause = null;
  runTriggers(w, false);
  // Time the story itself covered moves the world too; whatever surfaces is told next turn.
  if (r.clock.enabled && w.s.minutes > before.minutes) {
    const n = w.events.length;
    tickWorld(w, (w.s.minutes - before.minutes) / 1440, 0);
    if (w.events.length > n) runTriggers(w, false);
  }
  companionLife(w, before);
  lineageLife(w);
  obligationLife(builderOf(w));
  rumours(w, before);
  checkRun(w, before);
  return w.events;
}

/** A handle for systems that make their own turns outside the action flow (the dungeon, dates). */
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
  /** Roll on odds with this turn's seeded dice; shown as a 🎭 chip. */
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
  if (r.clock.enabled && w.s.minutes > before.minutes) {
    const n = w.events.length;
    tickWorld(w, (w.s.minutes - before.minutes) / 1440, 0);
    if (w.events.length > n) runTriggers(w, false);
  }
  companionLife(w, before);
  lineageLife(w);
  obligationLife(builderOf(w));
  checkRun(w, before);
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
