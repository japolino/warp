// Derived world facts: the calendar and who is here.
//
// None of these are stored — they're computed from the clock and the state,
// so they replay identically and cost nothing to keep.

import type { ExprEnv } from "./expr.js";
import type { Ruleset } from "./ruleset.js";
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
  const first = typeof r.clock.start === "number" ? r.clock.start : r.clock.fallback;
  const elapsed = Math.floor(minutes / 1440) - Math.floor(first / 1440);
  let day = start.day - 1 + Math.max(0, elapsed);
  while (day >= MONTH_DAYS[month]) { day -= MONTH_DAYS[month]; month = (month + 1) % 12; }
  return { month: month + 1, day: day + 1, monthName: MONTH_NAMES[month] };
}

/**
 * What the story last said about someone being in the scene, if it holds here: the word holds until the story,
 * the player or a move changes it (no expiry, so nobody drifts out of the scene with time).
 */
export function sceneWord(s: GameState, id: string): boolean | null {
  const w = s.scene?.[id];
  return w && w.loc === s.location ? w.here : null;
}

/**
 * People here now: whoever the story last said is here (at this place). The ruleset and
 * formula environment are no longer needed (schedules were taken out); they stay in the
 * signature so callers don't change.
 */
export function presentPeople(_r: Ruleset, s: GameState, _env?: ExprEnv): string[] {
  const out: string[] = [];
  for (const id of Object.keys(s.people)) {
    if (s.forgotten[id]) continue;
    if (sceneWord(s, id)) out.push(id);
  }
  return out;
}
