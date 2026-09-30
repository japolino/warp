// Dungeon runs: entering, moving tile to tile, fights, events, the shop, going
// down and getting out. Every action returns plain events, so runs fold, swipe and
// undo like the rest of the game. Quiet steps cost no reply; story moments ask
// the narrator to write them up (`narrate`).

import { seededRng, type Rng } from "../dice.js";
import { evalBool, evalNumber, type ExprEnv, type Value } from "../expr.js";
import { buildTurn, type TurnBuilder } from "../resolve.js";
import type { Ruleset } from "../ruleset.js";
import { formatNumber, itemName, makeEnv, personName, type GameState, type WarpEvent } from "../state.js";
import { presentPeople } from "../world.js";
import { autoCommand, command, startBattle, type Command } from "./battle.js";
import { CLASS_IDS, CLASSES, PARTY_SPRITES, SHOP } from "./content.js";
import { adjacent, generateFloor, key, parseKey, tileAt, type Floor } from "./floor.js";
import type { BattleState, ClassId, DgChoice, DgEventDef, DgOutcome, DungeonDef, DungeonRun, Fighter, MonsterDef, PartyMember, Stats } from "./types.js";

export const PLAYER = "you";
export const DUNGEON_ACTION = "dungeon";

export interface DungeonResult {
  events: WarpEvent[];
  error?: string;
  /** Ask the narrator to write this moment up; `say` is the player's line. */
  narrate?: { say: string };
}

const fail = (error: string): DungeonResult => ({ events: [], error });

// ───────────────────────── numbers ─────────────────────────

export const levelOf = (xp: number) => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 12));
const levelScale = (level: number) => 1 + 0.12 * (level - 1);
/** Monsters grow ~12% per floor past the start of their band. */
const depthScale = (depth: number, from: number) => 1 + 0.12 * Math.max(0, depth - from);
const tierFor = (depth: number) => Math.min(4, 1 + Math.floor((depth - 1) / 3));

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function dungeonOf(r: Ruleset, run: DungeonRun): DungeonDef | null {
  return r.dungeons[run.id] ?? null;
}

export function floorOf(r: Ruleset, run: DungeonRun): Floor | null {
  const d = dungeonOf(r, run);
  return d ? generateFloor(d, run.seed, run.depth) : null;
}

/** Formulas in dungeon content can use depth, bag('potion') and rel_bond(person). */
function dgEnv(t: { r: Ruleset; s: GameState }, run: DungeonRun | null, extra: Record<string, Value> = {}): ExprEnv {
  const base = makeEnv(t.r, t.s, { depth: run?.depth ?? 1, ...extra });
  return {
    lookup: base.lookup,
    call(name, args) {
      if (name === "bag") return run?.bag[String(args[0])] ?? 0;
      if (name === "rel_bond") return bondOf(t.r, t.s, String(args[0] ?? ""));
      return base.call?.(name, args);
    },
  };
}

/** How warm someone is toward the player: the average of their "higher is better" relationship stats. */
export function bondOf(r: Ruleset, s: GameState, who: string): number {
  const stats = r.relStatOrder.map((id) => r.relStats[id]).filter((d) => d.good === "high");
  if (!stats.length) return 0;
  return stats.reduce((n, d) => n + (s.rel[who]?.[d.id] ?? d.start), 0) / stats.length;
}

export function classFor(d: DungeonDef, who: string): ClassId {
  if (who === PLAYER) return d.player.class;
  return d.party.classes[who] ?? CLASS_IDS.filter((c) => c !== "adventurer")[hash(who) % 4];
}

/** A party member's full battle stats right now (max values scale with the run's level). */
export function memberFighter(r: Ruleset, s: GameState, d: DungeonDef, run: DungeonRun, m: PartyMember): Fighter {
  const cls = classFor(d, m.id);
  const base = CLASSES[cls];
  const env = makeEnv(r, s);
  const scale = levelScale(levelOf(run.xp));
  const stat = (k: keyof Stats) => {
    const f = m.id === PLAYER ? d.player[k] : undefined;
    const v = f !== undefined ? evalNumber(f, env, base[k]) : base[k];
    return Math.max(k === "hp" ? 1 : 0, Math.round(v * scale));
  };
  const mhp = stat("hp"), mmp = stat("mp");
  const name = m.id === PLAYER ? "{{user}}" : personName(r, s, m.id);
  return {
    id: m.id, side: "party", name,
    sprite: m.id === PLAYER && d.player.sprite ? d.player.sprite : PARTY_SPRITES[cls][hash(m.id === PLAYER ? "player" : name) % PARTY_SPRITES[cls].length],
    hp: Math.min(m.hp, mhp), mhp, mp: Math.min(m.mp, mmp), mmp, tp: m.tp,
    atk: stat("atk"), def: stat("def"), mat: stat("mat"), mdf: stat("mdf"), agi: stat("agi"),
    skills: base.skills, guard: false,
  };
}

function fullVitals(r: Ruleset, s: GameState, d: DungeonDef, run: DungeonRun, id: string): PartyMember {
  const f = memberFighter(r, s, d, run, { id, hp: 1e9, mp: 1e9, tp: 0 });
  return { id, hp: f.mhp, mp: f.mmp, tp: 0 };
}

// ───────────────────────── availability ─────────────────────────

export function dungeonsHere(r: Ruleset, s: GameState): DungeonDef[] {
  if (s.dungeon || s.encounter) return [];
  const env = makeEnv(r, s);
  return Object.values(r.dungeons).filter((d) => (!d.at.length || d.at.includes(s.location ?? "")) && (!d.when || evalBool(d.when, env, true)));
}

/** People who can come along: tracked, adults or not (romance scenes check age), and passing the dungeon's `party.when`. */
export function eligibleCompanions(r: Ruleset, s: GameState, d: DungeonDef): { id: string; name: string; present: boolean; cls: ClassId }[] {
  const here = new Set(presentPeople(r, s, makeEnv(r, s)));
  return Object.keys(s.people)
    .filter((id) => !s.forgotten[id])
    .filter((id) => !d.party.when || evalBool(d.party.when, makeEnv(r, s, { target: id }), true))
    .map((id) => ({ id, name: personName(r, s, id), present: here.has(id), cls: classFor(d, id) }));
}

const isAdult = (r: Ruleset, id: string) => (r.people[id]?.age ?? 18) >= 18;

// ───────────────────────── helpers ─────────────────────────

function log(t: TurnBuilder, text: string) { t.push({ t: "dg_log", text, src: "action" }); }

function party(t: TurnBuilder, members: PartyMember[]) { t.push({ t: "dg_party", party: members, src: "action" }); }

/** Heal or hurt everyone by a percent of their max HP (and optionally MP). */
function changeVitals(t: TurnBuilder, d: DungeonDef, run: DungeonRun, opts: { heal?: number; hurt?: number; mana?: number; only?: string[] }) {
  const next = run.party.map((m) => {
    if (opts.only && !opts.only.includes(m.id)) return m;
    const f = memberFighter(t.r, t.s, d, run, m);
    let hp = m.hp;
    if (opts.heal) hp = Math.min(f.mhp, hp + Math.ceil((f.mhp * opts.heal) / 100));
    if (opts.hurt) hp = Math.max(m.id === PLAYER ? 1 : 0, hp - Math.ceil((f.mhp * opts.hurt) / 100));
    const mp = opts.mana ? Math.min(f.mmp, m.mp + Math.ceil((f.mmp * opts.mana) / 100)) : m.mp;
    return { ...m, hp, mp };
  });
  party(t, next);
}

/** Queue a narrated moment: what happened since the narrator last heard, then this. */
function tell(t: TurnBuilder, d: DungeonDef, run: DungeonRun, moment: string) {
  const recent = (t.s.dungeon?.untold ?? []).slice(-6);
  const where = `${d.name}, floor ${run.depth}`;
  t.announce(`Dungeon (${where})${recent.length ? ` — since last time: ${recent.join(" ")}` : ""} Now: ${moment}`);
  t.push({ t: "dg_told", src: "action" });
}

function weighted<T>(items: T[], weight: (x: T) => number, rng: Rng): T | null {
  const total = items.reduce((n, x) => n + Math.max(0, weight(x)), 0);
  if (total <= 0) return null;
  let x = rng() * total;
  for (const it of items) { x -= Math.max(0, weight(it)); if (x <= 0) return it; }
  return items[items.length - 1] ?? null;
}

// ───────────────────────── monsters ─────────────────────────

function foeFrom(mon: MonsterDef, id: string, depth: number, from: number, extra: { elite?: boolean; boss?: boolean; scale?: number } = {}): Fighter {
  const k = depthScale(depth, from) * (extra.scale ?? 1);
  const hpk = extra.elite ? 1.8 : 1;
  const hp = Math.round(mon.hp * k * hpk);
  return {
    id, side: "foe",
    name: extra.elite ? `Elite ${mon.name}` : mon.name,
    sprite: mon.sprite,
    hp, mhp: hp, mp: 0, mmp: 0, tp: 0,
    atk: Math.round(mon.atk * k * (extra.elite ? 1.15 : 1)), def: Math.round(mon.def * k),
    mat: Math.round(mon.mat * k), mdf: Math.round(mon.mdf * k), agi: Math.round(mon.agi * (1 + 0.03 * Math.max(0, depth - from))),
    skills: mon.skills, guard: false,
    xp: Math.round(mon.xp * k * (extra.elite ? 2.2 : extra.boss ? 1 : 1)), gold: Math.round(mon.gold * k * (extra.elite ? 2 : 1)),
    ...(extra.elite ? { elite: true } : {}), ...(extra.boss ? { boss: true } : {}),
  };
}

function nameDupes(foes: Fighter[]): Fighter[] {
  const counts = new Map<string, number>();
  for (const f of foes) counts.set(f.name, (counts.get(f.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  return foes.map((f) => {
    if ((counts.get(f.name) ?? 0) < 2) return f;
    const n = (seen.get(f.name) ?? 0) + 1;
    seen.set(f.name, n);
    return { ...f, name: `${f.name} ${String.fromCharCode(64 + n)}` };
  });
}

/** The monsters waiting on a tile — the same every time for the same run, floor and tile. */
export function rollFoes(d: DungeonDef, run: DungeonRun, at: string, kind: BattleState["kind"], pick?: string): Fighter[] {
  const rng = seededRng(`${run.seed}:foes:${run.depth}:${at}:${kind}`);
  const depth = run.depth;
  const monsters = Object.values(d.monsters).filter((m) => m.tier <= 4 && m.id !== "mimic");
  const inTier = (tier: number) => {
    for (let t = tier; t >= 1; t--) { const list = monsters.filter((m) => m.tier === t); if (list.length) return list; }
    return monsters.length ? monsters : [];
  };
  const bandStart = (tier: number) => 1 + (tier - 1) * 3;
  const one = (tier: number) => { const list = inTier(tier); return list[Math.floor(rng() * list.length)]; };

  if (pick && d.monsters[pick]) return [foeFrom(d.monsters[pick], `${pick}#1`, depth, bandStart(d.monsters[pick].tier))];
  if (kind === "mimic") return [foeFrom(d.monsters.mimic ?? monsters[0], "mimic#1", depth, 1)];
  if (kind === "boss") {
    const n = Math.max(1, Math.floor(depth / Math.max(1, d.bossEvery)));
    const id = d.bosses[Math.min(n, d.bosses.length) - 1];
    const extra = n > d.bosses.length ? 1 + 0.35 * (n - d.bosses.length) : 1;
    const boss = foeFrom(d.monsters[id], `${id}#1`, depth, depth, { boss: true, scale: extra });
    return [boss];
  }
  const tier = tierFor(depth);
  if (kind === "elite") {
    const t = Math.min(4, tier + 1);
    const mon = one(t);
    const out = [foeFrom(mon, `${mon.id}#e`, depth, bandStart(t) + 1, { elite: true })];
    if (rng() < 0.5) { const m2 = one(tier); out.push(foeFrom(m2, `${m2.id}#1`, depth, bandStart(tier))); }
    return nameDupes(out);
  }
  const count = 1 + (rng() < 0.55 ? 1 : 0) + (depth >= 3 && rng() < 0.35 ? 1 : 0);
  const out: Fighter[] = [];
  for (let i = 0; i < count; i++) {
    const mon = rng() < 0.2 && tier > 1 ? one(tier - 1) : one(tier);
    if (mon) out.push(foeFrom(mon, `${mon.id}#${i + 1}`, depth, bandStart(mon.tier)));
  }
  return nameDupes(out);
}

function beginBattle(t: TurnBuilder, d: DungeonDef, run: DungeonRun, at: string, kind: BattleState["kind"], pick?: string) {
  const foes = rollFoes(d, run, at, kind, pick);
  const members = run.party.map((m) => memberFighter(t.r, t.s, d, run, m));
  const b = startBattle(kind, at, members, foes, `${run.seed}:${run.depth}:${at}`);
  t.push({ t: "dg_battle", battle: b, src: "action" });
  log(t, kind === "boss" ? `${foes[0].name} blocks the way down!` : `Ambushed by ${foes.map((f) => f.name).join(", ")}.`);
}

// ───────────────────────── entering ─────────────────────────

export function enterDungeon(r: Ruleset, s: GameState, id: string, companions: string[], seed: string): DungeonResult {
  const d = r.dungeons[id];
  if (!d) return fail("There's no such dungeon.");
  if (s.dungeon) return fail("You're already in a dungeon.");
  if (!dungeonsHere(r, s).some((x) => x.id === id)) return fail(`${d.name} can't be entered from here.`);
  const allowed = new Set(eligibleCompanions(r, s, d).map((c) => c.id));
  const chosen = [...new Set(companions)].filter((c) => allowed.has(c)).slice(0, d.party.max);
  const events = buildTurn(r, s, seed, (t) => {
    const floor = generateFloor(d, seed, 1);
    const run: DungeonRun = {
      id, seed, depth: 1, pos: floor.start, seen: [key(...floor.start)], cleared: [key(...floor.start)],
      party: [], xp: 0, gold: 0, bag: { potion: 2, ether: 0, bomb: 0 }, loot: {}, battle: null, pending: null, log: [], untold: [],
    };
    run.party = [PLAYER, ...chosen].map((m) => fullVitals(t.r, t.s, d, run, m));
    t.push({ t: "dg_enter", run, src: "action" });
    t.time(10, "action");
    const withWho = chosen.length ? ` with ${chosen.map((c) => personName(r, s, c)).join(" and ")}` : " alone";
    tell(t, d, run, `{{user}} goes down into ${d.name}${withWho}.${d.desc ? ` ${d.desc}` : ""}`);
  });
  return { events, narrate: { say: `*I head down into ${d.name}.*` } };
}

// ───────────────────────── moving ─────────────────────────

export function moveTo(r: Ruleset, s: GameState, x: number, y: number): DungeonResult {
  const run = s.dungeon;
  const d = run && dungeonOf(r, run);
  if (!run || !d) return fail("You're not in a dungeon.");
  if (run.battle) return fail("Finish the fight first.");
  if (run.pending) return fail("Decide what to do here first.");
  const floor = generateFloor(d, run.seed, run.depth);
  const kind = tileAt(floor, x, y);
  if (!kind) return fail("That's outside the floor.");
  if (!adjacent(run.pos, [x, y])) return fail("You can only move to a neighbouring tile.");
  const k = key(x, y);
  let narrate: DungeonResult["narrate"];
  const events = buildTurn(r, s, `${run.seed}:${run.depth}:${k}`, (t) => {
    t.push({ t: "dg_step", x, y, src: "action" });
    t.time(5, "action");
    if (run.cleared.includes(k) || kind === "stairs" || kind === "shop" && run.seen.includes(k)) return;
    narrate = resolveTile(t, d, t.s.dungeon!, floor, k, kind);
  });
  return { events, ...(narrate ? { narrate } : {}) };
}

function resolveTile(t: TurnBuilder, d: DungeonDef, run: DungeonRun, floor: Floor, k: string, kind: string): DungeonResult["narrate"] {
  const rng = seededRng(`${run.seed}:tile:${run.depth}:${k}`);
  const clear = () => t.push({ t: "dg_clear", key: k, src: "action" });
  switch (kind) {
    case "start": case "empty":
      clear();
      return undefined;
    case "enemy": case "elite": case "boss":
      beginBattle(t, d, run, k, kind);
      return undefined;
    case "treasure":
      treasure(t, d, run, rng, 1);
      clear();
      return undefined;
    case "trap": {
      const agi = Math.max(...run.party.filter((m) => m.hp > 0).map((m) => memberFighter(t.r, t.s, d, run, m).agi));
      const chance = Math.min(0.9, Math.max(0.1, 0.35 + agi * 0.02));
      if (rng() < chance) log(t, "A trap clicks underfoot — the party spots it in time.");
      else {
        const pct = 8 + Math.floor(rng() * 8);
        changeVitals(t, d, run, { hurt: pct });
        log(t, `A trap springs! Darts pepper the party (−${pct}% HP).`);
      }
      clear();
      return undefined;
    }
    case "rest":
      changeVitals(t, d, run, { heal: 35, mana: 35 });
      t.time(30, "action");
      log(t, "A quiet spring. The party rests and recovers.");
      clear();
      return undefined;
    case "shop":
      log(t, "A travelling merchant has set up shop here.");
      return undefined;
    case "event": {
      const ev = pickEvent(t, d, run, Object.values(d.events), rng);
      clear();
      if (!ev) return undefined;
      t.push({ t: "dg_pending", pending: { kind: "event", id: ev.id, at: k }, src: "action" });
      log(t, fillText(ev.text, t, null));
      return undefined;
    }
    case "romance": {
      const mates = run.party.filter((m) => m.id !== PLAYER && m.hp > 0 && isAdult(t.r, m.id));
      clear();
      if (!mates.length) {
        changeVitals(t, d, run, { heal: 10 });
        log(t, "A peaceful grotto. {{user}} takes a moment to breathe.");
        return undefined;
      }
      const who = mates[Math.floor(rng() * mates.length)].id;
      const ev = pickEvent(t, d, run, Object.values(d.romance), rng);
      if (!ev) return undefined;
      t.push({ t: "dg_pending", pending: { kind: "romance", id: ev.id, at: k, target: who }, src: "action" });
      log(t, fillText(ev.text, t, who));
      return undefined;
    }
    case "surprise": {
      const roll = weighted(["treasure", "mimic", "event", "trap", "rest"], (x) => ({ treasure: 30, mimic: 20, event: 25, trap: 10, rest: 15 })[x]!, rng)!;
      log(t, "Something unexpected…");
      if (roll === "treasure") { treasure(t, d, run, rng, 2); clear(); return undefined; }
      if (roll === "mimic") { log(t, "The chest has teeth! A mimic!"); beginBattle(t, d, run, k, "mimic"); return undefined; }
      return resolveTile(t, d, run, floor, k, roll);
    }
  }
  return undefined;
}

function pickEvent(t: TurnBuilder, d: DungeonDef, run: DungeonRun, list: DgEventDef[], rng: Rng): DgEventDef | null {
  return weighted(list.filter((e) => e.minDepth <= run.depth), (e) => e.weight, rng);
}

function treasure(t: TurnBuilder, d: DungeonDef, run: DungeonRun, rng: Rng, mult: number) {
  const gold = Math.round((8 + rng() * 10) * (1 + 0.3 * (run.depth - 1)) * mult);
  const found: string[] = [`${gold} gold`];
  t.push({ t: "dg_gold", d: gold, src: "action" });
  const roll = rng();
  if (roll < 0.3) { t.push({ t: "dg_bag", item: "potion", d: 1, src: "action" }); found.push("a potion"); }
  else if (roll < 0.45) { t.push({ t: "dg_bag", item: "ether", d: 1, src: "action" }); found.push("an ether"); }
  else if (roll < 0.55) { t.push({ t: "dg_bag", item: "bomb", d: 1, src: "action" }); found.push("a bomb"); }
  const loot = d.loot.filter((l) => l.minDepth <= run.depth);
  if (loot.length && rng() < 0.2 * mult) {
    const l = weighted(loot, (x) => x.weight, rng);
    if (l) { t.push({ t: "dg_loot", item: l.item, d: 1, src: "action" }); found.push(itemName(t.r, t.s, l.item)); }
  }
  log(t, `A chest! Inside: ${found.join(", ")}.`);
}

function fillText(text: string, t: { r: Ruleset; s: GameState }, who: string | null): string {
  return who ? text.replace(/\{target\}/g, personName(t.r, t.s, who)) : text;
}

// ───────────────────────── events & romance ─────────────────────────

export function choicesFor(r: Ruleset, s: GameState): { ev: DgEventDef; choices: (DgChoice & { ok: boolean })[]; target?: string } | null {
  const run = s.dungeon;
  const d = run && dungeonOf(r, run);
  if (!run?.pending || !d) return null;
  const ev = (run.pending.kind === "romance" ? d.romance : d.events)[run.pending.id];
  if (!ev) return null;
  const env = dgEnv({ r, s }, run, { target: run.pending.target ?? "" });
  const choices = ev.choices
    .filter((c) => !c.when || evalBool(c.when, env, true))
    .map((c) => ({ ...c, ok: !c.cost || run.gold >= c.cost }));
  return { ev, choices, ...(run.pending.target ? { target: run.pending.target } : {}) };
}

export function chooseEvent(r: Ruleset, s: GameState, choiceId: string): DungeonResult {
  const run = s.dungeon;
  const d = run && dungeonOf(r, run);
  const open = choicesFor(r, s);
  if (!run || !d || !open) return fail("There's nothing to decide here.");
  const c = open.choices.find((x) => x.id === choiceId);
  if (!c) return fail("That option isn't available.");
  if (!c.ok) return fail(`You need ${c.cost} gold for that.`);
  const who = open.target ?? null;
  let label = fillText(c.label, { r, s }, who);
  const events = buildTurn(r, s, `${run.seed}:${run.depth}:choice:${run.pending!.at}`, (t) => {
    const rng = seededRng(`${run.seed}:choice:${run.depth}:${run.pending!.at}:${c.id}`);
    const env = dgEnv(t, run, { target: who ?? "" });
    const chance = c.chance === undefined ? 100 : evalNumber(c.chance, env, 50);
    const ok = rng() * 100 < chance;
    const o = ok || !c.fail ? c.success : c.fail;
    t.push({ t: "dg_pending", pending: null, src: "action" });
    applyOutcome(t, d, run, o, who, run.pending!.at);
    const text = fillText(`${fillText(open.ev.text, t, who)} {{user}} chose: ${label}.${o.text ? ` ${o.text}` : ""}`, t, who);
    log(t, fillText(`${label}${c.chance !== undefined ? (ok ? " — it works." : " — it goes wrong.") : "."}${o.text ? ` ${o.text}` : ""}`, t, who));
    tell(t, d, t.s.dungeon ?? run, text);
  });
  label = label.replace(/\{\{user\}\}/g, "I");
  return { events, narrate: { say: `*${label}*` } };
}

function applyOutcome(t: TurnBuilder, d: DungeonDef, run: DungeonRun, o: DgOutcome, who: string | null, at: string) {
  const live = () => t.s.dungeon ?? run;
  if (o.heal || o.hurt || o.mana) changeVitals(t, d, live(), { heal: o.heal, hurt: o.hurt, mana: o.mana });
  const env = dgEnv(t, live(), { target: who ?? "" });
  if (o.gold !== undefined) {
    const g = Math.round(evalNumber(o.gold, env, 0));
    if (g) t.push({ t: "dg_gold", d: g, src: "action" });
  }
  if (o.xp !== undefined) {
    const x = Math.round(evalNumber(o.xp, env, 0));
    if (x) t.push({ t: "dg_xp", d: x, src: "action" });
  }
  for (const [item, n] of Object.entries(o.bag ?? {})) if (n) t.push({ t: "dg_bag", item, d: n, src: "action" });
  if (who && (o.bond || o.desire)) {
    for (const rs of t.r.relStatOrder) {
      const def = t.r.relStats[rs];
      const span = (def.max - def.min) / 100;
      if (o.bond && def.good === "high") t.push({ t: "rel", who, stat: rs, d: Math.round(o.bond * span * 10) / 10, src: "action" });
      if (o.desire && /lust|attract|desire|arous|passion/i.test(`${rs} ${def.label}`)) t.push({ t: "rel", who, stat: rs, d: Math.round(o.desire * span * 10) / 10, src: "action" });
    }
  }
  t.apply(o.effect, "action", who ? { target: who } : {});
  if (o.fight) {
    const kind = o.fight === "elite" ? "elite" : "event";
    beginBattle(t, d, live(), `${at}:fight`, kind, o.fight !== "enemy" && o.fight !== "elite" ? o.fight : undefined);
  }
}

// ───────────────────────── battles ─────────────────────────

export type DungeonCommand = Command | { auto: "turn" | "round" | "battle" };

export function battleCommand(r: Ruleset, s: GameState, cmd: DungeonCommand): DungeonResult {
  const run = s.dungeon;
  const d = run && dungeonOf(r, run);
  if (!run || !d || !run.battle) return fail("There's no fight going on.");
  let b = run.battle;
  const bag = { ...run.bag };
  const seed = `${run.seed}:${run.depth}:${b.at}`;
  const startRound = b.round;
  const used: string[] = [];
  for (let n = 0; n < 60 && !b.over && b.active; n++) {
    const c: Command = "auto" in cmd ? autoCommand(b, bag) : cmd;
    if ("item" in c) {
      if ((bag[c.item] ?? 0) < 1) return fail(`You have no ${SHOP[c.item]?.name.toLowerCase() ?? c.item}s left.`);
    }
    const res = command(b, c, seed, { depth: run.depth });
    if (res.error) return fail(res.error);
    b = res.b;
    if (res.used) { bag[res.used] = (bag[res.used] ?? 0) - 1; used.push(res.used); }
    if (!("auto" in cmd) || cmd.auto === "turn") break;
    if (cmd.auto === "round" && b.round > startRound) break;
  }
  let narrate: DungeonResult["narrate"];
  const events = buildTurn(r, s, `${seed}:cmd:${b.round}:${b.log.length}`, (t) => {
    for (const item of used) t.push({ t: "dg_bag", item, d: -1, src: "action" });
    t.push({ t: "dg_battle", battle: b, src: "action" });
    if (b.over) narrate = finishBattle(t, d, t.s.dungeon!, b);
  });
  return { events, ...(narrate ? { narrate } : {}) };
}

function finishBattle(t: TurnBuilder, d: DungeonDef, run: DungeonRun, b: BattleState): DungeonResult["narrate"] {
  const foes = b.fighters.filter((f) => f.side === "foe");
  const names = foes.map((f) => f.name).join(", ");
  const partyAfter: PartyMember[] = run.party.map((m) => {
    const f = b.fighters.find((x) => x.id === m.id);
    return f ? { id: m.id, hp: f.hp, mp: f.mp, tp: f.tp } : m;
  });
  t.push({ t: "dg_battle", battle: null, src: "action" });
  t.time(5, "action");
  const highlight = d.narrate === "all" || b.kind === "elite" || b.kind === "boss" || b.kind === "mimic";
  const beats = b.log.slice(-6).join(" ");

  if (b.over === "lost") return defeat(t, d, run, names);

  if (b.over === "fled") {
    party(t, partyAfter);
    log(t, `The party fled from ${names}.`);
    if (highlight) { tell(t, d, t.s.dungeon!, `The party fled from ${names}. ${beats}`); return { say: "*We run for it!*" }; }
    return undefined;
  }

  // Won: the fallen get back up with a sliver of health; the spoils are shared.
  party(t, partyAfter.map((m) => (m.hp <= 0 ? { ...m, hp: 1 } : m)));
  const xp = foes.reduce((n, f) => n + (f.xp ?? 0), 0);
  const gold = foes.reduce((n, f) => n + (f.gold ?? 0), 0);
  const before = levelOf(run.xp);
  if (xp) t.push({ t: "dg_xp", d: xp, src: "action" });
  if (gold) t.push({ t: "dg_gold", d: gold, src: "action" });
  if (!b.at.endsWith(":fight")) t.push({ t: "dg_clear", key: b.at, src: "action" });
  const after = levelOf(run.xp + xp);
  log(t, `Defeated ${names}. +${xp} XP, +${gold} gold.${after > before ? ` The party reaches level ${after}!` : ""}`);
  if (b.kind === "boss") log(t, "The way down is open.");
  if (highlight) {
    tell(t, d, t.s.dungeon!, `The party defeated ${names}${b.kind === "boss" ? " — the guardian of this floor" : ""}. How it went: ${beats}`);
    return { say: b.kind === "boss" ? "*It's over. The way down is clear.*" : "*We catch our breath after the fight.*" };
  }
  return undefined;
}

function defeat(t: TurnBuilder, d: DungeonDef, run: DungeonRun, by: string): DungeonResult["narrate"] {
  const lostGold = run.gold;
  const lostLoot = Object.keys(run.loot).length;
  tell(t, d, run, `The party is overwhelmed by ${by} on floor ${run.depth}. Everything found on this run is lost${lostGold ? ` (${lostGold} gold${lostLoot ? " and the treasures" : ""})` : ""}. {{user}} comes to later, back outside the dungeon, battered.`);
  t.push({ t: "dg_exit", src: "action" });
  t.apply(d.onDefeat, "action");
  t.time(120, "action");
  return { say: "*Everything goes dark…*" };
}

// ───────────────────────── going down, getting out ─────────────────────────

export function descend(r: Ruleset, s: GameState): DungeonResult {
  const run = s.dungeon;
  const d = run && dungeonOf(r, run);
  if (!run || !d) return fail("You're not in a dungeon.");
  if (run.battle || run.pending) return fail("Deal with what's here first.");
  const floor = generateFloor(d, run.seed, run.depth);
  const here = key(...run.pos);
  if (here !== key(...floor.stairs)) return fail("The way down isn't here.");
  if (floor.boss && !run.cleared.includes(here)) return fail("The guardian still blocks the way.");
  if (d.floors && run.depth >= d.floors) return fail("This is as deep as it goes.");
  const next = generateFloor(d, run.seed, run.depth + 1);
  let narrate: DungeonResult["narrate"];
  const events = buildTurn(r, s, `${run.seed}:down:${run.depth}`, (t) => {
    t.push({ t: "dg_down", pos: next.start, src: "action" });
    t.push({ t: "dg_clear", key: key(...next.start), src: "action" });
    // A breather on the stairs.
    changeVitals(t, d, t.s.dungeon!, { heal: 20, mana: 20 });
    t.time(10, "action");
    log(t, `The party descends to floor ${run.depth + 1}.${next.boss ? " Something powerful waits on this floor." : ""}`);
    if (d.narrate === "all" || next.boss) {
      tell(t, d, t.s.dungeon!, `The party descends to floor ${run.depth + 1}.${next.boss ? " A powerful presence waits somewhere on this floor." : ""}`);
      narrate = { say: "*We head down the stairs.*" };
    }
  });
  return { events, ...(narrate ? { narrate } : {}) };
}

export function leaveDungeon(r: Ruleset, s: GameState): DungeonResult {
  const run = s.dungeon;
  const d = run && dungeonOf(r, run);
  if (!run || !d) return fail("You're not in a dungeon.");
  const events = buildTurn(r, s, `${run.seed}:leave:${run.depth}`, (t) => {
    const money = d.currency ?? r.hud.money;
    const found: string[] = [];
    if (run.gold && money && r.stats[money]) { t.push({ t: "stat", id: money, d: run.gold, src: "action" }); found.push(`${formatNumber(run.gold)} gold`); }
    for (const [item, n] of Object.entries(run.loot)) { t.push({ t: "item", id: item, d: n, src: "action" }); found.push(itemName(r, s, item)); }
    tell(t, d, run, `{{user}}'s party climbs back out of ${d.name} from floor ${run.depth}${found.length ? `, carrying ${found.join(", ")}` : ", empty-handed"}.`);
    t.push({ t: "dg_exit", src: "action" });
    t.apply(d.onLeave, "action");
    t.time(Math.min(120, 10 * run.depth), "action");
  });
  return { events, narrate: { say: "*We make our way back out of the dungeon.*" } };
}

// ───────────────────────── items & the shop ─────────────────────────

export function useItem(r: Ruleset, s: GameState, item: string, target: string): DungeonResult {
  const run = s.dungeon;
  const d = run && dungeonOf(r, run);
  if (!run || !d) return fail("You're not in a dungeon.");
  if (run.battle) return battleCommand(r, s, { item: item as "potion" | "ether" | "bomb", target });
  if (item !== "potion" && item !== "ether") return fail("That can only be used in a fight.");
  if ((run.bag[item] ?? 0) < 1) return fail(`You have no ${item}s left.`);
  const m = run.party.find((p) => p.id === target);
  if (!m) return fail("They're not in the party.");
  const events = buildTurn(r, s, `${run.seed}:use:${run.depth}:${run.log.length}`, (t) => {
    t.push({ t: "dg_bag", item, d: -1, src: "action" });
    const f = memberFighter(r, s, d, run, m);
    const next = run.party.map((p) => (p.id !== target ? p : item === "potion" ? { ...p, hp: Math.min(f.mhp, Math.max(p.hp, 0) + Math.ceil(f.mhp / 2)) } : { ...p, mp: Math.min(f.mmp, p.mp + Math.ceil(f.mmp / 2)) }));
    party(t, next);
    log(t, `${f.name} drinks ${item === "potion" ? "a potion" : "an ether"}.`);
  });
  return { events };
}

export function shopBuy(r: Ruleset, s: GameState, item: string): DungeonResult {
  const run = s.dungeon;
  const d = run && dungeonOf(r, run);
  if (!run || !d) return fail("You're not in a dungeon.");
  const floor = generateFloor(d, run.seed, run.depth);
  if (tileAt(floor, ...run.pos) !== "shop") return fail("There's no merchant here.");
  const ware = SHOP[item];
  if (!ware) return fail("The merchant doesn't sell that.");
  const price = ware.price(run.depth);
  if (run.gold < price) return fail(`That costs ${price} gold.`);
  const events = buildTurn(r, s, `${run.seed}:buy:${run.depth}:${run.log.length}`, (t) => {
    t.push({ t: "dg_gold", d: -price, src: "action" });
    t.push({ t: "dg_bag", item, d: 1, src: "action" });
    log(t, `Bought a ${ware.name.toLowerCase()} for ${price} gold.`);
  });
  return { events };
}

export { parseKey };
