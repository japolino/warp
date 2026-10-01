// Pinball: a launcher, two flippers, pop bumpers, slingshots and three rollover lanes
// that raise the multiplier when all are lit. Three balls (more with lives); a ball
// saver catches early drains. Score enough points before the last ball drains.

import { clamp, FONT_NUM, FONT_UI, Floaters, Sparks, withMusic, type GameDef, type Kit } from "../kit.js";
import { backing } from "../synth.js";

type Vec = { x: number; y: number };
interface Seg { a: Vec; b: Vec; kick?: number; e?: number; kind?: "sling" | "wall" }
interface Bumper { x: number; y: number; r: number; lit: number }
interface Lane { x: number; y: number; on: boolean; flash: number }
interface Flipper { pivot: Vec; len: number; rest: number; up: number; ang: number; w: number; side: 1 | -1; pressed: boolean }

const TW = 400, TH = 720, BR = 9;

/** The table: walls as segments, an arc across the top, the shooter lane on the right. */
function table(): Seg[] {
  const segs: Seg[] = [];
  const poly = (pts: [number, number][], e = 0.45) => { for (let i = 0; i < pts.length - 1; i++) segs.push({ a: { x: pts[i][0], y: pts[i][1] }, b: { x: pts[i + 1][0], y: pts[i + 1][1] }, e }); };
  const arc: [number, number][] = [];
  for (let k = 0; k <= 18; k++) { const a = Math.PI + (k / 18) * Math.PI; arc.push([200 + Math.cos(a) * 182, 150 + Math.sin(a) * 135]); }
  poly([[18, 600], [18, 150], ...arc.slice(1, -1), [382, 150], [382, 720]]);
  // The shooter lane's inner wall, and the lower walls funnelling to the flippers.
  poly([[350, 720], [350, 230]]);
  // The shooter lane's floor, where the ball waits.
  segs.push({ a: { x: 350, y: 700 }, b: { x: 382, y: 700 }, e: 0.15 });
  poly([[18, 560], [112, 636]]);
  poly([[350, 560], [288, 636]]);
  // Slingshots in front of the flippers.
  segs.push({ a: { x: 62, y: 470 }, b: { x: 104, y: 560 }, kick: 520, e: 0.9, kind: "sling" });
  segs.push({ a: { x: 306, y: 470 }, b: { x: 264, y: 560 }, kick: 520, e: 0.9, kind: "sling" });
  poly([[62, 470], [62, 548], [104, 560]], 0.4);
  poly([[306, 470], [306, 548], [264, 560]], 0.4);
  return segs;
}

export const PINBALL: GameDef = {
  id: "pinball",
  title: "Pinball",
  theme: { bg: "#0c0716", bg2: "#2b1036", accent: "#ff8a3d", accent2: "#3de1ff" },
  howTo: [
    "Hold Space to pull the plunger and let go to launch.",
    "Flip to keep the ball alive. Bumpers and slingshots score; light all three top lanes to raise the multiplier.",
    "Reach the target score before your last ball drains (or time runs out).",
  ],
  controls: "Z / ← left flipper · M / → right flipper · Space launch · touch the left or right half",
  start(kit: Kit) {
    const L = kit.play.level;
    const goal = Math.round((4000 + L * 14000) / 500) * 500;
    let balls = 3;
    let savers = kit.aid("saver") + (L < 0.4 ? 1 : 0);
    const limit = 150;
    const flipLen = 74 * (1 + kit.aid("size") / 100) * (1.06 - 0.12 * L);
    const segs = table();
    const bumpers: Bumper[] = [{ x: 140, y: 210, r: 24, lit: 0 }, { x: 258, y: 210, r: 24, lit: 0 }, { x: 199, y: 292, r: 24, lit: 0 }];
    const lanes: Lane[] = [{ x: 132, y: 92, on: false, flash: 0 }, { x: 200, y: 80, on: false, flash: 0 }, { x: 268, y: 92, on: false, flash: 0 }];
    const targets = [{ x: 30, y: 330, hit: 0 }, { x: 370 - 30, y: 330, hit: 0 }];
    const flippers: Flipper[] = [
      { pivot: { x: 112, y: 640 }, len: flipLen, rest: 0.52, up: -0.48, ang: 0.52, w: 0, side: 1, pressed: false },
      { pivot: { x: 288, y: 640 }, len: flipLen, rest: 0.52, up: -0.48, ang: 0.52, w: 0, side: -1, pressed: false },
    ];
    let ball = { x: 366, y: 690, vx: 0, vy: 0, live: false, inLane: true };
    let points = 0, mult = 1, timeLeft = limit, plunge = 0, pulling = false, over = false, launched = 0, drained = 0, bestBall = 0, ballPts = 0;
    const c = kit.canvas();
    const g = c.g;
    const sparks = new Sparks(), floats = new Floaters();
    const trail: Vec[] = [];

    const tip = (f: Flipper): Vec => ({ x: f.pivot.x + Math.cos(f.ang) * f.len * f.side, y: f.pivot.y + Math.sin(f.ang) * f.len });
    const add = (n: number, at: Vec, color = "#ffe066") => {
      const v = n * mult;
      points += v; ballPts += v;
      floats.add(at.x, at.y - 10, `+${v}`, color, 13);
      kit.score(clamp(points / goal));
      kit.status(`${points.toLocaleString()} / ${goal.toLocaleString()}\nBall ${Math.min(3, drained + 1)} · ×${mult}`);
      if (points >= goal && !over) { kit.banner("Target reached!", "good"); kit.synth.fx("win"); setTimeout(() => finish("goal"), 900); }
    };
    const newBall = () => { ball = { x: 366, y: 690, vx: 0, vy: 0, live: true, inLane: true }; plunge = 0; ballPts = 0; };
    newBall();

    const collideSeg = (s: Seg, vel?: (p: Vec) => Vec, radius = BR) => {
      const ax = s.a.x, ay = s.a.y, bx = s.b.x, by = s.b.y;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const k = clamp(((ball.x - ax) * dx + (ball.y - ay) * dy) / len2);
      const px = ax + dx * k, py = ay + dy * k;
      let nx = ball.x - px, ny = ball.y - py;
      const d = Math.hypot(nx, ny);
      if (d >= radius || d === 0) return false;
      nx /= d; ny /= d;
      ball.x = px + nx * radius; ball.y = py + ny * radius;
      const u = vel ? vel({ x: px, y: py }) : { x: 0, y: 0 };
      const rvx = ball.vx - u.x, rvy = ball.vy - u.y;
      const vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        const e = s.e ?? 0.45;
        ball.vx -= (1 + e) * vn * nx; ball.vy -= (1 + e) * vn * ny;
        if (s.kick) { ball.vx += nx * s.kick; ball.vy += ny * s.kick; kit.synth.fx("bumper", 4); add(50, { x: px, y: py }, "#3de1ff"); sparks.burst(px, py, "#3de1ff", 8, 180); }
      }
      return true;
    };

    const physics = (dt: number) => {
      // Flippers swing toward up or rest.
      for (const f of flippers) {
        const target = f.pressed ? f.up : f.rest;
        const speed = 22;
        const prev = f.ang;
        f.ang = f.ang < target ? Math.min(target, f.ang + speed * dt) : Math.max(target, f.ang - speed * dt);
        f.w = (f.ang - prev) / dt;
      }
      if (!ball.live) return;
      ball.vy += 820 * dt;
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp > 1600) { ball.vx *= 1600 / sp; ball.vy *= 1600 / sp; }
      if (ball.inLane && ball.x < 345) ball.inLane = false;
      for (const s of segs) collideSeg(s);
      for (const b of bumpers) {
        const dx = ball.x - b.x, dy = ball.y - b.y, d = Math.hypot(dx, dy);
        if (d < b.r + BR) {
          const nx = dx / d, ny = dy / d;
          ball.x = b.x + nx * (b.r + BR); ball.y = b.y + ny * (b.r + BR);
          const vn = ball.vx * nx + ball.vy * ny;
          if (vn < 0) { ball.vx -= 2 * vn * nx; ball.vy -= 2 * vn * ny; }
          ball.vx += nx * 380; ball.vy += ny * 380;
          b.lit = 1;
          kit.synth.fx("bumper", bumpers.indexOf(b) * 3);
          sparks.burst(ball.x - nx * BR, ball.y - ny * BR, "#ff8a3d", 10, 200);
          add(100, { x: b.x, y: b.y - b.r }, "#ff8a3d");
        }
      }
      for (const f of flippers) {
        const t = tip(f);
        const vel = (p: Vec): Vec => {
          // Velocity of a point on the flipper: ω × r.
          const rx = p.x - f.pivot.x, ry = p.y - f.pivot.y;
          const w = f.w;
          return f.side === 1 ? { x: -w * ry, y: w * rx } : { x: w * ry, y: -w * rx };
        };
        collideSeg({ a: f.pivot, b: t, e: 0.25 }, vel, BR + 6);
      }
      for (const l of lanes) {
        if (Math.hypot(ball.x - l.x, ball.y - l.y) < 16 && l.flash <= 0) {
          l.flash = 0.6;
          if (!l.on) { l.on = true; kit.synth.fx("target"); add(250, l, "#7cff6b"); }
          if (lanes.every((x) => x.on)) {
            for (const x of lanes) x.on = false;
            mult = Math.min(5, mult + 1);
            kit.banner(`Multiplier ×${mult}`, "gold"); kit.synth.fx("combo");
            add(1000, { x: 200, y: 120 }, "#ffe066");
          }
        }
      }
      for (const tg of targets) {
        if (Math.abs(ball.x - tg.x) < 16 && Math.abs(ball.y - tg.y) < 30 && tg.hit <= 0) {
          tg.hit = 0.8;
          ball.vx = -ball.vx * 0.8 + (tg.x < 200 ? 200 : -200);
          kit.synth.fx("target", 5);
          add(500, tg, "#ff5fa2");
        }
      }
      if (ball.y > TH + 30) drain();
    };

    const drain = () => {
      ball.live = false;
      kit.synth.fx("drain");
      if (savers > 0 && performance.now() - launched < 9000) {
        savers--;
        kit.banner("Ball saved!", "gold");
        setTimeout(newBall, 500);
        return;
      }
      drained++;
      bestBall = Math.max(bestBall, ballPts);
      kit.shake(0.8);
      if (drained >= balls) {
        if (kit.lives.spend("Extra ball!")) { balls++; setTimeout(newBall, 700); return; }
        finish("drained");
        return;
      }
      kit.banner(`Ball ${drained + 1}`, "info");
      setTimeout(newBall, 700);
    };
    const finish = (how: "goal" | "drained" | "time") => {
      if (over) return;
      over = true;
      bestBall = Math.max(bestBall, ballPts);
      const s = clamp(points / goal);
      kit.score(s);
      const beats = how === "goal" ? [drained === 0 ? "did it all on the first ball" : "got there"] : how === "time" ? ["time ran out"] : [s > 0.8 ? "the last ball drained just short" : "the balls kept draining"];
      if (mult >= 3) beats.push("built up a real head of steam");
      if (bestBall > goal * 0.6) beats.push("one long, brilliant run");
      kit.finish({ score: s, beats, detail: `${points.toLocaleString()} points of ${goal.toLocaleString()}` });
    };

    const press = (side: "L" | "R" | "launch", down: boolean) => {
      if (side === "launch") {
        if (down && ball.inLane && ball.live && ball.y > 660 && Math.abs(ball.vy) < 60) pulling = true;
        else if (!down && pulling) {
          pulling = false;
          ball.vy = -(1150 + plunge * 700);
          ball.vx = 0;
          launched = performance.now();
          kit.synth.fx("launch");
          plunge = 0;
        }
        return;
      }
      const f = flippers[side === "L" ? 0 : 1];
      if (down && !f.pressed) kit.synth.fx("flipper");
      f.pressed = down;
    };
    kit.onKey((e, down) => {
      const k = e.key.toLowerCase();
      if (k === "z" || k === "arrowleft" || k === "shift" && e.location === 1) { press("L", down); return true; }
      if (k === "m" || k === "/" || k === "arrowright") { press("R", down); return true; }
      if (k === " " || k === "arrowdown" || k === "enter") { if (!e.repeat || !down) press("launch", down); return true; }
      return false;
    });
    const touches = new Map<number, "L" | "R" | "launch">();
    c.el.addEventListener("pointerdown", (e) => {
      if (kit.paused) return;
      c.el.setPointerCapture(e.pointerId);
      const r = c.el.getBoundingClientRect();
      const side = ball.inLane && ball.live && ball.y > 660 ? "launch" : e.clientX - r.left < r.width / 2 ? "L" : "R";
      touches.set(e.pointerId, side);
      press(side, true);
    });
    const up = (e: PointerEvent) => { const s = touches.get(e.pointerId); if (s) { touches.delete(e.pointerId); press(s, false); } };
    c.el.addEventListener("pointerup", up);
    c.el.addEventListener("pointercancel", up);
    withMusic(kit, () => backing(kit.synth, "drive", () => 1 + (mult - 1) * 0.05));
    kit.onQuit(() => finish("time"));

    let acc = 0;
    kit.loop((dt) => {
      if (!over) {
        timeLeft = Math.max(0, timeLeft - dt);
        if (timeLeft <= 0) finish("time");
        if (pulling) plunge = Math.min(1, plunge + dt * 1.2);
        // Fixed small steps keep fast balls from tunnelling through walls.
        acc += dt;
        const h = 1 / 480;
        while (acc >= h) { physics(h); acc -= h; }
        if (Math.floor(timeLeft) !== Math.floor(timeLeft + dt)) kit.track(clamp((points / goal) / Math.max(0.15, 1 - timeLeft / limit)));
      }
      for (const b of bumpers) b.lit = Math.max(0, b.lit - dt * 4);
      for (const l of lanes) l.flash = Math.max(0, l.flash - dt);
      for (const t of targets) t.hit = Math.max(0, t.hit - dt);
      if (ball.live) { trail.push({ x: ball.x, y: ball.y }); if (trail.length > 8) trail.shift(); }
      sparks.step(dt); floats.step(dt);
      draw();
    });

    function draw() {
      g.clearRect(0, 0, c.w, c.h);
      const s = Math.min((c.h - 16) / TH, (c.w - 16) / TW);
      const ox = (c.w - TW * s) / 2, oy = (c.h - TH * s) / 2;
      g.save(); g.translate(ox, oy); g.scale(s, s);
      // Playfield.
      const bg = g.createLinearGradient(0, 0, 0, TH);
      bg.addColorStop(0, "#2a0f3d"); bg.addColorStop(0.6, "#160a26"); bg.addColorStop(1, "#0a0612");
      g.fillStyle = bg;
      g.beginPath(); g.moveTo(18, 720); g.lineTo(18, 150); g.arc(200, 150, 182, Math.PI, 0); g.lineTo(382, 720); g.closePath(); g.fill();
      // Decorative arrows and stars.
      g.fillStyle = "rgba(255,138,61,.08)";
      for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(200, 400 + i * 34); g.lineTo(184, 420 + i * 34); g.lineTo(216, 420 + i * 34); g.fill(); }
      // Walls.
      g.lineCap = "round"; g.lineJoin = "round";
      for (const sg of segs) {
        g.strokeStyle = sg.kind === "sling" ? "#3de1ff" : "#c9b7ff"; g.lineWidth = sg.kind === "sling" ? 5 : 4;
        g.shadowColor = sg.kind === "sling" ? "#3de1ff" : "#8f6bff"; g.shadowBlur = 10;
        g.beginPath(); g.moveTo(sg.a.x, sg.a.y); g.lineTo(sg.b.x, sg.b.y); g.stroke();
      }
      g.shadowBlur = 0;
      // Lanes, targets, bumpers.
      for (const l of lanes) {
        g.fillStyle = l.on ? "#7cff6b" : "rgba(124,255,107,.15)"; g.shadowColor = "#7cff6b"; g.shadowBlur = l.on ? 16 : 0;
        g.beginPath(); g.arc(l.x, l.y, 8 + l.flash * 6, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
      }
      for (const t of targets) {
        g.fillStyle = t.hit > 0 ? "#fff" : "#ff5fa2"; g.shadowColor = "#ff5fa2"; g.shadowBlur = 12;
        g.fillRect(t.x - 5, t.y - 22, 10, 44); g.shadowBlur = 0;
      }
      for (const b of bumpers) {
        g.fillStyle = "#3a1530"; g.beginPath(); g.arc(b.x, b.y, b.r + 4, 0, Math.PI * 2); g.fill();
        const grd = g.createRadialGradient(b.x - 6, b.y - 6, 3, b.x, b.y, b.r);
        grd.addColorStop(0, b.lit > 0 ? "#fff" : "#ffc08a"); grd.addColorStop(1, "#ff8a3d");
        g.fillStyle = grd; g.shadowColor = "#ff8a3d"; g.shadowBlur = 10 + b.lit * 30;
        g.beginPath(); g.arc(b.x, b.y, b.r * (1 + b.lit * 0.12), 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
        g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.arc(b.x, b.y, b.r * 0.55, 0, Math.PI * 2); g.stroke();
      }
      // Flippers.
      for (const f of flippers) {
        const t = tip(f);
        g.strokeStyle = "#ffe066"; g.lineWidth = 16; g.shadowColor = "#ffe066"; g.shadowBlur = f.pressed ? 18 : 6;
        g.beginPath(); g.moveTo(f.pivot.x, f.pivot.y); g.lineTo(t.x, t.y); g.stroke();
        g.strokeStyle = "#fff6c8"; g.lineWidth = 6; g.shadowBlur = 0;
        g.beginPath(); g.moveTo(f.pivot.x, f.pivot.y); g.lineTo(t.x, t.y); g.stroke();
      }
      // Plunger.
      g.fillStyle = "#555"; g.fillRect(358, 700 + plunge * 18, 16, 24);
      g.fillStyle = "#ff3d5a"; g.fillRect(356, 698 + plunge * 18, 20, 6);
      // Ball and trail.
      if (ball.live) {
        trail.forEach((p, i) => { g.globalAlpha = (i / trail.length) * 0.35; g.fillStyle = "#3de1ff"; g.beginPath(); g.arc(p.x, p.y, BR * (i / trail.length), 0, Math.PI * 2); g.fill(); });
        g.globalAlpha = 1;
        const bg2 = g.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, BR);
        bg2.addColorStop(0, "#ffffff"); bg2.addColorStop(1, "#8a93a6");
        g.fillStyle = bg2; g.beginPath(); g.arc(ball.x, ball.y, BR, 0, Math.PI * 2); g.fill();
      }
      sparks.draw(g); floats.draw(g);
      // Score on the backglass strip.
      g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(110, 118, 180, 46);
      g.font = `800 22px ${FONT_NUM}`; g.fillStyle = "#ffe066"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(points.toLocaleString(), 200, 136);
      g.font = `700 10px ${FONT_UI}`; g.fillStyle = "rgba(255,255,255,.7)";
      g.fillText(`BALL ${Math.min(balls, drained + 1)}/${balls} · ×${mult} · ${Math.ceil(timeLeft)}s`, 200, 155);
      if (ball.inLane && ball.live && ball.y > 660) {
        g.font = `800 12px ${FONT_UI}`; g.fillStyle = "#fff"; g.fillText("HOLD SPACE", 366, 650);
      }
      g.restore();
    }

    kit.status(`Target ${goal.toLocaleString()}\n3 balls`);
    return () => {};
  },
};
