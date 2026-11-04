import { esc } from "../frontend/html.js";
import type { MechanicalState } from "./mechanics.js";

/** A read-only connection diagram. Its lines describe routes, never geographic distance. */
export function inspectMap(state: MechanicalState, selected?: string): string {
  const places = state.places ?? [], here = state.positions?.find(p => p.owner === "you")?.site;
  const place = places.find(p => p.id === selected) ?? places.find(p => p.id === here) ?? places[0];
  if (!place) return "";
  const routes = (state.routes ?? []).filter(r => r.from === place.id || r.to === place.id);
  const label = (p: typeof place) => `${p.name}${p.parent ? ` · ${places.find(parent => parent.id === p.parent)?.name ?? ""}` : ""}`;
  const discoveries = (state.discoveries ?? []).filter(d => d.site === place.id), stocks = (state.stocks ?? []).filter(s => s.site === place.id);
  return `<section class="warp-map" aria-label="Known places and routes">
    <label class="warp-map-picker">Place <select data-map-site>${places.map(p => `<option value="${esc(p.id)}"${p.id === place.id ? " selected" : ""}>${esc(label(p))}</option>`).join("")}</select></label>
    <div class="warp-map-focus"><span class="warp-map-pin${place.visited ? " is-visited" : ""}" aria-hidden="true"></span><strong>${esc(label(place))}</strong><span>${place.id === here ? "You are here" : place.visited ? "Visited" : "Known, not visited"}</span></div>
    ${routes.length ? `<div class="warp-map-routes">${routes.map(r => {
      const outgoing = r.from === place.id, target = places.find(p => p.id === (outgoing ? r.to : r.from)); if (!target) return "";
      const status = r.status === "blocked" ? r.reason || "Blocked" : r.unsupported.length ? r.unsupported[0] : r.status === "unknown" ? "Access unknown" : "Open";
      const symbol = r.status === "blocked" ? "⊣" : r.bidirectional ? "↔" : outgoing ? "→" : "←";
      return `<div class="warp-map-route" data-route-status="${esc(r.status)}"><span class="warp-map-link" aria-hidden="true">${symbol}</span><div><span class="warp-map-via">${esc(r.via)} · ${r.bidirectional ? "both ways" : outgoing ? "to" : "from"}</span><button data-map-place="${esc(target.id)}" aria-label="View ${esc(label(target))}"><span class="warp-map-pin${target.visited ? " is-visited" : ""}" aria-hidden="true"></span>${esc(label(target))}</button><span class="warp-map-access">${esc(status)}</span></div></div>`;
    }).join("")}</div>` : ""}
    ${discoveries.length ? `<dl class="warp-map-discoveries">${discoveries.map(d => `<div><dt>${esc(d.name)}</dt><dd>${esc(d.text)}</dd></div>`).join("")}</dl>` : ""}
    ${stocks.length ? `<ul class="warp-map-stocks" aria-label="Remaining supplies">${stocks.map(s => `<li${!s.quantity ? ' class="is-empty"' : ""}><span>${esc(s.name)}</span><span>${s.quantity} left${s.available ? "" : " · unavailable"}</span></li>`).join("")}</ul>` : ""}
    <details class="warp-map-source"><summary>Source</summary><q>${esc(place.source.quote)}</q></details>
  </section>`;
}

export const MAP_STYLE = `
.warp-map{margin-top:14px;padding:12px 0 0;border-top:1px solid color-mix(in srgb,currentColor 14%,transparent);max-width:620px}
.warp-map-picker{display:flex;gap:8px;align-items:center;font-size:12px;opacity:.8}.warp-map-picker select{min-width:100px;max-width:85%;padding:4px}
.warp-map-focus{display:flex;align-items:center;gap:8px;margin-top:15px}.warp-map-focus strong{font-size:15px}.warp-map-focus>span:last-child{font-size:11px;opacity:.65;margin-left:auto}
.warp-map-pin{display:inline-block;box-sizing:border-box;width:9px;height:9px;border:1px solid currentColor;border-radius:50%;flex:none;opacity:.7}.warp-map-pin.is-visited{background:currentColor}.warp-map-focus>.warp-map-pin{color:#c8a96b;box-shadow:0 0 0 4px color-mix(in srgb,#c8a96b 12%,transparent)}
.warp-map-routes{margin-left:4px;padding-top:7px}.warp-map-route{display:flex;align-items:center;gap:8px;position:relative;padding:5px 0 5px 20px;border-left:1px solid color-mix(in srgb,currentColor 22%,transparent)}
.warp-map-route:last-child{border-left-color:transparent}.warp-map-route:before{content:"";position:absolute;left:-1px;top:0;height:50%;width:18px;border-left:1px solid color-mix(in srgb,currentColor 22%,transparent);border-bottom:1px solid color-mix(in srgb,currentColor 22%,transparent)}
.warp-map-link{width:20px;flex:none;opacity:.6;text-align:center}.warp-map-route>div{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}.warp-map-route button{display:inline-flex;align-items:center;gap:7px;padding:3px 5px!important;border-color:color-mix(in srgb,currentColor 16%,transparent)!important}
.warp-map-via,.warp-map-access{font-size:11px;opacity:.65}.warp-map-route[data-route-status=blocked] .warp-map-link{color:#c87575;opacity:1}.warp-map-route[data-route-status=unknown] .warp-map-link{opacity:.4}
.warp-map-discoveries{margin:13px 0 0}.warp-map-discoveries>div{padding:6px 0;border-top:1px solid color-mix(in srgb,currentColor 8%,transparent)}.warp-map-discoveries dt{font-weight:600;font-size:12px}.warp-map-discoveries dd{margin:2px 0 0;opacity:.75;font-size:12px}
.warp-map-stocks{list-style:none;padding:0;margin:12px 0 0}.warp-map-stocks li{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-top:1px solid color-mix(in srgb,currentColor 8%,transparent);font-size:12px}.warp-map-stocks li>span:last-child{font-variant-numeric:tabular-nums;opacity:.7}.warp-map-stocks li.is-empty{opacity:.5}.warp-map-source{font-size:11px;opacity:.65}.warp-map-source q{display:block;margin-top:6px;white-space:normal}
@media(max-width:540px){.warp-map-focus{flex-wrap:wrap}.warp-map-focus>span:last-child{margin-left:0}.warp-map-route>div{gap:5px}.warp-map-via{width:100%}}
`;
