// A test bench for the stage (dungeon runs and dates), outside Lumiverse:
// `bun run bench`, then open /stage.html. The scenes are real engine state from the
// templates, so clicking moves, fights and talks the way it does in a chat.

import { loadRuleset } from "../engine/loader.js";
import { resolveTurnFull } from "../engine/resolve.js";
import { foldEvents, initialState, type GameState } from "../engine/state.js";
import { TEMPLATES } from "../engine/templates/index.js";
import { battleCommand, chooseEvent, descend, enterDungeon, moveTo, shopBuy, useItem, type DungeonResult } from "../engine/dungeon/run.js";
import { buildDungeonEntries, buildDungeonView } from "../engine/dungeon/view.js";
import { buildDateView } from "../engine/date/view.js";
import type { BackendToFrontend } from "../shared/protocol.js";
import type { Style } from "./arcade/themes.js";
import { dressStage, formatStory, renderStage, replaceStageScene, type StageMode } from "./stage.js";
import { STAGE_STYLES } from "./stage-styles.js";
import { STYLES } from "./styles.js";
import type { DungeonPick } from "./dungeon-ui.js";

type StateMsg = Extract<BackendToFrontend, { type: "state" }>;

const css = document.createElement("style");
css.textContent = STYLES + STAGE_STYLES;
document.head.appendChild(css);

const bar = document.getElementById("bar")!;
bar.innerHTML = `
  <select id="tpl">${TEMPLATES.filter((t) => ["hometown", "questbound", "starfarer"].includes(t.id)).map((t) => `<option value="${t.id}">${t.name}</option>`).join("")}</select>
  <select id="look"><option value="medieval">Medieval</option><option value="modern" selected>Modern</option><option value="scifi">Sci-fi</option></select>
  <button data-go="gate">Entrance</button><button data-go="run">Exploring</button><button data-go="fight">Battle</button><button data-go="date">Date</button><button data-go="topics">Topics</button><button data-go="plan">Plans</button><button data-go="outing">Outing</button>
  <label><input id="photo" type="checkbox"> photo</label>
  <label>Fit <select id="fit"><option>cover</option><option>contain</option><option>fill</option><option>none</option><option>scale-down</option></select></label>
  <label>Picture <select id="picture"><option value="ready">Ready</option><option value="busy">Generating</option><option value="error">Failed</option></select></label>`;

const stageEl = document.createElement("div");
stageEl.className = "warp-stage";
stageEl.innerHTML = `<div class="warp-stage-scene"></div>
  <section class="warp-stage-story" aria-label="The story">
    <div class="warp-stage-story-head"><span class="warp-stage-speaker"></span><button class="warp-stage-fold" type="button" data-stage-fold title="Fold the story">▾</button></div>
    <div class="warp-stage-story-body"><div class="warp-stage-said"></div><div class="warp-stage-text"></div><div class="warp-stage-status"></div></div>
    <form class="warp-stage-say"><textarea rows="1" placeholder="Say or do something…"></textarea><button type="submit" class="warp-stage-btn primary">Send</button></form>
  </section>`;
document.getElementById("host")!.appendChild(stageEl);
const sceneEl = stageEl.querySelector<HTMLElement>(".warp-stage-scene")!;
const storyEl = stageEl.querySelector<HTMLElement>(".warp-stage-story")!;
new ResizeObserver(() => stageEl.style.setProperty("--warp-story-h", `${storyEl.offsetHeight}px`)).observe(storyEl);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let tpl = TEMPLATES[0];
let r = loadRuleset(tpl.parts.map((p, i) => ({ label: p.label, content: p.yaml, order: i }))).ruleset!;
let s: GameState = initialState(r);
let mode: StageMode = "gate";
let pick: DungeonPick = null;
let cat: string | null = null;
let fresh = false;
const mates = new Set<string>();

function load() {
  tpl = TEMPLATES.find((t) => t.id === $<HTMLSelectElement>("tpl").value)!;
  r = loadRuleset(tpl.parts.map((p, i) => ({ label: p.label, content: p.yaml, order: i }))).ruleset!;
}
const fold = (res: DungeonResult | { events: never[] }) => { if ("events" in res && res.events) s = foldEvents(r, [res.events], s); };
function atGate(): GameState {
  const d = Object.values(r.dungeons)[0];
  const g = initialState(r);
  if (d?.at[0]) { g.location = d.at[0]; g.locationName = r.locations[d.at[0]]?.name ?? d.at[0]; }
  return g;
}
function act(id: string, odds?: Record<string, Record<string, number>>, seed = `b${Date.now()}`) {
  fold(resolveTurnFull(r, s, { actionId: id, via: "choice" }, { seed, odds }).record);
  fresh = true;
}
function startDate(): boolean {
  for (const who of Object.keys(r.dating.people)) {
    for (const loc of Object.keys(r.locations)) {
      for (const hour of [10, 14, 19]) {
        const g = initialState(r);
        g.location = loc; g.minutes = hour * 60;
        const res = resolveTurnFull(r, g, { actionId: `date:talk@${who}`, via: "choice" }, { seed: "d" });
        const next = foldEvents(r, [res.record.events], g);
        if (next.date) { s = next; return true; }
      }
    }
  }
  return false;
}

function go(what: string) {
  load();
  pick = null; cat = null; fresh = false; mates.clear();
  if (what === "gate") { s = atGate(); mode = "gate"; }
  else if (what === "run" || what === "fight") {
    s = atGate();
    const d = Object.values(r.dungeons)[0];
    fold(enterDungeon(r, s, d.id, [], "bench-7"));
    mode = "dungeon";
    for (let i = 0; i < 40 && what === "run"; i++) {
      // a few safe steps, so some of the floor is showing
      const v = buildDungeonView(r, s)!;
      const next = v.tiles.find((t) => t.reachable && t.state === "seen") ?? null;
      if (!next || i > 2) break;
      fold(moveTo(r, s, next.x, next.y));
    }
    for (let i = 0; i < 60 && what === "fight" && !s.dungeon?.battle; i++) {
      const v = buildDungeonView(r, s)!;
      const ev = v.event?.choices.find((c) => c.ok);
      if (ev) { fold(chooseEvent(r, s, ev.id)); continue; }
      const next = v.tiles.find((x) => x.reachable && x.state === "hidden") ?? v.tiles.find((x) => x.reachable);
      if (!next) break;
      fold(moveTo(r, s, next.x, next.y));
    }
  } else {
    mode = "date";
    if (!startDate()) { s = initialState(r); render(); return; }
    const v = buildDateView(r, s, [])!;
    const topic = v.categories.flatMap((c) => c.topics).find((t) => !t.lock);
    if (topic) act(`date:topic:${topic.id}`, undefined, "bench-topic");
    if (what === "topics") cat = v.categories[0]?.id ?? null;
    if (what === "plan" || what === "outing") {
      // A fixture relationship, then real engine transitions, so the bench always reaches these screens.
      s = foldEvents(r, [[{ t: "rel", who: s.date!.who, stat: r.dating.love, set: 60, src: "manual" }]], s);
      act("date:ask_out", { "date:ask_out": { yes: 1, later: 0, no: 0 } }, "bench-plan");
      if (what === "outing") {
        const venue = buildDateView(r, s, [])!.moves.find((m) => m.kind === "venue");
        if (venue) act(venue.id, undefined, "bench-outing");
      }
    }
  }
  render();
}

function msg(): StateMsg {
  const photo = $<HTMLInputElement>("photo").checked;
  const picture = $<HTMLSelectElement>("picture").value;
  return {
    type: "state", chatId: "c", status: { state: "ok", name: r.name, source: null, issues: [], characterName: null, cardKind: "character", tags: [] },
    hud: { clock: { day: "Tuesday", time: "7:40 pm" }, date: "Tue 14 May", location: { name: s.locationName ?? "Somewhere" }, money: "£42" } as unknown as StateMsg["hud"],
    map: null, choices: [], records: [], suggestions: [], latestMessageId: "m", choicesAnchor: "m", busy: false,
    dungeon: buildDungeonView(r, s), dungeonEntries: buildDungeonEntries(r, s), date: buildDateView(r, s, []),
    look: r.look,
    scene: photo ? { kind: "date", seq: 1, lines: [], said: null,
      image: picture === "ready" ? "./stage-picture.svg" : null,
      imageFit: $<HTMLSelectElement>("fit").value as NonNullable<StateMsg["scene"]>["imageFit"],
      imageBusy: picture === "busy", writing: false,
      imageError: picture === "error" ? "Cue could not illustrate this date. Check the image connection in Cue and retry the picture." : undefined } : null,
  };
}

function render() {
  dressStage(stageEl, $<HTMLSelectElement>("look").value as Style);
  stageEl.dataset.mode = mode === "date" ? "date" : "dungeon";
  stageEl.dataset.view = mode;
  const m = msg();
  if (mode === "dungeon" && !m.dungeon) mode = "gate";
  stageEl.classList.toggle("bench-empty", mode === "date" && !m.date?.session);
  if (mode === "date" && !m.date?.session) { sceneEl.innerHTML = `<p style="padding:40px">${Object.keys(r.dating.people).length ? "The date is over." : "No dating in this rulebook. Choose Hometown or Starfarer to try dates."}</p>`; return; }
  replaceStageScene(sceneEl, renderStage(m, mode, { pick, mates, busy: false, cat, freshReaction: fresh }));
  fresh = false;
  const log = mode === "date" ? [] : (m.dungeon?.log ?? []);
  stageEl.querySelector(".warp-stage-speaker")!.textContent = mode === "date" ? (m.date?.person?.name ?? "") : "Narrator";
  stageEl.querySelector(".warp-stage-text")!.innerHTML = formatStory(mode === "date"
    ? `*They tuck a strand of hair behind one ear and laugh.* "You remembered that? I barely remember that."\n\nThe room hums around you.`
    : `${log[0] ?? "The air is cold and smells of wet stone."} *Somewhere below, water drips.*`);
}

bar.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-go]");
  if (b) go(b.dataset.go!);
});
$("look").addEventListener("change", render);
$("photo").addEventListener("change", render);
$("fit").addEventListener("change", render);
$("picture").addEventListener("change", render);
$("tpl").addEventListener("change", () => go(mode === "date" ? "date" : mode === "gate" ? "gate" : "run"));

stageEl.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const el = <T extends string>(a: T) => t.closest<HTMLElement>(`[data-${a}]`);
  const ds = (x: HTMLElement | null) => x?.dataset ?? {};
  if (el("stage-fold")) { storyEl.classList.toggle("folded"); return; }
  if (el("date-image-retry")) { $<HTMLSelectElement>("picture").value = "ready"; render(); return; }
  if (el("dg-enter")) { s = atGate(); fold(enterDungeon(r, s, ds(el("dg-enter")).dgEnter!, [...mates], `b${Date.now()}`)); mode = "dungeon"; }
  else if (el("dg-move")) { const [x, y] = ds(el("dg-move")).dgMove!.split(",").map(Number); fold(moveTo(r, s, x, y)); }
  else if (el("dg-descend")) fold(descend(r, s));
  else if (el("dg-choose")) fold(chooseEvent(r, s, ds(el("dg-choose")).dgChoose!));
  else if (el("dg-buy")) fold(shopBuy(r, s, ds(el("dg-buy")).dgBuy!));
  else if (el("dg-cancel")) pick = null;
  else if (el("dg-auto")) fold(battleCommand(r, s, { auto: ds(el("dg-auto")).dgAuto as "round" }));
  else if (el("dg-escape")) fold(battleCommand(r, s, { escape: true }));
  else if (el("dg-skill")) {
    const d = ds(el("dg-skill"));
    if (d.dgSkillTarget === "foe" || d.dgSkillTarget === "ally") pick = { kind: "skill", id: d.dgSkill!, target: d.dgSkillTarget };
    else fold(battleCommand(r, s, { skill: d.dgSkill! }));
  } else if (el("dg-item")) pick = { kind: "item", id: ds(el("dg-item")).dgItem!, target: ds(el("dg-item")).dgItem === "bomb" ? "foe" : "ally" };
  else if (el("dg-use")) pick = { kind: "use", id: ds(el("dg-use")).dgUse!, target: "ally" };
  else if (el("dg-target") && pick) {
    const target = ds(el("dg-target")).dgTarget!;
    if (pick.kind === "skill") fold(battleCommand(r, s, { skill: pick.id, target }));
    else if (pick.kind === "item") fold(battleCommand(r, s, { item: pick.id as "potion", target }));
    else fold(useItem(r, s, pick.id, target));
    pick = null;
  } else if (el("dg-leave") || el("stage-close")) { go("gate"); return; }
  else if (el("date-cat")) cat = ds(el("date-cat")).dateCat || null;
  else if (el("date-act")) { act(ds(el("date-act")).dateAct!); cat = null; }
  else return;
  render();
});
stageEl.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement;
  if (t.dataset.dgMate) { if (t.checked) mates.add(t.dataset.dgMate); else mates.delete(t.dataset.dgMate); render(); }
});
stageEl.querySelector("form")!.addEventListener("submit", (e) => {
  e.preventDefault();
  stageEl.querySelector(".warp-stage-status")!.textContent = "Free text uses the helper in Lumiverse. Use the choices in this offline bench.";
});

const hash = location.hash.slice(1).split(",");
if (hash[1]) $<HTMLSelectElement>("look").value = hash[1];
if (hash[2]) $<HTMLSelectElement>("tpl").value = hash[2];
go(hash[0] || "run");
