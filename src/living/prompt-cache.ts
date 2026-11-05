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

const STATE_FIELDS = ["place", "present", "preferences", "knowledgeBoundary", "agreementBoundary", "assetBoundary", "readBoundary", "explorationBoundary", "preparationBoundary", "companionBoundary", "growthBoundary", "lingeringBoundary", "aidBoundary"];
const MECHANICAL_COLLECTIONS = ["resources", "items", "conditions", "abilities", "entities", "distances", "clocks", "cooldowns", "resilience", "agreements", "places", "positions", "routes", "discoveries", "stocks", "companions", "costLinks", "growth", "buildups", "aidOffers"];
function delta(before: any, after: any) {
  const changes: any = {};
  for (const key of STATE_FIELDS) if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changes[key] = after[key] ?? null;
  for (const key of ["established", "possibleMotives"]) {
    const previous = new Map(before[key].map((f: any) => [f.id, JSON.stringify(f)]));
    const current = new Set(after[key].map((f: any) => f.id));
    const put = after[key].filter((f: any) => previous.get(f.id) !== JSON.stringify(f));
    const remove = [...previous.keys()].filter(id => !current.has(id));
    if (put.length || remove.length) changes[key] = { put, remove };
  }
  const mechanics: any = {};
  for (const key of MECHANICAL_COLLECTIONS) {
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

/** Project what was actually published, including older formatters that omitted fields. */
function publishedState(previous: any, block: string, mode: "full" | "delta") {
  const marker = mode === "full" ? "\nRecorded state:\n" : "\nRecorded state update (put replaces by id; remove leaves the current projection):\n";
  const at = block.lastIndexOf(marker);
  if (at < 0) return previous;
  try {
    const update = JSON.parse(block.slice(at + marker.length).split("\n", 1)[0]);
    if (!update || typeof update !== "object" || Array.isArray(update)) return previous;
    if (mode === "full") return update;
    const next = structuredClone(previous ?? { established: [], possibleMotives: [] });
    for (const key of STATE_FIELDS) if (Object.hasOwn(update, key)) {
      if (update[key] === null) delete next[key]; else next[key] = update[key];
    }
    const apply = (before: any[], change: any) => {
      if (!change || !Array.isArray(change.put) || !Array.isArray(change.remove)
        || change.put.some((row: any) => !row || typeof row.id !== "string")) throw Error("Invalid published collection");
      const rows = new Map(before.map(row => [row.id, row]));
      for (const id of change.remove) rows.delete(id);
      for (const row of change.put) rows.set(row.id, row);
      return [...rows.values()];
    };
    for (const key of ["established", "possibleMotives"]) if (Object.hasOwn(update, key)) next[key] = apply(next[key] ?? [], update[key]);
    for (const key of MECHANICAL_COLLECTIONS) if (update.mechanics && Object.hasOwn(update.mechanics, key)) {
      next.mechanics ??= {};
      next.mechanics[key] = apply(next.mechanics[key] ?? [], update.mechanics[key]);
    }
    return next;
  } catch { return previous; }
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
  let published: any = { established: [], possibleMotives: [] };
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
    const update = previous ? delta(published, snapshot.packet) : snapshot.packet;
    const block = frozen?.block ?? (previous && !Object.keys(update).length && !snapshot.decision && !snapshot.receipt ? "" : `<warp>\n${previous ? "Recorded state update (put replaces by id; remove leaves the current projection):" : `${director}\nPlayer preferences are binding: exclude listed content and keep offScreen content off screen. Warp observations are chronological. Later updates replace earlier observations. Outcomes apply only to the player turn carrying them.\nRecorded state:`}\n${JSON.stringify(update)}${snapshot.decision ? `\nThis player turn's resolved attempt:\n${JSON.stringify(snapshot.decision)}` : ""}${snapshot.receipt ? `\nThis player turn's mechanical receipt (authoritative changes; do not charge or award again):\n${JSON.stringify(snapshot.receiptPacket ?? receiptPacket(snapshot.receipt))}` : ""}\n</warp>`);
    if (!frozen) {
      const row: PromptRendering = { id: origin.id, basis, mode, block };
      captured.push(row); renderings.set(key(origin.id, mode), row);
    }
    previous = snapshot;
    if (!block) return message;
    published = publishedState(published, block, mode);
    return typeof message.content === "string" ? { ...message, content: `${message.content}\n\n${block}` }
      : { ...message, content: [...message.content, { type: "text", text: `\n\n${block}` }] };
  });
  return { messages: output, ...(current ? { snapshot: captured.length ? { ...current.snapshot, renderings: [...(Array.isArray(current.snapshot.renderings) ? current.snapshot.renderings : []), ...captured] } : current.snapshot } : {}) };
}

/** Only source-identified history is changed. Preserve every other message field and part. */
export function replayPrompt(messages: LlmMessageDTO[], history: Msg[], director: string, current?: { id: string; snapshot: PromptSnapshot }): LlmMessageDTO[] {
  return preparePrompt(messages, history, director, current).messages;
}
