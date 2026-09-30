// src/shared/protocol.ts
var DEFAULT_SETTINGS = {
  enabled: true,
  freeTextChecks: true,
  narratorUpdates: true,
  swipesReroll: true,
  helperConnectionId: "",
  showOdds: true,
  showDiceChips: true,
  hotkeys: true,
  lines: [],
  veils: [],
  decider: "llm",
  jevModel: "jev-latest",
  autoConfidence: 0.75,
  askConfidence: 0.4,
  consistencyCheck: false
};

// src/frontend/styles.ts
var STYLES = `
.warp-root, .warp-chips, .warp-choices, .warp-modal {
  --warp-good: #34b89a;
  --warp-warn: #d9a441;
  --warp-bad: #e05a7e;
  --warp-info: #6f8cff;
  --warp-text: var(--lumiverse-text, #e8e8ee);
  --warp-muted: var(--lumiverse-text-muted, #a4a4b4);
  --warp-dim: var(--lumiverse-text-dim, #7a7a8a);
  --warp-fill: var(--lumiverse-fill, rgba(255,255,255,0.06));
  --warp-fill-subtle: var(--lumiverse-fill-subtle, rgba(255,255,255,0.03));
  --warp-border: var(--lumiverse-border, rgba(255,255,255,0.12));
  --warp-accent: var(--lumiverse-accent, #8b7bff);
  --warp-accent-fg: var(--lumiverse-accent-fg, #fff);
  --warp-radius: var(--lumiverse-radius, 8px);
  --warp-fast: var(--lumiverse-transition-fast, 120ms);
  color: var(--warp-text);
  font-size: 13px;
  line-height: 1.4;
}
.warp-tone-good { color: var(--warp-good); }
.warp-tone-warn { color: var(--warp-warn); }
.warp-tone-bad { color: var(--warp-bad); }
.warp-tone-neutral { color: var(--warp-muted); }
.warp-dim { color: var(--warp-dim); }

/* ───────── HUD ───────── */
.warp-root { display: flex; flex-direction: column; gap: 10px; padding: 12px; box-sizing: border-box; }
.warp-hud-top { display: flex; flex-direction: column; gap: 2px; }
.warp-eyebrow { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--warp-dim); display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.warp-clock { display: flex; align-items: baseline; gap: 8px; }
.warp-clock-time { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: .01em; }
.warp-clock-day { color: var(--warp-muted); }
.warp-phase { font-size: 14px; }
.warp-where { color: var(--warp-muted); display: flex; gap: 10px; flex-wrap: wrap; }
.warp-where b { color: var(--warp-text); font-weight: 600; }
.warp-money { font-weight: 600; font-variant-numeric: tabular-nums; color: var(--warp-warn); }
.warp-pills { display: flex; flex-wrap: wrap; gap: 4px; }
.warp-pill { font-size: 11px; padding: 1px 8px; border-radius: 999px; border: 1px solid currentColor; opacity: .95; }

.warp-bars { display: flex; flex-direction: column; gap: 7px; }
.warp-bar { cursor: pointer; border-radius: 6px; padding: 2px 4px; margin: 0 -4px; transition: background var(--warp-fast); }
.warp-bar:hover { background: var(--warp-fill-subtle); }
.warp-bar-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.warp-bar-label { font-weight: 600; white-space: nowrap; }
.warp-bar-text { text-align: right; font-size: 12.5px; }
.warp-bar-track { height: 4px; border-radius: 4px; background: var(--warp-fill); overflow: hidden; margin-top: 3px; }
.warp-bar-fill { height: 100%; border-radius: 4px; transition: width 400ms ease, background 400ms ease; }
.warp-bar-fill.warp-bg-good { background: var(--warp-good); }
.warp-bar-fill.warp-bg-warn { background: var(--warp-warn); }
.warp-bar-fill.warp-bg-bad { background: var(--warp-bad); }
.warp-bar-fill.warp-bg-neutral { background: var(--warp-info); }
.warp-bar-edit { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
.warp-bar-edit input[type=range] { flex: 1; accent-color: var(--warp-accent); }
.warp-bar-edit input[type=number] { width: 72px; }
.warp-changed { animation: warp-flash 1.2s ease; }
@keyframes warp-flash { 0% { background: color-mix(in srgb, var(--warp-accent) 30%, transparent); } 100% { background: transparent; } }

.warp-section { border-top: 1px solid var(--warp-border); padding-top: 8px; }
.warp-section > summary { cursor: pointer; list-style: none; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--warp-dim); display: flex; justify-content: space-between; user-select: none; }
.warp-section > summary::-webkit-details-marker { display: none; }
.warp-section > summary::after { content: "▸"; transition: transform var(--warp-fast); }
.warp-section[open] > summary::after { transform: rotate(90deg); }
.warp-section-body { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }

.warp-skill { display: grid; grid-template-columns: 1fr auto 44px; align-items: center; gap: 8px; }
.warp-grade { font-weight: 700; min-width: 22px; text-align: center; }
.warp-mini-track { height: 3px; background: var(--warp-fill); border-radius: 3px; overflow: hidden; }
.warp-mini-fill { height: 100%; background: var(--warp-accent); }
.warp-person { padding: 6px 8px; border-radius: var(--warp-radius); background: var(--warp-fill-subtle); }
.warp-person-name { font-weight: 600; margin-bottom: 2px; }
.warp-person-stats { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 12px; color: var(--warp-muted); }
.warp-item { display: flex; justify-content: space-between; }
.warp-empty { color: var(--warp-dim); font-style: italic; }

/* ───────── buttons & forms ───────── */
.warp-btn { font: inherit; color: var(--warp-text); background: var(--warp-fill); border: 1px solid var(--warp-border); border-radius: var(--warp-radius); padding: 6px 12px; cursor: pointer; transition: background var(--warp-fast), border-color var(--warp-fast), transform var(--warp-fast); }
.warp-btn:hover { border-color: var(--warp-accent); }
.warp-btn:active { transform: translateY(1px); }
.warp-btn-primary { background: var(--warp-accent); color: var(--warp-accent-fg); border-color: transparent; }
.warp-btn-ghost { background: transparent; border-color: transparent; color: var(--warp-muted); padding: 2px 6px; }
.warp-btn-ghost:hover { color: var(--warp-text); }
.warp-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.warp-card { border: 1px solid var(--warp-border); border-radius: calc(var(--warp-radius) + 2px); padding: 12px; background: var(--warp-fill-subtle); display: flex; flex-direction: column; gap: 8px; }
.warp-card h3 { margin: 0; font-size: 14px; }
.warp-card p { margin: 0; color: var(--warp-muted); }
.warp-toggle { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; align-items: center; padding: 6px 0; cursor: pointer; }
.warp-toggle small { grid-column: 1; color: var(--warp-dim); }
.warp-toggle input { grid-row: 1 / span 2; grid-column: 2; accent-color: var(--warp-accent); width: 16px; height: 16px; }
.warp-select, .warp-input { font: inherit; color: var(--warp-text); background: var(--warp-fill); border: 1px solid var(--warp-border); border-radius: 6px; padding: 5px 8px; width: 100%; box-sizing: border-box; }
.warp-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.warp-tag { font: inherit; font-size: 12px; border-radius: 999px; padding: 2px 10px; border: 1px solid var(--warp-border); background: transparent; color: var(--warp-muted); cursor: pointer; }
.warp-tag[data-mode=veil] { color: var(--warp-warn); border-color: var(--warp-warn); }
.warp-tag[data-mode=line] { color: var(--warp-bad); border-color: var(--warp-bad); text-decoration: line-through; }
.warp-issues { display: flex; flex-direction: column; gap: 6px; }
.warp-issue { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; font-size: 12.5px; }
.warp-issue-where { color: var(--warp-dim); grid-column: 2; font-size: 11.5px; }
.warp-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--warp-border); margin: -4px -12px 0; padding: 0 8px; position: sticky; top: 0; background: inherit; z-index: 1; }
.warp-tab { font: inherit; background: none; border: none; color: var(--warp-muted); padding: 8px 10px; cursor: pointer; border-bottom: 2px solid transparent; }
.warp-tab[aria-selected=true] { color: var(--warp-text); border-bottom-color: var(--warp-accent); }
.warp-kbd { font-family: ui-monospace, monospace; font-size: 10.5px; padding: 0 5px; border-radius: 4px; border: 1px solid var(--warp-border); color: var(--warp-muted); }

/* ───────── choices under the latest reply ───────── */
.warp-choices { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--warp-border); display: flex; flex-direction: column; gap: 8px; transition: opacity 200ms; }
.warp-choices.warp-busy { opacity: .45; pointer-events: none; }
.warp-choice-group { display: flex; flex-direction: column; gap: 5px; }
.warp-choice-group-label { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--warp-dim); }
.warp-choice-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 6px; }
.warp-choice { font: inherit; text-align: left; display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: var(--warp-radius); border: 1px solid var(--warp-border); background: var(--warp-fill-subtle); color: var(--warp-text); cursor: pointer; transition: border-color var(--warp-fast), background var(--warp-fast), transform var(--warp-fast); min-height: 34px; }
.warp-choice:hover { border-color: var(--warp-accent); background: var(--warp-fill); }
.warp-choice:active { transform: translateY(1px); }
.warp-choice:focus-visible { outline: 2px solid var(--warp-accent); outline-offset: 1px; }
.warp-choice-label { flex: 1; }
.warp-choice-odds { font-size: 11.5px; font-variant-numeric: tabular-nums; font-weight: 600; }
.warp-choice-veil { font-size: 11px; color: var(--warp-warn); }
.warp-status-line { font-size: 12px; color: var(--warp-muted); display: flex; align-items: center; gap: 6px; }
.warp-spinner { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--warp-border); border-top-color: var(--warp-accent); animation: warp-spin .8s linear infinite; }
@keyframes warp-spin { to { transform: rotate(360deg); } }

/* ───────── per-message dice & change chips ───────── */
.warp-chips { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 5px; align-items: center; font-size: 12px; }
.warp-chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 999px; background: var(--warp-fill); border: 1px solid transparent; white-space: nowrap; }
.warp-chip-narr { border-style: dashed; border-color: var(--warp-border); }
.warp-chip-undo { font: inherit; background: none; border: none; color: var(--warp-dim); cursor: pointer; padding: 0 0 0 2px; line-height: 1; }
.warp-chip-undo:hover { color: var(--warp-bad); }
.warp-dice { cursor: pointer; font-weight: 600; border: 1px solid currentColor; background: transparent; }
.warp-dice-detail { flex-basis: 100%; display: none; gap: 6px; align-items: center; color: var(--warp-muted); padding: 4px 2px 0; flex-wrap: wrap; }
.warp-chips[data-open] .warp-dice-detail { display: flex; }
.warp-die { display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding: 0 4px; border-radius: 6px; border: 1px solid var(--warp-border); font-weight: 700; font-variant-numeric: tabular-nums; color: var(--warp-text); }
.warp-die[data-dropped] { opacity: .35; text-decoration: line-through; }
.warp-band { color: var(--warp-dim); font-style: italic; }

.warp-decision { border: 1px solid var(--warp-info); color: var(--warp-text); }
.warp-suggest { background: color-mix(in srgb, var(--warp-accent) 14%, transparent); border: 1px solid var(--warp-accent); gap: 8px; padding: 3px 4px 3px 10px; }
.warp-mini { padding: 1px 10px; font-size: 12px; }
.warp-slider { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--warp-muted); }
.warp-slider input { accent-color: var(--warp-accent); }

/* ───────── modal ───────── */
.warp-modal { display: flex; flex-direction: column; gap: 10px; padding: 4px 2px; }
.warp-template { text-align: left; font: inherit; color: inherit; cursor: pointer; }
.warp-template:hover { border-color: var(--warp-accent); }
`;

// src/frontend/render.ts
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
var PHASE_ICON = { morning: "\uD83C\uDF05", afternoon: "☀️", evening: "\uD83C\uDF07", night: "\uD83C\uDF19" };
function pctTone(p) {
  return p >= 0.66 ? "good" : p >= 0.33 ? "warn" : "bad";
}
function renderHud(h, opts) {
  const top = [
    `<div class="warp-eyebrow"><span>${esc(h.rulesetName)}</span><span title="Turn">T${h.turn}</span></div>`,
    h.clock ? `<div class="warp-clock"><span class="warp-phase" aria-hidden="true">${PHASE_ICON[h.clock.phase] ?? ""}</span><span class="warp-clock-time">${esc(h.clock.time)}</span><span class="warp-clock-day">${esc(h.clock.day)}</span></div>` : "",
    h.location || h.money ? `<div class="warp-where">${h.location ? `<span title="${esc(h.location.desc ?? "")}">\uD83D\uDCCD <b>${esc(h.location.name)}</b></span>` : ""}${h.money ? `<span class="warp-money">${esc(h.money)}</span>` : ""}</div>` : "",
    h.conditions.length ? `<div class="warp-pills">${h.conditions.map((c) => `<span class="warp-pill warp-tone-${c.tone}" title="${esc(c.desc ?? "")}">${esc(c.label)}${c.remaining ? ` · ${esc(c.remaining)}` : ""}</span>`).join("")}</div>` : ""
  ].join("");
  const bars = h.bars.map((b) => {
    const editing = opts.editing === b.id;
    return `<div class="warp-bar" data-bar="${esc(b.id)}" title="${esc(`${b.label}: ${b.display}${b.desc ? ` — ${b.desc}` : ""}
Click to adjust`)}">
      <div class="warp-bar-head"><span class="warp-bar-label">${esc(b.label)}</span><span class="warp-bar-text warp-tone-${b.tone}">${esc(b.text ?? b.display)}</span></div>
      <div class="warp-bar-track"><div class="warp-bar-fill warp-bg-${b.tone}" style="width:${(b.pct * 100).toFixed(1)}%${b.color ? `;background:${esc(b.color)}` : ""}"></div></div>
      ${editing ? `<div class="warp-bar-edit"><input type="range" min="0" max="1000" value="${Math.round(b.pct * 1000)}" data-range="${esc(b.id)}" aria-label="${esc(b.label)}"><input class="warp-input" type="number" value="${esc(Math.round(b.value))}" data-num="${esc(b.id)}" aria-label="${esc(b.label)} value"><button class="warp-btn warp-btn-primary" data-save="${esc(b.id)}">Set</button></div>` : ""}
    </div>`;
  }).join("");
  const skills = h.skills.length ? section("Skills & attributes", h.skills.length, h.skills.map((s) => `
    <div class="warp-skill" title="${esc(`${s.label}: ${s.display}${s.text ? ` — ${s.text}` : ""}`)}">
      <span>${esc(s.label)}</span>
      <span class="warp-grade ${s.grade ? `warp-tone-${pctTone(s.pct)}` : ""}">${esc(s.grade ?? s.display)}</span>
      <div class="warp-mini-track"><div class="warp-mini-fill" style="width:${(s.pct * 100).toFixed(1)}%"></div></div>
    </div>`).join(""), !opts.compact) : "";
  const people = section("People", h.people.length, h.people.length ? h.people.map((p) => `
    <div class="warp-person">
      <div class="warp-person-name">${esc(p.name)}</div>
      <div class="warp-person-stats">${p.stats.map((s) => `<span>${esc(s.label)}: <span class="warp-tone-${s.tone}">${esc(s.text ?? s.display)}</span></span>`).join("")}</div>
    </div>`).join("") : `<div class="warp-empty">No one yet.</div>`, !opts.compact);
  const items = section("Inventory", h.items.length, h.items.length ? h.items.map((i) => `<div class="warp-item"><span>${esc(i.name)}</span>${i.count > 1 ? `<span class="warp-kbd">×${i.count}</span>` : ""}</div>`).join("") : `<div class="warp-empty">Empty-handed.</div>`, !opts.compact);
  return `<div class="warp-hud-top">${top}</div><div class="warp-bars">${bars}</div>${skills}${people}${items}`;
}
function section(title, count, body, open) {
  return `<details class="warp-section" data-section="${esc(title)}"${open ? " open" : ""}><summary><span>${esc(title)}${count ? ` · ${count}` : ""}</span></summary><div class="warp-section-body">${body}</div></details>`;
}
function renderChoices(choices, opts) {
  if (!choices.length && !opts.busy)
    return "";
  const groups = new Map;
  choices.forEach((c, i) => {
    const g = c.group ?? "Actions";
    if (!groups.has(g))
      groups.set(g, []);
    groups.get(g).push({ c, n: i + 1 });
  });
  const body = [...groups].map(([g, list]) => `
    <div class="warp-choice-group">
      ${groups.size > 1 ? `<div class="warp-choice-group-label">${esc(g)}</div>` : ""}
      <div class="warp-choice-grid">${list.map(({ c, n }) => {
    const key = opts.hotkeys && n <= 10 ? `<span class="warp-kbd">${n === 10 ? 0 : n}</span>` : "";
    const odds = opts.showOdds && c.odds !== null ? `<span class="warp-choice-odds warp-tone-${pctTone(c.odds + (c.partialOdds ?? 0) / 2)}" title="${esc(`${c.checkLabel ?? "Check"}: ${Math.round(c.odds * 100)}% success${c.partialOdds ? `, ${Math.round(c.partialOdds * 100)}% partial` : ""}`)}">${Math.round(c.odds * 100)}%</span>` : "";
    const tip = [c.desc, c.checkLabel ? `Check: ${c.checkLabel}` : null, c.veiled ? "Veiled: happens off-screen" : null].filter(Boolean).join(`
`);
    return `<button class="warp-choice" data-act="${esc(c.id)}" title="${esc(tip)}">${key}<span class="warp-choice-label">${esc(c.label)}</span>${c.veiled ? `<span class="warp-choice-veil" aria-label="veiled">◐</span>` : ""}${odds}</button>`;
  }).join("")}</div>
    </div>`).join("");
  const status = opts.busy ? `<div class="warp-status-line"><span class="warp-spinner"></span>${esc(opts.busyLabel ?? "The story continues…")}</div>` : "";
  return `${status}${body}`;
}
var TIER_TONE = { crit_success: "good", success: "good", partial: "warn", fail: "bad", crit_fail: "bad" };
function renderChips(rec, opts) {
  const out = [];
  const read = rec.via === "adjudicator" ? `<span class="warp-dim">· read from your message${rec.confidence !== null ? ` (${Math.round(rec.confidence * 100)}% sure)` : ""}</span>` : rec.via === "confirmed" ? `<span class="warp-dim">· you confirmed</span>` : "";
  const notAction = rec.redoFrom ? `<button class="warp-btn warp-btn-ghost" data-redo="${esc(rec.redoFrom)}" data-redo-action="" title="Redo this turn without a roll">Not an action?</button>` : "";
  if (rec.check && opts.showDice) {
    const c = rec.check;
    out.push(`<button class="warp-chip warp-dice warp-tone-${TIER_TONE[c.tier]}" data-dice title="Show the roll">\uD83C\uDFB2 ${esc(c.label)} · ${esc(c.tierLabel)}</button>`);
    out.push(`<div class="warp-dice-detail">${c.faces.map((f) => `<span class="warp-die" title="d${f.sides}"${f.kept ? "" : " data-dropped"}>${f.value}</span>`).join("")}<span>${esc(c.summary)}</span>${read}${notAction}</div>`);
  } else if (rec.action && opts.showDice) {
    out.push(`<span class="warp-chip">▸ ${esc(rec.action)}</span>${notAction ? `<span class="warp-chip">${notAction}</span>` : ""}`);
  }
  for (const d of rec.decisions) {
    const odds = d.odds.map((o) => `${o.desc} ${Math.round(o.p * 100)}%`).join(" · ");
    out.push(`<span class="warp-chip warp-decision" title="${esc(`${d.ask}
${odds}
${d.source === "model" ? "Odds from the decision model; the engine rolled." : "Odds from the ruleset's weights; the engine rolled."}`)}">\uD83C\uDFAD ${esc(d.picked)} <span class="warp-dim">${Math.round(d.p * 100)}%</span></span>`);
  }
  if ((rec.contradiction ?? 0) >= 0.6) {
    out.push(`<span class="warp-chip warp-tone-warn" title="The decision model thinks this reply may contradict the game state (${Math.round(rec.contradiction * 100)}%). Consider swiping.">⚠ may contradict the state</span>`);
  }
  for (const ch of rec.changes) {
    const narr = ch.src === "narrator" || ch.src === "manual";
    const undo = narr && ch.undo?.length ? `<button class="warp-chip-undo" data-undo="${esc(ch.undo.join(","))}" title="Undo this change" aria-label="Undo">×</button>` : "";
    out.push(`<span class="warp-chip warp-tone-${ch.tone}${narr ? " warp-chip-narr" : ""}" title="${esc(narr ? ch.src === "manual" ? "You set this" : "Read from the story — click × to undo" : "Applied by the rules")}">${esc(ch.text)}${ch.band ? ` <span class="warp-band">${esc(ch.band)}</span>` : ""}${undo}</span>`);
  }
  if (rec.veiled)
    out.push(`<span class="warp-chip warp-tone-warn" title="Narrated off-screen by your Veils setting">◐ veiled</span>`);
  return out.join("");
}
function renderSuggestion(s) {
  return `<span class="warp-chip warp-suggest">\uD83C\uDFB2 Roll <b>${esc(s.label)}</b>? <span class="warp-dim">${Math.round(s.confidence * 100)}% sure</span>
    <button class="warp-btn warp-btn-primary warp-mini" data-redo="${esc(s.messageId)}" data-redo-action="${esc(s.actionId)}" data-redo-params="${esc(JSON.stringify(s.params ?? {}))}">Roll it</button>
    <button class="warp-chip-undo" data-dismiss-suggest="${esc(s.messageId)}" title="Dismiss" aria-label="Dismiss">×</button></span>`;
}
function renderRulesetCard(s, hasChat) {
  if (!hasChat) {
    return `<div class="warp-card"><h3>Open a chat</h3><p>Warp runs inside a chat whose character has a <b>warp-ruleset</b> lorebook.</p></div>`;
  }
  if (s.state === "none") {
    return `<div class="warp-card">
      <h3>${esc(s.characterName ?? "This character")} has no game rules yet</h3>
      <p>Add a ruleset to get stats, dice checks, time, inventory and relationships that the model can't fudge. It's stored in a <b>warp-ruleset</b> lorebook on the character, so it travels with the card.</p>
      <div class="warp-row"><button class="warp-btn warp-btn-primary" data-install>Add a ruleset…</button></div>
    </div>`;
  }
  const errors = s.issues.filter((i) => i.level === "error");
  const warns = s.issues.filter((i) => i.level === "warning");
  const head = s.state === "ok" ? `<h3>✓ ${esc(s.name)}</h3><p>From ${esc(s.source)}${warns.length ? ` · ${warns.length} note${warns.length > 1 ? "s" : ""}` : ""}</p>` : `<h3 class="warp-tone-bad">Ruleset can't run</h3><p>Fix the problems below in the <b>warp-ruleset</b> lorebook, then reload.</p>`;
  const list = [...errors, ...warns].slice(0, 30).map((i) => `
    <div class="warp-issue"><span class="warp-tone-${i.level === "error" ? "bad" : "warn"}">${i.level === "error" ? "✕" : "!"}</span><span>${esc(i.message)}</span><span class="warp-issue-where">${esc(i.where)}</span></div>`).join("");
  return `<div class="warp-card">${head}${list ? `<div class="warp-issues">${list}</div>` : ""}
    <div class="warp-row"><button class="warp-btn" data-reload>Reload</button><button class="warp-btn warp-btn-ghost" data-install>Replace with a template…</button></div>
  </div>`;
}
function renderTemplatePicker(templates) {
  return `<div class="warp-modal">
    <p style="margin:0;color:var(--warp-muted)">Pick a starting point. Warp creates a <b>warp-ruleset</b> lorebook on this character, split into readable entries (stats, people, world, actions, rules) that you can edit like any lorebook. It's never sent to the model.</p>
    ${templates.map((t) => `<button class="warp-card warp-template" data-template="${esc(t.id)}"><h3>${esc(t.name)}</h3><p>${esc(t.blurb)}</p></button>`).join("")}
  </div>`;
}
function toggle(key, label, hint, on) {
  return `<label class="warp-toggle"><span>${esc(label)}</span><small>${esc(hint)}</small><input type="checkbox" data-setting="${esc(key)}"${on ? " checked" : ""}></label>`;
}
function renderDecider(s, jevKeySet) {
  const opt = (v, label) => `<option value="${v}"${s.decider === v ? " selected" : ""}>${label}</option>`;
  const pct = (v) => Math.round(v * 100);
  return `<div class="warp-card">
    <h3>Decision model</h3>
    <p>Answers Warp's quick typed questions: what your message attempts, NPC odds, plain-language triggers, bookkeeping. It never picks outcomes — it gives odds, and the dice roll on them.</p>
    <select class="warp-select" data-setting="decider">
      ${opt("llm", "Helper LLM (uses the helper model below)")}
      ${opt("jev", "Jev — TypeSafe System-1 model (fast, cheap)")}
      ${opt("rules", "Rules only — no model calls (suggests, never acts)")}
    </select>
    ${s.decider === "jev" ? `
      <div class="warp-row">
        <input class="warp-input" type="password" data-jevkey placeholder="${jevKeySet ? "Key saved — paste to replace" : "TypeSafe API key (sk-…)"}" autocomplete="off" style="flex:1">
        <button class="warp-btn" data-save-jev>${jevKeySet ? "Replace" : "Save"}</button>
        ${jevKeySet ? `<button class="warp-btn warp-btn-ghost" data-clear-jev>Remove</button>` : ""}
      </div>
      <p>${jevKeySet ? "✓ Key stored encrypted on the server." : "No key yet — until you add one, the helper LLM is used."} Your roleplay text is sent to TypeSafe for these questions.</p>
      <input class="warp-input" data-setting="jevModel" value="${esc(s.jevModel)}" title="Model (jev-latest, or a pinned version)">` : ""}
    <label class="warp-slider"><span>Roll automatically when at least <b>${pct(s.autoConfidence)}%</b> sure</span>
      <input type="range" min="40" max="99" value="${pct(s.autoConfidence)}" data-setting-pct="autoConfidence"></label>
    <label class="warp-slider"><span>Offer a one-tap “Roll it?” from <b>${pct(s.askConfidence)}%</b></span>
      <input type="range" min="10" max="95" value="${pct(s.askConfidence)}" data-setting-pct="askConfidence"></label>
    ${toggle("consistencyCheck", "Check replies against the state", "Flags replies that contradict the game (wrong place, items, injuries, dice result). One extra quick question per reply — cheap with Jev.", s.consistencyCheck)}
    <div class="warp-row"><button class="warp-btn" data-test-decider>Test</button></div>
  </div>`;
}
function renderSettings(s, status, connections, jevKeySet = false) {
  const tags = new Set([...status?.tags ?? [], ...s.lines, ...s.veils]);
  const tagChips = [...tags].sort().map((t) => {
    const mode = s.lines.includes(t) ? "line" : s.veils.includes(t) ? "veil" : "on";
    return `<button class="warp-tag" data-tag="${esc(t)}" data-mode="${mode}" title="Click to cycle: on → veil (off-screen) → line (removed)">${esc(t)}</button>`;
  }).join("");
  return `<div class="warp-card">
    <h3>Play</h3>
    ${toggle("enabled", "Warp is on", "Turn the engine off without removing any rules.", s.enabled)}
    ${toggle("freeTextChecks", "Read my typed messages for actions", "When you type something risky, a quick referee call picks the matching action and the dice decide.", s.freeTextChecks)}
    ${toggle("narratorUpdates", "Keep state in sync with the story", "After each reply, small changes the story describes (time, mood, items, people) are recorded within the ruleset's limits. You can undo any of them.", s.narratorUpdates)}
    ${toggle("swipesReroll", "Swiping rerolls the dice", "Casual: a new swipe is a new roll. Turn off for Ironman: rolls stay fixed for the same move.", s.swipesReroll)}
  </div>
  <div class="warp-card">
    <h3>Display</h3>
    ${toggle("showOdds", "Show odds on choices", "Percent chance of success on each button.", s.showOdds)}
    ${toggle("showDiceChips", "Show dice & changes on messages", "The roll and what changed, under each reply.", s.showDiceChips)}
    ${toggle("hotkeys", "Number keys pick choices", "Press 1–9 (0 for 10) when you're not typing.", s.hotkeys)}
  </div>
  ${renderDecider(s, jevKeySet)}
  <div class="warp-card">
    <h3>Helper model</h3>
    <p>Used for the referee and bookkeeping calls. A fast, cheap model works best.</p>
    <select class="warp-select" data-setting="helperConnectionId">
      <option value="">Same as the chat</option>
      ${connections.map((c) => `<option value="${esc(c.id)}"${c.id === s.helperConnectionId ? " selected" : ""}>${esc(c.name)}</option>`).join("")}
    </select>
  </div>
  <div class="warp-card">
    <h3>Content: lines & veils</h3>
    <p>Click a tag to cycle it: <b>on</b> → <span class="warp-tone-warn">veil</span> (still happens, narrated off-screen) → <span class="warp-tone-bad">line</span> (removed from the game).</p>
    <div class="warp-tags">${tagChips || `<span class="warp-empty">This ruleset doesn't tag any actions.</span>`}</div>
    <div class="warp-row"><input class="warp-input" data-newtag placeholder="Add a tag… (Enter)" style="flex:1"></div>
  </div>`;
}

// src/frontend.ts
var CLEANUP_KEY = "__warpCleanup";
var ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/></svg>`;
function store(key, value) {
  try {
    if (value !== undefined)
      localStorage.setItem(`warp:${key}`, value);
    return localStorage.getItem(`warp:${key}`);
  } catch {
    return null;
  }
}
function setup(ctx) {
  const prev = globalThis[CLEANUP_KEY];
  if (typeof prev === "function")
    prev();
  const cleanups = [];
  cleanups.push(ctx.dom.addStyle(STYLES));
  let state = null;
  let settings = { ...DEFAULT_SETTINGS };
  let templates = [];
  let connections = [];
  let jevKeySet = false;
  let busy = { chatId: "", on: false, label: "" };
  let editingBar = null;
  let drawerView = "sheet";
  const openSections = new Map;
  const send = (m) => ctx.sendToBackend(m);
  const chatId = () => {
    try {
      return ctx.getActiveChat().chatId ?? null;
    } catch {
      return null;
    }
  };
  const tab = ctx.ui.registerDrawerTab({
    id: "warp",
    title: "Warp — game state",
    shortName: "Warp",
    headerTitle: "Warp",
    description: "Stats, dice, inventory, people and game settings",
    keywords: ["stats", "dice", "game", "ruleset", "rpg", "tracker"],
    iconSvg: ICON
  });
  cleanups.push(() => tab.destroy());
  const drawerRoot = document.createElement("div");
  drawerRoot.className = "warp-root";
  tab.root.appendChild(drawerRoot);
  cleanups.push(tab.onActivate(() => renderDrawer()));
  let dock = null;
  const dockRoot = document.createElement("div");
  dockRoot.className = "warp-root";
  const narrow = () => window.innerWidth < 760;
  try {
    dock = ctx.ui.requestDockPanel({
      edge: "left",
      title: "Warp",
      size: Number(store("dockSize")) || 270,
      minSize: 220,
      maxSize: 420,
      resizable: true,
      startCollapsed: true
    });
    dock.root.appendChild(dockRoot);
    cleanups.push(dock.onVisibilityChange((visible) => {
      if (!autoToggling)
        store("dockHidden", visible ? "0" : "1");
    }));
    cleanups.push(() => dock?.destroy());
  } catch {
    dock = null;
  }
  let autoToggling = false;
  function syncDockVisibility() {
    if (!dock)
      return;
    const want = !!state?.hud && store("dockHidden") !== "1" && !narrow();
    if (want === !dock.isCollapsed())
      return;
    autoToggling = true;
    try {
      if (want)
        dock.expand();
      else
        dock.collapse();
    } finally {
      autoToggling = false;
    }
  }
  function rememberSections(root) {
    root.querySelectorAll("details[data-section]").forEach((d) => openSections.set(d.dataset.section, d.open));
  }
  function restoreSections(root) {
    root.querySelectorAll("details[data-section]").forEach((d) => {
      const v = openSections.get(d.dataset.section);
      if (v !== undefined)
        d.open = v;
    });
  }
  let lastBars = new Map;
  function flashChangedBars(root) {
    if (!state?.hud)
      return;
    for (const b of state.hud.bars) {
      const prevV = lastBars.get(b.id);
      if (prevV !== undefined && Math.abs(prevV - b.value) > 0.5)
        root.querySelector(`[data-bar="${CSS.escape(b.id)}"]`)?.classList.add("warp-changed");
    }
  }
  function renderDock() {
    if (!dock)
      return;
    rememberSections(dockRoot);
    if (state?.hud) {
      dockRoot.innerHTML = renderHud(state.hud, { editing: editingBar, compact: true });
    } else if (state?.status.state === "broken") {
      dockRoot.innerHTML = renderRulesetCard(state.status, true);
    } else {
      dockRoot.innerHTML = "";
    }
    restoreSections(dockRoot);
    flashChangedBars(dockRoot);
  }
  function renderDrawer() {
    rememberSections(drawerRoot);
    const hasChat = !!state?.chatId;
    const status = state?.status ?? { state: "none", name: null, source: null, issues: [], characterName: null, tags: [] };
    const tabs = `<div class="warp-tabs" role="tablist">
      ${["sheet", "rules", "settings"].map((v) => `<button class="warp-tab" role="tab" data-view="${v}" aria-selected="${drawerView === v}">${v === "sheet" ? "Sheet" : v === "rules" ? `Ruleset${status.issues.some((i) => i.level === "error") ? " ⚠" : ""}` : "Settings"}</button>`).join("")}
    </div>`;
    let body = "";
    if (drawerView === "sheet") {
      body = state?.hud ? renderHud(state.hud, { editing: editingBar, compact: false }) : renderRulesetCard(status, hasChat);
    } else if (drawerView === "rules") {
      body = renderRulesetCard(status, hasChat) + `<div class="warp-card"><h3>Writing rules</h3><p>Rules live in entries titled <b>warp-ruleset · …</b> (or any lorebook named <b>warp-ruleset</b>). Each entry is YAML; entries merge together. Warp keeps them out of the prompt automatically.</p></div>`;
    } else {
      body = renderSettings(settings, state?.status ?? null, connections, jevKeySet);
    }
    drawerRoot.innerHTML = tabs + body;
    restoreSections(drawerRoot);
    flashChangedBars(drawerRoot);
    tab.setBadge(status.issues.some((i) => i.level === "error") ? "!" : null);
  }
  let choicesEl = null;
  let choicesFor = null;
  let choicesHtml = "";
  const chipEls = new Map;
  const wantChips = new Map;
  function injectChips(messageId, html) {
    const bubble = ctx.dom.findMessageElement(messageId);
    if (!bubble)
      return false;
    const el = ctx.dom.inject(bubble, `<div class="warp-chips" data-warp-chips="${messageId}">${html}</div>`, "beforeend");
    chipEls.set(messageId, { el, html });
    return true;
  }
  function placeChoices(force = false) {
    const anchor = state?.choicesAnchor ?? null;
    const isBusy = busy.on && busy.chatId === state?.chatId;
    const html = settings.enabled && state?.hud && anchor ? renderChoices(state.choices, { showOdds: settings.showOdds, hotkeys: settings.hotkeys, busy: isBusy, busyLabel: busy.label || undefined }) : "";
    if (!force && anchor === choicesFor && html === choicesHtml && choicesEl?.isConnected)
      return;
    if (choicesEl) {
      ctx.dom.uninject(choicesEl);
      choicesEl = null;
    }
    choicesFor = anchor;
    choicesHtml = html;
    if (!anchor || !html)
      return;
    const bubble = ctx.dom.findMessageElement(anchor);
    if (!bubble)
      return;
    choicesEl = ctx.dom.inject(bubble, `<div class="warp-choices${isBusy ? " warp-busy" : ""}">${html}</div>`, "beforeend");
  }
  function reconcileMessages() {
    const records = state?.records ?? [];
    wantChips.clear();
    if (settings.enabled) {
      for (const r of records) {
        const html = renderChips(r, { showDice: settings.showDiceChips });
        if (html)
          wantChips.set(r.messageId, html);
      }
      for (const s of state?.suggestions ?? [])
        wantChips.set(s.messageId, (wantChips.get(s.messageId) ?? "") + renderSuggestion(s));
    }
    let anchorTouched = false;
    for (const [id, cur] of chipEls) {
      if (wantChips.get(id) !== cur.html) {
        ctx.dom.uninject(cur.el);
        chipEls.delete(id);
        if (id === choicesFor)
          anchorTouched = true;
      }
    }
    for (const [id, html] of wantChips) {
      if (chipEls.has(id))
        continue;
      if (injectChips(id, html) && id === state?.choicesAnchor)
        anchorTouched = true;
    }
    placeChoices(anchorTouched);
  }
  let mo = null;
  let moTimer = null;
  const pendingCheck = () => {
    moTimer = null;
    let touched = false;
    for (const [id, html] of wantChips)
      if (!chipEls.has(id) && injectChips(id, html))
        touched = touched || id === state?.choicesAnchor;
    if (touched || choicesFor && choicesHtml && !choicesEl?.isConnected)
      placeChoices(true);
  };
  try {
    mo = new MutationObserver(() => {
      if (!moTimer)
        moTimer = setTimeout(pendingCheck, 200);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    cleanups.push(() => {
      mo?.disconnect();
      if (moTimer)
        clearTimeout(moTimer);
    });
  } catch {}
  function renderAll() {
    renderDock();
    renderDrawer();
    reconcileMessages();
    syncDockVisibility();
    if (state?.hud)
      lastBars = new Map(state.hud.bars.map((b) => [b.id, b.value]));
  }
  function openPicker() {
    const id = chatId();
    if (!id)
      return;
    const modal = ctx.ui.showModal({ title: "Add a Warp ruleset", width: 520, maxHeight: 640 });
    modal.root.innerHTML = renderTemplatePicker(templates);
    modal.root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-template]");
      if (!btn)
        return;
      send({ type: "install_template", chatId: id, templateId: btn.dataset.template });
      modal.dismiss();
    });
  }
  async function confirmReplace() {
    if (state?.status.state === "none")
      return openPicker();
    const res = await ctx.ui.showConfirm({
      title: "Add another ruleset?",
      message: "This character already has warp-ruleset entries. A new template is added as another lorebook and merged with the existing rules — remove the old lorebook if you want a clean start.",
      confirmLabel: "Choose a template",
      variant: "warning"
    });
    if (res.confirmed)
      openPicker();
  }
  function onPanelClick(e) {
    const t = e.target;
    const view = t.closest("[data-view]");
    if (view) {
      drawerView = view.dataset.view;
      renderDrawer();
      return;
    }
    if (t.closest("[data-install]")) {
      confirmReplace();
      return;
    }
    if (t.closest("[data-reload]")) {
      send({ type: "reload", chatId: chatId() });
      return;
    }
    const save = t.closest("[data-save]");
    if (save) {
      const id = save.dataset.save;
      const input = save.parentElement?.querySelector(`[data-num]`);
      const v = Number(input?.value);
      const cid = chatId();
      if (cid && Number.isFinite(v))
        send({ type: "adjust", chatId: cid, stat: id, value: v });
      editingBar = null;
      return;
    }
    if (t.closest(".warp-bar-edit"))
      return;
    const bar = t.closest("[data-bar]");
    if (bar) {
      editingBar = editingBar === bar.dataset.bar ? null : bar.dataset.bar;
      renderDock();
      renderDrawer();
      return;
    }
    if (t.closest("[data-save-jev]")) {
      const input = drawerRoot.querySelector("[data-jevkey]");
      if (input?.value.trim()) {
        send({ type: "set_jev_key", key: input.value.trim() });
        input.value = "";
      }
      return;
    }
    if (t.closest("[data-clear-jev]")) {
      send({ type: "set_jev_key", key: "" });
      return;
    }
    if (t.closest("[data-test-decider]")) {
      send({ type: "test_decider" });
      return;
    }
    const tag = t.closest("[data-tag]");
    if (tag) {
      const name = tag.dataset.tag;
      const mode = tag.dataset.mode;
      const lines = settings.lines.filter((x) => x !== name);
      const veils = settings.veils.filter((x) => x !== name);
      if (mode === "on")
        veils.push(name);
      else if (mode === "veil")
        lines.push(name);
      send({ type: "settings", patch: { lines, veils } });
    }
  }
  function onPanelInput(e) {
    const t = e.target;
    if (t.dataset.range && state?.hud) {
      const b = state.hud.bars.find((x) => x.id === t.dataset.range);
      const num = t.parentElement?.querySelector("[data-num]");
      if (b && num) {
        const span = b.pct > 0 ? b.value / b.pct : 0;
        num.value = String(Math.round(Number(t.value) / 1000 * (span || 100)));
      }
    }
  }
  function onPanelChange(e) {
    const t = e.target;
    const pctKey = t.dataset.settingPct;
    if (pctKey) {
      let v = Number(t.value) / 100;
      if (pctKey === "askConfidence")
        v = Math.min(v, settings.autoConfidence - 0.01);
      else
        v = Math.max(v, settings.askConfidence + 0.01);
      send({ type: "settings", patch: { [pctKey]: v } });
      return;
    }
    const key = t.dataset.setting;
    if (!key)
      return;
    const value = t instanceof HTMLInputElement && t.type === "checkbox" ? t.checked : t.value;
    send({ type: "settings", patch: { [key]: value } });
  }
  function onPanelKey(e) {
    const t = e.target;
    if (e.key === "Enter" && t.dataset.newtag !== undefined && t.value.trim()) {
      send({ type: "settings", patch: { veils: [...settings.veils, t.value.trim().toLowerCase()] } });
      t.value = "";
    }
  }
  for (const root of [drawerRoot, dockRoot]) {
    root.addEventListener("click", onPanelClick);
    root.addEventListener("input", onPanelInput);
    root.addEventListener("change", onPanelChange);
    root.addEventListener("keydown", onPanelKey);
    root.addEventListener("toggle", () => rememberSections(root), true);
  }
  function act(actionId) {
    const cid = chatId();
    if (!cid || busy.on && busy.chatId === cid)
      return;
    busy = { chatId: cid, on: true, label: "Rolling…" };
    placeChoices(true);
    send({ type: "act", chatId: cid, actionId });
    setTimeout(() => {
      if (busy.on && busy.label === "Rolling…" && busy.chatId === cid) {
        busy = { chatId: "", on: false, label: "" };
        placeChoices(true);
      }
    }, 15000);
  }
  async function confirmRedo(btn) {
    const cid = chatId();
    const userMessageId = btn.dataset.redo;
    if (!cid || !userMessageId)
      return;
    const actionId = btn.dataset.redoAction || null;
    let params;
    try {
      params = btn.dataset.redoParams ? JSON.parse(btn.dataset.redoParams) : undefined;
    } catch {
      params = undefined;
    }
    const res = await ctx.ui.showConfirm({
      title: actionId ? "Roll for it?" : "Redo without a roll?",
      message: actionId ? "The reply to your message is replaced with a new one where the dice decide." : "The reply to your message is replaced with a new one, treating your message as plain roleplay (no check).",
      confirmLabel: actionId ? "Roll it" : "Redo turn",
      variant: "info"
    });
    if (!res.confirmed)
      return;
    busy = { chatId: cid, on: true, label: "Rolling…" };
    placeChoices(true);
    send({ type: "redo", chatId: cid, userMessageId, actionId, params });
  }
  const onDocClick = (e) => {
    const t = e.target;
    if (!t?.closest)
      return;
    const choice = t.closest(".warp-choices [data-act]");
    if (choice) {
      e.preventDefault();
      act(choice.dataset.act);
      return;
    }
    const dice = t.closest(".warp-chips [data-dice]");
    if (dice) {
      const row = dice.closest(".warp-chips");
      if (row.hasAttribute("data-open"))
        row.removeAttribute("data-open");
      else
        row.setAttribute("data-open", "");
      return;
    }
    const redo = t.closest(".warp-chips [data-redo]");
    if (redo) {
      e.preventDefault();
      confirmRedo(redo);
      return;
    }
    const dismiss = t.closest(".warp-chips [data-dismiss-suggest]");
    if (dismiss) {
      const cid = chatId();
      if (cid)
        send({ type: "dismiss_suggestion", chatId: cid, messageId: dismiss.dataset.dismissSuggest });
      return;
    }
    const undo = t.closest(".warp-chips [data-undo]");
    if (undo) {
      const row = undo.closest("[data-warp-chips]");
      const messageId = row?.dataset.warpChips;
      const rec = state?.records.find((r) => r.messageId === messageId);
      const cid = chatId();
      if (rec && cid)
        send({ type: "undo", chatId: cid, messageId: rec.messageId, swipe: rec.swipe, events: undo.dataset.undo.split(",").map(Number) });
    }
  };
  document.addEventListener("click", onDocClick, true);
  cleanups.push(() => document.removeEventListener("click", onDocClick, true));
  const onKey = (e) => {
    if (!settings.hotkeys || e.ctrlKey || e.metaKey || e.altKey)
      return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))
      return;
    if (!/^[0-9]$/.test(e.key) || !state?.choices.length || !choicesEl?.isConnected)
      return;
    const n = e.key === "0" ? 10 : Number(e.key);
    const c = state.choices[n - 1];
    if (!c)
      return;
    e.preventDefault();
    act(c.id);
  };
  document.addEventListener("keydown", onKey);
  cleanups.push(() => document.removeEventListener("keydown", onKey));
  cleanups.push(ctx.onBackendMessage((raw) => {
    const m = raw;
    switch (m.type) {
      case "state": {
        const active = chatId();
        if (m.chatId && active && m.chatId !== active)
          return;
        if (state?.chatId !== m.chatId) {
          editingBar = null;
          lastBars = new Map;
        }
        state = m;
        if (m.chatId === busy.chatId && !m.busy && busy.label === "Rolling…")
          busy = { chatId: "", on: false, label: "" };
        if (m.busy && m.chatId)
          busy = { chatId: m.chatId, on: true, label: busy.label };
        renderAll();
        break;
      }
      case "busy":
        busy = { chatId: m.chatId, on: m.busy, label: m.busy ? m.label ?? busy.label ?? "" : "" };
        placeChoices(true);
        break;
      case "settings":
        settings = m.settings;
        templates = m.templates;
        connections = m.connections;
        jevKeySet = m.jevKeySet;
        renderAll();
        break;
      case "command":
        if (m.command === "install")
          confirmReplace();
        else {
          drawerView = "sheet";
          tab.activate();
        }
        break;
      case "toast":
        console.info(`[warp] ${m.message}`);
        break;
    }
  }));
  send({ type: "hello", chatId: chatId() });
  let lastChat = chatId();
  const poll = setInterval(() => {
    const now = chatId();
    if (now !== lastChat) {
      lastChat = now;
      send({ type: "refresh", chatId: now });
    }
  }, 1000);
  cleanups.push(() => clearInterval(poll));
  const cleanup = () => {
    for (const { el } of chipEls.values())
      ctx.dom.uninject(el);
    if (choicesEl)
      ctx.dom.uninject(choicesEl);
    for (const c of cleanups.reverse()) {
      try {
        c();
      } catch {}
    }
  };
  globalThis[CLEANUP_KEY] = cleanup;
  return cleanup;
}
export {
  setup
};
