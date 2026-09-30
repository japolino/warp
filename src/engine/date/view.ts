// The Dating view in the drawer: people and what you know of them, and the
// conversation or date in progress with every topic and move.

import type { DatePersonView, DateTopicView, DateView } from "../../shared/protocol.js";
import type { Ruleset } from "../ruleset.js";
import { bandFor, itemName, makeEnv, personName, type GameState } from "../state.js";
import { presentPeople } from "../world.js";
import { activeSession, dateMoves, moodOf, prefOf, reactionPrior, romanceOk, talkablePeople, topicLock, warmth } from "./talk.js";
import { isHostile, relPct, stageIndex, stageLabel } from "./stage.js";
import { REACTION_LABEL, type Reaction } from "./types.js";

function personView(r: Ruleset, s: GameState, who: string, here: Set<string>): DatePersonView {
  const known = s.dating.known[who] ?? {};
  const activity = (id: string) => Object.values(r.dating.venues).flatMap((v) => v.activities).find((a) => a.id === id)?.label;
  const label = (key: string) => r.dating.topics[key]?.label
    ?? (key.startsWith("item:") ? `Gift: ${itemName(r, s, key.slice(5))}` : key.startsWith("act:") ? activity(key.slice(4)) ?? key.slice(4).replace(/_/g, " ") : key);
  const by = (x: Reaction[]) => Object.entries(known).filter(([, v]) => x.includes(v)).map(([k]) => label(k));
  const loveDef = r.relStats[r.dating.love];
  const fearDef = r.relStats[r.dating.fear];
  return {
    id: who,
    name: personName(r, s, who),
    here: here.has(who) || (!!r.people[who] && !r.people[who].schedule.length),
    stage: stageLabel(r, s, who),
    stageIndex: stageIndex(r, s, who),
    hostile: isHostile(r, s, who),
    partner: !!s.dating.partners[who],
    love: relPct(r, s, who, r.dating.love) / 100,
    fear: relPct(r, s, who, r.dating.fear) / 100,
    loveText: loveDef ? bandFor(loveDef, s.rel[who]?.[r.dating.love] ?? loveDef.start)?.text ?? null : null,
    fearText: fearDef ? bandFor(fearDef, s.rel[who]?.[r.dating.fear] ?? fearDef.start)?.text ?? null : null,
    dates: s.dating.dates[who]?.count ?? 0,
    loves: by(["love"]),
    likes: by(["like"]),
    dislikes: by(["dislike", "hate"]),
    romance: romanceOk(r, s, who),
  };
}

export function buildDateView(r: Ruleset, s: GameState, lines: string[] = []): DateView | null {
  if (!r.dating.enabled) return null;
  const here = new Set(presentPeople(r, s, makeEnv(r, s)));
  const people = talkablePeople(r, s).map((id) => personView(r, s, id, here))
    .sort((a, b) => Number(b.here) - Number(a.here) || b.love - a.love);
  const sess = activeSession(r, s);
  const stages = r.dating.stages.map((st) => st.label);
  if (!sess) return { session: null, person: null, people, categories: [], moves: [], stages };

  const who = sess.who;
  const blocked = new Set(lines.map((l) => l.toLowerCase()));
  const moves = dateMoves(r, s, lines);
  const offered = new Set(moves.filter((m) => m.kind === "topic").map((m) => m.id.slice("date:topic:".length)));
  const known = s.dating.known[who] ?? {};
  const categories = sess.kind === "plan" || sess.closing ? [] : r.dating.categories.map((c) => ({
    id: c.id, label: c.label, icon: c.icon,
    topics: r.dating.topicOrder.map((id) => r.dating.topics[id]).filter((tp) => tp.category === c.id).map((tp): DateTopicView => {
      const k = known[tp.id] ?? null;
      // Odds only for topics whose reaction the player has already seen.
      const odds = k ? warmth(reactionPrior(r, s, sess, who, prefOf(r, s, who, tp.id, [tp.category]), { stage: tp.stage, repeat: sess.used[tp.id] ?? 0 })) : null;
      return {
        id: tp.id, label: tp.label, desc: tp.desc ?? null,
        known: k, knownLabel: k ? REACTION_LABEL[k] : null,
        used: sess.used[tp.id] ?? 0,
        lock: offered.has(tp.id) ? null : topicLock(r, s, who, tp, blocked) ?? "Not right now",
        odds,
      };
    }),
  })).filter((c) => c.topics.length);
  const mood = moodOf(sess.mood);
  return {
    session: {
      who, name: personName(r, s, who), kind: sess.kind,
      venue: sess.venue ? r.dating.venues[sess.venue]?.name ?? sess.venue : null,
      beat: sess.beat, beats: sess.beats, fatigue: sess.fatigue, mood: sess.mood,
      moodLabel: mood.label, moodFace: mood.face, combo: sess.combo, enjoy: sess.enjoy, closing: sess.closing,
      last: sess.last ? { label: sess.last.label, reaction: sess.last.reaction, text: REACTION_LABEL[sess.last.reaction] } : null,
    },
    person: personView(r, s, who, here),
    people,
    categories,
    moves: moves.filter((m) => m.kind !== "topic").map((m) => ({ id: m.id, label: m.label, desc: m.desc, odds: m.odds, kind: m.kind, group: m.group })),
    stages,
  };
}
