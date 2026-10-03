// Author-facing checks that need the whole ruleset: unknown names in formulas,
// with "did you mean" suggestions, and effects that point at things that don't exist.

import { evaluate, type ExprEnv, type Value } from "./expr.js";
import type { ActionDef, Effect, Issue, Ruleset } from "./ruleset.js";
import { BUILTIN_NAMES, initialState, makeEnv } from "./state.js";
import { costValue } from "./resolve.js";

export const FUNCTIONS = [
  "has", "count", "flag", "cond", "at", "rel", "met", "between", "roll",
  "wearing", "worn", "trait", "present",
  "eff", "gear", "integrity",
  "secret", "body", "transformed", "age",
  "quest", "quest_active", "quest_done", "quest_failed", "goal", "quests_done", "memories", "cond_of", "foe_cond", "stat_max", "foe_max", "in_encounter",
  "min", "max", "clamp", "floor", "ceil", "round", "abs",
];

/** Formula names of systems removed from Warp: an old ruleset that uses them gets a plain warning. */
const REMOVED_NAMES: Record<string, string> = {
  in_dungeon: "dungeons", dungeon_depth: "dungeons", "deepest()": "dungeons",
  in_date: "dating", on_outing: "dating", "partner()": "dating", "dates()": "dating", "stage()": "dating",
  pregnant: "family and pregnancy", pregnancy_weeks: "family and pregnancy", "children()": "family and pregnancy",
  "seen_by()": "being seen", "fame()": "being seen",
  "saved()": "checkpoints", loops: "checkpoints", runs: "endings and new playthroughs",
  "codex()": "the codex", "feat()": "feats", "perk()": "perks",
  "front()": "hidden world clocks (fronts)", "front_stage()": "hidden world clocks (fronts)", "happened()": "random events",
  "bond()": "feelings between people", "arc()": "companion lives", "where()": "schedules",
  at_work: "work shifts", "owed()": "bills and debts", "missed()": "bills and debts", "days_until()": "bills and debts",
};

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

  const check = (src: string | number | undefined, where: string, extra: Record<string, Value> = {}) => {
    if (src === undefined || typeof src === "number") return;
    const base = makeEnv(r, s, extra);
    const env: ExprEnv = { lookup: base.lookup, call: (n, a) => {
      if (n === "in_encounter" && a.length && !r.encounters[String(a[0])]) badEncounter.add(String(a[0]));
      return n === "roll" ? 1 : base.call?.(n, a);
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
      const gone = REMOVED_NAMES[u];
      const msg = gone ? `"${u}" (${gone}) was removed from Warp, so it always reads as 0. The old version is on the \`legacy\` branch.`
        : isCall
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
    if (e.startEncounter && !r.encounters[e.startEncounter]) {
      issues.push({ level: "warning", where, message: `starts encounter "${e.startEncounter}", which doesn't exist${suggest(e.startEncounter, Object.keys(r.encounters))}` });
    }
    for (const [stat, v] of Object.entries(e.foe)) {
      const known = Object.values(r.encounters).some((enc) => enc.foe.stats.some((s) => s.id === stat));
      if (!known) issues.push({ level: "warning", where, message: `changes foe stat "${stat}", which no encounter declares` });
      check(v, `${where} › foe › ${stat}`, extra);
    }
    for (const id of e.reveal) {
      if (!r.secrets[id]) issues.push({ level: "warning", where, message: `reveals secret "${id}", which doesn't exist${suggest(id, Object.keys(r.secrets))}` });
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
  };
  for (const a of Object.values(r.actions)) checkAction(a, `Actions › ${a.id}`);
  // Item uses are actions too: their formulas and costs get the same checks.
  for (const it of Object.values(r.items)) if (it.use) checkAction(it.use, `Items › ${it.id} › use`);
  const checkRequires = (a: ActionDef, w: string) => {
    for (const q of a.requires) {
      const id = q.id ?? "";
      const miss = (what: string, pool: string[]) => issues.push({ level: "warning", where: `${w} › requires`, message: `"${id}" isn't ${what}${suggest(id, pool)}` });
      if ((q.kind === "with" || q.kind === "rel") && !r.people[id]) miss("a person", people);
      if (q.kind === "has" && !r.items[id] && !r.itemsOpen) miss("an item", Object.keys(r.items));
      if (q.kind === "quest" && !r.quests[id]) miss("a quest", r.questOrder);
      if (q.kind === "flag" && !r.flags[id]) miss("a flag", Object.keys(r.flags));
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
  check(r.liveChoices.when, "Live choices › when");
  for (const a of Object.values(r.liveChoices.tags)) checkAction(a, `Live choices › tags › ${a.id}`);
  const slotIds = r.wardrobe.slots.map((s) => s.id);
  for (const [part, slots] of Object.entries(r.body.hiddenBy)) for (const slot of slots) {
    if (!slotIds.includes(slot)) issues.push({ level: "warning", where: `Body › hidden_by › ${part}`, message: `"${slot}" isn't a wardrobe slot${suggest(slot, slotIds)}` });
  }
  for (const t of Object.values(r.body.transforms)) check(t.chance, `Body › transforms › ${t.id} › chance`);
  const gates: [string, { when?: string } | undefined][] = [
    ...r.statOrder.map((id) => [`Stats › ${id} › narrator_when`, r.stats[id].gate] as [string, { when?: string } | undefined]),
    ...r.relStatOrder.map((id) => [`Relationships › stats › ${id} › narrator_when`, r.relStats[id].gate] as [string, { when?: string } | undefined]),
    ...Object.values(r.flags).map((f) => [`Flags › ${f.id} › narrator_when`, f.gate] as [string, { when?: string } | undefined]),
    ...Object.values(r.conditions).map((c) => [`Conditions › ${c.id} › narrator_when`, c.gate] as [string, { when?: string } | undefined]),
  ];
  for (const [where, g] of gates) check(g?.when, where);
  return issues;
}
