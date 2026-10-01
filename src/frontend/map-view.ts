// The map section's zoom and pan. Scroll to zoom around the pointer, drag to
// look around, buttons for both; a drag never counts as a click on a place.
// What you were looking at is kept per map, so re-renders don't reset it.

export interface ViewBox { x: number; y: number; w: number; h: number }

export const MAX_ZOOM = 5;

export function parseBox(s: string | undefined | null): ViewBox | null {
  const n = (s ?? "").trim().split(/[\s,]+/).map(Number);
  return n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0 ? { x: n[0], y: n[1], w: n[2], h: n[3] } : null;
}

const fmt = (b: ViewBox) => [b.x, b.y, b.w, b.h].map((v) => Math.round(v * 100) / 100).join(" ");

/** Keep a view inside the whole map: no further out than all of it, no nearer than MAX_ZOOM. */
export function clampView(v: ViewBox, base: ViewBox): ViewBox {
  const w = Math.max(base.w / MAX_ZOOM, Math.min(base.w, v.w));
  const h = w * (base.h / base.w);
  const x = Math.max(base.x, Math.min(v.x, base.x + base.w - w));
  const y = Math.max(base.y, Math.min(v.y, base.y + base.h - h));
  return { x, y, w, h };
}

/** Zoom by `factor` (>1 nearer) keeping the map point at (px, py) where it is. */
export function zoomAt(v: ViewBox, base: ViewBox, factor: number, px: number, py: number): ViewBox {
  const w = Math.max(base.w / MAX_ZOOM, Math.min(base.w, v.w / factor));
  const k = w / v.w;
  return clampView({ x: px - (px - v.x) * k, y: py - (py - v.y) * k, w, h: v.h * k }, base);
}

/** Look around by (dx, dy) map units. */
export const panBy = (v: ViewBox, base: ViewBox, dx: number, dy: number): ViewBox => clampView({ ...v, x: v.x - dx, y: v.y - dy }, base);

/** Centre on a point, at least `zoom` in. */
export function centreOn(v: ViewBox, base: ViewBox, px: number, py: number, zoom: number): ViewBox {
  const w = Math.min(v.w, base.w / zoom);
  const h = w * (base.h / base.w);
  return clampView({ x: px - w / 2, y: py - h / 2, w, h }, base);
}

// ───────────────────────── in the page ─────────────────────────

const views = new Map<string, ViewBox>();

/** Put each map in `root` back where the player left it. */
export function restoreMaps(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("[data-map]").forEach((el) => {
    const v = views.get(el.dataset.map!);
    const svg = el.querySelector("svg");
    if (v && svg) svg.setAttribute("viewBox", fmt(v));
    el.classList.toggle("zoomed", !!v);
  });
}

function setView(el: HTMLElement, v: ViewBox) {
  const base = parseBox(el.dataset.map)!;
  const whole = v.w >= base.w - 0.01;
  if (whole) views.delete(el.dataset.map!); else views.set(el.dataset.map!, v);
  el.querySelector("svg")?.setAttribute("viewBox", fmt(whole ? base : v));
  el.classList.toggle("zoomed", !whole);
}

function current(el: HTMLElement): { v: ViewBox; base: ViewBox } | null {
  const base = parseBox(el.dataset.map);
  if (!base) return null;
  return { base, v: views.get(el.dataset.map!) ?? base };
}

/** A screen point in the map's own units. */
function toMap(svg: SVGSVGElement, x: number, y: number): { x: number; y: number } | null {
  const m = svg.getScreenCTM?.();
  if (!m) return null;
  const p = new DOMPoint(x, y).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

/** Wire zoom and pan into a root whose maps re-render inside it. Returns a cleanup. */
export function wireMaps(root: HTMLElement): () => void {
  let drag: { el: HTMLElement; svg: SVGSVGElement; id: number; x: number; y: number; scale: number; moved: boolean } | null = null;
  let swallowClick = false;

  const onWheel = (e: WheelEvent) => {
    const el = (e.target as Element).closest?.<HTMLElement>("[data-map]");
    const svg = el?.querySelector("svg");
    if (!el || !svg || !root.contains(el)) return;
    const c = current(el);
    const p = toMap(svg, e.clientX, e.clientY);
    if (!c || !p) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    setView(el, zoomAt(c.v, c.base, Math.exp(-dy * 0.0018), p.x, p.y));
  };
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const t = e.target as Element;
    if (t.closest?.("[data-map-zoom]")) return;
    const el = t.closest?.<HTMLElement>("[data-map]");
    const svg = el?.querySelector("svg");
    const m = svg?.getScreenCTM?.();
    if (!el || !svg || !m) return;
    drag = { el, svg, id: e.pointerId, x: e.clientX, y: e.clientY, scale: m.a || 1, moved: false };
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.el.classList.add("panning");
      try { drag.svg.setPointerCapture(e.pointerId); } catch { /* fine without */ }
    }
    const c = current(drag.el);
    if (c) setView(drag.el, panBy(c.v, c.base, dx / drag.scale, dy / drag.scale));
    drag.x = e.clientX; drag.y = e.clientY;
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) { swallowClick = true; setTimeout(() => { swallowClick = false; }, 0); }
    drag.el.classList.remove("panning");
    drag = null;
  };
  // A drag that ends over a place isn't a trip there.
  const onClick = (e: MouseEvent) => {
    if (swallowClick) { e.preventDefault(); e.stopPropagation(); swallowClick = false; return; }
    const btn = (e.target as Element).closest?.<HTMLElement>("[data-map-zoom]");
    const el = btn?.closest<HTMLElement>("[data-map]");
    if (!btn || !el) return;
    e.stopPropagation();
    const c = current(el);
    if (!c) return;
    const cx = c.v.x + c.v.w / 2, cy = c.v.y + c.v.h / 2;
    const z = btn.dataset.mapZoom;
    if (z === "in") setView(el, zoomAt(c.v, c.base, 1.5, cx, cy));
    else if (z === "out") setView(el, zoomAt(c.v, c.base, 1 / 1.5, cx, cy));
    else {
      const here = (el.dataset.mapHere ?? "").split(" ").map(Number);
      if (here.length === 2 && here.every(Number.isFinite)) setView(el, centreOn(c.v, c.base, here[0], here[1], 2));
    }
  };
  root.addEventListener("wheel", onWheel, { passive: false });
  root.addEventListener("pointerdown", onDown);
  root.addEventListener("click", onClick, true);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  return () => {
    root.removeEventListener("wheel", onWheel);
    root.removeEventListener("pointerdown", onDown);
    root.removeEventListener("click", onClick, true);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
}
