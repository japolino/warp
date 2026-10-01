// The arcade's look: one cabinet for every game — a dark stage lit in the game's own
// colours, the bar to beat standing beside it — and a briefing card in front.

export const ARCADE_STYLES = `
.warp-ar {
  --ar-bg: #0d0b16; --ar-bg2: #1b1530; --ar-ac: #ff5fa2; --ar-ac2: #7c5cff;
  --ar-ink: #f6f2ea; --ar-muted: #b8b1c4; --ar-dim: #857e93;
  --ar-line: rgba(255, 255, 255, .1);
  --ar-panel: rgba(9, 8, 14, .74);
  --ar-good: #4fe0a4; --ar-warn: #ffc24a; --ar-bad: #ff5d6c; --ar-crit: #ffe066;
  --ar-display: "Bahnschrift", "DIN Alternate", "Arial Narrow", "Roboto Condensed", "Segoe UI", system-ui, sans-serif;
  --ar-ui: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif;
  --ar-num: ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace;
  position: absolute; inset: 0; overflow: hidden; outline: none;
  display: grid; grid-template-rows: auto minmax(0, 1fr);
  background: radial-gradient(ellipse 120% 90% at 50% 0%, var(--ar-bg2), var(--ar-bg) 70%);
  color: var(--ar-ink); font-family: var(--ar-ui); font-size: 14px; line-height: 1.45;
  user-select: none; -webkit-user-select: none; touch-action: none;
  animation: warp-ar-in 320ms cubic-bezier(.2, .8, .2, 1) both;
}
@keyframes warp-ar-in { from { opacity: 0; transform: scale(1.015); } }
.warp-ar *, .warp-ar *::before, .warp-ar *::after { box-sizing: border-box; }
.warp-ar button { font: inherit; color: inherit; cursor: pointer; }
.warp-ar button:disabled { cursor: not-allowed; opacity: .45; }
.warp-ar kbd { font-family: var(--ar-num); font-size: 10.5px; padding: 1px 6px; border-radius: 5px; border: 1px solid currentColor; opacity: .55; margin-left: 6px; }
.warp-ar-bg { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
.warp-ar-bg::before { content: ""; position: absolute; inset: -40%;
  background:
    radial-gradient(circle at 30% 40%, color-mix(in srgb, var(--ar-ac) 22%, transparent), transparent 32%),
    radial-gradient(circle at 70% 60%, color-mix(in srgb, var(--ar-ac2) 22%, transparent), transparent 34%);
  animation: warp-ar-drift 18s ease-in-out infinite alternate; filter: blur(10px); }
.warp-ar-bg::after { content: ""; position: absolute; inset: 0;
  background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
  background-size: 44px 44px; mask-image: radial-gradient(ellipse at center, #000 30%, transparent 75%); }
@keyframes warp-ar-drift { to { transform: translate(6%, -4%) rotate(8deg); } }
.warp-ar-kicker { font-size: 11px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--ar-muted); }
.warp-ar-label { margin: 16px 0 8px; font-size: 10.5px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--ar-muted); }
.warp-ar-dim { color: var(--ar-dim); font-size: 12.5px; }
.warp-ar-dim.small { font-size: 11.5px; margin-top: 6px; }

/* ── buttons ── */
.warp-ar-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 10px 22px; border-radius: 12px; border: 1px solid var(--ar-line); background: rgba(255,255,255,.05); font-weight: 700; font-size: 14.5px; letter-spacing: .02em; transition: transform 120ms, filter 120ms, background 120ms, border-color 120ms; }
.warp-ar-btn:hover:not(:disabled) { border-color: var(--ar-ac); background: rgba(255,255,255,.09); }
.warp-ar-btn:active:not(:disabled) { transform: translateY(1px) scale(.99); }
.warp-ar-btn.primary { background: linear-gradient(135deg, var(--ar-ac), color-mix(in srgb, var(--ar-ac) 55%, var(--ar-ac2))); color: #120a12; border-color: transparent; box-shadow: 0 10px 30px color-mix(in srgb, var(--ar-ac) 40%, transparent), inset 0 1px 0 rgba(255,255,255,.35); font-family: var(--ar-display); text-transform: uppercase; letter-spacing: .08em; font-size: 15px; }
.warp-ar-btn.primary:hover:not(:disabled) { filter: brightness(1.08); }
.warp-ar-btn.ghost { background: transparent; color: var(--ar-muted); }
.warp-ar-btn:focus-visible, .warp-ar-chip:focus-visible, .warp-ar-song:focus-visible, .warp-ar-switch button:focus-visible { outline: 2px solid var(--ar-ac); outline-offset: 2px; }

/* ── briefing ── */
.warp-ar-brief { position: relative; z-index: 1; grid-row: 1 / -1; align-self: center; justify-self: center; width: min(1000px, calc(100% - 32px)); max-height: calc(100% - 32px);
  display: flex; flex-direction: column; border-radius: 22px; background: var(--ar-panel); border: 1px solid color-mix(in srgb, var(--ar-ac) 28%, transparent);
  box-shadow: 0 30px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.03) inset; backdrop-filter: blur(14px); overflow: hidden; animation: warp-ar-rise 420ms cubic-bezier(.2,.8,.2,1) both; }
@keyframes warp-ar-rise { from { opacity: 0; transform: translateY(18px); } }
.warp-ar-x { position: absolute; top: 14px; right: 14px; width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--ar-line); background: rgba(255,255,255,.04); color: var(--ar-muted); z-index: 2; }
.warp-ar-x:hover { color: var(--ar-ink); border-color: var(--ar-ac); }
.warp-ar-brief-head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 20px; align-items: center; padding: 26px 64px 20px 28px;
  background: linear-gradient(120deg, color-mix(in srgb, var(--ar-ac) 16%, transparent), transparent 60%); border-bottom: 1px solid var(--ar-line); }
.warp-ar-badge { width: 74px; height: 74px; border-radius: 20px; display: grid; place-items: center; font-size: 38px; font-weight: 800; font-family: var(--ar-display);
  background: linear-gradient(145deg, var(--ar-ac), var(--ar-ac2)); color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,.35);
  box-shadow: 0 12px 30px color-mix(in srgb, var(--ar-ac) 45%, transparent), inset 0 1px 0 rgba(255,255,255,.4); transform: rotate(-4deg); }
.warp-ar-brief-title { min-width: 0; }
.warp-ar-brief-title h1 { margin: 2px 0 4px; font-family: var(--ar-display); font-size: clamp(28px, 4vw, 42px); line-height: 1; text-transform: uppercase; letter-spacing: .03em; font-weight: 800; text-wrap: balance; }
.warp-ar-brief-title p { margin: 0; color: var(--ar-muted); max-width: 52ch; }
.warp-ar-odds { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; text-align: right; }
.warp-ar-odds span { font-size: 11px; color: var(--ar-dim); letter-spacing: .06em; }
.warp-ar-odds b { font-family: var(--ar-num); font-size: 30px; font-weight: 700; color: var(--ar-ink); }
.warp-ar-switch { display: flex; gap: 6px; padding: 12px 28px 0; flex-wrap: wrap; }
.warp-ar-switch button { display: inline-flex; gap: 8px; align-items: center; padding: 7px 14px; border-radius: 999px; border: 1px solid var(--ar-line); background: transparent; color: var(--ar-muted); font-weight: 600; }
.warp-ar-switch button i { font-style: normal; color: var(--ar-ac); }
.warp-ar-switch button[aria-selected=true] { background: color-mix(in srgb, var(--ar-ac) 18%, transparent); color: var(--ar-ink); border-color: color-mix(in srgb, var(--ar-ac) 60%, transparent); }
.warp-ar-brief-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 28px; padding: 6px 28px 18px; overflow-y: auto; min-height: 0; scrollbar-width: thin; }
.warp-ar-brief-body:has(.warp-ar-col.songs) { grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); }
.warp-ar-col { min-width: 0; }
.warp-ar-brief-foot { display: flex; gap: 10px; align-items: center; padding: 16px 28px 22px; border-top: 1px solid var(--ar-line); flex-wrap: wrap; }
.warp-ar-brief-foot .primary { min-width: 180px; }

.warp-ar-need { margin-top: 16px; }
.warp-ar-need-track { display: flex; height: 16px; border-radius: 8px; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
.warp-ar-need-track .z { display: block; height: 100%; }
.warp-ar-need-track .fail { background: repeating-linear-gradient(135deg, rgba(255,93,108,.25) 0 6px, rgba(255,93,108,.12) 6px 12px); }
.warp-ar-need-track .partial { background: color-mix(in srgb, var(--ar-warn) 70%, transparent); }
.warp-ar-need-track .success { background: var(--ar-good); }
.warp-ar-need-track .crit { background: linear-gradient(90deg, var(--ar-crit), #fff4b8); }
.warp-ar-need-legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; font-size: 12.5px; color: var(--ar-muted); font-variant-numeric: tabular-nums; }
.warp-ar-need-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 6px; vertical-align: 0; }
.warp-ar-need-legend i.partial { background: var(--ar-warn); } .warp-ar-need-legend i.success { background: var(--ar-good); } .warp-ar-need-legend i.crit { background: var(--ar-crit); }
.warp-ar-aids { display: flex; flex-wrap: wrap; gap: 6px; }
.warp-ar-aids.none { color: var(--ar-dim); font-size: 13px; }
.warp-ar-aid { display: inline-flex; gap: 6px; align-items: baseline; padding: 5px 11px; border-radius: 999px; background: rgba(79, 224, 164, .1); border: 1px solid rgba(79, 224, 164, .3); font-size: 12.5px; color: #c9f5e2; }
.warp-ar-aid b { font-weight: 700; color: #fff; }
.warp-ar-aid.perk { background: rgba(255, 224, 102, .1); border-color: rgba(255, 224, 102, .35); color: #fff2bf; }
.warp-ar-partner { margin-top: 8px; font-size: 13px; color: var(--ar-muted); }
.warp-ar-how { margin: 0; padding-left: 18px; display: grid; gap: 4px; color: #ddd7e6; }
.warp-ar-keys { margin-top: 10px; font-family: var(--ar-num); font-size: 12px; color: var(--ar-dim); }
.warp-ar-stakes { margin-top: 4px; }
.warp-ar-chips { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 8px; }
.warp-ar-chip { width: 74px; height: 74px; border-radius: 50%; border: none; padding: 0; display: grid; place-items: center; position: relative;
  background: radial-gradient(circle, #fff 0 34%, transparent 35%), repeating-conic-gradient(var(--chip, #c0392b) 0 22.5deg, #f6efe2 22.5deg 30deg);
  box-shadow: 0 6px 14px rgba(0,0,0,.45), inset 0 0 0 4px rgba(0,0,0,.18); transition: transform 140ms; }
.warp-ar-chip span { position: relative; font-family: var(--ar-num); font-weight: 800; font-size: 13px; color: #1d1d1d; }
.warp-ar-chip:nth-child(2) { --chip: #1f6fbf; } .warp-ar-chip:nth-child(3) { --chip: #1d8f4e; } .warp-ar-chip:nth-child(4) { --chip: #222; } .warp-ar-chip:nth-child(5) { --chip: #7a2dbf; }
.warp-ar-chip:hover { transform: translateY(-3px); }
.warp-ar-chip.on { transform: translateY(-6px) scale(1.06); box-shadow: 0 0 0 3px var(--ar-crit), 0 12px 24px rgba(0,0,0,.5); }

.warp-ar-songs { display: flex; flex-direction: column; gap: 10px; max-height: min(360px, 42vh); overflow-y: auto; padding-right: 4px; scrollbar-width: thin; }
.warp-ar-song-group { display: flex; flex-direction: column; gap: 4px; }
.warp-ar-song-tier { font-size: 10.5px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
.warp-ar-song-tier.t-easy { color: var(--ar-good); } .warp-ar-song-tier.t-normal { color: #6cc7ff; } .warp-ar-song-tier.t-hard { color: var(--ar-warn); } .warp-ar-song-tier.t-brutal { color: var(--ar-bad); } .warp-ar-song-tier.t-yoursongs { color: var(--ar-ac); }
.warp-ar-song { position: relative; display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 8px 34px 8px 12px; border-radius: 10px; border: 1px solid transparent; background: rgba(255,255,255,.035); transition: background 120ms, border-color 120ms; }
.warp-ar-song:hover { background: rgba(255,255,255,.07); }
.warp-ar-song.on { border-color: var(--ar-ac); background: color-mix(in srgb, var(--ar-ac) 14%, transparent); }
.warp-ar-song.on::after { content: "♪"; position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: var(--ar-ac); font-size: 16px; }
.warp-ar-song-t { font-weight: 650; }
.warp-ar-song-m { font-size: 11.5px; color: var(--ar-dim); }
.warp-ar-song-x { position: absolute; right: 30px; top: 8px; color: var(--ar-dim); font-size: 11px; padding: 2px 4px; }
.warp-ar-song-x:hover { color: var(--ar-bad); }
.warp-ar-import { display: block; margin-top: 10px; padding: 9px 12px; border-radius: 10px; border: 1px dashed color-mix(in srgb, var(--ar-ac) 45%, transparent); color: var(--ar-ink); cursor: pointer; text-align: center; font-weight: 600; font-size: 13px; }
.warp-ar-import:hover { background: color-mix(in srgb, var(--ar-ac) 10%, transparent); }
.warp-ar-offset { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 12px; color: var(--ar-muted); }
.warp-ar-offset input { flex: 1; accent-color: var(--ar-ac); }
.warp-ar-offset b { font-family: var(--ar-num); min-width: 56px; text-align: right; font-weight: 600; }

/* ── playing ── */
.warp-ar-top { position: relative; z-index: 2; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 16px; align-items: center;
  padding: calc(12px + env(safe-area-inset-top, 0px)) 22px 12px; background: linear-gradient(180deg, rgba(0,0,0,.55), transparent); }
.warp-ar-title { min-width: 0; }
.warp-ar-title h1 { margin: 0; display: flex; align-items: baseline; gap: 10px; font-family: var(--ar-display); font-size: 24px; text-transform: uppercase; letter-spacing: .05em; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.warp-ar-title h1 i { font-style: normal; color: var(--ar-ac); }
.warp-ar-title h1 small { font-family: var(--ar-ui); font-size: 12.5px; text-transform: none; letter-spacing: 0; color: var(--ar-muted); font-weight: 500; overflow: hidden; text-overflow: ellipsis; }
.warp-ar-lives { display: flex; gap: 3px; font-size: 18px; }
.warp-ar-lives i { font-style: normal; color: rgba(255,255,255,.18); transition: color 200ms, transform 200ms; }
.warp-ar-lives i.on { color: var(--ar-bad); text-shadow: 0 0 10px rgba(255,93,108,.6); }
.warp-ar-tools { display: flex; gap: 6px; }
.warp-ar-tool { width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--ar-line); background: rgba(255,255,255,.04); font-size: 14px; }
.warp-ar-tool:hover { border-color: var(--ar-ac); }
.warp-ar-main { position: relative; z-index: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 92px; gap: 16px; padding: 4px 22px calc(18px + env(safe-area-inset-bottom, 0px)); }
.warp-ar-stage { position: relative; min-height: 0; border-radius: 18px; overflow: hidden; background: rgba(0,0,0,.35); box-shadow: 0 0 0 1px color-mix(in srgb, var(--ar-ac) 22%, transparent), 0 20px 60px rgba(0,0,0,.45); }
.warp-ar-stage.shake { animation: warp-ar-shake 320ms cubic-bezier(.36,.07,.19,.97); }
@keyframes warp-ar-shake { 20% { transform: translate(calc(var(--ar-shake) * -1), 2px); } 40% { transform: translate(var(--ar-shake), -2px); } 60% { transform: translate(calc(var(--ar-shake) * -.6), 1px); } 80% { transform: translate(calc(var(--ar-shake) * .4), 0); } }
.warp-ar-game { position: absolute; inset: 0; }
.warp-ar-canvas { position: absolute; inset: 0; display: block; touch-action: none; }
.warp-ar-banner { position: absolute; left: 0; right: 0; top: 14%; display: grid; place-items: center; pointer-events: none; z-index: 3; }
.warp-ar-ban { grid-area: 1 / 1; font-family: var(--ar-display); font-weight: 800; font-size: clamp(26px, 4.5vw, 46px); text-transform: uppercase; letter-spacing: .06em; padding: 4px 18px;
  text-shadow: 0 4px 24px rgba(0,0,0,.6); animation: warp-ar-ban 1.5s cubic-bezier(.2,.9,.2,1) both; }
.warp-ar-ban.good { color: var(--ar-good); } .warp-ar-ban.bad { color: var(--ar-bad); } .warp-ar-ban.gold { color: var(--ar-crit); } .warp-ar-ban.info { color: var(--ar-ink); }
@keyframes warp-ar-ban { 0% { opacity: 0; transform: scale(.6); } 12% { opacity: 1; transform: scale(1.08); } 22% { transform: scale(1); } 75% { opacity: 1; } 100% { opacity: 0; transform: translateY(-14px); } }
.warp-ar-count { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; z-index: 4; }
.warp-ar-count[data-on] { background: rgba(0,0,0,.35); }
.warp-ar-count span { font-family: var(--ar-display); font-weight: 800; font-size: clamp(80px, 16vw, 170px); color: #fff; text-shadow: 0 0 40px var(--ar-ac), 0 8px 30px rgba(0,0,0,.6); animation: warp-ar-count 560ms cubic-bezier(.2,.9,.2,1) both; }
@keyframes warp-ar-count { from { opacity: 0; transform: scale(1.8); } 40% { opacity: 1; transform: scale(1); } to { opacity: .0; transform: scale(.85); } }

.warp-ar-gauge { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 10px; justify-items: center; min-height: 0; padding: 6px 0; }
.warp-ar-gauge-num { display: flex; flex-direction: column; align-items: center; }
.warp-ar-gauge-num b { font-family: var(--ar-num); font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
.warp-ar-gauge-num span { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--ar-dim); }
.warp-ar-gauge-track { position: relative; width: 26px; height: 100%; min-height: 120px; border-radius: 13px; background: rgba(255,255,255,.06); box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); overflow: visible; }
.warp-ar-gauge-fill { position: absolute; left: 0; right: 0; bottom: 0; height: var(--v, 0); border-radius: 13px; transition: height 220ms cubic-bezier(.2,.8,.2,1), background 220ms; background: var(--ar-bad); box-shadow: 0 0 18px currentColor; color: var(--ar-bad); }
.warp-ar-gauge-fill[data-tone=warn] { background: var(--ar-warn); color: var(--ar-warn); }
.warp-ar-gauge-fill[data-tone=good] { background: var(--ar-good); color: var(--ar-good); }
.warp-ar-gauge-fill[data-tone=crit] { background: linear-gradient(0deg, var(--ar-good), var(--ar-crit)); color: var(--ar-crit); }
.warp-ar-tick { position: absolute; left: -6px; right: -6px; bottom: var(--at); height: 0; border-top: 2px solid rgba(255,255,255,.75); }
.warp-ar-tick span { position: absolute; right: calc(100% + 4px); top: -8px; font-size: 9.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; color: var(--ar-muted); }
.warp-ar-tick.success { border-color: var(--ar-good); } .warp-ar-tick.success span { color: var(--ar-good); }
.warp-ar-tick.crit { border-color: var(--ar-crit); } .warp-ar-tick.crit span { color: var(--ar-crit); }
.warp-ar-tick.partial { border-color: var(--ar-warn); } .warp-ar-tick.partial span { color: var(--ar-warn); }
.warp-ar-gauge.chips .warp-ar-tick.even span { color: var(--ar-ink); }
.warp-ar-status { font-size: 11.5px; color: var(--ar-muted); text-align: center; line-height: 1.3; min-height: 30px; font-variant-numeric: tabular-nums; max-width: 92px; }

.warp-ar-pausecard, .warp-ar-result { position: absolute; inset: 0; z-index: 10; display: grid; place-items: center; background: rgba(5,4,10,.62); backdrop-filter: blur(8px); animation: warp-ar-in 220ms ease both; }
.warp-ar-pausecard[hidden] { display: none; }
.warp-ar-card { width: min(440px, calc(100% - 32px)); display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 28px 26px 24px; border-radius: 22px; background: var(--ar-panel); border: 1px solid color-mix(in srgb, var(--ar-ac) 30%, transparent); box-shadow: 0 30px 80px rgba(0,0,0,.6); text-align: center; }
.warp-ar-card h2 { margin: 0 0 6px; font-family: var(--ar-display); text-transform: uppercase; letter-spacing: .08em; font-size: 28px; }
.warp-ar-card .warp-ar-btn { width: 100%; }
.warp-ar-stamp { font-family: var(--ar-display); font-weight: 900; font-size: clamp(40px, 8vw, 64px); text-transform: uppercase; letter-spacing: .06em; padding: 2px 22px; border: 4px solid currentColor; border-radius: 12px; transform: rotate(-5deg); animation: warp-ar-stamp 520ms cubic-bezier(.2,1.4,.3,1) both; margin: 8px 0; }
@keyframes warp-ar-stamp { from { opacity: 0; transform: rotate(-5deg) scale(2.2); } }
.warp-ar-stamp.good, .warp-ar-big.good { color: var(--ar-good); } .warp-ar-stamp.warn, .warp-ar-big.warn { color: var(--ar-warn); } .warp-ar-stamp.bad, .warp-ar-big.bad { color: var(--ar-bad); }
.warp-ar-stamp.crit, .warp-ar-big.crit { color: var(--ar-crit); text-shadow: 0 0 30px rgba(255,224,102,.55); }
.warp-ar-big { font-family: var(--ar-num); font-size: 44px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1; }
.warp-ar-beats { list-style: none; margin: 4px 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.warp-ar-beats li { font-size: 12.5px; padding: 4px 10px; border-radius: 999px; background: rgba(255,255,255,.06); color: var(--ar-muted); }

/* ── phones ── */
@media (max-width: 720px) {
  .warp-ar-brief { width: 100%; max-height: 100%; border-radius: 0; align-self: stretch; }
  .warp-ar-brief-head { grid-template-columns: auto minmax(0, 1fr); padding: calc(18px + env(safe-area-inset-top, 0px)) 52px 16px 16px; }
  .warp-ar-odds { grid-column: 1 / -1; flex-direction: row; align-items: baseline; gap: 10px; justify-content: flex-start; }
  .warp-ar-odds b { font-size: 22px; }
  .warp-ar-badge { width: 54px; height: 54px; font-size: 28px; border-radius: 15px; }
  .warp-ar-brief-body, .warp-ar-brief-body:has(.warp-ar-col.songs) { grid-template-columns: minmax(0, 1fr); padding: 4px 16px 14px; gap: 6px; }
  .warp-ar-switch { padding: 10px 16px 0; }
  .warp-ar-brief-foot { padding: 12px 16px calc(14px + env(safe-area-inset-bottom, 0px)); }
  .warp-ar-brief-foot .warp-ar-btn { flex: 1; }
  .warp-ar-main { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; padding: 0 10px calc(10px + env(safe-area-inset-bottom, 0px)); gap: 8px; }
  .warp-ar-top { padding: calc(8px + env(safe-area-inset-top, 0px)) 12px 8px; }
  .warp-ar-title h1 { font-size: 19px; }
  .warp-ar-gauge { grid-template-rows: none; grid-template-columns: auto minmax(0, 1fr); align-items: center; padding: 0 6px 6px 4px; gap: 12px; }
  .warp-ar-gauge-num { flex-direction: row; gap: 6px; align-items: baseline; }
  .warp-ar-gauge-num b { font-size: 17px; }
  .warp-ar-gauge-track { width: 100%; height: 14px; min-height: 0; }
  .warp-ar-gauge-fill { top: 0; bottom: 0; right: auto; height: 100%; width: var(--v, 0); transition: width 220ms; }
  .warp-ar-tick { left: var(--at); right: auto; top: -5px; bottom: -5px; width: 0; height: auto; border-top: 0; border-left: 2px solid rgba(255,255,255,.75); }
  .warp-ar-tick span { right: auto; left: -14px; top: auto; bottom: calc(100% + 1px); font-size: 8.5px; }
  .warp-ar-status { grid-column: 1 / -1; min-height: 0; max-width: none; }
  .warp-ar-tick.partial span { display: none; }
  .warp-ar-songs { max-height: none; overflow: visible; }
}
@media (prefers-reduced-motion: reduce) {
  .warp-ar, .warp-ar-brief, .warp-ar-ban, .warp-ar-count span, .warp-ar-stamp { animation: none !important; }
  .warp-ar-bg::before { animation: none; }
}
`;
