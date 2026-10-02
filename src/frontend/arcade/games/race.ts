// Three-legged race: tied at the ankle to a partner whose stride swings back and
// forth. Step with the left as their leg swings left, the right as it swings right —
// in time and the pair flies, out of step and you stumble. Beat the other pair to the
// tape. A partner who trusts you keeps a steadier rhythm.

import { clamp, Floaters, rrect, Sparks, withMusic, type GameDef, type Kit } from "../kit.js";
import { brackets, lift, paint, unlift } from "../themes.js";
import { backing } from "../synth.js";

export const RACE: GameDef = {
  id: "race",
  title: "Three-legged race",
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
    const th = kit.theme;
    const sparks = new Sparks(), floats = new Floaters(th.fontDisplay, th.style === "scifi" ? null : "rgba(255,255,255,.8)");
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
        sparks.burst(c.w * 0.3, lay().yy + lay().s * 0.5, th.style === "scifi" ? "rgba(94, 200, 229, .8)" : "rgba(150, 110, 70, .8)", 5, 90, 2);
        if (q > 0.6) floats.add(c.w * 0.3, lay().yy - lay().s * 1.3, "In step!", th.style === "scifi" ? th.accent : th.good, 15);
      } else {
        stumbles++; stumbleRun++;
        momentum = Math.max(0.6, momentum - 0.25);
        speed *= 0.4;
        kit.synth.fx("stumble"); kit.shake(0.5);
        floats.add(c.w * 0.3, lay().yy - lay().s * 1.3, "Out of step", th.bad, 15);
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

    // ───────── drawing ─────────

    /** Where things sit: sky, track, the stride meter at the bottom. */
    const lay = () => {
      const meterH = 84;
      const top = Math.max(c.h * 0.36, 96), lane = Math.max(28, (c.h - meterH - top - 14) / 2);
      const s = Math.min(70, lane * 0.9);
      return { meterH, top, lane, s, ry: top + lane * 0.74, yy: top + lane * 1.78 };
    };
    const look = th.style === "medieval"
      ? { you: ["#9e2b1f", "#2c4a7a"], them: ["#5a6b2f", "#7a5a2c"], skin: ["#e3b98f", "#b98458"], legs: "#3b2a1c" }
      : th.style === "modern"
        ? { you: ["#ff5a36", "#2f6fe4"], them: ["#22a06b", "#8e5cf0"], skin: ["#f1c9a0", "#9a6845"], legs: "#1d1d1f" }
        : { you: ["#e9eef3", "#d5dde5"], them: ["#40566e", "#40566e"], skin: ["#5ec8e5", "#5ec8e5"], legs: "#2a3a4c" };

    const runner = (x: number, y: number, s: number, swing: number, shirt: string, skin: string, lean: number) => {
      g.save(); g.translate(x, y); g.rotate(lean);
      g.lineCap = "round";
      g.strokeStyle = look.legs; g.lineWidth = s * 0.15;
      g.beginPath(); g.moveTo(0, -s * 0.05); g.lineTo(Math.sin(swing) * s * 0.35, s * 0.55); g.stroke();
      g.beginPath(); g.moveTo(0, -s * 0.05); g.lineTo(-Math.sin(swing) * s * 0.35, s * 0.55); g.stroke();
      if (th.style === "medieval") {
        // A tunic flaring at the hem, a belt.
        g.fillStyle = shirt; g.beginPath(); g.moveTo(-s * 0.13, -s * 0.6); g.lineTo(s * 0.13, -s * 0.6); g.lineTo(s * 0.2, s * 0.08); g.lineTo(-s * 0.2, s * 0.08); g.closePath(); g.fill();
        g.fillStyle = "#4a2e16"; g.fillRect(-s * 0.16, -s * 0.18, s * 0.32, s * 0.05);
      } else if (th.style === "scifi") {
        g.fillStyle = shirt; rrect(g, -s * 0.15, -s * 0.62, s * 0.3, s * 0.62, s * 0.08); g.fill();
        g.fillStyle = th.accent; g.fillRect(-s * 0.15, -s * 0.4, s * 0.3, s * 0.035);
      } else {
        g.fillStyle = shirt; rrect(g, -s * 0.14, -s * 0.6, s * 0.28, s * 0.6, s * 0.1); g.fill();
        g.fillStyle = "rgba(255,255,255,.85)"; g.font = `800 ${s * 0.16}px ${th.fontDisplay}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(Math.abs(Math.round(x)) % 9 + 1), 0, -s * 0.33);
      }
      g.strokeStyle = th.style === "scifi" ? shirt : skin; g.lineWidth = s * 0.09;
      g.beginPath(); g.moveTo(0, -s * 0.5); g.lineTo(-Math.sin(swing) * s * 0.3, -s * 0.15); g.stroke();
      g.beginPath(); g.moveTo(0, -s * 0.5); g.lineTo(Math.sin(swing) * s * 0.3, -s * 0.15); g.stroke();
      if (th.style === "scifi") {
        g.fillStyle = shirt; g.beginPath(); g.arc(0, -s * 0.77, s * 0.16, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#0a111b"; g.beginPath(); g.ellipse(s * 0.05, -s * 0.78, s * 0.1, s * 0.07, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = skin; g.lineWidth = 1; g.stroke();
      } else {
        g.fillStyle = skin; g.beginPath(); g.arc(0, -s * 0.76, s * 0.14, 0, Math.PI * 2); g.fill();
        if (th.style === "medieval") { g.fillStyle = shirt; g.beginPath(); g.arc(0, -s * 0.8, s * 0.15, Math.PI, 0); g.fill(); }
      }
      g.restore();
    };

    function scenery(W: number, top: number, camera: number) {
      if (th.style === "medieval") {
        // A pale sky, hills, a row of striped tents and bunting.
        const sky = g.createLinearGradient(0, 0, 0, top);
        sky.addColorStop(0, "#c9d6d3"); sky.addColorStop(1, "#efe4c8");
        g.fillStyle = sky; g.fillRect(0, 0, W, top);
        g.fillStyle = "#9aa889";
        g.beginPath(); g.moveTo(0, top * 0.62);
        for (let x = 0; x <= W; x += 20) g.lineTo(x, top * 0.55 + Math.sin((x + camera * 0.1) * 0.012) * top * 0.08);
        g.lineTo(W, top); g.lineTo(0, top); g.fill();
        const tentW = 90;
        for (let i = -1; i < W / tentW + 2; i++) {
          const x = i * tentW * 1.4 - ((camera * 0.45) % (tentW * 1.4));
          const base = top - 4, h = top * 0.38;
          const stripes = i % 2 ? ["#9e2b1f", "#efe4c8"] : ["#2c4a7a", "#efe4c8"];
          for (let k = 0; k < 6; k++) {
            g.fillStyle = stripes[k % 2];
            g.beginPath(); g.moveTo(x + tentW / 2, base - h); g.lineTo(x + (k / 6) * tentW, base); g.lineTo(x + ((k + 1) / 6) * tentW, base); g.closePath(); g.fill();
          }
          g.strokeStyle = "#4a2e16"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + tentW / 2, base - h); g.lineTo(x + tentW / 2, base - h - 12); g.stroke();
          g.fillStyle = "#b48a2c"; g.beginPath(); g.moveTo(x + tentW / 2, base - h - 12); g.lineTo(x + tentW / 2 + 10, base - h - 9); g.lineTo(x + tentW / 2, base - h - 6); g.fill();
        }
        // Bunting.
        g.strokeStyle = "#4a2e16"; g.lineWidth = 1; g.beginPath();
        for (let x = 0; x <= W; x += 10) g.lineTo(x, top * 0.18 + Math.sin(x * 0.02) * 6);
        g.stroke();
        const cols = ["#9e2b1f", "#b48a2c", "#2c4a7a", "#3e6b3a"];
        for (let k = 0, x = -((camera * 0.2) % 30); x < W; x += 30, k++) {
          const y = top * 0.18 + Math.sin(x * 0.02) * 6;
          g.fillStyle = cols[k % 4]; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14, y); g.lineTo(x + 7, y + 14); g.closePath(); g.fill();
        }
      } else if (th.style === "modern") {
        const sky = g.createLinearGradient(0, 0, 0, top);
        sky.addColorStop(0, "#bfe0f5"); sky.addColorStop(1, "#eaf5fb");
        g.fillStyle = sky; g.fillRect(0, 0, W, top);
        // A grandstand: tiers and a soft crowd.
        const st = top * 0.32, sh = top * 0.6;
        g.fillStyle = "#d9d6cf"; g.fillRect(0, st, W, sh);
        g.fillStyle = "#c9c5bc"; for (let r = 1; r < 5; r++) g.fillRect(0, st + (sh / 5) * r, W, 1.5);
        const head = Math.max(3, sh / 13);
        const colors = ["#ff5a36", "#2f6fe4", "#ffb020", "#22a06b", "#8e5cf0", "#ffffff", "#1d1d1f"];
        for (let r = 0; r < 5; r++) for (let i = 0; i < W / (head * 2.6) + 2; i++) {
          const x = ((i * head * 2.6 + r * head * 1.3 - camera * 0.3) % (W + head * 6) + W + head * 6) % (W + head * 6) - head * 3;
          const y = st + (sh / 5) * (r + 0.55) + Math.sin(tt * 7 + i + r) * (over ? head * 0.6 : head * 0.12);
          g.fillStyle = colors[(i * 3 + r * 2) % colors.length]; g.beginPath(); g.arc(x, y, head, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = "#1d1d1f"; g.fillRect(0, st - 6, W, 6);
      } else {
        // Space past the dome, a planet's limb, the station's ribs.
        g.fillStyle = "#04070c"; g.fillRect(0, 0, W, top);
        for (let i = 0; i < 70; i++) {
          const x = ((i * 137.5 - camera * 0.05) % W + W) % W, y = (i * 61.7) % (top * 0.9);
          g.fillStyle = `rgba(214, 226, 238, ${0.25 + (i % 5) * 0.12})`; g.fillRect(x, y, i % 7 ? 1 : 2, i % 7 ? 1 : 2);
        }
        const pr = W * 0.9;
        const pg = g.createRadialGradient(W * 0.7, top + pr * 0.85, pr * 0.8, W * 0.7, top + pr * 0.85, pr);
        pg.addColorStop(0, "#16324a"); pg.addColorStop(0.97, "#1f4f73"); pg.addColorStop(1, "rgba(94, 200, 229, .5)");
        g.fillStyle = pg; g.beginPath(); g.arc(W * 0.7, top + pr * 0.85, pr, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "rgba(120, 170, 210, .25)"; g.lineWidth = 2;
        for (let x = -((camera * 0.6) % 120); x < W; x += 120) { g.beginPath(); g.moveTo(x, top); g.lineTo(x + 40, 0); g.stroke(); }
      }
    }

    function track(W: number, top: number, lane: number, camera: number) {
      const h = lane * 2 + 8;
      if (th.style === "medieval") {
        g.fillStyle = "#6f8a4a"; g.fillRect(0, top - 10, W, c.h - top + 10);
        g.fillStyle = "#b08a5a"; g.fillRect(0, top, W, h);
        g.globalAlpha = 0.35; paint(g, "parchment", { ...th, ground: "#a07c4e" }, 0, top, W, h); g.globalAlpha = 1;
        g.strokeStyle = "rgba(239, 228, 200, .7)"; g.lineWidth = 2; g.setLineDash([10, 8]);
        g.beginPath(); g.moveTo(0, top + lane + 4); g.lineTo(W, top + lane + 4); g.stroke(); g.setLineDash([]);
        g.fillStyle = "#4a2e16"; g.fillRect(0, top - 2, W, 3); g.fillRect(0, top + h - 1, W, 3);
      } else if (th.style === "modern") {
        g.fillStyle = "#7cb35b"; g.fillRect(0, top - 10, W, c.h - top + 10);
        g.fillStyle = "#c8613a"; g.fillRect(0, top, W, h);
        g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 2;
        for (const y of [top + 1, top + lane + 4, top + h - 1]) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      } else {
        g.fillStyle = "#0b131d"; g.fillRect(0, top - 10, W, c.h - top + 10);
        g.fillStyle = "#121e2c"; g.fillRect(0, top, W, h);
        for (let x = -((camera) % 40); x < W; x += 40) { g.fillStyle = "rgba(120, 170, 210, .06)"; g.fillRect(x, top, 1, h); }
        g.fillStyle = th.accent; for (const y of [top, top + lane + 4, top + h - 1]) g.fillRect(0, y, W, 1);
      }
      // Distance marks and the finish.
      for (let m = 0; m <= distance; m += 10) {
        const x = m * 26 - camera;
        if (x < -60 || x > W + 60) continue;
        const fin = m === distance;
        if (fin) {
          if (th.style === "medieval") {
            g.fillStyle = "#4a2e16"; g.fillRect(x - 3, top - 40, 5, h + 40); g.fillRect(x - 3, top + h - 2, 5, 6);
            if (!over) { g.strokeStyle = "#9e2b1f"; g.lineWidth = 3; g.beginPath(); g.moveTo(x, top - 30); g.quadraticCurveTo(x + 6, top + h / 2, x, top + h); g.stroke(); }
          } else if (th.style === "modern") {
            for (let yy = 0; yy < h; yy += 8) for (let k = 0; k < 2; k++) { g.fillStyle = (yy / 8 + k) % 2 ? "#1d1d1f" : "#fff"; g.fillRect(x - 8 + k * 8, top + yy, 8, 8); }
          } else {
            g.strokeStyle = th.accent2; g.lineWidth = 2; g.beginPath(); g.moveTo(x, top); g.lineTo(x, top + h); g.stroke();
            g.strokeStyle = "rgba(242, 165, 65, .4)"; g.beginPath(); g.arc(x, top + h / 2, h * 0.7, -Math.PI / 2 - 0.9, -Math.PI / 2 + 0.9); g.stroke();
          }
        } else {
          g.fillStyle = th.style === "scifi" ? "rgba(94, 200, 229, .35)" : "rgba(255,255,255,.55)"; g.fillRect(x - 1, top, 2, h);
        }
        const label = fin ? (th.style === "medieval" ? "The ribbon" : th.style === "scifi" ? "FINISH" : "Finish") : th.style === "medieval" ? `${m} paces` : `${m} m`;
        if (th.style === "medieval") {
          g.font = `600 13px ${th.fontUi}`; const w = g.measureText(label).width + 12;
          g.fillStyle = "#6b4426"; g.fillRect(x - w / 2, top - 22, w, 16); g.fillStyle = "#4a2e16"; g.fillRect(x - 1, top - 6, 2, 6);
          g.fillStyle = "#efe4c8"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(label, x, top - 14);
        } else {
          g.font = th.style === "scifi" ? `500 11px ${th.fontNum}` : `700 11px ${th.fontUi}`;
          g.fillStyle = th.style === "scifi" ? th.accent : "#1d1d1f"; g.textAlign = "center"; g.textBaseline = "bottom"; g.fillText(label, x, top - 5);
        }
      }
    }

    function meter(W: number, H: number) {
      const mw = Math.min(W * 0.8, 520), mx = W / 2, my = H - 40;
      const zw = (mw / 2) * zone;
      const zl = expect !== "R" && down <= 0, zr = expect !== "L" && down <= 0;
      const px = mx + marker() * (mw / 2 - 8);
      if (th.style === "medieval") {
        lift(g, th, 1.5); g.fillStyle = "#2a1a0d"; g.fillRect(mx - mw / 2 - 18, my - 34, mw + 36, 62); unlift(g);
        paint(g, "parchment", th, mx - mw / 2 - 15, my - 31, mw + 30, 56);
        g.strokeStyle = "#b48a2c"; g.lineWidth = 1; g.strokeRect(mx - mw / 2 - 11.5, my - 27.5, mw + 23, 49);
        g.fillStyle = "rgba(74, 52, 28, .15)"; g.fillRect(mx - mw / 2, my - 5, mw, 10);
        g.fillStyle = zl ? "#3e6b3a" : "rgba(62, 107, 58, .3)"; g.fillRect(mx - mw / 2, my - 5, zw, 10);
        g.fillStyle = zr ? "#3e6b3a" : "rgba(62, 107, 58, .3)"; g.fillRect(mx + mw / 2 - zw, my - 5, zw, 10);
        // A wooden peg on a cord.
        g.fillStyle = "#6b4426"; g.beginPath(); g.ellipse(px, my, 7, 12, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "#2c1f12"; g.lineWidth = 1; g.stroke();
      } else if (th.style === "modern") {
        lift(g, th, 2); g.fillStyle = "#fff"; rrect(g, mx - mw / 2 - 18, my - 32, mw + 36, 60, 30); g.fill(); unlift(g);
        g.fillStyle = "#ece9e2"; rrect(g, mx - mw / 2, my - 6, mw, 12, 6); g.fill();
        g.fillStyle = zl ? th.good : "rgba(31, 157, 85, .25)"; rrect(g, mx - mw / 2, my - 6, zw, 12, 6); g.fill();
        g.fillStyle = zr ? th.good : "rgba(31, 157, 85, .25)"; rrect(g, mx + mw / 2 - zw, my - 6, zw, 12, 6); g.fill();
        lift(g, th); g.fillStyle = "#1d1d1f"; g.beginPath(); g.arc(px, my, 10, 0, Math.PI * 2); g.fill(); unlift(g);
        g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
      } else {
        g.fillStyle = "rgba(10, 17, 27, .92)"; g.fillRect(mx - mw / 2 - 18, my - 32, mw + 36, 60);
        brackets(g, mx - mw / 2 - 18, my - 32, mw + 36, 60, th.accent, 10);
        g.fillStyle = "rgba(120, 170, 210, .14)"; for (let x = mx - mw / 2; x < mx + mw / 2; x += 8) g.fillRect(x, my - 4, 6, 8);
        g.fillStyle = zl ? th.accent : "rgba(94, 200, 229, .25)"; for (let x = mx - mw / 2; x < mx - mw / 2 + zw; x += 8) g.fillRect(x, my - 4, 6, 8);
        g.fillStyle = zr ? th.accent : "rgba(94, 200, 229, .25)"; for (let x = mx + mw / 2 - zw; x < mx + mw / 2; x += 8) g.fillRect(x, my - 4, 6, 8);
        g.fillStyle = th.accent2; g.fillRect(px - 2, my - 12, 4, 24);
      }
      const ink = th.style === "scifi" ? th.accent : th.style === "medieval" ? "#2c1f12" : "#1d1d1f";
      const font = th.style === "scifi" ? `500 12px ${th.fontNum}` : th.style === "medieval" ? `700 12px ${th.fontDisplay}` : `700 12px ${th.fontUi}`;
      g.font = font; g.textBaseline = "middle";
      g.fillStyle = zl ? ink : "rgba(128,128,128,.5)"; g.textAlign = "left"; g.fillText("A", mx - mw / 2 - 4, my - 18);
      g.fillStyle = zr ? ink : "rgba(128,128,128,.5)"; g.textAlign = "right"; g.fillText("D", mx + mw / 2 + 4, my - 18);
      g.fillStyle = ink; g.textAlign = "center";
      g.fillText(down > 0 ? "Getting up…" : `${partner}'s stride`, mx, my - 18);
    }

    let tt = 0;
    function draw() {
      tt += 1 / 60;
      const W = c.w, H = c.h;
      const L = lay();
      const camera = you * 26 - W * 0.3;
      g.clearRect(0, 0, W, H);
      scenery(W, L.top, camera);
      track(W, L.top, L.lane, camera);
      const rx = rival * 26 - camera;
      runner(rx - L.s * 0.18, L.ry, L.s * 0.9, Math.sin(rivalLeg) * 0.9, look.them[0], look.skin[0], 0.12);
      runner(rx + L.s * 0.18, L.ry, L.s * 0.9, -Math.sin(rivalLeg) * 0.9, look.them[1], look.skin[1], 0.12);
      const yx = you * 26 - camera;
      const stride = (legL - legR) * 1.1;
      if (down > 0) {
        g.save(); g.translate(yx, L.yy + L.s * 0.2); g.rotate(-1.2); runner(0, 0, L.s, 0.4, look.you[0], look.skin[0], 0); g.restore();
        g.save(); g.translate(yx + L.s * 0.4, L.yy + L.s * 0.25); g.rotate(-1.4); runner(0, 0, L.s, -0.3, look.you[1], look.skin[1], 0); g.restore();
      } else {
        runner(yx - L.s * 0.2, L.yy, L.s, stride + Math.sin(tt * 12) * 0.05, look.you[0], look.skin[0], 0.08 + speed * 0.01);
        runner(yx + L.s * 0.2, L.yy, L.s, -stride, look.you[1], look.skin[1], 0.08 + speed * 0.01);
        g.strokeStyle = th.style === "medieval" ? "#c9a96a" : th.style === "scifi" ? th.accent2 : "#fff"; g.lineWidth = 3;
        g.beginPath(); g.moveTo(yx - L.s * 0.06, L.yy + L.s * 0.42); g.lineTo(yx + L.s * 0.06, L.yy + L.s * 0.42); g.stroke();
      }
      g.font = th.style === "scifi" ? `500 11px ${th.fontNum}` : `700 12px ${th.style === "medieval" ? th.fontUi : th.fontUi}`;
      g.fillStyle = th.style === "scifi" ? th.accent : "#fff"; g.textAlign = "center"; g.textBaseline = "bottom";
      if (th.style !== "scifi") { g.lineWidth = 3; g.strokeStyle = "rgba(0,0,0,.35)"; g.strokeText(`You & ${partner}`, yx, L.yy - L.s * 1.0); }
      g.fillText(`You & ${partner}`, yx, L.yy - L.s * 1.0);
      sparks.draw(g); floats.draw(g);
      meter(W, H);
      // Who's ahead.
      g.textAlign = "left"; g.textBaseline = "top";
      g.font = th.style === "scifi" ? `600 14px ${th.fontNum}` : `700 15px ${th.fontDisplay}`;
      g.fillStyle = th.style === "scifi" ? th.ink : "#1d1d1f";
      g.fillText(`${Math.round(you)}${th.style === "medieval" ? " paces" : " m"}`, 14, 12);
      g.fillStyle = th.style === "scifi" ? th.inkSoft : "rgba(29,29,31,.6)";
      g.font = th.style === "scifi" ? `500 12px ${th.fontNum}` : `600 13px ${th.fontUi}`;
      g.fillText(`Rivals ${Math.round(rival)}`, 14, 32);
    }
    kit.status(`Tied to ${partner}`);
    kit.synth.fx("whistle");
    return () => {};
  },
};
