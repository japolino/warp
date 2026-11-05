import { revision } from "../shared/revision.js";
import { storyContent, storyRevision, sourceRevisionMatches, sourceContains } from "./story-text.js";

export const STORY_VIEW = "warpStoryView";
export interface StoryView { version: 1; sourceRevision: string; revision: string; text: string; }
interface Source { id: string; content: string; is_user?: boolean; swipe_id?: number; metadata?: Record<string, unknown>; }
export interface ViewedEvidence { message: string; quote: string; sourceRevision?: string; viewRevision?: string; }
export const conditionalStory = (content: string) => /\{\{\s*#(?:when|if|if_pure|unless|each)\b/i.test(content);

export const templatedStory = (content: string) => conditionalStory(content) || /\{\{[a-z_.#\/][^{}]*\}\}/i.test(content);

export function storyView(message: Source): StoryView | undefined {
  const candidate = (message.metadata?.[STORY_VIEW] as Record<string, StoryView> | undefined)?.[String(message.swipe_id ?? 0)];
  if (!candidate || candidate.version !== 1 || typeof candidate.sourceRevision !== "string" || typeof candidate.text !== "string"
    || candidate.text.length > 200000 || candidate.revision !== revision(candidate.text) || conditionalStory(candidate.text)
    || !sourceRevisionMatches(message, candidate.sourceRevision)) return;
  return candidate;
}
export function makeStoryView(message: Source, text: string): StoryView | undefined {
  if (message.is_user || !templatedStory(message.content) || typeof text !== "string" || text.length > 200000 || conditionalStory(text)) return;
  return { version: 1, sourceRevision: storyRevision(message.content), revision: revision(text), text };
}

/** Conditional source is not an event until the host has supplied its actual prompt view. */
export function storyReadContent(message: Source): string {
  if (message.is_user || !templatedStory(message.content)) return storyContent(message.content);
  const view = storyView(message);
  const text = view ? storyContent(view.text) : "";
  return /[\p{L}\p{N}]/u.test(text) ? text : "";
}

/** New reads cite the rendered view; legacy mechanical replay keeps its former raw-source path. */
export function readStoryEvidence(message: Source, quote: string, expected?: ViewedEvidence, historical = false): ViewedEvidence | undefined {
  const rawRevision = expected?.sourceRevision ?? storyRevision(message.content);
  if (!sourceRevisionMatches(message, rawRevision)) return;
  const view = storyView(message);
  if (historical && !expected?.viewRevision) return sourceContains(message.content, quote) ? { message: message.id, quote, sourceRevision: rawRevision } : undefined;
  if (expected?.viewRevision && (!view || view.revision !== expected.viewRevision)) return;
  if (!sourceContains(storyReadContent(message), quote)) return;
  return { message: message.id, quote, sourceRevision: rawRevision, ...(view && !message.is_user && templatedStory(message.content) ? { viewRevision: view.revision } : {}) };
}
export function storyEvidenceMatches(message: Source, evidence: ViewedEvidence): boolean {
  return !!readStoryEvidence(message, evidence.quote, evidence, true);
}
