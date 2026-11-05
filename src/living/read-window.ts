import { storyReadContent } from "./story-view.js";
import { pathOf, pathsOf, rawPathsOf, type Message, type Record as LivingRecord } from "./world.js";
import { sourceRevisionMatches, recordPathMatches, sourceContains } from "./story-text.js";
import type { MechanicalState } from "./mechanics.js";

/** Old records cover their own reply. New records also name the replies actually supplied to extraction. */
export function extractionWindow<T extends Message>(messages: T[], recordOf: (message: T) => LivingRecord | undefined) {
  const paths = pathsOf(messages), rawPaths = rawPathsOf(messages), indexes = new Map(messages.map((m, i) => [m.id, i]));
  if (!messages.some(m => !m.is_user && storyReadContent(m).trim())) return;
  const covered = new Set<string>();
  let baseline = -1;
  for (const [i, message] of messages.entries()) {
    const record = recordOf(message);
    if (!record || !sourceRevisionMatches(message, record.text) || !recordPathMatches(message, record.path, i ? paths.get(messages[i - 1].id)! : pathOf([]), i ? rawPaths.get(messages[i - 1].id)! : pathOf([]))) continue;
    if (baseline < 0) baseline = i;
    covered.add(message.id);
    for (const id of record.reads ?? []) if (typeof id === "string" && (indexes.get(id) ?? Infinity) <= i) covered.add(id);
  }
  const unread = messages.flatMap((m, i) => i > baseline && !m.is_user && storyReadContent(m).trim() && !covered.has(m.id) ? [i] : []);
  if (baseline >= 0 && !unread.length && covered.has(messages.at(-1)?.id ?? "")) return;
  // First use in an existing story takes a bounded snapshot, without importing the whole chat.
  if (baseline < 0) return { messages: messages.slice(-14), reads: messages.slice(-14).filter(m => !m.is_user).map(m => m.id), remaining: 0, pending: 0 };
  if (!unread.length || unread[0] >= messages.length - 14) return { messages: messages.slice(-14), reads: messages.slice(-14).filter(m => !m.is_user).map(m => m.id), remaining: 0, pending: unread.length };
  // Keep the current scene and recover oldest missed exchanges in the same call.
  const chosen = new Set([baseline, ...messages.slice(-4).map(m => indexes.get(m.id)!)]);
  for (const i of unread) {
    const group = [Math.max(0, i - 2), Math.max(0, i - 1), i];
    if (new Set([...chosen, ...group]).size > 14) break;
    for (const index of group) chosen.add(index);
  }
  const selected = [...chosen].sort((a, b) => a - b).map(i => messages[i]);
  return { messages: selected, reads: selected.filter(m => !m.is_user).map(m => m.id), remaining: unread.filter(i => !chosen.has(i)).length, pending: unread.length };
}

/** A delayed read cannot replace or resurrect a fact using evidence older than its saved last change. */
export function freshChanges<T extends Message>(raw: unknown, messages: T[], recordOf: (message: T) => LivingRecord | undefined): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const value = raw as { changes?: unknown }, indexes = new Map(messages.map((m, i) => [m.id, i]));
  const paths = pathsOf(messages), rawPaths = rawPathsOf(messages), newest = new Map<string, number>();
  for (const [i, message] of messages.entries()) {
    const record = recordOf(message);
    if (!record || !sourceRevisionMatches(message, record.text) || !recordPathMatches(message, record.path, i ? paths.get(messages[i - 1].id)! : pathOf([]), i ? rawPaths.get(messages[i - 1].id)! : pathOf([]))) continue;
    for (const event of record.events) newest.set(event.id, Math.max(newest.get(event.id) ?? -1, indexes.get(event.evidence.message) ?? -1));
  }
  if (!Array.isArray(value.changes)) return raw;
  return { ...value, changes: value.changes.filter(row => !row || typeof row !== "object" || !newest.has(row.id) || (indexes.get(row.message) ?? Infinity) >= newest.get(row.id)!)
    .sort((a, b) => (indexes.get(a?.message) ?? Infinity) - (indexes.get(b?.message) ?? Infinity)) };
}

/** Only fresh model output is ordered here. Saved historical observation order remains unchanged. */
export function chronologicalObservations(raw: unknown, messages: Message[], state?: MechanicalState): unknown {
  if (!Array.isArray(raw)) return raw;
  const indexes = new Map(messages.map((m, i) => [m.id, i]));
  const aliases = new Map<string, string | null>();
  for (const row of raw) {
    if (row?.kind !== "agreement" || typeof row.name !== "string" || typeof row.offer?.quote !== "string" || row.offer.quote.trim().length < 4 || typeof row.quote !== "string" || row.quote.trim().length < 4) continue;
    const source = messages.find(m => m.id === row.offer.message), acceptance = messages.find(m => m.id === row.message);
    if (!source || !acceptance || !sourceContains(source.content, row.offer.quote.trim().replace(/\s+/g, " ")) || !sourceContains(acceptance.content, row.quote.trim().replace(/\s+/g, " "))) continue;
    const matches = state?.agreements?.filter(a => a.owner === row.owner && a.from === row.from && a.source.message === row.message && a.offer?.message === row.offer.message) ?? [];
    if (matches.length !== 1) continue;
    if (state?.agreements?.some(a => a.id !== matches[0].id && a.name === row.name)) continue;
    const prior = aliases.get(row.name);
    aliases.set(row.name, prior === undefined || prior === matches[0].id ? matches[0].id : null);
  }
  const rank = (row: any) => row?.kind === "agreement_progress" ? 1 : row?.kind === "reward_ready" ? 2 : row?.kind === "agreement_cancel" ? 3 : 0;
  return raw.map(row => row && typeof row === "object" && aliases.get(row.agreement) ? { ...row, agreement: aliases.get(row.agreement) } : row).sort((a, b) => {
    const left = indexes.get(a?.message) ?? Number.MAX_SAFE_INTEGER, right = indexes.get(b?.message) ?? Number.MAX_SAFE_INTEGER;
    return left - right || rank(a) - rank(b);
  });
}
