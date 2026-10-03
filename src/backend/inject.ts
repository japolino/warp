// The block Warp adds to the prompt: the state, what only the narrator knows, and
// this turn's decided outcome.

import type { LlmMessageDTO } from "lumiverse-spindle-types";
import type { TurnRecord } from "../engine/resolve.js";
import type { Ruleset } from "../engine/ruleset.js";
import type { GameState } from "../engine/state.js";
import { narratorKnowledge, outcomePacket, stateDigest } from "../engine/view.js";

export function fillNames(text: string, player: string) {
  return text.replace(/\{\{user\}\}/gi, player);
}

/**
 * `focus`: what the turn is about (the player's message, the reply before it). With it, the state names only
 * what's in play — a bag, a board or a skill sheet in the prompt is something the narrator will reach for.
 * Without it, the whole state goes in.
 */
export function buildInjection(r: Ruleset, rec: TurnRecord | null, before: GameState, after: GameState, player: string, focus?: string, since: string[] = []): string {
  const parts: string[] = [];
  // The chosen action and the rules' hints are part of what's in play (an item it uses, a quest it advances),
  // and so is whatever {{user}} just did off the page.
  const turnText = focus === undefined ? undefined : fillNames([
    focus,
    ...since,
    rec?.action?.label ?? "",
    ...(rec?.hints ?? []),
  ].join("\n"), player);
  parts.push(`[Warp — current game state. The rules engine owns these facts; keep narration consistent with them.]\n${stateDigest(r, after, turnText === undefined ? undefined : { text: turnText })}`);
  if (since.length) parts.push(`[Warp — what {{user}} did since the last reply, off the page. Already done: keep the story consistent with it, but don't narrate it as happening now or repeat it back.]\n${since.slice(-8).map((l) => `- ${l}`).join("\n")}`);
  if (r.narration.notes) parts.push(`[Warp — narrator notes]\n${r.narration.notes}`);
  const known = narratorKnowledge(r, after);
  if (known) parts.push(`[Warp — background only you know. The player hasn't seen it. Play it as subtext: never explain it, and reveal no more than the scene earns.]\n${known}`);
  const packet = rec ? outcomePacket(r, rec, before, after, player) : null;
  if (packet && (rec?.action || rec?.hints.length)) {
    parts.push(`[Warp — this turn's outcome, already decided by the dice. Narrate it faithfully and do not change the result.]\n${packet}`);
  }
  return fillNames(parts.join("\n\n"), player);
}

export const WARP_BLOCK = /\n*<warp>[\s\S]*?<\/warp>/g;

export function injectInto(messages: LlmMessageDTO[], text: string): { messages: LlmMessageDTO[]; index: number } {
  const out = [...messages];
  let idx = -1;
  for (let i = out.length - 1; i >= 0; i--) if (out[i].role === "user") { idx = i; break; }
  const block = `\n\n<warp>\n${text}\n</warp>`;
  if (idx >= 0) {
    const m = out[idx];
    out[idx] = typeof m.content === "string"
      ? { ...m, content: m.content + block }
      : { ...m, content: [...m.content, { type: "text", text: block } as never] };
    return { messages: out, index: idx };
  }
  out.push({ role: "user", content: block.trim() });
  return { messages: out, index: out.length - 1 };
}

/**
 * The prompt for the turn after `reply`: last turn's prompt without its Warp block,
 * then the reply, then the player's next message carrying the new block. Anything
 * the preset put after the last player message (post-history instructions) stays last.
 */
export function nextPrompt(prompt: LlmMessageDTO[], reply: string, say: string, injection: string): LlmMessageDTO[] {
  const clean = prompt.map((m) => (typeof m.content === "string" && m.role === "user" ? { ...m, content: m.content.replace(WARP_BLOCK, "") } : m));
  let idx = -1;
  for (let i = clean.length - 1; i >= 0; i--) if (clean[i].role === "user") { idx = i; break; }
  const turn: LlmMessageDTO[] = [
    { role: "assistant", content: reply },
    { role: "user", content: `${say}\n\n<warp>\n${injection}\n</warp>` },
  ];
  return idx >= 0 ? [...clean.slice(0, idx + 1), ...turn, ...clean.slice(idx + 1)] : [...clean, ...turn];
}
