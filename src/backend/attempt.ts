// The player's own message for a clicked move: how it went, in their voice. The
// roll (or the minigame) is settled when the choice is clicked, so the message can
// tell it; the narrator then picks up from there.

import { randomSeed } from "../engine/dice.js";
import { resolveTurnFull, type CheckResult, type Intent, type TurnRecord } from "../engine/resolve.js";
import type { Ruleset } from "../engine/ruleset.js";
import type { GameState } from "../engine/state.js";
import type { Tier } from "../engine/ruleset.js";
import type { Settings } from "../shared/protocol.js";
import { askProse } from "./helpers.js";
import { host, send } from "./host.js";
import type { Msg } from "./ledger.js";

const TIER_WORDS: Record<Tier, string> = {
  crit_success: "a triumph — it couldn't have gone better",
  success: "it works, cleanly",
  partial: "it half works: it gets done, but not cleanly, or at a cost",
  fail: "it doesn't work",
  crit_fail: "it goes badly wrong",
};

/** The scripted line, when no helper writes one: the move as clicked, and how it went. */
export function scriptedAttempt(say: string, tier: Tier): string {
  const base = say.trim().replace(/^\*+|\*+$/g, "").replace(/[.!…\s]+$/, "") || "I give it a go";
  const how: Record<Tier, string> = {
    crit_success: "and it couldn't have gone better.",
    success: "and it comes off well.",
    partial: "and it mostly works, though not cleanly.",
    fail: "but it doesn't come together.",
    crit_fail: "and it goes badly wrong.",
  };
  return `*${base} — ${how[tier]}*`;
}

const SYSTEM = `You write one short line for the PLAYER in a roleplay: what their character just did and how well it went, in their own voice.
Rules:
- First person, present tense, inside asterisks, like *I ...*. One or two sentences, at most 45 words.
- Say how well THEY did, matching the result exactly (a triumph, a clean success, half working, a failure, a disaster). Show it through concrete detail of the attempt itself.
- Only the player's own actions, body and feelings. Never write other characters' words, reactions or decisions, and never what happens next — the narrator writes that.
- Fit the scene and the player's persona. No numbers, dice, scores or game terms.
- Output only the line.`;

/** Write the player's line for a settled move. Falls back to the scripted line. */
export async function describeAttempt(o: {
  say: string; label: string; check: CheckResult | undefined; tier: Tier; scene: string; persona: string; player: string;
  settings: Settings; userId?: string;
}): Promise<string> {
  const fallback = scriptedAttempt(o.say, o.tier);
  if (o.settings.sceneLines === "scripted") return fallback;
  const how = o.check?.game ? `played as a game (${o.check.game.summary.replace(/^\S+\s/, "")}); ${TIER_WORDS[o.tier]}` : TIER_WORDS[o.tier];
  const user = [
    `The player character: ${o.player}.${o.persona ? `\nPersona:\n${o.persona.slice(0, 1200)}` : ""}`,
    o.scene ? `The scene so far (latest narration):\n${o.scene.slice(-1500)}` : "",
    `What ${o.player} does: ${o.label}${o.check?.label && o.check.label !== o.label ? ` (${o.check.label})` : ""}. As clicked: ${o.say}`,
    `How it went: ${how}.`,
    `Write ${o.player}'s line.`,
  ].filter(Boolean).join("\n\n");
  try {
    const text = (await askProse(SYSTEM, user, o.settings, o.userId, 12000, { temperature: 0.8 })).trim();
    if (!text || text.length > 400) return fallback;
    const line = text.replace(/^["“]|["”]$/g, "").trim();
    return /^\*/.test(line) ? line : `*${line.replace(/\*+$/, "")}*`;
  } catch {
    return fallback;
  }
}

/** The player's persona text, for their voice. */
export async function personaText(chatId: string, userId?: string): Promise<string> {
  try {
    const { text } = await host().macros.resolve("{{persona}}", { chatId, userId, commit: false });
    return text && text !== "{{persona}}" ? text.trim() : "";
  } catch { return ""; }
}

/** Does this resolved turn have a result worth telling in the player's message? */
export function tellable(rec: TurnRecord): boolean {
  return !!rec.check && !rec.mind && !rec.veiled && !rec.gamble;
}

/**
 * Settle a clicked move now — roll it (or take the minigame's score) — and write the player's message from the
 * result. The seed and tier go on the intent, so the reply and every swipe keep that result. Returns the message
 * to post; the clicked line unchanged when there's nothing to tell (no check, a date, a gambling table…).
 */
export async function settleClick(o: {
  r: Ruleset; state: GameState; intent: Intent; say: string; msgs: Msg[]; chatId: string; player: string; settings: Settings; userId?: string;
  /** A reply already written for this move: its result is the one to tell. */
  ready?: TurnRecord;
}): Promise<string> {
  if (!o.settings.sayOutcome || o.intent.actionId.startsWith("date:")) return o.say;
  let rec: TurnRecord;
  if (o.ready) rec = o.ready;
  else {
    const seed = randomSeed();
    rec = resolveTurnFull(o.r, o.state, { ...o.intent, seed }, { seed, veils: o.settings.veils, playerText: o.say }).record;
  }
  if (!tellable(rec) || !rec.check) return o.say;
  o.intent.seed = rec.check.seed;
  o.intent.tier = rec.check.tier;
  send({ type: "busy", chatId: o.chatId, busy: true, label: `${rec.check.label}: ${rec.check.tier.replace("_", " ")}` }, o.userId);
  const scene = [...o.msgs].reverse().find((m) => !m.is_user)?.content ?? "";
  return describeAttempt({
    say: o.say, label: rec.action?.label ?? o.intent.actionId, check: rec.check, tier: rec.check.tier, scene,
    persona: await personaText(o.chatId, o.userId), player: o.player, settings: o.settings, userId: o.userId,
  });
}
