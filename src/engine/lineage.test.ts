import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { foldEvents, initialState, kinAge, type GameState } from "./state.js";
import { resolveTurnFull } from "./resolve.js";
import { buildChoices, buildHud, narratorKnowledge, stateDigest } from "./view.js";
import { romanceOk, talkablePeople } from "./date/talk.js";
import type { Ruleset } from "./ruleset.js";

const YAML = (opts: { teen?: boolean; sexual?: boolean } = {}) => `
name: Family
clock: { start: "Mon 08:00" }
start: { location: home }
locations: { home: { name: Home } }
relationships:
  people:
    robin: { name: Robin, age: 30, schedule: [ { at: home } ] }
    sam: { name: Sam, schedule: [ { at: home } ] }
${opts.teen ? "    teen: { name: Teen, age: 16, schedule: [ { at: home } ] }" : ""}
body: { parts: { hair: { color: red } } }
lineage:
  pregnancy:
    weeks: 4
    stages: [ { week: 2, text: "{carrier} has been sick every morning." } ]
  children: { speed: 52, inherit: [hair] }
dating: true
actions:
  night:
    label: A night together
    per_person: true
${opts.sexual === false ? "" : "    tags: [sexual]"}
    effects: { conceive: { with: target, chance: 100 } }
  week: { label: A week passes, time: 10080 }
`;
const r: Ruleset = loadRuleset([{ label: "t", content: YAML(), order: 0 }]).ruleset!;

const act = (s: GameState, id: string, odds?: Record<string, Record<string, number>>, rs: Ruleset = r) => {
  const res = resolveTurnFull(rs, s, { actionId: id, via: "choice" }, { seed: "l", odds });
  return { s: foldEvents(rs, [res.record.events], s), rec: res.record, needs: res.needs };
};

describe("lineage", () => {
  test("a pregnancy stays hidden until its first sign, then shows; the birth adds a child", () => {
    let s = act(initialState(r), "night@robin").s;
    expect(s.pregnancy).toMatchObject({ carrier: "player", with: "robin", told: 0 });
    expect(narratorKnowledge(r, s)).toContain("Nobody knows yet");
    expect(stateDigest(r, s)).not.toContain("pregnant");
    let t = act(s, "week");
    t = act(t.s, "week");
    expect(t.rec.hints.join(" ")).toContain("{{user}} has been sick");
    expect(stateDigest(r, t.s)).toContain("{{user}} is 2 weeks pregnant (Robin's child)");
    t = act(t.s, "week");
    t = act(t.s, "week");
    s = t.s;
    expect(s.pregnancy).toBeNull();
    const kid = Object.values(s.kin)[0];
    expect(kid.body.hair.color).toBe("red");
    expect(t.rec.hints.join(" ")).toContain("never part of anything romantic or sexual");
    expect(buildHud(r, s).family[0].name).toBe(kid.name);
  });

  test("children are out of reach of every action until they come of age — and never a romance", () => {
    let s = act(initialState(r), "night@robin").s;
    for (let i = 0; i < 4; i++) s = act(s, "week").s;
    const [id] = Object.keys(s.kin);
    expect(talkablePeople(r, s)).not.toContain(id);
    expect(buildChoices(r, s, { lines: [], veils: [] }).some((c) => c.id.endsWith(`@${id}`))).toBe(false);
    expect(stateDigest(r, s)).toContain("They are minors");
    // Speed 52: a year per in-game week. At 18 they join the cast as an adult.
    for (let i = 0; i < 19; i++) s = act(s, "week").s;
    expect(kinAge(r, s, id)).toBeGreaterThanOrEqual(18);
    expect(s.people[id]).toBeDefined();
    expect(romanceOk(r, s, id)).toBe(false);
  });

  test("conception needs two known adults", () => {
    // A declared minor alongside sexual actions: the ruleset doesn't load at all.
    expect(loadRuleset([{ label: "t", content: YAML({ teen: true }), order: 0 }]).ruleset).toBeNull();
    // A declared minor in a ruleset without them: conception is still refused.
    const withTeen = loadRuleset([{ label: "t", content: YAML({ teen: true, sexual: false }), order: 0 }]).ruleset!;
    expect(act(initialState(withTeen), "night@teen", undefined, withTeen).s.pregnancy).toBeNull();
    // Unknown age: the model is asked first, and "unsure" counts as no.
    const unknown = act(initialState(r), "night@sam");
    expect(unknown.s.pregnancy).toBeNull();
    expect(unknown.needs.some((n) => n.id === "date:adult:sam")).toBe(true);
    const unsure = act(initialState(r), "night@sam", { "date:adult:sam": { adult: 0.5, minor: 0.1, unclear: 0.4 } });
    expect(unsure.s.pregnancy).toBeNull();
    const adult = act(initialState(r), "night@sam", { "date:adult:sam": { adult: 0.95, minor: 0, unclear: 0.05 } });
    expect(adult.s.pregnancy?.with).toBe("sam");
  });
});
