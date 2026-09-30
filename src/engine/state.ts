// Game state and the primitive event log.
//
// State is never stored directly: it's the fold of concrete events recorded on
// each message swipe. Events hold final deltas (not formulas), so replaying a
// chat gives the same numbers even if the author edits the ruleset later —
// only clamping follows the current ruleset.

import type { Value, ExprEnv } from "./expr.js";
import { evalNumber } from "./expr.js";
import type { Ruleset, StatDef, Band, KeepSpec } from "./ruleset.js";
import type { BattleState, DungeonRun, PartyMember, Pending } from "./dungeon/types.js";
import type { DateSession, DatingMemory, Reaction } from "./date/types.js";
import { stageIndex } from "./date/stage.js";
import {
  dateAt, exposedSlots, hasTrait, isIndoors, personLocation, revealOf, seasonAt, temperatureAt,
  warmthNeeded, warmthOf, weatherAt,
} from "./world.js";

export interface EncounterState {
  id: string;
  round: number;
  foe: Record<string, number>;
  /** −100 (the foe wins) … +100 (the player wins), for encounters that swing. */
  momentum?: number;
}

export interface GameState {
  /** Per-chat world seed (weather etc.), set on the first turn. */
  seed: string | null;
  /** slot → item id currently worn. */
  worn: Record<string, string>;
  /** item id → current integrity, when damaged. */
  integrity: Record<string, number>;
  encounter: EncounterState | null;
  codex: Record<string, true>;
  feats: Record<string, true>;
  perks: Record<string, true>;
  /** People whose starting feelings have been set (by the author, the story or by hand). */
  calibrated: Record<string, true>;
  /** Ruleset people the player removed from tracking. */
  forgotten: Record<string, true>;
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
  /** Secret id → index of the highest stage the narrator has been told (−1 = none). */
  secrets: Record<string, number>;
  /** Hidden world clocks: value, and the highest stage that has surfaced (−1 = none). */
  fronts: Record<string, { v: number; stage: number }>;
  /** The random-event gauge (0–100), quiet days left, the event already picked (omen showing), and when each last happened. */
  gauge: { v: number; rest: number; next: string | null; last: Record<string, number> };
  /** World happenings that surfaced after a reply — told to the narrator on the next turn. */
  notices: string[];
  /** What has surfaced in the world, for the journal. */
  news: { text: string; at: number }[];
  /** The dungeon run in progress, if any. */
  dungeon: DungeonRun | null;
  /** Deepest floor reached per dungeon. */
  deepest: Record<string, number>;
  /** The conversation or outing in progress, if any. */
  date: DateSession | null;
  /** What dating has taught the game about each person. */
  dating: DatingMemory;
  /** Save slots: a copy of the state at the moment of saving. */
  saves: Record<string, SaveSlot>;
  /** Which playthrough this is (starting over after an ending adds one). */
  runs: number;
  /** Times the story has been rewound to a save. */
  loops: number;
  /** The player character's body: part → trait → value. */
  body: Record<string, Record<string, string>>;
  /** Transformation → stages applied. */
  tf: Record<string, number>;
  /** How people feel about each other: a → b → −100…100. */
  bonds: Record<string, Record<string, number>>;
  /** The story reached an ending (told = the narrator has written it). */
  ended: { id: string; at: number; told: boolean } | null;
}

export interface SaveSlot { at: number; turn: number; label: string; snap: GameState }

export type EventSource = "cost" | "check" | "action" | "drift" | "trigger" | "narrator" | "manual" | "start" | "world";

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
  | { t: "seed"; v: string }
  | { t: "wear"; slot: string; item: string | null }
  | { t: "dmg"; item: string; d: number }
  | { t: "enc"; id: string | null; foe?: Record<string, number>; outcome?: string; momentum?: number }
  | { t: "swing"; d: number }
  | { t: "foe"; stat: string; d?: number; set?: number }
  | { t: "round" }
  | { t: "codex"; id: string }
  | { t: "feat"; id: string }
  | { t: "perk"; id: string }
  | { t: "calib"; who: string }
  | { t: "forget"; who: string }
  | { t: "secret"; id: string; stage: number }
  | { t: "clock"; id: string; d: number }
  | { t: "stage"; id: string; n: number }
  | { t: "gauge"; d?: number; set?: number }
  | { t: "rest"; days: number }
  | { t: "omen"; id: string | null }
  | { t: "happen"; id: string }
  | { t: "notice"; text: string }
  | { t: "noticed" }
  | { t: "dg_enter"; run: DungeonRun }
  | { t: "dg_step"; x: number; y: number }
  | { t: "dg_clear"; key: string }
  | { t: "dg_down"; pos: [number, number] }
  | { t: "dg_party"; party: PartyMember[] }
  | { t: "dg_xp"; d: number }
  | { t: "dg_gold"; d: number }
  | { t: "dg_bag"; item: string; d: number }
  | { t: "dg_loot"; item: string; d: number }
  | { t: "dg_battle"; battle: BattleState | null }
  | { t: "dg_pending"; pending: Pending | null }
  | { t: "dg_log"; text: string }
  | { t: "dg_told" }
  | { t: "dg_exit" }
  | { t: "dt_start"; session: DateSession }
  | { t: "dt_patch"; patch: Partial<DateSession> }
  | { t: "dt_end" }
  | { t: "dt_pref"; who: string; key: string; v: number }
  | { t: "dt_seen"; who: string; topic: string; reaction: Reaction }
  | { t: "dt_partner"; who: string; on: boolean }
  | { t: "dt_dated"; who: string; enjoy: number }
  | { t: "body"; part: string; trait: string; v: string | null }
  | { t: "tf"; id: string; stage: number }
  | { t: "bond"; a: string; b: string; d: number }
  | { t: "news"; text: string }
  | { t: "save"; slot: string; label: string }
  | { t: "load"; slot: string }
  | { t: "restart" }
  | { t: "end"; id: string; told: boolean }
  | { t: "end_told" }
  | { t: "unend" }
);

const DG_LOG_KEPT = 12;

const NEWS_KEPT = 30;

/** The unit random-event cooldowns are measured in: minutes with a clock, turns without. */
export function timeKey(r: Ruleset, s: GameState): number {
  return r.clock.enabled ? s.minutes : s.turn;
}

export function initialState(r: Ruleset): GameState {
  const s: GameState = {
    seed: null,
    worn: {},
    integrity: {},
    encounter: null,
    codex: {},
    feats: {},
    perks: {},
    calibrated: {},
    forgotten: {},
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
    secrets: {},
    fronts: {},
    gauge: { v: 0, rest: 0, next: null, last: {} },
    notices: [],
    news: [],
    dungeon: null,
    deepest: {},
    date: null,
    dating: { prefs: {}, known: {}, partners: {}, dates: {} },
    saves: {},
    runs: 1,
    loops: 0,
    ended: null,
    body: structuredClone(r.body.parts),
    tf: {},
    bonds: structuredClone(r.bonds),
  };
  for (const id of r.statOrder) s.stats[id] = r.stats[id].start;
  // Stages with no condition at the top of a secret's ladder are known from the start.
  for (const sec of Object.values(r.secrets)) {
    let open = -1;
    while (open + 1 < sec.stages.length && !sec.stages[open + 1].when) open++;
    s.secrets[sec.id] = open;
  }
  for (const f of Object.values(r.fronts)) s.fronts[f.id] = { v: f.start, stage: -1 };
  for (const f of Object.values(r.flags)) s.flags[f.id] = f.start;
  for (const p of Object.values(r.people)) {
    s.people[p.id] = { name: p.name };
    s.rel[p.id] = {};
    for (const rs of r.relStatOrder) s.rel[p.id][rs] = p.start[rs] ?? r.relStats[rs].start;
    // An author who wrote starting feelings has calibrated them; a bare entry gets read from the story on first appearance.
    if (Object.keys(p.start).length) s.calibrated[p.id] = true;
  }
  for (const id of r.wardrobe.startWorn) {
    const slot = r.items[id]?.slot;
    if (slot) s.worn[slot] = id;
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
      if (n <= 0) {
        delete s.items[e.id];
        // Can't keep wearing something you no longer have.
        for (const [slot, id] of Object.entries(s.worn)) if (id === e.id) delete s.worn[slot];
        delete s.integrity[e.id];
      } else s.items[e.id] = n;
      if (e.name && !r.items[e.id]) s.itemNames[e.id] = e.name;
      break;
    }
    case "seed": if (!s.seed) s.seed = e.v; break;
    case "wear":
      if (e.item) {
        // Wearing implies owning; an item occupies one slot at a time.
        if (!(s.items[e.item] > 0)) s.items[e.item] = 1;
        for (const [slot, id] of Object.entries(s.worn)) if (id === e.item) delete s.worn[slot];
        s.worn[e.slot] = e.item;
      } else delete s.worn[e.slot];
      break;
    case "dmg": {
      const def = r.items[e.item];
      const max = def?.integrity ?? 100;
      const next = Math.min(max, (s.integrity[e.item] ?? max) + e.d);
      if (next <= 0) {
        // Destroyed.
        delete s.integrity[e.item];
        for (const [slot, id] of Object.entries(s.worn)) if (id === e.item) delete s.worn[slot];
        const n = (s.items[e.item] ?? 1) - 1;
        if (n <= 0) delete s.items[e.item];
        else s.items[e.item] = n;
      } else if (next >= max) delete s.integrity[e.item];
      else s.integrity[e.item] = next;
      break;
    }
    case "enc":
      s.encounter = e.id ? { id: e.id, round: 0, foe: { ...(e.foe ?? {}) }, ...(e.momentum !== undefined ? { momentum: e.momentum } : {}) } : null;
      break;
    case "swing":
      if (s.encounter && s.encounter.momentum !== undefined) s.encounter.momentum = clamp(s.encounter.momentum + e.d, -100, 100);
      break;
    case "foe": {
      if (!s.encounter) break;
      const def = r.encounters[s.encounter.id]?.foe.stats.find((x) => x.id === e.stat);
      const cur = s.encounter.foe[e.stat] ?? def?.start ?? 0;
      const next = e.set !== undefined ? e.set : cur + (e.d ?? 0);
      s.encounter.foe[e.stat] = def ? clamp(next, 0, def.max) : next;
      break;
    }
    case "round": if (s.encounter) s.encounter.round += 1; break;
    case "codex": s.codex[e.id] = true; break;
    case "feat": s.feats[e.id] = true; break;
    case "perk": s.perks[e.id] = true; break;
    case "calib": s.calibrated[e.who] = true; break;
    case "forget":
      delete s.people[e.who];
      delete s.rel[e.who];
      delete s.calibrated[e.who];
      s.forgotten[e.who] = true;
      break;
    case "person":
      s.people[e.id] = { name: e.name };
      delete s.forgotten[e.id];
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
    case "secret": s.secrets[e.id] = Math.max(s.secrets[e.id] ?? -1, e.stage); break;
    case "clock": {
      const def = r.fronts[e.id];
      const f = s.fronts[e.id] ?? { v: def?.start ?? 0, stage: -1 };
      f.v = clamp(f.v + e.d, 0, def?.max ?? 100);
      s.fronts[e.id] = f;
      break;
    }
    case "stage": {
      const def = r.fronts[e.id];
      const f = s.fronts[e.id] ?? { v: def?.start ?? 0, stage: -1 };
      if (e.n > f.stage) {
        f.stage = e.n;
        const st = def?.stages[e.n];
        const line = st?.news ?? st?.surface;
        if (line) s.news = [...s.news, { text: line, at: s.minutes }].slice(-NEWS_KEPT);
      }
      s.fronts[e.id] = f;
      break;
    }
    case "gauge": s.gauge.v = clamp(e.set !== undefined ? e.set : s.gauge.v + (e.d ?? 0), 0, 100); break;
    case "rest": s.gauge.rest = Math.max(0, e.days); break;
    case "omen": s.gauge.next = e.id; break;
    case "happen": {
      s.gauge.last[e.id] = timeKey(r, s);
      const def = r.randomEvents.events[e.id];
      const line = def?.news ?? def?.text;
      if (line) s.news = [...s.news, { text: line, at: s.minutes }].slice(-NEWS_KEPT);
      break;
    }
    case "notice": s.notices = [...s.notices, e.text]; break;
    case "noticed": s.notices = []; break;
    case "dg_enter":
      s.dungeon = structuredClone(e.run);
      s.deepest[e.run.id] = Math.max(s.deepest[e.run.id] ?? 0, e.run.depth);
      break;
    case "dg_exit": s.dungeon = null; break;
    case "dt_start": s.date = structuredClone(e.session); break;
    case "dt_patch": if (s.date) s.date = { ...s.date, ...structuredClone(e.patch) }; break;
    case "dt_end": s.date = null; break;
    case "dt_pref": s.dating.prefs = { ...s.dating.prefs, [e.who]: { ...(s.dating.prefs[e.who] ?? {}), [e.key]: e.v } }; break;
    case "dt_seen": s.dating.known = { ...s.dating.known, [e.who]: { ...(s.dating.known[e.who] ?? {}), [e.topic]: e.reaction } }; break;
    case "dt_partner": {
      const partners = { ...s.dating.partners };
      if (e.on) partners[e.who] = true; else delete partners[e.who];
      s.dating.partners = partners;
      break;
    }
    case "body": {
      const part = { ...(s.body[e.part] ?? {}) };
      if (e.v === null) delete part[e.trait]; else part[e.trait] = e.v;
      const next = { ...s.body };
      if (Object.keys(part).length) next[e.part] = part; else delete next[e.part];
      s.body = next;
      break;
    }
    case "tf": s.tf = { ...s.tf, [e.id]: Math.max(s.tf[e.id] ?? 0, e.stage) }; break;
    case "news": s.news = [...s.news, { text: e.text, at: s.minutes }].slice(-NEWS_KEPT); break;
    case "bond": s.bonds = { ...s.bonds, [e.a]: { ...(s.bonds[e.a] ?? {}), [e.b]: clamp((s.bonds[e.a]?.[e.b] ?? 0) + e.d, -100, 100) } }; break;
    case "save":
      s.saves = { ...s.saves, [e.slot]: { at: s.minutes, turn: s.turn, label: e.label, snap: snapshotOf(s) } };
      break;
    case "load": {
      const base = e.slot === "start" ? initialState(r) : s.saves[e.slot] ? structuredClone(s.saves[e.slot].snap) : null;
      if (!base) break;
      rewind(r, s, base, r.checkpoints.keep);
      s.loops += 1;
      break;
    }
    case "restart": {
      rewind(r, s, initialState(r), r.legacy);
      s.saves = {};
      s.runs += 1;
      s.loops = 0;
      break;
    }
    case "end": if (!s.ended) s.ended = { id: e.id, at: s.minutes, told: e.told }; break;
    case "end_told": if (s.ended) s.ended = { ...s.ended, told: true }; break;
    case "unend": s.ended = null; break;
    case "dt_dated": {
      const prev = s.dating.dates[e.who] ?? { count: 0, best: 0 };
      s.dating.dates = { ...s.dating.dates, [e.who]: { count: prev.count + 1, best: Math.max(prev.best, e.enjoy) } };
      break;
    }
    default: if (s.dungeon) applyDungeon(s, s.dungeon, e);
  }
}

/** A save's copy of the state (without the other saves inside it). */
function snapshotOf(s: GameState): GameState {
  const snap = structuredClone({ ...s, saves: {} });
  return snap;
}

/** Replace the state with `base`, carrying over what `keep` says survives. Save slots and run counters stay. */
function rewind(r: Ruleset, s: GameState, base: GameState, keep: KeepSpec) {
  const from = structuredClone(s);
  const next = structuredClone(base);
  if (keep.codex) next.codex = { ...next.codex, ...from.codex };
  if (keep.feats) next.feats = { ...next.feats, ...from.feats };
  if (keep.perks) next.perks = { ...next.perks, ...from.perks };
  if (keep.secrets) for (const [id, st] of Object.entries(from.secrets)) next.secrets[id] = Math.max(next.secrets[id] ?? -1, st);
  if (keep.deepest) for (const [id, d] of Object.entries(from.deepest)) next.deepest[id] = Math.max(next.deepest[id] ?? 0, d);
  if (keep.dating) next.dating = from.dating;
  if (keep.people) {
    next.people = { ...next.people, ...from.people };
    for (const id of Object.keys(from.people)) next.rel[id] ??= from.rel[id];
  }
  for (const id of keep.stats) if (id in from.stats) next.stats[id] = from.stats[id];
  for (const id of keep.flags) if (id in from.flags) next.flags[id] = from.flags[id];
  for (const id of keep.items) {
    if (from.items[id] > 0) next.items[id] = from.items[id];
    else delete next.items[id];
  }
  for (const stat of keep.rel) for (const [who, m] of Object.entries(from.rel)) if (stat in m) (next.rel[who] ??= {})[stat] = m[stat];
  // Bookkeeping that belongs to the playthrough, not the moment.
  next.seed = from.seed;
  next.saves = from.saves;
  next.runs = from.runs;
  next.loops = from.loops;
  next.ended = null;
  next.turn = from.turn;
  void r;
  Object.assign(s, next);
}

function applyDungeon(s: GameState, d: DungeonRun, e: WarpEvent) {
  switch (e.t) {
    case "dg_step": {
      d.pos = [e.x, e.y];
      const k = `${e.x},${e.y}`;
      if (!d.seen.includes(k)) d.seen = [...d.seen, k];
      break;
    }
    case "dg_clear": if (!d.cleared.includes(e.key)) d.cleared = [...d.cleared, e.key]; break;
    case "dg_down":
      d.depth += 1;
      d.pos = e.pos;
      d.seen = [`${e.pos[0]},${e.pos[1]}`];
      d.cleared = [];
      d.pending = null;
      s.deepest[d.id] = Math.max(s.deepest[d.id] ?? 0, d.depth);
      break;
    case "dg_party": d.party = e.party.map((p) => ({ ...p })); break;
    case "dg_xp": d.xp = Math.max(0, d.xp + e.d); break;
    case "dg_gold": d.gold = Math.max(0, d.gold + e.d); break;
    case "dg_bag": {
      const n = (d.bag[e.item] ?? 0) + e.d;
      d.bag = { ...d.bag, [e.item]: Math.max(0, n) };
      break;
    }
    case "dg_loot": {
      const n = (d.loot[e.item] ?? 0) + e.d;
      const loot = { ...d.loot };
      if (n > 0) loot[e.item] = n; else delete loot[e.item];
      d.loot = loot;
      break;
    }
    case "dg_battle": d.battle = e.battle ? structuredClone(e.battle) : null; break;
    case "dg_pending": d.pending = e.pending ? { ...e.pending } : null; break;
    case "dg_log":
      d.log = [...d.log, e.text].slice(-DG_LOG_KEPT);
      d.untold = [...(d.untold ?? []), e.text].slice(-DG_LOG_KEPT);
      break;
    case "dg_told": d.untold = []; break;
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

/** Every built-in name formulas can use (for the linter and the AI builder's reference). */
export const BUILTIN_NAMES = [
  "minutes", "hour", "minute", "day", "weekday", "turn", "location",
  "month", "date", "season", "weather", "temperature", "indoors", "outside",
  "warmth", "warmth_min", "warmth_max", "too_cold", "too_hot", "reveal", "exposed", "naked",
  "in_encounter", "round", "momentum", "target", "in_dungeon", "dungeon_depth",
  "in_date", "on_outing", "loops", "runs",
];

export function makeEnv(r: Ruleset, s: GameState, extra: Record<string, Value> = {}): ExprEnv {
  const day = Math.floor(s.minutes / 1440);
  const date = dateAt(r, s.minutes);
  // Lazily computed so formulas that don't use the world pay nothing for it.
  let world: Record<string, Value> | null = null;
  const worldVars = (): Record<string, Value> => {
    if (world) return world;
    const temp = temperatureAt(r, s);
    const need = temp === null ? null : warmthNeeded(temp);
    const warmth = warmthOf(r, s);
    const exposed = exposedSlots(r, s).length;
    const indoors = isIndoors(r, s);
    world = {
      month: date?.month ?? 0,
      date: date?.day ?? 0,
      season: seasonAt(r, s.minutes) ?? "",
      weather: weatherAt(r, s)?.id ?? "",
      temperature: temp ?? 20,
      indoors,
      outside: !indoors,
      warmth,
      warmth_min: need?.min ?? 0,
      warmth_max: need?.max ?? 99,
      too_cold: need ? warmth < need.min : false,
      too_hot: need ? warmth > need.max : false,
      reveal: revealOf(r, s),
      exposed,
      naked: r.wardrobe.enabled && exposed === r.wardrobe.cover.length && r.wardrobe.cover.length > 0,
      in_encounter: !!s.encounter,
      momentum: s.encounter?.momentum ?? 0,
      in_dungeon: !!s.dungeon,
      dungeon_depth: s.dungeon?.depth ?? 0,
      in_date: !!s.date,
      loops: s.loops,
      runs: s.runs,
      on_outing: s.date?.kind === "outing",
      round: s.encounter?.round ?? 0,
      target: "",
    };
    return world;
  };
  const clockVars: Record<string, Value> = {
    minutes: s.minutes,
    hour: Math.floor((s.minutes % 1440) / 60),
    minute: s.minutes % 60,
    day: day + 1,
    weekday: r.clock.weekdays[day % r.clock.weekdays.length] ?? "",
    turn: s.turn,
    location: s.location ?? "",
  };
  // Schedules are evaluated with an env that can't ask about presence (no recursion).
  const scheduleEnv = (): ExprEnv => ({ lookup: base.lookup, call: (n, a) => (n === "present" || n === "where" ? undefined : base.call!(n, a)) });
  const base: ExprEnv = {
    lookup(path) {
      const [head, ...rest] = path;
      if (rest.length === 0) {
        if (head in extra) return extra[head];
        if (head in s.stats) return s.stats[head];
        if (r.stats[head]) return r.stats[head].start;
        if (head in clockVars) return clockVars[head];
        if (head in s.flags) return s.flags[head];
        if (r.flags[head]) return r.flags[head].start;
        const w = worldVars();
        if (head in w) return w[head];
        return undefined;
      }
      if (head === "foe") {
        if (!s.encounter) return 0;
        const def = r.encounters[s.encounter.id]?.foe.stats.find((x) => x.id === rest[0]);
        return s.encounter.foe[rest[0]] ?? def?.start ?? 0;
      }
      if (head === "target" && typeof extra.target === "string" && rest.length === 1) {
        return s.rel[extra.target]?.[rest[0]] ?? r.relStats[rest[0]]?.start ?? 0;
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
        case "wearing": return Object.values(s.worn).includes(a0);
        case "worn": return s.worn[a0] ?? "";
        case "trait": return hasTrait(r, s, a0);
        case "present": return personLocation(r, s, a0, scheduleEnv()) === s.location && !!s.location;
        case "where": return personLocation(r, s, a0, scheduleEnv()) ?? "";
        case "codex": return a0 in s.codex;
        case "feat": return a0 in s.feats;
        case "perk": return a0 in s.perks;
        // How many stages of a secret the narrator knows (0 = none).
        case "secret": return (s.secrets[a0] ?? -1) + 1;
        // A world clock's value, and how many of its stages have surfaced.
        case "front": return s.fronts[a0]?.v ?? r.fronts[a0]?.start ?? 0;
        case "front_stage": return (s.fronts[a0]?.stage ?? -1) + 1;
        case "happened": return a0 in s.gauge.last;
        // Deepest floor reached in a dungeon (0 = never entered).
        case "deepest": return s.deepest[a0] ?? 0;
        // Dating: together with someone, and how many outings you've had.
        case "partner": return a0 in s.dating.partners;
        // Relationship stage index (0 = the first rung), −1 when hostile.
        case "stage": return stageIndex(r, s, a0);
        // Checkpoints: whether a slot holds a save.
        case "saved": return a0 in s.saves;
        // Body: a trait's value ('' when absent), and how far a transformation has gone.
        case "body": return s.body[a0]?.[String(args[1] ?? "type")] ?? "";
        case "transformed": return s.tf[a0] ?? 0;
        // How one person feels about another (−100…100), and how far a companion's arc has gone.
        case "bond": return s.bonds[a0]?.[String(args[1] ?? "")] ?? 0;
        case "arc": return s.fronts[`arc_${a0}`]?.v ?? 0;
        case "dates": return s.dating.dates[a0]?.count ?? 0;
      }
      return undefined;
    },
  };
  return base;
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
