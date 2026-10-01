// Computing the full UI state for a chat and pushing it to the frontend.

import { buildChoices, buildHud, buildMap, buildRecordView } from "../engine/view.js";
import { buildDungeonEntries, buildDungeonView } from "../engine/dungeon/view.js";
import { buildDateView } from "../engine/date/view.js";
import { sceneViewFor } from "./scene.js";
import type { ChoiceView, EncounterLogView, RecordView, RulesetStatus, SuggestionView } from "../shared/protocol.js";
import type { Ruleset } from "../engine/ruleset.js";
import { momentKey, readyChoices } from "./drafts.js";
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
      if (current()) send({ type: "state", chatId, revision, status, hud: null, map: null, choices: [], records: [], suggestions: [], latestMessageId: null, choicesAnchor: null, busy: false, dungeon: null, dungeonEntries: [], date: null, scene: null }, userId);
      return;
    }
    const r = loaded.ruleset;
    const settings = await getSettings(userId);
    if (settings.enabled && settings.draftItemUses) maybeDraftItems(chatId, loaded.characterId, r, status.depth, userId);
    if (settings.enabled && settings.themeDating && r.dating.enabled) maybeThemeDating(chatId, loaded.characterId, userId);
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
    // Rulesets name the player "{{user}}" (foe moves, hints, choices); show their persona's name.
    const view = await withName({
      type: "state" as const,
      chatId,
      revision,
      historyConflict: conflict,
      status,
      hud: settings.enabled ? buildHud(r, state) : null,
      map: settings.enabled ? buildMap(r, state) : null,
      choices: settings.enabled && !conflict ? markReady(buildChoices(r, state, { ...settings, live: liveChoicesOf(latest) }), readyChoices(chatId, momentKey(msgs, state, { r, settings }))) : [],
      records: settings.enabled ? records : [],
      suggestions: settings.enabled ? suggestions.filter((s) => s.canRedo) : [],
      latestMessageId: latest?.id ?? null,
      choicesAnchor: anchor,
      busy: busyChats.has(chatId),
      dungeon: settings.enabled ? buildDungeonView(r, state) : null,
      dungeonEntries: settings.enabled ? buildDungeonEntries(r, state) : [],
      date: settings.enabled ? buildDateView(r, state, settings.lines) : null,
      scene: settings.enabled ? sceneViewFor(chatId, r, state) : null,
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

/** Rulesets whose dead items were already sent for drafting (by character and which items). */
const drafted = new Set<string>();

/** Items that do nothing get a use drafted once, in the background; the next push shows it. */
function maybeDraftItems(chatId: string, characterId: string | null, r: Ruleset, depth: RulesetStatus["depth"], userId?: string) {
  const dead = (depth?.gaps ?? []).filter((g) => g.id.startsWith("item-dead:")).map((g) => g.id).sort();
  if (!characterId || !dead.length) return;
  const key = `${characterId}:${dead.join(",")}`;
  if (drafted.has(key)) return;
  drafted.add(key);
  void import("./builder.js").then(({ draftItemUses }) => draftItemUses(chatId, userId))
    .then((names) => { if (names.length) { send({ type: "toast", level: "info", message: `Drafted what ${names.join(", ")} do — check the Ruleset tab.` }, userId); void pushState(chatId, userId, true); } })
    .catch((e) => logError("draft item uses", e));
  void r;
}

const themed = new Set<string>();

/** Dating still in its modern defaults gets re-themed for the card, once, in the background. */
function maybeThemeDating(chatId: string, characterId: string | null, userId?: string) {
  if (!characterId || themed.has(characterId)) return;
  themed.add(characterId);
  void import("./flavour.js").then(({ themeDating }) => themeDating(chatId, userId))
    .then((done) => { if (done) { send({ type: "toast", level: "info", message: `Dating re-themed for this card: ${done.topics} topics, ${done.venues} outings. Edit it in the "dating flavour" lorebook entry.` }, userId); void pushState(chatId, userId, true); } })
    .catch((e) => logError("theme dating", e));
}

function markReady(choices: ChoiceView[], ready: Set<string>): ChoiceView[] {
  return ready.size ? choices.map((c) => (ready.has(c.id) ? { ...c, ready: true } : c)) : choices;
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
