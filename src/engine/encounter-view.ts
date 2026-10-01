// What an encounter is for, what threatens the player, and what each round did —
// read from the rules and the recorded events, so the player can see why a
// success didn't end it and what would. Also which held items matter right now.

import type { ActionDef, Effect, EncounterDef, Ruleset } from "./ruleset.js";
import type { RoundCardView } from "../shared/protocol.js";
import { titleCase } from "./ruleset.js";
import type { TurnRecord } from "./resolve.js";
import { foeName, itemName, type GameState } from "./state.js";
import { identifiers } from "./expr.js";

export interface Threshold { outcome: string; foe: boolean; stat: string; op: "<=" | ">=" | "<" | ">" | "=="; value: number }

/** Simple ending conditions (`foe.fervor <= 0`, `stress >= 80`, joined by `or`); anything fancier is left alone. */
export function thresholds(enc: EncounterDef): Threshold[] {
  const out: Threshold[] = [];
  for (const e of enc.endWhen) {
    for (const part of e.when.split(/\s+or\s+/i)) {
      const m = /^\(?\s*(foe\.)?([a-z_]\w*)\s*(<=|>=|<|>|==)\s*(-?\d+(?:\.\d+)?)\s*\)?$/i.exec(part.trim());
      if (m) out.push({ outcome: e.outcome, foe: !!m[1], stat: m[2], op: m[3] as Threshold["op"], value: Number(m[4]) });
    }
  }
  return out;
}

const FAILURE = /^(lost|lose|loss|beaten|defeat(ed)?|overwhelmed|caught|captured|ko|knocked_out|dead|died|fled_in_panic|broken|failed?)$/i;

/** How an ending reads to the player. */
export function outcomeLabel(enc: EncounterDef | undefined, outcome: string): string {
  return enc?.labels[outcome] ?? titleCase(outcome);
}

/** Whether an ending is a loss (an author's momentum `lose`, or a name like "beaten"). */
export function isLoss(enc: EncounterDef | undefined, outcome: string): boolean {
  if (enc?.momentum) return outcome === enc.momentum.lose;
  return FAILURE.test(outcome);
}

function endsIn(e: Effect | undefined): string | null { return e?.end ?? null; }

/** Outcomes a player move can end it with directly (a successful bolt → "escaped"). */
function directEnds(enc: EncounterDef): { action: string; outcome: string }[] {
  const out: { action: string; outcome: string }[] = [];
  for (const id of enc.actionOrder) {
    const a = enc.actions[id];
    for (const e of [a.effects, a.outcomes.success, a.outcomes.crit_success, a.outcomes.partial]) {
      const o = endsIn(e);
      if (o && !out.some((x) => x.outcome === o && x.action === a.label)) out.push({ action: a.label, outcome: o });
    }
  }
  return out;
}

export interface EncounterGuide {
  goal: string | null;
  progress: { label: string; value: number; target: number; max: number }[];
  danger: { label: string; value: number; at: number; text: string; close: boolean }[];
  dangerText: string | null;
}

export function encounterGuide(r: Ruleset, s: GameState): EncounterGuide | null {
  const st = s.encounter;
  const enc = st ? r.encounters[st.id] : undefined;
  if (!st || !enc) return null;
  const th = thresholds(enc);
  const progress: EncounterGuide["progress"] = [];
  const goals: string[] = [];
  for (const t of th.filter((x) => x.foe && !isLoss(enc, x.outcome))) {
    const fs = enc.foe.stats.find((f) => f.id === t.stat);
    if (!fs) continue;
    progress.push({ label: fs.label, value: st.foe[fs.id] ?? fs.start, target: t.value, max: fs.max });
    goals.push(`${t.op.startsWith("<") ? "bring" : "push"} their ${fs.label.toLowerCase()} to ${t.value}`);
  }
  if (enc.momentum) goals.push("swing the fight all the way your way");
  for (const d of directEnds(enc)) if (!isLoss(enc, d.outcome)) goals.push(`${d.action.toLowerCase()} (${d.outcome.replace(/_/g, " ")})`);
  const goal = enc.goal ?? (goals.length ? cap(joinOr(goals)) : null);
  const danger: EncounterGuide["danger"] = [];
  for (const t of th.filter((x) => !x.foe && isLoss(enc, x.outcome))) {
    const def = r.stats[t.stat];
    if (!def) continue;
    const value = s.stats[t.stat] ?? def.start;
    const span = Math.max(1, def.max - def.min);
    const gap = t.op.startsWith(">") ? t.value - value : value - t.value;
    danger.push({ label: def.label, value, at: t.value, text: `${def.label} ${Math.round(value)}, out at ${t.value}`, close: gap / span <= 0.2 });
  }
  danger.sort((a, b) => Math.abs(a.at - a.value) - Math.abs(b.at - b.value));
  const loss = th.find((x) => !x.foe && isLoss(enc, x.outcome));
  const dangerText = enc.danger ?? (danger.length ? `${danger.slice(0, 2).map((d) => `${d.label} at ${d.at}`).join(" or ")} and you're ${outcomeLabel(enc, loss!.outcome).toLowerCase()}` : null);
  return { goal, progress, danger, dangerText };
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
function joinOr(xs: string[]): string {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} — or ${xs[xs.length - 1]}`;
}

// ───────────────────────── one round, from the ledger ─────────────────────────

export type RoundCard = RoundCardView;

const TIER_WORD: Record<string, string> = { crit_success: "great success", success: "success", partial: "partial", fail: "failed", crit_fail: "badly failed" };

export function roundCard(r: Ruleset, rec: TurnRecord, before: GameState, after: GameState, odds: number | null): RoundCard {
  const enc = before.encounter ? r.encounters[before.encounter.id] : undefined;
  const changes: RoundCard["changes"] = [];
  if (enc && before.encounter) {
    const fin = after.encounter?.id === before.encounter.id ? after.encounter : null;
    for (const fs of enc.foe.stats) {
      const from = before.encounter.foe[fs.id] ?? fs.start;
      const touched = rec.events.some((e) => e.t === "foe" && e.stat === fs.id);
      const to = fin ? fin.foe[fs.id] ?? fs.start : from + rec.events.reduce((n, e) => n + (e.t === "foe" && e.stat === fs.id ? e.set !== undefined ? e.set - from : e.d ?? 0 : 0), 0);
      if (touched && to !== from) changes.push({ label: `${foeName(r, before)}: ${fs.label}`, from, to: Math.max(0, to), of: fs.max, good: (to < from) === (fs.good !== "high") });
    }
    if (before.encounter.momentum !== undefined) {
      const to = fin?.momentum ?? before.encounter.momentum + rec.events.reduce((n, e) => n + (e.t === "swing" ? e.d : 0), 0);
      if (to !== before.encounter.momentum) changes.push({ label: "Momentum", from: before.encounter.momentum, to, of: 100, good: to > before.encounter.momentum });
    }
  }
  // Player stats this encounter can be lost on, and any others the round moved.
  const watched = new Set(enc ? thresholds(enc).filter((t) => !t.foe).map((t) => t.stat) : []);
  for (const id of r.statOrder) {
    const from = before.stats[id], to = after.stats[id];
    if (from === undefined || to === undefined || Math.abs(to - from) < 0.5) continue;
    if (!watched.has(id) && !rec.events.some((e) => e.t === "stat" && e.id === id && e.src !== "drift")) continue;
    const def = r.stats[id];
    if (def.kind === "hidden") continue;
    const at = enc ? thresholds(enc).find((t) => !t.foe && t.stat === id && isLoss(enc, t.outcome))?.value ?? null : null;
    changes.push({ label: def.label, from: Math.round(from), to: Math.round(to), of: at ?? (def.kind === "meter" ? def.max : null), good: def.good === "low" ? to < from : def.good === "high" ? to > from : true });
  }
  const endEv = rec.events.find((e) => e.t === "enc" && e.id === null) as { outcome?: string } | undefined;
  const foeDec = enc?.foeMoves ? rec.decisions?.find((d) => d.id === enc.foeMoves!.id) : undefined;
  return {
    move: rec.action?.label ?? "No clear move",
    check: rec.check ? { label: rec.check.label, tier: TIER_WORD[rec.check.tier] ?? rec.check.tier, odds, gear: rec.check.gear ?? [] } : null,
    foe: foeDec ? foeDec.pickedDesc : null,
    changes,
    ended: endEv ? { outcome: endEv.outcome ?? "ended", label: outcomeLabel(enc, endEv.outcome ?? "ended"), loss: isLoss(enc, endEv.outcome ?? "") } : null,
    round: (before.encounter?.round ?? 0) + 1,
  };
}

// ───────────────────────── items that matter now ─────────────────────────

function effectStats(a: ActionDef): { stats: Map<string, number>; adds: string[]; removes: string[]; foe: boolean; ends: boolean } {
  const stats = new Map<string, number>();
  const adds: string[] = [], removes: string[] = [];
  let foe = false, ends = false;
  for (const e of [a.effects, ...Object.values(a.outcomes)]) {
    if (!e) continue;
    for (const [k, v] of Object.entries(e.stats)) stats.set(k, (stats.get(k) ?? 0) + (typeof v === "number" ? v : 0));
    adds.push(...Object.keys(e.addConditions));
    removes.push(...e.removeConditions);
    if (Object.keys(e.foe).length) foe = true;
    if (e.end) ends = true;
  }
  return { stats, adds, removes, foe, ends };
}

/** Stats an encounter's checks, rules and endings read — what an item would need to touch to matter in it. */
function encounterReads(enc: EncounterDef): Set<string> {
  const ids = new Set<string>();
  for (const a of Object.values(enc.actions)) {
    if (a.check) for (const x of [...identifiers(a.check.add as string), ...identifiers(a.check.target as string)]) ids.add(x);
    if (a.when) for (const x of identifiers(a.when)) ids.add(x);
  }
  for (const e of enc.endWhen) for (const x of identifiers(e.when)) ids.add(x);
  return ids;
}

/**
 * How much using an item would help right now (0 = not worth suggesting), and why.
 * It counts if it eases a stat that's going badly, clears a condition you have, or —
 * in an encounter — touches what that encounter's checks and endings read.
 */
export function itemRelevance(r: Ruleset, s: GameState, a: ActionDef): { score: number; why: string | null } {
  const fx = effectStats(a);
  let score = 0;
  // Every reason counts toward the score; the strongest one is what the player is told.
  let best: { w: number; why: string } | null = null;
  const add = (w: number, why: string) => { score += w; if (!best || w > best.w) best = { w, why }; };
  const enc = s.encounter ? r.encounters[s.encounter.id] : undefined;
  const reads = enc ? encounterReads(enc) : new Set<string>();
  for (const [id, d] of fx.stats) {
    const def = r.stats[id];
    if (!def || !d) continue;
    const v = s.stats[id] ?? def.start;
    const p = (v - def.min) / Math.max(1, def.max - def.min);
    const bad = def.good === "low" ? p >= 0.5 : def.good === "high" ? p <= 0.5 : false;
    const helps = def.good === "low" ? d < 0 : def.good === "high" ? d > 0 : false;
    if (bad && helps) add(1.5 + p, `${def.label} is ${def.good === "low" ? "high" : "low"}`);
    if (enc && reads.has(id)) add(1.5, `Changes ${def.label}, which this encounter turns on`);
  }
  for (const c of fx.removes) if (s.conditions[c]) add(3, `Clears ${r.conditions[c]?.label ?? c}`);
  if (enc && fx.foe) add(2, `Works on ${foeName(r, s)}`);
  if (enc && fx.ends) add(1, "Can end the encounter");
  return { score, why: (best as { why: string } | null)?.why ?? null };
}

export const itemLabel = (r: Ruleset, s: GameState, id: string) => itemName(r, s, id);
