// Finding a chat's ruleset in its character's lorebooks, caching it, and
// installing templates.

import type { WorldBookEntryDTO } from "lumiverse-spindle-types";
import { isRulesetBookName, isRulesetEntryTitle, loadRuleset, type RulesetPart } from "../engine/loader.js";
import { lintRuleset } from "../engine/lint.js";
import type { Issue, Ruleset } from "../engine/ruleset.js";
import { getTemplate, looksLikeScenario, withCharacter } from "../engine/templates/index.js";
import { auditRuleset } from "../engine/audit.js";
import type { RulesetStatus } from "../shared/protocol.js";
import { host, logError } from "./host.js";
import { isInstalledRulebook, publishRulebook } from "./rulebook-install.js";

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
const loading = new Map<string, number>();
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

/** Legacy books merge; a published snapshot supersedes their rules without erasing them. */
export async function attachedRulebooks(character: { world_book_ids?: string[] }, userId?: string) {
  const books = (await Promise.all((character.world_book_ids ?? []).map((id) => host().world_books.get(id, userId))))
    .filter((book): book is NonNullable<typeof book> => !!book);
  const active = [...books].reverse().find((book) => isRulesetBookName(book.name) && isInstalledRulebook(book));
  return { books, active };
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
  const attached = await attachedRulebooks(character, userId);
  for (const book of attached.books) {
    const bookId = book.id;
    const included = !attached.active || attached.active.id === bookId;
    const wholeBook = isRulesetBookName(book.name);
    const entries = await listAllEntries(bookId, userId);
    let found = 0;
    for (const e of entries) {
      if (!wholeBook && !isRulesetEntryTitle(e.comment)) continue;
      knownRulesetEntryIds.add(e.id);
      if (!included) continue;
      parts.push({ label: e.comment?.trim() || `${book.name} entry`, content: e.content, order: e.order_value ?? 100 });
      base.entryIds.push(e.id);
      found++;
    }
    if (wholeBook) knownRulesetBookIds.add(bookId);
    if (found) books.push(`${book.name} (${found} ${found === 1 ? "entry" : "entries"})`);
    if (found) base.bookIds.push(bookId);
  }
  if (!parts.length) return base;
  const { ruleset, issues } = loadRuleset(parts);
  base.issues = ruleset ? [...issues, ...lintRuleset(ruleset)] : issues;
  base.ruleset = base.issues.some((i) => i.level === "error") ? null : ruleset;
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
  const revision = (loading.get(characterId) ?? 0) + 1;
  loading.set(characterId, revision);
  try {
    const loaded = await loadForCharacter(characterId, userId);
    if (loading.get(characterId) === revision) byCharacter.set(characterId, loaded);
    return byCharacter.get(characterId) ?? loaded;
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
  if (characterId) loading.set(characterId, (loading.get(characterId) ?? 0) + 1);
  else for (const id of loading.keys()) loading.set(id, (loading.get(id) ?? 0) + 1);
  profiles.clear();
}

export function invalidateChat(chatId: string) {
  chatCharacter.delete(chatId);
  for (const k of profiles.keys()) if (k.startsWith(`${chatId}:`)) profiles.delete(k);
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
    ...(l.ruleset ? { depth: depthOf(l.ruleset) } : {}),
  };
}

const depths = new WeakMap<Ruleset, NonNullable<RulesetStatus["depth"]>>();
/** The audit, worked out once per loaded ruleset. */
function depthOf(r: Ruleset): NonNullable<RulesetStatus["depth"]> {
  const hit = depths.get(r);
  if (hit) return hit;
  const a = auditRuleset(r);
  const d = { score: a.depth, gaps: a.gaps, drafted: Object.values(r.items).filter((i) => i.drafted).map((i) => i.name) };
  depths.set(r, d);
  return d;
}

/** Create a "warp-ruleset" lorebook from a template and attach it to the chat's character. */
export async function installTemplate(chatId: string, templateId: string, userId?: string, trackCharacter?: boolean): Promise<string> {
  const t = getTemplate(templateId);
  if (!t) throw new Error("Unknown template");
  const characterId = await characterForChat(chatId, userId);
  if (!characterId) throw new Error("This chat has no character to attach a ruleset to");
  const character = await host().characters.get(characterId, userId);
  if (!character) throw new Error("Character not found");

  const parts = t.parts.map((part, i) => {
    let content = part.yaml;
    // Seed the card's own character as a tracked person so relationships work from turn one.
    const track = trackCharacter ?? !looksLikeScenario(character);
    if (part.label === "people" && character.name && track) content = withCharacter(content, character.name);
    return { label: part.label, content, order: (i + 1) * 10 };
  });
  const bookId = await publishRulebook(characterId, parts, userId, { template: t.id });
  invalidateCharacter(characterId);
  knownRulesetBookIds.add(bookId);
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
  const first = name.trim();
  // An empty name would match everywhere (every card, every lorebook entry).
  if (!first) return /(?!)/u;
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
 * Who a person is, gathered for the doll and for encounter lines: the whole card when
 * they are the card's character; otherwise what the card says about them, lorebook
 * entries keyed to their name, and how the recent story has shown them.
 */
export async function personProfile(chatId: string, name: string, userId?: string, note?: string): Promise<PersonProfile> {
  const key = `${chatId}:${userId ?? "_"}:${name.toLowerCase()}:${note ?? ""}`;
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
        const keys = [...(e.key ?? []), e.comment ?? ""].join(" ");
        if (re.test(keys)) lore.push(e.content.length > 900 ? `${e.content.slice(0, 900)}…` : e.content);
      }
    }
    if (lore.length) parts.push(`From the lorebook:\n${lore.join("\n---\n")}`);
  }
  // How the story has shown them lately.
  try {
    const { getMessages } = await import("./ledger.js");
    const msgs = await getMessages(chatId);
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
  profiles.set(key, { at: Date.now(), p });
  return p;
}
