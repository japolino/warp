// @deprecated Quests were replaced by story goals (goals.ts). These stubs keep the backend's old readers
// compiling until the pipeline stops importing them; `Ruleset.quests` is always empty, so nothing is offered.

import type { QuestDef, Ruleset } from "./ruleset.js";
import type { GameState } from "./state.js";

export const QUEST_PREFIX = "quest:";
export const STORY_QUEST = "story_";

/** @deprecated The old story-quest news shape (use `Proposal.goals`). */
export interface StoryQuestNews {
  new?: { name: string; giver?: string; goal: string; fail?: string; stakes?: string }[];
  done?: string[];
  failed?: string[];
}

/** @deprecated Always null. */
export function questDef(_r: Ruleset, _s: GameState, _id: string): QuestDef | null { return null; }
/** @deprecated Always empty. */
export function questOffers(_r: Ruleset, _s: GameState): { id: string; via: "giver" | "board" | "place"; from: string | null }[] { return []; }
/** @deprecated Always empty. */
export function questsToReport(_r: Ruleset, _s: GameState): { id: string; to: string | null }[] { return []; }
