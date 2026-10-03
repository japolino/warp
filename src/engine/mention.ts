// Is something "in play" in a piece of text? Shared by the turn readers and the
// narrator's block (which only names what the turn is about).

/** Does the text mention this name? Its full name, its head noun ("hoodie"), or most of its words. */
export function mentions(text: string, name: string): boolean {
  const t = text.toLowerCase();
  const n = name.toLowerCase().trim();
  if (!n) return false;
  if (t.includes(n)) return true;
  const words = n.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !["the", "and", "with", "for", "of"].includes(w));
  if (!words.length) return false;
  const has = (w: string) => new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?([^\\p{L}]|$)`, "u").test(t);
  if (has(words[words.length - 1])) return true;
  return words.filter(has).length * 2 >= words.length && words.length > 1;
}

const STOP = new Set(["the", "and", "with", "for", "of", "a", "an", "to", "in", "on", "at", "from", "into", "across", "your", "my", "his", "her", "their"]);
const sig = (name: string) => name.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter((w) => w.length >= 3 && !STOP.has(w));
const hasWord = (t: string, w: string) => new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?([^\\p{L}]|$)`, "u").test(t);

/**
 * Stricter, for a list of things the narrator might be handed: the full name; a one-word name; or the head noun
 * when nothing else in the list shares it ("soothing potion" names the soothing one, not the energy potion);
 * otherwise most of its words. "City square" doesn't name the "city grimoire".
 */
export function namesIt(text: string, name: string, others: string[] = []): boolean {
  const t = text.toLowerCase();
  const n = name.toLowerCase().trim();
  if (!n) return false;
  if (t.includes(n)) return true;
  const words = sig(n);
  if (!words.length) return false;
  const hits = words.filter((w) => hasWord(t, w)).length;
  if (words.length === 1) return hits === 1;
  const head = words[words.length - 1];
  const shared = others.some((o) => o.toLowerCase() !== n && sig(o).slice(-1)[0] === head);
  if (hasWord(t, head) && (!shared || hits >= 2)) return true;
  return hits >= Math.max(2, words.length - 1);
}

/** A title ("A parcel across the city", "Nectar for Tsukiko"): the full title, or all its words but one (all, for two). */
export function namesTitle(text: string, title: string): boolean {
  const t = text.toLowerCase();
  if (t.includes(title.toLowerCase().trim())) return true;
  const words = sig(title);
  if (!words.length) return false;
  const hits = words.filter((w) => hasWord(t, w)).length;
  return hits >= (words.length <= 2 ? words.length : words.length - 1);
}
