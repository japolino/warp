import { storyRevision, sourceRevisionMatches, sourceContains } from "./story-text.js";
import { revision } from "../shared/revision.js";
import { seededRng } from "../engine/dice.js";
import { attemptBands } from "./check-bands.js";
import { actorName, present, capable } from "./encounters.js";
import type { MechanicalState, MechanicalOperation, MechanicalReceipt } from "./mechanics.js";
import type { Decision, Evidence, Message } from "./world.js";

export const MAX_RESPONSES = 3;
export type ResponseAction = Extract<MechanicalOperation, { kind: "ability" | "move" | "strike" }> | { kind: "wait" | "defend" };
export interface ResponsePlan {
  actor: string; action: ResponseAction; source: Evidence;
  assessment: { contested: boolean; tier: Decision["tier"]; intent: string; stakes: string; reasons: string[] };
}
export interface ResponseCheck { actor: string; target?: string; decision: Pick<Decision, "tier" | "result" | "roll" | "intent">; }
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 160) => typeof v === "string" && v.trim().length <= max ? v.trim() : "";

/** Scene evidence authorizes NPC activity, never a player choice or a generated power. */
export function readResponsePlans(raw: unknown, state: MechanicalState, messages: Message[], enabled: boolean, historical = false): ResponsePlan[] {
  if (raw === undefined || (Array.isArray(raw) && !raw.length)) return [];
  if (!enabled) throw new Error("NPC responses need an actual player action in an ongoing exchange");
  if (!Array.isArray(raw) || raw.length > MAX_RESPONSES) throw new Error("Too many NPC responses");
  const latest = messages.filter(m => !m.is_user && m.content.trim()).at(-1), actors = new Set<string>();
  return raw.map(row => {
    if (!obj(row) || Object.keys(row).some(k => !["actor", "action", "assessment", "message", "quote", ...(historical ? ["sourceRevision"] : [])].includes(k))) throw new Error("Unsupported NPC response");
    const actor = actorName(state, text(row.actor, 80)), quote = text(row.quote, 400);
    if (!actor || actor === "you" || actors.has(actor) || !present(state, actor) || !capable(state, actor)) throw new Error("NPC response actor is unavailable");
    // There is exactly one allowed source. Bind its ID locally rather than asking
    // the model to copy it, while still rejecting any quote absent from that source.
    if (!latest || quote.length < 4 || !sourceContains(latest.content, quote) || historical && typeof row.sourceRevision === "string" && !sourceRevisionMatches(latest, row.sourceRevision)) throw new Error("NPC response lacks current scene evidence");
    actors.add(actor);
    const a = row.action;
    if (!obj(a)) throw new Error("NPC action is missing");
    let action: ResponseAction;
    if (a.kind === "ability") {
      if (Object.keys(a).some(k => !["kind", "ability", "version", "target"].includes(k))) throw new Error("NPC invocation cannot override its definition");
      const ability = state.abilities?.find(d => d.owner === actor && (d.id === a.ability || d.name.toLocaleLowerCase() === text(a.ability).toLocaleLowerCase()));
      if (!ability || (a.version !== undefined && a.version !== ability.version)) throw new Error("NPC ability is not established");
      const target = text(a.target, 80) ? actorName(state, text(a.target, 80)) : ability.target === "self" ? actor : "";
      if (!target || !present(state, target)) throw new Error("NPC target is not present");
      action = { kind: "ability", ability: ability.id, version: ability.version, target };
    } else if (a.kind === "move") {
      if (Object.keys(a).some(k => !["kind", "target", "direction"].includes(k)) || !["closer", "away"].includes(a.direction as string)) throw new Error("Invalid NPC movement");
      const target = actorName(state, text(a.target, 80));
      if (!target || !present(state, target) || target === actor) throw new Error("NPC movement target is unavailable");
      action = { kind: "move", target, direction: a.direction as "closer" | "away" };
    } else if (a.kind === "strike") {
      if (Object.keys(a).some(k => !["kind", "target"].includes(k))) throw new Error("A basic strike has no model-selected damage");
      const target = actorName(state, text(a.target, 80));
      if (!target || !present(state, target) || target === actor) throw new Error("NPC strike target is unavailable");
      action = { kind: "strike", target };
    } else if ((a.kind === "wait" || a.kind === "defend") && Object.keys(a).length === 1) action = { kind: a.kind };
    else throw new Error("Unsupported NPC action");
    const assessment = row.assessment;
    if (!obj(assessment) || Object.keys(assessment).some(k => !["contested", "tier", "intent", "stakes", "reasons"].includes(k)) || (assessment.contested !== undefined && typeof assessment.contested !== "boolean")) throw new Error("Invalid NPC assessment");
    const offensive = offensiveAction(action, state, actor);
    const contested = offensive || assessment.contested === true;
    const tier = assessment.tier;
    if (contested && (!["favorable", "uncertain", "outmatched"].includes(tier as string) || !text(assessment.intent) || !text(assessment.stakes)
      || !Array.isArray(assessment.reasons) || !assessment.reasons.length || assessment.reasons.some(r => !text(r, 180)))) throw new Error("NPC uncertainty is incomplete");
    return { actor, action, source: { message: latest.id, quote, sourceRevision: historical && typeof row.sourceRevision === "string" ? row.sourceRevision : storyRevision(latest.content) }, assessment: {
      contested, tier: ["favorable", "uncertain", "outmatched"].includes(tier as string) ? tier as Decision["tier"] : "uncertain",
      intent: text(assessment.intent), stakes: text(assessment.stakes), reasons: Array.isArray(assessment.reasons) ? assessment.reasons.map(r => text(r, 180)).filter(Boolean).slice(0, 3) : [],
    } };
  });
}

export function offensiveResponse(plan: ResponsePlan, state: MechanicalState) {
  return offensiveAction(plan.action, state, plan.actor);
}
export function offensiveAction(action: MechanicalOperation, state: MechanicalState, actor: string): boolean {
  if (action.kind === "strike") return true;
  if (action.kind !== "ability") return false;
  const ability = state.abilities?.find(a => a.id === action.ability), target = action.target ?? (ability?.target === "self" ? actor : "");
  if (!ability || !target || actorName(state, target) === actorName(state, actor)) return false;
  return ability.effects.some(e => e.target === "target" && (e.kind === "damage" || e.kind === "harm"
    || e.kind === "condition" && (!!e.blocks?.length || !!e.hinders?.length || !e.helps?.length)
    || e.kind === "clear_condition" && state.conditions.some(c => c.owner === actorName(state, target) && c.name.toLocaleLowerCase() === e.name?.toLocaleLowerCase() && (!!c.helps.length || !!c.defenses?.length))));
}
export function responseDecision(plan: ResponsePlan, actionId: string, shift: number, reasons: string[], requireRoll = false): Decision | undefined {
  if (!requireRoll && plan.assessment.contested === false) return;
  if (!["outmatched", "uncertain", "favorable"].includes(plan.assessment.tier) || !text(plan.assessment.intent) || !text(plan.assessment.stakes)
    || !Array.isArray(plan.assessment.reasons) || !plan.assessment.reasons.length || plan.assessment.reasons.some(r => !text(r, 180))) throw new Error("NPC uncertainty is incomplete");
  const tiers: Decision["tier"][] = ["outmatched", "uncertain", "favorable"];
  const tier = tiers[Math.max(0, Math.min(2, tiers.indexOf(plan.assessment.tier) + shift))];
  const roll = Math.floor(seededRng(`${actionId}:response:${plan.actor}`)() * 100) + 1, [clean, mixed] = attemptBands(tier);
  return { tier, roll, result: roll <= clean ? "clean" : roll <= mixed ? "mixed" : "setback", intent: plan.assessment.intent, stakes: plan.assessment.stakes,
    reasons: [...plan.assessment.reasons, ...reasons].slice(0, 4) };
}

/** Show an executed response, without hidden assessment reasons or canonical identities. */
export function responseChecks(receipt?: MechanicalReceipt, state?: MechanicalState, visible: string[] = []): ResponseCheck[] {
  if (receipt?.status !== "ready") return [];
  const display = (actor: string) => {
    if (actor === "you") return "you";
    if (!state) return "Someone";
    const known = visible.find(n => actorName(state, n) === actor);
    if (known) return known;
    const entity = state.entities?.find(e => e.name === actor);
    return entity && !entity.source.message.startsWith("warp-source:") && entity.source.quote.toLocaleLowerCase().includes(entity.displayName.toLocaleLowerCase()) ? entity.displayName : "Someone";
  };
  return (receipt.beats ?? []).flatMap(b => b.kind === "response" && b.decision ? [{ actor: display(b.actor), ...(b.target ? { target: display(b.target) } : {}), decision: {
    tier: b.decision.tier, result: b.decision.result, roll: b.decision.roll,
    intent: `${b.name ? b.name[0].toLocaleUpperCase() + b.name.slice(1) : "Respond"}${b.target ? ` · ${display(b.target)}` : ""}`,
  } }] : []);
}

export const RESPONSE_INSTRUCTIONS = `An ongoing physical exchange may include exchange:true and responses:[{actor,action,assessment:{contested,tier:"favorable|uncertain|outmatched",intent,stakes,reasons:[]},quote}]. Otherwise omit responses or return [].
Plan at most one response for each present NPC, at most 3 total, in the order the scene supports. quote must be an EXACT substring of that NPC's current intention/opportunity in the MOST RECENT narrator message, never a card, old grudge, player attempt or generic personality. Code attaches the source message ID; do not draft future narration in a message field. Do not create opposition, interrupt quiet scenes, punish a question, or continue combat after it actually ended. Only an actual player action opens an exchange, not dialogue, inspection, a hypothetical or an OOC edit.
NPC action vocabulary: {kind:"ability",ability:"saved ID or newly prepared name",target}; {kind:"move",target,direction:"closer|away"}; {kind:"strike",target} for an ordinary unmodified physical strike at touch range; {kind:"defend"}; {kind:"wait"}. Prepare a relevant NPC ability from its real source in abilityDefinitions if needed. Both sides use the same stored definitions, costs, range and defenses. No generated damage, no replacement cost and no new power in a response.
Basic strike uses Warp's fixed 5 physical impact. It changes a known vital resource when present, otherwise resolver 4 records qualitative physical injury for a person without inventing a numerical pool. Prefer an established source-backed attack when the person has one; do not flatten exceptional abilities or equipment into this fallback. Explicit numerical ability damage still needs a known resource. Unknown money, energy and recovery limits remain unknown. If an exact numerical exchange cannot be prepared for both sides, keep that part unresolved locally rather than inventing health or letting one side take unrecorded damage.
Assess each NPC's base circumstances WITHOUT mechanical condition modifiers. Code applies those after the player's action, checks eligibility, and rolls. Offensive responses always roll; do not supply a roll or outcome. A disabled, absent, out-of-range or unaffordable responder does not get a free action. No response triggers another response list. Do not automatically dodge, counterattack, flee, consent or make another choice for the player. A passive established defense may apply automatically. Stop at the next player decision.`;
