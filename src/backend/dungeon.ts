// Dungeon actions from the stage. Every step is recorded on the latest message
// (like any sheet edit); story moments play as short snippets on the stage.

import { randomSeed } from "../engine/dice.js";
import type { TurnRecord } from "../engine/resolve.js";
import { foldEvents, type GameState, type WarpEvent } from "../engine/state.js";
import type { Ruleset } from "../engine/ruleset.js";
import {
  battleCommand, chooseEvent, descend, enterDungeon, leaveDungeon, moveTo, shopBuy, useItem, type DungeonResult,
} from "../engine/dungeon/run.js";
import type { DungeonOp } from "../shared/protocol.js";
import { toast } from "./host.js";
import { foldPath, getMessages, patchWarpMeta } from "./ledger.js";
import { getRuleset } from "./source.js";
import { pushState } from "./state-push.js";
import { playScene } from "./scene.js";
import { operationCurrent, releaseOperation, takeOperation } from "./operations.js";

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
  const operation = takeOperation(msg.chatId);
  if (!operation) { toast("info", "Wait for the story to catch up first.", userId); return; }
  try {
    const loaded = await getRuleset(msg.chatId, userId);
    const r = loaded?.ruleset;
    if (!r) return;
    const msgs = await getMessages(msg.chatId);
    const last = msgs[msgs.length - 1];
    if (!last) { toast("warning", "Send a message first — the dungeon attaches to the latest message.", userId); return; }
    let state!: GameState, res!: DungeonResult;
    await patchWarpMeta(msg.chatId, last.id, async (w, current) => {
      if (!operationCurrent(msg.chatId, operation)) throw new Error("Dungeon operation superseded");
      const now = await getMessages(msg.chatId);
      if (now.at(-1)?.id !== last.id || current.swipe_id !== last.swipe_id) throw new Error("Dungeon history changed");
      const folded = foldPath(r, now, 0);
      if (folded.conflict) throw new Error("Review the changed history first");
      state = folded.state; res = run(r, state, msg);
      if (res.error || !res.events.length) return w;
      const slot = String(current.swipe_id ?? 0), existing = w.swipes?.[slot];
      const rec: TurnRecord = existing ? { ...existing, events: [...existing.events, ...res.events] } : { v: 1, hints: [], events: res.events, at: Date.now() };
      return { ...w, swipes: { ...w.swipes, [slot]: rec } };
    });
    if (res.error) { toast("warning", res.error, userId); return; }
    await pushState(msg.chatId, userId);
    // Story moments play on the stage as a short snippet, off the chat.
    const was = state.dungeon;
    const after = foldEvents(r, [res.events], state);
    const lost = res.events.some((e) => e.t === "dg_exit" && e.outcome === "lost");
    const money = r.dungeons[was?.id ?? ""]?.currency ?? r.hud.money;
    const endedRun = was && !res.events.some((e: WarpEvent) => e.t === "dg_enter") && res.events.some((e: WarpEvent) => e.t === "dg_exit")
      ? { name: r.dungeons[was.id]?.name ?? "the dungeon", depth: was.depth,
        outcome: lost ? "lost" as const : "left" as const,
        gold: lost || !money ? 0 : Math.max(0, (after.stats[money] ?? 0) - (state.stats[money] ?? 0)),
        ...(lost ? { lostGold: was.gold } : {}) }
      : undefined;
    if (res.narrate) await playScene({ chatId: msg.chatId, userId, kind: "dungeon", intent: null, said: res.narrate.say, operation,
      resolved: { before: state, after, rec: { v: 1, hints: [], events: res.events, at: Date.now() } },
      ...(endedRun ? { runEnded: endedRun } : {}) });
  } finally {
    releaseOperation(msg.chatId, operation);
    await pushState(msg.chatId, userId);
  }
}
