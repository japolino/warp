import { revision } from "../shared/revision.js";
import type { Evidence, Message } from "./world.js";

export const APPROACHES = ["movement", "precision", "force", "speech", "perception", "concentration"] as const;
export type Approach = typeof APPROACHES[number];
export interface Resource { id: string; owner: string; name: string; current: number; max?: number; unit?: string; source: Evidence; }
export interface Item { id: string; owner: string; name: string; quantity: number; equipped: boolean; source: Evidence; }
export interface Condition {
  id: string; owner: string; name: string;
  // A condition affects only these approaches; a hurt ankle is not a social penalty.
  hinders: Approach[]; blocks: Approach[]; helps: Approach[];
  ending: string; targets?: string[]; place?: string; source: Evidence;
}
export interface MechanicalState {
  version: 1; resources: Resource[]; items: Item[]; conditions: Condition[];
  applied: { id: string; input: string }[];
}
export type Observation =
  | { kind: "resource"; value: Resource; correction?: boolean }
  | { kind: "item"; value: Item; correction?: boolean }
  | { kind: "condition"; value: Condition }
  | { kind: "condition_end"; id: string; source: Evidence };
export type MechanicalOperation =
  | { kind: "spend" | "restore"; resource: string; amount: number }
  | { kind: "consume"; item: string; amount: number }
  | { kind: "transfer"; item: string; amount: number; to: string }
  | { kind: "equip"; item: string; equipped: boolean };
export interface MechanicalChange { kind: "resource" | "item"; id: string; before: Resource | Item | null; after: Resource | Item | null; }
export interface MechanicalReceipt {
  version: 1; id: string; input: string; base: string; actor: string;
  operations: MechanicalOperation[]; changes: MechanicalChange[];
  status: "ready" | "blocked"; reason?: string;
}
export interface MechanicalRecord { version: 1; path: string; text: string; receipt?: MechanicalReceipt; observations: Observation[]; }
export const emptyMechanics = (): MechanicalState => ({ version: 1, resources: [], items: [], conditions: [], applied: [] });
export const hasMechanics = (s: MechanicalState) => !!(s.resources.length || s.items.length || s.conditions.length);
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 160) => typeof v === "string" && v.trim().length <= max ? v.trim() : "";
const amount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e9;
const own = (v: unknown, player?: string) => {
  const name = str(v, 80);
  return ["you", "me", "i", "player", "{{user}}", player?.toLowerCase()].includes(name.toLowerCase()) ? "you" : name;
};
const approaches = (v: unknown): Approach[] => Array.isArray(v) ? [...new Set(v.filter((x): x is Approach => APPROACHES.includes(x as Approach)))] : [];
const numberIn = (quote: string, n: number) => (quote.match(/\d+(?:\.\d+)?/g) ?? []).some(x => Number(x) === n)
  || (Number.isInteger(n) && ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"].some((word, i) => i === n && new RegExp(`\\b${word}\\b`, "i").test(quote)));
export const correction = (m: Message) => m.is_user && /^\s*\(?OOC correction:/i.test(m.content);

/** Grounding checks reject missing/edited evidence; the helper still owns semantic interpretation. */
function source(raw: Record<string, unknown>, messages: Message[]): { evidence: Evidence; correction: boolean } | null {
  const id = str(raw.message), quote = str(raw.quote, 400), m = messages.find(m => m.id === id);
  if (!m || quote.length < 4 || !m.content.replace(/\s+/g, " ").includes(quote) || (m.is_user && !correction(m))) return null;
  return { evidence: { message: id, quote, sourceRevision: revision(m.content) }, correction: !!correction(m) };
}

/** Bootstrap only explicit values. Later absolute prose cannot overwrite executed costs. */
export function readMechanicalObservations(raw: unknown, before: MechanicalState, messages: Message[], player?: string): Observation[] {
  if (!Array.isArray(raw)) return [];
  const out: Observation[] = [], working = structuredClone(before);
  for (const row of raw.slice(0, 24)) {
    if (!obj(row)) continue;
    const s = source(row, messages), id = str(row.id, 100);
    if (!s || !id) continue;
    let observation: Observation | undefined;
    if (row.kind === "condition_end") {
      if (working.conditions.some(c => c.id === id)) observation = { kind: "condition_end", id, source: s.evidence };
    } else {
      const owner = own(row.owner, player), name = str(row.name);
      if (!owner || !name) continue;
      if (row.kind === "resource") {
        if (!amount(row.current) || !numberIn(s.evidence.quote, row.current) || (row.max !== undefined && (!amount(row.max) || row.max < row.current || !numberIn(s.evidence.quote, row.max)))) continue;
        if (!s.correction && working.resources.some(r => r.id === id || (r.owner === owner && r.name.toLowerCase() === name.toLowerCase()))) continue;
        const old = working.resources.find(r => r.id === id);
        if (old && old.owner !== owner) continue;
        observation = { kind: "resource", value: { id, owner, name, current: row.current, ...(row.max !== undefined ? { max: row.max as number } : {}), ...(str(row.unit, 40) ? { unit: str(row.unit, 40) } : {}), source: s.evidence }, ...(s.correction ? { correction: true } : {}) };
      } else if (row.kind === "item") {
        if (!amount(row.quantity) || !Number.isInteger(row.quantity) || !numberIn(s.evidence.quote, row.quantity)) continue;
        if (!s.correction && working.items.some(i => i.id === id || (i.owner === owner && i.name.toLowerCase() === name.toLowerCase()))) continue;
        const old = working.items.find(i => i.id === id);
        if (old && old.owner !== owner) continue;
        observation = { kind: "item", value: { id, owner, name, quantity: row.quantity, equipped: row.equipped === true, source: s.evidence }, ...(s.correction ? { correction: true } : {}) };
      } else if (row.kind === "condition") {
        const ending = str(row.ending, 240);
        if (!ending || working.conditions.some(c => c.id === id || (c.owner === owner && c.name.toLowerCase() === name.toLowerCase()))) continue;
        const targets = Array.isArray(row.targets) ? [...new Set(row.targets.map(v => own(v, player)).filter(Boolean))].slice(0, 12) : [];
        observation = { kind: "condition", value: { id, owner, name, hinders: approaches(row.hinders), blocks: approaches(row.blocks), helps: approaches(row.helps), ending,
          ...(targets.length ? { targets } : {}), ...(str(row.place, 100) ? { place: str(row.place, 100) } : {}), source: s.evidence } };
      }
    }
    if (observation) { out.push(observation); observe(working, observation); }
  }
  return out;
}

function observe(state: MechanicalState, o: Observation) {
  if (o.kind === "condition_end") { state.conditions = state.conditions.filter(c => c.id !== o.id); return; }
  const collection = o.kind === "resource" ? state.resources : o.kind === "item" ? state.items : state.conditions;
  const index = collection.findIndex(v => v.id === o.value.id);
  if (index < 0) (collection as (Resource | Item | Condition)[]).push(structuredClone(o.value));
  else if (o.kind !== "condition" && o.correction) (collection as (Resource | Item | Condition)[])[index] = structuredClone(o.value);
}
export function applyObservations(before: MechanicalState, observations: Observation[]): MechanicalState {
  const state = structuredClone(before);
  for (const observation of observations) observe(state, observation);
  return state;
}

/** All operations resolve on a working copy. Any failed prerequisite rejects the whole plan. */
function execute(before: MechanicalState, actor: string, operations: MechanicalOperation[], actionId: string) {
  const state = structuredClone(before), changes: MechanicalChange[] = [];
  if (!actor || operations.length > 16) throw new Error("Invalid mechanical plan");
  for (const [index, op] of operations.entries()) {
    if (op.kind === "spend" || op.kind === "restore") {
      const resource = state.resources.find(r => r.id === op.resource);
      if (!resource || resource.owner !== actor) throw new Error("Resource unavailable to this actor");
      if (!amount(op.amount) || op.amount <= 0) throw new Error("Invalid resource amount");
      if (op.kind === "spend" && resource.current < op.amount) throw new Error(`Not enough ${resource.name}`);
      if (op.kind === "restore" && resource.max === undefined) throw new Error(`Recovery limit for ${resource.name} is unknown`);
      const old = structuredClone(resource);
      resource.current = op.kind === "spend" ? resource.current - op.amount : Math.min(resource.max!, resource.current + op.amount);
      changes.push({ kind: "resource", id: resource.id, before: old, after: structuredClone(resource) });
    } else if (op.kind === "consume" || op.kind === "transfer" || op.kind === "equip") {
      const item = state.items.find(i => i.id === op.item);
      if (!item || item.owner !== actor || item.quantity <= 0) throw new Error("Item unavailable to this actor");
      const old = structuredClone(item);
      if (op.kind === "equip") {
        if (typeof op.equipped !== "boolean") throw new Error("Invalid equipment state");
        item.equipped = op.equipped;
      } else {
        if (!amount(op.amount) || !Number.isInteger(op.amount) || op.amount <= 0 || item.quantity < op.amount) throw new Error(`Not enough ${item.name}`);
        if (op.kind === "transfer") {
          if (!str(op.to, 80) || op.to === actor) throw new Error("Invalid recipient");
          if (item.equipped) throw new Error("Unequip this item before transferring it");
          if (op.amount === item.quantity) item.owner = op.to;
          else {
            const split: Item = { ...structuredClone(item), id: `split-${revision([actionId, index, item.id])}`, owner: op.to, quantity: op.amount };
            if (state.items.some(i => i.id === split.id)) throw new Error("Duplicate item transfer");
            state.items.push(split);
            item.quantity -= op.amount;
            changes.push({ kind: "item", id: split.id, before: null, after: structuredClone(split) });
          }
        } else { item.quantity -= op.amount; if (!item.quantity) item.equipped = false; }
      }
      changes.push({ kind: "item", id: item.id, before: old, after: structuredClone(item) });
    } else throw new Error("Unsupported mechanical operation");
  }
  return { state, changes };
}

export function prepareMechanical(before: MechanicalState, id: string, actor: string, operations: MechanicalOperation[], context = ""): MechanicalReceipt {
  const base = revision(before), input = revision([actor, operations, context]);
  try {
    if (!str(id, 160)) throw new Error("Invalid action id");
    const previous = before.applied.find(a => a.id === id);
    if (previous) throw new Error(previous.input === input ? "Action already applied" : "Action id reused for different input");
    return { version: 1, id, input, base, actor, operations: structuredClone(operations), changes: execute(before, actor, operations, id).changes, status: "ready" };
  } catch (e) {
    return { version: 1, id, input, base, actor, operations: structuredClone(operations), changes: [], status: "blocked", reason: e instanceof Error ? e.message : "Mechanical action unavailable" };
  }
}

export function commitMechanical(before: MechanicalState, receipt: MechanicalReceipt): MechanicalState {
  const existing = before.applied.find(a => a.id === receipt.id);
  if (existing) { if (existing.input !== receipt.input) throw new Error("Action id conflict"); return before; }
  if (receipt.version !== 1 || receipt.status !== "ready" || receipt.base !== revision(before)) throw new Error("Mechanical receipt is blocked or stale");
  const { state, changes } = execute(before, receipt.actor, receipt.operations, receipt.id);
  if (revision(changes) !== revision(receipt.changes)) throw new Error("Mechanical receipt does not match its operations");
  state.applied.push({ id: receipt.id, input: receipt.input });
  return state;
}

/** Only explicit quantified spends and known item use are admitted before ability compilation exists. */
export function readMechanicalPlan(raw: unknown, state: MechanicalState, action: string): MechanicalOperation[] {
  if (!Array.isArray(raw) || raw.length > 16) throw new Error("Mechanical interpretation is incomplete");
  const operations: MechanicalOperation[] = [];
  for (const row of raw) {
    if (!obj(row) || !str(row.quote, 400) || !action.replace(/\s+/g, " ").includes(row.quote as string)) throw new Error("Mechanical action lacks player evidence");
    const quote = row.quote as string;
    if (row.kind === "consume" || row.kind === "transfer") {
      if (!(row.kind === "consume" ? /\b(?:use|drink|eat|consume|apply|take)\b/i : /\b(?:give|hand|pass|transfer)\b/i).test(quote)) throw new Error("Item operation is not an explicit action");
      const item = state.items.find(i => i.id === row.item && i.owner === "you");
      if (!item || !amount(row.amount) || row.amount <= 0 || !Number.isInteger(row.amount)
        || (!numberIn(quote, row.amount) && !(row.amount === 1 && /\b(?:a|an|one|the|my|it)\b/i.test(quote)))) throw new Error("Item amount is not established");
      if (row.kind === "consume") operations.push({ kind: "consume", item: item.id, amount: row.amount });
      else if (str(row.to, 80)) operations.push({ kind: "transfer", item: item.id, amount: row.amount, to: str(row.to, 80) });
      else throw new Error("Transfer recipient is missing");
    } else if (row.kind === "spend") {
      if (!/\b(?:spend|pay|donate|deposit)\b/i.test(quote)) throw new Error("Spending was not stated");
      const resource = state.resources.find(r => r.id === row.resource && r.owner === "you");
      if (!resource || !amount(row.amount) || row.amount <= 0 || !numberIn(quote, row.amount)) throw new Error("Resource cost is not established");
      operations.push({ kind: "spend", resource: resource.id, amount: row.amount });
    } else if (row.kind === "equip" && typeof row.equipped === "boolean" && state.items.some(i => i.id === row.item && i.owner === "you")) {
      if (!/\b(?:equip|unequip|wear|wield|remove|put on|take off)\b/i.test(quote)) throw new Error("Equipping was not stated");
      operations.push({ kind: "equip", item: row.item as string, equipped: row.equipped });
    } else throw new Error("Unsupported player mechanical action");
  }
  return operations;
}

export function conditionInfluence(state: MechanicalState, actor: string, approach: unknown, target?: string, place?: string) {
  const relevant = APPROACHES.includes(approach as Approach) ? state.conditions.filter(c => c.owner === actor
    && (!c.targets?.length || (!!target && c.targets.includes(target))) && (!c.place || c.place === place)) : [];
  const blocked = relevant.filter(c => c.blocks.includes(approach as Approach));
  const helps = relevant.filter(c => c.helps.includes(approach as Approach));
  const hinders = relevant.filter(c => c.hinders.includes(approach as Approach));
  return { blocked: blocked.map(c => c.name), shift: Math.sign(helps.length - hinders.length), reasons: [...helps, ...hinders].map(c => c.name) };
}

export function mechanicalPacket(state: MechanicalState) {
  const withoutSource = <T extends { source: Evidence }>({ source, ...value }: T) => value;
  return { resources: state.resources.map(withoutSource), items: state.items.map(withoutSource), conditions: state.conditions.map(withoutSource) };
}
export function receiptPacket(receipt: MechanicalReceipt) {
  return { id: receipt.id, status: receipt.status, ...(receipt.reason ? { reason: receipt.reason } : {}), changes: receipt.changes.map(c => ({
    kind: c.kind, id: c.id, before: c.before ? ("current" in c.before ? c.before.current : c.before.quantity) : null,
    after: c.after ? ("current" in c.after ? c.after.current : c.after.quantity) : null,
    name: c.after?.name ?? c.before?.name, owner: c.after?.owner, ...(c.after && "equipped" in c.after ? { equipped: c.after.equipped } : {}),
  })) };
}
export function mechanicalNotes(receipt?: MechanicalReceipt): string[] {
  if (!receipt || receipt.status !== "ready") return [];
  return receipt.changes.filter(c => c.after?.owner === "you" || c.before?.owner === "you").map(c => {
    const value = c.after;
    if (!value) return "";
    if ("current" in value) return `${value.name}: ${value.current}${value.max === undefined ? "" : ` / ${value.max}`}${value.unit ? ` ${value.unit}` : ""}`;
    return value.owner !== "you" ? `${value.name}: now with ${value.owner}` : `${value.name}: ${value.quantity} left${value.equipped ? " · equipped" : ""}`;
  }).filter(Boolean).slice(-2);
}
