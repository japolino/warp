// Finding a chat's ruleset in its character's lorebooks, caching it, and
// installing templates.

import type { WorldBookEntryDTO } from "lumiverse-spindle-types";
import { isRulesetBookName, isRulesetEntryTitle, compileRuleset, type RulesetPart } from "../engine/loader.js";
import type { Issue, Ruleset } from "../engine/ruleset.js";
import { getTemplate, looksLikeScenario, withCharacter } from "../engine/templates/index.js";
import type { RulesetStatus } from "../shared/protocol.js";
import { host, logError } from "./host.js";
import { fingerprint } from "../engine/fingerprint.js";
import { loreAccess } from "../engine/knowledge.js";
import { foldPath, getMessages } from "./ledger.js";

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
  const key = `${userId ?? "_"}:${chatId}`;
  if (chatCharacter.has(key)) return chatCharacter.get(key)!;
  const chat = await host().chats.get(chatId, userId);
  const id = chat?.character_id || null;
  chatCharacter.set(key, id);
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
  const { ruleset, issues } = compileRuleset(parts);
  base.ruleset = ruleset;
  base.issues = issues;
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
  const key = `${userId ?? "_"}:${characterId}`;
  const hit = byCharacter.get(key);
  if (hit && !force && Date.now() - hit.at < TTL_MS) return hit;
  try {
    const loaded = await loadForCharacter(characterId, userId);
    byCharacter.set(key, loaded);
    return loaded;
  } catch (e) {
    logError("loadForCharacter", e);
    return hit ? { ...hit, ruleset: null, issues: [...hit.issues, { level: "error", where: "ruleset", message: "Could not reload the ruleset." }] } : null;
  }
}

const briefs = new Map<string, { text: string; at: number }>();

/** The card's description, personality and scenario, clipped — for questions about who people are. */
export async function characterBrief(chatId: string, userId?: string): Promise<string> {
  const id = await characterForChat(chatId, userId).catch(() => null);
  if (!id) return "";
  const key = `${userId ?? "_"}:${id}`;
  const hit = briefs.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.text;
  const c = await host().characters.get(id, userId).catch(() => null);
  const text = c ? [
    `Name: ${c.name}`,
    c.description && `Description: ${c.description}`,
    c.personality && `Personality: ${c.personality}`,
    c.scenario && `Scenario: ${c.scenario}`,
  ].filter(Boolean).join("\n").slice(0, 4000) : "";
  briefs.set(key, { text, at: Date.now() });
  return text;
}

export function invalidateCharacter(characterId?: string | null) {
  if (characterId) {
    for (const key of byCharacter.keys()) if (key.endsWith(`:${characterId}`)) byCharacter.delete(key);
    for (const key of briefs.keys()) if (key.endsWith(`:${characterId}`)) briefs.delete(key);
  }
  else { byCharacter.clear(); briefs.clear(); }
  chatCharacter.clear(); profiles.clear();
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

// ───────────────────────── who someone is ─────────────────────────

export interface PersonProfile {
  /** What's known about them: the card, lorebook entries about them, how the story has shown them. */
  text: string;
  /** The card is a setting (scenario / narrator card), not this person. */
  scenario: boolean;
  /** A short piece of the setting, for scenario cards. */
  setting: string;
}

const profiles = new Map<string, { at: number; p: PersonProfile }>();
const PROFILE_TTL = 10 * 60_000;

export const nameRe = (name: string) => {
  const first = name.trim().split(/\s+/)[0] ?? name;
  const safe = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${safe}(?=[^\\p{L}]|$)`, "iu");
};

/** Paragraphs of a text that mention them, up to a budget. */
export function aboutThem(text: string | undefined | null, re: RegExp, budget: number): string {
  if (!text) return "";
  const out: string[] = [];
  let n = 0;
  for (const para of text.split(/\n\s*\n|\n(?=[-*•]|\w+:)/)) {
    const p = para.trim();
    if (!p || !re.test(p)) continue;
    const piece = p.length > 700 ? `${p.slice(0, 700)}…` : p;
    if (n + piece.length > budget) break;
    out.push(piece);
    n += piece.length;
  }
  return out.join("\n");
}

/**
 * Who a person is, gathered for the stage's lines and pictures: the whole card when
 * they are the card's character; otherwise what the card says about them, lorebook
 * entries keyed to their name, and how the recent story has shown them.
 */
export async function personProfile(chatId: string, name: string, userId?: string, note?: string): Promise<PersonProfile> {
  const loaded = await getRuleset(chatId, userId);
  const msgs = await getMessages(chatId).catch(() => []);
  const fold = loaded?.ruleset ? foldPath(loaded.ruleset, msgs) : null;
  const key = `${userId ?? "_"}:${chatId}:${name.toLowerCase()}:${fingerprint([fold?.revision, fold?.state, msgs.map((m) => [m.id, m.swipe_id, m.content]), note])}`;
  const hit = profiles.get(key);
  if (hit && Date.now() - hit.at < PROFILE_TTL) return hit.p;
  const re = nameRe(name);
  const id = await characterForChat(chatId, userId).catch(() => null);
  const c = id ? await host().characters.get(id, userId).catch(() => null) : null;
  const scenario = !!c && looksLikeScenario(c);
  const parts: string[] = [];
  if (note) parts.push(note);
  let setting = "";
  if (c && !scenario && re.test(c.name)) {
    // They are the card.
    parts.push(await characterBrief(chatId, userId));
  } else if (c) {
    const fromCard = [c.description, c.personality, c.scenario].map((t) => aboutThem(t, re, 1200)).filter(Boolean).join("\n");
    if (fromCard) parts.push(`From the card:\n${fromCard}`);
    setting = [c.scenario, c.description].filter(Boolean).join("\n").slice(0, 600);
    // Lorebook entries about them (keyed to their name, or titled after them).
    const lore: string[] = [];
    for (const bookId of c.world_book_ids ?? []) {
      if (lore.length >= 3) break;
      const book = await host().world_books.get(bookId, userId).catch(() => null);
      if (!book || isRulesetBookName(book.name)) continue;
      const entries = await listAllEntries(bookId, userId).catch(() => [] as WorldBookEntryDTO[]);
      for (const e of entries) {
        if (lore.length >= 3) break;
        if (isRulesetEntryTitle(e.comment)) continue;
        if (!loaded || (loaded.source && !fold)) continue;
        const access = fold ? loreAccess(fold.ruleset, fold.state, e.comment ?? "") : { gated: false, open: true };
        if (!access.open || (e.disabled && !access.gated)) continue;
        const keys = [...(e.key ?? []), e.comment ?? ""].join(" ");
        if (re.test(keys)) lore.push(e.content.length > 900 ? `${e.content.slice(0, 900)}…` : e.content);
      }
    }
    if (lore.length) parts.push(`From the lorebook:\n${lore.join("\n---\n")}`);
  }
  // How the story has shown them lately.
  try {
    const seen: string[] = [];
    let n = 0;
    for (const m of [...msgs].reverse().slice(0, 40)) {
      if (m.is_user || !re.test(m.content)) continue;
      const bit = aboutThem(m.content, re, 500);
      if (!bit || n + bit.length > 1400) continue;
      seen.unshift(bit);
      n += bit.length;
      if (seen.length >= 4) break;
    }
    if (seen.length) parts.push(`How the story has shown them:\n${seen.join("\n")}`);
  } catch { /* no history */ }
  const p: PersonProfile = { text: parts.filter(Boolean).join("\n\n").slice(0, 4500), scenario, setting };
  if (profiles.size >= 128) profiles.delete(profiles.keys().next().value!);
  profiles.set(key, { at: Date.now(), p });
  return p;
}
