/** Read-only questions stay read-only when the player wraps dialogue in quotes. */
export function readOnlyIntent(content: string): boolean {
  const text = content.trim().replace(/^[*"'“”\s]+/, "").replace(/["'“”*\s]+$/, "").trim();
  if (/^\(?\s*(?:ooc|out of character)\b/i.test(text)) return true;
  if (!/^(?:what|how|where|who|when|why|can|could|would|should|do|does|is|are|show|list|explain)\b/i.test(text)) return false;
  const end = text.indexOf("?");
  // A question followed by an actual action is a mixed message for the compiler.
  return end < 0 || !/[\p{L}\p{N}]/u.test(text.slice(end + 1));
}
