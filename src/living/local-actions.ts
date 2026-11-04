import { splitTyped } from "../backend/questions.js";
import { sourceRevisionMatches, sourceContains } from "./story-text.js";
import { agreementDone } from "./agreements.js";
import { actorName, conditionActive } from "./encounters.js";
import { prepareMechanical, type MechanicalOperation } from "./mechanics.js";
import type { Message, World } from "./world.js";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export interface LocalActionRead {
  risky: false; contested: false; approach: "other";
  mechanicalActions: { kind: "claim"; agreement: string; reward: string; quote: string }[];
}

/** Only a direct acceptance of one fresh, explicitly uncontested offer can skip interpretation. */
export function readLocalClaim(content: string, world: World, history: Message[]): LocalActionRead | undefined {
  const plain = (s: string) => s.trim().replace(/\s+/g, " ").replace(/^(\*{1,2}|_{1,2})(.+)\1$/, "$2").trim();
  const state = world.mechanics, action = plain(splitTyped(content).action);
  if (plain(content) !== action) return; // Speech and corrections can change the meaning of a combined message.
  if (!state || action.length > 240 || !/^(?:I\s+)?(?:collect|accept|take|receive|pay)\s+/i.test(action)) return;
  const last = history.at(-1), narrator = history.at(-2);
  if (!last?.is_user || last.content !== content || !narrator || narrator.is_user || !narrator.content.trim()) return;
  const candidates: LocalActionRead["mechanicalActions"] = [];
  for (const agreement of state.agreements ?? []) {
    if (!agreementDone(agreement) || agreement.owner !== "you" && agreement.from !== "you" || !agreement.rewards.some(r => !r.paid && r.ready?.uncontested)) continue;
    const paying = agreement.from === "you", counterpart = paying ? agreement.owner : agreement.from;
    if (!counterpart) continue;
    const entity = state.entities?.find(e => e.name === counterpart);
    if (!entity?.present || entity.status !== "active") continue;
    let cast: string[];
    try { cast = [...world.present, ...(state.entities ?? []).filter(e => e.present && e.entityKind === "person").map(e => e.name)].map(p => actorName(state, p)); } catch { continue; }
    if (cast.some(p => p !== "you" && p !== counterpart)) continue;
    if (state.conditions.some(c => ["you", counterpart].includes(c.owner) && conditionActive(state, c) && (c.hinders.length || c.blocks.length))) continue;
    const names = [...new Set([counterpart, entity.displayName, ...entity.aliases])].filter(Boolean).map(escape).join("|");
    for (const reward of agreement.rewards) {
      const ready = reward.ready;
      if (reward.paid || !ready?.allowed || !ready.uncontested || ready.source.message !== narrator.id || !sourceRevisionMatches(narrator, ready.source.sourceRevision)) continue;
      if (!sourceContains(narrator.content, ready.source.quote)) continue;
      const asset = escape(reward.asset);
      const reference = `(?:(?:my|the) (?:(?:offered|promised|earned|agreed) )?(?:pay|payment|reward)|(?:(?:the|my|your|this|that) )?(?:(?:offered|promised|earned|agreed) )?(?:${escape(String(reward.amount))} )?${asset})`;
      const pattern = paying
        ? `^(?:I )?pay (?:(?:${names}) ${reference}|${reference} to (?:${names}))[.!]?$`
        : `^(?:I )?(?:collect|accept|take|receive) ${reference}(?: from (?:${names}))?[.!]?$`;
      if (!new RegExp(pattern, "iu").test(action.replace(/\s+/g, " "))) continue;
      candidates.push({ kind: "claim", agreement: agreement.id, reward: reward.id, quote: action });
    }
  }
  if (candidates.length !== 1) return;
  const candidate = candidates[0], operation: MechanicalOperation = { kind: "claim", agreement: candidate.agreement, reward: candidate.reward };
  // Preflight on a copy. Missing knowledge still gets the ordinary preparation opportunity.
  if (prepareMechanical(state, "local-claim-preview", "you", [operation]).status !== "ready") return;
  return { risky: false, contested: false, approach: "other", mechanicalActions: [candidate] };
}
