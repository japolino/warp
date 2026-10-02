import { describe, expect, test } from "bun:test";
import { PRESETS } from "./body.js";
import { EARS, HAIR_STYLES, HORNS, TAILS } from "./features.js";
import { KINDS, NECKLINES, PATTERNS, SLEEVE_FITS, SLEEVES, STYLES, type Garment } from "./garments.js";
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

  test("nothing at all still gives a whole doll", () => {
    sound(renderDoll(cleanLook(null)));
    sound(renderDoll(cleanLook({ body: { sex: "m" }, outfit: "lots" })));
  });
});
