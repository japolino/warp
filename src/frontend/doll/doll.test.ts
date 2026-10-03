import { describe, expect, test } from "bun:test";
import { buildBody, PRESETS } from "./body.js";
import { EARS, HAIR_STYLES, HORNS, TAILS } from "./features.js";
import { build, FITS, KINDS, NECKLINES, PATTERNS, SLEEVE_FITS, SLEEVES, STYLES, type Garment } from "./garments.js";
import { cleanLook, OUTFITS, outfitFor } from "./outfits.js";
import { renderDoll, type Look } from "./render.js";

const base = (sex: "f" | "m", preset: string, outfit: Garment[] = []): Look => ({ body: { sex, preset }, skin: "#f0c8a8", hair: { style: "long", colour: "#3b2a2a" }, eyes: "#6f4ad8", outfit });
const sound = (svg: string) => {
  expect(svg.startsWith("<svg")).toBe(true);
  expect(svg).not.toContain("NaN");
  expect(svg).not.toContain("undefined");
  expect(svg).not.toContain("Infinity");
};

describe("the doll", () => {
  test("every build and every ready-made outfit draws cleanly", () => {
    for (const sex of ["f", "m"] as const) for (const p of Object.keys(PRESETS[sex])) for (const k of Object.keys(OUTFITS)) sound(renderDoll(base(sex, p, outfitFor(k, sex))));
  });

  test("every garment option draws on every build", () => {
    const opts: Garment[] = [];
    for (const kind of KINDS) {
      opts.push({ kind, colour: "#5a6a8a" });
      for (const style of STYLES[kind] ?? []) opts.push({ kind, colour: "#5a6a8a", style });
    }
    for (const neckline of NECKLINES) for (const sleeves of SLEEVES) for (const sleeveFit of SLEEVE_FITS) opts.push({ kind: "top", colour: "#ccc", neckline, sleeves, sleeveFit });
    for (const pattern of PATTERNS) opts.push({ kind: "dress", colour: "#ccc", pattern, damage: 0.7 });
    opts.push({ kind: "outer", colour: "#333", style: "coat", open: true }, { kind: "armor", colour: "#999", material: "metal" }, { kind: "legwear", colour: "#111", style: "tights", material: "sheer" });
    for (const sex of ["f", "m"] as const) for (const p of Object.keys(PRESETS[sex])) for (const g of opts) sound(renderDoll(base(sex, p, [g])));
  });

  test("outerwear in every style, sleeve length and fit, open or closed, on every build", () => {
    for (const sex of ["f", "m"] as const) for (const p of Object.keys(PRESETS[sex])) for (const style of STYLES.outer!) for (const sleeves of SLEEVES) for (const fit of [undefined, "loose", "tight"] as const) for (const open of [true, false])
      sound(renderDoll(base(sex, p, [{ kind: "outer", colour: "#555", style, sleeves, fit, open }])));
  });

  test("tall ears and hats, and tails, stay inside the picture", () => {
    const top = (svg: string) => Number(/viewBox="([-\d.]+) ([-\d.]+)/.exec(svg)![2]);
    expect(top(renderDoll({ ...base("f", "slim"), ears: "bunny" }))).toBeLessThanOrEqual(-26);
    expect(top(renderDoll(base("f", "slim", [{ kind: "hat", style: "witch", colour: "#222" }])))).toBeLessThanOrEqual(-26);
  });

  test("hair, ears, tails and horns all draw", () => {
    for (const style of HAIR_STYLES) for (const ears of EARS) sound(renderDoll({ ...base("f", "slim"), hair: { style, colour: "#e8c26a" }, ears }));
    for (const tail of TAILS) for (const horns of HORNS) sound(renderDoll({ ...base("m", "broad"), tail, horns }));
  });

  test("the same look draws the same picture", () => {
    const l = base("f", "curvy", outfitFor("ranger", "f"));
    expect(renderDoll(l, { id: "a" })).toBe(renderDoll(l, { id: "a" }));
  });

  test("bare means plain underwear unless that's turned off", () => {
    expect(renderDoll(base("f", "slim"))).toContain("#e9e4ef");
    expect(renderDoll({ ...base("f", "slim"), modest: false })).not.toContain("#e9e4ef");
    expect(renderDoll(base("f", "slim", outfitFor("casual", "f")))).not.toContain("#e9e4ef");
  });
});

describe("loose looks are made drawable", () => {
  test("a helper's reply with words, junk and unknown values", () => {
    const l = cleanLook({
      body: { sex: "f", preset: "Curvy", blend: { preset: "heavy", amount: 3 } },
      skin: "tan", eyes: "#0f0", hair: { style: "twintails", color: "platinum", length: 0.9 },
      ears: "fox", tail: "kitsune", horns: "antlers",
      outfit: [
        { kind: "robe", color: "navy", pattern: "waves", sleeveFit: "wide", label: "Yukata" },
        { kind: "sash", colour: "gold" },
        { kind: "jetpack", colour: "#fff" },
        { kind: "shoes", style: "rollerblades", colour: "black" },
        "nonsense",
      ],
    });
    expect(l.body).toEqual({ sex: "f", preset: "curvy", blend: { preset: "heavy", amount: 1 } });
    expect(l.skin).toBe("#c49a6c");
    expect(l.eyes).toBe("#00ff00");
    expect(l.hair).toEqual({ style: "twintails", colour: "#e8e4dc", length: 0.9 });
    expect([l.ears, l.tail, l.horns]).toEqual(["fox", "kitsune", null]);
    expect(l.outfit.map((g) => g.kind)).toEqual(["robe", "sash", "shoes"]);
    expect(l.outfit[2].style).toBeUndefined();
    sound(renderDoll(l));
  });

  test("sex written as a word", () => {
    for (const w of ["M", "male", "Man"]) expect(cleanLook({ body: { sex: w } }).body.sex).toBe("m");
    for (const w of ["F", "female", "", 3]) expect(cleanLook({ body: { sex: w } }).body.sex).toBe("f");
  });

  test("a picture id or size can't add markup", () => {
    const svg = renderDoll(base("f", "slim"), { id: 'x"><b', width: '1" onload="x' as unknown as number });
    expect(svg).not.toContain('"><b');
    expect(svg).not.toContain("onload");
  });

  test("nothing at all still gives a whole doll", () => {
    sound(renderDoll(cleanLook(null)));
    sound(renderDoll(cleanLook({ body: { sex: "m" }, outfit: "lots" })));
  });
});

describe("clothes stay where they belong (from the visual QA run)", () => {
  const bodies = (["f", "m"] as const).flatMap((sex) => Object.keys(PRESETS[sex]).flatMap((preset) => [0.85, 1, 1.15].map((height) => buildBody({ sex, preset, height }))));

  test("no neckline climbs over the face, whatever the fit, material or kind", () => {
    for (const b of bodies) {
      const chin = b.head.c.y + b.head.ry * 0.95;
      for (const kind of ["top", "outer", "armor", "dress", "robe"] as const) for (const neckline of NECKLINES) for (const fit of FITS) for (const material of ["cloth", "metal"] as const) {
        const top = Math.min(...build(b, { kind, colour: "#555", neckline, fit, material }).pieces.flat().map((p) => p.y));
        if (top < chin) throw new Error(`${kind} ${neckline} ${fit} ${material} on ${b.sex}/${b.s.height.toFixed(2)} reaches y=${top.toFixed(1)}, above the chin (${chin.toFixed(1)})`);
      }
    }
  });

  test("the whole head fits in the picture at every height", () => {
    for (const sex of ["f", "m"] as const) for (const preset of Object.keys(PRESETS[sex])) for (const height of [0.85, 1.15]) for (const extra of [{}, { ears: "bunny" }, { horns: "ram" }] as const) {
      const look = { ...base(sex, preset), body: { sex, preset, height }, ...extra } as Look;
      const b = buildBody(look.body);
      const vbTop = Number(/viewBox="[-\d.]+ ([-\d.]+)/.exec(renderDoll(look))![1]);
      expect(vbTop).toBeLessThanOrEqual(b.head.c.y - b.head.ry * 1.3);
    }
  });

  test("socks and boots: the length word is where the top sits", () => {
    const b = buildBody({ sex: "f", preset: "slim" });
    const top = (g: Garment) => Math.min(...build(b, g).pieces.flat().map((p) => p.y));
    expect(top({ kind: "legwear", style: "socks", colour: "#fff", length: "knee" })).toBeLessThan(top({ kind: "legwear", style: "socks", colour: "#fff", length: "ankle" }));
    expect(top({ kind: "shoes", style: "boots", colour: "#333", length: "knee" })).toBeLessThan(top({ kind: "shoes", style: "boots", colour: "#333", length: "ankle" }));
  });

  test("the outfit's order moves armour over a robe and a belt over a coat", () => {
    const svg = renderDoll(base("f", "slim", [{ kind: "robe", colour: "#aa0000" }, { kind: "armor", colour: "#00aa00" }]), { id: "o" });
    expect(svg.lastIndexOf('fill="#aa0000"')).toBeLessThan(svg.lastIndexOf("#00aa00"));
    const svg2 = renderDoll(base("f", "slim", [{ kind: "outer", style: "coat", colour: "#aa0000" }, { kind: "belt", colour: "#00aa00" }]), { id: "p" });
    expect(svg2.lastIndexOf('fill="#aa0000"')).toBeLessThan(svg2.lastIndexOf('fill="#00aa00"'));
  });
});
