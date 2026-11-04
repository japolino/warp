import { revision } from "../shared/revision.js";
import { storyRevision, sourceRevisionMatches, sourceContains } from "./story-text.js";
import type { Evidence, Message } from "./world.js";
import type { Approach, MechanicalState } from "./mechanics.js";
import { actorName, RANGES, DAMAGE_TYPES, readDefenses, type Range, type DamageType, type Defense } from "./encounters.js";
import { IMPACTS, type Impact } from "./injuries.js";

export interface DefinitionSource { id: string; kind: "card" | "persona" | "lore"; text: string; }
export interface AbilityEffect {
  kind: "summon" | "dismiss" | "restore" | "damage" | "harm" | "mend" | "condition" | "clear_condition" | "defense";
  target: "self" | "target"; resource?: string; amount?: number; basis?: "source" | "warp";
  name?: string; hinders?: Approach[]; helps?: Approach[]; blocks?: Approach[]; ending?: string;
  damageType?: DamageType; defense?: Defense; duration?: number;
  companion?: string; untilDismissed?: true;
  impact?: Impact;
  maxInjury?: Impact | "any";
}
export interface AbilityDefinition {
  id: string; version: number; owner: string; name: string; description: string;
  approach: Approach | "other"; target: "self" | "other" | "either";
  range?: Range; cooldown?: number;
  costs: { kind: "resource" | "item"; id: string; amount: number }[];
  effects: AbilityEffect[]; requires: { item: string; equipped: boolean }[];
  unsupported: string[];
  source: Evidence; sourceKind: "story" | "card" | "persona" | "lore"; fingerprint: string;
}

const methods = ["movement", "precision", "force", "speech", "perception", "concentration", "other"] as const;
const str = (v: unknown, max = 160) => typeof v === "string" && v.trim().length <= max ? v.trim() : "";
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 1e6;
const numberIn = (text: string, n: number) => (text.match(/\d+(?:\.\d+)?/g) ?? []).some(x => Number(x) === n)
  || ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"].some((w, i) => i === n && new RegExp(`\\b${w}\\b`, "i").test(text));
const own = (v: unknown, player?: string) => ["you", "me", "i", "player", "{{user}}", player?.toLowerCase()].includes(str(v, 80).toLowerCase()) ? "you" : str(v, 80);
const scope = (v: unknown): Approach[] => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some(x => !methods.includes(x as Approach | "other") || x === "other")) throw new Error("Unsupported approach constraint");
  return [...new Set(v as Approach[])];
};
const identity = (owner: string, name: string) => `ability-${revision([owner.toLocaleLowerCase(), name.toLocaleLowerCase()])}`;

export function definitionSource(kind: DefinitionSource["kind"], text: string): DefinitionSource | null {
  if (!text.trim()) return null;
  const content = text.slice(0, 6000);
  return { id: `warp-source:${kind}:${revision(content)}`, kind, text: content };
}
export function validDefinitionSource(raw: unknown): raw is DefinitionSource {
  return obj(raw) && ["card", "persona", "lore"].includes(raw.kind as string) && typeof raw.text === "string" && raw.text.length <= 6000
    && raw.id === `warp-source:${raw.kind}:${revision(raw.text)}`;
}
export function sourceMessages(sources: DefinitionSource[]): Message[] {
  return sources.filter(validDefinitionSource).map(s => ({ id: s.id, is_user: false, content: s.text }));
}

/** Content is mapped into a fixed effect vocabulary; no generated formulas or executable rules. */
export function readAbilityDefinitions(raw: unknown, state: MechanicalState, messages: Message[], sources: DefinitionSource[] = [], player?: string, historical = false): AbilityDefinition[] {
  if (!Array.isArray(raw)) return [];
  const definitions: AbilityDefinition[] = [];
  for (const row of raw.slice(0, 6)) {
    if (!obj(row)) continue;
    try {
      if (Object.keys(row).some(k => !["id", "version", "owner", "name", "description", "approach", "target", "range", "cooldown", "costs", "effects", "requires", "unsupported", "message", "quote", "source", "sourceKind", "fingerprint"].includes(k))) continue;
      const owner = actorName(state, own(row.owner, player)), name = str(row.name), quote = str(row.quote, 800), messageId = str(row.message);
      const source = sources.find(s => validDefinitionSource(s) && s.id === messageId);
      const message = messages.find(m => m.id === messageId);
      const isCorrection = !!message?.is_user && /^\s*\(?OOC correction:/i.test(message.content);
      const content = source?.text ?? (message && (!message.is_user || isCorrection) ? message.content : "");
      const oldRevision = historical && obj(row.source) && typeof row.source.sourceRevision === "string" ? row.source.sourceRevision : undefined;
      if (!owner || !name || quote.length < 8 || !sourceContains(content, quote) || oldRevision && !sourceRevisionMatches(source ? { content } : message!, oldRevision)) continue;
      const id = identity(owner, name), existing = [...(state.abilities ?? []), ...definitions].find(a => a.id === id);
      // Preserve an established definition. An explicit correction or edited source can replace it.
      if (existing && !isCorrection && !(source && existing.sourceKind === source.kind && !sourceContains(content, existing.source.quote))) continue;
      if (!methods.includes(row.approach as typeof methods[number]) || !["self", "other", "either"].includes(row.target as string)) continue;
      if (row.range !== undefined && !RANGES.includes(row.range as Range)) continue;
      if (row.cooldown !== undefined && (!positive(row.cooldown) || !Number.isInteger(row.cooldown) || row.cooldown > 10000 || !numberIn(quote, row.cooldown))) continue;
      if (!Array.isArray(row.costs) || row.costs.length > 6 || !Array.isArray(row.effects) || !row.effects.length || row.effects.length > 8) continue;
      const costs: AbilityDefinition["costs"] = row.costs.map(c => {
        if (!obj(c) || Object.keys(c).some(k => !["kind", "id", "amount"].includes(k))) throw new Error("Unsupported cost fields");
        if (!obj(c) || !["resource", "item"].includes(c.kind as string) || !positive(c.amount) || !numberIn(quote, c.amount)) throw new Error("Unsupported ability cost");
        const candidates = (c.kind === "resource" ? state.resources : state.items).filter(v => v.owner === owner && (v.id === c.id || v.name.normalize("NFKC").toLocaleLowerCase() === str(c.id).normalize("NFKC").toLocaleLowerCase()));
        const candidate = candidates.length === 1 ? candidates[0] : undefined;
        if (!candidate || (c.kind === "item" && !Number.isInteger(c.amount))) throw new Error("Unknown or ambiguous ability payer");
        return { kind: c.kind as "resource" | "item", id: candidate.id, amount: c.amount };
      });
      const effects: AbilityEffect[] = row.effects.map(e => {
        const fields: Record<string, string[]> = { summon: ["companion", "duration"], dismiss: ["companion"], restore: ["resource", "amount", "basis", "magnitude"], damage: ["resource", "amount", "basis", "magnitude", "damageType"], harm: ["impact", "damageType"], mend: ["impact", "maxInjury"], condition: ["name", "hinders", "helps", "blocks", "ending", "duration", "untilDismissed"], clear_condition: ["name"], defense: ["name", "defense", "ending", "duration", "basis", "magnitude"] };
        if (!obj(e) || !fields[e.kind as string] || Object.keys(e).some(k => !["kind", "target", ...fields[e.kind as string]].includes(k))) throw new Error("Unsupported effect fields");
        if (!obj(e) || !["self", "target"].includes(e.target as string)) throw new Error("Unknown effect target");
        const target = e.target as "self" | "target";
        const duration = e.duration;
        if (duration !== undefined && (!positive(duration) || !Number.isInteger(duration) || duration > 10000 || !numberIn(quote, duration))) throw new Error("Unsourced action duration");
        if (e.kind === "summon" || e.kind === "dismiss") {
          const companion = state.companions?.find(c => (c.id === e.companion || c.actor === actorName(state, str(e.companion, 80))) && c.controller === owner && c.companionKind === "summon");
          if (target !== "self" || !companion) throw new Error("Unknown owned summon");
          return { kind: e.kind, target, companion: companion.id, ...(duration ? { duration: duration as number } : {}) };
        }
        if (e.kind === "harm" || e.kind === "mend") {
          if (!Object.hasOwn(IMPACTS, e.impact as string) || e.kind === "harm" && !["physical", "fire", "cold", "electric", "poison"].includes(e.damageType as string)) throw new Error("Unsupported qualitative physical effect");
          if (e.maxInjury !== undefined && (!["minor", "standard", "major", "any"].includes(e.maxInjury as string) || !(e.maxInjury === "any" ? /\b(?:all|any)\b/i : new RegExp(`\\b${e.maxInjury}\\b`, "i")).test(quote))) throw new Error("Unsourced treatment limit");
          return { kind: e.kind, target, impact: e.impact as Impact, ...(e.kind === "harm" ? { damageType: e.damageType as DamageType } : {}), ...(e.maxInjury ? { maxInjury: e.maxInjury as Impact | "any" } : {}) };
        }
        if (e.kind === "restore" || e.kind === "damage") {
          const resource = str(e.resource);
          if (!resource) throw new Error("Missing resource selector");
          const exact = positive(e.amount) && numberIn(quote, e.amount);
          const magnitude = { minor: 5, standard: 15, major: 30 }[e.magnitude as "minor" | "standard" | "major"];
          if (e.amount !== undefined && !exact) throw new Error("Unsourced numerical effect");
          if (!exact && !magnitude) throw new Error("Unrecognized effect magnitude");
          if (e.damageType !== undefined && !DAMAGE_TYPES.includes(e.damageType as DamageType)) throw new Error("Unknown damage type");
          return { kind: e.kind, target, resource, amount: exact ? e.amount as number : magnitude, basis: exact ? "source" : "warp", ...(e.damageType ? { damageType: e.damageType as DamageType } : {}) };
        }
        if (e.kind === "condition") {
          const name = str(e.name), ending = str(e.ending, 240);
          if (!name || !ending) throw new Error("Missing condition semantics");
          if (e.untilDismissed !== undefined && (e.untilDismissed !== true || target !== "self" || !state.companions?.some(c => c.actor === owner && c.companionKind === "summon"))) throw new Error("An effect bound to dismissal needs its established summon owner");
          return { kind: "condition", target, name, ending, hinders: scope(e.hinders), blocks: scope(e.blocks), helps: scope(e.helps), ...(e.untilDismissed === true ? { untilDismissed: true as const } : {}), ...(duration ? { duration: duration as number } : {}) };
        }
        if (e.kind === "defense") {
          const name = str(e.name), ending = str(e.ending, 240);
          if (!name || !ending || !obj(e.defense) || Object.keys(e.defense).some(k => !["kind", "amount", "damageType"].includes(k))) throw new Error("Incomplete defense effect");
          let defense: Defense, basis: "source" | "warp" | undefined;
          if (e.defense.kind === "shield") {
            const exact = positive(e.defense.amount) && numberIn(quote, e.defense.amount), magnitude = { minor: 5, standard: 15, major: 30 }[e.magnitude as "minor" | "standard" | "major"];
            if ((e.defense.amount !== undefined && !exact) || (!exact && !magnitude) || ![...DAMAGE_TYPES, "all"].includes(e.defense.damageType as DamageType | "all")) throw new Error("Unsupported shield effect");
            defense = { kind: "shield", amount: exact ? e.defense.amount as number : magnitude, damageType: e.defense.damageType as DamageType | "all" }; basis = exact ? "source" : "warp";
          } else defense = readDefenses([e.defense], quote)[0];
          return { kind: "defense", target, name, ending, defense, ...(basis ? { basis } : {}), ...(duration ? { duration: duration as number } : {}) };
        }
        if (e.kind === "clear_condition" && str(e.name)) return { kind: "clear_condition", target, name: str(e.name) };
        throw new Error("Unsupported effect");
      });
      const requires: AbilityDefinition["requires"] = [];
      if (row.requires !== undefined) {
        if (!Array.isArray(row.requires) || row.requires.length > 6) continue;
        for (const r of row.requires) {
          if (!obj(r) || typeof r.equipped !== "boolean") throw new Error("Unknown required equipment");
          const candidates = state.items.filter(i => i.owner === owner && (i.id === r.item || i.name.normalize("NFKC").toLocaleLowerCase() === str(r.item).normalize("NFKC").toLocaleLowerCase()));
          if (candidates.length !== 1) throw new Error("Unknown or ambiguous required equipment");
          if (Object.keys(r).some(k => !["item", "equipped"].includes(k))) throw new Error("Unsupported prerequisite");
          requires.push({ item: candidates[0].id, equipped: r.equipped });
        }
      }
      if (row.unsupported !== undefined && (!Array.isArray(row.unsupported) || row.unsupported.length > 8 || row.unsupported.some(v => !str(v, 240)))) continue;
      const unsupported = Array.isArray(row.unsupported) ? row.unsupported.map(v => str(v, 240)) : [];
      const body = { owner, name, description: str(row.description, 400) || name, approach: row.approach as AbilityDefinition["approach"], target: row.target as AbilityDefinition["target"], ...(row.range ? { range: row.range as Range } : {}), ...(row.cooldown ? { cooldown: row.cooldown as number } : {}), costs, effects, requires, unsupported };
      const fingerprint = revision(body);
      if (existing?.fingerprint === fingerprint) continue;
      definitions.push({ id, version: (existing?.version ?? 0) + 1, ...body, fingerprint, source: { message: messageId, quote, sourceRevision: oldRevision ?? storyRevision(content) }, sourceKind: source?.kind ?? "story" });
    } catch { /* A partial or unsupported definition never replaces a working one. */ }
  }
  return definitions;
}

export function abilitySummary(a: AbilityDefinition, state?: MechanicalState): string {
  const name = (id: string) => state?.resources.find(r => r.id === id)?.name ?? state?.items.find(i => i.id === id)?.name ?? id;
  return `${a.name} · ${a.costs.length ? a.costs.map(c => `${c.amount} ${name(c.id)}`).join(" + ") : "No established resource cost"}${a.unsupported.length ? " · needs clarification" : ""}`;
}

export const ABILITY_INSTRUCTIONS = `Optionally include abilityDefinitions:[{owner,name,description,approach:"movement|precision|force|speech|perception|concentration|other",target:"self|other|either",costs:[{kind:"resource|item",id,amount}],effects:[],requires:[{item,equipped}],unsupported:[],message,quote}].
Prepare only established abilities/item actions relevant to this scene. Use exact source IDs and one contiguous source quote covering the ability's effects and restrictions. Player attempts cannot establish a new ability. Respect which person actually owns the ability: a character card normally describes that character, while the persona describes the player. An item action requires the actual owned item.
Effect vocabulary: {kind:"restore|damage",target:"self|target",resource:"resource name or saved ID",amount:explicitNumber} or magnitude:"minor|standard|major" ONLY when no numerical amount exists; damage may have damageType:"physical|fire|cold|electric|poison|mental|untyped"; {kind:"condition",target,name,hinders:[],blocks:[],helps:[],ending,duration?:explicitOwnerActions}; {kind:"clear_condition",target,name}; {kind:"defense",target,name,defense:{kind:"armor|resistance|immunity|shield|reflect",amount,damageType:"physical|fire|cold|electric|poison|mental|untyped|all"},ending,duration?:explicitOwnerActions}. Resistance/reflect are percentages, armor is flat, immunity uses amount:0. Only shield may use magnitude with its amount omitted. Approaches use the same enum as above, except other.
Definitions may include range:"touch|near|far" and cooldown:explicitSubsequentOwnerActions only when established in source. Never infer a timer, default range or default cooldown. Duration counts subsequent actions of the affected owner, not chat messages. A cooldown of 1 requires another action before reuse. Seconds, real-time durations, unsupported damage types, multi-target rules and complex triggers belong in unsupported until supported; do not silently convert them. Reapplying the same effect refreshes it without stacking. Defenses resolve immunity, flat armor, capped resistance, shields, then loss, then at most one reflection.
All costs must be explicit numbers in the source quote and reference an established resource/item owned by the ability owner. Do not invent mana, energy, health, timers, drawbacks, limits or new powers. No stated resource cost means costs:[]. Code supplies fixed magnitude values where needed and labels them Warp values. No formulas or scripts.
Put unsupported restrictions or effects in unsupported; never silently omit them to make an ability executable. Do not regenerate a saved definition unless the source actually changed or an explicit OOC correction changes it. Return at most 3 relevant definitions. These are automatically prepared content, not a rulebook or a setup question.`;
