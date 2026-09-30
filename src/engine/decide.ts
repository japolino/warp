// Typed decisions ("System 1" questions).
//
// Mirrors TypeSafe's primitives so any provider — Jev, an LLM, or plain rules —
// can answer them. Models only ever return probabilities; when the engine needs
// an actual pick it samples from them with its own seeded RNG.

import type { Rng } from "./dice.js";

export type Question =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } };

export type Answer =
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: "score"; score: number; probabilities: Record<string, number>; confidence: number }
  | { type: "noul"; noul: number };

export type Questions = Record<string, Question>;
export type Answers = Record<string, Answer>;

export interface DecideOptions {
  signal?: AbortSignal;
}

export interface Decider {
  readonly id: "jev" | "llm" | "rules";
  /** Can this provider answer questions that need free text (names)? */
  readonly canWrite: boolean;
  ask(state: unknown, questions: Questions, opts?: DecideOptions): Promise<Answers>;
}

/** Normalise a probability map so it sums to 1 over `keys` (missing keys get 0). */
export function normalize(p: Record<string, number>, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  let sum = 0;
  for (const k of keys) {
    const v = Number(p[k]);
    out[k] = Number.isFinite(v) && v > 0 ? v : 0;
    sum += out[k];
  }
  if (sum <= 0) for (const k of keys) out[k] = 1 / keys.length;
  else for (const k of keys) out[k] /= sum;
  return out;
}

/** Weighted draw — the engine's dice, the model's odds. */
export function sample(p: Record<string, number>, rng: Rng): string {
  const keys = Object.keys(p);
  let x = rng();
  for (const k of keys) {
    x -= p[k];
    if (x <= 0) return k;
  }
  return keys[keys.length - 1];
}

/** How sure a yes/no answer is: 0 at 50/50, 1 at certainty. */
export function noulConfidence(p: number): number {
  return Math.abs(2 * p - 1);
}

/** Map a fractional score (0..n-1) to the nearest index. */
export function scoreIndex(a: Answer | undefined, levels: number): number | null {
  if (!a || a.type !== "score") return null;
  return Math.max(0, Math.min(levels - 1, Math.round(a.score)));
}
