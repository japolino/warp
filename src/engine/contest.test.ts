// Conflict (CORE-DESIGN §2.5): one momentum gauge for fights, chases and arguments. Contests last 3–6 rounds, the
// narrator (or the story) can't end one early, every round reaches the narrator as ordered beats.

import { describe, expect, test } from "bun:test";
import { normalizeRuleset, DIFFICULTIES } from "./ruleset.js";
import { foldEvents, initialState, type GameState } from "./state.js";
import { applyProposal, availableChoices, resolveTurn, type Intent, type Proposal } from "./resolve.js";
import { rollD20, seededRng } from "./dice.js";
import { buildChoices, buildHud, buildRecordView, outcomePacket, stateDigest } from "./view.js";
import { BREAK_OFF, GIVE_IN, contestMoveId, simulateContest, swingFor } from "./contest.js";

const r = normalizeRuleset({
  clock: { start: "Day 1 22:00" },
  stats: {
    health: { kind: "meter", narrator: 20 }, energy: { kind: "meter" }, mood: { kind: "meter", start: 60 },
    body: { kind: "attribute", max: 10, start: 3 }, mind: { kind: "attribute", max: 10, start: 5 }, charm: { kind: "attribute", max: 10, start: 3 },
  },
  relationships: { stats: { trust: { narrator: 5 } }, people: { bruno: { name: "Bruno", age: 40 } } },
  actions: { rest: { label: "Catch your breath", effects: { energy: +5 } } },
}).ruleset!;

const step = (s: GameState, intent: Intent | null, seed: string) => {
  const rec = resolveTurn(r, s, intent, { seed });
  return { rec, s: foldEvents(r, [rec.events], s) };
};
const start = (threat: "easy" | "fair" | "hard" | "extreme" = "fair", opponent = "the bouncer") =>
  foldEvents(r, [applyProposal(r, initialState(r), { contest: { kind: "fight", opponent, threat } })], initialState(r));
/** A seed whose d20 shows this face. */
const seedFor = (face: number) => { for (let i = 0; i < 2000; i++) if (rollD20(seededRng(`k${i}`)) === face) return `k${i}`; throw new Error("no seed"); };

describe("T-K1 length", () => {
  test("add 0–6 × 4 threats: mean 3–6 rounds, ≥ 80 % end in 3–6 rounds, ≤ 5 % break off", () => {
    for (let add = 0; add <= 6; add++) for (const threat of DIFFICULTIES) {
      const sim = simulateContest(r, "fight", add, threat, 2000);
      expect(sim.meanRounds).toBeGreaterThanOrEqual(3);
      expect(sim.meanRounds).toBeLessThanOrEqual(6);
      expect(sim.within).toBeGreaterThanOrEqual(0.8);
      expect(sim.brokenOff).toBeLessThanOrEqual(0.05);
    }
    // Deterministic per seed.
    expect(simulateContest(r, "fight", 2, "fair", 500, "a")).toEqual(simulateContest(r, "fight", 2, "fair", 500, "a"));
  });

  test("the stakes rise each round", () => {
    expect([1, 2, 3, 8].map((n) => swingFor(r, "success", n))).toEqual([35, 49, 63, 133]);
    expect(swingFor(r, "crit_fail", 4)).toBe(-110);
  });
});

describe("T-K2 nobody can end it early", () => {
  test("rounds 1–2 never end it, even with two crits: the gauge stops at 90", () => {
    let s = start();
    const crit = seedFor(20);
    s = step(s, null, crit).s;
    expect(s.contest?.momentum).toBe(50);
    s = step(s, null, crit).s;
    expect(s.contest).toMatchObject({ round: 2, momentum: 90 });
    s = step(s, null, crit).s;
    expect(s.contest).toBeNull();
    expect(s.lastContest?.outcome).toBe("won");
  });

  test("the story saying the fight ended does not end it", () => {
    const s = start();
    // An old reader's "the encounter ended" field: unknown now, and ignored.
    const after = foldEvents(r, [applyProposal(r, s, { encounterEnd: "won", minutes: 5 } as Proposal)], s);
    expect(after.contest).not.toBeNull();
    expect(stateDigest(r, after, { text: "" })).toContain("Not over until the rules end it.");
  });
});

describe("T-K3 every round is in the chat, as ordered beats", () => {
  test("each round's block has the check, three beats and the not-over line; the last says it ends", () => {
    let s = start("hard");
    const { rec, s: next } = step(s, { actionId: "contest:body", via: "choice", label: "Feint left and sweep his legs" }, seedFor(14));
    const packet = outcomePacket(r, rec, s, next, "Sam")!;
    expect(packet).toContain("Contest: fight with the bouncer — round 1 of at most 8.");
    // The state line in the same block counts the same round (it is built after the move).
    expect(stateDigest(r, next, { text: "" })).toContain("Contest: fight with the bouncer — after round 1,");
    expect(stateDigest(r, s, { text: "" })).toContain("Contest: fight with the bouncer — just started,");
    expect(packet).toContain("Check: Body — d20 14 + 3 = 17 vs 16 (hard) → SUCCESS");
    expect(packet).toContain("1. {{user}}: Feint left and sweep his legs, and it lands well.");
    expect(packet).toContain("2. The bouncer gives ground.");
    expect(packet).toContain("3. Where it stands:");
    expect(packet).toContain("do not finish it");
    const view = buildRecordView(r, "m", 0, rec, s, next);
    expect(view.contest).toMatchObject({ kind: "fight", round: 1, swing: 35, momentum: 35, outcome: null });
    expect(view.changes[0].text).toBe("Momentum +35 · You have the upper hand");
    // Typed: kept exactly as written.
    s = next;
    const typed = step(s, null, seedFor(3));
    expect(typed.rec.beats).toContain("keep the move exactly as {{user}} wrote it, but it doesn't land");
    // Play to the end: the last round says so.
    let cur = typed.s, last = typed.rec;
    for (let i = 0; i < 10 && cur.contest; i++) { const o = step(cur, null, `end${i}`); last = o.rec; cur = o.s; }
    expect(cur.contest).toBeNull();
    expect(last.beats).toContain("This round ends it");
  });
});

describe("T-K4 exits", () => {
  test("Give in loses at once; Break off success gets away; failure is a failed round", () => {
    const s = start();
    const gave = step(s, { actionId: GIVE_IN, via: "choice" }, "g").s;
    expect(gave.lastContest?.outcome).toBe("gave_in");
    expect(gave.stats.health).toBe(100 - 10); // the kind's lost effects
    const away = step(s, { actionId: BREAK_OFF, via: "choice" }, seedFor(19)).s;
    expect(away.lastContest?.outcome).toBe("escaped");
    expect(away.stats.energy).toBe(90);
    const stuck = step(s, { actionId: BREAK_OFF, via: "choice" }, seedFor(2));
    expect(stuck.s.contest).toMatchObject({ round: 1, momentum: -35 });
    expect(stuck.s.stats.health).toBe(92); // cost.fail
  });

  test("a round spent on something else counts: its effects apply, no roll, the opponent presses", () => {
    const s = start();
    const busy = step(s, { actionId: "rest", via: "choice" }, "b");
    expect(busy.rec.check).toBeUndefined();
    expect(busy.s.stats.energy).toBe(100);
    expect(busy.s.contest).toMatchObject({ round: 1, momentum: -20 });
    expect(busy.rec.beats).toContain("presses while {{user}} is busy");
  });

  test("a won contest against a tracked person leaves a memory", () => {
    let s = start("easy", "Bruno");
    expect(s.contest?.who).toBe("bruno");
    for (let i = 0; i < 10 && s.contest; i++) s = step(s, null, seedFor(20)).s;
    expect(s.lastContest?.outcome).toBe("won");
    expect(s.memories.bruno?.[0].text).toBe("{{user}} beat them in a fight.");
  });
});

describe("T-K5 starts from the story", () => {
  test("a proposal starts it at 0 with the threat's DC; the next move is round 1; the panel shows it; no restart within 15 minutes", () => {
    const s = start("hard");
    expect(s.contest).toMatchObject({ kind: "fight", opponent: "the bouncer", threat: "hard", dc: 16, round: 0, momentum: 0 });
    const hud = buildHud(r, s);
    expect(hud.conflict).toMatchObject({ label: "Fight", opponent: "the bouncer", round: 0, maxRounds: 8, words: "Evenly matched" });
    expect(hud.conflict?.next).toEqual({ odds: 0.5, stat: "Mind" }); // Mind 5 → +5 vs 16
    let cur = step(s, { actionId: GIVE_IN, via: "choice" }, "g").s;
    const again = foldEvents(r, [applyProposal(r, cur, { contest: { kind: "fight", opponent: "The Bouncer" } })], cur);
    expect(again.contest).toBeNull();
    cur = { ...cur, minutes: cur.minutes + 20 };
    expect(foldEvents(r, [applyProposal(r, cur, { contest: { kind: "fight", opponent: "the bouncer" } })], cur).contest).not.toBeNull();
    // A typed message can start one: it begins before the move lands, and this message is round 1.
    const typed = resolveTurn(r, initialState(r), null, { seed: "t", contest: { kind: "argument", opponent: "Bruno" } });
    expect(foldEvents(r, [typed.events], initialState(r)).contest).toMatchObject({ kind: "argument", round: 1 });
    // Not in a story.
    const story = normalizeRuleset({ style: "story", relationships: { stats: { trust: {} } } }).ruleset!;
    expect(applyProposal(story, initialState(story), { contest: { kind: "fight", opponent: "x" } }).some((e) => e.t === "contest")).toBe(false);
  });
});

describe("T-K6 no dominant move", () => {
  test("two moves on different stats show different odds; the choices are the moves and Break off", () => {
    const s = start();
    const live = [{ label: "Bait him into over-reaching", tag: "contest:mind" }, { label: "Shove him back", tag: "contest:body" }];
    const view = buildChoices(r, s, { lines: [], veils: [], live });
    expect(view.map((c) => [c.id, Math.round(c.odds! * 100)])).toEqual([["live:0", 70], ["live:1", 60], ["contest:break_off", 75]]);
    // Without written moves, the kind's stats.
    expect(buildChoices(r, s, { lines: [], veils: [] }).map((c) => c.id)).toEqual(["contest:body", "contest:mind", "contest:break_off"]);
    expect(availableChoices(r, s).map((c) => c.id).slice(0, 4)).toEqual(["contest:body", "contest:mind", "contest:break_off", "contest:give_in"]);
    // The clicked written move rolls the stat it names.
    const rec = resolveTurn(r, s, { actionId: "live:contest:mind", via: "choice", label: "Bait him" }, { seed: "m" });
    expect(rec.check?.label).toBe("Mind");
    // The win rate follows only the stat difference.
    const m = simulateContest(r, "fight", 5, "fair", 4000), b = simulateContest(r, "fight", 3, "fair", 4000);
    expect(m.won).toBeGreaterThan(b.won);
    expect(simulateContest(r, "fight", 3, "fair", 4000).won).toBe(b.won);
  });
});

describe("a swing: effect (ADVENTURE-3)", () => {
  const rules = (min: number) => normalizeRuleset({
    style: "adventure",
    stats: { body: { kind: "attribute", max: 10, start: 5 }, mood: { kind: "meter", start: 50 } },
    conflict: { rounds: { min, max: 8 }, kinds: { fight: { label: "Fight", stats: ["body"], escape: "body", won: { mood: 10, hint: "The bandit yields." }, lost: { hint: "lost" }, escaped: { hint: "escaped" } } } },
    triggers: { second_wind: { when: "in_contest() and round == 1", do: { swing: 100 } } },
  }).ruleset!;
  const round1 = (min: number) => {
    const sw = rules(min);
    const s = foldEvents(sw, [applyProposal(sw, initialState(sw), { contest: { kind: "fight", opponent: "the bandit" } })], initialState(sw));
    const rec = resolveTurn(sw, s, { actionId: contestMoveId("body"), via: "choice" }, { seed: seedFor(10) });
    return { rec, s: foldEvents(sw, [rec.events], s) };
  };
  test("before rounds.min it stops at +90, like a check, and the contest runs on", () => {
    const { s } = round1(3);
    expect(s.contest?.momentum).toBe(90);
  });
  test("from rounds.min a full swing ends the contest as won, with the kind's effects", () => {
    const { s, rec } = round1(1);
    expect(s.contest).toBeNull();
    expect(s.stats.mood).toBe(60);
    expect(rec.hints.join(" ")).toContain("The bandit yields.");
  });
});
