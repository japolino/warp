// Encounter endings: one classifier (won / escaped / conceded / lost) for quests and the encounter view.

import { describe, expect, test } from "bun:test";
import { normalizeRuleset, type Ruleset } from "./ruleset.js";
import { isLoss, outcomeKind } from "./encounter-view.js";
import { applyEvent, cloneState, initialState } from "./state.js";
import { resolveTurn } from "./resolve.js";

const load = (raw: Record<string, unknown>) => normalizeRuleset(raw);
const rules = (raw: Record<string, unknown>): Ruleset => load(raw).ruleset!;

describe("how an ending counts", () => {
  test("an end_when on the foe heading the player's way is a win, whatever its name (slain)", () => {
    const r = rules({
      stats: { hp: { kind: "meter", start: 50 } },
      encounters: { e: { foe: { stats: { hp: { start: 30, max: 30 } } }, actions: { hit: { label: "Hit", effects: { foe: { hp: -10 } } } }, end_when: { slain: "foe.hp <= 0", beaten: "hp <= 0" } } },
    });
    const e = r.encounters.e;
    expect(e.outcomeKinds).toMatchObject({ slain: "won", beaten: "lost", lost: "lost" });
    expect(isLoss(e, "slain")).toBe(false);
  });

  test("a player stat pushed toward its bad end is a loss, whatever its name (dragged_down)", () => {
    const r = rules({
      stats: { dread: { kind: "meter", good: "low", start: 0 }, focus: { kind: "meter", start: 50 } },
      encounters: { e: { foe: { stats: { will: 10 } }, actions: { a: { effects: { dread: 10 } } }, end_when: { dragged_down: "dread >= 100", banished: "foe.will <= 0", focused: "focus >= 100" } } },
    });
    expect(r.encounters.e.outcomeKinds).toMatchObject({ dragged_down: "lost", banished: "won", focused: "won" });
  });

  test("an interrogation: catching the lie is a win, losing your nerve a loss", () => {
    const r = rules({
      stats: { nerve: { kind: "meter", start: 50 } },
      encounters: { interrogation: {
        foe: { stats: { composure: 12, lie: { start: 0, max: 10, good: "high" } } },
        actions: { press: { effects: { foe: { lie: 5 } } }, walk: { effects: { end: "walked" } } },
        end_when: { cracked: "foe.composure <= 0", caught: "foe.lie >= 10", rattled: "nerve <= 0" },
      } },
    });
    expect(r.encounters.interrogation.outcomeKinds).toMatchObject({ cracked: "won", caught: "won", rattled: "lost", walked: "conceded" });
  });

  test("a move that ends it only on a failure is a loss; only on a success, not one; names sort the rest", () => {
    const r = rules({
      stats: { hp: { kind: "meter", start: 50 } },
      encounters: { e: {
        foe: { stats: { hp: 10 } },
        actions: {
          grab: { label: "Grab the relic", check: { chance: 50 }, success: { end: "snatched" }, fail: { end: "spotted" } },
          run: { label: "Run", check: { chance: 50 }, success: { end: "got_away" }, fail: { hp: -5 } },
          pay: { label: "Pay", effects: { end: "paid_off" } },
          finish: { label: "Finish", check: { chance: 50 }, success: { end: "killed" } },
        },
        end_when: { won: "foe.hp <= 0" },
        timeout_outcome: "stalemate",
      } },
    });
    expect(r.encounters.e.outcomeKinds).toEqual({ won: "won", snatched: "won", spotted: "lost", got_away: "escaped", paid_off: "conceded", killed: "won", stalemate: "escaped" });
  });

  test("the author has the last word: losses: and outcome_kinds:, with readable warnings", () => {
    const { ruleset: r, issues } = load({
      stats: { hp: { kind: "meter", start: 50 } },
      encounters: { e: {
        foe: { stats: { hp: 10 } }, actions: { a: { effects: { foe: { hp: -1 } } } },
        end_when: { slain: "foe.hp <= 0", fled: "hp <= 10", purse: "hp <= 20" },
        losses: ["purse", "nope"],
        outcome_kinds: { fled: "escape", slain: "victory", purse: "lost", bogus: "sideways", lost: "conceded" },
      } },
    });
    expect(r!.encounters.e.outcomeKinds).toMatchObject({ slain: "won", fled: "escaped", purse: "lost", lost: "conceded" });
    const msgs = issues.map((i) => `${i.where}: ${i.message}`);
    expect(msgs.some((m) => m.includes("losses") && m.includes('"nope" isn\'t one of this encounter\'s endings'))).toBe(true);
    expect(msgs.some((m) => m.includes("outcome_kinds › bogus") && m.includes("use won, escaped, conceded or lost"))).toBe(true);
    const bad = load({ encounters: { e: { actions: { a: {} }, losses: 3, outcome_kinds: "x" } } }).issues.map((i) => i.message);
    expect(bad).toContain("expected a list of ending ids, like [beaten, captured]");
    expect(bad).toContain("expected a map of ending id → won, escaped, conceded or lost");
  });

  test("without the author's word, old rulebooks read as before: momentum and the name list", () => {
    const r = rules({ stats: { stress: { kind: "meter", start: 0 } }, encounters: { e: { actions: { a: {} }, momentum: { win: "routed", lose: "broken_line" }, end_when: { beaten: "stress >= 80" } } } });
    const e = r.encounters.e;
    expect([outcomeKind(e, "routed"), outcomeKind(e, "broken_line"), outcomeKind(e, "beaten"), outcomeKind(e, "captured"), outcomeKind(e, "ended")]).toEqual(["won", "lost", "lost", "lost", "won"]);
    expect(outcomeKind(undefined, "slain")).toBe("lost");
  });
});

describe("quests and the classifier", () => {
  test("quest goals count an encounter 'slain' as a win (the quest hook uses the classifier)", () => {
    const r = rules({
      stats: { hp: { kind: "meter", start: 50 } },
      encounters: { wolves: { foe: { stats: { hp: 5 } }, actions: { hit: { label: "Hit", effects: { foe: { hp: -10 } } } }, end_when: { slain: "foe.hp <= 0", beaten: "hp <= 0" } } },
      quests: { cull: { name: "Cull", goals: [{ id: "kills", text: "Kill wolves", count: 1, on: "wolves" }], reward: { hp: 1 } } },
      actions: { take: { label: "Take", effects: { quest: { cull: "start" }, start_encounter: "wolves" } } },
    });
    let s = initialState(r);
    const step = (id: string) => { const rec = resolveTurn(r, s, { actionId: id, via: "choice" }, { seed: `t:${id}:${s.turn}` }); const n = cloneState(s); for (const e of rec.events) applyEvent(n, e, r); s = n; };
    step("take");
    expect(s.encounter?.id).toBe("wolves");
    step("hit");
    expect(s.encounter).toBeNull();
    expect(s.quests.cull).toMatchObject({ st: "done", prog: { kills: 1 } });
  });
});

describe("an encounter's sim: state", () => {
  test("was for the simulator, which left Warp: it is ignored with a plain warning", () => {
    const { ruleset: r, issues } = load({ stats: { hp: { kind: "meter", start: 50 } }, encounters: { boss: { actions: { a: {} }, sim: { stats: { hp: "max" } } } } });
    expect(r!.encounters.boss).toBeDefined();
    expect(issues.some((i) => i.where === "Encounters › boss › sim" && i.message.includes("was removed from Warp"))).toBe(true);
  });
});
