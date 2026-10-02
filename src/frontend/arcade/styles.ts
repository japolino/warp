// The arcade's look, in three styles that share one layout:
//  - medieval: dark oak around parchment pages, gold rules, an illuminated initial, a wax seal
//  - modern:   warm paper, ink-black type, one coral accent, soft shadows
//  - scifi:    a quiet instrument panel — hairlines, corner brackets, monospace readouts
// Every rule is scoped under .warp-ar; the style is .warp-ar[data-style=…].

export const ARCADE_STYLES = `
.warp-ar {
  --ar-bg: #eeece7; --ar-bg2: #e6e3dc; --ar-panel: #ffffff; --ar-panel2: #f6f4ef;
  --ar-ink: #1d1d1f; --ar-muted: #5f5f66; --ar-dim: #8e8e93; --ar-line: rgba(29, 29, 31, .1);
  --ar-ac: #ff5a36; --ar-ac2: #2f6fe4; --ar-on-ac: #ffffff;
  --ar-good: #1f9d55; --ar-warn: #d9930f; --ar-bad: #d93a3a; --ar-crit: #c99a06;
  --ar-display: "Manrope", "Inter", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;
  --ar-ui: "Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
  --ar-num: "Inter", "Segoe UI", system-ui, sans-serif;
  --ar-radius: 18px;
  position: absolute; inset: 0; overflow: hidden; outline: none;
  display: grid; grid-template-rows: auto minmax(0, 1fr);
  background: var(--ar-bg); color: var(--ar-ink);
  font-family: var(--ar-ui); font-size: 14px; line-height: 1.45;
  user-select: none; -webkit-user-select: none; touch-action: none;
  font-variant-numeric: tabular-nums;
  animation: warp-ar-in 300ms cubic-bezier(.2, .8, .2, 1) both;
}
@keyframes warp-ar-in { from { opacity: 0; } }
.warp-ar *, .warp-ar *::before, .warp-ar *::after { box-sizing: border-box; }
.warp-ar button { font: inherit; color: inherit; cursor: pointer; }
.warp-ar button:disabled { cursor: not-allowed; opacity: .45; }
.warp-ar kbd { font-family: var(--ar-num); font-size: 10.5px; padding: 1px 6px; border-radius: 5px; border: 1px solid currentColor; opacity: .5; margin-left: 8px; font-weight: 500; }
.warp-ar-bg { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
.warp-ar-kicker { font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--ar-dim); }
.warp-ar-label { margin: 18px 0 8px; font-size: 10.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--ar-dim); }
.warp-ar-dim { color: var(--ar-dim); font-size: 12.5px; }
.warp-ar-dim.small { font-size: 11.5px; margin-top: 6px; }

/* ── buttons ── */
.warp-ar-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; min-height: 44px; padding: 10px 22px; border-radius: 999px; border: 1px solid var(--ar-line); background: transparent; font-weight: 600; font-size: 14.5px; transition: transform 120ms, background 120ms, border-color 120ms, color 120ms; }
.warp-ar-btn:hover:not(:disabled) { border-color: var(--ar-ink); }
.warp-ar-btn:active:not(:disabled) { transform: translateY(1px); }
.warp-ar-btn.primary { background: var(--ar-ink); color: var(--ar-panel); border-color: var(--ar-ink); font-family: var(--ar-display); font-weight: 700; }
.warp-ar-btn.primary:hover:not(:disabled) { background: #000; }
.warp-ar-btn.ghost { color: var(--ar-muted); border-color: transparent; }
.warp-ar-btn.ghost:hover:not(:disabled) { color: var(--ar-ink); border-color: var(--ar-line); }
.warp-ar-btn:focus-visible, .warp-ar-chip:focus-visible, .warp-ar-song:focus-visible, .warp-ar-switch button:focus-visible { outline: 2px solid var(--ar-ac2); outline-offset: 2px; }

/* ── briefing ── */
.warp-ar-brief { position: relative; z-index: 1; grid-row: 1 / -1; align-self: center; justify-self: center; width: min(1000px, calc(100% - 32px)); max-height: calc(100% - 32px);
  display: flex; flex-direction: column; border-radius: var(--ar-radius); background: var(--ar-panel); border: 1px solid var(--ar-line);
  box-shadow: 0 30px 80px rgba(0, 0, 0, .12); overflow: hidden; animation: warp-ar-rise 380ms cubic-bezier(.2,.8,.2,1) both; }
@keyframes warp-ar-rise { from { opacity: 0; transform: translateY(14px); } }
.warp-ar-x { position: absolute; top: 16px; right: 16px; width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--ar-line); background: transparent; color: var(--ar-muted); z-index: 2; }
.warp-ar-x:hover { color: var(--ar-ink); border-color: var(--ar-ink); }
.warp-ar-brief-head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 20px; align-items: center; padding: 28px 64px 22px 28px; border-bottom: 1px solid var(--ar-line); }
.warp-ar-badge { position: relative; width: 66px; height: 66px; border-radius: 18px; display: grid; place-items: center; background: var(--ar-ac); color: var(--ar-on-ac); }
.warp-ar-badge .i { font-size: 30px; font-weight: 700; line-height: 1; }
.warp-ar-badge .l { display: none; }
.warp-ar-brief-title { min-width: 0; }
.warp-ar-brief-title h1 { margin: 2px 0 4px; font-family: var(--ar-display); font-size: clamp(26px, 3.6vw, 38px); line-height: 1.05; font-weight: 800; letter-spacing: -.01em; text-wrap: balance; }
.warp-ar-brief-title p { margin: 0; color: var(--ar-muted); max-width: 56ch; }
.warp-ar-odds { display: flex; flex-direction: column; align-items: flex-end; gap: 0; text-align: right; }
.warp-ar-odds span { font-size: 11.5px; color: var(--ar-dim); }
.warp-ar-odds b { font-family: var(--ar-num); font-size: 30px; font-weight: 700; }
.warp-ar-switch { display: flex; gap: 6px; padding: 14px 28px 0; flex-wrap: wrap; }
.warp-ar-switch button { display: inline-flex; gap: 8px; align-items: center; padding: 7px 14px; border-radius: 999px; border: 1px solid var(--ar-line); background: transparent; color: var(--ar-muted); font-weight: 600; }
.warp-ar-switch button i { font-style: normal; }
.warp-ar-switch button[aria-selected=true] { background: var(--ar-ink); color: var(--ar-panel); border-color: var(--ar-ink); }
.warp-ar-brief-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 32px; padding: 6px 28px 20px; overflow-y: auto; min-height: 0; scrollbar-width: thin; }
.warp-ar-brief-body:has(.warp-ar-col.songs) { grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); }
.warp-ar-col { min-width: 0; }
.warp-ar-brief-foot { display: flex; gap: 10px; align-items: center; padding: 16px 28px 22px; border-top: 1px solid var(--ar-line); flex-wrap: wrap; }
.warp-ar-brief-foot .primary { min-width: 180px; }

.warp-ar-need { margin-top: 18px; }
.warp-ar-need-track { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--ar-bg2); }
.warp-ar-need-track .z { display: block; height: 100%; }
.warp-ar-need-track .fail { background: transparent; }
.warp-ar-need-track .partial { background: color-mix(in srgb, var(--ar-warn) 55%, transparent); }
.warp-ar-need-track .success { background: color-mix(in srgb, var(--ar-good) 75%, transparent); }
.warp-ar-need-track .crit { background: var(--ar-crit); }
.warp-ar-need-legend { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 8px; font-size: 12.5px; color: var(--ar-muted); }
.warp-ar-need-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; }
.warp-ar-need-legend i.partial { background: var(--ar-warn); } .warp-ar-need-legend i.success { background: var(--ar-good); } .warp-ar-need-legend i.crit { background: var(--ar-crit); }
.warp-ar-aids { display: flex; flex-wrap: wrap; gap: 6px; }
.warp-ar-aids.none { color: var(--ar-dim); font-size: 13px; }
.warp-ar-aid { display: inline-flex; gap: 6px; align-items: baseline; padding: 5px 11px; border-radius: 999px; background: var(--ar-panel2); border: 1px solid var(--ar-line); font-size: 12.5px; color: var(--ar-muted); }
.warp-ar-aid b { font-weight: 650; color: var(--ar-ink); }
.warp-ar-aid.perk b { color: var(--ar-ac); }
.warp-ar-partner { margin-top: 8px; font-size: 13px; color: var(--ar-muted); }
.warp-ar-how { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
.warp-ar-keys { margin-top: 10px; font-size: 12px; color: var(--ar-dim); }
.warp-ar-chips { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 8px; }
.warp-ar-chip { width: 72px; height: 72px; border-radius: 50%; border: none; padding: 0; display: grid; place-items: center; position: relative;
  background: radial-gradient(circle, var(--ar-panel) 0 34%, transparent 35%), repeating-conic-gradient(var(--chip, #c0392b) 0 22.5deg, #f4efe4 22.5deg 30deg);
  box-shadow: 0 4px 10px rgba(0,0,0,.18), inset 0 0 0 4px rgba(0,0,0,.12); transition: transform 140ms; }
.warp-ar-chip span { position: relative; font-family: var(--ar-num); font-weight: 700; font-size: 13px; color: var(--ar-ink); }
.warp-ar-chip:nth-child(2) { --chip: #2f5fa8; } .warp-ar-chip:nth-child(3) { --chip: #2a7a4b; } .warp-ar-chip:nth-child(4) { --chip: #232323; }
.warp-ar-chip:hover { transform: translateY(-3px); }
.warp-ar-chip.on { transform: translateY(-5px); box-shadow: 0 0 0 3px var(--ar-ink), 0 10px 20px rgba(0,0,0,.2); }

.warp-ar-songs { display: flex; flex-direction: column; gap: 12px; max-height: min(360px, 42vh); overflow-y: auto; padding-right: 4px; scrollbar-width: thin; }
.warp-ar-song-group { display: flex; flex-direction: column; gap: 3px; }
.warp-ar-song-tier { font-size: 10.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--ar-dim); margin-bottom: 2px; }
.warp-ar-song-tier.t-easy { color: var(--ar-good); } .warp-ar-song-tier.t-normal { color: var(--ar-ac2); } .warp-ar-song-tier.t-hard { color: var(--ar-warn); } .warp-ar-song-tier.t-brutal { color: var(--ar-bad); }
.warp-ar-song { position: relative; display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 8px 34px 8px 12px; border-radius: 10px; border: 1px solid transparent; background: transparent; transition: background 120ms, border-color 120ms; }
.warp-ar-song:hover { background: var(--ar-panel2); }
.warp-ar-song.on { border-color: var(--ar-ink); background: var(--ar-panel2); }
.warp-ar-song.on::after { content: "♪"; position: absolute; right: 12px; top: 50%; transform: translateY(-50%); }
.warp-ar-song-t { font-weight: 600; }
.warp-ar-song-m { font-size: 11.5px; color: var(--ar-dim); }
.warp-ar-song-x { position: absolute; right: 30px; top: 8px; color: var(--ar-dim); font-size: 11px; padding: 2px 4px; }
.warp-ar-song-x:hover { color: var(--ar-bad); }
.warp-ar-import { display: block; margin-top: 10px; padding: 9px 12px; border-radius: 10px; border: 1px dashed var(--ar-line); cursor: pointer; text-align: center; font-weight: 600; font-size: 13px; color: var(--ar-muted); }
.warp-ar-import:hover { color: var(--ar-ink); border-color: var(--ar-ink); }
.warp-ar-offset { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 12px; color: var(--ar-muted); }
.warp-ar-offset input { flex: 1; accent-color: var(--ar-ac); }
.warp-ar-offset b { font-family: var(--ar-num); min-width: 56px; text-align: right; font-weight: 600; }

/* ── playing ── */
.warp-ar-top { position: relative; z-index: 2; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 16px; align-items: center; padding: calc(14px + env(safe-area-inset-top, 0px)) 22px 12px; }
.warp-ar-title { min-width: 0; }
.warp-ar-title h1 { margin: 0; display: flex; align-items: baseline; gap: 10px; font-family: var(--ar-display); font-size: 22px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.warp-ar-title h1 i { font-style: normal; color: var(--ar-ac); }
.warp-ar-title h1 small { font-family: var(--ar-ui); font-size: 12.5px; color: var(--ar-muted); font-weight: 500; overflow: hidden; text-overflow: ellipsis; }
.warp-ar-lives { display: flex; gap: 4px; font-size: 17px; }
.warp-ar-lives i { font-style: normal; color: var(--ar-line); transition: color 200ms; }
.warp-ar-lives i.on { color: var(--ar-bad); }
.warp-ar-tools { display: flex; gap: 6px; }
.warp-ar-tool { width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--ar-line); background: var(--ar-panel); font-size: 13px; }
.warp-ar-tool:hover { border-color: var(--ar-ink); }
.warp-ar-main { position: relative; z-index: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 112px; gap: 16px; padding: 2px 22px calc(18px + env(safe-area-inset-bottom, 0px)); }
.warp-ar-stage { position: relative; min-height: 0; border-radius: var(--ar-radius); overflow: hidden; background: var(--ar-panel); border: 1px solid var(--ar-line); box-shadow: 0 20px 50px rgba(0,0,0,.08); }
.warp-ar-stage.shake { animation: warp-ar-shake 320ms cubic-bezier(.36,.07,.19,.97); }
@keyframes warp-ar-shake { 20% { transform: translate(calc(var(--ar-shake) * -1), 2px); } 40% { transform: translate(var(--ar-shake), -2px); } 60% { transform: translate(calc(var(--ar-shake) * -.6), 1px); } 80% { transform: translate(calc(var(--ar-shake) * .4), 0); } }
.warp-ar-game { position: absolute; inset: 0; }
.warp-ar-canvas { position: absolute; inset: 0; display: block; touch-action: none; }
.warp-ar-banner { position: absolute; left: 0; right: 0; top: 14%; display: grid; place-items: center; pointer-events: none; z-index: 3; }
.warp-ar-ban { grid-area: 1 / 1; font-family: var(--ar-display); font-weight: 800; font-size: clamp(22px, 3.8vw, 38px); padding: 6px 20px; border-radius: 999px; background: var(--ar-panel); color: var(--ar-ink); box-shadow: 0 10px 30px rgba(0,0,0,.15); animation: warp-ar-ban 1.5s cubic-bezier(.2,.9,.2,1) both; }
.warp-ar-ban.good { color: var(--ar-good); } .warp-ar-ban.bad { color: var(--ar-bad); } .warp-ar-ban.gold { color: var(--ar-crit); }
@keyframes warp-ar-ban { 0% { opacity: 0; transform: translateY(8px) scale(.92); } 12% { opacity: 1; transform: none; } 75% { opacity: 1; } 100% { opacity: 0; transform: translateY(-10px); } }
.warp-ar-count { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; z-index: 4; }
.warp-ar-count[data-on] { background: color-mix(in srgb, var(--ar-bg) 55%, transparent); }
.warp-ar-count span { font-family: var(--ar-display); font-weight: 800; font-size: clamp(72px, 14vw, 150px); color: var(--ar-ink); animation: warp-ar-count 560ms cubic-bezier(.2,.9,.2,1) both; }
@keyframes warp-ar-count { from { opacity: 0; transform: scale(1.4); } 40% { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(.9); } }

.warp-ar-gauge { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 10px; justify-items: center; min-height: 0; padding: 6px 0; }
.warp-ar-gauge-num { display: flex; flex-direction: column; align-items: center; }
.warp-ar-gauge-num b { font-family: var(--ar-num); font-size: 21px; font-weight: 700; }
.warp-ar-gauge-num span { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--ar-dim); }
.warp-ar-gauge-track { position: relative; width: 14px; height: 100%; min-height: 120px; border-radius: 7px; background: var(--ar-bg2); justify-self: end; margin-right: 18px; }
.warp-ar-gauge-fill { position: absolute; left: 0; right: 0; bottom: 0; height: var(--v, 0); border-radius: 7px; transition: height 220ms cubic-bezier(.2,.8,.2,1), background 220ms; background: var(--ar-bad); }
.warp-ar-gauge-fill[data-tone=warn] { background: var(--ar-warn); }
.warp-ar-gauge-fill[data-tone=good] { background: var(--ar-good); }
.warp-ar-gauge-fill[data-tone=crit] { background: var(--ar-crit); }
.warp-ar-tick { position: absolute; left: -7px; right: -7px; bottom: var(--at); height: 0; border-top: 2px solid var(--ar-ink); }
.warp-ar-tick span { position: absolute; right: calc(100% + 5px); top: -8px; font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; color: var(--ar-muted); }
.warp-ar-tick.success { border-color: var(--ar-good); } .warp-ar-tick.success span { color: var(--ar-good); }
.warp-ar-tick.crit { border-color: var(--ar-crit); } .warp-ar-tick.crit span { color: var(--ar-crit); }
.warp-ar-tick.partial { border-color: var(--ar-warn); } .warp-ar-tick.partial span { color: var(--ar-warn); }
.warp-ar-status { font-size: 11.5px; color: var(--ar-muted); text-align: center; line-height: 1.35; min-height: 30px; white-space: pre-line; max-width: 112px; }

.warp-ar-pausecard, .warp-ar-result { position: absolute; inset: 0; z-index: 10; display: grid; place-items: center; background: color-mix(in srgb, var(--ar-bg) 70%, transparent); backdrop-filter: blur(6px); animation: warp-ar-in 220ms ease both; }
.warp-ar-pausecard[hidden] { display: none; }
.warp-ar-card { position: relative; width: min(440px, calc(100% - 32px)); display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 30px 26px 24px; border-radius: var(--ar-radius); background: var(--ar-panel); border: 1px solid var(--ar-line); box-shadow: 0 30px 80px rgba(0,0,0,.15); text-align: center; }
.warp-ar-card h2 { margin: 0 0 6px; font-family: var(--ar-display); font-size: 26px; font-weight: 800; }
.warp-ar-card .warp-ar-btn { width: 100%; }
.warp-ar-stamp { font-family: var(--ar-display); font-weight: 800; font-size: clamp(36px, 7vw, 54px); line-height: 1; letter-spacing: -.02em; margin: 6px 0 0; animation: warp-ar-stamp 480ms cubic-bezier(.2,1.2,.3,1) both; }
@keyframes warp-ar-stamp { from { opacity: 0; transform: scale(1.4); } }
.warp-ar-stamp.good, .warp-ar-big.good { color: var(--ar-good); } .warp-ar-stamp.warn, .warp-ar-big.warn { color: var(--ar-warn); } .warp-ar-stamp.bad, .warp-ar-big.bad { color: var(--ar-bad); } .warp-ar-stamp.crit, .warp-ar-big.crit { color: var(--ar-crit); }
.warp-ar-big { font-family: var(--ar-num); font-size: 40px; font-weight: 700; line-height: 1; }
.warp-ar-beats { list-style: none; margin: 4px 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.warp-ar-beats li { font-size: 12.5px; padding: 4px 10px; border-radius: 999px; background: var(--ar-panel2); color: var(--ar-muted); }

/* ═════════════ medieval: oak, parchment, gold leaf ═════════════ */
.warp-ar[data-style=medieval] {
  --ar-bg: #1e140b; --ar-bg2: #c9b68e; --ar-panel: #ecdfbf; --ar-panel2: #e2d2ab;
  --ar-ink: #2c1f12; --ar-muted: #5e4a30; --ar-dim: #7d6646; --ar-line: rgba(74, 52, 28, .28);
  --ar-ac: #9e2b1f; --ar-ac2: #2c4a7a; --ar-on-ac: #f3e7c8; --ar-gold: #b48a2c;
  --ar-good: #3e6b3a; --ar-warn: #a8741a; --ar-bad: #8c1f1a; --ar-crit: #b48a2c;
  --ar-display: "Cinzel", "Trajan Pro", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  --ar-ui: "EB Garamond", "Garamond", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  --ar-num: "EB Garamond", "Palatino Linotype", Georgia, serif;
  --ar-radius: 3px;
  font-size: 15.5px;
  background: var(--ar-wood, #3b2414) 0 0 / 256px 256px; color: var(--ar-ink);
}
.warp-ar[data-style=medieval] .warp-ar-bg { background: radial-gradient(ellipse at center, transparent 30%, rgba(10, 5, 0, .75) 100%); }
.warp-ar[data-style=medieval] :is(.warp-ar-brief, .warp-ar-card) {
  background: var(--ar-parch, #ecdfbf) 0 0 / 512px 512px; border: 1px solid #5a3d1c;
  box-shadow: inset 0 0 0 6px transparent, inset 0 0 0 7px var(--ar-gold), inset 0 0 0 10px transparent, inset 0 0 0 11px rgba(90, 61, 28, .5), inset 0 0 60px rgba(120, 70, 20, .28), 0 30px 70px rgba(0, 0, 0, .6); }
.warp-ar[data-style=medieval] .warp-ar-brief-head { padding-top: 34px; }
.warp-ar[data-style=medieval] .warp-ar-kicker { font-family: var(--ar-ui); font-style: italic; font-size: 14px; letter-spacing: .02em; text-transform: none; color: var(--ar-ac); font-weight: 500; }
.warp-ar[data-style=medieval] .warp-ar-label { font-family: var(--ar-display); font-size: 11px; letter-spacing: .18em; color: var(--ar-ac); font-weight: 700; }
.warp-ar[data-style=medieval] .warp-ar-brief-title h1, .warp-ar[data-style=medieval] .warp-ar-card h2 { font-weight: 700; letter-spacing: .06em; }
.warp-ar[data-style=medieval] .warp-ar-badge { width: 70px; height: 70px; border-radius: 2px; background: var(--ar-ac2); box-shadow: inset 0 0 0 3px var(--ar-gold), inset 0 0 0 6px var(--ar-ac2), inset 0 0 0 7px rgba(180, 138, 44, .6), 0 3px 8px rgba(40, 20, 5, .35); }
.warp-ar[data-style=medieval] .warp-ar-badge .i { display: none; }
.warp-ar[data-style=medieval] .warp-ar-badge .l { display: block; font-family: var(--ar-display); font-weight: 900; font-size: 40px; color: #e9c46a; text-shadow: 0 1px 0 #6b4a12; line-height: 1; }
.warp-ar[data-style=medieval] .warp-ar-odds b { font-family: var(--ar-display); font-weight: 700; }
.warp-ar[data-style=medieval] .warp-ar-btn { border-radius: 2px; font-family: var(--ar-display); font-size: 13px; letter-spacing: .12em; text-transform: uppercase; border-color: rgba(74, 52, 28, .45); }
.warp-ar[data-style=medieval] .warp-ar-btn.primary { background: var(--ar-ac); color: var(--ar-on-ac); border-color: #5e140c; box-shadow: inset 0 0 0 2px var(--ar-ac), inset 0 0 0 3px rgba(233, 196, 106, .7); }
.warp-ar[data-style=medieval] .warp-ar-btn.primary:hover:not(:disabled) { background: #8a2419; }
.warp-ar[data-style=medieval] .warp-ar-btn.ghost { border-color: transparent; text-transform: none; font-family: var(--ar-ui); font-style: italic; font-size: 15px; letter-spacing: 0; }
.warp-ar[data-style=medieval] .warp-ar-x { border-radius: 2px; }
.warp-ar[data-style=medieval] .warp-ar-switch button { border-radius: 2px; font-family: var(--ar-display); font-size: 12px; letter-spacing: .1em; }
.warp-ar[data-style=medieval] .warp-ar-need-track { border-radius: 0; height: 12px; background: rgba(74, 52, 28, .12); box-shadow: inset 0 0 0 1px rgba(74, 52, 28, .35); }
.warp-ar[data-style=medieval] .warp-ar-need-track .fail { background: repeating-linear-gradient(135deg, rgba(74, 52, 28, .2) 0 2px, transparent 2px 6px); }
.warp-ar[data-style=medieval] .warp-ar-need-legend i { border-radius: 0; transform: rotate(45deg); }
.warp-ar[data-style=medieval] .warp-ar-aid { border-radius: 2px; background: transparent; border-style: dashed; }
.warp-ar[data-style=medieval] .warp-ar-how { list-style: "❧  "; }
.warp-ar[data-style=medieval] .warp-ar-keys { font-style: italic; }
.warp-ar[data-style=medieval] .warp-ar-song { border-radius: 0; border-width: 0 0 0 3px; }
.warp-ar[data-style=medieval] .warp-ar-song.on { border-color: var(--ar-ac); background: rgba(158, 43, 31, .07); }
.warp-ar[data-style=medieval] .warp-ar-song-tier { font-family: var(--ar-display); }
.warp-ar[data-style=medieval] .warp-ar-chip { background: radial-gradient(circle at 35% 30%, #f6dc8a, #c9952f 55%, #8a6214 100%); box-shadow: 0 3px 8px rgba(40, 20, 5, .4), inset 0 0 0 3px rgba(107, 74, 18, .5), inset 0 0 0 6px rgba(246, 220, 138, .35); }
.warp-ar[data-style=medieval] .warp-ar-chip span { color: #3a2508; font-family: var(--ar-display); }
.warp-ar[data-style=medieval] .warp-ar-chip.on { box-shadow: 0 0 0 3px var(--ar-ac), 0 8px 16px rgba(40, 20, 5, .45); }
.warp-ar[data-style=medieval] .warp-ar-top { color: #ecdfbf; }
.warp-ar[data-style=medieval] .warp-ar-top .warp-ar-kicker { color: #d6b56a; }
.warp-ar[data-style=medieval] .warp-ar-title h1 { font-weight: 700; letter-spacing: .08em; color: #ecdfbf; }
.warp-ar[data-style=medieval] .warp-ar-title h1 i { color: #d6b56a; }
.warp-ar[data-style=medieval] .warp-ar-title h1 small { color: #c9b68e; font-style: italic; letter-spacing: 0; }
.warp-ar[data-style=medieval] .warp-ar-tool { border-radius: 2px; background: rgba(236, 223, 191, .1); border-color: rgba(214, 181, 106, .45); color: #ecdfbf; }
.warp-ar[data-style=medieval] .warp-ar-lives i { color: rgba(236, 223, 191, .25); }
.warp-ar[data-style=medieval] .warp-ar-lives i.on { color: #c4413a; }
.warp-ar[data-style=medieval] .warp-ar-stage { border-radius: 4px; border: 0; background: #2a1a0d; box-shadow: 0 0 0 2px #b48a2c, 0 0 0 7px #4a2e16, 0 0 0 8px #b48a2c, 0 24px 60px rgba(0, 0, 0, .6); }
.warp-ar[data-style=medieval] .warp-ar-main { padding-left: 30px; padding-right: 30px; padding-bottom: calc(26px + env(safe-area-inset-bottom, 0px)); }
.warp-ar[data-style=medieval] .warp-ar-gauge-num b { font-family: var(--ar-display); color: #ecdfbf; }
.warp-ar[data-style=medieval] .warp-ar-gauge-num span { color: #c9b68e; }
.warp-ar[data-style=medieval] .warp-ar-gauge-track { width: 16px; border-radius: 2px; background: #2a1a0d; box-shadow: 0 0 0 2px #b48a2c, inset 0 0 8px rgba(0,0,0,.6); }
.warp-ar[data-style=medieval] .warp-ar-gauge-fill { border-radius: 1px; }
.warp-ar[data-style=medieval] .warp-ar-gauge-fill[data-tone=good] { background: #6f9a5e; } .warp-ar[data-style=medieval] .warp-ar-gauge-fill[data-tone=crit] { background: #e9c46a; } .warp-ar[data-style=medieval] .warp-ar-gauge-fill[data-tone=warn] { background: #c99a4a; } .warp-ar[data-style=medieval] .warp-ar-gauge-fill:not([data-tone]), .warp-ar[data-style=medieval] .warp-ar-gauge-fill[data-tone=bad] { background: #b5413a; }
.warp-ar[data-style=medieval] .warp-ar-tick { border-top-color: #ecdfbf; }
.warp-ar[data-style=medieval] .warp-ar-tick span { font-family: var(--ar-display); font-size: 9px; color: #c9b68e; }
.warp-ar[data-style=medieval] .warp-ar-tick.success span { color: #8fbf7a; } .warp-ar[data-style=medieval] .warp-ar-tick.crit span { color: #e9c46a; } .warp-ar[data-style=medieval] .warp-ar-tick.partial span { color: #d9a54a; }
.warp-ar[data-style=medieval] .warp-ar-tick.success { border-color: #8fbf7a; } .warp-ar[data-style=medieval] .warp-ar-tick.crit { border-color: #e9c46a; } .warp-ar[data-style=medieval] .warp-ar-tick.partial { border-color: #d9a54a; }
.warp-ar[data-style=medieval] .warp-ar-status { color: #c9b68e; font-style: italic; font-size: 13px; }
.warp-ar[data-style=medieval] .warp-ar-ban { font-family: var(--ar-display); font-weight: 700; letter-spacing: .08em; border-radius: 2px; background: var(--ar-parch, #ecdfbf) 0 0 / 512px; box-shadow: inset 0 0 0 1px var(--ar-gold), 0 10px 30px rgba(0,0,0,.45); }
.warp-ar[data-style=medieval] .warp-ar-count[data-on] { background: rgba(20, 12, 4, .45); }
.warp-ar[data-style=medieval] .warp-ar-count span { font-family: var(--ar-display); font-weight: 900; color: #ecdfbf; text-shadow: 0 4px 20px rgba(0,0,0,.6); }
.warp-ar[data-style=medieval] :is(.warp-ar-pausecard, .warp-ar-result) { background: rgba(20, 12, 4, .55); }
.warp-ar[data-style=medieval] .warp-ar-stamp { width: 132px; height: 132px; border-radius: 50%; display: grid; place-items: center; text-align: center; padding: 18px; font-size: 15px; line-height: 1.15; letter-spacing: .12em; text-transform: uppercase; font-weight: 700; color: #f3d9c0 !important;
  background: radial-gradient(circle at 38% 32%, #c2453a, #8c1f1a 60%, #5e110c); box-shadow: inset 0 0 0 6px rgba(94, 17, 12, .5), inset 0 0 0 9px rgba(243, 217, 192, .25), 0 4px 10px rgba(40, 10, 5, .45); transform: rotate(-8deg); }
.warp-ar[data-style=medieval] .warp-ar-stamp.good { background: radial-gradient(circle at 38% 32%, #6f9a5e, #3e6b3a 60%, #24401f); }
.warp-ar[data-style=medieval] .warp-ar-stamp.crit { background: radial-gradient(circle at 38% 32%, #e9c46a, #b48a2c 60%, #6b4a12); color: #3a2508 !important; }
.warp-ar[data-style=medieval] .warp-ar-stamp.warn { background: radial-gradient(circle at 38% 32%, #c99a4a, #a8741a 60%, #6b4a12); }
.warp-ar[data-style=medieval] .warp-ar-big { font-family: var(--ar-display); font-weight: 700; }
.warp-ar[data-style=medieval] .warp-ar-beats li { border-radius: 2px; background: transparent; font-style: italic; font-size: 14px; }

/* ═════════════ sci-fi: an instrument panel ═════════════ */
.warp-ar[data-style=scifi] {
  --ar-bg: #05080d; --ar-bg2: #13202e; --ar-panel: #0b131d; --ar-panel2: #101b28;
  --ar-ink: #d6e2ee; --ar-muted: #8ea3b8; --ar-dim: #61768c; --ar-line: rgba(120, 170, 210, .18);
  --ar-ac: #5ec8e5; --ar-ac2: #f2a541; --ar-on-ac: #05080d;
  --ar-good: #5fd3a0; --ar-warn: #f2a541; --ar-bad: #ef6461; --ar-crit: #f2c14e;
  --ar-display: "Oxanium", "Bahnschrift", "DIN Alternate", "Segoe UI", system-ui, sans-serif;
  --ar-ui: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
  --ar-num: "IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
  --ar-radius: 0px;
  background: var(--ar-panel-tex, #070b12) 0 0 / 256px 256px;
}
.warp-ar[data-style=scifi] .warp-ar-bg { background: radial-gradient(ellipse at 50% 40%, rgba(94, 200, 229, .05), transparent 60%), radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.7) 100%); }
.warp-ar[data-style=scifi] :is(.warp-ar-brief, .warp-ar-card, .warp-ar-stage) { border: 1px solid var(--ar-line); box-shadow: none;
  clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px); }
.warp-ar[data-style=scifi] :is(.warp-ar-brief, .warp-ar-card)::before { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 3;
  background:
    linear-gradient(var(--ar-ac), var(--ar-ac)) 16px 0 / 48px 2px no-repeat,
    linear-gradient(var(--ar-ac), var(--ar-ac)) right 16px bottom 0 / 48px 2px no-repeat,
    linear-gradient(135deg, transparent 10.5px, var(--ar-ac) 10.5px 12px, transparent 12px) 0 0 / 16px 16px no-repeat,
    linear-gradient(-45deg, transparent 10.5px, var(--ar-ac) 10.5px 12px, transparent 12px) 100% 100% / 16px 16px no-repeat; }
.warp-ar[data-style=scifi] .warp-ar-kicker { font-family: var(--ar-num); font-size: 11px; letter-spacing: .08em; color: var(--ar-ac); font-weight: 500; }
.warp-ar[data-style=scifi] .warp-ar-kicker::before { content: "// "; opacity: .6; }
.warp-ar[data-style=scifi] .warp-ar-label { font-family: var(--ar-num); font-weight: 500; letter-spacing: .12em; color: var(--ar-dim); }
.warp-ar[data-style=scifi] .warp-ar-brief-title h1, .warp-ar[data-style=scifi] .warp-ar-card h2 { font-weight: 600; text-transform: uppercase; letter-spacing: .1em; }
.warp-ar[data-style=scifi] .warp-ar-badge { border-radius: 0; background: transparent; color: var(--ar-ac); box-shadow: inset 0 0 0 1px var(--ar-ac); clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px); }
.warp-ar[data-style=scifi] .warp-ar-badge::after { content: ""; position: absolute; inset: 6px; border: 1px dashed rgba(94, 200, 229, .35); }
.warp-ar[data-style=scifi] .warp-ar-odds b { font-family: var(--ar-num); font-weight: 600; color: var(--ar-ac); }
.warp-ar[data-style=scifi] .warp-ar-btn { border-radius: 0; font-family: var(--ar-display); text-transform: uppercase; letter-spacing: .12em; font-size: 13px; clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px); }
.warp-ar[data-style=scifi] .warp-ar-btn.primary { background: rgba(94, 200, 229, .14); color: var(--ar-ac); border-color: var(--ar-ac); }
.warp-ar[data-style=scifi] .warp-ar-btn.primary:hover:not(:disabled) { background: var(--ar-ac); color: var(--ar-on-ac); }
.warp-ar[data-style=scifi] .warp-ar-btn.ghost:hover:not(:disabled) { border-color: var(--ar-line); }
.warp-ar[data-style=scifi] .warp-ar-x { border-radius: 0; }
.warp-ar[data-style=scifi] .warp-ar-switch button { border-radius: 0; font-family: var(--ar-num); font-size: 12px; }
.warp-ar[data-style=scifi] .warp-ar-switch button[aria-selected=true] { background: rgba(94, 200, 229, .14); color: var(--ar-ac); border-color: var(--ar-ac); }
.warp-ar[data-style=scifi] .warp-ar-need-track { border-radius: 0; height: 10px; background: repeating-linear-gradient(90deg, rgba(120,170,210,.16) 0 6px, transparent 6px 8px); }
.warp-ar[data-style=scifi] .warp-ar-need-track .z { -webkit-mask: repeating-linear-gradient(90deg, #000 0 6px, transparent 6px 8px); mask: repeating-linear-gradient(90deg, #000 0 6px, transparent 6px 8px); }
.warp-ar[data-style=scifi] .warp-ar-need-legend { font-family: var(--ar-num); font-size: 11.5px; }
.warp-ar[data-style=scifi] .warp-ar-need-legend i { border-radius: 0; }
.warp-ar[data-style=scifi] .warp-ar-aid { border-radius: 0; background: transparent; font-family: var(--ar-num); font-size: 11.5px; }
.warp-ar[data-style=scifi] .warp-ar-aid.perk b { color: var(--ar-ac2); }
.warp-ar[data-style=scifi] .warp-ar-how { list-style: "▸  "; }
.warp-ar[data-style=scifi] .warp-ar-how li::marker { color: var(--ar-ac); }
.warp-ar[data-style=scifi] .warp-ar-keys { font-family: var(--ar-num); }
.warp-ar[data-style=scifi] .warp-ar-song { border-radius: 0; }
.warp-ar[data-style=scifi] .warp-ar-song.on { border-color: var(--ar-ac); background: rgba(94, 200, 229, .07); }
.warp-ar[data-style=scifi] .warp-ar-song-tier { font-family: var(--ar-num); font-weight: 500; }
.warp-ar[data-style=scifi] .warp-ar-chip { border-radius: 0; width: 76px; height: 44px; background: transparent; box-shadow: inset 0 0 0 1px var(--ar-line); clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px); }
.warp-ar[data-style=scifi] .warp-ar-chip span { color: var(--ar-ink); font-family: var(--ar-num); }
.warp-ar[data-style=scifi] .warp-ar-chip.on { transform: none; background: rgba(94, 200, 229, .14); box-shadow: inset 0 0 0 1px var(--ar-ac); }
.warp-ar[data-style=scifi] .warp-ar-chip.on span { color: var(--ar-ac); }
.warp-ar[data-style=scifi] .warp-ar-title h1 { font-weight: 600; text-transform: uppercase; letter-spacing: .12em; font-size: 19px; }
.warp-ar[data-style=scifi] .warp-ar-title h1 small { font-family: var(--ar-num); text-transform: none; letter-spacing: 0; font-size: 11.5px; }
.warp-ar[data-style=scifi] .warp-ar-tool { border-radius: 0; background: transparent; }
.warp-ar[data-style=scifi] .warp-ar-lives { align-items: center; }
.warp-ar[data-style=scifi] .warp-ar-lives i { font-size: 0; width: 14px; height: 6px; background: var(--ar-line); }
.warp-ar[data-style=scifi] .warp-ar-lives i.on { background: var(--ar-ac); }
.warp-ar[data-style=scifi] .warp-ar-stage { background: var(--ar-panel); }
.warp-ar[data-style=scifi] .warp-ar-gauge-num b { color: var(--ar-ac); font-weight: 600; }
.warp-ar[data-style=scifi] .warp-ar-gauge-num span { font-family: var(--ar-num); }
.warp-ar[data-style=scifi] .warp-ar-gauge-track { width: 12px; border-radius: 0; background: repeating-linear-gradient(0deg, rgba(120,170,210,.14) 0 5px, transparent 5px 7px); }
.warp-ar[data-style=scifi] .warp-ar-gauge-fill { border-radius: 0; -webkit-mask: repeating-linear-gradient(0deg, #000 0 5px, transparent 5px 7px); mask: repeating-linear-gradient(0deg, #000 0 5px, transparent 5px 7px); }
.warp-ar[data-style=scifi] .warp-ar-tick span { font-family: var(--ar-num); font-weight: 500; }
.warp-ar[data-style=scifi] .warp-ar-status { font-family: var(--ar-num); font-size: 11px; }
.warp-ar[data-style=scifi] .warp-ar-ban { border-radius: 0; background: rgba(11, 19, 29, .92); border: 1px solid currentColor; text-transform: uppercase; letter-spacing: .1em; font-weight: 600; box-shadow: none; clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px); }
.warp-ar[data-style=scifi] .warp-ar-count span { font-weight: 600; color: var(--ar-ac); }
.warp-ar[data-style=scifi] .warp-ar-stamp { font-weight: 600; text-transform: uppercase; letter-spacing: .14em; font-size: clamp(30px, 6vw, 44px); padding: 6px 18px; border-top: 1px solid currentColor; border-bottom: 1px solid currentColor; }
.warp-ar[data-style=scifi] .warp-ar-stamp::before { content: "OUTCOME // "; font-family: var(--ar-num); font-size: 11px; letter-spacing: .1em; display: block; opacity: .7; margin-bottom: 4px; }
.warp-ar[data-style=scifi] .warp-ar-big { font-weight: 600; }
.warp-ar[data-style=scifi] .warp-ar-beats li { border-radius: 0; font-family: var(--ar-num); font-size: 11.5px; }

/* ── phones ── */
@media (max-width: 720px) {
  .warp-ar-brief { width: 100%; max-height: 100%; border-radius: 0; align-self: stretch; }
  .warp-ar[data-style=scifi] .warp-ar-brief { clip-path: none; }
  .warp-ar-brief-head { grid-template-columns: auto minmax(0, 1fr); padding: calc(18px + env(safe-area-inset-top, 0px)) 52px 16px 16px; }
  .warp-ar-odds { grid-column: 1 / -1; flex-direction: row; align-items: baseline; gap: 10px; justify-content: flex-start; }
  .warp-ar-odds b { font-size: 22px; }
  .warp-ar-badge { width: 54px !important; height: 54px !important; }
  .warp-ar-brief-body, .warp-ar-brief-body:has(.warp-ar-col.songs) { grid-template-columns: minmax(0, 1fr); padding: 4px 16px 14px; gap: 6px; }
  .warp-ar-switch { padding: 10px 16px 0; }
  .warp-ar-brief-foot { padding: 12px 16px calc(14px + env(safe-area-inset-bottom, 0px)); }
  .warp-ar-brief-foot .warp-ar-btn { flex: 1; }
  .warp-ar-main, .warp-ar[data-style=medieval] .warp-ar-main { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; padding: 0 12px calc(10px + env(safe-area-inset-bottom, 0px)); gap: 10px; }
  .warp-ar-top { padding: calc(8px + env(safe-area-inset-top, 0px)) 12px 8px; }
  .warp-ar-title h1 { font-size: 18px; }
  .warp-ar-gauge { grid-template-rows: none; grid-template-columns: auto minmax(0, 1fr); align-items: center; padding: 0 6px 6px 4px; gap: 12px; }
  .warp-ar-gauge-num { flex-direction: row; gap: 6px; align-items: baseline; }
  .warp-ar-gauge-num b { font-size: 17px; }
  .warp-ar-gauge-track { width: 100% !important; height: 12px; min-height: 0; justify-self: stretch; margin-right: 0; }
  .warp-ar-gauge-fill { top: 0; bottom: 0; right: auto; height: 100%; width: var(--v, 0); transition: width 220ms; }
  .warp-ar-tick { left: var(--at); right: auto; top: -5px; bottom: -5px; width: 0; height: auto; border-top: 0 !important; border-left: 2px solid var(--ar-ink); }
  .warp-ar-tick span { right: auto; left: -14px; top: auto; bottom: calc(100% + 1px); font-size: 8.5px; }
  .warp-ar-tick.partial span { display: none; }
  .warp-ar-status { grid-column: 1 / -1; min-height: 0; max-width: none; white-space: normal; }
  .warp-ar-songs { max-height: none; overflow: visible; }
}
@media (prefers-reduced-motion: reduce) {
  .warp-ar, .warp-ar-brief, .warp-ar-ban, .warp-ar-count span, .warp-ar-stamp { animation: none !important; }
}
`;
