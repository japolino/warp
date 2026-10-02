// Stack: fit falling blocks together and clear lines before the stack reaches the top
// or the clock runs out. Clearing four at once counts extra. The music is
// Korobeiniki, a Russian folk song, and it speeds up as the stack climbs.

import { clamp, Floaters, rrect, shuffle, Sparks, type GameDef, type Kit } from "../kit.js";
import { brackets, glow, ground, lift, paint, unlift } from "../themes.js";
import { KOROBEINIKI, parseLine } from "../songs.js";

const W = 10, H = 20;
type P = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
const SHAPES: Record<P, [number, number][]> = {
  I: [[-1, 0], [0, 0], [1, 0], [2, 0]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[-1, 0], [0, 0], [1, 0], [0, -1]],
  S: [[-1, 0], [0, 0], [0, -1], [1, -1]],
  Z: [[-1, -1], [0, -1], [0, 0], [1, 0]],
  J: [[-1, -1], [-1, 0], [0, 0], [1, 0]],
  L: [[1, -1], [-1, 0], [0, 0], [1, 0]],
};
const ORDER: P[] = ["Z", "O", "J", "S", "T", "L", "I"];
const KICKS: [number, number][] = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [0, 1]];
const BASS = "E2/.5 E3 E2 E3 E2 E3 E2 E3 | A2 A3 A2 A3 A2 A3 A2 A3 | E2 E3 E2 E3 E2 E3 E2 E3 | A2 A3 A2 A3 A2 A3 A2 A3 | D2 D3 D2 D3 D2 D3 D2 D3 | C2 C3 C2 C3 C2 C3 C2 C3 | E2 E3 E2 E3 E2 E3 E2 E3 | A2 A3 A2 A3 A2 A3 A2 A3";

export const STACK: GameDef = {
  id: "stack",
  title: "Stack",
  howTo: [
    "Blocks fall one at a time. Move and turn them to fill whole rows — full rows clear.",
    "Clear enough lines before time's up. Four at once counts as five.",
    "If the stack reaches the top, it's over.",
  ],
  controls: "← → move · ↑ / X turn · Z turn back · ↓ soft drop · Space drop · C / Shift hold · swipe & tap on touch",
  start(kit: Kit) {
    const L = kit.play.level;
    const goal = Math.round(4 + L * 10);
    const limit = Math.round(goal * 13 * (1.25 - 0.25 * L) * (1 + kit.aid("time") / 100));
    const gravity = (1 + L * 4.5) * (1 - kit.aid("slow") / 100);
    const previews = Math.min(5, (L < 0.5 ? 2 : 1) + kit.aid("preview"));
    const canHold = kit.aid("hold") > 0 || L < 0.35;
    const grid: (P | null)[][] = Array.from({ length: H }, () => Array<P | null>(W).fill(null));
    let bag: P[] = [];
    const queue: P[] = [];
    const next = (): P => { if (!bag.length) bag = shuffle(["I", "O", "T", "S", "Z", "J", "L"] as P[], kit.rng); return bag.pop()!; };
    while (queue.length < 6) queue.push(next());
    let cur = { p: queue.shift()! as P, x: 4, y: 1, r: 0 };
    queue.push(next());
    let hold: P | null = null, held = false;
    let lines = 0, credit = 0, timeLeft = limit, fall = 0, lock = 0, lockResets = 0, over = false, clearing: { rows: number[]; t: number } | null = null;
    let tetrises = 0, maxHeight = 0;
    const c = kit.canvas();
    const g = c.g;
    const t = kit.theme;
    const colorOf = (p: P) => t.pieces[ORDER.indexOf(p)];
    const sparks = new Sparks(), floats = new Floaters(t.fontDisplay, t.light ? "rgba(255,255,255,.75)" : null);

    const cells = (p: P, r: number, x: number, y: number) => SHAPES[p].map(([cx, cy]) => {
      let a = cx, b = cy;
      if (p !== "O") for (let k = 0; k < (r & 3); k++) { const t = a; a = -b; b = t; if (p === "I") { /* keep the bar centred */ } }
      return [x + a, y + b] as [number, number];
    });
    const fits = (p: P, r: number, x: number, y: number) => cells(p, r, x, y).every(([a, b]) => a >= 0 && a < W && b < H && (b < 0 || !grid[b][a]));
    const ghostY = () => { let y = cur.y; while (fits(cur.p, cur.r, cur.x, y + 1)) y++; return y; };
    const resetLock = () => { if (lockResets < 15) { lock = 0; lockResets++; } };

    const move = (dx: number) => { if (fits(cur.p, cur.r, cur.x + dx, cur.y)) { cur.x += dx; kit.synth.fx("tick"); resetLock(); } };
    const rotate = (dir: 1 | -1) => {
      const r = (cur.r + dir + 4) % 4;
      for (const [kx, ky] of KICKS) if (fits(cur.p, r, cur.x + kx, cur.y + ky)) { cur.x += kx; cur.y += ky; cur.r = r; kit.synth.fx("rotate"); resetLock(); return; }
    };
    const spawn = () => {
      cur = { p: queue.shift()!, x: 4, y: 1, r: 0 };
      queue.push(next());
      held = false; lock = 0; lockResets = 0; fall = 0;
      if (!fits(cur.p, cur.r, cur.x, cur.y)) topOut();
    };
    const doHold = () => {
      if (!canHold || held) return;
      const p = cur.p;
      if (hold) { cur = { p: hold, x: 4, y: 1, r: 0 }; } else spawn();
      hold = p; held = true;
      kit.synth.fx("click");
    };
    const place = () => {
      for (const [a, b] of cells(cur.p, cur.r, cur.x, cur.y)) if (b >= 0) grid[b][a] = cur.p;
      kit.synth.fx("drop");
      const full = grid.map((row, i) => (row.every(Boolean) ? i : -1)).filter((i) => i >= 0);
      const top = grid.findIndex((row) => row.some(Boolean));
      maxHeight = Math.max(maxHeight, top < 0 ? 0 : H - top);
      if (full.length) {
        clearing = { rows: full, t: 0 };
        const n = full.length === 4 ? 5 : full.length;
        lines += full.length; credit += n;
        if (full.length === 4) { tetrises++; kit.synth.fx("tetris"); kit.banner("Four lines!", "gold"); kit.shake(0.8); } else kit.synth.fx("line");
        const B = board();
        for (const row of full) for (let x = 0; x < W; x++) sparks.burst(B.x + (x + 0.5) * B.s, B.y + (row + 0.5) * B.s, colorOf(grid[row][x] ?? "I"), 3, 160, 2.5);
        floats.add(B.x + B.w / 2, B.y + (full[0] + 0.5) * B.s, full.length === 4 ? "+5" : `+${full.length}`, t.style === "medieval" ? "#9e2b1f" : t.gold, 26);
        kit.score(clamp(credit / goal));
        kit.track(clamp((credit / goal) / Math.max(0.15, 1 - timeLeft / limit)));
        if (credit >= goal) setTimeout(() => finish("goal"), 400);
      } else spawn();
      status();
    };
    const hardDrop = () => { const y = ghostY(); const d = y - cur.y; cur.y = y; place(); if (d > 2) kit.shake(0.3); };
    const topOut = () => {
      kit.synth.fx("crash"); kit.shake(1.4);
      if (kit.lives.spend("Cleared the top!")) {
        // A second chance: the bottom half is wiped away.
        for (let y = 0; y < H; y++) if (y >= H / 2) grid[y].fill(null);
        const rows = grid.splice(H / 2); grid.unshift(...rows);
        cur = { p: cur.p, x: 4, y: 1, r: 0 };
        return;
      }
      finish("top");
    };
    const status = () => kit.status(`Lines ${Math.min(credit, goal)} / ${goal}\n${Math.ceil(timeLeft)}s left`);
    const finish = (how: "goal" | "top" | "time") => {
      if (over) return;
      over = true;
      const s = clamp(credit / goal);
      kit.score(s);
      if (how === "goal") { kit.synth.fx("win"); kit.banner("Done!", "good"); }
      const beats = how === "goal"
        ? [timeLeft > limit * 0.4 ? "made it look easy" : timeLeft < limit * 0.1 ? "got there with seconds left" : "got it done"]
        : how === "top" ? ["it all piled up"] : ["ran out of time"];
      if (tetrises) beats.push(tetrises > 1 ? "some beautifully neat work" : "one beautifully neat moment");
      if (maxHeight > H * 0.75 && how === "goal") beats.push("came close to losing it");
      kit.finish({ score: s, beats, detail: `${lines} lines cleared${tetrises ? `, ${tetrises} four-at-once` : ""}` });
    };

    // Input: keys with auto-repeat for left/right and soft drop.
    const held_ = { left: 0, right: 0, down: false };
    let das = 0;
    kit.onKey((e, down) => {
      const k = e.key.toLowerCase();
      if (over || clearing) return ["arrowleft", "arrowright", "arrowdown", "arrowup", " "].includes(k);
      if (k === "arrowleft") { if (down && !e.repeat) { move(-1); das = 0; } held_.left = down ? 1 : 0; return true; }
      if (k === "arrowright") { if (down && !e.repeat) { move(1); das = 0; } held_.right = down ? 1 : 0; return true; }
      if (k === "arrowdown") { held_.down = down; return true; }
      if (!down || e.repeat) return ["arrowup", "x", "z", " ", "c", "shift"].includes(k);
      if (k === "arrowup" || k === "x") { rotate(1); return true; }
      if (k === "z") { rotate(-1); return true; }
      if (k === " ") { hardDrop(); return true; }
      if (k === "c" || k === "shift") { doHold(); return true; }
      return false;
    });
    // Touch: drag sideways to move, tap to turn, flick down to drop, two-finger tap to hold.
    let drag: { x: number; y: number; moved: number; t: number; cx: number } | null = null;
    c.el.addEventListener("pointerdown", (e) => { c.el.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now(), cx: cur.x }; });
    c.el.addEventListener("pointermove", (e) => {
      if (!drag || over || clearing || kit.paused) return;
      const B = board();
      const want = drag.cx + Math.round((e.clientX - drag.x) / (B.s * 0.9));
      while (cur.x < want && fits(cur.p, cur.r, cur.x + 1, cur.y)) { cur.x++; drag.moved++; }
      while (cur.x > want && fits(cur.p, cur.r, cur.x - 1, cur.y)) { cur.x--; drag.moved++; }
    });
    c.el.addEventListener("pointerup", (e) => {
      if (!drag || over || clearing || kit.paused) { drag = null; return; }
      const dy = e.clientY - drag.y, dt = performance.now() - drag.t;
      if (dy > 60 && dt < 350) hardDrop();
      else if (!drag.moved && Math.abs(dy) < 12 && dt < 300) rotate(1);
      else if (dy < -60 && dt < 350) doHold();
      drag = null;
    });

    // Music: Korobeiniki, faster as the stack climbs.
    const mel = parseLine(KOROBEINIKI), bass = parseLine(BASS);
    const tuneBeats = 32;
    const speed = () => 1 + clamp(maxHeight / H) * 0.35 + L * 0.15;
    let stopMusic = () => {};
    const startMusic = () => {
      stopMusic();
      stopMusic = kit.synth.loop(() => 150 * speed(), (_, at, beat) => {
        for (const n of mel) kit.synth.note(n.midi[0], at + n.b * beat, n.d * beat * 0.9, "pluck", 0.4);
        for (const n of bass) kit.synth.note(n.midi[0], at + n.b * beat, n.d * beat * 0.8, "bass", 0.38);
        for (let k = 0; k < tuneBeats; k++) { kit.synth.drum(k % 2 ? "snare" : "kick", at + k * beat, 0.3); kit.synth.drum("hat", at + (k + 0.5) * beat, 0.18); }
      }, tuneBeats);
    };
    kit.onPause((p) => { if (p) { stopMusic(); kit.synth.hush(); } else if (!over) startMusic(); });
    kit.onQuit(() => finish("time"));

    const board = () => {
      const s = Math.floor(Math.min((c.h - 24) / H, (c.w - 300) / W, 36));
      const w = s * W, h = s * H;
      return { s: Math.max(12, s), x: Math.round((c.w - w) / 2), y: Math.round((c.h - h) / 2), w, h };
    };

    kit.loop((dt) => {
      if (over) { draw(); return; }
      timeLeft = Math.max(0, timeLeft - dt);
      if (timeLeft <= 0) { finish("time"); return; }
      if (clearing) {
        clearing.t += dt;
        if (clearing.t > 0.28) {
          for (const row of clearing.rows.sort((a, b) => a - b)) { grid.splice(row, 1); grid.unshift(Array<P | null>(W).fill(null)); }
          clearing = null;
          if (!over) spawn();
        }
      } else {
        // Auto-repeat.
        if (held_.left || held_.right) { das += dt; if (das > 0.16) { das -= 0.045; move(held_.left ? -1 : 1); } }
        const g2 = held_.down ? Math.max(gravity * 8, 18) : gravity;
        fall += dt * g2;
        while (fall >= 1) {
          fall -= 1;
          if (fits(cur.p, cur.r, cur.x, cur.y + 1)) { cur.y++; lock = 0; } else break;
        }
        if (!fits(cur.p, cur.r, cur.x, cur.y + 1)) { lock += dt; if (lock > 0.5) place(); }
      }
      sparks.step(dt); floats.step(dt);
      if (Math.floor(timeLeft * 4) !== Math.floor((timeLeft + dt) * 4)) status();
      draw();
    });

    // ───────── drawing ─────────

    /** One block in the look's material: carved stone, flat colour, or a glass pane. */
    const block = (x: number, y: number, s: number, p: P, alpha = 1) => {
      const col = colorOf(p);
      g.globalAlpha = alpha;
      if (t.style === "medieval") {
        g.fillStyle = col; g.fillRect(x + 1, y + 1, s - 2, s - 2);
        g.globalAlpha = alpha * 0.35; paint(g, "stone", t, x + 1, y + 1, s - 2, s - 2); g.globalAlpha = alpha;
        // Chiselled edges: light above and left, shadow below and right.
        g.fillStyle = "rgba(255, 240, 210, .28)"; g.fillRect(x + 1, y + 1, s - 2, 2); g.fillRect(x + 1, y + 1, 2, s - 2);
        g.fillStyle = "rgba(20, 10, 2, .4)"; g.fillRect(x + 1, y + s - 3, s - 2, 2); g.fillRect(x + s - 3, y + 1, 2, s - 2);
        g.strokeStyle = "rgba(20, 10, 2, .5)"; g.lineWidth = 1; g.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3);
      } else if (t.style === "modern") {
        g.fillStyle = col; rrect(g, x + 1, y + 1, s - 2, s - 2, Math.max(2, s * 0.16)); g.fill();
        g.fillStyle = "rgba(255,255,255,.18)"; rrect(g, x + 1, y + 1, s - 2, (s - 2) * 0.45, Math.max(2, s * 0.16)); g.fill();
      } else {
        g.fillStyle = `${col}2e`; g.fillRect(x + 1.5, y + 1.5, s - 3, s - 3);
        glow(g, t, col, 6);
        g.strokeStyle = col; g.lineWidth = 1.5; g.strokeRect(x + 2, y + 2, s - 4, s - 4);
        g.shadowBlur = 0;
        g.fillStyle = col; g.fillRect(x + s * 0.38, y + s * 0.38, s * 0.24, s * 0.24);
      }
      g.globalAlpha = 1;
    };
    const ghost = (x: number, y: number, s: number, p: P) => {
      const col = colorOf(p);
      if (t.style === "modern") { g.fillStyle = "rgba(29,29,31,.07)"; rrect(g, x + 1, y + 1, s - 2, s - 2, Math.max(2, s * 0.16)); g.fill(); return; }
      g.setLineDash([3, 3]);
      g.strokeStyle = t.style === "medieval" ? "rgba(236, 223, 191, .5)" : `${col}99`; g.lineWidth = 1.5;
      g.strokeRect(x + 2.5, y + 2.5, s - 5, s - 5);
      g.setLineDash([]);
    };
    const mini = (p: P, cx: number, cy: number, s: number, alpha = 1) => {
      const pts = cells(p, 0, 0, 0);
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      const w = (Math.max(...xs) - Math.min(...xs) + 1) * s, h = (Math.max(...ys) - Math.min(...ys) + 1) * s;
      for (const [a, b] of pts) block(cx - w / 2 + (a - Math.min(...xs)) * s, cy - h / 2 + (b - Math.min(...ys)) * s, s, p, alpha);
    };
    /** The side boxes: hold, next, lines and time. */
    const panel = (x: number, y: number, w: number, h: number, title: string) => {
      if (t.style === "medieval") {
        lift(g, t, 1.5); g.fillStyle = "#2a1a0d"; g.fillRect(x, y, w, h); unlift(g);
        paint(g, "parchment", t, x + 3, y + 3, w - 6, h - 6);
        g.strokeStyle = "#b48a2c"; g.lineWidth = 1; g.strokeRect(x + 6.5, y + 6.5, w - 13, h - 13);
        g.fillStyle = "#9e2b1f"; g.font = `700 11px ${t.fontDisplay}`;
      } else if (t.style === "modern") {
        lift(g, t, 1); g.fillStyle = "#fff"; rrect(g, x, y, w, h, 14); g.fill(); unlift(g);
        g.fillStyle = t.inkSoft; g.font = `700 10.5px ${t.fontUi}`;
      } else {
        g.fillStyle = "rgba(10, 17, 27, .9)"; g.fillRect(x, y, w, h);
        g.strokeStyle = "rgba(120, 170, 210, .22)"; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        brackets(g, x, y, w, h, t.accent, 8);
        g.fillStyle = t.accent; g.font = `500 10.5px ${t.fontNum}`;
      }
      g.textAlign = "center"; g.textBaseline = "top";
      g.fillText(t.style === "scifi" ? `// ${title}` : title.toUpperCase(), x + w / 2, y + 12);
    };
    const inkOn = () => (t.style === "medieval" ? "#2c1f12" : t.ink);

    function draw() {
      const B = board();
      g.clearRect(0, 0, c.w, c.h);
      ground(g, t, c.w, c.h, t.style === "medieval" ? "table" : "page");
      // The well.
      if (t.style === "medieval") {
        lift(g, t, 2); g.fillStyle = "#1a0f06"; g.fillRect(B.x - 10, B.y - 10, B.w + 20, B.h + 20); unlift(g);
        g.strokeStyle = "#b48a2c"; g.lineWidth = 2; g.strokeRect(B.x - 6, B.y - 6, B.w + 12, B.h + 12);
        g.fillStyle = "#24170c"; g.fillRect(B.x, B.y, B.w, B.h);
        g.strokeStyle = "rgba(236, 223, 191, .05)";
      } else if (t.style === "modern") {
        lift(g, t, 2); g.fillStyle = "#ffffff"; rrect(g, B.x - 8, B.y - 8, B.w + 16, B.h + 16, 14); g.fill(); unlift(g);
        g.strokeStyle = "rgba(29, 29, 31, .05)";
      } else {
        g.fillStyle = "rgba(8, 14, 22, .92)"; g.fillRect(B.x, B.y, B.w, B.h);
        g.strokeStyle = "rgba(120, 170, 210, .25)"; g.lineWidth = 1; g.strokeRect(B.x - 0.5, B.y - 0.5, B.w + 1, B.h + 1);
        brackets(g, B.x - 6, B.y - 6, B.w + 12, B.h + 12, t.accent, 14);
        g.strokeStyle = "rgba(120, 170, 210, .07)";
      }
      g.lineWidth = 1;
      for (let x = 1; x < W; x++) { g.beginPath(); g.moveTo(B.x + x * B.s + 0.5, B.y); g.lineTo(B.x + x * B.s + 0.5, B.y + B.h); g.stroke(); }
      for (let y = 1; y < H; y++) { g.beginPath(); g.moveTo(B.x, B.y + y * B.s + 0.5); g.lineTo(B.x + B.w, B.y + y * B.s + 0.5); g.stroke(); }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = grid[y][x];
        if (!p) continue;
        if (clearing?.rows.includes(y)) {
          const k = 1 - clearing.t / 0.28;
          g.fillStyle = t.style === "medieval" ? `rgba(233, 196, 106, ${k})` : t.style === "modern" ? `rgba(255, 255, 255, ${k})` : `rgba(94, 200, 229, ${k * 0.8})`;
          g.fillRect(B.x + x * B.s, B.y + y * B.s, B.s, B.s);
        } else block(B.x + x * B.s, B.y + y * B.s, B.s, p);
      }
      if (!clearing && !over) {
        const gy = ghostY();
        for (const [a, b] of cells(cur.p, cur.r, cur.x, gy)) if (b >= 0) ghost(B.x + a * B.s, B.y + b * B.s, B.s, cur.p);
        for (const [a, b] of cells(cur.p, cur.r, cur.x, cur.y)) if (b >= 0) block(B.x + a * B.s, B.y + b * B.s, B.s, cur.p);
      }
      // Hold, next, lines and time.
      const side = Math.min(130, (c.w - B.w) / 2 - 36);
      const ms = Math.max(9, Math.min(18, B.s * 0.55));
      if (side > 64) {
        const lx = B.x - 24 - side, rx = B.x + B.w + 24;
        if (canHold) { panel(lx, B.y, side, 92, "Hold"); if (hold) mini(hold, lx + side / 2, B.y + 58, ms, held ? 0.4 : 1); }
        const nh = 40 + previews * ms * 3;
        panel(rx, B.y, side, nh, "Next");
        for (let i = 0; i < previews; i++) mini(queue[i], rx + side / 2, B.y + 48 + i * ms * 3 + ms, i ? ms * 0.8 : ms);
        const sy = canHold ? B.y + 108 : B.y;
        panel(lx, sy, side, 130, "Lines");
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillStyle = inkOn(); g.font = `${t.style === "medieval" ? 700 : t.style === "scifi" ? 600 : 800} ${Math.round(Math.min(30, side * 0.26))}px ${t.style === "scifi" ? t.fontNum : t.fontDisplay}`;
        g.fillText(`${Math.min(credit, goal)} / ${goal}`, lx + side / 2, sy + 52);
        g.fillStyle = timeLeft < 10 ? t.bad : t.style === "medieval" ? "#6b5638" : t.inkSoft;
        g.font = `${t.style === "scifi" ? 500 : 600} 15px ${t.style === "scifi" ? t.fontNum : t.fontUi}`;
        g.fillText(`${Math.ceil(timeLeft)}s left`, lx + side / 2, sy + 92);
      }
      sparks.draw(g); floats.draw(g);
    }

    status();
    return () => { stopMusic(); };
  },
};
