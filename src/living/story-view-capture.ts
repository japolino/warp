import type { LlmMessageDTO } from "lumiverse-spindle-types";
import { getMessages, serializeMetadata, type Msg } from "../backend/ledger.js";
import { host } from "../backend/host.js";
import { STORY_VIEW, templatedStory, storyView, makeStoryView } from "./story-view.js";
import { storyRevision } from "./story-text.js";

/** Capture host-rendered history only by its exact source ID. Never evaluate a card script here. */
export async function captureStoryViews(chatId: string, prompt: LlmMessageDTO[], history: Msg[], current: () => boolean): Promise<Msg[]> {
  const candidates = history.filter(m => !m.is_user && templatedStory(m.content) && !storyView(m)).slice(-8);
  let changed = false;
  for (const message of candidates) {
    if (!current()) break;
    const rows = prompt.filter(p => p.sourceMessageId === message.id && p.role === "assistant");
    if (rows.length !== 1) continue;
    const content = rows[0].content;
    const text = typeof content === "string" ? content : Array.isArray(content) ? content.filter(p => p.type === "text").map(p => (p as { text: string }).text).join("\n") : undefined;
    if (text === undefined) continue;
    const view = makeStoryView(message, text); if (!view) continue;
    await serializeMetadata(chatId, message.id, async () => {
      const latest = (await getMessages(chatId)).find(m => m.id === message.id);
      if (!current() || !latest || latest.swipe_id !== message.swipe_id || storyRevision(latest.content) !== storyRevision(message.content) || storyView(latest)) return;
      await host().chat.updateMessage(chatId, latest.id, { metadata: { ...latest.metadata, [STORY_VIEW]: { ...((latest.metadata?.[STORY_VIEW] ?? {}) as object), [String(latest.swipe_id ?? 0)]: view } }, skipChunkRebuild: true });
      changed = true;
    });
  }
  return changed ? getMessages(chatId) : history;
}
