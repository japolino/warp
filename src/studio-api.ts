// The engine surface Warp Studio uses (STUDIO-DESIGN §3.2), in one place, so Warp's own type check guards it.
// Everything here runs without the Lumiverse host (its only outside import is js-yaml). Studio imports this file
// (or the modules it names) from a pinned Warp; when a name here changes, Studio's seam file changes with it.

// Parse, normalize and lint.
export { loadRuleset, isRulesetBookName, isRulesetEntryTitle, deepMerge, type LoadResult, type RulesetPart } from "./engine/loader.js";
export { lintRuleset, FUNCTIONS, REMOVED_FORMULAS, REMOVED_FORMULA_NAMES } from "./engine/lint.js";
export {
  normalizeRuleset, RULESET_FORMAT, REMOVED_KEYS, REMOVED_EFFECTS, REMOVED_EFFECT_NAMES, TOP_LEVEL_KEYS, ACTION_KEYS,
  DEFAULT_DIRECTIONS, DEFAULT_DC, DEFAULT_SWING, DEFAULT_ROUNDS, DEFAULT_ESCALATE, DEFAULT_TAPER, DIFFICULTIES, DIFFICULTY_WORDS, TIERS,
  type Ruleset, type Issue, type StatDef, type Band, type Effect, type ActionDef, type CheckDef, type ItemDef, type ConditionDef,
  type PersonDef, type SecretDef, type LiveChoicesDef, type ChecksDef, type ConflictDef, type KindDef, type GoalsDef, type GoalDef,
  type Difficulty, type DifficultyWord, type Tier, type Style,
} from "./engine/ruleset.js";

// Sections of a whole rulebook, and the format reference.
export { splitRulebook, joinRulebook, type RulebookPart } from "./engine/rulebook.js";
export { PART_LABELS, PART_CONTENTS, partForIssue, REFERENCE, DESIGN_GUIDE, type PartLabel } from "./engine/reference.js";
export { TEMPLATES, getTemplate, withCharacter, looksLikeScenario, type Template } from "./engine/templates/index.js";

// What the audit reads: formulas, the start state, odds.
export { compile, identifiers, evalBool, evalNumber, type ExprEnv, type Value } from "./engine/expr.js";
export { initialState, makeEnv, foldEvents, BUILTIN_NAMES, type GameState, type WarpEvent } from "./engine/state.js";
export { odds, checkNumbers, resolveTurn, applyProposal, type Proposal, type TurnRecord, type LiveChoice } from "./engine/resolve.js";
export { d20Odds } from "./engine/dice.js";

// The preview: the panel, the choices and the narrator's block at the start.
export { buildHud, buildChoices, stateDigest, narratorKnowledge } from "./engine/view.js";

// The playtest: the whole-loop simulator and the contest table.
export { runLoopSim, createLoopSim, type LoopOptions, type LoopReport, type LoopGate, type LoopCheckRow, type LoopContestRow, type LoopPolicy } from "./engine/loop-sim.js";
export { simulateContest, statAdd, type ContestSim } from "./engine/contest.js";
