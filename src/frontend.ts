import type { SpindleFloatWidgetHandle, SpindleFrontendContext } from "lumiverse-spindle-types";
import type {
  BackendToFrontend, BuilderAnswer, BuilderSession, FrontendToBackend, RecordView, RulesetStatus, Settings, TemplateInfo,
} from "./shared/protocol.js";
import { DEFAULT_SETTINGS } from "./shared/protocol.js";
import { STYLES } from "./frontend/styles.js";
import { attachedBox, edgeForDrop, PAD, PANEL_W, PILL, type Box, type Edge, type Viewport } from "./frontend/overlay-layout.js";
import { emptyDraft, renderBuilder, renderBuilderCta, type BuilderDraft } from "./frontend/builder-ui.js";
import { renderDungeon, type DungeonPick } from "./frontend/dungeon-ui.js";
import { connectCue } from "./frontend/cue-bridge.js";
import { esc, renderChips, renderChoices, renderHud, renderJournal, renderMap, renderRulesetCard, renderSettings, renderSuggestion, renderTemplatePicker } from "./frontend/render.js";

type StateMsg = Extract<BackendToFrontend, { type: "state" }>;

const CLEANUP_KEY = "__warpCleanup";
const ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/></svg>`;

function store(key: string, value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem(`warp:${key}`, value);
    return localStorage.getItem(`warp:${key}`);
  } catch { return null; }
}

export function setup(ctx: SpindleFrontendContext) {
  const prev = (globalThis as Record<string, unknown>)[CLEANUP_KEY];
  if (typeof prev === "function") prev();

  const cleanups: (() => void)[] = [];
  cleanups.push(ctx.dom.addStyle(STYLES));

  let state: StateMsg | null = null;
  let settings: Settings = { ...DEFAULT_SETTINGS };
  let templates: TemplateInfo[] = [];
  let connections: { id: string; name: string }[] = [];
  let jevKeySet = false;
  let builder: BuilderSession | null = null;
  let bDraft: BuilderDraft = emptyDraft();
  let busy = { chatId: "", on: false, label: "" };
  let editingBar: string | null = null;
  let drawerView: "sheet" | "map" | "journal" | "dungeon" | "rules" | "settings" = "sheet";
  let dgPick: DungeonPick = null;
  const dgMates = new Set<string>();
  const openSections = new Map<string, boolean>();

  const send = (m: FrontendToBackend) => ctx.sendToBackend(m);
  const chatId = () => { try { return ctx.getActiveChat().chatId ?? null; } catch { return null; } };

  // ───────── surfaces: drawer tab (always) + left dock panel (when allowed) ─────────
  const tab = ctx.ui.registerDrawerTab({
    id: "warp",
    title: "Warp — game state",
    shortName: "Warp",
    headerTitle: "Warp",
    description: "Stats, dice, inventory, people and game settings",
    keywords: ["stats", "dice", "game", "ruleset", "rpg", "tracker"],
    iconSvg: ICON,
  });
  cleanups.push(() => tab.destroy());
  const drawerRoot = document.createElement("div");
  drawerRoot.className = "warp-root";
  tab.root.appendChild(drawerRoot);
  cleanups.push(tab.onActivate(() => renderDrawer()));

  // Status overlay: a floating widget over the chat (never pushes the conversation).
  // Collapsed it's a pill; open it's the HUD. Drag it against an edge to attach it
  // as a sidebar (left/right) or strip (top/bottom); drag it off to float again.
  const narrow = () => window.innerWidth < 760;
  const viewport = (): Viewport => {
    try { return ctx.ui.geometry?.layoutViewportSize() ?? { width: window.innerWidth, height: window.innerHeight }; }
    catch { return { width: window.innerWidth, height: window.innerHeight }; }
  };
  let overlayOpen = store("overlayOpen") !== null ? store("overlayOpen") === "1" : !narrow();
  const savedEdge = store("overlayEdge");
  let edge: Edge | null = savedEdge === "left" || savedEdge === "right" || savedEdge === "top" || savedEdge === "bottom" ? savedEdge : null;
  let overlay: SpindleFloatWidgetHandle | null = null;
  const overlayEl = document.createElement("div");
  overlayEl.className = "warp-overlay";
  overlayEl.innerHTML = `<div class="warp-overlay-head" title="Drag to move · drop on a screen edge to attach"></div><div class="warp-overlay-body warp-root"></div>`;
  const headEl = overlayEl.firstElementChild as HTMLElement;
  const dockRoot = overlayEl.lastElementChild as HTMLElement;
  // Presses inside the body scroll and click; they must not start a widget drag.
  // (Form controls are already exempt from dragging, and need their default to take focus.)
  dockRoot.addEventListener("pointerdown", (e) => {
    if (!(e.target as Element).closest?.("input, select, textarea")) e.preventDefault();
  });
  let cur: Box = { x: 0, y: 72, w: PILL.w, h: PILL.h };
  try {
    const vp = viewport();
    const w = overlayOpen ? PANEL_W : PILL.w;
    const h = overlayOpen ? 420 : PILL.h;
    const start = edge ? attachedBox(edge, overlayOpen, vp) : { x: Math.max(PAD, vp.width - w - 20), y: 72, w, h };
    overlay = ctx.ui.createFloatWidget({
      width: start.w,
      height: start.h,
      initialPosition: { x: start.x, y: start.y },
      snapToEdge: false,
      tooltip: "Warp",
      chromeless: true,
    });
    overlay.root.appendChild(overlayEl);
    overlay.setVisible(false);
    cur = start;
    cleanups.push(() => overlay?.destroy());
  } catch {
    overlay = null; // ui_panels not granted — the drawer tab still has everything
  }

  function place(b: Box) {
    if (!overlay) return;
    if (b.w !== cur.w || b.h !== cur.h) overlay.setSize(b.w, b.h);
    const p = overlay.getPosition();
    if (p.x !== b.x || p.y !== b.y) overlay.moveTo(b.x, b.y);
    cur = b;
  }

  /** Floating resize that keeps whichever side is nearer the screen edge fixed, so it doesn't jump. */
  function resizeFloating(w: number, h: number) {
    if (!overlay) return;
    const p = overlay.getPosition();
    const rightAnchored = p.x + cur.w / 2 > viewport().width / 2;
    const x = rightAnchored ? Math.max(PAD, p.x + cur.w - w) : p.x;
    place({ x, y: p.y, w, h });
  }

  function fitOverlay() {
    if (!overlay) return;
    overlayEl.classList.toggle("warp-overlay-collapsed", !overlayOpen);
    overlayEl.dataset.edge = edge ?? "";
    const vp = viewport();
    if (edge) {
      const b = attachedBox(edge, overlayOpen, vp);
      overlayEl.style.setProperty("--warp-overlay-max", `${b.h - PILL.h}px`);
      place(b);
      return;
    }
    if (!overlayOpen) { resizeFloating(PILL.w, PILL.h); return; }
    const maxH = Math.max(240, vp.height - 140);
    overlayEl.style.setProperty("--warp-overlay-max", `${maxH - PILL.h}px`);
    // Measure the body's natural height so short HUDs don't leave empty space.
    requestAnimationFrame(() => resizeFloating(PANEL_W, Math.min(maxH, PILL.h + dockRoot.scrollHeight + 2)));
  }

  // Dragging an attached overlay detaches it straight away (back to floating size),
  // so it follows the pointer as a normal panel; the drop then decides where it lives.
  let dragStart: { x: number; y: number } | null = null;
  let pressAt: { x: number; y: number } | null = null;
  headEl.addEventListener("pointerdown", (e) => {
    if (!overlay || e.button !== 0) return;
    pressAt = { x: e.clientX, y: e.clientY };
    dragStart = overlay.getPosition();
  });
  const onPointerMove = (e: PointerEvent) => {
    if (!pressAt || !overlay) return;
    if (Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) < 4) return;
    pressAt = null;
    if (edge) {
      edge = null;
      store("overlayEdge", "");
      overlayEl.dataset.edge = "";
      const w = overlayOpen ? PANEL_W : PILL.w;
      const h = overlayOpen ? Math.min(420, cur.h) : PILL.h;
      overlay.setSize(w, h);
      cur = { ...cur, w, h };
    }
  };
  const onPointerUp = () => { pressAt = null; };
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  cleanups.push(() => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  });

  if (overlay) {
    cleanups.push(overlay.onDragEnd((pos) => {
      const from = dragStart ?? pos;
      dragStart = null;
      cur = { ...cur, x: pos.x, y: pos.y };
      edge = edgeForDrop(from, cur, viewport());
      store("overlayEdge", edge ?? "");
      renderHead();
      fitOverlay();
    }));
  }

  const onResize = () => { if (overlay?.isVisible()) fitOverlay(); };
  window.addEventListener("resize", onResize);
  cleanups.push(() => window.removeEventListener("resize", onResize));

  function syncDockVisibility() {
    if (!overlay) return;
    const show = !!state?.hud || state?.status.state === "broken";
    if (show !== overlay.isVisible()) overlay.setVisible(show);
    if (show) fitOverlay();
  }

  function renderHead() {
    const h = state?.hud;
    const clock = h?.clock ? `${h.clock.time}` : "";
    const worst = h?.bars.find((b) => b.tone === "bad") ?? h?.bars.find((b) => b.tone === "warn");
    const dot = `<span class="warp-dot warp-bg-${worst?.tone ?? "good"}" title="${esc(worst ? `${worst.label}: ${worst.text ?? worst.display}` : "All good")}"></span>`;
    const where = overlayOpen && h?.location ? ` <span class="warp-dim">· ${esc(h.location.name)}</span>` : "";
    headEl.innerHTML = `
      <span class="warp-overlay-title">🎲 ${clock ? `<b>${esc(clock)}</b>` : "Warp"}${where}</span>
      ${dot}
      <span class="warp-overlay-actions">
        ${overlayOpen && edge ? `<button class="warp-btn warp-btn-ghost" data-detach title="Float" aria-label="Detach">⇱</button>` : ""}
        ${overlayOpen ? `<button class="warp-btn warp-btn-ghost" data-open-sheet title="Open full sheet" aria-label="Open full sheet">⤢</button>` : ""}
        <button class="warp-btn warp-btn-ghost" data-toggle-overlay title="${overlayOpen ? "Collapse" : "Expand"}" aria-label="${overlayOpen ? "Collapse" : "Expand"}">${overlayOpen ? "–" : "+"}</button>
      </span>`;
  }

  headEl.addEventListener("click", (e) => {
    const t = e.target as Element;
    if (t.closest("[data-open-sheet]")) { drawerView = "sheet"; tab.activate(); return; }
    if (t.closest("[data-detach]")) {
      const vp = viewport();
      edge = null;
      store("overlayEdge", "");
      place({ x: Math.max(PAD, vp.width - PANEL_W - 40), y: 72, w: PANEL_W, h: Math.min(420, cur.h) });
      renderHead();
      fitOverlay();
      return;
    }
    // The whole pill toggles when collapsed; when open, only the button does.
    if (t.closest("[data-toggle-overlay]") || !overlayOpen) {
      overlayOpen = !overlayOpen;
      store("overlayOpen", overlayOpen ? "1" : "0");
      renderHead();
      fitOverlay();
    }
  });

  // ───────── rendering ─────────
  function rememberSections(root: HTMLElement) {
    root.querySelectorAll<HTMLDetailsElement>("details[data-section]").forEach((d) => openSections.set(d.dataset.section!, d.open));
  }
  function restoreSections(root: HTMLElement) {
    root.querySelectorAll<HTMLDetailsElement>("details[data-section]").forEach((d) => {
      const v = openSections.get(d.dataset.section!);
      if (v !== undefined) d.open = v;
    });
  }

  let lastBars = new Map<string, number>();
  function flashChangedBars(root: HTMLElement) {
    if (!state?.hud) return;
    for (const b of state.hud.bars) {
      const prevV = lastBars.get(b.id);
      if (prevV !== undefined && Math.abs(prevV - b.value) > 0.5) root.querySelector(`[data-bar="${CSS.escape(b.id)}"]`)?.classList.add("warp-changed");
    }
  }

  function renderDock() {
    if (!overlay) return;
    renderHead();
    rememberSections(dockRoot);
    if (state?.hud) {
      dockRoot.innerHTML = renderHud(state.hud, { editing: editingBar, compact: true });
    } else if (state?.status.state === "broken") {
      dockRoot.innerHTML = renderRulesetCard(state.status, true);
    } else {
      dockRoot.innerHTML = "";
    }
    restoreSections(dockRoot);
    flashChangedBars(dockRoot);
  }

  function renderDrawer() {
    rememberSections(drawerRoot);
    const hasChat = !!state?.chatId;
    const status: RulesetStatus = state?.status ?? { state: "none", name: null, source: null, issues: [], characterName: null, cardKind: "character", tags: [] };
    const views: [typeof drawerView, string][] = [
      ["sheet", "Sheet"],
      ...(state?.map ? [["map", "Map"] as [typeof drawerView, string]] : []),
      ...(state?.hud ? [["journal", "Journal"] as [typeof drawerView, string]] : []),
      ...(state?.dungeon || state?.dungeonEntries?.length ? [["dungeon", state?.dungeon ? "Dungeon ⚔" : "Dungeon"] as [typeof drawerView, string]] : []),
      ["rules", `Ruleset${status.issues.some((i) => i.level === "error") ? " ⚠" : ""}`],
      ["settings", "Settings"],
    ];
    if (!views.some(([v]) => v === drawerView)) drawerView = "sheet";
    const tabs = `<div class="warp-tabs" role="tablist">
      ${views.map(([v, label]) => `<button class="warp-tab" role="tab" data-view="${v}" aria-selected="${drawerView === v}">${label}</button>`).join("")}
    </div>`;
    let body = "";
    if (drawerView === "sheet") {
      body = state?.hud ? renderHud(state.hud, { editing: editingBar, compact: false }) : renderRulesetCard(status, hasChat);
    } else if (drawerView === "map") {
      body = renderMap(state?.map ?? null);
    } else if (drawerView === "dungeon") {
      const isBusy = busy.on && busy.chatId === state?.chatId;
      body = renderDungeon(state?.dungeon ?? null, state?.dungeonEntries ?? [], { pick: dgPick, mates: dgMates, busy: isBusy });
    } else if (drawerView === "journal") {
      body = renderJournal(state?.hud ?? null, state?.records ?? []);
    } else if (drawerView === "rules" && builder) {
      body = renderBuilder(builder, bDraft, templates, connections, status.state !== "none");
    } else if (drawerView === "rules") {
      body = renderBuilderCta(status.state !== "none", hasChat) + renderRulesetCard(status, hasChat) + `<div class="warp-card"><h3>Writing rules</h3><p>Rules live in entries titled <b>warp-ruleset · …</b> (or any lorebook named <b>warp-ruleset</b>). Each entry is YAML; entries merge together. Warp keeps them out of the prompt automatically.</p></div>`;
    } else {
      body = renderSettings(settings, state?.status ?? null, connections, jevKeySet);
    }
    drawerRoot.innerHTML = tabs + body;
    restoreSections(drawerRoot);
    flashChangedBars(drawerRoot);
    tab.setBadge(status.issues.some((i) => i.level === "error") ? "!" : null);
  }

  // ───────── in-chat: choices under the latest reply, chips on each message ─────────
  let choicesEl: Element | null = null;
  let choicesFor: string | null = null;
  let choicesHtml = "";
  const chipEls = new Map<string, { el: Element; html: string }>();
  const wantChips = new Map<string, string>();

  function injectChips(messageId: string, html: string): boolean {
    const bubble = ctx.dom.findMessageElement(messageId);
    if (!bubble) return false;
    const el = ctx.dom.inject(bubble, `<div class="warp-chips" data-warp-chips="${messageId}">${html}</div>`, "beforeend");
    chipEls.set(messageId, { el, html });
    return true;
  }

  function placeChoices(force = false) {
    const anchor = state?.choicesAnchor ?? null;
    const isBusy = busy.on && busy.chatId === state?.chatId;
    const html = settings.enabled && state?.hud && anchor
      ? renderChoices(state.choices, { showOdds: settings.showOdds, hotkeys: settings.hotkeys, busy: isBusy, busyLabel: busy.label || undefined })
      : "";
    if (!force && anchor === choicesFor && html === choicesHtml && choicesEl?.isConnected) return;
    if (choicesEl) { ctx.dom.uninject(choicesEl); choicesEl = null; }
    choicesFor = anchor;
    choicesHtml = html;
    if (!anchor || !html) return;
    const bubble = ctx.dom.findMessageElement(anchor);
    if (!bubble) return;
    choicesEl = ctx.dom.inject(bubble, `<div class="warp-choices${isBusy ? " warp-busy" : ""}">${html}</div>`, "beforeend");
  }

  function reconcileMessages() {
    const records: RecordView[] = state?.records ?? [];
    wantChips.clear();
    if (settings.enabled) {
      for (const r of records) {
        const html = renderChips(r, { showDice: settings.showDiceChips });
        if (html) wantChips.set(r.messageId, html);
      }
      // Suggestions sit on the player's own message.
      for (const s of state?.suggestions ?? []) wantChips.set(s.messageId, (wantChips.get(s.messageId) ?? "") + renderSuggestion(s));
    }
    let anchorTouched = false;
    for (const [id, cur] of chipEls) {
      if (wantChips.get(id) !== cur.html) {
        ctx.dom.uninject(cur.el);
        chipEls.delete(id);
        if (id === choicesFor) anchorTouched = true;
      }
    }
    for (const [id, html] of wantChips) {
      if (chipEls.has(id)) continue;
      if (injectChips(id, html) && id === state?.choicesAnchor) anchorTouched = true;
    }
    // Keep choices below the chips on the anchor message.
    placeChoices(anchorTouched);
  }

  // Bubbles mount lazily as you scroll; inject anything still pending once they appear.
  let mo: MutationObserver | null = null;
  let moTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingCheck = () => {
    moTimer = null;
    let touched = false;
    for (const [id, html] of wantChips) if (!chipEls.has(id) && injectChips(id, html)) touched = touched || id === state?.choicesAnchor;
    if (touched || (choicesFor && choicesHtml && !choicesEl?.isConnected)) placeChoices(true);
  };
  try {
    mo = new MutationObserver(() => { if (!moTimer) moTimer = setTimeout(pendingCheck, 200); });
    mo.observe(document.body, { childList: true, subtree: true });
    cleanups.push(() => { mo?.disconnect(); if (moTimer) clearTimeout(moTimer); });
  } catch { /* no observer: chips appear on the next state push */ }

  // The visual-novel extension (Cue) covers the chat; hand it our choices and status card.
  const cue = connectCue({ act: (id) => act(id), chatId });
  cleanups.push(() => cue.destroy());
  function syncCue() {
    cue.update({ state, enabled: settings.enabled, showOdds: settings.showOdds, busy: busy.on && busy.chatId === state?.chatId, busyLabel: busy.label });
  }

  function renderAll() {
    renderDock();
    renderDrawer();
    reconcileMessages();
    syncDockVisibility();
    syncCue();
    if (state?.hud) lastBars = new Map(state.hud.bars.map((b) => [b.id, b.value]));
  }

  // ───────── template picker ─────────
  function openPicker() {
    const id = chatId();
    if (!id) return;
    const modal = ctx.ui.showModal({ title: "Add a Warp ruleset", width: 520, maxHeight: 640 });
    modal.root.innerHTML = renderTemplatePicker(templates, state?.status.characterName ? { name: state.status.characterName, track: state.status.cardKind !== "scenario" } : null);
    modal.root.addEventListener("click", (e) => {
      const btn = (e.target as Element).closest<HTMLElement>("[data-template]");
      if (!btn) return;
      if (btn.dataset.template === "__ai") { drawerView = "rules"; tab.activate(); send({ type: "builder_open", chatId: id, mode: "build" }); }
      else {
        const track = modal.root.querySelector<HTMLInputElement>("[data-track]");
        send({ type: "install_template", chatId: id, templateId: btn.dataset.template!, ...(track ? { trackCharacter: track.checked } : {}) });
      }
      modal.dismiss();
    });
  }

  async function confirmReplace() {
    if (state?.status.state === "none") return openPicker();
    const res = await ctx.ui.showConfirm({
      title: "Add another ruleset?",
      message: "This character already has warp-ruleset entries. A new template is added as another lorebook and merged with the existing rules — remove the old lorebook if you want a clean start.",
      confirmLabel: "Choose a template",
      variant: "warning",
    });
    if (res.confirmed) openPicker();
  }

  // ───────── events: HUD & drawer ─────────
  // ───────── AI builder ─────────
  function builderAnswers(): Record<string, BuilderAnswer> {
    const out: Record<string, BuilderAnswer> = {};
    for (const r of builder?.rounds ?? []) for (const q of r.questions) {
      const v = bDraft.answers[q.id] ?? r.answers[q.id] ?? q.default;
      if (v !== undefined) out[q.id] = v;
    }
    return out;
  }

  function currentAnswer(id: string): BuilderAnswer | undefined {
    for (const r of builder?.rounds ?? []) for (const q of r.questions) if (q.id === id) return bDraft.answers[id] ?? r.answers[id] ?? q.default;
    return undefined;
  }

  function onBuilderClick(t: Element): boolean {
    const opt = t.closest<HTMLElement>("[data-bq-opt]");
    if (opt) {
      const id = opt.dataset.bq!, v = opt.dataset.bqOpt!;
      if (opt.dataset.bqKind === "multi") {
        const cur = currentAnswer(id);
        const set = new Set(Array.isArray(cur) ? cur : []);
        if (set.has(v)) set.delete(v); else set.add(v);
        bDraft.answers[id] = [...set];
      } else bDraft.answers[id] = v;
      renderDrawer();
      return true;
    }
    const seg = t.closest<HTMLElement>('[data-bset="creative"]');
    if (seg) { bDraft.creative = seg.dataset.v === "1"; renderDrawer(); return true; }
    const b = t.closest<HTMLElement>("[data-b]");
    if (!b) return false;
    const cid = chatId();
    if (!cid) return true;
    switch (b.dataset.b) {
      case "open-build": drawerView = "rules"; send({ type: "builder_open", chatId: cid, mode: "build" }); break;
      case "open-refine": drawerView = "rules"; send({ type: "builder_open", chatId: cid, mode: "refine" }); break;
      case "start": send({ type: "builder_start", chatId: cid, connectionId: bDraft.connectionId, creative: bDraft.creative, base: bDraft.base || undefined }); break;
      case "more": case "build":
        send({ type: "builder_answer", chatId: cid, answers: builderAnswers(), additions: bDraft.additions, more: b.dataset.b === "more" });
        break;
      case "back": send({ type: "builder_back", chatId: cid }); break;
      case "close":
        void (async () => {
          if (builder && builder.step !== "done" && builder.step !== "start") {
            const res = await ctx.ui.showConfirm({ title: "Close the builder?", message: "The draft is discarded. Your current ruleset isn't touched.", confirmLabel: "Discard draft", variant: "warning" });
            if (!res.confirmed) return;
          }
          send({ type: "builder_close", chatId: cid });
        })();
        break;
      case "install":
        void (async () => {
          if (b.dataset.replacing === "1" && builder?.mode === "build") {
            const res = await ctx.ui.showConfirm({ title: "Replace the current ruleset?", message: "The character's existing warp-ruleset sections are overwritten with this draft. Game state already recorded in chats is kept.", confirmLabel: "Replace", variant: "warning" });
            if (!res.confirmed) return;
          }
          send({ type: "builder_install", chatId: cid });
        })();
        break;
      case "refine":
        if (bDraft.refine.trim()) { send({ type: "builder_refine", chatId: cid, request: bDraft.refine.trim() }); bDraft.refine = ""; }
        break;
      case "chip": bDraft.refine = b.dataset.text ?? ""; renderDrawer(); break;
      case "fix": send({ type: "builder_fix", chatId: cid, warning: b.dataset.w! }); break;
      case "redo": {
        const part = b.dataset.part!;
        send({ type: "builder_redo", chatId: cid, part, note: bDraft.notes[part] || undefined });
        delete bDraft.notes[part];
        break;
      }
      case "add-row": bDraft.additions.push({ name: "", kind: "skill", note: "" }); renderDrawer(); break;
      case "add-remove": bDraft.additions.splice(Number(b.dataset.i), 1); renderDrawer(); break;
      default: return false;
    }
    return true;
  }

  /** Typing into builder fields updates drafts without re-rendering (keeps focus). */
  function onBuilderInput(t: HTMLInputElement): boolean {
    if (t.dataset.bq && (t.dataset.bqKind === "text" || t.dataset.bqKind === "scale")) {
      bDraft.answers[t.dataset.bq] = t.dataset.bqKind === "scale" ? Number(t.value) : t.value;
      return true;
    }
    if (t.dataset.badd !== undefined) {
      const row = bDraft.additions[Number(t.dataset.badd)];
      const field = t.dataset.baddField as "name" | "kind" | "note";
      if (row) (row as unknown as Record<string, string>)[field] = t.value;
      return true;
    }
    if (t.dataset.bnote) { bDraft.notes[t.dataset.bnote] = t.value; return true; }
    if (t.dataset.brefine !== undefined) { bDraft.refine = t.value; return true; }
    if (t.dataset.bset === "base") { bDraft.base = t.value; return true; }
    if (t.dataset.bset === "connectionId") { bDraft.connectionId = t.value; return true; }
    return false;
  }

  function onPanelClick(e: Event) {
    const t = e.target as Element;
    const view = t.closest<HTMLElement>("[data-view]");
    if (view) { drawerView = view.dataset.view as typeof drawerView; renderDrawer(); return; }
    if (onBuilderClick(t)) return;
    if (onDungeonClick(t)) return;
    const go = t.closest<HTMLElement>("[data-go]");
    if (go) { act(`go:${go.dataset.go}`); return; }
    const jump = t.closest<HTMLElement>("[data-jump]");
    if (jump) {
      const el = ctx.dom.findMessageElement(jump.dataset.jump!);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      else jump.setAttribute("title", "That message isn't loaded — scroll up in the chat to find it.");
      return;
    }
    const perk = t.closest<HTMLElement>("[data-buy-perk]");
    if (perk) { const cid = chatId(); if (cid) send({ type: "buy_perk", chatId: cid, perk: perk.dataset.buyPerk! }); return; }
    if (t.closest("[data-install]")) { void confirmReplace(); return; }
    if (t.closest("[data-reload]")) { send({ type: "reload", chatId: chatId() }); return; }
    const save = t.closest<HTMLElement>("[data-save]");
    if (save) {
      const id = save.dataset.save!;
      const input = save.parentElement?.querySelector<HTMLInputElement>(`[data-num]`);
      const v = Number(input?.value);
      const cid = chatId();
      if (cid && Number.isFinite(v)) send({ type: "adjust", chatId: cid, stat: id, value: v });
      editingBar = null;
      return;
    }
    const saveRel = t.closest<HTMLElement>("[data-save-rel]");
    if (saveRel) {
      const [who, stat] = saveRel.dataset.saveRel!.split(":");
      const v = Number(saveRel.parentElement?.querySelector<HTMLInputElement>("[data-num]")?.value);
      const cid = chatId();
      if (cid && Number.isFinite(v)) send({ type: "adjust_rel", chatId: cid, who, stat, value: v });
      editingBar = null;
      return;
    }
    if (t.closest(".warp-bar-edit")) return;
    const bar = t.closest<HTMLElement>("[data-bar]");
    if (bar) { editingBar = editingBar === bar.dataset.bar ? null : bar.dataset.bar!; renderDock(); renderDrawer(); return; }
    const rel = t.closest<HTMLElement>("[data-rel]");
    if (rel) { const k = `rel:${rel.dataset.rel}`; editingBar = editingBar === k ? null : k; renderDock(); renderDrawer(); return; }
    const forget = t.closest<HTMLElement>("[data-forget]");
    if (forget) {
      const cid = chatId();
      const who = forget.dataset.forget!;
      void ctx.ui.showConfirm({
        title: `Stop tracking ${forget.dataset.name}?`,
        message: "They're removed from People and relationships. If the story brings them back, they're tracked again from scratch.",
        confirmLabel: "Forget",
        variant: "warning",
      }).then((res) => { if (res.confirmed && cid) send({ type: "forget", chatId: cid, who }); });
      return;
    }
    if (t.closest("[data-save-jev]")) {
      const input = drawerRoot.querySelector<HTMLInputElement>("[data-jevkey]");
      if (input?.value.trim()) { send({ type: "set_jev_key", key: input.value.trim() }); input.value = ""; }
      return;
    }
    if (t.closest("[data-clear-jev]")) { send({ type: "set_jev_key", key: "" }); return; }
    if (t.closest("[data-test-decider]")) { send({ type: "test_decider" }); return; }
    const tag = t.closest<HTMLElement>("[data-tag]");
    if (tag) {
      const name = tag.dataset.tag!;
      const mode = tag.dataset.mode;
      const lines = settings.lines.filter((x) => x !== name);
      const veils = settings.veils.filter((x) => x !== name);
      if (mode === "on") veils.push(name);
      else if (mode === "veil") lines.push(name);
      send({ type: "settings", patch: { lines, veils } });
    }
  }
  function dg(op: import("./shared/protocol.js").DungeonOp) {
    const cid = chatId();
    if (!cid) return;
    dgPick = null;
    send({ type: "dungeon", chatId: cid, ...op } as FrontendToBackend);
  }
  function openDungeon() {
    drawerView = "dungeon";
    tab.activate();
    renderDrawer();
  }
  async function confirmLeave() {
    const res = await ctx.ui.showConfirm({
      title: "Leave the dungeon?",
      message: "The party climbs back out and keeps everything found so far.",
      confirmLabel: "Leave",
      variant: "info",
    });
    if (res.confirmed) dg({ op: "leave" });
  }
  function onDungeonClick(t: Element): boolean {
    const el = t.closest<HTMLElement>("[data-dg-move],[data-dg-choose],[data-dg-skill],[data-dg-item],[data-dg-target],[data-dg-escape],[data-dg-auto],[data-dg-descend],[data-dg-leave],[data-dg-buy],[data-dg-use],[data-dg-enter],[data-dg-cancel]");
    if (!el || (el as HTMLButtonElement).disabled) return !!el;
    const d = el.dataset;
    const v = state?.dungeon;
    if (d.dgMove) { const [x, y] = d.dgMove.split(",").map(Number); dg({ op: "move", x, y }); return true; }
    if (d.dgChoose) { dg({ op: "choose", choice: d.dgChoose }); return true; }
    if (d.dgCancel !== undefined) { dgPick = null; renderDrawer(); return true; }
    if (d.dgSkill) {
      const target = d.dgSkillTarget;
      const foes = v?.battle?.fighters.filter((f) => f.side === "foe" && f.alive) ?? [];
      if (target === "foe" && foes.length > 1) { dgPick = { kind: "skill", id: d.dgSkill, target: "foe" }; renderDrawer(); return true; }
      if (target === "ally") { dgPick = { kind: "skill", id: d.dgSkill, target: "ally" }; renderDrawer(); return true; }
      dg({ op: "battle", skill: d.dgSkill, target: foes[0]?.id });
      return true;
    }
    if (d.dgItem) {
      if (d.dgItem === "bomb") { dg({ op: "battle", item: "bomb" }); return true; }
      dgPick = { kind: "item", id: d.dgItem, target: "ally" }; renderDrawer(); return true;
    }
    if (d.dgUse) { dgPick = { kind: "use", id: d.dgUse, target: "ally" }; renderDrawer(); return true; }
    if (d.dgTarget && dgPick) {
      const p = dgPick;
      if (p.kind === "skill") dg({ op: "battle", skill: p.id, target: d.dgTarget });
      else if (p.kind === "item") dg({ op: "battle", item: p.id as "potion" | "ether", target: d.dgTarget });
      else dg({ op: "use", item: p.id, target: d.dgTarget });
      return true;
    }
    if (d.dgEscape !== undefined) { dg({ op: "battle", escape: true }); return true; }
    if (d.dgAuto) { dg({ op: "battle", auto: d.dgAuto as "round" | "battle" }); return true; }
    if (d.dgDescend !== undefined) { dg({ op: "descend" }); return true; }
    if (d.dgLeave !== undefined) { void confirmLeave(); return true; }
    if (d.dgBuy) { dg({ op: "buy", item: d.dgBuy }); return true; }
    if (d.dgEnter) {
      const entry = state?.dungeonEntries.find((e) => e.id === d.dgEnter);
      const mates = [...dgMates].filter((m) => entry?.companions.some((c) => c.id === m));
      dg({ op: "enter", id: d.dgEnter, companions: mates });
      dgMates.clear();
      return true;
    }
    return true;
  }

  function onPanelInput(e: Event) {
    const t = e.target as HTMLInputElement;
    if (onBuilderInput(t)) return;
    // Slider and number box share the stat's real range; keep them in step both ways.
    if (t.dataset.range) {
      const num = t.parentElement?.querySelector<HTMLInputElement>("[data-num]");
      if (num) num.value = t.value;
    } else if (t.dataset.num) {
      const range = t.parentElement?.querySelector<HTMLInputElement>("[data-range]");
      if (range) range.value = t.value;
    }
  }
  function onPanelChange(e: Event) {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (onBuilderInput(t as HTMLInputElement)) return;
    if (t.dataset.dgMate) {
      if ((t as HTMLInputElement).checked) dgMates.add(t.dataset.dgMate); else dgMates.delete(t.dataset.dgMate);
      renderDrawer();
      return;
    }
    if (t.dataset.wearSlot) {
      const cid = chatId();
      if (cid && t.value) send({ type: "wear", chatId: cid, slot: t.dataset.wearSlot, item: t.value === "__off" ? null : t.value });
      return;
    }
    const pctKey = t.dataset.settingPct as "autoConfidence" | "askConfidence" | undefined;
    if (pctKey) {
      let v = Number(t.value) / 100;
      // Keep "ask" below "auto" so the three bands stay ordered.
      if (pctKey === "askConfidence") v = Math.min(v, settings.autoConfidence - 0.01);
      else v = Math.max(v, settings.askConfidence + 0.01);
      send({ type: "settings", patch: { [pctKey]: v } });
      return;
    }
    const key = t.dataset.setting as keyof Settings | undefined;
    if (!key) return;
    const value = t instanceof HTMLInputElement && t.type === "checkbox" ? t.checked : t.value;
    send({ type: "settings", patch: { [key]: value } as Partial<Settings> });
  }
  function onPanelKey(e: KeyboardEvent) {
    const t = e.target as HTMLInputElement;
    if (e.key === "Enter" && t.dataset.newtag !== undefined && t.value.trim()) {
      send({ type: "settings", patch: { veils: [...settings.veils, t.value.trim().toLowerCase()] } });
      t.value = "";
    }
  }
  for (const root of [drawerRoot, dockRoot]) {
    root.addEventListener("click", onPanelClick);
    root.addEventListener("input", onPanelInput);
    root.addEventListener("change", onPanelChange);
    root.addEventListener("keydown", onPanelKey as EventListener);
    root.addEventListener("toggle", () => rememberSections(root), true);
  }

  // ───────── events: in-chat clicks (delegated; injected nodes are sanitized) ─────────
  function act(actionId: string) {
    // Dungeon choices open the dungeon screen instead of sending a line.
    if (actionId.startsWith("dungeon:")) {
      if (actionId === "dungeon:leave") void confirmLeave();
      else openDungeon();
      return;
    }
    const cid = chatId();
    if (!cid || (busy.on && busy.chatId === cid)) return;
    busy = { chatId: cid, on: true, label: "Rolling…" };
    placeChoices(true);
    syncCue();
    send({ type: "act", chatId: cid, actionId });
    // If nothing starts (rejected choice, network hiccup), don't leave the grid locked.
    setTimeout(() => {
      if (busy.on && busy.label === "Rolling…" && busy.chatId === cid) {
        busy = { chatId: "", on: false, label: "" };
        placeChoices(true);
        syncCue();
      }
    }, 15000);
  }
  async function confirmRedo(btn: HTMLElement) {
    const cid = chatId();
    const userMessageId = btn.dataset.redo;
    if (!cid || !userMessageId) return;
    const actionId = btn.dataset.redoAction || null;
    let params: Record<string, string> | undefined;
    try { params = btn.dataset.redoParams ? JSON.parse(btn.dataset.redoParams) : undefined; } catch { params = undefined; }
    const res = await ctx.ui.showConfirm({
      title: actionId ? "Roll for it?" : "Redo without a roll?",
      message: actionId
        ? "The reply to your message is replaced with a new one where the dice decide."
        : "The reply to your message is replaced with a new one, treating your message as plain roleplay (no check).",
      confirmLabel: actionId ? "Roll it" : "Redo turn",
      variant: "info",
    });
    if (!res.confirmed) return;
    busy = { chatId: cid, on: true, label: "Rolling…" };
    placeChoices(true);
    send({ type: "redo", chatId: cid, userMessageId, actionId, params });
  }

  const onDocClick = (e: MouseEvent) => {
    const t = e.target as Element | null;
    if (!t?.closest) return;
    const choice = t.closest<HTMLElement>(".warp-choices [data-act]");
    if (choice) { e.preventDefault(); act(choice.dataset.act!); return; }
    const dice = t.closest<HTMLElement>(".warp-chips [data-dice]");
    if (dice) {
      const row = dice.closest<HTMLElement>(".warp-chips")!;
      if (row.hasAttribute("data-open")) row.removeAttribute("data-open"); else row.setAttribute("data-open", "");
      return;
    }
    const redo = t.closest<HTMLElement>(".warp-chips [data-redo]");
    if (redo) { e.preventDefault(); void confirmRedo(redo); return; }
    const dismiss = t.closest<HTMLElement>(".warp-chips [data-dismiss-suggest]");
    if (dismiss) {
      const cid = chatId();
      if (cid) send({ type: "dismiss_suggestion", chatId: cid, messageId: dismiss.dataset.dismissSuggest! });
      return;
    }
    const undo = t.closest<HTMLElement>(".warp-chips [data-undo]");
    if (undo) {
      const row = undo.closest<HTMLElement>("[data-warp-chips]");
      const messageId = row?.dataset.warpChips;
      const rec = state?.records.find((r) => r.messageId === messageId);
      const cid = chatId();
      if (rec && cid) send({ type: "undo", chatId: cid, messageId: rec.messageId, swipe: rec.swipe, events: undo.dataset.undo!.split(",").map(Number) });
    }
  };
  document.addEventListener("click", onDocClick, true);
  cleanups.push(() => document.removeEventListener("click", onDocClick, true));

  const onKey = (e: KeyboardEvent) => {
    if (!settings.hotkeys || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (!/^[0-9]$/.test(e.key) || !state?.choices.length || !choicesEl?.isConnected) return;
    const n = e.key === "0" ? 10 : Number(e.key);
    const c = state.choices[n - 1];
    if (!c) return;
    e.preventDefault();
    act(c.id);
  };
  document.addEventListener("keydown", onKey);
  cleanups.push(() => document.removeEventListener("keydown", onKey));

  // ───────── backend messages ─────────
  cleanups.push(ctx.onBackendMessage((raw) => {
    const m = raw as BackendToFrontend;
    switch (m.type) {
      case "state": {
        const active = chatId();
        if (m.chatId && active && m.chatId !== active) return;
        if (state?.chatId !== m.chatId) { editingBar = null; lastBars = new Map(); }
        const entered = !state?.dungeon && !!m.dungeon && state?.chatId === m.chatId;
        if (!m.dungeon?.battle) dgPick = dgPick?.kind === "use" ? dgPick : null;
        state = m;
        if (entered) drawerView = "dungeon";
        if (m.chatId === busy.chatId && !m.busy && busy.label === "Rolling…") busy = { chatId: "", on: false, label: "" };
        if (m.busy && m.chatId) busy = { chatId: m.chatId, on: true, label: busy.label };
        renderAll();
        break;
      }
      case "busy":
        busy = { chatId: m.chatId, on: m.busy, label: m.busy ? m.label ?? busy.label ?? "" : "" };
        placeChoices(true);
        syncCue();
        break;
      case "builder": {
        const prev = builder;
        builder = m.session;
        // A different session (or none): start the drafts fresh.
        if (!builder || !prev || prev.characterId !== builder.characterId || prev.mode !== builder.mode || (prev.step !== builder.step && builder.step === "start")) {
          const keep = { creative: bDraft.creative, connectionId: bDraft.connectionId };
          bDraft = { ...emptyDraft(), ...keep, ...(builder ? { additions: builder.additions.map((a) => ({ ...a })) } : {}) };
        }
        if (builder && prev?.step !== builder.step) bDraft.notes = {};
        renderDrawer();
        break;
      }
      case "settings":
        settings = m.settings;
        templates = m.templates;
        connections = m.connections;
        jevKeySet = m.jevKeySet;
        renderAll();
        break;
      case "command":
        if (m.command === "install") void confirmReplace();
        else if (m.command === "dungeon") openDungeon();
        else { drawerView = "sheet"; tab.activate(); }
        break;
      case "toast":
        // Backend normally uses native toasts; this is a fallback.
        console.info(`[warp] ${m.message}`);
        break;
    }
  }));

  // Chat switches arrive as backend pushes; this covers first load and reloads.
  send({ type: "hello", chatId: chatId() });
  let lastChat = chatId();
  const poll = setInterval(() => {
    const now = chatId();
    if (now !== lastChat) { lastChat = now; send({ type: "refresh", chatId: now }); }
  }, 1000);
  cleanups.push(() => clearInterval(poll));

  const cleanup = () => {
    for (const { el } of chipEls.values()) ctx.dom.uninject(el);
    if (choicesEl) ctx.dom.uninject(choicesEl);
    for (const c of cleanups.reverse()) { try { c(); } catch { /* keep going */ } }
  };
  (globalThis as Record<string, unknown>)[CLEANUP_KEY] = cleanup;
  return cleanup;
}
