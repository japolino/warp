import { describe, expect, test } from "bun:test";
import yaml from "js-yaml";
import { lintRuleset } from "./lint.js";
import { normalizeRuleset } from "./ruleset.js";
import { applyProposal, availableChoices, resolveTurn, resolveTurnFull } from "./resolve.js";
import { foldEvents, initialState, type GameState } from "./state.js";
import { buildHud, stateDigest } from "./view.js";

const RULES = yaml.load(`
name: Test Town
clock: { start: "Sun 07:00", date: "Sep 4" }
start: { location: home }
stats:
  health: { kind: meter, start: 100 }
  stress: { kind: meter, good: low, start: 0 }
  charm: { kind: attribute, start: 3, max: 10 }
locations:
  home: { name: Home, indoors: true }
  street: { name: Street }
  park: { name: Park }
relationships:
  stats:
    trust: { start: 10, narrator: 5 }
  people:
    ana:
      name: Ana
actions:
  to_street: { label: Go out, effects: { move: street } }
  to_park: { label: Walk to the park, effects: { move: park } }
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
      won: { hint: "You win." }
      fled: { stress: +5 }
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

  test("calendar", () => {
    const r = load();
    let s = initialState(r);
    s = step(r, s, null, "world-1");
    expect(buildHud(r, s).date).toBe("Sun 4th Sep");
  });

  test("the story puts people in the scene; per-person actions target who's here", () => {
    const r = load();
    let s = initialState(r);
    expect(buildHud(r, s).people.find((p) => p.id === "ana")?.present).toBe(false);
    s = foldEvents(r, [applyProposal(r, s, { scene: { Ana: true } })], s);
    expect(buildHud(r, s).people.find((p) => p.id === "ana")?.present).toBe(true);
    const choices = availableChoices(r, s);
    const chat = choices.find((c) => c.id === "chat@ana");
    expect(chat?.label).toBe("Chat with Ana");
    s = step(r, s, "chat@ana");
    expect(s.rel.ana.trust).toBe(13);
    expect(stateDigest(r, s)).toContain("Present here: Ana");
    // Leaving the place leaves her behind until the story brings her along.
    s = step(r, s, "to_street");
    expect(buildHud(r, s).people.find((p) => p.id === "ana")?.present).toBe(false);
  });

  test("encounters: start, rounds with foe moves, end conditions and outcomes", () => {
    const r = load();
    let s = step(r, initialState(r), "to_street");
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
  });

  test("running away ends with its own outcome", () => {
    const r = load();
    let s = step(r, step(r, initialState(r), "to_street"), "pick_fight");
    s = step(r, s, "run");
    expect(s.encounter).toBeNull();
    expect(s.stats.stress).toBe(5);
  });

});
