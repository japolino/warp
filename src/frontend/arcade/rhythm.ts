// What the two rhythm games share: the song's clock (which survives pausing), the
// accompaniment scheduled just ahead of time, the melody played as notes are hit,
// timing windows scaled by difficulty and aids, and the score.

import type { Kit } from "./kit.js";
import { aimChart, tileChart, type AimNote, type Song, type TileNote } from "./songs.js";

export type Judge = "perfect" | "great" | "ok" | "miss";
export const JUDGE_WEIGHT: Record<Judge, number> = { perfect: 1, great: 0.7, ok: 0.4, miss: 0 };
export const JUDGE_LABEL: Record<Judge, string> = { perfect: "Perfect", great: "Great", ok: "OK", miss: "Miss" };
export const JUDGE_COLOR: Record<Judge, string> = { perfect: "#ffe066", great: "#4fe0a4", ok: "#6cc7ff", miss: "#ff5d6c" };

function offsetMs(): number {
  try { return Number(localStorage.getItem("warp:arcade:offset") ?? 0) || 0; } catch { return 0; }
}

export class SongClock {
  private origin = 0;
  private at = -1.6;
  private running = false;
  private scheduled = 0;
  private stopAudio: (() => void) | null = null;
  private buffer: AudioBuffer | null = null;
  readonly rate: number;
  readonly lead = 1.6;
  ready: Promise<void>;

  constructor(private kit: Kit, readonly song: Song) {
    // Slowing down only works on our own songs (an imported recording would drop in pitch).
    this.rate = song.source === "builtin" ? 1 - kit.aid("slow") / 100 : 1;
    this.ready = song.audio
      ? song.audio().then(async (buf) => { this.buffer = buf ? await kit.synth.decode(buf) : null; })
      : Promise.resolve();
    this.at = -this.lead;
  }

  /** Seconds into the song (negative during the lead-in), as heard. */
  time(): number {
    if (!this.running) return this.at;
    return (this.kit.synth.now() - this.origin) * this.rate - offsetMs() / 1000 - this.kit.synth.latency();
  }

  /** How long the song lasts, in song seconds. */
  get length() { return this.song.length; }

  start() {
    if (this.running) return;
    const now = this.kit.synth.now();
    this.origin = now - this.at / this.rate;
    this.running = true;
    this.scheduled = Math.max(0, this.at);
    if (this.buffer) {
      const startAt = this.at < 0 ? now - this.at / this.rate : now;
      const from = Math.max(0, this.at);
      this.stopAudio = this.kit.synth.playBuffer(this.buffer, startAt, this.rate, from);
    }
  }

  pause() {
    if (!this.running) return;
    this.at = this.time() + offsetMs() / 1000 + this.kit.synth.latency();
    this.running = false;
    this.stopAudio?.(); this.stopAudio = null;
    this.kit.synth.hush();
  }

  stop() { this.pause(); }

  /** Keep the accompaniment a little ahead of the clock. */
  tick() {
    if (!this.running || !this.song.backing) return;
    const now = this.time();
    const until = now + 0.5;
    const toAudio = (t: number) => this.origin + t / this.rate;
    for (const n of this.song.backing) {
      if (n.t < this.scheduled || n.t >= until) continue;
      this.kit.synth.note(n.midi, toAudio(n.t), n.d / this.rate, n.voice, n.voice === "pad" ? 0.22 : n.voice === "bass" ? 0.5 : 0.35);
    }
    this.scheduled = until;
  }

  /** The tune itself, when a note is hit (our songs only). */
  melody(midi: number | null, dur = 0.3, vel = 0.75) {
    if (midi === null || this.song.source !== "builtin") return;
    this.kit.synth.note(midi, this.kit.synth.now(), Math.max(0.12, dur / this.rate), "piano", vel);
  }
}

/** Timing windows in seconds: tighter as checks get harder, wider with aids. */
export function windows(kit: Kit): Record<Exclude<Judge, "miss">, number> {
  const k = (1.3 - 0.55 * kit.play.level) * (1 + kit.aid("window") / 100);
  return { perfect: 0.042 * k, great: 0.085 * k, ok: 0.13 * k };
}

export function judgeOf(dt: number, w: ReturnType<typeof windows>): Judge | null {
  const a = Math.abs(dt);
  if (a <= w.perfect) return "perfect";
  if (a <= w.great) return "great";
  if (a <= w.ok) return "ok";
  return null;
}

/** Running score: accuracy over the whole chart (unplayed notes count as nothing yet) plus a little for combo. */
export class Tally {
  hits = 0;
  sum = 0;
  combo = 0;
  maxCombo = 0;
  misses = 0;
  streak = 0;
  counts: Record<Judge, number> = { perfect: 0, great: 0, ok: 0, miss: 0 };
  private window: number[] = [];
  constructor(readonly total: number) {}
  add(j: Judge, weight = 1) {
    this.hits += weight;
    this.sum += JUDGE_WEIGHT[j] * weight;
    this.counts[j]++;
    if (j === "miss") { this.combo = 0; this.misses++; this.streak++; } else { this.combo++; this.streak = 0; this.maxCombo = Math.max(this.maxCombo, this.combo); }
    this.window.push(JUDGE_WEIGHT[j]);
    if (this.window.length > 10) this.window.shift();
  }
  /** Recent form (0–1), for the story's shape of the run. */
  form(): number { return this.window.length ? this.window.reduce((a, b) => a + b, 0) / this.window.length : 1; }
  score(): number { return this.total ? (this.sum / this.total) * 0.9 + (this.maxCombo / this.total) * 0.1 : 0; }
  accuracy(): number { return this.hits ? this.sum / this.hits : 1; }
}

/** How many misses in a row end the song (a life buys another go). */
export const missLimit = (level: number) => Math.round(14 - level * 8);

/** The chart for this game, made once per song. */
export function aimNotes(song: Song, rng: () => number): AimNote[] { return (song.aim ??= aimChart(song.melody ?? [], rng)); }
export function tileNotes(song: Song): TileNote[] { return (song.tiles ??= tileChart(song.melody ?? [])); }

/** Plain words for how a rhythm run went. */
export function rhythmBeats(t: Tally): string[] {
  const out: string[] = [];
  if (t.counts.miss === 0) out.push("never missed a beat");
  else if (t.maxCombo >= t.total * 0.6) out.push("one long unbroken run");
  if (t.counts.perfect >= t.total * 0.7) out.push("precise, almost mechanical");
  return out;
}
