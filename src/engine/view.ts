// View models for the UI and the text the narrator sees.

import type { KeepSpec, Ruleset, StatDef } from "./ruleset.js";
import { TIERS } from "./ruleset.js";
import {
  bandFor, formatClock, formatNumber, gradeFor, initialState, itemName, kinAge, makeEnv, personName, statMax,
  type GameState, type WarpEvent,
} from "./state.js";
import { availableChoices, LIVE_PREFIX, odds, perkBlocker, RUN_EPILOGUE, TIER_LABEL, TRAVEL_PREFIX, travelTargets, type CheckResult, type LiveChoice, type TurnRecord } from "./resolve.js";
import {
  dateAt, exposedSlots, isIndoors, ordinal, personLocation, presentPeople, seasonAt, temperatureAt, warmthNeeded, warmthOf, weatherAt,
} from "./world.js";
import type { ChangeView, ChoiceView, ClothingView, HudView, MapView, RecordView, Tone } from "../shared/protocol.js";
import { dungeonOf, dungeonsHere, levelOf, memberFighter } from "./dungeon/run.js";
import { activeSession, dateDigest, dateMoves, moodOf, type DateMove } from "./date/talk.js";
import { REACTION_LABEL } from "./date/types.js";
import { evalBool } from "./expr.js";

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
      id, label: def.label, value: v, min: def.min, max,
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

  const env = makeEnv(r, s);
  const here = new Set(presentPeople(r, s, env));
  const people = Object.entries(s.people).map(([id, p]) => {
    const where = r.people[id]?.schedule.length ? personLocation(r, s, id, env) : null;
    return {
      id, name: p.name,
      stats: r.relStatOrder.map((rs) => {
        const def = r.relStats[rs];
        const v = s.rel[id]?.[rs] ?? def.start;
        const band = bandFor(def, v);
        const pp = pct(v, def.min, def.max);
        return { id: rs, label: def.label, value: v, min: def.min, max: def.max, display: formatNumber(v), pct: pp, text: band?.text ?? null, tone: band?.tone ?? toneFromPct(pp, def.good) };
      }),
      present: here.has(id),
      whereabouts: where ? r.locations[where]?.name ?? where : null,
      goal: r.companions[id]?.goal ?? null,
      bonds: Object.entries(s.bonds[id] ?? {}).filter(([b, v]) => s.people[b] && Math.abs(v) >= 25).map(([b, v]) => `${bondWord(v)} ${personName(r, s, b)}`),
    };
  }).sort((a, b) => Number(b.present) - Number(a.present));

  const wornIds = new Set(Object.values(s.worn));
  const clothingView = (id: string): ClothingView => {
    const d = r.items[id];
    return {
      id, name: itemName(r, s, id), slot: d?.slot ?? "", warmth: d?.warmth ?? 0, reveal: d?.reveal ?? 0, traits: d?.traits ?? [],
      integrity: d && s.integrity[id] !== undefined ? Math.round((s.integrity[id] / d.integrity) * 100) : null,
      worn: wornIds.has(id),
    };
  };
  const items = Object.entries(s.items).map(([id, count]) => ({ id, name: itemName(r, s, id), count, worn: wornIds.has(id) }));
  const clothing = Object.keys(s.items).filter((id) => r.items[id]?.slot).map(clothingView);
  const outfit = r.wardrobe.enabled
    ? r.wardrobe.slots.map((sl) => ({ slot: sl.id, label: sl.label, item: s.worn[sl.id] ? clothingView(s.worn[sl.id]) : null }))
    : null;

  const temp = temperatureAt(r, s);
  const wx = weatherAt(r, s);
  const date = dateAt(r, s.minutes);
  let warmth: HudView["warmth"] = null;
  if (r.wardrobe.enabled && temp !== null) {
    const need = warmthNeeded(temp);
    const value = warmthOf(r, s);
    const cold = value < need.min, hot = value > need.max;
    warmth = {
      value, min: need.min, max: need.max,
      tone: cold || hot ? (Math.min(Math.abs(value - need.min), Math.abs(value - need.max)) > 6 ? "bad" : "warn") : "good",
      text: cold ? "You're underdressed for this." : hot ? "You're overdressed and sweltering." : "Dressed right for the weather.",
    };
  }

  let encounter: HudView["encounter"] = null;
  if (s.encounter) {
    const enc = r.encounters[s.encounter.id];
    encounter = {
      name: enc?.name ?? s.encounter.id,
      foe: enc?.foe.name ?? "Opponent",
      round: s.encounter.round,
      momentum: s.encounter.momentum ?? null,
      stats: (enc?.foe.stats ?? []).map((fs) => {
        const v = s.encounter!.foe[fs.id] ?? fs.start;
        const p = pct(v, 0, fs.max);
        return { id: fs.id, label: fs.label, value: v, max: fs.max, pct: p, tone: toneFromPct(p, fs.good === "none" ? "none" : fs.good === "high" ? "high" : "low") };
      }),
    };
  }

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
    date: date ? `${r.clock.weekdays[Math.floor(s.minutes / 1440) % r.clock.weekdays.length] ?? ""} ${ordinal(date.day)} ${date.monthName}`.trim() : null,
    weather: temp !== null ? { icon: isIndoors(r, s) ? "🏠" : wx?.icon ?? "", label: isIndoors(r, s) ? "Indoors" : wx?.label ?? "", temp, season: seasonAt(r, s.minutes), indoors: isIndoors(r, s) } : null,
    location: s.locationName ? { name: s.locationName, desc: loc?.desc } : null,
    money,
    bars: bars.filter((b) => r.stats[b.id].kind !== "money"),
    skills,
    people,
    items,
    conditions,
    warmth,
    outfit,
    clothing,
    exposed: exposedSlots(r, s),
    encounter,
    codex: Object.values(r.codex).filter((c) => s.codex[c.id]).map((c) => ({ id: c.id, title: c.title, text: c.text, category: c.category ?? null })),
    codexTotal: Object.keys(r.codex).length,
    feats: Object.values(r.feats).filter((f) => !f.hidden || s.feats[f.id]).map((f) => ({ id: f.id, name: f.name, desc: f.desc, unlocked: !!s.feats[f.id] })),
    perks: Object.values(r.perks).map((p) => ({ id: p.id, name: p.name, desc: p.desc, cost: p.cost, owned: !!s.perks[p.id], blocker: s.perks[p.id] ? null : perkBlocker(r, s, p.id) })),
    perkPoints: r.perkPoints ? s.stats[r.perkPoints] ?? 0 : null,
    news: s.news.slice().reverse().slice(0, 12).map((n) => ({ text: n.text, when: r.clock.enabled ? formatClock(r, n.at).day : null })),
    body: r.body.enabled ? Object.entries(s.body).map(([part, traits]) => ({
      part, label: part.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), text: traitText(traits) || "—", covered: bodyCovered(r, s, part),
    })) : null,
    family: [
      ...(s.pregnancy && s.pregnancy.told > 0 ? [{ name: s.pregnancy.carrier === "player" ? "Expecting" : `${personName(r, s, s.pregnancy.carrier)} is expecting`, text: `${Math.floor((s.minutes - s.pregnancy.since) / 1440 / 7)} of ${r.lineage.weeks} weeks` }] : []),
      ...Object.entries(s.kin).map(([id, k]) => ({ name: k.name, text: `${k.sex === "girl" ? "Daughter" : "Son"}, ${kinAge(r, s, id)}${k.joined ? " · grown up" : ""}` })),
    ],
    transforms: Object.values(r.body.transforms).filter((t) => (s.tf[t.id] ?? 0) > 0).map((t) => ({ label: t.label, stage: s.tf[t.id], of: t.stages.length })),
    run: r.checkpoints.enabled ? {
      slots: Array.from({ length: r.checkpoints.slots }, (_, i) => ({ id: String(i + 1), label: s.saves[String(i + 1)]?.label ?? null })),
      auto: s.saves.auto?.label ?? null,
      runs: s.runs,
      loops: s.loops,
      hard: r.checkpoints.hard,
      ended: s.ended ? { title: r.endings[s.ended.id]?.title ?? s.ended.id, kind: r.endings[s.ended.id]?.kind ?? "neutral", text: r.endings[s.ended.id]?.text ?? "", told: s.ended.told } : null,
      keeps: keepWords(r, r.checkpoints.keep),
      legacy: keepWords(r, r.legacy),
    } : null,
    turn: s.turn,
  };
}

/** A radial map: the start location in the middle, neighbours around it (authored `pos:` wins). */
export function buildMap(r: Ruleset, s: GameState): MapView | null {
  const ids = Object.keys(r.locations);
  if (ids.length < 2) return null;
  const pos = new Map<string, [number, number]>();
  if (ids.every((id) => r.locations[id].pos)) {
    for (const id of ids) pos.set(id, r.locations[id].pos!);
  } else {
    // Centre on the best-connected place (the hub), so spokes radiate from it.
    const root = ids.reduce((best, id) => (r.locations[id].exits.length > r.locations[best].exits.length ? id : best),
      r.startLocation && r.locations[r.startLocation] ? r.startLocation : ids[0]);
    // BFS tree, then give each subtree an angular slice proportional to its size.
    const children = new Map<string, string[]>();
    const depth = new Map<string, number>([[root, 0]]);
    const queue = [root];
    while (queue.length) {
      const id = queue.shift()!;
      for (const x of r.locations[id].exits) {
        if (!r.locations[x] || depth.has(x)) continue;
        depth.set(x, depth.get(id)! + 1);
        children.set(id, [...(children.get(id) ?? []), x]);
        queue.push(x);
      }
    }
    // Unconnected places go on an outer ring.
    for (const id of ids) if (!depth.has(id)) { depth.set(id, 3); children.set(root, [...(children.get(root) ?? []), id]); }
    const size = (id: string): number => 1 + (children.get(id) ?? []).reduce((a, c) => a + size(c), 0);
    const place = (id: string, a0: number, a1: number) => {
      const d = depth.get(id)!;
      const a = (a0 + a1) / 2;
      pos.set(id, [Math.cos(a) * d * 110, Math.sin(a) * d * 110]);
      const kids = children.get(id) ?? [];
      const total = kids.reduce((n, c) => n + size(c), 0) || 1;
      let start = a0;
      for (const c of kids) {
        const span = ((a1 - a0) * size(c)) / total;
        place(c, start, start + span);
        start += span;
      }
    };
    place(root, -Math.PI / 2, (3 * Math.PI) / 2);
  }
  const env = makeEnv(r, s);
  const peopleAt = new Map<string, string[]>();
  for (const pid of Object.keys(r.people).filter((id) => !s.forgotten[id])) {
    const at = personLocation(r, s, pid, env);
    if (at) peopleAt.set(at, [...(peopleAt.get(at) ?? []), personName(r, s, pid)]);
  }
  const reach = new Set(travelTargets(r, s));
  const edges: [string, string][] = [];
  const seen = new Set<string>();
  for (const id of ids) for (const x of r.locations[id].exits) {
    const k = [id, x].sort().join("|");
    if (r.locations[x] && !seen.has(k)) { seen.add(k); edges.push([id, x]); }
  }
  return {
    nodes: ids.map((id) => {
      const [x, y] = pos.get(id) ?? [0, 0];
      return { id, name: r.locations[id].name, x, y, here: s.location === id, reachable: reach.has(id), indoors: r.locations[id].indoors, people: peopleAt.get(id) ?? [] };
    }),
    edges,
  };
}

/** Is a body part covered by what's worn (so others can't see it)? */
export function bodyCovered(r: Ruleset, s: GameState, part: string): boolean {
  const slots = r.body.hiddenBy[part];
  return !!slots?.length && r.wardrobe.enabled && slots.every((slot) => !!s.worn[slot]);
}

function traitText(traits: Record<string, string>): string {
  const t = Object.entries(traits).filter(([, v]) => v && v !== "none");
  return t.map(([k, v]) => (k === "type" ? v : `${k.replace(/_/g, " ")} ${v}`)).join(", ");
}

/** The body as the narrator sees it: every part, and which are covered right now. */
export function bodyLine(r: Ruleset, s: GameState): string | null {
  if (!r.body.enabled) return null;
  const parts = Object.entries(s.body).map(([part, traits]) => [part, traitText(traits)] as const).filter(([, t]) => t);
  if (!parts.length) return null;
  const covered = parts.filter(([p]) => bodyCovered(r, s, p)).map(([p]) => p.replace(/_/g, " "));
  return `Body: ${parts.map(([p, t]) => `${p.replace(/_/g, " ")} — ${t}`).join("; ")}${covered.length ? ` (covered, not visible to others: ${covered.join(", ")})` : ""}`;
}

export function bondWord(v: number): string {
  return v >= 60 ? "devoted to" : v >= 25 ? "fond of" : v > -25 ? "neutral toward" : v > -60 ? "cool toward" : "hostile toward";
}

/** How the people the player knows feel about each other (only the notable ones). */
function bondLines(r: Ruleset, s: GameState): string[] {
  const out: string[] = [];
  for (const [a, m] of Object.entries(s.bonds)) {
    if (!s.people[a]) continue;
    for (const [b, v] of Object.entries(m)) if (s.people[b] && Math.abs(v) >= 25) out.push(`${personName(r, s, a)} is ${bondWord(v)} ${personName(r, s, b)}`);
  }
  return out;
}

/** "codex, feats and trust" — what a rewind keeps, in words. */
export function keepWords(r: Ruleset, k: KeepSpec): string {
  const parts = [
    k.codex && "the codex", k.feats && "feats", k.perks && "perks", k.secrets && "secrets learned", k.people && "people met", k.dating && "what you know of people's tastes", k.deepest && "dungeon progress",
    ...k.stats.map((id) => r.stats[id]?.label ?? id), ...k.flags.map((id) => r.flags[id]?.label ?? id.replace(/_/g, " ")),
    ...k.items.map((id) => itemName(r, initialState(r), id)), ...k.rel.map((id) => r.relStats[id]?.label ?? id),
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(", ") : "nothing";
}

export function buildChoices(r: Ruleset, s: GameState, opts: { lines: string[]; veils: string[]; live?: LiveChoice[] }): ChoiceView[] {
  const veils = new Set(opts.veils.map((v) => v.toLowerCase()));
  const lines = new Set(opts.lines.map((v) => v.toLowerCase()));
  // Choices written for this moment come first; their tag decides the check and the odds.
  const live: ChoiceView[] = [];
  const plain = (id: string, label: string, group: string, desc: string | null = null): ChoiceView =>
    ({ id, label, group, desc, odds: null, partialOdds: null, checkLabel: null, veiled: false, params: [] });
  // The story has ended: see it written, rewind, start over, or (unless hard mode) keep going.
  if (s.ended) {
    const e = r.endings[s.ended.id];
    const group = `The end · ${e?.title ?? ""}`.trim();
    return [
      ...(!s.ended.told ? [plain(RUN_EPILOGUE, "See how it ends", group, "The narrator writes the ending")] : []),
      plain("run:restart", "Start over", group, `A new playthrough from the beginning. Carries over: ${keepWords(r, r.legacy)}`),
      ...Object.entries(s.saves).map(([slot, v]) => plain(`run:load:${slot}`, `Load ${slot === "auto" ? "autosave" : `slot ${slot}`}`, group, v.label)),
      ...(!r.checkpoints.hard ? [plain("run:continue", "Keep playing", group, "Carry on past the ending")] : []),
    ];
  }
  // In a dungeon the map is where you act; the story only offers moments and the way out.
  if (s.dungeon) {
    const d = dungeonOf(r, s.dungeon);
    return [
      plain("dungeon:open", s.dungeon.battle ? "Back to the fight" : s.dungeon.pending ? "Decide what to do" : "Keep exploring", d?.name ?? "Dungeon", "Open the dungeon map"),
      plain("dungeon:leave", "Leave the dungeon", d?.name ?? "Dungeon", "Climb back out with what you've found"),
    ];
  }
  // A conversation or date takes over the choices: featured topics and moves, plus the full list in the drawer.
  const asChoice = (m: DateMove): ChoiceView => ({
    id: m.id, label: m.label, group: m.group, desc: m.desc, odds: m.odds, partialOdds: null, checkLabel: null,
    veiled: m.romantic && (veils.has("romance") || veils.has("romantic")), params: [],
  });
  const moves = s.encounter ? [] : dateMoves(r, s, opts.lines);
  if (activeSession(r, s)) {
    const featured = moves.filter((m) => m.featured).map(asChoice);
    // "More…" sits last, with the moves, so hotkeys run in the order the buttons appear.
    const lastGroup = featured[featured.length - 1]?.group ?? "Talk";
    const more = moves.length > featured.length ? [plain("date:open", "More…", lastGroup, "Every topic, gift and move — and what you know about them")] : [];
    return [...featured, ...more];
  }
  const talk = moves.filter((m) => m.featured).map(asChoice);
  const dungeons = dungeonsHere(r, s).map((d) => plain(`dungeon:enter:${d.id}`, `Enter ${d.name}`, "Dungeon", d.desc ?? null));
  if (!s.encounter) (opts.live ?? []).forEach((c, i) => {
    const a = r.liveChoices.tags[c.tag];
    if (!a || a.tags.some((t) => lines.has(t))) return;
    const o = odds(r, s, a, undefined, c.target);
    live.push({
      id: `${LIVE_PREFIX}${i}`,
      label: c.label,
      group: r.liveChoices.label,
      desc: a.desc ?? null,
      odds: o ? o.success : null,
      partialOdds: o && o.partial > 0 ? o.partial : null,
      checkLabel: a.check?.label ?? null,
      veiled: a.tags.some((t) => veils.has(t)),
      params: [],
    });
  });
  const travel: ChoiceView[] = travelTargets(r, s).map((id) => ({
    id: `${TRAVEL_PREFIX}${id}`,
    label: `Go to ${r.locations[id].name}`,
    group: "Travel",
    desc: r.locations[id].desc ?? null,
    odds: null, partialOdds: null, checkLabel: null, veiled: false, params: [],
  }));
  const encName = s.encounter ? r.encounters[s.encounter.id]?.name ?? "Encounter" : null;
  const actions = availableChoices(r, s, opts.lines)
    .filter(({ a }) => !a.hidden)
    .map(({ id, a, target, label }) => {
      const o = odds(r, s, a, undefined, target);
      return {
        id,
        label,
        group: encName ?? a.group ?? null,
        desc: a.desc ?? null,
        odds: o ? o.success : null,
        partialOdds: o && o.partial > 0 ? o.partial : null,
        checkLabel: a.check?.label ?? null,
        veiled: a.tags.some((t) => veils.has(t)),
        params: a.params.map((p) => ({ id: p.id, label: p.label, options: Object.keys(p.options), default: p.default })),
      };
    });
  return [...live, ...actions, ...talk, ...dungeons, ...travel];
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
  const relAgg = new Map<string, { d: number; idx: number[]; src: string; set: boolean }>();
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
      case "wear": {
        const prev = before.worn[e.slot];
        if (e.item) out.push({ text: `👕 Put on ${itemName(r, after, e.item)}`, tone: "neutral", src: e.src, undo: [i] });
        else if (prev) out.push({ text: `👕 Took off ${itemName(r, before, prev)}`, tone: "neutral", src: e.src, undo: [i] });
        break;
      }
      case "dmg": {
        const gone = !(after.items[e.item] > 0);
        out.push({ text: gone ? `💥 ${itemName(r, before, e.item)} destroyed` : `🧵 ${itemName(r, after, e.item)} damaged`, tone: "bad", src: e.src, undo: [i] });
        break;
      }
      case "enc":
        if (e.id) out.push({ text: `⚔ ${r.encounters[e.id]?.name ?? "Encounter"}`, tone: "warn", src: e.src });
        else out.push({ text: `⚔ Over: ${(e.outcome ?? "ended").replace(/_/g, " ")}`, tone: "neutral", src: e.src });
        break;
      case "foe": {
        const enc = before.encounter ?? after.encounter;
        const def = enc ? r.encounters[enc.id] : undefined;
        const fs = def?.foe.stats.find((x) => x.id === e.stat);
        if (e.d) out.push({ text: `${def?.foe.name ?? "Foe"} ${fs?.label ?? e.stat} ${signed(e.d)}`, tone: (e.d < 0) === (fs?.good !== "high") ? "good" : "bad", src: e.src });
        break;
      }
      case "codex":
        out.push({ text: `📖 ${r.codex[e.id]?.title ?? e.id}`, tone: "good", src: e.src });
        break;
      case "feat":
        out.push({ text: `🏆 ${r.feats[e.id]?.name ?? e.id}`, tone: "good", src: e.src });
        break;
      case "perk":
        out.push({ text: `★ ${r.perks[e.id]?.name ?? e.id}`, tone: "good", src: e.src });
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
    if (!def) continue;
    // A starting read sets the value outright; show how far it moved from the default.
    const d = a.set ? (after.rel[who]?.[stat] ?? def.start) - (before.rel[who]?.[stat] ?? def.start) : a.d;
    if (Math.abs(d) < 0.05) continue;
    const good = def.good === "none" ? null : (d > 0) === (def.good === "high");
    const band = a.set ? bandFor(def, after.rel[who]?.[stat] ?? def.start)?.text : undefined;
    out.push({ text: `${personName(r, after, who)} · ${def.label} ${signed(d)}`, tone: good === null ? "neutral" : good ? "good" : "bad", src: a.src, ...(band ? { band } : {}), undo: a.idx });
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
    clock: r.clock.enabled ? formatClock(r, after.minutes).label : null,
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
        odds: Object.entries(d.p).map(([k, p]) => ({ desc: d.descs?.[k] ?? spec?.options.find((o) => o.id === k)?.desc ?? k, p })).sort((a, b) => b.p - a.p),
      };
    }),
    contradiction: rec.contradiction ?? null,
    mind: rec.mind ? { cause: rec.mind.cause, kind: rec.mind.kind, meant: rec.mind.meant, chance: rec.mind.chance } : null,
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
  const hud = buildHud(r, s);
  if (r.clock.enabled) {
    const c = formatClock(r, s.minutes);
    head.push(`${hud.date ?? c.day}, ${c.time} (${c.phase})`);
  }
  if (s.locationName) head.push(`Location: ${s.locationName}${hud.weather?.indoors ? " (indoors)" : ""}`);
  if (hud.weather) head.push(hud.weather.indoors ? `${hud.weather.temp}°C inside` : `${hud.weather.label}, ${hud.weather.temp}°C${hud.weather.season ? ` (${hud.weather.season})` : ""}`);
  if (head.length) lines.push(head.join(" · "));

  if (hud.encounter) {
    const e = hud.encounter;
    lines.push(`ENCOUNTER in progress: ${e.name} vs ${e.foe}, round ${e.round}${e.stats.length ? ` — ${e.stats.map((x) => `${x.label} ${formatNumber(x.value)}/${formatNumber(x.max)}`).join(", ")}` : ""}${e.momentum !== null ? ` — momentum ${e.momentum > 0 ? "+" : ""}${Math.round(e.momentum)} (−100 = ${e.foe} wins, +100 = {{user}} wins)` : ""}`);
  }

  if (hud.outfit) {
    const worn = hud.outfit.filter((o) => o.item).map((o) => `${o.item!.name}${o.item!.integrity !== null && o.item!.integrity < 60 ? " (torn)" : ""}`);
    const exposure = hud.exposed.length ? ` — exposed: ${hud.exposed.join(", ")}` : "";
    lines.push(`Wearing: ${worn.length ? worn.join(", ") : "nothing"}${exposure}${hud.warmth && hud.warmth.tone !== "good" ? ` · ${hud.warmth.text}` : ""}`);
  }

  const here = hud.people.filter((p) => p.present).map((p) => p.name);
  if (s.dungeon) {
    const run = s.dungeon;
    const d = dungeonOf(r, run);
    if (d) {
      const party = run.party.map((m) => {
        const f = memberFighter(r, s, d, run, m);
        return `${f.name} ${f.hp <= 0 ? "down" : `HP ${f.hp}/${f.mhp}`}`;
      });
      lines.push(`IN A DUNGEON: ${d.name}, floor ${run.depth} (party level ${levelOf(run.xp)}). Party: ${party.join(", ")}. Carrying ${run.gold} gold from this run.`);
      if (run.battle) lines.push(`Fighting: ${run.battle.fighters.filter((f) => f.side === "foe" && f.hp > 0).map((f) => f.name).join(", ")}.`);
    }
  } else if (here.length) lines.push(`Present here: ${here.join(", ")}`);
  const date = dateDigest(r, s);
  if (date) lines.push(date);
  const body = bodyLine(r, s);
  if (body) lines.push(body);

  const meters = r.statOrder.map((id) => r.stats[id]).filter((d) => d.kind === "meter" || d.kind === "money");
  const other = r.statOrder.map((id) => r.stats[id]).filter((d) => d.kind === "attribute" || d.kind === "skill");
  const ml = meters.map((d) => statLine(r, d, s, r.narration.numbers)).filter(Boolean);
  if (ml.length) lines.push(ml.join(" · "));
  const ol = other.map((d) => statLine(r, d, s, r.narration.numbers)).filter(Boolean);
  if (ol.length) lines.push(`Abilities: ${ol.join(" · ")}`);

  const conds = Object.keys(s.conditions).map((id) => r.conditions[id]?.label ?? id);
  if (conds.length) lines.push(`Conditions: ${conds.join(", ")}`);

  const wornSet = new Set(Object.values(s.worn));
  const inv = Object.entries(s.items).filter(([id]) => !wornSet.has(id)).map(([id, n]) => `${itemName(r, s, id)}${n > 1 ? ` ×${n}` : ""}`);
  if (inv.length) lines.push(`Carrying: ${inv.join(", ")}`);

  if (s.pregnancy && s.pregnancy.told > 0) {
    const weeks = Math.floor((s.minutes - s.pregnancy.since) / 1440 / 7);
    const carrier = s.pregnancy.carrier === "player" ? "{{user}}" : personName(r, s, s.pregnancy.carrier);
    const other = s.pregnancy.carrier === "player" ? personName(r, s, s.pregnancy.with) : "{{user}}";
    lines.push(`${carrier} is ${weeks} week${weeks === 1 ? "" : "s"} pregnant (${other}'s child).`);
  }
  const kids = Object.entries(s.kin).filter(([, k]) => !k.joined).map(([id, k]) => `${k.name} (${k.sex === "girl" ? "daughter" : "son"}, age ${kinAge(r, s, id)})`);
  if (kids.length) lines.push(`Family — {{user}}'s children: ${kids.join(", ")}. They are minors: never part of anything romantic or sexual, and kept out of any sexual scene.`);
  const between = bondLines(r, s);
  if (between.length) lines.push(`Between people: ${between.join("; ")}`);
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

/**
 * What only the narrator knows: opened secret stages, what's happened behind the
 * scenes, and signs of what's coming. Everything not yet opened stays out of the
 * prompt entirely — that's the guarantee, not an instruction to keep quiet.
 */
export function narratorKnowledge(r: Ruleset, s: GameState): string | null {
  const lines: string[] = [];
  if (s.pregnancy && s.pregnancy.told === 0) {
    const who = s.pregnancy.carrier === "player" ? "{{user}}" : personName(r, s, s.pregnancy.carrier);
    lines.push(`Behind the scenes: ${who} is pregnant. Nobody knows yet — show no signs until the rules say so.`);
  }
  // What only one companion knows: the narrator plays them with it, and no one else can bring it up.
  for (const c of Object.values(r.companions)) {
    if (!s.people[c.id]) continue;
    for (const id of c.knows) {
      const sec = r.secrets[id];
      if (!sec) continue;
      lines.push(`Only ${personName(r, s, c.id)} knows this (no one else can mention it; ${personName(r, s, c.id)} reveals it only if the scene truly earns it): ${sec.about} — ${sec.stages.map((st) => st.text).join(" ")}`);
    }
  }
  for (const sec of Object.values(r.secrets)) {
    const open = s.secrets[sec.id] ?? -1;
    for (let i = 0; i <= open && i < sec.stages.length; i++) lines.push(`${sec.about}: ${sec.stages[i].text}`);
    if (sec.tell === "exists" && open < sec.stages.length - 1) {
      lines.push(`${sec.about} is keeping something you don't know. If pressed, they deflect or change the subject — don't invent what it is.`);
    }
  }
  for (const f of Object.values(r.fronts)) {
    const st = s.fronts[f.id] ?? { v: f.start, stage: -1 };
    for (let i = 0; i <= st.stage && i < f.stages.length; i++) {
      if (f.stages[i].backstage) lines.push(`Behind the scenes (${f.label}): ${f.stages[i].backstage}`);
    }
    const next = f.stages[st.stage + 1];
    if (next?.hint && st.v >= next.hintAt) lines.push(`In the background: ${next.hint} (a sign only — don't explain it or make anything happen)`);
  }
  const omen = s.gauge.next ? r.randomEvents.events[s.gauge.next]?.omen : undefined;
  if (omen) lines.push(`In the background: ${omen} (you don't know what it means — don't explain it or make anything happen)`);
  return lines.length ? lines.join("\n") : null;
}

/**
 * How the people in the scene feel, as the rules see it — for presentation
 * extensions (the visual-novel extension reads it as `metadata.vn_hints` to pick expressions).
 */
export function sceneHints(r: Ruleset, s: GameState): { moods: Record<string, string>; notes: string[] } | null {
  const moods: Record<string, string> = {};
  const here = presentPeople(r, s, makeEnv(r, s));
  for (const id of here) {
    if (!s.people[id]) continue;
    const parts = r.relStatOrder.map((rs) => {
      const def = r.relStats[rs];
      if (def.show === "hidden") return null;
      const band = bandFor(def, s.rel[id]?.[rs] ?? def.start);
      return band ? `${def.label.toLowerCase()}: ${band.text}` : null;
    }).filter(Boolean);
    if (parts.length) moods[personName(r, s, id)] = parts.join("; ");
  }
  const sess = activeSession(r, s);
  if (sess && s.people[sess.who]) {
    const name = personName(r, s, sess.who);
    const last = sess.last ? `, just reacted: ${REACTION_LABEL[sess.last.reaction].toLowerCase()}` : "";
    moods[name] = `${moodOf(sess.mood).label.toLowerCase()}${last}${moods[name] ? `; ${moods[name]}` : ""}`;
  }
  const notes: string[] = [];
  if (sess?.kind === "outing") notes.push(`On a date at ${r.dating.venues[sess.venue ?? ""]?.name ?? "somewhere"}`);
  if (s.encounter) notes.push(`In a fight or tense encounter: ${r.encounters[s.encounter.id]?.name ?? s.encounter.id}`);
  if (s.dungeon) notes.push("Exploring a dungeon");
  return Object.keys(moods).length || notes.length ? { moods, notes } : null;
}

/** How the player character experiences things right now (the mind's perception filters). */
export function perception(r: Ruleset, s: GameState): string | null {
  const env = makeEnv(r, s);
  const lines = r.mind.perception.filter((p) => evalBool(p.when, env, false)).map((p) => p.text);
  return lines.length ? lines.join("\n") : null;
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
