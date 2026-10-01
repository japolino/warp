// Concrete events per swipe, pinned definitions and explicit branch ancestry.
import type { ChatMessageDTO } from "lumiverse-spindle-types";
import type { Intent, LiveChoice, TurnRecord } from "../engine/resolve.js";
import type { Ruleset } from "../engine/ruleset.js";
import { applyEvent, cloneState, initialState, type GameState } from "../engine/state.js";
import { fingerprint } from "../engine/fingerprint.js";
import { validEvent, validJson } from "../engine/event-codec.js";
import { objectOf } from "../engine/proposal.js";
import { messageMetadata } from "./serial.js";
import { host } from "./host.js";

export type Msg = ChatMessageDTO & { role: "system" | "user" | "assistant"; metadata?: Record<string, unknown> };
export type Suggestion = Intent & { label: string; confidence: number };
export interface Playthrough { v: 1; revision: string; ruleset: Ruleset; initial: GameState }
export interface WarpMeta {
  intent?: Intent; suggest?: Suggestion; judged?: boolean;
  commandId?: string;
  accepted?: { parent: string; actionId: string | null; inputs: NonNullable<TurnRecord["inputs"]> };
  prepared?: Record<string, { generationId: string; record: TurnRecord; playerText: string; player: string; outcome: string | null; at: number; replyBefore?: string; verdict?: { messageId: string; intent: Intent | null; suggestion: Suggestion | null } }>;
  swipes?: Record<string, TurnRecord>; live?: Record<string, LiveChoice[]>;
  /** First message anchors the rules. A later explicit migration starts a new playthrough. */
  playthrough?: Playthrough;
}
export function warpMeta(m: Msg): WarpMeta { return objectOf(objectOf(m.metadata).warp) as WarpMeta; }
export function liveChoicesOf(m: Msg | null | undefined): LiveChoice[] {
  const choices = m && !m.is_user ? warpMeta(m).live?.[String(m.swipe_id ?? 0)] : null;
  return Array.isArray(choices) ? choices.filter((c) => c && typeof c.label === "string" && typeof c.tag === "string" && (c.target === undefined || typeof c.target === "string")).slice(0, 32) : [];
}
export function validRecord(value: unknown): value is TurnRecord {
  const rec = objectOf(value);
  return rec.v === 1 && typeof rec.at === "number" && Number.isFinite(rec.at) && Array.isArray(rec.events) && rec.events.length <= 20_000 && rec.events.every(validEvent)
    && Array.isArray(rec.hints) && rec.hints.every((h) => typeof h === "string") && validJson(rec);
}
export function activeRecord(m: Msg): TurnRecord | null {
  const rec = objectOf(warpMeta(m).swipes)[String(m.swipe_id ?? 0)];
  return validRecord(rec) ? rec : null;
}
export async function getMessages(chatId: string): Promise<Msg[]> {
  return [...await host().chat.getMessages(chatId) as Msg[]].sort((a, b) => a.index_in_chat - b.index_in_chat);
}
export interface FoldStep { message: Msg; record: TurnRecord; before: GameState; after: GameState }
export interface FoldResult { state: GameState; steps: FoldStep[]; ruleset: Ruleset; revision: string; head: string; stale: string[] }
interface Cached { signatures: string[]; result: FoldResult; prefix: string }
const folds = new Map<string, Cached>();
const MAX_STEPS = 60;
const messageContext = (m: Msg) => [m.id, m.is_user, m.swipe_id ?? 0, m.content];
const headOf = (revision: string, state: GameState, prefix: string) => fingerprint({ revision, state, prefix });
export function newPlaythrough(r: Ruleset): Playthrough {
  const ruleset = structuredClone(r), initial = initialState(r);
  return { v: 1, revision: fingerprint({ ruleset, initial }), ruleset, initial };
}
function validPlaythrough(p: Playthrough | undefined): p is Playthrough {
  return !!p && p.v === 1 && validJson(p) && Array.isArray(p.ruleset?.statOrder) && !!p.initial?.stats && fingerprint({ ruleset: p.ruleset, initial: p.initial }) === p.revision;
}
function copyResult(x: FoldResult): FoldResult { return { ...x, state: cloneState(x.state), ruleset: structuredClone(x.ruleset), stale: [...x.stale], steps: x.steps.map((st) => ({ ...st, record: structuredClone(st.record), before: cloneState(st.before), after: cloneState(st.after) })) }; }

/** Incrementally folds an unchanged prefix; edits/swipes invalidate the prefix in full. */
export function foldPath(current: Ruleset, msgs: Msg[]): FoldResult {
  const initial = newPlaythrough(current);
  const key = `${msgs[0]?.chat_id ?? "preview"}:${initial.revision}`;
  const signatures = msgs.map((m) => fingerprint([messageContext(m), warpMeta(m)]));
  const cached = folds.get(key);
  const reusable = cached && !cached.result.stale.length && cached.signatures.length <= signatures.length && cached.signatures.every((s, i) => s === signatures[i]);
  if (reusable && signatures.length === cached.signatures.length) {
    const result = copyResult(cached.result);
    result.steps = result.steps.map((st) => ({ ...st, message: msgs.find((m) => m.id === st.message.id)! }));
    return result;
  }
  let r = reusable ? structuredClone(cached.result.ruleset) : structuredClone(current);
  let s = reusable ? cloneState(cached.result.state) : initial.initial;
  let revision = reusable ? cached.result.revision : initial.revision;
  let prefix = reusable ? cached.prefix : "start";
  const steps: FoldStep[] = reusable ? cached.result.steps.map((st) => ({ ...st, message: msgs.find((m) => m.id === st.message.id)!, before: cloneState(st.before), after: cloneState(st.after) })) : [];
  const stale: string[] = [];
  const start = reusable ? cached.signatures.length : 0;
  const retainFrom = Math.max(start, msgs.length - MAX_STEPS);
  for (let i = start; i < msgs.length; i++) {
    const m = msgs[i], meta = warpMeta(m);
    const raw = objectOf(meta.swipes)[String(m.swipe_id ?? 0)];
    const rec = activeRecord(m);
    const advance = () => { prefix = fingerprint([prefix, messageContext(m), rec ?? raw ?? null]); };
    if (meta.playthrough) {
      if (!validPlaythrough(meta.playthrough)) { stale.push(m.id); advance(); continue; }
      r = structuredClone(meta.playthrough.ruleset); s = cloneState(meta.playthrough.initial); revision = meta.playthrough.revision;
      stale.length = 0;
    }
    if (stale.length) { advance(); continue; }
    if (raw !== undefined && !rec) { stale.push(m.id); advance(); continue; }
    if (rec) {
      if ((rec.rulesRevision && rec.rulesRevision !== revision) || (rec.parent && rec.parent !== headOf(revision, s, prefix))) { stale.push(m.id); advance(); continue; }
      const before = i >= retainFrom ? cloneState(s) : null;
      if (rec.locations) r.locations = { ...r.locations, ...structuredClone(rec.locations) };
      // Prefixes do not need a copy per record. On corrupt compound events, restore the valid prefix.
      const after = before ? cloneState(s) : s;
      try { for (const e of rec.events) applyEvent(after, e, r); }
      catch { const restored = foldPath(current, msgs.slice(0, i)); s = restored.state; r = restored.ruleset; stale.push(m.id); advance(); continue; }
      s = after;
      if (before) steps.push({ message: m, record: rec, before, after: cloneState(s) });
    }
    advance();
  }
  const result: FoldResult = { state: s, steps: steps.slice(-MAX_STEPS), ruleset: r, revision, head: headOf(revision, s, prefix), stale };
  if (folds.size >= 24) folds.delete(folds.keys().next().value!);
  folds.set(key, { signatures, result, prefix });
  return copyResult(result);
}
export function requireCurrentPath(fold: FoldResult): void {
  if (fold.stale.length) throw new Error(`The game path changed at message ${fold.stale[0]}. Regenerate from there or delete the incompatible replies before taking another action.`);
}

/** Serialize every Warp write to the shared metadata object, including other top-level keys. */
export async function patchWarpMeta(chatId: string, messageId: string, fn: (w: WarpMeta) => WarpMeta): Promise<void> {
  await messageMetadata(`${chatId}:${messageId}`, async () => {
    const m = (await getMessages(chatId)).find((x) => x.id === messageId);
    if (!m) throw new Error("Message not found");
    await host().chat.updateMessage(chatId, messageId, { metadata: { ...m.metadata, warp: fn({ ...warpMeta(m) }) }, skipChunkRebuild: true });
  });
}
export async function patchMeta(chatId: string, messageId: string, key: string, value: unknown): Promise<void> {
  await messageMetadata(`${chatId}:${messageId}`, async () => {
    const m = (await getMessages(chatId)).find((x) => x.id === messageId);
    if (!m) return;
    const meta = { ...m.metadata };
    if (JSON.stringify(meta[key]) === JSON.stringify(value)) return;
    if (value === undefined) delete meta[key]; else meta[key] = value;
    await host().chat.updateMessage(chatId, messageId, { metadata: meta, skipChunkRebuild: true });
  });
}
export async function writeRecord(chatId: string, messageId: string, swipe: number, rec: TurnRecord, r?: Ruleset): Promise<void> {
  if (!validRecord(rec)) throw new Error("Invalid turn record");
  if (r) {
    let msgs = await getMessages(chatId);
    const root = msgs[0];
    if (root && !warpMeta(root).playthrough) await patchWarpMeta(chatId, root.id, (w) => ({ ...w, playthrough: w.playthrough ?? newPlaythrough(r) }));
    msgs = await getMessages(chatId);
    const target = msgs.find((m) => m.id === messageId);
    if (!target) throw new Error("Message not found");
    const fold = foldPath(r, msgs.filter((m) => m.index_in_chat < target.index_in_chat));
    requireCurrentPath(fold);
    rec = { ...rec, parent: rec.parent ?? fold.head, rulesRevision: rec.rulesRevision ?? fold.revision };
  }
  await patchWarpMeta(chatId, messageId, (w) => ({ ...w, swipes: { ...w.swipes, [String(swipe)]: rec } }));
}
export async function pinRuleset(chatId: string, r: Ruleset): Promise<void> {
  const root = (await getMessages(chatId))[0];
  if (root && !warpMeta(root).playthrough) await patchWarpMeta(chatId, root.id, (w) => ({ ...w, playthrough: w.playthrough ?? newPlaythrough(r) }));
}
export async function shiftAfterSwipeDelete(chatId: string, messageId: string, deleted: number): Promise<void> {
  const shift = <T>(map: Record<string, T> | undefined): Record<string, T> => Object.fromEntries(Object.entries(map ?? {}).flatMap(([k, v]) => {
    const i = Number(k); return i === deleted ? [] : [[String(i > deleted ? i - 1 : i), v]];
  }));
  await patchWarpMeta(chatId, messageId, (w) => ({ ...w, swipes: shift(w.swipes), live: shift(w.live) }));
}

/** Explicitly adopt edited definitions as a fresh playthrough while preserving old history. */
export async function startPlaythrough(chatId: string, r: Ruleset): Promise<void> {
  await host().chat.appendMessage(chatId, { role: "assistant", content: "A new playthrough begins with the updated game rules.", metadata: { warp: { playthrough: newPlaythrough(r) } } });
}
export function appendOperation(existing: TurnRecord | null | undefined, operation: TurnRecord): TurnRecord {
  if (!existing) return operation;
  return { ...existing, events: [...existing.events, ...operation.events], hints: [...existing.hints, ...operation.hints], operations: [...(existing.operations ?? []), operation] };
}
