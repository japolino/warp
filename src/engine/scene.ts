// Scene state, engine side (CORE-DESIGN §2.1): the greeting read sets turn 0 (time, place, who is here,
// looks), and the player can fix any line with one click. Both become ordinary events on a message, so
// they follow swipes and undo like everything else.

import { buildTurn, findPerson } from "./resolve.js";
import { parseClockStart, slug, type Ruleset } from "./ruleset.js";
import { itemName, placeId, type GameState, type WarpEvent } from "./state.js";
import type { FixField } from "../shared/protocol.js";

/** Time-of-day words → minutes after midnight (when the greeting gives only a word). */
export const TIME_WORDS: Record<string, number> = {
  dawn: 6 * 60, morning: 9 * 60, noon: 12 * 60, midday: 12 * 60, afternoon: 15 * 60,
  evening: 19 * 60, night: 22 * 60, "late night": 60, midnight: 0,
};

/** What the greeting read found (the pipeline asks; the engine applies). Names are as the greeting writes them. */
export interface GreetingRead {
  time?: { hour?: number | null; minute?: number | null; word?: string | null; weekday?: string | null } | null;
  place?: string | null;
  /** Who is in the opening scene, by name. */
  present?: string[];
  you?: { appearance?: string | null; outfit?: string | null } | null;
  /** First looks by name. */
  people?: Record<string, { appearance?: string | null; outfit?: string | null }>;
  /** Adults (true) or not (false), by name; unclear ones are left out. */
  adults?: Record<string, boolean>;
}

/** The greeting's time as minutes from the start of day 1 (null = it gives none). */
export function greetingMinutes(r: Ruleset, t: GreetingRead["time"]): number | null {
  if (!t) return null;
  let inDay: number | null = null;
  if (typeof t.hour === "number" && Number.isFinite(t.hour) && t.hour >= 0 && t.hour <= 23) {
    const m = typeof t.minute === "number" && Number.isFinite(t.minute) ? Math.max(0, Math.min(59, Math.round(t.minute))) : 0;
    inDay = Math.round(t.hour) * 60 + m;
  } else if (typeof t.word === "string" && TIME_WORDS[t.word.trim().toLowerCase()] !== undefined) {
    inDay = TIME_WORDS[t.word.trim().toLowerCase()];
  }
  if (inDay === null) return null;
  let day = 0;
  if (typeof t.weekday === "string" && t.weekday.trim()) {
    const w = t.weekday.trim().toLowerCase().slice(0, 3);
    const idx = r.clock.weekdays.findIndex((x) => x.toLowerCase().startsWith(w));
    if (idx >= 0) day = idx;
  }
  return day * 1440 + inDay;
}

const text160 = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 160) : null);

/**
 * Turn 0 from the greeting: the time (when `clock.start: greeting`), the place (when `start.place: greeting`),
 * who is here, first looks (only lines the ruleset left empty) and adults. Events are `src: "start"`.
 */
export function applyGreeting(r: Ruleset, before: GameState, read: GreetingRead): WarpEvent[] {
  return buildTurn(r, before, "greeting", (t) => {
    const src = "start" as const;
    if (r.clock.start === "greeting" && r.clock.enabled) {
      const m = greetingMinutes(r, read.time);
      const weekday = typeof read.time?.weekday === "string" && r.clock.weekdays.some((x) => x.toLowerCase().startsWith(read.time!.weekday!.trim().toLowerCase().slice(0, 3)));
      if (m !== null && (m !== t.s.minutes || weekday !== !!t.s.weekday)) t.push({ t: "set_time", minutes: m, ...(weekday ? { weekday: true } : {}), src });
    }
    const place = typeof read.place === "string" ? read.place.trim().slice(0, 120) : "";
    if (place && (r.startPlace === "greeting" || !t.s.locationName)) t.push({ t: "move", to: placeId(place), name: place, src });
    const idOf = (name: string): string | null => {
      const known = findPerson(r, t.s, name);
      if (known) return known;
      if (!r.peopleOpen || !name.trim()) return null;
      const id = slug(name);
      t.push({ t: "person", id, name: name.trim().slice(0, 60), src });
      return id;
    };
    for (const name of read.present ?? []) {
      const id = typeof name === "string" ? idOf(name) : null;
      if (id && !t.s.scene[id]?.here) t.push({ t: "scene", who: id, here: true, src });
    }
    const looks = (who: string, l: { appearance?: string | null; outfit?: string | null } | null | undefined) => {
      if (!l) return;
      for (const field of ["appearance", "outfit"] as const) {
        const v = text160(l[field]);
        if (v && !t.s.look?.[who]?.[field]) t.push({ t: "look", who, field, text: v, src });
      }
    };
    looks("you", read.you);
    for (const [name, l] of Object.entries(read.people ?? {})) {
      const id = findPerson(r, t.s, name);
      if (id) looks(id, l);
    }
    for (const [name, adult] of Object.entries(read.adults ?? {})) {
      const id = findPerson(r, t.s, name);
      if (id && typeof adult === "boolean" && t.s.adults[id] !== adult) t.push({ t: "adult", who: id, adult, src });
    }
  });
}

/** A one-click fix (the `fix` message without its chat id). */
export interface FixRequest { field: FixField; who?: string; value: string | number | boolean | null }

/** "23:40" keeps today; "Day 2 08:00" / "Mon 07:00" are absolute; a number is minutes. Null when unreadable. */
export function fixMinutes(r: Ruleset, s: GameState, v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
  if (typeof v !== "string") return null;
  const hm = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(v);
  if (hm) {
    const h = Number(hm[1]), m = Number(hm[2]);
    if (h > 23 || m > 59) return null;
    return Math.floor(s.minutes / 1440) * 1440 + h * 60 + m;
  }
  return parseClockStart(v, r.clock.weekdays);
}

/** The events of a one-click fix (`src: "manual"`), or why it can't be done. */
export function manualFix(r: Ruleset, before: GameState, fix: FixRequest): WarpEvent[] | string {
  const who = typeof fix.who === "string" ? fix.who : "";
  const src = "manual" as const;
  switch (fix.field) {
    case "time": {
      const m = fixMinutes(r, before, fix.value);
      if (m === null) return "Write a time like 23:40 or Day 2 08:00.";
      // "Mon 07:00" names the weekday: from now on it shows.
      const weekday = typeof fix.value === "string" && /^\s*[a-z]{3,}/i.test(fix.value) && !/^\s*day\b/i.test(fix.value);
      return buildTurn(r, before, "fix", (t) => t.push({ t: "set_time", minutes: m, ...(weekday ? { weekday: true } : {}), src }));
    }
    case "place": {
      const words = typeof fix.value === "string" ? fix.value.trim().slice(0, 120) : "";
      if (!words) return "Write where you are.";
      return buildTurn(r, before, "fix", (t) => t.push({ t: "move", to: placeId(words), name: words, src }));
    }
    case "present": {
      if (!before.people[who]) return "Unknown person.";
      if (typeof fix.value !== "boolean") return "Say here or not here.";
      const here = fix.value;
      return buildTurn(r, before, "fix", (t) => t.push({ t: "scene", who, here, src }));
    }
    case "appearance": case "outfit": {
      if (who !== "you" && !before.people[who]) return "Unknown person.";
      if (fix.value !== null && typeof fix.value !== "string") return "Write it as text.";
      const text = text160(fix.value);
      const field = fix.field;
      return buildTurn(r, before, "fix", (t) => t.push({ t: "look", who, field, text, src }));
    }
    case "item": {
      const n = Number(fix.value);
      if (!who || !Number.isFinite(n) || n < 0) return "Give a count of 0 or more.";
      const have = before.items[who] ?? 0;
      if (!r.items[who] && have <= 0) return "Unknown item.";
      const d = Math.round(n) - have;
      if (!d) return [];
      return buildTurn(r, before, "fix", (t) => t.push({ t: "item", id: who, d, ...(r.items[who] ? {} : { name: itemName(r, before, who) }), src }));
    }
    case "money": {
      const id = r.hud.money;
      const n = Number(fix.value);
      if (!id || !r.stats[id]) return "This ruleset has no money.";
      if (!Number.isFinite(n)) return "Give an amount.";
      return buildTurn(r, before, "fix", (t) => t.push({ t: "stat", id, set: n, src }));
    }
    case "goal": {
      const g = before.goals?.[who];
      if (!g) return "Unknown goal.";
      const v = String(fix.value);
      const st = v === "done" ? "done" : v === "failed" || v === "fail" ? "failed" : v === "open" ? "open" : v === "drop" ? null : undefined;
      if (st === undefined) return "Mark it done, failed, open or drop it.";
      return buildTurn(r, before, "fix", (t) => t.push({ t: "goal", id: who, st, ...(st === "open" ? { text: g.text } : {}), src }));
    }
  }
  return "That can't be fixed here.";
}
