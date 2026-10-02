// The arcade's three looks. Every game draws from the same tokens, so a medieval
// rulebook gets parchment, oak and gold leaf, a modern one clean paper and ink, and a
// sci-fi one a quiet instrument panel — never a wall of neon.

export type Style = "medieval" | "modern" | "scifi";
export const STYLES: Style[] = ["medieval", "modern", "scifi"];
export const STYLE_LABEL: Record<Style, string> = { medieval: "Medieval", modern: "Modern", scifi: "Sci-fi" };

export interface Theme {
  style: Style;
  /** Light pages (parchment, paper) or a dark instrument panel. */
  light: boolean;
  /** The game area's ground and the things drawn on it. */
  ground: string;
  ground2: string;
  line: string;
  ink: string;
  inkSoft: string;
  /** The one colour that says "this", and a second for contrast. */
  accent: string;
  accent2: string;
  gold: string;
  good: string;
  warn: string;
  bad: string;
  /** Materials. */
  wood: string;
  woodDark: string;
  felt: string;
  feltDark: string;
  metal: string;
  /** Seven colours for falling blocks, four for lanes. */
  pieces: [string, string, string, string, string, string, string];
  lanes: [string, string, string, string];
  /** Card faces. */
  cardFace: string;
  cardRed: string;
  cardBlack: string;
  /** How much things may glow (0 = never). */
  glow: number;
  fontDisplay: string;
  fontUi: string;
  fontNum: string;
}

export const THEMES: Record<Style, Theme> = {
  medieval: {
    style: "medieval", light: true,
    ground: "#eadcbb", ground2: "#dccaa1", line: "rgba(74, 52, 28, .22)", ink: "#2c1f12", inkSoft: "#6b5638",
    accent: "#9e2b1f", accent2: "#2c4a7a", gold: "#b48a2c", good: "#3e6b3a", warn: "#a8741a", bad: "#8c1f1a",
    wood: "#6b4426", woodDark: "#3b2414", felt: "#3f5a34", feltDark: "#26381f", metal: "#9a8a6a",
    pieces: ["#8c2f24", "#b48a2c", "#2c4a7a", "#3e6b3a", "#6b3f6e", "#a35a1f", "#4a5d6b"],
    lanes: ["#8c2f24", "#2c4a7a", "#3e6b3a", "#b48a2c"],
    cardFace: "#f2e6c9", cardRed: "#9e2b1f", cardBlack: "#231a10",
    glow: 0,
    fontDisplay: `"Cinzel", "Trajan Pro", "Palatino Linotype", "Book Antiqua", Georgia, serif`,
    fontUi: `"EB Garamond", "Garamond", "Palatino Linotype", "Book Antiqua", Georgia, serif`,
    fontNum: `"EB Garamond", "Palatino Linotype", Georgia, serif`,
  },
  modern: {
    style: "modern", light: true,
    ground: "#f6f4ef", ground2: "#ebe8e1", line: "rgba(29, 29, 31, .08)", ink: "#1d1d1f", inkSoft: "#6e6e73",
    accent: "#ff5a36", accent2: "#2f6fe4", gold: "#d4a017", good: "#1f9d55", warn: "#e8a317", bad: "#d93a3a",
    wood: "#b98a5e", woodDark: "#7a5636", felt: "#1f6b4f", feltDark: "#154a37", metal: "#c8c8cc",
    pieces: ["#ff5a36", "#ffb020", "#2f6fe4", "#22a06b", "#8e5cf0", "#ff7aa8", "#00a3bf"],
    lanes: ["#1d1d1f", "#1d1d1f", "#1d1d1f", "#1d1d1f"],
    cardFace: "#ffffff", cardRed: "#d23434", cardBlack: "#1d1d1f",
    glow: 0,
    fontDisplay: `"Manrope", "Inter", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif`,
    fontUi: `"Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`,
    fontNum: `"Inter", "Segoe UI", system-ui, sans-serif`,
  },
  scifi: {
    style: "scifi", light: false,
    ground: "#0a111b", ground2: "#0f1926", line: "rgba(120, 170, 210, .14)", ink: "#d6e2ee", inkSoft: "#7d92a8",
    accent: "#5ec8e5", accent2: "#f2a541", gold: "#f2c14e", good: "#5fd3a0", warn: "#f2a541", bad: "#ef6461",
    wood: "#1c2a3a", woodDark: "#121c28", felt: "#13283a", feltDark: "#0b1824", metal: "#7d92a8",
    pieces: ["#5ec8e5", "#f2a541", "#8f9cff", "#5fd3a0", "#ef6461", "#c792ea", "#e0e6ec"],
    lanes: ["#5ec8e5", "#8f9cff", "#5fd3a0", "#f2a541"],
    cardFace: "#e9eef3", cardRed: "#d0435a", cardBlack: "#15202c",
    glow: 0.35,
    fontDisplay: `"Oxanium", "Bahnschrift", "DIN Alternate", "Segoe UI", system-ui, sans-serif`,
    fontUi: `"IBM Plex Sans", "Segoe UI", system-ui, sans-serif`,
    fontNum: `"IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, monospace`,
  },
};

/** The fonts behind the looks (with system fallbacks if they can't load). */
export const FONT_CSS = "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&family=Oxanium:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap";

let fontsAsked = false;
export function loadFonts() {
  if (fontsAsked || typeof document === "undefined") return;
  fontsAsked = true;
  try {
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = FONT_CSS;
    document.head.appendChild(l);
  } catch { /* system fonts will do */ }
}

// ───────────────────────── textures ─────────────────────────

const cache = new Map<string, HTMLCanvasElement>();

function offscreen(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")!];
}

/** A small seeded generator so textures look the same every time. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Speckle and blotch over a base colour: paper fibres, felt nap, worn stone. */
function grain(g: CanvasRenderingContext2D, w: number, h: number, dots: number, dark: string, light: string, size: number, seed: number) {
  const r = rng(seed);
  for (let i = 0; i < dots; i++) {
    g.fillStyle = r() < 0.5 ? dark : light;
    g.globalAlpha = 0.03 + r() * 0.06;
    const s = size * (0.4 + r());
    g.fillRect(r() * w, r() * h, s, s);
  }
  g.globalAlpha = 1;
}

/** Tileable textures, made once. */
export function texture(kind: "parchment" | "paper" | "wood" | "felt" | "stone" | "panel" | "brushed", t: Theme): HTMLCanvasElement {
  const key = `${kind}:${t.style}:${t.ground}:${t.wood}:${t.felt}:${t.metal}`;
  const hit = cache.get(key);
  if (hit) return hit;
  // Parchment repeats on a larger tile so its blotches don't fall into a visible pattern.
  const S = kind === "parchment" ? 512 : 256;
  const [c, g] = offscreen(S, S);
  const r = rng(kind.length * 97 + t.style.length);
  switch (kind) {
    case "parchment": {
      g.fillStyle = t.ground; g.fillRect(0, 0, S, S);
      // Blotches, drawn wrapped so the tile repeats without seams.
      for (let i = 0; i < 46; i++) {
        const x = r() * S, y = r() * S, rad = 20 + r() * 70;
        const tone = r() < 0.5 ? "rgba(140, 100, 50, .07)" : "rgba(255, 245, 220, .08)";
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
          const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
          gr.addColorStop(0, tone); gr.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
        }
      }
      grain(g, S, S, 16000, "#5a4020", "#fff6dc", 1.4, 3);
      // Fibres.
      g.strokeStyle = "rgba(90, 64, 32, .05)"; g.lineWidth = 0.6;
      for (let i = 0; i < 480; i++) { const x = r() * S, y = r() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 18, y + (r() - 0.5) * 6); g.stroke(); }
      break;
    }
    case "paper": {
      g.fillStyle = t.ground; g.fillRect(0, 0, S, S);
      grain(g, S, S, 1800, "#000", "#fff", 1, 5);
      break;
    }
    case "wood": {
      g.fillStyle = t.wood; g.fillRect(0, 0, S, S);
      // Grain: long wavy lines in darker and lighter tones.
      for (let y = 0; y < S; y += 2) {
        const v = Math.sin(y * 0.09 + Math.sin(y * 0.013) * 4) * 0.5 + 0.5;
        g.fillStyle = `rgba(${t.style === "scifi" ? "0,0,0" : "30, 16, 6"}, ${0.04 + v * 0.12})`;
        g.fillRect(0, y, S, 1 + (v > 0.8 ? 1 : 0));
      }
      for (let i = 0; i < 40; i++) {
        const y = r() * S;
        g.strokeStyle = `rgba(${r() < 0.5 ? "20, 10, 4" : "255, 220, 170"}, ${0.04 + r() * 0.06})`;
        g.lineWidth = 0.6 + r() * 1.2;
        g.beginPath();
        for (let x = 0; x <= S; x += 8) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 3);
        g.stroke();
      }
      grain(g, S, S, 800, "#000", "#fff", 1, 7);
      break;
    }
    case "felt": {
      g.fillStyle = t.felt; g.fillRect(0, 0, S, S);
      grain(g, S, S, 9000, "#000", "#fff", 1, 11);
      break;
    }
    case "stone": {
      g.fillStyle = "#8a8172"; g.fillRect(0, 0, S, S);
      grain(g, S, S, 6000, "#2a241c", "#e8dcc4", 2, 13);
      break;
    }
    case "panel": {
      g.fillStyle = t.ground; g.fillRect(0, 0, S, S);
      g.strokeStyle = "rgba(120, 170, 210, .05)"; g.lineWidth = 1;
      for (let i = 0; i <= S; i += 16) { g.beginPath(); g.moveTo(i + 0.5, 0); g.lineTo(i + 0.5, S); g.stroke(); g.beginPath(); g.moveTo(0, i + 0.5); g.lineTo(S, i + 0.5); g.stroke(); }
      grain(g, S, S, 1500, "#000", "#9cc4e4", 1, 17);
      break;
    }
    case "brushed": {
      g.fillStyle = t.metal; g.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y++) { g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"}, ${r() * 0.07})`; g.fillRect(0, y, S, 1); }
      break;
    }
  }
  cache.set(key, c);
  return c;
}

/** Fill a rectangle with a texture. */
export function paint(g: CanvasRenderingContext2D, kind: Parameters<typeof texture>[0], t: Theme, x: number, y: number, w: number, h: number) {
  const p = g.createPattern(texture(kind, t), "repeat");
  if (!p) return;
  g.save();
  g.fillStyle = p;
  g.translate(x, y);
  g.fillRect(0, 0, w, h);
  g.restore();
}

/** A soft dark edge, like light falling off toward the corners. */
export function vignette(g: CanvasRenderingContext2D, w: number, h: number, strength = 0.35, color = "0,0,0") {
  const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  gr.addColorStop(0, `rgba(${color},0)`);
  gr.addColorStop(1, `rgba(${color},${strength})`);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}

/** The game area's ground, in the look's own material. */
export function ground(g: CanvasRenderingContext2D, t: Theme, w: number, h: number, kind: "page" | "table" | "board" = "page") {
  if (t.style === "medieval") {
    if (kind === "table") { paint(g, "wood", t, 0, 0, w, h); vignette(g, w, h, 0.5); }
    else { paint(g, "parchment", t, 0, 0, w, h); vignette(g, w, h, 0.28, "70, 40, 10"); }
  } else if (t.style === "modern") {
    if (kind === "table") { g.fillStyle = t.ground2; g.fillRect(0, 0, w, h); }
    else { paint(g, "paper", t, 0, 0, w, h); }
  } else {
    paint(g, "panel", t, 0, 0, w, h);
    vignette(g, w, h, 0.55);
  }
}

/** Glow only where the look allows it. */
export function glow(g: CanvasRenderingContext2D, t: Theme, color: string, blur: number) {
  g.shadowColor = color;
  g.shadowBlur = blur * t.glow;
}

/** A soft drop shadow (paper and wood looks), none on the panel. */
export function lift(g: CanvasRenderingContext2D, t: Theme, depth = 1) {
  if (t.style === "scifi") { g.shadowBlur = 0; g.shadowColor = "transparent"; return; }
  g.shadowColor = t.style === "medieval" ? "rgba(40, 20, 5, .35)" : "rgba(0, 0, 0, .14)";
  g.shadowBlur = 6 * depth;
  g.shadowOffsetY = 2 * depth;
}
export function unlift(g: CanvasRenderingContext2D) { g.shadowBlur = 0; g.shadowOffsetY = 0; g.shadowColor = "transparent"; }

/** Corner brackets: the sci-fi panel's frame. */
export function brackets(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, len = 12) {
  g.strokeStyle = color; g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x, y + len); g.lineTo(x, y); g.lineTo(x + len, y);
  g.moveTo(x + w - len, y); g.lineTo(x + w, y); g.lineTo(x + w, y + len);
  g.moveTo(x + w, y + h - len); g.lineTo(x + w, y + h); g.lineTo(x + w - len, y + h);
  g.moveTo(x + len, y + h); g.lineTo(x, y + h); g.lineTo(x, y + h - len);
  g.stroke();
}

/** A data URL of a texture, for CSS backgrounds. */
export function textureUrl(kind: Parameters<typeof texture>[0], t: Theme): string {
  try { return texture(kind, t).toDataURL("image/png"); } catch { return ""; }
}
