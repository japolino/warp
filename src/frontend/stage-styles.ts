// The stage's look: a torch-lit dungeon and a dusky date, full screen, with a
// visual-novel story box. Everything is scoped under .warp-stage.

export const STAGE_STYLES = `
.warp-stage {
  --st-bg: #0b0c10;
  --st-ink: #ede7da;
  --st-muted: #b1a996;
  --st-dim: #7c7567;
  --st-line: rgba(237, 231, 218, .12);
  --st-panel: rgba(12, 12, 16, .78);
  --st-panel-hi: rgba(255, 255, 255, .06);
  --st-accent: #e9a94f;
  --st-accent-ink: #1b1206;
  --st-glow: rgba(233, 169, 79, .35);
  --st-display: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  --st-ui: var(--lumiverse-font, system-ui, -apple-system, "Segoe UI", sans-serif);
  --warp-text: var(--st-ink);
  --warp-muted: var(--st-muted);
  --warp-dim: var(--st-dim);
  --warp-fill: rgba(255, 255, 255, .07);
  --warp-fill-subtle: rgba(255, 255, 255, .035);
  --warp-border: var(--st-line);
  --warp-accent: var(--st-accent);
  --warp-accent-fg: var(--st-accent-ink);
  --warp-good: #5cc9a7;
  --warp-warn: #e9b44f;
  --warp-bad: #ef6a7a;
  --warp-info: #7d9bff;
  --warp-radius: 10px;
  position: absolute; inset: 0;
  display: grid; grid-template-rows: minmax(0, 1fr) auto;
  background: var(--st-bg); color: var(--st-ink);
  font-family: var(--st-ui); font-size: 14px; line-height: 1.45;
  overflow: hidden; user-select: none; -webkit-user-select: none;
  animation: warp-stage-in 380ms ease both;
}
.warp-stage[data-mode=date] {
  --st-bg: #120b14;
  --st-ink: #f5e9ee;
  --st-muted: #c7abb8;
  --st-dim: #8d7280;
  --st-line: rgba(245, 233, 238, .12);
  --st-panel: rgba(22, 12, 22, .74);
  --st-accent: #ff7ea6;
  --st-accent-ink: #2a0714;
  --st-glow: rgba(255, 126, 166, .35);
}
@keyframes warp-stage-in { from { opacity: 0; transform: scale(1.01); } to { opacity: 1; transform: none; } }
.warp-stage *, .warp-stage *::before, .warp-stage *::after { box-sizing: border-box; }
.warp-stage button { font: inherit; color: inherit; }
.warp-stage-scene { position: relative; display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; }
.warp-stage-dim { color: var(--st-dim); font-size: 12.5px; }
.warp-stage-kicker { font-size: 10.5px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--st-muted); display: inline-flex; align-items: center; gap: 6px; }
.warp-stage-kicker-icon { width: 16px; height: 16px; }

/* ── backdrop ── */
.warp-stage-bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.warp-stage-bg::before { content: ""; position: absolute; inset: -2px; background: var(--warp-stage-tex, none) 0 0 / 72px 72px; image-rendering: pixelated; filter: brightness(.28) saturate(.65) contrast(1.05); }
.warp-stage-bg::after { content: ""; position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 60% 45% at 50% 38%, rgba(233, 169, 79, .16), transparent 70%),
    radial-gradient(ellipse at center, transparent 35%, rgba(0, 0, 0, .88) 100%); }
.warp-stage[data-mode=date] .warp-stage-bg::before {
  background:
    radial-gradient(circle at 18% 28%, hsl(var(--warp-hue, 330) 80% 65% / .20), transparent 32%),
    radial-gradient(circle at 82% 22%, hsl(calc(var(--warp-hue, 330) + 50) 75% 62% / .14), transparent 30%),
    radial-gradient(circle at 70% 78%, hsl(calc(var(--warp-hue, 330) - 30) 70% 60% / .16), transparent 34%),
    linear-gradient(165deg, #22122a 0%, #150b18 55%, #0c070e 100%);
  filter: none; }
.warp-stage[data-mode=date] .warp-stage-bg::after {
  background:
    radial-gradient(circle at 12% 70%, rgba(255, 255, 255, .06) 0 6px, transparent 7px),
    radial-gradient(circle at 34% 18%, rgba(255, 255, 255, .05) 0 10px, transparent 11px),
    radial-gradient(circle at 64% 60%, rgba(255, 255, 255, .04) 0 14px, transparent 15px),
    radial-gradient(circle at 88% 40%, rgba(255, 255, 255, .05) 0 8px, transparent 9px),
    radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, .7) 100%); }

/* ── top bar ── */
.warp-stage-top { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 18px;
  padding: calc(14px + env(safe-area-inset-top, 0px)) 24px 14px; border-bottom: 1px solid var(--st-line);
  background: linear-gradient(180deg, rgba(0, 0, 0, .6), rgba(0, 0, 0, .15)); }
.warp-stage-title { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.warp-stage-title h1 { margin: 0; font-family: var(--st-display); font-weight: 600; font-size: 26px; line-height: 1.1; letter-spacing: .01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-wrap: balance; }
.warp-stage-mid { display: flex; align-items: center; gap: 18px; }
.warp-stage-actions { display: flex; align-items: center; gap: 8px; }
.warp-stage-btn { cursor: pointer; border-radius: 999px; padding: 7px 14px; border: 1px solid var(--st-line); background: var(--st-panel-hi); font-weight: 600; font-size: 13px; transition: background 120ms, border-color 120ms, transform 120ms; white-space: nowrap; }
.warp-stage-btn:hover:not(:disabled) { border-color: var(--st-accent); background: rgba(255, 255, 255, .1); }
.warp-stage-btn:active:not(:disabled) { transform: translateY(1px); }
.warp-stage-btn:disabled { opacity: .45; cursor: not-allowed; }
.warp-stage-btn.ghost { background: transparent; }
.warp-stage-btn.primary { background: var(--st-accent); color: var(--st-accent-ink); border-color: transparent; box-shadow: 0 6px 20px var(--st-glow); }
.warp-stage-btn.primary:hover:not(:disabled) { background: var(--st-accent); filter: brightness(1.08); }
.warp-stage-btn.small { padding: 3px 10px; font-size: 12px; }
.warp-stage-btn:focus-visible, .warp-stage-cmd:focus-visible, .warp-stage-move:focus-visible, .warp-stage .warp-dg-tile:focus-visible { outline: 2px solid var(--st-accent); outline-offset: 2px; }

/* dungeon: depth, level, gold */
.warp-stage-depth { display: flex; flex-direction: column; align-items: center; gap: 5px; }
.warp-stage-depth-n { font-family: var(--st-display); font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
.warp-stage-of { color: var(--st-dim); font-size: 14px; }
.warp-stage-pips { display: flex; gap: 4px; }
.warp-stage-pips i { width: 8px; height: 8px; transform: rotate(45deg); border: 1px solid rgba(233, 169, 79, .45); background: transparent; }
.warp-stage-pips i.past { background: rgba(233, 169, 79, .55); border-color: transparent; }
.warp-stage-pips i.now { background: var(--st-accent); border-color: transparent; box-shadow: 0 0 8px var(--st-accent); }
.warp-stage-pips i.last { border-color: #ef6a7a; }
.warp-stage-endless { font-size: 16px; color: var(--st-muted); }
.warp-stage-boss { color: #ef6a7a; font-size: 14px; filter: drop-shadow(0 0 4px #ef6a7a); }
.warp-stage-purse { display: flex; align-items: center; gap: 10px; font-variant-numeric: tabular-nums; }
.warp-stage-lv { font-weight: 700; font-size: 13px; letter-spacing: .04em; }
.warp-stage-xp { width: 90px; height: 5px; border-radius: 3px; background: rgba(255, 255, 255, .1); overflow: hidden; }
.warp-stage-xp > span { display: block; height: 100%; background: linear-gradient(90deg, #7d9bff, #b9a6ff); transition: width 400ms ease; }
.warp-stage-gold { display: inline-flex; align-items: center; gap: 4px; font-weight: 700; color: #f2c45a; }
.warp-stage-coin { width: 20px; height: 20px; }

/* ── main ── */
.warp-stage-main { position: relative; z-index: 1; min-height: 0; padding: 18px 24px; }
.warp-stage-run { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 360px); gap: 22px; }
.warp-stage-map { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.warp-stage-board { flex: 1; min-height: 0; width: 100%; container-type: size; display: grid; place-items: center; }
.warp-stage-board .warp-dg-board { width: min(100cqw, 100cqh); height: min(100cqw, 100cqh); grid-auto-rows: 1fr; gap: 4px; padding: 6px; border-radius: 12px;
  background: rgba(0, 0, 0, .55); box-shadow: 0 0 0 1px rgba(233, 169, 79, .18), 0 24px 60px rgba(0, 0, 0, .6); }
.warp-stage .warp-dg-tile { aspect-ratio: auto; border-radius: 5px; border: 1px solid rgba(0, 0, 0, .55); transition: filter 160ms, transform 160ms; }
.warp-stage .warp-dg-tile.hidden { filter: brightness(.32) saturate(.5); }
.warp-stage .warp-dg-tile.reachable { outline: 2px solid rgba(233, 169, 79, .8); outline-offset: -2px; filter: brightness(.75); animation: warp-stage-beckon 2.4s ease-in-out infinite; }
.warp-stage .warp-dg-tile.reachable:hover { filter: brightness(1.15); transform: translateY(-2px); animation: none; }
.warp-stage .warp-dg-tile.here { outline: 2px solid #fff3d6; box-shadow: 0 0 18px rgba(255, 220, 150, .55); z-index: 1; }
.warp-stage .warp-dg-tile.here .warp-dg-icon { animation: warp-stage-bob 1.8s ease-in-out infinite; }
@keyframes warp-stage-beckon { 50% { outline-color: rgba(233, 169, 79, .35); } }
@keyframes warp-stage-bob { 50% { transform: translateY(-4%); } }
.warp-stage-bag { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: center; }
.warp-stage-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--st-line); background: var(--st-panel); cursor: pointer; font-size: 12.5px; }
.warp-stage-chip:hover:not(:disabled) { border-color: var(--st-accent); }
.warp-stage-chip.muted { cursor: default; color: var(--st-muted); }
.warp-stage-loot { font-size: 12px; color: var(--st-muted); }
.warp-stage-side { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; padding-right: 4px; scrollbar-width: thin; }
.warp-stage-party { display: flex; flex-direction: column; gap: 8px; }
.warp-stage-party.row { flex-direction: row; flex-wrap: wrap; }
.warp-stage-party.row > * { flex: 1 1 150px; }
.warp-stage .warp-dg-member { background: var(--st-panel); border: 1px solid var(--st-line); border-radius: 12px; padding: 8px 10px; gap: 4px; }
.warp-stage .warp-dg-member.active { border-color: var(--st-accent); box-shadow: 0 0 0 1px var(--st-accent) inset, 0 0 22px var(--st-glow); }
.warp-stage .warp-dg-member.targetable { border-color: var(--warp-good); cursor: pointer; animation: warp-stage-pulse 1.4s ease-in-out infinite; }
.warp-stage .warp-dg-face { width: 36px; height: 36px; }
.warp-stage .warp-dg-bar { font-size: 11px; grid-template-columns: 22px 1fr 34px; }
.warp-stage .warp-dg-bar-track { height: 6px; background: rgba(0, 0, 0, .5); }
.warp-stage-here .warp-card, .warp-stage-here > div { background: var(--st-panel); border: 1px solid var(--st-line); border-radius: 12px; padding: 12px; }
.warp-stage-here .warp-dg-event { border-color: rgba(233, 169, 79, .45); box-shadow: 0 0 30px rgba(233, 169, 79, .12); }
.warp-stage-here .warp-dg-event p { font-family: var(--st-display); font-size: 15.5px; line-height: 1.55; margin: 0 0 10px; }
.warp-stage-here .warp-dg-event.romance { border-color: #ff7ea6; box-shadow: 0 0 30px rgba(255, 126, 166, .15); }
.warp-stage-here .warp-btn { border-radius: 999px; padding: 6px 12px; }
.warp-stage-here h3 { margin: 0 0 8px; font-family: var(--st-display); font-size: 16px; }
.warp-stage-log { font-size: 12.5px; color: var(--st-muted); display: flex; flex-direction: column; gap: 3px; border-top: 1px solid var(--st-line); padding-top: 10px; }
.warp-stage-log > div:first-child { color: var(--st-ink); }
.warp-stage-menu-note { display: flex; align-items: center; gap: 10px; color: var(--st-muted); }
.warp-stage-menu-note.warn { color: var(--warp-warn); }

/* battle */
.warp-stage-battle { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 380px); gap: 18px; }
.warp-stage:has(.warp-stage-battle) .warp-stage-story { max-height: 24dvh; }
.warp-stage-arena { position: relative; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 8px; min-height: 0; border-radius: 16px; padding: 14px 18px;
  background: radial-gradient(ellipse 70% 60% at 50% 70%, rgba(255, 190, 120, .10), transparent 70%), rgba(0, 0, 0, .35);
  box-shadow: inset 0 0 0 1px rgba(233, 169, 79, .16), inset 0 -60px 80px rgba(0, 0, 0, .45); }
.warp-stage-arena.boss { box-shadow: inset 0 0 0 1px rgba(239, 106, 122, .35), inset 0 -60px 80px rgba(0, 0, 0, .45), 0 0 40px rgba(239, 106, 122, .12); }
.warp-stage-arena-head { display: flex; justify-content: space-between; align-items: baseline; }
.warp-stage-round { font-family: var(--st-display); font-size: 16px; color: var(--st-muted); }
.warp-stage-foes { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; align-content: center; gap: 22px; min-height: 0; }
.warp-stage-foe { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; width: 150px; padding: 8px; border-radius: 14px; border: 1px solid transparent; background: transparent; }
.warp-stage-foe-glow { position: absolute; left: 15%; right: 15%; bottom: 44px; height: 14px; border-radius: 50%; background: rgba(0, 0, 0, .55); filter: blur(4px); }
.warp-stage-foe-img { position: relative; width: clamp(72px, 15vh, 132px); height: clamp(72px, 15vh, 132px); filter: drop-shadow(0 6px 4px rgba(0, 0, 0, .6)); animation: warp-stage-idle 3.2s ease-in-out infinite; }
.warp-stage-foe:nth-child(2n) .warp-stage-foe-img { animation-delay: -1.1s; }
.warp-stage-foe.elite .warp-stage-foe-img { width: clamp(84px, 18vh, 156px); height: clamp(84px, 18vh, 156px); filter: drop-shadow(0 0 10px rgba(233, 180, 79, .8)); }
.warp-stage-foe.boss { width: 230px; }
.warp-stage-foe.boss .warp-stage-foe-img { width: clamp(110px, 26vh, 220px); height: clamp(110px, 26vh, 220px); filter: drop-shadow(0 0 14px rgba(239, 106, 122, .85)); }
.warp-stage-foe.down { opacity: .22; filter: grayscale(1); }
.warp-stage-foe.down .warp-stage-foe-img { animation: none; transform: rotate(-8deg) translateY(8px); }
.warp-stage-foe.targetable { cursor: pointer; border-color: rgba(239, 106, 122, .7); background: rgba(239, 106, 122, .08); animation: warp-stage-pulse 1.4s ease-in-out infinite; }
.warp-stage-foe-name { font-weight: 600; font-size: 13px; text-shadow: 0 1px 3px #000; text-align: center; }
.warp-stage-foe .warp-dg-bar { width: 100%; }
@keyframes warp-stage-idle { 50% { transform: translateY(-5px); } }
@keyframes warp-stage-pulse { 50% { box-shadow: 0 0 0 4px rgba(233, 169, 79, .15); } }
.warp-stage-ticker { display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 13px; color: var(--st-muted); text-align: center; }
.warp-stage-ticker .new { color: var(--st-ink); font-weight: 600; animation: warp-stage-rise 360ms ease both; }
@keyframes warp-stage-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.warp-stage-command { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; scrollbar-width: thin; }
.warp-stage-menu { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 14px;
  background: linear-gradient(180deg, rgba(24, 20, 16, .95), rgba(10, 9, 8, .95)); border: 1px solid rgba(233, 169, 79, .35);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .7), 0 14px 40px rgba(0, 0, 0, .55); }
.warp-stage-turn { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--st-muted); }
.warp-stage-turn b { color: var(--st-ink); }
.warp-stage-turn-face { width: 28px; height: 28px; }
.warp-stage-cmds { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 6px; }
.warp-stage-cmds.tail { border-top: 1px solid rgba(233, 169, 79, .18); padding-top: 8px; }
.warp-stage-cmd { cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 7px 10px; border-radius: 8px; border: 1px solid rgba(233, 169, 79, .22); background: rgba(255, 255, 255, .04); text-align: left; font-size: 13px; font-weight: 600; transition: background 120ms, border-color 120ms, transform 120ms; }
.warp-stage-cmd small { font-weight: 500; color: var(--st-dim); font-size: 11px; }
.warp-stage-cmd:hover:not(:disabled) { background: rgba(233, 169, 79, .16); border-color: var(--st-accent); transform: translateX(2px); }
.warp-stage-cmd:disabled { opacity: .4; cursor: not-allowed; }
.warp-stage-cmd.item span { flex: 1; }
.warp-stage-cmd.flee { border-color: rgba(125, 155, 255, .35); }

/* gate */
.warp-stage-gates { display: flex; flex-wrap: wrap; justify-content: center; align-content: center; gap: 20px; overflow-y: auto; }
.warp-stage-gate { width: min(460px, 100%); display: flex; flex-direction: column; gap: 12px; padding: 22px; border-radius: 18px; background: var(--st-panel); border: 1px solid rgba(233, 169, 79, .28); box-shadow: 0 24px 60px rgba(0, 0, 0, .55); }
.warp-stage-gate-head { display: flex; align-items: center; gap: 14px; }
.warp-stage-gate-icon { width: 56px; height: 56px; filter: drop-shadow(0 0 10px rgba(233, 169, 79, .5)); }
.warp-stage-gate h2 { margin: 0; font-family: var(--st-display); font-size: 24px; font-weight: 600; }
.warp-stage-gate p { margin: 0; }
.warp-stage-mates { display: flex; flex-direction: column; gap: 6px; }
.warp-stage-mate { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--st-line); cursor: pointer; }
.warp-stage-mate.on { border-color: var(--st-accent); background: rgba(233, 169, 79, .08); }
.warp-stage-mate input { accent-color: var(--st-accent); }
.warp-stage-mate-name { font-weight: 600; flex: 1; }
.warp-stage-gate .warp-stage-btn.primary { align-self: flex-start; padding: 10px 18px; font-size: 14px; }

/* ── date ── */
.warp-stage-ladder { list-style: none; margin: 0; padding: 0; display: flex; align-items: center; gap: 0; }
.warp-stage-ladder li { position: relative; font-size: 11.5px; letter-spacing: .04em; color: var(--st-dim); padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
.warp-stage-ladder li + li::before { content: ""; position: absolute; left: -6px; top: 50%; width: 12px; height: 1px; background: var(--st-line); }
.warp-stage-ladder li.past { color: var(--st-muted); }
.warp-stage-ladder li.now { color: var(--st-accent-ink); background: var(--st-accent); font-weight: 700; box-shadow: 0 0 16px var(--st-glow); }
.warp-stage-ladder li.hostile { background: #ef6a7a; color: #2a0710; }
.warp-stage-date { display: grid; grid-template-columns: minmax(280px, 340px) minmax(0, 1fr); gap: 26px; }
.warp-stage-heart { display: flex; flex-direction: column; align-items: center; gap: 12px; min-height: 0; overflow-y: auto; padding: 4px 4px 8px; scrollbar-width: thin; }
.warp-stage-portrait { position: relative; width: min(220px, 60vw); aspect-ratio: 1; flex: none; display: grid; place-items: center; }
.warp-stage-portrait svg { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
.warp-stage-portrait circle { fill: none; stroke-width: 4; stroke-linecap: round; transition: stroke-dasharray 700ms ease; }
.warp-stage-portrait circle.track { stroke: rgba(255, 255, 255, .08); }
.warp-stage-portrait circle.track.thin { stroke-width: 2.5; }
.warp-stage-portrait circle.love { stroke: #ff7ea6; filter: drop-shadow(0 0 3px rgba(255, 126, 166, .7)); }
.warp-stage-portrait circle.fear { stroke: #9b7bff; stroke-width: 2.5; }
.warp-stage-initial { width: 72%; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; font-family: var(--st-display); font-size: clamp(48px, 7vw, 76px); font-weight: 600; color: #fff;
  background: radial-gradient(circle at 35% 30%, hsl(var(--warp-hue, 330) 60% 62%), hsl(var(--warp-hue, 330) 50% 30%) 70%);
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, .15), 0 20px 50px rgba(0, 0, 0, .5); text-shadow: 0 2px 10px rgba(0, 0, 0, .35); }
.warp-stage-face { position: absolute; right: 6%; bottom: 8%; font-size: clamp(30px, 4vw, 40px); line-height: 1; filter: drop-shadow(0 4px 8px rgba(0, 0, 0, .5)); animation: warp-stage-idle 3.6s ease-in-out infinite; }
.warp-stage-mood { font-family: var(--st-display); font-size: 18px; font-style: italic; color: var(--st-muted); margin-top: -4px; }
.warp-stage-reaction { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 14px; background: var(--st-panel); border: 1px solid var(--st-line); }
.warp-stage-reaction div { display: flex; flex-direction: column; min-width: 0; }
.warp-stage-reaction b { font-size: 14px; }
.warp-stage-reaction span:not(.warp-stage-reaction-icon) { font-size: 12.5px; color: var(--st-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.warp-stage-reaction-icon { font-size: 20px; font-weight: 800; min-width: 34px; text-align: center; }
.warp-stage-reaction.quiet .warp-stage-reaction-icon { color: var(--st-dim); }
.warp-stage-reaction.fresh { animation: warp-stage-pop 620ms cubic-bezier(.2, 1.4, .4, 1) both; }
.warp-stage-reaction.fresh.warp-tone-good { box-shadow: 0 0 34px rgba(92, 201, 167, .25); border-color: rgba(92, 201, 167, .5); }
.warp-stage-reaction.fresh.warp-tone-bad, .warp-stage-reaction.fresh.warp-tone-warn { box-shadow: 0 0 34px rgba(239, 106, 122, .22); border-color: rgba(239, 106, 122, .45); }
@keyframes warp-stage-pop { from { opacity: 0; transform: scale(.86) translateY(8px); } to { opacity: 1; transform: none; } }
.warp-stage-gauges { width: 100%; display: flex; flex-direction: column; gap: 7px; padding: 12px 14px; border-radius: 14px; background: var(--st-panel); border: 1px solid var(--st-line); }
.warp-stage .warp-date-meter { grid-template-columns: 64px 1fr auto; font-size: 12px; }
.warp-stage .warp-date-meter-track { height: 6px; background: rgba(255, 255, 255, .08); }
.warp-stage .warp-date-meter.love .warp-date-meter-track > div { background: linear-gradient(90deg, #ff5f8f, #ffb0c8); }
.warp-stage .warp-date-meter.fear .warp-date-meter-track > div { background: linear-gradient(90deg, #7a5cff, #b9a6ff); }
.warp-stage-streak { font-weight: 700; font-size: 13px; color: var(--st-muted); }
.warp-stage-streak.hot { color: #ffb45c; text-shadow: 0 0 12px rgba(255, 150, 60, .6); }
.warp-stage-outing { width: 100%; display: flex; flex-direction: column; gap: 8px; padding: 10px 14px; border-radius: 14px; border: 1px dashed var(--st-line); }
.warp-stage-outing.plan { color: var(--st-muted); }
.warp-stage-beats { display: flex; gap: 6px; justify-content: center; }
.warp-stage-beats i { width: 26px; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, .1); }
.warp-stage-beats i.past { background: rgba(255, 126, 166, .55); }
.warp-stage-beats i.now { background: var(--st-accent); box-shadow: 0 0 10px var(--st-glow); }
.warp-stage-deck { display: flex; flex-direction: column; gap: 16px; min-height: 0; overflow-y: auto; padding: 4px 6px 8px 0; scrollbar-width: thin; }
.warp-stage-group { display: flex; flex-direction: column; gap: 8px; }
.warp-stage-moves { display: flex; flex-wrap: wrap; gap: 8px; }
.warp-stage-move { cursor: pointer; display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 999px; border: 1px solid var(--st-line); background: var(--st-panel); font-weight: 600; font-size: 13.5px; transition: border-color 120ms, background 120ms, transform 120ms; }
.warp-stage-move:hover:not(:disabled) { border-color: var(--st-accent); background: rgba(255, 126, 166, .1); transform: translateY(-1px); }
.warp-stage-move:disabled { opacity: .45; cursor: not-allowed; }
.warp-stage-move.special { border-color: rgba(255, 126, 166, .55); }
.warp-stage-move.venue, .warp-stage-move.activity { border-color: rgba(233, 180, 79, .45); }
.warp-stage-topics { display: flex; flex-direction: column; gap: 10px; }
.warp-stage-cats { display: flex; flex-wrap: wrap; gap: 6px; }
.warp-stage-cat { cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--st-line); background: transparent; color: var(--st-muted); font-size: 13px; }
.warp-stage-cat small { font-size: 10.5px; padding: 0 6px; border-radius: 999px; background: rgba(255, 255, 255, .1); color: var(--st-ink); }
.warp-stage-cat[aria-selected=true] { color: var(--st-ink); border-color: var(--st-accent); background: rgba(255, 126, 166, .1); }
.warp-stage-topic-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
.warp-stage .warp-date-topic { min-height: 48px; padding: 10px 12px; border-radius: 12px; background: var(--st-panel); border-color: var(--st-line); font-size: 13.5px; transition: border-color 120ms, transform 120ms, background 120ms; }
.warp-stage .warp-date-topic:hover:not(:disabled) { border-color: var(--st-accent); background: rgba(255, 126, 166, .08); transform: translateY(-1px); }
.warp-stage-knows { display: flex; flex-direction: column; gap: 6px; padding-top: 12px; border-top: 1px solid var(--st-line); }

/* the run or date is over; the scene waits behind this until the player heads back */
.warp-stage-ended { position: absolute; inset: 0; z-index: 3; display: grid; place-items: center; background: rgba(0, 0, 0, .55); backdrop-filter: blur(3px); animation: warp-stage-in 380ms ease both; }
.warp-stage-ended > div { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 26px 34px; border-radius: 18px; background: var(--st-panel); border: 1px solid var(--st-line); box-shadow: 0 24px 60px rgba(0, 0, 0, .6); }
.warp-stage-ended .warp-stage-kicker { font-size: 12px; color: var(--st-ink); }

/* ── the story box ── */
.warp-stage-story { position: relative; z-index: 2; margin: 0 24px calc(16px + env(safe-area-inset-bottom, 0px)); display: grid; grid-template-rows: auto minmax(0, 1fr) auto;
  max-height: 36dvh; border-radius: 16px; background: rgba(9, 9, 12, .9); border: 1px solid var(--st-line); box-shadow: 0 -10px 40px rgba(0, 0, 0, .45); backdrop-filter: blur(10px); user-select: text; -webkit-user-select: text; }
.warp-stage[data-mode=date] .warp-stage-story { background: rgba(18, 9, 16, .9); }
.warp-stage-story-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 16px 0; }
.warp-stage-speaker { font-family: var(--st-display); font-weight: 600; font-size: 15px; color: var(--st-accent); letter-spacing: .02em; }
.warp-stage-fold { cursor: pointer; border: none; background: transparent; color: var(--st-muted); font-size: 16px; padding: 2px 6px; border-radius: 6px; transition: transform 160ms; }
.warp-stage-fold:hover { color: var(--st-ink); }
.warp-stage-story-body { min-height: 0; overflow-y: auto; padding: 6px 18px 10px; scrollbar-width: thin; }
.warp-stage-said { font-size: 13px; color: var(--st-muted); margin-bottom: 6px; }
.warp-stage-said:empty { display: none; }
.warp-stage-said span { font-weight: 700; color: var(--st-dim); margin-right: 4px; text-transform: uppercase; font-size: 10.5px; letter-spacing: .12em; }
.warp-stage-text { font-family: var(--st-display); font-size: 16.5px; line-height: 1.62; max-width: 76ch; }
.warp-stage-text p { margin: 0 0 .7em; }
.warp-stage-text p:last-child { margin-bottom: 0; }
.warp-stage-text em { color: var(--st-muted); }
.warp-stage-text .warp-stage-q { color: #fff8ea; }
.warp-stage[data-mode=date] .warp-stage-text .warp-stage-q { color: #ffe3ec; }
.warp-stage-text.streaming > p:last-child::after { content: "▍"; color: var(--st-accent); animation: warp-stage-caret 1s steps(2) infinite; margin-left: 1px; }
@keyframes warp-stage-caret { 50% { opacity: 0; } }
.warp-stage-text:empty::before { content: "The story continues here as you play."; color: var(--st-dim); font-style: italic; font-size: 14px; }
.warp-stage-status { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--st-muted); margin-top: 8px; }
.warp-stage-status:empty { display: none; }
.warp-stage-dots { display: inline-flex; gap: 3px; }
.warp-stage-dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--st-accent); animation: warp-stage-dot 1.1s ease-in-out infinite; }
.warp-stage-dots i:nth-child(2) { animation-delay: .15s; }
.warp-stage-dots i:nth-child(3) { animation-delay: .3s; }
@keyframes warp-stage-dot { 0%, 80%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
.warp-stage-say { display: flex; gap: 8px; align-items: flex-end; padding: 10px 12px 12px; border-top: 1px solid var(--st-line); }
.warp-stage-say textarea { flex: 1; min-height: 40px; max-height: 120px; resize: none; font: inherit; font-size: 14px; line-height: 1.4; color: var(--st-ink); background: rgba(255, 255, 255, .05); border: 1px solid var(--st-line); border-radius: 12px; padding: 10px 12px; outline: none; }
.warp-stage-say textarea:focus { border-color: var(--st-accent); background: rgba(255, 255, 255, .07); }
.warp-stage-say textarea::placeholder { color: var(--st-dim); }
.warp-stage-say .warp-stage-btn { height: 40px; }
.warp-stage[data-view=gate] .warp-stage-story { display: none; }
.warp-stage-story.folded { grid-template-rows: auto 0 auto; }
.warp-stage-story.folded .warp-stage-story-body { display: none; }
.warp-stage-story.folded .warp-stage-fold { transform: rotate(180deg); }

/* ── narrow screens ── */
@media (max-width: 860px) {
  .warp-stage-top { grid-template-columns: minmax(0, 1fr) auto; padding: calc(10px + env(safe-area-inset-top, 0px)) 14px 10px; gap: 10px; }
  .warp-stage-mid { grid-column: 1 / -1; grid-row: 2; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
  .warp-stage-title h1 { font-size: 21px; }
  .warp-stage-main { padding: 12px 14px; overflow-y: auto; }
  .warp-stage-run, .warp-stage-date, .warp-stage-battle { display: flex; flex-direction: column; gap: 16px; }
  .warp-stage-run > *, .warp-stage-date > *, .warp-stage-battle > *, .warp-stage-map > * { flex: none; min-height: auto; }
  .warp-stage-board { container-type: inline-size; flex: none; }
  .warp-stage-board .warp-dg-board { width: min(100cqw, 64dvh); height: auto; aspect-ratio: 1; }
  .warp-stage-side, .warp-stage-heart, .warp-stage-deck { overflow: visible; }
  .warp-stage-portrait { width: min(150px, 42vw); }
  .warp-stage-topic-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
  .warp-stage .warp-date-topic { min-height: 42px; padding: 8px 10px; font-size: 13px; }
  .warp-stage-arena { min-height: 40dvh; }
  .warp-stage-command { overflow: visible; }
  .warp-stage-foe { width: 110px; }
  .warp-stage-foe-img { width: 84px; height: 84px; }
  .warp-stage-foe.boss { width: 160px; }
  .warp-stage-foe.boss .warp-stage-foe-img { width: 132px; height: 132px; }
  .warp-stage-ladder li:not(.now):not(.past) { display: none; }
  .warp-stage-story { margin: 0 8px calc(8px + env(safe-area-inset-bottom, 0px)); max-height: 42dvh; }
  .warp-stage-text { font-size: 15.5px; }
}
@media (prefers-reduced-motion: reduce) {
  .warp-stage, .warp-stage *, .warp-stage *::before, .warp-stage *::after { animation: none !important; transition: none !important; }
}
`;
