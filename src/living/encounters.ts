import { revision } from "../shared/revision.js";
import type { Evidence } from "./world.js";
import type { MechanicalState, MechanicalChange, Resource, Condition } from "./mechanics.js";

export const DAMAGE_TYPES = ["physical", "fire", "cold", "electric", "poison", "mental", "untyped"] as const;
export type DamageType = typeof DAMAGE_TYPES[number];
export const RANGES = ["touch", "near", "far"] as const;
export type Range = typeof RANGES[number];
export interface Entity { id: string; name: string; displayName: string; aliases: string[]; entityKind: "person" | "object"; present: boolean; status: "active" | "dead"; source: Evidence; }
export interface Distance { id: string; from: string; to: string; band: Range; source: Evidence; }
export interface Defense { kind: "armor" | "resistance" | "immunity" | "shield" | "reflect"; amount: number; damageType: DamageType | "all"; }
export interface ActionClock { id: string; actor: string; actions: number; }
export interface Cooldown { id: string; actor: string; readyAt: number; }
export interface EncounterBeat { kind: "damage" | "expired" | "move" | "wait" | "defend" | "attempt" | "skipped"; actor: string; target?: string; name?: string; amount?: number; absorbed?: number; resisted?: number; reflected?: number; reason?: string; }
const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();
export const entityId = (name: string) => normalize(name) === "you" ? "you" : `entity-${revision(normalize(name))}`;

export function actorName(state: MechanicalState, input: string): string {
  if (normalize(input) === "you") return "you";
  const candidates = (state.entities ?? []).filter(e => [e.id, e.name, e.displayName, ...e.aliases].some(n => normalize(n) === normalize(input)));
  if (candidates.length > 1) throw new Error("Actor identity is ambiguous");
  if (candidates[0]) return candidates[0].name;
  const owners = [...new Set([...state.resources, ...state.items, ...state.conditions, ...(state.abilities ?? [])].map(row => row.owner))].filter(n => normalize(n) === normalize(input));
  if (owners.length > 1) throw new Error("Actor identity is ambiguous");
  return owners[0] ?? input;
}
export function entityFor(state: MechanicalState, name: string): Entity | undefined { return state.entities?.find(e => e.name === actorName(state, name)); }
export function present(state: MechanicalState, name: string): boolean {
  return name === "you" || entityFor(state, name)?.present === true;
}
export function vital(state: MechanicalState, owner: string): Resource | undefined {
  return state.resources.find(r => r.owner === owner && (r.role === "vital" || (!r.role && /^(?:hp|health|vitality)$/i.test(r.name))));
}
export function capable(state: MechanicalState, owner: string) {
  return entityFor(state, owner)?.status !== "dead" && (vital(state, owner)?.current ?? 1) > 0;
}
export function distanceId(from: string, to: string) { return `distance-${revision([from, to].sort())}`; }
export function distance(state: MechanicalState, from: string, to: string) {
  if (from === to) return "touch" as const;
  return state.distances?.find(d => d.id === distanceId(from, to))?.band;
}
export function checkRange(state: MechanicalState, actor: string, target: string, range?: Range) {
  if (!range || actor === target) return;
  const band = distance(state, actor, target);
  if (!band) throw new Error(`Distance to ${target} is unknown`);
  if (RANGES.indexOf(band) > RANGES.indexOf(range)) throw new Error(`${target} is outside ${range} range`);
}
export function actionCount(state: MechanicalState, actor: string) { return state.clocks?.find(c => c.actor === actor)?.actions ?? 0; }
export function cooldownRemaining(state: MechanicalState, actor: string, id: string) {
  return Math.max(0, (state.cooldowns?.find(c => c.id === id && c.actor === actor)?.readyAt ?? 0) - (actionCount(state, actor) + 1));
}
export function setCooldown(state: MechanicalState, actor: string, id: string, turns: number) {
  if (!turns) return;
  state.cooldowns ??= [];
  const value = { id, actor, readyAt: actionCount(state, actor) + turns + 1 };
  const index = state.cooldowns.findIndex(c => c.id === id && c.actor === actor);
  if (index < 0) state.cooldowns.push(value); else state.cooldowns[index] = value;
}
export function conditionActive(state: MechanicalState, c: Condition, nextAction = false) {
  return c.expiresAt === undefined || c.expiresAt > actionCount(state, c.owner) + (nextAction ? 1 : 0);
}

export function advanceActor(state: MechanicalState, actor: string, changes: MechanicalChange[], beats: EncounterBeat[]) {
  state.clocks ??= [];
  let clock = state.clocks.find(c => c.actor === actor);
  if (!clock) { clock = { id: actor, actor, actions: 0 }; state.clocks.push(clock); }
  clock.actions++;
  for (const c of [...state.conditions]) if (c.owner === actor && !conditionActive(state, c)) {
    state.conditions = state.conditions.filter(row => row.id !== c.id);
    changes.push({ kind: "condition", id: c.id, before: structuredClone(c), after: null });
    beats.push({ kind: "expired", actor, name: c.name });
  }
}

function defenses(state: MechanicalState, owner: string, type: DamageType): Defense[] {
  return [
    ...state.conditions.filter(c => c.owner === owner && conditionActive(state, c)).flatMap(c => c.defenses ?? []),
    ...state.items.filter(i => i.owner === owner && i.quantity > 0 && i.equipped).flatMap(i => i.defenses ?? []),
  ].filter(d => d.damageType === "all" || d.damageType === type);
}
export function immune(state: MechanicalState, owner: string, type: DamageType) { return defenses(state, owner, type).some(d => d.kind === "immunity"); }

/** One ordered packet, with at most one reflected packet. Neither path calls a model. */
export function damage(state: MechanicalState, actor: string, target: string, resource: Resource, raw: number, type: DamageType, changes: MechanicalChange[], beats: EncounterBeat[], secondary = false) {
  if (immune(state, target, type)) { beats.push({ kind: "damage", actor, target, amount: 0, resisted: raw, name: type }); return; }
  const protection = defenses(state, target, type);
  const armor = protection.filter(d => d.kind === "armor").reduce((sum, d) => sum + d.amount, 0);
  const resistance = Math.min(100, protection.filter(d => d.kind === "resistance").reduce((sum, d) => sum + d.amount, 0));
  let remaining = Math.round(Math.max(0, raw - armor) * (1 - resistance / 100) * 1000) / 1000;
  const resisted = raw - remaining;
  let absorbed = 0;
  for (const c of state.conditions.filter(c => c.owner === target && conditionActive(state, c))) {
    const before = structuredClone(c);
    for (const d of c.defenses ?? []) if (d.kind === "shield" && (d.damageType === "all" || d.damageType === type) && remaining > 0) {
      const used = Math.min(d.amount, remaining); d.amount -= used; remaining -= used; absorbed += used;
    }
    if (revision(before) !== revision(c)) changes.push({ kind: "condition", id: c.id, before, after: structuredClone(c) });
  }
  for (const shield of state.resources.filter(r => r.owner === target && r.role === "shield")) if (remaining > 0) {
    const before = structuredClone(shield), used = Math.min(shield.current, remaining);
    shield.current -= used; remaining -= used; absorbed += used;
    if (used) changes.push({ kind: "resource", id: shield.id, before, after: structuredClone(shield) });
  }
  const old = structuredClone(resource), actual = Math.min(resource.current, remaining);
  resource.current = Math.max(0, resource.current - actual);
  if (actual) changes.push({ kind: "resource", id: resource.id, before: old, after: structuredClone(resource) });
  const reflect = secondary ? 0 : Math.min(100, protection.filter(d => d.kind === "reflect").reduce((sum, d) => sum + d.amount, 0));
  const reflected = Math.round(actual * reflect * 10) / 1000;
  beats.push({ kind: "damage", actor, target, amount: actual, absorbed, resisted, reflected, name: type });
  const back = reflected > 0 ? vital(state, actor) : undefined;
  if (back && actor !== target) damage(state, target, actor, back, reflected, type, changes, beats, true);
}

export function readDefenses(raw: unknown, quote: string): Defense[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 8) throw new Error("Invalid defenses");
  return raw.map(row => {
    if (!row || typeof row !== "object") throw new Error("Invalid defense");
    if (Object.keys(row).some(k => !["kind", "amount", "damageType"].includes(k))) throw new Error("Unsupported defense field");
    const d = row as Defense;
    if (!["armor", "resistance", "immunity", "shield", "reflect"].includes(d.kind) || ![...DAMAGE_TYPES, "all"].includes(d.damageType)) throw new Error("Unsupported defense");
    if (!Number.isFinite(d.amount) || d.amount < 0 || d.amount > 1e6) throw new Error("Invalid defense amount");
    const sourced = (quote.match(/\d+(?:\.\d+)?/g) ?? []).some(n => Number(n) === d.amount)
      || ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"].some((word, i) => i === d.amount && new RegExp(`\\b${word}\\b`, "i").test(quote));
    if (d.kind !== "immunity" && !sourced) throw new Error("Unsourced defense amount");
    if ((d.kind === "resistance" || d.kind === "reflect") && d.amount > 100) throw new Error("Invalid defense percentage");
    if (d.kind === "shield") throw new Error("A shield belongs to a resource or an ability effect");
    return { kind: d.kind, amount: d.amount, damageType: d.damageType };
  });
}

/** Profile sources establish identity, never presence, distance or a death in the current scene. */
export function readEncounterObservation(row: Record<string, unknown>, state: MechanicalState, source: Evidence, messages: { id: string }[]) {
  const text = (v: unknown, max = 80) => typeof v === "string" && v.trim().length <= max ? v.trim() : "";
  const profile = source.message.startsWith("warp-source:");
  const newer = (old?: Evidence) => !old || (old.message !== source.message || old.sourceRevision !== source.sourceRevision)
    && ((!profile && old.message.startsWith("warp-source:")) || messages.findIndex(m => m.id === source.message) >= messages.findIndex(m => m.id === old.message));
  if (row.kind === "entity") {
    const name = text(row.name);
    if (!name || !["person", "object"].includes(row.entityKind as string)) return;
    const aliases = Array.isArray(row.aliases) ? [...new Set(row.aliases.map(a => text(a)).filter(Boolean))].slice(0, 12) : [];
    if (normalize(name) !== "you" && aliases.some(a => normalize(a) === "you")) return;
    const matches = [...new Set([name, ...aliases].map(n => actorName(state, n)).filter(n => state.entities?.some(e => e.name === n) || [...state.resources, ...state.items, ...state.conditions, ...(state.abilities ?? [])].some(row => row.owner === n)))];
    if (matches.length > 1) return; // An alias is not permission to merge two established people.
    const canonical = matches[0] ?? actorName(state, name), old = state.entities?.find(e => e.name === canonical);
    if (profile && old && !old.source.message.startsWith("warp-source:")) return;
    if (old && !newer(old.source)) return;
    if ([...aliases, text(row.displayName)].some(a => a && state.entities?.some(e => e.id !== old?.id && [e.id, e.name, e.displayName, ...e.aliases].some(n => normalize(n) === normalize(a))))) return;
    const value: Entity = { id: old?.id ?? entityId(canonical), name: canonical, displayName: text(row.displayName) || old?.displayName || name,
      aliases: [...new Set([...(old?.aliases ?? []), ...aliases, ...(name !== canonical ? [name] : [])])].slice(0, 24), entityKind: row.entityKind as Entity["entityKind"],
      present: profile ? old?.present ?? false : typeof row.present === "boolean" ? row.present : old?.present ?? false,
      status: profile ? old?.status ?? "active" : ["active", "dead"].includes(row.status as string) ? row.status as Entity["status"] : old?.status ?? "active", source };
    return { kind: "entity" as const, value };
  }
  if (row.kind === "distance" && !profile && RANGES.includes(row.band as Range)) {
    const from = actorName(state, text(row.from)), to = actorName(state, text(row.to));
    if (!from || !to || from === to || !present(state, from) || !present(state, to)) return;
    const id = distanceId(from, to), old = state.distances?.find(d => d.id === id);
    // The reply carrying a movement receipt cannot contradict its own movement.
    // A later sourced event may change the distance, as may an explicit correction.
    const correction = messages.some(m => m.id === source.message && "content" in m && typeof m.content === "string" && /^\s*\(?OOC correction:/i.test(m.content));
    if (old && !correction) {
      if (old.source.message.startsWith("warp-action:")) {
        const actionId = old.source.message.slice("warp-action:".length);
        const committed = messages.findIndex(m => {
          const record = m as { swipe_id?: number; metadata?: Record<string, Record<string, { receipt?: { id?: string } }>> };
          return record.metadata?.warpMechanics?.[String(record.swipe_id ?? 0)]?.receipt?.id === actionId;
        });
        if (committed < 0 || messages.findIndex(m => m.id === source.message) <= committed) return;
      } else if (!newer(old.source)) return;
    }
    return { kind: "distance" as const, value: { id, from, to, band: row.band as Range, source } };
  }
}

export const ENCOUNTER_INSTRUCTIONS = `For relevant established participants/objects, mechanicalObservations may include {kind:"entity",name,displayName,aliases:[],entityKind:"person|object",present,status:"active|dead",message,quote} and {kind:"distance",from,to,band:"touch|near|far",message,quote}. Use you for the player. Reuse identity and names across aliases. Profiles can establish identity but cannot establish current presence, distance or a death. Presence and distance require an actual scene quote. Dead means explicitly dead, not merely injured or at zero health. Do not materialize an encounter for ordinary conversation.
Resources may have role:"vital|effort|shield|money|other" only when their fictional function is supported. Equipped items and conditions may have defenses:[{kind:"armor|resistance|immunity|reflect",amount,damageType:"physical|fire|cold|electric|poison|mental|untyped|all"}]. Armor subtracts a flat amount, resistance/reflect use percentages, immunity uses amount:0. All non-immunity numbers must occur in the source quote. Do not invent these defenses or health values. A shield pool is an explicit resource with role:shield. Actual values stay unknown without source evidence. Never emit an absolute update to undo an action receipt.`;
