// Per-message turn records.
//
// Each message carries `metadata.warp = { intent?, swipes: { [swipeIndex]: TurnRecord } }`.
// State for any point in the chat is the fold of the active swipe's record on
// every message before it — so swipes, edits and deletions stay correct for free.

import type { ChatMessageDTO } from "lumiverse-spindle-types";
import type { Intent, LiveChoice, TurnRecord } from "../engine/resolve.js";
import type { Ruleset } from "../engine/ruleset.js";
import { applyEvent, cloneState, initialState, type GameState } from "../engine/state.js";
import { host } from "./host.js";

export type Msg = ChatMessageDTO & { role: "system" | "user" | "assistant"; metadata?: Record<string, unknown> };

/** A medium-confidence reading offered to the player instead of rolled. */
export type Suggestion = Intent & { label: string; confidence: number };

export interface WarpMeta {
  intent?: Intent;
  suggest?: Suggestion;
  /** The adjudicator already read this message (intent may be absent = "not an action"). Swipes reuse the verdict. */
  judged?: boolean;
  swipes?: Record<string, TurnRecord>;
  /** Choices written for the moment after this reply, per swipe. */
  live?: Record<string, LiveChoice[]>;
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

export interface FoldStep { message: Msg; record: TurnRecord; before: GameState; after: GameState }

/** Fold the active path. Returns the final state and every step that had a record. */
export function foldPath(r: Ruleset, msgs: Msg[]): { state: GameState; steps: FoldStep[] } {
  let s = initialState(r);
  const steps: FoldStep[] = [];
  for (const m of msgs) {
    const rec = activeRecord(m);
    if (!rec?.events?.length) continue;
    const before = s;
    const after = cloneState(s);
    for (const e of rec.events) applyEvent(after, e, r);
    steps.push({ message: m, record: rec, before, after });
    s = after;
  }
  return { state: s, steps };
}

/** Read-merge-write: spindle_metadata is shared with other extensions and replaced wholesale on update. */
export async function patchWarpMeta(chatId: string, messageId: string, fn: (w: WarpMeta) => WarpMeta): Promise<void> {
  const msgs = await getMessages(chatId);
  const m = msgs.find((x) => x.id === messageId);
  if (!m) throw new Error("Message not found");
  const meta = { ...((m.metadata as Record<string, unknown>) ?? {}) };
  meta.warp = fn({ ...warpMeta(m) });
  await host().chat.updateMessage(chatId, messageId, { metadata: meta, skipChunkRebuild: true });
}

export async function writeRecord(chatId: string, messageId: string, swipe: number, rec: TurnRecord): Promise<void> {
  await patchWarpMeta(chatId, messageId, (w) => ({ ...w, swipes: { ...(w.swipes ?? {}), [String(swipe)]: rec } }));
}

/** Keep records aligned with swipe slots when one is deleted. */
export async function shiftAfterSwipeDelete(chatId: string, messageId: string, deleted: number): Promise<void> {
  await patchWarpMeta(chatId, messageId, (w) => {
    const next: Record<string, TurnRecord> = {};
    for (const [k, v] of Object.entries(w.swipes ?? {})) {
      const i = Number(k);
      if (i === deleted) continue;
      next[String(i > deleted ? i - 1 : i)] = v;
    }
    return { ...w, swipes: next };
  });
}
