import type { SpindleAPI } from "lumiverse-spindle-types";
import { buyPerk, changeClothes, forgetPerson, manualSet, manualSetRel, runOp, type TurnRecord } from "./engine/resolve.js";
import type { Ruleset } from "./engine/ruleset.js";
import type { GameState, WarpEvent } from "./engine/state.js";
import { TEMPLATES } from "./engine/templates/index.js";
import type { FrontendToBackend } from "./shared/protocol.js";
import { logError, send, toast } from "./backend/host.js";
import { appendOperation, foldPath, getMessages, patchWarpMeta, requireCurrentPath, shiftAfterSwipeDelete, startPlaythrough, warpMeta, writeRecord } from "./backend/ledger.js";
import { getSettings, patchSettings } from "./backend/settings.js";
import { getRuleset, installTemplate, invalidateCharacter } from "./backend/source.js";
import { busyChats, connectionsFor, getActiveChat, pushState, schedulePush, setActiveChat } from "./backend/state-push.js";
import { afterReply, interceptor, onGenerationEnded, onGenerationStarted, onGenerationStopped, playerName } from "./backend/turn.js";
import { intentFor } from "./backend/intents.js";
import { playScene } from "./backend/scene.js";
import { activeSession } from "./engine/date/talk.js";
import { DATE_PREFIX } from "./engine/date/types.js";
import { momentKey, takePrewritten } from "./backend/drafts.js";
import { getDecider, JEV_KEY } from "./backend/deciders.js";
import { runDungeonOp } from "./backend/dungeon.js";
import { builderAnswer, builderBack, builderClose, builderCurrent, builderFix, builderInstall, builderOpen, builderRedo, builderRefine, builderStart } from "./backend/builder.js";
import { worldInfoPolicy } from "./backend/knowledge.js";
import { currentCommand, runCommand } from "./backend/serial.js";
import { dropPrewritten } from "./backend/drafts.js";

declare const spindle: SpindleAPI;

// ── Prompt pipeline ──────────────────────────────────────────────
spindle.registerInterceptor(interceptor, 60);

// Ruleset YAML must never reach the model, even if an author forgets to disable an entry.
spindle.registerWorldInfoInterceptor(worldInfoPolicy, 10);

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
spindle.on("GENERATION_STARTED", (p, userId) => onGenerationStarted(p, userId));
spindle.on("GENERATION_ENDED", (p, userId) => onGenerationEnded(p, userId));
spindle.on("GENERATION_STOPPED", (p, userId) => onGenerationStopped(p, userId));
spindle.on("MESSAGE_SWIPED", (p, userId) => {
  dropPrewritten(p.chatId);
  if (p.action === "deleted") {
    void shiftAfterSwipeDelete(p.chatId, p.message.id, p.swipeId).catch((e) => logError("swipe delete", e)).finally(() => schedulePush(p.chatId, userId));
    return;
  }
  schedulePush(p.chatId, userId);
});
for (const ev of ["MESSAGE_SENT", "MESSAGE_DELETED", "MESSAGE_EDITED", "SWIPE_EDITED", "CHAT_CHANGED"]) {
  spindle.on(ev, (p, userId) => {
    const chatId = chatIdOf(p); if (chatId) dropPrewritten(chatId);
    schedulePush(chatId, userId, 250);
  });
}
spindle.on("CHARACTER_EDITED", (p, userId) => {
  const id = (p as { character?: { id?: string }; characterId?: string })?.character?.id ?? (p as { characterId?: string })?.characterId;
  invalidateCharacter(id ?? null);
  dropPrewritten();
  void userId;
});

// ── Command palette ──────────────────────────────────────────────
spindle.commands.register([
  { id: "open", label: "Warp: Open character sheet", description: "Stats, skills, people, inventory and settings", keywords: ["stats", "sheet", "hud", "game"], scope: "chat" },
  { id: "install", label: "Warp: Add a ruleset to this character", description: "Pick a starter game (Universal, life-sim, sci-fi RPG)", keywords: ["ruleset", "template", "game", "setup"], scope: "chat" },
  { id: "dungeon", label: "Warp: Open the dungeon", description: "Explore, fight and loot — or pick a dungeon to enter", keywords: ["dungeon", "explore", "battle", "roguelike"], scope: "chat" },
  { id: "reload", label: "Warp: Reload ruleset", description: "Re-read the character's warp-ruleset lorebook", keywords: ["refresh", "ruleset"], scope: "chat" },
  { id: "adopt_rules", label: "Warp: Start a playthrough with edited rules", description: "Keep this history and start a new game using the character's current rules", keywords: ["migrate", "ruleset", "restart"], scope: "chat" },
]);
spindle.commands.onInvoked((id, context) => {
  if (id === "adopt_rules" && context.chatId) {
    void handleFrontend({ type: "adopt_rules", chatId: context.chatId }).catch((e) => logError("adopt rules", e));
    return;
  }
  if (id === "reload") {
    void pushState(context.chatId ?? null, undefined, true).then(() => toast("info", "Ruleset reloaded"));
    return;
  }
  send({ type: "command", command: id as "open" | "install" | "dungeon" });
});

// ── Frontend messages ────────────────────────────────────────────

/**
 * Player-made changes (HUD edits, clothes, perks) are recorded on the latest
 * message's active swipe, so they fold, swipe and undo like everything else.
 */
async function applyManual(
  chatId: string, userId: string | undefined,
  make: (r: Ruleset, state: GameState) => WarpEvent[] | string,
): Promise<boolean> {
  const loaded = await getRuleset(chatId, userId);
  if (!loaded?.ruleset) return false;
  const msgs = await getMessages(chatId);
  const last = msgs[msgs.length - 1];
  if (!last) { toast("warning", "Send a message first — changes attach to the latest message.", userId); return false; }
  const fold = foldPath(loaded.ruleset, msgs);
  requireCurrentPath(fold);
  const { state, ruleset: r } = fold;
  const events = make(r, state);
  if (typeof events === "string") { toast("warning", events, userId); return false; }
  const swipe = last.swipe_id ?? 0;
  const existing = warpMeta(last).swipes?.[String(swipe)];
  const rec = appendOperation(existing, { v: 1, hints: [], events, at: Date.now(), commandId: currentCommand(chatId) });
  await writeRecord(chatId, last.id, swipe, rec, r);
  await pushState(chatId, userId);
  return true;
}

async function sendSettings(userId?: string) {
  const settings = await getSettings(userId);
  let jevKeySet = false;
  try { jevKeySet = await spindle.enclave.has(JEV_KEY, userId); } catch { /* enclave unavailable */ }
  send({
    type: "settings", settings, jevKeySet,
    templates: TEMPLATES.map(({ id, name, blurb }) => ({ id, name, blurb })),
    connections: await connectionsFor(userId),
    imageConnections: await imageConnectionsFor(userId),
  }, userId);
}

async function imageConnectionsFor(userId?: string): Promise<{ id: string; name: string }[]> {
  try {
    const list = await spindle.imageGen.listConnections(userId);
    return list.map((c) => ({ id: c.id, name: `${c.name}${(c as { model?: string }).model ? ` — ${(c as { model?: string }).model}` : ""}` }));
  } catch {
    return []; // image permission not granted yet
  }
}

const readCommands = new Set(["hello", "refresh", "reload", "builder_open", "test_decider"]);
async function handleFrontend(raw: unknown, userId?: string) {
  const msg = raw as FrontendToBackend;
  if (!msg || typeof msg.type !== "string") return;
  const chatId = "chatId" in msg && typeof msg.chatId === "string" ? msg.chatId : null;
  const id = typeof msg.commandId === "string" && msg.commandId.length <= 128 ? msg.commandId : undefined;
  const work = async () => {
    if (chatId && !readCommands.has(msg.type)) {
      if (busyChats.has(chatId)) { toast("info", "Wait for the story to catch up first.", userId); return; }
      const msgs = id ? await getMessages(chatId) : [];
      if (id && msgs.some((m) => {
        const w = warpMeta(m);
        return w.commandId === id || Object.values(w.swipes ?? {}).some((r) => r.commandId === id || r.operations?.some((op) => op.commandId === id));
      })) return;
      if (msg.type !== "act") dropPrewritten(chatId);
    }
  try {
    switch (msg.type) {
      case "hello": {
        setActiveChat(userId, msg.chatId);
        await sendSettings(userId);
        await pushState(msg.chatId, userId);
        await builderCurrent(msg.chatId, userId);
        break;
      }
      case "refresh":
        setActiveChat(userId, msg.chatId);
        await pushState(msg.chatId, userId);
        await builderCurrent(msg.chatId, userId);
        break;
      case "reload":
        if (msg.chatId) dropPrewritten(msg.chatId);
        await pushState(msg.chatId, userId, true);
        break;
      case "adopt_rules": {
        const loaded = await getRuleset(msg.chatId, userId, true);
        if (!loaded?.ruleset) throw new Error("Fix the current ruleset before starting a new playthrough.");
        await startPlaythrough(msg.chatId, loaded.ruleset);
        await pushState(msg.chatId, userId);
        break;
      }

      case "say": {
        const text = String(msg.text ?? "").trim().slice(0, 4000);
        if (!text) return;
        if (busyChats.has(msg.chatId)) { toast("info", "Wait for the story to catch up first.", userId); return; }
        // On a date or in the dungeon, a typed line plays on the stage; otherwise it's a chat message.
        const loaded = await getRuleset(msg.chatId, userId);
        if (loaded?.ruleset) {
          const fold = foldPath(loaded.ruleset, await getMessages(msg.chatId));
          requireCurrentPath(fold);
          const { state, ruleset: r } = fold;
          if (activeSession(r, state)) { await playScene({ chatId: msg.chatId, userId, kind: "date", intent: { actionId: `${DATE_PREFIX}say`, via: "adjudicator" }, said: text, typed: text }); break; }
          if (state.dungeon) { await playScene({ chatId: msg.chatId, userId, kind: "dungeon", intent: null, said: text, typed: text }); break; }
        }
        busyChats.add(msg.chatId);
        try { await spindle.chat.appendMessage(msg.chatId, { role: "user", content: text, metadata: { warp: { commandId: id } } }, { triggerGeneration: true }); }
        catch (e) { busyChats.delete(msg.chatId); throw e; }
        break;
      }

      case "act": {
        const loaded = await getRuleset(msg.chatId, userId);
        if (!loaded?.ruleset) return;
        const settings = await getSettings(userId);
        const msgs = await getMessages(msg.chatId);
        const fold = foldPath(loaded.ruleset, msgs);
        requireCurrentPath(fold);
        const { state, ruleset: r } = fold;
        const ci = intentFor(r, state, settings, msgs, msg.actionId, msg.params);
        if ("error" in ci) {
          if (ci.error) toast("warning", ci.error, userId);
          await pushState(msg.chatId, userId);
          return;
        }
        const { say, intent } = ci;
        // Dates play on the stage, off the chat.
        if (msg.actionId.startsWith(DATE_PREFIX)) {
          if (busyChats.has(msg.chatId)) { toast("info", "Wait a moment — they're still answering.", userId); await pushState(msg.chatId, userId); return; }
          await playScene({ chatId: msg.chatId, userId, kind: "date", intent, said: say });
          break;
        }
        // Already written while the player read: post it at once, then catch up on the bookkeeping.
        const ready = takePrewritten(msg.chatId, momentKey(msgs, state, r, settings), msg.actionId);
        if (ready) {
          const user = await spindle.chat.appendMessage(msg.chatId, { role: "user", content: say, metadata: { warp: { intent, judged: true, commandId: id } } });
          const reply = await spindle.chat.appendMessage(msg.chatId, { role: "assistant", content: ready.text });
          await writeRecord(msg.chatId, reply.id, 0, ready.rec, r);
          await pushState(msg.chatId, userId);
          const fresh = (await getMessages(msg.chatId)).find((m) => m.id === reply.id);
          const committed = fresh && warpMeta(fresh).swipes?.["0"];
          if (committed?.inputs && committed.parent) await patchWarpMeta(msg.chatId, user.id, (w) => ({ ...w, accepted: { parent: committed.parent!, actionId: committed.action?.id ?? null, inputs: committed.inputs! } }));
          if (fresh) {
            busyChats.add(msg.chatId);
            try {
              await afterReply({
                chatId: msg.chatId, userId, rec: ready.rec, after: ready.after, origin: state, playerText: say, ruleset: r, at: Date.now(),
                outcome: ready.outcome, player: await playerName(msg.chatId, userId), prompt: ready.prompt,
              }, fresh, ready.text, userId);
            } finally {
              busyChats.delete(msg.chatId);
              send({ type: "busy", chatId: msg.chatId, busy: false }, userId);
              schedulePush(msg.chatId, userId, 0);
            }
          }
          break;
        }
        dropPrewritten(msg.chatId);
        busyChats.add(msg.chatId);
        try { await spindle.chat.appendMessage(msg.chatId, {
          role: "user",
          content: say,
          metadata: { warp: { intent, commandId: id } },
        }, { triggerGeneration: true }); }
        catch (e) { busyChats.delete(msg.chatId); throw e; }
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

      case "wear": {
        await applyManual(msg.chatId, userId, (r, state) => changeClothes(r, state, msg.slot, msg.item));
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

      case "dungeon": {
        await runDungeonOp(msg, userId);
        break;
      }

      case "run": {
        const op = msg.op === "save" || msg.op === "load" ? { op: msg.op, slot: msg.slot ?? "" } : { op: msg.op };
        const ok = await applyManual(msg.chatId, userId, (r, state) => runOp(r, state, op));
        if (ok) toast("success", msg.op === "save" ? "Saved." : msg.op === "load" ? "Rewound. The next reply picks up from there." : msg.op === "restart" ? "A new playthrough begins." : "The story goes on.", userId);
        break;
      }

      case "buy_perk": {
        const ok = await applyManual(msg.chatId, userId, (r, state) => buyPerk(r, state, msg.perk));
        if (ok) toast("success", "Perk taken.", userId);
        break;
      }

      case "settings": {
        dropPrewritten();
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

      case "builder_open": await builderOpen(msg.chatId, msg.mode, userId); break;
      case "builder_start": await builderStart(msg.chatId, { connectionId: msg.connectionId, creative: msg.creative, base: msg.base }, userId); break;
      case "builder_answer": await builderAnswer(msg.chatId, msg.answers, msg.additions, msg.more, userId); break;
      case "builder_redo": await builderRedo(msg.chatId, msg.part, msg.note, userId); break;
      case "builder_fix": await builderFix(msg.chatId, msg.warning, userId); break;
      case "builder_refine": await builderRefine(msg.chatId, msg.request, userId); break;
      case "builder_back": await builderBack(msg.chatId, userId); break;
      case "builder_close": await builderClose(msg.chatId, userId); break;
      case "builder_install": {
        await builderInstall(msg.chatId, userId);
        await pushState(msg.chatId, userId, true);
        toast("success", "Ruleset saved to the character's warp-ruleset lorebook.", userId);
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
        delete w.accepted;
        w.judged = true;
        if (msg.actionId) w.intent = { actionId: msg.actionId, params: msg.params, via: "confirmed" };
        w.commandId = id;
        meta.warp = w;
        if (reply) await spindle.chat.deleteMessage(msg.chatId, reply.id);
        await spindle.chat.deleteMessage(msg.chatId, user.id);
        busyChats.add(msg.chatId);
        try { await spindle.chat.appendMessage(msg.chatId, { role: "user", content: user.content, metadata: meta }, { triggerGeneration: true }); }
        catch (e) { busyChats.delete(msg.chatId); throw e; }
        break;
      }

      case "install_template": {
        if (!msg.chatId) return;
        const name = await installTemplate(msg.chatId, msg.templateId, userId, msg.trackCharacter);
        toast("success", `Added the ${name} ruleset. It lives in the "warp-ruleset" lorebook — edit it there any time.`, userId);
        await pushState(msg.chatId, userId, true);
        break;
      }
    }
  } catch (e) {
    logError(`frontend ${msg.type}`, e);
    toast("error", `Warp: ${e instanceof Error ? e.message : String(e)}`, userId);
  }
  };
  return readCommands.has(msg.type) ? work() : runCommand(chatId ?? `user:${userId ?? "_"}`, id, work);
}
spindle.onFrontendMessage(handleFrontend);
