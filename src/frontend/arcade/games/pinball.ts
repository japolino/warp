// Pinball: a launcher, two flippers, pop bumpers, slingshots and three rollover lanes
// that raise the multiplier when all are lit. Three balls (more with lives); a ball
// saver catches early drains. Score enough points before the last ball drains.

import { clamp, Floaters, rrect, Sparks, withMusic, type GameDef, type Kit } from "../kit.js";
import { glow, lift, paint, unlift } from "../themes.js";
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
    const th = kit.theme;
    const sparks = new Sparks(), floats = new Floaters(th.style === "scifi" ? th.fontNum : th.fontDisplay, th.style === "scifi" ? null : "rgba(0,0,0,.45)");
    // What each kind of hit looks like in this look.
    const hue = th.style === "medieval"
      ? { sling: "#e9c46a", bump: "#e9c46a", lane: "#e9c46a", bonus: "#f3e7c8", target: "#f3e7c8" }
      : th.style === "modern"
        ? { sling: "#2f6fe4", bump: "#ff5a36", lane: "#22a06b", bonus: "#ffb020", target: "#8e5cf0" }
        : { sling: th.accent, bump: th.accent2, lane: th.good, bonus: th.gold, target: "#c792ea" };
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
        if (s.kick) { ball.vx += nx * s.kick; ball.vy += ny * s.kick; kit.synth.fx("bumper", 4); add(50, { x: px, y: py }, hue.sling); sparks.burst(px, py, hue.sling, 8, 160, 2.5); }
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
          sparks.burst(ball.x - nx * BR, ball.y - ny * BR, hue.bump, 8, 170, 2.5);
          add(100, { x: b.x, y: b.y - b.r }, hue.bump);
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
          if (!l.on) { l.on = true; kit.synth.fx("target"); add(250, l, hue.lane); }
          if (lanes.every((x) => x.on)) {
            for (const x of lanes) x.on = false;
            mult = Math.min(5, mult + 1);
            kit.banner(`Multiplier ×${mult}`, "gold"); kit.synth.fx("combo");
            add(1000, { x: 200, y: 120 }, hue.bonus);
          }
        }
      }
      for (const tg of targets) {
        if (Math.abs(ball.x - tg.x) < 16 && Math.abs(ball.y - tg.y) < 30 && tg.hit <= 0) {
          tg.hit = 0.8;
          ball.vx = -ball.vx * 0.8 + (tg.x < 200 ? 200 : -200);
          kit.synth.fx("target", 5);
          add(500, tg, hue.target);
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

    function tablePath() {
      g.beginPath(); g.moveTo(18, 720); g.lineTo(18, 150); g.arc(200, 150, 182, Math.PI, 0); g.lineTo(382, 720); g.closePath();
    }

    function playfield() {
      if (th.style === "medieval") {
        // An oak cabinet with a painted parchment field: a compass rose and a dragon's coil in faded ink.
        g.save(); tablePath(); g.clip();
        paint(g, "parchment", th, 0, 0, TW, TH);
        g.strokeStyle = "rgba(90, 61, 28, .18)"; g.lineWidth = 1.5;
        for (let k = 0; k < 16; k++) { const a = (k * Math.PI) / 8; g.beginPath(); g.moveTo(200, 400); g.lineTo(200 + Math.cos(a) * (k % 2 ? 60 : 110), 400 + Math.sin(a) * (k % 2 ? 60 : 110)); g.stroke(); }
        g.beginPath(); g.arc(200, 400, 70, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = "rgba(158, 43, 31, .14)"; g.lineWidth = 6;
        g.beginPath(); for (let k = 0; k < 120; k++) { const u = k / 119; g.lineTo(200 + Math.sin(u * 9) * 120 * (1 - u * 0.5), 200 + u * 340); } g.stroke();
        g.restore();
        g.strokeStyle = "#4a2e16"; g.lineWidth = 10; tablePath(); g.stroke();
      } else if (th.style === "modern") {
        g.save(); tablePath(); g.clip();
        const bg = g.createLinearGradient(0, 0, 0, TH);
        bg.addColorStop(0, "#fbfaf7"); bg.addColorStop(1, "#ece9e2");
        g.fillStyle = bg; g.fillRect(0, 0, TW, TH);
        // Painted shapes: soft arcs and a big chevron, like table art.
        g.fillStyle = "rgba(255, 90, 54, .08)"; g.beginPath(); g.arc(200, 260, 150, 0, Math.PI * 2); g.fill();
        g.fillStyle = "rgba(47, 111, 228, .07)"; g.beginPath(); g.moveTo(80, 600); g.lineTo(200, 470); g.lineTo(320, 600); g.lineTo(290, 600); g.lineTo(200, 500); g.lineTo(110, 600); g.closePath(); g.fill();
        g.restore();
      } else {
        g.save(); tablePath(); g.clip();
        g.fillStyle = "#08101a"; g.fillRect(0, 0, TW, TH);
        g.strokeStyle = "rgba(120, 170, 210, .06)"; g.lineWidth = 1;
        for (let x = 0; x < TW; x += 20) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, TH); g.stroke(); }
        for (let y = 0; y < TH; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(TW, y); g.stroke(); }
        g.strokeStyle = "rgba(94, 200, 229, .12)"; g.beginPath(); g.arc(200, 400, 90, 0, Math.PI * 2); g.stroke();
        g.restore();
      }
    }

    function walls() {
      g.lineCap = "round"; g.lineJoin = "round";
      for (const sg of segs) {
        const line = () => { g.beginPath(); g.moveTo(sg.a.x, sg.a.y); g.lineTo(sg.b.x, sg.b.y); g.stroke(); };
        if (th.style === "medieval") {
          if (sg.kind === "sling") { g.strokeStyle = "#6b1a12"; g.lineWidth = 8; line(); g.strokeStyle = "#b48a2c"; g.lineWidth = 3; line(); }
          else { g.strokeStyle = "#5a3d1c"; g.lineWidth = 6; line(); g.strokeStyle = "#c9952f"; g.lineWidth = 2.5; line(); }
        } else if (th.style === "modern") {
          if (sg.kind === "sling") { g.strokeStyle = hue.sling; g.lineWidth = 7; line(); }
          else { g.strokeStyle = "#1d1d1f"; g.lineWidth = 4; line(); }
        } else {
          g.strokeStyle = sg.kind === "sling" ? th.accent2 : th.accent; g.lineWidth = sg.kind === "sling" ? 3 : 1.5;
          glow(g, th, g.strokeStyle as string, 6); line(); g.shadowBlur = 0;
        }
      }
    }

    function bumper(b: Bumper) {
      const r = b.r * (1 + b.lit * 0.1);
      if (th.style === "medieval") {
        // A round shield: quartered red and blue, a gold rim and boss.
        lift(g, th, 1.5);
        g.fillStyle = "#c9952f"; g.beginPath(); g.arc(b.x, b.y, r + 3, 0, Math.PI * 2); g.fill(); unlift(g);
        const q = ["#9e2b1f", "#2c4a7a", "#9e2b1f", "#2c4a7a"];
        for (let k = 0; k < 4; k++) { g.fillStyle = q[k]; g.beginPath(); g.moveTo(b.x, b.y); g.arc(b.x, b.y, r, (k * Math.PI) / 2, ((k + 1) * Math.PI) / 2); g.closePath(); g.fill(); }
        g.fillStyle = b.lit > 0 ? "#f6dc8a" : "#c9952f"; g.beginPath(); g.arc(b.x, b.y, r * 0.3, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "#5a3d1c"; g.lineWidth = 1; g.stroke();
      } else if (th.style === "modern") {
        lift(g, th, 2);
        g.fillStyle = hue.bump; g.beginPath(); g.arc(b.x, b.y, r, 0, Math.PI * 2); g.fill(); unlift(g);
        g.fillStyle = "#fff"; g.beginPath(); g.arc(b.x, b.y - 2, r * 0.62, 0, Math.PI * 2); g.fill();
        g.fillStyle = b.lit > 0 ? hue.bump : "#ece9e2"; g.beginPath(); g.arc(b.x, b.y - 2, r * 0.32, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = b.lit > 0 ? "rgba(242, 165, 65, .3)" : "rgba(242, 165, 65, .08)";
        g.beginPath(); for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3 + Math.PI / 6; g.lineTo(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r); } g.closePath(); g.fill();
        glow(g, th, th.accent2, 8);
        g.strokeStyle = th.accent2; g.lineWidth = 1.5; g.stroke(); g.shadowBlur = 0;
        g.beginPath(); g.arc(b.x, b.y, r * 0.38, 0, Math.PI * 2); g.stroke();
      }
    }

    function flipper(f: Flipper) {
      const tp = tip(f);
      if (th.style === "medieval") {
        lift(g, th, 1.5);
        g.strokeStyle = "#3b2414"; g.lineWidth = 16; g.beginPath(); g.moveTo(f.pivot.x, f.pivot.y); g.lineTo(tp.x, tp.y); g.stroke(); unlift(g);
        g.strokeStyle = "#7a5230"; g.lineWidth = 11; g.beginPath(); g.moveTo(f.pivot.x, f.pivot.y); g.lineTo(tp.x, tp.y); g.stroke();
        g.fillStyle = "#c9952f"; g.beginPath(); g.arc(f.pivot.x, f.pivot.y, 5, 0, Math.PI * 2); g.fill();
      } else if (th.style === "modern") {
        lift(g, th, 1.5);
        g.strokeStyle = "#1d1d1f"; g.lineWidth = 16; g.beginPath(); g.moveTo(f.pivot.x, f.pivot.y); g.lineTo(tp.x, tp.y); g.stroke(); unlift(g);
        g.strokeStyle = "#ffffff"; g.lineWidth = 10; g.beginPath(); g.moveTo(f.pivot.x, f.pivot.y); g.lineTo(tp.x, tp.y); g.stroke();
      } else {
        g.strokeStyle = "#0d1724"; g.lineWidth = 14; g.beginPath(); g.moveTo(f.pivot.x, f.pivot.y); g.lineTo(tp.x, tp.y); g.stroke();
        glow(g, th, th.accent, f.pressed ? 10 : 4);
        g.strokeStyle = th.accent; g.lineWidth = 2;
        const nx = -(tp.y - f.pivot.y), ny = tp.x - f.pivot.x, nl = Math.hypot(nx, ny) || 1;
        for (const sg of [-1, 1]) { g.beginPath(); g.moveTo(f.pivot.x + (nx / nl) * 6 * sg, f.pivot.y + (ny / nl) * 6 * sg); g.lineTo(tp.x + (nx / nl) * 4 * sg, tp.y + (ny / nl) * 4 * sg); g.stroke(); }
        g.shadowBlur = 0;
      }
    }

    function draw() {
      g.clearRect(0, 0, c.w, c.h);
      if (th.style === "medieval") paint(g, "wood", th, 0, 0, c.w, c.h);
      else if (th.style === "modern") { g.fillStyle = "#e4e1d9"; g.fillRect(0, 0, c.w, c.h); }
      else { g.fillStyle = "#05080d"; g.fillRect(0, 0, c.w, c.h); }
      const s = Math.min((c.h - 16) / TH, (c.w - 16) / TW);
      const ox = (c.w - TW * s) / 2, oy = (c.h - TH * s) / 2;
      g.save(); g.translate(ox, oy); g.scale(s, s);
      playfield();
      walls();
      // Lanes: studs that light up (candles in the medieval look).
      for (const l of lanes) {
        if (th.style === "medieval") {
          g.fillStyle = "#efe4c8"; g.fillRect(l.x - 3, l.y - 4, 6, 14);
          if (l.on) { g.fillStyle = "#e9a43a"; g.beginPath(); g.ellipse(l.x, l.y - 8, 3, 6 + l.flash * 4, 0, 0, Math.PI * 2); g.fill(); }
        } else if (th.style === "modern") {
          g.fillStyle = l.on ? hue.lane : "#d9d6cf"; g.beginPath(); g.arc(l.x, l.y, 7 + l.flash * 4, 0, Math.PI * 2); g.fill();
        } else {
          g.strokeStyle = l.on ? th.good : "rgba(95, 211, 160, .3)"; g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(l.x, l.y - 8); g.lineTo(l.x + 7, l.y); g.lineTo(l.x, l.y + 8); g.lineTo(l.x - 7, l.y); g.closePath(); g.stroke();
          if (l.on) { g.fillStyle = "rgba(95, 211, 160, .4)"; g.fill(); }
        }
      }
      for (const tg of targets) {
        const hit = tg.hit > 0;
        if (th.style === "medieval") { g.fillStyle = hit ? "#f6dc8a" : "#6b4426"; g.fillRect(tg.x - 6, tg.y - 22, 12, 44); g.strokeStyle = "#c9952f"; g.lineWidth = 1.5; g.strokeRect(tg.x - 6, tg.y - 22, 12, 44); }
        else if (th.style === "modern") { g.fillStyle = hit ? "#1d1d1f" : hue.target; rrect(g, tg.x - 6, tg.y - 22, 12, 44, 6); g.fill(); }
        else { g.strokeStyle = hue.target; g.lineWidth = 1.5; g.strokeRect(tg.x - 5, tg.y - 22, 10, 44); if (hit) { g.fillStyle = "rgba(199, 146, 234, .4)"; g.fillRect(tg.x - 5, tg.y - 22, 10, 44); } }
      }
      for (const b of bumpers) bumper(b);
      for (const f of flippers) flipper(f);
      // Plunger.
      g.fillStyle = th.style === "medieval" ? "#6b4426" : th.style === "modern" ? "#1d1d1f" : "#2a3a4c";
      g.fillRect(358, 700 + plunge * 18, 16, 24);
      g.fillStyle = th.style === "medieval" ? "#c9952f" : th.style === "modern" ? th.accent : th.accent2;
      g.fillRect(356, 698 + plunge * 18, 20, 5);
      // Ball.
      if (ball.live) {
        if (th.style === "scifi") trail.forEach((p, i) => { g.globalAlpha = (i / trail.length) * 0.25; g.fillStyle = th.accent; g.beginPath(); g.arc(p.x, p.y, BR * (i / trail.length), 0, Math.PI * 2); g.fill(); });
        g.globalAlpha = 1;
        lift(g, th, 1);
        const bg2 = g.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, BR);
        bg2.addColorStop(0, "#ffffff"); bg2.addColorStop(1, th.style === "medieval" ? "#6f6658" : "#8a93a6");
        g.fillStyle = bg2; g.beginPath(); g.arc(ball.x, ball.y, BR, 0, Math.PI * 2); g.fill();
        unlift(g);
      }
      sparks.draw(g); floats.draw(g);
      // The score, in a cartouche across the top of the field.
      if (th.style === "medieval") {
        g.fillStyle = "#2a1a0d"; g.fillRect(108, 116, 184, 50);
        paint(g, "parchment", th, 111, 119, 178, 44);
        g.strokeStyle = "#b48a2c"; g.lineWidth = 1; g.strokeRect(114.5, 122.5, 171, 37);
        g.fillStyle = "#2c1f12"; g.font = `700 21px ${th.fontDisplay}`;
      } else if (th.style === "modern") {
        g.fillStyle = "#1d1d1f"; rrect(g, 110, 118, 180, 46, 23); g.fill();
        g.fillStyle = "#fff"; g.font = `800 20px ${th.fontDisplay}`;
      } else {
        g.fillStyle = "rgba(8, 14, 22, .9)"; g.fillRect(110, 118, 180, 46);
        g.strokeStyle = th.accent; g.lineWidth = 1; g.strokeRect(110.5, 118.5, 179, 45);
        g.fillStyle = th.accent; g.font = `600 20px ${th.fontNum}`;
      }
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(points.toLocaleString(), 200, 136);
      g.font = th.style === "scifi" ? `500 9px ${th.fontNum}` : `600 10px ${th.fontUi}`;
      g.fillStyle = th.style === "medieval" ? "#6b5638" : th.style === "modern" ? "rgba(255,255,255,.7)" : th.inkSoft;
      g.fillText(`BALL ${Math.min(balls, drained + 1)} OF ${balls} · ×${mult} · ${Math.ceil(timeLeft)}s`, 200, 155);
      if (ball.inLane && ball.live && ball.y > 660) {
        g.font = th.style === "scifi" ? `600 11px ${th.fontNum}` : `700 11px ${th.fontUi}`;
        g.fillStyle = th.style === "medieval" ? "#2c1f12" : th.style === "modern" ? "#1d1d1f" : th.accent;
        g.fillText("HOLD SPACE", 366, 650);
      }
      g.restore();
    }

    kit.status(`Target ${goal.toLocaleString()}\n3 balls`);
    return () => {};
  },
};
