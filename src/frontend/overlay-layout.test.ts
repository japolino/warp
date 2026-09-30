import { describe, expect, test } from "bun:test";
import { attachedBox, edgeForDrop, PAD, PANEL_W, PILL, SIDE_W, STRIP_H } from "./overlay-layout.js";

const vp = { width: 1600, height: 900 };
const panel = (x: number, y: number) => ({ x, y, w: PANEL_W, h: 400 });

describe("snapping to screen edges", () => {
  test("dropping against an edge while moving toward it attaches there", () => {
    expect(edgeForDrop({ x: 600, y: 200 }, panel(PAD, 200), vp)).toBe("left");
    expect(edgeForDrop({ x: 600, y: 200 }, panel(vp.width - PANEL_W - PAD, 220), vp)).toBe("right");
    expect(edgeForDrop({ x: 600, y: 300 }, panel(610, PAD), vp)).toBe("top");
    expect(edgeForDrop({ x: 600, y: 300 }, panel(590, vp.height - 400 - PAD), vp)).toBe("bottom");
  });

  test("a drop in open space floats", () => {
    expect(edgeForDrop({ x: 600, y: 200 }, panel(700, 260), vp)).toBeNull();
  });

  test("touching an edge you didn't move toward doesn't snap (sidebar pulled sideways stays floating)", () => {
    // Was attached left at full height; dragged right along the top — still touching top, but moved horizontally.
    expect(edgeForDrop({ x: PAD, y: PAD }, { x: 700, y: PAD, w: PANEL_W, h: 420 }, vp)).toBeNull();
  });

  test("corners go to the axis moved most", () => {
    expect(edgeForDrop({ x: 900, y: 150 }, panel(PAD, PAD), vp)).toBe("left");
    expect(edgeForDrop({ x: 200, y: 600 }, panel(PAD, PAD), vp)).toBe("top");
  });
});

describe("attached geometry", () => {
  test("sidebars are full height, strips full width, all inside the host's 12px inset", () => {
    expect(attachedBox("left", true, vp)).toEqual({ x: PAD, y: PAD, w: SIDE_W, h: vp.height - 2 * PAD });
    expect(attachedBox("right", true, vp)).toEqual({ x: vp.width - SIDE_W - PAD, y: PAD, w: SIDE_W, h: vp.height - 2 * PAD });
    expect(attachedBox("top", true, vp)).toEqual({ x: PAD, y: PAD, w: vp.width - 2 * PAD, h: STRIP_H });
    expect(attachedBox("bottom", true, vp)).toEqual({ x: PAD, y: vp.height - STRIP_H - PAD, w: vp.width - 2 * PAD, h: STRIP_H });
  });

  test("collapsed, the pill stays on its edge", () => {
    expect(attachedBox("right", false, vp)).toMatchObject({ x: vp.width - PILL.w - PAD, y: PAD, w: PILL.w, h: PILL.h });
    expect(attachedBox("bottom", false, vp).y).toBe(vp.height - PILL.h - PAD);
  });
});
