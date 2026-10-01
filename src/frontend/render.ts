// Pure view → HTML renderers. Every interpolated string goes through `esc`.

import type {
  ChoiceView, EncounterLogView, HudView, MapView, RoundCardView, RecordView, RulesetStatus, Settings, SuggestionView, TemplateInfo,
} from "../shared/protocol.js";

export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const PHASE_ICON: Record<string, string> = { morning: "🌅", afternoon: "☀️", evening: "🌇", night: "🌙" };

function pctTone(p: number): "good" | "warn" | "bad" {
  return p >= 0.66 ? "good" : p >= 0.33 ? "warn" : "bad";
}

// ───────────────────────── HUD ─────────────────────────

/** One of the HUD's sections: it can sit in the main window or be torn off into a panel of its own. */
export interface HudPart { id: string; title: string; count: number; body: string; open: boolean }

export interface HudOpts { editing: string | null; compact: boolean; map?: MapView | null }

/** The HUD in full: the head (clock, place, bars) and every section, in order. */
export function renderHud(h: HudView, opts: HudOpts): string {
  const { head, parts } = hudParts(h, opts);
  return head + parts.map((p) => renderPart(p)).join("");
}

/** A section; `movable` ones can be dragged out into a window of their own. */
export const renderPart = (p: HudPart, movable = false) => section(p.title, p.count, p.body, p.open, p.id, movable);

/** The HUD split into its fixed head and its movable sections. */
export function hudParts(h: HudView, opts: HudOpts): { head: string; parts: HudPart[] } {
  const top = [
    `<div class="warp-eyebrow"><span>${esc(h.rulesetName)}</span><span title="Turn">T${h.turn}</span></div>`,
    h.clock ? `<div class="warp-clock"><span class="warp-phase" aria-hidden="true">${PHASE_ICON[h.clock.phase] ?? ""}</span><span class="warp-clock-time">${esc(h.clock.time)}</span><span class="warp-clock-day">${esc(h.date ?? h.clock.day)}</span></div>` : "",
    h.weather ? `<div class="warp-weather">${esc(h.weather.icon)} ${esc(h.weather.label)} · <b>${esc(h.weather.temp)}°C</b>${h.weather.season ? ` · ${esc(h.weather.season)}` : ""}</div>` : "",
    h.location || h.money ? `<div class="warp-where">${h.location ? `<span title="${esc(h.location.desc ?? "")}">📍 <b>${esc(h.location.name)}</b></span>` : ""}${h.money ? `<span class="warp-money">${esc(h.money)}</span>` : ""}</div>` : "",
    h.conditions.length ? `<div class="warp-pills">${h.conditions.map((c) => `<span class="warp-pill warp-tone-${c.tone}" title="${esc(c.desc ?? "")}">${esc(c.label)}${c.remaining ? ` · ${esc(c.remaining)}` : ""}</span>`).join("")}</div>` : "",
  ].join("");

  const bars = h.bars.map((b) => {
    const editing = opts.editing === b.id;
    return `<div class="warp-bar" data-bar="${esc(b.id)}" title="${esc(`${b.label}: ${b.display}${b.desc ? ` — ${b.desc}` : ""}\nClick to adjust`)}">
      <div class="warp-bar-head"><span class="warp-bar-label">${esc(b.label)}</span><span class="warp-bar-text warp-tone-${b.tone}">${esc(b.text ?? b.display)}</span></div>
      <div class="warp-bar-track"><div class="warp-bar-fill warp-bg-${b.tone}" style="width:${(b.pct * 100).toFixed(1)}%${b.color ? `;background:${esc(b.color)}` : ""}"></div></div>
      ${editing ? (() => {
        const step = b.max - b.min > 200 ? 1 : b.max - b.min > 20 ? 0.5 : 0.1;
        const v = Math.round(b.value * 10) / 10;
        return `<div class="warp-bar-edit">
          <input type="range" min="${b.min}" max="${b.max}" step="${step}" value="${v}" data-range="${esc(b.id)}" aria-label="${esc(b.label)}">
          <input class="warp-input" type="number" min="${b.min}" max="${b.max}" step="${step}" value="${v}" data-num="${esc(b.id)}" aria-label="${esc(b.label)} value">
          <span class="warp-dim warp-of">/ ${esc(b.max)}</span>
          <button class="warp-btn warp-btn-primary" data-save="${esc(b.id)}">Set</button>
        </div>`;
      })() : ""}
    </div>`;
  }).join("");

  const skills: HudPart | null = h.skills.length ? part("skills", "Skills & attributes", h.skills.length, h.skills.map((s) => `
    <div class="warp-skill" title="${esc(`${s.label}: ${s.display}${s.text ? ` — ${s.text}` : ""}${s.practice !== null ? `\nPractice toward the next point: ${Math.round(s.practice * 100)}% — it grows every time you use it` : ""}`)}">
      <span>${esc(s.label)}</span>
      <span class="warp-grade ${s.grade ? `warp-tone-${pctTone(s.pct)}` : ""}">${esc(s.grade ?? s.display)}</span>
      <div class="warp-skill-tracks">
        <div class="warp-mini-track"><div class="warp-mini-fill" style="width:${(s.pct * 100).toFixed(1)}%"></div></div>
        ${s.practice !== null ? `<div class="warp-practice-track"><div class="warp-practice-fill" style="width:${(s.practice * 100).toFixed(1)}%"></div></div>` : ""}
      </div>
    </div>`).join(""), !opts.compact) : null;

  // Who's in the scene comes first; everyone else waits, folded, under "Elsewhere".
  const here = h.people.filter((p) => p.present);
  const away = h.people.filter((p) => !p.present);
  const personRow = (p: HudView["people"][number]) => `
    <div class="warp-person${p.present ? " warp-person-here" : ""}">
      <div class="warp-person-name">${esc(p.name)}${p.present ? ` <span class="warp-here">here</span>` : p.whereabouts ? ` <span class="warp-dim">· ${esc(p.whereabouts)}</span>` : ""}${opts.compact ? "" : ` <button class="warp-btn warp-btn-ghost warp-forget" data-forget="${esc(p.id)}" data-name="${esc(p.name)}" title="Stop tracking ${esc(p.name)}">Forget</button>`}</div>
      ${p.goal || p.bonds.length ? `<div class="warp-person-stats">${p.goal ? `<span>Wants: ${esc(p.goal)}</span>` : ""}${p.bonds.length ? `<span>${esc(p.bonds.join(", "))}</span>` : ""}</div>` : ""}
      <div class="warp-person-stats">${p.stats.map((s) => `<span class="warp-rel" data-rel="${esc(`${p.id}:${s.id}`)}" title="${esc(`${s.label}: ${s.display} (${s.min}–${s.max}) — click to set`)}">${esc(s.label)}: <span class="warp-tone-${s.tone}">${esc(s.text ?? s.display)}</span></span>`).join("")}</div>
      ${p.stats.filter((s) => opts.editing === `rel:${p.id}:${s.id}`).map((s) => `<div class="warp-bar-edit">
        <span class="warp-dim">${esc(s.label)}</span>
        <input type="range" min="${s.min}" max="${s.max}" step="1" value="${Math.round(s.value)}" data-range="rel" aria-label="${esc(s.label)}">
        <input class="warp-input" type="number" min="${s.min}" max="${s.max}" value="${Math.round(s.value)}" data-num="rel" aria-label="${esc(s.label)} value">
        <button class="warp-btn warp-btn-primary" data-save-rel="${esc(`${p.id}:${s.id}`)}">Set</button>
      </div>`).join("")}
    </div>`;
  const people = part("people", here.length ? "People here" : "People", here.length, h.people.length
    ? `${here.length ? here.map(personRow).join("") : `<div class="warp-empty">No one you know is here.</div>`}${away.length
      ? `<details class="warp-away" data-section="people-away"><summary>Elsewhere · ${away.length}</summary><div class="warp-section-body">${away.map(personRow).join("")}</div></details>`
      : ""}`
    : `<div class="warp-empty">No one yet.</div>`, !opts.compact || here.length > 0);

  const body = h.body ? part("body", "Body", 0, `${h.body.map((b) => `<div class="warp-item"><span>${esc(b.label)}</span><span class="${b.covered ? "warp-dim" : ""}" title="${b.covered ? "Covered by clothing" : "Visible"}">${esc(b.text)}${b.covered ? " 👕" : ""}</span></div>`).join("")}${h.transforms.map((t) => `<div class="warp-item"><span>✦ ${esc(t.label)}</span><span class="warp-dim">stage ${t.stage} / ${t.of}</span></div>`).join("")}`, false) : null;

  const dues = h.dues.length ? part("bills", "Bills", h.dues.filter((d) => d.tone === "bad").length, h.dues.map((d) => `<div class="warp-item"><span>${esc(d.label)}${d.owed > 0 ? ` <span class="warp-dim">${esc(h.money?.replace(/[\d.,]+/, "") ?? "")}${esc(d.owed)}</span>` : ""}</span><span class="warp-tone-${d.tone}">${esc(d.text)}</span></div>`).join(""), !opts.compact || h.dues.some((d) => d.tone === "bad")) : null;
  const family = h.family.length ? part("family", "Family", h.family.length, h.family.map((f) => `<div class="warp-item"><span>${esc(f.name)}</span><span class="warp-dim">${esc(f.text)}</span></div>`).join(""), !opts.compact) : null;

  const loose = h.items.filter((i) => !i.worn);
  const items = part("inventory", "Inventory", loose.length, loose.length
    ? loose.map((i) => `<div class="warp-item${i.use ? " warp-item-usable" : ""}">
        <span class="warp-item-name">${esc(i.name)}${i.uses ? ` <span class="warp-dim" title="Uses left in the one in hand">· ${esc(i.uses)}</span>` : ""}${i.bonus ? `<span class="warp-item-bonus" title="Gear: added to checks that use it">${esc(i.bonus)}</span>` : ""}</span>
        <span class="warp-item-side">${i.count > 1 ? `<span class="warp-kbd">×${i.count}</span>` : ""}${i.use
          ? i.use.locked
            ? `<button class="warp-btn warp-mini" disabled title="${esc(i.use.locked)}">🔒 Use</button>`
            : `<button class="warp-btn warp-mini" data-use="${esc(i.use.id)}" title="${esc(`${i.use.label}${i.use.drafted ? "\nWarp drafted what this does from its description — check it in the Ruleset tab" : ""}`)}">${i.use.drafted ? "✎ " : ""}Use</button>`
          : ""}</span>
      </div>`).join("")
    : `<div class="warp-empty">Empty-handed.</div>`, !opts.compact);

  const map = opts.map ? part("map", "Map", 0, renderMapView(opts.map), !opts.compact) : null;
  return {
    head: `${renderEncounter(h)}<div class="warp-hud-top">${top}</div>${renderWarmth(h)}<div class="warp-bars">${bars}</div>`,
    parts: [renderOutfit(h, opts.compact), skills, dues, people, map, family, body, items, renderPerks(h, opts.compact)].filter((p): p is HudPart => !!p),
  };
}

function renderEncounter(h: HudView): string {
  const e = h.encounter;
  if (!e) return "";
  return `<div class="warp-encounter">
    <div class="warp-eyebrow"><span>⚔ ${esc(e.name)}</span><span>Round ${e.round + 1}</span></div>
    <div class="warp-encounter-foe">${esc(e.foe)}</div>
    ${e.momentum !== null ? `<div class="warp-bar-head"><span>You</span><span class="warp-dim">Momentum</span><span>${esc(e.foe)}</span></div>
      <div class="warp-momentum" title="Momentum ${Math.round(e.momentum)} — a full swing either way ends the fight"><div class="warp-momentum-mid"></div><div class="warp-momentum-mark" style="left:${((100 - e.momentum) / 2).toFixed(1)}%"></div></div>` : ""}
    ${e.stats.map((s) => `<div class="warp-bar-head"><span>${esc(s.label)}</span><span class="warp-dim">${esc(Math.round(s.value))} / ${esc(s.max)}</span></div>
      <div class="warp-bar-track"><div class="warp-bar-fill warp-bg-${s.tone}" style="width:${(s.pct * 100).toFixed(1)}%"></div></div>`).join("")}
  </div>`;
}

/** Warmth gauge: the comfortable range as a band, your warmth as a marker. */
function renderWarmth(h: HudView): string {
  const w = h.warmth;
  if (!w) return "";
  const scale = Math.max(30, w.max + 6, w.value + 4);
  const at = (v: number) => `${Math.max(0, Math.min(100, (v / scale) * 100)).toFixed(1)}%`;
  return `<div class="warp-warmth" title="${esc(`Clothing warmth ${w.value} · comfortable between ${w.min} and ${w.max}`)}">
    <div class="warp-bar-head"><span class="warp-bar-label">Warmth</span><span class="warp-bar-text warp-tone-${w.tone}">${esc(w.text)}</span></div>
    <div class="warp-warmth-track">
      <div class="warp-warmth-band" style="left:${at(w.min)};width:calc(${at(w.max)} - ${at(w.min)})"></div>
      <div class="warp-warmth-mark warp-bg-${w.tone}" style="left:${at(w.value)}"></div>
    </div>
  </div>`;
}

const part = (id: string, title: string, count: number, body: string, open: boolean): HudPart => ({ id, title, count, body, open });

function renderOutfit(h: HudView, compact: boolean): HudPart | null {
  if (!h.outfit) return null;
  const rows = h.outfit.map((o) => {
    const options = h.clothing.filter((c) => c.slot === o.slot && c.id !== o.item?.id);
    const status = o.item
      ? `${esc(o.item.name)}${o.item.integrity !== null ? ` <span class="warp-tone-${o.item.integrity < 40 ? "bad" : "warn"}">${o.item.integrity}%</span>` : ""}`
      : `<span class="warp-dim">${h.exposed.includes(o.slot) ? "<span class='warp-tone-bad'>nothing</span>" : "—"}</span>`;
    const picker = options.length || o.item
      ? `<select class="warp-select warp-mini-select" data-wear-slot="${esc(o.slot)}" aria-label="Change ${esc(o.label)}">
          <option value="" selected disabled>Change…</option>
          ${options.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (warmth ${esc(c.warmth)}${c.traits.length ? `, ${esc(c.traits.join(", "))}` : ""})</option>`).join("")}
          ${o.item ? `<option value="__off">Take off</option>` : ""}
        </select>`
      : "";
    return `<div class="warp-outfit-row"><span class="warp-dim">${esc(o.label)}</span><span>${status}</span>${picker}</div>`;
  }).join("");
  const worn = h.outfit.filter((o) => o.item).length;
  return part("outfit", "Outfit", worn, rows, !compact);
}

function renderPerks(h: HudView, compact: boolean): HudPart | null {
  if (!h.perks.length) return null;
  const rows = h.perks.map((p) => `<div class="warp-perk${p.owned ? " warp-perk-owned" : ""}">
      <div><b>${esc(p.name)}</b> <span class="warp-dim">${esc(p.desc)}</span></div>
      ${p.owned ? `<span class="warp-tone-good">✓</span>` : p.blocker ? `<span class="warp-dim" title="${esc(p.blocker)}">${esc(p.cost)} pt</span>` : `<button class="warp-btn warp-mini" data-buy-perk="${esc(p.id)}">Take · ${esc(p.cost)} pt</button>`}
    </div>`).join("");
  const label = h.perkPoints !== null ? `Perks · ${h.perkPoints} point${h.perkPoints === 1 ? "" : "s"}` : "Perks";
  return part("perks", label, 0, rows, !compact && (h.perkPoints ?? 0) > 0);
}

// ───────────────────────── map ─────────────────────────

/** The map: scroll to zoom, drag to look around, click a lit place next to you to go there. */
export function renderMapView(m: MapView): string {
  if (!m.nodes.length) return `<div class="warp-empty">No places yet.</div>`;
  const xs = m.nodes.map((n) => n.x), ys = m.nodes.map((n) => n.y);
  const pad = 70;
  const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - minX + pad, hgt = Math.max(...ys) - minY + pad;
  const byId = new Map(m.nodes.map((n) => [n.id, n]));
  const edges = m.edges.map(([a, b]) => {
    const p = byId.get(a), q = byId.get(b);
    return p && q ? `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" class="warp-map-edge" />` : "";
  }).join("");
  const nodes = m.nodes.map((n) => `
    <g class="warp-map-node${n.here ? " here" : ""}${n.reachable ? " reachable" : ""}" ${n.reachable ? `data-go="${esc(n.id)}" tabindex="0" role="button" aria-label="Go to ${esc(n.name)}"` : ""}>
      <title>${esc(n.reachable ? `Go to ${n.name}` : n.name)}</title>
      <circle cx="${n.x}" cy="${n.y}" r="${n.here ? 13 : 10}" />
      <text x="${n.x}" y="${n.y + 26}" text-anchor="middle">${esc(n.name)}</text>
      ${n.people.length ? `<text x="${n.x}" y="${n.y + 40}" text-anchor="middle" class="warp-map-people">${esc(n.people.join(", "))}</text>` : ""}
      ${n.indoors ? `<text x="${n.x}" y="${n.y + 4}" text-anchor="middle" class="warp-map-icon">⌂</text>` : ""}
    </g>`).join("");
  const here = m.nodes.find((n) => n.here);
  const base = `${minX} ${minY} ${w} ${hgt}`;
  return `<div class="warp-map-view" data-map="${esc(base)}"${here ? ` data-map-here="${here.x} ${here.y}"` : ""}>
    <svg class="warp-map" viewBox="${base}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map">${edges}${nodes}</svg>
    <div class="warp-map-tools">
      <button class="warp-map-tool" type="button" data-map-zoom="in" title="Zoom in" aria-label="Zoom in">+</button>
      <button class="warp-map-tool" type="button" data-map-zoom="out" title="Zoom out" aria-label="Zoom out">−</button>
      <button class="warp-map-tool" type="button" data-map-zoom="here" title="Centre on where you are" aria-label="Centre on where you are">◎</button>
    </div>
  </div>
  <p class="warp-dim warp-map-hint">Scroll to zoom, drag to look around. Click a lit place next to you to go there.</p>`;
}

// ───────────────────────── journal ─────────────────────────

export function renderJournal(h: HudView | null, records: RecordView[]): string {
  if (!h) return `<div class="warp-card"><p>No game running in this chat.</p></div>`;
  const byCat = new Map<string, HudView["codex"]>();
  for (const c of h.codex) byCat.set(c.category ?? "Notes", [...(byCat.get(c.category ?? "Notes") ?? []), c]);
  const codex = h.codexTotal
    ? `<div class="warp-card"><h3>Codex <span class="warp-dim">${h.codex.length} / ${h.codexTotal}</span></h3>
        ${h.codex.length ? [...byCat].map(([cat, list]) => `<div class="warp-choice-group-label">${esc(cat)}</div>${list.map((c) => `<details class="warp-codex"><summary>${esc(c.title)}</summary><p>${esc(c.text)}</p></details>`).join("")}`).join("") : `<p>Nothing discovered yet.</p>`}
      </div>`
    : "";
  const feats = h.feats.length
    ? `<div class="warp-card"><h3>Feats <span class="warp-dim">${h.feats.filter((f) => f.unlocked).length} / ${h.feats.length}</span></h3>
        ${h.feats.map((f) => `<div class="warp-feat${f.unlocked ? " unlocked" : ""}"><span>${f.unlocked ? "🏆" : "🔒"}</span><div><b>${esc(f.name)}</b><div class="warp-dim">${esc(f.desc)}</div></div></div>`).join("")}
      </div>`
    : "";
  const news = h.news.length
    ? `<div class="warp-card"><h3>News</h3>
        ${h.news.map((n) => `<div class="warp-news-row">${n.when ? `<span class="warp-dim">${esc(n.when)}</span>` : ""}<span>${esc(n.text)}</span></div>`).join("")}
      </div>`
    : "";
  const turns = records.filter((r) => r.action || r.check || r.changes.length).slice().reverse().slice(0, 40);
  const timeline = `<div class="warp-card"><h3>Timeline</h3>
    ${turns.length ? turns.map((r) => `<button class="warp-timeline-row" data-jump="${esc(r.messageId)}" title="Jump to this message">
        <span class="warp-dim">${esc(r.clock ?? "")}</span>
        <span>${r.action ? esc(r.action) : "<span class='warp-dim'>Story</span>"}${r.check ? ` · <span class="warp-tone-${r.check.tier.includes("success") ? "good" : r.check.tier === "partial" ? "warn" : "bad"}">${esc(r.check.tierLabel)}</span>` : ""}</span>
        <span class="warp-dim warp-timeline-changes">${esc(r.changes.slice(0, 4).map((c) => c.text).join(" · "))}</span>
      </button>`).join("") : `<p>Nothing has happened yet.</p>`}
  </div>`;
  return checkpoints(h) + news + codex + feats + timeline;
}

function checkpoints(h: HudView): string {
  const run = h.run;
  if (!run) return "";
  const ended = run.ended
    ? `<div class="warp-run-end warp-tone-${run.ended.kind === "good" ? "good" : run.ended.kind === "bad" ? "bad" : "neutral"}"><b>The end: ${esc(run.ended.title)}</b>${run.ended.text ? `<div class="warp-dim">${esc(run.ended.text)}</div>` : ""}</div>`
    : "";
  const row = (id: string, name: string, label: string | null, canSave: boolean) => `<div class="warp-run-slot">
      <span class="warp-run-slot-name">${esc(name)}</span>
      <span class="warp-run-slot-label${label ? "" : " warp-dim"}">${esc(label ?? "Empty")}</span>
      ${label ? `<button class="warp-btn warp-mini" data-run="run:load:${esc(id)}">Load</button>` : ""}
      ${canSave ? `<button class="warp-btn warp-mini" data-run="run:save:${esc(id)}">${label ? "Overwrite" : "Save"}</button>` : ""}
    </div>`;
  return `<div class="warp-card"><h3>Checkpoints <span class="warp-dim">${run.runs > 1 ? `playthrough ${run.runs}` : ""}${run.loops ? ` · rewound ${run.loops}×` : ""}</span></h3>
    ${ended}
    ${run.slots.map((sl) => row(sl.id, `Slot ${sl.id}`, sl.label, !run.ended)).join("")}
    ${run.auto ? row("auto", "Auto", run.auto, false) : ""}
    <div class="warp-row">
      <button class="warp-btn warp-mini" data-run="run:load:start">Rewind to the start</button>
      <button class="warp-btn warp-mini" data-run="run:restart">Start a new playthrough</button>
      ${run.ended && !run.hard ? `<button class="warp-btn warp-mini" data-run="run:continue">Keep playing</button>` : ""}
    </div>
    <p class="warp-dim">Loading keeps: ${esc(run.keeps)}. A new playthrough carries over: ${esc(run.legacy)}.</p>
  </div>`;
}

function section(title: string, count: number, body: string, open: boolean, key = title, movable = false): string {
  return `<details class="warp-section" data-section="${esc(key)}"${open ? " open" : ""}><summary${movable ? ` data-part="${esc(key)}" title="Hold and drag out to give it a window of its own"` : ""}><span>${esc(title)}${count ? ` · ${count}` : ""}</span></summary><div class="warp-section-body">${body}</div></details>`;
}

// ───────────────────────── choices ─────────────────────────

export function renderChoices(choices: ChoiceView[], opts: { showOdds: boolean; hotkeys: boolean; busy: boolean; busyLabel?: string; encounter?: HudView["encounter"]; recap?: EncounterRecap | null }): string {
  if (!choices.length && !opts.busy && !opts.encounter) return "";
  const groups = new Map<string, { c: ChoiceView; n: number }[]>();
  choices.forEach((c, i) => {
    const g = c.group ?? "Actions";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push({ c, n: i + 1 });
  });
  const body = [...groups].map(([g, list]) => `
    <div class="warp-choice-group">
      ${groups.size > 1 ? `<div class="warp-choice-group-label">${esc(g)}</div>` : ""}
      <div class="warp-choice-grid">${list.map(({ c, n }) => {
        const key = opts.hotkeys && n <= 10 ? `<span class="warp-kbd">${n === 10 ? 0 : n}</span>` : "";
        const odds = opts.showOdds && c.odds !== null
          ? `<span class="warp-choice-odds warp-tone-${pctTone(c.odds + (c.partialOdds ?? 0) / 2)}" title="${esc(`${c.checkLabel ?? "Check"}: ${Math.round(c.odds * 100)}% success${c.partialOdds ? `, ${Math.round(c.partialOdds * 100)}% partial` : ""}`)}">${Math.round(c.odds * 100)}%</span>`
          : "";
        const tip = [c.desc, c.why ? `Why now: ${c.why}` : null, c.checkLabel ? `Check: ${c.checkLabel} — the chance of this check, not of winning` : null, c.veiled ? "Veiled: happens off-screen" : null].filter(Boolean).join("\n");
        if (c.locked) return `<button class="warp-choice warp-choice-locked" disabled title="${esc(`${c.desc ?? c.label}\nLocked: ${c.locked}`)}"><span class="warp-choice-label">${esc(c.label)}<span class="warp-choice-why">🔒 ${esc(c.locked)}</span></span></button>`;
        return `<button class="warp-choice${c.id.startsWith("item:") ? " warp-choice-item" : ""}" data-act="${esc(c.id)}" title="${esc(tip)}${c.ready ? "\nReady — this reply is already written" : ""}">${key}<span class="warp-choice-label">${esc(c.label)}${c.why ? `<span class="warp-choice-why">${esc(c.why)}</span>` : ""}</span>${c.ready ? `<span class="warp-choice-ready" aria-label="instant">⚡</span>` : ""}${c.veiled ? `<span class="warp-choice-veil" aria-label="veiled">◐</span>` : ""}${odds}</button>`;
      }).join("")}</div>
    </div>`).join("");
  const status = opts.busy ? `<div class="warp-status-line"><span class="warp-spinner"></span>${esc(opts.busyLabel ?? "The story continues…")}</div>` : "";
  return `${status}${opts.encounter ? renderEncounterGuide(opts.encounter, opts.busy, opts.recap) : ""}${body}`;
}

/** The latest round and every round behind it, for the encounter panel while it's on. */
export interface EncounterRecap { foe: string; rounds: RoundCardView[]; why: string }

/**
 * Above an encounter's moves, in one box: what you're after, how far along,
 * what could end it badly, how the last round went — and a box to try anything else.
 */
export function renderEncounterGuide(e: NonNullable<HudView["encounter"]>, busy: boolean, recap?: EncounterRecap | null): string {
  const meters = e.progress.map((p) => {
    const span = Math.abs(p.max - p.target) || 1;
    const done = Math.max(0, Math.min(1, 1 - Math.abs(p.value - p.target) / span));
    return `<div class="warp-enc-meter" title="${esc(`${p.label}: ${Math.round(p.value)} — get it to ${p.target} (the bar is how close you are)`)}"><span>${esc(p.label)}</span><div class="warp-bar-track"><div class="warp-bar-fill warp-bg-good" style="width:${(done * 100).toFixed(1)}%"></div></div><span class="warp-dim">${esc(Math.round(p.value))} → ${esc(p.target)}</span></div>`;
  });
  if (e.momentum !== null) meters.push(`<div class="warp-enc-meter" title="Momentum: a full swing either way ends it"><span>Momentum</span><div class="warp-momentum"><div class="warp-momentum-mid"></div><div class="warp-momentum-mark" style="left:${((e.momentum + 100) / 2).toFixed(1)}%"></div></div><span class="warp-dim">${e.momentum > 0 ? "+" : ""}${esc(Math.round(e.momentum))}</span></div>`);
  const danger = e.danger.slice(0, 2).map((d) => `<span class="warp-tone-${d.close ? "bad" : "warn"}">${esc(d.text)}</span>`).join(`<span class="warp-dim"> · </span>`);
  const last = recap?.rounds[recap.rounds.length - 1];
  return `<div class="warp-enc-guide" role="group" aria-label="${esc(e.name)}">
    <div class="warp-enc-head"><span>⚔ ${esc(e.name)} <span class="warp-dim">vs ${esc(e.foe)}</span></span><span class="warp-dim">Round ${e.round + 1}</span></div>
    ${e.goal ? `<div class="warp-enc-goal"><b>Goal</b> ${esc(e.goal)}</div>` : ""}
    ${meters.length ? `<div class="warp-enc-meters">${meters.join("")}</div>` : ""}
    ${danger ? `<div class="warp-enc-danger"${e.dangerText ? ` title="${esc(e.dangerText)}"` : ""}><b>Danger</b> ${danger}</div>` : ""}
    ${last && recap ? `<div class="warp-enc-last"><div class="warp-enc-last-head"><b>Last round</b>${recap.rounds.length > 1 ? roundsList(recap.rounds, recap.foe) : ""}${recap.why}</div>${renderRoundCard(last, recap.foe, true)}</div>` : ""}
    ${e.quiet ? `<div class="warp-enc-say"><input type="text" class="warp-input" data-enc-say placeholder="Or try something else…" aria-label="Try something else" maxlength="400"${busy ? " disabled" : ""}><button class="warp-btn" data-enc-send${busy ? " disabled" : ""}>Try</button></div>` : ""}
  </div>`;
}

const TIER_MARK: Record<string, string> = { "great success": "✓✓", success: "✓", partial: "~", failed: "✕", "badly failed": "✕✕" };

/** "Aggression +20": what a round moved, as a change (the panel shows where things stand). */
function roundChange(c: RoundCardView["changes"][number]): string {
  const d = Math.round(c.to - c.from);
  if (!d) return "";
  // The foe's stats come as "Foe: Stat"; mark them instead of repeating the name.
  const i = c.label.indexOf(": ");
  const label = i > 0 ? `⚔ ${c.label.slice(i + 2)}` : c.label;
  return `<span class="warp-tone-${c.good ? "good" : "bad"}">${esc(label)} ${d > 0 ? "+" : "−"}${Math.abs(d)}</span>`;
}

/** One round, short: the move and how it went; the other side's answer; what it moved. */
export function renderRoundCard(c: RoundCardView, foe = "", latest = false): string {
  const tone = !c.check ? "neutral" : /success/.test(c.check.tier) ? "good" : c.check.tier === "partial" ? "warn" : "bad";
  const chance = c.check && c.check.odds !== null ? `${Math.round(c.check.odds * 100)}%` : "";
  const tip = c.check ? `${c.check.label}${chance ? `: ${chance} chance this check succeeds (not the chance of winning)` : ""}${c.check.gear.length ? `\nHelped by ${c.check.gear.join(", ")}` : ""}` : "";
  const tier = c.check?.tier ?? "";
  const changes = c.changes.map(roundChange).filter(Boolean);
  return `<div class="warp-round${latest ? " warp-round-latest" : ""}">
    <div class="warp-round-line"><span class="warp-round-n">${c.round}</span><b>${esc(c.move)}</b>${c.check ? ` <span class="warp-tone-${tone}" title="${esc(tip)}">${esc(TIER_MARK[tier] ?? "")} ${esc(tier.charAt(0).toUpperCase() + tier.slice(1))}</span>${chance ? ` <span class="warp-dim" title="${esc(tip)}">${esc(c.check.label)} ${chance}</span>` : ""}${c.check.gear.length ? ` <span class="warp-dim" title="${esc(c.check.gear.join(", "))}">🛠</span>` : ""}` : ""}</div>
    ${c.foe ? `<div class="warp-round-foe"><span class="warp-dim">${esc(foe || "They")}:</span> ${esc(c.foe)}</div>` : ""}
    ${changes.length ? `<div class="warp-round-changes">${changes.join("")}</div>` : ""}
    ${c.ended ? `<div class="warp-round-end warp-tone-${c.ended.loss ? "bad" : "good"}">${c.ended.loss ? "✕" : "✓"} ${esc(c.ended.label)}</div>` : ""}
  </div>`;
}

function roundsList(rounds: RoundCardView[], foe: string): string {
  return `<details class="warp-rounds"><summary>${rounds.length === 1 ? "Show the round" : `All ${rounds.length} rounds`}</summary><div class="warp-rounds-list">${rounds.map((r) => renderRoundCard(r, foe)).join("")}</div></details>`;
}

/** "Why?" for a message: every cause behind each change, folded away. */
export function renderWhyFold(rec: RecordView | undefined): string {
  const whys = (rec?.changes ?? []).filter((ch) => ch.why?.length).map((ch) => `<div><b>${esc(ch.text)}</b> <span class="warp-dim">←</span> ${ch.why!.map(esc).join(" · ")}</div>`);
  return whys.length ? `<details class="warp-enc-why"><summary title="Show what caused each change">Why?</summary><div class="warp-enc-why-body">${whys.join("")}</div></details>` : "";
}

/**
 * Under an encounter's message, in place of the usual chips: how it ended (or
 * the latest round), with every round and the "Why?" one click away. While
 * the encounter is on, the panel above the moves shows this instead.
 */
export function renderEncounterLog(v: EncounterLogView, why = ""): string {
  const mine = v.rounds.slice(v.from);
  if (!mine.length && v.status !== "ended") return "";
  const last = mine[mine.length - 1];
  const head = v.status === "ended" && v.ended
    ? `<div class="warp-round-final warp-tone-${v.ended.loss ? "bad" : "good"}"><b>⚔ ${esc(v.name)}: ${esc(v.ended.label)}</b> <span class="warp-dim">after ${v.rounds.length} round${v.rounds.length === 1 ? "" : "s"}</span></div>`
    : last ? renderRoundCard(last, v.foe, true) : "";
  const more = v.rounds.length > 1 || (v.status === "ended" && v.rounds.length) ? roundsList(v.rounds, v.foe) : "";
  return `<div class="warp-enc-log">${head}${more || why ? `<div class="warp-enc-log-foot">${more}${why}</div>` : ""}</div>`;
}

// ───────────────────────── per-message chips ─────────────────────────

const TIER_TONE: Record<string, string> = { crit_success: "good", success: "good", partial: "warn", fail: "bad", crit_fail: "bad" };

export function renderChips(rec: RecordView, opts: { showDice: boolean }): string {
  const out: string[] = [];
  const read = rec.via === "adjudicator"
    ? `<span class="warp-dim">· read from your message${rec.confidence !== null ? ` (${Math.round(rec.confidence * 100)}% sure)` : ""}</span>`
    : rec.via === "confirmed" ? `<span class="warp-dim">· you confirmed</span>` : "";
  const notAction = rec.redoFrom
    ? `<button class="warp-btn warp-btn-ghost" data-redo="${esc(rec.redoFrom)}" data-redo-action="" title="Redo this turn without a roll">Not an action?</button>`
    : "";
  if (rec.check && opts.showDice) {
    const c = rec.check;
    out.push(`<button class="warp-chip warp-dice warp-tone-${TIER_TONE[c.tier]}" data-dice title="Show the roll">🎲 ${esc(c.label)} · ${esc(c.tierLabel)}</button>`);
    out.push(`<div class="warp-dice-detail">${c.faces.map((f) => `<span class="warp-die" title="d${f.sides}"${f.kept ? "" : " data-dropped"}>${f.value}</span>`).join("")}<span>${esc(c.summary)}</span>${read}${notAction}</div>`);
  } else if (rec.action && opts.showDice) {
    out.push(`<span class="warp-chip">▸ ${esc(rec.action)}</span>${notAction ? `<span class="warp-chip">${notAction}</span>` : ""}`);
  }
  for (const d of rec.decisions) {
    const odds = d.odds.map((o) => `${o.desc} ${Math.round(o.p * 100)}%`).join(" · ");
    out.push(`<span class="warp-chip warp-decision" title="${esc(`${d.ask}\n${odds}\n${d.source === "model" ? "Odds from the decision model; the engine rolled." : "Odds from the ruleset's weights; the engine rolled."}`)}">🎭 ${esc(d.picked)} <span class="warp-dim">${Math.round(d.p * 100)}%</span></span>`);
  }
  if (rec.mind) {
    const m = rec.mind;
    const what = m.kind === "fail" ? "couldn't go through with it" : m.kind === "redirect" ? "did something else" : "it took over";
    out.push(`<span class="warp-chip warp-tone-warn" title="${esc(`You chose: ${m.meant}\n${m.cause}: ${what} (${Math.round(m.chance)}% chance at the time)`)}">🧠 ${esc(m.cause)} — ${esc(what)}</span>`);
  }
  if ((rec.contradiction ?? 0) >= 0.6) {
    out.push(`<span class="warp-chip warp-tone-warn" title="The decision model thinks this reply may contradict the game state (${Math.round(rec.contradiction! * 100)}%). Consider swiping.">⚠ may contradict the state</span>`);
  }
  const whys: string[] = [];
  for (const ch of rec.changes) {
    const narr = ch.src === "narrator" || ch.src === "manual";
    if (ch.why?.length) whys.push(`<div><b>${esc(ch.text)}</b> <span class="warp-dim">←</span> ${ch.why.map(esc).join(" · ")}</div>`);
    const undo = narr && ch.undo?.length
      ? `<button class="warp-chip-undo" data-undo="${esc(ch.undo.join(","))}" title="Undo this change" aria-label="Undo">×</button>`
      : "";
    out.push(`<span class="warp-chip warp-tone-${ch.tone}${narr ? " warp-chip-narr" : ""}" title="${esc(narr ? (ch.src === "manual" ? "You set this" : "Read from the story — click × to undo") : "Applied by the rules")}">${esc(ch.text)}${ch.band ? ` <span class="warp-band">${esc(ch.band)}</span>` : ""}${undo}</span>`);
  }
  if (rec.veiled) out.push(`<span class="warp-chip warp-tone-warn" title="Narrated off-screen by your Veils setting">◐ veiled</span>`);
  if (whys.length) {
    out.push(`<button class="warp-chip warp-why-btn" data-why title="Show what caused each change">Why?</button>`);
    out.push(`<div class="warp-why-detail">${whys.join("")}</div>`);
  }
  return out.join("");
}

/** Shown on the player's message when the referee was only fairly sure: one tap to roll it. */
export function renderSuggestion(s: SuggestionView): string {
  return `<span class="warp-chip warp-suggest">🎲 Roll <b>${esc(s.label)}</b>? <span class="warp-dim">${Math.round(s.confidence * 100)}% sure</span>
    <button class="warp-btn warp-btn-primary warp-mini" data-redo="${esc(s.messageId)}" data-redo-action="${esc(s.actionId)}" data-redo-params="${esc(JSON.stringify(s.params ?? {}))}">Roll it</button>
    <button class="warp-chip-undo" data-dismiss-suggest="${esc(s.messageId)}" title="Dismiss" aria-label="Dismiss">×</button></span>`;
}

// ───────────────────────── ruleset status & setup ─────────────────────────

/** The depth audit, for the Ruleset tab: what doesn't connect yet, and what a fix looks like. */
export function renderDepthCard(s: RulesetStatus): string {
  const d = s.depth;
  if (!d || s.state !== "ok") return "";
  const gaps = d.gaps.filter((g) => g.severity === "gap"), thin = d.gaps.filter((g) => g.severity === "thin");
  const row = (g: NonNullable<RulesetStatus["depth"]>["gaps"][number]) => `<details class="warp-depth-row warp-depth-${g.severity}"><summary>${esc(g.text)}</summary><p class="warp-dim">${esc(g.fix)}</p></details>`;
  return `<div class="warp-card warp-depth">
    <h3>Depth <span class="warp-dim">${d.score} / 100</span></h3>
    <p class="warp-dim">What in these rules doesn't connect to anything yet — items that do nothing, stats nothing reads, encounters with one way through.${d.gaps.length ? "" : " Nothing: every piece is wired in."}</p>
    ${d.drafted.length ? `<p class="warp-depth-drafted">✎ Warp drafted what these items do, from their descriptions: <b>${esc(d.drafted.join(", "))}</b>. They're in the <i>warp-ruleset · item uses</i> entry — edit or delete it freely.</p>` : ""}
    ${gaps.length ? `<div class="warp-choice-group-label">Unfinished · ${gaps.length}</div>${gaps.map(row).join("")}` : ""}
    ${thin.length ? `<div class="warp-choice-group-label">Could do more · ${thin.length}</div>${thin.slice(0, 12).map(row).join("")}${thin.length > 12 ? `<p class="warp-dim">…and ${thin.length - 12} more.</p>` : ""}` : ""}
    ${d.gaps.length ? `<div class="warp-row"><button class="warp-btn warp-btn-primary" data-b="open-deepen">Deepen this ruleset with the builder</button>${gaps.some((g) => g.id.startsWith("item-dead:")) ? `<button class="warp-btn" data-draft-items>Draft item uses</button>` : ""}</div>` : ""}
  </div>`;
}

export function renderRulesetCard(s: RulesetStatus, hasChat: boolean): string {
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
  const head = s.state === "ok"
    ? `<h3>✓ ${esc(s.name)}</h3><p>From ${esc(s.source)}${warns.length ? ` · ${warns.length} note${warns.length > 1 ? "s" : ""}` : ""}</p>`
    : `<h3 class="warp-tone-bad">Ruleset can't run</h3><p>Fix the problems below in the <b>warp-ruleset</b> lorebook, then reload.</p>`;
  const list = [...errors, ...warns].slice(0, 30).map((i) => `
    <div class="warp-issue"><span class="warp-tone-${i.level === "error" ? "bad" : "warn"}">${i.level === "error" ? "✕" : "!"}</span><span>${esc(i.message)}</span><span class="warp-issue-where">${esc(i.where)}</span></div>`).join("");
  return `<div class="warp-card">${head}${list ? `<div class="warp-issues">${list}</div>` : ""}
    <div class="warp-row"><button class="warp-btn" data-reload>Reload</button><button class="warp-btn warp-btn-ghost" data-install>Replace with a template…</button></div>
  </div>`;
}

export function renderTemplatePicker(templates: TemplateInfo[], card: { name: string; track: boolean } | null = null): string {
  const track = card
    ? `<label class="warp-toggle"><span>Track <b>${esc(card.name)}</b> as a character</span><small>${card.track ? "Their relationship with you is tracked from the start." : "This looks like a scenario or narrator card, so its name isn't added as a person. Tick if it really is one character."}</small><input type="checkbox" data-track${card.track ? " checked" : ""}></label>`
    : "";
  return `<div class="warp-modal">
    <p style="margin:0;color:var(--warp-muted)">Pick a starting point. Warp creates a <b>warp-ruleset</b> lorebook on this character, split into readable entries (stats, people, world, actions, rules) that you can edit like any lorebook. It's never sent to the model.</p>
    ${track}
    <button class="warp-card warp-template warp-builder-cta" data-template="__ai"><h3>✨ Build with AI</h3><p>Reads this character's card, asks you a few questions, and drafts a ruleset made for it — previewed and balance-checked before anything is saved.</p></button>
    ${templates.map((t) => `<button class="warp-card warp-template" data-template="${esc(t.id)}"><h3>${esc(t.name)}</h3><p>${esc(t.blurb)}</p></button>`).join("")}
  </div>`;
}

// ───────────────────────── settings ─────────────────────────

function toggle(key: keyof Settings, label: string, hint: string, on: boolean): string {
  return `<label class="warp-toggle"><span>${esc(label)}</span><small>${esc(hint)}</small><input type="checkbox" data-setting="${esc(key)}"${on ? " checked" : ""}></label>`;
}

function renderDecider(s: Settings, jevKeySet: boolean): string {
  const opt = (v: Settings["decider"], label: string) => `<option value="${v}"${s.decider === v ? " selected" : ""}>${label}</option>`;
  const pct = (v: number) => Math.round(v * 100);
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
    <label class="warp-slider">Drafts per reply
      <select class="warp-select" data-setting="drafts">${[1, 2, 3, 4].map((n) => `<option value="${n}"${s.drafts === n ? " selected" : ""}>${n === 1 ? "1 (off)" : `${n} — keep the best`}</option>`).join("")}</select>
      <small class="warp-dim">Extra drafts are written with your chat's connection after each reply; the decision model keeps the one that narrates the outcome best (the others stay as swipes). Costs a generation per extra draft — best with a fast, cheap model.</small>
    </label>
    <label class="warp-slider">Pre-write replies
      <select class="warp-select" data-setting="prewrite">${[0, 1, 2, 3, 4].map((n) => `<option value="${n}"${s.prewrite === n ? " selected" : ""}>${n === 0 ? "Off" : `First ${n} choice${n === 1 ? "" : "s"}`}</option>`).join("")}</select>
      <small class="warp-dim">While you read, the first choices are rolled and written ahead, so clicking one (⚡) is instant. Costs a generation per choice each turn.</small>
    </label>
    <div class="warp-row"><button class="warp-btn" data-test-decider>Test</button></div>
  </div>`;
}

export function renderSettings(s: Settings, status: RulesetStatus | null, connections: { id: string; name: string }[], jevKeySet = false, imageConnections: { id: string; name: string }[] = []): string {
  const tags = new Set([...(status?.tags ?? []), ...s.lines, ...s.veils]);
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
    <h3>Dates, dungeons & encounters</h3>
    <p>Dates and dungeons play full screen as short snippets, off the chat. Encounters are told round by round in one message that grows, then summed up. One line goes into the story when each ends.</p>
    <label class="warp-slider">Lines written by
      <select class="warp-select" data-setting="sceneLines">
        <option value="model"${s.sceneLines === "model" ? " selected" : ""}>The helper model (scripted if it's slow)</option>
        <option value="scripted"${s.sceneLines === "scripted" ? " selected" : ""}>Scripted lines only — instant, free</option>
      </select>
    </label>
    ${toggle("themeDating", "Dating that fits the card", "The built-in topics and outings (films, a café, an arcade…) are rewritten once for the card's setting — a medieval card gets tales and the harvest fair.", s.themeDating)}
    ${status?.state === "ok" ? `<div class="warp-row"><button class="warp-btn warp-mini" data-theme-dating title="Rewrite dating's topics and outings for this card now">Re-theme dating now</button></div>` : ""}
    ${toggle("draftItemUses", "Give useless items a purpose", "Items the rules never use get one drafted from their description (a use or a gear bonus), saved as an editable \"item uses\" lorebook entry.", s.draftItemUses)}
    ${toggle("dateImages", "A picture for each date", "The place, with them in the middle — made once per person and place, then reused.", s.dateImages)}
    <label class="warp-slider">Image connection
      <select class="warp-select" data-setting="imageConnectionId">
        <option value="">Your default image connection</option>
        ${imageConnections.map((c) => `<option value="${esc(c.id)}"${c.id === s.imageConnectionId ? " selected" : ""}>${esc(c.name)}</option>`).join("")}
      </select>
      ${imageConnections.length ? "" : `<small class="warp-dim">No image connections found — add one in Lumiverse, or allow Warp's image permission.</small>`}
    </label>
  </div>
  <div class="warp-card">
    <h3>Effects & sound</h3>
    <label class="warp-slider">Visual effects
      <select class="warp-select" data-setting="fx">
        <option value="full"${s.fx === "full" ? " selected" : ""}>Full — rolls stamped in the chat, hearts, hits, tile flips</option>
        <option value="reduced"${s.fx === "reduced" ? " selected" : ""}>Reduced — colour and banners, no motion</option>
        <option value="off"${s.fx === "off" ? " selected" : ""}>Off</option>
      </select>
    </label>
    <label class="warp-slider">Sound
      <select class="warp-select" data-setting="sfx">
        <option value="games"${s.sfx === "games" ? " selected" : ""}>Dates, dungeons and encounters</option>
        <option value="all"${s.sfx === "all" ? " selected" : ""}>Everywhere (dice in the chat too)</option>
        <option value="off"${s.sfx === "off" ? " selected" : ""}>Off</option>
      </select>
    </label>
    <label class="warp-slider">Volume <input type="range" min="0" max="100" step="5" value="${Math.round(s.sfxVolume * 100)}" data-setting-volume aria-label="Sound volume"> <span class="warp-dim">${Math.round(s.sfxVolume * 100)}%</span></label>
    <p class="warp-dim">Sounds are made live in the browser and start after your first click. Your system's "reduce motion" setting is respected.</p>
  </div>
  <div class="warp-card">
    <h3>Content: lines & veils</h3>
    <p>Click a tag to cycle it: <b>on</b> → <span class="warp-tone-warn">veil</span> (still happens, narrated off-screen) → <span class="warp-tone-bad">line</span> (removed from the game).</p>
    <div class="warp-tags">${tagChips || `<span class="warp-empty">This ruleset doesn't tag any actions.</span>`}</div>
    <div class="warp-row"><input class="warp-input" data-newtag placeholder="Add a tag… (Enter)" style="flex:1"></div>
  </div>`;
}
