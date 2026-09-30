// All Warp styles. Colours come from Lumiverse theme variables so Warp follows
// the user's theme; tone colours are the only fixed hues.

export const STYLES = `
.warp-root, .warp-chips, .warp-choices, .warp-modal {
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
.warp-bar-edit input[type=number] { width: 72px; }
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
.warp-choices { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--warp-border); display: flex; flex-direction: column; gap: 8px; transition: opacity 200ms; }
.warp-choices.warp-busy { opacity: .45; pointer-events: none; }
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

.warp-decision { border: 1px solid var(--warp-info); color: var(--warp-text); }
.warp-suggest { background: color-mix(in srgb, var(--warp-accent) 14%, transparent); border: 1px solid var(--warp-accent); gap: 8px; padding: 3px 4px 3px 10px; }
.warp-mini { padding: 1px 10px; font-size: 12px; }
.warp-slider { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--warp-muted); }
.warp-slider input { accent-color: var(--warp-accent); }

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
  display: grid; grid-template-columns: minmax(170px, 220px) 1fr; gap: 8px 18px; align-content: start;
}
.warp-overlay[data-edge=top] .warp-bars,
.warp-overlay[data-edge=bottom] .warp-bars {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px 18px;
}
.warp-overlay[data-edge=top] .warp-section,
.warp-overlay[data-edge=bottom] .warp-section { grid-column: 1 / -1; }.warp-overlay-collapsed .warp-overlay-head { cursor: pointer; }
.warp-overlay-collapsed .warp-overlay-body { display: none; }

/* ───────── modal ───────── */
.warp-modal { display: flex; flex-direction: column; gap: 10px; padding: 4px 2px; }
.warp-template { text-align: left; font: inherit; color: inherit; cursor: pointer; }
.warp-template:hover { border-color: var(--warp-accent); }
`;
