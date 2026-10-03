// Computing the full UI state for a chat and pushing it to the frontend.

import { buildChoices, buildHud, buildRecordView } from "../engine/view.js";
import type { EncounterLogView, RecordView } from "../shared/protocol.js";
import type { Ruleset } from "../engine/ruleset.js";
import { getMessages, foldPath, liveChoicesOf, warpMeta, encounterLogOf, type Msg } from "./ledger.js";
import { getSettings } from "./settings.js";
import { getRuleset, statusOf } from "./source.js";
import { host, logError, send } from "./host.js";

/** Latest folded state per chat (used by the lorebook gate). */
export const lastStates = new Map<string, import("../engine/state.js").GameState>();

/** Chats with a generation in flight (per chat id). */
export const busyChats = new Set<string>();
const activeChat = new Map<string, string | null>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const revisions = new Map<string, number>();
const key = (userId?: string) => userId ?? "_";

export function setActiveChat(userId: string | undefined, chatId: string | null) {
  activeChat.set(key(userId), chatId);
}

export function getActiveChat(userId: string | undefined): string | null {
  return activeChat.get(key(userId)) ?? null;
}

const MAX_RECORDS = 60;

export async function pushState(chatId: string | null, userId?: string, force = false): Promise<void> {
  const k = JSON.stringify([userId, chatId]);
  const revision = (revisions.get(k) ?? 0) + 1;
  revisions.set(k, revision);
  const current = () => revisions.get(k) === revision;
  try {
    const loaded = await getRuleset(chatId, userId, force);
    const status = statusOf(loaded);
    if (!chatId || !loaded?.ruleset) {
      if (current()) send({ type: "state", chatId, revision, status, hud: null, choices: [], records: [], latestMessageId: null, choicesAnchor: null, busy: false, player: "You" }, userId);
      return;
    }
    const r = loaded.ruleset;
    const settings = await getSettings(userId);
    const msgs = await getMessages(chatId);
    const { state, steps, conflict } = foldPath(r, msgs, MAX_RECORDS);
    lastStates.set(chatId, state);

    // A turn can be redone only while it's the latest exchange: the player's message and at most one reply after it.
    const redoable = (userMsgId: string) => {
      const i = msgs.findIndex((m) => m.id === userMsgId);
      return i >= 0 && msgs[i].is_user && msgs.length - 1 - i <= 1;
    };
    const indexOf = new Map(msgs.map((m, i) => [m.id, i]));

    const records: RecordView[] = steps
      .slice(-MAX_RECORDS)
      .map((st) => {
        const v = buildRecordView(r, st.message.id, st.message.swipe_id ?? 0, st.record, st.before, st.after);
        const prev = msgs[(indexOf.get(st.message.id) ?? 0) - 1];
        if (st.record.action?.via === "adjudicator" && prev?.is_user && redoable(prev.id)) v.redoFrom = prev.id;
        // Rolled on the click and told in the player's message: in Casual, roll it again from there.
        const pw = prev?.is_user ? warpMeta(prev) : null;
        if (settings.swipesReroll && pw?.intent?.tier && pw.said && redoable(prev!.id)) v.rerollFrom = prev!.id;
        return v;
      })
      .filter((v) => v.check || v.changes.length || v.action || v.decisions.length);

    const latest = msgs[msgs.length - 1] ?? null;
    const anchor = latest && !latest.is_user ? latest.id : null;
    // Rulesets name the player "{{user}}" (foe moves, hints, choices); show their persona's name.
    const view = await withName({
      type: "state" as const,
      chatId,
      revision,
      historyConflict: conflict,
      status,
      hud: settings.enabled ? buildHud(r, state) : null,
      choices: settings.enabled && !conflict ? buildChoices(r, state, { ...settings, live: liveChoicesOf(latest) }) : [],
      records: settings.enabled ? records : [],
      latestMessageId: latest?.id ?? null,
      choicesAnchor: anchor,
      busy: busyChats.has(chatId),
      // "{{user}}" becomes the persona's name in withName below.
      player: "{{user}}",
      encounterLogs: settings.enabled ? encounterLogsOf(r, msgs) : [],
    }, chatId, userId);
    if (current()) send(view, userId);
  } catch (e) {
    logError("pushState", e);
  }
}

/** Quiet encounter logs among the latest messages, for the round cards under them. */
function encounterLogsOf(r: Ruleset, msgs: Msg[]): EncounterLogView[] {
  const out: EncounterLogView[] = [];
  for (const m of msgs.slice(-30)) {
    const log = encounterLogOf(m);
    if (!log) continue;
    out.push({
      messageId: m.id, name: r.encounters[log.enc]?.name ?? "Encounter", foe: log.foe, status: log.status,
      rounds: log.rounds.map((x) => x.card), from: log.from ?? 0, ended: log.ended ?? null,
    });
  }
  return out;
}

/** Swap "{{user}}" for the player's persona name throughout a view. */
async function withName<T>(v: T, chatId: string, userId?: string): Promise<T> {
  if (!v) return v;
  const { playerName } = await import("./turn.js");
  const name = await playerName(chatId, userId).catch(() => "You");
  const safe = JSON.stringify(name).slice(1, -1);
  return JSON.parse(JSON.stringify(v).replace(/\{\{user\}\}/g, () => safe)) as T;
}

/** Coalesce bursts of events (swipe → edit → render) into one push. */
export function schedulePush(chatId: string | null | undefined, userId?: string, delay = 150) {
  if (!chatId) return;
  const active = getActiveChat(userId);
  if (active && active !== chatId) return;
  const k = `${key(userId)}:${chatId}`;
  const t = timers.get(k);
  if (t) clearTimeout(t);
  timers.set(k, setTimeout(() => {
    timers.delete(k);
    void pushState(chatId, userId);
  }, delay));
}

export async function connectionsFor(userId?: string): Promise<{ id: string; name: string }[]> {
  try {
    const list = await host().connections.list(userId);
    return list.map((c) => ({ id: c.id, name: `${c.name} — ${c.model}` }));
  } catch {
    return [];
  }
}
