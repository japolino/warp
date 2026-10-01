import { describe, expect, test } from "bun:test";
import yaml from "js-yaml";
import { lintRuleset } from "./lint.js";
import { normalizeRuleset, type Ruleset } from "./ruleset.js";
import { applyProposal, findAction, NEXT_EVENT, resolveTurn, resolveTurnFull, type Intent } from "./resolve.js";
import { applyEvent, cloneState, foldEvents, initialState, type GameState, type WarpEvent } from "./state.js";
import { buildChoices, buildHud, narratorKnowledge, stateDigest } from "./view.js";
import { cleanChoices, repairTag, usableTags } from "../backend/live.js";

const RULES = yaml.load(`
name: Story Test
clock: { start: "Mon 08:00", narrator_max: 2880 }
start: { location: town }
stats:
  stress: { kind: meter, good: low, start: 0 }
  nerve: { kind: attribute, start: 5, max: 20 }
flags:
  clue: { start: false }
locations:
  town: { name: Town }
relationships:
  stats:
    trust: { start: 10, narrator: 5 }
  people:
    ward: { name: Ward }
actions:
  wait: { label: Wait, time: 60 }
  sleep: { label: Sleep, time: 1440 }
  find_clue: { label: Search, effects: { flags: { clue: true } } }
  calm_town: { label: Calm the town, effects: { front: { gangs: -40 }, gauge: -50 } }
  confront: { label: Confront Ward, effects: { reveal: [ward] } }
secrets:
  ward:
    about: Ward
    cue: "Ward flinches at the observatory."
    tell: exists
    stages:
      - { when: "rel('ward', 'trust') >= 50", text: "A student died on Ward's watch." }
      - { when: "flag('clue')", text: "Ward faked the safety report." }
fronts:
  gangs:
    label: The gangs
    per_day: 20
    story: { "{{user}} angers the gangs": 30 }
    stages:
      - { at: 40, hint: "Broken windows.", backstage: "The gangs took the market.", surface: "A shop burns.", do: { stress: +5 } }
      - { at: 90, surface: "The gangs rule the streets." }
random_events:
  pace: { per_day: 50, jitter: 0, rest_days: 1, omen_at: 60 }
  events:
    storm: { omen: "Gulls fly inland.", text: "A storm hits.", cooldown: 5, do: { stress: +3 } }
live_choices:
  count: 2
  tags:
    bold: { desc: "A risky move", check: { vs: 10, add: nerve }, success: { nerve: +1 }, fail: { stress: +4 } }
    kind: { desc: "Kind to someone", per_person: true, effects: { rel: { target: { trust: +5 } } } }
`);

/** The test ruleset, optionally without some sections (so one system can be watched alone). */
function rules(drop: string[] = []): Ruleset {
  const raw = { ...(RULES as Record<string, unknown>) };
  for (const k of drop) delete raw[k];
  const { ruleset, issues } = normalizeRuleset(raw);
  expect(issues.filter((i) => i.level === "error")).toEqual([]);
  return ruleset!;
}

/** Play a sequence of actions, folding each turn's events. */
function play(r: Ruleset, s: GameState, ids: (string | Intent)[], seed = "t") {
  let st = s;
  const recs = [];
  for (const [i, id] of ids.entries()) {
    const intent: Intent = typeof id === "string" ? { actionId: id, via: "choice" } : id;
    const rec = resolveTurn(r, st, intent, { seed: `${seed}:${i}` });
    st = foldEvents(r, [rec.events], st);
    recs.push(rec);
  }
  return { s: st, recs };
}

describe("secrets", () => {
  test("the cue is known from the start; later stages stay out of the prompt until they open", () => {
    const r = rules();
    const s = initialState(r);
    const known = narratorKnowledge(r, s)!;
    expect(known).toContain("Ward flinches at the observatory.");
    expect(known).toContain("keeping something you don't know");
    expect(known).not.toContain("student died");
    expect(known).not.toContain("safety report");
    expect(stateDigest(r, s)).not.toContain("observatory");
  });

  test("stages open in order when their conditions hold, and never close", () => {
    const r = rules();
    let s = initialState(r);
    // The clue alone can't skip the ladder: stage 1 (trust) must open first.
    s = play(r, s, ["find_clue"]).s;
    expect(narratorKnowledge(r, s)).not.toContain("safety report");
    s = foldEvents(r, [[{ t: "rel", who: "ward", stat: "trust", set: 60, src: "manual" }]], s);
    s = play(r, s, ["wait"]).s;
    const known = narratorKnowledge(r, s)!;
    expect(known).toContain("student died");
    expect(known).toContain("safety report");
    expect(known).not.toContain("keeping something"); // fully told
    // Trust falling again doesn't un-tell it.
    s = foldEvents(r, [[{ t: "rel", who: "ward", stat: "trust", set: 0, src: "manual" }]], s);
    s = play(r, s, ["wait"]).s;
    expect(narratorKnowledge(r, s)).toContain("student died");
  });

  test("reveal opens the next stage whatever its condition", () => {
    const r = rules();
    const s = play(r, initialState(r), ["confront"]).s;
    expect(s.secrets.ward).toBe(1);
    expect(narratorKnowledge(r, s)).toContain("student died");
  });
});

describe("fronts", () => {
  test("clocks fill with in-game time, not replies", () => {
    const r = rules(["random_events"]);
    const quick = play(r, initialState(r), ["wait", "wait"]).s; // 2 hours
    const long = play(r, initialState(r), ["sleep"]).s; // a whole day
    expect(quick.fronts.gangs.v).toBeCloseTo(20 * (2 / 24), 5);
    expect(long.fronts.gangs.v).toBeCloseTo(20, 5);
  });

  test("the hint shows from halfway; the backstage stays hidden until the stage surfaces", () => {
    const r = rules(["random_events"]);
    let s = play(r, initialState(r), ["sleep"]).s; // clock 20 = halfway to 40
    expect(narratorKnowledge(r, s)).toContain("Broken windows.");
    expect(narratorKnowledge(r, s)).not.toContain("took the market");
    const { s: after, recs } = play(r, s, ["sleep"]);
    s = after;
    expect(s.fronts.gangs.stage).toBe(0);
    expect(recs[0].hints.join("\n")).toContain("A shop burns.");
    expect(s.stats.stress).toBe(5);
    const known = narratorKnowledge(r, s)!;
    expect(known).toContain("took the market");
    expect(known).not.toContain("Broken windows."); // that sign has played out
    expect(buildHud(r, s).news[0].text).toBe("A shop burns.");
  });

  test("story beats judged by the decision model push the clock", () => {
    const r = rules(["random_events"]);
    const rec = resolveTurn(r, initialState(r), { actionId: "wait", via: "choice" }, { seed: "x", scene: { "front:gangs:0": true } });
    const s = foldEvents(r, [rec.events], initialState(r));
    expect(s.fronts.gangs.v).toBeCloseTo(30 + 20 / 24, 5);
  });

  test("effects can push a clock back", () => {
    const r = rules(["random_events"]);
    let s = play(r, initialState(r), ["sleep"]).s;
    s = play(r, s, ["calm_town"]).s;
    expect(s.fronts.gangs.v).toBeLessThan(5);
  });

  test("time the story covers after a reply moves the world too, and what surfaces is told next turn", () => {
    const r = rules(["random_events"]);
    let s = play(r, initialState(r), ["sleep"]).s; // clock 20
    const events = applyProposal(r, s, { minutes: 26 * 60 });
    s = foldEvents(r, [events], s);
    expect(s.fronts.gangs.stage).toBe(0);
    expect(s.notices.join(" ")).toContain("A shop burns.");
    const next = resolveTurn(r, s, { actionId: "wait", via: "choice" }, { seed: "n" });
    expect(next.hints.join("\n")).toContain("A shop burns.");
    s = foldEvents(r, [next.events], s);
    expect(s.notices).toEqual([]);
  });
});

describe("random events", () => {
  test("the gauge fills per day, shows an omen, then fires and rests", () => {
    const r = rules();
    let s = play(r, initialState(r), ["sleep"]).s; // 50
    expect(s.gauge.v).toBeCloseTo(50, 5);
    expect(s.gauge.next).toBeNull();
    s = play(r, s, [{ actionId: "wait", via: "choice" }, "wait", "wait", "wait", "wait"]).s; // +~10 → omen line
    expect(s.gauge.next).toBe("storm");
    expect(narratorKnowledge(r, s)).toContain("Gulls fly inland.");
    expect(narratorKnowledge(r, s)).not.toContain("storm");
    const { s: after, recs } = play(r, s, ["sleep"]);
    s = after;
    expect(recs[0].hints).toContain("A storm hits.");
    expect(s.gauge.v).toBe(0);
    expect(s.gauge.next).toBeNull();
    expect(s.gauge.rest).toBe(1);
    expect(buildHud(r, s).news[0].text).toBe("A storm hits.");
  });

  test("events on cooldown don't bank a full gauge", () => {
    const r = rules();
    let s = initialState(r);
    s = foldEvents(r, [[{ t: "happen", id: "storm", src: "world" } as WarpEvent]], s);
    s = play(r, s, ["sleep", "sleep"]).s;
    expect(s.gauge.v).toBe(0);
  });

  test("the decision model's sense of the story is asked for, and then weighs the pick", () => {
    const r = rules();
    let s = play(r, initialState(r), ["sleep"]).s;
    s = foldEvents(r, [[{ t: "gauge", set: 99, src: "manual" } as WarpEvent]], s);
    const first = resolveTurnFull(r, s, { actionId: "wait", via: "choice" }, { seed: "m" });
    expect(first.needs.some((n) => n.id === NEXT_EVENT)).toBe(true);
    const second = resolveTurnFull(r, s, { actionId: "wait", via: "choice" }, { seed: "m", odds: { [NEXT_EVENT]: { storm: 1 } } });
    expect(second.record.events.some((e) => e.t === "happen" && e.id === "storm")).toBe(true);
  });

  test("the gauge effect brings events closer or pushes them back", () => {
    const r = rules();
    let s = play(r, initialState(r), ["sleep"]).s;
    s = foldEvents(r, [[{ t: "gauge", set: 70, src: "manual" } as WarpEvent, { t: "omen", id: "storm", src: "manual" } as WarpEvent]], s);
    s = play(r, s, ["calm_town"]).s;
    expect(s.gauge.v).toBeLessThan(60);
    expect(s.gauge.next).toBeNull(); // below the omen line: the sign fades
  });
});

describe("live choices", () => {
  const live = [
    { label: "Leap the fence", tag: "bold" },
    { label: "Thank Ward warmly", tag: "kind", target: "ward" },
  ];

  test("show first, with odds from their tag", () => {
    const r = rules();
    const choices = buildChoices(r, initialState(r), { lines: [], veils: [], live });
    expect(choices[0].id).toBe("live:0");
    expect(choices[0].label).toBe("Leap the fence");
    expect(choices[0].group).toBe("Right now");
    expect(choices[0].odds).toBeGreaterThan(0.5);
    expect(choices[1].odds).toBeNull();
  });

  test("resolve through the tag, keeping the label the player saw", () => {
    const r = rules();
    let s = initialState(r);
    s = foldEvents(r, [[{ t: "person", id: "ward", name: "Ward", src: "start" } as WarpEvent]], s);
    applyEvent(s, { t: "scene", who: "ward", here: true, src: "start" }, r);
    expect(findAction(r, s, "live:kind@ward")?.target).toBe("ward");
    const rec = resolveTurn(r, s, { actionId: "live:kind@ward", via: "choice", label: "Thank Ward warmly" }, { seed: "l" });
    expect(rec.action?.label).toBe("Thank Ward warmly");
    const after = foldEvents(r, [rec.events], s);
    expect(after.rel.ward.trust).toBe(15);
  });

  test("the writer's output is held to the tag list and the people in the story", () => {
    const r = rules();
    const s = cloneState(initialState(r));
    applyEvent(s, { t: "person", id: "ward", name: "Ward", src: "start" }, r);
    applyEvent(s, { t: "scene", who: "ward", here: true, src: "start" }, r);
    const tags = usableTags(r, { lines: [] });
    expect(repairTag(tags, "Bold move")).toBe("bold");
    expect(repairTag(tags, "sneaky")).toBeNull();
    const out = cleanChoices(r, s, tags, [
      { label: "Leap the fence", tag: "BOLD" },
      { label: "Pickpocket someone", tag: "sneaky" },
      { label: "Hug someone", tag: "kind" },
      { label: "Hug Ward", tag: "kind", target: "ward" },
      { label: "Leap the fence", tag: "bold" },
    ], 5);
    expect(out).toEqual([
      { label: "Leap the fence", tag: "bold" },
      { label: "Hug Ward", tag: "kind", target: "ward" },
    ]);
  });

  test("lint knows the new sections", () => {
    const bad = normalizeRuleset({ ...(RULES as object), actions: { x: { label: "X", effects: { front: { gangz: 1 }, reveal: ["nope"] } } } } as never);
    const issues = lintRuleset(bad.ruleset!).map((i) => i.message).join("\n");
    expect(issues).toContain('front "gangz"');
    expect(issues).toContain('did you mean "gangs"');
    expect(issues).toContain('secret "nope"');
  });
});
