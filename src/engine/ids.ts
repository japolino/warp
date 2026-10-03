// Ids made from names the story writes (people, items, places, story goals).
//
// Letters and digits of any script are kept, so "아린" and "바크" stay two people. Latin accents fold away
// ("José" → "jose"); a pure-ASCII name gives exactly the id it always did ("The Rusty Anchor" → "the_rusty_anchor").
// A name with nothing usable in it gives "x". Ids already stored in a chat are never rewritten: people and items
// are found again by name, so a chat that holds an older id keeps working.

/** Accents on Latin letters, dropped so "Café" and "Cafe" are one id. Marks in other scripts stay (が is not か). */
const LATIN_MARKS = /(\p{Script=Latin})\p{M}+/gu;
/** Anything that isn't a letter, a digit, a mark or an emoji. */
const NOT_WORD = /[^\p{L}\p{N}\p{M}\p{Extended_Pictographic}]+/gu;

export function idFrom(name: string): string {
  const s = String(name).trim().toLowerCase().normalize("NFD").replace(LATIN_MARKS, "$1").normalize("NFC");
  return s.replace(NOT_WORD, "_").replace(/^_+|_+$/g, "") || "x";
}
