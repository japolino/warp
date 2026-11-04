import { getMessages, serializeMetadata, type Msg } from "../backend/ledger.js";
import { host } from "../backend/host.js";
import { revision } from "../shared/revision.js";
import { pathOf, pathsOf, rawPathsOf } from "./world.js";
import { STORY_BINDINGS, storyBinding, storyRevision, imageStoryContent, cardStoryContent, type StoryBinding } from "./story-text.js";

/** Capture only currently verifiable legacy hashes; receipt/state payloads are never rewritten. */
export function legacyStoryBindings(messages: Msg[]): { message: Msg; binding: StoryBinding }[] {
  const paths = pathsOf(messages), rawPaths = rawPathsOf(messages), root = pathOf([]);
  const imagePaths = rawPathsOf(messages.map(m => ({ ...m, content: imageStoryContent(m.content) })));
  const cardPaths = rawPathsOf(messages.map(m => ({ ...m, content: cardStoryContent(m.content) })));
  const legacy = messages.some((m, i) => {
    if (imagePaths.get(m.id) !== paths.get(m.id) || cardPaths.get(m.id) !== paths.get(m.id)) return true;
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
    const imageText = revision(imageStoryContent(message.content)), imagePrefix = i ? imagePaths.get(messages[i - 1].id)! : root, imagePath = imagePaths.get(message.id)!;
    const cardText = revision(cardStoryContent(message.content)), cardPrefix = i ? cardPaths.get(messages[i - 1].id)! : root, cardPath = cardPaths.get(message.id)!;
    const prefix = i ? paths.get(messages[i - 1].id)! : root, path = paths.get(message.id)!, text = storyRevision(message.content);
    const prior = (message.metadata?.[STORY_BINDINGS] as Record<string, StoryBinding> | undefined)?.[String(message.swipe_id ?? 0)];
    const old = prior && [prior.rawText, prior.rawPrefix, prior.rawPath].every(v => typeof v === "string")
      && (prior.text === imageText && prior.prefix === imagePrefix && prior.path === imagePath || prior.text === cardText && prior.prefix === cardPrefix && prior.path === cardPath || prior.text === text && prior.prefix === prefix && prior.path === path) ? prior : undefined;
    const binding: StoryBinding = { text, rawText: old?.rawText ?? revision(message.content), prefix, rawPrefix: old?.rawPrefix ?? (i ? rawPaths.get(messages[i - 1].id)! : root), path, rawPath: old?.rawPath ?? rawPaths.get(message.id)!,
      ...(old?.imageText || imageText !== text || imagePath !== path ? { imageText: old?.imageText ?? imageText, imagePrefix: old?.imagePrefix ?? imagePrefix, imagePath: old?.imagePath ?? imagePath } : {}),
      ...(old?.cardText || cardText !== text || cardPath !== path ? { cardText: old?.cardText ?? cardText, cardPrefix: old?.cardPrefix ?? cardPrefix, cardPath: old?.cardPath ?? cardPath } : {}) };
    if (binding.text === binding.rawText && binding.prefix === binding.rawPrefix && !binding.imageText && !binding.cardText || JSON.stringify(old) === JSON.stringify(binding)) return [];
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
    if (JSON.stringify(old) === JSON.stringify(binding)) return;
    await host().chat.updateMessage(chatId, current.id, { metadata: { ...current.metadata, [STORY_BINDINGS]: { ...((current.metadata?.[STORY_BINDINGS] ?? {}) as object), [String(current.swipe_id ?? 0)]: binding } }, skipChunkRebuild: true });
  })));
  return bindings.length ? getMessages(chatId) : messages;
}
