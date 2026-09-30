// Renders the Dating screens with sample state into one HTML page, for eyeballing the UI.
//   bun scripts/preview-date.ts <out.html>

import { writeFileSync } from "node:fs";
import { loadRuleset } from "../src/engine/loader.js";
import { TEMPLATES } from "../src/engine/templates/index.js";
import { foldEvents, initialState, type GameState } from "../src/engine/state.js";
import { resolveTurnFull } from "../src/engine/resolve.js";
import { buildDateView } from "../src/engine/date/view.js";
import { buildChoices } from "../src/engine/view.js";
import { dateMoves } from "../src/engine/date/talk.js";
import { renderDate } from "../src/frontend/date-ui.js";
import { renderChoices } from "../src/frontend/render.js";
import { STYLES } from "../src/frontend/styles.js";
import type { Ruleset } from "../src/engine/ruleset.js";

const t = TEMPLATES.find((x) => x.id === "hometown")!;
const r: Ruleset = loadRuleset([...t.parts.map((p, i) => ({ label: p.label, content: p.yaml, order: i })), { label: "dating", content: "dating: true", order: 99 }]).ruleset!;
const adult = { adult: 0.97, minor: 0.01, unclear: 0.02 };
const step = (s: GameState, id: string, seed: string, odds: Record<string, Record<string, number>> = {}) => {
  const res = resolveTurnFull(r, s, { actionId: id, via: "choice" }, { seed, odds });
  return foldEvents(r, [res.record.events], s);
};
let s = initialState(r);
s = foldEvents(r, [[
  { t: "move", to: "high_street", src: "start" },
  { t: "rel", who: "jo", stat: "love", set: 34, src: "manual" },
  { t: "rel", who: "dex", stat: "love", set: 12, src: "manual" },
  { t: "rel", who: "dex", stat: "fear", set: 35, src: "manual" },
  { t: "dt_seen", who: "jo", topic: "food", reaction: "love", src: "manual" },
  { t: "dt_seen", who: "jo", topic: "gossip", reaction: "dislike", src: "manual" },
]], s);
const panels: [string, string][] = [["People", renderDate(buildDateView(r, s), { cat: null, busy: false })]];

s = step(s, "date:talk@jo", "p1", { "date:adult:jo": adult });
for (const [i, id] of ["date:topic:food", "date:topic:music", "date:topic:hobbies"].entries()) s = step(s, id, `t${i}`);
panels.push(["Talking", renderDate(buildDateView(r, s), { cat: "interests", busy: false })]);
panels.push(["Under the reply", `<div class="warp-choices">${renderChoices(buildChoices(r, s, { lines: [], veils: [] }), { showOdds: true, hotkeys: true, busy: false })}</div>`]);

s = foldEvents(r, [[{ t: "rel", who: "jo", stat: "love", set: 48, src: "manual" }]], s);
s = step(s, "date:ask_out", "a", { "date:ask_out": { yes: 1 } });
s = step(s, "date:venue:cafe", "v");
const act = dateMoves(r, s).find((m) => m.kind === "activity")!;
s = step(s, act.id, "o1");
panels.push(["On a date", renderDate(buildDateView(r, s), { cat: null, busy: false })]);

const html = `<!doctype html><meta charset="utf-8"><title>Dating preview</title>
<style>body{background:#16151d;margin:0;padding:16px;font-family:system-ui,sans-serif;display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}
.col{width:380px;background:#1e1d27;border:1px solid #333;border-radius:10px}.col h2{color:#aaa;font:600 12px system-ui;text-transform:uppercase;letter-spacing:.08em;margin:10px 12px 0}
${STYLES}</style>
${panels.filter((_, i) => !process.env.ONLY || String(i) === process.env.ONLY).map(([title, body]) => `<div class="col"><h2>${title}</h2><div class="warp-root">${body}</div></div>`).join("")}`;
writeFileSync(process.argv[2] ?? "date-preview.html", html);
console.log(`wrote ${panels.length} panels`);
