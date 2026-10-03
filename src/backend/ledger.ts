// Per-message turn records.
//
// Each message carries `metadata.warp = { intent?, swipes: { [swipeIndex]: TurnRecord } }`.
// State for any point in the chat is the fold of the active swipe's record on
// every message before it. Provenance checks pause results whose earlier causes changed.
// Turn records also carry the turn's call meter (`calls`) and the post-reply read's `when_scene` answers (`sceneRead`).

import type { ChatMessageDTO } from "lumiverse-spindle-types";
import type { Intent, LiveChoice, TurnRecord } from "../engine/resolve.js";
import type { Difficulty, Ruleset } from "../engine/ruleset.js";
import { applyEvent, cloneState, initialState, type GameState } from "../engine/state.js";
import { host } from "./host.js";
import { revision } from "../shared/revision.js";

export type Msg = ChatMessageDTO & { role: "system" | "user" | "assistant"; metadata?: Record<string, unknown> };

export interface WarpMeta {
  intent?: Intent;
  /** The typed read already judged this message (intent may be absent = "not an action"). Swipes reuse the verdict. */
  judged?: boolean;
  /** What else the typed read decided, saved with the verdict so swipes never ask again. */
  verdict?: {
    /** The message starts a contest (it begins before the move lands). */
    contest?: { kind: string; opponent: string; threat?: Difficulty };
    /** `decide:` odds Jev gave for this message. */
    odds?: Record<string, Record<string, number>>;
    /** How sure the read was. */
    confidence?: number;
  };
  swipes?: Record<string, TurnRecord>;
  /** Choices written for the moment after this reply, per swipe. */
  live?: Record<string, LiveChoice[]>;
  /** The greeting read ran on this swipe (the greeting message only): when, and whether it failed. */
  greeted?: Record<string, { at: number; failed?: boolean }>;
}

/** The live choices offered under a reply (its active swipe). */
export function liveChoicesOf(m: Msg | null | undefined): LiveChoice[] {
  if (!m || m.is_user) return [];
  return warpMeta(m).live?.[String(m.swipe_id ?? 0)] ?? [];
}

export function warpMeta(m: Msg): WarpMeta {
  const w = (m.metadata as Record<string, unknown> | undefined)?.warp;
  return w && typeof w === "object" ? (w as WarpMeta) : {};
}

export function activeRecord(m: Msg): TurnRecord | null {
  return warpMeta(m).swipes?.[String(m.swipe_id ?? 0)] ?? null;
}

export async function getMessages(chatId: string): Promise<Msg[]> {
  const msgs = (await host().chat.getMessages(chatId)) as Msg[];
  return [...msgs].sort((a, b) => a.index_in_chat - b.index_in_chat);
}

/** Narrative and mechanics both belong to the path revision; unrelated metadata does not. */
export function pathRevision(msgs: Msg[]): string {
  return revision(msgs.map((m) => { const rec = activeRecord(m); return [m.id, m.swipe_id ?? 0, m.content, rec ? { ...rec, path: undefined } : null]; }));
}

const ruleRevisions = new WeakMap<Ruleset, string>();
function rulesRevision(r: Ruleset): string {
  let id = ruleRevisions.get(r);
  if (!id) { id = revision(r); ruleRevisions.set(r, id); }
  return id;
}
function nextPath(path: string, m: Msg): string {
  const rec = activeRecord(m);
  return revision([path, m.id, m.swipe_id ?? 0, m.content, rec ? { ...rec, path: undefined } : null]);
}
export function recordPath(r: Ruleset, msgs: Msg[]): string {
  let path = rulesRevision(r);
  for (const m of msgs) path = nextPath(path, m);
  return path;
}
export function withRecordPath(rec: TurnRecord, r: Ruleset, before: Msg[]): TurnRecord {
  return { ...rec, path: recordPath(r, before) };
}

export interface FoldStep { message: Msg; record: TurnRecord; before: GameState; after: GameState }

/** Fold the active path. Returns the final state and every step that had a record. */
export function foldPath(r: Ruleset, msgs: Msg[], stepLimit = Infinity): { state: GameState; steps: FoldStep[]; conflict: string | null } {
  let s = initialState(r);
  let path = rulesRevision(r);
  const steps: FoldStep[] = [];
  const skip = Math.max(0, msgs.reduce((n, m) => n + (activeRecord(m)?.events.length ? 1 : 0), 0) - Math.max(0, stepLimit));
  let records = 0;
  for (const m of msgs) {
    const rec = activeRecord(m);
    if (rec?.path && rec.path !== path) return { state: s, steps, conflict: m.id };
    path = nextPath(path, m);
    if (!rec?.events?.length) continue;
    if (records++ < skip) {
      for (const e of rec.events) applyEvent(s, e, r);
      continue;
    }
    const before = s;
    const after = cloneState(s);
    for (const e of rec.events) applyEvent(after, e, r);
    steps.push({ message: m, record: rec, before, after });
    s = after;
  }
  return { state: s, steps, conflict: null };
}

/** State-only consumers need no historical state snapshots. */
export function foldState(r: Ruleset, msgs: Msg[]): GameState { return foldPath(r, msgs, 0).state; }

// The host replaces the whole metadata object. Every Warp writer must share this
// queue, including writers of top-level keys owned by companion extensions.
const metadataWrites = new Map<string, Promise<void>>();

function serializeMetadata(chatId: string, messageId: string, edit: () => Promise<void>): Promise<void> {
  const key = JSON.stringify([chatId, messageId]);
  const result = (metadataWrites.get(key) ?? Promise.resolve()).then(edit);
  const tail = result.catch(() => {});
  metadataWrites.set(key, tail);
  void tail.then(() => { if (metadataWrites.get(key) === tail) metadataWrites.delete(key); });
  return result;
}

/** Read the latest metadata inside the shared write queue; preserve unrelated keys. */
export function patchWarpMeta(chatId: string, messageId: string, fn: (w: WarpMeta, message: Msg) => WarpMeta | Promise<WarpMeta>, content?: string): Promise<void> {
  return serializeMetadata(chatId, messageId, async () => {
    const m = (await getMessages(chatId)).find((x) => x.id === messageId);
    if (!m) throw new Error("Message not found");
    const meta = { ...((m.metadata as Record<string, unknown>) ?? {}) };
    const next = await fn({ ...warpMeta(m) }, m);
    const unstamped = Object.entries(next.swipes ?? {}).filter(([, rec]) => !rec.path);
    if (unstamped.length) {
      const { getRuleset } = await import("./source.js");
      const r = (await getRuleset(chatId))?.ruleset;
      if (r) {
        const messages = await getMessages(chatId);
        const before = messages.filter((x) => x.index_in_chat < m.index_in_chat);
        next.swipes = { ...next.swipes };
        for (const [slot, rec] of unstamped) next.swipes[slot] = withRecordPath(rec, r, before);
      }
    }
    if (JSON.stringify(meta.warp) === JSON.stringify(next) && (content === undefined || content === m.content)) return;
    meta.warp = next;
    await host().chat.updateMessage(chatId, messageId, { metadata: meta, ...(content === undefined ? { skipChunkRebuild: true } : { content }) });
  });
}

/** Set one top-level metadata key (read-merge-write, like patchWarpMeta). */
export function patchMeta(chatId: string, messageId: string, key: string, value: unknown): Promise<void> {
  return serializeMetadata(chatId, messageId, async () => {
    const m = (await getMessages(chatId)).find((x) => x.id === messageId);
    if (!m) return;
    const meta = { ...((m.metadata as Record<string, unknown>) ?? {}) };
    if (JSON.stringify(meta[key]) === JSON.stringify(value)) return;
    if (value === undefined) delete meta[key]; else meta[key] = value;
    await host().chat.updateMessage(chatId, messageId, { metadata: meta, skipChunkRebuild: true });
  });
}

export async function writeRecord(chatId: string, messageId: string, swipe: number, rec: TurnRecord): Promise<void> {
  await patchWarpMeta(chatId, messageId, (w) => ({ ...w, swipes: { ...(w.swipes ?? {}), [String(swipe)]: rec } }));
}

/** Keep records aligned with swipe slots when one is deleted. */
export async function shiftAfterSwipeDelete(chatId: string, messageId: string, deleted: number): Promise<void> {
  await patchWarpMeta(chatId, messageId, (w) => {
    const shift = <T>(slots: Record<string, T> | undefined): Record<string, T> => Object.fromEntries(
      Object.entries(slots ?? {}).filter(([k]) => Number(k) !== deleted)
        .map(([k, v]) => [String(Number(k) > deleted ? Number(k) - 1 : Number(k)), v]),
    );
    return { ...w, swipes: shift(w.swipes), ...(w.live ? { live: shift(w.live) } : {}), ...(w.greeted ? { greeted: shift(w.greeted) } : {}) };
  });
}

/** Explicitly keep or discard dependent records after an edited path. */
export async function reconcilePath(chatId: string, r: Ruleset, keep: boolean): Promise<void> {
  const msgs = await getMessages(chatId);
  const conflict = foldPath(r, msgs, 0).conflict;
  if (!conflict) return;
  let affected = false;
  for (const m of msgs) {
    if (m.id === conflict) affected = true;
    if (!affected) continue;
    await patchWarpMeta(chatId, m.id, async (w, current) => {
      const slot = String(current.swipe_id ?? 0), rec = w.swipes?.[slot];
      if (!rec) return w;
      const swipes = { ...w.swipes };
      if (keep) {
        const now = await getMessages(chatId);
        swipes[slot] = withRecordPath(rec, r, now.filter((x) => x.index_in_chat < current.index_in_chat));
      } else delete swipes[slot];
      const live = { ...w.live }; delete live[slot];
      return { ...w, swipes, live };
    });
  }
}

