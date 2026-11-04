import type { Msg } from "../backend/ledger.js";
import { pathOf, pathsOf, rawPathsOf, type Decision, type Record as LivingRecord } from "./world.js";
import { sourceContains, sourceRevisionMatches, recordPathMatches } from "./story-text.js";
import { mechanicalRecordOf } from "./mechanical-history.js";
import { emptyMechanics } from "./mechanics.js";
import { responseChecks, type ResponseCheck } from "./exchanges.js";

export interface SavedChecks { messageId: string; decision?: Decision; responses: ResponseCheck[]; }

/** Project saved checks onto their original replies without model calls or new random draws. */
export function savedChecks(messages: Msg[], recordOf: (m: Msg) => LivingRecord | undefined): SavedChecks[] {
  const paths = pathsOf(messages), rawPaths = rawPathsOf(messages), root = pathOf([]);
  const byId = new Map(messages.map(m => [m.id, m])), displayState = emptyMechanics();
  displayState.entities = [];
  const valid = (m: Msg, i: number, record: { path: string; text: string } | undefined) => !!record && sourceRevisionMatches(m, record.text)
    && recordPathMatches(m, record.path, i ? paths.get(messages[i - 1].id)! : root, i ? rawPaths.get(messages[i - 1].id)! : root);
  return messages.flatMap((m, i) => {
    const record = recordOf(m), mechanical = mechanicalRecordOf(m);
    const mechanicalValid = valid(m, i, mechanical);
    if (mechanicalValid) for (const observation of mechanical!.observations) {
      if (observation.kind !== "entity") continue;
      const entity = observation.value, source = byId.get(entity.source.message);
      if (!source || source.index_in_chat > m.index_in_chat || !sourceRevisionMatches(source, entity.source.sourceRevision) || !sourceContains(source.content, entity.source.quote)) continue;
      const prior = displayState.entities!.findIndex(e => e.name === entity.name);
      if (prior < 0) displayState.entities!.push(entity); else displayState.entities![prior] = entity;
    }
    if (m.is_user || !m.content.trim()) return [];
    const player = messages[i - 1], attempt = player?.is_user ? player.metadata?.warpLivingAttempt as { path?: string; decision?: Decision | null } | undefined : undefined;
    const prepared = player && attempt?.path && recordPathMatches(player, attempt.path, paths.get(player.id)!, rawPaths.get(player.id)!, true) ? attempt.decision : undefined;
    const decision = valid(m, i, record) ? record?.decision ?? prepared : prepared;
    // Names come only from story-sourced identities already known at this reply, never a later reveal or card-only name.
    const responses = mechanicalValid ? responseChecks(mechanical!.receipt, displayState) : [];
    return decision || responses.length ? [{ messageId: m.id, ...(decision ? { decision } : {}), responses }] : [];
  });
}
