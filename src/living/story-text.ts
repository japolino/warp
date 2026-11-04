import { revision } from "../shared/revision.js";

export const STORY_BINDINGS = "warpStoryBindings";
export interface StoryBinding { text: string; rawText: string; prefix: string; rawPrefix: string; path: string; rawPath: string; imageText?: string; imagePrefix?: string; imagePath?: string; }
interface SourceMessage { content: string; swipe_id?: number; metadata?: Record<string, unknown>; }

/** Remove only Inlay's explicitly owned image projection, preserving the original paragraph separators. */
export function imageStoryContent(content: string): string {
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

/** Restore owned asset placeholders and omit the imported card's terminal UI trigger. */
export function storyContent(content: string): string {
  // LumiRealm imports can move their ★▲number★ UI trigger to the newest reply.
  // Recognize only that terminal trigger immediately following its SEED footer.
  // Keep the seed, STATUS_PANEL and all ordinary story text and unpaired symbols.
  const clean = imageStoryContent(content).replace(/(<!--\[SEED\|[A-Za-z0-9_-]{8,128}\]-->)[ \t]*\r?\n[ \t]*★▲\d{1,9}★?[ \t\r\n]*$/u, "$1");
  return clean.replace(/<span\b(?=[^>]*\sdata-inlay-illustrator-suppressed\s*=)(?:"[^"]*"|'[^']*'|[^'">])*>\s*<\/span\s*>/gi, carrier => {
    const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(carrier);
    const id = attr("data-inlay-illustrator-suppressed"), payload = attr("data-inlay-illustrator-suppressed-payload");
    if (!id || !payload) return carrier;
    try {
      const decoded = decodeURIComponent(payload[1] ?? payload[2]);
      let hash = 2166136261;
      for (let i = 0; i < decoded.length; i++) hash = Math.imul(hash ^ decoded.charCodeAt(i), 16777619) >>> 0;
      const expected = `NAS1${hash.toString(16).padStart(8, "0").toUpperCase()}${decoded.length.toString(36).toUpperCase()}`;
      return expected === (id[1] ?? id[2]) ? decoded : carrier;
    } catch { return carrier; }
  });
}
export const storyRevision = (content: string) => revision(storyContent(content));
export function storyBinding(message: SourceMessage): StoryBinding | undefined {
  const value = (message.metadata?.[STORY_BINDINGS] as Record<string, StoryBinding> | undefined)?.[String(message.swipe_id ?? 0)];
  if (!value || [value.text, value.rawText, value.prefix, value.rawPrefix, value.path, value.rawPath].some(v => typeof v !== "string") || value.text !== storyRevision(message.content)) return;
  return value;
}
export function sourceRevisionMatches(message: SourceMessage, expected?: string): boolean {
  const binding = storyBinding(message);
  return !expected || expected === storyRevision(message.content) || expected === revision(message.content) || expected === revision(imageStoryContent(message.content)) || expected === binding?.rawText || expected === binding?.imageText;
}
export function sourceContains(content: string, quote: string): boolean {
  return storyContent(content).replace(/\s+/g, " ").includes(quote);
}
export function recordPathMatches(message: SourceMessage, expected: string, canonical: string, raw: string, full = false): boolean {
  if (expected === canonical || expected === raw) return true;
  const binding = storyBinding(message);
  return !!binding && (full ? binding.path === canonical && (binding.rawPath === expected || binding.imagePath === expected) : binding.prefix === canonical && (binding.rawPrefix === expected || binding.imagePrefix === expected));
}

/** Keep a complete current prose response ahead of decorative HTML when making a bounded model excerpt. */
export function storyExcerpt(content: string, limit: number): string {
  const clean = storyContent(content);
  if (clean.length <= limit) return clean;
  const head = Math.floor(limit * .75), tail = limit - head;
  return `${clean.slice(0, head)}\n[excerpt omitted]\n${clean.slice(-tail)}`;
}
