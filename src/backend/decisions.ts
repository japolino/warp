// Everything Warp asks a decision model, phrased as typed questions.
//
//   readTurn     — which action (if any) the player's text attempts, how hard, and scene triggers
//   odds         — probabilities for `decide:` blocks (the engine rolls on them)
//   bookkeeping  — atomic "what changed?" questions after a reply (System-1 path)
//   consistency  — does the reply contradict the game state?

import type { Answer, Answers, Decider, Questions } from "../engine/decide.js";
import { normalize, noulConfidence } from "../engine/decide.js";
import { availableChoices, TRAVEL_PREFIX, travelTargets, type Intent, type Proposal } from "../engine/resolve.js";
import type { DecideSpec, Ruleset, StatDef } from "../engine/ruleset.js";
import { personName, type GameState } from "../engine/state.js";
import { stateDigest } from "../engine/view.js";
import { activeSession } from "../engine/date/talk.js";
import type { Settings } from "../shared/protocol.js";
import { logError } from "./host.js";

const NONE = "none";

function clip(s: string, n: number) {
  return s.length > n ? `…${s.slice(-n)}` : s;
}

function fill(text: string, player: string) {
  return text.replace(/\{\{user\}\}/gi, player);
}

async function safeAsk(d: Decider, state: unknown, q: Questions, timeoutMs: number, what: string): Promise<Answers> {
  if (!Object.keys(q).length) return {};
  try {
    return await (d.ask as (s: unknown, q: Questions, o: { timeoutMs: number }) => Promise<Answers>)(state, q, { timeoutMs });
  } catch (e) {
    logError(`${what} (${d.id})`, e);
    return {};
  }
}

// ───────────────────────── reading the turn ─────────────────────────

export interface Reading {
  /** Act on this (confidence ≥ auto threshold). */
  intent: Intent | null;
  /** Offer this as a one-tap suggestion (between the thresholds). */
  suggestion: (Intent & { label: string; confidence: number }) | null;
  confidence: number;
  scene: Record<string, boolean>;
}

const DIFFICULTY = [
  "Trivial or easy for an ordinary person in this situation",
  "A fair challenge",
  "Hard — most people would struggle",
  "Extreme — only the exceptional could pull it off",
];

export async function readTurn(opts: {
  decider: Decider; r: Ruleset; s: GameState; settings: Settings;
  playerText: string | null; sceneText: string; player: string; timeoutMs: number;
}): Promise<Reading> {
  const { decider, r, s, settings, playerText, player } = opts;
  const q: Questions = {};
  // In a conversation or on a date, typed lines are the player's words in it (read when the turn resolves), not actions.
  const talking = !!activeSession(r, s);
  const actions = playerText && !talking ? availableChoices(r, s, settings.lines) : [];
  const travel = playerText && !talking ? travelTargets(r, s) : [];

  if (playerText && (actions.length || travel.length)) {
    const criteria: Record<string, string> = {
      [NONE]: "None of these: dialogue, thoughts, feelings, plans, questions, or something trivial that can't fail",
    };
    for (const c of actions) criteria[c.id] = `${c.label}${c.a.desc ? ` — ${c.a.desc}` : ""}`;
    for (const t of travel) criteria[`${TRAVEL_PREFIX}${t}`] = `Go to ${r.locations[t].name}`;
    q.action = { type: "choice", instructions: `Which of these does ${player}'s latest message actually attempt right now?`, criteria };
    if (actions.some((c) => c.a.params.length)) {
      q.difficulty = { type: "score", instructions: `How hard is what ${player} is attempting, given the scene?`, criteria: DIFFICULTY };
    }
  }
  for (const t of r.triggers) {
    if (t.whenScene) q[`scene:${t.id}`] = { type: "noul", instructions: fill(t.whenScene, player) };
  }
  // Story beats that move hidden world clocks ("{{user}} stirred up the dock gangs").
  for (const f of Object.values(r.fronts)) f.pushes.forEach((p, i) => {
    q[`front:${f.id}:${i}`] = { type: "noul", instructions: `In the latest exchange: ${fill(p.scene, player)}` };
  });

  const state = {
    game_state: stateDigest(r, s),
    scene_so_far: clip(opts.sceneText, 2000) || "(start of story)",
    ...(playerText ? { player_message: clip(playerText, 1500) } : {}),
  };
  const ans = await safeAsk(decider, state, q, opts.timeoutMs, "read turn");

  const scene: Record<string, boolean> = {};
  for (const t of r.triggers) {
    const a = ans[`scene:${t.id}`];
    // Only commit a scene judgement when the model is reasonably sure either way.
    if (t.whenScene && a?.type === "noul" && noulConfidence(a.noul) >= 0.3) scene[t.id] = a.noul >= 0.5;
  }
  for (const [key, a] of Object.entries(ans)) {
    // Clock pushes only count when the model is fairly sure it happened.
    if (key.startsWith("front:") && a.type === "noul" && a.noul >= 0.65) scene[key] = true;
  }

  const out: Reading = { intent: null, suggestion: null, confidence: 0, scene };
  const act = ans.action;
  if (act?.type !== "choice" || act.choice === NONE) return out;
  const id = act.choice;
  const conf = act.probabilities[id] ?? act.confidence;
  out.confidence = conf;

  let intent: Intent | null = null;
  let label = id;
  if (id.startsWith(TRAVEL_PREFIX)) {
    const to = id.slice(TRAVEL_PREFIX.length);
    if (!travel.includes(to)) return out;
    intent = { actionId: id, via: "adjudicator" };
    label = `Go to ${r.locations[to].name}`;
  } else {
    const c = actions.find((x) => x.id === id);
    const a = c?.a;
    if (!a) return out;
    label = c!.label;
    const params: Record<string, string> = {};
    const level = ans.difficulty?.type === "score" ? ans.difficulty.score / (DIFFICULTY.length - 1) : null;
    for (const p of a.params) {
      // Map the 0..1 difficulty onto this param's options, which are listed easiest → hardest.
      const keys = Object.keys(p.options);
      params[p.id] = level === null ? p.default : keys[Math.round(level * (keys.length - 1))];
    }
    intent = { actionId: c!.id, via: "adjudicator", ...(a.params.length ? { params } : {}) };
  }
  if (conf >= settings.autoConfidence) out.intent = intent;
  else if (conf >= settings.askConfidence) out.suggestion = { ...intent, label, confidence: conf };
  return out;
}

// ───────────────────────── odds for decide blocks ─────────────────────────

export async function odds(opts: {
  decider: Decider; r: Ruleset; s: GameState; specs: DecideSpec[];
  playerText: string; sceneText: string; player: string; timeoutMs: number;
  /** Who the people are (the card), for questions about tastes and ages. */
  card?: string;
}): Promise<Record<string, Record<string, number>>> {
  const q: Questions = {};
  for (const d of opts.specs) {
    q[`decide:${d.id}`] = {
      type: "choice",
      instructions: fill(d.ask, opts.player),
      criteria: Object.fromEntries(d.options.map((o) => [o.id, fill(o.desc, opts.player)])),
    };
  }
  const state = {
    game_state: stateDigest(opts.r, opts.s),
    scene_so_far: clip(opts.sceneText, 2000),
    player_message: clip(opts.playerText, 1200),
    ...(opts.card ? { character_card: opts.card } : {}),
  };
  const ans = await safeAsk(opts.decider, state, q, opts.timeoutMs, "decide odds");
  const out: Record<string, Record<string, number>> = {};
  for (const d of opts.specs) {
    const a = ans[`decide:${d.id}`];
    if (a?.type === "choice") out[d.id] = normalize(a.probabilities, d.options.map((o) => o.id));
  }
  return out;
}

// ───────────────────────── System-1 bookkeeping ─────────────────────────

const STEPS = ["down_lot", "down", "same", "up", "up_lot"] as const;
const STEP_FACTOR: Record<string, number> = { down_lot: -1, down: -1 / 3, same: 0, up: 1 / 3, up_lot: 1 };
const TIME_LEVELS = [
  "No meaningful time — a few seconds or a single exchange",
  "A few minutes",
  "Around half an hour",
  "About an hour",
  "A few hours",
  "Most of a day or night",
];
const TIME_MINUTES = [0, 5, 30, 60, 180, 480];

/** Rungs for reading someone's starting feelings: the stat's bands if it has them, else five even steps. */
function feelLevels(d: StatDef): { text: string; value: number }[] {
  if (d.bands.length >= 2) {
    return d.bands.map((b, i) => {
      const next = d.bands[i + 1]?.at ?? d.max;
      return { text: b.text, value: Math.round((b.at + next) / 2) };
    });
  }
  const names = ["Very low", "Low", "Middling", "High", "Very high"];
  return names.map((text, i) => ({ text, value: Math.round(d.min + ((d.max - d.min) * i) / (names.length - 1)) }));
}

/** A step's delta, rounded so chips read "+2", not "+1.667". Never rounds a real change to zero. */
function stepDelta(step: string, limit: number): number {
  const raw = STEP_FACTOR[step] * limit;
  const rounded = Math.round(raw);
  return rounded === 0 && raw !== 0 ? Math.sign(raw) * Math.min(1, Math.abs(limit)) : rounded;
}

function stepCriteria(what: string): Record<string, string> {
  return {
    down_lot: `${what} dropped sharply`,
    down: `${what} went down a little`,
    same: `${what} didn't change, or the reply doesn't say`,
    up: `${what} went up a little`,
    up_lot: `${what} rose sharply`,
  };
}

function confident(a: Answer | undefined): a is Extract<Answer, { type: "choice" }> {
  return a?.type === "choice" && a.confidence >= 0.5;
}

export interface Bookkeeping {
  proposal: Proposal;
  /** Open-ended things a writing model should fill in (names). */
  needsWriting: Set<"people" | "items" | "move" | "body">;
}

export async function bookkeeping(opts: {
  decider: Decider; r: Ruleset; s: GameState; playerText: string; reply: string; player: string;
  /** The turn's outcome the rules already applied (not to be counted again). */
  applied?: string | null;
}): Promise<Bookkeeping> {
  const { r, s, player } = opts;
  const q: Questions = {};
  if (r.clock.enabled) q.time = { type: "score", instructions: "How much in-story time passes during the narrator's reply?", criteria: TIME_LEVELS };

  for (const id of r.statOrder) {
    const d = r.stats[id];
    if (d.narrator <= 0) continue;
    q[`stat:${id}`] = { type: "choice", instructions: `During the reply, how did ${player}'s ${d.label}${d.desc ? ` (${d.desc})` : ""} change, beyond anything listed in already_applied?`, criteria: stepCriteria(d.label) };
  }
  // Only ask about people the reply actually mentions — keeps the question count bounded.
  const lower = opts.reply.toLowerCase();
  const mentioned = Object.keys(s.people).filter((pid) => lower.includes(personName(r, s, pid).toLowerCase().split(" ")[0]));
  for (const pid of mentioned) for (const rs of r.relStatOrder) {
    const d = r.relStats[rs];
    if (d.narrator <= 0) continue;
    const name = personName(r, s, pid);
    if (!s.calibrated[pid]) {
      // First real appearance: ask where they stand, on the stat's own scale.
      const levels = feelLevels(d);
      q[`feel:${pid}:${rs}`] = { type: "score", instructions: `Right now, how does ${name} feel toward ${player} — ${d.label}?`, criteria: levels.map((l) => l.text) };
    } else {
      q[`rel:${pid}:${rs}`] = { type: "choice", instructions: `How did ${name}'s ${d.label} toward ${player} change during the reply, beyond anything listed in already_applied?`, criteria: stepCriteria(`${name}'s ${d.label}`) };
    }
  }
  const locs = Object.values(r.locations);
  if (locs.length && !r.locationsOpen) {
    q.move = {
      type: "choice",
      instructions: `Where is ${player} at the end of the reply?`,
      criteria: { stay: `Still at ${s.locationName ?? "the same place"}`, ...Object.fromEntries(locs.filter((l) => l.id !== s.location).map((l) => [l.id, l.name])) },
    };
  }
  for (const c of Object.values(r.conditions)) {
    if (!c.narrator) continue;
    q[`cond:${c.id}`] = { type: "noul", instructions: `At the end of the reply, ${player} is ${c.label.toLowerCase()}${c.desc ? ` (${c.desc})` : ""}` };
  }
  for (const f of Object.values(r.flags)) {
    if (f.narrator && typeof f.start === "boolean") q[`flag:${f.id}`] = { type: "noul", instructions: `At the end of the reply, this is true: ${f.label ?? f.id.replace(/_/g, " ")}` };
  }
  if (r.wardrobe.enabled && r.wardrobe.narrator) {
    for (const [slot, id] of Object.entries(s.worn)) {
      q[`cloth:${slot}`] = { type: "noul", instructions: `By the end of the reply, ${player} no longer has their ${r.items[id]?.name ?? id} on (taken off, removed or lost)` };
    }
  }
  if (r.body.enabled && r.body.narrator) q["gate:body"] = { type: "noul", instructions: `${player}'s body changes during the reply (a transformation, new mark or tattoo, haircut or dye, a lasting injury…)` };
  if (r.peopleOpen) q["gate:people"] = { type: "noul", instructions: "The reply introduces a named character who wasn't in the game state before" };
  if (r.itemsOpen) q["gate:items"] = { type: "noul", instructions: `${player} gains, loses or uses up an item during the reply` };
  if (r.locationsOpen) q["gate:move"] = { type: "noul", instructions: `${player} ends the reply somewhere different from ${s.locationName ?? "where they started"}` };

  const state = {
    game_state: stateDigest(r, s), player_message: clip(opts.playerText, 1200), narrator_reply: clip(opts.reply, 6000),
    already_applied: opts.applied || "(nothing — the rules applied no changes this turn)",
  };
  const ans = await safeAsk(opts.decider, state, q, 12000, "bookkeeping");

  const p: Proposal = {};
  const t = ans.time;
  if (t?.type === "score" && t.confidence >= 0.4) {
    // Interpolate between levels using the fractional score.
    const lo = Math.floor(t.score), hi = Math.min(TIME_MINUTES.length - 1, lo + 1), f = t.score - lo;
    p.minutes = Math.round(TIME_MINUTES[lo] + (TIME_MINUTES[hi] - TIME_MINUTES[lo]) * f);
  }
  for (const id of r.statOrder) {
    const a = ans[`stat:${id}`];
    if (!confident(a) || a.choice === "same") continue;
    (p.stats ??= {})[id] = stepDelta(a.choice, r.stats[id].narrator);
  }
  for (const [key, a] of Object.entries(ans)) {
    if (!key.startsWith("feel:") || a.type !== "score" || a.confidence < 0.3) continue;
    const [, pid, rs] = key.split(":");
    const levels = feelLevels(r.relStats[rs]);
    const i = Math.max(0, Math.min(levels.length - 1, Math.round(a.score)));
    ((p.feelings ??= {})[personName(r, s, pid)] ??= {})[rs] = levels[i].value;
  }
  for (const [key, a] of Object.entries(ans)) {
    if (!key.startsWith("rel:") || !confident(a) || a.choice === "same") continue;
    const [, pid, rs] = key.split(":");
    ((p.rel ??= {})[personName(r, s, pid)] ??= {})[rs] = stepDelta(a.choice, r.relStats[rs].narrator);
  }
  if (confident(ans.move) && ans.move.choice !== "stay") p.move = ans.move.choice;
  for (const c of Object.values(r.conditions)) {
    const a = ans[`cond:${c.id}`];
    if (a?.type !== "noul" || noulConfidence(a.noul) < 0.4) continue;
    const on = a.noul >= 0.5;
    if (on && !s.conditions[c.id]) ((p.conditions ??= {}).add ??= []).push(c.id);
    if (!on && s.conditions[c.id]) ((p.conditions ??= {}).remove ??= []).push(c.id);
  }
  for (const f of Object.values(r.flags)) {
    const a = ans[`flag:${f.id}`];
    if (a?.type === "noul" && noulConfidence(a.noul) >= 0.4) (p.flags ??= {})[f.id] = a.noul >= 0.5;
  }
  for (const slot of Object.keys(s.worn)) {
    const a = ans[`cloth:${slot}`];
    if (a?.type === "noul" && a.noul >= 0.7) (p.undress ??= []).push(slot);
  }
  const needsWriting = new Set<"people" | "items" | "move" | "body">();
  for (const g of ["people", "items", "move", "body"] as const) {
    const a = ans[`gate:${g}`];
    if (a?.type === "noul" && a.noul >= 0.6) needsWriting.add(g);
  }
  return { proposal: p, needsWriting };
}

// ───────────────────────── consistency ─────────────────────────

export async function contradiction(opts: {
  decider: Decider; r: Ruleset; s: GameState; reply: string; outcome: string | null;
}): Promise<number | null> {
  const q: Questions = {
    contradicts: {
      type: "noul",
      instructions: "The narrator's reply contradicts the game state or the decided outcome (wrong location, items, injuries, relationships, time of day, or a different result than the dice gave)",
    },
  };
  const state = { game_state: stateDigest(opts.r, opts.s), decided_outcome: opts.outcome ?? "(none)", narrator_reply: clip(opts.reply, 6000) };
  const ans = await safeAsk(opts.decider, state, q, 8000, "consistency");
  const a = ans.contradicts;
  return a?.type === "noul" ? a.noul : null;
}
