// The arcade: a full-screen overlay where a check is played instead of rolled, or a
// table is sat at. Briefing (what's at stake, the score to beat, your aids, the song
// or the stake) → countdown → the game with the bar filling beside it → the result,
// stamped like a roll. What happened goes back as a few plain words for the story.

import { aidTotal, aidWords, GAMES, tierFromScore, type GameAid, type GameBar, type GameId, type GameResult } from "../../engine/game-ids.js";
import type { Tier } from "../../engine/ruleset.js";
import type { ChoiceView } from "../../shared/protocol.js";
import { arcBeats, seeded, type Finish, type GameDef, type Kit, type Play, makeCanvas } from "./kit.js";
import { GAME_DEFS } from "./games/index.js";
import { Synth } from "./synth.js";
import { builtinSongs, suggestSong, TIER_EASE, TIER_LABEL, mmss, type Song } from "./songs.js";
import { importedSongs, importOsz, removeImported } from "./library.js";
import { loadFonts, textureUrl, THEMES, type Style, type Theme } from "./themes.js";

export type ArcadeOutcome =
  | { kind: "played"; result: GameResult }
  | { kind: "roll"; params?: Record<string, string> }
  | { kind: "cancel" };

export interface ArcadeSurface { root: HTMLElement; show(on: boolean): void }
export interface ArcadeHost {
  surface(): ArcadeSurface | null;
  volume(): number;
  sound(): boolean;
  reduced(): boolean;
  /** A look the player always wants, overriding the rulebook's. */
  look?(): Style | null;
}

const TIER_WORD: Record<Tier, string> = { crit_success: "Critical!", success: "Success", partial: "Partial", fail: "Failed", crit_fail: "Disaster" };
const TIER_TONE: Record<Tier, string> = { crit_success: "crit", success: "good", partial: "warn", fail: "bad", crit_fail: "bad" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (x: number) => `${Math.round(x * 100)}%`;
function store(key: string, value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem(`warp:arcade:${key}`, value);
    return localStorage.getItem(`warp:arcade:${key}`);
  } catch { return null; }
}

export function createArcade(host: ArcadeHost) {
  let surface: ArcadeSurface | null = null;
  let running = false;

  async function run(choice: ChoiceView, auto: boolean): Promise<ArcadeOutcome> {
    if (running) return { kind: "cancel" };
    surface ??= host.surface();
    if (!surface || (!choice.game && !choice.gamble)) return { kind: "roll" };
    running = true;
    try {
      return await session(surface, choice, auto, host);
    } finally {
      running = false;
      surface.show(false);
      surface.root.innerHTML = "";
    }
  }
  return { run, busy: () => running };
}

/** One visit to the arcade, from briefing to result. */
async function session(surface: ArcadeSurface, choice: ChoiceView, auto: boolean, host: ArcadeHost): Promise<ArcadeOutcome> {
  const root = surface.root;
  const muted = store("muted") === "1" || !host.sound();
  const synth = new Synth(host.volume(), muted);
  const offer = choice.game ?? null;
  const gamble = choice.gamble ?? null;
  let game: GameId = offer?.game ?? gamble!.game;
  let def: GameDef = GAME_DEFS[game];
  // The look: the player's override, else the rulebook's, else modern.
  const style: Style = host.look?.() ?? offer?.style ?? gamble?.style ?? "modern";
  const theme = THEMES[style];
  loadFonts();
  const el = document.createElement("div");
  el.className = "warp-ar";
  el.dataset.style = style;
  el.tabIndex = -1;
  if (style === "medieval") { el.style.setProperty("--ar-wood", `url(${textureUrl("wood", { ...theme, wood: "#4a2e18" })})`); el.style.setProperty("--ar-parch", `url(${textureUrl("parchment", theme)})`); }
  else if (style === "scifi") el.style.setProperty("--ar-panel-tex", `url(${textureUrl("panel", { ...theme, ground: "#060a10" })})`);
  root.innerHTML = "";
  root.appendChild(el);
  surface.show(true);

  let songs: Song[] = [];
  let song: Song | null = null;
  let stake = gamble?.stakes[0] ?? 0;
  const rng0 = seeded(offer?.seed ?? gamble?.seed ?? String(Date.now()));

  const loadSongs = async () => {
    if (!def.rhythm) { songs = []; song = null; return; }
    const mine = await importedSongs(game === "aim" ? "aim" : "tiles").catch(() => [] as Song[]);
    songs = [...builtinSongs(), ...mine];
    const last = store(`song:${game}`);
    song = songs.find((s) => s.id === last) ?? suggestSong(songs, offer?.level ?? 0.5, rng0);
  };
  await loadSongs();


  // ───────── briefing ─────────
  const briefing = (): Promise<"play" | "roll" | "cancel"> => new Promise((resolve) => {
    const draw = () => {
      el.dataset.game = game;
      const info = GAMES[game];
      const aids: GameAid[] = offer?.aids ?? gamble?.aids ?? [];
      const ease = song ? TIER_EASE[song.tier] : 0;
      const bar = offer ? shift(offer.bar, ease) : null;
      const switcher = offer && offer.options.length > 1
        ? `<div class="warp-ar-switch" role="tablist">${offer.options.map((g) => `<button role="tab" aria-selected="${g === game}" data-ar-game="${g}"><i>${GAMES[g].icon}</i>${esc(GAMES[g].name)}</button>`).join("")}</div>` : "";
      const odds = offer
        ? `<div class="warp-ar-odds"><span>The dice would give you</span><b>${pct(offer.chance)}</b></div>`
        : `<div class="warp-ar-odds"><span>House edge</span><b>${(gamble!.edge * 100).toFixed(1)}%</b></div>`;
      const barHtml = bar ? `<div class="warp-ar-need">
          <div class="warp-ar-need-track">
            <span class="z fail" style="width:${pct(bar.partial)}"></span><span class="z partial" style="width:${pct(bar.success - bar.partial)}"></span><span class="z success" style="width:${pct(bar.crit - bar.success)}"></span><span class="z crit" style="width:${pct(1 - bar.crit)}"></span>
          </div>
          <div class="warp-ar-need-legend"><span><i class="partial"></i>Partial ${pct(bar.partial)}</span><span><i class="success"></i>Success ${pct(bar.success)}</span><span><i class="crit"></i>Critical ${pct(bar.crit)}</span></div>
        </div>` : "";
      const aidHtml = aids.length
        ? `<div class="warp-ar-aids">${aids.map((a) => `<span class="warp-ar-aid${a.from.startsWith("★") ? " perk" : ""}"><b>${esc(a.from)}</b>${esc(aidWords(a.kind, a.amount))}</span>`).join("")}</div>`
        : `<div class="warp-ar-aids none">No aids — it's all you.</div>`;
      const partner = offer?.partner ? `<div class="warp-ar-partner">Tied to <b>${esc(offer.partner.name)}</b> · in step ${pct(offer.partner.sync)}</div>` : "";
      const stakes = gamble ? `<div class="warp-ar-stakes">
          <div class="warp-ar-label">Buy-in · you have ${esc(gamble.money.currency)}${gamble.money.have}</div>
          <div class="warp-ar-chips">${gamble.stakes.length ? gamble.stakes.map((x) => `<button class="warp-ar-chip${x === stake ? " on" : ""}" data-ar-stake="${x}"><span>${esc(gamble.money.currency)}${x}</span></button>`).join("") : `<span class="warp-ar-dim">You can't cover the smallest buy-in.</span>`}</div>
          <div class="warp-ar-dim">${gamble.rounds} ${game === "blackjack" ? "hands" : game === "roulette" ? "spins" : "pulls"} · walk away whenever you like</div>
        </div>` : "";
      const songHtml = def.rhythm ? songPicker() : "";
      el.innerHTML = `<div class="warp-ar-bg"></div>
        <div class="warp-ar-brief">
          <button class="warp-ar-x" data-ar-cancel title="Back to the story (Esc)" aria-label="Close">✕</button>
          <div class="warp-ar-brief-head">
            <div class="warp-ar-badge" aria-hidden="true"><span class="i">${info.icon}</span><span class="l">${esc(def.title.charAt(0))}</span></div>
            <div class="warp-ar-brief-title">
              <div class="warp-ar-kicker">${esc(offer ? `${offer.action} · ${offer.label}` : gamble!.action)}</div>
              <h1>${esc(def.title)}</h1>
              <p>${esc(info.pitch)}</p>
            </div>
            ${odds}
          </div>
          ${switcher}
          <div class="warp-ar-brief-body">
            <div class="warp-ar-col">
              ${barHtml}
              ${stakes}
              <div class="warp-ar-label">${offer ? "In your favour" : "Your edge"}</div>
              ${aidHtml}
              ${partner}
              <div class="warp-ar-label">How to play</div>
              <ul class="warp-ar-how">${def.howTo.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
              <div class="warp-ar-keys">${esc(def.controls)}</div>
            </div>
            ${songHtml ? `<div class="warp-ar-col songs">${songHtml}</div>` : ""}
          </div>
          <div class="warp-ar-brief-foot">
            <button class="warp-ar-btn primary" data-ar-play ${gamble && !gamble.stakes.length ? "disabled" : ""}>${gamble ? "Sit down" : "Play"} <kbd>Enter</kbd></button>
            <button class="warp-ar-btn ghost" data-ar-roll>${gamble ? "Let it play out" : "Roll the dice instead"}</button>
          </div>
        </div>`;
      el.querySelector<HTMLElement>("[data-ar-play]")?.focus({ preventScroll: true });
    };
    const songPicker = () => {
      const by: Record<string, Song[]> = {};
      for (const s of songs) (by[s.source === "import" ? "Your songs" : TIER_LABEL[s.tier]] ??= []).push(s);
      const order = ["Easy", "Normal", "Hard", "Brutal", "Your songs"];
      const easeTxt = (s: Song) => { const e = TIER_EASE[s.tier]; return e === 0 ? "bar as is" : e > 0 ? `bar +${Math.round(e * 100)}%` : `bar −${Math.round(-e * 100)}%`; };
      const offset = Number(store("offset") ?? 0);
      return `<div class="warp-ar-label">Song <span class="warp-ar-dim">· harder songs lower the bar</span></div>
        <div class="warp-ar-songs">${order.filter((k) => by[k]).map((k) => `<div class="warp-ar-song-group"><div class="warp-ar-song-tier t-${k.toLowerCase().replace(/\s/g, "")}">${k}</div>${by[k].map((s) => `<button class="warp-ar-song${s.id === song?.id ? " on" : ""}" data-ar-song="${esc(s.id)}">
            <span class="warp-ar-song-t">${esc(s.title)}</span><span class="warp-ar-song-m">${esc(s.by)} · ${mmss(s.length)} · ${easeTxt(s)}</span>
            ${s.source === "import" ? `<span class="warp-ar-song-x" data-ar-unsong="${esc(s.id)}" title="Remove from this browser">✕</span>` : ""}</button>`).join("")}</div>`).join("")}</div>
        <label class="warp-ar-import"><input type="file" accept=".osz" data-ar-osz hidden><span>＋ Import an osu! beatmap (.osz)</span></label>
        <div class="warp-ar-dim small">Imported songs stay in this browser. ${game === "aim" ? "Standard" : "Mania"} difficulties show up here.</div>
        <label class="warp-ar-offset">Audio offset <input type="range" min="-150" max="150" step="5" value="${offset}" data-ar-offset><b>${offset > 0 ? "+" : ""}${offset} ms</b></label>`;
    };
    draw();
    const onClick = async (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      synth.resume();
      const g = t.closest<HTMLElement>("[data-ar-game]");
      if (g) { game = g.dataset.arGame as GameId; def = GAME_DEFS[game]; await loadSongs(); draw(); return; }
      const st = t.closest<HTMLElement>("[data-ar-stake]");
      if (st) { stake = Number(st.dataset.arStake); synth.fx("chip"); draw(); return; }
      const un = t.closest<HTMLElement>("[data-ar-unsong]");
      if (un) { e.stopPropagation(); await removeImported(un.dataset.arUnsong!); await loadSongs(); draw(); return; }
      const so = t.closest<HTMLElement>("[data-ar-song]");
      if (so) { song = songs.find((s) => s.id === so.dataset.arSong) ?? song; if (song) store(`song:${game}`, song.id); draw(); return; }
      if (t.closest("[data-ar-play]")) { done("play"); return; }
      if (t.closest("[data-ar-roll]")) { done("roll"); return; }
      if (t.closest("[data-ar-cancel]")) { done("cancel"); return; }
    };
    const onChange = async (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.matches("[data-ar-osz]") && t.files?.[0]) {
        const label = el.querySelector(".warp-ar-import span");
        if (label) label.textContent = "Importing…";
        try {
          const r = await importOsz(t.files[0]);
          await loadSongs();
          const mine = songs.filter((s) => s.source === "import" && s.title.startsWith(r.title));
          if (mine[0]) { song = mine[0]; store(`song:${game}`, song.id); }
          draw();
        } catch (err) {
          if (label) label.textContent = `Couldn't import: ${(err as Error).message}`;
        }
      }
    };
    const onInput = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.matches("[data-ar-offset]")) { store("offset", t.value); const b = t.parentElement?.querySelector("b"); if (b) b.textContent = `${Number(t.value) > 0 ? "+" : ""}${t.value} ms`; }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches?.("input")) return;
      // Focused buttons keep native Enter/Space activation, including Roll and Cancel.
      if (e.key === "Enter" && (e.target as HTMLElement).closest?.("button")) return;
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if (!gamble || gamble.stakes.length) done("play"); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done("cancel"); }
    };
    let settled = false;
    function done(v: "play" | "roll" | "cancel") {
      if (settled) return;
      settled = true;
      el.removeEventListener("click", onClick);
      el.removeEventListener("change", onChange);
      el.removeEventListener("input", onInput);
      document.removeEventListener("keydown", onKey, true);
      resolve(v);
    }
    el.addEventListener("click", onClick);
    el.addEventListener("change", onChange);
    el.addEventListener("input", onInput);
    document.addEventListener("keydown", onKey, true);
    if (auto && (!gamble || gamble.stakes.length)) setTimeout(() => done("play"), 0);
  });

  const pick = await briefing();
  if (pick !== "play") {
    synth.close();
    return pick === "roll" ? { kind: "roll", ...(gamble ? { params: { stake: String(stake) } } : {}) } : { kind: "cancel" };
  }

  // The song the briefing settled on (set inside its handlers).
  const picked = song as Song | null;
  // ───────── the game ─────────
  const ease = picked ? TIER_EASE[picked.tier] : 0;
  const bar = offer ? shift(offer.bar, ease) : null;
  const play: Play = {
    mode: gamble ? "gamble" : "check",
    game,
    level: offer?.level ?? 0.5,
    bar,
    aids: offer?.aids ?? gamble?.aids ?? [],
    seed: offer?.seed ?? gamble!.seed,
    ...(offer?.partner ? { partner: offer.partner } : {}),
    ...(gamble ? { stake, rounds: gamble.rounds, currency: gamble.money.currency, edge: gamble.edge } : {}),
    ...(picked ? { song: picked } : {}),
  };
  const finish = await playGame(el, def, play, synth, host, theme, gamble ? `${gamble.action}` : `${offer!.action} · ${offer!.label}`);
  synth.hush();

  // ───────── result ─────────
  const result: GameResult = {
    game,
    beats: finish.beats,
    ...(finish.detail ? { detail: finish.detail } : {}),
    ...(finish.quit ? { quit: true } : {}),
    ...(picked ? { song: picked.title } : {}),
    ...(ease ? { ease } : {}),
    ...(finish.livesUsed ? { livesUsed: finish.livesUsed } : {}),
    ...(finish.perk ? { perk: finish.perk } : {}),
  };
  if (gamble) {
    result.stake = stake;
    result.net = Math.round((finish.chips ?? stake) - stake);
  } else result.score = Math.max(0, Math.min(1, finish.score ?? 0));
  await resultCard(el, result, bar, gamble?.money.currency ?? "", synth, def);
  synth.close();
  return { kind: "played", result };
}

function shift(bar: GameBar, by: number): GameBar {
  const f = (x: number) => Math.round(Math.max(0.05, Math.min(0.99, x + by)) * 100) / 100;
  return { critFail: bar.critFail === null ? null : f(bar.critFail), partial: f(bar.partial), success: f(bar.success), crit: f(bar.crit) };
}

/** The playing screen: the game, the bar beside it, lives, pause. */
function playGame(el: HTMLElement, def: GameDef, play: Play, synth: Synth, host: ArcadeHost, theme: Theme, kicker: string): Promise<Finish & { livesUsed: number; perk?: string }> {
  return new Promise((resolve) => {
    const bar = play.bar;
    const gamble = play.mode === "gamble";
    const lifeAids = play.aids.filter((a) => a.kind === "lives");
    let lives = aidTotal(play.aids, "lives");
    const startLives = lives;
    el.innerHTML = `<div class="warp-ar-bg"></div>
      <header class="warp-ar-top">
        <div class="warp-ar-title"><div class="warp-ar-kicker">${esc(kicker)}</div><h1><i>${GAMES[def.id].icon}</i>${esc(def.title)}${play.song ? `<small>♪ ${esc(play.song.title)}</small>` : ""}</h1></div>
        <div class="warp-ar-lives" aria-label="Lives"></div>
        <div class="warp-ar-tools">
          <button class="warp-ar-tool" data-ar-mute title="Sound on/off">${synth.muted ? "🔇" : "🔊"}</button>
          <button class="warp-ar-tool" data-ar-pause title="Pause (Esc)">❚❚</button>
        </div>
      </header>
      <main class="warp-ar-main">
        <section class="warp-ar-stage"><div class="warp-ar-game"></div><div class="warp-ar-banner" aria-live="polite"></div><div class="warp-ar-count"></div></section>
        <aside class="warp-ar-gauge${gamble ? " chips" : ""}">
          <div class="warp-ar-gauge-num"><b>${gamble ? `${esc(play.currency ?? "")}${play.stake}` : "0%"}</b><span>${GAMES[def.id].kind === "luck" ? "chips" : "score"}</span></div>
          <div class="warp-ar-gauge-track">
            <div class="warp-ar-gauge-fill"></div>
            ${bar ? [["partial", bar.partial], ["success", bar.success], ["crit", bar.crit]].map(([k, v]) => `<div class="warp-ar-tick ${k}" style="--at:${pct(v as number)}"><span>${k === "crit" ? "Critical" : k === "success" ? "Success" : "Partial"}</span></div>`).join("") : `<div class="warp-ar-tick even" style="--at:50%"><span>Break even</span></div>`}
          </div>
          <div class="warp-ar-status"></div>
        </aside>
      </main>
      <div class="warp-ar-pausecard" hidden>
        <div class="warp-ar-card"><h2>Paused</h2>
          <button class="warp-ar-btn primary" data-ar-resume>Resume <kbd>Esc</kbd></button>
          <button class="warp-ar-btn ghost" data-ar-quit>${gamble ? "Cash out now" : "Give up — keep the score so far"}</button>
        </div>
      </div>`;
    const stage = el.querySelector<HTMLElement>(".warp-ar-stage")!;
    const gameEl = el.querySelector<HTMLElement>(".warp-ar-game")!;
    const bannerEl = el.querySelector<HTMLElement>(".warp-ar-banner")!;
    const countEl = el.querySelector<HTMLElement>(".warp-ar-count")!;
    const fill = el.querySelector<HTMLElement>(".warp-ar-gauge-fill")!;
    const num = el.querySelector<HTMLElement>(".warp-ar-gauge-num b")!;
    const statusEl = el.querySelector<HTMLElement>(".warp-ar-status")!;
    const livesEl = el.querySelector<HTMLElement>(".warp-ar-lives")!;
    const pauseCard = el.querySelector<HTMLElement>(".warp-ar-pausecard")!;
    const drawLives = () => { livesEl.innerHTML = startLives ? Array.from({ length: startLives }, (_, i) => `<i class="${i < lives ? "on" : ""}">♥</i>`).join("") : ""; };
    drawLives();

    let paused = true, over = false, rafId = 0;
    const loops: ((dt: number, t: number) => void)[] = [];
    const keys: ((e: KeyboardEvent, down: boolean) => boolean | void)[] = [];
    const canvases: { dispose(): void }[] = [];
    const samples: number[] = [];
    let lastScore = 0, livesUsed = 0, perk: string | undefined;
    const pauseHooks: ((p: boolean) => void)[] = [];

    const tone = (x: number): string => {
      if (!bar) return x >= 0.5 ? "good" : "bad";
      const t = tierFromScore(bar, x);
      return TIER_TONE[t];
    };
    const quitFns: (() => void)[] = [];
    const kit: Kit = {
      play, theme, root: gameEl, rng: seeded(`${play.seed}:${Date.now()}`), synth,
      aid: (k) => aidTotal(play.aids, k),
      canvas() { const c = makeCanvas(gameEl); canvases.push(c); return c; },
      loop(fn) { loops.push(fn); },
      onKey(fn) { keys.push(fn); },
      score(x) {
        lastScore = Math.max(0, Math.min(1, x));
        fill.style.setProperty("--v", pct(lastScore));
        fill.dataset.tone = tone(lastScore);
        num.textContent = pct(lastScore);
      },
      chips(n) {
        const stake = play.stake ?? 100;
        const x = Math.max(0, Math.min(1, n / (stake * 2)));
        fill.style.setProperty("--v", pct(x));
        fill.dataset.tone = n >= stake ? "good" : "bad";
        num.textContent = gamble ? `${play.currency ?? ""}${Math.round(n)}` : `${Math.round(n)}`;
        if (!gamble) lastScore = x;
      },
      status(text) { statusEl.textContent = text; },
      lives: {
        left: () => lives,
        spend(why) {
          if (lives <= 0) return false;
          lives--; livesUsed++;
          const from = lifeAids.find((a) => a.from.startsWith("★"));
          if (from && !perk) perk = from.from.replace(/^★\s*/, "");
          drawLives();
          synth.fx("life");
          kit.banner(why ?? "Second chance!", "gold");
          return true;
        },
      },
      banner(text, t = "info") {
        const b = document.createElement("div");
        b.className = `warp-ar-ban ${t}`;
        b.textContent = text;
        bannerEl.appendChild(b);
        setTimeout(() => b.remove(), 1500);
      },
      shake(s = 1) {
        if (host.reduced()) return;
        stage.style.setProperty("--ar-shake", `${Math.min(14, 5 * s)}px`);
        stage.classList.remove("shake"); void stage.offsetWidth; stage.classList.add("shake");
      },
      finish(f) {
        if (over) return;
        over = true;
        cancelAnimationFrame(rafId);
        cleanup();
        const final = f.score ?? lastScore;
        const beats = [...arcBeats(samples, final), ...f.beats].slice(0, 5);
        setTimeout(() => resolve({ ...f, beats, livesUsed, ...(perk ? { perk } : {}) }), 650);
      },
      track(x) { samples.push(Math.max(0, Math.min(1, x))); },
      get paused() { return paused; },
      get reduced() { return host.reduced(); },
      onPause(fn) { pauseHooks.push(fn); },
      onQuit(fn) { quitFns.push(fn); },
    };

    const setPaused = (p: boolean) => {
      if (over || p === paused) return;
      paused = p;
      pauseCard.hidden = !p;
      for (const h of pauseHooks) h(p);
    };
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (over) return;
      if ((e.target as HTMLElement).matches?.("input, textarea")) return;
      if (down && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (countEl.dataset.on) return; setPaused(!paused); return; }
      if (paused) { if (down && e.key === "Enter" && !pauseCard.hidden) { e.preventDefault(); setPaused(false); } e.stopPropagation(); return; }
      let used = false;
      for (const k of keys) if (k(e, down)) used = true;
      if (used || [" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
      e.stopPropagation();
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    document.addEventListener("keydown", kd, true);
    document.addEventListener("keyup", ku, true);
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      synth.resume();
      if (t.closest("[data-ar-pause]")) setPaused(!paused);
      else if (t.closest("[data-ar-resume]")) setPaused(false);
      else if (t.closest("[data-ar-quit]")) { paused = false; pauseCard.hidden = true; for (const h of pauseHooks) h(false); quit(); }
      else if (t.closest("[data-ar-mute]")) {
        synth.muted = !synth.muted; store("muted", synth.muted ? "1" : "0");
        (t.closest("[data-ar-mute]") as HTMLElement).textContent = synth.muted ? "🔇" : "🔊";
      }
    };
    el.addEventListener("click", onClick);
    // Losing focus (switching tabs) pauses, except for rhythm games mid-song, where the music runs on.
    const onBlur = () => { if (!def.rhythm) setPaused(true); };
    window.addEventListener("blur", onBlur);

    let stopGame: () => void = () => {};
    function quit() { for (const q of quitFns) q(); if (!over) kit.finish({ beats: ["gave up partway"], quit: true }); }

    function cleanup() {
      document.removeEventListener("keydown", kd, true);
      document.removeEventListener("keyup", ku, true);
      el.removeEventListener("click", onClick);
      window.removeEventListener("blur", onBlur);
      try { stopGame(); } catch { /* ignore */ }
      for (const c of canvases) c.dispose();
    }

    // Start the game behind the countdown, frozen until "Go".
    stopGame = def.start(kit);
    if (gamble) kit.chips(play.stake ?? 0); else kit.score(0);
    el.focus({ preventScroll: true });
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!paused && !over) for (const f of loops) f(dt, now / 1000);
      if (!over) rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
    const counts = ["3", "2", "1", "Go!"];
    countEl.dataset.on = "1";
    const step = (i: number) => {
      if (over) return;
      if (i >= counts.length) { countEl.textContent = ""; delete countEl.dataset.on; paused = false; for (const h of pauseHooks) h(false); return; }
      countEl.innerHTML = `<span>${counts[i]}</span>`;
      synth.fx(i === counts.length - 1 ? "go" : "countdown");
      setTimeout(() => step(i + 1), i === counts.length - 1 ? 350 : 560);
    };
    synth.resume();
    for (const h of pauseHooks) h(true);
    setTimeout(() => step(0), 250);
  });
}

/** The verdict, stamped big, then back to the story. */
function resultCard(el: HTMLElement, res: GameResult, bar: GameBar | null, currency: string, synth: Synth, def: GameDef): Promise<void> {
  return new Promise((resolve) => {
    let html: string;
    if (res.net !== undefined) {
      const net = res.net;
      const tone = net > 0 ? "good" : net < 0 ? "bad" : "warn";
      synth.fx(net > 0 ? "coins" : net < 0 ? "lose" : "click");
      html = `<div class="warp-ar-stamp ${tone}">${net > 0 ? "Up" : net < 0 ? "Down" : "Even"}</div>
        <div class="warp-ar-big ${tone}">${net > 0 ? "+" : net < 0 ? "−" : "±"}${esc(currency)}${Math.abs(net)}</div>
        <div class="warp-ar-dim">Stake ${esc(currency)}${res.stake}</div>`;
    } else {
      const t = tierFromScore(bar!, res.score ?? 0);
      synth.fx(t === "crit_success" ? "jackpot" : t === "success" ? "win" : t === "partial" ? "click" : "lose");
      html = `<div class="warp-ar-stamp ${TIER_TONE[t]}">${TIER_WORD[t]}</div>
        <div class="warp-ar-big ${TIER_TONE[t]}" data-count="${Math.round((res.score ?? 0) * 100)}">0%</div>
        <div class="warp-ar-dim">needed ${pct(bar!.success)} · critical ${pct(bar!.crit)}</div>`;
    }
    const card = document.createElement("div");
    card.className = "warp-ar-result";
    card.innerHTML = `<div class="warp-ar-card">
      <div class="warp-ar-kicker">${GAMES[def.id].icon} ${esc(def.title)}${res.song ? ` · ♪ ${esc(res.song)}` : ""}</div>
      ${html}
      ${res.beats.length ? `<ul class="warp-ar-beats">${res.beats.map((b) => `<li>${esc(b[0].toUpperCase() + b.slice(1))}</li>`).join("")}</ul>` : ""}
      ${res.detail ? `<div class="warp-ar-dim">${esc(res.detail)}</div>` : ""}
      <button class="warp-ar-btn primary" data-ar-back>Back to the story <kbd>Enter</kbd></button>
    </div>`;
    el.appendChild(card);
    const big = card.querySelector<HTMLElement>("[data-count]");
    if (big) {
      const to = Number(big.dataset.count);
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / 700);
        big.textContent = `${Math.round(to * (1 - Math.pow(1 - k, 3)))}%`;
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    const btn = card.querySelector<HTMLButtonElement>("[data-ar-back]")!;
    setTimeout(() => btn.focus({ preventScroll: true }), 50);
    const done = () => { document.removeEventListener("keydown", onKey, true); resolve(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === "Escape" || e.key === " ") { e.preventDefault(); e.stopPropagation(); done(); } else e.stopPropagation(); };
    btn.addEventListener("click", done);
    setTimeout(() => document.addEventListener("keydown", onKey, true), 300);
  });
}
