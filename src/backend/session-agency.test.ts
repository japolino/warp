import { describe, expect, test } from "bun:test";
import type { Answers, Decider, Questions } from "../engine/decide.js";
import { loadRuleset } from "../engine/loader.js";
import { resolveTurnFull, type Intent } from "../engine/resolve.js";
import { foldEvents, initialState, type GameState } from "../engine/state.js";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";
import { readTurn } from "./decisions.js";

const r = loadRuleset([{ label: "agency", order: 0, content: `
name: Session agency
clock: { start: "Mon 10:00", minutes_per_action: 5 }
start: { location: cafe, items: { tea: 2 } }
locations:
  cafe: { name: Café, exits: [street] }
  street: { name: Street, exits: [cafe] }
stats:
  cash: { kind: money, start: 100 }
  skill: { kind: skill, start: 20, max: 100 }
hud: { money: cash }
relationships:
  people: { robin: { name: Robin, age: 25 } }
improvise: { enabled: true }
abilities:
  focus:
    name: Focus
    known: true
    action: { label: Focus, effects: { cash: -1 } }
items:
  tea:
    name: Tea
    use: { label: Drink tea, effects: { cash: -1 } }
actions:
  stretch: { label: Fight the urge to nap, effects: { cash: -2 } }
  leave: { label: Leave, effects: { move: street } }
  brawl: { label: Start trouble, tags: [combat] }
  alarm: { label: Raise alarm, effects: { encounter: fight } }
  locked: { label: Impossible, at: [street] }
encounters:
  fight:
    name: Fight
    foe: { hp: 10 }
    actions: { hit: { label: Hit } }
jobs:
  cafe:
    label: Café shift
    at: [cafe]
    customers: 3
    pay: 30
    tip: 5
    patrons: [ { who: Customer, want: quick } ]
    styles: { quick: Serve quickly }
` }]).ruleset!;
function turn(s: GameState, actionId: string | null, extra = {}) {
  const intent: Intent | null = actionId ? { actionId, via: "adjudicator" } : null;
  const out = resolveTurnFull(r, s, intent, { seed: "agency", ...extra });
  return { ...out, s: foldEvents(r, [out.record.events], s) };
}
function session(_kind: "job") {
  return turn(initialState(r), "job:start:cafe").s;
}
class Script implements Decider {
  id = "jev" as const;
  canWrite = false;
  asked: Questions = {};
  constructor(private action: string, private confidence = 0.95) {}
  async ask(_s: unknown, q: Questions): Promise<Answers> {
    this.asked = q;
    return { action: { type: "choice", choice: this.action, confidence: this.confidence, probabilities: { [this.action]: this.confidence } } };
  }
}
async function read(s: GameState, d: Script) {
  return readTurn({ r, s, decider: d, settings: DEFAULT_SETTINGS, playerText: "My latest message", sceneText: "In the café", player: "Sam", timeoutMs: 1000 });
}
describe("typed action agency inside sessions", () => {
  for (const kind of ["job"] as const) {
    test(`${kind}: classifier retains normal, travel, item, and improv candidates`, async () => {
      const s = session(kind);
      expect(s.job).toBeTruthy();
      for (const id of ["stretch", "go:street", "item:tea", "ability:focus", "attempt"]) {
        const d = new Script(id);
        const result = await read(s, d);
        const action = d.asked.action;
        expect(action.type).toBe("choice");
        if (action.type !== "choice") throw new Error("missing action question");
        expect(action.criteria[id]).toBeDefined();
        expect(action.instructions).toContain("Ordinary dialogue");
        expect(result.intent?.actionId).toBe(id === "attempt" ? "try:skill" : id);
      }
    });
    test(`${kind}: medium suggestion spends nothing and does not process dialogue`, async () => {
      const s = session(kind);
      const result = await read(s, new Script("go:street", 0.55));
      expect(result.intent).toBeNull();
      expect(result.suggestion?.actionId).toBe("go:street");
      const out = turn(s, result.intent?.actionId ?? null, { pendingSuggestion: !!result.suggestion });
      expect(out.record.events).toEqual([]);
      expect(out.needs).toEqual([]);
      expect(out.s).toEqual(s);
      // Confirmation still commits even if the caller leaves the suggestion flag set.
      expect(turn(s, "go:street", { pendingSuggestion: true }).s.location).toBe("street");
    });
    test(`${kind}: ordinary NONE and classifier-disabled null still process session dialogue`, async () => {
      const s = session(kind);
      const result = await read(s, new Script("none"));
      expect(result.intent).toBeNull();
      expect(result.suggestion).toBeNull();
      for (const extra of [{}, { pendingSuggestion: false }]) {
        const out = turn(s, null, extra);
        expect(out.record.action?.id).toBe(`${kind}:say`);
      }
    });
    test(`${kind}: compatible same-place normal and item actions preserve session`, () => {
      const s = session(kind);
      for (const id of ["stretch", "item:tea"]) {
        const out = turn(s, id);
        expect(out.record.action?.id).toBe(id);
        expect(out.s.location).toBe(s.location);
        expect(out.s[kind]).toEqual(s[kind]);
        expect(out.s.stats.cash).toBeLessThan(s.stats.cash);
        expect(out.record.events.some(e => e.t === "job")).toBe(false);
      }
    });
    test(`${kind}: travel and authored movement end session; invalid actions do nothing`, () => {
      const s = session(kind);
      for (const id of ["go:street", "leave"]) {
        const out = turn(s, id);
        expect(out.s.location).toBe("street");
        expect(out.s[kind]).toBeNull();
        expect(out.s.stats.cash).toBe(s.stats.cash);
      }
      const invalid = turn(s, "locked");
      expect(invalid.record.events).toEqual([]);
      expect(invalid.s).toEqual(s);
    });
    test(`${kind}: action-started encounter ends session without paying a shift`, () => {
      const s = session(kind);
      const out = turn(s, "alarm");
      expect(out.s.encounter?.id).toBe("fight");
      expect(out.s[kind]).toBeNull();
      expect(out.s.stats.cash).toBe(s.stats.cash);
    });
  }
  test("a combat-tagged action aborts work with no pay, not a harmless label guess", () => {
    const s = session("job");
    const out = turn(s, "brawl");
    expect(out.s.job).toBeNull();
    expect(out.s.stats.cash).toBe(s.stats.cash);
    expect(out.record.hints.join(" ")).toContain("no pay");
  });
});
