// Choices written for the moment ("live choices").
//
// The writer phrases each option, but it must tag it from the ruleset's fixed list, and the tag (not the
// writer) decides the check and the effects. Each choice carries a difficulty word, so the odds follow the
// words; in a contest the choices are moves (`contest:<stat>`) on the contest's own target.

import { evalBool } from "../engine/expr.js";
import { findAction, type LiveChoice } from "../engine/resolve.js";
import { presentPeople } from "../engine/world.js";
import { DIFFICULTY_WORDS, type ActionDef, type DifficultyWord, type Ruleset } from "../engine/ruleset.js";
import { makeEnv, type GameState } from "../engine/state.js";
import { adultGated, isAdult } from "../engine/adults.js";
import { CONTEST_PREFIX } from "../engine/contest.js";
import { recentTags } from "../engine/people.js";
import type { Settings } from "../shared/protocol.js";

/** Are choices written for this moment at all (the ruleset has them, its `when:` holds)? */
export function liveWanted(r: Ruleset, s: GameState): boolean {
  const lc = r.liveChoices;
  if (s.contest) return true;
  if (!lc.enabled) return false;
  return !lc.when || evalBool(lc.when, makeEnv(r, s), true);
}

/** How many choices to write: the ruleset's count, or 2 moves in a contest (Break off is the third). */
export function liveCount(r: Ruleset, s: GameState): number {
  return s.contest ? 2 : Math.max(1, Math.min(6, r.liveChoices.count || 3));
}

/** Tags the writer may use right now (content lines removed). */
export function usableTags(r: Ruleset, settings: Pick<Settings, "lines">, s?: GameState): ActionDef[] {
  const blocked = new Set(settings.lines.map((l) => l.toLowerCase()));
  return Object.values(r.liveChoices.tags).filter((a) => !a.hidden && !a.tags.some((t) => blocked.has(t)) && (!s || (a.perPerson
    ? presentPeople(r, s, makeEnv(r, s)).some((id) => !!findAction(r, s, `live:${a.id}@${id}`))
    : !!findAction(r, s, `live:${a.id}`))));
}

/** In a contest: the stats a move may lean on (the kind's `stats:`). */
export function contestStats(r: Ruleset, s: GameState): string[] {
  const kind = s.contest ? r.conflict.kinds[s.contest.kind] : undefined;
  return (kind?.stats ?? []).filter((id) => r.stats[id]);
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

/** A writer's difficulty word (`normal` = fair); null when it isn't one. */
export function difficultyWord(raw: unknown): DifficultyWord | null {
  if (typeof raw !== "string") return null;
  const w = raw.trim().toLowerCase();
  if (w === "normal" || w === "medium") return "fair";
  if (w === "no roll" || w === "safe" || w === "trivial") return "none";
  return (DIFFICULTY_WORDS as string[]).includes(w) ? w as DifficultyWord : null;
}

/**
 * Validate what the writer returned against the tag list, the people here and the committed state.
 * Adventure: a tag with a check keeps the written difficulty (unknown word = fair); a tag without one is `none`.
 * Story: no difficulty words. Contest: moves `contest:<stat>` on the kind's stats only.
 */
export function cleanChoices(r: Ruleset, s: GameState, tags: ActionDef[], raw: unknown, count: number): LiveChoice[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: LiveChoice[] = [];
  if (!Number.isFinite(count) || count <= 0) return out;
  const seen = new Set<string>();
  const moves = s.contest ? contestStats(r, s) : [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim().replace(/^[*"']+|[*"']+$/g, "").replace(/\s+/g, " ").slice(0, 90) : "";
    if (!label || seen.has(label.toLowerCase())) continue;
    if (s.contest) {
      const rawTag = typeof o.tag === "string" ? o.tag.trim().toLowerCase() : "";
      const stat = rawTag.startsWith(CONTEST_PREFIX) ? rawTag.slice(CONTEST_PREFIX.length) : rawTag || (typeof o.stat === "string" ? o.stat.trim().toLowerCase() : "");
      const id = moves.find((m) => m.toLowerCase() === stat) ?? null;
      if (!id) continue;
      seen.add(label.toLowerCase());
      out.push({ label, tag: `${CONTEST_PREFIX}${id}` });
    } else {
      const tag = repairTag(tags, o.tag);
      if (!tag) continue;
      const a = r.liveChoices.tags[tag];
      const target = personId(s, o.target);
      if (a.perPerson && !target) continue;
      if (!findAction(r, s, `live:${tag}${a.perPerson ? `@${target}` : ""}`)) continue;
      // Romantic or sexual moves only toward someone known to be an adult (and never when {{user}} is under 18).
      if (adultGated(a.tags) && ((target && isAdult(r, s, target) !== true) || isAdult(r, s, "you") === false)) continue;
      seen.add(label.toLowerCase());
      const word = difficultyWord(o.difficulty);
      const difficulty: DifficultyWord | undefined = r.style === "story" ? undefined : !a.check ? "none" : word === "none" ? "none" : word ?? "fair";
      out.push({ label, tag, ...(a.perPerson && target ? { target } : {}), ...(difficulty ? { difficulty } : {}) });
    }
    if (out.length >= count) break;
  }
  return out;
}

/**
 * Jev's ranking of the tags (its `kinds` probabilities), damped by recent use so the same kind doesn't come up
 * every turn: × 1 / (1 + 0.5 × uses in the taper window). The top `count` with a real chance; at least one.
 */
export function rankKinds(probabilities: Record<string, number>, recent: Record<string, number>, count: number): string[] {
  const ranked = Object.entries(probabilities)
    .map(([id, p]) => [id, (Number(p) || 0) / (1 + 0.5 * (recent[id] ?? 0))] as const)
    .sort((a, b) => b[1] - a[1]);
  const picked = ranked.filter(([, p]) => p >= 0.04).slice(0, count).map(([id]) => id);
  return picked.length ? picked : ranked.slice(0, 1).map(([id]) => id);
}

/** Live tags used lately (from the engine), for the ranking and the writer's "they give less now" note. */
export function recentTagUses(r: Ruleset, s: GameState): Record<string, number> {
  try { return recentTags(r, s); } catch { return {}; }
}
