import { revision } from "../shared/revision.js";

export const STORY_BINDINGS = "warpStoryBindings";
export interface StoryBinding { text: string; rawText: string; prefix: string; rawPrefix: string; path: string; rawPath: string; }
interface SourceMessage { content: string; swipe_id?: number; metadata?: Record<string, unknown>; }

/** Remove only Inlay's explicitly owned image projection, preserving the original paragraph separators. */
export function storyContent(content: string): string {
  if (!/inlay[_-]illustrator/i.test(content)) return content;
  const opening = /(?:<!--\s*inlay_illustrator\s*-->\s*)?<div\b(?=[^>]*\sdata-inlay-illustrator\s*=\s*(?:"true"|'true'|true(?=[\s>])))(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
  let result = "", cursor = 0, match: RegExpExecArray | null;
  while ((match = opening.exec(content))) {
    const tags = /<\/?div\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi; tags.lastIndex = opening.lastIndex;
    let depth = 1, end = -1, tag: RegExpExecArray | null;
    while ((tag = tags.exec(content))) {
      depth += /^<\//.test(tag[0]) ? -1 : 1;
      if (!depth) { end = tags.lastIndex; break; }
    }
    if (end < 0) break; // An incomplete/unknown wrapper cannot swallow the rest of a story.
    const separator = /^(?:[ \t]*\r?\n){2}/.exec(content.slice(end));
    if (separator) end += separator[0].length;
    result += content.slice(cursor, match.index); cursor = end; opening.lastIndex = end;
  }
  return cursor ? result + content.slice(cursor) : content;
}
export const storyRevision = (content: string) => revision(storyContent(content));
export function storyBinding(message: SourceMessage): StoryBinding | undefined {
  const value = (message.metadata?.[STORY_BINDINGS] as Record<string, StoryBinding> | undefined)?.[String(message.swipe_id ?? 0)];
  if (!value || [value.text, value.rawText, value.prefix, value.rawPrefix, value.path, value.rawPath].some(v => typeof v !== "string") || value.text !== storyRevision(message.content)) return;
  return value;
}
export function sourceRevisionMatches(message: SourceMessage, expected?: string): boolean {
  return !expected || expected === storyRevision(message.content) || expected === revision(message.content) || expected === storyBinding(message)?.rawText;
}
export function sourceContains(content: string, quote: string): boolean {
  return storyContent(content).replace(/\s+/g, " ").includes(quote);
}
export function recordPathMatches(message: SourceMessage, expected: string, canonical: string, raw: string, full = false): boolean {
  if (expected === canonical || expected === raw) return true;
  const binding = storyBinding(message);
  return !!binding && (full ? binding.path === canonical && binding.rawPath === expected : binding.prefix === canonical && binding.rawPrefix === expected);
}

/** Keep a complete current prose response ahead of decorative HTML when making a bounded model excerpt. */
export function storyExcerpt(content: string, limit: number): string {
  const clean = storyContent(content);
  if (clean.length <= limit) return clean;
  const head = Math.floor(limit * .75), tail = limit - head;
  return `${clean.slice(0, head)}\n[excerpt omitted]\n${clean.slice(-tail)}`;
}
