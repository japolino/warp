// Recent social repetition follows game time, not UI sessions or wall time.
import type { GameState } from "../state.js";
import { DEFAULT_SOCIAL_MEMORY, type DateSession, type SocialMemory, type SocialMemoryDef } from "./types.js";

/** One recent use fades in four game hours by default; a busy topic needs longer. `dating.memory` tunes these. */
export const SOCIAL_RECOVERY_MINUTES = DEFAULT_SOCIAL_MEMORY.recoveryMinutes;
export const SOCIAL_KEYS_KEPT = DEFAULT_SOCIAL_MEMORY.keys;

function faded(minutes: number, cfg: SocialMemoryDef): number {
  return cfg.recoveryMinutes > 0 ? Math.max(0, minutes) / cfg.recoveryMinutes : 0;
}

export function recentCount(s: GameState, who: string, key: string, cfg: SocialMemoryDef = DEFAULT_SOCIAL_MEMORY): number {
  const entry = s.dating.recent?.[who]?.topics[key];
  return entry ? Math.max(0, entry.count - faded(s.minutes - entry.at, cfg)) : 0;
}

/** Legacy sessions still retain their session-local repeat penalty. */
export function socialRepeat(s: GameState, sess: DateSession, key: string, cfg: SocialMemoryDef = DEFAULT_SOCIAL_MEMORY): number {
  return Math.max(recentCount(s, sess.who, key, cfg), sess.used[key] ?? 0);
}

/** Rest restores one fatigue point per game minute by default. Reopening alone is not rest. */
export function restedFatigue(s: GameState, who: string, cfg: SocialMemoryDef = DEFAULT_SOCIAL_MEMORY): number {
  const memory = s.dating.recent?.[who];
  return memory ? Math.max(0, memory.fatigue - Math.max(0, s.minutes - memory.at) * cfg.restPerMinute) : 0;
}

export function affectionFactor(repeat: number): number {
  return 1 / (1 + repeat) ** 2;
}

/** Fold concrete event values, prune faded keys, and cap storage per person. */
export function rememberSocial(previous: SocialMemory | undefined, key: string, at: number, count: number, fatigue: number, cfg: SocialMemoryDef = DEFAULT_SOCIAL_MEMORY): SocialMemory {
  const entries = Object.entries(previous?.topics ?? {}).filter(([k, v]) => k !== key && v.count > faded(at - v.at, cfg));
  entries.push([key, { at, count }]);
  entries.sort((a, b) => a[1].at - b[1].at);
  return { at, fatigue, topics: Object.fromEntries(entries.slice(-Math.max(1, cfg.keys))) };
}
