// Dating that fits the card. The built-in topics and outings are modern (films,
// arcades, a café); on a medieval or sci-fi card they jar. Once per card, the
// helper model rewrites them for the setting — names, the player's lines, what
// can't exist removed, a few that fit added — keeping categories, stages and
// hidden tastes as they are. Saved as an editable "warp-ruleset · dating flavour"
// entry that merges over the defaults; anything the author wrote wins.

import jsyaml from "js-yaml";
import { loadRuleset } from "../engine/loader.js";
import type { Ruleset } from "../engine/ruleset.js";
import { DEFAULT_TOPICS, DEFAULT_VENUES } from "../engine/date/content.js";
import { ask } from "./helpers.js";
import { host, logError } from "./host.js";
import { getSettings } from "./settings.js";
import { characterBrief, getRuleset, invalidateCharacter } from "./source.js";
import { currentParts, extractYaml, rulesetEntries } from "./builder.js";

export const FLAVOUR_LABEL = "dating flavour";

/** How many built-in topics and venues are still in their default wording. */
export function defaultsInUse(r: Ruleset): { topics: string[]; venues: string[] } {
  if (!r.dating.enabled) return { topics: [], venues: [] };
  const topics = Object.values(r.dating.topics).filter((t) => DEFAULT_TOPICS[t.id] && DEFAULT_TOPICS[t.id].label === t.label).map((t) => t.id);
  const venues = Object.values(r.dating.venues).filter((v) => DEFAULT_VENUES[v.id] && DEFAULT_VENUES[v.id].name === v.name).map((v) => v.id);
  return { topics, venues };
}

const SYSTEM = [
  "You adapt a dating mini-game's conversation topics and outings to the setting of a roleplay card.",
  "The defaults are modern (films, games, a café, an arcade). Rewrite them so they belong in THIS setting and era.",
  "For each topic: keep its id; give a label that fits, and a `say` — the player's line in first person, wrapped in *asterisks*, that brings it up (use {{target}} for the other person's name).",
  "Remove topics or outings that can't exist in the setting (`id: false`) and add up to 5 new ones that fit (new snake_case ids, same categories: small_talk, interests, personal, charm, romance).",
  "For each outing (venue): keep or replace it; give name, desc, cost (in the game's money), 3–4 activities (id: { label, tags: [...] }, romance ones romantic: true) and 2–3 events (id: { text, enjoy: -10..10 }).",
  "Keep tags plain words (food, music, nature, thrill, calm, luxury, romance, humor, conversation…): people's hidden tastes are matched on them.",
  "Romance only between adults. Reply with YAML only, in this shape:",
  "fits_already: false   # true if the defaults already suit this setting (then nothing else)",
  "dating:",
  "  topics: { books_films: { label: Tales and songs, say: \"*I ask {{target}} which ballads they know.*\" }, games: { label: Dice and chess }, fashion: false, swordplay: { label: Swordplay, category: interests } }",
  "  venues: { cinema: false, fair: { name: The harvest fair, desc: ..., cost: 5, activities: {...}, events: {...} } }",
].join("\n");

/**
 * Re-theme the built-in dating content for this card. Returns what changed (topic and venue
 * counts), or null when there was nothing to do or the draft didn't check out.
 */
export async function themeDating(chatId: string, userId?: string, force = false): Promise<{ topics: number; venues: number } | null> {
  const loaded = await getRuleset(chatId, userId, true);
  const r = loaded?.ruleset;
  if (!r || !loaded?.characterId || !r.dating.enabled) return null;
  const { entries, rulesetBook } = await rulesetEntries(loaded.characterId, userId);
  const existing = entries.find((e) => e.label === FLAVOUR_LABEL);
  if (existing && !force) return null;
  const used = defaultsInUse(r);
  if (!force && used.topics.length < 6 && used.venues.length < 2) return null;
  const settings = await getSettings(userId);
  const card = await characterBrief(chatId, userId);
  const topics = Object.values(r.dating.topics).filter((t) => DEFAULT_TOPICS[t.id]).map((t) => `- ${t.id} (${t.category}): ${t.label}${t.desc ? ` — ${t.desc}` : ""}`);
  const venues = Object.values(r.dating.venues).filter((v) => DEFAULT_VENUES[v.id]).map((v) => `- ${v.id}: ${v.name} — ${v.desc ?? ""} (cost ${v.cost}; activities: ${v.activities.map((a) => a.label).join(", ")})`);
  const money = r.statOrder.find((id) => r.stats[id].kind === "money");
  const text = await ask(SYSTEM, [
    `The card:\n${card.slice(0, 4000)}`,
    `The game: ${r.name}${r.description ? ` — ${r.description}` : ""}. Places: ${Object.values(r.locations).map((l) => l.name).join(", ") || "unknown"}.${money ? ` Money: ${r.stats[money].label}.` : ""}`,
    `Default topics:\n${topics.join("\n")}`,
    `Default outings:\n${venues.join("\n")}`,
  ].join("\n\n"), settings, userId, 60000, { temperature: 0.6, maxTokens: 3500 });
  let doc: { fits_already?: unknown; dating?: { topics?: Record<string, unknown>; venues?: Record<string, unknown> } } | null;
  try { doc = jsyaml.load(extractYaml(text)) as typeof doc; } catch (e) { logError("dating flavour", e); return null; }
  if (!doc || doc.fits_already === true) {
    // Fits as it is: leave a note so it isn't asked again.
    if (doc?.fits_already === true && !existing) await writeEntry(loaded.characterId, rulesetBook ?? loaded.bookIds[0], null, "# The built-in dating topics already fit this card.\n", userId);
    return null;
  }
  const dt = doc.dating ?? {};
  const clean = {
    ...(dt.topics && typeof dt.topics === "object" ? { topics: dt.topics } : {}),
    ...(dt.venues && typeof dt.venues === "object" ? { venues: dt.venues } : {}),
  };
  if (!Object.keys(clean).length) return null;
  const body = `# Dating re-themed for this card by Warp. Edit or delete freely — your own dating: section wins.\n${jsyaml.dump({ dating: clean }, { lineWidth: 160 })}`;
  // It must load next to the real rules, with no errors in dating.
  const parts = (await currentParts(loaded.characterId, userId)).filter((p) => p.label !== FLAVOUR_LABEL);
  const probe = loadRuleset([...parts.map((p, i) => ({ label: `warp-ruleset · ${p.label}`, content: p.yaml, order: i })), { label: `warp-ruleset · ${FLAVOUR_LABEL}`, content: body, order: 5 }]);
  if (!probe.ruleset || probe.issues.some((i) => i.level === "error") || !probe.ruleset.dating.topicOrder.length) return null;
  // The author's own dating section must still win: put the flavour first (deep-merged in order).
  await writeEntry(loaded.characterId, rulesetBook ?? loaded.bookIds[0], existing?.id ?? null, body, userId);
  invalidateCharacter(loaded.characterId);
  return { topics: Object.keys(clean.topics ?? {}).length, venues: Object.keys(clean.venues ?? {}).length };
}

async function writeEntry(characterId: string, bookId: string | undefined, id: string | null, content: string, userId?: string) {
  if (id) { await host().world_books.entries.update(id, { content, disabled: true }, userId); return; }
  if (!bookId) return;
  // Order 5: merged before the author's sections, so anything they wrote overrides it.
  await host().world_books.entries.create(bookId, { comment: `warp-ruleset · ${FLAVOUR_LABEL}`, content, key: [], disabled: true, constant: false, order_value: 5 }, userId);
  void characterId;
}
