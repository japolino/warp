// The stage: a dungeon run or a date as its own full-screen experience, apart from
// the chat. The scene (map, battle, the person across the table) is rendered here;
// frontend.ts keeps the story box and the line you type alive between renders.

import type { BackendToFrontend, DateView, DungeonEntryView, DungeonView, FighterView } from "../shared/protocol.js";
import { bar, board, herePanel, memberCard, sprite, you, type DungeonPick } from "./dungeon-ui.js";
import { hue, knows, meter, odds, REACT_ICON, REACT_TONE, topicTile } from "./date-ui.js";
import { esc } from "./render.js";
import { SPRITES } from "./sprites.gen.js";

type StateMsg = Extract<BackendToFrontend, { type: "state" }>;

/** dungeon = a run in progress, gate = the entrance (picking who comes), date = a conversation or outing. */
export type StageMode = "dungeon" | "gate" | "date";

export interface StageUi {
  pick: DungeonPick;
  mates: Set<string>;
  busy: boolean;
  /** Selected topic category on a date. */
  cat: string | null;
  /** The last reaction changed since the previous render (plays its burst once). */
  freshReaction: boolean;
}

/** What the stage should show for this state (the entrance only when asked for). */
export function stageModeOf(s: StateMsg | null, wantGate: boolean): StageMode | null {
  if (s?.dungeon) return "dungeon";
  if (s?.date?.session) return "date";
  if (wantGate && s?.dungeonEntries.length) return "gate";
  return null;
}

// ───────────────────────── the story ─────────────────────────

/** Narration as light markup: paragraphs, *italics*, **bold**, and dialogue picked out. */
export function formatStory(text: string): string {
  const safe = esc(text.trim());
  if (!safe) return "";
  return safe.split(/\n{2,}/).map((p) => `<p>${p
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/(&quot;|“)([^\n]*?)(&quot;|”)/g, `<span class="warp-stage-q">$1$2$3</span>`)
    .replace(/\n/g, "<br>")}</p>`).join("");
}

function top(kicker: string, title: string, middle: string, actions: string): string {
  return `<header class="warp-stage-top">
    <div class="warp-stage-title"><span class="warp-stage-kicker">${kicker}</span><h1>${esc(title)}</h1></div>
    <div class="warp-stage-mid">${middle}</div>
    <div class="warp-stage-actions">${actions}<button class="warp-stage-btn ghost" data-stage-close title="Back to the chat (Esc)">Chat <span aria-hidden="true">⤓</span></button></div>
  </header>`;
}

// ───────────────────────── dungeon ─────────────────────────

function depthTrack(v: DungeonView): string {
  if (!v.floors) return `<div class="warp-stage-depth" title="Endless — floor ${v.depth}"><span class="warp-stage-depth-n">Floor ${v.depth}</span><span class="warp-stage-endless">∞</span></div>`;
  const pips = Array.from({ length: v.floors }, (_, i) => `<i class="${i + 1 < v.depth ? "past" : i + 1 === v.depth ? "now" : ""}${i + 1 === v.floors ? " last" : ""}"></i>`).join("");
  return `<div class="warp-stage-depth" title="Floor ${v.depth} of ${v.floors}"><span class="warp-stage-depth-n">Floor ${v.depth}<span class="warp-stage-of"> / ${v.floors}</span></span><span class="warp-stage-pips">${pips}</span>${v.boss ? `<span class="warp-stage-boss" title="A guardian blocks the way down">☠</span>` : ""}</div>`;
}

function purse(v: DungeonView): string {
  const pct = v.xpNext > 0 ? Math.min(100, (v.xp / v.xpNext) * 100) : 100;
  return `<div class="warp-stage-purse">
    <span class="warp-stage-lv" title="Party level">Lv ${v.level}</span>
    <span class="warp-stage-xp" title="${v.xp} / ${v.xpNext} XP"><span style="width:${pct.toFixed(1)}%"></span></span>
    <span class="warp-stage-gold" title="Gold carried — kept if you leave, lost if you're wiped out">${sprite("gold", "warp-stage-coin")}${v.gold}</span>
  </div>`;
}

function foeCard(f: FighterView, targetable: boolean): string {
  const cls = ["warp-stage-foe", f.alive ? "" : "down", f.boss ? "boss" : f.elite ? "elite" : "", targetable && f.alive ? "targetable" : ""].filter(Boolean).join(" ");
  const tag = targetable && f.alive ? "button" : "div";
  return `<${tag} class="${cls}" ${targetable && f.alive ? `data-dg-target="${esc(f.id)}" title="Target ${esc(f.name)}"` : ""}>
    <div class="warp-stage-foe-glow"></div>
    ${sprite(f.sprite, "warp-stage-foe-img")}
    <div class="warp-stage-foe-name">${esc(f.name)}</div>
    ${bar(f.hp, f.mhp, "hp", "HP")}
  </${tag}>`;
}

function battle(v: DungeonView, ui: StageUi): string {
  const b = v.battle!;
  const foes = b.fighters.filter((f) => f.side === "foe");
  const party = b.fighters.filter((f) => f.side === "party");
  const active = party.find((f) => f.id === b.active);
  const pickFoe = ui.pick?.target === "foe";
  const pickAlly = ui.pick?.target === "ally";
  let menu = "";
  if (b.over) menu = `<div class="warp-stage-menu-note">The fight is over.</div>`;
  else if (ui.pick) menu = `<div class="warp-stage-menu-note warn">Choose ${ui.pick.target === "foe" ? "an enemy" : "an ally"} <button class="warp-stage-btn small" data-dg-cancel>Cancel</button></div>`;
  else if (active) {
    const skills = b.skills.map((s) => `<button class="warp-stage-cmd" data-dg-skill="${esc(s.id)}" data-dg-skill-target="${esc(s.target)}" ${s.usable && !ui.busy ? "" : "disabled"} title="${esc(s.cost || "Free")}"><span>${esc(s.name)}</span>${s.cost ? `<small>${esc(s.cost)}</small>` : ""}</button>`).join("");
    const items = v.bag.map((i) => `<button class="warp-stage-cmd item" data-dg-item="${esc(i.id)}" ${ui.busy ? "disabled" : ""}>${sprite(i.sprite, "warp-dg-mini")}<span>${esc(i.name)}</span><small>×${i.count}</small></button>`).join("");
    const who = you(active.name);
    menu = `<div class="warp-stage-turn">${sprite(active.sprite, "warp-stage-turn-face")}${who === "You" ? "<b>Your</b> turn" : `<b>${esc(who)}</b>'s turn`}</div>
      <div class="warp-stage-cmds">${skills}</div>
      ${items ? `<div class="warp-stage-cmds">${items}</div>` : ""}
      <div class="warp-stage-cmds tail">
        ${b.canEscape ? `<button class="warp-stage-cmd flee" data-dg-escape ${ui.busy ? "disabled" : ""}>Escape</button>` : ""}
        <button class="warp-stage-cmd" data-dg-auto="round" ${ui.busy ? "disabled" : ""} title="Everyone picks a sensible move for this round">Auto round</button>
        <button class="warp-stage-cmd" data-dg-auto="battle" ${ui.busy ? "disabled" : ""} title="Fight it out automatically">Auto battle</button>
      </div>`;
  }
  const kind = b.kind === "boss" ? "Floor guardian" : b.kind === "elite" ? "Elite battle" : "Battle";
  return `<main class="warp-stage-main warp-stage-battle">
    <section class="warp-stage-arena ${esc(b.kind)}">
      <div class="warp-stage-arena-head"><span class="warp-stage-kicker">${kind}</span><span class="warp-stage-round">Round ${b.round}</span></div>
      <div class="warp-stage-foes">${foes.map((f) => foeCard(f, pickFoe)).join("")}</div>
      <div class="warp-stage-ticker" aria-live="polite">${b.log.slice(-4).map((l, i, a) => `<div class="${i === a.length - 1 ? "new" : ""}">${esc(you(l))}</div>`).join("")}</div>
    </section>
    <section class="warp-stage-command">
      <div class="warp-stage-party">${party.map((f) => memberCard(f, { targetable: pickAlly })).join("")}</div>
      <div class="warp-stage-menu">${menu}</div>
    </section>
  </main>`;
}

function dungeonScene(v: DungeonView, ui: StageUi): string {
  const floor = SPRITES[`floor_${v.theme}`] ?? SPRITES.floor_cave;
  const head = top(`${sprite("stairs", "warp-stage-kicker-icon")} Dungeon`, v.name, `${depthTrack(v)}${purse(v)}`,
    v.battle ? "" : `<button class="warp-stage-btn" data-dg-leave ${ui.busy ? "disabled" : ""} title="Climb out and keep what you've found">Leave</button>`);
  const bg = `<div class="warp-stage-bg" style="--warp-stage-tex:url(${floor})"></div>`;
  if (v.battle) return bg + head + battle(v, ui);
  const pickAlly = ui.pick?.kind === "use";
  const bag = v.bag.filter((i) => i.id !== "bomb").map((i) => `<button class="warp-stage-chip" data-dg-use="${esc(i.id)}" ${ui.busy ? "disabled" : ""} title="Use ${esc(i.name)}">${sprite(i.sprite, "warp-dg-mini")}${esc(i.name)} <b>×${i.count}</b></button>`).join("");
  const bombs = v.bag.find((i) => i.id === "bomb");
  const here = herePanel(v, { pick: ui.pick, mates: ui.mates, busy: ui.busy });
  return bg + head + `<main class="warp-stage-main warp-stage-run">
    <section class="warp-stage-map">
      <div class="warp-stage-board">${board(v)}</div>
      <div class="warp-stage-bag">${bag}${bombs ? `<span class="warp-stage-chip muted">${sprite("bomb", "warp-dg-mini")}Bomb <b>×${bombs.count}</b></span>` : ""}${v.loot.length ? `<span class="warp-stage-loot" title="Kept when you leave">Found: ${esc(v.loot.map((l) => `${l.name}${l.count > 1 ? ` ×${l.count}` : ""}`).join(", "))}</span>` : ""}</div>
    </section>
    <aside class="warp-stage-side">
      <div class="warp-stage-party">${v.party.map((f) => memberCard(f, { targetable: pickAlly })).join("")}</div>
      ${pickAlly ? `<div class="warp-stage-menu-note warn">Who drinks it? <button class="warp-stage-btn small" data-dg-cancel>Cancel</button></div>` : ""}
      ${here ? `<div class="warp-stage-here">${here}</div>` : ""}
      <div class="warp-stage-log">${v.log.slice(0, 7).map((l) => `<div>${esc(you(l))}</div>`).join("")}</div>
    </aside>
  </main>`;
}

function gateScene(entries: DungeonEntryView[], ui: StageUi): string {
  const first = entries[0];
  const floor = SPRITES[`floor_${first?.theme ?? "cave"}`] ?? SPRITES.floor_cave;
  const cards = entries.map((e) => `<article class="warp-stage-gate">
    <div class="warp-stage-gate-head">${sprite("stairs", "warp-stage-gate-icon")}<div><h2>${esc(e.name)}</h2>
      <div class="warp-stage-dim">${e.deepest ? `Deepest so far: floor ${e.deepest}` : "Unexplored"}${e.floors ? ` · ${e.floors} floors` : " · endless"}</div></div></div>
    ${e.desc ? `<p>${esc(e.desc)}</p>` : ""}
    ${e.max && e.companions.length ? `<div class="warp-stage-kicker">Bring along — up to ${e.max}</div>
      <div class="warp-stage-mates">${e.companions.map((c) => `<label class="warp-stage-mate${ui.mates.has(c.id) ? " on" : ""}"><input type="checkbox" data-dg-mate="${esc(c.id)}" ${ui.mates.has(c.id) ? "checked" : ""} ${!ui.mates.has(c.id) && ui.mates.size >= e.max ? "disabled" : ""}><span class="warp-stage-mate-name">${esc(c.name)}</span><span class="warp-stage-dim">${esc(c.cls)}${c.present ? " · here" : ""}</span></label>`).join("")}</div>` : ""}
    <p class="warp-stage-dim">Tiles are face down until you step on them; one of them leads down. Leave whenever you like and keep what you found — get wiped out and you lose it.</p>
    <button class="warp-stage-btn primary" data-dg-enter="${esc(e.id)}" ${ui.busy ? "disabled" : ""}>Enter ${esc(e.name)}</button>
  </article>`).join("");
  return `<div class="warp-stage-bg" style="--warp-stage-tex:url(${floor})"></div>`
    + top(`${sprite("stairs", "warp-stage-kicker-icon")} Dungeon`, entries.length === 1 ? first.name : "Dungeons", "", "")
    + `<main class="warp-stage-main warp-stage-gates">${cards}</main>`;
}

// ───────────────────────── date ─────────────────────────

function ring(love: number, fear: number, name: string, face: string): string {
  const C = 2 * Math.PI * 46, c2 = 2 * Math.PI * 38;
  const l = Math.max(0, Math.min(1, love)), f = Math.max(0, Math.min(1, fear));
  return `<div class="warp-stage-portrait" style="--warp-hue:${hue(name)}">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" class="track"/>
      ${l > 0.005 ? `<circle cx="50" cy="50" r="46" class="love" stroke-dasharray="${(C * l).toFixed(1)} ${C.toFixed(1)}"/>` : ""}
      ${f > 0.005 ? `<circle cx="50" cy="50" r="38" class="track thin"/><circle cx="50" cy="50" r="38" class="fear" stroke-dasharray="${(c2 * f).toFixed(1)} ${c2.toFixed(1)}"/>` : ""}
    </svg>
    <span class="warp-stage-initial">${esc(name.trim().charAt(0).toUpperCase() || "?")}</span>
    <span class="warp-stage-face" aria-hidden="true">${face}</span>
  </div>`;
}

function ladder(v: DateView): string {
  const p = v.person!;
  if (!v.stages.length) return "";
  if (p.hostile) return `<ol class="warp-stage-ladder"><li class="hostile now">${esc(p.stage)}</li></ol>`;
  return `<ol class="warp-stage-ladder" aria-label="Where you stand">${v.stages.map((st, i) => `<li class="${i < p.stageIndex ? "past" : i === p.stageIndex ? "now" : ""}">${esc(st)}</li>`).join("")}</ol>`;
}

function dateScene(v: DateView, ui: StageUi): string {
  const s = v.session!;
  const p = v.person!;
  const kicker = s.kind === "outing" ? `On a date${s.venue ? ` · ${esc(s.venue)}` : ""}` : s.kind === "plan" ? "Making plans" : "Talking with";
  const fatigueTone = s.fatigue >= 80 ? "bad" : s.fatigue >= 60 ? "warn" : "good";
  const last = s.last
    ? `<div class="warp-stage-reaction warp-tone-${REACT_TONE[s.last.reaction]}${ui.freshReaction ? " fresh" : ""}"><span class="warp-stage-reaction-icon">${REACT_ICON[s.last.reaction]}</span><div><b>${esc(s.last.text)}</b><span>${esc(s.last.label)}</span></div></div>`
    : `<div class="warp-stage-reaction quiet"><span class="warp-stage-reaction-icon">✦</span><div><b>Say something</b><span>Pick a topic, or write your own line below.</span></div></div>`;
  const outing = s.kind === "outing"
    ? `<div class="warp-stage-outing">
        <div class="warp-stage-beats" title="${s.closing ? "Winding down" : `Moment ${Math.min(s.beat + 1, s.beats)} of ${s.beats}`}">${Array.from({ length: s.beats }, (_, i) => `<i class="${i < s.beat ? "past" : i === s.beat && !s.closing ? "now" : ""}"></i>`).join("")}</div>
        ${meter("Enjoyment", s.enjoy / 100, `${Math.round(s.enjoy)}%`, "enjoy")}
      </div>`
    : s.kind === "plan" ? `<div class="warp-stage-outing plan">🗓 They said yes — pick where to go.</div>` : "";

  const groups = new Map<string, DateView["moves"]>();
  for (const m of v.moves) groups.set(m.group, [...(groups.get(m.group) ?? []), m]);
  const moves = [...groups].map(([g, list]) => `<div class="warp-stage-group">
      <div class="warp-stage-kicker">${esc(g)}</div>
      <div class="warp-stage-moves">${list.map((m) => `<button class="warp-stage-move ${esc(m.kind)}" data-date-act="${esc(m.id)}" title="${esc(m.desc ?? "")}"${ui.busy ? " disabled" : ""}><span>${esc(m.label)}</span>${odds(m.odds)}</button>`).join("")}</div>
    </div>`).join("");

  const cats = v.categories;
  const cat = cats.find((c) => c.id === ui.cat) ?? cats.find((c) => c.topics.some((t) => !t.lock)) ?? cats[0];
  const topics = cats.length ? `<div class="warp-stage-topics">
      <div class="warp-stage-cats" role="tablist">${cats.map((c) => {
        const open = c.topics.filter((t) => !t.lock).length;
        return `<button class="warp-stage-cat" role="tab" aria-selected="${c.id === cat?.id}" data-date-cat="${esc(c.id)}">${c.icon} <span>${esc(c.label)}</span>${open ? `<small>${open}</small>` : " 🔒"}</button>`;
      }).join("")}</div>
      <div class="warp-stage-topic-grid">${cat ? cat.topics.map((t) => topicTile(t, ui.busy)).join("") : ""}</div>
    </div>` : "";

  return `<div class="warp-stage-bg" style="--warp-hue:${hue(p.name)}"></div>`
    + top(kicker, p.name, ladder(v), "")
    + `<main class="warp-stage-main warp-stage-date ${esc(s.kind)}">
      <section class="warp-stage-heart">
        ${ring(p.love, p.fear, p.name, s.moodFace)}
        <div class="warp-stage-mood">${esc(s.moodLabel)}</div>
        ${last}
        <div class="warp-stage-gauges">
          ${meter("Love", p.love, p.loveText, "love")}
          ${p.fear > 0.005 ? meter("Fear", p.fear, p.fearText, "fear") : ""}
          ${meter("Fatigue", s.fatigue / 100, s.fatigue >= 100 ? "Done talking" : s.fatigue >= 80 ? "Tired of talking" : s.fatigue >= 60 ? "Flagging" : "Fresh", `fatigue ${fatigueTone}`)}
        </div>
        <div class="warp-stage-streak${s.combo >= 3 ? " hot" : ""}" title="Good reactions in a row boost love">${s.combo >= 3 ? "🔥" : "✦"} Streak ×${s.combo}</div>
        ${outing}
      </section>
      <section class="warp-stage-deck">
        ${moves}
        ${topics}
        <div class="warp-stage-knows"><div class="warp-stage-kicker">What you know about ${esc(p.name)}</div>${knows(p)}</div>
      </section>
    </main>`;
}

// ───────────────────────── entry ─────────────────────────

export function renderStage(s: StateMsg, mode: StageMode, ui: StageUi): string {
  if (mode === "dungeon" && s.dungeon) return dungeonScene(s.dungeon, ui);
  if (mode === "date" && s.date?.session && s.date.person) return dateScene(s.date, ui);
  if (mode === "gate") return gateScene(s.dungeonEntries, ui);
  return "";
}

/** The story box's speaker label: who the scene is with. */
export function storySpeaker(s: StateMsg | null, mode: StageMode | null): string {
  if (mode === "date" && s?.date?.session) return s.date.session.name;
  if (mode === "dungeon" && s?.dungeon) return s.dungeon.name;
  return "The story";
}
