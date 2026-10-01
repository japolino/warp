// Dates and dungeon moments played on the stage, off the chat. Each move is
// resolved by the rules like any turn and recorded quietly on the latest
// message; the stage gets a short snippet of lines instead of a chat reply.
// When a date or run ends, one narrator line goes into the chat so the story
// remembers it. Dates also get one picture: the place, with them in the middle.

import { randomSeed } from "../engine/dice.js";
import { resolveTurnFull, type Intent, type TurnRecord } from "../engine/resolve.js";
import type { Ruleset } from "../engine/ruleset.js";
import { applyEvent, cloneState, formatClock, personName, type GameState, type WarpEvent } from "../engine/state.js";
import { activeSession, moodOf } from "../engine/date/talk.js";
import type { SceneLine, SceneView } from "../shared/protocol.js";
import { revision } from "../shared/revision.js";
import { IMAGE_FITS, parseImageResult, type CueImageRequest, type ImageFit } from "../shared/cue-images.js";
import { odds } from "./decisions.js";
import { getTurnDecider } from "./deciders.js";
import { host, logError, send, toast } from "./host.js";
import { foldPath, getMessages, patchWarpMeta, pathRevision, warpMeta, type Msg } from "./ledger.js";
import { operationCurrent, releaseOperation, takeOperation } from "./operations.js";
import { getSettings } from "./settings.js";
import { characterBrief, getRuleset, personProfile } from "./source.js";
import { pushState } from "./state-push.js";
import { summaryLine, writeLines, type DungeonSummary } from "./snippets.js";

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
  imageRequest?: CueImageRequest;
  imageError?: string;
  imageFit?: ImageFit;
  imageAttempted?: boolean;
  imageSubject?: string;
  imageUser?: string;
  imageTimer?: ReturnType<typeof setTimeout>;
  /** Narrative path, excluding metadata saves made by Warp and companion extensions. */
  narrativeRevision?: string;
  /** The state when the date or run began (for the closing line). */
  start: GameState | null;
}

const logs = new Map<string, Log>();

function narrativeRevision(messages: Msg[]): string {
  return revision(messages.map((m) => [m.id, m.swipe_id ?? 0, m.content]));
}

/** Lumiverse emits MESSAGE_EDITED even for metadata-only updates. */
export async function invalidateSceneForEdit(chatId: string): Promise<void> {
  const log = logs.get(chatId);
  if (!log) return;
  const messages = await getMessages(chatId);
  // A new scene may have begun while the host read was in flight.
  if (logs.get(chatId) === log && log.narrativeRevision !== narrativeRevision(messages)) dropScene(chatId);
}

function logFor(chatId: string, kind: "date" | "dungeon"): Log {
  let l = logs.get(chatId);
  if (!l || l.kind !== kind) {
    if (l?.imageTimer) clearTimeout(l.imageTimer);
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
  return { kind, seq: l.seq, lines: l.lines, said: l.said, image: l.image, imageBusy: l.imageBusy, writing: l.writing,
    imageRequest: l.imageRequest, imageError: l.imageError, imageFit: l.imageFit };
}

async function playerNameOf(chatId: string, userId?: string): Promise<string> {
  const { playerName } = await import("./turn.js");
  return playerName(chatId, userId).catch(() => "You");
}

/**
 * Play one move on the stage: resolve it (asking the decision model for any
 * uncertain reaction), record it on the latest message, and write the snippet.
 * Dungeon mechanics arrive through `resolved`; this function only presents them.
 */
export async function playScene(opts: {
  chatId: string; userId?: string; kind: "date" | "dungeon"; intent: Intent | null; said: string | null;
  /** The player's own typed line, when they typed one. */
  typed?: string;
  /** @deprecated Ignored. Dungeon mechanics must already be committed. */
  pre?: WarpEvent[];
  /** The dungeon step that led here ended the run (left, or wiped out): where it got to. */
  runEnded?: DungeonSummary;
  /** Mechanics already committed by the dungeon. Presentation must not advance another turn. */
  resolved?: { before: GameState; after: GameState; rec: TurnRecord };
  operation?: symbol;
}): Promise<void> {
  const { chatId, userId, kind } = opts;
  const loaded = await getRuleset(chatId, userId);
  const r = loaded?.ruleset;
  if (!r) return;
  const settings = await getSettings(userId);
  const msgs = await getMessages(chatId);
  const last = msgs[msgs.length - 1];
  if (!last) { toast("warning", "Send a message first — the game attaches to the latest message.", userId); return; }
  const operation = opts.operation ?? takeOperation(chatId);
  if (!operation || !operationCurrent(chatId, operation)) { toast("info", "Wait for the current turn to finish first.", userId); return; }
  if (foldPath(r, msgs, 0).conflict) { if (!opts.operation) releaseOperation(chatId, operation); return; }
  const log = logFor(chatId, kind);
  log.narrativeRevision = narrativeRevision(msgs);
  log.writing = true;
  log.said = opts.said;
  send({ type: "busy", chatId, busy: true, label: kind === "date" ? "…" : "The dungeon stirs…" }, userId);
  try {
    // The state before this move (the dungeon's own step is already recorded).
    const before = opts.resolved?.before ?? foldPath(r, msgs, 0).state;
    if (!log.start) log.start = cloneState(before);
    const player = await playerNameOf(chatId, userId);
    const seed = randomSeed();
    const playerText = opts.typed ?? opts.said ?? "";
    let res: ReturnType<typeof resolveTurnFull> = kind === "dungeon"
      ? { record: opts.resolved?.rec ?? { v: 1, hints: [], events: [], at: Date.now() }, needs: [] }
      : resolveTurnFull(r, before, opts.intent, { seed, veils: settings.veils, playerText });
    const decider = res.needs.length ? await getTurnDecider(settings, userId) : null;
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
    if (res.needs.length && decider && decider.id !== "rules") {
      const recent = log.history.slice(-4).map((l) => `${l.speaker ?? ""}${l.speaker ? ": " : ""}${l.text}`).join("\n");
      const o = await odds({ decider, r, s: before, specs: res.needs, playerText, sceneText: recent, player, timeoutMs: 15000, card });
      if (Object.keys(o).length) res = resolveTurnFull(r, before, opts.intent, { seed, veils: settings.veils, odds: o, playerText });
    }
    const rec = res.record;
    const after = opts.resolved?.after ?? cloneState(before);
    if (!opts.resolved) for (const e of rec.events) applyEvent(after, e, r);

    // Recorded quietly on the latest message, like any sheet change.
    const swipe = last.swipe_id ?? 0;
    const existing = warpMeta(last).swipes?.[String(swipe)];
    const merged: TurnRecord = existing ? { ...existing, events: [...existing.events, ...rec.events] } : { v: 1, hints: [], events: rec.events, at: Date.now() };
    if (kind === "date") await patchWarpMeta(chatId, last.id, async (w, current) => {
      if (!operationCurrent(chatId, operation) || pathRevision(await getMessages(chatId)) !== pathRevision(msgs)) throw new Error("The date changed before its result could commit");
      const slot = String(current.swipe_id ?? 0), prev = w.swipes?.[slot];
      return { ...w, swipes: { ...w.swipes, [slot]: prev ? { ...prev, events: [...prev.events, ...rec.events] } : merged } };
    });
    await pushState(chatId, userId);

    // Dates get their picture while the first lines are written.
    const sess = activeSession(r, after);
    if (kind === "date" && sess && settings.dateImages && requestDateImage(chatId, userId, r, after, log)) await pushState(chatId, userId);

    const lines = await writeLines({ kind, r, before, after, rec, player, said: opts.said, recent: log.history, card, seed }, settings, userId);
    if (!operationCurrent(chatId, operation) || logs.get(chatId) !== log) return;
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
      const dungeon = opts.runEnded ?? (run ? { name: r.dungeons[run.id]?.name ?? "the dungeon", depth: run.depth, gold: 0, outcome: "left" as const } : null);
      const line = await summaryLine({ kind, r, start, end: after, lines: log.history, player, settings, userId, who, venue, dungeon });
      if (!operationCurrent(chatId, operation) || logs.get(chatId) !== log) return;
      await host().chat.appendMessage(chatId, { role: "assistant", content: line });
      dropScene(chatId);
    }
  } catch (e) {
    logError("scene", e);
    log.writing = false;
    toast("warning", "That didn't go through — try again.", userId);
  } finally {
    if (!opts.operation && releaseOperation(chatId, operation)) send({ type: "busy", chatId, busy: false }, userId);
    await pushState(chatId, userId);
  }
}

// ───────────────────────── the date's picture ─────────────────────────

function imageSubject(r: Ruleset, s: GameState): string | null {
  const sess = activeSession(r, s);
  return sess ? JSON.stringify([sess.who, sess.kind, sess.venue ?? s.location ?? null, sess.started]) : null;
}
function requestDateImage(chatId: string, userId: string | undefined, r: Ruleset, s: GameState, log: Log, retry = false) {
  const sess = activeSession(r, s), subject = imageSubject(r, s);
  if (!sess || !subject) return;
  if (log.imageSubject !== subject) {
    if (log.imageTimer) clearTimeout(log.imageTimer);
    log.image = null; log.imageBusy = false; log.imageAttempted = false; log.imageError = undefined;
    log.imageRequest = undefined; log.imageFit = undefined;
  }
  if (!retry && log.imageAttempted) return;
  if (log.imageTimer) clearTimeout(log.imageTimer);
  log.imageSubject = subject; log.imageUser = userId;
  log.imageAttempted = true; log.imageBusy = true; log.imageError = undefined;
  log.imageRequest = {
    version: 1, provider: "warp", chatId, requestId: randomSeed(),
    characterName: personName(r, s, sess.who),
    venue: (sess.venue ? r.dating.venues[sess.venue]?.name : null) ?? s.locationName ?? (s.location ? r.locations[s.location]?.name : null) ?? null,
    timeOfDay: r.clock.enabled ? formatClock(r, s.minutes).phase : null,
    mood: moodOf(sess.mood).label,
  };
  // Backend fallback if the browser disappears before reporting an error.
  const request = log.imageRequest;
  log.imageTimer = setTimeout(() => {
    if (logs.get(chatId) !== log || log.imageRequest !== request) return;
    log.imageBusy = false; log.imageRequest = undefined;
    log.imageError = "Cue did not finish the picture. You can retry it.";
    void pushState(chatId, userId).catch((e) => logError("date image timeout", e));
  }, 310_000);
  return true;
}

export async function setDateImageFit(chatId: string, fit: ImageFit, userId?: string) {
  const log = logs.get(chatId);
  if (!log || log.imageUser !== userId || !IMAGE_FITS.includes(fit)) return;
  log.imageFit = fit;
  await pushState(chatId, userId);
}

export async function acceptDateImage(chatId: string, value: unknown, userId?: string): Promise<void> {
  const result = parseImageResult(value), log = logs.get(chatId);
  if (!result || result.status === "accepted" || result.chatId !== chatId || !log
    || log.imageUser !== userId || result.requestId !== log.imageRequest?.requestId) return;
  const r = (await getRuleset(chatId, userId))?.ruleset;
  if (!r) return;
  const folded = foldPath(r, await getMessages(chatId), 0);
  if (logs.get(chatId) !== log || log.imageRequest?.requestId !== result.requestId
    || folded.conflict || imageSubject(r, folded.state) !== log.imageSubject) return;
  if (log.imageTimer) clearTimeout(log.imageTimer);
  log.imageTimer = undefined; log.imageBusy = false; log.imageRequest = undefined;
  if (result.status === "ready") { log.image = result.imageUrl; log.imageFit = result.fit; log.imageError = undefined; }
  else log.imageError = result.error;
  await pushState(chatId, userId);
}

export async function retryDateImage(chatId: string, userId?: string): Promise<void> {
  const r = (await getRuleset(chatId, userId))?.ruleset;
  if (!r || !(await getSettings(userId)).dateImages) return;
  const messages = await getMessages(chatId);
  const folded = foldPath(r, messages, 0);
  if (folded.conflict || !activeSession(r, folded.state)) return;
  const log = logFor(chatId, "date");
  if (log.imageBusy) return;
  log.narrativeRevision = narrativeRevision(messages);
  requestDateImage(chatId, userId, r, folded.state, log, true);
  await pushState(chatId, userId);
}

/** Forget a chat's stage lines (a chat switch doesn't need this; a new date or run starts fresh by itself). */
export function dropScene(chatId: string) {
  const log = logs.get(chatId);
  if (log?.imageTimer) clearTimeout(log.imageTimer);
  logs.delete(chatId);
}
