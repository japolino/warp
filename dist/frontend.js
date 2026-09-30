var __esm = (fn, res, err) => () => {
  if (fn)
    try {
      res = fn(fn = 0);
    } catch (e) {
      err = [e];
    }
  if (err)
    throw err[0];
  return res;
};

// src/shared/protocol.ts
var DEFAULT_SETTINGS;
var init_protocol = __esm(() => {
  DEFAULT_SETTINGS = {
    enabled: true,
    freeTextChecks: true,
    narratorUpdates: true,
    swipesReroll: true,
    helperConnectionId: "",
    showOdds: true,
    showDiceChips: true,
    hotkeys: true,
    lines: [],
    veils: [],
    decider: "llm",
    jevModel: "jev-latest",
    autoConfidence: 0.75,
    askConfidence: 0.4,
    consistencyCheck: false,
    drafts: 1,
    prewrite: 0
  };
});

// src/frontend.ts
init_protocol();

// src/frontend/styles.ts
var STYLES = `
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
.warp-choice-ready { font-size: 11px; color: var(--warp-warn); }
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
.warp-perk-owned { opacity: .75; }
.warp-person-here { border: 1px solid color-mix(in srgb, var(--warp-good) 55%, transparent); }
.warp-rel { cursor: pointer; border-radius: 4px; }
.warp-rel:hover { background: var(--warp-fill); }
.warp-forget { float: right; font-size: 11px; padding: 0 4px; }
.warp-here { font-size: 10.5px; color: var(--warp-good); border: 1px solid currentColor; border-radius: 999px; padding: 0 6px; margin-left: 4px; font-weight: 500; }

/* ───────── map & journal ───────── */
.warp-map-card { padding: 8px; }
.warp-map { width: 100%; height: auto; max-height: 420px; }
.warp-map-edge { stroke: var(--warp-border); stroke-width: 2; }
.warp-map-node circle { fill: var(--warp-fill); stroke: var(--warp-border); stroke-width: 2; }
.warp-map-node text { fill: var(--warp-muted); font-size: 11px; }
.warp-map-node .warp-map-people { fill: var(--warp-good); font-size: 10px; }
.warp-map-node .warp-map-icon { fill: var(--warp-dim); font-size: 10px; }
.warp-map-node.here circle { fill: var(--warp-accent); stroke: var(--warp-accent); }
.warp-map-node.here text { fill: var(--warp-text); font-weight: 700; }
.warp-map-node.reachable { cursor: pointer; }
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
.warp-warning-row { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; font-size: 12.5px; }
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

/* ───────── modal ───────── */
.warp-modal { display: flex; flex-direction: column; gap: 10px; padding: 4px 2px; }
.warp-template { text-align: left; font: inherit; color: inherit; cursor: pointer; }
.warp-template:hover { border-color: var(--warp-accent); }

/* ───────── dungeon ───────── */
.warp-px { image-rendering: pixelated; image-rendering: crisp-edges; }
.warp-dg-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 8px; }
.warp-dg-stats { display: flex; gap: 8px; align-items: baseline; font-variant-numeric: tabular-nums; }
.warp-dg-party { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 6px; }
.warp-dg-member { font: inherit; color: inherit; text-align: left; background: var(--warp-fill); border: 1px solid var(--warp-border); border-radius: var(--warp-radius); padding: 6px 8px; display: flex; flex-direction: column; gap: 3px; }
.warp-dg-member.active { border-color: var(--warp-accent); box-shadow: 0 0 0 1px var(--warp-accent) inset; }
.warp-dg-member.down { opacity: .45; }
.warp-dg-member.targetable, .warp-dg-foe.targetable { cursor: pointer; border-color: var(--warp-warn); }
.warp-dg-member-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
.warp-dg-member-head b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.warp-dg-face { width: 28px; height: 28px; flex: none; }
.warp-dg-bar { display: grid; grid-template-columns: 20px 1fr 30px; align-items: center; gap: 4px; font-size: 10.5px; }
.warp-dg-bar-l { color: var(--warp-dim); }
.warp-dg-bar-n { text-align: right; font-variant-numeric: tabular-nums; }
.warp-dg-bar-track { height: 5px; background: rgba(0,0,0,.35); border-radius: 3px; overflow: hidden; }
.warp-dg-bar-track > div { height: 100%; border-radius: 3px; transition: width 200ms; }
.warp-dg-bar.hp .warp-dg-bar-track > div { background: linear-gradient(90deg, #e0a043, #f2d05c); }
.warp-dg-bar.mp .warp-dg-bar-track > div { background: linear-gradient(90deg, #3d8fe0, #62d3f0); }
.warp-dg-bar.tp .warp-dg-bar-track > div { background: linear-gradient(90deg, #2ca65a, #6fe07e); }
.warp-dg-board { display: grid; gap: 3px; background: rgba(0,0,0,.35); padding: 4px; border-radius: var(--warp-radius); }
.warp-dg-tile { aspect-ratio: 1; border: 1px solid rgba(0,0,0,.4); border-radius: 3px; padding: 0; background-size: 100% 100%; image-rendering: pixelated; display: grid; place-items: center; position: relative; }
.warp-dg-tile.hidden { filter: brightness(.45) saturate(.6); }
.warp-dg-tile.reachable { cursor: pointer; outline: 2px solid var(--warp-accent); outline-offset: -2px; filter: none; }
.warp-dg-tile.reachable.hidden { filter: brightness(.7); }
.warp-dg-tile.reachable:hover { filter: brightness(1.1); }
.warp-dg-tile.here { outline: 2px solid var(--warp-warn); outline-offset: -2px; }
.warp-dg-icon { width: 80%; height: 80%; }
.warp-dg-icon.faded { opacity: .45; }
.warp-dg-icon.danger { filter: drop-shadow(0 0 3px #e05a7e); }
.warp-dg-mini { width: 18px; height: 18px; vertical-align: middle; margin-right: 3px; }
.warp-dg-actions, .warp-dg-cmds { display: flex; flex-wrap: wrap; gap: 6px; }
.warp-dg-event.romance { border-color: #e07aa6; }
.warp-dg-ware, .warp-dg-stairs, .warp-dg-entry-head { display: flex; align-items: center; gap: 8px; }
.warp-dg-ware > div, .warp-dg-stairs > div { flex: 1; }
.warp-dg-ware img, .warp-dg-stairs img, .warp-dg-entry-head img { width: 32px; height: 32px; }
.warp-dg-bag { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.warp-dg-log { font-size: 12px; color: var(--warp-muted); display: flex; flex-direction: column; gap: 2px; }
.warp-dg-log > div:first-child { color: var(--warp-text); }
.warp-dg-leave { align-self: flex-start; }
.warp-dg-prompt { display: flex; align-items: center; gap: 8px; color: var(--warp-warn); }
.warp-dg-battle { display: flex; flex-direction: column; gap: 8px; }
.warp-dg-stage { border-radius: var(--warp-radius); background-size: auto, 48px 48px; image-rendering: pixelated; padding: 10px 8px 12px; min-height: 150px; display: flex; flex-direction: column; gap: 6px; }
.warp-dg-eyebrow { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.75); }
.warp-dg-foes { display: flex; flex-wrap: wrap; justify-content: center; align-items: flex-end; gap: 10px; }
.warp-dg-foe { font: inherit; color: #fff; background: rgba(0,0,0,.25); border: 1px solid transparent; border-radius: var(--warp-radius); padding: 4px 6px; width: 104px; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.warp-dg-foe.down { opacity: .25; }
.warp-dg-foe-img { width: 72px; height: 72px; filter: drop-shadow(0 4px 3px rgba(0,0,0,.6)); }
.warp-dg-foe.elite .warp-dg-foe-img { width: 84px; height: 84px; filter: drop-shadow(0 0 6px #d9a441); }
.warp-dg-foe.boss { width: 150px; }
.warp-dg-foe.boss .warp-dg-foe-img { width: 128px; height: 128px; filter: drop-shadow(0 0 8px #e05a7e); }
.warp-dg-foe-name { font-size: 11.5px; text-align: center; text-shadow: 0 1px 2px #000; }
.warp-dg-foe .warp-dg-bar { width: 100%; color: #fff; }
.warp-dg-command { display: flex; flex-direction: column; gap: 6px; }
.warp-dg-cmd { padding: 5px 10px; }
.warp-dg-mates { display: flex; flex-direction: column; gap: 4px; }
.warp-dg-mate { display: flex; align-items: center; gap: 6px; }

/* ───────── swinging fights ───────── */
.warp-momentum { position: relative; height: 8px; border-radius: 4px; background: linear-gradient(90deg, var(--warp-good), var(--warp-fill) 45%, var(--warp-fill) 55%, var(--warp-bad)); }
.warp-momentum-mid { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: var(--warp-border); }
.warp-momentum-mark { position: absolute; top: -3px; width: 4px; height: 14px; margin-left: -2px; border-radius: 2px; background: var(--warp-text); transition: left 400ms ease; }

/* ───────── checkpoints ───────── */
.warp-run-slot { display: grid; grid-template-columns: 52px 1fr auto auto; gap: 6px; align-items: center; font-size: 12.5px; }
.warp-run-slot-name { color: var(--warp-dim); }
.warp-run-slot-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.warp-run-end { padding: 8px; border-radius: var(--warp-radius); border: 1px solid currentColor; }

/* ───────── dating ───────── */
.warp-date { display: flex; flex-direction: column; gap: 10px; }
.warp-date-person, .warp-date-head { display: flex; gap: 10px; align-items: flex-start; padding: 8px; border-radius: var(--warp-radius); background: var(--warp-fill-subtle); border: 1px solid var(--warp-border); }
.warp-date-head { background: color-mix(in srgb, hsl(var(--warp-hue, 300) 60% 55%) 6%, var(--warp-fill-subtle)); }
.warp-date-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.warp-date-avatar { flex: none; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; color: #fff; background: hsl(var(--warp-hue, 300) 45% 42%); box-shadow: inset 0 0 0 2px hsl(var(--warp-hue, 300) 55% 60% / .6); }
.warp-date-avatar.big { width: 44px; height: 44px; font-size: 18px; }
.warp-date-name { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.warp-date-stage { font-size: 11px; padding: 0 8px; border-radius: 999px; border: 1px solid var(--warp-border); color: var(--warp-muted); }
.warp-date-stage.partner { color: #e07aa6; border-color: #e07aa6; }
.warp-date-stage.hostile { color: var(--warp-bad); border-color: var(--warp-bad); }
.warp-date-here { color: var(--warp-good); font-size: 10px; }
.warp-date-meter { display: grid; grid-template-columns: 58px 1fr auto; align-items: center; gap: 6px; font-size: 11.5px; }
.warp-date-meter-l { color: var(--warp-dim); }
.warp-date-meter-t { color: var(--warp-muted); white-space: nowrap; }
.warp-date-meter-track { height: 5px; border-radius: 4px; background: var(--warp-fill); overflow: hidden; }
.warp-date-meter-track > div { height: 100%; border-radius: 4px; transition: width 400ms ease; background: var(--warp-info); }
.warp-date-meter.love .warp-date-meter-track > div { background: #e07aa6; }
.warp-date-meter.fear .warp-date-meter-track > div { background: var(--warp-bad); }
.warp-date-meter.enjoy .warp-date-meter-track > div { background: var(--warp-warn); }
.warp-date-meter.fatigue.good .warp-date-meter-track > div { background: var(--warp-good); }
.warp-date-meter.fatigue.warn .warp-date-meter-track > div { background: var(--warp-warn); }
.warp-date-meter.fatigue.bad .warp-date-meter-track > div { background: var(--warp-bad); }
.warp-date-knows { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 12px; }
.warp-date-mood { display: flex; flex-direction: column; align-items: center; font-size: 11px; color: var(--warp-muted); min-width: 56px; }
.warp-date-face { font-size: 26px; line-height: 1.1; }
.warp-date-stats { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; }
.warp-date-combo { font-size: 12px; font-weight: 600; color: var(--warp-muted); white-space: nowrap; }
.warp-date-combo.hot { color: var(--warp-warn); }
.warp-date-outing { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; padding: 6px 8px; border-radius: var(--warp-radius); border: 1px dashed var(--warp-border); }
.warp-date-outing .warp-date-meter { flex-basis: 100%; }
.warp-date-last { font-size: 12.5px; padding: 4px 8px; border-radius: var(--warp-radius); background: var(--warp-fill); }
.warp-date-move.venue, .warp-date-move.activity { border-color: color-mix(in srgb, var(--warp-warn) 50%, var(--warp-border)); }
.warp-date-topics { display: flex; flex-direction: column; gap: 6px; }
.warp-date-cats { display: flex; flex-wrap: wrap; gap: 4px; }
.warp-date-cat { font: inherit; font-size: 12px; background: transparent; color: var(--warp-muted); border: 1px solid var(--warp-border); border-radius: 999px; padding: 2px 10px; cursor: pointer; }
.warp-date-cat[aria-selected=true] { color: var(--warp-text); border-color: var(--warp-accent); background: var(--warp-fill); }
.warp-date-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
.warp-date-topic { font: inherit; text-align: left; display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: var(--warp-radius); border: 1px solid var(--warp-border); background: var(--warp-fill-subtle); color: var(--warp-text); cursor: pointer; min-height: 32px; }
.warp-date-topic:hover:not(:disabled) { border-color: var(--warp-accent); background: var(--warp-fill); }
.warp-date-topic:disabled { cursor: not-allowed; }
.warp-date-topic.locked { opacity: .5; }
.warp-date-topic-l { flex: 1; min-width: 0; }
.warp-date-react { font-size: 11px; font-weight: 700; min-width: 18px; }
.warp-date-used { font-size: 10.5px; color: var(--warp-dim); }
.warp-date-lock { font-size: 11px; }
`;

// src/frontend/overlay-layout.ts
var PAD = 12;
var SNAP = 28;
var PILL = { w: 150, h: 38 };
var PANEL_W = 290;
var SIDE_W = 300;
var STRIP_H = 190;
function edgeForDrop(start, box, vp) {
  const dx = box.x - start.x;
  const dy = box.y - start.y;
  const near = {
    left: box.x - PAD <= SNAP && dx < -2,
    right: vp.width - (box.x + box.w) - PAD <= SNAP && dx > 2,
    top: box.y - PAD <= SNAP && dy < -2,
    bottom: vp.height - (box.y + box.h) - PAD <= SNAP && dy > 2
  };
  const horizontal = near.left ? "left" : near.right ? "right" : null;
  const vertical = near.top ? "top" : near.bottom ? "bottom" : null;
  if (horizontal && vertical)
    return Math.abs(dx) >= Math.abs(dy) ? horizontal : vertical;
  return horizontal ?? vertical;
}
function attachedBox(edge, open, vp) {
  if (!open) {
    switch (edge) {
      case "left":
        return { x: PAD, y: PAD, ...wh(PILL) };
      case "right":
        return { x: vp.width - PILL.w - PAD, y: PAD, ...wh(PILL) };
      case "top":
        return { x: Math.round((vp.width - PILL.w) / 2), y: PAD, ...wh(PILL) };
      case "bottom":
        return { x: Math.round((vp.width - PILL.w) / 2), y: vp.height - PILL.h - PAD, ...wh(PILL) };
    }
  }
  switch (edge) {
    case "left":
      return { x: PAD, y: PAD, w: SIDE_W, h: vp.height - PAD * 2 };
    case "right":
      return { x: vp.width - SIDE_W - PAD, y: PAD, w: SIDE_W, h: vp.height - PAD * 2 };
    case "top":
      return { x: PAD, y: PAD, w: vp.width - PAD * 2, h: STRIP_H };
    case "bottom":
      return { x: PAD, y: vp.height - STRIP_H - PAD, w: vp.width - PAD * 2, h: STRIP_H };
  }
}
function wh(s) {
  return { w: s.w, h: s.h };
}

// src/frontend/render.ts
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
var PHASE_ICON = { morning: "\uD83C\uDF05", afternoon: "☀️", evening: "\uD83C\uDF07", night: "\uD83C\uDF19" };
function pctTone(p) {
  return p >= 0.66 ? "good" : p >= 0.33 ? "warn" : "bad";
}
function renderHud(h, opts) {
  const top = [
    `<div class="warp-eyebrow"><span>${esc(h.rulesetName)}</span><span title="Turn">T${h.turn}</span></div>`,
    h.clock ? `<div class="warp-clock"><span class="warp-phase" aria-hidden="true">${PHASE_ICON[h.clock.phase] ?? ""}</span><span class="warp-clock-time">${esc(h.clock.time)}</span><span class="warp-clock-day">${esc(h.date ?? h.clock.day)}</span></div>` : "",
    h.weather ? `<div class="warp-weather">${esc(h.weather.icon)} ${esc(h.weather.label)} · <b>${esc(h.weather.temp)}°C</b>${h.weather.season ? ` · ${esc(h.weather.season)}` : ""}</div>` : "",
    h.location || h.money ? `<div class="warp-where">${h.location ? `<span title="${esc(h.location.desc ?? "")}">\uD83D\uDCCD <b>${esc(h.location.name)}</b></span>` : ""}${h.money ? `<span class="warp-money">${esc(h.money)}</span>` : ""}</div>` : "",
    h.conditions.length ? `<div class="warp-pills">${h.conditions.map((c) => `<span class="warp-pill warp-tone-${c.tone}" title="${esc(c.desc ?? "")}">${esc(c.label)}${c.remaining ? ` · ${esc(c.remaining)}` : ""}</span>`).join("")}</div>` : ""
  ].join("");
  const bars = h.bars.map((b) => {
    const editing = opts.editing === b.id;
    return `<div class="warp-bar" data-bar="${esc(b.id)}" title="${esc(`${b.label}: ${b.display}${b.desc ? ` — ${b.desc}` : ""}
Click to adjust`)}">
      <div class="warp-bar-head"><span class="warp-bar-label">${esc(b.label)}</span><span class="warp-bar-text warp-tone-${b.tone}">${esc(b.text ?? b.display)}</span></div>
      <div class="warp-bar-track"><div class="warp-bar-fill warp-bg-${b.tone}" style="width:${(b.pct * 100).toFixed(1)}%${b.color ? `;background:${esc(b.color)}` : ""}"></div></div>
      ${editing ? (() => {
      const step = b.max - b.min > 200 ? 1 : b.max - b.min > 20 ? 0.5 : 0.1;
      const v = Math.round(b.value * 10) / 10;
      return `<div class="warp-bar-edit">
          <input type="range" min="${b.min}" max="${b.max}" step="${step}" value="${v}" data-range="${esc(b.id)}" aria-label="${esc(b.label)}">
          <input class="warp-input" type="number" min="${b.min}" max="${b.max}" step="${step}" value="${v}" data-num="${esc(b.id)}" aria-label="${esc(b.label)} value">
          <span class="warp-dim warp-of">/ ${esc(b.max)}</span>
          <button class="warp-btn warp-btn-primary" data-save="${esc(b.id)}">Set</button>
        </div>`;
    })() : ""}
    </div>`;
  }).join("");
  const skills = h.skills.length ? section("Skills & attributes", h.skills.length, h.skills.map((s) => `
    <div class="warp-skill" title="${esc(`${s.label}: ${s.display}${s.text ? ` — ${s.text}` : ""}${s.practice !== null ? `
Practice toward the next point: ${Math.round(s.practice * 100)}% — it grows every time you use it` : ""}`)}">
      <span>${esc(s.label)}</span>
      <span class="warp-grade ${s.grade ? `warp-tone-${pctTone(s.pct)}` : ""}">${esc(s.grade ?? s.display)}</span>
      <div class="warp-skill-tracks">
        <div class="warp-mini-track"><div class="warp-mini-fill" style="width:${(s.pct * 100).toFixed(1)}%"></div></div>
        ${s.practice !== null ? `<div class="warp-practice-track"><div class="warp-practice-fill" style="width:${(s.practice * 100).toFixed(1)}%"></div></div>` : ""}
      </div>
    </div>`).join(""), !opts.compact) : "";
  const here = h.people.filter((p) => p.present);
  const away = h.people.filter((p) => !p.present);
  const personRow = (p) => `
    <div class="warp-person${p.present ? " warp-person-here" : ""}">
      <div class="warp-person-name">${esc(p.name)}${p.present ? ` <span class="warp-here">here</span>` : p.whereabouts ? ` <span class="warp-dim">· ${esc(p.whereabouts)}</span>` : ""}${opts.compact ? "" : ` <button class="warp-btn warp-btn-ghost warp-forget" data-forget="${esc(p.id)}" data-name="${esc(p.name)}" title="Stop tracking ${esc(p.name)}">Forget</button>`}</div>
      ${p.goal || p.bonds.length ? `<div class="warp-person-stats">${p.goal ? `<span>Wants: ${esc(p.goal)}</span>` : ""}${p.bonds.length ? `<span>${esc(p.bonds.join(", "))}</span>` : ""}</div>` : ""}
      <div class="warp-person-stats">${p.stats.map((s) => `<span class="warp-rel" data-rel="${esc(`${p.id}:${s.id}`)}" title="${esc(`${s.label}: ${s.display} (${s.min}–${s.max}) — click to set`)}">${esc(s.label)}: <span class="warp-tone-${s.tone}">${esc(s.text ?? s.display)}</span></span>`).join("")}</div>
      ${p.stats.filter((s) => opts.editing === `rel:${p.id}:${s.id}`).map((s) => `<div class="warp-bar-edit">
        <span class="warp-dim">${esc(s.label)}</span>
        <input type="range" min="${s.min}" max="${s.max}" step="1" value="${Math.round(s.value)}" data-range="rel" aria-label="${esc(s.label)}">
        <input class="warp-input" type="number" min="${s.min}" max="${s.max}" value="${Math.round(s.value)}" data-num="rel" aria-label="${esc(s.label)} value">
        <button class="warp-btn warp-btn-primary" data-save-rel="${esc(`${p.id}:${s.id}`)}">Set</button>
      </div>`).join("")}
    </div>`;
  const people = section(here.length ? "People here" : "People", here.length, h.people.length ? `${here.length ? here.map(personRow).join("") : `<div class="warp-empty">No one you know is here.</div>`}${away.length ? `<details class="warp-away" data-section="people-away"><summary>Elsewhere · ${away.length}</summary><div class="warp-section-body">${away.map(personRow).join("")}</div></details>` : ""}` : `<div class="warp-empty">No one yet.</div>`, !opts.compact || here.length > 0, "people");
  const body = h.body ? section("Body", 0, `${h.body.map((b) => `<div class="warp-item"><span>${esc(b.label)}</span><span class="${b.covered ? "warp-dim" : ""}" title="${b.covered ? "Covered by clothing" : "Visible"}">${esc(b.text)}${b.covered ? " \uD83D\uDC55" : ""}</span></div>`).join("")}${h.transforms.map((t) => `<div class="warp-item"><span>✦ ${esc(t.label)}</span><span class="warp-dim">stage ${t.stage} / ${t.of}</span></div>`).join("")}`, false) : "";
  const dues = h.dues.length ? section("Bills", h.dues.filter((d) => d.tone === "bad").length, h.dues.map((d) => `<div class="warp-item"><span>${esc(d.label)}${d.owed > 0 ? ` <span class="warp-dim">${esc(h.money?.replace(/[\d.,]+/, "") ?? "")}${esc(d.owed)}</span>` : ""}</span><span class="warp-tone-${d.tone}">${esc(d.text)}</span></div>`).join(""), !opts.compact || h.dues.some((d) => d.tone === "bad")) : "";
  const family = h.family.length ? section("Family", h.family.length, h.family.map((f) => `<div class="warp-item"><span>${esc(f.name)}</span><span class="warp-dim">${esc(f.text)}</span></div>`).join(""), !opts.compact) : "";
  const loose = h.items.filter((i) => !i.worn);
  const items = section("Inventory", loose.length, loose.length ? loose.map((i) => `<div class="warp-item"><span>${esc(i.name)}${i.uses ? ` <span class="warp-dim" title="Uses left in the one in hand">· ${esc(i.uses)}</span>` : ""}</span>${i.count > 1 ? `<span class="warp-kbd">×${i.count}</span>` : ""}</div>`).join("") : `<div class="warp-empty">Empty-handed.</div>`, !opts.compact);
  return `${renderEncounter(h)}<div class="warp-hud-top">${top}</div>${renderWarmth(h)}<div class="warp-bars">${bars}</div>${renderOutfit(h, opts.compact)}${skills}${dues}${people}${family}${body}${items}${renderPerks(h, opts.compact)}`;
}
function renderEncounter(h) {
  const e = h.encounter;
  if (!e)
    return "";
  return `<div class="warp-encounter">
    <div class="warp-eyebrow"><span>⚔ ${esc(e.name)}</span><span>Round ${e.round + 1}</span></div>
    <div class="warp-encounter-foe">${esc(e.foe)}</div>
    ${e.momentum !== null ? `<div class="warp-bar-head"><span>You</span><span class="warp-dim">Momentum</span><span>${esc(e.foe)}</span></div>
      <div class="warp-momentum" title="Momentum ${Math.round(e.momentum)} — a full swing either way ends the fight"><div class="warp-momentum-mid"></div><div class="warp-momentum-mark" style="left:${((100 - e.momentum) / 2).toFixed(1)}%"></div></div>` : ""}
    ${e.stats.map((s) => `<div class="warp-bar-head"><span>${esc(s.label)}</span><span class="warp-dim">${esc(Math.round(s.value))} / ${esc(s.max)}</span></div>
      <div class="warp-bar-track"><div class="warp-bar-fill warp-bg-${s.tone}" style="width:${(s.pct * 100).toFixed(1)}%"></div></div>`).join("")}
  </div>`;
}
function renderWarmth(h) {
  const w = h.warmth;
  if (!w)
    return "";
  const scale = Math.max(30, w.max + 6, w.value + 4);
  const at = (v) => `${Math.max(0, Math.min(100, v / scale * 100)).toFixed(1)}%`;
  return `<div class="warp-warmth" title="${esc(`Clothing warmth ${w.value} · comfortable between ${w.min} and ${w.max}`)}">
    <div class="warp-bar-head"><span class="warp-bar-label">Warmth</span><span class="warp-bar-text warp-tone-${w.tone}">${esc(w.text)}</span></div>
    <div class="warp-warmth-track">
      <div class="warp-warmth-band" style="left:${at(w.min)};width:calc(${at(w.max)} - ${at(w.min)})"></div>
      <div class="warp-warmth-mark warp-bg-${w.tone}" style="left:${at(w.value)}"></div>
    </div>
  </div>`;
}
function renderOutfit(h, compact) {
  if (!h.outfit)
    return "";
  const rows = h.outfit.map((o) => {
    const options = h.clothing.filter((c) => c.slot === o.slot && c.id !== o.item?.id);
    const status = o.item ? `${esc(o.item.name)}${o.item.integrity !== null ? ` <span class="warp-tone-${o.item.integrity < 40 ? "bad" : "warn"}">${o.item.integrity}%</span>` : ""}` : `<span class="warp-dim">${h.exposed.includes(o.slot) ? "<span class='warp-tone-bad'>nothing</span>" : "—"}</span>`;
    const picker = options.length || o.item ? `<select class="warp-select warp-mini-select" data-wear-slot="${esc(o.slot)}" aria-label="Change ${esc(o.label)}">
          <option value="" selected disabled>Change…</option>
          ${options.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (warmth ${esc(c.warmth)}${c.traits.length ? `, ${esc(c.traits.join(", "))}` : ""})</option>`).join("")}
          ${o.item ? `<option value="__off">Take off</option>` : ""}
        </select>` : "";
    return `<div class="warp-outfit-row"><span class="warp-dim">${esc(o.label)}</span><span>${status}</span>${picker}</div>`;
  }).join("");
  const worn = h.outfit.filter((o) => o.item).length;
  return section("Outfit", worn, rows, !compact);
}
function renderPerks(h, compact) {
  if (!h.perks.length)
    return "";
  const rows = h.perks.map((p) => `<div class="warp-perk${p.owned ? " warp-perk-owned" : ""}">
      <div><b>${esc(p.name)}</b> <span class="warp-dim">${esc(p.desc)}</span></div>
      ${p.owned ? `<span class="warp-tone-good">✓</span>` : p.blocker ? `<span class="warp-dim" title="${esc(p.blocker)}">${esc(p.cost)} pt</span>` : `<button class="warp-btn warp-mini" data-buy-perk="${esc(p.id)}">Take · ${esc(p.cost)} pt</button>`}
    </div>`).join("");
  const label = h.perkPoints !== null ? `Perks · ${h.perkPoints} point${h.perkPoints === 1 ? "" : "s"}` : "Perks";
  return section(label, 0, rows, !compact && (h.perkPoints ?? 0) > 0);
}
function renderMap(m) {
  if (!m)
    return `<div class="warp-card"><p>This ruleset doesn't define places yet.</p></div>`;
  const xs = m.nodes.map((n) => n.x), ys = m.nodes.map((n) => n.y);
  const pad = 70;
  const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - minX + pad, hgt = Math.max(...ys) - minY + pad;
  const byId = new Map(m.nodes.map((n) => [n.id, n]));
  const edges = m.edges.map(([a, b]) => {
    const p = byId.get(a), q = byId.get(b);
    return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" class="warp-map-edge" />`;
  }).join("");
  const nodes = m.nodes.map((n) => `
    <g class="warp-map-node${n.here ? " here" : ""}${n.reachable ? " reachable" : ""}" ${n.reachable ? `data-go="${esc(n.id)}" tabindex="0" role="button" aria-label="Go to ${esc(n.name)}"` : ""}>
      <circle cx="${n.x}" cy="${n.y}" r="${n.here ? 13 : 10}" />
      <text x="${n.x}" y="${n.y + 26}" text-anchor="middle">${esc(n.name)}</text>
      ${n.people.length ? `<text x="${n.x}" y="${n.y + 40}" text-anchor="middle" class="warp-map-people">${esc(n.people.join(", "))}</text>` : ""}
      ${n.indoors ? `<text x="${n.x}" y="${n.y + 4}" text-anchor="middle" class="warp-map-icon">⌂</text>` : ""}
    </g>`).join("");
  return `<div class="warp-card warp-map-card">
    <svg class="warp-map" viewBox="${minX} ${minY} ${w} ${hgt}" role="img" aria-label="Map">${edges}${nodes}</svg>
    <p class="warp-dim">Click a highlighted place next to you to travel there. People show where their schedules put them right now.</p>
  </div>`;
}
function renderJournal(h, records) {
  if (!h)
    return `<div class="warp-card"><p>No game running in this chat.</p></div>`;
  const byCat = new Map;
  for (const c of h.codex)
    byCat.set(c.category ?? "Notes", [...byCat.get(c.category ?? "Notes") ?? [], c]);
  const codex = h.codexTotal ? `<div class="warp-card"><h3>Codex <span class="warp-dim">${h.codex.length} / ${h.codexTotal}</span></h3>
        ${h.codex.length ? [...byCat].map(([cat, list]) => `<div class="warp-choice-group-label">${esc(cat)}</div>${list.map((c) => `<details class="warp-codex"><summary>${esc(c.title)}</summary><p>${esc(c.text)}</p></details>`).join("")}`).join("") : `<p>Nothing discovered yet.</p>`}
      </div>` : "";
  const feats = h.feats.length ? `<div class="warp-card"><h3>Feats <span class="warp-dim">${h.feats.filter((f) => f.unlocked).length} / ${h.feats.length}</span></h3>
        ${h.feats.map((f) => `<div class="warp-feat${f.unlocked ? " unlocked" : ""}"><span>${f.unlocked ? "\uD83C\uDFC6" : "\uD83D\uDD12"}</span><div><b>${esc(f.name)}</b><div class="warp-dim">${esc(f.desc)}</div></div></div>`).join("")}
      </div>` : "";
  const news = h.news.length ? `<div class="warp-card"><h3>News</h3>
        ${h.news.map((n) => `<div class="warp-news-row">${n.when ? `<span class="warp-dim">${esc(n.when)}</span>` : ""}<span>${esc(n.text)}</span></div>`).join("")}
      </div>` : "";
  const turns = records.filter((r) => r.action || r.check || r.changes.length).slice().reverse().slice(0, 40);
  const timeline = `<div class="warp-card"><h3>Timeline</h3>
    ${turns.length ? turns.map((r) => `<button class="warp-timeline-row" data-jump="${esc(r.messageId)}" title="Jump to this message">
        <span class="warp-dim">${esc(r.clock ?? "")}</span>
        <span>${r.action ? esc(r.action) : "<span class='warp-dim'>Story</span>"}${r.check ? ` · <span class="warp-tone-${r.check.tier.includes("success") ? "good" : r.check.tier === "partial" ? "warn" : "bad"}">${esc(r.check.tierLabel)}</span>` : ""}</span>
        <span class="warp-dim warp-timeline-changes">${esc(r.changes.slice(0, 4).map((c) => c.text).join(" · "))}</span>
      </button>`).join("") : `<p>Nothing has happened yet.</p>`}
  </div>`;
  return checkpoints(h) + news + codex + feats + timeline;
}
function checkpoints(h) {
  const run = h.run;
  if (!run)
    return "";
  const ended = run.ended ? `<div class="warp-run-end warp-tone-${run.ended.kind === "good" ? "good" : run.ended.kind === "bad" ? "bad" : "neutral"}"><b>The end: ${esc(run.ended.title)}</b>${run.ended.text ? `<div class="warp-dim">${esc(run.ended.text)}</div>` : ""}</div>` : "";
  const row = (id, name, label, canSave) => `<div class="warp-run-slot">
      <span class="warp-run-slot-name">${esc(name)}</span>
      <span class="warp-run-slot-label${label ? "" : " warp-dim"}">${esc(label ?? "Empty")}</span>
      ${label ? `<button class="warp-btn warp-mini" data-run="run:load:${esc(id)}">Load</button>` : ""}
      ${canSave ? `<button class="warp-btn warp-mini" data-run="run:save:${esc(id)}">${label ? "Overwrite" : "Save"}</button>` : ""}
    </div>`;
  return `<div class="warp-card"><h3>Checkpoints <span class="warp-dim">${run.runs > 1 ? `playthrough ${run.runs}` : ""}${run.loops ? ` · rewound ${run.loops}×` : ""}</span></h3>
    ${ended}
    ${run.slots.map((sl) => row(sl.id, `Slot ${sl.id}`, sl.label, !run.ended)).join("")}
    ${run.auto ? row("auto", "Auto", run.auto, false) : ""}
    <div class="warp-row">
      <button class="warp-btn warp-mini" data-run="run:load:start">Rewind to the start</button>
      <button class="warp-btn warp-mini" data-run="run:restart">Start a new playthrough</button>
      ${run.ended && !run.hard ? `<button class="warp-btn warp-mini" data-run="run:continue">Keep playing</button>` : ""}
    </div>
    <p class="warp-dim">Loading keeps: ${esc(run.keeps)}. A new playthrough carries over: ${esc(run.legacy)}.</p>
  </div>`;
}
function section(title, count, body, open, key = title) {
  return `<details class="warp-section" data-section="${esc(key)}"${open ? " open" : ""}><summary><span>${esc(title)}${count ? ` · ${count}` : ""}</span></summary><div class="warp-section-body">${body}</div></details>`;
}
function renderChoices(choices, opts) {
  if (!choices.length && !opts.busy)
    return "";
  const groups = new Map;
  choices.forEach((c, i) => {
    const g = c.group ?? "Actions";
    if (!groups.has(g))
      groups.set(g, []);
    groups.get(g).push({ c, n: i + 1 });
  });
  const body = [...groups].map(([g, list]) => `
    <div class="warp-choice-group">
      ${groups.size > 1 ? `<div class="warp-choice-group-label">${esc(g)}</div>` : ""}
      <div class="warp-choice-grid">${list.map(({ c, n }) => {
    const key = opts.hotkeys && n <= 10 ? `<span class="warp-kbd">${n === 10 ? 0 : n}</span>` : "";
    const odds = opts.showOdds && c.odds !== null ? `<span class="warp-choice-odds warp-tone-${pctTone(c.odds + (c.partialOdds ?? 0) / 2)}" title="${esc(`${c.checkLabel ?? "Check"}: ${Math.round(c.odds * 100)}% success${c.partialOdds ? `, ${Math.round(c.partialOdds * 100)}% partial` : ""}`)}">${Math.round(c.odds * 100)}%</span>` : "";
    const tip = [c.desc, c.checkLabel ? `Check: ${c.checkLabel}` : null, c.veiled ? "Veiled: happens off-screen" : null].filter(Boolean).join(`
`);
    return `<button class="warp-choice" data-act="${esc(c.id)}" title="${esc(tip)}${c.ready ? `
Ready — this reply is already written` : ""}">${key}<span class="warp-choice-label">${esc(c.label)}</span>${c.ready ? `<span class="warp-choice-ready" aria-label="instant">⚡</span>` : ""}${c.veiled ? `<span class="warp-choice-veil" aria-label="veiled">◐</span>` : ""}${odds}</button>`;
  }).join("")}</div>
    </div>`).join("");
  const status = opts.busy ? `<div class="warp-status-line"><span class="warp-spinner"></span>${esc(opts.busyLabel ?? "The story continues…")}</div>` : "";
  return `${status}${body}`;
}
var TIER_TONE = { crit_success: "good", success: "good", partial: "warn", fail: "bad", crit_fail: "bad" };
function renderChips(rec, opts) {
  const out = [];
  const read = rec.via === "adjudicator" ? `<span class="warp-dim">· read from your message${rec.confidence !== null ? ` (${Math.round(rec.confidence * 100)}% sure)` : ""}</span>` : rec.via === "confirmed" ? `<span class="warp-dim">· you confirmed</span>` : "";
  const notAction = rec.redoFrom ? `<button class="warp-btn warp-btn-ghost" data-redo="${esc(rec.redoFrom)}" data-redo-action="" title="Redo this turn without a roll">Not an action?</button>` : "";
  if (rec.check && opts.showDice) {
    const c = rec.check;
    out.push(`<button class="warp-chip warp-dice warp-tone-${TIER_TONE[c.tier]}" data-dice title="Show the roll">\uD83C\uDFB2 ${esc(c.label)} · ${esc(c.tierLabel)}</button>`);
    out.push(`<div class="warp-dice-detail">${c.faces.map((f) => `<span class="warp-die" title="d${f.sides}"${f.kept ? "" : " data-dropped"}>${f.value}</span>`).join("")}<span>${esc(c.summary)}</span>${read}${notAction}</div>`);
  } else if (rec.action && opts.showDice) {
    out.push(`<span class="warp-chip">▸ ${esc(rec.action)}</span>${notAction ? `<span class="warp-chip">${notAction}</span>` : ""}`);
  }
  for (const d of rec.decisions) {
    const odds = d.odds.map((o) => `${o.desc} ${Math.round(o.p * 100)}%`).join(" · ");
    out.push(`<span class="warp-chip warp-decision" title="${esc(`${d.ask}
${odds}
${d.source === "model" ? "Odds from the decision model; the engine rolled." : "Odds from the ruleset's weights; the engine rolled."}`)}">\uD83C\uDFAD ${esc(d.picked)} <span class="warp-dim">${Math.round(d.p * 100)}%</span></span>`);
  }
  if (rec.mind) {
    const m = rec.mind;
    const what = m.kind === "fail" ? "couldn't go through with it" : m.kind === "redirect" ? "did something else" : "it took over";
    out.push(`<span class="warp-chip warp-tone-warn" title="${esc(`You chose: ${m.meant}
${m.cause}: ${what} (${Math.round(m.chance)}% chance at the time)`)}">\uD83E\uDDE0 ${esc(m.cause)} — ${esc(what)}</span>`);
  }
  if ((rec.contradiction ?? 0) >= 0.6) {
    out.push(`<span class="warp-chip warp-tone-warn" title="The decision model thinks this reply may contradict the game state (${Math.round(rec.contradiction * 100)}%). Consider swiping.">⚠ may contradict the state</span>`);
  }
  const whys = [];
  for (const ch of rec.changes) {
    const narr = ch.src === "narrator" || ch.src === "manual";
    if (ch.why?.length)
      whys.push(`<div><b>${esc(ch.text)}</b> <span class="warp-dim">←</span> ${ch.why.map(esc).join(" · ")}</div>`);
    const undo = narr && ch.undo?.length ? `<button class="warp-chip-undo" data-undo="${esc(ch.undo.join(","))}" title="Undo this change" aria-label="Undo">×</button>` : "";
    out.push(`<span class="warp-chip warp-tone-${ch.tone}${narr ? " warp-chip-narr" : ""}" title="${esc(narr ? ch.src === "manual" ? "You set this" : "Read from the story — click × to undo" : "Applied by the rules")}">${esc(ch.text)}${ch.band ? ` <span class="warp-band">${esc(ch.band)}</span>` : ""}${undo}</span>`);
  }
  if (rec.veiled)
    out.push(`<span class="warp-chip warp-tone-warn" title="Narrated off-screen by your Veils setting">◐ veiled</span>`);
  if (whys.length) {
    out.push(`<button class="warp-chip warp-why-btn" data-why title="Show what caused each change">Why?</button>`);
    out.push(`<div class="warp-why-detail">${whys.join("")}</div>`);
  }
  return out.join("");
}
function renderSuggestion(s) {
  return `<span class="warp-chip warp-suggest">\uD83C\uDFB2 Roll <b>${esc(s.label)}</b>? <span class="warp-dim">${Math.round(s.confidence * 100)}% sure</span>
    <button class="warp-btn warp-btn-primary warp-mini" data-redo="${esc(s.messageId)}" data-redo-action="${esc(s.actionId)}" data-redo-params="${esc(JSON.stringify(s.params ?? {}))}">Roll it</button>
    <button class="warp-chip-undo" data-dismiss-suggest="${esc(s.messageId)}" title="Dismiss" aria-label="Dismiss">×</button></span>`;
}
function renderRulesetCard(s, hasChat) {
  if (!hasChat) {
    return `<div class="warp-card"><h3>Open a chat</h3><p>Warp runs inside a chat whose character has a <b>warp-ruleset</b> lorebook.</p></div>`;
  }
  if (s.state === "none") {
    return `<div class="warp-card">
      <h3>${esc(s.characterName ?? "This character")} has no game rules yet</h3>
      <p>Add a ruleset to get stats, dice checks, time, inventory and relationships that the model can't fudge. It's stored in a <b>warp-ruleset</b> lorebook on the character, so it travels with the card.</p>
      <div class="warp-row"><button class="warp-btn warp-btn-primary" data-install>Add a ruleset…</button></div>
    </div>`;
  }
  const errors = s.issues.filter((i) => i.level === "error");
  const warns = s.issues.filter((i) => i.level === "warning");
  const head = s.state === "ok" ? `<h3>✓ ${esc(s.name)}</h3><p>From ${esc(s.source)}${warns.length ? ` · ${warns.length} note${warns.length > 1 ? "s" : ""}` : ""}</p>` : `<h3 class="warp-tone-bad">Ruleset can't run</h3><p>Fix the problems below in the <b>warp-ruleset</b> lorebook, then reload.</p>`;
  const list = [...errors, ...warns].slice(0, 30).map((i) => `
    <div class="warp-issue"><span class="warp-tone-${i.level === "error" ? "bad" : "warn"}">${i.level === "error" ? "✕" : "!"}</span><span>${esc(i.message)}</span><span class="warp-issue-where">${esc(i.where)}</span></div>`).join("");
  return `<div class="warp-card">${head}${list ? `<div class="warp-issues">${list}</div>` : ""}
    <div class="warp-row"><button class="warp-btn" data-reload>Reload</button><button class="warp-btn warp-btn-ghost" data-install>Replace with a template…</button></div>
  </div>`;
}
function renderTemplatePicker(templates, card = null) {
  const track = card ? `<label class="warp-toggle"><span>Track <b>${esc(card.name)}</b> as a character</span><small>${card.track ? "Their relationship with you is tracked from the start." : "This looks like a scenario or narrator card, so its name isn't added as a person. Tick if it really is one character."}</small><input type="checkbox" data-track${card.track ? " checked" : ""}></label>` : "";
  return `<div class="warp-modal">
    <p style="margin:0;color:var(--warp-muted)">Pick a starting point. Warp creates a <b>warp-ruleset</b> lorebook on this character, split into readable entries (stats, people, world, actions, rules) that you can edit like any lorebook. It's never sent to the model.</p>
    ${track}
    <button class="warp-card warp-template warp-builder-cta" data-template="__ai"><h3>✨ Build with AI</h3><p>Reads this character's card, asks you a few questions, and drafts a ruleset made for it — previewed and balance-checked before anything is saved.</p></button>
    ${templates.map((t) => `<button class="warp-card warp-template" data-template="${esc(t.id)}"><h3>${esc(t.name)}</h3><p>${esc(t.blurb)}</p></button>`).join("")}
  </div>`;
}
function toggle(key, label, hint, on) {
  return `<label class="warp-toggle"><span>${esc(label)}</span><small>${esc(hint)}</small><input type="checkbox" data-setting="${esc(key)}"${on ? " checked" : ""}></label>`;
}
function renderDecider(s, jevKeySet) {
  const opt = (v, label) => `<option value="${v}"${s.decider === v ? " selected" : ""}>${label}</option>`;
  const pct = (v) => Math.round(v * 100);
  return `<div class="warp-card">
    <h3>Decision model</h3>
    <p>Answers Warp's quick typed questions: what your message attempts, NPC odds, plain-language triggers, bookkeeping. It never picks outcomes — it gives odds, and the dice roll on them.</p>
    <select class="warp-select" data-setting="decider">
      ${opt("llm", "Helper LLM (uses the helper model below)")}
      ${opt("jev", "Jev — TypeSafe System-1 model (fast, cheap)")}
      ${opt("rules", "Rules only — no model calls (suggests, never acts)")}
    </select>
    ${s.decider === "jev" ? `
      <div class="warp-row">
        <input class="warp-input" type="password" data-jevkey placeholder="${jevKeySet ? "Key saved — paste to replace" : "TypeSafe API key (sk-…)"}" autocomplete="off" style="flex:1">
        <button class="warp-btn" data-save-jev>${jevKeySet ? "Replace" : "Save"}</button>
        ${jevKeySet ? `<button class="warp-btn warp-btn-ghost" data-clear-jev>Remove</button>` : ""}
      </div>
      <p>${jevKeySet ? "✓ Key stored encrypted on the server." : "No key yet — until you add one, the helper LLM is used."} Your roleplay text is sent to TypeSafe for these questions.</p>
      <input class="warp-input" data-setting="jevModel" value="${esc(s.jevModel)}" title="Model (jev-latest, or a pinned version)">` : ""}
    <label class="warp-slider"><span>Roll automatically when at least <b>${pct(s.autoConfidence)}%</b> sure</span>
      <input type="range" min="40" max="99" value="${pct(s.autoConfidence)}" data-setting-pct="autoConfidence"></label>
    <label class="warp-slider"><span>Offer a one-tap “Roll it?” from <b>${pct(s.askConfidence)}%</b></span>
      <input type="range" min="10" max="95" value="${pct(s.askConfidence)}" data-setting-pct="askConfidence"></label>
    ${toggle("consistencyCheck", "Check replies against the state", "Flags replies that contradict the game (wrong place, items, injuries, dice result). One extra quick question per reply — cheap with Jev.", s.consistencyCheck)}
    <label class="warp-slider">Drafts per reply
      <select class="warp-select" data-setting="drafts">${[1, 2, 3, 4].map((n) => `<option value="${n}"${s.drafts === n ? " selected" : ""}>${n === 1 ? "1 (off)" : `${n} — keep the best`}</option>`).join("")}</select>
      <small class="warp-dim">Extra drafts are written with your chat's connection after each reply; the decision model keeps the one that narrates the outcome best (the others stay as swipes). Costs a generation per extra draft — best with a fast, cheap model.</small>
    </label>
    <label class="warp-slider">Pre-write replies
      <select class="warp-select" data-setting="prewrite">${[0, 1, 2, 3, 4].map((n) => `<option value="${n}"${s.prewrite === n ? " selected" : ""}>${n === 0 ? "Off" : `First ${n} choice${n === 1 ? "" : "s"}`}</option>`).join("")}</select>
      <small class="warp-dim">While you read, the first choices are rolled and written ahead, so clicking one (⚡) is instant. Costs a generation per choice each turn.</small>
    </label>
    <div class="warp-row"><button class="warp-btn" data-test-decider>Test</button></div>
  </div>`;
}
function renderSettings(s, status, connections, jevKeySet = false) {
  const tags = new Set([...status?.tags ?? [], ...s.lines, ...s.veils]);
  const tagChips = [...tags].sort().map((t) => {
    const mode = s.lines.includes(t) ? "line" : s.veils.includes(t) ? "veil" : "on";
    return `<button class="warp-tag" data-tag="${esc(t)}" data-mode="${mode}" title="Click to cycle: on → veil (off-screen) → line (removed)">${esc(t)}</button>`;
  }).join("");
  return `<div class="warp-card">
    <h3>Play</h3>
    ${toggle("enabled", "Warp is on", "Turn the engine off without removing any rules.", s.enabled)}
    ${toggle("freeTextChecks", "Read my typed messages for actions", "When you type something risky, a quick referee call picks the matching action and the dice decide.", s.freeTextChecks)}
    ${toggle("narratorUpdates", "Keep state in sync with the story", "After each reply, small changes the story describes (time, mood, items, people) are recorded within the ruleset's limits. You can undo any of them.", s.narratorUpdates)}
    ${toggle("swipesReroll", "Swiping rerolls the dice", "Casual: a new swipe is a new roll. Turn off for Ironman: rolls stay fixed for the same move.", s.swipesReroll)}
  </div>
  <div class="warp-card">
    <h3>Display</h3>
    ${toggle("showOdds", "Show odds on choices", "Percent chance of success on each button.", s.showOdds)}
    ${toggle("showDiceChips", "Show dice & changes on messages", "The roll and what changed, under each reply.", s.showDiceChips)}
    ${toggle("hotkeys", "Number keys pick choices", "Press 1–9 (0 for 10) when you're not typing.", s.hotkeys)}
  </div>
  ${renderDecider(s, jevKeySet)}
  <div class="warp-card">
    <h3>Helper model</h3>
    <p>Used for the referee and bookkeeping calls. A fast, cheap model works best.</p>
    <select class="warp-select" data-setting="helperConnectionId">
      <option value="">Same as the chat</option>
      ${connections.map((c) => `<option value="${esc(c.id)}"${c.id === s.helperConnectionId ? " selected" : ""}>${esc(c.name)}</option>`).join("")}
    </select>
  </div>
  <div class="warp-card">
    <h3>Content: lines & veils</h3>
    <p>Click a tag to cycle it: <b>on</b> → <span class="warp-tone-warn">veil</span> (still happens, narrated off-screen) → <span class="warp-tone-bad">line</span> (removed from the game).</p>
    <div class="warp-tags">${tagChips || `<span class="warp-empty">This ruleset doesn't tag any actions.</span>`}</div>
    <div class="warp-row"><input class="warp-input" data-newtag placeholder="Add a tag… (Enter)" style="flex:1"></div>
  </div>`;
}

// src/frontend/builder-ui.ts
function emptyDraft() {
  return { answers: {}, additions: [], notes: {}, refine: "", base: "", creative: false, connectionId: "" };
}
var KINDS = ["skill", "meter", "item", "place", "person", "action", "rule", "other"];
var REFINE_CHIPS = [
  "Make it harder",
  "Make it more forgiving",
  "Add more places to go",
  "Add an encounter that fits the card",
  "Give the main character a daily schedule",
  "Add a skill for something the card mentions"
];
function renderBuilderCta(hasRuleset, hasChat) {
  if (!hasChat)
    return "";
  return `<div class="warp-card warp-builder-cta">
    <h3>✨ Build with AI</h3>
    <p>Warp reads the card, asks you a few questions, and drafts a ruleset that fits — checked, balance-reviewed and previewed before anything is saved.</p>
    <div class="warp-row">
      <button class="warp-btn warp-btn-primary" data-b="open-build">${hasRuleset ? "Rebuild with AI" : "Build with AI"}</button>
      ${hasRuleset ? `<button class="warp-btn" data-b="open-refine">Refine with AI</button>` : ""}
    </div>
  </div>`;
}
function steps(s) {
  const list = s.mode === "refine" ? ["Describe", "Review", "Install"] : ["Read", "Ask", "Review", "Install"];
  const at = s.mode === "refine" ? s.step === "done" ? 2 : 1 : s.step === "start" ? 0 : s.step === "questions" ? 1 : s.step === "review" ? 2 : 3;
  return `<ol class="warp-steps">${list.map((l, i) => `<li class="${i < at ? "done" : i === at ? "now" : ""}">${esc(l)}</li>`).join("")}</ol>`;
}
function question(q, a) {
  const val = a ?? q.default;
  const why = q.why ? `<div class="warp-dim warp-q-why">${esc(q.why)}</div>` : "";
  let body = "";
  if (q.kind === "single" || q.kind === "multi") {
    const chosen = new Set(Array.isArray(val) ? val : val !== undefined ? [String(val)] : []);
    body = `<div class="warp-tags">${(q.options ?? []).map((o) => `<button class="warp-tag warp-opt" data-bq="${esc(q.id)}" data-bq-kind="${q.kind}" data-bq-opt="${esc(o.id)}" aria-pressed="${chosen.has(o.id)}">${esc(o.label)}</button>`).join("")}</div>`;
  } else if (q.kind === "scale") {
    const v = typeof val === "number" ? val : Number(val ?? 3);
    const labels = q.options ?? [];
    body = `<input type="range" min="1" max="5" step="1" value="${v}" data-bq="${esc(q.id)}" data-bq-kind="scale" class="warp-scale" aria-label="${esc(q.text)}">
      <div class="warp-scale-labels">${labels.map((o) => `<span>${esc(o.label)}</span>`).join("")}</div>`;
  } else {
    body = `<textarea class="warp-input" rows="2" data-bq="${esc(q.id)}" data-bq-kind="text" placeholder="Your answer…">${esc(typeof val === "string" ? val : "")}</textarea>`;
  }
  return `<div class="warp-q${q.core ? " core" : ""}"><div class="warp-q-text">${esc(q.text)}</div>${why}${body}</div>`;
}
function additions(d) {
  const rows = d.additions.map((a, i) => `<div class="warp-add-row">
      <input class="warp-input" value="${esc(a.name)}" placeholder="Name (e.g. Cooking)" data-badd="${i}" data-badd-field="name">
      <select class="warp-select" data-badd="${i}" data-badd-field="kind">${KINDS.map((k) => `<option value="${k}"${a.kind === k ? " selected" : ""}>${k}</option>`).join("")}</select>
      <input class="warp-input" value="${esc(a.note)}" placeholder="How it should work (optional)" data-badd="${i}" data-badd-field="note">
      <button class="warp-btn warp-btn-ghost" data-b="add-remove" data-i="${i}" aria-label="Remove">×</button>
    </div>`).join("");
  return `<div class="warp-card">
    <h3>Add your own</h3>
    <p>Skills, meters, items, places, people, actions or rules you want in — in your own words. They'll be built in properly.</p>
    ${rows}
    <div class="warp-row"><button class="warp-btn" data-b="add-row">+ Add something</button></div>
  </div>`;
}
function renderBuilder(s, d, templates, connections, hasRuleset) {
  const busy = !!s.busy;
  const dis = busy ? " disabled" : "";
  const head = `<div class="warp-builder-head">
      <div><div class="warp-eyebrow"><span>✨ ${s.mode === "refine" ? "Refine" : "Build"} with AI</span></div><b>${esc(s.characterName)}</b></div>
      <button class="warp-btn warp-btn-ghost" data-b="close" title="Close the builder (discards the draft)" aria-label="Close">×</button>
    </div>${steps(s)}`;
  const status = busy ? `<div class="warp-card warp-busy-card"><div class="warp-status-line"><span class="warp-spinner"></span>${esc(s.busy)}</div><p>This can take a minute — you can keep chatting; the drawer will update when it's done.</p></div>` : s.error ? `<div class="warp-card warp-error-card"><p class="warp-tone-bad">${esc(s.error)}</p></div>` : "";
  let body = "";
  if (s.step === "start") {
    body = `<div class="warp-card">
      <h3>How should it build?</h3>
      <label class="warp-field"><span>Starting point</span>
        <select class="warp-select" data-bset="base">
          <option value=""${!d.base ? " selected" : ""}>Let the AI pick after reading the card</option>
          ${templates.map((t) => `<option value="${esc(t.id)}"${d.base === t.id ? " selected" : ""}>${esc(t.name)}</option>`).join("")}
          <option value="blank"${d.base === "blank" ? " selected" : ""}>Blank — from scratch</option>
        </select></label>
      <div class="warp-seg" role="radiogroup" aria-label="Style">
        <button class="warp-seg-btn" data-bset="creative" data-v="0" aria-pressed="${!d.creative}">Stay close to the template</button>
        <button class="warp-seg-btn" data-bset="creative" data-v="1" aria-pressed="${d.creative}">Get creative</button>
      </div>
      <label class="warp-field"><span>Model</span>
        <select class="warp-select" data-bset="connectionId">
          <option value="">Same as the chat</option>
          ${connections.map((c) => `<option value="${esc(c.id)}"${d.connectionId === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}
        </select></label>
      <p>A strong model gives better rulesets. Nothing is saved until you install it at the end.</p>
      <div class="warp-row"><button class="warp-btn warp-btn-primary" data-b="start"${dis}>Read the card →</button></div>
    </div>`;
  } else if (s.step === "questions") {
    const a = s.analysis;
    const analysis = a ? `<div class="warp-card">
        <h3>What I read</h3>
        <p>${esc(a.summary)}</p>
        <p><b>Starting from:</b> ${esc(templates.find((t) => t.id === s.base)?.name ?? (s.base === "blank" ? "Blank" : s.base))}${s.base === a.suggestedTemplate && a.reason ? ` — ${esc(a.reason)}` : ""}</p>
        ${a.cardType === "scenario" ? `<p>This reads as a <b>scenario card</b> — “${esc(s.characterName)}” is the setting, so it won't be tracked as a person.</p>` : ""}
        ${a.cast?.length ? `<p><b>Cast</b> (tracked from the start, with these starting feelings):</p><ul class="warp-cast">${a.cast.map((c) => `<li><b>${esc(c.name)}</b> — ${esc(c.relation)}</li>`).join("")}</ul>` : ""}
        ${a.statusBlock?.found ? `<p class="warp-tone-warn">This card prints its own status block (${esc(a.statusBlock.fields.join(", ") || "stats")}). Warp will track those properly and tell the narrator to stop printing it.</p>` : ""}
      </div>` : "";
    const rounds = s.rounds.map((r, i) => `<div class="warp-card">
        <h3>${i === 0 ? "A few questions" : "A few more"}</h3>
        ${r.questions.map((q) => question(q, d.answers[q.id] ?? r.answers[q.id])).join("")}
      </div>`).join("");
    body = `${analysis}${rounds}${additions(d)}
      <div class="warp-row warp-builder-foot">
        <button class="warp-btn warp-btn-ghost" data-b="back"${dis}>← Back</button>
        ${s.rounds.length < 3 ? `<button class="warp-btn" data-b="more"${dis}>Ask me more</button>` : ""}
        <button class="warp-btn warp-btn-primary" data-b="build"${dis}>Build it →</button>
      </div>`;
  } else if (s.step === "review") {
    const p = s.preview;
    const errors = s.parts.filter((x) => x.status === "error").length;
    const summary = `<div class="warp-card">
        <h3>${s.mode === "refine" && s.changeSummary ? "What changed" : "The draft"}</h3>
        ${s.changeSummary ? `<p>${esc(s.changeSummary)}</p>` : ""}
        <p>${esc(p?.summary ?? "The draft doesn't run yet — see the sections marked in red.")}</p>
        ${p?.warnings.length ? `<div class="warp-issues">${p.warnings.map((w) => `<div class="warp-warning-row"><span class="warp-tone-warn">!</span><span>${esc(w.text)}</span><button class="warp-btn warp-mini" data-b="fix" data-w="${esc(w.id)}"${dis}>Fix</button></div>`).join("")}</div>` : p ? `<p class="warp-tone-good">No balance problems found.</p>` : ""}
      </div>`;
    const preview = p?.hud ? `<details class="warp-card warp-preview" open><summary><b>Preview</b> <span class="warp-dim">— the sidebar and choices at the start</span></summary>
        <div class="warp-preview-grid"><div class="warp-preview-hud">${renderHud(p.hud, { editing: null, compact: true })}</div>
        <div class="warp-choices">${renderChoices(p.choices, { showOdds: true, hotkeys: false, busy: false })}</div></div>
      </details>` : "";
    const parts = `<div class="warp-card"><h3>Sections</h3>
      ${s.parts.map((x) => {
      const badge = x.status === "ok" ? `<span class="warp-tone-good">✓</span>` : x.status === "warn" ? `<span class="warp-tone-warn">! ${x.issues.length}</span>` : `<span class="warp-tone-bad">✕ ${x.issues.filter((i) => i.level === "error").length}</span>`;
      return `<details class="warp-part"><summary>${badge} <b>${esc(x.label)}</b>${x.changed ? ` <span class="warp-here">changed</span>` : ""} <span class="warp-dim">${esc(countLine(x.yaml))}</span></summary>
          ${x.issues.length ? `<div class="warp-issues">${x.issues.slice(0, 8).map((i) => `<div class="warp-issue"><span class="warp-tone-${i.level === "error" ? "bad" : "warn"}">${i.level === "error" ? "✕" : "!"}</span><span>${esc(i.message)}</span><span class="warp-issue-where">${esc(i.where)}</span></div>`).join("")}</div>` : ""}
          <pre class="warp-yaml">${esc(x.yaml)}</pre>
          <div class="warp-row">
            <input class="warp-input" style="flex:1" placeholder="What should change in ${esc(x.label)}? (optional)" data-bnote="${esc(x.label)}" value="${esc(d.notes[x.label] ?? "")}">
            <button class="warp-btn" data-b="redo" data-part="${esc(x.label)}"${dis}>Redo</button>
          </div>
        </details>`;
    }).join("")}
    </div>`;
    const refine = `<div class="warp-card">
        <h3>Change something</h3>
        <div class="warp-tags">${REFINE_CHIPS.map((c) => `<button class="warp-tag" data-b="chip" data-text="${esc(c)}">${esc(c)}</button>`).join("")}</div>
        <textarea class="warp-input" rows="2" data-brefine placeholder="e.g. Add a cooking skill Aina is bad at, and a kitchen at home">${esc(d.refine)}</textarea>
        <div class="warp-row"><button class="warp-btn" data-b="refine"${dis}>Apply change</button></div>
      </div>`;
    body = `${summary}${preview}${parts}${refine}
      <div class="warp-row warp-builder-foot">
        ${s.mode === "build" ? `<button class="warp-btn warp-btn-ghost" data-b="back"${dis}>← Back to questions</button>` : ""}
        <button class="warp-btn warp-btn-primary" data-b="install" data-replacing="${hasRuleset ? 1 : 0}"${errors || busy ? " disabled" : ""} title="${errors ? "Fix or redo the sections marked in red first" : ""}">${s.mode === "refine" ? "Save changes" : "Install to lorebook"}</button>
      </div>`;
  } else {
    body = `<div class="warp-card">
      <h3 class="warp-tone-good">✓ Saved</h3>
      <p>The ruleset is in ${esc(s.characterName)}'s <b>warp-ruleset</b> lorebook and running in this chat. You can refine it any time.</p>
      <div class="warp-row"><button class="warp-btn warp-btn-primary" data-b="close">Done</button><button class="warp-btn" data-b="open-refine">Refine it</button></div>
    </div>`;
  }
  return `<div class="warp-builder">${head}${status}${body}</div>`;
}
function countLine(yaml) {
  const lines = yaml.split(`
`).filter((l) => l.trim() && !l.trim().startsWith("#")).length;
  return `${lines} lines`;
}

// src/frontend/sprites.gen.ts
var SPRITES = {
  rat: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACH0lEQVRYhe2WLW/bUBSGn0wFhQZV1EoBBktANRCy0hpambQODaxS1X/Q1qC0rcYCkuKhqdL2E6agKaNBxgnxpEiRogCDgIBIHrCufXzvddKsbPPLfG2f5z3v/bChUqX/XbWXvOw5JADuPkSrdGwY71bzrwxcHqZgBXX383vRKjfUvQsK753c9AzezgZU1zpYlzIRreC049Nq1GkeHRgmdjKgR+45eQo2qXvxGsIl3H3yeff2mJObXsbe2wUuO1Ym1JiMXpqK15vrvnquAQmWGsY5VMJt0/PwfQDAt9sLIE3zWQbkvOtG5A6Q43LMETlPZotCHauBe5fk3k2hMnrZoepcQfWpgDz+YVysP57ONxvoXAWZEVXMc/JFpwOlOZmIY1lhzaOD7QlMZguaHy8KHSlTsntb3PoCDJf59agfMJktsrVQauC8+1STMXWuAmPudJguHY655WulBjyH5PfPQdbl7UOP8XS+Eaig2+CyMasBzyF5HIZG8V8/Btb9Ha+Le/2043P23rfCbSlaE3j020Aa8fUgN6PD4nW60MJlui6+fA5oNepyjjP4qB8k4+m8MP9gnoSFjwzAtdfOQBKsRQygjlgDrtRq1I17+kOJ58DXMOKy7WYwAF63OTs+pNWoc959Mukl35VRP0gmswVa9+UGAKIoAuDDGxdnLz9IRv10K27rVIKBUnjZy8axK55NtOtNstV50Q9QpUqV/k39AVlzAPNOrZP6AAAAAElFTkSuQmCCAAAAAElFTkSuQmCC",
  bat: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAAZiS0dEAP8A/wD/oL2nkwAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB9oFHg4RHqQfCUwAAAMwSURBVFjDxVfPSxtBFP6epkRPUrMlq2nqwSqBbshBCT0oZA9h7TmnGkoP/Rd6F285aG89eqzgwXOVHizYQwnxIG5hUSto0G7sBi8iBgLTQzrD7GY3P8yWPlg2u5l535vvfW/mLTHG8D8tAgBE5IqCMUb/AswPJ0JEbGV5Sbz8/OMSRMTCDoKIWDaTxqsXCde7CGOM5CD4gDCD8ANf3dxpMcCpICJWMHRosWioQXjBzXoD27t7Is0ROR9ExGDooTEhg5v1BgC4wF0ByKbFogMH4V25FouKIGQbCgLvVdFeZXcyP9/E94FujmQG+FiRNp/S7dVfmwbkkuRqldNARKyYy+PT1y9iTDGXd6WJg3t9yeoPTIFZb4gryMnzyWHXKvlzkHl9BmqAMUbbu3uufK1u7iCbSbdNLObyWFxcRDGX99VGNpMW7HFf3grwZcALXjB0JFVFOC8YOm5Hx6BOj+PZ8AjU6XHcjo6hYOgu8KSqoGDobUF0ZICXjgyuxaLQYlHBwvVdE+sbWygfX+HR03coH19hfWML13dNyOB8nhxENpNuE6cvAzI4t5rjtJzMTqJg6Lg4O8XP84+4ODtFwdCRnZ0U4+R53iACGeCRlQ+PkM2k2yib11KYSkwAACqmhddv3mJ/fx+ltQ+omBYAYCoxgXkt5QuUzaRRPjxqK1Hy9gP8T84AV27VdlBzHCzMaACAA7sKy7KQSqUwpyYBAN9OTMSVll54GvjeH3TMD3XacMx6A1XbQcW0UHMcxBUFJzc2AMCyLNedv+epqtqO6+AJ2srJryOSxcgdAkBcUZBUFYw0Iki+nMPvNRtP3quofj/AfbQpUsHH8pR2OkeGgrZJni/Zao6Dqt0KqFQq4X7hEqVSSazYa93AA09D2c4vf4nfXIT30abYIVeWl4RO5LGcgZ56wiAWvAcNEbG4oqBiWqgqCmYeqzi5sYU+5Hm9rD5QA7IWgk45zoa8cu+J2VMPwRjr6wLAspk0A8CmEhNMfu7XF2OsMwO9tteDtPI0yIdJGE3r0ADgf2+Dde59M9Cp1XoIG12rIIwPk753wjC/Ebv56CsFvTLST+AProKwSvEPyxs295OK40UAAAAASUVORK5CYII=",
  jackal: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAATlBMVEUAAAAkGxBBMR1INyBZSjJjUjh6Wjl6ZUd7HCCIcE+XhmKmfke8l2AAAAAkGxBINyBjUjiIZD+IcE+mfkeolW3Gt5bGuJfHuJfRqGv///8qiTDeAAAADXRSTlMAAAAAAAAAAAAAAAAA7Uh4SAAAARpJREFUeAHVkNFOwzAMRUtLB4zeXLu3g/z/l2JnVVaGxhMvHGnZ3HMqTxn+CfN+PgKY0wMPA8Mc3h4HNLzB+EtQDFaOwTxP020aQa6Ft2CaEEzzLVil1R3z/jZgRgK9oEnubvFSAJBGc1ov4HL4uhoSC0unsnhq/oUIfzGFSdK7qlj24sRtu3xSYitEkaq1FrBcl2D72AhVee4OJUUg5AWkP59JwFmjaMarU9XRLrkFwDhk4arp6SyUp8tP8Jo/C91d6YFCuPB+f+Gg19QLaGAVvvtYB7lj3FfDhaAHxhYQrUZSkfQg/P7Xk58BAYQ/oq4TAOo+5mUZgPG5++U0oPpugyziyOIQdJ1qWK5fOzH1ncegkxNw/+hv+AKbhhl82imyygAAAABJRU5ErkJggg==",
  kobold: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAZlBMVEX///8AAAAFYCMfAy0hISEimi8mJiYpvTwxBUsxMTE04ks1NTVANC5ERERHPDZUVFRZLglcTERiYmJxPA1ycnJzJ7N1YlSFRg+Fbl6LUh+mfmuqbTa3m4K5Cw7HmIHMa8vtKzP01bBVwNRBAAAAAXRSTlMAQObYZgAAASVJREFUeNrNkuFugzAQg+sA6+jtymVZm4TSMt7/JWfQJrES9nsnRUJ8jo0TDv9xMC/8wT8AXC7YwzifIZdxlw9DSkn2eRqS9z4JyhjC3ffPu5cOJT6Oo0+ePIkUBVM1VT5xBilngFOd/UDe7Tq8vnVCLg4oVWSHjpjcHU94sl8iTs5UOLFpjg5r3j9mRdNYeKEiRNc4VawE1z4Coi5kc5ZDMCdda1g7xJuqaLY0JSrM0N4iflXMKpCcjZwCHJDz83fyZVwcYjAy66/YVA3RyBcHxvYFgfFCLZjVwKNPW4GFwCZzCSpKp1mbORqI1LWi+EOqa07unY1RdyUHEtfMAibU2mEbwa2OjBlYZmuxACrqAp+Bft8rWt3ySSdV/Dy1G/9V6Dr/C3aUEyEO48SeAAAAAElFTkSuQmCC",
  goblin: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAApVBMVEUAAAAAAAALCwsODg4ZGRkdHR0fGRUfHx8jIiAsKSgsKigvKCQ1MjE1NDM7NzY8Mi49OTg/NzJCPj1GPThIPjxMEgxQUFBRR0FcFg1eXl5fX19pGQ5wXVV5HRF7e3uFhYWIHxGIIhWJiYmKioqUJBaWJheXJxmYmJicKx2kKBmkpKSpi36wMSCzLBu1tbXDw8PFMR3FNSHNzc3p6en+tlX+v2j///+x7O0pAAAAAXRSTlMAQObYZgAAATZJREFUeNrdkuFWgkAQRvskU5Etqx13hF0LgdKUWqje/9Wa7Uemrj1AwOHA3LvfDJy9+I8HgL+51QpnoVxma7UODzHuAaW3xkgGNogJrSItAY5U+xgTnC98Y1TpXctFtIejT9aKPogY8SkLanxbChYeFSSjLMkVQx1VMEy4HwxeXaJTm+KU31+p5PntZVWMlNWWcSKwEaNtXGJGRnHNOOalCkaSmNTc1exr/KYAe0cwUzuyqZ1yeGfsedV7Jxw7Mw3nDS5w0AMNN0xSXXcqVWm5E4Sa903Qc4lQXD11Xbdbz3NI7SACCPfJ4mFZ5fMqz0SofI/jD13cLrMqy7NsjOjewnU2m+STSxoT4v+aZk5QQUUQYgmbRgQxNowzxjdH4xAXJCEg0SjO35uKEEapuI9N+bPocPUXYJAbG2C0BSUAAAAASUVORK5CYII=",
  ooze: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAACSVBMVEUcGhguLi40PjlBT01CXlYAAAAZFxMfGxcgHRghHhkjHxslIR0mIhwoJB4oNjgpJiMpMTMpNTcqJiAqMTIqNzoqODgqODoqOTorJyErLCorLiorMSsrOTcrOTsrOjssKCIsKSIsKyIsLiwsLycsOj4sOz4sPDssPjssPjwsPj0tKSMtKyMtLSUtLiQtLyktNTMtPT8tPj8uKyYuLSYuLyUuLycvQUEvQUMwQEQwQkExQ0UyREAySEQySEUzR0QzR0UzR0kzSUYzSUc1SUU1S0k2SkY2TEk2TEo3S0c3TUo3TUw3T0w3T004Tkk4UFI5UUw6Uk06Uk47VVI8VE88VlI9VVk/V1E/WVQ/WVVAWlNAWlZBXVlCXlZCXldCXlhCYFpDX1ZDX1hGYltGZFxGZF9HY1xHZWBIZmBKaGFKamNLaWFLa2lMamJNa2NNa2RNbWRNbWVNb2lObmdPb2dPcWpRcWhSdG1Tc2tUdm1Xd25YenFZfXJafnNcenBcfnRedGFffXNibVtkc19le2xlgXVmfm1nf2tug2tzgWl1hGJ2gWF3f1t8kHZ9eld/jHSDhmCFkWmHhFuHiWGIiGCIjGSKjWOKk2mLjGKLmHCPlWuPmW+Qi2SQlGiQmnCRiGORlWuRnXWTimOWkWiZp32gpXmilW6jo3Wjp3unnXOpnHOqm3KqrX+snXawpnq0sYK0tIS2soS3sIO5uYm6soa8s4i+vI6/tYnAvZDBu43BvI/Cuo7CvI7EwJLFxpjHv5PHxJfIxZjJxJfOyJ7N+65iAAAAAXRSTlMAQObYZgAAAcJJREFUeAFjGIyAlZUVv/z65RWs+ORn7t8/t5IVt8Gs5QtmVTqzYsofWF8FVZFQ02pmyIqhYMmmMlaYWXH2WBRElkYABaGG+HsKYapYUcjKwJoHVZFuCmYge5jVWxqooG01RGKlNyuI6tvOCpfXUOYBKmDJdQLLlEiD7GveeoAVJi+jywOW8Y4HyUh7u4CoiIYEmMMD9HggZsfPYwWCmS7KIAW86nAD+r2B5gORsmUKUL52A9gcUx6EC6ZnZoB08mRHA8m2REsQJ5YH2Q/1C0NYWbm5ouVVWPcm6vGqsrLWmfODzIRbstA7lJtb00icZ2aigragQ6+khbAjKwhAA8TYu01JVkCCb35WT5abW5KYlaK1vJIXSB4izd5mLBcax83BEby4zSM9p9rGILZOR8vVhFMKZI2ujETEDjvOwC1xcVJdfLZpretiRJuX6rK5tviqNTYCFRTJqEpETfHjjZvQGceX7KGb71s3o1mkuXlnQWr7HimQh4smT24q3jIxLjzIPavLVt9D2iele9vS5sa1M2BuBAG/tjVT5xzcvbmja1XJon37dh3aFoaITJiqsGnLNs6fNHt6GFgL9oQJlRpkAAAFoXBAN516bAAAAABJRU5ErkJggg==",
  spider: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAABEVBMVEUAAAAAAAAAAAAC/P8aHBofHx8gICAyMjAyMjI4ODg7OjlDPjFFRUFGRkJGRkVGRkZHR0dISEhJSUlKSkZQUFBWVE9XV1dYVVBYVlFYWFhZWVlaWFNbWlVfXVhhYmZiY2ZjYVxjY2VmZmZnZWBnaGxoaGRpaGNra2tsbGxtbm9ubm5vcHFwbmpwcXJxcW9yc3R1dXV2d3h5d3N5en56enp6ent8fHx8fX5+fn6BgYGCgoCDhIWFhoeGhoaHhoKJiouTk42Tk5OUlJWWlpaWl5eampqbnJ2fnZWioJimpqanp6epqamqqqaur62xsbKysrO0tLO1tbS2trS6urm7u7m9vb3KysnLy8vOzs3R0dPx8fGUHxAVAAAAAnRSTlMAyg0i5pYAAAFISURBVHja3ZLpUsIwFIXbg2lEo20UUFyoGxKt4l5RwH3f2yoi7/8gJkWxUKaOfz0zuZOZ79zMzUm0/yfgF553dWhQ6s8z8OEiaDSCAH2wkgszaLZaL2c3iLfnXR8mXmtvreZzbfYaPXwMwKo0XO6cPD1crS1V0c2nIMsmjHNn8fjoYntvvIDYBBpKgDOxPre/vDUzkum+C9xcDjAN2Cy7Mu1MMkqY8Fz8GHzgFjBYhrLsaFZxCoDim+9CljvYVb9KGZUcUroG3nZ8bSS3CXMGGTW44F4kUSyEPPXxfm+TAkFbQuGOQddR3KgfpA5tAkIEFx4EIiHo6oByvVxMW0NcCEh5PHKHsFhFO2UNpxUUatHeqCoDaasyj7A7NPW+Vh14PEXHwBF/71KpPbjqViHFhEgsMJHw9ai0JnDVLXGiIZmHAyYL2h/0Ccq1H7ghFBwaAAAAAElFTkSuQmCC",
  frog: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACWUlEQVRYhe2XYZXrIBCFv/asgEhAQiQgIRKQUAlIeBKQUAlIqAQk1EHeD5gwENJtt33n/dk5Jxtg4N6bm4Fm4Td+4z/H6Zv8+sLcjwrIxL70DOD+rRBNvOJYSeWKpR9Y8SX/wdBPsxKABDjwwWKtIaU7zlwhqJlhuP4tAZk81kR0Dn/JTO6y4LjmvClX/IyQTYD3Fk+s4MAM3JKa7agiLNmtN4WcpZFSJJglg9pMcgNmUyYYai4VUul7pEhfro+mBpwDaxdcumZwTSx3aZuuDdqNp5046461CzFesxMCmtgcIZVhLUZflped6JWuIWQR1i4A2Y0ixKRijAj6Qy4UCUNfoN86ce76J+cyeUp3gFoXQDKdAxO5UCybyFed6AVsIoyZMma619dhsoimFibV1+JMI+JQyCOLVu8txkykdM9bNKmsoW5JyE5MNGKhzLmX/IBv5EDl0ORGgUIVcyvjcyGS8UjrUq6VnRMPHWAGFvbbTsDlqS37LXqlOiJrBk7sdsHWmtXd0IpIBVCIobqjx0b32PJ+NeSuW8CmuD0FJS8iZLwXKMJEXMVdRcTXNuDJR6qlLSyo20wIINu5dORCGmldk3VW5YsIEXAqv/X1bJeJGjzROtCTJ9o6aAnrQ6gY10CgtRP21s/ARa2MjGtF50VwGAtYt4RRqrWAyD68IhTy0VqdUzj1g0QUAtv269Qehu/6qWsL+QCvdeA58vEaiambbZWQAd6+BgL6C/hoXp4r4Jbjd39ALLhj4Gf+Xwi07zjA7hyJDzFO258fxjuf54dH8TvxjKAd318aSwCUTN3BXQAAAABJRU5ErkJgggAAAABJRU5ErkJggg==",
  hobgoblin: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAxlBMVEUAAAAfHx8AAAAODg4YGBgZGRkbGxseHh4fHx8iIiIjIyMlHhspKSksLCwuJyQvLy8xKScyKigzMzM0LCk1LSo1LSs1NDM2NjY3Liw3Nzc4Li04Ly05Ly05OTk6MjA8MzE+NDI/NTNBNzREPDlERERHR0dIPjxLS0tMEgxOTk5QUFBRPzdTQjlWQzxaWlpcFg1gTURhYWFlUklnZ2dwXVV5HRF9aluKioqUJBaYmJiokHupi36zLBu8qJbFMR3tOiP+v2j///9m7evTAAAAAnRSTlMAAHaTzTgAAAFOSURBVHjalZINU4JAEIbrJRMry9To29RsI8q2j1vciC7//6+Kg3SYAGdaZmDnnof3jh22/lsANvM5ETbyT0MBmuMDxwcE1HNNw4CCkDXVJmMZBuGykTuDsyvl5kOkVmyq0ixo7Hmxst9kbCOJ4y8ezC9Rq+DRU2u1a8hQXQjM9dBrtVi6GVdGVRia4YxVlMkXWzXAoqe9E1GrvjCXDQCOq2UeLSJRUSDTBSv+rQKoFYZwFI3C/F3wOiJjyirMgLuPIglRbLkSHHd4CzPnPhzmCcK63iMv1/TvFovo4+gVeW515HjejaIu3fePkeWyVoWL/bM3mr7QOWr/TkxMb+/pakrv404Oa4RJG0DH0NgJ+BsCQ1MUzw5WVeY+3fi5QGZcK9BtqzicPxge1Anc9VDUTpurvJhdUaxcx+1qOW8rn5Bowr+r4ISTyiTKkaX2Bxw4MdYY2yGFAAAAAElFTkSuQmCC",
  gnoll: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAQlBMVEUAAAAAAABAMABAQEBgMDBgSACAAACAIACAQECAYACgKACgUFCgeACgoKCqiDTAAADAMADAkADAwMDgqADg4OD///9d9j70AAAAAXRSTlMAQObYZgAAASZJREFUeNp9kIuOgzAMBFmCS0x8V5zy/9/aDXKr8jSKMJnJAu42BXTobgpLxYIbXpdaF+DmvJm/XlcZMPHn07QCF9xd26rLeQQej4eaCiPILwxVYQQTzgViMXObZ1wYwGyMmKbpXCGf3F3TOJ4qxGNyN0+0JJQd90TIJWZcqviNnxhvlhLHSaTWnsKIKQk3RLT+8dZDlI9fA2iUGNCUUhNY4h8B7oE7CnwNhXUwbogJBWafklnKw9rL15DAHXIuJZc8fAyLdyDuJdPg1YxfIQo5AhiRV0P33BtrmBHN2HFzHtbSnBC2hX8rWSUkORhQk/VvC3opHNaAvSGqnBAAGhSAgxG7q3EUAMS5iNhysFQlBGndnhNzt1+xsjkJ6FloFc32Aw8V/A0mHA6ADOUR6gAAAABJRU5ErkJggg==",
  orc: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAmVBMVEUAAAAAAAAAAAAEAgAvLy8/HwFNJwZPMhxXKgFYLwpZOB5cNxtdLgJfLwJgPSZiRzpjMQJjRjdnMgJoMwJpNQRrNQJvNgJwSzZyOAJzRiFzTjl5U0B7QxR8PAJ+SiF+WUh/AQB/PwN/SBuBPwOBW0qFXkyJRQeJXkSUaVWWaVOecFmfTwSgclukdV6/AgHBiG3JjnLf39/koYKkB3r+AAAAAnRSTlMAA++anIIAAAE9SURBVHjahZSLUgIxDEX1shUfxPp+oWarIigGwv7/x5m24whmdwzMlsk5JGmYYW83YGHHYEC06/APV8UABbgKghyOG2pWqrpqpHjeEJZGtTHOLH2zYiOqG9UsVOyNtm03xoeuuj+SrpOWI4ZuORqLcLQY6CCXp5kyLxS9fP0+eWPDor3Lwnp+//rJIlre8ILMHw4/Zl8GFyx+UrDE+fXz7SzzyG4VKOMfXTzG6bRMulMCsAktMz49uHk5PmcGojC2f2VhSyDEk6uzu0BkAutvCaiUnpjQhJ5SohSQc9juD+NEy5TS0h6lRMT2DPkZTCgvCqb7fZtQuBUIBh23FkylBXFAjT9ClEhIoNy+z0C5KpDPfoG0AlZyPeqMNV8+eG7CTzqY4XDusCN4nlIV6kKSnb5AqF+rJfyecvg/gW+waSfEuzKNpQAAAABJRU5ErkJggg==",
  orc_warrior: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAS1BMVEUAAAAAAAAPAAAPDw8fHx8vLy8/HwE/Pz9PT09fLwJfX19iRzp+WUh/AQB/PwN/f3+JXkSfn5+kdV6/AgHBiG3JjnLf39/koYL///+ir1nRAAAAAXRSTlMAQObYZgAAAS9JREFUeNqFlOFyhCAQg5u7XRBBLVxX3/9NG6Sduys4jTPikI+Y9Ycf7wLF5VIodhz4xzfDhQukBhRUdT4tfZjZQ8vJoc9PRc2Ufkpl1BV7MdvNKtDsnliWZacPXE5xHGVJ6dL3scbH6HHha47UlHVIgCd1yrTVR8MA+PIyKbVNwknQA5/iaeZJmFBSRDdBFMlK+SwxdaOA7XEXzw4id5CY8eICeSfggjAhOwekfcNLupW0zSCw7usagsMHNnu2AP3CROgcqp89zr0nUDtz7+zAq5ZAfJ0DQL3fZxWl/KbEuzkJyC3XCLkJzcGX4gzCCMnq0PQHiGXTGqEpYkQgsThV1zEQ7AewMHoHXGj77WEQ4H63HQlQ3RBvQO+vawPOrHXl2ge4dqxF9N+pqv8JfANiwQ/bhvGIugAAAABJRU5ErkJggg==",
  orc_priest: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAtFBMVEUAAAAAAAAAPwIAQwIAUwQAVQQAXAQAXwUAaAYAcQcAcwcAeAgAfQkAfwkAhQoAnw4BQwMfHx8fWRUmSRYvLy8zTB0/HwFITylIXypYRjVZUjNaUzNfLwJfX19iRzpkVDhvXT9vb295U0B8WEd8XEZ+WUh/AQB/PwN/f3+AW0mFXkyMaVCOZFCOZVGPj4+UaVWZb1edcFmgclukdV6vr6+/AgHBiG3JjnLPz8/f39/koYL///+5NbERAAAAAXRSTlMAQObYZgAAAW1JREFUeNqFkotSwjAQRU2KLigxoqW+QlR0AV+gRkwp//9f3hSlpi3jHaZ0ek42m2334ggkelDnzheF+Id7HxlRdd4IToQ0OFC69N4vU1d6TcOxS71PwZldW69i5bxfeQ/OFY6NyWSyQgGxq03risJN2O7iydBiuUVEO+9xSZkXvq1Fl/TOX5iB0WuLIb6Gxwdvr4whhJ9A6hXsfvf2/fEDfMFulK/XIuLsOOkfPT88BW55NsgHuYgE5uSwf3Fjx2OLzD4H60rAfu4Lx090//T66p5xO8vn+VxUb9kx5heEfvfk7BJzEKN8ZLdCyfFQSt1RWpPEfXrnuaqAmgL/RkrVIaIMgsVGf3sIV5kZ2VE0NWWJxsAhkDRmmhlSBIZFTUFJacgoCJvUuFRaUqYyDeE3cQEQrDdKtwjgEOhHqEpEXEGQmaYgNAtQ2CGcIwiaWnokNB8LtUNOBYRwEkKpBoZgjJBhFKCIafnmomz5N0bILIRiMkOyAAAAAElFTkSuQmCC",
  wolf: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACg0lEQVRYhd1X0ZHrIAxc31wBlEAJlEAJlEAJLkEluASX4BJUAiVQAh3wPnLiZIyTe7HvfTzNZOJxjHe1WgkC/K8RY6wxxvrquelO0HmeaykF1loAQEoJxhgAwLquQ6zbCMQYG3gppd03xiDnDADYtu2A93kVeJ7nKlkS0QQAIYRqrW3Azjl5vPYkbi3BGUEAyDnDGINSyk6JXyegiZRSDgQ+/hUBia9yVPlc9sAoRHYAWJZlkuzFKzpuL4GAS70BQMCNMSCi3yGgs9bgEjlnbNt2WHdLCYhoJ3E/BwC04XQrAclaAKXVNLj8dgsBGTrSThpAaiwkNJmR+SR+5AFtrJwz9JSTzDQp4KGGc25331qLeZ53736pgB61epoJsL7Xy92rNIrhINKOFhANINc9uDEG3vvD+56QmIYEnHM7g4n0IYQmvWSq6+y9R84ZRNQIppTatjwi8XQUhxDaRhJCOGQlv3nv4Zxr4ADAzAfAUsphEA09kFLayS013bZt1066/foXCwnnHKy1SCnpbfmcgHa8bp+U0gFYaj8C79d573ddItFKwMwVQGsduZbIObcW0vUcZdVHCKEpqchOgFLAez8xc40xgogac5EQAJZlaQRetNeEx3YL4NusagYcDyTMXJkZ1lp478HMIKLGWMy2LEuTUbu+A9fRn4zPj2TMXPWAkW8NLjuatFopBeu6noG/jOaBdV1PwUspO3Dgez4o8LfiQ8BlgmlwjhHAw8ka/MT1b50tmgJSz5wzVu/BMcISgZnBzIeFMniuxifwZbAvYACwapr14HrMXpUfULIRUXPr4OUTgEpEzZDMfMl8o4VnfyTlmSqAXetdOlf+7eKnPf1O/AGrq+8j1qClYQAAAABJRU5ErkJgggAAAABJRU5ErkJggg==",
  ghoul: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAAZiS0dEAP8AFwAUMJQdewAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB9oGFw4PImWZf04AAAAZdEVYdENvbW1lbnQAQ3JlYXRlZCB3aXRoIEdJTVBXgQ4XAAAFGElEQVRYw+WXXUzTVxjGf6cUaGlLKQooUop0ihBaKYrKppkuJosuJEt2sWUXJkt2syW72LLrLdn1Mrdk2YWJm1mybJkXxhi3RNlEixZFoAiKoBBwflAKLS3Yz397diFUCuWjsLv9k//N+Xjf5zznOe95DvzfP7HB+XKj8TYCQO7ZtyetoetWV9Yx1wtANjU3UbGjAikliXgCKSVPR57S3dmdVVzVCtQu9wNQai7l11PnqK6p5vefLiClRFGU/0QDsrGpEV2RDkuNBcd+B9FwlKH+IUbujnDtr2sAtLzXQuUrleRr8lFiCkN3h3gy/IQ+d19WDCweKOt0OrYbCtAdP4JnzENuXi5SSrR6LeXWcuKROH0dfUgpKa8u58JvF2h5t4XRwdH55FltsTotua0OnVFHnqUCz6iHq39fTXU27G0gHo+zxbKF4tJifBM+/F4/ALNtLnIqKji2rYxtJj2hg/sZuz/G9bbrcjUgCwGQlElMD0YJFhTOJ09NdN92y/pYPclkkqpdVejdfTzyBWnS6/HPhKj0PKOqxIhKJRj3BrHarBiMBqY8U3R2dMrlQCxslDVaLdZNhfzx2LOsPnY7dlNmLsNsNaO72k6+UKEAsTffIBwKM/F4gpnADIZCA42vN9JxuQPfhI/bN29njKle3JAvVtw20dvTK5t1zXhyPVjeOor28jU8h15FJZNIIZkan8LV7gIg4AtgtVtREgp2h507PXeWMJF2DMv1WjQyyRcHbJmqXAqEq92Fz+vDXGUmqSSIRWMUFRehVqsJBAKpcc4rTs58d4bITATjZiO2hqVx5wHIY1tLueL1QY6arzr6+MxRsxIIQs9DdH35Lf94A4SjYfpPnmbw53NIKRdvsbjhvAEKmMpM2B32tLgpBoTqBTObTAYAvukZ5OPdO5YDIdxdbsanZ6n6/EMEgtL3W5iYCTHQP5Bpr4XzipOkkkQs6koBkMkkAN+7B/l0zy4Afuh9sOIRkkLQdr6NhJKgs7Vz8eqXfIb7Q8hF65kHIP585uV4eSkAJ7vup+hbUZFNDRx95ygSSd2+OsTKAiYHyMnJWbkSrrGMSsdeB8YiI0IISiwlDN8ZJhaLAWQqx/KjeiuPArNEowqtE1OpfvV6b0e1Wo15p5nq2mrisThbK7YyMjDC2NDYErAnPjmBMOgp/OU8XpHk4OZi2id9EhDq9VzFjfsaMZWYABgeGCYaib4Ala9me812hErQ29WbYrO0/SZf9wzyQbWZVo+X5s2mVa/jZZPbHXYMxQaKSoqYfDrJ+Ng4Z388i9/jJzQdIk+bR4G2IG1ScE53RpN+jmaxbgBIKbHstBCPxZmemqb1YiuAaL3YStAfJOgLYq4xc+jIoZSmTrkHAQgriRdiFBsAAJCIJ5jxz+ByuhbqRricLoK+IAFvgMraSg68diBN2MrcUXd6X4owGwDS1mBDo9fgfeblefB55jLtdOH3+lHiCoffPpxmXk/3PVxyvLNmwLLTgipHlbZ6jRCyQIiUZbvluoVGq+HS2UurGpSsACiKwsP+hyixl94vF6QEQguqoK3Bxr3ue8Rj8XWb0oz0DvQPEA1FF1Y8GQeiC5LbHXZ0Rh2R2Ugmi7YhAKlT4J/0Z+yb10h4Jrxmf5iVCFORlqn5Gr0GKSW93b1rNqfqbJLX1tei0WnIzctdMqDpYBMAkdlIVoyuBUDqCZZIJJCKRKXKTNx88jnns6Y3gsiW/iXXqwAVgkhmL7Bq/H8B7JUnsw/+2NMAAAAASUVORK5CYII=",
  scorpion: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAAZiS0dEAP8A/wD/oL2nkwAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB9oHGAwDNFt/aJsAAANgSURBVFjDvVdNa+JQFD2pr4owuhDaCs5aCJJpYfaCi+AfkMKArmbpLGW24nZwOV3OQioMiH+guBC6L+iEEHBdIa3QhQ4Ea+ydRfNekzTxq3YeCEl8ee+8c88990ZCyDC1DLnvK9UJetePEvY8PAv2OikCgB8//6JYiInnV/05ioUYTnOHUM8fpHcB0OukSJHjaHenGOg27u6X4sRqPkoc0L5BMPfmmmFhoNu4+bOAMbJfwD0DoWIhhqG+2GsIGACx6FBf4O5+6dncD+L7tw97BXAAALXGTOIgbs2n0MnvwYAYaj5Kaj5Kq+Zwke6dgXIpTsVCDJcXR/jf44BfnOYOoRnWapbWqN/vHRuLkA9Fjm/1crOe8GyYVsa70SBnGTXrCdrmBM5c/29rVhgAGCMbrY6FX7+tN7vprqyQmo9uxYKzEe3CSqAIb80nDHQbmmFtJKZyKbmOFalZT6BZT5CbFf/aXISSMbKJRYChzsTEtDIOVX1aGUvOHPKHwfX+q9D4Q+LJAnv5XPl2yQgAaHenoRqpNWYUpJlXWlBkRmo+SptkhivmnusgfazVAB+aYaN3/YiP6QMMdBvt7hSmliE1HyW/FYecOFQfppYhU8t4NMEC6CKn+kHOMqchmaBYiEGR41DzUeKWXalOYGoZpJVxKJgXUHHicxyAVGvMpINVeW2MbFH9BrqNSnUiOqVKdSJqh6ll6Ko/h6ll3OLzNDt390tc9ecY6Ha4ifjp8p/qqj/HyXEEd/dLAaRcSnrAuHvIy4sjaIaFVsdCu2vxqotiIYaBbqNZT60G4E+ZZj3hueetG+8XeeYEAeKFTj1/QLOeQK0xg6llXmkgLI2InzatjCFnGVjkOW0/fzoU3dRQX4gG1j94v7myGm7g98S14WaDewcAnBxHnDhPRZnnAHj8a42ZyCJpldc7E6WAsEjuEAWBOTmOiGdnOeak9BbFzm0sQebi+58AkJxlpMiMep0UlUtx4m2e0+oFFqlNQ4ByKSmoCzAhCQAZIxu9TgqtjoWbPwt8/RL3NLQu+qWVAIJScB0gvmirY9FZjuEsx1ZVTBFeFlbp3tpslktJ8ZXltW9r+ywIYiSMoXbXkoA4AVMhyN71o7v99zzb6aRBdhvk/TwD/G7qAiTt/XPbH+t13vIPfpEEGMoGOkQAAAAASUVORK5CYII=",
  wolf_spider: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAABelBMVEUAAACARjSXV0MAAAACAgAJBAMT/y8dDwcjEgkjEwknFAkrFA8wFRAzGw00GBA3GRE8IBA9GxU+IhE/IxFCIBZCIxJCJhJDJRNFJhNHIRlHJxNHKhNHKhlHKxNJIxlJKBlKIxpKKBRLKxVQMRxSMRZVMBdYLxhYOyJZNR9ZNiFdNBlfMxlfNRlkOBpmPyhpNwtpOCptPR1wQR5zOx90QiB5QjF+SSKBTCGMUBqPUj+ZUzubTgWcUwqoWRKuXgCwaAK0WgK1XQO2XgC4WwC4XwDAaADEYQDGZgDGcADGdADIYwDKZADLfgXNdxvSdwDTdw/aewDakADccgDcgQDckQDebgDgeQDgmQDidQDkgQDkhgDudgDwgwLwrwDymgDzph/4ngL6gQD/hAH/hQP/kQ//kgX/khH/lBX/mQf/mhf/oAv/pw//rAv/rA3/rBv/rR3/rwP/sh3/tBP/tx3/uA3/uB//yCH/1kf/3lv/3mv/32H/4GX/4VP////1MlzfAAAAA3RSTlMAAAD6dsTeAAAB+klEQVR4AXWS/ZtKQRiG8Si8SyanqPUR4V1il93sECaxG0M+1Ma22mV3Ea2PhOgsf7yZqVzF6fzQnOu973meOVezY9wDAGOh5ftmWWA8xsLKJ30lM2LAzvuvvLCWl8t1OZyBFKCqgONLawnOtEpzkxjiqkrFZIxh+FOdmE7kWxfmBgkAiIqpFIxGEKvf8tOcb7+Upybg8O5K7HsBiBRTxvvQXly9dXaEz0+pSJEjgEfotkv5Z+8eHO+s6PqsmAAMz00BQMQYRNtassz8/rFoF8vR+7ad5jeiCD+XpZAvfq1z85qY7HFXssuuSJFsGf58q86iqYXlAwHxL3cJoJYJrr1nPnmiIw72OSz/evVh/CJBNFl235oQ5u4xwlDAUhyIK2qx9LeYJYta1VNUaAwCNmOwNaR5/bHl8p6vyfMqR70eT56zHAiLsBQsmNX2I1dwRr1xQs7ysq9LIhsW/Oqz/5FIeTPngUoB7gRW8MuMrBC6U75znwDyzG6g92c6S5s6mIQDRDD7gcIMANVwxl+Ls7xXsTVeA4eOAMnc6JUqXxc9+KQQCt3ewL8GfM0WAhA3QxCHAUQxzMvaICEA3Gj0DzBaYQ9aa8ImJIDoPILuezpthUsbNj6H/7nahF322G5EA4TTaSfsd/EBvN+LywHpjvfnCOCj82AePP8DsJ5VcL/hY14AAAAASUVORK5CYII=",
  big_kobold: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAflBMVEUAAAAAAAAlATolJSUpKSk6Ojo+AWE+Pj5IPTdQUFBURT9jNxBjY2NrWlJ0AAB/RhWIc2SIiIiJOMeVVBuag3KampqfYiufn5+kAQCxsbHBgkfBl4LFxcXVuKDWAADY2NjdDA7otZ7o6Ojvhuzw8PD39/f7+/v/ICv//db///+wEWHzAAAAAXRSTlMAQObYZgAAAWpJREFUeNp1kI1SozAUhT1CzMb8mZJWsCFaq255/xfcE3bKNFAPQ4bc7+MG7kMdYFVY8wA6zK9cAjLsdviFi7Yt/DzzbR+MY4xRXvnpGFHzOEZrbZTNf+F4OuIWQ/Ltj78fVhqJbQecz2cbLXlspbmecStcHi87G5lxETpdCRixe7Zj4aIA6DddfQPz9MdIcrn/5EYfyOsjHi2pMv1+ml6NUl0tWEYqJWV2aRqMYC/y+gjZO1668+9GqDWnMe19YA6D1z1HjurlsiY/pDQM5hBy7654mSnQSp+m6TPtg684hZfjqdNaKkfhqwguYwY3HfRbp5pM4acIee4AsRiM1g2Qvqf3+YgMFlVbD5I1k75TMgcfPLEgXwU+pBTI2U5sOYVeB0Jd5tXgDnfZkWWXuZKDqQXy2Sgrrtl24CVc4+4JJLzhRPmDe4ISDdCzqPi04RSWKhqhmhUvVQUskxVqxS/qogSqTd1+zt3dP/Q+Guk1bbcLAAAAAElFTkSuQmCC",
  ogre: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAP1BMVEXvyGsAAAAwMDBAEABgGABkOx2AAACAIACFUB2KUDmgAACgUFClb161bwDKj3LQ0NDVjADgqADlooL/tpH/069l/2LMAAAAAXRSTlMAQObYZgAAATpJREFUeAF9kuGO4joYQ/FSGLzjeFN33v9Zb7+0rG7EwqE/Ip2DFam9TGDn8gFk+9nwyedn24JPA7sP3vtvbvyO8TawNyfCW/97J9Y/C0C5D0wKrzqR73/u+yPKAmbvxKIHlK34/wlSXuZApuLEmD01Kmmc7ST462uYTFzER+FngUgiIJaWRw3tWDhvaACkCrtyAqDzDBwClJwdV0JcoNTCWYjg8EUVGMN8XlNMKPv0tgDq9OeGtUg+kK7A84oDUNKyUNIvSbxeoZiYvsXWl6+vhTvLcm2gOb0P3NqjisHSbw3EHLTeH2tr5fdjaxhMA+xtPX790W9zgNZaZ1+5FuydbfJVjP+zrfU8uqaBArSayIaVco9nX0GyisAIHL0MyB4edZReBnS8gDPW+ODmQCJxrlE7c4CD6XzyH88yGFL+7wv6AAAAAElFTkSuQmCC",
  orc_knight: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAQlBMVEX///8AAAAEAgAiMTkuQUsvLy81NTU7U2BQUFBfAABiRzpiiJ1tbW1+WUh/AQCYsb6kdV7JjnLW4OXf39/koYL/AwKl5AhJAAAAAXRSTlMAQObYZgAAAUhJREFUeNp9k42OpDAMg89TJu5iuimZ3fd/1UvnhMQUdAZVivxhU37+fAhDp3kW6CLxHz9EFeLeBVpzslC8a8LPz/71K379Pp19z+lC9Naf3J/P7mytA9eOV9/3/bXv7K3d3MYjie/Uq/eWl+PiRxI9q/t3W9N3zID747H2nvFrIeIGYKHW9e0vIScmX4WeUFkoLpI7poRSyPDhkMWkSwmqUREhcoGZ2+xvdTN6kFlTkqgbPvyo24hwLnkbAHIUTu/J5dXGKlIlHZz2AY1gGUgPl1iSABkHgXBSBIs4SLIgiZAOgBIAqvjIMh/EZwfepaW6B2UmDQvTs0RutHrIquWJNK++bTUPey+YPjsEahIYGkRgIqAYwf9Ua0gz4E4zHES4rh0UDtFDk58dIg6JY5h2QZ0jyNkPd/JIBcM5AdLpIrjkuP74t9Nf7hsQmDWiu9YAAAAASUVORK5CYII=",
  orc_wizard: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAWlBMVEUAAAAAAAAlAiUmDiYvAC8vLy8yAzE/AT8/HwFGNAJOBEtfLwJfRwNgAl9iRzppB2d+WUh/AQB/PwN/XwWABH6DCoCfdwigBp6kdV60EbC/AgHJjnLf39/koYL2zKZmAAAAAXRSTlMAQObYZgAAAWdJREFUeNqFk4tugzAMReet0NSQBxSDqdv//83dpGUipdJcCSGfE+cmqF9VEaruvHG1x4P+4WaVUU1PT0Ep14EDNTczuzVavKOhSRuzBjwl/ZSV7mp2N8tCxlSqNoZhuIP/FN5f5+s8045H0sdDhxQkok0XGP2F9hNWwfKwSmzRLkZfceE1hLBGcCqN6/y2PkZJ4ILfK0UlgHNMa8arMIHXA9BnCMIRxW1Lhx3Q5RiywFEQttoBnIVbMBwBoiRNuwlEhMML+swsLUqCaf83gdQ0IR27bhzxYEfcBu3VNiHzsDLxOBblmxAx9KabkBOREJ2Zx469xxHR7TXtMuTH6eyRwUfvjtdUtJOfPNYvkycUOFHNz5OfeNoLqE/CghT5HisBHDtAWPyEEWXCQZiwfxEW7z7t4D1YEWDgU1Y4G4TZEBBii3D8Wy6en7grE2qOa6ZX5W9Ch2vqOueei8i5rstCXbvQ5W3jv8KlHFMOTkhnAAAAAElFTkSuQmCC",
  mummy: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACdklEQVRYhd2XPXLbMBCFPyUpXaRE5dA3wA3MkkfQpBGO4FKd6U6lbhCoybBOhc5Q6wpHoDuUKVylQQoSMOmfEUBrUmRnONJgxH0P+94uIPjPIpS+8OmMwKHvumISqzMAMwJTrdfnyJkP3ioV+q4LersNLCg/fIBt33XBOkfvPQCVEKjdbpoz5OT/shA/WOfYNA0AR+eohCBYy6qukyzVen2SxFIC9N5zMIZKiOcqrNcEa3n0PtsPSyRIO9TGEP54ri7ltPzRC1m5SwkEu99jx5LXUgJDNSohFnVBsQTXUlIJgTYG6xwAtZT8+KVnRMfPs0oQWqWS5rdKcaefQWspuX8w3P00BGs5Okd9c3MSo4iA3m5nbbdpGh69RxtDLSXXoySrus7OXzSKN01DJQQw6H50LskQu2IEX+WAFxM4GJN6v5aS6SCKJEojl0Cw+z1A0r33HjVWpJYydUJp5HogBGs5GJOAgVSBNpLqOnrvs8wXI1uC42T02lH76SyAoSr3DyY3JVAwB3rv6c2QPJY8PjEqIbi6lEA+iZwKpPZTux2VEGn3Uffb70Nlvk3OhXMSmBksAkznwbDrwaCqadDbLWTeD7II3Co1A4xGa7WeydBq/bI1w4tnGYE7rZPTgVfGm7bfiXZ8RSKHwKrVOt37YicABGvTLIgxJZoTuV2wGm83HMa5H7/DfAKON6F387xcKBnF6eU4/9Vu92zK+c04C7yUADDXH4aSq6ZJpErAFxGwzlFLSatUWou7nq7lgJcSCO3Yjta5mdniGfCG+0+eB59zwfuu4/fTE18vLuIFNIFb516t54Bn/yiSeOfdtwbMP/t79uH4C/RtYgX6Gr3KAAAAAElFTkSuQmCCAAAAAElFTkSuQmCC",
  wraith: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACbElEQVRYhe2WW5HeMAyFTzoFYAiGIAiGIAiGYAiBYAiGEAiGIAiGIAbpQ1euc9t/8286femZyeRmS19O5AvwX/9Y0xNBYoyrXasqAGBZli/F/hYAM6/e+550r1LKy/hvAVhi4M8XX0G8cuLHE8n3Gp8z83ra6EM/7wJYghBCv6+1wjkHVb1dA7cBnHNoraGUgmVZwMwAAHNlL2ZenXMAzmviVg1YtaeUkFLqADFGLMvS26kqnHP9GJ/vHToFGIfVqFLKFGNcRQS1VrTW+jsR2UCYRghVhYhARCZmXpdlmQ4Alnwkt87jeZ5niAgAgJkRQkAppb8bAUwppf7+1IEY46qquBrbI4RzrieMMW7azfN8gBiTj+83ACLSrc85b5LuE1hA4HcBppR6IVphjrFijCildNhSCoho6qNARFajMnuJ6NSBEdB7j3mekXPuNRFCADNjnmeo6sEhIrp2gIgmEVmt037SyTlvvt7aGJBp78IIT0R9SG4cIKJDUbbW4L3vE40Nv1EjlLlgz2qtUwih/9q9q6fDkIgOw/CzRQfAAYqZD8lVFUQEVf18HjiDEJFNMEvaWutn7z1qrQC2rhhIrXWyteElwBUEM6+qeloLowtjDdRap+H5+wDe+94xhLDmnHuRttaQUgIzn86IewiL8+liJCLTCDGucLXWKaW02rX9HlslDWJMfKaX+wERuQxwFpyIJoMwsJPa6f2+tCH5DGKvj2Ibrx/Zd54OzTGpne2waX3/9X8FYA8CADnnZxK/q8GFqwPAG5vSF9okIKK+Z7hq+0yBDF90V08AfOtfP/0L7uq4J3xTd13oeX8Bqmy3eNpPLuYAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  troll: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADl0lEQVRYha2XK5IjORCGP28MaGjYUHBhHSGXLfQRBAf2EXSEhgMFBxouzL2BYUPBhobDtCBTJalctnsjJiMqVCqllH++VfCUtEKp6zSJz3NNgfpg42+iuFTIJjQu1QDlGl+pcqSm0EdH+HtA2YFay09q+UltlhjnIwjQatbRCml+f0B/3BOeCgcoAISPChFAB65C/kzIEfQKKQgkgfhmfEkgJUjqbvufFF+bVrUSXZPVHbki4cYNoM4jrrkOo+6CONyzgF5B3yqUf0lZ5vW4QH4DCvE1UX6BHCHJAvnkXApIH5NbhbQrcwfFoLkE0zougyWiax27xhJc42g8cfFv4jHR9nbajQGjvyCbhqhrkheg+BgILwDBNIxn44tn5zkan0ZXSNwiM90FIO86zMIwhvVr/kwmTDKUq61dPk3Q8gGiBjxeDVhK7qKeGY/9kaSSkkV2Pvq3dY3uZ7qgxrd8wOU7LZOIF8jvnddj4YELBiH5BOgB9GDpBZM5Jdv88tk+mHDJBkC0C26p6fQFCzgIdOBNtUe1ghQIRwMq2Viuv2y8/A3LP3B88VgKDl4OXwNQmllHAFrXohTPvt6AimlNAa7A5WCZUpz/amC/lpJjYdmQBE8tf6YUTT39tnvWfmKB+DgGYCgsW2wRtJhGYyDmEyw/3AVh/7yUfJLqEwDqASPcapNBgh0Yz5bz8Wrfjy9w+dN8Px0nrK5ISk+pR5TkjhuGbtfMvbwO5o0+n2iollqBJxZYswCL9HnRTBnPFlRSLPXim68Xs8QovINf3fAEQHq81sDlxX3eolrsUdkRPu99AEDr6qNybTvng+LZgzSYz/tef8pGeAIN0xH7AOw242ZXPzPSNUx1so5kLOdxQELPjGXvfG9auwAGLTUCekDLYS4a4v3h1LsgJ2jatjiQAhz7tihYapbWlPaE61QodgEm8XtAHKO9P+N9cFyLejN2C1hV88C7QTYIV4/+i2kjuvE//T4Yz54J986bhGu/tdy1QOr3vrXUpln79dneDx9ZICVadxqE7TQK7ampwX18Tzu1+kBgvk2vNNwHYpOZTHDc4x+o9Qct93nWdj3ukxu2OQvuC3aTXXtNWD6eoLxB1F4myz7vhiONnXEuszPFxbUvHqz0i8qGvtnBW/9PZMHYbj/p3UYNrJ1togTZx7h4l7ww1YNGN3Lj7t+LR3GL9u14A3ZYly3vzflf+Ut59l+3PeMR/428/wCehDy4D+7RwwAAAABJRU5ErkJgggAAAABJRU5ErkJggg==",
  harpy: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH2gEHFSgnPXz+ugAABDRJREFUWMPNl19oW1Ucxz83TWhT07J07XRZ5+YQQVpBbdL5mAaZ9Gmd7EWIs6MYBB/2JpUiXB+GRRha2EszxoIOx6BgfRC1lDX452FbHioOu4r0z9Zmm+1cSCpJF9frQ+49Offm3ttU9+APDrn3nHN/3+/v9/v+Tu6F/6Fp+jBbCkgPwiCQpvL7GMxjBY9FAsQigQqRlA6GDhhNaRyU5tISqSiQGrAGsvPoY5GAFosENEFA1Uc1M9UxqK/VZqTqYwcZ0PTIq3ZQH6qDoxQaKhrpSokSiYTJj8iki3mdFmKRAFeiGxqgGHPZue/Eeuj516qbVbREIqE4+rlu9mOXAcE61O5zZBsa/sj0m5m5aFpPJpP/TYQGuBOJ7Oj7lAsrLI+8CUC4L14XiFspPDVRdngFCfHgYCV95cIKn/QO2YLo0Zsy6ZZNRwIyCZPYgAO9Q7zz/accqCWhqKpak0lbS1selDUQavdxY6HEkcOVKLJrf4uNF795AMDytfN2BACI9wftS7deBuDK9Q2sYvTatp+UiX37GwGIvPwEA0c/xNfSWReoNZMGibpKYJgBDjDQ9waGDpavnQdgbKSTUIe3tmQS+NTVDVcx1hDoPtTE1NUNAX5h4j7R8DFyhRLkbzI3+wO51SV+/vIDouFjYp9MQgbft40QPXbCaWtt4MLEfXF/Z60AQK5QovDXJpADcmJeJmGXjR13gWwDR3YxfOYyvy2tc2etwAs9h8X18JnLrs/Ozhf5+qe8KUCjDOPj46ILRAfIgvkz/4jZ+SJjI508yD9icirHV5+fBaBYqkTuf7jK0XfPcvL4bgBWb28KHx9/tmbqsnh/kBsLJdpaG0zd4JVBQ+0+odbZ+SKAcur0Ss0J5m9qqVw8ROjk5PHdBqi1xXdeAoOhqqqoqqqoqqoAyoHeIXw+L7nVJcjfZHLmkoj+1OkVGVhBjdatAUUHNJl8skn3Suilt9jVUmJy5lJFoH+U6T7UxLP7G+U201DT8juCYhxkrhnIrpdtTyuryeCGvdLdzK27ZWKRgHE41ZSurbXBnYCceqc3pnh/kKl0XoBvbW7VtJ64Tz2GNnQqyS+/Ftna3DLNvd7Xyq27ZTJzRVMWstnsvyOQyWRkcO29Ex0ABPVUeho9YoQ6vHgaPc7/qA5a81gWFZlxOBwWqR9++0kBZJAYPXev6qjRw8S3OZ5+yv49IJvNkslkFKvGvHZ9m0wmNbv5vXt8rN7eRFK0MnrunjY20mkSZM0fUygkZ1Rx/S6wUa9mgPd0NVdPuBcrpyhAT1cze/f4+F06CQH0khn+tHA4rNXzRWQ7fvziubrXY5GAFu8PavH+oNP+7cEXp/3SdZfNepdlj1/bLgg3EpobCTfni9P+uvY5EVAs33HWexan/YLlM68WTawXp7uABdO8sd+y1wnHWQ9yZPZl8dcbsav9A19VHtYbytH2AAAAAElFTkSuQmCC",
  naga: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADTklEQVRYhb2XzUsbQRjGfym9G0gQTPzYQ1QoCpGS3oQUPLT1Eq9SbG491vYg9GKT9tZDe/cktM01J2kOQhcEDw1iSkTQeoiJSSEkMP4D3R52Z7Jf0ey29IVhPnbmfZ73mXdmdyOEM8PVj4T0E2qhkcvlABBCAKDremgSd8IsEkLQaDQQQiCEIJ1Og1eVkexuwPlGLpej/O4ZtJoAPHxfVkqEscAKCCEofSoDUNKP+La1RjQaDa1CKAKzE3GYmia7kAq6/K8JRGq1GslYFIBEfIySfvRfCRgAyY1taDUp6UecX3X/KgeCHB3jy9YG2YUUifiYGuz0rmn3BclYlHZf8ODlh0B+R1XAMOplsgsp9JMLqmeXDnAwtyMzP8P3j68gQDIGOoaJpUXWlxah1aTTuyaxtEhCPrSOZVALlgOtpgJv98Wgf1w3VZmavkkFX1VGIWAY9bICluA/f/U8fVpNmJr29UFBkXAQGVmBTu+ancqhAju/6tLuC0e/07sGUMfUZhEKQAHIKiIjEVDRS8usLJNdSFF4/ZzM/AzJWJTZiTjFUsWx8M36IweQIqEB6QGJm5LQMOplOsd1AHYqhxRLFVYz99irnrJqZb892p3KIQXriM5Njg/3bBNomAIGoMD1kwsVYWZlmbnJcTIry2TmZ2j3BXvVUwCKpYq6GYde0xpgu7f8FDBlB2g1KXz+KsEjgFHdP+D8qkt1/8DX//lV93YCNvPfAmvPXeCAqYCqW02qZ5cUT537v569rxJSBgXArlVqKJ++BORN5wYHiPTXaMfe0jmuk/y9DT+cawtPHwNmPijwPGbkuzjk9zj3MPY+N9gFGpjHSbfaNRUVMnGTG9vmQBrYtOYO5im/w06BHzFDHSMsh5pFwG7uKzlnzZFEXb6DfZJpFnDW6rvBIRJ58sJ55co1mr/Lkd+G5G2ADatoQN5LAhllHnf0pq8QBAZy61aRYzq+0gKmUg2r7byd1TthdAINBlHLto7navVdp+HJfkkkGAHNVcvxTQcJs+R95vrY6EnoBtdwJmQaM+M1GzFZBPYccFigb0JPVLLO4twabM9rmPuv/wsCdiC/2g0MQyMPQ8AkAabcUQaJJdv2sVuAJX7Y3+pQP6J2YNn4A74LhhwjfS9JAAAAAElFTkSuQmCCAAAAAElFTkSuQmCC",
  basilisk: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAMFBMVEUAAAAAAAAmByYmOCYwHxBAD0BAVUBNNiBOFU5OZU5cQyl1kXWHZkG9vT/6/wD///9nr6m9AAAAAXRSTlMAQObYZgAAAR9JREFUeNqlktmOhTAMQwkphnTh/z/3uqHqwpVmRhoDD62P3ahi+7PkN/+SfwP7NyFjS9K1J3n7xaT7dl3WliM0NuQ26pav/ABu+gSWvE6AWc42NTLv/gByjOEBpLYzvwJACIB4VCQVewOK4wB36NKkS389Qq9DjW6iKqGm68i8KKaq6e1834BV4GFc9BfA4v6kidS84dVgObYGg1EA1iHtDCTQIEVVkgnIvCmm+SqMaRVVG4RYDIEVaCUKoUxlGiHnM7IAdP18CjKPcHpFuwKkJEVnIOenAo6wnZ8CIn2EM1DnqdbrSRQUaQA3n0N8dvoQqsgEdIGAur/x6b9D6T6YVMDrH9Xd3uDZUe8+2Q4UbdFRvznLpZ/ao0PO/rD8AFKVDOWiVfMTAAAAAElFTkSuQmCC",
  bear: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAIVBMVEUAAAAAAAAQEBAgICAwMDBAQEBQUFBgYGBwcHCQkJDBjqKqXqK4AAAAAXRSTlMAQObYZgAAAOJJREFUeAHt0O1KxUAMhGGz80623v8Nm8RSeqoo/nfOxy7M0wT69vf8Jyo/1pn7iMm3fXrXp8we9rXPnfYu4rrufIiwZIvDrhF2HhlP0IQZk07vEo/eTujx9ueyFyCRSPSI7CVZNO7gXa6fcG7jQTcQQk4QOI1xZee+RCx1I5AN8007b2CRGyRbM6cRL0CAlhGnwDcRYnnTSiNmkn0HSBHIC01CegUmxi2JimLJ+ALYMU5qhUqvfuYJzCwiKtDH9aId56IQ6l7neYLReIC6oPsLJEdU0n3kFAln3zmvz/+pf80HAtEG8H+e818AAAAASUVORK5CYII=",
  clay_golem: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACyElEQVRYha1XPYsaURQ9zwRSLFkL0WIxmqQQLJJgI2y3P0LBXyDaaBoLK7GysIk2Lv4Cwf0R2wlhIaTZgEVgh8Fihilc2SykmRRyX+5cZ8Z5JgcGhnn33XPu13uqYIjb2y9+2Hd3vUW9OVCm/ow2RJH/i4iUibG73saubTzPxB0A4KWJ8cbzgLUxRyyMMkCoNweoNwcH76dAZ4DX9+rqc2wdl/Nh6PspSElyd73FZNSJbbZTMBl1/OV8eOA3JcnjGqnbnypaz5bS+gH2/dHtT0Mzx4nlJCn6IMkvMpnASE1GHd+2HOQLOXy6fB+YiGwpje+rn7AtBwAwni30vuV86Eu/2VJal1n12g0/X8hpAyIhY46N54GLIHDyfCEH23Iwni0URU4CaC/5rTcHSgFAr93QaSED2kTGPAoikwgTLkvKRWgBXAQ54Zng6eOZ4KhWykdJpfjxbKECTdOqFf3X2ctANNKBLEsYYRiIeOeuAADXNw/7HggzJiFUT5mJJEQyYiLm5JECCLIsAAL9EdULHDJiiUQ3F58U23Ii6y3rm8R34qtTiggDX//vAqSIKJhmweg6pqak9yhiEyTOgLyg4spgkoVEGZiMOr48EeNGVPQKCQ8VcvQHiSSn6GzLwc5dodufKvp2kcnElcJnT3IBBBn5zl3p2R7PFsq2HGw8D9VKGbblJO6JRAK+fvuh38nx9c0DwKIZzxZaaL6Q00+v3ZDuAqVI1AOysfixykXI65YLD7FXRwVQ5/MLKC61JFSKbdWKlLEDHC0B1VaiVStGiqhWyroEdLsyKLAyvIgipujP02ewLQeP2yc8bp8AAK/O3uD3Lxt398E/Kh9K73CePsPu+VmLJ/uPb3e4u98ejGJkCfiMJz31du4KNg4i5j3jI2ET+lLEMXJgPxmtWvRaGOKOST9khAD8HbkIP3H/KQ74jt0FRs5OwR9R8rwl4gbrIAAAAABJRU5ErkJgggAAAABJRU5ErkJggg==",
  minotaur: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADKUlEQVRYhbVXv2/TQBT+HIEUsdQSUdSCBDdQsSAxUTHBLVlRJ5ZKiWFkgXYolZAgYooylP4Jp0hdOmXvYhhhYeiC0uGIlLZDItlbNzM47/p8PttJgU+yznVP7/ve9979iIcKKKUSIQSEEOabEMKj92AViajPv89HfZmOXQ0zrwiVE7TWyXzkAlKCpwKcXNSvyEUdkD+r49+oIidiLoAj6AFqL30Po6wLXYFEqtDMlVLmBBUK+P5lx2Teqo3xvLkCADibxji2tAQ9QPeuiIMeEHYBqcJM6XhCJMZpEZHfve1jdO8ZtNboNGMjAAA+7H40thNEHRBzN9ReKsAGCdJaQ0rp5QRwcgC401jB11uPsT7+ZuYQufRT26WfZk71pxEAZE/lBAghjICaywFODiBDHp6cmvdN7ZvGs1cACeo0Y3SaMVq1MTrNGHZPlTYh2Q0Ak1mUillr4Hj+7Z0fQV8CB5Fv3om8/2kHTx7eN3EomVZtjBFraGcJyAFOTMEIr16/BZDNnATY5BzUU0EQuJuQBJDiKpAQAHjzfgdcvI07jRUjaDKLsLG9n29CAJgMPidFAapgZ0xk3MGzaWwEOHtgMoucmbiC28JskT9+/S6N4VwFG9v7XnhyisksMj1QhrNpnHlssrKyFK6Crf7AA4DD3bazHHZgLpQsD09Osb7WKBVfeVgQDnfbSVWw0fk08zfNd9V/dD7FVn9Qvg9wbPUHXpkbACAfPSiNQeQcCztACFaRAFfrf/1lOx3n2ZbVm8gpe6BiJywCHUKiDoRHg3QDardz81w9YpdpKQfo9kOHD5AeRiRKXwKtdtYRGzx74JoO0LZLhxDfhkdHA4g6MHqRd8QB907oAmXPr10khsN26KYlhGe/tAAi4KeefSHhI3dGXeRCesA1S8DBAwerbhFcpI2lBfCsQscu7SrPcJqfR3CeBS6oi9Qyfu2uEkmPn0/TlH5hAQ5Bhd/sRg1LNr+lBKgLeJvdg8p5vEldZbq2gOFwmEgpUSaCXLCX5z8RQOA/Nlwoa9K/RbLIo5RKwjB0/S+HZR3wFnjg+z5838dwOFwo4P9A0b0hx/cHKHao2mJpXBkAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  cyclops: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAP1BMVEUAAAAAAAAxCgNQEwhXk/daMClcWm13PDGNipSiclilb163YiS5scDKj3LR2uDlooLolkbouFvw+f//tpH/zqPPhMxyAAAAAXRSTlMAQObYZgAAAWlJREFUeAF1kwFv4jAUgzGlSeWd57H0///We060Cu0OI/TS+JOfBertVYhu7wWPYb1lAJ9nCOq/CNRHyTZl/UMg/llaEcO/FsFS3z8fwONTg3K+LwTGaXH39+PxnQjZo7IuAq6nAB5j+RrZdmUghklz32nLnAFXBGg7hFYA5yESFqCy5dNk70xDh8vEVcFULVXnqudOBZoEmGPXzBzVrmZFzeILkMWediNdQqtzXyfEL7Lv6JOj7JrinmLF44aQrDkLlliDBBgkgNMgUb381V/Ez6+DVDBnl217Pr8U8f4DqIAZEOD+/Cht23a/B0g7ExOcZVuL/7yX2tFmRJxwzGh1+/H1bMdx/KlPoqOAUgfavA5Vs9SA4VmyiFKbCrGQIxEeiB+hqWiVGc2garHsBRzzL+IClpZ7JTgbGWNlHPj9zjgAsOzeO6IXgJKFJfQIeGUge/ACTNOvADSGk/BbVwMODfW3LzeiN+5fxF0eF+AudpMAAAAASUVORK5CYII=",
  hill_giant: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAP1BMVEUAAAAAAAAoGhUxCgNCGAdLS0tOMyhPMyBQEwhkJApmRzFtCgpzTT13d3eBMA+fa1mfpabMj3rgpIzrvK/9xaM6gY8dAAAAAXRSTlMAQObYZgAAAXFJREFUeAF1kIFy4jAQQ6vadQjdRuzm/v9bT8KE9IbjOeOE1Rttpx+/APToegNwXbAsuvBGUKZzXRb+VwGvS1alOpjEaz9jsGrfuTDk4d8WJBmfIypHXCvUFEz8zveUkK6oSmamP3Cu1y8LWcI5tWuvxFNIzyPj+ztSQrhAnALdykdBBGtCHAUPI8a4p2lPfj4EZ4OaMnyrPsfd4zTAu+C1Wc73UlXq5yEEyc9wJamY0mPYTU5Bi4cEMkKarGDcV2YWZkPEpwa78dgmwooFuLrg8hKHAThPC3pLiHSiawptCjwaAo2Zt9tPmmit4UOlGRaiKtDb5XL7EpfLpYlVQt4bZIjee2vOb81s69ZRRoJBXzedr5+bXzrbtqKynv/stZttnTiWgCw8CyiZfe2Ku55Nnx1H7Ib6IyM895k8YzekF4ajGUuTcIJMC45mHBEQpxBkEpjVQBjgdEA1BJ5E+pwCWJVJvHL8BVEsjsfoFZh36V/RqCC3FZtRXgAAAABJRU5ErkJggg==",
  death_knight: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAABRFBMVEUAAAAV1dUV1doU6+9V8vMAAAAFDQ0QEBAQExMRISETFRUTFhYTKSkT/P8UFRUUKSkUKioVFRUVKysW19oW7e8YGhoYHBwYuLoZ3uAaHBwaqasa09UbGxsbn6EcjpAdHx8dOzseHx8fICAfPD0faGkfw8UgICAgY2Ug298hISEhVlciQ0QjREUjr7AmKSknJycoTk4sLCwsgYEtLS0tgYItur8uLi4vLy8vMRExrrMyYmIzZmc0Y2Q0ZGQ2NjY8PT0+kJY/Pz9EdXxHR0dHeoFJSUlXV1dZWVlqampxcXF3JRd5eXl8fHx+KBqAJRyNPR2SJh6UlJSaKCKhoaGkQiCoJySwsLCzJye0RiS2Kia2yU2/RyfCSybGxsbXLzPX19fjUS/liFvoUzDsNkLvi1/0VDT2WDT/QU7/YEH/aUv/p4X///8vKpnkAAAABXRSTlMAMWCcr1m2KToAAAHKSURBVHjabdBpc9MwEAZgx+0iNqUmUrkRVzhVDCUcXQ5hCNiikHCkgQAD5r4K//87q5qOkePXXzzaZ1c7iloTtx/Gi3W5PQtRBABR3FlciOchn8cRjKePwMtOsxxX/ePyjxf+urhJ/BFMV/mD6roQxDzUT/gI0zGy6MScury9Fg9Icfp4jKvH/QxGwfocWD6WImJ65FYKPIJ7dshOf77Plqa8cSE9fxDmnw7OnlmxJjOZXV65cx/81nxcA3hxxVo9Kl05stftoRyaDwW7vl866jLnsv6r07evfnvJawR1uHfux+aBUUnl6PCnX78fnGxsAUNjpOgb4vQFyfwihP2kh1qiyDY2HmYMzN38fwCzmdNa7ll6+mUwGHzd3I1kGmDo+5VIxNbWTykSmskm0IgoDBWCU9DMydwGAlLkAcLIgiONG6pwiagCxEXOupBKqRaAQvTXia6dSJLeHMhRKdz/vNsVIll63d3bawXJ+5sCsfvm8wfsKdsG3j45xeLZu8sClfWirqfIkUVGDDJaY8AjIBjgRUFk2NGaRGwFmnsVD9KSBzGA+gYPyEy0YYC6CAELH3ITR2JbTgoTgAoRaS2gssYAh0Eg/iX8/QtG90d5EZkYKwAAAABJRU5ErkJggg==",
  lich: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAC20lEQVRYhaVXUbHjMAzcvDkAhiAIgWAIgWAIgfAgFIIgBIIg+DEwhDDQfVzlUVzbTe/tTKZNbEurlaw4C34Hbe6XTw34BQoARIRSyh1jGmOsN6WUu+su+DJjqgpVxXEcSClVQiMQEVJKlTARfeK3a1BzzkpEehyHEtGQABEpM6uIaClFRcTmT0nPoKpanaeUpgQAKBFpKUWJSInozpouLAX4+fnBvu+3pfz+/kaMESJSf0MIwH+qoCklzTlrSumOlCoimlJSEakpWNf14zRcdsG+7xAR5JzbsYtzU4mZUUqBiEBEAAAhBFs/s9ElAAD6eDyw7/tosRIRiAjneeI8zzoQQkAIAaUUhBBARDiO4y2Jr9lg63xdVwBAjBHneVanIQSc5wkiqs5LKXjOn6bkLoFL02Fm6xXYtg3bttVCBFCVMVIzEn/aB96ROV/XFURUc5tSqs5ExDogAGBd1zrP1CAiiIiik46uAo51jdyiKqWAmSvRGCNSSkgpIcaInHOd62tllA6vgDIzHo9HjcTnt1WJmWuh+XGfCiNuijzVuShxSYGI1AYDwBrLRQGbF2NEKQXbtlVlgH/18XSglrZt25Bz9tuzwqdgYeaXaH1B+TEzJiI4jqP2Aw8jZYXa67KfbMMuvEojPPsBALzUwgsBH6WPulWmrQ2rF1fAi6mUc76Q8LilgN8B3qH/bf8brHkZ2jbfJWCOfIT+tGPRtiRH6bDnvRNTS2CxbdRK3sKnxtLRI2ZzvHoeL53QG/+UQAfLc98Dg5dSlwCA6TnPnPnIJ8Snb8MhASMxM9RG7l4+Lx1vhHe7YHHXFIM0aOf6iMAUo1oJIbxsv4bUnMCkCNUcWMSj1n0XPQJLSsleKp7ti3xtl5x1Tm/f30yLsON8AaBtg+o1pd9CmXlUPMrM/kPkcnXWDQsQuF+EJpsycz2Gt93tefQCM1sKezbePzRnnfH6TTDoEeqbl5sz9PMXC4QaN+cDkFgAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  iron_golem: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADFUlEQVRYhcVXu5EdIRDsVZ0hQwaGDJkTAiFMCIRACCgDlMEqgw2BEAiBEAgBU8ZVjYzbQezv/c5QV726uwfM9DTz4YD/jOmVQyEEsdaitYbWGmKML9kBgC+vOh/hvZdXCTyNEIIIIDlnEUAEkM8QOFXAOSfOuUujv+cZAPArRvwMAa21w54Yo5RS5J6tAwHnnBhjYIwBMwsR9cMxRiEi1FqRUgKA7pyZJcYowMeV6PdE1NfvEmBmMcYghABjDLz3MMaAiGQ0mnNGzhkpJZRSNga991Jr3Qd1JQDeLlcukFLqBrUKaq1wziHnDCICEZ1ey0sEVgX63/M8I4Sw2eOcQynl1Kkxpv9kZsk5b0r2aQXUoRrNOW/WVJVHcVUFPckA9Ohaa1iWBcy8caJrmqBnKKWcrm0UyDlPzCzeexARYoxdwkdBRD0XlmXpgTAzaq0HEocrqLViWRY4525GdIU1KScAUmtFjLHbXL+/JrDWPUII/Z710JrpvZb3V6DQsqy1TkQkMUYAPVFvJ6FKlHM+ZZtSmohINPHGmTA6Hs9Ya+GcgxLZo28eo5/n+ZKENisi2iSqTsd9hNpJY4xqc7NnQ0Dv21qrWXs6ZtUoM/fvrggTkTDzplzXRJ2AtQw1eu1y+/Z6YrRHpB9rLeZ5ll3PFyWntvdXcdoHtPzGQaRgZrHW9lmhKqzyg5l18Mhw5syNADc6odY/EYlKy8zCzL1RjbLWWkFEcM5hHFp3IF2Bew3HWivGmEOX1MrRTwgB3ntYa68i17kAYLgCZd0j//71cGgsO83osVHtSagq40Dao1/BfrG9f4UxBq21nqSacPegSunv3nuklHqbNm9/oK3r5qN0P9XmeYbmwBVqrSil9BF+FnV7/6fuTQLPDqJHQDuTlwTM259POaq1ngZQd0+FL8DHGD5s/vYDxpinp+GIRxTsSVhK6R2wlAJjzKbcXsHZy0gfL5rMnUBKacLQvT4DLb/xFQXgUAEApn0nPBs+L5FSEqOyw3V2P488Sqecs3jvT53sDa6Q3frVvqf+O75S4hnVDnv/AlA/JlwjYlYjAAAAAElFTkSuQmCCAAAAAElFTkSuQmCC",
  greater_naga: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADxklEQVRYhaWXP2gjRxTGfwrpb8HmIHKsE+YuB+EMSuEyeAMpTK6R24M47tIGFwdpfLLSpTFuXTmCuJVTxLg4yIjjrrA4skHh4JwUI9naBCORVYprX4rZ2dVKK+/K+QrNzM7Me9+8980fQTZkoi4TdblhfCbey3JerVYjZ9VqlUqlEn13XRfXdRNkxtq5UMgxRqrVKlprPM8DwHVdgiCIBpTLZbTWOI6DUiqv3fwEACyJcrlM87uv4LIHwGffNwmCICI3r/3MFIQh5+TkBM/zzMpXfzO9X/zDL083cRzHpgaASqUSper/Eih4nkeoAwCCIKC9/y8sl/AbyemVSgXXdXEcB8/zcpF4P4shgNY6IqG1ZmnBAaC4eIdj9RoAx3EigjYdnudlpiCvWKZWIacHHKvXXFxd89Obv6cm3EaQmSR+fLolIki/URc5PRA5PTD18Nv5/s74dkw7I6aQpYHIuXSauI/uA1As7eIPRviDEcUvd6FlBq09vMf5/g4ASinynAm5NGBR/GQ1clYs7cI6pq2AlenxeVKQNwIGlz3jzGIP/F4df6VOfxjAcikRhQnnqZHIQ0Ck04TLngn7St2QUJg60B8G/PHXwBBcLqXbiEkkiOSOgD8YcXj2iv4w4PjdFrWLDfrDIHJ+cXWNPxgBRNt0DIVC6FnFRHIRiFZvsfb5p7iP7lP79mvWHt5jacHhwQeL7B2fJSY+e7KRcGRJrE+QuEmEIgK0NuEcDi822Ds+4/Hax/zcfsPjYTC12sOzV9QW7wDw0Yd3U422AJ2xastORCFSQ/Q38XUrnaY5DzpNkdMDOd/fkWdPNuJ+iecxLTwRkKMxLaRFwIQdjPBWRpS3dsEoWtrPX3BxdU37+YvZ9BV0g/Su7kQ7PQVhzv3BiKXYOWA0EJWXPdpvu3TH899KtSj25wdg23wrzCTQfttlacGZcg7QWt3kQaOO/2uH4tYu7ybm+r06rMDL3/8EGgCigHLoXKXyS2ec9tYTAdHGqKiwvk1SI/1GPWpvh3NUclyEWduwQMoRqjA51JjtBCmKHtuyYMJt5xzFtm8FkYkI6LC9Pfu1HK3+KD2q+W9DjdHXeATstwlE0VPh+PVk/+2OYo0Rkgrb44aPYscJWJJdpsQXRWOu21CFJHTYboVOtmOjCdg9ryc7xojMHQFbWjItoJYkIZicJ1I1C7nfhCqFhC3tu4SwbnViiSuiNE0h74uo4N5AgrAO8WVj+1SG4bmeZHqsTCNh22XiFdtyFuY9FASifN+ILMfW/21Ppbn+gqc5tpX/ACrZ8qWQPms8AAAAAElFTkSuQmCCAAAAAElFTkSuQmCC",
  executioner: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADp0lEQVRYha2XLZbcOhCFP+UMCOywsOclGDYbZQdegmGg4bDRsIZagmGgdjAaFqgdPD020DvQA+2SJbfcHZA6p4//yrpXt35crfgzS7tr9Yd+j/yPH5QLGq2rm8b71rspXe+DHAXEmEO8ewRSBu66+kmMexIpeY9a/VNahfj4qAitRCrMQymN1hm4+/4dgPFyucO3sUhKG4mVyJ7E0z3wI2BrLX3fAxBCIMaItTY/N1pjvEcpdUtiZzdxLMEL4Cy1gIcQqhdjjIQQ8KvcZhwhRgBe39+rcJQqfHkArlrg1lpijMQY8d5nUFEFwMwz3fkMXcfbjx/w/NxUQAgcgVdmrWUcRwCGYci7ljB0XYfeKkaNlwtmnjcSdwhk1oXsZU0nuMr8bxzzjkMILMtS3TudTuWSCrYkBkBr0jUESQgkSRp5QeRdnVLf93RrRXw7WbTWhBCy5N9OFudcc4eiRHc+89++nCniW54LAQHVWhNjZBgGpmm6qmUMwzBU1SAq7MjcrPtcJOLTzimbxLbve7z3mYxzror7MAx0XZcJS3UUxHL4Yoz4ecav1QG7HChZzvOMtZYQQrUjAZNkk2sB2VtZGSGEnA9rl02tRlSZSG6tzeeyawEvgUWtZVlyQoqPvD+/vBB//wbanfCmyQBqmqbUAiiPslsh1Pc9y7LkNUs1xA4VWJZFFpL8UOv9FGOkW77SAxFY+KQfzjjnquSVPLlp1b9+Ma4+JYEq/vdMa33N+A5i3BSQ3QsJORcipZl1c0LgaJBomXLOpWEYgK3xSAkKuRJ8jX1Zabnsn1gbjZiUmIA1CKRS5j05IMn7R+Br40uA+gIw1O3zHng2iWnZJeW9aZqOwddviVjuA5JAi3OsTmn3gyJPHpiSkivB55eXm2nqCVDG+zTuvM04Vh+R8XKp8mSapqrMWraOaQm22t/Pk9tMZwxoDc/P26ezkFbI6J8/cc5x+vwEIH5+5sGjMaxeB1XvefO+Ocw2+4CRqaaYhmOMaGO2trt2stJ/D57PtOa19stWsy1UUOo2B2OMOOeqPtHomsBVciH6akxzIIWjTvjxQUqpSQLIcT+dTlV7Hfo+h0oUen1/h7e3JviegFLGbCrsrMx+OZblN3YdFD7G+4cT8Z5ATQLuqlASgdxas2XwTXrY8uKmCvYOtPJBAP+JEdlXMYRu/4igBd4y1c7aksQVpbpfznZCqhq6679iTeCbkyMSFZHGolmVojIe7frw4h6Jv2DNZPoflQSaFG/gHhEAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  fire_giant: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAOVBMVEUAAAAAAAAxCgM9BgY+LiZOBwdaQzhtCgqAWUCCSCmKFRWkDw+sXya3ERHJljLjvlzlZxPzqh7zyB4rT9IQAAAAAXRSTlMAQObYZgAAAYlJREFUeNplkQGWgyAMRI0YU4Ptgvc/7P4Eq7vPsVZhPpOA019JaJr6d9wv58iRmNfq0o7OuD/8lj6E9taTOS6EUetW3AdhLUOOzEmxpOHXN8JXq40pqIlfJjU3K7NrraVaVfO4s1DPAs3frJvdCYgS5qRVYkgBoDyjBOrpW81i1AGAyO2pus6zuptrBhDRRg/NWARxBihNDlnruQfzIN5klIILOwpRY5yQE1uMolZ0tOdFLSC6yB4TqIi/3AhRzpOttuhRqUB3RHJnetF5vLUJSYnixWiPZCBT9mwQ8D0ANQjJBpFqjEVgY6f4TlQtQpDlMqBNcp5BvGRzMskGkdJt/wImI8EVYP/8oM/ns+8AGFaZj2eCsmw73tC2nBGWJMJf1hUimG19rULpEEAIf31xQS080SKSJy5fPwWRCCgRlJA7II8eM5RBdHHZAGt+ImX+0u1mQn5jTSczKPFP4h6AyLD5NBL6A8Qxm5zCH8TNiJGgF+DKdQPjNJ2Eh64OlO9l5Zx66l7w1C+thxjfkfpMnQAAAABJRU5ErkJggg==",
  elf_knight: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAQlBMVEUAAAAAAAAgICAwMDBAQEBQUFBgYGBwcHCAgICQkJCgeHigoKCwsLDAAADAkJDAwMDQ0NDgwKDg4ODw8PD/06/////a5s2iAAAAAXRSTlMAQObYZgAAASVJREFUeNqNlNuOgzAMRDvOhaGmhCTL///qOhQVQclqhwcc5sjjAMrjIjQ9+kJd7MJf/jwbgp6PmnOeuy2Qc33l12vJuUcY8jM/c38Ii5jnZz8CbchnNMB0Y69rqouI1JqsxNVf06RaA2WtVJ3SirOfppGMEqirSiTH6dwDjCYfxQCxu4mXFvCmGERF6Z331zHBFJzI1kHEew3fgMOnA5zyTCAqHUTaLlQEcLSUwwZTdDBsi6BV9Opw7JGJzZc9QprPDwDlewXuEfTh8Ft+CNsKLFtEoXfbk4Ow1RtIFpEK4d3pe1m9A6OHHw3A7d9rAA3gB8DVV2sAa6HsAGUHyn+B2xEMYBdo/kbw1i/jsAPDWO58HeIOxEHL90vwTThVF2LT9Qz4BVyEDXCEMWjWAAAAAElFTkSuQmCC",
  orc_warlord: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAEJElEQVRYhaWXPWgcRxTHfxtSCFJEYCFOkYnWEJlwgXBNVKTRyUVYkkIJuAhrkDaFUqQwiiCCNL6ViwQkiIQLY5JmdaCrDFG6Q0W8KpzC1cmYS9ApYQ5k7nKcyVYu3EyKm52d+1rdyQ+Gnd157/3/782bj7W4pBxsrsj5mSlmr0zy/EWknwvf/mSN42cs5VieF+/KGFR/exHp/jgk3rgMgfDZWR/47JVJao02tUabg80VOaqvC5k+2d3oc/b1/u/sVSrMF+9q8PDZGbPbRdZzOb775EMA5memuuwGZWbkVB1srsjT8xYA169Os3P0lJ9Xb2jwnaOnABrc1L21XRyKM1YNFFxHfvXDAx7fv9MV3fQXt2n9eg+AWqPdRWCrVE7FSB0UIO0BOkIIGdh21zdPCB7fv6PfT89bQ8FNvxdmQIAEsMHyQOaBAFjbXOnTrW0Xmd9c4fS8hVUqEwJ+xwceWKav2GYoAdETvQ+yAGx1HBAAi67TZ3etVAY17hm6fg/whQRiEgIIVfNUNKFy7Kt3gEVgX/VDwLZBiM64r8aXOmOWGWDqPmCDFQIF5SQADnM5bCA/WF9LKGDOdbAzHRJLSQBSGNkdSECoufJBhspYKNDlbAahyMTR+UoH47sNHJfKzN1w9BSsoqdFZ34gAVsVTKgM88qxdB3q1SZ55cgHHhkkfPU9H2cBrHq1yaLrdGXBDHLoFATKka+iWXQd/n31J0GlYhZml3hGX8R+KhWrXm3qLOQZYxkWXEd+9lGWWqPN6XmLerWpCeRB+gYJsw9JsQHYti0nJyeJ2+HhoR57M43AycsJTo7/IYoiFt+ZYOK9/6CSROvTmYJjkvQLI/oUkaQVoSlR1Dlmf6s2efCwrqMXdKfc7E/cnMNXcwwghCCKIt0OOptYeg14nidj8NgQIFCpZ90Geqp/3aZ5c44vH9bjfUJiEFnOZlhbeFefE4AcOAVPdjdkrdHmF5GACyEsSNa6vScQ6zbfZKZoAflmm3BP6EzYJIUcAqsfv8/1q9N9R/RAArVGm/mZKdYWYOeoAx4me0OyI+4J8mrGX5Is11hiMqF6xpHf2i5qnaFTEFf+cjZDDIwBEvbom988us8BgC11RhjpB1KWYcF1pDK0hCo6n2STka7DtVJZA/joU4+C63CsAGMisV2vjHQhCRUB0enrU3D/j7/whcBWY+tK//NcjrlshqVSWW/LwwiMdCmNwT/d3WB7dwOAerWJEELreECkWlCpUK82eeQ6ZJX+MEndiAznFsAHb70tX539Td1IvTeC/cmPt+H7e6NApUsAMgDpJes7tRVcR15kM/J/gXLQV/1pUleFmCaX+jEJxtAN1TP/ugSGOXhNSb+SxSLUbXhcCYx+nr5T0oIRV4F/CXBTQvpq5+Jr+QDp/UccZDvKT2mX3f8vo9OS5cQRlQAAAABJRU5ErkJgggAAAABJRU5ErkJggg==",
  hydra: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAKlBMVEUA84UAAAAAGBgAMBgAQCAAYDAAgEAAoFAAwGBAQCBgYDCAgACAgED//wCP6BiRAAAAAXRSTlMAQObYZgAAASBJREFUeAF90I0OmzAQA+BSznZIw/u/7kxyCDLGTqKt8Jef+nNM+fx/ii5TXkDRbCdMlcLJZqoULNxNMFunJ1DZd5QAT6tcV8Q8QUGERVrqA8e7+ThWX6fNT1pKiIJ973vBOcI/asSwNahDh/oZfrc697TTNouGiK+OazrH+MuXrZQ/AxbOhOznss3AE6vF1I8Q6DZGGbCYu6yBbpkLoXuX/aLdRpjn3Losl405z35UlFbG98kuWYS00F1kP9WBht04ibOfWrPLb7XABZzjbsnNzwVGl+esaK2NDV4GtVZkvizLE9A7kBn/Q5DHDqKjFwD0LfQCLNbYNgnM/AlirRUU8HIFhF8Tq0jxkf9+GCvBiCCov8U42I7+imMyeKq0yx8ryAwUyclu0QAAAABJRU5ErkJggg==",
  bone_dragon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAKlBMVEUAAAAAAAAEQUEHeH0Jo6US7+8kyNApMCxEST9naFOKhnGtp5rZ0s78/PyK4ufiAAAAAXRSTlMAQObYZgAAAaZJREFUeAFlk4GOwygQQ9eBK/bY8/+/e9BkozvtNICm78klGvXnLuCs+9nbn0JtYkD76PRfBz7kFtJJ/H8HNtCBiN3EXGUH/+EB0+BaR5C1lmK8vJPulry8gJO31mK9BjYGLfvjjwDIXNR6DXTzMxNNzVFDqDaLtWz8Cum9CKzSGDzdMVh4eEc0KZFz2p20VNoLh6cTtUCOqmz7sxVDLPortKUAYGnG7c9WZhsgvgkxvE2IcjydTk1skYa2AXwXVGt4fv65xizH44oiFt5hlVCJP8730nOIyq+wEQVMjznHjnDlumC29QixFoCKx0nIGQRKzsNlnptcw3VdQ+V85jFKeIal729dQHno+xprx6qDe1bGO7gtUR77aOiQky8d8zFgkjFhUNEWglCNm0KkE9ECEJ6ERgPGl1YslotOm2gEJ3MZOKbjOpp1toZRwDf4zrd8PFxjncN4wPuPCYPdLK4t3O1jQDhP01sbU8R93b4zAIrjCCqAGgt3KY+gCyDHirFpCU85PgK4joXFBCXiLcR3AL7z8P686Of96hiniSJGDzwFh4ryL0eUFWV1tdszAAAAAElFTkSuQmCC",
  golden_dragon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAALVBMVEUAAAAAAABKDw1YyDBcGRB7cIaGMgrBXAzpjg394Vz+xRf//bb//b3//+b///9o0/aiAAAAAXRSTlMAQObYZgAAAZRJREFUeAFNkgGy4zAMQhftD2C2P/c/7kqOJ1M6aox5rqNR/xyhtR/HdY3eEDf+tZuvUVtoxcJ2sn3pA+CTA1zLYVUJk/eKWJGzuIH5KU3OvgTPIlZ+P6lzLxbF2jjAASN9fn6S1W8xx0JaPBdSsJKfv4xcgIeBKjqAJTiSV+cU0/GCWSGenELWiu2ksqwuWEVvQEWo85qjVf6VY5Tca2LyEtINKCiJy0yEth1oADbwa8ioouOuWTNjBwAFwAaHFSWvEHRxA5sZjVdRZuIAIKAzDExSVXJWNA+rkY4egLBY6OrcjWrIDo8wuQCHlkQDXp/wCyhOP8uUoxLAWAJO3lN0G0Tsk356k2NvBLnly4BsrhVLNbQjXRu4LwBdsujZt9C7YHhv4MEgkcqKKHOfuCdqnaHHE8UqLRcwzPff2haLkvZAgqMnJrE+y2TZbKduBi8BsaAsiVUkxJbXC0DcF5hUNQqIYswX4ECxKBzRcvS+Q+eOZeIVKefrJSmK1Osxznz9fc2H19v0VdfN2cTjX73D/d75D7iBENlOSl1uAAAAAElFTkSuQmCC",
  ancient_lich: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAQlBMVEUAAAAAAAAAAEAAAGAAAIAAAKAAAMAQAABgYGB3NBmAgICQkJCgoKCwsLCzcTDAwMDQ0NDXnS7g4ODyxE344GD////2uQp0AAAAAXRSTlMAQObYZgAAAUhJREFUeNpl01FywjAMBNDsSmrtYpw4pve/aiVCcHHE4Gi8LzvDB8v/AZb4zAOf19bw8O9E8Pu7/ZyiP3qrGZ+AG+8noBn10sD7u6Gs+8oZbLctnYA7aZNAivxs4J4oc0U6b4A1rasKZnHDEX+Ra1HyS4ErgKqaEfRTe8MVtEdXZQjt8tmwPYGJNKWQuYpOgH6ICqQKVSj6IVASATUHRhMzUtUEGD9zp19Hg+ciaogd+xAbRVWEQDw1+qClXAAWB71pjqXsJjjB6iAKFuTacmVUQTmBuKaKeVlQkDYA5CgQewMZIARfQD12E6tQBriDT6BPEAJHPgAi5wtoVCDyARYsB5ADnekA8YjkrIiZAOhBgCo6CRT4keOeTaVygFmQvbdv+pIj/wAAWu/49qHkjBn4pMTIgVrLyAconjuIiKkUXP74GG+NbfkDPqYKs/WhsUUAAAAASUVORK5CYII=",
  dragon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADcUlEQVRYha2XsZX1JhCFP3wcOFS4Ie5A7oC/gy0Bd+AOjDuhhNfBTwdW6MyTeUOFm+EABgGS9r1z7DlnV+iJ4d65zIyQwdkMQBLD/2269p0lMeZy4gtkcs7ZGGP6ewDz7edhnk9y6R/BQP0H4CEDRGefYZO//00P3qwGMoO6aZrvcM30YFCipxIqMZ+kkJxVupA7dkR0FCbMH2ennrHv1NCoLPcWk5C6e/UPN9twIqDAQonYJ2mAIb7XhzshJIKzeVYh1TWUhJIOzt6S+EEHAbJcgIf4XsCTgOwjmRuzjEr5JG0LZ2sRBMj9Pis4ScAuZZLsZaxXgJBaJWnEjmPP6cZXuXMoUKM+lY0C1ujbVcfBfV3rHGr4JKdkbQSUma1/Ib4PkUp4sLKxsp2J+DWTxGgJJ87JGsFEMLcK6CQvcgCozNXWCIsFZzec3cZ5F0ooiTCV3i0BgJQSjUQFkPBA6m82QEqWXShq9NvTr/MCOFz0Ae+9SSll8RGbfgO7ICI4IoDxtVktNTxnhZTqjV+HTmpD4pldsosxZm/TUQGyg7MQt3KtJblaAWATO26XklBltFJeJVCcXG5gdgG7kFzE6eJ2wfsNSeW2qTDlDc5+SeSUA70lF49oequqSIJdKCQqyVO5alnfJOo9gSS4+F5I1IVd8uDXtrh1JRes40hGjXgm86wVD+bXrI5u6ge9CqrALmC1383gcTPE7ZB+UuFMQMEBHn8dkV10QlWgqTA916ajh5UrEkcZ9sCyw/4JQP79O+bXXw5nlbjLATiuTamSwOWUVM8uOWfMH9/KmsF0Cmh/1kgrONuHMcYUCWcl7HKtQL+OXzlZSBhjjiOcSmSMMTib2T/Jf/5zfeTyayZuBr9mJaK9YBdop4dOpTaOm65RrjUvTH+41PF84DyR6CL1QcZe0JejXcYyVFMyMIK8BDy9nu3w5r9QoRJtvgc4gBmq4BZcrT+YAOyfyP425AJ2KTnUH2S0o07gcHMoPZlf81DbFRyA7YO09Um4w/LTAT77deCvE7iz7aMNNQ9AYH0bQe1yqDDZl++CYYG2flemz4hdddBiLZGffw86m6/2vo/+0ta3sxIwq2DuFXA2X35c3oMb+oC2j1EBfau+8OnH4/FQ8NyPcTazvpXfiowzwfb74Nf7jP63W/D0qF3tv/gbgH8B1/kfuztOQW8AAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  mimic: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAADAFBMVEX/AADgAADAAACgAACAAABgAABAAAAwAAAgAAAYAAAQAACAQECgUFDAYGDgcHD/gID/QADgOADAMACgKACAIABgGABAEAAwDAAgIAAYGAAQEACAgECgoFDAwGDg4HD//4D/gADgcADAYACgUACAQABgMABAIAAwGAAAIAAAGAAAEABAgEBQoFBgwGBw4HCA/4D/wADgqADAkACgeACAYABgSABAMAAwJAAAICAAGBgAEBBAgIBQoKBgwMBw4OCA/////wDg4ADAwACgoACAgABgYABAQAAwMAAAACAAABgAABBAQIBQUKBgYMBwcOCAgP+A/wBw4ABgwABQoABAgAAwYAAgQAAYMAAgACAYABgQABCAQICgUKDAYMDgcOD/gP8A/wAA4AAAwAAAoAAAgAAAYAAAQAAAMABgMDBAICAwGBiAYGCgeHjAkJDgqKj/wMAA/4AA4HAAwGAAoFAAgEAAYDAAQCAAMBhgYDBAQCAwMBiAgGCgoHjAwJDg4Kj//8AA//8A4OAAwMAAoKAAgIAAYGAAQEAAMDAwYDAgQCAYMBhggGB4oHiQwJCo4KjA/8AAgP8AcOAAYMAAUKAAQIAAMGAAIEAAGDAwYGAgQEAYMDBggIB4oKCQwMCo4ODA//8AAP8AAOAAAMAAAKAAAIAAAGAAAEAAADAwMGAgIEAYGDBgYIB4eKCQkMCoqODAwP+AAP9wAOBgAMBQAKBAAIAwAGAgAEAYADBgMGBAIEAwGDCAYICgeKDAkMDgqOD/wP//AP/gAODAAMCgAKCAAIBgAGBAAEAwADD////g4ODAwMCgoKCAgIBgYGBAQEAgICD/AIDgAHDAAGCgAFCAAEBgADBAACAwABjw8PDQ0NCwsLCQkJBwcHBQUFAwMDAQEBB/Wkildl7Kj3LlooL/tpH/069oVB+AcCCqiDTAoEDyxE344GD8/Jl1aViRh26rmoHgwKDQqFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABHbGzm1GiTAAAAAXRSTlMAQObYZgAAAAFiS0dEAIgFHUgAAAAJcEhZcwAAC20AAAttAYAOpNEAAAAHdElNRQfYDBwRAxm/JAOAAAAAsElEQVQ4y+2SQRLEIAgE/QvD/39FUR59waKAmpTW3va0k0OmMi2opJS/fqiqAiIQgGmpquqej+eRi4jKKbc61B2DLwA5AHagap1adhRI4CixThqA9KZbB3cMXQCdAItVWntXcGtOO5PAWJQKdDRxIDceu3MvwhNw2bu1DgTHwNYCfvd+PvKL7NewAPsmoZhE5HGKuXcgRxX5qvAGMn/OQpfL/DqLzK9A5qXdFX/cl/wDSvOnPwbUFUEAAAAASUVORK5CYII=",
  pc_adventurer_1: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH2gEOFBgEPJechgAAAflJREFUWMPtVj1q40AU/iYEVw4Ik1Ygw26aNANxijRhstU2G7beYpkmF8gBEkUHyAXchCByAFepjA7gBdVmiwEtgkAwA+62eSnGY6xESTSy5DR5IDSanzfzvve9bwR82qd9sLE11lITvuoegL7xHno7HQDAbP4f43RWy99W3fB7Ox3s+xz7Pl8rBdt1F/4++YGBOALyfzj44mOcDmv5qY3An79ZaXuTRnkc0ejijEoI2ToCxLvAZJrB3/XAu6aPws1wgEQA6EfgQc9xfTuEtwtwACwEuVaCa9mQ5IDSQOABSQqIRREobd6JcvNbKwWBZx4ZysJ32xygPI6WkQLATXiDwEOhb3RxBhdSbq1TBhYBiwIADPb8VhCgPI4wmWbLzZQ2CFizKEymGfI4qoyCEwKn0dCSrBSBRJk5rerA5a/vLExMxGmqobRph4kZa4OEtCBWsRKEiV4HP6G9lxdSVTJWFiKb/6u7e5JSQmsNpUw+giBYjq3ObVT3V6IhKSUJIWwfCSGIc16YU5WE2y0pJiv5a2KN6kCSJIW2TcMbCFATB1jmv8w4504quLYSNmGbPABr5H9AKVWagtfS8h6JXQ5AeRzhYTZH9qhxmqaFwfPjrxjs+ZhMD5/LMWvsMgJgNl/ZoN/vM3tP2NtwoYKsSvkyRzF6by25+n4CFC7Go3t7WDwAAAAASUVORK5CYII=",
  pc_adventurer_2: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAASFBMVEUAAAAAAAAgICAwGABAAABAEABAIABAQEBQUFBgAABgGABgMABgYGBwcHB/WkiAQACAgICQkJCgUACgoKCldl7Kj3LlooLyxE22lE4EAAAAAXRSTlMAQObYZgAAAPlJREFUeNp91OFygyAQBGDXqIgSPOJd+/5v2sW2ScpwXR1k3G/wfjm0Qc3gB3Hihf96VRJPANHMKBwAszjaOE5mniD50GwR/gymmv0pUYfMyQU4S5xCkBgLnF5iOAlETvRAkSQSJHEtFL1+LXISkJQOkBQIAh+BogNMV/kGCMkaALDXdS4ikmZkbQDMTHPGvG2f29wDyh5A2pg5gQL4CzJf4J7kukMFjQCXFzBrAPML7pwyqKILMgFFqnVHEFyTcvWA2gXMOQGPY18ALPvxcMS+3ADclh0OeJ7g9C/gzsC+iuPof+AJuOv3+w/YqxhasNTgfdeKK+0v4AtsSg93ExVmXgAAAABJRU5ErkJggg==",
  pc_adventurer_3: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAaVBMVEUAAADkZhbyqSTyxyf+/oIAAAAfHx8vAC8/AT8/Pz9fRwNgAl+gBp6kdV6vr6+/A1+/jwy/v7/ACb7JjnLSORDfbwjfpxDgDd7kZhbkoYLv7+/yqSTyxyf+vxX+/oL/Bn//EP3/tZH/0q/LpU87AAAABXRSTlMAcXFxcVX9yjIAAAFUSURBVHjaddDrdoIwEATgtHbShd2ITdR4J5v3f8hGlPZ0sfBzPmbn4Jz7cG7lADc9AByceW7OHU545L7rIFasbjh9Yc59LoK/3x8u27mgqnpvG+4Hvp4gaz52Jm8bzz+g6tF72I2H7Q8I9ei7hbj8nvAhPIDdMI/caUo+sxErtz2tMW2s113nJdmK81TR3qKpdll0IbZoFXsEKSl74aQGvL9hvd4DgYXF82eyAjds9uhDCMTMBCR7BFf0fdDQUxOfAKo9AmgfALBIbOK6q3YmVHuAc45ZSKcCK7ABpDQQBfMEuwMlt4oG5twIhxLvYP7VSxEbEMkp/AdKkQaiVsZrkBtgibX2DwDAnMh8B6qJMcVGQIQjc06qDeAVYI7EhVR7NvkTgIU4U9LwGkDBRJGCJrb5BOoTUFXmZe6gI4hIiFIaXuXjMAAgJgzjOCxy9/wG+LPvG1sGGyPxrVSTAAAAAElFTkSuQmCC",
  pc_adventurer_4: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAACN1BMVEUAAAAgICAwGAAwMDBAAABQUFBgMACAgICQkJCgAACldl7AMADAYADKj3LQ0NDgAADgcAD/QAAAAAAAAAAAAAAAGCcAIzEAMEgGOVEJJTIJOEkNAAAQOk8SP1MWBgEWCAEWVGwXVW0bDAUbRlYcDAUcWXIcWnQdDQYfZ4ggCQUjDggjEQsjFREjWW4kDQYpFw8qDwYshaYtAwItBAMvBAMxAwIxFAkxFAsxFwwyFw0zBQQzgJ00JB02HRU2hKE4BQQ4epE6BQQ6HBA6IBc7BAM8BQQ8fpU+BgQ+IBRBBgVBIRZBJRxCIBZDBgVFBgRGJBdHJRlJBwVNKiFOLB5OLSBPLiFQLR9RLiBRMytRpsFWMidWNCVWqcVXLR9XNCdYNylZNylaPjJcPTJdOSxeNCVfPC1lOi1lQjdlSwBnPS9qOipsQTJsUQBtVQBuRDRvQC50RjR2TDx2U0R3TT54UD99Tjx/VkZ/V0eBVEGBWUiCWkqGWEaGWUaHDAmIZgCJYgCKVD+LCQaMDQqNCQeNZlaOEwqPCQeQDQqRDgqVaVeXDAqXbVmZCQebcF2dDguedGGedWGgDAmhbVmib1yjaFKkdV6lDwulemipdFmpeGWqgACteGWviQCwgACyg3C/gma/inXAOwDEEg7Fkn7FmADMEw7OEw7QEw7Rj3DTEw/brADkoYLosgDswCTtwCTvFxHwMCbw8Mjx8cvypoL0UAD0lQD/xZ//0q//1Un/1zD/3rb/6JX///8xdt4CAAAAFHRSTlMAAAAAAAAAAAAAAAAAAAAAAAB/v7IWKoUAAAIQSURBVHjalc/3V9NgFMbxty0txdK6HsQq4qriAKO4tQ4UcCK+glq31r1w4FYEIloHbo0RZxzRiNJoUiv1n/NNTs5Jg5VzvL/lfj+5JyH/OQACgf565udnDA700zVR0/8tIIUzYVFiwnr+C+haRpNSEswLwHfA2SG90URdgrnHj8XjF/5Cdud5qotSirbILaao+D3K0e+pMk9TOuuqIfBtUkm4C3bv2ENVeefUSD0TinEC6EFWP793CsdTftORHfUr+LpxBjiGrPuX9o+eDwhUaOitfdVbVgoM/eD4gDOLloGAKttrJ7ZyaOXKXx4aQmD309tirGPL0gkj1nFrwH29Wg4gbQlPCLGYBswYO3yYQB9WdwKl0XPpeLrbAi4vOC0zpri4iApUWdVZDTei8e6nrFsAx9OiJhYBn+oEenv2DRTkIR61/xFfKko0EYBc9XGJvKC9sh0FxM4M9HQBCAaxUZ71bubNymvLGRgQtIEXCJlw69l5c6bPXd3UxIBjQi6v0XdfaVs7eeS0fRcuI88JvC6/AW69OHAigrLGRw9OwXnA7woxgWfPT66HD42P3150An++x5/PwPv7hyMoJHhy9yCIczwewsDrO80YVMjE0Q0gOQbNuxpAfD6CzStBYE4fUZMAcbsJEjUAcggkFQwEm2TCBs5uBVXJfUBVrXXSEqRPVxLWDkriup1tYe+yX/8DqWqW2JytsmYAAAAASUVORK5CYII=",
  pc_fighter_1: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAQlBMVEUAAAAAAAAgICAwMDBAQEBQUFBgYGBwcHCAgICQkJCgeHigoKCwsLDAAADAkJDAwMDQ0NDgwKDg4ODw8PD/06/////a5s2iAAAAAXRSTlMAQObYZgAAASVJREFUeNqNlNuOgzAMRDvOhaGmhCTL///qOhQVQclqhwcc5sjjAMrjIjQ9+kJd7MJf/jwbgp6PmnOeuy2Qc33l12vJuUcY8jM/c38Ii5jnZz8CbchnNMB0Y69rqouI1JqsxNVf06RaA2WtVJ3SirOfppGMEqirSiTH6dwDjCYfxQCxu4mXFvCmGERF6Z331zHBFJzI1kHEew3fgMOnA5zyTCAqHUTaLlQEcLSUwwZTdDBsi6BV9Opw7JGJzZc9QprPDwDlewXuEfTh8Ft+CNsKLFtEoXfbk4Ow1RtIFpEK4d3pe1m9A6OHHw3A7d9rAA3gB8DVV2sAa6HsAGUHyn+B2xEMYBdo/kbw1i/jsAPDWO58HeIOxEHL90vwTThVF2LT9Qz4BVyEDXCEMWjWAAAAAElFTkSuQmCC",
  pc_fighter_2: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAZlBMVEUAAAAAAAAQEBAwMDBAQEBQUFBgGABgYGBwcHB/WkiAIACAYACAgICQkJCgKACgUACgeACgoKDAMADAYADAkADAwMDKj3LQ0NDgOADgcADgqADg4ODlooL/gAD/tpH/wAD/06////+2JnDhAAAAAXRSTlMAQObYZgAAAUFJREFUeNq1kdFywkAIRSXcrajbNGioa6it+f+fLEmdcUeb+lSY2QfOAXaG1T8EPePePOHW0GrZIdMsaLxZ7s+Sktui8NVhQL/MPTaYr//4wvtm47oGLfHL5fPDcwi0IOB0PqhATX5VSIO/AeoqGfTInc/nE1hdaqMWcDgdWFSQHw0iUoQx7UcCJkOp4qNTII/UFIZo1ixU9RdVEbXgkjCl10I0F4HCRH8mAAoBVYJwVFIAMU3Q0XPwSjDhKHDX7xhJMKrOvPpDaaOAfj5mh9E93wtbWhF23Y4ZYFUHzXEbMAkKZs2WEyN4bYRA8WYVzjol870wD7BszNlmo+Z03SBJEnM8kVzz47FsQeENfdsSte3Q1zwEOx4NtB/6UkLYl6txu4OavUpbArcvRC/7Mon1ocYRIgEjiMKYInhlPMaNfwPrjBT/ULWEZAAAAABJRU5ErkJggg==",
  pc_fighter_3: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACZ0lEQVRYhdWWvW7UQBCAv0NIUCDFZbpMSYN0kVKkQGLoKKFLuY9AeeWVKfMITpeOvADKRqJIhyVeYE5QuFy6UC1FvL47x/bZToLESNbdzc7P55nZ3YP/VUIIsSiKmD6nxnk2xalKTPAegCzLCCFMgpgEICLw6wY52gcghJCe0RCjAeKPL3Hv5xX29gSAIstqoLT+pACzN59mq99/kG8XHOy9gLMzAMKr1/X6kwJsJrv+ugLg8vQUEcHMRrdhEsB8Pp8lCCtLrCzrtSzLRlVgp3H0GleS39MvRdDFAitLfJ6znINc2pbNgTlm6ntzDKKNXiPANcs1gCoByNLvaksCvKvsdiUfDACgEK+8bkF8ViVrSf5ePX5g7EEzoBABDtUj5aLWZw07KRccqt/yeRRRiApxDtFBtIvj6CqdNnTzDf2Q2DsrkPq/1e+TG6TSSfUsT246fR8EcM2SK68AdV8FsA0bq3QABcwC0JyXyQAA5+YoNoZqM2EbUAGzc3NDQvO8ayHP8whgZlt6cYLsvwTg+4d9VuUtvgh3EOUt5Gt7M6vjOOdad0VnBUQEVaXPeVXedrnXPqp6d1l1SGcFmoGSqMvrc98S6HFVKTPI3ZavmfUOYieAqu48SFJ7+t7QPgo+TAAYmjxJqkpTtOg/ESfdhkmcc6hqa+KhMrkCA6St9/eqMaoCaUu1iZmlXRM7krdCjQIQEUQEv3H7tUCOCTl9Bpxz9fd0XkyRBw3hY8i/Brg3hIP/EXmIdvdJ3mGTs76k9DEBUnIAt8M2X/s0QVtzDToH8p0Wa/Ht6s4XHdqCvgulGaNp25vjL1wADnm5oDlHAAAAAElFTkSuQmCCAAAAAElFTkSuQmCC",
  pc_fighter_4: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH2gEPDxcFZMebKwAAAiRJREFUWMPtVr2VtDAMHPZdAZTgEujgFG5ICSrFJXwlqARK0HVACQ4vdHiZv8AYzC7rMz+bnd/zg11AGs1IsoC/dW6FaR9ezRnnfd8DAIZhOGyrOePcez//oaqH7N3O0KfWQplPaXgIQN/3GNoWcC4CMQZJjncDWJJucg6i5f5AQu7RLOjENglARGjbFgDgvYeqgjtAxn22axkI0gOfZtJ+Q3ZlgAwgPcBdPRu1ABoegC8XQXwazBXgvZ/vybwvBwJEQMbiy0Ugj85NC6iLW1qqBvBR/SYRoApykX/jdZUDVuNr0ts8KS9hIEAV8xaJRUA0M+CIIB3HBDQGYI67Ig/qJHBu5RwAYO3SCSmjnDmCuECCiF5k26BzcMnZ43PnFlAioVSWt1LSgXlpNCKpvJ5ZyTTnbmLEmHhlTsyFfQykqKx9fjamTkiAd8A/jdd85XIVJPko6p4ZWkUPAE7Xv3/8igVJAJiLVdH8lgOp68kYDZMAMLTt/HucgaYrSdnXbc85QYKoO5noNG0AuHcAc34WVAW6/zh2LubFvQO+x7jv3boU3zoPGBNZeOySO2r/PANT+XEXT7850V6zEF4NsNUAZCw0pbzUXufBbgZCXgEb088zMxm49I3ylRKUTrkSuEsBZPrP0fZYzoRyNTSHAMiI58zfmoCSDDvy4FcAJFgOnI3oVyykarAWYM674MtmVDcRPUSfotuMMg0uF43l4YCNsMfPf5OkD7v6u3E9AAAAAElFTkSuQmCC",
  pc_mage_1: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAB70lEQVRYhe2WvW7bMBSFvxZ9AAEds3DpWECPoDFAF2XNEPARij5AY3jM0j4C4bVDvHTrQCBbshhI0CkouHhXn+B2aK5CK4xMUfHUHsCgTIH3HNyfQ8G/jldzDrc4MTR0BBxNUayiQzVWDA1zyQFelx40NAB0BGqs1FgpiZOt3OKlwvT/O0L/PNzvCKyxWbEnp07Tr6QdgYCPn2f1VTbOT4/l+ssnkdtLOT89lu1qedgSpCC3l3Lz44qjtxVHZ5+LYhU3IcDJ+998v/nJh7NfHLwJh2hxT5pSe2GDy45bJEDJKwwdgQrTk+te7hQUlUDJYXccA74XlFuSyQIsXjTd8apCAp4Kg6HJEvFmCjE81lqdUPcAvvoaANeE3LD7BWxXS/F393y7+Bs04LXJ+otog8P5FpqPABhgg3sZAYrcDn+3WrK9u2d94bOmYa+AMYPReseNOBXFPlBjd0ZRRbQPqV9kxs4uwRBKPjSjNXaSERX5QMOid8F4jcRI4vdyApRQG1OhX0ltegKSQoqdEB7nfygmLsszQuYJiMnUeofvnsnCExQ3YSwgtTeShZ0GnfU9MEx9fB/kkBcJqLGiRGrFcRbivUEZkqNZXILUDair7u0jH30xBgfigQ12p94dgcUDsT2UEyo5pC8mP2I6/5HCH+9S4q464uxqAAAAAElFTkSuQmCCAAAAAElFTkSuQmCC",
  pc_mage_2: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACkElEQVRYhe1XO27cMBB9CtKHQA4QlilVpVaZUn0aHmFzA8FlimCPQPgEuoCB8Q0YwF1cjAsjWyTBVGmZYjU0RUtaadfp8oCFtBrqzZuPRhTwHxdARGIIIebHrRyvLnHOzBAiBO/T9RDCJhGvzxUAAEYCTG0AAEwEbhpYazdxbM4Ak49MPgIANw7pGAIAQEIPtU/h8fpqZKu2CsiFAMC7t29we/MAPhzQfHwPU7cwxszyPl5fxcdfgg+fv1bABSUwdQsJPW5vHtI1MTXMlNjdLrIIAIDu7ke2swT4to3qECDw4QA6HFBPOAYAde6HMvkQUoY2CfBtG60Zx2iZARE4IDUgORetMWARlOtLrBKgjpVUIfs9QuFEum50r4og5knuk08BORebITIWSQJ659IaFRZ2u2Qvj3NYFKCR5471fIlYbXlm5jLwrAT6mPz59vtZypeQr50SkILKGhCYyADd3eP7j5+JKCfTKIg5kefXWWR0XtoHxOEHYCIDn75cV8Cx9nn0ObE1Bo21o+zkglgEPgRo484gAqhme6DxvtKbNeKBuCKmUZQ5juvCrL3EYhPmJSDmVD9Xt+hoD5Y+rXX9HiwEH3pYcxxJHdGIQwfRagGu7ysVUjZPY1uwAB15sPSwBrCmgavbkmOOvjopYAlansY2YDk6n6t3RzTpfJWAqeifbFpzIB9WU5hK/yoB884FdgjYmqenYwWW58BJQcN01IhXOp3F2T0AHBsROJZCoYJcXb6c/4GAJ6fl/9msPCvnJgG6EXlJbM5AuS+wxsDVLkWdN2NRhslmfpESlI5V2BpsEXBJ+md3yZsykI/VUy+ajkiHz+LWf8umtAIQm+wzjLJtWe64uOck6Tk4VY7VvH8BbZmKffSHwiUAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  pc_mage_3: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADCElEQVRYhe2XP2gUQRTGfxeshOAQbUQwUyhIqiWkFJxShINDxDJZrEUCNikPq8PGQuwnKa2CliJM4CqVMIVYXfEiCIeFLCbYWIzFzW727naT3USsfMuxt2/efO+beX92Fv7LOSTLsuC9D+V7W4yF8zgXETLn8NYWeu99KxIXzkoAQGUelSgAxDnEGLTWrTA6bZ2KswFAJT28UmhnEZNOCHmPyjwA2qSNsFsTmCWyfPkSe+8PkPEYc/cWKumhlGqMe+YcUEkPgL33B4UuU8mp83rWTuVIawLOmiBIKDuU8Rg3Hhc2ggRnzVwy9qwNycbGFIlWBATmQGVTweAWxs4nYNm+Z21QcVxpXZBolQMCQQCsIent4pVHo+OYkGQJXnmwfXTqEEADm9aSbGzM4fnt7eZlmK9GT/6TqaxwPtHrQifRJpfdNO0AQWmNvnMH2dsjE2E3TTttQ4CDyepsilRdNkVSR042J7+bpp1MJrRy59CwEUkplgWJU4jmUrbLdyJ3Dg2S8OewG5aG3SlQYLJK259W2j42rj63l5x0rJ5XC1/5tvOsWRUEQli8/YYft1+CNbgSqKmZo0vOc/vVYRedWlyhifAnEfi28yx8fPGUbbZZZrnQ96FjrGFp2K2ctzJYQ29q+jW479av83t9vXiuzQH3ecTNq1cAOOCg0mb1xiL7s2GYxQEYHdbmTC2Ba88f8aUU+e/jI/qxb0is8fvDLqs3Fgub/dEhv7Y+FbP68VcjzaugSjTw5PFbtAdJQPvqyugDr8dHU2Ma3bwKcnm49Wmua0oWky47TkqpnsuHwQNMvMpSuwMG03G4MMu4cA7oyVkErSjabhWBnETcoymsE0NgMHOOLQQdoRwnN6QmcubzAICZHH6Q7Fin4z39FwQKp2rmud50bkdbEbAV54HzSusd0EwnmwbSUgkKtWGoPHv8lRDMOobmydmGQLg4WGtsvDJY496xfe3Jq82RLAA4awCKFrw/OoTYmg0gcdzE1/JpPtp+F8wlYU4ol5LjRvhn/TA5rRoa4/4B1sQ+68v3FrgAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  pc_mage_4: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAMFBMVEUAAAAAAAAAAAckKB4+SThFAABTWU1wWiCIYU7JycnTl3voAgH5zVf+/qT/wJv////wGAsTAAAAAXRSTlMAQObYZgAAANNJREFUeNqF0EESgzAMQ9HKUm2aArn/bWtSFpRJUsHuvzBDHrcBj+ngxLxLfwEx7Qs5EdCyLFPA9/Keg79f2PcyASBQwKEAE4AcCVDuB9BAtOQueRPodjFJirAk975KKcTsNNZK/HY3NpF9Na/P+roK7GV327K6i+ZR67PcQHEaV22Ko8drL9mvACStjR4pGrgI5MtzxogAehfhOTUxuEvPRxQt+xS0PgVtXaATdAXCdWQOAb5gZXQBDKuCm8EGH7jv3p0k2ui9LgnnRHZ+8nLmev4DOT0GUe+RiTkAAAAASUVORK5CYII=",
  pc_healer_1: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAClklEQVRYhe2Xv4vUQBTHvzlsxUF7fYWF5XCF9TSC5YKlIPkT/AHWqRX0epvhwFb2Hzh4B1ZXHNNr8W7hMIVK/gBhLJKZS3Yzm0zW0gfLJpOZ7/fz3kwmCfA/Doimabxzzvf/czWODjEXETTMcNbGdudcFsStpQAAoBoHpRUAQJghxoCIsjSKXFNh6wFA6RWcUiC2EFO2QM5BNQ4AQKacpZ0NsA3y4N4dnJ9dQeoa5ukjKL2CUmq27uI1oPQKAHB+dhXbGqWzdRYBWNtmHwylrsF1vUQqbwqstT4sMq01RARrfZP1y6YBADjnQEQgokn9WRWw1npm9saYQftaa1B3bMAAgKaDEBGIyOQtOUnIzJ6IICJRmGAhJQ/6kW3hBGV73o0x7a2Z9NlbgVDyLpsIcPzwdmsSzIG2jSoAgHNm0D+smSyAUPIgNCdEBM4ZnJwAZWliOxElIXYALj6+9p/fvvBBMAAQEZg59gvy1BsbzEOU5XQCyQpYaweDg/k+wb55NyquhVQVdgAev/pQPH93WgCI+zrzjZC1tgCAgEFD7IE58/DqGPzeRdifAmaO5qmoqgDBuD7dRI0AX1XVzvjk07Az89uZ94PQVoIG4whPjja4/tUA94fJjMXiZ0HfPEiHKXt/+RvffvyMfZkZVVse3/3mAVhri1T2qQg74aeLzb5uEWKyAilzwfgUDPp0a6jLfhQiewr27WpjAAnzGIvXQCp093TUWk+a5wLsLKBUKKVmi2ZVwPbefv9BFDkAMfOpt96wa86Ng/aBnbae8cQ0xDtr0XfB5Z83OP7aHt/t2r58f4aZiRfJk4nwQFtipRScc4OLRASlFNbrNYgIZVlOmucCRIgQfZgAoHXy1XzUa/GHyTbMUu2/sxZOoGepW+UAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  pc_healer_2: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADCElEQVRYheWWPYjUQBiGn4iFhawB5RAsnNoqhVgdXIRrPU4EORC8HFhYyakgNkLATlCPqw4UyQmWwrI2FifOwlYikkosZ0EliMK4WojNWOR/k81mb630hZCZyffzzrfvfDvwv8GAUWDS+YF5gmmtTRiGpvielnwIKEAmJFoTGA3OGTAGpAFptNZGKYWWkjAIMrswDDOb+DEm9oU0OcBS8p6rArYOEY6NcGy0lCilEEJMtBdgpcmtZDwzASUVSqp47Hr5e3MTAB12s+/5PgsIXH4MzmXTg7MSEO460EfJLkIGnDx6BLW1hYoiXB1iO6vYdpjZjwYrdBZfWOn8S/STd4V4rSvQWXxhjQYr2dx2VgHovxpma9p2Ch41uwfeR1/5Ev2cnUAd5MsPAKgoQkZR5fv47gFOHT/GwvHD2Xzmn6AIZ20Nx+kChwDB1paoGvkmPpq+ZVU/tq2Abwy+MZ29HjI4mxNwNCAKD9h2F1hCBmfp7PXGiJhKn2hBoOzkqtfAUiY0mfQAGQTJ2jpsDnHDoFXcBgI1jHUiOB/iXfq4nsdo8BzXi4nhA/bJ3L7kE4twaeE8n57epYGAMbCRT/1C8sJaIAUAncULeN5GliQnrMrEE3z++j0bVwi8eXjDPLu1Xs9LKwh3ARgtp0dSkP7+2boexrYpAQD6QHwKHr17wonLd+oJ1KNfDqaHdPZ67PjwSwWMBvfZvvKN0fJKWXhdz0LJCgnXyQlXCJy5/sC6dG83mW1kTgQyD5rgqg+HhEdn8SbXHh8tJ09hi7FKlMk0VEAUxknywK09y42Y4jOBQL+GhF8KlGugjLF1Q+HyUYd9d8LOXo9f/gY7fsDvj98A2CbVwNiJCVyyKo5hQgXalbpRA7YAr5jUrY3RUIHUQTJe/v3DBU6X4jcRqE/qSZN1ur+Aff8dtxThVMwiwljNtgCmiNCm2ronYLYKlETVshFNxkyX0sazPA/mupL9EwTaitACDIELm6qdR939EKyLt99WAs+C5IKZSGK8P01ab8g1T4ebJsxWsf8Aj2VOR9gRSE4AAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  pc_healer_3: "data:image/png;base64,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",
  pc_rogue_1: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAASFBMVEUAAAAAAAAGXUsHNwoOb1sPixwRi3EVp4gVwygoGgc2IwlSNQ1yTgx6bzOIYhSJWRekdV6laxyldxrAfSLJjnLkoYL/tZH/0q8rPKSAAAAAAXRSTlMAQObYZgAAAOBJREFUeNrVkMuygyAQRNM4zAQhvgLy/396m3LnBffpBUV5Ds3I6wcD5pEfy5HwxNORlrGBlHJ+6sBSaylHeqj4lE/JG8YzlFryo5ALC8RhxNXlbXNqgj43NedU1foGzJyRqkjXAKEQU3Bi2hXYf1U4M9woyAVsuCr0JqDWk58h1gSTfz+CfGZyBFJVDRz2LhQAL4Q5xpkR0duUpAxC/O7rHEOt0n8JHm+J51nIO8IawcQ9j4R9R1u/yOgLrYIXrehzGiEA19J18PZg/Bt9A95PYCbv+3yayJm2GcyI26blD3bdCWqzswMsAAAAAElFTkSuQmCC",
  pc_rogue_2: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACUUlEQVRYhdWWMY7UMBSGvwEKipWwRIOEBK+YYksfweWUc4QcgROscgK0XADNEbaiWyl7Ax9gC2+DUiD0kKagQDKFk0yGyWTsYReJX7IS+znv/+38fgn813BEHBHAex//LXlNpCZSEQfyiicWUXcE/cor4vX19XB/TsrFWSICEEZjAv6Dx1pbnK/4AVWN6m+GfvCKcQ4RwRhTnO9Z7sTQbGJoNhEguIrh6n0S5m/o4wB2mfdKihX3JO9fv+Lu9oHQtrjVJcauhx2wS6K/Z9Ff5/Jl70APY9cA3N0+DGNq7HBfV/nkZwkYE4a2pWnbPfLQQrXKIy+HI6pqOvdvGJqqRlWNOGK1eqpa4IhIIqPqyGU01sX7ypiLF0UiDBhrQAZRaXhtUl0wRdmAXA84IgoyJnh5OE0MoN38RxWgABWhYYFIWq3AUBEDIJLips7lBnLqgKsjGtK936T5TiIhwM9uzqVAExbYarfyfu4JTHogfvkUv377wdvPV0DdJZwRq50Ss+n6OdQzAnaJOSSX7v2K7IjHoj9ezYstEjCVyFlofNkzMyivVpVNOzAWIZKOwMY/3dcQSOYbQ2RHPhV/dAEAoTOGs/tjocB5IxRtmb1IBtQthNGzzhD11+F4Dop3YIqkURZm2s5xop0nwJnT5dVcgMyQTaHoY6Tb47EzLVAgQFL51y1wPxHuPHksfgxFHtAt+P3kw3bP1aYRDgyaJWDiL+foO7bL1HLxPIc8tJOrP0BokxEv36V++30vPHk8T3rgFOmfOCL0aG3IKRp/+5M5y/EbxxgVhzTZjSgAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  pc_rogue_3: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAALVBMVEUAAAAAAAAADFkAJpQARMlDMzV1dXWPV2Cpqam/kprMqa/a2trh4eHmx87///9pLysGAAAAAXRSTlMAQObYZgAAALRJREFUeNq10tEKgzAMRmFP6+Yf2/n+j7u0uIthai/GRFD4DiXQLH96YOLrysQzE8/86JmJp7sg92ByQOLWxwGHmR3H2O3xsu1hNgx288B2DSeo1YOqcaBSrJYiiH11LPI3Z0LPRb1QStcCd1TVXHApeFkG9UJuXALbWEDNlbgGjucUaiNiRnyR7uDFthF5AqmPS3wAC0/8J74L+p44MdoXmgCD4JTPJ97F1ILRzvH1hEPE+gZXxgUzXZdlkQAAAABJRU5ErkJggg==",
  unseen: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALklEQVRYhe3OMQEAMAyAMFr/njcZfYIBMtXrsL2cAwAAAAAAAAAAAAAAAAAAVH0hEgE/1YngfwAAAABJRU5ErkJgggAAAABJRU5ErkJggg==",
  stairs: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAAEEfUpiAAAACXBIWXMAAAsTAAALEwEAmpwYAAAABGdBTUEAALGOfPtRkwAAACBjSFJNAAB6JQAAgIMAAPn/AACA6QAAdTAAAOpgAAA6mAAAF2+SX8VGAAAEtElEQVR42mJkYGD4z4AEAAKIBUSYm5sz8PLygjFAADGBBIyNjRk+f/7McPbsWQaAAAILgGTU1dUZfHx8GAACiBHdDIAAYp44cWIDJycnAz8/PxgDBBATSK+DgwPD8+fPwSoAAogJpB8EQIJfvnxhAAggsBlaWloMUlJSYPzs2TOwjSCFIDZAAIHdlZ6eDuaAFJw5cwYsCVIEMgEggMDOAnFgtK+vL9g+mJ0AAQS2Yt68eXBFMH+A+CAMEEAY/kAHAAHEEhcXx3Dz5k24ThgNclNUVBQDQAAxSUpKghkwNyD7AoQBAogJ5HIQA+RvZMfCFAIEEBOy40AA5DWYD0AaAQII7k0QB+TFtLQ0uGKQOEAAwYMW2XiQdTAAEEAsMAbMLSAFoLiERTJAAKEEFLLrYUEPotEDEFkcIIDANsA4IImZM2diaEDmg/DmzZvB4qDgAwggFuQQQE4FyP5C9ieyi0AAIIBQQgmE1dTUwIEAMh3ERw5WWAoCYZiLAQKIBcZANgRmMyigYPLLli0Ds3l4eOCGgFwDEEBMyGEAswUW4rCIhXkD2XaQQSAAEEBM2AILlkxgimFRB/IaKCvCDAbpAwggcDS6uLjAbUQOE2Q+MkAOVIAAIpgfCAGAAGJpaWnBajosOmHeQ3YRTD4pKYkBIIBYDhw4gBLfyIrRUx0IgMIClEFBBQUIAAQQCyiHwJItcipEdg0sKkHqYAEMsxQggJiQbYTRsHQB04Ac1ejeAQggJljiQQ5tkBORxWDiyDkSBgACiAXZ/7B8DGKDwgYZgJIzet4AAYAAYsIWxzBbYQkJmQbJIxsGEEBM2EIf5lxYuoclW5hLkAFAALHAAgxbrgRhENiyZQtGAoJZBhBATLDEgp4TkQHIBciuALFh6gACiAm5AEEPIGS/w7wCMwjkchAACCAWdE3I0QkLA+RSFhY7MEsBAogJOdSxRRPMucjyyGoAAogFuQBBLnWxuQhWOcCSMwgABBALeoIBKQJV6DCDkIt7bOUDQACBywNQlkZ2AbJm9OhFNwTZddjSE7p5yMVEfn4+A0AAgSMB5GKQICyro4cjuoOQHYpedCD7DrkoQdYDCkaYOoAAYoGV/rCYhlWZIM09PT1Y4wKbGMwy5LSMzXL0OgAggFiQKwLkOEOPV1jIoPsSBkDyoBDEZgk6jZwPAAKICVvNjK2ehDUQ0Q1Gjirk1IluEXoWgIUOQACxoMcXTCGyb5B9iV72woId3SPYymZsACCAWLDlNeQ2J7YKH9RKgJWKoDYiLCRAYiA+tlyAzfcgABBALNiCHt0hyE029GhAL+vQi2vkVgi2LA0QQFjTAC6Xowc/yFIQG+RrmCUgGp2PXDCjZ3GAAGJBTijoKR89wcEwKBTQKyuQGaB2JygEQOIgR6DXCug5DgQAAogFPb/iAzB5WLwjW4Beg8BCE0SjhwJyOgAIIBZsJRs2hyBnR+REBAsFWDbFBkA9LPRWKSwEAAKIBVuxi8ty5EY2LK6xNfvQEyByVCG3eEEAIIDADgDFHXJ5AGu1wBQhd5xu3bqF05HoRS9yaKKnAxgACCAWWPcVV/OZUHpAjmtYjwIdIHcT0YtygACiuHlOKQAIMACcfn2L1lpH6wAAAABJRU5ErkJggg==",
  exit: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAAEEfUpiAAAACXBIWXMAAAsTAAALEwEAmpwYAAAABGdBTUEAALGOfPtRkwAAACBjSFJNAAB6JQAAgIMAAPn/AACA6QAAdTAAAOpgAAA6mAAAF2+SX8VGAAAESElEQVR42mJkYGD4DwSMDFAAEEBMIKK1tfU/CDMyMjIABBBY4PPnzwy8vLwM8+bN+w8QQMxAfsOfP38YHjx4wKCgoMAAEECM6GYABBDDxIkT/4MwjA8QQIzl5eX/1dXVGZ49ewY2CyCAmM6ePcswc+ZMsKyUlBQDQACBzQBqAQuAbEpKSkKYBwQAAcQCIkDaQaphdoD4IMU1NTWMAAEENsHFxYUB5t6oqCi4BhAfIIBYYEbBPLNs2TK4dcbGxgwAAQQ2gQHiGRS7YQAggMDegNmfn5+PoQgggJhARsGsaGlp+Q8KL2QFAAHEBLMbpgjmE5gCgABigUnCAgamEKQIJAcQQMxfv35teP78OQMIg0L/169fcAxSABBAjMAw+A8zGtl7IBqEAQKICSaJbNWBAwfgbIAAAocD0PVwN6DHBSEAEEAsMNNv3rwJNgAUbiA+1DCUMMVmAEAAwaMKlGbQnYqcSoAW/IepQ3YlQACxIMczcmCA2OjiMDYsdkF8gABigQUKTLGDgwOGRphiEB/GhlkCEEAsyMEPEgCleFh6hRmG7EpktSDDAAIIJT2jK0R2AbKrQPEMcwlAAIENMDc3R0kI6ABmG7JrYGIAAQTPDzCAK1/gAgABxJiVlQWPd2B+wRnfuABAALEgOxsYPSCDwGkbmOGJMgwggFhgAYOeBmA+IpQSAQKIEZZ0kQ1Az5/4vAYQQCheAMU/rBhEjlKQ14A02GudnZ0ohgEEEBOy82EuQXYRrEyFRRs6AAggjJSInNqQxWEuQncNQAAxoQcizPnohqDbDpMDCCCWW7duwTXDiiKYgcgBC8sf6K4CCCAWZAmQYTA+yDCYYljgokUxGAAEEBMsjWPL/8hiyF5Ddh1AALHAQhc96kDZGsYHZWv0ggXmaoAAYsGWAtEDFmQYzGCY12AAIIBY0MsA9JhANhidBgGAAGLBkv4xogxZI3KJBQIAAQQuD4BZGh7KyAUIqFgntXwgFQAEEBNyVKPHENiFjIz/cWAGamCAAGJB9jFyECJlG3gcwTBahUcRAAggFmzlOKiWNTExwciOMAByGCjqkJMjksNIijKAAGJCL0zQExHIMdjYsFACRR1aqv2PA2MFAAGE0YrDVimjW4orz4ESM6zgQo42fFEGEEBMyA7AVRIiBz82xyGnD+RiiZiQAQggFvQiFr2wQ86zyOqwqUUuUJBDDpaYkR0IbWQxAAQQC3JRhW6BmpoaSnCiFyrYogxbAYSeiJEdBxBATMiCyEGKXqLDqkbk+hc9ypAxeoig64cBgABiwRXUsBoB2ZcwC0G1A3KLHpfP0c1DdgxMP0AAseBK4ejBhxzUsDY+ejsAuUZGjzJcjgEIIBZctQyyg2Chg8232Coc5IoY5lNsOQwEAAKIBZ9hyPGIzUforSBY+wQ9BGBRhi1kAAIIb0GErBg9KJEdhi3KsHkKW8gABBAjvmKSHgAgwAAbhh56uzX5KwAAAABJRU5ErkJggg==",
  chest: "data:image/png;base64,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",
  chest_open: "data:image/png;base64,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",
  gold: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAG1BMVEUAAAAAAACHVgmpbAjKjg3onQf9/1n/tR////9PcilgAAAAAXRSTlMAQObYZgAAANJJREFUeNqdk0FywzAMA0MsQ+j/L27Z1Kk0UnMwdQS0tkH4cWOi55NcZftfS4xCgnIcwVEon5lPVHEE+6V/nwURLgFUyvWj28Skl3hdxOCGQc4G8wtGLnqcmj42uMAyeJSzCYujwcNoJiyOAESEpVFNUEbPlgNNaFByTDwM/iPs+4nlHU77Cb0IYtJdEtd+IkAtxxYjVLyft8W47+exx2idDQbXsFGeDHM2Hwi9H4mtr3M2AlWNva9XNsglOPcVkJY8TpW+n8daK5tN32p19789zxdwaAcJGNbkuQAAAABJRU5ErkJggg==",
  trap: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABzUlEQVRYhe1WwXHDIBBcZfLM40qgBJVACZRACS7BJcgduAS5A555UsKVwCN/8ohR0AESjp7RzngGw3G32jsOgBMnTpw4jnhk81tngOZvnuc9m00Me8GttcsfIlotTtOEGCOGYcD1eq06eM4342wRiNZahBAQQigWnXOIMeJ2u0EpBWMMtNYrGyKC1hqXy6UZ632DwAo1Els2Uq0WemqgCO69R4wRj8cDzjkwM+Z5hvf+JcJAOwXRWgvvPYiocBZCADMDAIwxeBYixnFc2aW91tpmGroUSEFzxykYff4EV0pVbfeU6E6BVEI6TjmXtnu1UCOwyJ87zx2nMQD4r19CuU1O6H6/Y5omoNIXXirCmgLjx7ZtrYa6CUhnNUdJgdZ6rkYPgUX+fONW/qUCcj3tbaWhqUBNutpcXgOtI7uVhiYB+cXGGCilluMma0BWfuuUdBGQVZzAzCCi1ZmXCuTjnn6QE2h2PyICMyOEAO89mLm4eGQQOSaiah0UCrQqOYfWGs65wk5rXbTjPd8FgVbBpDmtNbz3qzTk88xcJdE6jolAtNZWv0oGSR0vXUYywF7rlWlIt9Pq5XMEUpkaiGi5HfPr8dDj8g/Yew7+E3wDyexoWx10BDgAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  fountain: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADkUlEQVRYhbWXwXXcOAyGv9ndAnj0bVgCOximA3dglaBUYLoCKx2wgygd0B0oN99CdaAOsAcRNCVnPDPeLN7jkwRIwA+Q/EHB50UuPF8lf90YUIPIMAytTvq+b0G07/4RkRijDMMggDjnpIAQ772EEN7pY4xXgbimAhJjZFkWUkqEEAC4v79nWRaMMSzLgvcegBACKSWWZSHGyCUQlwDIMAwoAB0qOWeMMUzTVHXtezFGmqn6FICNQw1urSXnXLPuuo5lWbDWnv3mnPxzDYD9VccwDBhjGIbhXcD99T8BmKaJaZqw1n4YZF9+AOfcpRAXpZ0/sdaKMUaMMeKckyElcc5VnbV2v/o/XISHzwByztVq5Jw3c18W5NV+byEiAPHeb4J3v37V3WCM0YV5NQndCqCKAvCs21FB3Cq3AjgoyWgwf1irrc8pJfg/pyCEUDnAWksQwVqL955pmpQp/+gU1IbjvccYg7W2XoHN824dXOwHH5VKYOV2DTSO44b/jTH0378TvnzZ6GCdEu0XXdedjXeOiCTGWFd2Sqlmpxm3hKRkowvTOYcxhpxzJaUyTVqNCmSPSNpMp2nabLGh7+F4hHler0ACvH6t+nmmX5tQ5Yl2ykpFDnsAm6zHcWR4fl6dAhyPBCDMM6EE98AJeClAaOxBARXpS9/Q6pUDzEEBSEqp9nGA4fm5Om0z9fNMOh457Ur3Uq5q31Sm3PdfvwLrlDUgVgAhhPUUk7MgIqkZ5CxJVkki1S6NrtWnxh52dkQkxigpJQGkbkNr7TpHBb1meAJSKblmqdkdis6XkZpvaGynxsY8Y62th5gKQOlU5+1pV9oNoGbwm3tdE3sgoTxP01R31KYCOee6un3jsAXy0thOu3dOwGO592wrhgIo/lX+VpsxBucc9z9/MjlHBmwZ6sSWIHN51hX8UHRzY8vNt5a3CvinJ+7u7hjHkdfX1+pD9FillbDWkh8eNmg95yXt7L7hBI5Hhm/f6hbU7T6O4xsT6pErpUTXdSuj/fhRmRAgPT5u97dyg+qagKGwn7UWciYXZlRfut03RFSO0G+93vtKrS3Ntich7QGwLmSgUrFS+LIsjOO4oXBt2++ouOu66li5vD2GK1PqrvHeV9rWjDVT3W4KUoG2Z4bfdUOBla9bB21g7Xpq12akNq1CSqkG19IXOduM3gFppe/7+ifknKsB2yqdCXg21q2n4lv+eK/y/S8pgwKPtk+brAAAAABJRU5ErkJgggAAAABJRU5ErkJggg==",
  shop: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH2AsVDRgondgBrgAAAe1JREFUWMPtl6GP2zAUxn+pBk6nAZNJ1SHjjZh02OhAUf6DGW/SVDRNGvHA8dPQNDIPTBoMKhgyLwkZf2TVpCMmq455oG2a6123Ss2l4Pakp9hJrO/Ll89+Nhw5in+9EFpt1ze7sKPdK3iMsT8C4cGDu+ERwHeROAq4eXwkEuEvXuhVhaOB/48HHQWA956UEgB1XSMiACilmquIYIxBKYXWmvW4TsJaC5DXWZYl3nu01jjnbgF573Gu2+Kc3XCTQA4hYK1lMplgjAFAvo8z0PRDeTjwAMhegz5pbTyG4JzLKSWUUtR1fWPQdv9QAk1sk6jrOq/7Mdgs8wUx2Nyl9I8A5HoDrk+WaT+MCedTqqpa+sTFIueci6JotnFadaSAXC9zW4WV3LllUIC8Mm1nChQxka0Ce8cXuVKjz06R+aK5F2PM+2xo91bAe1/EBOHXzYf+5VPs6Alv3zxHn50unX8xamZOZwRCCGit7yQRZ1d8+/oDmS94/+oZL97NGhKdecBa2yw2Vm1IyHzB50qQn7/5eGmR+YIvFyPi7Kr7pXh1zV63/v+n8c6B+nyKTCj0ZQfTUGudReSWqeLr6b0XowFAVVVFjBFjTOGl32o4aFfAlBJlWfZKYrAuLusCY4whhLAXCUn3fzrOh5ys94k/Rr/T40EMgdwAAAAASUVORK5CYII=",
  altar: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAIVBMVEUAAAAAAAD////w8PDg4ODAwMCwsLCgoKBAQECQkJCAgIB/cYNkAAAAAXRSTlMAQObYZgAAAKNJREFUeNrVkDsSwyAQxfLCL3D/A0fLLHFsCIW7qGJG2lfw+EMEWx9Bew/aeWlTqCvdD3B7D7e9S7DAWPonWBBAaw/CR9DSc4laf6dSzjklLC9jDhIBhZeLwAv3ZQ6gK8BfA/lxGb68dPYERindW/BdyIOumPFAx314nghGrGyM/YvEQmNkBCFDcWqtzTiCMA34SvVgctFpHqTPfIV2MILfELwBx7YG+SaqcIIAAAAASUVORK5CYII=",
  romance: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAABiVBMVEUbmN4AAACgeABgSAAHRpcAN4A2g+UAMnbAkAAOUqgfacYADyYJSZs/jO8AHUoha8kTWLEAIFEtedoALm8zgOIAJV0rd9gBO4YgAAAANHkBPIckb88wMBgAOYMUWrRgMAAZYbwGRJQdZsRJlvcAIlWgAAAAFTdBjvBRnPx2tv8wDAAAKmcOUaYAFzsADSGgzv8EQZAIR5hcpf8ALGsAG0ZztP+q0/8RVq4EQY45hugwfN4odNWn0f8AMHIAECkue9wcZcKw1v8AKWQAFDTgAAACPoqBvf8WXLZDkPEAEzAAFTUAEi4mcdEANXwTWbIMT6MRVaxSnf1hqP9Nmfn/AAA6iOpjqv+62/9IlPYNUKU0geNmrP8ADiQ+i+1wsv9Un/4DP4tLl/hGk/Rusf8bZMGNxP8KS55WoP8wMAASV68jbs2dzP8LTaEXXri+3v9EkfMnc9MADCA8iewQVKsQEBAwAAB+u/8AEzKRxf9orf+t1f8YABgPU6kFQpEISJkwJAAxfuAtLQAXX7nASBvrAAAAAXRSTlMAQObYZgAAAdxJREFUeNqN02WPHDEMBuB9k2HYWWZm5mNmZiozMzNc+8ubrlRpZueuOn+y5EdO5DgOS6AfjnMDEV4OyNy5BO5wfcErbnGBAfGvK1re+i1u1JkbEDA4D/pJghfl7Fg0vCCbBQx/Lt4XmIh/CxzfLI47OQuY4tOc6xJYpo2uPJwUjvfH4maBqsoZEx4mUAxGl2euvLlxVQyagVt1bq3c0zxA6sHMqutzs9kR/LIJ9Ka56wEam9XwK30nYTz1ZY7KfkuHa+7W5Scu8oxwynaxnB0/GQ6IlluuhQX9LmIkBkXWfdlJYVVP18zAqQZrOMzTwzx29Oynzu3mnmKd1AYfRX6R5BcBISoMl5d5WEfNq9/bIJRQiQKlozkeg48x39MgjUhJIsGB/ftzQ4MtvGpXieERSRIKPNYNl02sN7yKCBCAEW7zeWZo8JBqQ4RIQSEx8eLlq5JNdF+7IYQIJRLBztuOrQWbBqrtd3jPBPQPmVwJtoX7WHBVfKEkpfiSyqV8djA17Q+1v9Ik2GodpJbOEF01XvnxE9tMjBzMnjJgu0YhNF+p7e4yEUkn4LALBP2hwpoTLO3VFZxJsBRsrP8V2DC0vrAbrRUG2Pwj5rqVeH6z4n8/6d6mrWr/jReMP0DQPDMEOjipAAAAAElFTkSuQmCC",
  surprise: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAGFBMVEUAAAAAtw0Atw0Atw0AAAAAtw3g4OD////kxKsYAAAABHRSTlMAIEabSiCCNQAAAHVJREFUeNrN0jESwCAIRFHQNfc/cgxmoMCVVoo070+SUeTCAQofA2fvfeDorVnBXdUK6phjBfNnjhXUvWAOeJFcMUnke9qfJpcIJIrwdc5/tYoUiDt5BfEoyAeiWIH7vkiej0KLy0BxncT5wvCV40tbrv198wJVugP1PuXlIAAAAABJRU5ErkJggg==",
  blood: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAHlBMVEUAAABSAABbAABkAABlAABtAwRuAAB3AACAAwn///9ETeKrAAAAAXRSTlMAQObYZgAAALlJREFUeNrtkcEOwyAMQ0MMhP//4sWBVlk2TbvstifRotg1IZU/PwX2WTeUgsbDkbfMK9YAqIYTJYMlo2FOJXxlnRWxA6DTqV04rFOni9uiT+qsB3SxLzkA4FfHhIjBSAmRu/XeW1M1GLI+1hr7bMJuUCa7xrATQ5TAnroE9XOQsWdzNI1y3/Kw93LPs4dOeD+uvaujYhVXwOuvYxUkXJBK84T9G4csQPOQkieX2u2IVfFA+cxsXb7hAbkeBehDW2cuAAAAAElFTkSuQmCC",
  skull: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACkElEQVRYheVWvXkjIRB9e3eBQ8INxxWYEujAlKAOtCVwmUNK2BLYDnAHhMo0HYhQ2VxgwSfZay0rb3bv+/jYH2AeM48ZgP8d3QNzZKN1Vk8UAIgxIqWE8gwAIYSHibROkBgjlFJQSiHnDABgZjBzJXMhsorE7xbjIQT0fV8JAMDhcAARQWuN8/kMpRSenp5wOBwcgL9bEnDn8xkxRvR9D2bG29tbDUPf99BaI+f8MIl7EGutEJEQkTDzzTsA8d5LCEFSSsLM4r0XzAt1Fr9aBhEzjuOxxrt8kygYhgFEVD0AANZatJJYJOCcAxOhMx1yzjDGAACy1ujMh95uiBHVMS34szSAiMDM8N5Daw0iAgB472tPRHX3AOop2YRAMR5CQIwRzjns9/v631oLZq5Er49pC5ZC0GmtobWuSadgv9/feCfGCGaG1hrGGAzDADToYNEDwIdLvfc1tu/v73WXSimklDCOI5xzSCnBGHOjix8TeH19xTRN1QtEBCLCy8sLnp+fEUL4ECtzzQ+bgohERGSuV0qJtVZCCOK9F+ec5JwlxtiUE5ry9iXpzIrrdDphmiYwM3a7HVJKVYhKKWit79ppSkTMjOPxCKUUTqdT7cdxxDRNtUYUEa4Jw6pyHEKoyv8sMmMMUko1J+ScobUu+eFbO00iLGSttV/iOQwDcs61lcLU6omHbzJXqKTK+S+1oXy7Z6dJAwvoSiuXlhKeloy4BYEb5JxrvbhUxbteXqOBa8ye7VKgYoxfUveWBMRaW3d53RejlzoANGhs9a14t9tBKVUNXt2IH123zbgxRi7H8HO7R7h17DKBcgdcGtfQbrA6BDPz1u6s+/blB0RaSMza+qlYWnf/rZ1NU/Ej6/8Ddk2NCyjv9PQAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  potion: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAABF1BMVEUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABYWFgAAAAAAABycnKVlZUAAACGhoaNjY0AAACjo6OIiIiDg4O4uLi7u7u7u7sAAADGxsa1tbXZ2dkAAADW1tbd3d0AAADp6eny8vIAAAAdBBZCBRxDLz5ZJDhbSFVkZGRmBARqOCJvQFJvQVN1SVp5IyODdn+IXzeIYnCLQUGQSEiQkJCRBgaXFBSXdoOkpKSlMzOmbW2pPT2pdTivSkq1hoa3DAy5jIzAcnLCMTHCdXXHQkLJycnLUVHLusDSaWnVc3PYqKjbra3csLDflpbjSy3rvLzxqYLx0NDyrZ/ys5HztKf1v7T1xLr2yrL3zcX41MH53Nb759387ub////tN/HIAAAAIXRSTlMAHDk+QkdKTk5RVVdoamxwcXJ0eIOEjI6QmKmqq7HGytkkDWDLAAABOklEQVR42r2SazPDQBSG5VTQuK1WxZ3d1e7WpUGWINQt1K3EXfH/f4cjmWmjmY0vxrsfn2fePXPm9Px1KCYT+77v6BXqCsd3qsKlOkEEged5rtBXiKqDDci1f+RNM58leOYgmNnCGJhuhhCYpV+EkUnoRUHLixMlyBXR0Amjc0Ogr6CfhYXpAYBcITbSfGp2cRwANJ+gcHIbHteVUlJGQopfvoZXKs5GZBhggZEQ7lutm9OI1xUKiIlNoMOPnj/e314e7prNuuIrLu23yMy8nRD2w6fHxg4OwDkv4xTDtm0Ty+gIMrxo7CmpOBqr3wKxfo7Ar88U8qhhXQpqEcTJLcrDLaQRXz5YQwG61sx3yxLrGWNL59ubgoLRfU2swiQ+VqnVkPcZ6YNknGE/VsiYp4124v600Q7if8wXmO84hTjb6ZMAAAAASUVORK5CYII=",
  ether: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAABC1BMVEUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABycnKVlZUAAACGhoaNjY0AAACjo6ODg4O7u7u7u7sAAADGxsYAAADd3d0AAAAAAAARP9cRbN4aEdccC6AfStkhDGYqe+ErlvE1guM2Ltw4KatFo/JGjOVHNYBKbeBRSuBSRbZSc+FSqfNTRrdVdeJYUuFdTpBkZGRphuVqOCJsiOZspOp1kOd2qux4kuh6dOeBx++DecuFequIXzeJtu6JxPeQkJCRjeuWkuyXv/CYv/CcwfGez/ii0fikpKSpdTiru/Gx3PW0wvK02fq53Pq91vXAvOTE4vvF4vvJycnR4vjV7PnW6vzm9Pv///+f5Kf/AAAAGXRSTlMAHDk+QkdKTlFVV2hqbHBxcniEjI6QqrHG2Rfd+QAAAUFJREFUeNq9kmlTwjAQhm20Sr0qWI9sskZEEcWDgCdSqXfrjSD4/3+J2+kMIJ3WL45vPj5P3uzsZOyvwympOAgCN1nhnnYDt6Y9niTodtv3fU8nV+iaSw3EE9/ImGYmTfDNaWamCwvM9FKEtpn7RZhbYhMkJPLsYo6NZ8lIEuZXZlhyBf8qvd2sC4BSZMT5yUOnCmF2IiMmNFvdDUFcQCjE+WOr91mv5/MCMJrTYBYzhoT7Xve2CII6pCSBsO3YbMDPXrsfl09bICRK2Pf4lGUvrzpDQrnzcne8BwAIWKCKWcdxbMsYCLJzelQUIBERyqFgWz9HwOeDuqARUCJUpeaWTXh4i/J6DUAKoIbdqwIJbGTNeL4Z3lYKtt8vDjVnxuhvUhUl6ahKo0F80oh/SIUKkSqUjHjc6Cfqjxv9EP7HfAPofjVWWX5HQQAAAABJRU5ErkJggg==",
  bomb: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAC9ElEQVRYhe2W4XHjOAyFP95sAerAKMEdGCWkg2MJ7mC5HaQEXgcuAeogJcAdsAPcD4qy7NhO5rK7f24xwxFEkXwPjwAp+GN/7IsWYWGWY/i/BdT9GNvn1o8ov47EPcBbf6gwVPkpdiux+zG2cj+SvtaXD0l8+wwB90ZEifP5RIRFSpocovc15lQxcohPiLymCIt5rqhWgFsS6TOYG/Dr/Y4o4RzXNpLQ/RhGHgkZQCxzrvpuCT1lY5ZDta5jnE5iFy+ArbPPNNwaKDgNsWlEj1le/XtK/PUZ8AiLiBI7JnZMMB9g/n5RaQHHlndtmOVFwQZArS+3EPGUgGpNI9nO6cQ5tT7Fvl8PDEVkuupyGiITznElkPOJnPfvcO4SGFm/203MqQIskS/ghxn0B2ca81xx6SAddIlY3nBr5HIBvSX6kMBg/cjmua7+4ZDvzpM64dpWQjnvKcU+R2Aw/Se9XX/QH72xJN5QgIbhmHofV8Bz/+61YWRUZSWysXhHYCTfKLtDZJzGeWmEIjpRyxviE6a+RnkbQEcEK07Op3uxPk7CDSWgJxYOc+oR57zHxK+BmVATyN2XOkEFKdMaea3Xqr4jMNiLvKa/48g5tVWFYU7D5BK5mnRA64oIyxp5WsnU+kYp+i68hweR+zHM/BKNT2vEWzJqgmtD6BUwwG9NqeS8/1gB6JeIeyPnU4IlD+QCoibrWLOuxBZcmFbfa8OKL+veJDWkD4/ihX4Ht4apdwJ6OXbR7SQQ7eC1vOHeVvnvlOFjAtuj2MgxFh6lNbbGaVD7HJEJ0QmrjntDi6DUh+Dw5DoepSjympSaXI5h+JXMPUzQLNdbkPsW6MLs2cH2tAxFXtP4qRB5TdS+p5KnrsJ27NjzURlDFu7v/acIAOR8SjnvY/Ehby6b2tAsAFh1aulAI+n6nPcX0F0mH1kpGqVYAmLUs5YOPlQZUdf6gntbE/C/Yj4kwvJnU4rGok6M/vH+oP00uwL6CuhX5Hi2+Ndk/l/Zv1xzFx2P/dqPAAAAAElFTkSuQmCCAAAAAElFTkSuQmCC",
  ration: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAHlBMVEUAAAAAAABWHACDMQCaPABtJwA8DgBtRQDn5+fn57iMynFpAAAAAXRSTlMAQObYZgAAAMlJREFUeNrNkksSwyAMQ+sPNtz/wpXCtIxL6LYV2T1JKJk8fiC59AWrmXmTEwfEgyMnrqruMJmc8h5qUKbccEQRj7Rm1uSuP5L1uhoKz6vfjY6WbKgcBHH0Oy9oUb+GuIYGLEwbDKEClX6PVz8uoIF65ymkOY88wYuhjz7mfor5YpDRL9l0MP9Z0MdgCUemMR9SN9LAYw35wlcFDxw58wuvkXjgy43PlcRUJy94vcZgwcbLCCgWrxLOgIX8+LvSUPhuWfxkAf9HPQGNJwa/yF7nhAAAAABJRU5ErkJggg==",
  key: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAADAFBMVEX/AADgAADAAACgAACAAABgAABAAAAwAAAgAAAYAAAQAACAQECgUFDAYGDgcHD/gID/QADgOADAMACgKACAIABgGABAEAAwDAAgIAAYGAAQEACAgECgoFDAwGDg4HD//4D/gADgcADAYACgUACAQABgMABAIAAwGAAAIAAAGAAAEABAgEBQoFBgwGBw4HCA/4D/wADgqADAkACgeACAYABgSABAMAAwJAAAICAAGBgAEBBAgIBQoKBgwMBw4OCA/////wDg4ADAwACgoACAgABgYABAQAAwMAAAACAAABgAABBAQIBQUKBgYMBwcOCAgP+A/wBw4ABgwABQoABAgAAwYAAgQAAYMAAgACAYABgQABCAQICgUKDAYMDgcOD/gP8A/wAA4AAAwAAAoAAAgAAAYAAAQAAAMABgMDBAICAwGBiAYGCgeHjAkJDgqKj/wMAA/4AA4HAAwGAAoFAAgEAAYDAAQCAAMBhgYDBAQCAwMBiAgGCgoHjAwJDg4Kj//8AA//8A4OAAwMAAoKAAgIAAYGAAQEAAMDAwYDAgQCAYMBhggGB4oHiQwJCo4KjA/8AAgP8AcOAAYMAAUKAAQIAAMGAAIEAAGDAwYGAgQEAYMDBggIB4oKCQwMCo4ODA//8AAP8AAOAAAMAAAKAAAIAAAGAAAEAAADAwMGAgIEAYGDBgYIB4eKCQkMCoqODAwP+AAP9wAOBgAMBQAKBAAIAwAGAgAEAYADBgMGBAIEAwGDCAYICgeKDAkMDgqOD/wP//AP/gAODAAMCgAKCAAIBgAGBAAEAwADD////g4ODAwMCgoKCAgIBgYGBAQEAgICD/AIDgAHDAAGCgAFCAAEBgADBAACAwABjw8PDQ0NCwsLCQkJBwcHBQUFAwMDAQEBB/Wkildl7Kj3LlooL/tpH/069oVB+AcCCqiDTAoEDyxE344GD8/Jl1aViRh26rmoHgwKDQqFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABHbGzm1GiTAAAAAXRSTlMAQObYZgAAAAlwSFlzAAALbQAAC20BgA6k0QAAAAd0SU1FB9gMHBUjCEcZrwwAAABfSURBVDjL7Y0xDoAwDAP7/4cS7NEvIE1bERUJBhBTT1nSnp1SFt9CPvwD0AuBhNmN4HGTeGEfEWsCZmwI8v640iG2mFOQWkmH8IiSUDtyoQuhJaFeUSocJGHa5pfFDxyN6JkFaWuI2QAAAABJRU5ErkJggg==",
  floor_cave: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAAAAABWESUoAAAAAXNSR0IArs4c6QAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB94KGQEuGe3vHJAAAAACYktHRAD/h4/MvwAAAiRJREFUGBkFwQGO3DAMA0BSku1NigL9/z/vNrElsTP8K81ORZurIJYLaKoZOkZEq98FyI+MQkMfAPihqUyEz7KbIzaMtY56TVxjZFt/kkzzYf8O8fYVtjfF+SYG0so4/Rh9eJHQH6EZrXvPikwgMitB+vqXJNMgEeli5R4/qirAqeXLZNiyFFK8emZcaJqwqgU3/cI2+aLdPrcWPrnBjpgEgPDVKgqNcdwB0RpbDNOhacrnJyxUV5cpAKZ33SM7CwRq+WW809unzW5jcdcwDMAxI/IYAODFLuLCRmRdASAm4IDBp3NknFaWqqrAdwJXwtqg0R6KBBKEOsMWh+QYI1nlrylkAAAb5hsIBNfGBQDUa1Z2+wFedlY2aRZDji8AwIzm9mX9/AoAGg4LfJW4ABRkeuCRgvTxUKGRWSlEDiSTaMAn1bQ2aqQ3sv1cQCYeDCbaRBIUwXKSZsceAHwp4dIKSObANhBtftoBVVFlHAmarctQNEBEwDtNglq2Mh8oJMrHFgOYsmM43EVbhGSNIMVRY5PVx4pyb7iC9mhzVfD6zjfDsIGGEANGiZ1ThLbbI98AASlMxsEd4NpdAT0IUx+bBnUfwAE82Bd+auFBAz7cVtcgydHsHJFgZi8g4npgrgVwzqpbt4bt36lV80ZEBP7QAwFHrUSZndEzGIwnAAKn0wNOyI4uWFXLYMe/2uOlqnUi5ndtu54qJMYXZewk7t/YXS38Bwbpil8rTgc6AAAAAElFTkSuQmCC",
  wall_cave: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAJFBMVEUAAAAAHx8AKysANTUASEgAWVkAenoAl5cfHx81NTVISEhZWVmtW6F9AAABlElEQVR42n2S0bbrIAhEEwEF/P//vRu0qz0vd6yJiXsGkubZebR/lRn1i9jx7Blzrqk6p65lipaaiC6zuZY/e8XcEe3YwawDilJOf5KEtDkNMzLOIoaEddgD4AZENdTl9zGzkAbMSUjDfBM4i8gQS3V9ns1mzWOs404mQy4wXbdmbBt/BS3RCU5WyB7U/3kPI0ZqAxq2D/DiexmlHO2jSY5jG/MFQeelAoQ5vk7QAqLuvTcgGT4+AE0KCZXx5m6/vz8JNNkJ+JMy7/uyqLhK0OrBpfsYQQKzDtBfwACMK0y1R8gHYOsmeAPcK4DlBYLq1UPIVkoeAHUP7VCfXcL28TNGN3lbBPj83RYalZIZKBtgSOgBuhx3X/yj5snI+5i3Qc1074SbId5AWJi0QXV8lQIgDcw4j9nOUi+8O3A7AKghEs5HN1SUbYBOcAW4xkDu0ZLzHtwcEA/GcbroTxal+gJYAP6tzUDuNTuhSokqGS0zERPFXxcNLKdozVav6tfKLjHXnIrWWjqRGTlz2WQDAPb5n/4BBJ4YgggPiqYAAAAASUVORK5CYII=",
  floor_crypt: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgBAMAAACBVGfHAAAAFVBMVEUAAAAREQsYGxMhGRAiFw4iJhkuMSJBrUPIAAABJklEQVQYGQXBwW3kMBREwUe5904K4zv5Ad0dQg/QAYwIKAAfnH8KWwVAkKH30fpAJlbS+hpr1U2IYrmxejvnwgYI9FbVa2GELQ2OedRxg51Y+SzmPMYiRpH9zN6pdZNEVsI8ZvW5IDZxQjvPuT58OSCjNzVH3Xz9IIGI739VN8KxEzDMdUMsEuR813F8iFob9E5/ca55Y9hrrTFOHc/z/OK8r1XXXQ0Zg+U6qtaxXo4cnPZc11NzEYxw3lXPtWoptoXDXt81awlDsFrN2uO4X44Q0vuZZ9W5XxIY+/1U7V0LIgnDrqeuqm7FwWl711PX6op/DPG+zlq7EFZI2qcGo6oLIrD/nmfvfSlOBHqP1kcb7RXZQrFNsEniAAhik2AEJAYUIif/AUB3RbgIGUbLAAAAAElFTkSuQmCC",
  wall_crypt: "data:image/png;base64,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",
  floor_ruins: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACRklEQVRYhY1XwZGDMAwUzBWRJyVQgp8pgzLyTCl+Xgl5UgIl8EwX3Gu5ZVkZNJMhOJa0ltcrp6v1tYXYMDxiXb+nsYg4jWfz2db1G6WM1r/n4Pod7/jAGe+cgMcwD0nhy8nxvXcIdeK6fmOel9tVwLx5Xk5z4D9Nz38ApYwn1ApEE/P3YXjEPC/pNrjyA1znOJChRiBdGX7XCul28hxYzwNIoE4IOM9L1PrZg/MeMweUMw5MKWMMw+NYAUXO5EKZryyL4VYfQSTMkON3JHdV4jE9IVwV9+zW9XcDgVpI1TKgV6VXX0tCrogGc2PgiSOdxtE5PxrICZFjeFYFWCnjgTNZJXpF694zAeKgEBYnQsoRBn+S4qz8/LsDhITupPAYfE5SrCCcvmvijLCZVMO4It37PW3Z8cusxRUGwPxx+hAhp6BFOE1yB3B2Mjj+TkJdAWt/K3nGbhUk2DQ9DxLeqyObkqclVo5D0HutALf2rtbX5lbDx8X19az8DBC+rfk7B9xJuJJknnPVsLLq9RxAV8KBORA/ebzVsDKZ7lvlj4jDTad1pJwoObBWCbWZuAbkqqJt3I3z07XtgxQDCH8UkCsrB9Y9dmTmO2jzWg6UepwwhmBachgS6Sngbd2lmAPcuZBoJfhWXevn8iICYIdL6TQ9UwXTPxlsjoA6jndd5EEJtZScNGu3rVaedU8G0tX62pxDth1XnVAT6bFTu/xj0uKFXrsYEPu2wPbO6eoiCsu2TGO4BWH+rX/H+lSpdffADAj71vqJP0PooIkBB7ClAAAAAElFTkSuQmCCAAAAAElFTkSuQmCC",
  wall_ruins: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAC6klEQVRYhZ1WUZHrMAzcvikAQTAEQwiEQAiEgxAIB6EQDCEQDEEQwqDv42Y1G9XJteeZm/Rk2dlo1yvfzOyJN0cpBe7+dvydcQeAZVlQSsG+7zAzrOt6iO37DgB4PB5Y1zVinP/+/sa6rnB3mFnMresacQ4zA4DY885g7z0mSikAEDH97e6xeNu2+M147/2wn+br08zg7j8AOPZ9fyklNzCzAKZVUcA5rvuOAADALWuAfH7K92idmcWXno1brfXp7sEVNyDKfd/RWgvu3R211gPfoxzO9d5Ra0WtNeZaa5jnGWb2SkFrLcqjyN09/tccLa3mEIS7Y5qmg15YHXfHv7wJlZ3Lq/wyP2+ocVZA4xm0u79qIL9YK3Glj/wiPs80wD3uAPD19XVArih771iWZQhAOebLVBPTNMXpUWCqkXsuJ9Eypue4tQbgxxM0f5qmQy4/gl9Pb9A5xkIDGcioGvospbzwrqA1ri/PFRhqQDk+00HO/bQfMD98YFmWQLVtW/BKAAShc/zrvR98gKVX6njutYoAjj7AReS1937YSM+1lll9Q6sw0oMCuNQAE/Q45aG85rjup96SvSE08Nee/o4GrvpH+ICi4oaKOvNYSgnu53kOr9dWrB6RgRzuA3qGr1qniitrg16fhVZrjbmRBl6aUd5A0Wss+0Rew0qM9DHUwIgf4NgRR1x+4hkau/SB3Mez/7fW4s6oNquc53sFvzjr4q7IWDLyNc8ztm07fJWWlHO6hh6RfYL2S4oILgBk/9aXZU8/m7tao31A+8ZbveDqnF9pYJSTYzcze5JPd8fj8Yjznr2ecZ4IT/c7vTnpV//aC8g/UdZaD/e+3AtUeGzLjHOooDVHwYUPZBPSfj06x8qzGhJj+Z4wuh/8eh/IXJ7pQvPOuM576biZ2bOUEhzpWeddkZuwxNkHaLf0E60qczMYViOOIS8i/M2n3gly61WP55N/mbozjQSAM98e+cJZPl+Uyz2Kce1/ZXGbM2SeZCsAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  floor_hell: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgBAMAAACBVGfHAAAAAXNSR0IArs4c6QAAACdQTFRFABAAABgAACAAADAAAEAAEAAAGAAAIAAAMAAAQAAAYAAAYEgAgAAALoGIaQAAAapJREFUGBkFwbFy00AUBdBXBVoBSuADJNNS2PTMyKa0NntXUoZGtt9bKbiRwbtKRxFLTp1R3NDaDD9AlTZFJj/FOQREKKwDALMRMHULrl+urOzdSBYdIhqU+bMeZHOzj92Z54juRtIujY3tQ9me1fYXVa/a/qcgxC7t7e+rOVX9RlYAAGOq709MsuBkprD7Wxyz63uAbLybznSBb4+c9Ssw2ThPg3EBTgZ3K8mSmi43F9scmiVuP3+ZUNMxWphQl9moK9+0BH96dkAyvnQbGTxol6//dWzG46nd8ABQkbkPTiENpF8UAKiQH/1xwZmXj2WOFMSHFWBjx5i2DAVClyCT2K807MkgJJgExr12ZQq5YwQU2em7SDrhILMvz0aRriaJWO/FZ9fLNUBm8knq/kFiqfxEciZp3rcHeTpGkP1Xi4Fsc1H7+hGXUDJz0pJYV9ubBJfQK7mNWwIAe0qgkGo72wtBASPWANK3gXgmKCijtYZBcN4JExApo7VGyuV5J6AQaWqGIIHCwTcKlCANizIIERVclQo0BzjfNluEFbwEoDkzWDIgMqYV4D+Wn7qt9WD4GAAAAABJRU5ErkJggg==",
  wall_hell: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgBAMAAACBVGfHAAAAAXNSR0IArs4c6QAAABVQTFRFIAAAMAAAQAAAYAAAgAAAoAAAwAAA+mNRwAAAAVpJREFUGBkFwbFyE0EQBNDu8QUWgXZGEJHoTpBT8A38PgTknHQRCb7pdRWUTZV2eI9fb5/Rz1cw2t6x96nu3048Vy8c15PsaB6EUkIJCvhEC4zMlV/AHpWTI2o8rR/qu32ao3ZjW3z/saTP9w1aahKl5xntWnZMnt2qnn6nBwMeN/R4eH+r68urHw7JGAf7M1XbA+gYyIjbWzxc3ox/j7/42PECvB7+mvvmdhlAsGovWFReHV4FeKJkqXCR6enoc8K0RzbXMwNJzm4sQGjNvRRON3fGrdypDMFhCcSQiGIUSua9ZawbSktA0iR0BYQkq+BurNadfu3hauqwFmq92NqoYeWwKDkcnR3bHHQjWMlqQI9Sd1tRnmKwJQpnGJTbpYleQ3LAnHMARXS1DSlDw5oVlUUsECe+mz4uaugtIU9N3JN7/MyIWkncpx3SBSVw6NR4xwIA8GA4gIj/EVXWto10fsoAAAAASUVORK5CYII=",
  floor_lair: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAG1BMVEUIFwILHgUTJAkXFwIXKQ4dHgUkJAkpKQ7///+p+qbaAAABcUlEQVR4ATVTAY7DMAwCXCf///EGKNWp4oKNCe5AkYAIfSSG8uMjoNQg/P5BMamlO0gKQUBEjmX6b/7AJU5Ko3c/gvo+sSfnABgBWEmbeldoaYLAnkVtuYkTD+hc0C27lhaOC+I/vZnns4hfLL7IUve2Io4tO+d10qKfAv6MOBtMeijI5OLCw7k6bBqm64hE7NCC4FaxTR8+xtaekxzbkGtm7PdnSPP3LDBb96PzbIG0KafisBqJnbLuGzn4Uonh8ihr7r1ZjKHn2PCICPYyZrORkAmuUtD6MtnTCYyyuTIQjckYxKz5jghyDpAotKB2UtoAZQU2ug7PZPraqdaLzW/PDMkGt5i3BWAQ1CSJc+9pdFHpDd6X1IJzdzZO3JePIAyBeDkWGGPnrCvFiwC8r802dVmjK4oWeit6yyH6LMkXM5ddObYcOMTMsB5ZX2+TRM0xWzAYJGEbSWg4k2vI+dLYJqTTlool/RT0d/Zdw7QRP87IBlQyGVO/AAAAAElFTkSuQmCC",
  wall_lair: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAABGdBTUEAALGOfPtRkwAAACBjSFJNAAB6JQAAgIMAAPn/AACA6QAAdTAAAOpgAAA6mAAAF2+SX8VGAAADxklEQVR42mKUlZT4z4AGvnz9ysDDzY3CJwRwqUcWxwYAAoglyM2e4cGjJ2DOx8+fGT4AsTAfJ8PDJ88Z+Hh5GT4B+SBakJ8HqwHvP34Bq2H6/xfMB7FBQF9TDUxfvH4LrlZeRpJBAGgWPxCDgIKcDANAADFLCAk0gCz++esXWPAHlP746QtYDGY5SCMHOzuDuZEBA8O//wyMQDUgPiOQIcDHy/DqzVuwepAlCtJSDPramgw/fvwEy70EysHM5OBgg+sV4OdjAAggRgcTPXgUfIC6HtlnIANBwN7CDBxSH5HUIOsBqVeEqv2ApgbkeFhIwEIBBgACiAWb5SAA8jUsOMEGXL3OgEstyHJccjAxWHTC1MIcARBALLgSB7JCkAEwGh8gJI9NLUAAMX2AJjx0y2GJjhRDYY5GDhFC6gECiAmbIMhydENwOQSmDuZgdP0w+hMO/QABxARSgKwYpvkTET5HdiRyqKFbju4ZZD5AADHKS4j+x2cZLBtiCxmYhcipGpba+ZDE0M1HLl8AAohRkJvjP6zQQC84kDUgAwOgelAhglyAIUcTqBAjBoDMBQggcAiA8u8HaBYJcHeCG3zo1FmsmmD5HVcaQQ4lmHnIjgQ5EORpkGcBAogFFIzImmGKQcWlnZkxig9hoYMvZ8Ash1kMKz+w6QF5BiCAMMoBmGUfsWgAlWLIvoPFPTbDsZWaMAfyQcsUkOcBAogJWyqFlQ3IBiOzQRYjJzwBtDQCMvgjFr3YygeAAGKBaYBJfsBR1pNb+qHLI9cvIAAQQCz4Cg9sGkgpdrFZjp6jAAKICT0EsCUUWLaCqbkP5CMXYMRUSrC4Ry8TAAIIaxrA1vgAOQKU/UAGwDBML7Jj0PWCxGEewBaaAAEELgfQLUMPEZBGUL5FTkyfSKikkEs+dEcCBBBWByA7BJTCQa0b9GwFK7hgvoI1WNCzM6z8QHcEDAAEEAu+mgoU5KACCWY5rF2AnBXvP4FED658j14fwGiYQwACCFwSgizC5Ut0Nq7U/xGt3EAuG2DFblyIP0YDGCCAwIkQ2Zf4LMcFCGXTD9BogtmBbA9AALFgcz2uEg5XOkFWj8/hD589w1AHEEBMyArlpaTAmNgCBzn7gdSBygdcjsZVRgAEELxJBrP4I1JCI9b3yHmdkOXoACCAmJAT0UcslRAx4BOR6QVbUQ8QQEzYKiFsxSy2NiBygcRHZKih1zsAAcSEqx74hCckYBaT2nBFLmVhNEAA4SwJkQ1H9x2hRiwu87DJAQQQEzEGYWvVwjCxluMCAAEGAEyw6EY2mrWaAAAAAElFTkSuQmCC"
};

// src/frontend/dungeon-ui.ts
function esc2(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
var you = (s) => s.replace(/\{\{user\}\}/g, "You");
function sprite(key, cls = "") {
  const src = SPRITES[key] ?? SPRITES.skull;
  return `<img class="warp-px ${cls}" src="${src}" alt="" draggable="false">`;
}
function bar(cur, max, cls, label) {
  const pct = max > 0 ? Math.max(0, Math.min(100, cur / max * 100)) : 0;
  return `<div class="warp-dg-bar ${cls}" title="${label} ${Math.round(cur)} / ${Math.round(max)}"><span class="warp-dg-bar-l">${label}</span><div class="warp-dg-bar-track"><div style="width:${pct.toFixed(1)}%"></div></div><span class="warp-dg-bar-n">${Math.round(cur)}</span></div>`;
}
function memberCard(f, opts) {
  const cls = ["warp-dg-member", f.alive ? "" : "down", f.active ? "active" : "", opts.targetable && f.alive ? "targetable" : ""].filter(Boolean).join(" ");
  const tag = opts.targetable && f.alive ? "button" : "div";
  return `<${tag} class="${cls}" ${opts.targetable && f.alive ? `data-dg-target="${esc2(f.id)}"` : ""}>
    <div class="warp-dg-member-head">${sprite(f.sprite, "warp-dg-face")}<b>${esc2(you(f.name))}</b>${f.guard ? `<span class="warp-dim">\uD83D\uDEE1</span>` : ""}</div>
    ${bar(f.hp, f.mhp, "hp", "HP")}
    ${f.mmp > 0 ? bar(f.mp, f.mmp, "mp", "MP") : ""}
    ${bar(f.tp, 100, "tp", "TP")}
  </${tag}>`;
}
var TILE_ICON = {
  start: "exit",
  stairs: "stairs",
  treasure: "chest",
  trap: "trap",
  rest: "fountain",
  shop: "shop",
  event: "altar",
  surprise: "surprise",
  romance: "romance",
  enemy: "skull",
  elite: "skull",
  boss: "skull"
};
var TILE_NAME = {
  start: "Where you came in",
  empty: "Empty",
  stairs: "Stairs down",
  treasure: "Treasure",
  trap: "Trap",
  rest: "Spring",
  shop: "Merchant",
  event: "Event",
  surprise: "Surprise",
  romance: "A quiet moment",
  enemy: "Monsters",
  elite: "Elite monster",
  boss: "Floor guardian"
};
function tileIcon(kind, cleared) {
  if (!kind || kind === "empty")
    return "";
  if (cleared && (kind === "enemy" || kind === "elite"))
    return sprite("blood", "warp-dg-icon faded");
  if (cleared && kind === "treasure")
    return sprite("chest_open", "warp-dg-icon faded");
  if (cleared && !["start", "stairs", "shop"].includes(kind))
    return "";
  return sprite(TILE_ICON[kind] ?? "surprise", `warp-dg-icon${kind === "elite" || kind === "boss" ? " danger" : ""}`);
}
function board(v) {
  const floor = SPRITES[`floor_${v.theme}`] ?? SPRITES.floor_cave;
  const wall = SPRITES[`wall_${v.theme}`] ?? SPRITES.wall_cave;
  const leader = v.party[0]?.sprite ?? "pc_adventurer_1";
  const cells = v.tiles.map((t) => {
    const title = t.state === "hidden" ? "Unexplored" : TILE_NAME[t.kind ?? "empty"] ?? "";
    const bg = t.state === "hidden" ? wall : floor;
    const inner = t.state === "here" ? sprite(leader, "warp-dg-icon") : t.state === "seen" ? tileIcon(t.kind, t.cleared) : "";
    const cls = ["warp-dg-tile", t.state, t.reachable ? "reachable" : ""].filter(Boolean).join(" ");
    return t.reachable ? `<button class="${cls}" data-dg-move="${t.x},${t.y}" title="${esc2(title)} — move here" style="background-image:url(${bg})">${inner}</button>` : `<div class="${cls}" title="${esc2(title)}" style="background-image:url(${bg})">${inner}</div>`;
  }).join("");
  return `<div class="warp-dg-board" style="grid-template-columns:repeat(${v.size},1fr)">${cells}</div>`;
}
function herePanel(v, ui) {
  if (v.event) {
    return `<div class="warp-card warp-dg-event${v.event.romance ? " romance" : ""}">
      <p>${esc2(you(v.event.text))}</p>
      <div class="warp-dg-actions">${v.event.choices.map((c) => `<button class="warp-btn" data-dg-choose="${esc2(c.id)}" ${!c.ok || ui.busy ? "disabled" : ""}>${esc2(you(c.label))}${c.chance !== null ? ` <span class="warp-dim">${c.chance}%</span>` : ""}${c.cost ? ` <span class="warp-money">${c.cost}g</span>` : ""}</button>`).join("")}</div>
    </div>`;
  }
  const parts = [];
  if (v.here.shop) {
    parts.push(`<div class="warp-card"><h3>Merchant</h3>${v.here.shop.map((w) => `<div class="warp-dg-ware">${sprite(w.sprite)}<div><b>${esc2(w.name)}</b><div class="warp-dim">${esc2(w.desc)}</div></div><button class="warp-btn warp-mini" data-dg-buy="${esc2(w.id)}" ${w.affordable && !ui.busy ? "" : "disabled"}>${w.price}g</button></div>`).join("")}</div>`);
  }
  if (v.here.canDescend) {
    parts.push(`<div class="warp-card warp-dg-stairs">${sprite("stairs")}<div><b>Stairs down</b><div class="warp-dim">Floor ${v.depth + 1} awaits. You catch your breath on the way.</div></div><button class="warp-btn warp-btn-primary" data-dg-descend ${ui.busy ? "disabled" : ""}>Go down</button></div>`);
  } else if (v.here.bottom) {
    parts.push(`<div class="warp-card"><p>This is the deepest floor. Well done — head back out whenever you like.</p></div>`);
  }
  return parts.join("");
}
function battleScreen(v, ui) {
  const b = v.battle;
  const floor = SPRITES[`floor_${v.theme}`] ?? SPRITES.floor_cave;
  const foes = b.fighters.filter((f) => f.side === "foe");
  const party = b.fighters.filter((f) => f.side === "party");
  const active = party.find((f) => f.id === b.active);
  const pickFoe = ui.pick?.target === "foe";
  const pickAlly = ui.pick?.target === "ally";
  const foeHtml = foes.map((f) => {
    const cls = ["warp-dg-foe", f.alive ? "" : "down", f.boss ? "boss" : f.elite ? "elite" : "", pickFoe && f.alive ? "targetable" : ""].filter(Boolean).join(" ");
    const tag = pickFoe && f.alive ? "button" : "div";
    return `<${tag} class="${cls}" ${pickFoe && f.alive ? `data-dg-target="${esc2(f.id)}"` : ""}>
      ${sprite(f.sprite, "warp-dg-foe-img")}
      <div class="warp-dg-foe-name">${esc2(f.name)}</div>
      ${bar(f.hp, f.mhp, "hp", "HP")}
    </${tag}>`;
  }).join("");
  let commands = "";
  if (b.over) {
    commands = `<div class="warp-dim">The fight is over.</div>`;
  } else if (ui.pick) {
    commands = `<div class="warp-dg-prompt">Choose ${ui.pick.target === "foe" ? "an enemy" : "an ally"} <button class="warp-btn warp-mini" data-dg-cancel>Cancel</button></div>`;
  } else if (active) {
    const skills = b.skills.map((s) => `<button class="warp-btn warp-dg-cmd" data-dg-skill="${esc2(s.id)}" data-dg-skill-target="${esc2(s.target)}" ${s.usable && !ui.busy ? "" : "disabled"} title="${esc2(s.cost || "Free")}">${esc2(s.name)}${s.cost ? ` <span class="warp-dim">${esc2(s.cost)}</span>` : ""}</button>`).join("");
    const items = v.bag.map((i) => `<button class="warp-btn warp-dg-cmd" data-dg-item="${esc2(i.id)}" ${ui.busy ? "disabled" : ""}>${sprite(i.sprite, "warp-dg-mini")}${esc2(i.name)} ×${i.count}</button>`).join("");
    commands = `<div class="warp-dg-turn"><b>${esc2(you(active.name))}</b>'s turn</div>
      <div class="warp-dg-cmds">${skills}</div>
      ${items ? `<div class="warp-dg-cmds">${items}</div>` : ""}
      <div class="warp-dg-cmds">
        ${b.canEscape ? `<button class="warp-btn warp-dg-cmd" data-dg-escape ${ui.busy ? "disabled" : ""}>Escape</button>` : ""}
        <button class="warp-btn warp-dg-cmd" data-dg-auto="round" ${ui.busy ? "disabled" : ""} title="Everyone picks a sensible move for this round">Auto round</button>
        <button class="warp-btn warp-dg-cmd" data-dg-auto="battle" ${ui.busy ? "disabled" : ""} title="Fight it out automatically">Auto battle</button>
      </div>`;
  }
  return `<div class="warp-dg-battle">
    <div class="warp-dg-stage" style="background-image:linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.55)),url(${floor})">
      <div class="warp-dg-eyebrow">${esc2(b.kind === "boss" ? "Floor guardian" : b.kind === "elite" ? "Elite battle" : "Battle")} · round ${b.round}</div>
      <div class="warp-dg-foes">${foeHtml}</div>
    </div>
    <div class="warp-dg-party">${party.map((f) => memberCard(f, { targetable: pickAlly })).join("")}</div>
    <div class="warp-card warp-dg-command">${commands}</div>
    <div class="warp-dg-log">${b.log.slice(-5).reverse().map((l) => `<div>${esc2(you(l))}</div>`).join("")}</div>
  </div>`;
}
function entrance(entries, ui) {
  if (!entries.length) {
    return `<div class="warp-card"><p>There's no dungeon here. Dungeons appear as a choice ("Enter …") at their entrance.</p></div>`;
  }
  return entries.map((e) => `<div class="warp-card warp-dg-entry">
    <div class="warp-dg-entry-head">${sprite("stairs")}<div><h3>${esc2(e.name)}</h3>
      <div class="warp-dim">${e.deepest ? `Deepest so far: floor ${e.deepest}` : "Unexplored"}${e.floors ? ` · ${e.floors} floors` : " · endless"}</div></div></div>
    ${e.desc ? `<p>${esc2(e.desc)}</p>` : ""}
    ${e.max && e.companions.length ? `<div class="warp-eyebrow">Bring along (up to ${e.max})</div>
      <div class="warp-dg-mates">${e.companions.map((c) => `<label class="warp-dg-mate"><input type="checkbox" data-dg-mate="${esc2(c.id)}" ${ui.mates.has(c.id) ? "checked" : ""} ${!ui.mates.has(c.id) && ui.mates.size >= e.max ? "disabled" : ""}> ${esc2(c.name)} <span class="warp-dim">${esc2(c.cls)}${c.present ? " · here" : ""}</span></label>`).join("")}</div>` : ""}
    <p class="warp-dim">Tiles are face down until you step on them. One of them leads down. Leave whenever you like — you keep what you found. Get wiped out and you lose it.</p>
    <button class="warp-btn warp-btn-primary" data-dg-enter="${esc2(e.id)}" ${ui.busy ? "disabled" : ""}>Enter ${esc2(e.name)}</button>
  </div>`).join("");
}
function renderDungeon(v, entries, ui) {
  if (!v)
    return entrance(entries, ui);
  const head = `<div class="warp-dg-head">
    <div><div class="warp-eyebrow">${esc2(v.name)}</div><b>Floor ${v.depth}${v.floors ? ` / ${v.floors}` : ""}</b>${v.boss ? ` <span class="warp-tone-bad" title="A guardian blocks the way down">☠</span>` : ""}</div>
    <div class="warp-dg-stats"><span title="Party level">Lv ${v.level}</span><span class="warp-dim" title="Experience">${v.xp}/${v.xpNext} XP</span><span class="warp-money">${v.gold}g</span></div>
  </div>`;
  if (v.battle)
    return head + battleScreen(v, ui);
  const pickAlly = ui.pick?.kind === "use";
  const bag = v.bag.filter((i) => i.id !== "bomb").map((i) => `<button class="warp-btn warp-mini" data-dg-use="${esc2(i.id)}" ${ui.busy ? "disabled" : ""}>${sprite(i.sprite, "warp-dg-mini")}${esc2(i.name)} ×${i.count}</button>`).join("");
  const bombs = v.bag.find((i) => i.id === "bomb");
  return head + `<div class="warp-dg-party">${v.party.map((f) => memberCard(f, { targetable: pickAlly })).join("")}</div>` + (pickAlly ? `<div class="warp-dg-prompt">Who drinks it? <button class="warp-btn warp-mini" data-dg-cancel>Cancel</button></div>` : "") + board(v) + herePanel(v, ui) + `<div class="warp-dg-bag">${bag}${bombs ? `<span class="warp-dim">${sprite("bomb", "warp-dg-mini")}Bomb ×${bombs.count}</span>` : ""}${v.loot.length ? `<span class="warp-dim" title="Kept when you leave">Found: ${esc2(v.loot.map((l) => `${l.name}${l.count > 1 ? ` ×${l.count}` : ""}`).join(", "))}</span>` : ""}</div>` + `<div class="warp-dg-log">${v.log.slice(0, 6).map((l) => `<div>${esc2(you(l))}</div>`).join("")}</div>` + `<button class="warp-btn warp-dg-leave" data-dg-leave ${ui.busy ? "disabled" : ""}>Leave the dungeon</button>`;
}

// src/frontend/cue-bridge.ts
var PROVIDER = "warp";
var MAX_CHOICES = 12;
function cueChoices(choices, showOdds) {
  return choices.filter((c) => !c.id.startsWith("dungeon:") && c.id !== "date:open").slice(0, MAX_CHOICES).map((c) => ({
    id: c.id,
    label: c.label,
    group: c.group,
    detail: [c.desc, c.checkLabel ? `Check: ${c.checkLabel}` : null].filter(Boolean).join(`
`) || null,
    odds: showOdds ? c.odds : null
  }));
}
var CARD_CSS = `
.w{font:13px/1.45 system-ui,sans-serif;color:#ecebf2;display:grid;gap:8px}
.top{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}
.top b{font-size:15px}.dim{color:#a9a6b8}
.bars{display:grid;gap:6px}
.bar{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;align-items:center}
.bar .l{font-weight:600}.bar .v{text-align:right;color:#a9a6b8;font-variant-numeric:tabular-nums}
.track{grid-column:1/-1;height:6px;border-radius:99px;background:#2b2a36;overflow:hidden}
.fill{height:100%;border-radius:99px}
.good{background:#5fc58a}.warn{background:#e0b34f}.bad{background:#e06a6a}.neutral{background:#8b86a8}
.t-good{color:#8fe0a8}.t-warn{color:#f0cf7a}.t-bad{color:#f19a9a}.t-neutral{color:#c9c6d8}
.chips{display:flex;flex-wrap:wrap;gap:4px}
.chip{padding:1px 8px;border-radius:99px;background:#2b2a36;font-size:12px}
.sec{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#a9a6b8;margin-top:2px}
.ppl{display:grid;gap:3px}
`;
function renderCueCard(h) {
  const top = [
    h.clock ? `<b>${esc(h.clock.time)}</b> <span class="dim">${esc(h.date ?? h.clock.day)}</span>` : `<b>${esc(h.rulesetName)}</b>`,
    h.location ? `<span>\uD83D\uDCCD ${esc(h.location.name)}</span>` : "",
    h.weather ? `<span class="dim">${esc(`${h.weather.icon} ${h.weather.label} ${h.weather.temp}°C`.trim())}</span>` : "",
    h.money ? `<span>\uD83D\uDCB0 ${esc(h.money)}</span>` : ""
  ].filter(Boolean).join("");
  const bars = h.bars.map((b) => `<div class="bar"><span class="l">${esc(b.label)}</span><span class="v">${esc(b.text ?? b.display)}</span><div class="track"><div class="fill ${b.tone}" style="width:${Math.round(b.pct * 100)}%"></div></div></div>`).join("");
  const conds = h.conditions.map((c) => `<span class="chip t-${c.tone}">${esc(c.label)}${c.remaining ? ` · ${esc(c.remaining)}` : ""}</span>`).join("");
  const here = h.people.filter((p) => p.present).map((p) => {
    const feel = p.stats.filter((s) => s.text).map((s) => `<span class="t-${s.tone}">${esc(s.text)}</span>`).join(" · ");
    return `<div>${esc(p.name)}${feel ? ` <span class="dim">—</span> ${feel}` : ""}</div>`;
  }).join("");
  const enc = h.encounter ? `<div class="sec">⚔ ${esc(h.encounter.name)} · round ${h.encounter.round}</div><div class="bars">${h.encounter.stats.map((s) => `<div class="bar"><span class="l">${esc(h.encounter.foe)} ${esc(s.label)}</span><span class="v">${s.value}/${s.max}</span><div class="track"><div class="fill ${s.tone}" style="width:${Math.round(s.pct * 100)}%"></div></div></div>`).join("")}</div>` : "";
  return `<style>${CARD_CSS}</style><div class="w"><div class="top">${top}</div>${enc}${bars ? `<div class="bars">${bars}</div>` : ""}${conds ? `<div class="chips">${conds}</div>` : ""}${here ? `<div class="sec">Here</div><div class="ppl">${here}</div>` : ""}</div>`;
}
function renderCueDateCard(d) {
  const s = d.session;
  const p = d.person;
  if (!s || !p)
    return null;
  const bar = (label, v, text, cls) => `<div class="bar"><span class="l">${esc(label)}</span><span class="v">${esc(text)}</span><div class="track"><div class="fill ${cls}" style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></div></div></div>`;
  const where = s.kind === "outing" ? `\uD83D\uDCCD ${esc(s.venue ?? "Out")} · ${s.closing ? "winding down" : `moment ${Math.min(s.beat + 1, s.beats)}/${s.beats}`}` : s.kind === "plan" ? "Choosing where to go" : "Talking";
  return `<style>${CARD_CSS}.face{font-size:28px;line-height:1}</style><div class="w">
    <div class="top"><span class="face">${s.moodFace}</span><b>${esc(p.name)}</b><span class="dim">${esc(p.partner ? `♥ ${p.stage}` : p.stage)} · ${esc(s.moodLabel)}</span></div>
    <div class="dim">${where}</div>
    <div class="bars">
      ${bar("Love", p.love, p.loveText ?? "", "bad")}
      ${p.fear > 0.005 ? bar("Fear", p.fear, p.fearText ?? "", "warn") : ""}
      ${s.kind === "outing" ? bar("Enjoyment", s.enjoy / 100, `${Math.round(s.enjoy)}%`, "good") : ""}
      ${bar("Fatigue", s.fatigue / 100, s.fatigue >= 80 ? "tired of talking" : "", s.fatigue >= 80 ? "bad" : s.fatigue >= 60 ? "warn" : "good")}
    </div>
    <div class="chips">${s.combo ? `<span class="chip">${s.combo >= 3 ? "\uD83D\uDD25" : "✦"} streak ×${s.combo}</span>` : ""}${s.last ? `<span class="chip">${esc(s.last.label)}: ${esc(s.last.text.toLowerCase())}</span>` : ""}</div>
  </div>`;
}
function connectCue(opts) {
  let view = { state: null, enabled: false, showOdds: true, busy: false, busyLabel: "" };
  let request = null;
  let revision = 0;
  let published = new Set;
  let dead = false;
  const emit = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail }));
  function sendChoices() {
    const s = view.state;
    const chatId = s?.chatId ?? opts.chatId();
    if (!chatId)
      return;
    const live = view.enabled && !!s?.hud && !!s.choicesAnchor;
    emit("vn-game-state-v1", {
      version: 1,
      provider: PROVIDER,
      chatId,
      choices: live ? cueChoices(s.choices, view.showOdds) : [],
      busy: view.busy,
      busyLabel: view.busy ? view.busyLabel || null : null
    });
  }
  function sendCards() {
    const req = request;
    const s = view.state;
    if (!req || !s || s.chatId !== req.chatId)
      return;
    const cards = view.enabled && s.hud ? [{ cardId: "status", title: `Warp · ${s.hud.rulesetName}`, html: renderCueCard(s.hud) }] : [];
    const date = view.enabled && s.date ? renderCueDateCard(s.date) : null;
    if (date)
      cards.push({ cardId: "date", title: `Warp · ${s.date.person.name}`, html: date });
    const next = new Set;
    for (const card of cards) {
      next.add(card.cardId);
      emit("vn-panel-export-v1", { ...req, provider: PROVIDER, ...card, revision: ++revision, status: "ready" });
    }
    for (const cardId of published)
      if (!next.has(cardId))
        emit("vn-panel-export-v1", { ...req, provider: PROVIDER, cardId, revision: ++revision, status: "removed" });
    published = next;
  }
  const onPick = (e) => {
    const d = e.detail;
    if (dead || d?.version !== 1 || d.provider !== PROVIDER || typeof d.id !== "string")
      return;
    if (!d.chatId || d.chatId !== (view.state?.chatId ?? opts.chatId()))
      return;
    if (!view.state?.choices.some((c) => c.id === d.id)) {
      sendChoices();
      return;
    }
    opts.act(d.id);
    sendChoices();
  };
  const onGameRequest = (e) => {
    const d = e.detail;
    if (!dead && d?.version === 1 && d.chatId && d.chatId === view.state?.chatId)
      sendChoices();
  };
  const onPanelRequest = (e) => {
    const d = e.detail;
    if (dead || d?.version !== 1 || typeof d.chatId !== "string" || typeof d.messageId !== "string" || typeof d.sourceFingerprint !== "string" || !Number.isSafeInteger(d.swipeId))
      return;
    if (request?.messageId !== d.messageId || request?.sourceFingerprint !== d.sourceFingerprint)
      published = new Set;
    request = { version: 1, chatId: d.chatId, messageId: d.messageId, swipeId: d.swipeId, sourceFingerprint: d.sourceFingerprint };
    sendCards();
  };
  window.addEventListener("vn-game-pick-v1", onPick);
  window.addEventListener("vn-game-request-v1", onGameRequest);
  window.addEventListener("vn-panel-request-v1", onPanelRequest);
  return {
    update(next) {
      view = next;
      if (dead)
        return;
      sendChoices();
      sendCards();
    },
    destroy() {
      dead = true;
      window.removeEventListener("vn-game-pick-v1", onPick);
      window.removeEventListener("vn-game-request-v1", onGameRequest);
      window.removeEventListener("vn-panel-request-v1", onPanelRequest);
    }
  };
}

// src/frontend/date-ui.ts
var REACT_ICON = { love: "♥♥", like: "♥", neutral: "–", dislike: "✕", hate: "✕✕" };
var REACT_TONE = { love: "good", like: "good", neutral: "neutral", dislike: "warn", hate: "bad" };
function hue(name) {
  let h = 0;
  for (const c of name)
    h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
function avatar(name, big = false) {
  return `<span class="warp-date-avatar${big ? " big" : ""}" style="--warp-hue:${hue(name)}" aria-hidden="true">${esc(name.trim().charAt(0).toUpperCase() || "?")}</span>`;
}
function meter(label, value, text, cls) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return `<div class="warp-date-meter ${cls}" title="${esc(`${label}: ${text ?? `${pct}%`}`)}"><span class="warp-date-meter-l">${esc(label)}</span><div class="warp-date-meter-track"><div style="width:${pct}%"></div></div><span class="warp-date-meter-t">${esc(text ?? `${pct}%`)}</span></div>`;
}
function stageBadge(p) {
  return `<span class="warp-date-stage${p.hostile ? " hostile" : ""}${p.partner ? " partner" : ""}">${p.partner ? "♥ " : ""}${esc(p.stage)}</span>`;
}
function knows(p) {
  const bits = [
    p.loves.length ? `<span class="warp-tone-good">♥♥ ${esc(p.loves.join(", "))}</span>` : "",
    p.likes.length ? `<span class="warp-tone-good">♥ ${esc(p.likes.join(", "))}</span>` : "",
    p.dislikes.length ? `<span class="warp-tone-bad">✕ ${esc(p.dislikes.join(", "))}</span>` : ""
  ].filter(Boolean);
  return bits.length ? `<div class="warp-date-knows">${bits.join("")}</div>` : `<div class="warp-date-knows warp-dim">You haven't learned their tastes yet.</div>`;
}
function personRow(p, busy) {
  return `<div class="warp-date-person">
    ${avatar(p.name)}
    <div class="warp-date-main">
      <div class="warp-date-name"><b>${esc(p.name)}</b>${stageBadge(p)}${p.here ? `<span class="warp-date-here" title="Here now">●</span>` : ""}${p.dates ? `<span class="warp-dim">${p.dates} date${p.dates === 1 ? "" : "s"}</span>` : ""}</div>
      ${meter("Love", p.love, p.loveText, "love")}
      ${p.fear > 0.005 ? meter("Fear", p.fear, p.fearText, "fear") : ""}
      ${knows(p)}
    </div>
    <button class="warp-btn warp-mini" data-date-act="date:talk@${esc(p.id)}"${busy ? " disabled" : ""}>Talk</button>
  </div>`;
}
function odds(p) {
  if (p === null)
    return "";
  const tone = p >= 0.67 ? "good" : p >= 0.34 ? "warn" : "bad";
  return `<span class="warp-choice-odds warp-tone-${tone}">${Math.round(p * 100)}%</span>`;
}
function topicTile(t, busy) {
  const react = t.known ? `<span class="warp-date-react warp-tone-${REACT_TONE[t.known]}" title="${esc(t.knownLabel ?? "")}">${REACT_ICON[t.known]}</span>` : `<span class="warp-date-react warp-dim" title="You don't know how they feel about this yet">?</span>`;
  const title = [t.desc, t.lock, t.knownLabel ? `Last time: ${t.knownLabel.toLowerCase()}` : null, t.used ? `Raised ${t.used}× this time — it wears thin` : null].filter(Boolean).join(`
`);
  return `<button class="warp-date-topic${t.lock ? " locked" : ""}" ${t.lock || busy ? "disabled" : ""} data-date-act="date:topic:${esc(t.id)}" title="${esc(title)}">
    ${react}<span class="warp-date-topic-l">${esc(t.label)}</span>${t.lock ? `<span class="warp-date-lock" aria-label="locked">\uD83D\uDD12</span>` : odds(t.odds)}${t.used ? `<span class="warp-date-used">×${t.used}</span>` : ""}
  </button>`;
}
function renderDate(v, ui) {
  if (!v)
    return `<div class="warp-card"><h3>Dating is off</h3><p>Add <b>dating: true</b> to the ruleset to talk topic by topic and go on dates.</p></div>`;
  const s = v.session;
  if (!s || !v.person) {
    if (!v.people.length)
      return `<div class="warp-card"><h3>Nobody to talk to yet</h3><p>People appear here once the story introduces them.</p></div>`;
    return `<div class="warp-date">
      <div class="warp-eyebrow">People · pick someone to talk to</div>
      ${v.people.map((p) => personRow(p, ui.busy)).join("")}
    </div>`;
  }
  const p = v.person;
  const fatigueTone = s.fatigue >= 80 ? "bad" : s.fatigue >= 60 ? "warn" : "good";
  const outing = s.kind === "outing" ? `<div class="warp-date-outing">
        <span>\uD83D\uDCCD <b>${esc(s.venue ?? "Out")}</b></span>
        <span class="warp-dim">${s.closing ? "Winding down" : `Moment ${Math.min(s.beat + 1, s.beats)} of ${s.beats}`}</span>
        ${meter("Enjoyment", s.enjoy / 100, `${Math.round(s.enjoy)}%`, "enjoy")}
      </div>` : s.kind === "plan" ? `<div class="warp-date-outing"><span>\uD83D\uDDD3 They said yes — pick where to go.</span></div>` : "";
  const last = s.last ? `<div class="warp-date-last warp-tone-${REACT_TONE[s.last.reaction]}">${REACT_ICON[s.last.reaction]} <b>${esc(s.last.label)}</b> — ${esc(s.last.text)}</div>` : "";
  const groups = new Map;
  for (const m of v.moves)
    groups.set(m.group, [...groups.get(m.group) ?? [], m]);
  const moves = [...groups].map(([g, list]) => `<div class="warp-choice-group">
      <div class="warp-choice-group-label">${esc(g)}</div>
      <div class="warp-choice-grid">${list.map((m) => `<button class="warp-choice warp-date-move ${esc(m.kind)}" data-date-act="${esc(m.id)}" title="${esc(m.desc ?? "")}"${ui.busy ? " disabled" : ""}><span class="warp-choice-label">${esc(m.label)}</span>${odds(m.odds)}</button>`).join("")}</div>
    </div>`).join("");
  const cats = v.categories;
  const cat = cats.find((c) => c.id === ui.cat) ?? cats.find((c) => c.topics.some((t) => !t.lock)) ?? cats[0];
  const topics = cats.length ? `<div class="warp-date-topics">
      <div class="warp-date-cats" role="tablist">${cats.map((c) => {
    const open = c.topics.filter((t) => !t.lock).length;
    return `<button class="warp-date-cat" role="tab" aria-selected="${c.id === cat?.id}" data-date-cat="${esc(c.id)}" title="${esc(c.label)}">${c.icon} <span>${esc(c.label)}</span>${open ? "" : " \uD83D\uDD12"}</button>`;
  }).join("")}</div>
      <div class="warp-date-grid">${cat ? cat.topics.map((t) => topicTile(t, ui.busy)).join("") : ""}</div>
    </div>` : "";
  return `<div class="warp-date">
    <div class="warp-date-head">
      ${avatar(p.name, true)}
      <div class="warp-date-main">
        <div class="warp-date-name"><b>${esc(p.name)}</b>${stageBadge(p)}</div>
        ${meter("Love", p.love, p.loveText, "love")}
        ${meter("Fear", p.fear, p.fearText, "fear")}
      </div>
      <div class="warp-date-mood" title="Mood: ${esc(s.moodLabel)}"><span class="warp-date-face">${s.moodFace}</span><span>${esc(s.moodLabel)}</span></div>
    </div>
    <div class="warp-date-stats">
      ${meter("Fatigue", s.fatigue / 100, s.fatigue >= 100 ? "Done talking" : s.fatigue >= 80 ? "Tired of talking" : s.fatigue >= 60 ? "Flagging" : "Fresh", `fatigue ${fatigueTone}`)}
      <span class="warp-date-combo${s.combo >= 3 ? " hot" : ""}" title="Good reactions in a row boost love">${s.combo >= 3 ? "\uD83D\uDD25" : "✦"} Streak ×${s.combo}</span>
    </div>
    ${outing}
    ${last}
    ${moves}
    ${topics}
    ${knows(p)}
  </div>`;
}

// src/frontend.ts
var CLEANUP_KEY = "__warpCleanup";
var ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/></svg>`;
function store(key, value) {
  try {
    if (value !== undefined)
      localStorage.setItem(`warp:${key}`, value);
    return localStorage.getItem(`warp:${key}`);
  } catch {
    return null;
  }
}
function setup(ctx) {
  const prev = globalThis[CLEANUP_KEY];
  if (typeof prev === "function")
    prev();
  const cleanups = [];
  cleanups.push(ctx.dom.addStyle(STYLES));
  let state = null;
  let settings = { ...DEFAULT_SETTINGS };
  let templates = [];
  let connections = [];
  let jevKeySet = false;
  let builder = null;
  let bDraft = emptyDraft();
  let busy = { chatId: "", on: false, label: "" };
  let editingBar = null;
  let drawerView = "sheet";
  let dateCat = null;
  let dgPick = null;
  const dgMates = new Set;
  const openSections = new Map;
  const send = (m) => ctx.sendToBackend(m);
  const chatId = () => {
    try {
      return ctx.getActiveChat().chatId ?? null;
    } catch {
      return null;
    }
  };
  const tab = ctx.ui.registerDrawerTab({
    id: "warp",
    title: "Warp — game state",
    shortName: "Warp",
    headerTitle: "Warp",
    description: "Stats, dice, inventory, people and game settings",
    keywords: ["stats", "dice", "game", "ruleset", "rpg", "tracker"],
    iconSvg: ICON
  });
  cleanups.push(() => tab.destroy());
  const drawerRoot = document.createElement("div");
  drawerRoot.className = "warp-root";
  tab.root.appendChild(drawerRoot);
  cleanups.push(tab.onActivate(() => renderDrawer()));
  const narrow = () => window.innerWidth < 760;
  const viewport = () => {
    try {
      return ctx.ui.geometry?.layoutViewportSize() ?? { width: window.innerWidth, height: window.innerHeight };
    } catch {
      return { width: window.innerWidth, height: window.innerHeight };
    }
  };
  let overlayOpen = store("overlayOpen") !== null ? store("overlayOpen") === "1" : !narrow();
  const savedEdge = store("overlayEdge");
  let edge = savedEdge === "left" || savedEdge === "right" || savedEdge === "top" || savedEdge === "bottom" ? savedEdge : null;
  let overlay = null;
  const overlayEl = document.createElement("div");
  overlayEl.className = "warp-overlay";
  overlayEl.innerHTML = `<div class="warp-overlay-head" title="Drag to move · drop on a screen edge to attach"></div><div class="warp-overlay-body warp-root"></div>`;
  const headEl = overlayEl.firstElementChild;
  const dockRoot = overlayEl.lastElementChild;
  dockRoot.addEventListener("pointerdown", (e) => {
    if (!e.target.closest?.("input, select, textarea"))
      e.preventDefault();
  });
  let cur = { x: 0, y: 72, w: PILL.w, h: PILL.h };
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
      chromeless: true
    });
    overlay.root.appendChild(overlayEl);
    overlay.setVisible(false);
    cur = start;
    cleanups.push(() => overlay?.destroy());
  } catch {
    overlay = null;
  }
  function place(b) {
    if (!overlay)
      return;
    if (b.w !== cur.w || b.h !== cur.h)
      overlay.setSize(b.w, b.h);
    const p = overlay.getPosition();
    if (p.x !== b.x || p.y !== b.y)
      overlay.moveTo(b.x, b.y);
    cur = b;
  }
  function resizeFloating(w, h) {
    if (!overlay)
      return;
    const p = overlay.getPosition();
    const rightAnchored = p.x + cur.w / 2 > viewport().width / 2;
    const x = rightAnchored ? Math.max(PAD, p.x + cur.w - w) : p.x;
    place({ x, y: p.y, w, h });
  }
  function fitOverlay() {
    if (!overlay)
      return;
    overlayEl.classList.toggle("warp-overlay-collapsed", !overlayOpen);
    overlayEl.dataset.edge = edge ?? "";
    const vp = viewport();
    if (edge) {
      const b = attachedBox(edge, overlayOpen, vp);
      overlayEl.style.setProperty("--warp-overlay-max", `${b.h - PILL.h}px`);
      place(b);
      return;
    }
    if (!overlayOpen) {
      resizeFloating(PILL.w, PILL.h);
      return;
    }
    const maxH = Math.max(240, vp.height - 140);
    overlayEl.style.setProperty("--warp-overlay-max", `${maxH - PILL.h}px`);
    requestAnimationFrame(() => resizeFloating(PANEL_W, Math.min(maxH, PILL.h + dockRoot.scrollHeight + 2)));
  }
  let dragStart = null;
  let pressAt = null;
  headEl.addEventListener("pointerdown", (e) => {
    if (!overlay || e.button !== 0)
      return;
    pressAt = { x: e.clientX, y: e.clientY };
    dragStart = overlay.getPosition();
  });
  const onPointerMove = (e) => {
    if (!pressAt || !overlay)
      return;
    if (Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) < 4)
      return;
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
  const onPointerUp = () => {
    pressAt = null;
  };
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
  const onResize = () => {
    if (overlay?.isVisible())
      fitOverlay();
  };
  window.addEventListener("resize", onResize);
  cleanups.push(() => window.removeEventListener("resize", onResize));
  function syncDockVisibility() {
    if (!overlay)
      return;
    const show = !!state?.hud || state?.status.state === "broken";
    if (show !== overlay.isVisible())
      overlay.setVisible(show);
    if (show)
      fitOverlay();
  }
  function renderHead() {
    const h = state?.hud;
    const clock = h?.clock ? `${h.clock.time}` : "";
    const worst = h?.bars.find((b) => b.tone === "bad") ?? h?.bars.find((b) => b.tone === "warn");
    const dot = `<span class="warp-dot warp-bg-${worst?.tone ?? "good"}" title="${esc(worst ? `${worst.label}: ${worst.text ?? worst.display}` : "All good")}"></span>`;
    const where = overlayOpen && h?.location ? ` <span class="warp-dim">· ${esc(h.location.name)}</span>` : "";
    headEl.innerHTML = `
      <span class="warp-overlay-title">\uD83C\uDFB2 ${clock ? `<b>${esc(clock)}</b>` : "Warp"}${where}</span>
      ${dot}
      <span class="warp-overlay-actions">
        ${overlayOpen && edge ? `<button class="warp-btn warp-btn-ghost" data-detach title="Float" aria-label="Detach">⇱</button>` : ""}
        ${overlayOpen ? `<button class="warp-btn warp-btn-ghost" data-open-sheet title="Open full sheet" aria-label="Open full sheet">⤢</button>` : ""}
        <button class="warp-btn warp-btn-ghost" data-toggle-overlay title="${overlayOpen ? "Collapse" : "Expand"}" aria-label="${overlayOpen ? "Collapse" : "Expand"}">${overlayOpen ? "–" : "+"}</button>
      </span>`;
  }
  headEl.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-open-sheet]")) {
      drawerView = "sheet";
      tab.activate();
      return;
    }
    if (t.closest("[data-detach]")) {
      const vp = viewport();
      edge = null;
      store("overlayEdge", "");
      place({ x: Math.max(PAD, vp.width - PANEL_W - 40), y: 72, w: PANEL_W, h: Math.min(420, cur.h) });
      renderHead();
      fitOverlay();
      return;
    }
    if (t.closest("[data-toggle-overlay]") || !overlayOpen) {
      overlayOpen = !overlayOpen;
      store("overlayOpen", overlayOpen ? "1" : "0");
      renderHead();
      fitOverlay();
    }
  });
  function rememberSections(root) {
    root.querySelectorAll("details[data-section]").forEach((d) => openSections.set(d.dataset.section, d.open));
  }
  function restoreSections(root) {
    root.querySelectorAll("details[data-section]").forEach((d) => {
      const v = openSections.get(d.dataset.section);
      if (v !== undefined)
        d.open = v;
    });
  }
  let lastBars = new Map;
  function flashChangedBars(root) {
    if (!state?.hud)
      return;
    for (const b of state.hud.bars) {
      const prevV = lastBars.get(b.id);
      if (prevV !== undefined && Math.abs(prevV - b.value) > 0.5)
        root.querySelector(`[data-bar="${CSS.escape(b.id)}"]`)?.classList.add("warp-changed");
    }
  }
  function renderDock() {
    if (!overlay)
      return;
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
    const status = state?.status ?? { state: "none", name: null, source: null, issues: [], characterName: null, cardKind: "character", tags: [] };
    const views = [
      ["sheet", "Sheet"],
      ...state?.map ? [["map", "Map"]] : [],
      ...state?.hud ? [["journal", "Journal"]] : [],
      ...state?.date ? [["date", state.date.session ? "Dating \uD83D\uDCAC" : "Dating"]] : [],
      ...state?.dungeon || state?.dungeonEntries?.length ? [["dungeon", state?.dungeon ? "Dungeon ⚔" : "Dungeon"]] : [],
      ["rules", `Ruleset${status.issues.some((i) => i.level === "error") ? " ⚠" : ""}`],
      ["settings", "Settings"]
    ];
    if (!views.some(([v]) => v === drawerView))
      drawerView = "sheet";
    const tabs = `<div class="warp-tabs" role="tablist">
      ${views.map(([v, label]) => `<button class="warp-tab" role="tab" data-view="${v}" aria-selected="${drawerView === v}">${label}</button>`).join("")}
    </div>`;
    let body = "";
    if (drawerView === "sheet") {
      body = state?.hud ? renderHud(state.hud, { editing: editingBar, compact: false }) : renderRulesetCard(status, hasChat);
    } else if (drawerView === "map") {
      body = renderMap(state?.map ?? null);
    } else if (drawerView === "date") {
      body = renderDate(state?.date ?? null, { cat: dateCat, busy: busy.on && busy.chatId === state?.chatId });
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
  let choicesEl = null;
  let choicesFor = null;
  let choicesHtml = "";
  const chipEls = new Map;
  const wantChips = new Map;
  function injectChips(messageId, html) {
    const bubble = ctx.dom.findMessageElement(messageId);
    if (!bubble)
      return false;
    const el = ctx.dom.inject(bubble, `<div class="warp-chips" data-warp-chips="${messageId}">${html}</div>`, "beforeend");
    chipEls.set(messageId, { el, html });
    return true;
  }
  function placeChoices(force = false) {
    const anchor = state?.choicesAnchor ?? null;
    const isBusy = busy.on && busy.chatId === state?.chatId;
    const html = settings.enabled && state?.hud && anchor ? renderChoices(state.choices, { showOdds: settings.showOdds, hotkeys: settings.hotkeys, busy: isBusy, busyLabel: busy.label || undefined }) : "";
    if (!force && anchor === choicesFor && html === choicesHtml && choicesEl?.isConnected)
      return;
    if (choicesEl) {
      ctx.dom.uninject(choicesEl);
      choicesEl = null;
    }
    choicesFor = anchor;
    choicesHtml = html;
    if (!anchor || !html)
      return;
    const bubble = ctx.dom.findMessageElement(anchor);
    if (!bubble)
      return;
    choicesEl = ctx.dom.inject(bubble, `<div class="warp-choices${isBusy ? " warp-busy" : ""}">${html}</div>`, "beforeend");
  }
  function reconcileMessages() {
    const records = state?.records ?? [];
    wantChips.clear();
    if (settings.enabled) {
      for (const r of records) {
        const html = renderChips(r, { showDice: settings.showDiceChips });
        if (html)
          wantChips.set(r.messageId, html);
      }
      for (const s of state?.suggestions ?? [])
        wantChips.set(s.messageId, (wantChips.get(s.messageId) ?? "") + renderSuggestion(s));
    }
    let anchorTouched = false;
    for (const [id, cur] of chipEls) {
      if (wantChips.get(id) !== cur.html) {
        ctx.dom.uninject(cur.el);
        chipEls.delete(id);
        if (id === choicesFor)
          anchorTouched = true;
      }
    }
    for (const [id, html] of wantChips) {
      if (chipEls.has(id))
        continue;
      if (injectChips(id, html) && id === state?.choicesAnchor)
        anchorTouched = true;
    }
    placeChoices(anchorTouched);
  }
  let mo = null;
  let moTimer = null;
  const pendingCheck = () => {
    moTimer = null;
    let touched = false;
    for (const [id, html] of wantChips)
      if (!chipEls.has(id) && injectChips(id, html))
        touched = touched || id === state?.choicesAnchor;
    if (touched || choicesFor && choicesHtml && !choicesEl?.isConnected)
      placeChoices(true);
  };
  try {
    mo = new MutationObserver(() => {
      if (!moTimer)
        moTimer = setTimeout(pendingCheck, 200);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    cleanups.push(() => {
      mo?.disconnect();
      if (moTimer)
        clearTimeout(moTimer);
    });
  } catch {}
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
    if (state?.hud)
      lastBars = new Map(state.hud.bars.map((b) => [b.id, b.value]));
  }
  function openPicker() {
    const id = chatId();
    if (!id)
      return;
    const modal = ctx.ui.showModal({ title: "Add a Warp ruleset", width: 520, maxHeight: 640 });
    modal.root.innerHTML = renderTemplatePicker(templates, state?.status.characterName ? { name: state.status.characterName, track: state.status.cardKind !== "scenario" } : null);
    modal.root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-template]");
      if (!btn)
        return;
      if (btn.dataset.template === "__ai") {
        drawerView = "rules";
        tab.activate();
        send({ type: "builder_open", chatId: id, mode: "build" });
      } else {
        const track = modal.root.querySelector("[data-track]");
        send({ type: "install_template", chatId: id, templateId: btn.dataset.template, ...track ? { trackCharacter: track.checked } : {} });
      }
      modal.dismiss();
    });
  }
  async function confirmReplace() {
    if (state?.status.state === "none")
      return openPicker();
    const res = await ctx.ui.showConfirm({
      title: "Add another ruleset?",
      message: "This character already has warp-ruleset entries. A new template is added as another lorebook and merged with the existing rules — remove the old lorebook if you want a clean start.",
      confirmLabel: "Choose a template",
      variant: "warning"
    });
    if (res.confirmed)
      openPicker();
  }
  function builderAnswers() {
    const out = {};
    for (const r of builder?.rounds ?? [])
      for (const q of r.questions) {
        const v = bDraft.answers[q.id] ?? r.answers[q.id] ?? q.default;
        if (v !== undefined)
          out[q.id] = v;
      }
    return out;
  }
  function currentAnswer(id) {
    for (const r of builder?.rounds ?? [])
      for (const q of r.questions)
        if (q.id === id)
          return bDraft.answers[id] ?? r.answers[id] ?? q.default;
    return;
  }
  function onBuilderClick(t) {
    const opt = t.closest("[data-bq-opt]");
    if (opt) {
      const id = opt.dataset.bq, v = opt.dataset.bqOpt;
      if (opt.dataset.bqKind === "multi") {
        const cur = currentAnswer(id);
        const set = new Set(Array.isArray(cur) ? cur : []);
        if (set.has(v))
          set.delete(v);
        else
          set.add(v);
        bDraft.answers[id] = [...set];
      } else
        bDraft.answers[id] = v;
      renderDrawer();
      return true;
    }
    const seg = t.closest('[data-bset="creative"]');
    if (seg) {
      bDraft.creative = seg.dataset.v === "1";
      renderDrawer();
      return true;
    }
    const b = t.closest("[data-b]");
    if (!b)
      return false;
    const cid = chatId();
    if (!cid)
      return true;
    switch (b.dataset.b) {
      case "open-build":
        drawerView = "rules";
        send({ type: "builder_open", chatId: cid, mode: "build" });
        break;
      case "open-refine":
        drawerView = "rules";
        send({ type: "builder_open", chatId: cid, mode: "refine" });
        break;
      case "start":
        send({ type: "builder_start", chatId: cid, connectionId: bDraft.connectionId, creative: bDraft.creative, base: bDraft.base || undefined });
        break;
      case "more":
      case "build":
        send({ type: "builder_answer", chatId: cid, answers: builderAnswers(), additions: bDraft.additions, more: b.dataset.b === "more" });
        break;
      case "back":
        send({ type: "builder_back", chatId: cid });
        break;
      case "close":
        (async () => {
          if (builder && builder.step !== "done" && builder.step !== "start") {
            const res = await ctx.ui.showConfirm({ title: "Close the builder?", message: "The draft is discarded. Your current ruleset isn't touched.", confirmLabel: "Discard draft", variant: "warning" });
            if (!res.confirmed)
              return;
          }
          send({ type: "builder_close", chatId: cid });
        })();
        break;
      case "install":
        (async () => {
          if (b.dataset.replacing === "1" && builder?.mode === "build") {
            const res = await ctx.ui.showConfirm({ title: "Replace the current ruleset?", message: "The character's existing warp-ruleset sections are overwritten with this draft. Game state already recorded in chats is kept.", confirmLabel: "Replace", variant: "warning" });
            if (!res.confirmed)
              return;
          }
          send({ type: "builder_install", chatId: cid });
        })();
        break;
      case "refine":
        if (bDraft.refine.trim()) {
          send({ type: "builder_refine", chatId: cid, request: bDraft.refine.trim() });
          bDraft.refine = "";
        }
        break;
      case "chip":
        bDraft.refine = b.dataset.text ?? "";
        renderDrawer();
        break;
      case "fix":
        send({ type: "builder_fix", chatId: cid, warning: b.dataset.w });
        break;
      case "redo": {
        const part = b.dataset.part;
        send({ type: "builder_redo", chatId: cid, part, note: bDraft.notes[part] || undefined });
        delete bDraft.notes[part];
        break;
      }
      case "add-row":
        bDraft.additions.push({ name: "", kind: "skill", note: "" });
        renderDrawer();
        break;
      case "add-remove":
        bDraft.additions.splice(Number(b.dataset.i), 1);
        renderDrawer();
        break;
      default:
        return false;
    }
    return true;
  }
  function onBuilderInput(t) {
    if (t.dataset.bq && (t.dataset.bqKind === "text" || t.dataset.bqKind === "scale")) {
      bDraft.answers[t.dataset.bq] = t.dataset.bqKind === "scale" ? Number(t.value) : t.value;
      return true;
    }
    if (t.dataset.badd !== undefined) {
      const row = bDraft.additions[Number(t.dataset.badd)];
      const field = t.dataset.baddField;
      if (row)
        row[field] = t.value;
      return true;
    }
    if (t.dataset.bnote) {
      bDraft.notes[t.dataset.bnote] = t.value;
      return true;
    }
    if (t.dataset.brefine !== undefined) {
      bDraft.refine = t.value;
      return true;
    }
    if (t.dataset.bset === "base") {
      bDraft.base = t.value;
      return true;
    }
    if (t.dataset.bset === "connectionId") {
      bDraft.connectionId = t.value;
      return true;
    }
    return false;
  }
  function onPanelClick(e) {
    const t = e.target;
    const view = t.closest("[data-view]");
    if (view) {
      drawerView = view.dataset.view;
      renderDrawer();
      return;
    }
    if (onBuilderClick(t))
      return;
    if (onDungeonClick(t))
      return;
    const dateCatEl = t.closest("[data-date-cat]");
    if (dateCatEl) {
      dateCat = dateCatEl.dataset.dateCat;
      renderDrawer();
      return;
    }
    const dateAct = t.closest("[data-date-act]");
    if (dateAct) {
      if (!dateAct.disabled)
        act(dateAct.dataset.dateAct);
      return;
    }
    const runBtn = t.closest("[data-run]");
    if (runBtn) {
      act(runBtn.dataset.run);
      return;
    }
    const go = t.closest("[data-go]");
    if (go) {
      act(`go:${go.dataset.go}`);
      return;
    }
    const jump = t.closest("[data-jump]");
    if (jump) {
      const el = ctx.dom.findMessageElement(jump.dataset.jump);
      if (el)
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      else
        jump.setAttribute("title", "That message isn't loaded — scroll up in the chat to find it.");
      return;
    }
    const perk = t.closest("[data-buy-perk]");
    if (perk) {
      const cid = chatId();
      if (cid)
        send({ type: "buy_perk", chatId: cid, perk: perk.dataset.buyPerk });
      return;
    }
    if (t.closest("[data-install]")) {
      confirmReplace();
      return;
    }
    if (t.closest("[data-reload]")) {
      send({ type: "reload", chatId: chatId() });
      return;
    }
    const save = t.closest("[data-save]");
    if (save) {
      const id = save.dataset.save;
      const input = save.parentElement?.querySelector(`[data-num]`);
      const v = Number(input?.value);
      const cid = chatId();
      if (cid && Number.isFinite(v))
        send({ type: "adjust", chatId: cid, stat: id, value: v });
      editingBar = null;
      return;
    }
    const saveRel = t.closest("[data-save-rel]");
    if (saveRel) {
      const [who, stat] = saveRel.dataset.saveRel.split(":");
      const v = Number(saveRel.parentElement?.querySelector("[data-num]")?.value);
      const cid = chatId();
      if (cid && Number.isFinite(v))
        send({ type: "adjust_rel", chatId: cid, who, stat, value: v });
      editingBar = null;
      return;
    }
    if (t.closest(".warp-bar-edit"))
      return;
    const bar = t.closest("[data-bar]");
    if (bar) {
      editingBar = editingBar === bar.dataset.bar ? null : bar.dataset.bar;
      renderDock();
      renderDrawer();
      return;
    }
    const rel = t.closest("[data-rel]");
    if (rel) {
      const k = `rel:${rel.dataset.rel}`;
      editingBar = editingBar === k ? null : k;
      renderDock();
      renderDrawer();
      return;
    }
    const forget = t.closest("[data-forget]");
    if (forget) {
      const cid = chatId();
      const who = forget.dataset.forget;
      ctx.ui.showConfirm({
        title: `Stop tracking ${forget.dataset.name}?`,
        message: "They're removed from People and relationships. If the story brings them back, they're tracked again from scratch.",
        confirmLabel: "Forget",
        variant: "warning"
      }).then((res) => {
        if (res.confirmed && cid)
          send({ type: "forget", chatId: cid, who });
      });
      return;
    }
    if (t.closest("[data-save-jev]")) {
      const input = drawerRoot.querySelector("[data-jevkey]");
      if (input?.value.trim()) {
        send({ type: "set_jev_key", key: input.value.trim() });
        input.value = "";
      }
      return;
    }
    if (t.closest("[data-clear-jev]")) {
      send({ type: "set_jev_key", key: "" });
      return;
    }
    if (t.closest("[data-test-decider]")) {
      send({ type: "test_decider" });
      return;
    }
    const tag = t.closest("[data-tag]");
    if (tag) {
      const name = tag.dataset.tag;
      const mode = tag.dataset.mode;
      const lines = settings.lines.filter((x) => x !== name);
      const veils = settings.veils.filter((x) => x !== name);
      if (mode === "on")
        veils.push(name);
      else if (mode === "veil")
        lines.push(name);
      send({ type: "settings", patch: { lines, veils } });
    }
  }
  function dg(op) {
    const cid = chatId();
    if (!cid)
      return;
    dgPick = null;
    send({ type: "dungeon", chatId: cid, ...op });
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
      variant: "info"
    });
    if (res.confirmed)
      dg({ op: "leave" });
  }
  function onDungeonClick(t) {
    const el = t.closest("[data-dg-move],[data-dg-choose],[data-dg-skill],[data-dg-item],[data-dg-target],[data-dg-escape],[data-dg-auto],[data-dg-descend],[data-dg-leave],[data-dg-buy],[data-dg-use],[data-dg-enter],[data-dg-cancel]");
    if (!el || el.disabled)
      return !!el;
    const d = el.dataset;
    const v = state?.dungeon;
    if (d.dgMove) {
      const [x, y] = d.dgMove.split(",").map(Number);
      dg({ op: "move", x, y });
      return true;
    }
    if (d.dgChoose) {
      dg({ op: "choose", choice: d.dgChoose });
      return true;
    }
    if (d.dgCancel !== undefined) {
      dgPick = null;
      renderDrawer();
      return true;
    }
    if (d.dgSkill) {
      const target = d.dgSkillTarget;
      const foes = v?.battle?.fighters.filter((f) => f.side === "foe" && f.alive) ?? [];
      if (target === "foe" && foes.length > 1) {
        dgPick = { kind: "skill", id: d.dgSkill, target: "foe" };
        renderDrawer();
        return true;
      }
      if (target === "ally") {
        dgPick = { kind: "skill", id: d.dgSkill, target: "ally" };
        renderDrawer();
        return true;
      }
      dg({ op: "battle", skill: d.dgSkill, target: foes[0]?.id });
      return true;
    }
    if (d.dgItem) {
      if (d.dgItem === "bomb") {
        dg({ op: "battle", item: "bomb" });
        return true;
      }
      dgPick = { kind: "item", id: d.dgItem, target: "ally" };
      renderDrawer();
      return true;
    }
    if (d.dgUse) {
      dgPick = { kind: "use", id: d.dgUse, target: "ally" };
      renderDrawer();
      return true;
    }
    if (d.dgTarget && dgPick) {
      const p = dgPick;
      if (p.kind === "skill")
        dg({ op: "battle", skill: p.id, target: d.dgTarget });
      else if (p.kind === "item")
        dg({ op: "battle", item: p.id, target: d.dgTarget });
      else
        dg({ op: "use", item: p.id, target: d.dgTarget });
      return true;
    }
    if (d.dgEscape !== undefined) {
      dg({ op: "battle", escape: true });
      return true;
    }
    if (d.dgAuto) {
      dg({ op: "battle", auto: d.dgAuto });
      return true;
    }
    if (d.dgDescend !== undefined) {
      dg({ op: "descend" });
      return true;
    }
    if (d.dgLeave !== undefined) {
      confirmLeave();
      return true;
    }
    if (d.dgBuy) {
      dg({ op: "buy", item: d.dgBuy });
      return true;
    }
    if (d.dgEnter) {
      const entry = state?.dungeonEntries.find((e) => e.id === d.dgEnter);
      const mates = [...dgMates].filter((m) => entry?.companions.some((c) => c.id === m));
      dg({ op: "enter", id: d.dgEnter, companions: mates });
      dgMates.clear();
      return true;
    }
    return true;
  }
  function onPanelInput(e) {
    const t = e.target;
    if (onBuilderInput(t))
      return;
    if (t.dataset.range) {
      const num = t.parentElement?.querySelector("[data-num]");
      if (num)
        num.value = t.value;
    } else if (t.dataset.num) {
      const range = t.parentElement?.querySelector("[data-range]");
      if (range)
        range.value = t.value;
    }
  }
  function onPanelChange(e) {
    const t = e.target;
    if (onBuilderInput(t))
      return;
    if (t.dataset.dgMate) {
      if (t.checked)
        dgMates.add(t.dataset.dgMate);
      else
        dgMates.delete(t.dataset.dgMate);
      renderDrawer();
      return;
    }
    if (t.dataset.wearSlot) {
      const cid = chatId();
      if (cid && t.value)
        send({ type: "wear", chatId: cid, slot: t.dataset.wearSlot, item: t.value === "__off" ? null : t.value });
      return;
    }
    const pctKey = t.dataset.settingPct;
    if (pctKey) {
      let v = Number(t.value) / 100;
      if (pctKey === "askConfidence")
        v = Math.min(v, settings.autoConfidence - 0.01);
      else
        v = Math.max(v, settings.askConfidence + 0.01);
      send({ type: "settings", patch: { [pctKey]: v } });
      return;
    }
    const key = t.dataset.setting;
    if (!key)
      return;
    const value = t instanceof HTMLInputElement && t.type === "checkbox" ? t.checked : t.value;
    send({ type: "settings", patch: { [key]: value } });
  }
  function onPanelKey(e) {
    const t = e.target;
    if (e.key === "Enter" && t.dataset.newtag !== undefined && t.value.trim()) {
      send({ type: "settings", patch: { veils: [...settings.veils, t.value.trim().toLowerCase()] } });
      t.value = "";
    }
  }
  for (const root of [drawerRoot, dockRoot]) {
    root.addEventListener("click", onPanelClick);
    root.addEventListener("input", onPanelInput);
    root.addEventListener("change", onPanelChange);
    root.addEventListener("keydown", onPanelKey);
    root.addEventListener("toggle", () => rememberSections(root), true);
  }
  function act(actionId) {
    if (actionId === "date:open") {
      drawerView = "date";
      tab.activate();
      renderDrawer();
      return;
    }
    if (actionId.startsWith("run:") && actionId !== "run:epilogue") {
      confirmRun(actionId);
      return;
    }
    if (actionId.startsWith("dungeon:")) {
      if (actionId === "dungeon:leave")
        confirmLeave();
      else
        openDungeon();
      return;
    }
    const cid = chatId();
    if (!cid || busy.on && busy.chatId === cid)
      return;
    busy = { chatId: cid, on: true, label: "Rolling…" };
    placeChoices(true);
    syncCue();
    send({ type: "act", chatId: cid, actionId });
    setTimeout(() => {
      if (busy.on && busy.label === "Rolling…" && busy.chatId === cid) {
        busy = { chatId: "", on: false, label: "" };
        placeChoices(true);
        syncCue();
      }
    }, 15000);
  }
  async function confirmRun(actionId) {
    const cid = chatId();
    if (!cid)
      return;
    const [, op, slot] = actionId.split(":");
    const run = state?.hud?.run;
    if (op === "load" || op === "restart") {
      const res = await ctx.ui.showConfirm({
        title: op === "load" ? "Rewind to this save?" : "Start over?",
        message: op === "load" ? `The game rewinds to ${slot === "start" ? "the very beginning" : slot === "auto" ? "the autosave" : `slot ${slot}`}. The chat keeps its messages; the next reply picks up from the rewind. Kept: ${run?.keeps ?? "nothing"}.` : `A new playthrough from the beginning. Carried over: ${run?.legacy ?? "nothing"}.`,
        confirmLabel: op === "load" ? "Rewind" : "Start over",
        variant: "warning"
      });
      if (!res.confirmed)
        return;
    }
    send({ type: "run", chatId: cid, op, ...slot ? { slot } : {} });
  }
  async function confirmRedo(btn) {
    const cid = chatId();
    const userMessageId = btn.dataset.redo;
    if (!cid || !userMessageId)
      return;
    const actionId = btn.dataset.redoAction || null;
    let params;
    try {
      params = btn.dataset.redoParams ? JSON.parse(btn.dataset.redoParams) : undefined;
    } catch {
      params = undefined;
    }
    const res = await ctx.ui.showConfirm({
      title: actionId ? "Roll for it?" : "Redo without a roll?",
      message: actionId ? "The reply to your message is replaced with a new one where the dice decide." : "The reply to your message is replaced with a new one, treating your message as plain roleplay (no check).",
      confirmLabel: actionId ? "Roll it" : "Redo turn",
      variant: "info"
    });
    if (!res.confirmed)
      return;
    busy = { chatId: cid, on: true, label: "Rolling…" };
    placeChoices(true);
    send({ type: "redo", chatId: cid, userMessageId, actionId, params });
  }
  const onDocClick = (e) => {
    const t = e.target;
    if (!t?.closest)
      return;
    const choice = t.closest(".warp-choices [data-act]");
    if (choice) {
      e.preventDefault();
      act(choice.dataset.act);
      return;
    }
    const dice = t.closest(".warp-chips [data-dice]");
    if (dice) {
      const row = dice.closest(".warp-chips");
      if (row.hasAttribute("data-open"))
        row.removeAttribute("data-open");
      else
        row.setAttribute("data-open", "");
      return;
    }
    const why = t.closest(".warp-chips [data-why]");
    if (why) {
      const row = why.closest(".warp-chips");
      if (row.hasAttribute("data-why-open"))
        row.removeAttribute("data-why-open");
      else
        row.setAttribute("data-why-open", "");
      return;
    }
    const redo = t.closest(".warp-chips [data-redo]");
    if (redo) {
      e.preventDefault();
      confirmRedo(redo);
      return;
    }
    const dismiss = t.closest(".warp-chips [data-dismiss-suggest]");
    if (dismiss) {
      const cid = chatId();
      if (cid)
        send({ type: "dismiss_suggestion", chatId: cid, messageId: dismiss.dataset.dismissSuggest });
      return;
    }
    const undo = t.closest(".warp-chips [data-undo]");
    if (undo) {
      const row = undo.closest("[data-warp-chips]");
      const messageId = row?.dataset.warpChips;
      const rec = state?.records.find((r) => r.messageId === messageId);
      const cid = chatId();
      if (rec && cid)
        send({ type: "undo", chatId: cid, messageId: rec.messageId, swipe: rec.swipe, events: undo.dataset.undo.split(",").map(Number) });
    }
  };
  document.addEventListener("click", onDocClick, true);
  cleanups.push(() => document.removeEventListener("click", onDocClick, true));
  const onKey = (e) => {
    if (!settings.hotkeys || e.ctrlKey || e.metaKey || e.altKey)
      return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))
      return;
    if (!/^[0-9]$/.test(e.key) || !state?.choices.length || !choicesEl?.isConnected)
      return;
    const n = e.key === "0" ? 10 : Number(e.key);
    const c = state.choices[n - 1];
    if (!c)
      return;
    e.preventDefault();
    act(c.id);
  };
  document.addEventListener("keydown", onKey);
  cleanups.push(() => document.removeEventListener("keydown", onKey));
  cleanups.push(ctx.onBackendMessage((raw) => {
    const m = raw;
    switch (m.type) {
      case "state": {
        const active = chatId();
        if (m.chatId && active && m.chatId !== active)
          return;
        if (state?.chatId !== m.chatId) {
          editingBar = null;
          lastBars = new Map;
        }
        const entered = !state?.dungeon && !!m.dungeon && state?.chatId === m.chatId;
        if (!m.dungeon?.battle)
          dgPick = dgPick?.kind === "use" ? dgPick : null;
        state = m;
        if (entered)
          drawerView = "dungeon";
        if (m.chatId === busy.chatId && !m.busy && busy.label === "Rolling…")
          busy = { chatId: "", on: false, label: "" };
        if (m.busy && m.chatId)
          busy = { chatId: m.chatId, on: true, label: busy.label };
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
        if (!builder || !prev || prev.characterId !== builder.characterId || prev.mode !== builder.mode || prev.step !== builder.step && builder.step === "start") {
          const keep = { creative: bDraft.creative, connectionId: bDraft.connectionId };
          bDraft = { ...emptyDraft(), ...keep, ...builder ? { additions: builder.additions.map((a) => ({ ...a })) } : {} };
        }
        if (builder && prev?.step !== builder.step)
          bDraft.notes = {};
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
        if (m.command === "install")
          confirmReplace();
        else if (m.command === "dungeon")
          openDungeon();
        else {
          drawerView = "sheet";
          tab.activate();
        }
        break;
      case "toast":
        console.info(`[warp] ${m.message}`);
        break;
    }
  }));
  send({ type: "hello", chatId: chatId() });
  let lastChat = chatId();
  const poll = setInterval(() => {
    const now = chatId();
    if (now !== lastChat) {
      lastChat = now;
      send({ type: "refresh", chatId: now });
    }
  }, 1000);
  cleanups.push(() => clearInterval(poll));
  const cleanup = () => {
    for (const { el } of chipEls.values())
      ctx.dom.uninject(el);
    if (choicesEl)
      ctx.dom.uninject(choicesEl);
    for (const c of cleanups.reverse()) {
      try {
        c();
      } catch {}
    }
  };
  globalThis[CLEANUP_KEY] = cleanup;
  return cleanup;
}
export {
  setup
};
