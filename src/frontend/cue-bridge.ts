// Cue (the visual-novel extension) covers the chat while it's open, so Warp's
// in-chat choices and floating status panel can't be seen. This bridge hands
// both over on the window events Cue listens for:
//
//   vn-game-state-v1   Warp → Cue   the choices under the latest reply (with odds)
//   vn-game-pick-v1    Cue → Warp   the player picked one → act on it
//   vn-game-request-v1 Cue → Warp   send the state again
//   vn-panel-request-v1 / vn-panel-export-v1   live status cards ("Keep it updated")

import type { BackendToFrontend, ChoiceView, DateView, HudView } from "../shared/protocol.js";
import { esc } from "./render.js";
import { connectCueImages } from "./cue-images.js";
import type { CueImageResult, ImageFit } from "../shared/cue-images.js";

type StateMsg = Extract<BackendToFrontend, { type: "state" }>;

const PROVIDER = "warp";
const MAX_CHOICES = 12;

export interface BridgeView {
  state: StateMsg | null;
  enabled: boolean;
  imagesEnabled?: boolean;
  showOdds: boolean;
  busy: boolean;
  busyLabel: string;
}

interface PanelRequest { version: 1; chatId: string; messageId: string; swipeId: number; sourceFingerprint: string }

/** Choices Cue can act on. Dungeon moves and "More…" open Warp's own screens, which Cue would cover. */
export function cueChoices(choices: ChoiceView[], showOdds: boolean) {
  return choices.filter((c) => !c.locked && !c.id.startsWith("dungeon:") && c.id !== "date:open").slice(0, MAX_CHOICES).map((c) => ({
    id: c.id,
    label: c.label,
    group: c.group,
    detail: [c.desc, c.checkLabel ? `Check: ${c.checkLabel}` : null].filter(Boolean).join("\n") || null,
    odds: showOdds ? c.odds : null,
  }));
}

const CARD_CSS = `
.w{font:13px/1.45 system-ui,sans-serif;color:#ecebf2;display:grid;gap:8px}
.top{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}
.top b{font-size:15px}.dim{color:#a9a6b8}
.bars{display:grid;gap:6px}
.bar{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;align-items:center}
.bar .l{font-weight:600}.bar .v{text-align:right;color:#a9a6b8;font-variant-numeric:tabular-nums}
.track{grid-column:1/-1;height:6px;border-radius:99px;background:#2b2a36;overflow:hidden}
.fill{height:100%;border-radius:99px}
.good{background:#5fc58a}.warn{background:#e0b34f}.bad{background:#e06a6a}.neutral{background:#8b86a8}
.t-good{color:#8fe0a8}.t-warn{color:#f0cf7a}.t-bad{color:#f19a9a}.t-neutral{color:#c9c6d8}
.chips{display:flex;flex-wrap:wrap;gap:4px}
.chip{padding:1px 8px;border-radius:99px;background:#2b2a36;font-size:12px}
.sec{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#a9a6b8;margin-top:2px}
.ppl{display:grid;gap:3px}
`;

/** A self-contained status card (Cue renders it in a sandboxed frame with no scripts). */
export function renderCueCard(h: HudView): string {
  const top = [
    h.clock ? `<b>${esc(h.clock.time)}</b> <span class="dim">${esc(h.date ?? h.clock.day)}</span>` : `<b>${esc(h.rulesetName)}</b>`,
    h.location ? `<span>📍 ${esc(h.location.name)}</span>` : "",
    h.weather ? `<span class="dim">${esc(`${h.weather.icon} ${h.weather.label} ${h.weather.temp}°C`.trim())}</span>` : "",
    h.money ? `<span>💰 ${esc(h.money)}</span>` : "",
  ].filter(Boolean).join("");
  const bars = h.bars.map((b) => `<div class="bar"><span class="l">${esc(b.label)}</span><span class="v">${esc(b.text ?? b.display)}</span><div class="track"><div class="fill ${b.tone}" style="width:${Math.round(b.pct * 100)}%"></div></div></div>`).join("");
  const conds = h.conditions.map((c) => `<span class="chip t-${c.tone}">${esc(c.label)}${c.remaining ? ` · ${esc(c.remaining)}` : ""}</span>`).join("");
  const here = h.people.filter((p) => p.present).map((p) => {
    const feel = p.stats.filter((s) => s.text).map((s) => `<span class="t-${s.tone}">${esc(s.text!)}</span>`).join(" · ");
    return `<div>${esc(p.name)}${feel ? ` <span class="dim">—</span> ${feel}` : ""}</div>`;
  }).join("");
  const enc = h.encounter
    ? `<div class="sec">⚔ ${esc(h.encounter.name)} · round ${h.encounter.round}</div><div class="bars">${h.encounter.stats.map((s) => `<div class="bar"><span class="l">${esc(h.encounter!.foe)} ${esc(s.label)}</span><span class="v">${s.value}/${s.max}</span><div class="track"><div class="fill ${s.tone}" style="width:${Math.round(s.pct * 100)}%"></div></div></div>`).join("")}</div>`
    : "";
  return `<style>${CARD_CSS}</style><div class="w"><div class="top">${top}</div>${enc}${bars ? `<div class="bars">${bars}</div>` : ""}${conds ? `<div class="chips">${conds}</div>` : ""}${here ? `<div class="sec">Here</div><div class="ppl">${here}</div>` : ""}</div>`;
}

/** The conversation or date in progress: mood, where things stand, fatigue and the streak. */
export function renderCueDateCard(d: DateView): string | null {
  const s = d.session;
  const p = d.person;
  if (!s || !p) return null;
  const bar = (label: string, v: number, text: string, cls: string) => `<div class="bar"><span class="l">${esc(label)}</span><span class="v">${esc(text)}</span><div class="track"><div class="fill ${cls}" style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></div></div></div>`;
  const where = s.kind === "outing" ? `📍 ${esc(s.venue ?? "Out")} · ${s.closing ? "winding down" : `moment ${Math.min(s.beat + 1, s.beats)}/${s.beats}`}` : s.kind === "plan" ? "Choosing where to go" : "Talking";
  return `<style>${CARD_CSS}.face{font-size:28px;line-height:1}</style><div class="w">
    <div class="top"><span class="face">${s.moodFace}</span><b>${esc(p.name)}</b><span class="dim">${esc(p.partner ? `♥ ${p.stage}` : p.stage)} · ${esc(s.moodLabel)}</span></div>
    <div class="dim">${where}</div>
    <div class="bars">
      ${bar("Love", p.love, p.loveText ?? "", "bad")}
      ${p.fear > 0.005 ? bar("Fear", p.fear, p.fearText ?? "", "warn") : ""}
      ${s.kind === "outing" ? bar("Enjoyment", s.enjoy / 100, `${Math.round(s.enjoy)}%`, "good") : ""}
      ${bar("Fatigue", s.fatigue / 100, s.fatigue >= 80 ? "tired of talking" : "", s.fatigue >= 80 ? "bad" : s.fatigue >= 60 ? "warn" : "good")}
    </div>
    <div class="chips">${s.combo ? `<span class="chip">${s.combo >= 3 ? "🔥" : "✦"} streak ×${s.combo}</span>` : ""}${s.last ? `<span class="chip">${esc(s.last.label)}: ${esc(s.last.text.toLowerCase())}</span>` : ""}</div>
  </div>`;
}

export interface CueBridge {
  update(view: BridgeView): void;
  destroy(): void;
}

export function connectCue(opts: { act(id: string): void; chatId(): string | null; imageResult?(r: CueImageResult): void; imageFit?(chatId: string, fit: ImageFit): void }): CueBridge {
  const images = connectCueImages(window, (result) => opts.imageResult?.(result), undefined, (id, fit) => { if (opts.chatId() === id) opts.imageFit?.(id, fit); });
  let view: BridgeView = { state: null, enabled: false, showOdds: true, busy: false, busyLabel: "" };
  let request: PanelRequest | null = null;
  let revision = 0;
  let published = new Set<string>();
  let dead = false;

  const emit = (type: string, detail: unknown) => window.dispatchEvent(new CustomEvent(type, { detail }));

  function sendChoices() {
    const s = view.state;
    const chatId = s?.chatId ?? opts.chatId();
    if (!chatId) return;
    const live = view.enabled && !!s?.hud && !!s.choicesAnchor;
    emit("vn-game-state-v1", {
      version: 1, provider: PROVIDER, chatId,
      choices: live ? cueChoices(s!.choices, view.showOdds) : [],
      busy: view.busy,
      busyLabel: view.busy ? view.busyLabel || null : null,
    });
  }

  function sendCards() {
    const req = request;
    const s = view.state;
    if (!req || !s || s.chatId !== req.chatId) return;
    const cards = view.enabled && s.hud ? [{ cardId: "status", title: `Warp · ${s.hud.rulesetName}`, html: renderCueCard(s.hud) }] : [];
    const date = view.enabled && s.date ? renderCueDateCard(s.date) : null;
    if (date) cards.push({ cardId: "date", title: `Warp · ${s.date!.person!.name}`, html: date });
    const next = new Set<string>();
    for (const card of cards) {
      next.add(card.cardId);
      emit("vn-panel-export-v1", { ...req, provider: PROVIDER, ...card, revision: ++revision, status: "ready" });
    }
    for (const cardId of published) if (!next.has(cardId)) emit("vn-panel-export-v1", { ...req, provider: PROVIDER, cardId, revision: ++revision, status: "removed" });
    published = next;
  }

  const onPick = (e: Event) => {
    const d = (e as CustomEvent).detail as { version?: number; provider?: string; chatId?: string; id?: string } | null;
    if (dead || d?.version !== 1 || d.provider !== PROVIDER || typeof d.id !== "string") return;
    if (!d.chatId || d.chatId !== (view.state?.chatId ?? opts.chatId())) return;
    if (!view.state?.choices.some((c) => c.id === d.id)) { sendChoices(); return; }
    opts.act(d.id);
    // act() may refuse (already busy); either way Cue gets the current picture back.
    sendChoices();
  };
  const onGameRequest = (e: Event) => {
    const d = (e as CustomEvent).detail as { version?: number; chatId?: string } | null;
    if (!dead && d?.version === 1 && d.chatId && d.chatId === view.state?.chatId) sendChoices();
  };
  const onPanelRequest = (e: Event) => {
    const d = (e as CustomEvent).detail as PanelRequest | null;
    if (dead || d?.version !== 1 || typeof d.chatId !== "string" || typeof d.messageId !== "string" || typeof d.sourceFingerprint !== "string" || !Number.isSafeInteger(d.swipeId)) return;
    // A new turn in Cue starts its card list fresh.
    if (request?.messageId !== d.messageId || request?.sourceFingerprint !== d.sourceFingerprint) published = new Set();
    request = { version: 1, chatId: d.chatId, messageId: d.messageId, swipeId: d.swipeId, sourceFingerprint: d.sourceFingerprint };
    sendCards();
  };
  window.addEventListener("vn-game-pick-v1", onPick);
  window.addEventListener("vn-game-request-v1", onGameRequest);
  window.addEventListener("vn-panel-request-v1", onPanelRequest);

  return {
    update(next) {
      view = next;
      if (dead) return;
      images.update(next.enabled && next.imagesEnabled !== false ? next.state?.scene?.imageRequest ?? null : null, opts.chatId());
      sendChoices();
      sendCards();
    },
    destroy() {
      dead = true;
      images.destroy();
      window.removeEventListener("vn-game-pick-v1", onPick);
      window.removeEventListener("vn-game-request-v1", onGameRequest);
      window.removeEventListener("vn-panel-request-v1", onPanelRequest);
    },
  };
}
