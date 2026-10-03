// Who the "With you" doll shows, and where each chat's dolls are kept. Pure, so
// it can be tested without a page.

import { cleanLook } from "./outfits.js";
import type { Look } from "./render.js";

export type Who = "you" | "them";
/** How often dolls follow the story on their own: never, only when the classifier is set up (cheap), or always (a helper call each). */
export type AutoMode = "off" | "jev" | "always";

export interface CastEntry { name: string; look: Look; note: string; at: number }

/** One chat's dolls. */
export interface ChatDolls {
  you: Look;
  /** The look being edited on the drawer's second tab (whoever `themName` is). */
  them: Look;
  themName: string;
  who: Who;
  notes: Record<Who, string>;
  /** Everyone the chat has dressed, by lowercased name. */
  cast: Record<string, CastEntry>;
  /** The person the player pinned to the "With you" doll (shown while they're here). */
  pin: string;
  /** Who the latest reply was about, among the people here. */
  focus: string;
  /** The last reply the dolls were updated for. */
  lastAuto: string;
  /** People already asked about automatically (a failed first look isn't retried every state). */
  asked: string[];
}

export interface DollPrefs { hud: boolean; scene: boolean; auto: AutoMode }

export const MAX_CAST = 16;
export const MAX_CHATS = 40;

export const castKey = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

const str = (v: unknown, max = 80) => (typeof v === "string" ? v.slice(0, max) : "");

export function cleanPrefs(v: unknown): DollPrefs {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { hud: o.hud !== false, scene: o.scene !== false, auto: o.auto === "off" || o.auto === "always" ? o.auto : "jev" };
}

/** A chat's saved dolls, made safe; `seed` fills in a chat that has none. */
export function cleanChat(v: unknown, seed: { you: Look; them: Look }): ChatDolls {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const notes = (o.notes && typeof o.notes === "object" ? o.notes : {}) as Record<string, unknown>;
  const cast: Record<string, CastEntry> = {};
  const rawCast = (o.cast && typeof o.cast === "object" && !Array.isArray(o.cast) ? o.cast : {}) as Record<string, unknown>;
  const entries = Object.values(rawCast)
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && typeof (e as Record<string, unknown>).name === "string" && !!(e as Record<string, unknown>).look)
    .map((e) => ({ name: str(e.name).trim(), look: cleanLook(e.look), note: str(e.note, 400), at: Number.isFinite(e.at) ? Number(e.at) : 0 }))
    .filter((e) => e.name && !["__proto__", "constructor", "prototype"].includes(castKey(e.name)))
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_CAST);
  for (const e of entries) cast[castKey(e.name)] = e;
  return {
    you: o.you ? cleanLook(o.you) : cleanLook(seed.you),
    them: o.them ? cleanLook(o.them) : cleanLook(seed.them),
    themName: str(o.themName),
    who: o.who === "them" ? "them" : "you",
    notes: { you: str(notes.you, 400), them: str(notes.them, 400) },
    cast,
    pin: str(o.pin),
    focus: str(o.focus),
    lastAuto: str(o.lastAuto, 200),
    asked: Array.isArray(o.asked) ? o.asked.filter((x): x is string => typeof x === "string").slice(-MAX_CAST) : [],
  };
}

/** Store someone's look in the cast, keeping it to the most recent few. */
export function putCast(c: ChatDolls, name: string, look: Look, note: string, at: number) {
  const k = castKey(name);
  if (!k || ["__proto__", "constructor", "prototype"].includes(k)) return;
  c.cast[k] = { name: name.replace(/\s+/g, " ").trim().slice(0, 80), look, note: note.slice(0, 400), at };
  const keys = Object.keys(c.cast).sort((a, b) => c.cast[b].at - c.cast[a].at);
  for (const old of keys.slice(MAX_CAST)) delete c.cast[old];
}

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** How strongly a reply is about someone: mentions of their full or first name, and how late the last one comes. */
export function mentionScore(text: string, name: string): number {
  const forms = [...new Set([name, name.split(/\s+/)[0]].filter((f) => f.length >= 2))];
  let n = 0, last = -1;
  for (const f of forms) {
    for (const m of text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${reEsc(f)}(?![\\p{L}\\p{N}])`, "gu"))) { n++; last = Math.max(last, m.index ?? 0); }
  }
  return n ? n * 100000 + last : 0;
}

/** Who the latest reply is most about, of the people here ("" when it names none of them). */
export function focusFrom(text: string, here: string[]): string {
  let best = "", score = 0;
  for (const name of here) { const s = mentionScore(text, name); if (s > score) { best = name; score = s; } }
  return best;
}

/** Who the "With you" doll shows: the pinned person while they're here, else who the story is about, else the first one here. */
export function sceneFocus(here: string[], pin: string, focus: string): string | null {
  const find = (n: string) => (n ? here.find((h) => castKey(h) === castKey(n)) : undefined);
  return find(pin) ?? find(focus) ?? here[0] ?? null;
}

/** Keep the list of chats with saved dolls short: returns the new list and the chats to forget. */
export function touchChat(list: string[], chatId: string, max = MAX_CHATS): { list: string[]; drop: string[] } {
  const next = [chatId, ...list.filter((x) => x !== chatId)];
  return { list: next.slice(0, max), drop: next.slice(max) };
}
