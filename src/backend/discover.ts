// A world that grows: when exploring finds somewhere new, the helper model invents
// a place that fits the card, the checker's rules shape it, and it's written into
// the character's ruleset lorebook — so it stays on the map for good.

import yaml from "js-yaml";
import type { TurnRecord } from "../engine/resolve.js";
import { slug, type Ruleset } from "../engine/ruleset.js";
import type { GameState } from "../engine/state.js";
import type { Settings } from "../shared/protocol.js";
import { ask, firstJson } from "./helpers.js";
import { host, logError } from "./host.js";
import { characterBrief, invalidateCharacter, type Loaded } from "./source.js";

export interface NewPlace { id: string; name: string; desc: string; indoors: boolean }

/** Invent a place (or null if the helper model can't). */
export async function inventPlace(r: Ruleset, s: GameState, card: string, settings: Settings, userId?: string, timeoutMs = 12000): Promise<NewPlace | null> {
  const from = s.location ? r.locations[s.location] : undefined;
  const places = Object.values(r.locations).map((l) => l.name).join(", ");
  const system = [
    "You add one new place to the map of a roleplay game. Reply with JSON only:",
    '{"name": "Short place name", "desc": "One or two vivid sentences about what it is and what you might find there.", "indoors": true|false}',
    "It must fit the setting and tone, be reachable from where the player is exploring, and not duplicate an existing place.",
    r.discovery.guide ? `Guidance: ${r.discovery.guide}` : "",
  ].filter(Boolean).join("\n");
  const user = [
    card ? `The card:\n${card}` : "",
    `Existing places: ${places || "(none)"}`,
    `The player is exploring around: ${from?.name ?? s.locationName ?? "here"}${from?.desc ? ` — ${from.desc}` : ""}`,
  ].filter(Boolean).join("\n\n");
  try {
    const out = firstJson(await ask(system, user, settings, userId, timeoutMs, { temperature: 0.9, maxTokens: 300 }));
    const name = typeof out?.name === "string" ? out.name.trim().slice(0, 60) : "";
    if (!name) return null;
    let id = slug(name);
    for (let n = 2; r.locations[id]; n++) id = `${slug(name)}_${n}`;
    return { id, name, desc: typeof out?.desc === "string" ? out.desc.trim().slice(0, 400) : "", indoors: out?.indoors === true };
  } catch (e) {
    logError("invent place", e);
    return null;
  }
}

/** The lorebook YAML for a discovered place: the place itself, and an exit each way. */
export function placeYaml(from: string, p: NewPlace): string {
  return yaml.dump({ locations: { [from]: { exits: [p.id] }, [p.id]: { name: p.name, desc: p.desc, indoors: p.indoors, exits: [from] } } }, { lineWidth: 120 });
}

/** Called while a turn resolves: invent, save and step into the new place (events and directions go on the record). */
export async function discoverPlace(loaded: Loaded, r: Ruleset, before: GameState, rec: TurnRecord, chatId: string, settings: Settings, userId?: string): Promise<void> {
  if (!rec.discover) return;
  const card = await characterBrief(chatId, userId).catch(() => "");
  const p = await inventPlace(r, before, card, settings, userId);
  if (!p) {
    rec.hints.push("{{user}} explores but finds nothing new this time.");
    return;
  }
  const from = rec.discover.from;
  const origin = r.locations[from];
  rec.locations = {
    ...(origin ? { [from]: { ...origin, exits: [...new Set([...origin.exits, p.id])] } } : {}),
    [p.id]: { id: p.id, name: p.name, desc: p.desc, indoors: p.indoors, exits: [from], travel: r.discovery.time },
  };
  r.locations = { ...r.locations, ...rec.locations };
  const book = loaded.bookIds[0];
  if (book) {
    try {
      await host().world_books.entries.create(book, {
        comment: `warp-ruleset · discovered · ${p.name}`,
        content: placeYaml(rec.discover.from, p),
        key: [], disabled: true, constant: false, order_value: 900,
      }, userId);
      invalidateCharacter(loaded.characterId);
    } catch (e) {
      logError("save discovered place", e);
    }
  }
  rec.events.push(
    { t: "move", to: p.id, name: p.name, src: "action", why: "Exploring found somewhere new" },
    { t: "discovered", id: p.id, src: "action" },
    { t: "news", text: `Discovered ${p.name}.`, src: "action" },
  );
  rec.hints.push(`{{user}} discovers somewhere new: ${p.name}${p.indoors ? " (indoors)" : ""} — ${p.desc} Describe finding it and arriving for the first time.`);
}
