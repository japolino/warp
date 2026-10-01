// Playing FxEvents: short visual flourishes over what's already on screen, and
// the matching sounds. Nothing here changes the game — if an element isn't
// there (a message not mounted, the stage closed) the effect simply skips.
// "reduced" (or the system's reduce-motion setting) keeps colour and banners
// but drops shaking, particles and flying numbers.

import type { FxEvent } from "./fx-events.js";
import { play, type Sound } from "./sfx.js";

export interface FxOptions {
  /** full | reduced | off — visuals. */
  fx: "full" | "reduced" | "off";
  /** all | games (dates, dungeons, encounters) | off — sounds. */
  sfx: "all" | "games" | "off";
  stage: HTMLElement | null;
  /** The chat message element for a message id (null when it isn't mounted). */
  message(id: string): Element | null;
}

const reducedMotion = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

function temp(parent: Element, cls: string, html: string, ms: number, style?: Record<string, string>): HTMLElement {
  const el = document.createElement("div");
  el.className = cls;
  el.innerHTML = html;
  if (style) for (const [k, v] of Object.entries(style)) el.style.setProperty(k, v);
  parent.appendChild(el);
  setTimeout(() => el.remove(), ms);
  return el;
}

function pulse(el: Element | null | undefined, cls: string, ms = 900) {
  if (!el) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth; // restart the animation
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

function particles(parent: Element, glyphs: string[], n: number, cls: string) {
  const box = document.createElement("div");
  box.className = `warp-fx-particles ${cls}`;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("span");
    p.textContent = glyphs[i % glyphs.length];
    p.style.setProperty("--x", `${Math.round((Math.random() - 0.5) * 220)}px`);
    p.style.setProperty("--y", `${Math.round(-60 - Math.random() * 140)}px`);
    p.style.setProperty("--r", `${Math.round((Math.random() - 0.5) * 70)}deg`);
    p.style.setProperty("--d", `${(Math.random() * 0.35).toFixed(2)}s`);
    p.style.setProperty("--s", `${(0.8 + Math.random() * 0.8).toFixed(2)}`);
    box.appendChild(p);
  }
  parent.appendChild(box);
  setTimeout(() => box.remove(), 2200);
}

const TIER_WORD: Record<string, string> = { crit_success: "Critical!", success: "Success", partial: "Partial", fail: "Failed", crit_fail: "Disaster!" };
const TIER_TONE: Record<string, string> = { crit_success: "crit", success: "good", partial: "warn", fail: "bad", crit_fail: "critbad" };
const TIER_SOUND: Record<string, Sound> = { crit_success: "crit", success: "success", partial: "partial", fail: "fail", crit_fail: "critFail" };

export function playFx(events: FxEvent[], o: FxOptions) {
  if (!events.length) return;
  const visual = o.fx !== "off";
  const motion = o.fx === "full" && !reducedMotion();
  const sound = (s: Sound, game: boolean) => { if (o.sfx === "all" || (o.sfx === "games" && game)) play(s); };
  const stage = o.stage && o.stage.isConnected && o.stage.offsetParent !== null ? o.stage : null;
  let flips = 0, hits = 0;

  for (const e of events) {
    switch (e.kind) {
      case "roll": {
        sound("dice", false);
        sound(TIER_SOUND[e.tier] ?? "success", false);
        const row = o.message(e.messageId)?.querySelector(".warp-chips") ?? null;
        if (!visual || !row) break;
        const chip = row.querySelector(".warp-dice");
        pulse(chip, `warp-fx-pop`, 1400);
        pulse(row, `warp-fx-tone-${TIER_TONE[e.tier] ?? "good"}`, 1600);
        const stamp = temp(row, `warp-fx-stamp warp-fx-${TIER_TONE[e.tier] ?? "good"}${motion ? " moving" : ""}`, `<span class="warp-fx-die">🎲</span><b>${TIER_WORD[e.tier] ?? e.tier}</b><span class="warp-fx-label">${e.label.replace(/[<>&]/g, "")}</span>`, 2600);
        if (motion && e.crit) particles(stamp, e.tier === "crit_success" ? ["✦", "★", "✧"] : ["✕", "·"], 14, `warp-fx-${TIER_TONE[e.tier]}`);
        break;
      }
      case "round": {
        if (e.tier) sound(TIER_SOUND[e.tier] ?? "success", true);
        if (e.ended) sound(e.ended === "win" ? "victory" : "defeat", true);
        const msg = o.message(e.messageId);
        if (!visual || !msg) break;
        const card = msg.querySelector(".warp-round-latest, .warp-enc-log .warp-round-final");
        pulse(card, `warp-fx-pop`, 1200);
        if (e.ended) {
          const host = msg.querySelector(".warp-enc-log, .warp-enc-guide") ?? msg;
          temp(host, `warp-fx-stamp warp-fx-${e.ended === "win" ? "crit" : "critbad"}${motion ? " moving" : ""}`, `<b>${e.ended === "win" ? "Over — you came out on top" : "Over — it went badly"}</b>`, 2600);
          if (motion && e.ended === "loss") pulse(msg, "warp-fx-shake", 600);
        }
        break;
      }
      case "reaction": {
        const s: Sound = e.reaction === "love" ? "heart" : e.reaction === "like" ? "like" : e.reaction === "neutral" ? "meh" : "chill";
        sound(s, true);
        if (!visual || !stage) break;
        const at = stage.querySelector(".warp-stage-portrait, .warp-stage-person, .warp-stage-scene") ?? stage;
        if (e.reaction === "love" || e.reaction === "like") {
          if (motion) particles(at, e.reaction === "love" ? ["💗", "💕", "💖", "♥"] : ["♥", "✧"], e.reaction === "love" ? 12 : 5, "warp-fx-hearts");
          pulse(stage, "warp-fx-warm", 1600);
        } else if (e.reaction === "dislike" || e.reaction === "hate") {
          pulse(stage, e.reaction === "hate" ? "warp-fx-frost-hard" : "warp-fx-frost", 1800);
          if (motion && e.reaction === "hate") pulse(stage.querySelector(".warp-stage-scene"), "warp-fx-shake", 600);
        }
        break;
      }
      case "stage": {
        sound(e.up ? "stageUp" : "stageDown", true);
        if (!visual || !stage) break;
        temp(stage, `warp-fx-banner ${e.up ? "up" : "down"}`, `<span>${e.up ? "Closer" : "Cooler"}</span><b>${e.label.replace(/[<>&]/g, "")}</b>`, 2800);
        if (motion && e.up) particles(stage, ["✦", "💗", "✧"], 18, "warp-fx-hearts");
        break;
      }
      case "dateStart": sound("dateStart", true); break;
      case "dateEnd": break;
      case "hit": {
        if (hits++ < 2) sound(e.ko ? "ko" : e.crit && e.side === "foe" ? "critHit" : e.side === "party" ? "hurt" : "hit", true);
        if (!visual || !stage) break;
        const el = stage.querySelector(`[data-fid="${CSS.escape(e.id)}"]`);
        if (!el) break;
        if (motion) {
          pulse(el, e.crit ? "warp-fx-shake-hard" : "warp-fx-shake", 600);
          temp(el, `warp-fx-number ${e.side === "party" ? "hurt" : "dmg"}${e.crit ? " crit" : ""}`, `${e.crit ? "<small>CRIT</small>" : ""}-${e.amount}`, 1300, { left: `${30 + Math.random() * 40}%` });
          if (e.crit) pulse(stage.querySelector(".warp-stage-arena"), "warp-fx-flash", 400);
        }
        pulse(el, "warp-fx-hurt", 700);
        if (e.ko) pulse(el, "warp-fx-ko", 1200);
        break;
      }
      case "heal": {
        sound("heal", true);
        const el = stage?.querySelector(`[data-fid="${CSS.escape(e.id)}"]`);
        if (!visual || !el) break;
        pulse(el, "warp-fx-heal", 900);
        if (motion) temp(el, "warp-fx-number heal", `+${e.amount}`, 1300, { left: "50%" });
        break;
      }
      case "reveal": {
        if (flips++ === 0) sound("flip", true);
        const el = stage?.querySelector(`[data-tile="${e.x},${e.y}"]`);
        if (visual && motion && el) { (el as HTMLElement).style.setProperty("--fx-delay", `${Math.min(flips, 6) * 60}ms`); pulse(el, "warp-fx-flip", 900); }
        if (visual && el && (e.tile === "treasure" || e.tile === "boss")) pulse(el, "warp-fx-glint", 1400);
        break;
      }
      case "step": sound("step", true); break;
      case "floor": {
        sound("floor", true);
        if (visual && stage) temp(stage, `warp-fx-floor${motion ? " moving" : ""}`, `<span>Floor</span><b>${e.depth}</b>`, 2200);
        break;
      }
      case "gold": {
        sound("coin", true);
        const el = stage?.querySelector(".warp-stage-gold");
        if (visual && el) { pulse(el, "warp-fx-glint", 1200); if (motion) temp(el, "warp-fx-number gold", `+${e.amount}`, 1300, { left: "50%" }); }
        break;
      }
      case "loot": {
        sound("loot", true);
        const el = stage?.querySelector(".warp-stage-bag, .warp-stage-loot");
        if (visual && el) { pulse(el, "warp-fx-glint", 1400); if (motion) particles(el, ["✦", "✧", "·"], 10, "warp-fx-gold"); }
        break;
      }
      case "level": {
        sound("level", true);
        if (visual && stage) temp(stage, "warp-fx-banner up", `<span>Level up</span><b>Level ${e.level}</b>`, 2600);
        break;
      }
      case "battle": {
        sound("battle", true);
        if (visual && stage) { pulse(stage.querySelector(".warp-stage-arena"), e.boss ? "warp-fx-boss" : "warp-fx-flash", 900); }
        break;
      }
      case "battleOver": {
        sound(e.won ? "victory" : "defeat", true);
        if (visual && stage) temp(stage, `warp-fx-banner ${e.won ? "up" : "down"}`, `<span>${e.won ? "Victory" : "Defeat"}</span><b>${e.won ? "The fight is won" : "You fall back"}</b>`, 2600);
        break;
      }
    }
  }
}

/**
 * The visual-novel typewriter: reveal `el`'s text a few characters at a time.
 * Returns a function that finishes it at once (a click skips to the end).
 */
export function typewrite(el: HTMLElement, cps = 55): () => boolean {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: { n: Text; full: string }[] = [];
  for (let t = walker.nextNode(); t; t = walker.nextNode()) nodes.push({ n: t as Text, full: (t as Text).data });
  const total = nodes.reduce((a, x) => a + x.full.length, 0);
  if (total < 12) return () => false;
  for (const x of nodes) x.n.data = "";
  let shown = 0, done = false, raf = 0, last = performance.now();
  const paint = () => {
    let left = shown;
    for (const x of nodes) { const k = Math.max(0, Math.min(x.full.length, left)); x.n.data = x.full.slice(0, k); left -= x.full.length; }
  };
  const tick = (now: number) => {
    shown = Math.min(total, shown + Math.max(1, Math.round(((now - last) / 1000) * cps)));
    last = now;
    paint();
    if (shown < total) raf = requestAnimationFrame(tick); else done = true;
  };
  raf = requestAnimationFrame(tick);
  return () => {
    if (done) return false;
    cancelAnimationFrame(raf);
    shown = total; paint(); done = true;
    return true;
  };
}
