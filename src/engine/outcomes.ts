// How an encounter ending reads for the player: won, escaped, conceded or lost.
// One classifier for quest hooks and the encounter view.
// Order: the author's word (`losses:` / `outcome_kinds:`), momentum's win/lose, the shape of
// the rules (an end_when on foe stats heading the player's way is a win; one on a player stat
// heading toward its bad end is a loss; an ending only a failed move can reach is a loss, one
// only a success can reach is not), and only then the outcome id's name.

import type { EncounterDef, StatDef } from "./ruleset.js";

export type OutcomeKind = "won" | "escaped" | "conceded" | "lost";
export const OUTCOME_KINDS: readonly OutcomeKind[] = ["won", "escaped", "conceded", "lost"];

/** Where a classification came from (for explanations and tests). */
export type OutcomeBasis = "author" | "momentum" | "foe" | "player" | "move" | "name" | "timeout" | "default";

const KIND_WORDS: Record<string, OutcomeKind> = {
  won: "won", win: "won", victory: "won", success: "won",
  escaped: "escaped", escape: "escaped", fled: "escaped", flee: "escaped",
  conceded: "conceded", concede: "conceded", concession: "conceded", paid: "conceded",
  lost: "lost", lose: "lost", loss: "lost", defeat: "lost", defeated: "lost",
};

/** Read an author's kind word (`won`, `escape`, `loss`…); null when it isn't one. */
export function parseOutcomeKind(v: unknown): OutcomeKind | null {
  return typeof v === "string" ? KIND_WORDS[v.trim().toLowerCase()] ?? null : null;
}

/** Last-resort name guesses. */
const FAILURE = /^(lost|lose|loss|beaten|defeat(ed)?|overwhelmed|caught|captured|ko|knocked_out|downed|fallen|slain|killed|dead|died|wiped(_out)?|fled_in_panic|broken|failed?)$/i;
const ESCAPE = /escap|fled|flee|got_?away|get_?away|ran_?(away|off)|run_?away|slip(ped)?|evade|evaded|evasion|retreat|withdr[ae]w|bolted|hid$|hidden|lost_them|outran/i;
const CONCESSION = /paid|pay|robbed|bribe|surrender|gave_?in|submit|walked|walk_away|left|gave_up|yield|conced/i;

/** Every ending id an encounter can produce: end_when, outcomes:, the timeout, momentum and moves' `end:`. */
export function encounterOutcomeIds(enc: EncounterDef): string[] {
  const ids = new Set<string>();
  for (const e of enc.endWhen) ids.add(e.outcome);
  for (const o of Object.keys(enc.outcomes)) ids.add(o);
  if (enc.momentum) { ids.add(enc.momentum.win); ids.add(enc.momentum.lose); }
  for (const a of Object.values(enc.actions)) for (const fx of [a.effects, ...Object.values(a.outcomes)]) if (fx?.end) ids.add(fx.end);
  for (const o of enc.foeMoves?.options ?? []) if (o.effect?.end) ids.add(o.effect.end);
  ids.add(enc.timeoutOutcome);
  return [...ids];
}

type Verdict = "win" | "loss" | null;

/** One comparison of a stat against a number: which way the ending points, if the rules say. */
function atomVerdict(enc: EncounterDef, stats: Record<string, StatDef> | undefined, atom: string): Verdict | undefined {
  const t = atom.trim().replace(/^\(+/, "").replace(/\)+$/, "").trim();
  let m = /^(foe\.)?([a-z_]\w*)\s*(<=|>=|<|>|==)\s*(-?\d+(?:\.\d+)?)$/i.exec(t);
  let foe: boolean, id: string, op: string;
  if (m) { foe = !!m[1]; id = m[2]; op = m[3]; }
  else {
    m = /^(-?\d+(?:\.\d+)?)\s*(<=|>=|<|>|==)\s*(foe\.)?([a-z_]\w*)$/i.exec(t);
    if (!m) return undefined; // not a simple comparison: says nothing
    foe = !!m[3]; id = m[4];
    op = ({ "<=": ">=", ">=": "<=", "<": ">", ">": "<", "==": "==" } as Record<string, string>)[m[2]];
  }
  const dir = op.startsWith("<") ? "down" : op.startsWith(">") ? "up" : null;
  if (foe) {
    const fs = enc.foe.stats.find((x) => x.id === id);
    if (!fs) return undefined;
    // A foe stat worn toward the end that's good for the player: a win. The other way stays unsure.
    if (dir && fs.good !== "none" && (dir === "down") === (fs.good === "low")) return "win";
    return null;
  }
  const def = stats?.[id];
  if (!def) return undefined; // round, a formula name, or an unknown stat
  // A player stat pushed toward its bad end: a loss. The other way stays unsure.
  if (dir && def.good !== "none" && (dir === "down") === (def.good === "high")) return "loss";
  return null;
}

function endWhenVerdict(enc: EncounterDef, stats: Record<string, StatDef> | undefined, outcome: string): { v: Verdict; basis: OutcomeBasis } {
  const votes = new Set<"win" | "loss" | "unsure">();
  for (const e of enc.endWhen) {
    if (e.outcome !== outcome) continue;
    for (const atom of e.when.split(/\s+(?:or|and)\s+|\|\||&&/i)) {
      const v = atomVerdict(enc, stats, atom);
      if (v === undefined) continue;
      votes.add(v ?? "unsure");
    }
  }
  if (votes.size === 1 && votes.has("win")) return { v: "win", basis: "foe" };
  if (votes.size === 1 && votes.has("loss")) return { v: "loss", basis: "player" };
  return { v: null, basis: "default" };
}

/** Moves that end it directly: only on success → not a loss; only on failure → a loss. */
function moveVerdict(enc: EncounterDef, outcome: string): Verdict {
  let good = false, bad = false;
  for (const a of Object.values(enc.actions)) {
    if (!a.check) continue;
    for (const [tier, fx] of Object.entries(a.outcomes)) {
      if (fx?.end !== outcome) continue;
      if (tier === "fail" || tier === "crit_fail") bad = true; else good = true;
    }
  }
  return good && !bad ? "win" : bad && !good ? "loss" : null;
}

/** A non-loss ending by name: fleeing, giving something up, or beating it. */
function goodKind(outcome: string): OutcomeKind {
  return ESCAPE.test(outcome) ? "escaped" : CONCESSION.test(outcome) ? "conceded" : "won";
}

/**
 * Classify one ending. `explicit` is the author's table; `stats` lets player-stat
 * thresholds count (without it they're skipped).
 */
export function inferOutcomeKind(enc: EncounterDef, outcome: string, stats?: Record<string, StatDef>, explicit?: Record<string, OutcomeKind>): { kind: OutcomeKind; basis: OutcomeBasis } {
  const told = explicit?.[outcome];
  if (told) return { kind: told, basis: "author" };
  if (enc.momentum && outcome === enc.momentum.lose) return { kind: "lost", basis: "momentum" };
  if (enc.momentum && outcome === enc.momentum.win) return { kind: "won", basis: "momentum" };
  const ew = endWhenVerdict(enc, stats, outcome);
  if (ew.v === "win") return { kind: "won", basis: ew.basis };
  if (ew.v === "loss") return { kind: "lost", basis: ew.basis };
  const mv = moveVerdict(enc, outcome);
  if (mv === "loss") return { kind: "lost", basis: "move" };
  if (mv === "win") return { kind: goodKind(outcome), basis: "move" };
  if (FAILURE.test(outcome)) return { kind: "lost", basis: "name" };
  if (ESCAPE.test(outcome)) return { kind: "escaped", basis: "name" };
  if (CONCESSION.test(outcome)) return { kind: "conceded", basis: "name" };
  // Only the round budget running out reaches it: nobody won — the player got out of it.
  const reached = enc.endWhen.some((e) => e.outcome === outcome) || mv !== null || Object.values(enc.actions).some((a) => a.effects?.end === outcome)
    || (enc.foeMoves?.options ?? []).some((o) => o.effect?.end === outcome);
  if (outcome === enc.timeoutOutcome && !reached) return { kind: "escaped", basis: "timeout" };
  return { kind: "won", basis: "default" };
}

/** The whole table for an encounter, computed once when the rulebook loads. */
export function classifyOutcomes(enc: EncounterDef, stats?: Record<string, StatDef>, explicit?: Record<string, OutcomeKind>): Record<string, OutcomeKind> {
  const out: Record<string, OutcomeKind> = {};
  for (const id of new Set([...encounterOutcomeIds(enc), ...Object.keys(explicit ?? {})])) out[id] = inferOutcomeKind(enc, id, stats, explicit).kind;
  return out;
}

/** How an ending counts: the table from load time, or (for an id the rules never named) the same inference. */
export function outcomeKind(enc: EncounterDef | undefined, outcome: string): OutcomeKind {
  if (!enc) return FAILURE.test(outcome) ? "lost" : goodKind(outcome);
  return enc.outcomeKinds?.[outcome] ?? enc.authoredKinds?.[outcome] ?? inferOutcomeKind(enc, outcome).kind;
}

/** Ending counts tallied into the four kinds (plus runs that never ended). */
export interface KindTally { won: number; escaped: number; conceded: number; lost: number }
export function tallyKinds(enc: EncounterDef | undefined, outcomes: Record<string, number>): KindTally {
  const t: KindTally = { won: 0, escaped: 0, conceded: 0, lost: 0 };
  for (const [o, n] of Object.entries(outcomes)) t[outcomeKind(enc, o)] += n;
  return t;
}
