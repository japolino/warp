// Fabric patterns as SVG <pattern> tiles, drawn over a garment's base colour.

import type { Pattern } from "./garments.js";
import { mix } from "./geom.js";

const HEX = /^#[0-9a-f]{6}$/i;

export function patternDef(id: string, kind: Pattern, colour: string, baseColour: string): string {
  const c = HEX.test(colour) ? colour : "#1d1a22", base = HEX.test(baseColour) ? baseColour : "#7a7a84";
  const tile = (w: number, h: number, body: string, extra = "") => `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"${extra}>${body}</pattern>`;
  switch (kind) {
    case "stripes": return tile(10, 10, `<rect y="0" width="10" height="4" fill="${c}"/>`);
    case "vstripes": return tile(10, 10, `<rect x="0" width="4" height="10" fill="${c}"/>`);
    case "plaid": return tile(24, 24, `<rect x="0" y="9" width="24" height="6" fill="${c}" opacity=".55"/><rect x="9" y="0" width="6" height="24" fill="${c}" opacity=".55"/><rect x="0" y="2" width="24" height="1.2" fill="${mix(c, base, 0.4)}" opacity=".8"/><rect x="2" y="0" width="1.2" height="24" fill="${mix(c, base, 0.4)}" opacity=".8"/>`);
    case "check": return tile(12, 12, `<rect width="6" height="6" fill="${c}" opacity=".7"/><rect x="6" y="6" width="6" height="6" fill="${c}" opacity=".7"/>`);
    case "dots": return tile(12, 12, `<circle cx="3" cy="3" r="1.8" fill="${c}"/><circle cx="9" cy="9" r="1.8" fill="${c}"/>`);
    case "cow": return tile(46, 40, `<path d="M4 4c6-4 14 0 12 7s-10 9-14 4-3-8 2-11z" fill="${c}"/><path d="M28 18c5-3 13-2 14 4s-6 11-12 9-7-10-2-13z" fill="${c}"/><path d="M12 28c3-2 7 0 7 4s-4 6-7 4-3-6 0-8z" fill="${c}"/><path d="M36 2c3 0 5 2 4 5s-5 3-6 1 0-6 2-6z" fill="${c}"/>`);
    case "leopard": return tile(30, 28, `<path d="M5 5c3-2 7 0 6 3s-5 3-7 1z M18 14c3-2 7 0 6 3s-5 3-7 1z M6 20c3-2 6 0 5 3s-4 3-6 1z" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="7" r="1.4" fill="${mix(c, base, 0.5)}"/><circle cx="21" cy="16" r="1.4" fill="${mix(c, base, 0.5)}"/>`);
    case "floral": return tile(28, 28, [[7, 7], [21, 20]].map(([x, y]) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((a) => `<ellipse rx="2.4" ry="4" cy="-3.6" transform="rotate(${a})" fill="${c}"/>`).join("")}<circle r="1.8" fill="${mix(c, "#ffe08a", 0.6)}"/></g>`).join("") + `<circle cx="21" cy="5" r="1" fill="${c}" opacity=".6"/><circle cx="6" cy="22" r="1" fill="${c}" opacity=".6"/>`);
    case "waves": return tile(20, 10, `<path d="M0 10a10 10 0 0 1 20 0M4 10a6 6 0 0 1 12 0M-10 5a10 10 0 0 1 20 0M10 5a10 10 0 0 1 20 0" fill="none" stroke="${c}" stroke-width="1.1"/>`);
    case "stars": return tile(30, 30, `<path d="M8 3l1.6 3.4 3.7.4-2.8 2.5.8 3.7L8 11.2 4.7 13l.8-3.7L2.7 6.8l3.7-.4z" fill="${c}"/><circle cx="22" cy="20" r="1.3" fill="${c}"/><circle cx="25" cy="7" r=".8" fill="${c}"/>`);
    case "fishnet": return tile(7, 7, `<path d="M0 0L7 7M7 0L0 7" stroke="${c}" stroke-width=".9"/>`);
    case "scales": return tile(12, 10, `<path d="M0 10a6 6 0 0 1 12 0M-6 5a6 6 0 0 1 12 0M6 5a6 6 0 0 1 12 0" fill="none" stroke="${c}" stroke-width="1"/>`);
    default: return "";
  }
}
