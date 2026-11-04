import { revision } from "../shared/revision.js";
import { actorName, entityFor, actionCount, MechanicalKnowledgeError } from "./encounters.js";
import { sourceContains, storyContent } from "./story-text.js";
import { messageOwnsAction, closeCondition } from "./condition-history.js";
import type { MechanicalState, MechanicalChange, Resource } from "./mechanics.js";
import type { EncounterBeat } from "./encounters.js";
import type { Evidence, Message } from "./world.js";

export interface Companion {
  id: string; actor: string; controller: string; companionKind: "companion" | "summon"; source: Evidence;
  manifestation?: { active: boolean; source: Evidence; expiresAt?: number };
}
/** One-to-one cost routing only. Damage, restoration and balances never propagate. */
export interface CostLink { id: string; from: string; to: string; enabled: boolean; unsupported: string[]; source: Evidence; }
export type CompanionObservation = { kind: "companion"; value: Companion } | { kind: "cost_link"; value: CostLink };
const norm = (v: string) => v.normalize("NFKC").trim().toLocaleLowerCase();
const text = (v: unknown, max = 160) => typeof v === "string" && v.trim().length <= max ? v.trim() : "";
const givenName = (name: string) => {
  const parts = name.trim().split(/\s+/), word = parts[0];
  return parts.length > 1 && word.length >= 3 && /^\p{Lu}/u.test(word) && !/^(?:the|dr\.?|professor|captain|sir|lady|lord)$/i.test(word) ? norm(word) : "";
};
function participant(state: MechanicalState, input: string) {
  const resolved = actorName(state, input);
  if (resolved === "you" || entityFor(state, resolved)) return resolved;
  const candidates = state.entities?.filter(e => [e.name, e.displayName, ...e.aliases].some(n => givenName(n) === norm(input))) ?? [];
  if (candidates.length > 1) throw new Error("Companion participant is ambiguous");
  return candidates[0]?.name ?? resolved;
}

/** A receipt transition cannot be contradicted by its own reply or an older quote. */
export function afterTransition(source: Evidence, old: Evidence, messages: Pick<Message, "id">[]): boolean {
  if (old.message === source.message && old.sourceRevision === source.sourceRevision) return false;
  const prior = messages.findIndex(m => old.message.startsWith("warp-action:") ? messageOwnsAction(m, old.message.slice("warp-action:".length)) : m.id === old.message);
  return prior >= 0 && messages.findIndex(m => m.id === source.message) > prior;
}
function mentioned(state: MechanicalState, actor: string, quote: string) {
  const e = entityFor(state, actor);
  const names = actor === "you" ? ["you", "your", "{{user}}", ...(e?.aliases ?? [])] : [actor, e?.displayName ?? "", ...(e?.aliases ?? [])];
  if (names.some(n => n && norm(quote).includes(norm(n)))) return true;
  // The scene may use Norma while the card names Norma Hollowell. This verifies
  // a unique literal given name; it never adds an alias or merges identities.
  return [actor, e?.displayName ?? ""].some(name => {
    const short = givenName(name); if (!short) return false;
    const matching = state.entities?.filter(row => [row.name, row.displayName, ...row.aliases].some(n => norm(n) === short || givenName(n) === short)) ?? [];
    if (matching.length !== 1 || matching[0].name !== actor) return false;
    const escaped = short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "u").test(norm(quote));
  });
}
function relationshipEvidence(state: MechanicalState, actor: string, controller: string, source: Evidence, messages: Message[]): Evidence | undefined {
  const bound = (quote: string) => mentioned(state, actor, quote) && mentioned(state, controller, quote);
  if (bound(source.quote)) return source;
  const message = messages.find(m => m.id === source.message); if (!message) return;
  // Models often cite just the controller's sentence. Retain at most 400
  // contiguous source characters around it. Ownership meaning is still the
  // helper's interpretation; literal co-occurrence alone cannot prove it.
  {
    const paragraph = storyContent(message.content).replace(/\s+/g, " "), start = paragraph.indexOf(source.quote);
    if (start < 0) return;
    const end = start + source.quote.length, spare = 400 - source.quote.length;
    const windows = [paragraph.slice(start, start + 400), paragraph.slice(Math.max(0, end - 400), end), paragraph.slice(Math.max(0, start - Math.floor(spare / 2)), end + Math.ceil(spare / 2))];
    for (const window of windows) {
      const quote = window.trim();
      if (quote.length <= 400 && quote.includes(source.quote) && bound(quote)) return { ...source, quote };
    }
  }
}
function compatible(from: Resource, to: Resource) {
  return from.role === "effort" && to.role === "effort" && from.owner !== to.owner
    && (from.unit && to.unit ? norm(from.unit) === norm(to.unit) : !from.unit && !to.unit && norm(from.name) === norm(to.name));
}
function resource(state: MechanicalState, input: unknown) {
  const matches = state.resources.filter(r => r.id === input);
  return matches.length === 1 ? matches[0] : undefined;
}
function assertGraph(state: MechanicalState) {
  for (const start of state.costLinks ?? []) {
    if (!start.enabled) continue;
    const seen = new Set<string>(); let id = start.from;
    for (;;) {
      if (seen.has(id)) throw new Error("Cyclic shared cost link");
      seen.add(id);
      const edges = state.costLinks?.filter(l => l.enabled && l.from === id) ?? [];
      if (!edges.length) break;
      if (edges.length !== 1) throw new Error("Ambiguous shared cost payer");
      const edge = edges[0], from = resource(state, edge.from), to = resource(state, edge.to);
      if (!from || !to || !compatible(from, to)) throw new MechanicalKnowledgeError("Shared cost pools need compatible established effort units");
      id = edge.to;
    }
  }
}

export function readCompanionObservation(row: Record<string, unknown>, state: MechanicalState, source: Evidence, messages: Message[], correction: boolean): CompanionObservation | undefined {
  const profile = source.message.startsWith("warp-source:");
  const fields = row.kind === "companion" ? ["actor", "controller", "companionKind"] : ["from", "to", "enabled", "unsupported"];
  if (Object.keys(row).some(k => !["kind", "id", "source", "sourceRevision", "message", "quote", ...fields,
    ...(row.kind === "companion" ? ["manifestation"] : [])].includes(k))) return;
  const editedProfile = (old: Evidence) => profile && old.message.startsWith("warp-source:") && old.message.split(":")[1] === source.message.split(":")[1]
    && !sourceContains(messages.find(m => m.id === source.message)?.content ?? "", old.quote);
  if (row.kind === "companion") {
    const actor = participant(state, text(row.actor, 80)), controller = participant(state, text(row.controller, 80));
    if (!actor || !controller || actor === "you" || actor === controller || !entityFor(state, actor) || controller !== "you" && !entityFor(state, controller)
      || !["companion", "summon"].includes(row.companionKind as string)) return;
    const evidence = relationshipEvidence(state, actor, controller, source, messages); if (!evidence) return;
    const old = state.companions?.find(c => c.actor === actor);
    if (old && !correction && !editedProfile(old.source)) return;
    if (old?.manifestation?.active && (old.controller !== controller || old.companionKind !== row.companionKind)) return;
    return { kind: "companion", value: { id: old?.id ?? `companion-${revision(actor)}`, actor, controller, companionKind: row.companionKind as Companion["companionKind"], source: evidence,
      ...(old?.manifestation ? { manifestation: structuredClone(old.manifestation) } : {}) } };
  }
  const from = resource(state, row.from), to = resource(state, row.to);
  if (!from || !to || typeof row.enabled !== "boolean" || !Array.isArray(row.unsupported) || row.unsupported.length > 8 || row.unsupported.some(v => !text(v, 240))
    || !compatible(from, to) || !mentioned(state, from.owner, source.quote) || !mentioned(state, to.owner, source.quote)) return;
  const old = state.costLinks?.find(l => l.from === from.id);
  if (old && !correction && (profile ? !editedProfile(old.source) : !old.source.message.startsWith("warp-source:") && !afterTransition(source, old.source, messages))) return;
  const value: CostLink = { id: `cost-link-${revision(from.id)}`, from: from.id, to: to.id, enabled: row.enabled, unsupported: row.unsupported as string[], source };
  const test = { ...state, costLinks: [...(state.costLinks ?? []).filter(l => l.from !== from.id), value] };
  assertGraph(test);
  return { kind: "cost_link", value };
}
export function observeCompanion(state: MechanicalState, o: CompanionObservation) {
  if (o.kind === "companion") {
    const rows = state.companions ??= [], index = rows.findIndex(v => v.id === o.value.id);
    if (index < 0) rows.push(structuredClone(o.value)); else rows[index] = structuredClone(o.value);
  } else {
    const rows = state.costLinks ??= [], index = rows.findIndex(v => v.id === o.value.id);
    if (index < 0) rows.push(structuredClone(o.value)); else rows[index] = structuredClone(o.value);
  }
}

export function costPayer(state: MechanicalState, input: string): Resource {
  // Validate even persisted graphs; a bad link cannot fall back to a free/local cast.
  assertGraph(state);
  let payer = resource(state, input);
  if (!payer) throw new MechanicalKnowledgeError("Shared cost resource is unknown");
  for (;;) {
    const link = state.costLinks?.find(l => l.enabled && l.from === payer!.id);
    if (!link) return payer;
    if (link.unsupported.length) throw new MechanicalKnowledgeError(`Shared cost needs clarification: ${link.unsupported.join("; ")}`);
    payer = resource(state, link.to)!;
  }
}

export function validateManifestation(state: MechanicalState, controller: string, id: string, active: boolean) {
  const companion = state.companions?.find(c => c.id === id && c.controller === controller && c.companionKind === "summon"), actor = companion && entityFor(state, companion.actor);
  if (!companion || !actor) throw new MechanicalKnowledgeError("This summon and its controller are not established");
  if (active && actor.status === "dead") throw new Error("Recalling a summon cannot resurrect it");
  if (active && companion.manifestation?.active || actor.present === active) throw new Error(active ? "This summon is already present" : "This summon is already absent");
  return { companion, actor };
}
export function manifest(state: MechanicalState, controller: string, id: string, active: boolean, action: string, changes: MechanicalChange[], beats: EncounterBeat[], duration?: number) {
  const { companion, actor } = validateManifestation(state, controller, id, active);
  changeManifestation(state, companion, actor, active, action, changes, beats, duration);
}
function changeManifestation(state: MechanicalState, companion: Companion, actor: NonNullable<ReturnType<typeof entityFor>>, active: boolean, action: string, changes: MechanicalChange[], beats: EncounterBeat[], duration?: number) {
  const controller = companion.controller, id = companion.id;
  const source: Evidence = { message: `warp-action:${action}`, quote: `${active ? "Recall" : "Dismiss"} ${actor.name}`, sourceRevision: revision([id, active, duration]) };
  const old = structuredClone(companion), oldActor = structuredClone(actor);
  companion.manifestation = { active, source, ...(active && duration ? { expiresAt: actionCount(state, controller) + duration + 1 } : {}) };
  actor.present = active;
  if (!active) for (const condition of [...state.conditions]) if (condition.summon === companion.id) {
    state.conditions = state.conditions.filter(c => c.id !== condition.id);
    closeCondition(state, condition, { kind: "receipt", id: action });
    changes.push({ kind: "condition", id: condition.id, before: structuredClone(condition), after: null });
  }
  // Identity provenance, injuries, balances, cooldowns and knowledge remain untouched.
  changes.push({ kind: "companion", id: companion.id, before: old, after: structuredClone(companion) }, { kind: "entity", id: actor.id, before: oldActor, after: structuredClone(actor) });
  for (const d of [...(state.distances ?? [])]) if (d.from === actor.name || d.to === actor.name) {
    state.distances = state.distances!.filter(row => row.id !== d.id); changes.push({ kind: "distance", id: d.id, before: structuredClone(d), after: null });
  }
  for (const position of [...(state.positions ?? [])]) if (position.owner === actor.name) {
    state.positions = state.positions!.filter(p => p.id !== position.id); changes.push({ kind: "position", id: position.id, before: structuredClone(position), after: null });
  }
  beats.push({ kind: active ? "summon" : "dismiss", actor: controller, target: actor.name });
}
export function expireCompanions(state: MechanicalState, action: string, changes: MechanicalChange[], beats: EncounterBeat[]) {
  for (const c of state.companions ?? []) if (c.manifestation?.active && c.manifestation.expiresAt !== undefined && c.manifestation.expiresAt <= actionCount(state, c.controller)) {
    const actor = entityFor(state, c.actor);
    if (actor) changeManifestation(state, c, actor, false, action, changes, beats);
  }
}

export const COMPANION_INSTRUCTIONS = `PRIORITY: When this conversation introduces, addresses or uses an established familiar, animal partner, autonomous assistant or summon, save its entity AND companion relationship before optional prose facts. This applies to NPC companions too, not only the player's. Recognizing a companion does not start combat or give it a stat sheet. An unnamed companion can keep its actual distinctive descriptor as its identity; never invent a proper name or treat it as disposable inventory. Reuse that identity on later replies.
For that established relationship, use mechanicalObservations {kind:"companion",actor:"known entity name",controller:"known person or you",companionKind:"companion|summon",message,quote}. Declare both entities in this same response if missing, using actual scene quotes for presence and actual short-name aliases. The relationship quote must literally include both identities or their saved aliases; "my familiar" alone lacks its named speaker. Use an exact nearby narrative fragment naming both instead. Copy a contiguous exact source fragment, including actual punctuation; do not add quotation marks or omit intervening words. Profiles establish the relationship, never current presence. companionKind:summon requires an actual summoning/recall nature, not merely the word familiar. Companion is a relationship, not permission to control another person's actions or knowledge. Do not turn every friend or romance partner into a companion system. Do not duplicate the typed relationship as an inventory/possession fact.
An explicit one-for-one SHARED COST permission between two known effort pools may use {kind:"cost_link",from:"borrower's resource id",to:"payer's resource id",enabled:true,unsupported:[],message,quote}. Both owners must occur in the actual grant. Preserve all limits/conditions in unsupported. Pools need role:effort and the same explicit unit, or the same resource name with no unit. No damage/healing links, money, health, conversion, guessed pool, implicit NPC consent or cycles. An actual revocation uses enabled:false. This redirects saved ability costs only, never standalone spending. It does not copy or refill either balance.
A sourced recall/dismiss ability can use effects {kind:"summon|dismiss",target:"self",companion:"saved companion id or exact actor name"}. Only kind:summon relationships are eligible, owned by the ability's actual controller. summon may add duration:explicitSubsequentControllerActions, only if the source states that action duration. Seconds and other lifetime rules stay unsupported. Already present/absent is not another cast. Recall preserves injuries, resource balances, knowledge and death. No resurrection or automatic healing. A condition effect on a summon itself may add untilDismissed:true only when source explicitly ties that effect to being summoned. Dismissal/expiry clears only such bound temporary effects, never an injury or an unrelated condition. A successful departure does not bring companions along. Their actual cooperation still needs current scene evidence under the existing NPC response contract.`;
