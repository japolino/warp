// Growth and goals, the goals half (CORE-DESIGN §2.6): a short list of story goals. Authored goals start open
// and close by formula (`done_when` / `fail_when`) or by the post-reply read (`judge`); the story adds goals
// it makes (a promise, a favour someone asks, a plan {{user}} states), up to `goals.max` open at once.
// Only the rules close a goal.

import { evalBool } from "./expr.js";
import type { TurnBuilder } from "./resolve.js";
import { slug, type GoalOp, type Ruleset } from "./ruleset.js";
import { personName, type EventSource, type GameState, type GoalState } from "./state.js";

/** Story goals are kept under ids starting with this. */
export const STORY_GOAL = "story_";

/** A goal's state word for formulas: '' (none), 'open', 'done' or 'failed'. */
export function goalWord(s: GameState, id: string): string {
  return s.goals?.[id]?.st ?? "";
}

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, " ").trim();

/** Close a goal: done applies an authored goal's reward once; a story goal's person remembers how it went. */
function close(t: TurnBuilder, id: string, st: "done" | "failed", src: EventSource) {
  const g = t.s.goals?.[id];
  if (!g || g.st !== "open") return;
  t.push({ t: "goal", id, st, src });
  const def = t.r.goals.list[id];
  if (st === "done" && def) t.apply(def.reward, src);
  if (g.from && t.s.people[g.from]) t.push({ t: "memory", who: g.from, text: st === "done" ? `{{user}} kept their promise: ${g.text}.` : `{{user}} let them down: ${g.text}.`, src });
  t.announce(st === "done" ? `Goal done: ${g.text}.` : `Goal failed: ${g.text}.${g.stakes ? ` At stake was: ${g.stakes}` : ""}`);
}

/** A `goal:` effect step: start (an authored goal again), done or fail. */
export function goalOp(t: TurnBuilder, id: string, op: GoalOp, src: EventSource) {
  const g = t.s.goals?.[id];
  if (op === "start") {
    const def = t.r.goals.list[id];
    if (def && (!g || g.st !== "open")) t.push({ t: "goal", id, st: "open", text: def.text, ...(def.stakes ? { stakes: def.stakes } : {}), src });
    return;
  }
  close(t, id, op === "done" ? "done" : "failed", src);
}

/** Each turn: authored goals whose `done_when` / `fail_when` now holds close. */
export function goalLife(t: TurnBuilder) {
  for (const def of Object.values(t.r.goals.list)) {
    if (t.s.goals?.[def.id]?.st !== "open") continue;
    if (def.doneWhen && evalBool(def.doneWhen, t.env(), false)) close(t, def.id, "done", "trigger");
    else if (def.failWhen && evalBool(def.failWhen, t.env(), false)) close(t, def.id, "failed", "trigger");
  }
}

export interface GoalNews {
  new?: { text: string; done?: string; from?: string; stakes?: string }[];
  advanced?: string[];
  done?: string[];
  failed?: string[];
}

/** Find a goal by id or by its text. */
function goalId(s: GameState, key: string): string | null {
  if (s.goals?.[key]) return key;
  const k = norm(key);
  return Object.entries(s.goals ?? {}).find(([, g]) => norm(g.text) === k)?.[0] ?? null;
}

/** What the post-reply read says about goals: new story goals (up to the max open), and goals done or failed. */
export function storyGoalNews(t: TurnBuilder, news: GoalNews, findPerson: (name: string) => string | null) {
  for (const key of Array.isArray(news.done) ? news.done : []) { const id = goalId(t.s, String(key)); if (id) close(t, id, "done", "narrator"); }
  for (const key of Array.isArray(news.failed) ? news.failed : []) { const id = goalId(t.s, String(key)); if (id) close(t, id, "failed", "narrator"); }
  if (!t.r.goals.fromStory) return;
  for (const g of Array.isArray(news.new) ? news.new : []) {
    const text = typeof g?.text === "string" ? g.text.trim().replace(/\s+/g, " ").slice(0, 160) : "";
    if (!text) continue;
    const open = Object.values(t.s.goals ?? {}).filter((x) => x.st === "open").length;
    if (open >= t.r.goals.max) break;
    // The same goal told twice is one goal.
    if (Object.values(t.s.goals ?? {}).some((x) => norm(x.text) === norm(text))) continue;
    let id = `${STORY_GOAL}${slug(text).slice(0, 40)}`;
    for (let i = 2; t.s.goals?.[id]; i++) id = `${STORY_GOAL}${slug(text).slice(0, 37)}_${i}`;
    const from = typeof g.from === "string" && g.from.trim() ? findPerson(g.from) : null;
    const stakes = typeof g.stakes === "string" && g.stakes.trim() ? g.stakes.trim().slice(0, 160) : undefined;
    const judge = typeof g.done === "string" && g.done.trim() ? g.done.trim().slice(0, 160) : undefined;
    t.push({ t: "goal", id, st: "open", text, ...(from ? { from } : {}), ...(stakes ? { stakes } : {}), ...(judge ? { judge } : {}), src: "narrator" });
  }
}

/** Is an open goal in play now (named in the turn, its person here, or made in the last 3 records)? */
export function goalInPlay(r: Ruleset, s: GameState, id: string, g: GoalState, here: Set<string>, focus: string | null): boolean {
  if (g.st !== "open") return false;
  if (focus === null) return true;
  if (g.from && here.has(g.from)) return true;
  if (s.turn - (g.turn ?? -99) <= 3) return true;
  const words = norm(g.text).split(" ").filter((w) => w.length >= 4);
  const f = norm(focus);
  if (words.length && words.filter((w) => f.includes(w)).length >= Math.min(2, words.length)) return true;
  return !!g.from && f.includes(personName(r, s, g.from).toLowerCase());
}
