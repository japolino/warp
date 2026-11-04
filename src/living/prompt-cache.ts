import type { LlmMessageDTO } from "lumiverse-spindle-types";
import type { Msg } from "../backend/ledger.js";
import { pathsOf, rawPathsOf } from "./world.js";
import { receiptPacket, type MechanicalReceipt } from "./mechanics.js";

import { recordPathMatches } from "./story-text.js";

export const PROMPT_KEY = "warpLivingPrompt";
export interface PromptSnapshot { version: 1; path: string; packet: any; decision?: unknown; receipt?: MechanicalReceipt; receiptPacket?: ReturnType<typeof receiptPacket>; }
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

/** Only source-identified history is changed. Preserve every other message field and part. */
export function replayPrompt(messages: LlmMessageDTO[], history: Msg[], director: string, current?: { id: string; snapshot: PromptSnapshot }): LlmMessageDTO[] {
  const paths = pathsOf(history), rawPaths = rawPathsOf(history), source = new Map(history.map(m => [m.id, m]));
  let previous: PromptSnapshot | undefined;
  return messages.map(message => {
    if (message.role !== "user" || !message.sourceMessageId) return message;
    const origin = source.get(message.sourceMessageId);
    if (!origin?.is_user) return message;
    const snapshot = current?.id === origin.id ? current.snapshot : promptSnapshot(origin, paths, rawPaths);
    if (!snapshot) return message;
    const update = previous ? delta(previous.packet, snapshot.packet) : snapshot.packet;
    if (previous && !Object.keys(update).length && !snapshot.decision && !snapshot.receipt) { previous = snapshot; return message; }
    const block = `<warp>\n${previous ? "Recorded state update (put replaces by id; remove leaves the current projection):" : `${director}\nPlayer preferences are binding: exclude listed content and keep offScreen content off screen. Warp observations are chronological. Later updates replace earlier observations. Outcomes apply only to the player turn carrying them.\nRecorded state:`}\n${JSON.stringify(update)}${snapshot.decision ? `\nThis player turn's resolved attempt:\n${JSON.stringify(snapshot.decision)}` : ""}${snapshot.receipt ? `\nThis player turn's mechanical receipt (authoritative changes; do not charge or award again):\n${JSON.stringify(snapshot.receiptPacket ?? receiptPacket(snapshot.receipt))}` : ""}\n</warp>`;
    previous = snapshot;
    return typeof message.content === "string" ? { ...message, content: `${message.content}\n\n${block}` }
      : { ...message, content: [...message.content, { type: "text", text: `\n\n${block}` }] };
  });
}
