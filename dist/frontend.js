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
    helperConnectionId: "",
    decider: "llm",
    jevModel: "jev-latest",
    jevUrl: "https://api.typesafe.ai/v1/systemone",
    swipesReroll: true,
    showChoices: true,
    showOdds: true,
    showChanges: true,
    hotkeys: true,
    lines: [],
    veils: []
  };
});

// src/shared/classifier-config.ts
function classifierIssue(_format, _model, url) {
  const path = (() => {
    try {
      return new URL(url).pathname.replace(/\/+$/, "");
    } catch {
      return "";
    }
  })();
  if (/\/chat\/completions$/.test(path))
    return `This URL is a chat endpoint. Jev needs a typed-question endpoint: TypeSafe's (the default), or for Jev on OpenRouter ${OPENROUTER_JEV.jevUrl} with model ${OPENROUTER_JEV.jevModel}. To use a chat model, pick Helper and set the helper connection.`;
  return null;
}
var OPENROUTER_JEV;
var init_classifier_config = __esm(() => {
  OPENROUTER_JEV = {
    decider: "jev",
    jevModel: "typesafe/jev-1.13",
    jevUrl: "https://openrouter.ai/api/alpha/decisions"
  };
});

// src/engine/format-version.ts
var RULESET_FORMAT = 2;

// src/shared/revision.ts
function revision(value) {
  const text = JSON.stringify(value);
  let a = 2166136261, b = 2246822507;
  for (let i = 0;i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 3266489909);
  }
  return `${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}

// src/frontend.ts
init_protocol();
init_classifier_config();

// src/frontend/styles.ts
var STYLES = `
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
  const side = Math.min(SIDE_W, vp.width - PAD * 2);
  switch (edge) {
    case "left":
      return { x: PAD, y: PAD, w: side, h: vp.height - PAD * 2 };
    case "right":
      return { x: vp.width - side - PAD, y: PAD, w: side, h: vp.height - PAD * 2 };
    case "top":
      return { x: PAD, y: PAD, w: vp.width - PAD * 2, h: STRIP_H };
    case "bottom":
      return { x: PAD, y: vp.height - STRIP_H - PAD, w: vp.width - PAD * 2, h: STRIP_H };
  }
}
function panelWidth(vp) {
  return Math.max(PILL.w, Math.min(PANEL_W, vp.width - PAD * 2));
}
function floatingBox(vp, open, h, y = 72) {
  const w = open ? panelWidth(vp) : PILL.w;
  const x = Math.max(PAD, Math.min(vp.width - w - 20, vp.width - w - PAD));
  const top = Math.max(PAD, Math.min(y, vp.height - PILL.h - PAD));
  const height = open ? Math.max(PILL.h, Math.min(h, vp.height - top - PAD)) : PILL.h;
  return { x, y: top, w, h: height };
}
function wh(s) {
  return { w: s.w, h: s.h };
}

// src/frontend/html.ts
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function pctTone(p) {
  return p >= 0.66 ? "good" : p >= 0.33 ? "warn" : "bad";
}
var TIER_TONE = { crit_success: "good", success: "good", partial: "warn", fail: "bad", crit_fail: "bad" };
function section(title, count, body, open, key = title) {
  return `<details class="warp-section" data-section="${esc(key)}"${open ? " open" : ""}><summary><span>${esc(title)}${count ? ` · ${count}` : ""}</span></summary><div class="warp-section-body">${body}</div></details>`;
}
function editButton(key, label) {
  return `<button class="warp-btn warp-btn-ghost warp-edit" data-edit="${esc(key)}" title="${esc(label)}" aria-label="${esc(label)}">✎</button>`;
}
var pct = (p) => `${Math.round(p * 100)}%`;

// src/frontend/render-panel.ts
function renderHud(h, opts) {
  const { head, parts } = hudParts(h, opts);
  return head + parts.map(renderPart).join("");
}
var renderPart = (p) => section(p.title, p.count, p.body, p.open, p.id);
function hudParts(h, opts) {
  const parts = [sceneSection(h, opts), youSection(h, opts)];
  if (h.people.length)
    parts.push(peopleSection(h, opts));
  const goals = goalsSection(h.goals, opts);
  if (goals)
    parts.push(goals);
  return { head: h.conflict ? renderConflict(h.conflict) : "", parts };
}
var draft = (opts, key, fallback) => opts.drafts?.[key] ?? fallback;
function fixRow(key, field, who, inputs) {
  return `<div class="warp-fix" data-fix-row="${esc(key)}">${inputs}<button class="warp-btn warp-btn-primary warp-mini" data-fix="${esc(field)}"${who !== null ? ` data-who="${esc(who)}"` : ""}>Set</button><button class="warp-btn warp-btn-ghost warp-mini" data-edit="${esc(key)}" aria-label="Cancel">Cancel</button></div>`;
}
function textInput(key, value, label, opts, placeholder = "") {
  return `<input class="warp-input" type="text" maxlength="160" data-fix-input="${esc(key)}" value="${esc(draft(opts, key, value))}" placeholder="${esc(placeholder)}" aria-label="${esc(label)}">`;
}
function numberInput(key, value, label, opts, attrs = "") {
  return `<input class="warp-input warp-num" type="number" inputmode="decimal" data-fix-input="${esc(key)}" value="${esc(draft(opts, key, String(value)))}" aria-label="${esc(label)}"${attrs}>`;
}
var hhmm = (minutes) => {
  const m = (Math.round(minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
function clockParts(minutes) {
  return { day: Math.floor(minutes / 1440) + 1, time: hhmm(minutes) };
}
var gaugeLeft = (momentum) => (100 - Math.max(-100, Math.min(100, momentum))) / 2;
function renderGauge(c) {
  const m = Math.round(c.momentum);
  return `<div class="warp-gauge-labels"><span class="warp-tone-good">You</span><span class="warp-tone-bad">${esc(c.opponent)}</span></div>
    <div class="warp-momentum" role="meter" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="${m}" aria-label="Momentum" title="${esc(`Momentum ${m > 0 ? "+" : ""}${m}: only a full swing either way ends it`)}"><div class="warp-momentum-mid"></div><div class="warp-momentum-mark" style="left:${gaugeLeft(m).toFixed(1)}%"></div></div>
    <div class="warp-conflict-words">${esc(c.words)}</div>`;
}
var roundText = (c) => `round ${Math.min(c.round + 1, c.maxRounds)}/${c.maxRounds}`;
function renderConflict(c) {
  return `<div class="warp-conflict" role="group" aria-label="${esc(`${c.label} with ${c.opponent}`)}">
    <div class="warp-conflict-head"><span>⚔ ${esc(c.label)} · ${esc(c.opponent)}</span><span class="warp-dim">${esc(roundText(c))}</span></div>
    ${renderGauge(c)}
    ${c.next ? `<div class="warp-dim">Next move: <b class="warp-tone-${pctTone(c.next.odds)}">${pct(c.next.odds)}</b> (${esc(c.next.stat)})</div>` : ""}
    <div class="warp-row"><button class="warp-btn warp-mini" data-contest="break_off" title="Try to get away: a check">Break off</button><button class="warp-btn warp-btn-ghost warp-mini" data-contest="give_in" title="Lose at once, no roll">Give in</button></div>
  </div>`;
}
function sceneSection(h, opts) {
  const rows = [];
  if (h.clock) {
    const c = h.clock;
    const at = clockParts(c.minutes);
    rows.push(`<div class="warp-line warp-clock"><span class="warp-clock-time">${esc(c.time)}</span><span class="warp-clock-day">${esc(h.date ?? c.day)}${c.phase ? ` · ${esc(c.phase)}` : ""}</span>${editButton("time", "Fix the time")}</div>`);
    if (opts.editing === "time")
      rows.push(fixRow("time", "time", null, `<label class="warp-fix-label">Day ${numberInput("time:day", at.day, "Day", opts, ` min="1" step="1"`)}</label><input class="warp-input warp-time" type="time" data-fix-input="time" value="${esc(draft(opts, "time", at.time))}" aria-label="Time">`));
  }
  if (opts.sceneHint)
    rows.push(`<div class="warp-hint warp-tone-warn">${esc(opts.sceneHint)}</div>`);
  const place = h.location?.name ?? null;
  rows.push(`<div class="warp-line"><span>\uD83D\uDCCD ${place ? `<b>${esc(place)}</b>` : `<span class="warp-dim">Place not known yet</span>`}</span>${editButton("place", "Fix the place")}</div>`);
  if (opts.editing === "place")
    rows.push(fixRow("place", "place", null, textInput("place", place ?? "", "Place", opts, "Where you are, in words")));
  const here = h.people.filter((p) => p.present);
  if (h.people.length) {
    rows.push(`<div class="warp-line"><span>${here.length ? `Here: ${here.map((p) => `<b>${esc(p.name)}</b>`).join(", ")}` : `<span class="warp-dim">No one you know is here.</span>`}</span>${editButton("here", "Fix who is here")}</div>`);
    if (h.wereWithYou.length)
      rows.push(`<div class="warp-line warp-dim"><span>Were with you: ${h.wereWithYou.map((p) => esc(p.name)).join(", ")}</span></div>`);
    if (opts.editing === "here")
      rows.push(`<div class="warp-fix warp-tags" data-fix-row="here">${h.people.map((p) => presentToggle(p, "name")).join("")}<button class="warp-btn warp-btn-ghost warp-mini" data-edit="here">Done</button></div>`);
  }
  return { id: "scene", title: "Scene", count: 0, body: rows.join(""), open: true };
}
function presentToggle(p, show) {
  const label = show === "name" ? p.name : p.present ? "here" : "+ here";
  const title = p.present ? `${p.name} is here. Tap if not.` : `${p.name} is not here. Tap if they are.`;
  return `<button class="${show === "name" ? "warp-tag" : p.present ? "warp-here" : "warp-here warp-away-badge"}" data-fix-present="${esc(p.id)}" data-value="${p.present ? "false" : "true"}" aria-pressed="${p.present}" title="${esc(title)}">${esc(label)}</button>`;
}
function lookRows(who, look, name, opts) {
  const row = (field, label) => {
    const key = `look:${who}:${field}`;
    const v = look[field];
    return `<div class="warp-line"><span><span class="warp-dim">${label}:</span> ${v ? esc(v) : `<span class="warp-dim">not known yet</span>`}</span>${editButton(key, `Fix ${name}'s ${field}`)}</div>${opts.editing === key ? fixRow(key, field, who, textInput(key, v ?? "", `${name}: ${field}`, opts, field === "outfit" ? "e.g. grey hoodie, black jeans" : "e.g. tall, red braid, freckles")) : ""}`;
  };
  return row("appearance", "Looks") + row("outfit", "Wears");
}
function youSection(h, opts) {
  const bars = h.bars.map((b) => {
    const key = `bar:${b.id}`;
    const editing = opts.editing === key;
    const step = b.max - b.min > 200 ? 1 : b.max - b.min > 20 ? 0.5 : 0.1;
    const v = Math.round(b.value * 10) / 10;
    return `<div class="warp-bar" data-bar="${esc(b.id)}" data-edit="${esc(key)}" title="${esc(`${b.label}: ${b.display}${b.desc ? ` — ${b.desc}` : ""}
Tap to fix`)}">
      <div class="warp-bar-head"><span class="warp-bar-label">${esc(b.label)}</span><span class="warp-bar-text warp-tone-${b.tone}">${esc(b.text ?? b.display)}</span></div>
      <div class="warp-bar-track"><div class="warp-bar-fill warp-bg-${b.tone}" style="width:${(b.pct * 100).toFixed(1)}%${b.color ? `;background:${esc(b.color)}` : ""}"></div></div>
      ${editing ? `<div class="warp-bar-edit">
          <input type="range" min="${b.min}" max="${b.max}" step="${step}" value="${v}" data-range aria-label="${esc(b.label)}">
          <input class="warp-input warp-num" type="number" min="${b.min}" max="${b.max}" step="${step}" value="${v}" data-num aria-label="${esc(b.label)} value">
          <button class="warp-btn warp-btn-primary warp-mini" data-save-bar="${esc(b.id)}">Set</button>
        </div>` : ""}
    </div>`;
  }).join("");
  const conds = h.conditions.length ? `<div class="warp-pills">${h.conditions.map((c) => `<span class="warp-pill warp-tone-${c.tone}" title="${esc(c.desc ?? "")}">${esc(c.label)}${c.remaining ? ` · ${esc(c.remaining)}` : ""}</span>`).join("")}</div>` : "";
  const moneyNum = h.money?.match(/-?\d[\d,]*(?:\.\d+)?/)?.[0]?.replace(/,/g, "") ?? "";
  const money = h.money !== null ? `<div class="warp-line"><span>\uD83D\uDCB0 <span class="warp-money">${esc(h.money)}</span></span>${editButton("money", "Fix your money")}</div>${opts.editing === "money" ? fixRow("money", "money", null, numberInput("money", moneyNum, "Money", opts, ` min="0" step="any"`)) : ""}` : "";
  const items = h.items.map((i) => {
    const key = `item:${i.id}`;
    const use = i.use ? i.use.locked ? `<button class="warp-btn warp-mini" disabled title="${esc(i.use.locked)}">\uD83D\uDD12 Use</button>` : `<button class="warp-btn warp-mini" data-use="${esc(i.use.id)}" title="${esc(i.use.label)}">Use</button>` : "";
    return `<div class="warp-item${i.use ? " warp-item-usable" : ""}">
        <span class="warp-item-name">${esc(i.name)}${i.uses ? ` <span class="warp-dim" title="Uses left in the one in hand">· ${esc(i.uses)}</span>` : ""}${i.bonus ? `<span class="warp-item-bonus" title="Added to checks that use it">${esc(i.bonus)}</span>` : ""}</span>
        <span class="warp-item-side">${i.count > 1 ? `<span class="warp-kbd">×${i.count}</span>` : ""}${use}${editButton(key, `Fix how many ${i.name} you have`)}</span>
      </div>${opts.editing === key ? fixRow(key, "item", i.id, numberInput(key, i.count, `${i.name}: how many`, opts, ` min="0" step="1"`)) : ""}`;
  }).join("");
  const carrying = h.items.length ? `<details class="warp-sub" data-section="you-items"${!opts.compact || h.items.length <= 3 ? " open" : ""}><summary>Carrying · ${h.items.length}</summary><div class="warp-sub-body">${items}</div></details>` : "";
  const skillRow = (s) => {
    const key = `skill:${s.id}`;
    return `<div class="warp-skill" data-edit="${esc(key)}" title="${esc(`${s.label}: ${s.display}${s.text ? ` — ${s.text}` : ""}${s.practice !== null ? `
Practice toward the next point: ${Math.round(s.practice * 100)}% — it grows every time you use it` : ""}
Tap to fix`)}">
      <span>${esc(s.label)}</span>
      <span class="warp-grade ${s.grade ? `warp-tone-${pctTone(s.pct)}` : s.text ? `warp-tone-${s.tone}` : ""}">${esc(s.grade ?? s.text ?? s.display)}</span>
      <div class="warp-skill-tracks">
        <div class="warp-mini-track"><div class="warp-mini-fill" style="width:${(s.pct * 100).toFixed(1)}%"></div></div>
        ${s.practice !== null ? `<div class="warp-practice-track"><div class="warp-practice-fill" style="width:${(s.practice * 100).toFixed(1)}%"></div></div>` : ""}
      </div>
    </div>${opts.editing === key ? (() => {
      const step = s.max - s.min > 200 ? 1 : s.max - s.min > 20 ? 0.5 : s.max - s.min > 2 ? 1 : 0.1;
      const v = Math.round(s.value * 10) / 10;
      return `<div class="warp-bar-edit">
          <input type="range" min="${s.min}" max="${s.max}" step="${step}" value="${v}" data-range aria-label="${esc(s.label)}">
          <input class="warp-input warp-num" type="number" min="${s.min}" max="${s.max}" step="${step}" value="${v}" data-num aria-label="${esc(s.label)} value">
          <button class="warp-btn warp-btn-primary warp-mini" data-save-skill="${esc(s.id)}">Set</button>
        </div>`;
    })() : ""}`;
  };
  const groups = [...new Set(h.skills.map((x) => x.group))];
  const skillsBody = groups.length < 2 ? h.skills.map(skillRow).join("") : groups.map((g) => `<div class="warp-group"><div class="warp-group-head">${esc(g)}</div>${h.skills.filter((x) => x.group === g).map(skillRow).join("")}</div>`).join("");
  const skills = h.skills.length ? `<details class="warp-sub" data-section="you-skills"${opts.compact ? "" : " open"}><summary>Skills & attributes · ${h.skills.length}</summary><div class="warp-sub-body">${skillsBody}</div></details>` : "";
  const body = [
    bars ? `<div class="warp-bars">${bars}</div>` : "",
    conds,
    money,
    lookRows("you", h.you, "your", opts),
    carrying,
    skills
  ].join("");
  return { id: "you", title: "You", count: 0, body, open: true };
}
function personRow(p, opts) {
  const looks = [p.appearance, p.outfit ? `wears ${p.outfit}` : null].filter(Boolean).join("; ");
  const openLooks = !opts.compact || (opts.editing ?? "").startsWith(`look:${p.id}:`);
  const stats = p.stats.map((s) => `<button class="warp-rel" data-edit="${esc(`rel:${p.id}:${s.id}`)}" title="${esc(`${s.label}: ${s.display} (${s.min}–${s.max}) — tap to fix`)}">${esc(s.label)}: <span class="warp-tone-${s.tone}">${esc(s.text ?? s.display)}</span></button>`).join("");
  const relEdit = p.stats.filter((s) => opts.editing === `rel:${p.id}:${s.id}`).map((s) => `<div class="warp-bar-edit">
      <span class="warp-dim">${esc(s.label)}</span>
      <input type="range" min="${s.min}" max="${s.max}" step="1" value="${Math.round(s.value)}" data-range aria-label="${esc(s.label)}">
      <input class="warp-input warp-num" type="number" min="${s.min}" max="${s.max}" value="${Math.round(s.value)}" data-num aria-label="${esc(s.label)} value">
      <button class="warp-btn warp-btn-primary warp-mini" data-save-rel="${esc(`${p.id}:${s.id}`)}">Set</button>
    </div>`).join("");
  const actions = p.actions.length ? `<div class="warp-person-actions">${p.actions.map((a) => a.locked ? `<button class="warp-btn warp-mini" disabled title="${esc(a.locked)}">\uD83D\uDD12 ${esc(a.label)}</button>` : `<button class="warp-btn warp-mini" data-use="${esc(a.id)}" title="${esc(a.desc ?? a.label)}">${esc(a.label)}${a.odds !== null ? ` <span class="warp-tone-${pctTone(a.odds)}">${pct(a.odds)}</span>` : ""}</button>`).join("")}</div>` : "";
  return `<div class="warp-person${p.present ? " warp-person-here" : ""}">
      <div class="warp-person-name">${esc(p.name)} ${presentToggle(p, "badge")}${opts.compact ? "" : ` <button class="warp-btn warp-btn-ghost warp-forget" data-forget="${esc(p.id)}" data-name="${esc(p.name)}" title="Stop tracking ${esc(p.name)}">Forget</button>`}</div>
      ${p.conditions.length ? `<div class="warp-pills">${p.conditions.map((c) => `<span class="warp-pill warp-tone-${c.tone}">${esc(c.label)}${c.remaining ? ` · ${esc(c.remaining)}` : ""}</span>`).join("")}</div>` : ""}
      ${stats ? `<div class="warp-person-stats">${stats}</div>` : ""}${relEdit}
      <details class="warp-looks"${openLooks ? " open" : ""}><summary>\uD83D\uDC64 ${looks ? esc(looks) : `<span class="warp-dim">Looks not known yet</span>`}</summary>${lookRows(p.id, p, p.name, opts)}</details>
      ${p.memories.length ? `<details class="warp-memories"><summary>\uD83D\uDCAD Remembers · ${p.memories.length}</summary>${p.memories.map((m) => `<div class="warp-memory">${esc(m.text)}${m.when ? ` <span class="warp-dim">· ${esc(m.when)}</span>` : ""}</div>`).join("")}</details>` : ""}
      ${actions}
    </div>`;
}
function peopleSection(h, opts) {
  const here = h.people.filter((p) => p.present);
  const away = h.people.filter((p) => !p.present);
  const body = `${here.length ? here.map((p) => personRow(p, opts)).join("") : `<div class="warp-empty">No one you know is here.</div>`}${away.length ? `<details class="warp-away" data-section="people-away"${opts.compact ? "" : " open"}><summary>Elsewhere · ${away.length}</summary><div class="warp-section-body">${away.map((p) => personRow(p, opts)).join("")}</div></details>` : ""}`;
  return { id: "people", title: "People", count: here.length, body, open: !opts.compact || here.length > 0 };
}
function goalRow(g, opts) {
  const key = `goal:${g.id}`;
  const mark = g.status === "done" ? "✓" : g.status === "failed" ? "✕" : "◇";
  const tone = g.status === "done" ? "good" : g.status === "failed" ? "bad" : "neutral";
  const fix = opts.editing === key ? `<div class="warp-fix" data-fix-row="${esc(key)}">${(g.status === "open" ? [["done", "Done"], ["failed", "Failed"], ["drop", "Drop"]] : [["open", "Reopen"], ["drop", "Drop"]]).map(([v, l]) => `<button class="warp-btn warp-mini" data-fix-goal="${esc(g.id)}" data-value="${v}">${l}</button>`).join("")}<button class="warp-btn warp-btn-ghost warp-mini" data-edit="${esc(key)}">Cancel</button></div>` : "";
  return `<div class="warp-goal warp-goal-${g.status}">
      <div class="warp-line"><span><span class="warp-tone-${tone}">${mark}</span> ${esc(g.text)}${g.from ? ` <span class="warp-dim">for ${esc(g.from)}</span>` : ""}</span>${editButton(key, "Mark this goal done, failed or drop it")}</div>
      ${g.stakes && g.status === "open" ? `<div class="warp-goal-stakes">At stake: ${esc(g.stakes)}</div>` : ""}
      ${fix}
    </div>`;
}
function goalsSection(goals, opts) {
  const open = goals.filter((g) => g.status === "open");
  const ended = goals.filter((g) => g.status !== "open");
  if (!open.length && (opts.compact || !ended.length))
    return null;
  const body = `${open.slice(0, 3).map((g) => goalRow(g, opts)).join("") || `<div class="warp-empty">No goals open.</div>`}${ended.length ? `<details class="warp-away" data-section="goals-ended"><summary>Finished · ${ended.length}</summary><div class="warp-section-body">${ended.map((g) => goalRow(g, opts)).join("")}</div></details>` : ""}`;
  return { id: "goals", title: "Goals", count: open.length, body, open: true };
}

// src/frontend/render-chat.ts
var SHOWN_CHANGES = 6;
function d20Odds(add, target) {
  let n = 1;
  for (let f = 2;f <= 19; f++)
    if (f + add >= target)
      n++;
  return n / 20;
}
function checkOdds(c) {
  if (c.target === null || c.faces.length !== 1 || c.faces[0].sides !== 20)
    return null;
  return d20Odds(c.add, c.target);
}
function momentumOf(rec) {
  const d = rec.contest?.swing ?? 0;
  return d ? `Momentum ${d > 0 ? "+" : "−"}${Math.abs(Math.round(d))}` : null;
}
function changeItems(rec, latest) {
  const out = [];
  for (const l of rec.lines.slice(0, 3))
    out.push({ text: l, tone: "neutral", tip: "A relationship or meter crossed into a new band", undo: null, kind: "line" });
  for (const d of rec.decisions) {
    out.push({
      text: `\uD83C\uDFAD ${d.picked}`,
      tone: "neutral",
      undo: null,
      kind: "decision",
      tip: `${d.ask}
${d.odds.map((o) => `${o.desc} ${pct(o.p)}`).join(" · ")}
${d.source === "model" ? "Odds from the decision model; the engine rolled." : "Odds from the ruleset's weights; the engine rolled."}`
    });
  }
  for (const ch of rec.changes) {
    const told = ch.src === "narrator" || ch.src === "manual";
    const cause = ch.why?.length ? ch.why.join(" · ") : ch.src === "manual" ? "You set this" : told ? "Read from the story" : "Applied by the rules";
    out.push({
      text: `${ch.text}${ch.band ? ` (${ch.band})` : ""}`,
      tone: ch.tone,
      tip: cause,
      kind: "change",
      undo: latest && told && ch.undo?.length ? ch.undo : null
    });
  }
  if (rec.veiled)
    out.push({ text: "◐ veiled", tone: "warn", tip: "Narrated off-screen by your Veils setting", undo: null, kind: "change" });
  return out;
}
function renderReply(rec, opts) {
  const out = [];
  const notAction = rec.redoFrom ? `<button class="warp-btn warp-btn-ghost warp-mini" data-redo="${esc(rec.redoFrom)}" title="Redo this turn without a roll">Not an action?</button>` : "";
  if (rec.check) {
    const c = rec.check;
    const swing = momentumOf(rec);
    const odds = checkOdds(c);
    const read = rec.via === "adjudicator" ? `<span class="warp-dim">· read from your message${rec.confidence !== null ? ` (${Math.round(rec.confidence * 100)}% sure)` : ""}</span>` : "";
    out.push(`<button class="warp-chip warp-dice warp-tone-${TIER_TONE[c.tier] ?? "neutral"}" data-dice title="Show the roll">\uD83C\uDFB2 ${esc(c.label)} · ${esc(c.tierLabel)}${swing ? ` · ${esc(swing)}` : ""}</button>`);
    out.push(`<div class="warp-dice-detail">${c.faces.map((f) => `<span class="warp-die" title="d${f.sides}"${f.kept ? "" : " data-dropped"}>${f.value}</span>`).join("")}<span>${esc(c.summary)}${odds !== null ? ` · ${pct(odds)} odds` : ""}</span>${read}${notAction}</div>`);
  } else if (notAction) {
    out.push(`<span class="warp-chip">▸ ${esc(rec.action ?? "Read as an action")}</span>${notAction}`);
  }
  const items = opts.showChanges ? changeItems(rec, opts.latest) : [];
  if (items.length) {
    const shown = items.map((it, i) => `<span class="warp-ch warp-ch-${it.kind} warp-tone-${it.tone}${i >= SHOWN_CHANGES ? " warp-ch-extra" : ""}" title="${esc(it.tip)}">${esc(it.text)}${it.undo ? `<button class="warp-chip-undo" data-undo="${esc(it.undo.join(","))}" title="Undo this change" aria-label="Undo ${esc(it.text)}">×</button>` : ""}</span>`);
    const more = items.length > SHOWN_CHANGES ? `<button class="warp-ch-more" data-more>+${items.length - SHOWN_CHANGES} more</button>` : "";
    out.push(`<div class="warp-whatchanged">${shown.join(`<span class="warp-ch-sep" aria-hidden="true">·</span>`)}${more}</div>`);
  }
  return out.join("");
}
var isMainChoice = (c) => c.id.startsWith("live:") || c.id.startsWith("contest:");
function choiceOrder(choices) {
  return [...choices.filter(isMainChoice), ...choices.filter((c) => !isMainChoice(c))];
}
var MORE_SHOWN = 4;
function oddsTip(c) {
  if (c.odds === null)
    return "";
  return `${c.checkLabel ?? "Check"}${c.difficulty && c.difficulty !== "none" ? ` · ${c.difficulty}` : ""}: ${pct(c.odds)} success${c.partialOdds ? `, ${pct(c.partialOdds)} partial` : ""}`;
}
function choiceButton(c, n, opts, small) {
  const key = opts.hotkeys && n <= 9 ? `<span class="warp-kbd">${n}</span>` : "";
  const tip = [c.desc, c.why ? `Why now: ${c.why}` : null, opts.showOdds ? oddsTip(c) || null : null, c.veiled ? "Veiled: happens off-screen" : null].filter(Boolean).join(`
`);
  if (c.locked)
    return `<button class="warp-choice warp-choice-locked${small ? " warp-choice-small" : ""}" disabled title="${esc(`${c.desc ?? c.label}
Locked: ${c.locked}`)}"><span class="warp-choice-label">${esc(c.label)}<span class="warp-choice-why">\uD83D\uDD12 ${esc(c.locked)}</span></span></button>`;
  const odds = opts.showOdds && c.odds !== null ? `<span class="warp-choice-odds warp-tone-${pctTone(c.odds + (c.partialOdds ?? 0) / 2)}">${pct(c.odds)}</span>` : "";
  return `<button class="warp-choice${small ? " warp-choice-small" : ""}${c.id.startsWith("item:") ? " warp-choice-item" : ""}" data-act="${esc(c.id)}"${tip ? ` title="${esc(tip)}"` : ""}>${key}<span class="warp-choice-label">${esc(c.label)}${c.why ? `<span class="warp-choice-why">${esc(c.why)}</span>` : ""}</span>${c.veiled ? `<span class="warp-choice-veil" aria-label="veiled">◐</span>` : ""}${odds}</button>`;
}
function renderChoices(choices, opts) {
  if (!choices.length && !opts.busy && !opts.conflict)
    return "";
  const ordered = choiceOrder(choices);
  const main = ordered.filter(isMainChoice);
  const more = ordered.filter((c) => !isMainChoice(c));
  const status = opts.busy ? `<div class="warp-status-line"><span class="warp-spinner"></span>${esc(opts.busyLabel || "Writing choices…")}</div>` : "";
  const gauge = opts.conflict ? `<div class="warp-conflict warp-conflict-slim"><div class="warp-conflict-head"><span>⚔ ${esc(opts.conflict.label)} · ${esc(opts.conflict.opponent)}</span><span class="warp-dim">${esc(roundText(opts.conflict))}</span></div>${renderGauge(opts.conflict)}</div>` : "";
  const mainRow = main.length ? `<div class="warp-choice-grid">${main.map((c, i) => choiceButton(c, i + 1, opts, false)).join("")}</div>` : "";
  const moreButtons = more.map((c, i) => choiceButton(c, main.length + i + 1, opts, true));
  const moreRow = more.length ? `<div class="warp-more">${moreButtons.slice(0, MORE_SHOWN).join("")}${more.length > MORE_SHOWN ? `<details class="warp-more-fold"><summary title="More actions">…</summary><div class="warp-more">${moreButtons.slice(MORE_SHOWN).join("")}</div></details>` : ""}</div>` : "";
  return `${status}${gauge}${mainRow}${moreRow}`;
}

// src/frontend/render-settings.ts
init_protocol();
init_classifier_config();
function toggle(key, label, hint, on) {
  return `<label class="warp-toggle"><span>${esc(label)}</span><small>${esc(hint)}</small><input type="checkbox" data-setting="${esc(key)}"${on ? " checked" : ""}></label>`;
}
function boolSeg(key, label, on, yes, no, hint) {
  return `<div class="warp-field"><span>${esc(label)}</span>
    <div class="warp-seg" role="radiogroup" aria-label="${esc(label)}">
      <button class="warp-seg-btn" data-setting-bool="${esc(key)}" data-v="1" role="radio" aria-pressed="${on}" aria-checked="${on}">${esc(yes)}</button>
      <button class="warp-seg-btn" data-setting-bool="${esc(key)}" data-v="0" role="radio" aria-pressed="${!on}" aria-checked="${!on}">${esc(no)}</button>
    </div><small class="warp-dim">${esc(hint)}</small></div>`;
}
function templateFor(style, templates) {
  return templates.find((t) => t.id === style) ?? null;
}
function renderStyleSwitch(status, templates) {
  const none = !status || status.state === "none";
  const fromTemplate = !none && !!status.template;
  const current = none ? null : status.style ?? null;
  const mode = none ? "install" : fromTemplate ? "switch" : null;
  const button = (style, label) => {
    const t = templateFor(style, templates);
    const on = current === style;
    const usable = !!status && !!mode && !!t && !on;
    return `<button class="warp-seg-btn" data-style="${style}"${usable ? ` data-style-mode="${mode}" data-template="${esc(t.id)}"` : ""} role="radio" aria-pressed="${on}" aria-checked="${on}"${usable || on ? "" : " disabled"}>${esc(label)}</button>`;
  };
  const hint = !status ? "Open a chat to choose." : none ? "No rules yet: pick one to add it to this character." : fromTemplate ? "Switching keeps your people; the rest of the template is replaced." : "This ruleset was written for this card. To change it, set `style:` in the ruleset.";
  return `<div class="warp-field"><span>Style</span>
    <div class="warp-seg" role="radiogroup" aria-label="Style">${button("story", "Story (no dice)")}${button("adventure", "Adventure (dice)")}</div>
    <small class="warp-dim">${esc(hint)}</small></div>`;
}
function renderDecider(s, jevKeySet) {
  const opt = (v, label) => `<option value="${v}"${s.decider === v ? " selected" : ""}>${label}</option>`;
  const jev = s.decider === "jev";
  const typesafe = s.jevUrl === DEFAULT_SETTINGS.jevUrl;
  const issue = jev ? classifierIssue("typesafe", s.jevModel, s.jevUrl) : null;
  const host = (() => {
    try {
      return new URL(s.jevUrl).host;
    } catch {
      return s.jevUrl;
    }
  })();
  return `<div class="warp-card">
    <h3>Decision model</h3>
    <p>Answers Warp's quick questions: what your message tries, who is here, what changed. It never picks outcomes; the dice do.</p>
    <select class="warp-select" data-setting="decider" aria-label="Decision model">
      ${opt("llm", "Helper model")}
      ${opt("jev", "Jev (fast, cheap classifier)")}
    </select>
    <small class="warp-dim">Jev makes typed play faster and cheaper: every turn then needs only one helper call.</small>
    ${jev ? `
    <div class="warp-row">
      <input class="warp-input" type="password" data-jevkey placeholder="${jevKeySet ? "Key saved — paste to replace" : "Jev API key"}" autocomplete="off" style="flex:1" aria-label="Jev API key">
      <button class="warp-btn" data-save-jev>${jevKeySet ? "Replace" : "Save"}</button>
      ${jevKeySet ? `<button class="warp-btn warp-btn-ghost" data-clear-jev>Remove</button>` : ""}
    </div>
    <p>${jevKeySet ? "✓ Key stored encrypted on the server." : typesafe ? "No key yet: until you add one, the helper model answers." : "No key saved: fine for a local server."} Your roleplay text goes to <b>${esc(host)}</b> for these questions.</p>
    ${issue ? `<p class="warp-tone-warn" role="alert">${esc(issue)}</p>` : ""}
    <details data-section="advanced-classifier"${issue ? " open" : ""}><summary>Advanced: endpoint and model</summary>
      <label class="warp-field">Endpoint
        <input class="warp-input" data-setting="jevUrl" value="${esc(s.jevUrl)}" placeholder="${esc(DEFAULT_SETTINGS.jevUrl)}" spellcheck="false" autocomplete="off">
        <small class="warp-dim">TypeSafe's Jev by default, or any URL with the same typed-question API.</small>
      </label>
      <label class="warp-field">Model
        <input class="warp-input" data-setting="jevModel" value="${esc(s.jevModel)}" placeholder="jev-latest" spellcheck="false" autocomplete="off">
      </label>
      <div class="warp-row"><button class="warp-btn" data-jev-openrouter>Jev on OpenRouter</button><span class="warp-dim">Sets the endpoint and model. Uses an OpenRouter key.</span></div>
    </details>` : ""}
    <div class="warp-row"><button class="warp-btn" data-test-decider>Test decision model</button></div>
  </div>`;
}
function renderSettings(s, status, connections, jevKeySet = false, templates = []) {
  const tags = new Set([...status?.tags ?? [], ...s.lines, ...s.veils]);
  const tagChips = [...tags].sort().map((t) => {
    const mode = s.lines.includes(t) ? "line" : s.veils.includes(t) ? "veil" : "on";
    return `<button class="warp-tag" data-tag="${esc(t)}" data-mode="${mode}" title="Tap to cycle: on → veil (off-screen) → line (removed)">${esc(t)}</button>`;
  }).join("");
  return `<div class="warp-card">
    <h3>Warp</h3>
    ${toggle("enabled", "Warp is on", "Turn the engine off without removing any rules.", s.enabled)}
    ${renderStyleSwitch(status, templates)}
    <label class="warp-field"><span>Helper connection</span>
      <select class="warp-select" data-setting="helperConnectionId" aria-label="Helper connection">
        <option value="">Same as the chat</option>
        ${connections.map((c) => `<option value="${esc(c.id)}"${c.id === s.helperConnectionId ? " selected" : ""}>${esc(c.name)}</option>`).join("")}
      </select>
      <small class="warp-dim">Reads each reply and writes the choices. A fast, cheap model works best.</small>
    </label>
  </div>
  ${renderDecider(s, jevKeySet)}
  <div class="warp-card">
    <h3>Play</h3>
    ${toggle("showChoices", "Show choices", "3 choices under each reply. Off: you just type, and none are written (that saves helper work).", s.showChoices)}
    ${toggle("showOdds", "Show odds", "The real chance of success on each choice.", s.showOdds)}
    ${boolSeg("swipesReroll", "Dice on a swipe", s.swipesReroll, "Casual", "Ironman", s.swipesReroll ? "Casual: a swipe rolls the dice again, for typed and clicked moves." : "Ironman: a swipe gives the same roll.")}
    ${toggle("showChanges", "Show what changed", "One line under each reply: time, place, people, feelings, items. The dice chip always shows.", s.showChanges)}
  </div>
  <div class="warp-card">
    <h3>Lines & Veils</h3>
    <p>Tap a tag to cycle it: <b>on</b> → <span class="warp-tone-warn">veil</span> (still happens, off-screen) → <span class="warp-tone-bad">line</span> (removed from the game).</p>
    <div class="warp-tags">${tagChips || `<span class="warp-empty">This ruleset doesn't tag any moves.</span>`}</div>
    <div class="warp-row"><input class="warp-input" data-newtag placeholder="Add a tag… (Enter)" style="flex:1" aria-label="Add a tag"></div>
  </div>`;
}

// src/frontend/render.ts
function renderJournal(h, records, editing = null) {
  if (!h)
    return `<div class="warp-card"><p>No game running in this chat.</p></div>`;
  const goals = `<div class="warp-card"><h3>Goals</h3>${h.goals.length ? ["open", "done", "failed"].map((st) => h.goals.filter((g) => g.status === st).map((g) => goalRow(g, { editing })).join("")).join("") : `<p>No goals yet. Promises, favours and plans from the story show up here.</p>`}</div>`;
  const turns = records.filter((r) => r.check || r.lines.length || r.changes.length).slice().reverse().slice(0, 40);
  const timeline = `<div class="warp-card"><h3>Timeline</h3>
    ${turns.length ? turns.map((r) => {
    const items = changeItems(r, false).map((i) => i.text);
    return `<button class="warp-timeline-row" data-jump="${esc(r.messageId)}" title="Jump to this message">
        <span class="warp-dim">${esc(r.clock ?? "")}</span>
        <span>${r.check ? `\uD83C\uDFB2 ${esc(r.check.label)} · <span class="warp-tone-${TIER_TONE[r.check.tier]}">${esc(r.check.tierLabel)}</span>` : r.action ? esc(r.action) : `<span class="warp-dim">Story</span>`}</span>
        ${items.length ? `<span class="warp-dim warp-timeline-changes">${esc(items.slice(0, 6).join(" · "))}${items.length > 6 ? ` · +${items.length - 6} more` : ""}</span>` : ""}
      </button>`;
  }).join("") : `<p>Nothing has happened yet.</p>`}
  </div>`;
  return goals + timeline;
}
function renderRulesetCard(s, hasChat) {
  if (!hasChat) {
    return `<div class="warp-card"><h3>Open a chat</h3><p>Warp runs inside a chat whose character has a <b>warp-ruleset</b> lorebook.</p></div>`;
  }
  if (s.state === "none") {
    return `<div class="warp-card">
      <h3>${esc(s.characterName ?? "This character")} has no game rules yet</h3>
      <p>Add rules to keep score: time and place, who is here and how they feel about you, and dice the narrator can't fudge. They're stored in a <b>warp-ruleset</b> lorebook on the character, so they travel with the card.</p>
      <div class="warp-row"><button class="warp-btn warp-btn-primary" data-install>Add rules…</button></div>
    </div>`;
  }
  const errors = s.issues.filter((i) => i.level === "error");
  const warns = s.issues.filter((i) => i.level === "warning");
  const style = s.style ? ` · ${s.style === "story" ? "Story (no dice)" : "Adventure (dice)"}` : "";
  const head = s.state === "ok" ? `<h3>✓ ${esc(s.name)}</h3><p>From ${esc(s.source)}${esc(style)}${warns.length ? ` · ${warns.length} note${warns.length > 1 ? "s" : ""}` : ""}</p>` : `<h3 class="warp-tone-bad">Ruleset can't run</h3><p>Fix the problems below in the <b>warp-ruleset</b> lorebook, then reload.</p>`;
  const list = [...errors, ...warns].slice(0, 30).map((i) => `
    <div class="warp-issue"><span class="warp-tone-${i.level === "error" ? "bad" : "warn"}">${i.level === "error" ? "✕" : "!"}</span><span>${esc(i.message)}</span><span class="warp-issue-where">${esc(i.where)}</span></div>`).join("");
  return `<div class="warp-card">${head}${list ? `<div class="warp-issues">${list}</div>` : ""}
    <div class="warp-row"><button class="warp-btn" data-reload>Reload</button><button class="warp-btn warp-btn-ghost" data-install>Replace with a template…</button></div>
  </div>`;
}
var STUDIO_URL = "https://github.com/japolino/warp-studio";
function renderWritingRules() {
  return `<div class="warp-card"><h3>Writing rules</h3><p>Rules live in entries titled <b>warp-ruleset · …</b> (or any lorebook named <b>warp-ruleset</b>). Each entry is YAML; entries merge together. Warp keeps them out of the prompt automatically.</p>
    <p class="warp-studio-line">Deep passes, checks, playtest and import/export: <a href="${STUDIO_URL}" target="_blank" rel="noopener">Warp Studio</a> (${STUDIO_URL})</p></div>`;
}
var STYLE_CARD = {
  story: { title: "\uD83D\uDCD6 Story (no dice)", blurb: "Time, place, who is here and how they feel about you, with slow-burn relationships. Nothing is rolled." },
  adventure: { title: "\uD83C\uDFB2 Adventure (dice)", blurb: "Everything in Story, plus dice at risky moments and contests (fights, chases, arguments) on one momentum gauge." }
};
function renderTemplatePicker(templates, card = null) {
  const track = card ? `<label class="warp-toggle"><span>Track <b>${esc(card.name)}</b> as a character</span><small>${card.track ? "Their relationship with you is tracked from the start." : "This looks like a scenario or narrator card, so its name isn't added as a person. Tick if it really is one character."}</small><input type="checkbox" data-track${card.track ? " checked" : ""}></label>` : "";
  const cards = ["story", "adventure"].map((st) => {
    const t = templateFor(st, templates);
    return `<button class="warp-card warp-template" data-template="${esc(t?.id ?? st)}" aria-pressed="false"><h3>${esc(STYLE_CARD[st].title)}</h3><p>${esc(STYLE_CARD[st].blurb)}</p></button>`;
  }).join("");
  return `<div class="warp-modal">
    <p style="margin:0;color:var(--warp-muted)">Pick how this chat plays. Warp adds a <b>warp-ruleset</b> lorebook to this character that you can edit like any lorebook. It's never sent to the model.</p>
    ${track}
    <div class="warp-template-pair">${cards}</div>
    <button class="warp-card warp-template" data-template="__ai"><h3>✨ Build with AI</h3><p>Reads this character's card and fits Story or Adventure to it: checked and previewed before anything is saved.</p></button>
    <p class="warp-dim" style="margin:0">Warp makes one small model call per turn to keep score and write the choices (a typed risky move without Jev needs a second one). It uses the chat's own model unless you pick a fast, cheap <b>Helper connection</b> in Settings.</p>
  </div>`;
}

// src/frontend/builder-ui.ts
function emptyDraft() {
  return { answers: {}, additions: [], notes: {}, refine: "", base: "", connectionId: "" };
}
var KINDS = ["skill", "meter", "item", "person", "action", "rule", "other"];
var REFINE_CHIPS = [
  "Make it harder",
  "Make it more forgiving",
  "Make relationships move slower",
  "Add a skill for something the card mentions"
];
function renderBuilderCta(hasRuleset, hasChat) {
  if (!hasChat)
    return "";
  return `<div class="warp-card warp-builder-cta">
    <h3>✨ Build with AI</h3>
    <p>Warp reads the card, picks Story or Adventure, asks you three questions, and fits that template to the card: checked and previewed before anything is saved.</p>
    <div class="warp-row">
      <button class="warp-btn warp-btn-primary" data-b="open-build">${hasRuleset ? "Rebuild with AI" : "Build with AI"}</button>
      ${hasRuleset ? `<button class="warp-btn" data-b="open-refine">Refine with AI</button>` : ""}
    </div>
  </div>`;
}
function steps(s) {
  const list = s.mode === "refine" ? ["Describe", "Review", "Install"] : ["Read", "Ask", "Draft & check", "Review", "Install"];
  const at = s.mode !== "build" ? s.step === "done" ? 2 : 1 : s.step === "start" ? 0 : s.step === "questions" ? s.busy ? 2 : 1 : s.step === "review" ? 3 : 4;
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
    <p>Skills, meters, items, people, actions or rules you want in, in your own words. They're fitted in where the format allows.</p>
    ${rows}
    <div class="warp-row"><button class="warp-btn" data-b="add-row">+ Add something</button></div>
  </div>`;
}
function renderBuilder(s, d, templates, connections, hasRuleset) {
  try {
    return builderHtml(s, d, templates, connections, hasRuleset);
  } catch (error) {
    console.error("[warp] Could not display the builder draft", error);
    return `<div class="warp-card"><h3>The draft couldn't be displayed</h3><p>Your saved draft is kept. Reload Warp to reopen it. You can still use the other tabs.</p></div>`;
  }
}
function builderHtml(s, d, _templates, connections, hasRuleset) {
  const busy = !!s.busy;
  const dis = busy ? " disabled" : "";
  const head = `<div class="warp-builder-head">
      <div><div class="warp-eyebrow"><span>✨ ${s.mode === "refine" ? "Refine" : "Build"} with AI</span></div><b>${esc(s.characterName)}</b></div>
      <button class="warp-btn warp-btn-ghost" data-b="close" title="Close the builder (discards the draft)" aria-label="Close">×</button>
    </div>${steps(s)}`;
  const status = busy ? `<div class="warp-card warp-busy-card"><div class="warp-status-line"><span class="warp-spinner"></span>${esc(s.busy)}</div><p>This can take a minute or two — you can keep chatting; the drawer updates as it works.</p></div>` : s.error ? `<div class="warp-card warp-error-card"><p class="warp-tone-bad">${esc(s.error)}</p></div>` : "";
  let body = "";
  if (s.step === "start") {
    const styles = [["", "Let Warp pick after reading the card"], ["story", "\uD83D\uDCD6 Story (no dice)"], ["adventure", "\uD83C\uDFB2 Adventure (dice)"]];
    body = `<div class="warp-card">
      <h3>How should it build?</h3>
      <label class="warp-field"><span>Template</span>
        <select class="warp-select" data-bset="base">
          ${styles.map(([v, label]) => `<option value="${v}"${d.base === v ? " selected" : ""}>${esc(label)}</option>`).join("")}
        </select></label>
      <label class="warp-field"><span>Model</span>
        <select class="warp-select" data-bset="connectionId">
          <option value="">Same as the chat</option>
          ${connections.map((c) => `<option value="${esc(c.id)}"${d.connectionId === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}
        </select></label>
      <p>It reads the card once, asks a few questions, then fits each part of the template to the card and fixes whatever Warp's checker reports. Nothing is saved until you install it at the end. For deeper passes, checks and playtests, use Warp Studio.</p>
      <div class="warp-row"><button class="warp-btn warp-btn-primary" data-b="start"${dis}>Read the card →</button></div>
    </div>`;
  } else if (s.step === "questions") {
    const a = s.analysis;
    const styleName = (id) => id === "story" ? "Story (no dice)" : id === "adventure" ? "Adventure (dice)" : id;
    const analysis = a ? `<div class="warp-card">
        <h3>What I read</h3>
        <p>${esc(a.summary)}</p>
        <p><b>Suggested:</b> ${esc(styleName(a.suggestedTemplate))}${a.reason ? ` — ${esc(a.reason)}` : ""}</p>
        ${a.cardType === "scenario" ? `<p>This reads as a <b>scenario card</b> — “${esc(s.characterName)}” is the setting, so it won't be tracked as a person.</p>` : ""}
        ${a.romance ? `<p>Romance is a main theme, so <b>attraction</b> is tracked next to affection and trust.</p>` : ""}
        ${a.cast?.length ? `<p><b>Cast</b> (tracked from the start, with these starting feelings):</p><ul class="warp-cast">${a.cast.map((c) => `<li><b>${esc(c.name)}</b> — ${esc(c.relation)}</li>`).join("")}</ul>` : ""}
        ${a.statusBlock?.found ? `<p class="warp-tone-warn">This card prints its own status block (${esc(a.statusBlock.fields.join(", ") || "stats")}). Warp tracks the story now and tells the narrator to stop printing it.</p>` : ""}
      </div>` : "";
    const rounds = s.rounds.map((r) => `<div class="warp-card">
        <h3>A few questions</h3>
        ${r.questions.map((q) => question(q, d.answers[q.id] ?? r.answers[q.id])).join("")}
      </div>`).join("");
    body = `${analysis}${rounds}${additions(d)}
      <div class="warp-row warp-builder-foot">
        <button class="warp-btn warp-btn-ghost" data-b="back"${dis}>← Back</button>
        <button class="warp-btn warp-btn-primary" data-b="build"${dis}>Build it →</button>
      </div>`;
  } else if (s.step === "review") {
    const p = s.preview;
    const errors = s.parts.filter((x) => x.status === "error").length;
    const summary = `<div class="warp-card">
        <h3>${s.mode !== "build" && s.changeSummary ? "What changed" : "The draft"}</h3>
        ${s.changeSummary ? `<p>${esc(s.changeSummary)}</p>` : ""}
        <p>${esc(p?.summary ?? "The draft doesn't run yet — see the sections marked in red.")}</p>
        ${errors ? `<p class="warp-tone-bad"><b>Must fix:</b> ${errors} section${errors === 1 ? "" : "s"} below ${errors === 1 ? "doesn't" : "don't"} match the format Warp reads (marked in red). They block installing — use Redo on ${errors === 1 ? "it" : "them"}.</p>` : ""}
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
        <button class="warp-btn warp-btn-primary" data-b="install" data-replacing="${hasRuleset ? 1 : 0}"${errors || busy ? " disabled" : ""} title="${errors ? "Fix or redo the sections marked in red first" : ""}">${s.mode === "build" ? "Install to lorebook" : "Save changes"}</button>
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

// src/frontend/cue-bridge.ts
var PROVIDER = "warp";
var MAX_CHOICES = 12;
function cueChoices(choices, showOdds) {
  return choices.filter((c) => !c.locked).slice(0, MAX_CHOICES).map((c) => ({
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
.gauge{position:relative;height:8px;border-radius:4px;background:linear-gradient(90deg,#5fc58a,#2b2a36 45%,#2b2a36 55%,#e06a6a)}
.mark{position:absolute;top:-3px;width:4px;height:14px;margin-left:-2px;border-radius:2px;background:#ecebf2}
`;
function renderCueCard(h) {
  const top = [
    h.clock ? `<b>${esc(h.clock.time)}</b> <span class="dim">${esc(h.date ?? h.clock.day)}</span>` : `<b>${esc(h.rulesetName)}</b>`,
    h.location ? `<span>\uD83D\uDCCD ${esc(h.location.name)}</span>` : "",
    h.money ? `<span>\uD83D\uDCB0 ${esc(h.money)}</span>` : ""
  ].filter(Boolean).join("");
  const bars = h.bars.map((b) => `<div class="bar"><span class="l">${esc(b.label)}</span><span class="v">${esc(b.text ?? b.display)}</span><div class="track"><div class="fill ${b.tone}" style="width:${Math.round(b.pct * 100)}%"></div></div></div>`).join("");
  const conds = h.conditions.map((c) => `<span class="chip t-${c.tone}">${esc(c.label)}${c.remaining ? ` · ${esc(c.remaining)}` : ""}</span>`).join("");
  const here = h.people.filter((p) => p.present).map((p) => {
    const feel = p.stats.filter((s) => s.text).map((s) => `<span class="t-${s.tone}">${esc(s.text)}</span>`).join(" · ");
    return `<div>${esc(p.name)}${feel ? ` <span class="dim">—</span> ${feel}` : ""}</div>`;
  }).join("");
  const c = h.conflict;
  const contest = c ? `<div class="sec">⚔ ${esc(c.label)} · ${esc(c.opponent)} · ${esc(roundText(c))}</div><div class="gauge"><div class="mark" style="left:${gaugeLeft(c.momentum).toFixed(1)}%"></div></div><div>${esc(c.words)}</div>` : "";
  return `<style>${CARD_CSS}</style><div class="w"><div class="top">${top}</div>${contest}${bars ? `<div class="bars">${bars}</div>` : ""}${conds ? `<div class="chips">${conds}</div>` : ""}${here ? `<div class="sec">Here</div><div class="ppl">${here}</div>` : ""}</div>`;
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

// src/frontend/public-events.ts
var WARP_STATE = "warp-state-v1";
var WARP_STATE_REQUEST = "warp-state-request-v1";
var some = (v) => v && v.trim() ? v : undefined;
function toWarpState(state, opts) {
  const name = state?.player ?? "";
  const h = opts.enabled ? state?.hud ?? null : null;
  if (!state || !h) {
    return { version: 1, provider: "warp", rulesetFormat: RULESET_FORMAT, chatId: state?.chatId ?? opts.chatId ?? null, messageId: null, you: { name }, people: [] };
  }
  const out = { version: 1, provider: "warp", rulesetFormat: RULESET_FORMAT, chatId: state.chatId, messageId: state.latestMessageId, you: { name }, people: [] };
  if (h.clock) {
    const m = Math.max(0, Math.round(h.clock.minutes));
    out.time = { label: h.clock.label, day: Math.floor(m / 1440) + 1, hour: Math.floor(m % 1440 / 60), minute: m % 60 };
  }
  out.place = h.location?.name ?? null;
  const appearance = some(h.you.appearance), outfit = some(h.you.outfit);
  out.you = { name, ...appearance ? { appearance } : {}, ...outfit ? { outfit } : {}, items: h.items.map((i) => i.name) };
  out.people = h.people.map((p) => {
    const a = some(p.appearance), o = some(p.outfit);
    const bands = {};
    for (const s of p.stats)
      bands[s.label] = s.text ?? s.display;
    return { id: p.id, name: p.name, present: p.present, ...a ? { appearance: a } : {}, ...o ? { outfit: o } : {}, bands };
  });
  out.meters = h.bars.map((b) => ({ id: b.id, label: b.label, band: b.text ?? b.display }));
  return out;
}
function connectPublicEvents(opts) {
  const target = opts.target ?? window;
  let last = null;
  let dead = false;
  const publish = (force = false) => {
    if (dead)
      return;
    const snap = opts.getState();
    const rev = revision(snap);
    if (!force && rev === last)
      return;
    last = rev;
    try {
      target.dispatchEvent(new CustomEvent(WARP_STATE, { detail: snap }));
    } catch {}
  };
  const onRequest = (e) => {
    const d = e.detail;
    if (d?.version === 1)
      publish(true);
  };
  target.addEventListener(WARP_STATE_REQUEST, onRequest);
  return {
    publish,
    destroy() {
      dead = true;
      target.removeEventListener(WARP_STATE_REQUEST, onRequest);
    }
  };
}

// src/frontend/roll-fx.ts
var rollKey = (r) => r.check ? `${r.messageId}:${r.swipe}:${r.check.total}:${r.check.tier}` : null;
function newRolls(prev, next) {
  if (!prev || prev.chatId !== next.chatId)
    return [];
  const seen = new Set(prev.records.map(rollKey).filter(Boolean));
  return next.records.filter((r) => r.check && !seen.has(rollKey(r)));
}
var ROLL_MS = 2600;
function playRoll(row, rec, reduced) {
  if (!rec.check)
    return;
  const tone = TIER_TONE[rec.check.tier] ?? "neutral";
  row.classList.add("warp-roll", `warp-roll-${tone}`);
  let stamp = null;
  if (!reduced) {
    row.querySelector(".warp-dice")?.classList.add("warp-roll-pop");
    stamp = document.createElement("span");
    stamp.className = `warp-roll-stamp warp-tone-${tone}`;
    stamp.setAttribute("aria-hidden", "true");
    stamp.textContent = `\uD83C\uDFB2 ${rec.check.tierLabel.toUpperCase()} · ${rec.check.label}`;
    row.appendChild(stamp);
  }
  setTimeout(() => {
    row.classList.remove("warp-roll", `warp-roll-${tone}`);
    row.querySelector(".warp-dice")?.classList.remove("warp-roll-pop");
    stamp?.remove();
  }, ROLL_MS);
}
function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// src/frontend/response-gate.ts
function acceptsResponse(message, activeChat, current) {
  if (message.type === "state")
    return message.chatId === activeChat && (current?.chatId !== message.chatId || (message.revision ?? 0) >= (current.revision ?? 0));
  if (message.type === "busy")
    return message.chatId === activeChat;
  if (message.type === "builder")
    return message.chatId === undefined || message.chatId === activeChat;
  return true;
}
var ACT_GUARD_MS = 4000;
function mayAct(pending, chatId, now) {
  return !pending || pending.chatId !== chatId || now - pending.at >= ACT_GUARD_MS;
}

// src/frontend/logo.ts
var SOFT = "M38.7,76.9C34.8,76.4 31.5,73.8 30.3,70.1C28.7,65.3 30.0,58.4 33.9,51.1C34.4,50.2 34.9,49.3 35.0,49.0C35.1,48.8 35.2,48.5 35.4,48.4C35.7,48.1 35.7,48.1 35.4,47.6L35.2,47.2 L35.4,46.3C35.9,44.4 36.8,42.2 37.6,40.5C38.4,39.0 38.2,38.9 36.2,40.0C29.4,43.8 25.8,46.7 25.2,49.3C24.8,50.7 25.5,51.8 27.1,52.6C27.9,53.0 27.9,53.2 27.4,53.2C26.2,53.3 24.0,52.5 23.1,51.7C20.9,49.7 22.7,46.7 28.0,43.3C30.3,41.9 34.2,39.8 37.5,38.4C39.1,37.6 39.3,37.5 39.7,36.8C40.2,35.8 42.5,32.5 43.7,31.0C46.0,28.2 49.3,24.9 52.1,22.7C58.3,17.9 64.6,15.8 67.9,17.4C70.6,18.7 71.6,22.7 70.8,28.5C69.9,35.0 67.8,41.7 64.8,47.7C64.3,48.7 64.3,49.2 64.6,49.5C64.8,49.7 64.8,49.7 65.4,49.7C66.1,49.7 66.3,49.6 66.7,49.2C66.8,49.1 67.1,48.9 67.2,48.8C67.5,48.6 69.5,46.8 71.8,44.7C76.4,40.3 78.6,36.7 78.1,34.2C77.9,33.1 77.2,32.2 76.0,31.2C75.5,30.9 75.2,30.6 75.2,30.5C75.2,30.4 75.9,30.6 76.6,30.8C78.1,31.4 79.5,32.5 80.0,33.6C81.7,36.9 78.8,40.7 69.1,48.0C68.5,48.4 67.9,48.9 67.7,49.1C67.4,49.4 67.2,49.6 66.9,49.7C66.6,49.8 66.6,49.9 66.4,50.2C66.3,50.4 66.1,50.8 65.9,51.0C65.5,51.4 65.5,51.4 65.7,51.6C65.8,51.6 66.0,51.8 66.1,51.9C66.4,52.4 66.9,52.8 67.7,52.9C68.4,53.1 68.8,53.4 68.8,53.7C68.8,54.0 68.3,55.6 67.9,56.4C66.7,59.2 63.9,62.0 58.8,65.3C58.0,65.9 57.1,66.5 57.0,66.7C55.0,68.9 52.3,71.4 50.1,73.0C46.2,75.9 41.9,77.3 38.7,76.9ZM50.0,66.0C50.7,65.8 52.9,63.8 54.3,62.2C56.7,59.5 57.9,57.6 59.1,54.5C61.5,48.3 62.1,40.6 60.6,34.4C59.6,30.2 57.7,27.4 55.3,26.9C52.3,26.2 47.9,28.3 43.6,32.5C42.3,33.8 42.3,34.0 43.4,34.4C43.7,34.5 44.1,34.7 44.3,34.8L44.7,35.0 L45.0,34.8C45.2,34.7 45.5,34.6 45.7,34.6C46.4,34.6 47.1,34.4 49.3,33.7C51.0,33.1 51.7,32.9 52.2,32.9C53.0,32.8 53.0,32.8 53.0,33.2C53.0,33.6 52.9,33.8 51.9,34.9C43.8,43.9 40.8,55.0 44.5,62.4C45.4,64.2 46.7,65.6 47.8,66.0C48.1,66.2 49.6,66.1 50.0,66.0Z";
var LIT = "M38.3,76.8C35.7,76.3 33.4,75.0 31.9,72.9C29.3,69.5 29.0,64.5 31.0,58.0C32.0,54.8 34.1,50.5 35.8,48.1C36.1,47.6 36.1,47.6 37.1,47.8C38.1,48.0 38.1,48.1 37.6,49.4C37.2,50.4 36.3,53.2 35.9,54.6C34.1,62.2 34.9,68.0 38.4,71.5C40.3,73.4 42.5,74.4 45.4,74.6C46.4,74.7 46.6,74.7 46.6,74.9C46.6,75.3 44.2,76.3 42.3,76.7C41.2,76.9 39.2,77.0 38.3,76.8ZM48.7,70.1C48.7,70.1 48.8,69.9 49.0,69.7C49.3,69.3 49.3,69.3 49.0,68.7C48.6,67.9 47.4,67.0 46.7,66.8C46.2,66.6 45.9,66.4 45.9,66.2C45.9,66.0 45.9,66.0 46.9,66.1C49.4,66.3 51.5,66.0 54.5,65.0C58.9,63.5 63.1,60.9 66.5,57.7C67.4,56.8 67.6,56.9 67.1,57.8C65.8,60.4 60.7,64.5 54.9,67.6C51.9,69.2 48.7,70.5 48.7,70.1ZM59.4,55.2C59.3,55.0 59.3,54.8 59.8,53.8C64.0,44.9 66.6,31.7 65.2,26.0C64.7,23.5 63.4,21.9 61.5,21.3C60.6,21.0 58.8,20.9 57.6,21.2C56.4,21.4 55.0,21.9 53.5,22.6C51.8,23.5 51.5,23.5 52.3,22.8C53.9,21.2 57.9,18.9 60.6,17.9C68.8,14.9 72.2,18.7 70.6,29.2C69.3,38.3 65.6,47.7 60.8,54.1C59.8,55.4 59.5,55.6 59.4,55.2ZM67.7,48.6C67.8,48.5 68.5,47.8 69.3,47.1C74.4,42.4 76.1,40.5 77.4,37.9C77.6,37.5 78.0,37.0 78.1,36.8C78.4,36.4 78.5,36.4 78.9,36.4C79.3,36.4 79.5,36.3 79.8,36.2C80.4,35.9 80.4,36.4 79.8,37.7C79.0,39.4 77.4,41.1 74.6,43.6C72.4,45.4 68.0,48.8 67.7,48.8C67.7,48.8 67.7,48.7 67.7,48.6ZM24.6,47.8C23.7,47.3 23.7,47.3 23.7,47.0C23.7,46.2 27.2,43.7 31.2,41.5C35.5,39.2 43.1,35.8 44.7,35.6L45.0,35.5 L44.8,35.7C44.7,35.8 43.9,36.2 43.0,36.6C33.5,41.1 28.3,44.4 26.0,47.5C25.4,48.2 25.4,48.2 24.6,47.8ZM62.4,37.9C62.4,37.8 62.2,37.1 62.2,36.3C62.1,35.6 61.9,34.5 61.8,34.0C61.5,32.6 61.5,32.1 61.6,32.1C61.9,32.1 62.4,32.7 62.7,33.2C62.9,33.5 63.0,33.8 63.1,33.9C63.6,34.5 63.7,35.5 63.4,36.4C63.3,36.6 63.2,37.0 63.2,37.2C62.9,37.9 62.6,38.3 62.4,37.9Z";
var STARS = "M58.9,71.7C58.5,71.3 58.7,70.5 59.3,70.5C59.6,70.5 60.0,70.9 60.0,71.2C60.0,71.6 59.6,72.0 59.3,72.0C59.2,72.0 59.0,71.9 58.9,71.7ZM64.2,69.5C63.9,68.8 63.7,68.5 63.2,68.2C62.8,67.9 62.8,67.7 63.2,67.4C63.7,67.0 63.9,66.8 64.2,66.2C64.6,65.4 64.7,65.4 65.1,66.3C65.4,66.9 65.5,67.0 65.9,67.3C66.2,67.5 66.4,67.7 66.4,67.8C66.4,67.8 66.2,68.1 65.9,68.3C65.5,68.6 65.4,68.8 65.1,69.4C64.7,70.2 64.6,70.3 64.2,69.5ZM27.0,60.3C27.0,60.2 26.8,60.0 26.7,59.8C26.6,59.6 26.4,59.4 26.3,59.3C26.0,59.0 26.0,58.8 26.3,58.4C26.4,58.3 26.7,58.0 26.8,57.8C27.1,57.3 27.3,57.3 27.6,57.8C27.7,58.0 28.0,58.3 28.1,58.4C28.4,58.8 28.4,59.0 28.1,59.3C28.0,59.4 27.8,59.6 27.6,59.8C27.4,60.2 27.3,60.4 27.1,60.4C27.1,60.4 27.1,60.4 27.0,60.3ZM48.6,59.8C48.5,59.6 48.4,59.5 48.4,59.4C48.4,59.3 48.5,59.1 48.6,59.0C48.7,58.8 48.9,58.7 49.0,58.7C49.1,58.7 49.3,58.8 49.4,59.0C49.5,59.1 49.6,59.3 49.6,59.4C49.6,59.5 49.5,59.6 49.4,59.8C49.3,59.9 49.1,60.0 49.0,60.0C48.9,60.0 48.7,59.9 48.6,59.8ZM69.8,58.2C69.6,57.9 69.6,57.6 69.9,57.4C70.2,57.1 70.7,57.2 70.8,57.7C70.9,58.3 70.2,58.6 69.8,58.2ZM52.8,54.7C52.8,54.6 52.7,54.3 52.7,53.9C52.5,52.5 52.1,51.7 51.4,50.9C50.8,50.3 50.5,50.1 49.5,49.9C48.6,49.6 48.5,49.6 49.4,49.4C51.2,49.0 52.4,47.6 52.8,45.4C52.9,44.9 53.0,44.6 53.1,44.6C53.2,44.6 53.2,44.6 53.4,45.8C53.6,47.1 54.1,48.1 54.9,48.7C55.4,49.0 56.3,49.4 56.6,49.4C56.7,49.4 56.8,49.4 56.9,49.5C57.1,49.6 57.0,49.7 56.4,49.9C54.5,50.3 53.7,51.4 53.1,54.3C53.1,54.7 52.9,54.9 52.8,54.7ZM73.4,53.4C73.1,52.9 72.9,52.7 72.7,52.5C72.4,52.3 72.4,52.1 72.8,51.7C72.9,51.6 73.2,51.3 73.3,51.1C73.5,50.6 73.7,50.6 74.0,51.1C74.1,51.3 74.3,51.6 74.5,51.8C74.9,52.2 74.9,52.2 74.5,52.6C74.3,52.8 74.1,53.1 74.0,53.3C73.8,53.7 73.5,53.7 73.4,53.4ZM31.7,47.2C31.2,46.8 31.7,45.9 32.3,46.1C32.8,46.3 32.9,46.8 32.6,47.2C32.3,47.4 32.0,47.5 31.7,47.2ZM72.0,37.4C71.4,37.1 71.2,36.4 71.5,35.8C72.1,34.8 73.5,35.1 73.6,36.3C73.7,37.2 72.8,37.8 72.0,37.4ZM33.9,37.2C33.6,36.9 33.7,36.4 34.1,36.2C34.7,36.0 35.2,36.8 34.7,37.2C34.5,37.5 34.2,37.5 33.9,37.2ZM36.2,31.9C36.2,31.8 36.0,31.6 36.0,31.3C35.9,31.1 35.7,30.8 35.3,30.4C34.6,29.7 34.6,29.7 35.1,29.3C35.5,29.0 35.6,28.8 35.9,28.2C36.4,27.3 36.4,27.3 36.9,28.2C37.2,28.8 37.3,29.0 37.7,29.3C37.9,29.5 38.2,29.7 38.2,29.7C38.2,29.8 37.9,30.0 37.6,30.4C37.1,30.8 36.9,31.0 36.8,31.3C36.7,31.7 36.5,32.0 36.4,32.0C36.4,32.0 36.3,31.9 36.2,31.9ZM42.6,24.0C42.5,23.9 42.3,23.6 42.3,23.3C42.3,23.2 42.7,22.8 42.9,22.8C43.2,22.8 43.6,23.2 43.6,23.4C43.6,23.8 43.0,24.1 42.6,24.0Z";
function logoSvg(opts = {}) {
  const size = opts.size ? ` width="${opts.size}" height="${opts.size}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="19.5 15.1 63.6 63.6"${size} fill="${opts.color ?? "currentColor"}" fill-rule="evenodd" aria-hidden="true"><path opacity="${opts.soft ?? 0.5}" d="${SOFT}"/><path d="${LIT}"/><path d="${STARS}"/></svg>`;
}

// src/frontend.ts
var CLEANUP_KEY = "__warpCleanup";
var ICON = logoSvg({ size: 20 });
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
  let editing = null;
  let drafts = {};
  let pendingAct = null;
  let drawerView = "sheet";
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
    description: "Scene, people, dice, goals and game settings",
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
  const dockRoot = overlayEl.children[1];
  dockRoot.addEventListener("pointerdown", (e) => {
    if (!e.target.closest?.("input, select, textarea"))
      e.preventDefault();
  });
  let cur = { x: 0, y: 72, w: PILL.w, h: PILL.h };
  try {
    const vp = viewport();
    const start = edge ? attachedBox(edge, overlayOpen, vp) : floatingBox(vp, overlayOpen, 420);
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
    requestAnimationFrame(() => resizeFloating(panelWidth(viewport()), Math.min(maxH, PILL.h + dockRoot.scrollHeight + 2)));
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
      const w = overlayOpen ? panelWidth(viewport()) : PILL.w;
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
    const fight = h?.conflict ? `<span class="warp-tone-bad" title="${esc(`${h.conflict.label} with ${h.conflict.opponent}`)}">⚔</span> ` : "";
    const worst = h?.bars.find((b) => b.tone === "bad") ?? h?.bars.find((b) => b.tone === "warn");
    const dot = `<span class="warp-dot warp-bg-${worst?.tone ?? "good"}" title="${esc(worst ? `${worst.label}: ${worst.text ?? worst.display}` : "All good")}"></span>`;
    const where = overlayOpen && h?.location ? ` <span class="warp-dim">· ${esc(h.location.name)}</span>` : "";
    headEl.innerHTML = `
      <span class="warp-overlay-title">${fight}\uD83C\uDFB2 ${clock ? `<b>${esc(clock)}</b>` : "Warp"}${where}</span>
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
      place(floatingBox(vp, true, Math.min(420, cur.h)));
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
  function paint(root, html) {
    rememberSections(root);
    const kept = root.scrollTop;
    const focused = document.activeElement instanceof HTMLInputElement && root.contains(document.activeElement) ? document.activeElement.dataset.fixInput ?? null : null;
    root.innerHTML = html;
    restoreSections(root);
    root.scrollTop = kept;
    if (focused)
      root.querySelector(`[data-fix-input="${CSS.escape(focused)}"]`)?.focus();
    flashChangedBars(root);
  }
  const hudOpts = (compact) => ({ editing, compact, drafts, sceneHint: state?.sceneHint ?? null });
  function renderDock() {
    if (!overlay)
      return;
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
  function historyNotice() {
    return state?.historyConflict ? `<div class="warp-card"><h3>History changed</h3><p>Earlier messages or rules changed. Later results are paused. Keep their recorded outcomes, or discard those results and replay from the changed turn. Your chat text stays in place.</p><button class="warp-btn" data-history="keep">Keep recorded outcomes</button> <button class="warp-btn" data-history="discard">Discard affected results</button></div>` : "";
  }
  const reconcileClick = (e) => {
    const button = e.target.closest("[data-history]");
    const id = chatId();
    if (button && id)
      send({ type: "reconcile_history", chatId: id, keep: button.dataset.history === "keep" });
  };
  dockRoot.addEventListener("click", reconcileClick);
  drawerRoot.addEventListener("click", reconcileClick);
  cleanups.push(() => dockRoot.removeEventListener("click", reconcileClick));
  cleanups.push(() => drawerRoot.removeEventListener("click", reconcileClick));
  function renderDrawer() {
    const hasChat = !!state?.chatId;
    const status = state?.status ?? { state: "none", name: null, source: null, issues: [], characterName: null, cardKind: "character", tags: [] };
    const views = [
      ["sheet", "Sheet"],
      ...state?.hud ? [["journal", "Journal"]] : [],
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
      body = state?.hud ? renderHud(state.hud, hudOpts(false)) : renderRulesetCard(status, hasChat);
    } else if (drawerView === "journal") {
      body = renderJournal(state?.hud ?? null, state?.records ?? [], editing);
    } else if (drawerView === "rules" && builder) {
      body = renderBuilder(builder, bDraft, templates, connections, status.state !== "none");
    } else if (drawerView === "rules") {
      body = renderBuilderCta(status.state !== "none", hasChat) + renderRulesetCard(status, hasChat) + (hasChat ? `<div class="warp-card">${renderStyleSwitch(status, templates)}</div>` : "") + renderWritingRules();
    } else {
      body = renderSettings(settings, state?.status ?? null, connections, jevKeySet, templates);
    }
    paint(drawerRoot, tabs + historyNotice() + body);
    tab.setBadge(status.issues.some((i) => i.level === "error") ? "!" : null);
  }
  let choicesEl = null;
  let choicesFor = null;
  let choicesHtml = "";
  const chipEls = new Map;
  const wantChips = new Map;
  function messageSlot(messageId) {
    const row = ctx.dom.findMessageElement(messageId);
    if (!row)
      return null;
    const card = row.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
    return card ? { target: card, position: "afterend" } : { target: row, position: "beforeend" };
  }
  function healPlacement() {
    const fix = (el, id) => {
      if (!el?.isConnected || !id)
        return;
      const slot = messageSlot(id);
      if (slot?.position === "afterend" && slot.target.contains(el))
        slot.target.after(el);
    };
    for (const [id, { el }] of chipEls)
      fix(el, id);
    fix(choicesEl, choicesFor);
    const chips = choicesFor ? chipEls.get(choicesFor)?.el : null;
    if (chips?.isConnected && choicesEl?.isConnected && chips.parentElement === choicesEl.parentElement && chips.nextElementSibling !== choicesEl)
      chips.after(choicesEl);
  }
  function injectChips(messageId, html) {
    const slot = messageSlot(messageId);
    if (!slot)
      return false;
    const el = ctx.dom.inject(slot.target, `<div class="warp-chips" data-warp-chips="${messageId}">${html}</div>`, slot.position);
    chipEls.set(messageId, { el, html });
    return true;
  }
  function placeChoices(force = false) {
    const anchor = state?.choicesAnchor ?? null;
    const isBusy = busy.on && busy.chatId === state?.chatId;
    const html = settings.enabled && settings.showChoices && state?.hud && anchor ? renderChoices(state.choices, { showOdds: settings.showOdds, hotkeys: settings.hotkeys, busy: isBusy, busyLabel: busy.label || undefined, conflict: state.hud.conflict }) : "";
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
    const slot = messageSlot(anchor);
    if (!slot)
      return;
    choicesEl = ctx.dom.inject(slot.target, `<div class="warp-choices">${html}</div>`, slot.position);
    healPlacement();
  }
  function reconcileMessages() {
    const records = state?.records ?? [];
    wantChips.clear();
    if (settings.enabled) {
      for (const r of records) {
        const html = renderReply(r, { showChanges: settings.showChanges, latest: r.messageId === state?.latestMessageId });
        if (html)
          wantChips.set(r.messageId, html);
      }
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
    healPlacement();
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
  const publicEvents = connectPublicEvents({ getState: () => toWarpState(state, { enabled: settings.enabled, chatId: chatId() }) });
  cleanups.push(() => publicEvents.destroy());
  function renderAll() {
    renderDock();
    renderDrawer();
    reconcileMessages();
    syncDockVisibility();
    syncCue();
    publicEvents.publish();
    if (state?.hud)
      lastBars = new Map(state.hud.bars.map((b) => [b.id, b.value]));
  }
  function playRolls(recs) {
    if (!recs.length)
      return;
    const reduced = prefersReducedMotion();
    requestAnimationFrame(() => {
      for (const r of recs) {
        const sel = `.warp-chips[data-warp-chips="${CSS.escape(r.messageId)}"]`;
        const el = chipEls.get(r.messageId)?.el;
        const row = ctx.dom.findMessageElement(r.messageId)?.querySelector(sel) ?? (el instanceof HTMLElement ? el.matches(sel) ? el : el.querySelector(sel) : null);
        if (row?.isConnected)
          playRoll(row, r, reduced);
      }
    });
  }
  function openPicker() {
    const id = chatId();
    if (!id)
      return;
    const modal = ctx.ui.showModal({ title: "Add Warp rules", width: 560, maxHeight: 680 });
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
      title: "Replace this ruleset?",
      message: "The new rules replace the ones Warp runs now. The current warp-ruleset lorebook stays on the character as a backup; delete it if you don't need it.",
      confirmLabel: "Choose Story or Adventure",
      variant: "warning"
    });
    if (res.confirmed)
      openPicker();
  }
  async function chooseStyle(btn) {
    const cid = chatId();
    const templateId = btn.dataset.template;
    if (!cid || !templateId)
      return;
    if (btn.dataset.styleMode === "switch") {
      const story = btn.dataset.style === "story";
      const res = await ctx.ui.showConfirm({
        title: story ? "Switch to Story (no dice)?" : "Switch to Adventure (dice)?",
        message: "The template's rules are replaced. Your people entries are kept, and the game state recorded in chats stays.",
        confirmLabel: "Switch",
        variant: "warning"
      });
      if (!res.confirmed)
        return;
      send({ type: "install_template", chatId: cid, templateId, replace: true });
    } else {
      send({ type: "install_template", chatId: cid, templateId, ...state?.status.characterName ? { trackCharacter: state.status.cardKind !== "scenario" } : {} });
    }
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
        send({ type: "builder_start", chatId: cid, connectionId: bDraft.connectionId, base: bDraft.base || undefined });
        break;
      case "build":
        send({ type: "builder_answer", chatId: cid, answers: builderAnswers(), additions: bDraft.additions });
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
  function toggleEdit(key) {
    editing = editing === key ? null : key;
    drafts = {};
    renderDock();
    renderDrawer();
  }
  function fixValue(row, field) {
    const input = (k) => row.querySelector(`[data-fix-input="${CSS.escape(k)}"]`);
    if (field === "time") {
      const day = Number(input("time:day")?.value);
      const time = input("time")?.value ?? "";
      if (!/^\d{1,2}:\d{2}$/.test(time))
        return;
      return Number.isFinite(day) && day >= 1 ? `Day ${Math.floor(day)} ${time}` : time;
    }
    const el = row.querySelector("[data-fix-input]");
    if (!el)
      return;
    if (field === "item" || field === "money") {
      const n = Number(el.value);
      return el.value.trim() !== "" && Number.isFinite(n) ? n : undefined;
    }
    const text = el.value.replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 160) : null;
  }
  function sendFix(field, who, value) {
    const cid = chatId();
    if (!cid)
      return;
    send({ type: "fix", chatId: cid, field, ...who ? { who } : {}, value });
    editing = null;
    drafts = {};
    renderDock();
    renderDrawer();
  }
  function onFixSet(btn) {
    const row = btn.closest("[data-fix-row]");
    const field = btn.dataset.fix;
    if (!row || !field)
      return;
    const value = fixValue(row, field);
    if (value === undefined) {
      row.querySelector("[data-fix-input]")?.focus();
      return;
    }
    sendFix(field, btn.dataset.who, value);
  }
  function armed(btn, label) {
    if (btn.dataset.armed)
      return true;
    const was = btn.textContent ?? "";
    btn.dataset.armed = "1";
    btn.textContent = label;
    btn.classList.add("warp-btn-danger");
    setTimeout(() => {
      if (btn.isConnected) {
        delete btn.dataset.armed;
        btn.textContent = was;
        btn.classList.remove("warp-btn-danger");
      }
    }, 4000);
    return false;
  }
  function onPanelClick(e) {
    const t = e.target;
    if (t.closest("[data-jev-openrouter]")) {
      send({ type: "settings", patch: { ...OPENROUTER_JEV } });
      return;
    }
    const view = t.closest("[data-view]");
    if (view) {
      drawerView = view.dataset.view;
      renderDrawer();
      return;
    }
    if (onBuilderClick(t))
      return;
    const jump = t.closest("[data-jump]");
    if (jump) {
      const el = ctx.dom.findMessageElement(jump.dataset.jump);
      if (el)
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      else
        jump.setAttribute("title", "That message isn't loaded — scroll up in the chat to find it.");
      return;
    }
    const cid = chatId();
    const contest = t.closest("[data-contest]");
    if (contest) {
      const op = contest.dataset.contest === "give_in" ? "give_in" : "break_off";
      if (op === "give_in" && !armed(contest, "Really give in?"))
        return;
      if (cid)
        send({ type: "contest", chatId: cid, op });
      return;
    }
    const use = t.closest("[data-use]");
    if (use) {
      if (!use.disabled)
        act(use.dataset.use);
      return;
    }
    if (t.closest("[data-install]")) {
      confirmReplace();
      return;
    }
    if (t.closest("[data-reload]")) {
      send({ type: "reload", chatId: cid });
      return;
    }
    const style = t.closest("[data-style-mode]");
    if (style) {
      chooseStyle(style);
      return;
    }
    const seg = t.closest("[data-setting-bool]");
    if (seg) {
      send({ type: "settings", patch: { [seg.dataset.settingBool]: seg.dataset.v === "1" } });
      return;
    }
    const fix = t.closest("[data-fix]");
    if (fix) {
      onFixSet(fix);
      return;
    }
    const present = t.closest("[data-fix-present]");
    if (present) {
      sendFix("present", present.dataset.fixPresent, present.dataset.value === "true");
      return;
    }
    const goal = t.closest("[data-fix-goal]");
    if (goal) {
      sendFix("goal", goal.dataset.fixGoal, goal.dataset.value ?? "done");
      return;
    }
    const saveBar = t.closest("[data-save-bar]");
    if (saveBar) {
      const v = Number(saveBar.parentElement?.querySelector("[data-num]")?.value);
      if (cid && Number.isFinite(v))
        send({ type: "adjust", chatId: cid, stat: saveBar.dataset.saveBar, value: v });
      editing = null;
      return;
    }
    const saveSkill = t.closest("[data-save-skill]");
    if (saveSkill) {
      const v = Number(saveSkill.parentElement?.querySelector("[data-num]")?.value);
      if (cid && Number.isFinite(v))
        send({ type: "adjust", chatId: cid, stat: saveSkill.dataset.saveSkill, value: v });
      editing = null;
      return;
    }
    const saveRel = t.closest("[data-save-rel]");
    if (saveRel) {
      const [who, stat] = saveRel.dataset.saveRel.split(":");
      const v = Number(saveRel.parentElement?.querySelector("[data-num]")?.value);
      if (cid && Number.isFinite(v))
        send({ type: "adjust_rel", chatId: cid, who, stat, value: v });
      editing = null;
      return;
    }
    const editBtn = t.closest("button[data-edit]");
    if (editBtn) {
      toggleEdit(editBtn.dataset.edit);
      return;
    }
    if (t.closest(".warp-bar-edit, .warp-fix"))
      return;
    const edit = t.closest("[data-edit]");
    if (edit) {
      toggleEdit(edit.dataset.edit);
      return;
    }
    const forget = t.closest("[data-forget]");
    if (forget) {
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
  function onPanelInput(e) {
    const t = e.target;
    if (onBuilderInput(t))
      return;
    if (t.dataset.fixInput) {
      drafts[t.dataset.fixInput] = t.value;
      return;
    }
    if (t.dataset.range !== undefined) {
      const num = t.parentElement?.querySelector("[data-num]");
      if (num)
        num.value = t.value;
    } else if (t.dataset.num !== undefined) {
      const range = t.parentElement?.querySelector("[data-range]");
      if (range)
        range.value = t.value;
    }
  }
  function onPanelChange(e) {
    const t = e.target;
    if (onBuilderInput(t))
      return;
    if (t.dataset.fixInput !== undefined)
      return;
    const key = t.dataset.setting;
    if (!key)
      return;
    const value = t instanceof HTMLInputElement && t.type === "checkbox" ? t.checked : t.value;
    send({ type: "settings", patch: { [key]: value } });
  }
  function onPanelKey(e) {
    const t = e.target;
    if (t.dataset?.fixInput !== undefined) {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        const set = t.closest("[data-fix-row]")?.querySelector("[data-fix]");
        if (set)
          onFixSet(set);
      } else if (e.key === "Escape") {
        e.preventDefault();
        toggleEdit(editing ?? "");
      }
      return;
    }
    if (e.key === "Enter" && t.dataset.newtag !== undefined && t.value.trim()) {
      send({ type: "settings", patch: { veils: [...settings.veils, t.value.trim().toLowerCase()] } });
      t.value = "";
    }
  }
  function wirePanel(root) {
    root.addEventListener("click", onPanelClick);
    root.addEventListener("input", onPanelInput);
    root.addEventListener("change", onPanelChange);
    root.addEventListener("keydown", onPanelKey);
    root.addEventListener("toggle", () => rememberSections(root), true);
  }
  for (const root of [drawerRoot, dockRoot])
    wirePanel(root);
  function act(actionId, params) {
    const cid = chatId();
    if (!cid)
      return;
    if (!mayAct(pendingAct, cid, Date.now()))
      return;
    pendingAct = { chatId: cid, at: Date.now() };
    send({ type: "act", chatId: cid, actionId, ...params ? { params } : {} });
  }
  async function confirmRedo(btn) {
    const cid = chatId();
    const userMessageId = btn.dataset.redo;
    if (!cid || !userMessageId)
      return;
    const res = await ctx.ui.showConfirm({
      title: "Redo without a roll?",
      message: "The reply to your message is replaced with a new one, treating your message as plain roleplay (no check).",
      confirmLabel: "Redo turn",
      variant: "info"
    });
    if (!res.confirmed)
      return;
    send({ type: "redo", chatId: cid, userMessageId, actionId: null });
  }
  const onDocClick = (e) => {
    const t = e.target;
    if (!t?.closest)
      return;
    const choice = t.closest(".warp-choices [data-act]");
    if (choice) {
      e.preventDefault();
      if (choice.disabled)
        return;
      choice.classList.add("warp-choice-picked");
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
    const more = t.closest(".warp-chips [data-more]");
    if (more) {
      more.closest(".warp-whatchanged")?.setAttribute("data-more-open", "");
      return;
    }
    const redo = t.closest(".warp-chips [data-redo]");
    if (redo) {
      e.preventDefault();
      confirmRedo(redo);
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
    if (!/^[1-9]$/.test(e.key) || !state?.choices.length || !choicesEl?.isConnected)
      return;
    const c = choiceOrder(state.choices)[Number(e.key) - 1];
    if (!c || c.locked)
      return;
    e.preventDefault();
    act(c.id);
  };
  document.addEventListener("keydown", onKey);
  cleanups.push(() => document.removeEventListener("keydown", onKey));
  cleanups.push(ctx.onBackendMessage((raw) => {
    const m = raw;
    if (!acceptsResponse(m, chatId(), state))
      return;
    switch (m.type) {
      case "state": {
        const rolls = newRolls(state, m);
        if (state?.chatId !== m.chatId) {
          editing = null;
          drafts = {};
          lastBars = new Map;
        }
        if (state?.latestMessageId !== m.latestMessageId || state?.choicesAnchor !== m.choicesAnchor)
          pendingAct = null;
        state = m;
        if (m.chatId)
          busy = m.busy ? { chatId: m.chatId, on: true, label: busy.chatId === m.chatId ? busy.label : "" } : { chatId: "", on: false, label: "" };
        renderAll();
        playRolls(rolls);
        break;
      }
      case "busy":
        busy = { chatId: m.chatId, on: m.busy, label: m.busy ? m.label ?? busy.label ?? "" : "" };
        if (m.busy)
          pendingAct = null;
        placeChoices(true);
        syncCue();
        break;
      case "builder": {
        const prev = builder;
        builder = m.session;
        if (!builder || !prev || prev.characterId !== builder.characterId || prev.mode !== builder.mode || prev.step !== builder.step && builder.step === "start") {
          const keep = { connectionId: bDraft.connectionId };
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
      state = null;
      builder = null;
      busy = { chatId: "", on: false, label: "" };
      pendingAct = null;
      editing = null;
      drafts = {};
      renderAll();
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
