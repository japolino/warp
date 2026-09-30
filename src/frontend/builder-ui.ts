// The AI ruleset builder's screens. Pure renderers; the controller in
// frontend.ts owns drafts (typed answers etc.) so pushes don't wipe input.

import type { BuilderAddition, BuilderAnswer, BuilderQuestion, BuilderSession, TemplateInfo } from "../shared/protocol.js";
import { esc, renderChoices, renderHud } from "./render.js";

export interface BuilderDraft {
  answers: Record<string, BuilderAnswer>;
  additions: BuilderAddition[];
  notes: Record<string, string>;
  refine: string;
  base: string;
  creative: boolean;
  connectionId: string;
}

export function emptyDraft(): BuilderDraft {
  return { answers: {}, additions: [], notes: {}, refine: "", base: "", creative: false, connectionId: "" };
}

const KINDS: BuilderAddition["kind"][] = ["skill", "meter", "item", "place", "person", "action", "rule", "other"];
const REFINE_CHIPS = [
  "Make it harder",
  "Make it more forgiving",
  "Add more places to go",
  "Add an encounter that fits the card",
  "Give the main character a daily schedule",
  "Add a skill for something the card mentions",
];

/** Entry point shown on the Ruleset tab when no builder is open. */
export function renderBuilderCta(hasRuleset: boolean, hasChat: boolean): string {
  if (!hasChat) return "";
  return `<div class="warp-card warp-builder-cta">
    <h3>✨ Build with AI</h3>
    <p>Warp reads the card, asks you a few questions, and drafts a ruleset that fits — checked, balance-reviewed and previewed before anything is saved.</p>
    <div class="warp-row">
      <button class="warp-btn warp-btn-primary" data-b="open-build">${hasRuleset ? "Rebuild with AI" : "Build with AI"}</button>
      ${hasRuleset ? `<button class="warp-btn" data-b="open-refine">Refine with AI</button>` : ""}
    </div>
  </div>`;
}

function steps(s: BuilderSession): string {
  const list = s.mode === "refine" ? ["Describe", "Review", "Install"] : ["Read", "Ask", "Review", "Install"];
  const at = s.mode === "refine"
    ? (s.step === "done" ? 2 : 1)
    : s.step === "start" ? 0 : s.step === "questions" ? 1 : s.step === "review" ? 2 : 3;
  return `<ol class="warp-steps">${list.map((l, i) => `<li class="${i < at ? "done" : i === at ? "now" : ""}">${esc(l)}</li>`).join("")}</ol>`;
}

function question(q: BuilderQuestion, a: BuilderAnswer | undefined): string {
  const val = a ?? q.default;
  const why = q.why ? `<div class="warp-dim warp-q-why">${esc(q.why)}</div>` : "";
  let body = "";
  if (q.kind === "single" || q.kind === "multi") {
    const chosen = new Set(Array.isArray(val) ? val : val !== undefined ? [String(val)] : []);
    body = `<div class="warp-tags">${(q.options ?? []).map((o) => `<button class="warp-tag warp-opt" data-bq="${esc(q.id)}" data-bq-kind="${q.kind}" data-bq-opt="${esc(o.id)}" aria-pressed="${chosen.has(o.id)}">${esc(o.label)}</button>`).join("")}</div>`;
  } else if (q.kind === "scale") {
    const v = typeof val === "number" ? val : Number(val ?? 3);
    const labels = q.options ?? [];
    body = `<input type="range" min="1" max="5" step="1" value="${v}" data-bq="${esc(q.id)}" data-bq-kind="scale" class="warp-scale" aria-label="${esc(q.text)}">
      <div class="warp-scale-labels">${labels.map((o) => `<span>${esc(o.label)}</span>`).join("")}</div>`;
  } else {
    body = `<textarea class="warp-input" rows="2" data-bq="${esc(q.id)}" data-bq-kind="text" placeholder="Your answer…">${esc(typeof val === "string" ? val : "")}</textarea>`;
  }
  return `<div class="warp-q${q.core ? " core" : ""}"><div class="warp-q-text">${esc(q.text)}</div>${why}${body}</div>`;
}

function additions(d: BuilderDraft): string {
  const rows = d.additions.map((a, i) => `<div class="warp-add-row">
      <input class="warp-input" value="${esc(a.name)}" placeholder="Name (e.g. Cooking)" data-badd="${i}" data-badd-field="name">
      <select class="warp-select" data-badd="${i}" data-badd-field="kind">${KINDS.map((k) => `<option value="${k}"${a.kind === k ? " selected" : ""}>${k}</option>`).join("")}</select>
      <input class="warp-input" value="${esc(a.note)}" placeholder="How it should work (optional)" data-badd="${i}" data-badd-field="note">
      <button class="warp-btn warp-btn-ghost" data-b="add-remove" data-i="${i}" aria-label="Remove">×</button>
    </div>`).join("");
  return `<div class="warp-card">
    <h3>Add your own</h3>
    <p>Skills, meters, items, places, people, actions or rules you want in — in your own words. They'll be built in properly.</p>
    ${rows}
    <div class="warp-row"><button class="warp-btn" data-b="add-row">+ Add something</button></div>
  </div>`;
}

export function renderBuilder(s: BuilderSession, d: BuilderDraft, templates: TemplateInfo[], connections: { id: string; name: string }[], hasRuleset: boolean): string {
  const busy = !!s.busy;
  const dis = busy ? " disabled" : "";
  const head = `<div class="warp-builder-head">
      <div><div class="warp-eyebrow"><span>✨ ${s.mode === "refine" ? "Refine" : "Build"} with AI</span></div><b>${esc(s.characterName)}</b></div>
      <button class="warp-btn warp-btn-ghost" data-b="close" title="Close the builder (discards the draft)" aria-label="Close">×</button>
    </div>${steps(s)}`;
  const status = busy
    ? `<div class="warp-card warp-busy-card"><div class="warp-status-line"><span class="warp-spinner"></span>${esc(s.busy!)}</div><p>This can take a minute — you can keep chatting; the drawer will update when it's done.</p></div>`
    : s.error ? `<div class="warp-card warp-error-card"><p class="warp-tone-bad">${esc(s.error)}</p></div>` : "";

  let body = "";
  if (s.step === "start") {
    body = `<div class="warp-card">
      <h3>How should it build?</h3>
      <label class="warp-field"><span>Starting point</span>
        <select class="warp-select" data-bset="base">
          <option value=""${!d.base ? " selected" : ""}>Let the AI pick after reading the card</option>
          ${templates.map((t) => `<option value="${esc(t.id)}"${d.base === t.id ? " selected" : ""}>${esc(t.name)}</option>`).join("")}
          <option value="blank"${d.base === "blank" ? " selected" : ""}>Blank — from scratch</option>
        </select></label>
      <div class="warp-seg" role="radiogroup" aria-label="Style">
        <button class="warp-seg-btn" data-bset="creative" data-v="0" aria-pressed="${!d.creative}">Stay close to the template</button>
        <button class="warp-seg-btn" data-bset="creative" data-v="1" aria-pressed="${d.creative}">Get creative</button>
      </div>
      <label class="warp-field"><span>Model</span>
        <select class="warp-select" data-bset="connectionId">
          <option value="">Same as the chat</option>
          ${connections.map((c) => `<option value="${esc(c.id)}"${d.connectionId === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}
        </select></label>
      <p>A strong model gives better rulesets. Nothing is saved until you install it at the end.</p>
      <div class="warp-row"><button class="warp-btn warp-btn-primary" data-b="start"${dis}>Read the card →</button></div>
    </div>`;
  } else if (s.step === "questions") {
    const a = s.analysis;
    const analysis = a ? `<div class="warp-card">
        <h3>What I read</h3>
        <p>${esc(a.summary)}</p>
        <p><b>Starting from:</b> ${esc(templates.find((t) => t.id === s.base)?.name ?? (s.base === "blank" ? "Blank" : s.base))}${s.base === a.suggestedTemplate && a.reason ? ` — ${esc(a.reason)}` : ""}</p>
        ${a.cardType === "scenario" ? `<p>This reads as a <b>scenario card</b> — “${esc(s.characterName)}” is the setting, so it won't be tracked as a person.</p>` : ""}
        ${a.cast?.length ? `<p><b>Cast</b> (tracked from the start, with these starting feelings):</p><ul class="warp-cast">${a.cast.map((c) => `<li><b>${esc(c.name)}</b> — ${esc(c.relation)}</li>`).join("")}</ul>` : ""}
        ${a.statusBlock?.found ? `<p class="warp-tone-warn">This card prints its own status block (${esc(a.statusBlock.fields.join(", ") || "stats")}). Warp will track those properly and tell the narrator to stop printing it.</p>` : ""}
      </div>` : "";
    const rounds = s.rounds.map((r, i) => `<div class="warp-card">
        <h3>${i === 0 ? "A few questions" : "A few more"}</h3>
        ${r.questions.map((q) => question(q, d.answers[q.id] ?? r.answers[q.id])).join("")}
      </div>`).join("");
    body = `${analysis}${rounds}${additions(d)}
      <div class="warp-row warp-builder-foot">
        <button class="warp-btn warp-btn-ghost" data-b="back"${dis}>← Back</button>
        ${s.rounds.length < 3 ? `<button class="warp-btn" data-b="more"${dis}>Ask me more</button>` : ""}
        <button class="warp-btn warp-btn-primary" data-b="build"${dis}>Build it →</button>
      </div>`;
  } else if (s.step === "review") {
    const p = s.preview;
    const errors = s.parts.filter((x) => x.status === "error").length;
    const summary = `<div class="warp-card">
        <h3>${s.mode === "refine" && s.changeSummary ? "What changed" : "The draft"}</h3>
        ${s.changeSummary ? `<p>${esc(s.changeSummary)}</p>` : ""}
        <p>${esc(p?.summary ?? "The draft doesn't run yet — see the sections marked in red.")}</p>
        ${p?.warnings.length ? `<div class="warp-issues">${p.warnings.map((w) => `<div class="warp-warning-row"><span class="warp-tone-warn">!</span><span>${esc(w.text)}</span><button class="warp-btn warp-mini" data-b="fix" data-w="${esc(w.id)}"${dis}>Fix</button></div>`).join("")}</div>` : p ? `<p class="warp-tone-good">No balance problems found.</p>` : ""}
      </div>`;
    const preview = p?.hud ? `<details class="warp-card warp-preview" open><summary><b>Preview</b> <span class="warp-dim">— the sidebar and choices at the start</span></summary>
        <div class="warp-preview-grid"><div class="warp-preview-hud">${renderHud(p.hud, { editing: null, compact: true })}</div>
        <div class="warp-choices">${renderChoices(p.choices, { showOdds: true, hotkeys: false, busy: false })}</div></div>
      </details>` : "";
    const parts = `<div class="warp-card"><h3>Sections</h3>
      ${s.parts.map((x) => {
        const badge = x.status === "ok" ? `<span class="warp-tone-good">✓</span>` : x.status === "warn" ? `<span class="warp-tone-warn">! ${x.issues.length}</span>` : `<span class="warp-tone-bad">✕ ${x.issues.filter((i) => i.level === "error").length}</span>`;
        return `<details class="warp-part"><summary>${badge} <b>${esc(x.label)}</b>${x.changed ? ` <span class="warp-here">changed</span>` : ""} <span class="warp-dim">${esc(countLine(x.yaml))}</span></summary>
          ${x.issues.length ? `<div class="warp-issues">${x.issues.slice(0, 8).map((i) => `<div class="warp-issue"><span class="warp-tone-${i.level === "error" ? "bad" : "warn"}">${i.level === "error" ? "✕" : "!"}</span><span>${esc(i.message)}</span><span class="warp-issue-where">${esc(i.where)}</span></div>`).join("")}</div>` : ""}
          <pre class="warp-yaml">${esc(x.yaml)}</pre>
          <div class="warp-row">
            <input class="warp-input" style="flex:1" placeholder="What should change in ${esc(x.label)}? (optional)" data-bnote="${esc(x.label)}" value="${esc(d.notes[x.label] ?? "")}">
            <button class="warp-btn" data-b="redo" data-part="${esc(x.label)}"${dis}>Redo</button>
          </div>
        </details>`;
      }).join("")}
    </div>`;
    const refine = `<div class="warp-card">
        <h3>Change something</h3>
        <div class="warp-tags">${REFINE_CHIPS.map((c) => `<button class="warp-tag" data-b="chip" data-text="${esc(c)}">${esc(c)}</button>`).join("")}</div>
        <textarea class="warp-input" rows="2" data-brefine placeholder="e.g. Add a cooking skill Aina is bad at, and a kitchen at home">${esc(d.refine)}</textarea>
        <div class="warp-row"><button class="warp-btn" data-b="refine"${dis}>Apply change</button></div>
      </div>`;
    body = `${summary}${preview}${parts}${refine}
      <div class="warp-row warp-builder-foot">
        ${s.mode === "build" ? `<button class="warp-btn warp-btn-ghost" data-b="back"${dis}>← Back to questions</button>` : ""}
        <button class="warp-btn warp-btn-primary" data-b="install" data-replacing="${hasRuleset ? 1 : 0}"${errors || busy ? " disabled" : ""} title="${errors ? "Fix or redo the sections marked in red first" : ""}">${s.mode === "refine" ? "Save changes" : "Install to lorebook"}</button>
      </div>`;
  } else {
    body = `<div class="warp-card">
      <h3 class="warp-tone-good">✓ Saved</h3>
      <p>The ruleset is in ${esc(s.characterName)}'s <b>warp-ruleset</b> lorebook and running in this chat. You can refine it any time.</p>
      <div class="warp-row"><button class="warp-btn warp-btn-primary" data-b="close">Done</button><button class="warp-btn" data-b="open-refine">Refine it</button></div>
    </div>`;
  }
  return `<div class="warp-builder">${head}${status}${body}</div>`;
}

function countLine(yaml: string): string {
  const lines = yaml.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length;
  return `${lines} lines`;
}
