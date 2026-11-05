import { revision } from "../shared/revision.js";
import { actionCount, damage, entityFor, immune, MechanicalKnowledgeError, type DamageType, type EncounterBeat } from "./encounters.js";
import { applyInjury, mendInjury, IMPACTS, type Impact } from "./injuries.js";
import { closeCondition } from "./condition-history.js";
import type { AbilityEffect } from "./abilities.js";
import type { Approach, Condition, MechanicalChange, MechanicalState } from "./mechanics.js";
import type { Evidence, Message } from "./world.js";
import { pathOf, rawPathOf } from "./story-path.js";
import { recordPathMatches } from "./story-text.js";

export type PeriodicPulse =
  | { kind: "damage" | "restore"; resource: string; amount: number; basis: "source" | "warp"; damageType?: DamageType }
  | { kind: "harm" | "mend"; impact: Impact; damageType?: DamageType; maxInjury?: Impact | "any" };
export type EndingRule = "extinguish" | "stanch" | "detox" | "recover";
const ENDINGS: Record<EndingRule, string> = { extinguish: "When the flames are extinguished", stanch: "When the bleeding is stopped", detox: "An effective antidote or established toxin recovery", recover: "When the supported recovery is complete" };
export interface PeriodicSpec { name: string; ending: string; duration?: number; untilCleared?: true; endingRule?: EndingRule; cadence: "owner_action"; timingBasis: "source" | "warp"; pulse: PeriodicPulse; }
export type BuildupTrigger = ({ kind: "periodic" } & PeriodicSpec)
  | { kind: "condition"; name: string; ending: string; helps: Approach[]; hinders: Approach[]; blocks: Approach[]; duration?: number };
export interface PeriodicState { rule: 1; caster: string; nextAt: number; remaining?: number; endingRule?: EndingRule; timingBasis: "source" | "warp"; pulse: PeriodicPulse; startedBy: string; }
export interface BuildupTrack { id: string; owner: string; name: string; current: number; threshold: number; trigger: BuildupTrigger; fingerprint: string; basis: "source" | "warp"; source: Evidence; definition?: { ability: string; version: number; index: number }; }
export type BuildupObservation = { kind: "buildup"; value: BuildupTrack; correction?: true };
type DefinitionRef = { ability: string; version: number; index: number } | { effect: AbilityEffect };
export type PeriodicObservation = { kind: "periodic"; value: Condition; definition: DefinitionRef };
const physical: DamageType[] = ["physical", "fire", "cold", "electric", "poison"];
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 160) => typeof v === "string" && v.trim().length <= max ? v.trim() : "";
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 1e6;
const numberIn = (quote: string, n: number) => (quote.match(/\d+(?:\.\d+)?/g) ?? []).some(v => Number(v) === n)
  || ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"].some((w, i) => n === i && new RegExp(`\\b${w}\\b`, "i").test(quote));
const norm = (v: string) => v.normalize("NFKC").trim().toLocaleLowerCase();
const fields = (v: Record<string, unknown>, keys: string[]) => { if (Object.keys(v).some(k => !keys.includes(k))) throw Error("Unsupported lingering effect field"); };
const duration = (v: unknown, quote: string) => { if (!positive(v) || !Number.isInteger(v) || v > 10000 || !numberIn(quote, v)) throw Error("Lingering duration needs an explicit action count"); return v; };
function scopes(v: unknown): Approach[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some(x => !["movement", "precision", "force", "speech", "perception", "concentration"].includes(x))) throw Error("Unknown lingering constraint");
  return [...new Set(v as Approach[])];
}
function readPulse(v: unknown, quote: string): PeriodicPulse {
  if (!obj(v)) throw Error("Missing periodic pulse");
  if (v.kind === "damage" || v.kind === "restore") {
    fields(v, ["kind", "resource", "amount", "basis", "magnitude", "damageType"]);
    const exact = positive(v.amount) && numberIn(quote, v.amount), magnitude = IMPACTS[v.magnitude as Impact];
    if (!text(v.resource) || v.amount !== undefined && !exact || !exact && !magnitude) throw Error("Periodic amount needs a source number or supported magnitude");
    if (v.damageType !== undefined && ![...physical, "mental", "untyped"].includes(v.damageType as DamageType)) throw Error("Unknown periodic damage type");
    return { kind: v.kind, resource: text(v.resource), amount: exact ? v.amount as number : magnitude, basis: exact ? "source" : "warp", ...(v.damageType ? { damageType: v.damageType as DamageType } : {}) };
  }
  if (v.kind === "harm" || v.kind === "mend") {
    fields(v, ["kind", "impact", "damageType", "maxInjury"]);
    if (!Object.hasOwn(IMPACTS, v.impact as string) || v.kind === "harm" && !physical.includes(v.damageType as DamageType)) throw Error("Unsupported periodic physical effect");
    if (v.maxInjury !== undefined && (!["minor", "standard", "major", "any"].includes(v.maxInjury as string)
      || !(v.maxInjury === "any" ? /\b(?:all|any)\b/i : new RegExp(`\\b${v.maxInjury}\\b`, "i")).test(quote))) throw Error("Unsourced periodic treatment limit");
    return { kind: v.kind, impact: v.impact as Impact, ...(v.kind === "harm" ? { damageType: v.damageType as DamageType } : {}), ...(v.maxInjury ? { maxInjury: v.maxInjury as Impact | "any" } : {}) };
  }
  throw Error("A periodic pulse cannot schedule another effect");
}
function readPeriodic(v: Record<string, unknown>, quote: string): PeriodicSpec {
  const name = text(v.name), rule = v.endingRule as EndingRule | undefined;
  if (rule !== undefined && !Object.hasOwn(ENDINGS, rule)) throw Error("Unknown Warp ending rule");
  const ongoing = v.untilCleared === true || rule !== undefined && v.untilCleared === undefined;
  const ending = text(v.ending, 240) || (rule ? ENDINGS[rule] : "");
  if (!name || !ending || v.cadence !== "owner_action") throw Error("Periodic effects require affected-owner action timing");
  if (/\b(?:seconds?|minutes?|hours?|days?|rounds?)\b/i.test(quote)) throw Error("Real-time and round timing cannot become owner actions");
  if (v.timingBasis !== undefined && !["source", "warp"].includes(v.timingBasis as string)) throw Error("Unknown periodic timing basis");
  if (v.untilCleared !== undefined && v.untilCleared !== true || ongoing && (v.duration !== undefined || (!rule || ending !== ENDINGS[rule]) && !norm(quote).includes(norm(ending)))) throw Error("An ongoing effect needs its actual sourced ending and no invented duration");
  if (v.duration === undefined && !ongoing) throw Error("Periodic effects need a duration or a sourced ending trigger");
  const pulse = readPulse(v.pulse, quote);
  if (rule) {
    const compatible = rule === "recover" ? pulse.kind === "mend" || pulse.kind === "restore"
      : (pulse.kind === "harm" || pulse.kind === "damage") && pulse.damageType === ({ extinguish: "fire", stanch: "physical", detox: "poison" } as const)[rule];
    if (!ongoing || v.duration !== undefined || !compatible) throw Error("A Warp ending rule must match its actual ongoing effect");
  }
  return { name, ending, ...(ongoing ? { untilCleared: true as const } : { duration: duration(v.duration, quote) }), ...(rule ? { endingRule: rule } : {}), cadence: "owner_action", timingBasis: v.timingBasis as "source" | "warp" ?? (ongoing ? "warp" : "source"), pulse };
}
function readTrigger(v: unknown, quote: string): BuildupTrigger {
  if (!obj(v)) throw Error("Missing buildup trigger");
  if (v.kind === "periodic") { fields(v, ["kind", "name", "ending", "duration", "untilCleared", "endingRule", "cadence", "timingBasis", "pulse"]); return { kind: "periodic", ...readPeriodic(v, quote) }; }
  if (v.kind !== "condition") throw Error("Buildup can trigger one condition or finite periodic effect");
  fields(v, ["kind", "name", "ending", "helps", "hinders", "blocks", "duration"]);
  if (!text(v.name) || !text(v.ending, 240)) throw Error("Buildup condition needs an ending");
  return { kind: "condition", name: text(v.name), ending: text(v.ending, 240), helps: scopes(v.helps), hinders: scopes(v.hinders), blocks: scopes(v.blocks), ...(v.duration === undefined ? {} : { duration: duration(v.duration, quote) }) };
}
export function readLingeringEffect(v: Record<string, unknown>, quote: string): AbilityEffect {
  if (!["self", "target"].includes(v.target as string)) throw Error("Unknown lingering target");
  const target = v.target as "self" | "target";
  if (v.kind === "periodic") {
    fields(v, ["kind", "target", "name", "ending", "duration", "untilCleared", "endingRule", "cadence", "timingBasis", "pulse"]);
    return { kind: "periodic", target, ...readPeriodic(v, quote) };
  }
  if (v.kind === "clear_buildup") {
    fields(v, ["kind", "target", "name"]); if (!text(v.name)) throw Error("Missing accumulation to clear");
    return { kind: "clear_buildup", target, name: text(v.name) };
  }
  fields(v, ["kind", "target", "name", "amount", "threshold", "basis", "magnitude", "trigger"]);
  const exact = positive(v.amount) && positive(v.threshold) && numberIn(quote, v.amount) && numberIn(quote, v.threshold);
  const magnitude = { minor: 1, standard: 2, major: 3 }[v.magnitude as Impact];
  if (!text(v.name) || (v.amount !== undefined || v.threshold !== undefined) && !exact || !exact && !magnitude) throw Error("Buildup requires sourced quantities or a Warp accumulation grade");
  const amount = exact ? v.amount as number : magnitude, threshold = exact ? v.threshold as number : 3;
  if (![amount, threshold].every(n => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6)) throw Error("Buildup supports at most three decimal places");
  return { kind: "buildup", target, name: text(v.name), amount, threshold, basis: exact ? "source" : "warp", trigger: readTrigger(v.trigger, quote) };
}

/** Restore input grades when revalidating engine-labelled saved definitions. */
export function lingeringInput(e: AbilityEffect): AbilityEffect {
  const value = structuredClone(e) as any;
  const pulse = (p: any) => p?.basis === "warp" ? { ...p, amount: undefined, magnitude: ({ 5: "minor", 15: "standard", 30: "major" } as any)[p.amount] } : p;
  if (value.pulse) value.pulse = pulse(value.pulse);
  if (value.trigger?.pulse) value.trigger.pulse = pulse(value.trigger.pulse);
  if (value.kind === "buildup" && value.basis === "warp") { value.magnitude = ({ 1: "minor", 2: "standard", 3: "major" } as any)[value.amount]; delete value.amount; delete value.threshold; }
  return value;
}
export const isLingering = (e: AbilityEffect) => ["periodic", "buildup", "clear_buildup"].includes(e.kind);
export const hasLingering = (s: MechanicalState) => !!(s.buildups?.length || s.conditions.some(c => c.periodic));

/** Initial explicit counts reuse a compiled trigger; observations cannot rewind receipts. */
export function readBuildup(row: Record<string, unknown>, state: MechanicalState, source: Evidence, correction: boolean, historical: boolean): BuildupObservation | undefined {
  if (Object.keys(row).some(k => !["kind", "owner", "name", "current", "caster", "ability", "message", "quote", "sourceRevision", "viewRevision", ...(historical ? ["id", "threshold", "trigger", "fingerprint", "basis", "source", "definition"] : [])].includes(k))) return;
  const owner = text(row.owner, 80), name = text(row.name), current = row.current;
  if (!owner || !name || typeof current !== "number" || !Number.isFinite(current) || current < 0 || !numberIn(source.quote, current) || !norm(source.quote).includes(norm(name))) return;
  if (!correction && state.buildups?.some(b => b.owner === owner && norm(b.name) === norm(name))) return;
  let candidates: { ability: string; version: number; index: number; effect: AbilityEffect }[] = [];
  if (historical && obj(row.definition)) {
    const ref = row.definition, a = state.abilities?.find(a => a.id === ref.ability && a.version === ref.version);
    const index = typeof ref.index === "number" && Number.isInteger(ref.index) ? ref.index : -1, effect = a?.effects[index];
    if (a && effect?.kind === "buildup" && norm(effect.name!) === norm(name)) candidates = [{ ability: a.id, version: a.version, index, effect }];
  } else for (const a of state.abilities ?? []) if (a.owner === row.caster && (a.id === row.ability || norm(a.name) === norm(text(row.ability)))) {
    a.effects.forEach((effect, index) => { if (effect.kind === "buildup" && norm(effect.name!) === norm(name)) candidates.push({ ability: a.id, version: a.version, index, effect }); });
  }
  if (candidates.length !== 1) return;
  const { effect, ...definition } = candidates[0];
  if (current >= effect.threshold! || Math.abs(current * 1000 - Math.round(current * 1000)) > 1e-6) return;
  return { kind: "buildup", value: { id: `buildup-${revision([owner, norm(name)])}`, owner, name, current, threshold: effect.threshold!, trigger: structuredClone(effect.trigger!), fingerprint: revision([effect.threshold, effect.trigger]), basis: effect.basis!, definition, source }, ...(correction ? { correction: true } : {}) };
}

/** Adopt a presently narrated effect, never retrospectively apply its old damage or cost. */
export function readPeriodicObservation(row: Record<string, unknown>, state: MechanicalState, source: Evidence, messages: Message[], historical: boolean, correction = false): PeriodicObservation | undefined {
  if (source.message.startsWith("warp-source:") || Object.keys(row).some(k => !["kind", "owner", "name", "caster", "ability", "remaining", "effect", "message", "quote", "sourceRevision", "viewRevision", ...(historical ? ["definition"] : [])].includes(k))) return;
  const latest = messages.filter(m => (!m.is_user || /^\s*\(?OOC correction:/i.test(m.content)) && !!m.content.trim() && !m.id.startsWith("warp-source:")).at(-1);
  if (source.message !== latest?.id) return;
  // An unresolved action cannot acquire its effects through the later prose read.
  const at = messages.findIndex(m => m.id === source.message), prefix = messages.slice(0, at), player = prefix.at(-1);
  const slots = player?.metadata?.warpLivingPrompt;
  const preparation = obj(slots) ? slots[String(player?.swipe_id ?? 0)] : undefined;
  if (!correction && player?.is_user && obj(preparation) && preparation.version === 1 && typeof preparation.path === "string"
    && recordPathMatches(player, preparation.path, pathOf(prefix), rawPathOf(prefix), true)
    && obj(preparation.receipt) && preparation.receipt.status === "blocked") return;
  const owner = text(row.owner, 80), name = text(row.name), old = state.conditions.find(c => c.owner === owner && norm(c.name) === norm(name));
  if (!owner || !name || !norm(source.quote).includes(norm(name)) || !correction && (old?.periodic || old && (old.source.message !== source.message || old.source.sourceRevision !== source.sourceRevision))) return;
  const candidates: { caster: string; definition: DefinitionRef; effect: AbilityEffect }[] = [];
  for (const a of state.abilities ?? []) a.effects.forEach((effect, index) => {
    const selected = historical && obj(row.definition) ? a.id === row.definition.ability && a.version === row.definition.version && index === row.definition.index : a.owner === row.caster && (a.id === row.ability || norm(a.name) === norm(text(row.ability)));
    if (selected && effect.kind === "periodic" && norm(effect.name!) === norm(name)) candidates.push({ caster: a.owner, definition: { ability: a.id, version: a.version, index }, effect });
  });
  const direct = historical && obj(row.definition) && obj(row.definition.effect) ? lingeringInput(row.definition.effect as unknown as AbilityEffect) : row.effect;
  if (direct !== undefined) {
    if (candidates.length || !obj(direct) || direct.kind !== "periodic" || direct.target !== "self") return;
    let effect: AbilityEffect;
    try { effect = readLingeringEffect(direct, source.quote); } catch { return; }
    if (norm(effect.name!) !== norm(name)) return;
    candidates.push({ caster: text(row.caster, 80) || "environment", definition: { effect }, effect });
  }
  if (candidates.length !== 1) return;
  const { caster, definition, effect } = candidates[0], remaining = row.remaining;
  if (effect.duration !== undefined && (typeof remaining !== "number" || !Number.isInteger(remaining) || remaining <= 0 || remaining > effect.duration || !numberIn(source.quote, remaining))) return;
  if (effect.duration === undefined && remaining !== undefined) return;
  try { validatePulse(state, caster, owner, effect.pulse!); } catch { return; }
  return { kind: "periodic", definition, value: { ...(old ?? { id: `periodic-start-${revision([owner, norm(name)])}`, owner, helps: [], hinders: [], blocks: [] }), name, ending: effect.ending!, source,
    periodic: { rule: 1, caster, nextAt: actionCount(state, owner) + 1, ...(typeof remaining === "number" ? { remaining } : {}), timingBasis: effect.timingBasis!, ...(effect.endingRule ? { endingRule: effect.endingRule } : {}), pulse: structuredClone(effect.pulse!), startedBy: revision([source, definition]) } } };
}
function resourceFor(state: MechanicalState, owner: string, p: Extract<PeriodicPulse, { resource: string }>) {
  const found = state.resources.filter(r => r.owner === owner && (r.id === p.resource || norm(r.name) === norm(p.resource)));
  if (found.length !== 1 || p.kind === "restore" && found[0].max === undefined) throw new MechanicalKnowledgeError(`Periodic ${p.kind} needs a known ${p.resource}${p.kind === "restore" ? " and recovery limit" : ""} for ${owner}`);
  return found[0];
}
function validatePulse(state: MechanicalState, actor: string, owner: string, p: PeriodicPulse) {
  if (p.kind === "damage" || p.kind === "restore") resourceFor(state, owner, p);
  else if (p.kind === "harm") applyInjury(structuredClone(state), actor, owner, IMPACTS[p.impact], p.damageType!, [], [], "periodic-preflight");
  else if (p.kind === "mend") {
    if (owner !== "you" && entityFor(state, owner)?.entityKind !== "person") throw new MechanicalKnowledgeError("Periodic treatment needs a supported living subject");
    try { mendInjury(structuredClone(state), owner, p.impact, [], [], "periodic-preflight", p.maxInjury); }
    catch (error) { if (error instanceof MechanicalKnowledgeError) throw error; }
  }
}
export function validateLingering(state: MechanicalState, actor: string, owner: string, e: AbilityEffect) {
  if (e.kind === "periodic") validatePulse(state, actor, owner, e.pulse!);
  if (e.kind === "buildup") {
    const old = state.buildups?.find(b => b.owner === owner && norm(b.name) === norm(e.name!));
    if (old && old.fingerprint !== revision([e.threshold, e.trigger])) throw new MechanicalKnowledgeError(`${e.name}: the existing buildup definition conflicts with this effect`);
    if (e.trigger?.kind === "periodic") validatePulse(state, actor, owner, e.trigger.pulse);
  }
}
function condition(state: MechanicalState, id: string, actor: string, owner: string, spec: BuildupTrigger, action: string, changes: MechanicalChange[]) {
  const old = state.conditions.find(c => c.id === id);
  if (spec.kind === "periodic" && !old?.periodic && state.conditions.filter(c => c.owner === owner && c.periodic).length >= 32) throw new MechanicalKnowledgeError("This actor already has the supported maximum of active periodic effects");
  const source = { message: `warp-action:${action}`, quote: `${spec.name} applied to ${owner}`, sourceRevision: revision([action, id, spec]) };
  const next: Condition = { id, owner, name: spec.name, ending: spec.ending, source, helps: spec.kind === "condition" ? spec.helps : [], hinders: spec.kind === "condition" ? spec.hinders : [], blocks: spec.kind === "condition" ? spec.blocks : [],
    ...(spec.kind === "periodic" ? { periodic: { rule: 1 as const, caster: actor, nextAt: actionCount(state, owner) + 1, ...(spec.duration ? { remaining: spec.duration } : {}), timingBasis: spec.timingBasis, ...(spec.endingRule ? { endingRule: spec.endingRule } : {}), pulse: structuredClone(spec.pulse), startedBy: revision([action, id, actionCount(state, owner), old?.periodic?.startedBy]) } } : spec.duration ? { expiresAt: actionCount(state, owner) + spec.duration + 1 } : {}) };
  if (spec.kind === "periodic") { state.clocks ??= []; if (!state.clocks.some(c => c.actor === owner)) state.clocks.push({ id: owner, actor: owner, actions: 0 }); }
  if (old) state.conditions[state.conditions.indexOf(old)] = next; else state.conditions.push(next);
  changes.push({ kind: "condition", id, before: old ? structuredClone(old) : null, after: structuredClone(next) });
}
export function applyLingering(state: MechanicalState, actor: string, owner: string, e: AbilityEffect, key: string, action: string, changes: MechanicalChange[], beats: EncounterBeat[]) {
  if (e.kind === "periodic") { condition(state, `periodic-${revision([key, owner])}`, actor, owner, { kind: "periodic", name: e.name!, ending: e.ending!, ...(e.duration ? { duration: e.duration } : { untilCleared: true as const }), cadence: "owner_action", timingBasis: e.timingBasis!, ...(e.endingRule ? { endingRule: e.endingRule } : {}), pulse: e.pulse! }, action, changes); return; }
  const old = state.buildups?.find(b => b.owner === owner && norm(b.name) === norm(e.name!));
  if (e.kind === "clear_buildup") {
    if (old?.current) { const before = structuredClone(old); old.current = 0; old.source = { message: `warp-action:${action}`, quote: `${old.name} cleared`, sourceRevision: revision([action, key]) }; changes.push({ kind: "buildup", id: old.id, before, after: structuredClone(old) }); }
    return;
  }
  const threshold = e.threshold!, total = Math.round((old?.current ?? 0) * 1000) + Math.round(e.amount! * 1000), units = Math.round(threshold * 1000), crossings = Math.floor(total / units);
  const next: BuildupTrack = { id: old?.id ?? `buildup-${revision([owner, norm(e.name!)])}`, owner, name: old?.name ?? e.name!, current: total % units / 1000, threshold, trigger: structuredClone(e.trigger!), fingerprint: revision([threshold, e.trigger]), basis: e.basis!, source: { message: `warp-action:${action}`, quote: `${e.name} applied to ${owner}`, sourceRevision: revision([action, key]) } };
  state.buildups ??= []; if (old) state.buildups[state.buildups.indexOf(old)] = next; else state.buildups.push(next);
  changes.push({ kind: "buildup", id: next.id, before: old ? structuredClone(old) : null, after: structuredClone(next) });
  beats.push({ kind: "buildup", actor, target: owner, name: next.name, amount: next.current });
  if (crossings) { condition(state, `buildup-trigger-${next.id}`, actor, owner, next.trigger, action, changes); beats.push({ kind: "threshold", actor, target: owner, name: next.trigger.name, amount: crossings }); }
}
function periodicMend(state: MechanicalState, actor: string, pulse: Extract<PeriodicPulse, { impact: Impact }>, action: string, changes: MechanicalChange[], beats: EncounterBeat[]) {
  const grades = { minor: 1, standard: 2, major: 3 }, max = { ...grades, any: 4 }[pulse.maxInjury ?? "any"];
  const wound = !state.conditions.some(c => c.owner === actor && c.injury) && state.conditions.filter(c => c.owner === actor && c.category === "physical_injury" && c.recovery === "routine" && c.severity).sort((a, b) => grades[b.severity!] - grades[a.severity!])[0];
  if (wound && grades[wound.severity!] <= max && grades[wound.severity!] > grades[pulse.impact]) {
    const before = structuredClone(wound), nextGrade = grades[wound.severity!] - grades[pulse.impact];
    wound.severity = (["minor", "standard", "major"] as const)[nextGrade - 1];
    changes.push({ kind: "condition", id: wound.id, before, after: structuredClone(wound) });
    beats.push({ kind: "mend", actor, target: actor, name: `${wound.name}: improving`, basis: "warp" });
    return;
  }
  const copy = structuredClone(state);
  try { mendInjury(copy, actor, pulse.impact, [], [], action, pulse.maxInjury); mendInjury(state, actor, pulse.impact, changes, beats, action, pulse.maxInjury); }
  catch (error) {
    if (!(error instanceof Error) || !["No recorded physical injury to treat", "No supported physical injury to treat", "This injury exceeds the treatment's supported severity"].includes(error.message)) throw error;
    beats.push({ kind: "skipped", actor, name: "Recovery pulse", reason: error.message });
  }
}
function recovered(state: MechanicalState, owner: string, pulse: PeriodicPulse) {
  if (pulse.kind === "restore") { const r = resourceFor(state, owner, pulse); return r.current >= r.max!; }
  if (pulse.kind !== "mend") return false;
  if (state.conditions.some(c => c.owner === owner && (c.injury || c.category === "physical_injury"))) return false;
  const health = state.resources.find(r => r.owner === owner && (r.role === "vital" || /^(?:health|hp|vitality)$/i.test(r.name)));
  return !health || health.max !== undefined && health.current >= health.max;
}
export const scheduledPulses = (s: MechanicalState, actor: string) => s.conditions.filter(c => c.owner === actor && c.periodic).map(c => structuredClone(c));
/** Old due pulses survive a refresh. A cure removes their condition before this boundary. */
export function finishPulses(state: MechanicalState, actor: string, beforeCount: number, scheduled: Condition[], action: string, changes: MechanicalChange[], beats: EncounterBeat[]) {
  const count = actionCount(state, actor); if (count <= beforeCount) return;
  for (const old of scheduled) {
    const p = old.periodic!, current = state.conditions.find(c => c.id === old.id);
    if (!current?.periodic || p.nextAt > count) continue;
    const effect = p.pulse;
    if (effect.kind === "damage" || effect.kind === "restore") {
      const resource = resourceFor(state, actor, effect);
      if (effect.kind === "damage") damage(state, p.caster, actor, resource, effect.amount, effect.damageType ?? "untyped", changes, beats, false, true, true, action);
      else { const before = structuredClone(resource); resource.current = Math.min(resource.max!, resource.current + effect.amount); if (resource.current !== before.current) changes.push({ kind: "resource", id: resource.id, before, after: structuredClone(resource) }); }
    } else if (effect.kind === "harm") applyInjury(state, p.caster, actor, IMPACTS[effect.impact], effect.damageType!, changes, beats, action);
    else if (effect.kind === "mend") periodicMend(state, actor, effect, action, changes, beats);
    beats.push({ kind: "pulse", actor: p.caster, target: actor, name: old.name });
    const live = state.conditions.find(c => c.id === old.id);
    if (!live?.periodic || live.periodic.startedBy !== p.startedBy) continue;
    const before = structuredClone(live); if (live.periodic.remaining !== undefined) live.periodic.remaining--; live.periodic.nextAt = count + 1;
    if (live.periodic.remaining !== undefined && live.periodic.remaining <= 0 || live.periodic.endingRule === "recover" && recovered(state, actor, effect)) {
      state.conditions = state.conditions.filter(c => c.id !== live.id); closeCondition(state, live, { kind: "receipt", id: action });
      changes.push({ kind: "condition", id: live.id, before, after: null }); beats.push({ kind: "expired", actor, name: live.name });
    } else changes.push({ kind: "condition", id: live.id, before, after: structuredClone(live) });
  }
}

export function lingeringOffensive(e: AbilityEffect, owner: string, state: MechanicalState): boolean {
  const harmful = (p: PeriodicPulse) => p.kind === "damage" || p.kind === "harm";
  const harmfulTrigger = (t: BuildupTrigger) => t.kind === "periodic" ? harmful(t.pulse) : !!(t.blocks.length || t.hinders.length || !t.helps.length);
  if (e.kind === "periodic") return harmful(e.pulse!);
  if (e.kind === "buildup") return harmfulTrigger(e.trigger!);
  if (e.kind === "clear_buildup") return !!state.buildups?.some(b => b.owner === owner && norm(b.name) === norm(e.name!) && !harmfulTrigger(b.trigger));
  return false;
}

export function lingeringImmune(e: AbilityEffect, owner: string, state: MechanicalState): boolean {
  const p = e.kind === "periodic" ? e.pulse : e.kind === "buildup" && e.trigger?.kind === "periodic" ? e.trigger.pulse : undefined;
  return !!p && (p.kind === "damage" || p.kind === "harm") && immune(state, owner, p.damageType ?? "untyped");
}
export function pulseDescription(p: PeriodicPulse, state?: MechanicalState): string {
  if ("impact" in p) return `${p.impact} ${p.kind === "harm" ? `${p.damageType} harm` : "physical treatment"} · Warp interpretation`;
  const name = state?.resources.find(r => r.id === p.resource)?.name ?? p.resource;
  return `${p.kind === "restore" ? "restore" : "lose"} ${p.amount} ${name}${p.damageType ? ` · ${p.damageType}` : ""}${p.basis === "warp" ? " · Warp value" : ""}`;
}
export function lingeringDescription(e: AbilityEffect, state?: MechanicalState): string {
  if (e.kind === "clear_buildup") return `Clear ${e.name} accumulation`;
  if (e.kind === "buildup") return `${e.name}: +${e.amount} toward ${e.threshold}, then ${e.trigger!.name}${e.basis === "warp" ? " · Warp values" : ""}`;
  return `${e.name}: ${pulseDescription(e.pulse!, state)} after ${e.duration ? `each of ${e.target === "self" ? "your" : "the target's"} next ${e.duration} supported actions` : `each affected-owner action · ${e.ending}`}${e.timingBasis === "warp" ? " · Warp action timing" : ""}`;
}

export const LINGERING_INSTRUCTIONS = `Lingering effects use the same saved action receipts, never a separate simulator or model call. Prepare only source-backed accumulation or periodic powers, not ordinary conversation, affection, meals or automatic survival taxes.
Periodic: {kind:"periodic",target:"self|target",name,ending,duration?:explicitAffectedOwnerActionCount,untilCleared?:true,endingRule?:"extinguish|stanch|detox|recover",cadence:"owner_action",timingBasis?:"source|warp",pulse:{kind:"damage|restore",resource,amount:explicitNumber}}; pulse may use magnitude:"minor|standard|major" instead of an absent amount, and damageType. Physical pulse alternatives are {kind:"harm",impact:"minor|standard|major",damageType} or {kind:"mend",impact,maxInjury?}. Never nest scheduling, buildup, summons, scripts or costs inside a pulse. Use an explicit action duration when sourced. Otherwise an established ongoing effect can use untilCleared:true with ending copied exactly from its source quote, and Warp affected-owner action timing. For an actual ordinary ongoing physical affliction with no stated ending, Warp provides fixed endingRule:"extinguish" for fire, "stanch" for physical bleeding, "detox" for poison, or "recover" for ongoing supported physical/resource recovery. The recover rule ends when that supported recovery reaches its actual limit, not after an invented duration. Omit ending to use its engine-defined recovery cue; it is a Warp rule, not a source claim. Never apply these to metaphors, blushes, illness of unknown cause, curses or special prohibitions; retain unsupported restrictions. Do not invent a duration, fee, cure quest or source limitation. This qualitative action cadence is labelled Warp timing and cannot override any explicit interval, seconds or round rule. The effect starts on the affected owner's NEXT supported action, after that action's effects. This cadence is an engine approximation, never a new fictional need to move or act in order to heal; do not turn it into a source limitation. A cure removes it before the due pulse; refreshing cannot cancel an old due pulse. Questions, API waiting, inspection and permission withdrawal never tick it. Seconds, rounds, ongoing auras, on-hit counters and unsupported timing belong in unsupported; never convert them to owner actions.
Buildup: {kind:"buildup",target,name,amount:explicitNumber,threshold:explicitNumber,trigger:{kind:"condition",name,ending,helps:[],hinders:[],blocks:[],duration?}}. A trigger may instead be one periodic spec above without target. Use sourced quantities together. Only when actual source accumulation has no quantities, omit amount/threshold and supply magnitude:"minor|standard|major"; Warp maps 1/2/3 steps toward 3 and labels its values. Never replace instant effects or explicit numbers with that mapping. Crossing consumes the threshold and retains the remainder, applies/refreshes one condition, and cannot loop into more actions or rewards. Reuse the same meter/name/trigger definition; incompatible rules remain unresolved. Source-backed clearing uses {kind:"clear_buildup",target,name}; it resets accumulation, not an already triggered condition. Curing an active effect separately uses clear_condition. Do not force feelings, consent, quests or attraction from a threshold.
A presently narrated active effect in the latest actual narrator message may use mechanicalObservations {kind:"periodic",owner,name,caster,ability,remaining?,message,quote}, referencing one compiled periodic ability. If the original caster/ability or its past costs are unknown, the same observation may instead supply effect:{kind:"periodic",target:"self",name,ending?,endingRule?:"extinguish|stanch|detox|recover",duration?,untilCleared?,cadence:"owner_action",timingBasis?,pulse}, derived ONLY from this current actual narrator quote, with no invented count or cause. Do not create a fake player-owned ability to represent an affliction. Do not infer activation from a profile, intention or an older event. A blocked/unresolved preparation did not execute; do not adopt a new periodic effect from that reply. Focusing toward an invocation, preparing, trying to start or waiting to see it work is not an active effect. Cite the actual ongoing effect, not a nearby mention of its name. For actual current Burning without a stated ending, the complete effect is {kind:"periodic",target:"self",name:"Burning",untilCleared:true,endingRule:"extinguish",cadence:"owner_action",pulse:{kind:"harm",impact:"minor",damageType:"fire"}}. For an already active gentle physical regeneration with no interval, use untilCleared:true, endingRule:"recover" and pulse:{kind:"mend",impact:"minor"}. Do not omit BOTH ending and endingRule; that discards the future schedule. Do not emit a duplicate plain condition unless it has separately supported constraints to retain. A finite effect needs its explicit current remaining count in that quote; an ongoing untilCleared effect needs no invented count. This adopts only its future schedule, never old costs/damage/rolls. Repeated prose cannot refresh an existing schedule or resurrect a cured one.
Initial explicit buildup counts may use mechanicalObservations {kind:"buildup",owner,name,current,caster,ability,message,quote} referencing one already compiled buildup ability. Cite the actual count and meter name. Never supply trigger rules or overwrite an existing count; action receipts own subsequent changes. A finite receipt-scheduled effect cannot be expired or cured through prose alone; use a supported cure operation or explicit correction. For an ongoing untilCleared effect only, an actual later environmental/source-defined ending with no counted item, spell or resource execution may use {kind:"condition_end",id,natural:true,ending:"exact saved ending",message,quote}. Cite its completed cause, not merely "it is gone", an intention, a negated outcome or a rulebook explanation. Do not end the effect in its own application reply or guess an earlier ending after it was reapplied. This ends only the ongoing condition, never heals recorded damage or spends/grants anything.
Keep missing pools/recovery limits unresolved; do not invent HP. Known definitions retain their effects and are not regenerated. Report human effect names and only consequential changes, not internal IDs. Relevant saved counts and remaining pulses may be answered on request. Omitted state is not erased.`;
