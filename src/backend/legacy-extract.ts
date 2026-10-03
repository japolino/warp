// TEST-ONLY. The old free-text bookkeeper (`extract()`), kept so QA's simulator can compare the helper's
// accuracy on typed answers (questions.ts + write.ts) against it on the same scripts. No production code imports
// this file; QA decides whether to delete it (IMPLEMENTATION-SPEC, decisions on JEV-ROUTING open points).
// Changes from legacy: encounters and quests are gone (contests and goals are read by the typed questions),
// and a move is reported as `place` (words).

import type { Proposal } from "../engine/resolve.js";
import type { Ruleset } from "../engine/ruleset.js";
import { formatNumber, itemName, makeEnv, type GameState } from "../engine/state.js";
import { presentPeople } from "../engine/world.js";
import { stateDigest } from "../engine/view.js";
import type { Settings } from "../shared/protocol.js";
import { ask, firstJson } from "./helpers.js";
import { logError } from "./host.js";

function clip(s: string, n: number) {
  return s.length > n ? `…${s.slice(-n)}` : s;
}

const sameName = (a: string, b: string) => {
  const x = a.trim().toLowerCase(), y = b.trim().toLowerCase();
  return x === y || x.split(/\s+/)[0] === y.split(/\s+/)[0];
};

/** The legacy prompt (pure), so a comparison harness can run it through any model. */
export function legacyExtractPrompt(r: Ruleset, s: GameState, playerText: string, reply: string, applied?: string | null): { system: string; user: string } | null {
  const stats = r.statOrder.map((id) => r.stats[id]).filter((d) => d.narrator > 0);
  const rels = r.relStatOrder.map((id) => r.relStats[id]).filter((d) => d.narrator > 0);
  const conds = Object.values(r.conditions).filter((c) => c.narrator);
  const flags = Object.values(r.flags).filter((f) => f.narrator);
  const allowed: string[] = [];
  if (r.clock.enabled) allowed.push(`- "minutes": how much in-story time the reply covers (0–${r.clock.narratorMax}).`);
  if (stats.length) allowed.push(`- "stats": changes (deltas) to: ${stats.map((d) => `${d.id} (±${formatNumber(d.narrator)})`).join(", ")}`);
  if (rels.length) allowed.push(`- "rel": per person name, deltas to: ${rels.map((d) => `${d.id} (±${formatNumber(d.narrator)})`).join(", ")}`);
  const feelScale = rels.map((d) => `${d.id} ${d.min}–${d.max}${d.bands.length ? ` (${d.bands.map((b) => `${b.at}=${b.text}`).join(", ")})` : ""}`).join("; ");
  const tracked = Object.values(s.people).map((p) => p.name);
  if (r.peopleOpen) allowed.push(`- "people": named characters who appear in the reply and aren't tracked yet${tracked.length ? ` (already tracked: ${tracked.join(", ")})` : ""}, as [{"name": "...", "feelings": {<how they feel toward the player RIGHT NOW>}}]${rels.length ? ` — scales: ${feelScale}` : ""}`);
  if (tracked.length || r.peopleOpen) allowed.push(`- "present": names of everyone physically in the scene with the player at the end of the reply. Always include it, even as [].`);
  const uncalibrated = Object.keys(s.people).filter((id) => !s.calibrated[id]).map((id) => s.people[id].name);
  if (rels.length && uncalibrated.length) allowed.push(`- "feelings": for these tracked people who appear in the reply, where they stand toward the player right now: ${uncalibrated.join(", ")} — as {"Name": {"stat": value}}`);
  if (r.itemsOpen || Object.keys(r.items).length) allowed.push(`- "items": item name → count gained (+) or lost (−). Held: ${Object.entries(s.items).map(([id, n]) => `${itemName(r, s, id)}${n > 1 ? ` ×${n}` : ""}`).join(", ") || "nothing"}`);
  const withUses = Object.keys(s.items).filter((id) => (r.items[id]?.uses ?? 0) > 0);
  if (withUses.length) allowed.push(`- "used": item name → times used: ${withUses.map((id) => `${itemName(r, s, id)} (${s.uses[id] ?? r.items[id].uses}/${r.items[id].uses} uses left)`).join(", ")}`);
  const growable = r.growth.enabled && r.growth.train ? r.statOrder.filter((id) => (r.stats[id].kind === "skill" || r.stats[id].kind === "attribute") && r.stats[id].growth > 0) : [];
  if (growable.length) allowed.push(`- "trained": ids of abilities the player practised during the reply: ${growable.join(", ")}`);
  allowed.push(`- "place": where the player character ends up, if they moved`);
  if (conds.length) allowed.push(`- "conditions": {"add": [...], "remove": [...]} from: ${conds.map((c) => c.id).join(", ")}`);
  if (flags.length) allowed.push(`- "flags": set any of: ${flags.map((f) => f.id).join(", ")}`);
  if (Object.keys(s.people).length) allowed.push(`- "memories": {"Name": "one line of what they'll remember about the player"} — only for moments that will matter for a long time. Usually {}.`);
  const system = [
    "You are the bookkeeper for a text roleplay game. You never write story.",
    "Read the narrator's latest reply and record only what CLEARLY happened in it.",
    "Small, sensible deltas for changes. Omit anything unchanged. Do not re-apply dice outcomes that were already applied.",
    "You may report:",
    ...allowed,
    'Reply with JSON only. Use {} if nothing changed.',
  ].join("\n");
  const user = [
    "Current state:", stateDigest(r, s), "",
    "Player's message:", clip(playerText, 1200) || "(none)", "",
    "Narrator's reply:", clip(reply, 4000),
    ...(applied ? ["", "Already applied by the rules this turn (don't report these again):", applied] : []),
  ].join("\n");
  return { system, user };
}

/** The legacy reply → Proposal reading. */
export function legacyExtractParse(r: Ruleset, s: GameState, out: Record<string, unknown> | null): Proposal | null {
  if (!out) return null;
  const p = { ...out } as Proposal & { present?: unknown; trained?: unknown };
  if (Array.isArray(p.present)) {
    const listed = p.present.map(String).filter(Boolean);
    const scene: Record<string, boolean> = Object.fromEntries(listed.map((n) => [n, true]));
    for (const id of presentPeople(r, s, makeEnv(r, s))) {
      const name = s.people[id]?.name;
      if (name && !listed.some((l) => sameName(l, name))) scene[id] = false;
    }
    p.scene = scene;
  }
  delete p.present;
  if (Array.isArray(p.trained)) p.train = p.trained.map(String);
  delete p.trained;
  return p;
}

/** One legacy extraction call (for the comparison harness only). */
export async function legacyExtract(r: Ruleset, s: GameState, playerText: string, reply: string, settings: Settings, userId?: string, applied?: string | null): Promise<Proposal | null> {
  const prompt = legacyExtractPrompt(r, s, playerText, reply, applied);
  if (!prompt) return null;
  try {
    return legacyExtractParse(r, s, firstJson(await ask(prompt.system, prompt.user, settings, userId, 30000)));
  } catch (e) {
    logError("legacy extractor", e);
    return null;
  }
}
