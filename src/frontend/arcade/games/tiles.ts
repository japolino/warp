// Keys: four lanes, tiles falling to the line. Each one hit plays the next note of
// the tune; long notes are held. Miss and the melody drops out.

import { clamp, FONT_NUM, FONT_UI, rrect, Sparks, type GameDef, type Kit } from "../kit.js";
import { tileNotes, JUDGE_COLOR, JUDGE_LABEL, judgeOf, missLimit, rhythmBeats, SongClock, Tally, windows, type Judge } from "../rhythm.js";
import type { TileNote } from "../songs.js";

interface Live { n: TileNote; done: boolean; holding: boolean; judged: Judge | null; released: number }
const KEYS = ["d", "f", "j", "k"];
const ALT: Record<string, number> = { a: 0, s: 1, l: 3, ";": 3, arrowleft: 0, arrowdown: 1, arrowup: 2, arrowright: 3 };
const LANE_HUE = ["#59e3ff", "#8f7bff", "#ff7bd1", "#ffd166"];

export const TILES: GameDef = {
  id: "tiles",
  title: "Keys",
  theme: { bg: "#050a14", bg2: "#0d2238", accent: "#59e3ff", accent2: "#8f7bff" },
  rhythm: true,
  howTo: [
    "Tiles fall down four lanes. Press the lane's key as a tile crosses the line.",
    "Long tiles: hold until the end.",
    "Every tile you hit plays the melody — miss and the tune stumbles.",
  ],
  controls: "D F J K (or A S ← ↓ ↑ →) · tap the lanes on touch",
  start(kit: Kit) {
    const song = kit.play.song!;
    const clock = new SongClock(kit, song);
    const chart = tileNotes(song);
    const notes: Live[] = chart.map((n) => ({ n, done: false, holding: false, judged: null, released: 0 }));
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
      const w = Math.min(c.w * 0.92, 560, c.h * 0.9);
      const x = (c.w - w) / 2;
      const line = c.h * 0.84;
      return { x, w, lane: w / 4, line, speed: line / travel };
    };

    const judge = (l: Live, j: Judge, lane: number, weight = 1) => {
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
        sparks.burst(x, G.line, LANE_HUE[lane], j === "perfect" ? 16 : 9, 240);
        if (tally.combo > 0 && tally.combo % 25 === 0) { kit.synth.fx("combo"); kit.banner(`${tally.combo} combo`, "gold"); }
      }
      kit.score(tally.score());
      kit.track(tally.form());
      kit.status(`${tally.combo}× combo\n${Math.round(tally.accuracy() * 100)}% accuracy`);
    };

    const hit = (lane: number) => {
      pressed[lane] = true;
      flash[lane] = 1;
      const t = clock.time();
      const l = notes.find((x) => !x.done && x.judged === null && x.n.lane === lane && Math.abs(t - x.n.t) <= win.ok * 1.6);
      if (!l) return;
      const j = judgeOf(t - l.n.t, win);
      if (!j) return;
      clock.melody(l.n.midi, l.n.d || 0.3);
      kit.synth.fx(j === "perfect" ? "perfect" : "hit");
      l.judged = j;
      if (l.n.d > 0) l.holding = true; else l.done = true;
      judge(l, j, lane);
    };
    const release = (lane: number) => {
      pressed[lane] = false;
      const t = clock.time();
      const l = notes.find((x) => x.holding && x.n.lane === lane);
      if (!l) return;
      l.holding = false; l.done = true;
      const left = l.n.t + l.n.d - t;
      judge(l, left <= win.great ? "perfect" : left <= l.n.d * 0.35 ? "ok" : "miss", lane, 0.5);
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
      const t = clock.time();
      clock.tick();
      for (const l of notes) {
        if (l.done) continue;
        if (l.holding) {
          if (t >= l.n.t + l.n.d) { l.holding = false; l.done = true; judge(l, "perfect", l.n.lane, 0.5); kit.synth.fx("hit"); }
          else if (Math.random() < dt * 20) { const G = geo(); sparks.burst(G.x + G.lane * (l.n.lane + 0.5), G.line, LANE_HUE[l.n.lane], 2, 120, 2); }
        } else if (l.judged === null && t - l.n.t > win.ok) {
          l.done = true;
          judge(l, "miss", l.n.lane, l.n.d > 0 ? 1.5 : 1);
        }
      }
      if (started && !ended && t > clock.length + 0.8) end();
      for (let i = 0; i < 4; i++) flash[i] = Math.max(0, flash[i] - dt * 4);
      sparks.step(dt);
      draw(t);
    });

    function draw(t: number) {
      const G = geo();
      g.clearRect(0, 0, c.w, c.h);
      // The keyboard's floor: lanes, the line, a glow where keys are down.
      const bg = g.createLinearGradient(0, 0, 0, c.h);
      bg.addColorStop(0, "rgba(13, 34, 56, .0)"); bg.addColorStop(1, "rgba(89, 227, 255, .10)");
      g.fillStyle = bg; g.fillRect(G.x, 0, G.w, c.h);
      for (let i = 0; i < 4; i++) {
        const x = G.x + G.lane * i;
        if (pressed[i] || flash[i] > 0) {
          const lg = g.createLinearGradient(0, G.line, 0, G.line - c.h * 0.5);
          lg.addColorStop(0, `${LANE_HUE[i]}${Math.round(40 + flash[i] * 50).toString(16)}`); lg.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = lg; g.fillRect(x, 0, G.lane, G.line);
        }
        g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.h); g.stroke();
      }
      g.beginPath(); g.moveTo(G.x + G.w, 0); g.lineTo(G.x + G.w, c.h); g.stroke();
      // Tiles.
      const pad = Math.max(3, G.lane * 0.06);
      for (const l of notes) {
        if (l.done && !l.holding) continue;
        const yHead = G.line - (l.n.t - t) * G.speed;
        const yTail = G.line - (l.n.t + l.n.d - t) * G.speed;
        if (yTail > c.h + 40 || yHead < -80) continue;
        const x = G.x + G.lane * l.n.lane + pad, w = G.lane - pad * 2;
        const th = Math.max(26, G.lane * 0.42);
        if (l.n.d > 0) {
          const top = yTail, bottom = l.holding ? G.line : yHead;
          g.fillStyle = l.holding ? `${LANE_HUE[l.n.lane]}cc` : "rgba(255,255,255,.16)";
          rrect(g, x + w * 0.22, top, w * 0.56, Math.max(0, bottom - top), 8); g.fill();
        }
        if (l.holding) continue;
        // A key of light: the lane's colour, brighter at the leading edge.
        const grd = g.createLinearGradient(0, yHead - th, 0, yHead);
        grd.addColorStop(0, `${LANE_HUE[l.n.lane]}55`); grd.addColorStop(1, LANE_HUE[l.n.lane]);
        g.fillStyle = grd;
        g.shadowColor = LANE_HUE[l.n.lane]; g.shadowBlur = 18;
        rrect(g, x, yHead - th, w, th, 9); g.fill();
        g.shadowBlur = 0;
        g.fillStyle = "rgba(255,255,255,.85)";
        rrect(g, x + 6, yHead - 7, w - 12, 3, 2); g.fill();
      }
      // The line, and the keys under it.
      g.fillStyle = "rgba(255,255,255,.85)";
      g.fillRect(G.x, G.line - 1, G.w, 2);
      g.shadowColor = "#59e3ff"; g.shadowBlur = 12; g.fillRect(G.x, G.line - 1, G.w, 2); g.shadowBlur = 0;
      for (let i = 0; i < 4; i++) {
        const x = G.x + G.lane * i + pad, w = G.lane - pad * 2, y = G.line + 10, h = Math.min(54, c.h - G.line - 18);
        g.fillStyle = pressed[i] ? LANE_HUE[i] : "rgba(255,255,255,.06)";
        rrect(g, x, y, w, h, 10); g.fill();
        g.strokeStyle = `${LANE_HUE[i]}88`; g.lineWidth = 1.5; rrect(g, x, y, w, h, 10); g.stroke();
        g.fillStyle = pressed[i] ? "#07101c" : "rgba(255,255,255,.7)";
        g.font = `700 ${Math.round(Math.min(18, h * 0.4))}px ${FONT_NUM}`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(KEYS[i].toUpperCase(), x + w / 2, y + h / 2);
      }
      // Combo behind everything, judgement over the line.
      if (tally.combo > 2) {
        g.globalAlpha = 0.16; g.fillStyle = "#fff";
        g.font = `800 ${Math.round(Math.min(150, c.h * 0.22))}px ${FONT_UI}`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(String(tally.combo), c.w / 2, c.h * 0.38);
        g.globalAlpha = 1;
      }
      if (lastJudge && performance.now() - lastJudge.at < 450) {
        const k = (performance.now() - lastJudge.at) / 450;
        g.globalAlpha = 1 - k;
        g.fillStyle = JUDGE_COLOR[lastJudge.j];
        g.font = `800 ${Math.round(30 * (1.15 - k * 0.15))}px ${FONT_UI}`; g.textAlign = "center";
        g.fillText(JUDGE_LABEL[lastJudge.j].toUpperCase(), c.w / 2, G.line - c.h * 0.22);
        g.globalAlpha = 1;
      }
      const prog = clamp(t / clock.length);
      g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(G.x, 0, G.w, 3);
      g.fillStyle = "#59e3ff"; g.fillRect(G.x, 0, G.w * prog, 3);
      sparks.draw(g);
    }

    return () => clock.stop();
  },
};
