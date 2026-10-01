// Playtesting an encounter by the rules alone: many seeds, a few simple
// strategies, and what happens — who wins, how long it takes, how often a round
// changes nothing. The builder uses it to tune encounters before anyone plays them.

import { actionPool, isAvailable, resolveTurn, usableItems } from "./resolve.js";
import type { Ruleset } from "./ruleset.js";
import { applyEvent, cloneState, initialState, type GameState } from "./state.js";

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
}

export interface EncounterSim { id: string; name: string; policies: PolicyResult[]; notes: string[] }

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

/** Play `id` from the ruleset's start (or `from`) under each strategy: always one move, or a random mix. */
export function simulateEncounter(r: Ruleset, id: string, opts: { runs?: number; maxRounds?: number; from?: GameState } = {}): EncounterSim | null {
  const enc = r.encounters[id];
  if (!enc) return null;
  const runs = opts.runs ?? 120, maxRounds = opts.maxRounds ?? 40;
  const begin = () => {
    const s = cloneState(opts.from ?? initialState(r));
    applyEvent(s, { t: "enc", id, foe: Object.fromEntries(enc.foe.stats.map((f) => [f.id, f.start])), ...(enc.momentum ? { momentum: enc.momentum.start } : {}), src: "manual" }, r);
    return s;
  };
  const policies: { name: string; pick: (s: GameState, rng: () => number) => string | null }[] = [];
  const moves = (s: GameState) => [
    ...actionPool(r, s).order.filter((a) => !actionPool(r, s).defs[a].perPerson && isAvailable(r, s, actionPool(r, s).defs[a])),
    ...usableItems(r, s).filter((u) => !u.locked).map((u) => u.id),
  ];
  for (const a of enc.actionOrder) policies.push({ name: `always ${enc.actions[a].label}`, pick: (s) => (moves(s).includes(a) ? a : moves(s)[0] ?? null) });
  policies.push({ name: "a random mix", pick: (s, rng) => { const m = moves(s); return m.length ? m[Math.floor(rng() * m.length)] : null; } });

  const out: PolicyResult[] = [];
  for (const pol of policies) {
    const outcomes: Record<string, number> = {};
    const lengths: number[] = [];
    let rounds = 0, still = 0, unfinished = 0;
    for (let i = 0; i < runs; i++) {
      let s = begin();
      let rng = mulberry(i + 1);
      let n = 0;
      while (s.encounter && n < maxRounds) {
        const pick = pol.pick(s, rng);
        const rec = resolveTurn(r, s, pick ? { actionId: pick, via: "choice" } : null, { seed: `sim:${pol.name}:${i}:${n}` });
        const next = cloneState(s);
        for (const e of rec.events) applyEvent(next, e, r);
        const moved = rec.events.some((e) => (e.t === "foe" && (e.d ?? 0) !== 0) || e.t === "swing" || (e.t === "enc" && e.id === null));
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
    out.push({ policy: pol.name, runs, outcomes, medianRounds: quantile(lengths, 0.5), p90Rounds: quantile(lengths, 0.9), stalled: rounds ? still / rounds : 0, unfinished });
  }
  const notes: string[] = [];
  for (const p of out) {
    const total = Object.values(p.outcomes).reduce((a, b) => a + b, 0) || 1;
    const best = Object.entries(p.outcomes).sort((a, b) => b[1] - a[1])[0];
    if (p.unfinished > p.runs * 0.1) notes.push(`"${p.policy}" often never ends (${p.unfinished}/${p.runs} runs hit ${maxRounds} rounds) — give it a way to finish.`);
    if (best && best[1] / total > 0.97 && p.policy !== "a random mix") notes.push(`"${p.policy}" almost always ends "${best[0]}" — a guaranteed result isn't a choice.`);
    if (p.stalled > 0.6) notes.push(`"${p.policy}" changes nothing in ${Math.round(p.stalled * 100)}% of rounds — failures should still move something.`);
    if (p.p90Rounds > 12) notes.push(`"${p.policy}" drags on (1 in 10 runs take ${p.p90Rounds}+ rounds).`);
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

/** The simulation as a few readable lines. */
export function describeSim(sim: EncounterSim): string {
  const lines = sim.policies.map((p) => {
    const total = Object.values(p.outcomes).reduce((a, b) => a + b, 0);
    const outs = Object.entries(p.outcomes).sort((a, b) => b[1] - a[1]).map(([o, n]) => `${o} ${Math.round((n / p.runs) * 100)}%`).join(", ") || "never ends";
    return `- ${p.policy}: ${outs}${p.unfinished ? `, unfinished ${Math.round((p.unfinished / p.runs) * 100)}%` : ""} · median ${p.medianRounds} rounds (p90 ${p.p90Rounds}) · ${Math.round(p.stalled * 100)}% of rounds change nothing${total ? "" : ""}`;
  });
  return [`${sim.name} — ${sim.policies[0]?.runs ?? 0} runs per strategy:`, ...lines, ...(sim.notes.length ? ["Notes:", ...sim.notes.map((n) => `- ${n}`)] : [])].join("\n");
}
