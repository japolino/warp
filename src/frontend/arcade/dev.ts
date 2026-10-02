// A test bench for the minigames, outside Lumiverse: `bun run arcade`, then open the
// page it prints. Pick a game, how likely the dice would make it, and some aids.

import { gameBar, GAMES, GAME_IDS, GAMBLE_GAMES, type GameAid, type GameId } from "../../engine/game-ids.js";
import type { ChoiceView } from "../../shared/protocol.js";
import { createArcade } from "./arcade.js";
import { ARCADE_STYLES } from "./styles.js";

const style = document.createElement("style");
style.textContent = ARCADE_STYLES;
document.head.appendChild(style);

const layer = document.createElement("div");
layer.style.cssText = "position:fixed;inset:0;z-index:10;display:none";
document.body.appendChild(layer);
const arcade = createArcade({
  surface: () => ({ root: layer, show: (on) => { layer.style.display = on ? "block" : "none"; } }),
  volume: () => 0.5,
  sound: () => true,
  reduced: () => false,
  look: () => (document.getElementById("style") as HTMLSelectElement | null)?.value as "medieval" | "modern" | "scifi" ?? null,
});

const panel = document.getElementById("bench")!;
panel.innerHTML = `
  <h1>Warp arcade bench</h1>
  <label>Game <select id="g">${GAME_IDS.map((g) => `<option value="${g}">${GAMES[g].icon} ${GAMES[g].name}</option>`).join("")}</select></label>
  <label>Look <select id="style"><option value="medieval">Medieval</option><option value="modern" selected>Modern</option><option value="scifi">Sci-fi</option></select></label>
  <label>Dice odds <input id="p" type="range" min="5" max="95" value="55"><b id="pv">55%</b></label>
  <label><input id="gamble" type="checkbox"> Gamble (casino games only)</label>
  <fieldset><legend>Aids</legend>
    <label><input type="checkbox" data-aid="lives" data-n="1"> +1 life</label>
    <label><input type="checkbox" data-aid="window" data-n="25"> +25% window</label>
    <label><input type="checkbox" data-aid="size" data-n="25"> +25% size</label>
    <label><input type="checkbox" data-aid="slow" data-n="20"> 20% slower</label>
    <label><input type="checkbox" data-aid="hint" data-n="2"> +2 hints</label>
    <label><input type="checkbox" data-aid="peek" data-n="1"> peek</label>
    <label><input type="checkbox" data-aid="hold" data-n="1"> hold</label>
    <label><input type="checkbox" data-aid="saver" data-n="1"> ball saver</label>
  </fieldset>
  <label><input id="auto" type="checkbox"> Autoplay rhythm games (to look at them)</label>
  <button id="go">Open the arcade</button>
  <pre id="out"></pre>`;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
$("p").addEventListener("input", () => { $("pv").textContent = `${$<HTMLInputElement>("p").value}%`; });
$("go").addEventListener("click", async () => {
  (globalThis as { __warpAutoplay?: boolean }).__warpAutoplay = $<HTMLInputElement>("auto").checked;
  const game = $<HTMLSelectElement>("g").value as GameId;
  const chance = Number($<HTMLInputElement>("p").value) / 100;
  const aids: GameAid[] = [...document.querySelectorAll<HTMLInputElement>("[data-aid]:checked")].map((x) => ({ kind: x.dataset.aid as GameAid["kind"], amount: Number(x.dataset.n), from: x.dataset.aid === "lives" ? "★ Lucky Charm" : "Bench" }));
  const gamble = $<HTMLInputElement>("gamble").checked && (GAMBLE_GAMES as string[]).includes(game);
  const choice: ChoiceView = {
    id: "bench", label: "Try your luck", group: null, desc: null, odds: chance, partialOdds: null, checkLabel: "Skill", veiled: false, params: [],
    ...(gamble
      ? { gamble: { game: game as "blackjack", action: "Sit at the table", stakes: [10, 50, 200], rounds: 5, money: { stat: "money", have: 400, currency: "£" }, edge: 0.02, aids, seed: String(Date.now()) } }
      : { game: { game, options: [game], action: "Pick the lock", label: "Lockpicking", chance, level: 1 - chance, bar: gameBar(chance), aids, partner: { name: "Jo", sync: 0.6 }, seed: String(Date.now()) } }),
  };
  const res = await arcade.run(choice, false);
  $("out").textContent = JSON.stringify(res, null, 2);
});
