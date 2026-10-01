// Quiet encounters: each round is resolved by the rules and told briefly in ONE
// encounter message that grows, instead of a player line plus a full narrator
// reply every round (which looped on repeated moves and burned the narrator's
// tokens). The rounds are recorded on that message, so deleting or swiping it
// undoes the encounter. When it ends, the log is replaced by one paragraph and
// play carries on. Encounters marked `narrate: true` keep the old way.

import { randomSeed } from "../engine/dice.js";
import { roundCard, outcomeLabel, isLoss } from "../engine/encounter-view.js";
import { findAction, odds as checkOdds, resolveTurnFull, type Intent, type TurnRecord } from "../engine/resolve.js";
import type { Ruleset } from "../engine/ruleset.js";
import { applyEvent, cloneState, foeName, type GameState } from "../engine/state.js";
import { odds, readTurn } from "./decisions.js";
import { getDecider } from "./deciders.js";
import { encounterSummary, writeRound } from "./encounter-lines.js";
import { host, logError, send, toast } from "./host.js";
import { activeRecord, foldPath, getMessages, warpMeta, type EncounterLog, type Msg } from "./ledger.js";
import { getSettings } from "./settings.js";
import { getRuleset, personProfile } from "./source.js";
import { busyChats, pushState } from "./state-push.js";

/** The current encounter plays quietly in a growing message (not narrated round by round). */
export function isQuiet(r: Ruleset, s: GameState): boolean {
  return !!s.encounter && !!r.encounters[s.encounter.id] && !r.encounters[s.encounter.id].narrate;
}

/** The message holding this encounter's log, if it's the latest message and still running. */
function logMessage(msgs: Msg[], s: GameState): { m: Msg; log: EncounterLog } | null {
  const m = msgs[msgs.length - 1];
  const log = m && !m.is_user ? warpMeta(m).encounter : undefined;
  return m && log && log.status === "on" && log.enc === s.encounter?.id ? { m, log } : null;
}

/** The story right before the encounter (narrator replies, not encounter logs), for voice and point of view. */
function storyBefore(msgs: Msg[]): string {
  const out: string[] = [];
  for (const m of [...msgs].reverse()) {
    if (m.is_user || warpMeta(m).encounter) continue;
    out.unshift(m.content);
    if (out.join("\n").length > 1800 || out.length >= 2) break;
  }
  return out.join("\n\n").slice(-1800);
}

async function playerNameOf(chatId: string, userId?: string): Promise<string> {
  const { playerName } = await import("./turn.js");
  return playerName(chatId, userId).catch(() => "You");
}

/**
 * Play one round: a clicked move (`intent`), or a typed line read into one.
 * Returns false when there's no quiet encounter to play (the caller carries on the usual way).
 */
export async function playRound(opts: { chatId: string; userId?: string; intent: Intent | null; typed?: string }): Promise<boolean> {
  const { chatId, userId } = opts;
  const loaded = await getRuleset(chatId, userId);
  const r = loaded?.ruleset;
  if (!r) return false;
  const msgs = await getMessages(chatId);
  const { state: before } = foldPath(r, msgs);
  if (!isQuiet(r, before)) return false;
  if (busyChats.has(chatId)) { toast("info", "One moment — the last round is still being written.", userId); return true; }
  busyChats.add(chatId);
  send({ type: "busy", chatId, busy: true, label: "The round plays out…" }, userId);
  try {
    const settings = await getSettings(userId);
    const decider = await getDecider(settings, userId);
    const player = await playerNameOf(chatId, userId);
    const story = storyBefore(msgs);
    const typed = opts.typed?.trim() || null;
    let intent = opts.intent;
    // Typed in the encounter: read what it attempts (a move, an item, or an improvised try).
    if (!intent && typed && decider.id !== "rules") {
      const reading = await readTurn({ decider, r, s: before, settings, playerText: typed, sceneText: story, player, timeoutMs: 15000 });
      const read = reading.intent ?? reading.suggestion;
      intent = read ? { actionId: read.actionId, via: "adjudicator", ...(read.params ? { params: read.params } : {}) } : null;
    }
    const found = intent ? findAction(r, before, intent.actionId) : null;
    const chance = found?.a.check ? checkOdds(r, before, found.a, intent?.params, found.target)?.success ?? null : null;
    const seed = randomSeed();
    const playerText = typed ?? found?.a.say ?? "";
    let res = resolveTurnFull(r, before, intent, { seed, veils: settings.veils, playerText });
    if (res.needs.length && decider.id !== "rules") {
      const o = await odds({ decider, r, s: before, specs: res.needs, playerText, sceneText: story, player, timeoutMs: 15000 });
      if (Object.keys(o).length) res = resolveTurnFull(r, before, intent, { seed, veils: settings.veils, odds: o, playerText });
    }
    const rec = res.record;
    if (!rec.events.length && !rec.action) { toast("warning", "That isn't possible right now.", userId); return true; }
    const after = cloneState(before);
    for (const e of rec.events) applyEvent(after, e, r);
    const held = logMessage(msgs, before);
    const told = await tellRound({ chatId, userId, r, before, after, rec, action: found?.a ?? null, chance, msgs, player, settings, typed, prev: held?.log ?? latestLog(msgs, before)?.log ?? null, same: !!held });
    const { log, content } = told;

    // Every round's changes land on the one message, so it folds (and undoes) as a whole.
    const prev = held ? activeRecord(held.m) : null;
    const merged: TurnRecord = {
      v: 1,
      ...(rec.action ? { action: rec.action } : prev?.action ? { action: prev.action } : {}),
      ...(rec.check ? { check: rec.check } : {}),
      hints: [],
      events: [...(prev?.events ?? []), ...rec.events],
      ...(prev?.decisions || rec.decisions ? { decisions: [...(prev?.decisions ?? []), ...(rec.decisions ?? [])] } : {}),
      at: Date.now(),
    };
    if (log.status === "ended") await foldEarlier(chatId, msgs, log.enc, held?.m.id ?? null);
    if (held) {
      const meta = { ...((held.m.metadata as Record<string, unknown>) ?? {}) };
      const w = { ...warpMeta(held.m), encounter: log, swipes: { ...(warpMeta(held.m).swipes ?? {}), [String(held.m.swipe_id ?? 0)]: merged } };
      meta.warp = w;
      await host().chat.updateMessage(chatId, held.m.id, { content, metadata: meta });
    } else {
      await host().chat.appendMessage(chatId, { role: "assistant", content, metadata: { warp: { encounter: log, swipes: { "0": merged } } } });
    }
    return true;
  } catch (e) {
    logError("encounter round", e);
    toast("warning", "That round didn't go through — try again.", userId);
    return true;
  } finally {
    busyChats.delete(chatId);
    send({ type: "busy", chatId, busy: false }, userId);
    await pushState(chatId, userId);
  }
}

/** The newest running log of the current encounter anywhere in the chat (a typed turn may sit after it). */
function latestLog(msgs: Msg[], s: GameState): { m: Msg; log: EncounterLog } | null {
  for (const m of [...msgs].reverse()) {
    const log = !m.is_user ? warpMeta(m).encounter : undefined;
    if (log?.status === "on" && log.enc === s.encounter?.id) return { m, log };
  }
  return null;
}

/** Tell one resolved round and add it to the log; when it ended, the log becomes one closing paragraph. */
async function tellRound(o: {
  chatId: string; userId?: string; r: Ruleset; before: GameState; after: GameState; rec: TurnRecord;
  action: import("../engine/ruleset.js").ActionDef | null; chance: number | null; msgs: Msg[]; player: string;
  settings: import("../shared/protocol.js").Settings; typed: string | null; prev: EncounterLog | null;
  /** This round goes into the message that holds `prev` (not a new one). */
  same: boolean;
}): Promise<{ log: EncounterLog; content: string }> {
  const { r, before, after, rec, player, settings } = o;
  const card = roundCard(r, rec, before, after, o.chance);
  const story = storyBefore(o.msgs);
  const earlier = o.prev?.rounds.map((x) => x.text) ?? [];
  const foe = foeName(r, before);
  const person = Object.values(before.people).some((p) => p.name.toLowerCase() === foe.toLowerCase());
  const foeAbout = person ? (await personProfile(o.chatId, foe, o.userId).catch(() => null))?.text ?? "" : "";
  const text = await writeRound({ r, before, after, rec, card, action: o.action, player, typed: o.typed, story, earlier, foeAbout, seed: rec.check?.seed ?? String(Date.now()) }, settings, o.userId);
  // A log continued in a new message (a typed turn came between) remembers every round but shows its own.
  const from = o.same ? o.prev?.from ?? 0 : o.prev?.rounds.length ?? 0;
  const log: EncounterLog = { enc: before.encounter!.id, foe, status: "on", from, rounds: [...(o.prev?.rounds ?? []), { text, card }] };
  let content = log.rounds.slice(from).map((x) => x.text).join("\n\n");
  if (card.ended) {
    const logMsg = o.msgs.find((m) => warpMeta(m).encounter === o.prev) ?? null;
    const start = startOf(r, o.msgs, firstLogOf(o.msgs, log.enc) ?? logMsg, before);
    const enc = r.encounters[log.enc];
    const ended = { label: outcomeLabel(enc, card.ended.outcome), loss: isLoss(enc, card.ended.outcome) };
    const summary = await encounterSummary({ r, start, end: after, encId: log.enc, foe, outcome: ended, rounds: log.rounds.map((x) => x.text), player, story }, settings, o.userId);
    log.status = "ended";
    log.summary = summary;
    log.ended = ended;
    content = summary;
  }
  return { log, content };
}

/** The first message of this encounter's running log (where it began). */
function firstLogOf(msgs: Msg[], enc: string): Msg | null {
  let first: Msg | null = null;
  for (const m of [...msgs].reverse()) {
    const log = !m.is_user ? warpMeta(m).encounter : undefined;
    if (log?.enc === enc && log.status === "on") first = m;
    else if (first) break;
  }
  return first;
}

/** When it ends, earlier pieces of the log (split by typed turns) shrink to a line; the last message holds the summary. */
async function foldEarlier(chatId: string, msgs: Msg[], enc: string, except: string | null): Promise<void> {
  for (const m of msgs) {
    const log = !m.is_user && m.id !== except ? warpMeta(m).encounter : undefined;
    if (!log || log.enc !== enc || log.status !== "on") continue;
    const meta = { ...((m.metadata as Record<string, unknown>) ?? {}) };
    meta.warp = { ...warpMeta(m), encounter: { ...log, status: "ended", summary: "" } };
    await host().chat.updateMessage(chatId, m.id, { content: `*The struggle with ${log.foe} went on…*`, metadata: meta }).catch((e) => logError("fold encounter log", e));
  }
}

export interface QuietRound { content: string; log: EncounterLog; fold: () => Promise<void> }

/** A round typed in the chat (already resolved by the turn): Warp's reply for it. */
export async function quietReply(o: {
  chatId: string; userId?: string; r: Ruleset; before: GameState; after: GameState; rec: TurnRecord;
  history: Msg[]; player: string; settings: import("../shared/protocol.js").Settings;
}): Promise<QuietRound> {
  const found = o.rec.action ? findAction(o.r, o.before, o.rec.action.id) : null;
  const chance = found?.a.check ? checkOdds(o.r, o.before, found.a, o.rec.action?.params, found.target)?.success ?? null : null;
  const lastUser = [...o.history].reverse().find((m) => m.is_user);
  const prev = latestLog(o.history, o.before)?.log ?? null;
  const { log, content } = await tellRound({ ...o, action: found?.a ?? null, chance, msgs: o.history, typed: lastUser?.content ?? null, prev, same: false });
  return { content, log, fold: () => foldEarlier(o.chatId, o.history, log.enc, null) };
}

/** The state when this encounter began (before its log message, if there is one). */
function startOf(r: Ruleset, msgs: Msg[], logMsg: Msg | null, fallback: GameState): GameState {
  if (!logMsg) return fallback;
  const i = msgs.findIndex((m) => m.id === logMsg.id);
  return i > 0 ? foldPath(r, msgs.slice(0, i)).state : fallback;
}

/** In the narrator's prompt, a running encounter's log shrinks to a line (an ended one already reads as its summary). */
export function compactLog(m: Msg): string | null {
  const log = warpMeta(m).encounter;
  if (!log || log.status !== "on") return null;
  const last = log.rounds[log.rounds.length - 1];
  return `[An encounter with ${log.foe} is under way — ${log.rounds.length} round${log.rounds.length === 1 ? "" : "s"} so far. Latest: ${last?.text.slice(0, 300) ?? ""}]`;
}

export const _test = { logMessage, storyBefore };
