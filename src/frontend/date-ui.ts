// The Dating tab: everyone you can talk to and what you've learned about them;
// during a conversation or date, their mood, how tired of talking they are, the
// streak, and every topic by category (with how they took it last time).

import type { DatePersonView, DateTopicView, DateView } from "../shared/protocol.js";
import { esc } from "./render.js";

export interface DateUi {
  /** Selected topic category. */
  cat: string | null;
  busy: boolean;
}

export const REACT_ICON: Record<string, string> = { love: "♥♥", like: "♥", neutral: "–", dislike: "✕", hate: "✕✕" };
export const REACT_TONE: Record<string, string> = { love: "good", like: "good", neutral: "neutral", dislike: "warn", hate: "bad" };

export function hue(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function avatar(name: string, big = false): string {
  return `<span class="warp-date-avatar${big ? " big" : ""}" style="--warp-hue:${hue(name)}" aria-hidden="true">${esc(name.trim().charAt(0).toUpperCase() || "?")}</span>`;
}

export function meter(label: string, value: number, text: string | null, cls: string): string {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return `<div class="warp-date-meter ${cls}" title="${esc(`${label}: ${text ?? `${pct}%`}`)}"><span class="warp-date-meter-l">${esc(label)}</span><div class="warp-date-meter-track"><div style="width:${pct}%"></div></div><span class="warp-date-meter-t">${esc(text ?? `${pct}%`)}</span></div>`;
}

export function stageBadge(p: DatePersonView): string {
  return `<span class="warp-date-stage${p.hostile ? " hostile" : ""}${p.partner ? " partner" : ""}">${p.partner ? "♥ " : ""}${esc(p.stage)}</span>`;
}

export function knows(p: DatePersonView): string {
  const bits = [
    p.loves.length ? `<span class="warp-tone-good">♥♥ ${esc(p.loves.join(", "))}</span>` : "",
    p.likes.length ? `<span class="warp-tone-good">♥ ${esc(p.likes.join(", "))}</span>` : "",
    p.dislikes.length ? `<span class="warp-tone-bad">✕ ${esc(p.dislikes.join(", "))}</span>` : "",
  ].filter(Boolean);
  return bits.length ? `<div class="warp-date-knows">${bits.join("")}</div>` : `<div class="warp-date-knows warp-dim">You haven't learned their tastes yet.</div>`;
}

function personRow(p: DatePersonView, busy: boolean): string {
  return `<div class="warp-date-person">
    ${avatar(p.name)}
    <div class="warp-date-main">
      <div class="warp-date-name"><b>${esc(p.name)}</b>${stageBadge(p)}${p.here ? `<span class="warp-date-here" title="Here now">●</span>` : ""}${p.dates ? `<span class="warp-dim">${p.dates} date${p.dates === 1 ? "" : "s"}</span>` : ""}</div>
      ${meter("Love", p.love, p.loveText, "love")}
      ${p.fear > 0.005 ? meter("Fear", p.fear, p.fearText, "fear") : ""}
      ${knows(p)}
    </div>
    <button class="warp-btn warp-mini" data-date-act="date:talk@${esc(p.id)}"${busy ? " disabled" : ""}>Talk</button>
  </div>`;
}

export function odds(p: number | null): string {
  if (p === null) return "";
  const tone = p >= 0.67 ? "good" : p >= 0.34 ? "warn" : "bad";
  return `<span class="warp-choice-odds warp-tone-${tone}">${Math.round(p * 100)}%</span>`;
}

export function topicTile(t: DateTopicView, busy: boolean): string {
  const react = t.known ? `<span class="warp-date-react warp-tone-${REACT_TONE[t.known]}" title="${esc(t.knownLabel ?? "")}">${REACT_ICON[t.known]}</span>` : `<span class="warp-date-react warp-dim" title="You don't know how they feel about this yet">?</span>`;
  const title = [t.desc, t.lock, t.knownLabel ? `Last time: ${t.knownLabel.toLowerCase()}` : null, t.used ? `Raised ${t.used}× this time — it wears thin` : null].filter(Boolean).join("\n");
  return `<button class="warp-date-topic${t.lock ? " locked" : ""}" ${t.lock || busy ? "disabled" : ""} data-date-act="date:topic:${esc(t.id)}" title="${esc(title)}">
    ${react}<span class="warp-date-topic-l">${esc(t.label)}</span>${t.lock ? `<span class="warp-date-lock" aria-label="locked">🔒</span>` : odds(t.odds)}${t.used ? `<span class="warp-date-used">×${t.used}</span>` : ""}
  </button>`;
}

export function renderDate(v: DateView | null, ui: DateUi): string {
  if (!v) return `<div class="warp-card"><h3>Dating is off</h3><p>Add <b>dating: true</b> to the ruleset to talk topic by topic and go on dates.</p></div>`;
  const s = v.session;
  if (!s || !v.person) {
    if (!v.people.length) return `<div class="warp-card"><h3>Nobody to talk to yet</h3><p>People appear here once the story introduces them.</p></div>`;
    return `<div class="warp-date">
      <div class="warp-eyebrow">People · pick someone to talk to</div>
      ${v.people.map((p) => personRow(p, ui.busy)).join("")}
    </div>`;
  }
  const p = v.person;
  const fatigueTone = s.fatigue >= 80 ? "bad" : s.fatigue >= 60 ? "warn" : "good";
  const outing = s.kind === "outing"
    ? `<div class="warp-date-outing">
        <span>📍 <b>${esc(s.venue ?? "Out")}</b></span>
        <span class="warp-dim">${s.closing ? "Winding down" : `Moment ${Math.min(s.beat + 1, s.beats)} of ${s.beats}`}</span>
        ${meter("Enjoyment", s.enjoy / 100, `${Math.round(s.enjoy)}%`, "enjoy")}
      </div>`
    : s.kind === "plan" ? `<div class="warp-date-outing"><span>🗓 They said yes — pick where to go.</span></div>` : "";
  const last = s.last
    ? `<div class="warp-date-last warp-tone-${REACT_TONE[s.last.reaction]}">${REACT_ICON[s.last.reaction]} <b>${esc(s.last.label)}</b> — ${esc(s.last.text)}</div>`
    : "";

  const groups = new Map<string, DateView["moves"]>();
  for (const m of v.moves) groups.set(m.group, [...(groups.get(m.group) ?? []), m]);
  const moves = [...groups].map(([g, list]) => `<div class="warp-choice-group">
      <div class="warp-choice-group-label">${esc(g)}</div>
      <div class="warp-choice-grid">${list.map((m) => `<button class="warp-choice warp-date-move ${esc(m.kind)}" data-date-act="${esc(m.id)}" title="${esc(m.desc ?? "")}"${ui.busy ? " disabled" : ""}><span class="warp-choice-label">${esc(m.label)}</span>${odds(m.odds)}</button>`).join("")}</div>
    </div>`).join("");

  const cats = v.categories;
  const cat = cats.find((c) => c.id === ui.cat) ?? cats.find((c) => c.topics.some((t) => !t.lock)) ?? cats[0];
  const topics = cats.length ? `<div class="warp-date-topics">
      <div class="warp-date-cats" role="tablist">${cats.map((c) => {
        const open = c.topics.filter((t) => !t.lock).length;
        return `<button class="warp-date-cat" role="tab" aria-selected="${c.id === cat?.id}" data-date-cat="${esc(c.id)}" title="${esc(c.label)}">${c.icon} <span>${esc(c.label)}</span>${open ? "" : " 🔒"}</button>`;
      }).join("")}</div>
      <div class="warp-date-grid">${cat ? cat.topics.map((t) => topicTile(t, ui.busy)).join("") : ""}</div>
    </div>` : "";

  return `<div class="warp-date">
    <div class="warp-date-head">
      ${avatar(p.name, true)}
      <div class="warp-date-main">
        <div class="warp-date-name"><b>${esc(p.name)}</b>${stageBadge(p)}</div>
        ${meter("Love", p.love, p.loveText, "love")}
        ${meter("Fear", p.fear, p.fearText, "fear")}
      </div>
      <div class="warp-date-mood" title="Mood: ${esc(s.moodLabel)}"><span class="warp-date-face">${s.moodFace}</span><span>${esc(s.moodLabel)}</span></div>
    </div>
    <div class="warp-date-stats">
      ${meter("Fatigue", s.fatigue / 100, s.fatigue >= 100 ? "Done talking" : s.fatigue >= 80 ? "Tired of talking" : s.fatigue >= 60 ? "Flagging" : "Fresh", `fatigue ${fatigueTone}`)}
      <span class="warp-date-combo${s.combo >= 3 ? " hot" : ""}" title="Good reactions in a row boost love">${s.combo >= 3 ? "🔥" : "✦"} Streak ×${s.combo}</span>
    </div>
    ${outing}
    ${last}
    ${moves}
    ${topics}
    ${knows(p)}
  </div>`;
}
