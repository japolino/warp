import type { Proposal } from "./resolve.js";
import type { Value } from "./expr.js";

export const safeKey = (key: string) => key.length <= 300 && !["__proto__", "constructor", "prototype"].includes(key);
export function objectOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
const text = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : undefined;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
function map<T>(value: unknown, read: (v: unknown) => T | undefined): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, v] of Object.entries(objectOf(value)).slice(0, 64)) {
    if (!safeKey(key)) continue;
    const decoded = read(v);
    if (decoded !== undefined) out[key] = decoded;
  }
  return out;
}
const numbers = (value: unknown) => map(value, (v) => finite(v) ? v : undefined);
const strings = (value: unknown): string[] => Array.isArray(value) ? value.slice(0, 32).flatMap((v) => { const s = text(v); return s && safeKey(s) ? [s] : []; }) : [];

/** Treat helper output as untrusted JSON; malformed fields never throw or reach state. */
export function decodeProposal(value: unknown): Proposal {
  const raw = objectOf(value), p: Proposal = {};
  if (raw.basis === "total" || raw.basis === "additional") p.basis = raw.basis;
  if (finite(raw.minutes)) p.minutes = Math.max(0, raw.minutes);
  p.stats = numbers(raw.stats); p.items = numbers(raw.items); p.used = numbers(raw.used);
  p.rel = map(raw.rel, numbers); p.feelings = map(raw.feelings, numbers);
  p.scene = map(raw.scene, (v) => typeof v === "boolean" ? v : undefined);
  p.flags = map<Value>(raw.flags, (v) => v === null || typeof v === "boolean" || finite(v) ? v : typeof v === "string" ? v.slice(0, 300) : undefined);
  p.body = map(raw.body, (v) => map(v, (t) => t === null ? null : typeof t === "string" ? t.slice(0, 60) : undefined));
  p.move = text(raw.move); p.encounter = text(raw.encounter); p.encounterEnd = text(raw.encounterEnd); p.foe = text(raw.foe);
  p.wear = strings(raw.wear); p.undress = strings(raw.undress); p.train = strings(raw.train);
  const conditions = objectOf(raw.conditions);
  p.conditions = { add: strings(conditions.add), remove: strings(conditions.remove) };
  p.people = Array.isArray(raw.people) ? raw.people.slice(0, 32).flatMap((v) => {
    const person = objectOf(v), name = text(person.name), id = text(person.id);
    return name && safeKey(name) && (!id || safeKey(id)) ? [{ name, ...(id ? { id } : {}), feelings: numbers(person.feelings) }] : [];
  }) : [];
  return p;
}
