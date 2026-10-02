// Ready-made outfits and the checker that turns any loose description
// (from a rulebook, a person, or a helper model) into something drawable.

import { PRESETS, type BodyPick, type Sex } from "./body.js";
import { EARS, EXPRESSIONS, HAIR_STYLES, HORNS, TAILS } from "./features.js";
import { FITS, type Garment, HEMS, KINDS, LENGTHS, MATERIALS, NECKLINES, PATTERNS, SLEEVE_FITS, SLEEVES, STYLES } from "./garments.js";
import type { Look } from "./render.js";

export const OUTFITS: Record<string, { label: string; f: Garment[]; m?: Garment[] }> = {
  adventurer: {
    label: "Adventurer",
    f: [
      { kind: "top", colour: "#e9dfc8", neckline: "collar", sleeves: "long", sleeveFit: "loose", hem: "hip", label: "Linen shirt" },
      { kind: "outer", style: "vest", colour: "#7a4a2a", material: "leather", hem: "hip", label: "Leather vest" },
      { kind: "bottom", colour: "#4a4a3a", length: "ankle", label: "Trousers" },
      { kind: "belt", colour: "#3a2418", colour2: "#c9a54a", label: "Belt" },
      { kind: "shoes", style: "boots", colour: "#4a2e1e", length: "knee", material: "leather", label: "Riding boots" },
    ],
  },
  kimono: {
    label: "Kimono",
    f: [
      { kind: "robe", colour: "#8e2f4f", pattern: "floral", patternColour: "#f4c6d2", label: "Kimono" },
      { kind: "sash", colour: "#e9c46a", colour2: "#c0392b", label: "Obi" },
      { kind: "shoes", style: "geta", colour: "#a07850", colour2: "#c0392b", label: "Geta" },
      { kind: "legwear", style: "socks", colour: "#f4f1ea", length: "short", label: "Tabi" },
    ],
    m: [
      { kind: "robe", colour: "#2c3e5a", pattern: "waves", patternColour: "#4f6b94", label: "Kimono" },
      { kind: "sash", colour: "#5a4a3a", colour2: "#d9c8a0", label: "Obi" },
      { kind: "shoes", style: "geta", colour: "#a07850", colour2: "#222", label: "Geta" },
    ],
  },
  street: {
    label: "Street (your screenshot)",
    f: [
      { kind: "legwear", style: "stockings", colour: "#1d1720", pattern: "fishnet", length: "short", label: "Fishnets" },
      { kind: "top", colour: "#f4f1ea", pattern: "cow", neckline: "halter", hem: "crop", fit: "tight", label: "Cow-print halter" },
      { kind: "sleeves", colour: "#f4f1ea", pattern: "cow", sleeves: "long", sleeveFit: "loose", label: "Detached sleeves" },
      { kind: "bottom", style: "shorts", colour: "#3a3a40", length: "micro", rise: "low", label: "Shorts" },
      { kind: "shoes", style: "boots", colour: "#2a2a30", length: "short", colour2: "#f29ac0", label: "Boots" },
      { kind: "gloves", style: "fingerless", colour: "#2a2a30", sleeves: "cap", label: "Fingerless gloves" },
      { kind: "neck", style: "choker", colour: "#222", colour2: "#6fd0e8", label: "Choker" },
      { kind: "hat", style: "newsboy", colour: "#2a2a30", label: "Newsboy cap" },
    ],
  },
  knight: {
    label: "Knight",
    f: [
      { kind: "top", colour: "#5a3a5a", neckline: "crew", sleeves: "long", hem: "thigh", label: "Gambeson" },
      { kind: "bottom", colour: "#3a3040", length: "ankle", label: "Hose" },
      { kind: "armor", colour: "#9aa3b2", material: "metal", neckline: "crew", sleeves: "none", label: "Breastplate" },
      { kind: "gloves", colour: "#9aa3b2", material: "metal", sleeves: "short", label: "Gauntlets" },
      { kind: "shoes", style: "boots", colour: "#9aa3b2", material: "metal", length: "knee", label: "Greaves" },
      { kind: "cape", colour: "#7a1f2a", length: "calf", label: "Cape" },
      { kind: "belt", colour: "#3a2418", label: "Sword belt" },
    ],
  },
  maid: {
    label: "Maid",
    f: [
      { kind: "dress", colour: "#22202a", neckline: "collar", sleeves: "short", sleeveFit: "puff", length: "knee", flare: 0.7, label: "Dress" },
      { kind: "apron", colour: "#f6f4f0", length: "knee", label: "Apron" },
      { kind: "legwear", style: "stockings", colour: "#f6f4f0", length: "short", label: "Stockings" },
      { kind: "shoes", style: "heels", colour: "#1a1a1e", label: "Shoes" },
      { kind: "hat", style: "headband", colour: "#f6f4f0", colour2: "#ffffff", label: "Headdress" },
    ],
    m: [
      { kind: "top", colour: "#f4f2ee", neckline: "collar", sleeves: "long", hem: "hip", label: "Shirt" },
      { kind: "outer", style: "vest", colour: "#22202a", open: false, hem: "waist", label: "Waistcoat" },
      { kind: "bottom", colour: "#22202a", length: "ankle", label: "Trousers" },
      { kind: "shoes", colour: "#1a1a1e", label: "Shoes" },
    ],
  },
  school: {
    label: "School",
    f: [
      { kind: "top", colour: "#f4f2ee", neckline: "collar", sleeves: "long", hem: "waist", label: "Blouse" },
      { kind: "outer", style: "jacket", colour: "#2b3a5c", hem: "hip", label: "Blazer" },
      { kind: "skirt", colour: "#3a4a6a", pattern: "plaid", patternColour: "#8a2a3a", length: "mid", flare: 0.5, label: "Pleated skirt" },
      { kind: "legwear", style: "socks", colour: "#22202a", length: "knee", label: "Knee socks" },
      { kind: "shoes", colour: "#3a2418", label: "Loafers" },
    ],
    m: [
      { kind: "top", colour: "#f4f2ee", neckline: "collar", sleeves: "long", hem: "hip", label: "Shirt" },
      { kind: "outer", style: "jacket", colour: "#2b3a5c", hem: "hip", label: "Blazer" },
      { kind: "bottom", colour: "#3a4a6a", length: "ankle", label: "Trousers" },
      { kind: "shoes", colour: "#3a2418", label: "Shoes" },
    ],
  },
  mage: {
    label: "Mage",
    f: [
      { kind: "robe", colour: "#2a2360", pattern: "stars", patternColour: "#e8c86a", neckline: "v", sleeveFit: "bell", length: "floor", flare: 0.35, label: "Robe" },
      { kind: "belt", colour: "#c9a54a", label: "Cord" },
      { kind: "hat", style: "witch", colour: "#2a2360", colour2: "#c9a54a", label: "Hat" },
      { kind: "neck", style: "necklace", colour: "#c9a54a", colour2: "#6fd0e8", label: "Amulet" },
    ],
  },
  casual: {
    label: "Casual",
    f: [
      { kind: "top", colour: "#e05a7e", neckline: "crew", sleeves: "short", hem: "hip", label: "T-shirt" },
      { kind: "bottom", colour: "#3d5a8a", length: "ankle", fit: "tight", label: "Jeans" },
      { kind: "outer", style: "hoodie", colour: "#6b6f7a", open: true, label: "Hoodie" },
      { kind: "shoes", style: "sneakers", colour: "#f0eef2", colour2: "#e05a7e", label: "Sneakers" },
    ],
  },
  ranger: {
    label: "Ranger (torn)",
    f: [
      { kind: "top", colour: "#5a6a3a", neckline: "v", sleeves: "elbow", hem: "thigh", damage: 0.6, label: "Tunic" },
      { kind: "bottom", colour: "#4a3a2a", length: "ankle", fit: "tight", damage: 0.4, label: "Leggings" },
      { kind: "cape", colour: "#3a4a2a", length: "knee", damage: 0.5, label: "Cloak" },
      { kind: "hat", style: "hood", colour: "#3a4a2a", label: "Hood" },
      { kind: "shoes", style: "boots", colour: "#4a2e1e", length: "calf", label: "Boots" },
      { kind: "gloves", colour: "#4a2e1e", material: "leather", sleeves: "cap", label: "Bracers" },
    ],
  },
  swim: {
    label: "Beach",
    f: [
      { kind: "bra", colour: "#2fa3b8", pattern: "dots", patternColour: "#f4f1ea", label: "Bikini top" },
      { kind: "briefs", colour: "#2fa3b8", pattern: "dots", patternColour: "#f4f1ea", label: "Bikini bottom" },
      { kind: "hat", style: "sunhat", colour: "#e9d6a0", colour2: "#e05a7e", label: "Sun hat" },
      { kind: "shoes", style: "sandals", colour: "#c9a070", colour2: "#e05a7e", label: "Sandals" },
    ],
    m: [
      { kind: "bottom", style: "shorts", colour: "#2fa3b8", pattern: "floral", patternColour: "#f4f1ea", length: "mid", fit: "loose", label: "Swim shorts" },
      { kind: "shoes", style: "sandals", colour: "#c9a070", colour2: "#333", label: "Sandals" },
    ],
  },
};

export function outfitFor(key: string, sex: Sex): Garment[] {
  const o = OUTFITS[key];
  if (!o) return [];
  return (sex === "m" ? o.m ?? o.f.filter((g) => !["bra", "dress", "skirt", "apron"].includes(g.kind)) : o.f).map((g) => ({ ...g }));
}

// ───────── checking loose input ─────────

const pick = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (typeof v === "string" && (list as readonly string[]).includes(v.toLowerCase().trim()) ? (v.toLowerCase().trim() as T) : undefined);
const colour = (v: unknown, fallback: string): string => {
  if (typeof v !== "string") return fallback;
  const s = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return "#" + s.slice(1).split("").map((c) => c + c).join("").toLowerCase();
  if (/^#[0-9a-f]{8}$/i.test(s)) return s.slice(0, 7).toLowerCase();
  const w = s.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  if (NAMED[w]) return NAMED[w];
  // "deep crimson", "pale gold": the last colour word in it.
  const hit = w.split(" ").reverse().find((x) => NAMED[x]);
  return hit ? NAMED[hit] : fallback;
};
const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);

/** Common colour words, for descriptions that don't give hex codes. */
export const NAMED: Record<string, string> = {
  black: "#1f1d24", white: "#f4f2ee", grey: "#7a7a84", gray: "#7a7a84", silver: "#b8bcc6", red: "#c0392b", crimson: "#9e1b32", pink: "#f29ac0",
  orange: "#e07b39", gold: "#d4a83a", yellow: "#e9c46a", cream: "#efe6cf", beige: "#d8c8a8", brown: "#6b4a32", tan: "#c49a6c",
  green: "#3f8a4f", olive: "#6b7a3a", teal: "#2a8a8a", cyan: "#4fc3d8", blue: "#3d6fd0", navy: "#24305a", purple: "#6a3d9a", violet: "#8a5ad0",
  lavender: "#b8a6e0", maroon: "#6a1f2a", burgundy: "#6e1f34", charcoal: "#33323a", ivory: "#f6f1e3",
  blonde: "#e8c26a", auburn: "#8e3b22", ginger: "#c45a2a", chestnut: "#6b3a24", platinum: "#e8e4dc",
  hazel: "#8e7652", amber: "#c9822b", bronze: "#9c6838", peach: "#f4c29f", copper: "#b86d3b", golden: "#d4a83a", ash: "#8a8886",
  indigo: "#3b4d8a", turquoise: "#38a3a5", coral: "#e76f51", rose: "#c94a6e", magenta: "#c03a8a", mint: "#9fd8b8", sky: "#8cc4ec",
  emerald: "#2e8b57", sapphire: "#2a52be", ruby: "#a8203a", jade: "#3a9a6a", khaki: "#b5a27a", "dark brown": "#4a3022", "light brown": "#a07850",
  "dark blue": "#24305a", "light blue": "#8cc4ec", "dark green": "#2f5a3a", "light green": "#9fd3a8", "dark red": "#7a1f2a", "light pink": "#f6c6d6",
  pale: "#fbe3d3", fair: "#f6d7c3", "olive skin": "#c9a37a", dark: "#6a4128", ebony: "#4a2e1e", snow: "#f8f8fb", raven: "#1f1a22", jet: "#141218",
};

/** Turn any loose garment description into a drawable one, or null if it can't be. */
export function cleanGarment(raw: unknown): Garment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = pick(r.kind, KINDS);
  if (!kind) return null;
  const g: Garment = { kind, colour: colour(r.colour ?? r.color, "#7a7a84") };
  const c2 = r.colour2 ?? r.color2;
  if (c2 !== undefined) g.colour2 = colour(c2, g.colour);
  const set = <K extends keyof Garment>(k: K, v: Garment[K] | undefined) => { if (v !== undefined) g[k] = v; };
  set("pattern", pick(r.pattern, PATTERNS));
  if (r.patternColour ?? r.patternColor) g.patternColour = colour(r.patternColour ?? r.patternColor, "#1d1a22");
  set("material", pick(r.material, MATERIALS));
  set("neckline", pick(r.neckline, NECKLINES));
  set("sleeves", pick(r.sleeves, SLEEVES));
  set("sleeveFit", pick(r.sleeveFit, SLEEVE_FITS));
  set("hem", pick(r.hem, HEMS));
  set("fit", pick(r.fit, FITS));
  set("length", pick(r.length, LENGTHS));
  set("rise", pick(r.rise, ["high", "mid", "low"] as const));
  set("flare", num(r.flare, 0, 1));
  set("damage", num(r.damage, 0, 1));
  if (typeof r.open === "boolean") g.open = r.open;
  const styles = STYLES[kind];
  if (styles) set("style", pick(r.style, styles));
  if (typeof r.label === "string" && r.label.trim()) g.label = r.label.trim().slice(0, 40);
  return g;
}

/** More than this and the doll is a pile of cloth; the editor stops adding at the same number. */
export const MAX_GARMENTS = 24;

export const SKINS = ["#fbe3d3", "#f6d7c3", "#e8b896", "#d9a37e", "#c98e65", "#a8714c", "#8d5a3b", "#6a4128", "#c9d8e8", "#9fd3a8"];
export const HAIR_COLOURS = ["#1f1a22", "#3b2a2a", "#6b3a24", "#8e3b22", "#c45a2a", "#e8c26a", "#e8e4dc", "#b8bcc6", "#e07aa8", "#6a8ad8", "#5ab88a", "#8a5ad0"];

export function defaultLook(sex: Sex = "f"): Look {
  return { body: { sex, preset: sex === "f" ? "athletic" : "athletic" }, skin: "#f0c8a8", hair: { style: sex === "f" ? "long" : "short", colour: "#3b2a2a", length: 0.6 }, eyes: "#6f4ad8", expression: "smile", outfit: outfitFor("adventurer", sex) };
}

/** Turn any loose look (saved, typed in, or from a helper model) into a drawable one. */
export function cleanLook(raw: unknown): Look {
  // A bare list of garments is an outfit.
  const r = (Array.isArray(raw) ? { outfit: raw } : raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bodyR = (r.body && typeof r.body === "object" ? r.body : {}) as Record<string, unknown>;
  const sex: Sex = bodyR.sex === "m" || r.sex === "m" ? "m" : "f";
  const base = defaultLook(sex);
  const presets = Object.keys(PRESETS[sex]);
  // Tolerate "f: curvy" and "Curvy".
  const presetWord = (v: unknown) => (typeof v === "string" ? v.split(/[:\s]+/).filter(Boolean).pop() : v);
  const body: BodyPick = { sex, preset: pick(presetWord(bodyR.preset), presets) ?? base.body.preset };
  const bl = bodyR.blend as Record<string, unknown> | undefined;
  if (bl && typeof bl === "object" && pick(presetWord(bl.preset), presets)) body.blend = { preset: pick(presetWord(bl.preset), presets)!, amount: num(bl.amount, 0, 1) ?? 0.5 };
  const h = num(bodyR.height, 0.85, 1.15);
  if (h) body.height = h;
  const hairR = (r.hair && typeof r.hair === "object" ? r.hair : {}) as Record<string, unknown>;
  const look: Look = {
    body,
    skin: colour(r.skin, base.skin),
    hair: { style: pick(hairR.style, HAIR_STYLES) ?? base.hair.style, colour: colour(hairR.colour ?? hairR.color, base.hair.colour), length: num(hairR.length, 0, 1) ?? (sex === "m" ? 0.3 : 0.6) },
    eyes: colour(r.eyes, base.eyes),
    expression: pick(r.expression, EXPRESSIONS) ?? "neutral",
    ears: pick(r.ears, EARS) ?? null,
    tail: pick(r.tail, TAILS) ?? null,
    horns: pick(r.horns, HORNS) ?? null,
    outfit: Array.isArray(r.outfit) ? r.outfit.map(cleanGarment).filter((g): g is Garment => !!g).slice(0, MAX_GARMENTS) : base.outfit,
  };
  if (r.earColour ?? r.earColor) look.earColour = colour(r.earColour ?? r.earColor, look.hair.colour);
  if (r.tailColour ?? r.tailColor) look.tailColour = colour(r.tailColour ?? r.tailColor, look.hair.colour);
  if (r.modest === false) look.modest = false;
  return look;
}
