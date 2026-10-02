// A world that grows: when exploring finds somewhere new, the helper model invents
// a place that fits the card, the checker's rules shape it, and it's written into
// the character's ruleset lorebook — so it stays on the map for good.

import yaml from "js-yaml";
import type { TurnRecord } from "../engine/resolve.js";
import { loadRuleset } from "../engine/loader.js";
import { lintRuleset } from "../engine/lint.js";
import { slug, type Ruleset } from "../engine/ruleset.js";
import type { GameState } from "../engine/state.js";
import type { Settings } from "../shared/protocol.js";
import { ask } from "./helpers.js";
import { host, logError, toast } from "./host.js";
import { acceptAdditiveRules } from "./ledger.js";
import { characterBrief, getRuleset, invalidateCharacter, type Loaded } from "./source.js";

/** A generated inhabitant: name and description only. No age is ever taken from the model. */
export interface NewResident { id: string; name: string; desc: string }
export interface NewPlace { id: string; name: string; desc: string; indoors: boolean; opportunity?: { label: string; hint: string }; resident?: NewResident }

const opportunityId = (p: NewPlace) => `discover_${p.id}_inspect`;

/**
 * Whether a resident can be written under `relationships.people` without hiding base people.
 * The undocumented top-level `people:` alias is ignored once any `relationships:` map exists, so a
 * resident is only added when the base provably uses `relationships:` (it has relationship stats)
 * or has no people to lose.
 */
export function residentSafe(r: Ruleset): boolean {
  return r.relStatOrder.length > 0 || Object.keys(r.people).length === 0;
}

const RESIDENT_NAME_MAX = 40, RESIDENT_DESC_MAX = 240;

/** Invent a place (or null if the helper model can't). */
export async function inventPlace(r: Ruleset, s: GameState, card: string, settings: Settings, userId?: string, timeoutMs = 12000): Promise<NewPlace | null> {
  const from = s.location ? r.locations[s.location] : undefined;
  const places = Object.values(r.locations).map((l) => l.name).join(", ");
  const withResident = r.discovery.people && residentSafe(r);
  const residentKey = withResident ? ', "resident": {"name": "Resident name", "desc": "One short sentence about who they are."}' : "";
  const system = [
    "You add one new place to the map of a roleplay game. Reply with JSON only:",
    `{"name": "Short place name", "desc": "One or two vivid sentences.", "indoors": true|false, "opportunity": {"label": "Short safe local action", "hint": "What inspecting this place reveals without rewards or state changes."}${residentKey}}`,
    "Use exactly these keys. Limits: name 60, desc 400, label 60, hint 240 characters. Opportunity must be a safe, repeatable observation here, not combat, a reward, a secret reveal, or a mechanical change.",
    withResident ? `The resident is one ordinary person who lives or works here, not anyone already known. Give only "name" (${RESIDENT_NAME_MAX} characters) and "desc" (${RESIDENT_DESC_MAX} characters). Do not state or imply an age, stats, secrets, or relationships.` : "",
    "It must fit the setting and tone, be reachable from where the player is exploring, and not duplicate an existing place.",
    r.discovery.guide ? `Guidance: ${r.discovery.guide}` : "",
  ].filter(Boolean).join("\n");
  const user = [
    card ? `The card:\n${card}` : "",
    `Existing places: ${places || "(none)"}`,
    `The player is exploring around: ${from?.name ?? s.locationName ?? "here"}${from?.desc ? ` — ${from.desc}` : ""}`,
  ].filter(Boolean).join("\n\n");
  try {
    const text = await ask(system, user, settings, userId, timeoutMs, { temperature: 0.9, maxTokens: withResident ? 650 : 500 });
    const out: unknown = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
    const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
    const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).length === expected.length && expected.every((k) => Object.hasOwn(v, k));
    const bounded = (v: unknown, max: number): v is string => typeof v === "string" && !!v.trim() && v.length <= max && !hasMacro(v);
    // The resident key is optional and only allowed when enabled; any other extra key rejects the place.
    const placeKeys = ["name", "desc", "indoors", "opportunity", ...(withResident && obj(out) && Object.hasOwn(out, "resident") ? ["resident"] : [])];
    if (!obj(out) || !keys(out, placeKeys)
      || !bounded(out.name, 60) || !bounded(out.desc, 400) || typeof out.indoors !== "boolean"
      || !obj(out.opportunity) || !keys(out.opportunity, ["label", "hint"])
      || !bounded(out.opportunity.label, 60) || !bounded(out.opportunity.hint, 240)) return null;
    const name = out.name.trim();
    if (Object.values(r.locations).some((l) => l.name.trim().toLowerCase() === name.toLowerCase())) return null;
    const base = slug(name);
    if (!base) return null;
    let id = base;
    for (let n = 2; r.locations[id] || r.actions[`discover_${id}_inspect`]; n++) id = `${base}_${n}`;
    const resident = withResident ? residentFrom(r, s, out.resident) : undefined;
    return { id, name, desc: out.desc.trim(), indoors: out.indoors,
      opportunity: { label: out.opportunity.label.trim(), hint: out.opportunity.hint.trim() },
      ...(resident ? { resident } : {}) };
  } catch (e) {
    logError("invent place", e);
    return null;
  }
}

/**
 * A strict resident: exactly `name` and `desc`, bounded, a fresh name, and an id that cannot collide
 * with any declared, met, forgotten, companion, bond or kin id. Anything else drops only the resident.
 */
const RESERVED_IDS = new Set(["player", "you", "user", "target", "char", "x", "anyone", "other"]);
/** Host macros in generated text would be expanded by the host; reject them. */
const hasMacro = (x: string) => /\{\{|\}\}/.test(x);

export function residentFrom(r: Ruleset, s: GameState, raw: unknown): NewResident | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const v = raw as Record<string, unknown>;
  if (Object.keys(v).length !== 2 || !Object.hasOwn(v, "name") || !Object.hasOwn(v, "desc")) return undefined;
  const ok = (x: unknown, max: number): x is string => typeof x === "string" && !!x.trim() && x.length <= max && !hasMacro(x);
  if (!ok(v.name, RESIDENT_NAME_MAX) || !ok(v.desc, RESIDENT_DESC_MAX)) return undefined;
  const name = v.name.trim(), lower = name.toLowerCase();
  const names = [...Object.values(r.people).map((p) => p.name), ...Object.values(s.people).map((p) => p.name), ...Object.values(s.kin).map((k) => k.name)];
  if (names.some((n) => n.trim().toLowerCase() === lower)) return undefined;
  if (!/[\p{L}\p{N}]/u.test(name)) return undefined;
  // slug() falls back to "x" for names with no Latin letters or digits; use a readable base instead.
  const base = slug(name) === "x" && lower !== "x" ? "resident" : slug(name);
  // Engine sentinels: "player"/"you" mean {{user}} in lineage and dungeons; never hand them to a generated person.
  const taken = (id: string) => RESERVED_IDS.has(id) || !!(r.people[id] || s.people[id] || s.forgotten[id] || s.kin[id] || r.companions[id] || r.bonds[id] || s.rel[id]);
  let id = base;
  for (let n = 2; taken(id); n++) id = `${base}_${n}`;
  return { id, name, desc: v.desc.trim() };
}

/** Additive lorebook YAML: a place, both exits, one local no-roll observation, and an optional resident. */
export function placeYaml(from: string, p: NewPlace): string {
  const opportunity = p.opportunity ?? { label: `Inspect ${p.name}`.slice(0, 60), hint: p.desc || `Take a closer look around ${p.name}.` };
  return yaml.dump({
    locations: { [from]: { exits: [p.id] }, [p.id]: { name: p.name, desc: p.desc, indoors: p.indoors, exits: [from] } },
    actions: { [opportunityId(p)]: { label: opportunity.label, desc: opportunity.hint, at: [p.id], time: 0, effects: { hint: opportunity.hint } } },
    // No `age`: romance needs a known adult, so it stays blocked until the story establishes one.
    ...(p.resident ? { relationships: { people: { [p.resident.id]: { name: p.resident.name, desc: p.resident.desc, schedule: [{ at: p.id }] } } } } : {}),
  }, { lineWidth: 120 });
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
  const book = loaded.bookIds[0];
  try {
    if (!book) throw new Error("No rulebook is available for the new location");
    const content = placeYaml(rec.discover.from, p);
    const checked = loadRuleset([{ label: "warp-ruleset · discovered", content, order: 900 }]);
    if (!checked.ruleset || [...checked.issues, ...lintRuleset(checked.ruleset)].some((i) => i.level === "error")) {
      throw new Error("Discovered opportunity failed rulebook validation");
    }
    await host().world_books.entries.create(book, {
        comment: `warp-ruleset · discovered · ${p.name}`,
        content,
        key: [], disabled: true, constant: false, order_value: 900,
      }, userId);
    invalidateCharacter(loaded.characterId);
    const next = (await getRuleset(chatId, userId, true))?.ruleset;
    if (!next?.locations[p.id] || !next.actions[opportunityId(p)]) throw new Error("Saved discovery was not loaded");
    if (p.resident) {
      const who = next.people[p.resident.id];
      if (!who || who.age !== undefined || who.schedule[0]?.at !== p.id) throw new Error("Saved resident was not loaded");
      if (Object.keys(r.people).some((id) => !next.people[id])) throw new Error("Saved resident hid existing people");
    }
    await acceptAdditiveRules(chatId, r, next);
  } catch (e) {
    logError("save discovered place", e);
    rec.hints.push("{{user}} explores, but does not enter a new place this turn. The map could not be saved.");
    toast("warning", "The new place couldn't be saved. You're still where you were; try exploring again.", userId);
    return;
  }
  rec.events.push(
    { t: "move", to: p.id, name: p.name, src: "action", why: "Exploring found somewhere new" },
    { t: "discovered", id: p.id, src: "action" },
    ...(p.resident ? [{ t: "person" as const, id: p.resident.id, name: p.resident.name, src: "action" as const }] : []),
    { t: "news", text: `Discovered ${p.name}.`, src: "action" },
  );
  rec.hints.push(`{{user}} discovers somewhere new: ${p.name}${p.indoors ? " (indoors)" : ""} — ${p.desc} Describe finding it and arriving for the first time.`);
  if (p.resident) rec.hints.push(`${p.resident.name} is here: ${p.resident.desc} Their age has not been established.`);
}
