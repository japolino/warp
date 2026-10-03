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
start: { place: The Bar, items: { spray: 2 } }
stats:
  health: { kind: meter, start: 100, narrator: 20 }
  charm: { kind: attribute, max: 10, start: 3 }
  athletics: { kind: skill, max: 100, start: 10 }
  luck: { kind: skill, max: 100, start: 10, growth: 0 }
items:
  spray: { name: Blocker Spray, uses: 3 }
  snack: { name: Snack, tags: [consumable] }
relationships:
  stats: { trust: { start: 20, narrator: 5 } }
  people:
    bartender: { name: Rosa }
conflict:
  kinds:
    brawl:
      label: Brawl
      stats: [athletics, charm]
      won: { hint: "They back off." }
      lost: { health: -20 }
actions:
  to_street: { label: Step outside, effects: { place: The Street } }
  to_bar: { label: Go back in, effects: { place: The Bar } }
  vault:
    label: Vault the counter
    check: { vs: hard, add: "athletics / 10" }
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

  test("with nothing to lean on it's a plain roll; checks: false (and a story) turn it off", () => {
    const s = initialState(r);
    expect(turn(s, { actionId: "try:", params: { difficulty: "easy" }, via: "adjudicator" }).rec.check?.add).toBe(0);
    const off = loadRuleset([{ label: "t", content: `${YAML}\nchecks: false`, order: 0 }]).ruleset!;
    expect(improvAction(off, initialState(off), "try:charm")).toBeNull();
    const story = loadRuleset([{ label: "t", content: `${YAML.replace(/conflict:[\s\S]*?actions:/, "actions:").replace(/check: \{[^}]*\}/, "effects: {}")}\nstyle: story`, order: 0 }]).ruleset!;
    expect(improvAction(story, initialState(story), "try:charm")).toBeNull();
  });

  test("in a contest, a typed attempt is a move on its stat", () => {
    let s = initialState(r);
    const start = turn(s, null, { contest: { kind: "brawl", opponent: "Rosa" } });
    s = start.s;
    expect(s.contest).toMatchObject({ kind: "brawl", opponent: "Rosa", who: "bartender", round: 1 });
    expect(stateDigest(r, s)).toContain("Contest: brawl with Rosa");
    const { rec } = turn(s, { actionId: "try:athletics", params: { difficulty: "fair" }, via: "adjudicator" });
    expect(rec.events.some((e) => e.t === "swing")).toBe(true);
    expect(rec.check?.label).toBe("Athletics");
    expect(rec.beats).toContain("beats, in order");
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
    // Space repeated practice out: identical rapid checks now teach less.
    for (let i = 0; i < 40; i++) {
      s.minutes += 120;
      s = turn(s, { actionId: "try:charm", params: { difficulty: "hard" }, via: "adjudicator" }, { seed: `c${i}` }).s;
    }
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
    s = read(s, { people: [{ name: "Miu", feelings: { trust: 30 } }, { name: "Clarice" }], scene: { Rosa: true } }).s;
    const here = () => presentPeople(r, s, makeEnv(r, s)).map((id) => s.people[id].name);
    expect(here()).toEqual(expect.arrayContaining(["Miu", "Clarice", "Rosa"]));
    const left = read(s, { scene: { Clarice: false } });
    s = left.s;
    expect(here()).not.toContain("Clarice");
    expect(summarizeEvents(r, initialState(r), s, left.events).map((c) => c.text)).toContain("Clarice leaves");
    // The narrator only gets relationships for people here; the rest are named apart.
    const digest = stateDigest(r, s);
    expect(digest).toMatch(/Relationships \(here\):[^\n]*Miu/);
    // Rosa's feelings were never read (the ruleset's default): left out, so the narrator follows the story.
    expect(digest).not.toMatch(/Relationships \(here\):[^\n]*Rosa/);
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

  test("moving leaves people behind until the story brings them along", () => {
    let s = read(initialState(r), { people: [{ name: "Miu" }] }).s;
    s = turn(s, { actionId: "to_street", via: "choice" }).s;
    expect(presentPeople(r, s, makeEnv(r, s))).toEqual([]);
    expect(stateDigest(r, s)).toContain("Were with {{user}} before the move");
    s = read(s, { scene: { Miu: true } }).s;
    expect(presentPeople(r, s, makeEnv(r, s))).toEqual(["miu"]);
    // Back at the bar, the story says Rosa is there, then that she stepped out.
    s = turn(s, { actionId: "to_bar", via: "choice" }).s;
    s = read(s, { scene: { Rosa: true } }).s;
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
});

describe("contests from the story", () => {
  test("the prose starting a fight starts a contest, against whoever it's with", () => {
    const s = initialState(r);
    const started = read(s, { contest: { kind: "brawl", opponent: "Rosa", threat: "hard" } }).s;
    expect(started.contest).toMatchObject({ kind: "brawl", opponent: "Rosa", threat: "hard", dc: 16, round: 0 });
    expect(started.notices.join(" ")).toContain("brawl with Rosa starts");
    // An unknown kind starts nothing.
    expect(read(s, { contest: { kind: "duel", opponent: "Rival" } }).s.contest).toBeNull();
  });

  test("the prose can't end it: the old encounter end is ignored", () => {
    const s = read(initialState(r), { contest: { kind: "brawl", opponent: "Rosa" } }).s;
    const over = read(s, { encounterEnd: "lost" } as Proposal).s;
    expect(over.contest).not.toBeNull();
    expect(over.stats.health).toBe(100);
  });
});
