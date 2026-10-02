// The stage's look: a dungeon run or a date, full screen, with a visual-novel story
// box. One layout, three looks that match the arcade's (data-style on .warp-stage):
//   medieval — torch-lit flagstones, parchment panels, an oak and gold frame, Cinzel and Garamond
//   modern   — warm paper, white cards and ink, Manrope and Inter (the default)
//   scifi    — a dark instrument panel, hairlines, cut corners, Oxanium and IBM Plex
// Panels remap the ink tokens (--st-ink and friends) to their own, so the same rule
// reads well on a dark backdrop and on a parchment card.

export const STAGE_STYLES = `
.warp-stage {
  /* the backdrop and what's written straight on it */
  --st-bg: #f3f1ec;
  --st-ink: #1d1d1f;
  --st-muted: #6e6e73;
  --st-dim: #9a9aa0;
  --st-line: rgba(29, 29, 31, .1);
  /* panels: cards, the menu, the story box */
  --sp-bg: #ffffff;
  --sp-ink: #1d1d1f;
  --sp-muted: #6e6e73;
  --sp-dim: #9a9aa0;
  --sp-line: rgba(29, 29, 31, .09);
  --sp-field: #f4f3f0;
  --sp-ghost: rgba(255, 255, 255, .5);
  --sp-radius: 14px;
  --sp-edge: 0 0 0 1px rgba(29, 29, 31, .06);
  --sp-shadow: 0 1px 2px rgba(0, 0, 0, .04), 0 10px 28px rgba(30, 25, 15, .07);
  --sp-good: #1f9d55; --sp-warn: #b97a06; --sp-bad: #d93a3a;
  --st-accent: #ff5a36;
  --st-accent-ink: #ffffff;
  --st-accent-soft: rgba(255, 90, 54, .1);
  --st-primary: #1d1d1f;
  --st-primary-ink: #ffffff;
  --st-gold: #c48a00;
  --st-hp: #e5484d; --st-mp: #2f6fe4; --st-tp: #e8a317; --st-xp: #8e5cf0;
  --st-track: rgba(29, 29, 31, .08);
  --st-love: #e8456b; --st-fear: #7a5cf0;
  --st-display: "Manrope", "Inter", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;
  --st-ui: "Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
  --st-num: "Inter", "Segoe UI", system-ui, sans-serif;
  --st-story: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --st-btn-radius: 999px;
  --warp-good: #1f9d55; --warp-warn: #b97a06; --warp-bad: #d93a3a; --warp-info: #2f6fe4;
  --warp-text: var(--st-ink); --warp-muted: var(--st-muted); --warp-dim: var(--st-dim);
  --warp-fill: rgba(29, 29, 31, .05); --warp-fill-subtle: rgba(29, 29, 31, .03);
  --warp-border: var(--st-line); --warp-accent: var(--st-accent); --warp-accent-fg: var(--st-accent-ink);
  --warp-radius: 10px;
  position: absolute; inset: 0;
  display: grid; grid-template-rows: minmax(0, 1fr) auto;
  background: var(--st-bg); color: var(--st-ink);
  font-family: var(--st-ui); font-size: 14px; line-height: 1.45;
  overflow: hidden; user-select: none; -webkit-user-select: none;
  animation: warp-stage-in 380ms ease both;
}
.warp-stage[data-mode=date] { --st-accent: #e8456b; --st-accent-soft: rgba(232, 69, 107, .1); }

.warp-stage[data-style=medieval] {
  --st-bg: #17110b;
  --st-ink: #ecdfbf;
  --st-muted: #c9b68e;
  --st-dim: #8f7d5c;
  --st-line: rgba(214, 181, 106, .24);
  --sp-bg: var(--st-parch, none) 0 0 / 512px, #eadcbb;
  --sp-ink: #2c1f12;
  --sp-muted: #5e4a30;
  --sp-dim: #8a7452;
  --sp-line: rgba(74, 52, 28, .22);
  --sp-field: rgba(255, 250, 235, .55);
  --sp-ghost: rgba(20, 12, 6, .5);
  --sp-radius: 3px;
  --sp-edge: inset 0 0 0 1px rgba(110, 76, 30, .45), inset 0 0 0 4px rgba(234, 220, 187, 0), inset 0 0 0 5px rgba(180, 138, 44, .4);
  --sp-shadow: 0 12px 30px rgba(0, 0, 0, .5), 0 2px 4px rgba(0, 0, 0, .4);
  --sp-good: #3e6b3a; --sp-warn: #8a5c10; --sp-bad: #8c1f1a;
  --st-accent: #9e2b1f;
  --st-accent-ink: #f6e7c8;
  --st-accent-soft: rgba(158, 43, 31, .1);
  --st-primary: #9e2b1f;
  --st-primary-ink: #f6e7c8;
  --st-gold: #d6b56a;
  --st-hp: #a3342a; --st-mp: #2c4a7a; --st-tp: #b48a2c; --st-xp: #d6b56a;
  --st-track: rgba(74, 52, 28, .14);
  --st-love: #a3342a; --st-fear: #4a3b6b;
  --st-display: "Cinzel", "Trajan Pro", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  --st-ui: "EB Garamond", "Garamond", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  --st-num: "EB Garamond", "Palatino Linotype", Georgia, serif;
  --st-story: "EB Garamond", "Garamond", "Palatino Linotype", Georgia, serif;
  --st-btn-radius: 2px;
  --warp-good: #8fbf7a; --warp-warn: #d9a54a; --warp-bad: #d9786c; --warp-info: #8fa8d6;
  --warp-fill: rgba(236, 223, 191, .08); --warp-fill-subtle: rgba(236, 223, 191, .04);
  font-size: 15.5px;
}
.warp-stage[data-style=medieval][data-mode=date] { --st-bg: #1d0e0e; }

.warp-stage[data-style=scifi] {
  --st-bg: #070c13;
  --st-ink: #d6e2ee;
  --st-muted: #8aa0b6;
  --st-dim: #546a80;
  --st-line: rgba(120, 170, 210, .16);
  --sp-bg: rgba(14, 25, 39, .92);
  --sp-ink: #d6e2ee;
  --sp-muted: #8aa0b6;
  --sp-dim: #546a80;
  --sp-line: rgba(120, 170, 210, .16);
  --sp-field: rgba(120, 170, 210, .06);
  --sp-ghost: rgba(7, 12, 19, .6);
  --sp-radius: 0px;
  --sp-edge: inset 0 0 0 1px rgba(120, 170, 210, .3);
  --sp-shadow: none;
  --sp-good: #5fd3a0; --sp-warn: #f2a541; --sp-bad: #ef6461;
  --st-accent: #5ec8e5;
  --st-accent-ink: #04121a;
  --st-accent-soft: rgba(94, 200, 229, .1);
  --st-primary: #5ec8e5;
  --st-primary-ink: #04121a;
  --st-gold: #f2c14e;
  --st-hp: #5fd3a0; --st-mp: #5ec8e5; --st-tp: #f2a541; --st-xp: #8f9cff;
  --st-track: rgba(120, 170, 210, .1);
  --st-love: #ef6f9a; --st-fear: #8f9cff;
  --st-display: "Oxanium", "Bahnschrift", "DIN Alternate", "Segoe UI", system-ui, sans-serif;
  --st-ui: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
  --st-num: "IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
  --st-story: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
  --st-btn-radius: 0px;
  --warp-good: #5fd3a0; --warp-warn: #f2a541; --warp-bad: #ef6461; --warp-info: #8f9cff;
  --warp-fill: rgba(120, 170, 210, .06); --warp-fill-subtle: rgba(120, 170, 210, .03);
  font-size: 13.5px;
}
.warp-stage[data-style=scifi][data-mode=date] { --st-accent: #ef6f9a; --st-accent-soft: rgba(239, 111, 154, .1); --st-primary: #ef6f9a; --st-primary-ink: #1a0610; }

@keyframes warp-stage-in { from { opacity: 0; transform: scale(1.01); } to { opacity: 1; transform: none; } }
.warp-stage *, .warp-stage *::before, .warp-stage *::after { box-sizing: border-box; }
.warp-stage button { font: inherit; color: inherit; }
.warp-stage-scene { position: relative; display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; grid-row: 1 / -1; grid-column: 1; }
/* the scene runs behind the dialogue box; its content stops above it */
.warp-stage-story { grid-row: 2; grid-column: 1; align-self: end; }
.warp-stage-main { padding-bottom: calc(var(--warp-story-h, 0px) + 18px) !important; }
.warp-stage-dim { color: var(--st-dim); font-size: .9em; }
.warp-stage-kicker { font-size: 10.5px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--st-muted); display: inline-flex; align-items: center; gap: 6px; }
.warp-stage-kicker-icon { width: 16px; height: 16px; }
.warp-stage[data-style=medieval] .warp-stage-kicker { font-family: var(--st-ui); font-style: italic; font-size: 14px; letter-spacing: .02em; text-transform: none; font-weight: 500; color: var(--st-gold); }
.warp-stage[data-style=scifi] .warp-stage-kicker { font-family: var(--st-num); font-size: 10.5px; letter-spacing: .14em; color: var(--st-accent); font-weight: 500; }
.warp-stage[data-style=scifi] .warp-stage-kicker::before { content: "//"; opacity: .6; }
.warp-stage[data-style=medieval] .warp-stage-kicker-icon, .warp-stage[data-style=scifi] .warp-stage-kicker-icon { display: none; }
.warp-stage:is([data-style=medieval], [data-style=scifi]) .warp-stage-emo { display: none; }
.warp-stage .warp-px { image-rendering: pixelated; }

/* ── panels: one material per look ── */
.warp-stage :is(.warp-stage-corner, .warp-stage-stats, .warp-stage-reaction, .warp-dg-member, .warp-stage-here > div, .warp-stage-menu, .warp-stage-gate, .warp-stage-ended > div, .warp-stage-chip, .warp-stage-gauges),
.warp-stage .warp-stage-story {
  --st-ink: var(--sp-ink); --st-muted: var(--sp-muted); --st-dim: var(--sp-dim); --st-line: var(--sp-line);
  --warp-text: var(--sp-ink); --warp-muted: var(--sp-muted); --warp-dim: var(--sp-dim); --warp-border: var(--sp-line);
  --warp-good: var(--sp-good); --warp-warn: var(--sp-warn); --warp-bad: var(--sp-bad);
  background: var(--sp-bg); color: var(--sp-ink); border: 0; border-radius: var(--sp-radius);
  box-shadow: var(--sp-edge), var(--sp-shadow);
}
.warp-stage[data-style=medieval] .warp-stage-kicker:is(.warp-stage-menu-col > *, .warp-stage-gate *) { color: var(--st-accent); }
.warp-stage[data-style=medieval] :is(.warp-stage-gate, .warp-stage-ended > div, .warp-stage-here > div, .warp-stage-menu, .warp-stage-stats, .warp-stage-corner, .warp-stage-reaction, .warp-dg-member, .warp-stage-story) .warp-stage-kicker { color: var(--st-accent); }
/* sci-fi: cut corners, two of them traced in the accent */
.warp-stage[data-style=scifi] :is(.warp-stage-corner, .warp-stage-stats, .warp-stage-reaction, .warp-dg-member, .warp-stage-here > div, .warp-stage-menu, .warp-stage-gate, .warp-stage-ended > div, .warp-stage-gauges, .warp-stage-story) {
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  background:
    linear-gradient(135deg, transparent 6.6px, var(--st-accent) 6.6px 8.2px, transparent 8.2px) top left / 16px 16px no-repeat,
    linear-gradient(315deg, transparent 6.6px, var(--st-accent) 6.6px 8.2px, transparent 8.2px) bottom right / 16px 16px no-repeat,
    var(--sp-bg);
  backdrop-filter: blur(6px);
}

/* ── backdrop ── */
.warp-stage-bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.warp-stage-bg::before, .warp-stage-bg::after { content: ""; position: absolute; inset: 0; }
/* modern: warm paper with a soft wash of light */
.warp-stage-bg::before { background: radial-gradient(ellipse 70% 55% at 50% 0%, rgba(255, 255, 255, .9), transparent 70%); }
.warp-stage[data-mode=date] .warp-stage-bg::before {
  background:
    radial-gradient(circle at 15% 20%, hsl(var(--warp-hue, 340) 80% 86% / .55), transparent 38%),
    radial-gradient(circle at 85% 75%, hsl(calc(var(--warp-hue, 340) + 40) 70% 86% / .5), transparent 40%),
    #f7f2ee; }
/* medieval: flagstones in torchlight; a date is by candlelight on dark oak */
.warp-stage[data-style=medieval] .warp-stage-bg::before { background: linear-gradient(rgba(22, 15, 8, .8), rgba(16, 11, 6, .88)), var(--st-stone, none) 0 0 / 160px, #2a2219; }
.warp-stage[data-style=medieval] .warp-stage-bg::after { background: radial-gradient(ellipse 55% 45% at 50% 40%, rgba(230, 150, 60, .16), transparent 70%), radial-gradient(ellipse at center, transparent 40%, rgba(5, 3, 1, .85) 100%); }
.warp-stage[data-style=medieval][data-mode=date] .warp-stage-bg::before { background: linear-gradient(rgba(40, 12, 12, .72), rgba(20, 8, 8, .86)), var(--st-wood, none) 0 0 / 256px, #3b1d14; }
.warp-stage[data-style=medieval][data-mode=date] .warp-stage-bg::after { background: radial-gradient(ellipse 40% 35% at 50% 42%, rgba(255, 180, 90, .2), transparent 70%), radial-gradient(ellipse at center, transparent 40%, rgba(8, 2, 2, .85) 100%); }
/* sci-fi: a dark panel with a faint grid, a cool light from above */
.warp-stage[data-style=scifi] .warp-stage-bg::before { background: radial-gradient(ellipse 60% 40% at 50% 0%, rgba(94, 200, 229, .09), transparent 70%), var(--st-panel-tex, none) 0 0 / 256px, #070c13; }
.warp-stage[data-style=scifi] .warp-stage-bg::after { background: radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, .7) 100%); }
.warp-stage[data-style=scifi][data-mode=date] .warp-stage-bg::before { background: radial-gradient(circle at 20% 25%, hsl(var(--warp-hue, 330) 70% 50% / .12), transparent 40%), radial-gradient(circle at 80% 70%, rgba(94, 200, 229, .08), transparent 40%), var(--st-panel-tex, none) 0 0 / 256px, #070c13; }
/* the date's picture: the place, with them in the middle */
.warp-stage-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; animation: warp-stage-in 600ms ease both; }
.warp-stage-bg.has-photo::before { display: none; }
.warp-stage .warp-stage-bg.has-photo::after { background: linear-gradient(90deg, rgba(0, 0, 0, .35), transparent 28%, transparent 68%, rgba(0, 0, 0, .4)), linear-gradient(0deg, rgba(0, 0, 0, .45), transparent 38%); }
.warp-stage:has(.has-photo) .warp-stage-menu-col > .warp-stage-kicker { color: #fff; text-shadow: 0 1px 4px rgba(0, 0, 0, .7); }
.warp-stage:has(.has-photo) .warp-stage-top { --st-ink: #fff; --st-muted: rgba(255, 255, 255, .8); --st-dim: rgba(255, 255, 255, .6); --st-line: rgba(255, 255, 255, .25); color: #fff; text-shadow: 0 1px 6px rgba(0, 0, 0, .5); }

/* ── top bar ── */
.warp-stage-top { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 18px;
  padding: calc(14px + env(safe-area-inset-top, 0px)) 24px 14px; border-bottom: 1px solid var(--st-line); }
.warp-stage-title { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.warp-stage-title h1 { margin: 0; font-family: var(--st-display); font-weight: 800; font-size: 26px; line-height: 1.1; letter-spacing: -.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.warp-stage-mid { display: flex; align-items: center; gap: 18px; min-width: 0; flex-wrap: wrap; }
.warp-stage-actions { display: flex; align-items: center; gap: 8px; }
.warp-stage-actions:has(.warp-stage-painting) { flex-wrap: wrap; justify-content: flex-end; max-width: min(320px, 35vw); }
.warp-stage-painting { overflow-wrap: anywhere; min-width: 0; }
.warp-stage[data-style=medieval] .warp-stage-top { border-bottom: 0; background: linear-gradient(rgba(30, 18, 8, .55), rgba(20, 12, 5, .7)), var(--st-wood, none) 0 0 / 256px, #3b2414;
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, .6), 0 1px 0 #b48a2c, 0 2px 0 #4a2e16, 0 3px 0 rgba(180, 138, 44, .55), 0 12px 24px rgba(0, 0, 0, .45); }
.warp-stage[data-style=medieval] .warp-stage-title h1 { font-weight: 700; letter-spacing: .07em; font-size: 25px; color: #ecdfbf; text-shadow: 0 2px 0 rgba(0, 0, 0, .5); }
.warp-stage[data-style=scifi] .warp-stage-top { background: linear-gradient(180deg, rgba(10, 18, 28, .92), rgba(10, 18, 28, .7)); border-bottom-color: rgba(94, 200, 229, .3); }
.warp-stage[data-style=scifi] .warp-stage-title h1 { font-weight: 600; text-transform: uppercase; letter-spacing: .1em; font-size: 22px; }

/* buttons */
.warp-stage :is(.warp-stage-btn, .warp-btn) { cursor: pointer; border-radius: var(--st-btn-radius); padding: 7px 14px; border: 1px solid var(--st-line); background: transparent; color: var(--st-ink); font-weight: 600; font-size: 13px; transition: background 120ms, border-color 120ms, transform 120ms, color 120ms; white-space: nowrap; }
.warp-stage :is(.warp-stage-btn, .warp-btn):hover:not(:disabled) { border-color: var(--st-ink); }
.warp-stage :is(.warp-stage-btn, .warp-btn):active:not(:disabled) { transform: translateY(1px); }
.warp-stage :is(.warp-stage-btn, .warp-btn):disabled { opacity: .45; cursor: not-allowed; }
.warp-stage .warp-stage-btn.ghost { border-color: transparent; color: var(--st-muted); }
.warp-stage .warp-stage-btn.ghost:hover:not(:disabled) { color: var(--st-ink); border-color: var(--st-line); }
.warp-stage :is(.warp-stage-btn.primary, .warp-btn-primary) { background: var(--st-primary); color: var(--st-primary-ink); border-color: transparent; }
.warp-stage :is(.warp-stage-btn.primary, .warp-btn-primary):hover:not(:disabled) { filter: brightness(1.12); border-color: transparent; }
.warp-stage .warp-stage-btn.small, .warp-stage .warp-btn.warp-mini { padding: 3px 10px; font-size: 12px; }
.warp-stage :is(.warp-stage-btn, .warp-btn, .warp-stage-cmd, .warp-stage-bar, .warp-dg-tile, .warp-stage-chip):focus-visible { outline: 2px solid var(--st-accent); outline-offset: 2px; }
.warp-stage[data-style=modern] :is(.warp-stage-btn, .warp-btn):not(.primary):not(.warp-btn-primary):not(.ghost) { background: #fff; color: var(--sp-ink); text-shadow: none; border-color: rgba(29, 29, 31, .12); box-shadow: 0 1px 2px rgba(0, 0, 0, .05); }
.warp-stage[data-style=medieval] :is(.warp-stage-btn, .warp-btn) { font-family: var(--st-display); font-size: 12px; letter-spacing: .12em; text-transform: uppercase; font-weight: 700; padding: 8px 14px; }
.warp-stage[data-style=medieval] :is(.warp-stage-btn, .warp-btn):not(.primary):not(.warp-btn-primary) { border-color: rgba(180, 138, 44, .55); }
.warp-stage[data-style=medieval] :is(.warp-stage-btn.primary, .warp-btn-primary) { border: 1px solid #5e140c; box-shadow: inset 0 0 0 2px var(--st-primary), inset 0 0 0 3px rgba(233, 196, 106, .7), 0 2px 4px rgba(0, 0, 0, .35); }
.warp-stage[data-style=medieval] .warp-stage-btn.ghost { border-color: transparent; text-transform: none; font-family: var(--st-ui); font-style: italic; font-size: 15px; letter-spacing: 0; font-weight: 500; }
.warp-stage[data-style=scifi] :is(.warp-stage-btn, .warp-btn) { font-family: var(--st-num); font-size: 11.5px; letter-spacing: .12em; text-transform: uppercase; font-weight: 500; border-color: rgba(94, 200, 229, .4); color: var(--st-accent);
  clip-path: polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px); }
.warp-stage[data-style=scifi] :is(.warp-stage-btn, .warp-btn):hover:not(:disabled) { background: var(--st-accent-soft); border-color: var(--st-accent); }
.warp-stage[data-style=scifi] :is(.warp-stage-btn.primary, .warp-btn-primary) { color: var(--st-primary-ink); font-weight: 600; }
.warp-stage[data-style=scifi] .warp-stage-btn.ghost { color: var(--st-muted); border-color: transparent; }

/* dungeon: depth, level, gold */
.warp-stage-depth { display: flex; flex-direction: column; align-items: center; gap: 5px; }
.warp-stage-depth-n { font-family: var(--st-display); font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
.warp-stage-of { color: var(--st-dim); font-size: 13px; font-weight: 500; }
.warp-stage-pips { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; max-width: 240px; }
.warp-stage-pips i { width: 7px; height: 7px; border-radius: 50%; background: var(--st-track); }
.warp-stage-pips i.past { background: var(--st-muted); }
.warp-stage-pips i.now { background: var(--st-accent); transform: scale(1.3); }
.warp-stage-pips i.last { box-shadow: 0 0 0 1.5px var(--warp-bad); }
.warp-stage[data-style=medieval] .warp-stage-pips i { border-radius: 0; transform: rotate(45deg); background: transparent; box-shadow: inset 0 0 0 1px rgba(214, 181, 106, .5); }
.warp-stage[data-style=medieval] .warp-stage-pips i.past { background: rgba(214, 181, 106, .5); }
.warp-stage[data-style=medieval] .warp-stage-pips i.now { background: #e9c46a; transform: rotate(45deg) scale(1.3); }
.warp-stage[data-style=medieval] .warp-stage-pips i.last { box-shadow: inset 0 0 0 1px #d9786c; }
.warp-stage[data-style=scifi] .warp-stage-pips { gap: 2px; }
.warp-stage[data-style=scifi] .warp-stage-pips i { border-radius: 0; width: 10px; height: 4px; }
.warp-stage[data-style=scifi] .warp-stage-pips i.now { transform: none; box-shadow: 0 0 6px var(--st-accent); }
.warp-stage-endless { font-size: 16px; color: var(--st-muted); }
.warp-stage-boss { color: var(--warp-bad); font-size: 14px; }
.warp-stage-purse { display: flex; align-items: center; gap: 10px; font-variant-numeric: tabular-nums; font-family: var(--st-num); }
.warp-stage-lv { font-weight: 700; font-size: 13px; letter-spacing: .04em; }
.warp-stage-xp { width: 90px; height: 5px; border-radius: 3px; background: var(--st-track); overflow: hidden; }
.warp-stage-xp > span { display: block; height: 100%; background: var(--st-xp); transition: width 400ms ease; }
.warp-stage-gold { display: inline-flex; align-items: center; gap: 4px; font-weight: 700; color: var(--st-gold); }
.warp-stage-coin { width: 20px; height: 20px; }
.warp-stage[data-style=medieval] .warp-stage-xp { border-radius: 0; background: rgba(0, 0, 0, .4); box-shadow: 0 0 0 1px rgba(214, 181, 106, .5); }
.warp-stage[data-style=medieval] .warp-stage-lv, .warp-stage[data-style=medieval] .warp-stage-depth-n { font-family: var(--st-display); color: #ecdfbf; }
.warp-stage[data-style=scifi] .warp-stage-xp { border-radius: 0; }

/* bars (HP, MP, TP) */
.warp-stage .warp-dg-bar { font-size: 11px; grid-template-columns: 22px 1fr 34px; font-family: var(--st-num); }
.warp-stage .warp-dg-bar-l { color: var(--st-dim); font-weight: 600; letter-spacing: .04em; }
.warp-stage .warp-dg-bar-track { height: 6px; background: var(--st-track); border-radius: 3px; }
.warp-stage .warp-dg-bar-track > div { border-radius: 3px; }
.warp-stage .warp-dg-bar.hp .warp-dg-bar-track > div { background: var(--st-hp); }
.warp-stage .warp-dg-bar.mp .warp-dg-bar-track > div { background: var(--st-mp); }
.warp-stage .warp-dg-bar.tp .warp-dg-bar-track > div { background: var(--st-tp); }
.warp-stage[data-style=medieval] .warp-dg-bar { font-family: var(--st-display); font-size: 10px; }
.warp-stage[data-style=medieval] .warp-dg-bar-n { font-family: var(--st-num); font-size: 13px; }
.warp-stage[data-style=medieval] .warp-dg-bar-track { border-radius: 0; height: 7px; box-shadow: inset 0 0 0 1px rgba(74, 52, 28, .35); }
.warp-stage[data-style=medieval] .warp-dg-bar-track > div { border-radius: 0; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .2); }
.warp-stage[data-style=scifi] .warp-dg-bar-track { border-radius: 0; height: 5px; }
.warp-stage[data-style=scifi] .warp-dg-bar-track > div { border-radius: 0; -webkit-mask: repeating-linear-gradient(90deg, #000 0 5px, transparent 5px 6px); mask: repeating-linear-gradient(90deg, #000 0 5px, transparent 5px 6px); }

/* ── main ── */
.warp-stage-main { position: relative; z-index: 1; min-height: 0; padding: 18px 24px; }
.warp-stage-run { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 360px); gap: 22px; }
.warp-stage-map { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
.warp-stage-board { flex: 1; min-height: 0; width: 100%; container-type: size; display: grid; place-items: center; }

/* the board */
.warp-stage-board .warp-dg-board { width: min(100cqw, 100cqh); height: min(100cqw, 100cqh); grid-auto-rows: 1fr; gap: 6px; padding: 10px; border-radius: 20px;
  background: #fff; box-shadow: 0 0 0 1px rgba(29, 29, 31, .06), 0 18px 48px rgba(30, 25, 15, .1); }
.warp-stage .warp-dg-tile { aspect-ratio: auto; position: relative; overflow: hidden; border: 0; border-radius: 9px; background: #fbfaf7; box-shadow: inset 0 0 0 1px rgba(29, 29, 31, .07); transition: filter 160ms, transform 160ms, box-shadow 160ms, background 160ms; filter: none; }
.warp-stage .warp-dg-tile::before { content: ""; position: absolute; inset: 0; background: var(--tile) 0 0 / 100% 100%; image-rendering: pixelated; opacity: .1; filter: grayscale(1); }
.warp-stage .warp-dg-tile > * { position: relative; }
.warp-stage .warp-dg-tile.hidden { background: #e6e3dc; box-shadow: none; }
.warp-stage .warp-dg-tile.hidden::before { display: none; }
.warp-stage .warp-dg-tile.reachable { cursor: pointer; outline: 0; box-shadow: inset 0 0 0 2px var(--st-accent); background: #fff5f1; }
.warp-stage .warp-dg-tile.reachable.hidden { background: radial-gradient(circle, rgba(255, 90, 54, .35) 0 3px, transparent 3.5px), #fbe9e3; filter: none; }
.warp-stage .warp-dg-tile.reachable:hover { transform: translateY(-2px); box-shadow: inset 0 0 0 2px var(--st-accent), 0 6px 14px rgba(255, 90, 54, .2); filter: none; }
.warp-stage .warp-dg-tile.here { outline: 0; box-shadow: inset 0 0 0 2.5px var(--st-ink); background: #fff; z-index: 1; }
.warp-stage .warp-dg-tile.here .warp-dg-icon { animation: warp-stage-bob 1.8s ease-in-out infinite; }
.warp-stage .warp-dg-icon { width: 72%; height: 72%; }
.warp-stage .warp-dg-icon.danger { filter: none; }
@keyframes warp-stage-bob { 50% { transform: translateY(-4%); } }
/* medieval: an oak frame with gilt rules; flagstones for the unknown, the floor in candlelight */
.warp-stage[data-style=medieval] .warp-stage-board .warp-dg-board { border-radius: 3px; gap: 3px; padding: 8px; background: #1a120a;
  box-shadow: 0 0 0 2px #b48a2c, 0 0 0 8px #4a2e16, 0 0 0 9px #b48a2c, 0 26px 60px rgba(0, 0, 0, .7); }
.warp-stage[data-style=medieval] .warp-dg-tile { border-radius: 1px; background: var(--tile) 0 0 / 100% 100%; filter: sepia(.4) saturate(.8) brightness(.92); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .55), inset 0 0 14px rgba(0, 0, 0, .45); }
.warp-stage[data-style=medieval] .warp-dg-tile::before { display: none; }
.warp-stage[data-style=medieval] .warp-dg-tile.hidden { background: radial-gradient(ellipse at 30% 22%, rgba(255, 232, 190, .08), transparent 62%), linear-gradient(rgba(30, 22, 13, .6), rgba(18, 13, 8, .74)), var(--st-stone, none) 0 0 / 96px, #2b241b; filter: none;
  box-shadow: inset 1px 1px 0 rgba(255, 238, 205, .12), inset -1px -1px 0 rgba(0, 0, 0, .7), inset 0 0 12px rgba(0, 0, 0, .4); }
.warp-stage[data-style=medieval] .warp-dg-tile.reachable { box-shadow: inset 0 0 0 2px #d6b56a, inset 0 0 18px rgba(233, 196, 106, .35); filter: sepia(.25) brightness(1.02); }
.warp-stage[data-style=medieval] .warp-dg-tile.reachable.hidden { background: radial-gradient(ellipse at 50% 50%, rgba(255, 190, 100, .18), transparent 70%), linear-gradient(rgba(48, 32, 14, .58), rgba(30, 20, 9, .72)), var(--st-stone, none) 0 0 / 96px, #3a2e1e; }
.warp-stage[data-style=medieval] .warp-dg-tile.reachable:hover { box-shadow: inset 0 0 0 2px #e9c46a, inset 0 0 24px rgba(233, 196, 106, .55); filter: sepia(.15) brightness(1.12); }
.warp-stage[data-style=medieval] .warp-dg-tile.here { filter: none; box-shadow: inset 0 0 0 2px #f3e2b0, inset 0 0 26px rgba(255, 200, 110, .55); }
/* sci-fi: a tactical grid; the floor shows as a dim scan, the unknown is blank */
.warp-stage[data-style=scifi] .warp-stage-board .warp-dg-board { border-radius: 0; gap: 3px; padding: 10px; background: rgba(6, 12, 20, .85);
  box-shadow: inset 0 0 0 1px rgba(94, 200, 229, .22), 0 24px 60px rgba(0, 0, 0, .6);
  clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px); }
.warp-stage[data-style=scifi] .warp-dg-tile { border-radius: 0; background: #0f1b29; box-shadow: inset 0 0 0 1px rgba(120, 170, 210, .14); }
.warp-stage[data-style=scifi] .warp-dg-tile::before { opacity: .32; filter: grayscale(1) brightness(.7) contrast(1.2); mix-blend-mode: luminosity; }
.warp-stage[data-style=scifi] .warp-dg-tile.hidden { background: repeating-linear-gradient(135deg, rgba(120, 170, 210, .04) 0 2px, transparent 2px 7px), #0a131e; box-shadow: inset 0 0 0 1px rgba(120, 170, 210, .08); }
.warp-stage[data-style=scifi] .warp-dg-tile.reachable { background: rgba(94, 200, 229, .08); box-shadow: inset 0 0 0 1px rgba(94, 200, 229, .5); }
.warp-stage[data-style=scifi] .warp-dg-tile.reachable::after { content: ""; position: absolute; inset: 3px; pointer-events: none;
  background: linear-gradient(var(--st-accent), var(--st-accent)) top left / 8px 1.5px no-repeat, linear-gradient(var(--st-accent), var(--st-accent)) top left / 1.5px 8px no-repeat,
    linear-gradient(var(--st-accent), var(--st-accent)) bottom right / 8px 1.5px no-repeat, linear-gradient(var(--st-accent), var(--st-accent)) bottom right / 1.5px 8px no-repeat; }
.warp-stage[data-style=scifi] .warp-dg-tile.reachable:hover { background: rgba(94, 200, 229, .16); box-shadow: inset 0 0 0 1px var(--st-accent); }
.warp-stage[data-style=scifi] .warp-dg-tile.here { background: rgba(94, 200, 229, .14); box-shadow: inset 0 0 0 1.5px var(--st-accent), inset 0 0 16px rgba(94, 200, 229, .25); }

.warp-stage-bag { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: center; }
.warp-stage-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px 4px 8px; border-radius: var(--st-btn-radius) !important; cursor: pointer; font-size: 12.5px; }
.warp-stage-chip b { font-family: var(--st-num); }
.warp-stage-chip:hover:not(:disabled) { box-shadow: var(--sp-edge), 0 0 0 1.5px var(--st-accent) !important; }
.warp-stage-chip.muted { cursor: default; color: var(--st-muted); }
.warp-stage[data-style=medieval] .warp-stage-chip { font-size: 14px; padding: 3px 12px 3px 8px; }
.warp-stage[data-style=scifi] .warp-stage-chip { font-family: var(--st-num); font-size: 11.5px; }
.warp-stage-loot { font-size: 12px; color: var(--st-muted); }
.warp-stage[data-style=medieval] .warp-stage-loot { font-style: italic; font-size: 14px; }
.warp-stage-side { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; padding: 2px 4px 2px 2px; scrollbar-width: thin; }
.warp-stage-party { display: flex; flex-direction: column; gap: 8px; }
.warp-stage-party.row { flex-direction: row; flex-wrap: wrap; }
.warp-stage-party.row > * { flex: 1 1 150px; }
.warp-stage .warp-dg-member { padding: 10px 12px; gap: 5px; }
.warp-stage .warp-dg-member-head b { font-family: var(--st-display); font-weight: 700; font-size: 14px; }
.warp-stage[data-style=scifi] .warp-dg-member-head b { font-weight: 600; letter-spacing: .04em; text-transform: uppercase; font-size: 12.5px; }
.warp-stage .warp-dg-member.active { box-shadow: var(--sp-edge), 0 0 0 2px var(--st-accent), var(--sp-shadow); }
.warp-stage .warp-dg-member.targetable { cursor: pointer; box-shadow: var(--sp-edge), 0 0 0 2px var(--warp-good), var(--sp-shadow); animation: warp-stage-pulse 1.4s ease-in-out infinite; }
.warp-stage .warp-dg-member.down { opacity: .5; filter: grayscale(.8); }
.warp-stage .warp-dg-face { width: 36px; height: 36px; }
.warp-stage-here { display: flex; flex-direction: column; gap: 10px; }
.warp-stage-here > div { padding: 14px; }
.warp-stage-here .warp-dg-event p { font-family: var(--st-story); font-size: 15.5px; line-height: 1.55; margin: 0 0 12px; }
.warp-stage-here .warp-dg-event { box-shadow: var(--sp-edge), inset 3px 0 0 var(--st-accent), var(--sp-shadow); }
.warp-stage-here .warp-dg-event.romance { box-shadow: var(--sp-edge), inset 3px 0 0 var(--st-love), var(--sp-shadow); }
.warp-stage[data-style=medieval] .warp-stage-here .warp-dg-event p { font-size: 17px; }
.warp-stage[data-style=medieval] .warp-stage-here .warp-dg-event p::first-letter { float: left; font-family: var(--st-display); font-weight: 700; font-size: 2.6em; line-height: .85; margin: 4px 6px 0 0; color: var(--st-accent); }
.warp-stage[data-style=medieval] .warp-stage-here .warp-dg-event, .warp-stage[data-style=medieval] .warp-stage-here .warp-dg-event.romance { box-shadow: var(--sp-edge), var(--sp-shadow); }
.warp-stage-here .warp-dg-actions { gap: 8px; }
.warp-stage-here h3 { margin: 0 0 8px; font-family: var(--st-display); font-size: 16px; }
.warp-stage-here .warp-dg-ware { padding: 6px 0; border-top: 1px solid var(--st-line); }
.warp-stage-here .warp-dg-ware:first-of-type { border-top: 0; }
.warp-stage .warp-money { color: var(--st-gold); }
.warp-stage :is(.warp-stage-here, .warp-stage-gate) .warp-money { color: var(--warp-warn); }
.warp-stage-log { font-size: 12.5px; color: var(--st-muted); display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--st-line); padding-top: 10px; }
.warp-stage-log > div:first-child { color: var(--st-ink); }
.warp-stage[data-style=medieval] .warp-stage-log { font-size: 14.5px; font-style: italic; border-top: 0; padding-top: 6px; background: linear-gradient(90deg, transparent, rgba(214, 181, 106, .5), transparent) top / 100% 1px no-repeat; }
.warp-stage[data-style=medieval] .warp-stage-log > div:first-child { font-style: normal; }
.warp-stage[data-style=scifi] .warp-stage-log { font-family: var(--st-num); font-size: 11.5px; }
.warp-stage[data-style=scifi] .warp-stage-log > div::before { content: "› "; color: var(--st-accent); }
.warp-stage-menu-note { display: flex; align-items: center; gap: 10px; color: var(--st-muted); }
.warp-stage-menu-note.warn { color: var(--warp-warn); font-weight: 600; }

/* battle */
.warp-stage-battle { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 380px); gap: 18px; }
.warp-stage:has(.warp-stage-battle) .warp-stage-story { max-height: 24dvh; }
.warp-stage-arena { position: relative; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 8px; min-height: 0; border-radius: 20px; padding: 14px 18px;
  background: radial-gradient(ellipse 60% 22% at 50% 78%, rgba(29, 29, 31, .07), transparent 70%), linear-gradient(180deg, #fff 0%, #fbfaf7 62%, #efece5 62.2%, #f4f2ed 100%);
  box-shadow: 0 0 0 1px rgba(29, 29, 31, .06), 0 18px 48px rgba(30, 25, 15, .1); }
.warp-stage-arena.boss { box-shadow: 0 0 0 2px rgba(217, 58, 58, .35), 0 18px 48px rgba(30, 25, 15, .1); }
.warp-stage[data-style=medieval] .warp-stage-arena { border-radius: 3px; background: radial-gradient(ellipse 50% 40% at 50% 45%, rgba(255, 170, 80, .16), transparent 70%), linear-gradient(rgba(20, 14, 8, .55), rgba(10, 7, 4, .8)), var(--st-stone, none) 0 0 / 140px, #2b241b;
  box-shadow: 0 0 0 2px #b48a2c, 0 0 0 8px #4a2e16, 0 0 0 9px #b48a2c, 0 26px 60px rgba(0, 0, 0, .7), inset 0 -70px 80px rgba(0, 0, 0, .5); color: #ecdfbf; }
.warp-stage[data-style=medieval] .warp-stage-arena.boss { box-shadow: 0 0 0 2px #b5413a, 0 0 0 8px #4a2e16, 0 0 0 9px #b5413a, 0 26px 60px rgba(0, 0, 0, .7), inset 0 -70px 80px rgba(0, 0, 0, .5); }
.warp-stage[data-style=scifi] .warp-stage-arena { border-radius: 0; background:
    linear-gradient(180deg, transparent 60%, rgba(94, 200, 229, .05) 60%),
    repeating-linear-gradient(90deg, rgba(94, 200, 229, .07) 0 1px, transparent 1px 48px) bottom / 100% 40% no-repeat,
    rgba(6, 12, 20, .8);
  box-shadow: inset 0 0 0 1px rgba(94, 200, 229, .22); clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px); }
.warp-stage[data-style=scifi] .warp-stage-arena.boss { box-shadow: inset 0 0 0 1px rgba(239, 100, 97, .5); }
.warp-stage-arena-head { display: flex; justify-content: space-between; align-items: baseline; }
.warp-stage-round { font-family: var(--st-display); font-size: 15px; font-weight: 700; color: var(--st-muted); }
.warp-stage[data-style=scifi] .warp-stage-round { font-family: var(--st-num); font-size: 12px; font-weight: 500; letter-spacing: .1em; text-transform: uppercase; }
.warp-stage-foes { display: flex; flex-wrap: wrap; justify-content: center; align-items: flex-end; align-content: center; gap: 22px; min-height: 0; }
.warp-stage-foe { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; width: 150px; padding: 8px; border-radius: 14px; border: 0; background: transparent; }
.warp-stage-foe-glow { position: absolute; left: 18%; right: 18%; bottom: 46px; height: 12px; border-radius: 50%; background: rgba(0, 0, 0, .14); filter: blur(3px); }
.warp-stage[data-style=medieval] .warp-stage-foe-glow, .warp-stage[data-style=scifi] .warp-stage-foe-glow { background: rgba(0, 0, 0, .55); }
.warp-stage-foe-img { position: relative; width: clamp(72px, 15vh, 132px); height: clamp(72px, 15vh, 132px); animation: warp-stage-idle 3.2s ease-in-out infinite; }
.warp-stage-foe:nth-child(2n) .warp-stage-foe-img { animation-delay: -1.1s; }
.warp-stage-foe.elite .warp-stage-foe-img { width: clamp(84px, 18vh, 156px); height: clamp(84px, 18vh, 156px); }
.warp-stage-foe.boss { width: 230px; }
.warp-stage-foe.boss .warp-stage-foe-img { width: clamp(110px, 26vh, 220px); height: clamp(110px, 26vh, 220px); }
.warp-stage-foe.down { opacity: .25; filter: grayscale(1); }
.warp-stage-foe.down .warp-stage-foe-img { animation: none; transform: rotate(-8deg) translateY(8px); }
.warp-stage-foe.targetable { cursor: pointer; box-shadow: 0 0 0 2px var(--warp-bad); background: color-mix(in srgb, var(--warp-bad) 7%, transparent); animation: warp-stage-pulse 1.4s ease-in-out infinite; }
.warp-stage[data-style=medieval] .warp-stage-foe { border-radius: 2px; }
.warp-stage[data-style=scifi] .warp-stage-foe { border-radius: 0; }
.warp-stage[data-style=scifi] .warp-stage-foe.targetable { box-shadow: none; background:
  linear-gradient(var(--warp-bad), var(--warp-bad)) top left / 14px 2px no-repeat, linear-gradient(var(--warp-bad), var(--warp-bad)) top left / 2px 14px no-repeat,
  linear-gradient(var(--warp-bad), var(--warp-bad)) top right / 14px 2px no-repeat, linear-gradient(var(--warp-bad), var(--warp-bad)) top right / 2px 14px no-repeat,
  linear-gradient(var(--warp-bad), var(--warp-bad)) bottom left / 14px 2px no-repeat, linear-gradient(var(--warp-bad), var(--warp-bad)) bottom left / 2px 14px no-repeat,
  linear-gradient(var(--warp-bad), var(--warp-bad)) bottom right / 14px 2px no-repeat, linear-gradient(var(--warp-bad), var(--warp-bad)) bottom right / 2px 14px no-repeat,
  rgba(239, 100, 97, .06); }
.warp-stage-foe-name { font-weight: 700; font-size: 13px; text-align: center; font-family: var(--st-display); }
.warp-stage[data-style=medieval] .warp-stage-foe-name { font-weight: 700; letter-spacing: .05em; color: #ecdfbf; text-shadow: 0 1px 3px #000; }
.warp-stage[data-style=scifi] .warp-stage-foe-name { font-weight: 600; letter-spacing: .08em; text-transform: uppercase; font-size: 11.5px; }
.warp-stage-foe.boss .warp-stage-foe-name { color: var(--warp-bad); }
.warp-stage-foe .warp-dg-bar { width: 100%; }
@keyframes warp-stage-idle { 50% { transform: translateY(-5px); } }
@keyframes warp-stage-pulse { 50% { filter: brightness(1.08); } }
.warp-stage-ticker { display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 13px; color: var(--st-muted); text-align: center; }
.warp-stage-ticker .new { color: var(--st-ink); font-weight: 600; animation: warp-stage-rise 360ms ease both; }
.warp-stage[data-style=medieval] .warp-stage-ticker { font-size: 15px; font-style: italic; color: #c9b68e; }
.warp-stage[data-style=medieval] .warp-stage-ticker .new { color: #ecdfbf; font-style: normal; }
.warp-stage[data-style=scifi] .warp-stage-ticker { font-family: var(--st-num); font-size: 11.5px; }
@keyframes warp-stage-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.warp-stage-command { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; scrollbar-width: thin; padding: 2px; }
.warp-stage-menu { display: flex; flex-direction: column; gap: 8px; padding: 14px; }
.warp-stage-turn { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--st-muted); }
.warp-stage-turn b { color: var(--st-ink); font-family: var(--st-display); }
.warp-stage-turn-face { width: 28px; height: 28px; }
.warp-stage[data-style=medieval] .warp-stage-turn { font-size: 15px; font-style: italic; }
.warp-stage[data-style=medieval] .warp-stage-turn b { font-style: normal; color: var(--st-accent); letter-spacing: .04em; }
.warp-stage-cmds { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 6px; }
.warp-stage-cmds.tail { border-top: 1px solid var(--st-line); padding-top: 8px; }
.warp-stage-cmd { cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--st-line); background: var(--sp-field); text-align: left; font-size: 13px; font-weight: 600; transition: background 120ms, border-color 120ms, transform 120ms, color 120ms; }
.warp-stage-cmd small { font-weight: 500; color: var(--st-dim); font-size: 11px; font-family: var(--st-num); }
.warp-stage-cmd:hover:not(:disabled) { border-color: var(--st-ink); transform: translateY(-1px); }
.warp-stage-cmd:disabled { opacity: .4; cursor: not-allowed; }
.warp-stage-cmd.item span { flex: 1; }
.warp-stage-cmd.flee { color: var(--st-mp); }
/* medieval: entries in a ledger, underlined in ink */
.warp-stage[data-style=medieval] .warp-stage-cmds { gap: 0 14px; }
.warp-stage[data-style=medieval] .warp-stage-cmd { border: 0; border-bottom: 1px dotted rgba(74, 52, 28, .45); border-radius: 0; background: transparent; padding: 6px 2px; font-size: 16px; font-weight: 500; }
.warp-stage[data-style=medieval] .warp-stage-cmd small { font-style: italic; font-size: 13px; font-family: var(--st-ui); }
.warp-stage[data-style=medieval] .warp-stage-cmd:hover:not(:disabled) { color: var(--st-accent); transform: translateX(3px); border-color: var(--st-accent); }
.warp-stage[data-style=medieval] .warp-stage-cmd:hover:not(:disabled) > span::before { content: "❧ "; }
.warp-stage[data-style=medieval] .warp-stage-cmds.tail { border-top: 0; padding-top: 4px; }
.warp-stage[data-style=medieval] .warp-stage-cmds.tail .warp-stage-cmd { font-style: italic; }
/* sci-fi: outlined keys with the cost in mono */
.warp-stage[data-style=scifi] .warp-stage-cmd { border-radius: 0; background: rgba(94, 200, 229, .04); border-color: rgba(94, 200, 229, .22); font-weight: 500; letter-spacing: .02em;
  clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%); }
.warp-stage[data-style=scifi] .warp-stage-cmd:hover:not(:disabled) { border-color: var(--st-accent); background: var(--st-accent-soft); color: #fff; transform: none; }

/* gate */
.warp-stage-gates { display: flex; flex-wrap: wrap; justify-content: center; align-content: safe center; gap: 22px; overflow-y: auto; }
.warp-stage-gate { width: min(460px, 100%); display: flex; flex-direction: column; gap: 12px; padding: 24px; }
.warp-stage-gate-head { display: flex; align-items: center; gap: 14px; }
.warp-stage-gate-icon { width: 56px; height: 56px; }
.warp-stage-gate h2 { margin: 0; font-family: var(--st-display); font-size: 24px; font-weight: 800; letter-spacing: -.01em; }
.warp-stage-gate p { margin: 0; }
.warp-stage-mates { display: flex; flex-direction: column; gap: 6px; }
.warp-stage-mate { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--st-line); cursor: pointer; }
.warp-stage-mate.on { border-color: var(--st-accent); background: var(--st-accent-soft); }
.warp-stage-mate input { accent-color: var(--st-accent); }
.warp-stage-mate-name { font-weight: 600; flex: 1; }
.warp-stage-gate .warp-stage-btn.primary { align-self: flex-start; padding: 10px 18px; font-size: 14px; }
.warp-stage[data-style=medieval] .warp-stage-gate { padding: 30px 30px 26px; }
.warp-stage[data-style=medieval] .warp-stage-gate h2 { font-weight: 700; letter-spacing: .05em; font-size: 23px; }
.warp-stage[data-style=medieval] .warp-stage-gate-icon { filter: sepia(.5); }
.warp-stage[data-style=medieval] .warp-stage-gate > p:not(.warp-stage-dim)::first-letter { float: left; font-family: var(--st-display); font-weight: 700; font-size: 2.7em; line-height: .85; margin: 4px 6px 0 0; color: var(--st-accent); }
.warp-stage[data-style=medieval] .warp-stage-gate .warp-stage-dim { font-style: italic; font-size: 14px; }
.warp-stage[data-style=medieval] .warp-stage-mate { border-radius: 0; border-width: 0 0 1px; border-style: dotted; padding: 6px 2px; }
.warp-stage[data-style=medieval] .warp-stage-mate.on { background: transparent; color: var(--st-accent); }
.warp-stage[data-style=scifi] .warp-stage-gate h2 { font-weight: 600; text-transform: uppercase; letter-spacing: .08em; font-size: 20px; }
.warp-stage[data-style=scifi] .warp-stage-mate { border-radius: 0; }

/* ── date ── */
.warp-stage-ladder { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 2px; }
.warp-stage-ladder li { position: relative; font-size: 11.5px; letter-spacing: .02em; color: var(--st-dim); padding: 4px 10px; border-radius: 999px; white-space: nowrap; font-weight: 600; }
.warp-stage-ladder li + li::before { content: ""; position: absolute; left: -5px; top: 50%; width: 8px; height: 1px; background: var(--st-line); }
.warp-stage-ladder li.past { color: var(--st-muted); }
.warp-stage-ladder li.now { color: var(--st-accent-ink); background: var(--st-accent); }
.warp-stage-ladder li.hostile { background: var(--warp-bad); color: #fff; }
.warp-stage[data-style=medieval] .warp-stage-ladder { gap: 4px; }
.warp-stage[data-style=medieval] .warp-stage-ladder li { font-family: var(--st-display); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; border-radius: 0; padding: 4px 12px; }
.warp-stage[data-style=medieval] .warp-stage-ladder li + li::before { content: "·"; width: auto; height: auto; background: none; top: 3px; left: -5px; color: var(--st-dim); }
.warp-stage[data-style=medieval] .warp-stage-ladder li.now { background: var(--st-accent); color: #f6e7c8; clip-path: polygon(0 0, 100% 0, calc(100% - 6px) 50%, 100% 100%, 0 100%, 6px 50%); padding: 4px 16px; }
.warp-stage[data-style=scifi] .warp-stage-ladder li { font-family: var(--st-num); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; border-radius: 0; font-weight: 500; }
.warp-stage[data-style=scifi] .warp-stage-ladder li.now { background: transparent; color: var(--st-accent); box-shadow: inset 0 -2px 0 var(--st-accent); }
.warp-stage-date { display: grid; grid-template-columns: minmax(220px, 280px) minmax(0, 1fr) minmax(260px, 360px); grid-template-rows: minmax(0, 1fr); gap: 20px; align-items: stretch; }
.warp-stage-painting { font-size: 12px; color: var(--st-muted); padding: 4px 10px; border-radius: 999px; border: 1px dashed var(--st-line); animation: warp-stage-dot 1.6s ease-in-out infinite; }
.warp-stage-painting.error { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; border-radius: 8px; animation: none; }
.warp-stage-painting summary { cursor: pointer; }
.warp-stage-picture-error { position: absolute; top: 100%; right: 14px; width: min(360px, calc(100vw - 28px)); max-height: min(180px, 28dvh); overflow-y: auto; padding: 14px; margin-top: 8px; background: var(--sp-bg); color: var(--sp-ink); border-radius: var(--sp-radius); box-shadow: var(--sp-edge), var(--sp-shadow); text-shadow: none; }
.warp-stage-top:has(.warp-stage-painting details[open]) { z-index: 4; }
.warp-stage-left { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; scrollbar-width: thin; padding: 2px; }
.warp-stage-center { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; min-height: 0; }
.warp-stage-corner { display: flex; flex-direction: column; gap: 3px; padding: 12px 14px; }
.warp-stage-clock { font-size: 13px; color: var(--st-muted); }
.warp-stage-clock b { color: var(--st-ink); font-size: 16px; font-variant-numeric: tabular-nums; font-family: var(--st-num); }
.warp-stage-where { font-family: var(--st-display); font-size: 15px; font-weight: 700; }
.warp-stage-where:empty { display: none; }
.warp-stage-cash { font-weight: 700; color: var(--warp-warn); font-variant-numeric: tabular-nums; font-family: var(--st-num); }
.warp-stage[data-style=medieval] .warp-stage-where { font-weight: 700; letter-spacing: .05em; font-size: 14px; }
.warp-stage[data-style=medieval] .warp-stage-clock { font-style: italic; font-size: 15px; }
.warp-stage[data-style=scifi] .warp-stage-where { font-weight: 600; text-transform: uppercase; letter-spacing: .08em; font-size: 13px; }
.warp-stage-stats { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; padding: 12px 14px; font-size: 12.5px; }
.warp-stage-stats dt { color: var(--st-dim); }
.warp-stage-stats dd { margin: 0; display: flex; align-items: center; gap: 8px; justify-content: flex-end; text-align: right; }
.warp-stage-stats dd.love { color: var(--st-love); font-weight: 600; }
.warp-stage-stats dd.hot { color: var(--warp-warn); font-weight: 700; }
.warp-stage[data-style=medieval] .warp-stage-stats { font-size: 15px; gap: 4px 12px; }
.warp-stage[data-style=medieval] .warp-stage-stats dt { font-family: var(--st-display); font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; align-self: center; color: var(--st-muted); }
.warp-stage[data-style=scifi] .warp-stage-stats { font-family: var(--st-num); font-size: 11.5px; }
.warp-stage[data-style=scifi] .warp-stage-stats dt { text-transform: uppercase; letter-spacing: .1em; }
.warp-stage-mini { width: 60px; height: 5px; border-radius: 3px; background: var(--st-track); overflow: hidden; flex: none; }
.warp-stage-mini i { display: block; height: 100%; background: var(--st-love); }
.warp-stage-mini.fear i { background: var(--st-fear); }
.warp-stage[data-style=medieval] .warp-stage-mini, .warp-stage[data-style=scifi] .warp-stage-mini { border-radius: 0; }
.warp-stage-menu-col { display: flex; flex-direction: column; align-items: stretch; gap: 6px; min-height: 0; max-height: 100%; overflow-y: auto; padding: 2px 2px 8px 12px; scrollbar-width: thin; }
.warp-stage-menu-col > .warp-stage-kicker { align-self: flex-end; margin-bottom: 2px; }
/* the menu: modern rows on white */
.warp-stage-bar { cursor: pointer; display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 8px 14px; border: 0; border-radius: 12px; color: var(--sp-ink); font-size: 14px; font-weight: 600; text-align: left;
  background: var(--sp-bg); box-shadow: var(--sp-edge), 0 1px 2px rgba(0, 0, 0, .04); transition: transform 120ms, background 120ms, box-shadow 120ms, color 120ms; }
.warp-stage .warp-stage-bar { color: var(--sp-ink); }
.warp-stage-bar > span:not(.warp-stage-bar-n):not(.warp-stage-bar-react) { flex: 1; min-width: 0; }
.warp-stage-bar:hover:not(:disabled) { transform: translateX(-4px); box-shadow: var(--sp-edge), 0 0 0 1.5px var(--st-accent), 0 6px 16px rgba(0, 0, 0, .08); }
.warp-stage[data-style] .warp-stage-bar:disabled { cursor: not-allowed; background: var(--sp-ghost); color: var(--st-muted); box-shadow: inset 0 0 0 1px var(--st-line); backdrop-filter: blur(4px); }
.warp-stage[data-style] .warp-stage-bar:disabled .warp-stage-bar-n { background: none; color: var(--st-dim); }
.warp-stage-bar-n { display: inline-grid; place-items: center; min-width: 22px; height: 22px; border-radius: 50%; background: rgba(29, 29, 31, .06); color: var(--sp-muted); font-size: 11.5px; font-variant-numeric: tabular-nums; font-family: var(--st-num); }
.warp-stage-bar small { font-size: 11px; padding: 0 7px; border-radius: 999px; background: rgba(29, 29, 31, .06); color: var(--sp-muted); font-family: var(--st-num); }
.warp-stage-bar-react { font-size: 12px; font-weight: 800; }
.warp-stage-bar-react.dim { color: var(--sp-dim); }
.warp-stage-bar.move { box-shadow: var(--sp-edge), inset 3px 0 0 var(--st-gold), 0 1px 2px rgba(0, 0, 0, .04); }
.warp-stage-bar.move.special { box-shadow: var(--sp-edge), inset 3px 0 0 var(--st-love), 0 1px 2px rgba(0, 0, 0, .04); }
.warp-stage-bar.back { min-height: 32px; font-size: 12.5px; color: var(--st-muted); box-shadow: none; background: transparent; }
.warp-stage-bar.back:hover:not(:disabled) { color: var(--st-ink); box-shadow: none; }
.warp-stage-bar .warp-choice-odds { font-family: var(--st-num); }
.warp-stage-bar { --warp-good: var(--sp-good); --warp-warn: var(--sp-warn); --warp-bad: var(--sp-bad); }
/* medieval: parchment slips, numbered in red */
.warp-stage[data-style=medieval] .warp-stage-bar { border-radius: 2px; font-weight: 500; font-size: 16px; padding: 7px 14px; box-shadow: var(--sp-edge), 0 4px 10px rgba(0, 0, 0, .35); }
.warp-stage[data-style=medieval] .warp-stage-bar:hover:not(:disabled) { color: var(--st-accent); box-shadow: var(--sp-edge), 0 0 0 1px #d6b56a, 0 6px 14px rgba(0, 0, 0, .45); }
.warp-stage[data-style=medieval] .warp-stage-bar-n { background: none; border-radius: 0; min-width: 18px; color: var(--st-accent); font-family: var(--st-display); font-weight: 700; font-size: 13px; }
.warp-stage[data-style=medieval] .warp-stage-bar small { background: none; font-style: italic; font-size: 13px; }
.warp-stage[data-style=medieval] .warp-stage-bar.move { font-style: italic; }
.warp-stage[data-style=medieval] .warp-stage-bar.back { background: transparent; box-shadow: none; color: #c9b68e; font-style: italic; }
.warp-stage[data-style=medieval] .warp-stage-bar.back:hover:not(:disabled) { color: #ecdfbf; }
/* sci-fi: dark rows with a cut corner and a two-digit index */
.warp-stage[data-style=scifi] .warp-stage-bar { border-radius: 0; font-weight: 500; font-size: 13.5px; background: rgba(10, 18, 28, .88); box-shadow: inset 0 0 0 1px rgba(120, 170, 210, .2); backdrop-filter: blur(6px);
  clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%); }
.warp-stage[data-style=scifi] .warp-stage-bar:hover:not(:disabled) { transform: translateX(-4px); background: rgba(16, 30, 44, .95); box-shadow: inset 0 0 0 1px var(--st-accent), inset 3px 0 0 var(--st-accent); }
.warp-stage[data-style=scifi] .warp-stage-bar-n { background: none; border-radius: 0; color: var(--st-accent); font-size: 11px; min-width: 18px; }
.warp-stage[data-style=scifi] .warp-stage-bar small { border-radius: 0; background: rgba(120, 170, 210, .1); }
.warp-stage[data-style=scifi] .warp-stage-bar.move { box-shadow: inset 0 0 0 1px rgba(120, 170, 210, .2), inset 3px 0 0 var(--st-gold); }
.warp-stage[data-style=scifi] .warp-stage-bar.move.special { box-shadow: inset 0 0 0 1px rgba(120, 170, 210, .2), inset 3px 0 0 var(--st-love); }
.warp-stage[data-style=scifi] .warp-stage-bar.back { background: transparent; box-shadow: none; clip-path: none; }
.warp-stage[data-mode=date] .warp-stage-story { width: min(900px, calc(100% - 48px)); justify-self: center; margin-left: auto; margin-right: auto; }

/* their portrait: love around the outside, fear inside it */
.warp-stage-portrait { position: relative; width: min(220px, 60vw); aspect-ratio: 1; flex: none; display: grid; place-items: center; }
.warp-stage-portrait svg { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); overflow: visible; }
.warp-stage-portrait circle { fill: none; stroke-width: 4; stroke-linecap: round; transition: stroke-dasharray 700ms ease; }
.warp-stage-portrait circle.deco { stroke: none; }
.warp-stage-portrait circle.track { stroke: var(--st-track); }
.warp-stage-portrait circle.track.thin { stroke-width: 2.5; }
.warp-stage-portrait circle.love { stroke: var(--st-love); }
.warp-stage-portrait circle.fear { stroke: var(--st-fear); stroke-width: 2.5; }
.warp-stage-initial { width: 72%; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; font-family: var(--st-display); font-size: clamp(48px, 7vw, 76px); font-weight: 800; color: #fff;
  background: hsl(var(--warp-hue, 330) 45% 58%); box-shadow: 0 18px 40px hsl(var(--warp-hue, 330) 40% 40% / .25); }
.warp-stage-face { position: absolute; right: 6%; bottom: 8%; font-size: clamp(30px, 4vw, 40px); line-height: 1; filter: drop-shadow(0 4px 8px rgba(0, 0, 0, .2)); animation: warp-stage-idle 3.6s ease-in-out infinite; }
.warp-stage-who { display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; }
.warp-stage-who b { font-family: var(--st-display); font-size: 20px; font-weight: 800; letter-spacing: -.01em; }
.warp-stage-who span { color: var(--st-muted); font-size: 13.5px; }
/* medieval: a gilt cameo */
.warp-stage[data-style=medieval] .warp-stage-portrait circle.deco { stroke: #b48a2c; stroke-width: 1; }
.warp-stage[data-style=medieval] .warp-stage-portrait circle.track { stroke: rgba(214, 181, 106, .25); stroke-width: 3; }
.warp-stage[data-style=medieval] .warp-stage-portrait circle { stroke-linecap: butt; }
.warp-stage[data-style=medieval] .warp-stage-initial { background: var(--st-parch, none) 0 0 / 512px, #eadcbb; color: var(--st-accent); font-weight: 700;
  box-shadow: inset 0 0 0 3px #b48a2c, inset 0 0 0 7px #eadcbb, inset 0 0 0 8px rgba(180, 138, 44, .55), inset 0 0 30px rgba(110, 70, 20, .3), 0 18px 40px rgba(0, 0, 0, .6); }
.warp-stage[data-style=medieval] .warp-stage-face { display: none; }
.warp-stage[data-style=medieval] .warp-stage-who b { font-weight: 700; letter-spacing: .08em; color: #ecdfbf; font-size: 19px; }
.warp-stage[data-style=medieval] .warp-stage-who span { font-style: italic; font-size: 16px; color: #c9b68e; }
/* sci-fi: a comms reticle */
.warp-stage[data-style=scifi] .warp-stage-portrait circle.deco { stroke: rgba(94, 200, 229, .45); stroke-width: 1; stroke-dasharray: 1 5.4; }
.warp-stage[data-style=scifi] .warp-stage-portrait circle.track { stroke: rgba(120, 170, 210, .12); stroke-width: 3; }
.warp-stage[data-style=scifi] .warp-stage-portrait circle { stroke-linecap: butt; }
.warp-stage[data-style=scifi] .warp-stage-initial { background: radial-gradient(circle at 50% 40%, hsl(var(--warp-hue, 330) 50% 22%), #0a121c 75%); color: #eaf4fb; font-weight: 600;
  box-shadow: inset 0 0 0 1px rgba(94, 200, 229, .35), 0 0 0 6px rgba(7, 12, 19, .9), 0 0 0 7px rgba(94, 200, 229, .15); }
.warp-stage[data-style=scifi] .warp-stage-face { display: none; }
.warp-stage[data-style=scifi] .warp-stage-who b { font-weight: 600; text-transform: uppercase; letter-spacing: .12em; font-size: 16px; }
.warp-stage[data-style=scifi] .warp-stage-who span { font-family: var(--st-num); font-size: 11.5px; text-transform: uppercase; letter-spacing: .12em; color: var(--st-accent); }

.warp-stage-reaction { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 14px; }
.warp-stage-reaction div { display: flex; flex-direction: column; min-width: 0; }
.warp-stage-reaction b { font-size: 14px; }
.warp-stage-reaction span:not(.warp-stage-reaction-icon) { font-size: 12.5px; color: var(--st-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.warp-stage-reaction-icon { font-size: 18px; font-weight: 800; min-width: 30px; text-align: center; }
.warp-stage-reaction.fresh { animation: warp-stage-pop 620ms cubic-bezier(.2, 1.4, .4, 1) both; }
.warp-stage-reaction.warp-tone-good { box-shadow: var(--sp-edge), inset 3px 0 0 var(--warp-good), var(--sp-shadow); }
.warp-stage-reaction:is(.warp-tone-bad, .warp-tone-warn) { box-shadow: var(--sp-edge), inset 3px 0 0 var(--warp-bad), var(--sp-shadow); }
.warp-stage[data-style=medieval] .warp-stage-reaction b { font-size: 16px; }
.warp-stage[data-style=medieval] .warp-stage-reaction span:not(.warp-stage-reaction-icon) { font-style: italic; font-size: 14px; }
@keyframes warp-stage-pop { from { opacity: 0; transform: scale(.9) translateY(8px); } to { opacity: 1; transform: none; } }
.warp-stage .warp-date-meter { grid-template-columns: 64px 1fr auto; font-size: 12px; }
.warp-stage .warp-date-meter-track { height: 6px; background: var(--st-track); }
.warp-stage .warp-date-meter.love .warp-date-meter-track > div { background: var(--st-love); }
.warp-stage .warp-date-meter.fear .warp-date-meter-track > div { background: var(--st-fear); }

/* the run or date is over; the scene waits behind this until the player heads back */
.warp-stage-ended { position: absolute; inset: 0; z-index: 3; display: grid; place-items: center; background: rgba(0, 0, 0, .45); backdrop-filter: blur(3px); animation: warp-stage-in 380ms ease both; }
.warp-stage-ended > div { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 28px 36px; }
.warp-stage-ended .warp-stage-kicker { font-size: 12px; color: var(--st-ink); }

/* ── the story box ── */
.warp-stage-story { position: relative; z-index: 2; margin: 0 24px calc(16px + env(safe-area-inset-bottom, 0px)); display: grid; grid-template-rows: auto minmax(0, 1fr) auto;
  max-height: 36dvh; user-select: text; -webkit-user-select: text; }
.warp-stage[data-style=modern] .warp-stage-story { border-radius: 18px; box-shadow: var(--sp-edge), 0 -4px 30px rgba(30, 25, 15, .1); }
.warp-stage-story-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 18px 0; }
.warp-stage-speaker { font-family: var(--st-display); font-weight: 800; font-size: 14px; color: var(--st-accent); letter-spacing: .01em; }
.warp-stage[data-style=medieval] .warp-stage-speaker { font-weight: 700; letter-spacing: .12em; text-transform: uppercase; font-size: 13px; }
.warp-stage[data-style=scifi] .warp-stage-speaker { font-family: var(--st-num); font-weight: 500; letter-spacing: .14em; text-transform: uppercase; font-size: 11px; }
.warp-stage[data-style=scifi] .warp-stage-speaker::before { content: "▸ "; }
.warp-stage-fold { cursor: pointer; border: none; background: transparent; color: var(--st-muted); font-size: 16px; padding: 2px 6px; border-radius: 6px; transition: transform 160ms; }
.warp-stage-fold:hover { color: var(--st-ink); }
.warp-stage-story-body { min-height: 0; overflow-y: auto; padding: 6px 20px 10px; scrollbar-width: thin; }
.warp-stage-said { font-size: 13px; color: var(--st-muted); margin-bottom: 6px; }
.warp-stage-said:empty { display: none; }
.warp-stage-said span { font-weight: 700; color: var(--st-dim); margin-right: 4px; text-transform: uppercase; font-size: 10.5px; letter-spacing: .12em; }
.warp-stage-text { font-family: var(--st-story); font-size: 18px; line-height: 1.6; max-width: 76ch; overflow-wrap: anywhere; }
.warp-stage[data-style=medieval] .warp-stage-text { font-size: 19.5px; line-height: 1.5; }
.warp-stage[data-style=scifi] .warp-stage-text { font-size: 15.5px; line-height: 1.6; }
.warp-stage-text p { margin: 0 0 .7em; }
.warp-stage-text p:last-child { margin-bottom: 0; }
.warp-stage-text em { color: var(--st-muted); }
.warp-stage-text .warp-stage-q { color: var(--st-ink); font-weight: 500; }
.warp-stage[data-style=scifi] .warp-stage-text .warp-stage-q { color: #f2f8fc; }
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
.warp-stage-say textarea { flex: 1; min-width: 0; min-height: 40px; max-height: 120px; resize: none; font: inherit; font-size: 14px; line-height: 1.4; color: var(--st-ink); background: var(--sp-field); border: 1px solid var(--st-line); border-radius: 12px; padding: 10px 12px; outline: none; }
.warp-stage-say textarea:focus { border-color: var(--st-accent); }
.warp-stage-say textarea::placeholder { color: var(--st-dim); }
.warp-stage[data-style=medieval] .warp-stage-say textarea { border-radius: 2px; font-size: 16px; font-style: italic; }
.warp-stage[data-style=scifi] .warp-stage-say textarea { border-radius: 0; font-family: var(--st-num); font-size: 13px; }
.warp-stage-say .warp-stage-btn { height: 40px; flex: none; }
.warp-stage[data-view=gate] .warp-stage-story { display: none; }
.warp-stage-story.narration .warp-stage-text { font-style: italic; color: var(--st-muted); }
.warp-stage-story.more .warp-stage-story-body { cursor: pointer; }
.warp-stage-next { font-size: 12px; color: var(--st-accent); animation: warp-stage-caret 1.4s ease-in-out infinite; }
.warp-stage-story.folded { grid-template-rows: auto 0 auto; }
.warp-stage-story.folded .warp-stage-story-body { display: none; }
.warp-stage-story.folded .warp-stage-fold { transform: rotate(180deg); }

/* Keep the focus ring inside cut corners and above the tile's reachable outline. */
.warp-stage :is(button, textarea, input, summary):focus-visible { outline: 2px solid var(--st-accent); outline-offset: -3px; }
.warp-stage .warp-dg-tile:focus-visible { outline: 3px solid var(--st-accent); outline-offset: -5px; }

/* ── narrow screens ── */
@media (max-width: 860px) {
  .warp-stage-top { grid-template-columns: minmax(0, 1fr) auto; padding: calc(10px + env(safe-area-inset-top, 0px)) 14px 10px; gap: 10px; }
  .warp-stage-mid { grid-column: 1 / -1; grid-row: 2; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
  .warp-stage-actions:has(.warp-stage-painting) { max-width: min(200px, 48vw); }
  .warp-stage-title h1 { font-size: 21px; }
  .warp-stage[data-style=medieval] .warp-stage-title h1 { font-size: 20px; }
  .warp-stage-main { padding: 12px 14px; overflow-y: auto; }
  .warp-stage-run, .warp-stage-date, .warp-stage-battle { display: flex; flex-direction: column; gap: 16px; }
  .warp-stage-date .warp-stage-center { display: none; }
  .warp-stage-left { overflow: visible; }
  .warp-stage-menu-col { max-height: none; overflow: visible; padding-left: 0; }
  .warp-stage[data-mode=date] .warp-stage-story { width: auto; }
  .warp-stage-run > *, .warp-stage-date > *, .warp-stage-battle > *, .warp-stage-map > * { flex: none; min-height: auto; }
  .warp-stage-board { container-type: inline-size; flex: none; }
  .warp-stage-board .warp-dg-board { width: min(100cqw, 64dvh); height: auto; aspect-ratio: 1; }
  .warp-stage[data-style=medieval] .warp-stage-board .warp-dg-board { width: min(calc(100cqw - 20px), 64dvh); }
  .warp-stage-side { overflow: visible; }
  .warp-stage-arena { min-height: 40dvh; }
  .warp-stage-command { overflow: visible; }
  .warp-stage-foe { width: 110px; }
  .warp-stage-foe-img { width: 84px; height: 84px; }
  .warp-stage-foe.boss { width: 160px; }
  .warp-stage-foe.boss .warp-stage-foe-img { width: 132px; height: 132px; }
  .warp-stage-ladder li:not(.now):not(.past) { display: none; }
  .warp-stage-story { margin: 0 8px calc(8px + env(safe-area-inset-bottom, 0px)); max-height: 42dvh; }
  .warp-stage-text, .warp-stage[data-style=medieval] .warp-stage-text { font-size: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .warp-stage, .warp-stage *, .warp-stage *::before, .warp-stage *::after { animation: none !important; transition: none !important; }
}
`;
