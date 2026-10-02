// Small geometry kit for the doll: points, smooth curves, limb hulls, polygon clipping.

export type Pt = { x: number; y: number };
export type Joint = Pt & { r: number };

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const f = (n: number) => (Math.round(n * 10) / 10).toString();

/** A closed polygon as an SVG path. */
export function poly(pts: Pt[]): string {
  if (!pts.length) return "";
  return `M${pts.map((p) => `${f(p.x)} ${f(p.y)}`).join("L")}Z`;
}

/** An open polyline as an SVG path. */
export function line(pts: Pt[]): string {
  if (!pts.length) return "";
  return `M${pts.map((p) => `${f(p.x)} ${f(p.y)}`).join("L")}`;
}

export function circle(c: Pt, r: number): string {
  return `M${f(c.x - r)} ${f(c.y)}a${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0Z`;
}

export function ellipse(c: Pt, rx: number, ry: number): string {
  return `M${f(c.x - rx)} ${f(c.y)}a${f(rx)} ${f(ry)} 0 1 0 ${f(rx * 2)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-rx * 2)} 0Z`;
}

/** Points along a Catmull-Rom curve through the knots (open, ends included). */
export function spline(knots: Pt[], steps = 8): Pt[] {
  if (knots.length < 3) return knots.slice();
  const out: Pt[] = [];
  for (let i = 0; i < knots.length - 1; i++) {
    const p0 = knots[Math.max(0, i - 1)], p1 = knots[i], p2 = knots[i + 1], p3 = knots[Math.min(knots.length - 1, i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const k = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: k(p0.x, p1.x, p2.x, p3.x), y: k(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push(knots[knots.length - 1]);
  return out;
}

/** Closed Catmull-Rom curve through the knots. */
export function closedSpline(knots: Pt[], steps = 8): Pt[] {
  const n = knots.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = knots[(i - 1 + n) % n], p1 = knots[i], p2 = knots[(i + 1) % n], p3 = knots[(i + 2) % n];
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const k = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: k(p0.x, p1.x, p2.x, p3.x), y: k(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return out;
}

/** The hull of two circles (the body of a tapered limb segment), as a polygon. */
export function hull(a: Joint, b: Joint): Pt[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const th = Math.atan2(dy, dx);
  const al = Math.acos(clamp((a.r - b.r) / d, -1, 1));
  const at = (c: Joint, ang: number) => ({ x: c.x + c.r * Math.cos(ang), y: c.y + c.r * Math.sin(ang) });
  return [at(a, th + al), at(b, th + al), at(b, th - al), at(a, th - al)];
}

/** A limb: hulls between joints plus a round cap at every joint. */
export function limb(chain: Joint[], grow = 0): string[] {
  const js = chain.map((j) => ({ ...j, r: Math.max(0.5, j.r + grow) }));
  const out: string[] = [];
  for (let i = 0; i < js.length - 1; i++) out.push(poly(hull(js[i], js[i + 1])));
  for (const j of js) out.push(circle(j, j.r));
  return out;
}

/** Position and radius a fraction `t` (0..1) of the way along a chain, by length. */
export function along(chain: Joint[], t: number): Joint {
  const lens = chain.slice(1).map((j, i) => Math.hypot(j.x - chain[i].x, j.y - chain[i].y));
  const total = lens.reduce((a, b) => a + b, 0);
  let want = clamp(t, 0, 1) * total;
  for (let i = 0; i < lens.length; i++) {
    if (want <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? clamp(want / lens[i], 0, 1) : 0;
      const a = chain[i], b = chain[i + 1];
      return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), r: lerp(a.r, b.r, k) };
    }
    want -= lens[i];
  }
  return chain[chain.length - 1];
}

/** The part of a chain between fractions t0 and t1 (joints in between kept). */
export function segment(chain: Joint[], t0: number, t1: number): Joint[] {
  const lens = chain.slice(1).map((j, i) => Math.hypot(j.x - chain[i].x, j.y - chain[i].y));
  const total = lens.reduce((a, b) => a + b, 0);
  const out: Joint[] = [along(chain, t0)];
  let acc = 0;
  for (let i = 0; i < lens.length - 1; i++) {
    acc += lens[i];
    const t = acc / total;
    if (t > t0 && t < t1) out.push(chain[i + 1]);
  }
  out.push(along(chain, t1));
  return out;
}

/** Keep the part of a polygon on the side of the line a→b where `side` is positive (Sutherland–Hodgman). */
export function clipPoly(pts: Pt[], a: Pt, b: Pt, side = 1): Pt[] {
  const s = (p: Pt) => side * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const sp = s(p), sq = s(q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      out.push({ x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) });
    }
  }
  return out;
}

/** Mirror a point across the doll's centre line. */
export const mirror = (p: Pt, cx: number): Pt => ({ x: 2 * cx - p.x, y: p.y });

/** A small seeded random generator (same seed, same doll). */
export function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────── colour ─────────

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");

/** Mix two colours (t = share of b). */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a), y = hexToRgb(b);
  return toHex(lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t));
}

/** Shade: toward a cool dark (shadows read better slightly purple than grey). */
export const shade = (c: string, t: number) => mix(c, "#2a1f3d", t);
export const light = (c: string, t: number) => mix(c, "#ffffff", t);
export const luma = (c: string) => { const [r, g, b] = hexToRgb(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
/** The line colour for a fill: a dark version of itself, never lighter than a soft ink. */
export const ink = (c: string) => mix(shade(c, 0.62), "#241a2c", 0.35);
