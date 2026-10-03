// Messages and view models shared by backend and frontend.

import type { Tier } from "../engine/ruleset.js";

/** A move's difficulty word: `none` = no roll. */
export type DifficultyView = "none" | "easy" | "fair" | "hard" | "extreme";


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
  /** The raw value and its bounds (for a bounded ✎ control). */
  value: number;
  min: number;
  max: number;
  display: string;
  grade: string | null;
  pct: number;
  kind: "attribute" | "skill";
  text: string | null;
  tone: Tone;
  /** Progress toward the next point from use and practice, 0–1 (null = doesn't grow, or maxed). */
  practice: number | null;
  /** The heading it's filed under (`group:`, else Attributes or Skills by kind). */
  group: string;
}

export interface PersonView {
  id: string;
  name: string;
  stats: { id: string; label: string; value: number; min: number; max: number; display: string; pct: number; text: string | null; tone: Tone }[];
  /** Here with the player right now. */
  present: boolean;
  /** Conditions they're under (drugged, sick, charmed…). */
  conditions: { label: string; tone: Tone; remaining: string | null }[];
  /** What they remember about {{user}}, newest first. */
  memories: { text: string; when: string | null }[];
  /** Looks and clothes as one line of text each (null = not known yet). */
  appearance: string | null;
  outfit: string | null;
  /** Authored per-person actions, shown as buttons in this person's row (not under the reply). */
  actions: ChoiceView[];
}

/** The contest running now: a momentum gauge from −100 (the opponent wins) to +100 (you win). */
export interface ConflictView {
  kind: string;
  /** The kind's label ("Fight"). */
  label: string;
  opponent: string;
  /** Rounds played so far, and the last round there can be. */
  round: number;
  maxRounds: number;
  momentum: number;
  /** "You have the upper hand." */
  words: string;
  /** The next move's odds of success-or-better on the best stat. */
  next: { odds: number; stat: string } | null;
}

/** A story goal for the Goals section and the journal. */
export interface GoalView {
  id: string;
  text: string;
  status: "open" | "done" | "failed";
  /** Who it is for (a person's name). */
  from: string | null;
  stakes: string | null;
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

export interface HudView {
  rulesetName: string;
  /** `minutes` = the raw clock (day = floor(minutes / 1440) + 1). */
  clock: { label: string; time: string; day: string; phase: string; minutes: number } | null;
  /** "Sun 4th Sep" when the ruleset has a calendar. */
  date: string | null;
  location: { name: string; desc?: string } | null;
  money: string | null;
  bars: BarView[];
  skills: SkillView[];
  /** {{user}}'s looks and clothes as text (null = not known yet). */
  you: { appearance: string | null; outfit: string | null };
  /** People who were with {{user}} before the last move and aren't marked here yet ("Were with you"). */
  wereWithYou: { id: string; name: string }[];
  people: PersonView[];
  items: {
    id: string; name: string; count: number; /** "3/5" uses left in the one in hand. */ uses: string | null;
    /** Using it: the choice id (`item:<id>`), its label, and why it's locked (null = usable now). */
    use: { id: string; label: string; locked: string | null; drafted: boolean } | null;
    /** Gear: what it adds to checks ("+5 Athletics"). */
    bonus: string | null;
  }[];
  conditions: { id: string; label: string; tone: Tone; desc?: string; remaining?: string }[];
  /** Open story goals first, then the last few done or failed. */
  goals: GoalView[];
  /** The contest running now, or null. */
  conflict: ConflictView | null;
  /** @deprecated Replaced by `goals` (kept until the UI stops reading it). */
  quests: QuestView[];
  /** @deprecated Replaced by `conflict` (kept until the UI stops reading it). */
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
  turn: number;
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

/**
 * A choice button. Ids: `live:<i>` = one of the choices written for this reply (in a contest: the written
 * moves), `contest:break_off` = Break off, `item:<id>` = use an item, anything else = an authored action
 * (the compact "More" row).
 */
export interface ChoiceView {
  /** @deprecated Forecasts are dropped (CORE-DESIGN §2.0.6 point 3). */
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
  /** Can't be taken right now, and why ("Needs a Cream Brioche"). */
  locked?: string;
  /** Why it's suggested now (items: "Clears Scented"). */
  why?: string;
  /** The written choice's difficulty word (live choices; null for authored actions). */
  difficulty: DifficultyView | null;
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
  /** Band-crossing story lines ("Mira is warming to you."), shown first, before `changes`. */
  lines: string[];
  /** A contest round on this record: the gauge's swing, where it stands after, and how it ended (null = still on). */
  contest: { kind: string; label: string; opponent: string; round: number; swing: number; momentum: number; outcome: "won" | "lost" | "escaped" | "gave_in" | "broken_off" | null } | null;
  changes: ChangeView[];
  hints: string[];
  veiled: boolean;
  /** Adjudicator confidence when the action was read from typed text. */
  confidence: number | null;
  /** NPC/world reactions the engine rolled on model odds. */
  decisions: { ask: string; picked: string; p: number; source: "model" | "weights"; odds: { desc: string; p: number }[] }[];
  /** The player's message this reply answers, when the turn can still be redone. */
  redoFrom: string | null;
  /** @deprecated Swipes reroll (Casual); there is no separate reroll. */
  rerollFrom?: string | null;
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
  /** The installed ruleset's style (story = no dice), for the Story / Adventure switch. */
  style?: "story" | "adventure";
  /** Id of the template the installed `warp-ruleset` book came from; null for builder or custom books. The Story / Adventure switch is enabled only for template installs. */
  template?: string | null;
}

/**
 * Settings (CORE-DESIGN §4.7). Visible: enabled, helperConnectionId, decider (Helper / Jev; Jev's key lives in
 * the enclave, not here) with jevUrl and jevModel in an Advanced fold, swipesReroll, showChoices, showOdds,
 * showChanges, lines, veils. Read but not shown: hotkeys. Everything else is fixed inside the backend.
 */
export interface Settings {
  enabled: boolean;
  /** Connection used for the helper calls (the typed read without Jev, the post-reply call, the greeting read); empty = the chat's own connection. */
  helperConnectionId: string;
  /** Which model answers Warp's typed questions: the helper LLM, or Jev (TypeSafe's classifier, or any service with the same API). */
  decider: "llm" | "jev" | DeprecatedDecider;
  jevModel: string;
  /** The classifier endpoint: TypeSafe's by default, or any URL that speaks the same typed-question API. */
  jevUrl: string;
  /** Swiping a reply rerolls its dice (Casual), for typed and clicked moves. Off = the same roll on every swipe (Ironman). */
  swipesReroll: boolean;
  /** Choice buttons under the reply. Off: none are shown, and none are written. */
  showChoices: boolean;
  showOdds: boolean;
  /** The "what changed" line under each reply (the dice chip always shows). */
  showChanges: boolean;
  /** Number keys pick choices (read, not shown). */
  hotkeys: boolean;
  /** Content tags removed from the game entirely. */
  lines: string[];
  /** Content tags that still happen but are narrated off-screen. */
  veils: string[];

  // ── @deprecated: delete this block (and DeprecatedDecider) when ui-c's render.ts stops reading it. ──
  // The backend never reads these; normalizeSettings pins them to their defaults.
  /** @deprecated Follows the ruleset's `style:`. */
  freeTextChecks: boolean;
  /** @deprecated Always on. */
  narratorUpdates: boolean;
  /** @deprecated Story goals follow the ruleset's `goals.from_story`. */
  storyQuests: boolean;
  /** @deprecated Cut: clicks no longer roll early or write the player's line. */
  sayOutcome: boolean;
  /** @deprecated The dice chip always shows. */
  showDiceChips: boolean;
  /** @deprecated An internal threshold now. */
  autoConfidence: number;
  /** @deprecated Only the typed-question (TypeSafe) format remains. */
  jevFormat: "typesafe" | "openai";
}

/** @deprecated "rules" is gone (read as "llm"); delete with the block above. */
export type DeprecatedDecider = "rules";

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  helperConnectionId: "",
  decider: "llm",
  jevModel: "jev-latest",
  jevUrl: "https://api.typesafe.ai/v1/systemone",
  swipesReroll: true,
  showChoices: true,
  showOdds: true,
  showChanges: true,
  hotkeys: true,
  lines: [],
  veils: [],
  // @deprecated block (see Settings)
  freeTextChecks: true,
  narratorUpdates: true,
  storyQuests: true,
  sayOutcome: false,
  showDiceChips: true,
  autoConfidence: 0.75,
  jevFormat: "typesafe",
};

export interface TemplateInfo { id: string; name: string; blurb: string }

/** What a one-click fix can change. */
export type FixField = "time" | "place" | "present" | "appearance" | "outfit" | "item" | "money" | "goal";

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
  /** The player's persona (who {{user}} is), so their own powers and training become part of the rules. */
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
      choices: ChoiceView[];
      records: RecordView[];
      latestMessageId: string | null;
      /** Latest message is from the assistant (choices are shown under it). */
      choicesAnchor: string | null;
      busy: boolean;
      /** The player's name (persona), for "You" lines and `warp-state-v1`. */
      player: string;
      /** A short fix hint for the Scene section, e.g. when the greeting read failed: "Warp couldn't read the greeting — set the time." */
      sceneHint?: string | null;
      /** @deprecated Quiet encounters are cut: every contest round is a narrated reply. */
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
  /** A line typed in Warp's own box: posted to the chat as the player's message. */
  | { type: "say"; chatId: string; text: string }
  | { type: "undo"; chatId: string; messageId: string; swipe: number; events: number[] }
  | { type: "adjust"; chatId: string; stat: string; value: number }
  | { type: "settings"; patch: Partial<Settings> }
  | { type: "install_template"; chatId: string | null; templateId: string; trackCharacter?: boolean; /** Switch style: replace the template-installed book and keep its people entries (CORE-DESIGN §4.7 #2). */ replace?: boolean }
  | { type: "reload"; chatId: string | null }
  /** "Not an action?": replace the reply to `userMessageId` and resend the message without a roll. */
  | { type: "redo"; chatId: string; userMessageId: string; actionId: null }
  /** @deprecated Swipes reroll (Casual); the backend ignores this. Delete when the UI stops sending it. */
  | { type: "reroll"; chatId: string; messageId: string }
  /**
   * One-click fix of a state line (a manual event on the latest message). `value` by field: time = minutes or
   * "HH:MM" / "Day 2 08:00"; place = words (null clears); present = boolean (who = person id); appearance /
   * outfit = text or null (who = "you" or a person id); item = the new count (who = item id); money = the new
   * amount; goal = "done" | "failed" | "open" | "drop" (who = goal id). The engine's `manualFix` builds the events.
   */
  | { type: "fix"; chatId: string; field: FixField; who?: string; value: string | number | boolean | null }
  /** The contest panel's buttons: try to get away (a check), or give in (an immediate loss). */
  | { type: "contest"; chatId: string; op: "break_off" | "give_in" }
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
  | { type: "set_jev_key"; key: string }
  | { type: "test_decider" };
