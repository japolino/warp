// Messages and view models shared by backend and frontend.

import type { Tier } from "../engine/ruleset.js";


export type Tone = "good" | "warn" | "bad" | "neutral";

export interface BarView {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
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
  /** Progress toward the next point from use and practice, 0–1 (null = doesn't grow, or maxed). */
  practice: number | null;
  /** Raised by hand with points (`allocate:`): the pool, its points left, what a step costs and adds, and steps of room under the max. */
  allocate?: { pool: string; poolLabel: string; left: number; cost: number; step: number; room: number };
  /** The heading it's filed under (`group:`, else Attributes or Skills by kind). */
  group: string;
}

export interface PersonView {
  id: string;
  name: string;
  stats: { id: string; label: string; value: number; min: number; max: number; display: string; pct: number; text: string | null; tone: Tone }[];
  /** Here with the player right now. */
  present: boolean;
  /** Where their schedule puts them, when they have one. */
  whereabouts: string | null;
  /** A companion's goal. */
  goal: string | null;
  /** How they feel about other people ("fond of Dex"). */
  bonds: string[];
  /** Conditions they're under (drugged, sick, charmed…). */
  conditions: { label: string; tone: Tone; remaining: string | null }[];
  /** What they remember about {{user}}, newest first. */
  memories: { text: string; when: string | null }[];
}

/** A quest as the journal shows it: offered here, under way, waiting to be handed in, or over. */
export interface QuestView {
  id: string;
  name: string;
  kind: string;
  status: "offered" | "active" | "ready" | "done" | "failed";
  giver: string | null;
  desc: string | null;
  goals: { text: string; done: boolean; progress: string | null; optional: boolean }[];
  /** "2 days left", "overdue". */
  due: string | null;
  dueTone: Tone;
  reward: string | null;
  /** What failing costs. */
  stakes: string | null;
  /** Handed out by the story rather than the ruleset. */
  story: boolean;
  /** Choice ids: take it (offered), hand it in (ready, where that's possible), give up (under way). */
  take: string | null;
  report: string | null;
  drop: string | null;
  /** Where it was offered: by whom, or on a board. */
  from: string | null;
}

export interface ClothingView { id: string; name: string; slot: string; warmth: number; reveal: number; traits: string[]; integrity: number | null; worn: boolean }

export interface HudView {
  rulesetName: string;
  clock: { label: string; time: string; day: string; phase: string } | null;
  /** "Sun 4th Sep" when the ruleset has a calendar. */
  date: string | null;
  weather: { icon: string; label: string; temp: number; season: string | null; indoors: boolean } | null;
  location: { name: string; desc?: string } | null;
  money: string | null;
  bars: BarView[];
  skills: SkillView[];
  people: PersonView[];
  items: {
    id: string; name: string; count: number; worn: boolean; /** "3/5" uses left in the one in hand. */ uses: string | null;
    /** Using it: the choice id (`item:<id>`), its label, and why it's locked (null = usable now). */
    use: { id: string; label: string; locked: string | null; drafted: boolean } | null;
    /** Gear: what it adds to checks ("+5 Athletics"). */
    bonus: string | null;
  }[];
  conditions: { id: string; label: string; tone: Tone; desc?: string; remaining?: string }[];
  /** Quests: offered here, under way, waiting to be handed in, and the last few that ended. */
  quests: QuestView[];
  /** Clothing warmth vs what the weather calls for. */
  warmth: { value: number; min: number; max: number; tone: Tone; text: string } | null;
  /** One row per wardrobe slot. */
  outfit: { slot: string; label: string; item: ClothingView | null }[] | null;
  /** Owned clothing (for the change-clothes panel). */
  clothing: ClothingView[];
  exposed: string[];
  encounter: {
    name: string;
    foe: string;
    round: number;
    stats: { id: string; label: string; value: number; max: number; pct: number; tone: Tone }[];
    /** −100 … +100 for fights that swing. */
    momentum: number | null;
    /** What the player is trying to do ("Bring their fervor to 0"). */
    goal: string | null;
    /** Progress toward it: foe stats with the value that ends it. */
    progress: { label: string; value: number; target: number; max: number }[];
    /** Player stats it can be lost on, nearest first. */
    danger: { label: string; value: number; at: number; text: string; close: boolean }[];
    dangerText: string | null;
    /** Rounds play quietly in one growing message (false: each round is narrated in full). */
    quiet: boolean;
    /** Statuses on the opponent (rounds null = until the fight ends). */
    foeConds: { id: string; label: string; tone: Tone; rounds: number | null; desc?: string }[];
    /** Armor on the opponent's main meter, and {{user}}'s on what the fight is lost on (null = none). */
    foeArmor: number | null;
    yourArmor: number | null;
  } | null;
  codex: { id: string; title: string; text: string; category: string | null }[];
  codexTotal: number;
  feats: { id: string; name: string; desc: string; unlocked: boolean }[];
  perks: {
    id: string; name: string; desc: string; cost: number; owned: boolean; blocker: string | null;
    /** On offer right now (when perks are picked from a few rather than bought from the list). */
    offered: boolean;
    /** The downside, if it has one. */
    drawback: string | null;
    /** What it does, in short ("+15 Stealth on the promenade", "1 reroll left today"). */
    notes: string[];
    /** The pool it's paid from when that isn't the main perk points (points: class_points). */
    pointsLabel?: string;
    /** The heading it's filed under (`group:`), if any. */
    group: string | null;
    /** Its requirements don't hold yet: listed folded, by name and what it needs. */
    locked: boolean;
    /** What it still needs, in words ("Level 10, Rogue"), when locked. */
    needs: string | null;
  }[];
  perkPoints: number | null;
  /** How many perks are offered at a time (0: the whole list, like a shop). */
  perkPick: number;
  /** The player's own abilities (spells, techniques): what they cost, uses left, and whether they can be used now. */
  abilities: { id: string; name: string; desc: string | null; cost: string | null; left: number | null; locked: string | null; choice: string }[];
  /** What has surfaced in the world (newest first). */
  news: { text: string; when: string | null }[];
  /** Body parts and their traits, when the ruleset has a body. */
  body: { part: string; label: string; text: string; covered: boolean }[] | null;
  /** Transformations under way. */
  transforms: { label: string; stage: number; of: number }[];
  /** Checkpoints and endings, when the ruleset has them. */
  run: {
    slots: { id: string; label: string | null }[];
    auto: string | null;
    runs: number;
    loops: number;
    hard: boolean;
    ended: { title: string; kind: string; text: string; told: boolean } | null;
    /** What survives loading a save / starting over, in words. */
    keeps: string;
    legacy: string;
  } | null;
  turn: number;
}

export interface MapView {
  nodes: { id: string; name: string; x: number; y: number; here: boolean; reachable: boolean; indoors: boolean; people: string[]; /** Why travel there is locked (its `requires:`). */ locked?: string }[];
  edges: [string, string][];
}

/** One encounter round, straight from the ledger: the check is the check, not the encounter. */
export interface RoundCardView {
  move: string;
  check: { label: string; tier: string; odds: number | null; gear: string[] } | null;
  foe: string | null;
  changes: { label: string; from: number; to: number; of: number | null; good: boolean }[];
  /** Set only when the rules ended it. */
  ended: { outcome: string; label: string; loss: boolean } | null;
  round: number;
}

/** A quiet encounter's log message, for the cards shown under it. */
export interface EncounterLogView {
  messageId: string;
  name: string;
  foe: string;
  status: "on" | "ended";
  rounds: RoundCardView[];
  /** The first round this message shows. */
  from: number;
  ended: { label: string; loss: boolean } | null;
}

export interface ChoiceView {
  /** Nonbinding story forecast. Mechanics and odds still come only from the tag. */
  forecast?: { goal: string; risk: string; payoff: string };
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
  /** Its reply is already written: clicking it is instant. */
  ready?: boolean;
  /** Can't be taken right now, and why ("Needs a Cream Brioche"). */
  locked?: string;
  /** Why it's suggested now (items: "Clears Scented"). */
  why?: string;
}

export interface ChangeView {
  text: string;
  tone: Tone;
  src: string;
  /** Band text reached, e.g. "You are stressed." */
  band?: string;
  /** Index into the record's events of the first event this change summarises — used for undo. */
  undo?: number[];
  /** What caused it ("Rule \"breakdown\" (stress >= 100)", "Read from the story"…). */
  why?: string[];
}

export interface RecordView {
  messageId: string;
  swipe: number;
  /** In-game clock at the end of this turn (timeline). */
  clock: string | null;
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
  /** The player's message told a roll made on the click: roll again from it (rewrites the line and the reply). */
  rerollFrom?: string | null;
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
  /** Guess: one character, or a scenario/narrator card (whose name isn't a person). */
  cardKind: "character" | "scenario";
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
  /** The classifier endpoint: TypeSafe's by default, or any compatible URL (or an OpenAI-style chat endpoint). */
  jevUrl: string;
  /** How to talk to it: TypeSafe's typed-questions API, or an OpenAI-compatible /chat/completions endpoint. */
  jevFormat: "typesafe" | "openai";
  /** Track the favours and jobs people ask {{user}} for in the story as quests. */
  storyQuests: boolean;
  /** Read typed actions and roll automatically at or above this confidence. */
  autoConfidence: number;
  /** Between this and autoConfidence, offer the action as a one-tap suggestion instead. */
  askConfidence: number;
  /** After each reply, check whether it contradicts the game state. */
  consistencyCheck: boolean;
  /** Drafts per reply (1 = off): extras are written and the decision model keeps the best. */
  drafts: number;
  /** Pre-write replies for this many of the first choices, so clicking them is instant (0 = off). */
  prewrite: number;
  /** A clicked move is rolled on the click, and the player's message says how it went, in their voice. */
  sayOutcome: boolean;
  /** Choice buttons under the reply (the CYOA). Off: none, and none are written — fights and endings keep theirs. */
  showChoices: boolean;
  /** The chips under each reply that say what changed (time, feelings, items…). Off: only in the sheet's history. */
  showChanges: boolean;
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
  jevUrl: "https://api.typesafe.ai/v1/systemone",
  jevFormat: "typesafe",
  storyQuests: true,
  autoConfidence: 0.75,
  askConfidence: 0.4,
  consistencyCheck: false,
  drafts: 1,
  prewrite: 0,
  sayOutcome: true,
  showChoices: true,
  showChanges: true,
};

export interface TemplateInfo { id: string; name: string; blurb: string }

// ───────────────────────── AI ruleset builder ─────────────────────────

export interface BuilderQuestion {
  id: string;
  text: string;
  kind: "single" | "multi" | "scale" | "text";
  options?: { id: string; label: string }[];
  /** Why it's being asked (shown small under the question). */
  why?: string;
  /** Part of the fixed core set every card gets. */
  core?: boolean;
  /** Default answer. */
  default?: string | string[] | number;
}

export type BuilderAnswer = string | string[] | number;

export interface BuilderAddition { name: string; kind: "skill" | "meter" | "item" | "place" | "action" | "rule" | "person" | "other"; note: string }

export interface BuilderPart {
  label: string;
  yaml: string;
  /** ok = passes the checker; warn = only warnings; error = can't run. */
  status: "ok" | "warn" | "error";
  issues: IssueView[];
  /** Changed by the latest refine. */
  changed?: boolean;
}

export interface BuilderSession {
  /** Persisted draft format; absent on drafts written before migrations. */
  schemaVersion?: number;
  characterId: string;
  characterName: string;
  /** build = from the card; refine = change by request; import = a rulebook written elsewhere. */
  mode: "build" | "refine" | "import";
  /** The player's persona (who {{user}} is), so their own powers and training become abilities. */
  persona?: string | null;
  step: "start" | "questions" | "review" | "done";
  /** The design plan written before any YAML: the loop, the pressures, how the systems connect. */
  plan?: string | null;
  connectionId: string;
  creative: boolean;
  base: string;
  analysis: {
    summary: string;
    suggestedTemplate: string;
    reason: string;
    statusBlock: { found: boolean; fields: string[] } | null;
    /** "scenario" = a narrator/world card whose name isn't a person. */
    cardType: "character" | "scenario";
    /** The main people in the story and how each starts out toward the player. */
    cast: { name: string; relation: string }[];
  } | null;
  rounds: { questions: BuilderQuestion[]; answers: Record<string, BuilderAnswer> }[];
  additions: BuilderAddition[];
  parts: BuilderPart[];
  preview: {
    summary: string;
    counts: Record<string, number>;
    hud: HudView | null;
    choices: ChoiceView[];
  } | null;
  /** Refine: what was asked and what the model says it changed. */
  request: string | null;
  changeSummary: string | null;
  /** Something is running (label shown with a spinner). */
  busy: string | null;
  error: string | null;
  updatedAt: number;
}

export type BackendToFrontend =
  | {
      type: "state";
      chatId: string | null;
      revision?: number;
      historyConflict?: string | null;
      status: RulesetStatus;
      hud: HudView | null;
      map: MapView | null;
      choices: ChoiceView[];
      records: RecordView[];
      suggestions: SuggestionView[];
      latestMessageId: string | null;
      /** Latest message is from the assistant (choices are shown under it). */
      choicesAnchor: string | null;
      busy: boolean;
      /** Quiet encounter logs among the recent messages, for their round cards. */
      encounterLogs?: EncounterLogView[];
    }
  | { type: "busy"; chatId: string; busy: boolean; label?: string }
  | { type: "settings"; settings: Settings; templates: TemplateInfo[]; connections: { id: string; name: string }[]; jevKeySet: boolean }
  | { type: "toast"; level: "info" | "success" | "warning" | "error"; message: string }
  | { type: "command"; command: "open" | "install" }
  | { type: "builder"; session: BuilderSession | null; chatId?: string | null }
  /** The installed rulebook as one file, for editing elsewhere. */
  | { type: "rulebook_export"; name: string; text: string };

export type FrontendToBackend =
  | { type: "reconcile_history"; chatId: string; keep: boolean }
  | { type: "hello"; chatId: string | null }
  | { type: "refresh"; chatId: string | null }
  | { type: "act"; chatId: string; actionId: string; params?: Record<string, string> }
  /** A line typed in Warp's own box (an encounter's move), or posted to the chat otherwise. */
  | { type: "say"; chatId: string; text: string }
  | { type: "undo"; chatId: string; messageId: string; swipe: number; events: number[] }
  | { type: "adjust"; chatId: string; stat: string; value: number }
  | { type: "settings"; patch: Partial<Settings> }
  | { type: "install_template"; chatId: string | null; templateId: string; trackCharacter?: boolean }
  | { type: "reload"; chatId: string | null }
  /** Replace the reply to `userMessageId` and resend it with this intent (null = "not an action"). */
  | { type: "redo"; chatId: string; userMessageId: string; actionId: string | null; params?: Record<string, string> }
  | { type: "dismiss_suggestion"; chatId: string; messageId: string }
  /** Wardrobe: put on an item, or take off a slot (item null). */
  | { type: "wear"; chatId: string; slot: string; item: string | null }
  | { type: "buy_perk"; chatId: string; perk: string }
  /** Spend points on stats with `allocate:`, in steps: `{ str: 2, dex: 1 }`. */
  | { type: "allocate"; chatId: string; spend: Record<string, number> }
  /** Roll a clicked move again: a new roll, a new line in the player's message, a new reply. */
  | { type: "reroll"; chatId: string; messageId: string }
  | { type: "adjust_rel"; chatId: string; who: string; stat: string; value: number }
  | { type: "forget"; chatId: string; who: string }
  | { type: "builder_open"; chatId: string; mode: "build" | "refine" }
  /** A rulebook written elsewhere: split, checked and previewed in the builder before anything is saved. */
  | { type: "builder_import"; chatId: string; text: string }
  | { type: "export_rulebook"; chatId: string }
  | { type: "builder_start"; chatId: string; connectionId: string; creative: boolean; base?: string }
  | { type: "builder_answer"; chatId: string; answers: Record<string, BuilderAnswer>; additions: BuilderAddition[]; more: boolean }
  | { type: "builder_redo"; chatId: string; part: string; note?: string }
  | { type: "builder_refine"; chatId: string; request: string }
  | { type: "builder_install"; chatId: string }
  | { type: "builder_back"; chatId: string }
  | { type: "builder_close"; chatId: string }
  | { type: "run"; chatId: string; op: "save" | "load" | "restart" | "continue"; slot?: string }
  | { type: "set_jev_key"; key: string }
  | { type: "test_decider" };
