import { esc } from "../frontend/html.js";
import type { MechanicalState } from "./mechanics.js";
import type { AbilityEffect } from "./abilities.js";
import { cooldownRemaining, type Defense } from "./encounters.js";

function defenseText(d: Defense, remaining = false) {
  const damage = `${d.damageType === "all" ? "all" : d.damageType} damage`;
  if (d.kind === "immunity") return `Immune to ${damage}`;
  if (d.kind === "resistance") return `${d.amount}% resistance to ${damage}`;
  if (d.kind === "reflect") return `Reflect ${d.amount}% of ${damage} received`;
  if (d.kind === "armor") return `${d.amount} armor against ${damage}`;
  return `${d.amount} shield${remaining ? " remaining" : ""} against ${damage}`;
}

function effectText(e: AbilityEffect) {
  const who = e.target === "self" ? "self" : "target";
  if (e.kind === "restore" || e.kind === "damage") return `${e.kind === "restore" ? "Restore" : "Damage"} ${e.amount} ${e.resource}${e.damageType ? ` · ${e.damageType}` : ""} · ${who}${e.basis === "warp" ? " · Warp value" : ""}`;
  if (e.kind === "clear_condition") return `Clear ${e.name} · ${who}`;
  if (e.kind === "defense" && e.defense) return `${e.name}: ${defenseText(e.defense)} · ${who} · ${e.ending}${e.basis === "warp" ? " · Warp value" : ""}`;
  return `${e.name} · ${who} · ${e.ending}`;
}

/** Optional, read-only view of saved player mechanics. Opening it performs no action or model call. */
export function inspectMechanics(state: MechanicalState): string {
  const resources = state.resources.filter(r => r.owner === "you"), items = state.items.filter(i => i.owner === "you" && i.quantity > 0);
  const conditions = state.conditions.filter(c => c.owner === "you"), abilities = state.abilities?.filter(a => a.owner === "you") ?? [];
  const named = (id: string) => state.resources.find(r => r.id === id)?.name ?? state.items.find(i => i.id === id)?.name ?? id;
  return `<section class="warp-inspector" aria-label="Your saved mechanics">
    ${resources.length ? `<dl class="warp-inspector-resources">${resources.map(r => `<div><dt>${esc(r.name)}</dt><dd>${r.current}${r.max === undefined ? "" : ` / ${r.max}`}${r.unit ? ` ${esc(r.unit)}` : ""}</dd></div>`).join("")}</dl>` : ""}
    ${items.length ? `<div class="warp-inspector-items">${items.map(i => `<span>${esc(i.name)} × ${i.quantity}${i.equipped ? " · equipped" : ""}</span>`).join("")}</div>` : ""}
    ${conditions.map(c => `<p>${esc(c.name)}${c.targets?.length ? ` · with ${c.targets.map(esc).join(", ")}` : ""}${c.place ? ` · ${esc(c.place)}` : ""}<small>${esc(c.ending)}${c.defenses?.length ? ` · ${c.defenses.map(d => esc(defenseText(d, true))).join(" · ")}` : ""}</small></p>`).join("")}
    ${abilities.length ? `<div class="warp-inspector-abilities">${abilities.map(a => `<details data-inspect-ability="${esc(a.id)}"><summary><strong>${esc(a.name)}</strong><span>${a.costs.length ? a.costs.map(c => `${c.amount} ${esc(named(c.id))}`).join(" + ") : "No established resource cost"}</span></summary>
      <p>${esc(a.description)}</p>${a.effects.map(e => `<p>${esc(effectText(e))}</p>`).join("")}
      ${a.range ? `<p>Range: ${esc(a.range)}</p>` : ""}${a.cooldown ? `<p>${cooldownRemaining(state, "you", a.id) ? `Ready after ${cooldownRemaining(state, "you", a.id)} more action${cooldownRemaining(state, "you", a.id) === 1 ? "" : "s"}` : "Ready"} · ${a.cooldown}-action cooldown</p>` : ""}
      ${a.requires.length ? `<p>Requires ${a.requires.map(r => `${esc(named(r.item))}${r.equipped ? " equipped" : " carried"}`).join(", ")}</p>` : ""}
      ${a.unsupported.length ? `<p class="warp-inspector-blocked">Needs clarification: ${a.unsupported.map(esc).join(" · ")}</p>` : ""}
      <small>Version ${a.version} · ${esc(a.sourceKind)}</small><blockquote>${esc(a.source.quote)}</blockquote></details>`).join("")}</div>` : ""}
    ${!resources.length && !items.length && !conditions.length && !abilities.length ? "No established player mechanics yet." : ""}
  </section>`;
}

export const INSPECTOR_STYLE = `
.warp-inspector{margin:10px 0;padding:12px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:7px}
.warp-inspector-resources{display:flex;flex-wrap:wrap;gap:10px 24px;margin:0 0 10px}.warp-inspector-resources dt{opacity:.65;font-size:11px}.warp-inspector-resources dd{margin:0;font-variant-numeric:tabular-nums;font-size:16px}
.warp-inspector-items{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px}.warp-inspector p{margin:6px 0}.warp-inspector small{display:block;font-size:11px;opacity:.65}.warp-inspector-abilities{margin-top:10px}.warp-inspector-abilities details{padding:8px 0;border-top:1px solid color-mix(in srgb,currentColor 10%,transparent)}.warp-inspector-abilities summary{opacity:1;display:list-item}.warp-inspector-abilities summary span{margin-left:12px;font-size:12px;opacity:.65}.warp-inspector blockquote{margin:8px 0;padding-left:10px;border-left:2px solid color-mix(in srgb,currentColor 20%,transparent);font-size:12px;opacity:.7}.warp-inspector-blocked{font-weight:600}
`;
