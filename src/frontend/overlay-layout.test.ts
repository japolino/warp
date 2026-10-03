import { describe, expect, test } from "bun:test";
import { attachedBox, edgeForDrop, floatingBox, PAD, PANEL_W, panelWidth, PILL, SIDE_W, STRIP_H, type Box } from "./overlay-layout.js";

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

describe("phones: the panel fits a 360px-wide screen", () => {
  const phone = { width: 360, height: 740 };
  const inside = (b: Box, vp = phone) => b.x >= PAD && b.y >= PAD && b.x + b.w <= vp.width - PAD && b.y + b.h <= vp.height - PAD;

  test("floating, open or collapsed, it stays on screen at full panel width", () => {
    expect(panelWidth(phone)).toBe(PANEL_W);
    expect(inside(floatingBox(phone, true, 420))).toBe(true);
    expect(inside(floatingBox(phone, false, 420))).toBe(true);
    expect(inside(floatingBox(phone, true, 2000))).toBe(true);
  });

  test("docked to any edge it stays on screen", () => {
    for (const e of ["left", "right", "top", "bottom"] as const) {
      expect(inside(attachedBox(e, true, phone))).toBe(true);
      expect(inside(attachedBox(e, false, phone))).toBe(true);
    }
  });

  test("on a narrower screen the panel shrinks to fit", () => {
    const tiny = { width: 300, height: 600 };
    expect(panelWidth(tiny)).toBe(300 - 2 * PAD);
    expect(inside(floatingBox(tiny, true, 420), tiny)).toBe(true);
    expect(inside(attachedBox("right", true, tiny), tiny)).toBe(true);
  });

  test("on a desktop nothing changes", () => {
    expect(floatingBox(vp, true, 420)).toEqual({ x: vp.width - PANEL_W - 20, y: 72, w: PANEL_W, h: 420 });
  });
});
