// Game state and the primitive event log.
//
// State is never stored directly: it's the fold of concrete events recorded on
// each message swipe. Events hold final deltas (not formulas), so replaying a
// chat gives the same numbers even if the author edits the ruleset later —
// only clamping follows the current ruleset.

import type { Value, ExprEnv } from "./expr.js";
import { evalNumber } from "./expr.js";
import type { Ruleset, StatDef, Band } from "./ruleset.js";

export interface GameState {
  stats: Record<string, number>;
  flags: Record<string, Value>;
  items: Record<string, number>;
  /** Display names for items the narrator introduced without a declaration. */
  itemNames: Record<string, string>;
  rel: Record<string, Record<string, number>>;
  people: Record<string, { name: string }>;
  location: string | null;
  locationName: string | null;
  minutes: number;
  conditions: Record<string, { until: number | null }>;
  triggers: Record<string, boolean>;
  turn: number;
}

export type EventSource = "cost" | "check" | "action" | "drift" | "trigger" | "narrator" | "manual" | "start";

export type WarpEvent = { src: EventSource; note?: string } & (
  | { t: "stat"; id: string; d?: number; set?: number }
  | { t: "flag"; key: string; v: Value }
  | { t: "item"; id: string; d: number; name?: string }
  | { t: "rel"; who: string; stat: string; d?: number; set?: number }
  | { t: "person"; id: string; name: string }
  | { t: "move"; to: string; name?: string }
  | { t: "time"; min: number }
  | { t: "cond"; id: string; on: boolean; until?: number | null }
  | { t: "trig"; id: string; v: boolean }
  | { t: "turn" }
);

export function initialState(r: Ruleset): GameState {
  const s: GameState = {
    stats: {},
    flags: {},
    items: { ...r.startItems },
    itemNames: {},
    rel: {},
    people: {},
    location: r.startLocation,
    locationName: r.startLocation ? r.locations[r.startLocation]?.name ?? r.startLocation : null,
    minutes: r.clock.start,
    conditions: {},
    triggers: {},
    turn: 0,
  };
  for (const id of r.statOrder) s.stats[id] = r.stats[id].start;
  for (const f of Object.values(r.flags)) s.flags[f.id] = f.start;
  for (const p of Object.values(r.people)) {
    s.people[p.id] = { name: p.name };
    s.rel[p.id] = {};
    for (const rs of r.relStatOrder) s.rel[p.id][rs] = p.start[rs] ?? r.relStats[rs].start;
  }
  return s;
}

export function statMax(r: Ruleset, def: StatDef, s: GameState): number {
  if (!def.maxExpr) return def.max;
  const m = evalNumber(def.maxExpr, makeEnv(r, s), def.max);
  return Math.max(def.min + 1, m);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function applyEvent(s: GameState, e: WarpEvent, r: Ruleset): void {
  switch (e.t) {
    case "stat": {
      const def = r.stats[e.id];
      const cur = s.stats[e.id] ?? def?.start ?? 0;
      const next = e.set !== undefined ? e.set : cur + (e.d ?? 0);
      s.stats[e.id] = def ? clamp(next, def.min, statMax(r, def, s)) : next;
      break;
    }
    case "flag": s.flags[e.key] = e.v; break;
    case "item": {
      const n = (s.items[e.id] ?? 0) + e.d;
      if (n <= 0) delete s.items[e.id];
      else s.items[e.id] = n;
      if (e.name && !r.items[e.id]) s.itemNames[e.id] = e.name;
      break;
    }
    case "person":
      s.people[e.id] = { name: e.name };
      if (!s.rel[e.id]) {
        s.rel[e.id] = {};
        for (const rs of r.relStatOrder) s.rel[e.id][rs] = r.relStats[rs].start;
      }
      break;
    case "rel": {
      if (!s.rel[e.who]) {
        s.rel[e.who] = {};
        for (const rs of r.relStatOrder) s.rel[e.who][rs] = r.relStats[rs].start;
      }
      const def = r.relStats[e.stat];
      const cur = s.rel[e.who][e.stat] ?? def?.start ?? 0;
      const next = e.set !== undefined ? e.set : cur + (e.d ?? 0);
      s.rel[e.who][e.stat] = def ? clamp(next, def.min, def.max) : next;
      break;
    }
    case "move":
      s.location = e.to;
      s.locationName = r.locations[e.to]?.name ?? e.name ?? e.to;
      break;
    case "time": s.minutes += Math.max(0, e.min); break;
    case "cond":
      if (e.on) s.conditions[e.id] = { until: e.until ?? null };
      else delete s.conditions[e.id];
      break;
    case "trig": s.triggers[e.id] = e.v; break;
    case "turn": s.turn += 1; break;
  }
}

export function cloneState(s: GameState): GameState {
  return structuredClone(s);
}

export function foldEvents(r: Ruleset, batches: Iterable<WarpEvent[]>, from?: GameState): GameState {
  const s = from ? cloneState(from) : initialState(r);
  for (const batch of batches) for (const e of batch) applyEvent(s, e, r);
  return s;
}

// ───────────────────────── expression environment ─────────────────────────

export function makeEnv(r: Ruleset, s: GameState, extra: Record<string, Value> = {}): ExprEnv {
  const day = Math.floor(s.minutes / 1440);
  const clockVars: Record<string, Value> = {
    minutes: s.minutes,
    hour: Math.floor((s.minutes % 1440) / 60),
    minute: s.minutes % 60,
    day: day + 1,
    weekday: r.clock.weekdays[day % r.clock.weekdays.length] ?? "",
    turn: s.turn,
    location: s.location ?? "",
  };
  return {
    lookup(path) {
      const [head, ...rest] = path;
      if (rest.length === 0) {
        if (head in extra) return extra[head];
        if (head in s.stats) return s.stats[head];
        if (r.stats[head]) return r.stats[head].start;
        if (head in clockVars) return clockVars[head];
        if (head in s.flags) return s.flags[head];
        if (r.flags[head]) return r.flags[head].start;
        return undefined;
      }
      if (head === "flags") return s.flags[rest[0]] ?? (r.flags[rest[0]] ? r.flags[rest[0]].start : false);
      if (head === "items") return s.items[rest[0]] ?? 0;
      if (head === "rel" && rest.length === 2) return s.rel[rest[0]]?.[rest[1]] ?? r.relStats[rest[1]]?.start ?? 0;
      if (s.rel[head] && rest.length === 1) return s.rel[head][rest[0]] ?? 0;
      if (r.people[head] && rest.length === 1) return r.relStats[rest[0]]?.start ?? 0;
      return undefined;
    },
    call(name, args) {
      const a0 = String(args[0] ?? "");
      switch (name) {
        case "has": return (s.items[a0] ?? 0) >= (typeof args[1] === "number" ? args[1] : 1);
        case "count": return s.items[a0] ?? 0;
        case "flag": return s.flags[a0] ?? false;
        case "cond": return a0 in s.conditions;
        case "at": return s.location === a0;
        case "rel": return s.rel[a0]?.[String(args[1] ?? "")] ?? r.relStats[String(args[1] ?? "")]?.start ?? 0;
        case "met": return a0 in s.people;
        case "between": {
          // between(hour, 20, 6) handles wrap-around ranges like night hours.
          const v = Number(args[0]); const lo = Number(args[1]); const hi = Number(args[2]);
          return lo <= hi ? v >= lo && v < hi : v >= lo || v < hi;
        }
      }
      return undefined;
    },
  };
}

// ───────────────────────── presentation helpers ─────────────────────────

export function bandFor(def: StatDef, value: number): Band | null {
  let hit: Band | null = null;
  for (const b of def.bands) if (value >= b.at) hit = b;
  return hit ?? def.bands[0] ?? null;
}

export function gradeFor(def: StatDef, value: number, max: number): string | null {
  if (!def.grades?.length) return null;
  const span = max - def.min;
  if (span <= 0) return def.grades[0];
  const idx = Math.min(def.grades.length - 1, Math.floor(((value - def.min) / span) * def.grades.length));
  return def.grades[Math.max(0, idx)];
}

export function formatClock(r: Ruleset, minutes: number): { label: string; time: string; day: string; phase: string } {
  const day = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const wd = r.clock.weekdays[day % r.clock.weekdays.length] ?? "";
  const dayLabel = `${wd} · Day ${day + 1}`;
  const phase = h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
  return { label: `${dayLabel} · ${time}`, time, day: dayLabel, phase };
}

export function formatNumber(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function itemName(r: Ruleset, s: GameState, id: string): string {
  return r.items[id]?.name ?? s.itemNames[id] ?? id.replace(/[_-]+/g, " ");
}

export function personName(r: Ruleset, s: GameState, id: string): string {
  return s.people[id]?.name ?? r.people[id]?.name ?? id;
}
