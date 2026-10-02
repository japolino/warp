// Minigames: another way to settle a check than the dice. The odds the dice would use
// still decide how hard it is — they set the score to beat and tune the game itself —
// and the stat behind the check, perks and a partner's trust turn into aids (wider
// timing, bigger targets, extra lives, a peek at the dealer's card). Played out, the
// score lands on the same tiers a roll would, and the narrator hears what happened in
// story terms, never "87% accuracy".
//
// The casino games double as gambling: a `gamble:` action stakes real money at a table.

import { type Rng, seededRng } from "./dice.js";
import { evalNumber } from "./expr.js";
import { checkStats } from "./freeform.js";
import type { ActionDef, Ruleset, Tier } from "./ruleset.js";
import { isGameId, type AidKind, type GambleGame, type GameId } from "./game-ids.js";
import { makeEnv, statMax, usesOf, type GameState } from "./state.js";
import { presentPeople } from "./world.js";

export { AID_KINDS, aidTotal, aidWords, GAMBLE_GAMES, GAME_IDS, gameAlias, gameBar, GAMES, isGameId, shiftBar, tierFromScore, type AidKind, type GambleGame, type GameAid, type GameBar, type GameId, type GameInfo, type GambleOffer, type GameOffer, type GameResult } from "./game-ids.js";
import { aidTotal, GAMES, gameBar, type GameAid, type GameBar, type GameOffer, type GambleOffer, type GameResult } from "./game-ids.js";

const round2 = (x: number) => Math.round(x * 100) / 100;

// ───────────────────────── which game ─────────────────────────

const HINTS: [RegExp, GameId][] = [
  [/aim|shoot|marks|gun|archer|bow|throw|sniper|firearm|ranged/, "aim"],
  [/music|perform|sing|piano|danc|rhythm|instrument|art\b|song/, "tiles"],
  [/lock|stealth|sneak|hack|secur|investig|search|percep|disarm|tech|electro|trap|clue|observ|deduc/, "mines"],
  [/craft|repair|engineer|build|mechan|pack|smith|cook|tinker|construct/, "stack"],
  [/athlet|run|chase|agil|reflex|dodge|escape|swim|climb|acrobat|parkour/, "snake"],
  [/charm|persua|bluff|decei|negoti|haggl|seduc|allure|social|wits|lie|intimid|barter|card/, "blackjack"],
  [/luck|fortune|gambl|fate|chance|pray/, "slots"],
  [/strength|physique|fight|brawl|combat|melee|might|wrestl|endur/, "pinball"],
];
const SKILL_POOL: GameId[] = ["aim", "tiles", "mines", "snake", "stack", "pinball"];

/** A game that suits a check by its skill and label; otherwise one picked steadily from the skill games. */
export function gameFor(words: string, salt: string): GameId {
  const w = words.toLowerCase();
  for (const [re, g] of HINTS) if (re.test(w)) return g;
  let h = 0;
  for (const c of salt) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SKILL_POOL[h % SKILL_POOL.length];
}

// ───────────────────────── offers ─────────────────────────

export type GamesScope = "rulebook" | "all";

/** The game a check would be played as, with its bar and aids — or null if it stays dice-only. */
export function gameOffer(r: Ruleset, s: GameState, a: ActionDef, chance: number, opts: { scope: GamesScope; partial?: number; target?: string; label?: string; seed?: string }): GameOffer | null {
  const check = a.check;
  if (!check || check.game === false) return null;
  const named = Array.isArray(check.game) ? check.game : [];
  if (!named.length && opts.scope !== "all") return null;
  const stats = checkStats(r, a);
  const words = [check.label ?? "", ...stats, ...stats.map((x) => r.stats[x]?.label ?? ""), ...a.tags].join(" ");
  const game = named[0] ?? gameFor(words, a.id);
  const p = Math.max(0, Math.min(1, chance));
  const level = round2(1 - p);
  const aids = aidsFor(r, s, a, game, stats);
  const partner = game === "race" ? partnerFor(r, s, opts.target) : undefined;
  if (partner && partner.sync > 0.05) aids.push({ kind: "window", amount: Math.round(partner.sync * 35), from: `In step with ${partner.name}` });
  return {
    game,
    style: r.look,
    options: named.length ? named : [game],
    action: opts.label ?? a.label,
    label: check.label ?? (stats[0] ? r.stats[stats[0]]?.label ?? stats[0] : "Luck"),
    chance: round2(p),
    level,
    bar: gameBar(p, { partial: opts.partial, crits: check.crits }),
    aids: mergeAids(aids),
    ...(partner ? { partner } : {}),
    seed: opts.seed ?? `${a.id}:${s.minutes}`,
  };
}

/**
 * Aids from the stat behind the check (how far up its range it is), the perks that
 * name this game (or any game), and perks that reroll or soften this check — in a
 * game those become another go.
 */
export function aidsFor(r: Ruleset, s: GameState, a: ActionDef | null, game: GameId, stats: string[]): GameAid[] {
  const out: GameAid[] = [];
  const info = GAMES[game];
  const main = stats[0];
  if (main && r.stats[main]) {
    const def = r.stats[main];
    const max = statMax(r, def, s);
    const v = s.stats[main] ?? def.start;
    const frac = max > def.min ? Math.max(0, Math.min(1, (v - def.min) / (max - def.min))) : 0;
    const from = `${def.label} ${Math.round(v)}`;
    if (frac >= 0.1) {
      const pct = Math.round(frac * 40);
      const kind: AidKind | undefined = info.aids.find((k) => ["window", "size", "slow", "time", "luck"].includes(k));
      if (kind) out.push({ kind, amount: pct, from });
    }
    if (frac >= 0.6) {
      const extra: AidKind | undefined = info.aids.find((k) => ["hint", "peek", "preview", "hold", "saver", "wrap"].includes(k));
      if (extra) out.push({ kind: extra, amount: 1, from });
    }
  }
  const used = new Set(stats);
  for (const id of Object.keys(s.perks)) {
    const p = r.perks[id];
    for (const rule of p?.rules ?? []) {
      if (rule.kind === "game") {
        if (rule.games.length && !rule.games.includes(game)) continue;
        for (const [k, n] of Object.entries(rule.aids) as [AidKind, number][]) if (n) out.push({ kind: k, amount: n, from: `★ ${p.name}` });
      } else if (a && (rule.kind === "reroll" || rule.kind === "soften")) {
        const fits = (!rule.stats.length && !rule.tags.length) || rule.stats.some((x) => used.has(x)) || rule.tags.some((t) => a.tags.includes(t));
        if (!fits) continue;
        if (rule.perDay && usesOf(s, `perk:${id}:${rule.kind}`).today >= rule.perDay) continue;
        if (rule.kind === "reroll") out.push({ kind: "lives", amount: 1, from: `★ ${p.name}` });
      }
    }
  }
  return out.filter((x) => info.aids.includes(x.kind));
}

/** Same kind from the same source adds up; the list stays readable. */
function mergeAids(list: GameAid[]): GameAid[] {
  const out: GameAid[] = [];
  for (const a of list) {
    const same = out.find((x) => x.kind === a.kind && x.from === a.from);
    if (same) same.amount += a.amount;
    else out.push({ ...a });
  }
  return out;
}

/** Who {{user}} is tied to in the race: the person the action is aimed at, else whoever is closest to them here. */
function partnerFor(r: Ruleset, s: GameState, target?: string): { name: string; sync: number } {
  const here = presentPeople(r, s, makeEnv(r, s));
  const pick = target && s.people[target] ? target : here.sort((x, y) => closeness(r, s, y) - closeness(r, s, x))[0];
  if (!pick) return { name: "a stranger", sync: 0 };
  return { name: s.people[pick]?.name ?? r.people[pick]?.name ?? pick, sync: round2(closeness(r, s, pick)) };
}

/** 0–1: the average of how someone feels about {{user}}, on the relationship stats that are good when high. */
function closeness(r: Ruleset, s: GameState, id: string): number {
  const rel = s.rel[id] ?? {};
  const xs: number[] = [];
  for (const k of r.relStatOrder) {
    const def = r.relStats[k];
    if (!def || def.good === "low") continue;
    const v = rel[k] ?? def.start;
    if (def.max > def.min) xs.push(Math.max(0, Math.min(1, (v - def.min) / (def.max - def.min))));
  }
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

// ───────────────────────── after the game ─────────────────────────

/** A result as it arrives from the overlay: numbers clamped, words trimmed, the game kept to what was offered. */
export function cleanResult(raw: unknown, allowed: GameId[]): GameResult | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  if (!isGameId(g.game) || (allowed.length && !allowed.includes(g.game))) return null;
  const words = (x: unknown, n: number) => (Array.isArray(x) ? x : []).filter((w): w is string => typeof w === "string").map((w) => w.slice(0, 120)).slice(0, n);
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
  const score = num(g.score);
  return {
    game: g.game,
    ...(score !== undefined ? { score: Math.max(0, Math.min(1, score)) } : {}),
    ...(num(g.net) !== undefined ? { net: Math.round(num(g.net)!) } : {}),
    ...(num(g.stake) !== undefined ? { stake: Math.max(0, Math.round(num(g.stake)!)) } : {}),
    beats: words(g.beats, 6),
    ...(typeof g.detail === "string" ? { detail: g.detail.slice(0, 200) } : {}),
    ...(num(g.livesUsed) ? { livesUsed: Math.max(0, Math.min(5, Math.round(num(g.livesUsed)!))) } : {}),
    ...(typeof g.perk === "string" ? { perk: g.perk.slice(0, 60) } : {}),
    ...(typeof g.song === "string" ? { song: g.song.slice(0, 80) } : {}),
    ...(g.quit === true ? { quit: true } : {}),
    ...(num(g.ease) ? { ease: Math.max(-0.12, Math.min(0.08, num(g.ease)!)) } : {}),
  };
}

const MARGIN: Record<Tier, (m: number) => string> = {
  crit_success: () => "It goes better than anyone could have asked.",
  success: (m) => (m < 0.04 ? "It works — by a hair." : m < 0.12 ? "It works, cleanly enough." : "It works, and it isn't close."),
  partial: () => "It half-works: there's a cost or a complication.",
  fail: (m) => (m < 0.05 ? "It fails — agonisingly close." : "It fails."),
  crit_fail: () => "It goes badly wrong.",
};

/** For the narrator: how the attempt went, in story terms — never as a game. */
export function gameHint(label: string, res: GameResult, tier: Tier, bar: GameBar): string {
  const score = res.score ?? 0;
  const margin = tier === "fail" || tier === "crit_fail" ? bar.partial - score : score - (tier === "partial" ? bar.partial : bar.success);
  const how = res.beats.length ? ` How it went: ${res.beats.join("; ")}.` : "";
  const detail = res.detail ? ` (${res.detail})` : "";
  const gave = res.quit ? " {{user}} gave up partway." : "";
  return `${label}: decided by {{user}}'s own hands rather than dice.${how}${detail}${gave} ${MARGIN[tier](Math.abs(margin))} Narrate it as part of the story, in the scene's own terms — not as a game or a score.`;
}

/** The chip under the reply: "◎ Aim 87% · needed 60%". */
export function gameSummary(res: GameResult, bar: GameBar): string {
  const g = GAMES[res.game];
  return `${g.icon} ${g.name} ${Math.round((res.score ?? 0) * 100)}% · needed ${Math.round(bar.success * 100)}%${res.song ? ` · ♪ ${res.song}` : ""}`;
}

// ───────────────────────── gambling ─────────────────────────

const PAYOUT_CAP: Record<GambleGame, number> = { blackjack: 2.5, roulette: 35, slots: 50 };
const BASE_EDGE: Record<GambleGame, number> = { blackjack: 0.02, roulette: 0.027, slots: 0.08 };

export function gambleOffer(r: Ruleset, s: GameState, a: ActionDef, seed?: string): GambleOffer | null {
  const g = a.gamble;
  if (!g) return null;
  const stat = g.stat ?? r.hud.money;
  if (!stat || !r.stats[stat]) return null;
  const have = Math.floor(s.stats[stat] ?? r.stats[stat].start);
  const env = makeEnv(r, s);
  const luck = g.luck !== undefined ? evalNumber(g.luck, env, 0) / 100 : 0;
  const aids = aidsFor(r, s, a, g.game, []);
  const edge = Math.max(-0.2, Math.min(0.4, (g.edge ?? BASE_EDGE[g.game]) - luck - aidTotal(aids, "luck") / 400));
  return {
    game: g.game,
    style: r.look,
    action: a.label,
    stakes: g.stakes.filter((x) => x <= have),
    rounds: g.rounds,
    money: { stat, have, currency: r.hud.currency },
    edge: round2(edge * 1000) / 1000,
    aids: mergeAids(aids),
    seed: seed ?? `${a.id}:${s.minutes}`,
  };
}

/** What a table can really pay or take: never more than the buy-in lost, never past the game's best payout. */
export function clampNet(game: GambleGame, stake: number, net: number, rounds: number): number {
  const most = Math.round(stake * PAYOUT_CAP[game] * Math.max(1, rounds));
  return Math.max(-stake, Math.min(most, Math.round(net)));
}

/**
 * A session at the table when nobody plays it out (minigames off, or typed): each
 * round risks a share of the buy-in at the game's odds, tilted by the house edge.
 */
export function simulateGamble(game: GambleGame, stake: number, rounds: number, edge: number, rng: Rng): { net: number; beats: string[]; detail: string } {
  let chips = stake;
  const bet = Math.max(1, Math.round(stake / Math.max(1, Math.min(rounds, 5))));
  let wins = 0, losses = 0, big = 0;
  for (let i = 0; i < rounds && chips >= 1; i++) {
    const b = Math.min(bet, chips);
    const x = rng();
    if (game === "blackjack") {
      const winP = 0.44 - edge / 2, pushP = 0.09;
      if (x < 0.045) { chips += Math.round(b * 1.5); wins++; big++; }
      else if (x < 0.045 + winP) { chips += b; wins++; }
      else if (x < 0.045 + winP + pushP) { /* push */ }
      else { chips -= b; losses++; }
    } else if (game === "roulette") {
      // Mostly even-money bets, the odd long shot.
      if (rng() < 0.15) {
        if (x < (1 - edge) / 37) { chips += b * 35; wins++; big++; } else { chips -= b; losses++; }
      } else if (x < (18 / 37) * (1 - edge) / (1 - 0.027)) { chips += b; wins++; } else { chips -= b; losses++; }
    } else {
      // Pays 40×, 4× or 1.5× the bet; the small wins are tuned so the table keeps `edge` on average.
      const small = Math.max(0, (0.6 - edge) / 1.5);
      if (x < 0.004) { chips += b * 39; wins++; big++; }
      else if (x < 0.064) { chips += b * 3; wins++; }
      else if (x < 0.064 + small) { chips += Math.round(b * 0.5); wins++; }
      else { chips -= b; losses++; }
    }
  }
  const net = clampNet(game, stake, chips - stake, rounds);
  const beats = [wins > losses ? "the table ran warm" : losses > wins ? "the table ran cold" : "it went back and forth"];
  if (big) beats.push("one big win");
  return { net, beats, detail: `${wins} won, ${losses} lost` };
}

export function gambleHint(name: string, res: { net: number; stake: number; beats: string[]; detail?: string }, currency: string): string {
  const amount = `${currency}${Math.abs(res.net)}`;
  const outcome = res.net > 0 ? `walks away ${amount} up` : res.net < 0 ? (res.net <= -res.stake ? `loses the whole ${currency}${res.stake} stake` : `walks away ${amount} down`) : "breaks even";
  const how = res.beats.length ? ` ${res.beats.join("; ")}.` : "";
  return `{{user}} plays ${name} (stake ${currency}${res.stake}) and ${outcome}.${how}${res.detail ? ` (${res.detail})` : ""} Show the table, the people around it and how {{user}} takes it — not a round-by-round account.`;
}

/** For tests and the dice fallback: a steady generator for a session. */
export const gambleRng = (seed: string) => seededRng(`gamble:${seed}`);
