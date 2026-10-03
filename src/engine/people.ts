// People (CORE-DESIGN §2.2): band crossings become one story line, bands carry a voice for how a person acts,
// and repeated live tags taper.

import type { Band, Ruleset, StatDef } from "./ruleset.js";
import { bandFor, personName, statMax, type GameState } from "./state.js";
import { practiceRepetition } from "./freeform.js";
import { tagKey, taperRule } from "./resolve.js";

/** A stat entering a new band: whose (null = {{user}}'s own meter), which stat, and the line to show. */
export interface BandCrossing {
  who: string | null;
  stat: string;
  from: Band | null;
  to: Band;
  dir: "up" | "down";
  /** How far the value moved. */
  moved: number;
  /** The move as a share of the stat's range, so stats on different scales compare fairly. */
  share: number;
  /** The band has its own line for this direction (`say:` / `say_down:`), not a generated one. */
  authored: boolean;
  line: string;
}

const fill = (text: string, name: string) => text.replace(/\{name\}/g, name);

function crossing(def: StatDef, before: number, after: number, max: number, beforeMax: number): { from: Band | null; to: Band; dir: "up" | "down" } | null {
  if (!def.bands.length || before === after) return null;
  const from = bandFor(def, before, beforeMax);
  const to = bandFor(def, after, max);
  if (!to || from === to || (from && from.at === to.at && from.text === to.text)) return null;
  return { from, to, dir: (from?.at ?? -Infinity) < to.at ? "up" : "down" };
}

/** Band text as the end of a line: a full stop unless it has one. */
const sentence = (t: string) => (/[.!?。！？…"')]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);

/**
 * Every band crossing between two states: relationship stats of each person, and {{user}}'s meters. Without a
 * `say:` line the band text is the line, with the stat's name; `say: ""` (or `say_down: ""`) leaves it empty: no line.
 */
export function bandCrossings(r: Ruleset, before: GameState, after: GameState): BandCrossing[] {
  const out: BandCrossing[] = [];
  for (const who of Object.keys(after.people)) {
    if (!before.people[who]) continue; // a first read sets feelings; it is not a crossing
    const name = personName(r, after, who);
    for (const id of r.relStatOrder) {
      const def = r.relStats[id];
      if (def.show === "hidden") continue;
      const b = before.rel[who]?.[id] ?? def.start, a = after.rel[who]?.[id] ?? def.start;
      const c = crossing(def, b, a, def.max, def.max);
      if (!c) continue;
      const own = c.dir === "up" ? c.to.say : c.to.sayDown;
      const moved = Math.abs(a - b);
      out.push({ who, stat: id, ...c, moved, share: moved / Math.max(1e-9, def.max - def.min), authored: !!own, line: fill(own ?? `${name}: ${def.label} — ${sentence(c.to.text)}`, name) });
    }
  }
  for (const id of r.statOrder) {
    const def = r.stats[id];
    if (def.kind === "hidden" || def.show === "hidden") continue;
    const b = before.stats[id] ?? def.start, a = after.stats[id] ?? def.start;
    const c = crossing(def, b, a, statMax(r, def, after), statMax(r, def, before));
    if (!c) continue;
    const own = c.dir === "up" ? c.to.say : c.to.sayDown;
    const moved = Math.abs(a - b);
    out.push({ who: null, stat: id, ...c, moved, share: moved / Math.max(1e-9, statMax(r, def, after) - def.min), authored: !!own, line: own ?? `${def.label} — ${sentence(c.to.text)}` });
  }
  return out;
}

/** Which of two crossings tells the turn better: the author's own line first, then the bigger move for its stat's range. */
const better = (a: BandCrossing, b: BandCrossing) => Number(b.authored) - Number(a.authored) || b.share - a.share || b.moved - a.moved;

/** The lines to show: one per person (an authored line first, then the biggest move for its range), at most `max` in all. */
export function crossingLines(crossings: BandCrossing[], max = 3): string[] {
  const best = new Map<string, BandCrossing>();
  for (const c of crossings) {
    if (!c.line) continue;
    const key = c.who ?? `you:${c.stat}`;
    const cur = best.get(key);
    if (!cur || better(c, cur) < 0) best.set(key, c);
  }
  return [...best.values()].sort((a, b) => Number(a.who === null) - Number(b.who === null) || better(a, b)).slice(0, max).map((c) => c.line);
}

/** "How Mira acts now: …" from the voices of her current bands (at most two parts), or null. */
export function voiceLine(r: Ruleset, s: GameState, who: string): string | null {
  const name = personName(r, s, who);
  const parts: string[] = [];
  for (const id of r.relStatOrder) {
    const def = r.relStats[id];
    if (def.show === "hidden") continue;
    const band = bandFor(def, s.rel[who]?.[id] ?? def.start);
    if (!band?.voice) continue;
    let v = fill(band.voice, name).trim().replace(/[.;]+$/, "");
    if (v.toLowerCase().startsWith(`${name.toLowerCase()} `)) v = v.slice(name.length + 1);
    parts.push(v);
    if (parts.length >= 2) break;
  }
  return parts.length ? `How ${name} acts now: ${parts.join("; ")}.` : null;
}

/**
 * How much a live tag's gains would still count on this target if it were used now (1 = full), from its recent
 * use: × max(floor, 1 / (1 + step × n)), n = uses in the last 8 turns or 120 in-game minutes.
 */
export function tagTaper(r: Ruleset, s: GameState, tag: string, target?: string): number {
  const rule = taperRule(r);
  return rule ? practiceRepetition(s, tagKey(tag, target), rule).multiplier : 1;
}

/** Live tags used recently (tag → uses in the taper window, over all targets), for the writer's "they give less now" note. */
export function recentTags(r: Ruleset, s: GameState): Record<string, number> {
  const rule = taperRule(r);
  const out: Record<string, number> = {};
  if (!rule) return out;
  for (const [key, use] of Object.entries(s.practiceUse ?? {})) {
    if (!key.startsWith("tag:")) continue;
    const recovered = (rule.recoverMinutes > 0 && s.minutes - use.minutes >= rule.recoverMinutes) || (rule.recoverTurns > 0 && s.turn - use.turn >= rule.recoverTurns);
    if (recovered) continue;
    const tag = key.slice(4, key.lastIndexOf(":"));
    out[tag] = (out[tag] ?? 0) + use.n;
  }
  return out;
}
