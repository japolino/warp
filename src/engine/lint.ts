// Author-facing checks that need the whole ruleset: unknown names in formulas,
// with "did you mean" suggestions, and effects that point at things that don't exist.

import { evaluate, type ExprEnv, type Value } from "./expr.js";
import { emptyEffect, type ActionDef, type Effect, type Issue, type Ruleset } from "./ruleset.js";
import { BUILTIN_NAMES, initialState, makeEnv } from "./state.js";
import { costValue } from "./resolve.js";
import { SKILLS } from "./dungeon/content.js";

export const FUNCTIONS = [
  "has", "count", "flag", "cond", "at", "rel", "met", "between", "roll",
  "wearing", "worn", "trait", "present", "where", "codex", "feat", "perk",
  "eff", "gear", "integrity",
  "secret", "front", "front_stage", "happened", "deepest", "partner", "dates", "stage", "saved", "body", "transformed", "bond", "arc", "age", "children", "owed", "missed", "days_until", "seen_by", "fame",
  "quest", "quest_active", "quest_done", "quest_failed", "goal", "quests_done", "memories", "cond_of", "foe_cond", "stat_max", "foe_max", "in_encounter",
  "min", "max", "clamp", "floor", "ceil", "round", "abs",
];

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function suggest(name: string, pool: string[]): string {
  let best = "";
  let bestD = Infinity;
  for (const p of pool) {
    const d = distance(name.toLowerCase(), p.toLowerCase());
    if (d < bestD) { bestD = d; best = p; }
  }
  return best && bestD <= Math.max(2, Math.floor(name.length / 3)) ? ` — did you mean "${best}"?` : "";
}

function venueCostsWithoutMoney(r: Ruleset): boolean {
  return !r.hud.money && Object.values(r.dating.venues).some((v) => v.cost > 0);
}

/** Conditions something removes (an item's use, an action, a trigger…) and ones added for a set time somewhere. */
function condCures(r: Ruleset): { removed: Set<string>; timed: Set<string> } {
  const removed = new Set<string>(), timed = new Set<string>();
  const visited = new Set<object>();
  const visit = (o: unknown) => {
    if (!o || typeof o !== "object" || visited.has(o)) return;
    visited.add(o);
    if (Array.isArray(o)) { for (const x of o) visit(x); return; }
    const e = o as Partial<Effect>;
    if (Array.isArray(e.removeConditions) && e.addConditions && typeof e.addConditions === "object") {
      for (const k of e.removeConditions) removed.add(k);
      for (const [k, d] of Object.entries(e.addConditions)) if (d !== null) timed.add(k);
    }
    for (const v of Object.values(o)) visit(v);
  };
  visit(r);
  return { removed, timed };
}

export function lintRuleset(r: Ruleset): Issue[] {
  const issues: Issue[] = [];
  const s = initialState(r);
  const names = [...r.statOrder, ...Object.keys(r.flags), ...BUILTIN_NAMES];

  const check = (src: string | number | undefined, where: string, extra: Record<string, Value> = {}, dungeon = false) => {
    if (src === undefined || typeof src === "number") return;
    const base = makeEnv(r, s, extra);
    // Dungeon formulas also know depth, bag('potion') and rel_bond(person).
    const env: ExprEnv = { lookup: base.lookup, call: (n, a) => {
      if (n === "in_encounter" && a.length && !r.encounters[String(a[0])]) badEncounter.add(String(a[0]));
      return n === "roll" ? 1 : dungeon && (n === "bag" || n === "rel_bond") ? 0 : base.call?.(n, a);
    } };
    const badEncounter = new Set<string>();
    const unknown = new Set<string>();
    try { evaluate(src, env, { unknown }); } catch { return; }
    // eff('str') / gear('atk') name a stat; integrity('cloak') an item or a wardrobe slot.
    for (const m of String(src).matchAll(/\b(eff|gear|integrity)\(\s*['"]([^'"]+)['"]/g)) {
      const [, fn, id] = m;
      if (fn === "integrity") {
        if (!r.items[id] && !r.wardrobe.slots.some((x) => x.id === id)) issues.push({ level: "warning", where, message: `integrity('${id}'): "${id}" isn't an item or a wardrobe slot${suggest(id, [...Object.keys(r.items), ...r.wardrobe.slots.map((x) => x.id)])}` });
      } else if (!r.stats[id]) issues.push({ level: "warning", where, message: `${fn}('${id}'): "${id}" isn't a stat${suggest(id, r.statOrder)}` });
    }
    for (const u of unknown) {
      const isCall = u.endsWith("()");
      const msg = isCall
        ? `"${u}" isn't a known function (${FUNCTIONS.join(", ")})`
        : `"${u}" isn't a stat, flag or clock value${suggest(u, [...names, ...Object.keys(extra)])}`;
      issues.push({ level: "warning", where, message: msg });
    }
    for (const id of badEncounter) issues.push({ level: "warning", where, message: `in_encounter('${id}'): "${id}" isn't an encounter${suggest(id, Object.keys(r.encounters))}` });
  };

  const checkEffect = (e: Effect, where: string, extra: Record<string, Value> = {}) => {
    for (const [id, v] of Object.entries(e.stats)) {
      if (!r.stats[id]) issues.push({ level: "warning", where, message: `changes "${id}", which isn't a stat${suggest(id, r.statOrder)}` });
      check(v, `${where} › ${id}`, extra);
    }
    for (const [id, v] of Object.entries(e.set)) {
      if (!r.stats[id]) issues.push({ level: "warning", where, message: `sets "${id}", which isn't a stat${suggest(id, r.statOrder)}` });
      check(v, `${where} › set › ${id}`, extra);
    }
    for (const [who, m] of Object.entries(e.rel)) for (const [stat, v] of Object.entries(m)) {
      if (!r.relStats[stat]) issues.push({ level: "warning", where, message: `"${stat}" isn't a relationship stat${suggest(stat, r.relStatOrder)}` });
      check(v, `${where} › ${who} › ${stat}`, extra);
    }
    for (const id of Object.keys(e.addConditions)) {
      if (!r.conditions[id]) issues.push({ level: "warning", where, message: `adds condition "${id}", which isn't declared under conditions:` });
    }
    for (const d of e.decide) for (const o of d.options) { check(o.when, `${where} › decide › ${d.id} › ${o.id} › when`, extra); checkEffect(o.effect, `${where} › decide › ${d.id} › ${o.id}`, extra); }
    if (e.move && Object.keys(r.locations).length && !r.locations[e.move]) {
      issues.push({ level: "warning", where, message: `moves to "${e.move}", which isn't a declared location${suggest(e.move, Object.keys(r.locations))}` });
    }
    for (const id of e.wear) {
      if (!r.items[id]?.slot) issues.push({ level: "warning", where, message: `wears "${id}", which isn't clothing (an item with a slot)${suggest(id, Object.keys(r.items))}` });
    }
    const slots = r.wardrobe.slots.map((s) => s.id);
    for (const slot of [...e.undress, ...Object.keys(e.damage)]) {
      if (!slots.includes(slot)) issues.push({ level: "warning", where, message: `"${slot}" isn't a wardrobe slot${suggest(slot, slots)}` });
    }
    for (const [slot, v] of Object.entries(e.damage)) check(v, `${where} › damage › ${slot}`, extra);
    for (const [id, v] of Object.entries(e.transform)) {
      if (!r.body.transforms[id]) issues.push({ level: "warning", where, message: `"${id}" isn't a transformation under body › transforms${suggest(id, Object.keys(r.body.transforms))}` });
      check(v, `${where} › transform › ${id}`, extra);
    }
    if (Object.keys(e.body).length && !r.body.enabled) issues.push({ level: "warning", where, message: "changes the body, but the ruleset has no `body:` section" });
    else if (!r.body.open) for (const part of Object.keys(e.body)) {
      if (!r.body.parts[part]) issues.push({ level: "warning", where, message: `"${part}" isn't a body part (body › parts) and the body is closed (open: false)` });
    }
    if (e.conceive && !r.lineage.enabled) issues.push({ level: "warning", where, message: "uses `conceive`, but the ruleset has no `lineage:` section" });
    for (const id of Object.keys(e.arc)) if (!r.companions[id]?.arc) issues.push({ level: "warning", where, message: `"${id}" isn't a companion with an arc` });
    if (e.startEncounter && !r.encounters[e.startEncounter]) {
      issues.push({ level: "warning", where, message: `starts encounter "${e.startEncounter}", which doesn't exist${suggest(e.startEncounter, Object.keys(r.encounters))}` });
    }
    for (const id of e.unlock) {
      if (!r.codex[id]) issues.push({ level: "warning", where, message: `unlocks codex "${id}", which doesn't exist${suggest(id, Object.keys(r.codex))}` });
    }
    for (const [stat, v] of Object.entries(e.foe)) {
      const known = Object.values(r.encounters).some((enc) => enc.foe.stats.some((s) => s.id === stat));
      if (!known) issues.push({ level: "warning", where, message: `changes foe stat "${stat}", which no encounter declares` });
      check(v, `${where} › foe › ${stat}`, extra);
    }
    for (const [id, v] of Object.entries(e.front)) {
      if (!r.fronts[id]) issues.push({ level: "warning", where, message: `moves front "${id}", which doesn't exist${suggest(id, Object.keys(r.fronts))}` });
      check(v, `${where} › front › ${id}`, extra);
    }
    for (const id of e.reveal) {
      if (!r.secrets[id]) issues.push({ level: "warning", where, message: `reveals secret "${id}", which doesn't exist${suggest(id, Object.keys(r.secrets))}` });
    }
    if (e.gauge !== undefined) {
      if (!r.randomEvents.enabled) issues.push({ level: "warning", where, message: "moves the event gauge, but there are no random events" });
      check(e.gauge, `${where} › gauge`, extra);
    }
    const conds = Object.keys(r.conditions);
    for (const [id, spec] of Object.entries(e.inflict)) {
      if (!r.conditions[id]) issues.push({ level: "warning", where, message: `inflicts "${id}", which isn't declared under conditions:${suggest(id, conds)}` });
      check(spec.rounds, `${where} › inflict › ${id}`, extra);
      check(spec.chance, `${where} › inflict › ${id} › chance`, extra);
    }
    for (const [who, m] of Object.entries(e.afflict)) {
      if (who !== "target" && !r.people[who]) issues.push({ level: "warning", where, message: `puts conditions on "${who}", who isn't a person${suggest(who, people)}` });
      for (const id of Object.keys(m)) if (!r.conditions[id]) issues.push({ level: "warning", where, message: `"${id}" isn't declared under conditions:${suggest(id, conds)}` });
    }
    for (const id of e.cleanse) if (!r.conditions[id]) issues.push({ level: "warning", where, message: `cleanses "${id}", which isn't a condition${suggest(id, conds)}` });
    check(e.hits, `${where} › hits`, extra);
    check(e.pierce, `${where} › pierce`, extra);
    for (const id of Object.keys(e.quest)) if (!r.quests[id]) issues.push({ level: "warning", where, message: `"${id}" isn't a quest${suggest(id, r.questOrder)}` });
    for (const [key, v] of Object.entries(e.progress)) {
      const [qid, gid] = key.split(".");
      const q = r.quests[qid];
      if (!q) issues.push({ level: "warning", where, message: `counts toward "${qid}", which isn't a quest${suggest(qid, r.questOrder)}` });
      else if (gid && !q.goals.some((g) => g.id === gid)) issues.push({ level: "warning", where, message: `"${gid}" isn't one of ${q.name}'s goals (${q.goals.map((g) => g.id).join(", ")})` });
      else if (!gid && !q.goals.some((g) => g.count !== undefined && !g.when)) issues.push({ level: "warning", where, message: `"${q.name}" has no counted goal for progress to count toward (give a goal \`count:\`)` });
      check(v, `${where} › progress › ${key}`, extra);
    }
    for (const who of Object.keys(e.remember)) if (who !== "target" && !r.people[who]) issues.push({ level: "warning", where, message: `"${who}" isn't a person to remember it${suggest(who, people)}` });
  };

  const people = Object.keys(r.people);
  const cures = condCures(r);
  for (const id of r.statOrder) check(r.stats[id].maxExpr, `Stats › ${id} › max`);
  for (const id of r.statOrder) check(r.stats[id].startExpr, `Stats › ${id} › start`);

  // Costs are worked out to show and gate the choice; one that can't be computed would break the choice list.
  const checkCost = (a: ActionDef, w: string, extra: Record<string, Value>) => {
    const env = makeEnv(r, s, extra);
    for (const [id, v] of Object.entries(a.cost.stats)) {
      try {
        if (!Number.isFinite(costValue(r, s, id, v, env))) issues.push({ level: "warning", where: `${w} › cost › ${id}`, message: `"${v}" doesn't work out to a number` });
      } catch (e) {
        issues.push({ level: "warning", where: `${w} › cost › ${id}`, message: `"${v}" can't be worked out (${e instanceof Error ? e.message : String(e)}) — use a number, a share of the max like "-15%", or a formula` });
      }
    }
  };

  const checkAction = (a: ActionDef, w: string) => {
    const extra: Record<string, Value> = Object.fromEntries(a.params.map((p) => [p.id, p.options[p.default]]));
    if (a.perPerson) extra.target = Object.keys(r.people)[0] ?? "someone";
    check(a.when, `${w} › when`, extra);
    if (a.check) {
      check(a.check.target, `${w} › check`, extra);
      check(a.check.add, `${w} › check › add`, extra);
      check(a.check.crit, `${w} › check › crit`, extra);
    }
    checkEffect(a.cost, `${w} › cost`, extra);
    checkCost(a, w, extra);
    checkEffect(a.effects, `${w} › effects`, extra);
    for (const [tier, e] of Object.entries(a.outcomes)) if (e) checkEffect(e, `${w} › ${tier}`, extra);
    if (a.gamble) {
      const g = a.gamble;
      if (!(g.stat ?? r.hud.money)) issues.push({ level: "warning", where: `${w} › gamble`, message: "there's no money to stake — add a stat with `kind: money`, or `stat:` on the table" });
      check(g.luck, `${w} › gamble › luck`, extra);
      for (const [k, e] of [["win", g.win], ["lose", g.lose], ["broke", g.broke]] as const) checkEffect(e, `${w} › gamble › ${k}`, extra);
    }
  };
  for (const a of Object.values(r.actions)) checkAction(a, `Actions › ${a.id}`);
  // Spending points through a story action: every click is a player message and a narrator reply.
  // A button that only turns one stat into an attribute or skill is what `allocate:` is for.
  const statsOnly = (e: Effect) => {
    const rest = { ...e, stats: {}, hint: undefined } as Record<string, unknown>;
    return JSON.stringify(rest, (_k, v) => (v === undefined ? undefined : v)) === JSON.stringify(emptyEffect());
  };
  for (const a of Object.values(r.actions)) {
    if (a.check || a.gamble || a.perPerson || Object.keys(a.outcomes).length || !statsOnly(a.effects) || !statsOnly(a.cost)) continue;
    const deltas = { ...a.cost.stats, ...a.effects.stats };
    const n = (v: string | number) => (typeof v === "number" ? v : Number(String(v).replace(/^\+/, "")));
    const ups = Object.entries(deltas).filter(([id, v]) => n(v) > 0 && ["attribute", "skill"].includes(r.stats[id]?.kind ?? ""));
    const downs = Object.entries(deltas).filter(([, v]) => n(v) < 0);
    if (ups.length !== 1 || downs.length !== 1 || Object.keys(deltas).length !== 2) continue;
    const [pool] = downs[0], [target] = ups[0];
    if (r.stats[target]?.allocate) continue;
    issues.push({ level: "warning", where: `Actions › ${a.id}`, message: `only turns ${r.stats[pool]?.label ?? pool} into ${r.stats[target]?.label ?? target}. If this is spending points, each click is a story turn (a player message and a narrator reply) — put allocate: ${pool} on ${target} instead for +/− in the sidebar, with no turn.` });
  }
  // Abilities and item uses are actions too: their formulas and costs get the same checks.
  for (const ab of Object.values(r.abilities)) checkAction(ab.action, `Abilities › ${ab.id}`);
  for (const it of Object.values(r.items)) if (it.use) checkAction(it.use, `Items › ${it.id} › use`);
  const checkRequires = (a: ActionDef, w: string) => {
    for (const q of a.requires) {
      const id = q.id ?? "";
      const miss = (what: string, pool: string[]) => issues.push({ level: "warning", where: `${w} › requires`, message: `"${id}" isn't ${what}${suggest(id, pool)}` });
      if ((q.kind === "with" || q.kind === "rel") && !r.people[id]) miss("a person", people);
      if (q.kind === "has" && !r.items[id] && !r.itemsOpen) miss("an item", Object.keys(r.items));
      if (q.kind === "quest" && !r.quests[id]) miss("a quest", r.questOrder);
      if (q.kind === "flag" && !r.flags[id]) miss("a flag", Object.keys(r.flags));
      if (q.kind === "perk" && !r.perks[id]) miss("a perk", Object.keys(r.perks));
      if (q.kind === "rel" && !r.relStats[q.stat ?? ""]) issues.push({ level: "warning", where: `${w} › requires`, message: `"${q.stat}" isn't a relationship stat${suggest(q.stat ?? "", r.relStatOrder)}` });
    }
  };
  for (const a of Object.values(r.actions)) checkRequires(a, `Actions › ${a.id}`);
  for (const enc of Object.values(r.encounters)) for (const a of Object.values(enc.actions)) checkRequires(a, `Encounters › ${enc.id} › actions › ${a.id}`);
  for (const c of Object.values(r.conditions)) {
    const w = `Conditions › ${c.id}`;
    check(c.dot, `${w} › dot`);
    check(c.skip, `${w} › skip`);
    checkEffect(c.tick, `${w} › tick`);
    if (c.stat && !r.stats[c.stat] && !Object.values(r.encounters).some((e) => e.foe.stats.some((x) => x.id === c.stat))) issues.push({ level: "warning", where: `${w} › stat`, message: `"${c.stat}" isn't a stat or a foe stat${suggest(c.stat, r.statOrder)}` });
    // Only when nothing ends it: no lasts:, never added for a set time, and no item, action or trigger removes it.
    if ((c.every === "hour" || c.every === "both") && c.dot !== undefined && !c.lasts && !cures.removed.has(c.id) && !cures.timed.has(c.id)) issues.push({ level: "warning", where: w, message: "hurts every hour and never wears off on its own — give it `lasts:` (or a cure)" });
    for (const [k, v] of [...Object.entries(c.armor), ...Object.entries(c.bonus)]) {
      if (k !== "_" && !r.stats[k]) issues.push({ level: "warning", where: `${w} › armor`, message: `"${k}" isn't a stat${suggest(k, r.statOrder)}` });
      check(v, `${w} › ${k in c.bonus ? "bonus" : "armor"} › ${k}`);
    }
  }
  for (const it of Object.values(r.items)) for (const [k, v] of Object.entries(it.armor)) {
    if (k !== "_" && !r.stats[k]) issues.push({ level: "warning", where: `Items › ${it.id} › armor`, message: `"${k}" isn't a stat${suggest(k, r.statOrder)}` });
    check(v, `Items › ${it.id} › armor › ${k}`);
  }
  for (const it of Object.values(r.items)) for (const [k, v] of Object.entries(it.bonus)) check(v, `Items › ${it.id} › bonus › ${k}`);
  for (const id of r.statOrder) if (r.stats[id].perHourExpr && !/%\s*$/.test(r.stats[id].perHourExpr!)) check(r.stats[id].perHourExpr, `Stats › ${id} › per_hour`);
  for (const q of Object.values(r.quests)) {
    const w = `Quests › ${q.id}`;
    check(q.when, `${w} › when`);
    check(q.succeed, `${w} › succeed`);
    check(q.fail, `${w} › fail`);
    for (const g of q.goals) check(g.when, `${w} › goals › ${g.id}`);
    checkEffect(q.start, `${w} › start`);
    checkEffect(q.reward, `${w} › reward`);
    checkEffect(q.failure, `${w} › failure`);
    if (!q.auto && !q.giver && !q.board && !q.at.length && !q.hidden) issues.push({ level: "warning", where: w, message: "has no giver, board or place, so nothing offers it — add `giver:`, `board: true`, `at:`, `auto: true` or `hidden: true` (started by an effect)" });
  }
  for (const t of r.triggers) {
    check(t.when, `Triggers › ${t.id} › when`);
    checkEffect(t.effects, `Triggers › ${t.id}`);
  }
  for (const p of Object.values(r.people)) p.schedule.forEach((e, i) => check(e.when, `People › ${p.id} › schedule #${i + 1}`));
  for (const l of Object.values(r.locations)) {
    check(l.when, `Locations › ${l.id} › when`);
    for (const q of l.requires ?? []) check(q.when, `Locations › ${l.id} › requires`);
  }
  for (const c of Object.values(r.codex)) check(c.unlock, `Codex › ${c.id} › unlock`);
  for (const f of Object.values(r.feats)) { check(f.unlock, `Feats › ${f.id} › unlock`); checkEffect(f.reward, `Feats › ${f.id} › reward`); }
  for (const p of Object.values(r.perks)) { check(p.requires, `Perks › ${p.id} › requires`); checkEffect(p.effects, `Perks › ${p.id}`); }
  for (const enc of Object.values(r.encounters)) {
    const w = `Encounters › ${enc.id}`;
    for (const a of Object.values(enc.actions)) checkAction(a, `${w} › actions › ${a.id}`);
    if (enc.foeMoves) for (const o of enc.foeMoves.options) { check(o.when, `${w} › foe_moves › ${o.id} › when`); checkEffect(o.effect, `${w} › foe_moves › ${o.id}`); }
    for (const fs of enc.foe.stats) { check(fs.startExpr, `${w} › foe › ${fs.id}`); check(fs.maxExpr, `${w} › foe › ${fs.id} › max`); }
    for (const [k, v] of Object.entries(enc.foe.armor)) if (typeof v === "string") check(v, `${w} › foe › armor${k === "_" ? "" : ` › ${k}`}`);
    // A move here that wears a stat this foe doesn't have does nothing (a Strike on `hp` against a foe that only has `seals`).
    if (enc.foe.stats.length) {
      const ids = enc.foe.stats.map((x) => x.id);
      const foeWrites = (e: Effect | undefined, at: string) => {
        if (!e) return;
        for (const stat of Object.keys(e.foe)) if (!ids.includes(stat)) issues.push({ level: "warning", where: at, message: `changes foe stat "${stat}", but ${enc.foe.name} only has ${ids.join(", ")} — the change does nothing${suggest(stat, ids)}` });
        for (const d of e.decide) for (const o of d.options) foeWrites(o.effect, `${at} › decide › ${d.id} › ${o.id}`);
      };
      for (const a of Object.values(enc.actions)) {
        const aw = `${w} › actions › ${a.id}`;
        foeWrites(a.cost, `${aw} › cost`);
        foeWrites(a.effects, `${aw} › effects`);
        for (const [tier, e] of Object.entries(a.outcomes)) foeWrites(e, `${aw} › ${tier}`);
      }
      if (enc.foeMoves) for (const o of enc.foeMoves.options) foeWrites(o.effect, `${w} › foe_moves › ${o.id}`);
      foeWrites(enc.start, `${w} › start`);
    }
    for (const e of enc.endWhen) check(e.when, `${w} › end_when › ${e.outcome}`);
    for (const [o, e] of Object.entries(enc.outcomes)) checkEffect(e, `${w} › outcomes › ${o}`);
    checkEffect(enc.start, `${w} › start`);
    if (!enc.endWhen.length && !Object.values(enc.actions).some((a) => [a.effects, ...Object.values(a.outcomes)].some((e) => e?.end))) {
      issues.push({ level: "warning", where: w, message: "has no way to end — add `end_when:` or an action with `end:`" });
    }
  }
  for (const id of r.hud.bars) if (!r.stats[id]) issues.push({ level: "warning", where: "HUD › bars", message: `"${id}" isn't a stat` });

  for (const sec of Object.values(r.secrets)) sec.stages.forEach((st, i) => check(st.when, `Secrets › ${sec.id} › stage ${i + 1} › when`));
  for (const f of Object.values(r.fronts)) {
    const w = `Fronts › ${f.id}`;
    check(f.rate, `${w} › per_day`);
    check(f.perTurn, `${w} › per_turn`);
    check(f.when, `${w} › when`);
    f.stages.forEach((st, i) => {
      checkEffect(st.effects, `${w} › stage ${i + 1}`);
      check(st.if, `${w} › stage ${i + 1} › if`);
      if (st.else) checkEffect(st.else, `${w} › stage ${i + 1} › else`);
    });
    const moved = f.pushes.length > 0 || f.rate !== 0 || f.perTurn !== 0;
    if (!moved) issues.push({ level: "warning", where: w, message: "never moves on its own — give it `per_day:`, `per_turn:` or `story:` pushes (or move it with `front:` effects)" });
  }
  if (r.randomEvents.enabled) {
    check(r.randomEvents.perDay, "Random events › per_day");
    check(r.randomEvents.perTurn, "Random events › per_turn");
    for (const e of Object.values(r.randomEvents.events)) {
      check(e.when, `Random events › ${e.id} › when`);
      checkEffect(e.effects, `Random events › ${e.id}`);
    }
  }
  check(r.liveChoices.when, "Live choices › when");
  for (const d of Object.values(r.dungeons)) {
    const w = `Dungeons › ${d.id}`;
    const dx = { depth: 1, target: Object.keys(r.people)[0] ?? "someone" };
    check(d.when, `${w} › when`);
    for (const q of d.requires ?? []) check(q.when, `${w} › requires`);
    check(d.party.when, `${w} › party › when`, dx);
    for (const [k, v] of Object.entries(d.player)) if (k !== "class" && k !== "sprite") check(v as string | number, `${w} › player › ${k}`);
    for (const loc of d.at) if (Object.keys(r.locations).length && !r.locations[loc]) issues.push({ level: "warning", where: `${w} › at`, message: `"${loc}" isn't a declared location${suggest(loc, Object.keys(r.locations))}` });
    for (const l of d.loot) if (!r.items[l.item] && !r.itemsOpen) issues.push({ level: "warning", where: `${w} › loot`, message: `"${l.item}" isn't a declared item` });
    if (d.currency && !r.stats[d.currency]) issues.push({ level: "warning", where: `${w} › currency`, message: `"${d.currency}" isn't a stat` });
    checkEffect(d.onLeave, `${w} › on_leave`);
    checkEffect(d.onDefeat, `${w} › on_defeat`);
    for (const [kind, list] of [["events", d.events], ["romance", d.romance]] as const) {
      for (const ev of Object.values(list)) for (const c of ev.choices) {
        const cw = `${w} › ${kind} › ${ev.id} › ${c.id}`;
        check(c.chance, `${cw} › chance`, dx, true);
        check(c.when, `${cw} › when`, dx, true);
        for (const o of [c.success, c.fail]) {
          if (!o) continue;
          check(o.gold, `${cw} › gold`, dx, true);
          check(o.xp, `${cw} › xp`, dx, true);
          checkEffect(o.effect, cw, dx);
          if (o.fight && o.fight !== "enemy" && o.fight !== "elite" && !d.monsters[o.fight]) issues.push({ level: "warning", where: cw, message: `fights "${o.fight}", which isn't a monster here` });
        }
      }
    }
    for (const m of Object.values(d.monsters)) for (const sk of m.skills) if (!SKILLS[sk]) issues.push({ level: "warning", where: `${w} › monsters › ${m.id}`, message: `"${sk}" isn't a skill` });
  }
  for (const a of Object.values(r.liveChoices.tags)) checkAction(a, `Live choices › tags › ${a.id}`);
  if (r.checkpoints.loop) {
    check(r.checkpoints.loop.when, "Checkpoints › loop › when");
    checkEffect(r.checkpoints.loop.effects, "Checkpoints › loop › do");
    const to = r.checkpoints.loop.to;
    const n = Number(to);
    if (to !== "start" && to !== "auto" && !(Number.isInteger(n) && n >= 1 && n <= r.checkpoints.slots)) issues.push({ level: "warning", where: "Checkpoints › loop › to", message: `"${to}" should be start, auto or a slot number (1–${r.checkpoints.slots})` });
    if (to === "auto" && !r.checkpoints.auto) issues.push({ level: "warning", where: "Checkpoints › loop › to", message: "rewinds to the autosave, but `auto: day` is off — it will rewind to the start" });
  }
  for (const k of [r.checkpoints.keep, r.legacy]) {
    for (const id of k.stats) if (!r.stats[id]) issues.push({ level: "warning", where: "Checkpoints › keep", message: `"${id}" isn't a stat${suggest(id, r.statOrder)}` });
    for (const id of k.rel) if (!r.relStats[id]) issues.push({ level: "warning", where: "Checkpoints › keep", message: `"${id}" isn't a relationship stat` });
    for (const id of k.flags) if (!r.flags[id]) issues.push({ level: "warning", where: "Checkpoints › keep", message: `"${id}" isn't a declared flag` });
  }
  for (const e of Object.values(r.endings)) check(e.when, `Endings › ${e.id} › when`);
  if (r.discovery.enabled) {
    check(r.discovery.chance, "Discovery › chance");
    for (const loc of r.discovery.at) if (!r.locations[loc]) issues.push({ level: "warning", where: "Discovery › at", message: `"${loc}" isn't a location${suggest(loc, Object.keys(r.locations))}` });
  }
  if (r.observers.enabled) {
    check(r.observers.when, "Observers › when");
    for (const [k, eff] of Object.entries(r.observers.reactions)) if (eff) checkEffect(eff, `Observers › reactions › ${k}`, { target: "someone" });
  }
  for (const o of Object.values(r.obligations)) {
    const w = `Obligations › ${o.id}`;
    check(o.amount, `${w} › amount`);
    if (!r.stats[o.payWith]) issues.push({ level: "warning", where: `${w} › pay_with`, message: `"${o.payWith}" isn't a stat` });
    if (o.creditor && !r.people[o.creditor]) issues.push({ level: "warning", where: `${w} › creditor`, message: `"${o.creditor}" isn't a person${suggest(o.creditor, people)}` });
    for (const loc of o.at) if (!r.locations[loc]) issues.push({ level: "warning", where: `${w} › at`, message: `"${loc}" isn't a location` });
    if (o.late) for (const opt of o.late.options) checkEffect(opt.effect, `${w} › late › ${opt.id}`);
  }
  for (const j of Object.values(r.jobs)) {
    const w = `Jobs › ${j.id}`;
    check(j.when, `${w} › when`);
    check(j.pay, `${w} › pay`);
    check(j.tip, `${w} › tip`);
    if (j.skill && !r.stats[j.skill]) issues.push({ level: "warning", where: `${w} › skill`, message: `"${j.skill}" isn't a stat` });
    for (const loc of j.at) if (!r.locations[loc]) issues.push({ level: "warning", where: `${w} › at`, message: `"${loc}" isn't a location` });
    checkEffect(j.gain, `${w} › gain`);
  }
  r.lineage.stages.forEach((st, i) => checkEffect(st.effects, `Lineage › stage ${i + 1}`));
  for (const part of r.lineage.inherit) if (r.body.enabled && !r.body.parts[part]) issues.push({ level: "warning", where: "Lineage › children › inherit", message: `"${part}" isn't a body part${suggest(part, Object.keys(r.body.parts))}` });
  for (const c of Object.values(r.companions)) {
    const w = `Companions › ${c.id}`;
    if (!r.people[c.id]) issues.push({ level: "warning", where: w, message: `"${c.id}" isn't a person in relationships › people${suggest(c.id, people)}` });
    for (const id of c.jealousOf) if (id !== "anyone" && !r.people[id]) issues.push({ level: "warning", where: `${w} › jealous_of`, message: `"${id}" isn't a person${suggest(id, people)}` });
    for (const id of c.knows) if (!r.secrets[id]) issues.push({ level: "warning", where: `${w} › knows`, message: `"${id}" isn't a secret${suggest(id, Object.keys(r.secrets))}` });
    if (c.daily) for (const o of c.daily.options) checkEffect(o.effect, `${w} › daily › ${o.id}`);
  }
  for (const [a, m] of Object.entries(r.bonds)) for (const b of Object.keys(m)) {
    if (!r.people[b]) issues.push({ level: "warning", where: `Companions › ${a} › bonds`, message: `"${b}" isn't a person${suggest(b, people)}` });
  }
  const slotIds = r.wardrobe.slots.map((s) => s.id);
  for (const [part, slots] of Object.entries(r.body.hiddenBy)) for (const slot of slots) {
    if (!slotIds.includes(slot)) issues.push({ level: "warning", where: `Body › hidden_by › ${part}`, message: `"${slot}" isn't a wardrobe slot${suggest(slot, slotIds)}` });
  }
  for (const t of Object.values(r.body.transforms)) check(t.chance, `Body › transforms › ${t.id} › chance`);
  for (const o of r.mind.overrides) {
    const w = `Mind › overrides › ${o.id}`;
    check(o.when, `${w} › when`, { target: "someone" });
    check(o.chance, `${w} › chance`, { target: "someone" });
    if (o.do !== "fail" && o.do !== "alter" && !r.actions[o.do]) issues.push({ level: "warning", where: `${w} › do`, message: `"${o.do}" isn't fail, alter or an action${suggest(o.do, Object.keys(r.actions))}` });
  }
  r.mind.perception.forEach((p, i) => check(p.when, `Mind › perception #${i + 1} › when`));
  const gates: [string, { when?: string } | undefined][] = [
    ...r.statOrder.map((id) => [`Stats › ${id} › narrator_when`, r.stats[id].gate] as [string, { when?: string } | undefined]),
    ...r.relStatOrder.map((id) => [`Relationships › stats › ${id} › narrator_when`, r.relStats[id].gate] as [string, { when?: string } | undefined]),
    ...Object.values(r.flags).map((f) => [`Flags › ${f.id} › narrator_when`, f.gate] as [string, { when?: string } | undefined]),
    ...Object.values(r.conditions).map((c) => [`Conditions › ${c.id} › narrator_when`, c.gate] as [string, { when?: string } | undefined]),
  ];
  for (const [where, g] of gates) check(g?.when, where);
  if (r.dating.enabled) {
    const dx = { target: Object.keys(r.people)[0] ?? "someone" };
    check(r.dating.with, "Dating › with", dx);
    for (const t of Object.values(r.dating.topics)) check(t.when, `Dating › topics › ${t.id} › when`, dx);
    const tags = new Set(Object.values(r.dating.venues).flatMap((v) => v.activities.flatMap((a) => a.tags)));
    for (const v of Object.values(r.dating.venues)) {
      check(v.when, `Dating › venues › ${v.id} › when`, dx);
      if (v.at && Object.keys(r.locations).length && !r.locations[v.at]) issues.push({ level: "warning", where: `Dating › venues › ${v.id} › at`, message: `"${v.at}" isn't a declared location${suggest(v.at, Object.keys(r.locations))}` });
    }
    if (venueCostsWithoutMoney(r)) issues.push({ level: "warning", where: "Dating › venues", message: "venues have a cost but the ruleset has no money stat — outings will be free" });
    for (const [pid, tastes] of Object.entries(r.dating.people)) for (const key of Object.keys(tastes)) {
      const bare = key.replace(/^(tag|item|act):/, "");
      const known = r.dating.topics[key] || r.dating.categories.some((c) => c.id === key) || (key.startsWith("tag:") ? tags.has(bare) : key.startsWith("item:") ? !!r.items[bare] : tags.has(key) || Object.values(r.dating.venues).some((v) => v.activities.some((a) => a.id === bare)));
      if (!known) issues.push({ level: "warning", where: `Dating › people › ${pid}`, message: `"${key}" isn't a topic, category, activity tag (tag:…) or item (item:…)${suggest(key, Object.keys(r.dating.topics))}` });
    }
  }
  return issues;
}
