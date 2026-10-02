// Assemble a doll: back to front, every shape drawn as one outlined silhouette
// (outline pass, fill pass), then a cel shade and the lines on top.

import { type Body, type BodyPick, buildBody } from "./body.js";
import { build, type Built, type Garment, LAYER, skinShapes, tears } from "./garments.js";
import { animalEars, earPath, type Ears, type Expression, face, hair, type HairStyle, headPath, horns, type Horns, neckPath, tail, type Tail } from "./features.js";
import { f, ink, light, mix, poly, rng, shade, type Pt } from "./geom.js";
import { patternDef } from "./patterns.js";

export interface Look {
  body: BodyPick;
  skin: string;
  hair: { style: HairStyle; colour: string; length?: number };
  eyes: string;
  expression?: Expression;
  ears?: Ears | null;
  earColour?: string;
  tail?: Tail | null;
  tailColour?: string;
  horns?: Horns | null;
  outfit: Garment[];
  /** Draw plain underwear where nothing covers the trunk (on by default). */
  modest?: boolean;
}

let seq = 0;

const LW = 1.25;

export function renderDoll(look: Look, opts: { id?: string; width?: number; height?: number; crop?: "full" | "bust" } = {}): string {
  const uid = opts.id ?? `wd${++seq}`;
  const b = buildBody(look.body);
  const defs: string[] = [];
  const g: string[] = [];
  let n = 0;
  const id = (k: string) => `${uid}-${k}${++n}`;

  /** Fill a set of shapes as one silhouette with an outline, optional pattern and cel shade. */
  const paint = (shapes: (Pt[] | string)[], fill: string, o: { line?: string; lw?: number; pattern?: string; shadeAmt?: number; opacity?: number; mask?: string; sheer?: boolean; gloss?: boolean; noOutline?: boolean } = {}) => {
    const ds = shapes.map((s) => (typeof s === "string" ? s : poly(s))).filter(Boolean);
    if (!ds.length) return;
    const lc = o.line ?? ink(fill);
    const lw = o.lw ?? LW;
    const paths = (attrs = "") => ds.map((d) => `<path d="${d}"${attrs}/>`).join("");
    const parts: string[] = [];
    if (!o.noOutline) parts.push(`<g fill="${lc}" stroke="${lc}" stroke-width="${f(lw * 2)}" stroke-linejoin="round"${o.sheer ? ' opacity=".55"' : ""}>${paths()}</g>`);
    if (!o.sheer) parts.push(`<g fill="${fill}">${paths()}</g>`);
    else parts.push(`<g fill="${fill}" opacity="${o.pattern ? 0.08 : 0.45}">${paths()}</g>`);
    if (o.pattern) parts.push(`<g fill="url(#${o.pattern})">${paths()}</g>`);
    if ((o.shadeAmt ?? 0.22) > 0 && !o.sheer) {
      const m = id("sh");
      defs.push(`<mask id="${m}" maskUnits="userSpaceOnUse" x="-50" y="-50" width="340" height="640"><g fill="#fff">${paths()}</g><g fill="#000" transform="translate(-4.5 -3.5)">${paths()}</g></mask>`);
      parts.push(`<g fill="${shade(fill, o.shadeAmt ?? 0.22)}" mask="url(#${m})">${paths()}</g>`);
    }
    if (o.gloss) {
      const m = id("gl");
      defs.push(`<mask id="${m}" maskUnits="userSpaceOnUse" x="-50" y="-50" width="340" height="640"><g fill="#fff">${paths()}</g><g fill="#000" transform="translate(2.5 2)">${paths()}</g></mask>`);
      parts.push(`<g fill="${light(fill, 0.55)}" opacity=".7" mask="url(#${m})">${paths()}</g>`);
    }
    g.push(`<g${o.opacity !== undefined ? ` opacity="${o.opacity}"` : ""}${o.mask ? ` mask="url(#${o.mask})"` : ""}>${parts.join("")}</g>`);
  };
  const stroke = (d: string, c: string, w = 1, extra = "") => g.push(`<path d="${d}" fill="none" stroke="${c}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`);

  const skin = look.skin, skinLine = ink(skin);
  const hairC = look.hair.colour;

  // Clothes first (as data), so we know what's covered.
  const outfit = [...look.outfit].sort((a, c) => LAYER[a.kind] - LAYER[c.kind]);
  const covers = (k: string[]) => outfit.some((x) => k.includes(x.kind));
  const auto: Garment[] = [];
  if (look.modest !== false) {
    if (b.sex === "f" && !covers(["top", "dress", "robe", "bra", "armor"]) && !outfit.some((x) => x.kind === "outer" && x.open === false)) auto.push({ kind: "bra", colour: "#e9e4ef" });
    if (!covers(["bottom", "dress", "robe", "briefs"]) && !outfit.some((x) => x.kind === "legwear" && x.style === "tights" && x.material !== "sheer")) auto.push({ kind: "briefs", colour: "#e9e4ef" });
  }
  // Boots go over trouser legs (tucked in); everything else by its kind.
  const order = (x: Garment) => (x.kind === "shoes" && x.style === "boots" ? 33 : LAYER[x.kind]);
  const all = [...auto, ...outfit].sort((a, c) => order(a) - order(c));
  const built = all.map((x, i) => ({ g: x, bt: build(b, x), i }));
  const hatHidesHair = built.some((x) => x.bt.hairUnder);

  // ── behind the body ──
  if (look.tail) {
    const tc = look.tailColour ?? hairC;
    const t = tail(b, look.tail, tc);
    paint(t.main, tc, { shadeAmt: 0.25 });
    if (t.tip.length) paint(t.tip, t.tipColour, { shadeAmt: 0.15, line: ink(tc) });
  }
  for (const x of built) if (x.bt.back.length) paint(x.bt.back, shade(x.g.colour, 0.25), { shadeAmt: 0.15 });
  const hl = hair(b, look.hair.style, look.hair.length ?? 0.6);
  if (hl.back.length && !hatHidesHair) paint(hl.back, shade(hairC, 0.12), { shadeAmt: 0.25 });

  // ── the body ──
  const sk = skinShapes(b);
  paint([...sk.trunk, neckPath(b)], skin, { line: skinLine, shadeAmt: 0.13 });
  for (const d of sk.lines) stroke(d, skinLine, LW);
  bodyMarks(b, skin, stroke);
  if (look.ears === "elf") for (const s of [1, -1] as const) paint([earPath(b, s, true)], skin, { line: skinLine, shadeAmt: 0.1 });
  else if (!look.ears || look.ears === "cat" || look.ears === "fox" || look.ears === "wolf" || look.ears === "bunny") { if (!look.ears) for (const s of [1, -1] as const) paint([earPath(b, s, false)], skin, { line: skinLine, shadeAmt: 0.1 }); }
  paint([headPath(b)], skin, { line: skinLine, shadeAmt: 0.1 });
  g.push(face(b, look.eyes, look.expression ?? "neutral", skin, skinLine));

  // ── clothes, back to front ──
  let handsOver = false;
  for (const { g: x, bt } of built) {
    if (x.kind === "hat") continue;
    drawGarment(x, bt);
    handsOver ||= !!bt.handsOver;
  }
  if (handsOver && !built.some((x) => x.g.kind === "gloves")) {
    const hands = skinShapes(b).trunk.slice(-4).filter((_, i) => i % 2 === 0);
    paint(hands, skin, { line: skinLine, shadeAmt: 0.12 });
  }

  // ── hair, hat, ears, horns ──
  if (hl.front.length) {
    const clip = id("hc");
    defs.push(`<clipPath id="${clip}">${hl.front.map((d) => `<path d="${d}"/>`).join("")}</clipPath>`);
    paint(hl.front, hairC, { shadeAmt: 0.28 });
    // A soft shine band across the crown.
    const r = b.head;
    g.push(`<path d="M${f(r.c.x - r.rx * 0.85)} ${f(r.c.y - r.ry * 0.78)}Q${f(r.c.x)} ${f(r.c.y - r.ry * 1.12)} ${f(r.c.x + r.rx * 0.85)} ${f(r.c.y - r.ry * 0.78)}" stroke="${light(hairC, 0.4)}" stroke-width="3" fill="none" opacity=".35" clip-path="url(#${clip})"/>`);
    for (const e of hl.extra) {
      const m = /^tie:([\d.]+),([\d.]+)$/.exec(e);
      if (m) g.push(`<circle cx="${m[1]}" cy="${m[2]}" r="3.4" fill="${mix(hairC, "#e05a7e", 0.7)}" stroke="${ink(hairC)}" stroke-width="1"/>`);
    }
  }
  for (const { g: x, bt } of built) if (x.kind === "hat") drawGarment(x, bt);
  if (look.ears && look.ears !== "elf") {
    const ec = look.earColour ?? hairC;
    const e = animalEars(b, look.ears, ec);
    if (e) {
      paint(e.outer, ec, { shadeAmt: 0.2 });
      paint(e.innerD, e.inner, { shadeAmt: 0, noOutline: true });
      if (e.tipD.length) paint(e.tipD, shade(ec, 0.55), { shadeAmt: 0, noOutline: true });
    }
  }
  if (look.horns) paint(horns(b, look.horns), look.horns === "oni" ? "#d8c9a3" : "#3b3140", { shadeAmt: 0.3, gloss: true });

  function drawGarment(x: Garment, bt: Built) {
    const base = x.colour;
    let pat: string | undefined;
    if (x.pattern && x.pattern !== "none") {
      pat = id("pt");
      defs.push(patternDef(pat, x.pattern, x.patternColour ?? (x.pattern === "fishnet" ? "#1d1720" : "#1d1a22"), base));
    }
    let mask: string | undefined;
    if (x.damage && x.damage > 0) {
      const holes = tears(bt.pieces, x.damage, rng(`${x.kind}:${x.label ?? ""}:${base}`));
      if (holes.length) {
        mask = id("dm");
        defs.push(`<mask id="${mask}" maskUnits="userSpaceOnUse" x="-50" y="-50" width="340" height="640"><rect x="-50" y="-50" width="340" height="640" fill="#fff"/>${holes.map((h) => `<path d="${poly(h)}" fill="#000"/>`).join("")}</mask>`);
      }
    }
    const metal = x.material === "metal";
    const sheer = x.material === "sheer" || x.pattern === "fishnet";
    let fill = base;
    if (metal) {
      const gr = id("mt");
      defs.push(`<linearGradient id="${gr}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light(base, 0.45)}"/><stop offset=".45" stop-color="${base}"/><stop offset=".55" stop-color="${shade(base, 0.25)}"/><stop offset="1" stop-color="${light(base, 0.15)}"/></linearGradient>`);
      fill = `url(#${gr})`;
    }
    const lc = ink(base);
    if (bt.pieces.length) paint(bt.pieces, fill, { line: lc, pattern: pat, mask, sheer, gloss: metal || x.material === "leather" || x.material === "silk", shadeAmt: metal ? 0 : x.material === "silk" ? 0.18 : 0.24 });
    const c2 = x.colour2 ?? (metal ? "#c9a54a" : x.kind === "shoes" || x.kind === "belt" ? light(base, 0.6) : shade(base, 0.35));
    if (bt.trim.length) paint(bt.trim, c2, { line: ink(c2), shadeAmt: 0.15 });
    for (const l of bt.lines) {
      const c = l.c === "trim" ? c2 : l.c === "shade" ? shade(base, 0.35) : l.c === "light" ? light(base, 0.5) : lc;
      stroke(l.d, c, l.w ?? 1, mask ? ` mask="url(#${mask})"` : "");
    }
  }

  const vb = opts.crop === "bust" ? `${f(b.cx - 80)} ${f(b.head.c.y - b.head.ry * 2.1)} 160 ${f(b.waistY - (b.head.c.y - b.head.ry * 2.1) + 10)}` : "0 -8 240 540";
  const w = opts.width ? ` width="${opts.width}"` : "", h = opts.height ? ` height="${opts.height}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${w}${h} class="warp-doll-svg" role="img"><defs>${defs.join("")}</defs>${g.join("")}</svg>`;
}

/** Light anatomy marks on the skin: collarbones, bust, navel, a hint of muscle. */
function bodyMarks(b: Body, skin: string, stroke: (d: string, c: string, w?: number, extra?: string) => void) {
  const c = shade(skin, 0.3);
  const cx = b.cx;
  for (const s of [1, -1]) stroke(`M${f(cx + s * 4)} ${f(b.neckBot + 6)}Q${f(cx + s * b.s.neck * 1.6)} ${f(b.neckBot + 3)} ${f(cx + s * b.s.shoulder * 0.62)} ${f(b.neckBot + 4)}`, c, 0.9, ' opacity=".7"');
  if (b.breast) for (const s of [1, -1]) {
    const x = cx + s * (b.breast.x - cx), y = b.breast.y, r = b.breast.r;
    stroke(`M${f(x - s * r * 0.75)} ${f(y + r * 0.55)}Q${f(x)} ${f(y + r * 1.12)} ${f(x + s * r * 0.85)} ${f(y + r * 0.35)}`, shade(skin, 0.38), 1);
  }
  if (b.sex === "m" && b.s.muscle > 0.25) for (const s of [1, -1]) stroke(`M${f(cx + s * 2)} ${f(b.bustY + 8)}Q${f(cx + s * b.s.chest * 0.5)} ${f(b.bustY + 12)} ${f(cx + s * b.s.chest * 0.8)} ${f(b.bustY - 2)}`, c, 1, ` opacity="${Math.min(1, b.s.muscle)}"`);
  if (b.s.muscle > 0.5) {
    stroke(`M${f(cx)} ${f(b.underY + 2)}L${f(cx)} ${f(b.waistY - 2)}`, c, 0.8, ' opacity=".5"');
    for (let i = 0; i < 2; i++) for (const s of [1, -1]) stroke(`M${f(cx + s * 3)} ${f(b.underY + 12 + i * 12)}l${f(s * 6)} -1`, c, 0.8, ' opacity=".45"');
  }
  stroke(`M${f(cx)} ${f(b.waistY + 6)}l0 3.5`, shade(skin, 0.4), 1.4);
  if (b.s.belly > 0.4) stroke(`M${f(cx - b.s.waist * 0.6)} ${f(b.hipY - 6)}Q${f(cx)} ${f(b.hipY + 2)} ${f(cx + b.s.waist * 0.6)} ${f(b.hipY - 6)}`, c, 1, ' opacity=".6"');
}
