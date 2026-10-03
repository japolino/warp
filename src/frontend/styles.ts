// All Warp styles. Colours come from Lumiverse theme variables so Warp follows
// the user's theme; tone colours are the only fixed hues.

export const STYLES = `
.warp-root, .warp-chips, .warp-choices, .warp-modal, .warp-overlay {
  --warp-good: #34b89a;
  --warp-warn: #d9a441;
  --warp-bad: #e05a7e;
  --warp-info: #6f8cff;
  --warp-text: var(--lumiverse-text, #e8e8ee);
  --warp-muted: var(--lumiverse-text-muted, #a4a4b4);
  --warp-dim: var(--lumiverse-text-dim, #7a7a8a);
  --warp-fill: var(--lumiverse-fill, rgba(255,255,255,0.06));
  --warp-fill-subtle: var(--lumiverse-fill-subtle, rgba(255,255,255,0.03));
  --warp-border: var(--lumiverse-border, rgba(255,255,255,0.12));
  --warp-accent: var(--lumiverse-accent, #8b7bff);
  --warp-accent-fg: var(--lumiverse-accent-fg, #fff);
  --warp-radius: var(--lumiverse-radius, 8px);
  --warp-fast: var(--lumiverse-transition-fast, 120ms);
  color: var(--warp-text);
  font-size: 13px;
  line-height: 1.4;
}
.warp-tone-good { color: var(--warp-good); }
.warp-tone-warn { color: var(--warp-warn); }
.warp-tone-bad { color: var(--warp-bad); }
.warp-tone-neutral { color: var(--warp-muted); }
.warp-dim { color: var(--warp-dim); }

/* ───────── HUD ───────── */
.warp-root { display: flex; flex-direction: column; gap: 10px; padding: 12px; box-sizing: border-box; }
.warp-hud-top { display: flex; flex-direction: column; gap: 2px; }
.warp-eyebrow { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--warp-dim); display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.warp-clock { display: flex; align-items: baseline; gap: 8px; }
.warp-clock-time { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: .01em; }
.warp-clock-day { color: var(--warp-muted); }
.warp-phase { font-size: 14px; }
.warp-where { color: var(--warp-muted); display: flex; gap: 10px; flex-wrap: wrap; }
.warp-where b { color: var(--warp-text); font-weight: 600; }
.warp-money { font-weight: 600; font-variant-numeric: tabular-nums; color: var(--warp-warn); }
.warp-pills { display: flex; flex-wrap: wrap; gap: 4px; }
.warp-pill { font-size: 11px; padding: 1px 8px; border-radius: 999px; border: 1px solid currentColor; opacity: .95; }

.warp-bars { display: flex; flex-direction: column; gap: 7px; }
.warp-bar { cursor: pointer; border-radius: 6px; padding: 2px 4px; margin: 0 -4px; transition: background var(--warp-fast); }
.warp-bar:hover { background: var(--warp-fill-subtle); }
.warp-bar-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.warp-bar-label { font-weight: 600; white-space: nowrap; }
.warp-bar-text { text-align: right; font-size: 12.5px; }
.warp-bar-track { height: 4px; border-radius: 4px; background: var(--warp-fill); overflow: hidden; margin-top: 3px; }
.warp-bar-fill { height: 100%; border-radius: 4px; transition: width 400ms ease, background 400ms ease; }
.warp-bar-fill.warp-bg-good { background: var(--warp-good); }
.warp-bar-fill.warp-bg-warn { background: var(--warp-warn); }
.warp-bar-fill.warp-bg-bad { background: var(--warp-bad); }
.warp-bar-fill.warp-bg-neutral { background: var(--warp-info); }
.warp-bar-edit { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
.warp-bar-edit input[type=range] { flex: 1; accent-color: var(--warp-accent); }
.warp-bar-edit input[type=number] { width: 64px; }
.warp-of { font-size: 12px; white-space: nowrap; }
.warp-changed { animation: warp-flash 1.2s ease; }
@keyframes warp-flash { 0% { background: color-mix(in srgb, var(--warp-accent) 30%, transparent); } 100% { background: transparent; } }

.warp-section { border-top: 1px solid var(--warp-border); padding-top: 8px; }
.warp-section > summary { cursor: pointer; list-style: none; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--warp-dim); display: flex; justify-content: space-between; user-select: none; }
.warp-section > summary::-webkit-details-marker { display: none; }
.warp-section > summary::after { content: "▸"; transition: transform var(--warp-fast); }
.warp-section[open] > summary::after { transform: rotate(90deg); }
.warp-section-body { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }

.warp-skill { display: grid; grid-template-columns: 1fr auto 44px; align-items: center; gap: 8px; }
.warp-grade { font-weight: 700; min-width: 22px; text-align: center; }
.warp-mini-track { height: 3px; background: var(--warp-fill); border-radius: 3px; overflow: hidden; }
.warp-mini-fill { height: 100%; background: var(--warp-accent); }
.warp-skill-tracks { display: flex; flex-direction: column; gap: 2px; }
.warp-practice-track { height: 2px; background: var(--warp-fill); border-radius: 2px; overflow: hidden; }
.warp-practice-fill { height: 100%; background: var(--warp-good); opacity: .8; transition: width .4s ease; }
.warp-away { margin-top: 6px; }
.warp-away > summary { cursor: pointer; font-size: 12px; color: var(--warp-muted); padding: 2px 0; }
.warp-away > .warp-section-body { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; opacity: .85; }
.warp-person { padding: 6px 8px; border-radius: var(--warp-radius); background: var(--warp-fill-subtle); }
.warp-person-name { font-weight: 600; margin-bottom: 2px; }
.warp-person-stats { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 12px; color: var(--warp-muted); }
.warp-item { display: flex; justify-content: space-between; }
.warp-empty { color: var(--warp-dim); font-style: italic; }

/* ───────── buttons & forms ───────── */
.warp-btn { font: inherit; color: var(--warp-text); background: var(--warp-fill); border: 1px solid var(--warp-border); border-radius: var(--warp-radius); padding: 6px 12px; cursor: pointer; transition: background var(--warp-fast), border-color var(--warp-fast), transform var(--warp-fast); }
.warp-btn:hover { border-color: var(--warp-accent); }
.warp-btn:active { transform: translateY(1px); }
.warp-btn-primary { background: var(--warp-accent); color: var(--warp-accent-fg); border-color: transparent; }
.warp-btn-ghost { background: transparent; border-color: transparent; color: var(--warp-muted); padding: 2px 6px; }
.warp-btn-ghost:hover { color: var(--warp-text); }
.warp-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.warp-card { border: 1px solid var(--warp-border); border-radius: calc(var(--warp-radius) + 2px); padding: 12px; background: var(--warp-fill-subtle); display: flex; flex-direction: column; gap: 8px; }
.warp-card h3 { margin: 0; font-size: 14px; }
.warp-card p { margin: 0; color: var(--warp-muted); }
.warp-toggle { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; align-items: center; padding: 6px 0; cursor: pointer; }
.warp-toggle small { grid-column: 1; color: var(--warp-dim); }
.warp-toggle input { grid-row: 1 / span 2; grid-column: 2; accent-color: var(--warp-accent); width: 16px; height: 16px; }
.warp-select, .warp-input { font: inherit; color: var(--warp-text); background: var(--warp-fill); border: 1px solid var(--warp-border); border-radius: 6px; padding: 5px 8px; width: 100%; box-sizing: border-box; }
.warp-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.warp-tag { font: inherit; font-size: 12px; border-radius: 999px; padding: 2px 10px; border: 1px solid var(--warp-border); background: transparent; color: var(--warp-muted); cursor: pointer; }
.warp-tag[data-mode=veil] { color: var(--warp-warn); border-color: var(--warp-warn); }
.warp-tag[data-mode=line] { color: var(--warp-bad); border-color: var(--warp-bad); text-decoration: line-through; }
.warp-issues { display: flex; flex-direction: column; gap: 6px; }
.warp-issue { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; font-size: 12.5px; }
.warp-issue-where { color: var(--warp-dim); grid-column: 2; font-size: 11.5px; }
.warp-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--warp-border); margin: -4px -12px 0; padding: 0 8px; position: sticky; top: 0; background: inherit; z-index: 1; }
.warp-tab { font: inherit; background: none; border: none; color: var(--warp-muted); padding: 8px 10px; cursor: pointer; border-bottom: 2px solid transparent; }
.warp-tab[aria-selected=true] { color: var(--warp-text); border-bottom-color: var(--warp-accent); }
.warp-kbd { font-family: ui-monospace, monospace; font-size: 10.5px; padding: 0 5px; border-radius: 4px; border: 1px solid var(--warp-border); color: var(--warp-muted); }

/* ───────── choices under the latest reply ───────── */
.warp-choices { container-type: inline-size; margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--warp-border); display: flex; flex-direction: column; gap: 8px; transition: opacity 200ms; }
.warp-choice-group { display: flex; flex-direction: column; gap: 5px; }
.warp-choice-group-label { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--warp-dim); }
.warp-choice-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 6px; }
.warp-choice { font: inherit; text-align: left; display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: var(--warp-radius); border: 1px solid var(--warp-border); background: var(--warp-fill-subtle); color: var(--warp-text); cursor: pointer; transition: border-color var(--warp-fast), background var(--warp-fast), transform var(--warp-fast); min-height: 34px; }
.warp-choice:hover { border-color: var(--warp-accent); background: var(--warp-fill); }
.warp-choice:active { transform: translateY(1px); }
.warp-choice:focus-visible { outline: 2px solid var(--warp-accent); outline-offset: 1px; }
.warp-choice-label { flex: 1; }
.warp-choice-odds { font-size: 11.5px; font-variant-numeric: tabular-nums; font-weight: 600; }
.warp-choice-veil { font-size: 11px; color: var(--warp-warn); }
.warp-status-line { font-size: 12px; color: var(--warp-muted); display: flex; align-items: center; gap: 6px; }
.warp-spinner { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--warp-border); border-top-color: var(--warp-accent); animation: warp-spin .8s linear infinite; }
@keyframes warp-spin { to { transform: rotate(360deg); } }

/* ───────── per-message dice & change chips ───────── */
/* If the host ever re-attaches our row inside a message card (a side-by-side
   flex box), wrap it onto its own full-width line rather than squeezing the text. */
[data-message-id]:has(> [data-spindle-inj-id] > .warp-chips, > [data-spindle-inj-id] > .warp-choices) { flex-wrap: wrap; }
[data-message-id] > [data-spindle-inj-id]:has(> .warp-chips, > .warp-choices) { flex: 1 0 100%; min-width: 0; }
.warp-chips { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 5px; align-items: center; font-size: 12px; }
.warp-chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 999px; background: var(--warp-fill); border: 1px solid transparent; white-space: nowrap; }
.warp-chip-narr { border-style: dashed; border-color: var(--warp-border); }
.warp-chip-undo { font: inherit; background: none; border: none; color: var(--warp-dim); cursor: pointer; padding: 0 0 0 2px; line-height: 1; }
.warp-chip-undo:hover { color: var(--warp-bad); }
.warp-dice { cursor: pointer; font-weight: 600; border: 1px solid currentColor; background: transparent; }
.warp-dice-detail { flex-basis: 100%; display: none; gap: 6px; align-items: center; color: var(--warp-muted); padding: 4px 2px 0; flex-wrap: wrap; }
.warp-chips[data-open] .warp-dice-detail { display: flex; }
.warp-die { display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding: 0 4px; border-radius: 6px; border: 1px solid var(--warp-border); font-weight: 700; font-variant-numeric: tabular-nums; color: var(--warp-text); }
.warp-die[data-dropped] { opacity: .35; text-decoration: line-through; }
.warp-band { color: var(--warp-dim); font-style: italic; }
.warp-mini { padding: 1px 10px; font-size: 12px; }
.warp-slider { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--warp-muted); }
.warp-slider input { accent-color: var(--warp-accent); }

/* ───────── journal ───────── */
.warp-timeline-row { font: inherit; color: inherit; text-align: left; background: none; border: none; border-top: 1px solid var(--warp-border); padding: 6px 2px; display: grid; grid-template-columns: 1fr; gap: 1px; cursor: pointer; }
.warp-timeline-row:hover { background: var(--warp-fill-subtle); }
.warp-timeline-changes { font-size: 11.5px; }

/* ───────── AI builder ───────── */
.warp-builder { display: flex; flex-direction: column; gap: 10px; }
.warp-builder-head { display: flex; justify-content: space-between; align-items: flex-start; }
.warp-steps { display: flex; gap: 4px; list-style: none; margin: 0; padding: 0; counter-reset: s; }
.warp-steps li { flex: 1; font-size: 11px; text-align: center; padding: 4px 2px; border-bottom: 3px solid var(--warp-border); color: var(--warp-dim); counter-increment: s; }
.warp-steps li::before { content: counter(s) ". "; }
.warp-steps li.done { border-color: color-mix(in srgb, var(--warp-accent) 55%, transparent); color: var(--warp-muted); }
.warp-steps li.now { border-color: var(--warp-accent); color: var(--warp-text); font-weight: 600; }
.warp-q { display: flex; flex-direction: column; gap: 6px; padding: 8px 0; border-top: 1px solid var(--warp-border); }
.warp-q:first-of-type { border-top: none; }
.warp-q-text { font-weight: 600; }
.warp-q-why { font-size: 12px; margin-top: -4px; }
.warp-opt[aria-pressed=true] { background: var(--warp-accent); color: var(--warp-accent-fg); border-color: transparent; }
.warp-scale { width: 100%; accent-color: var(--warp-accent); }
.warp-scale-labels { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--warp-dim); }
.warp-add-row { display: grid; grid-template-columns: 1fr 86px 1.4fr auto; gap: 4px; align-items: center; }
.warp-field { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--warp-muted); }
.warp-seg { display: flex; border: 1px solid var(--warp-border); border-radius: var(--warp-radius); overflow: hidden; }
.warp-seg-btn { flex: 1; font: inherit; font-size: 12.5px; padding: 7px 8px; background: transparent; border: none; color: var(--warp-muted); cursor: pointer; }
.warp-seg-btn[aria-pressed=true] { background: var(--warp-accent); color: var(--warp-accent-fg); }
.warp-preview-grid { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.warp-preview-hud { border: 1px solid var(--warp-border); border-radius: var(--warp-radius); max-height: 320px; overflow: auto; }
.warp-preview .warp-choices { margin-top: 0; border-top: none; padding-top: 0; }
.warp-part { border-top: 1px solid var(--warp-border); padding: 6px 0; }
.warp-part > summary { cursor: pointer; }
.warp-yaml { max-height: 240px; overflow: auto; font-size: 11.5px; background: var(--warp-fill-subtle); border-radius: 6px; padding: 8px; white-space: pre; }
.warp-busy-card { border-color: var(--warp-accent); }
.warp-error-card { border-color: var(--warp-bad); }
.warp-builder-foot { justify-content: space-between; }
.warp-builder-cta { border-color: color-mix(in srgb, var(--warp-accent) 50%, transparent); }
.warp-btn[disabled] { opacity: .5; cursor: not-allowed; }

/* ───────── floating status overlay ───────── */
.warp-overlay {
  --warp-good: #34b89a; --warp-warn: #d9a441; --warp-bad: #e05a7e; --warp-info: #6f8cff;
  display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden;
  color: var(--lumiverse-text, #e8e8ee); font-size: 13px;
  background: color-mix(in srgb, var(--lumiverse-fill-strong, #16141d) 88%, transparent);
  -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
  border: 1px solid var(--lumiverse-border, rgba(255,255,255,0.12));
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(0,0,0,.35);
}
.warp-overlay-head { display: flex; align-items: center; gap: 8px; height: 38px; flex: 0 0 38px; padding: 0 6px 0 12px; box-sizing: border-box; cursor: grab; user-select: none; }
.warp-overlay-head:active { cursor: grabbing; }
.warp-overlay-title { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.warp-overlay-actions { display: flex; gap: 2px; }
.warp-overlay-actions .warp-btn { font-size: 15px; line-height: 1; padding: 4px 8px; }
.warp-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 8px; }
.warp-dot.warp-bg-good { background: var(--warp-good); }
.warp-dot.warp-bg-warn { background: var(--warp-warn); }
.warp-dot.warp-bg-bad { background: var(--warp-bad); }
.warp-overlay-body { flex: 1; overflow-y: auto; overscroll-behavior: contain; max-height: var(--warp-overlay-max, 70vh); padding-top: 4px; border-top: 1px solid var(--lumiverse-border, rgba(255,255,255,0.12)); }
.warp-overlay-collapsed { border-radius: 999px; }

/* Attached to a screen edge: sidebar (left/right) or strip (top/bottom). */
.warp-overlay[data-edge=left]:not(.warp-overlay-collapsed),
.warp-overlay[data-edge=right]:not(.warp-overlay-collapsed) { border-radius: 12px; }
.warp-overlay[data-edge=top]:not(.warp-overlay-collapsed),
.warp-overlay[data-edge=bottom]:not(.warp-overlay-collapsed) { border-radius: 12px; }
.warp-overlay[data-edge=top] .warp-overlay-body,
.warp-overlay[data-edge=bottom] .warp-overlay-body {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px 18px; align-content: start;
}
.warp-overlay[data-edge=top] .warp-conflict,
.warp-overlay[data-edge=bottom] .warp-conflict,
.warp-overlay[data-edge=top] .warp-card,
.warp-overlay[data-edge=bottom] .warp-card { grid-column: 1 / -1; }
.warp-overlay[data-edge=top] .warp-section,
.warp-overlay[data-edge=bottom] .warp-section { border-top: none; padding-top: 0; }
.warp-overlay-collapsed .warp-overlay-head { cursor: pointer; }
.warp-overlay-collapsed .warp-overlay-body { display: none; }

/* ───────── modal ───────── */
.warp-modal { display: flex; flex-direction: column; gap: 10px; padding: 4px 2px; }
.warp-template { text-align: left; font: inherit; color: inherit; cursor: pointer; }
.warp-template:hover { border-color: var(--warp-accent); }

/* ───────── status panel: lines, fixes, people, goals ───────── */
.warp-section > summary > span { flex: 1; }
.warp-line { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; }
.warp-line > span { min-width: 0; overflow-wrap: anywhere; }
.warp-edit { flex: 0 0 auto; font-size: 12px; padding: 0 6px; opacity: .55; }
.warp-line:hover .warp-edit, .warp-edit:focus-visible { opacity: 1; }
@media (hover: none) { .warp-edit { opacity: .8; } }
.warp-fix { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 4px 0 2px; }
.warp-fix .warp-input { flex: 1 1 140px; min-width: 0; width: auto; }
.warp-fix .warp-num, .warp-bar-edit .warp-num { flex: 0 0 72px; width: 72px; }
.warp-fix .warp-time { flex: 0 0 auto; width: auto; }
.warp-fix-label { display: inline-flex; align-items: center; gap: 4px; color: var(--warp-muted); font-size: 12px; }
.warp-hint { font-size: 12px; }
.warp-sub { margin-top: 2px; }
.warp-sub > summary { cursor: pointer; font-size: 12px; color: var(--warp-muted); padding: 2px 0; }
.warp-sub-body { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.warp-group + .warp-group { margin-top: 8px; }
.warp-group-head { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--warp-muted); padding: 4px 0 2px; border-bottom: 1px solid var(--warp-border); margin-bottom: 4px; }
.warp-skill { cursor: pointer; border-radius: 6px; }
.warp-skill:hover { background: var(--warp-fill-subtle); }
.warp-item { gap: 8px; align-items: center; }
.warp-item-name { min-width: 0; overflow-wrap: anywhere; }
.warp-item-side { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
.warp-item-bonus { display: block; font-size: 11px; color: var(--warp-good); }
.warp-person-here { border: 1px solid color-mix(in srgb, var(--warp-good) 55%, transparent); }
.warp-rel { font: inherit; color: inherit; background: none; border: none; padding: 0 2px; cursor: pointer; border-radius: 4px; }
.warp-rel:hover { background: var(--warp-fill); }
.warp-forget { float: right; font-size: 11px; padding: 0 4px; }
.warp-here { font: inherit; font-size: 10.5px; color: var(--warp-good); background: none; border: 1px solid currentColor; border-radius: 999px; padding: 0 6px; margin-left: 4px; font-weight: 500; cursor: pointer; }
.warp-away-badge { color: var(--warp-dim); border-style: dashed; }
.warp-looks { margin-top: 3px; font-size: 12px; }
.warp-looks > summary { cursor: pointer; color: var(--warp-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.warp-looks[open] > summary { white-space: normal; }
.warp-memories { margin-top: 3px; font-size: 11.5px; }
.warp-memories > summary { cursor: pointer; color: var(--warp-muted); }
.warp-memory { padding: 2px 0 2px 10px; border-left: 2px solid var(--warp-border); margin-top: 2px; color: var(--warp-muted); }
.warp-person-actions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.warp-goal { display: flex; flex-direction: column; gap: 2px; padding: 4px 0; }
.warp-goal + .warp-goal { border-top: 1px solid var(--warp-border); }
.warp-goal-done, .warp-goal-failed { opacity: .75; }
.warp-goal-failed .warp-line > span { text-decoration: line-through; text-decoration-color: var(--warp-bad); }
.warp-goal-stakes { color: var(--warp-bad); font-size: 11.5px; }
.warp-btn-danger { border-color: var(--warp-bad); color: var(--warp-bad); }
.warp-tag[aria-pressed=true] { color: var(--warp-good); border-color: var(--warp-good); }

/* ───────── conflict: one momentum gauge, You on the left ───────── */
.warp-conflict { border: 1px solid color-mix(in srgb, var(--warp-bad) 45%, var(--warp-border)); border-radius: var(--warp-radius); padding: 8px 10px; display: flex; flex-direction: column; gap: 5px; background: color-mix(in srgb, var(--warp-bad) 6%, transparent); }
.warp-conflict-head { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; flex-wrap: wrap; }
.warp-conflict-words { font-weight: 600; }
.warp-conflict-slim { padding: 6px 8px; gap: 3px; font-size: 12px; }
.warp-gauge-labels { display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; }
.warp-momentum { position: relative; height: 8px; border-radius: 4px; background: linear-gradient(90deg, var(--warp-good), var(--warp-fill) 45%, var(--warp-fill) 55%, var(--warp-bad)); }
.warp-momentum-mid { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: var(--warp-border); }
.warp-momentum-mark { position: absolute; top: -3px; width: 4px; height: 14px; margin-left: -2px; border-radius: 2px; background: var(--warp-text); transition: left 400ms ease; }

/* ───────── under each reply: one dice chip + one "what changed" line ───────── */
.warp-whatchanged { flex-basis: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; color: var(--warp-muted); font-size: 12px; }
.warp-ch { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }
.warp-ch-line { color: var(--warp-text); font-style: italic; white-space: normal; }
.warp-ch-sep { color: var(--warp-dim); }
.warp-whatchanged:not([data-more-open]) .warp-ch-extra, .warp-whatchanged:not([data-more-open]) .warp-ch-extra + .warp-ch-sep,
.warp-whatchanged:not([data-more-open]) .warp-ch-sep:has(+ .warp-ch-extra) { display: none; }
.warp-ch-more { font: inherit; font-size: 11.5px; background: none; border: 1px dashed var(--warp-border); border-radius: 999px; color: var(--warp-muted); padding: 0 8px; cursor: pointer; }
.warp-whatchanged[data-more-open] .warp-ch-more { display: none; }
.warp-choice-why { display: block; font-size: 11px; color: var(--warp-dim); margin-top: 1px; }
.warp-choice-locked { opacity: .55; cursor: not-allowed; }
.warp-choice-item { border-style: dashed; }
.warp-more { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.warp-choice-small { min-height: 28px; padding: 3px 9px; font-size: 12px; flex: 0 1 auto; }
.warp-more-fold > summary { list-style: none; cursor: pointer; padding: 2px 8px; border-radius: var(--warp-radius); border: 1px solid var(--warp-border); color: var(--warp-muted); }
.warp-more-fold > summary::-webkit-details-marker { display: none; }
.warp-more-fold[open] { flex-basis: 100%; }
.warp-more-fold[open] > .warp-more { margin-top: 4px; }
.warp-choice-picked { border-color: var(--warp-accent); background: var(--warp-fill); }

/* ───────── the one roll animation ───────── */
.warp-chips { position: relative; }
.warp-roll { animation: warp-roll-glow 2.6s ease; border-radius: var(--warp-radius); }
.warp-roll-good { --warp-roll: var(--warp-good); }
.warp-roll-warn { --warp-roll: var(--warp-warn); }
.warp-roll-bad { --warp-roll: var(--warp-bad); }
@keyframes warp-roll-glow { 0%, 60% { box-shadow: 0 0 0 1px var(--warp-roll), 0 0 18px -4px var(--warp-roll); } 100% { box-shadow: none; } }
.warp-roll-pop { animation: warp-roll-pop 420ms cubic-bezier(.2,1.6,.4,1); }
@keyframes warp-roll-pop { 0% { transform: scale(.6) rotate(-12deg); } 100% { transform: none; } }
.warp-roll-stamp { position: absolute; left: 50%; top: -6px; transform: translate(-50%, -100%); pointer-events: none; font-weight: 800; letter-spacing: .06em; font-size: 13px; padding: 2px 10px; border: 2px solid currentColor; border-radius: 6px; background: color-mix(in srgb, var(--lumiverse-fill-strong, #16141d) 85%, transparent); white-space: nowrap; animation: warp-roll-stamp 2.6s ease forwards; }
@keyframes warp-roll-stamp { 0% { opacity: 0; transform: translate(-50%, -100%) scale(1.6); } 12% { opacity: 1; transform: translate(-50%, -100%) scale(1); } 75% { opacity: 1; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .warp-roll-pop, .warp-roll-stamp, .warp-momentum-mark, .warp-bar-fill { animation: none !important; transition: none !important; }
}

/* ───────── small screens (phones) ───────── */
.warp-template-pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
@media (max-width: 480px) {
  .warp-root { padding: 10px; gap: 8px; }
  .warp-choice-grid { grid-template-columns: 1fr; }
  .warp-choice { min-height: 40px; }
  .warp-clock-time { font-size: 18px; }
  .warp-template-pair { grid-template-columns: 1fr; }
}
`;
