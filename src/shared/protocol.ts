// Messages and view models shared by backend and frontend.

import type { Tier } from "../engine/ruleset.js";

export type Tone = "good" | "warn" | "bad" | "neutral";

export interface BarView {
  id: string;
  label: string;
  value: number;
  display: string;
  pct: number;
  text: string | null;
  tone: Tone;
  good: "high" | "low" | "none";
  color?: string;
  desc?: string;
}

export interface SkillView {
  id: string;
  label: string;
  display: string;
  grade: string | null;
  pct: number;
  kind: "attribute" | "skill";
  text: string | null;
  tone: Tone;
}

export interface PersonView {
  id: string;
  name: string;
  stats: { id: string; label: string; display: string; pct: number; text: string | null; tone: Tone }[];
}

export interface HudView {
  rulesetName: string;
  clock: { label: string; time: string; day: string; phase: string } | null;
  location: { name: string; desc?: string } | null;
  money: string | null;
  bars: BarView[];
  skills: SkillView[];
  people: PersonView[];
  items: { id: string; name: string; count: number }[];
  conditions: { id: string; label: string; tone: Tone; desc?: string; remaining?: string }[];
  turn: number;
}

export interface ChoiceView {
  id: string;
  label: string;
  group: string | null;
  desc: string | null;
  /** 0–1 chance of success-or-better, when the action has a check. */
  odds: number | null;
  partialOdds: number | null;
  checkLabel: string | null;
  veiled: boolean;
  params: { id: string; label: string; options: string[]; default: string }[];
}

export interface ChangeView {
  text: string;
  tone: Tone;
  src: string;
  /** Band text reached, e.g. "You are stressed." */
  band?: string;
  /** Index into the record's events of the first event this change summarises — used for undo. */
  undo?: number[];
}

export interface RecordView {
  messageId: string;
  swipe: number;
  action: string | null;
  via: string | null;
  check: {
    label: string;
    dice: string;
    faces: { sides: number; value: number; kept: boolean }[];
    roll: number;
    add: number;
    total: number;
    target: number | null;
    style: string;
    tier: Tier;
    tierLabel: string;
    summary: string;
  } | null;
  changes: ChangeView[];
  hints: string[];
  veiled: boolean;
  /** Adjudicator confidence when the action was read from typed text. */
  confidence: number | null;
  /** NPC/world reactions the engine rolled on model odds. */
  decisions: { ask: string; picked: string; p: number; source: "model" | "weights"; odds: { desc: string; p: number }[] }[];
  /** Probability the reply contradicts the state (shown when high). */
  contradiction: number | null;
  /** The player's message this reply answers, when the turn can still be redone. */
  redoFrom: string | null;
}

export interface SuggestionView {
  /** The player's message the suggestion belongs to. */
  messageId: string;
  actionId: string;
  params?: Record<string, string>;
  label: string;
  confidence: number;
  canRedo: boolean;
}

export interface IssueView { level: "error" | "warning"; where: string; message: string }

export interface RulesetStatus {
  state: "none" | "ok" | "broken";
  name: string | null;
  source: string | null;
  issues: IssueView[];
  characterName: string | null;
  /** Content tags used by this ruleset's actions, for the Lines & Veils picker. */
  tags: string[];
}

export interface Settings {
  enabled: boolean;
  /** Read free-text messages and map them to a ruleset action (the adjudicator). */
  freeTextChecks: boolean;
  /** Let a model read each reply and suggest bounded state changes. */
  narratorUpdates: boolean;
  /** Swiping a reply rerolls its dice (Casual). Off = dice fixed per player message (Ironman). */
  swipesReroll: boolean;
  /** Connection used for the adjudicator and extractor; empty = the chat's own connection. */
  helperConnectionId: string;
  showOdds: boolean;
  showDiceChips: boolean;
  hotkeys: boolean;
  /** Content tags removed from the game entirely. */
  lines: string[];
  /** Content tags that still happen but are narrated off-screen. */
  veils: string[];
  /** Which model answers Warp's typed questions (reading actions, bookkeeping, NPC odds, scene triggers). */
  decider: "llm" | "jev" | "rules";
  jevModel: string;
  /** Read typed actions and roll automatically at or above this confidence. */
  autoConfidence: number;
  /** Between this and autoConfidence, offer the action as a one-tap suggestion instead. */
  askConfidence: number;
  /** After each reply, check whether it contradicts the game state. */
  consistencyCheck: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  freeTextChecks: true,
  narratorUpdates: true,
  swipesReroll: true,
  helperConnectionId: "",
  showOdds: true,
  showDiceChips: true,
  hotkeys: true,
  lines: [],
  veils: [],
  decider: "llm",
  jevModel: "jev-latest",
  autoConfidence: 0.75,
  askConfidence: 0.4,
  consistencyCheck: false,
};

export interface TemplateInfo { id: string; name: string; blurb: string }

export type BackendToFrontend =
  | {
      type: "state";
      chatId: string | null;
      status: RulesetStatus;
      hud: HudView | null;
      choices: ChoiceView[];
      records: RecordView[];
      suggestions: SuggestionView[];
      latestMessageId: string | null;
      /** Latest message is from the assistant (choices are shown under it). */
      choicesAnchor: string | null;
      busy: boolean;
    }
  | { type: "busy"; chatId: string; busy: boolean; label?: string }
  | { type: "settings"; settings: Settings; templates: TemplateInfo[]; connections: { id: string; name: string }[]; jevKeySet: boolean }
  | { type: "toast"; level: "info" | "success" | "warning" | "error"; message: string }
  | { type: "command"; command: "open" | "install" };

export type FrontendToBackend =
  | { type: "hello"; chatId: string | null }
  | { type: "refresh"; chatId: string | null }
  | { type: "act"; chatId: string; actionId: string; params?: Record<string, string> }
  | { type: "undo"; chatId: string; messageId: string; swipe: number; events: number[] }
  | { type: "adjust"; chatId: string; stat: string; value: number }
  | { type: "settings"; patch: Partial<Settings> }
  | { type: "install_template"; chatId: string | null; templateId: string }
  | { type: "reload"; chatId: string | null }
  /** Replace the reply to `userMessageId` and resend it with this intent (null = "not an action"). */
  | { type: "redo"; chatId: string; userMessageId: string; actionId: string | null; params?: Record<string, string> }
  | { type: "dismiss_suggestion"; chatId: string; messageId: string }
  | { type: "set_jev_key"; key: string }
  | { type: "test_decider" };
