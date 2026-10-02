import { describe, expect, test } from "bun:test";
import { attachedAt, capPanels, GAP, MAX_PANELS, mergePanel, movePart, panelOf, parseLayout, sideFor, slotAt, snapToScreen, tearOff, type Layout } from "./panels.js";
import { centreOn, clampView, MAX_ZOOM, panBy, zoomAt } from "./map-view.js";

const vp = { width: 1400, height: 900 };
const main = { x: 1000, y: 80, w: 290, h: 500 };

describe("torn-off panels", () => {
  test("a section dragged out gets a window of its own; dropped back, it's in the main window again", () => {
    let l: Layout = { panels: [] };
    l = tearOff(l, "map", 200, 120);
    expect(panelOf(l, "map")).toMatchObject({ id: "p1", parts: ["map"], x: 200, y: 120, attach: null });
    l = movePart(l, "map", null);
    expect(l.panels).toEqual([]);
  });

  test("sections merge into a panel at the slot they're dropped on, and reorder inside it", () => {
    let l = tearOff({ panels: [] }, "map", 200, 120);
    l = movePart(l, "people", "p1", 0);
    expect(l.panels[0].parts).toEqual(["people", "map"]);
    l = movePart(l, "inventory", "p1");
    expect(l.panels[0].parts).toEqual(["people", "map", "inventory"]);
    l = movePart(l, "inventory", "p1", 0);
    expect(l.panels[0].parts).toEqual(["inventory", "people", "map"]);
    l = movePart(l, "inventory", "p1", 3);
    expect(l.panels[0].parts).toEqual(["people", "map", "inventory"]);
  });

  test("moving a panel's last section out closes it; a section is only ever in one place", () => {
    let l = tearOff({ panels: [] }, "map", 200, 120);
    l = tearOff(l, "people", 400, 120);
    l = movePart(l, "map", "p2");
    expect(l.panels).toHaveLength(1);
    expect(l.panels[0]).toMatchObject({ id: "p2", parts: ["people", "map"] });
    l = tearOff(l, "map", 10, 10);
    expect(l.panels.map((p) => p.parts)).toEqual([["people"], ["map"]]);
  });

  test("a whole panel merges into another, or back into the main window", () => {
    let l = tearOff(tearOff({ panels: [] }, "map", 0, 0), "people", 0, 0);
    l = mergePanel(l, "p1", "p2");
    expect(l.panels).toEqual([expect.objectContaining({ id: "p2", parts: ["people", "map"] })]);
    expect(mergePanel(l, "p2", null).panels).toEqual([]);
  });

  test("dropped beside the main window, a panel attaches to that side and follows it", () => {
    const left = sideFor({ x: main.x - GAP - 290, y: 200, w: 290, h: 200 }, main);
    expect(left).toEqual({ side: "left", offset: 120 });
    expect(sideFor({ x: main.x + main.w + GAP + 10, y: 100, w: 290, h: 200 }, main)?.side).toBe("right");
    expect(sideFor({ x: 1000, y: main.y + main.h + GAP, w: 290, h: 200 }, main)?.side).toBe("bottom");
    expect(sideFor({ x: 300, y: 200, w: 290, h: 200 }, main)).toBeNull();
    // Follows the main window wherever it goes.
    const moved = { ...main, x: 700, y: 40 };
    expect(attachedAt(left!, 290, 200, moved, vp)).toEqual({ x: 700 - GAP - 290, y: 160, w: 290, h: 200 });
  });

  test("an attached panel flips sides rather than leave the screen", () => {
    const b = attachedAt({ side: "right", offset: 0 }, 290, 200, main, vp);
    expect(b.x).toBe(main.x - GAP - 290);
  });

  test("floating panels stick to screen edges and stay on screen", () => {
    expect(snapToScreen({ x: 20, y: 30, w: 290, h: 200 }, vp)).toMatchObject({ x: 12, y: 12 });
    expect(snapToScreen({ x: 1300, y: 850, w: 290, h: 200 }, vp)).toMatchObject({ x: 1400 - 12 - 290, y: 900 - 12 - 200 });
    expect(snapToScreen({ x: 500, y: 300, w: 290, h: 200 }, vp)).toMatchObject({ x: 500, y: 300 });
  });

  test("the drop slot is the first row whose middle is below the pointer", () => {
    const rows = [{ y: 0, h: 40 }, { y: 40, h: 40 }, { y: 80, h: 40 }];
    expect(slotAt(5, rows)).toBe(0);
    expect(slotAt(45, rows)).toBe(1);
    expect(slotAt(500, rows)).toBe(3);
  });

  test("a saved layout is read back safely", () => {
    const l = tearOff(tearOff({ panels: [] }, "map", 10, 20), "people", 30, 40);
    l.panels[1].attach = { side: "left", offset: 12 };
    expect(parseLayout(JSON.stringify(l))).toEqual(l);
    expect(parseLayout("not json")).toEqual({ panels: [] });
    expect(parseLayout(JSON.stringify({ panels: [{ id: "a", parts: ["map"] }, { id: "b", parts: ["map", "x"], attach: { side: "up" } }] })).panels)
      .toEqual([{ id: "a", parts: ["map"], x: 80, y: 80, attach: null }, { id: "b", parts: ["x"], x: 80, y: 80, attach: null }]);
  });
});

describe("map zoom and pan", () => {
  const base = { x: 0, y: 0, w: 400, h: 200 };

  test("zooming keeps the point under the pointer where it is", () => {
    const v = zoomAt(base, base, 2, 100, 50);
    expect(v).toEqual({ x: 50, y: 25, w: 200, h: 100 });
    // The pointer's point sits at the same fraction of the view as before.
    expect((100 - v.x) / v.w).toBeCloseTo(100 / 400);
  });

  test("never further out than the whole map, nor nearer than the limit", () => {
    expect(zoomAt(base, base, 0.2, 200, 100)).toEqual(base);
    expect(zoomAt(base, base, 1000, 200, 100).w).toBeCloseTo(400 / MAX_ZOOM);
  });

  test("panning stays inside the map", () => {
    const v = zoomAt(base, base, 2, 200, 100);
    expect(panBy(v, base, 30, 0).x).toBe(v.x - 30);
    expect(panBy(v, base, 1000, 1000)).toMatchObject({ x: 0, y: 0 });
    expect(panBy(v, base, -1000, -1000)).toMatchObject({ x: 200, y: 100 });
    expect(clampView({ x: -50, y: 0, w: 400, h: 200 }, base)).toEqual(base);
  });

  test("centring on where you are zooms in and frames it", () => {
    const v = centreOn(base, base, 300, 100, 2);
    expect(v).toEqual({ x: 200, y: 50, w: 200, h: 100 });
  });
});

describe("attached panels with no room beside the main window", () => {
  test("a full-width strip along the bottom: the panel goes above it", () => {
    const strip = { x: 12, y: 520, w: 1376, h: 190 };
    expect(attachedAt({ side: "left", offset: 0 }, 340, 300, strip, vp)).toEqual({ x: 12, y: 520 - GAP - 300, w: 340, h: 300 });
  });
});

test("Lumiverse allows 4 floating windows: panels past 3 (an older saved layout) go back to the main window", () => {
  expect(MAX_PANELS).toBe(3);
  const l = parseLayout(JSON.stringify({ panels: [1, 2, 3, 4, 5].map((n) => ({ id: `p${n}`, parts: [`s${n}`], x: 0, y: 0, attach: null })) }));
  const capped = capPanels(l);
  expect(capped.panels.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  expect(panelOf(capped, "s4")).toBeNull();
  expect(capPanels(capped)).toBe(capped);
});
