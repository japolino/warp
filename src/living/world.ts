import { revision } from "../shared/revision.js";
import { seededRng } from "../engine/dice.js";

export type Kind = "fact" | "possession" | "knowledge" | "commitment" | "situation" | "motive" | "ability";
export interface Evidence { message: string; quote: string; }
export interface Fact extends Evidence {
  id: string; kind: Kind; subject: string; text: string;
  holder?: string; status: "open" | "done";
}
export interface World { place: string; present: string[]; facts: Fact[]; }
export interface Message { id: string; content: string; is_user: boolean; swipe_id?: number; }
export interface Event { op: "put" | "remove" | "transfer"; fact?: Fact; id: string; to?: string; evidence: Evidence; }
export interface Record {
  version: 1; path: string; text: string; events: Event[];
  scene?: { place: string; present: string[] }; notes: string[];
  decision?: Decision;
}
export interface Decision { tier: "favorable" | "uncertain" | "outmatched"; result: "clean" | "mixed" | "setback"; intent: string; stakes: string; reasons: string[]; }
export const emptyWorld = (): World => ({ place: "", present: [], facts: [] });
export const text = (v: unknown, limit = 240): string => typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, limit) : "";
const obj = (v: unknown): v is { [key: string]: unknown } => !!v && typeof v === "object" && !Array.isArray(v);
const kinds = new Set<Kind>(["fact", "possession", "knowledge", "commitment", "situation", "motive", "ability"]);
const ROOT = "warp-living-v1";
const nextPath = (path: string, m: Message) => revision([path, m.id, m.swipe_id ?? 0, m.content]);
export function pathOf(messages: Message[]): string { return messages.reduce(nextPath, ROOT); }

function evidence(v: unknown, messages: Message[]): Evidence | null {
  if (!obj(v)) return null;
  const message = text(v.message, 160), quote = text(v.quote, 400);
  const source = messages.find(m => m.id === message);
  if (!source || quote.length < 4 || !source.content.replace(/\s+/g, " ").includes(quote)) return null;
  return { message, quote };
}

/** Validate each proposed change against its quoted source and existing ownership. */
export function readChanges(raw: unknown, before: World, messages: Message[]): { events: Event[]; scene?: Record["scene"]; notes: string[] } {
  if (!obj(raw)) return { events: [], notes: [] };
  const events: Event[] = [], notes: string[] = [];
  let world = structuredClone(before);
  const sourceMessages = new Map(messages.map(m => [m.id, m]));
  for (const v of (Array.isArray(raw.changes) ? raw.changes : []).slice(0, 16)) {
    if (!obj(v)) continue;
    const e = evidence(v, messages), id = text(v.id, 100);
    if (!e || !id) continue;
    const previous = world.facts.find(f => f.id === id);
    let event: Event;
    if (v.op === "remove") {
      if (!previous) continue;
      event = { op: "remove", id, evidence: e };
    } else if (v.op === "transfer") {
      const to = text(v.to, 80), from = text(v.from, 80);
      if (!previous || previous.kind !== "possession" || previous.holder !== from || !to || from === to) continue;
      event = { op: "transfer", id, to, evidence: e };
    } else if (v.op === "put") {
      const kind = text(v.kind) as Kind, subject = text(v.subject, 80), description = text(v.text);
      if (!kinds.has(kind) || !subject || !description) continue;
      // Player agreements require evidence in the player's own words.
      if (kind === "commitment" && subject === "you" && !sourceMessages.get(e.message)?.is_user && !previous) continue;
      const holder = kind === "possession" ? text(v.holder, 80) : "";
      // An existing possession can change hands only through a validated transfer.
      if (previous?.kind === "possession" && (kind !== "possession" || previous.holder !== holder)) continue;
      const fact: Fact = { id, kind, subject, text: description, ...e, status: v.status === "done" ? "done" : "open", ...(holder ? { holder } : {}) };
      if (kind === "possession" && !holder) continue;
      if (kind === "situation" && fact.status === "open" && !previous && world.facts.filter(f => f.kind === "situation" && f.status === "open").length >= 3) continue;
      event = { op: "put", id, fact, evidence: e };
    } else continue;
    events.push(event);
    world = applyEvents(world, [event]);
    // Notes are derived from validated changes, never arbitrary model text.
    if (previous && event.op === "transfer") notes.push(`${previous.text}: now with ${event.to}`);
    else if (event.fact && event.fact.text !== previous?.text && ["commitment", "knowledge", "ability"].includes(event.fact.kind)) notes.push(event.fact.text);
  }
  let scene: Record["scene"];
  if (obj(raw.scene) && evidence(raw.scene, messages)) {
    scene = { place: text(raw.scene.place, 100) || before.place, present: Array.isArray(raw.scene.present) ? [...new Set(raw.scene.present.map(x => text(x, 80)).filter(Boolean))].slice(0, 8) : before.present };
  }
  return { events, ...(scene ? { scene } : {}), notes: notes.slice(0, 2) };
}

export function applyEvents(before: World, events: Event[]): World {
  const facts = new Map(before.facts.map(f => [f.id, f]));
  for (const e of events) {
    if (e.op === "put" && e.fact) facts.set(e.id, e.fact);
    if (e.op === "remove") facts.delete(e.id);
    if (e.op === "transfer") {
      const old = facts.get(e.id);
      if (old?.kind === "possession" && e.to) facts.set(e.id, { ...old, holder: e.to, ...e.evidence });
    }
  }
  // Bound prompt and replay size. Settled history is evicted before live facts.
  const all = [...facts.values()];
  const kept = [...all.filter(f => f.status === "done").slice(-16), ...all.filter(f => f.status === "open").slice(-80)];
  return { ...before, facts: kept };
}

/** A changed source invalidates descendants; the next extraction repairs from current prose. */
export function foldWorld(messages: (Message & { record?: Record })[]): World {
  let world = emptyWorld();
  let path = ROOT;
  for (const m of messages) {
    const r = m.record;
    if (r?.version === 1 && r.text === revision(m.content) && r.path === path) {
      world = applyEvents(world, r.events);
      if (r.scene) world = { ...world, ...r.scene };
    }
    path = nextPath(path, m);
  }
  return world;
}

/** A classifier supplies circumstances. It never supplies the random outcome. */
export function resolveAttempt(raw: unknown, seed: string): Decision | null {
  if (!obj(raw) || raw.risky !== true || raw.contested !== true) return null;
  const intent = text(raw.intent), stakes = text(raw.stakes);
  const reasons = Array.isArray(raw.reasons) ? raw.reasons.map(x => text(x, 180)).filter(Boolean).slice(0, 3) : [];
  if (!intent || !stakes || !reasons.length) return null;
  const tier = raw.tier === "favorable" || raw.tier === "outmatched" ? raw.tier : "uncertain";
  const [clean, mixed] = tier === "favorable" ? [0.6, 0.3] : tier === "outmatched" ? [0.1, 0.35] : [0.3, 0.45];
  const n = seededRng(seed)();
  return { tier, result: n < clean ? "clean" : n < clean + mixed ? "mixed" : "setback", intent, stakes, reasons };
}

export function worldPacket(world: World): string {
  return JSON.stringify({ place: world.place || undefined, present: world.present, established: world.facts.filter(f => f.kind !== "motive").map(({ kind, subject, text, holder, status }) => ({ kind, subject, text, holder, status })), possibleMotives: world.facts.filter(f => f.kind === "motive").map(f => ({ subject: f.subject, text: f.text })) });
}
