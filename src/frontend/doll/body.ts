// Bodies: presets are sets of measurements; any body is a blend of them. Every
// drawing (skin, clothes, hair) hangs off the landmarks worked out here.

import { clamp, closedSpline, lerp, limb, spline, type Joint, type Pt } from "./geom.js";

export type Sex = "f" | "m";

export interface Shape {
  height: number;
  head: number;
  neck: number; shoulder: number; chest: number; bust: number; waist: number; hip: number;
  thigh: number; knee: number; calf: number; ankle: number;
  arm: number; fore: number; wrist: number;
  belly: number; muscle: number; jaw: number;
}

const F_BASE: Shape = { height: 1, head: 1, neck: 8.5, shoulder: 39, chest: 32, bust: 0.5, waist: 24, hip: 38, thigh: 15, knee: 9, calf: 10.5, ankle: 5.8, arm: 7, fore: 6, wrist: 4.2, belly: 0, muscle: 0, jaw: 0 };
const M_BASE: Shape = { height: 1.06, head: 1, neck: 11.5, shoulder: 49, chest: 40, bust: 0, waist: 32, hip: 35, thigh: 15, knee: 10, calf: 11.5, ankle: 7, arm: 9, fore: 7.8, wrist: 5.4, belly: 0, muscle: 0.3, jaw: 0.7 };

export const PRESETS: Record<Sex, Record<string, { label: string; shape: Partial<Shape> }>> = {
  f: {
    slim: { label: "Slim", shape: { shoulder: 36, chest: 29, bust: 0.25, waist: 21, hip: 33, thigh: 12.5, knee: 8.2, calf: 9.2, arm: 6, fore: 5.2, wrist: 3.8 } },
    athletic: { label: "Athletic", shape: { shoulder: 42, chest: 34, bust: 0.4, waist: 25, hip: 36, thigh: 15.5, calf: 11.5, arm: 8, fore: 6.8, muscle: 0.6, height: 1.02 } },
    curvy: { label: "Curvy", shape: { shoulder: 39, chest: 33, bust: 1, waist: 23.5, hip: 45, thigh: 18, knee: 10, calf: 11.5, arm: 7.5, fore: 6.3 } },
    heavy: { label: "Heavy", shape: { neck: 10.5, shoulder: 45, chest: 41, bust: 1, waist: 39, hip: 51, thigh: 22, knee: 12.5, calf: 14, ankle: 7, arm: 11, fore: 9, wrist: 5, belly: 0.8 } },
  },
  m: {
    slim: { label: "Slim", shape: { neck: 10, shoulder: 44, chest: 35, waist: 27.5, hip: 31, thigh: 13, knee: 9, calf: 10, arm: 7.8, fore: 6.8, wrist: 4.8, muscle: 0.1 } },
    athletic: { label: "Athletic", shape: { neck: 12, shoulder: 52, chest: 42, waist: 30.5, hip: 34, thigh: 16, calf: 12.5, arm: 10.5, fore: 8.8, muscle: 0.75 } },
    broad: { label: "Broad", shape: { neck: 14, shoulder: 59, chest: 48, waist: 36, hip: 37, thigh: 18.5, knee: 11.5, calf: 14, ankle: 8, arm: 13, fore: 10.5, wrist: 6.2, muscle: 1, height: 1.08 } },
    heavy: { label: "Heavy", shape: { neck: 14, shoulder: 54, chest: 48, waist: 47, hip: 46, thigh: 20.5, knee: 12, calf: 13.5, ankle: 8, arm: 12, fore: 10, belly: 1, muscle: 0.1 } },
  },
};

export interface BodyPick { sex: Sex; preset: string; blend?: { preset: string; amount: number }; height?: number }

/** The measurements for a preset, optionally blended toward a second one. */
export function shapeOf(b: BodyPick): Shape {
  const base = b.sex === "m" ? M_BASE : F_BASE;
  const set = PRESETS[b.sex];
  const a: Shape = { ...base, ...(set[b.preset] ?? Object.values(set)[0]).shape };
  let s = a;
  if (b.blend && set[b.blend.preset]) {
    const c: Shape = { ...base, ...set[b.blend.preset].shape };
    const t = clamp(b.blend.amount, 0, 1);
    s = Object.fromEntries(Object.keys(a).map((k) => [k, lerp(a[k as keyof Shape], c[k as keyof Shape], t)])) as unknown as Shape;
  }
  if (b.height) s = { ...s, height: s.height * clamp(b.height, 0.85, 1.15) };
  return s;
}

/** Every landmark the drawings use. x is the centre line; right-side numbers are offsets from it. */
export interface Body {
  sex: Sex;
  s: Shape;
  cx: number;
  /** Feet stand here. */
  ground: number;
  head: { c: Pt; rx: number; ry: number };
  neckTop: number; neckBot: number;
  shoulderY: number; armpitY: number; bustY: number; underY: number; waistY: number; hipY: number; crotchY: number;
  /** The right half of the trunk's outline, neck to crotch (x offsets from the centre). */
  profile: Pt[];
  /** Right arm, shoulder to wrist; and the hand. */
  arm: Joint[]; hand: { c: Pt; rx: number; ry: number; angle: number };
  /** Right leg, hip to ankle; and the foot. */
  leg: Joint[]; foot: { c: Pt; rx: number; ry: number };
  /** Breasts (right one), when there are any to speak of. */
  breast: Joint | null;
  /** The y of a fraction along the leg (0 hip, 1 ankle). */
  legY(t: number): number;
}

const CX = 120;
const GROUND = 522;

export function buildBody(pick: BodyPick): Body {
  const s = shapeOf(pick);
  const H = s.height;
  // Vertical layout for an average body, measured up from the ground.
  const Y = (v: number) => GROUND - (GROUND - v) * H;
  // Head size stays put as the body grows, so taller bodies read as more grown-up.
  const headRy = 33.5 * s.head * (pick.sex === "m" ? 1.02 : 1);
  const headRx = 28 * s.head * (pick.sex === "m" ? 1.04 : 1);
  const head = { c: { x: CX, y: Y(70) }, rx: headRx, ry: headRy };
  const neckTop = head.c.y + headRy * 0.62;
  const neckBot = Y(118);
  const shoulderY = Y(126);
  const armpitY = Y(148);
  const bustY = Y(165);
  const underY = Y(182);
  const waistY = Y(214);
  const hipY = Y(252);
  const crotchY = Y(284);
  const kneeY = Y(392);
  const ankleY = Y(486);

  const belly = s.belly;
  const prof: Pt[] = [
    { x: s.neck, y: neckBot - 4 },
    { x: s.neck + 1.5, y: neckBot },
    { x: lerp(s.neck, s.shoulder, 0.62), y: shoulderY - 3 },
    { x: s.shoulder, y: shoulderY + 7 },
    { x: s.chest + 1 + s.muscle * 2, y: armpitY + 2 },
    { x: s.chest + s.bust * 3 + s.muscle * 1.5, y: bustY },
    { x: lerp(s.chest, s.waist, 0.35) + belly * 6, y: underY },
    { x: s.waist + belly * 5, y: waistY },
    { x: lerp(s.waist, s.hip, 0.75) + belly * 3, y: lerp(waistY, hipY, 0.55) },
    { x: s.hip, y: hipY },
    { x: s.hip - 2.5, y: crotchY - 6 },
  ];
  const profile = spline(prof, 10).map((p) => ({ x: p.x, y: p.y }));

  // Arm hangs a little away from the body (an A-pose), so sleeves read clearly.
  const sj: Joint = { x: CX + s.shoulder - s.arm * 0.75, y: shoulderY + s.arm * 0.95, r: s.arm + s.muscle * 1.2 };
  const elbowY = Y(216), wristY = Y(282);
  const spread = 8 + s.hip * 0.18 + belly * 6;
  const arm: Joint[] = [
    sj,
    { x: sj.x + spread * 0.4, y: lerp(sj.y, elbowY, 0.45), r: s.arm * 0.98 + s.muscle * 1.6 },
    { x: sj.x + spread * 0.78, y: elbowY, r: s.fore * 0.92 },
    { x: sj.x + spread * 0.95, y: lerp(elbowY, wristY, 0.35), r: s.fore + s.muscle * 0.6 },
    { x: sj.x + spread * 1.12, y: wristY, r: s.wrist },
  ];
  const w = arm[arm.length - 1];
  const handLen = 16 * H;
  const hand = { c: { x: w.x + 2.5, y: w.y + handLen }, rx: s.wrist * 1.55, ry: handLen * 1.05, angle: -7 };

  // Thighs fill the hips: they meet (or nearly) at the crotch and taper to the knee.
  const thighR = Math.max(s.thigh, (s.hip - (pick.sex === "m" ? 4 : 1.5)) / 2);
  const legX = s.hip - thighR;
  const kneeX = legX - thighR * 0.28 + s.knee * 0.3;
  const leg: Joint[] = [
    { x: CX + legX, y: hipY - 2, r: thighR },
    { x: CX + lerp(legX, kneeX, 0.45), y: lerp(hipY, kneeY, 0.42), r: lerp(thighR, s.knee, 0.4) },
    { x: CX + kneeX, y: kneeY, r: s.knee },
    { x: CX + kneeX + 0.5, y: lerp(kneeY, ankleY, 0.3), r: s.calf },
    { x: CX + kneeX + 1.5, y: lerp(kneeY, ankleY, 0.72), r: lerp(s.calf, s.ankle, 0.65) },
    { x: CX + kneeX + 2.5, y: ankleY, r: s.ankle },
  ];
  const foot = { c: { x: CX + kneeX + 5, y: GROUND - 10 }, rx: s.ankle * 1.45 + 1.5, ry: 12 };
  const breast = pick.sex === "f" && s.bust > 0.05 ? { x: CX + s.chest * 0.46, y: bustY + 2, r: 8 + s.bust * 8.5 } : null;
  const legY = (t: number) => lerp(hipY, ankleY, t);
  return { sex: pick.sex, s, cx: CX, ground: GROUND, head, neckTop, neckBot, shoulderY, armpitY, bustY, underY, waistY, hipY, crotchY, profile, arm, hand, leg, foot, breast, legY };
}

/** Half-width of the trunk at a height (x offset), from the profile. */
export function widthAt(b: Body, y: number): number {
  const p = b.profile;
  if (y <= p[0].y) return p[0].x;
  for (let i = 1; i < p.length; i++) {
    if (p[i].y >= y) {
      const t = (y - p[i - 1].y) / (p[i].y - p[i - 1].y || 1);
      return lerp(p[i - 1].x, p[i].x, t);
    }
  }
  return p[p.length - 1].x;
}

/** The left-side copy of a right-side chain. */
export const mirrorChain = (b: Body, c: Joint[]): Joint[] => c.map((j) => ({ ...j, x: 2 * b.cx - j.x }));

/**
 * A slice of the trunk between two heights, grown by `grow`, as a closed outline.
 * `top` replaces the straight top edge (points left to right); `maxW` caps the width
 * (sleeveless tops stop short of the shoulder).
 */
export function trunkSlice(b: Body, y0: number, y1: number, grow = 0, opts: { maxW?: (y: number) => number; flare?: number; hemDip?: number; top?: Pt[] } = {}): Pt[] {
  const ys: number[] = [y0];
  for (const p of b.profile) if (p.y > y0 && p.y < y1) ys.push(p.y);
  ys.push(y1);
  const span = Math.max(1, y1 - y0);
  const wAt = (y: number) => {
    let w = widthAt(b, y) + grow;
    if (opts.maxW) w = Math.min(w, opts.maxW(y));
    if (opts.flare) w += opts.flare * Math.max(0, (y - y0) / span) ** 1.5 * 10;
    return w;
  };
  const right = ys.map((y) => ({ x: b.cx + wAt(y), y }));
  const left = ys.map((y) => ({ x: b.cx - wAt(y), y })).reverse();
  const dip = opts.hemDip ?? 0;
  const hem = dip ? [{ x: b.cx, y: y1 + dip }] : [];
  return [...(opts.top ?? [left[left.length - 1], right[0]]).slice(), ...right.slice(1), ...hem, ...left.slice(0, -1)];
}

/** The trunk's outline from the neck down to the crotch (skin), closed with a soft V. */
export function trunkOutline(b: Body): Pt[] {
  const pts = trunkSlice(b, b.profile[0].y, b.crotchY - 6);
  return [...pts.slice(0, pts.length), ...[]];
}

export function bodyShapes(b: Body): { trunk: string[]; limbs: string[] } {
  return { trunk: [], limbs: limb(b.arm) };
}

/** A loose closed blob through knots (used for hands, feet, hair masses). */
export const blob = closedSpline;
