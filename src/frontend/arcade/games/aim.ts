// Aim: circles appear on the beat with a ring closing in; hit them as the ring meets
// the edge. Sliders: press on the head and follow the ball to the end. Every circle
// hit plays the next note of the tune.

import { clamp, FONT_NUM, FONT_UI, Floaters, Sparks, type GameDef, type Kit } from "../kit.js";
import { aimNotes, JUDGE_COLOR, JUDGE_LABEL, judgeOf, missLimit, rhythmBeats, SongClock, Tally, windows, type Judge } from "../rhythm.js";
import type { AimNote } from "../songs.js";

interface Live { n: AimNote; i: number; done: boolean; judged: Judge | null; at: number; holding: boolean; follow: number; followN: number; combo: number }

export const AIM: GameDef = {
  id: "aim",
  title: "Aim",
  theme: { bg: "#0b0716", bg2: "#2a1240", accent: "#ff5fa2", accent2: "#7c5cff" },
  rhythm: true,
  howTo: [
    "Circles appear with a ring closing in — hit each one as the ring meets its edge.",
    "Sliders: press on the head, keep holding, and follow the ball to the end.",
    "Too many misses in a row ends the song. Hits play the melody.",
  ],
  controls: "Mouse or touch to aim · click, Z or X to hit",
  start(kit: Kit) {
    const song = kit.play.song!;
    const clock = new SongClock(kit, song);
    const chart = aimNotes(song, kit.rng);
    const notes: Live[] = chart.map((n, i) => ({ n, i, done: false, judged: null, at: 0, holding: false, follow: 0, followN: 0, combo: (i % 8) + 1 }));
    const tally = new Tally(notes.length);
    const win = windows(kit);
    const approach = (1.25 - 0.6 * kit.play.level) * (1 + kit.aid("slow") / 200);
    const limit = missLimit(kit.play.level);
    const c = kit.canvas();
    const g = c.g;
    const sparks = new Sparks(), floats = new Floaters();
    let mx = -100, my = -100, down = false, keyDown = 0;
    const trail: { x: number; y: number; t: number }[] = [];
    let pulse = 0, started = false, ended = false;

    // The playfield: 4:3, centred, with room for the circles at its edges.
    const field = () => {
      const pad = Math.min(c.w, c.h) * 0.08;
      const w = Math.min(c.w - pad * 2, (c.h - pad * 2) * (4 / 3));
      const h = w * 0.75;
      return { x: (c.w - w) / 2, y: (c.h - h) / 2, w, h };
    };
    const radius = () => {
      const f = field();
      return Math.min(f.w, f.h) * 0.072 * (1 + kit.aid("size") / 100) * (1.22 - 0.38 * kit.play.level);
    };
    const pos = (x: number, y: number) => { const f = field(); return [f.x + x * f.w, f.y + y * f.h] as const; };

    const sliderPos = (n: AimNote, k: number) => {
      const pts = n.slider!.pts;
      const f = clamp(k) * (pts.length - 1);
      const i = Math.min(pts.length - 2, Math.floor(f));
      const t = f - i;
      return pos(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t);
    };

    const judge = (l: Live, j: Judge, x: number, y: number) => {
      l.judged = j;
      tally.add(j);
      floats.add(x, y - radius() * 0.2, JUDGE_LABEL[j], JUDGE_COLOR[j], j === "miss" ? 17 : 19);
      if (j === "miss") {
        kit.synth.fx("miss");
        if (tally.streak >= limit) {
          if (kit.lives.spend("Second wind!")) tally.streak = 0;
          else end(true);
        }
      } else {
        sparks.burst(x, y, JUDGE_COLOR[j], j === "perfect" ? 18 : 10, 260);
        if (tally.combo > 0 && tally.combo % 25 === 0) { kit.synth.fx("combo"); kit.banner(`${tally.combo} combo`, "gold"); }
      }
      kit.score(tally.score());
      kit.track(tally.form());
      kit.status(`${tally.combo}× combo\n${Math.round(tally.accuracy() * 100)}% accuracy`);
    };

    const press = () => {
      const t = clock.time();
      const r = radius();
      // The oldest unhit circle under the cursor that's within reach.
      const target = notes.find((l) => !l.done && l.judged === null && Math.abs(t - l.n.t) <= approach && Math.hypot(mx - pos(l.n.x, l.n.y)[0], my - pos(l.n.x, l.n.y)[1]) <= r * 1.15);
      if (!target) return;
      const j = judgeOf(t - target.n.t, win);
      if (!j) {
        // Far too early: the circle shakes, nothing counts.
        if (t < target.n.t) { target.at = t; return; }
        return;
      }
      const [x, y] = pos(target.n.x, target.n.y);
      clock.melody(target.n.midi, target.n.slider ? target.n.slider.d : 0.35);
      kit.synth.fx(j === "perfect" ? "perfect" : "hit");
      pulse = 1;
      if (target.n.slider) { target.holding = true; target.judged = j; floats.add(x, y - r * 0.2, JUDGE_LABEL[j], JUDGE_COLOR[j], 17); sparks.burst(x, y, JUDGE_COLOR[j], 8, 200); }
      else { target.done = true; judge(target, j, x, y); }
    };

    const end = (early = false) => {
      if (ended) return;
      ended = true;
      clock.stop();
      // Notes never reached count as misses.
      for (const l of notes) if (!l.done && l.judged === null) { l.judged = "miss"; tally.add("miss"); }
      const beats = rhythmBeats(tally);
      if (early) beats.unshift("lost the rhythm and couldn't get it back");
      kit.score(tally.score());
      kit.finish({ score: tally.score(), beats, detail: `${tally.counts.perfect} perfect, ${tally.counts.miss} missed, best run ${tally.maxCombo}` });
    };

    const toLocal = (e: PointerEvent) => { const r = c.el.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; };
    c.el.style.cursor = "none";
    c.el.addEventListener("pointermove", (e) => { toLocal(e); });
    c.el.addEventListener("pointerdown", (e) => { toLocal(e); c.el.setPointerCapture(e.pointerId); if (!kit.paused) { down = true; press(); } });
    c.el.addEventListener("pointerup", () => { down = false; });
    kit.onKey((e, isDown) => {
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "x") return false;
      if (isDown && !e.repeat) { keyDown++; press(); } else if (!isDown) keyDown = Math.max(0, keyDown - 1);
      return true;
    });
    kit.onPause((p) => { if (p) clock.pause(); else void clock.ready.then(() => { if (!kit.paused && !ended) { clock.start(); started = true; } }); });
    kit.onQuit(() => end());

    kit.loop((dt) => {
      const t = clock.time();
      clock.tick();
      const r = radius();
      const held = down || keyDown > 0;
      for (const l of notes) {
        if (l.done) continue;
        if (l.n.slider && l.holding) {
          const k = (t - l.n.t) / l.n.slider.d;
          const [bx, by] = sliderPos(l.n, k);
          l.followN++;
          if (held && Math.hypot(mx - bx, my - by) <= r * 2.4) l.follow++;
          if (k >= 1) {
            l.done = true;
            const ratio = l.followN ? l.follow / l.followN : 0;
            const base = l.judged ?? "ok";
            const j: Judge = ratio >= 0.85 ? base : ratio >= 0.5 ? (base === "perfect" ? "great" : "ok") : "miss";
            tally.add(j);
            if (j !== "miss") { sparks.burst(bx, by, JUDGE_COLOR[j], 12, 220); kit.synth.fx("hit"); }
            else kit.synth.fx("miss");
            floats.add(bx, by - r * 0.2, j === "miss" ? "Slider broke" : JUDGE_LABEL[j], JUDGE_COLOR[j], 16);
            kit.score(tally.score()); kit.track(tally.form());
          }
        } else if (l.judged === null && t - l.n.t > win.ok) {
          l.done = true;
          const [x, y] = pos(l.n.x, l.n.y);
          judge(l, "miss", x, y);
        }
      }
      if (started && !ended && t > clock.length + 0.8) end();
      pulse = Math.max(0, pulse - dt * 3.5);
      trail.push({ x: mx, y: my, t: performance.now() });
      while (trail.length && performance.now() - trail[0].t > 120) trail.shift();
      sparks.step(dt); floats.step(dt);
      draw(t, r);
    });

    function draw(t: number, r: number) {
      const f = field();
      g.clearRect(0, 0, c.w, c.h);
      // A field that breathes with the hits.
      const grd = g.createRadialGradient(c.w / 2, c.h / 2, 10, c.w / 2, c.h / 2, Math.max(c.w, c.h) * 0.7);
      grd.addColorStop(0, `rgba(124, 92, 255, ${0.16 + pulse * 0.14})`);
      grd.addColorStop(1, "rgba(0, 0, 0, 0)");
      g.fillStyle = grd; g.fillRect(0, 0, c.w, c.h);
      g.strokeStyle = "rgba(255,255,255,.05)"; g.lineWidth = 1;
      g.strokeRect(f.x - r, f.y - r, f.w + r * 2, f.h + r * 2);
      // Progress along the top.
      const prog = clamp(t / clock.length);
      g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(0, 0, c.w, 4);
      g.fillStyle = "#ff5fa2"; g.fillRect(0, 0, c.w * prog, 4);

      const visible = notes.filter((l) => !l.done && l.n.t - t <= approach && l.n.t - t > -(l.n.slider ? l.n.slider.d + 0.2 : 0.3));
      // Follow points from each circle to the next.
      for (let k = 0; k < visible.length - 1; k++) {
        const a = visible[k], b = visible[k + 1];
        const [ax, ay] = pos(a.n.slider ? a.n.slider.pts[a.n.slider.pts.length - 1][0] : a.n.x, a.n.slider ? a.n.slider.pts[a.n.slider.pts.length - 1][1] : a.n.y);
        const [bx, by] = pos(b.n.x, b.n.y);
        const d = Math.hypot(bx - ax, by - ay);
        if (d < r * 2.5) continue;
        g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 2; g.setLineDash([4, 10]);
        g.beginPath(); g.moveTo(ax + (bx - ax) * (r / d), ay + (by - ay) * (r / d)); g.lineTo(bx - (bx - ax) * (r / d), by - (by - ay) * (r / d)); g.stroke();
        g.setLineDash([]);
      }
      // Later circles underneath earlier ones.
      for (const l of [...visible].reverse()) {
        const [x, y] = pos(l.n.x, l.n.y);
        const k = 1 - (l.n.t - t) / approach;
        const alpha = clamp(k * 2.4);
        if (l.n.slider) {
          const pts = l.n.slider.pts.map(([px, py]) => pos(px, py));
          g.globalAlpha = alpha * 0.9;
          g.lineCap = "round"; g.lineJoin = "round";
          g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = r * 2;
          g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
          g.strokeStyle = "rgba(40, 18, 64, .95)"; g.lineWidth = r * 2 - 6;
          g.stroke();
          const [ex, ey] = pts[pts.length - 1];
          g.fillStyle = "rgba(255,95,162,.35)"; g.beginPath(); g.arc(ex, ey, r * 0.85, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
          if (l.holding) {
            const kk = (t - l.n.t) / l.n.slider.d;
            const [bx, by] = sliderPos(l.n, kk);
            g.strokeStyle = "rgba(255,224,102,.75)"; g.lineWidth = 3;
            g.beginPath(); g.arc(bx, by, r * 2.4, 0, Math.PI * 2); g.stroke();
            ball(bx, by, r);
            continue;
          }
        }
        if (l.judged !== null && !l.n.slider) continue;
        circle(x, y, r, alpha, l.combo);
        if (k < 1 && l.judged === null) {
          const ar = r * (1 + (1 - k) * 2.2);
          g.globalAlpha = alpha;
          g.strokeStyle = "#ffffff"; g.lineWidth = 3;
          g.beginPath(); g.arc(x, y, ar, 0, Math.PI * 2); g.stroke();
          g.globalAlpha = 1;
        }
      }
      sparks.draw(g); floats.draw(g);
      // Combo in the corner.
      if (tally.combo > 1) {
        g.textAlign = "left"; g.textBaseline = "bottom";
        g.font = `800 ${Math.round(Math.min(48, c.h * 0.08))}px ${FONT_NUM}`;
        g.fillStyle = "rgba(255,255,255,.85)";
        g.fillText(`${tally.combo}×`, 18, c.h - 14);
      }
      // The cursor and its trail.
      for (let k = 0; k < trail.length; k++) {
        const p = trail[k];
        g.globalAlpha = (k / trail.length) * 0.5;
        g.fillStyle = "#ffd1e6";
        g.beginPath(); g.arc(p.x, p.y, 4 + (k / trail.length) * 5, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
      const held = down || keyDown > 0;
      g.fillStyle = held ? "#ffe066" : "#ffffff";
      g.shadowColor = "#ff5fa2"; g.shadowBlur = 14;
      g.beginPath(); g.arc(mx, my, held ? 8 : 10, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
    }

    function circle(x: number, y: number, r: number, alpha: number, n: number) {
      g.globalAlpha = alpha;
      const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      grd.addColorStop(0, "#ff8cc0"); grd.addColorStop(1, "#c2306f");
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#fff"; g.lineWidth = Math.max(3, r * 0.1);
      g.stroke();
      g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = `800 ${Math.round(r * 0.85)}px ${FONT_UI}`;
      g.fillText(String(n), x, y + 1);
      g.globalAlpha = 1;
    }
    function ball(x: number, y: number, r: number) {
      g.fillStyle = "#ffe066"; g.shadowColor = "#ffe066"; g.shadowBlur = 18;
      g.beginPath(); g.arc(x, y, r * 0.8, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
    }

    return () => clock.stop();
  },
};
