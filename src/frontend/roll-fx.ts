// The one roll animation: when a new reply carries a roll, its dice chip pops, the row glows by tier and a
// short stamp ("🎲 SUCCESS · Body") shows for 2.6 s. No sound, no particles; reduced motion = glow only.

import type { BackendToFrontend, RecordView } from "../shared/protocol.js";
import { TIER_TONE } from "./html.js";

type StateMsg = Extract<BackendToFrontend, { type: "state" }>;

const rollKey = (r: RecordView) => (r.check ? `${r.messageId}:${r.swipe}:${r.check.total}:${r.check.tier}` : null);

/** Rolls in `next` that `prev` didn't have. None on the first push or a chat switch (no replay of old rolls). */
export function newRolls(prev: StateMsg | null, next: StateMsg): RecordView[] {
  if (!prev || prev.chatId !== next.chatId) return [];
  const seen = new Set(prev.records.map(rollKey).filter(Boolean));
  return next.records.filter((r) => r.check && !seen.has(rollKey(r)));
}

export const ROLL_MS = 2600;

/** Play the animation on the row under a reply. */
export function playRoll(row: HTMLElement, rec: RecordView, reduced: boolean): void {
  if (!rec.check) return;
  const tone = TIER_TONE[rec.check.tier] ?? "neutral";
  row.classList.add("warp-roll", `warp-roll-${tone}`);
  let stamp: HTMLElement | null = null;
  if (!reduced) {
    row.querySelector(".warp-dice")?.classList.add("warp-roll-pop");
    stamp = document.createElement("span");
    stamp.className = `warp-roll-stamp warp-tone-${tone}`;
    stamp.setAttribute("aria-hidden", "true");
    stamp.textContent = `🎲 ${rec.check.tierLabel.toUpperCase()} · ${rec.check.label}`;
    row.appendChild(stamp);
  }
  setTimeout(() => {
    row.classList.remove("warp-roll", `warp-roll-${tone}`);
    row.querySelector(".warp-dice")?.classList.remove("warp-roll-pop");
    stamp?.remove();
  }, ROLL_MS);
}

/** The user asked the system for less motion. */
export function prefersReducedMotion(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}
