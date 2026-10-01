// The arcade's arithmetic: songs and the charts made from them, card values and the
// whispered advice, what roulette bets and slot lines pay, and reading osu! files.

import { describe, expect, test } from "bun:test";
import { aimChart, builtinSongs, noteMidi, parseLine, suggestSong, tileChart, KOROBEINIKI } from "./songs.js";
import { advice, handValue } from "./games/blackjack.js";
import { betWins } from "./games/roulette.js";
import { linePays } from "./games/slots.js";
import { parseOsu, unzip } from "./library.js";
import { arcBeats, seeded } from "./kit.js";

describe("songs", () => {
  test("notes, lengths and chords read as written", () => {
    expect(noteMidi("A4")).toBe(69);
    expect(noteMidi("C#5")).toBe(73);
    expect(noteMidi("Bb3")).toBe(58);
    const l = parseLine("E5/1 D#5/.5 -/.5 C5+E5/2 G4");
    expect(l.map((n) => [n.b, n.d, n.midi])).toEqual([[0, 1, [76]], [1, 0.5, [75]], [2, 2, [72, 76]], [4, 2, [67]]]);
    expect(parseLine(KOROBEINIKI).reduce((m, n) => Math.max(m, n.b + n.d), 0)).toBe(32);
  });

  test("every built-in song builds, with a backing and a sensible length, from easy to brutal", () => {
    const songs = builtinSongs();
    expect(songs.length).toBe(11);
    expect(new Set(songs.map((s) => s.tier))).toEqual(new Set(["easy", "normal", "hard", "brutal"]));
    for (const s of songs) {
      expect(s.melody!.length).toBeGreaterThan(20);
      expect(s.backing!.length).toBeGreaterThan(4);
      expect(s.length).toBeGreaterThan(15);
      expect(s.length).toBeLessThan(90);
      for (let i = 1; i < s.melody!.length; i++) expect(s.melody![i].t).toBeGreaterThanOrEqual(s.melody![i - 1].t);
    }
    // The Mountain King speeds up: later beats are shorter.
    const mk = songs.find((s) => s.id === "mountain_king")!;
    const m = mk.melody!;
    expect(m[m.length - 2].t - m[m.length - 3].t).toBeLessThan(m[1].t - m[0].t);
  });

  test("a song is suggested to fit the check", () => {
    const songs = builtinSongs();
    expect(suggestSong(songs, 0.1, seeded("a")).tier).toBe("easy");
    expect(suggestSong(songs, 0.95, seeded("a")).tier).toBe("brutal");
  });

  test("charts stay on the board: four lanes, a field from 0 to 1, sliders only on long notes", () => {
    for (const s of builtinSongs()) {
      const tiles = tileChart(s.melody!);
      expect(tiles.length).toBe(s.melody!.length);
      expect(tiles.every((n) => n.lane >= 0 && n.lane <= 3)).toBe(true);
      const aim = aimChart(s.melody!, seeded(s.id));
      expect(aim.every((n) => n.x > 0 && n.x < 1 && n.y > 0 && n.y < 1)).toBe(true);
      expect(aim.filter((n) => n.slider).every((n) => n.slider!.pts.every(([x, y]) => x > 0 && x < 1 && y > 0 && y < 1))).toBe(true);
      expect(aim.every((n, i) => !n.slider || s.melody![i].d >= 0.75)).toBe(true);
    }
  });
});

describe("cards, wheels and reels", () => {
  const c = (r: number) => ({ r, s: 0 });
  test("hands count aces both ways", () => {
    expect(handValue([c(0), c(12)])).toEqual({ total: 21, soft: true });
    expect(handValue([c(0), c(0), c(8)])).toEqual({ total: 21, soft: true });
    expect(handValue([c(9), c(5), c(8)]).total).toBe(25);
    expect(handValue([c(0), c(5), c(9)])).toEqual({ total: 17, soft: false });
  });
  test("the whisper is basic strategy", () => {
    expect(advice([c(9), c(0)], c(5), true)).toBe("stand");
    expect(advice([c(4), c(5)], c(5), true)).toBe("double");
    expect(advice([c(9), c(5)], c(9), false)).toBe("hit");
    expect(advice([c(9), c(5)], c(4), false)).toBe("stand");
  });
  test("roulette pays the felt's odds, and zero beats the outside bets", () => {
    expect(betWins("n:17", 17)).toBe(35);
    expect(betWins("red", 1)).toBe(1);
    expect(betWins("black", 1)).toBe(-1);
    expect(betWins("d2", 13)).toBe(2);
    expect(betWins("c3", 36)).toBe(2);
    expect(betWins("even", 0)).toBe(-1);
    expect(betWins("n:0", 0)).toBe(35);
  });
  test("slot lines", () => {
    expect(linePays(["seven", "seven", "seven"])).toBe(50);
    expect(linePays(["cherry", "lemon", "cherry"])).toBe(2);
    expect(linePays(["bell", "cherry", "star"])).toBe(1);
    expect(linePays(["bell", "lemon", "star"])).toBe(0);
  });
  test("the shape of a run, in words", () => {
    expect(arcBeats([0.2, 0.3, 0.3, 0.6, 0.8, 0.9, 0.9, 0.95, 0.9], 0.8)).toContain("a shaky start");
    expect(arcBeats([0.9, 0.9, 0.9, 0.7, 0.5, 0.3, 0.2, 0.2, 0.1], 0.4)).toContain("fell apart at the end");
    expect(arcBeats([1, 1, 1], 0.99)).toEqual(["flawless from start to finish"]);
  });
});

describe("osu! beatmaps", () => {
  const STD = `osu file format v14
[General]
AudioFilename: audio.mp3
Mode: 0
[Metadata]
Title:Test Song
Artist:Someone
Version:Normal
[Difficulty]
CircleSize:4
SliderMultiplier:1.4
[TimingPoints]
0,500,4,2,0,60,1,0
[HitObjects]
256,192,1000,1,0,0:0:0:0:
100,100,1500,2,0,B|200:100|300:150,1,140,0|0,0:0|0:0,0:0:0:0:
256,192,3000,12,0,4000,0:0:0:0:
`;
  const MANIA = `osu file format v14
[General]
AudioFilename: song.ogg
Mode: 3
[Metadata]
Title:Keys
Version:4K Hard
[Difficulty]
CircleSize:4
[HitObjects]
64,192,500,1,0,0:0:0:0:
192,192,750,128,0,1250:0:0:0:0:
448,192,1000,1,0,0:0:0:0:
`;
  test("standard maps become circles and sliders on a 0–1 field; spinners are skipped", () => {
    const m = parseOsu(STD)!;
    expect(m.title).toBe("Test Song");
    expect(m.aim!.length).toBe(2);
    expect(m.aim![0]).toMatchObject({ t: 1, x: 0.5, y: 0.5 });
    const sl = m.aim![1].slider!;
    // 140 px at 1.4×100 px per beat of 500 ms → one beat.
    expect(sl.d).toBeCloseTo(0.5, 3);
    expect(sl.pts.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1)).toBe(true);
  });
  test("mania maps become lanes and holds", () => {
    const m = parseOsu(MANIA)!;
    expect(m.tiles!.map((n) => [n.t, n.lane, n.d])).toEqual([[0.5, 0, 0], [0.75, 1, 0.5], [1, 3, 0]]);
  });
  test("a .osz is a zip, read in the browser", async () => {
    const enc = new TextEncoder();
    const files: [string, Uint8Array, number][] = [["map.osu", enc.encode(MANIA), 8], ["song.ogg", new Uint8Array([1, 2, 3, 4]), 0]];
    const chunks: Uint8Array[] = [], central: Uint8Array[] = [];
    let offset = 0;
    for (const [name, data, method] of files) {
      const body = method === 8 ? Bun.deflateSync(data as Uint8Array<ArrayBuffer>) : data;
      const nm = enc.encode(name);
      const local = new Uint8Array(30 + nm.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(8, method, true); lv.setUint32(18, body.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, nm.length, true);
      local.set(nm, 30);
      const cd = new Uint8Array(46 + nm.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, method, true); cv.setUint32(20, body.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nm.length, true); cv.setUint32(42, offset, true);
      cd.set(nm, 46);
      chunks.push(local, body); central.push(cd);
      offset += local.length + body.length;
    }
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    const all = new Uint8Array(offset + cdSize + 22);
    let p = 0;
    for (const x of [...chunks, ...central, end]) { all.set(x, p); p += x.length; }
    const z = await unzip(all.buffer);
    expect([...z.keys()]).toEqual(["map.osu", "song.ogg"]);
    expect(new TextDecoder().decode(await z.get("map.osu")!())).toBe(MANIA);
    expect([...(await z.get("song.ogg")!())]).toEqual([1, 2, 3, 4]);
  });
});
