// Slots: pull, and stop each reel yourself. On an easy check the reels crawl and you
// can line up sevens; on a hard one they blur and slip. A hold keeps one reel still
// for the next pull.

import { clamp, FONT_NUM, rrect, type GameDef, type Kit, withMusic } from "../kit.js";
import { backing } from "../synth.js";

type Sym = "seven" | "diamond" | "bar" | "star" | "bell" | "lemon" | "cherry";
const STRIP_WEIGHTS: [Sym, number][] = [["cherry", 5], ["lemon", 5], ["bell", 4], ["star", 3], ["bar", 2], ["diamond", 2], ["seven", 1]];
export const PAYS: Record<Sym, number> = { seven: 50, diamond: 25, bar: 15, star: 10, bell: 8, lemon: 5, cherry: 4 };
const NAME: Record<Sym, string> = { seven: "sevens", diamond: "diamonds", bar: "bars", star: "stars", bell: "bells", lemon: "lemons", cherry: "cherries" };

/** What a line pays, as a multiple of the bet (0 = nothing). */
export function linePays(line: Sym[]): number {
  if (line[0] === line[1] && line[1] === line[2]) return PAYS[line[0]];
  const ch = line.filter((s) => s === "cherry").length;
  return ch === 2 ? 2 : ch === 1 ? 1 : 0;
}

const CSS = `
.sl { position: absolute; inset: 0; display: grid; place-items: center; padding: 14px; background: radial-gradient(ellipse at 50% 30%, #5a0f22, #2a0612 60%, #12020a); }
.sl-cab { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; align-items: center; width: min(760px, 100%); }
.sl-box { position: relative; padding: 18px 18px 16px; border-radius: 26px; background: linear-gradient(180deg, #7d1730, #4a0b1c); box-shadow: 0 0 0 4px #e8b94a, 0 0 0 7px #6d4a10, 0 30px 70px rgba(0,0,0,.6), inset 0 2px 0 rgba(255,255,255,.25); }
.sl-lights { position: absolute; inset: 6px; border-radius: 22px; pointer-events: none;
  background: radial-gradient(circle, #ffe066 0 3px, transparent 4px) 0 0 / 22px 22px; mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); padding: 5px; animation: sl-lights .8s steps(2) infinite; opacity: .9; }
.sl-lights.win { animation-duration: .2s; }
@keyframes sl-lights { 50% { background-position: 11px 0; } }
.sl-title { text-align: center; font: 900 clamp(22px, 4vw, 34px)/1 "Bahnschrift", "Arial Black", sans-serif; letter-spacing: .12em; color: #ffe066; text-shadow: 0 0 14px #ff9d2e, 0 3px 0 #8a2a00; margin-bottom: 10px; }
.sl-window { position: relative; border-radius: 14px; overflow: hidden; background: #f4ecd8; box-shadow: inset 0 8px 20px rgba(0,0,0,.45), inset 0 -8px 20px rgba(0,0,0,.35), 0 0 0 4px #2b0510; }
.sl-window canvas { display: block; width: 100%; height: calc(var(--sw) * .62); }
.sl-window::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.35), transparent 22%, transparent 78%, rgba(0,0,0,.35)), linear-gradient(110deg, rgba(255,255,255,.18), transparent 35%); pointer-events: none; }
.sl-led { display: flex; justify-content: space-between; gap: 10px; margin-top: 12px; }
.sl-led div { flex: 1; padding: 6px 10px; border-radius: 8px; background: #120206; box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); font: 700 11px system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #b08a8f; }
.sl-led b { display: block; font: 800 20px ${"ui-monospace, Consolas, monospace"}; color: #ff4d4d; text-shadow: 0 0 10px rgba(255,77,77,.7); letter-spacing: .04em; }
.sl-ctrl { display: flex; gap: 8px; justify-content: center; margin-top: 12px; flex-wrap: wrap; }
.sl-btn { padding: 10px 16px; border-radius: 12px; border: 0; cursor: pointer; font: 800 13px "Bahnschrift", system-ui, sans-serif; letter-spacing: .1em; text-transform: uppercase; color: #2a0612; background: linear-gradient(180deg, #ffe9a8, #e2a93a); box-shadow: 0 4px 0 #8a5a12, 0 8px 16px rgba(0,0,0,.4); }
.sl-btn:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 1px 0 #8a5a12; }
.sl-btn:disabled { opacity: .4; cursor: not-allowed; }
.sl-btn.alt { background: linear-gradient(180deg, #f3d7dc, #c48a94); box-shadow: 0 4px 0 #6e2a37; }
.sl-btn.on { outline: 3px solid #fff; }
.sl-btn.hold { background: linear-gradient(180deg, #b6ffd2, #3ccf86); box-shadow: 0 4px 0 #1b7a4b; }
.sl-lever { position: relative; width: 46px; height: 220px; cursor: pointer; touch-action: none; }
.sl-lever .rod { position: absolute; left: 19px; top: 30px; width: 8px; height: 160px; border-radius: 4px; background: linear-gradient(90deg, #ddd, #888); transform-origin: 50% 100%; transition: transform .25s cubic-bezier(.3,1.6,.5,1); }
.sl-lever .knob { position: absolute; left: 3px; top: 0; width: 40px; height: 40px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #ff8a8a, #c4142c 60%, #6d0a17); box-shadow: 0 6px 14px rgba(0,0,0,.5); transition: transform .25s cubic-bezier(.3,1.6,.5,1); }
.sl-lever.pull .rod { transform: scaleY(-.3); } .sl-lever.pull .knob { transform: translateY(150px); }
.sl-lever .base { position: absolute; left: 6px; bottom: 0; width: 34px; height: 36px; border-radius: 8px; background: linear-gradient(180deg, #444, #1a1a1a); }
.sl-pay { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 4px 12px; justify-content: center; font: 600 11px ui-monospace, monospace; color: #f3cdd3; opacity: .85; }
@media (max-width: 600px) { .sl-cab { grid-template-columns: minmax(0, 1fr); } .sl-lever { display: none; } }
`;

export const SLOTS: GameDef = {
  id: "slots",
  title: "Slots",
  theme: { bg: "#12020a", bg2: "#5a0f22", accent: "#ffd166", accent2: "#ff3d5a" },
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
    root.innerHTML = `<style>${CSS}</style>
      <div class="sl-cab">
        <div class="sl-box"><div class="sl-lights"></div>
          <div class="sl-title">LUCKY ★ SEVENS</div>
          <div class="sl-window"><canvas></canvas></div>
          <div class="sl-led"><div>Credits<b data-cr>0</b></div><div>Bet<b data-bet>0</b></div><div>Win<b data-win>0</b></div></div>
          <div class="sl-ctrl" data-ctrl></div>
          <div class="sl-pay">7 7 7 ×50 · ♦♦♦ ×25 · BAR ×15 · ★★★ ×10 · bells ×8 · lemons ×5 · cherries ×4 · 2 cherries ×2 · 1 cherry ×1</div>
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
           <button class="sl-btn" data-pull ${bet > chips || over || pull >= pulls ? "disabled" : ""}>Pull</button>
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
      $(".sl-lights").classList.remove("win");
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
        $(".sl-lights").classList.add("win");
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

    const sym = (s: Sym, x: number, y: number, z: number) => {
      g.save(); g.translate(x, y);
      switch (s) {
        case "seven": g.font = `900 ${z * 0.8}px "Arial Black", "Bahnschrift", sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#d4142c"; g.strokeStyle = "#5a0610"; g.lineWidth = z * 0.05; g.strokeText("7", 0, z * 0.04); g.fillText("7", 0, z * 0.04); break;
        case "bar": g.fillStyle = "#1c1c22"; rrect(g, -z * 0.38, -z * 0.18, z * 0.76, z * 0.36, z * 0.06); g.fill(); g.fillStyle = "#fff"; g.font = `900 ${z * 0.24}px "Bahnschrift", sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("BAR", 0, z * 0.01); break;
        case "diamond": g.fillStyle = "#2fa6ff"; g.beginPath(); g.moveTo(0, -z * 0.36); g.lineTo(z * 0.3, -z * 0.08); g.lineTo(0, z * 0.36); g.lineTo(-z * 0.3, -z * 0.08); g.closePath(); g.fill(); g.fillStyle = "rgba(255,255,255,.55)"; g.beginPath(); g.moveTo(0, -z * 0.36); g.lineTo(z * 0.12, -z * 0.08); g.lineTo(-z * 0.12, -z * 0.08); g.closePath(); g.fill(); break;
        case "star": g.fillStyle = "#ffbf1f"; g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? z * 0.15 : z * 0.36; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); g.strokeStyle = "#a86b00"; g.lineWidth = 2; g.stroke(); break;
        case "bell": g.fillStyle = "#f2b705"; g.beginPath(); g.moveTo(-z * 0.3, z * 0.2); g.quadraticCurveTo(-z * 0.26, -z * 0.32, 0, -z * 0.32); g.quadraticCurveTo(z * 0.26, -z * 0.32, z * 0.3, z * 0.2); g.closePath(); g.fill(); g.fillStyle = "#8a5a00"; g.beginPath(); g.arc(0, z * 0.25, z * 0.07, 0, Math.PI * 2); g.fill(); break;
        case "lemon": g.fillStyle = "#ffe23d"; g.beginPath(); g.ellipse(0, 0, z * 0.32, z * 0.24, -0.3, 0, Math.PI * 2); g.fill(); g.strokeStyle = "#c4a300"; g.lineWidth = 2; g.stroke(); break;
        case "cherry": g.strokeStyle = "#3d8a2a"; g.lineWidth = z * 0.05; g.beginPath(); g.moveTo(-z * 0.14, z * 0.08); g.quadraticCurveTo(0, -z * 0.3, z * 0.12, -z * 0.34); g.moveTo(z * 0.16, z * 0.12); g.quadraticCurveTo(z * 0.12, -z * 0.15, z * 0.12, -z * 0.34); g.stroke();
          for (const [cx, cy] of [[-z * 0.15, z * 0.16], [z * 0.16, z * 0.2]]) { g.fillStyle = "#d4142c"; g.beginPath(); g.arc(cx, cy, z * 0.15, 0, Math.PI * 2); g.fill(); g.fillStyle = "rgba(255,255,255,.5)"; g.beginPath(); g.arc(cx - z * 0.05, cy - z * 0.05, z * 0.04, 0, Math.PI * 2); g.fill(); }
          break;
      }
      g.restore();
    };
    function draw() {
      const r = cv.getBoundingClientRect();
      const W = r.width, H = r.height, cw = W / 3, z = Math.min(cw * 0.8, H / 3 * 0.95);
      g.clearRect(0, 0, W, H);
      for (let i = 0; i < 3; i++) {
        const reel = reels[i];
        const x0 = i * cw;
        const bg = g.createLinearGradient(x0, 0, x0 + cw, 0);
        bg.addColorStop(0, "#e6dcc3"); bg.addColorStop(0.5, "#fffaf0"); bg.addColorStop(1, "#e6dcc3");
        g.fillStyle = bg; g.fillRect(x0 + 2, 0, cw - 4, H);
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
        if (reel.held) { g.fillStyle = "rgba(60, 207, 134, .25)"; g.fillRect(x0 + 2, 0, cw - 4, H); g.fillStyle = "#127a49"; g.font = `800 12px ${FONT_NUM}`; g.textAlign = "center"; g.fillText("HELD", x0 + cw / 2, 16); }
        g.fillStyle = "rgba(43,5,16,.85)"; g.fillRect(x0 + cw - 2, 0, 4, H);
      }
      // The payline.
      g.strokeStyle = "rgba(212, 20, 44, .75)"; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
      g.fillStyle = "#d4142c";
      g.beginPath(); g.moveTo(0, H / 2 - 9); g.lineTo(12, H / 2); g.lineTo(0, H / 2 + 9); g.fill();
      g.beginPath(); g.moveTo(W, H / 2 - 9); g.lineTo(W - 12, H / 2); g.lineTo(W, H / 2 + 9); g.fill();
    }
    ctrl();
    return () => { ro.disconnect(); root.remove(); };
  },
};
