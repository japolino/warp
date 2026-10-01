// Choices written for the moment ("live choices").
//
// A writer model phrases each option, but it has to tag it from the ruleset's
// fixed list — and the tag, not the model, decides the check and the effects.
// With a decision model, the model first weighs which kinds of move fit the
// moment and the writer only phrases them.

import type { Decider } from "../engine/decide.js";
import { evalBool } from "../engine/expr.js";
import { findAction, type LiveChoice } from "../engine/resolve.js";
import { presentPeople } from "../engine/world.js";
import type { ActionDef, Ruleset } from "../engine/ruleset.js";
import { makeEnv, type GameState } from "../engine/state.js";
import { stateDigest } from "../engine/view.js";
import type { Settings } from "../shared/protocol.js";
import { ask, firstJson } from "./helpers.js";
import { logError } from "./host.js";

function clip(s: string, n: number) {
  return s.length > n ? `…${s.slice(-n)}` : s;
}

/** Tags the writer may use right now (content lines removed). */
export function usableTags(r: Ruleset, settings: Pick<Settings, "lines">, s?: GameState): ActionDef[] {
  const blocked = new Set(settings.lines.map((l) => l.toLowerCase()));
  return Object.values(r.liveChoices.tags).filter((a) => !a.hidden && !a.tags.some((t) => blocked.has(t)) && (!s || (a.perPerson
    ? presentPeople(r, s, makeEnv(r, s)).some((id) => !!findAction(r, s, `live:${a.id}@${id}`))
    : !!findAction(r, s, `live:${a.id}`))));
}

/** Writers often decorate tags ("bold move", "Kind"): match exactly, then loosely. */
export function repairTag(tags: ActionDef[], raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const k = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const exact = tags.find((a) => a.id.toLowerCase() === k || a.label.toLowerCase() === raw.trim().toLowerCase());
  if (exact) return exact.id;
  const loose = tags.find((a) => k.startsWith(a.id.toLowerCase()) || a.id.toLowerCase().startsWith(k));
  return loose?.id ?? null;
}

/** A person the choice is aimed at, by name (full or first name) among tracked people. */
function personId(s: GameState, name: unknown): string | null {
  if (typeof name !== "string" || !name.trim()) return null;
  const n = name.trim().toLowerCase();
  const exact = Object.entries(s.people).filter(([id, p]) => id === n || p.name.toLowerCase() === n);
  if (exact.length) return exact.length === 1 ? exact[0][0] : null;
  const first = Object.entries(s.people).filter(([, p]) => p.name.toLowerCase().split(" ")[0] === n);
  return first.length === 1 ? first[0][0] : null;
}

/** Validate what the writer returned against the tag list and the people in the story. */
export function cleanChoices(r: Ruleset, s: GameState, tags: ActionDef[], raw: unknown, count: number): LiveChoice[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: LiveChoice[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim().replace(/^[*"']+|[*"']+$/g, "").slice(0, 90) : "";
    const tag = repairTag(tags, o.tag);
    if (!label || !tag || seen.has(label.toLowerCase())) continue;
    const a = r.liveChoices.tags[tag];
    const target = personId(s, o.target);
    if (a.perPerson && !target) continue;
    if (!findAction(r, s, `live:${tag}${a.perPerson ? `@${target}` : ""}`)) continue;
    seen.add(label.toLowerCase());
    out.push({ label, tag, ...(a.perPerson && target ? { target } : {}) });
    if (out.length >= count) break;
  }
  return out;
}

/** With a decision model: which kinds of move fit this moment best, by its odds. */
async function pickTags(decider: Decider, r: Ruleset, s: GameState, tags: ActionDef[], reply: string, player: string): Promise<string[] | null> {
  if (decider.id !== "jev" || tags.length <= 1) return null;
  const ans = await decider.ask(
    { game_state: stateDigest(r, s), narrator_reply: clip(reply, 4000) },
    {
      kinds: {
        type: "choice",
        instructions: `Right after this reply, which kind of move would be most natural and interesting for ${player} to make next?`,
        criteria: Object.fromEntries(tags.map((a) => [a.id, a.desc ?? a.label])),
      },
    },
  );
  const a = ans.kinds;
  if (a?.type !== "choice") return null;
  const ranked = Object.entries(a.probabilities).filter(([id]) => r.liveChoices.tags[id]).sort((x, y) => y[1] - x[1]);
  const picked = ranked.filter(([, p]) => p >= 0.04).slice(0, r.liveChoices.count).map(([id]) => id);
  return picked.length ? picked : ranked.slice(0, 1).map(([id]) => id);
}

export async function writeLiveChoices(opts: {
  r: Ruleset; s: GameState; reply: string; player: string;
  settings: Settings; userId?: string; decider: Decider;
}): Promise<LiveChoice[]> {
  const { r, s, settings } = opts;
  const lc = r.liveChoices;
  if (!lc.enabled || s.encounter || s.dungeon) return [];
  if (lc.when && !evalBool(lc.when, makeEnv(r, s), true)) return [];
  const tags = usableTags(r, settings, s);
  if (!tags.length) return [];

  let wanted: string[] | null = null;
  try { wanted = await pickTags(opts.decider, r, s, tags, opts.reply, opts.player); } catch (e) { logError("live choice kinds", e); }
  const count = wanted?.length ?? lc.count;
  const people = presentPeople(r, s, makeEnv(r, s)).map((id) => s.people[id].name);
  const tagLines = tags.map((a) => `- ${a.id}: ${a.desc ?? a.label}${a.perPerson ? ` (also give "target": the name of the person it's aimed at${people.length ? ` — one of ${people.join(", ")}` : ""})` : ""}`);
  const system = [
    "You write the clickable choices for a text roleplay game. You never write story.",
    `Write ${count} short options for what ${opts.player} could do right now, given the narrator's latest reply.`,
    `Each is 3–10 words, phrased as an action ${opts.player} takes (e.g. "Ask Jo about the letter", "Slip out the back door").`,
    "Make them specific to this moment and different from each other. Never decide how they turn out.",
    wanted ? `Write exactly one option for each of these tags, in this order: ${wanted.join(", ")}. The tags:` : "Tag each option with the kind of move it is, from this list only:",
    ...tagLines,
    ...(lc.guide ? [`Author's note: ${lc.guide}`] : []),
    'Reply with JSON only: {"choices": [{"label": "...", "tag": "...", "target": "..."}]}',
  ].join("\n");
  const user = ["Current state:", stateDigest(r, s), "", "Narrator's latest reply:", clip(opts.reply, 4000)].join("\n");
  try {
    const out = firstJson(await ask(system, user, settings, opts.userId, 25000, { temperature: 0.8 }));
    return cleanChoices(r, s, tags, out?.choices, count);
  } catch (e) {
    logError("live choices", e);
    return [];
  }
}
