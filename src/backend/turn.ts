// The turn pipeline:
//   interceptor  → read intent + scene triggers (decider) → roll → odds for decide blocks → inject
//   generation end → attach the record to the new swipe → bookkeeping + consistency → push UI

import type { InterceptorContextDTO, InterceptorResultDTO, LlmMessageDTO } from "lumiverse-spindle-types";
import type { Decider } from "../engine/decide.js";
import { randomSeed } from "../engine/dice.js";
import { actionTags, applyProposal, resolveTurnFull, type Intent, type Proposal, type TurnRecord } from "../engine/resolve.js";
import type { Ruleset } from "../engine/ruleset.js";
import { applyEvent, cloneState, type GameState } from "../engine/state.js";
import { outcomePacket, sceneHints, stateDigest } from "../engine/view.js";
import { buildInjection, fillNames, injectInto } from "./inject.js";
import { dropPrewritten, judgeDrafts, prewrite, writeDrafts } from "./drafts.js";
import type { Settings } from "../shared/protocol.js";
import { bookkeeping, contradiction, odds, readTurn } from "./decisions.js";
import { getDecider } from "./deciders.js";
import { extract, type ExtractPart } from "./helpers.js";
import { host, logError } from "./host.js";
import { activeRecord, foldPath, getMessages, patchMeta, patchWarpMeta, warpMeta, writeRecord, type Msg, type Suggestion } from "./ledger.js";
import { writeLiveChoices } from "./live.js";
import { discoverPlace } from "./discover.js";
import { getSettings } from "./settings.js";
import { characterBrief, getRuleset } from "./source.js";
import { busyChats, pushState, schedulePush } from "./state-push.js";

export interface Pending {
  chatId: string;
  userId?: string;
  rec: TurnRecord;
  after: GameState;
  playerText: string;
  ruleset: Ruleset;
  at: number;
  /** A fresh adjudicator verdict to save on the player's message once the reply lands. */
  verdict?: { messageId: string; intent: Intent | null; suggestion: Suggestion | null };
  outcome: string | null;
  player: string;
  /** The prompt this reply was written from (with Warp's block), for drafts and pre-writing. */
  prompt?: LlmMessageDTO[];
}

/** Keyed by generation id when the host gives us one, otherwise by chat id. */
const pending = new Map<string, Pending>();
const playerNames = new Map<string, string>();

/**
 * What GENERATION_STARTED told us, per chat. Lumiverse fires it before prompt
 * assembly, and the interceptor context itself doesn't carry the generation id
 * or target message — so this is how the interceptor knows which message is
 * being written (the host pre-stages an empty reply / blank swipe for it).
 */
interface Started { generationId: string; targetMessageId?: string; generationType?: string; at: number }
const started = new Map<string, Started>();

/** The host's interceptor context differs from the typings in places; read it defensively. */
function ctxInfo(ctx: InterceptorContextDTO) {
  const raw = ctx as unknown as Record<string, unknown>;
  const s = started.get(ctx.chatId);
  const fresh = s && Date.now() - s.at < 5 * 60_000 ? s : undefined;
  return {
    isDryRun: raw.isDryRun === true || raw.dryRun === true,
    generationId: (typeof raw.generationId === "string" && raw.generationId) || fresh?.generationId || null,
    targetMessageId: (typeof raw.excludeMessageId === "string" && raw.excludeMessageId) || fresh?.targetMessageId || null,
  };
}

function textOf(content: LlmMessageDTO["content"]): string {
  if (typeof content === "string") return content;
  return content.map((p) => ("text" in p && typeof p.text === "string" ? p.text : "")).join("");
}

export async function playerName(chatId: string, userId?: string): Promise<string> {
  const hit = playerNames.get(chatId);
  if (hit) return hit;
  try {
    const { text } = await host().macros.resolve("{{user}}", { chatId, commit: false } as never);
    const name = text && text !== "{{user}}" ? text : "The player";
    playerNames.set(chatId, name);
    return name;
  } catch {
    return "The player";
  }
}

function fillHints(h: { moods: Record<string, string>; notes: string[] }, player: string) {
  return { v: 1, source: "warp", moods: h.moods, notes: h.notes.map((n) => fillNames(n, player)) };
}

/**
 * Which message is being written. Lumiverse creates it before the interceptor runs
 * (an empty staged reply for normal sends, a blank new swipe for swipes/regens), so
 * the history for this turn is everything *before* it.
 */
function targetOf(ctx: InterceptorContextDTO, targetId: string | null, msgs: Msg[]): Msg | null {
  if (targetId) {
    const hit = msgs.find((m) => m.id === targetId);
    if (hit) return hit;
  }
  if (ctx.generationType === "swipe" || ctx.generationType === "regenerate" || ctx.generationType === "continue") {
    for (let i = msgs.length - 1; i >= 0; i--) if (!msgs[i].is_user) return msgs[i];
  }
  // No id to go on (e.g. a dry run): a trailing empty assistant message is the staged reply.
  const last = msgs[msgs.length - 1];
  if (last && !last.is_user && !last.content.trim()) return last;
  return null;
}

export async function interceptor(messages: LlmMessageDTO[], ctx: InterceptorContextDTO): Promise<LlmMessageDTO[] | InterceptorResultDTO> {
  if (ctx.generationType === "impersonate" || ctx.generationType === "quiet") return messages;
  try {
    const settings = await getSettings(ctx.userId);
    if (!settings.enabled) return messages;
    const loaded = await getRuleset(ctx.chatId, ctx.userId);
    const r = loaded?.ruleset;
    if (!r) return messages;

    const info = ctxInfo(ctx);
    const msgs = await getMessages(ctx.chatId);
    const target = targetOf(ctx, info.targetMessageId, msgs);
    const history = target ? msgs.filter((m) => m.index_in_chat < target.index_in_chat) : msgs;
    const { state: before } = foldPath(r, history);
    const player = await playerName(ctx.chatId, ctx.userId);

    let rec: TurnRecord | null = null;
    let after = before;

    if (ctx.generationType === "continue" && target) {
      // Continuing keeps the existing outcome; just remind the narrator of it.
      rec = activeRecord(target);
      if (rec) {
        after = cloneState(before);
        for (const e of rec.events) applyEvent(after, e, r);
      }
    } else {
      const lastUser = history[history.length - 1]?.is_user ? history[history.length - 1] : null;
      const meta = lastUser ? warpMeta(lastUser) : {};
      let intent: Intent | null = meta.intent ?? null;
      let verdict: Pending["verdict"];
      let scene: Record<string, boolean> = {};
      let encounter: { id: string; foe?: string } | undefined;
      let confidence: number | undefined;
      const sceneText = [...history].reverse().find((m) => !m.is_user)?.content ?? "";
      const budget = () => Math.min(20000, (typeof ctx.interceptorDeadlineAt === "number" ? ctx.interceptorDeadlineAt : Date.now() + 20000) - Date.now() - 2000);
      const decider = info.isDryRun ? null : await getDecider(settings, ctx.userId);

      if (decider) {
        // One parallel batch: what the typed message attempts (if not already known) + plain-language triggers.
        const readText = !intent && !meta.judged && lastUser && settings.freeTextChecks ? lastUser.content : null;
        const reading = await readTurn({ decider, r, s: before, settings, playerText: readText, sceneText, player, timeoutMs: budget() });
        scene = reading.scene;
        encounter = reading.encounter;
        if (readText !== null && lastUser) {
          intent = reading.intent;
          confidence = reading.confidence;
          verdict = { messageId: lastUser.id, intent, suggestion: reading.suggestion };
        }
      }

      const seed = settings.swipesReroll ? randomSeed() : `${lastUser?.id ?? "start"}:${intent?.actionId ?? "none"}`;
      const playerText = lastUser?.content ?? "";
      let res = resolveTurnFull(r, before, intent, { seed, veils: settings.veils, scene, playerText, encounter });
      if (decider && res.needs.length) {
        // Uncertain reactions: the model supplies odds, the same seed re-rolls the same dice with them.
        // Questions about who someone is (tastes, age) need the card, not just the scene.
        const card = res.needs.some((n) => n.id.startsWith("date:pref:") || n.id.startsWith("date:adult:")) ? await characterBrief(ctx.chatId, ctx.userId) : undefined;
        const o = await odds({ decider, r, s: before, specs: res.needs, playerText: lastUser?.content ?? "", sceneText, player, timeoutMs: budget(), card });
        if (Object.keys(o).length) res = resolveTurnFull(r, before, intent, { seed, veils: settings.veils, scene, odds: o, playerText, encounter });
      }
      rec = res.record;
      if (confidence !== undefined && rec.action) rec.confidence = confidence;
      // Exploring found somewhere new: invent it, save it to the ruleset, step into it.
      if (rec.discover && !info.isDryRun && loaded) await discoverPlace(loaded, r, before, rec, ctx.chatId, settings, ctx.userId);
      after = cloneState(before);
      for (const e of rec.events) applyEvent(after, e, r);
      if (!info.isDryRun) {
        pending.set(info.generationId ?? ctx.chatId, {
          chatId: ctx.chatId, userId: ctx.userId, rec, after,
          playerText: lastUser?.content ?? "", ruleset: r, at: Date.now(), verdict,
          outcome: outcomePacket(r, rec, before, after, player), player,
        });
        // Let the HUD show the roll immediately, before the prose arrives.
        if (rec.check) host().sendToFrontend({ type: "busy", chatId: ctx.chatId, busy: true, label: `${rec.check.label}: ${rec.check.tier.replace("_", " ")}` }, ctx.userId);
        // Moods for the visual-novel extension, on the message this reply answers (there before the reply is planned).
        if (lastUser) {
          const hints = sceneHints(r, after);
          void patchMeta(ctx.chatId, lastUser.id, "vn_hints", hints ? fillHints(hints, player) : undefined).catch((e) => logError("scene hints", e));
        }
      }
    }

    const text = buildInjection(r, rec, before, after, player);
    const { messages: out, index } = injectInto(messages, text);
    const waiting = pending.get(info.generationId ?? ctx.chatId);
    if (waiting && !info.isDryRun) waiting.prompt = out;
    return { messages: out, breakdown: [{ messageIndex: index, name: "Warp game state" }] };
  } catch (e) {
    logError("interceptor", e);
    return messages;
  }
}

/**
 * After-reply bookkeeping. A System-1 decider answers bounded "what changed?" questions;
 * names it can't produce (new people, items, free-form places) go to the LLM only when a gate fires.
 */
async function proposeChanges(decider: Decider, r: Ruleset, p: Pending, reply: string, settings: Settings, userId?: string): Promise<Proposal | null> {
  // What the dice already applied, so the story's reading doesn't count it twice.
  const applied = p.outcome ? fillNames(p.outcome, p.player) : null;
  if (decider.id === "llm") return extract(r, p.after, p.playerText, reply, settings, userId, undefined, applied);
  if (decider.id === "rules") return null;
  const { proposal, needsWriting } = await bookkeeping({ decider, r, s: p.after, playerText: p.playerText, reply, player: p.player, applied });
  if (needsWriting.size) {
    const named = await extract(r, p.after, p.playerText, reply, settings, userId, needsWriting as Set<ExtractPart>, applied);
    if (named?.people) proposal.people = named.people;
    if (named?.items) proposal.items = { ...(proposal.items ?? {}), ...named.items };
    if (named?.move && !proposal.move) proposal.move = named.move;
    if (named?.body) proposal.body = named.body;
    if (named?.feelings) proposal.feelings = { ...(proposal.feelings ?? {}), ...named.feelings };
    if (named?.used) proposal.used = { ...(proposal.used ?? {}), ...named.used };
  }
  return proposal;
}

/**
 * Everything after a reply lands: best-of-several drafts, reading the story's
 * changes, the consistency check, live choices, then pre-writing the next replies.
 */
export async function afterReply(p: Pending, msg: Msg, content: string, userId?: string): Promise<void> {
  const chatId = p.chatId;
  const settings = await getSettings(userId);
  const r = p.ruleset;
  let swipe = msg.swipe_id ?? 0;
  const decider = await getDecider(settings, userId);
  dropPrewritten(chatId);

  // Best of several drafts: the one already shown stays unless another is clearly better.
  if (settings.drafts > 1 && p.prompt && decider.id !== "rules") {
    host().sendToFrontend({ type: "busy", chatId, busy: true, label: `Writing ${settings.drafts - 1} more draft${settings.drafts > 2 ? "s" : ""}…` }, userId);
    const extra = await writeDrafts(p.prompt, settings.drafts - 1, userId);
    if (extra.length) {
      const all = [content, ...extra];
      const pick = await judgeDrafts(decider, all, p.outcome ? fillNames(p.outcome, p.player) : null, fillNames(stateDigest(r, p.after), p.player));
      const swipes = [...(msg.swipes?.length ? msg.swipes : [content]), ...extra];
      const base = swipes.length - extra.length;
      const dates = [...(msg.swipe_dates ?? []), ...extra.map(() => Math.floor(Date.now() / 1000))];
      await host().chat.updateMessage(chatId, msg.id, { swipes, swipe_dates: dates, ...(pick > 0 ? { swipe_id: base + pick - 1 } : {}) });
      // Every draft carries the same decided outcome, so swiping between them keeps the state.
      for (let i = 0; i < extra.length; i++) await writeRecord(chatId, msg.id, base + i, p.rec);
      if (pick > 0) { swipe = base + pick - 1; content = all[pick]; }
    }
  }

  const wantLive = r.liveChoices.enabled;
  if (settings.narratorUpdates || settings.consistencyCheck || wantLive) {
    host().sendToFrontend({ type: "busy", chatId, busy: true, label: "Updating state…" }, userId);
    const [proposal, contra, live] = await Promise.all([
      settings.narratorUpdates ? proposeChanges(decider, r, p, content, settings, userId) : Promise.resolve(null),
      settings.consistencyCheck && decider.id !== "rules"
        ? contradiction({ decider, r, s: p.after, reply: content, outcome: p.outcome })
        : Promise.resolve(null),
      wantLive
        ? writeLiveChoices({ r, s: p.after, reply: content, player: p.player, settings, userId, decider })
        : Promise.resolve([]),
    ]);
    const rec: TurnRecord = { ...p.rec };
    if (proposal) {
      const action = p.rec.action ? { id: p.rec.action.id, tags: actionTags(r, p.rec.action.id) } : undefined;
      const events = applyProposal(r, p.after, proposal, { text: `${p.playerText}\n${content}`, action });
      if (events.length) rec.events = [...rec.events, ...events];
    }
    if (contra !== null) rec.contradiction = contra;
    if (rec.events !== p.rec.events || contra !== null) await writeRecord(chatId, msg.id, swipe, rec);
    if (live.length) {
      await patchWarpMeta(chatId, msg.id, (w) => ({ ...w, live: { ...(w.live ?? {}), [String(swipe)]: live } }));
    }
  }

  // Pre-write the first few choices while the player reads.
  if (settings.prewrite > 0 && p.prompt) {
    await pushState(chatId, userId);
    host().sendToFrontend({ type: "busy", chatId, busy: false }, userId);
    void prewrite({ chatId, userId, r, settings, decider, prompt: p.prompt, reply: content, player: p.player, onReady: () => schedulePush(chatId, userId, 100) })
      .catch((e) => logError("pre-write", e));
  }
}

export async function onGenerationStarted(payload: { generationId: string; chatId: string; targetMessageId?: string; generationType?: string }, userId?: string) {
  const { chatId } = payload;
  started.set(chatId, { generationId: payload.generationId, targetMessageId: payload.targetMessageId, generationType: payload.generationType, at: Date.now() });
  busyChats.add(chatId);
  host().sendToFrontend({ type: "busy", chatId, busy: true }, userId);
}

export async function onGenerationEnded(payload: { generationId: string; chatId: string; messageId?: string; content?: string; error?: string; generationType?: string }, userId?: string) {
  busyChats.delete(payload.chatId);
  if (started.get(payload.chatId)?.generationId === payload.generationId) started.delete(payload.chatId);
  // Match by generation id; fall back to the chat when the host didn't give the interceptor an id.
  const key = pending.has(payload.generationId) ? payload.generationId : payload.chatId;
  const p = pending.get(key);
  pending.delete(key);
  // Drop stale entries (generations that never reported back).
  for (const [id, x] of pending) if (Date.now() - x.at > 10 * 60_000) pending.delete(id);

  if (!p || payload.error || !payload.messageId) {
    await pushState(payload.chatId, userId);
    return;
  }
  try {
    const msgs = await getMessages(payload.chatId);
    const msg = msgs.find((m) => m.id === payload.messageId);
    if (!msg) return;
    const swipe = msg.swipe_id ?? 0;
    await writeRecord(payload.chatId, msg.id, swipe, p.rec);
    if (p.verdict) {
      const { messageId, intent, suggestion } = p.verdict;
      await patchWarpMeta(payload.chatId, messageId, (w) => ({
        ...w, judged: true, ...(intent ? { intent } : {}), ...(suggestion ? { suggest: suggestion } : {}),
      })).catch((e) => logError("save verdict", e));
    }
    await pushState(payload.chatId, userId);
    if (payload.content) await afterReply(p, msg, payload.content, userId);
  } catch (e) {
    logError("generation ended", e);
  } finally {
    host().sendToFrontend({ type: "busy", chatId: payload.chatId, busy: false }, userId);
    schedulePush(payload.chatId, userId, 0);
  }
}
