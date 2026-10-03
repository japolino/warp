// Conflict: one contest system for fights, chases and arguments (CORE-DESIGN §2.5).
// A momentum gauge from −100 (the opponent wins) to +100 ({{user}} wins); each move's check swings it,
// the stakes rise each round, and only a full swing (or Break off / Give in / the last round) ends it.

/** Intent ids of contest moves: `contest:<stat>` (a move leaning on that stat), Break off and Give in. */
export const CONTEST_PREFIX = "contest:";
export const BREAK_OFF = "contest:break_off";
export const GIVE_IN = "contest:give_in";

/** The intent id of a move that leans on `stat`. */
export function contestMoveId(stat: string): string {
  return `${CONTEST_PREFIX}${stat}`;
}

/** Where a contest stands, in words (the narrator's and the panel's). */
export function momentumWords(m: number, opponent: string, you = "{{user}}"): string {
  if (m >= 100) return `${you} has won`;
  if (m <= -100) return `${opponent} has won`;
  if (m >= 60) return `${you} is close to winning`;
  if (m >= 20) return `${you} has the upper hand`;
  if (m > -20) return "evenly matched";
  if (m > -60) return `${opponent} has the upper hand`;
  return `${opponent} is close to winning`;
}
