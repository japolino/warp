// Aim: targets appear on the beat with a ring closing in; hit them as the ring meets
// the edge. Sliders: press on the head and follow the marker to the end. Every target
// hit plays the next note of the tune.
// Looks: painted archery butts on parchment (medieval), flat discs on paper (modern),
// thin targeting reticles on a panel (sci-fi).

import { clamp, Floaters, Sparks, type GameDef, type Kit } from "../kit.js";
import { aimNotes, autoplay, judgeColor, JUDGE_LABEL, judgeOf, missLimit, rhythmBeats, SongClock, Tally, windows, type Judge } from "../rhythm.js";
import type { AimNote } from "../songs.js";
import { brackets, glow, ground, lift, unlift } from "../themes.js";

interface Live { n: AimNote; i: number; done: boolean; judged: Judge | null; at: number; holding: boolean; follow: number; followN: number; combo: number }
interface Hit { x: number; y: number; at: number; j: Judge; ang: number }

export const AIM: GameDef = {
  id: "aim",
  title: "Aim",
  rhythm: true,
  howTo: [
    "Targets appear with a ring closing in — hit each one as the ring meets its edge.",
    "Long ones leave a trail: press on the head, keep holding, and follow the marker to the end.",
    "Too many misses in a row ends the song. Every hit plays the melody.",
  ],
  controls: "Mouse or touch to aim · click, Z or X to hit",
  start(kit: Kit) {
    const t = kit.theme;
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
    const sparks = new Sparks(), floats = new Floaters(t.fontDisplay, t.light ? "rgba(255,255,255,.7)" : null);
    const hits: Hit[] = [];
    let mx = -100, my = -100, down = false, keyDown = 0;
    let started = false, ended = false;

    // The playfield: 4:3, centred, with room for the targets at its edges.
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
      const u = f - i;
      return pos(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u);
    };
    const chipColor = t.style === "medieval" ? "#6b4426" : t.style === "modern" ? t.accent : t.accent;

    const judge = (l: Live, j: Judge, x: number, y: number) => {
      l.judged = j;
      tally.add(j);
      floats.add(x, y - radius() * 0.2, JUDGE_LABEL[j], judgeColor(t, j), j === "miss" ? 16 : 18);
      if (j === "miss") {
        kit.synth.fx("miss");
        if (tally.streak >= limit) {
          if (kit.lives.spend("Second wind!")) tally.streak = 0;
          else end(true);
        }
      } else {
        sparks.burst(x, y, j === "perfect" ? t.gold : chipColor, j === "perfect" ? 14 : 8, 200, 2.5);
        hits.push({ x: mx, y: my, at: performance.now(), j, ang: Math.atan2(my - y, mx - x) });
        if (tally.combo > 0 && tally.combo % 25 === 0) { kit.synth.fx("combo"); kit.banner(`${tally.combo} in a row`, "gold"); }
      }
      kit.score(tally.score());
      kit.track(tally.form());
      kit.status(`${tally.combo}× combo\n${Math.round(tally.accuracy() * 100)}% accuracy`);
    };

    const press = () => {
      const now = clock.time();
      const r = radius();
      const target = notes.find((l) => !l.done && l.judged === null && Math.abs(now - l.n.t) <= approach && Math.hypot(mx - pos(l.n.x, l.n.y)[0], my - pos(l.n.x, l.n.y)[1]) <= r * 1.15);
      if (!target) return;
      const j = judgeOf(now - target.n.t, win);
      if (!j) return;
      const [x, y] = pos(target.n.x, target.n.y);
      clock.melody(target.n.midi, target.n.slider ? target.n.slider.d : 0.35);
      kit.synth.fx(j === "perfect" ? "perfect" : "hit");
      if (target.n.slider) { target.holding = true; target.judged = j; floats.add(x, y - r * 0.2, JUDGE_LABEL[j], judgeColor(t, j), 16); }
      else { target.done = true; judge(target, j, x, y); }
    };

    const end = (early = false) => {
      if (ended) return;
      ended = true;
      clock.stop();
      for (const l of notes) if (!l.done && l.judged === null) { l.judged = "miss"; tally.add("miss"); }
      const beats = rhythmBeats(tally);
      if (early) beats.unshift("lost the rhythm and couldn't get it back");
      kit.score(tally.score());
      kit.finish({ score: tally.score(), beats, detail: `${tally.counts.perfect} perfect, ${tally.counts.miss} missed, best run ${tally.maxCombo}` });
    };

    const toLocal = (e: PointerEvent) => { const r = c.el.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; };
    c.el.style.cursor = "none";
    c.el.addEventListener("pointermove", toLocal);
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
      const now = clock.time();
      clock.tick();
      const r = radius();
      if (autoplay()) {
        const next = notes.find((l) => !l.done && l.judged === null);
        const hold = notes.find((l) => l.holding);
        if (hold?.n.slider) { [mx, my] = sliderPos(hold.n, (now - hold.n.t) / hold.n.slider.d); down = true; }
        else if (next) { const [x, y] = pos(next.n.x, next.n.y); mx += (x - mx) * Math.min(1, dt * 14); my += (y - my) * Math.min(1, dt * 14); down = false; if (now >= next.n.t) { mx = x; my = y; press(); } }
      }
      const held = down || keyDown > 0;
      for (const l of notes) {
        if (l.done) continue;
        if (l.n.slider && l.holding) {
          const k = (now - l.n.t) / l.n.slider.d;
          const [bx, by] = sliderPos(l.n, k);
          l.followN++;
          if (held && Math.hypot(mx - bx, my - by) <= r * 2.4) l.follow++;
          if (k >= 1) {
            l.done = true;
            const ratio = l.followN ? l.follow / l.followN : 0;
            const base = l.judged ?? "ok";
            const j: Judge = ratio >= 0.85 ? base : ratio >= 0.5 ? (base === "perfect" ? "great" : "ok") : "miss";
            tally.add(j);
            if (j !== "miss") { sparks.burst(bx, by, judgeColor(t, j), 10, 180, 2.5); kit.synth.fx("hit"); } else kit.synth.fx("miss");
            floats.add(bx, by - r * 0.2, j === "miss" ? "Broke off" : JUDGE_LABEL[j], judgeColor(t, j), 15);
            kit.score(tally.score()); kit.track(tally.form());
          }
        } else if (l.judged === null && now - l.n.t > win.ok) {
          l.done = true;
          const [x, y] = pos(l.n.x, l.n.y);
          judge(l, "miss", x, y);
        }
      }
      if (started && !ended && now > clock.length + 0.8) end();
      sparks.step(dt, t.style === "medieval" ? 400 : 0); floats.step(dt);
      draw(now, r);
    });

    // ───────── drawing ─────────

    function target(x: number, y: number, r: number, alpha: number, n: number) {
      g.globalAlpha = alpha;
      if (t.style === "medieval") {
        // A painted straw butt: cream, black, blue, red and a gold heart, ink-ruled.
        lift(g, t, 1.2);
        const rings = ["#efe4c8", "#2b2116", "#2c4a7a", "#9e2b1f", "#c9952f"];
        rings.forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r * (1 - i * 0.19), 0, Math.PI * 2); g.fill(); if (i === 0) unlift(g); });
        g.strokeStyle = "rgba(43, 31, 18, .55)"; g.lineWidth = 1;
        for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(x, y, r * (1 - i * 0.19), 0, Math.PI * 2); g.stroke(); }
        g.strokeStyle = "#5a3d1c"; g.lineWidth = Math.max(2, r * 0.07);
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      } else if (t.style === "modern") {
        lift(g, t, 1.5);
        g.fillStyle = t.accent;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        unlift(g);
        g.strokeStyle = "#fff"; g.lineWidth = Math.max(3, r * 0.1);
        g.beginPath(); g.arc(x, y, r - g.lineWidth / 2, 0, Math.PI * 2); g.stroke();
        g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
        g.font = `800 ${Math.round(r * 0.8)}px ${t.fontDisplay}`;
        g.fillText(String(n), x, y + 1);
      } else {
        // A reticle: dark disc, a ring with four ticks, the number in mono.
        g.fillStyle = "rgba(10, 17, 27, .85)";
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        glow(g, t, t.accent, 10);
        g.strokeStyle = t.accent; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, r - 1, 0, Math.PI * 2); g.stroke();
        g.shadowBlur = 0;
        g.lineWidth = 1.5;
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2;
          g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62); g.lineTo(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86); g.stroke();
        }
        g.fillStyle = t.ink; g.textAlign = "center"; g.textBaseline = "middle";
        g.font = `600 ${Math.round(r * 0.62)}px ${t.fontNum}`;
        g.fillText(String(n), x, y + 1);
      }
      g.globalAlpha = 1;
    }

    function approachRing(x: number, y: number, r: number, k: number, alpha: number) {
      const ar = r * (1 + (1 - k) * 2.2);
      g.globalAlpha = alpha;
      if (t.style === "scifi") { g.setLineDash([6, 5]); g.strokeStyle = t.accent; g.lineWidth = 1.5; }
      else { g.strokeStyle = t.style === "medieval" ? "#2c1f12" : t.ink; g.lineWidth = t.style === "medieval" ? 2 : 2.5; }
      g.beginPath(); g.arc(x, y, ar, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
    }

    function trailOf(pts: (readonly [number, number])[], r: number, alpha: number) {
      g.globalAlpha = alpha;
      g.lineCap = "round"; g.lineJoin = "round";
      const path = () => { g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); };
      if (t.style === "medieval") {
        // A red ribbon with gilt edges.
        path(); g.strokeStyle = "#b48a2c"; g.lineWidth = r * 1.5; g.stroke();
        path(); g.strokeStyle = "#9e2b1f"; g.lineWidth = r * 1.5 - 5; g.stroke();
        path(); g.strokeStyle = "rgba(255,255,255,.12)"; g.lineWidth = r * 0.3; g.stroke();
      } else if (t.style === "modern") {
        path(); g.strokeStyle = t.accent; g.lineWidth = r * 1.7; g.stroke();
        path(); g.strokeStyle = t.ground; g.lineWidth = r * 1.7 - 6; g.stroke();
      } else {
        path(); g.strokeStyle = t.accent; g.lineWidth = r * 1.6; g.stroke();
        path(); g.strokeStyle = "#0a111b"; g.lineWidth = r * 1.6 - 3; g.stroke();
        g.setLineDash([2, 8]); path(); g.strokeStyle = "rgba(94, 200, 229, .5)"; g.lineWidth = 2; g.stroke(); g.setLineDash([]);
      }
      g.globalAlpha = 1;
    }

    function marker(x: number, y: number, r: number) {
      if (t.style === "medieval") {
        // A gold coin.
        lift(g, t);
        const gr = g.createRadialGradient(x - r * 0.25, y - r * 0.25, 1, x, y, r * 0.7);
        gr.addColorStop(0, "#f6dc8a"); gr.addColorStop(1, "#a87b1f");
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 0.7, 0, Math.PI * 2); g.fill(); unlift(g);
        g.strokeStyle = "#6b4a12"; g.lineWidth = 1.5; g.stroke();
      } else if (t.style === "modern") {
        lift(g, t);
        g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y, r * 0.72, 0, Math.PI * 2); g.fill(); unlift(g);
        g.strokeStyle = t.accent; g.lineWidth = 4; g.stroke();
      } else {
        glow(g, t, t.accent, 12);
        g.fillStyle = t.accent; g.beginPath(); g.arc(x, y, r * 0.45, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
      }
    }

    /** An arrow (or dart, or bolt mark) left where it struck, fading. */
    function struck(h: Hit) {
      const age = (performance.now() - h.at) / 700;
      if (age >= 1) return;
      g.globalAlpha = 1 - age;
      if (t.style === "medieval") {
        const len = 26;
        g.strokeStyle = "#4a2e16"; g.lineWidth = 2;
        g.beginPath(); g.moveTo(h.x, h.y); g.lineTo(h.x + Math.cos(-0.8) * len, h.y + Math.sin(-0.8) * len); g.stroke();
        const fx = h.x + Math.cos(-0.8) * len, fy = h.y + Math.sin(-0.8) * len;
        g.fillStyle = "#e9e1cf"; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + 7, fy - 2); g.lineTo(fx + 2, fy + 5); g.closePath(); g.fill();
      } else {
        g.strokeStyle = judgeColor(t, h.j); g.lineWidth = 2;
        g.beginPath(); g.arc(h.x, h.y, 6 + age * 26, 0, Math.PI * 2); g.stroke();
      }
      g.globalAlpha = 1;
    }

    function cursor() {
      const held = down || keyDown > 0;
      if (t.style === "medieval") {
        g.strokeStyle = held ? t.accent : "#2c1f12"; g.lineWidth = 1.5;
        g.beginPath(); g.arc(mx, my, 9, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(mx - 15, my); g.lineTo(mx - 4, my); g.moveTo(mx + 4, my); g.lineTo(mx + 15, my); g.moveTo(mx, my - 15); g.lineTo(mx, my - 4); g.moveTo(mx, my + 4); g.lineTo(mx, my + 15); g.stroke();
      } else if (t.style === "modern") {
        g.fillStyle = held ? t.accent : t.ink;
        g.beginPath(); g.arc(mx, my, 7, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
      } else {
        g.strokeStyle = held ? t.accent2 : t.accent; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(mx - 12, my); g.lineTo(mx - 3, my); g.moveTo(mx + 3, my); g.lineTo(mx + 12, my); g.moveTo(mx, my - 12); g.lineTo(mx, my - 3); g.moveTo(mx, my + 3); g.lineTo(mx, my + 12); g.stroke();
        g.strokeRect(mx - 6.5, my - 6.5, 13, 13);
      }
    }

    function draw(now: number, r: number) {
      const f = field();
      g.clearRect(0, 0, c.w, c.h);
      ground(g, t, c.w, c.h);
      if (t.style === "scifi") brackets(g, f.x - r, f.y - r, f.w + r * 2, f.h + r * 2, "rgba(94, 200, 229, .35)", 18);
      else if (t.style === "medieval") { g.strokeStyle = "rgba(90, 61, 28, .25)"; g.lineWidth = 1; g.strokeRect(f.x - r, f.y - r, f.w + r * 2, f.h + r * 2); g.strokeRect(f.x - r + 4, f.y - r + 4, f.w + r * 2 - 8, f.h + r * 2 - 8); }
      // Progress along the top.
      const prog = clamp(now / clock.length);
      g.fillStyle = t.line; g.fillRect(0, 0, c.w, 3);
      g.fillStyle = t.style === "medieval" ? t.accent : t.accent; g.fillRect(0, 0, c.w * prog, 3);

      const visible = notes.filter((l) => !l.done && l.n.t - now <= approach && l.n.t - now > -(l.n.slider ? l.n.slider.d + 0.2 : 0.3));
      // Dotted guides from each target to the next.
      for (let k = 0; k < visible.length - 1; k++) {
        const a = visible[k], b = visible[k + 1];
        const end0 = a.n.slider ? a.n.slider.pts[a.n.slider.pts.length - 1] : [a.n.x, a.n.y];
        const [ax, ay] = pos(end0[0], end0[1]);
        const [bx, by] = pos(b.n.x, b.n.y);
        const d = Math.hypot(bx - ax, by - ay);
        if (d < r * 2.5) continue;
        g.fillStyle = t.style === "scifi" ? "rgba(94, 200, 229, .35)" : t.inkSoft;
        for (let s = r * 1.3; s < d - r * 1.3; s += 14) { g.beginPath(); g.arc(ax + ((bx - ax) * s) / d, ay + ((by - ay) * s) / d, 1.6, 0, Math.PI * 2); g.fill(); }
      }
      for (const l of [...visible].reverse()) {
        const [x, y] = pos(l.n.x, l.n.y);
        const k = 1 - (l.n.t - now) / approach;
        const alpha = clamp(k * 2.4);
        if (l.n.slider) {
          trailOf(l.n.slider.pts.map(([px, py]) => pos(px, py)), r, alpha);
          if (l.holding) {
            const [bx, by] = sliderPos(l.n, (now - l.n.t) / l.n.slider.d);
            g.strokeStyle = t.style === "scifi" ? "rgba(94, 200, 229, .5)" : t.inkSoft; g.lineWidth = 1.5; g.setLineDash([4, 6]);
            g.beginPath(); g.arc(bx, by, r * 2.4, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
            marker(bx, by, r);
            continue;
          }
        }
        if (l.judged !== null && !l.n.slider) continue;
        target(x, y, r, alpha, l.combo);
        if (k < 1 && l.judged === null) approachRing(x, y, r, k, alpha);
      }
      for (const h of hits) struck(h);
      while (hits.length && performance.now() - hits[0].at > 700) hits.shift();
      sparks.draw(g); floats.draw(g);
      if (tally.combo > 1) {
        g.textAlign = "left"; g.textBaseline = "bottom";
        g.font = `${t.style === "medieval" ? 700 : 800} ${Math.round(Math.min(40, c.h * 0.07))}px ${t.style === "scifi" ? t.fontNum : t.fontDisplay}`;
        g.fillStyle = t.style === "scifi" ? t.accent : t.ink;
        g.globalAlpha = 0.8;
        g.fillText(`${tally.combo}×`, 18, c.h - 12);
        g.globalAlpha = 1;
      }
      cursor();
    }

    return () => clock.stop();
  },
};
