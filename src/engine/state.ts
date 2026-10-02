// Game state and the primitive event log.
//
// State is never stored directly: it's the fold of concrete events recorded on
// each message swipe. Events hold final deltas (not formulas), so replaying a
// chat gives the same numbers even if the author edits the ruleset later —
// only clamping follows the current ruleset.

import type { Value, ExprEnv } from "./expr.js";
import { evalBool, evalNumber } from "./expr.js";
import type { Ruleset, StatDef, Band, KeepSpec } from "./ruleset.js";
import type { BattleState, BoonOffer, DungeonRun, PartyMember, Pending } from "./dungeon/types.js";
import type { DateSession, DatingMemory, Reaction } from "./date/types.js";
import { stageIndex } from "./date/stage.js";
import { rememberSocial } from "./date/memory.js";
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
  /** Who the opponent is this time (someone from the story), when not the encounter's own foe. */
  foeName?: string;
  /** In-game minute it started: tells one encounter from the next (uses per encounter). */
  at?: number;
  /** Statuses on the opponent: rounds left (null = until the fight ends). */
  conds?: Record<string, number | null>;
  /** Foe stat maximums and armor worked out from formulas when it started (absent = the rulebook's numbers). */
  max?: Record<string, number>;
  armor?: Record<string, number>;
}

export type QuestStatus = "active" | "ready" | "done" | "failed";
/** A quest the story handed out (it has no ruleset entry): what was asked, by whom, and what's at stake. */
export interface StoryQuest { name: string; giver?: string; goal: string; fail?: string; stakes?: string }
/** A quest taken: where it stands, when it was taken and is due, goal counts, and (for story quests) what it is. */
export interface QuestState { st: QuestStatus; at: number; due: number | null; prog: Record<string, number>; story?: StoryQuest; ended?: number }
/** Something a person remembers about {{user}}. */
export interface Memory { text: string; at: number }

/** Uses of something limited (an ability, a perk's reroll): today's count, and this encounter's. */
export interface Charge { day: number; n: number; enc?: string; encN: number }

export interface GameState {
  /** Per-chat world seed (weather etc.), set on the first turn. */
  seed: string | null;
  /** slot → item id currently worn. */
  worn: Record<string, string>;
  /** item id → current integrity, when damaged. */
  integrity: Record<string, number>;
  encounter: EncounterState | null;
  /** The last encounter that ended: which, against whom, how, where and when (so the story can't simply restart it). */
  lastEncounter?: { id: string; foeName?: string; outcome: string; at: number; loc: string | null } | null;
  codex: Record<string, true>;
  feats: Record<string, true>;
  perks: Record<string, true>;
  /** Abilities taught by the story (`learn:`), beyond those known from the start or from perks. */
  learned: Record<string, true>;
  /** "ability:haste" / "perk:silver_tongue" → how much it has been used. */
  charges: Record<string, Charge>;
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
  /** until: the minute it wears off; rounds: encounter rounds left (rounds-only statuses end with the fight). */
  conditions: Record<string, { until: number | null; rounds?: number }>;
  /** Conditions on other people (drugged, sick, charmed…): person → condition → until. */
  pconds: Record<string, Record<string, { until: number | null }>>;
  /** Quests taken, done or failed. */
  quests: Record<string, QuestState>;
  /** What people remember about {{user}}, oldest first. */
  memories: Record<string, Memory[]>;
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
  /** A pregnancy under way: who carries, with whom, since when, stages told. */
  pregnancy: { carrier: string; with: string; since: number; told: number } | null;
  /** Children. They stay out of the cast (and out of reach of every action) until they come of age. */
  kin: Record<string, Kin>;
  /** Obligations: when the next payment is due, what's owed now, how many were missed. */
  dues: Record<string, { due: number; owed: number; missed: number }>;
  /** Who has seen {{user}} exposed (and what), and who only heard about it. */
  seen: Record<string, { what: string; at: number; where: string; heard?: boolean }>;
  /** Fruitless explorations per place since the last find, and the places found. */
  explored: Record<string, number>;
  discovered: string[];
  /** A work shift in progress. */
  job: { id: string; n: number; patron: number; earned: number; tips: number; log: { who: string; result: string }[] } | null;
  /** The story reached an ending (told = the narrator has written it). */
  ended: { id: string; at: number; told: boolean } | null;
  /** Continued past this ending; rearm only after its predicate becomes false. */
  dismissedEndings: string[];
  /** Progress toward the next point, per stat (in the stat's own units; a point is gained at 1). */
  practice: Record<string, number>;
  /** Recent checked action/context uses. Optional for saves made before diminishing practice. */
  practiceUse?: Record<string, { n: number; turn: number; minutes: number }>;
  /** Who the story has in the scene: judged here or gone, at the place and time it was judged. */
  scene: Record<string, { here: boolean; loc: string | null; at: number }>;
  /** Where {{user}} was before the last move (people there may or may not have come along). */
  lastLocation: string | null;
  /** Uses left in the item in hand, for items with uses (absent = a fresh one). */
  uses: Record<string, number>;
}

export interface Kin { name: string; sex: "girl" | "boy"; born: number; parents: string[]; body: Record<string, Record<string, string>>; joined: boolean }

/** A child's age in years (children can age faster than the calendar). */
export function kinAge(r: Ruleset, s: GameState, id: string): number {
  const k = s.kin[id];
  return k ? Math.floor(((s.minutes - k.born) / 1440 / 365) * r.lineage.speed) : 0;
}

export interface SaveSlot { at: number; turn: number; label: string; snap: GameState }

export type EventSource = "cost" | "check" | "action" | "drift" | "trigger" | "narrator" | "manual" | "start" | "world";

/** `why`: what caused this change, in words (for the "Why?" view). */
export type WarpEvent = { src: EventSource; note?: string; why?: string } & (
  | { t: "stat"; id: string; d?: number; set?: number }
  | { t: "flag"; key: string; v: Value }
  | { t: "item"; id: string; d: number; name?: string }
  | { t: "rel"; who: string; stat: string; d?: number; set?: number }
  | { t: "person"; id: string; name: string }
  | { t: "move"; to: string; name?: string }
  | { t: "time"; min: number }
  | { t: "cond"; id: string; on: boolean; until?: number | null; rounds?: number }
  /** A status on the opponent (rounds null = until the fight ends), or taken off. */
  | { t: "fcond"; id: string; on: boolean; rounds?: number | null }
  /** Rounds left on a status, after a round passes. */
  | { t: "cleft"; side: "player" | "foe"; id: string; rounds: number }
  | { t: "pcond"; who: string; id: string; on: boolean; until?: number | null }
  /** A quest moves on (st null: forgotten, so a repeatable one can be taken again). */
  | { t: "quest"; id: string; st: QuestStatus | null; due?: number | null; story?: StoryQuest }
  | { t: "qprog"; id: string; goal: string; d: number }
  | { t: "memory"; who: string; text: string }
  | { t: "trig"; id: string; v: boolean }
  | { t: "turn" }
  | { t: "seed"; v: string }
  | { t: "wear"; slot: string; item: string | null }
  | { t: "dmg"; item: string; d: number }
  | { t: "enc"; id: string | null; foe?: Record<string, number>; outcome?: string; momentum?: number; foeName?: string; max?: Record<string, number>; armor?: Record<string, number> }
  | { t: "swing"; d: number }
  | { t: "foe"; stat: string; d?: number; set?: number }
  | { t: "round" }
  | { t: "codex"; id: string }
  | { t: "feat"; id: string }
  | { t: "perk"; id: string }
  | { t: "learn"; id: string }
  | { t: "charge"; key: string; day: number; enc?: string }
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
  | { t: "dg_boon_offer"; offer: BoonOffer | null }
  | { t: "dg_boon"; id: string }
  | { t: "dg_log"; text: string }
  | { t: "dg_told" }
  | { t: "dg_exit"; outcome?: "left" | "lost" }
  | { t: "dt_start"; session: DateSession }
  | { t: "dt_patch"; patch: Partial<DateSession> }
  | { t: "dt_end" }
  | { t: "dt_pref"; who: string; key: string; v: number }
  | { t: "dt_seen"; who: string; topic: string; reaction: Reaction }
  | { t: "dt_recent"; who: string; key: string; at: number; count: number; fatigue: number }
  | { t: "dt_partner"; who: string; on: boolean }
  | { t: "dt_dated"; who: string; enjoy: number }
  | { t: "body"; part: string; trait: string; v: string | null }
  | { t: "tf"; id: string; stage: number }
  | { t: "bond"; a: string; b: string; d: number }
  | { t: "news"; text: string }
  | { t: "conceive"; carrier: string; with: string }
  | { t: "preg_stage"; n: number }
  | { t: "birth"; id: string; kin: Kin }
  | { t: "kin_join"; id: string }
  | { t: "due"; id: string; due?: number; owed?: number; missed?: number }
  | { t: "job"; job: GameState["job"] }
  | { t: "seen"; who: string; what: string; where: string; heard?: boolean }
  | { t: "explored"; loc: string; found: boolean }
  | { t: "discovered"; id: string }
  | { t: "practice"; id: string; d: number }
  | { t: "practice_use"; key: string; n: number; turn: number; minutes: number }
  | { t: "scene"; who: string; here: boolean }
  | { t: "use"; id: string; n: number }
  | { t: "save"; slot: string; label: string }
  | { t: "load"; slot: string }
  | { t: "restart" }
  | { t: "end"; id: string; told: boolean }
  | { t: "end_told" }
  | { t: "unend" }
  | { t: "end_rearm"; id: string }
);

const DG_LOG_KEPT = 12;

const NEWS_KEPT = 30;

/** Memories kept per person (the oldest fade first). */
const MEMORIES_KEPT = 12;

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
    learned: {},
    charges: {},
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
    dating: { prefs: {}, known: {}, partners: {}, dates: {}, recent: {} },
    saves: {},
    runs: 1,
    loops: 0,
    ended: null,
    dismissedEndings: [],
    body: structuredClone(r.body.parts),
    tf: {},
    bonds: structuredClone(r.bonds),
    pregnancy: null,
    kin: {},
    dues: {},
    job: null,
    seen: {},
    explored: {},
    discovered: [],
    practice: {},
    practiceUse: {},
    scene: {},
    lastLocation: null,
    uses: {},
    pconds: {},
    quests: {},
    memories: {},
  };
  // Obligations: the first payment is due `first` days in; its amount is read now.
  for (const o of Object.values(r.obligations)) {
    const owed = typeof o.amount === "number" ? o.amount : evalNumber(o.amount, makeEnv(r, s), 0);
    s.dues[o.id] = { due: r.clock.start + o.first * 1440, owed: Math.max(0, owed), missed: 0 };
  }
  for (const id of r.statOrder) s.stats[id] = r.stats[id].start;
  // Starts that read other stats (`start: full` against a max formula, a start formula), and any stat with a max
  // formula, are worked out now that the plain starts are in — and clamped to the max they evaluate to.
  for (const id of r.statOrder) {
    const def = r.stats[id];
    if (!def.maxExpr && def.startExpr === undefined) continue;
    const v = def.startExpr !== undefined ? evalNumber(def.startExpr, makeEnv(r, s), def.start) : def.start;
    s.stats[id] = Math.min(statMax(r, def, s), Math.max(def.min, Number.isFinite(v) ? v : def.start));
  }
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

/** Who the current encounter's opponent is. */
export function foeName(r: Ruleset, s: GameState): string {
  if (!s.encounter) return "Opponent";
  return s.encounter.foeName ?? r.encounters[s.encounter.id]?.foe.name ?? "Opponent";
}

export function statMax(r: Ruleset, def: StatDef, s: GameState): number {
  if (!def.maxExpr) return def.max;
  const m = evalNumber(def.maxExpr, makeEnv(r, s), def.max);
  return Math.max(def.min + 1, m);
}

/**
 * A number a rulebook may write as a formula (gear and status `armor:`/`bonus:`, `per_hour:`), worked out now.
 * "+6%" is a share of `max` (when given). Anything that can't be read counts as 0.
 */
export function amountValue(v: number | string | undefined, env: ExprEnv, max?: number): number {
  if (v === undefined) return 0;
  if (typeof v === "number") return v;
  const pm = /^\s*([+-]?)\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(v);
  if (pm) return max === undefined ? 0 : ((pm[1] === "-" ? -1 : 1) * Number(pm[2]) / 100) * max;
  const n = evalNumber(v, env, 0);
  return Number.isFinite(n) ? n : 0;
}

/** One place a stat bonus comes from right now: carried gear (worn, for clothing), a perk (or its edge that holds), a condition. */
export interface BonusSource { from: string; kind: "gear" | "perk" | "cond"; id: string; bonus: Record<string, number> }

// Bonus formulas may read eff()/gear() themselves; past this depth they count as 0 (no endless loops).
let bonusDepth = 0;

/** Every bonus in force on {{user}}'s stats, with formulas worked out. Checks, `eff()` and `gear()` all read this. */
export function bonusSources(r: Ruleset, s: GameState, env?: ExprEnv): BonusSource[] {
  if (bonusDepth > 2) return [];
  bonusDepth++;
  try {
    const e = env ?? makeEnv(r, s);
    const nums = (m: Record<string, number | string>) => {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(m)) { const n = amountValue(v, e); if (n) out[k] = n; }
      return out;
    };
    const out: BonusSource[] = [];
    const worn = new Set(Object.values(s.worn));
    for (const [id, n] of Object.entries(s.items)) {
      const it = r.items[id];
      if (!it || n <= 0 || (it.slot && !worn.has(id)) || !Object.keys(it.bonus).length) continue;
      out.push({ from: it.name, kind: "gear", id, bonus: nums(it.bonus) });
    }
    for (const id of Object.keys(s.perks)) {
      const p = r.perks[id];
      if (!p) continue;
      if (Object.keys(p.bonus).length) out.push({ from: `★ ${p.name}`, kind: "perk", id, bonus: nums(p.bonus) });
      for (const ed of p.edges) {
        if (ed.when && !evalBool(ed.when, e, false)) continue;
        out.push({ from: `★ ${p.name}`, kind: "perk", id, bonus: nums(ed.stats) });
      }
    }
    for (const id of Object.keys(s.conditions)) {
      const c = r.conditions[id];
      if (c && Object.keys(c.bonus).length) out.push({ from: c.label, kind: "cond", id, bonus: nums(c.bonus) });
    }
    return out;
  } finally { bonusDepth--; }
}

/** A stat plus everything that helps or hinders it right now (`eff('str')`); `gearOnly` counts carried and worn gear alone (`gear('atk')`). */
export function effectiveStat(r: Ruleset, s: GameState, stat: string, env: ExprEnv, gearOnly = false): number {
  let n = 0;
  for (const src of bonusSources(r, s, env)) if (!gearOnly || src.kind === "gear") n += src.bonus[stat] ?? 0;
  if (gearOnly) return n;
  const base = s.stats[stat] ?? r.stats[stat]?.start ?? 0;
  return base + n;
}

/** Current integrity of a piece of clothing (by item id, or by the slot it's worn in); 0 when not held. */
export function integrityOf(r: Ruleset, s: GameState, idOrSlot: string): number {
  const id = r.items[idOrSlot] ? idOrSlot : s.worn[idOrSlot] ?? "";
  const def = r.items[id];
  if (!def || (s.items[id] ?? 0) <= 0) return 0;
  return s.integrity[id] ?? def.integrity;
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
        if (s.uses[e.id] !== undefined) { const u = { ...s.uses }; delete u[e.id]; s.uses = u; }
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
      if (!e.id && s.encounter) {
        s.lastEncounter = { id: s.encounter.id, ...(s.encounter.foeName ? { foeName: s.encounter.foeName } : {}), outcome: e.outcome ?? "ended", at: s.minutes, loc: s.location };
        // Statuses that only last rounds end with the fight.
        for (const [id, c] of Object.entries(s.conditions)) if (c.rounds !== undefined && c.until === null) delete s.conditions[id];
      }
      s.encounter = e.id ? { id: e.id, round: 0, foe: { ...(e.foe ?? {}) }, ...(e.momentum !== undefined ? { momentum: e.momentum } : {}), ...(e.foeName ? { foeName: e.foeName } : {}), at: s.minutes, ...(e.max ? { max: { ...e.max } } : {}), ...(e.armor ? { armor: { ...e.armor } } : {}) } : null;
      break;
    case "swing":
      if (s.encounter && s.encounter.momentum !== undefined) s.encounter.momentum = clamp(s.encounter.momentum + e.d, -100, 100);
      break;
    case "foe": {
      if (!s.encounter) break;
      const def = r.encounters[s.encounter.id]?.foe.stats.find((x) => x.id === e.stat);
      const cur = s.encounter.foe[e.stat] ?? def?.start ?? 0;
      const next = e.set !== undefined ? e.set : cur + (e.d ?? 0);
      s.encounter.foe[e.stat] = def ? clamp(next, 0, s.encounter.max?.[e.stat] ?? def.max) : next;
      break;
    }
    case "round": if (s.encounter) s.encounter.round += 1; break;
    case "codex": s.codex[e.id] = true; break;
    case "feat": s.feats[e.id] = true; break;
    case "perk": s.perks[e.id] = true; break;
    case "learn": (s.learned ??= {})[e.id] = true; break;
    case "charge": {
      const charges = (s.charges ??= {});
      const c = charges[e.key];
      const today = c && c.day === e.day ? c.n : 0;
      const here = c && e.enc && c.enc === e.enc ? c.encN : 0;
      charges[e.key] = { day: e.day, n: today + 1, ...(e.enc ? { enc: e.enc } : {}), encN: e.enc ? here + 1 : 0 };
      break;
    }
    case "calib": s.calibrated[e.who] = true; break;
    case "forget":
      if (s.scene[e.who]) { const sc = { ...s.scene }; delete sc[e.who]; s.scene = sc; }
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
      if (e.to !== s.location) s.lastLocation = s.location;
      s.location = e.to;
      s.locationName = r.locations[e.to]?.name ?? e.name ?? e.to;
      break;
    case "practice": s.practice = { ...s.practice, [e.id]: Math.max(0, (s.practice[e.id] ?? 0) + e.d) }; break;
    case "practice_use": {
      if (!Number.isFinite(e.n) || !Number.isFinite(e.turn) || !Number.isFinite(e.minutes)) break;
      // Keep this history small. Event order, not wall-clock time, controls eviction.
      const uses = { ...(s.practiceUse ?? {}) };
      delete uses[e.key];
      uses[e.key] = { n: clamp(Math.floor(e.n), 1, 100), turn: e.turn, minutes: e.minutes };
      const keys = Object.keys(uses);
      for (const key of keys.slice(0, Math.max(0, keys.length - 64))) delete uses[key];
      s.practiceUse = uses;
      break;
    }
    case "scene": s.scene = { ...s.scene, [e.who]: { here: e.here, loc: s.location, at: s.minutes } }; break;
    case "use": {
      const per = r.items[e.id]?.uses ?? 0;
      let have = s.items[e.id] ?? 0;
      if (per <= 0 || have <= 0 || e.n <= 0) break;
      let left = (s.uses[e.id] ?? per) - e.n;
      while (left <= 0 && have > 0) { have -= 1; left += per; }
      const uses = { ...s.uses };
      if (have <= 0) {
        delete s.items[e.id];
        for (const [slot, id] of Object.entries(s.worn)) if (id === e.id) delete s.worn[slot];
        delete uses[e.id];
      } else {
        s.items[e.id] = have;
        if (left >= per) delete uses[e.id]; else uses[e.id] = left;
      }
      s.uses = uses;
      break;
    }
    case "time": s.minutes += Math.max(0, e.min); break;
    case "cond":
      if (e.on) s.conditions[e.id] = { until: e.until ?? null, ...(e.rounds !== undefined ? { rounds: e.rounds } : {}) };
      else delete s.conditions[e.id];
      break;
    case "fcond": {
      if (!s.encounter) break;
      const conds = { ...(s.encounter.conds ?? {}) };
      if (e.on) conds[e.id] = e.rounds ?? null; else delete conds[e.id];
      s.encounter.conds = conds;
      break;
    }
    case "cleft":
      if (e.side === "player") {
        const c = s.conditions[e.id];
        if (!c) break;
        if (e.rounds <= 0) delete s.conditions[e.id];
        else s.conditions[e.id] = { ...c, rounds: e.rounds };
      } else if (s.encounter?.conds && e.id in s.encounter.conds) {
        const conds = { ...s.encounter.conds };
        if (e.rounds <= 0) delete conds[e.id]; else conds[e.id] = e.rounds;
        s.encounter.conds = conds;
      }
      break;
    case "pcond": {
      const all = { ...(s.pconds ?? {}) };
      const mine = { ...(all[e.who] ?? {}) };
      if (e.on) mine[e.id] = { until: e.until ?? null }; else delete mine[e.id];
      if (Object.keys(mine).length) all[e.who] = mine; else delete all[e.who];
      s.pconds = all;
      break;
    }
    case "quest": {
      const all = { ...(s.quests ?? {}) };
      const cur = all[e.id];
      if (e.st === null) delete all[e.id];
      else if (e.st === "active" && (!cur || cur.st === "done" || cur.st === "failed")) {
        all[e.id] = { st: "active", at: s.minutes, due: e.due ?? null, prog: {}, ...(e.story ? { story: e.story } : {}) };
      } else if (cur) {
        all[e.id] = { ...cur, st: e.st, ...(e.due !== undefined ? { due: e.due } : {}), ...(e.st === "done" || e.st === "failed" ? { ended: s.minutes } : {}) };
      }
      s.quests = all;
      break;
    }
    case "qprog": {
      const q = s.quests?.[e.id];
      if (!q) break;
      s.quests = { ...s.quests, [e.id]: { ...q, prog: { ...q.prog, [e.goal]: Math.max(0, (q.prog[e.goal] ?? 0) + e.d) } } };
      break;
    }
    case "memory": {
      const list = [...(s.memories?.[e.who] ?? []), { text: e.text, at: s.minutes }].slice(-MEMORIES_KEPT);
      s.memories = { ...(s.memories ?? {}), [e.who]: list };
      break;
    }
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
    case "dt_recent":
      s.dating.recent = { ...(s.dating.recent ?? {}), [e.who]: rememberSocial(s.dating.recent?.[e.who], e.key, e.at, e.count, e.fatigue, r.dating?.memory) };
      break;
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
    case "conceive": if (!s.pregnancy) s.pregnancy = { carrier: e.carrier, with: e.with, since: s.minutes, told: 0 }; break;
    case "preg_stage": if (s.pregnancy) s.pregnancy = { ...s.pregnancy, told: Math.max(s.pregnancy.told, e.n) }; break;
    case "birth": s.pregnancy = null; s.kin = { ...s.kin, [e.id]: structuredClone(e.kin) }; break;
    case "kin_join": {
      const k = s.kin[e.id];
      if (!k || k.joined) break;
      s.kin = { ...s.kin, [e.id]: { ...k, joined: true } };
      s.people[e.id] = { name: k.name };
      if (!s.rel[e.id]) { s.rel[e.id] = {}; for (const rs of r.relStatOrder) s.rel[e.id][rs] = r.relStats[rs].start; }
      break;
    }
    case "due": {
      const cur = s.dues[e.id] ?? { due: 0, owed: 0, missed: 0 };
      s.dues = { ...s.dues, [e.id]: { due: e.due ?? cur.due, owed: Math.max(0, e.owed ?? cur.owed), missed: e.missed ?? cur.missed } };
      break;
    }
    case "seen":
      if (!e.heard || !s.seen[e.who]) s.seen = { ...s.seen, [e.who]: { what: e.what, at: s.minutes, where: e.where, ...(e.heard ? { heard: true } : {}) } };
      break;
    case "explored": s.explored = { ...s.explored, [e.loc]: e.found ? 0 : (s.explored[e.loc] ?? 0) + 1 }; break;
    case "discovered": if (!s.discovered.includes(e.id)) s.discovered = [...s.discovered, e.id]; break;
    case "job": s.job = e.job ? structuredClone(e.job) : null; break;
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
    case "unend":
      if (s.ended) s.dismissedEndings = [...new Set([...(s.dismissedEndings ?? []), s.ended.id])];
      s.ended = null;
      break;
    case "end_rearm": s.dismissedEndings = (s.dismissedEndings ?? []).filter((id) => id !== e.id); break;
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
  // Saves made before a newer part of the state existed: fill it in fresh.
  const fresh = initialState(r) as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(fresh)) if ((next as unknown as Record<string, unknown>)[k] === undefined) (next as unknown as Record<string, unknown>)[k] = v;
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
    case "dg_boon_offer": d.boonOffer = e.offer ? { level: e.offer.level, options: [...e.offer.options] } : null; break;
    case "dg_boon": d.boons = [...(d.boons ?? []), e.id]; d.boonOffer = null; break;
    case "dg_log":
      d.log = [...d.log, e.text].slice(-DG_LOG_KEPT);
      d.untold = [...(d.untold ?? []), e.text].slice(-DG_LOG_KEPT);
      break;
    case "dg_told": d.untold = []; break;
  }
}

/** The in-game day number (uses per day reset with it). */
export function dayOf(s: GameState): number { return Math.floor(s.minutes / 1440); }

/** Tells this encounter from the next one with the same id. */
export function encounterKey(s: GameState): string | undefined {
  return s.encounter ? `${s.encounter.id}@${s.encounter.at ?? 0}` : undefined;
}

/** Uses so far today, and in this encounter. */
export function usesOf(s: GameState, key: string): { today: number; here: number } {
  const c = s.charges?.[key];
  const enc = encounterKey(s);
  return { today: c && c.day === dayOf(s) ? c.n : 0, here: c && enc && c.enc === enc ? c.encN : 0 };
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
  "in_encounter", "encounter", "encounter_round", "round", "momentum", "target", "in_dungeon", "dungeon_depth",
  "in_date", "on_outing", "loops", "runs", "pregnant", "pregnancy_weeks", "at_work",
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
      // Which encounter is on ('' = none), and its round (also plain `round`).
      encounter: s.encounter?.id ?? "",
      encounter_round: s.encounter?.round ?? 0,
      momentum: s.encounter?.momentum ?? 0,
      in_dungeon: !!s.dungeon,
      dungeon_depth: s.dungeon?.depth ?? 0,
      in_date: !!s.date,
      loops: s.loops,
      runs: s.runs,
      at_work: !!s.job,
      pregnant: !!s.pregnancy && s.pregnancy.carrier === "player",
      pregnancy_weeks: s.pregnancy ? Math.floor((s.minutes - s.pregnancy.since) / 1440 / 7) : 0,
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
        // A stat with gear, perks and statuses counted (as checks see it), gear alone, and a piece of clothing's integrity.
        case "eff": return effectiveStat(r, s, a0, base);
        case "gear": return effectiveStat(r, s, a0, base, true);
        case "integrity": return integrityOf(r, s, a0);
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
        // Family: a child's age in years, and how many children there are.
        case "age": return s.kin[a0] ? kinAge(r, s, a0) : r.people[a0]?.age ?? 0;
        case "children": return Object.keys(s.kin).length;
        // Obligations: what's owed, payments missed, whole days until the next is due (negative = overdue).
        case "owed": return s.dues[a0]?.owed ?? 0;
        // Being seen: whether someone saw (or heard about) {{user}} exposed, and how many have.
        case "seen_by": return !!s.seen[a0] && !s.seen[a0].heard;
        case "fame": return Object.keys(s.seen).length;
        case "missed": return s.dues[a0]?.missed ?? 0;
        case "days_until": return s.dues[a0] ? Math.floor((s.dues[a0].due - s.minutes) / 1440) : 0;
        case "dates": return s.dating.dates[a0]?.count ?? 0;
        // Quests: '' (not taken), 'active', 'ready' (to hand in), 'done' or 'failed'; goal counts; how many are done.
        case "quest": return s.quests?.[a0]?.st ?? "";
        case "quest_active": return s.quests?.[a0]?.st === "active" || s.quests?.[a0]?.st === "ready";
        case "quest_done": return s.quests?.[a0]?.st === "done";
        case "quest_failed": return s.quests?.[a0]?.st === "failed";
        case "goal": return s.quests?.[a0]?.prog[String(args[1] ?? "")] ?? 0;
        case "quests_done": return Object.entries(s.quests ?? {}).filter(([id, q]) => q.st === "done" && (!args.length || r.quests[id]?.kind === a0)).length;
        // What people remember, and the conditions other people (or the opponent) are under.
        case "memories": return s.memories?.[a0]?.length ?? 0;
        case "cond_of": return !!s.pconds?.[a0]?.[String(args[1] ?? "")];
        case "foe_cond": return !!s.encounter?.conds && a0 in s.encounter.conds;
        // A stat's current maximum (for "25% of max" by hand), and the opponent's.
        case "stat_max": return r.stats[a0] ? statMax(r, r.stats[a0], s) : 0;
        case "foe_max": return foeMaxOf(r, s, a0);
        // in_encounter('hollow_king'): that encounter is on (in_encounter() with no id: any).
        case "in_encounter": return args.length ? s.encounter?.id === a0 : !!s.encounter;
      }
      return undefined;
    },
  };
  return base;
}

/** A foe stat's current maximum: worked out when the encounter started (formula max), else the rulebook's number; 0 when not in it. */
export function foeMaxOf(r: Ruleset, s: GameState, stat: string): number {
  if (!s.encounter) return 0;
  return s.encounter.max?.[stat] ?? r.encounters[s.encounter.id]?.foe.stats.find((x) => x.id === stat)?.max ?? 0;
}

// ───────────────────────── presentation helpers ─────────────────────────

export function bandFor(def: StatDef, value: number, max?: number): Band | null {
  let hit: Band | null = null;
  // Percentage bands compare against the current maximum (HP that grows with level).
  const top = max ?? def.max;
  const v = def.pctBands ? (top > def.min ? ((value - def.min) / (top - def.min)) * 100 : 0) : value;
  for (const b of def.bands) if (v >= b.at) hit = b;
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

/** An amount of money with the ruleset's sign before ("$18") or after ("18d") it. */
export function formatMoney(r: Ruleset, n: number): string {
  return r.hud.currencyAfter ? `${formatNumber(n)}${r.hud.currency}` : `${r.hud.currency}${formatNumber(n)}`;
}

export function itemName(r: Ruleset, s: GameState, id: string): string {
  return r.items[id]?.name ?? s.itemNames[id] ?? id.replace(/[_-]+/g, " ");
}

export function personName(r: Ruleset, s: GameState, id: string): string {
  return s.people[id]?.name ?? r.people[id]?.name ?? id;
}
