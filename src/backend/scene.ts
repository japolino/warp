// Dates and dungeon moments played on the stage, off the chat. Each move is
// resolved by the rules like any turn and recorded quietly on the latest
// message; the stage gets a short snippet of lines instead of a chat reply.
// When a date or run ends, one narrator line goes into the chat so the story
// remembers it. Dates also get one picture: the place, with them in the middle.

import { randomSeed } from "../engine/dice.js";
import { resolveTurnFull, type Intent, type TurnRecord } from "../engine/resolve.js";
import type { Ruleset } from "../engine/ruleset.js";
import { applyEvent, cloneState, formatClock, personName, type GameState, type WarpEvent } from "../engine/state.js";
import { activeSession } from "../engine/date/talk.js";
import type { SceneLine, SceneView, Settings } from "../shared/protocol.js";
import { odds } from "./decisions.js";
import { getDecider } from "./deciders.js";
import { ask } from "./helpers.js";
import { host, logError, send, toast } from "./host.js";
import { appendOperation, foldPath, getMessages, requireCurrentPath, warpMeta, writeRecord } from "./ledger.js";
import { resolveWithDecisions } from "./decision-loop.js";
import { currentCommand } from "./serial.js";
import { getSettings } from "./settings.js";
import { characterBrief, characterForChat, getRuleset, personProfile } from "./source.js";
import { busyChats, pushState } from "./state-push.js";
import { summaryLine, writeLines } from "./snippets.js";

interface Log {
  kind: "date" | "dungeon";
  seq: number;
  lines: SceneLine[];
  said: string | null;
  /** Everything said this date or run, for continuity and the closing line. */
  history: SceneLine[];
  writing: boolean;
  image: string | null;
  imageBusy: boolean;
  /** The state when the date or run began (for the closing line). */
  start: GameState | null;
}

const logs = new Map<string, Log>();

function logFor(chatId: string, kind: "date" | "dungeon"): Log {
  let l = logs.get(chatId);
  if (!l || l.kind !== kind) {
    l = { kind, seq: 0, lines: [], said: null, history: [], writing: false, image: null, imageBusy: false, start: null };
    logs.set(chatId, l);
  }
  return l;
}

/** What the stage shows for this chat right now (null when nothing's on). */
export function sceneViewFor(chatId: string, r: Ruleset, s: GameState): SceneView | null {
  const kind = s.dungeon ? "dungeon" : activeSession(r, s) ? "date" : null;
  const l = logs.get(chatId);
  if (!kind) return null;
  if (!l || l.kind !== kind) return { kind, seq: 0, lines: [], said: null, image: null, imageBusy: false, writing: false };
  return { kind, seq: l.seq, lines: l.lines, said: l.said, image: l.image, imageBusy: l.imageBusy, writing: l.writing };
}

async function playerNameOf(chatId: string, userId?: string): Promise<string> {
  const { playerName } = await import("./turn.js");
  return playerName(chatId, userId).catch(() => "You");
}

/**
 * Play one move on the stage: resolve it (asking the decision model for any
 * uncertain reaction), record it on the latest message, and write the snippet.
 * `pre` are events already made by the dungeon for this step.
 */
export async function playScene(opts: {
  chatId: string; userId?: string; kind: "date" | "dungeon"; intent: Intent | null; said: string | null;
  /** The player's own typed line, when they typed one. */
  typed?: string; pre?: WarpEvent[];
  /** The dungeon step that led here ended the run (left, or wiped out): where it got to. */
  runEnded?: { name: string; depth: number; gold: number };
}): Promise<void> {
  const { chatId, userId, kind } = opts;
  const loaded = await getRuleset(chatId, userId);
  let r = loaded?.ruleset;
  if (!r) return;
  const settings = await getSettings(userId);
  const msgs = await getMessages(chatId);
  const last = msgs[msgs.length - 1];
  if (!last) { toast("warning", "Send a message first — the game attaches to the latest message.", userId); return; }
  const log = logFor(chatId, kind);
  busyChats.add(chatId);
  log.writing = true;
  log.said = opts.said;
  send({ type: "busy", chatId, busy: true, label: kind === "date" ? "…" : "The dungeon stirs…" }, userId);
  try {
    // The state before this move (the dungeon's own step is already recorded).
    const fold = foldPath(r, msgs);
    requireCurrentPath(fold);
    const before = fold.state;
    r = fold.ruleset;
    if (!log.start) log.start = cloneState(before);
    const player = await playerNameOf(chatId, userId);
    const seed = randomSeed();
    const playerText = opts.typed ?? opts.said ?? "";
    const decider = await getDecider(settings, userId);
    // Who they are: on a date, a profile of that person (card, lorebook, the story so far) — scenario cards included.
    const partner = activeSession(r, before) ?? null;
    let card = "";
    if (kind === "date" || opts.intent?.actionId.startsWith("date:talk@")) {
      const who = partner?.who ?? opts.intent?.actionId.split("@")[1] ?? null;
      if (who) {
        const name = personName(r, before, who);
        const prof = await personProfile(chatId, name, userId, r.people[who]?.desc ? `${name}: ${r.people[who].desc}` : undefined).catch(() => null);
        if (prof) card = [prof.text ? `About ${name}:\n${prof.text}` : "", prof.scenario && prof.setting ? `The setting (the card is a scenario, not ${name}):\n${prof.setting}` : ""].filter(Boolean).join("\n\n");
      }
    }
    if (!card) card = await characterBrief(chatId, userId).catch(() => "");
    const recent = log.history.slice(-4).map((l) => `${l.speaker ?? ""}${l.speaker ? ": " : ""}${l.text}`).join("\n");
    const gameRules = r;
    const res = await resolveWithDecisions({
      resolve: (o) => resolveTurnFull(gameRules, before, opts.intent, { seed, veils: settings.veils, odds: o, playerText }),
      ask: decider.id === "rules" ? undefined : (specs, remaining, signal) => odds({ decider, r: gameRules, s: before, specs, playerText, sceneText: recent, player, timeoutMs: remaining, card, signal }),
      deadlineAt: Date.now() + 15000,
    });
    const rec = res.record;
    rec.commandId = currentCommand(chatId);
    const after = cloneState(before);
    for (const e of rec.events) applyEvent(after, e, r);

    // Recorded quietly on the latest message, like any sheet change.
    const swipe = last.swipe_id ?? 0;
    const existing = warpMeta(last).swipes?.[String(swipe)];
    const merged = appendOperation(existing, rec);
    await writeRecord(chatId, last.id, swipe, merged, r);
    await pushState(chatId, userId);

    // Dates get their picture while the first lines are written.
    const sess = activeSession(r, after);
    if (kind === "date" && sess && settings.dateImages && !log.image && !log.imageBusy) void dateImage(chatId, userId, r, after, sess.who, sess.venue ?? null, card, log);

    const lines = await writeLines({ kind, r, before, after, rec, player, said: opts.said, recent: log.history, card, seed }, settings, userId);
    log.lines = lines;
    log.history = [...log.history, ...(opts.said ? [{ speaker: player, text: opts.said.replace(/\*/g, "") }] : []), ...lines].slice(-40);
    log.seq += 1;
    log.writing = false;

    // Over: one line in the chat so the story remembers it.
    const ended = kind === "date" ? !!activeSession(r, before) && !sess : (!!before.dungeon && !after.dungeon) || !!opts.runEnded;
    if (ended) {
      const start = log.start ?? before;
      const who = kind === "date" ? activeSession(r, before)?.who ?? null : null;
      const bsess = activeSession(r, before);
      const venue = bsess?.venue ? r.dating.venues[bsess.venue]?.name ?? null : null;
      const run = before.dungeon;
      const dungeon = opts.runEnded ?? (run ? { name: r.dungeons[run.id]?.name ?? "the dungeon", depth: run.depth, gold: run.gold } : null);
      const line = await summaryLine({ kind, r, start, end: after, lines: log.history, player, settings, userId, who, venue, dungeon });
      await host().chat.appendMessage(chatId, { role: "assistant", content: line });
      logs.delete(chatId);
    }
  } catch (e) {
    logError("scene", e);
    log.writing = false;
    toast("warning", "That didn't go through — try again.", userId);
  } finally {
    busyChats.delete(chatId);
    send({ type: "busy", chatId, busy: false }, userId);
    await pushState(chatId, userId);
  }
}

// ───────────────────────── the date's picture ─────────────────────────

const IMAGE_STORE = "scene-images.json";
const inflight = new Set<string>();

async function dateImage(chatId: string, userId: string | undefined, r: Ruleset, s: GameState, who: string, venueId: string | null, card: string, log: Log): Promise<void> {
  const settings = await getSettings(userId);
  const characterId = await characterForChat(chatId, userId).catch(() => null);
  const place = venueId ?? s.location ?? "somewhere";
  const key = `${characterId ?? "chat"}:${who}:${place}`;
  let cache: Record<string, string> = {};
  try { cache = await host().userStorage.getJson<Record<string, string>>(IMAGE_STORE, { fallback: {}, userId }); } catch { /* first one */ }
  if (cache[key]) { log.image = cache[key]; await pushState(chatId, userId); return; }
  if (inflight.has(key)) return;
  inflight.add(key);
  log.imageBusy = true;
  await pushState(chatId, userId);
  try {
    const prompt = await imagePrompt(r, s, who, venueId, card, settings, userId);
    const res = await host().imageGen.generate({
      ...(settings.imageConnectionId ? { connection_id: settings.imageConnectionId } : {}),
      prompt,
      negativePrompt: "multiple people, crowd, text, watermark, signature, lowres, blurry, deformed, extra limbs, nsfw, nude",
      owner_chat_id: chatId,
      includeDataUrl: false,
      ...(userId ? { userId } : {}),
    } as never) as { imageUrl?: string; imageId?: string };
    const url = res.imageUrl ?? (res.imageId ? `/api/v1/images/${res.imageId}` : null);
    if (url) {
      cache = { ...cache, [key]: url };
      await host().userStorage.setJson(IMAGE_STORE, cache, { userId });
      log.image = url;
    }
  } catch (e) {
    logError("date picture", e);
  } finally {
    inflight.delete(key);
    log.imageBusy = false;
    await pushState(chatId, userId);
  }
}

/** The picture's prompt: the helper model reads the card and the place; a plain template if it can't. */
async function imagePrompt(r: Ruleset, s: GameState, who: string, venueId: string | null, card: string, settings: Settings, userId?: string): Promise<string> {
  const name = personName(r, s, who);
  const venue = venueId ? r.dating.venues[venueId] : null;
  const loc = s.location ? r.locations[s.location] : undefined;
  const placeName = venue?.name ?? s.locationName ?? "a quiet place";
  const placeDesc = loc?.desc ?? "";
  const phase = r.clock.enabled ? formatClock(r, s.minutes).phase : "day";
  const fallback = `${name}, one person, centered, upper body, facing the viewer, gentle smile, fully clothed, ${placeName}, ${phase}, detailed background, visual novel style, soft lighting`;
  try {
    const text = await ask(
      "Write ONE image-generation prompt as comma-separated tags for a visual-novel scene: exactly one adult character, centered in the frame, upper body, facing the viewer, fully clothed, with the place behind them as a detailed background. Take their appearance (hair, eyes, build, clothes) from what you're given. Tags only, no sentences, under 70 words.",
      [`Character: ${name}${r.people[who]?.desc ? ` — ${r.people[who].desc}` : ""}`, card ? `What's known about them (use only what describes ${name}):\n${card.slice(0, 3000)}` : "", `Place: ${placeName}${placeDesc ? ` — ${placeDesc}` : ""}`, `Time of day: ${phase}`].filter(Boolean).join("\n\n"),
      settings, userId, 20000, { temperature: 0.4, maxTokens: 160 },
    );
    const tags = text.replace(/```[a-z]*|```/g, "").split("\n").map((x) => x.trim()).find((x) => x.includes(",")) ?? "";
    return tags.length > 20 ? `${tags}, centered composition, visual novel style` : fallback;
  } catch {
    return fallback;
  }
}

/** Forget a chat's stage lines (a chat switch doesn't need this; a new date or run starts fresh by itself). */
export function dropScene(chatId: string) {
  logs.delete(chatId);
}
