// Errands: things done off the page, in a window — buying, paying, practising,
// resting, taking work off a board. No narrator turn; the next reply is told in
// one line. Which actions count is read from their shape (or `errand:`).

import type { ErrandsView } from "../shared/protocol.js";
import { questOffers, effectWords, QUEST_PREFIX } from "./quests.js";
import { ITEM_PREFIX, TRAVEL_PREFIX, findAction, lockReason, odds, resolveTurnFull, travelTargets, usableItems } from "./resolve.js";
import type { ActionDef, Effect, Ruleset } from "./ruleset.js";
import { foldEvents, formatMoney, itemName, makeEnv, type GameState, type WarpEvent } from "./state.js";
import { evalNumber } from "./expr.js";
import { PAY_PREFIX, workMoves } from "./work.js";

export type ErrandKind = "shop" | "train" | "rest";

/** Most of one thing a window buys or trains at once. */
export const MAX_TIMES = 20;

const isEmpty = (o: object | undefined) => !o || Object.keys(o).length === 0;

/** Nothing in it that belongs in a scene: no people, places, fights, secrets or story machinery. */
function offStage(e: Effect | undefined): boolean {
  if (!e) return true;
  return isEmpty(e.rel) && !e.move && !e.startEncounter && !e.end && isEmpty(e.decide) && isEmpty(e.foe) && isEmpty(e.bond) && isEmpty(e.afflict)
    && isEmpty(e.inflict) && isEmpty(e.reveal) && isEmpty(e.front) && isEmpty(e.body) && isEmpty(e.transform) && isEmpty(e.arc)
    && isEmpty(e.wear) && isEmpty(e.undress) && isEmpty(e.damage) && !e.harm && !e.momentum;
}

const moneyIds = (r: Ruleset) => r.statOrder.filter((id) => r.stats[id].kind === "money");

/** A stat change as a number now (formulas worked out), or NaN. */
function amount(r: Ruleset, s: GameState, v: string | number): number {
  if (typeof v === "number") return v;
  try { return evalNumber(v, makeEnv(r, s), Number.NaN); } catch { return Number.NaN; }
}

/** What kind of errand an action is, if any: the author's `errand:`, else its shape. */
export function errandKind(r: Ruleset, a: ActionDef): ErrandKind | null {
  if (a.errand === false) return null;
  if (a.errand) return a.errand;
  if (a.hidden || a.perPerson || a.params.length || a.perEncounter) return null;
  const all = [a.effects, a.cost, ...Object.values(a.outcomes)];
  if (!all.every(offStage)) return null;
  const money = new Set(moneyIds(r));
  const touches = (pred: (id: string) => boolean) => all.some((e) => e && [...Object.keys(e.stats), ...Object.keys(e.set)].some(pred));
  const gives = all.some((e) => e && Object.values(e.items).some((n) => n > 0));
  const takes = all.some((e) => e && Object.values(e.items).some((n) => n < 0));
  const spends = all.some((e) => e && Object.entries(e.stats).some(([id, v]) => money.has(id) && (typeof v === "number" ? v < 0 : /^\s*-/.test(v))));
  const earns = all.some((e) => e && Object.entries(e.stats).some(([id, v]) => money.has(id) && (typeof v === "number" ? v > 0 : !/^\s*-/.test(v))));
  if (!a.check) {
    // Shop: money for things, nothing else that matters.
    // Shop: money for things (or things for money), nothing else that matters.
    if (((gives && spends) || (takes && earns && !gives)) && !touches((id) => !money.has(id))) return "shop";
    // Rest: time passes and the body recovers; nothing bought, earned, learned or unlocked (a flag like "dreamt" is fine).
    const e = a.effects;
    if ((a.time ?? 0) >= 30 && !gives && !takes && !touches((id) => money.has(id) || r.stats[id]?.kind === "skill" || r.stats[id]?.kind === "attribute")
      && isEmpty(e.unlock) && isEmpty(e.learn) && isEmpty(e.items)) return "rest";
    return null;
  }
  // Training: a check that works a skill or attribute (raises it, or reads it — checks that read a skill are
  // practice), with nothing to carry away — no loot, no pay, nothing hidden at stake (a pickpocket's take and the
  // crime it adds are a story). An entry fee is fine.
  if (gives || takes || earns || touches((id) => r.stats[id]?.kind === "hidden")) return null;
  const skill = (id: string) => r.stats[id]?.kind === "skill" || r.stats[id]?.kind === "attribute";
  const raises = Object.values(a.outcomes).some((e) => e && Object.entries(e.stats).some(([id, v]) => skill(id) && (typeof v === "number" ? v > 0 : !/^\s*-/.test(v))))
    // Only reading a skill: practice when nothing in it is for the story (a hint to reveal something, a rumour…).
    || (r.growth?.enabled !== false && all.every((e) => !e?.hint) && r.statOrder.some((id) => skill(id) && new RegExp(`(^|[^\\w])${id}([^\\w]|$)`).test(JSON.stringify(a.check))));
  const quiet = Object.values(a.outcomes).every((e) => !e || (isEmpty(e.flags) && isEmpty(e.unlock)));
  return raises && quiet ? "train" : null;
}

/** "1h", "8h", "45 min" */
export function durationWords(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = min / 60;
  return Number.isInteger(h) ? `${h}h` : `${Math.floor(h)}h ${Math.round(min % 60)} min`;
}

/** Money one go of a shop action takes (n > 0) or pays (n < 0). */
function priceOf(r: Ruleset, s: GameState, a: ActionDef): { stat: string; n: number } | null {
  for (const id of moneyIds(r)) {
    const n = -[a.effects.stats[id], a.cost.stats[id]].filter((v) => v !== undefined).reduce<number>((t, v) => t + amount(r, s, v!), 0);
    if (n !== 0 && Number.isFinite(n)) return { stat: id, n };
  }
  return null;
}

/** Per-session costs in words ("15 Energy"). */
function costWords(r: Ruleset, s: GameState, a: ActionDef): string | null {
  const parts = Object.entries(a.cost.stats).map(([id, v]) => [id, amount(r, s, v)] as const).filter(([, v]) => Number.isFinite(v) && v !== 0)
    .map(([id, v]) => `${v > 0 ? "+" : ""}${Math.abs(v)} ${r.stats[id]?.label ?? id}`);
  return parts.length ? parts.join(", ") : null;
}

/** How many times in a row it can be done now (its costs and price against what {{user}} has), up to MAX_TIMES. */
function affordable(r: Ruleset, s: GameState, a: ActionDef): number {
  let max = MAX_TIMES;
  const per = (id: string) => {
    const v = [a.effects.stats[id], a.cost.stats[id]].filter((x) => x !== undefined).reduce<number>((t, x) => t + amount(r, s, x!), 0);
    return v;
  };
  for (const id of new Set([...Object.keys(a.cost.stats), ...moneyIds(r).filter((m) => a.effects.stats[m] !== undefined)])) {
    const d = per(id);
    const def = r.stats[id];
    if (!def || !(d < 0) || def.good === "low") continue;
    const room = (s.stats[id] ?? def.start) - def.min;
    max = Math.min(max, Math.floor(room / -d + 1e-9));
  }
  return Math.max(0, max);
}

/** Is an errand open right now? Not in a fight, a shift, or after the end. */
export function errandsOpen(s: GameState): boolean {
  return !s.encounter && !s.job && !s.ended;
}

/** The errand window's contents here and now, or null when there's nothing to do (or it isn't the time). */
export function buildErrands(r: Ruleset, s: GameState): ErrandsView | null {
  if (!errandsOpen(s)) return null;
  const v: ErrandsView = { board: [], shop: [], bills: [], train: [], rest: [], money: null };
  const money = moneyIds(r)[0];
  if (money) v.money = formatMoney(r, s.stats[money] ?? r.stats[money].start);
  for (const o of questOffers(r, s)) {
    if (o.via !== "board") continue;
    const q = r.quests[o.id];
    v.board.push({
      id: o.id, name: q.name, desc: q.desc ?? null, goals: q.goals.filter((g) => !g.optional).map((g) => g.text),
      reward: effectWords(r, s, q.reward) || null, days: q.days > 0 ? q.days : null, stakes: q.stakes ?? null,
      kind: q.kind && q.kind !== "quest" ? q.kind : null, take: `${QUEST_PREFIX}take:${o.id}`,
    });
  }
  for (const m of workMoves(r, s)) {
    if (!m.id.startsWith(PAY_PREFIX)) continue;
    const amt = /\(([^)]*)\)/.exec(m.label)?.[1] ?? "";
    v.bills.push({ id: m.id.slice(PAY_PREFIX.length), label: m.label.replace(/\s*\([^)]*\)\s*$/, ""), amount: amt, due: m.desc ?? "", story: m.id });
  }
  for (const id of r.actionOrder) {
    const a = r.actions[id];
    const kind = errandKind(r, a);
    if (!kind) continue;
    // Only what's here: its place and `when:` hold (or it's locked with a reason the player can act on).
    const here = !a.at.length || a.at.includes(s.location ?? "");
    if (!here) continue;
    const ok = !!findAction(r, s, id);
    if (!ok && !a.showLocked && !lockReason(r, s, a)) continue;
    const why = ok ? null : lockReason(r, s, a) || "Not now";
    if (!ok && !a.showLocked && a.when && !a.requires.length) continue; // a plain `when:` that's false: not here now
    if (kind === "shop") {
      const price = priceOf(r, s, a);
      const sell = !!price && price.n < 0;
      // Selling: as many as {{user}} has; buying: as many as they can afford.
      const thing = Object.entries(a.effects.items).find(([, n]) => (sell ? n < 0 : n > 0))?.[0] ?? "";
      const max = !ok ? 0 : sell ? Math.min(MAX_TIMES, Math.floor((s.items[thing] ?? 0) / Math.max(1, -(a.effects.items[thing] ?? -1)))) : affordable(r, s, a);
      // "Buy Soothing potion (25 E)": the price has its own column.
      v.shop.push({ id, label: a.label.replace(/\s*\([^)]*\d[^)]*\)\s*$/, ""), item: thing ? itemName(r, s, thing) : a.label, itemDesc: (thing && r.items[thing]?.desc) || a.desc || null,
        price: price ? formatMoney(r, Math.abs(price.n)) : null, max, why: why ?? (max ? null : sell ? "You have none to sell" : "Can't afford it"), story: id, ...(sell ? { sell: true } : {}) });
    } else if (kind === "train") {
      const o = ok ? odds(r, s, a) : null;
      const max = ok ? affordable(r, s, a) : 0;
      v.train.push({ id, label: a.label, desc: a.desc ?? null, odds: o ? o.success : null, minutes: a.time ?? r.clock.minutesPerAction,
        cost: costWords(r, s, a), max, why: why ?? (max ? null : "Not enough left in you"), story: id });
    } else {
      // What it sets outright ("Energy full") as well as what it changes.
      const sets = Object.entries(a.effects.set).map(([sid, val]) => {
        const def = r.stats[sid];
        if (!def || def.show === "hidden") return "";
        const n = amount(r, s, val);
        return !Number.isFinite(n) ? "" : n >= def.max ? `${def.label} full` : n <= def.min ? `${def.label} cleared` : `${def.label} to ${n}`;
      }).filter(Boolean);
      const words = [effectWords(r, s, a.effects), ...sets].filter(Boolean).join(", ");
      v.rest.push({ id, label: a.label, desc: a.desc ?? null, minutes: a.time ?? r.clock.minutesPerAction, effects: words || null, why, story: id });
    }
  }
  return v.board.length || v.shop.length || v.bills.length || v.train.length || v.rest.length ? v : null;
}

/** May this action be done off the page now? Errands, board work, bills, items, travel. Returns why not, or null. */
export function quietBlocker(r: Ruleset, s: GameState, actionId: string): string | null {
  if (!errandsOpen(s)) return "Not now — finish what's happening first.";
  if (actionId.startsWith(`${QUEST_PREFIX}take:`)) {
    const id = actionId.slice(`${QUEST_PREFIX}take:`.length);
    return questOffers(r, s).some((o) => o.id === id) ? null : "That isn't on offer here.";
  }
  if (actionId.startsWith(PAY_PREFIX)) return workMoves(r, s).some((m) => m.id === actionId) ? null : "Nothing to pay there right now.";
  if (actionId.startsWith(TRAVEL_PREFIX)) return travelTargets(r, s).includes(actionId.slice(TRAVEL_PREFIX.length)) ? null : "You can't get there from here.";
  if (actionId.startsWith(ITEM_PREFIX)) return usableItems(r, s).some((u) => u.id === actionId && !u.locked) ? null : "You can't use that now.";
  const a = r.actions[actionId];
  const kind = a ? errandKind(r, a) : null;
  if (!a || !kind) return "That happens in the story — choose it there.";
  if (!findAction(r, s, actionId)) return lockReason(r, s, a) || "Not now.";
  // Money in effects isn't a cost the rules gate on: the window's own count decides.
  if (kind !== "rest" && affordable(r, s, a) < 1) return kind === "shop" ? "Can't afford it." : "Not enough left in you.";
  // Selling (or trading in) needs the thing in hand.
  for (const [id, d] of Object.entries(a.effects.items)) if (d < 0 && (s.items[id] ?? 0) < -d) return `You have no ${itemName(r, s, id)} left.`;
  return null;
}

/** Shop, training and rest actions — kept off the story choices while the window has them. */
export function errandActionIds(r: Ruleset): Set<string> {
  return new Set(r.actionOrder.filter((id) => errandKind(r, r.actions[id])));
}

/** What a quiet action was, in a few words for the next reply ("bought Soothing potion", "took on "Nectar for Tsukiko""). */
function quietWhat(r: Ruleset, s: GameState, actionId: string): string {
  if (actionId.startsWith(`${QUEST_PREFIX}take:`)) { const q = r.quests[actionId.slice(`${QUEST_PREFIX}take:`.length)]; return `Took on "${q?.name ?? "a job"}" from the notice board`; }
  if (actionId.startsWith(PAY_PREFIX)) { const m = workMoves(r, s).find((x) => x.id === actionId); return m ? m.label.replace(/^Pay /, "Paid ") : "Paid a bill"; }
  if (actionId.startsWith(TRAVEL_PREFIX)) { const id = actionId.slice(TRAVEL_PREFIX.length); return `Went to ${r.locations[id]?.name ?? id}`; }
  if (actionId.startsWith(ITEM_PREFIX)) { const id = actionId.slice(ITEM_PREFIX.length); return `Used ${itemName(r, s, id)}`; }
  return r.actions[actionId]?.label ?? actionId;
}

export interface QuietResult {
  events: WarpEvent[];
  /** The line for the next reply ("Buy Soothing potion ×2 (Soothing potion +2, Coin −50)"). */
  line: string | null;
  /** How many times it actually happened (it stops early when it runs out of money, energy or stock). */
  done: number;
  /** Why it couldn't happen at all. */
  error?: string;
  after: GameState;
}

/**
 * Do something off the page, `times` times: each is a full rules turn (time passes, costs are paid, dice roll),
 * minus the story — world news that's waiting stays for the next reply. Stops early when it can't go on.
 * `changes(before, after, events)` words what changed (the view's change chips).
 */
export function runQuiet(r: Ruleset, s: GameState, actionId: string, times: number, opts: { seed: () => string; params?: Record<string, string>; changes: (before: GameState, after: GameState, events: WarpEvent[]) => string[] }): QuietResult {
  const n = Math.max(1, Math.min(MAX_TIMES, Math.floor(times) || 1));
  const blocked = quietBlocker(r, s, actionId);
  if (blocked) return { events: [], line: null, done: 0, error: blocked, after: s };
  const what = quietWhat(r, s, actionId);
  let st = s;
  const events: WarpEvent[] = [];
  let done = 0, rolled = 0, good = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0 && quietBlocker(r, st, actionId)) break;
    const rec = resolveTurnFull(r, st, { actionId, via: "choice", ...(opts.params ? { params: opts.params } : {}) }, { seed: opts.seed() }).record;
    // Waiting world news stays waiting: the next reply tells it.
    const evs = rec.events.filter((e) => e.t !== "noticed");
    if (rec.check) { rolled++; if (["success", "crit_success"].includes(rec.check.tier)) good++; }
    events.push(...evs);
    st = foldEvents(r, [evs], st);
    done++;
    // Something that needs the story (a fight broke out, the story ended): stop here.
    if (!errandsOpen(st)) break;
  }
  const changes = [...(rolled > 1 ? [`${good} of ${rolled} went well`] : rolled === 1 ? [good ? "it went well" : "it didn't go well"] : []), ...opts.changes(s, st, events).filter(Boolean)];
  const line = `${what}${done > 1 ? ` ×${done}` : ""}${changes.length ? ` (${changes.join(", ")})` : ""}`;
  return { events, line, done, after: st };
}
