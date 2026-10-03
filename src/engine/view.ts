// View models for the UI and the text the narrator sees.

import type { Ruleset, StatDef } from "./ruleset.js";
import { percentOf, TIERS } from "./ruleset.js";
import {
  amountValue, bandFor, foeName, formatClock, formatMoney, formatNumber, gradeFor, itemName, makeEnv, personName, statMax,
  type GameState, type WarpEvent,
} from "./state.js";
import { practiceProgress } from "./freeform.js";
import { encounterGuide, itemRelevance } from "./encounter-view.js";
import { cleanLiveForecast, spentLock, whenHolds, actionPool, availableChoices, dangerStats, foeArmor, isAvailable, LIVE_PREFIX, lockReason, mainMeter, odds, playerArmor, usableItems, TIER_LABEL, type CheckResult, type LiveChoice, type TurnRecord } from "./resolve.js";
import { dueWords, effectWords, goalDone, questDef, questDigest, questOffers, questsToReport, QUEST_PREFIX } from "./quests.js";
import { dateAt, ordinal, presentPeople } from "./world.js";
import type { ChangeView, ChoiceView, HudView, QuestView, RecordView, Tone } from "../shared/protocol.js";
import { namesIt, namesTitle } from "./mention.js";

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

export function buildHud(r: Ruleset, s: GameState): HudView {
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

  const env = makeEnv(r, s);
  const here = new Set(presentPeople(r, s, env));
  const people = Object.entries(s.people).map(([id, p]) => {
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
      conditions: Object.entries(s.pconds?.[id] ?? {}).map(([cid, c]) => ({
        label: r.conditions[cid]?.label ?? cid, tone: r.conditions[cid]?.tone ?? "warn" as Tone, remaining: c.until !== null ? minutesLeft(c.until - s.minutes) : null,
      })),
      memories: (s.memories?.[id] ?? []).slice().reverse().slice(0, 5).map((m) => ({ text: m.text, when: r.clock.enabled ? formatClock(r, m.at).day : null })),
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
      use: usable ? { id: usable.id, label: usable.a.label, locked: usable.locked, drafted: !!def?.drafted } : null,
      bonus: bonus || null,
    };
  });
  const date = dateAt(r, s.minutes);

  let encounter: HudView["encounter"] = null;
  if (s.encounter) {
    const enc = r.encounters[s.encounter.id];
    const guide = encounterGuide(r, s);
    encounter = {
      goal: guide?.goal ?? null,
      progress: guide?.progress ?? [],
      danger: guide?.danger ?? [],
      dangerText: guide?.dangerText ?? null,
      quiet: !enc?.narrate,
      name: enc?.name ?? s.encounter.id,
      foe: foeName(r, s),
      round: s.encounter.round,
      momentum: s.encounter.momentum ?? null,
      stats: (enc?.foe.stats ?? []).map((fs) => {
        const v = s.encounter!.foe[fs.id] ?? fs.start;
        const top = s.encounter!.max?.[fs.id] ?? fs.max; // formula maxes were worked out when it started
        const p = pct(v, 0, top);
        return { id: fs.id, label: fs.label, value: v, max: top, pct: p, tone: toneFromPct(p, fs.good === "none" ? "none" : fs.good === "high" ? "high" : "low") };
      }),
      foeConds: Object.entries(s.encounter.conds ?? {}).map(([id, n]) => ({
        id, label: r.conditions[id]?.label ?? id, tone: r.conditions[id]?.tone ?? "warn" as Tone, rounds: n, ...(r.conditions[id]?.desc ? { desc: r.conditions[id].desc } : {}),
      })),
      foeArmor: (() => { const m = mainMeter(r, s); const n = m ? foeArmor(r, s, m.stat) : 0; return n ? n : null; })(),
      yourArmor: (() => { const d = dangerStats(r, s)[0]; const n = d ? playerArmor(r, s, d) : 0; return n ? n : null; })(),
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
      remaining: c.rounds !== undefined ? `${c.rounds} round${c.rounds === 1 ? "" : "s"}` : left !== null && left > 0 ? minutesLeft(left) : undefined,
    };
  });

  const moneyDef = r.hud.money ? r.stats[r.hud.money] : undefined;
  const moneyV = r.hud.money ? s.stats[r.hud.money] ?? moneyDef?.start ?? 0 : 0;
  // Money follows `show:` too: a purse with bands reads "Enough for the week." unless it says number or both.
  // The amount always shows unless the author asked for words only (show: text) or hid it.
  const money = moneyDef ? moneyDef.show === "hidden" ? null : shownText(moneyDef.showSet ? moneyDef : { ...moneyDef, show: "both" }, bandFor(moneyDef, moneyV, statMax(r, moneyDef, s)), formatMoney(r, moneyV)) ?? formatMoney(r, moneyV) : null;
  const loc = s.location ? r.locations[s.location] : undefined;

  return {
    rulesetName: r.name,
    clock: r.clock.enabled ? formatClock(r, s.minutes) : null,
    date: date ? `${r.clock.weekdays[Math.floor(s.minutes / 1440) % r.clock.weekdays.length] ?? ""} ${ordinal(date.day)} ${date.monthName}`.trim() : null,
    location: s.locationName ? { name: s.locationName, desc: loc?.desc } : null,
    money,
    bars: bars.filter((b) => r.stats[b.id].kind !== "money"),
    skills,
    people,
    items,
    conditions,
    quests: questViews(r, s),
    encounter,
    turn: s.turn,
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

/** Quests for the journal: offered here first, then under way, then the last few that ended. */
function questViews(r: Ruleset, s: GameState): QuestView[] {
  const reportable = new Set(questsToReport(r, s).map((x) => x.id));
  const view = (id: string, status: QuestView["status"], from: string | null): QuestView | null => {
    const q = questDef(r, s, id);
    if (!q) return null;
    const st = s.quests?.[id];
    const left = st?.due !== null && st?.due !== undefined && (status === "active" || status === "ready") ? st.due - s.minutes : null;
    const giver = q.giver ? personName(r, s, q.giver) : null;
    const reward = effectWords(r, s, q.reward) || (st?.story && giver ? `${giver} will think better of you` : "");
    const price = effectWords(r, s, q.failure);
    return {
      id, name: q.name, kind: q.kind, status, giver, desc: q.desc ?? null,
      goals: q.goals.map((g) => ({
        text: g.text,
        done: status === "done" || (!!st && status !== "offered" && goalDone(r, s, st, g)),
        progress: g.count && g.count > 1 ? `${Math.min(st?.prog[g.id] ?? 0, g.count)}/${g.count}` : null,
        optional: g.optional,
      })),
      due: left !== null ? dueWords(left) : status === "offered" && q.days ? `${q.days} day${q.days === 1 ? "" : "s"} to do it` : null,
      dueTone: left === null ? "neutral" : left < 1440 ? "bad" : left < 2880 ? "warn" : "neutral",
      reward: reward || null,
      stakes: q.stakes ?? (price ? `If it fails: ${price}` : st?.story && giver ? `${giver} will remember if you don't` : null),
      story: !!st?.story,
      take: status === "offered" ? `${QUEST_PREFIX}take:${id}` : null,
      report: status === "ready" && reportable.has(id) ? `${QUEST_PREFIX}report:${id}` : null,
      drop: status === "active" || status === "ready" ? `${QUEST_PREFIX}drop:${id}` : null,
      from,
    };
  };
  const out: (QuestView | null)[] = questOffers(r, s).map((o) => view(o.id, "offered", o.via === "giver" ? o.from : o.via === "board" ? "Notice board" : s.locationName));
  const taken = Object.entries(s.quests ?? {});
  for (const [id, st] of taken) if (st.st === "active" || st.st === "ready") out.push(view(id, st.st, null));
  taken.filter(([, st]) => st.st === "done" || st.st === "failed")
    .sort((a, b) => (b[1].ended ?? 0) - (a[1].ended ?? 0)).slice(0, 6)
    .forEach(([id, st]) => out.push(view(id, st.st, null)));
  return out.filter((x): x is QuestView => !!x);
}

/** Has {{user}} met them in the story (been in a scene together, or left a memory)? An authored cast exists from the start; that alone isn't meeting. */
function hasMet(s: GameState, id: string): boolean {
  return !!s.scene[id] || (s.memories?.[id]?.length ?? 0) > 0;
}

/** Whose people are in play for the narrator: everyone here (by id), and the names to match secrets against. */
function sceneCast(r: Ruleset, s: GameState): { here: Set<string>; names: Map<string, string> } {
  const here = new Set(presentPeople(r, s, makeEnv(r, s)));
  const names = new Map<string, string>();
  for (const id of Object.keys(s.people)) {
    names.set(personName(r, s, id).toLowerCase(), id);
    names.set(id.toLowerCase(), id);
  }
  return { here, names };
}

export function buildChoices(r: Ruleset, s: GameState, opts: { lines: string[]; veils: string[]; live?: LiveChoice[]; showChoices?: boolean }): ChoiceView[] {
  return choiceList(r, s, opts);
}

function choiceList(r: Ruleset, s: GameState, opts: { lines: string[]; veils: string[]; live?: LiveChoice[]; showChoices?: boolean }): ChoiceView[] {
  const veils = new Set(opts.veils.map((v) => v.toLowerCase()));
  const lines = new Set(opts.lines.map((v) => v.toLowerCase()));
  // Choices written for this moment come first; their tag decides the check and the odds.
  const live: ChoiceView[] = [];
  const plain = (id: string, label: string, group: string | null, desc: string | null = null): ChoiceView =>
    ({ id, label, group, desc, odds: null, partialOdds: null, checkLabel: null, veiled: false, params: [] });
  // Choices turned off: the story is typed. Only the modes played with buttons (above, and an encounter's moves) keep them.
  if (opts.showChoices === false && !s.encounter) return [];
  if (!s.encounter) (opts.live ?? []).forEach((c, i) => {
    const a = r.liveChoices.tags[c.tag];
    if (!a || a.tags.some((t) => lines.has(t)) || !isAvailable(r, s, a, c.target)
      || (a.perPerson && !c.target) || (c.target && !presentPeople(r, s, makeEnv(r, s)).includes(c.target))) return;
    const o = odds(r, s, a, undefined, c.target);
    const forecast = cleanLiveForecast(c.forecast);
    live.push({
      id: `${LIVE_PREFIX}${i}`,
      label: c.label,
      group: r.liveChoices.label,
      ...(forecast ? { forecast } : {}),
      desc: a.desc ?? null,
      odds: o ? o.success : null,
      partialOdds: o && o.partial > 0 ? o.partial : null,
      checkLabel: a.check?.label ?? null,
      veiled: a.tags.some((t) => veils.has(t)),
      params: [],
    });
  });
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
  // Moves out of reach say why, when it's something the player could work toward: an item, a skill level, someone to bring.
  const locked: ChoiceView[] = [];
  const pool = actionPool(r, s);
  for (const id of pool.order) {
    const a = pool.defs[id];
    if (a.hidden || a.perPerson || a.tags.some((t) => lines.has(t))) continue;
    // Allowed here but out of uses or unaffordable: always shown locked, with why ("Needs 80 Mana").
    const spent = whenHolds(r, s, a) ? spentLock(r, s, a) : null;
    if (!spent && !s.encounter && (!a.showLocked || (a.at.length && !a.at.includes(s.location ?? "")))) continue;
    if (!spent && s.encounter && !a.showLocked && !a.whyNot && !/has\(/.test(a.when ?? "")) continue;
    if (isAvailable(r, s, a)) continue;
    locked.push({ ...plain(id, a.label, encName ?? a.group ?? null, a.desc ?? null), locked: spent ?? lockReason(r, s, a) });
  }
  return [...live, ...actions, ...itemChoices(r, s, lines), ...locked, ...questChoices(r, s)];
}

/** Quests to hand in here, and a few on offer (from whoever's here first, then the board). */
function questChoices(r: Ruleset, s: GameState): ChoiceView[] {
  if (s.encounter) return [];
  const plain = (id: string, label: string, desc: string | null, why?: string): ChoiceView =>
    ({ id, label, group: "Quests", desc, odds: null, partialOdds: null, checkLabel: null, veiled: false, params: [], ...(why ? { why } : {}) });
  const out: ChoiceView[] = [];
  for (const { id, to } of questsToReport(r, s)) {
    const q = questDef(r, s, id);
    if (!q) continue;
    const reward = effectWords(r, s, q.reward);
    out.push(plain(`${QUEST_PREFIX}report:${id}`, to ? `Tell ${to}: "${q.name}" is done` : `Hand in "${q.name}"`, q.desc ?? null, reward ? `Reward: ${reward}` : undefined));
  }
  const offers = questOffers(r, s).sort((a, b) => Number(b.via === "giver") - Number(a.via === "giver")).slice(0, 3);
  for (const o of offers) {
    const q = r.quests[o.id];
    const reward = effectWords(r, s, q.reward);
    const label = o.via === "giver" ? `${o.from} asks: "${q.name}"` : o.via === "board" ? `Notice: "${q.name}"` : `"${q.name}"`;
    out.push(plain(`${QUEST_PREFIX}take:${o.id}`, label, q.desc ?? null, [reward ? `Reward: ${reward}` : "", q.days ? `${q.days}d` : ""].filter(Boolean).join(" · ") || undefined));
  }
  return out;
}

/** Held items worth using now: in an encounter, any that bear on it (up to 3); otherwise only clearly helpful ones (up to 2). */
function itemChoices(r: Ruleset, s: GameState, lines: Set<string>): ChoiceView[] {
  const veils = new Set<string>();
  const ranked = usableItems(r, s)
    .filter((u) => !u.locked && !u.a.tags.some((t) => lines.has(t)))
    .map((u) => ({ u, ...itemRelevance(r, s, u.a) }))
    .filter((x) => x.score >= (s.encounter ? 1 : 2))
    .sort((a, b) => b.score - a.score)
    .slice(0, s.encounter ? 3 : 2);
  return ranked.map(({ u, why }) => {
    const o = odds(r, s, u.a);
    return {
      id: u.id, label: u.a.label, group: "Items", desc: u.a.desc ?? r.items[u.id.slice(5)]?.desc ?? null,
      odds: o ? o.success : null, partialOdds: o && o.partial > 0 ? o.partial : null, checkLabel: u.a.check?.label ?? null,
      veiled: u.a.tags.some((t) => veils.has(t)), params: [], ...(why ? { why } : {}),
    };
  });
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
  const foeAgg = new Map<string, { d: number; idx: number[]; src: string }>();
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
        out.push({ text: e.on ? `${label}${e.rounds ? ` · ${e.rounds} rounds` : ""}` : `${label} ended`, tone: e.on ? r.conditions[e.id]?.tone ?? "warn" : "good", src: e.src, undo: [i] });
        break;
      }
      case "fcond": {
        // A bad status on the opponent is good news for {{user}}.
        const def = r.conditions[e.id];
        const foe = (after.encounter ?? before.encounter) ? foeName(r, after.encounter ? after : before) : "Foe";
        const tone: Tone = !e.on ? "neutral" : def?.tone === "bad" ? "good" : def?.tone === "good" ? "bad" : "neutral";
        out.push({ text: e.on ? `${foe}: ${def?.label ?? e.id}${e.rounds ? ` · ${e.rounds} rounds` : ""}` : `${foe}: ${def?.label ?? e.id} ended`, tone, src: e.src, undo: [i] });
        break;
      }
      case "pcond": {
        if (e.note === "expired") break;
        const label = r.conditions[e.id]?.label ?? e.id;
        out.push({ text: `${personName(r, after, e.who)}: ${label}${e.on ? "" : " ended"}`, tone: "neutral", src: e.src, undo: [i] });
        break;
      }
      case "quest": {
        if (e.st === null) break;
        const name = (e.story?.name ?? r.quests[e.id]?.name ?? questDef(r, after, e.id)?.name) ?? e.id;
        const text = e.st === "active" ? `📜 New quest: ${name}` : e.st === "ready" ? `📜 ${name}: ready to hand in` : e.st === "done" ? `✅ Quest complete: ${name}` : `✗ Quest failed: ${name}`;
        out.push({ text, tone: e.st === "failed" ? "bad" : e.st === "done" || e.st === "ready" ? "good" : "neutral", src: e.src, undo: [i] });
        break;
      }
      case "qprog": {
        const q = questDef(r, after, e.id);
        const g = q?.goals.find((x) => x.id === e.goal);
        if (!q || !g) break;
        const n = after.quests?.[e.id]?.prog[e.goal] ?? 0;
        out.push({ text: `📜 ${g.text}${g.count && g.count > 1 ? ` ${Math.min(n, g.count)}/${g.count}` : " ✓"}`, tone: "good", src: e.src, undo: [i] });
        break;
      }
      case "memory":
        out.push({ text: `💭 ${personName(r, after, e.who)} will remember that`, tone: "neutral", src: e.src, undo: [i], why: [e.text] });
        break;
      case "person":
        out.push({ text: `Met ${e.name}`, tone: "neutral", src: e.src, undo: [i] });
        break;
      case "scene":
        if (e.note === "renew" || events.some((x, j) => j < i && x.t === "person" && x.id === e.who)) break;
        out.push({ text: e.here ? `👋 ${personName(r, after, e.who)} is here` : `${personName(r, after, e.who)} left`, tone: "neutral", src: e.src, undo: [i] });
        break;
      case "use": {
        const per = r.items[e.id]?.uses ?? 0;
        const left = after.items[e.id] > 0 ? after.uses[e.id] ?? per : 0;
        out.push({ text: `Used ${itemName(r, before, e.id)}${e.n > 1 ? ` ×${e.n}` : ""}${per > 1 && left ? ` · ${left}/${per} left` : ""}`, tone: "neutral", src: e.src, undo: [i] });
        break;
      }
      case "practice": {
        // Progress toward a point; the point itself shows as the stat's own chip.
        const rose = events.some((x) => x.t === "stat" && x.id === e.id && (x.d ?? 0) > 0 && x.src === "check");
        const def = r.stats[e.id];
        if (rose || !def || e.d <= 0) break;
        out.push({ text: `📈 ${def.label} ${Math.round((after.practice[e.id] ?? 0) * 100)}%`, tone: "good", src: e.src });
        break;
      }
      case "enc":
        if (e.id) out.push({ text: `⚔ ${r.encounters[e.id]?.name ?? "Encounter"}${e.foeName ? ` vs ${e.foeName}` : ""}`, tone: "warn", src: e.src });
        else out.push({ text: `⚔ Over: ${(e.outcome ?? "ended").replace(/_/g, " ")}`, tone: "neutral", src: e.src });
        break;
      case "foe": {
        // Your move and their answer can both push the same stat: one chip, summed.
        const a = foeAgg.get(e.stat) ?? { d: 0, idx: [], src: e.src };
        a.d += e.d ?? 0;
        a.idx.push(i);
        foeAgg.set(e.stat, a);
        break;
      }
    }
  });

  if (timeAgg.min >= 1) {
    // One clock chip per turn; only the narrator's share of it can be undone.
    const m = timeAgg.min;
    out.unshift({ text: m >= 60 ? `⏱ +${formatNumber(m / 60)}h` : `⏱ +${Math.round(m)}m`, tone: "neutral", src: timeAgg.narrIdx.length === timeAgg.idx.length ? "narrator" : "action" });
  }
  for (const [stat, a] of foeAgg) {
    if (Math.abs(a.d) < 0.05) continue;
    const enc = before.encounter ?? after.encounter;
    const def = enc ? r.encounters[enc.id] : undefined;
    const fs = def?.foe.stats.find((x) => x.id === stat);
    const foe = (after.encounter ?? before.encounter)?.foeName ?? def?.foe.name ?? "Foe";
    out.push({ text: `${foe} · ${fs?.label ?? stat} ${signed(a.d)}`, tone: (a.d < 0) === (fs?.good !== "high") ? "good" : "bad", src: a.src, undo: a.idx });
  }
  for (const [key, a] of statAgg) {
    const id = key.split("|")[0];
    const def = r.stats[id];
    if (!def || def.kind === "hidden") continue;
    const d = a.set ? (after.stats[id] ?? 0) - (before.stats[id] ?? 0) : a.d;
    if (Math.abs(d) < 0.05) continue;
    const bBefore = bandFor(def, before.stats[id] ?? def.start, statMax(r, def, before));
    const bAfter = bandFor(def, after.stats[id] ?? def.start, statMax(r, def, after));
    const good = def.good === "none" ? null : (d > 0) === (def.good === "high");
    out.push({
      text: def.kind === "money" ? `${d > 0 ? "+" : "−"}${formatMoney(r, Math.abs(d))}` : `${def.label} ${signed(d)}`,
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
  // The "Why?" trace: every cause behind each chip.
  const causeOf = (ev: WarpEvent) => ev.why ?? (ev.src === "narrator" ? "Read from the story" : ev.src === "manual" ? "You set this" : null);
  for (const c of out) {
    const why = [...new Set((c.undo ?? []).map((i) => events[i] && causeOf(events[i])).filter((x): x is string => !!x))];
    if (why.length) c.why = why;
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
/** Words that put work, quests and the notice board in play this turn. */
const WORK_WORDS = /\b(board|notices?|postings?|jobs?|work|quests?|bount(?:y|ies)|errands?|tasks?|favou?rs?|hire|hiring|contracts?|assignments?|gigs?|requests?|help (?:you|me|with))\b/i;

/**
 * What the turn is about, for the narrator's block: the player's message, the chosen action and the reply
 * before it. With it, the block names only what's in play — everything named in a prompt is something the
 * model will reach for (a bag's contents, a board of twelve postings). Without it, the block is complete
 * (the helpers that judge the state need all of it).
 */
export interface DigestFocus { text: string }

/** Compact state block injected every turn. */
export function stateDigest(r: Ruleset, s: GameState, focus?: DigestFocus): string {
  const nar = focus !== undefined;
  const ft = focus?.text ?? "";
  const named = (name: string, others: string[] = []) => !nar || namesIt(ft, name, others);
  const titled = (title: string) => !nar || namesTitle(ft, title);
  const moneyTalk = !nar || MONEY_WORDS.test(ft);
  const workTalk = !nar || WORK_WORDS.test(ft);
  const lines: string[] = [];
  const head: string[] = [];
  const hud = buildHud(r, s);
  if (r.clock.enabled) {
    const c = formatClock(r, s.minutes);
    head.push(`${hud.date ?? c.day}, ${c.time} (${c.phase})`);
  }
  if (s.locationName) head.push(`Location: ${s.locationName}`);
  if (head.length) lines.push(head.join(" · "));

  if (hud.encounter) {
    const e = hud.encounter;
    lines.push(`ENCOUNTER in progress: ${e.name} vs ${e.foe}, round ${e.round}${e.stats.length ? ` — ${e.stats.map((x) => `${x.label} ${formatNumber(x.value)}/${formatNumber(x.max)}`).join(", ")}` : ""}${e.momentum !== null ? ` — momentum ${e.momentum > 0 ? "+" : ""}${Math.round(e.momentum)} (−100 = ${e.foe} wins, +100 = {{user}} wins)` : ""}`);
    const on = [
      ...e.foeConds.map((c) => `${c.label.toLowerCase()}${c.rounds ? ` (${c.rounds} round${c.rounds === 1 ? "" : "s"})` : ""}`),
      ...(e.foeArmor ? [`armored (${e.foeArmor})`] : []),
    ];
    if (on.length) lines.push(`${e.foe} is ${on.join(", ")}.`);
  }

  const here = hud.people.filter((p) => p.present).map((p) => p.name);
  if (here.length || Object.keys(s.people).length) lines.push(`Present here: ${here.length ? here.join(", ") : "none of the people {{user}} knows"}`);
  // People who were with {{user}} before the last move: the story says whether they came along.
  const was = Object.entries(s.scene).filter(([id, v]) => v.here && s.people[id] && v.loc !== s.location && v.loc === s.lastLocation && !here.includes(s.people[id].name)).map(([id]) => personName(r, s, id));
  if (was.length) lines.push(`Were with {{user}} before arriving here (include them only if they came along): ${was.join(", ")}`);

  const meters = r.statOrder.map((id) => r.stats[id]).filter((d) => d.kind === "meter" || d.kind === "money");
  const other = r.statOrder.map((id) => r.stats[id]).filter((d) => d.kind === "attribute" || d.kind === "skill");
  // For the narrator: a meter only when it's away from where it started (tired, aroused, broke — not "fresh"),
  // money when money's in play, a skill when the turn names it. The rest is the ordinary state of things.
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

  const conds = Object.entries(s.conditions).map(([id, c]) => `${r.conditions[id]?.label ?? id}${c.rounds !== undefined ? ` (${c.rounds} round${c.rounds === 1 ? "" : "s"})` : ""}`);
  if (conds.length) lines.push(`Conditions: ${conds.join(", ")}`);
  // Quests: what {{user}} is working on, and work on offer from the people here (they may bring it up).
  // For the narrator, a quest is in play when the turn names it or its giver, its giver is here, it's due
  // within a day, or it's ready to hand in. The rest wait in the journal; naming them invites the model to push them.
  const hereIds = new Set(hud.people.filter((p) => p.present).map((p) => p.id));
  const inPlay = (id: string) => {
    if (!nar) return true;
    const q = questDef(r, s, id);
    const st = s.quests?.[id];
    if (!q || !st) return false;
    if (st.st === "ready" || titled(q.name) || (q.giver && (hereIds.has(q.giver) || named(personName(r, s, q.giver))))) return true;
    return st.due !== null && st.due - s.minutes <= 1440;
  };
  const quests = questDigest(r, s, inPlay);
  if (quests.length) lines.push(`Quests under way (only the rules decide when one is done or failed): ${quests.join(" | ")}`);
  const offers = questOffers(r, s);
  // Someone here with a favour to ask, or the board's postings: only once the turn turns to work (or names them).
  const asks = offers.filter((o) => o.via === "giver" && (workTalk || titled(r.quests[o.id].name))).map((o) => `${o.from} ("${r.quests[o.id].name}"${r.quests[o.id].desc ? ` — ${r.quests[o.id].desc}` : ""})`);
  if (asks.length) lines.push(`Has something to ask of {{user}} (may bring it up when it fits; {{user}} decides whether to take it on): ${asks.join("; ")}`);
  const posted = offers.filter((o) => o.via === "board" && (workTalk || titled(r.quests[o.id].name))).map((o) => `"${r.quests[o.id].name}"`);
  if (posted.length) lines.push(`Posted on the notice board here: ${posted.join(", ")}`);

  const bag = Object.entries(s.items);
  const uses = (id: string) => {
    const per = r.items[id]?.uses ?? 0;
    return per > 1 ? `, ${s.uses[id] ?? per} of ${per} uses left` : "";
  };
  // For the narrator, only what the turn names: a listed bag gets rummaged through. The rest is counted, so
  // {{user}} isn't written as empty-handed.
  const bagNames = bag.map(([id]) => itemName(r, s, id));
  const inv = bag.filter(([id]) => named(itemName(r, s, id), bagNames)).map(([id, n]) => `${itemName(r, s, id)}${n > 1 ? ` ×${n}` : ""}${uses(id) ? ` (${uses(id).slice(2)})` : ""}`);
  const rest = bag.length - inv.length;
  if (inv.length) lines.push(`Carrying: ${inv.join(", ")}${rest ? ` (and ${rest} other thing${rest === 1 ? "" : "s"} — not in play; don't bring them up unless {{user}} does)` : ""}`);
  else if (rest) lines.push(`Carrying ${rest} thing${rest === 1 ? "" : "s"}, none in play right now (don't bring them up unless {{user}} does).`);

  const feel = (id: string, name: string) => {
    const parts = r.relStatOrder.map((rs) => {
      const def = r.relStats[rs];
      if (def.show === "hidden") return null;
      const v = s.rel[id]?.[rs] ?? def.start;
      const band = bandFor(def, v);
      const words = shownText(def, band, formatNumber(v));
      return words ? `${def.label} ${words}` : `${def.label} ${formatNumber(v)}`;
    }).filter(Boolean);
    return parts.length ? `${name} (${parts.join(", ")})` : name;
  };
  // Only the people in the scene are "in play"; the rest are named apart so the narrator doesn't write them back in.
  const inScene = hud.people.filter((p) => p.present);
  if (inScene.length) lines.push(`Relationships (here): ${inScene.map((p) => feel(p.id, p.name)).join("; ")}`);
  // What the people here are going through, and what they remember about {{user}}: the story should show both.
  for (const p of inScene) {
    if (p.conditions.length) lines.push(`${p.name} is ${p.conditions.map((c) => c.label.toLowerCase()).join(", ")}.`);
    const mem = (s.memories?.[p.id] ?? []).slice(-3).map((m) => `${m.text}${r.clock.enabled ? ` (${agoWords(s.minutes - m.at)})` : ""}`);
    if (mem.length) lines.push(`${p.name} remembers: ${mem.join("; ")}`);
  }
  // Who was around lately and isn't now, by name only, so the narrator doesn't write them back in. Never someone
  // {{user}} hasn't met (a big authored cast would hand the narrator every name in the city), and only the last day's.
  const away = hud.people.filter((p) => !p.present && hasMet(s, p.id) && s.scene[p.id] && s.minutes - s.scene[p.id].at <= 1440)
    .sort((a, b) => (s.scene[b.id]?.at ?? -1) - (s.scene[a.id]?.at ?? -1))
    .slice(0, 4);
  if (away.length) lines.push(`Not in this scene (seen lately; bring them in only if the story calls for it): ${away.map((p) => p.name).join(", ")}`);

  return lines.join("\n");
}

/**
 * What only the narrator knows: opened secret stages. Unopened stage text stays out of the prompt.
 */
export function narratorKnowledge(r: Ruleset, s: GameState): string | null {
  const lines: string[] = [];
  // Only what touches the scene: a secret about someone who isn't here is no use as subtext, and a big cast's
  // secrets would otherwise all ride along every turn. (Secrets about a place or a thing always come.)
  const { here, names } = sceneCast(r, s);
  const offstage = (about: string) => { const id = names.get(about.trim().toLowerCase()); return !!id && !here.has(id); };
  for (const sec of Object.values(r.secrets)) {
    if (offstage(sec.about)) continue;
    const open = s.secrets[sec.id] ?? -1;
    for (let i = 0; i <= open && i < sec.stages.length; i++) lines.push(`${sec.about}: ${sec.stages[i].text}`);
    if (sec.tell === "exists" && open < sec.stages.length - 1) {
      lines.push(`${sec.about} is keeping something you don't know. If pressed, they deflect or change the subject — don't invent what it is.`);
    }
  }
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
  const notes: string[] = [];
  if (s.encounter) notes.push(`In a fight or tense encounter: ${r.encounters[s.encounter.id]?.name ?? s.encounter.id}`);
  return Object.keys(moods).length || notes.length ? { moods, notes } : null;
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
