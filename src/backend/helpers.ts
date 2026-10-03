// Free-text bookkeeping with an LLM. Used on its own in LLM mode, and as the
// "System 2" fallback for open-ended names (new people, items, places) when a
// System-1 decider says something new appeared. Proposals are always clamped
// by the engine.

import type { GenerationResponseDTO } from "lumiverse-spindle-types";
import type { Proposal } from "../engine/resolve.js";
import type { Ruleset } from "../engine/ruleset.js";
import { formatNumber, itemName, makeEnv, type GameState } from "../engine/state.js";
import { presentPeople } from "../engine/world.js";
import { questDef } from "../engine/quests.js";
import { stateDigest } from "../engine/view.js";
import type { Settings } from "../shared/protocol.js";
import { host, logError } from "./host.js";

export function firstJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

/**
 * One quiet call on the helper connection (or the chat's own). Length comes
 * from the instructions, not a token cap: with no `maxTokens` the
 * connection's own limit applies, so a helper that thinks before it writes
 * isn't cut off mid-sentence.
 */
export async function ask(
  system: string, user: string, settings: Settings, userId: string | undefined, timeoutMs: number,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  return (await askRaw(system, user, settings, userId, timeoutMs, opts)).content;
}

/**
 * Prose the story keeps (a round, a summary), or "" when the reply didn't
 * finish: it ran out of tokens (common when the helper thinks before it
 * writes) or trails off mid-sentence. The caller then uses its scripted line,
 * since a cut passage loses its end — for a round, the other side's move.
 */
export async function askProse(
  system: string, user: string, settings: Settings, userId: string | undefined, timeoutMs: number,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const res = await askRaw(system, user, settings, userId, timeoutMs, opts);
  const text = res.content.trim().replace(/^```\w*|```$/g, "").trim();
  return res.finish === "length" || !finishedProse(text) ? "" : text;
}

/** Ends like a finished sentence: . ! ? … with any closing quotes or emphasis. */
export const finishedProse = (t: string) => /[.!?…]["”’'*_)\]]*$/.test(t.trim());

async function askRaw(
  system: string, user: string, settings: Settings, userId: string | undefined, timeoutMs: number,
  opts: { temperature?: number; maxTokens?: number },
): Promise<{ content: string; finish: string }> {
  const res = (await host().generate.quiet({
    type: "quiet",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    connection_id: settings.helperConnectionId || undefined,
    reasoning: { source: "off" },
    parameters: { temperature: opts.temperature ?? 0.1, ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}) },
    userId,
    signal: AbortSignal.timeout(Math.max(3000, timeoutMs)),
  })) as GenerationResponseDTO | string;
  return typeof res === "string" ? { content: res, finish: "" } : { content: res?.content ?? "", finish: res?.finish_reason ?? "" };
}

function clip(s: string, n: number) {
  return s.length > n ? `…${s.slice(-n)}` : s;
}

// ───────────────────────── extractor ─────────────────────────

export type ExtractPart = "minutes" | "stats" | "rel" | "people" | "items" | "move" | "conditions" | "flags" | "scene" | "used" | "train" | "encounter" | "quests" | "memories";

const sameName = (a: string, b: string) => {
  const x = a.trim().toLowerCase(), y = b.trim().toLowerCase();
  return x === y || x.split(/\s+/)[0] === y.split(/\s+/)[0];
};

export async function extract(
  r: Ruleset, s: GameState, playerText: string, reply: string,
  settings: Settings, userId: string | undefined, only?: Set<ExtractPart>, applied?: string | null,
): Promise<Proposal | null> {
  const judged = judgedQuests(r, s);
  const stats = r.statOrder.map((id) => r.stats[id]).filter((d) => d.narrator > 0);
  const rels = r.relStatOrder.map((id) => r.relStats[id]).filter((d) => d.narrator > 0);
  const conds = Object.values(r.conditions).filter((c) => c.narrator);
  const flags = Object.values(r.flags).filter((f) => f.narrator);
  const locs = Object.values(r.locations);

  const want = (k: ExtractPart) => !only || only.has(k);
  const allowed: string[] = [];
  if (want("minutes") && r.clock.enabled) allowed.push(`- "minutes": how much in-story time the reply covers (0–${r.clock.narratorMax}).`);
  if (want("stats") && stats.length) allowed.push(`- "stats": changes (deltas) to: ${stats.map((d) => `${d.id} (±${formatNumber(d.narrator)})`).join(", ")}`);
  if (want("rel") && rels.length) allowed.push(`- "rel": per person name, deltas to: ${rels.map((d) => `${d.id} (±${formatNumber(d.narrator)})`).join(", ")}`);
  // Starting feelings are absolute values on each stat's scale, read once when someone first appears.
  const feelScale = rels.map((d) => `${d.id} ${d.min}–${d.max}${d.bands.length ? ` (${d.bands.map((b) => `${b.at}=${b.text}`).join(", ")})` : ""}`).join("; ");
  const tracked = Object.values(s.people).map((p) => p.name);
  if (want("people") && r.peopleOpen) {
    allowed.push(`- "people": named characters who appear in the reply (speak, act, or are spoken to) and aren't tracked yet${tracked.length ? ` (already tracked: ${tracked.join(", ")})` : ""}, as [{"name": "...", "feelings": {<how they feel toward the player RIGHT NOW, absolute values>}}]${rels.length ? ` — scales: ${feelScale}` : ""}`);
  }
  if (want("scene") && (tracked.length || r.peopleOpen)) {
    allowed.push(`- "present": names of everyone (tracked or new) physically in the scene with the player at the end of the reply — not people only mentioned, remembered, on the phone, or left behind. Always include it, even as [].`);
  }
  const uncalibrated = Object.keys(s.people).filter((id) => !s.calibrated[id]).map((id) => s.people[id].name);
  if (want("people") && rels.length && uncalibrated.length) {
    allowed.push(`- "feelings": for these tracked people who appear in the reply, where they stand toward the player right now (absolute values, same scales): ${uncalibrated.join(", ")} — as {"Name": {"stat": value}}`);
  }
  if (want("items") && (r.itemsOpen || Object.keys(r.items).length)) allowed.push(`- "items": item name → count gained (+) or lost (−); lost includes used up, eaten, drunk, emptied, broken, given away or taken. Held: ${Object.entries(s.items).map(([id, n]) => `${itemName(r, s, id)}${n > 1 ? ` ×${n}` : ""}`).join(", ") || "nothing"}`);
  const withUses = Object.keys(s.items).filter((id) => (r.items[id]?.uses ?? 0) > 0);
  if (want("used") && withUses.length) allowed.push(`- "used": item name → times used, for items that have uses: ${withUses.map((id) => `${itemName(r, s, id)} (${s.uses[id] ?? r.items[id].uses}/${r.items[id].uses} uses left)`).join(", ")}`);
  const growable = r.growth.enabled && r.growth.train ? r.statOrder.filter((id) => (r.stats[id].kind === "skill" || r.stats[id].kind === "attribute") && r.stats[id].growth > 0) : [];
  if (want("train") && growable.length) allowed.push(`- "trained": ids of abilities the player spent real effort practising, training, studying or rehearsing during the reply: ${growable.join(", ")}`);
  if (want("encounter")) {
    const storyEnc = !s.encounter ? Object.values(r.encounters).filter((x) => x.fromStory) : [];
    if (storyEnc.length) allowed.push(`- "encounter": the id of one of these if it actually broke out in the reply (not just threatened): ${storyEnc.map((x) => `${x.id} (${x.name})`).join(", ")}; with "foe": the opponent's name when it's a specific person`);
    else if (s.encounter) {
      const def = r.encounters[s.encounter.id];
      const outcomes = [...new Set([...Object.keys(def?.outcomes ?? {}), ...(def?.momentum ? [def.momentum.win, def.momentum.lose] : [])]), "broke_off"];
      allowed.push(`- "encounter_end": only if ${def?.name ?? "the encounter"} is clearly over by the end of the reply, how it ended: ${outcomes.join(", ")}`);
    }
  }
  if (want("move") && (locs.length || r.locationsOpen)) allowed.push(`- "move": where the player character ends up, if they moved${locs.length && !r.locationsOpen ? ` (one of: ${locs.map((l) => l.name).join(", ")})` : ""}`);
  if (want("conditions") && conds.length) allowed.push(`- "conditions": {"add": [...], "remove": [...]} from: ${conds.map((c) => c.id).join(", ")}`);
  if (want("flags") && flags.length) allowed.push(`- "flags": set any of: ${flags.map((f) => f.id).join(", ")}`);
  if (want("quests") && (judged.length || (r.storyQuests.enabled && settings.storyQuests))) {
    const open = judged.map((j) => `${j.id} (done: ${j.done}${j.fail ? `; failed: ${j.fail}` : ""})`).join("; ");
    allowed.push(`- "quests": {${r.storyQuests.enabled && settings.storyQuests ? `"new": [{"name": "short title", "giver": "who asked", "goal": "what counts as done", "fail": "what would count as failing (optional)", "stakes": "what's at stake (optional)", "hours": in-game hours until it's due (only if a time was set)}], ` : ""}"done": [ids], "failed": [ids]}${r.storyQuests.enabled && settings.storyQuests ? ` — new: ONLY when someone in the reply asked the player for a specific task or favour (or the player promised one) and it isn't one of these already` : ""}${open ? `; done/failed: only quests the reply clearly finished or failed. Open quests: ${open}` : ""}`);
  }
  if (want("memories") && Object.keys(s.people).length) {
    allowed.push(`- "memories": {"Name": "one line, from their side, of what they'll remember about the player"} — ONLY for moments that will matter to them for a long time (a kindness, a betrayal, a promise made or broken, a humiliation, a first). Usually {}.`);
  }
  if (!allowed.length) return null;

  const system = [
    "You are the bookkeeper for a text roleplay game. You never write story.",
    "Read the narrator's latest reply and record only what CLEARLY happened in it.",
    "Small, sensible deltas for changes. Omit anything unchanged. Do not re-apply dice outcomes that were already applied.",
    "Exception: \"feelings\" (and people.feelings) are where someone stands overall right now — read them from how they act, even if that means strong values.",
    "You may report:",
    ...allowed,
    'Reply with JSON only, e.g. {"minutes": 20, "stats": {"stress": 300}, "rel": {"Robin": {"trust": 3}}}. Use {} if nothing changed.',
  ].join("\n");
  const user = [
    "Current state:",
    stateDigest(r, s),
    "",
    "Player's message:",
    clip(playerText, 1200) || "(none)",
    "",
    "Narrator's reply:",
    clip(reply, 4000),
    ...(applied ? ["", "Already applied by the rules this turn (don't report these again):", applied] : []),
  ].join("\n");

  try {
    const out = firstJson(await ask(system, user, settings, userId, 30000));
    if (!out) return null;
    const p = out as Proposal & { present?: unknown; trained?: unknown; encounter_end?: unknown };
    if (Array.isArray(p.present)) {
      // The full list of who's there: whoever was here and isn't on it has left.
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
    if (typeof p.encounter_end === "string" && p.encounter_end) p.encounterEnd = p.encounter_end;
    delete p.encounter_end;
    return p;
  } catch (e) {
    logError("extractor", e);
    return null;
  }
}

/** Open quests the story decides: story favours, and ruleset quests with a judge:. */
export function judgedQuests(r: Ruleset, s: GameState): { id: string; name: string; done: string; fail?: string }[] {
  const out: { id: string; name: string; done: string; fail?: string }[] = [];
  for (const [id, st] of Object.entries(s.quests ?? {})) {
    if (st.st !== "active") continue;
    const q = questDef(r, s, id);
    if (!q?.judge.done && !q?.judge.fail) continue;
    out.push({ id, name: q.name, done: q.judge.done ?? q.goals.map((g) => g.text).join("; "), ...(q.judge.fail ? { fail: q.judge.fail } : {}) });
  }
  return out;
}
