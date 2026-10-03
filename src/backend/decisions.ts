// Everything Warp asks a decision model, phrased as typed questions.
//
//   readTurn     — which action (if any) the player's text attempts, how hard, and scene triggers
//   odds         — probabilities for `decide:` blocks (the engine rolls on them)
//   bookkeeping  — atomic "what changed?" questions after a reply (System-1 path)
//   consistency  — does the reply contradict the game state?

import { mentions } from "../engine/mention.js";
import type { Answer, Answers, Decider, Questions } from "../engine/decide.js";
import { normalize, noulConfidence } from "../engine/decide.js";
import { usableItems, availableChoices, type Intent, type Proposal } from "../engine/resolve.js";
import { QUEST_PREFIX, questDef, questOffers, questsToReport } from "../engine/quests.js";
import { judgedQuests } from "./helpers.js";
import { DIFFICULTIES, type DecideSpec, type Ruleset, type StatDef } from "../engine/ruleset.js";
import { itemName, makeEnv, personName, type GameState } from "../engine/state.js";
import { IMPROV, improvStats } from "../engine/freeform.js";
import { presentPeople } from "../engine/world.js";
import { stateDigest } from "../engine/view.js";
import type { Settings } from "../shared/protocol.js";
import { logError } from "./host.js";

const NONE = "none";
const ATTEMPT = "attempt";
/** How sure the model must be that a fight (or other encounter) is actually breaking out. */
const ENCOUNTER_SURE = 0.6;
/** …and that one in progress is over. */
const ENCOUNTER_OVER = 0.7;

const COMMON_CAPS = new Set([
  "the", "a", "an", "he", "she", "they", "it", "his", "her", "their", "i", "you", "we", "but", "and", "or", "so", "then",
  "when", "as", "if", "in", "on", "at", "with", "for", "from", "to", "of", "by", "that", "this", "there", "here", "what",
  "who", "why", "how", "yes", "no", "not", "oh", "ah", "maybe", "still", "just", "even", "now", "after", "before", "once",
  "every", "each", "some", "all", "something", "someone", "nothing", "god", "mr", "mrs", "ms", "miss", "sir", "lady", "lord",
]);

/**
 * Capitalised words in the middle of sentences that aren't anyone or anything the game
 * knows — likely a new name. Only a hint: it makes the "someone new?" question more sensitive.
 */
export function newNames(text: string, known: string[]): string[] {
  const knownWords = new Set(known.flatMap((n) => n.toLowerCase().split(/[^\p{L}\p{N}']+/u)).filter(Boolean));
  const out = new Set<string>();
  const re = /\p{Lu}\p{Ll}{2,}/gu;
  for (const m of text.matchAll(re)) {
    const before = text.slice(0, m.index).trimEnd();
    const prev = before.slice(-1);
    // Sentence starts are ambiguous ("Later, …"); only mid-sentence capitals count.
    if (!before || /[.!?"“”*…(\-—:\n]/.test(prev)) continue;
    const w = m[0].toLowerCase();
    if (COMMON_CAPS.has(w) || knownWords.has(w)) continue;
    out.add(m[0]);
  }
  return [...out];
}

/**
 * Possible new names in a reply, for a classifier to pick from (it can't write a
 * name, but it can say which of these is one). Runs of capitalised words —
 * "Captain Rhea Vos", "Rusty Anchor" — that aren't common words or anyone or
 * anything the game already knows. Sentence starts count too; the classifier
 * filters. Most frequent first.
 */
export function nameCandidates(text: string, known: string[], max = 8): string[] {
  const knownWords = new Set(known.flatMap((n) => n.toLowerCase().split(/[^\p{L}\p{N}']+/u)).filter(Boolean));
  const count = new Map<string, { n: number; at: number; mid: boolean }>();
  const re = /\p{Lu}[\p{Ll}'’-]+(?:[ \t]+\p{Lu}[\p{Ll}'’-]+){0,3}/gu;
  const add = (raw: string[], at: number, starts: boolean) => {
    // Drop words that aren't name-like ("Then Rhea" → "Rhea").
    const words = raw.filter((w) => !COMMON_CAPS.has(w.toLowerCase()));
    while (words.length && knownWords.has(words[0].toLowerCase())) words.shift();
    const name = words.join(" ");
    if (!name || name.length < 3 || words.every((w) => knownWords.has(w.toLowerCase()))) return;
    const c = count.get(name);
    if (c) { c.n++; c.mid ||= !starts; } else count.set(name, { n: 1, at, mid: !starts });
  };
  for (const m of text.matchAll(re)) {
    const before = text.slice(0, m.index).trimEnd();
    let starts = !before || /[.!?"“”*…:\n]$/.test(before);
    // A possessive ends a name ("Name's Rhea" is "Name" and "Rhea").
    let run: string[] = [];
    for (const w of m[0].split(/[ \t]+/)) {
      const poss = /['’]s$/.test(w);
      run.push(w.replace(/['’]s$/, ""));
      if (poss) { add(run, m.index ?? 0, starts); run = []; starts = false; }
    }
    if (run.length) add(run, m.index ?? 0, starts);
  }
  // Lone words that only ever start a sentence ("Later", "Marcus,") come last: often not names, but sometimes are.
  const weak = ([n, c]: [string, { n: number; mid: boolean }]) => (n.includes(" ") || c.mid || c.n >= 2 ? 0 : 1);
  return [...count.entries()].sort((a, b) => weak(a) - weak(b) || b[1].n - a[1].n || a[1].at - b[1].at).slice(0, max).map(([n]) => n);
}

export { mentions };

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
  /** An encounter the latest exchange is breaking into (and who the opponent is, when it's someone present). */
  encounter?: { id: string; foe?: string; fresh?: boolean };
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
  // Actions, items, travel, quests, and improv remain candidates during work,
  // while dialogue and thoughts are classified as NONE.
  const actions = playerText
    ? [
        ...availableChoices(r, s, settings.lines),
        ...usableItems(r, s).filter((u) => !u.locked).map((u) => ({ id: u.id, a: u.a, label: u.a.label })),
      ]
    : [];
  // Saying yes to someone's request, or telling them it's done, takes or hands in the quest.
  const questMoves: Record<string, string> = {};
  if (playerText) {
    // Only what someone here is asking: notices on a board are taken by clicking them.
    for (const o of questOffers(r, s).filter((x) => x.via === "giver")) {
      const q = r.quests[o.id];
      questMoves[`${QUEST_PREFIX}take:${o.id}`] = `Agree to take on "${q.name}"${o.from ? ` for ${o.from}` : ""}${q.desc ? ` — ${q.desc}` : ""}`;
    }
    for (const x of questsToReport(r, s)) questMoves[`${QUEST_PREFIX}report:${x.id}`] = `Tell ${x.to ?? "them"} that "${questDef(r, s, x.id)?.name ?? x.id}" is done`;
  }
  // Anything risky the list doesn't cover is still an attempt: it rolls on the closest ability.
  const improv = !!playerText && r.improvise.enabled;
  const approach = improv ? improvStats(r) : [];

  if (playerText && (actions.length || improv || Object.keys(questMoves).length)) {
    const criteria: Record<string, string> = {
      [NONE]: "None of these: dialogue, thoughts, feelings, plans, questions, or something trivial that can't fail",
    };
    for (const c of actions) criteria[c.id] = `${c.label}${c.a.desc ? ` — ${c.a.desc}` : ""}`;
    Object.assign(criteria, questMoves);
    if (improv) criteria[ATTEMPT] = "Something else with a real chance of failing that matters to the story, not listed above (sneaking, persuading, lying, fighting, climbing, stealing, resisting, performing…)";
    q.action = { type: "choice", instructions: `Which of these does ${player}'s latest message actually attempt right now?`, criteria };
    if (improv || actions.some((c) => c.a.params.length)) {
      q.difficulty = { type: "score", instructions: `How hard is what ${player} is attempting, given the scene?`, criteria: DIFFICULTY };
    }
    if (approach.length > 1) {
      q.approach = {
        type: "choice",
        instructions: `If ${player} is attempting something that could fail, which of ${player}'s abilities matters most for it?`,
        criteria: Object.fromEntries(approach.map((id) => [id, `${r.stats[id].label}${r.stats[id].desc ? ` — ${r.stats[id].desc}` : ""}`])),
      };
    }
  }
  // Fights (and other encounters) can break out of the story itself.
  const storyEnc = !s.encounter ? Object.values(r.encounters).filter((x) => x.fromStory) : [];
  const here = storyEnc.length ? presentPeople(r, s, makeEnv(r, s)) : [];
  if (storyEnc.length) {
    q.encounter = {
      type: "choice",
      instructions: `Is one of these actually breaking out right now, in the latest exchange (not just threatened, feared or talked about)?`,
      criteria: { [NONE]: "No — nothing like this is starting right now", ...Object.fromEntries(storyEnc.map((x) => [`enc:${x.id}`, `${x.name}${x.desc ? ` — ${x.desc}` : ""}`])) },
    };
    // One just ended: the prose often goes on describing it. Only a genuinely new incident starts another.
    const last = s.lastEncounter;
    if (last && s.minutes - last.at < 24 * 60) {
      q.encounter_fresh = {
        type: "noul",
        instructions: `${r.encounters[last.id]?.name ?? "An encounter"} just ended (${last.outcome.replace(/_/g, " ")}). If something is breaking out now, is it a genuinely NEW incident — not the same one still being described, its aftermath, or a memory of it?`,
      };
    }
    if (here.length) {
      q.opponent = {
        type: "choice",
        instructions: `If a confrontation is starting, who is ${player} up against?`,
        criteria: { other: "Someone else, or no one in particular", ...Object.fromEntries(here.map((id) => [`p:${id}`, personName(r, s, id)])) },
      };
    }
  }
  for (const t of r.triggers) {
    if (t.whenScene) q[`scene:${t.id}`] = { type: "noul", instructions: fill(t.whenScene, player) };
  }

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

  const out: Reading = { intent: null, suggestion: null, confidence: 0, scene };
  const enc = ans.encounter;
  if (enc?.type === "choice" && enc.choice.startsWith("enc:") && (enc.probabilities[enc.choice] ?? enc.confidence) >= ENCOUNTER_SURE) {
    const id = enc.choice.slice(4);
    if (storyEnc.some((x) => x.id === id)) {
      const opp = ans.opponent;
      const who = opp?.type === "choice" && opp.choice.startsWith("p:") && opp.confidence >= 0.5 ? opp.choice.slice(2) : null;
      const fresh = ans.encounter_fresh;
      out.encounter = { id, ...(who && here.includes(who) ? { foe: personName(r, s, who) } : {}), ...(fresh?.type === "noul" && fresh.noul >= 0.7 ? { fresh: true } : {}) };
    }
  }
  const act = ans.action;
  if (act?.type !== "choice" || act.choice === NONE) return out;
  const id = act.choice;
  const conf = act.probabilities[id] ?? act.confidence;
  out.confidence = conf;

  let intent: Intent | null = null;
  let label = id;
  if (id === ATTEMPT) {
    if (!improv) return out;
    const ap = ans.approach;
    const stat = approach.length === 1 ? approach[0] : ap?.type === "choice" && approach.includes(ap.choice) ? ap.choice : approach[0] ?? "";
    const level = ans.difficulty?.type === "score" ? ans.difficulty.score : 1;
    const difficulty = DIFFICULTIES[Math.max(0, Math.min(DIFFICULTIES.length - 1, Math.round(level)))];
    intent = { actionId: `${IMPROV}${stat}`, via: "adjudicator", params: { difficulty } };
    label = `${stat ? r.stats[stat].label : "Luck"} check (${difficulty})`;
  } else if (id.startsWith(QUEST_PREFIX)) {
    if (!questMoves[id]) return out;
    intent = { actionId: id, via: "adjudicator" };
    label = questMoves[id];
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
  /** Open-ended things a writing model should fill in (names, new quests, what someone will remember). */
  needsWriting: Set<"people" | "items" | "move" | "quests" | "memories">;
}

export async function bookkeeping(opts: {
  decider: Decider; r: Ruleset; s: GameState; playerText: string; reply: string; player: string;
  /** The turn's outcome the rules already applied (not to be counted again). */
  applied?: string | null;
  /** Track favours people ask for in the story as quests. */
  storyQuests?: boolean;
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
  // Who's in the scene: everyone here, anyone the reply mentions, and whoever was with {{user}} before a move.
  const hereBefore = presentPeople(r, s, makeEnv(r, s));
  const leftBehind = Object.entries(s.scene).filter(([id, v]) => v.here && s.people[id] && v.loc !== s.location && v.loc === s.lastLocation).map(([id]) => id);
  const cast = [...new Set([...hereBefore, ...mentioned, ...leftBehind])].slice(0, 12);
  for (const pid of cast) {
    q[`here:${pid}`] = { type: "noul", instructions: `At the end of the reply, ${personName(r, s, pid)} is physically in the scene with ${player} (in the same place — not just mentioned, remembered, on the phone, or left behind)` };
  }
  // What happened to the things {{user}} has that the reply mentions.
  let itemQs = 0;
  for (const [id, n] of Object.entries(s.items)) {
    if (itemQs >= 8) break;
    const name = itemName(r, s, id);
    if (!mentions(opts.reply, name)) continue;
    const def = r.items[id];
    const per = def?.uses ?? 0;
    const criteria: Record<string, string> = {
      same: "Nothing happened to it — only mentioned, carried or held as before",
      used: def?.use
        ? `${player} used it as meant (${def.use.label})${per > 0 ? ` — once; it has ${s.uses[id] ?? per} of ${per} uses left` : def.keep ? "" : " — and it's used up"}`
        : per > 0 ? `Used once (it has ${s.uses[id] ?? per} of ${per} uses left)` : "Used, but not used up — it's still there afterwards",
      gone: def?.use
        ? `Not used — but broken, given away, dropped, lost or taken: ${player} has one fewer${n > 1 ? ` (has ${n} now)` : ""}`
        : `Used up, eaten, drunk, emptied, broken, given away, dropped, lost or taken — ${player} has one fewer${n > 1 ? ` (has ${n} now)` : ""}`,
    };
    q[`item:${id}`] = { type: "choice", instructions: `What happened to ${player}'s ${name} during the reply?`, criteria };
    itemQs++;
  }
  // Practice the story describes makes skills grow too.
  const growable = r.growth.enabled && r.growth.train ? r.statOrder.filter((id) => (r.stats[id].kind === "skill" || r.stats[id].kind === "attribute") && r.stats[id].growth > 0) : [];
  if (growable.length) {
    q.train = {
      type: "choice",
      instructions: `During the reply, did ${player} spend real effort practising, training, studying or rehearsing one of these?`,
      criteria: { [NONE]: "No", ...Object.fromEntries(growable.map((id) => [id, `${r.stats[id].label}${r.stats[id].desc ? ` — ${r.stats[id].desc}` : ""}`])) },
    };
  }
  // Fights the prose starts, or finishes.
  const storyEnc = !s.encounter ? Object.values(r.encounters).filter((x) => x.fromStory) : [];
  if (storyEnc.length) {
    q.encounter = {
      type: "choice",
      instructions: `At the end of the reply, has one of these actually broken out (not just threatened)?`,
      criteria: { [NONE]: "No", ...Object.fromEntries(storyEnc.map((x) => [`enc:${x.id}`, `${x.name}${x.desc ? ` — ${x.desc}` : ""}`])) },
    };
    const last = s.lastEncounter;
    if (last && s.minutes - last.at < 24 * 60) {
      q.encounter_fresh = {
        type: "noul",
        instructions: `${r.encounters[last.id]?.name ?? "An encounter"} just ended (${last.outcome.replace(/_/g, " ")}). If one broke out in this reply, is it a genuinely NEW incident — not the same one still being described, its aftermath, or a memory of it?`,
      };
    }
    const people = [...new Set([...hereBefore, ...mentioned])];
    if (people.length) q.opponent = { type: "choice", instructions: `If a confrontation broke out, who is ${player} up against?`, criteria: { other: "Someone else, or no one in particular", ...Object.fromEntries(people.map((id) => [`p:${id}`, personName(r, s, id)])) } };
  } else if (s.encounter) {
    const def = r.encounters[s.encounter.id];
    const outcomes = [...new Set([...Object.keys(def?.outcomes ?? {}), ...(def?.momentum ? [def.momentum.win, def.momentum.lose] : [])])];
    q.encounter_end = {
      type: "choice",
      instructions: `Is ${def?.name ?? "the encounter"} over by the end of the reply?`,
      criteria: {
        ongoing: "No — it's still going",
        ...Object.fromEntries(outcomes.map((o) => [`end:${o}`, `Yes — it ended: ${o.replace(/_/g, " ")}`])),
        "end:broke_off": "Yes — it stopped some other way (broken off, interrupted, talked down, escaped)",
      },
    };
  }
  // Quests the story decides: did the reply finish or fail them?
  const judged = judgedQuests(r, s);
  for (const j of judged) {
    q[`quest:${j.id}`] = {
      type: "choice",
      instructions: `Where does ${player}'s quest "${j.name}" stand at the end of the reply?`,
      criteria: { ongoing: "Still under way, or the reply doesn't say", done: `Done: ${fill(j.done, player)}`, failed: j.fail ? `Failed: ${fill(j.fail, player)}` : "Failed, abandoned or made impossible" },
    };
  }
  const storyQuests = opts.storyQuests !== false && r.storyQuests.enabled;
  if (storyQuests) q["gate:quests"] = { type: "noul", instructions: `During the reply, someone asked ${player} to do a specific task or favour for them (or ${player} promised one) that ${player} agreed to and that isn't already one of ${player}'s quests` };
  if (Object.keys(s.people).length) q["gate:memories"] = { type: "noul", instructions: `During the reply, something happened between ${player} and someone there that they'll remember for a long time: a real kindness, a betrayal, a promise made or broken, a humiliation, a first` };
  if (r.peopleOpen) q["gate:people"] = { type: "noul", instructions: "The reply introduces a named character who wasn't in the game state before" };
  // New names, picked rather than written: each candidate is asked about (as a person, and as where
  // {{user}} ends up), with first feelings asked up front so no second call is needed.
  const knownNames = [player, ...Object.values(s.people).map((x) => x.name), ...Object.keys(s.items).map((id) => itemName(r, s, id)), ...Object.values(r.locations).map((l) => l.name), ...(s.locationName ? [s.locationName] : [])];
  const cands = (r.peopleOpen || r.locationsOpen) ? nameCandidates(opts.reply, knownNames, 10) : [];
  if (r.peopleOpen) cands.forEach((name, i) => {
    q[`newp:${i}`] = { type: "noul", instructions: `"${name}" is the name of a person or creature who is in the scene in the reply — they speak, act or are spoken to there and then. Not someone only remembered, mentioned or talked about; not ${player}; not a place, a thing, a title, a group, or an ordinary word.` };
    q[`newhere:${i}`] = { type: "noul", instructions: `At the end of the reply, ${name} is physically in the scene with ${player} (not just mentioned or remembered)` };
    for (const rs of r.relStatOrder) {
      const d = r.relStats[rs];
      if (d.narrator > 0) q[`newfeel:${i}:${rs}`] = { type: "score", instructions: `Right now, how does ${name} feel toward ${player} — ${d.label}?`, criteria: feelLevels(d).map((l) => l.text) };
    }
  });
  if (r.locationsOpen) {
    q.place = {
      type: "choice",
      instructions: `Where is ${player} at the end of the reply?`,
      criteria: {
        stay: `Still at ${s.locationName ?? "the same place"}`,
        ...Object.fromEntries(Object.values(r.locations).filter((l) => l.id !== s.location).map((l) => [`loc:${l.id}`, l.name])),
        ...Object.fromEntries(cands.map((n, i) => [`cand:${i}`, `A place called ${n}`])),
        elsewhere: "Somewhere else, not named in this list",
      },
    };
  }
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
  for (const pid of cast) {
    const a = ans[`here:${pid}`];
    if (a?.type !== "noul") continue;
    if (a.noul >= 0.6) (p.scene ??= {})[pid] = true;
    else if (a.noul <= 0.3) (p.scene ??= {})[pid] = false;
  }
  for (const [key, a] of Object.entries(ans)) {
    if (!key.startsWith("item:") || !confident(a) || a.choice === "same") continue;
    const id = key.slice(5);
    const def = r.items[id];
    if (a.choice === "used" && ((def?.uses ?? 0) > 0 || def?.use)) {
      (p.used ??= {})[id] = 1;
      // An item without charges that does something is spent by using it (tools keep).
      if (def?.use && !def.keep && !(def.uses > 0)) (p.items ??= {})[id] = -1;
    }
    else if (a.choice === "gone") (p.items ??= {})[id] = -1;
  }
  if (confident(ans.train) && ans.train.choice !== NONE && growable.includes(ans.train.choice)) p.train = [ans.train.choice];
  const enc = ans.encounter;
  if (enc?.type === "choice" && enc.choice.startsWith("enc:") && (enc.probabilities[enc.choice] ?? enc.confidence) >= ENCOUNTER_SURE) {
    p.encounter = enc.choice.slice(4);
    const fresh = ans.encounter_fresh;
    if (fresh?.type === "noul" && fresh.noul >= 0.7) p.encounterFresh = true;
    const opp = ans.opponent;
    if (opp?.type === "choice" && opp.choice.startsWith("p:") && opp.confidence >= 0.5) p.foe = personName(r, s, opp.choice.slice(2));
  }
  const over = ans.encounter_end;
  if (over?.type === "choice" && over.choice.startsWith("end:") && (over.probabilities[over.choice] ?? over.confidence) >= ENCOUNTER_OVER) p.encounterEnd = over.choice.slice(4);
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
  for (const j of judged) {
    const a = ans[`quest:${j.id}`];
    if (a?.type !== "choice" || a.choice === "ongoing" || (a.probabilities[a.choice] ?? a.confidence) < 0.6) continue;
    ((p.quests ??= {})[a.choice === "done" ? "done" : "failed"] ??= []).push(j.id);
  }
  const needsWriting = new Set<"people" | "items" | "move" | "quests" | "memories">();
  if (ans["gate:quests"]?.type === "noul" && (ans["gate:quests"] as { noul: number }).noul >= 0.65) needsWriting.add("quests");
  if (ans["gate:memories"]?.type === "noul" && (ans["gate:memories"] as { noul: number }).noul >= 0.7) needsWriting.add("memories");
  // A name nobody knows in the middle of a sentence makes "someone new?" easier to say yes to.
  const known = [player, ...Object.values(s.people).map((x) => x.name), ...Object.values(r.locations).map((l) => l.name), s.locationName ?? "", ...Object.keys(s.items).map((id) => itemName(r, s, id))];
  const peopleBar = newNames(opts.reply, known).length ? 0.35 : 0.6;
  // New people the classifier picked from the candidates: no writing needed.
  const picked: string[] = [];
  // "Captain Rhea Vos" and "Rhea" are one person: keep the fuller name.
  const isPerson = (i: number) => { const a = ans[`newp:${i}`]; return a?.type === "noul" && a.noul >= 0.7; };
  const within = (a: string, b: string) => a !== b && ` ${b} `.includes(` ${a} `);
  cands.forEach((name, i) => {
    if (!isPerson(i) || cands.some((other, j) => isPerson(j) && within(name, other))) return;
    picked.push(name);
    const feelings: Record<string, number> = {};
    for (const rs of r.relStatOrder) {
      const f = ans[`newfeel:${i}:${rs}`];
      if (f?.type !== "score" || f.confidence < 0.3) continue;
      const levels = feelLevels(r.relStats[rs]);
      feelings[rs] = levels[Math.max(0, Math.min(levels.length - 1, Math.round(f.score)))].value;
    }
    (p.people ??= []).push({ name, ...(Object.keys(feelings).length ? { feelings } : {}) });
    const here = ans[`newhere:${i}`];
    if (here?.type === "noul" && here.noul >= 0.5) (p.scene ??= {})[name] = true;
  });
  // Where {{user}} went, when places are open: a known place or a named candidate is picked; only "somewhere unnamed" needs writing.
  const place = ans.place;
  let placeOpen = false;
  if (confident(place) && place.choice !== "stay") {
    if (place.choice.startsWith("loc:")) p.move = place.choice.slice(4);
    else if (place.choice.startsWith("cand:")) p.move = cands[Number(place.choice.slice(5))];
    else placeOpen = true;
  }
  for (const g of ["people", "items", "move"] as const) {
    const a = ans[`gate:${g}`];
    if (a?.type !== "noul" || a.noul < (g === "people" ? peopleBar : 0.6)) continue;
    // The classifier already judged every name in the reply, one by one; that beats its general
    // "someone new?" (which also says yes for unnamed crowds and people only remembered).
    if (g === "people" && cands.length) continue;
    if (g === "move" && (p.move || (confident(place) && !placeOpen))) continue;
    needsWriting.add(g);
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
