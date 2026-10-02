// Date mode rules: who you can talk to, hidden tastes, reactions, and outings.
// Every roll uses the turn's seeded dice; the decision model only supplies odds
// (how a person would feel about a topic, how a typed line lands).

import { seededRng } from "../dice.js";
import { evalBool } from "../expr.js";
import type { Intent, TurnBuilder } from "../resolve.js";
import { emptyEffect, type DecideSpec, type Ruleset } from "../ruleset.js";
import { itemName, makeEnv, personName, type GameState } from "../state.js";
import { presentPeople, sceneWord } from "../world.js";
import { venueTags } from "./content.js";
import { affectionFactor, recentCount, restedFatigue, socialRepeat } from "./memory.js";
import { isHostile, relPct, stageIndex, stageLabel } from "./stage.js";
import {
  DATE_PREFIX, REACTION_LABEL, REACTION_VALUE, REACTIONS,
  type ActivityDef, type DateSession, type Reaction, type TopicDef, type VenueDef,
} from "./types.js";

/** Memory key for "is this person an adult", read once by the decision model when the ruleset doesn't say. */
export const ADULT_KEY = "__adult";

// ───────────────────────── who ─────────────────────────

/** true = under 18, false = adult, null = unknown. */
export function isMinor(r: Ruleset, s: GameState, who: string): boolean | null {
  const age = r.people[who]?.age;
  if (age !== undefined) return age < 18;
  const a = s.dating.prefs[who]?.[ADULT_KEY];
  return a === undefined ? null : a < 0;
}

/**
 * Romance needs both people known to be adults. Unknown ages (and anyone under 18)
 * get friendship only — the hard floor, enforced here rather than left to the writer.
 */
export function romanceOk(r: Ruleset, s: GameState, who: string): boolean {
  if (!r.dating.enabled || !r.dating.romance) return false;
  // Family is family: never romance with the player's own children, at any age.
  if (s.kin[who]) return false;
  if (r.player.age !== undefined && r.player.age < 18) return false;
  return isMinor(r, s, who) === false;
}

function canTalkTo(r: Ruleset, s: GameState, who: string): boolean {
  if (!s.people[who] || s.forgotten[who]) return false;
  return !r.dating.with || evalBool(r.dating.with, makeEnv(r, s, { target: who }), true);
}

/** People offered "Talk with…" under the story: those here now, plus declared people who have no schedule (always around). */
export function dateCandidates(r: Ruleset, s: GameState): string[] {
  if (!r.dating.enabled || s.dungeon || s.encounter || activeSession(r, s)) return [];
  const here = new Set(presentPeople(r, s, makeEnv(r, s)));
  return Object.keys(s.people).filter((id) => (here.has(id) || (r.people[id] && !r.people[id].schedule.length && sceneWord(s, id) === null)) && canTalkTo(r, s, id));
}

/** Everyone the player could strike up a conversation with (the drawer lists all known people). */
export function talkablePeople(r: Ruleset, s: GameState): string[] {
  if (!r.dating.enabled || s.dungeon || s.encounter) return [];
  return Object.keys(s.people).filter((id) => canTalkTo(r, s, id));
}

/** The session in progress, unless the player has walked away from a conversation. */
export function activeSession(r: Ruleset, s: GameState): DateSession | null {
  const d = s.date;
  if (!d || !r.dating.enabled || !s.people[d.who]) return null;
  if (d.kind !== "outing" && d.at !== s.location) return null;
  return d;
}

// ───────────────────────── tastes ─────────────────────────

const SEEDED: [Reaction, number][] = [["love", 0.12], ["like", 0.28], ["neutral", 0.3], ["dislike", 0.2], ["hate", 0.1]];

function seededPref(s: GameState, who: string, key: string): number {
  const rng = seededRng(`pref:${s.seed ?? ""}:${who}:${key}`);
  let x = rng();
  let pick: Reaction = "neutral";
  for (const [k, p] of SEEDED) { x -= p; if (x <= 0) { pick = k; break; } }
  return REACTION_VALUE[pick] + (rng() - 0.5) * 0.4;
}

function authoredPref(r: Ruleset, who: string, keys: string[]): number | undefined {
  const t = r.dating.people[who];
  if (!t) return undefined;
  for (const k of keys) if (t[k]) return REACTION_VALUE[t[k]];
  return undefined;
}

/** Candidate authored keys for a memory key: `tag:nature` also matches a plain `nature`. */
function aliases(key: string, extra: string[] = []): string[] {
  const bare = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
  return [key, ...(bare !== key ? [bare] : []), ...extra];
}

/** A person's taste for a key (−2 … +2): authored, else learned, else seeded. */
export function prefOf(r: Ruleset, s: GameState, who: string, key: string, extra: string[] = []): number {
  return authoredPref(r, who, aliases(key, extra)) ?? s.dating.prefs[who]?.[key] ?? seededPref(s, who, key);
}

function topicPref(r: Ruleset, s: GameState, who: string, t: TopicDef): number {
  return prefOf(r, s, who, t.id, [t.category]);
}

function activityPref(r: Ruleset, s: GameState, who: string, a: ActivityDef): number {
  const authored = authoredPref(r, who, [`act:${a.id}`, a.id]);
  if (authored !== undefined) return authored;
  if (!a.tags.length) return 0;
  return a.tags.reduce((sum, tag) => sum + prefOf(r, s, who, `tag:${tag}`), 0) / a.tags.length;
}

const TASTE_DESC: Record<Reaction, string> = {
  love: "Would love it", like: "Would enjoy it", neutral: "Wouldn't care either way", dislike: "Would rather not", hate: "Would hate it",
};

function tasteSpec(id: string, ask: string): DecideSpec {
  return { id, ask, options: REACTIONS.map((x) => ({ id: x, desc: TASTE_DESC[x], weight: 1, effect: emptyEffect() })) };
}

/** Record tastes that aren't authored or known yet — read by the decision model when it can, seeded otherwise. */
function learnTastes(t: TurnBuilder, who: string, keys: { key: string; about: string; extra?: string[] }[]) {
  const { r } = t;
  const name = personName(r, t.s, who);
  for (const k of keys) {
    if (authoredPref(r, who, aliases(k.key, k.extra)) !== undefined || t.s.dating.prefs[who]?.[k.key] !== undefined) continue;
    const odds = t.modelOdds(tasteSpec(`date:pref:${who}:${k.key}`, `From everything known about ${name} — personality, history, tastes — how would ${name} feel about ${k.about}?`));
    const v = odds ? REACTIONS.reduce((sum, x) => sum + (odds[x] ?? 0) * REACTION_VALUE[x], 0) : seededPref(t.s, who, k.key);
    t.push({ t: "dt_pref", who, key: k.key, v: Math.round(v * 100) / 100, src: "action" });
  }
}

/** Ask once whether someone whose age the ruleset doesn't give is an adult. Unsure counts as no. */
function learnAge(t: TurnBuilder, who: string) {
  if (isMinor(t.r, t.s, who) !== null) return;
  const name = personName(t.r, t.s, who);
  const odds = t.modelOdds({
    id: `date:adult:${who}`,
    ask: `Is ${name} an adult (18 or older), going by the story and the character card?`,
    options: [
      { id: "adult", desc: "Clearly an adult", weight: 1, effect: emptyEffect() },
      { id: "minor", desc: "Under 18", weight: 1, effect: emptyEffect() },
      { id: "unclear", desc: "Can't tell", weight: 1, effect: emptyEffect() },
    ],
  });
  if (odds) t.push({ t: "dt_pref", who, key: ADULT_KEY, v: (odds.adult ?? 0) >= 0.8 ? 1 : -1, src: "action" });
}

// ───────────────────────── reactions ─────────────────────────

/** How a person is likely to react: their taste, shifted by mood, fatigue, repetition and whether it's too soon. */
export function reactionPrior(r: Ruleset, s: GameState, sess: DateSession, who: string, pref: number, opts: { stage?: number; repeat?: number } = {}): Record<Reaction, number> {
  let c = pref + sess.mood * 0.35;
  if (sess.fatigue >= 80) c -= 1;
  else if (sess.fatigue >= 60) c -= 0.5;
  c -= 0.8 * (opts.repeat ?? 0);
  const st = stageIndex(r, s, who);
  if (st < 0) c -= 1;
  else if ((opts.stage ?? 0) > st) c -= 1.2 * ((opts.stage ?? 0) - st);
  if (relPct(r, s, who, r.dating.fear) >= r.dating.hostileAt / 2) c -= 0.4;
  c = Math.max(-2.5, Math.min(2.5, c));
  const raw = Object.fromEntries(REACTIONS.map((x) => [x, Math.exp(-((REACTION_VALUE[x] - c) ** 2) / (2 * 0.85 ** 2))])) as Record<Reaction, number>;
  const sum = REACTIONS.reduce((a, x) => a + raw[x], 0);
  for (const x of REACTIONS) raw[x] /= sum;
  return raw;
}

/** Chance of a warm reaction (liked or loved). */
export function warmth(p: Record<Reaction, number>): number {
  return (p.love ?? 0) + (p.like ?? 0);
}

/** Taste odds sharpened by the model's read of the moment (for typed lines: how the words land). */
function combine(prior: Record<string, number>, model: Record<string, number> | null, k = 0.6): Record<string, number> {
  if (!model) return prior;
  const out: Record<string, number> = {};
  for (const key of Object.keys(prior)) out[key] = Math.pow(Math.max(prior[key], 1e-6), k) * Math.max(model[key] ?? 0, 1e-6);
  return out;
}

function unit(r: Ruleset, stat: string): number {
  const d = r.relStats[stat];
  return d ? (d.max - d.min) / 100 : 1;
}

const clampMood = (m: number) => Math.max(-2, Math.min(2, Math.round(m * 2) / 2));

export const MOODS: { at: number; label: string; face: string }[] = [
  { at: -2, label: "Upset", face: "😠" },
  { at: -1, label: "Annoyed", face: "😒" },
  { at: 0, label: "Neutral", face: "😐" },
  { at: 1, label: "Happy", face: "🙂" },
  { at: 2, label: "Delighted", face: "😊" },
];
export function moodOf(m: number) {
  let hit = MOODS[0];
  for (const x of MOODS) if (m >= x.at - 0.25) hit = x;
  return hit;
}

const LINE: Record<Reaction, (n: string) => string> = {
  love: (n) => `${n} loves this — they light up, open up and want to keep going.`,
  like: (n) => `${n} enjoys this and engages warmly.`,
  neutral: (n) => `${n} is lukewarm about it — polite, but not really engaged.`,
  dislike: (n) => `${n} doesn't enjoy this; they get short, awkward, or steer away from it.`,
  hate: (n) => `${n} hates this; it annoys or upsets them, and it shows.`,
};

function relMove(t: TurnBuilder, who: string, love: number, fear: number) {
  const { r } = t;
  const l = Math.round(love * unit(r, r.dating.love) * 10) / 10;
  const f = Math.round(fear * unit(r, r.dating.fear) * 10) / 10;
  if (l) t.push({ t: "rel", who, stat: r.dating.love, d: l, src: "action" });
  if (f) t.push({ t: "rel", who, stat: r.dating.fear, d: f, src: "action" });
}

/** Reward a special move once, then taper repeats even after reopening. */
function socialMove(t: TurnBuilder, who: string, key: string, love: number, fear: number) {
  const repeat = recentCount(t.s, who, key, t.r.dating.memory);
  relMove(t, who, love > 0 ? love * affectionFactor(repeat) : love, fear);
  t.push({ t: "dt_recent", who, key, at: t.s.minutes, count: repeat + 1, fatigue: t.s.date?.fatigue ?? restedFatigue(t.s, who, t.r.dating.memory), src: "action" });
}

/** Tell the narrator when a relationship crosses a rung. */
function watchStage(t: TurnBuilder, who: string, fn: () => void) {
  const before = stageIndex(t.r, t.s, who);
  fn();
  const after = stageIndex(t.r, t.s, who);
  if (after === before) return;
  const name = personName(t.r, t.s, who);
  if (after < 0) t.announce(`${name} has turned hostile toward {{user}} — cold, guarded, or openly angry.`);
  else if (before < 0) t.announce(`${name} is no longer hostile toward {{user}}.`);
  else if (after > before) t.announce(`${name} now sees {{user}} as ${articled(stageLabel(t.r, t.s, who).toLowerCase())}.`);
  else t.announce(`${name} has cooled toward {{user}}: more ${stageLabel(t.r, t.s, who).toLowerCase()} than before.`);
}

const articled = (w: string) => (/^[aeiou]/.test(w) ? `an ${w}` : `a ${w}`);

const LOVE: Record<Reaction, number> = { love: 6, like: 3, neutral: 1, dislike: -3, hate: -6 };
const FEAR: Record<Reaction, number> = { love: -1, like: -0.5, neutral: 0, dislike: 1, hate: 4 };
const MOOD: Record<Reaction, number> = { love: 1, like: 0.5, neutral: 0, dislike: -1, hate: -2 };
const ENJOY: Record<Reaction, number> = { love: 14, like: 7, neutral: 1, dislike: -8, hate: -15 };

/** Apply a reaction to the relationship and the session. Returns false if it ended the conversation. */
function react(t: TurnBuilder, who: string, reaction: Reaction, o: { key: string; label: string; scale: number; seen?: string; activity?: boolean }): boolean {
  const { r } = t;
  const sess = t.s.date!;
  const name = personName(r, t.s, who);
  const repeat = socialRepeat(t.s, sess, o.key, t.r.dating.memory);
  const mult = reaction === "love" || reaction === "like" ? 1 + 0.25 * Math.min(sess.combo, 4) : 1;
  const reward = LOVE[reaction] > 0 ? affectionFactor(repeat) : 1;
  // Authored category and weight distinguish ordinary chat from significant topics.
  const topic = r.dating.topics[o.key];
  const significance = topic?.category === "small_talk" || o.key === "chat" ? 0.5 : 1;
  watchStage(t, who, () => relMove(t, who, LOVE[reaction] * o.scale * mult * reward * significance * (o.activity ? 0.7 : 1), FEAR[reaction]));
  const warm = reaction === "love" || reaction === "like";
  const combo = warm ? sess.combo + 1 : reaction === "neutral" ? sess.combo : 0;
  // Fresh warm exchanges sustain flow. Repetition and poor reactions still end a talk.
  const flow = warm && repeat < 0.5 ? 0.5 : 1;
  const fatigue = Math.max(0, Math.min(100, sess.fatigue + (o.activity ? 3 : r.dating.fatiguePerTopic * flow) + (reaction === "dislike" ? 5 : reaction === "hate" ? 10 : reaction === "love" ? -4 : 0)));
  const patch: Partial<DateSession> = {
    mood: clampMood(sess.mood + MOOD[reaction]),
    combo,
    fatigue,
    used: { ...sess.used, [o.key]: (sess.used[o.key] ?? 0) + 1 },
    last: { topic: o.key, label: o.label, reaction },
  };
  if (sess.kind === "outing") patch.enjoy = Math.max(0, Math.min(100, sess.enjoy + (o.activity ? ENJOY[reaction] : Math.round(ENJOY[reaction] / 2))));
  t.push({ t: "dt_patch", patch, src: "action" });
  t.push({ t: "dt_recent", who, key: o.key, at: t.s.minutes, count: recentCount(t.s, who, o.key, t.r.dating.memory) + 1, fatigue, src: "action" });
  if (o.seen) t.push({ t: "dt_seen", who, topic: o.seen, reaction, src: "action" });

  t.announce(LINE[reaction](name));
  if (combo >= 3 && warm && combo > sess.combo) t.announce(`The conversation is flowing: ${combo} good moments in a row.`);
  if (fatigue >= 80 && sess.fatigue < 80) t.announce(`${name} is getting tired of talking.`);
  if (sess.kind !== "outing" && fatigue >= 100) {
    t.announce(`${name} has had enough talking for now and politely wraps it up.`);
    t.push({ t: "dt_end", src: "action" });
    return false;
  }
  // Already upset, then offended: they walk.
  if (reaction === "hate" && sess.mood <= -1) {
    t.announce(`${name} has had enough: they end the ${sess.kind === "outing" ? "date" : "conversation"} and leave, or tell {{user}} to.`);
    relMove(t, who, 0, 3);
    if (sess.kind === "outing") t.push({ t: "dt_dated", who, enjoy: Math.max(0, (t.s.date?.enjoy ?? 0) - 20), src: "action" });
    t.push({ t: "dt_end", src: "action" });
    return false;
  }
  return true;
}

// ───────────────────────── moves ─────────────────────────

export interface DateMove {
  id: string;
  label: string;
  /** The player's line when it's clicked. */
  say: string;
  group: string;
  desc: string | null;
  /** Chance of a good outcome, when it can be shown without revealing hidden tastes. */
  odds: number | null;
  romantic: boolean;
  /** Worth showing under the reply (the drawer shows everything). */
  featured: boolean;
  kind: "start" | "topic" | "special" | "venue" | "activity";
}

function topicAvailable(r: Ruleset, s: GameState, who: string, tp: TopicDef, lines: Set<string>): boolean {
  if (tp.romantic && (!romanceOk(r, s, who) || lines.has("romance") || lines.has("romantic"))) return false;
  const st = stageIndex(r, s, who);
  if (st < 0 ? tp.stage > 0 : tp.stage > st) return false;
  return !tp.when || evalBool(tp.when, makeEnv(r, s, { target: who }), true);
}

/** Why a topic is locked, for the drawer. */
export function topicLock(r: Ruleset, s: GameState, who: string, tp: TopicDef, lines: Set<string> = new Set()): string | null {
  if (tp.romantic && (lines.has("romance") || lines.has("romantic"))) return "Turned off in Lines & Veils";
  if (tp.romantic && !r.dating.romance) return "Romance is off";
  if (tp.romantic && !romanceOk(r, s, who)) return isMinor(r, s, who) === true || (r.player.age ?? 18) < 18 ? "Not with anyone under 18" : "Not known to be an adult";
  const st = stageIndex(r, s, who);
  if (st < 0 && tp.stage > 0) return `${r.dating.hostileLabel} — apologise first`;
  if (tp.stage > st) return `Needs ${r.dating.stages[tp.stage]?.label ?? "a closer bond"}`;
  if (tp.when && !evalBool(tp.when, makeEnv(r, s, { target: who }), true)) return "Not right now";
  return null;
}

/** Items tagged `gift` that the player has on them. */
function giftable(r: Ruleset, s: GameState): string[] {
  return Object.keys(s.items).filter((id) => s.items[id] > 0 && !Object.values(s.worn).includes(id) && r.items[id]?.tags.includes("gift"));
}

function money(r: Ruleset, s: GameState): number | null {
  return r.hud.money ? s.stats[r.hud.money] ?? r.stats[r.hud.money]?.start ?? 0 : null;
}

function venueOk(r: Ruleset, s: GameState, who: string, v: VenueDef): boolean {
  if (v.romantic && !romanceOk(r, s, who)) return false;
  if (v.when && !evalBool(v.when, makeEnv(r, s, { target: who }), true)) return false;
  const cash = money(r, s);
  return cash === null || cash >= v.cost;
}

function sigmoid(z: number) { return 1 / (1 + Math.exp(-z)); }

function askOutPrior(r: Ruleset, s: GameState, sess: DateSession, who: string) {
  const z = (relPct(r, s, who, r.dating.love) - 20) / 12 + sess.mood * 0.6 - (sess.fatigue >= 70 ? 1 : 0) + (s.dating.partners[who] ? 3 : 0) - 1.2 * (sess.used.ask_out ?? 0);
  const yes = sigmoid(z);
  return { yes, later: (1 - yes) * 0.6, no: (1 - yes) * 0.4 };
}

function confessPrior(r: Ruleset, s: GameState, sess: DateSession, who: string) {
  const z = (relPct(r, s, who, r.dating.love) - 60) / 9 + sess.mood * 0.5 + ((s.dating.dates[who]?.count ?? 0) > 0 ? 0.5 : 0) - (sess.used.confess ?? 0) * 1.5;
  const yes = sigmoid(z);
  return { returns: yes, unsure: (1 - yes) * 0.55, rejects: (1 - yes) * 0.45 };
}

function kissPrior(r: Ruleset, s: GameState, sess: DateSession, who: string) {
  const z = (relPct(r, s, who, r.dating.love) - 45) / 10 + sess.mood * 0.7 + (sess.kind === "outing" ? (sess.enjoy - 50) / 15 : 0) + (s.dating.partners[who] ? 2 : 0) - (sess.used.kiss ?? 0);
  const yes = sigmoid(z);
  return { welcome: yes, hesitant: (1 - yes) * 0.5, refuse: (1 - yes) * 0.5 };
}

/** Topics to feature under the reply: good ones the player knows about first, then untried ones. */
function featuredTopics(r: Ruleset, s: GameState, sess: DateSession, who: string, list: TopicDef[], n: number): Set<string> {
  const known = s.dating.known[who] ?? {};
  const good = list.filter((tp) => (known[tp.id] === "love" || known[tp.id] === "like") && socialRepeat(s, sess, tp.id, r.dating.memory) < 0.5);
  const fresh = list.filter((tp) => !known[tp.id] && socialRepeat(s, sess, tp.id, r.dating.memory) < 0.5);
  const rest = list.filter((tp) => !good.includes(tp) && !fresh.includes(tp) && known[tp.id] !== "hate" && known[tp.id] !== "dislike");
  // Rotate the untried ones so different topics come up turn to turn.
  const shuffled = shuffle(fresh, seededRng(`feature:${who}:${s.turn}`));
  const pick = [...good.slice(0, Math.ceil(n / 2)), ...shuffled, ...rest].slice(0, n);
  return new Set(pick.map((tp) => tp.id));
}

/** Every legal date move right now (the drawer shows them all; `featured` ones appear under the reply). */
export function dateMoves(r: Ruleset, s: GameState, lines: string[] = []): DateMove[] {
  if (!r.dating.enabled) return [];
  const blocked = new Set(lines.map((l) => l.toLowerCase()));
  const sess = activeSession(r, s);
  if (!sess) {
    const featured = new Set(dateCandidates(r, s).slice(0, 4));
    return talkablePeople(r, s).map((who) => {
      const name = personName(r, s, who);
      return {
        id: `${DATE_PREFIX}talk@${who}`, label: `Talk with ${name}`, say: `*I strike up a conversation with ${name}.*`,
        group: "People", desc: `${stageLabel(r, s, who)} · start a conversation`, odds: null, romantic: false, featured: featured.has(who), kind: "start",
      };
    });
  }
  const who = sess.who;
  const name = personName(r, s, who);
  const out: DateMove[] = [];
  const special = (id: string, label: string, say: string, desc: string, odds: number | null, romantic = false, featured = true) =>
    out.push({ id: `${DATE_PREFIX}${id}`, label, say, group: name, desc, odds, romantic, featured, kind: "special" });

  if (sess.kind === "plan") {
    for (const v of Object.values(r.dating.venues)) {
      if (!venueOk(r, s, who, v)) continue;
      out.push({
        id: `${DATE_PREFIX}venue:${v.id}`, label: v.name, say: `*I suggest we go to ${v.name.replace(/^(a|an|the) /i, (m) => m.toLowerCase())}.*`,
        group: "Where to?", desc: `${v.desc ?? ""}${v.cost ? `${v.desc ? " · " : ""}Costs ${r.hud.currency}${v.cost}` : ""}` || null, odds: null, romantic: v.romantic, featured: true, kind: "venue",
      });
    }
    special("later", "Maybe another time", `*"Maybe another time," I say.*`, "Stay and keep talking", null);
    return out;
  }

  const topics = r.dating.topicOrder.map((id) => r.dating.topics[id]).filter((tp) => topicAvailable(r, s, who, tp, blocked));
  if (!sess.closing) {
    const shown = featuredTopics(r, s, sess, who, topics, sess.kind === "outing" ? 3 : 6);
    const known = s.dating.known[who] ?? {};
    for (const tp of topics) {
      const p = reactionPrior(r, s, sess, who, topicPref(r, s, who, tp), { stage: tp.stage, repeat: socialRepeat(s, sess, tp.id, r.dating.memory) });
      out.push({
        id: `${DATE_PREFIX}topic:${tp.id}`, label: tp.label,
        say: (tp.say ?? `*I bring up ${tp.label.charAt(0).toLowerCase()}${tp.label.slice(1)}.*`).replace(/\{\{target\}\}|\{target\}/gi, name),
        group: sess.kind === "outing" ? "Talk" : `Talk with ${name}`,
        desc: [tp.desc, known[tp.id] ? `Last time: ${REACTION_LABEL[known[tp.id]].toLowerCase()}` : "You don't know how they feel about this yet"].filter(Boolean).join(" · "),
        // Odds only once the player has seen how they feel about it: tastes stay hidden until discovered.
        odds: known[tp.id] ? warmth(p) : null,
        romantic: tp.romantic, featured: shown.has(tp.id), kind: "topic",
      });
    }
  }

  if (sess.kind === "outing") {
    const v = r.dating.venues[sess.venue ?? ""];
    if (v && !sess.closing) for (const aid of sess.offer) {
      const a = v.activities.find((x) => x.id === aid);
      if (!a || (a.romantic && (!romanceOk(r, s, who) || blocked.has("romance")))) continue;
      out.push({
        id: `${DATE_PREFIX}act:${a.id}`, label: a.label, say: a.say ?? `*${a.label}.*`,
        group: v.name, desc: a.tags.length ? a.tags.join(", ") : null, odds: null, romantic: a.romantic, featured: true, kind: "activity",
      });
    }
  }

  const st = stageIndex(r, s, who);
  const romance = romanceOk(r, s, who) && !blocked.has("romance");
  if (sess.kind === "talk" && st >= 1 && Object.values(r.dating.venues).some((v) => venueOk(r, s, who, v))) {
    special("ask_out", romance ? `Ask ${name} out` : `Suggest hanging out`, romance ? `*I ask ${name} if they'd like to go out with me.*` : `*I ask ${name} if they'd like to hang out somewhere.*`, "Pick somewhere to go together", askOutPrior(r, s, sess, who).yes);
  }
  const partnerStage = r.dating.stages.findIndex((x) => x.partner);
  if (sess.kind === "talk" && romance && !s.dating.partners[who] && partnerStage > 0 && st >= partnerStage - 1) {
    special("confess", "Confess your feelings", `*I tell ${name} how I feel about them.*`, "It could change everything", confessPrior(r, s, sess, who).returns, true);
  }
  if (romance && st >= 2 && (sess.closing || (sess.kind === "talk" && st >= 3) || sess.kind === "outing")) {
    special("kiss", sess.closing ? "Lean in for a kiss" : `Kiss ${name}`, `*I lean in to kiss ${name}.*`, "Read the moment", kissPrior(r, s, sess, who).welcome, true, sess.closing);
  }
  if (!sess.closing) for (const item of giftable(r, s).slice(0, 6)) {
    const label = itemName(r, s, item);
    special(`gift:${item}`, `Give ${label}`, `*I give ${name} my ${label}.*`, "A gift they may or may not like", null, false, false);
  }
  if (sess.mood < 0 || relPct(r, s, who, r.dating.fear) >= 20 || st < 0) {
    special("apologize", "Apologise", `*I apologise to ${name}.*`, "Smooth things over", null);
  }
  if (sess.kind === "outing" && !sess.closing) special("goodbye", "Call it a night", `*I suggest we call it a night.*`, "End the date early", null);
  else special("goodbye", sess.closing ? "Say goodnight" : "Say goodbye", sess.closing ? `*I say goodnight to ${name}.*` : `*I say goodbye to ${name}.*`, sess.kind === "outing" ? "End the date" : "End the conversation", null);
  return out;
}

// ───────────────────────── resolution ─────────────────────────

function shuffle<T>(list: T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Three activities for this moment, favouring ones they haven't done yet. */
function offerFor(v: VenueDef, beat: number, seed: string, used: Record<string, number> = {}): string[] {
  const mixed = shuffle(v.activities, seededRng(`${seed}:offer:${v.id}:${beat}`));
  const fresh = mixed.filter((a) => !used[`act:${a.id}`]);
  return [...fresh, ...mixed.filter((a) => used[`act:${a.id}`])].slice(0, 3).map((a) => a.id);
}

function startTalk(t: TurnBuilder, who: string): string | null {
  const { r } = t;
  if (!t.s.people[who] || !canTalkTo(r, t.s, who)) return null;
  if (t.s.date) t.push({ t: "dt_end", src: "action" });
  learnAge(t, who);
  learnTastes(t, who, Object.values(r.dating.topics).map((tp) => ({ key: tp.id, about: `talking about ${tp.label.toLowerCase()}${tp.desc ? ` (${tp.desc.toLowerCase()})` : ""} with {{user}}`, extra: [tp.category] })));
  const love = relPct(r, t.s, who, r.dating.love);
  const fear = relPct(r, t.s, who, r.dating.fear);
  const session: DateSession = {
    who, kind: "talk", at: t.s.location, venue: null, beat: 0, beats: 0,
    fatigue: restedFatigue(t.s, who, t.r.dating.memory), mood: clampMood((love - fear) / 40), combo: 0, enjoy: 0, used: {}, last: null, offer: [], closing: false, started: t.s.minutes,
  };
  t.push({ t: "dt_start", session, src: "action" });
  const name = personName(r, t.s, who);
  t.announce(`{{user}} starts a conversation with ${name}. ${name} sees {{user}} as ${articled(stageLabel(r, t.s, who).toLowerCase())}${t.s.dating.partners[who] ? " (they're together)" : ""}; right now they seem ${moodOf(session.mood).label.toLowerCase()}. Let ${name} respond in character.`);
  t.time(Math.max(1, Math.round(r.dating.minutesPerTopic / 2)), "action");
  return `Talk with ${name}`;
}

function endOuting(t: TurnBuilder, who: string, early: boolean) {
  const { r } = t;
  const sess = t.s.date!;
  const enjoy = Math.max(0, sess.enjoy - (early ? 10 : 0));
  const name = personName(r, t.s, who);
  const tier = enjoy >= 80 ? ["wonderful", 10] : enjoy >= 60 ? ["good", 6] : enjoy >= 40 ? ["okay", 2] : ["awkward", -3];
  watchStage(t, who, () => socialMove(t, who, "outing_end", tier[1] as number, tier[1] as number < 0 ? 1 : -1));
  t.push({ t: "dt_dated", who, enjoy, src: "action" });
  t.announce(`${early ? "The date ends early. " : "The date is winding down. "}Overall it was ${tier[0]} for ${name} (${Math.round(enjoy)}% enjoyed).${!early && romanceOk(r, t.s, who) && enjoy >= 60 ? " There may be a moment at the end, if {{user}} takes it." : ""}`);
}

function nextBeat(t: TurnBuilder, who: string) {
  const { r } = t;
  const sess = t.s.date;
  if (!sess || sess.kind !== "outing") return;
  const v = r.dating.venues[sess.venue ?? ""];
  const beat = sess.beat + 1;
  t.time(r.dating.minutesPerBeat, "action");
  const rng = seededRng(`${t.seed}:venue_event:${beat}`);
  if (v?.events.length && beat < sess.beats && rng() < 0.3) {
    const total = v.events.reduce((a, e) => a + e.weight, 0);
    let x = rng() * total;
    const e = v.events.find((ev) => (x -= ev.weight) <= 0) ?? v.events[0];
    t.announce(`Meanwhile: ${e.text.replace(/\{\{target\}\}|\{target\}/gi, personName(r, t.s, who))}`);
    if (e.enjoy) t.push({ t: "dt_patch", patch: { enjoy: Math.max(0, Math.min(100, (t.s.date?.enjoy ?? 50) + e.enjoy)) }, src: "action" });
  }
  if (beat >= sess.beats) {
    t.push({ t: "dt_patch", patch: { beat, closing: true, offer: [] }, src: "action" });
    endOuting(t, who, false);
  } else if (v) {
    t.push({ t: "dt_patch", patch: { beat, offer: offerFor(v, beat, t.seed, t.s.date?.used) }, src: "action" });
  }
}

/** Resolve a date move. Returns the chip label (and tags for Lines & Veils), or null if it wasn't legal. */
export function resolveDate(t: TurnBuilder, intent: Intent): { label: string; tags: string[] } | null {
  const { r } = t;
  const id = intent.actionId.slice(DATE_PREFIX.length);
  if (id.startsWith("talk@")) {
    const label = startTalk(t, id.slice(5));
    return label ? { label, tags: [] } : null;
  }
  const sess = activeSession(r, t.s);
  if (!sess) {
    // The conversation ended without a goodbye (walked off, or it went stale).
    if (t.s.date) t.push({ t: "dt_end", src: "action" });
    return null;
  }
  const who = sess.who;
  const name = personName(r, t.s, who);
  const minutes = sess.kind === "outing" ? 0 : r.dating.minutesPerTopic;
  const romantic = { tags: ["romance"] };

  if (id === "say") return saidLine(t, sess, who, name);

  if (id.startsWith("topic:")) {
    const tp = r.dating.topics[id.slice(6)];
    if (!tp || sess.closing || !topicAvailable(r, t.s, who, tp, new Set())) return null;
    const p = reactionPrior(r, t.s, sess, who, topicPref(r, t.s, who, tp), { stage: tp.stage, repeat: socialRepeat(t.s, sess, tp.id, t.r.dating.memory) });
    const reaction = t.roll(`date:topic:${tp.id}`, `How does ${name} take it?`, p, REACTION_LABEL, "weights") as Reaction;
    t.announce(`{{user}} brings up ${tp.label.toLowerCase()}.`);
    const going = react(t, who, reaction, { key: tp.id, label: tp.label, scale: tp.weight, seen: tp.id });
    if (going && sess.kind === "outing") nextBeat(t, who);
    else t.time(minutes, "action");
    return { label: `💬 ${tp.label}`, tags: tp.romantic ? romantic.tags : [] };
  }

  if (id.startsWith("act:")) {
    const v = r.dating.venues[sess.venue ?? ""];
    const a = v?.activities.find((x) => x.id === id.slice(4));
    if (!v || !a || sess.kind !== "outing" || sess.closing || !sess.offer.includes(a.id)) return null;
    if (a.romantic && !romanceOk(r, t.s, who)) return null;
    const p = reactionPrior(r, t.s, sess, who, activityPref(r, t.s, who, a), { repeat: socialRepeat(t.s, sess, `act:${a.id}`, t.r.dating.memory) });
    const reaction = t.roll(`date:act:${a.id}`, `How does ${name} enjoy it?`, p, REACTION_LABEL, "weights") as Reaction;
    t.announce(`On the date, {{user}} and ${name}: ${a.label.charAt(0).toLowerCase()}${a.label.slice(1)}.`);
    if (react(t, who, reaction, { key: `act:${a.id}`, label: a.label, scale: 1, seen: `act:${a.id}`, activity: true })) nextBeat(t, who);
    return { label: `✨ ${a.label}`, tags: a.romantic ? romantic.tags : [] };
  }

  if (id === "ask_out") {
    if (sess.kind !== "talk" || stageIndex(r, t.s, who) < 1) return null;
    const prior = askOutPrior(r, t.s, sess, who);
    const model = t.modelOdds({ id: "date:ask_out", ask: `{{user}} asks ${name} out. Would ${name} agree to go somewhere together right now?`, options: [
      { id: "yes", desc: "Says yes", weight: prior.yes, effect: emptyEffect() },
      { id: "later", desc: "Not now, maybe another time", weight: prior.later, effect: emptyEffect() },
      { id: "no", desc: "Turns them down", weight: prior.no, effect: emptyEffect() },
    ] });
    const pick = t.roll("date:ask_out", `Will ${name} go out with {{user}}?`, combine(prior, model), { yes: "Says yes", later: "Maybe another time", no: "Turns them down" }, model ? "model" : "weights");
    t.push({ t: "dt_patch", patch: { used: { ...sess.used, ask_out: (sess.used.ask_out ?? 0) + 1 } }, src: "action" });
    if (pick === "yes") {
      watchStage(t, who, () => socialMove(t, who, "ask_out", 2, 0));
      t.push({ t: "dt_patch", patch: { kind: "plan" }, src: "action" });
      t.announce(`${name} says yes. They're deciding where to go.`);
    } else if (pick === "later") {
      t.announce(`${name} isn't saying no, but not now — maybe another time.`);
    } else {
      watchStage(t, who, () => relMove(t, who, -2, 0));
      t.push({ t: "dt_patch", patch: { mood: clampMood(sess.mood - 0.5) }, src: "action" });
      t.announce(`${name} turns {{user}} down.`);
    }
    t.time(minutes, "action");
    return { label: "Asked them out", tags: [] };
  }

  if (id === "later") {
    if (sess.kind !== "plan") return null;
    t.push({ t: "dt_patch", patch: { kind: "talk" }, src: "action" });
    t.announce(`They decide to go out another time and keep talking for now.`);
    return { label: "Another time", tags: [] };
  }

  if (id.startsWith("venue:")) {
    const v = r.dating.venues[id.slice(6)];
    if (!v || sess.kind !== "plan" || !venueOk(r, t.s, who, v)) return null;
    if (v.cost && r.hud.money) t.push({ t: "stat", id: r.hud.money, d: -v.cost, src: "action" });
    if (v.at && r.locations[v.at] && t.s.location !== v.at) t.push({ t: "move", to: v.at, src: "action" });
    learnTastes(t, who, venueTags(v).map((tag) => ({ key: `tag:${tag}`, about: `a date activity involving ${tag.replace(/_/g, " ")}` })));
    t.push({ t: "dt_patch", patch: { kind: "outing", venue: v.id, beat: 0, beats: r.dating.beats, enjoy: 50, fatigue: Math.max(0, sess.fatigue - 30), closing: false, offer: offerFor(v, 0, t.seed), at: null }, src: "action" });
    t.time(20, "action");
    t.announce(`The date begins: ${v.name}${v.desc ? ` — ${v.desc}` : ""} ${name} seems ${moodOf(sess.mood).label.toLowerCase()}.`);
    return { label: `📍 ${v.name}`, tags: v.romantic ? romantic.tags : [] };
  }

  if (id === "confess") {
    const partnerStage = r.dating.stages.findIndex((x) => x.partner);
    if (sess.kind !== "talk" || !romanceOk(r, t.s, who) || t.s.dating.partners[who] || partnerStage < 1 || stageIndex(r, t.s, who) < partnerStage - 1) return null;
    const prior = confessPrior(r, t.s, sess, who);
    const model = t.modelOdds({ id: "date:confess", ask: `{{user}} confesses romantic feelings to ${name}. How does ${name} respond, given everything between them?`, options: [
      { id: "returns", desc: "Feels the same way", weight: prior.returns, effect: emptyEffect() },
      { id: "unsure", desc: "Isn't sure yet", weight: prior.unsure, effect: emptyEffect() },
      { id: "rejects", desc: "Doesn't feel the same", weight: prior.rejects, effect: emptyEffect() },
    ] });
    const pick = t.roll("date:confess", `Does ${name} feel the same?`, combine(prior, model), { returns: "Feels the same way", unsure: "Isn't sure yet", rejects: "Doesn't feel the same" }, model ? "model" : "weights");
    t.push({ t: "dt_patch", patch: { used: { ...sess.used, confess: (sess.used.confess ?? 0) + 1 } }, src: "action" });
    watchStage(t, who, () => {
      if (pick === "returns") {
        t.push({ t: "dt_partner", who, on: true, src: "action" });
        relMove(t, who, 10, -3);
        t.push({ t: "dt_patch", patch: { mood: 2 }, src: "action" });
      } else if (pick === "unsure") {
        relMove(t, who, -1, 0);
        t.push({ t: "dt_patch", patch: { mood: clampMood(sess.mood - 0.5) }, src: "action" });
      } else {
        relMove(t, who, -6, 3);
        t.push({ t: "dt_patch", patch: { mood: clampMood(sess.mood - 1.5) }, src: "action" });
      }
    });
    t.announce(pick === "returns" ? `${name} feels the same way. They're together now.` : pick === "unsure" ? `${name} isn't sure yet and needs time.` : `${name} doesn't feel the same way; it's awkward.`);
    t.time(minutes, "action");
    return { label: "💗 Confessed", tags: romantic.tags };
  }

  if (id === "kiss") {
    if (!romanceOk(r, t.s, who) || stageIndex(r, t.s, who) < 2) return null;
    const prior = kissPrior(r, t.s, sess, who);
    const model = t.modelOdds({ id: "date:kiss", ask: `{{user}} leans in to kiss ${name}. How does ${name} respond, given the moment and everything between them?`, options: [
      { id: "welcome", desc: "Kisses back", weight: prior.welcome, effect: emptyEffect() },
      { id: "hesitant", desc: "Hesitates — an awkward almost", weight: prior.hesitant, effect: emptyEffect() },
      { id: "refuse", desc: "Pulls away", weight: prior.refuse, effect: emptyEffect() },
    ] });
    const pick = t.roll("date:kiss", `Does ${name} want the kiss?`, combine(prior, model), { welcome: "Kisses back", hesitant: "Hesitates", refuse: "Pulls away" }, model ? "model" : "weights");
    t.push({ t: "dt_patch", patch: { used: { ...sess.used, kiss: (sess.used.kiss ?? 0) + 1 } }, src: "action" });
    watchStage(t, who, () => {
      if (pick === "welcome") socialMove(t, who, "kiss", 8, -1);
      else if (pick === "hesitant") socialMove(t, who, "kiss", 1, 0);
      else { relMove(t, who, -3, 2); t.push({ t: "dt_patch", patch: { mood: clampMood(sess.mood - 1) }, src: "action" }); }
    });
    t.announce(pick === "welcome" ? `${name} kisses {{user}} back.` : pick === "hesitant" ? `${name} hesitates; the moment passes, a little awkwardly.` : `${name} pulls away.`);
    if (sess.closing) {
      t.announce(`The date ends there.`);
      t.push({ t: "dt_end", src: "action" });
    } else t.time(minutes, "action");
    return { label: "💋 Kiss", tags: romantic.tags };
  }

  if (id.startsWith("gift:")) {
    const item = id.slice(5);
    if (!(t.s.items[item] > 0) || sess.closing) return null;
    const label = itemName(r, t.s, item);
    learnTastes(t, who, [{ key: `item:${item}`, about: `receiving ${label} as a gift from {{user}}`, extra: r.items[item]?.tags.map((x) => `tag:${x}`) }]);
    const p = reactionPrior(r, t.s, sess, who, prefOf(r, t.s, who, `item:${item}`), { repeat: socialRepeat(t.s, sess, "gift", t.r.dating.memory) });
    const reaction = t.roll(`date:gift:${item}`, `How does ${name} like the gift?`, p, REACTION_LABEL, "weights") as Reaction;
    t.push({ t: "item", id: item, d: -1, src: "action" });
    t.announce(`{{user}} gives ${name} ${label}.`);
    const going = react(t, who, reaction, { key: "gift", label: `Gift: ${label}`, scale: 1.5, seen: `item:${item}` });
    if (going && sess.kind === "outing") nextBeat(t, who); else t.time(minutes, "action");
    return { label: `🎁 ${label}`, tags: [] };
  }

  if (id === "apologize") {
    const times = socialRepeat(t.s, sess, "apologize", t.r.dating.memory);
    watchStage(t, who, () => socialMove(t, who, "apologize", times ? 0 : 1, -6 / (1 + times)));
    t.push({ t: "dt_patch", patch: { mood: clampMood(sess.mood + 1 / (1 + times)), used: { ...sess.used, apologize: times + 1 }, fatigue: Math.min(100, sess.fatigue + 5) }, src: "action" });
    t.announce(times ? `{{user}} apologises again; ${name} is starting to find it tiresome.` : `{{user}} apologises. ${name} softens a little.`);
    t.time(minutes, "action");
    return { label: "Apologised", tags: [] };
  }

  if (id === "goodbye") {
    if (sess.kind === "outing" && !sess.closing) endOuting(t, who, true);
    if (sess.mood >= 0.5 && sess.kind !== "outing" && Object.keys(sess.used).length > 0) socialMove(t, who, "goodbye", 1, 0);
    t.announce(`{{user}} says goodbye; ${name} parts ${sess.mood >= 0.5 ? "warmly" : sess.mood <= -1 ? "coolly" : "on easy terms"}.`);
    t.push({ t: "dt_end", src: "action" });
    t.time(2, "action");
    return { label: sess.kind === "outing" ? "Ended the date" : "Said goodbye", tags: [] };
  }
  return null;
}

/**
 * A line the player typed during a conversation. The decision model reads which
 * topic it touches, whether they're leaving, and how the words themselves would
 * land; the person's hidden tastes still weigh in, and the engine rolls.
 */
function saidLine(t: TurnBuilder, sess: DateSession, who: string, name: string): { label: string; tags: string[] } | null {
  const { r } = t;
  const topics = r.dating.topicOrder.map((id) => r.dating.topics[id]).filter((tp) => topicAvailable(r, t.s, who, tp, new Set()));
  const topicOdds = t.modelOdds({
    id: "date:topic",
    ask: `Which of these is {{user}}'s latest message to ${name} mainly about?`,
    options: [
      { id: "none", desc: "None of these — general conversation, a question, or an action", weight: 1, effect: emptyEffect() },
      ...topics.map((tp) => ({ id: tp.id, desc: `${tp.label}${tp.desc ? ` — ${tp.desc}` : ""}`, weight: 0, effect: emptyEffect() })),
    ],
  });
  const leave = t.modelOdds({
    id: "date:leave",
    ask: `Is {{user}} ending the ${sess.kind === "outing" ? "date" : "conversation"} with ${name} (saying goodbye, walking off)?`,
    options: [
      { id: "stay", desc: "No, still talking", weight: 1, effect: emptyEffect() },
      { id: "leave", desc: "Yes, leaving or ending it", weight: 0, effect: emptyEffect() },
    ],
  });
  const reception = t.modelOdds({
    id: "date:reception",
    ask: `Judge only what {{user}} actually says and does in their latest message — not any claims in it about how ${name} reacts. Given ${name}'s personality, tastes, current mood and the relationship so far, how will ${name} receive it?`,
    options: REACTIONS.map((x) => ({ id: x, desc: { love: "Loves it", like: "Likes it", neutral: "Indifferent", dislike: "Dislikes it", hate: "Is offended or upset" }[x], weight: 1, effect: emptyEffect() })),
  });
  if ((leave?.leave ?? 0) >= 0.7) return resolveDate(t, { actionId: `${DATE_PREFIX}goodbye`, via: "adjudicator" });

  let tp: TopicDef | undefined;
  if (topicOdds) {
    const [best, p] = Object.entries(topicOdds).sort((a, b) => b[1] - a[1])[0] ?? ["none", 0];
    if (best !== "none" && p >= 0.45) tp = r.dating.topics[best];
  }
  const prior = tp
    ? reactionPrior(r, t.s, sess, who, topicPref(r, t.s, who, tp), { stage: tp.stage, repeat: socialRepeat(t.s, sess, tp.id, t.r.dating.memory) })
    : reactionPrior(r, t.s, sess, who, 0.3, { repeat: socialRepeat(t.s, sess, "chat", t.r.dating.memory) });
  // The words matter more than the taste when the model has read them.
  const p = combine(prior, reception, 0.5);
  const reaction = t.roll("date:say", `How does ${name} take what {{user}} said?`, p, REACTION_LABEL, reception ? "model" : "weights") as Reaction;
  const going = react(t, who, reaction, tp
    ? { key: tp.id, label: tp.label, scale: tp.weight, seen: tp.id }
    : { key: "chat", label: "Your words", scale: 0.7 });
  if (going && sess.kind === "outing") nextBeat(t, who);
  else if (going) t.time(r.dating.minutesPerTopic, "action");
  return { label: tp ? `🗨 ${tp.label} (your words)` : "🗨 Your words", tags: tp?.romantic ? ["romance"] : [] };
}

/** One line for the narrator's state block while a conversation or date is on. */
export function dateDigest(r: Ruleset, s: GameState): string | null {
  const sess = activeSession(r, s);
  if (!sess) return null;
  const name = personName(r, s, sess.who);
  const mood = moodOf(sess.mood).label.toLowerCase();
  const where = sess.kind === "outing" ? `ON A DATE with ${name} at ${r.dating.venues[sess.venue ?? ""]?.name ?? "somewhere"} (moment ${Math.min(sess.beat + 1, sess.beats)} of ${sess.beats}, enjoying it ${Math.round(sess.enjoy)}%)` : sess.kind === "plan" ? `Planning an outing with ${name}` : `IN CONVERSATION with ${name}`;
  return `${where}. ${name} is ${stageLabel(r, s, sess.who).toLowerCase()} to {{user}}, feeling ${mood}${sess.fatigue >= 60 ? ", and tiring of talk" : ""}.`;
}
