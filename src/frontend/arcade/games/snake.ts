// Snake: eat, grow, don't run into yourself (or the walls). Get enough before time's
// up. Harder checks are faster, with rocks in the way.

import { clamp, Floaters, rrect, Sparks, withMusic, type GameDef, type Kit } from "../kit.js";
import { brackets, glow, ground, lift, paint, unlift } from "../themes.js";
import { backing } from "../synth.js";

type V = { x: number; y: number };
const DIRS: Record<string, V> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const KEYMAP: Record<string, keyof typeof DIRS> = { arrowup: "up", w: "up", arrowdown: "down", s: "down", arrowleft: "left", a: "left", arrowright: "right", d: "right" };

export const SNAKE: GameDef = {
  id: "snake",
  title: "Snake",
  howTo: [
    "Steer the snake to the food. Every bite makes it longer — and a little faster.",
    "Don't hit the walls, the rocks, or your own tail.",
    "Eat enough before the clock runs out.",
  ],
  controls: "Arrows or WASD · swipe on touch",
  start(kit: Kit) {
    const L = kit.play.level;
    const cols = 24, rows = 15;
    const goal = Math.round(8 + L * 14);
    const limit = Math.round(goal * 4.2 * (1.25 - 0.25 * L) * (1 + kit.aid("time") / 100));
    const wrap = kit.aid("wrap") > 0;
    const baseSpeed = (6.5 + L * 7) * (1 - kit.aid("slow") / 100);
    const rocks: V[] = [];
    const nRocks = L > 0.45 ? Math.round((L - 0.45) * 22) : 0;
    let snake: V[] = [];
    let dir = DIRS.right, queue: V[] = [];
    let food: V = { x: 0, y: 0 }, eaten = 0, timeLeft = limit, step = 0, over = false, grace = 0, crashes = 0, close = 0;
    const c = kit.canvas();
    const g = c.g;
    const t = kit.theme;
    const sparks = new Sparks(), floats = new Floaters(t.fontDisplay, t.light ? "rgba(255,255,255,.75)" : null);
    const foodColor = t.style === "scifi" ? t.accent2 : t.style === "modern" ? "#e7471d" : "#a8281c";
    const key = (v: V) => `${v.x},${v.y}`;
    const occupied = () => new Set([...snake, ...rocks].map(key));

    const reset = () => {
      const y = Math.floor(rows / 2);
      snake = [{ x: 6, y }, { x: 5, y }, { x: 4, y }, { x: 3, y }];
      dir = DIRS.right; queue = [];
    };
    const placeFood = () => {
      const taken = occupied();
      const free: V[] = [];
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!taken.has(`${x},${y}`)) free.push({ x, y });
      food = free[Math.floor(kit.rng() * free.length)];
    };
    reset();
    for (let i = 0; i < nRocks; i++) {
      const taken = occupied();
      let r: V;
      do r = { x: 2 + Math.floor(kit.rng() * (cols - 4)), y: 1 + Math.floor(kit.rng() * (rows - 2)) };
      while (taken.has(key(r)) || Math.abs(r.y - rows / 2) < 2);
      rocks.push(r);
    }
    placeFood();

    const speed = () => baseSpeed * (1 + eaten * 0.012);
    const status = () => kit.status(`Eaten ${eaten} / ${goal}\n${Math.ceil(timeLeft)}s left`);
    const finish = (how: "goal" | "crash" | "time") => {
      if (over) return;
      over = true;
      const s = clamp(eaten / goal);
      kit.score(s);
      if (how === "goal") { kit.synth.fx("win"); kit.banner("Full!", "good"); }
      const beats = how === "goal" ? [timeLeft > limit * 0.35 ? "quick and sure" : "got there in the end"] : how === "crash" ? [s > 0.7 ? "tripped up right near the end" : "a careless mistake"] : ["ran out of time"];
      if (close > 2) beats.push("a few near misses");
      if (crashes) beats.push("recovered from a fall");
      kit.finish({ score: s, beats, detail: `${eaten} of ${goal}` });
    };
    const crash = () => {
      kit.synth.fx("crash"); kit.shake(1.2);
      const B = box();
      sparks.burst(B.x + (snake[0].x + 0.5) * B.s, B.y + (snake[0].y + 0.5) * B.s, t.bad, 20, 220, 3);
      if (kit.lives.spend("Back on your feet!")) { crashes++; reset(); grace = 1.2; return; }
      finish("crash");
    };
    const advance = () => {
      if (queue.length) { const d = queue.shift()!; if (d.x !== -dir.x || d.y !== -dir.y) dir = d; }
      let head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (wrap) head = { x: (head.x + cols) % cols, y: (head.y + rows) % rows };
      const out = head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows;
      const hitRock = rocks.some((r) => r.x === head.x && r.y === head.y);
      const hitSelf = snake.slice(0, -1).some((p) => p.x === head.x && p.y === head.y);
      if ((out || hitRock || hitSelf) && grace <= 0) { crash(); return; }
      if (out) head = { x: (head.x + cols) % cols, y: (head.y + rows) % rows };
      snake.unshift(head);
      // A brush with a wall or the tail.
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => { const x = head.x + dx, y = head.y + dy; return (!wrap && (x < 0 || y < 0 || x >= cols || y >= rows)) || snake.slice(3).some((p) => p.x === x && p.y === y); }).length;
      if (nb >= 2) close++;
      if (head.x === food.x && head.y === food.y) {
        eaten++;
        kit.synth.fx("eat");
        const B = box();
        sparks.burst(B.x + (food.x + 0.5) * B.s, B.y + (food.y + 0.5) * B.s, foodColor, 12, 170, 2.5);
        floats.add(B.x + (food.x + 0.5) * B.s, B.y + food.y * B.s, `+1`, t.style === "scifi" ? t.accent2 : t.ink, 16);
        kit.score(clamp(eaten / goal));
        kit.track(clamp((eaten / goal) / Math.max(0.15, 1 - timeLeft / limit)));
        if (eaten >= goal) { finish("goal"); return; }
        placeFood();
      } else snake.pop();
      status();
    };

    kit.onKey((e, down) => {
      const d = KEYMAP[e.key.toLowerCase()];
      if (!d) return false;
      if (down && queue.length < 3) {
        const last = queue[queue.length - 1] ?? dir;
        const nd = DIRS[d];
        if (!(nd.x === last.x && nd.y === last.y) && !(nd.x === -last.x && nd.y === -last.y)) queue.push(nd);
      }
      return true;
    });
    let sw: { x: number; y: number } | null = null;
    c.el.addEventListener("pointerdown", (e) => { sw = { x: e.clientX, y: e.clientY }; });
    c.el.addEventListener("pointermove", (e) => {
      if (!sw) return;
      const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
      if (Math.hypot(dx, dy) < 24) return;
      const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      const last = queue[queue.length - 1] ?? dir, nd = DIRS[d];
      if (!(nd.x === last.x && nd.y === last.y) && !(nd.x === -last.x && nd.y === -last.y) && queue.length < 3) queue.push(nd);
      sw = { x: e.clientX, y: e.clientY };
    });
    c.el.addEventListener("pointerup", () => { sw = null; });
    withMusic(kit, () => backing(kit.synth, "retro", () => 1 + eaten / goal * 0.25));
    kit.onQuit(() => finish("time"));

    const box = () => {
      const s = Math.floor(Math.min((c.w - 48) / cols, (c.h - 64) / rows));
      return { s, x: Math.round((c.w - s * cols) / 2), y: Math.round((c.h - s * rows) / 2) + 10 };
    };
    kit.loop((dt) => {
      if (!over) {
        timeLeft = Math.max(0, timeLeft - dt);
        grace = Math.max(0, grace - dt);
        if (timeLeft <= 0) finish("time");
        step += dt * speed();
        while (step >= 1 && !over) { step -= 1; advance(); }
      }
      sparks.step(dt); floats.step(dt);
      draw();
    });

    // ───────── drawing ─────────

    const body = t.style === "medieval" ? ["#3e6b3a", "#2a4a27"] : t.style === "modern" ? ["#4674e9", "#3a64d0"] : [t.accent, "#2f8fae"];

    function field(B: ReturnType<typeof box>) {
      const W = B.s * cols, H = B.s * rows;
      if (t.style === "medieval") {
        // A map on parchment: an ink-ruled border, faint squares.
        lift(g, t, 2); g.fillStyle = "#2a1a0d"; g.fillRect(B.x - 10, B.y - 10, W + 20, H + 20); unlift(g);
        paint(g, "parchment", t, B.x - 6, B.y - 6, W + 12, H + 12);
        g.strokeStyle = wrap ? "rgba(44, 31, 18, .3)" : "#5a3d1c"; g.lineWidth = wrap ? 1 : 2;
        if (wrap) g.setLineDash([4, 4]);
        g.strokeRect(B.x - 2, B.y - 2, W + 4, H + 4); g.setLineDash([]);
        g.strokeStyle = "rgba(90, 61, 28, .1)"; g.lineWidth = 1;
        for (let x = 1; x < cols; x++) { g.beginPath(); g.moveTo(B.x + x * B.s + 0.5, B.y); g.lineTo(B.x + x * B.s + 0.5, B.y + H); g.stroke(); }
        for (let y = 1; y < rows; y++) { g.beginPath(); g.moveTo(B.x, B.y + y * B.s + 0.5); g.lineTo(B.x + W, B.y + y * B.s + 0.5); g.stroke(); }
      } else if (t.style === "modern") {
        // The grass board: two greens in a checker, a darker frame.
        g.fillStyle = "#578a34"; rrect(g, B.x - 10, B.y - 10, W + 20, H + 20, 14); g.fill();
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { g.fillStyle = (x + y) % 2 ? "#a2d149" : "#aad751"; g.fillRect(B.x + x * B.s, B.y + y * B.s, B.s, B.s); }
        if (wrap) { g.strokeStyle = "rgba(255,255,255,.5)"; g.setLineDash([6, 6]); g.lineWidth = 2; g.strokeRect(B.x - 4, B.y - 4, W + 8, H + 8); g.setLineDash([]); }
      } else {
        g.fillStyle = "rgba(8, 14, 22, .92)"; g.fillRect(B.x, B.y, W, H);
        g.strokeStyle = "rgba(120, 170, 210, .07)"; g.lineWidth = 1;
        for (let x = 1; x < cols; x++) { g.beginPath(); g.moveTo(B.x + x * B.s + 0.5, B.y); g.lineTo(B.x + x * B.s + 0.5, B.y + H); g.stroke(); }
        for (let y = 1; y < rows; y++) { g.beginPath(); g.moveTo(B.x, B.y + y * B.s + 0.5); g.lineTo(B.x + W, B.y + y * B.s + 0.5); g.stroke(); }
        g.strokeStyle = wrap ? "rgba(94, 200, 229, .3)" : "rgba(94, 200, 229, .55)"; if (wrap) g.setLineDash([6, 6]);
        g.strokeRect(B.x - 0.5, B.y - 0.5, W + 1, H + 1); g.setLineDash([]);
        brackets(g, B.x - 6, B.y - 6, W + 12, H + 12, t.accent, 16);
      }
    }

    function rock(x: number, y: number, s: number) {
      if (t.style === "medieval") {
        lift(g, t); paint(g, "stone", t, x + 2, y + 2, s - 4, s - 4); unlift(g);
        g.strokeStyle = "rgba(30, 18, 6, .5)"; g.lineWidth = 1; g.strokeRect(x + 2.5, y + 2.5, s - 5, s - 5);
      } else if (t.style === "modern") {
        g.fillStyle = "#8a8f7a"; rrect(g, x + 3, y + 3, s - 6, s - 6, s * 0.3); g.fill();
        g.fillStyle = "rgba(255,255,255,.25)"; rrect(g, x + 5, y + 4, s * 0.4, s * 0.2, s * 0.1); g.fill();
      } else {
        g.fillStyle = "rgba(239, 100, 97, .15)"; g.fillRect(x + 2, y + 2, s - 4, s - 4);
        g.strokeStyle = t.bad; g.lineWidth = 1; g.strokeRect(x + 2.5, y + 2.5, s - 5, s - 5);
        g.save(); g.beginPath(); g.rect(x + 2, y + 2, s - 4, s - 4); g.clip();
        g.strokeStyle = "rgba(239, 100, 97, .5)"; for (let k = -s; k < s; k += 5) { g.beginPath(); g.moveTo(x + k, y + s); g.lineTo(x + k + s, y); g.stroke(); }
        g.restore();
      }
    }

    function snack(cx: number, cy: number, s: number, pulse: number) {
      if (t.style === "scifi") {
        // An energy cell: an amber diamond in a ring.
        glow(g, t, t.accent2, 10);
        g.fillStyle = t.accent2;
        g.beginPath(); g.moveTo(cx, cy - s * 0.3 * pulse); g.lineTo(cx + s * 0.22, cy); g.lineTo(cx, cy + s * 0.3 * pulse); g.lineTo(cx - s * 0.22, cy); g.closePath(); g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = "rgba(242, 165, 65, .5)"; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, s * 0.42, 0, Math.PI * 2); g.stroke();
        return;
      }
      // An apple with a leaf.
      lift(g, t, 0.8);
      g.fillStyle = foodColor;
      g.beginPath(); g.arc(cx - s * 0.08, cy + s * 0.04, s * 0.3, 0, Math.PI * 2); g.arc(cx + s * 0.08, cy + s * 0.04, s * 0.3, 0, Math.PI * 2); g.fill();
      unlift(g);
      g.fillStyle = "rgba(255,255,255,.35)"; g.beginPath(); g.ellipse(cx - s * 0.14, cy - s * 0.06, s * 0.07, s * 0.1, -0.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = t.style === "medieval" ? "#4a2e16" : "#5b3a1e"; g.lineWidth = Math.max(1.5, s * 0.06);
      g.beginPath(); g.moveTo(cx, cy - s * 0.2); g.lineTo(cx + s * 0.04, cy - s * 0.38); g.stroke();
      g.fillStyle = t.style === "medieval" ? "#3e6b3a" : "#4caf50";
      g.beginPath(); g.ellipse(cx + s * 0.15, cy - s * 0.33, s * 0.13, s * 0.06, -0.5, 0, Math.PI * 2); g.fill();
    }

    function serpent(B: ReturnType<typeof box>) {
      const cx = (p: V) => B.x + (p.x + 0.5) * B.s, cy = (p: V) => B.y + (p.y + 0.5) * B.s;
      g.lineCap = "round"; g.lineJoin = "round";
      if (t.style === "scifi") {
        // A chain of squares with gaps, brighter toward the head.
        for (let i = snake.length - 1; i >= 0; i--) {
          const p = snake[i], k = 1 - i / Math.max(1, snake.length);
          const s2 = B.s * (0.5 + k * 0.22);
          g.fillStyle = `rgba(94, 200, 229, ${0.25 + k * 0.5})`;
          g.fillRect(cx(p) - s2 / 2, cy(p) - s2 / 2, s2, s2);
          g.strokeStyle = t.accent; g.lineWidth = 1; g.strokeRect(cx(p) - s2 / 2 + 0.5, cy(p) - s2 / 2 + 0.5, s2 - 1, s2 - 1);
        }
      } else {
        // One body, thicker toward the head.
        for (let i = snake.length - 1; i > 0; i--) {
          const a = snake[i], b = snake[i - 1];
          if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1) continue;
          const k = 1 - i / Math.max(1, snake.length);
          g.strokeStyle = i % 2 && t.style === "medieval" ? body[1] : body[0];
          g.lineWidth = B.s * (0.56 + k * 0.2);
          g.beginPath(); g.moveTo(cx(a), cy(a)); g.lineTo(cx(b), cy(b)); g.stroke();
        }
        if (t.style === "medieval") {
          // Scales: little ink arcs along the back, a pale belly line.
          g.strokeStyle = "rgba(20, 30, 15, .45)"; g.lineWidth = 1;
          for (let i = 1; i < snake.length; i++) { const p = snake[i]; g.beginPath(); g.arc(cx(p), cy(p) - B.s * 0.06, B.s * 0.16, Math.PI * 0.15, Math.PI * 0.85); g.stroke(); }
          g.strokeStyle = "rgba(220, 210, 150, .35)"; g.lineWidth = B.s * 0.12;
          g.beginPath(); snake.forEach((p, i) => (i ? g.lineTo(cx(p), cy(p)) : g.moveTo(cx(p), cy(p)))); g.stroke();
        }
      }
      const h = snake[0];
      const hx = cx(h), hy = cy(h);
      if (t.style === "scifi") {
        g.fillStyle = "#0a111b"; g.fillRect(hx - B.s * 0.42, hy - B.s * 0.42, B.s * 0.84, B.s * 0.84);
        glow(g, t, t.accent, 8);
        g.strokeStyle = t.accent; g.lineWidth = 1.5; g.strokeRect(hx - B.s * 0.42, hy - B.s * 0.42, B.s * 0.84, B.s * 0.84);
        g.shadowBlur = 0;
        g.fillStyle = t.accent;
        g.fillRect(hx + dir.x * B.s * 0.18 - (dir.y ? B.s * 0.25 : B.s * 0.06), hy + dir.y * B.s * 0.18 - (dir.x ? B.s * 0.25 : B.s * 0.06), dir.y ? B.s * 0.5 : B.s * 0.12, dir.x ? B.s * 0.5 : B.s * 0.12);
        return;
      }
      g.fillStyle = body[0];
      g.beginPath(); g.ellipse(hx + dir.x * B.s * 0.08, hy + dir.y * B.s * 0.08, B.s * (dir.x ? 0.52 : 0.44), B.s * (dir.y ? 0.52 : 0.44), 0, 0, Math.PI * 2); g.fill();
      if (t.style === "medieval") {
        // A forked tongue now and then.
        if (Math.sin(tick * 7) > 0.4) {
          g.strokeStyle = "#a8281c"; g.lineWidth = 1.5;
          const tx = hx + dir.x * B.s * 0.55, ty = hy + dir.y * B.s * 0.55;
          g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + dir.x * B.s * 0.25 + dir.y * B.s * 0.1, ty + dir.y * B.s * 0.25 + dir.x * B.s * 0.1);
          g.moveTo(tx, ty); g.lineTo(tx + dir.x * B.s * 0.25 - dir.y * B.s * 0.1, ty + dir.y * B.s * 0.25 - dir.x * B.s * 0.1); g.stroke();
        }
      }
      for (const sgn of [-1, 1]) {
        const ex = hx + dir.x * B.s * 0.16 + (dir.y !== 0 ? sgn * B.s * 0.2 : 0), ey = hy + dir.y * B.s * 0.16 + (dir.x !== 0 ? sgn * B.s * 0.2 : 0);
        g.fillStyle = t.style === "medieval" ? "#e9c46a" : "#fff"; g.beginPath(); g.arc(ex, ey, B.s * 0.12, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#1d1d1f";
        if (t.style === "medieval") { g.fillRect(ex + dir.x * 1.5 - (dir.y ? 1 : B.s * 0.03), ey + dir.y * 1.5 - (dir.x ? 1 : B.s * 0.03), dir.y ? 2 : B.s * 0.06, dir.x ? 2 : B.s * 0.06); }
        else { g.beginPath(); g.arc(ex + dir.x * 2, ey + dir.y * 2, B.s * 0.06, 0, Math.PI * 2); g.fill(); }
      }
    }

    let tick = 0;
    function draw() {
      tick += 1 / 60;
      const B = box();
      g.clearRect(0, 0, c.w, c.h);
      ground(g, t, c.w, c.h, t.style === "medieval" ? "table" : "page");
      field(B);
      for (const r of rocks) rock(B.x + r.x * B.s, B.y + r.y * B.s, B.s);
      snack(B.x + (food.x + 0.5) * B.s, B.y + (food.y + 0.5) * B.s, B.s, 1 + Math.sin(tick * 5) * 0.06);
      const blink = grace > 0 && Math.floor(tick * 10) % 2 === 0;
      if (!blink && snake.length) serpent(B);
      sparks.draw(g); floats.draw(g);
      g.font = `${t.style === "scifi" ? 500 : 600} 13px ${t.style === "scifi" ? t.fontNum : t.fontUi}`;
      g.fillStyle = t.style === "medieval" ? "#ecdfbf" : t.style === "scifi" ? t.accent : t.inkSoft;
      g.textAlign = "left"; g.textBaseline = "bottom";
      g.fillText(`${eaten} / ${goal}  ·  ${Math.ceil(timeLeft)}s`, B.x, Math.max(16, B.y - 14));
    }

    status();
    return () => {};
  },
};
