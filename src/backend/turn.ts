// The turn pipeline (CORE-DESIGN §2.0, JEV-ROUTING §5):
//   interceptor     → wait for the last reply's commit → greeting read (once) → typed read (only risky typed text)
//                     → resolve (seeded dice) → Jev odds for decide blocks → inject the <warp> block
//   generation end  → attach the record → ONE post-reply pass:
//                       Jev:    Jev A (bookkeeping) → commit → helper W (choices + flagged texts) → Jev B → commit
//                       helper: helper W (the same questions + choices + texts) → commit
// Every model call is counted on the turn's record (`calls`).

import type { InterceptorContextDTO, InterceptorResultDTO, LlmMessageDTO } from "lumiverse-spindle-types";
import type { Decider } from "../engine/decide.js";
import { randomSeed } from "../engine/dice.js";
import { actionTags, applyProposal, resolveTurnFull, type Intent, type LiveChoice, type Proposal, type TurnRecord } from "../engine/resolve.js";
import type { Difficulty, Ruleset } from "../engine/ruleset.js";
import { applyEvent, cloneState, type GameState } from "../engine/state.js";
import { outcomePacket, sceneHints, stateDigest } from "../engine/view.js";
import type { Settings } from "../shared/protocol.js";
import { buildInjection, fillNames, injectInto } from "./inject.js";
import { getTurnDecider } from "./deciders.js";
import { addCalls, newMeter, safeAsk, type CallMeter } from "./decisions.js";
import { ensureGreeting } from "./greeting.js";
import { host, logError, toast } from "./host.js";
import { activeRecord, foldPath, getMessages, patchMeta, patchWarpMeta, pathRevision, recordPath, warpMeta, type Msg, type WarpMeta } from "./ledger.js";
import { cleanChoices, liveCount, liveWanted, rankKinds, recentTagUses, usableTags } from "./live.js";
import {
  applyTexts, bookkeepingFromAnswers, bookkeepingQuestions, choiceDifficulty, choiceQuestions, contestReadQuestions,
  contestReadVerdict, decideQuestions, needsRead, oddsFromAnswers, readQuestions, readVerdict, splitTyped, textChecks,
  THRESHOLDS, type Bookkeeping, type Provider, type Thresholds, type Verdict,
} from "./questions.js";
import { getSettings } from "./settings.js";
import { characterBrief, getRuleset } from "./source.js";
import { busyChats, pushState } from "./state-push.js";
import { writeTurn } from "./write.js";

export interface Pending {
  chatId: string;
  generationId?: string;
  historyRevision?: string;
  targetMessageId?: string;
  targetSwipe?: number;
  targetRecordRevision?: string;
  /** Continue reads only the appended part; it never rerolls the original action. */
  continueFrom?: string;
  isCurrent?: () => boolean;
  userId?: string;
  rec: TurnRecord;
  after: GameState;
  playerText: string;
  ruleset: Ruleset;
  at: number;
  /** What the typed read (or Jev's odds) decided, saved on the player's message once the reply lands. */
  verdict?: { messageId: string; judged: boolean; intent: Intent | null; contest?: { kind: string; opponent: string; threat?: Difficulty }; odds?: Record<string, Record<string, number>>; confidence?: number };
  outcome: string | null;
  player: string;
  /** Calls made before the reply (the typed read, Jev's odds). */
  calls: CallMeter;
}

/** Keyed by generation id when the host gives us one, otherwise by chat id. */
const pending = new Map<string, Pending>();
const playerNames = new Map<string, string>();

/**
 * What GENERATION_STARTED told us, per chat. Lumiverse fires it before prompt assembly, and the interceptor
 * context itself doesn't carry the generation id or target message — so this is how the interceptor knows which
 * message is being written (the host pre-stages an empty reply / blank swipe for it).
 */
interface Started { generationId: string; targetMessageId?: string; generationType?: string; at: number }
const started = new Map<string, Started>();
const closed = new Map<string, number>();
const completing = new Set<string>();
/** A reply that landed and whose post-reply pass is still running, per chat. The next turn waits for it. */
const posts = new Map<string, { id: string; done: Promise<void> }>();
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

/** The narrator is writing a reply right now (a post-reply pass doesn't count: clicks are welcome then). */
export function narratorWriting(chatId: string): boolean {
  const s = started.get(chatId);
  return !!s && posts.get(chatId)?.id !== s.generationId;
}

/**
 * Wait for the previous reply's post-reply commit, so this turn starts from it (no button lock needed).
 * On timeout its late result is dropped rather than changing the state under this turn.
 */
async function waitForPost(chatId: string, self: string | null, ms: number): Promise<void> {
  const w = posts.get(chatId);
  if (!w || w.id === self || ms <= 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = await Promise.race([
    w.done.then(() => false),
    new Promise<boolean>((done) => { timer = setTimeout(() => done(true), ms); }),
  ]);
  if (timer) clearTimeout(timer);
  if (late) closeGeneration(chatId, w.id);
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

export async function playerName(chatId: string, _userId?: string): Promise<string> {
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
 * Which message is being written. Lumiverse creates it before the interceptor runs (an empty staged reply for
 * normal sends, a blank new swipe for swipes/regens), so the history for this turn is everything *before* it.
 */
function targetOf(ctx: InterceptorContextDTO, targetId: string | null, msgs: Msg[]): Msg | null {
  if (targetId) {
    const hit = msgs.find((m) => m.id === targetId);
    if (hit) return hit;
  }
  if (ctx.generationType === "swipe" || ctx.generationType === "regenerate" || ctx.generationType === "continue") {
    for (let i = msgs.length - 1; i >= 0; i--) if (!msgs[i].is_user) return msgs[i];
  }
  const last = msgs[msgs.length - 1];
  if (last && !last.is_user && !last.content.trim()) return last;
  return null;
}

const providerOf = (d: Decider): Provider => (d.id === "jev" ? "jev" : "llm");
/** The provider's thresholds. */
const thresholdsOf = (d: Decider): Thresholds => THRESHOLDS[providerOf(d)];

const readFailures = new Map<string, number>();

/**
 * The typed read R (CORE-DESIGN §2.0.2 step 2). Quoted dialogue never reaches a model; the helper also skips
 * short and everyday text. In a running contest without Jev there is no read: the message is the move.
 * Returns null when nothing was asked (or the read failed), so the verdict isn't saved and a swipe may retry.
 */
async function readTyped(o: { decider: Decider; r: Ruleset; s: GameState; text: string; scene: string; player: string; settings: Settings; timeoutMs: number; meter: CallMeter; userId?: string }): Promise<{ verdict: Verdict; asked: boolean } | null> {
  const { decider, r, s } = o;
  const provider = providerOf(decider);
  const none = { verdict: { intent: null, confidence: 0 }, asked: false };
  if (r.style !== "adventure") return none;
  let res: { answers: import("../engine/decide.js").Answers; ok: boolean };
  if (s.contest) {
    if (provider !== "jev") return none;
    const q = contestReadQuestions(r, s, { split: splitTyped(o.text), text: o.text, scene: o.scene, player: o.player });
    res = await safeAsk(decider, q.state, q.questions, Math.min(o.timeoutMs, 2500), "contest read", o.meter);
    if (!res.ok) return failed(o);
    return { verdict: contestReadVerdict(r, s, res.answers, thresholdsOf(decider)), asked: true };
  }
  const split = splitTyped(o.text);
  if (!needsRead(r, split, provider)) return none;
  const q = readQuestions({ r, s, split, scene: o.scene, player: o.player, lines: o.settings.lines });
  if (!Object.keys(q.questions).length) return none;
  res = await safeAsk(decider, q.state, q.questions, provider === "jev" ? Math.min(o.timeoutMs, 2500) : o.timeoutMs, "typed read", o.meter);
  if (!res.ok) return failed(o);
  return { verdict: readVerdict(r, s, res.answers, q.meta, thresholdsOf(decider)), asked: true };
}

function failed(o: { userId?: string }): null {
  const k = o.userId ?? "_";
  const last = readFailures.get(k) ?? 0;
  if (Date.now() - last > 10 * 60_000) toast("info", "The decision model didn't answer in time, so this message isn't rolled.", o.userId);
  readFailures.set(k, Date.now());
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
    const budget = () => Math.min(20000, (typeof ctx.interceptorDeadlineAt === "number" ? ctx.interceptorDeadlineAt : Date.now() + 20000) - Date.now() - 2000);

    if (!info.isDryRun) {
      // 0. The previous reply's post-reply commit, so this turn uses the committed state.
      await waitForPost(ctx.chatId, info.generationId, Math.min(15000, budget()));
      // 1. The greeting read, once per greeting swipe, before the first turn.
      await ensureGreeting(ctx.chatId, ctx.userId).catch((e) => logError("greeting read", e));
    }

    const msgs = await getMessages(ctx.chatId);
    const target = targetOf(ctx, info.targetMessageId, msgs);
    const history = target ? msgs.filter((m) => m.index_in_chat < target.index_in_chat) : msgs;
    const { state: before, conflict } = foldPath(r, history, 0);
    if (conflict) {
      toast("warning", "Earlier history or rules changed. Review the recorded outcomes in the Warp sheet before continuing mechanics.", ctx.userId);
      return messages;
    }
    const player = await playerName(ctx.chatId, ctx.userId);
    const meter = newMeter();

    let rec: TurnRecord | null = null;
    let after = before;

    if (ctx.generationType === "continue" && target) {
      // Continuing keeps the existing outcome; just remind the narrator of it.
      rec = activeRecord(target) ?? { v: 1, hints: [], events: [], at: Date.now() };
      after = cloneState(before);
      for (const e of rec.events) applyEvent(after, e, r);
      if (!info.isDryRun && generationIsCurrent(ctx.chatId, info.generationId)) pending.set(info.generationId ?? ctx.chatId, {
        chatId: ctx.chatId, userId: ctx.userId, rec, after, playerText: "", ruleset: r, at: Date.now(),
        ...(info.generationId ? { generationId: info.generationId } : {}),
        targetMessageId: target.id, targetSwipe: target.swipe_id ?? 0,
        targetRecordRevision: JSON.stringify(activeRecord(target)), historyRevision: pathRevision(history),
        isCurrent: () => generationIsCurrent(ctx.chatId, info.generationId), continueFrom: target.content,
        outcome: outcomePacket(r, rec, before, after, player), player, calls: newMeter(),
      });
    } else {
      const lastUser = history[history.length - 1]?.is_user ? history[history.length - 1] : null;
      const meta: WarpMeta = lastUser ? warpMeta(lastUser) : {};
      let intent: Intent | null = meta.intent ?? null;
      let contest = meta.verdict?.contest;
      let odds = { ...(meta.verdict?.odds ?? {}) };
      let confidence = meta.verdict?.confidence;
      let verdict: Pending["verdict"];
      const prevReply = [...history].reverse().find((m) => !m.is_user) ?? null;
      const sceneText = prevReply?.content ?? "";
      // when_scene answers come from the previous reply's post-reply read (no pre-reply scene call).
      const scene = prevReply ? activeRecord(prevReply)?.sceneRead ?? {} : {};
      const decider = info.isDryRun ? null : await getTurnDecider(settings, ctx.userId);

      if (decider && lastUser && !meta.intent && !meta.judged) {
        const read = await readTyped({ decider, r, s: before, text: lastUser.content, scene: sceneText, player, settings, timeoutMs: budget(), meter, userId: ctx.userId });
        if (read) {
          intent = read.verdict.intent;
          contest = read.verdict.contest;
          confidence = read.asked ? read.verdict.confidence : undefined;
          verdict = { messageId: lastUser.id, judged: true, intent, ...(contest ? { contest } : {}), ...(confidence !== undefined ? { confidence } : {}) };
        }
      }

      // One reroll rule for typed and clicked moves: Casual = a fresh seed per generation, Ironman = per message and move.
      const seed = settings.swipesReroll ? randomSeed() : `${lastUser?.id ?? "start"}:${intent?.actionId ?? "none"}`;
      const playerText = lastUser?.content ?? "";
      const opts = { seed, veils: settings.veils, scene, playerText, ...(contest && !before.contest ? { contest } : {}) };
      let res = resolveTurnFull(r, before, intent, { ...opts, odds });
      if (decider?.id === "jev" && res.needs.length) {
        // Uncertain reactions: Jev gives odds just in time; the same seed rolls the same dice with them.
        // Without Jev the author's weights are used (a second pre-reply helper call would break the budget).
        const card = res.needs.some((n) => n.id.startsWith("adult:")) ? await characterBrief(ctx.chatId, ctx.userId) : undefined;
        const state = { game_state: stateDigest(r, before), scene_so_far: sceneText.slice(-2000), player_message: playerText.slice(-1200), ...(card ? { character_card: card } : {}) };
        const asked = await safeAsk(decider, state, decideQuestions(res.needs, player), Math.min(budget(), 2500), "decide odds", meter);
        const o = oddsFromAnswers(res.needs, asked.answers);
        if (Object.keys(o).length) {
          odds = { ...odds, ...o };
          res = resolveTurnFull(r, before, intent, { ...opts, odds });
          if (lastUser) verdict = { ...(verdict ?? { messageId: lastUser.id, judged: !!meta.judged, intent }), odds };
        }
      }
      rec = res.record;
      if (confidence !== undefined && rec.action) rec.confidence = confidence;
      rec.calls = { ...meter };
      if (!info.isDryRun && !generationIsCurrent(ctx.chatId, info.generationId)) return messages;
      after = cloneState(before);
      for (const e of rec.events) applyEvent(after, e, r);
      if (!info.isDryRun) {
        // Keep the revision that actually decided this turn. A later rule edit
        // must be reconciled rather than making old effects appear newly valid.
        rec.path = recordPath(r, history);
        pending.set(info.generationId ?? ctx.chatId, {
          chatId: ctx.chatId, userId: ctx.userId, rec, after,
          ...(info.generationId ? { generationId: info.generationId } : {}),
          historyRevision: pathRevision(history),
          ...(target ? { targetMessageId: target.id, targetSwipe: target.swipe_id ?? 0, targetRecordRevision: JSON.stringify(activeRecord(target)) } : {}),
          isCurrent: () => generationIsCurrent(ctx.chatId, info.generationId),
          playerText, ruleset: r, at: Date.now(), verdict,
          outcome: outcomePacket(r, rec, before, after, player), player, calls: { ...meter },
        });
        // No tier is shown before the narrator writes it.
        if (rec.check) host().sendToFrontend({ type: "busy", chatId: ctx.chatId, busy: true, label: "The story continues…" }, ctx.userId);
        // Moods for the visual-novel extension, on the message this reply answers (there before the reply is planned).
        if (lastUser) {
          const hints = sceneHints(r, after);
          void patchMeta(ctx.chatId, lastUser.id, "vn_hints", hints ? fillHints(hints, player) : undefined).catch((e) => logError("scene hints", e));
        }
      }
    }

    // What the turn is about: the player's message and the reply before it (and, continuing, the reply so far).
    const focus = [...history.slice(-2).map((m) => m.content), ctx.generationType === "continue" && target ? target.content : ""].join("\n");
    const text = buildInjection(r, rec, before, after, player, focus);
    const { messages: out, index } = injectInto(messages, text);
    return { messages: out, breakdown: [{ messageIndex: index, name: "Warp game state" }] };
  } catch (e) {
    logError("interceptor", e);
    return messages;
  }
}

/**
 * Everything after a reply lands, in one pass (JEV-ROUTING §5.1): the story's changes, the texts they need and
 * the choices for the next move. Narrator + at most one helper call; Jev calls are batched.
 */
export async function afterReply(p: Pending, msg: Msg, content: string, userId?: string): Promise<void> {
  const chatId = p.chatId;
  const settings = await getSettings(userId);
  const r = p.ruleset;
  const swipe = msg.swipe_id ?? 0;
  const expectedContent = msg.content;
  const initialMessages = await getMessages(chatId);
  const initialTarget = initialMessages.find((m) => m.id === msg.id);
  if (!initialTarget) return;
  // Only what came before the reply matters: the next turn's messages may arrive while this runs.
  const historyOf = (messages: Msg[], t: Msg) => pathRevision(messages.filter((m) => m.index_in_chat < t.index_in_chat));
  const surroundings = historyOf(initialMessages, initialTarget);
  const currentMessages = async (): Promise<Msg[] | null> => {
    if (p.isCurrent && !p.isCurrent()) return null;
    const messages = await getMessages(chatId);
    // Stop or a replacement generation can arrive while the host read is pending.
    if (p.isCurrent && !p.isCurrent()) return null;
    const target = messages.find((m) => m.id === msg.id);
    if (!target || (target.swipe_id ?? 0) !== swipe || target.content !== expectedContent) return null;
    if (historyOf(messages, target) !== surroundings) return null;
    return messages;
  };
  if (!await currentMessages()) return;
  const decider = await getTurnDecider(settings, userId);
  const meter = newMeter();
  const state0 = p.after;

  const appended = p.continueFrom !== undefined && content.startsWith(p.continueFrom) ? content.slice(p.continueFrom.length) : content;
  const read = !!appended.trim();
  const choicesFor = (s: GameState) => (settings.showChoices && liveWanted(r, s) ? liveCount(r, s) : 0);
  const tagsFor = (s: GameState) => (s.contest ? [] : usableTags(r, settings, s));
  const want = (s: GameState) => { const n = choicesFor(s); return n > 0 && (s.contest || tagsFor(s).length) ? n : 0; };
  if (!read && !want(state0)) return;
  host().sendToFrontend({ type: "busy", chatId, busy: true, label: "Writing choices…" }, userId);
  const applied = p.outcome ? fillNames(p.outcome, p.player) : null;
  const recent = recentTagUses(r, state0);
  const action = p.continueFrom === undefined && p.rec.action ? { id: p.rec.action.id, tags: actionTags(r, p.rec.action.id) } : undefined;

  /** Commit events (from a proposal), scene answers and choices to this reply's record, keeping edits made meanwhile. */
  const commit = async (o: { proposal?: Proposal | null; sceneRead?: Record<string, boolean>; choices?: (s: GameState) => LiveChoice[] }): Promise<GameState | null> => {
    let out: GameState | null = null;
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
      const events = o.proposal ? applyProposal(r, folded.state, o.proposal, { text: `${p.playerText}\n${appended}`, action }) : [];
      const now = cloneState(folded.state);
      for (const e of events) applyEvent(now, e, r);
      const rec: TurnRecord = {
        ...existing, events: [...existing.events, ...events],
        ...(o.sceneRead && Object.keys(o.sceneRead).length ? { sceneRead: { ...existing.sceneRead, ...o.sceneRead } } : {}),
        calls: addCalls(p.calls, meter),
      };
      out = now;
      return { ...w, swipes: { ...w.swipes, [String(swipe)]: rec }, ...(o.choices ? { live: { ...w.live, [String(swipe)]: o.choices(now) } } : {}) };
    });
    return out;
  };

  const empty: Bookkeeping = { proposal: {}, sceneRead: {}, tasks: [], kinds: null };
  if (decider.id === "jev" && read) {
    // Jev A: the bookkeeping questions (and the live-choice kinds) in one batch.
    const n0 = want(state0);
    const A = bookkeepingQuestions({ r, s: state0, playerText: p.playerText, reply: appended, player: p.player, applied, tags: n0 && !state0.contest ? tagsFor(state0) : [] });
    const a = await safeAsk(decider, A.state, A.questions, 6000, "bookkeeping", meter);
    if (a.ok) {
      const book = bookkeepingFromAnswers(r, state0, a.answers, A.meta, THRESHOLDS.jev);
      const committed = await commit({ proposal: book.proposal, sceneRead: book.sceneRead });
      if (!committed) return;
      await pushState(chatId, userId);
      // The helper writes the choices and only the texts Jev flagged, against the committed state.
      const n = want(committed);
      const tags = tagsFor(committed);
      const kinds = book.kinds && n && !committed.contest ? rankKinds(book.kinds, recent, n) : null;
      if (!n && !book.tasks.length) return;
      const w = await writeTurn({ r, s: committed, reply: content, playerText: p.playerText, player: p.player, mode: "text", tasks: book.tasks, tags, kinds, count: n, recent, settings, userId, meter });
      let choices = cleanChoices(r, committed, tags, w.choices, n);
      // Jev B: the difficulty of each written choice (odds follow the words), and a check of new look lines.
      const B = choiceQuestions(r, committed, choices, w.texts, content, p.player);
      let drop = new Set<string>();
      if (Object.keys(B.questions).length) {
        const b = await safeAsk(decider, B.state, B.questions, 3000, "choice difficulty", meter);
        if (b.ok) { choices = choiceDifficulty(r, choices, b.answers); drop = textChecks(b.answers); }
      }
      const texts = applyTexts(r, committed, {}, book.tasks, w.texts, drop);
      await commit({ proposal: texts, choices: (s) => (n ? cleanChoices(r, s, tagsFor(s), choices, n) : []) });
      return;
    }
    // Jev failed: the helper answers the same questions in its one call.
  }
  const A = read ? bookkeepingQuestions({ r, s: state0, playerText: p.playerText, reply: appended, player: p.player, applied }) : null;
  const n = want(state0);
  // Continuing: the helper reads only the appended part, so nothing is counted twice.
  const w = await writeTurn({ r, s: state0, reply: read ? appended : content, playerText: p.playerText, player: p.player, mode: "all", questions: A?.questions, tasks: [], tags: tagsFor(state0), kinds: null, count: n, recent, applied, settings, userId, meter });
  const book = A ? bookkeepingFromAnswers(r, state0, w.answers, A.meta, THRESHOLDS.llm) : empty;
  const proposal = applyTexts(r, state0, book.proposal, book.tasks, w.texts);
  await commit({ proposal, sceneRead: book.sceneRead, choices: (s) => (want(s) ? cleanChoices(r, s, tagsFor(s), w.choices, want(s)) : []) });
}

export async function onGenerationStarted(payload: { generationId: string; chatId: string; targetMessageId?: string; generationType?: string }, userId?: string) {
  if (payload.generationType === "quiet" || payload.generationType === "impersonate") return;
  const { chatId } = payload;
  const previous = started.get(chatId);
  if (previous && previous.generationId !== payload.generationId) {
    // A reply that already landed keeps its post-reply pass (this turn's interceptor waits for it);
    // a generation still writing is superseded.
    if (posts.get(chatId)?.id !== previous.generationId) {
      closeGeneration(chatId, previous.generationId);
      pending.delete(previous.generationId);
      pending.delete(chatId);
    }
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

  const work = (async () => {
    if (!p || payload.error || !payload.messageId) return;
    const msgs = await getMessages(payload.chatId);
    if (!generationIsCurrent(payload.chatId, payload.generationId) || (p.isCurrent && !p.isCurrent())) return;
    const msg = msgs.find((m) => m.id === payload.messageId);
    if (!msg) return;
    const swipe = msg.swipe_id ?? 0;
    if ((p.targetMessageId && p.targetMessageId !== msg.id) || (p.targetSwipe !== undefined && p.targetSwipe !== swipe)
      || (p.historyRevision !== undefined && pathRevision(msgs.filter((m) => m.index_in_chat < msg.index_in_chat)) !== p.historyRevision)) {
      toast("info", "The chat changed while this reply was being written. Its game changes were not applied.", userId);
      return;
    }
    // From here the reply has landed: only an explicit Stop (or a timed-out wait) cancels its post-reply pass.
    p.isCurrent = () => !closed.has(token);
    let attached = false;
    await patchWarpMeta(payload.chatId, msg.id, async (w, current) => {
      if (!p.isCurrent!() || (current.swipe_id ?? 0) !== swipe
        || (p.targetRecordRevision !== undefined && JSON.stringify(activeRecord(current)) !== p.targetRecordRevision)) return w;
      if (p.historyRevision !== undefined && pathRevision((await getMessages(payload.chatId)).filter((m) => m.index_in_chat < current.index_in_chat)) !== p.historyRevision) return w;
      attached = true;
      // The old choices go with the new reply; the post-reply pass writes the new ones.
      return { ...w, swipes: { ...w.swipes, [String(swipe)]: p.rec }, live: { ...w.live, [String(swipe)]: [] } };
    });
    if (!attached || !p.isCurrent()) return;
    if (p.verdict) {
      const { messageId, judged, intent, contest, odds, confidence } = p.verdict;
      await patchWarpMeta(payload.chatId, messageId, (w) => ({
        ...w, ...(judged ? { judged: true } : {}), ...(intent ? { intent } : {}),
        verdict: { ...w.verdict, ...(contest ? { contest } : {}), ...(odds ? { odds } : {}), ...(confidence !== undefined ? { confidence } : {}) },
      })).catch((e) => logError("save verdict", e));
    }
    await pushState(payload.chatId, userId);
    if (payload.content) await afterReply(p, msg, payload.content, userId);
  })();
  if (p && !payload.error && payload.messageId) posts.set(payload.chatId, { id: payload.generationId, done: work.then(() => {}, () => {}) });

  try {
    await work;
  } catch (e) {
    logError("generation ended", e);
  } finally {
    if (posts.get(payload.chatId)?.id === payload.generationId) posts.delete(payload.chatId);
    completing.delete(token);
    closeGeneration(payload.chatId, payload.generationId);
    const current = started.get(payload.chatId);
    if (!current || current.generationId === payload.generationId) {
      started.delete(payload.chatId);
      busyChats.delete(payload.chatId);
      host().sendToFrontend({ type: "busy", chatId: payload.chatId, busy: false }, userId);
    }
    await pushState(payload.chatId, userId);
  }
}
