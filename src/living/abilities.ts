import { revision } from "../shared/revision.js";
import type { Evidence, Message } from "./world.js";
import type { Approach, MechanicalState } from "./mechanics.js";

export interface DefinitionSource { id: string; kind: "card" | "persona" | "lore"; text: string; }
export interface AbilityEffect {
  kind: "restore" | "damage" | "condition" | "clear_condition";
  target: "self" | "target"; resource?: string; amount?: number; basis?: "source" | "warp";
  name?: string; hinders?: Approach[]; helps?: Approach[]; blocks?: Approach[]; ending?: string;
}
export interface AbilityDefinition {
  id: string; version: number; owner: string; name: string; description: string;
  approach: Approach | "other"; target: "self" | "other" | "either";
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
export function readAbilityDefinitions(raw: unknown, state: MechanicalState, messages: Message[], sources: DefinitionSource[] = [], player?: string): AbilityDefinition[] {
  if (!Array.isArray(raw)) return [];
  const definitions: AbilityDefinition[] = [];
  for (const row of raw.slice(0, 6)) {
    if (!obj(row)) continue;
    try {
      if (Object.keys(row).some(k => !["id", "version", "owner", "name", "description", "approach", "target", "costs", "effects", "requires", "unsupported", "message", "quote", "source", "sourceKind", "fingerprint"].includes(k))) continue;
      const owner = own(row.owner, player), name = str(row.name), quote = str(row.quote, 800), messageId = str(row.message);
      const source = sources.find(s => validDefinitionSource(s) && s.id === messageId);
      const message = messages.find(m => m.id === messageId);
      const isCorrection = !!message?.is_user && /^\s*\(?OOC correction:/i.test(message.content);
      const content = source?.text ?? (message && (!message.is_user || isCorrection) ? message.content : "");
      if (!owner || !name || quote.length < 8 || !content.replace(/\s+/g, " ").includes(quote)) continue;
      const id = identity(owner, name), existing = [...(state.abilities ?? []), ...definitions].find(a => a.id === id);
      // Preserve an established definition. An explicit correction or edited source can replace it.
      if (existing && !isCorrection && !(source && existing.sourceKind === source.kind && !content.replace(/\s+/g, " ").includes(existing.source.quote))) continue;
      if (!methods.includes(row.approach as typeof methods[number]) || !["self", "other", "either"].includes(row.target as string)) continue;
      if (!Array.isArray(row.costs) || row.costs.length > 6 || !Array.isArray(row.effects) || !row.effects.length || row.effects.length > 8) continue;
      const costs: AbilityDefinition["costs"] = row.costs.map(c => {
        if (!obj(c) || Object.keys(c).some(k => !["kind", "id", "amount"].includes(k))) throw new Error("Unsupported cost fields");
        if (!obj(c) || !["resource", "item"].includes(c.kind as string) || !positive(c.amount) || !numberIn(quote, c.amount)) throw new Error("Unsupported ability cost");
        const candidate = c.kind === "resource" ? state.resources.find(r => r.id === c.id) : state.items.find(i => i.id === c.id);
        if (!candidate || candidate.owner !== owner || (c.kind === "item" && !Number.isInteger(c.amount))) throw new Error("Unknown ability payer");
        return { kind: c.kind as "resource" | "item", id: candidate.id, amount: c.amount };
      });
      const effects: AbilityEffect[] = row.effects.map(e => {
        if (!obj(e) || Object.keys(e).some(k => !["kind", "target", "resource", "amount", "basis", "magnitude", "name", "hinders", "helps", "blocks", "ending"].includes(k))) throw new Error("Unsupported effect fields");
        if (!obj(e) || !["self", "target"].includes(e.target as string)) throw new Error("Unknown effect target");
        const target = e.target as "self" | "target";
        if (e.kind === "restore" || e.kind === "damage") {
          const resource = str(e.resource);
          if (!resource) throw new Error("Missing resource selector");
          const exact = positive(e.amount) && numberIn(quote, e.amount);
          const magnitude = { minor: 5, standard: 15, major: 30 }[e.magnitude as "minor" | "standard" | "major"];
          if (e.amount !== undefined && !exact) throw new Error("Unsourced numerical effect");
          if (!exact && !magnitude) throw new Error("Unrecognized effect magnitude");
          return { kind: e.kind, target, resource, amount: exact ? e.amount as number : magnitude, basis: exact ? "source" : "warp" };
        }
        if (e.kind === "condition") {
          const name = str(e.name), ending = str(e.ending, 240);
          if (!name || !ending) throw new Error("Missing condition semantics");
          return { kind: "condition", target, name, ending, hinders: scope(e.hinders), blocks: scope(e.blocks), helps: scope(e.helps) };
        }
        if (e.kind === "clear_condition" && str(e.name)) return { kind: "clear_condition", target, name: str(e.name) };
        throw new Error("Unsupported effect");
      });
      const requires: AbilityDefinition["requires"] = [];
      if (row.requires !== undefined) {
        if (!Array.isArray(row.requires) || row.requires.length > 6) continue;
        for (const r of row.requires) {
          if (!obj(r) || !state.items.some(i => i.id === r.item && i.owner === owner) || typeof r.equipped !== "boolean") throw new Error("Unknown required equipment");
          if (Object.keys(r).some(k => !["item", "equipped"].includes(k))) throw new Error("Unsupported prerequisite");
          requires.push({ item: r.item as string, equipped: r.equipped });
        }
      }
      if (row.unsupported !== undefined && (!Array.isArray(row.unsupported) || row.unsupported.length > 8 || row.unsupported.some(v => !str(v, 240)))) continue;
      const unsupported = Array.isArray(row.unsupported) ? row.unsupported.map(v => str(v, 240)) : [];
      const body = { owner, name, description: str(row.description, 400) || name, approach: row.approach as AbilityDefinition["approach"], target: row.target as AbilityDefinition["target"], costs, effects, requires, unsupported };
      const fingerprint = revision(body);
      if (existing?.fingerprint === fingerprint) continue;
      definitions.push({ id, version: (existing?.version ?? 0) + 1, ...body, fingerprint, source: { message: messageId, quote, sourceRevision: revision(content) }, sourceKind: source?.kind ?? "story" });
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
Effect vocabulary: {kind:"restore|damage",target:"self|target",resource:"resource name or saved ID",amount:explicitNumber} or magnitude:"minor|standard|major" ONLY when no numerical amount exists; {kind:"condition",target,name,hinders:[],blocks:[],helps:[],ending}; {kind:"clear_condition",target,name}. Approaches use the same enum as above, except other.
All costs must be explicit numbers in the source quote and reference an established resource/item owned by the ability owner. Do not invent mana, energy, health, timers, drawbacks, limits or new powers. No stated resource cost means costs:[]. Code supplies fixed magnitude values where needed and labels them Warp values. No formulas or scripts.
Put unsupported restrictions or effects in unsupported; never silently omit them to make an ability executable. Do not regenerate a saved definition unless the source actually changed or an explicit OOC correction changes it. Return at most 3 relevant definitions. These are automatically prepared content, not a rulebook or a setup question.`;
