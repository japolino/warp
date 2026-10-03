import type { SpindleAPI } from "lumiverse-spindle-types";
import { forgetPerson, manualSet, manualSetRel, type TurnRecord } from "./engine/resolve.js";
import type { Ruleset } from "./engine/ruleset.js";
import type { GameState, WarpEvent } from "./engine/state.js";
import { TEMPLATES } from "./engine/templates/index.js";
import type { FrontendToBackend } from "./shared/protocol.js";
import { logError, send, toast } from "./backend/host.js";
import { foldPath, getMessages, patchWarpMeta, reconcilePath, shiftAfterSwipeDelete, warpMeta } from "./backend/ledger.js";
import { manualFix } from "./engine/scene.js";
import { ensureGreeting, greetingOf } from "./backend/greeting.js";
import { getSettings, patchSettings } from "./backend/settings.js";
import { getRuleset, installTemplate, invalidateCharacter, invalidateChat, knownRulesetBookIds, knownRulesetEntryIds } from "./backend/source.js";
import { busyChats, connectionsFor, getActiveChat, pushState, schedulePush, setActiveChat } from "./backend/state-push.js";
import { generationHistory, interceptor, narratorWriting, onGenerationEnded, onGenerationStarted, onGenerationStopped } from "./backend/turn.js";
import { contestExit, intentFor, type ChoiceIntent } from "./backend/intents.js";
import { isRulesetEntryTitle } from "./engine/loader.js";
import { getDecider, JEV_KEY } from "./backend/deciders.js";
import { builderAnswer, builderBack, builderImport, exportRulebook, builderClose, builderCurrent, builderInstall, builderOpen, builderRedo, builderRefine, builderStart } from "./backend/builder.js";

declare const spindle: SpindleAPI;

// ── Prompt pipeline ──────────────────────────────────────────────
spindle.registerInterceptor(interceptor, 60);

// Ruleset YAML must never reach the model, even if an author forgets to disable an entry.
spindle.registerWorldInfoInterceptor(async (ctx) => {
  const disabled = ctx.entries
    .filter((e) => knownRulesetEntryIds.has(e.id) || knownRulesetBookIds.has(e.world_book_id) || isRulesetEntryTitle(e.comment))
    .map((e) => e.id);

  // Gated lore: entries named in a secret stage's `lore:` stay off until it's
  // unlocked, then they're forced on — so a secret's long text can live in the lorebook and still never leak early.
  const forced: string[] = [];
  try {
    const loaded = await getRuleset(ctx.chatId, ctx.userId);
    const r = loaded?.ruleset;
    const gates: { lore: string[]; open: (s: GameState) => boolean }[] = [];
    if (r) {
      for (const sec of Object.values(r.secrets)) sec.stages.forEach((st, i) => {
        if (st.lore.length) gates.push({ lore: st.lore, open: (s) => (s.secrets[sec.id] ?? -1) >= i });
      });
    }
    if (r && gates.length) {
      const state = foldPath(r, generationHistory(ctx.chatId, await getMessages(ctx.chatId)), 0).state;
      const title = (s: string) => s.replace(/^\s*\[[^\]]*\]\s*/, "").trim().toLowerCase();
      for (const g of gates) {
        const names = new Set(g.lore.map(title));
        const open = g.open(state);
        for (const e of ctx.entries) {
          if (!names.has(title(e.comment ?? ""))) continue;
          if (open) forced.push(e.id);
          else disabled.push(e.id);
        }
      }
    }
  } catch (e) {
    logError("lore gate", e);
  }
  return disabled.length || forced.length ? { ...(disabled.length ? { disabled } : {}), ...(forced.length ? { forced } : {}) } : undefined;
}, 10);

// ── Lifecycle events ─────────────────────────────────────────────
const chatIdOf = (p: unknown): string | null => {
  const x = p as { chatId?: string; chat?: { id?: string }; message?: { chat_id?: string } } | null;
  return x?.chatId ?? x?.chat?.id ?? x?.message?.chat_id ?? null;
};

spindle.on("CHAT_SWITCHED", (p, userId) => {
  const chatId = (p as { chatId: string | null }).chatId;
  setActiveChat(userId, chatId);
  void pushState(chatId, userId);
});
spindle.on("GENERATION_STARTED", (p, userId) => onGenerationStarted(p, userId));
spindle.on("GENERATION_ENDED", (p, userId) => onGenerationEnded(p, userId));
spindle.on("GENERATION_STOPPED", (p, userId) => onGenerationStopped(p, userId));
spindle.on("MESSAGE_SWIPED", (p, userId) => {
  if (p.action === "deleted") {
    void shiftAfterSwipeDelete(p.chatId, p.message.id, p.swipeId).catch((e) => logError("swipe delete", e)).finally(() => schedulePush(p.chatId, userId));
    return;
  }
  schedulePush(p.chatId, userId);
  // Another greeting: its own time, place and people (read once per greeting swipe).
  void readGreetingLater(p.chatId, userId);
});
for (const ev of ["MESSAGE_SENT", "MESSAGE_DELETED", "MESSAGE_EDITED", "SWIPE_EDITED", "CHAT_CHANGED"]) {
  spindle.on(ev, (p, userId) => {
    const chatId = chatIdOf(p);
    if (chatId) invalidateChat(chatId);
    schedulePush(chatId, userId, 250);
  });
}
spindle.on("CHARACTER_EDITED", (p, userId) => {
  const id = (p as { character?: { id?: string }; characterId?: string })?.character?.id ?? (p as { characterId?: string })?.characterId;
  invalidateCharacter(id ?? null);
  void userId;
});

// ── Command palette ──────────────────────────────────────────────
spindle.commands.register([
  { id: "open", label: "Warp: Open the sheet", description: "Scene, you, people, goals and settings", keywords: ["stats", "sheet", "hud", "game"], scope: "chat" },
  { id: "install", label: "Warp: Add rules to this character", description: "Story (no dice) or Adventure (dice), or build one with AI", keywords: ["ruleset", "template", "story", "adventure", "game", "setup"], scope: "chat" },
  { id: "reload", label: "Warp: Reload ruleset", description: "Re-read the character's warp-ruleset lorebook", keywords: ["refresh", "ruleset"], scope: "chat" },
]);
spindle.commands.onInvoked((id, context) => {
  if (id === "reload") {
    void pushState(context.chatId ?? null, undefined, true).then(() => toast("info", "Ruleset reloaded"));
    return;
  }
  send({ type: "command", command: id as "open" | "install" });
});

// ── Frontend messages ────────────────────────────────────────────

/**
 * Player-made changes (HUD edits) are recorded on the latest
 * message's active swipe, so they fold, swipe and undo like everything else.
 */
async function applyManual(
  chatId: string, userId: string | undefined,
  make: (r: Ruleset, state: GameState) => WarpEvent[] | string,
): Promise<boolean> {
  const loaded = await getRuleset(chatId, userId);
  const r = loaded?.ruleset;
  if (!r) return false;
  const msgs = await getMessages(chatId);
  const last = msgs[msgs.length - 1];
  if (!last) { toast("warning", "Send a message first — changes attach to the latest message.", userId); return false; }
  let applied = false;
  await patchWarpMeta(chatId, last.id, async (w, current) => {
    const now = await getMessages(chatId);
    if (now.at(-1)?.id !== last.id || current.swipe_id !== last.swipe_id) return w;
    const folded = foldPath(r, now, 0);
    if (folded.conflict) return w;
    const events = make(r, folded.state);
    if (typeof events === "string") { toast("warning", events, userId); return w; }
    const slot = String(current.swipe_id ?? 0), existing = w.swipes?.[slot];
    const rec: TurnRecord = existing ? { ...existing, events: [...existing.events, ...events] } : { v: 1, hints: [], events, at: Date.now() };
    applied = true;
    return { ...w, swipes: { ...w.swipes, [slot]: rec } };
  });
  await pushState(chatId, userId);
  return applied;
}

/** Read the greeting in the background (outside any generation), then show the result. */
async function readGreetingLater(chatId: string | null, userId?: string): Promise<void> {
  if (!chatId) return;
  try {
    const msgs = await getMessages(chatId);
    if (!greetingOf(msgs)) return;
    if (await ensureGreeting(chatId, userId)) await pushState(chatId, userId);
  } catch (e) {
    logError("greeting read", e);
  }
}

/** Post a move as the player's message; the interceptor rolls it (one reroll rule for typed and clicked). */
async function postMove(chatId: string, ci: ChoiceIntent, userId?: string): Promise<void> {
  if ("error" in ci) {
    if (ci.error) toast("warning", ci.error, userId);
    await pushState(chatId, userId);
    return;
  }
  // Clicks are welcome while the last reply's choices and bookkeeping are written (the next turn waits for
  // them); only a reply still being written refuses.
  if (narratorWriting(chatId)) { toast("info", "One moment — the story is still being written.", userId); await pushState(chatId, userId); return; }
  await spindle.chat.appendMessage(chatId, { role: "user", content: ci.say, metadata: { warp: { intent: ci.intent } } }, { triggerGeneration: true });
}

async function sendSettings(userId?: string) {
  const settings = await getSettings(userId);
  let jevKeySet = false;
  try { jevKeySet = await spindle.enclave.has(JEV_KEY, userId); } catch { /* enclave unavailable */ }
  send({
    type: "settings", settings, jevKeySet,
    templates: TEMPLATES.map(({ id, name, blurb }) => ({ id, name, blurb })),
    connections: await connectionsFor(userId),
  }, userId);
}

spindle.onFrontendMessage(async (raw, userId) => {
  const msg = raw as FrontendToBackend;
  try {
    if ("chatId" in msg && msg.chatId && !["hello", "refresh", "reload", "reconcile_history", "undo"].includes(msg.type) && !msg.type.startsWith("builder") && msg.type !== "export_rulebook" && msg.type !== "install_template") {
      const r = (await getRuleset(msg.chatId, userId))?.ruleset;
      if (r && foldPath(r, await getMessages(msg.chatId), 0).conflict) {
        toast("warning", "Earlier history or rules changed. Review the recorded outcomes in the Warp sheet before continuing.", userId);
        await pushState(msg.chatId, userId);
        return;
      }
    }
    switch (msg.type) {
      case "reconcile_history": {
        if (busyChats.has(msg.chatId)) { toast("info", "Wait for the current turn to finish first.", userId); break; }
        const r = (await getRuleset(msg.chatId, userId))?.ruleset;
        if (r) await reconcilePath(msg.chatId, r, msg.keep);
        await pushState(msg.chatId, userId);
        break;
      }
      case "hello": {
        setActiveChat(userId, msg.chatId);
        await sendSettings(userId);
        await pushState(msg.chatId, userId);
        await builderCurrent(msg.chatId, userId);
        void readGreetingLater(msg.chatId, userId);
        break;
      }
      case "refresh":
        setActiveChat(userId, msg.chatId);
        await pushState(msg.chatId, userId);
        await builderCurrent(msg.chatId, userId);
        void readGreetingLater(msg.chatId, userId);
        break;
      case "reload":
        await pushState(msg.chatId, userId, true);
        break;

      case "say": {
        const text = String(msg.text ?? "").trim().slice(0, 4000);
        if (!text) return;
        if (narratorWriting(msg.chatId)) { toast("info", "Wait for the story to catch up first.", userId); return; }
        await spindle.chat.appendMessage(msg.chatId, { role: "user", content: text }, { triggerGeneration: true });
        break;
      }

      case "act": {
        const loaded = await getRuleset(msg.chatId, userId);
        const r = loaded?.ruleset;
        if (!r) return;
        const settings = await getSettings(userId);
        const msgs = await getMessages(msg.chatId);
        const { state } = foldPath(r, msgs, 0);
        await postMove(msg.chatId, intentFor(r, state, settings, msgs, msg.actionId, msg.params), userId);
        break;
      }

      case "contest": {
        // The contest panel: Break off (a check against the threat, easier when ahead) or Give in (a loss, no roll).
        const r = (await getRuleset(msg.chatId, userId))?.ruleset;
        if (!r) return;
        const { state } = foldPath(r, await getMessages(msg.chatId), 0);
        await postMove(msg.chatId, contestExit(r, state, msg.op === "give_in" ? "give_in" : "break_off"), userId);
        break;
      }

      case "fix": {
        await applyManual(msg.chatId, userId, (r, state) => manualFix(r, state, { field: msg.field, ...(msg.who !== undefined ? { who: msg.who } : {}), value: msg.value }));
        break;
      }

      case "undo": {
        await patchWarpMeta(msg.chatId, msg.messageId, (w) => {
          const rec = w.swipes?.[String(msg.swipe)];
          if (!rec) return w;
          const drop = new Set(msg.events.filter((i) => rec.events[i]?.src === "narrator" || rec.events[i]?.src === "manual"));
          const next: TurnRecord = { ...rec, events: rec.events.filter((_, i) => !drop.has(i)) };
          return { ...w, swipes: { ...w.swipes, [String(msg.swipe)]: next } };
        });
        await pushState(msg.chatId, userId);
        break;
      }

      case "adjust": {
        await applyManual(msg.chatId, userId, (r, state) => (r.stats[msg.stat] ? manualSet(r, state, msg.stat, msg.value) : "Unknown stat."));
        break;
      }

      case "adjust_rel": {
        await applyManual(msg.chatId, userId, (r, state) => manualSetRel(r, state, msg.who, msg.stat, msg.value));
        break;
      }

      case "forget": {
        await applyManual(msg.chatId, userId, (r, state) => forgetPerson(r, state, msg.who));
        break;
      }

      case "settings": {
        await patchSettings(msg.patch, userId);
        await sendSettings(userId);
        schedulePush(getActiveChat(userId), userId, 0);
        break;
      }

      case "set_jev_key": {
        const key = msg.key.trim();
        if (key) await spindle.enclave.put(JEV_KEY, key, userId);
        else await spindle.enclave.delete(JEV_KEY, userId);
        await sendSettings(userId);
        toast(key ? "success" : "info", key ? "Jev key saved (encrypted)." : "Jev key removed.", userId);
        break;
      }

      case "test_decider": {
        const settings = await getSettings(userId);
        const decider = await getDecider(settings, userId);
        const t0 = Date.now();
        const ans = await decider.ask(
          { player_message: "I try to climb over the wall before the guard turns around." },
          { action: { type: "choice", instructions: "What is the player attempting?", criteria: { climb: "Climbing", talk: "Talking", none: "Nothing" } } },
        );
        const a = ans.action;
        const ms = Date.now() - t0;
        const who = decider.id === "jev" ? "Jev" : "The helper";
        if (a?.type === "choice") toast("success", `${who} answered "${a.choice}" at ${Math.round(a.confidence * 100)}% confidence in ${ms} ms.`, userId);
        else toast("warning", `${who} replied in ${ms} ms but gave no usable answer.`, userId);
        break;
      }

      case "builder_open": await builderOpen(msg.chatId, msg.mode, userId); break;
      case "builder_import": await builderImport(msg.chatId, msg.text, userId); break;
      case "export_rulebook": {
        const out = await exportRulebook(msg.chatId, userId);
        send({ type: "rulebook_export", ...out }, userId);
        break;
      }
      case "builder_start": await builderStart(msg.chatId, { connectionId: msg.connectionId, creative: msg.creative, base: msg.base }, userId); break;
      case "builder_answer": await builderAnswer(msg.chatId, msg.answers, msg.additions, msg.more, userId); break;
      case "builder_redo": await builderRedo(msg.chatId, msg.part, msg.note, userId); break;
      case "builder_refine": await builderRefine(msg.chatId, msg.request, userId); break;
      case "builder_back": await builderBack(msg.chatId, userId); break;
      case "builder_close": await builderClose(msg.chatId, userId); break;
      case "builder_install": {
        await builderInstall(msg.chatId, userId);
        await pushState(msg.chatId, userId, true);
        toast("success", "Ruleset saved to the character's warp-ruleset lorebook.", userId);
        break;
      }

      case "redo": {
        // "Not an action?": resend the latest player message as plain roleplay (no roll).
        const msgs = await getMessages(msg.chatId);
        const i = msgs.findIndex((m) => m.id === msg.userMessageId);
        if (i < 0 || !msgs[i].is_user || msgs.length - 1 - i > 1) {
          toast("warning", "Only the latest turn can be redone.", userId);
          return;
        }
        if (narratorWriting(msg.chatId)) { toast("info", "One moment — the story is still being written.", userId); return; }
        const user = msgs[i];
        const reply = msgs[i + 1];
        const meta = { ...((user.metadata as Record<string, unknown>) ?? {}) };
        const w = { ...warpMeta(user) };
        delete w.intent;
        delete w.verdict;
        w.judged = true;
        meta.warp = w;
        if (reply) await spindle.chat.deleteMessage(msg.chatId, reply.id);
        await spindle.chat.deleteMessage(msg.chatId, user.id);
        await spindle.chat.appendMessage(msg.chatId, { role: "user", content: user.content, metadata: meta }, { triggerGeneration: true });
        break;
      }

      case "install_template": {
        if (!msg.chatId) return;
        const name = await installTemplate(msg.chatId, msg.templateId, userId, msg.trackCharacter, msg.replace === true);
        toast("success", msg.replace ? `Switched to ${name}. The people Warp tracks were kept.` : `Added the ${name} ruleset. It lives in the "warp-ruleset" lorebook — edit it there any time.`, userId);
        await pushState(msg.chatId, userId, true);
        void readGreetingLater(msg.chatId, userId);
        break;
      }
    }
  } catch (e) {
    logError(`frontend ${msg.type}`, e);
    toast("error", `Warp: ${e instanceof Error ? e.message : String(e)}`, userId);
  }
});
