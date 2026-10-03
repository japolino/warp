// Errands, items and travel done off the page: the rules run, the latest message
// keeps the events (like a sheet change), and the next reply is told in one line.

import { randomSeed } from "../engine/dice.js";
import { cleanResult } from "../engine/games.js";
import type { GameResult } from "../shared/protocol.js";
import { runQuiet } from "../engine/errands.js";
import type { TurnRecord } from "../engine/resolve.js";
import { summarizeEvents } from "../engine/view.js";
import { toast } from "./host.js";
import { foldPath, getMessages, patchWarpMeta } from "./ledger.js";
import { getSettings } from "./settings.js";
import { getRuleset } from "./source.js";
import { busyChats, pushState } from "./state-push.js";

/** Chip text without its icon ("📈 Charm +1" → "Charm +1"). */
const plain = (t: string) => t.replace(/^[^\p{L}\p{N}+−-]+/u, "").trim();

export async function doQuiet(msg: { chatId: string; actionId: string; params?: Record<string, string>; times?: number; game?: GameResult }, userId?: string): Promise<boolean> {
  if (busyChats.has(msg.chatId)) { toast("info", "One moment — the story is still being written.", userId); return false; }
  const settings = await getSettings(userId);
  const travel = msg.actionId.startsWith("go:");
  if (!settings.enabled || (travel ? !settings.quietTravel : !settings.errands)) return false;
  const r = (await getRuleset(msg.chatId, userId))?.ruleset;
  if (!r) return false;
  const msgs = await getMessages(msg.chatId);
  const last = msgs[msgs.length - 1];
  if (!last) { toast("warning", "Send a message first — what you do attaches to the latest message.", userId); return false; }
  let line: string | null = null, error: string | undefined, done = 0, wanted = Math.max(1, Math.floor(msg.times ?? 1));
  await patchWarpMeta(msg.chatId, last.id, async (w, current) => {
    const now = await getMessages(msg.chatId);
    if (now.at(-1)?.id !== last.id || current.swipe_id !== last.swipe_id) { error = "The chat moved on — try again."; return w; }
    const folded = foldPath(r, now, 0);
    if (folded.conflict) { error = "Earlier history changed — check the Warp sheet first."; return w; }
    const res = runQuiet(r, folded.state, msg.actionId, wanted, {
      seed: randomSeed, params: msg.params, ...(msg.game ? { game: cleanResult(msg.game, []) ?? undefined } : {}),
      changes: (b, a, evs) => summarizeEvents(r, b, a, evs).filter((c) => !/^⏱|^🕒|^⌛/u.test(c.text)).map((c) => plain(c.text)).slice(0, 6),
    });
    if (res.error) { error = res.error; return w; }
    line = res.line; done = res.done;
    const slot = String(current.swipe_id ?? 0), existing = w.swipes?.[slot];
    const rec: TurnRecord = existing
      ? { ...existing, events: [...existing.events, ...res.events], quiet: [...(existing.quiet ?? []), ...(line ? [line] : [])] }
      : { v: 1, hints: [], events: res.events, at: Date.now(), ...(line ? { quiet: [line] } : {}) };
    return { ...w, swipes: { ...w.swipes, [slot]: rec } };
  });
  if (error) toast("warning", error, userId);
  else if (line) toast("success", `${line}${done < wanted ? ` — stopped after ${done}, can't go on` : ""}`, userId);
  await pushState(msg.chatId, userId);
  return !error;
}
