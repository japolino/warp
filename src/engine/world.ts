// Derived world facts: calendar, weather, temperature, clothing, presence.
//
// None of these are stored — they're computed from the clock, the chat's world
// seed and the state, so they replay identically and cost nothing to keep.

import { seededRng } from "./dice.js";
import { evalBool, type ExprEnv } from "./expr.js";
import type { Ruleset, WeatherKind } from "./ruleset.js";
import type { GameState } from "./state.js";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export interface CalendarDate { month: number; day: number; monthName: string }

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}

/** Calendar date for a minute count, when the ruleset sets a start date. */
export function dateAt(r: Ruleset, minutes: number): CalendarDate | null {
  const start = r.clock.startDate;
  if (!start) return null;
  let month = start.month - 1;
  // The clock's start may sit on a weekday offset (Sun = day index 6); the date counts from that first day.
  const elapsed = Math.floor(minutes / 1440) - Math.floor(r.clock.start / 1440);
  let day = start.day - 1 + Math.max(0, elapsed);
  while (day >= MONTH_DAYS[month]) { day -= MONTH_DAYS[month]; month = (month + 1) % 12; }
  return { month: month + 1, day: day + 1, monthName: MONTH_NAMES[month] };
}

export function seasonAt(r: Ruleset, minutes: number): string | null {
  const d = dateAt(r, minutes);
  if (!d) return null;
  for (const [season, months] of Object.entries(r.weather.seasons)) if (months.includes(d.month)) return season;
  return null;
}

/** The weather for the current block of hours. Deterministic from the chat's world seed. */
export function weatherAt(r: Ruleset, s: GameState): WeatherKind | null {
  if (!r.weather.enabled || !r.weather.kinds.length) return null;
  const season = seasonAt(r, s.minutes);
  const pool = r.weather.kinds.filter((k) => !k.seasons || (season !== null && k.seasons.includes(season)));
  const kinds = pool.length ? pool : r.weather.kinds;
  const block = Math.floor(s.minutes / (r.weather.changeHours * 60));
  const rng = seededRng(`${s.seed ?? "world"}:weather:${block}`);
  const total = kinds.reduce((a, k) => a + k.weight, 0) || 1;
  let x = rng() * total;
  for (const k of kinds) { x -= k.weight; if (x <= 0) return k; }
  return kinds[kinds.length - 1];
}

export function isIndoors(r: Ruleset, s: GameState): boolean {
  return !!(s.location && r.locations[s.location]?.indoors);
}

/** °C where the player is: indoor temperature inside; season + weather + time of day outside. */
export function temperatureAt(r: Ruleset, s: GameState): number | null {
  if (!r.weather.enabled) return null;
  if (isIndoors(r, s)) return r.weather.indoorTemp;
  const season = seasonAt(r, s.minutes);
  const base = season !== null ? r.weather.seasonTemps[season] ?? 12 : 14;
  const hour = (s.minutes % 1440) / 60;
  // Warmest ~15:00, coldest ~03:00.
  const swing = r.weather.swing * Math.cos(((hour - 15) / 24) * 2 * Math.PI);
  const w = weatherAt(r, s);
  return Math.round((base + swing + (w?.temp ?? 0)) * 10) / 10;
}

export function wornItems(r: Ruleset, s: GameState): string[] {
  return Object.values(s.worn).filter((id) => !!id);
}

/** Total clothing warmth; damaged clothes keep you less warm. */
export function warmthOf(r: Ruleset, s: GameState): number {
  let total = 0;
  for (const id of wornItems(r, s)) {
    const def = r.items[id];
    if (!def) continue;
    const health = (s.integrity[id] ?? def.integrity) / def.integrity;
    total += def.warmth * Math.max(0, Math.min(1, health));
  }
  return Math.round(total * 10) / 10;
}

/** Comfortable warmth range for a temperature. */
export function warmthNeeded(temp: number): { min: number; max: number } {
  // Wide enough that ordinary clothes are fine at room temperature.
  const ideal = Math.max(0, Math.round((20 - temp) * 0.9));
  return { min: Math.max(0, ideal - 6), max: ideal + 12 };
}

export function revealOf(r: Ruleset, s: GameState): number {
  return wornItems(r, s).reduce((a, id) => a + (r.items[id]?.reveal ?? 0), 0);
}

export function exposedSlots(r: Ruleset, s: GameState): string[] {
  if (!r.wardrobe.enabled) return [];
  return r.wardrobe.cover.filter((slot) => !s.worn[slot]);
}

export function hasTrait(r: Ruleset, s: GameState, trait: string): boolean {
  const t = trait.toLowerCase();
  return wornItems(r, s).some((id) => r.items[id]?.traits.includes(t));
}

/** Where a scheduled person is right now (null = no schedule applies). */
export function personLocation(r: Ruleset, s: GameState, id: string, env: ExprEnv): string | null {
  const p = r.people[id];
  if (!p?.schedule.length) return null;
  for (const e of p.schedule) if (e.when === undefined || evalBool(e.when, env, false)) return e.at;
  return null;
}

/** People here now: scheduled people whose schedule puts them at the player's location. */
export function presentPeople(r: Ruleset, s: GameState, env: ExprEnv): string[] {
  if (!s.location) return [];
  return Object.keys(r.people).filter((id) => !s.forgotten[id] && personLocation(r, s, id, env) === s.location);
}
