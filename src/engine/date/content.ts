// Built-in topics, stages and outings. A ruleset's `dating:` section merges over these.

import type { CategoryDef, StageDef, TopicDef, VenueDef } from "./types.js";

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { id: "small_talk", label: "Small talk", icon: "💬" },
  { id: "interests", label: "Interests", icon: "🎨" },
  { id: "personal", label: "Personal", icon: "🫂" },
  { id: "charm", label: "Charm", icon: "✨" },
  { id: "romance", label: "Romance", icon: "💗" },
];

export const DEFAULT_STAGES: StageDef[] = [
  { id: "stranger", label: "Stranger", at: 0, partner: false },
  { id: "acquaintance", label: "Acquaintance", at: 10, partner: false },
  { id: "friend", label: "Friend", at: 30, partner: false },
  { id: "close", label: "Close", at: 55, partner: false },
  { id: "partner", label: "Partner", at: 80, partner: true },
];

type T = Omit<TopicDef, "id" | "weight" | "romantic" | "stage"> & Partial<Pick<TopicDef, "weight" | "romantic" | "stage">>;

const TOPICS: Record<string, T> = {
  weather: { label: "The weather", category: "small_talk", desc: "Safe, if a little dull" },
  their_day: { label: "How their day went", category: "small_talk" },
  local_news: { label: "What's going on around here", category: "small_talk" },
  gossip: { label: "Gossip", category: "small_talk", desc: "Who's doing what with whom" },
  hobbies: { label: "Hobbies", category: "interests" },
  music: { label: "Music", category: "interests" },
  books_films: { label: "Books and films", category: "interests" },
  games: { label: "Games", category: "interests" },
  sport: { label: "Sport", category: "interests" },
  food: { label: "Food", category: "interests" },
  travel: { label: "Travel", category: "interests" },
  nature: { label: "The outdoors", category: "interests" },
  fashion: { label: "Fashion", category: "interests" },
  work: { label: "Work or studies", category: "personal", stage: 1 },
  family: { label: "Family", category: "personal", stage: 1 },
  dreams: { label: "Dreams and ambitions", category: "personal", stage: 1 },
  past: { label: "Their past", category: "personal", stage: 2, weight: 1.3 },
  worries: { label: "What's worrying them", category: "personal", stage: 2, weight: 1.3 },
  secrets: { label: "Share a secret", category: "personal", stage: 3, weight: 1.5 },
  compliment_looks: { label: "Compliment their looks", category: "charm", stage: 1 },
  compliment_mind: { label: "Praise their mind", category: "charm" },
  joke: { label: "Tell a joke", category: "charm" },
  tease: { label: "Tease them", category: "charm", stage: 1 },
  flirt: { label: "Flirt", category: "romance", stage: 1, romantic: true },
  ideal_partner: { label: "Their ideal partner", category: "romance", stage: 2, romantic: true },
  love_life: { label: "Their love life", category: "romance", stage: 2, romantic: true },
  the_two_of_you: { label: "The two of you", category: "romance", stage: 3, romantic: true, weight: 1.5 },
};

export const DEFAULT_TOPICS: Record<string, TopicDef> = Object.fromEntries(Object.entries(TOPICS).map(([id, t]) => [id, {
  id, weight: 1, romantic: false, stage: 0, ...t,
}]));

const act = (id: string, label: string, tags: string[], romantic = false) => ({ id, label, tags, romantic });
const ev = (id: string, text: string, enjoy: number, weight = 1) => ({ id, text, enjoy, weight });

export const DEFAULT_VENUES: Record<string, VenueDef> = {
  cafe: {
    id: "cafe", name: "A café", desc: "Coffee, cake and a corner table.", cost: 10, romantic: false,
    activities: [
      act("order_for_them", "Order for them", ["food"]),
      act("share_dessert", "Share a dessert", ["food", "sweet"]),
      act("people_watch", "People-watch and make up stories", ["observation", "humor"]),
      act("talk_for_hours", "Lose track of time talking", ["conversation"]),
    ],
    events: [
      ev("spill", "A clumsy moment: a drink goes over.", -6),
      ev("song", "The café plays a song that fits the moment perfectly.", 8),
      ev("friend", "Someone who knows {target} stops by the table.", 0),
    ],
  },
  park: {
    id: "park", name: "A walk in the park", desc: "Paths, trees, a pond.", cost: 0, romantic: false,
    activities: [
      act("feed_birds", "Feed the birds", ["nature", "animals"]),
      act("picnic", "Have a picnic", ["food", "nature"]),
      act("watch_sky", "Sit and watch the sky", ["calm", "nature"]),
      act("hold_hands", "Walk hand in hand", ["romance"], true),
    ],
    events: [
      ev("rain", "It starts to rain.", -6),
      ev("dog", "A friendly dog bounds over to say hello.", 6),
      ev("sunset", "The light turns gold; it's genuinely beautiful.", 10),
    ],
  },
  cinema: {
    id: "cinema", name: "The cinema", desc: "Something on the big screen.", cost: 15, romantic: false,
    activities: [
      act("their_pick", "Let them pick the film", ["film"]),
      act("horror", "Watch a horror film", ["film", "thrill"]),
      act("popcorn", "Share popcorn", ["food"]),
      act("dark_hands", "Hold hands in the dark", ["romance"], true),
    ],
    events: [
      ev("great_film", "The film turns out to be great.", 10),
      ev("loud_row", "Someone behind talks through the whole film.", -8),
    ],
  },
  dinner: {
    id: "dinner", name: "Dinner out", desc: "A proper restaurant.", cost: 40, romantic: false,
    activities: [
      act("fancy_order", "Order something fancy", ["food", "luxury"]),
      act("wine", "Share a bottle of wine", ["drink", "luxury"]),
      act("toast", "Make a toast to them", ["humor", "conversation"]),
      act("candlelight", "Talk by candlelight", ["romance", "conversation"], true),
    ],
    events: [
      ev("wrong_order", "The kitchen gets the order wrong.", -5),
      ev("dessert_free", "The waiter brings a dessert on the house.", 7),
    ],
  },
  arcade: {
    id: "arcade", name: "The arcade", desc: "Lights, noise, tickets.", cost: 10, romantic: false,
    activities: [
      act("compete", "Compete at the machines", ["games", "competition"]),
      act("claw", "Win them a prize", ["games", "gift"]),
      act("dance_game", "Try the dance game", ["dance", "music"]),
      act("photo_booth", "Squeeze into the photo booth", ["fun", "romance"]),
    ],
    events: [
      ev("jackpot", "The machine pays out a jackpot of tickets.", 9),
      ev("broken", "A machine eats their coins.", -5),
    ],
  },
  bar: {
    id: "bar", name: "A bar", desc: "Low lights and a crowd.", cost: 20, romantic: false,
    activities: [
      act("drinks", "Get a round in", ["drink"]),
      act("dance", "Dance", ["dance", "music"]),
      act("karaoke", "Do karaoke", ["music", "performance"]),
      act("quiet_corner", "Find a quiet corner", ["conversation", "romance"], true),
    ],
    events: [
      ev("band", "A band starts playing, and it's good.", 8),
      ev("creep", "A stranger won't leave {target} alone.", -8),
    ],
  },
};

/** Activity tags the tastes are read for. */
export function venueTags(v: VenueDef): string[] {
  return [...new Set(v.activities.flatMap((a) => a.tags))];
}
