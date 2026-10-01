// Quick balance review of a ruleset, for the builder's review screen.
// Pure engine: odds at the start, how fast meters run away, rules that fire
// immediately, stats nothing touches, and simulated encounters.

import { seededRng } from "./dice.js";
import { evalBool, evalNumber } from "./expr.js";
import type { ActionDef, Effect, Ruleset } from "./ruleset.js";
import { applyEvent, cloneState, initialState, makeEnv, type GameState } from "./state.js";
import { availableChoices, odds, resolveTurnFull } from "./resolve.js";
import type { PartLabel } from "./reference.js";
import { isLoss } from "./encounter-view.js";
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

/** Endings the player chose to buy their way out of (pay the toll, hand over the money): not a win. */
const CONCESSION = /paid|pay|robbed|bribe|surrender|gave_?in|submit/i;

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
  for (const id of r.statOrder) {
    const d = r.stats[id];
    if (d.kind === "money" && d.narrator > 0) continue;
    // Skills and attributes grow each time a check reads them.
    const grows = (d.kind === "skill" || d.kind === "attribute") && r.growth.enabled && d.growth > 0 && rolled.has(id);
    if (!touched.has(id) && !d.perHour && d.narrator <= 0 && !grows) {
      out.push({ id: `dead:${id}`, part: "stats", text: `${d.label} never changes — no action, rule or story update touches it.`, fix: `Give the "${id}" stat a way to change: at least one action or rule that raises or lowers it, or allow the narrator to adjust it.` });
    }
  }

  // Encounters: simulate random play.
  for (const enc of Object.values(r.encounters)) {
    const sim = simulateEncounter(r, start, enc.id, 120);
    if (!sim) continue;
    // Any ending that isn't a loss went the player's way: paid off, talked down, slipped past, fled.
    const goodEnds = [...new Set([...Object.keys(enc.outcomes), ...enc.endWhen.map((e) => e.outcome)])].filter((o) => !isLoss(enc, o) && !CONCESSION.test(o));
    const wins = goodEnds.reduce((n, o) => n + (sim.outcomes[o] ?? 0), 0) / sim.runs;
    if (sim.stuck / sim.runs > 0.2) {
      out.push({ id: `enc-stuck:${enc.id}`, part: "encounters", text: `“${enc.name}” often doesn't end within 25 rounds.`, fix: `Make the "${enc.id}" encounter reliably end within about 4–10 rounds (stronger effects on foe stats or tighter end_when conditions).` });
    } else if (goodEnds.length && wins < 0.2) {
      out.push({ id: `enc-hard:${enc.id}`, part: "encounters", text: `“${enc.name}” is won or escaped only ${Math.round(wins * 100)}% of the time with random play.`, fix: `Make the "${enc.id}" encounter fairer for the player (aim for roughly half of random playthroughs ending well).` });
    } else if (goodEnds.length && wins > 0.95) {
      out.push({ id: `enc-easy:${enc.id}`, part: "encounters", text: `“${enc.name}” almost always goes the player's way — there's little risk.`, fix: `Make the "${enc.id}" encounter more dangerous (foe moves hit harder or the player's options are riskier).` });
    }
  }
  return out;
}

export function simulateEncounter(r: Ruleset, from: GameState, id: string, runs: number): { runs: number; outcomes: Record<string, number>; stuck: number; rounds: number } | null {
  const enc = r.encounters[id];
  if (!enc) return null;
  const outcomes: Record<string, number> = {};
  let stuck = 0, rounds = 0;
  const rng = seededRng(`sim:${id}`);
  for (let i = 0; i < runs; i++) {
    const s = cloneState(from);
    applyEvent(s, { t: "enc", id, foe: Object.fromEntries(enc.foe.stats.map((x) => [x.id, x.start])), src: "start" }, r);
    let ended: string | null = null;
    for (let n = 0; n < 25 && s.encounter; n++) {
      const choices = availableChoices(r, s);
      const pick = choices.length ? choices[Math.floor(rng() * choices.length)].id : null;
      const { record } = resolveTurnFull(r, s, pick ? { actionId: pick, via: "choice" } : null, { seed: `sim:${id}:${i}:${n}` });
      for (const e of record.events) {
        applyEvent(s, e, r);
        if (e.t === "enc" && !e.id) ended = e.outcome ?? "ended";
      }
      rounds++;
    }
    if (ended) outcomes[ended] = (outcomes[ended] ?? 0) + 1;
    else stuck++;
  }
  return { runs, outcomes, stuck, rounds: rounds / runs };
}
