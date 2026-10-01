// Seeded policy simulations, invariants and replay timing. No host or provider is needed.
import assert from "node:assert/strict";
import { compileRuleset } from "../src/engine/loader.js";
import { TEMPLATES } from "../src/engine/templates/index.js";
import { applyEvent, initialState, makeEnv, statMax, type GameState } from "../src/engine/state.js";
import { availableChoices, odds, paramValues, resolveTurnFull, travelTargets, type Intent } from "../src/engine/resolve.js";
import { checkStats } from "../src/engine/freeform.js";
import { evalNumber } from "../src/engine/expr.js";
import { seededRng } from "../src/engine/dice.js";
import { fingerprint } from "../src/engine/fingerprint.js";
import { validEvent } from "../src/engine/event-codec.js";
import { foldPath, newPlaythrough, type Msg } from "../src/backend/ledger.js";
import type { ActionDef, Effect, Ruleset } from "../src/engine/ruleset.js";
import { dateMoves } from "../src/engine/date/talk.js";
import { activeSession } from "../src/engine/date/talk.js";
import { workMoves } from "../src/engine/work.js";

globalThis.fetch = (() => { throw new Error("Network calls are forbidden in the offline harness"); }) as unknown as typeof fetch;
const args = process.argv.slice(2);
function numberArg(name: string, fallback: number, max: number): number {
  const i = args.indexOf(name), n = i < 0 ? fallback : Number(args[i + 1]);
  assert(Number.isInteger(n) && n > 0 && n <= max, `${name} must be 1..${max}`); return n;
}
const turns = numberArg("--turns", 240, 5000), seeds = numberArg("--seeds", 4, 100);
type Policy = "random" | "earn" | "survive" | "train" | "repeat";
const policies: Policy[] = ["random", "earn", "survive", "train", "repeat"];

function scoreEffect(r: Ruleset, s: GameState, a: ActionDef, effect: Effect, policy: Policy): number {
  let score = 0; const env = makeEnv(r, s, paramValues(a));
  for (const id of r.statOrder) {
    const def = r.stats[id], range = Math.max(1, statMax(r, def, s) - def.min);
    const raw = evalNumber(effect.stats[id], env, 0) + (effect.set[id] !== undefined ? evalNumber(effect.set[id], env, s.stats[id]) - s.stats[id] : 0);
    const delta = Math.max(def.min, Math.min(statMax(r, def, s), s.stats[id] + raw)) - s.stats[id];
    if (policy === "earn" && def.kind === "money") score += delta;
    if (policy === "train" && ["skill", "attribute"].includes(def.kind)) score += delta / range;
    if (policy === "repeat" && def.kind === "money") score += delta;
    if (policy === "survive" && def.good !== "none" && !["skill", "attribute", "money"].includes(def.kind)) {
      const direction = def.good === "high" ? 1 : -1;
      const quality = direction > 0 ? (s.stats[id] - def.min) / range : (statMax(r, def, s) - s.stats[id]) / range;
      score += direction * delta / range * (1 + 10 * (1 - quality));
    }
  }
  return score;
}
function actionScore(r: Ruleset, s: GameState, a: ActionDef, policy: Policy): number {
  let score = scoreEffect(r, s, a, a.cost, policy);
  if (!a.check) score += scoreEffect(r, s, a, a.effects, policy);
  else {
    const p = odds(r, s, a)!;
    score += p.success * scoreEffect(r, s, a, a.outcomes.success ?? a.outcomes.crit_success ?? a.effects, policy);
    score += p.partial * scoreEffect(r, s, a, a.outcomes.partial ?? a.outcomes.success ?? a.effects, policy);
    score += (1 - p.success - p.partial) * scoreEffect(r, s, a, a.outcomes.fail ?? a.outcomes.crit_fail ?? a.effects, policy);
    if (policy === "train") score += checkStats(r, a).length / 100;
  }
  return score / Math.max(1, a.time ?? r.clock.minutesPerAction);
}
function invariants(r: Ruleset, s: GameState) {
  for (const id of r.statOrder) { assert(Number.isFinite(s.stats[id]), `non-finite ${id}`); assert(s.stats[id] >= r.stats[id].min - 1e-8 && s.stats[id] <= statMax(r, r.stats[id], s) + 1e-8, `invalid cap ${id}`); }
  for (const id of Object.values(s.worn)) assert(s.items[id] > 0, `unowned clothing ${id}`);
  if (s.encounter) assert(r.encounters[s.encounter.id], "unknown encounter");
  assert(Number.isFinite(s.minutes) && s.minutes >= 0, "invalid clock");
}
const summaries: unknown[] = [];
for (const template of TEMPLATES) {
  const loaded = compileRuleset(template.parts.map((p, i) => ({ label: p.label, content: p.yaml, order: i })));
  assert(loaded.ruleset && !loaded.issues.some((i) => i.level === "error"), `${template.id} cannot compile`);
  const r = loaded.ruleset;
  for (const policy of policies) {
    const runs: unknown[] = [];
    for (let seed = 0; seed < seeds; seed++) {
      const rng = seededRng(`${template.id}:${policy}:${seed}`), s = initialState(r), initial = initialState(r), counts: Record<string, number> = {};
      let digest = "start", ended = 0, weightedFallbacks = 0, rejected = 0, preferred: string | null = null;
      for (let turn = 0; turn < turns; turn++) {
        const candidates = availableChoices(r, s).map((c) => ({ id: c.id, score: policy === "random" ? 0 : actionScore(r, s, c.a, policy) }));
        const travel = travelTargets(r, s).map((id) => ({ id: `go:${id}`, score: 0 }));
        const sessions = [...dateMoves(r, s, []), ...workMoves(r, s)].map((m) => ({ id: m.id, score: 0 }));
        const inSession = !!activeSession(r, s) || !!s.job;
        const pool = inSession ? sessions : [...candidates, ...travel, ...sessions];
        let selected: string | null = null;
        if (s.ended) { ended++; selected = s.ended.told ? null : "run:epilogue"; }
        else if (pool.length) {
          const best = Math.max(...pool.map((c) => c.score));
          if (policy === "repeat" && preferred && pool.some((c) => c.id === preferred)) selected = preferred;
          else {
            const options = policy === "random" ? pool : best > 0 ? pool.filter((c) => c.score === best) : travel.length && !inSession ? travel : pool;
            selected = options[Math.floor(rng() * options.length)].id;
            if (policy === "repeat" && best > 0 && !preferred) preferred = selected;
          }
        }
        const intent: Intent | null = selected ? { actionId: selected, via: "choice" } : null;
        const resolution = resolveTurnFull(r, s, intent, { seed: `${template.id}:${policy}:${seed}:${turn}` });
        assert(resolution.record.events.every(validEvent), "engine generated an invalid event");
        rejected += resolution.record.rejected?.length ?? 0;
        weightedFallbacks += resolution.record.decisions?.filter((d) => d.source === "weights").length ?? 0;
        resolution.record.events.forEach((e) => applyEvent(s, e, r)); invariants(r, s);
        if (selected) counts[selected] = (counts[selected] ?? 0) + 1;
        digest = fingerprint([digest, resolution.record.events, resolution.record.check, resolution.record.decisions]);
      }
      assert.equal(rejected, 0, "policy selected an invalid action");
      runs.push({ seed, digest, turns: s.turn, days: (s.minutes - initial.minutes) / 1440, ending: s.ended?.id ?? null, endingTurns: ended, weightedFallbacks,
        money: r.hud.money ? s.stats[r.hud.money] : null, stats: s.stats, skillGrowth: Object.fromEntries(r.statOrder.filter((id) => ["skill", "attribute"].includes(r.stats[id].kind)).map((id) => [id, s.stats[id] - initial.stats[id]])),
        commonActions: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5) });
    }
    summaries.push({ template: template.id, policy, runs });
  }
}

// A representative large cast: compare cold replay, a cache hit, and a one-message append.
const replayRules = compileRuleset([{ label: "benchmark", content: "stats: { score: { start: 0, max: 100000 } }\nrelationships:\n  stats: { trust: {} }\n  people:\n" + Array.from({ length: 50 }, (_, i) => `    person_${i}: { name: Person ${i} }`).join("\n"), order: 0 }]).ruleset!;
const history = Array.from({ length: 10_000 }, (_, i) => ({ id: `benchmark-${i}`, chat_id: "harness-benchmark", index_in_chat: i, content: `Turn ${i}`, is_user: false, swipe_id: 0,
  metadata: { warp: { ...(i === 0 ? { playthrough: newPlaythrough(replayRules) } : {}), swipes: { "0": { v: 1, events: [{ t: "stat", id: "score", d: 1, src: "action" }], hints: [], at: i } } } } } as unknown as Msg));
function measured() { const t = performance.now(), result = foldPath(replayRules, history); assert.equal(result.state.stats.score, history.length); assert(result.steps.length <= 60); return performance.now() - t; }
const coldMs = measured(), warmMs = measured();
history.push({ ...history[history.length - 1], id: "benchmark-append", index_in_chat: history.length });
const appendMs = measured();
const report = { offline: true, configuration: { turns, seeds, policies }, summaries, replay: { messages: 10_000, people: 50, coldMs, warmMs, appendMs, retainedSteps: 60 } };
const output = args.indexOf("--json");
if (output >= 0) { assert(args[output + 1], "--json needs a path"); await Bun.write(args[output + 1], JSON.stringify(report, null, 2)); }
console.log(JSON.stringify(report, null, 2));
