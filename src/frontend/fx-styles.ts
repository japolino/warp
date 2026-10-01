// Effect styles: roll stamps in the chat, hearts and frost on dates, hits,
// numbers, flips and banners in the dungeon. Everything is a one-shot
// animation on a class that fx.ts adds and removes.

export const FX_STYLES = `
/* ───────── rolls in the chat: always readable, stamped when they land ───────── */
.warp-chips { position: relative; }
.warp-chips .warp-dice { font-weight: 700; border-width: 1.5px; padding-inline: 10px; }
.warp-chips .warp-dice.warp-tone-good { background: color-mix(in srgb, var(--warp-good) 16%, transparent); border-color: color-mix(in srgb, var(--warp-good) 70%, transparent); }
.warp-chips .warp-dice.warp-tone-warn { background: color-mix(in srgb, var(--warp-warn) 16%, transparent); border-color: color-mix(in srgb, var(--warp-warn) 70%, transparent); }
.warp-chips .warp-dice.warp-tone-bad { background: color-mix(in srgb, var(--warp-bad) 16%, transparent); border-color: color-mix(in srgb, var(--warp-bad) 70%, transparent); }

.warp-fx-pop { animation: warp-fx-pop .9s cubic-bezier(.2,1.6,.4,1) both; }
@keyframes warp-fx-pop { 0% { transform: scale(.6) rotate(-6deg); opacity: .3 } 55% { transform: scale(1.18) rotate(2deg); opacity: 1 } 100% { transform: none } }

.warp-fx-tone-good, .warp-fx-tone-crit { animation: warp-fx-glow-good 1.5s ease-out; border-radius: 10px; }
.warp-fx-tone-warn { animation: warp-fx-glow-warn 1.5s ease-out; border-radius: 10px; }
.warp-fx-tone-bad, .warp-fx-tone-critbad { animation: warp-fx-glow-bad 1.5s ease-out; border-radius: 10px; }
@keyframes warp-fx-glow-good { 0%, 30% { box-shadow: 0 0 0 2px #34b89a, 0 0 22px #34b89a88 } 100% { box-shadow: 0 0 0 0 transparent } }
@keyframes warp-fx-glow-warn { 0%, 30% { box-shadow: 0 0 0 2px #d9a441, 0 0 22px #d9a44188 } 100% { box-shadow: 0 0 0 0 transparent } }
@keyframes warp-fx-glow-bad { 0%, 30% { box-shadow: 0 0 0 2px #e05a7e, 0 0 22px #e05a7e88 } 100% { box-shadow: 0 0 0 0 transparent } }

.warp-fx-stamp {
  position: absolute; z-index: 5; left: 50%; top: -6px; transform: translate(-50%, -100%);
  display: flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; pointer-events: none;
  font-size: 15px; letter-spacing: .02em; white-space: nowrap; color: #fff;
  background: #2a2733; border: 2px solid currentColor; box-shadow: 0 10px 26px rgba(0,0,0,.45);
  animation: warp-fx-stamp-still 2.6s ease both;
}
.warp-fx-stamp.moving { animation: warp-fx-stamp 2.6s cubic-bezier(.2,1.4,.4,1) both; }
.warp-fx-stamp b { text-transform: uppercase; letter-spacing: .08em; }
.warp-fx-stamp .warp-fx-label { font-size: 12px; opacity: .75; }
.warp-fx-stamp.warp-fx-good { color: #5fe0bf; } .warp-fx-stamp.warp-fx-warn { color: #f0c062; }
.warp-fx-stamp.warp-fx-bad { color: #f27c9c; } .warp-fx-stamp.warp-fx-crit { color: #ffe27a; background: linear-gradient(135deg, #3b2f10, #2a2733); }
.warp-fx-stamp.warp-fx-critbad { color: #ff6b6b; background: linear-gradient(135deg, #3b1218, #2a2733); }
.warp-fx-stamp .warp-fx-die { display: inline-block; font-size: 18px; }
.warp-fx-stamp.moving .warp-fx-die { animation: warp-fx-tumble .45s cubic-bezier(.3,.7,.4,1) both; }
@keyframes warp-fx-tumble { 0% { transform: translateY(-14px) rotate(-260deg) scale(.6) } 70% { transform: translateY(2px) rotate(10deg) scale(1.15) } 100% { transform: none } }
@keyframes warp-fx-stamp { 0% { transform: translate(-50%, -60%) scale(2.2); opacity: 0 } 14% { transform: translate(-50%, -100%) scale(.92); opacity: 1 } 22% { transform: translate(-50%, -100%) scale(1.04) } 30%, 78% { transform: translate(-50%, -100%) scale(1); opacity: 1 } 100% { transform: translate(-50%, -150%) scale(.96); opacity: 0 } }
@keyframes warp-fx-stamp-still { 0% { opacity: 0 } 10%, 80% { opacity: 1 } 100% { opacity: 0 } }

/* ───────── particles (hearts, sparks, gold) ───────── */
.warp-fx-particles { position: absolute; left: 50%; top: 45%; width: 0; height: 0; pointer-events: none; z-index: 30; }
.warp-fx-particles > span {
  position: absolute; left: 0; top: 0; font-size: calc(18px * var(--s, 1)); line-height: 1;
  animation: warp-fx-float 1.7s cubic-bezier(.2,.7,.3,1) var(--d, 0s) both; text-shadow: 0 2px 8px rgba(0,0,0,.35);
}
@keyframes warp-fx-float { 0% { transform: translate(-50%, 0) scale(.4) rotate(0); opacity: 0 } 15% { opacity: 1 } 65% { opacity: 1 } 100% { transform: translate(calc(-50% + var(--x)), var(--y)) scale(1) rotate(var(--r)); opacity: 0 } }
.warp-fx-crit > span { color: #ffe27a; } .warp-fx-critbad > span { color: #ff6b6b; } .warp-fx-gold > span { color: #ffd34d; }

/* ───────── dates: warmth, frost, banners ───────── */
.warp-fx-warm::after, .warp-fx-frost::after, .warp-fx-frost-hard::after { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 25; }
.warp-fx-warm::after { animation: warp-fx-warm 1.6s ease-out both; }
.warp-fx-frost::after { animation: warp-fx-frost 1.8s ease-out both; }
.warp-fx-frost-hard::after { animation: warp-fx-frost 1.8s ease-out both; box-shadow: inset 0 0 160px 40px #9fd3ffaa; }
@keyframes warp-fx-warm { 0% { box-shadow: inset 0 0 0 0 transparent } 30% { box-shadow: inset 0 0 160px 30px #ff7eb680 } 100% { box-shadow: inset 0 0 0 0 transparent } }
@keyframes warp-fx-frost { 0% { box-shadow: inset 0 0 0 0 transparent; backdrop-filter: none } 30% { box-shadow: inset 0 0 140px 30px #9fd3ff80 } 100% { box-shadow: inset 0 0 0 0 transparent } }

.warp-fx-banner {
  position: absolute; z-index: 40; left: 50%; top: 22%; transform: translateX(-50%); pointer-events: none;
  display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 12px 34px; border-radius: 16px;
  background: rgba(20, 16, 28, .82); border: 1px solid rgba(255,255,255,.18); color: #fff; text-align: center;
  box-shadow: 0 18px 50px rgba(0,0,0,.5); animation: warp-fx-banner 2.8s cubic-bezier(.2,1.2,.4,1) both;
}
.warp-fx-banner span { font-size: 11px; letter-spacing: .2em; text-transform: uppercase; opacity: .7; }
.warp-fx-banner b { font-size: 26px; }
.warp-fx-banner.up { border-color: #ff9ac6aa; } .warp-fx-banner.up b { color: #ffc2dc; }
.warp-fx-banner.down b { color: #a9c7ff; }
@keyframes warp-fx-banner { 0% { opacity: 0; transform: translate(-50%, 18px) scale(.9) } 14%, 80% { opacity: 1; transform: translate(-50%, 0) scale(1) } 100% { opacity: 0; transform: translate(-50%, -14px) } }

/* ───────── the dungeon: hits, numbers, flips, floors ───────── */
[data-fid] { position: relative; }
.warp-fx-shake { animation: warp-fx-shake .45s ease both; }
.warp-fx-shake-hard { animation: warp-fx-shake-hard .55s ease both; }
@keyframes warp-fx-shake { 0%, 100% { transform: none } 20% { transform: translateX(-6px) rotate(-1deg) } 40% { transform: translateX(5px) rotate(1deg) } 60% { transform: translateX(-3px) } 80% { transform: translateX(2px) } }
@keyframes warp-fx-shake-hard { 0%, 100% { transform: none } 15% { transform: translate(-10px, 3px) rotate(-3deg) } 30% { transform: translate(9px, -3px) rotate(2deg) } 50% { transform: translate(-6px, 2px) } 70% { transform: translate(4px, -1px) } }
.warp-fx-hurt > :not(.warp-fx-number) { animation: warp-fx-hurt .6s ease-out both; }
@keyframes warp-fx-hurt { 0%, 25% { filter: brightness(2.2) saturate(0) sepia(1) hue-rotate(-50deg) } 100% { filter: none } }
.warp-fx-heal { animation: warp-fx-heal-ring .9s ease-out both; }
.warp-fx-heal > :not(.warp-fx-number) { animation: warp-fx-heal .9s ease-out both; }
@keyframes warp-fx-heal-ring { 0%, 30% { box-shadow: 0 0 0 2px #5fe0bf, 0 0 22px #5fe0bf88 } 100% { box-shadow: none } }
@keyframes warp-fx-heal { 0%, 30% { filter: brightness(1.4) drop-shadow(0 0 12px #5fe0bf) } 100% { filter: none } }
.warp-fx-ko { animation: warp-fx-ko 1.1s ease-in both; }
@keyframes warp-fx-ko { 0% { filter: none } 40% { filter: brightness(3) saturate(0) } 100% { filter: grayscale(1) brightness(.5); opacity: .55; transform: translateY(6px) scale(.96) } }

.warp-fx-number {
  position: absolute; top: 18%; z-index: 20; transform: translateX(-50%); pointer-events: none;
  font: 800 22px/1 system-ui, sans-serif; color: #fff; -webkit-text-stroke: 1px rgba(0,0,0,.6); text-shadow: 0 3px 0 rgba(0,0,0,.45);
  animation: warp-fx-number 1.3s cubic-bezier(.2,1.4,.4,1) both;
}
.warp-fx-number small { display: block; font-size: 11px; letter-spacing: .15em; color: #ffe27a; }
.warp-fx-number.dmg { color: #fff6d6; } .warp-fx-number.hurt { color: #ff8a8a; } .warp-fx-number.heal { color: #7af0c8; } .warp-fx-number.gold { color: #ffd34d; font-size: 16px; }
.warp-fx-number.crit { font-size: 32px; color: #ffe27a; }
@keyframes warp-fx-number { 0% { opacity: 0; transform: translate(-50%, 10px) scale(.5) } 18% { opacity: 1; transform: translate(-50%, -14px) scale(1.25) } 32% { opacity: 1; transform: translate(-50%, -18px) scale(1) } 72% { opacity: 1; transform: translate(-50%, -34px) scale(1) } 100% { opacity: 0; transform: translate(-50%, -52px) } }

.warp-fx-flash { animation: warp-fx-flash .4s ease-out both; }
@keyframes warp-fx-flash { 0% { box-shadow: inset 0 0 0 999px rgba(255,255,255,.55) } 100% { box-shadow: inset 0 0 0 999px rgba(255,255,255,0) } }
.warp-fx-boss { animation: warp-fx-boss .9s ease-out both; }
@keyframes warp-fx-boss { 0%, 40% { box-shadow: inset 0 0 120px 30px rgba(220, 30, 60, .6) } 100% { box-shadow: inset 0 0 0 0 transparent } }

.warp-fx-flip { animation: warp-fx-flip .55s cubic-bezier(.3,.7,.4,1) var(--fx-delay, 0ms) both; }
@keyframes warp-fx-flip { 0% { transform: perspective(300px) rotateY(90deg) scale(.9); filter: brightness(1.8) } 100% { transform: none; filter: none } }
.warp-fx-glint { animation: warp-fx-glint 1.2s ease-out both; }
@keyframes warp-fx-glint { 0%, 35% { box-shadow: 0 0 0 2px #ffd34d, 0 0 26px #ffd34d99 } 100% { box-shadow: 0 0 0 0 transparent } }

.warp-fx-floor {
  position: absolute; inset: 0; z-index: 50; display: grid; place-content: center; text-align: center; pointer-events: none;
  background: #000; color: #fff; animation: warp-fx-floor-still 2.2s ease both;
}
.warp-fx-floor.moving { animation: warp-fx-floor 2.2s ease both; }
.warp-fx-floor span { font-size: 12px; letter-spacing: .4em; text-transform: uppercase; opacity: .7; }
.warp-fx-floor b { font-size: 64px; font-weight: 800; }
@keyframes warp-fx-floor { 0% { opacity: 0 } 18% { opacity: 1 } 70% { opacity: 1 } 100% { opacity: 0 } }
@keyframes warp-fx-floor-still { 0% { opacity: 0 } 15%, 70% { opacity: .92 } 100% { opacity: 0 } }

@media (prefers-reduced-motion: reduce) {
  .warp-fx-pop, .warp-fx-shake, .warp-fx-shake-hard, .warp-fx-flip, .warp-fx-number, .warp-fx-particles > span { animation: none !important; }
}
`;
