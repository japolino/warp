// What makes a fight a fight: armor and what pierces it, blows that land several
// times, damage as a share of a maximum, statuses on either side that bite each
// round and wear off, lost turns, and gated moves that say what's missing.

import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { applyEvent, cloneState, initialState, type GameState } from "./state.js";
import { resolveTurn, type TurnRecord } from "./resolve.js";
import { buildChoices, buildHud, stateDigest } from "./view.js";
import { lintRuleset } from "./lint.js";

const rules = (extra: Record<string, unknown> = {}) => {
  const { ruleset, issues } = normalizeRuleset({
    clock: { start: "Mon 12:00" },
    stats: {
      hp: { kind: "meter", label: "HP", start: 40, max: 40, good: "high" },
      mana: { kind: "meter", start: 20, max: 20, good: "high" },
      blades: { kind: "skill", max: 100, start: 30 },
      lockpicking: { kind: "skill", max: 100, start: 10 },
    },
    relationships: { stats: { trust: { start: 10 } }, people: { brann: { name: "Brann" }, mia: { name: "Mia" } } },
    locations: { home: { name: "Home" }, vault_door: { name: "Vault Door" } },
    start: { location: "home" },
    items: { shield: { name: "Shield", armor: 2 }, sleeping_draught: { name: "Sleeping Draught" } },
    conditions: {
      poisoned: { label: "Poisoned", tone: "bad", rounds: 3, dot: 4 },
      stunned: { label: "Stunned", tone: "bad", rounds: 1, skip: true },
      sundered: { label: "Sundered", tone: "bad", rounds: 2, armor: -3 },
      regen: { label: "Regenerating", tone: "good", rounds: 2, heal: 5 },
      drowsy: { label: "Drowsy", tone: "warn", lasts: "2h" },
      bleeding: { label: "Bleeding", tone: "bad", every: "hour", dot: 2, stat: "hp", lasts: 180 },
    },
    actions: {
      vault: { label: "Crack the vault", at: ["vault_door"], requires: { lockpicking: 30, with: "brann", has: "shield" }, effects: { hint: "It opens." } },
      drug: { label: "Slip {target} a draught", per_person: true, effects: { inflict: { drowsy: 90 } } },
    },
    encounters: {
      knight: {
        name: "Knight",
        foe: { name: "Black Knight", armor: 4, stats: { hp: { start: 30, max: 30 } } },
        actions: {
          slash: { label: "Slash", tags: ["melee"], effects: { harm: 6 } },
          flurry: { label: "Flurry", tags: ["melee"], effects: { harm: 5, hits: 3 } },
          smite: { label: "Smite", effects: { harm: "50%" } },
          venom: { label: "Venom", effects: { inflict: { poisoned: 3 } } },
          bash: { label: "Shield bash", effects: { inflict: ["stunned"] } },
          sunder: { label: "Sunder", effects: { inflict: ["sundered"] } },
          pierce: { label: "Thrust", effects: { harm: 6, pierce: true } },
          heal: { label: "Second wind", effects: { add_condition: ["regen"] } },
          wait: { label: "Wait", effects: {} },
        },
        foe_moves: { cut: { desc: "Cuts", weight: 1, hp: -6 } },
        end_when: { won: "foe.hp <= 0", beaten: "hp <= 0" },
      },
    },
    ...extra,
  });
  if (!ruleset) throw new Error(issues.map((i) => `${i.where}: ${i.message}`).join("\n"));
  return { r: ruleset, issues };
};
type R = ReturnType<typeof rules>["r"];

const fold = (r: R, s: GameState, rec: TurnRecord) => { const n = cloneState(s); rec.events.forEach((e) => applyEvent(n, e, r)); return n; };
const turn = (r: R, s: GameState, actionId: string, seed = "a") => { const rec = resolveTurn(r, s, { actionId, via: "choice" }, { seed }); return { rec, s: fold(r, s, rec) }; };
const fight = (r: R) => { const s = initialState(r); applyEvent(s, { t: "enc", id: "knight", foe: { hp: 30 }, src: "manual" }, r); return s; };

describe("armor and what gets through it", () => {
  test("armor takes its share off a blow, and every hit of a flurry meets it", () => {
    const { r } = rules();
    expect(turn(r, fight(r), "slash").s.encounter!.foe.hp).toBe(28); // 6 − 4
    const f = turn(r, fight(r), "flurry");
    expect(f.s.encounter!.foe.hp).toBe(27); // 3 × (5 − 4)
    expect(f.rec.hints.join(" ")).toMatch(/armor blunts each of 3 hits/);
  });

  test("piercing ignores it; sundering opens it up", () => {
    const { r } = rules();
    expect(turn(r, fight(r), "pierce").s.encounter!.foe.hp).toBe(24);
    const opened = turn(r, fight(r), "sunder").s;
    expect(turn(r, opened, "slash", "b").s.encounter!.foe.hp).toBe(25); // sundered: armor 4 − 3 = 1, so 6 − 1
  });

  test("a share of the maximum: 50% of a 30-HP knight is 15, before armor", () => {
    const { r } = rules();
    expect(turn(r, fight(r), "smite").s.encounter!.foe.hp).toBe(19); // 15 − 4
  });

  test("{{user}}'s own armor takes its share off the foe's blows", () => {
    const { r } = rules();
    const s = fight(r);
    applyEvent(s, { t: "item", id: "shield", d: 1, src: "manual" }, r);
    expect(turn(r, s, "wait").s.stats.hp).toBe(36); // 6 − 2
    expect(turn(r, fight(r), "wait").s.stats.hp).toBe(34);
  });
});

describe("statuses that bite, cost turns and wear off", () => {
  test("poison on the foe ticks every round it lasts, then ends", () => {
    const { r } = rules();
    let { s, rec } = turn(r, fight(r), "venom");
    expect(s.encounter!.conds).toEqual({ poisoned: 2 });
    expect(s.encounter!.foe.hp).toBe(26); // ignores armor
    expect(rec.hints.join(" ")).toMatch(/poisoned for 3 rounds/);
    ({ s } = turn(r, s, "wait", "b"));
    ({ s } = turn(r, s, "wait", "c"));
    expect(s.encounter!.foe.hp).toBe(18);
    expect(s.encounter!.conds).toEqual({});
    expect(buildHud(r, s).encounter!.foeConds).toEqual([]);
  });

  test("a stunned foe loses its next move", () => {
    const { r } = rules();
    const { s, rec } = turn(r, fight(r), "bash");
    expect(s.stats.hp).toBe(40);
    expect(rec.hints.join(" ")).toMatch(/Black Knight is stunned and loses the turn/);
    expect(turn(r, s, "wait", "b").s.stats.hp).toBe(34); // and then it's back
  });

  test("a stunned player loses their move, and the foe still acts", () => {
    const { r } = rules();
    const s = fight(r);
    applyEvent(s, { t: "cond", id: "stunned", on: true, until: null, rounds: 1, src: "manual" }, r);
    const t = turn(r, s, "slash");
    expect(t.s.encounter!.foe.hp).toBe(30);
    expect(t.s.stats.hp).toBe(34);
    expect(t.rec.action!.label).toMatch(/turn lost/);
    expect(t.s.conditions.stunned).toBeUndefined();
  });

  test("healing over time counts the rounds from the turn after it's cast", () => {
    const { r } = rules();
    let s = fight(r);
    s.stats.hp = 20;
    ({ s } = turn(r, s, "heal"));
    expect(s.conditions.regen?.rounds).toBe(2);
    expect(s.stats.hp).toBe(19); // +5 heal, −6 cut
    ({ s } = turn(r, s, "wait", "b"));
    ({ s } = turn(r, s, "wait", "c"));
    expect(s.conditions.regen).toBeUndefined();
  });

  test("round-counted statuses end with the fight", () => {
    const { r } = rules();
    const s = fight(r);
    applyEvent(s, { t: "cond", id: "poisoned", on: true, until: null, rounds: 3, src: "manual" }, r);
    applyEvent(s, { t: "enc", id: null, outcome: "won", src: "manual" }, r);
    expect(s.conditions.poisoned).toBeUndefined();
  });

  test("hourly bleeding scales with time passed and stops when it wears off", () => {
    const { r } = rules({ actions: { rest: { label: "Rest", time: 120, effects: {} } } });
    const s = initialState(r);
    applyEvent(s, { t: "cond", id: "bleeding", on: true, until: s.minutes + 180, src: "manual" }, r);
    const a = turn(r, s, "rest").s;
    expect(a.stats.hp).toBe(36);
    const b = turn(r, a, "rest", "b").s;
    expect(b.stats.hp).toBe(34); // one more hour of bleeding, then it's over
    expect(b.conditions.bleeding).toBeUndefined();
  });

  test("a status put on someone outside a fight lasts its minutes and shows on their card", () => {
    const { r } = rules();
    let s = initialState(r);
    applyEvent(s, { t: "move", to: "home", src: "manual" }, r);
    applyEvent(s, { t: "scene", who: "mia", here: true, src: "manual" }, r);
    ({ s } = turn(r, s, "drug@mia"));
    expect(s.pconds.mia.drowsy.until).toBe(s.minutes - 10 + 90);
    expect(buildHud(r, s).people.find((p) => p.id === "mia")!.conditions[0].label).toBe("Drowsy");
    expect(stateDigest(r, s)).toContain("Mia is drowsy.");
  });
});

describe("gated moves say what's missing", () => {
  test("a locked move shows at its place with each unmet requirement", () => {
    const { r } = rules();
    const s = initialState(r);
    applyEvent(s, { t: "move", to: "vault_door", src: "manual" }, r);
    applyEvent(s, { t: "scene", who: "brann", here: true, src: "manual" }, r);
    const c = buildChoices(r, s, { lines: [], veils: [] }).find((x) => x.id === "vault")!;
    expect(c.locked).toBe("Needs Lockpicking 30 (you have 10), Shield");
    s.stats.lockpicking = 30;
    applyEvent(s, { t: "item", id: "shield", d: 1, src: "manual" }, r);
    expect(buildChoices(r, s, { lines: [], veils: [] }).find((x) => x.id === "vault")!.locked).toBeUndefined();
  });

  test("someone has to be there: Brann away keeps it locked", () => {
    const { r } = rules();
    const s = initialState(r);
    applyEvent(s, { t: "move", to: "vault_door", src: "manual" }, r);
    s.stats.lockpicking = 30;
    applyEvent(s, { t: "item", id: "shield", d: 1, src: "manual" }, r);
    expect(buildChoices(r, s, { lines: [], veils: [] }).find((x) => x.id === "vault")!.locked).toBe("Needs Brann with you");
    expect(buildChoices(r, initialState(r), { lines: [], veils: [] }).some((x) => x.id === "vault")).toBe(false); // elsewhere it isn't offered at all
  });

  test("the new keys lint clean", () => {
    expect(lintRuleset(rules().r)).toEqual([]);
  });
});
