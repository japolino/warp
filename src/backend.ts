import type { SpindleAPI } from "lumiverse-spindle-types";
import { availableActions, manualSet, TRAVEL_PREFIX, travelTargets, type TurnRecord } from "./engine/resolve.js";
import { TEMPLATES } from "./engine/templates/index.js";
import type { FrontendToBackend } from "./shared/protocol.js";
import { logError, send, toast } from "./backend/host.js";
import { foldPath, getMessages, patchWarpMeta, shiftAfterSwipeDelete, warpMeta, writeRecord } from "./backend/ledger.js";
import { getSettings, patchSettings } from "./backend/settings.js";
import { getRuleset, installTemplate, invalidateCharacter, knownRulesetBookIds, knownRulesetEntryIds } from "./backend/source.js";
import { connectionsFor, getActiveChat, pushState, schedulePush, setActiveChat } from "./backend/state-push.js";
import { interceptor, onGenerationEnded, onGenerationStarted } from "./backend/turn.js";
import { isRulesetEntryTitle } from "./engine/loader.js";
import { getDecider, JEV_KEY } from "./backend/deciders.js";

declare const spindle: SpindleAPI;

// ── Prompt pipeline ──────────────────────────────────────────────
spindle.registerInterceptor(interceptor, 60);

// Ruleset YAML must never reach the model, even if an author forgets to disable an entry.
spindle.registerWorldInfoInterceptor(async (ctx) => {
  const disabled = ctx.entries
    .filter((e) => knownRulesetEntryIds.has(e.id) || knownRulesetBookIds.has(e.world_book_id) || isRulesetEntryTitle(e.comment))
    .map((e) => e.id);
  return disabled.length ? { disabled } : undefined;
}, 10);

// ── Lifecycle events ─────────────────────────────────────────────
const chatIdOf = (p: unknown): string | null => {
  const x = p as { chatId?: string; message?: { chat_id?: string } } | null;
  return x?.chatId ?? x?.message?.chat_id ?? null;
};

spindle.on("CHAT_SWITCHED", (p, userId) => {
  const chatId = (p as { chatId: string | null }).chatId;
  setActiveChat(userId, chatId);
  void pushState(chatId, userId);
});
spindle.on("GENERATION_STARTED", (p, userId) => { void onGenerationStarted(p.chatId, userId); });
spindle.on("GENERATION_ENDED", (p, userId) => { void onGenerationEnded(p, userId); });
spindle.on("GENERATION_STOPPED", (p, userId) => {
  const chatId = chatIdOf(p);
  if (chatId) send({ type: "busy", chatId, busy: false }, userId);
  schedulePush(chatId, userId);
});
spindle.on("MESSAGE_SWIPED", (p, userId) => {
  if (p.action === "deleted") {
    void shiftAfterSwipeDelete(p.chatId, p.message.id, p.swipeId).catch((e) => logError("swipe delete", e)).finally(() => schedulePush(p.chatId, userId));
    return;
  }
  schedulePush(p.chatId, userId);
});
for (const ev of ["MESSAGE_SENT", "MESSAGE_DELETED", "MESSAGE_EDITED", "SWIPE_EDITED", "CHAT_CHANGED"]) {
  spindle.on(ev, (p, userId) => schedulePush(chatIdOf(p), userId, 250));
}
spindle.on("CHARACTER_EDITED", (p, userId) => {
  const id = (p as { character?: { id?: string }; characterId?: string })?.character?.id ?? (p as { characterId?: string })?.characterId;
  invalidateCharacter(id ?? null);
  void userId;
});

// ── Command palette ──────────────────────────────────────────────
spindle.commands.register([
  { id: "open", label: "Warp: Open character sheet", description: "Stats, skills, people, inventory and settings", keywords: ["stats", "sheet", "hud", "game"], scope: "chat" },
  { id: "install", label: "Warp: Add a ruleset to this character", description: "Pick a starter game (Universal, life-sim, sci-fi RPG)", keywords: ["ruleset", "template", "game", "setup"], scope: "chat" },
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
    switch (msg.type) {
      case "hello": {
        setActiveChat(userId, msg.chatId);
        await sendSettings(userId);
        await pushState(msg.chatId, userId);
        break;
      }
      case "refresh":
        setActiveChat(userId, msg.chatId);
        await pushState(msg.chatId, userId);
        break;
      case "reload":
        await pushState(msg.chatId, userId, true);
        break;

      case "act": {
        const loaded = await getRuleset(msg.chatId, userId);
        const r = loaded?.ruleset;
        if (!r) return;
        const settings = await getSettings(userId);
        const { state } = foldPath(r, await getMessages(msg.chatId));
        let say: string;
        if (msg.actionId.startsWith(TRAVEL_PREFIX)) {
          const to = msg.actionId.slice(TRAVEL_PREFIX.length);
          if (!travelTargets(r, state).includes(to)) { toast("warning", "You can't get there from here.", userId); await pushState(msg.chatId, userId); return; }
          say = `*I head to ${r.locations[to].name}.*`;
        } else {
          const a = availableActions(r, state, settings.lines).find((x) => x.id === msg.actionId);
          if (!a) { toast("warning", "That choice isn't available anymore.", userId); await pushState(msg.chatId, userId); return; }
          say = a.say ?? `*${a.label}*`;
        }
        await spindle.chat.appendMessage(msg.chatId, {
          role: "user",
          content: say,
          metadata: { warp: { intent: { actionId: msg.actionId, params: msg.params, via: "choice" } } },
        }, { triggerGeneration: true });
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
        const loaded = await getRuleset(msg.chatId, userId);
        const r = loaded?.ruleset;
        if (!r || !r.stats[msg.stat]) return;
        const msgs = await getMessages(msg.chatId);
        const last = msgs[msgs.length - 1];
        if (!last) { toast("warning", "Send a message first — edits attach to the latest message.", userId); return; }
        const { state } = foldPath(r, msgs);
        const events = manualSet(r, state, msg.stat, msg.value);
        const swipe = last.swipe_id ?? 0;
        const existing = warpMeta(last).swipes?.[String(swipe)];
        const rec: TurnRecord = existing
          ? { ...existing, events: [...existing.events, ...events] }
          : { v: 1, hints: [], events, at: Date.now() };
        await writeRecord(msg.chatId, last.id, swipe, rec);
        await pushState(msg.chatId, userId);
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
        if (a?.type === "choice") toast("success", `${decider.id.toUpperCase()} answered "${a.choice}" at ${Math.round(a.confidence * 100)}% confidence in ${ms} ms.`, userId);
        else toast("warning", `${decider.id.toUpperCase()} replied in ${ms} ms but gave no usable answer.`, userId);
        break;
      }

      case "dismiss_suggestion": {
        await patchWarpMeta(msg.chatId, msg.messageId, (w) => {
          const next = { ...w };
          delete next.suggest;
          return next;
        });
        await pushState(msg.chatId, userId);
        break;
      }

      case "redo": {
        const msgs = await getMessages(msg.chatId);
        const i = msgs.findIndex((m) => m.id === msg.userMessageId);
        if (i < 0 || !msgs[i].is_user || msgs.length - 1 - i > 1) {
          toast("warning", "Only the latest turn can be redone.", userId);
          return;
        }
        const user = msgs[i];
        const reply = msgs[i + 1];
        const meta = { ...((user.metadata as Record<string, unknown>) ?? {}) };
        const w = { ...warpMeta(user) };
        delete w.suggest;
        delete w.intent;
        w.judged = true;
        if (msg.actionId) w.intent = { actionId: msg.actionId, params: msg.params, via: "confirmed" };
        meta.warp = w;
        if (reply) await spindle.chat.deleteMessage(msg.chatId, reply.id);
        await spindle.chat.deleteMessage(msg.chatId, user.id);
        await spindle.chat.appendMessage(msg.chatId, { role: "user", content: user.content, metadata: meta }, { triggerGeneration: true });
        break;
      }

      case "install_template": {
        if (!msg.chatId) return;
        const name = await installTemplate(msg.chatId, msg.templateId, userId);
        toast("success", `Added the ${name} ruleset. It lives in the "warp-ruleset" lorebook — edit it there any time.`, userId);
        await pushState(msg.chatId, userId, true);
        break;
      }
    }
  } catch (e) {
    logError(`frontend ${msg.type}`, e);
    toast("error", `Warp: ${e instanceof Error ? e.message : String(e)}`, userId);
  }
});
