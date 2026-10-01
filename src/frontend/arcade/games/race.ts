// Three-legged race: tied at the ankle to a partner whose stride swings back and
// forth. Step with the left as their leg swings left, the right as it swings right —
// in time and the pair flies, out of step and you stumble. Beat the other pair to the
// tape. A partner who trusts you keeps a steadier rhythm.

import { clamp, FONT_NUM, FONT_UI, Floaters, rrect, Sparks, withMusic, type GameDef, type Kit } from "../kit.js";
import { backing } from "../synth.js";

export const RACE: GameDef = {
  id: "race",
  title: "Three-legged race",
  theme: { bg: "#0b1a10", bg2: "#1f4a2a", accent: "#ffd23f", accent2: "#ff7a3d" },
  howTo: [
    "Your partner's tied leg swings left and right along the meter.",
    "Step LEFT when it reaches the left zone, RIGHT when it reaches the right — alternating.",
    "Good steps build speed; stepping out of time makes you stumble, and three stumbles in a row is a fall.",
    "Beat the other pair to the tape.",
  ],
  controls: "A / ← left step · D / → right step · tap the left or right half on touch",
  start(kit: Kit) {
    const L = kit.play.level;
    const sync = kit.play.partner?.sync ?? 0;
    const partner = kit.play.partner?.name ?? "your partner";
    const distance = 60;
    const zone = clamp((0.34 - 0.12 * L) * (1 + kit.aid("window") / 100), 0.12, 0.6);
    const basePeriod = 1.0 - 0.22 * L;
    const drift = (0.26 - 0.18 * sync) * (0.6 + 0.6 * L);
    const rivalTime = 52 - 26 * L;
    let phase = -Math.PI / 2, t = 0, you = 0, rival = 0, speed = 0, momentum = 1, expect: "L" | "R" | null = null;
    let lastZone: "L" | "R" | null = null, armed = { L: true, R: true };
    let stumbles = 0, stumbleRun = 0, falls = 0, down = 0, good = 0, steps = 0, over = false, perfect = 0;
    let legL = 0, legR = 0, rivalLeg = 0;
    const c = kit.canvas();
    const g = c.g;
    const sparks = new Sparks(), floats = new Floaters();
    const seedOff = kit.rng() * 10;

    const marker = () => Math.sin(phase);
    const inZone = (side: "L" | "R") => (side === "L" ? marker() <= -(1 - zone) : marker() >= 1 - zone);
    const step = (side: "L" | "R") => {
      if (over || down > 0) return;
      steps++;
      const ok = inZone(side) && (expect === null || expect === side);
      if (ok && armed[side]) {
        armed[side] = false;
        const q = (Math.abs(marker()) - (1 - zone)) / zone;
        const stride = 0.55 + 0.55 * clamp(q);
        if (q > 0.6) perfect++;
        good++; stumbleRun = 0;
        momentum = Math.min(1.5, momentum + 0.06);
        speed += stride * momentum * 1.9;
        expect = side === "L" ? "R" : "L";
        if (side === "L") legL = 1; else legR = 1;
        kit.synth.fx("step");
        const Y = c.h * 0.62;
        sparks.burst(c.w * 0.3, Y + 30, "rgba(200, 160, 110, .9)", 5, 90, 2);
        if (q > 0.6) floats.add(c.w * 0.3, Y - 70, "In step!", "#ffd23f", 15);
      } else {
        stumbles++; stumbleRun++;
        momentum = Math.max(0.6, momentum - 0.25);
        speed *= 0.4;
        kit.synth.fx("stumble"); kit.shake(0.5);
        floats.add(c.w * 0.3, c.h * 0.62 - 70, "Out of step", "#ff5d6c", 15);
        if (stumbleRun >= 3) {
          stumbleRun = 0;
          if (kit.lives.spend("Caught each other!")) return;
          falls++;
          down = 1.6;
          speed = 0; momentum = 1;
          kit.synth.fx("crash"); kit.shake(1.2);
          kit.banner("Down you go!", "bad");
        }
      }
    };

    kit.onKey((e, isDown) => {
      const k = e.key.toLowerCase();
      const side = k === "a" || k === "arrowleft" ? "L" : k === "d" || k === "arrowright" ? "R" : null;
      if (!side) return false;
      if (isDown && !e.repeat) step(side);
      return true;
    });
    c.el.addEventListener("pointerdown", (e) => {
      if (kit.paused) return;
      const r = c.el.getBoundingClientRect();
      step(e.clientX - r.left < r.width / 2 ? "L" : "R");
    });
    withMusic(kit, () => backing(kit.synth, "bright", () => 1.1));
    kit.onQuit(() => finish(false));

    const finish = (won: boolean) => {
      if (over) return;
      over = true;
      const margin = won ? (distance - rival) / Math.max(0.5, distance / rivalTime) : 0;
      const s = won ? clamp(0.75 + 0.25 * clamp(margin / 6)) : clamp(0.75 * (you / distance));
      kit.score(s);
      kit.synth.fx(won ? "cheer" : "lose");
      if (won) kit.banner("First across!", "good"); else kit.banner("Beaten to the tape", "bad");
      const beats: string[] = [];
      if (won) beats.push(margin > 4 ? `${partner} and {{user}} won going away` : margin < 1 ? `${partner} and {{user}} won by a whisker` : `${partner} and {{user}} won it`);
      else beats.push(you > distance * 0.85 ? "lost by a stride" : "the other pair ran away with it");
      if (falls) beats.push(falls > 1 ? "fell over more than once" : "went down in a heap once");
      else if (stumbles === 0) beats.push(`perfectly in step with ${partner}`);
      else if (stumbles < 4) beats.push(`mostly in step with ${partner}`);
      else beats.push(`kept tripping over each other`);
      kit.finish({ score: s, beats, detail: `${good} good steps, ${stumbles} stumbles${falls ? `, ${falls} fall${falls > 1 ? "s" : ""}` : ""}` });
    };

    kit.loop((dt) => {
      t += dt;
      if (!over) {
        // The partner's stride: steady, with a drift a closer partner keeps small.
        const period = basePeriod * (1 + drift * Math.sin(t * 0.55 + seedOff) + drift * 0.5 * Math.sin(t * 1.7 + seedOff * 2));
        phase += (dt * Math.PI * 2) / Math.max(0.35, period);
        const zoneNow = marker() <= -(1 - zone) ? "L" : marker() >= 1 - zone ? "R" : null;
        // A swing that passes without a step costs a little speed; the zone re-arms each pass.
        if (zoneNow !== lastZone) {
          if (lastZone && armed[lastZone] && down <= 0 && expect === lastZone) { momentum = Math.max(0.7, momentum - 0.1); }
          if (zoneNow) armed[zoneNow] = true;
          lastZone = zoneNow;
        }
        if (down > 0) { down -= dt; if (down <= 0) expect = null; }
        speed *= Math.pow(0.35, dt);
        you = Math.min(distance, you + speed * dt);
        rival = Math.min(distance, rival + (distance / rivalTime) * dt * (0.92 + 0.16 * Math.sin(t * 0.9 + seedOff)));
        rivalLeg = (rivalLeg + dt * 3.4) % (Math.PI * 2);
        kit.score(you >= distance ? 0.75 + 0.25 * clamp((distance - rival) / 8) : 0.75 * (you / distance));
        if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) {
          kit.track(clamp(0.5 + (you - rival) / 10));
          kit.status(`${Math.round(you)} m / ${distance}\n${you >= rival ? "Ahead" : `${Math.round(rival - you)} m behind`}`);
        }
        if (you >= distance) finish(true);
        else if (rival >= distance) finish(false);
      }
      legL = Math.max(0, legL - dt * 4); legR = Math.max(0, legR - dt * 4);
      sparks.step(dt); floats.step(dt);
      draw();
    });

    const runner = (x: number, y: number, s: number, swing: number, shirt: string, skin: string, lean: number) => {
      // A runner: head, body, arms and legs swinging with the stride.
      g.save(); g.translate(x, y); g.rotate(lean);
      g.lineCap = "round";
      g.strokeStyle = "#2b2b38"; g.lineWidth = s * 0.16;
      g.beginPath(); g.moveTo(0, -s * 0.05); g.lineTo(Math.sin(swing) * s * 0.35, s * 0.55); g.stroke();
      g.beginPath(); g.moveTo(0, -s * 0.05); g.lineTo(-Math.sin(swing) * s * 0.35, s * 0.55); g.stroke();
      g.fillStyle = shirt; rrect(g, -s * 0.14, -s * 0.6, s * 0.28, s * 0.6, s * 0.1); g.fill();
      g.strokeStyle = skin; g.lineWidth = s * 0.1;
      g.beginPath(); g.moveTo(0, -s * 0.5); g.lineTo(-Math.sin(swing) * s * 0.3, -s * 0.15); g.stroke();
      g.beginPath(); g.moveTo(0, -s * 0.5); g.lineTo(Math.sin(swing) * s * 0.3, -s * 0.15); g.stroke();
      g.fillStyle = skin; g.beginPath(); g.arc(0, -s * 0.76, s * 0.15, 0, Math.PI * 2); g.fill();
      g.restore();
    };

    function draw() {
      const W = c.w, H = c.h;
      g.clearRect(0, 0, W, H);
      // Sky, stands and crowd.
      // Room for the stride meter at the bottom; the track sits above it.
      const meterH = 84;
      const top = Math.max(H * 0.34, 90), lane = Math.max(28, (H - meterH - top - 14) / 2);
      const sky = g.createLinearGradient(0, 0, 0, top);
      sky.addColorStop(0, "#7fc8ff"); sky.addColorStop(1, "#d8f0ff");
      g.fillStyle = sky; g.fillRect(0, 0, W, top);
      const camera = you * 26 - W * 0.3;
      const standTop = top * 0.35, standH = top * 0.55;
      g.fillStyle = "#3d4a6b"; g.fillRect(0, standTop, W, standH);
      g.fillStyle = "#2c3652"; for (let r = 1; r < 5; r++) g.fillRect(0, standTop + (standH / 5) * r, W, 2);
      const head = Math.max(2.5, standH / 14);
      for (let r = 0; r < 5; r++) for (let i = 0; i < W / (head * 3) + 2; i++) {
        const cx = ((i * head * 3 + r * head * 1.4 - camera * 0.3) % (W + head * 6) + W + head * 6) % (W + head * 6) - head * 3;
        const cy = standTop + (standH / 5) * (r + 0.6);
        const bob = Math.sin(t * 7 + i * 1.7 + r) * (over ? head * 0.8 : head * 0.2);
        g.fillStyle = ["#ff7a3d", "#ffd23f", "#59e3ff", "#ff5fa2", "#f5f5f5", "#7cff6b", "#b18cff"][(i * 3 + r) % 7];
        g.beginPath(); g.arc(cx, cy + bob, head, 0, Math.PI * 2); g.fill();
      }
      // Grass and track.
      g.fillStyle = "#3fa34d"; g.fillRect(0, top - 10, W, H - top + 10);
      g.fillStyle = "#c8613a"; g.fillRect(0, top, W, lane * 2 + 8);
      g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 2;
      for (const y of [top, top + lane + 4, top + lane * 2 + 8]) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      // Distance marks and the finish.
      for (let m = 0; m <= distance; m += 10) {
        const x = m * 26 - camera;
        if (x < -50 || x > W + 50) continue;
        g.strokeStyle = m === distance ? "#fff" : "rgba(255,255,255,.4)"; g.lineWidth = m === distance ? 6 : 2;
        g.beginPath(); g.moveTo(x, top); g.lineTo(x, top + lane * 2 + 8); g.stroke();
        g.fillStyle = "rgba(255,255,255,.85)"; g.font = `700 12px ${FONT_UI}`; g.textAlign = "center";
        g.fillText(m === distance ? "FINISH" : `${m} m`, x, top - 6);
        if (m === distance && !over) { g.strokeStyle = "#ff3d5a"; g.lineWidth = 3; g.beginPath(); g.moveTo(x, top - 2); g.lineTo(x, top + lane * 2 + 10); g.stroke(); }
      }
      // The pairs: the rival behind, yours in front.
      const s = Math.min(70, lane * 0.9);
      const rx = rival * 26 - camera, ry = top + lane * 0.72;
      runner(rx - s * 0.18, ry, s * 0.9, Math.sin(rivalLeg) * 0.9, "#4b6bd6", "#d9a679", 0.12);
      runner(rx + s * 0.18, ry, s * 0.9, -Math.sin(rivalLeg) * 0.9, "#4b6bd6", "#8d5a3b", 0.12);
      const yx = you * 26 - camera, yy = top + lane * 1.76;
      const stride = (legL - legR) * 1.1;
      const fallen = down > 0;
      if (fallen) {
        g.save(); g.translate(yx, yy + s * 0.2); g.rotate(-1.2); runner(0, 0, s, 0.4, "#ff7a3d", "#f1c27d", 0); g.restore();
        g.save(); g.translate(yx + s * 0.4, yy + s * 0.25); g.rotate(-1.4); runner(0, 0, s, -0.3, "#ffd23f", "#c68642", 0); g.restore();
      } else {
        runner(yx - s * 0.2, yy, s, stride + Math.sin(t * 12) * 0.05, "#ff7a3d", "#f1c27d", 0.08 + speed * 0.01);
        runner(yx + s * 0.2, yy, s, -stride, "#ffd23f", "#c68642", 0.08 + speed * 0.01);
        g.strokeStyle = "#fff"; g.lineWidth = 4; g.beginPath(); g.moveTo(yx - s * 0.05, yy + s * 0.42); g.lineTo(yx + s * 0.05, yy + s * 0.42); g.stroke();
      }
      g.fillStyle = "#fff"; g.font = `700 12px ${FONT_UI}`; g.textAlign = "center";
      g.fillText(`You & ${partner}`, yx, yy - s * 1.05);
      sparks.draw(g); floats.draw(g);

      // The stride meter: an arc, the zones at its ends, your partner's leg swinging.
      const mw = Math.min(W * 0.8, 520), mx = W / 2, my = H - 40;
      g.fillStyle = "rgba(0,0,0,.55)"; rrect(g, mx - mw / 2 - 16, my - 34, mw + 32, 64, 18); g.fill();
      g.fillStyle = "rgba(255,255,255,.1)"; rrect(g, mx - mw / 2, my - 8, mw, 16, 8); g.fill();
      const zw = mw / 2 * zone;
      const zl = expect !== "R" && down <= 0, zr = expect !== "L" && down <= 0;
      g.fillStyle = zl ? "rgba(255,210,63,.75)" : "rgba(255,210,63,.25)"; rrect(g, mx - mw / 2, my - 8, zw, 16, 8); g.fill();
      g.fillStyle = zr ? "rgba(255,210,63,.75)" : "rgba(255,210,63,.25)"; rrect(g, mx + mw / 2 - zw, my - 8, zw, 16, 8); g.fill();
      const px = mx + marker() * (mw / 2 - 6);
      g.fillStyle = "#fff"; g.shadowColor = "#ffd23f"; g.shadowBlur = 14;
      g.beginPath(); g.arc(px, my, 11, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
      g.font = `800 15px ${FONT_NUM}`; g.fillStyle = zl ? "#ffd23f" : "rgba(255,255,255,.4)"; g.textAlign = "left";
      g.fillText("A ◀", mx - mw / 2 - 2, my - 18);
      g.fillStyle = zr ? "#ffd23f" : "rgba(255,255,255,.4)"; g.textAlign = "right";
      g.fillText("▶ D", mx + mw / 2 + 2, my - 18);
      g.textAlign = "center"; g.fillStyle = "rgba(255,255,255,.7)"; g.font = `700 11px ${FONT_UI}`;
      g.fillText(down > 0 ? "Getting up…" : `${partner}'s stride`, mx, my - 18);
      // Who's ahead.
      g.font = `800 ${Math.round(Math.min(22, H * 0.04))}px ${FONT_NUM}`; g.fillStyle = "#1b2a1b"; g.textAlign = "left";
      g.fillText(`${Math.round(you)}m`, 14, 26);
      g.fillStyle = "#2c3f8f"; g.fillText(`Rivals ${Math.round(rival)}m`, 14, 50);
    }
    kit.status(`Tied to ${partner}`);
    kit.synth.fx("whistle");
    return () => {};
  },
};
