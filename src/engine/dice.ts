// Dice notation and a seeded RNG. Every roll the engine makes goes through here,
// so rolls are reproducible from their seed and never touched by a model.
//
// Supported: d20, 2d6, d100 / d%, 4d6kh3, 2d20kl1, 3d6!, 1d8+2, 2d6+1d4-1

export type Rng = () => number;

/** xmur3 string hash → 32-bit seed. */
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 — small, fast, good enough for games. */
export function seededRng(seed: string): Rng {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface DiceGroup {
  count: number;
  sides: number;
  keep?: { mode: "kh" | "kl"; n: number };
  explode?: boolean;
  sign: 1 | -1;
}

export interface ParsedDice {
  groups: DiceGroup[];
  flat: number;
  /** Largest single-die size, used to spot natural crits. */
  primarySides: number;
}

export class DiceError extends Error {}

const TERM = /([+-]?)\s*(?:(\d*)d(\d+|%)(?:(kh|kl)(\d+))?(!)?|(\d+))/gy;

export function parseDice(src: string): ParsedDice {
  const s = src.replace(/\s+/g, "").toLowerCase();
  if (!s) throw new DiceError("Dice notation is empty");
  const groups: DiceGroup[] = [];
  let flat = 0;
  TERM.lastIndex = 0;
  let consumed = 0;
  let m: RegExpExecArray | null;
  while (consumed < s.length && (m = TERM.exec(s))) {
    if (m[0] === "") break;
    if (consumed > 0 && !m[1]) break;
    const sign = m[1] === "-" ? -1 : 1;
    if (m[7] !== undefined) {
      flat += sign * Number(m[7]);
    } else {
      const count = m[2] ? Number(m[2]) : 1;
      const sides = m[3] === "%" ? 100 : Number(m[3]);
      if (count < 1 || count > 100) throw new DiceError(`"${src}": dice count must be 1–100`);
      if (sides < 2 || sides > 1000) throw new DiceError(`"${src}": dice need 2–1000 sides`);
      const g: DiceGroup = { count, sides, sign };
      if (m[4]) {
        const n = Number(m[5]);
        if (n < 1 || n > count) throw new DiceError(`"${src}": can't keep ${n} of ${count} dice`);
        g.keep = { mode: m[4] as "kh" | "kl", n };
      }
      if (m[6]) g.explode = true;
      groups.push(g);
    }
    consumed = TERM.lastIndex;
  }
  if (consumed !== s.length) throw new DiceError(`"${src}" isn't valid dice notation (try d20, 2d6, d100, 4d6kh3)`);
  if (!groups.length) throw new DiceError(`"${src}" has no dice in it`);
  return { groups, flat, primarySides: Math.max(...groups.map((g) => g.sides)) };
}

export interface DiceRoll {
  notation: string;
  /** Every die rolled, including dropped ones. */
  dice: { sides: number; value: number; kept: boolean }[];
  total: number;
  /** The kept face of the first group when it's a single die — used for natural 1 / natural 20 checks. */
  natural: number | null;
  primarySides: number;
}

export function rollDice(notation: string, rng: Rng): DiceRoll {
  const parsed = parseDice(notation);
  const dice: DiceRoll["dice"] = [];
  let total = parsed.flat;
  let natural: number | null = null;
  parsed.groups.forEach((g, gi) => {
    const faces: number[] = [];
    for (let i = 0; i < g.count; i++) {
      let face = 1 + Math.floor(rng() * g.sides);
      faces.push(face);
      // Exploding: re-roll on max, cap chain length so a d2! can't loop forever.
      let chain = 0;
      while (g.explode && face === g.sides && chain++ < 20) {
        face = 1 + Math.floor(rng() * g.sides);
        faces.push(face);
      }
    }
    const order = faces.map((v, i) => ({ v, i }));
    let keptIdx = new Set(order.map((o) => o.i));
    if (g.keep) {
      order.sort((x, y) => (g.keep!.mode === "kh" ? y.v - x.v : x.v - y.v));
      keptIdx = new Set(order.slice(0, g.keep.n).map((o) => o.i));
    }
    faces.forEach((v, i) => {
      const kept = keptIdx.has(i);
      dice.push({ sides: g.sides, value: v, kept });
      if (kept) total += g.sign * v;
    });
    const keptFaces = faces.filter((_, i) => keptIdx.has(i));
    if (gi === 0 && keptFaces.length === 1) natural = keptFaces[0];
  });
  return { notation, dice, total, natural, primarySides: parsed.primarySides };
}
