// Floors: a square of face-down tiles dealt from the dungeon's weights, with one
// way down. Everything comes from the run seed, so a floor is never stored — it's
// regenerated identically whenever it's needed.

import { seededRng, type Rng } from "../dice.js";
import type { DealtKind, DungeonDef, TileKind } from "./types.js";

export interface Floor {
  size: number;
  depth: number;
  start: [number, number];
  stairs: [number, number];
  boss: boolean;
  tiles: TileKind[][]; // [y][x]
}

export const key = (x: number, y: number) => `${x},${y}`;
export const parseKey = (k: string): [number, number] => k.split(",").map(Number) as [number, number];

export function floorSize(d: DungeonDef, depth: number): number {
  return Math.min(9, Math.max(3, d.size + Math.floor((depth - 1) / 3)));
}

export function isBossFloor(d: DungeonDef, depth: number): boolean {
  return d.bossEvery > 0 && depth % d.bossEvery === 0;
}

function pick<T extends string>(weights: [T, number][], rng: Rng): T {
  const total = weights.reduce((n, [, w]) => n + Math.max(0, w), 0);
  let x = rng() * total;
  for (const [k, w] of weights) {
    x -= Math.max(0, w);
    if (x <= 0) return k;
  }
  return weights[weights.length - 1][0];
}

/** How many of a kind a floor may hold. */
const CAPS: Partial<Record<DealtKind, number>> = { elite: 2, shop: 1, rest: 1, romance: 2 };

export function generateFloor(d: DungeonDef, seed: string, depth: number): Floor {
  const rng = seededRng(`${seed}:floor:${depth}`);
  const n = floorSize(d, depth);
  const start: [number, number] = [Math.floor(rng() * n), n - 1];
  // The way down sits well away from where you arrive.
  const far: [number, number][] = [];
  let best: [number, number] = [0, 0];
  let bestD = -1;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dist = Math.abs(x - start[0]) + Math.abs(y - start[1]);
    if (dist >= Math.ceil(n * 0.8)) far.push([x, y]);
    if (dist > bestD) { bestD = dist; best = [x, y]; }
  }
  const stairs = far.length ? far[Math.floor(rng() * far.length)] : best;
  const boss = isBossFloor(d, depth);

  const tiles: TileKind[][] = Array.from({ length: n }, () => Array<TileKind>(n).fill("empty"));
  const counts: Partial<Record<DealtKind, number>> = {};
  const weights = Object.entries(d.tiles) as [DealtKind, number][];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (x === start[0] && y === start[1]) { tiles[y][x] = "start"; continue; }
    if (x === stairs[0] && y === stairs[1]) { tiles[y][x] = boss ? "boss" : "stairs"; continue; }
    const nearStart = Math.abs(x - start[0]) + Math.abs(y - start[1]) <= 1;
    const allowed = weights.filter(([k]) => (CAPS[k] === undefined || (counts[k] ?? 0) < CAPS[k]!) && !(nearStart && k === "elite"));
    const kind = pick(allowed, rng);
    counts[kind] = (counts[kind] ?? 0) + 1;
    tiles[y][x] = kind;
  }
  return { size: n, depth, start, stairs, boss, tiles };
}

export function tileAt(f: Floor, x: number, y: number): TileKind | null {
  return x >= 0 && y >= 0 && x < f.size && y < f.size ? f.tiles[y][x] : null;
}

export function adjacent(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}
