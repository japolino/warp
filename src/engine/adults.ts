// The one adults-only check (CORE-DESIGN §2.2.1): a person is an adult when their age is 18 or more,
// never under 18, and otherwise only once the story or the card says so (asked once, then remembered).

import type { Ruleset } from "./ruleset.js";
import type { GameState } from "./state.js";

/** Tags that mark romantic or sexual moves: never offered toward someone not known to be an adult. */
export const ADULT_TAGS = new Set(["sexual", "sex", "nsfw", "lewd", "explicit", "erotic", "smut", "romance", "romantic"]);

/** true = an adult, false = not, null = not known yet ("you" = the player). */
export function isAdult(r: Ruleset, s: GameState, who: string): boolean | null {
  const age = who === "you" ? r.you.age : r.people[who]?.age;
  if (age !== undefined && Number.isFinite(age)) return age >= 18;
  const known = s.adults?.[who];
  return known === undefined ? null : known;
}

/** Does a move with these tags need its target to be a known adult? */
export function adultGated(tags: string[]): boolean {
  return tags.some((t) => ADULT_TAGS.has(t.toLowerCase()));
}
