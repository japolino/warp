// Dungeon diving: shared types.

import type { Effect } from "../ruleset.js";

export type TileKind =
  | "start" | "empty" | "stairs"
  | "enemy" | "elite" | "boss"
  | "treasure" | "trap" | "rest" | "shop"
  | "event" | "surprise" | "romance";

/** Kinds a floor is dealt from (start and stairs are placed separately). */
export const DEALT_KINDS = ["empty", "enemy", "elite", "treasure", "trap", "rest", "shop", "event", "surprise", "romance"] as const;
export type DealtKind = (typeof DEALT_KINDS)[number];

export interface Stats { hp: number; mp: number; atk: number; def: number; mat: number; mdf: number; agi: number }

export interface MonsterDef extends Stats {
  id: string;
  name: string;
  sprite: string;
  /** 1–4 for ordinary monsters (by depth band), 5 for bosses. */
  tier: number;
  skills: string[];
  xp: number;
  gold: number;
}

export type SkillTarget = "foe" | "foes" | "ally" | "allies" | "self";
export interface SkillDef {
  id: string;
  name: string;
  target: SkillTarget;
  kind: "phys" | "magic" | "heal" | "guard";
  power: number;
  mp: number;
  tp: number;
  /** Extra crit chance (0–1). */
  crit?: number;
  /** Magic that heals the user for this share of the damage. */
  drain?: number;
}

export type ClassId = "adventurer" | "fighter" | "mage" | "healer" | "rogue";

/** What a dungeon event or romance choice does. Ruleset effects ride along in `effect`. */
export interface DgOutcome {
  /** Direction for the narrator. */
  text?: string;
  /** Heal / hurt the party by this percent of max HP (the target alone for romance scenes). */
  heal?: number;
  hurt?: number;
  /** Restore this percent of max MP. */
  mana?: number;
  gold?: string | number;
  xp?: string | number;
  bag?: Record<string, number>;
  /** Start a fight: "enemy", "elite" or a monster id. */
  fight?: string;
  /** Relationship with the scene's companion: warmth (stats where high is good) and desire. */
  bond?: number;
  desire?: number;
  effect: Effect;
}
export interface DgChoice {
  id: string;
  label: string;
  /** d100 roll-under percent (formula); without it the choice always succeeds. */
  chance?: string | number;
  success: DgOutcome;
  fail?: DgOutcome;
  /** Choice only shows when this holds (formula). */
  when?: string;
  /** Gold it costs (shown on the button). */
  cost?: number;
}
export interface DgEventDef {
  id: string;
  /** What the party finds; {target} = a companion (romance scenes). */
  text: string;
  minDepth: number;
  weight: number;
  choices: DgChoice[];
}

export type Theme = "cave" | "crypt" | "ruins" | "hell" | "lair";
export const THEMES: Theme[] = ["cave", "crypt", "ruins", "hell", "lair"];

export interface DungeonDef {
  id: string;
  name: string;
  desc?: string;
  /** Where the entrance is (empty = anywhere). */
  at: string[];
  when?: string;
  theme: Theme;
  /** Tiles per side on floor 1 (grows by one every three floors, up to 9). */
  size: number;
  /** Deepest floor (0 = endless). */
  floors: number;
  bossEvery: number;
  tiles: Record<DealtKind, number>;
  /** Monsters in play (built-in ids and the dungeon's own). */
  monsters: Record<string, MonsterDef>;
  /** Bosses in order of appearance (the last repeats, stronger). */
  bosses: string[];
  events: Record<string, DgEventDef>;
  romance: Record<string, DgEventDef>;
  /** Ruleset items that can turn up in chests. */
  loot: { item: string; weight: number; minDepth: number }[];
  party: { max: number; when?: string; classes: Record<string, ClassId> };
  /** The player's battle stats as formulas over ruleset stats (missing = class defaults). */
  player: Partial<Record<keyof Stats, string | number>> & { class: ClassId; sprite?: string };
  /** Run gold is paid into this stat when you leave. */
  currency?: string;
  onLeave: Effect;
  onDefeat: Effect;
  /** Narrate every battle in chat, or only elites, bosses and story moments. */
  narrate: "highlights" | "all";
}

// ───────────────────────── run state ─────────────────────────

export interface Fighter extends Stats {
  id: string;
  side: "party" | "foe";
  name: string;
  sprite: string;
  mhp: number;
  mmp: number;
  tp: number;
  skills: string[];
  guard: boolean;
  /** For foes: rewards; for party members: the person id ("you" for the player). */
  xp?: number;
  gold?: number;
  elite?: boolean;
  boss?: boolean;
}

export interface BattleState {
  kind: "enemy" | "elite" | "boss" | "mimic" | "event";
  at: string;
  round: number;
  fighters: Fighter[];
  /** Who still acts this round, in order. */
  queue: string[];
  /** The party member waiting for a command. */
  active: string | null;
  /** What happened, for the screen and the narrator (recent lines). */
  log: string[];
  over: null | "won" | "lost" | "fled";
}

export interface PartyMember { id: string; hp: number; mp: number; tp: number }

export interface Pending {
  kind: "event" | "romance";
  id: string;
  at: string;
  /** Romance: the companion it's with. */
  target?: string;
}

export interface DungeonRun {
  id: string;
  seed: string;
  depth: number;
  pos: [number, number];
  /** Tiles stepped on this floor ("x,y"). */
  seen: string[];
  /** Tiles whose content is used up. */
  cleared: string[];
  party: PartyMember[];
  xp: number;
  gold: number;
  /** Consumables: potion, ether, bomb. */
  bag: Record<string, number>;
  /** Ruleset items found (kept when you leave). */
  loot: Record<string, number>;
  battle: BattleState | null;
  pending: Pending | null;
  log: string[];
  /** What happened since the narrator last heard about the run. */
  untold: string[];
}
