// @deprecated Legacy encounters were replaced by contests (contest.ts). These stubs keep the backend's old
// quiet-encounter code compiling until the pipeline deletes it; `Ruleset.encounters` is always empty, so no
// encounter ever starts.

import type { EncounterDef, Ruleset } from "./ruleset.js";
import type { RoundCardView } from "../shared/protocol.js";
import type { TurnRecord } from "./resolve.js";
import type { GameState } from "./state.js";

export type RoundCard = RoundCardView;

/** @deprecated How an ending reads. */
export function outcomeLabel(enc: EncounterDef | undefined, outcome: string): string {
  return enc?.labels?.[outcome] ?? outcome.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** @deprecated Whether an ending is a loss (by its name). */
export function isLoss(_enc: EncounterDef | undefined, outcome: string): boolean {
  return /^(lost|lose|loss|beaten|defeat(ed)?|overwhelmed|caught|captured|ko|downed|slain|killed|dead|failed?)$/i.test(outcome);
}

/** @deprecated The old encounter guide's shape. */
export interface EncounterGuide {
  goal: string | null;
  progress: { label: string; value: number; target: number; max: number }[];
  danger: { label: string; value: number; at: number; text: string; close: boolean }[];
  dangerText: string | null;
}

/** @deprecated Always null (no encounters). */
export function encounterGuide(_r: Ruleset, _s: GameState): EncounterGuide | null { return null; }

/** @deprecated A round card from the ledger (the move and the check only). */
export function roundCard(_r: Ruleset, rec: TurnRecord, before: GameState, _after: GameState, odds: number | null): RoundCard {
  return {
    move: rec.action?.label ?? "No clear move",
    check: rec.check ? { label: rec.check.label, tier: rec.check.tier.replace("_", " "), odds, gear: rec.check.gear ?? [] } : null,
    foe: null, changes: [], ended: null, round: (before.encounter?.round ?? 0) + 1,
  };
}
