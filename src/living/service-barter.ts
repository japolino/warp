import type { Evidence } from "./world.js";
import type { AidOffer } from "./aid.js";
import type { AidFee } from "./service-payment.js";
import type { Agreement, AgreementRequirement } from "./agreements.js";
import type { MechanicalState } from "./mechanics.js";

export interface ServicePromise {
  offer: string; version: number; actor: string; ability: string; abilityVersion: number; name: string;
  source: Evidence; fee?: AidFee; used?: { action: string; feeWaived?: Evidence };
}
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const normalize = (s: string) => s.normalize("NFKC").toLocaleLowerCase();
const same = (a: Evidence, b: Evidence) => a.message === b.message && a.sourceRevision === b.sourceRevision && a.viewRevision === b.viewRevision;
export function sameServiceFee(a: unknown, b: AidFee | undefined): boolean {
  return a === undefined && b === undefined || !!b && obj(a) && !Object.keys(a).some(k => !["kind", "id", "amount"].includes(k))
    && a.kind === b.kind && a.id === b.id && a.amount === b.amount;
}
export function explicitServiceWaiver(quote: string): boolean {
  const free = "(?:no fees?(?!\\s+waivers?)|free of charge|for free|costs? you nothing|you pay nothing)";
  return new RegExp(`\\b${free}\\b`, "i").test(quote)
    && !new RegExp(`\\b(?:not|never|cannot|can't|won't|no longer)\\b[^.!?]{0,45}\\b${free}\\b`, "i").test(quote);
}

/** All words in the conditional work region must be covered, including distinct clauses. */
export function readAidWork(raw: unknown, source: Evidence, historical = false): { work: Evidence[]; remaining: string } | undefined {
  if (!Array.isArray(raw) || !raw.length || raw.length > 6) return;
  const work: Evidence[] = [];
  for (const value of raw) {
    const quote = historical && obj(value) ? value.quote : value;
    if (typeof quote !== "string" || quote.trim().length < 4 || quote.length > 240) return;
    const clause = quote.trim().replace(/\s+/g, " ");
    if (!source.quote.includes(clause) || work.some(w => normalize(w.quote) === normalize(clause))) return;
    if (/\b(?:pay|paying|payment|spend|spending)\b/i.test(clause)) return; // Monetary fees use their conserved payment path.
    if (historical && (!obj(value) || Object.keys(value).some(k => !["message", "quote", "sourceRevision", "viewRevision"].includes(k)) || !same(value as unknown as Evidence, source))) return;
    work.push({ ...source, quote: clause });
  }
  // The common suffix form and a leading "If you ..., I'll ..." have one bounded work region.
  const patterns = [
    /\b(?:in\s+(?:exchange|return)\s+for)\s+([^.!?]+)(?=[.!?]|$)/i,
    /\b(?:only\s+if|if|after|once|provided(?:\s+that)?)\s+(you\s+[^.!?]+?)(?=,\s*(?:I(?:['’]ll|\s+will)|[\p{L}\p{N} '-]{1,80}\s+(?:will|offers?))\b|[.!?]|$)/iu,
    /(?:["“'‘]|:\s*)([^.!?]+?)\s+and\s+I(?:['’]ll|\s+will)\b/i,
    /\bfor\s+([^.!?]+)(?=[.!?]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(source.quote); if (!match) continue;
    let region = match[1];
    if (!work.every(w => region.includes(w.quote))) continue;
    for (const clause of work) region = region.replace(clause.quote, " ");
    if (region.replace(/\b(?:and|you)\b/gi, "").replace(/[\s,;:'"“”‘’]+/g, "")) continue;
    return { work, remaining: source.quote.replace(match[0], " ") };
  }
}

/** An actual player acceptance can attach the already quoted service to its exact work clauses. */
export function readServicePromise(raw: unknown, state: MechanicalState, owner: string, from: string, offer: Evidence | undefined, requirements: AgreementRequirement[], historical = false): ServicePromise | undefined {
  if (!obj(raw) || Object.keys(raw).some(k => !["offer", "version"].includes(k)) || owner !== "you" || !offer) return;
  const candidates = state.aidOffers?.filter(a => a.status === "offered" && a.actor === from && same(a.source, offer) && (raw.version === undefined && !historical || a.version === raw.version)
    && (a.id === raw.offer || !historical && typeof raw.offer === "string" && [a.name, state.abilities?.find(d => d.id === a.ability)?.name].some(n => n && normalize(n) === normalize(raw.offer as string)))) ?? [];
  const aid = candidates.length === 1 ? candidates[0] : undefined;
  if (!aid?.work?.length || aid.agreement || aid.actor !== from || aid.unsupported.length || !same(aid.source, offer) || !offer.quote.includes(aid.source.quote)) return;
  if (requirements.length !== aid.work.length || !aid.work.every(w => requirements.some(r => same(w, r.source) && w.quote === r.text))) return;
  return { offer: aid.id, version: aid.version, actor: aid.actor, ability: aid.ability, abilityVersion: aid.abilityVersion, name: aid.name, source: structuredClone(aid.source), ...(aid.fee ? { fee: structuredClone(aid.fee) } : {}) };
}

export function serviceAgreements(state: MechanicalState, offer: string, actor: string, ability: string, version: number): Agreement[] {
  return (state.agreements ?? []).filter(a => a.owner === "you" && a.from === actor && !a.cancelled && a.service && !a.service.used
    && a.service.offer === offer && a.service.actor === actor && a.service.ability === ability && a.service.abilityVersion === version);
}

export function serviceAgreement(state: MechanicalState, offer: string, actor: string, ability: string, version: number, selector?: unknown): Agreement | undefined {
  const rows = serviceAgreements(state, offer, actor, ability, version);
  const selected = selector === undefined ? rows : rows.filter(a => a.id === selector || typeof selector === "string" && normalize(a.name) === normalize(selector));
  return selected.length === 1 ? selected[0] : undefined;
}

export function serviceReady(agreement: Agreement): boolean {
  return !!agreement.service && !agreement.service.used && !agreement.cancelled && !agreement.unsupported.length && agreement.requirements.every(r => !!r.done);
}

export function matchesService(offer: AidOffer, agreement: Agreement): boolean {
  const service = agreement.service;
  return !!service && service.offer === offer.id && service.actor === offer.actor && service.ability === offer.ability && service.abilityVersion === offer.abilityVersion
    && (sameServiceFee(service.fee, offer.fee) || !!service.fee && !offer.fee && !!offer.feeWaived && same(offer.feeWaived, offer.source)
      && offer.feeWaived.quote === offer.source.quote && explicitServiceWaiver(offer.source.quote));
}

export const SERVICE_INSTRUCTIONS = `A real conditional offer of beneficial NPC aid may add work:["each exact distinct work clause"] to aid_offer. The clauses must together cover ALL work in the quoted condition, such as "sweep the chapel steps" AND "wash the basin" in "Jo offers Mend if you sweep the chapel steps and wash the basin." When all labor conditions are represented in work, do not duplicate those supported clauses in unsupported. Service fees/work belong to the offer; the NPC ability definition retains its own actual execution costs and restrictions. Keep additional prices in fee and unsupported timing/other restrictions in unsupported. An unaccepted proposal is not an agreement, a task completed, a cure or an executed spell. Work offers can be recovered from an earlier supplied narrator reply, without executing anything.
When the player actually accepts that work, record the ordinary agreement with owner:you, from:the NPC, offer:{message,quote}:the FULL original conditional offer, requirements:ALL saved work clause citations, rewards:[], service:{offer:"saved aid-offer ID",version:its current version}, and the player's own acceptance in message/quote. If recovering a new conditional offer in this same response, service.offer may use its unique ability name and omit version; code binds the exact quoted original offer and saves its canonical ID/version. A bare yes to one fresh unambiguous work offer can accept the work; it does not perform treatment. Return mechanicalActions:[] for accepting work alone. Preserve every accepted clause. Never invent work to explain missing bookkeeping. Questions, attempts, hypotheticals and silence cannot accept an agreement. Use agreement_progress only for actual narrator completion of each clause, never the player's attempt or merely agreeing to do it. Counted payments or handovers still require their own saved receipts, not prose fulfillment.
After all work is actually fulfilled, the NPC may offer or withhold the promised aid. A fresh current voluntary offer uses aid_offer with agreement:"saved agreement ID or unique name", the same owned ability and unsupported:[], without work. Its source must be actual current narrator text naming the NPC. The code can also link an unambiguous matching earned service automatically. Preserve any original fee; a renewal omitting the price cannot waive accepted terms. Earning aid neither casts it nor forces NPC cooperation. A subsequent explicit acceptance uses accept_aid as usual. Code performs one NPC use, pays any fee and consumes this service once. Do not add a duplicate player spell, fee spend, item transfer or NPC response. Declining treatment spends nothing and does not erase completed work.`;
