// Date mode: conversations scored topic by topic, and outings.
//
// Each person has hidden tastes (authored, read from the card by the decision
// model, or seeded). Talking about something rolls a reaction from those tastes,
// the person's mood, how tired of talking they are and how often a topic came up;
// a line the player types is also judged on its own words. Reactions move love
// and fear, which set the relationship stage that opens further topics.

export type Reaction = "love" | "like" | "neutral" | "dislike" | "hate";
export const REACTIONS: Reaction[] = ["love", "like", "neutral", "dislike", "hate"];
export const REACTION_VALUE: Record<Reaction, number> = { love: 2, like: 1, neutral: 0, dislike: -1, hate: -2 };
export const REACTION_LABEL: Record<Reaction, string> = { love: "Loved it", like: "Liked it", neutral: "Indifferent", dislike: "Didn't like it", hate: "Hated it" };

export interface CategoryDef { id: string; label: string; icon: string }

/** Something to talk about (or a special move: asking out, confessing, apologising…). */
export interface TopicDef {
  id: string;
  label: string;
  category: string;
  desc?: string;
  /** Lowest relationship stage (index into stages) at which it's offered. */
  stage: number;
  /** Romantic: never offered to or with anyone under 18, or when romance is off. */
  romantic: boolean;
  /** What the player's message says when the topic is clicked. `{target}` is the person. */
  say?: string;
  /** How much a reaction to it moves love (1 = normal). */
  weight: number;
  /** Only offered while this formula holds (`target` is the person). */
  when?: string;
}

export interface StageDef {
  id: string;
  label: string;
  /** Love (0–100 of the love stat's range) needed. */
  at: number;
  /** Reached only by a successful confession, whatever love says. */
  partner: boolean;
}

export interface ActivityDef { id: string; label: string; say?: string; tags: string[]; romantic: boolean }
export interface VenueEventDef { id: string; text: string; weight: number; enjoy: number }
export interface VenueDef {
  id: string;
  name: string;
  desc?: string;
  /** A location the outing moves the player to. */
  at?: string;
  /** Money it costs (taken from the money stat). */
  cost: number;
  when?: string;
  romantic: boolean;
  activities: ActivityDef[];
  events: VenueEventDef[];
}

export interface DatingDef {
  enabled: boolean;
  /** Relationship stats used as love and fear. */
  love: string;
  fear: string;
  stages: StageDef[];
  /** Fear (0–100 of its range) at which someone turns hostile. */
  hostileAt: number;
  hostileLabel: string;
  categories: CategoryDef[];
  topics: Record<string, TopicDef>;
  topicOrder: string[];
  venues: Record<string, VenueDef>;
  /** Authored tastes: person → topic id, category id or activity tag → reaction. */
  people: Record<string, Record<string, Reaction>>;
  /** Who can be talked to (`target` is the person). */
  with?: string;
  minutesPerTopic: number;
  fatiguePerTopic: number;
  /** Moments in an outing before it ends. */
  beats: number;
  minutesPerBeat: number;
  /** Romantic topics, confessions and kisses exist at all. */
  romance: boolean;
  /** Social repetition memory (`dating.memory`). Optional so hand-built defs keep the defaults. */
  memory?: SocialMemoryDef;
}

/** How recent topics and conversational fatigue fade, in game time. */
export interface SocialMemoryDef {
  /** In-game minutes for one recent use of a topic or action to fade. */
  recoveryMinutes: number;
  /** Recent keys kept per person. */
  keys: number;
  /** Fatigue points restored per in-game minute away from a conversation. */
  restPerMinute: number;
}

export const DEFAULT_SOCIAL_MEMORY: SocialMemoryDef = { recoveryMinutes: 240, keys: 64, restPerMinute: 1 };

export type DateKind = "talk" | "plan" | "outing";

export interface DateSession {
  who: string;
  kind: DateKind;
  /** Where a talk takes place; walking away ends it. */
  at: string | null;
  venue: string | null;
  beat: number;
  beats: number;
  /** 0–100: at 100 they want to stop talking. */
  fatigue: number;
  /** −2 (upset) … +2 (delighted). */
  mood: number;
  /** Good reactions in a row. */
  combo: number;
  /** 0–100, outings only. */
  enjoy: number;
  /** Topic → times raised this session. */
  used: Record<string, number>;
  last: { topic: string; label: string; reaction: Reaction } | null;
  /** Activities on offer this moment of an outing. */
  offer: string[];
  /** The outing is over; only a goodbye (or a kiss) is left. */
  closing: boolean;
  started: number;
}

/** Bounded recent topic/action counts and conversational fatigue, using in-game minutes. */
export interface SocialMemory {
  at: number;
  fatigue: number;
  topics: Record<string, { at: number; count: number }>;
}

/** Long-lived dating memory, kept across sessions. */
export interface DatingMemory {
  /** person → key → taste (−2…+2). Keys: topic ids, `tag:<activity tag>`, `item:<item id>`. */
  prefs: Record<string, Record<string, number>>;
  /** person → topic → the reaction the player has seen. */
  known: Record<string, Record<string, Reaction>>;
  /** People the player is together with. */
  partners: Record<string, true>;
  /** Outings per person, and the best enjoyment reached. */
  dates: Record<string, { count: number; best: number }>;
  /** Recent social effort per person. Optional for saves made before repetition memory existed. */
  recent?: Record<string, SocialMemory>;
}

export const DATE_PREFIX = "date:";
