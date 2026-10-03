// Is something "in play" in a piece of text? Shared by the turn readers and the
// narrator's block (which only names what the turn is about).

/** Hangul, Chinese characters and kana: two letters already make a word (most Korean nouns have two syllables). */
export const CJK = /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
/** Korean particles a noun carries with no space (예장검을, 유물에서는): up to two of them may follow a name. */
const PARTICLE = "(?:이|가|을|를|은|는|의|에|에서|에게|에게서|한테|께|와|과|랑|이랑|도|만|로|으로|까지|부터|처럼|보다|조차|마저|이나|나|야|아|이여|여)";
/** Is this word long enough to count? Three letters, or two in Hangul, Chinese characters or kana. */
const longEnough = (w: string) => w.length >= 3 || (w.length >= 2 && CJK.test(w));
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The word on its own: a Latin word may take a plural s/es; a Korean word may take particles; Chinese and kana have no spaces. */
function hasWord(t: string, w: string): boolean {
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(w)) return t.includes(w);
  const tail = /\p{Script=Hangul}$/u.test(w) ? `${PARTICLE}{0,2}` : "(s|es)?";
  return new RegExp(`(^|[^\\p{L}])${esc(w)}${tail}([^\\p{L}]|$)`, "u").test(t);
}

/** Does the text mention this name? Its full name, its head noun ("hoodie"), or most of its words. */
export function mentions(text: string, name: string): boolean {
  const t = text.toLowerCase();
  const n = name.toLowerCase().trim();
  if (!n) return false;
  if (t.includes(n)) return true;
  const words = n.split(/[^\p{L}\p{N}]+/u).filter((w) => longEnough(w) && !["the", "and", "with", "for", "of"].includes(w));
  if (!words.length) return false;
  const has = (w: string) => hasWord(t, w);
  if (has(words[words.length - 1])) return true;
  return words.filter(has).length * 2 >= words.length && words.length > 1;
}

const STOP = new Set(["the", "and", "with", "for", "of", "a", "an", "to", "in", "on", "at", "from", "into", "across", "your", "my", "his", "her", "their"]);
const sig = (name: string) => name.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter((w) => longEnough(w) && !STOP.has(w));

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
