// One encounter round as a short passage the story keeps, and the paragraph that
// replaces the whole log when it ends. The rules already decided the round; this
// only tells it — in the story's own point of view and voice, never the chat's
// preset. The helper model writes it; scripted lines from the ruleset's own
// hints stand in when it's off, slow or fails, and avoid repeating themselves.

import { seededRng } from "../engine/dice.js";
import type { RoundCard } from "../engine/encounter-view.js";
import { TIER_FALLBACK, type TurnRecord } from "../engine/resolve.js";
import type { ActionDef, Ruleset, Tier } from "../engine/ruleset.js";
import { foeName, type GameState } from "../engine/state.js";
import type { Settings } from "../shared/protocol.js";
import { askProse } from "./helpers.js";
import { logError } from "./host.js";

export type Pov = "second" | "third";

export interface RoundInput {
  r: Ruleset;
  before: GameState;
  after: GameState;
  rec: TurnRecord;
  card: RoundCard;
  /** The action the player took (null: no clear move). */
  action: ActionDef | null;
  player: string;
  /** What the player typed, when they typed it. */
  typed: string | null;
  /** The story just before the encounter, so the voice matches. */
  story: string;
  /** This encounter's earlier rounds, as written. */
  earlier: string[];
  /** Who the opponent is, when anything is known. */
  foeAbout: string;
  seed: string;
}

/** Second person ("you") or third ("Sam") — however the story has been told. */
export function storyPov(story: string, player: string): Pov {
  const you = (story.match(/\byou(r|rs|rself)?\b/gi) ?? []).length;
  const first = player.trim().split(/\s+/)[0];
  const named = first ? (story.match(new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g")) ?? []).length : 0;
  return named > you ? "third" : "second";
}

const MODALS = new Set(["can", "could", "will", "would", "shall", "should", "may", "might", "must", "am", "was", "have", "do", "did", "had", "just", "then", "quickly", "slowly", "carefully", "really", "try"]);
const NOT_VERBS = new Set(["the", "a", "an", "my", "me", "i", "you", "your", "their", "them", "they", "it", "its", "his", "her", "he", "she", "we", "us", "our", "this", "that", "these", "those", "then", "still", "also", "just", "not", "never", "so", "too", "very", "now", "again", "back", "away", "out", "up", "down", "off", "in", "on", "at", "to", "with", "without", "for", "from", "into", "onto", "over", "under", "one", "two", "some", "all", "every", "each", "no", "more", "less", "hard", "fast", "low", "high"]);
function third(verb: string): string {
  if (/(s|sh|ch|x|z|o)$/i.test(verb)) return `${verb}es`;
  if (/[^aeiou]y$/i.test(verb)) return `${verb.slice(0, -1)}ies`;
  return `${verb}s`;
}

/** A first-person line ("*I raise my hands…*") told from the story's point of view. */
export function retell(text: string, pov: Pov, player: string): string {
  let t = text.replace(/\*/g, "").replace(/\s+/g, " ").trim();
  if (pov === "second") {
    t = t.replace(/\bI am\b/g, "you are").replace(/\bI'm\b/g, "you're").replace(/\bI've\b/g, "you've").replace(/\bI'll\b/g, "you'll").replace(/\bI'd\b/g, "you'd")
      .replace(/\bmyself\b/gi, "yourself").replace(/\bmine\b/gi, "yours").replace(/\bmy\b/gi, "your").replace(/\bme\b/g, "you").replace(/\bI\b/g, "you");
  } else {
    // Verbs joined to the first one share its subject: "I duck and run" → "Sam ducks and runs".
    if (/\bI \w+/.test(t)) {
      t = t.replace(/\b(and|then|or) ([a-z]+)\b/g, (m, j: string, v: string) =>
        NOT_VERBS.has(v) || /(ly|ed|ing|s)$/.test(v) ? m : `${j} ${third(v)}`);
    }
    t = t.replace(/\bI am\b/g, `${player} is`).replace(/\bI'm\b/g, `${player}'s`).replace(/\bI've\b/g, `${player} has`).replace(/\bI'll\b/g, `${player} will`).replace(/\bI'd\b/g, `${player} would`)
      .replace(/\bmyself\b/gi, "themself").replace(/\bmine\b/gi, `${player}'s`).replace(/\bmy\b/gi, "their").replace(/\bme\b/g, "them")
      .replace(/\bI (\w+)/g, (_m, v: string) => `${player} ${MODALS.has(v.toLowerCase()) || /s$/.test(v) ? v : third(v)}`)
      .replace(/\bI\b/g, player);
  }
  return cap(t);
}

/** {{user}} in an authored hint, from the story's point of view. */
function told(text: string, pov: Pov, player: string): string {
  const who = pov === "second" ? "you" : player;
  const poss = pov === "second" ? "your" : `${player}'s`;
  return cap(text.replace(/\{\{user\}\}'s/gi, poss).replace(/\{\{user\}\}/gi, who).replace(/\byou is\b/g, "you are").replace(/\byou has\b/g, "you have").replace(/\byou looks\b/g, "you look").replace(/\byou gets\b/g, "you get"));
}

const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const lc = (t: string) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);
const stop = (t: string) => (/[.!?…"”]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);
const pick = <T>(xs: T[], rng: () => number) => xs[Math.floor(rng() * xs.length) % xs.length];

const TIER_PLAIN: Record<Tier, string[]> = {
  crit_success: ["It works better than it had any right to.", "It lands perfectly.", "That couldn't have gone better."],
  success: ["It works.", "It lands.", "That does it — for now.", "It gets through."],
  partial: ["It half works.", "It helps, a little.", "It lands, but not cleanly."],
  fail: ["It doesn't work.", "Nothing comes of it.", "It falls flat.", "It gets nowhere."],
  crit_fail: ["It goes badly wrong.", "That backfires.", "It couldn't have gone worse."],
};
const AGAIN = ["Again,", "Once more,", "Not giving up,", "One more try:"];

/** The ruleset's own line for how this move turned out, if it wrote one. */
function authoredHint(a: ActionDef | null, rec: TurnRecord): string | null {
  if (!a) return null;
  if (!rec.check) return a.effects.hint ?? null;
  const key = TIER_FALLBACK[rec.check.tier].find((t) => a.outcomes[t]);
  return (key && a.outcomes[key]?.hint) || null;
}

export function scriptedRound(o: RoundInput): string {
  const rng = seededRng(`${o.seed}:round`);
  const pov = storyPov(o.story, o.player);
  const subject = pov === "second" ? "You" : o.player;
  const used = o.earlier.join(" ");
  const parts: string[] = [];
  // The move.
  let move: string;
  if (o.typed && o.typed.length <= 220) move = retell(o.typed, pov, o.player);
  else if (o.action?.say) move = retell(o.action.say, pov, o.player);
  else if (o.action) move = `${subject} ${pov === "second" ? "try" : "tries"} to ${lc(o.action.label)}`;
  else move = `${subject} ${pov === "second" ? "hold" : "holds"} back, looking for an opening`;
  move = stop(move);
  if (used.includes(move)) move = `${pick(AGAIN, rng)} ${lc(move)}`;
  parts.push(move);
  // How it turned out.
  const hint = authoredHint(o.action, o.rec);
  const outcome = hint ? stop(told(hint, pov, o.player)) : o.card.check ? pick(TIER_PLAIN[o.rec.check!.tier], rng) : "";
  if (outcome) parts.push(used.includes(outcome) && o.card.check ? pick(TIER_PLAIN[o.rec.check!.tier].filter((x) => !used.includes(x)).concat(TIER_PLAIN[o.rec.check!.tier]), rng) : outcome);
  // The other side.
  if (o.card.foe) parts.push(stop(`${foeName(o.r, o.before)} ${lc(told(o.card.foe, pov, o.player))}`));
  return parts.join(" ");
}

const ROUND_SYSTEM = [
  "You write one round of a tense encounter inside an ongoing roleplay, as a short passage the story keeps.",
  "The game's rules already decided everything in this round. Narrate exactly that: the player's move, how it turned out, and the other side's move, in that order.",
  "Never add outcomes, injuries, items or endings the facts don't state. Never end the encounter unless the facts say it ended.",
  "Match the story's point of view, tense and voice, shown in the excerpt. 2–4 sentences, under 80 words. No headings, lists, game terms or numbers.",
  "A repeated move is a fresh attempt: show how this one differs. Don't reuse phrasing from earlier rounds.",
  "Never speak, think or decide for the player beyond the move they made. Dialogue from the other side is welcome, quoted inline.",
  "Anything romantic or sexual involves adults only.",
  "Reply with the passage only.",
].join("\n");

function facts(o: RoundInput, pov: Pov): string {
  const c = o.card;
  const lines = [
    `Point of view: ${pov === "second" ? `second person ("you" is ${o.player})` : `third person (${o.player})`}`,
    `${o.player}'s move: ${c.move}${o.typed ? ` — in their words: "${o.typed.replace(/\*/g, "").slice(0, 400)}"` : o.action?.say ? ` — "${o.action.say.replace(/\*/g, "")}"` : ""}`,
    c.check ? `How it turned out: ${c.check.tier}${c.check.gear.length ? ` (helped by ${c.check.gear.join(", ")})` : ""}` : "",
    authoredHint(o.action, o.rec) ? `The ruleset's note on this outcome: ${told(authoredHint(o.action, o.rec)!, pov, o.player)}` : "",
    c.foe ? `${foeName(o.r, o.before)}'s move: ${c.foe.replace(/\{\{user\}\}/gi, o.player)}` : "",
    c.changes.length ? `What shifted (show it, don't state numbers): ${c.changes.map((x) => `${x.label} ${x.to > x.from ? "up" : "down"}`).join(", ")}` : "",
    c.ended ? `It ENDED this round: ${c.ended.label}.` : "It is NOT over yet.",
  ];
  return lines.filter(Boolean).join("\n");
}

export async function modelRound(o: RoundInput, settings: Settings, userId?: string): Promise<string | null> {
  const pov = storyPov(o.story, o.player);
  const enc = o.before.encounter ? o.r.encounters[o.before.encounter.id] : undefined;
  const user = [
    o.story ? `The story so far (excerpt):\n${o.story.slice(-1800)}` : "",
    enc ? `The encounter: ${enc.name}${enc.desc ? ` — ${enc.desc.replace(/\{\{user\}\}/gi, o.player)}` : ""}` : "",
    `The other side: ${foeName(o.r, o.before)}${o.foeAbout ? `\n${o.foeAbout.slice(0, 1500)}` : ""}`,
    o.earlier.length ? `Earlier rounds (don't repeat their wording):\n${o.earlier.slice(-4).join("\n\n")}` : "",
    `This round:\n${facts(o, pov)}`,
  ].filter(Boolean).join("\n\n");
  try {
    const text = (await askProse(ROUND_SYSTEM, user, settings, userId, 20000, { temperature: 0.85 }))
      .replace(/^(?:here'?s[^:]*:|round \d+:)\s*/i, "").trim();
    return text.length < 40 ? null : text;
  } catch (e) {
    logError("encounter round", e);
    return null;
  }
}

export async function writeRound(o: RoundInput, settings: Settings, userId?: string): Promise<string> {
  return (await modelRound(o, settings, userId)) ?? scriptedRound(o);
}

// ───────────────────────── the closing paragraph ─────────────────────────

export interface SummaryInput {
  r: Ruleset; start: GameState; end: GameState; encId: string; foe: string;
  outcome: { label: string; loss: boolean }; rounds: string[]; player: string; story: string;
}

export function scriptedSummary(o: SummaryInput): string {
  const enc = o.r.encounters[o.encId];
  const pov = storyPov(o.story, o.player);
  const subject = pov === "second" ? "you" : o.player;
  const moved: string[] = [];
  for (const id of o.r.statOrder) {
    const a = o.start.stats[id], b = o.end.stats[id];
    const def = o.r.stats[id];
    if (a === undefined || b === undefined || def.kind === "hidden" || Math.abs(b - a) < 3) continue;
    moved.push(`${def.label.toLowerCase()} ${b > a ? "up" : "down"}`);
  }
  const n = o.rounds.length;
  const how = `${cap(enc?.name ?? "The encounter")} with ${o.foe}: ${o.outcome.label.toLowerCase()}${n > 1 ? ` after ${n} rounds` : ""}.`;
  return `*${how}${moved.length ? ` It left ${subject} with ${moved.slice(0, 3).join(", ")}.` : ""}*`;
}

export async function encounterSummary(o: SummaryInput, settings: Settings, userId?: string): Promise<string> {
  const fallback = scriptedSummary(o);
  const pov = storyPov(o.story, o.player);
  try {
    const text = (await askProse(
      [
        "Sum up a finished encounter from a roleplay as ONE short paragraph the story keeps in place of the blow-by-blow.",
        "2–3 sentences, under 70 words, in the story's point of view and tense. Say how it ended and what it cost or gained, using only the facts given.",
        "No numbers, game terms or headings. Adults only in anything romantic. Reply with the paragraph only.",
      ].join("\n"),
      [
        `Point of view: ${pov === "second" ? `second person ("you" is ${o.player})` : `third person (${o.player})`}`,
        `How it ended: ${o.outcome.label}${o.outcome.loss ? " (a defeat)" : ""}`,
        `The facts in short: ${fallback.replace(/\*/g, "")}`,
        `The rounds as they were told:\n${o.rounds.slice(-8).join("\n\n")}`,
      ].join("\n\n"),
      settings, userId, 20000, { temperature: 0.6 },
    )).trim();
    return text.length > 30 && text.length < 900 ? text : fallback;
  } catch {
    return fallback;
  }
}
