// Torn-off HUD panels: which sections live in which small window, and where
// those windows sit. Pure, so the drag-and-drop rules can be tested; the
// frontend turns a layout into floating widgets.
//
// A section is in the main window unless a panel holds it. A panel floats, or
// is attached to a side of the main window (and follows it when it moves).

import { PAD, SNAP, type Box, type Viewport } from "./overlay-layout.js";

export type Side = "left" | "right" | "bottom";
export interface Attach { side: Side; /** Along that side, from the main window's top (left/right) or left (bottom). */ offset: number }
export interface Panel { id: string; parts: string[]; x: number; y: number; attach: Attach | null; folded?: boolean }
export interface Layout { panels: Panel[] }

/**
 * Lumiverse gives an extension 4 floating windows. The main window has one, so
 * up to 3 panels; the stage and the arcade borrow theirs while the panels are
 * hidden behind them.
 */
export const MAX_PANELS = 3;

/** Panels past the limit (an older saved layout) pour back into the main window, so nothing goes missing. */
export function capPanels(l: Layout, max = MAX_PANELS): Layout {
  return l.panels.length <= max ? l : { panels: l.panels.slice(0, max) };
}

/** The gap between the main window and a panel attached to it. */
export const GAP = 6;

export const emptyLayout = (): Layout => ({ panels: [] });

/** Which panel holds a section (null: the main window). */
export function panelOf(l: Layout, part: string): Panel | null {
  return l.panels.find((p) => p.parts.includes(part)) ?? null;
}

function without(l: Layout, parts: string[]): Panel[] {
  return l.panels.map((p) => ({ ...p, parts: p.parts.filter((x) => !parts.includes(x)) })).filter((p) => p.parts.length);
}

function nextId(l: Layout): string {
  let n = 1;
  while (l.panels.some((p) => p.id === `p${n}`)) n++;
  return `p${n}`;
}

/**
 * Move a section into the main window (`to` null) or into a panel, at `index`
 * (last when left out). Emptied panels close.
 */
export function movePart(l: Layout, part: string, to: string | null, index?: number): Layout {
  const from = panelOf(l, part);
  if (to && from?.id === to) {
    // Reordering inside one panel.
    const parts = from.parts.filter((x) => x !== part);
    const was = from.parts.indexOf(part);
    const i = index === undefined ? parts.length : index > was ? index - 1 : index;
    parts.splice(Math.max(0, Math.min(i, parts.length)), 0, part);
    return updatePanel(l, from.id, { parts });
  }
  if (to && !l.panels.some((p) => p.id === to)) return l;
  const panels = without(l, [part]);
  if (!to) return { panels };
  return {
    panels: panels.map((p) => {
      if (p.id !== to) return p;
      const parts = [...p.parts];
      parts.splice(index === undefined ? parts.length : Math.max(0, Math.min(index, parts.length)), 0, part);
      return { ...p, parts };
    }),
  };
}

/** Tear a section out into a new panel of its own at (x, y). */
export function tearOff(l: Layout, part: string, x: number, y: number): Layout {
  const panels = without(l, [part]);
  return { panels: [...panels, { id: nextId({ panels: l.panels }), parts: [part], x, y, attach: null }] };
}

/** Pour a whole panel into another panel, or back into the main window (`to` null). */
export function mergePanel(l: Layout, id: string, to: string | null): Layout {
  const src = l.panels.find((p) => p.id === id);
  if (!src || id === to) return l;
  const rest = l.panels.filter((p) => p.id !== id);
  if (!to) return { panels: rest };
  return { panels: rest.map((p) => (p.id === to ? { ...p, parts: [...p.parts, ...src.parts] } : p)) };
}

export function updatePanel(l: Layout, id: string, patch: Partial<Panel>): Layout {
  return { panels: l.panels.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

// ───────────────────────── geometry ─────────────────────────

export const inside = (pt: { x: number; y: number }, b: Box) => pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h;

/** How much two boxes overlap, as a share of the smaller one. */
export function overlapShare(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.max(1, Math.min(a.w * a.h, b.w * b.h));
}

/** A panel dropped next to the main window: the side it hugs, if it's close enough. */
export function sideFor(b: Box, main: Box, snap = SNAP): Attach | null {
  const vOverlap = Math.min(b.y + b.h, main.y + main.h) - Math.max(b.y, main.y);
  const hOverlap = Math.min(b.x + b.w, main.x + main.w) - Math.max(b.x, main.x);
  const near = (a: number, c: number) => Math.abs(a - c) <= snap;
  const offY = Math.round(b.y - main.y), offX = Math.round(b.x - main.x);
  if (vOverlap > 24 && near(b.x + b.w, main.x - GAP)) return { side: "left", offset: offY };
  if (vOverlap > 24 && near(b.x, main.x + main.w + GAP)) return { side: "right", offset: offY };
  if (hOverlap > 24 && near(b.y, main.y + main.h + GAP)) return { side: "bottom", offset: offX };
  return null;
}

function clampBox(b: Box, vp: Viewport): Box {
  return {
    ...b,
    x: Math.round(Math.max(PAD, Math.min(b.x, vp.width - b.w - PAD))),
    y: Math.round(Math.max(PAD, Math.min(b.y, vp.height - Math.min(b.h, vp.height - 2 * PAD) - PAD))),
  };
}

/**
 * Where an attached panel of size (w, h) sits against the main window. When its
 * side has no room (the main window is against that screen edge, or is a
 * full-width strip) it tries the other side, then above or below, before
 * squeezing onto the screen.
 */
export function attachedAt(a: Attach, w: number, h: number, main: Box, vp: Viewport): Box {
  const fits = (b: Box) => b.x >= PAD / 2 && b.y >= PAD / 2 && b.x + b.w <= vp.width - PAD / 2 && b.y + b.h <= vp.height - PAD / 2;
  const along = (b: Box): Box => ({ ...b, y: Math.round(Math.max(PAD, Math.min(b.y, vp.height - Math.min(h, vp.height - 2 * PAD) - PAD))) });
  const across = (b: Box): Box => ({ ...b, x: Math.round(Math.max(PAD, Math.min(b.x, vp.width - w - PAD))) });
  const left = along({ x: main.x - GAP - w, y: main.y + a.offset, w, h });
  const right = along({ x: main.x + main.w + GAP, y: main.y + a.offset, w, h });
  const x = a.side === "bottom" ? main.x + a.offset : a.side === "left" ? main.x : main.x + main.w - w;
  const below = across({ x, y: main.y + main.h + GAP, w, h });
  const above = across({ x, y: main.y - GAP - h, w, h });
  const order = a.side === "left" ? [left, right, above, below] : a.side === "right" ? [right, left, above, below] : [below, above, right, left];
  return order.find(fits) ?? clampBox(order[0], vp);
}

/** A floating panel dropped near a screen edge sticks to it; it's always kept on screen. */
export function snapToScreen(b: Box, vp: Viewport, snap = SNAP): Box {
  let { x, y } = b;
  if (x < PAD + snap) x = PAD;
  if (x + b.w > vp.width - PAD - snap) x = vp.width - PAD - b.w;
  if (y < PAD + snap) y = PAD;
  if (y + b.h > vp.height - PAD - snap) y = vp.height - PAD - b.h;
  return clampBox({ ...b, x, y }, vp);
}

/** Where a dragged section would slot into a list of section rows (their top and height). */
export function slotAt(y: number, rows: { y: number; h: number }[]): number {
  const i = rows.findIndex((r) => y < r.y + r.h / 2);
  return i < 0 ? rows.length : i;
}

// ───────────────────────── saving ─────────────────────────

export function parseLayout(raw: string | null): Layout {
  try {
    const v = JSON.parse(raw ?? "") as Layout;
    if (!Array.isArray(v?.panels)) return emptyLayout();
    const seen = new Set<string>();
    const panels: Panel[] = [];
    for (const p of v.panels) {
      if (!p || typeof p.id !== "string" || !Array.isArray(p.parts)) continue;
      const parts = p.parts.filter((x): x is string => typeof x === "string" && !seen.has(x));
      parts.forEach((x) => seen.add(x));
      if (!parts.length || panels.some((q) => q.id === p.id)) continue;
      const side = p.attach?.side;
      panels.push({
        id: p.id, parts,
        x: Number.isFinite(p.x) ? p.x : 80, y: Number.isFinite(p.y) ? p.y : 80,
        attach: side === "left" || side === "right" || side === "bottom" ? { side, offset: Number(p.attach!.offset) || 0 } : null,
        ...(p.folded ? { folded: true } : {}),
      });
    }
    return { panels };
  } catch {
    return emptyLayout();
  }
}
