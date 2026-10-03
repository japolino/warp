// All Warp styles. Colours come from Lumiverse theme variables so Warp follows
// the user's theme; tone colours are the only fixed hues.

export const STYLES = `
.warp-root, .warp-chips, .warp-choices, .warp-modal, .warp-overlay, .warp-drag-ghost {
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
.warp-alloc { display: inline-flex; align-items: center; gap: 3px; margin-left: 6px; }
.warp-btn-mini { padding: 0 6px; min-width: 20px; line-height: 18px; font-size: 12px; }
.warp-alloc-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 12px; }
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
.warp-choice-ready { font-size: 11px; color: var(--warp-warn); }
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
.warp-why-btn { font: inherit; cursor: pointer; border: 1px dashed var(--warp-border); background: transparent; color: var(--warp-muted); }
.warp-why-detail { flex-basis: 100%; display: none; flex-direction: column; gap: 3px; padding: 4px 2px 0; font-size: 12px; color: var(--warp-muted); white-space: normal; }
.warp-chips[data-why-open] .warp-why-detail { display: flex; }

.warp-decision { border: 1px solid var(--warp-info); color: var(--warp-text); }
.warp-suggest { background: color-mix(in srgb, var(--warp-accent) 14%, transparent); border: 1px solid var(--warp-accent); gap: 8px; padding: 3px 4px 3px 10px; }
.warp-mini { padding: 1px 10px; font-size: 12px; }
.warp-slider { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--warp-muted); }
.warp-slider input { accent-color: var(--warp-accent); }

/* ───────── world: weather, warmth, outfit, encounter, perks ───────── */
.warp-weather { color: var(--warp-muted); font-size: 12.5px; }
.warp-warmth { padding: 2px 0 4px; }
.warp-warmth-track { position: relative; height: 8px; border-radius: 6px; margin-top: 4px;
  background: linear-gradient(90deg, #4f8cff 0%, #7fd1ff 25%, #f3e7b0 55%, #ffb347 78%, #e0505a 100%); opacity: .9; }
.warp-warmth-band { position: absolute; top: -2px; bottom: -2px; border: 2px solid var(--warp-good); border-radius: 6px; box-sizing: border-box; }
.warp-warmth-mark { position: absolute; top: -4px; width: 4px; height: 16px; margin-left: -2px; border-radius: 2px; box-shadow: 0 0 0 2px var(--warp-fill-strong, #16141d); }
.warp-warmth-mark.warp-bg-good { background: var(--warp-good); }
.warp-warmth-mark.warp-bg-warn { background: var(--warp-warn); }
.warp-warmth-mark.warp-bg-bad { background: var(--warp-bad); }
.warp-encounter { border: 1px solid var(--warp-bad); border-radius: var(--warp-radius); padding: 8px 10px; display: flex; flex-direction: column; gap: 4px;
  background: color-mix(in srgb, var(--warp-bad) 10%, transparent); }
.warp-encounter-foe { font-weight: 700; font-size: 14px; }
.warp-outfit-row { display: grid; grid-template-columns: 78px 1fr auto; gap: 6px; align-items: center; font-size: 12.5px; }
.warp-mini-select { width: auto; max-width: 110px; padding: 2px 4px; font-size: 12px; }
.warp-perk { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12.5px; }
.warp-perk-owned { opacity: .8; }
.warp-group + .warp-group { margin-top: 8px; }
.warp-group-head { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--warp-muted); padding: 4px 0 2px; border-bottom: 1px solid var(--warp-border); margin-bottom: 4px; }
.warp-perk-later { font-size: 12px; display: flex; flex-wrap: wrap; gap: 0 6px; }
.warp-perk-text { min-width: 0; }
.warp-perk-notes { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 11.5px; color: var(--warp-good); }
.warp-perk-drawback { font-size: 11.5px; color: var(--warp-warn); }
.warp-perk-pick { display: flex; flex-direction: column; gap: 6px; padding: 8px; margin-bottom: 6px; border-radius: var(--warp-radius); border: 1px solid color-mix(in srgb, var(--warp-accent) 55%, var(--warp-border)); background: color-mix(in srgb, var(--warp-accent) 7%, transparent); }
.warp-perk-pick-head { font-weight: 700; font-size: 12px; color: var(--warp-accent); }
.warp-quest { display: flex; flex-direction: column; gap: 3px; padding: 7px 8px; margin-bottom: 6px; border-radius: var(--warp-radius); border: 1px solid var(--warp-border); background: var(--warp-fill-subtle); font-size: 12.5px; }
.warp-quest-ready { border-color: color-mix(in srgb, var(--warp-good) 60%, var(--warp-border)); background: color-mix(in srgb, var(--warp-good) 7%, transparent); }
.warp-quest-offered { border-style: dashed; }
.warp-quest-done, .warp-quest-failed { opacity: .75; }
.warp-quest-failed .warp-quest-head b { text-decoration: line-through; text-decoration-color: var(--warp-bad); }
.warp-quest-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.warp-quest-kind { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: var(--warp-dim); border: 1px solid var(--warp-border); border-radius: 999px; padding: 0 6px; margin-left: 4px; }
.warp-quest-goals { list-style: none; margin: 2px 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }
.warp-quest-goals li.done { color: var(--warp-good); }
.warp-quest-goals li.optional { color: var(--warp-muted); }
.warp-quest-reward { color: var(--warp-warn); }
.warp-quest-stakes { color: var(--warp-bad); font-size: 11.5px; }
.warp-quest-actions { margin-top: 2px; align-items: center; }
.warp-btn-danger { border-color: var(--warp-bad); color: var(--warp-bad); }
.warp-foe-tags { display: inline-flex; flex-wrap: wrap; gap: 4px; margin-left: 6px; vertical-align: middle; }
.warp-foe-tags .warp-pill { font-size: 10px; padding: 0 6px; }
.warp-memories { margin-top: 3px; font-size: 11.5px; }
.warp-memories > summary { cursor: pointer; color: var(--warp-muted); }
.warp-memory { padding: 2px 0 2px 10px; border-left: 2px solid var(--warp-border); margin-top: 2px; color: var(--warp-muted); }
.warp-perk-offer + .warp-perk-offer { border-top: 1px dashed var(--warp-border); padding-top: 6px; }
.warp-person-here { border: 1px solid color-mix(in srgb, var(--warp-good) 55%, transparent); }
.warp-rel { cursor: pointer; border-radius: 4px; }
.warp-rel:hover { background: var(--warp-fill); }
.warp-forget { float: right; font-size: 11px; padding: 0 4px; }
.warp-here { font-size: 10.5px; color: var(--warp-good); border: 1px solid currentColor; border-radius: 999px; padding: 0 6px; margin-left: 4px; font-weight: 500; }

/* ───────── map & journal ───────── */
.warp-map-view { position: relative; height: 220px; border-radius: 10px; background: var(--warp-fill-subtle); overflow: hidden; touch-action: none; cursor: grab; }
.warp-root:not(.warp-overlay-body) .warp-map-view { height: 360px; }
.warp-panel-solo .warp-map-view { height: 300px; }
.warp-map-view.panning { cursor: grabbing; }
.warp-map-view.panning .warp-map-node { pointer-events: none; }
.warp-map { display: block; width: 100%; height: 100%; }
.warp-map-tools { position: absolute; right: 6px; bottom: 6px; display: flex; flex-direction: column; gap: 4px; }
.warp-map-tool { width: 26px; height: 26px; padding: 0; border-radius: 7px; border: 1px solid var(--warp-border); background: color-mix(in srgb, var(--lumiverse-fill-strong, #16141d) 82%, transparent); color: inherit; font: inherit; font-size: 14px; line-height: 1; cursor: pointer; }
.warp-map-tool:hover { border-color: var(--warp-accent); }
.warp-map-hint { font-size: 11px; margin: 2px 0 0; }
.warp-map-edge { stroke: var(--warp-border); stroke-width: 2; }
.warp-map-node circle { fill: var(--warp-fill); stroke: var(--warp-border); stroke-width: 2; }
.warp-map-node text { fill: var(--warp-muted); font-size: 11px; }
.warp-map-node .warp-map-people { fill: var(--warp-good); font-size: 10px; }
.warp-map-node .warp-map-icon { fill: var(--warp-dim); font-size: 10px; }
.warp-map-node.here circle { fill: var(--warp-accent); stroke: var(--warp-accent); }
.warp-map-node.here text { fill: var(--warp-text); font-weight: 700; }
.warp-map-node.reachable { cursor: pointer; }
.warp-map-node.locked circle { stroke-dasharray: 3 3; opacity: .6; }
.warp-map-node.reachable circle { stroke: var(--warp-accent); }
.warp-map-node.reachable:hover circle, .warp-map-node.reachable:focus circle { fill: color-mix(in srgb, var(--warp-accent) 35%, transparent); }
.warp-codex summary { cursor: pointer; padding: 3px 0; }
.warp-codex p { margin: 2px 0 6px 14px; }
.warp-feat { display: flex; gap: 8px; align-items: flex-start; opacity: .55; font-size: 12.5px; }
.warp-feat.unlocked { opacity: 1; }
.warp-timeline-row { font: inherit; color: inherit; text-align: left; background: none; border: none; border-top: 1px solid var(--warp-border); padding: 6px 2px; display: grid; grid-template-columns: 1fr; gap: 1px; cursor: pointer; }
.warp-timeline-row:hover { background: var(--warp-fill-subtle); }
.warp-news-row { border-top: 1px solid var(--warp-border); padding: 6px 2px; display: grid; gap: 1px; font-size: 12.5px; }
.warp-news-row:first-of-type { border-top: none; }
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
  display: grid; grid-template-columns: minmax(170px, 220px) 1fr; gap: 8px 18px; align-content: start;
}
.warp-overlay[data-edge=top] .warp-bars,
.warp-overlay[data-edge=bottom] .warp-bars {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px 18px;
}
.warp-overlay[data-edge=top] .warp-section,
.warp-overlay[data-edge=bottom] .warp-section { grid-column: 1 / -1; }.warp-overlay-collapsed .warp-overlay-head { cursor: pointer; }
.warp-overlay-collapsed .warp-overlay-body { display: none; }

/* ───────── the design plan ───────── */
.warp-plan-text { white-space: pre-wrap; font: inherit; font-size: 12.5px; line-height: 1.5; margin: 8px 0 0; }

/* ───────── encounters: goal, danger, rounds ───────── */
.warp-enc-guide { border: 1px solid color-mix(in srgb, var(--warp-bad) 45%, var(--warp-border)); border-radius: var(--warp-radius); padding: 8px 10px; display: flex; flex-direction: column; gap: 5px; margin-bottom: 8px; background: color-mix(in srgb, var(--warp-bad) 5%, transparent); font-size: 12.5px; }
.warp-enc-head { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; font-size: 13px; }
.warp-enc-goal b, .warp-enc-danger b, .warp-enc-last-head b { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--warp-dim); font-weight: 600; margin-right: 4px; }
.warp-enc-meters { display: grid; grid-template-columns: minmax(0, 1fr); gap: 3px 18px; }
@container (min-width: 520px) { .warp-enc-meters { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.warp-enc-meter { display: grid; grid-template-columns: minmax(64px, auto) 1fr auto; align-items: center; gap: 8px; font-size: 12px; font-variant-numeric: tabular-nums; }
.warp-enc-danger { font-size: 12px; font-variant-numeric: tabular-nums; }
.warp-enc-last { border-top: 1px dashed var(--warp-border); padding-top: 5px; display: flex; flex-direction: column; gap: 3px; }
.warp-enc-last-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; }
.warp-enc-say { display: flex; gap: 6px; }
.warp-enc-say .warp-input { flex: 1; min-width: 0; padding-top: 4px; padding-bottom: 4px; }
.warp-choice-why { display: block; font-size: 11px; color: var(--warp-dim); margin-top: 1px; }
.warp-choice-locked { opacity: .55; cursor: not-allowed; }
.warp-choice-item { border-style: dashed; }
.warp-enc-log { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; font-size: 12px; }
.warp-enc-log > .warp-round, .warp-rounds-list > .warp-round { padding: 5px 8px; border-radius: 8px; background: var(--warp-fill-subtle); border: 1px solid var(--warp-border); }
.warp-enc-log-foot { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; }
.warp-round { display: flex; flex-direction: column; gap: 1px; font-size: 12px; min-width: 0; }
.warp-round-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; }
.warp-round-n { font-variant-numeric: tabular-nums; color: var(--warp-dim); min-width: 1.1em; }
.warp-round-foe, .warp-round-changes, .warp-round-end { padding-left: calc(1.1em + 8px); }
.warp-round-changes { display: flex; flex-wrap: wrap; gap: 0 10px; font-size: 11.5px; font-variant-numeric: tabular-nums; }
.warp-round-end { font-weight: 700; }
.warp-round-final { padding: 5px 8px; border-radius: 8px; border: 1px solid currentColor; background: var(--warp-fill-subtle); }
.warp-rounds, .warp-enc-why { font-size: 11.5px; }
.warp-rounds > summary, .warp-enc-why > summary { cursor: pointer; color: var(--warp-dim); list-style: none; }
.warp-rounds > summary::-webkit-details-marker, .warp-enc-why > summary::-webkit-details-marker { display: none; }
.warp-rounds > summary:hover, .warp-enc-why > summary:hover { color: var(--warp-text); }
.warp-rounds > summary::after { content: " ▾"; }
.warp-rounds[open], .warp-enc-why[open] { flex-basis: 100%; }
.warp-rounds-list { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
.warp-enc-why-body { display: flex; flex-direction: column; gap: 3px; margin-top: 4px; color: var(--warp-muted); }
.warp-item-usable .warp-item-name { min-width: 0; }
.warp-item-side { display: flex; align-items: center; gap: 6px; }
.warp-item-bonus { display: block; font-size: 11px; color: var(--warp-good); }

/* ───────── torn-off panels ───────── */
.warp-section > summary > span { flex: 1; }
.warp-section > summary[data-part] { position: relative; }
.warp-section > summary[data-part]::before { content: "⠿"; position: absolute; left: -11px; opacity: 0; transition: opacity var(--warp-fast); cursor: grab; }
.warp-section > summary[data-part]:hover::before { opacity: .7; }
.warp-section.warp-dragging { opacity: .35; }
.warp-panel .warp-overlay-title { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--warp-dim); }
.warp-panel .warp-overlay-body { padding-bottom: 8px; }
.warp-panel-solo { display: flex; flex-direction: column; gap: 6px; padding-top: 6px; }
.warp-overlay.warp-drop-target { border-color: var(--warp-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--warp-accent) 35%, transparent), 0 12px 32px rgba(0,0,0,.35); }
/* Dropping on a panel: near a side, beside it as a second column; on a dual panel, into the column under the pointer. */
.warp-overlay.warp-drop-target[data-drop=left] { box-shadow: inset 5px 0 0 var(--warp-accent), 0 0 0 3px color-mix(in srgb, var(--warp-accent) 35%, transparent); }
.warp-overlay.warp-drop-target[data-drop=right] { box-shadow: inset -5px 0 0 var(--warp-accent), 0 0 0 3px color-mix(in srgb, var(--warp-accent) 35%, transparent); }
.warp-overlay.warp-drop-target[data-drop=col0] .warp-col[data-col="0"],
.warp-overlay.warp-drop-target[data-drop=col1] .warp-col[data-col="1"] { background: color-mix(in srgb, var(--warp-accent) 10%, transparent); border-radius: 8px; }
.warp-cols { display: flex; align-items: flex-start; gap: 0; }
.warp-col { flex: 1 1 0; min-width: 0; padding: 0 8px; box-sizing: border-box; }
.warp-col:first-child { padding-left: 0; }
.warp-col:last-child { padding-right: 0; }
.warp-col + .warp-col { border-left: 1px solid var(--lumiverse-border, rgba(255,255,255,0.12)); }
/* The corner grip: drag to resize, double-click to fit again. */
.warp-overlay { position: relative; }
.warp-resize { position: absolute; right: 0; bottom: 0; width: 16px; height: 16px; cursor: nwse-resize; touch-action: none; z-index: 2;
  background: linear-gradient(135deg, transparent 0 55%, var(--lumiverse-text-dim, rgba(255,255,255,.35)) 55% 62%, transparent 62% 72%, var(--lumiverse-text-dim, rgba(255,255,255,.35)) 72% 79%, transparent 79%);
  border-bottom-right-radius: 14px; opacity: .55; }
.warp-resize:hover { opacity: 1; }
.warp-overlay-collapsed > .warp-resize, .warp-overlay[data-edge]:not([data-edge=""]) > .warp-resize { display: none; }
.warp-drag-ghost {
  position: fixed; left: 0; top: 0; z-index: 2147483000; pointer-events: none;
  padding: 7px 12px; border-radius: 10px; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase;
  color: var(--lumiverse-text, #e8e8ee); background: color-mix(in srgb, var(--lumiverse-fill-strong, #16141d) 92%, transparent);
  border: 1px solid var(--warp-accent, #8b7cff); box-shadow: 0 10px 24px rgba(0,0,0,.4);
}
.warp-drag-ghost.warp-ghost-new::after { content: "  ·  new window"; opacity: .6; }
.warp-drag-ghost[data-full]:not([data-full=""])::after { content: "  ·  " attr(data-full); opacity: .6; }

/* ───────── modal ───────── */
.warp-modal { display: flex; flex-direction: column; gap: 10px; padding: 4px 2px; }
.warp-template { text-align: left; font: inherit; color: inherit; cursor: pointer; }
.warp-template:hover { border-color: var(--warp-accent); }

/* ───────── swinging fights ───────── */
.warp-momentum { position: relative; height: 8px; border-radius: 4px; background: linear-gradient(90deg, var(--warp-good), var(--warp-fill) 45%, var(--warp-fill) 55%, var(--warp-bad)); }
.warp-momentum-mid { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: var(--warp-border); }
.warp-momentum-mark { position: absolute; top: -3px; width: 4px; height: 14px; margin-left: -2px; border-radius: 2px; background: var(--warp-text); transition: left 400ms ease; }

/* ───────── checkpoints ───────── */
.warp-run-slot { display: grid; grid-template-columns: 52px 1fr auto auto; gap: 6px; align-items: center; font-size: 12.5px; }
.warp-run-slot-name { color: var(--warp-dim); }
.warp-run-slot-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.warp-run-end { padding: 8px; border-radius: var(--warp-radius); border: 1px solid currentColor; }
`;
