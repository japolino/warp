// The minigames by id, what they are, and the arithmetic of a score against a bar —
// kept free of runtime imports so the ruleset and the browser can use them.

import type { Tier } from "./ruleset.js";

export type GameId = "blackjack" | "roulette" | "slots" | "aim" | "tiles" | "mines" | "stack" | "snake" | "race" | "pinball";
export const GAME_IDS: GameId[] = ["aim", "tiles", "mines", "stack", "snake", "race", "pinball", "blackjack", "roulette", "slots"];
export type GambleGame = "blackjack" | "roulette" | "slots";
export const GAMBLE_GAMES: GambleGame[] = ["blackjack", "roulette", "slots"];

/**
 * What makes a game easier.
 * window: wider timing · size: bigger targets/flippers · slow: slower pace · lives: another go after failing ·
 * hint: free safe reveals / a card read · peek: see the dealer's hidden card · preview: more upcoming pieces ·
 * hold: a held piece / held reel · wrap: walls wrap around · time: more time · saver: a drained ball comes back ·
 * luck: the wheel leans your way.
 */
export type AidKind = "window" | "size" | "slow" | "lives" | "hint" | "peek" | "preview" | "hold" | "wrap" | "time" | "saver" | "luck";
export const AID_KINDS: AidKind[] = ["window", "size", "slow", "lives", "hint", "peek", "preview", "hold", "wrap", "time", "saver", "luck"];

export function isGameId(x: unknown): x is GameId {
  return typeof x === "string" && (GAME_IDS as string[]).includes(x);
}

/** "keys", "piano tiles", "tetris", "osu" → the game's id. */
export function gameAlias(x: string): GameId | null {
  const k = x.toLowerCase().replace(/[^a-z]/g, "");
  const map: Record<string, GameId> = {
    aim: "aim", osu: "aim", circles: "aim", aimtrainer: "aim", shooting: "aim",
    tiles: "tiles", keys: "tiles", pianotiles: "tiles", piano: "tiles", rhythm: "tiles",
    mines: "mines", minesweeper: "mines", sweeper: "mines",
    stack: "stack", tetris: "stack", blocks: "stack",
    snake: "snake",
    race: "race", threeleggedrace: "race", threelegged: "race", threelegrun: "race", threelegrace: "race",
    pinball: "pinball", flipper: "pinball",
    blackjack: "blackjack", cards: "blackjack", twentyone: "blackjack",
    roulette: "roulette", wheel: "roulette",
    slots: "slots", slot: "slots", slotmachine: "slots", fruitmachine: "slots",
  };
  return map[k] ?? null;
}

export interface GameInfo {
  name: string;
  icon: string;
  /** One line on the briefing card. */
  pitch: string;
  /** skill: hands and eyes; rhythm: to a song; luck: cards and wheels (your odds tilt them). */
  kind: "skill" | "rhythm" | "luck";
  /** The aids this game understands. */
  aids: AidKind[];
}

export const GAMES: Record<GameId, GameInfo> = {
  aim: { name: "Aim", icon: "◎", pitch: "Hit the circles on the beat, follow the sliders, keep the combo alive.", kind: "rhythm", aids: ["window", "size", "slow", "lives"] },
  tiles: { name: "Keys", icon: "▮", pitch: "Four lanes, one song: every note you hit plays the melody.", kind: "rhythm", aids: ["window", "slow", "lives"] },
  mines: { name: "Mines", icon: "✹", pitch: "Clear the board before the clock runs out. One wrong square and it's over.", kind: "skill", aids: ["hint", "lives", "time"] },
  stack: { name: "Stack", icon: "▦", pitch: "Fit the falling blocks together and clear lines before the stack tops out.", kind: "skill", aids: ["slow", "preview", "hold", "time"] },
  snake: { name: "Snake", icon: "∿", pitch: "Eat, grow, don't bite yourself. Get enough before time's up.", kind: "skill", aids: ["slow", "wrap", "lives", "time"] },
  race: { name: "Three-legged race", icon: "⟫", pitch: "Tied at the ankle: step when your partner steps, and beat the other pair to the line.", kind: "skill", aids: ["window", "lives"] },
  pinball: { name: "Pinball", icon: "◐", pitch: "Flippers, bumpers, three balls. Rack up the score before the last one drains.", kind: "skill", aids: ["saver", "lives", "size"] },
  blackjack: { name: "Blackjack", icon: "♠", pitch: "A few hands against the dealer. Get closer to 21 than they do without going over.", kind: "luck", aids: ["peek", "hint", "lives"] },
  roulette: { name: "Roulette", icon: "◉", pitch: "Place your chips and spin. Safe bets pay little, single numbers pay big.", kind: "luck", aids: ["luck", "lives"] },
  slots: { name: "Slots", icon: "7", pitch: "Stop each reel yourself — line them up on the payline.", kind: "luck", aids: ["slow", "hold", "lives"] },
};

export interface GameAid {
  kind: AidKind;
  /** Percent for window/size/slow/time/luck; a count for the rest. */
  amount: number;
  /** Where it came from ("Marksmanship 62", "★ Steady Hands"). */
  from: string;
}

/** Score (0–1) needed for each tier. Below `partial` is a fail; below `critFail` a disaster. */
export interface GameBar { critFail: number | null; partial: number; success: number; crit: number }

export interface GameOffer {
  game: GameId;
  /** The rulebook's look for the arcade. */
  style?: "medieval" | "modern" | "scifi";
  /** Other games the rulebook allows for this check (the player may switch). */
  options: GameId[];
  /** The action, as the player saw it. */
  action: string;
  /** The check's skill ("Lockpicking"). */
  label: string;
  /** What the dice would give: success-or-better. */
  chance: number;
  /** 0 = trivial … 1 = nearly hopeless; tunes speed, density and the dealer. */
  level: number;
  bar: GameBar;
  aids: GameAid[];
  /** The three-legged race: who's tied to {{user}}, and how well they keep in step (0–1). */
  partner?: { name: string; sync: number };
  seed: string;
}

export interface GambleOffer {
  game: GambleGame;
  style?: "medieval" | "modern" | "scifi";
  action: string;
  /** Buy-in choices the player can afford, smallest first. */
  stakes: number[];
  /** Rounds at the table before they walk away (hands, spins, pulls). */
  rounds: number;
  money: { stat: string; have: number; currency: string };
  /** The house edge, after luck: 0.05 = the house keeps 5%. */
  edge: number;
  aids: GameAid[];
  seed: string;
}

/** What the overlay sends back. Scores and nets are clamped on arrival; the story sees `beats` and `detail`. */
export interface GameResult {
  game: GameId;
  /** 0–1 (a check) — the tier is worked out again from the bar. */
  score?: number;
  /** Gambling: money won (+) or lost (−), and the buy-in. */
  net?: number;
  stake?: number;
  /** How it went, in plain words: "a shaky start", "found the rhythm", "won it on the last hand". */
  beats: string[];
  /** One concrete line ("doubled down on eleven and drew a ten"). */
  detail?: string;
  /** Lives used, and a perk whose life was spent (its daily use is charged). */
  livesUsed?: number;
  perk?: string;
  /** Rhythm games: the song played. */
  song?: string;
  /** Gave up partway. */
  quit?: boolean;
  /** How much the song or table chosen moved the bar (−0.12 harder song, easier bar … +0.06). */
  ease?: number;
}

// ───────────────────────── the bar ─────────────────────────

/**
 * From the dice's odds to the score to beat. A sure thing passes at a third of a
 * perfect run; a long shot needs nearly everything. Partials sit just under, and a
 * critical needs most of what's left above success.
 */
export function gameBar(chance: number, opts: { partial?: number; crits?: boolean } = {}): GameBar {
  const p = Math.max(0.01, Math.min(0.99, chance));
  const success = round2(0.3 + 0.62 * (1 - p));
  const band = 0.1 + Math.min(0.12, (opts.partial ?? 0) * 0.6);
  const partial = round2(Math.max(0.05, success - band));
  const crit = round2(Math.min(0.99, success + (1 - success) * 0.62));
  const critFail = opts.crits === false ? null : round2(Math.max(0, partial * 0.3));
  return { critFail, partial, success, crit };
}

/** A song or table harder than the check needs eases the bar (and an easy one raises it). */
export function shiftBar(bar: GameBar, by: number): GameBar {
  const f = (x: number) => round2(Math.max(0.05, Math.min(0.99, x + by)));
  return { critFail: bar.critFail === null ? null : f(bar.critFail), partial: f(bar.partial), success: f(bar.success), crit: f(bar.crit) };
}

export function tierFromScore(bar: GameBar, score: number): Tier {
  const s = Math.max(0, Math.min(1, score));
  if (s >= bar.crit) return "crit_success";
  if (s >= bar.success) return "success";
  if (s >= bar.partial) return "partial";
  if (bar.critFail !== null && s < bar.critFail) return "crit_fail";
  return "fail";
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** The total of one aid, capped where more would break the game. */
export function aidTotal(aids: GameAid[], kind: AidKind): number {
  const n = aids.filter((a) => a.kind === kind).reduce((t, a) => t + a.amount, 0);
  const cap: Record<AidKind, number> = { window: 80, size: 60, slow: 35, lives: 3, hint: 3, peek: 1, preview: 4, hold: 1, wrap: 1, time: 60, saver: 2, luck: 40 };
  return Math.max(0, Math.min(cap[kind], n));
}

/** "+1 life", "+20% timing window" — how an aid reads on a perk or the briefing. */
export function aidWords(kind: AidKind, n: number): string {
  const s = (one: string, many: string) => `+${n} ${n === 1 ? one : many}`;
  switch (kind) {
    case "window": return `+${n}% timing window`;
    case "size": return `+${n}% bigger targets`;
    case "slow": return `${n}% slower`;
    case "time": return `+${n}% time`;
    case "luck": return `+${n}% luck`;
    case "lives": return s("life", "lives");
    case "hint": return s("hint", "hints");
    case "peek": return "sees the dealer's hidden card";
    case "preview": return s("piece preview", "piece previews");
    case "hold": return "can hold";
    case "wrap": return "walls wrap around";
    case "saver": return s("ball saver", "ball savers");
  }
}
