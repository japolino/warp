import { revision } from "../shared/revision.js";
import { MechanicalKnowledgeError, type EncounterBeat } from "./encounters.js";
import type { MechanicalChange, MechanicalState } from "./mechanics.js";

export interface AidFee { kind: "resource" | "item"; id: string; amount: number; }
export interface AidPayment extends AidFee { from: "you"; to: string; asset: string; unit?: string; }
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const normalize = (s: string) => s.normalize("NFKC").toLocaleLowerCase();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
function feePattern(fee: AidFee, state: MechanicalState): RegExp | undefined {
  const asset = fee.kind === "resource" ? state.resources.find(r => r.id === fee.id && r.owner === "you" && r.role === "money") : state.items.find(i => i.id === fee.id && i.owner === "you");
  if (!asset) return;
  const names = [asset.name, ...("unit" in asset && asset.unit ? [asset.unit] : [])].filter(Boolean).map(n => `${escape(n)}${/s$/i.test(n) ? "" : "s?"}`).join("|");
  const number = [escape(String(fee.amount)), ...(Number.isInteger(fee.amount) && words[fee.amount] ? [words[fee.amount]] : [])].join("|");
  // A single quoted price, without selecting a currency alternative or a conversion.
  return new RegExp(`\\b(?:for|(?:the\\s+)?fee(?:\\s+(?:of|is))?\\s*:?|(?:you\\s+)?pay\\s+(?:me\\s+)?|costs?\\s+you)\\s+(?:${number})\\s+(?:${names})(?![\\p{L}\\p{N}_])`, "iu");
}

/** The helper identifies the fee; code requires an actual owned asset and its exact quoted price. */
export function readAidFee(raw: unknown, state: MechanicalState, quote: string): AidFee | undefined {
  if (!obj(raw) || Object.keys(raw).some(k => !["kind", "id", "amount"].includes(k)) || !["resource", "item"].includes(raw.kind as string)
    || typeof raw.id !== "string" || typeof raw.amount !== "number" || !Number.isFinite(raw.amount) || raw.amount <= 0 || raw.amount > 1e9) return;
  const fee = raw as unknown as AidFee;
  if (/\b(?:or|either|instead|alternatively)\b/i.test(quote) || !feePattern(fee, state)?.test(quote)) return;
  return { kind: fee.kind, id: fee.id, amount: fee.amount };
}

export function unresolvedServiceTerms(quote: string, state: MechanicalState, fee?: AidFee): boolean {
  let remaining = quote;
  if (fee) {
    const pattern = feePattern(fee, state)!, match = pattern.exec(quote)!;
    if (/^\s*(?:and|plus|if|after|before|once|when|until|provided|on\s+condition)\b/i.test(quote.slice(match.index + match[0].length))) return true;
    remaining = remaining.replace(pattern, " ");
  }
  remaining = remaining.replace(/\b(?:no fee|free of charge|costs? you nothing|you pay nothing)\b/gi, " ");
  return /\b(?:pay\s+me|you\s+(?:pay|owe)|costs?\s+you|fee|in\s+(?:exchange|return)|provided|only\s+if|not\s+free|(?:after|before|until)\s+you|for\s+(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s+[\p{L}]+)\b/iu.test(remaining);
}

/** Transfer a fee on a private transaction copy. A payee's unknown total stays unknown. */
export function payAidFee(state: MechanicalState, fee: AidFee, recipient: string, offer: string, changes: MechanicalChange[], beats: EncounterBeat[]): AidPayment {
  if (!Number.isFinite(fee.amount) || fee.amount <= 0 || fee.amount > 1e9) throw Error("Invalid service fee");
  let asset: string, unit: string | undefined;
  if (fee.kind === "resource") {
    const payer = state.resources.find(r => r.id === fee.id && r.owner === "you" && r.role === "money");
    if (!payer) throw new MechanicalKnowledgeError("The service fee needs an established player money balance");
    if (payer.current < fee.amount) throw Error("The offered service fee is unaffordable");
    const receivers = state.resources.filter(r => r.owner === recipient && r.role === "money" && normalize(r.name) === normalize(payer.name) && r.unit === payer.unit);
    if (receivers.length > 1) throw new MechanicalKnowledgeError("The service recipient's money balance is ambiguous");
    const receiver = receivers[0];
    if (receiver?.max !== undefined && receiver.current + fee.amount > receiver.max) throw Error("The recipient cannot hold the whole service fee");
    const old = structuredClone(payer); payer.current -= fee.amount;
    changes.push({ kind: "resource", id: payer.id, before: old, after: structuredClone(payer) });
    if (receiver) {
      const oldReceiver = structuredClone(receiver); receiver.current += fee.amount;
      changes.push({ kind: "resource", id: receiver.id, before: oldReceiver, after: structuredClone(receiver) });
    }
    asset = payer.name; unit = payer.unit;
  } else {
    const item = state.items.find(i => i.id === fee.id && i.owner === "you");
    if (!item) throw new MechanicalKnowledgeError("The service fee needs an established player item");
    if (item.equipped || item.quantity < fee.amount || !Number.isInteger(fee.amount)) throw Error("The offered fee item is unavailable");
    asset = item.name;
    const old = structuredClone(item);
    if (item.quantity === fee.amount) item.owner = recipient;
    else {
      const received = { ...structuredClone(item), id: `aid-fee-${revision([offer, fee])}`, owner: recipient, quantity: fee.amount };
      if (state.items.some(i => i.id === received.id)) throw Error("Service fee item already exists");
      item.quantity -= fee.amount; state.items.push(received);
      changes.push({ kind: "item", id: received.id, before: null, after: structuredClone(received) });
    }
    changes.push({ kind: "item", id: item.id, before: old, after: structuredClone(item) });
  }
  beats.push({ kind: "payment", actor: "you", target: recipient, name: asset, amount: fee.amount });
  return { ...structuredClone(fee), from: "you", to: recipient, asset, ...(unit ? { unit } : {}) };
}
