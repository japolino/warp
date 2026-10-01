// The turn pipeline:
//   interceptor  → read intent + scene triggers (decider) → roll → odds for decide blocks → inject
//   generation end → attach the record to the new swipe → bookkeeping + consistency → push UI

import type { InterceptorContextDTO, InterceptorResultDTO, LlmMessageDTO } from "lumiverse-spindle-types";
import type { Decider } from "../engine/decide.js";
import { randomSeed } from "../engine/dice.js";
import { actionTags, applyProposal, resolveTurnFull, type Intent, type Proposal, type TurnRecord } from "../engine/resolve.js";
import type { Ruleset } from "../engine/ruleset.js";
import { applyEvent, cloneState, itemName, type GameState } from "../engine/state.js";
import { outcomePacket, sceneHints, stateDigest } from "../engine/view.js";
import { buildInjection, fillNames, injectInto } from "./inject.js";
import { dropPrewritten, judgeDrafts, prewrite, writeDrafts } from "./drafts.js";
import type { Settings } from "../shared/protocol.js";
import { bookkeeping, contradiction, odds, readTurn } from "./decisions.js";
import { getDecider } from "./deciders.js";
import { extract, type ExtractPart } from "./helpers.js";
import { host, logError, toast } from "./host.js";
import { activeRecord, foldPath, getMessages, patchMeta, patchWarpMeta, pinRuleset, requireCurrentPath, validRecord, warpMeta, writeRecord, type Msg, type Suggestion } from "./ledger.js";
import { writeLiveChoices } from "./live.js";
import { discoverPlace } from "./discover.js";
import { getSettings } from "./settings.js";
import { characterBrief, getRuleset } from "./source.js";
import { busyChats, pushState, schedulePush } from "./state-push.js";
import { resolveWithDecisions } from "./decision-loop.js";
import { chatCommand } from "./serial.js";

export interface Pending {
  chatId: string;
  userId?: string;
  rec: TurnRecord;
  after: GameState;
  origin?: GameState;
  playerText: string;
  ruleset: Ruleset;
  at: number;
  /** A fresh adjudicator verdict to save on the player's message once the reply lands. */
  verdict?: { messageId: string; intent: Intent | null; suggestion: Suggestion | null };
  outcome: string | null;
  player: string;
  /** The prompt this reply was written from (with Warp's block), for drafts and pre-writing. */
  prompt?: LlmMessageDTO[];
  generationId?: string;
  targetMessageId?: string;
  targetSwipe?: number;
  replyBefore?: string;
  stopped?: boolean;
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
const expiry = new Map<string, ReturnType<typeof setTimeout>>();
const finished = new Set<string>();
const cancelled = new Set<string>();
function cancelGeneration(chatId: string, generationId: string) {
  const token = `${chatId}:${generationId}`;
  if (cancelled.size >= 4096) cancelled.delete(cancelled.values().next().value!);
  cancelled.add(token);
  rememberFinished(token);
}
function rememberFinished(token: string) {
  if (finished.size >= 4096) finished.delete(finished.values().next().value!);
  finished.add(token);
}
const stillCurrent = (p: Pending) => !p.generationId || (!cancelled.has(`${p.chatId}:${p.generationId}`) && (!started.has(p.chatId) || started.get(p.chatId)?.generationId === p.generationId));

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
    let r = loaded?.ruleset;
    if (!r) return messages;

    const info = ctxInfo(ctx);
    const msgs = await getMessages(ctx.chatId);
    const target = targetOf(ctx, info.targetMessageId, msgs);
    const history = target ? msgs.filter((m) => m.index_in_chat < target.index_in_chat) : msgs;
    const fold = foldPath(r, history);
    requireCurrentPath(fold);
    const before = fold.state;
    r = fold.ruleset;
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
      if (!info.isDryRun && (!info.generationId || !finished.has(`${ctx.chatId}:${info.generationId}`))) pending.set(info.generationId ?? ctx.chatId, {
        chatId: ctx.chatId, userId: ctx.userId, rec: rec ?? { v: 1, hints: [], events: [], at: Date.now() }, after, origin: after, ruleset: r,
        at: Date.now(), playerText: "", player, outcome: rec ? outcomePacket(r, rec, before, after, player) : null, replyBefore: target.content,
      });
    } else {
      const lastUser = history[history.length - 1]?.is_user ? history[history.length - 1] : null;
      const meta = lastUser ? warpMeta(lastUser) : {};
      let intent: Intent | null = meta.intent ?? null;
      const frozen = !settings.swipesReroll && meta.accepted?.parent === fold.head && meta.accepted.actionId === (intent?.actionId ?? null) ? meta.accepted.inputs : null;
      let verdict: Pending["verdict"];
      let scene: Record<string, boolean> = {};
      let encounter: { id: string; foe?: string } | undefined;
      let confidence: number | undefined;
      const sceneText = [...history].reverse().find((m) => !m.is_user)?.content ?? "";
      const budget = () => Math.min(20000, (typeof ctx.interceptorDeadlineAt === "number" ? ctx.interceptorDeadlineAt : Date.now() + 20000) - Date.now() - 2000);
      const decider = info.isDryRun ? null : await getDecider(settings, ctx.userId);

      if (decider && !frozen) {
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

      if (frozen) { scene = frozen.scene; encounter = frozen.encounter; }
      const seed = frozen?.seed ?? (settings.swipesReroll ? randomSeed() : `${lastUser?.id ?? "start"}:${intent?.actionId ?? "none"}`);
      const playerText = lastUser?.content ?? "";
      const gameRules = r;
      const res = await resolveWithDecisions({
        resolve: (o) => resolveTurnFull(gameRules, before, intent, { seed, veils: settings.veils, scene, playerText, encounter, odds: o }),
        accepted: frozen?.odds,
        ask: frozen || !decider || decider.id === "rules" ? undefined : async (specs, remaining, signal) => {
          const card = specs.some((n) => n.id.startsWith("date:pref:") || n.id.startsWith("date:adult:")) ? await characterBrief(ctx.chatId, ctx.userId) : undefined;
          return odds({ decider, r: gameRules, s: before, specs, playerText, sceneText, player, timeoutMs: Math.min(remaining, budget()), card, signal });
        },
        deadlineAt: Date.now() + Math.max(0, budget()),
      });
      rec = res.record;
      rec.commandId = meta.commandId;
      rec.parent = fold.head;
      rec.rulesRevision = fold.revision;
      if (confidence !== undefined && rec.action) rec.confidence = confidence;
      // Exploring found somewhere new: invent it, save it to the ruleset, step into it.
      if (rec.discover && !info.isDryRun && loaded) {
        await pinRuleset(ctx.chatId, r);
        await discoverPlace(loaded, r, before, rec, ctx.chatId, settings, ctx.userId);
      }
      after = cloneState(before);
      for (const e of rec.events) applyEvent(after, e, r);
      if (!info.isDryRun && (!info.generationId || !finished.has(`${ctx.chatId}:${info.generationId}`)) && (!started.has(ctx.chatId) || started.get(ctx.chatId)?.generationId === info.generationId)) {
        pending.set(info.generationId ?? ctx.chatId, {
          chatId: ctx.chatId, userId: ctx.userId, rec, after, origin: before,
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
    if (waiting && !info.isDryRun) {
      waiting.prompt = out;
      waiting.generationId = info.generationId ?? undefined;
      waiting.targetMessageId = target?.id ?? undefined;
      waiting.targetSwipe = target?.swipe_id ?? 0;
      if (target && info.generationId) {
        await pinRuleset(ctx.chatId, r);
        const prepared = { generationId: info.generationId, record: waiting.rec, playerText: waiting.playerText, player, outcome: waiting.outcome, at: waiting.at, replyBefore: waiting.replyBefore, verdict: waiting.verdict };
        await patchWarpMeta(ctx.chatId, target.id, (w) => ({ ...w, prepared: { ...w.prepared, [String(waiting.targetSwipe)]: prepared } }));
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
  const { proposal, needsWriting } = await bookkeeping({ decider, r, s: p.after, playerText: p.playerText, reply, player: p.player, applied });
  if (needsWriting.size) {
    const named = await extract(r, p.after, p.playerText, reply, settings, userId, needsWriting as Set<ExtractPart>, applied);
    if (named?.people) proposal.people = named.people;
    if (named?.items) {
      const items: Record<string, number> = {};
      for (const [key, value] of Object.entries(named.items)) {
        const id = [...new Set([...Object.keys(r.items), ...Object.keys(p.after.items), ...Object.keys(p.origin?.items ?? {})])].find((id) => id === key.toLowerCase() || itemName(r, p.after, id).toLowerCase() === key.toLowerCase());
        const already = id && p.origin ? (p.after.items[id] ?? 0) - (p.origin.items[id] ?? 0) : 0;
        if (typeof value === "number" && Number.isFinite(value)) items[key] = value - already;
      }
      proposal.items = { ...proposal.items, ...items };
    }
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
  if (settings.drafts > 1 && p.prompt && decider.id !== "rules" && p.replyBefore === undefined && !p.stopped) {
    host().sendToFrontend({ type: "busy", chatId, busy: true, label: `Writing ${settings.drafts - 1} more draft${settings.drafts > 2 ? "s" : ""}…` }, userId);
    const extra = await writeDrafts(p.prompt, settings.drafts - 1, userId);
    if (!stillCurrent(p)) return;
    if (extra.length) {
      const all = [content, ...extra];
      const pick = await judgeDrafts(decider, all, p.outcome ? fillNames(p.outcome, p.player) : null, fillNames(stateDigest(r, p.after), p.player));
      const swipes = [...(msg.swipes?.length ? msg.swipes : [content]), ...extra];
      const base = swipes.length - extra.length;
      const dates = [...(msg.swipe_dates ?? []), ...extra.map(() => Math.floor(Date.now() / 1000))];
      await host().chat.updateMessage(chatId, msg.id, { swipes, swipe_dates: dates, ...(pick > 0 ? { swipe_id: base + pick - 1 } : {}) });
      // Every draft carries the same decided outcome, so swiping between them keeps the state.
      for (let i = 0; i < extra.length; i++) await writeRecord(chatId, msg.id, base + i, p.rec, r);
      if (pick > 0) { swipe = base + pick - 1; content = all[pick]; }
    }
  }

  const wantLive = r.liveChoices.enabled;
  if (settings.narratorUpdates || settings.consistencyCheck || wantLive) {
    host().sendToFrontend({ type: "busy", chatId, busy: true, label: "Updating state…" }, userId);
    const [proposal, contra, live] = await Promise.all([
      settings.narratorUpdates ? proposeChanges(decider, r, p, p.replyBefore !== undefined ? content.slice(p.replyBefore.length) : content, settings, userId) : Promise.resolve(null),
      settings.consistencyCheck && decider.id !== "rules"
        ? contradiction({ decider, r, s: p.after, reply: content, outcome: p.outcome })
        : Promise.resolve(null),
      wantLive
        ? writeLiveChoices({ r, s: p.after, reply: content, player: p.player, settings, userId, decider })
        : Promise.resolve([]),
    ]);
    if (!stillCurrent(p)) return;
    const rec: TurnRecord = { ...p.rec };
    if (proposal) {
      const action = p.rec.action ? { id: p.rec.action.id, tags: actionTags(r, p.rec.action.id) } : undefined;
      const rejected: string[] = [];
      const events = applyProposal(r, p.after, proposal, { text: `${p.playerText}\n${content}`, action, applied: p.replyBefore === undefined ? p.rec.events : [], origin: p.origin, rejected });
      if (rejected.length) rec.rejected = [...(rec.rejected ?? []), ...rejected];
      if (events.length) rec.events = [...rec.events, ...events];
    }
    if (contra !== null) rec.contradiction = contra;
    if (rec.events !== p.rec.events || rec.rejected || contra !== null) await writeRecord(chatId, msg.id, swipe, rec, r);
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
  dropPrewritten(chatId);
  const old = started.get(chatId);
  if (old && old.generationId !== payload.generationId) { cancelGeneration(chatId, old.generationId); pending.delete(old.generationId); }
  for (const [id, p] of pending) if (p.chatId === chatId && p.generationId !== payload.generationId) { if (p.generationId) cancelGeneration(chatId, p.generationId); pending.delete(id); }
  pending.delete(chatId);
  const timer = expiry.get(chatId);
  if (timer) clearTimeout(timer);
  started.set(chatId, { generationId: payload.generationId, targetMessageId: payload.targetMessageId, generationType: payload.generationType, at: Date.now() });
  busyChats.add(chatId);
  host().sendToFrontend({ type: "busy", chatId, busy: true }, userId);
  const timeout = setTimeout(() => {
    if (started.get(chatId)?.generationId !== payload.generationId) return;
    cancelGeneration(chatId, payload.generationId);
    started.delete(chatId); pending.delete(payload.generationId); pending.delete(chatId); expiry.delete(chatId); busyChats.delete(chatId);
    host().sendToFrontend({ type: "busy", chatId, busy: false }, userId);
    schedulePush(chatId, userId, 0);
  }, 15 * 60_000);
  (timeout as unknown as { unref?: () => void }).unref?.();
  expiry.set(chatId, timeout);
}

export async function onGenerationEnded(payload: { generationId: string; chatId: string; messageId?: string; content?: string; error?: string; generationType?: string }, userId?: string) {
  return finishGeneration(payload, userId, false);
}

/** A stopped reply with retained prose commits its outcome; an empty reply aborts it. */
export async function onGenerationStopped(payload: { generationId: string; chatId: string; content?: string }, userId?: string) {
  return finishGeneration(payload, userId, true);
}

async function finishGeneration(payload: { generationId: string; chatId: string; messageId?: string; content?: string; error?: string }, userId: string | undefined, stopped: boolean) {
  const token = `${payload.chatId}:${payload.generationId}`;
  return chatCommand(payload.chatId, async () => {
    const current = started.get(payload.chatId);
    if (finished.has(token) || (current && current.generationId !== payload.generationId)) return;
    let p = pending.get(payload.generationId) ?? pending.get(payload.chatId);
    if (p?.generationId && p.generationId !== payload.generationId) return;
    pending.delete(payload.generationId); pending.delete(payload.chatId);
    rememberFinished(token);
    busyChats.add(payload.chatId);
    let clearPrepared: (() => Promise<unknown>) | undefined;
    try {
      const msgs = await getMessages(payload.chatId);
      let target = msgs.find((m) => m.id === (p?.targetMessageId ?? payload.messageId ?? current?.targetMessageId));
      // Prepared records survive a worker restart. Match the generation, never just the latest message.
      if (!p) {
        for (const m of msgs) {
          const found = Object.entries(warpMeta(m).prepared ?? {}).find(([, x]) => x.generationId === payload.generationId && Date.now() - x.at < 15 * 60_000 && validRecord(x.record));
          if (!found) continue;
          const [slot, prepared] = found;
          const loaded = await getRuleset(payload.chatId, userId);
          if (!loaded?.ruleset) break;
          const fold = foldPath(loaded.ruleset, msgs.filter((x) => x.index_in_chat < m.index_in_chat));
          requireCurrentPath(fold);
          const after = cloneState(fold.state);
          for (const e of prepared.record.events) applyEvent(after, e, fold.ruleset);
          p = { chatId: payload.chatId, userId, generationId: payload.generationId, targetMessageId: m.id, targetSwipe: Number(slot), rec: prepared.record, after, origin: prepared.replyBefore === undefined ? fold.state : after, ruleset: fold.ruleset,
            playerText: prepared.playerText, player: prepared.player, outcome: prepared.outcome, at: prepared.at, replyBefore: prepared.replyBefore, verdict: prepared.verdict };
          target = m;
          break;
        }
      }
      if (!p || !target) return;
      if (p.targetMessageId && payload.messageId && p.targetMessageId !== payload.messageId) throw new Error("Generation ended on a different message than it started.");
      const swipe = p.targetSwipe ?? target.swipe_id ?? 0;
      const content = target.swipe_id === swipe ? (payload.content ?? target.content) : target.swipes?.[swipe] ?? "";
      clearPrepared = () => patchWarpMeta(payload.chatId, target!.id, (w) => {
        const prepared = { ...w.prepared };
        if (prepared[String(swipe)]?.generationId === payload.generationId) delete prepared[String(swipe)];
        return { ...w, prepared };
      });
      if (payload.error) { toast("warning", `Warp: the reply failed; its prepared outcome was discarded. ${payload.error}`, userId); return; }
      if (!content.trim() || (p.replyBefore !== undefined && !content.startsWith(p.replyBefore))) { await clearPrepared(); return; }
      const fold = foldPath(p.ruleset, msgs.filter((m) => m.index_in_chat < target!.index_in_chat));
      requireCurrentPath(fold);
      if (p.rec.parent && p.rec.parent !== fold.head) throw new Error("The story changed while this reply was being generated. Regenerate the reply to resolve it on the current path.");
      if (!stillCurrent(p)) return;
      p.stopped = stopped;
      await writeRecord(payload.chatId, target.id, swipe, p.rec, p.ruleset);
      await clearPrepared();
      const user = [...msgs].reverse().find((m) => m.is_user && m.index_in_chat < target!.index_in_chat);
      if (p.verdict || (user && p.replyBefore === undefined)) {
        const verdict = p.verdict;
        await patchWarpMeta(payload.chatId, verdict?.messageId ?? user!.id, (w) => ({
          ...w, judged: true, ...(verdict?.intent ? { intent: verdict.intent } : {}), ...(verdict?.suggestion ? { suggest: verdict.suggestion } : {}),
          ...(p!.rec.inputs ? { accepted: { parent: p!.rec.parent ?? fold.head, actionId: p!.rec.action?.id ?? null, inputs: p!.rec.inputs } } : {}),
        })).catch((e) => logError("save verdict", e));
      }
      await afterReply(p, { ...target, swipe_id: swipe, content }, content, userId);
    } catch (e) {
      logError(stopped ? "generation stopped" : "generation ended", e);
      toast("warning", `Warp: ${e instanceof Error ? e.message : String(e)}`, userId);
    } finally {
      if (clearPrepared) await clearPrepared().catch((e) => logError("discard preparation", e));
      if (!started.has(payload.chatId) || started.get(payload.chatId)?.generationId === payload.generationId) {
        const timer = expiry.get(payload.chatId); if (timer) clearTimeout(timer);
        expiry.delete(payload.chatId); started.delete(payload.chatId); busyChats.delete(payload.chatId);
        host().sendToFrontend({ type: "busy", chatId: payload.chatId, busy: false }, userId);
        await pushState(payload.chatId, userId);
      }
    }
  });
}
