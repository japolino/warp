// What just happened, worth a flourish: worked out by comparing the previous
// state push with the new one. Pure — the frontend plays these as visuals and
// sounds (fx.ts, sfx.ts). History isn't replayed: only changes between pushes.

import type { BackendToFrontend } from "../shared/protocol.js";

type StateMsg = Extract<BackendToFrontend, { type: "state" }>;

export type FxEvent =
  | { kind: "roll"; messageId: string; tier: string; crit: boolean; label: string }
  | { kind: "round"; messageId: string; tier: string | null; ended: "win" | "loss" | null }
  | { kind: "reaction"; reaction: string }
  | { kind: "stage"; up: boolean; label: string }
  | { kind: "dateStart" } | { kind: "dateEnd" }
  | { kind: "hit"; id: string; side: "party" | "foe"; amount: number; ko: boolean; crit: boolean }
  | { kind: "heal"; id: string; amount: number }
  | { kind: "reveal"; x: number; y: number; tile: string | null }
  | { kind: "step" }
  | { kind: "floor"; depth: number }
  | { kind: "gold"; amount: number }
  | { kind: "loot" }
  | { kind: "level"; level: number }
  | { kind: "battle"; boss: boolean }
  | { kind: "battleOver"; won: boolean };

const recKey = (r: StateMsg["records"][number]) => `${r.messageId}:${r.swipe}:${r.check?.total ?? ""}:${r.check?.tier ?? ""}`;

export function fxEvents(prev: StateMsg | null, next: StateMsg): FxEvent[] {
  // A different chat (or the first push) is a fresh page, not a series of events.
  if (!prev || prev.chatId !== next.chatId) return [];
  const out: FxEvent[] = [];

  // Rolls: records with a check that weren't there before.
  const seen = new Set(prev.records.map(recKey));
  for (const r of next.records) {
    if (!r.check || seen.has(recKey(r))) continue;
    out.push({ kind: "roll", messageId: r.messageId, tier: r.check.tier, crit: r.check.tier.startsWith("crit"), label: r.check.label });
  }

  // Encounter rounds told in a growing message.
  const before = new Map((prev.encounterLogs ?? []).map((l) => [l.messageId, l]));
  for (const l of next.encounterLogs ?? []) {
    const p = before.get(l.messageId);
    if (p && p.rounds.length === l.rounds.length && p.status === l.status) continue;
    const last = l.rounds[l.rounds.length - 1];
    if (!last) continue;
    const t = last.check?.tier ?? null;
    out.push({ kind: "round", messageId: l.messageId, tier: t === null ? null : /great/.test(t) ? "crit_success" : /badly/.test(t) ? "crit_fail" : /success/.test(t) ? "success" : t === "partial" ? "partial" : "fail", ended: l.ended ? (l.ended.loss ? "loss" : "win") : null });
  }

  // Dates: a reaction, a change of stage, the start and end.
  const ps = prev.date?.session ?? null, ns = next.date?.session ?? null;
  if (!ps && ns) out.push({ kind: "dateStart" });
  if (ps && !ns) out.push({ kind: "dateEnd" });
  if (ns?.last && (ps?.who !== ns.who || ps?.last?.label !== ns.last.label || ps?.last?.reaction !== ns.last.reaction || ps?.fatigue !== ns.fatigue)) {
    out.push({ kind: "reaction", reaction: ns.last.reaction });
  }
  if (ps && ns && ps.who === ns.who) {
    const a = prev.date?.people.find((p) => p.id === ns.who), b = next.date?.people.find((p) => p.id === ns.who);
    if (a && b && a.stage !== b.stage) out.push({ kind: "stage", up: (b.love ?? 0) >= (a.love ?? 0), label: b.stage });
  }

  // The dungeon.
  const pd = prev.dungeon, nd = next.dungeon;
  if (pd && nd && pd.id === nd.id) {
    if (nd.depth > pd.depth) out.push({ kind: "floor", depth: nd.depth });
    else {
      const was = new Map(pd.tiles.map((t) => [`${t.x},${t.y}`, t]));
      for (const t of nd.tiles) {
        const o = was.get(`${t.x},${t.y}`);
        if (o?.state === "hidden" && t.state !== "hidden") out.push({ kind: "reveal", x: t.x, y: t.y, tile: t.kind });
      }
      const ph = pd.tiles.find((t) => t.state === "here"), nh = nd.tiles.find((t) => t.state === "here");
      if (ph && nh && (ph.x !== nh.x || ph.y !== nh.y)) out.push({ kind: "step" });
    }
    if (nd.gold > pd.gold) out.push({ kind: "gold", amount: nd.gold - pd.gold });
    const bag = (v: typeof nd) => v.bag.reduce((n, i) => n + i.count, 0) + v.loot.reduce((n, i) => n + i.count, 0);
    if (bag(nd) > bag(pd)) out.push({ kind: "loot" });
    if (nd.level > pd.level) out.push({ kind: "level", level: nd.level });
    if (!pd.battle && nd.battle) out.push({ kind: "battle", boss: nd.battle.kind === "boss" });
    if (pd.battle && nd.battle && !pd.battle.over && nd.battle.over) out.push({ kind: "battleOver", won: /won|victory|win/i.test(nd.battle.over) });
    // Hits and heals, fighter by fighter.
    const fighters = (v: typeof nd) => [...(v.battle?.fighters ?? []), ...v.party];
    const old = new Map(fighters(pd).map((f) => [f.id, f]));
    const crit = (nd.battle?.log ?? []).slice(-4).some((l) => /critical|crit\b/i.test(l)) && !(pd.battle?.log ?? []).slice(-4).some((l) => /critical|crit\b/i.test(l));
    const done = new Set<string>();
    for (const f of fighters(nd)) {
      const o = old.get(f.id);
      if (!o || done.has(f.id)) continue;
      done.add(f.id);
      if (f.hp < o.hp) out.push({ kind: "hit", id: f.id, side: f.side, amount: o.hp - f.hp, ko: o.alive && !f.alive, crit });
      else if (f.hp > o.hp) out.push({ kind: "heal", id: f.id, amount: f.hp - o.hp });
    }
  }
  return out;
}
