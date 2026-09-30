// Relationship stage from love and fear. Kept free of runtime imports so the
// formula environment (state.ts) can use it.

import type { Ruleset } from "../ruleset.js";
import type { GameState } from "../state.js";

/** A relationship stat as 0–100 of its range. */
export function relPct(r: Ruleset, s: GameState, who: string, stat: string): number {
  const def = r.relStats[stat];
  if (!def) return 0;
  const v = s.rel[who]?.[stat] ?? def.start;
  return def.max > def.min ? Math.max(0, Math.min(100, ((v - def.min) / (def.max - def.min)) * 100)) : 0;
}

export function isHostile(r: Ruleset, s: GameState, who: string): boolean {
  return r.dating.enabled && relPct(r, s, who, r.dating.fear) >= r.dating.hostileAt;
}

/** Index into the stage ladder; −1 when fear has made them hostile. */
export function stageIndex(r: Ruleset, s: GameState, who: string): number {
  if (!r.dating.enabled) return 0;
  if (isHostile(r, s, who)) return -1;
  const love = relPct(r, s, who, r.dating.love);
  let idx = 0;
  r.dating.stages.forEach((st, i) => {
    if (love >= st.at && (!st.partner || s.dating.partners[who])) idx = i;
  });
  // A partner stays a partner even if love dips, until the relationship ends.
  const partner = r.dating.stages.findIndex((st) => st.partner);
  if (partner >= 0 && s.dating.partners[who]) idx = Math.max(idx, partner);
  return idx;
}

export function stageLabel(r: Ruleset, s: GameState, who: string): string {
  const i = stageIndex(r, s, who);
  return i < 0 ? r.dating.hostileLabel : r.dating.stages[i]?.label ?? "";
}
