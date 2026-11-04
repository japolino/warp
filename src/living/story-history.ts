import { getMessages, serializeMetadata, type Msg } from "../backend/ledger.js";
import { host } from "../backend/host.js";
import { revision } from "../shared/revision.js";
import { pathOf, pathsOf, rawPathsOf } from "./world.js";
import { STORY_BINDINGS, storyBinding, storyRevision, type StoryBinding } from "./story-text.js";

/** Capture only currently verifiable legacy hashes; receipt/state payloads are never rewritten. */
export function legacyStoryBindings(messages: Msg[]): { message: Msg; binding: StoryBinding }[] {
  const paths = pathsOf(messages), rawPaths = rawPathsOf(messages), root = pathOf([]);
  const legacy = messages.some((m, i) => {
    const slots = String(m.swipe_id ?? 0), raw = revision(m.content), text = storyRevision(m.content);
    const attempt = m.metadata?.warpLivingAttempt as { path?: string } | undefined;
    if (attempt?.path === rawPaths.get(m.id) && attempt?.path !== paths.get(m.id)) return true;
    return ["warpLiving", "warpMechanics", "warpLivingPrompt"].some(key => {
      const record = (m.metadata?.[key] as any)?.[slots];
      if (!record) return false;
      if (record.text === raw && raw !== text) return true;
      return key === "warpLivingPrompt" ? record.path === rawPaths.get(m.id) && record.path !== paths.get(m.id)
        : record.path === (i ? rawPaths.get(messages[i - 1].id) : root) && record.path !== (i ? paths.get(messages[i - 1].id) : root);
    });
  });
  if (!legacy) return [];
  return messages.flatMap((message, i) => {
    const binding: StoryBinding = { text: storyRevision(message.content), rawText: revision(message.content), prefix: i ? paths.get(messages[i - 1].id)! : root, rawPrefix: i ? rawPaths.get(messages[i - 1].id)! : root, path: paths.get(message.id)!, rawPath: rawPaths.get(message.id)! };
    const old = storyBinding(message);
    if (binding.text === binding.rawText && binding.prefix === binding.rawPrefix || old?.text === binding.text && old.prefix === binding.prefix && old.path === binding.path) return [];
    return [{ message, binding }];
  });
}

/** Migration runs at living-play entry points, outside the per-message metadata lock. */
export async function storyHistory(chatId: string): Promise<Msg[]> {
  const messages = await getMessages(chatId), bindings = legacyStoryBindings(messages);
  for (let start = 0; start < bindings.length; start += 8) await Promise.all(bindings.slice(start, start + 8).map(({ message, binding }) => serializeMetadata(chatId, message.id, async () => {
    const currentHistory = await getMessages(chatId), current = currentHistory.find(m => m.id === message.id);
    if (!current || current.swipe_id !== message.swipe_id || storyRevision(current.content) !== binding.text || pathsOf(currentHistory).get(current.id) !== binding.path) return;
    const old = storyBinding(current);
    if (old?.prefix === binding.prefix && old.path === binding.path) return;
    await host().chat.updateMessage(chatId, current.id, { metadata: { ...current.metadata, [STORY_BINDINGS]: { ...((current.metadata?.[STORY_BINDINGS] ?? {}) as object), [String(current.swipe_id ?? 0)]: binding } }, skipChunkRebuild: true });
  })));
  return bindings.length ? getMessages(chatId) : messages;
}
