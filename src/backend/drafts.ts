// Spending cheap, fast generation where it helps most:
//   • optional alternatives — extra drafts of a reply stored as swipes for the player
//     to choose; the visible reply is never automatically replaced;
//   • pre-written replies — while the player reads, the first few choices are resolved
//     (dice included) and written, so clicking one is instant.

import type { GenerationResponseDTO, LlmMessageDTO } from "lumiverse-spindle-types";
import type { Decider } from "../engine/decide.js";
import { randomSeed } from "../engine/dice.js";
import { resolveTurnFull, type Intent, type TurnRecord } from "../engine/resolve.js";
import type { Ruleset } from "../engine/ruleset.js";
import { applyEvent, cloneState, type GameState } from "../engine/state.js";
import { buildChoices, outcomePacket } from "../engine/view.js";
import type { Settings } from "../shared/protocol.js";
import { odds } from "./decisions.js";
import { host, logError } from "./host.js";
import { buildInjection, nextPrompt } from "./inject.js";
import { intentFor } from "./intents.js";
import { foldPath, getMessages, liveChoicesOf } from "./ledger.js";

function textOf(res: unknown): string {
  return typeof res === "string" ? res : (res as GenerationResponseDTO | null)?.content ?? "";
}

/** Generate with the chat's own connection from a finished prompt. */
export async function writeReply(messages: LlmMessageDTO[], userId?: string, timeoutMs = 120_000, chatId?: string): Promise<string> {
  const chat = chatId ? await host().chats.get(chatId, userId) : null;
  const pinned = chat?.metadata?.connection_profile_id;
  const connection_id = typeof pinned === "string" && pinned.trim() ? pinned.trim() : undefined;
  const res = await host().generate.quiet({ type: "quiet", messages, connection_id, userId, signal: AbortSignal.timeout(timeoutMs) } as never);
  return textOf(res).trim();
}

// ───────────────────────── best of several drafts ─────────────────────────

export async function writeDrafts(prompt: LlmMessageDTO[], n: number, userId?: string, chatId?: string): Promise<string[]> {
  const out = await Promise.allSettled(Array.from({ length: n }, () => writeReply(prompt, userId, 120_000, chatId)));
  return out.flatMap((x) => (x.status === "fulfilled" && x.value ? [x.value] : []));
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Optional draft recommendation (index into drafts), not permission to switch the visible reply. */
export async function judgeDrafts(decider: Decider, drafts: string[], outcome: string | null, state: string): Promise<number> {
  if (drafts.length < 2) return 0;
  try {
    const ans = await decider.ask(
      { game_state: state, decided_outcome: outcome ?? "(nothing decided this turn — free roleplay)" },
      { best: {
        type: "choice",
        instructions: "Which draft narrates the decided outcome most faithfully (every decided result, nothing that contradicts the game state), keeps characters in voice, and reads best?",
        criteria: Object.fromEntries(drafts.map((d, i) => [`d${i}`, clip(d, 2500)])),
      } },
    );
    const a = ans.best;
    if (a?.type !== "choice") return 0;
    const i = Number(a.choice.slice(1));
    // Recommend an alternative only when the model is clearly surer.
    return Number.isInteger(i) && i > 0 && (a.probabilities[a.choice] ?? 0) >= (a.probabilities.d0 ?? 0) + 0.15 ? i : 0;
  } catch (e) {
    logError("judge drafts", e);
    return 0;
  }
}

// ───────────────────────── pre-written replies ─────────────────────────

export interface Prewritten { say: string; intent: Intent; rec: TurnRecord; text: string; prompt: LlmMessageDTO[]; outcome: string | null; after: GameState }

/** Per chat: which state the replies were written for, and the replies by choice id. */
const cache = new Map<string, { key: string; replies: Map<string, Prewritten> }>();

/** A fingerprint of the moment: the latest message, its swipe, and the folded state. */
export function momentKey(msgs: { id: string; swipe_id?: number; content?: string }[], state: GameState, context?: { r: Ruleset; settings: Settings }): string {
  const last = msgs[msgs.length - 1];
  const s = JSON.stringify([state, msgs.map((m) => [m.id, m.swipe_id ?? 0, m.content]), context?.r, context?.settings]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${last?.id ?? ""}:${last?.swipe_id ?? 0}:${(h >>> 0).toString(36)}`;
}

export function readyChoices(chatId: string, key: string): Set<string> {
  const c = cache.get(chatId);
  return c?.key === key ? new Set(c.replies.keys()) : new Set();
}

/** Take a pre-written reply for this choice, if it was written for exactly this moment. */
export function takePrewritten(chatId: string, key: string, actionId: string): Prewritten | null {
  const c = cache.get(chatId);
  if (!c || c.key !== key) return null;
  const hit = c.replies.get(actionId) ?? null;
  if (hit) cache.delete(chatId);
  return hit;
}

export function dropPrewritten(chatId: string) {
  cache.delete(chatId);
}

/** Choices that open a screen or change the game without a reply can't be pre-written. */
const writable = (id: string) => !id.startsWith("item:") && !id.startsWith("ability:") && !(id.startsWith("run:") && id !== "run:epilogue");

export async function prewrite(opts: {
  chatId: string; userId?: string; r: Ruleset; settings: Settings; decider: Decider;
  prompt: LlmMessageDTO[]; reply: string; player: string; onReady: () => void;
}): Promise<void> {
  const { chatId, userId, r, settings, decider } = opts;
  // An ironman roll is seeded with the committed user message ID, which does not
  // exist while speculating. Do not prepare a different roll in that mode.
  if (settings.prewrite <= 0 || !settings.swipesReroll) return;
  const msgs = await getMessages(chatId);
  const { state, conflict } = foldPath(r, msgs, 0);
  if (conflict) return;
  // A quiet encounter writes its own short rounds — nothing to pre-write.
  if (state.encounter && !r.encounters[state.encounter.id]?.narrate) return;
  const key = momentKey(msgs, state, { r, settings });
  const choices = buildChoices(r, state, { ...settings, live: liveChoicesOf(msgs[msgs.length - 1]) })
    .filter((c) => writable(c.id) && !c.params.length).slice(0, settings.prewrite);
  const replies = new Map<string, Prewritten>();
  cache.set(chatId, { key, replies });
  await Promise.allSettled(choices.map(async (c) => {
    const ci = intentFor(r, state, settings, msgs, c.id);
    if ("error" in ci) return;
    const seed = randomSeed();
    let res = resolveTurnFull(r, state, ci.intent, { seed, veils: settings.veils, playerText: ci.say });
    if (res.needs.length && decider.id !== "rules") {
      const o = await odds({ decider, r, s: state, specs: res.needs, playerText: ci.say, sceneText: opts.reply, player: opts.player, timeoutMs: 20000 });
      if (Object.keys(o).length) res = resolveTurnFull(r, state, ci.intent, { seed, veils: settings.veils, odds: o, playerText: ci.say });
    }
    const rec = res.record;
    const after = cloneState(state);
    for (const e of rec.events) applyEvent(after, e, r);
    const prompt = nextPrompt(opts.prompt, opts.reply, ci.say, buildInjection(r, rec, state, after, opts.player, `${opts.reply}\n${ci.say}`));
    const text = await writeReply(prompt, userId, 120_000, chatId);
    if (!text || cache.get(chatId)?.replies !== replies) return;
    replies.set(c.id, { say: ci.say, intent: ci.intent, rec, text, prompt, outcome: outcomePacket(r, rec, state, after, opts.player), after });
    opts.onReady();
  }));
}
