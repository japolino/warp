// Story goals (CORE-DESIGN §2.6): read from the story (up to 3 open), authored goals close by formula, a goal is
// in the narrator's block only while it's in play, and only the rules close one.

import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { foldEvents, initialState, makeEnv, type GameState } from "./state.js";
import { applyProposal, resolveTurn, type Proposal } from "./resolve.js";
import { buildHud, buildRecordView, stateDigest } from "./view.js";
import { evaluate } from "./expr.js";
import { manualFix } from "./scene.js";

const r = normalizeRuleset({
  clock: { start: "Day 1 09:00" },
  stats: { gold: { kind: "money", start: 0 } },
  flags: { sister_found: false },
  relationships: { stats: { trust: { narrator: 5 } }, people: { mira: { name: "Mira", age: 30 }, jo: { name: "Jo", age: 40 } } },
  goals: {
    max: 3,
    list: { find_sister: { text: "Find out what happened to your sister", done_when: "flag('sister_found')", stakes: "She may not survive the winter", reward: { gold: 50 } } },
  },
  actions: { search: { label: "Search the docks", effects: { flags: { sister_found: true } } } },
}).ruleset!;
const read = (s: GameState, p: Proposal) => { const events = applyProposal(r, s, p); return { events, s: foldEvents(r, [events], s) }; };

describe("T-G2 goals from the story", () => {
  test("new goals up to the max; a duplicate is one goal; done closes it and the person remembers", () => {
    let s = initialState(r);
    expect(Object.keys(s.goals)).toEqual(["find_sister"]);
    const first = read(s, { goals: { new: [{ text: "Get Mira's brother out of jail", from: "Mira", stakes: "He hangs at dawn" }, { text: "Pay Jo back", from: "Jo" }] } });
    s = first.s;
    expect(Object.values(s.goals).filter((g) => g.st === "open")).toHaveLength(3);
    const gid = Object.keys(s.goals).find((id) => s.goals[id].text.startsWith("Get Mira"))!;
    expect(s.goals[gid]).toMatchObject({ st: "open", from: "mira", stakes: "He hangs at dawn" });
    // A fourth is dropped; the same text again is one goal.
    s = read(s, { goals: { new: [{ text: "get mira's brother out of jail!" }, { text: "A fourth goal" }] } }).s;
    expect(Object.keys(s.goals)).toHaveLength(3);
    const done = read(s, { goals: { done: [gid] } });
    s = done.s;
    expect(s.goals[gid].st).toBe("done");
    expect(s.memories.mira?.[0].text).toBe("{{user}} kept their promise: Get Mira's brother out of jail.");
    expect(buildRecordView(r, "m", 0, { v: 1, hints: [], events: done.events, at: 0 }, first.s, s).changes.map((c) => c.text)).toContain("Goal done: Get Mira's brother out of jail");
    // Now there is room again.
    expect(Object.keys(read(s, { goals: { new: [{ text: "A fourth goal" }] } }).s.goals)).toHaveLength(4);
    // A failed story goal: the person remembers that too.
    const pay = Object.keys(s.goals).find((id) => s.goals[id].text === "Pay Jo back")!;
    expect(read(s, { goals: { failed: ["Pay Jo back"] } }).s.goals[pay].st).toBe("failed");
  });

  test("goals: { from_story: false } keeps only authored goals", () => {
    const off = normalizeRuleset({ goals: { from_story: false } }).ruleset!;
    const s = initialState(off);
    expect(foldEvents(off, [applyProposal(off, s, { goals: { new: [{ text: "Anything" }] } })], s).goals).toEqual({});
  });
});

describe("T-G3 an authored goal", () => {
  test("done_when closes it when the flag flips; the reward applies once; goal() reads its state", () => {
    let s = initialState(r);
    expect(evaluate("goal('find_sister')", makeEnv(r, s))).toBe("open");
    s = foldEvents(r, [resolveTurn(r, s, { actionId: "search", via: "choice" }, { seed: "x" }).events], s);
    expect(s.goals.find_sister.st).toBe("done");
    expect(s.stats.gold).toBe(50);
    s = foldEvents(r, [resolveTurn(r, s, { actionId: "search", via: "choice" }, { seed: "y" }).events], s);
    expect(s.stats.gold).toBe(50);
    expect(evaluate("goal('find_sister')", makeEnv(r, s))).toBe("done");
  });

  test("the player can mark a goal done, failed or drop it with one click", () => {
    const s = initialState(r);
    const ev = manualFix(r, s, { field: "goal", who: "find_sister", value: "failed" });
    expect(Array.isArray(ev)).toBe(true);
    expect(foldEvents(r, [ev as never], s).goals.find_sister.st).toBe("failed");
    expect(foldEvents(r, [manualFix(r, s, { field: "goal", who: "find_sister", value: "drop" }) as never], s).goals.find_sister).toBeUndefined();
  });
});

describe("T-G4 a goal is in the block only while it's in play", () => {
  test("absent when not in play; present when its person is here, when named, or while new", () => {
    let s = read(initialState(r), { goals: { new: [{ text: "Get Mira's brother out of jail", from: "Mira" }] } }).s;
    // New: in play for a few turns.
    expect(stateDigest(r, s, { text: "" })).toContain("Get Mira's brother out of jail");
    s = { ...s, turn: s.turn + 10 };
    expect(stateDigest(r, s, { text: "I order a drink." })).not.toContain("Mira's brother");
    // Her being here brings it in.
    const withMira = read(s, { scene: { Mira: true } }).s;
    expect(stateDigest(r, withMira, { text: "I order a drink." })).toContain('"Get Mira\'s brother out of jail" (for Mira)');
    // Named in the turn.
    expect(stateDigest(r, s, { text: "What about the jail?" })).not.toContain("Mira's brother");
    expect(stateDigest(r, s, { text: "Her brother is still in jail." })).toContain("Mira's brother");
    // The helpers see every open goal; the panel lists open goals first.
    expect(stateDigest(r, s)).toContain("Find out what happened to your sister");
    expect(buildHud(r, s).goals.map((g) => g.status)).toEqual(["open", "open"]);
    expect(buildHud(r, s).goals.find((g) => g.id === "find_sister")?.stakes).toBe("She may not survive the winter");
  });
});
