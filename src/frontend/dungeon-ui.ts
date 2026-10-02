// The dungeon tab: the entrance (who comes along), the floor of face-down tiles,
// what's on the current tile, and the battle screen.

import type { DungeonEntryView, DungeonView, FighterView } from "../shared/protocol.js";
import { SPRITES } from "./sprites.gen.js";

export type DungeonPick = { kind: "skill" | "item" | "use"; id: string; target: "foe" | "ally" } | null;

export interface DungeonUi {
  pick: DungeonPick;
  mates: Set<string>;
  busy: boolean;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const you = (s: string) => s.replace(/\{\{user\}\}/g, "You");

export function sprite(key: string, cls = ""): string {
  const src = SPRITES[key] ?? SPRITES.skull;
  return `<img class="warp-px ${cls}" src="${src}" alt="" draggable="false">`;
}

export function bar(cur: number, max: number, cls: string, label: string): string {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  return `<div class="warp-dg-bar ${cls}" title="${label} ${Math.round(cur)} / ${Math.round(max)}"><span class="warp-dg-bar-l">${label}</span><div class="warp-dg-bar-track"><div style="width:${pct.toFixed(1)}%"></div></div><span class="warp-dg-bar-n">${Math.round(cur)}</span></div>`;
}

export function memberCard(f: FighterView, opts: { targetable: boolean }): string {
  const cls = ["warp-dg-member", f.alive ? "" : "down", f.active ? "active" : "", opts.targetable && f.alive ? "targetable" : ""].filter(Boolean).join(" ");
  const tag = opts.targetable && f.alive ? "button" : "div";
  return `<${tag} class="${cls}" data-fid="${esc(f.id)}" ${opts.targetable && f.alive ? `data-dg-target="${esc(f.id)}"` : ""}>
    <div class="warp-dg-member-head">${sprite(f.sprite, "warp-dg-face")}<b>${esc(you(f.name))}</b>${f.guard ? `<span class="warp-dim">🛡</span>` : ""}</div>
    ${bar(f.hp, f.mhp, "hp", "HP")}
    ${f.mmp > 0 ? bar(f.mp, f.mmp, "mp", "MP") : ""}
    ${bar(f.tp, 100, "tp", "TP")}
  </${tag}>`;
}

const TILE_ICON: Record<string, string> = {
  start: "exit", stairs: "stairs", treasure: "chest", trap: "trap", rest: "fountain", shop: "shop",
  event: "altar", surprise: "surprise", romance: "romance", enemy: "skull", elite: "skull", boss: "skull",
};
const TILE_NAME: Record<string, string> = {
  start: "Where you came in", empty: "Empty", stairs: "Stairs down", treasure: "Treasure", trap: "Trap", rest: "Spring",
  shop: "Merchant", event: "Event", surprise: "Surprise", romance: "A quiet moment", enemy: "Monsters", elite: "Elite monster", boss: "Floor guardian",
};

function tileIcon(kind: string | null, cleared: boolean): string {
  if (!kind || kind === "empty") return "";
  if (cleared && (kind === "enemy" || kind === "elite")) return sprite("blood", "warp-dg-icon faded");
  if (cleared && kind === "treasure") return sprite("chest_open", "warp-dg-icon faded");
  if (cleared && !["start", "stairs", "shop"].includes(kind)) return "";
  return sprite(TILE_ICON[kind] ?? "surprise", `warp-dg-icon${kind === "elite" || kind === "boss" ? " danger" : ""}`);
}

export function board(v: DungeonView): string {
  const floor = SPRITES[`floor_${v.theme}`] ?? SPRITES.floor_cave;
  const wall = SPRITES[`wall_${v.theme}`] ?? SPRITES.wall_cave;
  const leader = v.party[0]?.sprite ?? "pc_adventurer_1";
  const cells = v.tiles.map((t) => {
    const title = t.state === "hidden" ? "Unexplored" : TILE_NAME[t.kind ?? "empty"] ?? "";
    const bg = t.state === "hidden" ? wall : floor;
    const inner = t.state === "here" ? sprite(leader, "warp-dg-icon") : t.state === "seen" ? tileIcon(t.kind, t.cleared) : "";
    const cls = ["warp-dg-tile", t.state, t.reachable ? "reachable" : ""].filter(Boolean).join(" ");
    return t.reachable
      ? `<button class="${cls}" data-tile="${t.x},${t.y}" data-dg-move="${t.x},${t.y}" title="${esc(title)} — move here" style="--tile:url(${bg})">${inner}</button>`
      : `<div class="${cls}" data-tile="${t.x},${t.y}" title="${esc(title)}" style="--tile:url(${bg})">${inner}</div>`;
  }).join("");
  return `<div class="warp-dg-board" style="grid-template-columns:repeat(${v.size},1fr)">${cells}</div>`;
}

export function herePanel(v: DungeonView, ui: DungeonUi): string {
  if (v.event) {
    return `<div class="warp-card warp-dg-event${v.event.romance ? " romance" : ""}">
      <p>${esc(you(v.event.text))}</p>
      <div class="warp-dg-actions">${v.event.choices.map((c) => `<button class="warp-btn" data-dg-choose="${esc(c.id)}" ${!c.ok || ui.busy ? "disabled" : ""}>${esc(you(c.label))}${c.chance !== null ? ` <span class="warp-dim">${c.chance}%</span>` : ""}${c.cost ? ` <span class="warp-money">${c.cost}g</span>` : ""}</button>`).join("")}</div>
    </div>`;
  }
  const parts: string[] = [];
  if (v.here.shop) {
    parts.push(`<div class="warp-card"><h3>Merchant</h3>${v.here.shop.map((w) => `<div class="warp-dg-ware">${sprite(w.sprite)}<div><b>${esc(w.name)}</b><div class="warp-dim">${esc(w.desc)}</div></div><button class="warp-btn warp-mini" data-dg-buy="${esc(w.id)}" ${w.affordable && !ui.busy ? "" : "disabled"}>${w.price}g</button></div>`).join("")}</div>`);
  }
  if (v.here.canDescend) {
    parts.push(`<div class="warp-card warp-dg-stairs">${sprite("stairs")}<div><b>Stairs down</b><div class="warp-dim">Floor ${v.depth + 1} awaits. You catch your breath on the way.</div></div><button class="warp-btn warp-btn-primary" data-dg-descend ${ui.busy ? "disabled" : ""}>Go down</button></div>`);
  } else if (v.here.bottom) {
    parts.push(`<div class="warp-card"><p>This is the deepest floor. Well done — head back out whenever you like.</p></div>`);
  }
  return parts.join("");
}

function battleScreen(v: DungeonView, ui: DungeonUi): string {
  const b = v.battle!;
  const floor = SPRITES[`floor_${v.theme}`] ?? SPRITES.floor_cave;
  const foes = b.fighters.filter((f) => f.side === "foe");
  const party = b.fighters.filter((f) => f.side === "party");
  const active = party.find((f) => f.id === b.active);
  const pickFoe = ui.pick?.target === "foe";
  const pickAlly = ui.pick?.target === "ally";
  const foeHtml = foes.map((f) => {
    const cls = ["warp-dg-foe", f.alive ? "" : "down", f.boss ? "boss" : f.elite ? "elite" : "", pickFoe && f.alive ? "targetable" : ""].filter(Boolean).join(" ");
    const tag = pickFoe && f.alive ? "button" : "div";
    return `<${tag} class="${cls}" ${pickFoe && f.alive ? `data-dg-target="${esc(f.id)}"` : ""}>
      ${sprite(f.sprite, "warp-dg-foe-img")}
      <div class="warp-dg-foe-name">${esc(f.name)}</div>
      ${bar(f.hp, f.mhp, "hp", "HP")}
    </${tag}>`;
  }).join("");

  let commands = "";
  if (b.over) {
    commands = `<div class="warp-dim">The fight is over.</div>`;
  } else if (ui.pick) {
    commands = `<div class="warp-dg-prompt">Choose ${ui.pick.target === "foe" ? "an enemy" : "an ally"} <button class="warp-btn warp-mini" data-dg-cancel>Cancel</button></div>`;
  } else if (active) {
    const skills = b.skills.map((s) => `<button class="warp-btn warp-dg-cmd" data-dg-skill="${esc(s.id)}" data-dg-skill-target="${esc(s.target)}" ${s.usable && !ui.busy ? "" : "disabled"} title="${esc(s.cost || "Free")}">${esc(s.name)}${s.cost ? ` <span class="warp-dim">${esc(s.cost)}</span>` : ""}</button>`).join("");
    const items = v.bag.map((i) => `<button class="warp-btn warp-dg-cmd" data-dg-item="${esc(i.id)}" ${ui.busy ? "disabled" : ""}>${sprite(i.sprite, "warp-dg-mini")}${esc(i.name)} ×${i.count}</button>`).join("");
    commands = `<div class="warp-dg-turn"><b>${esc(you(active.name))}</b>'s turn</div>
      <div class="warp-dg-cmds">${skills}</div>
      ${items ? `<div class="warp-dg-cmds">${items}</div>` : ""}
      <div class="warp-dg-cmds">
        ${b.canEscape ? `<button class="warp-btn warp-dg-cmd" data-dg-escape ${ui.busy ? "disabled" : ""}>Escape</button>` : ""}
        <button class="warp-btn warp-dg-cmd" data-dg-auto="round" ${ui.busy ? "disabled" : ""} title="Everyone picks a sensible move for this round">Auto round</button>
        <button class="warp-btn warp-dg-cmd" data-dg-auto="battle" ${ui.busy ? "disabled" : ""} title="Fight it out automatically">Auto battle</button>
      </div>`;
  }
  return `<div class="warp-dg-battle">
    <div class="warp-dg-stage" style="background-image:linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.55)),url(${floor})">
      <div class="warp-dg-eyebrow">${esc(b.kind === "boss" ? "Floor guardian" : b.kind === "elite" ? "Elite battle" : "Battle")} · round ${b.round}</div>
      <div class="warp-dg-foes">${foeHtml}</div>
    </div>
    <div class="warp-dg-party">${party.map((f) => memberCard(f, { targetable: pickAlly })).join("")}</div>
    <div class="warp-card warp-dg-command">${commands}</div>
    <div class="warp-dg-log">${b.log.slice(-5).reverse().map((l) => `<div>${esc(you(l))}</div>`).join("")}</div>
  </div>`;
}

function entrance(entries: DungeonEntryView[], ui: DungeonUi): string {
  if (!entries.length) {
    return `<div class="warp-card"><p>There's no dungeon here. Dungeons appear as a choice ("Enter …") at their entrance.</p></div>`;
  }
  return entries.map((e) => `<div class="warp-card warp-dg-entry">
    <div class="warp-dg-entry-head">${sprite("stairs")}<div><h3>${esc(e.name)}</h3>
      <div class="warp-dim">${e.deepest ? `Deepest so far: floor ${e.deepest}` : "Unexplored"}${e.floors ? ` · ${e.floors} floors` : " · endless"}</div></div></div>
    ${e.desc ? `<p>${esc(e.desc)}</p>` : ""}
    ${e.max && e.companions.length ? `<div class="warp-eyebrow">Bring along (up to ${e.max})</div>
      <div class="warp-dg-mates">${e.companions.map((c) => `<label class="warp-dg-mate"><input type="checkbox" data-dg-mate="${esc(c.id)}" ${ui.mates.has(c.id) ? "checked" : ""} ${!ui.mates.has(c.id) && ui.mates.size >= e.max ? "disabled" : ""}> ${esc(c.name)} <span class="warp-dim">${esc(c.cls)}${c.present ? " · here" : ""}</span></label>`).join("")}</div>` : ""}
    <p class="warp-dim">Tiles are face down until you step on them. One of them leads down. Leave whenever you like — you keep what you found. Get wiped out and you lose it.</p>
    <button class="warp-btn warp-btn-primary" data-dg-enter="${esc(e.id)}" ${ui.busy ? "disabled" : ""}>Enter ${esc(e.name)}</button>
  </div>`).join("");
}

export function renderDungeon(v: DungeonView | null, entries: DungeonEntryView[], ui: DungeonUi): string {
  if (!v) return entrance(entries, ui);
  const head = `<div class="warp-dg-head">
    <div><div class="warp-eyebrow">${esc(v.name)}</div><b>Floor ${v.depth}${v.floors ? ` / ${v.floors}` : ""}</b>${v.boss ? ` <span class="warp-tone-bad" title="A guardian blocks the way down">☠</span>` : ""}</div>
    <div class="warp-dg-stats"><span title="Party level">Lv ${v.level}</span><span class="warp-dim" title="Experience">${v.xp}/${v.xpNext} XP</span><span class="warp-money">${v.gold}g</span></div>
  </div>`;
  if (v.battle) return head + battleScreen(v, ui);
  const pickAlly = ui.pick?.kind === "use";
  const bag = v.bag.filter((i) => i.id !== "bomb").map((i) => `<button class="warp-btn warp-mini" data-dg-use="${esc(i.id)}" ${ui.busy ? "disabled" : ""}>${sprite(i.sprite, "warp-dg-mini")}${esc(i.name)} ×${i.count}</button>`).join("");
  const bombs = v.bag.find((i) => i.id === "bomb");
  return head
    + `<div class="warp-dg-party">${v.party.map((f) => memberCard(f, { targetable: pickAlly })).join("")}</div>`
    + (pickAlly ? `<div class="warp-dg-prompt">Who drinks it? <button class="warp-btn warp-mini" data-dg-cancel>Cancel</button></div>` : "")
    + board(v)
    + herePanel(v, ui)
    + `<div class="warp-dg-bag">${bag}${bombs ? `<span class="warp-dim">${sprite("bomb", "warp-dg-mini")}Bomb ×${bombs.count}</span>` : ""}${v.loot.length ? `<span class="warp-dim" title="Kept when you leave">Found: ${esc(v.loot.map((l) => `${l.name}${l.count > 1 ? ` ×${l.count}` : ""}`).join(", "))}</span>` : ""}</div>`
    + `<div class="warp-dg-log">${v.log.slice(0, 6).map((l) => `<div>${esc(you(l))}</div>`).join("")}</div>`
    + `<button class="warp-btn warp-dg-leave" data-dg-leave ${ui.busy ? "disabled" : ""}>Leave the dungeon</button>`;
}
