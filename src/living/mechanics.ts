import { revision } from "../shared/revision.js";
import type { Evidence, Message } from "./world.js";
import type { AbilityDefinition, DefinitionSource } from "./abilities.js";
import { actorName, distance, distanceId, readDefenses, readEncounterObservation, RANGES, checkRange, present, capable, vital, advanceActor, actionCount, cooldownRemaining, setCooldown, conditionActive, damage, immune, MechanicalKnowledgeError, type Entity, type Distance, type Defense, type ActionClock, type Cooldown, type EncounterBeat } from "./encounters.js";
import { MAX_RESPONSES, responseDecision, offensiveResponse, type ResponsePlan } from "./exchanges.js";

export const APPROACHES = ["movement", "precision", "force", "speech", "perception", "concentration"] as const;
export type Approach = typeof APPROACHES[number];
export interface Resource { id: string; owner: string; name: string; current: number; max?: number; unit?: string; role?: "vital" | "effort" | "shield" | "money" | "other"; source: Evidence; }
export interface Item { id: string; owner: string; name: string; quantity: number; equipped: boolean; defenses?: Defense[]; source: Evidence; }
export interface Condition {
  id: string; owner: string; name: string;
  // A condition affects only these approaches; a hurt ankle is not a social penalty.
  hinders: Approach[]; blocks: Approach[]; helps: Approach[];
  ending: string; targets?: string[]; place?: string; source: Evidence; expiresAt?: number; defenses?: Defense[];
}
export interface MechanicalState {
  version: 1; resources: Resource[]; items: Item[]; conditions: Condition[];
  applied: { id: string; input: string }[];
  abilities?: AbilityDefinition[];
  entities?: Entity[]; distances?: Distance[]; clocks?: ActionClock[]; cooldowns?: Cooldown[];
}
export type Observation =
  | { kind: "resource"; value: Resource; correction?: boolean }
  | { kind: "item"; value: Item; correction?: boolean }
  | { kind: "condition"; value: Condition }
  | { kind: "ability"; value: AbilityDefinition }
  | { kind: "entity"; value: Entity }
  | { kind: "distance"; value: Distance }
  | { kind: "condition_end"; id: string; source: Evidence };
export type MechanicalOperation =
  | { kind: "spend" | "restore"; resource: string; amount: number }
  | { kind: "consume"; item: string; amount: number }
  | { kind: "transfer"; item: string; amount: number; to: string }
  | { kind: "equip"; item: string; equipped: boolean }
  | { kind: "wait" | "defend" }
  | { kind: "attempt"; approach: Approach | "other"; target?: string; place?: string }
  | { kind: "strike"; target: string; outcome?: "clean" | "mixed" | "setback"; place?: string }
  | { kind: "move"; target: string; direction: "closer" | "away"; place?: string }
  | { kind: "ability"; ability: string; version: number; target?: string; outcome?: "clean" | "mixed" | "setback"; place?: string };
export interface MechanicalChange { kind: "resource" | "item" | "condition" | "distance"; id: string; before: Resource | Item | Condition | Distance | null; after: Resource | Item | Condition | Distance | null; }
export interface MechanicalReceipt {
  version: 1; id: string; input: string; base: string; actor: string;
  operations: MechanicalOperation[]; changes: MechanicalChange[];
  status: "ready" | "blocked"; reason?: string;
  engine?: 2 | 3; result?: string; beats?: EncounterBeat[]; responses?: ResponsePlan[]; place?: string;
}
export interface MechanicalRecord { version: 1; path: string; text: string; receipt?: MechanicalReceipt; observations: Observation[]; sources?: DefinitionSource[]; }
export const emptyMechanics = (): MechanicalState => ({ version: 1, resources: [], items: [], conditions: [], applied: [] });
export const hasMechanics = (s: MechanicalState) => !!(s.resources.length || s.items.length || s.conditions.length || s.abilities?.length || s.entities?.length);
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
const singularPossession = (quote: string, name: string) => {
  const names = [name, name.replace(/([^s])s$/i, "$1")].map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return new RegExp(`\\b(?:have|has|carry|carries|carrying|own|owns|holding|holds|equipped|wear|wears|wearing)\\b[^.!?]{0,60}\\b(?:a|an|single)\\s+(?:${names})\\b`, "i").test(quote);
};
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
  const rows = raw.slice(0, 24);
  // Resolve aliases before ownership regardless of the helper's JSON ordering.
  for (const row of [...rows.filter(r => obj(r) && r.kind === "entity"), ...rows.filter(r => !obj(r) || r.kind !== "entity")]) {
    if (!obj(row)) continue;
    const s = source(row, messages); let id = str(row.id, 100);
    if (!s) continue;
    let observation: Observation | undefined;
    if (row.kind === "entity" || row.kind === "distance") {
      try { observation = readEncounterObservation(row.kind === "entity" ? { ...row, name: own(row.name, player), aliases: [...(Array.isArray(row.aliases) ? row.aliases : []), ...(own(row.name, player) === "you" && str(row.name, 80) !== "you" ? [row.name] : [])] } : { ...row, from: own(row.from, player), to: own(row.to, player) }, working, s.evidence, messages); } catch { continue; }
    } else if (row.kind === "condition_end") {
      if (working.conditions.some(c => c.id === id)) observation = { kind: "condition_end", id, source: s.evidence };
    } else {
      let owner: string;
      try { owner = actorName(working, own(row.owner, player)); } catch { continue; }
      const name = str(row.name);
      if (!owner || !name) continue;
      const collection = row.kind === "resource" ? working.resources : row.kind === "item" ? working.items : row.kind === "condition" ? working.conditions : [];
      const existingName = collection.find(v => v.owner === owner && v.name.normalize("NFKC").toLocaleLowerCase() === name.normalize("NFKC").toLocaleLowerCase());
      const existingId = collection.find(v => v.id === id);
      if (existingId && existingName && existingId.id !== existingName.id) continue;
      id = existingName?.id ?? (id || `${row.kind}-${revision([owner.normalize("NFKC").toLocaleLowerCase(), name.normalize("NFKC").toLocaleLowerCase()])}`);
      if (row.kind === "resource") {
        if (!amount(row.current) || !numberIn(s.evidence.quote, row.current) || (row.max !== undefined && (!amount(row.max) || row.max < row.current || !numberIn(s.evidence.quote, row.max)))) continue;
        if (!s.correction && working.resources.some(r => r.id === id || (r.owner === owner && r.name.toLowerCase() === name.toLowerCase()))) continue;
        const old = working.resources.find(r => r.id === id);
        if (old && old.owner !== owner) continue;
        if (row.role !== undefined && !["vital", "effort", "shield", "money", "other"].includes(row.role as string)) continue;
        observation = { kind: "resource", value: { id, owner, name, current: row.current, ...(row.max !== undefined ? { max: row.max as number } : {}), ...(str(row.unit, 40) ? { unit: str(row.unit, 40) } : {}), ...(row.role ? { role: row.role as Resource["role"] } : {}), source: s.evidence }, ...(s.correction ? { correction: true } : {}) };
      } else if (row.kind === "item") {
        if (!amount(row.quantity) || !Number.isInteger(row.quantity) || (!numberIn(s.evidence.quote, row.quantity) && !(row.quantity === 1 && singularPossession(s.evidence.quote, name)))) continue;
        if (!s.correction && working.items.some(i => i.id === id || (i.owner === owner && i.name.toLowerCase() === name.toLowerCase()))) continue;
        const old = working.items.find(i => i.id === id);
        if (old && old.owner !== owner) continue;
        let defenses: Defense[];
        try { defenses = readDefenses(row.defenses, s.evidence.quote); } catch { continue; }
        observation = { kind: "item", value: { id, owner, name, quantity: row.quantity, equipped: row.equipped === true, ...(defenses.length ? { defenses } : {}), source: s.evidence }, ...(s.correction ? { correction: true } : {}) };
      } else if (row.kind === "condition") {
        const ending = str(row.ending, 240);
        if (!ending || working.conditions.some(c => c.id === id || (c.owner === owner && c.name.toLowerCase() === name.toLowerCase()))) continue;
        const targets = Array.isArray(row.targets) ? [...new Set(row.targets.map(v => own(v, player)).filter(Boolean))].slice(0, 12) : [];
        let defenses: Defense[];
        try { defenses = readDefenses(row.defenses, s.evidence.quote); } catch { continue; }
        observation = { kind: "condition", value: { id, owner, name, hinders: approaches(row.hinders), blocks: approaches(row.blocks), helps: approaches(row.helps), ending,
          ...(defenses.length ? { defenses } : {}), ...(targets.length ? { targets } : {}), ...(str(row.place, 100) ? { place: str(row.place, 100) } : {}), source: s.evidence } };
      }
    }
    if (observation) { out.push(observation); observe(working, observation); }
  }
  return out;
}

function observe(state: MechanicalState, o: Observation) {
  if (o.kind === "condition_end") { state.conditions = state.conditions.filter(c => c.id !== o.id); return; }
  if (o.kind === "ability") {
    state.abilities ??= [];
    const existing = state.abilities.findIndex(a => a.id === o.value.id);
    if (existing < 0) state.abilities.push(structuredClone(o.value));
    else if (o.value.version === state.abilities[existing].version + 1) state.abilities[existing] = structuredClone(o.value);
    return;
  }
  if (o.kind === "entity" || o.kind === "distance") {
    const collection = o.kind === "entity" ? (state.entities ??= []) : (state.distances ??= []);
    const index = collection.findIndex(v => v.id === o.value.id);
    if (index < 0) (collection as (Entity | Distance)[]).push(structuredClone(o.value));
    else (collection as (Entity | Distance)[])[index] = structuredClone(o.value);
    return;
  }
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
function execute(before: MechanicalState, actor: string, operations: MechanicalOperation[], actionId: string, engine = 1, strict = false) {
  const state = structuredClone(before), changes: MechanicalChange[] = [], beats: EncounterBeat[] = [];
  if (engine === 2) actor = actorName(state, actor);
  if (!actor || operations.length > 16) throw new Error("Invalid mechanical plan");
  if (engine === 2 && operations.length && !present(state, actor)) throw new Error("The acting participant is not established as present");
  if (engine === 2 && operations.length && !capable(state, actor)) throw new Error("This actor cannot act");
  for (const [index, op] of operations.entries()) {
    if (op.kind === "ability") {
      if (op.outcome !== undefined && !["clean", "mixed", "setback"].includes(op.outcome)) throw new Error("Invalid ability outcome");
      const ability = state.abilities?.find(a => a.id === op.ability && a.version === op.version);
      if (!ability || ability.owner !== actor) throw new (strict ? MechanicalKnowledgeError : Error)("Ability unavailable to this actor");
      if (ability.unsupported.length) throw new (strict ? MechanicalKnowledgeError : Error)(`${ability.name} needs clarification: ${ability.unsupported.join("; ")}`);
      if (engine === 1 && (ability.range || ability.cooldown || ability.effects.some(e => e.defense || e.duration))) throw new Error("Ability requires the encounter resolver");
      const target = engine === 2 ? actorName(state, op.target ?? (ability.target === "self" ? actor : "")) : op.target ?? (ability.target === "self" ? actor : "");
      if (!target || (ability.target === "self" && target !== actor) || (ability.target === "other" && target === actor)) throw new Error("Invalid ability target");
      if (engine === 2) {
        if (!capable(state, actor)) throw new Error("This actor cannot act");
        if (target !== actor && !present(state, target)) throw new Error(`${target} is not established as present`);
        if (!capable(state, target)) {
          const dead = state.entities?.some(e => e.name === target && e.status === "dead");
          if (dead || ability.effects.some(e => e.kind === "damage")) throw new Error(`${target} is not an eligible target`);
        }
        const remaining = cooldownRemaining(state, actor, ability.id);
        if (remaining) throw new Error(`${ability.name} is cooling down for ${remaining} more action${remaining === 1 ? "" : "s"}`);
        if (strict && ability.range && target !== actor && !distance(state, actor, target)) throw new MechanicalKnowledgeError(`Distance to ${target} is unknown`);
        checkRange(state, actor, target, ability.range);
        if (ability.effects.every(e => e.kind === "damage" && immune(state, e.target === "self" ? actor : target, e.damageType ?? "untyped"))) throw new Error("The established immunity prevents this ability's effects");
      }
      if (conditionInfluence(state, actor, ability.approach, target, op.place, engine === 2).blocked.length) throw new Error("A condition prevents this ability");
      for (const effect of ability.effects) if (effect.kind === "restore" || effect.kind === "damage") {
        const owner = effect.target === "self" ? actor : target;
        const resources = state.resources.filter(r => r.owner === owner && (r.id === effect.resource || r.name.toLocaleLowerCase() === effect.resource?.toLocaleLowerCase()));
        if (resources.length !== 1 || (effect.kind === "restore" && resources[0].max === undefined)) throw new (strict ? MechanicalKnowledgeError : Error)(`Unknown or ambiguous ${effect.resource} for ${owner}`);
      }
      for (const requirement of ability.requires) {
        const item = state.items.find(i => i.id === requirement.item && i.owner === actor && i.quantity > 0);
        if (!item || (requirement.equipped && !item.equipped)) throw new Error("Required equipment is not available");
      }
      // Costs are derived from the stored definition, never from invocation arguments.
      const costs: MechanicalOperation[] = ability.costs.map(c => c.kind === "resource" ? { kind: "spend", resource: c.id, amount: c.amount } : { kind: "consume", item: c.id, amount: c.amount });
      const paid = execute(state, actor, costs, `${actionId}:${index}:cost`);
      state.resources = paid.state.resources; state.items = paid.state.items; changes.push(...paid.changes);
      if (engine === 2) { advanceActor(state, actor, changes, beats); setCooldown(state, actor, ability.id, ability.cooldown ?? 0); }
      if (op.outcome === "setback") continue; // An executed failed attempt pays its established cost, not its success effects.
      for (const [effectIndex, effect] of ability.effects.entries()) {
        const owner = effect.target === "self" ? actor : target;
        if (effect.kind === "restore" || effect.kind === "damage") {
          const candidates = state.resources.filter(r => r.owner === owner && (r.id === effect.resource || r.name.toLocaleLowerCase() === effect.resource?.toLocaleLowerCase()));
          if (candidates.length !== 1 || !amount(effect.amount) || !effect.amount) throw new Error(`Unknown or ambiguous ${effect.resource} for ${owner}`);
          const resource = candidates[0], old = structuredClone(resource);
          if (effect.kind === "restore" && resource.max === undefined) throw new Error(`Recovery limit for ${resource.name} is unknown`);
          if (engine === 2 && effect.kind === "damage") damage(state, actor, owner, resource, effect.amount, effect.damageType ?? "untyped", changes, beats, false, strict);
          else {
            resource.current = effect.kind === "restore" ? Math.min(resource.max!, resource.current + effect.amount) : Math.max(0, resource.current - effect.amount);
            changes.push({ kind: "resource", id: resource.id, before: old, after: structuredClone(resource) });
          }
        } else if (effect.kind === "condition" || (engine === 2 && effect.kind === "defense")) {
          if (!effect.name || !effect.ending) throw new Error("Incomplete condition effect");
          const id = `effect-${revision([ability.id, owner, effectIndex])}`;
          const old = state.conditions.find(c => c.id === id);
          const condition: Condition = { id, owner, name: effect.name, ending: effect.ending, helps: effect.helps ?? [], hinders: effect.hinders ?? [], blocks: effect.blocks ?? [], source: ability.source,
            ...(engine === 2 && effect.duration ? { expiresAt: actionCount(state, owner) + effect.duration + 1 } : {}), ...(engine === 2 && effect.defense ? { defenses: [structuredClone(effect.defense)] } : {}) };
          if (!old) { state.conditions.push(condition); changes.push({ kind: "condition", id, before: null, after: structuredClone(condition) }); }
          else if (engine === 2) {
            // A repeat refreshes this definition's effect; it never adds another copy.
            state.conditions[state.conditions.indexOf(old)] = condition;
            changes.push({ kind: "condition", id, before: structuredClone(old), after: structuredClone(condition) });
          }
        } else if (effect.kind === "clear_condition") {
          const removed = state.conditions.filter(c => c.owner === owner && c.name.toLocaleLowerCase() === effect.name?.toLocaleLowerCase());
          for (const old of removed) { state.conditions = state.conditions.filter(c => c.id !== old.id); changes.push({ kind: "condition", id: old.id, before: structuredClone(old), after: null }); }
        }
      }
    } else if (engine === 2 && op.kind === "strike") {
      const target = actorName(state, op.target), resource = vital(state, target);
      if (strict && !resource) throw new MechanicalKnowledgeError(`A basic strike needs a known vital resource for ${target}`);
      if (op.outcome !== undefined && !["clean", "mixed", "setback"].includes(op.outcome)) throw new Error("Invalid strike outcome");
      if (target === actor || !present(state, target) || !capable(state, target) || !resource) throw new Error("A basic strike needs a present target with a known vital resource");
      checkRange(state, actor, target, "touch");
      if (immune(state, target, "physical")) throw new Error("Physical immunity prevents this strike");
      if (conditionInfluence(state, actor, "force", target, op.place, true).blocked.length) throw new Error("A condition prevents striking");
      advanceActor(state, actor, changes, beats);
      if (op.outcome !== "setback") damage(state, actor, target, resource, 5, "physical", changes, beats, false, strict);
    } else if (engine === 2 && (op.kind === "wait" || op.kind === "defend" || op.kind === "move" || op.kind === "attempt")) {
      if (!capable(state, actor)) throw new Error("This actor cannot act");
      if (op.kind === "attempt") {
        if (![...APPROACHES, "other"].includes(op.approach)) throw new Error("Unknown attempt approach");
        if (conditionInfluence(state, actor, op.approach, op.target, op.place, true).blocked.length) throw new Error("A condition prevents this approach");
      }
      if (op.kind === "move") {
        const target = actorName(state, op.target), id = distanceId(actor, target), range = state.distances?.find(d => d.id === id);
        if (!present(state, target) || !range || target === actor) throw new Error("Movement needs an established present target and distance");
        if (!["closer", "away"].includes(op.direction)) throw new Error("Invalid movement direction");
        if (conditionInfluence(state, actor, "movement", target, op.place, true).blocked.length) throw new Error("A condition prevents movement");
        const next = RANGES.indexOf(range.band) + (op.direction === "closer" ? -1 : 1);
        if (next < 0 || next >= RANGES.length) throw new Error("Movement exceeds the established range bands");
        const old = structuredClone(range); range.band = RANGES[next];
        range.source = { message: `warp-action:${actionId}`, quote: `Moved ${op.direction} to ${target}`, sourceRevision: revision(op) };
        changes.push({ kind: "distance", id, before: old, after: structuredClone(range) });
        beats.push({ kind: "move", actor, target, name: range.band });
      }
      if (op.kind === "defend" && conditionInfluence(state, actor, "movement", undefined, undefined, true).blocked.length) throw new Error("A condition prevents defending");
      advanceActor(state, actor, changes, beats);
      if (op.kind === "defend") {
        const id = `guard-${revision(actor)}`, old = state.conditions.find(c => c.id === id), condition: Condition = {
          id, owner: actor, name: "Guarding", hinders: [], helps: [], blocks: [], ending: "When this actor next acts", expiresAt: actionCount(state, actor) + 1,
          defenses: [{ kind: "resistance", damageType: "physical", amount: 50 }], source: { message: `warp-action:${actionId}`, quote: "Defend against physical attacks", sourceRevision: revision(op) },
        };
        state.conditions = state.conditions.filter(c => c.id !== id); state.conditions.push(condition);
        changes.push({ kind: "condition", id, before: old ? structuredClone(old) : null, after: structuredClone(condition) });
      }
      if (op.kind !== "move") beats.push({ kind: op.kind, actor });
    } else if (op.kind === "spend" || op.kind === "restore") {
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
          const recipient = engine === 2 ? actorName(state, op.to) : op.to;
          if (!str(recipient, 80) || recipient === actor) throw new Error("Invalid recipient");
          if (item.equipped) throw new Error("Unequip this item before transferring it");
          if (op.amount === item.quantity) item.owner = recipient;
          else {
            const split: Item = { ...structuredClone(item), id: `split-${revision([actionId, index, item.id])}`, owner: recipient, quantity: op.amount };
            if (state.items.some(i => i.id === split.id)) throw new Error("Duplicate item transfer");
            state.items.push(split);
            item.quantity -= op.amount;
            changes.push({ kind: "item", id: split.id, before: null, after: structuredClone(split) });
          }
        } else { item.quantity -= op.amount; if (!item.quantity) item.equipped = false; }
      }
      changes.push({ kind: "item", id: item.id, before: old, after: structuredClone(item) });
    } else throw new Error("Unsupported mechanical operation");
    // Once action timing exists, using equipment or supplies also uses an action.
    // Nested definition costs run under the original arithmetic path and never tick twice.
    if (engine === 2 && ["spend", "restore", "consume", "transfer", "equip"].includes(op.kind) && state.clocks?.some(c => c.actor === actor)) advanceActor(state, actor, changes, beats);
  }
  return { state, changes, beats };
}

/** The exchange is one bounded receipt. A response cannot enqueue another response. */
function executeExchange(before: MechanicalState, actor: string, operations: MechanicalOperation[], id: string, responses: ResponsePlan[], place?: string) {
  if (!Array.isArray(responses) || responses.length > MAX_RESPONSES || (responses.length && !operations.length)) throw new Error("Invalid exchange opportunity");
  let resolved = execute(before, actor, operations, id, 2, true);
  const actors = new Set<string>();
  for (const plan of responses) {
    if (!plan || typeof plan.actor !== "string" || !plan.source?.message || !plan.source?.quote || !plan.assessment || !plan.action) throw new Error("Invalid NPC plan");
    const who = actorName(before, plan.actor);
    if (who === actorName(before, actor) || who === "you" || actors.has(who)) throw new Error("A participant cannot get duplicate or automatic player responses");
    actors.add(who);
    if (!present(before, who)) throw new Error("An NPC response needs established presence");
    const action = plan.action;
    if (!["ability", "move", "strike", "wait", "defend"].includes(action.kind)) throw new Error("Unsupported NPC action");
    const target = "target" in action ? action.target : undefined;
    const method = action.kind === "ability" ? resolved.state.abilities?.find(a => a.id === action.ability)?.approach ?? "other" : action.kind === "strike" ? "force" : action.kind === "wait" ? "other" : "movement";
    const skip = (reason: string) => resolved.beats.push({ kind: "skipped", actor: who, ...(target ? { target } : {}), reason });
    if (!present(resolved.state, who) || !capable(resolved.state, who)) { skip("No longer able to respond"); continue; }
    try {
      // Validate the opportunity before drawing an outcome. This working copy is discarded.
      execute(resolved.state, who, [{ ...action, ...(["ability", "strike", "move"].includes(action.kind) ? { place } : {}) }], `${id}:response:${who}`, 2, true);
    } catch (error) {
      if (error instanceof MechanicalKnowledgeError) throw error;
      // An eligible NPC loses this opportunity, without paying an unavailable cost.
      // This also lets a short block or cooldown expire instead of trapping it forever.
      advanceActor(resolved.state, who, resolved.changes, resolved.beats);
      skip(error instanceof Error ? error.message : "Response unavailable"); continue;
    }
    const influence = conditionInfluence(resolved.state, who, method, target, place, true);
    const decision = responseDecision(plan, id, influence.shift, influence.reasons, offensiveResponse(plan, resolved.state));
    let operation: MechanicalOperation = action;
    if (action.kind === "ability" || action.kind === "strike") operation = { ...action, outcome: decision?.result ?? "clean", place };
    else if (action.kind === "move") operation = decision?.result === "setback" ? { kind: "attempt", approach: "movement", target: action.target, place } : { ...action, place };
    else if (action.kind === "defend" && decision?.result === "setback") operation = { kind: "attempt", approach: "movement", place };
    const next = execute(resolved.state, who, [operation], `${id}:response:${who}`, 2, true);
    resolved.beats.push({ kind: "response", actor: who, ...(target ? { target } : {}), ...(decision ? { decision } : {}), name: action.kind === "ability" ? resolved.state.abilities?.find(a => a.id === action.ability)?.name : action.kind });
    resolved = { state: next.state, changes: [...resolved.changes, ...next.changes], beats: [...resolved.beats, ...next.beats] };
  }
  return resolved;
}

export function prepareMechanical(before: MechanicalState, id: string, actor: string, operations: MechanicalOperation[], context = ""): MechanicalReceipt {
  return prepare(before, id, actor, operations, context, 2);
}
export function prepareExchange(before: MechanicalState, id: string, actor: string, operations: MechanicalOperation[], responses: ResponsePlan[], context = "", place?: string): MechanicalReceipt {
  return prepare(before, id, actor, operations, context, 3, responses, place);
}
function prepare(before: MechanicalState, id: string, actor: string, operations: MechanicalOperation[], context: string, engine: 2 | 3, responses?: ResponsePlan[], place?: string): MechanicalReceipt {
  const base = revision(before), input = revision(engine === 2 ? [actor, operations, context] : [actor, operations, context, responses, place]);
  try {
    if (!str(id, 160)) throw new Error("Invalid action id");
    const previous = before.applied.find(a => a.id === id);
    if (previous) throw new Error(previous.input === input ? "Action already applied" : "Action id reused for different input");
    const executed = engine === 3 ? executeExchange(before, actor, operations, id, responses ?? [], place) : execute(before, actor, operations, id, 2);
    return { version: 1, engine, id, input, base, actor, operations: structuredClone(operations), ...(engine === 3 ? { responses: structuredClone(responses ?? []), ...(place ? { place } : {}) } : {}), changes: executed.changes, beats: executed.beats, result: revision(executed.state), status: "ready" };
  } catch (e) {
    return { version: 1, engine, id, input, base, actor, operations: structuredClone(operations), changes: [], status: "blocked", reason: e instanceof Error ? e.message : "Mechanical action unavailable" };
  }
}

export function commitMechanical(before: MechanicalState, receipt: MechanicalReceipt): MechanicalState {
  const existing = before.applied.find(a => a.id === receipt.id);
  if (existing) { if (existing.input !== receipt.input) throw new Error("Action id conflict"); return before; }
  if (receipt.version !== 1 || receipt.status !== "ready" || receipt.base !== revision(before)) throw new Error("Mechanical receipt is blocked or stale");
  if (receipt.engine !== undefined && receipt.engine !== 2 && receipt.engine !== 3) throw new Error("Unsupported mechanical resolver");
  if (receipt.engine !== 3 && receipt.responses?.length) throw new Error("Responses require the exchange resolver");
  const { state, changes, beats } = receipt.engine === 3 ? executeExchange(before, receipt.actor, receipt.operations, receipt.id, receipt.responses ?? [], receipt.place) : execute(before, receipt.actor, receipt.operations, receipt.id, receipt.engine ?? 1);
  if (revision(changes) !== revision(receipt.changes)) throw new Error("Mechanical receipt does not match its operations");
  if (receipt.engine !== undefined && (revision(state) !== receipt.result || revision(beats) !== revision(receipt.beats))) throw new Error("Mechanical encounter receipt does not match its resolution");
  state.applied.push({ id: receipt.id, input: receipt.input });
  return state;
}

/** Admit player-backed operations; ability invocations reference their saved definitions. */
export class MechanicalPlanError extends Error {}
export function readMechanicalPlan(raw: unknown, state: MechanicalState, action: string): MechanicalOperation[] {
  try { return parseMechanicalPlan(raw, state, action); }
  catch (error) { throw new MechanicalPlanError(error instanceof Error ? error.message : "Mechanical interpretation is incomplete"); }
}
function parseMechanicalPlan(raw: unknown, state: MechanicalState, action: string): MechanicalOperation[] {
  if (!Array.isArray(raw) || raw.length > 16) throw new Error("Mechanical interpretation is incomplete");
  const operations: MechanicalOperation[] = [];
  for (const row of raw) {
    if (!obj(row) || !str(row.quote, 400) || !action.replace(/\s+/g, " ").includes(row.quote as string)) throw new Error("Mechanical action lacks player evidence");
    const quote = row.quote as string;
    if (row.kind === "ability") {
      const ability = state.abilities?.find(a => (a.id === row.ability || a.name.toLocaleLowerCase() === str(row.ability).toLocaleLowerCase()) && a.owner === "you");
      if (!ability || !/\b(?:use|cast|invoke|perform|activate|apply|treat|focus|deploy|repair|patch|switch|turn)\b/i.test(quote)) throw new Error("Ability use is not established");
      if (row.version !== undefined && row.version !== ability.version) throw new Error("Ability definition changed");
      operations.push({ kind: "ability", ability: ability.id, version: ability.version, ...(str(row.target, 80) ? { target: str(row.target, 80) } : {}) });
    } else if (row.kind === "strike") {
      if (Object.keys(row).some(k => !["kind", "target", "quote"].includes(k)) || !/\b(?:punch|strike|hit|kick|attack)\b/i.test(quote) || !str(row.target, 80)) throw new Error("A basic strike needs an explicit physical attack and has no model-selected damage");
      operations.push({ kind: "strike", target: actorName(state, str(row.target, 80)) });
    } else if (row.kind === "wait" || row.kind === "defend") {
      if (!(row.kind === "wait" ? /\b(?:wait|hold|pause)\b/i : /\b(?:defend|guard|brace|block)\b/i).test(quote)) throw new Error("Action was not stated");
      operations.push({ kind: row.kind });
    } else if (row.kind === "move") {
      if (!/\b(?:move|step|approach|retreat|back|close|advance)\b/i.test(quote) || !str(row.target, 80) || !["closer", "away"].includes(row.direction as string)) throw new Error("Movement was not established");
      operations.push({ kind: "move", target: actorName(state, str(row.target, 80)), direction: row.direction as "closer" | "away" });
    } else if (row.kind === "consume" || row.kind === "transfer") {
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
  for (const [index, operation] of operations.entries()) {
    if (operations.slice(0, index).some((other, i) => revision(other) === revision(operation) && (raw[i] as Record<string, unknown>).quote === (raw[index] as Record<string, unknown>).quote)) throw new Error("The same stated action cannot execute twice");
    if (operation.kind !== "ability") continue;
    const ability = state.abilities!.find(a => a.id === operation.ability)!;
    const quoted = (raw[index] as Record<string, unknown>).quote as string;
    for (const [otherIndex, other] of operations.entries()) {
      if (otherIndex === index || (other.kind !== "spend" && other.kind !== "consume")) continue;
      const otherId = "resource" in other ? other.resource : other.item;
      const duplicate = ability.costs.some(c => c.id === otherId && c.kind === (other.kind === "spend" ? "resource" : "item"));
      const otherQuote = (raw[otherIndex] as Record<string, unknown>).quote as string;
      if (duplicate && (quoted.includes(otherQuote) || otherQuote.includes(quoted))) throw new Error("Ability costs must not also be charged as a separate action");
    }
  }
  return operations;
}

export function conditionInfluence(state: MechanicalState, actor: string, approach: unknown, target?: string, place?: string, nextAction = false) {
  actor = actorName(state, actor); target = target ? actorName(state, target) : undefined;
  const relevant = APPROACHES.includes(approach as Approach) ? state.conditions.filter(c => c.owner === actor
    && conditionActive(state, c, nextAction) && (!c.targets?.length || (!!target && c.targets.some(t => actorName(state, t) === target))) && (!c.place || c.place === place)) : [];
  const blocked = relevant.filter(c => c.blocks.includes(approach as Approach));
  const helps = relevant.filter(c => c.helps.includes(approach as Approach));
  const hinders = relevant.filter(c => c.hinders.includes(approach as Approach));
  return { blocked: blocked.map(c => c.name), shift: Math.sign(helps.length - hinders.length), reasons: [...helps, ...hinders].map(c => c.name) };
}

export function mechanicalPacket(state: MechanicalState) {
  const withoutSource = <T extends { source: Evidence }>({ source, ...value }: T) => value;
  return { resources: state.resources.map(withoutSource), items: state.items.map(withoutSource), conditions: state.conditions.map(withoutSource), ...(state.abilities?.length ? { abilities: state.abilities.map(a => {
    const { source, sourceKind, fingerprint, ...value } = a; return value;
  }) } : {}), ...(state.entities?.length ? { entities: state.entities.map(withoutSource) } : {}), ...(state.distances?.length ? { distances: state.distances.map(withoutSource) } : {}),
    ...(state.clocks?.length ? { clocks: state.clocks } : {}), ...(state.cooldowns?.length ? { cooldowns: state.cooldowns } : {}) };
}
export function receiptPacket(receipt: MechanicalReceipt) {
  return { id: receipt.id, status: receipt.status, ...(receipt.reason ? { reason: receipt.reason } : {}), changes: (receipt.status === "ready" ? receipt.changes : []).map(c => ({
    kind: c.kind, id: c.id, before: c.before ? ("current" in c.before ? c.before.current : "quantity" in c.before ? c.before.quantity : "band" in c.before ? c.before.band : true) : null,
    after: c.after ? ("current" in c.after ? c.after.current : "quantity" in c.after ? c.after.quantity : "band" in c.after ? c.after.band : true) : null,
    ...(c.after && "name" in c.after ? { name: c.after.name } : c.before && "name" in c.before ? { name: c.before.name } : {}),
    ...(c.after && "owner" in c.after ? { owner: c.after.owner } : {}), ...(c.after && "equipped" in c.after ? { equipped: c.after.equipped } : {}),
  })), ...(receipt.status === "ready" && receipt.beats?.length ? { events: receipt.beats } : {}), ...(receipt.engine === 3 ? { boundary: "These recorded actions exhaust this exchange. Describe them once and stop at the next player choice. No extra attacks, costs, recovery or forced player reactions. Describe the physical and story consequences naturally. Leave arithmetic and resource totals to the inline display unless the player asks for those numbers; do not recite bookkeeping in the prose." } : {}) };
}
export function mechanicalNotes(receipt?: MechanicalReceipt): string[] {
  if (!receipt || receipt.status !== "ready") return [];
  return receipt.changes.filter(c => (c.after && "owner" in c.after && c.after.owner === "you") || (c.before && "owner" in c.before && c.before.owner === "you")).map(c => {
    const value = c.after;
    if (!value) return c.kind === "condition" && c.before && "name" in c.before ? `${c.before.name}: cleared` : "";
    if ("current" in value) return `${value.name}: ${value.current}${value.max === undefined ? "" : ` / ${value.max}`}${value.unit ? ` ${value.unit}` : ""}`;
    if ("quantity" in value) return value.owner !== "you" ? `${value.name}: now with ${value.owner}` : `${value.name}: ${value.quantity} left${value.equipped ? " · equipped" : ""}`;
    return "name" in value ? value.name : "";
  }).filter(Boolean).slice(-2);
}
