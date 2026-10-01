// Mines: clear the board before the clock runs out. Numbers count the mines around a
// square; flag the ones you're sure of. One wrong square ends it — unless a life
// takes the blast. The first square is always safe.

import { clamp, shuffle, type GameDef, type Kit } from "../kit.js";

const CSS = `
.mn { position: absolute; inset: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 10px; padding: 14px; align-items: center; justify-items: center; }
.mn-bar { width: min(100%, 720px); display: flex; align-items: center; gap: 12px; font-variant-numeric: tabular-nums; }
.mn-time { flex: 1; height: 8px; border-radius: 4px; background: rgba(255,255,255,.08); overflow: hidden; }
.mn-time i { display: block; height: 100%; background: linear-gradient(90deg, #ffb547, #ff6a3d); transition: width .25s linear; }
.mn-time.low i { background: #ff5d6c; animation: mn-blink .5s steps(2) infinite; }
@keyframes mn-blink { 50% { opacity: .45; } }
.mn-count { font-family: ui-monospace, Consolas, monospace; font-weight: 800; font-size: 15px; min-width: 64px; text-align: center; color: #ffd9a0; }
.mn-board { display: grid; gap: 3px; padding: 8px; border-radius: 14px; background: #10141b; box-shadow: inset 0 0 0 1px rgba(255,255,255,.06), 0 20px 50px rgba(0,0,0,.5); touch-action: manipulation; }
.mn-c { position: relative; border: 0; padding: 0; border-radius: 6px; display: grid; place-items: center; font: 800 calc(var(--cell) * .48)/1 "Bahnschrift", "Segoe UI", sans-serif;
  background: linear-gradient(160deg, #5d6b80, #3c4657); box-shadow: inset 0 2px 0 rgba(255,255,255,.22), inset 0 -3px 0 rgba(0,0,0,.35); color: #fff; width: var(--cell); height: var(--cell); transition: transform 90ms, background 120ms; }
.mn-c:hover:not(.open) { background: linear-gradient(160deg, #71819a, #4a5568); }
.mn-c:active:not(.open) { transform: scale(.94); }
.mn-c.cur { outline: 2px solid #ffb547; outline-offset: 1px; }
.mn-c.open { background: #1b212b; box-shadow: inset 0 0 0 1px rgba(255,255,255,.04); animation: mn-pop .18s ease-out both; }
@keyframes mn-pop { from { transform: scale(.82); filter: brightness(1.8); } }
.mn-c.flag::after { content: "⚑"; color: #ff6a3d; font-size: calc(var(--cell) * .55); text-shadow: 0 1px 0 rgba(0,0,0,.4); }
.mn-c.mine { background: radial-gradient(circle, #ff6a3d 0 30%, #7a1d1d 70%); }
.mn-c.mine::after { content: "✹"; color: #1a0a0a; font-size: calc(var(--cell) * .6); }
.mn-c.boom { background: radial-gradient(circle, #fff 0 15%, #ffcf3d 35%, #ff3d3d 70%); animation: mn-boom .5s ease-out both; z-index: 2; }
@keyframes mn-boom { from { transform: scale(1.8); } }
.mn-c.saved { background: radial-gradient(circle, #4fe0a4 0 30%, #11533c 70%); }
.mn-c.saved::after { content: "✹"; color: #062b1e; }
.mn-c.hinted { box-shadow: 0 0 0 2px #4fe0a4, 0 0 16px #4fe0a4; }
.mn-c.wrong::after { content: "✕"; color: #ff5d6c; }
.mn-n1 { color: #6cc7ff; } .mn-n2 { color: #4fe0a4; } .mn-n3 { color: #ff7a6b; } .mn-n4 { color: #b18cff; } .mn-n5 { color: #ffb547; } .mn-n6 { color: #4ee6e6; } .mn-n7 { color: #fff; } .mn-n8 { color: #aaa; }
.mn-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: center; }
.mn-tool { padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); color: #f6f2ea; font: 600 13px system-ui, sans-serif; }
.mn-tool.on { background: #ffb547; color: #1a1205; border-color: transparent; }
.mn-tool:disabled { opacity: .4; }
`;

export const MINES: GameDef = {
  id: "mines",
  title: "Mines",
  theme: { bg: "#0b0e13", bg2: "#232a35", accent: "#ffb547", accent2: "#ff6a3d" },
  howTo: [
    "Open squares; a number says how many of the 8 around it are mines.",
    "Flag mines you're sure of. Click a number with its mines all flagged to open the rest.",
    "Clear every safe square before time runs out. The more you clear, the better it goes.",
  ],
  controls: "Click to open · right-click or long-press to flag · arrows + Space / F",
  start(kit: Kit) {
    const L = kit.play.level;
    const rows = 8 + Math.round(L * 3), cols = rows + 3;
    const total = rows * cols;
    const mines = Math.round(total * (0.11 + 0.11 * L));
    const safe = total - mines;
    const limit = Math.round((30 + safe * 0.7) * (1.15 - 0.3 * L) * (1 + kit.aid("time") / 100));
    let hints = kit.aid("hint");
    const cell = { mine: new Array<boolean>(total).fill(false), open: new Array<boolean>(total).fill(false), flag: new Array<boolean>(total).fill(false), n: new Array<number>(total).fill(0) };
    let placed = false, opened = 0, over = false, timeLeft = limit, cur = Math.floor(total / 2), flagMode = false, saves = 0;

    const root = document.createElement("div");
    root.className = "mn";
    root.innerHTML = `<style>${CSS}</style>
      <div class="mn-bar"><span class="mn-count" data-mines>✹ ${mines}</span><div class="mn-time"><i style="width:100%"></i></div><span class="mn-count" data-time>${limit}s</span></div>
      <div class="mn-board" style="grid-template-columns:repeat(${cols}, var(--cell))"></div>
      <div class="mn-tools"><button class="mn-tool" data-flagmode>⚑ Flag mode</button><button class="mn-tool" data-hint ${hints ? "" : "disabled"}>✦ Hint (${hints})</button></div>`;
    kit.root.appendChild(root);
    const board = root.querySelector<HTMLElement>(".mn-board")!;
    const timeBar = root.querySelector<HTMLElement>(".mn-time")!;
    const timeTxt = root.querySelector<HTMLElement>("[data-time]")!;
    const mineTxt = root.querySelector<HTMLElement>("[data-mines]")!;
    const hintBtn = root.querySelector<HTMLButtonElement>("[data-hint]")!;
    const flagBtn = root.querySelector<HTMLButtonElement>("[data-flagmode]")!;
    board.innerHTML = Array.from({ length: total }, (_, i) => `<button class="mn-c" data-i="${i}" aria-label="Square"></button>`).join("");
    const btns = [...board.children] as HTMLButtonElement[];
    const size = () => {
      const r = root.getBoundingClientRect();
      const s = Math.floor(Math.min((r.width - 40) / cols, (r.height - 130) / rows)) - 3;
      board.style.setProperty("--cell", `${Math.max(22, Math.min(54, s))}px`);
    };
    const ro = new ResizeObserver(size); ro.observe(root); size();

    const around = (i: number) => {
      const x = i % cols, y = Math.floor(i / cols), out: number[] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) out.push(ny * cols + nx);
      }
      return out;
    };
    const place = (first: number) => {
      const keep = new Set([first, ...around(first)]);
      const pool = shuffle([...Array(total).keys()].filter((i) => !keep.has(i)), kit.rng).slice(0, mines);
      for (const i of pool) cell.mine[i] = true;
      for (let i = 0; i < total; i++) cell.n[i] = around(i).filter((j) => cell.mine[j]).length;
      placed = true;
    };
    const score = () => (opened >= safe ? 1 : Math.pow(opened / safe, 1.6));
    const paint = (i: number) => {
      const b = btns[i];
      b.className = "mn-c" + (i === cur ? " cur" : "");
      b.textContent = "";
      if (cell.open[i]) {
        b.classList.add("open");
        if (cell.n[i]) { b.textContent = String(cell.n[i]); b.classList.add(`mn-n${cell.n[i]}`); }
      } else if (cell.flag[i]) b.classList.add("flag");
    };
    const flood = (start: number) => {
      const stack = [start];
      let k = 0;
      while (stack.length) {
        const i = stack.pop()!;
        if (cell.open[i] || cell.flag[i] || cell.mine[i]) continue;
        cell.open[i] = true; opened++; k++;
        paint(i);
        if (cell.n[i] === 0) stack.push(...around(i));
      }
      return k;
    };
    const progress = () => {
      kit.score(score());
      kit.status(`${opened} / ${safe} safe\n${cell.flag.filter(Boolean).length} flagged`);
      const elapsed = 1 - timeLeft / limit;
      kit.track(clamp((opened / safe) / Math.max(0.15, elapsed)));
      mineTxt.textContent = `✹ ${mines - cell.flag.filter(Boolean).length}`;
      if (opened >= safe) finish("cleared");
    };
    const open = (i: number) => {
      if (over || kit.paused || cell.open[i] || cell.flag[i]) return;
      if (!placed) place(i);
      if (cell.mine[i]) {
        kit.shake(1.6);
        kit.synth.fx("boom");
        if (kit.lives.spend("Shielded!")) {
          saves++;
          cell.flag[i] = true;
          btns[i].className = "mn-c saved";
          return;
        }
        btns[i].classList.add("boom");
        finish("boom", i);
        return;
      }
      const k = flood(i);
      kit.synth.fx("reveal", Math.min(12, k));
      progress();
    };
    const chord = (i: number) => {
      if (!cell.open[i] || !cell.n[i]) return;
      const nb = around(i);
      if (nb.filter((j) => cell.flag[j]).length !== cell.n[i]) return;
      for (const j of nb) if (!cell.open[j] && !cell.flag[j]) open(j);
    };
    const flag = (i: number) => {
      if (over || kit.paused || cell.open[i]) return;
      cell.flag[i] = !cell.flag[i];
      kit.synth.fx("flag");
      paint(i);
      progress();
    };
    const hint = () => {
      if (!hints || over || kit.paused) return;
      if (!placed) { open(cur); }
      // A safe square on the edge of what's open, else any safe one.
      const edge = [...Array(total).keys()].filter((i) => !cell.open[i] && !cell.mine[i] && !cell.flag[i] && around(i).some((j) => cell.open[j]));
      const pool = edge.length ? edge : [...Array(total).keys()].filter((i) => !cell.open[i] && !cell.mine[i]);
      if (!pool.length) return;
      const i = pool[Math.floor(kit.rng() * pool.length)];
      hints--;
      hintBtn.textContent = `✦ Hint (${hints})`;
      hintBtn.disabled = !hints;
      open(i);
      btns[i].classList.add("hinted");
      setTimeout(() => btns[i].classList.remove("hinted"), 900);
    };
    const finish = (how: "cleared" | "boom" | "time", at?: number) => {
      if (over) return;
      over = true;
      // Show the board as it was.
      for (let i = 0; i < total; i++) {
        if (cell.mine[i] && !cell.flag[i] && i !== at) btns[i].classList.add("mine");
        if (cell.flag[i] && !cell.mine[i]) btns[i].classList.add("wrong");
      }
      const s = score();
      kit.score(s);
      if (how === "cleared") { kit.synth.fx("win"); kit.banner("Cleared!", "good"); }
      else if (how === "time") { kit.synth.fx("lose"); kit.banner("Time!", "bad"); }
      const beats = how === "cleared"
        ? [timeLeft > limit * 0.4 ? "cleared it with time to spare" : timeLeft < limit * 0.1 ? "cleared it with seconds left" : "cleared it"]
        : how === "boom" ? [s > 0.7 ? "one wrong move, late, when it was nearly done" : "one wrong move"] : ["ran out of time"];
      if (saves) beats.push("got away with a mistake");
      kit.finish({ score: s, beats, detail: `${opened} of ${safe} safe squares, ${mines} mines` });
    };

    // Long-press flags on touch; the click that follows it is swallowed.
    let press: number | null = null, swallow = false;
    board.addEventListener("pointerdown", (e) => {
      swallow = false;
      if (e.pointerType === "mouse") return;
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
      if (!b) return;
      const i = Number(b.dataset.i);
      press = window.setTimeout(() => { press = null; swallow = true; flag(i); }, 380);
    });
    const cancel = () => { if (press !== null) { clearTimeout(press); press = null; } };
    board.addEventListener("pointerup", cancel);
    board.addEventListener("pointercancel", cancel);
    board.addEventListener("click", (e) => {
      if (swallow) { swallow = false; return; }
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
      if (!b) return;
      const i = Number(b.dataset.i);
      const old = cur; cur = i; paint(old); paint(i);
      if (flagMode && !cell.open[i]) flag(i);
      else if (cell.open[i]) chord(i);
      else open(i);
    });
    board.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
      if (b && !swallow) flag(Number(b.dataset.i));
    });
    hintBtn.addEventListener("click", hint);
    flagBtn.addEventListener("click", () => { flagMode = !flagMode; flagBtn.classList.toggle("on", flagMode); });
    kit.onKey((e, down) => {
      if (!down) return false;
      const k = e.key.toLowerCase();
      const x = cur % cols, y = Math.floor(cur / cols);
      const move = (nx: number, ny: number) => { const old = cur; cur = Math.max(0, Math.min(rows - 1, ny)) * cols + Math.max(0, Math.min(cols - 1, nx)); paint(old); paint(cur); };
      if (k === "arrowleft") move(x - 1, y); else if (k === "arrowright") move(x + 1, y);
      else if (k === "arrowup") move(x, y - 1); else if (k === "arrowdown") move(x, y + 1);
      else if (k === " " || k === "enter") { if (cell.open[cur]) chord(cur); else open(cur); }
      else if (k === "f") flag(cur);
      else if (k === "h") hint();
      else return false;
      return true;
    });
    kit.onQuit(() => finish("time"));
    let acc = 0;
    kit.loop((dt) => {
      if (over) return;
      if (!placed) return; // the clock starts with the first square
      timeLeft = Math.max(0, timeLeft - dt);
      acc += dt;
      if (acc > 0.2) {
        acc = 0;
        timeBar.querySelector("i")!.setAttribute("style", `width:${(timeLeft / limit) * 100}%`);
        timeBar.classList.toggle("low", timeLeft < Math.min(10, limit * 0.2));
        timeTxt.textContent = `${Math.ceil(timeLeft)}s`;
      }
      if (timeLeft <= 0) finish("time");
    });
    progress();
    kit.status(`${safe} safe squares\nclock starts on your first`);
    return () => { ro.disconnect(); root.remove(); };
  },
};
