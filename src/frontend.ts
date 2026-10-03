import type { SpindleFloatWidgetHandle, SpindleFrontendContext } from "lumiverse-spindle-types";
import type {
  BackendToFrontend, BuilderAnswer, BuilderSession, FixField, FrontendToBackend, RecordView, RulesetStatus, Settings, TemplateInfo,
} from "./shared/protocol.js";
import { DEFAULT_SETTINGS } from "./shared/protocol.js";
import { OPENROUTER_JEV } from "./shared/classifier-config.js";
import { STYLES } from "./frontend/styles.js";
import { attachedBox, edgeForDrop, floatingBox, PAD, panelWidth, PILL, type Box, type Edge, type Viewport } from "./frontend/overlay-layout.js";
import { emptyDraft, renderBuilder, renderBuilderCta, type BuilderDraft } from "./frontend/builder-ui.js";
import { connectCue } from "./frontend/cue-bridge.js";
import { esc } from "./frontend/html.js";
import { hudParts, renderHud, renderPart } from "./frontend/render-panel.js";
import { choiceOrder, renderChoices, renderReply } from "./frontend/render-chat.js";
import { renderSettings, renderStyleSwitch } from "./frontend/render-settings.js";
import { renderJournal, renderRulesetCard, renderTemplatePicker } from "./frontend/render.js";
import { connectPublicEvents, toWarpState } from "./frontend/public-events.js";
import { newRolls, playRoll, prefersReducedMotion } from "./frontend/roll-fx.js";
import { acceptsResponse } from "./frontend/response-gate.js";
import { logoSvg } from "./frontend/logo.js";

type StateMsg = Extract<BackendToFrontend, { type: "state" }>;

const CLEANUP_KEY = "__warpCleanup";
const ICON = logoSvg({ size: 20 });
/** A click on a choice is not repeated until the backend answers (or this long passes). */
const ACT_GUARD_MS = 4000;

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
  /** The installed rulebook, exported as one file (shown in the Ruleset tab until closed). */
  let exported: { name: string; text: string } | null = null;
  let bDraft: BuilderDraft = emptyDraft();
  let busy = { chatId: "", on: false, label: "" };
  /** The line open for a one-click fix (see HudOpts.editing), and what has been typed into it. */
  let editing: string | null = null;
  let drafts: Record<string, string> = {};
  /** A choice just clicked: further clicks wait for the backend's answer (no lock after the reply). */
  let pendingAct: { chatId: string; at: number } | null = null;
  let drawerView: "sheet" | "journal" | "rules" | "settings" = "sheet";
  const openSections = new Map<string, boolean>();

  const send = (m: FrontendToBackend) => ctx.sendToBackend(m);
  const chatId = () => { try { return ctx.getActiveChat().chatId ?? null; } catch { return null; } };
  // ───────── surfaces: drawer tab (always) + floating status panel (when allowed) ─────────
  const tab = ctx.ui.registerDrawerTab({
    id: "warp",
    title: "Warp — game state",
    shortName: "Warp",
    headerTitle: "Warp",
    description: "Scene, people, dice, goals and game settings",
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
  const dockRoot = overlayEl.children[1] as HTMLElement;
  // Presses inside the body scroll and click; they must not start a widget drag.
  // (Form controls are already exempt from dragging, and need their default to take focus.)
  dockRoot.addEventListener("pointerdown", (e) => {
    if (!(e.target as Element).closest?.("input, select, textarea")) e.preventDefault();
  });
  let cur: Box = { x: 0, y: 72, w: PILL.w, h: PILL.h };
  try {
    const vp = viewport();
    const start = edge ? attachedBox(edge, overlayOpen, vp) : floatingBox(vp, overlayOpen, 420);
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
    requestAnimationFrame(() => resizeFloating(panelWidth(viewport()), Math.min(maxH, PILL.h + dockRoot.scrollHeight + 2)));
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
      const w = overlayOpen ? panelWidth(viewport()) : PILL.w;
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
    const fight = h?.conflict ? `<span class="warp-tone-bad" title="${esc(`${h.conflict.label} with ${h.conflict.opponent}`)}">⚔</span> ` : "";
    const worst = h?.bars.find((b) => b.tone === "bad") ?? h?.bars.find((b) => b.tone === "warn");
    const dot = `<span class="warp-dot warp-bg-${worst?.tone ?? "good"}" title="${esc(worst ? `${worst.label}: ${worst.text ?? worst.display}` : "All good")}"></span>`;
    const where = overlayOpen && h?.location ? ` <span class="warp-dim">· ${esc(h.location.name)}</span>` : "";
    headEl.innerHTML = `
      <span class="warp-overlay-title">${fight}🎲 ${clock ? `<b>${esc(clock)}</b>` : "Warp"}${where}</span>
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
      place(floatingBox(vp, true, Math.min(420, cur.h)));
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

  /** Re-render a panel root, keeping open sections, scroll and the focused fix field. */
  function paint(root: HTMLElement, html: string) {
    rememberSections(root);
    const kept = root.scrollTop;
    const focused = document.activeElement instanceof HTMLInputElement && root.contains(document.activeElement) ? document.activeElement.dataset.fixInput ?? null : null;
    root.innerHTML = html;
    restoreSections(root);
    root.scrollTop = kept;
    if (focused) root.querySelector<HTMLInputElement>(`[data-fix-input="${CSS.escape(focused)}"]`)?.focus();
    flashChangedBars(root);
  }

  const hudOpts = (compact: boolean) => ({ editing, compact, drafts, sceneHint: state?.sceneHint ?? null });

  function renderDock() {
    if (!overlay) return;
    renderHead();
    let html = "";
    if (state?.hud) {
      const { head, parts } = hudParts(state.hud, hudOpts(true));
      html = historyNotice() + head + parts.map(renderPart).join("");
    } else if (state?.status.state === "broken") {
      html = renderRulesetCard(state.status, true);
    }
    paint(dockRoot, html);
  }

  function historyNotice(): string {
    return state?.historyConflict ? `<div class="warp-card"><h3>History changed</h3><p>Earlier messages or rules changed. Later results are paused. Keep their recorded outcomes, or discard those results and replay from the changed turn. Your chat text stays in place.</p><button class="warp-btn" data-history="keep">Keep recorded outcomes</button> <button class="warp-btn" data-history="discard">Discard affected results</button></div>` : "";
  }
  const reconcileClick = (e: Event) => {
    const button = (e.target as Element).closest<HTMLElement>("[data-history]");
    const id = chatId();
    if (button && id) send({ type: "reconcile_history", chatId: id, keep: button.dataset.history === "keep" });
  };
  dockRoot.addEventListener("click", reconcileClick);
  drawerRoot.addEventListener("click", reconcileClick);
  cleanups.push(() => dockRoot.removeEventListener("click", reconcileClick));
  cleanups.push(() => drawerRoot.removeEventListener("click", reconcileClick));

  function renderDrawer() {
    const hasChat = !!state?.chatId;
    const status: RulesetStatus = state?.status ?? { state: "none", name: null, source: null, issues: [], characterName: null, cardKind: "character", tags: [] };
    const views: [typeof drawerView, string][] = [
      ["sheet", "Sheet"],
      ...(state?.hud ? [["journal", "Journal"] as [typeof drawerView, string]] : []),
      ["rules", `Ruleset${status.issues.some((i) => i.level === "error") ? " ⚠" : ""}`],
      ["settings", "Settings"],
    ];
    if (!views.some(([v]) => v === drawerView)) drawerView = "sheet";
    const tabs = `<div class="warp-tabs" role="tablist">
      ${views.map(([v, label]) => `<button class="warp-tab" role="tab" data-view="${v}" aria-selected="${drawerView === v}">${label}</button>`).join("")}
    </div>`;
    let body = "";
    if (drawerView === "sheet") {
      body = state?.hud ? renderHud(state.hud, hudOpts(false)) : renderRulesetCard(status, hasChat);
    } else if (drawerView === "journal") {
      body = renderJournal(state?.hud ?? null, state?.records ?? [], editing);
    } else if (drawerView === "rules" && builder) {
      body = renderBuilder(builder, bDraft, templates, connections, status.state !== "none");
    } else if (drawerView === "rules") {
      body = renderBuilderCta(status.state !== "none", hasChat, exported) + renderRulesetCard(status, hasChat)
        + (hasChat ? `<div class="warp-card">${renderStyleSwitch(status, templates)}</div>` : "")
        + `<div class="warp-card"><h3>Writing rules</h3><p>Rules live in entries titled <b>warp-ruleset · …</b> (or any lorebook named <b>warp-ruleset</b>). Each entry is YAML; entries merge together. Warp keeps them out of the prompt automatically.</p></div>`;
    } else {
      body = renderSettings(settings, state?.status ?? null, connections, jevKeySet, templates);
    }
    paint(drawerRoot, tabs + historyNotice() + body);
    tab.setBadge(status.issues.some((i) => i.level === "error") ? "!" : null);
  }

  // ───────── in-chat: one row under each reply, choices under the latest ─────────
  let choicesEl: Element | null = null;
  let choicesFor: string | null = null;
  let choicesHtml = "";
  const chipEls = new Map<string, { el: Element; html: string }>();
  const wantChips = new Map<string, string>();

  // Where our rows go: right after the message card, inside its list row.
  // Not "inside the row": the host registers an injection relative to the
  // nearest [data-message-id] and, when the card remounts (scrolled away and
  // back), replays it relative to the card. Something added to the row would
  // be moved into the card — a side-by-side flex box — and squeeze the text
  // into a sliver. Anchoring on the card itself replays to the same spot.
  function messageSlot(messageId: string): { target: Element; position: InsertPosition } | null {
    const row = ctx.dom.findMessageElement(messageId);
    if (!row) return null;
    const card = row.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
    return card ? { target: card, position: "afterend" } : { target: row, position: "beforeend" };
  }

  /** Undo a replay that put our row in the wrong place, and keep choices under the reply's row. */
  function healPlacement() {
    const fix = (el: Element | undefined | null, id: string | null) => {
      if (!el?.isConnected || !id) return;
      const slot = messageSlot(id);
      if (slot?.position === "afterend" && slot.target.contains(el)) slot.target.after(el);
    };
    for (const [id, { el }] of chipEls) fix(el, id);
    fix(choicesEl, choicesFor);
    const chips = choicesFor ? chipEls.get(choicesFor)?.el : null;
    if (chips?.isConnected && choicesEl?.isConnected && chips.parentElement === choicesEl.parentElement && chips.nextElementSibling !== choicesEl) chips.after(choicesEl);
  }

  function injectChips(messageId: string, html: string): boolean {
    const slot = messageSlot(messageId);
    if (!slot) return false;
    const el = ctx.dom.inject(slot.target, `<div class="warp-chips" data-warp-chips="${messageId}">${html}</div>`, slot.position);
    chipEls.set(messageId, { el, html });
    return true;
  }

  function placeChoices(force = false) {
    const anchor = state?.choicesAnchor ?? null;
    const isBusy = busy.on && busy.chatId === state?.chatId;
    const html = settings.enabled && settings.showChoices && state?.hud && anchor
      ? renderChoices(state.choices, { showOdds: settings.showOdds, hotkeys: settings.hotkeys, busy: isBusy, busyLabel: busy.label || undefined, conflict: state.hud.conflict })
      : "";
    if (!force && anchor === choicesFor && html === choicesHtml && choicesEl?.isConnected) return;
    if (choicesEl) { ctx.dom.uninject(choicesEl); choicesEl = null; }
    choicesFor = anchor;
    choicesHtml = html;
    if (!anchor || !html) return;
    const slot = messageSlot(anchor);
    if (!slot) return;
    choicesEl = ctx.dom.inject(slot.target, `<div class="warp-choices">${html}</div>`, slot.position);
    // "afterend" puts it straight after the card — above the reply's row; move it below.
    healPlacement();
  }

  function reconcileMessages() {
    const records: RecordView[] = state?.records ?? [];
    wantChips.clear();
    if (settings.enabled) {
      for (const r of records) {
        const html = renderReply(r, { showChanges: settings.showChanges, latest: r.messageId === state?.latestMessageId });
        if (html) wantChips.set(r.messageId, html);
      }
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
    healPlacement();
  };
  try {
    mo = new MutationObserver(() => { if (!moTimer) moTimer = setTimeout(pendingCheck, 200); });
    mo.observe(document.body, { childList: true, subtree: true });
    cleanups.push(() => { mo?.disconnect(); if (moTimer) clearTimeout(moTimer); });
  } catch { /* no observer: rows appear on the next state push */ }

  // The visual-novel extension (Cue) covers the chat; hand it our choices and status card.
  const cue = connectCue({ act: (id) => act(id), chatId });
  cleanups.push(() => cue.destroy());
  function syncCue() {
    cue.update({ state, enabled: settings.enabled, showOdds: settings.showOdds, busy: busy.on && busy.chatId === state?.chatId, busyLabel: busy.label });
  }

  // Other extensions (LumiDoll…) read the scene from warp-state-v1.
  const publicEvents = connectPublicEvents({ getState: () => toWarpState(state, { enabled: settings.enabled, chatId: chatId() }) });
  cleanups.push(() => publicEvents.destroy());

  function renderAll() {
    renderDock();
    renderDrawer();
    reconcileMessages();
    syncDockVisibility();
    syncCue();
    publicEvents.publish();
    if (state?.hud) lastBars = new Map(state.hud.bars.map((b) => [b.id, b.value]));
  }

  /** The one roll animation, on the rows of replies that just rolled. */
  function playRolls(recs: RecordView[]) {
    if (!recs.length) return;
    const reduced = prefersReducedMotion();
    requestAnimationFrame(() => {
      for (const r of recs) {
        const row = chipEls.get(r.messageId)?.el;
        if (row instanceof HTMLElement && row.isConnected) playRoll(row, r, reduced);
      }
    });
  }

  // ───────── template picker ─────────
  function openPicker() {
    const id = chatId();
    if (!id) return;
    const modal = ctx.ui.showModal({ title: "Add Warp rules", width: 560, maxHeight: 680 });
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

  /** Story / Adventure: install the template, or switch the installed one after a confirm (people are kept). */
  async function chooseStyle(btn: HTMLElement) {
    const cid = chatId();
    const templateId = btn.dataset.template;
    if (!cid || !templateId) return;
    if (btn.dataset.styleMode === "switch") {
      const story = btn.dataset.style === "story";
      const res = await ctx.ui.showConfirm({
        title: story ? "Switch to Story (no dice)?" : "Switch to Adventure (dice)?",
        message: "The template's rules are replaced. Your people entries are kept, and the game state recorded in chats stays.",
        confirmLabel: "Switch",
        variant: "warning",
      });
      if (!res.confirmed) return;
      send({ type: "install_template", chatId: cid, templateId, replace: true });
    } else {
      send({ type: "install_template", chatId: cid, templateId, ...(state?.status.characterName ? { trackCharacter: state.status.cardKind !== "scenario" } : {}) });
    }
  }

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
      case "import": {
        const text = drawerRoot.querySelector<HTMLTextAreaElement>("[data-import-text]")?.value ?? "";
        if (!text.trim()) {
          const ta = drawerRoot.querySelector<HTMLTextAreaElement>("[data-import-text]");
          if (ta) { ta.placeholder = "Paste a rulebook (YAML) here, or choose a file first."; ta.focus(); }
          break;
        }
        drawerView = "rules";
        send({ type: "builder_import", chatId: cid, text });
        break;
      }
      case "export": send({ type: "export_rulebook", chatId: cid }); break;
      case "export-close": exported = null; renderDrawer(); break;
      case "export-copy": {
        const ta = drawerRoot.querySelector<HTMLTextAreaElement>("[data-export-text]");
        if (!ta) break;
        void navigator.clipboard?.writeText(ta.value).then(() => { b.textContent = "Copied ✓"; }, () => { ta.select(); b.textContent = "Press Ctrl+C"; });
        break;
      }
      case "export-save": {
        if (!exported) break;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([exported.text], { type: "text/yaml" }));
        a.download = `${(b.dataset.name || "rulebook").replace(/[^\w -]+/g, "").trim() || "rulebook"}.warp.yaml`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        break;
      }
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

  // ───────── one-click fixes ─────────
  function toggleEdit(key: string) {
    editing = editing === key ? null : key;
    drafts = {};
    renderDock();
    renderDrawer();
  }

  /** The value of an open fix row, as the `fix` message wants it. */
  function fixValue(row: Element, field: string): string | number | boolean | null | undefined {
    const input = (k: string) => row.querySelector<HTMLInputElement>(`[data-fix-input="${CSS.escape(k)}"]`);
    if (field === "time") {
      const day = Number(input("time:day")?.value);
      const time = input("time")?.value ?? "";
      if (!/^\d{1,2}:\d{2}$/.test(time)) return undefined;
      return Number.isFinite(day) && day >= 1 ? `Day ${Math.floor(day)} ${time}` : time;
    }
    const el = row.querySelector<HTMLInputElement>("[data-fix-input]");
    if (!el) return undefined;
    if (field === "item" || field === "money") {
      const n = Number(el.value);
      return el.value.trim() !== "" && Number.isFinite(n) ? n : undefined;
    }
    const text = el.value.replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 160) : null;
  }

  function sendFix(field: FixField, who: string | undefined, value: string | number | boolean | null) {
    const cid = chatId();
    if (!cid) return;
    send({ type: "fix", chatId: cid, field, ...(who ? { who } : {}), value });
    editing = null;
    drafts = {};
    renderDock();
    renderDrawer();
  }

  function onFixSet(btn: HTMLElement) {
    const row = btn.closest("[data-fix-row]");
    const field = btn.dataset.fix as FixField;
    if (!row || !field) return;
    const value = fixValue(row, field);
    if (value === undefined) { row.querySelector<HTMLInputElement>("[data-fix-input]")?.focus(); return; }
    sendFix(field, btn.dataset.who, value);
  }

  /** Two taps for anything that can't be taken back (giving in). */
  function armed(btn: HTMLElement, label: string): boolean {
    if (btn.dataset.armed) return true;
    const was = btn.textContent ?? "";
    btn.dataset.armed = "1";
    btn.textContent = label;
    btn.classList.add("warp-btn-danger");
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = was; btn.classList.remove("warp-btn-danger"); } }, 4000);
    return false;
  }

  function onPanelClick(e: Event) {
    const t = e.target as Element;
    if (t.closest("[data-jev-openrouter]")) { send({ type: "settings", patch: { ...OPENROUTER_JEV } }); return; }
    const view = t.closest<HTMLElement>("[data-view]");
    if (view) { drawerView = view.dataset.view as typeof drawerView; renderDrawer(); return; }
    if (onBuilderClick(t)) return;
    const jump = t.closest<HTMLElement>("[data-jump]");
    if (jump) {
      const el = ctx.dom.findMessageElement(jump.dataset.jump!);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      else jump.setAttribute("title", "That message isn't loaded — scroll up in the chat to find it.");
      return;
    }
    const cid = chatId();
    const contest = t.closest<HTMLElement>("[data-contest]");
    if (contest) {
      const op = contest.dataset.contest === "give_in" ? "give_in" : "break_off";
      if (op === "give_in" && !armed(contest, "Really give in?")) return;
      if (cid) send({ type: "contest", chatId: cid, op });
      return;
    }
    const use = t.closest<HTMLElement>("[data-use]");
    if (use) { if (!(use as HTMLButtonElement).disabled) act(use.dataset.use!); return; }
    if (t.closest("[data-install]")) { void confirmReplace(); return; }
    if (t.closest("[data-reload]")) { send({ type: "reload", chatId: cid }); return; }
    const style = t.closest<HTMLElement>("[data-style-mode]");
    if (style) { void chooseStyle(style); return; }
    const seg = t.closest<HTMLElement>("[data-setting-bool]");
    if (seg) { send({ type: "settings", patch: { [seg.dataset.settingBool!]: seg.dataset.v === "1" } as Partial<Settings> }); return; }

    // Fixes: ✎ opens a line, Set sends it.
    const fix = t.closest<HTMLElement>("[data-fix]");
    if (fix) { onFixSet(fix); return; }
    const present = t.closest<HTMLElement>("[data-fix-present]");
    if (present) { sendFix("present", present.dataset.fixPresent, present.dataset.value === "true"); return; }
    const goal = t.closest<HTMLElement>("[data-fix-goal]");
    if (goal) { sendFix("goal", goal.dataset.fixGoal, goal.dataset.value ?? "done"); return; }
    const saveBar = t.closest<HTMLElement>("[data-save-bar]");
    if (saveBar) {
      const v = Number(saveBar.parentElement?.querySelector<HTMLInputElement>("[data-num]")?.value);
      if (cid && Number.isFinite(v)) send({ type: "adjust", chatId: cid, stat: saveBar.dataset.saveBar!, value: v });
      editing = null;
      return;
    }
    const saveSkill = t.closest<HTMLElement>("[data-save-skill]");
    if (saveSkill) {
      const v = Number(saveSkill.parentElement?.querySelector<HTMLInputElement>("[data-fix-input]")?.value);
      if (cid && Number.isFinite(v)) send({ type: "adjust", chatId: cid, stat: saveSkill.dataset.saveSkill!, value: v });
      editing = null;
      drafts = {};
      return;
    }
    const saveRel = t.closest<HTMLElement>("[data-save-rel]");
    if (saveRel) {
      const [who, stat] = saveRel.dataset.saveRel!.split(":");
      const v = Number(saveRel.parentElement?.querySelector<HTMLInputElement>("[data-num]")?.value);
      if (cid && Number.isFinite(v)) send({ type: "adjust_rel", chatId: cid, who, stat, value: v });
      editing = null;
      return;
    }
    // ✎, Cancel and Done buttons; then whole rows (bars, skills) that open on a tap, but not from inside their field.
    const editBtn = t.closest<HTMLElement>("button[data-edit]");
    if (editBtn) { toggleEdit(editBtn.dataset.edit!); return; }
    if (t.closest(".warp-bar-edit, .warp-fix")) return;
    const edit = t.closest<HTMLElement>("[data-edit]");
    if (edit) { toggleEdit(edit.dataset.edit!); return; }

    const forget = t.closest<HTMLElement>("[data-forget]");
    if (forget) {
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
  function onPanelInput(e: Event) {
    const t = e.target as HTMLInputElement;
    if (onBuilderInput(t)) return;
    // Typed into a fix: kept across pushes until Set or Cancel.
    if (t.dataset.fixInput) { drafts[t.dataset.fixInput] = t.value; return; }
    // Slider and number box share the stat's real range; keep them in step both ways.
    if (t.dataset.range !== undefined) {
      const num = t.parentElement?.querySelector<HTMLInputElement>("[data-num]");
      if (num) num.value = t.value;
    } else if (t.dataset.num !== undefined) {
      const range = t.parentElement?.querySelector<HTMLInputElement>("[data-range]");
      if (range) range.value = t.value;
    }
  }
  function onPanelChange(e: Event) {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (onBuilderInput(t as HTMLInputElement)) return;
    if (t.dataset.fixInput !== undefined) return;
    // A rulebook file picked for import: its text goes into the box to check and preview.
    if ("importFile" in t.dataset) {
      const file = (t as HTMLInputElement).files?.[0];
      if (file) void file.text().then((text) => {
        const ta = drawerRoot.querySelector<HTMLTextAreaElement>("[data-import-text]");
        if (ta) ta.value = text;
      });
      return;
    }
    const key = t.dataset.setting as keyof Settings | undefined;
    if (!key) return;
    const value = t instanceof HTMLInputElement && t.type === "checkbox" ? t.checked : t.value;
    send({ type: "settings", patch: { [key]: value } as Partial<Settings> });
  }
  function onPanelKey(e: KeyboardEvent) {
    const t = e.target as HTMLInputElement;
    if (t.dataset?.fixInput !== undefined) {
      if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); const set = t.closest("[data-fix-row]")?.querySelector<HTMLElement>("[data-fix]"); if (set) onFixSet(set); }
      else if (e.key === "Escape") { e.preventDefault(); toggleEdit(editing ?? ""); }
      return;
    }
    if (e.key === "Enter" && t.dataset.newtag !== undefined && t.value.trim()) {
      send({ type: "settings", patch: { veils: [...settings.veils, t.value.trim().toLowerCase()] } });
      t.value = "";
    }
  }
  function wirePanel(root: HTMLElement) {
    root.addEventListener("click", onPanelClick);
    root.addEventListener("input", onPanelInput);
    root.addEventListener("change", onPanelChange);
    root.addEventListener("keydown", onPanelKey as EventListener);
    root.addEventListener("toggle", () => rememberSections(root), true);
  }
  for (const root of [drawerRoot, dockRoot]) wirePanel(root);

  // ───────── events: in-chat clicks (delegated; injected nodes are sanitized) ─────────
  /**
   * Pick a choice. Never refused because the backend is busy writing the next choices: the backend waits for
   * that itself. Only a second click right after the first waits for the backend's answer.
   */
  function act(actionId: string, params?: Record<string, string>) {
    const cid = chatId();
    if (!cid) return;
    if (pendingAct && pendingAct.chatId === cid && Date.now() - pendingAct.at < ACT_GUARD_MS) return;
    pendingAct = { chatId: cid, at: Date.now() };
    send({ type: "act", chatId: cid, actionId, ...(params ? { params } : {}) });
  }
  async function confirmRedo(btn: HTMLElement) {
    const cid = chatId();
    const userMessageId = btn.dataset.redo;
    if (!cid || !userMessageId) return;
    const res = await ctx.ui.showConfirm({
      title: "Redo without a roll?",
      message: "The reply to your message is replaced with a new one, treating your message as plain roleplay (no check).",
      confirmLabel: "Redo turn",
      variant: "info",
    });
    if (!res.confirmed) return;
    send({ type: "redo", chatId: cid, userMessageId, actionId: null });
  }

  const onDocClick = (e: MouseEvent) => {
    const t = e.target as Element | null;
    if (!t?.closest) return;
    const choice = t.closest<HTMLElement>(".warp-choices [data-act]");
    if (choice) {
      e.preventDefault();
      if ((choice as HTMLButtonElement).disabled) return;
      choice.classList.add("warp-choice-picked");
      act(choice.dataset.act!);
      return;
    }
    const dice = t.closest<HTMLElement>(".warp-chips [data-dice]");
    if (dice) {
      const row = dice.closest<HTMLElement>(".warp-chips")!;
      if (row.hasAttribute("data-open")) row.removeAttribute("data-open"); else row.setAttribute("data-open", "");
      return;
    }
    const more = t.closest<HTMLElement>(".warp-chips [data-more]");
    if (more) { more.closest(".warp-changed")?.setAttribute("data-more-open", ""); return; }
    const redo = t.closest<HTMLElement>(".warp-chips [data-redo]");
    if (redo) { e.preventDefault(); void confirmRedo(redo); return; }
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
    if (!/^[1-9]$/.test(e.key) || !state?.choices.length || !choicesEl?.isConnected) return;
    const c = choiceOrder(state.choices)[Number(e.key) - 1];
    if (!c || c.locked) return;
    e.preventDefault();
    act(c.id);
  };
  document.addEventListener("keydown", onKey);
  cleanups.push(() => document.removeEventListener("keydown", onKey));

  // ───────── backend messages ─────────
  cleanups.push(ctx.onBackendMessage((raw) => {
    const m = raw as BackendToFrontend;
    if (!acceptsResponse(m, chatId(), state)) return;
    switch (m.type) {
      case "state": {
        const rolls = newRolls(state, m);
        if (state?.chatId !== m.chatId) { editing = null; drafts = {}; lastBars = new Map(); }
        // The backend answered: a new click may go.
        if (state?.latestMessageId !== m.latestMessageId || state?.choicesAnchor !== m.choicesAnchor) pendingAct = null;
        state = m;
        if (m.chatId) busy = m.busy ? { chatId: m.chatId, on: true, label: busy.chatId === m.chatId ? busy.label : "" } : { chatId: "", on: false, label: "" };
        renderAll();
        playRolls(rolls);
        break;
      }
      case "busy":
        busy = { chatId: m.chatId, on: m.busy, label: m.busy ? m.label ?? busy.label ?? "" : "" };
        if (m.busy) pendingAct = null;
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
        else { drawerView = "sheet"; tab.activate(); }
        break;
      case "rulebook_export":
        exported = { name: m.name, text: m.text };
        drawerView = "rules";
        renderDrawer();
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
    if (now !== lastChat) {
      lastChat = now; state = null; builder = null; busy = { chatId: "", on: false, label: "" }; pendingAct = null; editing = null; drafts = {};
      renderAll(); send({ type: "refresh", chatId: now });
    }
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
