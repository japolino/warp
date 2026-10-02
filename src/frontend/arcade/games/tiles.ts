// Keys: four lanes, notes falling to the line. Each one hit plays the next note of
// the tune; long notes are held. Miss and the melody drops out.
// Looks: ebony note-blocks over a harpsichord's bone keys (medieval), black piano
// tiles on white (modern), outlined bars on an instrument panel (sci-fi).

import { clamp, rrect, Sparks, type GameDef, type Kit } from "../kit.js";
import { autoplay, tileNotes, judgeColor, JUDGE_LABEL, judgeOf, missLimit, rhythmBeats, SongClock, Tally, windows, type Judge } from "../rhythm.js";
import type { TileNote } from "../songs.js";
import { ground, lift, paint, unlift, glow, brackets } from "../themes.js";

interface Live { n: TileNote; done: boolean; holding: boolean; judged: Judge | null }
const KEYS = ["d", "f", "j", "k"];
const ALT: Record<string, number> = { a: 0, s: 1, l: 3, ";": 3, arrowleft: 0, arrowdown: 1, arrowup: 2, arrowright: 3 };

export const TILES: GameDef = {
  id: "tiles",
  title: "Keys",
  rhythm: true,
  howTo: [
    "Notes fall down four lanes. Press the lane's key as a note crosses the line.",
    "Long notes: hold until the end.",
    "Every note you hit plays the melody — miss and the tune stumbles.",
  ],
  controls: "D F J K (or A S ← ↓ ↑ →) · tap the lanes on touch",
  start(kit: Kit) {
    const t = kit.theme;
    const song = kit.play.song!;
    const clock = new SongClock(kit, song);
    const chart = tileNotes(song);
    const notes: Live[] = chart.map((n) => ({ n, done: false, holding: false, judged: null }));
    const tally = new Tally(notes.length + notes.filter((l) => l.n.d > 0).length * 0.5);
    const win = windows(kit);
    const travel = (1.55 - 0.7 * kit.play.level) * (1 + kit.aid("slow") / 150);
    const limit = missLimit(kit.play.level);
    const c = kit.canvas();
    const g = c.g;
    const sparks = new Sparks();
    const pressed = [false, false, false, false];
    const flash = [0, 0, 0, 0];
    let started = false, ended = false, lastJudge: { j: Judge; at: number } | null = null;

    const geo = () => {
      const w = Math.min(c.w * 0.92, 520, c.h * 0.85);
      const x = (c.w - w) / 2;
      const keyH = Math.min(64, c.h * 0.12);
      const line = c.h - keyH - 14;
      return { x, w, lane: w / 4, line, keyH, speed: line / travel };
    };

    const judge = (j: Judge, lane: number, weight = 1) => {
      tally.add(j, weight);
      lastJudge = { j, at: performance.now() };
      const G = geo();
      const x = G.x + G.lane * (lane + 0.5);
      if (j === "miss") {
        kit.synth.fx("miss");
        if (tally.streak >= limit) {
          if (kit.lives.spend("Second wind!")) tally.streak = 0;
          else end(true);
        }
      } else {
        sparks.burst(x, G.line, j === "perfect" ? t.gold : t.style === "modern" ? t.accent : t.lanes[lane], j === "perfect" ? 12 : 7, 180, 2.5);
        if (tally.combo > 0 && tally.combo % 25 === 0) { kit.synth.fx("combo"); kit.banner(`${tally.combo} in a row`, "gold"); }
      }
      kit.score(tally.score());
      kit.track(tally.form());
      kit.status(`${tally.combo}× combo\n${Math.round(tally.accuracy() * 100)}% accuracy`);
    };

    const hit = (lane: number) => {
      pressed[lane] = true;
      flash[lane] = 1;
      const now = clock.time();
      const l = notes.find((x) => !x.done && x.judged === null && x.n.lane === lane && Math.abs(now - x.n.t) <= win.ok * 1.6);
      if (!l) return;
      const j = judgeOf(now - l.n.t, win);
      if (!j) return;
      clock.melody(l.n.midi, l.n.d || 0.3);
      kit.synth.fx(j === "perfect" ? "perfect" : "hit");
      l.judged = j;
      if (l.n.d > 0) l.holding = true; else l.done = true;
      judge(j, lane);
    };
    const release = (lane: number) => {
      pressed[lane] = false;
      const now = clock.time();
      const l = notes.find((x) => x.holding && x.n.lane === lane);
      if (!l) return;
      l.holding = false; l.done = true;
      const left = l.n.t + l.n.d - now;
      judge(left <= win.great ? "perfect" : left <= l.n.d * 0.35 ? "ok" : "miss", lane, 0.5);
    };

    const end = (early = false) => {
      if (ended) return;
      ended = true;
      clock.stop();
      for (const l of notes) if (!l.done && l.judged === null) { tally.add("miss"); l.done = true; }
      const beats = rhythmBeats(tally);
      if (early) beats.unshift("lost the thread of the tune and couldn't find it again");
      kit.score(tally.score());
      kit.finish({ score: tally.score(), beats, detail: `${tally.counts.perfect} perfect, ${tally.counts.miss} missed, best run ${tally.maxCombo}` });
    };

    kit.onKey((e, isDown) => {
      const k = e.key.toLowerCase();
      const lane = KEYS.indexOf(k) >= 0 ? KEYS.indexOf(k) : ALT[k] ?? -1;
      if (lane < 0) return false;
      if (isDown && !e.repeat) hit(lane);
      else if (!isDown) release(lane);
      return true;
    });
    const laneAt = (e: PointerEvent) => { const r = c.el.getBoundingClientRect(); const G = geo(); return Math.floor((e.clientX - r.left - G.x) / G.lane); };
    const touches = new Map<number, number>();
    c.el.addEventListener("pointerdown", (e) => { const lane = laneAt(e); if (lane < 0 || lane > 3 || kit.paused) return; c.el.setPointerCapture(e.pointerId); touches.set(e.pointerId, lane); hit(lane); });
    const up = (e: PointerEvent) => { const lane = touches.get(e.pointerId); if (lane !== undefined) { touches.delete(e.pointerId); release(lane); } };
    c.el.addEventListener("pointerup", up);
    c.el.addEventListener("pointercancel", up);
    kit.onPause((p) => { if (p) clock.pause(); else void clock.ready.then(() => { if (!kit.paused && !ended) { clock.start(); started = true; } }); });
    kit.onQuit(() => end());

    kit.loop((dt) => {
      const now = clock.time();
      clock.tick();
      if (autoplay()) for (const l of notes) if (!l.done && l.judged === null && now >= l.n.t) { hit(l.n.lane); if (!l.n.d) setTimeout(() => { pressed[l.n.lane] = false; }, 90); else setTimeout(() => release(l.n.lane), l.n.d * 1000); }
      for (const l of notes) {
        if (l.done) continue;
        if (l.holding) {
          if (now >= l.n.t + l.n.d) { l.holding = false; l.done = true; judge("perfect", l.n.lane, 0.5); kit.synth.fx("hit"); }
        } else if (l.judged === null && now - l.n.t > win.ok) {
          l.done = true;
          judge("miss", l.n.lane, l.n.d > 0 ? 1.5 : 1);
        }
      }
      if (started && !ended && now > clock.length + 0.8) end();
      for (let i = 0; i < 4; i++) flash[i] = Math.max(0, flash[i] - dt * 4);
      sparks.step(dt, t.style === "medieval" ? 300 : 0);
      draw(now);
    });

    // ───────── drawing ─────────

    function lanes(G: ReturnType<typeof geo>) {
      if (t.style === "medieval") {
        // A board of dark oak with parchment lanes inlaid.
        paint(g, "wood", t, G.x - 14, 0, G.w + 28, c.h);
        paint(g, "parchment", t, G.x, 0, G.w, G.line);
        g.strokeStyle = "rgba(74, 52, 28, .3)"; g.lineWidth = 1;
        for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(G.x + G.lane * i, 0); g.lineTo(G.x + G.lane * i, G.line); g.stroke(); }
        g.fillStyle = "#b48a2c"; g.fillRect(G.x - 2, 0, 2, c.h); g.fillRect(G.x + G.w, 0, 2, c.h);
      } else if (t.style === "modern") {
        g.fillStyle = "#ffffff"; g.fillRect(G.x, 0, G.w, c.h);
        g.strokeStyle = "rgba(29, 29, 31, .08)"; g.lineWidth = 1;
        for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(G.x + G.lane * i + 0.5, 0); g.lineTo(G.x + G.lane * i + 0.5, c.h); g.stroke(); }
      } else {
        g.fillStyle = "rgba(10, 17, 27, .9)"; g.fillRect(G.x, 0, G.w, c.h);
        g.strokeStyle = "rgba(120, 170, 210, .12)"; g.lineWidth = 1;
        for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(G.x + G.lane * i + 0.5, 0); g.lineTo(G.x + G.lane * i + 0.5, c.h); g.stroke(); }
        // Distance marks down the lanes.
        g.fillStyle = "rgba(120, 170, 210, .12)";
        for (let y = G.line - 40; y > 0; y -= 40) g.fillRect(G.x, y, 6, 1);
      }
      // A lane lit while its key is down.
      for (let i = 0; i < 4; i++) {
        const k = Math.max(flash[i], pressed[i] ? 0.5 : 0);
        if (k <= 0) continue;
        const lg = g.createLinearGradient(0, G.line, 0, G.line - c.h * 0.4);
        const col = t.style === "medieval" ? "180, 138, 44" : t.style === "modern" ? "255, 90, 54" : "94, 200, 229";
        lg.addColorStop(0, `rgba(${col}, ${0.22 * k})`); lg.addColorStop(1, `rgba(${col}, 0)`);
        g.fillStyle = lg; g.fillRect(G.x + G.lane * i, G.line - c.h * 0.4, G.lane, c.h * 0.4);
      }
    }

    function note(x: number, y: number, w: number, h: number, lane: number) {
      if (t.style === "medieval") {
        lift(g, t, 1.2);
        g.fillStyle = "#231710"; rrect(g, x, y, w, h, 3); g.fill(); unlift(g);
        paint(g, "wood", { ...t, wood: "#3a2616" }, x, y, w, h);
        g.strokeStyle = "#b48a2c"; g.lineWidth = 1.5; rrect(g, x + 2.5, y + 2.5, w - 5, h - 5, 2); g.stroke();
        // A gilt rosette.
        const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.18;
        g.fillStyle = "#c9952f";
        for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2 + Math.PI / 4; g.beginPath(); g.ellipse(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6, r * 0.55, r * 0.3, a, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = "#9e2b1f"; g.beginPath(); g.arc(cx, cy, r * 0.35, 0, Math.PI * 2); g.fill();
      } else if (t.style === "modern") {
        g.fillStyle = "#1d1d1f"; rrect(g, x, y, w, h, 6); g.fill();
      } else {
        const col = t.lanes[lane];
        g.fillStyle = "rgba(94, 200, 229, .06)";
        g.fillStyle = `${col}22`; rrect(g, x, y, w, h, 2); g.fill();
        glow(g, t, col, 10);
        g.strokeStyle = col; g.lineWidth = 1.5; rrect(g, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 2); g.stroke();
        g.shadowBlur = 0;
        g.fillStyle = col; g.fillRect(x + 6, y + h - 4, w - 12, 2);
      }
    }

    function hold(x: number, top: number, bottom: number, w: number, lane: number, active: boolean) {
      const h = Math.max(0, bottom - top);
      if (h <= 0) return;
      if (t.style === "medieval") {
        g.fillStyle = active ? "#9e2b1f" : "rgba(158, 43, 31, .55)"; g.fillRect(x + w * 0.38, top, w * 0.24, h);
        g.fillStyle = "#b48a2c"; g.fillRect(x + w * 0.38, top, 1.5, h); g.fillRect(x + w * 0.62 - 1.5, top, 1.5, h);
      } else if (t.style === "modern") {
        g.fillStyle = active ? t.accent : "rgba(29, 29, 31, .78)"; rrect(g, x + w * 0.3, top, w * 0.4, h, 4); g.fill();
      } else {
        const col = t.lanes[lane];
        g.fillStyle = active ? `${col}55` : `${col}22`; g.fillRect(x + w * 0.32, top, w * 0.36, h);
        g.fillStyle = col; g.fillRect(x + w * 0.32, top, 1, h); g.fillRect(x + w * 0.68 - 1, top, 1, h);
      }
    }

    function keyboard(G: ReturnType<typeof geo>) {
      const y = G.line + 8, h = G.keyH;
      // The line.
      if (t.style === "medieval") {
        g.fillStyle = "#b48a2c"; g.fillRect(G.x, G.line - 1.5, G.w, 3);
        g.fillStyle = "#6b4a12"; g.fillRect(G.x, G.line + 1.5, G.w, 1);
        for (const dx of [G.x, G.x + G.w]) { g.save(); g.translate(dx, G.line); g.rotate(Math.PI / 4); g.fillStyle = "#c9952f"; g.fillRect(-5, -5, 10, 10); g.restore(); }
      } else if (t.style === "modern") {
        g.fillStyle = "rgba(29, 29, 31, .08)"; g.fillRect(G.x, G.line - 18, G.w, 36);
        g.fillStyle = t.ink; g.fillRect(G.x, G.line - 1, G.w, 2);
      } else {
        g.fillStyle = t.accent; g.fillRect(G.x, G.line - 0.5, G.w, 1.5);
        brackets(g, G.x - 6, G.line - 10, G.w + 12, 20, "rgba(94, 200, 229, .6)", 8);
      }
      for (let i = 0; i < 4; i++) {
        const x = G.x + G.lane * i + 4, w = G.lane - 8;
        const on = pressed[i];
        if (t.style === "medieval") {
          // Bone keys in an oak frame.
          lift(g, t, on ? 0.3 : 1);
          const kg = g.createLinearGradient(0, y, 0, y + h);
          kg.addColorStop(0, on ? "#d8c79f" : "#f3ead2"); kg.addColorStop(1, on ? "#c2ae82" : "#ddcfae");
          g.fillStyle = kg; rrect(g, x, y + (on ? 2 : 0), w, h - 2, 3); g.fill(); unlift(g);
          g.strokeStyle = "rgba(74, 52, 28, .5)"; g.lineWidth = 1; rrect(g, x, y + (on ? 2 : 0), w, h - 2, 3); g.stroke();
          g.fillStyle = "#5e4a30"; g.font = `700 ${Math.round(Math.min(18, h * 0.32))}px ${t.fontDisplay}`;
        } else if (t.style === "modern") {
          g.fillStyle = on ? t.accent : "#ffffff"; rrect(g, x, y, w, h - 2, 12); g.fill();
          g.strokeStyle = on ? t.accent : "rgba(29, 29, 31, .12)"; g.lineWidth = 1; rrect(g, x + 0.5, y + 0.5, w - 1, h - 3, 12); g.stroke();
          g.fillStyle = on ? "#fff" : t.inkSoft; g.font = `700 ${Math.round(Math.min(17, h * 0.3))}px ${t.fontDisplay}`;
        } else {
          g.fillStyle = on ? `${t.lanes[i]}33` : "rgba(16, 27, 40, .9)";
          g.beginPath(); g.moveTo(x + 8, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h - 10); g.lineTo(x + w - 8, y + h - 2); g.lineTo(x, y + h - 2); g.lineTo(x, y + 8); g.closePath(); g.fill();
          g.strokeStyle = on ? t.lanes[i] : "rgba(120, 170, 210, .3)"; g.lineWidth = 1; g.stroke();
          g.fillStyle = on ? t.lanes[i] : t.inkSoft; g.font = `600 ${Math.round(Math.min(15, h * 0.28))}px ${t.fontNum}`;
        }
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(KEYS[i].toUpperCase(), x + w / 2, y + h / 2);
      }
    }

    function draw(now: number) {
      const G = geo();
      g.clearRect(0, 0, c.w, c.h);
      ground(g, t, c.w, c.h, t.style === "medieval" ? "table" : "page");
      lanes(G);
      const pad = Math.max(3, G.lane * 0.07);
      g.save();
      g.beginPath(); g.rect(G.x, 0, G.w, G.line + 2); g.clip();
      for (const l of notes) {
        if (l.done && !l.holding) continue;
        const yHead = G.line - (l.n.t - now) * G.speed;
        const yTail = G.line - (l.n.t + l.n.d - now) * G.speed;
        if (yTail > c.h + 40 || yHead < -80) continue;
        const x = G.x + G.lane * l.n.lane + pad, w = G.lane - pad * 2;
        const th = Math.max(26, Math.min(G.lane * 0.55, 46));
        if (l.n.d > 0) hold(x, yTail, l.holding ? G.line : yHead - th, w, l.n.lane, l.holding);
        if (l.holding) continue;
        note(x, yHead - th, w, th, l.n.lane);
      }
      g.restore();
      keyboard(G);
      // The combo behind, the judgement over the line.
      if (tally.combo > 2) {
        g.globalAlpha = t.style === "scifi" ? 0.14 : 0.1;
        g.fillStyle = t.style === "scifi" ? t.accent : t.ink;
        g.font = `${t.style === "scifi" ? 600 : 800} ${Math.round(Math.min(130, c.h * 0.2))}px ${t.style === "scifi" ? t.fontNum : t.fontDisplay}`;
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(String(tally.combo), c.w / 2, c.h * 0.36);
        g.globalAlpha = 1;
      }
      if (lastJudge && performance.now() - lastJudge.at < 450) {
        const k = (performance.now() - lastJudge.at) / 450;
        g.globalAlpha = 1 - k;
        g.fillStyle = judgeColor(t, lastJudge.j);
        g.font = `${t.style === "medieval" ? 700 : 800} ${Math.round(26 * (1.1 - k * 0.1))}px ${t.fontDisplay}`; g.textAlign = "center"; g.textBaseline = "middle";
        const label = t.style === "scifi" || t.style === "medieval" ? JUDGE_LABEL[lastJudge.j].toUpperCase() : JUDGE_LABEL[lastJudge.j];
        if (t.light) { g.lineWidth = 4; g.strokeStyle = "rgba(255,255,255,.85)"; g.lineJoin = "round"; g.strokeText(label, c.w / 2, G.line - c.h * 0.2); }
        g.fillText(label, c.w / 2, G.line - c.h * 0.2);
        g.globalAlpha = 1;
      }
      const prog = clamp(now / clock.length);
      g.fillStyle = t.line; g.fillRect(G.x, 0, G.w, 3);
      g.fillStyle = t.style === "modern" ? t.accent : t.style === "medieval" ? "#b48a2c" : t.accent; g.fillRect(G.x, 0, G.w * prog, 3);
      sparks.draw(g);
    }

    return () => clock.stop();
  },
};
