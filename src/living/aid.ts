import { storyEvidenceMatches } from "./story-view.js";
import { readAidFee, unresolvedServiceTerms, payAidFee, type AidFee, type AidPayment } from "./service-payment.js";
import { readAidWork, serviceAgreement, serviceAgreements, serviceReady, matchesService, sameServiceFee, explicitServiceWaiver, SERVICE_INSTRUCTIONS } from "./service-barter.js";
import { pathOf, rawPathOf } from "./story-path.js";
import { costPayer } from "./companions.js";
import { revision } from "../shared/revision.js";
import { actorName, entityFor, capable, present, distance, checkRange, MechanicalKnowledgeError, type EncounterBeat, type Range } from "./encounters.js";
import { sourceContains, sourceRevisionMatches, recordPathMatches } from "./story-text.js";
import type { AbilityDefinition } from "./abilities.js";
import type { Evidence, Message } from "./world.js";
import type { MechanicalState, MechanicalOperation, MechanicalChange } from "./mechanics.js";

export interface AidOffer {
  id: string; version: number; actor: string; target: "you"; ability: string; abilityVersion: number;
  name: string; status: "offered" | "used" | "withdrawn"; unsupported: string[]; source: Evidence;
  termsVersion?: 1 | 2; fee?: AidFee; paid?: AidPayment; sourceRange?: Range; work?: Evidence[]; agreement?: string; feeWaived?: Evidence;
}
export type AidObservation = { kind: "aid_offer"; value: AidOffer } | { kind: "aid_end"; id: string; source: Evidence };
export type AidOperation = { kind: "accept_aid" | "decline_aid"; offer: string; version: number };
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 160) => typeof v === "string" && v.trim().length <= max ? v.trim() : "";
const normalize = (s: string) => s.normalize("NFKC").toLocaleLowerCase();
function mentions(name: string, quote: string, exact: boolean): boolean {
  if (!name) return false;
  const normalized = normalize(name);
  return exact ? new RegExp(`(?<![\\p{L}\\p{N}_])${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "u").test(normalize(quote)) : normalize(quote).includes(normalized);
}

/** A fixed beneficial vocabulary, never a concealed attack or forced mental state. */
export function aidAbility(ability: AbilityDefinition): boolean {
  if (ability.target === "self" || !ability.effects.some(e => e.target === "target")) return false;
  return ability.effects.every(e => e.kind === "mend" || e.kind === "restore" || e.kind === "clear_condition" || e.kind === "defense"
    || e.kind === "periodic" && (e.pulse?.kind === "mend" || e.pulse?.kind === "restore")
    || e.kind === "condition" && !!e.helps?.length && !e.hinders?.length && !e.blocks?.length);
}

/** Offers describe actual voluntary willingness. Neither a profile nor a player request supplies it. */
export function readAidObservation(row: Record<string, unknown>, state: MechanicalState, source: Evidence, messages: Message[], historical = false): AidObservation | undefined {
  if (!historical) row = Object.fromEntries(Object.entries(row).filter(([key, value]) => value !== null || !["fee", "work", "agreement"].includes(key)));
  const latest = messages.filter(m => !m.is_user && m.content.trim() && !m.id.startsWith("warp-source:")).at(-1);
  const message = messages.find(m => m.id === source.message);
  // A conditional promise can be recovered after its reply. It cannot execute treatment.
  const conditional = row.kind === "aid_offer" && Array.isArray(row.work) && row.work.length > 0;
  if (!latest || !message || message.is_user || source.message !== latest.id && !conditional || !storyEvidenceMatches(message, source)) return;
  if (row.kind === "aid_end") {
    if (Object.keys(row).some(k => !["kind", "id", "message", "quote", ...(historical ? ["sourceRevision", "viewRevision"] : [])].includes(k))) return;
    const offer = state.aidOffers?.find(o => o.id === row.id && o.status === "offered");
    const entity = offer && entityFor(state, offer.actor);
    return offer && entity && [offer.actor, entity.displayName, ...entity.aliases].some(n => mentions(n, source.quote, !historical || offer.termsVersion === 2)) ? { kind: "aid_end", id: offer.id, source } : undefined;
  }
  if (Object.keys(row).some(k => !["kind", "actor", "target", "ability", "uncontested", "unsupported", "fee", "work", "agreement", "message", "quote", ...(historical ? ["id", "version", "abilityVersion", "name", "status", "source", "sourceRevision", "viewRevision", "termsVersion", "sourceRange", "feeWaived"] : [])].includes(k))) return;
  if (historical && row.termsVersion !== undefined && row.termsVersion !== 1 && row.termsVersion !== 2) return;
  if (row.target !== "you" || row.uncontested !== true && !historical) return;
  const actor = actorName(state, text(row.actor, 80));
  if (!actor || actor === "you" || !conditional && (!present(state, actor) || !capable(state, actor)) || entityFor(state, actor)?.entityKind !== "person") return;
  const entity = entityFor(state, actor)!;
  if (![actor, entity.displayName, ...entity.aliases].some(name => mentions(name, source.quote, !historical || row.termsVersion === 2))) return;
  const definitions = state.abilities?.filter(a => a.owner === actor && (a.id === row.ability || normalize(a.name) === normalize(text(row.ability)))) ?? [];
  if (definitions.length !== 1 || !aidAbility(definitions[0])) return;
  const ability = definitions[0];
  if (historical && row.abilityVersion !== ability.version) return;
  // Retain one literal source restriction even if the helper omitted the optional definition field.
  // This is quoted range, never a default inferred from the genre or current distance.
  const ranges = [...new Set([...ability.source.quote.matchAll(/\b(?:at|within)\s+(touch|near|far)\s+range\b/gi)].map(m => m[1].toLowerCase() as Range))];
  if (historical && row.sourceRange !== undefined && !["touch", "near", "far"].includes(row.sourceRange as string)) return;
  const sourceRange = historical ? row.sourceRange as Range | undefined : ranges.length === 1 && ranges[0] !== ability.range ? ranges[0] : undefined;
  if (sourceRange && (ranges.length !== 1 || ranges[0] !== sourceRange)) return;
  if (!Array.isArray(row.unsupported) || row.unsupported.length > 8 || row.unsupported.some(v => !text(v, 240))) return;
  const id = `aid-${revision([actor, "you", ability.id])}`, old = state.aidOffers?.find(o => o.id === id);
  // A repeated old quotation cannot make a paid or withdrawn offer available again.
  if (old && old.source.message === source.message && old.source.sourceRevision === source.sourceRevision) return;
  if (old && conditional && messages.findIndex(m => m.id === old.source.message) > messages.findIndex(m => m.id === source.message)) return;
  const termsVersion = historical ? row.termsVersion as 1 | 2 | undefined ?? (row.fee === undefined ? undefined : 1) : 2;
  const hasWork = row.work !== undefined && (!Array.isArray(row.work) || row.work.length > 0);
  const work = !hasWork ? undefined : readAidWork(row.work, source, historical);
  if (historical && hasWork && !work) return;
  const candidates = termsVersion === 2 && !conditional ? serviceAgreements(state, id, actor, ability.id, ability.version) : [];
  if (termsVersion === 2 && !conditional && !candidates.length && /\b(?:as promised|promised aid|earned treatment|earned aid)\b/i.test(source.quote)
    && state.agreements?.some(a => a.service?.offer === id && a.service.used)) return;
  const agreement = termsVersion === 2 && !conditional && (row.agreement !== undefined || candidates.length)
    ? serviceAgreement(state, id, actor, ability.id, ability.version, row.agreement) : undefined;
  if (row.agreement !== undefined && (!agreement || conditional) || candidates.length && !agreement) return;
  if (agreement && (!serviceReady(agreement) || agreement.requirements.some(r => messages.findIndex(m => m.id === r.done!.message) > messages.indexOf(message)))) return;
  const quotedFee = row.fee === undefined ? undefined : readAidFee(row.fee, state, source.quote);
  let fee = quotedFee;
  let feeWaived: Evidence | undefined;
  if (agreement) {
    const originalFee = agreement.service!.fee;
    if (originalFee && explicitServiceWaiver(source.quote) && (!historical || row.feeWaived !== undefined)) feeWaived = structuredClone(source);
    if (historical && row.feeWaived !== undefined && (!feeWaived || !obj(row.feeWaived) || Object.keys(row.feeWaived).some(k => !["message", "quote", "sourceRevision", "viewRevision"].includes(k))
      || row.feeWaived.message !== source.message || row.feeWaived.quote !== source.quote || row.feeWaived.sourceRevision !== source.sourceRevision || row.feeWaived.viewRevision !== source.viewRevision)) return;
    fee = feeWaived ? undefined : originalFee;
    // Persisted claims already carry their inherited canonical fee, even when the renewed quote omits it.
    if (row.fee !== undefined) {
      const proven = historical ? row.fee : quotedFee ?? readAidFee(row.fee, state, agreement.service!.source.quote);
      if (!sameServiceFee(proven, originalFee)) return;
    }
  } else if (historical && (row.fee !== undefined && !fee || row.feeWaived !== undefined)) return;
  // Preserve the exact historical reader for offers that predate service fees.
  const remaining = work?.remaining ?? source.quote;
  const unresolvedTerms = !termsVersion
    ? /\b(?:pay\s+me|you\s+(?:pay|owe)|cost\s+you|fee|in\s+exchange|provided|only\s+if|for\s+(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:coins?|gold|silver|credits?|dollars?|yen))\b/i.test(source.quote)
    : unresolvedServiceTerms(remaining, state, quotedFee)
      || termsVersion === 2 && /\b(?:if|unless|after|once|before|until)\s+you\b|\byou\s+(?:must|need to|have to|also)\b|\b(?:other than|except)\b/i.test(remaining)
      || termsVersion === 2 && !fee && !feeWaived && /\b(?:not|isn['’]t|no longer|never)\s+(?:for\s+)?free\b|\bno\s+fees?\s+waiver\b/i.test(remaining)
      || hasWork && !work || row.fee !== undefined && !quotedFee && !agreement;
  const unsupported = row.unsupported.map(v => text(v, 240));
  if (unresolvedTerms && !unsupported.length) unsupported.push(`Offer terms require resolution: ${source.quote.slice(0, 180)}`);
  return { kind: "aid_offer", value: { id, version: (old?.version ?? 0) + 1, actor, target: "you", ability: ability.id, abilityVersion: ability.version,
    name: normalize(source.quote).includes(normalize(ability.name)) ? ability.name : "aid", status: "offered", unsupported, source, ...(termsVersion ? { termsVersion } : {}), ...(fee ? { fee } : {}), ...(sourceRange ? { sourceRange } : {}), ...(work ? { work: work.work } : {}), ...(agreement ? { agreement: agreement.id } : {}), ...(feeWaived ? { feeWaived } : {}) } };
}

export function observeAid(state: MechanicalState, observation: AidObservation) {
  state.aidOffers ??= [];
  const at = state.aidOffers.findIndex(o => o.id === (observation.kind === "aid_offer" ? observation.value.id : observation.id));
  if (observation.kind === "aid_offer") {
    if (at < 0) state.aidOffers.push(structuredClone(observation.value)); else state.aidOffers[at] = structuredClone(observation.value);
  } else if (at >= 0) state.aidOffers[at].status = "withdrawn";
}

type AidResolution = { state: MechanicalState; changes: MechanicalChange[]; beats: EncounterBeat[] };
export function executeAid(before: MechanicalState, actor: string, operations: MechanicalOperation[],
  run: (state: MechanicalState, actor: string, operation: MechanicalOperation) => AidResolution, serviceFees = false, barterAction?: string): AidResolution {
  if (actor !== "you" || operations.length !== 1 || !["accept_aid", "decline_aid"].includes(operations[0].kind)) throw Error("Aid permission authorizes one offered use only");
  const op = operations[0] as AidOperation, offer = before.aidOffers?.find(o => o.id === op.offer && o.version === op.version);
  if (!offer || offer.status !== "offered") throw Error("This aid offer is no longer available");
  if ((offer.fee || offer.sourceRange) && !serviceFees) throw Error("These aid terms require the service resolver");
  if ((offer.work || offer.agreement) && !barterAction) throw Error("Barter aid requires the agreement resolver");
  const previous = structuredClone(offer);
  let result: AidResolution;
  if (op.kind === "decline_aid") result = { state: structuredClone(before), changes: [], beats: [] };
  else {
    if (offer.work && !offer.agreement) throw new MechanicalKnowledgeError("The quoted work must be agreed, completed and followed by a current offer of treatment");
    const agreement = offer.agreement && before.agreements?.find(a => a.id === offer.agreement);
    if (offer.agreement && (!agreement || !serviceReady(agreement) || !matchesService(offer, agreement))) throw new MechanicalKnowledgeError("The promised treatment is not available from this agreement");
    if (entityFor(before, "you")?.status === "dead") throw Error("Aid permission cannot resurrect an explicitly dead person");
    if (!present(before, offer.actor) || !capable(before, offer.actor)) throw Error("The person offering aid is unavailable");
    if (offer.unsupported.length) throw new MechanicalKnowledgeError(`The offered aid needs clarification: ${offer.unsupported.join("; ")}`);
    const ability = before.abilities?.find(a => a.id === offer.ability && a.version === offer.abilityVersion && a.owner === offer.actor);
    if (!ability || !aidAbility(ability)) throw new MechanicalKnowledgeError("The offered ability changed or is not supported aid");
    if (offer.sourceRange) {
      if (!distance(before, offer.actor, "you")) throw new MechanicalKnowledgeError("The offered treatment's quoted range needs an established distance");
      checkRange(before, offer.actor, "you", offer.sourceRange);
    }
    for (const effect of ability.effects) if (effect.kind === "clear_condition") {
      const owner = effect.target === "self" ? offer.actor : "you";
      if (before.conditions.some(c => c.owner === owner && normalize(c.name) === normalize(effect.name!) && (c.helps.length || c.defenses?.length))) throw new MechanicalKnowledgeError("The offered aid would remove an established benefit");
    }
    const fees: MechanicalChange[] = [], paymentBeats: EncounterBeat[] = [], working = offer.fee ? structuredClone(before) : before;
    const paid = offer.fee ? payAidFee(working, offer.fee, offer.actor, `${offer.id}:${offer.version}`, fees, paymentBeats) : undefined;
    result = run(working, offer.actor, { kind: "ability", ability: ability.id, version: ability.version, target: "you" });
    result.changes.unshift(...fees); result.beats.unshift(...paymentBeats);
    if (paid) result.state.aidOffers!.find(o => o.id === offer.id)!.paid = paid;
    if (agreement) {
      const settled = result.state.agreements!.find(a => a.id === agreement.id)!;
      settled.service!.used = { action: barterAction!, ...(offer.feeWaived ? { feeWaived: structuredClone(offer.feeWaived) } : {}) };
      result.changes.push({ kind: "agreement", id: settled.id, before: structuredClone(agreement), after: structuredClone(settled) });
    }
    for (const beat of result.beats) if (beat.kind === "mend" && beat.actor === "you" && beat.target === "you") beat.actor = offer.actor;
  }
  const saved = result.state.aidOffers!.find(o => o.id === offer.id)!; saved.status = op.kind === "accept_aid" ? "used" : "withdrawn";
  result.changes.push({ kind: "aid_offer", id: saved.id, before: previous, after: structuredClone(saved) });
  result.beats.push({ kind: "aid", actor: offer.actor, target: "you", name: op.kind === "accept_aid" ? offer.name : "Aid declined" });
  return result;
}

/** Recognize a narrow direct invitation; informational questions remain ordinary reads. */
export function aidRequestHead(content: string): { text: string; address?: string } {
  const text = content.trim().replace(/^["'“”*\s]+/, "");
  const addressed = /^([\p{L}\p{N}'’ -]{1,80})[,:]\s*((?:can|could|would|will)\s+you\b[\s\S]*)$/iu.exec(text);
  if (!addressed) return { text };
  const address = addressed[1].trim().replace(/^(?:hey|hello|hi)\s+/i, "");
  // A vocative may precede the request; an OOC label or an action clause may not disappear.
  if (/^(?:ooc|out of character|i|we|you|he|she|they|it|if|after|before|once|unless|while|when)\b/i.test(address)
    || /\b(?:pay|spend|give|buy|attack|cast|use)\b/i.test(address)) return { text };
  return { text: addressed[2], ...(/^(?:please|hey|hello|hi)$/i.test(address) ? {} : { address }) };
}
export function aidRequestIntent(content: string, state?: MechanicalState): boolean {
  const { text } = aidRequestHead(content);
  if (!/^(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:heal|treat|mend|cure|restore|protect|help)\b/i.test(text)) return false;
  const q = text.indexOf("?"); if (q < 0 || /\b(?:pay|spend|give|buy|attack|cast|use)\b/i.test(text.slice(0, q))) return false;
  if (/\byou\s+(?:please\s+)?help\b/i.test(text.slice(0, q))) {
    const physical = /\b(?:heal|treat|mend|burn|wound|injur(?:y|ies)|pain|bleeding|poison)\b/i.test(text.slice(0, q));
    const contextual = /\bhelp\s+me(?:\s+please)?$/i.test(text.slice(0, q)) && state?.conditions.some(c => c.owner === "you" && (c.injury || c.category === "physical_injury"));
    if (!physical && !contextual) return false;
  }
  const tail = text.slice(q + 1).replace(/^["'“”*\s]+/, "").trim();
  return !tail || /^I\s+(?:ask|say|whisper|murmur)(?:\s+(?:to\s+)?[\p{L}\p{N} '-]{1,80})?[.!]*$/iu.test(tail);
}

/** Mixed prose can invite an offer without skipping its other action interpretation. */
export function aidRequestBoundary(content: string, state?: MechanicalState): boolean {
  if (/^\s*\(?\s*(?:ooc|out of character)\b/i.test(content)) return false;
  return aidRequestIntent(content, state) || [...content.matchAll(/["“]([^"”\n]{1,800})["”]/g)].some(m => aidRequestIntent(m[1], state));
}

export const AID_INSTRUCTIONS = `Voluntary aid uses aidOffers, not a new player-owned power. A request such as "Could you treat my arm?" invites an NPC decision; it neither commands agreement nor executes a cure. In actual narration an NPC can offer one established beneficial ability. Prepare the NPC's definition from its actual source, preserving ownership, costs, range, recovery limits and unsupported terms. Return mechanicalObservations {kind:"aid_offer",actor,target:"you",ability:"saved id or newly prepared name",uncontested:true,unsupported:[],message,quote}. The contiguous exact quote must name the actor and actually offer this aid now; profiles, hypotheticals, merely hearing a claim and a player request are insufficient. Do not record attacks, forced feelings, consent, movement or an unknown power as aid. Retain any payment, item, condition, timing or source restriction not resolved by the supported definition in unsupported, never turn paid help into free help. An actual later withdrawal uses {kind:"aid_end",id,message,quote}. Old offers cannot reopen themselves. Offers are not execution, inventory handovers, cures or costs. Preserve them through ordinary questions; they can be used once, explicitly withdrawn, or declined.
An offered service may add fee:{kind:"resource|item",id:"established player-owned asset ID or unique name",amount:exactQuotedNumber}. This is the price paid BY THE PLAYER to the NPC, separate from the NPC's casting/resource costs. Resource fees require an established player money balance; item fees transfer an actual owned quantity. Cite the actual simple price in the same offer quote, such as "Jo offers Mend for five coins". Do not choose between alternative prices, convert currencies, assume wallet totals, or omit extra labor, timing, item or other conditions. Unresolved alternatives and other restrictions stay in unsupported; supported quoted work uses the contract below. A fee does not imply the NPC's total wallet balance. When the only restriction is this supported exact fee, represent it in fee instead of also marking that same fee unsupported. Explicitly free help has no fee.
${SERVICE_INSTRUCTIONS}
An explicit acceptance can use mechanicalActions {kind:"accept_aid",offer:"saved id",version:currentVersion,quote}; explicit refusal uses decline_aid with the same fields. Code applies exactly one offered use by the NPC and any saved service fee atomically. The NPC pays the definition's actual costs and takes their own action, with existing shared payer permissions honored. The player grants permission without a player action, extra NPC responders, a new ability or a roll. Do not add duplicate fee spending, item transfers, NPC responses or player-owned invocations. If the definition or terms are not prepared, leave that aid unresolved without inventing reluctance, a fee or a fictional obstacle. Questions about costs/effects execute nothing. A plain request must first allow the NPC to make an offer rather than completing unrecorded mechanical healing. Keep player/NPC choice, source prohibitions, uncertainty and existing receipt boundaries intact.`;

/** Show the actual recipient of payment before consent, without inventing a balance. */
export function aidOfferText(offer: AidOffer, state: MechanicalState): string {
  const entity = entityFor(state, offer.actor);
  const name = [entity?.displayName, ...(entity?.aliases ?? []), offer.actor].find(n => n && normalize(offer.source.quote).includes(normalize(n))) ?? "Someone";
  const ability = state.abilities?.find(a => a.id === offer.ability && a.version === offer.abilityVersion);
  const costs = ability?.costs.map(c => {
    if (c.kind === "item") return `${c.amount} ${state.items.find(i => i.id === c.id)?.name ?? "item"}`;
    const resource = state.resources.find(r => r.id === c.id);
    try {
      const payer = costPayer(state, c.id);
      return `${c.amount}${payer.owner === "you" ? " of your" : ""} ${payer.name}`;
    } catch { return `${c.amount} ${resource?.name ?? "resource"} · payer unresolved`; }
  }) ?? [];
  const fee = offer.fee, asset = fee && (fee.kind === "resource" ? state.resources : state.items).find(r => r.id === fee.id);
  return `${name} offers ${offer.name}${offer.work ? " · in exchange for work" : ""}${fee ? ` · fee ${fee.amount} ${asset?.name ?? "unresolved asset"}` : ""}${costs.length ? ` · uses ${costs.join(" + ")}` : ""}${offer.unsupported.length || ability?.unsupported.length ? " · needs clarification" : ""}`;
}
export function aidNotes(before: MechanicalState, after: MechanicalState): string[] {
  return (after.aidOffers ?? []).filter(o => o.status === "offered" && !before.aidOffers?.some(old => old.id === o.id && old.version === o.version && old.status === "offered"))
    .map(o => aidOfferText(o, after));
}

/** New aid turns cannot replace the saved treatment with free prose recovery. */
export function awaitingAid(state: MechanicalState, source: Evidence, messages: Message[], historical: boolean): boolean {
  if (state.aidOffers?.some(o => o.status === "offered")) return true;
  const at = messages.findIndex(m => m.id === source.message), prefix = messages.slice(0, at), player = prefix.at(-1);
  if (!player?.is_user) return false;
  if (!historical && aidRequestBoundary(player.content, state)) return true;
  const slots = player.metadata?.warpLivingPrompt, snapshot = obj(slots) ? slots[String(player.swipe_id ?? 0)] : undefined;
  return !!(obj(snapshot) && snapshot.version === 1 && typeof snapshot.path === "string" && obj(snapshot.packet) && typeof snapshot.packet.aidBoundary === "string"
    && recordPathMatches(player, snapshot.path, pathOf(prefix), rawPathOf(prefix), true));
}
