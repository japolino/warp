import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { lintRuleset } from "./lint.js";
import { applyEvent, cloneState, initialState, type GameState } from "./state.js";
import { applyProposal, resolveTurn, type TurnRecord } from "./resolve.js";

// Same progress and defeat thresholds as the reported encounter, without its story content.
const encounterRules = () => normalizeRuleset({
  stats: { stress: { start: 0 } },
  encounters: { cornered: {
    foe: { stats: { fervor: { start: 14, max: 14 } } },
    actions: { talk: { check: { chance: 50 }, success: { foe: { fervor: -5 } }, fail: { stress: 20 } } },
    foe_moves: { pressure: { weight: 1, stress: 5 } },
    end_when: { won: "foe.fervor <= 0", overwhelmed: "stress >= 80" },
    outcomes: { won: { remove_condition: ["cornered"] }, overwhelmed: { remove_condition: ["cornered"] } },
  } }, conditions: { cornered: {} },
}).ruleset!;
const begin = (r: ReturnType<typeof encounterRules>) => {
  const s = initialState(r);
  applyEvent(s, { t: "enc", id: "cornered", foe: { fervor: 14 }, src: "manual" }, r);
  applyEvent(s, { t: "cond", id: "cornered", on: true, src: "manual" }, r);
  return s;
};
function result(r: ReturnType<typeof encounterRules>, s: GameState, tier: "success" | "fail"): TurnRecord {
  for (let i = 0; i < 200; i++) {
    const rec = resolveTurn(r, s, { actionId: "talk", via: "choice" }, { seed: `${s.turn}:${i}` });
    if (rec.check?.tier === tier) return rec;
  }
  throw new Error(`No ${tier} seed found`);
}

describe("encounter completion", () => {
  test("three successful checks make progress and finish; contradictory prose cannot reopen it", () => {
    const r = encounterRules(), s = begin(r);
    let final!: TurnRecord;
    for (const remaining of [9, 4, null]) {
      final = result(r, s, "success");
      final.events.forEach((e) => applyEvent(s, e, r));
      expect(s.encounter?.foe.fervor ?? null).toBe(remaining);
    }
    expect(final.events).toContainEqual(expect.objectContaining({ t: "enc", id: null, outcome: "won" }));
    expect(s.conditions.cornered).toBeUndefined();
    const rejected: string[] = [];
    const events = applyProposal(r, s, { encounter: "cornered" }, { text: "Still cornered", applied: final.events, rejected });
    events.forEach((e) => applyEvent(s, e, r));
    expect(s.encounter).toBeNull(); expect(rejected).toEqual(["The encounter already ended in this exchange. Narration cannot restart it."]);
    // A genuine new encounter in a later exchange remains allowed.
    expect(applyProposal(r, s, { encounter: "cornered" }).some((e) => e.t === "enc" && e.id === "cornered")).toBe(true);
  });
  test("failed checks reach a defeat, clear pursuit and cannot reset the foe through narration", () => {
    const r = encounterRules(), s = begin(r);
    let rec!: TurnRecord;
    for (let i = 0; i < 4; i++) {
      rec = result(r, s, "fail"); rec.events.forEach((e) => applyEvent(s, e, r));
    }
    expect(s.encounter).toBeNull(); expect(s.conditions.cornered).toBeUndefined();
    expect(rec.events).toContainEqual(expect.objectContaining({ t: "enc", id: null, outcome: "overwhelmed" }));
    expect(applyProposal(r, s, { encounter: "cornered" }, { text: "reply", applied: rec.events }).some((e) => e.t === "enc")).toBe(false);
  });
  test("ordinary narrative starts and ends still work when mechanics have not ended it", () => {
    const r = encounterRules(), s = initialState(r);
    applyProposal(r, s, { encounter: "cornered" }).forEach((e) => applyEvent(s, e, r));
    expect(s.encounter?.id).toBe("cornered");
    const original = cloneState(s);
    applyProposal(r, s, { encounterEnd: "won" }).forEach((e) => applyEvent(s, e, r));
    expect(s.encounter).toBeNull(); expect(original.encounter?.id).toBe("cornered");
  });
  test("defeat can clear pursuit without the visibility trigger immediately restoring it", () => {
    const r = normalizeRuleset({
      stats: { stress: { start: 85 }, visibility: { start: 100 } }, conditions: { spotted: {}, cornered: {}, scented: {} },
      encounters: { cornered: { actions: { wait: {} }, end_when: { overwhelmed: "stress >= 80" }, outcomes: { overwhelmed: {
        remove_condition: ["cornered", "spotted"], add_condition: ["scented"], set: { visibility: "min(visibility, 25)" },
      } } } },
      triggers: { mobbed: { when: "visibility >= 80", do: { add_condition: ["spotted"] } }, scented: { when: "cond('scented')", repeat: true, do: { visibility: 4 } } },
    }).ruleset!;
    const s = initialState(r); applyEvent(s, { t: "enc", id: "cornered", foe: {}, src: "manual" }, r);
    for (const id of ["spotted", "cornered"]) applyEvent(s, { t: "cond", id, on: true, src: "manual" }, r);
    resolveTurn(r, s, { actionId: "wait", via: "choice" }, { seed: "defeat" }).events.forEach((e) => applyEvent(s, e, r));
    expect(s.encounter).toBeNull(); expect(s.conditions.spotted).toBeUndefined(); expect(s.conditions.cornered).toBeUndefined();
    expect(s.conditions.scented).toBeDefined(); expect(s.stats.visibility).toBe(29);
  });
  test("lint reports an exit placed in an unused checked-action effect", () => {
    const r = normalizeRuleset({ encounters: { bad: { actions: { talk: { check: { chance: 50 }, effects: { end: "won" } } } } } }).ruleset!;
    const issues = lintRuleset(r).map((i) => i.message);
    expect(issues.some((i) => i.includes("a checked action does not execute"))).toBe(true);
    expect(issues.some((i) => i.includes("has no way to end"))).toBe(true);
  });
});
