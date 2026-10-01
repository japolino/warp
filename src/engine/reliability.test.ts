import { describe, expect, test } from "bun:test";
import { compileRuleset, loadRuleset } from "./loader.js";
import { normalizeRuleset } from "./ruleset.js";
import { applyProposal, odds, resolveTurn, validateIntent } from "./resolve.js";
import { applyEvent, initialState, statMax } from "./state.js";
import { lintRuleset } from "./lint.js";
import { decodeProposal } from "./proposal.js";
import { decodeAnswers } from "./decide.js";
import { loreAccess } from "./knowledge.js";
import { narratorKnowledge } from "./view.js";

const rules = (raw: unknown) => normalizeRuleset(raw).ruleset!;
describe("execution invariants", () => {
  test("unavailable actions and malformed parameters cause no events", () => {
    const r = rules({ stats: { hp: { start: 50 } }, actions: { forbidden: { when: "false", effects: { hp: 10 } }, allowed: { params: { difficulty: { options: { fair: 5 }, default: "fair" } } } } });
    const s = initialState(r);
    expect(resolveTurn(r, s, { actionId: "forbidden", via: "choice" }, { seed: "s" }).events).toEqual([]);
    expect(validateIntent(r, s, { actionId: "allowed", via: "choice", params: { unknown: "anything" } })).toContain("parameter");
  });
  test("dynamic caps are initialized after dependencies and reconcile after changes", () => {
    const r = rules({ stats: { hp: { start: 90, max: "level * 10" }, level: { start: 10, max: 20 } } });
    const s = initialState(r); expect(s.stats.hp).toBe(90);
    applyEvent(s, { t: "stat", id: "level", set: 2, src: "manual" }, r);
    expect(s.stats.hp).toBe(20); expect(s.stats.hp).toBeLessThanOrEqual(statMax(r, r.stats.hp, s));
  });
  test("gameplay refuses non-finite YAML while the editor retains diagnostics", () => {
    const parts = [{ label: "bad", content: "stats: { hp: { start: 50 } }\nactions: { x: { effects: { hp: .nan } } }", order: 0 }];
    expect(loadRuleset(parts).issues.some((i) => i.level === "error")).toBe(true);
    expect(compileRuleset(parts).ruleset).toBeNull();
  });
  test("lint checks names in short-circuited branches", () => {
    const r = rules({ stats: { hp: { start: 50 } }, actions: { x: { when: "hp > 0 or typo > 0" } } });
    expect(lintRuleset(r).some((i) => i.message.includes('"typo"'))).toBe(true);
  });
  test("cyclic caps cannot enter gameplay and long reverse trigger chains settle", () => {
    const cycle = compileRuleset([{ label: "cycle", content: "stats: { a: { max: b }, b: { max: a } }", order: 0 }]);
    expect(cycle.ruleset).toBeNull(); expect(cycle.issues.some((i) => i.message.includes("cycle"))).toBe(true);
    const triggers = Object.fromEntries(Array.from({ length: 12 }, (_, i) => { const id = 11 - i; return [`t${id}`, { when: id === 0 ? "true" : `flag('f${id - 1}')`, effects: { flags: { [`f${id}`]: true } } }]; }));
    const r = rules({ triggers });
    const rec = resolveTurn(r, initialState(r), null, { seed: "chain" });
    expect(rec.events.some((e) => e.t === "flag" && e.key === "f11")).toBe(true);
    expect(rec.events.filter((e) => e.t === "flag").length).toBe(12);
  });
});
describe("reported odds", () => {
  test("d100 includes the modifier and state after costs", () => {
    const r = rules({ stats: { hp: { start: 50 } }, actions: { x: { cost: { hp: -10 }, check: { chance: "hp", dice: "d100", add: 20, crits: false } } } });
    expect(odds(r, initialState(r), r.actions.x)!.success).toBeCloseTo(0.2, 12);
    expect(odds(r, initialState(r), r.actions.x)!.approximate).toBeUndefined();
  });
  test("2d6 PbtA and kept d20 distributions are exact", () => {
    const r = rules({ actions: { pbta: { check: { style: "pbta", dice: "2d6", add: 0 } }, advantage: { check: { vs: 11, dice: "2d20kh1", crits: false } } } });
    expect(odds(r, initialState(r), r.actions.pbta)!.success).toBeCloseTo(6 / 36, 12);
    expect(odds(r, initialState(r), r.actions.pbta)!.partial).toBeCloseTo(15 / 36, 12);
    expect(odds(r, initialState(r), r.actions.advantage)!.success).toBeCloseTo(0.75, 12);
  });
});
describe("untrusted observations", () => {
  test("malformed helper JSON is total and bounded", () => {
    const r = rules({ stats: { hp: { start: 50, narrator: 10 } }, relationships: { open: true } });
    for (const p of [null, [], { move: 123, people: {}, wear: 42 }, { stats: { hp: NaN }, flags: { x: Infinity } }, { people: [{ name: 123 }] }]) expect(() => applyProposal(r, initialState(r), p as never)).not.toThrow();
    expect(decodeProposal({ people: Array(500).fill({ name: "Someone" }) }).people!.length).toBe(32);
  });
  test("narration cannot reverse decided facts or double-count elapsed time", () => {
    const r = rules({ clock: { start: 0 }, flags: { unlocked: { narrator: true } }, locations: { a: {}, b: {} }, start: { location: "a" } });
    const s = initialState(r), applied = [{ t: "flag", key: "unlocked", v: true, src: "action" }, { t: "move", to: "b", src: "action" }, { t: "time", min: 10, src: "action" }] as const;
    applied.forEach((e) => applyEvent(s, e, r));
    const rejected: string[] = [], events = applyProposal(r, s, { flags: { unlocked: false }, move: "a", minutes: 10 }, { text: "reply", applied: [...applied], rejected });
    events.forEach((e) => applyEvent(s, e, r));
    expect(s.flags.unlocked).toBe(true); expect(s.location).toBe("b"); expect(s.minutes).toBe(10); expect(rejected.length).toBe(2);
  });
  test("total observations subtract actual clamped mechanics before applying limits", () => {
    const r = rules({ stats: { hp: { start: 95, narrator: 10 } }, items: { potion: {} }, start: { items: { potion: 1 } } });
    const origin = initialState(r), after = initialState(r);
    const applied = [{ t: "stat", id: "hp", d: 20, src: "action" }, { t: "item", id: "potion", d: 1, src: "action" }] as const;
    applied.forEach((e) => applyEvent(after, e, r));
    const events = applyProposal(r, after, { basis: "total", stats: { hp: 5 }, items: { potion: 1 } }, { text: "The decided effects happened", applied: [...applied], origin });
    expect(events.some((e) => e.t === "stat" || e.t === "item")).toBe(false);
    expect(applyProposal(r, after, { basis: "total", stats: { hp: -2 } }, { text: "Then takes seven damage", applied: [...applied], origin }).find((e) => e.t === "stat")).toMatchObject({ d: -7 });
  });
  test("Unicode names and colliding slugs retain separate people", () => {
    const r = rules({ relationships: { open: true, stats: { trust: {} } } }), s = initialState(r);
    applyProposal(r, s, { people: [{ name: "美咲" }, { name: "明" }, { name: "Jean-Luc" }, { name: "Jean Luc" }, { name: "John Smith" }, { name: "John Doe" }] }).forEach((e) => applyEvent(s, e, r));
    expect(Object.keys(s.people).length).toBe(6);
    expect(new Set(Object.values(s.people).map((p) => p.name)).size).toBe(6);
  });
  test("typed decisions reject invalid keys, ranges and non-finite values", () => {
    const q = { x: { type: "choice" as const, instructions: "Pick", criteria: { a: "A", b: "B" } }, y: { type: "noul" as const, instructions: "True?" } };
    expect(decodeAnswers({ x: { choice: "a", probabilities: { a: NaN, b: 1 } }, y: { noul: 1.1 } }, q)).toEqual({});
    expect(decodeAnswers({ x: { choice: "bogus", confidence: 0.9 } }, q)).toEqual({});
    expect(decodeAnswers({ x: { choice: "a", probabilities: { a: 0.8, b: 0.2 } } }, q).x).toMatchObject({ confidence: 0.8 });
  });
});
test("shared lore requires every gate, and companion prompts exclude locked contents", () => {
  const r = rules({ secrets: { secret: { about: "Robin", stages: [{ when: "false", text: "CANARY", lore: ["Robin private"] }] } }, codex: { profile: { lore: ["Robin private"] } }, relationships: { people: { robin: { name: "Robin" } } }, companions: { robin: { knows: ["secret"] } } });
  const s = initialState(r); s.codex.profile = true;
  expect(loreAccess(r, s, "[Merged] Robin private").open).toBe(false);
  expect(narratorKnowledge(r, s)).not.toContain("CANARY");
  s.secrets.secret = 0; expect(loreAccess(r, s, "Robin private").open).toBe(true);
});
