// Snake: eat, grow, don't run into yourself (or the walls). Get enough before time's
// up. Harder checks are faster, with rocks in the way.

import { clamp, FONT_NUM, Floaters, rrect, Sparks, withMusic, type GameDef, type Kit } from "../kit.js";
import { backing } from "../synth.js";

type V = { x: number; y: number };
const DIRS: Record<string, V> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const KEYMAP: Record<string, keyof typeof DIRS> = { arrowup: "up", w: "up", arrowdown: "down", s: "down", arrowleft: "left", a: "left", arrowright: "right", d: "right" };

export const SNAKE: GameDef = {
  id: "snake",
  title: "Snake",
  theme: { bg: "#03100a", bg2: "#0c2a18", accent: "#7cff6b", accent2: "#1fd1a5" },
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
    const sparks = new Sparks(), floats = new Floaters();
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
      sparks.burst(B.x + (snake[0].x + 0.5) * B.s, B.y + (snake[0].y + 0.5) * B.s, "#ff5d6c", 26, 280, 4);
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
        sparks.burst(B.x + (food.x + 0.5) * B.s, B.y + (food.y + 0.5) * B.s, "#ffe066", 16, 200);
        floats.add(B.x + (food.x + 0.5) * B.s, B.y + food.y * B.s, `+1`, "#ffe066", 18);
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
      const s = Math.floor(Math.min((c.w - 24) / cols, (c.h - 24) / rows));
      return { s, x: Math.round((c.w - s * cols) / 2), y: Math.round((c.h - s * rows) / 2) };
    };
    let t = 0;
    kit.loop((dt) => {
      t += dt;
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

    function draw() {
      const B = box();
      g.clearRect(0, 0, c.w, c.h);
      // The screen: a dark green field, faint grid, walls glowing.
      g.fillStyle = "#04140b"; rrect(g, B.x - 4, B.y - 4, B.s * cols + 8, B.s * rows + 8, 10); g.fill();
      g.strokeStyle = wrap ? "rgba(124,255,107,.25)" : "rgba(124,255,107,.75)"; g.lineWidth = 2;
      if (wrap) g.setLineDash([6, 6]);
      g.shadowColor = "#7cff6b"; g.shadowBlur = wrap ? 0 : 14;
      rrect(g, B.x - 4, B.y - 4, B.s * cols + 8, B.s * rows + 8, 10); g.stroke();
      g.setLineDash([]); g.shadowBlur = 0;
      g.fillStyle = "rgba(124,255,107,.06)";
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if ((x + y) % 2) g.fillRect(B.x + x * B.s, B.y + y * B.s, B.s, B.s);
      for (const r of rocks) { g.fillStyle = "#4a5a4f"; rrect(g, B.x + r.x * B.s + 2, B.y + r.y * B.s + 2, B.s - 4, B.s - 4, 4); g.fill(); g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(B.x + r.x * B.s + 4, B.y + r.y * B.s + 4, B.s - 10, 3); }
      // Food.
      const pulse = 1 + Math.sin(t * 6) * 0.08;
      const fx = B.x + (food.x + 0.5) * B.s, fy = B.y + (food.y + 0.5) * B.s;
      g.fillStyle = "#ffe066"; g.shadowColor = "#ffe066"; g.shadowBlur = 18;
      g.beginPath(); g.arc(fx, fy, B.s * 0.34 * pulse, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
      g.fillStyle = "#3dbb4a"; g.beginPath(); g.ellipse(fx + B.s * 0.12, fy - B.s * 0.32, B.s * 0.12, B.s * 0.06, -0.6, 0, Math.PI * 2); g.fill();
      // Snake, tail to head.
      const blink = grace > 0 && Math.floor(t * 10) % 2 === 0;
      if (!blink) {
        // One body: segments joined into a thick line that thins and darkens toward the tail.
        g.lineCap = "round"; g.lineJoin = "round";
        for (let i = snake.length - 1; i > 0; i--) {
          const a = snake[i], b = snake[i - 1];
          if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1) continue; // wrapped across an edge
          const k = 1 - i / Math.max(1, snake.length);
          g.strokeStyle = `hsl(${150 - k * 30} 85% ${34 + k * 26}%)`;
          g.lineWidth = B.s * (0.5 + k * 0.3);
          g.beginPath(); g.moveTo(B.x + (a.x + 0.5) * B.s, B.y + (a.y + 0.5) * B.s); g.lineTo(B.x + (b.x + 0.5) * B.s, B.y + (b.y + 0.5) * B.s); g.stroke();
        }
        const h0 = snake[0];
        g.fillStyle = "#9dff8a"; g.shadowColor = "#7cff6b"; g.shadowBlur = 12;
        g.beginPath(); g.arc(B.x + (h0.x + 0.5) * B.s, B.y + (h0.y + 0.5) * B.s, B.s * 0.46, 0, Math.PI * 2); g.fill();
        g.shadowBlur = 0;
      }
      if (!blink && snake[0]) {
        const h = snake[0], cx = B.x + (h.x + 0.5) * B.s, cy = B.y + (h.y + 0.5) * B.s;
        const ex = dir.y !== 0 ? 0.2 : 0.12, ey = dir.x !== 0 ? 0.2 : 0.12;
        for (const sgn of [-1, 1]) {
          const x = cx + dir.x * B.s * 0.15 + (dir.y !== 0 ? sgn * ex * B.s : 0), y = cy + dir.y * B.s * 0.15 + (dir.x !== 0 ? sgn * ey * B.s : 0);
          g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y, B.s * 0.11, 0, Math.PI * 2); g.fill();
          g.fillStyle = "#061"; g.beginPath(); g.arc(x + dir.x * 2, y + dir.y * 2, B.s * 0.05, 0, Math.PI * 2); g.fill();
        }
      }
      sparks.draw(g); floats.draw(g);
      // Scanlines.
      g.fillStyle = "rgba(0,0,0,.18)";
      for (let y = 0; y < c.h; y += 3) g.fillRect(0, y, c.w, 1);
      g.font = `800 14px ${FONT_NUM}`; g.fillStyle = "rgba(124,255,107,.85)"; g.textAlign = "left"; g.textBaseline = "top";
      g.fillText(`${eaten}/${goal}   ${Math.ceil(timeLeft)}s`, B.x, Math.max(4, B.y - 24));
    }
    status();
    return () => {};
  },
};
