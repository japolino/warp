// Quick balance review of a ruleset, for the builder's review screen.
// Pure engine: odds at the start, how fast meters run away, rules that fire
// immediately, stats nothing touches, and simulated encounters.

import { evalBool, evalNumber } from "./expr.js";
import type { ActionDef, Effect, Ruleset } from "./ruleset.js";
import { cloneState, initialState, makeEnv, type GameState } from "./state.js";
import { odds } from "./resolve.js";
import { kindsLine, patchedState, simulateEncounter as playtestEncounter } from "./simulate.js";
import type { KindTally } from "./outcomes.js";
import type { PartLabel } from "./reference.js";
import { checkStats } from "./freeform.js";

export interface BalanceWarning {
  id: string;
  part: PartLabel;
  text: string;
  /** Instruction handed to the model when the player taps Fix. */
  fix: string;
}

function effectsOf(r: Ruleset): Effect[] {
  const out: Effect[] = [];
  const add = (e: Effect | undefined) => {
    if (!e) return;
    out.push(e);
    for (const d of e.decide) for (const o of d.options) add(o.effect);
  };
  const addAction = (a: ActionDef) => { add(a.cost); add(a.effects); for (const e of Object.values(a.outcomes)) add(e); };
  Object.values(r.actions).forEach(addAction);
  for (const t of r.triggers) add(t.effects);
  for (const enc of Object.values(r.encounters)) {
    Object.values(enc.actions).forEach(addAction);
    for (const o of enc.foeMoves?.options ?? []) add(o.effect);
    Object.values(enc.outcomes).forEach(add);
    add(enc.start);
  }
  for (const f of Object.values(r.feats)) add(f.reward);
  for (const p of Object.values(r.perks)) add(p.effects);
  for (const f of Object.values(r.fronts)) for (const st of f.stages) add(st.effects);
  for (const e of Object.values(r.randomEvents.events)) add(e.effects);
  Object.values(r.liveChoices.tags).forEach(addAction);
  Object.values(r.abilities).forEach((ab) => addAction(ab.action));
  for (const it of Object.values(r.items)) if (it.use) addAction(it.use);
  for (const q of Object.values(r.quests)) { add(q.start); add(q.reward); add(q.failure); }
  for (const c of Object.values(r.conditions)) add(c.tick);
  return out;
}

/** Every move with a check: actions, encounter moves, live choices, abilities, item uses. */
function checkedActions(r: Ruleset): ActionDef[] {
  return [
    ...Object.values(r.actions), ...Object.values(r.encounters).flatMap((e) => Object.values(e.actions)),
    ...Object.values(r.liveChoices.tags), ...Object.values(r.abilities).map((ab) => ab.action),
    ...Object.values(r.items).flatMap((it) => (it.use ? [it.use] : [])),
  ].filter((a) => a.check);
}

export function reviewBalance(r: Ruleset): BalanceWarning[] {
  const out: BalanceWarning[] = [];
  const start = initialState(r);

  // Checks that are nearly impossible or automatic at the start (evaluated where they're usable).
  for (const a of Object.values(r.actions)) {
    if (!a.check || a.perPerson) continue;
    const s = cloneState(start);
    if (a.at.length) s.location = a.at[0];
    const o = odds(r, s, a);
    if (!o) continue;
    const p = o.success + o.partial / 2;
    if (p < 0.12) out.push({ id: `odds:${a.id}`, part: "actions", text: `“${a.label}” succeeds only ${Math.round(p * 100)}% of the time at the start.`, fix: `Make the "${a.id}" action's check noticeably easier at the start (aim for 30–50% success), keeping it harder than it will be later.` });
    else if (p > 0.95) out.push({ id: `odds:${a.id}`, part: "actions", text: `“${a.label}” succeeds ${Math.round(p * 100)}% of the time — the roll barely matters.`, fix: `Make the "${a.id}" action's check less of a sure thing (aim for 60–80% success at the start).` });
  }

  // Meters that run away with time.
  for (const id of r.statOrder) {
    const d = r.stats[id];
    if (!d.perHour) continue;
    const toEdge = d.perHour > 0 ? d.max - d.start : d.start - d.min;
    const hours = toEdge / Math.abs(d.perHour);
    const bad = (d.perHour > 0 && d.good === "low") || (d.perHour < 0 && d.good === "high");
    if (bad && hours < 8) {
      out.push({ id: `drift:${id}`, part: "stats", text: `${d.label} reaches its worst in about ${Math.max(1, Math.round(hours))}h of game time on its own.`, fix: `Slow down the per_hour drift of the "${id}" stat so it takes at least a day of game time to reach its worst.` });
    }
  }

  // Rules that fire the moment the game starts.
  const env = makeEnv(r, start);
  // Recovery rules that only clear conditions are harmless if they fire at the start.
  const meaningful = (e: Effect) =>
    Object.keys(e.stats).length + Object.keys(e.set).length + Object.keys(e.addConditions).length + Object.keys(e.items).length +
    Object.keys(e.rel).length + e.decide.length + e.wear.length + e.undress.length > 0 || !!e.move || !!e.startEncounter || !!e.hint;
  for (const t of r.triggers) {
    if (t.when && !t.whenScene && meaningful(t.effects) && evalBool(t.when, env, false) && !t.repeat) {
      out.push({ id: `trig:${t.id}`, part: "rules", text: `Rule “${t.id}” fires immediately on turn one.`, fix: `Adjust the "${t.id}" trigger (or the starting values it checks) so it doesn't fire at the very start.` });
    }
  }

  // World pacing: clocks that run out almost at once, and events that come too thick.
  for (const f of Object.values(r.fronts)) {
    const last = f.stages[f.stages.length - 1];
    const rate = evalNumber(f.rate, env, 0);
    if (!last || rate <= 0) continue;
    const days = (last.at - f.start) / rate;
    if (days < 2) {
      out.push({ id: `front:${f.id}`, part: "story", text: `“${f.label}” runs through all its stages in about ${Math.max(1, Math.round(days * 24))}h of game time.`, fix: `Slow the "${f.id}" front down (lower per_day or space its stages out) so it takes at least a week or two of game time to play out.` });
    }
  }
  if (r.randomEvents.enabled) {
    const perDay = evalNumber(r.randomEvents.perDay, env, 0);
    if (perDay > 0 && 100 / perDay < 0.75) {
      out.push({ id: "events:pace", part: "story", text: `A random event roughly every ${Math.max(1, Math.round((100 / perDay) * 24))}h of game time — that's a lot.`, fix: "Lower random_events per_day so events come every few days of game time rather than several times a day." });
    }
  }

  // Stats nothing can ever change.
  const touched = new Set<string>();
  const rolled = new Set(checkedActions(r).flatMap((a) => checkStats(r, a)));
  for (const e of effectsOf(r)) { Object.keys(e.stats).forEach((k) => touched.add(k)); Object.keys(e.set).forEach((k) => touched.add(k)); }
  for (const c of Object.values(r.conditions)) if (c.dot !== undefined && c.stat) touched.add(c.stat);
  for (const id of r.statOrder) {
    const d = r.stats[id];
    if (d.kind === "money" && d.narrator > 0) continue;
    // Skills and attributes grow each time a check reads them.
    const grows = (d.kind === "skill" || d.kind === "attribute") && r.growth.enabled && d.growth > 0 && rolled.has(id);
    if (!touched.has(id) && !d.perHour && d.perHourExpr === undefined && !d.allocate && d.narrator <= 0 && !grows) {
      out.push({ id: `dead:${id}`, part: "stats", text: `${d.label} never changes — no action, rule or story update touches it.`, fix: `Give the "${id}" stat a way to change: at least one action or rule that raises or lowers it, or allow the narrator to adjust it.` });
    }
  }

  // Encounters: simulate random play. Endings are counted as won / escaped / conceded / lost by the one
  // classifier the simulator and quests use. "Getting through" = won or escaped (a concession is a price,
  // not a way through); and when there is a win, random play should sometimes take it — a fight that is
  // nearly always fled from isn't balanced just because fleeing works (a designed toll or bribe is fine).
  for (const enc of Object.values(r.encounters)) {
    // A late encounter is judged from the state its `sim:` describes (its intended level, gear, flags).
    let from = start;
    if (enc.sim) {
      const p = patchedState(r, enc.sim, start);
      for (const n of p.notes) out.push({ id: `enc-sim:${enc.id}`, part: "encounters", text: `“${enc.name}” sim: ${n}.`, fix: `Fix the "${enc.id}" encounter's sim: so every name in it exists.` });
      from = p.state;
      from.encounter = null;
    }
    const sim = simulateEncounter(r, from, enc.id, 120);
    if (!sim) continue;
    const kinds = Object.values(enc.outcomeKinds ?? {});
    const canWin = kinds.includes("won");
    const through = canWin || kinds.includes("escaped");
    const k = sim.kinds, pct = (n: number) => Math.round((n / sim.runs) * 100);
    const split = kindsLine(k, sim.runs, sim.stuck);
    if (sim.stuck / sim.runs > 0.2) {
      out.push({ id: `enc-stuck:${enc.id}`, part: "encounters", text: `“${enc.name}” often doesn't end within 25 rounds.`, fix: `Make the "${enc.id}" encounter reliably end within about 4–10 rounds (stronger effects on foe stats or tighter end_when conditions).` });
    } else if (through && (k.won + k.escaped) / sim.runs < 0.2) {
      out.push({ id: `enc-hard:${enc.id}`, part: "encounters", text: `“${enc.name}” is won or escaped only ${pct(k.won + k.escaped)}% of the time with random play (${split}).`, fix: `Make the "${enc.id}" encounter fairer for the player (aim for roughly half of random playthroughs ending well). If an ending is mis-counted, mark it with losses: or outcome_kinds:.` });
    } else if (canWin && k.won / sim.runs < 0.1 && k.escaped / sim.runs >= 0.3) {
      out.push({ id: `enc-flee:${enc.id}`, part: "encounters", text: `“${enc.name}” is won only ${pct(k.won)}% of the time with random play; it mostly ends by getting away (${split}).`, fix: `Make winning "${enc.id}" a real option (aim for random play winning 30–70%), or make the way out cost more. If it's meant for later in the game, give it sim: (the state to judge it from). If an ending is mis-counted, mark it with losses: or outcome_kinds:.` });
    } else if (through && (k.won + k.escaped) / sim.runs > 0.95) {
      out.push({ id: `enc-easy:${enc.id}`, part: "encounters", text: `“${enc.name}” almost always goes the player's way — there's little risk (${split}).`, fix: `Make the "${enc.id}" encounter more dangerous (foe moves hit harder or the player's options are riskier).` });
    }
  }
  return out;
}

/** Random play through one encounter (25 rounds at most): the numbers the checker judges and `simulate` prints. */
export function simulateEncounter(r: Ruleset, from: GameState, id: string, runs: number): { runs: number; outcomes: Record<string, number>; kinds: KindTally; stuck: number; rounds: number } | null {
  const sim = playtestEncounter(r, id, { from, runs, maxRounds: 25, randomOnly: true });
  const random = sim?.policies.find((p) => p.policy === "a random mix");
  return random ? { runs: random.runs, outcomes: random.outcomes, kinds: random.kinds, stuck: random.unfinished, rounds: random.meanRounds ?? random.medianRounds } : null;
}
