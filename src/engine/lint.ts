// Author-facing checks that need the whole ruleset: unknown names in formulas,
// with "did you mean" suggestions, and effects that point at things that don't exist.

import { evaluate, type ExprEnv, type Value } from "./expr.js";
import type { ActionDef, Effect, Issue, Ruleset } from "./ruleset.js";
import { BUILTIN_NAMES, initialState, makeEnv } from "./state.js";

export const FUNCTIONS = [
  "has", "count", "flag", "cond", "at", "rel", "met", "between", "roll",
  "wearing", "worn", "trait", "present", "where", "codex", "feat", "perk",
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

export function lintRuleset(r: Ruleset): Issue[] {
  const issues: Issue[] = [];
  const s = initialState(r);
  const names = [...r.statOrder, ...Object.keys(r.flags), ...BUILTIN_NAMES];

  const check = (src: string | number | undefined, where: string, extra: Record<string, Value> = {}) => {
    if (src === undefined || typeof src === "number") return;
    const base = makeEnv(r, s, extra);
    const env: ExprEnv = { lookup: base.lookup, call: (n, a) => (n === "roll" ? 1 : base.call?.(n, a)) };
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
  return issues;
}
