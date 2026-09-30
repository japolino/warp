// View models for the UI and the text the narrator sees.

import type { Ruleset, StatDef } from "./ruleset.js";
import { TIERS } from "./ruleset.js";
import {
  bandFor, formatClock, formatNumber, gradeFor, itemName, personName, statMax,
  type GameState, type WarpEvent,
} from "./state.js";
import { availableActions, odds, TIER_LABEL, TRAVEL_PREFIX, travelTargets, type CheckResult, type TurnRecord } from "./resolve.js";
import type { ChangeView, ChoiceView, HudView, RecordView, Tone } from "../shared/protocol.js";

function pct(v: number, min: number, max: number) {
  return max > min ? Math.max(0, Math.min(1, (v - min) / (max - min))) : 0;
}

function toneFromPct(p: number, good: StatDef["good"]): Tone {
  if (good === "none") return "neutral";
  const g = good === "high" ? p : 1 - p;
  return g >= 0.67 ? "good" : g >= 0.34 ? "warn" : "bad";
}

function statDisplay(def: StatDef, v: number, max: number, currency: string): string {
  if (def.kind === "money") return `${currency}${formatNumber(v)}`;
  if (def.kind === "meter" && max !== 100) return `${formatNumber(v)} / ${formatNumber(max)}`;
  return formatNumber(v);
}

export function buildHud(r: Ruleset, s: GameState): HudView {
  const bars = r.hud.bars.map((id) => {
    const def = r.stats[id];
    const v = s.stats[id] ?? def.start;
    const max = statMax(r, def, s);
    const band = bandFor(def, v);
    const p = pct(v, def.min, max);
    return {
      id, label: def.label, value: v,
      display: statDisplay(def, v, max, r.hud.currency),
      pct: p,
      text: band?.text ?? null,
      tone: band?.tone ?? toneFromPct(p, def.good),
      good: def.good,
      color: def.color,
      desc: def.desc,
    };
  });

  const skills = r.statOrder
    .filter((id) => (r.stats[id].kind === "attribute" || r.stats[id].kind === "skill") && !r.hud.bars.includes(id))
    .map((id) => {
      const def = r.stats[id];
      const v = s.stats[id] ?? def.start;
      const max = statMax(r, def, s);
      const band = bandFor(def, v);
      return {
        id, label: def.label,
        display: formatNumber(v),
        grade: gradeFor(def, v, max),
        pct: pct(v, def.min, max),
        kind: def.kind as "attribute" | "skill",
        text: band?.text ?? null,
        tone: band?.tone ?? "neutral" as Tone,
      };
    });

  const people = Object.entries(s.people).map(([id, p]) => ({
    id, name: p.name,
    stats: r.relStatOrder.map((rs) => {
      const def = r.relStats[rs];
      const v = s.rel[id]?.[rs] ?? def.start;
      const band = bandFor(def, v);
      const pp = pct(v, def.min, def.max);
      return { id: rs, label: def.label, display: formatNumber(v), pct: pp, text: band?.text ?? null, tone: band?.tone ?? toneFromPct(pp, def.good) };
    }),
  }));

  const items = Object.entries(s.items).map(([id, count]) => ({ id, name: itemName(r, s, id), count }));

  const conditions = Object.entries(s.conditions).map(([id, c]) => {
    const def = r.conditions[id];
    const left = c.until !== null ? c.until - s.minutes : null;
    return {
      id,
      label: def?.label ?? id,
      tone: def?.tone ?? "warn",
      desc: def?.desc,
      remaining: left !== null && left > 0 ? (left >= 60 ? `${Math.round(left / 60)}h` : `${left}m`) : undefined,
    };
  });

  const money = r.hud.money ? statDisplay(r.stats[r.hud.money], s.stats[r.hud.money] ?? 0, 0, r.hud.currency) : null;
  const loc = s.location ? r.locations[s.location] : undefined;

  return {
    rulesetName: r.name,
    clock: r.clock.enabled ? formatClock(r, s.minutes) : null,
    location: s.locationName ? { name: s.locationName, desc: loc?.desc } : null,
    money,
    bars: bars.filter((b) => r.stats[b.id].kind !== "money"),
    skills,
    people,
    items,
    conditions,
    turn: s.turn,
  };
}

export function buildChoices(r: Ruleset, s: GameState, opts: { lines: string[]; veils: string[] }): ChoiceView[] {
  const veils = new Set(opts.veils.map((v) => v.toLowerCase()));
  const travel: ChoiceView[] = travelTargets(r, s).map((id) => ({
    id: `${TRAVEL_PREFIX}${id}`,
    label: `Go to ${r.locations[id].name}`,
    group: "Travel",
    desc: r.locations[id].desc ?? null,
    odds: null, partialOdds: null, checkLabel: null, veiled: false, params: [],
  }));
  const actions = availableActions(r, s, opts.lines)
    .filter((a) => !a.hidden)
    .map((a) => {
      const o = odds(r, s, a);
      return {
        id: a.id,
        label: a.label,
        group: a.group ?? null,
        desc: a.desc ?? null,
        odds: o ? o.success : null,
        partialOdds: o && o.partial > 0 ? o.partial : null,
        checkLabel: a.check?.label ?? null,
        veiled: a.tags.some((t) => veils.has(t)),
        params: a.params.map((p) => ({ id: p.id, label: p.label, options: Object.keys(p.options), default: p.default })),
      };
    });
  return [...actions, ...travel];
}

// ───────────────────────── change summaries ─────────────────────────

function signed(n: number) {
  const f = formatNumber(n);
  return n > 0 ? `+${f}` : f;
}

/**
 * Summarise a record's events into short chips ("Fatigue +20", "+ Lockpick").
 * Drift and trigger bookkeeping are folded away; the HUD shows those.
 */
export function summarizeEvents(r: Ruleset, before: GameState, after: GameState, events: WarpEvent[]): ChangeView[] {
  const out: ChangeView[] = [];
  const statAgg = new Map<string, { d: number; idx: number[]; src: string; set: boolean }>();
  const relAgg = new Map<string, { d: number; idx: number[]; src: string }>();
  const itemAgg = new Map<string, { d: number; idx: number[]; src: string }>();
  const timeAgg = { min: 0, idx: [] as number[], narrIdx: [] as number[] };

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
        const a = relAgg.get(key) ?? { d: 0, idx: [], src: e.src };
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
        out.push({ text: `→ ${after.locationName ?? e.to}`, tone: "neutral", src: e.src, undo: [i] });
        break;
      case "time":
        timeAgg.min += e.min;
        timeAgg.idx.push(i);
        if (e.src === "narrator") timeAgg.narrIdx.push(i);
        break;
      case "cond": {
        const label = r.conditions[e.id]?.label ?? e.id;
        if (e.note === "expired") break;
        out.push({ text: e.on ? `${label}` : `${label} ended`, tone: e.on ? r.conditions[e.id]?.tone ?? "warn" : "good", src: e.src, undo: [i] });
        break;
      }
      case "person":
        out.push({ text: `Met ${e.name}`, tone: "neutral", src: e.src, undo: [i] });
        break;
    }
  });

  if (timeAgg.min >= 1) {
    // One clock chip per turn; only the narrator's share of it can be undone.
    const m = timeAgg.min;
    out.unshift({ text: m >= 60 ? `⏱ +${formatNumber(m / 60)}h` : `⏱ +${Math.round(m)}m`, tone: "neutral", src: timeAgg.narrIdx.length === timeAgg.idx.length ? "narrator" : "action" });
  }
  for (const [key, a] of statAgg) {
    const id = key.split("|")[0];
    const def = r.stats[id];
    if (!def || def.kind === "hidden") continue;
    const d = a.set ? (after.stats[id] ?? 0) - (before.stats[id] ?? 0) : a.d;
    if (Math.abs(d) < 0.05) continue;
    const bBefore = bandFor(def, before.stats[id] ?? def.start);
    const bAfter = bandFor(def, after.stats[id] ?? def.start);
    const good = def.good === "none" ? null : (d > 0) === (def.good === "high");
    out.push({
      text: def.kind === "money" ? `${d > 0 ? "+" : "−"}${r.hud.currency}${formatNumber(Math.abs(d))}` : `${def.label} ${signed(d)}`,
      tone: good === null ? "neutral" : good ? "good" : "bad",
      src: a.src,
      band: bAfter && bBefore !== bAfter ? bAfter.text : undefined,
      undo: a.idx,
    });
  }
  for (const [key, a] of relAgg) {
    const [who, stat] = key.split("|");
    const def = r.relStats[stat];
    if (!def || Math.abs(a.d) < 0.05) continue;
    const good = def.good === "none" ? null : (a.d > 0) === (def.good === "high");
    out.push({ text: `${personName(r, after, who)} · ${def.label} ${signed(a.d)}`, tone: good === null ? "neutral" : good ? "good" : "bad", src: a.src, undo: a.idx });
  }
  for (const [key, a] of itemAgg) {
    const id = key.split("|")[0];
    if (a.d === 0) continue;
    const name = itemName(r, after.items[id] ? after : before, id);
    out.push({ text: `${a.d > 0 ? "+" : "−"} ${name}${Math.abs(a.d) > 1 ? ` ×${Math.abs(a.d)}` : ""}`, tone: "neutral", src: a.src, undo: a.idx });
  }
  return out;
}

export function checkSummary(c: CheckResult): string {
  const addTxt = c.add ? ` ${c.add > 0 ? "+" : "−"} ${Math.abs(c.add)}` : "";
  switch (c.style) {
    case "chance": return `${c.dice}: ${c.roll}${addTxt}${c.add ? ` = ${c.total}` : ""}, needed ${c.target} or less`;
    case "vs": return `${c.dice}: ${c.roll}${addTxt} = ${c.total} vs ${c.target}`;
    case "pbta": return `${c.dice}: ${c.roll}${addTxt} = ${c.total} (10+ hit, 7–9 mixed)`;
  }
}

export function buildRecordView(r: Ruleset, messageId: string, swipe: number, rec: TurnRecord, before: GameState, after: GameState): RecordView {
  return {
    messageId,
    swipe,
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
    changes: summarizeEvents(r, before, after, rec.events),
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
        odds: Object.entries(d.p).map(([k, p]) => ({ desc: spec?.options.find((o) => o.id === k)?.desc ?? k, p })).sort((a, b) => b.p - a.p),
      };
    }),
    contradiction: rec.contradiction ?? null,
    redoFrom: null,
  };
}

function findDecide(r: Ruleset, id: string) {
  const effects = [
    ...Object.values(r.actions).flatMap((a) => [a.cost, a.effects, ...Object.values(a.outcomes)]),
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
  const band = bandFor(def, v);
  const grade = gradeFor(def, v, max);
  const num = def.kind === "money" ? `${r.hud.currency}${formatNumber(v)}` : grade ? `${grade}` : `${formatNumber(v)}/${formatNumber(max)}`;
  const showNum = forceNumbers || def.show === "number" || def.show === "both" || !band;
  const showText = (def.show === "text" || def.show === "both") && band;
  if (showText && showNum) return `${def.label}: ${band!.text} (${num})`;
  if (showText) return `${def.label}: ${band!.text}`;
  return `${def.label}: ${num}`;
}

/** Compact state block injected every turn. */
export function stateDigest(r: Ruleset, s: GameState): string {
  const lines: string[] = [];
  const head: string[] = [];
  if (r.clock.enabled) { const c = formatClock(r, s.minutes); head.push(`${c.day}, ${c.time} (${c.phase})`); }
  if (s.locationName) head.push(`Location: ${s.locationName}`);
  if (head.length) lines.push(head.join(" · "));

  const meters = r.statOrder.map((id) => r.stats[id]).filter((d) => d.kind === "meter" || d.kind === "money");
  const other = r.statOrder.map((id) => r.stats[id]).filter((d) => d.kind === "attribute" || d.kind === "skill");
  const ml = meters.map((d) => statLine(r, d, s, r.narration.numbers)).filter(Boolean);
  if (ml.length) lines.push(ml.join(" · "));
  const ol = other.map((d) => statLine(r, d, s, r.narration.numbers)).filter(Boolean);
  if (ol.length) lines.push(`Abilities: ${ol.join(" · ")}`);

  const conds = Object.keys(s.conditions).map((id) => r.conditions[id]?.label ?? id);
  if (conds.length) lines.push(`Conditions: ${conds.join(", ")}`);

  const inv = Object.entries(s.items).map(([id, n]) => `${itemName(r, s, id)}${n > 1 ? ` ×${n}` : ""}`);
  if (inv.length) lines.push(`Carrying: ${inv.join(", ")}`);

  const ppl = Object.entries(s.people).map(([id, p]) => {
    const parts = r.relStatOrder.map((rs) => {
      const def = r.relStats[rs];
      if (def.show === "hidden") return null;
      const v = s.rel[id]?.[rs] ?? def.start;
      const band = bandFor(def, v);
      return band && def.show !== "number" ? `${def.label} ${band.text}` : `${def.label} ${formatNumber(v)}`;
    }).filter(Boolean);
    return parts.length ? `${p.name} (${parts.join(", ")})` : p.name;
  });
  if (ppl.length) lines.push(`Relationships: ${ppl.join("; ")}`);

  return lines.join("\n");
}

/** The outcome block for a turn with an action. */
export function outcomePacket(r: Ruleset, rec: TurnRecord, before: GameState, after: GameState, playerName: string): string | null {
  const lines: string[] = [];
  if (rec.action) lines.push(`${playerName} chose: ${rec.action.label}`);
  if (rec.check) lines.push(`Check: ${rec.check.label} — ${checkSummary(rec.check)} → ${TIER_LABEL[rec.check.tier].toUpperCase()}`);
  const changes = summarizeEvents(r, before, after, rec.events).map((c) => c.band ? `${c.text} (${c.band})` : c.text);
  if (changes.length) lines.push(`Already applied: ${changes.join(" · ")}`);
  for (const h of rec.hints) lines.push(`Direction: ${h}`);
  if (rec.veiled) lines.push("Handle this beat off-screen: fade to black and describe only the aftermath and consequences.");
  if (!lines.length) return null;
  return lines.join("\n");
}

export { TIERS };
