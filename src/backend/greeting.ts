// The greeting read (CORE-DESIGN §2.1.2, JEV-ROUTING §4.6): once per greeting swipe, before the first turn,
// read the opening message for the start time, the place, who is here, first looks and who is an adult, and
// write the turn-0 choices. It is stored as an ordinary record (`src: "start"` events) on the greeting's
// active swipe, so the state follows the greeting swipe for free.

import type { LiveChoice, TurnRecord } from "../engine/resolve.js";
import type { Ruleset } from "../engine/ruleset.js";
import { applyGreeting, type GreetingRead } from "../engine/scene.js";
import { applyEvent, cloneState, initialState, personName, type GameState } from "../engine/state.js";
import type { Settings } from "../shared/protocol.js";
import { getTurnDecider } from "./deciders.js";
import { newMeter, safeAsk, type CallMeter } from "./decisions.js";
import { ask, firstJson } from "./helpers.js";
import { host, logError } from "./host.js";
import { activeRecord, getMessages, patchWarpMeta, warpMeta, type Msg } from "./ledger.js";
import { cleanChoices, liveCount, liveWanted, usableTags } from "./live.js";
import { greetingFromAnswers, greetingQuestions, THRESHOLDS, type TextTask } from "./questions.js";
import { getSettings } from "./settings.js";
import { characterBrief, getRuleset } from "./source.js";
import { choiceLines, writeTurn } from "./write.js";

/** Shown in the Scene section when the greeting couldn't be read. */
export const GREETING_HINT = "Warp couldn't read the greeting — set the time.";

/** The chat's greeting: its first message, when that is the character's (not the player's). */
export function greetingOf(msgs: Msg[]): Msg | null {
  const first = msgs[0];
  return first && !first.is_user ? first : null;
}

/**
 * The greeting still needs its read: it has none on its active swipe, and no later message has a record yet
 * (a read after play started would rewrite the start of a path that later records depend on).
 */
export function greetingPending(msgs: Msg[]): Msg | null {
  const g = greetingOf(msgs);
  if (!g || !g.content.trim()) return null;
  if (warpMeta(g).greeted?.[String(g.swipe_id ?? 0)]) return null;
  if (msgs.slice(1).some((m) => activeRecord(m))) return null;
  return g;
}

/** The greeting read failed on the active greeting swipe (the Scene section shows a fix hint). */
export function greetingFailed(msgs: Msg[]): boolean {
  const g = greetingOf(msgs);
  return !!g && !!warpMeta(g).greeted?.[String(g.swipe_id ?? 0)]?.failed;
}

async function personaText(chatId: string): Promise<string> {
  try {
    const { text } = await host().macros.resolve("{{persona}}", { chatId, commit: false } as never);
    return text && text !== "{{persona}}" ? text : "";
  } catch { return ""; }
}

const text160 = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, 160) : null);
const looksOf = (v: unknown): { appearance: string | null; outfit: string | null } | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const l = { appearance: text160(o.appearance), outfit: text160(o.outfit) };
  return l.appearance || l.outfit ? l : null;
};

/** The helper's JSON (no Jev) → the engine's GreetingRead. Anything malformed is left out. */
export function parseGreeting(raw: Record<string, unknown>): GreetingRead {
  const read: GreetingRead = {};
  const t = raw.time && typeof raw.time === "object" ? raw.time as Record<string, unknown> : null;
  if (t) {
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
    read.time = { hour: num(t.hour), minute: num(t.minute), word: typeof t.word === "string" ? t.word : null, weekday: typeof t.weekday === "string" ? t.weekday : null };
  }
  const place = text160(raw.place);
  if (place) read.place = place.slice(0, 120);
  if (Array.isArray(raw.present)) read.present = raw.present.map(text160).filter((x): x is string => !!x && x.length <= 60).slice(0, 8);
  const you = looksOf(raw.you);
  if (you) read.you = you;
  if (raw.people && typeof raw.people === "object") {
    const people: Record<string, { appearance: string | null; outfit: string | null }> = {};
    for (const [name, v] of Object.entries(raw.people as Record<string, unknown>).slice(0, 8)) { const l = looksOf(v); if (l) people[name] = l; }
    if (Object.keys(people).length) read.people = people;
  }
  if (raw.adults && typeof raw.adults === "object") {
    const adults: Record<string, boolean> = {};
    for (const [name, v] of Object.entries(raw.adults as Record<string, unknown>)) if (typeof v === "boolean") adults[name] = v;
    if (Object.keys(adults).length) read.adults = adults;
  }
  return read;
}

/** The helper-only greeting prompt: one call answers everything and writes the turn-0 choices. */
export function greetingPrompt(r: Ruleset, s: GameState, o: { greeting: string; persona: string; card: string; player: string; count: number; settings: Pick<Settings, "lines"> }): { system: string; user: string } {
  const tracked = Object.keys(s.people).map((id) => personName(r, s, id));
  const sys = [
    `You read the opening message (the greeting) of a roleplay and set up the game's first scene. You never write story. ${o.player} is the player.`,
    "Reply with JSON only:",
    `{"time": {"hour": 0-23 or null, "minute": 0-59 or null, "word": "dawn|morning|noon|afternoon|evening|night|late night" or null, "weekday": "Monday"… or null},`,
    ` "place": "where ${o.player} is, in a few words" or null,`,
    ` "present": ["names of the people physically in the scene with ${o.player}"],`,
    ` "adults": {"Name": true or false, only when the greeting or the card makes it clear},`,
    ` "you": {"appearance": "...", "outfit": "..."}, "people": {"Name": {"appearance": "...", "outfit": "..."}}${o.count > 0 ? `, "choices": [...]` : ""}}`,
    "Time: only what the greeting says or clearly shows (\"the bar closes at midnight\" → late evening); null when it gives none.",
    "Looks and clothes: plain words, at most 20 words each, only what the greeting, the persona or the card shows; null when unknown.",
  ];
  // Who is here comes from this same read, so every tag is offered; targets are checked once the read is applied.
  if (o.count > 0) sys.push(choiceLines(r, s, o.player, o.count, usableTags(r, o.settings)).join("\n"));
  const user = [
    "Greeting:", o.greeting.slice(0, 4000), "",
    "Persona (the player):", o.persona.slice(0, 1200) || "(none)", "",
    "Card:", o.card.slice(0, 1500) || "(none)",
    ...(tracked.length ? ["", `People the game tracks: ${tracked.join(", ")}`] : []),
  ].join("\n");
  return { system: sys.join("\n"), user };
}

export interface GreetingResult { read: GreetingRead; choices: unknown[]; calls: CallMeter; ok: boolean }

/** Run the read: Jev classifies and the helper writes texts and choices; without Jev one helper call does it all. */
export async function readGreeting(r: Ruleset, o: { greeting: string; persona: string; card: string; player: string; settings: Settings; userId?: string }): Promise<GreetingResult> {
  const s = initialState(r);
  const calls = newMeter();
  const decider = await getTurnDecider(o.settings, o.userId);
  const count = o.settings.showChoices && liveWanted(r, s) ? liveCount(r, s) : 0;
  if (decider.id === "jev") {
    const g = greetingQuestions(r, s, o);
    const asked = await safeAsk(decider, g.state, g.questions, 6000, "greeting read", calls);
    if (asked.ok) {
      const { read, needPlace } = greetingFromAnswers(r, s, asked.answers, g.meta, THRESHOLDS.jev);
      // The helper writes only texts: looks for the player and whoever is here, a place name if none was picked.
      const after = cloneState(s);
      for (const e of applyGreeting(r, s, read)) applyEvent(after, e, r);
      const tasks: TextTask[] = [
        { kind: "first", who: "you", name: o.player },
        ...(read.present ?? []).map((n): TextTask => ({ kind: "first", who: n, name: n })),
        ...(needPlace ? [{ kind: "place" } as TextTask] : []),
      ];
      const w = await writeTurn({ r, s: after, reply: o.greeting, playerText: "", player: o.player, mode: "text", tasks, tags: usableTags(r, o.settings, after), count, settings: o.settings, userId: o.userId, meter: calls });
      const you = looksOf(w.texts["first:you"]);
      if (you) read.you = you;
      for (const n of read.present ?? []) { const l = looksOf(w.texts[`first:${n}`]); if (l) (read.people ??= {})[n] = l; }
      const place = text160(w.texts.place);
      if (needPlace && place) read.place = place.slice(0, 120);
      return { read, choices: w.choices, calls, ok: true };
    }
    // Jev failed: the helper does the whole read in its one call.
  }
  const { system, user } = greetingPrompt(r, s, { ...o, count });
  calls.helper++;
  try {
    const raw = firstJson(await ask(system, user, o.settings, o.userId, 30000, { temperature: 0.3 }));
    if (!raw) return { read: {}, choices: [], calls, ok: false };
    return { read: parseGreeting(raw), choices: Array.isArray(raw.choices) ? raw.choices : [], calls, ok: true };
  } catch (e) {
    logError("greeting read", e);
    return { read: {}, choices: [], calls, ok: false };
  }
}

const running = new Map<string, Promise<boolean>>();

/**
 * Read the chat's greeting if it still needs it, and store the result on its active swipe. Runs at most once
 * per greeting swipe; concurrent callers share the same run. Returns true when a record was written.
 */
export function ensureGreeting(chatId: string, userId?: string): Promise<boolean> {
  return (async () => {
    const msgs = await getMessages(chatId);
    const g = greetingPending(msgs);
    if (!g) return false;
    const key = JSON.stringify([chatId, g.id, g.swipe_id ?? 0]);
    const hit = running.get(key);
    if (hit) return hit;
    const run = runGreeting(chatId, g, userId).catch((e) => { logError("greeting", e); return false; });
    running.set(key, run);
    void run.finally(() => { if (running.get(key) === run) running.delete(key); });
    return run;
  })();
}

async function runGreeting(chatId: string, g: Msg, userId?: string): Promise<boolean> {
  const settings = await getSettings(userId);
  if (!settings.enabled) return false;
  const r = (await getRuleset(chatId, userId))?.ruleset;
  if (!r) return false;
  const { playerName } = await import("./turn.js");
  const player = await playerName(chatId, userId);
  const res = await readGreeting(r, { greeting: g.content, persona: await personaText(chatId), card: await characterBrief(chatId, userId).catch(() => ""), player, settings, userId });
  const swipe = g.swipe_id ?? 0;
  let wrote = false;
  await patchWarpMeta(chatId, g.id, async (w, current) => {
    // Only if nothing moved meanwhile: same swipe and text, and still no later records.
    const now = await getMessages(chatId);
    if ((current.swipe_id ?? 0) !== swipe || current.content !== g.content || now[0]?.id !== g.id || now.slice(1).some((m) => activeRecord(m))) return w;
    if (w.greeted?.[String(swipe)]) return w;
    const before = initialState(r);
    const events = res.ok ? applyGreeting(r, before, res.read) : [];
    const after = cloneState(before);
    for (const e of events) applyEvent(after, e, r);
    const existing = w.swipes?.[String(swipe)];
    // Player fixes made before the read stay on top of it.
    const rec: TurnRecord = { v: 1, hints: [], ...(existing ?? {}), events: [...events, ...(existing?.events ?? [])], calls: res.calls, at: existing?.at ?? Date.now() };
    const choices: LiveChoice[] = res.ok ? cleanChoices(r, after, usableTags(r, settings, after), res.choices, liveCount(r, after)) : [];
    wrote = true;
    return {
      ...w,
      swipes: { ...w.swipes, [String(swipe)]: rec },
      live: { ...w.live, [String(swipe)]: choices },
      greeted: { ...w.greeted, [String(swipe)]: { at: Date.now(), ...(res.ok ? {} : { failed: true }) } },
    };
  });
  return wrote;
}
