// Dating that fits the card: the modern defaults are rewritten once into an
// editable entry, the author's own wording still wins, and a card that already
// fits is left alone.

import { beforeAll, describe, expect, test } from "bun:test";
import { loadRuleset } from "../engine/loader.js";
import { defaultsInUse, themeDating } from "./flavour.js";

const entries: { id: string; comment: string; content: string; order_value: number; key: string[] }[] = [];
let reply = "";
const prompts: string[] = [];

beforeAll(() => {
  (globalThis as any).spindle = {
    sendToFrontend: () => {},
    log: { info: () => {}, error: () => {}, warn: () => {} },
    toast: { info: () => {}, success: () => {}, warning: () => {}, error: () => {} },
    userStorage: { getJson: async (_p: string, o: any) => o?.fallback, setJson: async () => {} },
    chats: { get: async () => ({ id: "c1", character_id: "ch1" }) },
    characters: { get: async () => ({ id: "ch1", name: "Sir Aldric", description: "A knight of a medieval kingdom.", world_book_ids: ["wb1"] }) },
    world_books: {
      get: async () => ({ id: "wb1", name: "warp-ruleset" }),
      entries: {
        list: async () => ({ data: entries, total: entries.length }),
        create: async (_b: string, e: any) => { const x = { id: `e${entries.length + 1}`, ...e }; entries.push(x); return x; },
        update: async (id: string, patch: any) => { Object.assign(entries.find((e) => e.id === id)!, patch); },
      },
    },
    generate: { quiet: async (req: any) => { prompts.push(req.messages[1].content); return { content: reply, finish_reason: "stop" }; } },
  };
  entries.push({ id: "e1", comment: "warp-ruleset · core", content: "name: The Realm\nstats: { coin: { kind: money, start: 20 } }\nrelationships: { people: { aldric: { name: Aldric, age: 30 } } }\ndating: true\n", order_value: 10, key: [] });
});

const load = () => loadRuleset(entries.map((e) => ({ label: e.comment, content: e.content, order: e.order_value }))).ruleset!;

describe("dating that fits the card", () => {
  test("the modern defaults are rewritten for the setting, into an editable entry", async () => {
    expect(defaultsInUse(load()).topics.length).toBeGreaterThan(20);
    reply = `\`\`\`yaml
fits_already: false
dating:
  topics:
    books_films: { label: Tales and songs, say: "*I ask {{target}} which ballads they know.*" }
    games: { label: Dice and chess }
    fashion: false
    swordplay: { label: Swordplay, category: interests }
  venues:
    cinema: false
    arcade: false
    fair:
      name: The harvest fair
      desc: Stalls, music and mummers.
      cost: 3
      activities: { mummers: { label: Watch the mummers, tags: [humor] }, dance: { label: Dance in the square, tags: [music, romance], romantic: true } }
      events: { pickpocket: { text: A pickpocket brushes past., enjoy: -5 } }
\`\`\``;
    expect(await themeDating("c1")).toEqual({ topics: 4, venues: 3 });
    expect(prompts[0]).toContain("A knight of a medieval kingdom.");
    const flav = entries.find((e) => e.comment === "warp-ruleset · dating flavour")!;
    expect(flav.order_value).toBe(5);
    const r = load();
    expect(r.dating.topics.books_films.label).toBe("Tales and songs");
    expect(r.dating.topics.books_films.say).toContain("ballads");
    expect(r.dating.topics.fashion).toBeUndefined();
    expect(r.dating.topics.swordplay.category).toBe("interests");
    expect(r.dating.venues.cinema).toBeUndefined();
    expect(r.dating.venues.fair.name).toBe("The harvest fair");
    // `dating: true` in the author's section doesn't wipe the merged-in flavour.
    expect(r.dating.enabled).toBe(true);
    // Done once: not asked again unless forced.
    expect(await themeDating("c1")).toBeNull();
  });

  test("the author's own dating wording wins over the flavour", () => {
    entries.push({ id: "e9", comment: "warp-ruleset · dating", content: "dating:\n  topics:\n    books_films: { label: Plays at the Globe }\n", order_value: 20, key: [] });
    expect(load().dating.topics.books_films.label).toBe("Plays at the Globe");
    entries.pop();
  });

  test("a card the defaults already fit is noted and left alone", async () => {
    const flav = entries.findIndex((e) => e.comment === "warp-ruleset · dating flavour");
    entries.splice(flav, 1);
    reply = "fits_already: true";
    expect(await themeDating("c1")).toBeNull();
    expect(entries.find((e) => e.comment === "warp-ruleset · dating flavour")?.content).toContain("already fit");
    expect(load().dating.topics.books_films.label).toBe("Books and films");
  });
});
