// Playtesting an encounter by the rules alone: many seeds, a few simple
// strategies, and what happens — who wins, how long it takes, how often a round
// changes nothing. The builder uses it to tune encounters before anyone plays them.

import { availableChoices, buildTurn, encounterStartEvents, resolveTurn, usableAbilities, usableItems } from "./resolve.js";
import type { Ruleset } from "./ruleset.js";
import { applyEvent, cloneState, initialState, statMax, type GameState } from "./state.js";
import type { Value } from "./expr.js";
import { tallyKinds, type KindTally } from "./outcomes.js";

export interface PolicyResult {
  policy: string;
  runs: number;
  outcomes: Record<string, number>;
  medianRounds: number;
  p90Rounds: number;
  /** Share of rounds where nothing moved toward the goal. */
  stalled: number;
  /** Runs that hit the round limit without ending. */
  unfinished: number;
  meanRounds?: number;
  /** The endings tallied as won / escaped / conceded / lost (same classifier as the checker and quests). */
  kinds: KindTally;
}

export interface EncounterSim { id: string; name: string; policies: PolicyResult[]; notes: string[] }

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

/** Play `id` from the ruleset's start (or `from`) under each strategy: always one move, or a random mix. */
export function simulateEncounter(r: Ruleset, id: string, opts: { runs?: number; maxRounds?: number; from?: GameState; randomOnly?: boolean } = {}): EncounterSim | null {
  const enc = r.encounters[id];
  if (!enc) return null;
  const runs = opts.runs ?? 120, maxRounds = opts.maxRounds ?? 40;
  if (opts.from?.encounter && opts.from.encounter.id !== id) return null;
  const begin = (seed: string) => {
    const s = cloneState(opts.from ?? initialState(r));
    if (!s.encounter) for (const event of encounterStartEvents(r, s, id, seed)) applyEvent(s, event, r);
    return s;
  };
  const policies: { name: string; pick: (s: GameState, rng: () => number) => string | null }[] = [];
  const moves = (s: GameState) => [
    ...availableChoices(r, s).filter((choice) => !choice.a.hidden).map((choice) => choice.id),
    ...usableItems(r, s).filter((u) => !u.locked).map((u) => u.id),
    ...usableAbilities(r, s).filter((u) => !u.status.locked && !u.a.hidden).map((u) => u.id),
  ];
  if (!opts.randomOnly) for (const a of enc.actionOrder.filter((a) => !enc.actions[a].hidden)) policies.push({ name: `always ${enc.actions[a].label}`, pick: (s) => (moves(s).includes(a) ? a : moves(s)[0] ?? null) });
  policies.push({ name: "a random mix", pick: (s, rng) => { const m = moves(s); return m.length ? m[Math.floor(rng() * m.length)] : null; } });

  const out: PolicyResult[] = [];
  for (const pol of policies) {
    const outcomes: Record<string, number> = {};
    const lengths: number[] = [];
    let rounds = 0, still = 0, unfinished = 0;
    for (let i = 0; i < runs; i++) {
      let s = begin(`sim:${id}:start:${i}`);
      let rng = mulberry(i + 1);
      let n = 0;
      while (s.encounter && n < maxRounds) {
        const pick = pol.pick(s, rng);
        const rec = resolveTurn(r, s, pick ? { actionId: pick, via: "choice" } : null, { seed: `sim:${pol.name}:${i}:${n}` });
        const next = cloneState(s);
        for (const e of rec.events) applyEvent(next, e, r);
        // Flags, conditions and player meters can also satisfy an ending gate.
        // Clock/turn counters alone do not count as progress.
        const progress = (x: GameState) => JSON.stringify([x.stats, x.flags, x.conditions, x.items, x.encounter && { ...x.encounter, round: 0 }]);
        const moved = opts.randomOnly || progress(s) !== progress(next);
        if (!moved) still++;
        rounds++; n++;
        const end = rec.events.find((e) => e.t === "enc" && e.id === null) as { outcome?: string } | undefined;
        if (end) outcomes[end.outcome ?? "ended"] = (outcomes[end.outcome ?? "ended"] ?? 0) + 1;
        s = next;
        rng = mulberry(i * 7919 + n);
      }
      if (s.encounter) unfinished++;
      lengths.push(n);
    }
    out.push({ policy: pol.name, runs, outcomes, kinds: tallyKinds(enc, outcomes), medianRounds: quantile(lengths, 0.5), meanRounds: lengths.reduce((a, b) => a + b, 0) / Math.max(1, runs), p90Rounds: quantile(lengths, 0.9), stalled: rounds ? still / rounds : 0, unfinished });
  }
  const notes: string[] = [];
  for (const p of out) {
    const total = Object.values(p.outcomes).reduce((a, b) => a + b, 0) || 1;
    const best = Object.entries(p.outcomes).sort((a, b) => b[1] - a[1])[0];
    if (p.unfinished > p.runs * 0.1) notes.push(`"${p.policy}" often never ends (${p.unfinished}/${p.runs} runs hit ${maxRounds} rounds) — give it a way to finish.`);
    if (best && best[1] / total > 0.97 && p.policy !== "a random mix") notes.push(`"${p.policy}" almost always ends "${best[0]}" — a guaranteed result isn't a choice.`);
    if (p.stalled > 0.6) notes.push(`"${p.policy}" changes nothing in ${Math.round(p.stalled * 100)}% of rounds — failures should still move something.`);
    if (p.p90Rounds > 12) notes.push(`"${p.policy}" drags on (1 in 10 runs take ${p.p90Rounds}+ rounds).`);
    if (p.policy === "a random mix" && Object.values(enc.outcomeKinds ?? {}).includes("won") && p.kinds.escaped >= p.runs * 0.3 && p.kinds.won < p.runs * 0.2) notes.push(`"${p.policy}" mostly gets out (escaped ${Math.round((p.kinds.escaped / p.runs) * 100)}%) but rarely wins (${Math.round((p.kinds.won / p.runs) * 100)}%) — fleeing isn't beating it.`);
  }
  return { id, name: enc.name, policies: out, notes };
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shares of runs, as "won 40% · escaped 10% · conceded 0% · lost 50%" (plus unfinished when any). */
export function kindsLine(k: KindTally, runs: number, unfinished = 0): string {
  const pct = (n: number) => `${Math.round((n / Math.max(1, runs)) * 100)}%`;
  return `won ${pct(k.won)} · escaped ${pct(k.escaped)} · conceded ${pct(k.conceded)} · lost ${pct(k.lost)}${unfinished ? ` · unfinished ${pct(unfinished)}` : ""}`;
}

/** The simulation as a few readable lines. */
export function describeSim(sim: EncounterSim): string {
  const lines = sim.policies.map((p) => {
    const outs = Object.entries(p.outcomes).sort((a, b) => b[1] - a[1]).map(([o, n]) => `${o} ${Math.round((n / p.runs) * 100)}%`).join(", ") || "never ends";
    return `- ${p.policy}: ${kindsLine(p.kinds, p.runs, p.unfinished)} (${outs}) · median ${p.medianRounds} rounds (p90 ${p.p90Rounds}) · ${Math.round(p.stalled * 100)}% of rounds change nothing`;
  });
  return [`${sim.name} — ${sim.policies[0]?.runs ?? 0} runs per strategy:`, ...lines, ...(sim.notes.length ? ["Notes:", ...sim.notes.map((n) => `- ${n}`)] : [])].join("\n");
}

// ───────────────────────── simulating from a chosen state ─────────────────────────

/**
 * A state to simulate from, written over the rulebook's start: stats (a number, or "max"/"min"),
 * flags, items (counts), the location, conditions, relationship stats, perks and worn clothing.
 * Triggers then run once, as after any turn, so values derived from these (gear ATK, caps) settle.
 */
export interface StatePatch {
  stats?: Record<string, number | string>;
  flags?: Record<string, Value>;
  items?: Record<string, number>;
  location?: string;
  /** Status ids (until cured), or id → minutes (null = until cured). */
  conditions?: string[] | Record<string, number | null>;
  /** person → stat → value. */
  rel?: Record<string, Record<string, number>>;
  perks?: string[];
  /** slot → item, or items to put on in their own slots. */
  wear?: Record<string, string> | string[];
  /** Run triggers after patching (default true). */
  triggers?: boolean;
}

/** Apply a patch to the starting state (or `base`); unknown names come back as notes instead of failing. */
export function patchedState(r: Ruleset, patch: StatePatch, base?: GameState): { state: GameState; notes: string[] } {
  const notes: string[] = [];
  const s0 = cloneState(base ?? initialState(r));
  const src = "manual" as const;
  const events = buildTurn(r, s0, "sim:patch", (t) => {
    const setStats = () => {
      for (const [id, v] of Object.entries(patch.stats ?? {})) {
        const def = r.stats[id];
        if (!def) continue;
        const word = typeof v === "string" ? v.trim().toLowerCase() : "";
        const n = word === "max" ? statMax(r, def, t.s) : word === "min" ? def.min : Number(v);
        if (Number.isFinite(n)) t.push({ t: "stat", id, set: n, src });
      }
    };
    for (const [id, v] of Object.entries(patch.stats ?? {})) {
      if (!r.stats[id]) notes.push(`stats: "${id}" isn't a stat`);
      else if (!(typeof v === "number" || (typeof v === "string" && /^(max|min)$/i.test(v.trim())) || Number.isFinite(Number(v)))) notes.push(`stats: ${id} = ${JSON.stringify(v)} — use a number, "max" or "min"`);
    }
    // Twice: caps that are formulas ("100 + level * 10") see the other new values the second time.
    setStats(); setStats();
    for (const [k, v] of Object.entries(patch.flags ?? {})) t.push({ t: "flag", key: k, v, src });
    for (const [id, n] of Object.entries(patch.items ?? {})) {
      if (!r.items[id] && !r.itemsOpen) { notes.push(`items: "${id}" isn't an item`); continue; }
      const d = Math.round(Number(n)) - (t.s.items[id] ?? 0);
      if (!Number.isFinite(d)) { notes.push(`items: ${id} needs a count`); continue; }
      if (d) t.push({ t: "item", id, d, src });
    }
    if (patch.location !== undefined) {
      if (r.locations[patch.location]) t.push({ t: "move", to: patch.location, src });
      else notes.push(`location: "${patch.location}" isn't a place`);
    }
    const conds: [string, number | null][] = Array.isArray(patch.conditions) ? patch.conditions.map((c) => [c, null]) : Object.entries(patch.conditions ?? {});
    for (const [id, mins] of conds) {
      if (!r.conditions[id]) { notes.push(`conditions: "${id}" isn't a status`); continue; }
      t.push({ t: "cond", id, on: true, until: mins === null || mins === undefined ? null : t.s.minutes + Number(mins), src });
    }
    for (const [who, m] of Object.entries(patch.rel ?? {})) {
      if (!r.people[who] && !t.s.people[who]) { notes.push(`rel: "${who}" isn't a person`); continue; }
      for (const [stat, v] of Object.entries(m ?? {})) {
        if (!r.relStats[stat]) { notes.push(`rel: "${stat}" isn't a relationship stat`); continue; }
        t.push({ t: "rel", who, stat, set: Number(v), src });
      }
    }
    for (const id of patch.perks ?? []) {
      const perk = r.perks[id];
      if (!perk) { notes.push(`perks: "${id}" isn't a perk`); continue; }
      if (t.s.perks[id]) continue;
      t.push({ t: "perk", id, src });
      t.apply(perk.effects, src);
    }
    const wear: [string | null, string][] = Array.isArray(patch.wear) ? patch.wear.map((it) => [null, it]) : Object.entries(patch.wear ?? {});
    for (const [slot, item] of wear) {
      const def = r.items[item];
      const at = slot ?? def?.slot ?? null;
      if (!def || !at) { notes.push(`wear: "${item}" isn't clothing with a slot`); continue; }
      if (!t.s.items[item]) t.push({ t: "item", id: item, d: 1, src });
      t.push({ t: "wear", slot: at, item, src });
    }
  });
  const state = cloneState(s0);
  for (const e of events) {
    // Triggers run inside buildTurn; leave out what they did when asked to.
    if (patch.triggers === false && e.src === "trigger") continue;
    applyEvent(state, e, r);
  }
  return { state, notes };
}
