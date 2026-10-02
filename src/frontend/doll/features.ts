// Head, face, hair, ears, tails and horns.

import type { Body } from "./body.js";
import { blob } from "./body.js";
import { clamp, closedSpline, ellipse, f, ink, lerp, light, line, mix, poly, shade, spline, type Pt } from "./geom.js";

export const HAIR_STYLES = ["long", "bob", "ponytail", "twintails", "short", "spiky", "messy", "bun", "buzz"] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export const EARS = ["cat", "fox", "wolf", "bunny", "elf"] as const;
export type Ears = (typeof EARS)[number];
export const TAILS = ["fox", "cat", "wolf", "demon", "kitsune"] as const;
export type Tail = (typeof TAILS)[number];
export const HORNS = ["small", "ram", "oni"] as const;
export type Horns = (typeof HORNS)[number];
export const EXPRESSIONS = ["neutral", "smile", "serious", "surprised", "smug"] as const;
export type Expression = (typeof EXPRESSIONS)[number];

/** Head-local point: u, v in head radii from the head's centre. */
export const P = (b: Body, u: number, v: number): Pt => ({ x: b.head.c.x + u * b.head.rx, y: b.head.c.y + v * b.head.ry });

/** A tapered strand along a curve: hair locks, tails, horns. Angles in degrees (0 = right, 90 = down). */
export function strand(root: Pt, o: { angle: number; bend: number; length: number; width: number; peak?: number; tip?: number; base?: number; wave?: number; t0?: number; t1?: number }): Pt[] {
  const N = 28;
  const t0 = o.t0 ?? 0, t1 = o.t1 ?? 1;
  const peak = o.peak ?? 0.35, tipW = o.tip ?? 0, baseW = o.base ?? 0.7;
  const centre: Pt[] = [];
  const ang: number[] = [];
  let p = { ...root };
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = ((o.angle + o.bend * t + (o.wave ? Math.sin(t * Math.PI * 2) * o.wave : 0)) * Math.PI) / 180;
    centre.push({ ...p }); ang.push(a);
    p = { x: p.x + Math.cos(a) * (o.length / N), y: p.y + Math.sin(a) * (o.length / N) };
  }
  const width = (t: number) => {
    const k = t < peak ? lerp(baseW, 1, Math.sin((t / peak) * Math.PI / 2)) : lerp(1, tipW, ((t - peak) / (1 - peak)) ** 1.4);
    return (o.width / 2) * k;
  };
  const L: Pt[] = [], R: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    if (t < t0 - 1e-9 || t > t1 + 1e-9) continue;
    const a = ang[i], w = width(t), c = centre[i];
    L.push({ x: c.x + Math.cos(a - Math.PI / 2) * w, y: c.y + Math.sin(a - Math.PI / 2) * w });
    R.push({ x: c.x + Math.cos(a + Math.PI / 2) * w, y: c.y + Math.sin(a + Math.PI / 2) * w });
  }
  return [...L, ...R.reverse()];
}

/** A jagged edge of hair tips between two points, bulging toward `dir`. */
function tips(a: Pt, b: Pt, n: number, depth: number, seed: number, dirY = 1): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n * 2; i++) {
    const t = i / (n * 2);
    const tipish = i % 2 === 1;
    const jitter = Math.sin(seed + i * 2.3) * 0.35 + 1;
    out.push({ x: lerp(a.x, b.x, t) + (tipish ? Math.sin(seed + i) * 1.5 : 0), y: lerp(a.y, b.y, t) + (tipish ? depth * jitter * dirY : 0) });
  }
  return out;
}

export interface Paint { fill: string; line: string; d: string[]; extra?: string; clip?: boolean }

/** Head shape (skin). */
export function headPath(b: Body): string {
  const j = b.s.jaw;
  const k: [number, number][] = [[0, -1], [0.72, -0.8], [1, -0.18], [0.97, 0.3], [0.72 + j * 0.12, 0.72], [0.3 + j * 0.12, 0.97], [0, 1.02]];
  const pts = [...k, ...k.slice(1, -1).reverse().map(([u, v]) => [-u, v] as [number, number])].map(([u, v]) => P(b, u, v));
  return poly(closedSpline(pts, 8));
}

export function neckPath(b: Body): string {
  const n = b.s.neck;
  return poly([{ x: b.cx - n * 0.85, y: b.neckTop - 8 }, { x: b.cx + n * 0.85, y: b.neckTop - 8 }, { x: b.cx + n * 1.02, y: b.neckBot + 2 }, { x: b.cx - n * 1.02, y: b.neckBot + 2 }]);
}

export function earPath(b: Body, side: 1 | -1, elf: boolean): string {
  const base = P(b, side * 0.94, 0.12);
  if (elf) {
    return poly(spline([P(b, side * 0.9, -0.1), { x: base.x + side * b.head.rx * 0.75, y: base.y - b.head.ry * 0.42 }, P(b, side * 1.02, 0.25), P(b, side * 0.92, 0.36)], 6));
  }
  return poly(closedSpline([P(b, side * 0.92, -0.05), P(b, side * 1.12, 0.02), P(b, side * 1.1, 0.3), P(b, side * 0.93, 0.36)], 6));
}

export function face(b: Body, eyes: string, expr: Expression, skin: string, lineC: string): string {
  const fem = b.sex === "f";
  const ew = b.head.rx * (fem ? 0.36 : 0.32), eh = b.head.ry * (fem ? 0.27 : 0.18);
  const ey = b.head.c.y + b.head.ry * 0.2;
  const dark = mix(eyes, "#120c1c", 0.55);
  const lash = "#231827";
  const parts: string[] = [];
  for (const side of [-1, 1] as const) {
    const ex = b.head.c.x + side * b.head.rx * 0.42;
    const inner = ex - side * ew * 0.95, outer = ex + side * ew * 0.95;
    const top = ey - eh * (expr === "surprised" ? 0.62 : 0.5);
    const bottom = ey + eh * 0.5;
    const narrow = expr === "serious" || expr === "smug" ? 0.25 : 0;
    const t = top + eh * narrow;
    // white of the eye
    parts.push(`<path d="${poly(spline([{ x: inner, y: ey + eh * 0.05 }, { x: ex, y: t - eh * 0.04 }, { x: outer, y: ey - eh * 0.1 }, { x: outer - side * ew * 0.15, y: bottom - eh * 0.1 }, { x: ex, y: bottom }, { x: inner, y: ey + eh * 0.15 }], 5))}" fill="#fbf8ff"/>`);
    // iris and pupil, clipped by the lids by being drawn inside them
    const ir = ew * (fem ? 0.6 : 0.55);
    const irY = ey + eh * 0.06;
    parts.push(`<ellipse cx="${f(ex)}" cy="${f(irY)}" rx="${f(ir)}" ry="${f(eh * 0.58)}" fill="${eyes}"/>`);
    parts.push(`<ellipse cx="${f(ex)}" cy="${f(irY - eh * 0.18)}" rx="${f(ir)}" ry="${f(eh * 0.34)}" fill="${dark}" opacity=".55"/>`);
    parts.push(`<ellipse cx="${f(ex)}" cy="${f(irY + eh * 0.04)}" rx="${f(ir * 0.42)}" ry="${f(eh * 0.3)}" fill="#120c1c"/>`);
    parts.push(`<ellipse cx="${f(ex - side * ir * 0.38)}" cy="${f(irY - eh * 0.2)}" rx="${f(ir * 0.3)}" ry="${f(eh * 0.17)}" fill="#fff"/>`);
    parts.push(`<circle cx="${f(ex + side * ir * 0.35)}" cy="${f(irY + eh * 0.26)}" r="${f(ir * 0.13)}" fill="#fff" opacity=".85"/>`);
    // cover what's outside the lids with skin (keeps the iris inside the eye shape)
    parts.push(`<path d="M${f(inner - 3 * side)} ${f(t - eh)}L${f(outer + side * 3)} ${f(t - eh)}L${f(outer + side * 3)} ${f(ey - eh * 0.18)}Q${f(ex)} ${f(t - eh * 0.62)} ${f(inner - 1 * side)} ${f(ey + eh * 0.04)}Z" fill="${skin}"/>`);
    // upper lash line, thicker toward the outer corner
    const lashW = fem ? 2.6 : 2;
    parts.push(`<path d="M${f(inner)} ${f(ey + eh * 0.02)}Q${f(ex)} ${f(t - eh * 0.62)} ${f(outer + side * 1.5)} ${f(ey - eh * 0.2)}" stroke="${lash}" stroke-width="${lashW}" fill="none" stroke-linecap="round"/>`);
    if (fem) parts.push(`<path d="M${f(outer - side * 1)} ${f(ey - eh * 0.2)}l${f(side * 4)} ${f(-2.5)}" stroke="${lash}" stroke-width="1.6" stroke-linecap="round"/>`);
    parts.push(`<path d="M${f(ex - side * ew * 0.2)} ${f(bottom + 0.5)}Q${f(ex + side * ew * 0.4)} ${f(bottom + 0.8)} ${f(outer - side * ew * 0.1)} ${f(ey + eh * 0.25)}" stroke="${lineC}" stroke-width=".9" fill="none" opacity=".7"/>`);
    // brow
    const by = top - eh * (expr === "surprised" ? 1.25 : 0.95) - (fem ? 1.5 : 0);
    const tilt = expr === "serious" ? 3.5 : expr === "smug" ? (side === 1 ? -2 : 1.5) : -0.5;
    parts.push(`<path d="M${f(ex - side * ew * 0.85)} ${f(by + tilt)}Q${f(ex - side * ew * 0.1)} ${f(by - 3)} ${f(ex + side * ew * 1.0)} ${f(by + 2.5 - tilt * 0.3)}" stroke="${lineC}" stroke-width="${fem ? 1.3 : 2.1}" fill="none" stroke-linecap="round"/>`);
  }
  // blush
  if (fem) for (const side of [-1, 1]) parts.push(`<ellipse cx="${f(b.head.c.x + side * b.head.rx * 0.52)}" cy="${f(ey + eh * 1.05)}" rx="${f(b.head.rx * 0.17)}" ry="${f(b.head.ry * 0.06)}" fill="#ff7b9c" opacity=".22"/>`);
  // nose
  const ny = b.head.c.y + b.head.ry * 0.5;
  parts.push(`<path d="M${f(b.head.c.x + 0.5)} ${f(ny - 3)}l${f(1.6)} ${f(3.6)}l${f(-2.2)} ${f(0.6)}" stroke="${shade(skin, 0.35)}" stroke-width="1" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
  // mouth
  const my = b.head.c.y + b.head.ry * 0.71, mw = b.head.rx * (fem ? 0.17 : 0.22);
  const mouth = {
    neutral: `M${f(b.head.c.x - mw)} ${f(my)}Q${f(b.head.c.x)} ${f(my + 1.6)} ${f(b.head.c.x + mw)} ${f(my)}`,
    smile: `M${f(b.head.c.x - mw * 1.2)} ${f(my - 1.5)}Q${f(b.head.c.x)} ${f(my + 4.5)} ${f(b.head.c.x + mw * 1.2)} ${f(my - 1.5)}`,
    serious: `M${f(b.head.c.x - mw)} ${f(my + 0.5)}L${f(b.head.c.x + mw)} ${f(my + 0.3)}`,
    surprised: "",
    smug: `M${f(b.head.c.x - mw)} ${f(my + 0.5)}Q${f(b.head.c.x + mw * 0.3)} ${f(my + 1.5)} ${f(b.head.c.x + mw * 1.2)} ${f(my - 2)}`,
  }[expr];
  if (expr === "surprised") parts.push(`<ellipse cx="${f(b.head.c.x)}" cy="${f(my + 1)}" rx="${f(mw * 0.45)}" ry="${f(mw * 0.6)}" fill="#7a2a3a" stroke="${lineC}" stroke-width="1"/>`);
  else parts.push(`<path d="${mouth}" stroke="${lineC}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`);
  return parts.join("");
}

// ───────── hair ─────────

export interface HairLayers { back: string[]; front: string[]; extra: string[] }

/** The hair, as shapes behind the body and in front of the face. `length` 0..1 stretches long styles. */
export function hair(b: Body, style: HairStyle, length = 0.6): HairLayers {
  const rx = b.head.rx, ry = b.head.ry;
  const out: HairLayers = { back: [], front: [], extra: [] };
  const fem = b.sex === "f";
  // The cap over the top of the head, ending in bangs along the forehead.
  const cap = (bang: "full" | "side" | "short" | "none" | "spiky", sideDown: number) => {
    const arcK = [P(b, -1.04, sideDown), P(b, -1.13, -0.25), P(b, -0.98, -0.82), P(b, -0.55, -1.14), P(b, 0, -1.2), P(b, 0.55, -1.14), P(b, 0.98, -0.82), P(b, 1.13, -0.25), P(b, 1.04, sideDown)];
    let top = spline(arcK, 8);
    if (bang === "spiky") {
      // Spikes standing up along the crown.
      top = [];
      const n = 7;
      for (let i = 0; i <= n * 2; i++) {
        const a = Math.PI + (i / (n * 2)) * Math.PI;
        const r = i % 2 ? 1.42 + Math.sin(i * 1.7) * 0.1 : 1.08;
        top.push(P(b, Math.cos(a) * r * 1.05, Math.sin(a) * r * 0.98 - 0.12));
      }
      top.unshift(P(b, -1.04, sideDown)); top.push(P(b, 1.04, sideDown));
    }
    const sideTip = (s: 1 | -1) => P(b, s * 0.92, sideDown + 0.12);
    let bottom: Pt[];
    switch (bang) {
      case "full": bottom = tips(P(b, 0.9, 0.0), P(b, -0.9, 0.0), 6, ry * 0.12, 3); bottom = bottom.map((p) => ({ x: p.x, y: p.y - ry * 0.12 * (1 - Math.abs((p.x - b.head.c.x) / rx)) })); break;
      case "side": bottom = [P(b, 0.92, -0.1), P(b, 0.55, -0.45), P(b, 0.3, -0.2), P(b, 0.05, -0.5), P(b, -0.35, -0.12), P(b, -0.55, -0.3), P(b, -0.85, 0.15)]; break;
      case "spiky": bottom = tips(P(b, 0.9, -0.25), P(b, -0.9, -0.25), 5, ry * 0.25, 1.5); break;
      case "short": bottom = tips(P(b, 0.9, -0.35), P(b, -0.9, -0.35), 6, ry * 0.12, 2); break;
      default: bottom = spline([P(b, 0.92, -0.3), P(b, 0.5, -0.62), P(b, 0, -0.68), P(b, -0.5, -0.62), P(b, -0.92, -0.3)], 6);
    }
    return poly([...top, sideTip(1), ...bottom, sideTip(-1)]);
  };
  const lockPair = (len: number, width: number, wave = 0) => [-1, 1].map((s) => poly(strand(P(b, s * 0.95, -0.15), { angle: 90 - s * 4, bend: s * 6, length: len, width, peak: 0.25, tip: 0.05, base: 0.9, wave })));
  const back = (bottomY: number, halfW: number, jag = 8) => {
    const L = P(b, -1.12, -0.5), R = P(b, 1.12, -0.5);
    const side = (s: 1 | -1) => spline([P(b, s * 1.12, -0.5), P(b, s * 1.25, 0.4), { x: b.cx + s * halfW, y: lerp(b.head.c.y + ry, bottomY, 0.55) }, { x: b.cx + s * halfW * 0.92, y: bottomY - 4 }], 8);
    const r = side(1), l = side(-1).reverse();
    const crown = spline([L, P(b, -0.6, -1.15), P(b, 0, -1.22), P(b, 0.6, -1.15), R], 8);
    const bottom = tips({ x: b.cx + halfW * 0.92, y: bottomY - 4 }, { x: b.cx - halfW * 0.92, y: bottomY - 4 }, jag, 10, 5);
    return poly([...crown, ...r.slice(1), ...bottom, ...l.slice(1)]);
  };
  const lenY = (t: number) => lerp(b.shoulderY + 10, b.hipY + 10, t);
  switch (style) {
    case "long":
      out.back.push(back(lenY(clamp(length, 0.3, 1)), b.s.shoulder * 0.95 + 4, 7));
      out.front.push(cap("full", 0.3), ...lockPair((lenY(clamp(length, 0.3, 1)) - b.head.c.y) * 0.62, rx * 0.42, 6));
      break;
    case "bob":
      out.back.push(back(b.head.c.y + ry * 1.25, rx * 1.38, 6));
      out.front.push(cap("full", 0.75));
      break;
    case "messy":
      out.back.push(back(lenY(0.12), rx * 1.5, 6));
      out.front.push(cap("side", 0.5), ...lockPair(ry * 1.2, rx * 0.36, 10));
      break;
    case "ponytail": {
      out.back.push(back(b.head.c.y + ry * 0.7, rx * 1.15, 4));
      out.back.push(poly(strand(P(b, 0.55, -0.85), { angle: 20, bend: 95, length: 60 + 130 * clamp(length, 0.2, 1), width: rx * 0.85, peak: 0.3, tip: 0.05, wave: 8 })));
      out.front.push(cap("side", 0.35));
      out.extra.push(`tie:${f(P(b, 0.8, -0.8).x)},${f(P(b, 0.8, -0.8).y)}`);
      break;
    }
    case "twintails":
      out.back.push(back(b.head.c.y + ry * 0.75, rx * 1.15, 4));
      for (const s of [-1, 1] as const) out.back.push(poly(strand(P(b, s * 0.85, -0.7), { angle: 90 - s * 48, bend: s * 40, length: 70 + 140 * clamp(length, 0.2, 1), width: rx * 0.8, peak: 0.35, tip: 0.04, wave: 7, base: 0.5 })));
      out.front.push(cap("full", 0.3));
      break;
    case "bun":
      out.back.push(back(b.head.c.y + ry * 0.6, rx * 1.12, 4));
      out.front.push(cap("side", 0.25));
      out.front.push(ellipse(P(b, 0, -1.25), rx * 0.48, ry * 0.36));
      break;
    case "short":
      out.back.push(back(b.head.c.y + ry * (fem ? 0.75 : 0.45), rx * 1.12, 5));
      out.front.push(cap("short", fem ? 0.35 : 0.0));
      break;
    case "spiky":
      out.back.push(back(b.head.c.y + ry * 0.5, rx * 1.15, 5));
      out.front.push(cap("spiky", 0.0));
      break;
    case "buzz":
      out.front.push(cap("none", -0.15));
      break;
  }
  return out;
}

// ───────── ears, tails, horns ─────────

export function animalEars(b: Body, kind: Ears, colour: string): { fill: string; inner: string; outer: string[]; innerD: string[]; tipD: string[] } | null {
  if (kind === "elf") return null;
  const rx = b.head.rx, ry = b.head.ry;
  const outer: string[] = [], innerD: string[] = [], tipD: string[] = [];
  for (const s of [-1, 1] as const) {
    if (kind === "bunny") {
      const root = P(b, s * 0.38, -0.95);
      outer.push(poly(strand(root, { angle: -90 + s * 12, bend: s * 14, length: ry * 1.75, width: rx * 0.46, peak: 0.55, tip: 0.35, base: 0.6 })));
      innerD.push(poly(strand({ x: root.x, y: root.y - ry * 0.25 }, { angle: -90 + s * 12, bend: s * 14, length: ry * 1.35, width: rx * 0.22, peak: 0.6, tip: 0.3, base: 0.4 })));
      continue;
    }
    const big = kind === "fox" ? 1.15 : kind === "wolf" ? 1.05 : 0.85;
    const a = P(b, s * 0.2, -1.0), c = P(b, s * 0.98, -0.62);
    const tipP = P(b, s * (0.78 + 0.1 * big), -1.0 - 0.72 * big);
    const ear = spline([a, { x: lerp(a.x, tipP.x, 0.55) - s * 2, y: lerp(a.y, tipP.y, 0.6) }, tipP, { x: lerp(c.x, tipP.x, 0.5) + s * 2, y: lerp(c.y, tipP.y, 0.5) }, c], 6);
    outer.push(poly(ear));
    const k = 0.58;
    const ctr = { x: (a.x + c.x + tipP.x) / 3, y: (a.y + c.y + tipP.y) / 3 + 3 };
    innerD.push(poly(ear.map((p) => ({ x: ctr.x + (p.x - ctr.x) * k, y: ctr.y + (p.y - ctr.y) * k }))));
    if (kind === "fox" || kind === "wolf") tipD.push(poly([tipP, ...ear.filter((p) => p.y < tipP.y + ry * 0.3 * big)].sort((p, q) => p.x - q.x)));
  }
  const inner = kind === "cat" || kind === "bunny" ? "#f6a7b8" : kind === "fox" ? "#fff6ec" : light(colour, 0.45);
  return { fill: colour, inner, outer, innerD, tipD };
}

export function tail(b: Body, kind: Tail, colour: string): { main: string[]; tip: string[]; tipColour: string } {
  const root = { x: b.cx + b.s.hip * 0.3, y: b.hipY - 4 };
  const main: string[] = [], tip: string[] = [];
  const add = (o: Parameters<typeof strand>[1], r = root, tipFrom = 0.78) => { main.push(poly(strand(r, o))); if (tipFrom < 1) tip.push(poly(strand(r, { ...o, t0: tipFrom }))); };
  switch (kind) {
    case "fox": add({ angle: 30, bend: -105, length: 150, width: 58, peak: 0.55, tip: 0.02, base: 0.25 }); break;
    case "kitsune":
      for (const [a, bend, len, dx] of [[35, -130, 140, 0.3], [-170, 105, 150, -0.3], [8, -95, 155, 0.3]] as const) add({ angle: a, bend, length: len, width: 48, peak: 0.55, tip: 0.02, base: 0.25 }, { x: b.cx + b.s.hip * dx, y: b.hipY - 4 });
      break;
    case "wolf": add({ angle: 55, bend: -50, length: 140, width: 40, peak: 0.5, tip: 0.05, base: 0.35 }, root, 0.85); break;
    case "cat": add({ angle: 40, bend: -150, length: 170, width: 11, peak: 0.1, tip: 0.6, base: 0.9, wave: 18 }, root, 1); break;
    case "demon": {
      add({ angle: 40, bend: -120, length: 160, width: 7, peak: 0.1, tip: 0.5, base: 1, wave: 15 }, root, 1);
      const pts = strand(root, { angle: 40, bend: -120, length: 160, width: 7, wave: 15 });
      const end = pts[Math.floor(pts.length / 2) - 1];
      main.push(poly([{ x: end.x, y: end.y + 2 }, { x: end.x - 11, y: end.y - 6 }, { x: end.x + 1, y: end.y - 20 }, { x: end.x + 11, y: end.y - 4 }]));
      break;
    }
  }
  const tipColour = kind === "fox" || kind === "kitsune" ? "#fff8f0" : kind === "wolf" ? light(colour, 0.55) : colour;
  return { main, tip, tipColour };
}

export function horns(b: Body, kind: Horns): string[] {
  const out: string[] = [];
  for (const s of [-1, 1] as const) {
    if (kind === "ram") out.push(poly(strand(P(b, s * 0.62, -0.85), { angle: -90 + s * 70, bend: s * 300, length: b.head.rx * 2.2, width: b.head.rx * 0.38, peak: 0.05, tip: 0.25, base: 1 })));
    else if (kind === "oni") out.push(poly(strand(P(b, s * 0.35, -0.98), { angle: -90 + s * 8, bend: s * -8, length: b.head.ry * 0.6, width: b.head.rx * 0.26, peak: 0.05, tip: 0.05, base: 1 })));
    else out.push(poly(strand(P(b, s * 0.5, -0.92), { angle: -90 + s * 35, bend: s * 40, length: b.head.ry * 0.75, width: b.head.rx * 0.22, peak: 0.05, tip: 0.04, base: 1 })));
  }
  return out;
}

export { blob, ink, line };
