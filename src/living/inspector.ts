import { activePracticeTracks } from "./growth.js";
import { isLingering, lingeringDescription, pulseDescription } from "./lingering.js";
import { esc } from "../frontend/html.js";
import type { MechanicalState } from "./mechanics.js";
import type { AbilityEffect } from "./abilities.js";
import { cooldownRemaining, type Defense } from "./encounters.js";
import { costPayer } from "./companions.js";
import { visibleAgreements } from "./agreements.js";

function defenseText(d: Defense, remaining = false) {
  const damage = `${d.damageType === "all" ? "all" : d.damageType} damage`;
  if (d.kind === "immunity") return `Immune to ${damage}`;
  if (d.kind === "resistance") return `${d.amount}% resistance to ${damage}`;
  if (d.kind === "reflect") return `Reflect ${d.amount}% of ${damage} received`;
  if (d.kind === "armor") return `${d.amount} armor against ${damage}`;
  return `${d.amount} shield${remaining ? " remaining" : ""} against ${damage}`;
}

function effectText(e: AbilityEffect, state: MechanicalState) {
  if (isLingering(e)) return lingeringDescription(e, state);
  if (e.kind === "summon" || e.kind === "dismiss") return `${e.kind === "summon" ? "Recall" : "Dismiss"} ${state.companions?.find(c => c.id === e.companion)?.actor ?? "summon"}${e.duration ? ` · ${e.duration} subsequent controller action${e.duration === 1 ? "" : "s"}` : ""}`;
  const who = e.target === "self" ? "self" : "target";
  if (e.kind === "restore" || e.kind === "damage") return `${e.kind === "restore" ? "Restore" : "Damage"} ${e.amount} ${e.resource}${e.damageType ? ` · ${e.damageType}` : ""} · ${who}${e.basis === "warp" ? " · Warp value" : ""}`;
  if (e.kind === "harm") return `${e.impact} ${e.damageType} harm · ${who} · Warp interpretation`;
  if (e.kind === "mend") return `${e.impact} injury treatment · ${who}${e.maxInjury && e.maxInjury !== "any" ? ` · treats at most ${e.maxInjury} injuries` : ""} · Warp interpretation`;
  if (e.kind === "clear_condition") return `Clear ${e.name} · ${who}`;
  if (e.kind === "defense" && e.defense) return `${e.name}: ${defenseText(e.defense)} · ${who} · ${e.ending}${e.basis === "warp" ? " · Warp value" : ""}`;
  return `${e.name} · ${who} · ${e.ending}`;
}

/** Optional, read-only view of saved player mechanics. Opening it performs no action or model call. */
export function inspectMechanics(state: MechanicalState): string {
  const resources = state.resources.filter(r => r.owner === "you"), items = state.items.filter(i => i.owner === "you" && i.quantity > 0);
  const conditions = state.conditions.filter(c => c.owner === "you"), abilities = state.abilities?.filter(a => a.owner === "you") ?? [];
  const growth = activePracticeTracks(state).filter(g => g.owner === "you");
  const buildups = state.buildups?.filter(b => b.owner === "you") ?? [];
  const companions = state.companions?.filter(c => c.controller === "you") ?? [];
  const resilience = state.resilience?.find(r => r.owner === "you" && r.band !== "ordinary");
  const agreements = visibleAgreements(state.agreements?.filter(a => a.owner === "you" || a.from === "you"));
  const named = (id: string) => state.resources.find(r => r.id === id)?.name ?? state.items.find(i => i.id === id)?.name ?? id;
  const costText = (kind: string, id: string, amount: number) => {
    if (kind !== "resource") return `${amount} ${named(id)}`;
    try { const payer = costPayer(state, id); return `${amount} ${payer.name}${payer.id !== id ? ` · from ${payer.owner === "you" ? "you" : payer.owner}` : ""}`; }
    catch { return `${amount} ${named(id)} · payer needs clarification`; }
  };
  return `<section class="warp-inspector" aria-label="Your saved mechanics">
    ${resources.length ? `<dl class="warp-inspector-resources">${resources.map(r => `<div><dt>${esc(r.name)}</dt><dd>${r.current}${r.max === undefined ? "" : ` / ${r.max}`}${r.unit ? ` ${esc(r.unit)}` : ""}</dd></div>`).join("")}</dl>` : ""}
    ${items.length ? `<div class="warp-inspector-items">${items.map(i => `<span>${esc(i.name)} × ${i.quantity}${i.equipped ? " · equipped" : ""}</span>`).join("")}</div>` : ""}
    ${resilience ? `<p>Physical resilience: ${esc(resilience.band)}<small>Warp interpretation · ${esc(resilience.source.quote)}</small></p>` : ""}
    ${conditions.map(c => `<p>${esc(c.name)}${c.targets?.length ? ` · with ${c.targets.map(esc).join(", ")}` : ""}${c.place ? ` · ${esc(state.places?.find(p => p.id === c.place)?.name ?? c.place)}` : ""}<small>${esc(c.ending)}${c.periodic ? ` · ${esc(pulseDescription(c.periodic.pulse, state))} after your next supported action · ${c.periodic.remaining === undefined ? esc(c.ending) : `${c.periodic.remaining} pulses left`}${c.periodic.timingBasis === "warp" ? " · Warp action timing" : ""}` : ""}${c.defenses?.length ? ` · ${c.defenses.map(d => esc(defenseText(d, true))).join(" · ")}` : ""}</small></p>`).join("")}
    ${abilities.length ? `<div class="warp-inspector-abilities">${abilities.map(a => `<details data-inspect-ability="${esc(a.id)}"><summary><strong>${esc(a.name)}</strong><span>${a.costs.length ? a.costs.map(c => esc(costText(c.kind, c.id, c.amount))).join(" + ") : "No established resource cost"}</span></summary>
      <p>${esc(a.description)}</p>${a.effects.map(e => `<p>${esc(effectText(e, state))}</p>`).join("")}
      ${a.range ? `<p>Range: ${esc(a.range)}</p>` : ""}${a.cooldown ? `<p>${cooldownRemaining(state, "you", a.id) ? `Ready after ${cooldownRemaining(state, "you", a.id)} more action${cooldownRemaining(state, "you", a.id) === 1 ? "" : "s"}` : "Ready"} · ${a.cooldown}-action cooldown</p>` : ""}
      ${a.requires.length ? `<p>Requires ${a.requires.map(r => `${esc(named(r.item))}${r.equipped ? " equipped" : " carried"}`).join(", ")}</p>` : ""}
      ${a.unsupported.length ? `<p class="warp-inspector-blocked">Needs clarification: ${a.unsupported.map(esc).join(" · ")}</p>` : ""}
      <small>Version ${a.version} · ${esc(a.sourceKind)}</small><blockquote>${esc(a.source.quote)}</blockquote></details>`).join("")}</div>` : ""}
    ${buildups.map(b => `<p>${esc(b.name)}: ${b.current} / ${b.threshold}<small>At the threshold: ${esc(b.trigger.name)}${b.basis === "warp" ? " · Warp values" : ""}</small></p>`).join("")}
    ${growth.map(g => `<p>${esc(g.name)}: ${g.familiar ? "familiar" : `${g.credits.length} / 3 varied opportunities`}<small>Warp practice · one scoped help after the milestone · source costs and effects stay unchanged</small></p>`).join("")}
    ${companions.map(c => { const entity = state.entities?.find(e => e.name === c.actor); return `<details data-inspect-companion="${esc(c.id)}"><summary>${esc(entity?.displayName ?? c.actor)} · ${entity?.status === "dead" ? "Dead" : entity?.present ? "Here" : "Away"}</summary>
      ${state.conditions.filter(row => row.owner === c.actor).map(row => `<p>${esc(row.name)}<small>${esc(row.ending)}</small></p>`).join("")}
      ${state.resources.filter(row => row.owner === c.actor).map(row => `<p>${esc(row.name)}: ${row.current}${row.max === undefined ? "" : ` / ${row.max}`}</p>`).join("")}
      ${(state.abilities ?? []).filter(a => a.owner === c.actor).map(a => `<p>${esc(a.name)}<small>${a.costs.map(cost => esc(costText(cost.kind, cost.id, cost.amount))).join(" + ") || "No established resource cost"}</small></p>`).join("")}
      <blockquote>${esc(c.source.quote)}</blockquote></details>`; }).join("")}
    ${agreements.map(a => `<details data-inspect-agreement="${esc(a.id)}"><summary>${esc(a.name)} · ${a.cancelled ? "withdrawn" : `${a.requirements.filter(r => r.done).length}/${a.requirements.length} done`}</summary>${a.requirements.map(r => `<p>${r.done ? "Done" : "Pending"} · ${esc(r.text)}</p>`).join("")}${a.rewards.map(r => `<p>${r.paid ? "Received" : a.cancelled ? "Declined" : r.ready?.allowed ? "Offered" : r.ready ? "Withheld" : "Promised"} · ${r.amount} ${esc(r.asset)}${a.from ? ` · from ${esc(a.from)}` : ""}</p>`).join("")}${a.unsupported.length ? `<p>Needs clarification: ${a.unsupported.map(esc).join(" · ")}</p>` : ""}<blockquote>${esc(a.offer?.quote ?? a.source.quote)}</blockquote></details>`).join("")}
    ${!resources.length && !items.length && !conditions.length && !abilities.length && !resilience && !agreements.length && !companions.length && !growth.length && !buildups.length ? "No established player mechanics yet." : ""}
  </section>`;
}

export const INSPECTOR_STYLE = `
.warp-inspector{margin:10px 0;padding:12px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:7px}
.warp-inspector-resources{display:flex;flex-wrap:wrap;gap:10px 24px;margin:0 0 10px}.warp-inspector-resources dt{opacity:.65;font-size:11px}.warp-inspector-resources dd{margin:0;font-variant-numeric:tabular-nums;font-size:16px}
.warp-inspector-items{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px}.warp-inspector p{margin:6px 0}.warp-inspector small{display:block;font-size:11px;opacity:.65}.warp-inspector-abilities{margin-top:10px}.warp-inspector-abilities details{padding:8px 0;border-top:1px solid color-mix(in srgb,currentColor 10%,transparent)}.warp-inspector-abilities summary{opacity:1;display:list-item}.warp-inspector-abilities summary span{margin-left:12px;font-size:12px;opacity:.65}.warp-inspector blockquote{margin:8px 0;padding-left:10px;border-left:2px solid color-mix(in srgb,currentColor 20%,transparent);font-size:12px;opacity:.7}.warp-inspector-blocked{font-weight:600}
`;
