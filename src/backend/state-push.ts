// Computing the full UI state for a chat and pushing it to the frontend.

import { buildChoices, buildHud, buildMap, buildRecordView } from "../engine/view.js";
import type { RecordView, SuggestionView } from "../shared/protocol.js";
import { getMessages, foldPath, liveChoicesOf, warpMeta } from "./ledger.js";
import { getSettings } from "./settings.js";
import { getRuleset, statusOf } from "./source.js";
import { host, logError, send } from "./host.js";

/** Latest folded state per chat (used by the lorebook gate). */
export const lastStates = new Map<string, import("../engine/state.js").GameState>();

/** Chats with a generation in flight (per chat id). */
export const busyChats = new Set<string>();
const activeChat = new Map<string, string | null>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const key = (userId?: string) => userId ?? "_";

export function setActiveChat(userId: string | undefined, chatId: string | null) {
  activeChat.set(key(userId), chatId);
}

export function getActiveChat(userId: string | undefined): string | null {
  return activeChat.get(key(userId)) ?? null;
}

const MAX_RECORDS = 60;

export async function pushState(chatId: string | null, userId?: string, force = false): Promise<void> {
  try {
    const loaded = await getRuleset(chatId, userId, force);
    const status = statusOf(loaded);
    if (!chatId || !loaded?.ruleset) {
      send({ type: "state", chatId, status, hud: null, map: null, choices: [], records: [], suggestions: [], latestMessageId: null, choicesAnchor: null, busy: false }, userId);
      return;
    }
    const r = loaded.ruleset;
    const settings = await getSettings(userId);
    const msgs = await getMessages(chatId);
    const { state, steps } = foldPath(r, msgs);
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
        return v;
      })
      .filter((v) => v.check || v.changes.length || v.action || v.decisions.length || (v.contradiction ?? 0) >= 0.6);

    const suggestions: SuggestionView[] = [];
    for (const m of msgs.slice(-6)) {
      const w = warpMeta(m);
      if (!m.is_user || !w.suggest || w.intent) continue;
      suggestions.push({ messageId: m.id, actionId: w.suggest.actionId, params: w.suggest.params, label: w.suggest.label, confidence: w.suggest.confidence, canRedo: redoable(m.id) });
    }
    const latest = msgs[msgs.length - 1] ?? null;
    const anchor = latest && !latest.is_user ? latest.id : null;
    send({
      type: "state",
      chatId,
      status,
      hud: settings.enabled ? buildHud(r, state) : null,
      map: settings.enabled ? buildMap(r, state) : null,
      choices: settings.enabled ? buildChoices(r, state, { ...settings, live: liveChoicesOf(latest) }) : [],
      records: settings.enabled ? records : [],
      suggestions: settings.enabled ? suggestions.filter((s) => s.canRedo) : [],
      latestMessageId: latest?.id ?? null,
      choicesAnchor: anchor,
      busy: busyChats.has(chatId),
    }, userId);
  } catch (e) {
    logError("pushState", e);
  }
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
