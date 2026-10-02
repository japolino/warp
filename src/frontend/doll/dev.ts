// Bench for the doll: bun run bench, then open /doll.html. The helper buttons
// need Lumiverse; everything else works here.

import { STYLES } from "../styles.js";
import { PRESETS } from "./body.js";
import { createDollLab, DOLL_STYLES } from "./lab.js";
import { renderDoll } from "./render.js";

const css = document.createElement("style");
css.textContent = STYLES + DOLL_STYLES + `
body { margin: 0; background: #1b1922; color: #e8e8ee; font-family: system-ui, sans-serif; display: flex; gap: 16px; }
.side { width: 390px; flex: 0 0 390px; padding: 10px; height: 100vh; overflow-y: auto; box-sizing: border-box; }
.gallery { flex: 1; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 4px; padding: 10px; }
.gallery svg { height: 420px; width: auto; }
.gallery h2 { width: 100%; margin: 4px 0; font-size: 14px; opacity: .7; font-weight: 500; }`;
document.head.appendChild(css);

const side = document.createElement("div");
side.className = "warp-root side";
const gallery = document.createElement("div");
gallery.className = "gallery";
document.body.append(side, gallery);

const lab = createDollLab({
  send: (m) => setTimeout(() => lab.onLook({ who: m.who, look: null, note: "", error: "the helper only runs inside Lumiverse" }), 300),
  chatId: () => null,
  hud: () => null,
  changed: () => draw(),
});

function draw() {
  side.innerHTML = lab.html();
  // The same outfit on every build, to see how it fits.
  const look = lab.current();
  gallery.innerHTML = `<h2>This look on every build</h2>` + (["f", "m"] as const).flatMap((sex) => Object.keys(PRESETS[sex]).map((p) => renderDoll({ ...look, body: { sex, preset: p } }, { id: `g${sex}${p}` }))).join("");
}
for (const t of ["click", "input", "change"]) side.addEventListener(t, (e) => { lab.handle(e, side); if (e.type !== "input") draw(); });
draw();
