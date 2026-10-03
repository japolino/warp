// Author-facing checks that need the whole ruleset: unknown names in formulas,
// with "did you mean" suggestions, and effects that point at things that don't exist.

import { evaluate, type ExprEnv, type Value } from "./expr.js";
import { difficultyOf, type ActionDef, type Effect, type Issue, type Ruleset } from "./ruleset.js";
import { BUILTIN_NAMES, initialState, makeEnv } from "./state.js";
import { costValue } from "./resolve.js";

/** The formula functions Warp reads (CORE-DESIGN §1.4). */
export const FUNCTIONS = [
  "has", "count", "flag", "cond", "rel", "met", "present", "between", "roll",
  "goal", "secret", "in_contest", "eff", "gear",
  "min", "max", "clamp", "floor", "ceil", "round", "abs",
];

/**
 * Formula names of systems removed from Warp (names, and functions written with "()"): an old ruleset that uses
 * them gets a plain warning; they read as 0. Studio's "never suggest a removed system" check reads this too.
 */
export const REMOVED_FORMULAS: Record<string, string> = {
  in_dungeon: "dungeons", dungeon_depth: "dungeons", "deepest()": "dungeons",
  in_date: "dating", on_outing: "dating", "partner()": "dating", "dates()": "dating", "stage()": "dating",
  pregnant: "family and pregnancy", pregnancy_weeks: "family and pregnancy", "children()": "family and pregnancy",
  "seen_by()": "being seen", "fame()": "being seen",
  "saved()": "checkpoints", loops: "checkpoints", runs: "endings and new playthroughs",
  "codex()": "the codex", "feat()": "feats", "perk()": "perks",
  weather: "weather and temperature", temperature: "weather and temperature", warmth: "weather and temperature",
  warmth_min: "weather and temperature", warmth_max: "weather and temperature", too_cold: "weather and temperature", too_hot: "weather and temperature",
  season: "seasons", month: "the calendar in formulas", date: "the calendar in formulas", indoors: "places", outside: "places",
  location: "place ids (use place, the words)", "at()": "place ids (use place == 'The docks')",
  reveal: "the wardrobe", exposed: "the wardrobe", naked: "the wardrobe",
  "wearing()": "the wardrobe", "worn()": "the wardrobe", "integrity()": "the wardrobe", "trait()": "the wardrobe",
  "body()": "the body and transformations", "transformed()": "the body and transformations",
  "front()": "hidden world clocks (fronts)", "front_stage()": "hidden world clocks (fronts)", "happened()": "random events",
  "bond()": "feelings between people", "arc()": "companion lives", "where()": "schedules",
  at_work: "work shifts", "owed()": "bills and debts", "missed()": "bills and debts", "days_until()": "bills and debts",
  "age()": "ages in formulas", "memories()": "memory counts", "cond_of()": "conditions on others", "foe_cond()": "encounters",
  "stat_max()": "max formulas in checks", "foe_max()": "encounters", encounter: "encounters (use in_contest)", encounter_round: "encounters (use round)",
  "quest()": "quests (use goal())", "quest_active()": "quests (use goal())", "quest_done()": "quests (use goal())",
  "quest_failed()": "quests (use goal())", "quests_done()": "quests", foe: "encounters",
};
/** Every removed formula name (without the "()" of functions). */
export const REMOVED_FORMULA_NAMES: string[] = Object.keys(REMOVED_FORMULAS).map((k) => k.replace(/\(\)$/, ""));

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
  const people = Object.keys(r.people);
  const warn = (where: string, message: string) => issues.push({ level: "warning", where, message });

  const check = (src: string | number | undefined, where: string, extra: Record<string, Value> = {}) => {
    if (src === undefined || typeof src === "number") return;
    if (difficultyOf(src)) return; // a difficulty word, not a formula
    const base = makeEnv(r, s, extra);
    const badKind = new Set<string>();
    const env: ExprEnv = { lookup: base.lookup, call: (n, a) => {
      if (n === "in_contest" && a.length && !r.conflict.kinds[String(a[0])]) badKind.add(String(a[0]));
      if (n === "goal" && a.length && !r.goals.list[String(a[0])] && !String(a[0]).startsWith("story_")) badGoal.add(String(a[0]));
      return n === "roll" ? 1 : base.call?.(n, a);
    } };
    const badGoal = new Set<string>();
    const unknown = new Set<string>();
    try { evaluate(src, env, { unknown }); } catch { return; }
    // eff('str') / gear('atk') name a stat.
    for (const m of String(src).matchAll(/\b(eff|gear)\(\s*['"]([^'"]+)['"]/g)) {
      const [, fn, id] = m;
      if (!r.stats[id]) warn(where, `${fn}('${id}'): "${id}" isn't a stat${suggest(id, r.statOrder)}`);
    }
    for (const u of unknown) {
      const gone = REMOVED_FORMULAS[u];
      const msg = gone ? `"${u}" (${gone}) was removed from Warp, so it always reads as 0. The old version is on the \`legacy\` branch.`
        : u.endsWith("()") ? `"${u}" isn't a known function (${FUNCTIONS.join(", ")})`
        : `"${u}" isn't a stat, flag or clock value${suggest(u, [...names, ...Object.keys(extra)])}`;
      warn(where, msg);
    }
    for (const id of badKind) warn(where, `in_contest('${id}'): "${id}" isn't a contest kind${suggest(id, Object.keys(r.conflict.kinds))}`);
    for (const id of badGoal) warn(where, `goal('${id}'): "${id}" isn't a goal in goals.list${suggest(id, Object.keys(r.goals.list))}`);
  };

  const checkEffect = (e: Effect, where: string, extra: Record<string, Value> = {}) => {
    for (const [id, v] of Object.entries(e.stats)) {
      if (!r.stats[id]) warn(where, `changes "${id}", which isn't a stat${suggest(id, r.statOrder)}`);
      check(v, `${where} › ${id}`, extra);
    }
    for (const [id, v] of Object.entries(e.set)) {
      if (!r.stats[id]) warn(where, `sets "${id}", which isn't a stat${suggest(id, r.statOrder)}`);
      check(v, `${where} › set › ${id}`, extra);
    }
    for (const [who, m] of Object.entries(e.rel)) for (const [stat, v] of Object.entries(m)) {
      if (!r.relStats[stat]) warn(where, `"${stat}" isn't a relationship stat${suggest(stat, r.relStatOrder)}`);
      check(v, `${where} › ${who} › ${stat}`, extra);
    }
    for (const id of Object.keys(e.addConditions)) {
      if (!r.conditions[id]) warn(where, `adds condition "${id}", which isn't declared under conditions:${suggest(id, Object.keys(r.conditions))}`);
    }
    for (const d of e.decide) for (const o of d.options) { check(o.when, `${where} › decide › ${d.id} › ${o.id} › when`, extra); checkEffect(o.effect, `${where} › decide › ${d.id} › ${o.id}`, extra); }
    for (const id of e.reveal) if (!r.secrets[id]) warn(where, `reveals secret "${id}", which doesn't exist${suggest(id, Object.keys(r.secrets))}`);
    for (const id of Object.keys(e.goal)) if (!r.goals.list[id]) warn(where, `"${id}" isn't a goal in goals.list${suggest(id, Object.keys(r.goals.list))}`);
    for (const who of Object.keys(e.look)) if (who !== "you" && who !== "target" && who !== "opponent" && !r.people[who]) warn(where, `"${who}" isn't "you" or a person in relationships › people${suggest(who, people)}`);
    if (e.contest) {
      if (r.style === "story") warn(where, "story rulesets don't run contests — `contest:` is ignored");
      else if (!r.conflict.kinds[e.contest.kind]) warn(where, `starts contest kind "${e.contest.kind}", which isn't under conflict.kinds${suggest(e.contest.kind, Object.keys(r.conflict.kinds))}`);
    }
    check(e.swing, `${where} › swing`, extra);
    for (const who of Object.keys(e.remember)) if (who !== "target" && who !== "opponent" && !r.people[who]) warn(where, `"${who}" isn't a person to remember it${suggest(who, people)}`);
  };

  for (const id of r.statOrder) check(r.stats[id].maxExpr, `Stats › ${id} › max`);
  for (const id of r.statOrder) check(r.stats[id].startExpr, `Stats › ${id} › start`);

  // Costs are worked out to show and gate the choice; one that can't be computed would break the choice list.
  const checkCost = (a: ActionDef, w: string, extra: Record<string, Value>) => {
    const env = makeEnv(r, s, extra);
    for (const [id, v] of Object.entries(a.cost.stats)) {
      try {
        if (!Number.isFinite(costValue(r, s, id, v, env))) warn(`${w} › cost › ${id}`, `"${v}" doesn't work out to a number`);
      } catch (e) {
        warn(`${w} › cost › ${id}`, `"${v}" can't be worked out (${e instanceof Error ? e.message : String(e)}) — use a number, a share of the max like "-15%", or a formula`);
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
      const miss = (what: string, pool: string[]) => warn(`${w} › requires`, `"${id}" isn't ${what}${suggest(id, pool)}`);
      if ((q.kind === "with" || q.kind === "rel") && !r.people[id]) miss("a person", people);
      if (q.kind === "has" && !r.items[id] && !r.itemsOpen) miss("an item", Object.keys(r.items));
      if (q.kind === "goal" && !r.goals.list[id]) miss("a goal in goals.list", Object.keys(r.goals.list));
      if (q.kind === "flag" && !r.flags[id]) miss("a flag", Object.keys(r.flags));
      if (q.kind === "rel" && !r.relStats[q.stat ?? ""]) warn(`${w} › requires`, `"${q.stat}" isn't a relationship stat${suggest(q.stat ?? "", r.relStatOrder)}`);
    }
  };
  for (const a of Object.values(r.actions)) checkRequires(a, `Actions › ${a.id}`);
  for (const c of Object.values(r.conditions)) {
    const w = `Conditions › ${c.id}`;
    for (const [k, v] of Object.entries(c.bonus)) {
      if (!r.stats[k]) warn(`${w} › bonus`, `"${k}" isn't a stat${suggest(k, r.statOrder)}`);
      check(v, `${w} › bonus › ${k}`);
    }
  }
  for (const it of Object.values(r.items)) for (const [k, v] of Object.entries(it.bonus)) check(v, `Items › ${it.id} › bonus › ${k}`);
  for (const id of r.statOrder) if (r.stats[id].perHourExpr && !/%\s*$/.test(r.stats[id].perHourExpr!)) check(r.stats[id].perHourExpr, `Stats › ${id} › per_hour`);
  for (const t of r.triggers) {
    check(t.when, `Triggers › ${t.id} › when`);
    checkEffect(t.effects, `Triggers › ${t.id}`);
  }
  for (const id of r.hud.bars) if (!r.stats[id]) warn("HUD › bars", `"${id}" isn't a stat`);

  for (const sec of Object.values(r.secrets)) sec.stages.forEach((st, i) => check(st.when, `Secrets › ${sec.id} › stage ${i + 1} › when`));
  check(r.liveChoices.when, "Live choices › when");
  for (const a of Object.values(r.liveChoices.tags)) checkAction(a, `Live choices › tags › ${a.id}`);
  // Checks lean on attributes and skills; a typed attempt's stats and a contest kind's stats should be those.
  for (const id of r.checks.stats) if (r.stats[id] && r.stats[id].kind !== "attribute" && r.stats[id].kind !== "skill") warn("Checks › stats", `"${id}" is a ${r.stats[id].kind}: typed attempts lean on attributes and skills`);
  for (const k of Object.values(r.conflict.kinds)) {
    const w = `Conflict › kinds › ${k.id}`;
    for (const [tier, e] of Object.entries(k.cost)) if (e) checkEffect(e, `${w} › cost › ${tier}`);
    checkEffect(k.won, `${w} › won`);
    checkEffect(k.lost, `${w} › lost`);
    checkEffect(k.escaped, `${w} › escaped`);
  }
  for (const g of Object.values(r.goals.list)) {
    const w = `Goals › ${g.id}`;
    check(g.doneWhen, `${w} › done_when`);
    check(g.failWhen, `${w} › fail_when`);
    checkEffect(g.reward, `${w} › reward`);
    if (!g.doneWhen && !g.judge) warn(w, "has no `done_when:` or `judge:`, so only a `goal: { " + g.id + ": done }` effect can close it");
  }
  const gates: [string, { when?: string } | undefined][] = [
    ...r.statOrder.map((id) => [`Stats › ${id} › narrator_when`, r.stats[id].gate] as [string, { when?: string } | undefined]),
    ...r.relStatOrder.map((id) => [`Relationships › stats › ${id} › narrator_when`, r.relStats[id].gate] as [string, { when?: string } | undefined]),
    ...Object.values(r.flags).map((f) => [`Flags › ${f.id} › narrator_when`, f.gate] as [string, { when?: string } | undefined]),
    ...Object.values(r.conditions).map((c) => [`Conditions › ${c.id} › narrator_when`, c.gate] as [string, { when?: string } | undefined]),
  ];
  for (const [where, g] of gates) check(g?.when, where);
  return issues;
}
