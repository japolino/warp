// `dungeons:` in a ruleset. A bare entry (`dungeons: { mines: { name: The Old Mines } }`)
// plays with the built-in bestiary, events and romance scenes; everything is overridable.

import { Ctx, isObj, list, normEffect, titleCase, type Raw } from "../ruleset.js";
import { BESTIARY, BUILTIN_EVENTS, BUILTIN_ROMANCE, CLASS_IDS, DEFAULT_BOSSES, SKILLS } from "./content.js";
import {
  DEALT_KINDS, THEMES,
  type ClassId, type DealtKind, type DgChoice, type DgEventDef, type DgOutcome, type DungeonDef, type MonsterDef, type Stats, type Theme,
} from "./types.js";

export const DEFAULT_TILES: Record<DealtKind, number> = {
  empty: 7, enemy: 6, elite: 1, treasure: 2.5, trap: 1.5, rest: 1, shop: 0.6, event: 2, surprise: 1.5, romance: 1.2,
};

const OUTCOME_KEYS = new Set(["text", "heal", "hurt", "mana", "gold", "xp", "bag", "fight", "bond", "desire"]);
const CHOICE_KEYS = new Set(["label", "chance", "when", "cost", "fail", "success"]);
const STAT_KEYS: (keyof Stats)[] = ["hp", "mp", "atk", "def", "mat", "mdf", "agi"];

type Known = { stats: Set<string> };

function normOutcome(raw: unknown, where: string, c: Ctx, known: Known): DgOutcome {
  const r: Raw = isObj(raw) ? raw : typeof raw === "string" ? { text: raw } : {};
  const o: DgOutcome = { effect: normEffect(Object.fromEntries(Object.entries(r).filter(([k]) => !OUTCOME_KEYS.has(k))), where, c, known) };
  if (typeof r.text === "string") o.text = r.text;
  for (const k of ["heal", "hurt", "mana", "bond", "desire", "xp"] as const) {
    if (r[k] !== undefined) {
      const x = k === "xp" ? c.expr(r[k], `${where} › ${k}`) : c.num(r[k], `${where} › ${k}`, 0);
      if (x !== undefined) (o as unknown as Record<string, unknown>)[k] = x;
    }
  }
  if (r.gold !== undefined) { const x = c.expr(r.gold, `${where} › gold`); if (x !== undefined) o.gold = x; }
  if (isObj(r.bag)) o.bag = Object.fromEntries(Object.entries(r.bag).map(([k, v]) => [k, c.num(v, `${where} › bag › ${k}`, 1)]));
  if (typeof r.fight === "string") o.fight = r.fight;
  return o;
}

function normEvents(raw: unknown, where: string, c: Ctx, known: Known): Record<string, DgEventDef> {
  const out: Record<string, DgEventDef> = {};
  for (const [id, e] of Object.entries(isObj(raw) ? raw : {})) {
    const w = `${where} › ${id}`;
    if (!isObj(e) || typeof e.text !== "string") { c.warn(w, "needs `text:` and `choices:`"); continue; }
    const choices: DgChoice[] = [];
    for (const [cid, chRaw] of Object.entries(isObj(e.choices) ? e.choices : {})) {
      const cw = `${w} › ${cid}`;
      const r: Raw = isObj(chRaw) ? chRaw : typeof chRaw === "string" ? { label: chRaw } : {};
      const successRaw = r.success ?? Object.fromEntries(Object.entries(r).filter(([k]) => !CHOICE_KEYS.has(k)));
      const chance = r.chance !== undefined ? c.expr(r.chance, `${cw} › chance`) : undefined;
      const when = r.when !== undefined ? c.expr(r.when, `${cw} › when`) : undefined;
      choices.push({
        id: cid,
        label: typeof r.label === "string" ? r.label : titleCase(cid),
        success: normOutcome(successRaw, `${cw} › success`, c, known),
        ...(r.fail !== undefined ? { fail: normOutcome(r.fail, `${cw} › fail`, c, known) } : {}),
        ...(chance !== undefined ? { chance } : {}),
        ...(when !== undefined ? { when: String(when) } : {}),
        ...(r.cost !== undefined ? { cost: c.num(r.cost, `${cw} › cost`, 0) } : {}),
      });
    }
    if (!choices.length) { c.warn(w, "needs at least one choice"); continue; }
    out[id] = { id, text: e.text, choices, minDepth: c.num(e.min_depth, `${w} › min_depth`, 1), weight: Math.max(0, c.num(e.weight, `${w} › weight`, 1)) };
  }
  return out;
}

function normMonsters(raw: unknown, where: string, c: Ctx): Record<string, MonsterDef> {
  const out: Record<string, MonsterDef> = {};
  for (const [id, mRaw] of Object.entries(isObj(raw) ? raw : {})) {
    const w = `${where} › ${id}`;
    if (!isObj(mRaw)) { c.warn(w, "expected a monster definition"); continue; }
    const base = BESTIARY[typeof mRaw.like === "string" ? mRaw.like : id];
    const tier = Math.max(1, Math.min(5, Math.round(c.num(mRaw.tier, `${w} › tier`, base?.tier ?? 1))));
    const stat = (k: keyof Stats, d: number) => Math.max(k === "hp" ? 1 : 0, c.num(mRaw[k], `${w} › ${k}`, base?.[k] ?? d));
    const skills = list(mRaw.skills).filter((s) => {
      if (SKILLS[s]) return true;
      c.warn(`${w} › skills`, `"${s}" isn't a skill (${Object.keys(SKILLS).join(", ")})`);
      return false;
    });
    out[id] = {
      id,
      name: typeof mRaw.name === "string" ? mRaw.name : base?.name ?? titleCase(id),
      sprite: typeof mRaw.sprite === "string" ? mRaw.sprite : base?.sprite ?? "skull",
      tier,
      hp: stat("hp", 30 * tier), mp: 0, atk: stat("atk", 8 * tier), def: stat("def", 4 * tier),
      mat: stat("mat", 4 * tier), mdf: stat("mdf", 4 * tier), agi: stat("agi", 10),
      skills: skills.length ? skills : base?.skills ?? ["attack"],
      xp: c.num(mRaw.xp, `${w} › xp`, base?.xp ?? 8 * tier),
      gold: c.num(mRaw.gold, `${w} › gold`, base?.gold ?? 5 * tier),
    };
  }
  return out;
}

export function normDungeons(raw: unknown, c: Ctx, known: Known): Record<string, DungeonDef> {
  const out: Record<string, DungeonDef> = {};
  if (raw === undefined) return out;
  if (!isObj(raw)) { c.warn("Dungeons", "should be a map of dungeon names to definitions"); return out; }
  for (const [id, dRaw] of Object.entries(raw)) {
    const w = `Dungeons › ${id}`;
    const r: Raw = isObj(dRaw) ? dRaw : typeof dRaw === "string" ? { name: dRaw } : {};
    const theme: Theme = THEMES.includes(r.theme) ? r.theme : "cave";
    if (r.theme !== undefined && !THEMES.includes(r.theme)) c.warn(`${w} › theme`, `use one of ${THEMES.join(", ")}`);

    const tiles = { ...DEFAULT_TILES };
    if (isObj(r.tiles)) for (const [k, v] of Object.entries(r.tiles)) {
      if ((DEALT_KINDS as readonly string[]).includes(k)) tiles[k as DealtKind] = Math.max(0, c.num(v, `${w} › tiles › ${k}`, tiles[k as DealtKind]));
      else c.warn(`${w} › tiles › ${k}`, `tile kinds are ${DEALT_KINDS.join(", ")} (start, stairs and boss are placed for you)`);
    }

    // Monsters: the built-in bestiary (optionally narrowed with `bestiary:`) plus the dungeon's own.
    const custom = normMonsters(r.monsters, `${w} › monsters`, c);
    const allowed = Array.isArray(r.bestiary) ? list(r.bestiary) : null;
    for (const b of allowed ?? []) if (!BESTIARY[b]) c.warn(`${w} › bestiary`, `"${b}" isn't a built-in monster`);
    const monsters: Record<string, MonsterDef> = {};
    for (const mon of Object.values(BESTIARY)) if (!allowed || allowed.includes(mon.id) || mon.tier === 5 || mon.id === "mimic") monsters[mon.id] = mon;
    Object.assign(monsters, custom);
    const bosses = Array.isArray(r.bosses) ? list(r.bosses).filter((b) => {
      if (monsters[b]) return true;
      c.warn(`${w} › bosses`, `"${b}" isn't a monster here`);
      return false;
    }) : DEFAULT_BOSSES;

    const events = { ...(r.builtin_events === false ? {} : BUILTIN_EVENTS), ...normEvents(r.events, `${w} › events`, c, known) };
    const romance = { ...(r.builtin_romance === false ? {} : BUILTIN_ROMANCE), ...normEvents(r.romance, `${w} › romance`, c, known) };

    const loot: DungeonDef["loot"] = [];
    if (isObj(r.loot)) for (const [item, v] of Object.entries(r.loot)) {
      const lr: Raw = isObj(v) ? v : { weight: v };
      loot.push({ item, weight: Math.max(0, c.num(lr.weight, `${w} › loot › ${item}`, 1)), minDepth: c.num(lr.min_depth, `${w} › loot › ${item} › min_depth`, 1) });
    }

    const partyRaw: Raw = isObj(r.party) ? r.party : {};
    const classes: Record<string, ClassId> = {};
    for (const [who, cls] of Object.entries(isObj(partyRaw.classes) ? partyRaw.classes : {})) {
      if (CLASS_IDS.includes(cls as ClassId)) classes[who] = cls as ClassId;
      else c.warn(`${w} › party › classes › ${who}`, `classes are ${CLASS_IDS.join(", ")}`);
    }
    const partyWhen = partyRaw.when !== undefined ? c.expr(partyRaw.when, `${w} › party › when`) : undefined;

    const playerRaw: Raw = isObj(r.player) ? r.player : {};
    const player: DungeonDef["player"] = { class: CLASS_IDS.includes(playerRaw.class) ? playerRaw.class : "adventurer" };
    for (const k of STAT_KEYS) if (playerRaw[k] !== undefined) {
      const x = c.expr(playerRaw[k], `${w} › player › ${k}`);
      if (x !== undefined) player[k] = x;
    }
    if (typeof playerRaw.sprite === "string") player.sprite = playerRaw.sprite;

    const when = r.when !== undefined ? c.expr(r.when, `${w} › when`) : undefined;
    out[id] = {
      id,
      name: typeof r.name === "string" ? r.name : titleCase(id),
      ...(typeof r.desc === "string" ? { desc: r.desc } : {}),
      at: list(r.at ?? r.entrance),
      ...(when !== undefined ? { when: String(when) } : {}),
      theme,
      size: Math.max(3, Math.min(9, Math.round(c.num(r.size, `${w} › size`, 5)))),
      floors: Math.max(0, Math.round(c.num(r.floors ?? r.depth, `${w} › floors`, 0))),
      bossEvery: Math.max(0, Math.round(c.num(r.boss_every, `${w} › boss_every`, 5))),
      tiles, monsters, bosses: bosses.length ? bosses : DEFAULT_BOSSES, events, romance, loot,
      party: { max: Math.max(0, Math.min(3, Math.round(c.num(partyRaw.max, `${w} › party › max`, 3)))), ...(partyWhen !== undefined ? { when: String(partyWhen) } : {}), classes },
      player,
      ...(typeof r.currency === "string" ? { currency: r.currency } : {}),
      onLeave: normEffect(r.on_leave, `${w} › on_leave`, c, known),
      onDefeat: normEffect(r.on_defeat, `${w} › on_defeat`, c, known),
      narrate: r.narrate === "all" ? "all" : "highlights",
    };
  }
  return out;
}
