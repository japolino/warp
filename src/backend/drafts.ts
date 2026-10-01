// Spending cheap, fast generation where it helps most:
//   • best of several drafts — extra drafts of a reply, the decision model picks the one
//     that narrates the decided outcome most faithfully and reads best;
//   • pre-written replies — while the player reads, the first few choices are resolved
//     (dice included) and written, so clicking one is instant.

import type { GenerationResponseDTO, LlmMessageDTO } from "lumiverse-spindle-types";
import type { Decider } from "../engine/decide.js";
import { randomSeed } from "../engine/dice.js";
import { fingerprint } from "../engine/fingerprint.js";
import { resolveTurnFull, type Intent, type TurnRecord } from "../engine/resolve.js";
import type { Ruleset } from "../engine/ruleset.js";
import { applyEvent, cloneState, type GameState } from "../engine/state.js";
import { buildChoices, outcomePacket } from "../engine/view.js";
import type { Settings } from "../shared/protocol.js";
import { odds } from "./decisions.js";
import { host, logError } from "./host.js";
import { buildInjection, nextPrompt } from "./inject.js";
import { intentFor } from "./intents.js";
import { foldPath, getMessages, liveChoicesOf, requireCurrentPath } from "./ledger.js";
import { withDeadline } from "./deadline.js";
import { resolveWithDecisions } from "./decision-loop.js";
import { serialQueue } from "./serial.js";

function textOf(res: unknown): string {
  return typeof res === "string" ? res : (res as GenerationResponseDTO | null)?.content ?? "";
}

/** Generate with the chat's own connection from a finished prompt. */
export async function writeReply(messages: LlmMessageDTO[], userId?: string, timeoutMs = 120_000, signal?: AbortSignal): Promise<string> {
  return withDeadline({ timeoutMs, signal }, timeoutMs, async (signal) => {
    const res = await host().generate.quiet({ type: "quiet", messages, userId, signal } as never);
    return textOf(res).trim();
  });
}

// ───────────────────────── best of several drafts ─────────────────────────

export async function writeDrafts(prompt: LlmMessageDTO[], n: number, userId?: string): Promise<string[]> {
  const out = await Promise.allSettled(Array.from({ length: n }, () => writeReply(prompt, userId)));
  return out.flatMap((x) => (x.status === "fulfilled" && x.value ? [x.value] : []));
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Which draft to keep (index into drafts). The first — the one already shown — wins ties. */
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
    // Only swap away from what the player already saw if the model is clearly surer.
    return Number.isInteger(i) && i > 0 && (a.probabilities[a.choice] ?? 0) >= (a.probabilities.d0 ?? 0) + 0.15 ? i : 0;
  } catch (e) {
    logError("judge drafts", e);
    return 0;
  }
}

// ───────────────────────── pre-written replies ─────────────────────────

export interface Prewritten { say: string; intent: Intent; rec: TurnRecord; text: string; prompt: LlmMessageDTO[]; outcome: string | null; after: GameState }

/** Per chat: which state the replies were written for, and the replies by choice id. */
const cache = new Map<string, { key: string; replies: Map<string, Prewritten>; controller: AbortController }>();
const background = serialQueue();
let ticket = 0;

/** A fingerprint of the moment: the latest message, its swipe, and the folded state. */
export function momentKey(msgs: { id: string; swipe_id?: number; content?: string; is_user?: boolean }[], state: GameState, r?: Ruleset, settings?: Settings): string {
  return fingerprint({ messages: msgs.map((m) => [m.id, m.swipe_id ?? 0, m.content, m.is_user]), state, rules: r, settings });
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
  if (hit) dropPrewritten(chatId);
  return hit;
}

export function dropPrewritten(chatId?: string) {
  if (chatId === undefined) { for (const id of [...cache.keys()]) dropPrewritten(id); return; }
  cache.get(chatId)?.controller.abort(new Error("Prewritten context changed"));
  cache.delete(chatId);
}

/** Choices that open a screen or change the game without a reply can't be pre-written. */
const writable = (id: string) => !id.startsWith("dungeon:") && id !== "date:open" && !(id.startsWith("run:") && id !== "run:epilogue");

export async function prewrite(opts: {
  chatId: string; userId?: string; r: Ruleset; settings: Settings; decider: Decider;
  prompt: LlmMessageDTO[]; reply: string; player: string; onReady: () => void;
}): Promise<void> {
  const { chatId, userId, settings, decider } = opts;
  if (settings.prewrite <= 0) return;
  const msgs = await getMessages(chatId);
  const fold = foldPath(opts.r, msgs);
  requireCurrentPath(fold);
  const { state, ruleset: r } = fold;
  const key = momentKey(msgs, state, r, settings);
  const choices = buildChoices(r, state, { ...settings, live: liveChoicesOf(msgs[msgs.length - 1]) })
    .filter((c) => writable(c.id) && !c.params.length).slice(0, settings.prewrite);
  const replies = new Map<string, Prewritten>();
  dropPrewritten(chatId);
  const controller = new AbortController(), signal = controller.signal;
  cache.set(chatId, { key, replies, controller });
  await Promise.allSettled(choices.map((c) => background(`slot:${ticket++ % 2}`, async () => {
    signal.throwIfAborted();
    const ci = intentFor(r, state, settings, msgs, c.id);
    if ("error" in ci) return;
    const seed = settings.swipesReroll ? randomSeed() : fingerprint([fold.head, ci.intent, ci.say]);
    const res = await resolveWithDecisions({
      resolve: (o) => resolveTurnFull(r, state, ci.intent, { seed, veils: settings.veils, playerText: ci.say, odds: o }),
      ask: decider.id === "rules" ? undefined : (specs, remaining, boundedSignal) => odds({ decider, r, s: state, specs, playerText: ci.say, sceneText: opts.reply, player: opts.player, timeoutMs: remaining, signal: boundedSignal }),
      deadlineAt: Date.now() + 20000, signal,
    });
    const rec = res.record;
    // Exploring invents places and ending runs need the live turn; don't pre-write those.
    if (rec.discover) return;
    const after = cloneState(state);
    for (const e of rec.events) applyEvent(after, e, r);
    const prompt = nextPrompt(opts.prompt, opts.reply, ci.say, buildInjection(r, rec, state, after, opts.player));
    const text = await writeReply(prompt, userId, 120_000, signal);
    if (!text || cache.get(chatId)?.replies !== replies) return;
    replies.set(c.id, { say: ci.say, intent: ci.intent, rec, text, prompt, outcome: outcomePacket(r, rec, state, after, opts.player), after });
    opts.onReady();
  })));
}
