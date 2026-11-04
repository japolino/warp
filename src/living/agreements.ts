import { revision } from "../shared/revision.js";
import { storyContent, storyRevision, sourceRevisionMatches, sourceContains } from "./story-text.js";
import type { Evidence, Message } from "./world.js";
import type { MechanicalState, MechanicalChange } from "./mechanics.js";
import { actorName, present, capable, vital, type EncounterBeat, MechanicalKnowledgeError } from "./encounters.js";

export interface AgreementRequirement { id: string; text: string; source: Evidence; done?: Evidence; }
export interface RewardClaim {
  id: string; kind: "item" | "resource"; asset: string; amount: number; source: Evidence;
  ready?: { allowed: boolean; source: Evidence; uncontested?: true }; paid?: { action: string };
}
export interface Agreement {
  id: string; owner: string; name: string; source: Evidence; offer?: Evidence; from?: string;
  requirements: AgreementRequirement[]; rewards: RewardClaim[]; unsupported: string[];
  cancelled?: Evidence;
}
export type AgreementObservation =
  | { kind: "agreement"; value: Agreement }
  | { kind: "agreement_progress"; value: { agreement: string; requirement: string; source: Evidence } }
  | { kind: "reward_ready"; value: { agreement: string; reward: string; ready: boolean; source: Evidence; uncontested?: true } }
  | { kind: "agreement_cancel"; value: { agreement: string; source: Evidence } };
const str = (v: unknown, max = 240) => typeof v === "string" && v.trim().length <= max ? v.trim().replace(/\s+/g, " ") : "";
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const normalized = (s: string) => s.normalize("NFKC").toLocaleLowerCase();
const numeric = (quote: string, n: number) => (quote.match(/\d+(?:\.\d+)?/g) ?? []).some(v => Number(v) === n)
  || ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"].some((v, i) => i === n && new RegExp(`\\b${v}\\b`, "i").test(quote));
export const agreementDone = (a: Agreement) => !a.cancelled && !a.unsupported.length && a.requirements.every(r => !!r.done);
export const agreementSettled = (a: Agreement) => !!a.cancelled || agreementDone(a) && a.rewards.every(r => !!r.paid);
export const visibleAgreements = (rows: Agreement[] = []) => [...rows.filter(a => !agreementSettled(a)), ...rows.filter(agreementSettled).slice(-6)];
export function agreementNotes(before: MechanicalState, after: MechanicalState): string[] {
  return (after.agreements ?? []).filter(a => a.owner === "you" || a.from === "you").flatMap(a => {
    const old = before.agreements?.find(b => b.id === a.id), count = a.requirements.filter(r => r.done).length;
    if (!old || !!old.cancelled !== !!a.cancelled || old.requirements.filter(r => r.done).length !== count) return [`${a.name} · ${a.cancelled ? "withdrawn" : `${count}/${a.requirements.length} done`}`];
    return [];
  }).slice(-2);
}
function evidence(raw: unknown, messages: Message[], historical = false): Evidence | undefined {
  if (!obj(raw)) return;
  const message = str(raw.message, 160), quote = str(raw.quote, 400), m = messages.find(m => m.id === message);
  if (!m || quote.length < 4 || !sourceContains(m.content, quote) || message.startsWith("warp-source:")) return;
  const saved = historical && typeof raw.sourceRevision === "string" ? raw.sourceRevision : undefined;
  if (saved && !sourceRevisionMatches(m, saved)) return;
  return { message, quote, sourceRevision: saved ?? storyRevision(m.content) };
}
const at = (e: Evidence, messages: Message[]) => messages.findIndex(m => m.id === e.message);
function canonical(state: MechanicalState, v: unknown, player?: string): string {
  const name = str(v, 80);
  return ["you", "i", "me", "player", "{{user}}", player?.toLocaleLowerCase()].includes(name.toLocaleLowerCase()) ? "you" : actorName(state, name);
}
function names(state: MechanicalState, source: Evidence, who: string) {
  const entity = state.entities?.find(e => e.name === who);
  return [who, ...(entity ? [entity.displayName, ...entity.aliases] : [])].some(n => {
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !!n && new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "iu").test(source.quote);
  });
}
function namedEvidence(state: MechanicalState, source: Evidence | undefined, who: string, messages: Message[]): Evidence | undefined {
  if (!source || !who || who === "you" || names(state, source, who)) return source;
  const message = messages.find(m => m.id === source.message);
  if (!message || message.is_user && !/^\s*\(?OOC correction:/i.test(message.content)) return;
  // Bind the speaker outside a short dialogue quote to one bounded actual paragraph.
  // No name supplied by the model is inserted into the source.
  const paragraphs = storyContent(message.content).split(/\n\s*\n/).map(p => p.trim().replace(/\s+/g, " ")).filter(p => p.length <= 400 && p.includes(source.quote));
  if (paragraphs.length !== 1 || !names(state, { ...source, quote: paragraphs[0] }, who)) return;
  const expanded = { ...source, quote: paragraphs[0] };
  if (state.entities?.some(e => e.entityKind === "person" && e.name !== who && e.name !== "you" && names(state, expanded, e.name))) return;
  return expanded;
}
function lookup<T extends { id: string; text?: string; asset?: string }>(rows: T[], selector: unknown): T | undefined {
  const key = normalized(str(selector));
  const found = rows.filter(r => [r.id, r.text, r.asset].some(v => v && normalized(v) === key));
  return found.length === 1 ? found[0] : undefined;
}

/** The model identifies clauses and actual fulfillment; code retains the accepted terms. */
export function readAgreementObservation(raw: Record<string, unknown>, state: MechanicalState, messages: Message[], player?: string, historical = false): AgreementObservation | undefined {
  const rootSource = evidence(raw, messages, historical); if (!rootSource) return;
  let source: Evidence = rootSource;
  const message = messages.find(m => m.id === source.message)!;
  const correction = message.is_user && /^\s*\(?OOC correction:/i.test(message.content);
  if (raw.kind === "agreement") {
    if (Object.keys(raw).some(k => !["kind", "id", "owner", "name", "from", "offer", "requirements", "rewards", "unsupported", "message", "quote", ...(historical ? ["sourceRevision"] : [])].includes(k))) return;
    const owner = canonical(state, raw.owner, player), name = str(raw.name, 120), from = canonical(state, raw.from, player);
    const acceptedSource = namedEvidence(state, source, owner, messages); if (!acceptedSource) return;
    source = acceptedSource;
    const offer = namedEvidence(state, evidence(raw.offer, messages, historical), from, messages);
    if (!owner || !name || (owner === "you" ? !message.is_user : message.is_user && !correction || !names(state, source, owner))) return;
    const offerMessage = offer && messages.find(m => m.id === offer.message);
    const correctedOffer = offerMessage?.is_user && /^\s*\(?OOC correction:/i.test(offerMessage.content);
    if (from && (!offer || (from === "you" ? !offerMessage?.is_user : offerMessage?.is_user && !correctedOffer || !names(state, offer, from)) || at(offer, messages) > at(source, messages) || from === owner)) return;
    if (raw.offer && !offer) return;
    const id = `agreement-${revision([owner, from, offer ? [offer.message, offer.sourceRevision] : [source.message, source.sourceRevision, source.quote]])}`;
    if (state.agreements?.some(a => a.id === id || offer && a.owner === owner && a.from === from && a.offer?.message === offer.message) || (state.agreements?.filter(a => !agreementSettled(a)).length ?? 0) >= 3) return;
    if (!Array.isArray(raw.requirements) || !raw.requirements.length || raw.requirements.length > 6 || !Array.isArray(raw.rewards) || raw.rewards.length > 4) return;
    const terms = [source, ...(offer ? [offer] : [])];
    const clause = (v: unknown) => {
      const e = evidence(v, messages, historical);
      return e && terms.some(t => t.message === e.message && t.quote.includes(e.quote)) ? e : undefined;
    };
    const requirements: AgreementRequirement[] = [];
    for (const value of raw.requirements) {
      if (!obj(value) || Object.keys(value).some(k => !["message", "quote", ...(historical ? ["sourceRevision"] : [])].includes(k))) return;
      const e = clause(value); if (!e || requirements.some(r => r.text === e.quote)) return;
      requirements.push({ id: `requirement-${revision([id, e.quote])}`, text: e.quote, source: e });
    }
    const rewards: RewardClaim[] = [];
    for (const value of raw.rewards) {
      if (!obj(value) || Object.keys(value).some(k => !["kind", "asset", "amount", "message", "quote", ...(historical ? ["sourceRevision"] : [])].includes(k)) || !from || !offer || !["item", "resource"].includes(value.kind as string)) return;
      const e = clause(value), asset = str(value.asset, 100), amount = value.amount;
      if (!e || e.message !== offer.message || !asset || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > 1e6 || value.kind === "item" && !Number.isInteger(amount) || !numeric(e.quote, amount)) return;
      const rows = value.kind === "item" ? state.items : state.resources;
      const owned = rows.filter(r => r.owner === from && (r.id === asset || normalized(r.name) === normalized(asset)));
      const selector = owned.length === 1 ? owned[0].name : asset;
      if (!normalized(e.quote).includes(normalized(selector)) || rewards.some(r => r.kind === value.kind && normalized(r.asset) === normalized(selector))) return;
      rewards.push({ id: `reward-${revision([id, value.kind, selector])}`, kind: value.kind as RewardClaim["kind"], asset: selector, amount, source: e });
    }
    if (raw.unsupported !== undefined && (!Array.isArray(raw.unsupported) || raw.unsupported.length > 6 || raw.unsupported.some(v => !str(v)))) return;
    return { kind: "agreement", value: { id, owner, name, source, ...(offer ? { offer } : {}), ...(from ? { from } : {}), requirements, rewards, unsupported: Array.isArray(raw.unsupported) ? raw.unsupported.map(v => str(v)) : [] } };
  }
  const agreements = (state.agreements ?? []).map(a => ({ ...a, text: a.name }));
  const agreement = agreements.find(a => a.id === raw.agreement) ?? lookup(agreements.filter(a => !agreementSettled(a)), raw.agreement);
  if (!agreement || agreement.cancelled || at(source, messages) < at(agreement.source, messages)) return;
  if (raw.kind === "agreement_cancel") {
    if (agreement.owner === "you" ? !message.is_user : message.is_user && !correction || !names(state, source, agreement.owner)) return;
    return { kind: "agreement_cancel", value: { agreement: agreement.id, source } };
  }
  if (message.is_user && !correction) return; // An attempted action is not fulfillment or the payer's consent.
  if (raw.kind === "agreement_progress") {
    const requirement = lookup(agreement.requirements, raw.requirement);
    if (!requirement || requirement.done) return;
    return { kind: "agreement_progress", value: { agreement: agreement.id, requirement: requirement.id, source } };
  }
  if (raw.kind === "reward_ready") {
    const reward = lookup(agreement.rewards, raw.reward);
    const other = agreement.from === "you" ? agreement.owner : agreement.from;
    const offeredSource = namedEvidence(state, source, other ?? "", messages); if (!offeredSource) return;
    source = offeredSource;
    if (!reward || reward.paid || !agreementDone(agreement) || typeof raw.ready !== "boolean" || !other || !names(state, source, other)) return;
    if (agreement.requirements.some(r => at(r.done!, messages) > at(source, messages))) return;
    if (reward.ready && at(reward.ready.source, messages) >= at(source, messages)) return;
    if (reward.ready?.allowed === raw.ready && !(raw.ready && raw.uncontested === true)) return;
    return { kind: "reward_ready", value: { agreement: agreement.id, reward: reward.id, ready: raw.ready, source, ...(raw.ready && raw.uncontested === true ? { uncontested: true } : {}) } };
  }
}

export function observeAgreement(state: MechanicalState, observation: AgreementObservation) {
  if (observation.kind === "agreement") {
    if (!state.agreements?.some(a => a.id === observation.value.id)) (state.agreements ??= []).push(structuredClone(observation.value));
    return;
  }
  const agreement = state.agreements?.find(a => a.id === observation.value.agreement);
  if (!agreement) return;
  if (observation.kind === "agreement_progress") agreement.requirements.find(r => r.id === observation.value.requirement)!.done = observation.value.source;
  else if (observation.kind === "reward_ready") agreement.rewards.find(r => r.id === observation.value.reward)!.ready = { allowed: observation.value.ready, source: observation.value.source, ...(observation.value.uncontested ? { uncontested: true } : {}) };
  else agreement.cancelled = observation.value.source;
}

/** Called on the receipt's working copy. Both sides and the paid marker commit together. */
export function settleReward(state: MechanicalState, actor: string, agreementId: string, rewardId: string, action: string, changes: MechanicalChange[], beats: EncounterBeat[]) {
  const agreement = state.agreements?.find(a => a.id === agreementId), reward = agreement?.rewards.find(r => r.id === rewardId);
  if (!agreement || !reward || reward.paid) throw new Error("Reward unavailable or already received");
  if (agreement.owner !== actor && agreement.from !== actor || agreement.from === "you" && actor !== "you") throw new Error("This actor cannot settle that reward");
  if (!agreementDone(agreement)) throw new Error("The agreement's requirements are not all fulfilled");
  const other = agreement.from === actor ? agreement.owner : agreement.from;
  if (!reward.ready) throw new MechanicalKnowledgeError("The other participant's current willingness is not recorded");
  if (!reward.ready.allowed) throw new Error("The other participant withdrew this reward exchange");
  if (!agreement.from || !other || other !== "you" && !state.entities?.some(e => e.name === other)) throw new MechanicalKnowledgeError("The other participant's current presence is not recorded");
  if (!present(state, other) || !capable(state, other)) throw new Error("The other participant has not made this exchange available here");
  const beforeAgreement = structuredClone(agreement), payer = agreement.from, recipient = agreement.owner;
  if (reward.kind === "resource") {
    const find = (owner: string) => state.resources.filter(r => r.owner === owner && normalized(r.name) === normalized(reward.asset));
    const from = find(payer), to = find(recipient);
    if (from.length !== 1 || to.length !== 1) throw new MechanicalKnowledgeError(`Both current ${reward.asset} balances must be known`);
    const a = from[0], b = to[0];
    if (a.role && b.role && a.role !== b.role || a.unit !== b.unit || a.role === "shield" || b.role === "shield" || vital(state, payer)?.id === a.id || vital(state, recipient)?.id === b.id) throw new Error("The reward resources do not support this transfer");
    if (a.current < reward.amount) throw new Error(`The payer lacks ${reward.asset}`);
    if (b.max !== undefined && b.current + reward.amount > b.max) throw new Error("The recipient cannot hold the whole reward");
    const oldA = structuredClone(a), oldB = structuredClone(b); a.current -= reward.amount; b.current += reward.amount;
    changes.push({ kind: "resource", id: a.id, before: oldA, after: structuredClone(a) }, { kind: "resource", id: b.id, before: oldB, after: structuredClone(b) });
  } else {
    const items = state.items.filter(i => i.owner === payer && normalized(i.name) === normalized(reward.asset) && i.quantity > 0);
    if (items.length !== 1) throw new MechanicalKnowledgeError("The actual reward item is not uniquely established");
    const item = items[0];
    if (item.equipped || item.quantity < reward.amount) throw new Error("The actual reward quantity is unavailable");
    const old = structuredClone(item);
    if (item.quantity === reward.amount) item.owner = recipient;
    else {
      const received = { ...structuredClone(item), id: `reward-item-${revision([agreement.id, reward.id])}`, owner: recipient, quantity: reward.amount };
      if (state.items.some(i => i.id === received.id)) throw new Error("Reward item already exists");
      item.quantity -= reward.amount; state.items.push(received);
      changes.push({ kind: "item", id: received.id, before: null, after: structuredClone(received) });
    }
    changes.push({ kind: "item", id: item.id, before: old, after: structuredClone(item) });
  }
  reward.paid = { action };
  changes.push({ kind: "agreement", id: agreement.id, before: beforeAgreement, after: structuredClone(agreement) });
  beats.push({ kind: "reward", actor: payer, target: recipient, name: reward.asset, amount: reward.amount });
}

export const AGREEMENT_INSTRUCTIONS = `When an actual agreement has several requirements or an explicit counted reward, optionally add mechanicalObservations {kind:"agreement",owner,name,from:"reward payer if any",offer:{message,quote},requirements:[{message,quote}],rewards:[{kind:"item|resource",asset:"established asset name",amount,message,quote}],unsupported:[],message,quote}. The root quote is the owner's actual acceptance, in the player's own message for owner:you. An NPC payer's offer is actual narrator text naming them and the terms, never a player's invented NPC offer. When the player offers payment for another person's work, from:you requires the player's own offer, and owner is the NPC who actually accepts in narrator text. Each requirement quote is a distinct exact clause within that acceptance or offer; all requirements are required. Do not drop a condition, invent a reward, automatically accept a request, or turn an ordinary invitation into a quest. No reward means rewards:[]. Unknown source mechanics/restrictions stay in unsupported. Do not create duplicate free-form commitments, situations or facts for requirements, progress or rewards already represented by the structured agreement. Retain a separate event only for an independent consequence, such as a witness learning a secret. Resolve an earlier pending-offer situation when the agreement is accepted.
Record actual fulfillment with {kind:"agreement_progress",agreement:"saved id or name",requirement:"saved id or exact clause",message,quote}, citing actual NARRATOR completion, not the player's attempt or a repeated offer. Code completes the agreement only after every requirement. Do not change accepted terms on subsequent reads. The owner can explicitly withdraw with {kind:"agreement_cancel",agreement,message,quote}; an NPC's displeasure does not withdraw the player's promise for them.
After all requirements are fulfilled, an actual payer offering/holding out a particular reward can establish {kind:"reward_ready",agreement,reward:"saved id or asset name",ready:true,message,quote}. An offer may add uncontested:true only when taking/receiving this particular reward now is routine, with no established obstacle, hazard or opposing action. Willingness alone does not prove that. The code may use this fresh classification to skip a redundant pre-read for a simple collection; ambiguity, changed scenes and opposed actions still need interpretation. A subsequent explicit refusal/withdrawal can set ready:false. This is current willingness, separate from the original promise. It needs actual narrator text naming the NPC counterpart after the recorded fulfillment. For from:you this is the NPC recipient's willingness to receive, never permission to spend the player's money automatically. An earned reward does not force someone to cooperate. Do not narrate a completed monetary/item handover without its mechanical receipt. Make the offer available and leave acceptance to the player. The player can collect it through normal chat; no menu is required.
Reward collection uses saved exact amounts and transfers actual owned items or between two established same-unit resource balances. Unknown balances are unknown, not zero. An offer alone does not prove the payer owns the money or item. Do not mint items or coins, refill a spent balance, substitute a different reward, or create numerical Health/relationship/XP to pay a promise. When a physical reward, including a counted pile of coins, is established without known total wallet balances, use an item claim and track that actual stack instead of inventing a wallet total. The offered amount alone does not prove possession; a later actual holding/counting/setting-out event can establish the counted item. Use a distinct source-backed item instance ID for a new stack, not the ID of a previously transferred stack. Actual paid rewards cannot be offered or collected again.`;
