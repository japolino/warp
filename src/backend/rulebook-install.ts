// The lorebook protocol in one host-only file: which attached book holds the rules, and publishing a new
// one. Build a complete immutable candidate, validate its persisted contents, then publish it with one
// character attachment update. Old books remain a backup (or, on a style switch, are detached).
import { isRulesetBookName, isRulesetEntryTitle, loadRuleset, type RulesetPart } from "../engine/loader.js";
import { host, logError } from "./host.js";

export function isInstalledRulebook(book: { metadata?: unknown }): boolean {
  const meta = book.metadata as { warp?: { installedRulebook?: unknown } } | undefined;
  return meta?.warp?.installedRulebook === 1;
}

/** The template id an installed book came from (its metadata), or null for builder and custom books. */
export function templateOf(book: { metadata?: unknown } | null | undefined): string | null {
  const t = (book?.metadata as { warp?: { template?: unknown } } | undefined)?.warp?.template;
  return isInstalledRulebook(book ?? {}) && typeof t === "string" && t ? t : null;
}

/** Legacy books merge; a published snapshot supersedes their rules without erasing them. */
export async function attachedRulebooks(character: { world_book_ids?: string[] }, userId?: string) {
  const books = (await Promise.all((character.world_book_ids ?? []).map((id) => host().world_books.get(id, userId))))
    .filter((book): book is NonNullable<typeof book> => !!book);
  const active = [...books].reverse().find((book) => isRulesetBookName(book.name) && isInstalledRulebook(book));
  return { books, active };
}

/** One installed ruleset entry: its id, its book, its part label ("stats") and its YAML. */
export interface RulesetEntry { id: string; bookId: string; label: string; content: string }

/** An entry title's part label: "warp-ruleset · stats" → "stats" (no label → "core"). */
export function labelOf(comment: string): string {
  return comment.replace(/^\s*(?:\[[^\]]*\]\s*)?warp[-_ ]?ruleset\s*[·:\-–—|]?\s*/i, "").trim().toLowerCase() || "core";
}

/**
 * The ruleset entries a character runs, read exactly as Warp reads them: the active installed book (or, before any
 * install, every attached book named warp-ruleset and every entry titled "warp-ruleset …").
 */
export async function rulesetEntries(characterId: string, userId?: string): Promise<{ entries: RulesetEntry[]; rulesetBook: string | null; bookIds: string[] }> {
  const c = await host().characters.get(characterId, userId);
  const entries: RulesetEntry[] = [];
  let rulesetBook: string | null = null;
  const attached = await attachedRulebooks(c ?? {}, userId);
  for (const book of attached.books) {
    if (attached.active && attached.active.id !== book.id) continue;
    const bookId = book.id;
    const whole = isRulesetBookName(book.name);
    if (whole && !rulesetBook) rulesetBook = bookId;
    for (let offset = 0; offset < 2000; offset += 200) {
      const page = await host().world_books.entries.list(bookId, { limit: 200, offset, userId });
      for (const e of page.data) if (whole || isRulesetEntryTitle(e.comment)) entries.push({ id: e.id, bookId, label: labelOf(e.comment ?? ""), content: e.content });
      if (page.data.length < 200) break;
    }
  }
  return { entries, rulesetBook, bookIds: c?.world_book_ids ?? [] };
}

const installs = new Map<string, Promise<unknown>>();

/** `replace`: the id of a book this one replaces (detached from the character once the new one is attached). */
export function publishRulebook(characterId: string, parts: RulesetPart[], userId?: string, metadata: Record<string, unknown> = {}, replace?: string): Promise<string> {
  const key = JSON.stringify([userId, characterId]);
  const result = (installs.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const checked = loadRuleset(parts);
    if (!checked.ruleset || checked.issues.some((i) => i.level === "error")) throw new Error("Fix the rulebook errors before installing it.");
    const character = await host().characters.get(characterId, userId);
    if (!character) throw new Error("Character not found");
    const book = await host().world_books.create({
      name: "warp-ruleset",
      description: `Warp game rules for ${character.name}. A complete installed snapshot; older attached rulebooks are retained as backups.`,
      metadata: { warp: { ...metadata, installedRulebook: 1 } },
    }, userId);
    let verified = false;
    try {
      for (const part of parts) await host().world_books.entries.create(book.id, {
        comment: `warp-ruleset · ${part.label}`, content: part.content,
        key: [], disabled: true, constant: false, order_value: part.order,
      }, userId);
      const persisted: RulesetPart[] = [];
      for (let offset = 0; ; offset += 200) {
        const page = await host().world_books.entries.list(book.id, { offset, limit: 200, userId });
        persisted.push(...page.data.map((e) => ({ label: e.comment ?? "", content: e.content, order: e.order_value ?? 0 })));
        if (page.data.length === 0 || persisted.length >= page.total) break;
      }
      const readBack = loadRuleset(persisted);
      if (persisted.length !== parts.length || !readBack.ruleset || readBack.issues.some((i) => i.level === "error")
        || JSON.stringify(readBack.ruleset) !== JSON.stringify(checked.ruleset)) throw new Error("The saved rulebook did not match the reviewed draft. Nothing was published.");
      verified = true;
      // Re-read attachments so another card edit made during staging survives.
      const latest = await host().characters.get(characterId, userId);
      if (!latest) throw new Error("Character not found");
      await host().characters.update(characterId, { world_book_ids: [...(latest.world_book_ids ?? []).filter((id) => !replace || id !== replace), book.id] }, userId);
      return book.id;
    } catch (error) {
      const latest = await host().characters.get(characterId, userId).catch(() => null);
      // A response can fail after the host committed the attachment. A verified
      // candidate is already safe in that case; do not delete the active book.
      if (verified && latest?.world_book_ids?.includes(book.id)) return book.id;
      if (latest && !latest.world_book_ids?.includes(book.id) && typeof host().world_books.delete === "function") {
        await host().world_books.delete(book.id, userId).catch((e) => logError("discard staged rulebook", e));
      }
      throw error;
    }
  });
  installs.set(key, result);
  void result.finally(() => { if (installs.get(key) === result) installs.delete(key); }).catch(() => {});
  return result;
}
