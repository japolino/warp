// The torn-off panels as floating windows. Hold a section's header in the main
// window (or a panel) and drag it out: it becomes a window of its own. Drop it
// on the main window to put it back, on a panel to join it; drag a whole panel
// onto either to merge, or against a side of the main window to attach it there.

import type { SpindleFloatWidgetHandle, SpindleFrontendContext } from "lumiverse-spindle-types";
import { PANEL_W, PILL, type Box, type Viewport } from "./overlay-layout.js";
import {
  attachedAt, capPanels, inside, MAX_PANELS, mergePanel, movePart, overlapShare, panelOf, parseLayout, sideFor, slotAt, snapToScreen, tearOff, updatePanel,
  type Layout, type Panel,
} from "./panels.js";
import { esc, renderPart, type HudPart } from "./render.js";
import { restoreMaps, wireMaps } from "./map-view.js";

interface Win { id: string; handle: SpindleFloatWidgetHandle; el: HTMLElement; head: HTMLElement; body: HTMLElement; box: Box; shown: boolean; html: string; off: (() => void)[] }

export interface PanelHost {
  ctx: SpindleFrontendContext;
  viewport(): Viewport;
  /** The main window: where it is (layout px), its element, and whether it's open. Null when it's hidden. */
  main(): { box: Box; el: HTMLElement; open: boolean } | null;
  /** Whether panels show at all right now (no game, or the stage is up: no). */
  shown(): boolean;
  /** Hook up the usual HUD clicks and inputs on a panel's body. */
  wire(body: HTMLElement): void;
  rememberSections(root: HTMLElement): void;
  restoreSections(root: HTMLElement): void;
  /** Sections moved in or out of the main window: redraw it. */
  changed(): void;
  load(): string | null;
  save(v: string): void;
}

const MAP_W = 340;
const widthFor = (parts: string[]) => (parts.includes("map") ? MAP_W : PANEL_W);

export function createPanels(o: PanelHost) {
  let layout: Layout = capPanels(parseLayout(o.load()));
  let parts: HudPart[] = [];
  const wins = new Map<string, Win>();
  const cleanups: (() => void)[] = [];

  /** Client px (pointer, rects) to the host's layout px (widget positions). */
  const scale = () => { try { return o.ctx.ui.geometry?.getUiScale() || 1; } catch { return 1; } };
  const toLayout = (v: number) => v / scale();
  const rect = (el: Element): Box => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };

  function commit(next: Layout) {
    layout = next;
    o.save(JSON.stringify(layout));
    o.changed();
  }

  function makeWin(p: Panel): Win | null {
    const el = document.createElement("div");
    el.className = "warp-overlay warp-panel";
    el.innerHTML = `<div class="warp-overlay-head" title="Drag to move · drop on the main window to put it back, or on another panel to merge"></div><div class="warp-overlay-body warp-root"></div>`;
    const head = el.firstElementChild as HTMLElement;
    const body = el.lastElementChild as HTMLElement;
    const w = widthFor(p.parts);
    let handle: SpindleFloatWidgetHandle;
    try {
      handle = o.ctx.ui.createFloatWidget({ width: w, height: 200, initialPosition: { x: p.x, y: p.y }, snapToEdge: false, tooltip: "Warp", chromeless: true });
    } catch { return null; }
    handle.root.appendChild(el);
    handle.setVisible(false);
    const win: Win = { id: p.id, handle, el, head, body, box: { x: p.x, y: p.y, w, h: 200 }, shown: false, html: "", off: [] };
    body.addEventListener("pointerdown", (e) => {
      if (!(e.target as Element).closest?.("input, select, textarea")) e.preventDefault();
    });
    body.addEventListener("pointerdown", (e) => startSectionDrag(e, p.id));
    o.wire(body);
    win.off.push(wireMaps(body));
    head.addEventListener("pointerdown", (e) => { if (e.button === 0) panelDrag = { id: win.id, at: { x: e.clientX, y: e.clientY } }; });
    head.addEventListener("click", (e) => {
      const t = e.target as Element;
      if (t.closest("[data-panel-home]")) { commit(mergePanel(layout, win.id, null)); return; }
      if (t.closest("[data-panel-fold]")) {
        const cur = layout.panels.find((q) => q.id === win.id);
        if (cur) commit(updatePanel(layout, win.id, { folded: !cur.folded }));
      }
    });
    win.off.push(handle.onDragEnd((pos) => dropPanel(win, pos)));
    return win;
  }

  function destroyWin(w: Win) {
    for (const f of w.off.splice(0)) { try { f(); } catch { /* keep going */ } }
    try { w.handle.destroy(); } catch { /* gone already */ }
    wins.delete(w.id);
  }

  function place(w: Win, b: Box) {
    if (b.w !== w.box.w || b.h !== w.box.h) w.handle.setSize(b.w, b.h);
    const p = w.handle.getPosition();
    if (Math.round(p.x) !== Math.round(b.x) || Math.round(p.y) !== Math.round(b.y)) w.handle.moveTo(b.x, b.y);
    w.box = b;
  }

  /** Where a panel belongs now: against the main window when attached, else where it was left. */
  function boxFor(p: Panel, w: number, h: number): Box {
    const vp = o.viewport();
    const m = o.main();
    if (p.attach && m) return attachedAt(p.attach, w, h, m.box, vp);
    return snapToScreen({ x: p.x, y: p.y, w, h }, vp, 0);
  }

  function heightFor(win: Win, folded: boolean): number {
    if (folded) return PILL.h;
    const vp = o.viewport();
    const maxH = Math.max(160, vp.height - 140);
    win.el.style.setProperty("--warp-overlay-max", `${maxH - PILL.h}px`);
    return Math.min(maxH, PILL.h + win.body.scrollHeight + 2);
  }

  /** Draw every panel from the layout and the HUD's current sections. */
  function sync() {
    const byId = new Map(parts.map((p) => [p.id, p]));
    const m = o.main();
    const show = o.shown();
    for (const w of wins.values()) if (!layout.panels.some((p) => p.id === w.id)) destroyWin(w);
    for (const p of layout.panels) {
      const here = p.parts.map((id) => byId.get(id)).filter((x): x is HudPart => !!x);
      // Attached panels fold away with the main window; a panel with nothing to show stays hidden.
      const visible = show && here.length > 0 && (!p.attach || (!!m && m.open));
      let w = wins.get(p.id);
      // A hidden panel gives its window back (the stage and the arcade need one), and gets a new one when it shows again.
      if (!visible) { if (w) destroyWin(w); continue; }
      if (!w) {
        const made = makeWin(p);
        // No window to be had: its sections go back to the main window rather than vanish.
        if (!made) { commit(mergePanel(layout, p.id, null)); return; }
        w = made; wins.set(p.id, w);
      }
      const single = here.length === 1;
      const title = here.map((x) => `${x.title}${x.count ? ` · ${x.count}` : ""}`).join(" · ");
      w.head.innerHTML = `<span class="warp-overlay-title">${esc(title)}</span>
        <span class="warp-overlay-actions">
          <button class="warp-btn warp-btn-ghost" data-panel-home title="Put back in the main window" aria-label="Put back in the main window">⤺</button>
          <button class="warp-btn warp-btn-ghost" data-panel-fold title="${p.folded ? "Expand" : "Collapse"}" aria-label="${p.folded ? "Expand" : "Collapse"}">${p.folded ? "+" : "–"}</button>
        </span>`;
      w.el.classList.toggle("warp-overlay-collapsed", !!p.folded);
      w.el.dataset.attach = p.attach?.side ?? "";
      // One section: its body fills the panel (the head names it). Several: each keeps a header to drag it on again.
      const html = single ? `<div class="warp-panel-solo" data-solo="${esc(here[0].id)}">${here[0].body}</div>` : here.map((x) => renderPart(x, true)).join("");
      if (html !== w.html) {
        const kept = w.body.scrollTop;
        o.rememberSections(w.body);
        w.body.innerHTML = html;
        w.html = html;
        o.restoreSections(w.body);
        restoreMaps(w.body);
        w.body.scrollTop = kept;
      }
      if (!w.shown) { w.handle.setVisible(true); w.shown = true; }
      const win = w;
      const width = widthFor(p.parts);
      place(win, boxFor(p, width, win.box.h));
      requestAnimationFrame(() => place(win, boxFor(p, width, heightFor(win, !!p.folded))));
    }
  }

  /** The main window moved or changed size: attached panels come along. */
  function follow() {
    const m = o.main();
    if (!m) return;
    for (const p of layout.panels) {
      const w = wins.get(p.id);
      if (w?.shown && p.attach) place(w, attachedAt(p.attach, w.box.w, w.box.h, m.box, o.viewport()));
    }
  }

  // ───────── dropping a whole panel ─────────
  let panelDrag: { id: string; at: { x: number; y: number } } | null = null;
  let pointer: { x: number; y: number } | null = null;

  /** What's under a client point: the main window, a panel (not `skip`), or nothing. */
  function targetAt(pt: { x: number; y: number }, skip: string | null): { kind: "main" } | { kind: "panel"; id: string } | null {
    for (const w of wins.values()) if (w.shown && w.id !== skip && inside(pt, rect(w.el))) return { kind: "panel", id: w.id };
    const m = o.main();
    if (m?.open && inside(pt, rect(m.el))) return { kind: "main" };
    return null;
  }

  function highlight(t: ReturnType<typeof targetAt>) {
    const m = o.main();
    m?.el.classList.toggle("warp-drop-target", t?.kind === "main");
    for (const w of wins.values()) w.el.classList.toggle("warp-drop-target", t?.kind === "panel" && t.id === w.id);
  }

  function dropPanel(win: Win, pos: { x: number; y: number }) {
    const pt = pointer;
    panelDrag = null;
    highlight(null);
    const p = layout.panels.find((q) => q.id === win.id);
    if (!p) return;
    const box: Box = { ...win.box, x: pos.x, y: pos.y };
    win.box = box;
    const m = o.main();
    // Dropped onto the main window or another panel (by the pointer, or mostly covering it): merge.
    const t = pt ? targetAt(pt, win.id) : null;
    if (t?.kind === "main" || (!t && m?.open && overlapShare(box, m.box) > 0.5)) { commit(mergePanel(layout, win.id, null)); return; }
    const other = t?.kind === "panel" ? t.id : [...wins.values()].find((w) => w.id !== win.id && w.shown && overlapShare(box, w.box) > 0.5)?.id;
    if (other) { commit(mergePanel(layout, win.id, other)); return; }
    const attach = m?.open ? sideFor(box, m.box) : null;
    const b = attach ? box : snapToScreen(box, o.viewport());
    commit(updatePanel(layout, win.id, { x: b.x, y: b.y, attach }));
  }

  // ───────── dragging a section out ─────────
  let sec: { part: string; from: string | null; id: number; x: number; y: number; started: boolean; ghost: HTMLElement | null; summary: HTMLElement } | null = null;
  let swallowClick = false;

  /** Pointer down on a section's header, in the main window (`from` null) or a panel. */
  function startSectionDrag(e: PointerEvent, from: string | null) {
    if (e.button !== 0) return;
    const summary = (e.target as Element).closest?.<HTMLElement>("summary[data-part]");
    if (!summary) return;
    sec = { part: summary.dataset.part!, from, id: e.pointerId, x: e.clientX, y: e.clientY, started: false, ghost: null, summary };
  }

  const onMove = (e: PointerEvent) => {
    pointer = { x: e.clientX, y: e.clientY };
    if (panelDrag) {
      if (Math.hypot(e.clientX - panelDrag.at.x, e.clientY - panelDrag.at.y) > 4) highlight(targetAt(pointer, panelDrag.id));
      return;
    }
    if (!sec || e.pointerId !== sec.id) return;
    if (!sec.started) {
      if (Math.hypot(e.clientX - sec.x, e.clientY - sec.y) < 7) return;
      sec.started = true;
      const ghost = document.createElement("div");
      ghost.className = "warp-drag-ghost";
      ghost.textContent = sec.summary.textContent?.trim() ?? "";
      document.body.appendChild(ghost);
      sec.ghost = ghost;
      sec.summary.closest("details")?.classList.add("warp-dragging");
      try { sec.summary.setPointerCapture(e.pointerId); } catch { /* fine without */ }
    }
    const t = targetAt(pointer, null);
    highlight(t?.kind === "main" && sec.from === null ? null : t);
    sec.ghost!.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 8}px)`;
    const full = !t && atLimit(sec.from);
    sec.ghost!.classList.toggle("warp-ghost-new", !t && !full);
    sec.ghost!.dataset.full = full ? "joins the nearest panel (3 at most)" : "";
  };

  const onUp = (e: PointerEvent) => {
    if (panelDrag && !sec) { setTimeout(() => { if (panelDrag) { panelDrag = null; highlight(null); } }, 50); }
    if (!sec || e.pointerId !== sec.id) return;
    const s = sec;
    sec = null;
    if (!s.started) return;
    s.ghost?.remove();
    s.summary.closest("details")?.classList.remove("warp-dragging");
    highlight(null);
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 0);
    const pt = { x: e.clientX, y: e.clientY };
    const t = targetAt(pt, null);
    if (t?.kind === "main") {
      if (s.from !== null) commit(movePart(layout, s.part, null));
      return;
    }
    if (t?.kind === "panel") {
      const w = wins.get(t.id)!;
      const rows = [...w.body.querySelectorAll<HTMLElement>(":scope > details[data-section]")].map((d) => rect(d));
      const index = rows.length ? slotAt(pt.y, rows) : undefined;
      commit(movePart(layout, s.part, t.id, index));
      return;
    }
    // No room for another window: it joins the panel nearest the drop.
    if (atLimit(s.from)) {
      const near = nearestPanel(pt);
      if (near && near !== s.from) commit(movePart(layout, s.part, near));
      return;
    }
    // Out in the open: a window of its own, where it was dropped — attached if it's right beside the main window.
    const x = toLayout(pt.x) - 24, y = toLayout(pt.y) - 14;
    let next = tearOff(layout, s.part, x, y);
    const made = panelOf(next, s.part)!;
    const m = o.main();
    const box: Box = { x, y, w: widthFor([s.part]), h: 200 };
    const attach = m?.open ? sideFor(box, m.box, 60) : null;
    const b = attach ? box : snapToScreen(box, o.viewport());
    next = updatePanel(next, made.id, { x: b.x, y: b.y, attach });
    commit(next);
  };

  /** Tearing a section out would need a window past the limit (a panel's only section just moves its window: no new one). */
  function atLimit(from: string | null): boolean {
    const src = from ? layout.panels.find((p) => p.id === from) : null;
    if (src && src.parts.length === 1) return false;
    return layout.panels.length >= MAX_PANELS;
  }

  function nearestPanel(pt: { x: number; y: number }): string | null {
    let best: string | null = null, dist = Infinity;
    for (const w of wins.values()) {
      if (!w.shown) continue;
      const b = rect(w.el);
      const d = Math.hypot(pt.x - (b.x + b.w / 2), pt.y - (b.y + b.h / 2));
      if (d < dist) { dist = d; best = w.id; }
    }
    return best ?? layout.panels[layout.panels.length - 1]?.id ?? null;
  }

  // A drag that ends over a header isn't a click on it (it would fold the section).
  const onClickCapture = (e: MouseEvent) => {
    if (swallowClick) { e.preventDefault(); e.stopPropagation(); swallowClick = false; }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !sec?.started) return;
    sec.ghost?.remove();
    sec.summary.closest("details")?.classList.remove("warp-dragging");
    highlight(null);
    sec = null;
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  document.addEventListener("click", onClickCapture, true);
  document.addEventListener("keydown", onKey);
  cleanups.push(() => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    document.removeEventListener("click", onClickCapture, true);
    document.removeEventListener("keydown", onKey);
  });

  return {
    /** Whether a section lives in the main window. */
    inMain: (id: string) => !panelOf(layout, id),
    /** New sections from the HUD: redraw the panels. */
    render(next: HudPart[]) { parts = next; sync(); },
    sync,
    follow,
    startSectionDrag,
    /** Put every section back in the main window. */
    reset() { commit({ panels: [] }); },
    hasPanels: () => layout.panels.length > 0,
    destroy() {
      for (const c of cleanups.splice(0)) { try { c(); } catch { /* keep going */ } }
      for (const w of [...wins.values()]) destroyWin(w);
    },
  };
}
