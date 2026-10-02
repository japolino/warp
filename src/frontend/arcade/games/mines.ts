// Mines: clear the board before the clock runs out. Numbers count the mines around a
// square; flag the ones you're sure of. One wrong square ends it — unless a life
// takes the blast. The first square is always safe.

import { clamp, shuffle, type GameDef, type Kit } from "../kit.js";
import { textureUrl } from "../themes.js";

const CSS = `
.mn { position: absolute; inset: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 12px; padding: 16px; align-items: center; justify-items: center; background: var(--ar-panel); }
.mn-bar { width: min(100%, 680px); display: flex; align-items: center; gap: 14px; }
.mn-time { flex: 1; height: 6px; border-radius: 3px; background: var(--ar-bg2); overflow: hidden; }
.mn-time i { display: block; height: 100%; background: var(--ar-ink); transition: width .25s linear; }
.mn-time.low i { background: var(--ar-bad); animation: mn-blink .6s steps(2) infinite; }
@keyframes mn-blink { 50% { opacity: .4; } }
.mn-count { font-family: var(--ar-num); font-weight: 700; font-size: 15px; min-width: 60px; text-align: center; color: var(--ar-ink); }
.mn-board { display: grid; gap: 2px; padding: 8px; touch-action: manipulation; }
.mn .mn-c { position: relative; border: 0; padding: 0; display: grid; place-items: center; width: var(--cell); height: var(--cell); font: 700 calc(var(--cell) * .5)/1 var(--ar-display); transition: transform 90ms, background 120ms, filter 120ms; }
.mn .mn-c:active:not(.open) { transform: scale(.94); }
.mn .mn-c.cur { outline: 2px solid var(--ar-ac2); outline-offset: 1px; z-index: 1; }
.mn .mn-c.open { animation: mn-pop .18s ease-out both; }
@keyframes mn-pop { from { transform: scale(.86); } }
.mn .mn-c.flag::after { content: ""; width: 42%; height: 46%; background: var(--mn-flag); clip-path: polygon(0 0, 100% 30%, 0 60%); box-shadow: inset 2px 0 0 var(--mn-pole); }
.mn .mn-c.mine::after, .mn .mn-c.boom::after, .mn .mn-c.saved::after { content: ""; width: 46%; height: 46%; border-radius: 50%; background: var(--mn-mine); box-shadow: 0 0 0 2px var(--mn-mine-ring); }
.mn .mn-c.boom { z-index: 2; animation: mn-boom .45s ease-out both; }
@keyframes mn-boom { from { transform: scale(1.6); } }
.mn .mn-c.wrong::after { content: "✕"; color: var(--ar-bad); font-size: calc(var(--cell) * .55); }
.mn .mn-c.hinted { outline: 2px solid var(--ar-good); outline-offset: 1px; }
.mn-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: center; }
.mn .mn-tool { padding: 8px 16px; border-radius: 999px; border: 1px solid var(--ar-line); background: transparent; color: var(--ar-ink); font: 600 13px var(--ar-ui); }
.mn .mn-tool.on { background: var(--ar-ink); color: var(--ar-panel); }
.mn .mn-tool:disabled { opacity: .4; }

/* modern: paper tiles that lift, flat opened squares */
.mn[data-style=modern] { --mn-flag: var(--ar-ac); --mn-pole: #1d1d1f; --mn-mine: #1d1d1f; --mn-mine-ring: rgba(29,29,31,.15); background: #f3f1ec; }
.mn[data-style=modern] .mn-board { background: #e4e1d9; border-radius: 14px; gap: 3px; }
.mn[data-style=modern] .mn-c { border-radius: 7px; background: #ffffff; box-shadow: 0 1px 0 rgba(0,0,0,.06), 0 2px 4px rgba(0,0,0,.05); color: var(--ar-ink); }
.mn[data-style=modern] .mn-c:hover:not(.open) { background: #fffaf4; box-shadow: 0 0 0 2px rgba(255, 90, 54, .35); }
.mn[data-style=modern] .mn-c.open { background: #ece9e2; box-shadow: none; }
.mn[data-style=modern] .mn-c.boom { background: var(--ar-bad); --mn-mine: #fff; --mn-mine-ring: rgba(255,255,255,.3); }
.mn[data-style=modern] .mn-c.saved { background: var(--ar-good); --mn-mine: #fff; }
.mn[data-style=modern] .mn-c.mine { background: #ece9e2; }
.mn[data-style=modern] .n1 { color: #2f6fe4; } .mn[data-style=modern] .n2 { color: #1f9d55; } .mn[data-style=modern] .n3 { color: #e0452b; } .mn[data-style=modern] .n4 { color: #6a3fd1; } .mn[data-style=modern] .n5 { color: #a8500f; } .mn[data-style=modern] .n6 { color: #00879e; } .mn[data-style=modern] .n7 { color: #1d1d1f; } .mn[data-style=modern] .n8 { color: #8e8e93; }

/* medieval: flagstones over packed earth, ink numerals, a red pennant, a black-powder keg */
.mn[data-style=medieval] { --mn-flag: #9e2b1f; --mn-pole: #3b2414; --mn-mine: radial-gradient(circle at 35% 35%, #5a5248, #1d1914 70%); --mn-mine-ring: #6b4a12; background: var(--ar-wood) 0 0 / 256px; box-shadow: inset 0 0 80px rgba(0,0,0,.6); }
.mn[data-style=medieval] .mn-board { background: #3b2414; box-shadow: 0 0 0 2px #b48a2c, 0 0 0 6px #2a1a0d, 0 0 0 7px rgba(180,138,44,.6), 0 18px 40px rgba(0,0,0,.5); gap: 2px; padding: 4px; }
.mn[data-style=medieval] .mn-c { border-radius: 2px; background: var(--mn-stone) 0 0 / 128px; box-shadow: inset 2px 2px 0 rgba(255, 240, 210, .28), inset -2px -2px 0 rgba(30, 18, 6, .45); color: #2c1f12; font-family: var(--ar-ui); font-weight: 700; font-size: calc(var(--cell) * .62); }
.mn[data-style=medieval] .mn-c:nth-child(3n) { filter: brightness(.94) sepia(.15); }
.mn[data-style=medieval] .mn-c:nth-child(7n+2) { filter: brightness(1.05); }
.mn[data-style=medieval] .mn-c:hover:not(.open) { filter: brightness(1.15) !important; }
.mn[data-style=medieval] .mn-c.open { background: var(--ar-parch) 0 0 / 512px; box-shadow: inset 0 0 8px rgba(110, 70, 25, .35); filter: none; }
.mn[data-style=medieval] .mn-c.boom { background: radial-gradient(circle, #f6dc8a 0 20%, #c2453a 50%, #5e110c 85%); }
.mn[data-style=medieval] .mn-c.saved { background: var(--ar-parch) 0 0 / 512px; box-shadow: inset 0 0 0 3px #3e6b3a; }
.mn[data-style=medieval] .mn-c.mine { background: var(--ar-parch) 0 0 / 512px; }
.mn[data-style=medieval] .n1 { color: #2c4a7a; } .mn[data-style=medieval] .n2 { color: #3e6b3a; } .mn[data-style=medieval] .n3 { color: #9e2b1f; } .mn[data-style=medieval] .n4 { color: #5e2f6b; } .mn[data-style=medieval] .n5 { color: #7a4a14; } .mn[data-style=medieval] .n6 { color: #2c5a5e; } .mn[data-style=medieval] .n7 { color: #2c1f12; } .mn[data-style=medieval] .n8 { color: #6b5638; }
.mn[data-style=medieval] .mn-count { color: #ecdfbf; font-family: var(--ar-display); }
.mn[data-style=medieval] .mn-time { background: rgba(236, 223, 191, .15); border-radius: 0; height: 8px; box-shadow: 0 0 0 1px rgba(180,138,44,.6); }
.mn[data-style=medieval] .mn-time i { background: linear-gradient(90deg, #e9c46a, #b48a2c); }
.mn[data-style=medieval] .mn-tool { border-radius: 2px; color: #ecdfbf; border-color: rgba(214,181,106,.5); font-family: var(--ar-display); font-size: 12px; letter-spacing: .1em; }
.mn[data-style=medieval] .mn-tool.on { background: #9e2b1f; color: #f3e7c8; border-color: #9e2b1f; }

/* sci-fi: dark console cells with a notch, mono readouts */
.mn[data-style=scifi] { --mn-flag: var(--ar-ac2); --mn-pole: var(--ar-ac2); --mn-mine: var(--ar-bad); --mn-mine-ring: rgba(239,100,97,.35); background: transparent; }
.mn[data-style=scifi] .mn-board { gap: 3px; }
.mn[data-style=scifi] .mn-c { background: #132131; box-shadow: inset 0 0 0 1px rgba(120,170,210,.22); color: var(--ar-ink); font-family: var(--ar-num); font-weight: 600; clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%); }
.mn[data-style=scifi] .mn-c:hover:not(.open) { background: #1a2e44; box-shadow: inset 0 0 0 1px var(--ar-ac); }
.mn[data-style=scifi] .mn-c.open { background: #080e16; box-shadow: inset 0 0 0 1px rgba(120,170,210,.07); clip-path: none; }
.mn[data-style=scifi] .mn-c.mine::after, .mn[data-style=scifi] .mn-c.boom::after { border-radius: 0; transform: rotate(45deg) scale(.8); }
.mn[data-style=scifi] .mn-c.boom { background: rgba(239,100,97,.25); box-shadow: inset 0 0 0 1px var(--ar-bad); }
.mn[data-style=scifi] .mn-c.saved { background: rgba(95,211,160,.18); box-shadow: inset 0 0 0 1px var(--ar-good); --mn-mine: var(--ar-good); }
.mn[data-style=scifi] .n1 { color: #5ec8e5; } .mn[data-style=scifi] .n2 { color: #5fd3a0; } .mn[data-style=scifi] .n3 { color: #f2a541; } .mn[data-style=scifi] .n4 { color: #c792ea; } .mn[data-style=scifi] .n5 { color: #ef6461; } .mn[data-style=scifi] .n6 { color: #8f9cff; } .mn[data-style=scifi] .n7 { color: #e0e6ec; } .mn[data-style=scifi] .n8 { color: #7d92a8; }
.mn[data-style=scifi] .mn-time { border-radius: 0; height: 8px; background: repeating-linear-gradient(90deg, rgba(120,170,210,.16) 0 6px, transparent 6px 8px); }
.mn[data-style=scifi] .mn-time i { background: var(--ar-ac); -webkit-mask: repeating-linear-gradient(90deg, #000 0 6px, transparent 6px 8px); mask: repeating-linear-gradient(90deg, #000 0 6px, transparent 6px 8px); }
.mn[data-style=scifi] .mn-count { color: var(--ar-ac); font-weight: 600; }
.mn[data-style=scifi] .mn-tool { border-radius: 0; font-family: var(--ar-num); font-size: 12px; }
.mn[data-style=scifi] .mn-tool.on { background: rgba(242,165,65,.15); color: var(--ar-ac2); border-color: var(--ar-ac2); }
`;

export const MINES: GameDef = {
  id: "mines",
  title: "Mines",
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
    root.dataset.style = kit.theme.style;
    if (kit.theme.style === "medieval") root.style.setProperty("--mn-stone", `url(${textureUrl("stone", kit.theme)})`);
    root.innerHTML = `<style>${CSS}</style>
      <div class="mn-bar"><span class="mn-count" data-mines>${mines}</span><div class="mn-time"><i style="width:100%"></i></div><span class="mn-count" data-time>${limit}s</span></div>
      <div class="mn-board" style="grid-template-columns:repeat(${cols}, var(--cell))"></div>
      <div class="mn-tools"><button class="mn-tool" data-flagmode>Flag mode</button><button class="mn-tool" data-hint ${hints ? "" : "disabled"}>Hint (${hints})</button></div>`;
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
        if (cell.n[i]) { b.textContent = String(cell.n[i]); b.classList.add(`n${cell.n[i]}`); }
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
      mineTxt.textContent = `${mines - cell.flag.filter(Boolean).length}`;
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
      hintBtn.textContent = `Hint (${hints})`;
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
