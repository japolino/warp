// Ruleset: the declarative "game" attached to a card.
//
// Authors write loose YAML; `normalizeRuleset` turns it into this strict shape,
// fills defaults, and collects friendly issues instead of throwing. A broken
// section is skipped with a warning so the rest of the ruleset keeps working.

import { AID_KINDS, GAMBLE_GAMES, GAME_IDS, gameAlias, type AidKind, type GambleGame, type GameId } from "./game-ids.js";
import { compile, ExprError } from "./expr.js";
import { parseDice, DiceError } from "./dice.js";
import { normDungeons } from "./dungeon/defs.js";
import type { DungeonDef } from "./dungeon/types.js";
import { normDating } from "./date/defs.js";
import type { DatingDef } from "./date/types.js";

export type Tone = "good" | "warn" | "bad" | "neutral";
export type StatKind = "meter" | "attribute" | "skill" | "money" | "hidden";
export type ShowMode = "text" | "number" | "both" | "hidden";
export type Tier = "crit_success" | "success" | "partial" | "fail" | "crit_fail";
export const TIERS: Tier[] = ["crit_success", "success", "partial", "fail", "crit_fail"];

export interface Band { at: number; text: string; tone: Tone }

/**
 * Limits on what the story may change after a reply, on top of the per-reply cap:
 * only while a formula holds, only when the exchange mentions certain words, or
 * only after certain actions (ids or tags).
 */
export interface NarratorGate { when?: string; words?: string[]; actions?: string[] }

export interface StatDef {
  id: string;
  label: string;
  kind: StatKind;
  min: number;
  max: number;
  /** Expression allowed so caps can scale, e.g. "level * 5". Evaluated at clamp time. */
  maxExpr?: string;
  start: number;
  /** Which end is desirable. Drives default band tones and bar colours. */
  good: "high" | "low" | "none";
  perHour: number;
  show: ShowMode;
  /** Max absolute change the narrator may make per turn. 0 = engine only. */
  narrator: number;
  gate?: NarratorGate;
  /** How fast it improves with use (skills and attributes; 0 = never). */
  growth: number;
  bands: Band[];
  /** Bands given in percent of the stat's (current) maximum: `75%: Hale` — for stats whose max grows. */
  pctBands?: boolean;
  grades?: string[];
  color?: string;
  desc?: string;
}

export interface Effect {
  stats: Record<string, string | number>;
  set: Record<string, string | number>;
  flags: Record<string, string | number | boolean | null>;
  items: Record<string, number>;
  rel: Record<string, Record<string, string | number>>;
  move?: string;
  time?: number;
  addConditions: Record<string, number | null>;
  removeConditions: string[];
  hint?: string;
  /** Uncertain reactions: a decision model supplies odds, the engine rolls. */
  decide: DecideSpec[];
  /** Change the current encounter's foe stats. */
  foe: Record<string, string | number>;
  /** End the current encounter with this outcome id. */
  end?: string;
  /** Begin an encounter by id. */
  startEncounter?: string;
  /** Unlock codex entries. */
  unlock: string[];
  /** Put on items (slot is taken from the item) — `wear: [raincoat]`. */
  wear: string[];
  /** Take off whatever is worn in these slots. */
  undress: string[];
  /** Damage worn clothing by slot: `damage: { top: 30 }` (integrity points). */
  damage: Record<string, string | number>;
  /** Move hidden world clocks: `front: { gangs: -20 }`. */
  front: Record<string, string | number>;
  /** Open the next stage of these secrets, whatever their conditions say. */
  reveal: string[];
  /** Push the random-event gauge up (+) or back (−). */
  gauge?: string | number;
  /** Swing the encounter's momentum toward the player (+) or the foe (−). */
  momentum?: string | number;
  /** Set body traits: `body: { hair: { color: red } }` (null removes a trait). */
  body: Record<string, Record<string, string | null>>;
  /** Advance transformations by this many stages: `transform: { fox_charm: 1 }`. */
  transform: Record<string, string | number>;
  /** Move companions' arcs: `arc: { jo: +5 }`. */
  arc: Record<string, string | number>;
  /** Change how people feel about each other: `bond: { jo: { dex: +3 } }`. */
  bond: Record<string, Record<string, string | number>>;
  /** A chance of pregnancy between two adults: `conceive: { with: target, chance: 20 }`. */
  conceive?: { with: string; carrier: string; chance: string | number };
  /** Wear down the current encounter's main meter (HP, resolve, composure…) by this much — portable across encounters. */
  harm?: string | number;
  /** Teach abilities: `learn: [haste]`. */
  learn: string[];
  /** Put conditions on the opponent (in an encounter) or the person an action is aimed at: `inflict: { poisoned: 3 }`. */
  inflict: Record<string, InflictSpec>;
  /** Put conditions on named people (outside encounters): `inflict: { mia: { sick: 1440 } }` (minutes; null = until cured). */
  afflict: Record<string, Record<string, number | null>>;
  /** Take conditions off the opponent (or the target): `cleanse: [poisoned]`. */
  cleanse: string[];
  /** Damage to the opponent lands this many times, each hit reduced by its armor: `hits: 3`, `hits: "roll('1d3')"`. */
  hits?: string | number;
  /** Ignore this much of the opponent's armor (999 = all of it). */
  pierce?: string | number;
  /** Quests: start, finish, fail, drop or hand in — `quest: { wolves: start }`. */
  quest: Record<string, QuestOp>;
  /** Count toward a quest goal: `progress: { wolves: +1 }` (its first counted goal) or `progress: { "wolves.pelts": +1 }`. */
  progress: Record<string, string | number>;
  /** Something a person will remember about {{user}}: `remember: { mia: "{{user}} burned her breakfast" }`. */
  remember: Record<string, string>;
}

export type QuestOp = "start" | "done" | "fail" | "drop" | "report";
/** A condition put on someone else: rounds in an encounter (minutes outside one), and an optional chance to land. */
export interface InflictSpec { rounds?: string | number; chance?: string | number }

export interface DecideOption { id: string; desc: string; weight: number; effect: Effect }
export interface DecideSpec { id: string; ask: string; options: DecideOption[] }

export type CheckStyle = "chance" | "vs" | "pbta";

export interface CheckDef {
  style: CheckStyle;
  dice: string;
  /** chance: target percentage (roll-under). vs: difficulty to meet or beat. */
  target?: string | number;
  /** Modifier added to the roll (vs / pbta). */
  add?: string | number;
  /** vs only: missing by this much or less counts as a partial success. */
  partialMargin: number;
  label?: string;
  crits: boolean;
  /** Minigames this check can be played as instead of rolled (the first is offered); false = always dice. */
  game?: GameId[] | false;
}

/** A table that takes real money: `gamble: { game: blackjack, stakes: [10, 50, 200] }`. */
export interface GambleDef {
  game: GambleGame;
  /** Buy-ins to choose from. */
  stakes: number[];
  /** Hands, spins or pulls per sitting. */
  rounds: number;
  /** The stat staked (default: the HUD's money). */
  stat?: string;
  /** House edge (0.05 = 5%); default per game. */
  edge?: number;
  /** A formula in points of edge shaved off for {{user}} (`luck / 10`). */
  luck?: string | number;
  /** Applied after a winning, losing or ruinous sitting. */
  win: Effect;
  lose: Effect;
  broke: Effect;
}

export interface ParamDef {
  id: string;
  label: string;
  options: Record<string, number>;
  default: string;
}

export interface ActionDef {
  id: string;
  label: string;
  say?: string;
  desc?: string;
  group?: string;
  at: string[];
  when?: string;
  hidden: boolean;
  /** Shown on the locked choice when `when` doesn't hold ("Needs a lighter"). */
  whyNot?: string;
  time?: number;
  cost: Effect;
  check?: CheckDef;
  outcomes: Partial<Record<Tier, Effect>>;
  /** Applied when there is no check. */
  effects: Effect;
  params: ParamDef[];
  tags: string[];
  order: number;
  /** One choice per person present ("Talk to X"); `target` is that person in formulas and `rel: { target: … }`. */
  perPerson: boolean;
  /** Readable requirements (already folded into `when`): each says what's missing on the locked choice. */
  requires: Requirement[];
  /** A gambling table: the stake and the game decide the money, not a check. */
  gamble?: GambleDef;
  /** Show it locked, with what's missing, when the requirements aren't met (default when it has `requires:`). */
  showLocked: boolean;
}

/** One requirement of an action, kept readable so a locked choice can say exactly what's missing. */
export interface Requirement {
  /** A formula that holds when it's met. */
  when: string;
  kind: "stat" | "with" | "has" | "rel" | "quest" | "flag" | "perk" | "formula";
  /** The stat, person, item, quest, flag or perk it's about. */
  id?: string;
  /** The relationship stat (rel). */
  stat?: string;
  /** How much is needed (stat, rel, has), or the quest state / flag value wanted. */
  n?: number;
  state?: string;
  /** Words for a formula requirement. */
  text?: string;
}

export interface TriggerDef {
  id: string;
  when?: string;
  /** Plain-language condition judged by the decision model each turn, e.g. "{{user}} is in danger". */
  whenScene?: string;
  repeat: boolean;
  effects: Effect;
}

export interface LocationDef {
  id: string; name: string; desc?: string; exits: string[]; travel: number;
  /** Indoors: temperature is the indoor temperature and weather doesn't touch you. */
  indoors: boolean;
  /** Optional map position (any units; the map scales to fit). */
  pos?: [number, number];
  /** Has a quest board: quests with `board: true` are posted here. */
  board: boolean;
}
export interface ItemDef {
  id: string; name: string; desc?: string; tags: string[];
  /** Clothing: the slot it's worn in. */
  slot?: string;
  warmth: number;
  /** Max integrity (clothing); it's destroyed at 0. */
  integrity: number;
  /** How revealing it is (adds to `reveal`). */
  reveal: number;
  /** Clothing traits, e.g. rainproof, swimwear. */
  traits: string[];
  /** Uses per item (a spray with 5 sprays); each use spends one, and at 0 the item is gone. 0 = not used up by use. */
  uses: number;
  /** What using it does: an action like any other (`item:<id>`), offered while it's held. */
  use?: ActionDef;
  /** A tool that isn't spent by using it (keys, a phone). */
  keep: boolean;
  /** Gear: added to every check that reads these stats, while it's carried (or worn, for clothing). */
  bonus: Record<string, number>;
  /** Armor: blows that would hurt these stats in an encounter are this much smaller ("_" = whatever the encounter beats you on). */
  armor: Record<string, number>;
  /** Its use or bonus was drafted by Warp from the description (shown so the author can check it). */
  drafted?: boolean;
}
export interface ConditionDef {
  id: string; label: string; tone: Tone; desc?: string; narrator: boolean; gate?: NarratorGate;
  /** While it lasts: counts as this much more (or less) of each stat in checks — a buff or a debuff. */
  bonus: Record<string, number>;
  /** How long it lasts when nothing says: encounter rounds (in a fight) and minutes (outside one). Rounds-only statuses end with the fight. */
  rounds?: number;
  lasts?: number;
  /** Damage (negative heals) each round, turn or hour to `stat` — the player's, or the opponent's when it's on them (default: what the fight is won or lost on). */
  dot?: string | number;
  stat?: string;
  every: "round" | "turn" | "hour";
  /** Chance (0–100) that whoever has it loses their turn — stunned, frozen, asleep. */
  skip?: string | number;
  /** Armor while it lasts (negative = sundered): "_" = the main meter, or by stat. */
  armor: Record<string, number>;
  /** Anything else that happens to the player each round, turn or hour while it lasts. */
  tick: Effect;
}
export interface ScheduleEntry { when?: string; at: string }
export interface PersonDef {
  id: string; name: string; age?: number; start: Record<string, number>; desc?: string;
  /** First entry whose `when` holds decides where they are; an entry without `when` is the default. */
  schedule: ScheduleEntry[];
  traits: string[];
}
export interface FlagDef { id: string; label?: string; narrator: boolean; start: string | number | boolean | null; gate?: NarratorGate }

export interface WeatherKind { id: string; label: string; icon: string; weight: number; temp: number; seasons: string[] | null; tags: string[] }
export interface WeatherDef {
  enabled: boolean;
  kinds: WeatherKind[];
  /** Base outdoor °C per season. */
  seasonTemps: Record<string, number>;
  /** Month numbers (1–12) per season. */
  seasons: Record<string, number[]>;
  /** Daily swing: warmest mid-afternoon, coldest before dawn. */
  swing: number;
  /** Weather re-rolls every this many hours. */
  changeHours: number;
  indoorTemp: number;
}

export interface WardrobeDef {
  enabled: boolean;
  slots: { id: string; label: string }[];
  /** Slots that count toward being exposed when empty. */
  cover: string[];
  startWorn: string[];
  /** The narrator may undress/redress the player. */
  narrator: boolean;
}

export interface FoeStatDef { id: string; label: string; start: number; max: number; good: "high" | "low" | "none" }

/**
 * A quest objective: a formula that holds when it's done, or a count to reach — through `progress:`
 * effects, or `on:` (each time an encounter ends well, or an action succeeds, while the quest is on).
 */
export interface QuestGoal {
  id: string; text: string; when?: string; count?: number; optional: boolean;
  on?: { kind: "encounter" | "action"; id: string; outcomes: string[] };
}
export interface QuestDef {
  id: string;
  name: string;
  desc?: string;
  /** What sort it is, in a word: bounty, errand, favour, contract, case, main… (shown as a tag). */
  kind: string;
  /** Who gives it (a person id): offered while they're with {{user}}, and the one who remembers how it went. */
  giver?: string;
  /** Posted on quest boards (locations with `board: true`). */
  board: boolean;
  /** Where else it can be taken. */
  at: string[];
  /** Offered (or, with auto, started) while this holds. */
  when?: string;
  /** Starts by itself as soon as `when` holds (a summons, a story beat) instead of being offered. */
  auto: boolean;
  goals: QuestGoal[];
  /** Done when this holds (default: every non-optional goal done). */
  succeed?: string;
  /** Failed when this holds. */
  fail?: string;
  /** Judged in plain language by the decision model after each reply. */
  judge: { done?: string; fail?: string };
  /** Time limit once taken, in days (0 = none). */
  days: number;
  /** Hand it in to the giver (or at a board) to get the reward. */
  report: boolean;
  start: Effect;
  reward: Effect;
  failure: Effect;
  /** What the giver remembers (false = nothing). Defaults to a line about how it went. */
  remember: { done?: string; failed?: string } | false;
  /** Can be taken again once it's over, after this many days (null = once). */
  repeat: number | null;
  /** Kept out of the log and the boards until something starts it. */
  hidden: boolean;
  /** What's at stake if it fails, in a line (for the log and the narrator). */
  stakes?: string;
  order: number;
}
export interface EncounterDef {
  id: string;
  name: string;
  desc?: string;
  tags: string[];
  /** armor: blows that would wear down these foe stats are this much smaller ("_" = the main meter). */
  foe: { name: string; stats: FoeStatDef[]; armor: Record<string, number> };
  /** Player moves while the encounter is on (replace normal choices). */
  actions: Record<string, ActionDef>;
  actionOrder: string[];
  /** The foe's turn: weighted (or model-weighed) choice among moves. */
  foeMoves: DecideSpec | null;
  /** outcome id → formula; first that holds ends the encounter. */
  endWhen: { outcome: string; when: string }[];
  /** Every encounter has a visible finite budget; normal wins take precedence. */
  roundLimit: number;
  timeoutOutcome: string;
  outcomes: Record<string, Effect>;
  start: Effect;
  /**
   * A fight that swings: each check moves a momentum gauge (−100 … +100), the
   * foe's moves push back, and only a full swing ends it. Rounds reach the
   * narrator as ordered beats.
   */
  momentum: { win: string; lose: string; start: number; swing: Record<Tier, number> } | null;
  /** The story can start it (a fight breaks out in the prose). */
  fromStory: boolean;
  /**
   * Each round goes to the narrator as a full reply (the old way). Off by default:
   * rounds are written briefly into one encounter message that grows, and summed up at the end.
   */
  narrate: boolean;
  /** What the player is trying to do, in their words ("Bring their fervor to 0"). Derived from `end_when` when absent. */
  goal?: string;
  /** What to watch out for ("Stress 80 and you're overwhelmed"). Derived from `end_when` when absent. */
  danger?: string;
  /** How each ending reads ("won" → "You talked them down"). */
  labels: Record<string, string>;
}

export interface CodexEntry { id: string; title: string; text: string; category?: string; unlock?: string; lore: string[] }
export interface FeatDef { id: string; name: string; desc: string; unlock: string; reward: Effect; hidden: boolean }
/** A bonus that only applies while a formula holds: `edge: { stats: { stealth: 15 }, when: "at('plaza')" }`. */
export interface Edge { stats: Record<string, number>; when?: string }

/** What a perk does to the rules themselves. */
export type PerkRule =
  /** reroll: a failed check (on these stats or tags) is rolled again; soften: a failure becomes a partial. `perDay` 0 = always. */
  | { kind: "reroll" | "soften"; stats: string[]; tags: string[]; perDay: number }
  /** gains / losses: rises (or drops) in a stat are this much bigger or smaller (−0.3 = 30% smaller). */
  | { kind: "gains" | "losses"; stat: string; pct: number }
  /** pierce: blows from these moves (stats or tags; none = every move) ignore this much of the opponent's armor. */
  | { kind: "pierce"; amount: number; stats: string[]; tags: string[] }
  /** game: aids in minigames (these games; none = every game), e.g. +1 life, +20% timing window. */
  | { kind: "game"; games: GameId[]; aids: Partial<Record<AidKind, number>> };

export interface PerkDef {
  id: string; name: string; desc: string; cost: number; requires?: string;
  /** Applied once, when the perk is taken. */
  effects: Effect;
  tags: string[];
  /** Always on, like gear: counts as this much more of each stat in checks. */
  bonus: Record<string, number>;
  edges: Edge[];
  rules: PerkRule[];
  /** Abilities this perk teaches. */
  abilities: string[];
  /** What the narrator should know about someone who has it. */
  narrator?: string;
  /** Perks you can't also have (either way round). */
  excludes: string[];
  /** How often it turns up in an offer, relative to the others. */
  weight: number;
  /** The downside, in words (its mechanics are in bonus / gains / losses). */
  drawback?: string;
}

/**
 * Something the player can do that's theirs, not the place's: a spell, a
 * technique, a trick. Offered in encounters and the story alike, limited by
 * cost and uses, scaling with whatever stats its formulas read.
 */
export interface AbilityDef {
  id: string;
  name: string;
  desc?: string;
  /** The move itself (id "ability:<id>"). */
  action: ActionDef;
  /** Known from the start (true), only once taught (false: by a perk or `learn:`), or while a formula holds. */
  known: boolean | string;
  /** Uses per in-game day and per encounter (0 = no limit). */
  perDay: number;
  perEncounter: number;
  where: "any" | "encounter" | "story";
}

/**
 * A secret is a ladder of stages. Only opened stages ever reach the narrator's
 * prompt — what isn't in the prompt can't leak. Stage 0 is often a cue with no
 * reason ("flinches at the crest"), so the narrator can play someone hiding
 * something without knowing what.
 */
export interface SecretStage { when?: string; text: string; lore: string[] }
export interface SecretDef {
  id: string;
  /** Who or what it's about ("Professor Ward"). */
  about: string;
  /** exists = the narrator is told there's more it doesn't know, so it deflects instead of inventing. */
  tell: "none" | "exists";
  stages: SecretStage[];
}

/** A hidden world clock. It fills with in-game time; each stage it crosses surfaces in the story. */
export interface FrontStage {
  at: number;
  /** Clock value from which the hint shows (default: halfway from the previous stage). */
  hintAt: number;
  /** A sign shown to the narrator without a reason, until this stage surfaces. */
  hint?: string;
  /** What happened off-screen; kept from the narrator until this stage surfaces. */
  backstage?: string;
  /** The event that breaks the surface (narrated once). */
  surface?: string;
  /** Journal line (defaults to the surface text). */
  news?: string;
  effects: Effect;
}
export interface FrontDef {
  id: string;
  label: string;
  /** Clock points per in-game day (formula). */
  rate: string | number;
  /** Clock points per turn (formula). */
  perTurn: string | number;
  max: number;
  start: number;
  /** The clock only runs while this holds. */
  when?: string;
  stages: FrontStage[];
  /** Plain-language story beats the decision model watches for; each moves the clock. */
  pushes: { scene: string; add: number }[];
}

export interface RandomEventDef {
  id: string;
  label: string;
  when?: string;
  weight: number;
  /** In-game days (turns without a clock) before it can happen again. */
  cooldownDays: number;
  /** A sign shown to the narrator before it happens. */
  omen?: string;
  /** Direction for the narrator when it happens. */
  text: string;
  news?: string;
  effects: Effect;
}
/** Random events come from a hidden gauge that fills with in-game time — not a roll per reply. */
export interface RandomEventsDef {
  enabled: boolean;
  perDay: string | number;
  perTurn: string | number;
  /** ±fraction of randomness on each fill. */
  jitter: number;
  /** Days of quiet after an event. */
  restDays: number;
  /** Gauge level (0–100) at which the next event is picked and its omen shows. 0 = no omens. */
  omenAt: number;
  events: Record<string, RandomEventDef>;
}

/**
 * Choices written for the moment. A model writes each label, but it must pick a
 * tag from this fixed list — the tag, not the model, decides the check and effects.
 */
export interface LiveChoicesDef {
  enabled: boolean;
  label: string;
  count: number;
  when?: string;
  guide?: string;
  tags: Record<string, ActionDef>;
}

/**
 * The player character's mind can overrule the player: at low control a typed or
 * clicked action may freeze, turn into something else, or be coloured by a cause.
 */
export interface MindOverride {
  id: string;
  when: string;
  /** Percent chance per action it applies to (formula). */
  chance: string | number;
  /** Action ids or tags it applies to; empty = any action with a check. */
  on: string[];
  /** fail = it fails without a roll; alter = it goes ahead, coloured by the cause; or an action id done instead. */
  do: string;
  cause: string;
  text?: string;
}
export interface MindDef {
  overrides: MindOverride[];
  /** How the narrator should describe things to the player character while a condition holds. */
  perception: { when: string; text: string }[];
}

/** What survives rewinding to a save (or starting over after an ending). Everything else rewinds. */
export interface KeepSpec {
  codex: boolean; feats: boolean; perks: boolean; secrets: boolean; people: boolean; dating: boolean; deepest: boolean;
  stats: string[]; flags: string[]; items: string[];
  /** Relationship stats kept for everyone. */
  rel: string[];
}

export interface CheckpointsDef {
  enabled: boolean;
  /** Manual save slots. */
  slots: number;
  keep: KeepSpec;
  /** Save automatically at the start of each in-game day (slot "auto"). */
  auto: boolean;
  /** A time loop: when this holds, the story rewinds to a save by itself. */
  loop: { when: string; to: string; text: string; effects: Effect } | null;
  /** Hard mode: an ending is final — load or start over, never "keep playing". */
  hard: boolean;
}

export interface EndingDef { id: string; title: string; kind: "good" | "bad" | "neutral"; when: string; text: string }

/** A transformation in stages; each step advances one stage with `chance` percent. */
export interface TransformDef {
  id: string;
  label: string;
  chance: string | number;
  stages: { set: Record<string, Record<string, string | null>>; text?: string }[];
}

/** The player character's body: parts with free-form traits, what covers them, and transformations. */
export interface BodyDef {
  enabled: boolean;
  /** The story may change the body after a reply. */
  narrator: boolean;
  /** The story may add parts the ruleset didn't list (horns, wings…). */
  open: boolean;
  parts: Record<string, Record<string, string>>;
  /** Clothing slots that cover a part; it's visible when any of them is empty. */
  hiddenBy: Record<string, string[]>;
  transforms: Record<string, TransformDef>;
}

/** A companion with a life of their own: a goal, an arc they push by their own choices, feelings toward others. */
export interface CompanionDef {
  id: string;
  goal?: string;
  /** Their arc: a hidden clock (same shape as a front), registered as fronts[`arc_<id>`]. */
  arc: string | null;
  /** A choice they make on their own each in-game day; the decision model weighs it. */
  daily: DecideSpec | null;
  /** People they're jealous of ("anyone" = everyone else). */
  jealousOf: string[];
  /** Secrets only they know. */
  knows: string[];
}

/**
 * Pregnancy and children. Children are kept apart from everything the player can
 * act on (they're family, not people in the scene) until they come of age.
 */
export interface LineageDef {
  enabled: boolean;
  /** In-game weeks from conception to birth. */
  weeks: number;
  stages: { week: number; text: string; effects: Effect }[];
  /** Children age this many times faster than the calendar. */
  speed: number;
  /** Age at which a child joins the cast as an adult (never below 18). */
  joinAt: number;
  /** Body parts children inherit from the player. */
  inherit: string[];
  names: string[];
}

/** Something owed on a schedule. Missing it lets the creditor decide what lateness costs. */
export interface ObligationDef {
  id: string;
  label: string;
  amount: string | number;
  /** Days between payments; 0 = once. */
  every: number;
  /** Days from the start until the first payment is due. */
  first: number;
  payWith: string;
  creditor?: string;
  /** Days late before the creditor acts. */
  grace: number;
  /** Where it can be paid (empty = anywhere). */
  at: string[];
  late: DecideSpec | null;
}

/** A shift: a string of customers, each wanting something; your approach (or your words) is scored against it. */
export interface JobDef {
  id: string;
  label: string;
  at: string[];
  when?: string;
  customers: number;
  pay: string | number;
  tip: string | number;
  /** A stat that helps (its 0–100% of range adds to every customer's mood). */
  skill?: string;
  gain: Effect;
  minutes: number;
  patrons: { who: string; want: string }[];
  styles: Record<string, string>;
}

/** Being seen: when this holds, everyone present reacts to how {{user}} looks, individually. */
export interface ObserversDef {
  enabled: boolean;
  when: string;
  /** Anonymous passers-by sampled when outdoors. */
  crowd: number;
  /** Effects per reaction, on the observer (`target`). */
  reactions: Partial<Record<SeenReaction, Effect>>;
  /** Witnesses tell the people they're close to, once a day. */
  rumours: boolean;
}
export type SeenReaction = "unnoticed" | "glance" | "interested" | "disapproving" | "predatory";
export const SEEN_REACTIONS: SeenReaction[] = ["unnoticed", "glance", "interested", "disapproving", "predatory"];

/** Exploring can turn up places the ruleset never had; they're written into the ruleset for good. */
export interface DiscoveryDef {
  enabled: boolean;
  /** Where exploring can find somewhere new (empty = any place). */
  at: string[];
  /** Percent chance per exploration (formula); each fruitless try adds 10. */
  chance: string | number;
  /** Places that can be discovered in total. */
  max: number;
  time: number;
  label: string;
  /** Guidance for the writer inventing places ("small, grounded places…"). */
  guide?: string;
}

export type Difficulty = "easy" | "fair" | "hard" | "extreme";
export const DIFFICULTIES: Difficulty[] = ["easy", "fair", "hard", "extreme"];

/**
 * Typed attempts that match no listed action still roll: d20 plus the stat's
 * share of `bonus`, against a difficulty class the decision model picks.
 */
export interface ImproviseDef {
  enabled: boolean;
  dc: Record<Difficulty, number>;
  /** What a maxed-out stat adds to the d20. */
  bonus: number;
  /** Missing by this much or less is a partial success. */
  partial: number;
  /** Stats an attempt can lean on (default: every skill and attribute). */
  stats: string[];
  /** Minutes an attempt takes (default: the clock's minutes_per_action). */
  time?: number;
  outcomes: Partial<Record<Tier, Effect>>;
}

/** Skills and attributes improve with use: every check, and practice the story describes, adds progress. */
export interface GrowthDef {
  enabled: boolean;
  /** Overall speed (2 = twice as fast). */
  rate: number;
  /** Attributes improve at this fraction of the skill rate. */
  attributes: number;
  /** Training, studying and practising the story describes counts too. */
  train: boolean;
}

export interface Ruleset {
  name: string;
  description?: string;
  player: { name?: string; age?: number };
  stats: Record<string, StatDef>;
  statOrder: string[];
  relStats: Record<string, StatDef>;
  relStatOrder: string[];
  people: Record<string, PersonDef>;
  /** Narrator may introduce new people. */
  peopleOpen: boolean;
  items: Record<string, ItemDef>;
  /** Narrator may grant/remove items (declared or not). */
  itemsOpen: boolean;
  startItems: Record<string, number>;
  locations: Record<string, LocationDef>;
  /** Narrator may move the player, including to undeclared places. */
  locationsOpen: boolean;
  startLocation: string | null;
  conditions: Record<string, ConditionDef>;
  flags: Record<string, FlagDef>;
  actions: Record<string, ActionDef>;
  actionOrder: string[];
  triggers: TriggerDef[];
  clock: {
    enabled: boolean;
    start: number;
    minutesPerAction: number;
    /** Max minutes the narrator may advance in one turn. */
    narratorMax: number;
    weekdays: string[];
    /** Calendar date of day 1 (month 1–12, day of month), when dates are shown. */
    startDate: { month: number; day: number } | null;
  };
  hud: { bars: string[]; money?: string; currency: string };
  narration: { notes?: string; numbers: boolean };
  weather: WeatherDef;
  wardrobe: WardrobeDef;
  encounters: Record<string, EncounterDef>;
  codex: Record<string, CodexEntry>;
  feats: Record<string, FeatDef>;
  perks: Record<string, PerkDef>;
  /** Stat holding perk points. */
  perkPoints?: string;
  /** Offer this many perks to choose from when there's a point to spend (0: the whole list, like a shop). */
  perkPick: number;
  abilities: Record<string, AbilityDef>;
  quests: Record<string, QuestDef>;
  questOrder: string[];
  /** Quests the story hands out: someone asks {{user}} for something, and it's tracked with stakes. */
  storyQuests: { enabled: boolean; max: number };
  /** How dungeons, dates and minigames look: medieval (parchment, oak, gold), modern (paper and ink) or sci-fi (an instrument panel). */
  look: "medieval" | "modern" | "scifi";
  secrets: Record<string, SecretDef>;
  fronts: Record<string, FrontDef>;
  randomEvents: RandomEventsDef;
  liveChoices: LiveChoicesDef;
  dungeons: Record<string, DungeonDef>;
  dating: DatingDef;
  mind: MindDef;
  checkpoints: CheckpointsDef;
  endings: Record<string, EndingDef>;
  /** What carries over to a new run after an ending. */
  legacy: KeepSpec;
  body: BodyDef;
  companions: Record<string, CompanionDef>;
  /** Starting feelings between people: a → b → −100…100. */
  bonds: Record<string, Record<string, number>>;
  lineage: LineageDef;
  obligations: Record<string, ObligationDef>;
  jobs: Record<string, JobDef>;
  observers: ObserversDef;
  discovery: DiscoveryDef;
  improvise: ImproviseDef;
  growth: GrowthDef;
}

export interface Issue {
  level: "error" | "warning";
  where: string;
  message: string;
}

// ───────────────────────── helpers ─────────────────────────

export type Raw = Record<string, any>;
export const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);

export function titleCase(id: string): string {
  return id.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function slug(s: string): string {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x";
}

const DEFAULT_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "Mon 07:00", "Day 3 18:30", "07:00", or a number of minutes. */
export function parseClockStart(v: unknown, weekdays: string[]): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v !== "string") return null;
  const s = v.trim();
  const m = /^(?:(?:day\s*(\d+))|([A-Za-z]{3,}))?\s*(\d{1,2}):(\d{2})$/i.exec(s);
  if (!m) return null;
  let day = 0;
  if (m[1]) day = Math.max(0, Number(m[1]) - 1);
  else if (m[2]) {
    const idx = weekdays.findIndex((w) => w.toLowerCase().startsWith(m[2].toLowerCase().slice(0, 3)));
    if (idx < 0) return null;
    day = idx;
  }
  const h = Number(m[3]);
  const min = Number(m[4]);
  if (h > 23 || min > 59) return null;
  return day * 1440 + h * 60 + min;
}

// ───────────────────────── normalizer ─────────────────────────

export class Ctx {
  issues: Issue[] = [];
  err(where: string, message: string) { this.issues.push({ level: "error", where, message }); }
  warn(where: string, message: string) { this.issues.push({ level: "warning", where, message }); }

  num(v: unknown, where: string, fallback: number): number {
    if (v === undefined || v === null || v === "") return fallback;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) { this.warn(where, `"${v}" should be a number — using ${fallback}`); return fallback; }
    return n;
  }

  expr(v: unknown, where: string): string | number | undefined {
    if (v === undefined || v === null) return undefined;
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    const s = String(v);
    // "-25%": a share of the stat's maximum, worked out when it's applied.
    if (percentOf(s) !== null) return s.trim();
    try { compile(s); return s; } catch (e) {
      this.err(where, e instanceof ExprError ? `Formula "${s}": ${e.message}` : `Formula "${s}" couldn't be read`);
      return undefined;
    }
  }
}

/** "-25%" → −0.25: an amount written as a share of a stat's maximum. Null for anything else. */
export function percentOf(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^\s*([+-]?)\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(v);
  return m ? (m[1] === "-" ? -1 : 1) * Number(m[2]) / 100 : null;
}

/** "1d4+1" → "roll('1d4') + 1": dice written plainly where a number is expected (damage over time, harm). */
export function diceExpr(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const m = /^\s*([+-]?)\s*(\d*d\d+)\s*(?:([+-])\s*(\d+))?\s*$/i.exec(v);
  if (!m) return v;
  return `${m[1] === "-" ? "-" : ""}(roll('${m[2].toLowerCase()}')${m[3] ? ` ${m[3]} ${m[4]}` : ""})`;
}

/** Minutes from 90, "90", "30m", "2h", "1d", "3 days". */
export function minutesOf(v: unknown, where: string, c: Ctx, fallback: number): number {
  if (typeof v === "string") {
    const m = /^\s*(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?|h|hrs?|hours?|d|days?)?\s*$/i.exec(v);
    if (m) {
      const n = Number(m[1]);
      const u = (m[2] ?? "m").toLowerCase();
      return Math.round(u.startsWith("d") ? n * 1440 : u.startsWith("h") ? n * 60 : n);
    }
  }
  return c.num(v, where, fallback);
}

/** `armor: 3` (the main meter) or `armor: { hp: 3, resolve: 1 }`. */
function armorMap(v: unknown, where: string, c: Ctx): Record<string, number> {
  if (v === undefined || v === null || v === false) return {};
  if (!isObj(v)) { const n = c.num(v, where, 0); return n ? { _: n } : {}; }
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v)) { const x = c.num(n, `${where} › ${k}`, 0); if (x) out[k] = x; }
  return out;
}

/** `narrator_when:`, `narrator_words:` and `narrator_actions:` on anything the story may change. */
export function normGate(r: Raw, where: string, c: Ctx): NarratorGate | undefined {
  const g: NarratorGate = {};
  if (r.narrator_when !== undefined) { const x = c.expr(r.narrator_when, `${where} › narrator_when`); if (x !== undefined) g.when = String(x); }
  const words = list(r.narrator_words ?? r.narrator_keywords).map((w) => w.toLowerCase()).filter(Boolean);
  if (words.length) g.words = words;
  const actions = list(r.narrator_actions).map((a) => a.toLowerCase()).filter(Boolean);
  if (actions.length) g.actions = actions;
  return g.when || g.words || g.actions ? g : undefined;
}

function toneFor(index: number, count: number, good: StatDef["good"]): Tone {
  if (good === "none" || count <= 1) return "neutral";
  const pos = index / (count - 1); // 0 = lowest band
  const goodness = good === "high" ? pos : 1 - pos;
  return goodness >= 0.67 ? "good" : goodness >= 0.34 ? "warn" : "bad";
}

function normBands(raw: unknown, good: StatDef["good"], where: string, c: Ctx): Band[] {
  if (raw === undefined || raw === null) return [];
  const list: { at: number; text: string; tone?: Tone }[] = [];
  if (Array.isArray(raw)) {
    raw.forEach((b, i) => {
      if (!isObj(b)) { c.warn(`${where} › #${i + 1}`, "each band needs `at` and `text`"); return; }
      const at = c.num(b.at ?? b.from ?? b.min, `${where} › #${i + 1}`, NaN);
      if (!Number.isFinite(at) || typeof b.text !== "string") { c.warn(`${where} › #${i + 1}`, "each band needs a numeric `at` and a `text`"); return; }
      const tone = ["good", "warn", "bad", "neutral"].includes(b.tone) ? (b.tone as Tone) : undefined;
      list.push({ at, text: b.text, tone });
    });
  } else if (isObj(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      const at = Number(k.replace(/%\s*$/, ""));
      if (!Number.isFinite(at)) { c.warn(where, `band key "${k}" should be a number (the value where this text starts), or a percentage like 75%`); continue; }
      if (typeof v === "string") list.push({ at, text: v });
      else if (isObj(v) && typeof v.text === "string") list.push({ at, text: v.text, tone: v.tone });
      else c.warn(`${where} › ${k}`, "band should be a line of text");
    }
  } else {
    c.warn(where, "bands should be a map like `0: You feel fine.`");
  }
  list.sort((a, b) => a.at - b.at);
  return list.map((b, i) => ({ at: b.at, text: b.text, tone: b.tone ?? toneFor(i, list.length, good) }));
}

const KIND_ALIASES: Record<string, StatKind> = {
  meter: "meter", bar: "meter", pool: "meter", resource: "meter",
  attribute: "attribute", attr: "attribute", stat: "attribute",
  skill: "skill", money: "money", currency: "money", hidden: "hidden",
};

function normStat(id: string, raw: unknown, where: string, c: Ctx, forRel = false): StatDef | null {
  const r: Raw = isObj(raw) ? raw : typeof raw === "number" ? { start: raw } : {};
  if (!isObj(raw) && typeof raw !== "number" && raw !== null && raw !== undefined) {
    c.warn(where, "expected a stat definition — using defaults");
  }
  const kind = KIND_ALIASES[String(r.kind ?? r.type ?? (forRel ? "meter" : "meter")).toLowerCase()];
  if (!kind) c.warn(where, `unknown kind "${r.kind}" — use meter, attribute, skill, money or hidden`);
  const k: StatKind = kind ?? "meter";
  const defaultMax = k === "money" ? 1e12 : k === "skill" ? 1000 : 100;
  const min = c.num(r.min, `${where} › min`, 0);
  let max = defaultMax;
  let maxExpr: string | undefined;
  if (typeof r.max === "string" && !Number.isFinite(Number(r.max))) {
    const e = c.expr(r.max, `${where} › max`);
    if (typeof e === "string") { maxExpr = e; max = defaultMax; }
  } else max = c.num(r.max, `${where} › max`, defaultMax);
  if (max <= min) { c.warn(where, `max (${max}) must be above min (${min})`); max = min + 100; }
  const goodRaw = String(r.good ?? (k === "meter" ? "high" : k === "hidden" ? "none" : "high")).toLowerCase();
  const good: StatDef["good"] = goodRaw === "low" ? "low" : goodRaw === "none" || goodRaw === "neutral" ? "none" : "high";
  const showRaw = String(r.show ?? (r.bands ? "text" : "both")).toLowerCase();
  const show: ShowMode = (["text", "number", "both", "hidden"].includes(showRaw) ? showRaw : "both") as ShowMode;
  let narrator = 0;
  if (r.narrator === true) narrator = Math.max(1, Math.round((max - min) / 10));
  else if (r.narrator !== undefined && r.narrator !== false) narrator = Math.abs(c.num(r.narrator, `${where} › narrator`, 0));
  const start = c.num(r.start ?? r.value, `${where} › start`, good === "low" ? min : k === "meter" ? max : min);
  const gate = narrator > 0 ? normGate(r, where, c) : undefined;
  const def: StatDef = {
    id,
    label: typeof r.label === "string" ? r.label : titleCase(id),
    kind: k,
    min, max, maxExpr,
    start: Math.min(max, Math.max(min, start)),
    good,
    perHour: c.num(r.per_hour ?? r.perHour, `${where} › per_hour`, 0),
    show: k === "hidden" ? "hidden" : show,
    narrator,
    ...(gate ? { gate } : {}),
    growth: 0,
    bands: normBands(r.bands, good, `${where} › bands`, c),
    ...(isObj(r.bands) && Object.keys(r.bands).some((k) => /%\s*$/.test(k)) ? { pctBands: true } : {}),
    color: typeof r.color === "string" ? r.color : undefined,
    desc: typeof r.desc === "string" ? r.desc : typeof r.description === "string" ? r.description : undefined,
  };
  if (Array.isArray(r.grades) && r.grades.length) def.grades = r.grades.map(String);
  // Skills and attributes improve with use unless told otherwise (`growth: 0` or a speed multiplier).
  const grows = k === "skill" || k === "attribute";
  def.growth = r.growth === false ? 0 : r.growth === true ? 1 : r.growth !== undefined ? Math.max(0, c.num(r.growth, `${where} › growth`, grows ? 1 : 0)) : grows ? 1 : 0;
  return def;
}

export function emptyEffect(): Effect {
  return {
    stats: {}, set: {}, flags: {}, items: {}, rel: {}, addConditions: {}, removeConditions: [], decide: [],
    foe: {}, unlock: [], wear: [], undress: [], damage: {}, front: {}, reveal: [], body: {}, transform: {}, arc: {}, bond: {}, learn: [],
    inflict: {}, afflict: {}, cleanse: [], quest: {}, progress: {}, remember: {},
  };
}

const INFLICT_KEYS = new Set(["rounds", "chance", "for"]);

const QUEST_OPS: Record<string, QuestOp> = {
  start: "start", take: "start", begin: "start", give: "start", offer: "start",
  done: "done", complete: "done", completed: "done", succeed: "done", success: "done", finish: "done", win: "done",
  fail: "fail", failed: "fail", lose: "fail",
  drop: "drop", abandon: "drop", cancel: "drop",
  report: "report", turn_in: "report", hand_in: "report",
};

/** `{ hair: { color: red, length: null } }` → part → trait → value (null removes). */
function normTraits(raw: unknown, where: string, c: Ctx): Record<string, Record<string, string | null>> {
  const out: Record<string, Record<string, string | null>> = {};
  if (!isObj(raw)) { c.warn(where, "expected parts with traits, like `hair: { color: red }`"); return out; }
  for (const [part, traits] of Object.entries(raw)) {
    if (typeof traits === "string") { out[part] = { type: traits }; continue; }
    if (!isObj(traits)) { c.warn(`${where} › ${part}`, "expected traits, like `{ color: red }`"); continue; }
    out[part] = Object.fromEntries(Object.entries(traits).map(([k, v]) => [k, v === null || v === false ? null : String(v)]));
  }
  return out;
}

export const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : []);

function normDecide(raw: unknown, where: string, c: Ctx, known: { stats: Set<string> }, minOptions = 2): DecideSpec[] {
  if (!isObj(raw)) { c.warn(where, "decide needs `ask:` and `options:`"); return []; }
  // Either one spec ({ ask, options }) or a map of named specs. Unnamed specs get a stable id from their location.
  const entries: [string, unknown][] = typeof raw.ask === "string" ? [[slug(where), raw]] : Object.entries(raw);
  const out: DecideSpec[] = [];
  for (const [id, spec] of entries) {
    const w = `${where} › ${id}`;
    if (!isObj(spec) || typeof spec.ask !== "string" || !isObj(spec.options)) { c.warn(w, "decide needs `ask:` (a question) and `options:`"); continue; }
    const options: DecideOption[] = [];
    for (const [oid, o] of Object.entries(spec.options)) {
      const r: Raw = isObj(o) ? { ...o } : typeof o === "string" ? { desc: o } : {};
      const desc = typeof r.desc === "string" ? r.desc : typeof r.label === "string" ? r.label : titleCase(oid);
      const weight = c.num(r.weight, `${w} › ${oid} › weight`, 1);
      delete r.desc; delete r.label; delete r.weight;
      options.push({ id: oid, desc, weight: Math.max(0, weight), effect: normEffect(r, `${w} › ${oid}`, c, known) });
    }
    if (options.length < minOptions) { c.warn(w, minOptions > 1 ? "decide needs at least two options" : "needs at least one option"); continue; }
    out.push({ id: typeof spec.id === "string" ? spec.id : id, ask: spec.ask, options });
  }
  return out;
}

/** Effects accept both a structured form and a flat shorthand: `{ fatigue: +20, hint: "..." }`. */
export function normEffect(raw: unknown, where: string, c: Ctx, known: { stats: Set<string> }): Effect {
  const e = emptyEffect();
  if (raw === undefined || raw === null) return e;
  if (typeof raw === "string") { e.hint = raw; return e; }
  if (!isObj(raw)) { c.warn(where, "expected a map of effects"); return e; }
  for (const [k, v] of Object.entries(raw)) {
    const w = `${where} › ${k}`;
    switch (k) {
      case "stats": case "change":
        if (isObj(v)) for (const [s, d] of Object.entries(v)) { const x = c.expr(d, `${w} › ${s}`); if (x !== undefined) e.stats[s] = x; }
        break;
      case "set":
        if (isObj(v)) for (const [s, d] of Object.entries(v)) { const x = c.expr(d, `${w} › ${s}`); if (x !== undefined) e.set[s] = x; }
        break;
      case "flags": case "flag":
        if (isObj(v)) Object.assign(e.flags, v);
        else if (typeof v === "string") e.flags[v] = true;
        break;
      case "items": case "give": case "take":
        if (isObj(v)) for (const [it, n] of Object.entries(v)) e.items[it] = (k === "take" ? -1 : 1) * c.num(n, `${w} › ${it}`, 1);
        else if (typeof v === "string") e.items[v] = k === "take" ? -1 : 1;
        else if (Array.isArray(v)) for (const it of v) e.items[String(it)] = k === "take" ? -1 : 1;
        break;
      case "rel": case "relationships":
        if (isObj(v)) for (const [who, m] of Object.entries(v)) {
          if (!isObj(m)) { c.warn(`${w} › ${who}`, "expected stat changes like `trust: +5`"); continue; }
          e.rel[who] = {};
          for (const [s, d] of Object.entries(m)) { const x = c.expr(d, `${w} › ${who} › ${s}`); if (x !== undefined) e.rel[who][s] = x; }
        }
        break;
      case "move": case "go": case "location":
        e.move = String(v);
        break;
      case "time": case "minutes":
        e.time = c.num(v, w, 0);
        break;
      case "add_condition": case "add_conditions": case "condition":
        if (typeof v === "string") e.addConditions[v] = null;
        else if (Array.isArray(v)) for (const x of v) e.addConditions[String(x)] = null;
        else if (isObj(v)) for (const [x, d] of Object.entries(v)) e.addConditions[x] = d === null || d === true ? null : c.num(d, `${w} › ${x}`, 60);
        break;
      case "remove_condition": case "remove_conditions": case "cure":
        if (typeof v === "string") e.removeConditions.push(v);
        else if (Array.isArray(v)) e.removeConditions.push(...v.map(String));
        break;
      case "hint": case "narrate": case "text":
        e.hint = String(v);
        break;
      case "decide":
        e.decide.push(...normDecide(v, w, c, known));
        break;
      case "foe":
        if (isObj(v)) for (const [s, d] of Object.entries(v)) { const x = c.expr(d, `${w} › ${s}`); if (x !== undefined) e.foe[s] = x; }
        else c.warn(w, "expected foe stat changes like `hp: -8`");
        break;
      case "end": case "end_encounter":
        e.end = v === true ? "ended" : String(v);
        break;
      case "start_encounter": case "encounter":
        e.startEncounter = String(v);
        break;
      case "unlock": case "codex":
        e.unlock.push(...list(v));
        break;
      case "wear": case "put_on":
        e.wear.push(...list(v));
        break;
      case "undress": case "take_off":
        e.undress.push(...list(v));
        break;
      case "damage":
        if (isObj(v)) for (const [slot, d] of Object.entries(v)) { const x = c.expr(d, `${w} › ${slot}`); if (x !== undefined) e.damage[slot] = x; }
        else c.warn(w, "expected clothing damage by slot, like `top: 30`");
        break;
      case "front": case "fronts":
        if (isObj(v)) for (const [id, d] of Object.entries(v)) { const x = c.expr(d, `${w} › ${id}`); if (x !== undefined) e.front[id] = x; }
        else c.warn(w, "expected clock changes like `gangs: -20`");
        break;
      case "reveal":
        e.reveal.push(...list(v));
        break;
      case "gauge": case "events_gauge": {
        const x = c.expr(v, w);
        if (x !== undefined) e.gauge = x;
        break;
      }
      case "momentum": case "swing": {
        const x = c.expr(v, w);
        if (x !== undefined) e.momentum = x;
        break;
      }
      case "body":
        // A stat called "body" keeps its shorthand (`body: +1`); a map sets body traits.
        if (known.stats.has(k) && !isObj(v)) { const x = c.expr(v, w); if (x !== undefined) e.stats[k] = x; }
        else Object.assign(e.body, normTraits(v, w, c));
        break;
      case "transform":
        if (isObj(v)) for (const [id, n] of Object.entries(v)) { const x = c.expr(n, `${w} › ${id}`); if (x !== undefined) e.transform[id] = x; }
        else for (const id of list(v)) e.transform[id] = 1;
        break;
      case "conceive": case "pregnancy": {
        const x: Raw = isObj(v) ? v : { with: v };
        const chance = c.expr(x.chance ?? 100, `${w} › chance`) ?? 100;
        e.conceive = { with: String(x.with ?? "target"), carrier: String(x.carrier ?? "player"), chance };
        break;
      }
      case "arc":
        if (isObj(v)) for (const [id, n] of Object.entries(v)) { const x = c.expr(n, `${w} › ${id}`); if (x !== undefined) e.arc[id] = x; }
        else c.warn(w, "expected arc changes by companion, like `jo: +5`");
        break;
      case "harm": {
        const x = c.expr(diceExpr(v), w);
        if (x !== undefined) e.harm = x;
        break;
      }
      case "learn":
        e.learn.push(...list(v));
        break;
      case "inflict": case "afflict": case "status":
        // { poisoned: 3 } (rounds), [stunned], { poisoned: { rounds: 3, chance: 40 } } — or people: { mia: [sick] }, { mia: { sick: 120 } }.
        if (typeof v === "string") e.inflict[v] = {};
        else if (Array.isArray(v)) for (const x of v) e.inflict[String(x)] = {};
        else if (isObj(v)) for (const [key, x] of Object.entries(v)) {
          const xw = `${w} › ${key}`;
          if (Array.isArray(x)) { e.afflict[key] = Object.fromEntries(x.map((id) => [String(id), null])); continue; }
          if (isObj(x) && !Object.keys(x).every((kk) => INFLICT_KEYS.has(kk))) {
            e.afflict[key] = {};
            for (const [cid, d] of Object.entries(x)) e.afflict[key][cid] = d === null || d === true ? null : minutesOf(d, `${xw} › ${cid}`, c, 60);
            continue;
          }
          const spec: InflictSpec = {};
          if (isObj(x)) {
            const rounds = x.rounds ?? x.for;
            if (rounds !== undefined) { const r = c.expr(rounds, `${xw} › rounds`); if (r !== undefined) spec.rounds = r; }
            if (x.chance !== undefined) { const ch = c.expr(x.chance, `${xw} › chance`); if (ch !== undefined) spec.chance = ch; }
          } else if (x !== true && x !== null) {
            const r = c.expr(x, xw);
            if (r !== undefined) spec.rounds = r;
          }
          e.inflict[key] = spec;
        }
        break;
      case "cleanse":
        e.cleanse.push(...list(v));
        break;
      case "hits": case "pierce": {
        // A stat of the same name keeps its shorthand.
        if (known.stats.has(k)) { const x = c.expr(v, w); if (x !== undefined) e.stats[k] = x; break; }
        const x = v === true || v === "all" ? 999 : c.expr(diceExpr(v), w);
        if (x !== undefined) { if (k === "hits") e.hits = x; else e.pierce = x; }
        break;
      }
      case "quest": case "quests":
        if (typeof v === "string") e.quest[v] = "start";
        else if (Array.isArray(v)) for (const id of v) e.quest[String(id)] = "start";
        else if (isObj(v)) for (const [id, op] of Object.entries(v)) {
          const o = QUEST_OPS[String(op).toLowerCase()];
          if (o) e.quest[id] = o;
          else c.warn(`${w} › ${id}`, `"${op}" isn't a quest step (start, done, fail, drop, report)`);
        }
        break;
      case "progress":
        if (known.stats.has(k)) { const x = c.expr(v, w); if (x !== undefined) e.stats[k] = x; break; }
        if (typeof v === "string") e.progress[v] = 1;
        else if (isObj(v)) for (const [id, n] of Object.entries(v)) { const x = c.expr(n, `${w} › ${id}`); if (x !== undefined) e.progress[id] = x; }
        break;
      case "remember": case "memory":
        if (isObj(v)) for (const [who, text] of Object.entries(v)) { if (typeof text === "string" && text.trim()) e.remember[who] = text.trim(); }
        else c.warn(w, "expected who remembers what, like `mia: \"{{user}} burned her breakfast\"`");
        break;
      case "bond": case "bonds":
        if (isObj(v)) for (const [a, m] of Object.entries(v)) {
          if (!isObj(m)) { c.warn(`${w} › ${a}`, "expected feelings toward others, like `dex: +3`"); continue; }
          e.bond[a] = {};
          for (const [b, n] of Object.entries(m)) { const x = c.expr(n, `${w} › ${a} › ${b}`); if (x !== undefined) e.bond[a][b] = x; }
        }
        break;
      default:
        // Flat shorthand: a known stat name maps to a delta.
        if (known.stats.has(k)) { const x = c.expr(v, w); if (x !== undefined) e.stats[k] = x; }
        else c.warn(w, `"${k}" isn't a stat or a known effect (stats, set, flags, give, take, rel, move, time, add_condition, remove_condition, hint, decide, foe, end, start_encounter, unlock, wear, undress, damage, front, reveal, gauge, momentum, body, transform, arc, bond, conceive, harm, hits, pierce, learn, inflict, cleanse, quest, progress, remember)`);
    }
  }
  return e;
}

function normCheck(raw: unknown, where: string, c: Ctx): CheckDef | undefined {
  if (!isObj(raw)) { c.warn(where, "check should be a map, e.g. `chance: 40 + athletics / 10`"); return undefined; }
  let style: CheckStyle;
  if (raw.chance !== undefined || raw.under !== undefined) style = "chance";
  else if (raw.style === "pbta" || raw.bands === "pbta" || raw.pbta !== undefined) style = "pbta";
  else if (raw.vs !== undefined || raw.dc !== undefined) style = "vs";
  else { c.err(where, "a check needs `chance:` (percent), `vs:` (difficulty) or `style: pbta`"); return undefined; }
  const dice = String(raw.dice ?? raw.roll ?? (style === "chance" ? "d100" : style === "pbta" ? "2d6" : "d20"));
  try { parseDice(dice); } catch (e) { c.err(`${where} › dice`, e instanceof DiceError ? e.message : "bad dice"); return undefined; }
  const target = c.expr(style === "chance" ? (raw.chance ?? raw.under) : raw.vs ?? raw.dc, `${where} › ${style === "chance" ? "chance" : "vs"}`);
  const add = c.expr(raw.add ?? raw.bonus ?? raw.mod ?? (style === "pbta" ? raw.pbta : undefined), `${where} › add`);
  return {
    style, dice, target, add,
    partialMargin: c.num(raw.partial ?? raw.partial_margin, `${where} › partial`, 0),
    label: typeof raw.label === "string" ? raw.label : typeof raw.skill === "string" ? raw.skill : undefined,
    crits: raw.crits !== false,
    ...(raw.game !== undefined || raw.games !== undefined || raw.minigame !== undefined ? { game: normGames(raw.game ?? raw.games ?? raw.minigame, `${where} › game`, c) } : {}),
  };
}

/** `look: medieval` — how the stage and the arcade look (`minigames: { style }` says the same). */
function normLook(raw: unknown, c: Ctx): Ruleset["look"] {
  if (raw === undefined) return "modern";
  const v = String((isObj(raw) ? raw.style ?? raw.look : raw) ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const map: Record<string, Ruleset["look"]> = { medieval: "medieval", fantasy: "medieval", modern: "modern", contemporary: "modern", scifi: "scifi", sf: "scifi", future: "scifi", space: "scifi", cyberpunk: "scifi" };
  if (map[v]) return map[v];
  c.warn("Look", "should be medieval, modern or scifi");
  return "modern";
}

/** `game: aim`, `game: [mines, snake]`, `game: false` (dice only). */
function normGames(raw: unknown, where: string, c: Ctx): GameId[] | false {
  if (raw === false || raw === "none" || raw === "dice") return false;
  const out: GameId[] = [];
  for (const x of Array.isArray(raw) ? raw : [raw]) {
    const g = gameAlias(String(x));
    if (g) { if (!out.includes(g)) out.push(g); } else c.warn(where, `"${String(x)}" isn't a minigame — use ${GAME_IDS.join(", ")}`);
  }
  return out.length ? out : false;
}

function normGamble(raw: unknown, where: string, c: Ctx, known: { stats: Set<string> }): GambleDef | undefined {
  const r: Raw = isObj(raw) ? raw : { game: raw };
  const g = gameAlias(String(r.game ?? ""));
  if (!g || !(GAMBLE_GAMES as string[]).includes(g)) { c.warn(where, `\`game:\` should be ${GAMBLE_GAMES.join(", ")}`); return undefined; }
  const stakes = (Array.isArray(r.stakes ?? r.stake) ? (r.stakes ?? r.stake) as unknown[] : [r.stakes ?? r.stake ?? 10])
    .map((x) => Math.round(c.num(x, `${where} › stakes`, 0))).filter((x) => x > 0).sort((a, b) => a - b);
  const stat = typeof r.stat === "string" ? r.stat : typeof r.with === "string" ? r.with : undefined;
  if (stat && !known.stats.has(stat)) c.warn(`${where} › stat`, `"${stat}" isn't a declared stat`);
  const edge = r.edge !== undefined ? pct(r.edge, `${where} › edge`, c) : null;
  return {
    game: g as GambleGame,
    stakes: stakes.length ? [...new Set(stakes)] : [10],
    rounds: Math.max(1, Math.min(12, Math.round(c.num(r.rounds ?? r.hands ?? r.spins, `${where} › rounds`, g === "slots" ? 6 : 5)))),
    ...(stat ? { stat } : {}),
    ...(edge !== null ? { edge } : {}),
    ...(r.luck !== undefined ? { luck: c.expr(r.luck, `${where} › luck`) } : {}),
    win: normEffect(r.win ?? r.won, `${where} › win`, c, known),
    lose: normEffect(r.lose ?? r.lost, `${where} › lose`, c, known),
    broke: normEffect(r.broke ?? r.bust, `${where} › broke`, c, known),
  };
}

const TIER_KEYS: Record<string, Tier> = {
  crit_success: "crit_success", critical_success: "crit_success", crit: "crit_success",
  success: "success", pass: "success",
  partial: "partial", mixed: "partial",
  fail: "fail", failure: "fail", miss: "fail",
  crit_fail: "crit_fail", critical_fail: "crit_fail", fumble: "crit_fail",
};

function normAction(id: string, raw: unknown, where: string, c: Ctx, known: { stats: Set<string> }, order: number): ActionDef | null {
  if (typeof raw === "string") raw = { label: raw };
  if (!isObj(raw)) { c.warn(where, "expected an action definition"); return null; }
  const params: ParamDef[] = [];
  if (isObj(raw.params)) {
    for (const [pid, p] of Object.entries(raw.params)) {
      const pw = `${where} › params › ${pid}`;
      const opts = isObj(p) && isObj(p.options) ? p.options : isObj(p) ? p : null;
      if (!opts) { c.warn(pw, "params need options, e.g. `{ easy: 8, hard: 16 }`"); continue; }
      const options: Record<string, number> = {};
      for (const [o, v] of Object.entries(opts)) if (o !== "default" && o !== "label") options[o] = c.num(v, `${pw} › ${o}`, 0);
      const keys = Object.keys(options);
      if (!keys.length) continue;
      const def = isObj(p) && typeof p.default === "string" && keys.includes(p.default) ? p.default : keys[Math.floor(keys.length / 2)];
      params.push({ id: pid, label: isObj(p) && typeof p.label === "string" ? p.label : titleCase(pid), options, default: def });
    }
  }
  const outcomes: Partial<Record<Tier, Effect>> = {};
  for (const [k, v] of Object.entries(raw)) {
    const tier = TIER_KEYS[k];
    if (tier) outcomes[tier] = normEffect(v, `${where} › ${k}`, c, known);
  }
  if (isObj(raw.outcomes)) for (const [k, v] of Object.entries(raw.outcomes)) {
    const tier = TIER_KEYS[k];
    if (tier) outcomes[tier] = normEffect(v, `${where} › outcomes › ${k}`, c, known);
    else c.warn(`${where} › outcomes › ${k}`, "outcomes are crit_success, success, partial, fail, crit_fail");
  }
  const check = raw.check !== undefined ? normCheck(raw.check, `${where} › check`, c) : undefined;
  if (!check && Object.keys(outcomes).length) c.warn(where, "has outcomes but no check — put always-on changes under `effects:`");
  // A gambling table: pick the stake like any other option when it's rolled instead of played.
  const gamble = raw.gamble !== undefined ? normGamble(raw.gamble, `${where} › gamble`, c, known) : undefined;
  if (gamble && check) c.warn(where, "a gambling table doesn't take a check — the cards (or the wheel) decide");
  if (gamble && !params.some((p) => p.id === "stake")) params.unshift({ id: "stake", label: "Stake", options: Object.fromEntries(gamble.stakes.map((x) => [String(x), x])), default: String(gamble.stakes[0]) });
  const at = raw.at === undefined ? [] : Array.isArray(raw.at) ? raw.at.map(String) : [String(raw.at)];
  const own = raw.when !== undefined ? c.expr(raw.when, `${where} › when`) : undefined;
  // Requirements fold into `when`, and stay readable so a locked choice can say what's missing.
  const requires = normRequires(raw.requires ?? raw.needs, `${where} › requires`, c, known);
  const parts = [...(own !== undefined ? [String(own)] : []), ...requires.map((q) => q.when)];
  const when = parts.length > 1 ? parts.map((p) => `(${p})`).join(" and ") : parts[0];
  return {
    id,
    label: typeof raw.label === "string" ? raw.label : titleCase(id),
    say: typeof raw.say === "string" ? raw.say : undefined,
    desc: typeof raw.desc === "string" ? raw.desc : typeof raw.description === "string" ? raw.description : undefined,
    group: typeof raw.group === "string" ? raw.group : undefined,
    at,
    when: when === undefined ? undefined : String(when),
    hidden: raw.hidden === true,
    ...(typeof raw.why_not === "string" ? { whyNot: raw.why_not } : typeof raw.locked === "string" ? { whyNot: raw.locked } : {}),
    time: raw.time !== undefined ? c.num(raw.time, `${where} › time`, 0) : undefined,
    cost: normEffect(raw.cost ?? raw.costs, `${where} › cost`, c, known),
    check,
    outcomes,
    effects: normEffect(raw.effects ?? raw.effect, `${where} › effects`, c, known),
    params,
    tags: Array.isArray(raw.tags) ? raw.tags.map((t: unknown) => String(t).toLowerCase()) : [],
    order: typeof raw.order === "number" ? raw.order : order,
    perPerson: raw.per_person === true || raw.with === "person" || raw.with === "people",
    requires,
    showLocked: raw.show_locked === true || (raw.show_locked !== false && requires.length > 0),
    ...(gamble ? { gamble } : {}),
  };
}

/**
 * `requires:` — what an action needs, in a form a locked choice can explain:
 *   { lockpicking: 30, with: brann, has: crowbar, rel: { brann: { trust: 40 } }, quest: heist, flag: vault_found, perk: lockmaster,
 *     when: { "hour >= 20": "After dark" } }
 * Also a list of formulas or { when, text } pairs.
 */
function normRequires(raw: unknown, where: string, c: Ctx, known: { stats: Set<string> }): Requirement[] {
  const out: Requirement[] = [];
  if (raw === undefined || raw === null) return out;
  const formula = (f: unknown, text: string | undefined, w: string) => {
    const x = c.expr(f, w);
    if (x !== undefined) out.push({ when: String(x), kind: "formula", ...(text ? { text } : {}) });
  };
  if (typeof raw === "string") { formula(raw, undefined, where); return out; }
  if (Array.isArray(raw)) {
    raw.forEach((x, i) => {
      if (isObj(x) && x.when !== undefined) formula(x.when, typeof x.text === "string" ? x.text : undefined, `${where} #${i + 1}`);
      else if (isObj(x)) out.push(...normRequires(x, `${where} #${i + 1}`, c, known));
      else formula(x, undefined, `${where} #${i + 1}`);
    });
    return out;
  }
  if (!isObj(raw)) { c.warn(where, "expected requirements like `{ lockpicking: 30, with: brann, has: crowbar }`"); return out; }
  const q = (s: string) => s.replace(/'/g, "");
  for (const [k, v] of Object.entries(raw)) {
    const w = `${where} › ${k}`;
    if (known.stats.has(k)) {
      const n = c.num(v, w, 0);
      out.push({ when: `${k} >= ${n}`, kind: "stat", id: k, n });
      continue;
    }
    switch (k) {
      case "with": case "present": case "companion":
        for (const p of list(v)) out.push({ when: `present('${q(p)}')`, kind: "with", id: p });
        break;
      case "has": case "item": case "items":
        if (isObj(v)) for (const [it, n] of Object.entries(v)) { const m = c.num(n, `${w} › ${it}`, 1); out.push({ when: `has('${q(it)}', ${m})`, kind: "has", id: it, n: m }); }
        else for (const it of list(v)) out.push({ when: `has('${q(it)}')`, kind: "has", id: it, n: 1 });
        break;
      case "rel":
        if (isObj(v)) for (const [who, m] of Object.entries(v)) {
          if (!isObj(m)) { c.warn(`${w} › ${who}`, "expected `trust: 40`"); continue; }
          for (const [stat, n] of Object.entries(m)) {
            const x = c.num(n, `${w} › ${who} › ${stat}`, 0);
            out.push({ when: `rel('${q(who)}', '${q(stat)}') >= ${x}`, kind: "rel", id: who, stat, n: x });
          }
        }
        break;
      case "quest": case "quests":
        if (isObj(v)) for (const [id, st] of Object.entries(v)) out.push({ when: `quest('${q(id)}') == '${q(String(st))}'`, kind: "quest", id, state: String(st) });
        else for (const id of list(v)) out.push({ when: `quest('${q(id)}') == 'active'`, kind: "quest", id, state: "active" });
        break;
      case "flag": case "flags":
        if (isObj(v)) for (const [f, val] of Object.entries(v)) out.push({ when: val === false ? `not flag('${q(f)}')` : `flag('${q(f)}')`, kind: "flag", id: f, state: val === false ? "off" : "on" });
        else for (const f of list(v)) out.push({ when: `flag('${q(f)}')`, kind: "flag", id: f, state: "on" });
        break;
      case "perk": case "perks":
        for (const p of list(v)) out.push({ when: `perk('${q(p)}')`, kind: "perk", id: p });
        break;
      case "when": case "formula":
        if (isObj(v)) for (const [f, text] of Object.entries(v)) formula(f, typeof text === "string" ? text : undefined, w);
        else formula(v, undefined, w);
        break;
      default:
        c.warn(w, `"${k}" isn't a stat or a requirement (with, has, rel, quest, flag, perk, when)`);
    }
  }
  return out;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Sep 4", "4 Sep", "September 4th", or { month, day }. */
export function parseDate(v: unknown): { month: number; day: number } | null {
  if (isObj(v)) {
    const m = Number(v.month), d = Number(v.day);
    return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? { month: m, day: d } : null;
  }
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  const a = /^([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?$/.exec(s);
  const b = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})\.?$/.exec(s);
  const name = a?.[1] ?? b?.[2];
  const day = Number(a?.[2] ?? b?.[1]);
  const month = name ? MONTHS.indexOf(name.slice(0, 3)) + 1 : 0;
  return month >= 1 && day >= 1 && day <= 31 ? { month, day } : null;
}

const DEFAULT_WEATHER: WeatherKind[] = [
  { id: "clear", label: "Clear", icon: "☀️", weight: 4, temp: 1, seasons: null, tags: [] },
  { id: "cloudy", label: "Overcast", icon: "☁️", weight: 3, temp: -1, seasons: null, tags: [] },
  { id: "rain", label: "Rain", icon: "🌧️", weight: 2, temp: -3, seasons: null, tags: ["wet"] },
  { id: "storm", label: "Storm", icon: "⛈️", weight: 1, temp: -4, seasons: ["summer", "autumn"], tags: ["wet", "windy"] },
  { id: "snow", label: "Snow", icon: "❄️", weight: 2, temp: -6, seasons: ["winter"], tags: ["wet", "cold"] },
];

function normWeather(raw: unknown, c: Ctx): WeatherDef {
  const def: WeatherDef = {
    enabled: false,
    kinds: DEFAULT_WEATHER,
    seasonTemps: { spring: 12, summer: 22, autumn: 11, winter: 3 },
    seasons: { spring: [3, 4, 5], summer: [6, 7, 8], autumn: [9, 10, 11], winter: [12, 1, 2] },
    swing: 5,
    changeHours: 6,
    indoorTemp: 20,
  };
  if (raw === undefined || raw === false) return def;
  def.enabled = true;
  if (!isObj(raw)) return def;
  if (isObj(raw.kinds)) {
    const kinds: WeatherKind[] = [];
    for (const [id, k] of Object.entries(raw.kinds)) {
      const r: Raw = isObj(k) ? k : {};
      const w = `Weather › kinds › ${id}`;
      kinds.push({
        id,
        label: typeof r.label === "string" ? r.label : titleCase(id),
        icon: typeof r.icon === "string" ? r.icon : "",
        weight: Math.max(0, c.num(r.weight, `${w} › weight`, 1)),
        temp: c.num(r.temp, `${w} › temp`, 0),
        seasons: r.seasons === undefined ? null : list(r.seasons),
        tags: list(r.tags),
      });
    }
    if (kinds.length) def.kinds = kinds;
  }
  if (isObj(raw.temps)) for (const [s, t] of Object.entries(raw.temps)) def.seasonTemps[s] = c.num(t, `Weather › temps › ${s}`, 10);
  if (isObj(raw.seasons)) {
    def.seasons = {};
    for (const [s, m] of Object.entries(raw.seasons)) def.seasons[s] = (Array.isArray(m) ? m : [m]).map(Number).filter((n) => n >= 1 && n <= 12);
  }
  def.swing = c.num(raw.swing, "Weather › swing", def.swing);
  def.changeHours = Math.max(1, c.num(raw.change_hours ?? raw.changes_every, "Weather › change_hours", def.changeHours));
  def.indoorTemp = c.num(raw.indoors ?? raw.indoor_temp, "Weather › indoors", def.indoorTemp);
  return def;
}

const DEFAULT_SLOTS = ["head", "outer", "top", "bottom", "under_top", "under_bottom", "legs", "feet"];

function normWardrobe(raw: unknown, items: Record<string, ItemDef>, c: Ctx): WardrobeDef {
  const clothing = Object.values(items).some((i) => i.slot);
  const def: WardrobeDef = { enabled: clothing, slots: [], cover: ["top", "bottom"], startWorn: [], narrator: true };
  const r: Raw = isObj(raw) ? raw : {};
  if (raw === false) def.enabled = false;
  if (isObj(raw)) def.enabled = true;
  const slotIds = Array.isArray(r.slots) ? r.slots.map(String) : DEFAULT_SLOTS;
  def.slots = slotIds.map((id: string) => ({ id, label: titleCase(id) }));
  if (Array.isArray(r.cover)) def.cover = r.cover.map(String);
  def.startWorn = list(r.start ?? r.worn);
  def.narrator = r.narrator !== false;
  for (const it of Object.values(items)) {
    if (it.slot && !slotIds.includes(it.slot)) c.warn(`Items › ${it.id} › slot`, `"${it.slot}" isn't a wardrobe slot (${slotIds.join(", ")})`);
  }
  return def;
}

/** Keys of an item's `use:` that describe the action itself; everything else is its effect. */
const USE_KEYS = new Set(["label", "say", "desc", "description", "when", "time", "tags", "check", "params", "why_not", "locked", "group", "cost", "effects", "effect", "outcomes", "per_person", "hidden", "at", "order", "success", "fail", "partial", "crit_success", "crit_fail", "critical_success", "critical_fail", "failure", "requires", "needs", "show_locked", "gamble"]);

/** An item's `use:` (an action, or plain effects) and `bonus:` (gear that helps checks). */
function applyItemUse(it: ItemDef, r: Raw, w: string, c: Ctx, known: { stats: Set<string> }, drafted: boolean) {
  if (r.keep === true) it.keep = true;
  if (isObj(r.bonus)) {
    for (const [stat, v] of Object.entries(r.bonus)) {
      if (!known.stats.has(stat)) { c.warn(`${w} › bonus › ${stat}`, `"${stat}" isn't a declared stat`); continue; }
      it.bonus[stat] = c.num(v, `${w} › bonus › ${stat}`, 0);
    }
  }
  const u = r.use;
  if (u !== undefined && u !== false) {
    const raw: Raw = isObj(u) ? u : typeof u === "string" ? { hint: u } : {};
    const action: Raw = {};
    const rest: Raw = {};
    for (const [k, v] of Object.entries(raw)) (USE_KEYS.has(k) || TIER_KEYS[k] ? action : rest)[k] = v;
    if (Object.keys(rest).length && !action.effects && !action.check) action.effects = rest;
    // The item is in hand, or this isn't offered.
    const has = `has('${it.id}')`;
    action.when = action.when !== undefined ? `(${String(action.when)}) and ${has}` : has;
    if (!action.label) action.label = `Use the ${it.name}`;
    const def = normAction(`item:${it.id}`, action, `${w} › use`, c, known, 0);
    if (def) { def.tags = [...new Set([...def.tags, "item"])]; it.use = def; }
  }
  if (drafted && (it.use || Object.keys(it.bonus).length)) it.drafted = true;
}

/** A condition's life and bite: how long it lasts, damage over time, lost turns, armor, and anything else each tick. */
function condTiming(r: Raw, w: string, c: Ctx, known: { stats: Set<string> }): Pick<ConditionDef, "rounds" | "lasts" | "dot" | "stat" | "every" | "skip" | "armor" | "tick"> {
  const every = String(r.every ?? "round").toLowerCase();
  const dotRaw = r.dot ?? r.per_round ?? r.damage;
  const dot = dotRaw !== undefined ? c.expr(diceExpr(dotRaw), `${w} › dot`) : undefined;
  const heal = r.heal !== undefined ? c.expr(diceExpr(r.heal), `${w} › heal`) : undefined;
  const skipRaw = r.skip ?? r.stun ?? r.lose_turn;
  const skip = skipRaw === true ? 100 : skipRaw !== undefined && skipRaw !== false ? c.expr(skipRaw, `${w} › skip`) : undefined;
  const lastsRaw = r.lasts ?? r.minutes ?? r.duration;
  return {
    ...(r.rounds !== undefined ? { rounds: Math.max(1, Math.round(c.num(r.rounds, `${w} › rounds`, 1))) } : {}),
    ...(lastsRaw !== undefined ? { lasts: Math.max(1, minutesOf(lastsRaw, `${w} › lasts`, c, 60)) } : {}),
    // heal: 4 is a dot of −4.
    ...(dot !== undefined ? { dot } : heal !== undefined ? { dot: typeof heal === "number" ? -heal : `-(${heal})` } : {}),
    ...(typeof r.stat === "string" ? { stat: r.stat } : {}),
    every: every === "turn" ? "turn" : every === "hour" ? "hour" : "round",
    ...(skip !== undefined ? { skip } : {}),
    armor: armorMap(r.armor, `${w} › armor`, c),
    tick: normEffect(r.tick ?? r.each, `${w} › tick`, c, known),
  };
}

/** `{ stealth: 15, evasion: -5 }` over declared stats. */
function statNums(v: unknown, where: string, c: Ctx, known: { stats: Set<string> }): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [stat, n] of Object.entries(v)) {
    if (!known.stats.has(stat)) { c.warn(`${where} › ${stat}`, `"${stat}" isn't a declared stat`); continue; }
    out[stat] = c.num(n, `${where} › ${stat}`, 0);
  }
  return out;
}

/** "-30%", -30 or -0.3 → −0.3. */
function pct(v: unknown, where: string, c: Ctx): number | null {
  const t = String(v).trim();
  const n = Number(t.replace(/%$/, "").replace(/^\+/, ""));
  if (!Number.isFinite(n)) { c.warn(where, "expected a percentage like -30%"); return null; }
  return t.endsWith("%") || Math.abs(n) > 1 ? n / 100 : n;
}

const PERK_META = new Set(["points", "pick", "offer", "list"]);
const DEFAULT_KNOWN = "\u0000default";

function normEdges(v: unknown, where: string, c: Ctx, known: { stats: Set<string> }): Edge[] {
  const out: Edge[] = [];
  for (const [i, x] of (Array.isArray(v) ? v : v === undefined ? [] : [v]).entries()) {
    const w = `${where}${Array.isArray(v) ? ` › ${i + 1}` : ""}`;
    if (!isObj(x)) { c.warn(w, "expected `stats:` and `when:`"); continue; }
    // `{ stats: { stealth: 15 }, when }` or the short form `{ stealth: 15, when }`.
    const raw = isObj(x.stats) ? x.stats : Object.fromEntries(Object.entries(x).filter(([k]) => k !== "when"));
    const when = x.when !== undefined ? c.expr(x.when, `${w} › when`) : undefined;
    const stats = statNums(raw, `${w} › stats`, c, known);
    if (Object.keys(stats).length) out.push({ stats, ...(when !== undefined ? { when: String(when) } : {}) });
  }
  return out;
}

function normPerkRules(v: unknown, where: string, c: Ctx, known: { stats: Set<string> }): PerkRule[] {
  const out: PerkRule[] = [];
  if (!isObj(v)) return out;
  for (const [k, x] of Object.entries(v)) {
    const w = `${where} › ${k}`;
    if (k === "reroll" || k === "soften") {
      const r: Raw = isObj(x) ? x : {};
      const stats = list(r.stats ?? r.stat).filter((s) => known.stats.has(s) || (c.warn(`${w} › stats`, `"${s}" isn't a declared stat`), false));
      out.push({ kind: k, stats, tags: list(r.tags), perDay: Math.max(0, Math.round(c.num(r.per_day ?? (x === true ? 0 : 1), `${w} › per_day`, 1))) });
    } else if (k === "gains" || k === "losses") {
      if (!isObj(x)) { c.warn(w, "expected stats with a percentage, like `scent: -30%`"); continue; }
      for (const [stat, n] of Object.entries(x)) {
        if (!known.stats.has(stat)) { c.warn(`${w} › ${stat}`, `"${stat}" isn't a declared stat`); continue; }
        const p = pct(n, `${w} › ${stat}`, c);
        if (p !== null && p !== 0) out.push({ kind: k, stat, pct: Math.max(-1, p) });
      }
    } else if (k === "pierce") {
      // pierce: 3 (every move) or { amount: 3, stats: [blades], tags: [melee] }; true = all armor.
      const r: Raw = isObj(x) ? x : { amount: x };
      const amount = r.amount === true || r.amount === "all" ? 999 : c.num(r.amount ?? r.by, `${w} › amount`, 999);
      out.push({ kind: "pierce", amount, stats: list(r.stats ?? r.stat), tags: list(r.tags).map((t) => t.toLowerCase()) });
    } else if (k === "game" || k === "games" || k === "minigames") {
      // game: { lives: 1, window: 20, games: [aim] } — aids in minigames.
      const r: Raw = isObj(x) ? x : {};
      const games = list(r.games ?? r.game ?? r.only).map((g) => gameAlias(g) ?? (c.warn(`${w} › games`, `"${g}" isn't a minigame`), null)).filter((g): g is GameId => !!g);
      const aids: Partial<Record<AidKind, number>> = {};
      for (const [ak, n] of Object.entries(r)) {
        if (["games", "game", "only"].includes(ak)) continue;
        if (!(AID_KINDS as string[]).includes(ak)) { c.warn(`${w} › ${ak}`, `isn't a minigame aid (${AID_KINDS.join(", ")})`); continue; }
        const v = typeof n === "string" && n.trim().endsWith("%") ? parseFloat(n) : c.num(n === true ? 1 : n, `${w} › ${ak}`, 0);
        if (v) aids[ak as AidKind] = v;
      }
      if (Object.keys(aids).length) out.push({ kind: "game", games, aids });
      else c.warn(w, "names no aid — e.g. `game: { lives: 1, window: 20 }`");
    } else c.warn(w, "isn't a perk rule (reroll, soften, gains, losses, pierce, game)");
  }
  return out;
}

function normPerk(id: string, p: Raw, w: string, c: Ctx, known: { stats: Set<string> }, abilities: Record<string, AbilityDef>): PerkDef {
  const req = p.requires !== undefined ? c.expr(p.requires, `${w} › requires`) : undefined;
  const bonus = statNums(p.bonus, `${w} › bonus`, c, known);
  const rules = normPerkRules(p.rule ?? p.rules, `${w} › rule`, c, known);
  // A drawback is more of the same, pointing the other way; its words show on the perk.
  let drawback: string | undefined;
  if (typeof p.drawback === "string") drawback = p.drawback;
  else if (isObj(p.drawback)) {
    const d = p.drawback;
    if (typeof d.desc === "string") drawback = d.desc;
    for (const [stat, n] of Object.entries(statNums(d.bonus, `${w} › drawback › bonus`, c, known))) bonus[stat] = (bonus[stat] ?? 0) + n;
    rules.push(...normPerkRules({ ...(d.gains ? { gains: d.gains } : {}), ...(d.losses ? { losses: d.losses } : {}) }, `${w} › drawback`, c, known));
  }
  const taught = list(p.abilities ?? p.grants ?? p.teaches);
  for (const a of taught) if (!abilities[a]) c.warn(`${w} › abilities`, `"${a}" isn't a declared ability`);
  return {
    id,
    name: typeof p.name === "string" ? p.name : titleCase(id),
    desc: typeof p.desc === "string" ? p.desc : "",
    cost: c.num(p.cost, `${w} › cost`, 1),
    ...(req !== undefined ? { requires: String(req) } : {}),
    effects: normEffect(p.effects, `${w} › effects`, c, known),
    tags: list(p.tags).map((t) => t.toLowerCase()),
    bonus,
    edges: normEdges(p.edge ?? p.edges, `${w} › edge`, c, known),
    rules,
    abilities: taught.filter((a) => abilities[a]),
    ...(typeof p.narrator === "string" ? { narrator: p.narrator } : {}),
    excludes: list(p.excludes),
    weight: Math.max(0, c.num(p.weight, `${w} › weight`, 1)),
    ...(drawback ? { drawback } : {}),
  };
}

const ABILITY_META = new Set(["name", "known", "per_day", "per_encounter", "where"]);

function normAbilities(raw: unknown, c: Ctx, known: { stats: Set<string> }): Record<string, AbilityDef> {
  const out: Record<string, AbilityDef> = {};
  for (const [id, a] of Object.entries(isObj(raw) ? raw : {})) {
    const w = `Abilities › ${id}`;
    if (!isObj(a)) { c.warn(w, "expected an ability (label, cost, check or effects)"); continue; }
    const action: Raw = {};
    const rest: Raw = {};
    for (const [k, v] of Object.entries(a)) {
      if (ABILITY_META.has(k)) continue;
      (USE_KEYS.has(k) || TIER_KEYS[k] ? action : rest)[k] = v;
    }
    // Effects written at the top: what it does (on a success, when it rolls).
    if (Object.keys(rest).length) {
      if (!action.check) action.effects = { ...(isObj(action.effects) ? action.effects : {}), ...rest };
      else if (!action.success) action.success = rest;
      else c.warn(w, `${Object.keys(rest).join(", ")}: put these under success: or fail: when the ability rolls`);
    }
    const name = typeof a.name === "string" ? a.name : typeof a.label === "string" ? a.label : titleCase(id);
    if (!action.label) action.label = name;
    const def = normAction(`ability:${id}`, action, w, c, known, 0);
    if (!def) continue;
    def.tags = [...new Set([...def.tags, "ability"])];
    const k = a.known;
    out[id] = {
      id, name, action: def,
      ...(typeof a.desc === "string" ? { desc: a.desc } : {}),
      known: k === undefined ? DEFAULT_KNOWN : typeof k === "boolean" ? k : String(c.expr(k, `${w} › known`) ?? false),
      perDay: Math.max(0, Math.round(c.num(a.per_day, `${w} › per_day`, 0))),
      perEncounter: Math.max(0, Math.round(c.num(a.per_encounter, `${w} › per_encounter`, 0))),
      where: a.where === "encounter" || a.where === "story" ? a.where : "any",
    };
  }
  return out;
}

function normEncounter(id: string, raw: unknown, c: Ctx, known: { stats: Set<string> }): EncounterDef | null {
  const w = `Encounters › ${id}`;
  if (!isObj(raw)) { c.warn(w, "expected an encounter definition"); return null; }
  const foeRaw: Raw = isObj(raw.foe) ? raw.foe : {};
  const stats: FoeStatDef[] = [];
  for (const [sid, s] of Object.entries(isObj(foeRaw.stats) ? foeRaw.stats : {})) {
    const r: Raw = isObj(s) ? s : { start: s };
    const start = c.num(r.start, `${w} › foe › ${sid}`, 10);
    const goodRaw = String(r.good ?? "low").toLowerCase();
    stats.push({
      id: sid,
      label: typeof r.label === "string" ? r.label : titleCase(sid),
      start,
      max: c.num(r.max, `${w} › foe › ${sid} › max`, Math.max(start, 1)),
      good: goodRaw === "high" ? "high" : goodRaw === "none" ? "none" : "low",
    });
  }
  const actions: Record<string, ActionDef> = {};
  const actionOrder: string[] = [];
  let i = 0;
  for (const [aid, a] of Object.entries(isObj(raw.actions) ? raw.actions : {})) {
    const def = normAction(aid, a, `${w} › actions › ${aid}`, c, known, i++);
    if (def) { actions[aid] = def; actionOrder.push(aid); }
  }
  if (!actionOrder.length) c.warn(w, "has no player `actions:` — the player can't do anything during it");
  let foeMoves: DecideSpec | null = null;
  const movesRaw = raw.foe_moves ?? raw.moves;
  if (isObj(movesRaw)) {
    const specs = normDecide({ ask: typeof raw.foe_ask === "string" ? raw.foe_ask : `What does ${typeof foeRaw.name === "string" ? foeRaw.name : "the opponent"} do next?`, options: movesRaw }, `${w} › foe_moves`, c, known, 1);
    foeMoves = specs[0] ? { ...specs[0], id: `enc_${id}_foe` } : null;
  }
  const endWhen: { outcome: string; when: string }[] = [];
  for (const [outcome, when] of Object.entries(isObj(raw.end_when) ? raw.end_when : {})) {
    const x = c.expr(when, `${w} › end_when › ${outcome}`);
    if (x !== undefined) endWhen.push({ outcome, when: String(x) });
  }
  const outcomes: Record<string, Effect> = {};
  for (const [o, e] of Object.entries(isObj(raw.outcomes) ? raw.outcomes : {})) outcomes[o] = normEffect(e, `${w} › outcomes › ${o}`, c, known);
  const startRaw = raw.start ?? (typeof raw.start_hint === "string" ? { hint: raw.start_hint } : undefined);
  let momentum: EncounterDef["momentum"] = null;
  if (raw.momentum !== undefined && raw.momentum !== false) {
    const m: Raw = isObj(raw.momentum) ? raw.momentum : {};
    const swing: Record<Tier, number> = { crit_success: 40, success: 25, partial: 10, fail: -20, crit_fail: -35 };
    if (isObj(m.swing)) for (const [k, v] of Object.entries(m.swing)) {
      const tier = TIER_KEYS[k];
      if (tier) swing[tier] = c.num(v, `${w} › momentum › swing › ${k}`, swing[tier]);
      else c.warn(`${w} › momentum › swing › ${k}`, "tiers are crit_success, success, partial, fail, crit_fail");
    }
    const win = typeof m.win === "string" ? m.win : "won";
    const lose = typeof m.lose === "string" ? m.lose : "lost";
    momentum = { win, lose, start: Math.max(-99, Math.min(99, c.num(m.start, `${w} › momentum › start`, 0))), swing };
  }
  return {
    id,
    name: typeof raw.name === "string" ? raw.name : titleCase(id),
    desc: typeof raw.desc === "string" ? raw.desc : undefined,
    tags: list(raw.tags).map((t) => t.toLowerCase()),
    foe: { name: typeof foeRaw.name === "string" ? foeRaw.name : "Opponent", stats, armor: foeArmor(foeRaw, stats, w, c) },
    actions, actionOrder, foeMoves, endWhen, outcomes,
    roundLimit: Math.max(1, Math.min(200, Math.round(c.num(raw.round_limit ?? raw.max_rounds, `${w} › round_limit`, 20)))),
    timeoutOutcome: typeof raw.timeout_outcome === "string" && raw.timeout_outcome.trim() ? raw.timeout_outcome.trim() : momentum?.lose ?? "lost",
    start: normEffect(startRaw, `${w} › start`, c, known),
    momentum,
    fromStory: raw.from_story !== false,
    narrate: raw.narrate === true || raw.narrate === "rounds",
    ...(typeof raw.goal === "string" ? { goal: raw.goal } : {}),
    ...(typeof raw.danger === "string" ? { danger: raw.danger } : {}),
    labels: Object.fromEntries(Object.entries(isObj(raw.labels) ? raw.labels : {}).filter(([, v]) => typeof v === "string")) as Record<string, string>,
  };
}

function foeArmor(foeRaw: Raw, stats: FoeStatDef[], w: string, c: Ctx): Record<string, number> {
  const armor = armorMap(foeRaw.armor ?? foeRaw.defense, `${w} › foe › armor`, c);
  for (const k of Object.keys(armor)) {
    if (k !== "_" && !stats.some((x) => x.id === k)) { c.warn(`${w} › foe › armor`, `"${k}" isn't one of the foe's stats`); delete armor[k]; }
  }
  return armor;
}

const QUEST_META = new Set(["from_story", "story", "story_max", "max_story"]);

/** `quests:` — things to do for someone (or for yourself), with goals, a deadline, a reward and a price for failing. */
function normQuests(raw: unknown, c: Ctx, known: { stats: Set<string> }, ids: { encounters: Set<string>; actions: Set<string> }): { quests: Record<string, QuestDef>; order: string[]; story: Ruleset["storyQuests"] } {
  const quests: Record<string, QuestDef> = {};
  const order: string[] = [];
  const r: Raw = isObj(raw) ? raw : {};
  if (raw !== undefined && !isObj(raw)) c.warn("Quests", "should be a map of quest ids to quests");
  const storyRaw = r.from_story ?? r.story;
  const story = { enabled: storyRaw !== false, max: Math.max(0, Math.round(c.num(r.story_max ?? r.max_story, "Quests › story_max", 3))) };
  let n = 0;
  for (const [id, qRaw] of Object.entries(r)) {
    if (QUEST_META.has(id)) continue;
    const w = `Quests › ${id}`;
    if (!isObj(qRaw)) { c.warn(w, "expected a quest (name, goals, reward…)"); continue; }
    const q = qRaw;
    const goals: QuestGoal[] = [];
    const goalList: [string, unknown][] = Array.isArray(q.goals ?? q.objectives)
      ? (q.goals ?? q.objectives).map((g: unknown, i: number) => [isObj(g) && typeof g.id === "string" ? g.id : `goal_${i + 1}`, g] as [string, unknown])
      : isObj(q.goals ?? q.objectives) ? Object.entries(q.goals ?? q.objectives) : [];
    for (const [gid, g] of goalList) {
      const gw = `${w} › goals › ${gid}`;
      const gr: Raw = isObj(g) ? g : { text: String(g) };
      const when = gr.when !== undefined ? c.expr(gr.when, `${gw} › when`) : undefined;
      const count = gr.count !== undefined ? Math.max(1, Math.round(c.num(gr.count, `${gw} › count`, 1))) : undefined;
      // on: wolves (an encounter, or an action) — or { encounter: wolves, outcome: [won] } / { action: cook, tier: [success] }.
      let on: QuestGoal["on"];
      if (gr.on !== undefined) {
        const o: Raw = isObj(gr.on) ? gr.on : { id: gr.on };
        const id = String(o.encounter ?? o.action ?? o.id ?? "");
        const kind = o.encounter !== undefined ? "encounter" : o.action !== undefined ? "action" : ids.encounters.has(id) ? "encounter" : "action";
        if (kind === "encounter" ? !ids.encounters.has(id) : !ids.actions.has(id)) c.warn(`${gw} › on`, `"${id}" isn't ${kind === "encounter" ? "an encounter" : "an action or encounter"}`);
        else on = { kind, id, outcomes: list(o.outcome ?? o.outcomes ?? o.tier ?? o.tiers) };
      }
      goals.push({
        id: gid,
        text: typeof gr.text === "string" ? gr.text : typeof gr.label === "string" ? gr.label : titleCase(gid),
        ...(when !== undefined ? { when: String(when) } : {}),
        // A goal with neither a formula nor a count is a single step: progress or the story ticks it off.
        ...(when === undefined ? { count: count ?? 1 } : count !== undefined ? { count } : {}),
        optional: gr.optional === true,
        ...(on ? { on } : {}),
      });
    }
    const judgeRaw = q.judge ?? q.judged;
    const judge: QuestDef["judge"] = typeof judgeRaw === "string" ? { done: judgeRaw }
      : isObj(judgeRaw) ? { ...(typeof judgeRaw.done === "string" ? { done: judgeRaw.done } : {}), ...(typeof judgeRaw.fail === "string" ? { fail: judgeRaw.fail } : {}) } : {};
    const succeed = q.succeed ?? q.done_when ?? q.complete_when;
    const fail = q.fail ?? q.fail_when;
    const when = q.when !== undefined ? c.expr(q.when, `${w} › when`) : undefined;
    const succeedX = succeed !== undefined ? c.expr(succeed, `${w} › succeed`) : undefined;
    const failX = fail !== undefined ? c.expr(fail, `${w} › fail`) : undefined;
    const giver = typeof q.giver === "string" ? q.giver : typeof q.from === "string" ? q.from : undefined;
    const rem = q.remember;
    const remember: QuestDef["remember"] = rem === false ? false
      : isObj(rem) ? { ...(typeof rem.done === "string" ? { done: rem.done } : {}), ...(typeof rem.failed === "string" ? { failed: rem.failed } : typeof rem.fail === "string" ? { failed: rem.fail } : {}) } : {};
    const repeat = q.repeat === true ? 0 : q.repeat === undefined || q.repeat === false ? null : Math.max(0, c.num(q.repeat, `${w} › repeat`, 0));
    if (!goals.length && succeedX === undefined && !judge.done) c.warn(w, "has no goals, `succeed:` or `judge:` — only a `quest: { " + id + ": done }` effect can finish it");
    quests[id] = {
      id,
      name: typeof q.name === "string" ? q.name : titleCase(id),
      ...(typeof q.desc === "string" ? { desc: q.desc } : {}),
      kind: typeof q.kind === "string" ? q.kind.toLowerCase() : giver ? "favour" : "quest",
      ...(giver ? { giver } : {}),
      board: q.board === true,
      at: list(q.at),
      ...(when !== undefined ? { when: String(when) } : {}),
      auto: q.auto === true,
      goals,
      ...(succeedX !== undefined ? { succeed: String(succeedX) } : {}),
      ...(failX !== undefined ? { fail: String(failX) } : {}),
      judge,
      days: Math.max(0, c.num(q.days ?? q.deadline, `${w} › days`, 0)),
      report: q.report === undefined ? !!giver || q.board === true : q.report === true,
      start: normEffect(q.start ?? q.on_start, `${w} › start`, c, known),
      reward: normEffect(q.reward ?? q.rewards ?? q.success, `${w} › reward`, c, known),
      failure: normEffect(q.failure ?? q.on_fail ?? q.penalty, `${w} › failure`, c, known),
      remember,
      repeat,
      hidden: q.hidden === true,
      ...(typeof q.stakes === "string" ? { stakes: q.stakes } : {}),
      order: n++,
    };
    order.push(id);
  }
  return { quests, order, story };
}

function normSecrets(raw: unknown, c: Ctx): Record<string, SecretDef> {
  const out: Record<string, SecretDef> = {};
  if (raw === undefined) return out;
  if (!isObj(raw)) { c.warn("Secrets", "should be a map of secret names to definitions"); return out; }
  for (const [id, sRaw] of Object.entries(raw)) {
    const w = `Secrets › ${id}`;
    const r: Raw = isObj(sRaw) ? sRaw : typeof sRaw === "string" ? { stages: [sRaw] } : {};
    const stages: SecretStage[] = [];
    // `cue:` is stage 0 — behaviour without a reason, known from the start.
    if (typeof r.cue === "string") stages.push({ text: r.cue, lore: [] });
    const stageList: unknown[] = Array.isArray(r.stages) ? r.stages : typeof r.text === "string" ? [{ text: r.text, when: r.when, lore: r.lore }] : [];
    stageList.forEach((st, i) => {
      const sw = `${w} › stage ${i + 1}`;
      const sr: Raw = isObj(st) ? st : typeof st === "string" ? { text: st } : {};
      if (typeof sr.text !== "string" || !sr.text.trim()) { c.warn(sw, "each stage needs `text:`"); return; }
      const when = sr.when !== undefined ? c.expr(sr.when, `${sw} › when`) : undefined;
      stages.push({ text: sr.text, lore: list(sr.lore), ...(when !== undefined ? { when: String(when) } : {}) });
    });
    if (!stages.length) { c.warn(w, "has no stages — add `cue:` and/or `stages:`"); continue; }
    const tell = r.tell === true || r.tell === "exists" ? "exists" : "none";
    out[id] = { id, about: typeof r.about === "string" ? r.about : titleCase(id), tell, stages };
  }
  return out;
}

function normFronts(raw: unknown, c: Ctx, known: { stats: Set<string> }, where: (id: string) => string = (id) => `Fronts › ${id}`): Record<string, FrontDef> {
  const out: Record<string, FrontDef> = {};
  if (raw === undefined) return out;
  if (!isObj(raw)) { c.warn("Fronts", "should be a map of front names to definitions"); return out; }
  for (const [id, fRaw] of Object.entries(raw)) {
    const w = where(id);
    if (!isObj(fRaw)) { c.warn(w, "expected a front definition with `per_day:` and `stages:`"); continue; }
    const max = Math.max(1, c.num(fRaw.max, `${w} › max`, 100));
    const start = Math.max(0, Math.min(max, c.num(fRaw.start, `${w} › start`, 0)));
    const rate = c.expr(fRaw.per_day ?? fRaw.rate ?? 0, `${w} › per_day`) ?? 0;
    const perTurn = c.expr(fRaw.per_turn ?? 0, `${w} › per_turn`) ?? 0;
    const when = fRaw.when !== undefined ? c.expr(fRaw.when, `${w} › when`) : undefined;
    const raws: Raw[] = [];
    (Array.isArray(fRaw.stages) ? fRaw.stages : []).forEach((st: unknown, i: number) => {
      if (!isObj(st)) { c.warn(`${w} › stage ${i + 1}`, "each stage needs `at:` and a `surface:`"); return; }
      raws.push(st);
    });
    raws.sort((a, b) => Number(a.at) - Number(b.at));
    const stages: FrontStage[] = [];
    let prev = start;
    raws.forEach((st, i) => {
      const sw = `${w} › stage ${i + 1}`;
      const at = c.num(st.at, `${sw} › at`, NaN);
      if (!Number.isFinite(at)) { c.warn(sw, "needs a numeric `at:` (the clock value where it surfaces)"); return; }
      if (at > max) c.warn(sw, `at ${at} is above the clock's max (${max}) — it can never surface`);
      const str = (k: string) => (typeof st[k] === "string" && st[k].trim() ? (st[k] as string) : undefined);
      stages.push({
        at,
        hintAt: st.hint_at !== undefined ? c.num(st.hint_at, `${sw} › hint_at`, at) : prev + (at - prev) / 2,
        hint: str("hint"), backstage: str("backstage"), surface: str("surface"), news: str("news"),
        effects: normEffect(st.do ?? st.effects, `${sw} › do`, c, known),
      });
      prev = at;
    });
    if (!stages.length) c.warn(w, "has no stages — nothing will ever surface");
    const pushes: FrontDef["pushes"] = [];
    const story = fRaw.story ?? fRaw.pushed_by;
    if (isObj(story)) for (const [scene, n] of Object.entries(story)) pushes.push({ scene, add: c.num(n, `${w} › story › ${scene}`, 0) });
    else if (Array.isArray(story)) story.forEach((p: unknown, i: number) => {
      if (isObj(p) && typeof (p.if ?? p.when_scene) === "string") pushes.push({ scene: String(p.if ?? p.when_scene), add: c.num(p.add, `${w} › story #${i + 1}`, 0) });
      else c.warn(`${w} › story #${i + 1}`, "expected `{ if: \"plain-language event\", add: 10 }`");
    });
    out[id] = {
      id, label: typeof fRaw.label === "string" ? fRaw.label : titleCase(id),
      rate, perTurn, max, start, stages, pushes,
      ...(when !== undefined ? { when: String(when) } : {}),
    };
  }
  return out;
}

function normRandomEvents(raw: unknown, c: Ctx, known: { stats: Set<string> }): RandomEventsDef {
  const def: RandomEventsDef = { enabled: false, perDay: 25, perTurn: 0, jitter: 0.3, restDays: 1, omenAt: 80, events: {} };
  if (raw === undefined || raw === false) return def;
  if (!isObj(raw)) { c.warn("Random events", "should be a map with `events:`"); return def; }
  const pace: Raw = isObj(raw.pace) ? raw.pace : raw;
  def.perDay = c.expr(pace.per_day ?? def.perDay, "Random events › per_day") ?? def.perDay;
  def.perTurn = c.expr(pace.per_turn ?? 0, "Random events › per_turn") ?? 0;
  def.jitter = Math.max(0, Math.min(0.9, c.num(pace.jitter, "Random events › jitter", def.jitter)));
  def.restDays = Math.max(0, c.num(pace.rest_days ?? pace.cooldown, "Random events › rest_days", def.restDays));
  def.omenAt = Math.max(0, Math.min(99, c.num(pace.omen_at, "Random events › omen_at", def.omenAt)));
  const evRaw = isObj(raw.events) ? raw.events : isObj(raw.list) ? raw.list : {};
  for (const [id, e] of Object.entries(evRaw)) {
    const w = `Random events › ${id}`;
    const r: Raw = isObj(e) ? e : typeof e === "string" ? { text: e } : {};
    if (typeof r.text !== "string" || !r.text.trim()) { c.warn(w, "needs `text:` — what happens, for the narrator"); continue; }
    const when = r.when !== undefined ? c.expr(r.when, `${w} › when`) : undefined;
    def.events[id] = {
      id,
      label: typeof r.label === "string" ? r.label : titleCase(id),
      weight: Math.max(0, c.num(r.weight, `${w} › weight`, 1)),
      cooldownDays: Math.max(0, c.num(r.cooldown, `${w} › cooldown`, 3)),
      text: r.text,
      ...(typeof r.omen === "string" && r.omen.trim() ? { omen: r.omen } : {}),
      ...(typeof r.news === "string" ? { news: r.news } : {}),
      ...(when !== undefined ? { when: String(when) } : {}),
      effects: normEffect(r.do ?? r.effects, `${w} › do`, c, known),
    };
  }
  def.enabled = Object.keys(def.events).length > 0;
  if (!def.enabled) c.warn("Random events", "has no events — add some under `events:`");
  return def;
}

function normLiveChoices(raw: unknown, c: Ctx, known: { stats: Set<string> }): LiveChoicesDef {
  const def: LiveChoicesDef = { enabled: false, label: "Right now", count: 3, tags: {} };
  if (raw === undefined || raw === false) return def;
  if (!isObj(raw)) { c.warn("Live choices", "should be a map with `tags:`"); return def; }
  def.label = typeof raw.label === "string" ? raw.label : def.label;
  def.count = Math.max(1, Math.min(6, Math.round(c.num(raw.count, "Live choices › count", def.count))));
  if (raw.when !== undefined) { const x = c.expr(raw.when, "Live choices › when"); if (x !== undefined) def.when = String(x); }
  if (typeof raw.guide === "string") def.guide = raw.guide;
  let i = 0;
  for (const [id, t] of Object.entries(isObj(raw.tags) ? raw.tags : {})) {
    const a = normAction(id, typeof t === "string" ? { desc: t } : t, `Live choices › tags › ${id}`, c, known, i++);
    if (!a) continue;
    if (!a.desc) c.warn(`Live choices › tags › ${id}`, "add `desc:` — it tells the writer when to use this tag");
    def.tags[id] = a;
  }
  def.enabled = Object.keys(def.tags).length > 0;
  if (!def.enabled) c.warn("Live choices", "has no tags — add some under `tags:`");
  return def;
}

function normMind(raw: unknown, c: Ctx): MindDef {
  const def: MindDef = { overrides: [], perception: [] };
  if (raw === undefined) return def;
  if (!isObj(raw)) { c.warn("Mind", "should be a map with `overrides:` and/or `perception:`"); return def; }
  for (const [id, o] of Object.entries(isObj(raw.overrides) ? raw.overrides : {})) {
    const w = `Mind › overrides › ${id}`;
    if (!isObj(o)) { c.warn(w, "expected `when:`, `chance:` and `do:`"); continue; }
    const when = c.expr(o.when ?? true, `${w} › when`);
    const chance = c.expr(o.chance ?? 100, `${w} › chance`);
    if (when === undefined || chance === undefined) continue;
    const act = typeof o.do === "string" ? o.do : "fail";
    def.overrides.push({
      id, when: String(when), chance, on: list(o.on).map((x) => x.toLowerCase()), do: act,
      cause: typeof o.cause === "string" ? o.cause : titleCase(id),
      ...(typeof o.text === "string" ? { text: o.text } : {}),
    });
  }
  const per = Array.isArray(raw.perception) ? raw.perception : [];
  per.forEach((p: unknown, i: number) => {
    const w = `Mind › perception #${i + 1}`;
    if (!isObj(p) || typeof p.text !== "string") { c.warn(w, "expected `{ when: ..., text: ... }`"); return; }
    const when = c.expr(p.when ?? true, `${w} › when`);
    if (when !== undefined) def.perception.push({ when: String(when), text: p.text });
  });
  return def;
}

const KEEP_FLAGS = ["codex", "feats", "perks", "secrets", "people", "dating", "deepest"] as const;
const KEEP_LISTS = ["stats", "flags", "items", "rel"] as const;

/** `keep: [codex, feats, { stats: [insight] }]` or `keep: { codex: true, stats: [insight] }`. */
export function normKeep(raw: unknown, where: string, c: Ctx, dflt: Partial<KeepSpec> = {}): KeepSpec {
  const k: KeepSpec = { codex: false, feats: false, perks: false, secrets: false, people: false, dating: false, deepest: false, stats: [], flags: [], items: [], rel: [], ...dflt };
  if (raw === undefined) return k;
  const entries: [string, unknown][] = Array.isArray(raw)
    ? raw.flatMap((x) => (isObj(x) ? Object.entries(x) : [[String(x), true] as [string, unknown]]))
    : isObj(raw) ? Object.entries(raw) : typeof raw === "string" ? [[raw, true]] : [];
  for (const [key, v] of entries) {
    if ((KEEP_FLAGS as readonly string[]).includes(key)) (k as unknown as Record<string, boolean>)[key] = v !== false;
    else if ((KEEP_LISTS as readonly string[]).includes(key)) (k as unknown as Record<string, string[]>)[key] = list(v);
    else c.warn(`${where} › ${key}`, `can keep ${[...KEEP_FLAGS, ...KEEP_LISTS].join(", ")}`);
  }
  return k;
}

function normCheckpoints(raw: unknown, endings: boolean, c: Ctx, known: { stats: Set<string> }): CheckpointsDef {
  const def: CheckpointsDef = { enabled: endings, slots: 3, keep: normKeep(undefined, "", c), auto: false, loop: null, hard: false };
  if (raw === undefined || raw === false) return def;
  def.enabled = true;
  if (!isObj(raw)) return def;
  def.slots = Math.max(0, Math.min(9, Math.round(c.num(raw.slots, "Checkpoints › slots", 3))));
  def.keep = normKeep(raw.keep, "Checkpoints › keep", c);
  def.auto = raw.auto === true || raw.auto === "day";
  def.hard = raw.hard === true;
  if (isObj(raw.loop)) {
    const when = c.expr(raw.loop.when, "Checkpoints › loop › when");
    if (when === undefined) c.warn("Checkpoints › loop", "needs `when:` — the moment the day rewinds");
    else def.loop = {
      when: String(when),
      to: raw.loop.to !== undefined ? String(raw.loop.to) : def.auto ? "auto" : "start",
      text: typeof raw.loop.text === "string" ? raw.loop.text : "Time rewinds. Only {{user}} remembers what happened.",
      effects: normEffect(raw.loop.do ?? raw.loop.effects, "Checkpoints › loop › do", c, known),
    };
  }
  return def;
}

function normEndings(raw: unknown, c: Ctx): Record<string, EndingDef> {
  const out: Record<string, EndingDef> = {};
  for (const [id, e] of Object.entries(isObj(raw) ? raw : {})) {
    const w = `Endings › ${id}`;
    if (!isObj(e)) { c.warn(w, "needs `when:` and `text:`"); continue; }
    const when = c.expr(e.when, `${w} › when`);
    if (when === undefined) { c.warn(w, "needs `when:` — the formula that ends the story"); continue; }
    out[id] = {
      id, when: String(when),
      title: typeof e.title === "string" ? e.title : titleCase(id),
      kind: e.kind === "good" || e.kind === "bad" ? e.kind : "neutral",
      text: typeof e.text === "string" ? e.text : "",
    };
  }
  return out;
}

function normBody(raw: unknown, c: Ctx): BodyDef {
  const def: BodyDef = { enabled: false, narrator: true, open: true, parts: {}, hiddenBy: {}, transforms: {} };
  if (raw === undefined || raw === false) return def;
  if (!isObj(raw)) { c.warn("Body", "should be a map with `parts:`"); return def; }
  def.enabled = true;
  def.narrator = raw.narrator !== false;
  def.open = raw.open !== false;
  for (const [part, traits] of Object.entries(normTraits(raw.parts ?? {}, "Body › parts", c))) {
    def.parts[part] = Object.fromEntries(Object.entries(traits).filter(([, v]) => v !== null)) as Record<string, string>;
  }
  if (isObj(raw.hidden_by)) for (const [part, slots] of Object.entries(raw.hidden_by)) def.hiddenBy[part] = list(slots);
  for (const [id, t] of Object.entries(isObj(raw.transforms) ? raw.transforms : {})) {
    const w = `Body › transforms › ${id}`;
    if (!isObj(t) || !Array.isArray(t.stages) || !t.stages.length) { c.warn(w, "needs `stages:` — a list of `{ set: { part: { trait: value } }, text }`"); continue; }
    const chance = c.expr(t.chance ?? 100, `${w} › chance`) ?? 100;
    const stages = (t.stages as unknown[]).map((st, i) => {
      const sr: Raw = isObj(st) ? st : {};
      return { set: normTraits(sr.set ?? {}, `${w} › stage ${i + 1}`, c), ...(typeof sr.text === "string" ? { text: sr.text } : {}) };
    });
    def.transforms[id] = { id, label: typeof t.label === "string" ? t.label : titleCase(id), chance, stages };
  }
  return def;
}

function normCompanions(raw: unknown, c: Ctx, known: { stats: Set<string> }, fronts: Record<string, FrontDef>, bonds: Record<string, Record<string, number>>): Record<string, CompanionDef> {
  const out: Record<string, CompanionDef> = {};
  for (const [id, cr] of Object.entries(isObj(raw) ? raw : {})) {
    const w = `Companions › ${id}`;
    if (!isObj(cr)) { c.warn(w, "expected `goal:`, `arc:`, `daily:`…"); continue; }
    let arc: string | null = null;
    if (isObj(cr.arc)) {
      const f = normFronts({ [`arc_${id}`]: { label: `${titleCase(id)}'s arc`, ...cr.arc } }, c, known, () => `${w} › arc`);
      const def = f[`arc_${id}`];
      if (def) {
        // An arc only runs once the player has met them.
        def.when = def.when ? `met('${id}') and (${def.when})` : `met('${id}')`;
        fronts[`arc_${id}`] = def;
        arc = `arc_${id}`;
      }
    }
    let daily: DecideSpec | null = null;
    if (isObj(cr.daily)) {
      // Inside a companion's own choice, `arc: +5` and `bond: { dex: +3 }` mean this companion.
      const d: Raw = { ...cr.daily, options: Object.fromEntries(Object.entries(isObj(cr.daily.options) ? cr.daily.options : {}).map(([oid, o]) => {
        if (!isObj(o)) return [oid, o];
        const x: Raw = { ...o };
        if (x.arc !== undefined && !isObj(x.arc)) x.arc = { [id]: x.arc };
        if (isObj(x.bond) && !Object.values(x.bond).some(isObj)) x.bond = { [id]: x.bond };
        return [oid, x];
      })) };
      daily = normDecide(d, `${w} › daily`, c, known)[0] ?? null;
      if (daily) daily = { ...daily, id: `companion_${id}_daily` };
    }
    if (isObj(cr.bonds)) {
      bonds[id] = {};
      for (const [b, n] of Object.entries(cr.bonds)) bonds[id][b] = Math.max(-100, Math.min(100, c.num(n, `${w} › bonds › ${b}`, 0)));
    }
    out[id] = {
      id, arc, daily,
      ...(typeof cr.goal === "string" ? { goal: cr.goal } : {}),
      jealousOf: list(cr.jealous_of ?? cr.jealous),
      knows: list(cr.knows),
    };
  }
  return out;
}

const CHILD_NAMES = ["Ada", "Ben", "Cleo", "Dan", "Elin", "Finn", "Greta", "Hugo", "Iris", "Jonah", "Kira", "Leo", "Maya", "Nico", "Orla", "Pip", "Rosa", "Sam", "Tess", "Theo", "Uma", "Vic", "Wren", "Zoe"];

function normLineage(raw: unknown, c: Ctx, known: { stats: Set<string> }): LineageDef {
  const def: LineageDef = { enabled: false, weeks: 36, stages: [], speed: 1, joinAt: 18, inherit: [], names: CHILD_NAMES };
  if (raw === undefined || raw === false) return def;
  const r: Raw = isObj(raw) ? raw : {};
  def.enabled = true;
  const preg: Raw = isObj(r.pregnancy) ? r.pregnancy : r;
  def.weeks = Math.max(1, c.num(preg.weeks, "Lineage › weeks", 36));
  (Array.isArray(preg.stages) ? preg.stages : []).forEach((st: unknown, i: number) => {
    if (!isObj(st) || typeof st.text !== "string") { c.warn(`Lineage › stage ${i + 1}`, "needs `week:` and `text:`"); return; }
    def.stages.push({ week: c.num(st.week, `Lineage › stage ${i + 1} › week`, 1), text: st.text, effects: normEffect(st.do ?? st.effects, `Lineage › stage ${i + 1} › do`, c, known) });
  });
  def.stages.sort((a, b) => a.week - b.week);
  const kids: Raw = isObj(r.children) ? r.children : r;
  def.speed = Math.max(0.01, c.num(kids.speed, "Lineage › children › speed", 1));
  def.joinAt = Math.max(18, c.num(kids.join_at, "Lineage › children › join_at", 18));
  def.inherit = list(kids.inherit);
  if (Array.isArray(kids.names) && kids.names.length) def.names = kids.names.map(String);
  return def;
}

function normObligations(raw: unknown, c: Ctx, known: { stats: Set<string> }, money: string | undefined): Record<string, ObligationDef> {
  const out: Record<string, ObligationDef> = {};
  for (const [id, o] of Object.entries(isObj(raw) ? raw : {})) {
    const w = `Obligations › ${id}`;
    if (!isObj(o)) { c.warn(w, "needs `amount:` and `every:`"); continue; }
    const amount = c.expr(o.amount ?? 0, `${w} › amount`) ?? 0;
    const payWith = typeof o.pay_with === "string" ? o.pay_with : money;
    if (!payWith) { c.warn(w, "needs `pay_with:` (a stat) — the ruleset has no money stat"); continue; }
    const every = Math.max(0, c.num(o.every, `${w} › every`, 7));
    let late: DecideSpec | null = null;
    if (isObj(o.late)) late = normDecide({ ask: o.late.ask ?? `${titleCase(id)} is overdue. What happens?`, options: o.late.options ?? o.late }, `${w} › late`, c, known)[0] ?? null;
    out[id] = {
      id, label: typeof o.label === "string" ? o.label : titleCase(id), amount, every,
      first: Math.max(0, c.num(o.first, `${w} › first`, every || 7)),
      payWith, grace: Math.max(0, c.num(o.grace, `${w} › grace`, 1)), at: list(o.at),
      late: late ? { ...late, id: `due_${id}_late` } : null,
      ...(typeof o.creditor === "string" ? { creditor: o.creditor } : {}),
    };
  }
  return out;
}

function normJobs(raw: unknown, c: Ctx, known: { stats: Set<string> }): Record<string, JobDef> {
  const out: Record<string, JobDef> = {};
  for (const [id, j] of Object.entries(isObj(raw) ? raw : {})) {
    const w = `Jobs › ${id}`;
    if (!isObj(j)) { c.warn(w, "needs `patrons:` and `styles:`"); continue; }
    const styles: Record<string, string> = {};
    for (const [k, v] of Object.entries(isObj(j.styles) ? j.styles : {})) styles[k] = typeof v === "string" ? v : titleCase(k);
    if (!Object.keys(styles).length) Object.assign(styles, { quick: "Serve them quickly", friendly: "Be warm and chatty", careful: "Take care to get it exactly right" });
    const patrons: { who: string; want: string }[] = [];
    (Array.isArray(j.patrons) ? j.patrons : []).forEach((p: unknown, i: number) => {
      const pr: Raw = isObj(p) ? p : typeof p === "string" ? { who: p } : {};
      if (typeof pr.who !== "string") { c.warn(`${w} › patrons #${i + 1}`, "needs `who:`"); return; }
      const want = typeof pr.want === "string" ? pr.want : Object.keys(styles)[0];
      if (!styles[want]) c.warn(`${w} › patrons #${i + 1}`, `wants "${want}", which isn't one of the styles (${Object.keys(styles).join(", ")})`);
      patrons.push({ who: pr.who, want });
    });
    if (!patrons.length) { c.warn(w, "needs `patrons:` — who comes in, and what they want"); continue; }
    const when = j.when !== undefined ? c.expr(j.when, `${w} › when`) : undefined;
    out[id] = {
      id, label: typeof j.label === "string" ? j.label : `Work: ${titleCase(id)}`,
      at: list(j.at), customers: Math.max(1, Math.min(8, Math.round(c.num(j.customers, `${w} › customers`, 3)))),
      pay: c.expr(j.pay ?? 0, `${w} › pay`) ?? 0, tip: c.expr(j.tip ?? 0, `${w} › tip`) ?? 0,
      gain: normEffect(j.gain ?? j.effects, `${w} › gain`, c, known),
      minutes: Math.max(0, c.num(j.minutes, `${w} › minutes`, 45)),
      patrons, styles,
      ...(typeof j.skill === "string" ? { skill: j.skill } : {}),
      ...(when !== undefined ? { when: String(when) } : {}),
    };
  }
  return out;
}

function normObservers(raw: unknown, c: Ctx, known: { stats: Set<string> }): ObserversDef {
  const def: ObserversDef = { enabled: false, when: "exposed > 0", crowd: 2, reactions: {}, rumours: true };
  if (raw === undefined || raw === false) return def;
  const r: Raw = isObj(raw) ? raw : {};
  def.enabled = true;
  if (r.when !== undefined) { const x = c.expr(r.when, "Observers › when"); if (x !== undefined) def.when = String(x); }
  def.crowd = Math.max(0, Math.min(6, Math.round(c.num(r.crowd, "Observers › crowd", 2))));
  def.rumours = r.rumours !== false;
  for (const [k, v] of Object.entries(isObj(r.reactions) ? r.reactions : {})) {
    if (!(SEEN_REACTIONS as string[]).includes(k)) { c.warn(`Observers › reactions › ${k}`, `reactions are ${SEEN_REACTIONS.join(", ")}`); continue; }
    def.reactions[k as SeenReaction] = normEffect(v, `Observers › reactions › ${k}`, c, known);
  }
  return def;
}

function normImprovise(raw: unknown, c: Ctx, known: { stats: Set<string> }, stats: Record<string, StatDef>, order: string[]): ImproviseDef {
  const usable = order.filter((id) => stats[id].kind === "skill" || stats[id].kind === "attribute");
  const def: ImproviseDef = { enabled: true, dc: { easy: 8, fair: 12, hard: 16, extreme: 20 }, bonus: 10, partial: 3, stats: usable, outcomes: {} };
  if (raw === undefined || raw === true) return def;
  if (raw === false) return { ...def, enabled: false };
  if (!isObj(raw)) { c.warn("Improvise", "expected `improvise: false` or a map of settings"); return def; }
  if (raw.enabled === false) def.enabled = false;
  if (isObj(raw.dc)) for (const d of DIFFICULTIES) if (raw.dc[d] !== undefined) def.dc[d] = c.num(raw.dc[d], `Improvise › dc › ${d}`, def.dc[d]);
  def.bonus = c.num(raw.bonus, "Improvise › bonus", 10);
  def.partial = Math.max(0, c.num(raw.partial, "Improvise › partial", 3));
  if (raw.stats !== undefined) {
    const want = list(raw.stats);
    for (const id of want) if (!stats[id]) c.warn("Improvise › stats", `"${id}" isn't a stat`);
    def.stats = want.filter((id) => stats[id]);
  }
  if (raw.time !== undefined) def.time = Math.max(0, c.num(raw.time, "Improvise › time", 10));
  if (isObj(raw.outcomes)) for (const [k, v] of Object.entries(raw.outcomes)) {
    const tier = TIER_KEYS[k];
    if (tier) def.outcomes[tier] = normEffect(v, `Improvise › outcomes › ${k}`, c, known);
    else c.warn(`Improvise › outcomes › ${k}`, "tiers are crit_success, success, partial, fail, crit_fail");
  }
  return def;
}

function normGrowth(raw: unknown, c: Ctx): GrowthDef {
  const def: GrowthDef = { enabled: true, rate: 1, attributes: 0.5, train: true };
  if (raw === undefined || raw === true) return def;
  if (raw === false) return { ...def, enabled: false };
  if (typeof raw === "number") return { ...def, rate: Math.max(0, raw), enabled: raw > 0 };
  if (!isObj(raw)) { c.warn("Growth", "expected `growth: false`, a speed, or a map of settings"); return def; }
  if (raw.enabled === false) def.enabled = false;
  def.rate = Math.max(0, c.num(raw.rate, "Growth › rate", 1));
  def.attributes = Math.max(0, c.num(raw.attributes, "Growth › attributes", 0.5));
  def.train = raw.train !== false;
  return def;
}

function normDiscovery(raw: unknown, c: Ctx): DiscoveryDef {
  const def: DiscoveryDef = { enabled: false, at: [], chance: 25, max: 12, time: 60, label: "Explore around here" };
  if (raw === undefined || raw === false) return def;
  const r: Raw = isObj(raw) ? raw : {};
  def.enabled = true;
  def.at = list(r.at);
  def.chance = c.expr(r.chance ?? 25, "Discovery › chance") ?? 25;
  def.max = Math.max(0, Math.round(c.num(r.max, "Discovery › max", 12)));
  def.time = Math.max(0, c.num(r.time, "Discovery › time", 60));
  if (typeof r.label === "string") def.label = r.label;
  if (typeof r.guide === "string") def.guide = r.guide;
  return def;
}

const SEXUAL_TAGS = new Set(["sexual", "sex", "nsfw", "lewd", "explicit", "erotic", "smut"]);

export function normalizeRuleset(raw: unknown): { ruleset: Ruleset | null; issues: Issue[] } {
  const c = new Ctx();
  if (!isObj(raw)) {
    c.err("Ruleset", "is empty or isn't a YAML map");
    return { ruleset: null, issues: c.issues };
  }

  const weekdays = Array.isArray(raw.clock?.weekdays) ? raw.clock.weekdays.map(String) : DEFAULT_WEEKDAYS;

  // Stats first — effects use their names for shorthand.
  const stats: Record<string, StatDef> = {};
  const statOrder: string[] = [];
  if (raw.stats !== undefined && !isObj(raw.stats)) c.err("Stats", "should be a map of stat names to definitions");
  for (const [id, def] of Object.entries(isObj(raw.stats) ? raw.stats : {})) {
    const s = normStat(id, def, `Stats › ${id}`, c);
    if (s) { stats[id] = s; statOrder.push(id); }
  }
  const known = { stats: new Set(statOrder) };

  // Relationships
  const relRaw: Raw = isObj(raw.relationships) ? raw.relationships : isObj(raw.people) ? { people: raw.people } : {};
  const relStats: Record<string, StatDef> = {};
  const relStatOrder: string[] = [];
  for (const [id, def] of Object.entries(isObj(relRaw.stats) ? relRaw.stats : {})) {
    const s = normStat(id, def, `Relationships › stats › ${id}`, c, true);
    if (s) {
      if (s.start === s.max && (def as Raw)?.start === undefined) s.start = s.min; // relationships start low by default
      relStats[id] = s; relStatOrder.push(id);
    }
  }
  const people: Record<string, PersonDef> = {};
  for (const [id, p] of Object.entries(isObj(relRaw.people) ? relRaw.people : {})) {
    const r: Raw = isObj(p) ? p : typeof p === "string" ? { name: p } : {};
    const start: Record<string, number> = {};
    if (isObj(r.start)) for (const [s, v] of Object.entries(r.start)) start[s] = c.num(v, `Relationships › people › ${id} › start › ${s}`, 0);
    const schedule: ScheduleEntry[] = [];
    const sched = r.schedule ?? r.routine;
    const schedList: unknown[] = Array.isArray(sched) ? sched : typeof sched === "string" ? [{ at: sched }] : isObj(sched) ? Object.entries(sched).map(([at, when]) => ({ at, when })) : [];
    schedList.forEach((e, n) => {
      const sw = `Relationships › people › ${id} › schedule #${n + 1}`;
      if (!isObj(e) || typeof e.at !== "string") { c.warn(sw, "each schedule entry needs `at:` (a location) and optionally `when:`"); return; }
      const when = e.when === undefined || e.when === true ? undefined : c.expr(e.when, `${sw} › when`);
      schedule.push({ at: e.at, ...(when !== undefined ? { when: String(when) } : {}) });
    });
    people[id] = {
      id,
      name: typeof r.name === "string" ? r.name : titleCase(id),
      age: r.age !== undefined ? c.num(r.age, `Relationships › people › ${id} › age`, 0) : undefined,
      start,
      desc: typeof r.desc === "string" ? r.desc : undefined,
      schedule,
      traits: list(r.traits),
    };
  }

  // Items
  const invRaw: Raw = isObj(raw.inventory) ? raw.inventory : {};
  const items: Record<string, ItemDef> = {};
  for (const [id, it] of Object.entries(isObj(raw.items) ? raw.items : isObj(invRaw.items) ? invRaw.items : {})) {
    const r: Raw = isObj(it) ? it : typeof it === "string" ? { name: it } : {};
    const w = `Items › ${id}`;
    items[id] = {
      id,
      name: typeof r.name === "string" ? r.name : titleCase(id),
      desc: r.desc,
      tags: list(r.tags),
      ...(typeof r.slot === "string" ? { slot: r.slot } : {}),
      warmth: c.num(r.warmth, `${w} › warmth`, 0),
      integrity: Math.max(1, c.num(r.integrity, `${w} › integrity`, 100)),
      reveal: c.num(r.reveal, `${w} › reveal`, 0),
      traits: list(r.traits).map((t) => t.toLowerCase()),
      // `uses: 5` — five uses per item; a `consumable` tag means one.
      uses: Math.max(0, Math.round(c.num(r.uses ?? r.charges, `${w} › uses`, list(r.tags).map((t) => t.toLowerCase()).includes("consumable") ? 1 : 0))),
      keep: r.keep === true,
      bonus: {},
      armor: armorMap(r.armor, `${w} › armor`, c),
    };
    applyItemUse(items[id], r, w, c, known, false);
  }
  // `item_uses:` gives uses and bonuses to items declared elsewhere (Warp's drafted uses live here).
  for (const [id, u] of Object.entries(isObj(raw.item_uses) ? raw.item_uses : {})) {
    const it = items[id];
    if (!it) { c.warn(`Item uses › ${id}`, `"${id}" isn't a declared item`); continue; }
    if (!isObj(u)) continue;
    // The item's own definition wins over a drafted one.
    if (it.use || Object.keys(it.bonus).length) continue;
    // The entry is the use itself (plus optional bonus/keep), or has an explicit `use:`.
    const { bonus, keep, drafted, use, ...rest } = u;
    const raw: Raw = { bonus, keep, use: use ?? (Object.keys(rest).length ? rest : undefined) };
    applyItemUse(it, raw, `Item uses › ${id}`, c, known, drafted === true);
  }

  // Locations
  const locations: Record<string, LocationDef> = {};
  for (const [id, l] of Object.entries(isObj(raw.locations) ? raw.locations : {})) {
    const r: Raw = isObj(l) ? l : typeof l === "string" ? { name: l } : {};
    locations[id] = {
      id,
      name: typeof r.name === "string" ? r.name : titleCase(id),
      desc: typeof r.desc === "string" ? r.desc : undefined,
      exits: Array.isArray(r.exits) ? r.exits.map(String) : [],
      travel: c.num(r.travel, `Locations › ${id} › travel`, 10),
      indoors: r.indoors === true || r.inside === true,
      board: r.board === true || r.quest_board === true,
      ...(Array.isArray(r.pos) && r.pos.length === 2 && r.pos.every((n: unknown) => Number.isFinite(Number(n))) ? { pos: [Number(r.pos[0]), Number(r.pos[1])] as [number, number] } : {}),
    };
  }
  for (const l of Object.values(locations)) for (const x of l.exits) {
    if (!locations[x]) c.warn(`Locations › ${l.id} › exits`, `"${x}" isn't a declared location`);
  }

  // Conditions
  const conditions: Record<string, ConditionDef> = {};
  for (const [id, d] of Object.entries(isObj(raw.conditions) ? raw.conditions : {})) {
    const r: Raw = isObj(d) ? d : typeof d === "string" ? { label: d } : {};
    const gate = normGate(r, `Conditions › ${id}`, c);
    conditions[id] = {
      id,
      label: typeof r.label === "string" ? r.label : titleCase(id),
      tone: ["good", "warn", "bad", "neutral"].includes(r.tone) ? r.tone : "warn",
      desc: typeof r.desc === "string" ? r.desc : undefined,
      narrator: r.narrator === true,
      ...(gate ? { gate } : {}),
      bonus: statNums(r.bonus, `Conditions › ${id} › bonus`, c, known),
      ...condTiming(r, `Conditions › ${id}`, c, known),
    };
  }

  // Flags
  const flags: Record<string, FlagDef> = {};
  for (const [id, d] of Object.entries(isObj(raw.flags) ? raw.flags : {})) {
    const r: Raw = isObj(d) ? d : { start: d };
    const gate = normGate(r, `Flags › ${id}`, c);
    flags[id] = { id, label: r.label, narrator: r.narrator === true, start: r.start ?? false, ...(gate ? { gate } : {}) };
  }

  // Start
  const startRaw: Raw = isObj(raw.start) ? raw.start : {};
  const startItems: Record<string, number> = {};
  const si = startRaw.items ?? invRaw.start;
  if (isObj(si)) for (const [it, n] of Object.entries(si)) startItems[it] = c.num(n, `Start › items › ${it}`, 1);
  else if (Array.isArray(si)) for (const it of si) startItems[String(it)] = 1;
  if (isObj(startRaw.stats)) for (const [s, v] of Object.entries(startRaw.stats)) {
    if (stats[s]) stats[s].start = c.num(v, `Start › stats › ${s}`, stats[s].start);
    else c.warn(`Start › stats › ${s}`, "isn't a declared stat");
  }
  let startLocation: string | null = typeof startRaw.location === "string" ? startRaw.location : null;
  if (!startLocation && Object.keys(locations).length) startLocation = Object.keys(locations)[0];
  if (startLocation && Object.keys(locations).length && !locations[startLocation]) {
    c.warn("Start › location", `"${startLocation}" isn't a declared location`);
  }

  // Clock
  const clockRaw: Raw = isObj(raw.clock) ? raw.clock : {};
  const clockStartRaw = startRaw.time ?? clockRaw.start ?? "Mon 08:00";
  const clockStart = parseClockStart(clockStartRaw, weekdays);
  if (clockStart === null) c.warn("Clock › start", `"${clockStartRaw}" should look like "Mon 07:30" or "Day 1 07:30"`);
  const dateRaw = clockRaw.date ?? clockRaw.start_date ?? startRaw.date;
  const startDate = dateRaw === undefined ? null : parseDate(dateRaw);
  if (dateRaw !== undefined && !startDate) c.warn("Clock › date", `"${dateRaw}" should look like "Sep 4"`);

  const worldRaw = { weather: raw.weather, wardrobe: raw.wardrobe };
  const weather = normWeather(worldRaw.weather, c);
  const wardrobe = normWardrobe(worldRaw.wardrobe, items, c);

  // Actions
  const actions: Record<string, ActionDef> = {};
  const actionOrder: string[] = [];
  let i = 0;
  for (const [id, a] of Object.entries(isObj(raw.actions) ? raw.actions : {})) {
    const def = normAction(id, a, `Actions › ${id}`, c, known, i++);
    if (def) { actions[id] = def; actionOrder.push(id); }
  }
  actionOrder.sort((a, b) => actions[a].order - actions[b].order);
  for (const a of Object.values(actions)) for (const loc of a.at) {
    if (Object.keys(locations).length && !locations[loc]) c.warn(`Actions › ${a.id} › at`, `"${loc}" isn't a declared location`);
  }

  // Triggers
  const triggers: TriggerDef[] = [];
  const trigRaw = raw.triggers ?? raw.rules;
  const trigList: [string, unknown][] = Array.isArray(trigRaw)
    ? trigRaw.map((t, n) => [isObj(t) && typeof t.id === "string" ? t.id : `rule_${n + 1}`, t])
    : isObj(trigRaw) ? Object.entries(trigRaw) : [];
  for (const [id, t] of trigList) {
    const w = `Triggers › ${id}`;
    if (!isObj(t)) { c.warn(w, "expected `when:` and `do:`"); continue; }
    const when = t.when ?? t.if;
    const whenExpr = when !== undefined ? c.expr(when, `${w} › when`) : undefined;
    const whenScene = typeof t.when_scene === "string" ? t.when_scene : typeof t.scene === "string" ? t.scene : undefined;
    if (whenExpr === undefined && !whenScene) { c.err(w, "needs `when:` (a formula) or `when_scene:` (a plain-language condition)"); continue; }
    const effRaw = t.do ?? t.then ?? t.effects ?? {};
    const effects = normEffect(isObj(effRaw) ? { ...effRaw, ...(t.hint ? { hint: t.hint } : {}) } : effRaw, `${w} › do`, c, known);
    triggers.push({ id, when: whenExpr === undefined ? undefined : String(whenExpr), whenScene, repeat: t.repeat === true || t.every_turn === true, effects });
  }

  // HUD
  const hudRaw: Raw = isObj(raw.hud) ? raw.hud : {};
  const moneyStat = typeof hudRaw.money === "string" ? hudRaw.money : statOrder.find((s) => stats[s].kind === "money");
  const bars = Array.isArray(hudRaw.bars) ? hudRaw.bars.map(String).filter((b: string) => {
    if (!stats[b]) { c.warn("HUD › bars", `"${b}" isn't a declared stat`); return false; }
    return true;
  }) : statOrder.filter((s) => stats[s].kind === "meter");

  const narrRaw: Raw = isObj(raw.narration) ? raw.narration : {};
  const playerRaw: Raw = isObj(raw.player) ? raw.player : {};

  // Encounters, codex, feats, perks
  const encounters: Record<string, EncounterDef> = {};
  for (const [id, e] of Object.entries(isObj(raw.encounters) ? raw.encounters : {})) {
    const def = normEncounter(id, e, c, known);
    if (def) encounters[id] = def;
  }
  const codex: Record<string, CodexEntry> = {};
  for (const [id, e] of Object.entries(isObj(raw.codex) ? raw.codex : {})) {
    const w = `Codex › ${id}`;
    const r: Raw = isObj(e) ? e : typeof e === "string" ? { text: e } : {};
    const unlock = r.unlock !== undefined ? c.expr(r.unlock, `${w} › unlock`) : undefined;
    codex[id] = {
      id,
      title: typeof r.title === "string" ? r.title : titleCase(id),
      text: typeof r.text === "string" ? r.text : "",
      ...(typeof r.category === "string" ? { category: r.category } : {}),
      ...(unlock !== undefined ? { unlock: String(unlock) } : {}),
      lore: list(r.lore),
    };
  }
  const feats: Record<string, FeatDef> = {};
  for (const [id, f] of Object.entries(isObj(raw.feats) ? raw.feats : {})) {
    const w = `Feats › ${id}`;
    if (!isObj(f)) { c.warn(w, "a feat needs `unlock:` (a formula)"); continue; }
    const unlock = c.expr(f.unlock ?? f.when, `${w} › unlock`);
    if (unlock === undefined) { c.warn(w, "a feat needs `unlock:` (a formula)"); continue; }
    feats[id] = {
      id,
      name: typeof f.name === "string" ? f.name : titleCase(id),
      desc: typeof f.desc === "string" ? f.desc : "",
      unlock: String(unlock),
      reward: normEffect(f.reward, `${w} › reward`, c, known),
      hidden: f.hidden === true,
    };
  }
  // Abilities first: perks teach them.
  const abilities = normAbilities(raw.abilities, c, known);
  const perksRaw: Raw = isObj(raw.perks) ? raw.perks : {};
  const perkList: Raw = isObj(perksRaw.list) ? perksRaw.list : Object.fromEntries(Object.entries(perksRaw).filter(([k]) => !PERK_META.has(k)));
  const perks: Record<string, PerkDef> = {};
  for (const [id, p] of Object.entries(perkList)) {
    const w = `Perks › ${id}`;
    if (!isObj(p)) { c.warn(w, "expected a perk definition"); continue; }
    perks[id] = normPerk(id, p, w, c, known, abilities);
  }
  for (const p of Object.values(perks)) for (const x of p.excludes) if (!perks[x]) c.warn(`Perks › ${p.id} › excludes`, `"${x}" isn't a declared perk`);
  // An ability nothing teaches is known from the start, unless it says otherwise.
  const taught = new Set(Object.values(perks).flatMap((p) => p.abilities));
  for (const a of Object.values(abilities)) if (a.known === DEFAULT_KNOWN) a.known = !taught.has(a.id);
  const perkPoints = typeof perksRaw.points === "string" ? perksRaw.points : undefined;
  if (perkPoints && !stats[perkPoints]) c.warn("Perks › points", `"${perkPoints}" isn't a declared stat`);
  const perkPick = Math.max(0, Math.round(c.num(perksRaw.pick ?? perksRaw.offer, "Perks › pick", 0)));
  const { quests, order: questOrder, story: storyQuests } = normQuests(raw.quests, c, known, { encounters: new Set(Object.keys(encounters)), actions: new Set(Object.keys(actions)) });
  for (const q of Object.values(quests)) {
    const w = `Quests › ${q.id}`;
    if (q.giver && !people[q.giver]) c.warn(`${w} › giver`, `"${q.giver}" isn't a person in relationships › people`);
    for (const loc of q.at) if (Object.keys(locations).length && !locations[loc]) c.warn(`${w} › at`, `"${loc}" isn't a declared location`);
    if (q.board && !Object.values(locations).some((l) => l.board)) c.warn(`${w} › board`, "is posted on a board, but no location has `board: true`");
  }

  // Story machinery: secrets, hidden world clocks, random events, choices written for the moment.
  const secrets = normSecrets(raw.secrets, c);
  const fronts = normFronts(raw.fronts, c, known);
  const randomEvents = normRandomEvents(raw.random_events ?? raw.events, c, known);
  const liveChoices = normLiveChoices(raw.live_choices, c, known);
  const dungeons = normDungeons(raw.dungeons, c, known);
  // Dating adds its love and fear relationship stats if the ruleset doesn't have them.
  const dating = normDating(raw.dating, c, { stats: relStats, order: relStatOrder }, new Set(Object.keys(people)));
  const mind = normMind(raw.mind, c);
  const endingsRaw: Raw = isObj(raw.endings) ? raw.endings : {};
  const endings = normEndings(Object.fromEntries(Object.entries(endingsRaw).filter(([k]) => k !== "legacy")), c);
  const legacy = normKeep(endingsRaw.legacy, "Endings › legacy", c, { codex: true, feats: true, perks: true });
  const checkpoints = normCheckpoints(raw.checkpoints, Object.keys(endings).length > 0, c, known);
  const body = normBody(raw.body, c);
  const bonds: Record<string, Record<string, number>> = {};
  const companions = normCompanions(raw.companions, c, known, fronts, bonds);
  const lineage = normLineage(raw.lineage, c, known);
  const moneyId = typeof hudRaw.money === "string" ? hudRaw.money : statOrder.find((s) => stats[s].kind === "money");
  const obligations = normObligations(raw.obligations ?? raw.debts, c, known, moneyId);
  const jobs = normJobs(raw.jobs, c, known);
  const observers = normObservers(raw.observers ?? raw.being_seen, c, known);
  const discovery = normDiscovery(raw.discovery, c);
  const improvise = normImprovise(raw.improvise ?? raw.improvised, c, known, stats, statOrder);
  const growth = normGrowth(raw.growth ?? raw.practice, c);

  const ruleset: Ruleset = {
    name: typeof raw.name === "string" ? raw.name : "Untitled ruleset",
    description: typeof raw.description === "string" ? raw.description : undefined,
    player: {
      name: typeof playerRaw.name === "string" ? playerRaw.name : undefined,
      age: playerRaw.age !== undefined ? c.num(playerRaw.age, "Player › age", 0) : undefined,
    },
    stats, statOrder, relStats, relStatOrder, people,
    peopleOpen: relRaw.open !== false && (relStatOrder.length > 0),
    items,
    itemsOpen: invRaw.open !== false,
    startItems,
    locations,
    locationsOpen: raw.locations_open === true || Object.keys(locations).length === 0,
    startLocation,
    conditions, flags, actions, actionOrder, triggers,
    clock: {
      enabled: clockRaw.enabled !== false,
      start: clockStart ?? 480,
      minutesPerAction: c.num(clockRaw.minutes_per_action, "Clock › minutes_per_action", 10),
      narratorMax: c.num(clockRaw.narrator_max ?? clockRaw.narrator, "Clock › narrator_max", 480),
      weekdays,
      startDate,
    },
    hud: { bars, money: moneyStat && stats[moneyStat] ? moneyStat : undefined, currency: typeof hudRaw.currency === "string" ? hudRaw.currency : "$" },
    narration: { notes: typeof narrRaw.notes === "string" ? narrRaw.notes : undefined, numbers: narrRaw.numbers === true },
    weather, wardrobe, encounters, codex, feats, perks,
    ...(perkPoints && stats[perkPoints] ? { perkPoints } : {}),
    perkPick, abilities, quests, questOrder, storyQuests,
    look: normLook(raw.look ?? raw.minigames, c),
    secrets, fronts, randomEvents, liveChoices, dungeons, dating, mind, checkpoints, endings, legacy, body, companions, bonds, lineage, obligations, jobs, observers, discovery, improvise, growth,
  };

  // Cross-references that need everything loaded.
  for (const p of Object.values(people)) for (const e of p.schedule) {
    if (Object.keys(locations).length && !locations[e.at]) c.warn(`Relationships › people › ${p.id} › schedule`, `"${e.at}" isn't a declared location`);
  }
  for (const id of wardrobe.startWorn) {
    if (!items[id]?.slot) c.warn("Wardrobe › start", `"${id}" isn't a declared clothing item (items need a \`slot:\`)`);
    else if (!(startItems[id] > 0)) startItems[id] = 1; // wearing it means owning it
  }

  // Hard floor: sexual content and minors never mix, whatever the tags or settings.
  const minors = [
    ...(ruleset.player.age !== undefined && ruleset.player.age < 18 ? ["the player"] : []),
    ...Object.values(people).filter((p) => p.age !== undefined && p.age < 18).map((p) => p.name),
  ];
  const sexualActions = [
    ...Object.values(actions),
    ...Object.values(encounters).flatMap((e) => Object.values(e.actions).map((a) => ({ ...a, tags: [...a.tags, ...e.tags] }))),
    ...Object.values(liveChoices.tags),
    ...Object.values(abilities).map((a) => a.action),
  ].filter((a) => a.tags.some((t) => SEXUAL_TAGS.has(t)));
  if (minors.length && sexualActions.length) {
    c.err("Ruleset", `declares characters under 18 (${minors.join(", ")}) alongside sexual actions — Warp won't run this ruleset`);
    return { ruleset: null, issues: c.issues };
  }

  return { ruleset, issues: c.issues };
}
