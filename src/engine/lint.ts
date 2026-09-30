// Author-facing checks that need the whole ruleset: unknown names in formulas,
// with "did you mean" suggestions, and effects that point at things that don't exist.

import { evaluate, type ExprEnv, type Value } from "./expr.js";
import type { ActionDef, Effect, Issue, Ruleset } from "./ruleset.js";
import { BUILTIN_NAMES, initialState, makeEnv } from "./state.js";
import { SKILLS } from "./dungeon/content.js";

export const FUNCTIONS = [
  "has", "count", "flag", "cond", "at", "rel", "met", "between", "roll",
  "wearing", "worn", "trait", "present", "where", "codex", "feat", "perk",
  "secret", "front", "front_stage", "happened", "deepest", "partner", "dates", "stage",
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

export function lintRuleset(r: Ruleset): Issue[] {
  const issues: Issue[] = [];
  const s = initialState(r);
  const names = [...r.statOrder, ...Object.keys(r.flags), ...BUILTIN_NAMES];

  const check = (src: string | number | undefined, where: string, extra: Record<string, Value> = {}, dungeon = false) => {
    if (src === undefined || typeof src === "number") return;
    const base = makeEnv(r, s, extra);
    // Dungeon formulas also know depth, bag('potion') and rel_bond(person).
    const env: ExprEnv = { lookup: base.lookup, call: (n, a) => (n === "roll" ? 1 : dungeon && (n === "bag" || n === "rel_bond") ? 0 : base.call?.(n, a)) };
    const unknown = new Set<string>();
    try { evaluate(src, env, { unknown }); } catch { return; }
    for (const u of unknown) {
      const isCall = u.endsWith("()");
      const msg = isCall
        ? `"${u}" isn't a known function (${FUNCTIONS.join(", ")})`
        : `"${u}" isn't a stat, flag or clock value${suggest(u, [...names, ...Object.keys(extra)])}`;
      issues.push({ level: "warning", where, message: msg });
    }
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
    for (const d of e.decide) for (const o of d.options) checkEffect(o.effect, `${where} › decide › ${d.id} › ${o.id}`, extra);
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
  };

  for (const id of r.statOrder) check(r.stats[id].maxExpr, `Stats › ${id} › max`);

  const checkAction = (a: ActionDef, w: string) => {
    const extra: Record<string, Value> = Object.fromEntries(a.params.map((p) => [p.id, p.options[p.default]]));
    if (a.perPerson) extra.target = Object.keys(r.people)[0] ?? "someone";
    check(a.when, `${w} › when`, extra);
    if (a.check) {
      check(a.check.target, `${w} › check`, extra);
      check(a.check.add, `${w} › check › add`, extra);
    }
    checkEffect(a.cost, `${w} › cost`, extra);
    checkEffect(a.effects, `${w} › effects`, extra);
    for (const [tier, e] of Object.entries(a.outcomes)) if (e) checkEffect(e, `${w} › ${tier}`, extra);
  };
  for (const a of Object.values(r.actions)) checkAction(a, `Actions › ${a.id}`);
  for (const t of r.triggers) {
    check(t.when, `Triggers › ${t.id} › when`);
    checkEffect(t.effects, `Triggers › ${t.id}`);
  }
  for (const p of Object.values(r.people)) p.schedule.forEach((e, i) => check(e.when, `People › ${p.id} › schedule #${i + 1}`));
  for (const c of Object.values(r.codex)) check(c.unlock, `Codex › ${c.id} › unlock`);
  for (const f of Object.values(r.feats)) { check(f.unlock, `Feats › ${f.id} › unlock`); checkEffect(f.reward, `Feats › ${f.id} › reward`); }
  for (const p of Object.values(r.perks)) { check(p.requires, `Perks › ${p.id} › requires`); checkEffect(p.effects, `Perks › ${p.id}`); }
  for (const enc of Object.values(r.encounters)) {
    const w = `Encounters › ${enc.id}`;
    for (const a of Object.values(enc.actions)) checkAction(a, `${w} › actions › ${a.id}`);
    if (enc.foeMoves) for (const o of enc.foeMoves.options) checkEffect(o.effect, `${w} › foe_moves › ${o.id}`);
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
    f.stages.forEach((st, i) => checkEffect(st.effects, `${w} › stage ${i + 1}`));
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
