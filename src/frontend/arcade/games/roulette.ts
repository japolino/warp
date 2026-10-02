// Roulette: a single-zero wheel and a felt to bet on. Safe bets (red, odd, a dozen)
// pay little; a single number pays 35 to 1. Played as a check, your odds lean on the
// wheel — the briefing says so — and a lucky charm buys a re-spin.

import { clamp, easeOut, type GameDef, type Kit, withMusic } from "../kit.js";
import { glow, lift, paint as texture, unlift } from "../themes.js";
import { backing } from "../synth.js";

const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = (n: number) => (n === 0 ? "green" : REDS.has(n) ? "red" : "black");

/** What a bet pays (to 1) and whether a number wins it. */
export function betWins(bet: string, n: number): number {
  if (bet.startsWith("n:")) return Number(bet.slice(2)) === n ? 35 : -1;
  if (n === 0) return -1;
  switch (bet) {
    case "red": return REDS.has(n) ? 1 : -1;
    case "black": return !REDS.has(n) ? 1 : -1;
    case "odd": return n % 2 ? 1 : -1;
    case "even": return n % 2 ? -1 : 1;
    case "low": return n <= 18 ? 1 : -1;
    case "high": return n >= 19 ? 1 : -1;
    case "d1": return n <= 12 ? 2 : -1;
    case "d2": return n >= 13 && n <= 24 ? 2 : -1;
    case "d3": return n >= 25 ? 2 : -1;
    case "c1": return n % 3 === 1 ? 2 : -1;
    case "c2": return n % 3 === 2 ? 2 : -1;
    case "c3": return n % 3 === 0 ? 2 : -1;
  }
  return -1;
}

const CSS = `
.rl { position: absolute; inset: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr); gap: 18px; padding: 16px; align-items: center;
  background: var(--rl-table); color: var(--rl-ink); font-family: var(--ar-ui); }
.rl-wheel { position: relative; height: 100%; min-height: 0; display: grid; place-items: center; }
.rl-wheel canvas { width: 100%; height: 100%; }
.rl-right { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.rl-board { display: grid; grid-template-columns: .9fr repeat(12, 1fr) 1.15fr; grid-template-rows: repeat(3, var(--rh)) var(--rh) var(--rh); gap: 3px; padding: 8px; border-radius: var(--rl-r, 10px); background: var(--rl-felt); box-shadow: var(--rl-frame); }
.rl .rl-c { position: relative; border: 1px solid var(--rl-cell-line); border-radius: var(--rl-cr, 4px); display: grid; place-items: center; font: 700 clamp(10px, 1.2vw, 14px) var(--rl-font); color: var(--rl-num); background: transparent; cursor: pointer; padding: 0; transition: filter .1s, box-shadow .1s; }
.rl .rl-c:hover { filter: brightness(1.15); box-shadow: inset 0 0 0 2px var(--rl-hi); }
.rl .rl-c.red, .rl .rl-c.out.red { background: var(--rl-red); } .rl-c.black, .rl .rl-c.out.black { background: var(--rl-black); } .rl-c.green { background: var(--rl-green); }
.rl .rl-c.zero { grid-row: 1 / 4; }
.rl .rl-c.out { background: var(--rl-out); font-size: clamp(9px, 1vw, 12px); letter-spacing: .04em; }
.rl .rl-c.win { animation: rl-win .9s ease-in-out 3; box-shadow: 0 0 0 3px var(--rl-hi); z-index: 1; }
@keyframes rl-win { 50% { filter: brightness(1.5); } }
.rl-chipon { position: absolute; right: -4px; top: -6px; min-width: 24px; height: 24px; padding: 0 4px; border-radius: 12px; display: grid; place-items: center; font: 700 10px var(--ar-num); color: #1b1b1b;
  background: var(--rl-chipon); box-shadow: 0 2px 5px rgba(0,0,0,.4); pointer-events: none; z-index: 2; animation: rl-drop .2s ease-out both; }
@keyframes rl-drop { from { transform: translateY(-10px) scale(1.3); opacity: 0; } }
.rl-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.rl .rl-chip { width: 48px; height: 48px; border-radius: 50%; border: 0; cursor: pointer; font: 700 11px var(--ar-num); color: #1b1b1b;
  background: radial-gradient(circle, #fbf8f1 0 36%, transparent 37%), repeating-conic-gradient(var(--chip) 0 22.5deg, #f4efe4 22.5deg 30deg); box-shadow: 0 3px 8px rgba(0,0,0,.35); transition: transform .12s; }
.rl .rl-chip.on { transform: translateY(-5px); box-shadow: 0 0 0 3px var(--rl-hi), 0 8px 16px rgba(0,0,0,.4); }
.rl .rl-btn { padding: 11px 18px; border-radius: var(--rl-pill, 999px); border: 1px solid var(--rl-line); background: var(--rl-plate); color: var(--rl-ink); font: 700 13.5px var(--rl-font); letter-spacing: .08em; text-transform: uppercase; cursor: pointer; }
.rl .rl-btn.main { background: var(--rl-main); color: var(--rl-on-main); border-color: transparent; min-width: 120px; }
.rl .rl-btn:disabled { opacity: .35; cursor: not-allowed; }
.rl .rl-btn.luck { border-color: var(--rl-hi); color: var(--rl-hi); }
.rl-info { font: 500 12.5px var(--ar-num); color: var(--rl-dim); }
.rl-hist { display: flex; gap: 4px; }
.rl-hist span { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font: 700 11px var(--ar-num); color: #fff; }
.rl-hist .red { background: var(--rl-red); } .rl-hist .black { background: var(--rl-black); } .rl-hist .green { background: var(--rl-green); }
@media (max-width: 760px) { .rl { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, .8fr) auto; } }

.rl[data-style=modern] { --rl-table: #f3f1ec; --rl-ink: #1d1d1f; --rl-dim: #6e6e73; --rl-felt: #1f6b4f; --rl-frame: 0 10px 30px rgba(0,0,0,.12); --rl-cell-line: rgba(255,255,255,.4); --rl-num: #fff; --rl-font: var(--ar-display);
  --rl-red: #c8302d; --rl-black: #1d1d1f; --rl-green: #22a06b; --rl-out: rgba(255,255,255,.08); --rl-hi: #f2d27a; --rl-chipon: radial-gradient(circle, #fff 0 45%, #f2d27a 46%);
  --rl-line: rgba(29,29,31,.15); --rl-plate: #fff; --rl-main: #1d1d1f; --rl-on-main: #fff; }
.rl[data-style=medieval] { --rl-table: var(--ar-wood) 0 0 / 256px; --rl-ink: #ecdfbf; --rl-dim: rgba(236,223,191,.7); --rl-felt: #2f4a2a; --rl-r: 2px; --rl-cr: 1px;
  --rl-frame: 0 0 0 2px #b48a2c, 0 0 0 6px #3b2414, 0 0 0 7px rgba(180,138,44,.6), 0 14px 30px rgba(0,0,0,.5); --rl-cell-line: rgba(233,196,106,.35); --rl-num: #f3e7c8; --rl-font: var(--ar-display);
  --rl-red: #8c2a1f; --rl-black: #231a10; --rl-green: #3e6b3a; --rl-out: rgba(0,0,0,.18); --rl-hi: #e9c46a; --rl-chipon: radial-gradient(circle at 35% 30%, #f6dc8a, #b48a2c 70%);
  --rl-line: rgba(214,181,106,.5); --rl-plate: rgba(20,10,2,.5); --rl-main: #9e2b1f; --rl-on-main: #f3e7c8; --rl-pill: 2px; }
.rl[data-style=medieval] .rl-chip { color: #3a2508; font-family: var(--ar-display); background: radial-gradient(circle at 35% 30%, #f6dc8a, #c9952f 55%, #8a6214 100%); box-shadow: 0 3px 6px rgba(20,10,2,.5), inset 0 0 0 3px rgba(107,74,18,.5); }
.rl[data-style=medieval] .rl-chip:nth-child(1) { background: radial-gradient(circle at 35% 30%, #f0b98a, #b5703a 55%, #6b3a14 100%); }
.rl[data-style=medieval] .rl-chip:nth-child(2) { background: radial-gradient(circle at 35% 30%, #f1f1ea, #b8b6ab 55%, #6f6c61 100%); }
.rl[data-style=medieval] .rl-c { box-shadow: inset 0 0 0 1px rgba(0,0,0,.25); }
.rl[data-style=scifi] { --rl-table: radial-gradient(ellipse at 30% 50%, #0f2132, #08111b 60%); --rl-ink: #d6e2ee; --rl-dim: #8ea3b8; --rl-felt: rgba(8, 14, 22, .9); --rl-r: 0; --rl-cr: 0;
  --rl-frame: inset 0 0 0 1px rgba(94,200,229,.4); --rl-cell-line: rgba(120,170,210,.25); --rl-num: #d6e2ee; --rl-font: var(--ar-num);
  --rl-red: rgba(239, 100, 97, .28); --rl-black: rgba(20, 32, 46, .9); --rl-green: rgba(95, 211, 160, .28); --rl-out: transparent; --rl-hi: #5ec8e5; --rl-chipon: #5ec8e5;
  --rl-line: rgba(94,200,229,.35); --rl-plate: rgba(10,17,27,.9); --rl-main: rgba(94,200,229,.16); --rl-on-main: #5ec8e5; --rl-pill: 0; }
.rl[data-style=scifi] .rl-chip { border-radius: 0; width: 54px; height: 38px; background: rgba(10,17,27,.9); color: #d6e2ee; box-shadow: inset 0 0 0 1px rgba(120,170,210,.35); clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px); }
.rl[data-style=scifi] .rl-chip.on { transform: none; color: #5ec8e5; box-shadow: inset 0 0 0 1px #5ec8e5; background: rgba(94,200,229,.14); }
.rl[data-style=scifi] .rl-btn.main { border-color: #5ec8e5; }
.rl[data-style=scifi] .rl-hist span { border-radius: 0; }
`;

export const ROULETTE: GameDef = {
  id: "roulette",
  title: "Roulette",
  howTo: [
    "Pick a chip, then click the felt to bet: numbers pay 35 to 1, dozens and columns 2 to 1, red/black/odd/even 1 to 1.",
    "Spin. Zero beats every outside bet.",
    "Played as a check, your odds lean on the wheel: easy checks land your way more often, hard ones less.",
  ],
  controls: "Click the felt to bet · right-click to take a chip back · Space spins",
  start(kit: Kit) {
    const L = kit.play.level;
    const gamble = kit.play.mode === "gamble";
    const start = gamble ? kit.play.stake! : 100;
    const spins = gamble ? kit.play.rounds ?? 5 : 4;
    const unit = Math.max(1, Math.round(start / 20));
    const denoms = [unit, unit * 2, unit * 5, unit * 10];
    const lean = gamble ? kit.aid("luck") / 200 - Math.max(0, (kit.play.edge ?? 0.027) - 0.027) * 3 : (0.45 - L) * 0.6 + kit.aid("luck") / 100;
    let chip = denoms[1], chips = start, spin = 0, over = false, spinning = false;
    let bets = new Map<string, number>(), lastBets = new Map<string, number>();
    const history: number[] = [];
    let bigWin = 0, rescued = 0;
    let undo: { chips: number; bets: Map<string, number> } | null = null;

    const root = document.createElement("div");
    root.className = "rl";
    root.dataset.style = kit.theme.style;
    const th = kit.theme;
    const cells: string[] = [];
    cells.push(`<button class="rl-c green zero" data-bet="n:0">0</button>`);
    for (let col = 0; col < 12; col++) for (let row = 0; row < 3; row++) {
      const n = col * 3 + (3 - row);
      cells.push(`<button class="rl-c ${colorOf(n)}" style="grid-column:${col + 2};grid-row:${row + 1}" data-bet="n:${n}">${n}</button>`);
    }
    for (let row = 0; row < 3; row++) cells.push(`<button class="rl-c out" style="grid-column:14;grid-row:${row + 1}" data-bet="c${3 - row}">2 to 1</button>`);
    ["1st 12", "2nd 12", "3rd 12"].forEach((t, i) => cells.push(`<button class="rl-c out" style="grid-column:${2 + i * 4} / span 4;grid-row:4" data-bet="d${i + 1}">${t}</button>`));
    [["low", "1–18"], ["even", "Even"], ["red", "◆"], ["black", "◆"], ["odd", "Odd"], ["high", "19–36"]].forEach(([k, t], i) =>
      cells.push(`<button class="rl-c out${k === "red" ? " red" : k === "black" ? " black" : ""}" style="grid-column:${2 + i * 2} / span 2;grid-row:5" data-bet="${k}">${t}</button>`));
    root.innerHTML = `<style>${CSS}</style>
      <div class="rl-wheel"><canvas></canvas></div>
      <div class="rl-right">
        <div class="rl-row"><div class="rl-hist" data-hist></div><span class="rl-info" data-info></span></div>
        <div class="rl-board">${cells.join("")}</div>
        <div class="rl-row" data-chips>${denoms.map((d, i) => `<button class="rl-chip${d === chip ? " on" : ""}" style="--chip:${["#b8352a", "#2f5fa8", "#2a7a4b", "#232323"][i]}" data-chip="${d}">${d}</button>`).join("")}</div>
        <div class="rl-row" data-actions></div>
      </div>`;
    kit.root.appendChild(root);
    const $ = (s: string) => root.querySelector<HTMLElement>(s)!;
    const board = $(".rl-board");
    const size = () => { const r = root.getBoundingClientRect(); board.style.setProperty("--rh", `${Math.max(28, Math.min(54, (r.height - 220) / 5, r.width / 26))}px`); };
    const ro = new ResizeObserver(size); ro.observe(root); size();

    const staked = () => [...bets.values()].reduce((a, b) => a + b, 0);
    const paint = () => {
      board.querySelectorAll(".rl-chipon").forEach((x) => x.remove());
      for (const [k, v] of bets) board.querySelector(`[data-bet="${k}"]`)?.insertAdjacentHTML("beforeend", `<span class="rl-chipon">${v}</span>`);
      $("[data-hist]").innerHTML = history.slice(-8).map((n) => `<span class="${colorOf(n)}">${n}</span>`).join("");
      $("[data-info]").textContent = `Spin ${Math.min(spin + 1, spins)} of ${spins} · ${kit.play.currency ?? ""}${chips} · on the felt ${staked()}`;
      root.querySelectorAll<HTMLElement>("[data-chip]").forEach((b) => { b.classList.toggle("on", Number(b.dataset.chip) === chip); (b as HTMLButtonElement).disabled = Number(b.dataset.chip) > chips; });
      const done = spin >= spins || chips + staked() < denoms[0];
      $("[data-actions]").innerHTML = done && !spinning ? `<button class="rl-btn main" data-leave>Done</button>${undo && kit.lives.left() > 0 ? `<button class="rl-btn luck" data-luck>Lucky re-spin</button>` : ""}` : `<button class="rl-btn main" data-spin ${staked() && !spinning ? "" : "disabled"}>Spin</button>
        <button class="rl-btn" data-clear ${staked() && !spinning ? "" : "disabled"}>Clear</button>
        <button class="rl-btn" data-rebet ${lastBets.size && !staked() && !spinning ? "" : "disabled"}>Rebet</button>
        ${gamble && spin > 0 && !spinning ? `<button class="rl-btn" data-leave>Cash out</button>` : ""}
        ${undo && kit.lives.left() > 0 && !spinning ? `<button class="rl-btn luck" data-luck>Lucky re-spin</button>` : ""}`;
      kit.chips(chips + staked());
      kit.status(`Spin ${Math.min(spin + 1, spins)} of ${spins}\nChips ${chips + staked()}`);
    };
    const place = (bet: string, sign = 1) => {
      if (spinning || over) return;
      if (undo) undo = null;
      if (sign > 0) {
        if (chip > chips) return;
        bets.set(bet, (bets.get(bet) ?? 0) + chip); chips -= chip;
        kit.synth.fx("chip");
      } else {
        const v = bets.get(bet) ?? 0;
        if (!v) return;
        const back = Math.min(v, chip);
        if (v - back <= 0) bets.delete(bet); else bets.set(bet, v - back);
        chips += back;
        kit.synth.fx("click");
      }
      paint();
    };

    // The wheel.
    const cv = root.querySelector("canvas")!;
    const g = cv.getContext("2d")!;
    let wheelAng = 0, ballAng = 0, ballR = 1, anim: { t: number; T: number; from: number; to: number; result: number } | null = null;
    const fit = () => { const r = cv.getBoundingClientRect(); const d = Math.min(2, devicePixelRatio || 1); cv.width = r.width * d; cv.height = r.height * d; g.setTransform(d, 0, 0, d, 0, 0); };
    const ro2 = new ResizeObserver(fit); ro2.observe(cv); fit();
    const drawWheel = () => {
      const r0 = cv.getBoundingClientRect();
      const W = r0.width, H = r0.height, R = Math.min(W, H) * 0.46, cx = W / 2, cy = H / 2;
      g.clearRect(0, 0, W, H);
      const n = ORDER.length, step = (Math.PI * 2) / n;
      const pocket = (num: number) => {
        const col = colorOf(num);
        if (th.style === "medieval") return col === "red" ? "#8c2a1f" : col === "black" ? "#231a10" : "#3e6b3a";
        if (th.style === "modern") return col === "red" ? "#c8302d" : col === "black" ? "#1d1d1f" : "#22a06b";
        return col === "red" ? "#3a1a22" : col === "black" ? "#0d1724" : "#123a2c";
      };
      // Bowl and rim.
      if (th.style === "medieval") {
        g.save(); g.beginPath(); g.arc(cx, cy, R * 1.08, 0, Math.PI * 2); g.clip(); texture(g, "wood", { ...th, wood: "#5a3a20" }, cx - R * 1.1, cy - R * 1.1, R * 2.2, R * 2.2); g.restore();
        g.strokeStyle = "#2a1a0d"; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, R * 1.08, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = "#c9952f"; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R * 0.96, 0, Math.PI * 2); g.stroke();
        // Brass studs round the rim.
        for (let k = 0; k < 24; k++) { const a = (k * Math.PI) / 12; g.fillStyle = "#c9952f"; g.beginPath(); g.arc(cx + Math.cos(a) * R * 1.02, cy + Math.sin(a) * R * 1.02, Math.max(2, R * 0.018), 0, Math.PI * 2); g.fill(); }
      } else if (th.style === "modern") {
        lift(g, th, 3); g.fillStyle = "#2b2b2e"; g.beginPath(); g.arc(cx, cy, R * 1.08, 0, Math.PI * 2); g.fill(); unlift(g);
        const rim = g.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.08);
        rim.addColorStop(0, "#3a3a3e"); rim.addColorStop(1, "#1d1d1f");
        g.fillStyle = rim; g.beginPath(); g.arc(cx, cy, R * 1.06, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = "#08111b"; g.beginPath(); g.arc(cx, cy, R * 1.08, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "rgba(94, 200, 229, .5)"; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R * 1.06, 0, Math.PI * 2); g.stroke();
        g.setLineDash([2, 6]); g.beginPath(); g.arc(cx, cy, R * 0.97, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      }
      // Pockets and numbers.
      for (let i = 0; i < n; i++) {
        const a = wheelAng + i * step - Math.PI / 2;
        g.fillStyle = pocket(ORDER[i]);
        g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R * 0.9, a - step / 2, a + step / 2); g.closePath(); g.fill();
        g.save(); g.translate(cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8); g.rotate(a + Math.PI / 2);
        g.fillStyle = th.style === "medieval" ? "#f3e7c8" : th.style === "scifi" ? (colorOf(ORDER[i]) === "red" ? "#ef6461" : colorOf(ORDER[i]) === "green" ? "#5fd3a0" : "#d6e2ee") : "#fff";
        g.font = `${th.style === "scifi" ? 500 : 700} ${Math.max(8, R * 0.075)}px ${th.style === "scifi" ? th.fontNum : th.fontDisplay}`;
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(String(ORDER[i]), 0, 0); g.restore();
      }
      g.strokeStyle = th.style === "medieval" ? "rgba(201, 149, 47, .8)" : th.style === "modern" ? "rgba(255,255,255,.35)" : "rgba(94, 200, 229, .3)";
      g.lineWidth = th.style === "modern" ? 1 : 1.5;
      for (let i = 0; i < n; i++) { const a = wheelAng + i * step - Math.PI / 2 + step / 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62); g.lineTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9); g.stroke(); }
      // Hub.
      if (th.style === "medieval") {
        g.save(); g.beginPath(); g.arc(cx, cy, R * 0.62, 0, Math.PI * 2); g.clip(); texture(g, "wood", { ...th, wood: "#7a5230" }, cx - R, cy - R, R * 2, R * 2); g.restore();
        g.strokeStyle = "#c9952f"; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R * 0.62, 0, Math.PI * 2); g.stroke();
        // A carved sun at the centre.
        g.fillStyle = "#c9952f";
        for (let k = 0; k < 12; k++) { const a = wheelAng + (k * Math.PI) / 6; g.beginPath(); g.moveTo(cx + Math.cos(a - 0.12) * R * 0.14, cy + Math.sin(a - 0.12) * R * 0.14); g.lineTo(cx + Math.cos(a) * R * 0.36, cy + Math.sin(a) * R * 0.36); g.lineTo(cx + Math.cos(a + 0.12) * R * 0.14, cy + Math.sin(a + 0.12) * R * 0.14); g.closePath(); g.fill(); }
        g.beginPath(); g.arc(cx, cy, R * 0.14, 0, Math.PI * 2); g.fill();
      } else if (th.style === "modern") {
        const hub = g.createRadialGradient(cx - R * 0.15, cy - R * 0.15, 2, cx, cy, R * 0.62);
        hub.addColorStop(0, "#f3f1ec"); hub.addColorStop(1, "#c9c5bc");
        g.fillStyle = hub; g.beginPath(); g.arc(cx, cy, R * 0.62, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "#8e8e93"; g.lineWidth = Math.max(3, R * 0.03);
        for (let k = 0; k < 4; k++) { const a = wheelAng + (k * Math.PI) / 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R * 0.42, cy + Math.sin(a) * R * 0.42); g.stroke(); }
        g.fillStyle = "#1d1d1f"; g.beginPath(); g.arc(cx, cy, R * 0.07, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = "#0b131d"; g.beginPath(); g.arc(cx, cy, R * 0.62, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "rgba(94, 200, 229, .5)"; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R * 0.62, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.arc(cx, cy, R * 0.3, wheelAng, wheelAng + Math.PI * 1.4); g.stroke();
        g.strokeStyle = "rgba(242, 165, 65, .6)"; g.beginPath(); g.arc(cx, cy, R * 0.2, -wheelAng * 2, -wheelAng * 2 + Math.PI * 0.8); g.stroke();
      }
      // The ball.
      const br = R * (0.86 + 0.12 * ballR);
      const bx = cx + Math.cos(ballAng - Math.PI / 2) * br, by = cy + Math.sin(ballAng - Math.PI / 2) * br, bs = Math.max(4, R * 0.04);
      if (th.style === "scifi") { g.fillStyle = th.accent; glow(g, th, th.accent, 8); g.beginPath(); g.arc(bx, by, bs * 0.8, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0; }
      else {
        lift(g, th, 1);
        const bg2 = g.createRadialGradient(bx - bs * 0.3, by - bs * 0.3, 1, bx, by, bs);
        bg2.addColorStop(0, "#ffffff"); bg2.addColorStop(1, th.style === "medieval" ? "#cfc6b0" : "#c8c8cc");
        g.fillStyle = bg2; g.beginPath(); g.arc(bx, by, bs, 0, Math.PI * 2); g.fill(); unlift(g);
      }
    };

    const pickResult = (): number => {
      const fair = () => ORDER[Math.floor(kit.rng() * ORDER.length)];
      if (Math.abs(lean) < 0.01) return fair();
      const netOf = (n: number) => [...bets].reduce((t, [k, v]) => t + v * betWins(k, n), 0);
      const want = lean > 0 ? ORDER.filter((n) => netOf(n) > 0) : ORDER.filter((n) => netOf(n) < 0);
      if (want.length && kit.rng() < Math.abs(lean)) return want[Math.floor(kit.rng() * want.length)];
      return fair();
    };
    const doSpin = () => {
      if (spinning || over || !staked()) return;
      spinning = true;
      lastBets = new Map(bets);
      const result = pickResult();
      const T = 4.2;
      anim = { t: 0, T, from: wheelAng, to: wheelAng + 0.35 * T * 0.5 + Math.PI * 2, result };
      kit.synth.fx("spin");
      paint();
    };
    const land = (n: number) => {
      history.push(n);
      let won = 0;
      const before = chips + staked();
      for (const [k, v] of bets) { const m = betWins(k, n); if (m > 0) won += v * (m + 1); }
      const stakedNow = staked();
      chips += won;
      bets = new Map();
      board.querySelectorAll(".win").forEach((x) => x.classList.remove("win"));
      board.querySelector(`[data-bet="n:${n}"]`)?.classList.add("win");
      const net = won - stakedNow;
      if (won > 0) { kit.synth.fx(net >= stakedNow * 5 ? "jackpot" : "coins"); kit.banner(`${n} ${colorOf(n)} · +${net}`, net > 0 ? "good" : "info"); if (net > bigWin) bigWin = net; }
      else { kit.synth.fx("miss"); kit.banner(`${n} ${colorOf(n)}`, "bad"); }
      undo = net < 0 ? { chips: before, bets: new Map(lastBets) } : null;
      spin++;
      spinning = false;
      kit.track(clamp(chips / (start * 2)));
      paint();
      if (spin >= spins || chips < denoms[0]) setTimeout(() => { if (!undo || kit.lives.left() <= 0) finish(); }, 1600);
    };
    const luckySpin = () => {
      if (!undo || spinning) return;
      if (!kit.lives.spend("Lucky charm!")) return;
      rescued++;
      chips = undo.chips - [...undo.bets.values()].reduce((a, b) => a + b, 0);
      bets = new Map(undo.bets);
      spin--;
      undo = null;
      paint();
      doSpin();
    };
    const finish = () => {
      if (over) return;
      over = true;
      chips += staked(); bets = new Map();
      const beats: string[] = [chips > start * 1.3 ? "the wheel was kind" : chips < start * 0.7 ? "the wheel was cruel" : "the wheel giveth and taketh"];
      if (bigWin >= start * 0.5) beats.push("one spin that made the table gasp");
      if (rescued) beats.push("a second spin saved them");
      kit.finish({ chips, score: clamp(chips / (start * 2)), beats, detail: `${history.length} spins: ${history.join(", ")}` });
    };

    root.addEventListener("click", (e) => {
      if (kit.paused) return;
      const t = e.target as HTMLElement;
      const b = t.closest<HTMLElement>("[data-bet]");
      if (b) { place(b.dataset.bet!); return; }
      const ch = t.closest<HTMLElement>("[data-chip]");
      if (ch) { chip = Number(ch.dataset.chip); kit.synth.fx("chip"); paint(); return; }
      if (t.closest("[data-spin]")) doSpin();
      else if (t.closest("[data-clear]")) { for (const v of bets.values()) chips += v; bets = new Map(); paint(); }
      else if (t.closest("[data-rebet]")) { const need = [...lastBets.values()].reduce((a, b2) => a + b2, 0); if (need <= chips) { bets = new Map(lastBets); chips -= need; kit.synth.fx("chip"); paint(); } }
      else if (t.closest("[data-leave]")) finish();
      else if (t.closest("[data-luck]")) luckySpin();
    });
    board.addEventListener("contextmenu", (e) => { e.preventDefault(); const b = (e.target as HTMLElement).closest<HTMLElement>("[data-bet]"); if (b) place(b.dataset.bet!, -1); });
    kit.onKey((e, down) => { if (down && (e.key === " " || e.key === "Enter")) { doSpin(); return true; } return false; });
    withMusic(kit, () => backing(kit.synth, "lounge"));
    kit.onQuit(() => finish());

    let tick = 0;
    kit.loop((dt) => {
      if (anim) {
        anim.t += dt;
        const k = clamp(anim.t / anim.T);
        // The wheel slows; the ball runs the other way, drops in, and settles in its pocket.
        wheelAng = anim.from + (anim.to - anim.from) * easeOut(k);
        const step = (Math.PI * 2) / ORDER.length;
        const pocket = wheelAng + ORDER.indexOf(anim.result) * step;
        const laps = 5;
        ballAng = pocket + laps * Math.PI * 2 * (1 - easeOut(Math.min(1, k * 1.05)));
        ballR = k < 0.65 ? 1 : k < 0.9 ? 1 - (k - 0.65) / 0.25 * 0.85 + Math.abs(Math.sin(k * 60)) * 0.08 * (0.9 - k) : 0.15;
        tick += dt;
        if (k > 0.5 && k < 0.92 && tick > 0.06 + k * 0.1) { tick = 0; kit.synth.fx("ball"); }
        if (k >= 1) { const r = anim.result; anim = null; land(r); }
      } else {
        wheelAng += dt * 0.25;
        if (!history.length) ballAng = wheelAng; else ballAng = wheelAng + ORDER.indexOf(history[history.length - 1]) * ((Math.PI * 2) / ORDER.length);
      }
      drawWheel();
    });
    paint();
    return () => { ro.disconnect(); ro2.disconnect(); root.remove(); };
  },
};
