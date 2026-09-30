// Dungeon actions from the drawer. Quiet steps are recorded on the latest message
// (like any sheet edit); story moments append a player line so the narrator
// writes them up, with what happened queued as its directions.

import type { SpindleAPI } from "lumiverse-spindle-types";
import { randomSeed } from "../engine/dice.js";
import type { TurnRecord } from "../engine/resolve.js";
import type { GameState } from "../engine/state.js";
import type { Ruleset } from "../engine/ruleset.js";
import {
  battleCommand, chooseEvent, descend, DUNGEON_ACTION, enterDungeon, leaveDungeon, moveTo, shopBuy, useItem, type DungeonResult,
} from "../engine/dungeon/run.js";
import type { DungeonOp } from "../shared/protocol.js";
import { toast } from "./host.js";
import { foldPath, getMessages, warpMeta, writeRecord } from "./ledger.js";
import { getRuleset } from "./source.js";
import { busyChats, pushState } from "./state-push.js";

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
  const r = loaded?.ruleset;
  if (!r) return;
  if (busyChats.has(msg.chatId)) { toast("info", "Wait for the story to catch up first.", userId); return; }
  const msgs = await getMessages(msg.chatId);
  const last = msgs[msgs.length - 1];
  if (!last) { toast("warning", "Send a message first — the dungeon attaches to the latest message.", userId); return; }
  const { state } = foldPath(r, msgs);
  const res = run(r, state, msg);
  if (res.error) { toast("warning", res.error, userId); await pushState(msg.chatId, userId); return; }
  if (res.events.length) {
    const swipe = last.swipe_id ?? 0;
    const existing = warpMeta(last).swipes?.[String(swipe)];
    const rec: TurnRecord = existing ? { ...existing, events: [...existing.events, ...res.events] } : { v: 1, hints: [], events: res.events, at: Date.now() };
    await writeRecord(msg.chatId, last.id, swipe, rec);
  }
  await pushState(msg.chatId, userId);
  if (res.narrate) {
    await spindle.chat.appendMessage(msg.chatId, {
      role: "user",
      content: res.narrate.say,
      metadata: { warp: { intent: { actionId: DUNGEON_ACTION, via: "choice", label: res.narrate.say } } },
    }, { triggerGeneration: true });
  }
}
