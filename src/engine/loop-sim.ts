// The whole-loop simulator (CORE-DESIGN §2.7): N turns × M seeds of a scripted player on a ruleset, with a fake
// reader and a fake writer in place of the models. Pure engine: no backend, no model, deterministic per seed.
// Its gates are the core's quality bar; Warp Studio shows them as Warp computes them.

import { d20Odds, seededRng, type Rng } from "./dice.js";
import { DIFFICULTIES, type ActionDef, type Difficulty, type DifficultyWord, type Effect, type Ruleset, type Tier } from "./ruleset.js";
import { foldEvents, initialState, type GameState, type WarpEvent } from "./state.js";
import { applyProposal, resolveTurn, LIVE_PREFIX, TARGET_SEP, TIER_FALLBACK, type Intent, type LiveChoice, type Proposal, type TurnRecord } from "./resolve.js";
import { buildChoices, buildRecordView, outcomePacket } from "./view.js";
import { bandCrossings, tagTaper } from "./people.js";
import { applyGreeting } from "./scene.js";
import { kindOf, simulateContest, statAdd } from "./contest.js";
import { presentPeople } from "./world.js";

/** How the scripted player plays. */
export type LoopPolicy = "mixed" | "dialogue" | "greedy" | { always: string };

export interface LoopOptions {
  /** Turns per seed (default 50). */
  turns?: number;
  /** Seeds per policy (default 50). */
  seeds?: number;
  /** Base seed (default "loop"). */
  seed?: string;
  /** The tag the "always <tag>" check spams (default: the no-roll per-person tag that gives the most relationship). */
  always?: string;
  /** Contest table: runs per cell (default 2000). */
  contestRuns?: number;
}

/** One gate of the quality bar: what was measured, the bar, and whether it passes. */
export interface LoopGate { id: string; label: string; value: number; bar: string; pass: boolean }

/** Shown vs real odds of the checks that were rolled, per modifier and target. */
export interface LoopCheckRow { add: number; dc: number; shown: number; real: number; n: number }

/** One cell of the contest table: a kind, the player's modifier and the threat. */
export interface LoopContestRow { kind: string; add: number; threat: Difficulty; won: number; meanRounds: number; within: number; brokenOff: number }

export interface LoopReport {
  turns: number;
  seeds: number;
  gates: LoopGate[];
  /** Share of each tag among the greedy player's picks. */
  tagShare: Record<string, number>;
  checks: LoopCheckRow[];
  contests: LoopContestRow[];
  /** Raw counts behind the gates. */
  counts: {
    turns: number; typed: number; typedRolled: number; checks: number; failsWithoutDirection: number; crossings: number; crossingsWithoutLine: number;
    clockMisses: number; sceneMisses: number; contestsStarted: number; contestsEndedByStory: number; worstOddsGap: number; minSpread: number | null;
    mixedGain: number; alwaysGain: number; alwaysTag: string | null;
  };
  /** Every gate passes. */
  pass: boolean;
}

interface Run { policy: LoopPolicy; seed: number; s: GameState; n: number; start: GameState; baseline: Scene }
interface Scene { place: string | null; here: string[]; looks: string }

const sceneOf = (r: Ruleset, s: GameState): Scene => ({ place: s.locationName, here: presentPeople(r, s).sort(), looks: JSON.stringify(Object.fromEntries(Object.entries(s.look).map(([k, v]) => [k, [v.appearance, v.outfit]]))) });
const sameScene = (a: Scene, b: Scene) => a.place === b.place && a.here.join() === b.here.join() && a.looks === b.looks;

/** The relationship value a person's stats add up to (stats where higher is better). */
function relTotal(r: Ruleset, s: GameState): number {
  let n = 0;
  for (const rel of Object.values(s.rel)) for (const id of r.relStatOrder) if (r.relStats[id].good !== "low") n += rel[id] ?? 0;
  return n;
}

/** The no-roll per-person tag with the most relationship gain ("kind"). */
function kindTag(r: Ruleset): string | null {
  let best: string | null = null, top = 0;
  for (const [id, a] of Object.entries(r.liveChoices.tags)) {
    if (a.check || !a.perPerson) continue;
    let g = 0;
    for (const m of Object.values(a.effects.rel)) for (const v of Object.values(m)) if (typeof v === "number") g += v;
    if (g > top) { top = g; best = id; }
  }
  return best;
}

/** What a tag's effect gives in relationship, at a taper. */
function relGain(r: Ruleset, a: ActionDef, tier: Tier | null): number {
  const effects = tier ? [a.effects, a.outcomes[tier] ?? (tier === "partial" ? a.outcomes.success : tier === "crit_success" ? a.outcomes.success : tier === "crit_fail" ? a.outcomes.fail : undefined)] : [a.effects];
  let n = 0;
  for (const e of effects) if (e) for (const m of Object.values(e.rel)) for (const [stat, v] of Object.entries(m)) if (typeof v === "number" && r.relStats[stat]?.good !== "low") n += v;
  return n;
}

/** The fake writer: three tags in rotation; the ones that roll get different words (easy … hard). */
function fakeChoices(r: Ruleset, s: GameState, n: number): LiveChoice[] {
  const c = s.contest;
  if (c) {
    const kind = kindOf(r, c.kind);
    return kind.stats.slice(0, 2).map((st, i) => ({ label: `Move ${i + 1} on ${st}`, tag: `contest:${st}` }));
  }
  const tags = Object.keys(r.liveChoices.tags);
  if (!r.liveChoices.enabled || !tags.length) return [];
  const here = presentPeople(r, s);
  const out: LiveChoice[] = [];
  for (let k = 0; k < tags.length && out.length < 3; k++) {
    const tag = tags[(n + k) % tags.length];
    const a = r.liveChoices.tags[tag];
    if (a.perPerson && !here.length) continue;
    const target = a.perPerson ? here[n % here.length] : undefined;
    out.push({ label: `${tag} ${n}`, tag, ...(target ? { target } : {}), difficulty: "none" });
  }
  // The writer's rule: the moves differ in risk — one easy, one hard (and fair between).
  const checked = out.filter((c) => r.liveChoices.tags[c.tag].check);
  const words: DifficultyWord[][] = [[], ["fair"], ["easy", "hard"], ["easy", "fair", "hard"]];
  checked.forEach((c, i) => { c.difficulty = words[checked.length][i]; });
  return out;
}

/** The fake reader: deterministic story changes after each reply. */
function fakeProposal(r: Ruleset, s: GameState, n: number, rng: Rng): Proposal {
  const p: Proposal = { minutes: 5 + Math.floor(rng() * 56) };
  const here = presentPeople(r, s);
  const who = here[0] ? s.people[here[0]]?.name : undefined;
  if (who && n % 2 === 1 && r.relStatOrder.length) {
    const stat = r.relStatOrder[Math.floor(rng() * r.relStatOrder.length)];
    p.rel = { [who]: { [stat]: Math.floor(rng() * 6) - 2 } };
  }
  if (n % 15 === 14) p.goals = { new: [{ text: `Goal from turn ${n}`, ...(who ? { from: who } : {}) }] };
  if (r.style === "adventure" && n % 20 === 19 && !s.contest) {
    const kind = Object.keys(r.conflict.kinds)[0];
    if (kind) p.contest = { kind, opponent: "the rival", threat: DIFFICULTIES[Math.floor(rng() * 4)] };
  }
  if (who && n % 25 === 24) p.moments = [who];
  return p;
}

/** The player's message this turn: a click on a written choice, or typed text (dialogue, ordinary, risky). */
function playerTurn(r: Ruleset, s: GameState, run: Run, rng: Rng, alwaysTag: string | null): { intent: Intent | null; typed: boolean; live: LiveChoice[]; shown: number | null; tag: string | null } {
  const live = fakeChoices(r, s, run.n);
  const views = buildChoices(r, s, { lines: [], veils: [], live });
  const x = rng();
  const policy = run.policy;
  const click = (i: number) => {
    const c = live[i];
    const view = views.find((v) => v.id === `${LIVE_PREFIX}${i}`);
    if (!c || !view) return null;
    const intent: Intent = { actionId: `${LIVE_PREFIX}${c.tag}${c.target ? `${TARGET_SEP}${c.target}` : ""}`, via: "choice", label: c.label, ...(c.difficulty ? { params: { difficulty: c.difficulty } } : {}) };
    return { intent, typed: false, live, shown: view.odds, tag: c.tag };
  };
  if (s.contest) {
    if (policy === "dialogue" || x >= 0.4) return { intent: null, typed: true, live, shown: null, tag: null };
    return click(Math.floor(rng() * live.length)) ?? { intent: null, typed: true, live, shown: null, tag: null };
  }
  if (typeof policy === "object") {
    const tag = alwaysTag && r.liveChoices.tags[alwaysTag] ? alwaysTag : null;
    const here = presentPeople(r, s);
    if (tag) {
      const a = r.liveChoices.tags[tag];
      const target = a.perPerson ? here[0] : undefined;
      if (!a.perPerson || target) return { intent: { actionId: `${LIVE_PREFIX}${tag}${target ? `${TARGET_SEP}${target}` : ""}`, via: "choice", label: tag, params: { difficulty: a.check ? "fair" : "none" } }, typed: false, live, shown: null, tag };
    }
  }
  if (policy === "greedy") {
    // The best expected relationship gain among what's offered (the taper counts; it's in the writer's note).
    let best = -1, top = -Infinity;
    live.forEach((c, i) => {
      const a = r.liveChoices.tags[c.tag];
      const view = views.find((v) => v.id === `${LIVE_PREFIX}${i}`);
      if (!a || !view) return;
      let g: number;
      if (a.check && c.difficulty !== "none" && view.odds !== null) {
        const p = view.odds, part = view.partialOdds ?? 0;
        g = p * relGain(r, a, "success") + part * relGain(r, a, "partial") + (1 - p - part) * relGain(r, a, "fail");
      } else g = relGain(r, a, null);
      const pos = Math.max(0, g) * tagTaper(r, s, c.tag, c.target) + Math.min(0, g);
      // Ties go either way (a greedy player has no favourite among equals).
      if (pos > top + 1e-9 || (Math.abs(pos - top) <= 1e-9 && rng() < 0.5)) { top = pos; best = i; }
    });
    if (best >= 0) { const out = click(best); if (out) return out; }
  }
  const [pClick, pDialogue, pOrdinary] = policy === "dialogue" ? [0, 0.6, 0.25] : [0.4, 0.3, 0.15];
  if (x < pClick && live.length) { const out = click(Math.floor(rng() * live.length)); if (out) return out; }
  if (x < pClick + pDialogue + pOrdinary || r.style === "story" || !r.checks.typed || !r.checks.stats.length) return { intent: null, typed: true, live, shown: null, tag: null };
  // A risky typed action: the read picks a stat and a difficulty, and it rolls.
  const stat = r.checks.stats[Math.floor(rng() * r.checks.stats.length)];
  const difficulty = DIFFICULTIES[Math.floor(rng() * 4)];
  return { intent: { actionId: `try:${stat}`, params: { difficulty }, via: "adjudicator" }, typed: true, live, shown: null, tag: null };
}

const timeOf = (e: Effect | undefined) => e?.time ?? 0;

/** Minutes the `time:` effects of a move add: its cost, its effects, and the outcome of the tier it rolled. */
function effectMinutes(a: ActionDef | undefined, rec: TurnRecord, rolled: boolean): number {
  if (!a) return 0;
  const tier = rolled && a.check ? rec.check?.tier : undefined;
  const key = tier ? TIER_FALLBACK[tier].find((t) => a.outcomes[t]) : undefined;
  return timeOf(a.cost) + timeOf(a.effects) + (key ? timeOf(a.outcomes[key]) : 0);
}

/** Minutes the rules' `time:` effects add through triggers that fired this turn (on turning true, or every turn). */
function triggerMinutes(r: Ruleset, rec: TurnRecord, told: WarpEvent[], mid: GameState): number {
  let n = 0;
  const turnedOn = new Set([...rec.events, ...told].filter((e): e is Extract<WarpEvent, { t: "trig" }> => e.t === "trig" && e.v).map((e) => e.id));
  for (const t of r.triggers) {
    if (!timeOf(t.effects)) continue;
    if (turnedOn.has(t.id) || (t.repeat && mid.triggers[t.id] === true)) n += timeOf(t.effects);
  }
  return n;
}

/**
 * The minutes a turn should take by the rules (the clock gate's own model): the move's time, the `time:` effects
 * the rules applied (the move's and the triggers'), and the story's minutes up to the cap.
 */
function expectedMinutes(r: Ruleset, before: GameState, intent: Intent | null, story: number, rec: TurnRecord, told: WarpEvent[], mid: GameState): number {
  if (!r.clock.enabled) return 0;
  let action = 0;
  if (before.contest) action = 1;
  else if (intent?.actionId.startsWith("try:")) action = (r.checks.time ?? r.clock.minutesPerAction) + timeOf(rec.check ? r.checks.outcomes[TIER_FALLBACK[rec.check.tier].find((t) => r.checks.outcomes[t]) ?? rec.check.tier] : undefined);
  else if (intent?.actionId.startsWith(LIVE_PREFIX)) {
    const a = r.liveChoices.tags[intent.actionId.slice(LIVE_PREFIX.length).split(TARGET_SEP)[0]];
    action = (a?.time ?? r.clock.minutesPerAction) + effectMinutes(a, rec, intent.params?.difficulty !== "none");
  }
  return action + triggerMinutes(r, rec, told, mid) + Math.min(story, r.clock.narratorMax);
}

/**
 * The simulator, in chunks: `run(turns)` plays that many more turns (over all policies and seeds) and returns true
 * when everything is done; `progress` is 0–1; `report()` works at any point (on what has run so far).
 */
export function createLoopSim(r: Ruleset, opts: LoopOptions = {}): { run(turns: number): boolean; readonly progress: number; report(): LoopReport } {
  const N = Math.max(1, Math.round(opts.turns ?? 50));
  const M = Math.max(1, Math.round(opts.seeds ?? 50));
  const base = opts.seed ?? "loop";
  const alwaysTag = opts.always ?? kindTag(r);
  const policies: LoopPolicy[] = ["mixed", "dialogue", "greedy", ...(alwaysTag ? [{ always: alwaysTag }] : [])];
  const total = policies.length * M * N;
  let done = 0;
  const c = {
    turns: 0, typed: 0, typedRolled: 0, checks: 0, failsWithoutDirection: 0, crossings: 0, crossingsWithoutLine: 0,
    clockMisses: 0, sceneMisses: 0, contestsStarted: 0, contestsEndedByStory: 0, worstOddsGap: 0, minSpread: null as number | null,
    mixedGain: 0, alwaysGain: 0,
  };
  const dialogue = { typed: 0, rolled: 0 };
  const picks: Record<string, number> = {};
  const buckets = new Map<string, LoopCheckRow & { ok: number }>();
  const gains = { mixed: [] as number[], always: [] as number[] };
  let run: Run | null = null;
  let pi = 0, mi = 0;

  const begin = (policy: LoopPolicy, m: number): Run => {
    let s = initialState(r);
    // The greeting: a time, a place, the first tracked person here (or someone new), and first looks.
    const first = Object.values(r.people)[0]?.name ?? (r.peopleOpen ? "Robin" : undefined);
    s = foldEvents(r, [applyGreeting(r, s, { time: { hour: 19 }, place: "The Square", present: first ? [first] : [], you: { outfit: "a coat" }, people: first ? { [first]: { outfit: "a scarf" } } : {}, adults: first ? { [first]: true } : {} })], s);
    return { policy, seed: m, s, n: 0, start: s, baseline: sceneOf(r, s) };
  };

  const step = (run: Run) => {
    const tag = typeof run.policy === "object" ? `always-${run.policy.always}` : run.policy;
    const rng = seededRng(`${base}:${tag}:${run.seed}:${run.n}`);
    const before = run.s;
    const move = playerTurn(r, before, run, rng, alwaysTag);
    const rec = resolveTurn(r, before, move.intent, { seed: `${base}:${tag}:${run.seed}:${run.n}:dice` });
    const mid = foldEvents(r, [rec.events], before);
    const proposal = fakeProposal(r, mid, run.n, rng);
    const told = applyProposal(r, mid, proposal);
    const after = foldEvents(r, [told], mid);
    const whole: TurnRecord = { ...rec, events: [...rec.events, ...told] };
    c.turns++;
    // The clock: exactly the rules' minutes, no drift.
    if (after.minutes - before.minutes !== expectedMinutes(r, before, move.intent, proposal.minutes ?? 0, rec, told, mid)) c.clockMisses++;
    // The scene holds unless the reader changed it (this reader never does).
    if (!sameScene(sceneOf(r, after), run.baseline)) c.sceneMisses++;
    // Typed messages: how many rolled.
    if (move.typed) { c.typed++; if (rec.check) c.typedRolled++; if (run.policy === "dialogue") { dialogue.typed++; if (rec.check) dialogue.rolled++; } }
    if (rec.check) {
      c.checks++;
      const real = d20Odds(rec.check.add, rec.check.target ?? 0, 0).success;
      if (move.shown !== null) c.worstOddsGap = Math.max(c.worstOddsGap, Math.abs(move.shown - real));
      const key = `${rec.check.add}|${rec.check.target}`;
      const b = buckets.get(key) ?? { add: rec.check.add, dc: rec.check.target ?? 0, shown: real, real: 0, n: 0, ok: 0 };
      b.n++;
      if (rec.check.tier === "success" || rec.check.tier === "crit_success") b.ok++;
      buckets.set(key, b);
      if (rec.check.tier === "partial" || rec.check.tier === "fail" || rec.check.tier === "crit_fail") {
        const packet = outcomePacket(r, rec, before, mid, "Sam") ?? "";
        if (!packet.includes("Direction:") && !rec.beats) c.failsWithoutDirection++;
      }
    }
    // Live-choice odds differ by the written word.
    const checked = buildChoices(r, before, { lines: [], veils: [], live: move.live }).filter((v) => v.id.startsWith(LIVE_PREFIX) && v.odds !== null && v.difficulty && v.difficulty !== "none");
    if (!before.contest && new Set(checked.map((v) => v.difficulty)).size >= 2) {
      const spread = Math.max(...checked.map((v) => v.odds!)) - Math.min(...checked.map((v) => v.odds!));
      c.minSpread = c.minSpread === null ? spread : Math.min(c.minSpread, spread);
    }
    if (move.tag && run.policy === "greedy" && !before.contest) picks[move.tag] = (picks[move.tag] ?? 0) + 1;
    // A band crossing always has its line in the same record.
    const crossings = bandCrossings(r, before, after);
    if (crossings.length) {
      c.crossings += crossings.length;
      if (!buildRecordView(r, "m", 0, whole, before, after).lines.length) c.crossingsWithoutLine++;
    }
    if (told.some((e) => e.t === "contest")) c.contestsStarted++;
    if (told.some((e: WarpEvent) => e.t === "contest_end")) c.contestsEndedByStory++;
    run.s = after;
    run.n++;
  };

  const finishRun = (run: Run) => {
    const g = relTotal(r, run.s) - relTotal(r, run.start);
    if (run.policy === "mixed") gains.mixed.push(g);
    if (typeof run.policy === "object") gains.always.push(g);
  };

  const sim = {
    get progress() { return total ? done / total : 1; },
    run(turns: number): boolean {
      let left = Math.max(1, Math.floor(turns));
      while (left > 0 && pi < policies.length) {
        if (!run) run = begin(policies[pi], mi);
        step(run);
        done++;
        left--;
        if (run.n >= N) {
          finishRun(run);
          run = null;
          if (++mi >= M) { mi = 0; pi++; }
        }
      }
      return pi >= policies.length;
    },
    report(): LoopReport {
      const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
      c.mixedGain = avg(gains.mixed);
      c.alwaysGain = avg(gains.always);
      const pickTotal = Object.values(picks).reduce((a, b) => a + b, 0);
      const tagShare = Object.fromEntries(Object.entries(picks).map(([k, v]) => [k, v / pickTotal]));
      const checks = [...buckets.values()].map(({ ok, ...row }) => ({ ...row, real: ok / row.n })).sort((a, b) => a.dc - b.dc || a.add - b.add);
      const contests: LoopContestRow[] = [];
      if (r.style === "adventure") for (const kind of Object.keys(r.conflict.kinds)) for (let add = 0; add <= 6; add++) for (const threat of DIFFICULTIES) {
        const sim = simulateContest(r, kind, add, threat, opts.contestRuns ?? 2000, base);
        contests.push({ kind, add, threat, won: sim.won, meanRounds: sim.meanRounds, within: sim.within, brokenOff: sim.brokenOff });
      }
      const gates: LoopGate[] = [
        { id: "clock", label: "The clock is the start plus every move's minutes, the rules' time: effects and the story's (capped) minutes", value: c.clockMisses, bar: "= 0 turns off", pass: c.clockMisses === 0 },
        { id: "scene", label: "Place, who is here and looks change only when the story or a move changes them", value: c.sceneMisses, bar: "= 0 turns off", pass: c.sceneMisses === 0 },
        { id: "crossing-lines", label: "Band crossings without a line in the same record", value: c.crossingsWithoutLine, bar: "= 0", pass: c.crossingsWithoutLine === 0 },
        { id: "story-ends-contest", label: "Contests the story ended", value: c.contestsEndedByStory, bar: "= 0", pass: c.contestsEndedByStory === 0 },
      ];
      if (r.style === "adventure") {
        const typedShare = dialogue.typed ? dialogue.rolled / dialogue.typed : 0;
        gates.push(
          { id: "odds-shown-real", label: "Shown odds vs the real odds of the check that was rolled", value: c.worstOddsGap, bar: "≤ 0.02", pass: c.worstOddsGap <= 0.02 },
          { id: "typed-rolls", label: "Typed messages that rolled, in a dialogue-heavy chat", value: typedShare, bar: "≤ 1/3", pass: typedShare <= 1 / 3 },
          { id: "fail-direction", label: "Partial, failed and critically failed checks without a direction", value: c.failsWithoutDirection, bar: "= 0", pass: c.failsWithoutDirection === 0 },
          { id: "odds-spread", label: "Odds spread of the written choices (easy … hard)", value: c.minSpread ?? 0, bar: "≥ 0.20", pass: c.minSpread === null || c.minSpread >= 0.2 },
        );
        if (contests.length) {
          const mean = contests.map((x) => x.meanRounds), within = contests.map((x) => x.within), broke = contests.map((x) => x.brokenOff);
          gates.push(
            { id: "contest-rounds", label: "Contest mean rounds, every kind × add 0–6 × threat", value: Math.max(...mean), bar: "3–6 in every cell", pass: mean.every((m) => m >= 3 && m <= 6) },
            { id: "contest-3-6", label: "Share of contests that end in 3–6 rounds (worst cell)", value: Math.min(...within), bar: "≥ 0.80", pass: within.every((w) => w >= 0.8) },
            { id: "contest-break-off", label: "Share of contests that break off at the last round (worst cell)", value: Math.max(...broke), bar: "≤ 0.05", pass: broke.every((b) => b <= 0.05) },
          );
        }
      }
      if (pickTotal) {
        const top = Math.max(...Object.values(tagShare));
        gates.push({ id: "greedy-tag-share", label: "Share of one tag in a greedy player's picks", value: top, bar: "≤ 0.50", pass: top <= 0.5 });
      }
      if (alwaysTag && gains.always.length) {
        const ratio = c.mixedGain > 0 ? c.alwaysGain / c.mixedGain : c.alwaysGain > 0 ? Infinity : 0;
        gates.push({ id: "always-kind", label: `Relationship gain of always "${alwaysTag}" vs a mixed player`, value: ratio, bar: "≤ 1.5", pass: ratio <= 1.5 });
      }
      return {
        turns: N, seeds: M, gates, tagShare, checks, contests,
        counts: { ...c, alwaysTag },
        pass: gates.every((g) => g.pass),
      };
    },
  };
  return sim;
}

/** Run the whole simulator at once. */
export function runLoopSim(r: Ruleset, opts: LoopOptions = {}): LoopReport {
  const sim = createLoopSim(r, opts);
  while (!sim.run(1000)) { /* keep going */ }
  return sim.report();
}

export { simulateContest, statAdd };
