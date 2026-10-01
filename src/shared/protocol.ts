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
  } | null;
  codex: { id: string; title: string; text: string; category: string | null }[];
  codexTotal: number;
  feats: { id: string; name: string; desc: string; unlocked: boolean }[];
  perks: { id: string; name: string; desc: string; cost: number; owned: boolean; blocker: string | null }[];
  perkPoints: number | null;
  /** What has surfaced in the world (newest first). */
  news: { text: string; when: string | null }[];
  /** Body parts and their traits, when the ruleset has a body. */
  body: { part: string; label: string; text: string; covered: boolean }[] | null;
  /** Transformations under way. */
  transforms: { label: string; stage: number; of: number }[];
  /** Bills and debts. */
  dues: { label: string; owed: number; text: string; tone: Tone }[];
  /** A pregnancy (once it's known) and children. */
  family: { name: string; text: string }[];
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
  nodes: { id: string; name: string; x: number; y: number; here: boolean; reachable: boolean; indoors: boolean; people: string[] }[];
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

export interface FighterView {
  id: string;
  name: string;
  side: "party" | "foe";
  sprite: string;
  hp: number; mhp: number; mp: number; mmp: number; tp: number;
  alive: boolean;
  /** Waiting for a command. */
  active: boolean;
  guard: boolean;
  elite?: boolean;
  boss?: boolean;
}

export interface DungeonView {
  id: string;
  name: string;
  theme: string;
  depth: number;
  /** Deepest floor (0 = endless). */
  floors: number;
  size: number;
  /** This floor has a guardian on the way down. */
  boss: boolean;
  tiles: { x: number; y: number; kind: string | null; state: "hidden" | "seen" | "here"; cleared: boolean; reachable: boolean }[];
  here: {
    kind: string;
    canDescend: boolean;
    bottom: boolean;
    shop: { id: string; name: string; price: number; sprite: string; desc: string; affordable: boolean }[] | null;
  };
  event: { text: string; romance: boolean; choices: { id: string; label: string; ok: boolean; chance: number | null; cost: number | null }[] } | null;
  battle: {
    kind: string;
    round: number;
    active: string | null;
    fighters: FighterView[];
    skills: { id: string; name: string; cost: string; target: string; usable: boolean }[];
    log: string[];
    canEscape: boolean;
    over: string | null;
  } | null;
  party: FighterView[];
  level: number;
  xp: number;
  xpNext: number;
  gold: number;
  bag: { id: string; name: string; count: number; sprite: string }[];
  loot: { name: string; count: number }[];
  /** Newest first. */
  log: string[];
}

export interface DungeonEntryView {
  id: string;
  name: string;
  desc: string | null;
  theme: string;
  deepest: number;
  floors: number;
  max: number;
  companions: { id: string; name: string; present: boolean; cls: string }[];
}

export interface DatePersonView {
  id: string;
  name: string;
  /** Here now (or always around). */
  here: boolean;
  stage: string;
  stageIndex: number;
  hostile: boolean;
  partner: boolean;
  /** 0–1 of each stat's range. */
  love: number;
  fear: number;
  loveText: string | null;
  fearText: string | null;
  dates: number;
  /** Topic labels by how they reacted, as far as the player has seen. */
  loves: string[];
  likes: string[];
  dislikes: string[];
  romance: boolean;
}

export interface DateTopicView {
  id: string;
  label: string;
  desc: string | null;
  /** How they reacted last time (a reaction id), if the player has seen it. */
  known: string | null;
  knownLabel: string | null;
  used: number;
  /** Why it can't be raised now. */
  lock: string | null;
  odds: number | null;
}

export interface DateView {
  session: {
    who: string;
    name: string;
    kind: "talk" | "plan" | "outing";
    venue: string | null;
    beat: number;
    beats: number;
    fatigue: number;
    mood: number;
    moodLabel: string;
    moodFace: string;
    combo: number;
    enjoy: number;
    closing: boolean;
    last: { label: string; reaction: string; text: string } | null;
  } | null;
  /** The person in the session. */
  person: DatePersonView | null;
  people: DatePersonView[];
  categories: { id: string; label: string; icon: string; topics: DateTopicView[] }[];
  /** Non-topic moves (asking out, venues, activities, gifts, goodbye). */
  moves: { id: string; label: string; desc: string | null; odds: number | null; kind: string; group: string }[];
  /** The relationship ladder, lowest first (stranger … partner). */
  stages: string[];
}

export type DungeonOp =
  | { op: "enter"; id: string; companions: string[] }
  | { op: "move"; x: number; y: number }
  | { op: "choose"; choice: string }
  | { op: "battle"; skill?: string; item?: "potion" | "ether" | "bomb"; target?: string; escape?: boolean; auto?: "turn" | "round" | "battle" }
  | { op: "descend" }
  | { op: "leave" }
  | { op: "use"; item: string; target: string }
  | { op: "buy"; item: string };

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
  /** The character's mind overruled the player (freeze, compulsion…). */
  mind: { cause: string; kind: "fail" | "alter" | "redirect"; meant: string; chance: number } | null;
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
  /** Guess: one character, or a scenario/narrator card (whose name isn't a person). */
  cardKind: "character" | "scenario";
  /** Content tags used by this ruleset's actions, for the Lines & Veils picker. */
  tags: string[];
  /** The depth audit: what in the ruleset doesn't connect to anything yet. */
  depth?: { score: number; gaps: { id: string; severity: "gap" | "thin"; part: string; text: string; fix: string }[]; drafted: string[] };
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
  /** Drafts per reply (1 = off): extras are written and the decision model keeps the best. */
  drafts: number;
  /** Pre-write replies for this many of the first choices, so clicking them is instant (0 = off). */
  prewrite: number;
  /** Who writes the stage's snippets (dates, dungeon moments): the helper model, or scripted lines. */
  sceneLines: "model" | "scripted";
  /** Items that do nothing get a use drafted from their description (saved as an editable lorebook entry). */
  draftItemUses: boolean;
  /** Generate a picture for each date (the place, with them in the middle). */
  dateImages: boolean;
  /** Image connection for date pictures; empty = the user's default. */
  imageConnectionId: string;
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
  drafts: 1,
  prewrite: 0,
  sceneLines: "model",
  draftItemUses: true,
  dateImages: true,
  imageConnectionId: "",
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
  characterId: string;
  characterName: string;
  /** build = from the card; refine = change by request; deepen = close the depth audit's gaps in the installed rules. */
  mode: "build" | "refine" | "deepen";
  step: "start" | "questions" | "review" | "done";
  /** quick: plan, draft, repair, one pass on the audit. thorough: the designer works with tools until the audit is clean. */
  effort?: "quick" | "thorough";
  /** The design plan written before any YAML: the loop, the pressures, how the systems connect. */
  plan?: string | null;
  /** What the designer did, step by step (shown live). */
  log?: string[];
  /** Audit gaps left as they are on purpose, with the reason. */
  waived?: Record<string, string>;
  /** Depth before and after this session's work. */
  depth?: { before: number; after: number; open: number } | null;
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
    warnings: { id: string; part: string; text: string }[];
  } | null;
  /** Refine: what was asked and what the model says it changed. */
  request: string | null;
  changeSummary: string | null;
  /** Something is running (label shown with a spinner). */
  busy: string | null;
  error: string | null;
  updatedAt: number;
}

/** One line of a stage snippet: someone speaking, or narration (speaker null). */
export interface SceneLine { speaker: string | null; text: string }

export interface SceneView {
  kind: "date" | "dungeon";
  /** Bumps with every new snippet, so the stage starts it from its first line. */
  seq: number;
  lines: SceneLine[];
  /** What the player just did or said, shown above the snippet. */
  said: string | null;
  /** The date's picture (the place, with them in the middle), once it's ready. */
  image: string | null;
  imageBusy: boolean;
  /** A snippet is being written. */
  writing: boolean;
}

export type BackendToFrontend =
  | {
      type: "state";
      chatId: string | null;
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
      dungeon: DungeonView | null;
      dungeonEntries: DungeonEntryView[];
      /** Dating: people, and the conversation or date in progress (null when the ruleset has no dating). */
      date: DateView | null;
      /** A date or dungeon run on the stage: its latest snippet of lines, and the date's picture. */
      scene: SceneView | null;
      /** Quiet encounter logs among the recent messages, for their round cards. */
      encounterLogs?: EncounterLogView[];
    }
  | { type: "busy"; chatId: string; busy: boolean; label?: string }
  | { type: "settings"; settings: Settings; templates: TemplateInfo[]; connections: { id: string; name: string }[]; imageConnections: { id: string; name: string }[]; jevKeySet: boolean }
  | { type: "toast"; level: "info" | "success" | "warning" | "error"; message: string }
  | { type: "command"; command: "open" | "install" | "dungeon" }
  | { type: "builder"; session: BuilderSession | null };

export type FrontendToBackend =
  | { type: "hello"; chatId: string | null }
  | { type: "refresh"; chatId: string | null }
  | { type: "act"; chatId: string; actionId: string; params?: Record<string, string> }
  /** A line typed on the stage: said on the date or in the dungeon (off the chat), or posted to the chat otherwise. */
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
  | { type: "adjust_rel"; chatId: string; who: string; stat: string; value: number }
  | { type: "forget"; chatId: string; who: string }
  | { type: "builder_open"; chatId: string; mode: "build" | "refine" | "deepen" }
  | { type: "builder_start"; chatId: string; connectionId: string; creative: boolean; base?: string; effort?: "quick" | "thorough" }
  /** Run the designer over the current draft (or the installed rules) until the audit is clean. */
  | { type: "builder_deepen"; chatId: string; connectionId?: string; effort?: "quick" | "thorough" }
  /** Draft uses for items that do nothing, from their descriptions, into a "warp-ruleset · item uses" entry. */
  | { type: "draft_item_uses"; chatId: string }
  | { type: "builder_answer"; chatId: string; answers: Record<string, BuilderAnswer>; additions: BuilderAddition[]; more: boolean }
  | { type: "builder_redo"; chatId: string; part: string; note?: string }
  | { type: "builder_fix"; chatId: string; warning: string }
  | { type: "builder_refine"; chatId: string; request: string }
  | { type: "builder_install"; chatId: string }
  | { type: "builder_back"; chatId: string }
  | { type: "builder_close"; chatId: string }
  | ({ type: "dungeon"; chatId: string } & DungeonOp)
  | { type: "run"; chatId: string; op: "save" | "load" | "restart" | "continue"; slot?: string }
  | { type: "set_jev_key"; key: string }
  | { type: "test_decider" };
