// The status panel: Conflict (during a contest), Scene, You, People and Goals. The floating panel shows it
// compact; the drawer's Sheet shows it in full with Forget buttons. Every line can be fixed with one click:
// ✎ opens an inline field, Set sends one message (`fix`, `adjust` or `adjust_rel`).

import type { ConflictView, GoalView, HudView, PersonView } from "../shared/protocol.js";
import { editButton, esc, pct, pctTone, section } from "./html.js";

/** One of the panel's sections. */
export interface HudPart { id: string; title: string; count: number; body: string; open: boolean }

export interface HudOpts {
  /**
   * The line open for a fix: "time", "place", "here", "look:<who>:appearance|outfit" (who = "you" or a person id),
   * "item:<id>", "money", "bar:<id>", "skill:<id>", "rel:<person>:<stat>", "goal:<id>".
   */
  editing: string | null;
  /** The panel (true) or the drawer's Sheet (false: every section open, Forget buttons). */
  compact: boolean;
  /** Text typed into an open fix and not set yet, by edit key (kept across pushes). */
  drafts?: Record<string, string>;
  /** A short hint for the Scene section ("Warp couldn't read the greeting — set the time."). */
  sceneHint?: string | null;
}

/** The panel in full: the conflict box and every section, in order. */
export function renderHud(h: HudView, opts: HudOpts): string {
  const { head, parts } = hudParts(h, opts);
  return head + parts.map(renderPart).join("");
}

export const renderPart = (p: HudPart) => section(p.title, p.count, p.body, p.open, p.id);

/** The panel split into its fixed head (the conflict box) and its sections. */
export function hudParts(h: HudView, opts: HudOpts): { head: string; parts: HudPart[] } {
  const parts: HudPart[] = [sceneSection(h, opts), youSection(h, opts)];
  if (h.people.length) parts.push(peopleSection(h, opts));
  const goals = goalsSection(h.goals, opts);
  if (goals) parts.push(goals);
  return { head: h.conflict ? renderConflict(h.conflict) : "", parts };
}

// ───────────────────────── fixes ─────────────────────────

const draft = (opts: HudOpts, key: string, fallback: string) => opts.drafts?.[key] ?? fallback;

/** An inline fix: the inputs, then Set. `field`/`who` say what the `fix` message changes. */
function fixRow(key: string, field: string, who: string | null, inputs: string): string {
  return `<div class="warp-fix" data-fix-row="${esc(key)}">${inputs}<button class="warp-btn warp-btn-primary warp-mini" data-fix="${esc(field)}"${who !== null ? ` data-who="${esc(who)}"` : ""}>Set</button><button class="warp-btn warp-btn-ghost warp-mini" data-edit="${esc(key)}" aria-label="Cancel">Cancel</button></div>`;
}

function textInput(key: string, value: string, label: string, opts: HudOpts, placeholder = ""): string {
  return `<input class="warp-input" type="text" maxlength="160" data-fix-input="${esc(key)}" value="${esc(draft(opts, key, value))}" placeholder="${esc(placeholder)}" aria-label="${esc(label)}">`;
}

function numberInput(key: string, value: number | string, label: string, opts: HudOpts, attrs = ""): string {
  return `<input class="warp-input warp-num" type="number" inputmode="decimal" data-fix-input="${esc(key)}" value="${esc(draft(opts, key, String(value)))}" aria-label="${esc(label)}"${attrs}>`;
}

const hhmm = (minutes: number) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Day (1-based) and HH:MM of a raw clock value. */
export function clockParts(minutes: number): { day: number; time: string } {
  return { day: Math.floor(minutes / 1440) + 1, time: hhmm(minutes) };
}

// ───────────────────────── conflict ─────────────────────────

/** Where the gauge's marker sits, in % from the left: You (+100) on the left, the opponent (−100) on the right. */
export const gaugeLeft = (momentum: number) => (100 - Math.max(-100, Math.min(100, momentum))) / 2;

/** The momentum gauge with "You" on the left (green) and the opponent on the right (red). */
export function renderGauge(c: ConflictView): string {
  const m = Math.round(c.momentum);
  return `<div class="warp-gauge-labels"><span class="warp-tone-good">You</span><span class="warp-tone-bad">${esc(c.opponent)}</span></div>
    <div class="warp-momentum" role="meter" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="${m}" aria-label="Momentum" title="${esc(`Momentum ${m > 0 ? "+" : ""}${m}: only a full swing either way ends it`)}"><div class="warp-momentum-mid"></div><div class="warp-momentum-mark" style="left:${gaugeLeft(m).toFixed(1)}%"></div></div>
    <div class="warp-conflict-words">${esc(c.words)}</div>`;
}

/** "Round 2/8": the round the next move plays. */
export const roundText = (c: ConflictView) => `round ${Math.min(c.round + 1, c.maxRounds)}/${c.maxRounds}`;

/** The Conflict box at the top of the panel: gauge, words, the next move's odds, Break off and Give in. */
export function renderConflict(c: ConflictView): string {
  return `<div class="warp-conflict" role="group" aria-label="${esc(`${c.label} with ${c.opponent}`)}">
    <div class="warp-conflict-head"><span>⚔ ${esc(c.label)} · ${esc(c.opponent)}</span><span class="warp-dim">${esc(roundText(c))}</span></div>
    ${renderGauge(c)}
    ${c.next ? `<div class="warp-dim">Next move: <b class="warp-tone-${pctTone(c.next.odds)}">${pct(c.next.odds)}</b> (${esc(c.next.stat)})</div>` : ""}
    <div class="warp-row"><button class="warp-btn warp-mini" data-contest="break_off" title="Try to get away: a check">Break off</button><button class="warp-btn warp-btn-ghost warp-mini" data-contest="give_in" title="Lose at once, no roll">Give in</button></div>
  </div>`;
}

// ───────────────────────── scene ─────────────────────────

function sceneSection(h: HudView, opts: HudOpts): HudPart {
  const rows: string[] = [];
  if (h.clock) {
    const c = h.clock;
    const at = clockParts(c.minutes);
    rows.push(`<div class="warp-line warp-clock"><span class="warp-clock-time">${esc(c.time)}</span><span class="warp-clock-day">${esc(h.date ?? c.day)}${c.phase ? ` · ${esc(c.phase)}` : ""}</span>${editButton("time", "Fix the time")}</div>`);
    if (opts.editing === "time") rows.push(fixRow("time", "time", null,
      `<label class="warp-fix-label">Day ${numberInput("time:day", at.day, "Day", opts, ` min="1" step="1"`)}</label><input class="warp-input warp-time" type="time" data-fix-input="time" value="${esc(draft(opts, "time", at.time))}" aria-label="Time">`));
  }
  if (opts.sceneHint) rows.push(`<div class="warp-hint warp-tone-warn">${esc(opts.sceneHint)}</div>`);
  const place = h.location?.name ?? null;
  rows.push(`<div class="warp-line"><span>📍 ${place ? `<b>${esc(place)}</b>` : `<span class="warp-dim">Place not known yet</span>`}</span>${editButton("place", "Fix the place")}</div>`);
  if (opts.editing === "place") rows.push(fixRow("place", "place", null, textInput("place", place ?? "", "Place", opts, "Where you are, in words")));
  const here = h.people.filter((p) => p.present);
  if (h.people.length) {
    rows.push(`<div class="warp-line"><span>${here.length ? `Here: ${here.map((p) => `<b>${esc(p.name)}</b>`).join(", ")}` : `<span class="warp-dim">No one you know is here.</span>`}</span>${editButton("here", "Fix who is here")}</div>`);
    if (opts.editing === "here") rows.push(`<div class="warp-fix warp-tags" data-fix-row="here">${h.people.map((p) => presentToggle(p, "name")).join("")}<button class="warp-btn warp-btn-ghost warp-mini" data-edit="here">Done</button></div>`);
  }
  return { id: "scene", title: "Scene", count: 0, body: rows.join(""), open: true };
}

/** Tap to say someone is (not) here. */
function presentToggle(p: PersonView, show: "name" | "badge"): string {
  const label = show === "name" ? p.name : p.present ? "here" : "+ here";
  const title = p.present ? `${p.name} is here. Tap if not.` : `${p.name} is not here. Tap if they are.`;
  return `<button class="${show === "name" ? "warp-tag" : p.present ? "warp-here" : "warp-here warp-away-badge"}" data-fix-present="${esc(p.id)}" data-value="${p.present ? "false" : "true"}" aria-pressed="${p.present}" title="${esc(title)}">${esc(label)}</button>`;
}

// ───────────────────────── you ─────────────────────────

function lookRows(who: string, look: { appearance: string | null; outfit: string | null }, name: string, opts: HudOpts): string {
  const row = (field: "appearance" | "outfit", label: string) => {
    const key = `look:${who}:${field}`;
    const v = look[field];
    return `<div class="warp-line"><span><span class="warp-dim">${label}:</span> ${v ? esc(v) : `<span class="warp-dim">not known yet</span>`}</span>${editButton(key, `Fix ${name}'s ${field}`)}</div>${opts.editing === key
      ? fixRow(key, field, who, textInput(key, v ?? "", `${name}: ${field}`, opts, field === "outfit" ? "e.g. grey hoodie, black jeans" : "e.g. tall, red braid, freckles"))
      : ""}`;
  };
  return row("appearance", "Looks") + row("outfit", "Wears");
}

function youSection(h: HudView, opts: HudOpts): HudPart {
  const bars = h.bars.map((b) => {
    const key = `bar:${b.id}`;
    const editing = opts.editing === key;
    const step = b.max - b.min > 200 ? 1 : b.max - b.min > 20 ? 0.5 : 0.1;
    const v = Math.round(b.value * 10) / 10;
    return `<div class="warp-bar" data-bar="${esc(b.id)}" data-edit="${esc(key)}" title="${esc(`${b.label}: ${b.display}${b.desc ? ` — ${b.desc}` : ""}\nTap to fix`)}">
      <div class="warp-bar-head"><span class="warp-bar-label">${esc(b.label)}</span><span class="warp-bar-text warp-tone-${b.tone}">${esc(b.text ?? b.display)}</span></div>
      <div class="warp-bar-track"><div class="warp-bar-fill warp-bg-${b.tone}" style="width:${(b.pct * 100).toFixed(1)}%${b.color ? `;background:${esc(b.color)}` : ""}"></div></div>
      ${editing ? `<div class="warp-bar-edit">
          <input type="range" min="${b.min}" max="${b.max}" step="${step}" value="${v}" data-range aria-label="${esc(b.label)}">
          <input class="warp-input warp-num" type="number" min="${b.min}" max="${b.max}" step="${step}" value="${v}" data-num aria-label="${esc(b.label)} value">
          <button class="warp-btn warp-btn-primary warp-mini" data-save-bar="${esc(b.id)}">Set</button>
        </div>` : ""}
    </div>`;
  }).join("");
  const conds = h.conditions.length
    ? `<div class="warp-pills">${h.conditions.map((c) => `<span class="warp-pill warp-tone-${c.tone}" title="${esc(c.desc ?? "")}">${esc(c.label)}${c.remaining ? ` · ${esc(c.remaining)}` : ""}</span>`).join("")}</div>`
    : "";
  const moneyNum = h.money?.match(/-?\d[\d,]*(?:\.\d+)?/)?.[0]?.replace(/,/g, "") ?? "";
  const money = h.money !== null
    ? `<div class="warp-line"><span>💰 <span class="warp-money">${esc(h.money)}</span></span>${editButton("money", "Fix your money")}</div>${opts.editing === "money" ? fixRow("money", "money", null, numberInput("money", moneyNum, "Money", opts, ` min="0" step="any"`)) : ""}`
    : "";

  const items = h.items.map((i) => {
    const key = `item:${i.id}`;
    const use = i.use
      ? i.use.locked
        ? `<button class="warp-btn warp-mini" disabled title="${esc(i.use.locked)}">🔒 Use</button>`
        : `<button class="warp-btn warp-mini" data-use="${esc(i.use.id)}" title="${esc(i.use.label)}">Use</button>`
      : "";
    return `<div class="warp-item${i.use ? " warp-item-usable" : ""}">
        <span class="warp-item-name">${esc(i.name)}${i.uses ? ` <span class="warp-dim" title="Uses left in the one in hand">· ${esc(i.uses)}</span>` : ""}${i.bonus ? `<span class="warp-item-bonus" title="Added to checks that use it">${esc(i.bonus)}</span>` : ""}</span>
        <span class="warp-item-side">${i.count > 1 ? `<span class="warp-kbd">×${i.count}</span>` : ""}${use}${editButton(key, `Fix how many ${i.name} you have`)}</span>
      </div>${opts.editing === key ? fixRow(key, "item", i.id, numberInput(key, i.count, `${i.name}: how many`, opts, ` min="0" step="1"`)) : ""}`;
  }).join("");
  const carrying = `<details class="warp-sub" data-section="you-items"${!opts.compact || h.items.length <= 3 ? " open" : ""}><summary>Carrying${h.items.length ? ` · ${h.items.length}` : ""}</summary><div class="warp-sub-body">${items || `<div class="warp-empty">Empty-handed.</div>`}</div></details>`;

  // Rows filed under their headings (`group:`, else Attributes / Skills).
  const skillRow = (s: HudView["skills"][number]) => {
    const key = `skill:${s.id}`;
    return `<div class="warp-skill" data-edit="${esc(key)}" title="${esc(`${s.label}: ${s.display}${s.text ? ` — ${s.text}` : ""}${s.practice !== null ? `\nPractice toward the next point: ${Math.round(s.practice * 100)}% — it grows every time you use it` : ""}\nTap to fix`)}">
      <span>${esc(s.label)}</span>
      <span class="warp-grade ${s.grade ? `warp-tone-${pctTone(s.pct)}` : s.text ? `warp-tone-${s.tone}` : ""}">${esc(s.grade ?? s.text ?? s.display)}</span>
      <div class="warp-skill-tracks">
        <div class="warp-mini-track"><div class="warp-mini-fill" style="width:${(s.pct * 100).toFixed(1)}%"></div></div>
        ${s.practice !== null ? `<div class="warp-practice-track"><div class="warp-practice-fill" style="width:${(s.practice * 100).toFixed(1)}%"></div></div>` : ""}
      </div>
    </div>${opts.editing === key ? `<div class="warp-bar-edit">${numberInput(key, s.display, `${s.label} value`, opts, ` step="any"`)}<button class="warp-btn warp-btn-primary warp-mini" data-save-skill="${esc(s.id)}">Set</button></div>` : ""}`;
  };
  const groups = [...new Set(h.skills.map((x) => x.group))];
  const skillsBody = groups.length < 2 ? h.skills.map(skillRow).join("") : groups.map((g) =>
    `<div class="warp-group"><div class="warp-group-head">${esc(g)}</div>${h.skills.filter((x) => x.group === g).map(skillRow).join("")}</div>`).join("");
  const skills = h.skills.length
    ? `<details class="warp-sub" data-section="you-skills"${opts.compact ? "" : " open"}><summary>Skills & attributes · ${h.skills.length}</summary><div class="warp-sub-body">${skillsBody}</div></details>`
    : "";

  const body = [
    bars ? `<div class="warp-bars">${bars}</div>` : "",
    conds,
    money,
    lookRows("you", h.you, "your", opts),
    carrying,
    skills,
  ].join("");
  return { id: "you", title: "You", count: 0, body, open: true };
}

// ───────────────────────── people ─────────────────────────

function personRow(p: PersonView, opts: HudOpts): string {
  const looks = [p.appearance, p.outfit ? `wears ${p.outfit}` : null].filter(Boolean).join("; ");
  const openLooks = !opts.compact || (opts.editing ?? "").startsWith(`look:${p.id}:`);
  const stats = p.stats.map((s) => `<button class="warp-rel" data-edit="${esc(`rel:${p.id}:${s.id}`)}" title="${esc(`${s.label}: ${s.display} (${s.min}–${s.max}) — tap to fix`)}">${esc(s.label)}: <span class="warp-tone-${s.tone}">${esc(s.text ?? s.display)}</span></button>`).join("");
  const relEdit = p.stats.filter((s) => opts.editing === `rel:${p.id}:${s.id}`).map((s) => `<div class="warp-bar-edit">
      <span class="warp-dim">${esc(s.label)}</span>
      <input type="range" min="${s.min}" max="${s.max}" step="1" value="${Math.round(s.value)}" data-range aria-label="${esc(s.label)}">
      <input class="warp-input warp-num" type="number" min="${s.min}" max="${s.max}" value="${Math.round(s.value)}" data-num aria-label="${esc(s.label)} value">
      <button class="warp-btn warp-btn-primary warp-mini" data-save-rel="${esc(`${p.id}:${s.id}`)}">Set</button>
    </div>`).join("");
  const actions = p.actions.length
    ? `<div class="warp-person-actions">${p.actions.map((a) => a.locked
      ? `<button class="warp-btn warp-mini" disabled title="${esc(a.locked)}">🔒 ${esc(a.label)}</button>`
      : `<button class="warp-btn warp-mini" data-use="${esc(a.id)}" title="${esc(a.desc ?? a.label)}">${esc(a.label)}${a.odds !== null ? ` <span class="warp-tone-${pctTone(a.odds)}">${pct(a.odds)}</span>` : ""}</button>`).join("")}</div>`
    : "";
  return `<div class="warp-person${p.present ? " warp-person-here" : ""}">
      <div class="warp-person-name">${esc(p.name)} ${presentToggle(p, "badge")}${opts.compact ? "" : ` <button class="warp-btn warp-btn-ghost warp-forget" data-forget="${esc(p.id)}" data-name="${esc(p.name)}" title="Stop tracking ${esc(p.name)}">Forget</button>`}</div>
      ${p.conditions.length ? `<div class="warp-pills">${p.conditions.map((c) => `<span class="warp-pill warp-tone-${c.tone}">${esc(c.label)}${c.remaining ? ` · ${esc(c.remaining)}` : ""}</span>`).join("")}</div>` : ""}
      ${stats ? `<div class="warp-person-stats">${stats}</div>` : ""}${relEdit}
      <details class="warp-looks"${openLooks ? " open" : ""}><summary>👤 ${looks ? esc(looks) : `<span class="warp-dim">Looks not known yet</span>`}</summary>${lookRows(p.id, p, p.name, opts)}</details>
      ${p.memories.length ? `<details class="warp-memories"><summary>💭 Remembers · ${p.memories.length}</summary>${p.memories.map((m) => `<div class="warp-memory">${esc(m.text)}${m.when ? ` <span class="warp-dim">· ${esc(m.when)}</span>` : ""}</div>`).join("")}</details>` : ""}
      ${actions}
    </div>`;
}

function peopleSection(h: HudView, opts: HudOpts): HudPart {
  // Who's here comes first; everyone else waits, folded, under "Elsewhere".
  const here = h.people.filter((p) => p.present);
  const away = h.people.filter((p) => !p.present);
  const body = `${here.length ? here.map((p) => personRow(p, opts)).join("") : `<div class="warp-empty">No one you know is here.</div>`}${away.length
    ? `<details class="warp-away" data-section="people-away"${opts.compact ? "" : " open"}><summary>Elsewhere · ${away.length}</summary><div class="warp-section-body">${away.map((p) => personRow(p, opts)).join("")}</div></details>`
    : ""}`;
  return { id: "people", title: "People", count: here.length, body, open: !opts.compact || here.length > 0 };
}

// ───────────────────────── goals ─────────────────────────

/** One goal: text, who it's for, what's at stake; ✎ marks it done, failed or drops it. */
export function goalRow(g: GoalView, opts: Pick<HudOpts, "editing">): string {
  const key = `goal:${g.id}`;
  const mark = g.status === "done" ? "✓" : g.status === "failed" ? "✕" : "◇";
  const tone = g.status === "done" ? "good" : g.status === "failed" ? "bad" : "neutral";
  const fix = opts.editing === key
    ? `<div class="warp-fix" data-fix-row="${esc(key)}">${(g.status === "open" ? [["done", "Done"], ["failed", "Failed"], ["drop", "Drop"]] : [["open", "Reopen"], ["drop", "Drop"]])
      .map(([v, l]) => `<button class="warp-btn warp-mini" data-fix-goal="${esc(g.id)}" data-value="${v}">${l}</button>`).join("")}<button class="warp-btn warp-btn-ghost warp-mini" data-edit="${esc(key)}">Cancel</button></div>`
    : "";
  return `<div class="warp-goal warp-goal-${g.status}">
      <div class="warp-line"><span><span class="warp-tone-${tone}">${mark}</span> ${esc(g.text)}${g.from ? ` <span class="warp-dim">for ${esc(g.from)}</span>` : ""}</span>${editButton(key, "Mark this goal done, failed or drop it")}</div>
      ${g.stakes && g.status === "open" ? `<div class="warp-goal-stakes">At stake: ${esc(g.stakes)}</div>` : ""}
      ${fix}
    </div>`;
}

function goalsSection(goals: GoalView[], opts: HudOpts): HudPart | null {
  const open = goals.filter((g) => g.status === "open");
  const ended = goals.filter((g) => g.status !== "open");
  if (!open.length && (opts.compact || !ended.length)) return null;
  const body = `${open.slice(0, 3).map((g) => goalRow(g, opts)).join("") || `<div class="warp-empty">No goals open.</div>`}${ended.length
    ? `<details class="warp-away" data-section="goals-ended"><summary>Finished · ${ended.length}</summary><div class="warp-section-body">${ended.map((g) => goalRow(g, opts)).join("")}</div></details>`
    : ""}`;
  return { id: "goals", title: "Goals", count: open.length, body, open: true };
}
