// Finding a chat's ruleset in its character's lorebooks, caching it, and
// installing templates.

import type { WorldBookEntryDTO } from "lumiverse-spindle-types";
import { isRulesetBookName, isRulesetEntryTitle, loadRuleset, type RulesetPart } from "../engine/loader.js";
import { lintRuleset } from "../engine/lint.js";
import type { Issue, Ruleset } from "../engine/ruleset.js";
import { getTemplate, looksLikeScenario, withCharacter } from "../engine/templates/index.js";
import type { RulesetStatus } from "../shared/protocol.js";
import { host, logError } from "./host.js";

export interface Loaded {
  characterId: string | null;
  characterName: string | null;
  cardKind: "character" | "scenario";
  ruleset: Ruleset | null;
  issues: Issue[];
  /** "warp-ruleset (3 entries)" etc. */
  source: string | null;
  entryIds: string[];
  bookIds: string[];
  at: number;
}

const TTL_MS = 8000;
const byCharacter = new Map<string, Loaded>();
const chatCharacter = new Map<string, string | null>();
/** Every entry/book id known to hold ruleset YAML — the WI interceptor keeps these out of prompts. */
export const knownRulesetEntryIds = new Set<string>();
export const knownRulesetBookIds = new Set<string>();

async function listAllEntries(bookId: string, userId?: string): Promise<WorldBookEntryDTO[]> {
  const out: WorldBookEntryDTO[] = [];
  for (let offset = 0; offset < 5000; offset += 200) {
    const page = await host().world_books.entries.list(bookId, { limit: 200, offset, userId });
    out.push(...page.data);
    if (out.length >= page.total || page.data.length === 0) break;
  }
  return out;
}

export async function characterForChat(chatId: string, userId?: string): Promise<string | null> {
  if (chatCharacter.has(chatId)) return chatCharacter.get(chatId)!;
  const chat = await host().chats.get(chatId, userId);
  const id = chat?.character_id || null;
  chatCharacter.set(chatId, id);
  return id;
}

async function loadForCharacter(characterId: string, userId?: string): Promise<Loaded> {
  const character = await host().characters.get(characterId, userId);
  const base: Loaded = {
    characterId, characterName: character?.name ?? null,
    cardKind: character && looksLikeScenario(character) ? "scenario" : "character",
    ruleset: null, issues: [], source: null, entryIds: [], bookIds: [], at: Date.now(),
  };
  if (!character) return base;
  const parts: RulesetPart[] = [];
  const books: string[] = [];
  for (const bookId of character.world_book_ids ?? []) {
    const book = await host().world_books.get(bookId, userId);
    if (!book) continue;
    const wholeBook = isRulesetBookName(book.name);
    const entries = await listAllEntries(bookId, userId);
    let found = 0;
    for (const e of entries) {
      if (!wholeBook && !isRulesetEntryTitle(e.comment)) continue;
      parts.push({ label: e.comment?.trim() || `${book.name} entry`, content: e.content, order: e.order_value ?? 100 });
      base.entryIds.push(e.id);
      knownRulesetEntryIds.add(e.id);
      found++;
    }
    if (wholeBook) knownRulesetBookIds.add(bookId);
    if (found) books.push(`${book.name} (${found} ${found === 1 ? "entry" : "entries"})`);
    if (found) base.bookIds.push(bookId);
  }
  if (!parts.length) return base;
  const { ruleset, issues } = loadRuleset(parts);
  base.ruleset = ruleset;
  base.issues = ruleset ? [...issues, ...lintRuleset(ruleset)] : issues;
  base.source = books.join(", ");
  return base;
}

export async function getRuleset(chatId: string | null, userId?: string, force = false): Promise<Loaded | null> {
  if (!chatId) return null;
  let characterId: string | null;
  try {
    characterId = await characterForChat(chatId, userId);
  } catch (e) {
    logError("characterForChat", e);
    return null;
  }
  if (!characterId) return null;
  const hit = byCharacter.get(characterId);
  if (hit && !force && Date.now() - hit.at < TTL_MS) return hit;
  try {
    const loaded = await loadForCharacter(characterId, userId);
    byCharacter.set(characterId, loaded);
    return loaded;
  } catch (e) {
    logError("loadForCharacter", e);
    return hit ?? null;
  }
}

const briefs = new Map<string, { text: string; at: number }>();

/** The card's description, personality and scenario, clipped — for questions about who people are. */
export async function characterBrief(chatId: string, userId?: string): Promise<string> {
  const id = await characterForChat(chatId, userId).catch(() => null);
  if (!id) return "";
  const hit = briefs.get(id);
  if (hit && Date.now() - hit.at < 60_000) return hit.text;
  const c = await host().characters.get(id, userId).catch(() => null);
  const text = c ? [
    `Name: ${c.name}`,
    c.description && `Description: ${c.description}`,
    c.personality && `Personality: ${c.personality}`,
    c.scenario && `Scenario: ${c.scenario}`,
  ].filter(Boolean).join("\n").slice(0, 4000) : "";
  briefs.set(id, { text, at: Date.now() });
  return text;
}

export function invalidateCharacter(characterId?: string | null) {
  if (characterId) { byCharacter.delete(characterId); briefs.delete(characterId); }
  else { byCharacter.clear(); briefs.clear(); }
}

export function statusOf(l: Loaded | null): RulesetStatus {
  if (!l || !l.source) {
    return { state: "none", name: null, source: null, issues: l?.issues ?? [], characterName: l?.characterName ?? null, cardKind: l?.cardKind ?? "character", tags: [] };
  }
  const tags = new Set<string>();
  for (const a of Object.values(l.ruleset?.actions ?? {})) for (const t of a.tags) tags.add(t);
  for (const a of Object.values(l.ruleset?.liveChoices.tags ?? {})) for (const t of a.tags) tags.add(t);
  return {
    state: l.ruleset ? "ok" : "broken",
    name: l.ruleset?.name ?? null,
    source: l.source,
    issues: l.issues,
    characterName: l.characterName,
    cardKind: l.cardKind,
    tags: [...tags].sort(),
  };
}

/** Create a "warp-ruleset" lorebook from a template and attach it to the chat's character. */
export async function installTemplate(chatId: string, templateId: string, userId?: string, trackCharacter?: boolean): Promise<string> {
  const t = getTemplate(templateId);
  if (!t) throw new Error("Unknown template");
  const characterId = await characterForChat(chatId, userId);
  if (!characterId) throw new Error("This chat has no character to attach a ruleset to");
  const character = await host().characters.get(characterId, userId);
  if (!character) throw new Error("Character not found");

  const book = await host().world_books.create({
    name: "warp-ruleset",
    description: `Warp game rules for ${character.name} (${t.name}). Warp reads these entries directly; they are never sent to the model.`,
    metadata: { warp: { template: t.id } },
  }, userId);

  let order = 10;
  for (const part of t.parts) {
    let content = part.yaml;
    // Seed the card's own character as a tracked person so relationships work from turn one.
    const track = trackCharacter ?? !looksLikeScenario(character);
    if (part.label === "people" && character.name && track) content = withCharacter(content, character.name);
    await host().world_books.entries.create(book.id, {
      comment: `warp-ruleset · ${part.label}`,
      content,
      key: [],
      disabled: true,
      constant: false,
      order_value: order,
    }, userId);
    order += 10;
  }

  const ids = [...(character.world_book_ids ?? []), book.id];
  await host().characters.update(characterId, { world_book_ids: ids }, userId);
  invalidateCharacter(characterId);
  knownRulesetBookIds.add(book.id);
  return t.name;
}
