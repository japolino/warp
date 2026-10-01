// The arcade's sound: a small synthesizer for the songs (piano, bells, bass, a lead),
// a drum kit, background loops for the non-rhythm games, and their sound effects.
// Everything is generated live — nothing to ship or license.

export type Voice = "piano" | "bell" | "bass" | "lead" | "pluck" | "pad" | "organ";
export type Drum = "kick" | "snare" | "hat" | "clap";
export type Fx =
  | "tick" | "hit" | "perfect" | "miss" | "combo" | "click" | "flag" | "boom" | "reveal" | "win" | "lose" | "life"
  | "line" | "tetris" | "drop" | "rotate" | "eat" | "crash" | "step" | "stumble" | "whistle" | "cheer"
  | "flipper" | "bumper" | "launch" | "drain" | "target" | "card" | "chip" | "shuffle" | "spin" | "ball" | "reel" | "stop" | "coins" | "jackpot" | "countdown" | "go";

const A4 = 440;
export const midiHz = (m: number) => A4 * Math.pow(2, (m - 69) / 12);

export class Synth {
  readonly ctx: AudioContext | null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private fxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private stops: (() => void)[] = [];
  private _muted = false;

  constructor(volume: number, muted: boolean) {
    let c: AudioContext | null = null;
    try {
      const C = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      c = C ? new C({ latencyHint: "interactive" }) : null;
    } catch { c = null; }
    this.ctx = c;
    if (!c) return;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.55; this.musicBus.connect(this.master);
    this.fxBus = c.createGain(); this.fxBus.gain.value = 0.6; this.fxBus.connect(this.master);
    this._muted = muted;
    this.setVolume(volume);
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private vol = 0.5;
  setVolume(v: number) { this.vol = Math.max(0, Math.min(1, v)); if (this.master) this.master.gain.value = this._muted ? 0 : this.vol; }
  get muted() { return this._muted; }
  set muted(m: boolean) { this._muted = m; this.setVolume(this.vol); }

  resume() { try { void this.ctx?.resume(); } catch { /* ignore */ } }
  /** The audio clock, in seconds. */
  now(): number { return this.ctx?.currentTime ?? performance.now() / 1000; }
  /** Output latency, so judgement can line up with what's heard. */
  latency(): number { const c = this.ctx as (AudioContext & { outputLatency?: number }) | null; return (c?.outputLatency ?? 0) + (c?.baseLatency ?? 0); }

  // ───────── voices ─────────

  note(midi: number, at: number, dur: number, voice: Voice = "piano", vel = 0.7, bus: "music" | "fx" = "music") {
    const c = this.ctx;
    const out = bus === "music" ? this.musicBus : this.fxBus;
    if (!c || !out) return;
    const t = Math.max(c.currentTime, at);
    const f = midiHz(midi);
    const g = c.createGain();
    const filt = c.createBiquadFilter();
    filt.type = "lowpass";
    g.connect(filt).connect(out);
    const oscs: OscillatorNode[] = [];
    const osc = (type: OscillatorType, mult: number, gain: number, detune = 0) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f * mult; o.detune.value = detune;
      const og = c.createGain(); og.gain.value = gain; o.connect(og).connect(g); oscs.push(o);
    };
    let attack = 0.005, decay = 0.6, sustain = 0, release = 0.12, peak = vel * 0.32;
    switch (voice) {
      case "piano":
        osc("triangle", 1, 0.9); osc("sine", 2, 0.25); osc("sine", 3, 0.07);
        filt.frequency.setValueAtTime(Math.min(9000, f * 9), t); filt.frequency.exponentialRampToValueAtTime(Math.max(300, f * 2), t + 0.8);
        decay = Math.max(0.35, 1.6 - (midi - 48) * 0.02); sustain = 0.08; release = 0.18; break;
      case "bell":
        osc("sine", 1, 0.8); osc("sine", 2.76, 0.3); osc("sine", 5.4, 0.12);
        filt.frequency.value = 9000; decay = 1.1; release = 0.4; peak *= 0.8; break;
      case "bass":
        osc("triangle", 1, 1); osc("sine", 0.5, 0.4);
        filt.frequency.value = 900; attack = 0.008; decay = 0.4; sustain = 0.45; release = 0.08; peak *= 1.2; break;
      case "lead":
        osc("square", 1, 0.35); osc("sawtooth", 1, 0.25, 7);
        filt.frequency.value = Math.min(6000, f * 6); attack = 0.01; decay = 0.15; sustain = 0.55; release = 0.08; peak *= 0.6; break;
      case "pluck":
        osc("sawtooth", 1, 0.5); osc("square", 2, 0.12);
        filt.frequency.setValueAtTime(f * 12, t); filt.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.2);
        decay = 0.25; release = 0.05; peak *= 0.7; break;
      case "pad":
        osc("sawtooth", 1, 0.25, -8); osc("sawtooth", 1, 0.25, 8); osc("triangle", 0.5, 0.3);
        filt.frequency.value = 1400; attack = 0.25; decay = 0.5; sustain = 0.7; release = 0.5; peak *= 0.35; break;
      case "organ":
        osc("sine", 1, 0.6); osc("sine", 2, 0.35); osc("sine", 4, 0.15); osc("sine", 0.5, 0.25);
        filt.frequency.value = 5000; attack = 0.015; decay = 0.2; sustain = 0.8; release = 0.1; peak *= 0.55; break;
    }
    const end = t + Math.max(dur, attack + 0.02);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * sustain + 0.0002), t + attack + decay);
    g.gain.setValueAtTime(Math.max(0.0002, peak * sustain + 0.0002), end);
    g.gain.exponentialRampToValueAtTime(0.0001, end + release);
    for (const o of oscs) { o.start(t); o.stop(end + release + 0.05); }
  }

  drum(kind: Drum, at: number, vel = 0.7, bus: "music" | "fx" = "music") {
    const c = this.ctx;
    const out = bus === "music" ? this.musicBus : this.fxBus;
    if (!c || !out || !this.noise) return;
    const t = Math.max(c.currentTime, at);
    if (kind === "kick") {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(vel * 0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.25);
      return;
    }
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(), g = c.createGain();
    const len = kind === "hat" ? 0.05 : kind === "clap" ? 0.14 : 0.16;
    f.type = kind === "hat" ? "highpass" : "bandpass";
    f.frequency.value = kind === "hat" ? 7000 : kind === "clap" ? 1500 : 1800;
    g.gain.setValueAtTime(vel * (kind === "hat" ? 0.25 : 0.5), t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5); src.stop(t + len + 0.02);
    if (kind === "snare") {
      const o = c.createOscillator(), og = c.createGain();
      o.frequency.value = 190; og.gain.setValueAtTime(vel * 0.3, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(og).connect(out); o.start(t); o.stop(t + 0.12);
    }
  }

  /** A falling or rising blip. */
  private blip(f1: number, f2: number, dur: number, type: OscillatorType = "square", vel = 0.4, at = 0) {
    const c = this.ctx;
    if (!c || !this.fxBus) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(vel * 0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.fxBus); o.start(t); o.stop(t + dur + 0.02);
  }
  private hiss(dur: number, freq: number, vel = 0.4, at = 0, type: BiquadFilterType = "bandpass") {
    const c = this.ctx;
    if (!c || !this.fxBus || !this.noise) return;
    const t = c.currentTime + at;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(), g = c.createGain();
    f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vel * 0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.fxBus); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  fx(name: Fx, pitch = 0) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const n = (m: number, at: number, d: number, v: Voice = "bell", vel = 0.6) => this.note(m + pitch, t + at, d, v, vel, "fx");
    switch (name) {
      case "tick": this.blip(1800, 1400, 0.03, "square", 0.25); break;
      case "click": this.blip(900, 600, 0.04, "triangle", 0.4); break;
      case "hit": this.hiss(0.05, 6000, 0.35, 0, "highpass"); this.blip(1200, 900, 0.05, "triangle", 0.3); break;
      case "perfect": this.hiss(0.05, 8000, 0.4, 0, "highpass"); n(96, 0, 0.12, "bell", 0.3); break;
      case "miss": this.blip(220, 110, 0.18, "sawtooth", 0.35); break;
      case "combo": n(84, 0, 0.1); n(88, 0.06, 0.1); n(91, 0.12, 0.18); break;
      case "flag": this.blip(700, 1100, 0.07, "triangle", 0.4); break;
      case "reveal": this.blip(500 + pitch * 30, 700 + pitch * 30, 0.04, "triangle", 0.25); break;
      case "boom": this.hiss(0.6, 300, 1, 0, "lowpass"); this.blip(120, 30, 0.5, "sawtooth", 0.8); break;
      case "win": n(72, 0, 0.15, "bell"); n(76, 0.1, 0.15, "bell"); n(79, 0.2, 0.15, "bell"); n(84, 0.3, 0.5, "bell", 0.8); break;
      case "lose": n(67, 0, 0.25, "piano"); n(63, 0.22, 0.25, "piano"); n(60, 0.44, 0.6, "piano"); break;
      case "life": n(79, 0, 0.1, "bell"); n(86, 0.08, 0.3, "bell"); break;
      case "line": n(76, 0, 0.08, "pluck"); n(83, 0.05, 0.12, "pluck"); break;
      case "tetris": n(72, 0, 0.1, "pluck"); n(76, 0.06, 0.1, "pluck"); n(79, 0.12, 0.1, "pluck"); n(84, 0.18, 0.3, "bell"); break;
      case "drop": this.blip(300, 120, 0.08, "triangle", 0.5); break;
      case "rotate": this.blip(900, 1000, 0.03, "square", 0.15); break;
      case "eat": this.blip(600, 1200, 0.08, "square", 0.3); break;
      case "crash": this.hiss(0.3, 600, 0.8); this.blip(200, 50, 0.3, "sawtooth", 0.6); break;
      case "step": this.hiss(0.04, 900, 0.3, 0, "lowpass"); break;
      case "stumble": this.hiss(0.18, 400, 0.6, 0, "lowpass"); this.blip(300, 120, 0.15, "triangle", 0.4); break;
      case "whistle": this.blip(2400, 2600, 0.35, "sine", 0.5); this.blip(2400, 2500, 0.2, "sine", 0.4, 0.4); break;
      case "cheer": this.hiss(1.2, 1500, 0.5); this.hiss(1.0, 3000, 0.3, 0.1); break;
      case "flipper": this.blip(180, 90, 0.06, "square", 0.35); this.hiss(0.04, 2000, 0.25); break;
      case "bumper": this.blip(1300 + pitch * 50, 500, 0.1, "square", 0.45); break;
      case "launch": this.hiss(0.3, 1200, 0.5); this.blip(200, 900, 0.25, "sawtooth", 0.4); break;
      case "drain": this.blip(500, 60, 0.6, "sawtooth", 0.5); break;
      case "target": n(88, 0, 0.12, "bell", 0.5); break;
      case "card": this.hiss(0.06, 3500, 0.5); break;
      case "shuffle": for (let i = 0; i < 8; i++) this.hiss(0.03, 3000, 0.3, i * 0.035); break;
      case "chip": this.blip(2600, 2200, 0.03, "triangle", 0.35); this.blip(3100, 2900, 0.03, "triangle", 0.25, 0.035); break;
      case "spin": this.hiss(1.4, 700, 0.25); break;
      case "ball": this.blip(2200 + Math.random() * 400, 1800, 0.02, "triangle", 0.25); break;
      case "reel": this.blip(800, 760, 0.02, "square", 0.12); break;
      case "stop": this.blip(400, 200, 0.07, "square", 0.45); this.hiss(0.05, 1500, 0.3); break;
      case "coins": for (let i = 0; i < 6; i++) this.blip(2400 + i * 120, 2000, 0.05, "triangle", 0.3, i * 0.06); break;
      case "jackpot": for (let i = 0; i < 12; i++) n(72 + [0, 4, 7, 12][i % 4] + Math.floor(i / 4) * 12 - 12, i * 0.07, 0.1, "bell", 0.5); break;
      case "countdown": n(81, 0, 0.12, "bell", 0.5); break;
      case "go": n(93, 0, 0.3, "bell", 0.7); n(88, 0, 0.3, "bell", 0.5); break;
    }
  }

  // ───────── sequences ─────────

  /** Play notes at absolute audio times. */
  schedule(notes: { at: number; midi: number; dur: number; voice: Voice; vel?: number }[]) {
    for (const n of notes) this.note(n.midi, n.at, n.dur, n.voice, n.vel ?? 0.6);
  }

  /**
   * A background loop: the pattern is asked for each bar a little ahead of time, so
   * it can change (speed up, add a layer) while it plays. Returns stop().
   */
  loop(bpm: () => number, bar: (i: number, at: number, beat: number) => void, beatsPerBar = 4): () => void {
    const c = this.ctx;
    if (!c) return () => {};
    let next = c.currentTime + 0.1, i = 0, alive = true;
    const tick = () => {
      if (!alive) return;
      while (next < c.currentTime + 0.35) {
        const beat = 60 / bpm();
        bar(i++, next, beat);
        next += beat * beatsPerBar;
      }
    };
    const id = window.setInterval(tick, 60);
    tick();
    const stop = () => { alive = false; window.clearInterval(id); };
    this.stops.push(stop);
    return stop;
  }

  /** Fade the music out and stop every loop. */
  hush() {
    for (const s of this.stops) s();
    this.stops = [];
    const c = this.ctx;
    if (c && this.musicBus) {
      const g = this.musicBus.gain;
      g.cancelScheduledValues(c.currentTime);
      g.setValueAtTime(g.value, c.currentTime);
      g.linearRampToValueAtTime(0, c.currentTime + 0.25);
      // A fresh bus for whatever plays next: the old one drains its scheduled notes into silence.
      const fresh = c.createGain(); fresh.gain.value = 0.55; fresh.connect(this.master!);
      this.musicBus = fresh;
    }
  }

  close() { this.hush(); try { void this.ctx?.close(); } catch { /* ignore */ } }

  /** Decode an imported song's audio. */
  async decode(data: ArrayBuffer): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    try { return await this.ctx.decodeAudioData(data.slice(0)); } catch { return null; }
  }

  /** Play decoded audio from `at`; returns stop(). */
  playBuffer(buf: AudioBuffer, at: number, rate = 1, offset = 0): () => void {
    const c = this.ctx;
    if (!c || !this.musicBus) return () => {};
    const src = c.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate;
    const g = c.createGain(); g.gain.value = 1.4;
    src.connect(g).connect(this.musicBus);
    src.start(at, offset);
    const stop = () => { try { src.stop(); } catch { /* ignore */ } };
    this.stops.push(stop);
    return stop;
  }
}

// ───────────────────────── background loops ─────────────────────────

/** Chords as semitones over a root, and a few progressions. */
const PROG: Record<string, { root: number; chords: number[][] }> = {
  // C – Am – F – G, bright
  bright: { root: 60, chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]] },
  // Am – F – C – G, driving
  drive: { root: 57, chords: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]] },
  // Dm – Dm – Bb – A, tense
  tense: { root: 62, chords: [[0, 3, 7], [0, 3, 7], [-4, 0, 3], [-5, -1, 2]] },
  // Cmaj7 – Am7 – Dm7 – G7, lounge
  lounge: { root: 60, chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [2, 5, 9, 12], [-5, -1, 2, 5]] },
};

/** A looping backing track in a mood; `speed()` can rise as the game heats up. */
export function backing(s: Synth, mood: "bright" | "drive" | "tense" | "lounge" | "retro", speed: () => number = () => 1): () => void {
  const p = PROG[mood === "retro" ? "drive" : mood];
  const base = mood === "lounge" ? 96 : mood === "tense" ? 92 : mood === "retro" ? 136 : mood === "drive" ? 128 : 120;
  return s.loop(() => base * speed(), (i, at, beat) => {
    const ch = p.chords[i % p.chords.length];
    const root = p.root + ch[0] - 24;
    if (mood === "lounge") {
      // Walking bass and soft chords on 2 and 4.
      const walk = [0, 4, 7, 9].map((x) => root + x);
      walk.forEach((m, k) => s.note(m, at + k * beat, beat * 0.9, "bass", 0.55));
      for (const k of [1, 3]) for (const x of ch) s.note(p.root + x, at + k * beat, beat * 0.6, "piano", 0.25);
      for (let k = 0; k < 4; k++) s.drum("hat", at + k * beat + beat * 0.66, 0.25);
      return;
    }
    if (mood === "tense") {
      s.note(root, at, beat * 4, "pad", 0.5);
      for (let k = 0; k < 8; k++) s.note(p.root + ch[k % ch.length] + (k % 4 === 3 ? 12 : 0), at + k * beat / 2, beat / 2, "pluck", 0.25);
      s.drum("kick", at, 0.5); s.drum("kick", at + beat * 2.5, 0.35);
      return;
    }
    // bright / drive / retro: arpeggios, bass on the beat, a simple kit.
    const arp = [0, 1, 2, 1, 0, 1, 2, 1].map((k) => p.root + ch[k % ch.length] + (mood === "retro" ? 12 : 0));
    arp.forEach((m, k) => s.note(m, at + k * beat / 2, beat / 2 * 0.9, mood === "retro" ? "lead" : "pluck", 0.22));
    for (let k = 0; k < 4; k++) s.note(root + (k % 2 ? 7 : 0), at + k * beat, beat * 0.8, "bass", 0.5);
    for (let k = 0; k < 4; k++) {
      s.drum(k % 2 ? "snare" : "kick", at + k * beat, 0.45);
      s.drum("hat", at + k * beat + beat / 2, 0.3);
    }
  });
}
