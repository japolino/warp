import { revision } from "../shared/revision.js";
import type { Evidence, Message } from "./world.js";
import type { Condition, MechanicalState, MechanicalChange } from "./mechanics.js";
import { actorName, absorbDamage, damage, vital, type DamageType, type EncounterBeat, MechanicalKnowledgeError } from "./encounters.js";
import { closeCondition } from "./condition-history.js";

export const IMPACTS = { minor: 5, standard: 15, major: 30 } as const;
export type Impact = keyof typeof IMPACTS;
export const BODY_RESILIENCE = { frail: 0.5, ordinary: 1, tough: 2, exceptional: 8 } as const;
export interface Resilience { id: string; owner: string; band: keyof typeof BODY_RESILIENCE; version: number; basis: "warp"; source: Evidence; }
export interface Injury { rule: 1; load: number; basis: "warp"; }
const PHYSICAL_TYPES: DamageType[] = ["physical", "fire", "cold", "electric", "poison"];
export const injuryId = (owner: string) => `injury-${revision(owner)}`;
export const isVitalSelector = (selector?: string) => !!selector && /^(?:health|hp|vitality|vital)$/i.test(selector.trim());

export function readResilience(row: Record<string, unknown>, state: MechanicalState, owner: string, source: Evidence, messages: Message[], correction: boolean): Resilience | undefined {
  if (!Object.hasOwn(BODY_RESILIENCE, row.band as string)) return;
  const old = state.resilience?.find(r => r.owner === owner);
  if (old) {
    const message = messages.find(m => m.id === source.message);
    const profileKind = (id: string) => id.match(/^warp-source:(card|persona|lore):/)?.[1];
    const edited = profileKind(source.message) && profileKind(source.message) === profileKind(old.source.message) && message && !message.content.replace(/\s+/g, " ").includes(old.source.quote);
    if (old.band === row.band || (!correction && !edited)) return;
  }
  return { id: old?.id ?? `resilience-${revision(owner)}`, owner, band: row.band as Resilience["band"], version: (old?.version ?? 0) + 1, basis: "warp", source };
}

/** Defined game consequences, not a fictional HP maximum or a medical diagnosis. */
export function applyInjury(state: MechanicalState, actor: string, target: string, raw: number, type: DamageType, changes: MechanicalChange[], beats: EncounterBeat[], action: string, secondary = false) {
  const pool = vital(state, target);
  if (pool) { damage(state, actor, target, pool, raw, type, changes, beats, secondary, true, true, action); return; }
  if (!PHYSICAL_TYPES.includes(type)) throw new MechanicalKnowledgeError(`No physical injury mapping for ${type} damage without a known resource`);
  if (target !== "you" && state.entities?.find(e => e.name === actorName(state, target))?.entityKind !== "person") throw new MechanicalKnowledgeError("An unmeasured object needs a supported material effect");
  const protection = absorbDamage(state, target, raw, type, changes);
  if (protection.immune) { beats.push({ kind: "harm", actor, target, name: "Unaffected", basis: "warp" }); return; }
  const scale = BODY_RESILIENCE[state.resilience?.find(r => r.owner === target)?.band ?? "ordinary"];
  const id = injuryId(target), old = state.conditions.find(c => c.id === id), beforeLoad = old?.injury?.load ?? 0;
  const load = Math.min(4, Math.round((beforeLoad + protection.remaining / (5 * scale)) * 1000) / 1000);
  const delivered = Math.max(0, load - beforeLoad) * 5 * scale;
  let name = old?.name;
  if (load > beforeLoad) {
    const level = Math.min(4, Math.floor(load));
    name = ["Lightly hurt", "Hurt", "Injured", "Badly injured", "Incapacitated"][level];
    const condition: Condition = { id, owner: target, name, hinders: level >= 2 ? ["movement", "force", "precision"] : [], helps: [], blocks: level >= 4 ? ["movement", "force", "precision", "speech", "perception", "concentration"] : [],
      ending: "Appropriate treatment or established recovery", injury: { rule: 1, load, basis: "warp" }, source: { message: `warp-action:${action}`, quote: `Physical harm to ${target}`, sourceRevision: revision([action, actor, target, raw, type]) } };
    if (old) state.conditions[state.conditions.indexOf(old)] = condition; else state.conditions.push(condition);
    changes.push({ kind: "condition", id, before: old ? structuredClone(old) : null, after: structuredClone(condition) });
  }
  const reflected = secondary ? 0 : Math.round(delivered * protection.reflect / 100 * 1000) / 1000;
  beats.push({ kind: "harm", actor, target, name: name ?? "Protected", absorbed: protection.absorbed, resisted: protection.resisted, reflected, basis: "warp" });
  if (reflected > 0 && actor !== target) applyInjury(state, target, actor, reflected, type, changes, beats, action, true);
}

export function mendInjury(state: MechanicalState, owner: string, impact: Impact, changes: MechanicalChange[], beats: EncounterBeat[], action: string, maxInjury: Impact | "any" = "any") {
  const id = injuryId(owner), old = state.conditions.find(c => c.id === id && c.injury);
  const limit = { minor: 1, standard: 2, major: 3, any: 4 }[maxInjury];
  if (old && Math.floor(old.injury!.load) > limit) throw new Error("This injury exceeds the treatment's supported severity");
  if (!old) {
    const grades = { minor: 1, standard: 2, major: 3 };
    const condition = state.conditions.filter(c => c.owner === owner && c.category === "physical_injury" && c.recovery === "routine" && c.severity && grades[c.severity] <= Math.min(grades[impact], limit)).sort((a, b) => grades[b.severity!] - grades[a.severity!] || a.id.localeCompare(b.id))[0];
    if (condition) {
      state.conditions = state.conditions.filter(c => c.id !== condition.id); closeCondition(state, condition, { kind: "receipt", id: action });
      changes.push({ kind: "condition", id: condition.id, before: structuredClone(condition), after: null });
      beats.push({ kind: "mend", actor: owner, target: owner, name: `${condition.name}: cleared`, basis: "warp" }); return;
    }
    const pool = vital(state, owner);
    if (pool) {
      if (maxInjury !== "any") throw new MechanicalKnowledgeError("A source-limited treatment needs a known qualitative injury severity");
      if (pool.max === undefined) throw new MechanicalKnowledgeError(`Recovery limit for ${pool.name} is unknown`);
      if (pool.current >= pool.max) throw new Error("No recorded physical injury to treat");
      const before = structuredClone(pool); pool.current = Math.min(pool.max, pool.current + IMPACTS[impact]);
      changes.push({ kind: "resource", id: pool.id, before, after: structuredClone(pool) });
      beats.push({ kind: "mend", actor: owner, target: owner, name: "Recovery", amount: pool.current - before.current, basis: "warp" }); return;
    }
    throw new Error("No supported physical injury to treat");
  }
  const load = Math.max(0, Math.round((old.injury!.load - IMPACTS[impact] / 5) * 1000) / 1000);
  if (!load) {
    state.conditions = state.conditions.filter(c => c.id !== id); closeCondition(state, old, { kind: "receipt", id: action });
    changes.push({ kind: "condition", id, before: structuredClone(old), after: null });
    beats.push({ kind: "mend", actor: owner, target: owner, name: "Recovered", basis: "warp" }); return;
  }
  const level = Math.min(4, Math.floor(load)), condition: Condition = { ...structuredClone(old), name: ["Lightly hurt", "Hurt", "Injured", "Badly injured", "Incapacitated"][level], injury: { rule: 1, load, basis: "warp" }, hinders: level >= 2 ? ["movement", "force", "precision"] : [], blocks: level >= 4 ? ["movement", "force", "precision", "speech", "perception", "concentration"] : [] };
  state.conditions[state.conditions.indexOf(old)] = condition;
  changes.push({ kind: "condition", id, before: structuredClone(old), after: structuredClone(condition) });
  beats.push({ kind: "mend", actor: owner, target: owner, name: condition.name, basis: "warp" });
}

export const INJURY_INSTRUCTIONS = `When a physical encounter has no numerical Health/HP pool, do not invent one. Resolver 4 can apply engine-owned physical injury conditions instead. Ordinary unmodified strikes use this path automatically for a present person without a vital resource. These conditions are game approximations, not fictional numerical health values or medical diagnoses. They progress Lightly hurt/Hurt, Injured, Badly injured, Incapacitated. They never declare death, consent, feelings or thoughts. Speech/social checks are not penalized by a lesser physical injury.
Source-backed ability effects may use {kind:"harm",target:"self|target",impact:"minor|standard|major",damageType:"physical|fire|cold|electric|poison"} for qualitative physical harm, and {kind:"mend",target,impact:"minor|standard|major"} for established injury treatment. Do not discard an explicit numerical damage/recovery amount to make it fit this vocabulary. Exact numerical effects still require a known resource. Mend treats the engine injury first, then a suitably minor routine physical condition, or restores a known vital resource with a known cap. It cannot regrow a limb, remove a curse, reset money/energy or supply an invented recovery limit. Retain unsupported restrictions/effects explicitly.
Mend can include maxInjury:"minor|standard|major|any" only when that limit is stated in its source quote. A minor-only treatment needs maxInjury:"minor"; it cannot be spammed to remove a more severe injury. Keep other unsupported restrictions explicit. An observed physical condition can include category:"physical_injury",severity:"minor|standard|major",recovery:"routine|special" only when the cause and treatment class are supported. Lost body parts, chronic disabilities, curses and injuries requiring a specific exceptional cure are special, never routine. Generic mend cannot remove them. A specific source-backed cure may use clear_condition for an actual named condition when that cure really applies.
Optionally add mechanicalObservations {kind:"resilience",owner,band:"frail|ordinary|tough|exceptional",message,quote} only when physical bodily durability is actually established. The quote can be a supplied profile or an actual narrator fact. The engine owns the relative scale and labels it a Warp interpretation. Ordinary is the fallback, not a field to fill for every person. Skill, military rank, magical output, wealth and mood do not prove bodily durability. Do not invent an immunity from a resilience band. Source-backed immunities remain distinct hard constraints.
Do not add a duplicate prose condition for the same recorded injury. Appropriate new injury/recovery evidence can still be observed, but an old quote cannot reapply a healed injury. Repeated dialogue, inspecting state, API waiting and ordinary affection do not create or heal an injury. A living incapacitated player may explicitly wait for another present person's source-backed aid; this takes no active player action, spends no player resource and does not advance their action clock. It never resurrects an explicitly dead person.`;
