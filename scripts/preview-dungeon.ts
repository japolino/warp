// Renders the dungeon screens with sample state into one HTML page, for eyeballing the UI.
//   bun scripts/preview-dungeon.ts <out.html>

import { writeFileSync } from "node:fs";
import { loadRuleset } from "../src/engine/loader.js";
import { TEMPLATES } from "../src/engine/templates/index.js";
import { foldEvents, initialState, type GameState } from "../src/engine/state.js";
import { enterDungeon, moveTo, battleCommand } from "../src/engine/dungeon/run.js";
import { generateFloor, key } from "../src/engine/dungeon/floor.js";
import { buildDungeonEntries, buildDungeonView } from "../src/engine/dungeon/view.js";
import { renderDungeon } from "../src/frontend/dungeon-ui.js";
import { STYLES } from "../src/frontend/styles.js";

const t = TEMPLATES.find((x) => x.id === "hometown")!;
const r = loadRuleset(t.parts.map((p, i) => ({ label: p.label, content: p.yaml, order: i }))).ruleset!;
let s: GameState = initialState(r);
s = foldEvents(r, [[
  { t: "move", to: "docks", src: "start" },
  { t: "person", id: "jo", name: "Jo", src: "start" },
  { t: "person", id: "dex", name: "Dex", src: "start" },
]], s);
const ui = { pick: null, mates: new Set(["jo"]), busy: false };
const panels: [string, string][] = [["Entrance", renderDungeon(null, buildDungeonEntries(r, s), ui)]];

s = foldEvents(r, [enterDungeon(r, s, "old_mines", ["jo", "dex"], "preview-7").events], s);
// Walk a few tiles, skipping fights, to show a partly explored floor.
const f = generateFloor(r.dungeons.old_mines, s.dungeon!.seed, 1);
for (let i = 0; i < 6 && s.dungeon && !s.dungeon.battle && !s.dungeon.pending; i++) {
  const [x, y] = s.dungeon.pos;
  const safe = ["empty", "treasure", "trap", "rest", "start"];
  const next = [[x, y - 1], [x + 1, y], [x - 1, y], [x, y + 1]].find(([a, b]) => a >= 0 && b >= 0 && a < f.size && b < f.size && !s.dungeon!.seen.includes(key(a, b)) && safe.includes(f.tiles[b][a]));
  if (!next) break;
  const res = moveTo(r, s, next[0], next[1]);
  if (!res.error) s = foldEvents(r, [res.events], s);
}
panels.push(["Exploring", renderDungeon(buildDungeonView(r, s), [], ui)]);

// A battle: step onto an elite if there is one, else fake one via the first enemy.
let b = s;
for (let y = 0; y < f.size && !b.dungeon?.battle; y++) for (let x = 0; x < f.size && !b.dungeon?.battle; x++) {
  if (f.tiles[y][x] !== "elite" && f.tiles[y][x] !== "enemy") continue;
  const from = x > 0 ? [x - 1, y] : [x + 1, y];
  const moved = foldEvents(r, [[{ t: "dg_step", x: from[0], y: from[1], src: "action" }, { t: "dg_clear", key: key(from[0], from[1]), src: "action" }]], s);
  const res = moveTo(r, moved, x, y);
  if (!res.error) b = foldEvents(r, [res.events], moved);
}
if (b.dungeon?.battle) {
  const one = battleCommand(r, b, { skill: "attack", target: b.dungeon.battle.fighters.find((x) => x.side === "foe")!.id });
  if (!one.error) b = foldEvents(r, [one.events], b);
  panels.push(["Battle", renderDungeon(buildDungeonView(r, b), [], ui)]);
}

const html = `<!doctype html><meta charset="utf-8"><title>Dungeon preview</title>
<style>:root{--z:${process.env.ZOOM ?? 1}}body{background:#16151d;margin:0;padding:16px;font-family:system-ui,sans-serif;display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}
.col{zoom:var(--z,1);width:380px;background:#1e1d27;border:1px solid #333;border-radius:10px}.col h2{color:#aaa;font:600 12px system-ui;text-transform:uppercase;letter-spacing:.08em;margin:10px 12px 0}
${STYLES}</style>
${panels.filter((_, i) => !process.env.ONLY || String(i) === process.env.ONLY).map(([title, body]) => `<div class="col"><h2>${title}</h2><div class="warp-root">${body}</div></div>`).join("")}`;
writeFileSync(process.argv[2] ?? "dungeon-preview.html", html);
console.log(`wrote ${panels.length} panels`);
