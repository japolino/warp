import { describe, expect, test } from "bun:test";
import yaml from "js-yaml";
import { lintRuleset } from "./lint.js";
import { normalizeRuleset } from "./ruleset.js";
import { applyProposal, availableChoices, buyPerk, changeClothes, resolveTurn, resolveTurnFull } from "./resolve.js";
import { foldEvents, initialState, type GameState } from "./state.js";
import { buildHud, buildMap, stateDigest } from "./view.js";
import { temperatureAt, warmthNeeded, weatherAt } from "./world.js";

const RULES = yaml.load(`
name: Test Town
clock: { start: "Sun 07:00", date: "Sep 4" }
start: { location: home }
stats:
  health: { kind: meter, start: 100 }
  stress: { kind: meter, good: low, start: 0 }
  points: { kind: attribute, start: 2, max: 10 }
  charm: { kind: attribute, start: 3, max: 10 }
weather: { temps: { autumn: 8 } }
wardrobe:
  slots: [top, bottom, outer, feet]
  cover: [top, bottom]
  start: [shirt, jeans]
items:
  shirt: { name: Shirt, slot: top, warmth: 3 }
  jeans: { name: Jeans, slot: bottom, warmth: 4, integrity: 50 }
  coat: { name: Rain coat, slot: outer, warmth: 8, traits: [rainproof] }
locations:
  home: { name: Home, indoors: true, exits: [street] }
  street: { name: Street, exits: [home, park] }
  park: { name: Park, exits: [street] }
relationships:
  stats:
    trust: { start: 10, narrator: 5 }
  people:
    ana:
      name: Ana
      schedule:
        - { when: "between(hour, 9, 17)", at: park }
        - { at: home }
actions:
  chat:
    label: Chat with {target}
    per_person: true
    effects: { rel: { target: { trust: +3 } }, hint: "They chat." }
  pick_fight:
    label: Pick a fight
    at: street
    effects: { start_encounter: brawl }
encounters:
  brawl:
    name: Street brawl
    foe: { name: Thug, stats: { hp: { start: 10, max: 10 } } }
    actions:
      punch: { label: Punch, effects: { foe: { hp: -6 } } }
      run: { label: Run, effects: { end: fled } }
    foe_moves:
      hit: { desc: "hits you", weight: 1, health: -10 }
    end_when:
      won: "foe.hp <= 0"
      lost: "health <= 0"
    outcomes:
      won: { unlock: [brawler], hint: "You win." }
      fled: { stress: +5 }
codex:
  brawler: { title: "Street Fighting", text: "You learned to fight." }
  park_lore: { title: "The Park", text: "Old trees.", unlock: "location == 'park'", lore: ["Park history"] }
feats:
  survivor: { name: Survivor, desc: "Win a fight", unlock: "codex('brawler')", reward: { points: +1 } }
perks:
  points: points
  smooth:
    name: Smooth Talker
    cost: 2
    requires: "charm >= 3"
    effects: { charm: +2 }
`);

const load = () => {
  const { ruleset, issues } = normalizeRuleset(RULES);
  expect(issues.filter((i) => i.level === "error")).toEqual([]);
  return ruleset!;
};

const step = (r: ReturnType<typeof load>, s: GameState, actionId: string | null, seed = "t") =>
  foldEvents(r, [resolveTurn(r, s, actionId ? { actionId, via: "choice" } : null, { seed }).events], s);

describe("new systems", () => {
  test("the test ruleset lints clean", () => {
    expect(lintRuleset(load())).toEqual([]);
  });

  test("calendar, weather and temperature", () => {
    const r = load();
    let s = initialState(r);
    s = step(r, s, null, "world-1");
    expect(s.seed).toBe("world-1");
    const hud = buildHud(r, s);
    expect(hud.date).toBe("Sun 4th Sep");
    expect(hud.weather?.indoors).toBe(true);
    expect(hud.weather?.temp).toBe(20);
    s = step(r, s, "go:street");
    const out = temperatureAt(r, s)!;
    expect(out).toBeLessThan(15);
    expect(weatherAt(r, s)).not.toBeNull();
    // Same seed and time → same weather (replays are stable).
    expect(weatherAt(r, { ...s })!.id).toBe(weatherAt(r, s)!.id);
  });

  test("wardrobe: warmth, exposure, changing and damage", () => {
    const r = load();
    let s = initialState(r);
    expect(s.worn).toEqual({ top: "shirt", bottom: "jeans" });
    let hud = buildHud(r, s);
    expect(hud.warmth!.value).toBe(7); // shirt 3 + jeans 4, judged against the indoor temperature
    s = step(r, s, "go:street");
    hud = buildHud(r, s);
    expect(hud.warmth!.value).toBe(7);
    const need = warmthNeeded(temperatureAt(r, s)!);
    expect(hud.warmth!.min).toBe(need.min);
    // Give and wear the coat.
    s.items.coat = 1;
    const ev = changeClothes(r, s, "outer", "coat");
    expect(Array.isArray(ev)).toBe(true);
    s = foldEvents(r, [ev as never], s);
    expect(buildHud(r, s).warmth!.value).toBe(15);
    // Take the shirt off → exposed top.
    s = foldEvents(r, [changeClothes(r, s, "top", null) as never], s);
    expect(buildHud(r, s).exposed).toEqual(["top"]);
    expect(stateDigest(r, s)).toContain("exposed: top");
    // Narrator bookkeeping can undress (wardrobe.narrator defaults to true).
    s = foldEvents(r, [applyProposal(r, s, { undress: ["outer"] })], s);
    expect(s.worn.outer).toBeUndefined();
  });

  test("schedules put people in places; per-person actions target who's here", () => {
    const r = load();
    let s = initialState(r); // 07:00, at home — Ana's default is home
    expect(buildHud(r, s).people.find((p) => p.id === "ana")?.present).toBe(true);
    const choices = availableChoices(r, s);
    const chat = choices.find((c) => c.id === "chat@ana");
    expect(chat?.label).toBe("Chat with Ana");
    s = step(r, s, "chat@ana");
    expect(s.rel.ana.trust).toBe(13);
    expect(stateDigest(r, s)).toContain("Present here: Ana");
    // At 10:00 she's in the park.
    s.minutes += 180;
    expect(buildHud(r, s).people.find((p) => p.id === "ana")?.present).toBe(false);
    expect(buildHud(r, s).people.find((p) => p.id === "ana")?.whereabouts).toBe("Park");
  });

  test("encounters: start, rounds with foe moves, end conditions and outcomes", () => {
    const r = load();
    let s = step(r, initialState(r), "go:street");
    s = step(r, s, "pick_fight");
    expect(s.encounter?.id).toBe("brawl");
    // Encounter moves replace normal choices; no travel mid-fight.
    expect(availableChoices(r, s).map((c) => c.id)).toEqual(["punch", "run"]);
    const res = resolveTurnFull(r, s, { actionId: "punch", via: "choice" }, { seed: "p1" });
    expect(res.needs.map((n) => n.id)).toEqual(["enc_brawl_foe"]);
    s = foldEvents(r, [res.record.events], s);
    expect(s.encounter?.foe.hp).toBe(4);
    expect(s.stats.health).toBe(90); // the thug hit back
    s = step(r, s, "punch", "p2");
    expect(s.encounter).toBeNull();
    expect(s.codex.brawler).toBe(true);
    expect(s.feats.survivor).toBe(true);
    expect(s.stats.points).toBe(3);
  });

  test("running away ends with its own outcome", () => {
    const r = load();
    let s = step(r, step(r, initialState(r), "go:street"), "pick_fight");
    s = step(r, s, "run");
    expect(s.encounter).toBeNull();
    expect(s.stats.stress).toBe(5);
  });

  test("codex unlocks by formula; perks cost points and check requirements", () => {
    const r = load();
    let s = step(r, step(r, initialState(r), "go:street"), "go:park");
    expect(s.codex.park_lore).toBe(true);
    const bought = buyPerk(r, s, "smooth");
    expect(Array.isArray(bought)).toBe(true);
    s = foldEvents(r, [bought as never], s);
    expect(s.perks.smooth).toBe(true);
    expect(s.stats.points).toBe(0);
    expect(s.stats.charm).toBe(5);
    expect(buyPerk(r, s, "smooth")).toBe("Already taken.");
  });

  test("map: every place placed, edges deduplicated, reachable neighbours marked", () => {
    const r = load();
    const m = buildMap(r, initialState(r))!;
    expect(m.nodes.map((n) => n.id).sort()).toEqual(["home", "park", "street"]);
    expect(m.edges.length).toBe(2);
    expect(m.nodes.find((n) => n.id === "street")?.reachable).toBe(true);
    expect(m.nodes.find((n) => n.id === "home")?.here).toBe(true);
    expect(new Set(m.nodes.map((n) => `${Math.round(n.x)},${Math.round(n.y)}`)).size).toBe(3);
  });
});
