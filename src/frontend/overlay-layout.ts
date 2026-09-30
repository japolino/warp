// Floating status overlay placement math, kept pure so it can be tested.
//
// The overlay floats over the chat. Dragged against a screen edge it attaches:
// left/right become a full-height sidebar, top/bottom a full-width strip.
// Lumiverse keeps floating widgets 12px inside the viewport, so "attached"
// means hugging that inset rather than sitting flush.

export type Edge = "left" | "right" | "top" | "bottom";

export const PAD = 12;
/** How close (beyond the inset) a drop must land to count as touching an edge. */
export const SNAP = 28;
export const PILL = { w: 150, h: 38 };
export const PANEL_W = 290;
export const SIDE_W = 300;
export const STRIP_H = 190;

export interface Box { x: number; y: number; w: number; h: number }
export interface Viewport { width: number; height: number }

/**
 * Which edge a drop attaches to. An edge counts only if the box touches it AND
 * the drag moved toward it — so a sidebar pulled sideways doesn't re-snap to the
 * top just because it's still full height. Corners go to the axis moved most.
 */
export function edgeForDrop(start: { x: number; y: number }, box: Box, vp: Viewport): Edge | null {
  const dx = box.x - start.x;
  const dy = box.y - start.y;
  const near = {
    left: box.x - PAD <= SNAP && dx < -2,
    right: vp.width - (box.x + box.w) - PAD <= SNAP && dx > 2,
    top: box.y - PAD <= SNAP && dy < -2,
    bottom: vp.height - (box.y + box.h) - PAD <= SNAP && dy > 2,
  };
  const horizontal: Edge | null = near.left ? "left" : near.right ? "right" : null;
  const vertical: Edge | null = near.top ? "top" : near.bottom ? "bottom" : null;
  if (horizontal && vertical) return Math.abs(dx) >= Math.abs(dy) ? horizontal : vertical;
  return horizontal ?? vertical;
}

/** Where and how big the overlay is when attached. */
export function attachedBox(edge: Edge, open: boolean, vp: Viewport): Box {
  if (!open) {
    switch (edge) {
      case "left": return { x: PAD, y: PAD, ...wh(PILL) };
      case "right": return { x: vp.width - PILL.w - PAD, y: PAD, ...wh(PILL) };
      case "top": return { x: Math.round((vp.width - PILL.w) / 2), y: PAD, ...wh(PILL) };
      case "bottom": return { x: Math.round((vp.width - PILL.w) / 2), y: vp.height - PILL.h - PAD, ...wh(PILL) };
    }
  }
  switch (edge) {
    case "left": return { x: PAD, y: PAD, w: SIDE_W, h: vp.height - PAD * 2 };
    case "right": return { x: vp.width - SIDE_W - PAD, y: PAD, w: SIDE_W, h: vp.height - PAD * 2 };
    case "top": return { x: PAD, y: PAD, w: vp.width - PAD * 2, h: STRIP_H };
    case "bottom": return { x: PAD, y: vp.height - STRIP_H - PAD, w: vp.width - PAD * 2, h: STRIP_H };
  }
}

function wh(s: { w: number; h: number }) {
  return { w: s.w, h: s.h };
}
