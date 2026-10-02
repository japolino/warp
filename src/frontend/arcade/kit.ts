// What every minigame gets from the arcade: where to draw, the clock, input, the
// difficulty and aids, a live score for the bar, lives, banners — and one way out.

import type { AidKind, GameAid, GameBar, GameId } from "../../engine/game-ids.js";
import type { Synth } from "./synth.js";
import type { Song } from "./songs.js";
import type { Theme } from "./themes.js";

export interface Play {
  mode: "check" | "gamble";
  game: GameId;
  /** 0 = trivial … 1 = nearly hopeless. */
  level: number;
  /** The score to beat (checks). */
  bar: GameBar | null;
  aids: GameAid[];
  seed: string;
  partner?: { name: string; sync: number };
  /** Gambling: the buy-in, how many rounds, the currency sign, the house edge. */
  stake?: number;
  rounds?: number;
  currency?: string;
  edge?: number;
  /** Rhythm games: the chosen song. */
  song?: Song;
}

export interface Finish {
  /** 0–1, checks. */
  score?: number;
  /** Chips at the end (gambling: the net is chips − stake). */
  chips?: number;
  beats: string[];
  detail?: string;
  quit?: boolean;
}

export interface Kit {
  play: Play;
  /** The look: medieval, modern or sci-fi tokens to draw with. */
  theme: Theme;
  /** The game's own area; it fills the stage. */
  root: HTMLElement;
  rng: () => number;
  /** The total of an aid (capped). */
  aid(kind: AidKind): number;
  synth: Synth;
  /** A crisp canvas that fills the game area and follows its size. */
  canvas(): Canvas;
  /** Call `fn` every frame while the game runs (paused frames are skipped). dt in seconds. */
  loop(fn: (dt: number, t: number) => void): void;
  /** Keys while the game has focus. Return true to swallow the key. */
  onKey(fn: (e: KeyboardEvent, down: boolean) => boolean | void): void;
  /** The live score for the bar (0–1), or the chips for a table. */
  score(x: number): void;
  chips(n: number): void;
  /** A short line under the bar ("Lines 4 / 10", "Hand 3 of 5"). */
  status(text: string): void;
  /** Lives left; `spend()` uses one and says so, false when there are none. */
  lives: { left(): number; spend(why?: string): boolean };
  banner(text: string, tone?: "good" | "bad" | "info" | "gold"): void;
  /** Shake the stage (hits, mines, drains). */
  shake(strength?: number): void;
  finish(f: Finish): void;
  /** Note how well it's going right now (0–1); the story hears the shape of it. */
  track(x: number): void;
  /** Pausing and resuming (also called once at the start: paused through the countdown, then running). */
  onPause(fn: (paused: boolean) => void): void;
  /** Giving up from the pause menu: report what you have (call finish), or leave it to the arcade. */
  onQuit(fn: () => void): void;
  readonly paused: boolean;
  readonly reduced: boolean;
}

export interface Canvas {
  el: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  /** Size in CSS pixels. */
  w: number;
  h: number;
  /** Called after each resize. */
  onResize(fn: () => void): void;
}

export interface GameDef {
  id: GameId;
  title: string;
  howTo: string[];
  controls: string;
  /** Rhythm games pick a song first. */
  rhythm?: boolean;
  start(k: Kit): () => void;
}

// ───────────────────────── helpers ─────────────────────────

export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * How it went, from how well it was going over time: "a shaky start", "found
 * their feet", "fell apart at the end", "steady throughout", "flawless".
 */
export function arcBeats(samples: number[], final: number): string[] {
  if (samples.length < 3) return final >= 0.95 ? ["flawless"] : [];
  const third = Math.max(1, Math.floor(samples.length / 3));
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const a = avg(samples.slice(0, third)), b = avg(samples.slice(third, third * 2)), c = avg(samples.slice(third * 2));
  const out: string[] = [];
  if (final >= 0.97) return ["flawless from start to finish"];
  if (a < 0.45 && c > a + 0.2) out.push("a shaky start", "found their footing", c > 0.75 ? "finished strong" : "steadied by the end");
  else if (a > 0.7 && c < a - 0.25) out.push("a confident start", b < a - 0.15 ? "lost the thread midway" : "held on for a while", "fell apart at the end");
  else if (b < Math.min(a, c) - 0.2) out.push("a good start", "a bad stumble in the middle", c > 0.6 ? "recovered" : "never quite recovered");
  else if (Math.abs(a - c) < 0.12) out.push(c > 0.75 ? "steady and sure throughout" : c > 0.45 ? "uneven throughout" : "struggled throughout");
  else out.push(c > a ? "got better as it went" : "got worse as it went");
  return out;
}

/** "Hand 3 of 5" etc. */
export const of = (n: number, total: number, what: string) => `${what} ${Math.min(n, total)} of ${total}`;

/** A canvas that matches its box at the screen's pixel density. */
export function makeCanvas(host: HTMLElement): Canvas & { dispose(): void } {
  const el = document.createElement("canvas");
  el.className = "warp-ar-canvas";
  host.appendChild(el);
  const g = el.getContext("2d")!;
  const subs: (() => void)[] = [];
  const c = {
    el, g, w: 1, h: 1,
    onResize(fn: () => void) { subs.push(fn); },
    dispose() { ro.disconnect(); el.remove(); },
  };
  const fit = () => {
    const r = host.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.w = Math.max(1, r.width); c.h = Math.max(1, r.height);
    el.width = Math.round(c.w * dpr); el.height = Math.round(c.h * dpr);
    el.style.width = `${c.w}px`; el.style.height = `${c.h}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const f of subs) f();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  fit();
  return c;
}

/** A rounded rectangle path. */
export function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

/** Little bursts of light for hits, clears and wins. */
export class Sparks {
  private ps: { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }[] = [];
  burst(x: number, y: number, color: string, n = 14, speed = 220, size = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.65);
      this.ps.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.4 + Math.random() * 0.45, color, size: size * (0.6 + Math.random() * 0.8) });
    }
  }
  step(dt: number, gravity = 0) {
    for (const p of this.ps) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += gravity * dt; p.vx *= 1 - dt * 2.2; p.vy *= 1 - dt * 2.2; }
    this.ps = this.ps.filter((p) => p.life < p.max);
  }
  draw(g: CanvasRenderingContext2D) {
    for (const p of this.ps) {
      const k = 1 - p.life / p.max;
      g.globalAlpha = k;
      g.fillStyle = p.color;
      g.beginPath(); g.arc(p.x, p.y, p.size * k + 0.5, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }
}

/** Floating text that rises and fades ("PERFECT", "+120"). */
export class Floaters {
  constructor(private font = FONT_UI, private outline: string | null = null) {}
  private fs: { x: number; y: number; text: string; color: string; life: number; size: number }[] = [];
  add(x: number, y: number, text: string, color: string, size = 18) { this.fs.push({ x, y, text, color, life: 0, size }); }
  step(dt: number) { for (const f of this.fs) { f.life += dt; f.y -= 40 * dt; } this.fs = this.fs.filter((f) => f.life < 0.7); }
  draw(g: CanvasRenderingContext2D) {
    g.textAlign = "center"; g.textBaseline = "middle";
    for (const f of this.fs) {
      const k = 1 - f.life / 0.7;
      g.globalAlpha = k;
      g.font = `700 ${f.size * (1 + (1 - k) * 0.15)}px ${this.font}`;
      if (this.outline) { g.lineWidth = 3; g.strokeStyle = this.outline; g.lineJoin = "round"; g.strokeText(f.text, f.x, f.y); }
      g.fillStyle = f.color;
      g.fillText(f.text, f.x, f.y);
    }
    g.globalAlpha = 1;
  }
}

export const FONT_UI = `"Bahnschrift", "DIN Alternate", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif`;
export const FONT_NUM = `ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace`;

/** Background music that stops while paused and picks up again after. Returns stop(). */
export function withMusic(kit: Kit, start: () => () => void): () => void {
  let stop = () => {};
  kit.onPause((p) => { stop(); stop = () => {}; if (!p) stop = start(); });
  return () => stop();
}
