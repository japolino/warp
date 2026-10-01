// Turn resolution: the only place outcomes are decided.

import type { ExprEnv, Value } from "./expr.js";
import { evalBool, evalNumber, evaluate, identifiers } from "./expr.js";
import { rollDice, seededRng, type Rng } from "./dice.js";
import type { ActionDef, CheckDef, DecideSpec, Effect, NarratorGate, RandomEventDef, Requirement, Ruleset, SeenReaction, Tier } from "./ruleset.js";
import { SEEN_REACTIONS } from "./ruleset.js";
import { normalize, sample } from "./decide.js";
import { emptyEffect, percentOf, slug } from "./ruleset.js";
import { applyEvent, cloneState, dayOf, encounterKey, foeName, formatClock, formatNumber, itemName, kinAge, makeEnv, personName, statMax, timeKey, usesOf, type EventSource, type GameState, type WarpEvent } from "./state.js";
import { isLoss, thresholds } from "./encounter-view.js";
import { checkGains, checkStats, DIFFICULTY_WORD, hardnessFrom, IMPROV, IMPROV_DIRECTION, improvAction, isDifficulty, practise, trainingGain } from "./freeform.js";
import { endingDirection } from "./chronicle.js";
import { exposedSlots, isIndoors, presentPeople, revealOf, SCENE_HOLDS, sceneWord } from "./world.js";
import { DATE_PREFIX } from "./date/types.js";
import { activeSession, ADULT_KEY, resolveDate } from "./date/talk.js";
import { JOB_PREFIX, obligationLife, PAY_PREFIX, resolveWork } from "./work.js";
import { QUEST_PREFIX, questHooks, questLife, questOp, questProgress, resolveQuest, storyQuestNews, type StoryQuestNews } from "./quests.js";

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
  /** Gear, perks and buffs that helped ("Running Sneakers: +5 Athletics"). */
  gear?: string[];
  /** A perk stepped in after a failure ("Silver Tongue rerolled a failure"). */
  perk?: string;
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
  /** The move being resolved (perks that pierce armor look at it). */
  action: ActionDef | null = null;
  /** Whose turn it is in an encounter: blows on the foe's turn land on {{user}} (and their armor). */
  turnOf: "player" | "foe" | null = null;
  /** Statuses put on during their holder's own turn don't tick down until the next one. */
  fresh = { player: new Set<string>(), foe: new Set<string>() };
  push(e: WarpEvent) {
    if (this.cause && !e.why) e = { ...e, why: this.cause };
    if (e.t === "stat" && e.d && e.set === undefined && e.src !== "manual" && e.src !== "start") {
      const m = statRate(this.r, this.s, e.id, e.d);
      if (m !== 1) e = { ...e, d: e.d * m };
    }
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
/** Using an item: `item:<id>` runs the item's `use:` action, wherever the player is. */
export const ITEM_PREFIX = "item:";

/** Items the player holds that can be used right now. Locked uses come back with their reason. */
export function usableItems(r: Ruleset, s: GameState): { id: string; a: ActionDef; locked: string | null }[] {
  const out: { id: string; a: ActionDef; locked: string | null }[] = [];
  for (const [id, n] of Object.entries(s.items)) {
    const a = r.items[id]?.use;
    if (!a || n <= 0) continue;
    out.push({ id: `${ITEM_PREFIX}${id}`, a, locked: isAvailable(r, s, a) ? null : a.whyNot ?? lockReason(r, s, a) });
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
    case "quest": {
      const name = r.quests[id]?.name ?? id;
      return q.state === "active" ? `the quest "${name}"` : q.state === "done" ? `"${name}" done` : `"${name}" ${q.state}`;
    }
    case "flag": return `${q.state === "off" ? "not " : ""}${r.flags[id]?.label ?? id.replace(/_/g, " ")}`;
    case "perk": return `★ ${r.perks[id]?.name ?? id}`;
    default: return q.text ?? "the right moment";
  }
}

/** A plain reason a choice is locked, read from simple conditions ("Needs a Cream Brioche"). */
export function lockReason(r: Ruleset, s: GameState, a: ActionDef): string {
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
 * What adds to the stats a check reads: carried gear (worn, for clothing),
 * perks (always, or while their edge holds), and buffs or debuffs from
 * conditions. Each counts as that much more of the stat, for this check only.
 */
export function gearFor(r: Ruleset, s: GameState, a: ActionDef): { stats: Record<string, number>; notes: string[] } {
  const stats: Record<string, number> = {};
  const notes: string[] = [];
  if (!a.check) return { stats, notes };
  const reads = new Set([...identifiers(a.check.add as string), ...identifiers(a.check.target as string)]);
  const add = (from: string, bonus: Record<string, number>) => {
    for (const [stat, b] of Object.entries(bonus)) {
      if (!b || !reads.has(stat)) continue;
      stats[stat] = (stats[stat] ?? 0) + b;
      notes.push(`${from}: ${b > 0 ? "+" : ""}${b} ${r.stats[stat]?.label ?? stat}`);
    }
  };
  const worn = new Set(Object.values(s.worn));
  for (const [id, n] of Object.entries(s.items)) {
    const it = r.items[id];
    if (!it || n <= 0 || (it.slot && !worn.has(id))) continue;
    add(it.name, it.bonus);
  }
  const env = makeEnv(r, s);
  for (const id of Object.keys(s.perks)) {
    const p = r.perks[id];
    if (!p) continue;
    add(`★ ${p.name}`, p.bonus);
    for (const e of p.edges) if (!e.when || evalBool(e.when, env, false)) add(`★ ${p.name}`, e.stats);
  }
  for (const id of Object.keys(s.conditions)) {
    const c = r.conditions[id];
    if (c && Object.keys(c.bonus).length) add(c.label, c.bonus);
  }
  return { stats, notes };
}

/** How much bigger (or smaller) a rise or drop in a stat is, from the perks held. */
export function statRate(r: Ruleset, s: GameState, stat: string, d: number): number {
  let pct = 0;
  for (const id of Object.keys(s.perks)) {
    for (const rule of r.perks[id]?.rules ?? []) {
      if ((rule.kind === "gains" && d > 0) || (rule.kind === "losses" && d < 0)) if (rule.stat === stat) pct += rule.pct;
    }
  }
  return Math.max(0, 1 + pct);
}

export const ABILITY_PREFIX = "ability:";

export interface AbilityStatus {
  id: string;
  known: boolean;
  /** Uses left (today or this encounter, whichever is fewer); null when unlimited. */
  left: number | null;
  /** Offered here (encounter-only abilities aren't, outside one). */
  here: boolean;
  /** Why it can't be used right now. */
  locked: string | null;
}

/** Whether the player has this ability: from the start, from a perk, taught by the story, or while its formula holds. */
export function knowsAbility(r: Ruleset, s: GameState, id: string): boolean {
  const ab = r.abilities[id];
  if (!ab) return false;
  if (ab.known === true || s.learned?.[id]) return true;
  if (Object.keys(s.perks).some((p) => r.perks[p]?.abilities.includes(id))) return true;
  return typeof ab.known === "string" && evalBool(ab.known, makeEnv(r, s), false);
}

export function abilityStatus(r: Ruleset, s: GameState, id: string): AbilityStatus {
  const ab = r.abilities[id];
  const known = knowsAbility(r, s, id);
  if (!ab || !known) return { id, known, left: null, here: false, locked: "Not learned" };
  const used = usesOf(s, `${ABILITY_PREFIX}${id}`);
  const lefts: number[] = [];
  if (ab.perDay) lefts.push(ab.perDay - used.today);
  if (ab.perEncounter && s.encounter) lefts.push(ab.perEncounter - used.here);
  const left = lefts.length ? Math.max(0, Math.min(...lefts)) : null;
  const here = ab.where === "any" || (ab.where === "encounter") === !!s.encounter;
  let locked: string | null = null;
  if (left === 0) locked = ab.perEncounter && s.encounter && ab.perEncounter - used.here <= 0 ? "Used up for this encounter" : "Used up for today";
  else if (!isAvailable(r, s, ab.action)) locked = ab.action.whyNot ?? lockReason(r, s, ab.action);
  else {
    // A cost it can't pay (8 Mana with 5 left) locks it, with the reason.
    const env = makeEnv(r, s);
    for (const [stat, d] of Object.entries(ab.action.cost.stats)) {
      const v = evalNumber(d, env, 0);
      if (v < 0 && (s.stats[stat] ?? r.stats[stat]?.start ?? 0) < -v) { locked = `Needs ${-v} ${r.stats[stat]?.label ?? stat}`; break; }
    }
  }
  return { id, known, left, here, locked };
}

/** Abilities the player knows that belong here (in an encounter or out of one), each with whether it can be used now. */
export function usableAbilities(r: Ruleset, s: GameState): { id: string; a: ActionDef; status: AbilityStatus }[] {
  const out: { id: string; a: ActionDef; status: AbilityStatus }[] = [];
  for (const ab of Object.values(r.abilities)) {
    const status = abilityStatus(r, s, ab.id);
    if (status.known && status.here) out.push({ id: `${ABILITY_PREFIX}${ab.id}`, a: ab.action, status });
  }
  return out;
}

/** The encounter's main meter (what a `harm:` wears down): the first foe stat whose threshold wins it. */
export function mainMeter(r: Ruleset, s: GameState): { stat: string; down: boolean } | null {
  const enc = s.encounter ? r.encounters[s.encounter.id] : undefined;
  if (!enc) return null;
  const t = thresholds(enc).find((x) => x.foe && !isLoss(enc, x.outcome));
  return t ? { stat: t.stat, down: t.op.startsWith("<") } : null;
}

/** Player stats the current encounter can be lost on (pain, HP…): where "_" armor and plain damage over time land. */
export function dangerStats(r: Ruleset, s: GameState): string[] {
  const enc = s.encounter ? r.encounters[s.encounter.id] : undefined;
  if (!enc) return [];
  return [...new Set(thresholds(enc).filter((x) => !x.foe && isLoss(enc, x.outcome) && r.stats[x.stat]).map((x) => x.stat))];
}

/** {{user}}'s armor against blows to a stat: gear held (worn, for clothing) and conditions. "_" counts for what the fight beats you on. */
export function playerArmor(r: Ruleset, s: GameState, stat: string): number {
  const main = dangerStats(r, s).includes(stat);
  const pick = (m: Record<string, number>) => (m[stat] ?? 0) + (main ? m._ ?? 0 : 0);
  const worn = new Set(Object.values(s.worn));
  let n = 0;
  for (const [id, have] of Object.entries(s.items)) {
    const it = r.items[id];
    if (!it || have <= 0 || (it.slot && !worn.has(id))) continue;
    n += pick(it.armor);
  }
  for (const id of Object.keys(s.conditions)) n += pick(r.conditions[id]?.armor ?? {});
  return n;
}

/** The opponent's armor on a stat: its own, plus statuses on it (negative when sundered). */
export function foeArmor(r: Ruleset, s: GameState, stat: string): number {
  const enc = s.encounter ? r.encounters[s.encounter.id] : undefined;
  if (!enc) return 0;
  const main = mainMeter(r, s)?.stat === stat;
  const pick = (m: Record<string, number>) => (m[stat] ?? 0) + (main ? m._ ?? 0 : 0);
  let n = pick(enc.foe.armor);
  for (const id of Object.keys(s.encounter!.conds ?? {})) n += pick(r.conditions[id]?.armor ?? {});
  return n;
}

/** Armor a move ignores, from the perks held (a pierce rule matching its stats or tags). */
function perkPierce(r: Ruleset, s: GameState, a: ActionDef | null): number {
  if (!a) return 0;
  const used = new Set(checkStats(r, a));
  let n = 0;
  for (const id of Object.keys(s.perks)) for (const rule of r.perks[id]?.rules ?? []) {
    if (rule.kind !== "pierce") continue;
    const fits = (!rule.stats.length && !rule.tags.length) || rule.stats.some((x) => used.has(x)) || rule.tags.some((t) => a.tags.includes(t));
    if (fits) n += rule.amount;
  }
  return n;
}

/** Is this change to a foe stat a blow (toward what's good for the player)? */
function hurtsFoe(def: { good: "high" | "low" | "none" } | undefined, d: number): boolean {
  return def?.good === "high" ? d > 0 : def?.good === "none" ? false : d < 0;
}

/** Is this change to a player stat a blow (toward what's bad for them)? */
function hurtsPlayer(r: Ruleset, stat: string, d: number): boolean {
  const g = r.stats[stat]?.good;
  return g === "high" ? d < 0 : g === "low" ? d > 0 : false;
}

/** "-25%" → a quarter of `max`; otherwise the formula's value. Whole numbers once they're bigger than one. */
function amountOf(w: Working, v: string | number, extra: Record<string, Value>, max: number): number {
  const p = percentOf(v);
  const x = p !== null ? p * max : evalNumber(v, w.env(extra), 0);
  return Math.abs(x) >= 1 && p !== null ? Math.round(x) : x;
}

/** A perk that steps in when this check fails: a reroll or a softened result, if it has uses left today. */
function perkRuleFor(r: Ruleset, s: GameState, a: ActionDef, kind: "reroll" | "soften"): { perk: string; name: string } | null {
  const used = new Set(checkStats(r, a));
  for (const id of Object.keys(s.perks)) {
    const p = r.perks[id];
    for (const rule of p?.rules ?? []) {
      if (rule.kind !== kind) continue;
      const fits = (!rule.stats.length && !rule.tags.length) || rule.stats.some((x) => used.has(x)) || rule.tags.some((t) => a.tags.includes(t));
      if (!fits) continue;
      if (rule.perDay && usesOf(s, `perk:${id}:${kind}`).today >= rule.perDay) continue;
      return { perk: id, name: p.name };
    }
  }
  return null;
}

/** Look up an intent's action (and target) in whatever pool is live. */
export function findAction(r: Ruleset, s: GameState, actionId: string): { a: ActionDef; target?: string } | null {
  const [base, target] = actionId.split(TARGET_SEP);
  const allowed = (a: ActionDef) => isAvailable(r, s, a, target)
    && (!a.perPerson || !!target)
    && (!target || presentPeople(r, s, makeEnv(r, s)).includes(target));
  if (base.startsWith(ITEM_PREFIX)) {
    const id = base.slice(ITEM_PREFIX.length);
    const item = r.items[id];
    const a = item?.use;
    return a && (s.items[id] ?? 0) > 0 && !(item.uses > 0 && (s.uses[id] ?? item.uses) <= 0) && allowed(a)
      ? { a, ...(target ? { target } : {}) } : null;
  }
  if (base.startsWith(ABILITY_PREFIX)) {
    const id = base.slice(ABILITY_PREFIX.length);
    const st = abilityStatus(r, s, id);
    const a = r.abilities[id]?.action;
    return a && st.known && st.here && !st.locked && allowed(a) ? { a, ...(target ? { target } : {}) } : null;
  }
  if (base.startsWith(IMPROV)) {
    const a = improvAction(r, s, base);
    return a ? { a } : null;
  }
  const a = base.startsWith(LIVE_PREFIX) ? r.liveChoices.tags[base.slice(LIVE_PREFIX.length)] : actionPool(r, s).defs[base];
  return a && allowed(a) ? { a, ...(target ? { target } : {}) } : null;
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
  // Gear counts as that much more of the stat it helps, for this check only.
  const gear = gearFor(r, s, a).stats;
  const eff = Object.keys(gear).length ? { ...s, stats: Object.fromEntries(Object.entries(s.stats).map(([k, v]) => [k, v + (gear[k] ?? 0)])) } : s;
  const env = makeEnv(r, eff, paramValues(a, params, who));
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
    const success = Math.max(0, Math.min(100, target - add)) / 100;
    // A reroll happens only after failure. Soften converts ordinary failures to
    // partials, but only converts critical failures to ordinary failures.
    const reroll = !!perkRuleFor(r, s, a, "reroll");
    const soften = !!perkRuleFor(r, s, a, "soften");
    const failed = 1 - success;
    const critical = check.crits ? Math.min(failed, 0.05) : 0;
    return { success: reroll ? success + failed * success : success,
      partial: soften ? (reroll ? failed : 1) * (failed - critical) : 0 };
  }
  const rng = seededRng(`odds:${a.id}`);
  const reroll = !!perkRuleFor(r, s, a, "reroll"), soften = !!perkRuleFor(r, s, a, "soften");
  const N = 2000;
  let ok = 0, part = 0;
  for (let i = 0; i < N; i++) {
    let t = tierFor(check, rollDice(check.dice, rng), add, target);
    if ((t === "fail" || t === "crit_fail") && reroll) t = tierFor(check, rollDice(check.dice, rng), add, target);
    if ((t === "fail" || t === "crit_fail") && soften) t = t === "crit_fail" ? "fail" : "partial";
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
  // A blow that lands more than once: on the foe's turn it's aimed at {{user}}, otherwise at the foe.
  const hits = e.hits !== undefined ? Math.max(1, Math.min(10, Math.round(evalNumber(e.hits, w.env(extra), 1)))) : 1;
  const foeTurn = !!w.s.encounter && w.turnOf === "foe";
  for (const [id, d] of Object.entries(e.stats)) {
    const def = r.stats[id];
    const v = amountOf(w, d, extra, def ? statMax(r, def, w.s) : 100);
    if (v === 0) continue;
    if (!foeTurn || !hurtsPlayer(r, id, v)) { w.push({ t: "stat", id, d: v, src }); continue; }
    // The foe's blows meet {{user}}'s armor, hit by hit.
    const armor = playerArmor(r, w.s, id);
    const per = Math.max(0, Math.abs(v) - armor);
    for (let i = 0; i < hits && per > 0; i++) w.push({ t: "stat", id, d: Math.sign(v) * per, src, ...(hits > 1 ? { note: `hit ${i + 1} of ${hits}` } : {}) });
    if (armor > 0) announce(w, per > 0 ? `{{user}}'s armor takes ${Math.min(armor, Math.abs(v))} off ${hits > 1 ? "each hit" : "the blow"}.` : `{{user}}'s armor turns the blow aside — no ${def?.label ?? id} lost.`);
    else if (hits > 1) announce(w, `It lands ${hits} times.`);
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
    w.push(condOn(w, id, dur, src));
    if (!foeTurn) w.fresh.player.add(id);
  }
  for (const id of e.removeConditions) if (w.s.conditions[id]) w.push({ t: "cond", id, on: false, src });
  inflictEffects(w, e, src, extra);
  for (const [id, op] of Object.entries(e.quest)) questOp(builderOf(w), id, op, src);
  for (const [key, d] of Object.entries(e.progress)) questProgress(builderOf(w), key, Math.round(evalNumber(d, w.env(extra), 0)), src);
  for (const [who, text] of Object.entries(e.remember)) {
    const person = who === "target" && typeof extra.target === "string" ? extra.target : who;
    if (person !== "target") w.push({ t: "memory", who: person, text: fillTarget(w, text, extra), src });
  }

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
    const foeStats = r.encounters[w.s.encounter.id]?.foe.stats;
    const blows: { stat: string; v: number }[] = [];
    for (const [stat, d] of Object.entries(e.foe)) {
      // An ability written for one kind of foe ("hp") simply misses one that doesn't have it.
      if (foeStats?.length && !foeStats.some((x) => x.id === stat)) continue;
      const v = amountOf(w, d, extra, foeStats?.find((x) => x.id === stat)?.max ?? 100);
      if (v !== 0) blows.push({ stat, v });
    }
    if (e.harm !== undefined) {
      const m = mainMeter(r, w.s);
      const v = amountOf(w, e.harm, extra, (m && foeStats?.find((x) => x.id === m.stat)?.max) || 100);
      if (v && m) blows.push({ stat: m.stat, v: m.down ? -v : v });
      else if (v && w.s.encounter.momentum !== undefined) w.push({ t: "swing", d: v, src });
    }
    const pierce = Math.max(0, (e.pierce !== undefined ? evalNumber(e.pierce, w.env(extra), 0) : 0) + (foeTurn ? 0 : perkPierce(r, w.s, w.action)));
    for (const { stat, v } of blows) {
      const fs = foeStats?.find((x) => x.id === stat);
      // Healing, rallying and the like land once and ignore armor.
      if (foeTurn || !hurtsFoe(fs, v)) { w.push({ t: "foe", stat, d: v, src }); continue; }
      const raw = foeArmor(r, w.s, stat);
      const armor = raw > 0 ? Math.max(0, raw - pierce) : raw;
      const per = Math.max(0, Math.abs(v) - armor);
      for (let i = 0; i < hits && per > 0; i++) w.push({ t: "foe", stat, d: Math.sign(v) * per, src, ...(hits > 1 ? { note: `hit ${i + 1} of ${hits}` } : {}) });
      const foe = foeName(r, w.s);
      if (raw > 0 && per === 0) announce(w, `${foe}'s armor stops it — ${fs?.label ?? stat} untouched.`);
      else if (raw > 0 && armor < raw) announce(w, `It ${pierce >= raw ? "goes straight through" : "partly pierces"} ${foe}'s armor${hits > 1 ? ` and lands ${hits} times` : ""}.`);
      else if (raw > 0) announce(w, `${foe}'s armor blunts ${hits > 1 ? `each of ${hits} hits` : "the blow"}.`);
      else if (raw < 0) announce(w, `${foe} is wide open — it hits harder.`);
      else if (hits > 1) announce(w, `It lands ${hits} times.`);
    }
    if (e.end) w.pendingEnd = e.end;
  }
  for (const id of e.learn) if (r.abilities[id] && !w.s.learned?.[id]) w.push({ t: "learn", id, src });
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

// ───────────────────────── statuses: on the opponent, on people, ticking ─────────────────────────

/** A condition put on {{user}}: in a fight a status counts rounds (and ends with it); elsewhere it lasts its minutes (or until cured). */
function condOn(w: Working, id: string, minutes: number | null, src: EventSource): WarpEvent {
  const def = w.r.conditions[id];
  if (minutes === null && def?.rounds && w.s.encounter) return { t: "cond", id, on: true, until: null, rounds: def.rounds, src };
  return { t: "cond", id, on: true, until: minutes === null ? (def?.lasts ? w.s.minutes + def.lasts : null) : w.s.minutes + minutes, src };
}

/** `inflict:` on the opponent (or whoever a per-person action is aimed at), `afflict:` on named people, `cleanse:` to lift them. */
function inflictEffects(w: Working, e: Effect, src: EventSource, extra: Record<string, Value>) {
  const r = w.r;
  const target = typeof extra.target === "string" && extra.target ? extra.target : null;
  for (const [id, spec] of Object.entries(e.inflict)) {
    const def = r.conditions[id];
    if (!def) continue;
    const who = w.s.encounter ? foeName(r, w.s) : target ? personName(r, w.s, target) : null;
    if (!who) continue;
    if (spec.chance !== undefined) {
      const chance = Math.max(0, Math.min(100, evalNumber(spec.chance, w.env(extra), 100)));
      if (seededRng(`${w.seed}:inflict:${id}:${w.events.length}`)() * 100 >= chance) { announce(w, `${who} shrugs it off — not ${def.label.toLowerCase()}.`); continue; }
    }
    const n = spec.rounds !== undefined ? Math.max(1, Math.round(evalNumber(spec.rounds, w.env(extra), 1))) : null;
    if (w.s.encounter) {
      const rounds = n ?? def.rounds ?? null;
      w.push({ t: "fcond", id, on: true, rounds, src });
      if (w.turnOf === "foe") w.fresh.foe.add(id);
      announce(w, `${who} is ${def.label.toLowerCase()}${rounds ? ` for ${rounds} round${rounds === 1 ? "" : "s"}` : ""}.`);
    } else if (target) {
      // Outside a fight the number is minutes.
      const mins = n ?? def.lasts ?? null;
      w.push({ t: "pcond", who: target, id, on: true, until: mins ? w.s.minutes + mins : null, src });
      announce(w, `${who} is ${def.label.toLowerCase()}.`);
    }
  }
  for (const [key, m] of Object.entries(e.afflict)) {
    const who = key === "target" ? target : key;
    if (!who) continue;
    for (const [id, mins] of Object.entries(m)) {
      const def = r.conditions[id];
      if (!def) continue;
      const len = mins ?? def.lasts ?? null;
      w.push({ t: "pcond", who, id, on: true, until: len ? w.s.minutes + len : null, src });
    }
  }
  for (const id of e.cleanse) {
    if (w.s.encounter?.conds && id in w.s.encounter.conds) w.push({ t: "fcond", id, on: false, src });
    else if (target && w.s.pconds?.[target]?.[id]) w.push({ t: "pcond", who: target, id, on: false, src });
  }
}

/** Does a status cost its holder this turn? Rolls each lost-turn status they have; the first that lands says why. */
function lostTurn(w: Working, side: "player" | "foe"): string | null {
  const ids = side === "player" ? Object.keys(w.s.conditions) : Object.keys(w.s.encounter?.conds ?? {});
  for (const id of ids) {
    const def = w.r.conditions[id];
    if (def?.skip === undefined) continue;
    const chance = Math.max(0, Math.min(100, evalNumber(def.skip, w.env(), 100)));
    if (seededRng(`${w.seed}:skip:${side}:${id}:${w.s.encounter?.round ?? 0}`)() * 100 < chance) return def.label;
  }
  return null;
}

/** Where damage over time lands on {{user}}: the status's own stat, else what the fight can be lost on, else the first health-like bar. */
function playerDotStat(r: Ruleset, s: GameState, stat?: string): string | null {
  if (stat && r.stats[stat]) return stat;
  return dangerStats(r, s)[0] ?? r.hud.bars.find((id) => r.stats[id]?.good === "high" && r.stats[id].kind === "meter") ?? null;
}

/** One status ticking on {{user}}: damage (or healing) over time (scaled for hourly statuses) and its tick effect. */
function tickPlayer(w: Working, id: string, scale = 1, ticks = 1) {
  const def = w.r.conditions[id];
  if (!def) return;
  because(w, `${def.label} (status)`, () => {
    if (def.dot !== undefined) {
      const stat = playerDotStat(w.r, w.s, def.stat);
      const dmg = amountOf(w, def.dot, {}, stat ? statMax(w.r, w.r.stats[stat], w.s) : 100) * scale;
      if (stat && dmg) w.push({ t: "stat", id: stat, d: (w.r.stats[stat].good === "low" ? 1 : -1) * dmg, src: "trigger" });
    }
    for (let i = 0; i < ticks; i++) effectToEvents(w, def.tick, "trigger", {});
  });
}

/** A round passes for one side: their statuses bite, then count down (unless they were put on this very turn). */
function tickSide(w: Working, side: "player" | "foe") {
  const enc = w.s.encounter;
  if (!enc) return;
  if (side === "player") {
    for (const id of Object.keys(w.s.conditions)) {
      const def = w.r.conditions[id];
      if (def && def.every !== "hour") tickPlayer(w, id);
    }
    for (const [id, c] of Object.entries(w.s.conditions)) {
      if (c.rounds === undefined || w.fresh.player.has(id)) continue;
      w.push({ t: "cleft", side: "player", id, rounds: c.rounds - 1, src: "drift" });
      if (c.rounds - 1 <= 0) announce(w, `{{user}} is no longer ${w.r.conditions[id]?.label.toLowerCase() ?? id}.`);
    }
    return;
  }
  const foe = foeName(w.r, w.s);
  for (const id of Object.keys(enc.conds ?? {})) {
    const def = w.r.conditions[id];
    if (def?.dot === undefined) continue;
    const m = mainMeter(w.r, w.s);
    const stat = def.stat && w.r.encounters[enc.id]?.foe.stats.some((x) => x.id === def.stat) ? def.stat : m?.stat;
    if (!stat) continue;
    const fs = w.r.encounters[enc.id]?.foe.stats.find((x) => x.id === stat);
    const dmg = amountOf(w, def.dot, {}, fs?.max ?? 100);
    // Damage over time wears the meter the same way a blow would; negative heals.
    const down = stat === m?.stat ? m.down : fs?.good !== "high";
    if (dmg) because(w, `${def.label} (on ${foe})`, () => w.push({ t: "foe", stat, d: (down ? -1 : 1) * dmg, src: "trigger" }));
  }
  for (const [id, n] of Object.entries(w.s.encounter?.conds ?? {})) {
    if (n === null || w.fresh.foe.has(id)) continue;
    w.push({ t: "cleft", side: "foe", id, rounds: n - 1, src: "drift" });
    if (n - 1 <= 0) announce(w, `${foe} is no longer ${w.r.conditions[id]?.label.toLowerCase() ?? id}.`);
  }
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
    const active = evalBool(e.when, w.env(), false);
    if ((w.s.dismissedEndings ?? []).includes(e.id)) {
      if (!active) w.push({ t: "end_rearm", id: e.id, src: "world" });
      continue;
    }
    if (!active) continue;
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

/** How long an ended encounter stays ended for the story, in the same place (in-game minutes). */
export const ENCOUNTER_REST = 60;

/**
 * The story can't restart an encounter that just ended — it's usually the same
 * incident being described again. A new one needs time to pass, a different
 * place, or the reader's word that it's genuinely new (and never in the same exchange).
 */
export function encounterJustEnded(s: GameState, id: string, fresh: boolean): boolean {
  const last = s.lastEncounter;
  if (!last || last.id !== id) return false;
  if (s.minutes - last.at <= 15) return true; // the same exchange (or right after): never
  if (fresh) return false;
  return last.loc === s.location && s.minutes - last.at < ENCOUNTER_REST;
}

function startEncounter(w: Working, id: string, src: EventSource, opponent?: string) {
  const enc = w.r.encounters[id];
  if (!enc) return;
  const foe = Object.fromEntries(enc.foe.stats.map((s) => [s.id, s.start]));
  w.push({ t: "enc", id, foe, ...(enc.momentum ? { momentum: enc.momentum.start } : {}), ...(opponent ? { foeName: opponent } : {}), src });
  announce(w, `An encounter begins: ${enc.name}${enc.desc ? ` — ${enc.desc}` : ""}. Opponent: ${opponent ?? enc.foe.name}.`);
  because(w, `${enc.name} begins`, () => effectToEvents(w, enc.start, src, {}));
}

/** The same startup transition used by live actions, exposed for offline playtests. */
export function encounterStartEvents(r: Ruleset, before: GameState, id: string, seed: string): WarpEvent[] {
  const w = new Working(r, cloneState(before), seededRng(`${seed}:fx`), seed);
  startEncounter(w, id, "start");
  return w.events;
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
  if (enc && s.round >= enc.roundLimit) {
    announce(w, `The ${enc.roundLimit}-round limit was reached without resolving the encounter: ${enc.timeoutOutcome.replace(/_/g, " ")}.`);
    return enc.timeoutOutcome;
  }
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
  questHooks(builderOf(w), { kind: "encounter", id: s.id, result: outcome, good: !isLoss(enc, outcome) });
}

/** After the player's move: a round passes, the foe acts (odds from the decider or weights), then end checks. */
function encounterRound(w: Working, src: EventSource) {
  if (!w.s.encounter) return;
  let out = encounterOutcome(w);
  if (out) { endEncounter(w, out, src); return; }
  w.push({ t: "round", src });
  const enc = w.r.encounters[w.s.encounter.id];
  // The foe's turn: a status may cost it the move; its blows meet {{user}}'s armor; then its statuses bite and count down.
  const prev = w.turnOf;
  w.turnOf = "foe";
  const lost = lostTurn(w, "foe");
  if (lost) announce(w, `${foeName(w.r, w.s)} is ${lost.toLowerCase()} and loses the turn.`);
  else if (enc?.foeMoves) decide(w, enc.foeMoves, src, {});
  tickSide(w, "foe");
  w.turnOf = prev;
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
  // Hourly statuses: damage over time scales with the time that passed; tick effects run once per hour crossed.
  const from = w.s.minutes - minutes;
  for (const [id, c] of Object.entries(w.s.conditions)) {
    if (w.r.conditions[id]?.every !== "hour") continue;
    // Only the time it actually lasted counts.
    const end = c.until !== null ? Math.min(w.s.minutes, c.until) : w.s.minutes;
    if (end > from) tickPlayer(w, id, (end - from) / 60, Math.min(24, Math.floor(end / 60) - Math.floor(from / 60)));
  }
  for (const [id, c] of Object.entries(w.s.conditions)) {
    if (c.until !== null && c.until <= w.s.minutes) w.push({ t: "cond", id, on: false, src: "drift", note: "expired" });
  }
  for (const [who, conds] of Object.entries(w.s.pconds ?? {})) for (const [id, c] of Object.entries(conds)) {
    if (c.until !== null && c.until <= w.s.minutes) w.push({ t: "pcond", who, id, on: false, src: "drift", note: "expired" });
  }
}

function runTriggers(w: Working, includeRepeat: boolean) {
  const fired = new Set<string>();
  const limit = Math.max(5, Math.min(256, w.r.triggers.length * 2 + 1));
  for (let pass = 0; pass < limit; pass++) {
    let changed = false;
    for (const t of w.r.triggers) {
      // Scene triggers only move when the decision model judged them this phase.
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
      const warning = "Rule processing reached its safety limit. Some rules still disagree with the state; check for a cycle in the ruleset.";
      w.hints.push(warning);
      w.push({ t: "news", text: warning, src: "trigger" });
    }
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
  questLife(builderOf(w));
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
  /** What the player wrote this turn (for keeping a long described move as written). */
  playerText?: string;
  veils?: string[];
  /** Model odds for decide blocks, by decide id. Missing ones fall back to author weights and are listed in `needs`. */
  odds?: Record<string, Record<string, number>>;
  /** Judged plain-language trigger conditions, by trigger id. */
  scene?: Record<string, boolean>;
  /** The scene says an encounter is breaking out (and who the opponent is, when it's someone from the story). */
  encounter?: { id: string; foe?: string; fresh?: boolean };
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
  // After an ending has been written, nothing more resolves until the player loads, starts over or keeps playing.
  if (before.ended?.told && intent?.actionId !== RUN_EPILOGUE) intent = null;
  const w = new Working(r, cloneState(before), seededRng(`${opts.seed}:fx`), opts.seed, opts.odds ?? {}, opts.scene ?? {});
  w.defer = false;
  const rec: TurnRecord = { v: 1, hints: [], events: [], at: Date.now() };
  if (intent && !before.ended && !intent.actionId.startsWith(DATE_PREFIX) && !intent.actionId.startsWith(PAY_PREFIX)
    && !intent.actionId.startsWith(JOB_PREFIX) && !intent.actionId.startsWith(QUEST_PREFIX) && intent.actionId !== RUN_EPILOGUE && !(before.dungeon && intent.actionId === "dungeon")) {
    const valid = intent.actionId === EXPLORE ? canExplore(r, before)
      : intent.actionId.startsWith(TRAVEL_PREFIX) ? travelTargets(r, before).includes(intent.actionId.slice(TRAVEL_PREFIX.length))
      : !!findAction(r, before, intent.actionId);
    if (!valid) return { ...rec, hints: ["The attempted action isn't available in the current state. It did not happen and spent no turn or resources."] };
  }
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
    if (enc?.fromStory && !encounterJustEnded(before, enc.id, opts.encounter.fresh === true)) {
      because(w, `The scene: ${enc.name} breaks out`, () => startEncounter(w, enc.id, "trigger", opts.encounter!.foe));
      encBase = cloneState(w.s);
    }
  }
  let found = intent && !intent.actionId.startsWith(TRAVEL_PREFIX) && !intent.actionId.startsWith(DATE_PREFIX) && !intent.actionId.startsWith(PAY_PREFIX) && !intent.actionId.startsWith(JOB_PREFIX) ? findAction(r, before, intent.actionId) : null;
  // The character's mind may overrule the player: freeze, do something else, or colour the attempt.
  let mind = found ? mindOverride(r, before, found.a, found.target, opts.seed) : null;
  const meant = found ? (found.target ? `${found.a.label} (${personName(r, before, found.target)})` : intent!.label ?? found.a.label) : "";
  if (found && mind?.kind === "redirect") {
    const alt = findAction(r, before, mind.to!.includes(TARGET_SEP) ? mind.to! : `${mind.to}${found.target ? `${TARGET_SEP}${found.target}` : ""}`);
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

  let stunned: string | null = null;
  if (intent?.actionId.startsWith(QUEST_PREFIX)) {
    const label = because(w, "Quests", () => resolveQuest(builderOf(w), intent.actionId));
    if (label) rec.action = { id: intent.actionId, label, via: intent.via };
  } else if (intent?.actionId === EXPLORE) {
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
  } else if (a && inEncounter && (stunned = lostTurn(w, "player"))) {
    // A status costs {{user}} the turn: the move simply doesn't happen, and the foe still acts.
    rec.action = { id: intent!.actionId, label: `${a.label} — ${stunned.toLowerCase()}, turn lost`, via: intent!.via };
    w.hints.push(`{{user}} tries to ${a.label.toLowerCase()}, but is ${stunned.toLowerCase()} and loses the turn — it doesn't happen.`);
    w.turnOf = "player";
    advanceTime(w, 1, "action");
    tickSide(w, "player");
    encounterRound(w, "action");
    beatSheet(w, encBase, rec, opts.playerText);
  } else if (a) {
    const who = found?.target;
    w.action = a;
    w.turnOf = inEncounter ? "player" : null;
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
    // Check numbers and gear describe the committed attempt, before its costs.
    // This is the same context the choice's displayed odds used.
    const checkBefore = cloneState(w.s);
    because(w, `Cost of "${label}"`, () => effectToEvents(w, a.cost, "cost", extra));
    // Using an item spends a charge, or one of it — unless it's a tool that keeps.
    if (a.id.startsWith(ITEM_PREFIX)) {
      const itemId = a.id.slice(ITEM_PREFIX.length);
      const it = r.items[itemId];
      if (it && !it.keep && (w.s.items[itemId] ?? 0) > 0) because(w, `Used ${it.name}`, () => w.push(it.uses > 0 ? { t: "use", id: itemId, n: 1, src: "action" } : { t: "item", id: itemId, d: -1, src: "action" }));
    }
    if (a.id.startsWith(ABILITY_PREFIX)) {
      const enc = encounterKey(checkBefore);
      because(w, `Used ${r.abilities[a.id.slice(ABILITY_PREFIX.length)]?.name ?? a.label}`, () => w.push({ t: "charge", key: a.id, day: dayOf(checkBefore), ...(enc ? { enc } : {}), src: "action" }));
    }

    if (mind?.kind === "fail") {
      const fail = a.outcomes.fail ?? a.outcomes.crit_fail;
      if (fail) because(w, `"${meant}" — ${mind.cause} stopped it`, () => effectToEvents(w, fail, "check", extra));
    } else if (a.check) {
      const rng: Rng = seededRng(opts.seed);
      const { add, target } = checkNumbers(r, checkBefore, a, intent!.params, who);
      let roll = rollDice(a.check.dice, rng);
      let tier = tierFor(a.check, roll, add, target);
      // A perk may step in after a failure: roll again, or let it partly work.
      let perkNote: string | undefined;
      if (tier === "fail" || tier === "crit_fail") {
        const re = perkRuleFor(r, checkBefore, a, "reroll");
        if (re) {
          because(w, `★ ${re.name}`, () => w.push({ t: "charge", key: `perk:${re.perk}:reroll`, day: dayOf(checkBefore), src: "action" }));
          roll = rollDice(a.check.dice, seededRng(`${opts.seed}:reroll`));
          tier = tierFor(a.check, roll, add, target);
          perkNote = `${re.name} rerolled a failure`;
        }
      }
      if (tier === "fail" || tier === "crit_fail") {
        const so = perkRuleFor(r, checkBefore, a, "soften");
        if (so) {
          because(w, `★ ${so.name}`, () => w.push({ t: "charge", key: `perk:${so.perk}:soften`, day: dayOf(checkBefore), src: "action" }));
          tier = tier === "crit_fail" ? "fail" : "partial";
          perkNote = `${so.name}: ${tier === "partial" ? "the failure only half-failed" : "the disaster was only a failure"}`;
        }
      }
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
      const gear = gearFor(r, checkBefore, a).notes;
      if (gear.length) rec.check.gear = gear;
      if (perkNote) rec.check.perk = perkNote;
      questHooks(builderOf(w), { kind: "action", id: a.id, result: tier, good: tier === "success" || tier === "crit_success" });
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
      questHooks(builderOf(w), { kind: "action", id: a.id, result: "success", good: true });
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
      tickSide(w, "player");
      encounterRound(w, "action");
      beatSheet(w, encBase, rec, opts.playerText);
    }
    w.action = null;
    w.turnOf = null;
  } else if (inEncounter && w.s.encounter) {
    // Typed a non-move during an encounter: the opponent still gets their turn.
    w.turnOf = "player";
    tickSide(w, "player");
    w.turnOf = null;
    encounterRound(w, "action");
    beatSheet(w, encBase, rec, opts.playerText);
  }
  // Statuses that tick every turn (outside a fight; in one, rounds do it).
  if (!inEncounter) for (const id of Object.keys(w.s.conditions)) if (r.conditions[id]?.every === "turn") tickPlayer(w, id);

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
  /** The story is sure this is a genuinely new incident, not the one that just ended. */
  encounterFresh?: boolean;
  /** Quests the story handed out, finished or failed. */
  quests?: StoryQuestNews;
  /** Moments people will remember about {{user}}, by name. */
  memories?: Record<string, string>;
}

/** What the story's changes are checked against: the exchange's text and the action that was taken. */
export interface GateContext { text: string; action?: { id: string; tags: string[] } }

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

/** Turn a model's suggested changes into events, enforcing every limit the ruleset sets. */
export function applyProposal(r: Ruleset, before: GameState, p: Proposal, ctx?: GateContext): WarpEvent[] {
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
    const id = slug(person.id || person.name);
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
      if (!gateOpen(def.gate, w, ctx)) continue;
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
    // Each genuine additional use applies its non-check effect. Uses with a
    // check need the dice, so their effects are left to a click.
    const use = id ? r.items[id]?.use : undefined;
    if (id && use && !use.check && count > 0) {
      for (let useIndex = 0; useIndex < count; useIndex++) because(w, `${itemName(r, w.s, id)} used in the story`, () => effectToEvents(w, use.effects, src, {}));
    }
  }

  if (p.move) {
    const k = p.move.toLowerCase();
    const loc = Object.values(r.locations).find((l) => l.id === k || l.name.toLowerCase() === k);
    if (loc && loc.id !== w.s.location) w.push({ t: "move", to: loc.id, src });
    else if (!loc && r.locationsOpen && k !== (w.s.locationName ?? "").toLowerCase()) w.push({ t: "move", to: slug(p.move), name: p.move, src });
  }

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
    advanceTime(w, Math.round(Math.min(p.minutes, r.clock.narratorMax)), src);
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
    const k = String(p.encounter).toLowerCase();
    const enc = r.encounters[k] ?? Object.values(r.encounters).find((x) => x.name.toLowerCase() === k);
    if (enc && encounterJustEnded(w.s, enc.id, p.encounterFresh === true)) { /* the prose is still describing the one that ended */ }
    else if (enc?.fromStory) because(w, `${enc.name} broke out`, () => startEncounter(w, enc.id, src, typeof p.foe === "string" && p.foe.trim() ? p.foe.trim().slice(0, 60) : undefined));
  } else if (p.encounterEnd && w.s.encounter) {
    const name = r.encounters[w.s.encounter.id]?.name ?? "The encounter";
    because(w, `${name} ended`, () => endEncounter(w, slug(String(p.encounterEnd)), src));
  }

  // Quests the story handed out, finished or failed; moments people will remember.
  if (p.quests && typeof p.quests === "object") because(w, "Quests", () => storyQuestNews(builderOf(w), p.quests!, (name) => findPerson(r, w.s, name)));
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
export function perkBlocker(r: Ruleset, s: GameState, id: string, offered = true): string | null {
  const p = r.perks[id];
  if (!p) return "Unknown perk.";
  if (s.perks[id]) return "Already taken.";
  const clash = Object.keys(s.perks).find((o) => p.excludes.includes(o) || r.perks[o]?.excludes.includes(id));
  if (clash) return `Can't go with ${r.perks[clash]?.name ?? clash}.`;
  if (p.requires && !evalBool(p.requires, makeEnv(r, s), false)) return "Requirements not met.";
  if (r.perkPoints && (s.stats[r.perkPoints] ?? 0) < p.cost) return `Needs ${p.cost} point${p.cost === 1 ? "" : "s"}.`;
  if (offered && r.perkPick && !perkOffers(r, s).includes(id)) return "Not on offer right now.";
  return null;
}

/** The stats a perk is about: what it boosts, what its rules touch, what its abilities roll. */
function perkStats(r: Ruleset, id: string): string[] {
  const p = r.perks[id];
  if (!p) return [];
  return [...new Set([
    ...Object.keys(p.bonus), ...p.edges.flatMap((e) => Object.keys(e.stats)),
    ...p.rules.flatMap((x) => ("stat" in x ? [x.stat] : x.stats)),
    ...p.abilities.flatMap((a) => (r.abilities[a] ? checkStats(r, r.abilities[a].action) : [])),
  ])];
}

/** How much a perk builds on how this character has been played: growth in the stats it's about. */
function perkAffinity(r: Ruleset, s: GameState, id: string): number {
  let score = 0;
  for (const stat of perkStats(r, id)) {
    const def = r.stats[stat];
    if (!def) continue;
    const span = Math.max(1, def.max - def.min);
    score += Math.max(0, ((s.stats[stat] ?? def.start) - def.start) / span) + (s.practice?.[stat] ?? 0) * 0.25;
  }
  return score;
}

/**
 * When perks are picked rather than bought (`perks: { pick: 3 }`): what's on
 * offer while there's a point to spend. One builds on how you've played, one
 * takes you somewhere new, the rest are drawn by weight. Fixed until you
 * take one, so the offer doesn't shuffle under you.
 */
export function perkOffers(r: Ruleset, s: GameState): string[] {
  if (!r.perkPick) return [];
  const open = Object.values(r.perks).filter((p) => p.weight > 0 && !perkBlocker(r, s, p.id, false));
  if (!open.length) return [];
  const rng = seededRng(`${s.seed ?? "warp"}:perks:${Object.keys(s.perks).sort().join(",")}`);
  const score = new Map(open.map((p) => [p.id, perkAffinity(r, s, p.id) + rng() * 0.01]));
  const left = [...open];
  const out: string[] = [];
  const take = (p: (typeof open)[number] | undefined) => { if (!p) return; out.push(p.id); left.splice(left.indexOf(p), 1); };
  if (left.length) take([...left].sort((a, b) => score.get(b.id)! - score.get(a.id)!)[0]);
  if (out.length < r.perkPick && left.length) take([...left].sort((a, b) => score.get(a.id)! - score.get(b.id)!)[0]);
  while (out.length < r.perkPick && left.length) {
    const total = left.reduce((n, p) => n + p.weight, 0);
    let x = rng() * total;
    take(left.find((p) => (x -= p.weight) <= 0) ?? left[left.length - 1]);
  }
  return out;
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
