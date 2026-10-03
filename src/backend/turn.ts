// The turn pipeline:
//   interceptor  → read intent + scene triggers (decider) → roll → odds for decide blocks → inject
//   generation end → attach the record to the new swipe → bookkeeping → push UI

import type { InterceptorContextDTO, InterceptorResultDTO, LlmMessageDTO } from "lumiverse-spindle-types";
import type { Decider } from "../engine/decide.js";
import { randomSeed } from "../engine/dice.js";
import { actionTags, applyProposal, resolveTurnFull, type Intent, type Proposal, type TurnRecord } from "../engine/resolve.js";
import type { Ruleset } from "../engine/ruleset.js";
import { applyEvent, cloneState, type GameState } from "../engine/state.js";
import { outcomePacket, sceneHints, stateDigest } from "../engine/view.js";
import { buildInjection, fillNames, injectInto } from "./inject.js";
import type { Settings } from "../shared/protocol.js";
import { bookkeeping, odds, readTurn } from "./decisions.js";
import { getTurnDecider } from "./deciders.js";
import { extract, type ExtractPart } from "./helpers.js";
import { host, logError, toast } from "./host.js";
import { activeRecord, encounterLogOf, encounterSlots, foldPath, getMessages, patchMeta, patchWarpMeta, pathRevision, recordPath, warpMeta, writeRecord, type Msg, type Suggestion } from "./ledger.js";
import { writeLiveChoices } from "./live.js";
import { getSettings } from "./settings.js";
import { characterBrief, getRuleset } from "./source.js";
import { busyChats, pushState } from "./state-push.js";
import { compactLog, isQuiet, quietReply, type QuietRound } from "./encounter.js";
import { hasOperation, supersedeOperation } from "./operations.js";

export interface Pending {
  chatId: string;
  generationId?: string;
  historyRevision?: string;
  targetMessageId?: string;
  targetSwipe?: number;
  targetRecordRevision?: string;
  /** Continue extracts only the appended part; it never rerolls the original action. */
  continueFrom?: string;
  isCurrent?: () => boolean;
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
  /** A quiet encounter round typed in the chat: Warp wrote the reply itself (when the host allows it). */
  quiet?: QuietRound;
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
const closed = new Map<string, number>();
const completing = new Set<string>();
const generationKey = (chatId: string, id: string) => JSON.stringify([chatId, id]);

function closeGeneration(chatId: string, id: string) {
  closed.set(generationKey(chatId, id), Date.now());
  // Tombstones reject late callbacks without retaining every generation forever.
  for (const [key, at] of closed) if (Date.now() - at > 30 * 60_000 || closed.size > 1000) closed.delete(key);
}

function generationIsCurrent(chatId: string, id: string | null): boolean {
  if (id && closed.has(generationKey(chatId, id))) return false;
  const current = started.get(chatId);
  return !current || !id || current.generationId === id;
}

/** Prompt gates must follow the generation's active path, including an older target. */
export function generationHistory(chatId: string, messages: Msg[]): Msg[] {
  const generation = started.get(chatId);
  const target = generation?.targetMessageId ? messages.find((m) => m.id === generation.targetMessageId) : undefined;
  if (!target) return messages;
  return messages.filter((m) => generation?.generationType === "continue"
    ? m.index_in_chat <= target.index_in_chat : m.index_in_chat < target.index_in_chat);
}

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
  // Capture identity before awaiting: Stop can clear the host's started entry while we wait.
  const info = ctxInfo(ctx);
  try {
    const settings = await getSettings(ctx.userId);
    if (!settings.enabled) return messages;
    const loaded = await getRuleset(ctx.chatId, ctx.userId);
    const r = loaded?.ruleset;
    if (!r) return messages;

    const msgs = await getMessages(ctx.chatId);
    const target = targetOf(ctx, info.targetMessageId, msgs);
    const history = target ? msgs.filter((m) => m.index_in_chat < target.index_in_chat) : msgs;
    const { state: before, conflict } = foldPath(r, history, 0);
    if (conflict) {
      toast("warning", "Earlier history or rules changed. Review the recorded outcomes in the Warp sheet before continuing mechanics.", ctx.userId);
      return messages;
    }
    const player = await playerName(ctx.chatId, ctx.userId);

    let rec: TurnRecord | null = null;
    let after = before;

    if (ctx.generationType === "continue" && target) {
      // Continuing keeps the existing outcome; just remind the narrator of it.
      rec = activeRecord(target) ?? { v: 1, hints: [], events: [], at: Date.now() };
      if (rec) {
        after = cloneState(before);
        for (const e of rec.events) applyEvent(after, e, r);
      }
      if (!info.isDryRun && generationIsCurrent(ctx.chatId, info.generationId)) pending.set(info.generationId ?? ctx.chatId, {
        chatId: ctx.chatId, userId: ctx.userId, rec, after, playerText: "", ruleset: r, at: Date.now(),
        ...(info.generationId ? { generationId: info.generationId } : {}),
        targetMessageId: target.id, targetSwipe: target.swipe_id ?? 0,
        targetRecordRevision: JSON.stringify(activeRecord(target)), historyRevision: pathRevision(history),
        isCurrent: () => generationIsCurrent(ctx.chatId, info.generationId), continueFrom: target.content,
        outcome: outcomePacket(r, rec, before, after, player), player,
      });
    } else {
      const lastUser = history[history.length - 1]?.is_user ? history[history.length - 1] : null;
      const meta = lastUser ? warpMeta(lastUser) : {};
      let intent: Intent | null = meta.intent ?? null;
      let verdict: Pending["verdict"];
      let scene: Record<string, boolean> = {};
      let encounter: { id: string; foe?: string } | undefined;
      let confidence: number | undefined;
      let pendingSuggestion = !!meta.suggest && !intent;
      const sceneText = [...history].reverse().find((m) => !m.is_user)?.content ?? "";
      const budget = () => Math.min(20000, (typeof ctx.interceptorDeadlineAt === "number" ? ctx.interceptorDeadlineAt : Date.now() + 20000) - Date.now() - 2000);
      const decider = info.isDryRun ? null : await getTurnDecider(settings, ctx.userId);

      if (decider) {
        // One parallel batch: what the typed message attempts (if not already known) + plain-language triggers.
        const readText = !intent && !meta.judged && lastUser && settings.freeTextChecks ? lastUser.content : null;
        const reading = await readTurn({ decider, r, s: before, settings, playerText: readText, sceneText, player, timeoutMs: budget() });
        scene = reading.scene;
        encounter = reading.encounter;
        if (readText !== null && lastUser) {
          intent = reading.intent;
          confidence = reading.confidence;
          pendingSuggestion = !!reading.suggestion && !reading.intent;
          verdict = { messageId: lastUser.id, intent, suggestion: reading.suggestion };
        }
      }

      // Rolled when the choice was clicked (and told in the player's message): that roll, on every swipe.
      const seed = intent?.seed ?? (settings.swipesReroll ? randomSeed() : `${lastUser?.id ?? "start"}:${intent?.actionId ?? "none"}`);
      const playerText = lastUser?.content ?? "";
      let res = resolveTurnFull(r, before, intent, { seed, veils: settings.veils, scene, playerText, encounter, pendingSuggestion });
      if (decider && res.needs.length) {
        // Uncertain reactions: the model supplies odds, the same seed re-rolls the same dice with them.
        // Questions about who someone is (tastes, age) need the card, not just the scene.
        const card = res.needs.some((n) => n.id.startsWith("adult:")) ? await characterBrief(ctx.chatId, ctx.userId) : undefined;
        const o = await odds({ decider, r, s: before, specs: res.needs, playerText: lastUser?.content ?? "", sceneText, player, timeoutMs: budget(), card });
        if (Object.keys(o).length) res = resolveTurnFull(r, before, intent, { seed, veils: settings.veils, scene, odds: o, playerText, encounter, pendingSuggestion });
      }
      rec = res.record;
      if (confidence !== undefined && rec.action) rec.confidence = confidence;
      if (!info.isDryRun && !generationIsCurrent(ctx.chatId, info.generationId)) return messages;
      after = cloneState(before);
      for (const e of rec.events) applyEvent(after, e, r);
      if (!info.isDryRun) {
        if (!generationIsCurrent(ctx.chatId, info.generationId)) return messages;
        // Keep the revision that actually decided this turn. A later rule edit
        // must be reconciled rather than making old effects appear newly valid.
        rec.path = recordPath(r, history);
        pending.set(info.generationId ?? ctx.chatId, {
          chatId: ctx.chatId, userId: ctx.userId, rec, after,
          ...(info.generationId ? { generationId: info.generationId } : {}),
          historyRevision: pathRevision(history),
          ...(target ? { targetMessageId: target.id, targetSwipe: target.swipe_id ?? 0, targetRecordRevision: JSON.stringify(activeRecord(target)) } : {}),
          isCurrent: () => generationIsCurrent(ctx.chatId, info.generationId),
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

    // A running encounter's log reaches the narrator as one line, not the blow-by-blow.
    const shrunk = messages.map((lm) => {
      const m = history.find((h) => !h.is_user && h.content === textOf(lm.content) && encounterLogOf(h));
      const short = m ? compactLog(m) : null;
      return short ? { ...lm, content: short } : lm;
    });
    // What the turn is about: the player's message and the reply before it (and, continuing, the reply so far).
    const focus = [...history.slice(-2).map((m) => m.content), ctx.generationType === "continue" && target ? target.content : ""].join("\n");
    const text = buildInjection(r, rec, before, after, player, focus);
    const { messages: out, index } = injectInto(shrunk, text);
    const waiting = pending.get(info.generationId ?? ctx.chatId);
    // Typed in the chat during a quiet encounter: the round is told briefly by Warp, not by the narrator.
    if (waiting && rec && !info.isDryRun && ctx.generationType !== "continue" && isQuiet(r, before)) {
      const quiet = await quietReply({ chatId: ctx.chatId, userId: ctx.userId, r, before, after, rec, history, player, settings }).catch((e) => { logError("quiet round", e); return null; });
      if (quiet) {
        waiting.quiet = quiet;
        return { messages: out, breakdown: [{ messageIndex: index, name: "Warp game state" }], finalResponse: { content: quiet.content, fallbackMessageIndex: Math.max(0, out.length - 1) } };
      }
    }
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
  const { proposal, needsWriting } = await bookkeeping({ decider, r, s: p.after, playerText: p.playerText, reply, player: p.player, applied, storyQuests: settings.storyQuests });
  if (needsWriting.size) {
    const named = await extract(r, p.after, p.playerText, reply, settings, userId, needsWriting as Set<ExtractPart>, applied);
    if (named?.people) proposal.people = named.people;
    if (named?.items) proposal.items = { ...(proposal.items ?? {}), ...named.items };
    if (named?.move && !proposal.move) proposal.move = named.move;
    if (named?.feelings) proposal.feelings = { ...(proposal.feelings ?? {}), ...named.feelings };
    if (named?.used) proposal.used = { ...(proposal.used ?? {}), ...named.used };
    if (named?.quests?.new?.length) proposal.quests = { ...(proposal.quests ?? {}), new: named.quests.new };
    if (named?.memories) proposal.memories = named.memories;
  }
  return proposal;
}

/**
 * Everything after a reply lands: reading the story's changes, then live choices.
 */
export async function afterReply(p: Pending, msg: Msg, content: string, userId?: string): Promise<void> {
  const chatId = p.chatId;
  const settings = await getSettings(userId);
  const r = p.ruleset;
  const swipe = msg.swipe_id ?? 0;
  const expectedContent = msg.content;
  const initialMessages = await getMessages(chatId);
  const surroundings = pathRevision(initialMessages.filter((m) => m.id !== msg.id));
  const currentMessages = async (): Promise<Msg[] | null> => {
    if (p.isCurrent && !p.isCurrent()) return null;
    const messages = await getMessages(chatId);
    // Stop or a replacement generation can arrive while the host read is pending.
    if (p.isCurrent && !p.isCurrent()) return null;
    const target = messages.find((m) => m.id === msg.id);
    if (!target || (target.swipe_id ?? 0) !== swipe || target.content !== expectedContent) return null;
    if (pathRevision(messages.filter((m) => m.id !== msg.id)) !== surroundings) return null;
    return messages;
  };
  if (!await currentMessages()) return;
  const decider = await getTurnDecider(settings, userId);

  // Choices hidden: nobody would see them, so none are written.
  const wantLive = r.liveChoices.enabled && settings.showChoices;
  const appended = p.continueFrom !== undefined && content.startsWith(p.continueFrom) ? content.slice(p.continueFrom.length) : content;
  if (settings.narratorUpdates || wantLive) {
    host().sendToFrontend({ type: "busy", chatId, busy: true, label: "Updating state…" }, userId);
    const proposal = settings.narratorUpdates && appended.trim() ? await proposeChanges(decider, r, p, appended, settings, userId) : null;
    // Extraction extends the current record, preserving edits made while it ran.
    let committed = false;
    await patchWarpMeta(chatId, msg.id, async (w) => {
      const messages = await currentMessages();
      if (!messages) return w;
      const existing = w.swipes?.[String(swipe)];
      if (!existing || JSON.stringify(existing.action) !== JSON.stringify(p.rec.action)
        || JSON.stringify(existing.check) !== JSON.stringify(p.rec.check)
        || JSON.stringify(existing.events.slice(0, p.rec.events.length)) !== JSON.stringify(p.rec.events)) return w;
      const target = messages.find((m) => m.id === msg.id)!;
      const folded = foldPath(r, messages.filter((m) => m.index_in_chat <= target.index_in_chat), 0);
      if (folded.conflict) return w;
      const state = folded.state;
      const action = p.continueFrom === undefined && p.rec.action ? { id: p.rec.action.id, tags: actionTags(r, p.rec.action.id) } : undefined;
      const events = proposal ? applyProposal(r, state, proposal, { text: `${p.playerText}\n${appended}`, action }) : [];
      const rec = { ...existing, events: [...existing.events, ...events] };
      committed = true;
      // Invalidate old choices before writing replacements, including failed/empty output.
      return { ...w, swipes: { ...w.swipes, [String(swipe)]: rec },
        ...(wantLive ? { live: { ...w.live, [String(swipe)]: [] } } : {}) };
    });
    if (committed && wantLive) {
      const messages = await currentMessages();
      const target = messages?.find((m) => m.id === msg.id);
      if (!messages || !target) return;
      // Choices must see committed bookkeeping and every manual target-record edit.
      const revision = JSON.stringify(activeRecord(target));
      const folded = foldPath(r, messages.filter((m) => m.index_in_chat <= target.index_in_chat), 0);
      if (folded.conflict) return;
      const state = folded.state;
      const live = await writeLiveChoices({ r, s: state, reply: content, player: p.player, settings, userId, decider })
        .catch((e) => { logError("live choices", e); return []; });
      await patchWarpMeta(chatId, msg.id, async (w) => {
        const current = await currentMessages();
        if (!current || (p.isCurrent && !p.isCurrent()) || JSON.stringify(w.swipes?.[String(swipe)]) !== revision) return w;
        return { ...w, live: { ...w.live, [String(swipe)]: live } };
      });
    }
  }
}

export async function onGenerationStarted(payload: { generationId: string; chatId: string; targetMessageId?: string; generationType?: string }, userId?: string) {
  if (payload.generationType === "quiet" || payload.generationType === "impersonate") return;
  const { chatId } = payload;
  supersedeOperation(chatId);
  const previous = started.get(chatId);
  if (previous && previous.generationId !== payload.generationId) {
    closeGeneration(chatId, previous.generationId);
    pending.delete(previous.generationId);
    pending.delete(chatId);
  }
  started.set(chatId, { generationId: payload.generationId, targetMessageId: payload.targetMessageId, generationType: payload.generationType, at: Date.now() });
  busyChats.add(chatId);
  host().sendToFrontend({ type: "busy", chatId, busy: true }, userId);
}

/** Cancellation never books an incomplete reply, and late callbacks cannot reopen it. */
export async function onGenerationStopped(payload: { chatId: string; generationId?: string }, userId?: string) {
  const { chatId } = payload;
  if (!chatId) return;
  const current = started.get(chatId);
  const id = payload.generationId ?? current?.generationId;
  if (id) { closeGeneration(chatId, id); pending.delete(id); }
  const fallback = pending.get(chatId);
  if (fallback && (!id || !fallback.generationId || fallback.generationId === id)) pending.delete(chatId);
  // An old Stop must not unlock a newer generation in the same chat.
  if (current && id && current.generationId !== id) return;
  // Host cancellation cannot release an encounter or scene's local ownership.
  if (!current && hasOperation(chatId)) return;
  started.delete(chatId);
  busyChats.delete(chatId);
  host().sendToFrontend({ type: "busy", chatId, busy: false }, userId);
  await pushState(chatId, userId);
}

export async function onGenerationEnded(payload: { generationId: string; chatId: string; messageId?: string; content?: string; error?: string; generationType?: string }, userId?: string) {
  if (payload.generationType === "quiet" || payload.generationType === "impersonate") return;
  const token = generationKey(payload.chatId, payload.generationId);
  if (!generationIsCurrent(payload.chatId, payload.generationId) || completing.has(token)) return;
  // Match by generation id; fall back to the chat when the host didn't give the interceptor an id.
  const key = pending.has(payload.generationId) ? payload.generationId : payload.chatId;
  const p = pending.get(key);
  if (p?.generationId && p.generationId !== payload.generationId) return;
  pending.delete(key);
  completing.add(token);
  if (p && !payload.error) busyChats.add(payload.chatId);
  // Drop stale entries (generations that never reported back).
  for (const [id, x] of pending) if (Date.now() - x.at > 10 * 60_000) pending.delete(id);

  try {
    if (!p || payload.error || !payload.messageId) return;
    const originalGuard = p.isCurrent;
    p.isCurrent = () => generationIsCurrent(payload.chatId, payload.generationId) && (!originalGuard || originalGuard());
    const msgs = await getMessages(payload.chatId);
    if (!p.isCurrent()) return;
    const msg = msgs.find((m) => m.id === payload.messageId);
    if (!msg) return;
    const swipe = msg.swipe_id ?? 0;
    if ((p.targetMessageId && p.targetMessageId !== msg.id) || (p.targetSwipe !== undefined && p.targetSwipe !== swipe)
      || (p.historyRevision !== undefined && pathRevision(msgs.filter((m) => m.index_in_chat < msg.index_in_chat)) !== p.historyRevision)) {
      toast("info", "The chat changed while this reply was being written. Its game changes were not applied.", userId);
      return;
    }
    let attached = false;
    await patchWarpMeta(payload.chatId, msg.id, async (w, current) => {
      if (!p.isCurrent!() || (current.swipe_id ?? 0) !== swipe
        || (p.targetRecordRevision !== undefined && JSON.stringify(activeRecord(current)) !== p.targetRecordRevision)) return w;
      if (p.historyRevision !== undefined && pathRevision((await getMessages(payload.chatId)).filter((m) => m.index_in_chat < current.index_in_chat)) !== p.historyRevision) return w;
      attached = true;
      return { ...w, swipes: { ...w.swipes, [String(swipe)]: p.rec } };
    });
    if (!attached || !p.isCurrent()) return;
    if (p.verdict) {
      const { messageId, intent, suggestion } = p.verdict;
      await patchWarpMeta(payload.chatId, messageId, (w) => ({
        ...w, judged: true, ...(intent ? { intent } : {}), ...(suggestion ? { suggest: suggestion } : {}),
      })).catch((e) => logError("save verdict", e));
    }
    await pushState(payload.chatId, userId);
    // Warp wrote this reply (a quiet encounter round): it becomes the encounter's log; nothing to read back from it.
    if (p.quiet && (payload.content ?? msg.content).trim() === p.quiet.content.trim()) {
      await patchWarpMeta(payload.chatId, msg.id, (w, current) => ({ ...w, encounter: undefined, encounters: { ...encounterSlots(w), [String(current.swipe_id ?? 0)]: p.quiet!.log } }));
      if (p.quiet.log.status === "ended") await p.quiet.fold();
      await pushState(payload.chatId, userId);
      return;
    }
    if (payload.content) await afterReply(p, msg, payload.content, userId);
  } catch (e) {
    logError("generation ended", e);
  } finally {
    completing.delete(token);
    closeGeneration(payload.chatId, payload.generationId);
    const current = started.get(payload.chatId);
    if (!current || current.generationId === payload.generationId) {
      started.delete(payload.chatId);
      busyChats.delete(payload.chatId);
      host().sendToFrontend({ type: "busy", chatId: payload.chatId, busy: false }, userId);
      await pushState(payload.chatId, userId);
    }
  }
}
