// A short account of the playthrough so far — for writing an ending's epilogue
// from what actually happened rather than from the last few replies.

import type { EndingDef, Ruleset } from "./ruleset.js";
import { bandFor, formatClock, personName, type GameState } from "./state.js";
import { stageLabel } from "./date/stage.js";

export function runSummary(r: Ruleset, s: GameState): string {
  const lines: string[] = [];
  if (r.clock.enabled) lines.push(`It lasted until ${formatClock(r, s.minutes).label}.`);
  if (s.runs > 1) lines.push(`This was playthrough ${s.runs}.`);
  if (s.loops > 0) lines.push(`Time rewound ${s.loops} time${s.loops === 1 ? "" : "s"}.`);

  const people = Object.keys(s.people).map((id) => {
    const name = personName(r, s, id);
    if (s.dating.partners[id]) return `${name} (together)`;
    if (r.dating.enabled) return `${name} (${stageLabel(r, s, id).toLowerCase()})`;
    const first = r.relStatOrder[0];
    const def = first ? r.relStats[first] : undefined;
    const band = def ? bandFor(def, s.rel[id]?.[first] ?? def.start) : null;
    return band ? `${name} (${def!.label.toLowerCase()}: ${band.text.toLowerCase()})` : name;
  });
  if (people.length) lines.push(`People: ${people.join(", ")}.`);
  const dates = Object.entries(s.dating.dates).map(([id, d]) => `${d.count} with ${personName(r, s, id)}`);
  if (dates.length) lines.push(`Dates: ${dates.join(", ")}.`);
  const feats = Object.keys(s.feats).map((id) => r.feats[id]?.name ?? id);
  if (feats.length) lines.push(`Feats: ${feats.join(", ")}.`);
  const codex = Object.keys(s.codex).length;
  if (codex) lines.push(`Discovered ${codex} codex entr${codex === 1 ? "y" : "ies"}.`);
  const deep = Object.entries(s.deepest).map(([id, d]) => `floor ${d} of ${r.dungeons[id]?.name ?? id}`);
  if (deep.length) lines.push(`Deepest dive: ${deep.join(", ")}.`);
  const news = s.news.slice(-5).map((n) => n.text);
  if (news.length) lines.push(`What happened in the world: ${news.join(" ")}`);
  return lines.join(" ");
}

/** Direction for the reply that ends the story. */
export function endingDirection(r: Ruleset, s: GameState, e: EndingDef): string {
  return `THE STORY REACHES AN ENDING — "${e.title}" (${e.kind}). ${e.text} Write this reply as the ending: close the story with an epilogue that draws on what actually happened. ${runSummary(r, s)} Don't carry the story on past it.`;
}
