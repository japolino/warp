// Quests: things to do for someone (or for yourself) — offered by a person who's
// there, posted on a board, started by the rules, or handed out by the story —
// with goals the rules can see, a deadline, a reward, and a price for failing
// that the person who asked remembers.

import { evalBool, evalNumber } from "./expr.js";
import type { TurnBuilder } from "./resolve.js";
import { emptyEffect, slug, type Effect, type QuestDef, type QuestGoal, type QuestOp, type Ruleset } from "./ruleset.js";
import { itemName, makeEnv, personName, type EventSource, type GameState, type QuestState, type StoryQuest } from "./state.js";
import { presentPeople } from "./world.js";

export const QUEST_PREFIX = "quest:";
/** Quests the story handed out are kept under ids starting with this. */
export const STORY_QUEST = "story_";

/** A ruleset quest, or a stand-in for one the story handed out. */
export function questDef(r: Ruleset, s: GameState, id: string): QuestDef | null {
  const q = r.quests[id];
  if (q) return q;
  const st = s.quests?.[id]?.story;
  return st ? storyDef(id, st) : null;
}

function storyDef(id: string, st: StoryQuest): QuestDef {
  return {
    id, name: st.name, desc: st.goal, kind: "favour", ...(st.giver ? { giver: st.giver } : {}), board: false, at: [], auto: false,
    goals: [{ id: "done", text: st.goal, count: 1, optional: false }],
    judge: { done: st.goal, ...(st.fail ? { fail: st.fail } : {}) },
    days: 0, report: false, start: emptyEffect(), reward: emptyEffect(), failure: emptyEffect(), remember: {}, repeat: null, hidden: false,
    ...(st.stakes ? { stakes: st.stakes } : {}), order: 1000,
  };
}

export function goalDone(r: Ruleset, s: GameState, st: QuestState, g: QuestGoal): boolean {
  return g.when ? evalBool(g.when, makeEnv(r, s), false) : (st.prog[g.id] ?? 0) >= (g.count ?? 1);
}

function complete(r: Ruleset, s: GameState, q: QuestDef, st: QuestState): boolean {
  if (q.succeed) return evalBool(q.succeed, makeEnv(r, s), false);
  const need = q.goals.filter((g) => !g.optional);
  return need.length > 0 && !q.judge.done && need.every((g) => goalDone(r, s, st, g));
}

/** Someone or somewhere to hand it in to. */
function handIn(q: QuestDef): boolean {
  return !!q.giver || q.board || q.at.length > 0;
}

export interface QuestOffer { id: string; via: "giver" | "board" | "place"; from: string | null }

/** Quests that can be taken here and now: from someone who's with {{user}}, off a board, or at the place itself. */
export function questOffers(r: Ruleset, s: GameState): QuestOffer[] {
  if (!r.questOrder.length || s.encounter || s.dungeon || s.ended) return [];
  const env = makeEnv(r, s);
  const here = new Set(presentPeople(r, s, env));
  const board = !!(s.location && r.locations[s.location]?.board);
  const out: QuestOffer[] = [];
  for (const id of r.questOrder) {
    const q = r.quests[id];
    if (q.auto || q.hidden || s.quests?.[id]) continue;
    if (q.when && !evalBool(q.when, env, false)) continue;
    if (q.giver && here.has(q.giver)) out.push({ id, via: "giver", from: personName(r, s, q.giver) });
    else if (q.board && board) out.push({ id, via: "board", from: null });
    else if (s.location && q.at.includes(s.location)) out.push({ id, via: "place", from: null });
  }
  return out;
}

/** Finished quests waiting to be handed in where {{user}} is now. */
export function questsToReport(r: Ruleset, s: GameState): { id: string; to: string | null }[] {
  const out: { id: string; to: string | null }[] = [];
  if (s.encounter || s.dungeon) return out;
  const here = new Set(presentPeople(r, s, makeEnv(r, s)));
  const board = !!(s.location && r.locations[s.location]?.board);
  for (const [id, st] of Object.entries(s.quests ?? {})) {
    if (st.st !== "ready") continue;
    const q = questDef(r, s, id);
    if (!q) continue;
    if (q.giver) { if (here.has(q.giver)) out.push({ id, to: personName(r, s, q.giver) }); }
    else if ((q.board && board) || (s.location && q.at.includes(s.location))) out.push({ id, to: null });
  }
  return out;
}

/** "30 Gold, 40 XP, a Wolf Pelt, +5 Trust with Hesk": a reward (or a price) in words, read before it's applied. */
export function effectWords(r: Ruleset, s: GameState, e: Effect): string {
  const env = makeEnv(r, s);
  const num = (v: string | number) => { try { return Math.round(evalNumber(v, env, 0) * 10) / 10; } catch { return 0; } };
  const parts: string[] = [];
  for (const [id, v] of Object.entries(e.stats)) {
    const n = typeof v === "string" && /%$/.test(v.trim()) ? null : num(v);
    if (n === 0) continue;
    const def = r.stats[id];
    const label = def?.label ?? id;
    parts.push(n === null ? `${v} ${label}` : def?.kind === "money" ? `${n > 0 ? "" : "−"}${r.hud.currency}${Math.abs(n)}` : `${n > 0 ? "+" : "−"}${Math.abs(n)} ${label}`);
  }
  for (const [id, n] of Object.entries(e.items)) parts.push(`${n > 0 ? "" : "loses "}${Math.abs(n) > 1 ? `${Math.abs(n)}× ` : "a "}${itemName(r, s, id)}`);
  for (const [who, m] of Object.entries(e.rel)) for (const [stat, v] of Object.entries(m)) {
    const n = num(v);
    if (n) parts.push(`${n > 0 ? "+" : "−"}${Math.abs(n)} ${r.relStats[stat]?.label ?? stat} with ${who === "target" ? "them" : personName(r, s, who)}`);
  }
  for (const id of e.learn) if (r.abilities[id]) parts.push(`learns ${r.abilities[id].name}`);
  for (const id of e.unlock) if (r.codex[id]) parts.push(`codex: ${r.codex[id].title}`);
  for (const [id, op] of Object.entries(e.quest)) if (op === "start" && r.quests[id]) parts.push(`leads to "${r.quests[id].name}"`);
  return parts.join(", ");
}

/** The relationship stat that stands for how someone feels about {{user}} overall. */
function warmth(r: Ruleset): string | null {
  return r.relStatOrder.find((id) => r.relStats[id].narrator > 0 && r.relStats[id].good !== "low") ?? r.relStatOrder.find((id) => r.relStats[id].good !== "low") ?? null;
}

/** Story quests have no reward table: the person who asked thinks better (or worse) of {{user}}. */
function moveGiver(t: TurnBuilder, who: string | undefined, sign: 1 | -1, src: EventSource) {
  const stat = warmth(t.r);
  if (!who || !stat || !t.s.people[who]) return;
  const def = t.r.relStats[stat];
  t.push({ t: "rel", who, stat, d: sign * Math.max(2, Math.round((def.max - def.min) * 0.05)), src });
}

function remember(t: TurnBuilder, q: QuestDef, how: "done" | "failed", why?: string) {
  if (!q.giver || q.remember === false || !t.s.people[q.giver]) return;
  const text = q.remember[how] ?? (how === "done"
    ? `{{user}} came through on "${q.name}".`
    : why === "gave up" ? `{{user}} gave up on "${q.name}".` : `{{user}} let them down on "${q.name}"${why ? ` (${why})` : ""}.`);
  t.push({ t: "memory", who: q.giver, text, src: "trigger" });
}

function goalLine(q: QuestDef): string {
  return q.goals.filter((g) => !g.optional).map((g) => (g.count && g.count > 1 ? `${g.text} (×${g.count})` : g.text)).join("; ");
}

export function startQuest(t: TurnBuilder, id: string, src: EventSource, story?: StoryQuest) {
  const q = story ? storyDef(id, story) : t.r.quests[id];
  if (!q) return;
  const st = t.s.quests?.[id];
  if (st && st.st !== "done" && st.st !== "failed") return;
  if (st) t.push({ t: "quest", id, st: null, src });
  const due = q.days ? t.s.minutes + Math.round(q.days * 1440) : null;
  t.push({ t: "quest", id, st: "active", due, ...(story ? { story } : {}), src });
  t.apply(q.start, src);
  const giver = q.giver ? personName(t.r, t.s, q.giver) : null;
  const reward = effectWords(t.r, t.s, q.reward);
  t.announce([
    `NEW QUEST — "${q.name}"${giver ? `, for ${giver}` : ""}: ${q.desc ?? goalLine(q)}.`,
    q.desc && q.goals.length ? `Goals: ${goalLine(q)}.` : "",
    q.days ? `Due within ${q.days} day${q.days === 1 ? "" : "s"}.` : "",
    reward ? `Reward: ${reward}.` : "",
    q.stakes ? `At stake: ${q.stakes}` : "",
    giver && src === "action" ? `Let ${giver} lay it out in their own words.` : "",
  ].filter(Boolean).join(" "));
}

export function finishQuest(t: TurnBuilder, id: string, src: EventSource) {
  const q = questDef(t.r, t.s, id);
  if (!q) return;
  const reward = effectWords(t.r, t.s, q.reward);
  t.push({ t: "quest", id, st: "done", src });
  t.apply(q.reward, src);
  if (t.s.quests?.[id]?.story) moveGiver(t, q.giver, 1, src);
  remember(t, q, "done");
  const giver = q.giver ? personName(t.r, t.s, q.giver) : null;
  t.announce(`QUEST COMPLETE — "${q.name}".${reward ? ` Reward: ${reward}.` : ""} Narrate the payoff${giver ? `, and how ${giver} takes it` : ""}.`);
}

export function failQuest(t: TurnBuilder, id: string, src: EventSource, why?: string) {
  const q = questDef(t.r, t.s, id);
  if (!q) return;
  const price = effectWords(t.r, t.s, q.failure);
  t.push({ t: "quest", id, st: "failed", src });
  t.apply(q.failure, src);
  if (t.s.quests?.[id]?.story) moveGiver(t, q.giver, -1, src);
  remember(t, q, "failed", why);
  const giver = q.giver ? personName(t.r, t.s, q.giver) : null;
  t.announce(`QUEST FAILED — "${q.name}"${why ? ` (${why})` : ""}.${q.stakes ? ` ${q.stakes}` : ""}${price ? ` It costs: ${price}.` : ""} Show the consequences${giver ? ` — ${giver} won't forget it` : ""}.`);
}

/** A quest step from an effect: `quest: { wolves: start }`. */
export function questOp(t: TurnBuilder, id: string, op: QuestOp, src: EventSource) {
  const st = t.s.quests?.[id];
  const open = st?.st === "active" || st?.st === "ready";
  const q = questDef(t.r, t.s, id);
  if (!q) return;
  switch (op) {
    case "start":
      if (!st || (q.repeat !== null && !open)) startQuest(t, id, src);
      break;
    case "done": if (open) finishQuest(t, id, src); break;
    case "fail": if (open) failQuest(t, id, src); break;
    case "drop": if (open) failQuest(t, id, src, "gave up"); break;
    case "report": if (st?.st === "ready" || (st?.st === "active" && complete(t.r, t.s, q, st))) finishQuest(t, id, src); break;
  }
}

/** Count toward a goal: `progress: { wolves: +1 }` (the first counted goal still open) or `{ "wolves.pelts": +1 }`. */
export function questProgress(t: TurnBuilder, key: string, d: number, src: EventSource) {
  const [qid, gid] = key.split(".");
  const q = t.r.quests[qid];
  const st = t.s.quests?.[qid];
  if (!q || st?.st !== "active" || !d) return;
  const counted = q.goals.filter((g) => g.count !== undefined && !g.when);
  const goal = gid ? q.goals.find((g) => g.id === gid) : counted.find((g) => (st.prog[g.id] ?? 0) < (g.count ?? 1)) ?? counted[0];
  if (goal) t.push({ t: "qprog", id: qid, goal: goal.id, d, src });
}

/** Goals that count themselves: an encounter that ended well, or an action that worked, while the quest is on. */
export function questHooks(t: TurnBuilder, hook: { kind: "encounter" | "action"; id: string; result: string; good: boolean }) {
  for (const [qid, st] of Object.entries(t.s.quests ?? {})) {
    if (st.st !== "active") continue;
    for (const g of t.r.quests[qid]?.goals ?? []) {
      if (!g.on || g.on.kind !== hook.kind || g.on.id !== hook.id) continue;
      if (g.on.outcomes.length ? g.on.outcomes.includes(hook.result) : hook.good) t.push({ t: "qprog", id: qid, goal: g.id, d: 1, src: "trigger" });
    }
  }
}

/** Each turn: quests that start themselves, deadlines, failures, goals met, and repeatable ones coming round again. */
export function questLife(t: TurnBuilder) {
  const { r } = t;
  for (const id of r.questOrder) {
    const q = r.quests[id];
    if (!t.s.quests?.[id] && q.auto && (!q.when || evalBool(q.when, t.env(), false))) startQuest(t, id, "trigger");
    const st = t.s.quests?.[id];
    if (!st) continue;
    if (st.st === "done" || st.st === "failed") {
      if (q.repeat !== null && st.ended !== undefined && t.s.minutes - st.ended >= q.repeat * 1440) {
        t.push({ t: "quest", id, st: null, src: "world" });
        if (q.auto && (!q.when || evalBool(q.when, t.env(), false))) startQuest(t, id, "trigger");
      }
      continue;
    }
    if (st.st !== "active") continue;
    if (st.due !== null && t.s.minutes > st.due) failQuest(t, id, "trigger", "time ran out");
    else if (q.fail && evalBool(q.fail, t.env(), false)) failQuest(t, id, "trigger");
    else if (complete(r, t.s, q, st)) {
      if (q.report && handIn(q)) {
        t.push({ t: "quest", id, st: "ready", src: "trigger" });
        t.announce(`"${q.name}" is done — ${q.giver ? `${personName(r, t.s, q.giver)} is waiting to hear about it` : "it can be handed in at the board"}.`);
      } else finishQuest(t, id, "trigger");
    }
  }
  // Story quests run out of time too (the story judges the rest).
  for (const [id, st] of Object.entries(t.s.quests ?? {})) {
    if (st.story && st.st === "active" && st.due !== null && t.s.minutes > st.due) failQuest(t, id, "trigger", "time ran out");
  }
}

/** Taking, handing in or giving up a quest: `quest:take:<id>`, `quest:report:<id>`, `quest:drop:<id>`. Returns the action's label. */
export function resolveQuest(t: TurnBuilder, actionId: string): string | null {
  const [, verb, id] = actionId.split(":");
  const q = questDef(t.r, t.s, id ?? "");
  if (!q) return null;
  if (verb === "take") {
    if (!questOffers(t.r, t.s).some((o) => o.id === id)) return null;
    startQuest(t, id, "action");
    t.time(5, "action");
    return `Take on "${q.name}"`;
  }
  if (verb === "report") {
    if (!questsToReport(t.r, t.s).some((o) => o.id === id)) return null;
    finishQuest(t, id, "action");
    t.time(10, "action");
    return `Hand in "${q.name}"`;
  }
  if (verb === "drop") {
    const st = t.s.quests?.[id];
    if (st?.st !== "active" && st?.st !== "ready") return null;
    failQuest(t, id, "action", "gave up");
    return `Give up on "${q.name}"`;
  }
  return null;
}

/** What the story reported about quests after a reply. */
export interface StoryQuestNews {
  /** Someone asked {{user}} for something (or {{user}} promised it). */
  new?: { name: string; giver?: string; goal: string; fail?: string; stakes?: string; hours?: number }[];
  /** Quests (by id) the reply finished or failed. */
  done?: string[];
  failed?: string[];
}

/** Quests from the story: new ones (bounded), and judged endings for any quest that's open. */
export function storyQuestNews(t: TurnBuilder, news: StoryQuestNews, findPerson: (name: string) => string | null) {
  const { r } = t;
  for (const id of news.done ?? []) {
    const st = t.s.quests?.[id];
    if (st?.st === "active" || st?.st === "ready") finishQuest(t, id, "narrator");
  }
  for (const id of news.failed ?? []) {
    const st = t.s.quests?.[id];
    if (st?.st === "active" || st?.st === "ready") failQuest(t, id, "narrator");
  }
  if (!r.storyQuests.enabled) return;
  let open = Object.values(t.s.quests ?? {}).filter((q) => q.story && q.st === "active").length;
  for (const n of news.new ?? []) {
    if (open >= r.storyQuests.max) break;
    const name = String(n.name ?? "").trim().slice(0, 80);
    const goal = String(n.goal ?? "").trim().slice(0, 240);
    if (!name || !goal) continue;
    // The same request told twice is one quest.
    const taken = Object.values(t.s.quests ?? {}).some((q) => q.story && q.st !== "done" && q.st !== "failed" && q.story.name.toLowerCase() === name.toLowerCase());
    if (taken || Object.values(r.quests).some((q) => q.name.toLowerCase() === name.toLowerCase())) continue;
    const giver = n.giver ? findPerson(n.giver) ?? undefined : undefined;
    let id = `${STORY_QUEST}${slug(name) || "favour"}`;
    for (let i = 2; t.s.quests?.[id]; i++) id = `${STORY_QUEST}${slug(name)}_${i}`;
    const story: StoryQuest = { name, goal, ...(giver ? { giver } : {}), ...(n.fail ? { fail: String(n.fail).slice(0, 240) } : {}), ...(n.stakes ? { stakes: String(n.stakes).slice(0, 200) } : {}) };
    t.push({ t: "quest", id, st: "active", due: n.hours && n.hours > 0 ? t.s.minutes + Math.round(n.hours * 60) : null, story, src: "narrator" });
    open++;
  }
}

/** Open quests, for the narrator: what's being worked on, what's due, and what failing would cost. */
export function questDigest(r: Ruleset, s: GameState, only?: (id: string) => boolean): string[] {
  const out: string[] = [];
  for (const [id, st] of Object.entries(s.quests ?? {})) {
    if (st.st !== "active" && st.st !== "ready") continue;
    if (only && !only(id)) continue;
    const q = questDef(r, s, id);
    if (!q) continue;
    const giver = q.giver ? personName(r, s, q.giver) : null;
    const goals = q.goals.filter((g) => !g.optional).map((g) => `${goalDone(r, s, st, g) ? "✓" : "☐"} ${g.text}${g.count && g.count > 1 ? ` (${Math.min(st.prog[g.id] ?? 0, g.count)}/${g.count})` : ""}`).join("; ");
    const due = st.due !== null ? dueWords(st.due - s.minutes) : null;
    out.push(`"${q.name}"${giver ? ` for ${giver}` : ""}${st.st === "ready" ? " — done, to be handed in" : ""}${goals ? ` — ${goals}` : ""}${due ? ` — ${due}` : ""}${q.stakes ? ` — at stake: ${q.stakes}` : ""}`);
  }
  return out;
}

export function dueWords(minutesLeft: number): string {
  if (minutesLeft < 0) return "overdue";
  if (minutesLeft < 60) return `${Math.max(1, Math.round(minutesLeft))} min left`;
  if (minutesLeft < 48 * 60) return `${Math.round(minutesLeft / 60)}h left`;
  return `${Math.round(minutesLeft / 1440)} days left`;
}
