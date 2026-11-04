import type { Evidence, Message } from "./world.js";
import type { Condition, MechanicalState } from "./mechanics.js";

export interface ClosedCondition { id: string; owner: string; name: string; injuryNames?: string[]; after: { kind: "receipt" | "message"; id: string }; }

export function messageOwnsAction(message: { id: string; swipe_id?: number }, action: string): boolean {
  const record = message as { metadata?: Record<string, Record<string, { receipt?: { id?: string; responses?: { actor?: string }[] } }>> };
  const receipt = record.metadata?.warpMechanics?.[String(message.swipe_id ?? 0)]?.receipt;
  return receipt?.id === action || !!receipt?.id && Array.isArray(receipt.responses) && receipt.responses.some(p => action === `${receipt.id}:response:${p.actor}`);
}

/** A healed condition cannot be recreated by quoting the same old injury later. */
export function closeCondition(state: MechanicalState, condition: Condition, after: ClosedCondition["after"]) {
  state.closedConditions ??= [];
  const row = { id: condition.id, owner: condition.owner, name: condition.name, ...(condition.injury ? { injuryNames: ["Lightly hurt", "Hurt", "Injured", "Badly injured", "Incapacitated"] } : {}), after };
  const index = state.closedConditions.findIndex(c => c.id === row.id || c.owner === row.owner && c.name.toLocaleLowerCase() === row.name.toLocaleLowerCase());
  if (index < 0) state.closedConditions.push(row); else state.closedConditions[index] = row;
}

export function conditionCauseIsNew(state: MechanicalState, id: string, owner: string, name: string, source: Evidence, messages: Message[], physical = false): boolean {
  const closed = state.closedConditions?.find(c => c.id === id || c.owner === owner && (c.name.toLocaleLowerCase() === name.toLocaleLowerCase() || c.injuryNames?.some(n => n.toLocaleLowerCase() === name.toLocaleLowerCase()) || physical && c.injuryNames?.length));
  if (!closed) return true;
  if (source.message.startsWith("warp-source:")) return false;
  const ended = messages.findIndex(m => {
    if (closed.after.kind === "message") return m.id === closed.after.id;
    return messageOwnsAction(m, closed.after.id);
  });
  return ended >= 0 && messages.findIndex(m => m.id === source.message) > ended;
}
