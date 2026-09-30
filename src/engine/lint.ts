// Author-facing checks that need the whole ruleset: unknown names in formulas,
// with "did you mean" suggestions, and effects that point at things that don't exist.

import { evaluate, type ExprEnv, type Value } from "./expr.js";
import type { Effect, Issue, Ruleset } from "./ruleset.js";
import { initialState, makeEnv } from "./state.js";

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
  const names = [
    ...r.statOrder, ...Object.keys(r.flags),
    "minutes", "hour", "minute", "day", "weekday", "turn", "location",
  ];

  const check = (src: string | number | undefined, where: string, extra: Record<string, Value> = {}) => {
    if (src === undefined || typeof src === "number") return;
    const base = makeEnv(r, s, extra);
    const env: ExprEnv = { lookup: base.lookup, call: (n, a) => (n === "roll" ? 1 : base.call?.(n, a)) };
    const unknown = new Set<string>();
    try { evaluate(src, env, { unknown }); } catch { return; }
    for (const u of unknown) {
      const isCall = u.endsWith("()");
      const msg = isCall
        ? `"${u}" isn't a known function (has, count, flag, cond, at, rel, met, between, roll, min, max, clamp, floor, ceil, round, abs)`
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
  };

  for (const id of r.statOrder) check(r.stats[id].maxExpr, `Stats › ${id} › max`);

  for (const a of Object.values(r.actions)) {
    const w = `Actions › ${a.id}`;
    const extra: Record<string, Value> = Object.fromEntries(a.params.map((p) => [p.id, p.options[p.default]]));
    check(a.when, `${w} › when`, extra);
    if (a.check) {
      check(a.check.target, `${w} › check`, extra);
      check(a.check.add, `${w} › check › add`, extra);
    }
    checkEffect(a.cost, `${w} › cost`, extra);
    checkEffect(a.effects, `${w} › effects`, extra);
    for (const [tier, e] of Object.entries(a.outcomes)) if (e) checkEffect(e, `${w} › ${tier}`, extra);
  }
  for (const t of r.triggers) {
    check(t.when, `Triggers › ${t.id} › when`);
    checkEffect(t.effects, `Triggers › ${t.id}`);
  }
  for (const id of r.hud.bars) if (!r.stats[id]) issues.push({ level: "warning", where: "HUD › bars", message: `"${id}" isn't a stat` });
  return issues;
}
