// Dungeon actions from the stage. Every step is recorded on the latest message
// (like any sheet edit); story moments play as short snippets on the stage.

import type { SpindleAPI } from "lumiverse-spindle-types";
import { randomSeed } from "../engine/dice.js";
import type { GameState, WarpEvent } from "../engine/state.js";
import type { Ruleset } from "../engine/ruleset.js";
import {
  battleCommand, chooseEvent, descend, enterDungeon, leaveDungeon, moveTo, shopBuy, useItem, type DungeonResult,
} from "../engine/dungeon/run.js";
import type { DungeonOp } from "../shared/protocol.js";
import { toast } from "./host.js";
import { appendOperation, foldPath, getMessages, requireCurrentPath, warpMeta, writeRecord } from "./ledger.js";
import { getRuleset } from "./source.js";
import { busyChats, pushState } from "./state-push.js";
import { playScene } from "./scene.js";
import { currentCommand } from "./serial.js";

declare const spindle: SpindleAPI;

function run(r: Ruleset, s: GameState, op: DungeonOp): DungeonResult {
  switch (op.op) {
    case "enter": return enterDungeon(r, s, op.id, op.companions, randomSeed());
    case "move": return moveTo(r, s, op.x, op.y);
    case "choose": return chooseEvent(r, s, op.choice);
    case "battle":
      if (op.auto) return battleCommand(r, s, { auto: op.auto });
      if (op.escape) return battleCommand(r, s, { escape: true });
      if (op.item) return battleCommand(r, s, { item: op.item, target: op.target });
      return battleCommand(r, s, { skill: op.skill ?? "attack", target: op.target });
    case "descend": return descend(r, s);
    case "leave": return leaveDungeon(r, s);
    case "use": return useItem(r, s, op.item, op.target);
    case "buy": return shopBuy(r, s, op.item);
  }
}

export async function runDungeonOp(msg: { chatId: string } & DungeonOp, userId?: string): Promise<void> {
  const loaded = await getRuleset(msg.chatId, userId);
  if (!loaded?.ruleset) return;
  if (busyChats.has(msg.chatId)) { toast("info", "Wait for the story to catch up first.", userId); return; }
  const msgs = await getMessages(msg.chatId);
  const last = msgs[msgs.length - 1];
  if (!last) { toast("warning", "Send a message first — the dungeon attaches to the latest message.", userId); return; }
  const fold = foldPath(loaded.ruleset, msgs);
  requireCurrentPath(fold);
  const { state, ruleset: r } = fold;
  const res = run(r, state, msg);
  if (res.error) { toast("warning", res.error, userId); await pushState(msg.chatId, userId); return; }
  if (res.events.length) {
    const swipe = last.swipe_id ?? 0;
    const existing = warpMeta(last).swipes?.[String(swipe)];
    const rec = appendOperation(existing, { v: 1, hints: [], events: res.events, action: { id: `dungeon:${msg.op}`, label: `Dungeon: ${msg.op}`, via: "command" }, commandId: currentCommand(msg.chatId), at: Date.now() });
    await writeRecord(msg.chatId, last.id, swipe, rec, r);
  }
  await pushState(msg.chatId, userId);
  // Story moments play on the stage as a short snippet, off the chat.
  const was = state.dungeon;
  const endedRun = was && !res.events.some((e: WarpEvent) => e.t === "dg_enter") && res.events.some((e: WarpEvent) => e.t === "dg_exit")
    ? { name: r.dungeons[was.id]?.name ?? "the dungeon", depth: was.depth, gold: was.gold }
    : undefined;
  if (res.narrate) await playScene({ chatId: msg.chatId, userId, kind: "dungeon", intent: null, said: res.narrate.say, ...(endedRun ? { runEnded: endedRun } : {}) });
}
