import { loreAccess } from "../engine/knowledge.js";
import { isRulesetEntryTitle } from "../engine/loader.js";
import { foldPath, getMessages } from "./ledger.js";
import { getRuleset, knownRulesetBookIds, knownRulesetEntryIds } from "./source.js";
import { logError } from "./host.js";

/** Load definitions before classifying entries, including the first prompt in a chat. */
export async function worldInfoPolicy(ctx: { chatId: string; userId?: string; entries: readonly { id: string; world_book_id: string; comment?: string | null }[] }) {
  const disabled = new Set<string>(), forced = new Set<string>();
  try {
    const loaded = await getRuleset(ctx.chatId, ctx.userId);
    const fold = loaded?.ruleset ? foldPath(loaded.ruleset, await getMessages(ctx.chatId)) : null;
    for (const e of ctx.entries) {
      if (knownRulesetEntryIds.has(e.id) || knownRulesetBookIds.has(e.world_book_id) || isRulesetEntryTitle(e.comment)) { disabled.add(e.id); continue; }
      // If a known ruleset cannot be loaded, allow no lore until its gate policy is known.
      if (!loaded || (loaded.source && !fold)) { disabled.add(e.id); continue; }
      const access = fold ? loreAccess(fold.ruleset, fold.state, e.comment ?? "") : { gated: false, open: true };
      if (!access.open) disabled.add(e.id); else if (access.gated) forced.add(e.id);
    }
  } catch (e) {
    logError("lore gate", e);
    ctx.entries.forEach((entry) => disabled.add(entry.id));
  }
  return disabled.size || forced.size ? { ...(disabled.size ? { disabled: [...disabled] } : {}), ...(forced.size ? { forced: [...forced].filter((id) => !disabled.has(id)) } : {}) } : undefined;
}
