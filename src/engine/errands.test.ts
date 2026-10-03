import { describe, expect, test } from "bun:test";
import { buildInjection } from "../backend/inject.js";
import { buildErrands, errandKind, quietBlocker, runQuiet } from "./errands.js";
import { loadRuleset } from "./loader.js";
import { foldEvents, initialState, type GameState } from "./state.js";
import { buildChoices, summarizeEvents } from "./view.js";

const r = loadRuleset([{ label: "t", content: `
name: Town
clock: { start: "Mon 09:00" }
start: { location: square, items: { herbs: 2 } }
locations:
  square: { name: Square, board: true, exits: [shop, home] }
  shop: { name: Apothecary, exits: [square] }
  home: { name: Home, exits: [square] }
stats:
  coin: { kind: money, start: 60 }
  energy: { kind: meter, start: 50, bands: { 0: Spent, 50: Fresh } }
  herbalism: { kind: skill, max: 100, start: 10 }
items:
  potion: { name: Soothing potion, use: { label: Drink it, effects: { energy: +10 } } }
  herbs: Dream herbs
obligations:
  rent: { label: Rent, amount: 30, every: 7, first: 3, at: home }
quests:
  parcel: { name: A parcel across town, board: true, goals: [ { text: Deliver it } ], reward: { coin: +20 }, days: 3 }
actions:
  buy_potion: { label: Buy Soothing potion, at: [shop], effects: { coin: -25, give: potion } }
  sell_herbs: { label: Sell Dream herbs, at: [shop], when: "has('herbs')", effects: { coin: +8, take: herbs } }
  practice: { label: Practice herbalism, at: [shop], time: 45, cost: { energy: -15 }, check: { chance: 60, label: Herbalism }, success: { herbalism: +1 }, fail: { energy: -2 } }
  sleep: { label: Sleep, at: [home], time: 480, effects: { energy: +100 }, }
  chat: { label: Chat with the shopkeeper, at: [shop], effects: { energy: -1 } }
  register: { label: Register, at: [square], time: 30, effects: { flags: { registered: true } } }
  arcade_course: { label: Run the timing course, at: [shop], time: 25, cost: { coin: -10, energy: -8 }, check: { chance: "40 + herbalism", label: Herbalism, game: race }, success: { energy: +1 }, fail: { energy: -3 } }
  look_around: { label: Look around, at: [shop], check: { chance: "40 + herbalism", label: Herbalism }, success: { hint: "Reveal something hidden." }, fail: { hint: "Nothing turns up." } }
  pickpocket: { label: Pick a pocket, at: [shop], check: { chance: 30, label: Herbalism }, success: { coin: +10, herbalism: +1 }, fail: { energy: -5 } }
  keep_story: { label: Buy a gift in the story, at: [shop], errand: false, effects: { coin: -5, give: potion } }
`, order: 0 }]).ruleset!;

const changes = (b: GameState, a: GameState, evs: Parameters<typeof summarizeEvents>[3]) => summarizeEvents(r, b, a, evs).map((c) => c.text);
let n = 0;
const seed = () => `s${n++}`;
const at = (loc: string) => { const s = initialState(r); s.location = loc; s.locationName = r.locations[loc].name; return s; };

describe("errands: what goes in the window", () => {
  test("kinds are read from an action's shape (and errand: overrides it)", () => {
    expect(errandKind(r, r.actions.buy_potion)).toBe("shop");
    expect(errandKind(r, r.actions.sell_herbs)).toBe("shop");
    expect(errandKind(r, r.actions.practice)).toBe("train");
    expect(errandKind(r, r.actions.sleep)).toBe("rest");
    expect(errandKind(r, r.actions.chat)).toBeNull();
    expect(errandKind(r, r.actions.pickpocket)).toBeNull(); // a check with a take is a story, not practice
    // A check that reads a skill is practice (with an entry fee, too) — unless it's there to reveal something.
    expect(errandKind(r, r.actions.arcade_course)).toBe("train");
    expect(errandKind(r, r.actions.look_around)).toBeNull();
    expect(errandKind(r, r.actions.register)).toBe("rest"); // a flag alone doesn't make it a story moment…
    expect(errandKind(r, r.actions.keep_story)).toBeNull(); // …but the author can say so
  });

  test("the window holds what's here: the board at the square, the shop and practice at the apothecary", () => {
    const sq = buildErrands(r, at("square"))!;
    expect(sq.board.map((b) => b.name)).toEqual(["A parcel across town"]);
    expect(sq.board[0]).toMatchObject({ days: 3, take: "quest:take:parcel" });
    expect(sq.shop).toEqual([]);
    const shop = buildErrands(r, at("shop"))!;
    expect(shop.shop.find((x) => x.id === "buy_potion")).toMatchObject({ price: expect.stringContaining("25"), max: 2 });
    expect(shop.shop.find((x) => x.id === "sell_herbs")).toMatchObject({ sell: true, max: 2 });
    expect(shop.train[0]).toMatchObject({ id: "practice", minutes: 45, max: 3 });
    expect(shop.money).toContain("60");
  });

  test("with the window on, those choices leave the story buttons (the rest stay)", () => {
    const ids = (s: GameState, errands: boolean) => buildChoices(r, s, { lines: [], veils: [], errands }).map((c) => c.id);
    expect(ids(at("shop"), false)).toEqual(expect.arrayContaining(["buy_potion", "practice", "chat", "keep_story"]));
    const on = ids(at("shop"), true);
    expect(on).not.toContain("buy_potion");
    expect(on).not.toContain("practice");
    expect(on).toEqual(expect.arrayContaining(["chat", "keep_story"]));
    expect(ids(at("square"), false).some((id) => id === "quest:take:parcel")).toBe(true);
    expect(ids(at("square"), true).some((id) => id === "quest:take:parcel")).toBe(false);
  });

  test("not in a fight", () => {
    const s = at("shop");
    s.encounter = { id: "x" } as GameState["encounter"];
    expect(buildErrands(r, s)).toBeNull();
    expect(quietBlocker(r, s, "buy_potion")).toContain("Not now");
  });
});

describe("errands: done off the page", () => {
  test("buying repeats until the money runs out, and says what happened in one line", () => {
    const s = at("shop");
    const res = runQuiet(r, s, "buy_potion", 3, { seed, changes });
    expect(res.done).toBe(2);
    expect(res.after.items.potion).toBe(2);
    expect(res.after.stats.coin).toBe(10);
    expect(res.line).toContain("Buy Soothing potion ×2");
  });

  test("taking a posting off the board, paying rent, travelling, using an item", () => {
    const sq = runQuiet(r, at("square"), "quest:take:parcel", 1, { seed, changes });
    expect(sq.after.quests.parcel?.st).toBe("active");
    expect(sq.line).toContain('Took on "A parcel across town"');
    const home = at("home");
    const paid = runQuiet(r, home, "pay:rent", 1, { seed, changes });
    expect(paid.error).toBeUndefined();
    expect(paid.after.stats.coin).toBeLessThan(60);
    const go = runQuiet(r, at("square"), "go:shop", 1, { seed, changes });
    expect(go.after.location).toBe("shop");
    expect(go.line).toContain("Went to Apothecary");
    const s = at("square"); s.items.potion = 1;
    const used = runQuiet(r, s, "item:potion", 1, { seed, changes });
    expect(used.after.stats.energy).toBe(60);
    expect(runQuiet(r, at("square"), "chat", 1, { seed, changes }).error).toBeTruthy();
    // Selling stops when there's nothing left to sell.
    const sold = runQuiet(r, at("shop"), "sell_herbs", 5, { seed, changes });
    expect(sold.done).toBe(2);
    expect(sold.after.items.herbs ?? 0).toBe(0);
  });

  test("training rolls each session and stops when there's nothing left in you; time passes", () => {
    const s = at("shop");
    const res = runQuiet(r, s, "practice", 10, { seed, changes });
    expect(res.done).toBe(3);
    expect(res.after.minutes - s.minutes).toBeGreaterThanOrEqual(3 * 45);
    expect(res.line).toContain("×3");
    expect(res.line).toMatch(/\d of 3 went well/);
  });

  test("a training session played as its minigame: one session, the score decides", () => {
    const s = at("shop");
    const res = runQuiet(r, s, "arcade_course", 5, { seed, changes, game: { game: "race", score: 1, beats: [] } });
    expect(res.done).toBe(1);
    expect(res.line).toContain("it went well");
    expect(res.after.stats.coin).toBe(50);
  });

  test("world news waiting for the story stays waiting", () => {
    const s = at("home");
    s.notices = ["A storm is coming."];
    const res = runQuiet(r, s, "sleep", 1, { seed, changes });
    expect(res.after.notices).toEqual(["A storm is coming."]);
  });

  test("the next reply is told once, and what was bought counts as in play", () => {
    const s = at("shop");
    const res = runQuiet(r, s, "buy_potion", 1, { seed, changes });
    const after = foldEvents(r, [res.events], s);
    const block = buildInjection(r, null, after, after, "Jay", "I head out.", [res.line!]);
    expect(block).toContain("what Jay did since the last reply, off the page");
    expect(block).toContain("- Buy Soothing potion");
    expect(block).toContain("Carrying: Soothing potion");
    expect(buildInjection(r, null, after, after, "Jay", "I head out.")).not.toContain("off the page");
  });
});
