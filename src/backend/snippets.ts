// Short visual-novel snippets for the stage: a line or two for each thing that
// happens on a date or in the dungeon. The rules have already decided what
// happened; this only voices it. The helper model gets a tiny prompt of its own
// (never the chat's preset); scripted lines stand in when it's off, slow or fails.

import { seededRng } from "../engine/dice.js";
import type { TurnRecord } from "../engine/resolve.js";
import type { Ruleset } from "../engine/ruleset.js";
import { formatClock, personName, type GameState } from "../engine/state.js";
import { activeSession, moodOf } from "../engine/date/talk.js";
import { stageLabel } from "../engine/date/stage.js";
import { outcomePacket } from "../engine/view.js";
import type { Reaction } from "../engine/date/types.js";
import type { SceneLine, Settings } from "../shared/protocol.js";
import { ask, askProse, firstJson } from "./helpers.js";
import { fillNames } from "./inject.js";
import { logError } from "./host.js";

const MAX_LINES = 4;
const MAX_CHARS = 400;

/** Shortened at a sentence (or failing that a word) rather than mid-word. */
export function clipLine(text: string, max = MAX_CHARS): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "), cut.lastIndexOf("… "));
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  const word = cut.lastIndexOf(" ");
  return `${(word > max * 0.5 ? cut.slice(0, word) : cut).replace(/[\s,;:—-]+$/, "")}…`;
}

export interface SnippetInput {
  kind: "date" | "dungeon";
  r: Ruleset;
  before: GameState;
  after: GameState;
  rec: TurnRecord;
  player: string;
  /** What the player did or said this time. */
  said: string | null;
  /** The last few lines, so it reads as one conversation. */
  recent: SceneLine[];
  /** The character card, trimmed. */
  card: string;
  seed: string;
}

// ───────────────────────── scripted ─────────────────────────

const REACTION_LINES: Record<Reaction, string[]> = {
  love: ["Oh — I love that. Really.", "You too? Okay, now I have to hear everything.", "That's my favourite thing to talk about."],
  like: ["That's nice. Tell me more.", "Mm, I like that.", "Huh — yeah, that's good."],
  neutral: ["Huh. I guess.", "Sure, I suppose.", "Mm-hm."],
  dislike: ["Can we talk about something else?", "That's… not really my thing.", "Let's not."],
  hate: ["Seriously? Drop it.", "I'd rather not talk about that. At all.", "Wow. Okay."],
};
const REACTION_BEAT: Record<Reaction, string[]> = {
  love: ["{name} lights up.", "{name} leans in, grinning.", "{name}'s eyes go bright."],
  like: ["{name} smiles.", "{name} nods along.", "{name} relaxes a little."],
  neutral: ["{name} shrugs.", "{name} glances away for a moment.", "{name} offers a polite half-smile."],
  dislike: ["{name}'s smile thins.", "{name} shifts, uncomfortable.", "{name} looks elsewhere."],
  hate: ["{name}'s face goes cold.", "{name} folds their arms.", "{name} stiffens."],
};

const pick = <T>(xs: T[], rng: () => number) => xs[Math.floor(rng() * xs.length) % xs.length];

/** A direction for the narrator, as a plain sentence for the stage. */
function plain(text: string, player: string): string {
  return fillNames(text, player)
    .replace(/^Dungeon \([^)]*\)\s*(—\s*since last time:\s*)?/, "")
    .replace(/\s*Now:\s*/, " ")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The reaction this turn rolled, if it was a date reaction. */
function reactionOf(rec: TurnRecord): Reaction | null {
  const d = rec.decisions?.find((x) => x.id.startsWith("date:topic:") || x.id === "date:say");
  return (d?.picked as Reaction | undefined) ?? null;
}

export function scriptedLines(o: SnippetInput): SceneLine[] {
  const rng = seededRng(`${o.seed}:lines`);
  const out: SceneLine[] = [];
  if (o.kind === "date") {
    const sess = activeSession(o.r, o.after) ?? activeSession(o.r, o.before);
    const name = sess ? personName(o.r, o.after, sess.who) : "They";
    const reaction = reactionOf(o.rec);
    if (reaction) {
      out.push({ speaker: null, text: pick(REACTION_BEAT[reaction], rng).replace(/\{name\}/g, name) });
      out.push({ speaker: name, text: pick(REACTION_LINES[reaction], rng) });
      return out;
    }
  }
  // Anything else: what the rules said happened, as narration.
  for (const h of o.rec.hints) {
    const t = plain(h, o.player);
    if (t && !/^(?:This round's beats|Handle this beat)/.test(t)) out.push({ speaker: null, text: clipLine(t, 220) });
    if (out.length >= 3) break;
  }
  return out.length ? out : [{ speaker: null, text: o.kind === "date" ? "A quiet moment passes between you." : "The dungeon is quiet for a moment." }];
}

// ───────────────────────── model ─────────────────────────

function sceneFacts(o: SnippetInput): string[] {
  const { r, after } = o;
  const facts: string[] = [];
  if (r.clock.enabled) { const c = formatClock(r, after.minutes); facts.push(`Time: ${c.day}, ${c.time} (${c.phase})`); }
  if (o.kind === "date") {
    const sess = activeSession(r, after) ?? activeSession(r, o.before);
    if (sess) {
      const name = personName(r, after, sess.who);
      const desc = r.people[sess.who]?.desc;
      facts.push(`With: ${name}${desc ? ` — ${desc}` : ""}`);
      facts.push(`Where things stand: ${stageLabel(r, after, sess.who)}; ${name}'s mood right now: ${moodOf((activeSession(r, after) ?? sess).mood).label.toLowerCase()}`);
      const venue = sess.venue ? r.dating.venues[sess.venue]?.name : null;
      facts.push(`Place: ${venue ?? after.locationName ?? "somewhere"}${sess.kind === "outing" ? " (on a date)" : ""}`);
    }
  } else if (after.dungeon || o.before.dungeon) {
    const run = after.dungeon ?? o.before.dungeon!;
    facts.push(`Place: ${r.dungeons[run.id]?.name ?? "a dungeon"}, floor ${run.depth}`);
    const party = run.party.map((m) => m.id).filter((id) => o.after.people[id] || o.before.people[id]).map((id) => personName(o.r, o.after, id));
    if (party.length) facts.push(`With ${o.player}: ${party.join(", ")}`);
  } else if (after.locationName) facts.push(`Place: ${after.locationName}`);
  return facts;
}

const SYSTEM = [
  "You write the next moment of a visual-novel scene (a date, a talk, a dungeon step) played alongside a roleplay.",
  "The game's rules have already decided this moment's outcome: how it was taken, and anything that changed. Keep that outcome.",
  "Everything else is yours: what they say and how they say it, gestures, the place around them, callbacks to earlier lines, a question back, teasing, subtext, a small surprise.",
  `Write 1 to ${MAX_LINES} lines and let the moment set the length: a shrug can be one line, something that lands can take a short run of narration and speech. Keep each line under about 45 words. Present tense.`,
  "Give them their own voice from the character card: opinions, humour, quirks, history. Don't just echo the player's words back or describe the rules.",
  "Don't put new words or actions in the player character's mouth; react to what they did.",
  "Romance and anything sexual only ever involve adults.",
  'Reply with JSON only: {"lines": [{"speaker": "Name" or "", "text": "..."}]} — speaker "" is narration.',
].join("\n");

export async function modelLines(o: SnippetInput, settings: Settings, userId?: string): Promise<SceneLine[] | null> {
  const outcome = outcomePacket(o.r, o.rec, o.before, o.after, o.player);
  const user = [
    o.card ? `Who's who (for voice and appearance):\n${o.card.slice(0, 3000)}` : "",
    `The player character: ${o.player}`,
    sceneFacts(o).join("\n"),
    o.recent.length ? `Just before:\n${o.recent.slice(-4).map((l) => `${l.speaker ?? "(narration)"}: ${l.text}`).join("\n")}` : "",
    o.said ? `${o.player} now: ${o.said}` : "",
    outcome ? `What the rules decided (keep the outcome; how it plays out is yours):\n${fillNames(outcome, o.player)}` : "",
  ].filter(Boolean).join("\n\n");
  try {
    const raw = firstJson(await ask(SYSTEM, user, settings, userId, 15000, { temperature: 0.9 }));
    const lines = Array.isArray(raw?.lines) ? raw!.lines : [];
    const out: SceneLine[] = [];
    for (const l of lines.slice(0, MAX_LINES)) {
      const text = typeof (l as { text?: unknown })?.text === "string" ? (l as { text: string }).text.trim().replace(/\s+/g, " ") : "";
      if (!text) continue;
      const sp = typeof (l as { speaker?: unknown }).speaker === "string" ? (l as { speaker: string }).speaker.trim() : "";
      out.push({ speaker: sp && sp.toLowerCase() !== "narration" && sp.toLowerCase() !== "narrator" ? sp.slice(0, 40) : null, text: clipLine(text) });
    }
    return out.length ? out : null;
  } catch (e) {
    logError("scene lines", e);
    return null;
  }
}

export async function writeLines(o: SnippetInput, settings: Settings, userId?: string): Promise<SceneLine[]> {
  if (settings.sceneLines === "model") {
    const lines = await modelLines(o, settings, userId);
    if (lines) return lines;
  }
  return scriptedLines(o);
}

// ───────────────────────── the line left in the chat ─────────────────────────

export interface DungeonSummary {
  name: string; depth: number;
  /** Gold actually banked, after caps, not the amount carried before defeat. */
  gold: number;
  outcome: "left" | "lost";
  lostGold?: number;
}

/** One narrator line for the chat when a date or run ends, so the story remembers it. */
export async function summaryLine(o: { kind: "date" | "dungeon"; r: Ruleset; start: GameState; end: GameState; lines: SceneLine[]; player: string; settings: Settings; userId?: string; who: string | null; venue: string | null; dungeon: DungeonSummary | null }): Promise<string> {
  const { r } = o;
  let fallback: string;
  if (o.kind === "date" && o.who) {
    const name = personName(r, o.end, o.who);
    const from = stageLabel(r, o.start, o.who), to = stageLabel(r, o.end, o.who);
    const where = o.venue ? ` at ${o.venue}` : o.end.locationName ? ` at ${o.end.locationName}` : "";
    fallback = `*${o.player} spent some time with ${name}${where}.${from !== to ? ` Things between them moved from ${from.toLowerCase()} to ${to.toLowerCase()}.` : ""}*`;
  } else if (o.dungeon) {
    fallback = o.dungeon.outcome === "lost"
      ? `*${o.player} was defeated on floor ${o.dungeon.depth} of ${o.dungeon.name} and returned outside, losing the run's haul${o.dungeon.lostGold ? ` of ${o.dungeon.lostGold} gold` : ""}.*`
      : `*${o.player} climbed back out of ${o.dungeon.name}, having reached floor ${o.dungeon.depth}${o.dungeon.gold ? `, banking ${o.dungeon.gold} gold` : ""}.*`;
  } else fallback = `*Some time passes.*`;
  if (o.settings.sceneLines !== "model") return fallback;
  try {
    const text = await askProse(
      "Summarise a finished mini-game scene as ONE short narration sentence (under 35 words) for a roleplay's history, in italics with *asterisks*. Past tense, third person, no dialogue.",
      [`Facts: ${fallback.replace(/\*/g, "")}`, `How it went:\n${o.lines.slice(-10).map((l) => `${l.speaker ?? "(narration)"}: ${l.text}`).join("\n")}`].join("\n\n"),
      o.settings, o.userId, 12000, { temperature: 0.6 },
    );
    const line = text.trim().split("\n").find((x) => x.trim())?.trim() ?? "";
    return line.length > 10 && line.length < 400 ? (line.startsWith("*") ? line : `*${line.replace(/^\*|\*$/g, "")}*`) : fallback;
  } catch {
    return fallback;
  }
}
