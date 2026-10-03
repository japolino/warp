// View models for the UI and the text the narrator sees.

import type { ActionDef, Ruleset, StatDef } from "./ruleset.js";
import { TIERS } from "./ruleset.js";
import {
  amountValue, bandFor, formatClock, formatMoney, formatNumber, gradeFor, itemName, makeEnv, personName, statMax,
  type GameState, type WarpEvent,
} from "./state.js";
import { practiceProgress } from "./freeform.js";
import { isAvailable, LIVE_PREFIX, lockReason, odds, spentLock, whenHolds, availableChoices, usableItems, TIER_LABEL, TARGET_SEP, type CheckResult, type LiveChoice, type TurnRecord } from "./resolve.js";
import { dateAt, ordinal, presentPeople } from "./world.js";
import type { ChangeView, ChoiceView, ConflictView, GoalView, HudView, RecordView, Tone } from "../shared/protocol.js";
import { namesIt } from "./mention.js";
import { bandCrossings, crossingLines, voiceLine } from "./people.js";
import { BREAK_OFF, CONTEST_PREFIX, bestStat, breakOffDc, contestId, kindOf, momentumWords, moveOdds, statAdd } from "./contest.js";
import { d20Odds } from "./dice.js";
import { adultGated, isAdult } from "./adults.js";
import { goalInPlay } from "./goals.js";

function pct(v: number, min: number, max: number) {
  return max > min ? Math.max(0, Math.min(1, (v - min) / (max - min))) : 0;
}

function toneFromPct(p: number, good: StatDef["good"]): Tone {
  if (good === "none") return "neutral";
  const g = good === "high" ? p : 1 - p;
  return g >= 0.67 ? "good" : g >= 0.34 ? "warn" : "bad";
}

/**
 * What a stat's `show:` puts beside its name, in the sidebar and for the narrator alike:
 * text (default with bands) = the band's words, number = the number, both = "words (number)".
 * Null means "just the number".
 */
export function shownText(def: StatDef, band: { text: string } | null, num: string): string | null {
  if (!band || def.show === "number") return null;
  return def.show === "both" ? `${band.text} (${num})` : band.text;
}

function statDisplay(r: Ruleset, def: StatDef, v: number, max: number): string {
  if (def.kind === "money") return formatMoney(r, v);
  if (def.kind === "meter" && max !== 100) return `${formatNumber(v)} / ${formatNumber(max)}`;
  return formatNumber(v);
}

/** The clock as the UI shows it: the weekday only when it is known. */
function clockOf(r: Ruleset, s: GameState) {
  return formatClock(r, s.minutes, !!s.weekday);
}

/** A person's (or "you") look line, or null. */
function lookLine(s: GameState, who: string): { appearance: string | null; outfit: string | null } {
  const l = s.look?.[who];
  return { appearance: l?.appearance ?? null, outfit: l?.outfit ?? null };
}

/** A per-person authored action as a button in that person's row. */
function personActions(r: Ruleset, s: GameState, pid: string, lines: Set<string>, veils: Set<string>): ChoiceView[] {
  const out: ChoiceView[] = [];
  for (const id of r.actionOrder) {
    const a = r.actions[id];
    if (!a.perPerson || a.hidden || a.tags.some((t) => lines.has(t))) continue;
    if (adultGated(a.tags) && (isAdult(r, s, pid) !== true || isAdult(r, s, "you") === false)) continue;
    if (!isAvailable(r, s, a, pid)) continue;
    const name = personName(r, s, pid);
    const label = /\{\{target\}\}|\{target\}/i.test(a.label) ? a.label.replace(/\{\{target\}\}|\{target\}/gi, name) : a.label;
    const o = odds(r, s, a, undefined, pid);
    out.push({
      id: `${a.id}${TARGET_SEP}${pid}`, label, group: null, desc: a.desc ?? null,
      odds: o ? o.success : null, partialOdds: o && o.partial > 0 ? o.partial : null, checkLabel: a.check?.label ?? null,
      veiled: a.tags.some((t) => veils.has(t)), params: a.params.map((p) => ({ id: p.id, label: p.label, options: Object.keys(p.options), default: p.default })), difficulty: null,
    });
  }
  return out;
}

export function buildHud(r: Ruleset, s: GameState, opts: { lines?: string[]; veils?: string[] } = {}): HudView {
  const bars = r.hud.bars.map((id) => {
    const def = r.stats[id];
    const v = s.stats[id] ?? def.start;
    const max = statMax(r, def, s);
    const band = bandFor(def, v, max);
    const p = pct(v, def.min, max);
    return {
      id, label: def.label, value: v, min: def.min, max,
      display: statDisplay(r, def, v, max),
      pct: p,
      text: shownText(def, band, statDisplay(r, def, v, max)),
      tone: band?.tone ?? toneFromPct(p, def.good),
      good: def.good,
      color: def.color,
      desc: def.desc,
    };
  });

  const skills = r.statOrder
    .filter((id) => (r.stats[id].kind === "attribute" || r.stats[id].kind === "skill") && !r.hud.bars.includes(id) && r.stats[id].show !== "hidden")
    .map((id) => {
      const def = r.stats[id];
      const v = s.stats[id] ?? def.start;
      const max = statMax(r, def, s);
      const band = bandFor(def, v, max);
      return {
        id, label: def.label,
        value: v, min: def.min, max,
        display: formatNumber(v),
        grade: gradeFor(def, v, max),
        pct: pct(v, def.min, max),
        kind: def.kind as "attribute" | "skill",
        // `show:` decides, as for the narrator: the band's words (default when there are bands), the number, or both.
        // Unset show: on a banded skill keeps the number beside the words in the sidebar.
        text: shownText(def.showSet ? def : { ...def, show: "both" }, band, formatNumber(v)),
        tone: band?.tone ?? "neutral" as Tone,
        practice: practiceProgress(r, s, id),
        group: def.group ?? (def.kind === "skill" ? "Skills" : "Attributes"),
      };
    });

  const lines = new Set((opts.lines ?? []).map((x) => x.toLowerCase()));
  const veils = new Set((opts.veils ?? []).map((x) => x.toLowerCase()));
  const here = new Set(presentPeople(r, s));
  const people = Object.entries(s.people).filter(([id]) => !s.forgotten[id]).map(([id, p]) => {
    return {
      id, name: p.name,
      stats: r.relStatOrder.map((rs) => {
        const def = r.relStats[rs];
        const v = s.rel[id]?.[rs] ?? def.start;
        const band = bandFor(def, v);
        const pp = pct(v, def.min, def.max);
        return { id: rs, label: def.label, value: v, min: def.min, max: def.max, display: formatNumber(v), pct: pp, text: shownText(def, band, formatNumber(v)), tone: band?.tone ?? toneFromPct(pp, def.good) };
      }),
      present: here.has(id),
      conditions: [] as HudView["people"][number]["conditions"],
      memories: (s.memories?.[id] ?? []).slice().reverse().slice(0, 5).map((m) => ({ text: m.text, when: r.clock.enabled ? formatClock(r, m.at, !!s.weekday).day : null })),
      ...lookLine(s, id),
      actions: here.has(id) && !s.contest ? personActions(r, s, id, lines, veils) : [],
    };
  }).sort((a, b) => Number(b.present) - Number(a.present));

  const usable_ = usableItems(r, s);
  let gearEnv_: ReturnType<typeof makeEnv> | null = null;
  const gearEnv = () => (gearEnv_ ??= makeEnv(r, s));
  const items = Object.entries(s.items).map(([id, count]) => {
    const def = r.items[id];
    const per = def?.uses ?? 0;
    const usable = usable_.find((u) => u.id === `item:${id}`);
    // Formula bonuses ("level / 2") show what they're worth right now.
    const bonus = def ? Object.entries(def.bonus).map(([st, b]) => [st, amountValue(b, gearEnv())] as const).filter(([, b]) => b).map(([st, b]) => `${b > 0 ? "+" : ""}${formatNumber(b)} ${r.stats[st]?.label ?? st}`).join(", ") : "";
    return {
      id, name: itemName(r, s, id), count, uses: per > 1 ? `${s.uses[id] ?? per}/${per}` : null,
      use: usable ? { id: usable.id, label: usable.a.label, locked: usable.locked, drafted: false } : null,
      bonus: bonus || null,
    };
  });
  const date = dateAt(r, s.minutes);

  const conditions = Object.entries(s.conditions).map(([id, c]) => {
    const def = r.conditions[id];
    const left = c.until !== null ? c.until - s.minutes : null;
    return {
      id,
      label: def?.label ?? id,
      tone: def?.tone ?? "warn",
      desc: def?.desc,
      remaining: left !== null && left > 0 ? minutesLeft(left) : undefined,
    };
  });

  const moneyDef = r.hud.money ? r.stats[r.hud.money] : undefined;
  const moneyV = r.hud.money ? s.stats[r.hud.money] ?? moneyDef?.start ?? 0 : 0;
  // Money follows `show:` too: a purse with bands reads "Enough for the week." unless it says number or both.
  const money = moneyDef ? moneyDef.show === "hidden" ? null : shownText(moneyDef.showSet ? moneyDef : { ...moneyDef, show: "both" }, bandFor(moneyDef, moneyV, statMax(r, moneyDef, s)), formatMoney(r, moneyV)) ?? formatMoney(r, moneyV) : null;
  const wd = s.weekday ? r.clock.weekdays[Math.floor(s.minutes / 1440) % r.clock.weekdays.length] ?? "" : "";

  return {
    rulesetName: r.name,
    clock: r.clock.enabled ? { ...clockOf(r, s), minutes: s.minutes } : null,
    date: date ? `${wd} ${ordinal(date.day)} ${date.monthName}`.trim() : null,
    location: s.locationName ? { name: s.locationName } : null,
    money,
    bars: bars.filter((b) => r.stats[b.id].kind !== "money"),
    skills,
    you: lookLine(s, "you"),
    wereWithYou: Object.entries(s.scene).filter(([id, v]) => v.here && s.people[id] && !s.forgotten[id] && v.loc !== s.location && v.loc === s.lastLocation && !here.has(id)).map(([id]) => ({ id, name: personName(r, s, id) })),
    people,
    items,
    conditions,
    goals: goalViews(r, s),
    conflict: conflictView(r, s),
    turn: s.turn,
  };
}

/** Story goals: open first, then the last few done or failed. */
function goalViews(r: Ruleset, s: GameState): GoalView[] {
  const all = Object.entries(s.goals ?? {});
  const view = ([id, g]: [string, NonNullable<GameState["goals"]>[string]]): GoalView => ({
    id, text: g.text, status: g.st, from: g.from ? personName(r, s, g.from) : null, stakes: g.stakes ?? r.goals.list[id]?.stakes ?? null,
  });
  const open = all.filter(([, g]) => g.st === "open").map(view);
  const ended = all.filter(([, g]) => g.st !== "open").sort((a, b) => (b[1].ended ?? 0) - (a[1].ended ?? 0)).slice(0, 6).map(view);
  return [...open, ...ended];
}

/** The contest running now, for the Conflict section. */
function conflictView(r: Ruleset, s: GameState): ConflictView | null {
  const c = s.contest;
  if (!c) return null;
  const kind = kindOf(r, c.kind);
  const stat = bestStat(r, s, kind);
  const words = momentumWords(c.momentum, c.opponent, "You");
  return {
    kind: c.kind, label: kind.label, opponent: c.opponent, round: c.round, maxRounds: r.conflict.rounds.max, momentum: c.momentum,
    words: words.charAt(0).toUpperCase() + words.slice(1),
    next: stat ? { odds: moveOdds(r, s, stat), stat: r.stats[stat]?.label ?? stat } : null,
  };
}

function agoWords(min: number): string {
  if (min < 60) return "just now";
  if (min < 1440) return `${Math.round(min / 60)}h ago`;
  const d = Math.round(min / 1440);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

function minutesLeft(left: number): string {
  return left >= 1440 ? `${Math.round(left / 1440)}d` : left >= 60 ? `${Math.round(left / 60)}h` : `${Math.max(1, Math.round(left))}m`;
}

/** Has {{user}} met them in the story (been in a scene together, or left a memory)? */
function hasMet(s: GameState, id: string): boolean {
  return !!s.scene[id] || (s.memories?.[id]?.length ?? 0) > 0;
}

/** Whose people are in play for the narrator: everyone here (by id), and the names to match secrets against. */
function sceneCast(r: Ruleset, s: GameState): { here: Set<string>; names: Map<string, string> } {
  const here = new Set(presentPeople(r, s));
  const names = new Map<string, string>();
  for (const id of Object.keys(s.people)) {
    names.set(personName(r, s, id).toLowerCase(), id);
    names.set(id.toLowerCase(), id);
  }
  return { here, names };
}

/** Does any move in the ruleset need its target to be a known adult? */
function anyAdultGated(r: Ruleset): boolean {
  return [...Object.values(r.actions), ...Object.values(r.liveChoices.tags)].some((a) => adultGated(a.tags));
}

export interface ChoiceOptions { lines: string[]; veils: string[]; live?: LiveChoice[]; showChoices?: boolean }

/**
 * The choices under the reply: the 3 written for this moment (odds follow their difficulty word), then the
 * compact "More" row of authored actions and a few helpful items. In a contest: 2 moves and Break off.
 * Per-person authored actions are in each person's row (`buildHud` → `people[].actions`).
 */
export function buildChoices(r: Ruleset, s: GameState, opts: ChoiceOptions): ChoiceView[] {
  if (opts.showChoices === false) return [];
  const veils = new Set(opts.veils.map((v) => v.toLowerCase()));
  const lines = new Set(opts.lines.map((v) => v.toLowerCase()));
  const plain = (id: string, label: string, group: string | null, desc: string | null = null): ChoiceView =>
    ({ id, label, group, desc, odds: null, partialOdds: null, checkLabel: null, veiled: false, params: [], difficulty: null });
  if (s.contest) return contestChoices(r, s, opts.live ?? []);
  const here = new Set(presentPeople(r, s));
  const live: ChoiceView[] = [];
  (opts.live ?? []).forEach((c, i) => {
    if (contestId(c.tag)) return;
    const a = r.liveChoices.tags[c.tag];
    if (!a || a.tags.some((t) => lines.has(t)) || !isAvailable(r, s, a, c.target)
      || (a.perPerson && !c.target) || (c.target && !here.has(c.target))) return;
    // Nothing romantic or sexual toward someone not known to be an adult.
    if (adultGated(a.tags) && (isAdult(r, s, "you") === false || (c.target && isAdult(r, s, c.target) !== true))) return;
    const word = c.difficulty ?? null;
    const o = odds(r, s, a, word ? { difficulty: word } : undefined, c.target);
    live.push({
      id: `${LIVE_PREFIX}${i}`,
      label: c.label,
      group: r.liveChoices.label,
      desc: a.desc ?? null,
      odds: o ? o.success : null,
      partialOdds: o && o.partial > 0 ? o.partial : null,
      checkLabel: o ? a.check?.label ?? null : null,
      veiled: a.tags.some((t) => veils.has(t)),
      params: [],
      difficulty: a.check ? word ?? (a.check.target === undefined ? "fair" : null) : "none",
    });
  });
  const actions = availableChoices(r, s, opts.lines)
    .filter(({ a, target }) => !a.hidden && !target)
    .map(({ id, a, label }) => {
      const o = odds(r, s, a);
      return {
        id,
        label,
        group: null,
        desc: a.desc ?? null,
        odds: o ? o.success : null,
        partialOdds: o && o.partial > 0 ? o.partial : null,
        checkLabel: a.check?.label ?? null,
        veiled: a.tags.some((t) => veils.has(t)),
        params: a.params.map((p) => ({ id: p.id, label: p.label, options: Object.keys(p.options), default: p.default })),
        difficulty: null,
      };
    });
  // Moves out of reach say why, when it's something the player could work toward: an item, a skill level, someone to bring.
  const locked: ChoiceView[] = [];
  for (const id of r.actionOrder) {
    const a = r.actions[id];
    if (a.hidden || a.perPerson || a.tags.some((t) => lines.has(t))) continue;
    // Allowed but unaffordable: always shown locked, with why ("Needs 80 Mana").
    const spent = whenHolds(r, s, a) ? spentLock(r, s, a) : null;
    if (!spent && !a.showLocked) continue;
    if (isAvailable(r, s, a)) continue;
    locked.push({ ...plain(id, a.label, null, a.desc ?? null), locked: spent ?? lockReason(r, s, a) });
  }
  return [...live, ...actions, ...itemChoices(r, s, lines), ...locked];
}

/** In a contest: the written moves (at most 2; the kind's stats when none were written) and Break off. */
function contestChoices(r: Ruleset, s: GameState, written: LiveChoice[]): ChoiceView[] {
  const c = s.contest!;
  const kind = kindOf(r, c.kind);
  const out: ChoiceView[] = [];
  const move = (id: string, label: string, stat: string): ChoiceView => {
    const o = d20Odds(statAdd(r, s, stat), c.dc, r.checks.partial);
    return { id, label, group: kind.label, desc: null, odds: o.success, partialOdds: o.partial > 0 ? o.partial : null, checkLabel: r.stats[stat]?.label ?? stat, veiled: false, params: [], difficulty: c.threat };
  };
  written.forEach((w, i) => {
    const key = contestId(w.tag);
    if (!key || key === BREAK_OFF || out.length >= 2) return;
    const stat = key.slice(CONTEST_PREFIX.length);
    if (!kind.stats.includes(stat) && !r.stats[stat]) return;
    out.push(move(`${LIVE_PREFIX}${i}`, w.label, stat));
  });
  if (!out.length) for (const stat of kind.stats.slice(0, 2)) out.push(move(`${CONTEST_PREFIX}${stat}`, `Press on (${r.stats[stat]?.label ?? stat})`, stat));
  const esc = kind.escape || bestStat(r, s, kind);
  const o = d20Odds(statAdd(r, s, esc), breakOffDc(s), r.checks.partial);
  out.push({ id: BREAK_OFF, label: "Break off", group: kind.label, desc: `Try to get away from ${c.opponent}.`, odds: o.success + o.partial, partialOdds: null, checkLabel: r.stats[esc]?.label ?? esc, veiled: false, params: [], difficulty: c.threat });
  return out;
}

/** Held items worth using now (clearly helpful ones, up to 2). */
function itemChoices(r: Ruleset, s: GameState, lines: Set<string>): ChoiceView[] {
  const ranked = usableItems(r, s)
    .filter((u) => !u.locked && !u.a.tags.some((t) => lines.has(t)))
    .map((u) => ({ u, ...itemRelevance(r, s, u.a) }))
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  return ranked.map(({ u, why }) => {
    const o = odds(r, s, u.a);
    return {
      id: u.id, label: u.a.label, group: "Items", desc: u.a.desc ?? r.items[u.id.slice(5)]?.desc ?? null,
      odds: o ? o.success : null, partialOdds: o && o.partial > 0 ? o.partial : null, checkLabel: u.a.check?.label ?? null,
      veiled: false, params: [], difficulty: null, ...(why ? { why } : {}),
    };
  });
}

/**
 * How much using an item would help right now (0 = not worth suggesting), and why: it eases a stat that's going
 * badly, or clears a condition {{user}} has.
 */
export function itemRelevance(r: Ruleset, s: GameState, a: ActionDef): { score: number; why: string | null } {
  let score = 0;
  let best: { w: number; why: string } | null = null;
  const add = (w: number, why: string) => { score += w; if (!best || w > best.w) best = { w, why }; };
  const stats = new Map<string, number>();
  const removes: string[] = [];
  for (const e of [a.effects, ...Object.values(a.outcomes)]) {
    if (!e) continue;
    for (const [k, v] of Object.entries(e.stats)) stats.set(k, (stats.get(k) ?? 0) + (typeof v === "number" ? v : 0));
    removes.push(...e.removeConditions);
  }
  for (const [id, d] of stats) {
    const def = r.stats[id];
    if (!def || !d) continue;
    const v = s.stats[id] ?? def.start;
    const p = (v - def.min) / Math.max(1, statMax(r, def, s) - def.min);
    const bad = def.good === "low" ? p >= 0.5 : def.good === "high" ? p <= 0.5 : false;
    const helps = def.good === "low" ? d < 0 : def.good === "high" ? d > 0 : false;
    if (bad && helps) add(1.5 + p, `${def.label} is ${def.good === "low" ? "high" : "low"}`);
  }
  for (const c of removes) if (s.conditions[c]) add(3, `Clears ${r.conditions[c]?.label ?? c}`);
  return { score, why: (best as { why: string } | null)?.why ?? null };
}

// ───────────────────────── change summaries ─────────────────────────

function signed(n: number) {
  const f = formatNumber(n);
  return n > 0 ? `+${f}` : f;
}

/**
 * Summarise a record's events into the "what changed" items, in order: contest start/end and momentum; time,
 * place, who came and went; then stats, relationships, items, looks, goals and memories. Band-crossing story
 * lines are separate (`RecordView.lines`) and come first. Drift and trigger bookkeeping fold away.
 */
/**
 * The changes of a record, aggregated per stat, person and item. `lined`: stats whose band crossing already has its
 * own story line on this record, so their changes don't repeat the band in brackets.
 */
export function summarizeEvents(r: Ruleset, before: GameState, after: GameState, events: WarpEvent[], lined: Set<string> = new Set()): ChangeView[] {
  const contest: ChangeView[] = [];
  const scene: ChangeView[] = [];
  const rest: ChangeView[] = [];
  const statAgg = new Map<string, { d: number; idx: number[]; src: string; set: boolean }>();
  const relAgg = new Map<string, { d: number; idx: number[]; src: string; set: boolean }>();
  const itemAgg = new Map<string, { d: number; idx: number[]; src: string }>();
  const timeAgg = { min: 0, idx: [] as number[], narrIdx: [] as number[], set: null as number | null, setIdx: [] as number[] };
  const swing = { d: 0, idx: [] as number[], src: "check" };

  events.forEach((e, i) => {
    if (e.src === "drift") return;
    switch (e.t) {
      case "stat": {
        const key = `${e.id}|${e.src === "narrator" ? "n" : "e"}`;
        const a = statAgg.get(key) ?? { d: 0, idx: [], src: e.src, set: false };
        a.d += e.d ?? 0;
        if (e.set !== undefined) a.set = true;
        a.idx.push(i);
        statAgg.set(key, a);
        break;
      }
      case "rel": {
        const key = `${e.who}|${e.stat}|${e.src === "narrator" ? "n" : "e"}`;
        const a = relAgg.get(key) ?? { d: 0, idx: [], src: e.src, set: false };
        if (e.set !== undefined) a.set = true;
        a.d += e.d ?? 0;
        a.idx.push(i);
        relAgg.set(key, a);
        break;
      }
      case "item": {
        const key = `${e.id}|${e.src === "narrator" ? "n" : "e"}`;
        const a = itemAgg.get(key) ?? { d: 0, idx: [], src: e.src };
        a.d += e.d;
        a.idx.push(i);
        itemAgg.set(key, a);
        break;
      }
      case "move":
        scene.push({ text: `→ ${e.name ?? e.to.replace(/_/g, " ")}`, tone: "neutral", src: e.src, undo: [i] });
        break;
      case "time":
        timeAgg.min += e.min;
        timeAgg.idx.push(i);
        if (e.src === "narrator") timeAgg.narrIdx.push(i);
        break;
      case "set_time":
        timeAgg.set = e.minutes;
        timeAgg.setIdx.push(i);
        break;
      case "cond": {
        const label = r.conditions[e.id]?.label ?? e.id;
        if (e.note === "expired") break;
        rest.push({ text: e.on ? label : `${label} ended`, tone: e.on ? r.conditions[e.id]?.tone ?? "warn" : "good", src: e.src, undo: [i] });
        break;
      }
      case "memory":
        rest.push({ text: `💭 ${personName(r, after, e.who)} will remember that`, tone: "neutral", src: e.src, undo: [i], why: [e.text] });
        break;
      case "person":
        scene.push({ text: `Met ${e.name}`, tone: "neutral", src: e.src, undo: [i] });
        break;
      case "scene":
        if (events.some((x, j) => j < i && x.t === "person" && x.id === e.who)) break;
        scene.push({ text: e.here ? `${personName(r, after, e.who)} joins` : `${personName(r, after, e.who)} leaves`, tone: "neutral", src: e.src, undo: [i] });
        break;
      case "look":
        rest.push({ text: `${e.who === "you" ? "You" : personName(r, after, e.who)}: ${e.field === "outfit" ? "outfit" : "looks"} ${e.text ? "changed" : "cleared"}`, tone: "neutral", src: e.src, undo: [i], ...(e.text ? { why: [e.text] } : {}) });
        break;
      case "goal": {
        const g = after.goals?.[e.id] ?? before.goals?.[e.id];
        const text = e.text ?? g?.text ?? e.id;
        if (e.st === null) rest.push({ text: `Goal dropped: ${text}`, tone: "neutral", src: e.src, undo: [i] });
        else rest.push({ text: e.st === "open" ? `New goal: ${text}` : e.st === "done" ? `Goal done: ${text}` : `Goal failed: ${text}`, tone: e.st === "failed" ? "bad" : e.st === "done" ? "good" : "neutral", src: e.src, undo: [i] });
        break;
      }
      case "use": {
        const per = r.items[e.id]?.uses ?? 0;
        const left = after.items[e.id] > 0 ? after.uses[e.id] ?? per : 0;
        rest.push({ text: `Used ${itemName(r, before, e.id)}${e.n > 1 ? ` ×${e.n}` : ""}${per > 1 && left ? ` · ${left}/${per} left` : ""}`, tone: "neutral", src: e.src, undo: [i] });
        break;
      }
      case "practice": {
        // Progress toward a point; the point itself shows as the stat's own item.
        const rose = events.some((x) => x.t === "stat" && x.id === e.id && (x.d ?? 0) > 0 && x.src === "check");
        const def = r.stats[e.id];
        if (rose || !def || e.d <= 0) break;
        rest.push({ text: `📈 ${def.label} ${Math.round((after.practice[e.id] ?? 0) * 100)}%`, tone: "good", src: e.src });
        break;
      }
      case "contest": {
        const label = (r.conflict.kinds[e.kind]?.label ?? e.kind).toLowerCase();
        contest.push({ text: `${/^[aeiou]/.test(label) ? "An" : "A"} ${label} with ${e.opponent} starts`, tone: "warn", src: e.src, undo: [i] });
        break;
      }
      case "contest_end": {
        const opp = before.contest?.opponent ?? after.lastContest?.opponent ?? "them";
        const text = e.outcome === "won" ? `You win against ${opp}` : e.outcome === "lost" ? `${opp} wins` : e.outcome === "gave_in" ? `You give in to ${opp}` : e.outcome === "escaped" ? `You get away from ${opp}` : `It breaks off with ${opp}`;
        contest.push({ text, tone: e.outcome === "won" ? "good" : e.outcome === "lost" || e.outcome === "gave_in" ? "bad" : "neutral", src: e.src });
        break;
      }
      case "swing":
        swing.d += e.d;
        swing.idx.push(i);
        swing.src = e.src;
        break;
    }
  });

  if (swing.idx.length && Math.abs(swing.d) >= 1) {
    const now = after.contest ?? before.contest;
    const words = now ? momentumWords(after.contest?.momentum ?? now.momentum + swing.d, now.opponent, "You") : "";
    contest.push({ text: `Momentum ${signed(Math.round(swing.d))}${words && after.contest ? ` · ${words.charAt(0).toUpperCase()}${words.slice(1)}` : ""}`, tone: swing.d > 0 ? "good" : "bad", src: swing.src, undo: swing.idx });
  }
  if (timeAgg.set !== null) {
    scene.unshift({ text: `⏱ ${formatClock(r, timeAgg.set, !!after.weekday).time}`, tone: "neutral", src: events[timeAgg.setIdx[0]].src, undo: timeAgg.setIdx });
  } else if (timeAgg.min >= 1) {
    // One clock item per turn; only the story's share of it can be undone.
    const m = timeAgg.min;
    scene.unshift({ text: m >= 60 ? `⏱ +${formatNumber(m / 60)}h` : `⏱ +${Math.round(m)}m`, tone: "neutral", src: timeAgg.narrIdx.length === timeAgg.idx.length ? "narrator" : "action", ...(timeAgg.narrIdx.length ? { undo: timeAgg.narrIdx } : {}) });
  }
  const deltas: ChangeView[] = [];
  const banded = new Set<string>(lined);
  for (const [key, a] of statAgg) {
    const id = key.split("|")[0];
    const def = r.stats[id];
    if (!def || def.kind === "hidden") continue;
    const d = a.set ? (after.stats[id] ?? 0) - (before.stats[id] ?? 0) : a.d;
    if (Math.abs(d) < 0.05) continue;
    const bBefore = bandFor(def, before.stats[id] ?? def.start, statMax(r, def, before));
    const bAfter = bandFor(def, after.stats[id] ?? def.start, statMax(r, def, after));
    const good = def.good === "none" ? null : (d > 0) === (def.good === "high");
    // The new band once per stat (a rules part and a story part move the same stat), never next to its own line.
    const band = bAfter && bBefore !== bAfter && !banded.has(id) ? bAfter.text : undefined;
    if (band) banded.add(id);
    deltas.push({
      text: def.kind === "money" ? `${d > 0 ? "+" : "−"}${formatMoney(r, Math.abs(d))}` : `${def.label} ${signed(d)}`,
      tone: good === null ? "neutral" : good ? "good" : "bad",
      src: a.src,
      band,
      undo: a.idx,
    });
  }
  for (const [key, a] of relAgg) {
    const [who, stat] = key.split("|");
    const def = r.relStats[stat];
    if (!def) continue;
    // A starting read sets the value outright; show how far it moved from the default.
    const d = a.set ? (after.rel[who]?.[stat] ?? def.start) - (before.rel[who]?.[stat] ?? def.start) : a.d;
    if (Math.abs(d) < 0.05) continue;
    const good = def.good === "none" ? null : (d > 0) === (def.good === "high");
    const band = a.set ? bandFor(def, after.rel[who]?.[stat] ?? def.start)?.text : undefined;
    deltas.push({ text: `${personName(r, after, who)} · ${def.label} ${signed(d)}`, tone: good === null ? "neutral" : good ? "good" : "bad", src: a.src, ...(band ? { band } : {}), undo: a.idx });
  }
  for (const [key, a] of itemAgg) {
    const id = key.split("|")[0];
    if (a.d === 0) continue;
    const name = itemName(r, after.items[id] ? after : before, id);
    deltas.push({ text: `${a.d > 0 ? "+" : "−"} ${name}${Math.abs(a.d) > 1 ? ` ×${Math.abs(a.d)}` : ""}`, tone: "neutral", src: a.src, undo: a.idx });
  }
  const out = [...contest, ...scene, ...deltas, ...rest];
  // The cause behind each item (its tooltip).
  const causeOf = (ev: WarpEvent) => ev.why ?? (ev.src === "narrator" ? "Read from the story" : ev.src === "manual" ? "You set this" : null);
  for (const c of out) {
    const why = [...new Set([...(c.why ?? []), ...(c.undo ?? []).map((i) => events[i] && causeOf(events[i])).filter((x): x is string => !!x)])];
    if (why.length) c.why = why;
  }
  return out;
}

/** "d20 14 + 3 = 17 vs 12 (fair)". */
export function checkSummary(c: CheckResult): string {
  const addTxt = c.add ? ` ${c.add > 0 ? "+" : "−"} ${Math.abs(c.add)}` : "";
  return `d20 ${c.roll}${addTxt} = ${c.total} vs ${c.target}${c.difficulty ? ` (${c.difficulty})` : ""}`;
}

export function buildRecordView(r: Ruleset, messageId: string, swipe: number, rec: TurnRecord, before: GameState, after: GameState): RecordView {
  const crossings = bandCrossings(r, before, after);
  const lines = crossingLines(crossings);
  return {
    messageId,
    swipe,
    clock: r.clock.enabled ? formatClock(r, after.minutes, !!after.weekday).label : null,
    action: rec.action?.label ?? null,
    via: rec.action?.via ?? null,
    check: rec.check ? {
      label: rec.check.label,
      dice: rec.check.dice,
      faces: rec.check.faces,
      roll: rec.check.roll,
      add: rec.check.add,
      total: rec.check.total,
      target: rec.check.target,
      style: rec.check.style,
      tier: rec.check.tier,
      tierLabel: TIER_LABEL[rec.check.tier],
      summary: checkSummary(rec.check),
    } : null,
    // Band crossings of this whole record: the dice before the reply and the story's read after it.
    lines,
    contest: contestOfRecord(r, rec, before, after),
    changes: summarizeEvents(r, before, after, rec.events, new Set(crossings.filter((c) => c.who === null && lines.includes(c.line)).map((c) => c.stat))),
    hints: rec.hints,
    veiled: !!rec.veiled,
    confidence: rec.confidence ?? null,
    decisions: (rec.decisions ?? []).map((d) => {
      const spec = findDecide(r, d.id);
      return {
        ask: d.ask,
        picked: d.pickedDesc,
        p: d.p[d.picked] ?? 0,
        source: d.source,
        odds: Object.entries(d.p).map(([k, p]) => ({ desc: d.descs?.[k] ?? spec?.options.find((o) => o.id === k)?.desc ?? k, p })).sort((a, b) => b.p - a.p),
      };
    }),
    redoFrom: null,
  };
}

/** A contest round on a record, structured: the swing, the gauge after it, and how it ended. */
function contestOfRecord(r: Ruleset, rec: TurnRecord, before: GameState, after: GameState): RecordView["contest"] {
  const started = rec.events.find((e) => e.t === "contest") as Extract<WarpEvent, { t: "contest" }> | undefined;
  const c = before.contest ?? (started ? { kind: started.kind, opponent: started.opponent, round: 0, momentum: 0 } : null);
  const rounds = rec.events.filter((e) => e.t === "round").length;
  if (!c || (!rounds && !rec.events.some((e) => e.t === "contest_end"))) return null;
  const end = rec.events.find((e) => e.t === "contest_end") as Extract<WarpEvent, { t: "contest_end" }> | undefined;
  const swing = rec.events.reduce((n, e) => n + (e.t === "swing" ? e.d : 0), 0);
  return {
    kind: c.kind, label: kindOf(r, c.kind).label, opponent: c.opponent,
    round: after.contest?.round ?? c.round + rounds, swing: Math.round(swing),
    momentum: Math.round(after.contest?.momentum ?? Math.max(-100, Math.min(100, c.momentum + swing))),
    outcome: end?.outcome ?? null,
  };
}

function findDecide(r: Ruleset, id: string) {
  const effects = [
    ...Object.values(r.actions).flatMap((a) => [a.cost, a.effects, ...Object.values(a.outcomes)]),
    ...Object.values(r.liveChoices.tags).flatMap((a) => [a.cost, a.effects, ...Object.values(a.outcomes)]),
    ...r.triggers.map((t) => t.effects),
  ];
  const stack = [...effects];
  while (stack.length) {
    const e = stack.pop();
    if (!e) continue;
    for (const d of e.decide) {
      if (d.id === id) return d;
      stack.push(...d.options.map((o) => o.effect));
    }
  }
  return undefined;
}

// ───────────────────────── narrator text ─────────────────────────

function statLine(r: Ruleset, def: StatDef, s: GameState, forceNumbers: boolean): string | null {
  if (def.show === "hidden") return null;
  const v = s.stats[def.id] ?? def.start;
  const max = statMax(r, def, s);
  const band = bandFor(def, v, max);
  const grade = gradeFor(def, v, max);
  // Meters read as value/max; attributes and skills as the value alone (a cap of 999 tells the story nothing).
  const num = def.kind === "money" ? formatMoney(r, v) : grade ? `${grade}` : def.kind === "meter" || def.kind === "hidden" ? `${formatNumber(v)}/${formatNumber(max)}` : formatNumber(v);
  const showNum = forceNumbers || def.show === "number" || def.show === "both" || !band;
  const showText = (def.show === "text" || def.show === "both") && band;
  if (showText && showNum) return `${def.label}: ${band!.text} (${num})`;
  if (showText) return `${def.label}: ${band!.text}`;
  return `${def.label}: ${num}`;
}

/** Words that put money in play this turn. */
const MONEY_WORDS = /\b(buy|buys|bought|pay|pays|paid|price|prices|cost|costs|afford|money|cash|coins?|tip|rent|shop|shopping|sell|sold|wallet|purse|spend|bill|debt|loan|bribe|wage|salary|change)\b/i;
/** Words that put looks and clothes in play this turn. */
const LOOK_WORDS = /\b(wear|wears|wearing|wore|dress|dressed|dresses|shirt|coat|jacket|hoodie|hair|eyes|naked|nude|change|changes|changed|clothes|clothing|outfit|skirt|jeans|shoes|boots|hat|look|looks|face|scar|tattoo|makeup|undress|strip)\b/i;

/**
 * What the turn is about, for the narrator's block: the player's message, the chosen action and the reply
 * before it. With it, the block names only what's in play — everything named in a prompt is something the
 * model will reach for. Without it, the block is complete (the helpers that judge the state need all of it).
 */
export interface DigestFocus { text: string }

/** The look line of one person (or "you") as the narrator gets it, or null. */
function lookSentence(name: string, l: { appearance: string | null; outfit: string | null }): string | null {
  if (!l.appearance && !l.outfit) return null;
  const parts = [l.appearance, l.outfit ? `wears ${l.outfit}` : null].filter(Boolean);
  return `${name}: ${parts.join("; ")}.`;
}

/**
 * Compact state block injected every turn: one short line per field, only fields that matter now
 * (CORE-DESIGN §2.1.4). Without a focus (the helpers), every line is included.
 */
export function stateDigest(r: Ruleset, s: GameState, focus?: DigestFocus): string {
  const nar = focus !== undefined;
  const ft = focus?.text ?? "";
  const named = (name: string, others: string[] = []) => !nar || namesIt(ft, name, others);
  const moneyTalk = !nar || MONEY_WORDS.test(ft);
  const lookTalk = !nar || LOOK_WORDS.test(ft);
  const lines: string[] = [];
  const hereIds = presentPeople(r, s);
  const here = new Set(hereIds);

  // 1. When and where.
  const head: string[] = [];
  if (r.clock.enabled) {
    const c = clockOf(r, s);
    const date = dateAt(r, s.minutes);
    head.push(`${date ? `${c.day} (${ordinal(date.day)} ${date.monthName})` : c.day}, ${c.time} (${c.phase})`);
  }
  if (s.locationName) head.push(s.locationName);
  if (head.length) lines.push(head.join(" · "));

  // 2. Who is here (never "nobody" before the story has said who is).
  if (hereIds.length) lines.push(`Here: ${hereIds.map((id) => personName(r, s, id)).join(", ")}.`);
  const was = Object.entries(s.scene).filter(([id, v]) => v.here && s.people[id] && !s.forgotten[id] && v.loc !== s.location && v.loc === s.lastLocation && !here.has(id)).map(([id]) => personName(r, s, id));
  if (was.length) lines.push(`Were with {{user}} before the move (only if they came along): ${was.join(", ")}.`);

  // 3. The contest.
  if (s.contest) {
    const c = s.contest;
    const kind = kindOf(r, c.kind);
    // Rounds played so far (the narrator block is built after this turn's move, so "round N" would be off by one).
    lines.push(`Contest: ${kind.label.toLowerCase()} with ${c.opponent} — ${c.round ? `after round ${c.round}` : "just started"}, ${momentumWords(c.momentum, c.opponent)}. Not over until the rules end it.`);
  }

  // 4. Looks and clothes of whoever matters now.
  const recent = (turn: number | undefined) => turn !== undefined && s.turn - turn <= 2;
  const lookMatters = (who: string) => !nar || s.turn <= 1 || recent(s.look?.[who]?.turn)
    || (who !== "you" && recent(s.scene[who]?.turn))
    || (lookTalk && (who === "you" ? /\b(i|my|me)\b/i.test(ft) : named(personName(r, s, who))));
  if (lookMatters("you")) { const l = lookSentence("{{user}}", lookLine(s, "you")); if (l) lines.push(l); }
  for (const id of hereIds) if (lookMatters(id)) { const l = lookSentence(personName(r, s, id), lookLine(s, id)); if (l) lines.push(l); }

  // 5. Meters off their start band, money when it's talked about, skills when named, conditions.
  const meters = r.statOrder.map((id) => r.stats[id]).filter((d) => d.kind === "meter" || d.kind === "money");
  const other = r.statOrder.map((id) => r.stats[id]).filter((d) => d.kind === "attribute" || d.kind === "skill");
  const unusual = (d: StatDef) => {
    if (named(d.label)) return true;
    if (d.kind === "money") return moneyTalk;
    if (!d.bands.length) return false;
    const max = statMax(r, d, s);
    return bandFor(d, s.stats[d.id] ?? d.start, max)?.text !== bandFor(d, d.start, max)?.text;
  };
  const ml = meters.filter((d) => !nar || unusual(d)).map((d) => statLine(r, d, s, r.narration.numbers)).filter(Boolean);
  if (ml.length) lines.push(ml.join(" · "));
  const ol = other.filter((d) => named(d.label)).map((d) => statLine(r, d, s, r.narration.numbers)).filter(Boolean);
  if (ol.length) lines.push(`Skills: ${ol.join(" · ")}`);
  const conds = Object.keys(s.conditions).map((id) => r.conditions[id]?.label ?? id);
  if (conds.length) lines.push(`Conditions: ${conds.join(", ")}`);

  // 6. What {{user}} carries: only what the turn names (a listed bag gets rummaged through); the rest is counted.
  const bag = Object.entries(s.items);
  const uses = (id: string) => {
    const per = r.items[id]?.uses ?? 0;
    return per > 1 ? ` (${s.uses[id] ?? per} of ${per} uses left)` : "";
  };
  const bagNames = bag.map(([id]) => itemName(r, s, id));
  const inv = bag.filter(([id]) => named(itemName(r, s, id), bagNames)).map(([id, n]) => `${itemName(r, s, id)}${n > 1 ? ` ×${n}` : ""}${uses(id)}`);
  const rest = bag.length - inv.length;
  if (inv.length) lines.push(`Carrying: ${inv.join(", ")}${rest ? ` (and ${rest} other thing${rest === 1 ? "" : "s"} — not in play; don't bring them up unless {{user}} does)` : ""}`);
  else if (rest) lines.push(`Carrying ${rest} thing${rest === 1 ? "" : "s"}, none in play right now (don't bring them up unless {{user}} does).`);

  // 7. The people here: feelings in words, how they act now, what they remember, and the adults-only floor.
  const feel = (id: string) => {
    const parts = r.relStatOrder.map((rs) => {
      const def = r.relStats[rs];
      if (def.show === "hidden") return null;
      const v = s.rel[id]?.[rs] ?? def.start;
      const words = shownText(def, bandFor(def, v), formatNumber(v));
      return words ? `${def.label} ${words}` : `${def.label} ${formatNumber(v)}`;
    }).filter(Boolean);
    const name = personName(r, s, id);
    return parts.length ? `${name} (${parts.join(", ")})` : name;
  };
  // Feelings nobody has read yet (no authored start, no read from the story, nothing moved them) are the ruleset's
  // default, not this card's: left out, so the first reply follows the card and the greeting. The first read after
  // a reply sets them.
  const unread = (id: string) => !s.calibrated[id] && r.relStatOrder.every((rs) => (s.rel[id]?.[rs] ?? r.relStats[rs].start) === r.relStats[rs].start);
  const felt = hereIds.filter((id) => !unread(id));
  if (felt.length) lines.push(`Relationships (here): ${felt.map(feel).join("; ")}.`);
  const gated = anyAdultGated(r);
  for (const id of hereIds) {
    const name = personName(r, s, id);
    const voice = unread(id) ? null : voiceLine(r, s, id);
    if (voice) lines.push(voice);
    const mem = (s.memories?.[id] ?? []).slice(-3).map((m) => `${m.text}${r.clock.enabled ? ` (${agoWords(s.minutes - m.at)})` : ""}`);
    if (mem.length) lines.push(`${name} remembers: ${mem.join("; ")}`);
    if (gated && isAdult(r, s, id) !== true) lines.push(`${name} is not known to be an adult: nothing romantic or sexual.`);
  }

  // 8. Goals in play.
  const goals = Object.entries(s.goals ?? {}).filter(([id, g]) => goalInPlay(r, s, id, g, here, nar ? ft : null))
    .map(([, g]) => `"${g.text}"${g.from ? ` (for ${personName(r, s, g.from)})` : ""}${g.stakes ? ` — at stake: ${g.stakes}` : ""}`);
  if (goals.length) lines.push(`Goals in play (only the rules decide when a goal is done): ${goals.join("; ")}.`);

  // 9. Who was around lately and isn't now, by name only (never someone {{user}} hasn't met; only the last day's).
  const away = Object.keys(s.people).filter((id) => !here.has(id) && !s.forgotten[id] && hasMet(s, id) && s.scene[id] && s.minutes - s.scene[id].at <= 1440)
    .sort((a, b) => (s.scene[b]?.at ?? -1) - (s.scene[a]?.at ?? -1))
    .slice(0, 4);
  if (away.length) lines.push(`Not in this scene (seen lately; bring them in only if the story calls for it): ${away.map((id) => personName(r, s, id)).join(", ")}`);

  return lines.join("\n");
}

/** What only the narrator knows: opened secret stages. Unopened stage text stays out of the prompt. */
export function narratorKnowledge(r: Ruleset, s: GameState): string | null {
  const lines: string[] = [];
  // Only what touches the scene: a secret about someone who isn't here is no use as subtext.
  // (Secrets about a place or a thing always come.)
  const { here, names } = sceneCast(r, s);
  const offstage = (sec: { about: string; person?: string }) => {
    const id = sec.person && s.people[sec.person] ? sec.person : names.get(sec.about.trim().toLowerCase());
    return !!id && !here.has(id);
  };
  for (const sec of Object.values(r.secrets)) {
    if (offstage(sec)) continue;
    const open = s.secrets[sec.id] ?? -1;
    for (let i = 0; i <= open && i < sec.stages.length; i++) lines.push(`${sec.about}: ${sec.stages[i].text}`);
    if (sec.tell === "exists" && open < sec.stages.length - 1) {
      lines.push(`${sec.about} is keeping something you don't know. If pressed, they deflect or change the subject — don't invent what it is.`);
    }
  }
  return lines.length ? lines.join("\n") : null;
}

/**
 * How the people in the scene feel, as the rules see it — for presentation extensions (the visual-novel
 * extension reads it as `metadata.vn_hints` to pick expressions).
 */
export function sceneHints(r: Ruleset, s: GameState): { moods: Record<string, string>; notes: string[] } | null {
  const moods: Record<string, string> = {};
  for (const id of presentPeople(r, s)) {
    if (!s.people[id]) continue;
    const parts = r.relStatOrder.map((rs) => {
      const def = r.relStats[rs];
      if (def.show === "hidden") return null;
      const band = bandFor(def, s.rel[id]?.[rs] ?? def.start);
      return band ? `${def.label.toLowerCase()}: ${band.text}` : null;
    }).filter(Boolean);
    if (parts.length) moods[personName(r, s, id)] = parts.join("; ");
  }
  const notes: string[] = [];
  if (s.contest) notes.push(`In ${/^[aeiou]/i.test(kindOf(r, s.contest.kind).label) ? "an" : "a"} ${kindOf(r, s.contest.kind).label.toLowerCase()} with ${s.contest.opponent}`);
  return Object.keys(moods).length || notes.length ? { moods, notes } : null;
}

/** The outcome block for a turn: the move, the check (or a contest round's beats), what was applied, directions. */
export function outcomePacket(r: Ruleset, rec: TurnRecord, before: GameState, after: GameState, playerName: string): string | null {
  const lines: string[] = [];
  if (rec.action) lines.push(`${playerName} chose: ${rec.action.label}`);
  if (rec.beats) lines.push(rec.beats);
  else if (rec.check) lines.push(`Check: ${rec.check.label} — ${checkSummary(rec.check)} → ${TIER_LABEL[rec.check.tier].toUpperCase()}`);
  const changes = summarizeEvents(r, before, after, rec.events).map((c) => c.band ? `${c.text} (${c.band})` : c.text);
  if (changes.length) lines.push(`Already applied: ${changes.join(" · ")}`);
  for (const h of rec.hints) lines.push(/^(Show in this reply|Since the last reply):/.test(h) ? h : `Direction: ${h}`);
  if (rec.veiled) lines.push("Handle this beat off-screen: fade to black and describe only the aftermath and consequences.");
  if (!lines.length) return null;
  return lines.join("\n");
}

export { TIERS };
