import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { applyProposal, resolveTurnFull, type Intent, type Proposal } from "./resolve.js";
import { foldEvents, initialState, type GameState } from "./state.js";
import { buildHud, stateDigest, summarizeEvents } from "./view.js";
import { presentPeople } from "./world.js";
import { makeEnv } from "./state.js";
import { checkStats, improvAction, practiceGain } from "./freeform.js";

const YAML = `
name: Freeform
clock: { start: "Mon 12:00" }
start: { location: bar, items: { spray: 2, hoodie: 1, cap: 1 } }
locations:
  bar: { name: The Bar, exits: [street] }
  street: { name: The Street, exits: [bar] }
stats:
  health: { kind: meter, start: 100, narrator: 20 }
  charm: { kind: attribute, max: 10, start: 3 }
  athletics: { kind: skill, max: 100, start: 10 }
  luck: { kind: skill, max: 100, start: 10, growth: 0 }
items:
  spray: { name: Blocker Spray, uses: 3 }
  snack: { name: Snack, tags: [consumable] }
  hoodie: { name: Oversized Hoodie, slot: top }
  cap: { name: Low Cap, slot: head }
  shirt: { name: Shirt, slot: top }
wardrobe: { slots: [head, top], cover: [top], start: [shirt] }
relationships:
  stats: { trust: { start: 20, narrator: 5 } }
  people:
    bartender: { name: Rosa, schedule: [ { at: bar } ] }
encounters:
  brawl:
    name: Brawl
    foe: { name: Thug, stats: { nerve: { start: 10, max: 10 } } }
    actions: { swing: { label: Swing, check: { vs: 12, add: "floor(athletics / 10)" }, success: { foe: { nerve: -5 } } } }
    momentum: { win: won, lose: lost }
    outcomes: { won: { hint: "They back off." }, lost: { health: -20 } }
  duel:
    name: Formal duel
    from_story: false
    foe: { name: Rival, stats: {} }
    actions: { lunge: { label: Lunge } }
actions:
  vault:
    label: Vault the counter
    check: { chance: "20 + athletics / 2" }
`;
const r = loadRuleset([{ label: "t", content: YAML, order: 0 }]).ruleset!;
const turn = (s: GameState, intent: Intent | null, opts: Record<string, unknown> = {}) => {
  const rec = resolveTurnFull(r, s, intent, { seed: "seed", ...opts }).record;
  return { rec, s: foldEvents(r, [rec.events], s) };
};
const read = (s: GameState, p: Proposal, text = "") => {
  const events = applyProposal(r, s, p, { text });
  return { events, s: foldEvents(r, [events], s) };
};

describe("improvised attempts", () => {
  test("a typed attempt nothing lists still rolls: d20 + the ability's share vs the difficulty", () => {
    const s = initialState(r);
    const { rec } = turn(s, { actionId: "try:charm", params: { difficulty: "hard" }, via: "adjudicator" });
    expect(rec.check?.dice).toBe("d20");
    expect(rec.check?.target).toBe(16);
    expect(rec.check?.add).toBe(3); // charm 3 of 10 → 30% of the +10 bonus
    expect(rec.action?.label).toBe("Attempt: Charm, hard");
    expect(rec.hints.join(" ")).toContain("attempts what they wrote");
    // Unknown difficulty falls back to fair; unknown stat means no attempt.
    expect(turn(s, { actionId: "try:charm", via: "confirmed" }).rec.check?.target).toBe(12);
    expect(improvAction(r, s, "try:nonsense")).toBeNull();
  });

  test("with nothing to lean on it's a plain roll; improvise: false turns it off", () => {
    const s = initialState(r);
    expect(turn(s, { actionId: "try:", params: { difficulty: "easy" }, via: "adjudicator" }).rec.check?.add).toBe(0);
    const off = loadRuleset([{ label: "t", content: `${YAML}\nimprovise: false`, order: 0 }]).ruleset!;
    expect(improvAction(off, initialState(off), "try:charm")).toBeNull();
  });

  test("in a fight, an improvised move swings it like any other", () => {
    let s = initialState(r);
    s = turn(s, null, { encounter: { id: "brawl", foe: "Rosa" } }).s;
    expect(s.encounter?.id).toBe("brawl");
    expect(s.encounter?.foeName).toBe("Rosa");
    expect(stateDigest(r, s)).toContain("vs Rosa");
    const { rec } = turn(s, { actionId: "try:athletics", params: { difficulty: "fair" }, via: "adjudicator" });
    expect(rec.events.some((e) => e.t === "swing")).toBe(true);
    expect(rec.hints.join(" ")).toContain("beats, in order");
  });
});

describe("growth by use", () => {
  test("every check teaches the abilities it reads; enough practice raises them", () => {
    let s = initialState(r);
    expect(checkStats(r, r.actions.vault)).toEqual(["athletics"]);
    const start = s.stats.athletics;
    for (let i = 0; i < 3; i++) s = turn(s, { actionId: "vault", via: "choice" }, { seed: `v${i}` }).s;
    expect(s.stats.athletics).toBeGreaterThan(start);
  });

  test("attributes grow slower, through a visible practice pool", () => {
    let s = initialState(r);
    const { rec, s: next } = turn(s, { actionId: "try:charm", params: { difficulty: "fair" }, via: "adjudicator" });
    expect(next.stats.charm).toBe(3);
    expect(next.practice.charm).toBeGreaterThan(0);
    expect(buildHud(r, next).skills.find((x) => x.id === "charm")?.practice).toBeCloseTo(next.practice.charm, 5);
    expect(summarizeEvents(r, s, next, rec.events).some((c) => c.text.startsWith("📈 Charm"))).toBe(true);
    for (let i = 0; i < 40; i++) s = turn(s, { actionId: "try:charm", params: { difficulty: "hard" }, via: "adjudicator" }, { seed: `c${i}` }).s;
    expect(s.stats.charm).toBeGreaterThan(3);
    expect(s.stats.charm).toBeLessThan(10);
  });

  test("growth: 0 never moves; nothing grows past its max", () => {
    const s = initialState(r);
    expect(practiceGain(r, s, "luck", 1, 1)).toBe(0);
    const maxed = { ...s, stats: { ...s.stats, athletics: 100 } };
    expect(practiceGain(r, maxed, "athletics", 2, 1)).toBe(0);
  });

  test("practice the story describes counts too", () => {
    const s = initialState(r);
    const { s: next } = read(s, { train: ["athletics"], minutes: 120 });
    expect(next.stats.athletics).toBeGreaterThan(s.stats.athletics);
    expect(read(s, { train: ["luck"] }).events.some((e) => e.t === "stat")).toBe(false);
  });
});

describe("who's in the scene", () => {
  test("people the story introduces are here, until the story says they left", () => {
    let s = initialState(r);
    s = read(s, { people: [{ name: "Miu" }, { name: "Clarice" }] }).s;
    const here = () => presentPeople(r, s, makeEnv(r, s)).map((id) => s.people[id].name);
    expect(here()).toEqual(expect.arrayContaining(["Miu", "Clarice", "Rosa"]));
    const left = read(s, { scene: { Clarice: false } });
    s = left.s;
    expect(here()).not.toContain("Clarice");
    expect(summarizeEvents(r, initialState(r), s, left.events).map((c) => c.text)).toContain("Clarice left");
    // The narrator only gets relationships for people here; the rest are named apart.
    const digest = stateDigest(r, s);
    expect(digest).toMatch(/Relationships \(here\):[^\n]*Miu/);
    expect(digest).toMatch(/Not in this scene[^\n]*Clarice/);
    expect(buildHud(r, s).people.find((p) => p.name === "Clarice")?.present).toBe(false);
  });

  test("a first name finds the full name, and a known person isn't met twice", () => {
    let s = read(initialState(r), { people: [{ name: "Miu Tanaka" }] }).s;
    const again = read(s, { people: [{ name: "Miu" }] });
    expect(again.events.some((e) => e.t === "person")).toBe(false);
    s = read(s, { scene: { miu: false } }).s;
    expect(presentPeople(r, s, makeEnv(r, s)).includes("miu_tanaka")).toBe(false);
  });

  test("moving leaves people behind until the story brings them along; schedules fill in the rest", () => {
    let s = read(initialState(r), { people: [{ name: "Miu" }] }).s;
    s = turn(s, { actionId: "go:street", via: "choice" }).s;
    expect(presentPeople(r, s, makeEnv(r, s))).toEqual([]);
    expect(stateDigest(r, s)).toContain("Were with {{user}} before arriving here");
    s = read(s, { scene: { Miu: true } }).s;
    expect(presentPeople(r, s, makeEnv(r, s))).toEqual(["miu"]);
    // Rosa's schedule keeps her at the bar; the story can still say she stepped out.
    s = turn(s, { actionId: "go:bar", via: "choice" }).s;
    expect(presentPeople(r, s, makeEnv(r, s))).toContain("bartender");
    s = read(s, { scene: { Rosa: false } }).s;
    expect(presentPeople(r, s, makeEnv(r, s))).not.toContain("bartender");
  });
});

describe("items the story uses", () => {
  test("uses run down and the last one spends the item", () => {
    let s = initialState(r);
    s = read(s, { used: { "Blocker Spray": 1 } }).s;
    expect(s.items.spray).toBe(2);
    expect(s.uses.spray).toBe(2);
    expect(stateDigest(r, s)).toContain("Blocker Spray ×2 (2 of 3 uses left)");
    s = read(s, { used: { spray: 2 } }).s;
    expect(s.items.spray).toBe(1);
    expect(s.uses.spray).toBeUndefined();
    s = read(s, { used: { spray: 3 } }).s;
    expect(s.items.spray).toBeUndefined();
  });

  test("clothes in the bag are named as not worn, and the story can put them on", () => {
    let s = initialState(r);
    expect(stateDigest(r, s)).toMatch(/NOT being worn[^\n]*Oversized Hoodie[^\n]*Low Cap/);
    s = read(s, { wear: ["hoodie"] }).s;
    expect(s.worn.top).toBe("hoodie");
    expect(stateDigest(r, s)).toMatch(/Wearing: [^\n]*Oversized Hoodie/);
  });
});

describe("fights from the story", () => {
  test("the prose starting a fight starts the encounter, against whoever it's with", () => {
    const s = initialState(r);
    const started = read(s, { encounter: "brawl", foe: "Rosa" }).s;
    expect(started.encounter).toMatchObject({ id: "brawl", foeName: "Rosa" });
    expect(started.notices.join(" ")).toContain("Opponent: Rosa");
    // Some encounters only start from the rules.
    expect(read(s, { encounter: "duel" }).s.encounter).toBeNull();
    expect(turn(s, null, { encounter: { id: "duel" } }).s.encounter).toBeNull();
  });

  test("and the prose ending it ends it", () => {
    const s = read(initialState(r), { encounter: "brawl" }).s;
    const over = read(s, { encounterEnd: "lost" }).s;
    expect(over.encounter).toBeNull();
    expect(over.stats.health).toBe(80);
  });
});
