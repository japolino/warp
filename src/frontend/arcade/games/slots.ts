// Slots: pull, and stop each reel yourself. On an easy check the reels crawl and you
// can line up sevens; on a hard one they blur and slip. A hold keeps one reel still
// for the next pull.

import { clamp, rrect, type GameDef, type Kit, withMusic } from "../kit.js";
import { glow, paint as texture } from "../themes.js";
import type { Style } from "../themes.js";
import { backing } from "../synth.js";

type Sym = "seven" | "diamond" | "bar" | "star" | "bell" | "lemon" | "cherry";
const STRIP_WEIGHTS: [Sym, number][] = [["cherry", 5], ["lemon", 5], ["bell", 4], ["star", 3], ["bar", 2], ["diamond", 2], ["seven", 1]];
export const PAYS: Record<Sym, number> = { seven: 50, diamond: 25, bar: 15, star: 10, bell: 8, lemon: 5, cherry: 4 };
/** What each symbol is called in each look. */
const NAMES: Record<Style, Record<Sym, string>> = {
  modern: { seven: "sevens", diamond: "diamonds", bar: "bars", star: "stars", bell: "bells", lemon: "lemons", cherry: "cherries" },
  medieval: { seven: "crowns", diamond: "rubies", bar: "shields", star: "stars", bell: "goblets", lemon: "pears", cherry: "cherries" },
  scifi: { seven: "cores", diamond: "crystals", bar: "chips", star: "stars", bell: "planets", lemon: "moons", cherry: "orbs" },
};
const TITLE: Record<Style, string> = { modern: "Lucky Sevens", medieval: "Fortuna", scifi: "JACKPOT//CORE" };

/** What a line pays, as a multiple of the bet (0 = nothing). */
export function linePays(line: Sym[]): number {
  if (line[0] === line[1] && line[1] === line[2]) return PAYS[line[0]];
  const ch = line.filter((s) => s === "cherry").length;
  return ch === 2 ? 2 : ch === 1 ? 1 : 0;
}

const CSS = `
.sl { position: absolute; inset: 0; display: grid; place-items: center; padding: 14px; background: var(--sl-room); }
.sl-cab { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; align-items: center; width: min(760px, 100%); }
.sl-box { position: relative; padding: 18px 18px 16px; border-radius: var(--sl-r, 22px); background: var(--sl-cab); box-shadow: var(--sl-cab-shadow); }
.sl-title { text-align: center; font: var(--sl-title-font); letter-spacing: var(--sl-title-ls, .1em); color: var(--sl-title); margin-bottom: 12px; text-transform: uppercase; }
.sl-window { position: relative; border-radius: var(--sl-wr, 12px); overflow: hidden; background: var(--sl-reel); box-shadow: var(--sl-window-shadow); }
.sl-window canvas { display: block; width: 100%; height: calc(var(--sw) * .62); }
.sl-window::after { content: ""; position: absolute; inset: 0; background: var(--sl-glass); pointer-events: none; }
.sl-led { display: flex; justify-content: space-between; gap: 10px; margin-top: 12px; }
.sl-led div { flex: 1; padding: 6px 10px; border-radius: var(--sl-pr, 8px); background: var(--sl-plate); font: 600 10.5px var(--ar-ui); letter-spacing: .12em; text-transform: uppercase; color: var(--sl-dim); }
.sl-led b { display: block; font: 700 19px var(--sl-num-font); color: var(--sl-num); letter-spacing: .02em; }
.sl-ctrl { display: flex; gap: 8px; justify-content: center; margin-top: 12px; flex-wrap: wrap; }
.sl .sl-btn { padding: 10px 16px; border-radius: var(--sl-br, 999px); border: 1px solid var(--sl-btn-line); cursor: pointer; font: 700 12.5px var(--sl-font); letter-spacing: .08em; text-transform: uppercase; color: var(--sl-btn-ink); background: var(--sl-btn); transition: transform .1s; }
.sl .sl-btn:active:not(:disabled) { transform: translateY(1px); }
.sl .sl-btn:disabled { opacity: .4; cursor: not-allowed; }
.sl .sl-btn.main { background: var(--sl-main); color: var(--sl-on-main); border-color: transparent; }
.sl .sl-btn.on { box-shadow: 0 0 0 2px var(--sl-title); }
.sl .sl-btn.hold { border-color: var(--sl-hold); color: var(--sl-hold); }
.sl .sl-lever { position: relative; width: 46px; height: 220px; cursor: pointer; touch-action: none; }
.sl .sl-lever .rod { position: absolute; left: 19px; top: 30px; width: 8px; height: 160px; border-radius: 4px; background: var(--sl-rod); transform-origin: 50% 100%; transition: transform .25s cubic-bezier(.3,1.6,.5,1); }
.sl .sl-lever .knob { position: absolute; left: 3px; top: 0; width: 40px; height: 40px; border-radius: 50%; background: var(--sl-knob); box-shadow: 0 4px 10px rgba(0,0,0,.35); transition: transform .25s cubic-bezier(.3,1.6,.5,1); }
.sl .sl-lever.pull .rod { transform: scaleY(-.3); } .sl-lever.pull .knob { transform: translateY(150px); }
.sl .sl-lever .base { position: absolute; left: 6px; bottom: 0; width: 34px; height: 36px; border-radius: 8px; background: var(--sl-base); }
.sl-pay { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 4px 12px; justify-content: center; font: 500 11.5px var(--ar-ui); color: var(--sl-dim); }
@media (max-width: 600px) { .sl-cab { grid-template-columns: minmax(0, 1fr); } .sl-lever { display: none; } }

/* modern: a cream fruit machine, coral trim, crisp reels */
.sl[data-style=modern] { --sl-room: #ece9e2; --sl-cab: #fbfaf7; --sl-cab-shadow: 0 0 0 1px rgba(29,29,31,.08), 0 24px 60px rgba(0,0,0,.12); --sl-title-font: 800 24px/1 var(--ar-display); --sl-title: #ff5a36; --sl-title-ls: .04em;
  --sl-reel: #ffffff; --sl-window-shadow: inset 0 0 0 1px rgba(29,29,31,.12), inset 0 10px 18px rgba(0,0,0,.06); --sl-glass: linear-gradient(180deg, rgba(0,0,0,.06), transparent 25%, transparent 75%, rgba(0,0,0,.06));
  --sl-plate: #f1efe9; --sl-dim: #8e8e93; --sl-num-font: var(--ar-display); --sl-num: #1d1d1f; --sl-font: var(--ar-display); --sl-btn: #fff; --sl-btn-ink: #1d1d1f; --sl-btn-line: rgba(29,29,31,.15);
  --sl-main: #1d1d1f; --sl-on-main: #fff; --sl-hold: #1f9d55; --sl-rod: linear-gradient(90deg, #e2e2e6, #a8a8ae); --sl-knob: radial-gradient(circle at 35% 35%, #ff8d73, #ff5a36 60%, #c23a1d); --sl-base: #1d1d1f; }
/* medieval: an oak chest bound in brass, parchment reels, a ruby knob */
.sl[data-style=medieval] { --sl-room: var(--ar-wood) 0 0 / 256px; --sl-r: 4px; --sl-wr: 2px; --sl-pr: 2px; --sl-br: 2px;
  --sl-cab: linear-gradient(rgba(20,10,2,.25), rgba(20,10,2,.25)), var(--ar-wood) 0 0 / 256px; --sl-cab-shadow: 0 0 0 3px #b48a2c, 0 0 0 8px #2a1a0d, 0 0 0 9px rgba(180,138,44,.6), 0 30px 60px rgba(0,0,0,.6);
  --sl-title-font: 700 28px/1 var(--ar-display); --sl-title: #e9c46a; --sl-title-ls: .22em;
  --sl-reel: var(--ar-parch) 0 0 / 512px; --sl-window-shadow: 0 0 0 2px #b48a2c, inset 0 0 30px rgba(110,70,25,.45); --sl-glass: linear-gradient(180deg, rgba(60,30,5,.35), transparent 25%, transparent 75%, rgba(60,30,5,.35));
  --sl-plate: rgba(20,10,2,.55); --sl-dim: rgba(236,223,191,.7); --sl-num-font: var(--ar-display); --sl-num: #ecdfbf; --sl-font: var(--ar-display); --sl-btn: rgba(20,10,2,.5); --sl-btn-ink: #ecdfbf; --sl-btn-line: rgba(214,181,106,.5);
  --sl-main: #9e2b1f; --sl-on-main: #f3e7c8; --sl-hold: #a8d08d; --sl-rod: linear-gradient(90deg, #6b4426, #3b2414); --sl-knob: radial-gradient(circle at 35% 35%, #e0605a, #9e2b1f 60%, #5e110c); --sl-base: #2a1a0d; }
.sl[data-style=medieval] .sl-pay { font-family: var(--ar-ui); font-style: italic; font-size: 13px; }
/* sci-fi: a console, glass reels, a slider for a lever */
.sl[data-style=scifi] { --sl-room: transparent; --sl-r: 0; --sl-wr: 0; --sl-pr: 0; --sl-br: 0;
  --sl-cab: rgba(10, 17, 27, .94); --sl-cab-shadow: inset 0 0 0 1px rgba(94,200,229,.35); --sl-title-font: 600 20px/1 var(--ar-display); --sl-title: #5ec8e5; --sl-title-ls: .18em;
  --sl-reel: #07101a; --sl-window-shadow: inset 0 0 0 1px rgba(94,200,229,.35); --sl-glass: linear-gradient(180deg, rgba(5,8,13,.7), transparent 28%, transparent 72%, rgba(5,8,13,.7));
  --sl-plate: #0d1825; --sl-dim: #61768c; --sl-num-font: var(--ar-num); --sl-num: #5ec8e5; --sl-font: var(--ar-display); --sl-btn: transparent; --sl-btn-ink: #d6e2ee; --sl-btn-line: rgba(94,200,229,.35);
  --sl-main: rgba(94,200,229,.16); --sl-on-main: #5ec8e5; --sl-hold: #5fd3a0; --sl-rod: rgba(94,200,229,.4); --sl-knob: #0d1825; --sl-base: #0d1825; }
.sl[data-style=scifi] .sl-box { clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px); }
.sl[data-style=scifi] .sl-lever .knob { border-radius: 0; box-shadow: inset 0 0 0 1px #5ec8e5; }
.sl[data-style=scifi] .sl-btn.main { border-color: #5ec8e5; }
.sl[data-style=scifi] .sl-pay { font-family: var(--ar-num); font-size: 10.5px; }
`;

export const SLOTS: GameDef = {
  id: "slots",
  title: "Slots",
  howTo: [
    "Pick a bet and pull the lever. The reels spin until you stop them — left to right.",
    "Line three of a kind on the middle line. Cherries pay even alone.",
    "On easy checks the reels crawl; on hard ones they blur, and slip a little after you stop them.",
  ],
  controls: "Space / lever pulls · Space or 1 2 3 stops reels · H holds a reel",
  start(kit: Kit) {
    const L = kit.play.level;
    const gamble = kit.play.mode === "gamble";
    const start = gamble ? kit.play.stake! : 100;
    const pulls = gamble ? kit.play.rounds ?? 6 : 6;
    const unit = Math.max(1, Math.round(start / 20));
    const bets = [unit, unit * 2, unit * 4];
    const speed = (5 + L * 17) * (1 - kit.aid("slow") / 100);
    const slipMax = Math.round(L * 2.2);
    let holds = kit.aid("hold");
    let bet = bets[1], chips = start, pull = 0, over = false;
    const strips: Sym[][] = [0, 1, 2].map(() => {
      const base: Sym[] = STRIP_WEIGHTS.flatMap(([s, n]) => Array<Sym>(n).fill(s));
      // Spread them out so the same symbol rarely sits next to itself.
      const out: Sym[] = [];
      const pool = [...base];
      while (pool.length) { const i = Math.floor(kit.rng() * pool.length); out.push(pool.splice(i, 1)[0]); }
      return out;
    });
    const N = strips[0].length;
    const reels = [0, 1, 2].map(() => ({ pos: kit.rng() * N, v: 0, state: "idle" as "idle" | "spin" | "stopping", target: 0, held: false }));
    let wins = 0, best = 0, bestLine = "";

    const root = document.createElement("div");
    root.className = "sl";
    const th = kit.theme;
    root.dataset.style = th.style;
    const NAME = NAMES[th.style];
    root.innerHTML = `<style>${CSS}</style>
      <div class="sl-cab">
        <div class="sl-box">
          <div class="sl-title">${TITLE[th.style]}</div>
          <div class="sl-window"><canvas></canvas></div>
          <div class="sl-led"><div>Credits<b data-cr>0</b></div><div>Bet<b data-bet>0</b></div><div>Win<b data-win>0</b></div></div>
          <div class="sl-ctrl" data-ctrl></div>
          <div class="sl-pay">${(["seven", "diamond", "bar", "star", "bell", "lemon", "cherry"] as Sym[]).map((k) => `3 ${NAME[k]} ×${PAYS[k]}`).join(" · ")} · 2 ${NAME.cherry} ×2 · 1 ×1</div>
        </div>
        <div class="sl-lever" data-lever><div class="rod"></div><div class="knob"></div><div class="base"></div></div>
      </div>`;
    kit.root.appendChild(root);
    const $ = (s: string) => root.querySelector<HTMLElement>(s)!;
    const cv = root.querySelector("canvas")!;
    const g = cv.getContext("2d")!;
    const fit = () => {
      const box = root.getBoundingClientRect();
      const sw = Math.min(box.width - 120, (box.height - 260) / 0.62, 640);
      $(".sl-window").style.setProperty("--sw", `${Math.max(240, sw)}px`);
      $(".sl-box").style.width = `${Math.max(280, sw + 36)}px`;
      const r = cv.getBoundingClientRect(); const d = Math.min(2, devicePixelRatio || 1);
      cv.width = r.width * d; cv.height = r.height * d; g.setTransform(d, 0, 0, d, 0, 0);
    };
    const ro = new ResizeObserver(fit); ro.observe(root); fit();

    const spinning = () => reels.some((r) => r.state !== "idle");
    const ctrl = () => {
      const busy = spinning();
      $("[data-ctrl]").innerHTML = busy
        ? reels.map((r, i) => `<button class="sl-btn alt" data-stop="${i}" ${r.state === "spin" ? "" : "disabled"}>Stop ${i + 1}</button>`).join("")
        : `${bets.map((b) => `<button class="sl-btn alt${b === bet ? " on" : ""}" data-b="${b}" ${b > chips ? "disabled" : ""}>Bet ${b}</button>`).join("")}
           <button class="sl-btn main" data-pull ${bet > chips || over || pull >= pulls ? "disabled" : ""}>Pull</button>
           ${holds > 0 && pull > 0 ? reels.map((r, i) => `<button class="sl-btn hold${r.held ? " on" : ""}" data-hold="${i}">${r.held ? "Held" : "Hold"} ${i + 1}</button>`).join("") : ""}
           ${(gamble && pull > 0) || pull >= pulls ? `<button class="sl-btn alt" data-leave>${pull >= pulls ? "Done" : "Cash out"}</button>` : ""}`;
      $("[data-cr]").textContent = String(Math.round(chips));
      $("[data-bet]").textContent = String(bet);
      kit.chips(chips);
      kit.status(`Pull ${Math.min(pull + 1, pulls)} of ${pulls}\n${holds ? `${holds} hold${holds > 1 ? "s" : ""}` : ""}`);
    };
    const doPull = () => {
      if (over || spinning() || bet > chips || pull >= pulls) return;
      chips -= bet;
      $("[data-win]").textContent = "0";
      const lever = $("[data-lever]"); lever.classList.add("pull"); setTimeout(() => lever.classList.remove("pull"), 350);
      kit.synth.fx("launch");
      reels.forEach((r, i) => {
        if (r.held) { r.held = false; holds--; return; }
        setTimeout(() => { r.state = "spin"; r.v = speed * (1 + i * 0.07); ctrl(); }, i * 140);
      });
      ctrl();
      // Reels left spinning stop by themselves after a while.
      const p = pull;
      setTimeout(() => { if (pull === p) reels.forEach((_, i) => stop(i)); }, 7000);
    };
    const stop = (i: number) => {
      const r = reels[i];
      if (r.state !== "spin") return;
      // It runs on a symbol, plus a slip that grows with the check's difficulty.
      const slip = slipMax ? Math.floor(kit.rng() * (slipMax + 1)) : 0;
      r.target = Math.ceil(r.pos) + 1 + slip;
      r.state = "stopping";
      kit.synth.fx("stop");
      ctrl();
    };
    const nextToStop = () => reels.findIndex((r) => r.state === "spin");
    const settle = () => {
      const line = reels.map((r) => strips[reels.indexOf(r)][((Math.round(r.pos) % N) + N) % N]);
      const m = linePays(line);
      const won = bet * m;
      chips += won;
      pull++;
      $("[data-win]").textContent = String(won);
      if (m >= 4) {
        wins++;
        kit.synth.fx(m >= 15 ? "jackpot" : "coins");
        kit.banner(`${NAME[line[0]]}! +${won}`, m >= 15 ? "gold" : "good");
        if (won > best) { best = won; bestLine = `three ${NAME[line[0]]}`; }
        kit.shake(m >= 25 ? 1 : 0.4);
      } else if (m > 0) { kit.synth.fx("chip"); wins++; }
      else kit.synth.fx("click");
      kit.track(clamp(chips / (start * 2)));
      ctrl();
      if (pull >= pulls || chips < bets[0]) setTimeout(finish, 1400);
    };
    const finish = () => {
      if (over) return;
      over = true;
      const beats = [chips > start * 1.3 ? "the machine paid out" : chips < start * 0.7 ? "the machine ate their money" : "a few small wins, a few losses"];
      if (bestLine) beats.push(`lined up ${bestLine}`);
      kit.finish({ chips, score: clamp(chips / (start * 2)), beats, detail: `${pull} pulls, ${wins} paid` });
    };

    root.addEventListener("click", (e) => {
      if (kit.paused) return;
      const t = e.target as HTMLElement;
      const b = t.closest<HTMLElement>("[data-b]");
      if (b) { bet = Number(b.dataset.b); kit.synth.fx("chip"); ctrl(); return; }
      const st = t.closest<HTMLElement>("[data-stop]");
      if (st) { stop(Number(st.dataset.stop)); return; }
      const h = t.closest<HTMLElement>("[data-hold]");
      if (h) { const r = reels[Number(h.dataset.hold)]; const heldNow = reels.filter((x) => x.held).length; if (r.held || heldNow < holds) { r.held = !r.held; kit.synth.fx("click"); ctrl(); } return; }
      if (t.closest("[data-pull]") || t.closest("[data-lever]")) { if (spinning()) { const i = nextToStop(); if (i >= 0) stop(i); } else doPull(); return; }
      if (t.closest("[data-leave]")) finish();
    });
    cv.addEventListener("pointerdown", (e) => {
      if (kit.paused || !spinning()) return;
      const r = cv.getBoundingClientRect();
      stop(Math.min(2, Math.floor(((e.clientX - r.left) / r.width) * 3)));
    });
    kit.onKey((e, down) => {
      if (!down || e.repeat) return false;
      const k = e.key.toLowerCase();
      if (k === " " || k === "enter") { if (spinning()) { const i = nextToStop(); if (i >= 0) stop(i); } else doPull(); return true; }
      if (/^[1-3]$/.test(k)) { stop(Number(k) - 1); return true; }
      if (k === "h") { const r = reels.find((x) => !x.held); if (r && holds > reels.filter((x) => x.held).length && !spinning() && pull > 0) { r.held = true; ctrl(); } return true; }
      return false;
    });
    withMusic(kit, () => backing(kit.synth, "lounge"));
    kit.onQuit(() => finish());

    let tickAcc = 0;
    kit.loop((dt) => {
      let anyMoving = false;
      for (const r of reels) {
        if (r.state === "spin") { r.pos += r.v * dt; anyMoving = true; }
        else if (r.state === "stopping") {
          anyMoving = true;
          const left = r.target - r.pos;
          const v = Math.max(1.2, Math.min(r.v, left * 7));
          r.pos = Math.min(r.target, r.pos + v * dt);
          if (r.pos >= r.target - 1e-3) { r.pos = r.target; r.state = "idle"; kit.synth.fx("reel"); if (!spinning()) settle(); }
        }
      }
      if (anyMoving) { tickAcc += dt * speed; if (tickAcc > 1) { tickAcc = 0; kit.synth.fx("reel"); } }
      draw();
    });

    /** The symbols, drawn for each look. */
    const sym = (k: Sym, x: number, y: number, z: number) => {
      g.save(); g.translate(x, y);
      if (th.style === "medieval") medievalSym(k, z); else if (th.style === "scifi") scifiSym(k, z); else modernSym(k, z);
      g.restore();
    };
    const star = (r1: number, r2: number) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r2 : r1; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); };
    function modernSym(k: Sym, z: number) {
      switch (k) {
        case "seven": g.font = `800 ${z * 0.78}px ${th.fontDisplay}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#ff5a36"; g.fillText("7", 0, z * 0.04); break;
        case "bar": g.fillStyle = "#1d1d1f"; rrect(g, -z * 0.36, -z * 0.16, z * 0.72, z * 0.32, z * 0.08); g.fill(); g.fillStyle = "#fff"; g.font = `800 ${z * 0.2}px ${th.fontDisplay}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("BAR", 0, z * 0.01); break;
        case "diamond": g.fillStyle = "#2f6fe4"; g.beginPath(); g.moveTo(0, -z * 0.34); g.lineTo(z * 0.28, -z * 0.06); g.lineTo(0, z * 0.34); g.lineTo(-z * 0.28, -z * 0.06); g.closePath(); g.fill(); g.fillStyle = "rgba(255,255,255,.35)"; g.beginPath(); g.moveTo(0, -z * 0.34); g.lineTo(z * 0.1, -z * 0.06); g.lineTo(-z * 0.1, -z * 0.06); g.closePath(); g.fill(); break;
        case "star": g.fillStyle = "#ffb020"; star(z * 0.34, z * 0.15); g.fill(); break;
        case "bell": g.fillStyle = "#ffb020"; g.beginPath(); g.moveTo(-z * 0.28, z * 0.18); g.quadraticCurveTo(-z * 0.24, -z * 0.3, 0, -z * 0.3); g.quadraticCurveTo(z * 0.24, -z * 0.3, z * 0.28, z * 0.18); g.closePath(); g.fill(); g.fillStyle = "#1d1d1f"; g.beginPath(); g.arc(0, z * 0.24, z * 0.06, 0, Math.PI * 2); g.fill(); break;
        case "lemon": g.fillStyle = "#f2d027"; g.beginPath(); g.ellipse(0, 0, z * 0.3, z * 0.22, -0.3, 0, Math.PI * 2); g.fill(); break;
        case "cherry": cherries(z, "#e0452b", "#22a06b"); break;
      }
    }
    function cherries(z: number, fruit: string, stem: string) {
      g.strokeStyle = stem; g.lineWidth = z * 0.05; g.lineCap = "round";
      g.beginPath(); g.moveTo(-z * 0.14, z * 0.06); g.quadraticCurveTo(0, -z * 0.3, z * 0.12, -z * 0.34); g.moveTo(z * 0.16, z * 0.1); g.quadraticCurveTo(z * 0.12, -z * 0.15, z * 0.12, -z * 0.34); g.stroke();
      for (const [cx, cy] of [[-z * 0.15, z * 0.15], [z * 0.16, z * 0.19]]) { g.fillStyle = fruit; g.beginPath(); g.arc(cx, cy, z * 0.15, 0, Math.PI * 2); g.fill(); g.fillStyle = "rgba(255,255,255,.4)"; g.beginPath(); g.arc(cx - z * 0.05, cy - z * 0.05, z * 0.035, 0, Math.PI * 2); g.fill(); }
    }
    function medievalSym(k: Sym, z: number) {
      const gold = "#c9952f", ink = "#2c1f12";
      g.lineJoin = "round";
      switch (k) {
        case "seven": { // a crown
          g.fillStyle = gold; g.beginPath(); g.moveTo(-z * 0.32, z * 0.2); g.lineTo(-z * 0.34, -z * 0.18); g.lineTo(-z * 0.16, 0); g.lineTo(0, -z * 0.3); g.lineTo(z * 0.16, 0); g.lineTo(z * 0.34, -z * 0.18); g.lineTo(z * 0.32, z * 0.2); g.closePath(); g.fill();
          g.strokeStyle = "#6b4a12"; g.lineWidth = 1.5; g.stroke();
          g.fillStyle = "#9e2b1f"; g.beginPath(); g.arc(0, z * 0.08, z * 0.06, 0, Math.PI * 2); g.fill();
          g.fillStyle = "#2c4a7a"; for (const dx of [-0.2, 0.2]) { g.beginPath(); g.arc(dx * z, z * 0.1, z * 0.04, 0, Math.PI * 2); g.fill(); }
          break;
        }
        case "diamond": { // a cut ruby
          g.fillStyle = "#9e2b1f"; g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 + Math.PI / 8; g.lineTo(Math.cos(a) * z * 0.3, Math.sin(a) * z * 0.3); } g.closePath(); g.fill();
          g.strokeStyle = "#5e110c"; g.lineWidth = 1.5; g.stroke();
          g.fillStyle = "rgba(255, 220, 200, .35)"; g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 + Math.PI / 8; g.lineTo(Math.cos(a) * z * 0.15, Math.sin(a) * z * 0.15); } g.closePath(); g.fill();
          break;
        }
        case "bar": { // a heater shield, per pale azure and gules
          const shield = () => { g.beginPath(); g.moveTo(-z * 0.26, -z * 0.3); g.lineTo(z * 0.26, -z * 0.3); g.lineTo(z * 0.26, 0); g.quadraticCurveTo(z * 0.2, z * 0.26, 0, z * 0.34); g.quadraticCurveTo(-z * 0.2, z * 0.26, -z * 0.26, 0); g.closePath(); };
          g.save(); shield(); g.clip(); g.fillStyle = "#2c4a7a"; g.fillRect(-z * 0.3, -z * 0.4, z * 0.3, z * 0.8); g.fillStyle = "#9e2b1f"; g.fillRect(0, -z * 0.4, z * 0.3, z * 0.8); g.restore();
          shield(); g.strokeStyle = gold; g.lineWidth = z * 0.04; g.stroke();
          break;
        }
        case "star": g.fillStyle = gold; star(z * 0.32, z * 0.13); g.fill(); g.strokeStyle = "#6b4a12"; g.lineWidth = 1.5; g.stroke(); break;
        case "bell": { // a goblet
          g.fillStyle = gold; g.beginPath(); g.moveTo(-z * 0.22, -z * 0.3); g.lineTo(z * 0.22, -z * 0.3); g.quadraticCurveTo(z * 0.22, z * 0.02, 0, z * 0.06); g.quadraticCurveTo(-z * 0.22, z * 0.02, -z * 0.22, -z * 0.3); g.fill();
          g.fillRect(-z * 0.03, z * 0.04, z * 0.06, z * 0.18); g.beginPath(); g.ellipse(0, z * 0.25, z * 0.14, z * 0.05, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = "#6b1a12"; g.beginPath(); g.ellipse(0, -z * 0.28, z * 0.2, z * 0.04, 0, 0, Math.PI * 2); g.fill();
          break;
        }
        case "lemon": { // a pear
          g.fillStyle = "#a8a83a"; g.beginPath(); g.arc(0, z * 0.1, z * 0.2, 0, Math.PI * 2); g.arc(0, -z * 0.1, z * 0.12, 0, Math.PI * 2); g.fill();
          g.strokeStyle = "#4a2e16"; g.lineWidth = z * 0.04; g.beginPath(); g.moveTo(0, -z * 0.2); g.lineTo(z * 0.04, -z * 0.32); g.stroke();
          g.fillStyle = "#3e6b3a"; g.beginPath(); g.ellipse(z * 0.11, -z * 0.28, z * 0.09, z * 0.04, -0.4, 0, Math.PI * 2); g.fill();
          break;
        }
        case "cherry": cherries(z, "#8c2a1f", "#3e6b3a"); break;
      }
      void ink;
    }
    function scifiSym(k: Sym, z: number) {
      const ac = th.accent, am = th.accent2;
      g.lineWidth = 1.8; g.lineJoin = "round";
      switch (k) {
        case "seven": { // a reactor core
          glow(g, th, am, 10); g.strokeStyle = am; g.beginPath(); g.arc(0, 0, z * 0.3, 0, Math.PI * 2); g.stroke(); g.shadowBlur = 0;
          g.fillStyle = am; g.beginPath(); g.arc(0, 0, z * 0.12, 0, Math.PI * 2); g.fill();
          for (let i = 0; i < 3; i++) { const a = (i * Math.PI * 2) / 3; g.beginPath(); g.arc(0, 0, z * 0.22, a, a + 0.9); g.stroke(); }
          break;
        }
        case "diamond": g.strokeStyle = ac; g.fillStyle = "rgba(94,200,229,.18)"; g.beginPath(); g.moveTo(0, -z * 0.34); g.lineTo(z * 0.2, 0); g.lineTo(0, z * 0.34); g.lineTo(-z * 0.2, 0); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-z * 0.2, 0); g.lineTo(z * 0.2, 0); g.stroke(); break;
        case "bar": g.strokeStyle = "#8f9cff"; g.strokeRect(-z * 0.2, -z * 0.2, z * 0.4, z * 0.4); for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(-z * 0.3, i * z * 0.1); g.lineTo(-z * 0.2, i * z * 0.1); g.moveTo(z * 0.2, i * z * 0.1); g.lineTo(z * 0.3, i * z * 0.1); g.stroke(); } g.fillStyle = "#8f9cff"; g.fillRect(-z * 0.08, -z * 0.08, z * 0.16, z * 0.16); break;
        case "star": g.strokeStyle = th.gold; star(z * 0.32, z * 0.12); g.stroke(); break;
        case "bell": g.strokeStyle = th.good; g.beginPath(); g.arc(0, 0, z * 0.2, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.ellipse(0, 0, z * 0.36, z * 0.1, -0.3, 0, Math.PI * 2); g.stroke(); break;
        case "lemon": g.strokeStyle = "#c792ea"; g.beginPath(); g.arc(0, 0, z * 0.24, 0.6, Math.PI * 2 - 0.6); g.arc(z * 0.1, 0, z * 0.18, Math.PI * 2 - 0.9, 0.9, true); g.closePath(); g.stroke(); break;
        case "cherry": for (const [cx, cy] of [[-z * 0.12, z * 0.08], [z * 0.12, z * 0.08], [0, -z * 0.14]]) { g.strokeStyle = th.bad; g.beginPath(); g.arc(cx, cy, z * 0.11, 0, Math.PI * 2); g.stroke(); } break;
      }
    }

    function draw() {
      const r = cv.getBoundingClientRect();
      const W = r.width, H = r.height, cw = W / 3, z = Math.min(cw * 0.8, (H / 3) * 0.95);
      g.clearRect(0, 0, W, H);
      for (let i = 0; i < 3; i++) {
        const reel = reels[i];
        const x0 = i * cw;
        if (th.style === "medieval") texture(g, "parchment", th, x0 + 2, 0, cw - 4, H);
        else if (th.style === "modern") { const bg = g.createLinearGradient(x0, 0, x0 + cw, 0); bg.addColorStop(0, "#f1efe9"); bg.addColorStop(0.5, "#ffffff"); bg.addColorStop(1, "#f1efe9"); g.fillStyle = bg; g.fillRect(x0 + 2, 0, cw - 4, H); }
        else { g.fillStyle = "#07101a"; g.fillRect(x0 + 2, 0, cw - 4, H); g.fillStyle = "rgba(94,200,229,.05)"; for (let yy = 0; yy < H; yy += 4) g.fillRect(x0 + 2, yy, cw - 4, 1); }
        const rowH = H / 3;
        const blur = reel.state === "spin" ? clamp(reel.v / 14) : 0;
        const base = Math.floor(reel.pos), frac = reel.pos - base;
        for (let k = -2; k <= 2; k++) {
          const idx = (((base - k) % N) + N) % N;
          const y = H / 2 + (k + frac) * rowH;
          if (y < -rowH || y > H + rowH) continue;
          g.globalAlpha = 1 - blur * 0.55;
          sym(strips[i][idx], x0 + cw / 2, y, z);
          if (blur > 0.2) { g.globalAlpha = blur * 0.25; sym(strips[i][idx], x0 + cw / 2, y - rowH * 0.18, z); }
          g.globalAlpha = 1;
        }
        if (reel.held) {
          g.fillStyle = th.style === "scifi" ? "rgba(95, 211, 160, .12)" : "rgba(31, 157, 85, .14)"; g.fillRect(x0 + 2, 0, cw - 4, H);
          g.fillStyle = th.style === "scifi" ? th.good : th.style === "medieval" ? "#3e6b3a" : "#1f9d55";
          g.font = `700 12px ${th.style === "scifi" ? th.fontNum : th.fontDisplay}`; g.textAlign = "center"; g.textBaseline = "top"; g.fillText("HELD", x0 + cw / 2, 8);
        }
        g.fillStyle = th.style === "medieval" ? "#5a3d1c" : th.style === "modern" ? "rgba(29,29,31,.1)" : "rgba(94,200,229,.3)";
        g.fillRect(x0 + cw - 1, 0, 2, H);
      }
      // The payline.
      const line = th.style === "medieval" ? "#9e2b1f" : th.style === "modern" ? "#ff5a36" : th.accent2;
      g.strokeStyle = line; g.lineWidth = th.style === "scifi" ? 1 : 2; g.globalAlpha = 0.8;
      g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = line;
      g.beginPath(); g.moveTo(0, H / 2 - 8); g.lineTo(11, H / 2); g.lineTo(0, H / 2 + 8); g.fill();
      g.beginPath(); g.moveTo(W, H / 2 - 8); g.lineTo(W - 11, H / 2); g.lineTo(W, H / 2 + 8); g.fill();
    }
    ctrl();
    return () => { ro.disconnect(); root.remove(); };
  },
};
