// Errands: things done off the page, in a window — no narrator turn. The notice
// board, a shop, bills, practice and rest; each row is sent quietly, or told in
// the story when the player wants it narrated. Pure view → HTML; text goes through `esc`.

import type { ErrandsView } from "../shared/protocol.js";
import { GAMES } from "../engine/game-ids.js";
import { esc } from "./render.js";

export type ErrandTab = "board" | "shop" | "bills" | "train" | "rest";

/** The window's tabs, in order, with their labels and entry-button icons. */
export const ERRAND_TABS: { id: ErrandTab; label: string; icon: string; entry: string }[] = [
  { id: "board", label: "Board", icon: "📋", entry: "Notice board" },
  { id: "shop", label: "Shop", icon: "🛍", entry: "Shop" },
  { id: "bills", label: "Bills", icon: "🧾", entry: "Bills" },
  { id: "train", label: "Training", icon: "🏋", entry: "Training" },
  { id: "rest", label: "Rest", icon: "💤", entry: "Rest" },
];

/** Tabs that have something in them, in window order. */
export function errandTabs(v: ErrandsView | null | undefined): ErrandTab[] {
  if (!v) return [];
  return ERRAND_TABS.filter((t) => (v[t.id]?.length ?? 0) > 0).map((t) => t.id);
}

/** The tab to show: the one asked for when it has rows, else the first that does. */
export function pickErrandTab(v: ErrandsView, tab: string): ErrandTab | null {
  const tabs = errandTabs(v);
  return tabs.includes(tab as ErrandTab) ? (tab as ErrandTab) : tabs[0] ?? null;
}

/** Key for a row's stepper in the draft: tab and row id ("shop:potion"). */
export const errandKey = (tab: ErrandTab, id: string) => `${tab}:${id}`;

/** "45 min", "1h", "1h 30 min", "8h". */
export function errandDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r} min` : `${h}h`;
}

/** Odds as a percent; accepts 0–1 or already a percentage. */
function pct(odds: number): number {
  return Math.round(odds <= 1 ? odds * 100 : odds);
}

/** The quantity in a stepper: the draft, kept between 1 and max. */
function qtyOf(draft: Record<string, number>, key: string, max: number): number {
  const n = Math.floor(draft[key] ?? 1);
  return Math.max(1, Math.min(Math.max(1, max), Number.isFinite(n) ? n : 1));
}

const dis = (off: boolean) => (off ? " disabled" : "");

function stepper(key: string, qty: number, max: number, busy: boolean, label: string): string {
  const off = max < 1;
  return `<span class="warp-errand-qty" role="group" aria-label="${esc(label)}">
    <button class="warp-btn warp-btn-mini" data-errand-qty="${esc(key)}" data-errand-step="-1" data-errand-max="${esc(max)}" aria-label="Fewer"${dis(off || busy || qty <= 1)}>−</button>
    <b class="warp-errand-n">${off ? 0 : qty}</b>
    <button class="warp-btn warp-btn-mini" data-errand-qty="${esc(key)}" data-errand-step="1" data-errand-max="${esc(max)}" aria-label="More"${dis(off || busy || qty >= max)}>+</button>
  </span>`;
}

const quietBtn = (actionId: string, label: string, busy: boolean, times = 1, off = false, title = "Done off the page — no story reply") =>
  `<button class="warp-btn warp-mini warp-btn-primary" data-errand-quiet="${esc(actionId)}" data-errand-times="${esc(times)}" title="${esc(title)}"${dis(busy || off)}>${esc(label)}</button>`;

const storyBtn = (actionId: string, busy: boolean) =>
  `<button class="warp-btn warp-mini warp-btn-ghost" data-errand-story="${esc(actionId)}" title="Do it as a story choice instead: the narrator writes it"${dis(busy)}>In the story</button>`;

const why = (text: string | null) => (text ? `<div class="warp-errand-why">🔒 ${esc(text)}</div>` : "");

function board(v: ErrandsView, busy: boolean): string {
  return v.board.map((r) => `<div class="warp-quest warp-quest-offered warp-errand" data-errand-row="${esc(r.id)}">
    <div class="warp-quest-head"><span>📜 <b>${esc(r.name)}</b>${r.kind ? ` <span class="warp-quest-kind">${esc(r.kind)}</span>` : ""}</span>${r.days !== null ? `<span class="warp-dim">${esc(r.days)} day${r.days === 1 ? "" : "s"} to do it</span>` : ""}</div>
    ${r.desc ? `<div class="warp-dim">${esc(r.desc)}</div>` : ""}
    ${r.goals.length ? `<ul class="warp-quest-goals">${r.goals.map((g) => `<li>☐ ${esc(g)}</li>`).join("")}</ul>` : ""}
    ${r.reward ? `<div class="warp-quest-reward">Reward: ${esc(r.reward)}</div>` : ""}
    ${r.stakes ? `<div class="warp-quest-stakes">⚠ ${esc(r.stakes)}</div>` : ""}
    <div class="warp-row warp-quest-actions">${quietBtn(r.take, "Take it on", busy, 1, false, "Take it on off the page — it's added to your quests")}</div>
  </div>`).join("");
}

function shop(v: ErrandsView, draft: Record<string, number>, busy: boolean): string {
  const row = (r: ErrandsView["shop"][number]) => {
    const sell = !!r.sell;
    const key = sell ? `sell:${r.id}` : errandKey("shop", r.id);
    const qty = qtyOf(draft, key, r.max);
    // "Buy Soothing potion" already names it; a label like "Tonic of the day" doesn't.
    const name = r.item && !(r.label ?? "").toLowerCase().includes(r.item.toLowerCase()) ? `${esc(r.label)} <span class="warp-dim">· ${esc(r.item)}</span>` : esc(r.label || r.item);
    return `<div class="warp-quest warp-errand${sell ? " warp-errand-sell" : ""}${r.max < 1 ? " warp-errand-off" : ""}" data-errand-row="${esc(r.id)}">
      <div class="warp-quest-head"><span><b>${name}</b>${sell ? ` <span class="warp-dim">· you have ${esc(r.max)}</span>` : ""}</span>${r.price ? `<span class="warp-errand-price" title="${sell ? "Paid for each one sold" : "Price of each"}">${sell ? "+" : ""}${esc(r.price)}</span>` : ""}</div>
      ${r.itemDesc ? `<div class="warp-dim">${esc(r.itemDesc)}</div>` : ""}
      ${r.max < 1 ? why(r.why ?? "Not now") : ""}
      <div class="warp-row warp-quest-actions">${stepper(key, qty, r.max, busy, `How many ${r.item || r.label}`)}${quietBtn(r.story, sell ? "Sell" : "Buy", busy, qty, r.max < 1)}${storyBtn(r.story, busy)}</div>
    </div>`;
  };
  const buy = v.shop.filter((r) => !r.sell);
  const sell = v.shop.filter((r) => r.sell);
  return buy.map(row).join("") + (sell.length ? `<div class="warp-choice-group-label warp-errand-sell-head">Sell</div>${sell.map(row).join("")}` : "");
}

function bills(v: ErrandsView, busy: boolean): string {
  return v.bills.map((r) => `<div class="warp-quest warp-errand" data-errand-row="${esc(r.id)}">
    <div class="warp-quest-head"><span><b>${esc(r.label)}</b></span><span class="warp-errand-price">${esc(r.amount)}</span></div>
    <div class="warp-dim">Due ${esc(r.due)}</div>
    <div class="warp-row warp-quest-actions">${quietBtn(r.story, "Pay", busy)}${storyBtn(r.story, busy)}</div>
  </div>`).join("");
}

function train(v: ErrandsView, draft: Record<string, number>, busy: boolean): string {
  return v.train.map((r) => {
    const key = errandKey("train", r.id);
    const qty = qtyOf(draft, key, r.max);
    const facts = [
      r.odds !== null ? `${pct(r.odds)}% a session` : null,
      `${errandDuration(r.minutes)} each`,
      r.cost ? `${r.cost} each` : null,
    ].filter(Boolean).map((x) => esc(x)).join(" · ");
    return `<div class="warp-quest warp-errand${r.max < 1 ? " warp-errand-off" : ""}" data-errand-row="${esc(r.id)}">
      <div class="warp-quest-head"><span><b>${esc(r.label)}</b></span>${r.odds !== null ? `<span class="warp-errand-odds" title="Chance each session pays off">${pct(r.odds)}%</span>` : ""}</div>
      ${r.desc ? `<div class="warp-dim">${esc(r.desc)}</div>` : ""}
      <div class="warp-errand-facts">${facts}</div>
      ${r.max < 1 ? why(r.why ?? "Not now") : ""}
      <div class="warp-row warp-quest-actions">${stepper(key, qty, r.max, busy, "Sessions")}<span class="warp-dim">session${qty === 1 ? "" : "s"}</span>${quietBtn(r.story, "Train", busy, qty, r.max < 1)}${playBtn(r, busy)}${storyBtn(r.story, busy)}</div>
    </div>`;
  }).join("");
}

/** One session played as its minigame instead of rolled (still off the page). */
function playBtn(r: ErrandsView["train"][number], busy: boolean): string {
  const g = r.choice?.game ? GAMES[r.choice.game.game] : null;
  if (!g) return "";
  return `<button type="button" class="warp-btn warp-mini" data-errand-play="${esc(r.id)}" ${busy || r.max < 1 ? "disabled" : ""} title="Play one session as ${esc(g.name)} — your score decides instead of the dice">${g.icon} Play</button>`;
}

function rest(v: ErrandsView, busy: boolean): string {
  return v.rest.map((r) => `<div class="warp-quest warp-errand${r.why ? " warp-errand-off" : ""}" data-errand-row="${esc(r.id)}">
    <div class="warp-quest-head"><span><b>${esc(r.label)}</b></span><span class="warp-dim">${esc(errandDuration(r.minutes))}</span></div>
    ${r.desc ? `<div class="warp-dim">${esc(r.desc)}</div>` : ""}
    ${r.effects ? `<div class="warp-errand-facts">${esc(r.effects)}</div>` : ""}
    ${why(r.why)}
    <div class="warp-row warp-quest-actions">${quietBtn(r.story, "Do it", busy, 1, !!r.why)}${storyBtn(r.story, busy)}</div>
  </div>`).join("");
}

/** The errands window: tabs for what there is, the rows of the open one. */
export function renderErrands(v: ErrandsView, tab: string, draft: Record<string, number>, busy: boolean): string {
  const tabs = errandTabs(v);
  const cur = pickErrandTab(v, tab);
  if (!cur) return `<div class="warp-modal warp-errands"><div class="warp-empty">Nothing to do here right now.</div></div>`;
  const head = `<div class="warp-tabs warp-errand-tabs" role="tablist">${tabs.map((id) => {
    const t = ERRAND_TABS.find((x) => x.id === id)!;
    return `<button class="warp-tab" role="tab" data-errand-tab="${id}" aria-selected="${id === cur}">${t.icon} ${esc(t.label)} <span class="warp-dim">${v[id].length}</span></button>`;
  }).join("")}</div>`;
  const money = v.money && (cur === "shop" || cur === "bills" || cur === "train") ? `<div class="warp-errand-money">You have <span class="warp-money">${esc(v.money)}</span></div>` : "";
  const body = cur === "board" ? board(v, busy) : cur === "shop" ? shop(v, draft, busy) : cur === "bills" ? bills(v, busy) : cur === "train" ? train(v, draft, busy) : rest(v, busy);
  const note = `<div class="warp-errand-note warp-dim">${busy ? `<span class="warp-spinner"></span> Doing it…` : "Done off the page: no story reply. The next reply mentions it in a line."}</div>`;
  return `<div class="warp-modal warp-errands${busy ? " warp-busy" : ""}" data-errand-view="${cur}">${head}${money}<div class="warp-errand-list">${body}</div>${note}</div>`;
}

/** The compact row of buttons that open the window, shown with the choices. */
export function renderErrandEntries(v: ErrandsView | null | undefined): string {
  const tabs = errandTabs(v);
  if (!v || !tabs.length) return "";
  const btns = tabs.map((id) => {
    const t = ERRAND_TABS.find((x) => x.id === id)!;
    const n = id === "board" || id === "shop" || id === "bills" ? ` · ${v[id].length}` : "";
    return `<button type="button" class="warp-btn warp-mini warp-errand-entry" data-errand-open="${id}" title="Opens a window: done off the page, no story reply">${t.icon} ${esc(t.entry)}${n}</button>`;
  }).join("");
  return `<div class="warp-errand-entries" role="group" aria-label="Errands">${btns}</div>`;
}

export const ERRAND_STYLES = `
.warp-errands { gap: 8px; }
.warp-errands .warp-errand-tabs { margin: 0 0 2px; padding: 0; flex-wrap: wrap; position: static; }
.warp-errands .warp-tab { padding: 6px 8px; }
.warp-errand-list { display: flex; flex-direction: column; }
.warp-errand { gap: 4px; }
.warp-errand-off { opacity: .8; }
.warp-errand-price { font-weight: 600; font-variant-numeric: tabular-nums; color: var(--warp-warn); white-space: nowrap; }
.warp-errand-odds { font-weight: 600; font-variant-numeric: tabular-nums; color: var(--warp-muted); }
.warp-errand-facts { color: var(--warp-muted); font-size: 12px; }
.warp-errand-why { color: var(--warp-warn); font-size: 11.5px; }
.warp-errand-money { color: var(--warp-muted); font-size: 12.5px; }
.warp-errand-qty { display: inline-flex; align-items: center; gap: 4px; }
.warp-errand-n { min-width: 1.6em; text-align: center; font-variant-numeric: tabular-nums; }
.warp-errand-note { font-size: 11.5px; display: flex; align-items: center; gap: 6px; }
.warp-errands.warp-busy .warp-errand-list { opacity: .7; }
.warp-errand-entries { display: flex; flex-wrap: wrap; gap: 5px; }
.warp-errand-entry { border-style: dashed; }
.warp-quests-board { margin-bottom: 6px; }
.warp-errand-sell-head { margin: 4px 0; }
`;
