// Small HTML helpers shared by the renderers. Every interpolated string goes through `esc`.

import type { Tier } from "../engine/ruleset.js";

export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Tone of a chance: good from 66 %, warn from 33 %. */
export function pctTone(p: number): "good" | "warn" | "bad" {
  return p >= 0.66 ? "good" : p >= 0.33 ? "warn" : "bad";
}

export const TIER_TONE: Record<Tier, "good" | "warn" | "bad"> = { crit_success: "good", success: "good", partial: "warn", fail: "bad", crit_fail: "bad" };

/** A collapsible section; `key` is remembered open or closed across renders. */
export function section(title: string, count: number, body: string, open: boolean, key = title): string {
  return `<details class="warp-section" data-section="${esc(key)}"${open ? " open" : ""}><summary><span>${esc(title)}${count ? ` · ${count}` : ""}</span></summary><div class="warp-section-body">${body}</div></details>`;
}

/** The small ✎ button that opens a line for a one-click fix. */
export function editButton(key: string, label: string): string {
  return `<button class="warp-btn warp-btn-ghost warp-edit" data-edit="${esc(key)}" title="${esc(label)}" aria-label="${esc(label)}">✎</button>`;
}

/** Whole percent, the way odds show everywhere. */
export const pct = (p: number) => `${Math.round(p * 100)}%`;
