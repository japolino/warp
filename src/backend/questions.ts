// Every typed question Warp asks, as pure builders and interpreters (JEV-ROUTING.md §3–§4).
// The same questions go to Jev and to the helper LLM; only the provider differs.
//
//   R  the typed message (before the reply)      readQuestions / readVerdict / contestReadVerdict
//   D  odds for `decide:` blocks (Jev only)       decideQuestions / oddsFromAnswers
//   A  bookkeeping (after the reply)              bookkeepingQuestions / bookkeepingFromAnswers
//   B  difficulty of each written choice (Jev)    choiceQuestions / choiceDifficulty / textChecks
//   G  the greeting (once per greeting swipe)     greetingQuestions / greetingFromAnswers
//
// Rules: the first option of every choice is the safe default (Jev leans to the first option, and a helper may
// leave a question out to mean it); one judgment per question; no numbers from Jev (score levels map to fixed
// buckets, never interpolated); text that needs writing becomes a TextTask for the helper.

import type { Answer, Answers, Question, Questions } from "../engine/decide.js";
import { noulConfidence } from "../engine/decide.js";
import { mentions } from "../engine/mention.js";
import { availableChoices, findPerson, usableItems, type Intent, type LiveChoice, type Proposal } from "../engine/resolve.js";
import { DIFFICULTIES, type ActionDef, type DecideSpec, type Difficulty, type Ruleset, type StatDef } from "../engine/ruleset.js";
import { itemName, makeEnv, personName, type GameState } from "../engine/state.js";
import { presentPeople } from "../engine/world.js";
import { stateDigest } from "../engine/view.js";
import { adultGated } from "../engine/adults.js";
import { BREAK_OFF, contestMoveId, GIVE_IN } from "../engine/contest.js";
import type { GreetingRead } from "../engine/scene.js";

export type Provider = "jev" | "llm";

// ───────────────────────── thresholds ─────────────────────────

/** Where answers become actions. One table, a column per provider: Jev's probabilities are calibrated, the helper's are self-reported. */
export interface Thresholds {
  /** A typed message's action (choice probability) before it is acted on. */
  act: number;
  /** risky and contested (yes/no) for an improvised attempt. */
  risky: number;
  contested: number;
  /** A contest breaking out. */
  contest: number;
  /** A big moment between {{user}} and someone. */
  moment: number;
  /** Someone is here (in) / has left (out). */
  here: number;
  gone: number;
  /** A look or outfit changed, so a new line is written. */
  flagText: number;
  /** A name in the reply is a person. */
  newPerson: number;
  /** An unnamed newcomer, a new item, a move somewhere else. */
  gate: number;
  /** A new goal the story makes. */
  gateGoal: number;
  /** A goal closes. */
  goalClose: number;
  /** A choice answer is trusted (bookkeeping steps). */
  choice: number;
  /** A yes/no about a condition, a flag or a scene trigger is trusted (distance from 50/50). */
  noulSure: number;
}

export const THRESHOLDS: Record<Provider, Thresholds> = {
  jev: { act: 0.75, risky: 0.6, contested: 0.5, contest: 0.6, moment: 0.7, here: 0.6, gone: 0.3, flagText: 0.7, newPerson: 0.7, gate: 0.6, gateGoal: 0.65, goalClose: 0.6, choice: 0.5, noulSure: 0.4 },
  // The helper states its own confidence; a missing one reads as 0.6. Tune this column in the simulator.
  llm: { act: 0.75, risky: 0.6, contested: 0.5, contest: 0.6, moment: 0.7, here: 0.6, gone: 0.3, flagText: 0.6, newPerson: 0.7, gate: 0.6, gateGoal: 0.6, goalClose: 0.6, choice: 0.5, noulSure: 0.4 },
};

// ───────────────────────── small helpers ─────────────────────────

const NONE = "none";
const ATTEMPT = "attempt";

function clip(s: string, n: number) {
  return s.length > n ? `…${s.slice(-n)}` : s;
}

function fill(text: string, player: string) {
  return text.replace(/\{\{user\}\}/gi, player);
}

const choiceP = (a: Answer | undefined): number => (a?.type === "choice" ? a.probabilities[a.choice] ?? a.confidence : 0);
const noulP = (a: Answer | undefined): number | null => (a?.type === "noul" ? a.noul : null);
function sure(a: Answer | undefined, t: Thresholds): a is Extract<Answer, { type: "choice" }> {
  return a?.type === "choice" && a.confidence >= t.choice;
}

/** A stat or person label with its description, for criteria. */
const described = (label: string, desc?: string) => `${label}${desc ? ` (${desc})` : ""}`;

// ───────────────────────── quoted dialogue (no model) ─────────────────────────

const QUOTES: [string, string][] = [['"', '"'], ["“", "”"], ["„", "“"], ["„", "”"], ["«", "»"], ["「", "」"], ["『", "』"]];
const OOC = [/\(\([\s\S]*?\)\)/g, /\[\s*ooc\s*:[\s\S]*?\]/gi, /\(\s*ooc\s*:[\s\S]*?\)/gi];

/**
 * Split a typed message into what {{user}} does and what they say. Quoted spans ("…", “…”, „…“, «…», 「…」, 『…』)
 * and out-of-character parts ((…)) / [OOC: …] are removed; apostrophes are not quotes; *actions* stay in `action`.
 * An unclosed quote runs to the end of its line.
 */
export function splitTyped(text: string): { action: string; said: string[] } {
  let rest = String(text ?? "");
  for (const re of OOC) rest = rest.replace(re, " ");
  const said: string[] = [];
  for (const [open, close] of QUOTES) {
    const re = new RegExp(`${esc(open)}([^${esc(close)}${open === close ? "" : esc(open)}\\n]*)${esc(close)}`, "g");
    rest = rest.replace(re, (_m, inner: string) => { if (inner.trim()) said.push(inner.trim()); return " "; });
  }
  // Unclosed openers: the rest of the line is speech.
  rest = rest.replace(/["“„«「『]([^\n]*)/g, (_m, inner: string) => { if (inner.trim()) said.push(inner.trim()); return " "; });
  const action = rest.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  return { action: /[\p{L}\p{N}]/u.test(action) ? action : "", said };
}

function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const STOP = new Set(("a an the and or but so then to of in on at by for with from into onto over under up down out off away back "
  + "i me my mine myself you your he him his she her hers they them their we us our it its this that these those there here "
  + "is am are was were be been being do does did have has had will would can could should just still again very really quite "
  + "as if while when where what who how not no yes oh ah um uh well too also some any all both each little bit").split(" "));
const SPEECH = new Set(("say says said saying ask asks asked asking reply replies replied answer answers answered whisper whispers whispered "
  + "mutter mutters muttered murmur murmurs murmured shout shouts shouted yell yells yelled call calls called add adds added "
  + "continue continues continued tell tells told explain explains explained respond responds responded begin begins began "
  + "softly quietly loudly finally again then").split(" "));
/** Everyday acts that cannot fail (helper prefilter only). */
const EVERYDAY = new Set(("look looks looking glance glances stare stares watch watches listen listens smile smiles smiling grin grins nod nods "
  + "shrug shrugs sit sits sitting stand stands lean leans sigh sighs laugh laughs chuckle chuckles giggle giggles blush blushes "
  + "wait waits pause pauses think thinks wonder wonders frown frowns wave waves breathe breathes relax relaxes rest rests "
  + "walk walks follow follows turn turns hum hums yawn yawns stretch stretches drink sip sips eat eats smirk smirks wink winks "
  + "hug hugs hold holds take takes put puts open opens close closes reach reaches set sets head eyes hand hands face seat chair table").split(" "));
/**
 * Verbs that often make a move risky even in a short message ("I punch him"). Without Jev, only a message with one
 * of these is read (the read is a second helper call before the reply); everything else is plain roleplay.
 */
const RISKY = new Set(("punch punches hit hits kick kicks stab stabs lunge lunges shoot shoots slap slaps attack attacks fight fights tackle tackles shove shoves push pushes "
  + "grab grabs snatch snatches steal steals rob robs pickpocket lift sneak sneaks hide hides climb climbs jump jumps leap leaps vault vaults "
  + "run runs sprint sprints flee flees dodge dodges duck ducks evade evades swerve swerves escape escapes chase chases pursue pursues tail tails "
  + "lie lies bluff bluffs trick tricks deceive deceives con cheat cheats persuade persuades convince convinces haggle haggles bargain bargains negotiate "
  + "threaten threatens intimidate intimidates interrogate interrogates bribe bribes seduce seduces force forces break breaks smash smashes pry pries "
  + "pick picks lockpick hack hacks disarm disarms defuse defuses sabotage sabotages search searches spy spies eavesdrop eavesdrops infiltrate infiltrates "
  + "wrestle wrestles grapple grapples strangle strangles choke chokes trip trips aim aims fire fires swing swings slash slashes throw throws "
  + "cast casts resist resists swim swims dive dives try tries attempt attempts").split(" "));

/** Everyday phrases that contain a risky verb ("pick up", "force a smile"). */
const EVERYDAY_PHRASES = /\b(?:pick(?:s|ed)? (?:it |them |him |her )?up|cast(?:s)? a (?:glance|look)|force(?:s)? a (?:smile|laugh)|hide(?:s)? (?:a |my |his |her )?(?:smile|grin|blush)|run(?:s)? (?:my|his|her|a) (?:hand|hands|fingers?)|break(?:s)? the (?:silence|ice))\b/gi;

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^\p{L}\p{N}' -]+/gu, " ").split(/\s+/).map((w) => w.replace(/^'+|'+$/g, "")).filter(Boolean);
}

/** Only speech tags are left ("I say", "she asks quietly", "Sam replies"): nothing was done. */
export function onlySpeechTags(action: string): boolean {
  const raw = action.replace(/[*_~]/g, " ").split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  let names = 0;
  for (const w of raw) {
    const l = w.toLowerCase();
    if (STOP.has(l) || SPEECH.has(l) || /ly$/.test(l)) continue;
    if (/^\p{Lu}/u.test(w) && names < 2) { names++; continue; }
    return false;
  }
  return true;
}

/** Does any rule give a typed read something to find (an attempt, or a listed action or item with a check)? */
export function readable(r: Ruleset): boolean {
  if (r.style === "story") return false;
  if (r.checks.typed) return true;
  return Object.values(r.actions).some((a) => !!a.check) || Object.values(r.items).some((i) => !!i.use?.check);
}

/**
 * Should the typed read run at all? Never for a story, for quoted dialogue only, for speech tags only, or for a
 * bare emote around dialogue. Helper only (it costs a second helper call before the reply): only when a risky verb
 * is in the message, so an ordinary turn keeps to one helper call. Jev is cheap, so it gets everything else.
 */
export function needsRead(r: Ruleset, split: { action: string }, provider: Provider): boolean {
  if (!readable(r)) return false;
  const action = split.action.trim();
  if (!action || onlySpeechTags(action)) return false;
  const ws = words(action);
  const risky = words(action.replace(EVERYDAY_PHRASES, " ")).some((w) => RISKY.has(w));
  const content = ws.filter((w) => !STOP.has(w) && !/ly$/.test(w));
  const everyday = content.every((w) => EVERYDAY.has(w) || SPEECH.has(w));
  // A bare emote around the dialogue ("*smiles* "Hi."", "I nod.") is part of the talk, for both providers.
  if (!risky && content.length <= 2 && everyday) return false;
  return provider === "jev" || risky;
}

// ───────────────────────── difficulty (shared) ─────────────────────────

/** Four self-contained levels (each is judged alone), the same for typed attempts and every written choice. */
export const DIFFICULTY_LEVELS = [
  "Easy: an ordinary person here almost always manages it",
  "Fair: an ordinary person here manages it about half the time",
  "Hard: most people here would fail; it takes skill or luck",
  "Extreme: only an exceptional person could pull it off here",
];

/** The rounded level as a word (never interpolated), or null without a score answer. */
export function difficultyOf(a: Answer | undefined): Difficulty | null {
  if (a?.type !== "score" || !Number.isFinite(a.score)) return null;
  return DIFFICULTIES[Math.max(0, Math.min(DIFFICULTIES.length - 1, Math.round(a.score)))];
}

const difficultyQ = (instructions: string): Question => ({ type: "score", instructions, criteria: DIFFICULTY_LEVELS });
const threatQ = (player: string): Question => difficultyQ(`If a contest starts, how dangerous is the opponent for ${player}?`);

// ───────────────────────── names in a text ─────────────────────────

const COMMON_CAPS = new Set([
  "the", "a", "an", "he", "she", "they", "it", "his", "her", "their", "i", "you", "we", "but", "and", "or", "so", "then",
  "when", "as", "if", "in", "on", "at", "with", "for", "from", "to", "of", "by", "that", "this", "there", "here", "what",
  "who", "why", "how", "yes", "no", "not", "oh", "ah", "maybe", "still", "just", "even", "now", "after", "before", "once",
  "every", "each", "some", "all", "something", "someone", "nothing", "god", "mr", "mrs", "ms", "miss", "sir", "lady", "lord",
]);

/** Capitalised words mid-sentence that nobody knows: a likely new name (a hint only). */
export function newNames(text: string, known: string[]): string[] {
  const knownWords = new Set(known.flatMap((n) => n.toLowerCase().split(/[^\p{L}\p{N}']+/u)).filter(Boolean));
  const out = new Set<string>();
  for (const m of text.matchAll(/\p{Lu}\p{Ll}{2,}/gu)) {
    const before = text.slice(0, m.index).trimEnd();
    if (!before || /[.!?"“”*…(\-—:\n]/.test(before.slice(-1))) continue;
    const w = m[0].toLowerCase();
    if (COMMON_CAPS.has(w) || knownWords.has(w)) continue;
    out.add(m[0]);
  }
  return [...out];
}

/**
 * Possible new names in a text, for a classifier to pick from (it can't write a name, but it can say which of
 * these is one): runs of capitalised words that aren't common words or anything the game knows. Most frequent first.
 */
export function nameCandidates(text: string, known: string[], max = 8): string[] {
  const knownWords = new Set(known.flatMap((n) => n.toLowerCase().split(/[^\p{L}\p{N}']+/u)).filter(Boolean));
  const count = new Map<string, { n: number; at: number; mid: boolean }>();
  const add = (raw: string[], at: number, starts: boolean) => {
    const ws = raw.filter((w) => !COMMON_CAPS.has(w.toLowerCase()));
    while (ws.length && knownWords.has(ws[0].toLowerCase())) ws.shift();
    const name = ws.join(" ");
    if (!name || name.length < 3 || ws.every((w) => knownWords.has(w.toLowerCase()))) return;
    const c = count.get(name);
    if (c) { c.n++; c.mid ||= !starts; } else count.set(name, { n: 1, at, mid: !starts });
  };
  for (const m of text.matchAll(/\p{Lu}[\p{Ll}'’-]+(?:[ \t]+\p{Lu}[\p{Ll}'’-]+){0,3}/gu)) {
    const before = text.slice(0, m.index).trimEnd();
    let starts = !before || /[.!?"“”*…:\n]$/.test(before);
    let run: string[] = [];
    for (const w of m[0].split(/[ \t]+/)) {
      const poss = /['’]s$/.test(w);
      run.push(w.replace(/['’]s$/, ""));
      if (poss) { add(run, m.index ?? 0, starts); run = []; starts = false; }
    }
    if (run.length) add(run, m.index ?? 0, starts);
  }
  const weak = ([n, c]: [string, { n: number; mid: boolean }]) => (n.includes(" ") || c.mid || c.n >= 2 ? 0 : 1);
  return [...count.entries()].sort((a, b) => weak(a) - weak(b) || b[1].n - a[1].n || a[1].at - b[1].at).slice(0, max).map(([n]) => n);
}

export { mentions };

const knownNames = (r: Ruleset, s: GameState, player: string) => [
  player, ...Object.values(s.people).map((x) => x.name), ...Object.keys(s.items).map((id) => itemName(r, s, id)),
  ...(s.locationName ? [s.locationName] : []),
];

// ───────────────────────── contests ─────────────────────────

/** Can a contest start now (adventure, kinds declared, none running, the story may start one)? */
export function contestCanStart(r: Ruleset, s: GameState): boolean {
  return r.style === "adventure" && !s.contest && r.conflict.fromStory && Object.keys(r.conflict.kinds).length > 0;
}

function contestQuestions(r: Ruleset, s: GameState, q: Questions, people: string[], cands: string[], player: string, when: "now" | "reply") {
  q.contest = {
    type: "choice",
    instructions: when === "now"
      ? `Does \`player_action\` start one of these right now (not just threatened or talked about)?`
      : `At the end of \`narrator_reply\`, has one of these actually broken out between ${player} and someone (not just threatened)?`,
    criteria: { [NONE]: "No: nothing like this is starting", ...Object.fromEntries(Object.values(r.conflict.kinds).map((k) => [k.id, k.label])) },
  };
  if (people.length || cands.length) q.opponent = {
    type: "choice",
    instructions: `If a contest starts, who is ${player} up against?`,
    criteria: {
      other: "Someone else, or no one in particular",
      ...Object.fromEntries(people.map((id) => [`p:${id}`, personName(r, s, id)])),
      ...Object.fromEntries(cands.map((n, i) => [`cand:${i}`, n])),
    },
  };
  q.threat = threatQ(player);
}

function contestFrom(r: Ruleset, s: GameState, ans: Answers, cands: string[], t: Thresholds): { kind: string; opponent: string | null; threat: Difficulty } | null {
  const c = ans.contest;
  if (c?.type !== "choice" || c.choice === NONE || !r.conflict.kinds[c.choice] || choiceP(c) < t.contest) return null;
  const opp = ans.opponent;
  let opponent: string | null = null;
  if (opp?.type === "choice" && opp.confidence >= 0.5) {
    if (opp.choice.startsWith("p:") && s.people[opp.choice.slice(2)]) opponent = personName(r, s, opp.choice.slice(2));
    else if (opp.choice.startsWith("cand:")) opponent = cands[Number(opp.choice.slice(5))] ?? null;
  }
  return { kind: c.choice, opponent, threat: difficultyOf(ans.threat) ?? "fair" };
}

/** A contest opponent nobody named. */
export const SOMEONE = "the opponent";

// ───────────────────────── R: the typed message ─────────────────────────

export interface ReadMeta {
  /** Listed choices with a check, by criteria key. */
  listed: Record<string, { a: ActionDef; id: string }>;
  attempt: boolean;
  stats: string[];
  cands: string[];
}

/**
 * The typed read: what `player_action` attempts (a listed move with a check, an improvised `attempt`, or `none`),
 * whether it is risky and contested, how hard it is, which ability it leans on, and whether it starts a contest.
 */
export function readQuestions(o: {
  r: Ruleset; s: GameState; split: { action: string; said: string[] }; scene: string; player: string; lines: string[];
}): { state: Record<string, unknown>; questions: Questions; meta: ReadMeta } {
  const { r, s, player } = o;
  const q: Questions = {};
  const listed: ReadMeta["listed"] = {};
  for (const c of availableChoices(r, s, o.lines)) if (c.a.check) listed[c.id] = { a: c.a, id: c.id };
  for (const u of usableItems(r, s)) if (!u.locked && u.a.check) listed[u.id] = { a: u.a, id: u.id };
  const attempt = r.style === "adventure" && r.checks.typed;
  const stats = r.checks.stats.filter((id) => r.stats[id]);
  if (attempt || Object.keys(listed).length) {
    const criteria: Record<string, string> = { [NONE]: "Nothing that can fail: talk, thoughts, feelings, plans, a question, or an everyday act" };
    for (const [k, { a }] of Object.entries(listed)) criteria[k] = described(a.label, a.desc);
    if (attempt) criteria[ATTEMPT] = "Something else that can fail and matters (sneak, persuade, lie, fight, climb, steal, resist, perform…)";
    q.action = { type: "choice", instructions: "Which of these does `player_action` actually attempt right now?", criteria };
    q.difficulty = difficultyQ("How hard is `player_action` for an ordinary person in this situation?");
  }
  if (attempt) {
    q.risky = { type: "noul", instructions: "`player_action` can fail in a way that changes the story; it is not sure to work." };
    q.contested = { type: "noul", instructions: "Someone or something in `scene` actively works against `player_action` (a person, a guard, a lock, a storm, a fall, a deadline)." };
    if (stats.length > 1) {
      q.approach = {
        type: "choice",
        instructions: `Which of ${player}'s abilities matters most for \`player_action\`?`,
        criteria: Object.fromEntries(stats.map((id) => [id, described(r.stats[id].label, r.stats[id].desc)])),
      };
    }
  }
  const cands = contestCanStart(r, s) ? nameCandidates(`${o.scene}\n${o.split.action}`, knownNames(r, s, player), 6) : [];
  if (contestCanStart(r, s)) contestQuestions(r, s, q, presentPeople(r, s, makeEnv(r, s)), cands, player, "now");
  const state = {
    scene: clip(o.scene, 1500) || "(start of story)",
    player_action: clip(o.split.action, 1200),
    ...(o.split.said.length ? { player_said: clip(o.split.said.join(" / "), 400) } : {}),
    game_state: stateDigest(r, s),
  };
  return { state, questions: q, meta: { listed, attempt, stats, cands } };
}

export interface Verdict {
  /** Act on this (null = roleplay, no roll). */
  intent: Intent | null;
  /** How sure the read was of the action it picked. */
  confidence: number;
  /** The message starts a contest (before the move lands; this message is round 1). */
  contest?: { kind: string; opponent: string; threat: Difficulty };
}

/** The roll rule: a listed move with a check, or an attempt that is risky and contested, read with enough confidence. */
export function readVerdict(r: Ruleset, s: GameState, ans: Answers, meta: ReadMeta, t: Thresholds): Verdict {
  const out: Verdict = { intent: null, confidence: 0 };
  const c = contestFrom(r, s, ans, meta.cands, t);
  if (c) out.contest = { kind: c.kind, opponent: c.opponent ?? SOMEONE, threat: c.threat };
  const act = ans.action;
  if (act?.type !== "choice" || act.choice === NONE) return out;
  out.confidence = choiceP(act);
  if (out.confidence < t.act) return out;
  const difficulty = difficultyOf(ans.difficulty) ?? "fair";
  if (act.choice === ATTEMPT) {
    if (!meta.attempt) return out;
    const risky = noulP(ans.risky) ?? 0, contested = noulP(ans.contested) ?? 0;
    if (risky < t.risky || contested < t.contested) return out;
    const ap = ans.approach;
    const stat = meta.stats.length === 1 ? meta.stats[0] : ap?.type === "choice" && meta.stats.includes(ap.choice) ? ap.choice : meta.stats[0] ?? "";
    out.intent = { actionId: `try:${stat}`, via: "adjudicator", params: { difficulty } };
    return out;
  }
  const hit = meta.listed[act.choice];
  if (!hit) return out;
  // Authored checks are not gated by risky/contested: the author decided this move rolls.
  const params: Record<string, string> = {};
  const level = DIFFICULTIES.indexOf(difficulty) / (DIFFICULTIES.length - 1);
  for (const p of hit.a.params) {
    const keys = Object.keys(p.options);
    params[p.id] = ans.difficulty?.type === "score" ? keys[Math.round(level * (keys.length - 1))] : p.default;
  }
  // A check with no target of its own takes the read's difficulty word.
  if (hit.a.check && hit.a.check.target === undefined && !params.difficulty) params.difficulty = difficulty;
  out.intent = { actionId: hit.id, via: "adjudicator", ...(Object.keys(params).length ? { params } : {}) };
  return out;
}

/** In a running contest (Jev only): which ability the typed move leans on, and whether it breaks off or gives in. */
export function contestReadQuestions(r: Ruleset, s: GameState, o: { split: { action: string; said: string[] }; text: string; scene: string; player: string }): { state: Record<string, unknown>; questions: Questions } {
  const kind = s.contest ? r.conflict.kinds[s.contest.kind] : undefined;
  const q: Questions = {};
  if (kind && kind.stats.length > 1) {
    q.approach = {
      type: "choice",
      instructions: `Which of ${o.player}'s abilities does this move lean on most?`,
      criteria: Object.fromEntries(kind.stats.filter((id) => r.stats[id]).map((id) => [id, described(r.stats[id].label, r.stats[id].desc)])),
    };
  }
  q.exit = {
    type: "choice",
    instructions: `Does ${o.player} try to end the ${kind?.label.toLowerCase() ?? "contest"} with \`player_message\`?`,
    criteria: { [NONE]: "No: it is a move in the contest", break_off: "Tries to get away or break it off", give_in: "Gives in, yields or surrenders" },
  };
  return { state: { scene: clip(o.scene, 1500), player_message: clip(o.text, 1200), game_state: stateDigest(r, s) }, questions: q };
}

export function contestReadVerdict(r: Ruleset, s: GameState, ans: Answers, t: Thresholds): Verdict {
  const exit = ans.exit;
  if (exit?.type === "choice" && exit.choice === "give_in" && choiceP(exit) >= 0.7) return { intent: { actionId: GIVE_IN, via: "adjudicator" }, confidence: choiceP(exit) };
  if (exit?.type === "choice" && exit.choice === "break_off" && choiceP(exit) >= t.contest) return { intent: { actionId: BREAK_OFF, via: "adjudicator" }, confidence: choiceP(exit) };
  const kind = s.contest ? r.conflict.kinds[s.contest.kind] : undefined;
  const ap = ans.approach;
  if (kind && ap?.type === "choice" && kind.stats.includes(ap.choice) && ap.confidence >= t.choice) return { intent: { actionId: contestMoveId(ap.choice), via: "adjudicator" }, confidence: ap.confidence };
  // No usable answer: the engine treats the message as a move on the kind's best stat.
  return { intent: null, confidence: 0 };
}

// ───────────────────────── D: decide odds ─────────────────────────

export function decideQuestions(specs: DecideSpec[], player: string): Questions {
  const q: Questions = {};
  for (const d of specs) {
    q[`decide:${d.id}`] = { type: "choice", instructions: fill(d.ask, player), criteria: Object.fromEntries(d.options.map((o) => [o.id, fill(o.desc, player)])) };
  }
  return q;
}

export function oddsFromAnswers(specs: DecideSpec[], ans: Answers): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const d of specs) {
    const a = ans[`decide:${d.id}`];
    if (a?.type !== "choice") continue;
    const keys = d.options.map((o) => o.id);
    const sum = keys.reduce((n, k) => n + Math.max(0, Number(a.probabilities[k]) || 0), 0);
    out[d.id] = Object.fromEntries(keys.map((k) => [k, sum > 0 ? Math.max(0, Number(a.probabilities[k]) || 0) / sum : 1 / keys.length]));
  }
  return out;
}

// ───────────────────────── A: bookkeeping ─────────────────────────

/** "Same" first: Jev leans to the first option, and a skipped answer means no change. */
const STEPS = ["same", "up", "down", "up_lot", "down_lot"] as const;
/** up/down = half the per-reply cap (min 1), so a Story stat with cap 4 moves +2 on a warm reply (CORE-DESIGN §2.0.6 point 5). */
const STEP_FACTOR: Record<string, number> = { same: 0, up: 1 / 2, down: -1 / 2, up_lot: 1, down_lot: -1 };
const TIME_LEVELS = [
  "No meaningful time: a few seconds or a single exchange",
  "A few minutes",
  "Around half an hour",
  "About an hour",
  "A few hours",
  "Most of a day or night",
];
export const TIME_MINUTES = [0, 5, 30, 60, 180, 480];

/** A step's delta, rounded so chips read "+2". Never rounds a real change to zero. */
export function stepDelta(step: string, limit: number): number {
  const raw = (STEP_FACTOR[step] ?? 0) * limit;
  // Round away from zero on halves, the same both ways (up 5 → +3, down 5 → −3).
  const rounded = Math.sign(raw) * Math.round(Math.abs(raw));
  return rounded === 0 && raw !== 0 ? Math.sign(raw) * Math.min(1, Math.abs(limit)) : rounded;
}

function stepCriteria(what: string): Record<string, string> {
  return {
    same: `${what} didn't change, or the reply doesn't say`,
    up: `${what} went up a little`,
    down: `${what} went down a little`,
    up_lot: `${what} rose sharply`,
    down_lot: `${what} dropped sharply`,
  };
}

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

/** Text the helper must write because a classification said something new appeared. */
export type TextTask =
  | { kind: "outfit" | "looks"; who: string; name: string; old: string }
  | { kind: "first"; who: string; name: string }
  | { kind: "memory"; who: string; name: string }
  | { kind: "person" } | { kind: "goal" } | { kind: "place" } | { kind: "items" } | { kind: "foe" };

/** The key a task's text comes back under in the writer's `texts`. */
export function taskKey(t: TextTask): string {
  switch (t.kind) {
    case "outfit": case "looks": case "memory": case "first": return `${t.kind}:${t.who}`;
    case "person": return "person:new";
    case "goal": return "goal:new";
    default: return t.kind;
  }
}

export interface BookMeta {
  cast: string[];
  mentioned: string[];
  lookWho: string[];
  cands: string[];
  amounts: number[];
  goals: string[];
  growable: string[];
  moneyStat: string | null;
  tags: string[];
  newNames: boolean;
  contest: boolean;
}

/** Amounts of money in a reply ("$20", "20 gold", "twenty coins"), for Jev to pick from (it can't read numbers). */
export function moneyAmounts(text: string, currency: string, max = 6): number[] {
  const out: number[] = [];
  const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, thousand: 1000 };
  const unit = "(?:gold|silver|copper|coins?|credits?|bucks|dollars?|euros?|pounds?|yen|crowns?|marks?|gp|sp|cp)";
  const cur = esc(currency || "$");
  const re = new RegExp(`(?:${cur}|[$£€¥])\\s?(\\d[\\d,]*(?:\\.\\d+)?)|(\\d[\\d,]*(?:\\.\\d+)?)\\s?(?:${unit}|${cur})|\\b(${Object.keys(NUM).join("|")})\\s+${unit}`, "gi");
  for (const m of text.matchAll(re)) {
    const n = m[3] ? NUM[m[3].toLowerCase()] : Number((m[1] ?? m[2] ?? "").replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0 && !out.includes(n)) out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

/** Open goals the story judges: story goals and authored goals with `judge:` (at most 5). */
function judgedGoals(r: Ruleset, s: GameState): string[] {
  return Object.entries(s.goals ?? {})
    .filter(([id, g]) => g.st === "open" && (!r.goals.list[id] || r.goals.list[id].judge || r.goals.list[id].judgeFail))
    .map(([id]) => id).slice(0, 5);
}

/**
 * The post-reply questions. Without Jev the helper answers these same questions inside its one call;
 * with Jev, `tags` adds the live-choice `kinds` question to the same batch.
 */
export function bookkeepingQuestions(o: {
  r: Ruleset; s: GameState; playerText: string; reply: string; player: string; applied: string | null;
  storyGoals?: boolean; tags?: ActionDef[];
}): { state: Record<string, unknown>; questions: Questions; meta: BookMeta } {
  const { r, s, player } = o;
  const q: Questions = {};
  if (r.clock.enabled) q.time = { type: "score", instructions: "How much in-story time passes during `narrator_reply`?", criteria: TIME_LEVELS };

  // Money: the direction, and the amount picked from the ones the reply names.
  const moneyStat = r.hud.money && r.stats[r.hud.money]?.narrator > 0 ? r.hud.money : null;
  const amounts = moneyStat ? moneyAmounts(o.reply, r.hud.currency) : [];
  if (moneyStat) {
    q.money = { type: "choice", instructions: `In \`narrator_reply\`, does ${player} pay or receive money, beyond \`already_applied\`?`, criteria: { same: "No money changes hands", paid: `${player} pays or loses money`, received: `${player} receives or finds money` } };
    if (amounts.length) q.money_amt = { type: "choice", instructions: `Which amount in \`narrator_reply\` is the money ${player} paid or received?`, criteria: { [NONE]: "None of these", ...Object.fromEntries(amounts.map((n, i) => [`a${i}`, `${n}`])) } };
  }
  for (const id of r.statOrder) {
    const d = r.stats[id];
    if (d.narrator <= 0 || id === moneyStat) continue;
    q[`stat:${id}`] = { type: "choice", instructions: `During \`narrator_reply\`, how did ${player}'s ${described(d.label, d.desc)} change, beyond \`already_applied\`?`, criteria: stepCriteria(d.label) };
  }

  // People the reply mentions: feelings (first read, then steps), a big moment, looks and clothes.
  const lower = o.reply.toLowerCase();
  const mentioned = Object.keys(s.people).filter((pid) => !s.forgotten[pid] && lower.includes(personName(r, s, pid).toLowerCase().split(" ")[0]));
  for (const pid of mentioned) {
    const name = personName(r, s, pid);
    for (const rs of r.relStatOrder) {
      const d = r.relStats[rs];
      if (d.narrator <= 0) continue;
      if (!s.calibrated[pid]) q[`feel:${pid}:${rs}`] = { type: "score", instructions: `Right now, how does ${name} feel toward ${player}: ${d.label}?`, criteria: feelLevels(d).map((l) => l.text) };
      else q[`rel:${pid}:${rs}`] = { type: "choice", instructions: `How did ${name}'s ${d.label} toward ${player} change during \`narrator_reply\`, beyond \`already_applied\`?`, criteria: stepCriteria(`${name}'s ${d.label}`) };
    }
    q[`moment:${pid}`] = { type: "noul", instructions: `In \`narrator_reply\`, something happens between ${player} and ${name} that ${name} will remember for a long time: a real kindness, a betrayal, a promise made or broken, a humiliation, a first kiss, a rescue.` };
  }
  const hereBefore = presentPeople(r, s, makeEnv(r, s));
  const leftBehind = Object.entries(s.scene).filter(([id, v]) => v.here && s.people[id] && v.loc !== s.location && v.loc === s.lastLocation).map(([id]) => id);
  const cast = [...new Set([...hereBefore, ...mentioned, ...leftBehind])].filter((id) => !s.forgotten[id]).slice(0, 12);
  for (const pid of cast) {
    q[`here:${pid}`] = { type: "noul", instructions: `At the end of \`narrator_reply\`, ${personName(r, s, pid)} is physically in the scene with ${player} (in the same place; not just mentioned, remembered, on the phone, or left behind).` };
  }
  const lookWho = ["you", ...[...new Set([...hereBefore, ...mentioned])].slice(0, 8)];
  for (const who of lookWho) {
    const name = who === "you" ? player : personName(r, s, who);
    q[`outfit:${who}`] = { type: "noul", instructions: `In \`narrator_reply\`, ${name}'s clothing changes (puts something on, takes something off, changes clothes, a garment is torn or soaked).` };
    q[`looks:${who}`] = { type: "noul", instructions: `In \`narrator_reply\`, ${name}'s visible appearance changes (hurt or bloodied, dirty, wet, a new haircut or colour, a new mark).` };
  }

  // New people: names picked from the reply, not written.
  const cands = r.peopleOpen ? nameCandidates(o.reply, knownNames(r, s, player), 8) : [];
  const gated = Object.values(r.actions).some((a) => adultGated(a.tags)) || Object.values(r.liveChoices.tags).some((a) => adultGated(a.tags));
  cands.forEach((name, i) => {
    q[`newp:${i}`] = { type: "noul", instructions: `"${name}" is the name of a person or creature who is in the scene in \`narrator_reply\`: they speak, act or are spoken to there and then. Not someone only remembered or talked about; not ${player}; not a place, a thing, a title, a group, or an ordinary word.` };
    q[`newhere:${i}`] = { type: "noul", instructions: `At the end of \`narrator_reply\`, ${name} is physically in the scene with ${player} (not just mentioned or remembered).` };
    for (const rs of r.relStatOrder) {
      const d = r.relStats[rs];
      if (d.narrator > 0) q[`newfeel:${i}:${rs}`] = { type: "score", instructions: `Right now, how does ${name} feel toward ${player}: ${d.label}?`, criteria: feelLevels(d).map((l) => l.text) };
    }
    if (gated) q[`newadult:${i}`] = { type: "choice", instructions: `Going by \`narrator_reply\` and \`game_state\`, is ${name} an adult (18 or older)?`, criteria: { unclear: "It isn't clear", adult: "An adult", minor: "Under 18" } };
  });
  if (r.peopleOpen) q["gate:people"] = { type: "noul", instructions: `\`narrator_reply\` brings in a new person who has no name in it ("a guard", "the bartender").` };

  // Things {{user}} has that the reply mentions, and new things.
  let itemQs = 0;
  for (const [id, n] of Object.entries(s.items)) {
    if (itemQs >= 8) break;
    const name = itemName(r, s, id);
    if (!mentions(o.reply, name)) continue;
    const def = r.items[id];
    const per = def?.uses ?? 0;
    q[`item:${id}`] = {
      type: "choice",
      instructions: `What happened to ${player}'s ${name} during \`narrator_reply\`?`,
      criteria: {
        same: "Nothing happened to it: only mentioned, carried or held as before",
        used: def?.use
          ? `${player} used it as meant (${def.use.label})${per > 0 ? `: once; it has ${s.uses[id] ?? per} of ${per} uses left` : def.keep ? "" : ", and it's used up"}`
          : per > 0 ? `Used once (it has ${s.uses[id] ?? per} of ${per} uses left)` : "Used, but not used up: it's still there afterwards",
        gone: `Used up, eaten, drunk, broken, given away, dropped, lost or taken: ${player} has one fewer${n > 1 ? ` (has ${n} now)` : ""}`,
      },
    };
    itemQs++;
  }
  if (r.itemsOpen) q["gate:items"] = { type: "noul", instructions: `${player} gains a new item in \`narrator_reply\`.` };

  const growable = r.growth.enabled && r.growth.train ? r.statOrder.filter((id) => (r.stats[id].kind === "skill" || r.stats[id].kind === "attribute") && r.stats[id].growth > 0) : [];
  if (growable.length) {
    q.train = {
      type: "choice",
      instructions: `During \`narrator_reply\`, did ${player} spend real effort practising, training, studying or rehearsing one of these?`,
      criteria: { [NONE]: "No", ...Object.fromEntries(growable.map((id) => [id, described(r.stats[id].label, r.stats[id].desc)])) },
    };
  }
  for (const c of Object.values(r.conditions)) {
    if (c.narrator) q[`cond:${c.id}`] = { type: "noul", instructions: `At the end of \`narrator_reply\`, ${player} is ${c.label.toLowerCase()}${c.desc ? ` (${c.desc})` : ""}.` };
  }
  for (const f of Object.values(r.flags)) {
    if (f.narrator && typeof f.start === "boolean") q[`flag:${f.id}`] = { type: "noul", instructions: `At the end of \`narrator_reply\`, this is true: ${f.label ?? f.id.replace(/_/g, " ")}.` };
  }

  // Goals: where open ones stand, and whether the story made a new one.
  const goals = judgedGoals(r, s);
  for (const id of goals) {
    const g = s.goals[id];
    const def = r.goals.list[id];
    q[`goal:${id}`] = {
      type: "choice",
      instructions: `Where does ${player}'s goal "${g.text}" stand at the end of \`narrator_reply\`?`,
      criteria: {
        ongoing: "Still open, or the reply doesn't say",
        advanced: "A real step toward it",
        done: def?.judge ? `Done: ${fill(def.judge, player)}` : "Done: it is achieved or the promise is kept",
        failed: def?.judgeFail ? `Failed: ${fill(def.judgeFail, player)}` : "Failed, abandoned or made impossible",
      },
    };
  }
  const open = Object.values(s.goals ?? {}).filter((g) => g.st === "open").length;
  if (r.goals.fromStory && o.storyGoals !== false && open < r.goals.max) {
    q["gate:goal"] = { type: "noul", instructions: `In \`narrator_reply\`, someone asks ${player} for a specific task or favour that ${player} agrees to, or ${player} sets out to do something specific, and it is not one of the open goals.` };
  }
  for (const tr of r.triggers) {
    if (tr.whenScene) q[`scene:${tr.id}`] = { type: "noul", instructions: fill(tr.whenScene, player) };
  }

  // A contest the prose starts (only a full swing ends one, so there is no "is it over?" question).
  const contest = contestCanStart(r, s);
  if (contest) {
    contestQuestions(r, s, q, [...new Set([...hereBefore, ...mentioned])], cands, player, "reply");
    const last = s.lastContest;
    if (last && s.minutes - last.at < 24 * 60) {
      q.contest_fresh = { type: "noul", instructions: `A ${r.conflict.kinds[last.kind]?.label.toLowerCase() ?? "contest"} with ${last.opponent} just ended. If one broke out in \`narrator_reply\`, it is a genuinely new incident, not the same one still being described, its aftermath, or a memory of it.` };
    }
  }

  // Where {{user}} ends up: a named place is picked; only "somewhere unnamed" needs writing.
  q["gate:move"] = { type: "noul", instructions: `${player} ends \`narrator_reply\` somewhere different from ${s.locationName ?? "where they started"}.` };
  q.place = {
    type: "choice",
    instructions: `Where is ${player} at the end of \`narrator_reply\`?`,
    criteria: { stay: `Still at ${s.locationName ?? "the same place"}`, ...Object.fromEntries(cands.map((n, i) => [`cand:${i}`, `A place called ${n}`])), elsewhere: "Somewhere else, not named in this list" },
  };

  const tags = o.tags ?? [];
  if (tags.length > 1) {
    q.kinds = { type: "choice", instructions: `Right after \`narrator_reply\`, which kind of move would be most natural and interesting for ${player} to make next?`, criteria: Object.fromEntries(tags.map((a) => [a.id, a.desc ?? a.label])) };
  }

  const state = {
    game_state: stateDigest(r, s), player_message: clip(o.playerText, 1200) || "(none)", narrator_reply: clip(o.reply, 6000),
    already_applied: o.applied || "(nothing: the rules applied no changes this turn)",
  };
  return { state, questions: q, meta: { cast, mentioned, lookWho, cands, amounts, goals, growable, moneyStat, tags: tags.map((a) => a.id), newNames: newNames(o.reply, knownNames(r, s, player)).length > 0, contest } };
}

export interface Bookkeeping {
  proposal: Proposal;
  /** `when_scene` answers, stored on the reply's record; the next turn's resolve fires them. */
  sceneRead: Record<string, boolean>;
  /** Texts the helper must write. */
  tasks: TextTask[];
  /** Jev's ranking of the live-choice tags (probabilities), when asked. */
  kinds: Record<string, number> | null;
}

/** Answers → the engine's Proposal (bounded by the engine's caps), the scene answers, and the text tasks. */
export function bookkeepingFromAnswers(r: Ruleset, s: GameState, ans: Answers, meta: BookMeta, t: Thresholds): Bookkeeping {
  const p: Proposal = {};
  const tasks: TextTask[] = [];
  const tm = ans.time;
  if (tm?.type === "score" && tm.confidence >= 0.4) p.minutes = TIME_MINUTES[Math.max(0, Math.min(TIME_MINUTES.length - 1, Math.round(tm.score)))];
  for (const id of r.statOrder) {
    const a = ans[`stat:${id}`];
    if (!sure(a, t) || a.choice === "same" || r.stats[id].narrator <= 0) continue;
    (p.stats ??= {})[id] = stepDelta(a.choice, r.stats[id].narrator);
  }
  if (meta.moneyStat) {
    const dir = ans.money;
    if (sure(dir, t) && dir.choice !== "same") {
      const amt = ans.money_amt;
      const i = amt?.type === "choice" && amt.choice !== NONE && amt.confidence >= t.choice ? Number(amt.choice.slice(1)) : -1;
      const n = i >= 0 && meta.amounts[i] !== undefined ? meta.amounts[i] : stepDelta("up", r.stats[meta.moneyStat].narrator);
      (p.stats ??= {})[meta.moneyStat] = dir.choice === "paid" ? -n : n;
    }
  }
  for (const [key, a] of Object.entries(ans)) {
    if (key.startsWith("feel:") && a.type === "score" && a.confidence >= 0.3) {
      const [, pid, rs] = key.split(":");
      if (!s.people[pid] || !r.relStats[rs]) continue;
      const levels = feelLevels(r.relStats[rs]);
      ((p.feelings ??= {})[personName(r, s, pid)] ??= {})[rs] = levels[Math.max(0, Math.min(levels.length - 1, Math.round(a.score)))].value;
    } else if (key.startsWith("rel:") && sure(a, t) && a.choice !== "same") {
      const [, pid, rs] = key.split(":");
      if (!s.people[pid] || !r.relStats[rs]) continue;
      ((p.rel ??= {})[personName(r, s, pid)] ??= {})[rs] = stepDelta(a.choice, r.relStats[rs].narrator);
    }
  }
  // Big moments: the highest first (the engine uses the first); each one also asks for a memory line.
  const moments = meta.mentioned.map((pid) => ({ pid, p: noulP(ans[`moment:${pid}`]) ?? 0 })).filter((x) => x.p >= t.moment).sort((a, b) => b.p - a.p);
  if (moments.length) p.moments = moments.map((m) => personName(r, s, m.pid));
  for (const m of moments) tasks.push({ kind: "memory", who: m.pid, name: personName(r, s, m.pid) });
  for (const pid of meta.cast) {
    const v = noulP(ans[`here:${pid}`]);
    if (v === null) continue;
    if (v >= t.here) (p.scene ??= {})[pid] = true;
    else if (v <= t.gone) (p.scene ??= {})[pid] = false;
  }
  for (const who of meta.lookWho) {
    const name = who === "you" ? "you" : personName(r, s, who);
    for (const kind of ["outfit", "looks"] as const) {
      if ((noulP(ans[`${kind}:${who}`]) ?? 0) < t.flagText) continue;
      const old = s.look?.[who]?.[kind === "outfit" ? "outfit" : "appearance"] ?? "";
      tasks.push({ kind, who, name, old });
    }
  }
  // New people the classifier picked from the candidates ("Captain Rhea Vos" and "Rhea" are one person: keep the fuller name).
  const isPerson = (i: number) => (noulP(ans[`newp:${i}`]) ?? 0) >= t.newPerson;
  const within = (a: string, b: string) => a !== b && ` ${b} `.includes(` ${a} `);
  const picked: string[] = [];
  meta.cands.forEach((name, i) => {
    if (!isPerson(i) || meta.cands.some((other, j) => isPerson(j) && within(name, other))) return;
    picked.push(name);
    const feelings: Record<string, number> = {};
    for (const rs of r.relStatOrder) {
      const f = ans[`newfeel:${i}:${rs}`];
      if (f?.type !== "score" || f.confidence < 0.3) continue;
      const levels = feelLevels(r.relStats[rs]);
      feelings[rs] = levels[Math.max(0, Math.min(levels.length - 1, Math.round(f.score)))].value;
    }
    const ad = ans[`newadult:${i}`];
    const adult = ad?.type === "choice" ? (ad.choice === "adult" && choiceP(ad) >= 0.8 ? true : ad.choice === "minor" && choiceP(ad) >= 0.5 ? false : null) : undefined;
    (p.people ??= []).push({ name, ...(Object.keys(feelings).length ? { feelings } : {}), ...(adult !== undefined ? { adult } : {}) });
    if ((noulP(ans[`newhere:${i}`]) ?? 0) >= 0.5) (p.scene ??= {})[name] = true;
    tasks.push({ kind: "first", who: name, name });
  });
  // Someone new with no name to pick: the writer gives a short label. A mid-sentence unknown name lowers the bar.
  const peopleBar = meta.newNames ? Math.min(0.35, t.gate) : t.gate;
  if (!meta.cands.length && (noulP(ans["gate:people"]) ?? 0) >= peopleBar) tasks.push({ kind: "person" });
  for (const [key, a] of Object.entries(ans)) {
    if (!key.startsWith("item:") || !sure(a, t) || a.choice === "same") continue;
    const id = key.slice(5);
    if (!s.items[id]) continue;
    const def = r.items[id];
    if (a.choice === "used" && ((def?.uses ?? 0) > 0 || def?.use)) {
      (p.used ??= {})[id] = 1;
      // An item without charges that does something is spent by using it (tools keep).
      if (def?.use && !def.keep && !(def.uses > 0)) (p.items ??= {})[id] = -1;
    } else if (a.choice === "gone") (p.items ??= {})[id] = -1;
  }
  if ((noulP(ans["gate:items"]) ?? 0) >= t.gate) tasks.push({ kind: "items" });
  const tr = ans.train;
  if (sure(tr, t) && tr.choice !== NONE && meta.growable.includes(tr.choice)) p.train = [tr.choice];
  for (const c of Object.values(r.conditions)) {
    const v = noulP(ans[`cond:${c.id}`]);
    if (v === null || noulConfidence(v) < t.noulSure) continue;
    if (v >= 0.5 && !s.conditions[c.id]) ((p.conditions ??= {}).add ??= []).push(c.id);
    if (v < 0.5 && s.conditions[c.id]) ((p.conditions ??= {}).remove ??= []).push(c.id);
  }
  for (const f of Object.values(r.flags)) {
    const v = noulP(ans[`flag:${f.id}`]);
    if (v !== null && noulConfidence(v) >= t.noulSure) (p.flags ??= {})[f.id] = v >= 0.5;
  }
  for (const id of meta.goals) {
    const a = ans[`goal:${id}`];
    if (a?.type !== "choice" || a.choice === "ongoing") continue;
    if (a.choice === "advanced" && a.confidence >= t.choice) ((p.goals ??= {}).advanced ??= []).push(id);
    else if ((a.choice === "done" || a.choice === "failed") && choiceP(a) >= t.goalClose) ((p.goals ??= {})[a.choice] ??= []).push(id);
  }
  if ((noulP(ans["gate:goal"]) ?? 0) >= t.gateGoal) tasks.push({ kind: "goal" });
  const sceneRead: Record<string, boolean> = {};
  for (const trg of r.triggers) {
    const v = noulP(ans[`scene:${trg.id}`]);
    // Only a reasonably sure answer either way is kept.
    if (trg.whenScene && v !== null && noulConfidence(v) >= 0.3) sceneRead[trg.id] = v >= 0.5;
  }
  if (meta.contest) {
    const c = contestFrom(r, s, ans, meta.cands, t);
    const fresh = noulP(ans.contest_fresh);
    const sameAsLast = c && s.lastContest && c.opponent && c.opponent.toLowerCase() === s.lastContest.opponent.toLowerCase();
    if (c && !(sameAsLast && fresh !== null && fresh < 0.7)) {
      p.contest = { kind: c.kind, opponent: c.opponent ?? SOMEONE, threat: c.threat };
      if (!c.opponent) tasks.push({ kind: "foe" });
    }
  }
  const place = ans.place;
  const moved = (noulP(ans["gate:move"]) ?? 0) >= t.gate;
  if (sure(place, t) && place.choice !== "stay") {
    if (place.choice.startsWith("cand:") && meta.cands[Number(place.choice.slice(5))] && !picked.includes(meta.cands[Number(place.choice.slice(5))])) p.place = meta.cands[Number(place.choice.slice(5))];
    else if (place.choice === "elsewhere" && moved) tasks.push({ kind: "place" });
  } else if (moved && !sure(place, t)) tasks.push({ kind: "place" });
  const k = ans.kinds;
  const kinds = k?.type === "choice" ? Object.fromEntries(Object.entries(k.probabilities).filter(([id]) => meta.tags.includes(id))) : null;
  return { proposal: p, sceneRead, tasks, kinds };
}

// ───────────────────────── texts from the writer ─────────────────────────

const text160 = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, 160) : null);

/**
 * Merge the writer's texts into the proposal: only texts a task asked for, cleaned and bounded. Looks and memories
 * are keyed by name (the engine finds the person); new people arrive with their first look.
 */
export function applyTexts(r: Ruleset, s: GameState, p: Proposal, tasks: TextTask[], texts: Record<string, unknown>, drop: Set<string> = new Set()): Proposal {
  const out: Proposal = { ...p };
  const look = (key: string, field: "appearance" | "outfit", v: string | null) => {
    if (!v) return;
    out.looks = { ...(out.looks ?? {}), [key]: { ...(out.looks?.[key] ?? {}), [field]: v } };
  };
  for (const task of tasks) {
    const key = taskKey(task);
    if (drop.has(key)) continue;
    const v = texts[key];
    switch (task.kind) {
      case "outfit": look(task.who === "you" ? "you" : task.name, "outfit", text160(v)); break;
      case "looks": look(task.who === "you" ? "you" : task.name, "appearance", text160(v)); break;
      case "first": {
        const o = v && typeof v === "object" ? v as Record<string, unknown> : {};
        look(task.name, "appearance", text160(typeof v === "string" ? v : o.appearance));
        look(task.name, "outfit", text160(o.outfit));
        break;
      }
      case "memory": {
        const m = typeof v === "string" ? v.trim().slice(0, 200) : "";
        if (m) out.memories = { ...(out.memories ?? {}), [task.name]: m };
        break;
      }
      case "person": {
        const o = v && typeof v === "object" ? v as Record<string, unknown> : {};
        const label = text160(typeof v === "string" ? v : o.label ?? o.name);
        if (!label || label.length > 60 || findPerson(r, s, label)) break;
        out.people = [...(out.people ?? []), { name: label }];
        out.scene = { ...(out.scene ?? {}), [label]: true };
        look(label, "appearance", text160(o.look ?? o.appearance));
        look(label, "outfit", text160(o.outfit));
        break;
      }
      case "goal": {
        const o = v && typeof v === "object" ? v as Record<string, unknown> : {};
        const title = text160(typeof v === "string" ? v : o.title ?? o.text);
        if (!title) break;
        const g = { text: title.slice(0, 120), ...(text160(o.done) ? { done: text160(o.done)! } : {}), ...(text160(o.from) ? { from: text160(o.from)! } : {}), ...(text160(o.stakes) ? { stakes: text160(o.stakes)! } : {}) };
        out.goals = { ...(out.goals ?? {}), new: [...(out.goals?.new ?? []), g] };
        break;
      }
      case "place": { const v2 = text160(v); if (v2) out.place = v2.slice(0, 120); break; }
      case "items": {
        const list = (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).map(text160).filter((x): x is string => !!x && x.length <= 60).slice(0, 4);
        if (list.length) out.items = { ...(out.items ?? {}), ...Object.fromEntries(list.map((n) => [n, (out.items?.[n] ?? 0) + 1])) };
        break;
      }
      case "foe": { const v2 = text160(v); if (v2 && out.contest && v2.length <= 60) out.contest = { ...out.contest, opponent: v2 }; break; }
    }
  }
  return out;
}

// ───────────────────────── B: after the writer (Jev) ─────────────────────────

/**
 * Does this choice's tag roll against a target its written words decide? A check without its own `vs:`, or the
 * older idiom `vs: difficulty` with a `difficulty` param (the click passes the stored word as that param).
 */
export function wordsDecide(r: Ruleset, c: LiveChoice): boolean {
  const a = r.liveChoices.tags[c.tag];
  if (!a?.check || c.difficulty === "none") return false;
  const t = a.check.target;
  return t === undefined || (t === "difficulty" && a.params.some((p) => p.id === "difficulty"));
}

/** Jev rates each written choice with the same four levels, and checks that new look lines match the reply. */
export function choiceQuestions(r: Ruleset, s: GameState, choices: LiveChoice[], texts: Record<string, unknown>, scene: string, player: string): { state: Record<string, unknown>; questions: Questions } {
  const q: Questions = {};
  choices.forEach((c, i) => {
    if (wordsDecide(r, c)) q[`diff:${i}`] = difficultyQ(`How hard is \`choices[${i}]\` for ${player} to pull off right now, given \`scene\`?`);
  });
  const fresh: Record<string, string> = {};
  for (const [key, v] of Object.entries(texts)) {
    const [kind, who] = key.split(":");
    if ((kind !== "outfit" && kind !== "looks") || typeof v !== "string") continue;
    const name = who === "you" ? player : personName(r, s, who);
    fresh[key] = v;
    q[`ok:${key}`] = { type: "noul", instructions: `\`new_texts.${key}\` matches how ${name} ${kind === "outfit" ? "is dressed" : "looks"} at the end of \`scene\`.` };
  }
  return { state: { scene: clip(scene, 1500), game_state: stateDigest(r, s), choices: choices.map((c) => c.label), ...(Object.keys(fresh).length ? { new_texts: fresh } : {}) }, questions: q };
}

export function choiceDifficulty(r: Ruleset, choices: LiveChoice[], ans: Answers): LiveChoice[] {
  return choices.map((c, i) => {
    const d = wordsDecide(r, c) ? difficultyOf(ans[`diff:${i}`]) : null;
    return d ? { ...c, difficulty: d } : c;
  });
}

/** Text keys Jev says don't match the reply (dropped; the old line stays). */
export function textChecks(ans: Answers): Set<string> {
  const out = new Set<string>();
  for (const [key, a] of Object.entries(ans)) if (key.startsWith("ok:") && a.type === "noul" && a.noul < 0.5) out.add(key.slice(3));
  return out;
}

// ───────────────────────── G: the greeting ─────────────────────────

const PHASES: Record<string, string> = {
  dawn: "Dawn, around sunrise", morning: "Morning", midday: "Around noon", afternoon: "Afternoon",
  evening: "Evening", night: "Night", "late night": "Late at night, after midnight",
};

/** Clock times written in a text ("9:30 pm", "21:00", "9pm"), as hour and minute. */
export function clockTimes(text: string, max = 6): { hour: number; minute: number; text: string }[] {
  const out: { hour: number; minute: number; text: string }[] = [];
  for (const m of text.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?=[\s.,!?;)]|$)/gi)) {
    if (!m[2] && !m[3]) continue;
    let h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    const ap = m[3]?.toLowerCase().replace(/\./g, "");
    if (ap) { if (h < 1 || h > 12) continue; if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0; }
    if (h > 23 || min > 59) continue;
    if (!out.some((x) => x.hour === h && x.minute === min)) out.push({ hour: h, minute: min, text: m[0].trim() });
    if (out.length >= max) break;
  }
  return out;
}

export interface GreetingMeta { people: string[]; cands: string[]; clocks: { hour: number; minute: number }[]; weekdays: string[]; adults: string[] }

/** The greeting read's classifications (Jev): the start time, the weekday, who is here, where, and who is an adult. */
export function greetingQuestions(r: Ruleset, s: GameState, o: { greeting: string; persona: string; card: string; player: string }): { state: Record<string, unknown>; questions: Questions; meta: GreetingMeta } {
  const q: Questions = {};
  const clocks = clockTimes(o.greeting);
  if (r.clock.enabled && r.clock.start === "greeting") {
    q.start_phase = { type: "choice", instructions: "What time of day is it when `greeting` begins?", criteria: { unknown: "It isn't clear", ...PHASES } };
    if (clocks.length) q.start_clock = { type: "choice", instructions: "Which clock time in `greeting` is the time right now, when it begins?", criteria: { [NONE]: "None of these is the time now", ...Object.fromEntries(clocks.map((c, i) => [`t${i}`, c.text])) } };
    q.start_day = { type: "choice", instructions: "What day of the week is it in `greeting`?", criteria: { unknown: "It isn't said", ...Object.fromEntries(r.clock.weekdays.map((d, i) => [`d${i}`, d])) } };
  }
  const people = Object.keys(s.people).filter((id) => !s.forgotten[id]);
  for (const pid of people) q[`here:${pid}`] = { type: "noul", instructions: `When \`greeting\` begins, ${personName(r, s, pid)} is physically in the scene with ${o.player}.` };
  const cands = nameCandidates(o.greeting, knownNames(r, s, o.player), 6);
  if (r.peopleOpen) cands.forEach((name, i) => {
    q[`newp:${i}`] = { type: "noul", instructions: `"${name}" is the name of a person who is in the opening scene of \`greeting\` with ${o.player}. Not a place, a thing, a group or someone only mentioned.` };
  });
  if (cands.length) q.place = { type: "choice", instructions: `Where is ${o.player} when \`greeting\` begins?`, criteria: { unknown: "Not named in this list", ...Object.fromEntries(cands.map((n, i) => [`cand:${i}`, `A place called ${n}`])) } };
  const adults = people.filter((pid) => r.people[pid]?.age === undefined && s.adults?.[pid] === undefined);
  for (const pid of adults) q[`adult:${pid}`] = { type: "choice", instructions: `Going by \`greeting\` and \`card\`, is ${personName(r, s, pid)} an adult (18 or older)?`, criteria: { unclear: "It isn't clear", adult: "An adult", minor: "Under 18" } };
  return {
    state: { greeting: clip(o.greeting, 4000), persona: clip(o.persona, 1200), card: clip(o.card, 1500) },
    questions: q,
    meta: { people, cands, clocks, weekdays: r.clock.weekdays, adults },
  };
}

/** Jev's greeting answers → the engine's GreetingRead (names), plus whether the place still needs writing. */
export function greetingFromAnswers(r: Ruleset, s: GameState, ans: Answers, meta: GreetingMeta, t: Thresholds): { read: GreetingRead; needPlace: boolean; newPeople: string[] } {
  const read: GreetingRead = {};
  const clock = ans.start_clock;
  const phase = ans.start_phase;
  const day = ans.start_day;
  const weekday = day?.type === "choice" && day.choice !== "unknown" && day.confidence >= t.choice ? meta.weekdays[Number(day.choice.slice(1))] ?? null : null;
  if (clock?.type === "choice" && clock.choice !== NONE && clock.confidence >= t.choice && meta.clocks[Number(clock.choice.slice(1))]) {
    const c = meta.clocks[Number(clock.choice.slice(1))];
    read.time = { hour: c.hour, minute: c.minute, weekday };
  } else if (phase?.type === "choice" && phase.choice !== "unknown" && phase.confidence >= t.choice) {
    read.time = { word: phase.choice, weekday };
  }
  const present: string[] = [];
  for (const pid of meta.people) if ((noulP(ans[`here:${pid}`]) ?? 0) >= t.here) present.push(personName(r, s, pid));
  const newPeople: string[] = [];
  meta.cands.forEach((name, i) => { if ((noulP(ans[`newp:${i}`]) ?? 0) >= t.newPerson) { present.push(name); newPeople.push(name); } });
  if (present.length) read.present = present;
  const place = ans.place;
  let needPlace = true;
  if (place?.type === "choice" && place.choice.startsWith("cand:") && place.confidence >= t.choice) {
    const name = meta.cands[Number(place.choice.slice(5))];
    if (name && !newPeople.includes(name)) { read.place = name; needPlace = false; }
  }
  const adults: Record<string, boolean> = {};
  for (const pid of meta.adults) {
    const a = ans[`adult:${pid}`];
    if (a?.type !== "choice") continue;
    if (a.choice === "adult" && choiceP(a) >= 0.8) adults[personName(r, s, pid)] = true;
    else if (a.choice === "minor" && choiceP(a) >= 0.5) adults[personName(r, s, pid)] = false;
  }
  if (Object.keys(adults).length) read.adults = adults;
  return { read, needPlace, newPeople };
}
