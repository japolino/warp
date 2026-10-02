// Garments are descriptions, not drawings: each one is built from the body's
// landmarks, so the same kimono or crop top fits every body.

import { type Body, mirrorChain, trunkSlice, widthAt } from "./body.js";
import { along, clamp, clipPoly, closedSpline, f, hull, lerp, line, poly, segment, spline, type Joint, type Pt } from "./geom.js";
import { P } from "./features.js";

export const KINDS = ["top", "dress", "robe", "outer", "cape", "armor", "bottom", "skirt", "legwear", "shoes", "gloves", "sleeves", "hat", "neck", "belt", "sash", "apron", "bra", "briefs"] as const;
export type Kind = (typeof KINDS)[number];
export const NECKLINES = ["crew", "scoop", "v", "wrap", "collar", "turtle", "boat", "strapless", "offshoulder", "halter"] as const;
export const SLEEVES = ["none", "cap", "short", "elbow", "three", "long"] as const;
export const SLEEVE_FITS = ["tight", "loose", "wide", "puff", "bell"] as const;
export const HEMS = ["crop", "waist", "hip", "thigh", "knee", "ankle"] as const;
export const LENGTHS = ["micro", "short", "mid", "knee", "calf", "ankle", "floor"] as const;
export const FITS = ["tight", "regular", "loose"] as const;
export const MATERIALS = ["cloth", "leather", "metal", "sheer", "knit", "silk"] as const;
export const PATTERNS = ["none", "stripes", "vstripes", "plaid", "check", "dots", "cow", "floral", "waves", "stars", "fishnet", "scales", "leopard"] as const;
export const STYLES: Partial<Record<Kind, readonly string[]>> = {
  hat: ["newsboy", "beanie", "witch", "sunhat", "cap", "crown", "tiara", "headband", "hood"],
  shoes: ["shoes", "boots", "heels", "sandals", "geta", "sneakers"],
  gloves: ["full", "fingerless"],
  neck: ["choker", "necklace", "scarf", "collar"],
  legwear: ["socks", "tights", "stockings"],
  bottom: ["pants", "shorts"],
  outer: ["jacket", "coat", "vest", "hoodie"],
};

export type Neckline = (typeof NECKLINES)[number];
export type SleeveLen = (typeof SLEEVES)[number];
export type SleeveFit = (typeof SLEEVE_FITS)[number];
export type Hem = (typeof HEMS)[number];
export type Length = (typeof LENGTHS)[number];
export type Fit = (typeof FITS)[number];
export type Material = (typeof MATERIALS)[number];
export type Pattern = (typeof PATTERNS)[number];

export interface Garment {
  kind: Kind;
  colour: string;
  /** Trim, lining, cuffs, buckles. */
  colour2?: string;
  pattern?: Pattern;
  patternColour?: string;
  material?: Material;
  neckline?: Neckline;
  sleeves?: SleeveLen;
  sleeveFit?: SleeveFit;
  hem?: Hem;
  fit?: Fit;
  /** Legs, skirts, socks and boots: how far down (or up) they reach. */
  length?: Length;
  rise?: "high" | "mid" | "low";
  /** Skirts and coat tails: 0 straight .. 1 very full. */
  flare?: number;
  open?: boolean;
  style?: string;
  /** 0 whole .. 1 in tatters. */
  damage?: number;
  label?: string;
}

/** Back to front. */
export const LAYER: Record<Kind, number> = {
  cape: 5, briefs: 8, bra: 9, legwear: 10, shoes: 20, bottom: 30, skirt: 34, top: 40, dress: 41, armor: 44, robe: 45,
  sash: 50, belt: 52, apron: 55, outer: 60, sleeves: 62, gloves: 65, neck: 70, hat: 90,
};

const SLEEVE_T: Record<SleeveLen, number> = { none: 0, cap: 0.1, short: 0.27, elbow: 0.5, three: 0.72, long: 0.98 };
const LEG_T: Record<Length, number> = { micro: 0.05, short: 0.14, mid: 0.3, knee: 0.52, calf: 0.75, ankle: 0.97, floor: 1.08 };
const GROW: Record<Fit, number> = { tight: 0.9, regular: 2.2, loose: 4.5 };

/** One finished garment: shapes to fill, plus lines and trims drawn on top. */
export interface Built {
  /** Filled shapes (all one colour). */
  pieces: Pt[][];
  /** Shapes drawn behind the body (cape backs, hoods). */
  back: Pt[][];
  /** Second-colour shapes on top (trim, cuffs, buckles). */
  trim: Pt[][];
  /** Lines: seams, pleats, laces. */
  lines: { d: string; w?: number; c?: "ink" | "trim" | "shade" | "light" }[];
  /** Drawing order (back to front). */
  layer?: number;
  /** Sleeves this wide cover the hands, which are drawn again on top. */
  handsOver?: boolean;
  /** Covers the hair from behind (hood up). */
  hairUnder?: boolean;
}

const circ = (c: Pt, r: number, n = 22): Pt[] => Array.from({ length: n }, (_, i) => ({ x: c.x + Math.cos((i / n) * Math.PI * 2) * r, y: c.y + Math.sin((i / n) * Math.PI * 2) * r }));
const ell = (c: Pt, rx: number, ry: number, n = 26, rot = 0): Pt[] => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry, r = (rot * Math.PI) / 180;
  return { x: c.x + x * Math.cos(r) - y * Math.sin(r), y: c.y + x * Math.sin(r) + y * Math.cos(r) };
});

/** A limb as polygons: hulls between joints plus round joints (optionally without end caps). */
export function limbPolys(chain: Joint[], grow = 0, caps: { start?: boolean; end?: boolean } = {}): Pt[][] {
  const js = chain.map((j) => ({ ...j, r: Math.max(0.5, j.r + grow) }));
  const out: Pt[][] = [];
  for (let i = 0; i < js.length - 1; i++) out.push(hull(js[i], js[i + 1]));
  js.forEach((j, i) => {
    if (i === 0 && caps.start === false) return;
    if (i === js.length - 1 && caps.end === false) return;
    out.push(circ(j, j.r));
  });
  return out;
}

const clipAbove = (pts: Pt[], y: number): Pt[] => clipPoly(pts, { x: 0, y }, { x: 1, y }, 1);
const clipBelow = (pts: Pt[], y: number): Pt[] => clipPoly(pts, { x: 0, y }, { x: 1, y }, -1);
const both = (b: Body, make: (side: 1 | -1, chain: Joint[]) => Pt[][], chain: Joint[]) => [...make(1, chain), ...make(-1, mirrorChain(b, chain))];
const flipX = (b: Body, pts: Pt[]) => pts.map((p) => ({ x: 2 * b.cx - p.x, y: p.y }));

function handPoly(b: Body, side: 1 | -1, grow = 0): Pt[] {
  const h = b.hand;
  const c = side === 1 ? h.c : { x: 2 * b.cx - h.c.x, y: h.c.y };
  const k = [[0, -1.05], [0.62, -0.7], [0.85, 0.1], [0.7, 0.75], [0.15, 1.0], [-0.45, 0.82], [-0.75, 0.3], [-1.05, -0.05], [-0.8, -0.35], [-0.55, -0.7]];
  return closedSpline(k.map(([u, v]) => ({ x: c.x + u * side * (h.rx + grow), y: c.y + v * (h.ry * 0.62 + grow) })), 5);
}

function footPoly(b: Body, side: 1 | -1, grow = 0): Pt[] {
  const ft = b.foot, ank = b.leg[b.leg.length - 1];
  const cx = side === 1 ? ft.c.x : 2 * b.cx - ft.c.x, ax = side === 1 ? ank.x : 2 * b.cx - ank.x;
  const g = grow;
  return closedSpline([
    { x: ax - ank.r - g, y: ank.y - 2 }, { x: ax + ank.r + g, y: ank.y - 2 },
    { x: cx + ft.rx + g + side * 1.5, y: ft.c.y + 2 }, { x: cx + ft.rx * 0.5 * side, y: b.ground + g * 0.5 }, { x: cx - ft.rx * 0.5 * side, y: b.ground + g * 0.5 },
    { x: cx - ft.rx - g, y: ft.c.y + 1 },
  ], 6);
}

export function skinShapes(b: Body): { trunk: Pt[][]; lines: string[] } {
  const trunk: Pt[][] = [];
  trunk.push(trunkSlice(b, b.profile[0].y, b.crotchY - 4, 0, { hemDip: 8 }));
  if (b.breast) for (const s of [1, -1] as const) trunk.push(s === 1 ? circ(b.breast, b.breast.r) : flipX(b, circ(b.breast, b.breast.r)));
  trunk.push(...both(b, (_s, c) => limbPolys(c), b.arm), ...both(b, (_s, c) => limbPolys(c), b.leg));
  for (const s of [1, -1] as const) trunk.push(handPoly(b, s), footPoly(b, s));
  const lines: string[] = [];
  // Inner edges of thighs and arms (lost where they touch the trunk or each other).
  for (const s of [1, -1] as const) {
    const leg = s === 1 ? b.leg : mirrorChain(b, b.leg);
    const pts: Pt[] = [];
    for (let t = 0.06; t <= 0.5; t += 0.04) { const j = along(leg, t); if (j.y > b.crotchY - 2) pts.push({ x: j.x - s * j.r, y: j.y }); }
    if (pts.length > 1) lines.push(line(pts));
  }
  return { trunk, lines };
}

// ───────── trunk garments ─────────

interface Neck { top: Pt[]; y0: number; cut?: { a: Pt; b: Pt } }

function neckline(b: Body, kind: Neckline, grow: number): Neck {
  const cx = b.cx;
  const onSlope = (nw: number) => {
    // The height where the shoulder slope reaches this half-width.
    for (let i = 1; i < b.profile.length; i++) if (b.profile[i].x >= nw) return lerp(b.profile[i - 1].y, b.profile[i].y, (nw - b.profile[i - 1].x) / (b.profile[i].x - b.profile[i - 1].x || 1));
    return b.shoulderY;
  };
  const mk = (nw: number, depth: number, sharp = false): Neck => {
    const y0 = onSlope(nw - grow);
    const L = { x: cx - nw, y: y0 }, R = { x: cx + nw, y: y0 }, B = { x: cx, y: y0 + depth };
    const top = sharp ? [L, B, R] : spline([L, { x: cx - nw * 0.6, y: y0 + depth * 0.75 }, B, { x: cx + nw * 0.6, y: y0 + depth * 0.75 }, R], 6);
    return { top, y0, cut: { a: R, b: B } };
  };
  const n = b.s.neck;
  switch (kind) {
    case "crew": case "turtle": return mk(n + 3, 6);
    case "collar": return mk(n + 2.5, 9, true);
    case "scoop": return mk(lerp(n, b.s.shoulder, 0.45), b.bustY - b.neckBot - 6 - b.s.bust * 3);
    case "boat": return mk(lerp(n, b.s.shoulder, 0.72), 5);
    case "v": return mk(n + 5, b.bustY - b.neckBot + 4, true);
    case "wrap": {
      const nk = mk(n + 3, b.underY - b.neckBot - 4, true);
      nk.top[1] = { x: cx - 7, y: nk.top[1].y };
      return nk;
    }
    case "halter": {
      const y0 = b.bustY - 12 - b.s.bust * 6;
      const w = widthAt(b, y0) + grow;
      return { y0, top: [{ x: cx - w, y: y0 }, { x: cx - n * 0.6, y: b.neckBot - 2 }, { x: cx + n * 0.6, y: b.neckBot - 2 }, { x: cx + w, y: y0 }] };
    }
    case "strapless": case "offshoulder": {
      const y0 = kind === "offshoulder" ? b.armpitY - 6 : b.bustY - 9 - b.s.bust * 6;
      const w = widthAt(b, y0) + grow;
      const bx = b.breast ? b.breast.x - cx : w * 0.5;
      const top = spline([{ x: cx - w, y: y0 + 2 }, { x: cx - bx, y: y0 - 2 }, { x: cx, y: y0 + 4 }, { x: cx + bx, y: y0 - 2 }, { x: cx + w, y: y0 + 2 }], 6);
      return { y0, top };
    }
  }
}

function hemY(b: Body, hem: Hem): number {
  return { crop: b.underY + 3, waist: b.waistY + 6, hip: b.hipY - 2, thigh: b.hipY + 4, knee: b.hipY + 4, ankle: b.hipY + 4 }[hem];
}

/** Below-the-waist part of a long garment (dress skirt, coat tails, robe). */
function skirtShape(b: Body, y0: number, len: Length, flare: number, grow: number): { pts: Pt[]; y1: number } {
  const y1 = Math.min(b.ground - 4, b.legY(LEG_T[len]) + (len === "floor" ? 30 : 0));
  // Wide enough to clear the legs at every height, then the flare on top.
  const legOut = (y: number) => {
    let w = 0;
    for (let t = 0; t <= 1; t += 0.05) { const j = along(b.leg, t); if (Math.abs(j.y - y) < 16) w = Math.max(w, j.x - b.cx + j.r); }
    return w;
  };
  const ys: number[] = [];
  for (let y = y0; y < y1; y += 8) ys.push(y);
  ys.push(y1);
  const wAt = (y: number) => {
    const k = (y - y0) / Math.max(1, y1 - y0);
    const natural = Math.max(widthAt(b, Math.min(y, b.crotchY)) + grow, legOut(y) + grow + 2);
    return natural + flare * 46 * k ** 1.2;
  };
  let maxSoFar = 0;
  const ws = ys.map((y) => (maxSoFar = Math.max(maxSoFar, wAt(y))));
  const right = ys.map((y, i) => ({ x: b.cx + ws[i], y }));
  const left = ys.map((y, i) => ({ x: b.cx - ws[i], y })).reverse();
  const W = ws[ws.length - 1];
  const hem = spline([{ x: b.cx + W, y: y1 }, { x: b.cx + W * 0.5, y: y1 + 3 + flare * 4 }, { x: b.cx, y: y1 + 4 + flare * 5 }, { x: b.cx - W * 0.5, y: y1 + 3 + flare * 4 }, { x: b.cx - W, y: y1 }], 5);
  return { pts: [...right, ...hem.slice(1, -1), ...left], y1 };
}

function sleevePolys(b: Body, side: 1 | -1, len: number, fit: SleeveFit, grow: number, start = 0): { polys: Pt[][]; lines: { d: string; c?: "ink" | "shade" }[]; handsOver: boolean } {
  const arm = side === 1 ? b.arm : mirrorChain(b, b.arm);
  const polys: Pt[][] = [], lines: { d: string; c?: "ink" | "shade" }[] = [];
  let handsOver = false;
  if (len <= start) return { polys, lines, handsOver };
  const seg = segment(arm, start, len);
  const end = seg[seg.length - 1];
  const prev = seg[seg.length - 2] ?? seg[0];
  const dir = Math.atan2(end.y - prev.y, end.x - prev.x);
  const cuff = (r: number) => { const n = { x: Math.cos(dir + Math.PI / 2) * r, y: Math.sin(dir + Math.PI / 2) * r }; return line([{ x: end.x - n.x, y: end.y - n.y }, { x: end.x + n.x, y: end.y + n.y }]); };
  switch (fit) {
    case "tight":
      polys.push(...limbPolys(seg, grow, { start: start > 0 ? false : undefined, end: false }));
      break;
    case "loose": case "bell": {
      const R = Math.max(...seg.map((j) => j.r)) + grow + 1.5;
      const flareEnd = fit === "bell" ? R * 1.9 : R + 2;
      const js = seg.map((j, i) => ({ ...j, r: lerp(R, flareEnd, (i / (seg.length - 1)) ** 2) }));
      polys.push(...limbPolys(js, 0, { start: start > 0 ? false : undefined, end: false }));
      lines.push({ d: cuff(flareEnd), c: "shade" });
      if (fit === "bell") handsOver = true;
      break;
    }
    case "puff": {
      const top = along(arm, Math.max(start, 0.1));
      polys.push(circ({ x: top.x + side * 2, y: top.y }, top.r * 1.75 + grow));
      polys.push(...limbPolys(seg, grow, { end: false }));
      lines.push({ d: cuff(end.r + grow), c: "ink" });
      break;
    }
    case "wide": {
      // Kimono sleeve: a broad bag hanging from the arm, open at the wrist.
      const j0 = seg[0];
      const R = Math.max(18, end.r * 4.2);
      const drop = 34 + end.r * 2;
      polys.push(closedSpline([
        { x: j0.x - side * j0.r * 0.3, y: j0.y - j0.r - grow },
        { x: j0.x + side * (j0.r + grow + 3), y: j0.y + 2 },
        { x: lerp(j0.x, end.x, 0.5) + side * (R * 0.55 + 2), y: lerp(j0.y, end.y, 0.5) },
        { x: end.x + side * R * 0.62, y: end.y + 2 },
        { x: end.x + side * R * 0.55, y: end.y + drop },
        { x: end.x - side * R * 0.2, y: end.y + drop + 4 },
        { x: end.x - side * R * 0.75, y: end.y + drop - 6 },
        { x: lerp(j0.x, end.x, 0.55) - side * (j0.r + 6), y: lerp(j0.y, end.y, 0.55) },
        { x: j0.x - side * j0.r * 1.2, y: j0.y + j0.r * 1.5 },
      ], 5));
      lines.push({ d: `M${f(end.x - side * R * 0.45)} ${f(end.y - 3)}Q${f(end.x)} ${f(end.y + 6)} ${f(end.x + side * R * 0.55)} ${f(end.y + 1)}`, c: "ink" });
      lines.push({ d: line([{ x: end.x - side * R * 0.1, y: end.y + 12 }, { x: end.x, y: end.y + drop - 2 }]), c: "shade" });
      handsOver = true;
      break;
    }
  }
  return { polys, lines, handsOver };
}

function trunkPiece(b: Body, g: Garment, grow: number): { pieces: Pt[][]; lines: Built["lines"]; handsOver: boolean } {
  const nk = neckline(b, g.neckline ?? "crew", grow);
  const sleeves = g.neckline === "strapless" || g.neckline === "halter" ? "none" : g.sleeves ?? "short";
  const hem = g.hem ?? "hip";
  const y1 = hemY(b, hem);
  const lines: Built["lines"] = [];
  const sleeveless = sleeves === "none" && g.neckline !== "offshoulder";
  const maxW = sleeveless ? (y: number) => (y < b.armpitY + 2 ? lerp(Math.abs(nk.top[nk.top.length - 1].x - b.cx) + 4, widthAt(b, b.armpitY) + grow, clamp((y - nk.y0) / Math.max(1, b.armpitY - nk.y0), 0, 1) ** 0.7) : 999) : undefined;
  let body = trunkSlice(b, nk.y0, y1, grow, { maxW, top: nk.top, hemDip: hem === "crop" ? 0 : 3 });
  const pieces: Pt[][] = [body];
  // Fitted tops follow the bust.
  if (b.breast && (g.fit ?? "regular") !== "loose" && hem !== "crop" || (b.breast && hem === "crop")) {
    for (const s of [1, -1] as const) {
      let c = circ({ x: b.breast.x, y: b.breast.y }, b.breast.r + grow * 0.7);
      if (s === -1) c = flipX(b, c);
      c = clipAbove(c, nk.y0 + 1);
      if (nk.cut) { const cut = s === 1 ? nk.cut : { a: { x: 2 * b.cx - nk.cut.a.x, y: nk.cut.a.y }, b: nk.cut.b }; c = clipPoly(c, cut.a, cut.b, s === 1 ? 1 : -1); }
      if (c.length > 2) pieces.push(c);
    }
  }
  let handsOver = false;
  if (sleeves !== "none" || g.neckline === "offshoulder") {
    const t = sleeves === "none" ? 0.2 : SLEEVE_T[sleeves];
    for (const s of [1, -1] as const) {
      const sl = sleevePolys(b, s, t, g.sleeveFit ?? "tight", grow, g.neckline === "offshoulder" ? 0.12 : 0);
      pieces.push(...sl.polys);
      lines.push(...sl.lines);
      handsOver ||= sl.handsOver;
    }
  }
  if (g.neckline === "turtle") pieces.push([{ x: b.cx - b.s.neck - 2, y: b.neckTop - 2 }, { x: b.cx + b.s.neck + 2, y: b.neckTop - 2 }, { x: b.cx + b.s.neck + 4, y: b.neckBot + 4 }, { x: b.cx - b.s.neck - 4, y: b.neckBot + 4 }]);
  if (g.neckline === "collar") {
    for (const s of [1, -1]) lines.push({ d: line([{ x: b.cx + s * (b.s.neck + 3), y: nk.y0 - 1 }, { x: b.cx + s * (b.s.neck + 9), y: nk.y0 + 12 }, { x: b.cx + s * 1, y: nk.y0 + 10 }]), w: 1.2 });
  }
  if (g.neckline === "wrap") {
    const B = nk.top[1];
    lines.push({ d: line([{ x: nk.top[2].x, y: nk.top[2].y }, B, { x: b.cx - widthAt(b, y1 - 20) - grow + 2, y: y1 - 6 }]), w: 1.3 });
  }
  return { pieces, lines, handsOver };
}

// ───────── the builders ─────────

export function build(b: Body, g: Garment): Built {
  const out: Built = { pieces: [], back: [], trim: [], lines: [] };
  const grow = GROW[g.fit ?? "regular"] + (g.material === "metal" ? 1.5 : g.material === "knit" ? 0.6 : 0);
  const cx = b.cx;
  switch (g.kind) {
    case "top": case "armor": {
      const t = trunkPiece(b, { ...g, hem: g.hem ?? (g.kind === "armor" ? "waist" : "hip") }, grow);
      out.pieces.push(...t.pieces); out.lines.push(...t.lines); out.handsOver = t.handsOver;
      if (g.kind === "armor") {
        for (const s of [1, -1] as const) {
          const j = s === 1 ? b.arm[0] : { ...b.arm[0], x: 2 * cx - b.arm[0].x };
          out.trim.push(ell({ x: j.x + s * 3, y: j.y + 2 }, j.r * 1.75, j.r * 1.4, 22, s * 25));
        }
        out.lines.push({ d: line([{ x: cx, y: b.neckBot + 8 }, { x: cx, y: b.waistY }]), c: "light", w: 1.5 });
        out.lines.push({ d: `M${f(cx - b.s.waist)} ${f(b.underY + 6)}Q${f(cx)} ${f(b.underY + 14)} ${f(cx + b.s.waist)} ${f(b.underY + 6)}`, c: "shade", w: 1.3 });
      }
      if (g.neckline === "collar" && !g.open) for (let y = b.bustY - 8; y < hemY(b, g.hem ?? "hip") - 8; y += 16) out.trim.push(circ({ x: cx + 0.5, y }, 1.5, 8));
      break;
    }
    case "dress": case "robe": {
      const robe = g.kind === "robe";
      const t = trunkPiece(b, { ...g, neckline: g.neckline ?? (robe ? "wrap" : "scoop"), sleeves: g.sleeves ?? (robe ? "long" : "none"), sleeveFit: g.sleeveFit ?? (robe ? "wide" : "tight"), hem: "waist" }, grow);
      out.pieces.push(...t.pieces); out.lines.push(...t.lines); out.handsOver = t.handsOver;
      const sk = skirtShape(b, b.waistY - 2, g.length ?? (robe ? "ankle" : "knee"), g.flare ?? (robe ? 0.15 : 0.5), grow);
      out.pieces.push(sk.pts);
      if (robe) out.lines.push({ d: line([{ x: cx - widthAt(b, b.waistY) - grow + 2, y: b.waistY + 4 }, { x: cx - 4, y: sk.y1 + 3 }]), w: 1.2 });
      else out.lines.push({ d: `M${f(cx - widthAt(b, b.waistY) - grow)} ${f(b.waistY + 2)}Q${f(cx)} ${f(b.waistY + 5)} ${f(cx + widthAt(b, b.waistY) + grow)} ${f(b.waistY + 2)}`, c: "shade", w: 1 });
      if ((g.flare ?? 0.5) > 0.3 && !robe) pleats(out, cx, b.waistY + 8, sk.y1, sk.pts);
      break;
    }
    case "outer": {
      const style = g.style ?? "jacket";
      const t = trunkPiece(b, { ...g, neckline: g.neckline ?? (style === "hoodie" ? "crew" : "v"), sleeves: style === "vest" ? "none" : g.sleeves ?? "long", sleeveFit: g.sleeveFit ?? "loose", hem: style === "coat" ? "hip" : g.hem ?? "hip" }, grow + 1.2);
      let pieces = t.pieces;
      if (style === "coat") pieces.push(skirtShape(b, b.hipY - 6, g.length ?? "knee", g.flare ?? 0.3, grow + 2).pts);
      if (g.open ?? style !== "hoodie") {
        // Open down the front: cut the trunk pieces either side of a gap that narrows toward the hem.
        const gapTop = b.s.neck + 3, gapBot = 7;
        const yTop = b.neckBot, yBot = b.ground;
        const trunkLike = pieces.slice(0, 1 + (b.breast ? 2 : 0));
        const rest = pieces.slice(trunkLike.length);
        const coat = style === "coat" ? [rest.pop()!] : [];
        const halves: Pt[][] = [];
        for (const p of [...trunkLike, ...coat]) {
          halves.push(clipPoly(p, { x: cx + gapTop, y: yTop }, { x: cx + gapBot, y: b.waistY }, -1));
          halves.push(clipPoly(p, { x: cx - gapTop, y: yTop }, { x: cx - gapBot, y: b.waistY }, 1));
        }
        // Below the waist the gap stays the same.
        pieces = [...halves.map((h) => h.filter(() => true)), ...rest].filter((h) => h.length > 2);
        for (const s of [1, -1]) out.lines.push({ d: line([{ x: cx + s * (b.s.neck + 3), y: b.neckBot - 2 }, { x: cx + s * (b.s.neck + 12), y: b.bustY - 4 }, { x: cx + s * gapBot * 1.6, y: b.underY + 6 }]), w: 1.3 });
        void yBot;
      }
      if (style === "hoodie") {
        // The hood lies down behind the neck.
        out.back.push(closedSpline([{ x: cx - b.s.neck - 16, y: b.shoulderY + 4 }, { x: cx - b.s.neck - 14, y: b.neckTop - 4 }, { x: cx, y: b.neckTop - 14 }, { x: cx + b.s.neck + 14, y: b.neckTop - 4 }, { x: cx + b.s.neck + 16, y: b.shoulderY + 4 }], 6));
        out.lines.push({ d: line([{ x: cx - 4, y: b.neckBot + 2 }, { x: cx - 5, y: b.bustY + 6 }]), w: 1.2 }, { d: line([{ x: cx + 4, y: b.neckBot + 2 }, { x: cx + 5, y: b.bustY + 6 }]), w: 1.2 });
        const py = b.waistY + 6;
        out.lines.push({ d: `M${f(cx - 20)} ${f(b.hipY - 8)}L${f(cx - 14)} ${f(py)}L${f(cx + 14)} ${f(py)}L${f(cx + 20)} ${f(b.hipY - 8)}`, w: 1.1 });
      }
      // Close the slit between a loose sleeve and the body: coats hang straight down from the armpit.
      if (style !== "vest") {
        const sleeveT = SLEEVE_T[g.sleeves ?? "long"];
        const yEnd = Math.min(hemY(b, style === "coat" ? "hip" : g.hem ?? "hip"), along(b.arm, sleeveT).y);
        for (const s of [1, -1] as const) {
          const arm = s === 1 ? b.arm : mirrorChain(b, b.arm);
          const inner: Pt[] = [];
          for (let k = 0.08; k <= sleeveT + 1e-9; k += 0.06) { const j = along(arm, k); if (j.y <= yEnd) inner.push({ x: j.x - s * (j.r + grow), y: j.y }); }
          if (inner.length < 2) continue;
          // Follow the body's side at every height, so the waist's curve leaves no gap.
          const side = inner.map((p) => ({ x: cx + s * (widthAt(b, p.y) + grow - 1), y: p.y })).reverse();
          pieces.push([...inner, ...side]);
          out.lines.push({ d: line(inner.map((p) => ({ x: p.x + s * 0.5, y: p.y }))), c: "shade", w: 1.1 });
        }
      }
      out.pieces.push(...pieces); out.lines.push(...t.lines); out.handsOver = t.handsOver;
      break;
    }
    case "cape": {
      const top = b.neckBot - 2;
      const y1 = b.legY(LEG_T[g.length ?? "calf"]);
      const W = b.s.shoulder + 14;
      out.back.push([{ x: cx - b.s.neck - 2, y: top }, { x: cx + b.s.neck + 2, y: top }, { x: cx + W, y: b.shoulderY + 10 }, { x: cx + W + 18, y: y1 }, { x: cx, y: y1 + 6 }, { x: cx - W - 18, y: y1 }, { x: cx - W, y: b.shoulderY + 10 }]);
      // The mantle over the shoulders.
      out.pieces.push(closedSpline([{ x: cx - b.s.neck - 3, y: top - 2 }, { x: cx + b.s.neck + 3, y: top - 2 }, { x: cx + W + 4, y: b.armpitY + 4 }, { x: cx + W - 10, y: b.armpitY + 14 }, { x: cx, y: b.armpitY + 6 }, { x: cx - W + 10, y: b.armpitY + 14 }, { x: cx - W - 4, y: b.armpitY + 4 }], 6));
      out.trim.push(circ({ x: cx, y: b.neckBot + 4 }, 4, 12));
      break;
    }
    case "bottom": {
      const shorts = g.style === "shorts" || ["micro", "short", "mid"].includes(g.length ?? "ankle");
      const t = LEG_T[g.length ?? (shorts ? "short" : "ankle")];
      const riseY = { high: b.waistY - 4, mid: b.waistY + 8, low: lerp(b.waistY, b.hipY, 0.62) }[g.rise ?? "mid"];
      out.pieces.push(trunkSlice(b, riseY, b.crotchY + 4, grow, { hemDip: 4 }));
      const loose = g.fit === "loose";
      for (const s of [1, -1] as const) {
        const leg = s === 1 ? b.leg : mirrorChain(b, b.leg);
        let seg = segment(leg, 0, Math.min(1, t));
        if (loose) { const R = Math.max(...seg.map((j) => j.r)); seg = seg.map((j, i) => ({ ...j, r: lerp(j.r, R * 0.92, i / (seg.length - 1)) })); }
        for (const p of limbPolys(seg, grow, { end: false })) { const c = clipAbove(p, riseY); if (c.length > 2) out.pieces.push(c); }
        const e = seg[seg.length - 1];
        if (!shorts) out.lines.push({ d: line([{ x: e.x - s * (e.r * 0.2), y: b.crotchY + 14 }, { x: e.x - s * (e.r * 0.15), y: e.y - 6 }]), c: "shade", w: 1 });
      }
      out.lines.push({ d: line([{ x: cx, y: riseY + 3 }, { x: cx, y: b.crotchY - 2 }]), w: 1 });
      break;
    }
    case "skirt": {
      const riseY = { high: b.waistY - 4, mid: b.waistY + 6, low: lerp(b.waistY, b.hipY, 0.55) }[g.rise ?? "mid"];
      const sk = skirtShape(b, riseY, g.length ?? "short", g.flare ?? 0.45, grow);
      out.pieces.push(sk.pts);
      if ((g.flare ?? 0.45) > 0.25) pleats(out, cx, riseY + 8, sk.y1, sk.pts);
      out.trim.push(trunkSlice(b, riseY - 1, riseY + 5, grow + 0.6));
      break;
    }
    case "legwear": {
      const style = g.style ?? "socks";
      const t0 = style === "tights" ? 0 : style === "stockings" ? LEG_T[g.length ?? "short"] + 0.02 : 1 - LEG_T[g.length ?? "mid"] * 0.6;
      const t = clamp(style === "socks" ? Math.min(t0, 0.9) : t0, 0, 0.92);
      for (const s of [1, -1] as const) {
        const leg = s === 1 ? b.leg : mirrorChain(b, b.leg);
        out.pieces.push(...limbPolys(segment(leg, t, 1), 0.7, { start: false }), footPoly(b, s, 0.7));
        if (style !== "tights") { const top = along(leg, t); out.trim.push(clipBelow(clipAbove(circ(top, top.r + 0.9, 18), top.y - 1), top.y + 4)); out.trim.push([{ x: top.x - top.r - 1, y: top.y }, { x: top.x + top.r + 1, y: top.y }, { x: top.x + top.r + 1, y: top.y + 4 }, { x: top.x - top.r - 1, y: top.y + 4 }]); }
      }
      if (style === "tights") out.pieces.push(trunkSlice(b, lerp(b.waistY, b.hipY, 0.3), b.crotchY + 4, 0.6, { hemDip: 4 }));
      break;
    }
    case "shoes": {
      const style = g.style ?? "shoes";
      for (const s of [1, -1] as const) {
        const leg = s === 1 ? b.leg : mirrorChain(b, b.leg);
        const foot = footPoly(b, s, style === "boots" ? 2.2 : 1.4);
        if (style === "sandals" || style === "geta") {
          const ft = s === 1 ? b.foot.c : { x: 2 * cx - b.foot.c.x, y: b.foot.c.y };
          out.pieces.push([{ x: ft.x - b.foot.rx - 2, y: b.ground - 1 }, { x: ft.x + b.foot.rx + 2, y: b.ground - 1 }, { x: ft.x + b.foot.rx + 2, y: b.ground + (style === "geta" ? 9 : 3) }, { x: ft.x - b.foot.rx - 2, y: b.ground + (style === "geta" ? 9 : 3) }]);
          out.lines.push({ d: line([{ x: ft.x - b.foot.rx * 0.6, y: ft.y + 2 }, { x: ft.x, y: ft.y - 6 }, { x: ft.x + b.foot.rx * 0.6, y: ft.y + 2 }]), c: "trim", w: 2.4 });
          continue;
        }
        out.pieces.push(foot);
        if (style === "boots") {
          const t0 = 1 - LEG_T[g.length ?? "calf"] * 0.9;
          out.pieces.push(...limbPolys(segment(leg, clamp(t0, 0.35, 0.9), 1), 2.2, { start: false }));
          const top = along(leg, clamp(t0, 0.35, 0.9));
          out.trim.push([{ x: top.x - top.r - 3.2, y: top.y - 1 }, { x: top.x + top.r + 3.2, y: top.y - 1 }, { x: top.x + top.r + 3, y: top.y + 6 }, { x: top.x - top.r - 3, y: top.y + 6 }]);
        }
        const ft = s === 1 ? b.foot.c : { x: 2 * cx - b.foot.c.x, y: b.foot.c.y };
        if (style === "sneakers") {
          out.trim.push([{ x: ft.x - b.foot.rx - 1.5, y: b.ground - 4 }, { x: ft.x + b.foot.rx + 1.5, y: b.ground - 4 }, { x: ft.x + b.foot.rx * 0.5, y: b.ground + 1.5 }, { x: ft.x - b.foot.rx * 0.5, y: b.ground + 1.5 }]);
          for (let i = 0; i < 3; i++) out.lines.push({ d: line([{ x: ft.x - 3, y: ft.y - 6 + i * 4 }, { x: ft.x + 3, y: ft.y - 6 + i * 4 }]), c: "light", w: 1 });
        }
        if (style === "heels") out.lines.push({ d: line([{ x: ft.x - 4, y: ft.y - 2 }, { x: ft.x + 2, y: ft.y + 6 }]), c: "light", w: 1.2 });
      }
      break;
    }
    case "gloves": {
      const fingerless = g.style === "fingerless";
      const t0 = 1 - SLEEVE_T[g.sleeves ?? "cap"] * 1.0;
      for (const s of [1, -1] as const) {
        const arm = s === 1 ? b.arm : mirrorChain(b, b.arm);
        const t = clamp(t0, 0.05, 0.92);
        out.pieces.push(...limbPolys(segment(arm, t, 1), 1, { start: false }));
        let h = handPoly(b, s, 1);
        if (fingerless) h = clipBelow(h, b.hand.c.y + b.hand.ry * 0.12);
        out.pieces.push(h);
        const top = along(arm, t);
        out.trim.push([{ x: top.x - top.r - 2, y: top.y - 1 }, { x: top.x + top.r + 2, y: top.y - 1 }, { x: top.x + top.r + 2, y: top.y + 4 }, { x: top.x - top.r - 2, y: top.y + 4 }]);
      }
      break;
    }
    case "sleeves": {
      for (const s of [1, -1] as const) {
        const sl = sleevePolys(b, s, SLEEVE_T[g.sleeves ?? "long"], g.sleeveFit ?? "bell", grow, 0.3);
        out.pieces.push(...sl.polys); out.lines.push(...sl.lines);
        const arm = s === 1 ? b.arm : mirrorChain(b, b.arm);
        const top = along(arm, 0.3);
        out.trim.push([{ x: top.x - top.r - 3, y: top.y - 2 }, { x: top.x + top.r + 3, y: top.y - 2 }, { x: top.x + top.r + 3, y: top.y + 3 }, { x: top.x - top.r - 3, y: top.y + 3 }]);
      }
      break;
    }
    case "bra": {
      const y0 = b.bustY - 7 - b.s.bust * 6;
      const top = spline([{ x: cx - widthAt(b, y0) - 1, y: y0 + 3 }, { x: cx - (b.breast ? b.breast.x - cx : 10), y: y0 - 3 }, { x: cx, y: y0 + 7 }, { x: cx + (b.breast ? b.breast.x - cx : 10), y: y0 - 3 }, { x: cx + widthAt(b, y0) + 1, y: y0 + 3 }], 6);
      out.pieces.push(trunkSlice(b, y0, b.underY + 1, 1, { top }));
      if (b.breast) for (const s of [1, -1] as const) { let c = circ(b.breast, b.breast.r + 1); if (s === -1) c = flipX(b, c); c = clipAbove(c, y0 + 1); out.pieces.push(c); }
      for (const s of [1, -1]) out.lines.push({ d: line([{ x: cx + s * (b.s.chest * 0.4), y: y0 }, { x: cx + s * (lerp(b.s.neck, b.s.shoulder, 0.55)), y: b.shoulderY - 2 }]), c: "trim", w: 1.8 });
      break;
    }
    case "briefs": {
      const y0 = lerp(b.waistY, b.hipY, b.sex === "m" ? 0.4 : 0.6);
      const w0 = widthAt(b, y0) + 1;
      const end = b.sex === "m" ? 15 : 7;
      out.pieces.push(trunkSlice(b, y0, b.crotchY + 5, 1, { maxW: (y) => lerp(w0, end, clamp((y - y0) / (b.crotchY + 5 - y0), 0, 1) ** (b.sex === "m" ? 1.6 : 1.15)), hemDip: 2 }));
      out.trim.push(trunkSlice(b, y0 - 0.5, y0 + 3, 1.5));
      break;
    }
    case "hat": hat(b, g, out); break;
    case "neck": {
      const style = g.style ?? "choker";
      const n = b.s.neck;
      // The neck shows from under the chin.
      const chin = b.head.c.y + b.head.ry * 0.98;
      const ny = lerp(chin, b.neckBot, 0.45);
      if (style === "choker" || style === "collar") {
        out.pieces.push([{ x: cx - n - 1.5, y: ny - 3 }, { x: cx + n + 1.5, y: ny - 3 }, { x: cx + n + 2, y: ny + 3 }, { x: cx - n - 2, y: ny + 3 }]);
        if (style === "collar") out.trim.push(circ({ x: cx, y: ny + 7 }, 4, 14));
        else out.trim.push(closedSpline([{ x: cx, y: ny + 4 }, { x: cx + 4, y: ny + 8 }, { x: cx, y: ny + 13 }, { x: cx - 4, y: ny + 8 }], 4));
      } else if (style === "necklace") {
        out.lines.push({ d: `M${f(cx - n - 1)} ${f(b.neckBot - 3)}Q${f(cx)} ${f(b.bustY + 4)} ${f(cx + n + 1)} ${f(b.neckBot - 3)}`, c: "trim", w: 1.4 });
        const py = lerp(b.neckBot, b.bustY + 4, 0.55);
        out.trim.push(closedSpline([{ x: cx, y: py - 2 }, { x: cx + 5, y: py - 6 }, { x: cx + 7, y: py + 0 }, { x: cx, y: py + 9 }, { x: cx - 7, y: py }, { x: cx - 5, y: py - 6 }], 4));
      } else if (style === "scarf") {
        out.pieces.push(closedSpline([{ x: cx - n - 6, y: chin + 1 }, { x: cx + n + 6, y: chin + 1 }, { x: cx + n + 12, y: b.neckBot + 4 }, { x: cx, y: b.neckBot + 12 }, { x: cx - n - 12, y: b.neckBot + 4 }], 6));
        out.pieces.push([{ x: cx + n - 2, y: b.neckBot }, { x: cx + n + 10, y: b.neckBot + 2 }, { x: cx + n + 14, y: b.bustY + 30 }, { x: cx + n + 2, y: b.bustY + 32 }]);
        out.lines.push({ d: line([{ x: cx + n + 3, y: b.bustY + 31 }, { x: cx + n + 3, y: b.bustY + 36 }]), w: 1 }, { d: line([{ x: cx + n + 8, y: b.bustY + 31 }, { x: cx + n + 9, y: b.bustY + 36 }]), w: 1 });
      }
      break;
    }
    case "belt": {
      const y = g.rise === "low" ? lerp(b.waistY, b.hipY, 0.55) : b.waistY + 5;
      out.pieces.push(trunkSlice(b, y - 3.5, y + 3.5, 3.2));
      out.trim.push([{ x: cx - 6, y: y - 5 }, { x: cx + 6, y: y - 5 }, { x: cx + 6, y: y + 5 }, { x: cx - 6, y: y + 5 }]);
      break;
    }
    case "sash": {
      // An obi: a wide band from under the bust to the waist, with a cord.
      out.pieces.push(trunkSlice(b, b.underY - 2, b.waistY + 8, GROW.regular + 3.5));
      out.lines.push({ d: `M${f(cx - widthAt(b, b.waistY) - 5)} ${f(lerp(b.underY, b.waistY, 0.55))}L${f(cx + widthAt(b, b.waistY) + 5)} ${f(lerp(b.underY, b.waistY, 0.55))}`, c: "trim", w: 2.6 });
      out.trim.push(circ({ x: cx + 4, y: lerp(b.underY, b.waistY, 0.55) }, 3, 12));
      break;
    }
    case "apron": {
      const y0 = b.waistY + 2, y1 = b.legY(LEG_T[g.length ?? "knee"]) - 6;
      const w0 = b.s.waist * 0.75, w1 = b.s.hip * 0.78;
      const ym = lerp(y0, y1, 0.3);
      out.pieces.push([{ x: cx - w0, y: y0 }, { x: cx + w0, y: y0 }, { x: cx + w1, y: ym }, { x: cx + w1, y: y1 - 6 }, { x: cx + w1 - 6, y: y1 }, { x: cx - w1 + 6, y: y1 }, { x: cx - w1, y: y1 - 6 }, { x: cx - w1, y: ym }]);
      // Bib.
      out.pieces.push([{ x: cx - b.s.chest * 0.45, y: b.bustY - 10 }, { x: cx + b.s.chest * 0.45, y: b.bustY - 10 }, { x: cx + b.s.waist * 0.7, y: y0 + 2 }, { x: cx - b.s.waist * 0.7, y: y0 + 2 }]);
      for (const s of [1, -1]) out.lines.push({ d: line([{ x: cx + s * b.s.chest * 0.42, y: b.bustY - 9 }, { x: cx + s * lerp(b.s.neck, b.s.shoulder, 0.5), y: b.shoulderY - 1 }]), c: "trim", w: 2.4 });
      out.lines.push({ d: line([{ x: cx - w1 + 3, y: y1 - 3 }, { x: cx, y: y1 }, { x: cx + w1 - 3, y: y1 - 3 }]), c: "shade", w: 1 });
      break;
    }
  }
  return out;
}

function pleats(out: Built, cx: number, y0: number, y1: number, shape: Pt[]) {
  const w = Math.max(...shape.map((p) => Math.abs(p.x - cx)));
  for (const k of [-0.62, -0.25, 0.25, 0.62]) out.lines.push({ d: line([{ x: cx + k * w * 0.45, y: y0 }, { x: cx + k * w * 0.92, y: y1 - 1 }]), c: "shade", w: 1 });
}

function hat(b: Body, g: Garment, out: Built) {
  const rx = b.head.rx;
  switch (g.style ?? "newsboy") {
    case "newsboy":
      out.pieces.push(closedSpline([P(b, -1.18, -0.42), P(b, -1.3, -0.85), P(b, -0.7, -1.38), P(b, 0.2, -1.42), P(b, 1.1, -1.18), P(b, 1.25, -0.6), P(b, 1.12, -0.38), P(b, 0, -0.5)], 7));
      out.trim.push(closedSpline([P(b, -0.7, -0.5), P(b, 0, -0.62), P(b, 0.7, -0.5), P(b, 0.55, -0.28), P(b, 0, -0.24), P(b, -0.55, -0.28)], 6));
      out.lines.push({ d: `M${f(P(b, -1.05, -0.62).x)} ${f(P(b, -1.05, -0.62).y)}Q${f(P(b, 0, -0.78).x)} ${f(P(b, 0, -0.78).y)} ${f(P(b, 1.1, -0.6).x)} ${f(P(b, 1.1, -0.6).y)}`, c: "shade", w: 1.2 });
      out.trim.push(circ(P(b, 0.1, -1.38), 2.6, 10));
      break;
    case "beanie":
      out.pieces.push(closedSpline([P(b, -1.14, -0.42), P(b, -1.12, -0.95), P(b, -0.5, -1.32), P(b, 0.5, -1.32), P(b, 1.12, -0.95), P(b, 1.14, -0.42)], 8));
      out.trim.push(closedSpline([P(b, -1.18, -0.62), P(b, 0, -0.72), P(b, 1.18, -0.62), P(b, 1.18, -0.34), P(b, 0, -0.42), P(b, -1.18, -0.34)], 6));
      out.trim.push(circ(P(b, 0, -1.4), rx * 0.24, 14));
      break;
    case "witch": {
      out.pieces.push(ell(P(b, 0, -0.72), rx * 2.25, b.head.ry * 0.3, 32));
      out.pieces.push(spline([P(b, -0.95, -0.7), P(b, -0.5, -1.6), P(b, 0.1, -2.5), P(b, 0.9, -2.9), P(b, 0.55, -2.3), P(b, 0.6, -1.4), P(b, 0.95, -0.7)], 6));
      out.trim.push(closedSpline([P(b, -0.92, -0.9), P(b, 0, -0.98), P(b, 0.93, -0.9), P(b, 0.95, -0.72), P(b, 0, -0.78), P(b, -0.95, -0.72)], 6));
      break;
    }
    case "sunhat":
      out.pieces.push(ell(P(b, 0, -0.7), rx * 2.05, b.head.ry * 0.42, 32));
      out.pieces.push(closedSpline([P(b, -0.95, -0.72), P(b, -0.85, -1.25), P(b, 0, -1.45), P(b, 0.85, -1.25), P(b, 0.95, -0.72)], 7));
      out.trim.push(closedSpline([P(b, -0.95, -0.95), P(b, 0, -1.02), P(b, 0.95, -0.95), P(b, 0.96, -0.76), P(b, 0, -0.82), P(b, -0.96, -0.76)], 6));
      break;
    case "cap":
      out.pieces.push(closedSpline([P(b, -1.12, -0.48), P(b, -1.05, -1.0), P(b, 0, -1.33), P(b, 1.05, -1.0), P(b, 1.12, -0.48), P(b, 0, -0.56)], 8));
      out.trim.push(closedSpline([P(b, -0.95, -0.52), P(b, 0, -0.62), P(b, 0.95, -0.52), P(b, 0.7, -0.3), P(b, 0, -0.24), P(b, -0.7, -0.3)], 6));
      break;
    case "crown": {
      const pts: Pt[] = [];
      for (let i = 0; i <= 8; i++) pts.push(P(b, -0.8 + (i / 8) * 1.6, i % 2 ? -1.55 : -1.15));
      out.pieces.push([...pts, P(b, 0.82, -0.85), P(b, -0.82, -0.85)]);
      for (const u of [-0.6, 0, 0.6]) out.trim.push(circ(P(b, u, -1.0), 2.4, 10));
      break;
    }
    case "tiara":
      out.pieces.push(closedSpline([P(b, -0.85, -0.85), P(b, -0.4, -1.12), P(b, 0, -1.38), P(b, 0.4, -1.12), P(b, 0.85, -0.85), P(b, 0, -1.05)], 6));
      out.trim.push(closedSpline([P(b, 0, -1.32), P(b, 0.12, -1.18), P(b, 0, -1.06), P(b, -0.12, -1.18)], 3));
      break;
    case "headband": {
      out.pieces.push(closedSpline([P(b, -1.08, -0.55), P(b, -0.75, -1.08), P(b, 0, -1.28), P(b, 0.75, -1.08), P(b, 1.08, -0.55), P(b, 0.7, -0.92), P(b, 0, -1.08), P(b, -0.7, -0.92)], 6));
      for (let i = 0; i < 7; i++) { const a = Math.PI + 0.35 + (i / 6) * (Math.PI - 0.7); out.trim.push(circ(P(b, Math.cos(a) * 1.02, Math.sin(a) * 1.2 - 0.02), 3.4, 10)); }
      break;
    }
    case "hood":
      out.back.push(closedSpline([P(b, -1.42, 0.6), P(b, -1.45, -0.5), P(b, -0.8, -1.38), P(b, 0, -1.48), P(b, 0.8, -1.38), P(b, 1.45, -0.5), P(b, 1.42, 0.6), { x: b.cx, y: b.neckBot + 10 }], 8));
      out.pieces.push(closedSpline([P(b, -1.3, 0.5), P(b, -1.38, -0.5), P(b, -0.75, -1.35), P(b, 0, -1.45), P(b, 0.75, -1.35), P(b, 1.38, -0.5), P(b, 1.3, 0.5), P(b, 1.0, 0.45), P(b, 1.05, -0.4), P(b, 0.6, -1.05), P(b, 0, -1.15), P(b, -0.6, -1.05), P(b, -1.05, -0.4), P(b, -1.0, 0.45)], 6));
      out.hairUnder = true;
      break;
  }
}

/** A few small tears inside a garment's outline (deterministic per garment). */
export function tears(pieces: Pt[][], amount: number, rand: () => number): Pt[][] {
  if (amount <= 0 || !pieces.length) return [];
  const n = Math.round(amount * 7);
  const out: Pt[][] = [];
  const big = pieces.reduce((a, p) => (area(p) > area(a) ? p : a), pieces[0]);
  const xs = big.map((p) => p.x), ys = big.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let i = 0; i < n * 4 && out.length < n; i++) {
    const c = { x: lerp(x0, x1, rand()), y: lerp(y0 + (y1 - y0) * 0.25, y1, rand()) };
    if (!inside(big, c)) continue;
    const r = 3 + rand() * 5 * (0.6 + amount);
    const k = 7;
    out.push(Array.from({ length: k }, (_, j) => { const a = (j / k) * Math.PI * 2; const rr = r * (j % 2 ? 0.45 : 1) * (0.7 + rand() * 0.6); return { x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr * 1.3 }; }));
  }
  return out;
}

function area(p: Pt[]): number { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; } return Math.abs(a / 2); }
function inside(p: Pt[], c: Pt): boolean {
  let x = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i].y > c.y) !== (p[j].y > c.y) && c.x < ((p[j].x - p[i].x) * (c.y - p[i].y)) / (p[j].y - p[i].y) + p[i].x) x = !x;
  return x;
}

export { poly };
