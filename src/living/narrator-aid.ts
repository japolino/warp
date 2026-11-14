import type { ToolRegistrationDTO } from "lumiverse-spindle-types";
import { aidAbility, aidRequestIntent } from "./aid.js";
import { actorName, capable, checkRange, distance, present } from "./encounters.js";
import { costPayer } from "./companions.js";
import type { MechanicalState } from "./mechanics.js";
import type { AbilityDefinition } from "./abilities.js";

/** Static schema: generation identity belongs in the current turn, never in tool definitions. */
export const NARRATOR_AID_TOOL: ToolRegistrationDTO = {
  name: "npc_aid", display_name: "NPC aid", inline_available: true, council_eligible: false,
  description: "When the current Warp narratorAid turn offers this tool and an NPC voluntarily chooses to give the player's requested free beneficial aid, call BEFORE describing its effects. Use an advertised actor and ability ID. If that actor has no prepared beneficial definition, give the name of their actual source-supported aid capability for bounded first-use preparation. This validates one NPC-owned action and its costs. It does not force cooperation: the NPC can instead talk, offer terms, or refuse. Never use for attacks, paid/conditional service, questions about powers, invented powers, or player actions. A ready result must be narrated once; a blocked result spent nothing and is not a fictional refusal.",
  parameters: { type: "object", properties: { turn: { type: "string", description: "Exact current narratorAid.turn" }, actor: { type: "string", description: "Exact advertised NPC name" }, ability: { type: "string", description: "Advertised ability ID, or actual capability name when this actor needs first-use preparation" } }, required: ["turn", "actor", "ability"], additionalProperties: false },
};
export const NATIVE_AID_PREPARATION = "For routine physical treatment, use a reusable mend effect with supported impact (minor for ordinary first aid), rather than clear_condition named after this patient's current wound. clear_condition is for a source-supported named cure, not a way to bypass physical injury severity or recovery limits. Do not invent maxInjury or numerical treatment limits that the source does not establish.";
const named = (name: string, text: string) => !!name && new RegExp(`(?<![\\p{L}\\p{N}_])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "iu").test(text);

/** A direct invitation permits this aid; the narrator tool call supplies the NPC's own decision. */
export function narratorAidActors(state: MechanicalState, request: string): string[] {
  const spoken = request.trim().replace(/^["'“”*\s]+/, "");
  if (!aidRequestIntent(request, state) || !/^(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:(?:heal|treat|mend|cure|restore|protect)\s+(?:me|my)\b|help\s+(?:my\b|me(?:\s+please)?(?:\s+with\s+my\b|\s*\?)))/i.test(spoken)) return [];
  const people = state.entities?.filter(e => e.entityKind === "person" && e.name !== "you" && present(state, e.name) && capable(state, e.name)) ?? [];
  const addressed = people.filter(e => [e.name, e.displayName, ...e.aliases].some(n => named(n, request)));
  const invited = addressed.length === 1 ? addressed[0] : addressed.length === 0 && people.length === 1 ? people[0] : undefined;
  if (!invited) return [];
  const attribution = request.slice(request.indexOf("?") + 1).match(/^\s*["'“”*\s]*I\s+(?:ask|say|whisper|murmur)\s+(?:to\s+)?(.+?)[.!]*$/iu)?.[1];
  if (attribution && ![invited.name, invited.displayName, ...invited.aliases].some(n => n.normalize("NFKC").toLowerCase() === attribution.trim().normalize("NFKC").toLowerCase())) return [];
  return [invited.name];
}
export function canPrepareNarratorAid(state: MechanicalState, request: string, actor: string): boolean {
  return narratorAidActors(state, request).includes(actor) && !state.abilities?.some(a => a.owner === actor && aidAbility(a))
    && !state.aidOffers?.some(o => o.actor === actor && (o.fee || o.work || o.agreement || o.unsupported.length))
    && !state.agreements?.some(g => !g.cancelled && g.service?.actor === actor && !g.service.used);
}
export function narratorAidChoices(state: MechanicalState, request: string): AbilityDefinition[] {
  const invited = narratorAidActors(state, request);
  return (state.abilities ?? []).filter(a => {
    if (!invited.includes(a.owner) || !aidAbility(a)) return false;
    // A direct request cannot waive a price, unfinished work or an unresolved service restriction.
    if (state.aidOffers?.some(o => o.actor === a.owner && o.ability === a.id && (o.fee || o.work || o.agreement || o.unsupported.length))) return false;
    if (state.agreements?.some(g => !g.cancelled && g.service?.actor === a.owner && g.service.ability === a.id && !g.service.used)) return false;
    // NPC choice cannot grant fresh permission to spend a linked player's resource or inventory.
    return a.costs.every(c => {
      try { return c.kind === "resource" ? costPayer(state, c.id).owner !== "you" : state.items.find(i => i.id === c.id)?.owner === a.owner; }
      catch { return false; }
    });
  });
}

/** Keep the source-backed safeguards used by ordinary offered aid. */
export function validateNarratorAid(state: MechanicalState, request: string, actor: string, ability: string) {
  const who = actorName(state, actor);
  const definition = narratorAidChoices(state, request).find(a => a.owner === who && a.id === ability);
  if (!definition) throw Error("This turn does not authorize that free NPC aid; keep any proposed terms available for the player's choice");
  const ranges = [...new Set([...definition.source.quote.matchAll(/\b(?:at|within)\s+(touch|near|far)\s+range\b/gi)].map(m => m[1].toLowerCase() as "touch" | "near" | "far"))];
  if (ranges.length === 1 && ranges[0] !== definition.range) {
    if (!distance(state, who, "you")) throw Error("The ability's quoted range needs an established distance");
    checkRange(state, who, "you", ranges[0]);
  }
  for (const e of definition.effects) if (e.kind === "clear_condition") {
    const owner = e.target === "self" ? who : "you";
    if (state.conditions.some(c => c.owner === owner && c.name.normalize("NFKC").toLowerCase() === e.name?.normalize("NFKC").toLowerCase() && (c.category === "physical_injury" && c.recovery !== "routine"))) throw Error("Ordinary requested aid cannot clear a special injury");
    if (state.conditions.some(c => c.owner === owner && c.name.normalize("NFKC").toLowerCase() === e.name?.normalize("NFKC").toLowerCase() && (c.helps.length || c.defenses?.length))) throw Error("Requested aid cannot remove an established benefit");
  }
  return definition;
}
