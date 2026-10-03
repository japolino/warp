// Pure view → HTML renderers for the drawer (journal, ruleset card, template picker), plus the shared exports.
// The status panel is in render-panel.ts, the chat rows in render-chat.ts, Settings in render-settings.ts.

import type { HudView, RecordView, RulesetStatus, TemplateInfo } from "../shared/protocol.js";
import { esc, TIER_TONE } from "./html.js";
import { goalRow } from "./render-panel.js";
import { changeItems } from "./render-chat.js";
import { templateFor } from "./render-settings.js";

export { esc } from "./html.js";
export { hudParts, renderHud, renderPart, type HudOpts, type HudPart } from "./render-panel.js";
export { renderChoices, renderReply } from "./render-chat.js";
export { renderSettings } from "./render-settings.js";

// ───────────────────────── journal ─────────────────────────

/** Goals (open, done, failed), then the timeline: newest first, one row per reply. */
export function renderJournal(h: HudView | null, records: RecordView[], editing: string | null = null): string {
  if (!h) return `<div class="warp-card"><p>No game running in this chat.</p></div>`;
  const goals = `<div class="warp-card"><h3>Goals</h3>${h.goals.length
    ? (["open", "done", "failed"] as const).map((st) => h.goals.filter((g) => g.status === st).map((g) => goalRow(g, { editing })).join("")).join("")
    : `<p>No goals yet. Promises, favours and plans from the story show up here.</p>`}</div>`;
  const turns = records.filter((r) => r.check || r.lines.length || r.changes.length).slice().reverse().slice(0, 40);
  const timeline = `<div class="warp-card"><h3>Timeline</h3>
    ${turns.length ? turns.map((r) => {
      const items = changeItems(r, false).map((i) => i.text);
      return `<button class="warp-timeline-row" data-jump="${esc(r.messageId)}" title="Jump to this message">
        <span class="warp-dim">${esc(r.clock ?? "")}</span>
        <span>${r.check ? `🎲 ${esc(r.check.label)} · <span class="warp-tone-${TIER_TONE[r.check.tier]}">${esc(r.check.tierLabel)}</span>` : r.action ? esc(r.action) : `<span class="warp-dim">Story</span>`}</span>
        ${items.length ? `<span class="warp-dim warp-timeline-changes">${esc(items.slice(0, 6).join(" · "))}${items.length > 6 ? ` · +${items.length - 6} more` : ""}</span>` : ""}
      </button>`;
    }).join("") : `<p>Nothing has happened yet.</p>`}
  </div>`;
  return goals + timeline;
}

// ───────────────────────── ruleset status & setup ─────────────────────────

export function renderRulesetCard(s: RulesetStatus, hasChat: boolean): string {
  if (!hasChat) {
    return `<div class="warp-card"><h3>Open a chat</h3><p>Warp runs inside a chat whose character has a <b>warp-ruleset</b> lorebook.</p></div>`;
  }
  if (s.state === "none") {
    return `<div class="warp-card">
      <h3>${esc(s.characterName ?? "This character")} has no game rules yet</h3>
      <p>Add rules to keep score: time and place, who is here and how they feel about you, and dice the narrator can't fudge. They're stored in a <b>warp-ruleset</b> lorebook on the character, so they travel with the card.</p>
      <div class="warp-row"><button class="warp-btn warp-btn-primary" data-install>Add rules…</button></div>
    </div>`;
  }
  const errors = s.issues.filter((i) => i.level === "error");
  const warns = s.issues.filter((i) => i.level === "warning");
  const style = s.style ? ` · ${s.style === "story" ? "Story (no dice)" : "Adventure (dice)"}` : "";
  const head = s.state === "ok"
    ? `<h3>✓ ${esc(s.name)}</h3><p>From ${esc(s.source)}${esc(style)}${warns.length ? ` · ${warns.length} note${warns.length > 1 ? "s" : ""}` : ""}</p>`
    : `<h3 class="warp-tone-bad">Ruleset can't run</h3><p>Fix the problems below in the <b>warp-ruleset</b> lorebook, then reload.</p>`;
  const list = [...errors, ...warns].slice(0, 30).map((i) => `
    <div class="warp-issue"><span class="warp-tone-${i.level === "error" ? "bad" : "warn"}">${i.level === "error" ? "✕" : "!"}</span><span>${esc(i.message)}</span><span class="warp-issue-where">${esc(i.where)}</span></div>`).join("");
  return `<div class="warp-card">${head}${list ? `<div class="warp-issues">${list}</div>` : ""}
    <div class="warp-row"><button class="warp-btn" data-reload>Reload</button><button class="warp-btn warp-btn-ghost" data-install>Replace with a template…</button></div>
  </div>`;
}

/** Where Warp Studio lives: the creator tools that moved out of Warp. */
export const STUDIO_URL = "https://github.com/japolino/warp-studio";

/** The Ruleset tab's note on writing rules by hand, and where the creator tools went. */
export function renderWritingRules(): string {
  return `<div class="warp-card"><h3>Writing rules</h3><p>Rules live in entries titled <b>warp-ruleset · …</b> (or any lorebook named <b>warp-ruleset</b>). Each entry is YAML; entries merge together. Warp keeps them out of the prompt automatically.</p>
    <p class="warp-studio-line">Deep passes, checks, playtest and import/export: <a href="${STUDIO_URL}" target="_blank" rel="noopener">Warp Studio</a> (${STUDIO_URL})</p></div>`;
}

const STYLE_CARD = {
  story: { title: "📖 Story (no dice)", blurb: "Time, place, who is here and how they feel about you, with slow-burn relationships. Nothing is rolled." },
  adventure: { title: "🎲 Adventure (dice)", blurb: "Everything in Story, plus dice at risky moments and contests (fights, chases, arguments) on one momentum gauge." },
};

/** The first-install picker: always the two cards Story and Adventure side by side (no default), then Build with AI. */
export function renderTemplatePicker(templates: TemplateInfo[], card: { name: string; track: boolean } | null = null): string {
  const track = card
    ? `<label class="warp-toggle"><span>Track <b>${esc(card.name)}</b> as a character</span><small>${card.track ? "Their relationship with you is tracked from the start." : "This looks like a scenario or narrator card, so its name isn't added as a person. Tick if it really is one character."}</small><input type="checkbox" data-track${card.track ? " checked" : ""}></label>`
    : "";
  const cards = (["story", "adventure"] as const).map((st) => {
    const t = templateFor(st, templates);
    return `<button class="warp-card warp-template" data-template="${esc(t?.id ?? st)}" aria-pressed="false"><h3>${esc(STYLE_CARD[st].title)}</h3><p>${esc(STYLE_CARD[st].blurb)}</p></button>`;
  }).join("");
  return `<div class="warp-modal">
    <p style="margin:0;color:var(--warp-muted)">Pick how this chat plays. Warp adds a <b>warp-ruleset</b> lorebook to this character that you can edit like any lorebook. It's never sent to the model.</p>
    ${track}
    <div class="warp-template-pair">${cards}</div>
    <button class="warp-card warp-template" data-template="__ai"><h3>✨ Build with AI</h3><p>Reads this character's card and fits Story or Adventure to it: checked and previewed before anything is saved.</p></button>
    <p class="warp-dim" style="margin:0">Warp makes one small model call per turn to keep score and write the choices (a typed risky move without Jev needs a second one). It uses the chat's own model unless you pick a fast, cheap <b>Helper connection</b> in Settings.</p>
  </div>`;
}
