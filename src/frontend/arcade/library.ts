// Your own songs: osu! beatmaps (.osz) imported into this browser. Standard maps
// become Aim charts, 4-key (or any-key) mania maps become Keys charts. The files stay
// on this device (IndexedDB) — nothing is uploaded or shared.

import type { AimNote, Song, TileNote, Tier } from "./songs.js";

interface StoredChart { version: string; kind: "aim" | "tiles"; aim?: AimNote[]; tiles?: TileNote[]; length: number; nps: number }
interface StoredSong { id: string; title: string; artist: string; audio: ArrayBuffer; charts: StoredChart[]; added: number }

// ───────────────────────── zip ─────────────────────────

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as unknown as { DecompressionStream?: new (f: string) => TransformStream<Uint8Array, Uint8Array> }).DecompressionStream;
  if (!DS) throw new Error("This browser can't unpack .osz files.");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DS("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The files in a zip, by name (names lower-cased). */
export async function unzip(buf: ArrayBuffer): Promise<Map<string, () => Promise<Uint8Array>>> {
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("That isn't a .osz (zip) file.");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, () => Promise<Uint8Array>>();
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    const lname = v.getUint16(local + 26, true), lextra = v.getUint16(local + 28, true);
    const start = local + 30 + lname + lextra;
    const raw = u8.subarray(start, start + size);
    out.set(name.toLowerCase(), async () => (method === 0 ? raw.slice() : method === 8 ? inflate(raw) : Promise.reject(new Error("Unsupported compression"))));
  }
  return out;
}

// ───────────────────────── .osu ─────────────────────────

export interface OsuMap {
  title: string; artist: string; version: string; audio: string; mode: number; keys: number;
  aim?: AimNote[]; tiles?: TileNote[]; length: number;
}

function sections(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let cur = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("//")) continue;
    const m = /^\[(.+)\]$/.exec(line);
    if (m) { cur = m[1]; out[cur] = []; continue; }
    (out[cur] ??= []).push(line);
  }
  return out;
}
const kv = (lines: string[] = []) => Object.fromEntries(lines.map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

/** Points along a slider's curve (Bézier pieces, lines, arcs treated as curves). */
function curve(kind: string, pts: [number, number][]): [number, number][] {
  if (kind === "L" || pts.length < 3) return pts;
  // Bézier segments split at repeated points.
  const segs: [number, number][][] = [[pts[0]]];
  for (let i = 1; i < pts.length; i++) {
    const last = segs[segs.length - 1];
    const prev = pts[i - 1];
    if (kind === "B" && pts[i][0] === prev[0] && pts[i][1] === prev[1]) segs.push([pts[i]]);
    else last.push(pts[i]);
  }
  const out: [number, number][] = [];
  for (const s of segs) {
    for (let k = 0; k <= 12; k++) {
      let q = s.map((x) => [...x] as [number, number]);
      const t = k / 12;
      while (q.length > 1) q = q.slice(1).map((b, j) => [q[j][0] + (b[0] - q[j][0]) * t, q[j][1] + (b[1] - q[j][1]) * t] as [number, number]);
      out.push(q[0]);
    }
  }
  return out;
}

/** Trim a polyline to a length (osu! sliders stop at their pixel length). */
function trim(pts: [number, number][], len: number): [number, number][] {
  const out: [number, number][] = [pts[0]];
  let left = len;
  for (let i = 1; i < pts.length && left > 0; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const d = Math.hypot(bx - ax, by - ay);
    if (d <= left) { out.push(pts[i]); left -= d; }
    else { const t = left / d; out.push([ax + (bx - ax) * t, ay + (by - ay) * t]); left = 0; }
  }
  return out;
}

export function parseOsu(text: string): OsuMap | null {
  const s = sections(text);
  const gen = kv(s.General), meta = kv(s.Metadata), diff = kv(s.Difficulty);
  const mode = Number(gen.Mode ?? 0);
  if (mode !== 0 && mode !== 3) return null;
  const keys = Math.max(1, Math.round(Number(diff.CircleSize ?? 4)));
  const svBase = Number(diff.SliderMultiplier ?? 1.4);
  // Timing: the beat length at each time, and the slider velocity multiplier.
  const timing = (s.TimingPoints ?? []).map((l) => l.split(",").map(Number)).filter((x) => x.length >= 2)
    .map(([t, bl, , , , , inh]) => ({ t, bl, uninherited: inh === undefined ? bl > 0 : inh === 1 }));
  const at = (t: number) => {
    let bl = 500, sv = 1;
    for (const p of timing) {
      if (p.t > t) break;
      if (p.uninherited) { bl = p.bl; sv = 1; } else if (p.bl < 0) sv = -100 / p.bl;
    }
    return { bl, sv };
  };
  const objs = (s.HitObjects ?? []).map((l) => l.split(","));
  const aim: AimNote[] = [];
  const tiles: TileNote[] = [];
  let end = 0;
  for (const o of objs) {
    const x = Number(o[0]), y = Number(o[1]), t = Number(o[2]) / 1000, type = Number(o[3]);
    if (!Number.isFinite(t)) continue;
    if (mode === 3) {
      const lane = Math.min(3, Math.floor((Math.floor((x * keys) / 512) * 4) / keys));
      const hold = type & 128 ? Math.max(0, Number((o[5] ?? "").split(":")[0]) / 1000 - t) : 0;
      tiles.push({ t, lane, d: hold, midi: null });
      end = Math.max(end, t + hold);
      continue;
    }
    if (type & 8) continue; // spinners
    const note: AimNote = { t, x: x / 512, y: y / 384, midi: null };
    if (type & 2 && o[5]) {
      const [kind, ...rest] = o[5].split("|");
      const pts: [number, number][] = [[x, y], ...rest.map((p) => p.split(":").map(Number) as [number, number])];
      const slides = Math.max(1, Number(o[6] ?? 1));
      const length = Number(o[7] ?? 0);
      const { bl, sv } = at(Number(o[2]));
      const one = length > 0 ? (length / (svBase * 100 * sv)) * bl / 1000 : 0.3;
      let path = length > 0 ? trim(curve(kind, pts), length) : curve(kind, pts);
      if (slides > 1) { const back = [...path].reverse(); const full = [...path]; for (let k = 1; k < slides; k++) full.push(...(k % 2 ? back : path)); path = full; }
      note.slider = { pts: path.map(([px, py]) => [px / 512, py / 384]), d: one * slides };
      end = Math.max(end, t + one * slides);
    }
    aim.push(note);
    end = Math.max(end, t);
  }
  const out: OsuMap = { title: meta.TitleUnicode || meta.Title || "Untitled", artist: meta.ArtistUnicode || meta.Artist || "", version: meta.Version || "", audio: gen.AudioFilename ?? "", mode, keys, length: end + 1 };
  if (mode === 3) out.tiles = tiles; else out.aim = aim;
  return out;
}

const tierOf = (nps: number, kind: "aim" | "tiles"): Tier => {
  const k = kind === "tiles" ? nps / 1.4 : nps;
  return k < 2 ? "easy" : k < 3.6 ? "normal" : k < 5.5 ? "hard" : "brutal";
};

// ───────────────────────── storage ─────────────────────────

const DB = "warp-arcade";
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore("songs", { keyPath: "id" }); };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => {
    const r = fn(d.transaction("songs", mode).objectStore("songs"));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

/** Import a .osz: every standard or mania difficulty in it becomes a song you can pick. */
export async function importOsz(file: File): Promise<{ title: string; charts: number }> {
  const files = await unzip(await file.arrayBuffer());
  const charts: StoredChart[] = [];
  let title = "", artist = "", audioName = "";
  for (const [name, read] of files) {
    if (!name.endsWith(".osu")) continue;
    const m = parseOsu(new TextDecoder().decode(await read()));
    if (!m) continue;
    title ||= m.title; artist ||= m.artist; audioName ||= m.audio.toLowerCase();
    const kind = m.tiles ? "tiles" : "aim";
    const n = (m.tiles ?? m.aim ?? []).length;
    if (n < 8) continue;
    charts.push({ version: m.version, kind, ...(m.aim ? { aim: m.aim } : {}), ...(m.tiles ? { tiles: m.tiles } : {}), length: m.length, nps: n / Math.max(1, m.length) });
  }
  if (!charts.length) throw new Error("No standard or mania difficulties in that file.");
  const audio = files.get(audioName);
  if (!audio) throw new Error("The song's audio file is missing from the .osz.");
  const bytes = await audio();
  const id = `osz:${title}:${artist}`.toLowerCase();
  const rec: StoredSong = { id, title, artist, audio: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, charts, added: Date.now() };
  await tx("readwrite", (s) => s.put(rec));
  return { title, charts: charts.length };
}

/** Imported songs for one game, each difficulty its own entry. */
export async function importedSongs(kind: "aim" | "tiles"): Promise<Song[]> {
  let all: StoredSong[] = [];
  try { all = await tx<StoredSong[]>("readonly", (s) => s.getAll() as IDBRequest<StoredSong[]>); } catch { return []; }
  const out: Song[] = [];
  for (const rec of all.sort((a, b) => b.added - a.added)) {
    for (const c of rec.charts.filter((x) => x.kind === kind)) {
      out.push({
        id: `${rec.id}:${c.version}`, title: `${rec.title}${c.version ? ` [${c.version}]` : ""}`, by: rec.artist,
        tier: tierOf(c.nps, kind), source: "import", length: c.length, nps: c.nps,
        ...(c.aim ? { aim: c.aim } : {}), ...(c.tiles ? { tiles: c.tiles } : {}),
        audio: async () => rec.audio,
      });
    }
  }
  return out;
}

export async function removeImported(songId: string): Promise<void> {
  const base = songId.split(":").slice(0, 3).join(":");
  try { await tx("readwrite", (s) => s.delete(base)); } catch { /* gone */ }
}
