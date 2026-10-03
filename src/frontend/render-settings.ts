// The Settings tab: 9 controls (CORE-DESIGN §4.7). Everything else keeps a fixed default.

import type { RulesetStatus, Settings, TemplateInfo } from "../shared/protocol.js";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";
import { classifierIssue } from "../shared/classifier-config.js";
import { esc } from "./html.js";

export type Style = "story" | "adventure";

function toggle(key: keyof Settings, label: string, hint: string, on: boolean): string {
  return `<label class="warp-toggle"><span>${esc(label)}</span><small>${esc(hint)}</small><input type="checkbox" data-setting="${esc(key)}"${on ? " checked" : ""}></label>`;
}

/** A two-way switch for a yes/no setting, with a name for each side. */
function boolSeg(key: keyof Settings, label: string, on: boolean, yes: string, no: string, hint: string): string {
  return `<div class="warp-field"><span>${esc(label)}</span>
    <div class="warp-seg" role="radiogroup" aria-label="${esc(label)}">
      <button class="warp-seg-btn" data-setting-bool="${esc(key)}" data-v="1" role="radio" aria-pressed="${on}" aria-checked="${on}">${esc(yes)}</button>
      <button class="warp-seg-btn" data-setting-bool="${esc(key)}" data-v="0" role="radio" aria-pressed="${!on}" aria-checked="${!on}">${esc(no)}</button>
    </div><small class="warp-dim">${esc(hint)}</small></div>`;
}

// Until step 4 renames them, the two templates may still have their old ids.
const LEGACY_ID: Record<Style, string> = { story: "romance", adventure: "universal" };

/** The template that installs a style. */
export function templateFor(style: Style, templates: TemplateInfo[]): TemplateInfo | null {
  return templates.find((t) => t.id === style) ?? templates.find((t) => t.id === LEGACY_ID[style]) ?? null;
}

/**
 * Story (no dice) / Adventure (dice). With no ruleset: installs that template. With a template install: switches
 * it after a confirm (people entries kept). With a ruleset written for the card: disabled.
 */
export function renderStyleSwitch(status: RulesetStatus | null, templates: TemplateInfo[]): string {
  const none = !status || status.state === "none";
  const fromTemplate = !none && !!status!.template;
  const current = none ? null : status!.style ?? null;
  const mode = none ? "install" : fromTemplate ? "switch" : null;
  const button = (style: Style, label: string) => {
    const t = templateFor(style, templates);
    const on = current === style;
    const usable = !!status && !!mode && !!t && !on;
    return `<button class="warp-seg-btn" data-style="${style}"${usable ? ` data-style-mode="${mode}" data-template="${esc(t!.id)}"` : ""} role="radio" aria-pressed="${on}" aria-checked="${on}"${usable || on ? "" : " disabled"}>${esc(label)}</button>`;
  };
  const hint = !status ? "Open a chat to choose."
    : none ? "No rules yet: pick one to add it to this character."
      : fromTemplate ? "Switching keeps your people; the rest of the template is replaced."
        : "This ruleset was written for this card. To change it, set `style:` in the ruleset.";
  return `<div class="warp-field"><span>Style</span>
    <div class="warp-seg" role="radiogroup" aria-label="Style">${button("story", "Story (no dice)")}${button("adventure", "Adventure (dice)")}</div>
    <small class="warp-dim">${esc(hint)}</small></div>`;
}

function renderDecider(s: Settings, jevKeySet: boolean): string {
  const opt = (v: "llm" | "jev", label: string) => `<option value="${v}"${s.decider === v ? " selected" : ""}>${label}</option>`;
  const jev = s.decider === "jev";
  const typesafe = s.jevUrl === DEFAULT_SETTINGS.jevUrl;
  const issue = jev ? classifierIssue("typesafe", s.jevModel, s.jevUrl) : null;
  const host = (() => { try { return new URL(s.jevUrl).host; } catch { return s.jevUrl; } })();
  return `<div class="warp-card">
    <h3>Decision model</h3>
    <p>Answers Warp's quick questions: what your message tries, who is here, what changed. It never picks outcomes; the dice do.</p>
    <select class="warp-select" data-setting="decider" aria-label="Decision model">
      ${opt("llm", "Helper model")}
      ${opt("jev", "Jev (fast, cheap classifier)")}
    </select>
    <small class="warp-dim">Jev makes typed play faster and cheaper: every turn then needs only one helper call.</small>
    ${jev ? `
    <div class="warp-row">
      <input class="warp-input" type="password" data-jevkey placeholder="${jevKeySet ? "Key saved — paste to replace" : "Jev API key"}" autocomplete="off" style="flex:1" aria-label="Jev API key">
      <button class="warp-btn" data-save-jev>${jevKeySet ? "Replace" : "Save"}</button>
      ${jevKeySet ? `<button class="warp-btn warp-btn-ghost" data-clear-jev>Remove</button>` : ""}
    </div>
    <p>${jevKeySet ? "✓ Key stored encrypted on the server." : typesafe ? "No key yet: until you add one, the helper model answers." : "No key saved: fine for a local server."} Your roleplay text goes to <b>${esc(host)}</b> for these questions.</p>
    ${issue ? `<p class="warp-tone-warn" role="alert">${esc(issue)}</p>` : ""}
    <details data-section="advanced-classifier"${issue ? " open" : ""}><summary>Advanced: endpoint and model</summary>
      <label class="warp-field">Endpoint
        <input class="warp-input" data-setting="jevUrl" value="${esc(s.jevUrl)}" placeholder="${esc(DEFAULT_SETTINGS.jevUrl)}" spellcheck="false" autocomplete="off">
        <small class="warp-dim">TypeSafe's Jev by default, or any URL with the same typed-question API.</small>
      </label>
      <label class="warp-field">Model
        <input class="warp-input" data-setting="jevModel" value="${esc(s.jevModel)}" placeholder="jev-latest" spellcheck="false" autocomplete="off">
      </label>
      <div class="warp-row"><button class="warp-btn" data-jev-openrouter>Jev on OpenRouter</button><span class="warp-dim">Sets the endpoint and model. Uses an OpenRouter key.</span></div>
    </details>` : ""}
    <div class="warp-row"><button class="warp-btn" data-test-decider>Test decision model</button></div>
  </div>`;
}

/** The Settings tab. */
export function renderSettings(s: Settings, status: RulesetStatus | null, connections: { id: string; name: string }[], jevKeySet = false, templates: TemplateInfo[] = []): string {
  const tags = new Set([...(status?.tags ?? []), ...s.lines, ...s.veils]);
  const tagChips = [...tags].sort().map((t) => {
    const mode = s.lines.includes(t) ? "line" : s.veils.includes(t) ? "veil" : "on";
    return `<button class="warp-tag" data-tag="${esc(t)}" data-mode="${mode}" title="Tap to cycle: on → veil (off-screen) → line (removed)">${esc(t)}</button>`;
  }).join("");
  return `<div class="warp-card">
    <h3>Warp</h3>
    ${toggle("enabled", "Warp is on", "Turn the engine off without removing any rules.", s.enabled)}
    ${renderStyleSwitch(status, templates)}
    <label class="warp-field"><span>Helper connection</span>
      <select class="warp-select" data-setting="helperConnectionId" aria-label="Helper connection">
        <option value="">Same as the chat</option>
        ${connections.map((c) => `<option value="${esc(c.id)}"${c.id === s.helperConnectionId ? " selected" : ""}>${esc(c.name)}</option>`).join("")}
      </select>
      <small class="warp-dim">Reads each reply and writes the choices. A fast, cheap model works best.</small>
    </label>
  </div>
  ${renderDecider(s, jevKeySet)}
  <div class="warp-card">
    <h3>Play</h3>
    ${toggle("showChoices", "Show choices", "3 choices under each reply. Off: you just type, and none are written (that saves helper work).", s.showChoices)}
    ${toggle("showOdds", "Show odds", "The real chance of success on each choice.", s.showOdds)}
    ${boolSeg("swipesReroll", "Dice on a swipe", s.swipesReroll, "Casual", "Ironman", s.swipesReroll
      ? "Casual: a swipe rolls the dice again, for typed and clicked moves."
      : "Ironman: a swipe gives the same roll.")}
    ${toggle("showChanges", "Show what changed", "One line under each reply: time, place, people, feelings, items. The dice chip always shows.", s.showChanges)}
  </div>
  <div class="warp-card">
    <h3>Lines & Veils</h3>
    <p>Tap a tag to cycle it: <b>on</b> → <span class="warp-tone-warn">veil</span> (still happens, off-screen) → <span class="warp-tone-bad">line</span> (removed from the game).</p>
    <div class="warp-tags">${tagChips || `<span class="warp-empty">This ruleset doesn't tag any moves.</span>`}</div>
    <div class="warp-row"><input class="warp-input" data-newtag placeholder="Add a tag… (Enter)" style="flex:1" aria-label="Add a tag"></div>
  </div>`;
}
