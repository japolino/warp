// The Doll tab: a preview plus every control, and the helper buttons that
// dress it from the card, the persona, a description or the latest story.

import type { DollRequest, HudView } from "../../shared/protocol.js";
import { PRESETS, type Sex } from "./body.js";
import { EARS, EXPRESSIONS, HAIR_STYLES, HORNS, TAILS } from "./features.js";
import { FITS, type Garment, HEMS, type Kind, KINDS, LENGTHS, MATERIALS, NECKLINES, PATTERNS, SLEEVE_FITS, SLEEVES, STYLES } from "./garments.js";
import { cleanLook, defaultLook, HAIR_COLOURS, MAX_GARMENTS, OUTFITS, outfitFor, SKINS } from "./outfits.js";
import { type Look, renderDoll } from "./render.js";

type Who = "you" | "them";
interface Saved { you: Look; them: Look; themName: string; who: Who; notes: Record<Who, string>; hud: boolean }

const KEY = "warp:doll";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Which fields mean something for each kind of garment. */
const FIELDS: Record<Kind, (keyof Garment)[]> = {
  top: ["neckline", "sleeves", "sleeveFit", "hem", "fit", "material"],
  dress: ["neckline", "sleeves", "sleeveFit", "length", "flare", "fit", "material"],
  robe: ["neckline", "sleeves", "sleeveFit", "length", "flare", "material"],
  outer: ["style", "neckline", "sleeves", "sleeveFit", "hem", "length", "open", "material"],
  cape: ["length"],
  armor: ["neckline", "sleeves", "hem", "material"],
  bottom: ["style", "length", "fit", "rise", "material"],
  skirt: ["length", "flare", "rise"],
  legwear: ["style", "length", "material"],
  shoes: ["style", "length", "material"],
  gloves: ["style", "sleeves", "material"],
  sleeves: ["sleeves", "sleeveFit"],
  hat: ["style"],
  neck: ["style"],
  belt: ["rise"],
  sash: [],
  apron: ["length"],
  bra: [],
  briefs: [],
};
const OPTIONS: Partial<Record<keyof Garment, readonly string[]>> = {
  neckline: NECKLINES, sleeves: SLEEVES, sleeveFit: SLEEVE_FITS, hem: HEMS, length: LENGTHS, fit: FITS, material: MATERIALS, rise: ["high", "mid", "low"],
};

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (v && typeof v === "object") return { you: cleanLook(v.you), them: cleanLook(v.them ?? { body: { sex: "f", preset: "curvy" } }), themName: String(v.themName ?? ""), who: v.who === "them" ? "them" : "you", notes: { you: String(v.notes?.you ?? ""), them: String(v.notes?.them ?? "") }, hud: v.hud !== false };
  } catch { /* fresh */ }
  const them = defaultLook("f");
  them.body.preset = "curvy"; them.hair = { style: "twintails", colour: "#e8c26a", length: 0.7 }; them.eyes = "#2f8f6f"; them.ears = "cat"; them.outfit = outfitFor("street", "f");
  return { you: defaultLook("f"), them, themName: "", who: "you", notes: { you: "", them: "" }, hud: true };
}

export interface DollLab {
  html(): string;
  /** Handle an event in the drawer; true when it was ours. */
  handle(e: Event, root: HTMLElement): boolean;
  onLook(m: { who: string; look: unknown | null; note: string; name?: string; error?: string }): void;
  /** The player's doll as a HUD section (null when turned off). */
  hudSection(): { id: string; title: string; count: number; body: string; open: boolean } | null;
  /** The look being edited. */
  current(): Look;
}

export function createDollLab(o: { send(m: DollRequest): void; chatId(): string | null; hud(): HudView | null; changed(): void }): DollLab {
  const st = load();
  /** Who has a helper request out (both can at once). */
  const busy = new Set<Who>();
  let text = "";
  /** The "As data" box's text when it didn't parse, so a typo doesn't wipe it. */
  let jsonDraft: string | null = null;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* full */ } };
  const cur = () => st[st.who];

  const worn = (): string[] => {
    const h = o.hud();
    if (!h?.outfit || st.who !== "you") return [];
    return h.outfit.filter((s) => s.item).map((s) => `${s.item!.name} (${s.label})${s.item!.integrity !== null && s.item!.integrity < 60 ? `, ${s.item!.integrity < 25 ? "in tatters" : "torn"}` : ""}`);
  };

  const sel = (path: string, value: string, opts: readonly string[], labels?: (x: string) => string, none?: string) =>
    `<select class="warp-input" data-doll-set="${path}">${none !== undefined ? `<option value=""${value ? "" : " selected"}>${esc(none)}</option>` : ""}${opts.map((x) => `<option value="${esc(x)}"${x === value ? " selected" : ""}>${esc(labels ? labels(x) : cap(x))}</option>`).join("")}</select>`;
  const colour = (path: string, value: string) => `<input type="color" class="warp-doll-colour" data-doll-set="${path}" value="${esc(value)}">`;
  const swatches = (path: string, list: string[], value: string) => `<div class="warp-doll-swatches">${list.map((c) => `<button class="warp-doll-swatch${c === value ? " on" : ""}" style="background:${c}" data-doll-pick="${path}" data-value="${c}" title="${c}"></button>`).join("")}${colour(path, value)}</div>`;
  const range = (path: string, value: number, min: number, max: number, step: number) => `<input type="range" class="warp-doll-range" data-doll-set="${path}" min="${min}" max="${max}" step="${step}" value="${value}">`;
  const row = (label: string, ctl: string) => `<label class="warp-doll-row"><span>${esc(label)}</span>${ctl}</label>`;

  function garmentRow(g: Garment, i: number): string {
    const fields = FIELDS[g.kind].map((k) => {
      if (k === "style") return STYLES[g.kind] ? row("Style", sel(`outfit.${i}.style`, g.style ?? "", STYLES[g.kind]!, undefined, "default")) : "";
      if (k === "flare") return row("Flare", range(`outfit.${i}.flare`, g.flare ?? 0.4, 0, 1, 0.05));
      if (k === "open") return row("Open front", `<input type="checkbox" data-doll-set="outfit.${i}.open"${g.open ?? true ? " checked" : ""}>`);
      const opts = OPTIONS[k];
      return opts ? row(cap(k === "sleeveFit" ? "sleeve fit" : k), sel(`outfit.${i}.${k}`, String(g[k] ?? ""), opts, undefined, "default")) : "";
    }).join("");
    return `<details class="warp-doll-garment" data-doll-g="${i}" data-section="doll-g-${i}">
      <summary>${colour(`outfit.${i}.colour`, g.colour)}<span class="warp-doll-gname">${esc(g.label ?? cap(g.kind))}</span><span class="warp-dim">${esc(g.kind)}</span><button class="warp-btn warp-doll-x" data-doll-del="${i}" title="Take it off">×</button></summary>
      <div class="warp-doll-fields">
        ${row("Name", `<input class="warp-input" data-doll-set="outfit.${i}.label" value="${esc(g.label ?? "")}" placeholder="${esc(cap(g.kind))}">`)}
        ${row("Pattern", `<span class="warp-doll-pair">${sel(`outfit.${i}.pattern`, g.pattern ?? "none", PATTERNS)}${colour(`outfit.${i}.patternColour`, g.patternColour ?? "#1d1a22")}</span>`)}
        ${row("Trim", colour(`outfit.${i}.colour2`, g.colour2 ?? "#c9a54a"))}
        ${fields}
        ${row("Wear and tear", range(`outfit.${i}.damage`, g.damage ?? 0, 0, 1, 0.05))}
      </div>
    </details>`;
  }

  function html(): string {
    const L = cur();
    const sex = L.body.sex;
    const presets = Object.entries(PRESETS[sex]);
    const people = (o.hud()?.people ?? []).map((p) => p.name);
    const who = st.who;
    const isBusy = busy.has(who);
    const doll = renderDoll(L, { id: `lab${who}` });
    return `<div class="warp-doll-lab">
      <div class="warp-doll-who" role="tablist">
        <button class="warp-tab" data-doll-who="you" aria-selected="${who === "you"}">You</button>
        <button class="warp-tab" data-doll-who="them" data-doll-them-tab aria-selected="${who === "them"}">${esc(st.themName.trim() || "Someone else")}</button>
      </div>
      <div class="warp-doll-stage" data-doll-stage>${doll}</div>
      ${st.notes[who] ? `<p class="warp-dim warp-doll-note">${esc(st.notes[who])}</p>` : ""}
      <div class="warp-card warp-doll-helper">
        <h3>Dress with the helper</h3>
        ${who === "them" ? row("Who", `<input class="warp-input" list="warp-doll-people" data-doll-name value="${esc(st.themName)}" placeholder="A name from the story"><datalist id="warp-doll-people">${people.map((p) => `<option value="${esc(p)}">`).join("")}</datalist>`) : ""}
        <div class="warp-doll-buttons">
          <button class="warp-btn warp-btn-primary" data-doll-ask="profile"${isBusy ? " disabled" : ""} title="${who === "you" ? "Reads your persona and what you're wearing in the game" : "Reads the card, the lorebook and how the story has shown them"}">${who === "you" ? "From my persona" : "From card & lorebook"}</button>
          <button class="warp-btn" data-doll-ask="story"${isBusy ? " disabled" : ""} title="Changes only what the latest replies changed">Update from story</button>
        </div>
        <textarea class="warp-input warp-doll-text" data-doll-text rows="2" placeholder="Or describe it: a fox girl in a blue yukata with a torn sleeve…">${esc(text)}</textarea>
        <button class="warp-btn" data-doll-ask="text"${isBusy ? " disabled" : ""}>Dress from description</button>
        ${isBusy ? `<p class="warp-dim">Asking the helper…</p>` : ""}
      </div>
      <details class="warp-section" data-section="doll-body" open><summary>Body</summary>
        ${row("Sex", sel("body.sex", sex, ["f", "m"], (x) => (x === "f" ? "Female" : "Male")))}
        ${row("Build", `<div class="warp-doll-chips">${presets.map(([k, p]) => `<button class="warp-btn${L.body.preset === k ? " warp-btn-primary" : ""}" data-doll-pick="body.preset" data-value="${k}">${esc(p.label)}</button>`).join("")}</div>`)}
        ${row("Blend toward", sel("body.blend.preset", L.body.blend?.preset ?? "", presets.map(([k]) => k), (x) => PRESETS[sex][x].label, "nothing"))}
        ${L.body.blend ? row("Blend", range("body.blend.amount", L.body.blend.amount, 0, 1, 0.05)) : ""}
        ${row("Height", range("body.height", L.body.height ?? 1, 0.85, 1.15, 0.01))}
        ${row("Skin", swatches("skin", SKINS, L.skin))}
      </details>
      <details class="warp-section" data-section="doll-head"><summary>Hair &amp; face</summary>
        ${row("Hair", sel("hair.style", L.hair.style, HAIR_STYLES))}
        ${row("Length", range("hair.length", L.hair.length ?? 0.6, 0, 1, 0.05))}
        ${row("Colour", swatches("hair.colour", HAIR_COLOURS, L.hair.colour))}
        ${row("Eyes", colour("eyes", L.eyes))}
        ${row("Expression", sel("expression", L.expression ?? "neutral", EXPRESSIONS))}
      </details>
      <details class="warp-section" data-section="doll-extra"><summary>Ears, tail, horns</summary>
        ${row("Ears", `<span class="warp-doll-pair">${sel("ears", L.ears ?? "", EARS, undefined, "human")}${colour("earColour", L.earColour ?? L.hair.colour)}</span>`)}
        ${row("Tail", `<span class="warp-doll-pair">${sel("tail", L.tail ?? "", TAILS, undefined, "none")}${colour("tailColour", L.tailColour ?? L.hair.colour)}</span>`)}
        ${row("Horns", sel("horns", L.horns ?? "", HORNS, undefined, "none"))}
      </details>
      <details class="warp-section" data-section="doll-outfit" open><summary>Outfit · ${L.outfit.length}</summary>
        ${row("Ready-made", `<select class="warp-input" data-doll-outfit><option value="">Pick one…</option>${Object.entries(OUTFITS).map(([k, x]) => `<option value="${k}">${esc(x.label)}</option>`).join("")}<option value="none">Nothing</option></select>`)}
        <div class="warp-doll-garments">${L.outfit.map(garmentRow).join("")}</div>
        ${L.outfit.length >= MAX_GARMENTS ? `<p class="warp-dim">That's as many layers as the doll can wear.</p>` : ""}
        ${L.outfit.length >= MAX_GARMENTS ? "" : row("Add", `<select class="warp-input" data-doll-add><option value="">A garment…</option>${KINDS.map((k) => `<option value="${k}">${cap(k)}</option>`).join("")}</select>`)}
        <label class="warp-doll-row"><span>Underwear when bare</span><input type="checkbox" data-doll-set="modest"${L.modest === false ? "" : " checked"}></label>
      </details>
      <details class="warp-section" data-section="doll-json"><summary>As data</summary>
        <p class="warp-dim">The look the helper writes and the game saves. Edit and apply, or paste one in.</p>
        <textarea class="warp-input warp-doll-json" data-doll-json rows="8">${esc(jsonDraft ?? JSON.stringify(L, null, 1))}</textarea>
        <button class="warp-btn" data-doll-json-apply>Apply</button>
      </details>
      <label class="warp-doll-row"><span>Show my doll in the status panel</span><input type="checkbox" data-doll-hud${st.hud ? " checked" : ""}></label>
    </div>`;
  }

  const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);
  const NUMERIC = new Set(["amount", "height", "flare", "damage"]);

  function setPath(L: Look, path: string, v: string | boolean) {
    const parts = path.split(".");
    if (parts.some((k) => BAD_KEYS.has(k))) return;
    if (path === "body.sex") {
      const sex: Sex = v === "m" ? "m" : "f";
      const from = Object.keys(PRESETS[L.body.sex]), to = Object.keys(PRESETS[sex]);
      // Same position in the list (slim stays slim); height and blend carry over.
      const map = (p: string) => to[Math.max(0, from.indexOf(p))] ?? to[0];
      L.body = { sex, preset: map(L.body.preset), ...(L.body.height ? { height: L.body.height } : {}), ...(L.body.blend ? { blend: { preset: map(L.body.blend.preset), amount: L.body.blend.amount } } : {}) };
      return;
    }
    if (path === "body.blend.preset") { L.body.blend = v ? { preset: String(v), amount: L.body.blend?.amount ?? 0.5 } : undefined; return; }
    if (path === "modest") { L.modest = v ? undefined : false; return; }
    const last = parts[parts.length - 1];
    let x: unknown = v;
    if (typeof v === "string") {
      if (v === "") x = undefined;
      else if (NUMERIC.has(last) || (last === "length" && parts[0] === "hair")) { const n = Number(v); x = Number.isFinite(n) ? n : undefined; }
    }
    let obj: Record<string, unknown> = L as unknown as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      const next = Array.isArray(obj) ? (obj as unknown[])[Number(k)] : Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : undefined;
      if (!next || typeof next !== "object") return;
      obj = next as Record<string, unknown>;
    }
    if (x === undefined || (last === "pattern" && x === "none")) delete obj[last];
    else obj[last] = x;
    if (["ears", "tail", "horns"].includes(path) && x === undefined) (L as unknown as Record<string, unknown>)[path] = null;
  }

  /** Redraw just the doll (while dragging a slider), or the whole tab. */
  function refresh(root: HTMLElement, full: boolean) {
    // Keep the saved look drawable whatever was just edited (a cleared colour, a stray value).
    st[st.who] = cleanLook(st[st.who]);
    save();
    if (full) { o.changed(); return; }
    const stage = root.querySelector<HTMLElement>("[data-doll-stage]");
    if (stage) stage.innerHTML = renderDoll(cur(), { id: `lab${st.who}` });
  }

  function ask(source: DollRequest["source"]) {
    const who = st.who;
    if (who === "them" && source === "profile" && !st.themName.trim()) { st.notes.them = "Type their name first."; o.changed(); return; }
    busy.add(who);
    o.send({ type: "doll_look", chatId: o.chatId(), who: who === "you" ? "you" : st.themName.trim() || "them", source, text: source === "text" ? text : undefined, current: source === "story" ? cur() : undefined, worn: worn() });
    o.changed();
  }

  function handle(e: Event, root: HTMLElement): boolean {
    const t = e.target as HTMLElement;
    if (!t.closest?.(".warp-doll-lab")) return false;
    const L = cur();
    if (e.type === "click") {
      const b = t.closest<HTMLElement>("[data-doll-who],[data-doll-pick],[data-doll-del],[data-doll-ask],[data-doll-json-apply]");
      // Anything else (a section opening, a checkbox) is left to the browser and the drawer.
      if (!b) return false;
      e.preventDefault();
      if (b.dataset.dollWho) { if (b.dataset.dollWho === "you" || b.dataset.dollWho === "them") { st.who = b.dataset.dollWho; jsonDraft = null; refresh(root, true); } }
      else if (b.dataset.dollPick) { setPath(L, b.dataset.dollPick, b.dataset.value ?? ""); refresh(root, true); }
      else if (b.dataset.dollDel) { const i = Number(b.dataset.dollDel); if (Number.isInteger(i) && i >= 0 && i < L.outfit.length) { L.outfit.splice(i, 1); refresh(root, true); } }
      else if (b.dataset.dollAsk) { const s = b.dataset.dollAsk; if (s === "profile" || s === "story" || s === "text") ask(s); }
      else if (b.hasAttribute("data-doll-json-apply")) {
        const ta = root.querySelector<HTMLTextAreaElement>("[data-doll-json]");
        try { st[st.who] = cleanLook(JSON.parse(ta?.value ?? "")); st.notes[st.who] = ""; jsonDraft = null; }
        catch { jsonDraft = ta?.value ?? ""; st.notes[st.who] = "That isn't valid JSON — fix it and apply again."; }
        refresh(root, true);
      }
      return true;
    }
    if (t.matches("[data-doll-text]")) { text = (t as HTMLTextAreaElement).value; return true; }
    if (t.matches("[data-doll-name]")) {
      st.themName = (t as HTMLInputElement).value.slice(0, 80);
      save();
      const tab = root.querySelector<HTMLElement>("[data-doll-them-tab]");
      if (tab) tab.textContent = st.themName.trim() || "Someone else";
      return true;
    }
    if (t.matches("[data-doll-json]")) { jsonDraft = (t as HTMLTextAreaElement).value; return true; }
    if (t.matches("[data-doll-hud]") && e.type === "change") { st.hud = (t as HTMLInputElement).checked; refresh(root, true); return true; }
    if (t.matches("[data-doll-outfit]") && e.type === "change") {
      const k = (t as HTMLSelectElement).value;
      if (k && (k === "none" || OUTFITS[k])) { L.outfit = k === "none" ? [] : outfitFor(k, L.body.sex); refresh(root, true); }
      return true;
    }
    if (t.matches("[data-doll-add]") && e.type === "change") {
      const k = (t as HTMLSelectElement).value as Kind;
      if ((KINDS as readonly string[]).includes(k) && L.outfit.length < MAX_GARMENTS) { L.outfit.push({ kind: k, colour: "#5a6a8a" }); refresh(root, true); }
      return true;
    }
    const path = t.dataset?.dollSet;
    if (path) {
      const v = (t as HTMLInputElement).type === "checkbox" ? (t as HTMLInputElement).checked : (t as HTMLInputElement).value;
      setPath(L, path, v);
      // Sliders and colour wheels redraw live; picking from a list rebuilds the tab.
      const live = (t as HTMLInputElement).type === "range" || (t as HTMLInputElement).type === "color";
      if (e.type === "input" && live) refresh(root, false);
      else if (e.type === "change") refresh(root, !live || path.startsWith("body.blend"));
      return true;
    }
    return false;
  }

  function onLook(m: { who: string; look: unknown | null; note: string; name?: string; error?: string }) {
    const who: Who = m.who === "you" ? "you" : "them";
    busy.delete(who);
    if (m.look) { st[who] = cleanLook(m.look); st.notes[who] = m.note; if (who === "them" && m.name && m.name !== "them" && !st.themName.trim()) st.themName = m.name; }
    else st.notes[who] = m.error ? `The helper couldn't do it: ${m.error}` : "";
    save();
    o.changed();
  }

  function hudSection() {
    if (!st.hud) return null;
    return { id: "doll", title: "Doll", count: 0, open: true, body: `<div class="warp-doll-hud">${renderDoll(st.you, { id: "hud" })}</div>` };
  }

  return { html, handle, onLook, hudSection, current: cur };
}

export const DOLL_STYLES = `
.warp-doll-lab { display: flex; flex-direction: column; gap: 8px; }
.warp-doll-who { display: flex; gap: 4px; }
.warp-doll-stage { display: flex; justify-content: center; background: radial-gradient(ellipse at 50% 85%, rgba(255,255,255,.07), transparent 60%), color-mix(in srgb, var(--lumiverse-fill, #1c1a24) 70%, transparent); border-radius: 12px; padding: 6px 0; }
.warp-doll-stage svg { height: 440px; width: auto; max-width: 100%; }
.warp-doll-note { margin: 0; font-size: 12px; }
.warp-doll-helper h3 { margin: 0 0 6px; }
.warp-doll-buttons { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.warp-doll-text { width: 100%; box-sizing: border-box; resize: vertical; margin-bottom: 6px; }
.warp-doll-json { width: 100%; box-sizing: border-box; font-family: ui-monospace, monospace; font-size: 11px; }
.warp-doll-row { display: grid; grid-template-columns: 96px 1fr; align-items: center; gap: 8px; margin: 4px 0; font-size: 12px; }
.warp-doll-row > span:first-child { opacity: .75; }
.warp-doll-pair { display: flex; gap: 6px; align-items: center; }
.warp-doll-pair select { flex: 1; }
.warp-doll-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.warp-doll-swatches { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.warp-doll-swatch { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; padding: 0; cursor: pointer; }
.warp-doll-swatch.on { border-color: var(--warp-accent, #8b7cff); }
.warp-doll-colour { width: 26px; height: 22px; padding: 0; border: none; background: none; cursor: pointer; }
.warp-doll-range { width: 100%; }
.warp-doll-garment { border: 1px solid var(--lumiverse-border, rgba(255,255,255,.12)); border-radius: 8px; margin: 4px 0; padding: 2px 6px; }
.warp-doll-garment > summary { display: flex; align-items: center; gap: 8px; cursor: pointer; list-style: none; padding: 3px 0; }
.warp-doll-garment > summary::-webkit-details-marker { display: none; }
.warp-doll-gname { flex: 1; }
.warp-doll-x { padding: 0 7px; line-height: 18px; }
.warp-doll-fields { padding: 2px 0 6px; }
.warp-doll-hud { display: flex; justify-content: center; }
.warp-doll-hud svg { height: 300px; width: auto; max-width: 100%; }
.warp-panel-solo .warp-doll-hud svg, .warp-col .warp-doll-hud svg { height: auto; width: 100%; max-height: calc(var(--warp-overlay-max, 70vh) - 56px); }
`;
