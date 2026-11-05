import { pathOf, rawPathOf } from "./story-path.js";
import { costPayer } from "./companions.js";
import { revision } from "../shared/revision.js";
import { actorName, entityFor, capable, present, MechanicalKnowledgeError, type EncounterBeat } from "./encounters.js";
import { sourceContains, sourceRevisionMatches, recordPathMatches } from "./story-text.js";
import type { AbilityDefinition } from "./abilities.js";
import type { Evidence, Message } from "./world.js";
import type { MechanicalState, MechanicalOperation, MechanicalChange } from "./mechanics.js";

export interface AidOffer {
  id: string; version: number; actor: string; target: "you"; ability: string; abilityVersion: number;
  name: string; status: "offered" | "used" | "withdrawn"; unsupported: string[]; source: Evidence;
}
export type AidObservation = { kind: "aid_offer"; value: AidOffer } | { kind: "aid_end"; id: string; source: Evidence };
export type AidOperation = { kind: "accept_aid" | "decline_aid"; offer: string; version: number };
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 160) => typeof v === "string" && v.trim().length <= max ? v.trim() : "";
const normalize = (s: string) => s.normalize("NFKC").toLocaleLowerCase();

/** A fixed beneficial vocabulary, never a concealed attack or forced mental state. */
export function aidAbility(ability: AbilityDefinition): boolean {
  if (ability.target === "self" || !ability.effects.some(e => e.target === "target")) return false;
  return ability.effects.every(e => e.kind === "mend" || e.kind === "restore" || e.kind === "clear_condition" || e.kind === "defense"
    || e.kind === "periodic" && (e.pulse?.kind === "mend" || e.pulse?.kind === "restore")
    || e.kind === "condition" && !!e.helps?.length && !e.hinders?.length && !e.blocks?.length);
}

/** Offers describe actual voluntary willingness. Neither a profile nor a player request supplies it. */
export function readAidObservation(row: Record<string, unknown>, state: MechanicalState, source: Evidence, messages: Message[], historical = false): AidObservation | undefined {
  const latest = messages.filter(m => !m.is_user && m.content.trim() && !m.id.startsWith("warp-source:")).at(-1);
  if (!latest || source.message !== latest.id || !sourceContains(latest.content, source.quote) || !sourceRevisionMatches(latest, source.sourceRevision)) return;
  if (row.kind === "aid_end") {
    if (Object.keys(row).some(k => !["kind", "id", "message", "quote", ...(historical ? ["sourceRevision"] : [])].includes(k))) return;
    const offer = state.aidOffers?.find(o => o.id === row.id && o.status === "offered");
    const entity = offer && entityFor(state, offer.actor);
    return offer && entity && [offer.actor, entity.displayName, ...entity.aliases].some(n => n && normalize(source.quote).includes(normalize(n))) ? { kind: "aid_end", id: offer.id, source } : undefined;
  }
  if (Object.keys(row).some(k => !["kind", "actor", "target", "ability", "uncontested", "unsupported", "message", "quote", ...(historical ? ["id", "version", "abilityVersion", "name", "status", "source", "sourceRevision"] : [])].includes(k))) return;
  if (row.target !== "you" || row.uncontested !== true && !historical) return;
  const actor = actorName(state, text(row.actor, 80));
  if (!actor || actor === "you" || !present(state, actor) || !capable(state, actor) || entityFor(state, actor)?.entityKind !== "person") return;
  const entity = entityFor(state, actor)!;
  if (![actor, entity.displayName, ...entity.aliases].some(name => name && normalize(source.quote).includes(normalize(name)))) return;
  const definitions = state.abilities?.filter(a => a.owner === actor && (a.id === row.ability || normalize(a.name) === normalize(text(row.ability)))) ?? [];
  if (definitions.length !== 1 || !aidAbility(definitions[0])) return;
  const ability = definitions[0];
  if (historical && row.abilityVersion !== ability.version) return;
  if (!Array.isArray(row.unsupported) || row.unsupported.length > 8 || row.unsupported.some(v => !text(v, 240))) return;
  const id = `aid-${revision([actor, "you", ability.id])}`, old = state.aidOffers?.find(o => o.id === id);
  // A repeated old quotation cannot make a paid or withdrawn offer available again.
  if (old && old.source.message === source.message && old.source.sourceRevision === source.sourceRevision) return;
  const unresolvedTerms = /\b(?:pay\s+me|you\s+(?:pay|owe)|cost\s+you|fee|in\s+exchange|provided|only\s+if|for\s+(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:coins?|gold|silver|credits?|dollars?|yen))\b/i.test(source.quote);
  const unsupported = row.unsupported.map(v => text(v, 240));
  if (unresolvedTerms && !unsupported.length) unsupported.push(`Offer terms require resolution: ${source.quote.slice(0, 180)}`);
  return { kind: "aid_offer", value: { id, version: (old?.version ?? 0) + 1, actor, target: "you", ability: ability.id, abilityVersion: ability.version,
    name: normalize(source.quote).includes(normalize(ability.name)) ? ability.name : "aid", status: "offered", unsupported, source } };
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
  run: (state: MechanicalState, actor: string, operation: MechanicalOperation) => AidResolution): AidResolution {
  if (actor !== "you" || operations.length !== 1 || !["accept_aid", "decline_aid"].includes(operations[0].kind)) throw Error("Aid permission authorizes one offered use only");
  const op = operations[0] as AidOperation, offer = before.aidOffers?.find(o => o.id === op.offer && o.version === op.version);
  if (!offer || offer.status !== "offered") throw Error("This aid offer is no longer available");
  const previous = structuredClone(offer);
  let result: AidResolution;
  if (op.kind === "decline_aid") result = { state: structuredClone(before), changes: [], beats: [] };
  else {
    if (entityFor(before, "you")?.status === "dead") throw Error("Aid permission cannot resurrect an explicitly dead person");
    if (!present(before, offer.actor) || !capable(before, offer.actor)) throw Error("The person offering aid is unavailable");
    if (offer.unsupported.length) throw new MechanicalKnowledgeError(`The offered aid needs clarification: ${offer.unsupported.join("; ")}`);
    const ability = before.abilities?.find(a => a.id === offer.ability && a.version === offer.abilityVersion && a.owner === offer.actor);
    if (!ability || !aidAbility(ability)) throw new MechanicalKnowledgeError("The offered ability changed or is not supported aid");
    for (const effect of ability.effects) if (effect.kind === "clear_condition") {
      const owner = effect.target === "self" ? offer.actor : "you";
      if (before.conditions.some(c => c.owner === owner && normalize(c.name) === normalize(effect.name!) && (c.helps.length || c.defenses?.length))) throw new MechanicalKnowledgeError("The offered aid would remove an established benefit");
    }
    result = run(before, offer.actor, { kind: "ability", ability: ability.id, version: ability.version, target: "you" });
    for (const beat of result.beats) if (beat.kind === "mend" && beat.actor === "you" && beat.target === "you") beat.actor = offer.actor;
  }
  const saved = result.state.aidOffers!.find(o => o.id === offer.id)!; saved.status = op.kind === "accept_aid" ? "used" : "withdrawn";
  result.changes.push({ kind: "aid_offer", id: saved.id, before: previous, after: structuredClone(saved) });
  result.beats.push({ kind: "aid", actor: offer.actor, target: "you", name: op.kind === "accept_aid" ? offer.name : "Aid declined" });
  return result;
}

/** Recognize a narrow direct invitation; informational questions remain ordinary reads. */
export function aidRequestIntent(content: string, state?: MechanicalState): boolean {
  const text = content.trim().replace(/^["'“”*\s]+/, "");
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

export const AID_INSTRUCTIONS = `Voluntary aid uses aidOffers, not a new player-owned power. A request such as "Could you treat my arm?" invites an NPC decision; it neither commands agreement nor executes a cure. In actual narration an NPC can offer one established beneficial ability. Prepare the NPC's definition from its actual source, preserving ownership, costs, range, recovery limits and unsupported terms. Return mechanicalObservations {kind:"aid_offer",actor,target:"you",ability:"saved id or newly prepared name",uncontested:true,unsupported:[],message,quote}. The contiguous exact quote must name the actor and actually offer this aid now; profiles, hypotheticals, merely hearing a claim and a player request are insufficient. Do not record attacks, forced feelings, consent, movement or an unknown power as aid. Retain any payment, item, condition, timing or source restriction not resolved by the supported definition in unsupported, never turn paid help into free help. An actual later withdrawal uses {kind:"aid_end",id,message,quote}. Old offers cannot reopen themselves. Offers are not execution, inventory handovers, cures or costs. Preserve them through ordinary questions; they can be used once, explicitly withdrawn, or declined.
An explicit acceptance can use mechanicalActions {kind:"accept_aid",offer:"saved id",version:currentVersion,quote}; explicit refusal uses decline_aid with the same fields. Code applies exactly one offered use by the NPC. The NPC pays the definition's actual costs and takes their own action, with existing shared payer permissions honored. The player grants permission without a player action, extra NPC responders, a new ability or a roll. Do not add duplicate NPC responses or player-owned invocations. If the definition or terms are not prepared, leave that aid unresolved without inventing reluctance, a fee or a fictional obstacle. Questions about costs/effects execute nothing. A plain request must first allow the NPC to make an offer rather than completing unrecorded mechanical healing. Keep player/NPC choice, source prohibitions, uncertainty and existing receipt boundaries intact.`;

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
  return `${name} offers ${offer.name}${costs.length ? ` · uses ${costs.join(" + ")}` : ""}${offer.unsupported.length || ability?.unsupported.length ? " · needs clarification" : ""}`;
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
  if (!historical && aidRequestIntent(player.content, state)) return true;
  const slots = player.metadata?.warpLivingPrompt, snapshot = obj(slots) ? slots[String(player.swipe_id ?? 0)] : undefined;
  return !!(obj(snapshot) && snapshot.version === 1 && typeof snapshot.path === "string" && obj(snapshot.packet) && typeof snapshot.packet.aidBoundary === "string"
    && recordPathMatches(player, snapshot.path, pathOf(prefix), rawPathOf(prefix), true));
}
