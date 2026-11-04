import type { LlmMessageDTO } from "lumiverse-spindle-types";
import type { Msg } from "../backend/ledger.js";
import { pathsOf, rawPathsOf } from "./world.js";
import { receiptPacket, type MechanicalReceipt } from "./mechanics.js";

import { recordPathMatches } from "./story-text.js";
import { revision } from "../shared/revision.js";

export const PROMPT_KEY = "warpLivingPrompt";
interface PromptRendering { id: string; basis: string; mode: "full" | "delta" | "omit"; block: string; }
export interface PromptSnapshot { version: 1; path: string; packet: any; decision?: unknown; receipt?: MechanicalReceipt; receiptPacket?: ReturnType<typeof receiptPacket>; renderings?: PromptRendering[]; }
export function promptSnapshot(message: Msg, paths: Map<string, string>, rawPaths = paths): PromptSnapshot | undefined {
  const value = (message.metadata?.[PROMPT_KEY] as Record<string, PromptSnapshot> | undefined)?.[String(message.swipe_id ?? 0)];
  if (value?.version !== 1 || !recordPathMatches(message, value.path, paths.get(message.id)!, rawPaths.get(message.id)!, true) || !value.packet || !Array.isArray(value.packet.established) || !Array.isArray(value.packet.possibleMotives)) return;
  if ([...value.packet.established, ...value.packet.possibleMotives].some(f => !f || typeof f !== "object" || typeof f.id !== "string")) return;
  return value;
}

function delta(before: any, after: any) {
  const changes: any = {};
  for (const key of ["place", "present", "preferences", "knowledgeBoundary", "agreementBoundary", "assetBoundary", "readBoundary", "explorationBoundary", "preparationBoundary"]) if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changes[key] = after[key] ?? null;
  for (const key of ["established", "possibleMotives"]) {
    const previous = new Map(before[key].map((f: any) => [f.id, JSON.stringify(f)]));
    const current = new Set(after[key].map((f: any) => f.id));
    const put = after[key].filter((f: any) => previous.get(f.id) !== JSON.stringify(f));
    const remove = [...previous.keys()].filter(id => !current.has(id));
    if (put.length || remove.length) changes[key] = { put, remove };
  }
  const mechanics: any = {};
  for (const key of ["resources", "items", "conditions", "abilities", "entities", "distances", "clocks", "cooldowns", "resilience", "agreements", "places", "positions", "routes", "discoveries", "stocks"]) {
    const old = before.mechanics?.[key] ?? [], next = after.mechanics?.[key] ?? [];
    const previous = new Map(old.map((row: any) => [row.id, JSON.stringify(row)]));
    const current = new Set(next.map((row: any) => row.id));
    const put = next.filter((row: any) => previous.get(row.id) !== JSON.stringify(row));
    const remove = [...previous.keys()].filter(id => !current.has(id));
    if (put.length || remove.length) mechanics[key] = { put, remove };
  }
  if (Object.keys(mechanics).length) changes.mechanics = mechanics;
  return changes;
}

const renderingBasis = (snapshot: PromptSnapshot | undefined) => revision(snapshot ? {
  version: snapshot.version, path: snapshot.path, packet: snapshot.packet, decision: snapshot.decision,
  receipt: snapshot.receipt, receiptPacket: snapshot.receiptPacket,
} : null);

/** Keep wire text separately from the state it described. Later recovery must not rebase old deltas. */
export function preparePrompt(messages: LlmMessageDTO[], history: Msg[], director: string, current?: { id: string; snapshot: PromptSnapshot }): { messages: LlmMessageDTO[]; snapshot?: PromptSnapshot } {
  const paths = pathsOf(history), rawPaths = rawPathsOf(history), source = new Map(history.map(m => [m.id, m]));
  const raw = (m: Msg) => (m.metadata?.[PROMPT_KEY] as Record<string, PromptSnapshot> | undefined)?.[String(m.swipe_id ?? 0)];
  const snapshots = new Map(history.map(m => [m.id, current?.id === m.id ? current.snapshot : promptSnapshot(m, paths, rawPaths)]));
  const renderings = new Map<string, PromptRendering>();
  const key = (id: string, mode: string) => JSON.stringify([id, mode]);
  for (const snapshot of snapshots.values()) for (const row of Array.isArray(snapshot?.renderings) ? snapshot.renderings : []) {
    if (!row || typeof row.id !== "string" || typeof row.basis !== "string" || typeof row.block !== "string" || !["full", "delta", "omit"].includes(row.mode)) continue;
    const origin = source.get(row.id);
    if (!origin || row.basis !== renderingBasis(current?.id === row.id ? current.snapshot : raw(origin))) continue;
    // The earliest valid publication of a given form owns its bytes.
    if (!renderings.has(key(row.id, row.mode))) renderings.set(key(row.id, row.mode), row);
  }
  const captured: PromptRendering[] = [];
  let previous: PromptSnapshot | undefined;
  const output = messages.map<LlmMessageDTO>(message => {
    if (message.role !== "user" || !message.sourceMessageId) return message;
    const origin = source.get(message.sourceMessageId);
    if (!origin?.is_user) return message;
    const snapshot = snapshots.get(origin.id), basis = renderingBasis(current?.id === origin.id ? current.snapshot : raw(origin));
    if (!snapshot || current?.id !== origin.id && renderings.has(key(origin.id, "omit"))) {
      if (!snapshot && !renderings.has(key(origin.id, "omit"))) {
        const row: PromptRendering = { id: origin.id, basis, mode: "omit", block: "" };
        captured.push(row); renderings.set(key(origin.id, "omit"), row);
      }
      return message;
    }
    const mode = previous ? "delta" : "full", frozen = renderings.get(key(origin.id, mode));
    const update = previous ? delta(previous.packet, snapshot.packet) : snapshot.packet;
    const block = frozen?.block ?? (previous && !Object.keys(update).length && !snapshot.decision && !snapshot.receipt ? "" : `<warp>\n${previous ? "Recorded state update (put replaces by id; remove leaves the current projection):" : `${director}\nPlayer preferences are binding: exclude listed content and keep offScreen content off screen. Warp observations are chronological. Later updates replace earlier observations. Outcomes apply only to the player turn carrying them.\nRecorded state:`}\n${JSON.stringify(update)}${snapshot.decision ? `\nThis player turn's resolved attempt:\n${JSON.stringify(snapshot.decision)}` : ""}${snapshot.receipt ? `\nThis player turn's mechanical receipt (authoritative changes; do not charge or award again):\n${JSON.stringify(snapshot.receiptPacket ?? receiptPacket(snapshot.receipt))}` : ""}\n</warp>`);
    if (!frozen) {
      const row: PromptRendering = { id: origin.id, basis, mode, block };
      captured.push(row); renderings.set(key(origin.id, mode), row);
    }
    previous = snapshot;
    if (!block) return message;
    return typeof message.content === "string" ? { ...message, content: `${message.content}\n\n${block}` }
      : { ...message, content: [...message.content, { type: "text", text: `\n\n${block}` }] };
  });
  return { messages: output, ...(current ? { snapshot: captured.length ? { ...current.snapshot, renderings: [...(Array.isArray(current.snapshot.renderings) ? current.snapshot.renderings : []), ...captured] } : current.snapshot } : {}) };
}

/** Only source-identified history is changed. Preserve every other message field and part. */
export function replayPrompt(messages: LlmMessageDTO[], history: Msg[], director: string, current?: { id: string; snapshot: PromptSnapshot }): LlmMessageDTO[] {
  return preparePrompt(messages, history, director, current).messages;
}
