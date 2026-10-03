// What shows in the chat: under each reply one dice chip and one "what changed" line, and under the latest
// reply the choices row (3 choices with honest odds, a compact "More" row of authored actions, and in a
// contest a slim gauge above the moves).

import type { ChoiceView, ConflictView, RecordView } from "../shared/protocol.js";
import { esc, pct, pctTone, TIER_TONE } from "./html.js";
import { renderGauge, roundText } from "./render-panel.js";

// ───────────────────────── under each reply ─────────────────────────

/** Items shown before "+N more". */
export const SHOWN_CHANGES = 6;

/**
 * The real chance of success-or-better of a d20 check: a natural 20 always succeeds, a natural 1 always fails,
 * every other face succeeds when face + add reaches the target.
 */
export function d20Odds(add: number, target: number): number {
  let n = 1;
  for (let f = 2; f <= 19; f++) if (f + add >= target) n++;
  return n / 20;
}

/** The odds a rolled check had, when it was one d20 against a target. */
export function checkOdds(c: NonNullable<RecordView["check"]>): number | null {
  if (c.target === null || c.faces.length !== 1 || c.faces[0].sides !== 20) return null;
  return d20Odds(c.add, c.target);
}

/** "Momentum +49" from the record's change line, for the dice chip of a contest round. */
export function momentumOf(rec: RecordView): string | null {
  for (const ch of rec.changes) {
    const m = /^Momentum [+−-]\d+/.exec(ch.text);
    if (m) return m[0];
  }
  return null;
}

/** One item of the "what changed" line. */
interface LineItem { text: string; tone: string; tip: string; undo: number[] | null; kind: "line" | "decision" | "change" }

/** The line's items in order: band-crossing story lines, rolled reactions, then the changes as the engine orders them. */
export function changeItems(rec: RecordView, latest: boolean): LineItem[] {
  const out: LineItem[] = [];
  for (const l of rec.lines.slice(0, 3)) out.push({ text: l, tone: "neutral", tip: "A relationship or meter crossed into a new band", undo: null, kind: "line" });
  for (const d of rec.decisions) {
    out.push({
      text: `🎭 ${d.picked}`, tone: "neutral", undo: null, kind: "decision",
      tip: `${d.ask}\n${d.odds.map((o) => `${o.desc} ${pct(o.p)}`).join(" · ")}\n${d.source === "model" ? "Odds from the decision model; the engine rolled." : "Odds from the ruleset's weights; the engine rolled."}`,
    });
  }
  for (const ch of rec.changes) {
    const told = ch.src === "narrator" || ch.src === "manual";
    const cause = ch.why?.length ? ch.why.join(" · ") : ch.src === "manual" ? "You set this" : told ? "Read from the story" : "Applied by the rules";
    out.push({
      text: `${ch.text}${ch.band ? ` (${ch.band})` : ""}`, tone: ch.tone, tip: cause, kind: "change",
      // Only the latest reply can be undone: undoing an older one would change every record after it.
      undo: latest && told && ch.undo?.length ? ch.undo : null,
    });
  }
  if (rec.veiled) out.push({ text: "◐ veiled", tone: "warn", tip: "Narrated off-screen by your Veils setting", undo: null, kind: "change" });
  return out;
}

export interface ReplyOpts {
  /** Show the "what changed" line (the dice chip always shows). */
  showChanges: boolean;
  /** This record belongs to the latest message: its story-read and manual items get an undo ×. */
  latest: boolean;
}

/** Under one reply: the dice chip (only when it rolled) and the "what changed" line. "" when there is nothing. */
export function renderReply(rec: RecordView, opts: ReplyOpts): string {
  const out: string[] = [];
  const notAction = rec.redoFrom
    ? `<button class="warp-btn warp-btn-ghost warp-mini" data-redo="${esc(rec.redoFrom)}" title="Redo this turn without a roll">Not an action?</button>`
    : "";
  if (rec.check) {
    const c = rec.check;
    const swing = momentumOf(rec);
    const odds = checkOdds(c);
    const read = rec.via === "adjudicator"
      ? `<span class="warp-dim">· read from your message${rec.confidence !== null ? ` (${Math.round(rec.confidence * 100)}% sure)` : ""}</span>`
      : "";
    out.push(`<button class="warp-chip warp-dice warp-tone-${TIER_TONE[c.tier] ?? "neutral"}" data-dice title="Show the roll">🎲 ${esc(c.label)} · ${esc(c.tierLabel)}${swing ? ` · ${esc(swing)}` : ""}</button>`);
    out.push(`<div class="warp-dice-detail">${c.faces.map((f) => `<span class="warp-die" title="d${f.sides}"${f.kept ? "" : " data-dropped"}>${f.value}</span>`).join("")}<span>${esc(c.summary)}${odds !== null ? ` · ${pct(odds)} odds` : ""}</span>${read}${notAction}</div>`);
  } else if (notAction) {
    out.push(`<span class="warp-chip">▸ ${esc(rec.action ?? "Read as an action")}</span>${notAction}`);
  }
  const items = opts.showChanges ? changeItems(rec, opts.latest) : [];
  if (items.length) {
    const shown = items.map((it, i) => `<span class="warp-ch warp-ch-${it.kind} warp-tone-${it.tone}${i >= SHOWN_CHANGES ? " warp-ch-extra" : ""}" title="${esc(it.tip)}">${esc(it.text)}${it.undo
      ? `<button class="warp-chip-undo" data-undo="${esc(it.undo.join(","))}" title="Undo this change" aria-label="Undo ${esc(it.text)}">×</button>`
      : ""}</span>`);
    const more = items.length > SHOWN_CHANGES ? `<button class="warp-ch-more" data-more>+${items.length - SHOWN_CHANGES} more</button>` : "";
    out.push(`<div class="warp-whatchanged">${shown.join(`<span class="warp-ch-sep" aria-hidden="true">·</span>`)}${more}</div>`);
  }
  return out.join("");
}

// ───────────────────────── choices row ─────────────────────────

/** Written choices and contest moves go in the main row; authored actions and items in the compact "More" row. */
export const isMainChoice = (c: ChoiceView) => c.id.startsWith("live:") || c.id.startsWith("contest:");

/** The order the choices are shown and numbered in (hotkeys 1–9 follow it). */
export function choiceOrder(choices: ChoiceView[]): ChoiceView[] {
  return [...choices.filter(isMainChoice), ...choices.filter((c) => !isMainChoice(c))];
}

/** Authored actions shown before the "…" fold. */
export const MORE_SHOWN = 4;

export interface ChoicesOpts {
  showOdds: boolean;
  hotkeys: boolean;
  /** The backend is busy for this chat (e.g. "Writing choices…"): the label shows; the buttons stay usable. */
  busy: boolean;
  busyLabel?: string;
  /** The contest running now: a slim gauge above the moves. */
  conflict?: ConflictView | null;
}

function oddsTip(c: ChoiceView): string {
  if (c.odds === null) return "";
  return `${c.checkLabel ?? "Check"}${c.difficulty && c.difficulty !== "none" ? ` · ${c.difficulty}` : ""}: ${pct(c.odds)} success${c.partialOdds ? `, ${pct(c.partialOdds)} partial` : ""}`;
}

function choiceButton(c: ChoiceView, n: number, opts: ChoicesOpts, small: boolean): string {
  const key = opts.hotkeys && n <= 9 ? `<span class="warp-kbd">${n}</span>` : "";
  const tip = [c.desc, c.why ? `Why now: ${c.why}` : null, opts.showOdds ? oddsTip(c) || null : null, c.veiled ? "Veiled: happens off-screen" : null].filter(Boolean).join("\n");
  if (c.locked) return `<button class="warp-choice warp-choice-locked${small ? " warp-choice-small" : ""}" disabled title="${esc(`${c.desc ?? c.label}\nLocked: ${c.locked}`)}"><span class="warp-choice-label">${esc(c.label)}<span class="warp-choice-why">🔒 ${esc(c.locked)}</span></span></button>`;
  const odds = opts.showOdds && c.odds !== null
    ? `<span class="warp-choice-odds warp-tone-${pctTone(c.odds + (c.partialOdds ?? 0) / 2)}">${pct(c.odds)}</span>`
    : "";
  return `<button class="warp-choice${small ? " warp-choice-small" : ""}${c.id.startsWith("item:") ? " warp-choice-item" : ""}" data-act="${esc(c.id)}"${tip ? ` title="${esc(tip)}"` : ""}>${key}<span class="warp-choice-label">${esc(c.label)}${c.why ? `<span class="warp-choice-why">${esc(c.why)}</span>` : ""}</span>${c.veiled ? `<span class="warp-choice-veil" aria-label="veiled">◐</span>` : ""}${odds}</button>`;
}

/** The choices row under the latest reply. "" when there is nothing to show. */
export function renderChoices(choices: ChoiceView[], opts: ChoicesOpts): string {
  if (!choices.length && !opts.busy && !opts.conflict) return "";
  const ordered = choiceOrder(choices);
  const main = ordered.filter(isMainChoice);
  const more = ordered.filter((c) => !isMainChoice(c));
  const status = opts.busy ? `<div class="warp-status-line"><span class="warp-spinner"></span>${esc(opts.busyLabel || "Writing choices…")}</div>` : "";
  const gauge = opts.conflict ? `<div class="warp-conflict warp-conflict-slim"><div class="warp-conflict-head"><span>⚔ ${esc(opts.conflict.label)} · ${esc(opts.conflict.opponent)}</span><span class="warp-dim">${esc(roundText(opts.conflict))}</span></div>${renderGauge(opts.conflict)}</div>` : "";
  const mainRow = main.length ? `<div class="warp-choice-grid">${main.map((c, i) => choiceButton(c, i + 1, opts, false)).join("")}</div>` : "";
  const moreButtons = more.map((c, i) => choiceButton(c, main.length + i + 1, opts, true));
  const moreRow = more.length
    ? `<div class="warp-more">${moreButtons.slice(0, MORE_SHOWN).join("")}${more.length > MORE_SHOWN
      ? `<details class="warp-more-fold"><summary title="More actions">…</summary><div class="warp-more">${moreButtons.slice(MORE_SHOWN).join("")}</div></details>`
      : ""}</div>`
    : "";
  return `${status}${gauge}${mainRow}${moreRow}`;
}
