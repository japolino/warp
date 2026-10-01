// The rhythm games' songs. The built-ins are pieces old enough to be free for anyone
// (Mozart, Beethoven, Grieg, Joplin, folk tunes), in our own arrangements: the melody
// is the chart, so every note hit plays the next note of the tune. Imported osu!
// beatmaps (yours, kept in your browser) bring their own audio and charts.
//
// Notation: "E5/1 D#5/.5 -/.5 C5+E5/2" — note (or chord with +) and its length in
// beats; a length carries over to the next note when left off; "-" is a rest; "|" is
// a bar line for readability and ignored.

export type Tier = "easy" | "normal" | "hard" | "brutal";
export const TIER_EASE: Record<Tier, number> = { easy: 0.06, normal: 0, hard: -0.06, brutal: -0.12 };
export const TIER_LABEL: Record<Tier, string> = { easy: "Easy", normal: "Normal", hard: "Hard", brutal: "Brutal" };

export interface Note { t: number; d: number; midi: number }
export interface TileNote { t: number; lane: number; d: number; midi: number | null }
export interface AimNote { t: number; x: number; y: number; midi: number | null; slider?: { pts: [number, number][]; d: number } }

export interface Song {
  id: string;
  title: string;
  by: string;
  tier: Tier;
  source: "builtin" | "import";
  /** Seconds. */
  length: number;
  /** Built-ins: the melody (played when hit) and the accompaniment (always plays). */
  melody?: Note[];
  backing?: { t: number; d: number; midi: number; voice: "bass" | "pad" | "piano" }[];
  /** Imports: decoded on demand. */
  audio?: () => Promise<ArrayBuffer | null>;
  /** Charts made (or read) for each game. */
  tiles?: TileNote[];
  aim?: AimNote[];
  /** Note density, for display. */
  nps?: number;
}

interface SongDef {
  id: string; title: string; by: string; tier: Tier;
  bpm: number;
  /** Speed up across the song (In the Hall of the Mountain King). */
  accel?: number;
  /** Key for the automatic accompaniment: tonic (MIDI) and mode. */
  key: [number, "major" | "minor"];
  /** Beats per chord in the automatic accompaniment. */
  harmony?: number;
  melody: string;
  bass?: string;
  /** Repeat the melody this many times. */
  repeat?: number;
}

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function noteMidi(n: string): number | null {
  const m = /^([A-Ga-g])(#|b)?(-?\d)$/.exec(n.trim());
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + NAMES[m[1].toUpperCase()] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}

/** Tokens → notes in beats. */
export function parseLine(src: string): { b: number; d: number; midi: number[] }[] {
  const out: { b: number; d: number; midi: number[] }[] = [];
  let beat = 0, last = 1;
  for (const tok of src.split(/\s+/)) {
    if (!tok || tok === "|") continue;
    const [pitch, dur] = tok.split("/");
    if (dur !== undefined) {
      const [a, b] = dur.split(":");
      last = b ? Number(a) / Number(b) : Number(dur);
      if (!Number.isFinite(last) || last <= 0) last = 1;
    }
    if (pitch !== "-") {
      const midi = pitch.split("+").map(noteMidi).filter((x): x is number => x !== null);
      if (midi.length) out.push({ b: beat, d: last, midi });
    }
    beat += last;
  }
  return out;
}

const SCALE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 11] };
/** Triads on each degree; minor uses a major V (harmonic minor), like the music does. */
function chordsOf(tonic: number, mode: "major" | "minor"): { root: number; tones: number[]; weight: number }[] {
  const sc = SCALE[mode];
  const pick = mode === "major" ? [0, 3, 4, 5, 1] : [0, 3, 4, 5, 2];
  const weight = [1.2, 1.05, 1.1, 0.95, 0.85];
  return pick.map((deg, i) => {
    const tones = [0, 2, 4].map((k) => (tonic + sc[(deg + k) % 7] + (deg + k >= 7 ? 12 : 0)) % 12);
    return { root: (tonic + sc[deg]) % 12, tones, weight: weight[i] };
  });
}

/** An accompaniment that fits the melody: for each stretch, the chord that holds the most of it. */
function autoBacking(mel: { b: number; d: number; midi: number[] }[], def: SongDef, beats: number) {
  const chords = chordsOf(def.key[0], def.key[1]);
  const span = def.harmony ?? 2;
  const out: { b: number; d: number; midi: number; voice: "bass" | "pad" | "piano" }[] = [];
  let prev = chords[0];
  for (let b = 0; b < beats - 0.01; b += span) {
    const inside = mel.filter((n) => n.b < b + span && n.b + n.d > b);
    let best = prev, bestScore = -1;
    for (const ch of chords) {
      let sc = 0;
      for (const n of inside) {
        const w = Math.min(n.b + n.d, b + span) - Math.max(n.b, b) + (Math.abs(n.b - b) < 0.01 ? 0.75 : 0);
        for (const m of n.midi) sc += ch.tones.includes(m % 12) ? w : -w * 0.6;
      }
      sc *= ch.weight;
      if (ch === prev) sc += 0.15;
      if (sc > bestScore) { bestScore = sc; best = ch; }
    }
    prev = best;
    const root = 36 + best.root + (best.root > 7 ? -12 : 0);
    out.push({ b, d: span * 0.48, midi: root, voice: "bass" });
    out.push({ b: b + span / 2, d: span * 0.45, midi: root + 7, voice: "bass" });
    for (const t of best.tones) out.push({ b, d: span * 0.95, midi: 60 + ((t - 60 % 12 + 12) % 12) - (t > 7 ? 12 : 0), voice: "pad" });
  }
  return out;
}

const DEFS: SongDef[] = [
  {
    id: "twinkle", title: "Twinkle, Twinkle, Little Star", by: "Traditional", tier: "easy", bpm: 96, key: [60, "major"],
    melody: "C5/1 C5 G5 G5 | A5 A5 G5/2 | F5/1 F5 E5 E5 | D5 D5 C5/2 | G5/1 G5 F5 F5 | E5 E5 D5/2 | G5/1 G5 F5 F5 | E5 E5 D5/2 | C5/1 C5 G5 G5 | A5 A5 G5/2 | F5/1 F5 E5 E5 | D5 D5 C5/2",
  },
  {
    id: "ode", title: "Ode to Joy", by: "Beethoven", tier: "easy", bpm: 112, key: [60, "major"],
    melody: "E5/1 E5 F5 G5 | G5 F5 E5 D5 | C5 C5 D5 E5 | E5/1.5 D5/.5 D5/2 | E5/1 E5 F5 G5 | G5 F5 E5 D5 | C5 C5 D5 E5 | D5/1.5 C5/.5 C5/2 | D5/1 D5 E5 C5 | D5 E5/.5 F5 E5/1 C5 | D5 E5/.5 F5 E5/1 D5 | C5 D5 G4/2 | E5/1 E5 F5 G5 | G5 F5 E5 D5 | C5 C5 D5 E5 | D5/1.5 C5/.5 C5/2",
  },
  {
    id: "canon", title: "Canon in D", by: "Pachelbel", tier: "easy", bpm: 72, key: [62, "major"],
    melody: "F#5/2 E5 D5 C#5 | B4 A4 B4 C#5 | D5 C#5 B4 A4 | G4 F#4 G4 E4 | D4/.5 F#4 A4 G4 F#4 D4 F#4 E4 | D4 B3 D4 A4 G4 B4 A4 G4 | F#4 D4 E4 C#5 D5 F#5 A5 A4 | B4 G4 A4 F#4 D4 D5 D5/1 | F#5/1 F#5 E5 D5 C#5 B4 A4 B4 C#5/1 | D5 C#5 B4 A4 G4 F#4 G4 E4/2",
    bass: "D3/2 A2 B2 F#2 | G2 D2 G2 A2 | D3/2 A2 B2 F#2 | G2 D2 G2 A2 | D3/2 A2 B2 F#2 | G2 D2 G2 A2 | D3/2 A2 B2 F#2 | G2 D2 G2 A2/2",
  },
  {
    id: "greensleeves", title: "Greensleeves", by: "Traditional", tier: "normal", bpm: 132, key: [57, "minor"], harmony: 3,
    melody: "A4/1 | C5/2 D5/1 | E5/1.5 F5/.5 E5/1 | D5/2 B4/1 | G4/1.5 A4/.5 B4/1 | C5/2 A4/1 | A4/1.5 G#4/.5 A4/1 | B4/2 G#4/1 | E4/2 A4/1 | C5/2 D5/1 | E5/1.5 F5/.5 E5/1 | D5/2 B4/1 | G4/1.5 A4/.5 B4/1 | C5/1.5 B4/.5 A4/1 | G#4/1.5 F#4/.5 G#4/1 | A4/3 | G5/3 | G5/1.5 F#5/.5 E5/1 | D5/2 B4/1 | G4/1.5 A4/.5 B4/1 | C5/2 A4/1 | A4/1.5 G#4/.5 A4/1 | B4/2 G#4/1 | E4/3 | G5/3 | G5/1.5 F#5/.5 E5/1 | D5/2 B4/1 | G4/1.5 A4/.5 B4/1 | C5/1.5 B4/.5 A4/1 | G#4/1.5 F#4/.5 G#4/1 | A4/3",
    bass: "-/1 A2/3 C3 G2 E2 A2 E2 E2 A2 A2 C3 G2 E2 A2 E2 A2 C3 C3 G2 E2 A2 E2 E2 A2 C3 C3 G2 E2 A2 E2 A2",
  },
  {
    id: "elise", title: "Für Elise", by: "Beethoven", tier: "normal", bpm: 84, key: [57, "minor"], harmony: 1.5,
    melody: "E5/.25 D#5 | E5 D#5 E5 B4 D5 C5 | A4/.75 C4/.25 E4 A4 | B4/.75 E4/.25 G#4 B4 | C5/.75 E4/.25 E5 D#5 | E5 D#5 E5 B4 D5 C5 | A4/.75 C4/.25 E4 A4 | B4/.75 E4/.25 C5 B4 | A4/.75 B4/.25 C5 D5 | E5/.75 G4/.25 F5 E5 | D5/.75 F4/.25 E5 D5 | C5/.75 E4/.25 D5 C5 | B4/.5 E4/.25 E5 E4 E5 | E6/.25 D#5 E5 D#5 E5 D#5 | E5 D#5 E5 B4 D5 C5 | A4/.75 C4/.25 E4 A4 | B4/.75 E4/.25 G#4 B4 | C5/.75 E4/.25 E5 D#5 | E5 D#5 E5 B4 D5 C5 | A4/.75 C4/.25 E4 A4 | B4/.75 E4/.25 C5 B4 | A4/1.5",
  },
  {
    id: "mountain_king", title: "In the Hall of the Mountain King", by: "Grieg", tier: "normal", bpm: 112, accel: 1.6, key: [59, "minor"],
    melody: "B3/.5 C#4 D4 E4 F#4 D4 F#4/1 | F4/.5 C#4 F4/1 E4/.5 C4 E4/1 | B3/.5 C#4 D4 E4 F#4 D4 F#4 B4 | A4 F#4 D4 F#4 A4/2 | B3/.5 C#4 D4 E4 F#4 D4 F#4/1 | F4/.5 C#4 F4/1 E4/.5 C4 E4/1 | B3/.5 C#4 D4 E4 F#4 D4 F#4 B4 | A4 F#4 D4 F#4 A4/2 | F#4/.5 G#4 A#4 B4 C#5 A#4 C#5/1 | D5/.5 A#4 D5/1 C#5/.5 A#4 C#5/1 | F#4/.5 G#4 A#4 B4 C#5 A#4 C#5/1 | D5/.5 A#4 D5/1 C#5/2 | B4/.5 C#5 D5 E5 F#5 D5 F#5/1 | F5/.5 C#5 F5/1 E5/.5 C5 E5/1 | B4/.5 C#5 D5 E5 F#5 D5 F#5 B5 | A5 F#5 D5 F#5 A5/2",
    bass: "B2/1 F#2 B2 F#2 | C#3 F2 C3 E2 | B2 F#2 B2 F#2 | F#2 A2 D3 F#2 | B2/1 F#2 B2 F#2 | C#3 F2 C3 E2 | B2 F#2 B2 F#2 | F#2 A2 D3 F#2 | F#2 C#3 F#2 C#3 | D3 A#2 C#3 F#2 | F#2 C#3 F#2 C#3 | D3 A#2 C#3/2 | B2/1 F#2 B2 F#2 | C#3 F2 C3 E2 | B2 F#2 B2 F#2 | F#2 A2 D3 F#2",
  },
  {
    id: "entertainer", title: "The Entertainer", by: "Scott Joplin", tier: "normal", bpm: 96, key: [60, "major"], harmony: 2,
    melody: "D5/.25 D#5 | E5 C6/.5 E5/.25 C6/.5 E5/.25 C6/1.25 | C6/.25 D6 D#6 E6 C6 D6 E6/.5 B5/.25 D6/.5 C6/1.5 | D5/.25 D#5 E5 C6/.5 E5/.25 C6/.5 E5/.25 C6/1.25 | A5/.25 G5 F#5 A5 C6 E6/.5 D6/.25 C6 A5 D6/1.5 | D5/.25 D#5 E5 C6/.5 E5/.25 C6/.5 E5/.25 C6/1.25 | C6/.25 D6 D#6 E6 C6 D6 E6/.5 B5/.25 D6/.5 C6/1 | C6/.25 D6 E6 C6 D6 E6/.5 C6/.25 D6 C6 E6 C6 D6 E6/.5 | C6/.25 D6 C6 E6 C6 D6 E6/.5 B5/.25 D6/.5 C6/1.5",
  },
  {
    id: "cancan", title: "Galop Infernal (Can-can)", by: "Offenbach", tier: "hard", bpm: 152, key: [60, "major"], harmony: 2, repeat: 2,
    melody: "C5/1 D5/.5 F5 E5 D5 G5/1 G5 G5/.5 A5 E5 F5 D5/1 D5 D5/.5 F5 E5 D5 C5 C6 B5 A5 G5 F5 E5 D5 | C5/1 D5/.5 F5 E5 D5 G5/1 G5 G5/.5 A5 E5 F5 D5/1 D5 D5/.5 F5 E5 D5 C5 G5 E5 D5 C5/1 -/1",
  },
  {
    id: "turca", title: "Rondo alla Turca", by: "Mozart", tier: "hard", bpm: 120, key: [57, "minor"], harmony: 1, repeat: 2,
    melody: "B4/.25 A4 G#4 A4 C5/1 D5/.25 C5 B4 C5 E5/1 F5/.25 E5 D#5 E5 B5 A5 G#5 A5 B5 A5 G#5 A5 C6/1 A5/.5 C6 | B5/.25 A5 G5 A5 B5 A5 G5 A5 B5 A5 G5 F#5 E5/1 | B4/.25 A4 G#4 A4 C5/1 D5/.25 C5 B4 C5 E5/1 F5/.25 E5 D#5 E5 B5 A5 G#5 A5 B5 A5 G#5 A5 C6/1 A5/.5 B5 | C6/.5 B5 A5 G#5 A5 E5 F5 D5 C5/1 B4/.5 A4/1.5",
  },
  {
    id: "william_tell", title: "William Tell Overture (Finale)", by: "Rossini", tier: "hard", bpm: 150, key: [57, "major"], harmony: 2, repeat: 2,
    melody: "E4/.25 E4 E4/.5 E4/.25 E4 E4/.5 E4/.25 E4 A4/.5 B4 C#5 | E4/.25 E4 E4/.5 E4/.25 E4 E4/.5 E4/.25 E4 A4/.5 C#5 B4 G#4 | E4/.25 E4 E4/.5 E4/.25 E4 E4/.5 E4/.25 E4 A4/.5 B4 C#5 | A4/.5 C#5 E5/1.5 D5/.5 C#5 B4 A4/1 -/1 | E4/.25 E4 E4/.5 E4/.25 E4 E4/.5 E4/.25 E4 A4/.5 B4 C#5 | E4/.25 E4 E4/.5 E4/.25 E4 E4/.5 E4/.25 E4 A4/.5 C#5 B4 G#4 | E4/.25 E4 E4/.5 E4/.25 E4 E4/.5 E4/.25 E4 A4/.5 B4 C#5 | A4/.5 C#5 E5/1 C#5/.5 A4/.5 E4 A4/2",
  },
  {
    id: "bumblebee", title: "Flight of the Bumblebee", by: "Rimsky-Korsakov", tier: "brutal", bpm: 140, key: [57, "minor"], harmony: 2, repeat: 2,
    melody: "E6/.25 D#6 D6 C#6 D6 C#6 C6 B5 | C6 B5 A#5 A5 G#5 G5 F#5 F5 | E5 D#5 D5 C#5 C5 F5 E5 D#5 | E5 D#5 D5 C#5 C5 F5 E5 D#5 | E5 F5 E5 D#5 E5 F#5 G5 G#5 | A5 A#5 A5 G#5 A5 A#5 B5 C6 | C#6 D6 C#6 C6 C#6 D6 D#6 E6 | F6 E6 D#6 D6 C#6 C6 B5 A#5 | A5 G#5 G5 F#5 F5 E5 D#5 D5 | C#5 D5 C#5 C5 B4 C5 C#5 D5 | E5 D#5 D5 C#5 D5 C#5 C5 B4 | C5 B4 A#4 A4 G#4 G4 F#4 F4 | E4 F4 F#4 G4 G#4 A4 A#4 B4 | C5 C#5 D5 D#5 E5 F5 F#5 G5 | G#5 A5 A#5 B5 C6 C#6 D6 D#6 | E6/1 -/1 A4/1 -/1",
    bass: "A2/2 A2 A2 A2 | A2 A2 A2 A2 | D3 D3 A2 A2 | E2 E2 A2/4",
  },
];

/** Korobeiniki, for Stack — a folk song far older than any game it ended up in. */
export const KOROBEINIKI = "E5/1 B4/.5 C5 D5/1 C5/.5 B4 A4/1 A4/.5 C5 E5/1 D5/.5 C5 B4/1.5 C5/.5 D5/1 E5 C5 A4 A4/2 | -/.5 D5/1 F5/.5 A5/1 G5/.5 F5 E5/1.5 C5/.5 E5/1 D5/.5 C5 B4/1 B4/.5 C5 D5/1 E5 C5 A4 A4/2";

function build(def: SongDef): Song {
  let mel = parseLine(def.melody);
  let beats = mel.reduce((m, n) => Math.max(m, n.b + n.d), 0);
  const rep = def.repeat ?? 1;
  if (rep > 1) {
    const one = mel, len = beats;
    mel = [];
    for (let i = 0; i < rep; i++) mel.push(...one.map((n) => ({ ...n, b: n.b + len * i })));
    beats = len * rep;
  }
  const back = def.bass
    ? parseLine(def.bass).flatMap((n) => n.midi.map((m) => ({ b: n.b, d: n.d * 0.9, midi: m, voice: "bass" as const })))
    : autoBacking(mel, def, beats);
  // Beats → seconds, with an optional speed-up across the song.
  const accel = def.accel ?? 1;
  const secAt = (b: number) => {
    if (accel === 1) return (b * 60) / def.bpm;
    // Tempo rises linearly from bpm to bpm·accel over the song: integrate 60/bpm(b).
    const k = (accel - 1) / beats;
    return (60 / (def.bpm * k)) * Math.log(1 + k * b);
  };
  const melody: Note[] = mel.map((n) => ({ t: secAt(n.b), d: secAt(n.b + n.d) - secAt(n.b), midi: Math.max(...n.midi) }));
  const backing = back.filter((n) => n.b < beats).map((n) => ({ t: secAt(n.b), d: Math.max(0.05, secAt(n.b + n.d) - secAt(n.b)), midi: n.midi, voice: n.voice }));
  const length = secAt(beats);
  return { id: def.id, title: def.title, by: def.by, tier: def.tier, source: "builtin", length, melody, backing, nps: melody.length / Math.max(1, length) };
}

let built: Song[] | null = null;
export function builtinSongs(): Song[] {
  if (!built) built = DEFS.map(build);
  return built;
}

/** A song for a check this hard: easy songs for easy checks, and so on. */
export function suggestSong(songs: Song[], level: number, seed: () => number): Song {
  const want: Tier = level < 0.3 ? "easy" : level < 0.6 ? "normal" : level < 0.85 ? "hard" : "brutal";
  const order: Tier[] = ["easy", "normal", "hard", "brutal"];
  for (let d = 0; d < 4; d++) {
    const pool = songs.filter((s) => Math.abs(order.indexOf(s.tier) - order.indexOf(want)) === d && s.source === "builtin");
    if (pool.length) return pool[Math.floor(seed() * pool.length)];
  }
  return songs[0];
}

// ───────────────────────── charts ─────────────────────────

/** Four lanes that follow the tune: higher notes to the right, repeated notes stay put. */
export function tileChart(notes: Note[]): TileNote[] {
  const out: TileNote[] = [];
  let lane = 1;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const win = notes.slice(Math.max(0, i - 6), i + 7).map((x) => x.midi);
    const lo = Math.min(...win), hi = Math.max(...win);
    let want = hi > lo ? Math.round(((n.midi - lo) / (hi - lo)) * 3) : lane;
    const prev = notes[i - 1];
    if (prev) {
      if (n.midi === prev.midi) want = lane;
      else if (want === lane) want = n.midi > prev.midi ? (lane < 3 ? lane + 1 : lane - 1) : lane > 0 ? lane - 1 : lane + 1;
    }
    lane = Math.max(0, Math.min(3, want));
    const hold = n.d >= 0.55 ? n.d * 0.85 : 0;
    out.push({ t: n.t, lane, d: hold, midi: n.midi });
  }
  return out;
}

/** Circles on a path that turns with the melody; long notes become sliders. */
export function aimChart(notes: Note[], seed: () => number): AimNote[] {
  const out: AimNote[] = [];
  let x = 0.5, y = 0.5, ang = seed() * Math.PI * 2;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i], prev = notes[i - 1];
    if (prev) {
      const gap = n.t - prev.t;
      ang += (n.midi - prev.midi) * 0.28 + (seed() - 0.5) * 0.6;
      const dist = Math.max(0.07, Math.min(0.34, gap * 0.55));
      x += Math.cos(ang) * dist; y += Math.sin(ang) * dist * 0.85;
      if (x < 0.1 || x > 0.9) { ang = Math.PI - ang; x = Math.max(0.1, Math.min(0.9, x)); }
      if (y < 0.12 || y > 0.88) { ang = -ang; y = Math.max(0.12, Math.min(0.88, y)); }
    }
    const note: AimNote = { t: n.t, x, y, midi: n.midi };
    const next = notes[i + 1];
    if (n.d >= 0.75 && (!next || next.t - n.t >= 0.75)) {
      // A slider bends along the way the path is heading.
      const len = Math.min(0.32, n.d * 0.35);
      const pts: [number, number][] = [[x, y]];
      let sx = x, sy = y, sa = ang;
      for (let k = 1; k <= 8; k++) {
        sa += (seed() - 0.5) * 0.35;
        sx += Math.cos(sa) * len / 8; sy += Math.sin(sa) * len / 8;
        if (sx < 0.08 || sx > 0.92) { sa = Math.PI - sa; sx = Math.max(0.08, Math.min(0.92, sx)); }
        if (sy < 0.1 || sy > 0.9) { sa = -sa; sy = Math.max(0.1, Math.min(0.9, sy)); }
        pts.push([sx, sy]);
      }
      note.slider = { pts, d: n.d * 0.85 };
      x = sx; y = sy; ang = sa;
    }
    out.push(note);
  }
  return out;
}

/** "1:23". */
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
