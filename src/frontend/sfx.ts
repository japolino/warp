// Sound effects, synthesized live with Web Audio — no files to ship or license.
// Short, soft, and only after the player has interacted with the page (browsers
// require it). Volume and scope come from Warp's settings.

type Sound =
  | "dice" | "success" | "crit" | "partial" | "fail" | "critFail"
  | "heart" | "like" | "meh" | "chill" | "stageUp" | "stageDown" | "dateStart"
  | "hit" | "critHit" | "hurt" | "ko" | "heal" | "flip" | "step" | "coin" | "loot" | "floor" | "level" | "battle" | "victory" | "defeat";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.4;
let unlocked = false;

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = volume * 0.6;
}

/** Browsers only allow sound after a gesture: arm on the first click or key. */
export function armAudio(): () => void {
  const unlock = () => {
    unlocked = true;
    try { audio()?.resume(); } catch { /* no audio */ }
  };
  window.addEventListener("pointerdown", unlock, { once: true, capture: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true });
  return () => {
    window.removeEventListener("pointerdown", unlock, { capture: true });
    window.removeEventListener("keydown", unlock, { capture: true });
  };
}

function audio(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const C = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = volume * 0.6;
    master.connect(ctx.destination);
  } catch { ctx = null; }
  return ctx;
}

/** A pitched note with a quick envelope. */
function tone(freq: number, at: number, dur: number, opts: { type?: OscillatorType; gain?: number; slide?: number; attack?: number } = {}) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(freq, t);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t + dur);
  const peak = opts.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** A burst of filtered noise: rattles, thuds, swishes. */
function noise(at: number, dur: number, opts: { freq?: number; q?: number; gain?: number; type?: BiquadFilterType } = {}) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + at;
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = opts.type ?? "bandpass";
  f.frequency.value = opts.freq ?? 2000;
  f.Q.value = opts.q ?? 1;
  const g = a.createGain();
  g.gain.value = opts.gain ?? 0.3;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

const chord = (notes: number[], at: number, step: number, dur: number, type: OscillatorType = "triangle", gain = 0.18) =>
  notes.forEach((n, i) => tone(n, at + i * step, dur, { type, gain }));

const SOUNDS: Record<Sound, () => void> = {
  // Dice: a few clacks on a table.
  dice: () => { for (let i = 0; i < 5; i++) noise(i * 0.055 + Math.random() * 0.02, 0.04, { freq: 2600 + Math.random() * 1500, q: 6, gain: 0.35 - i * 0.05 }); },
  success: () => chord([523, 659, 784], 0.32, 0.07, 0.35),
  crit: () => { chord([523, 659, 784, 1047], 0.32, 0.06, 0.5, "triangle", 0.2); tone(2093, 0.6, 0.6, { gain: 0.08 }); },
  partial: () => chord([523, 587], 0.32, 0.09, 0.3, "triangle", 0.15),
  fail: () => { tone(330, 0.32, 0.25, { type: "triangle", gain: 0.18, slide: 0.8 }); tone(262, 0.44, 0.35, { type: "triangle", gain: 0.16, slide: 0.75 }); },
  critFail: () => { tone(220, 0.32, 0.5, { type: "sawtooth", gain: 0.09, slide: 0.5 }); noise(0.32, 0.25, { freq: 300, gain: 0.25, type: "lowpass" }); },
  // Dates.
  heart: () => { tone(880, 0, 0.18, { gain: 0.15 }); tone(1175, 0.09, 0.3, { gain: 0.14 }); tone(1568, 0.18, 0.45, { gain: 0.1 }); },
  like: () => { tone(784, 0, 0.18, { gain: 0.12 }); tone(988, 0.08, 0.25, { gain: 0.1 }); },
  meh: () => tone(523, 0, 0.18, { type: "triangle", gain: 0.08 }),
  chill: () => { tone(392, 0, 0.3, { type: "triangle", gain: 0.12, slide: 0.85 }); noise(0, 0.35, { freq: 6000, q: 0.5, gain: 0.05, type: "highpass" }); },
  stageUp: () => chord([523, 659, 784, 1047, 1319], 0, 0.08, 0.6, "sine", 0.14),
  stageDown: () => chord([659, 523, 392], 0, 0.12, 0.45, "triangle", 0.12),
  dateStart: () => { tone(659, 0, 0.25, { gain: 0.1 }); tone(988, 0.12, 0.4, { gain: 0.09 }); },
  // The dungeon.
  hit: () => { noise(0, 0.08, { freq: 900, q: 1.2, gain: 0.4 }); tone(140, 0, 0.12, { type: "square", gain: 0.1, slide: 0.5 }); },
  critHit: () => { noise(0, 0.12, { freq: 1400, q: 0.8, gain: 0.5 }); tone(110, 0, 0.25, { type: "square", gain: 0.14, slide: 0.4 }); tone(1760, 0.02, 0.2, { gain: 0.08 }); },
  hurt: () => { noise(0, 0.1, { freq: 500, q: 1, gain: 0.35 }); tone(200, 0, 0.18, { type: "sawtooth", gain: 0.07, slide: 0.6 }); },
  ko: () => { tone(330, 0, 0.5, { type: "square", gain: 0.08, slide: 0.25 }); noise(0.05, 0.3, { freq: 250, gain: 0.25, type: "lowpass" }); },
  heal: () => chord([659, 880, 1175], 0, 0.06, 0.35, "sine", 0.1),
  flip: () => noise(0, 0.07, { freq: 3200, q: 2, gain: 0.18 }),
  step: () => noise(0, 0.05, { freq: 400, q: 1, gain: 0.2, type: "lowpass" }),
  coin: () => { tone(1319, 0, 0.08, { type: "square", gain: 0.06 }); tone(1760, 0.07, 0.25, { type: "square", gain: 0.06 }); },
  loot: () => chord([784, 988, 1175, 1568], 0, 0.05, 0.3, "triangle", 0.12),
  floor: () => { noise(0, 0.6, { freq: 200, q: 0.7, gain: 0.2, type: "lowpass" }); chord([196, 247, 294], 0.1, 0.12, 0.6, "triangle", 0.1); },
  level: () => chord([523, 659, 784, 1047, 784, 1047], 0, 0.07, 0.35, "square", 0.06),
  battle: () => { tone(110, 0, 0.4, { type: "sawtooth", gain: 0.08 }); tone(165, 0.12, 0.4, { type: "sawtooth", gain: 0.07 }); noise(0, 0.3, { freq: 150, gain: 0.25, type: "lowpass" }); },
  victory: () => chord([523, 659, 784, 1047], 0, 0.1, 0.5, "triangle", 0.15),
  defeat: () => chord([392, 330, 262, 196], 0, 0.16, 0.6, "triangle", 0.12),
};

export function play(s: Sound) {
  if (!unlocked || volume <= 0) return;
  const a = audio();
  if (!a) return;
  if (a.state === "suspended") void a.resume().catch(() => {});
  try { SOUNDS[s](); } catch { /* a missed sound is fine */ }
}

export type { Sound };
