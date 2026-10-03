import { describe, expect, test } from "bun:test";
import yaml from "js-yaml";
import { lintRuleset } from "./lint.js";
import { normalizeRuleset } from "./ruleset.js";
import { applyProposal, availableChoices, resolveTurn } from "./resolve.js";
import { foldEvents, initialState, type GameState } from "./state.js";
import { buildHud, stateDigest } from "./view.js";

const RULES = yaml.load(`
name: Test Town
clock: { start: "Sun 07:00", date: "Sep 4" }
start: { place: Home }
stats:
  health: { kind: meter, start: 100 }
  stress: { kind: meter, good: low, start: 0 }
  charm: { kind: attribute, start: 3, max: 10 }
relationships:
  stats:
    trust: { start: 10, narrator: 5 }
  people:
    ana:
      name: Ana
actions:
  to_street: { label: Go out, effects: { place: Street } }
  chat:
    label: Chat with {target}
    per_person: true
    effects: { rel: { target: { trust: +3 } }, hint: "They chat." }
  pick_fight:
    label: Pick a fight
    when: "place == 'Street'"
    effects: { contest: { kind: fight, with: "the thug" } }
conflict:
  kinds:
    fight: { label: Fight, stats: [charm], escaped: { stress: +5 } }
`);

const load = () => {
  const { ruleset, issues } = normalizeRuleset(RULES);
  expect(issues.filter((i) => i.level === "error")).toEqual([]);
  return ruleset!;
};

const step = (r: ReturnType<typeof load>, s: GameState, actionId: string | null, seed = "t") =>
  foldEvents(r, [resolveTurn(r, s, actionId ? { actionId, via: "choice" } : null, { seed }).events], s);

describe("the world", () => {
  test("the test ruleset lints clean", () => {
    expect(lintRuleset(load())).toEqual([]);
  });

  test("calendar: the weekday and date show when the ruleset gives them", () => {
    const r = load();
    let s = initialState(r);
    s = step(r, s, null, "world-1");
    expect(buildHud(r, s).date).toBe("Sun 4th Sep");
    expect(buildHud(r, s).clock?.day).toBe("Sun · Day 7");
  });

  test("the story puts people in the scene; per-person actions target who's here", () => {
    const r = load();
    let s = initialState(r);
    expect(buildHud(r, s).people.find((p) => p.id === "ana")?.present).toBe(false);
    s = foldEvents(r, [applyProposal(r, s, { scene: { Ana: true } })], s);
    expect(buildHud(r, s).people.find((p) => p.id === "ana")?.present).toBe(true);
    const chat = availableChoices(r, s).find((c) => c.id === "chat@ana");
    expect(chat?.label).toBe("Chat with Ana");
    // Per-person actions are buttons in the person's row.
    expect(buildHud(r, s).people.find((p) => p.id === "ana")?.actions.map((a) => a.id)).toEqual(["chat@ana"]);
    s = step(r, s, "chat@ana");
    expect(s.rel.ana.trust).toBe(13);
    expect(stateDigest(r, s)).toContain("Here: Ana.");
    // Leaving the place leaves her behind until the story brings her along.
    s = step(r, s, "to_street");
    expect(buildHud(r, s).people.find((p) => p.id === "ana")?.present).toBe(false);
    expect(buildHud(r, s).wereWithYou).toEqual([{ id: "ana", name: "Ana" }]);
  });

  test("an effect starts a contest; in it, the choices are its moves and Break off", () => {
    const r = load();
    let s = step(r, initialState(r), "to_street");
    s = step(r, s, "pick_fight");
    expect(s.contest).toMatchObject({ kind: "fight", opponent: "the thug", threat: "fair", dc: 12 });
    expect(availableChoices(r, s).map((c) => c.id).slice(0, 3)).toEqual(["contest:charm", "contest:break_off", "contest:give_in"]);
    s = step(r, s, "contest:give_in");
    expect(s.contest).toBeNull();
    expect(s.lastContest?.outcome).toBe("gave_in");
  });
});
