import type { Decision } from "./world.js";

/** Inclusive d100 upper bounds for clean success and success with a cost. */
export function attemptBands(tier: Decision["tier"]): [number, number] {
  return tier === "favorable" ? [60, 90] : tier === "outmatched" ? [10, 45] : [30, 75];
}
