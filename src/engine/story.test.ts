import { describe, expect, test } from "bun:test";
import yaml from "js-yaml";
import { lintRuleset } from "./lint.js";
import { normalizeRuleset, type Ruleset } from "./ruleset.js";
import { applyProposal, findAction, resolveTurn, type Intent } from "./resolve.js";
import { applyEvent, cloneState, foldEvents, initialState, type GameState, type WarpEvent } from "./state.js";
import { buildChoices, narratorKnowledge, stateDigest } from "./view.js";
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
  confront: { label: Confront Ward, effects: { reveal: [ward] } }
secrets:
  ward:
    about: Ward
    cue: "Ward flinches at the observatory."
    tell: exists
    stages:
      - { when: "rel('ward', 'trust') >= 50", text: "A student died on Ward's watch." }
      - { when: "flag('clue')", text: "Ward faked the safety report." }
triggers:
  new_day: { when: "day >= 2", do: { hint: "A new day dawns over the town." } }
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

/** What the narrator knows with Ward in the scene (a person's secret only rides along while they're here). */
function knownWithWard(r: Ruleset, s: GameState) {
  const here = structuredClone(s);
  here.scene.ward = { here: true, loc: here.location, at: here.minutes };
  return narratorKnowledge(r, here);
}

describe("secrets", () => {
  test("the cue is known from the start; later stages stay out of the prompt until they open", () => {
    const r = rules();
    const s = initialState(r);
    const known = knownWithWard(r, s)!;
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
    expect(knownWithWard(r, s)).not.toContain("safety report");
    s = foldEvents(r, [[{ t: "rel", who: "ward", stat: "trust", set: 60, src: "manual" }]], s);
    s = play(r, s, ["wait"]).s;
    const known = knownWithWard(r, s)!;
    expect(known).toContain("student died");
    expect(known).toContain("safety report");
    expect(known).not.toContain("keeping something"); // fully told
    // Trust falling again doesn't un-tell it.
    s = foldEvents(r, [[{ t: "rel", who: "ward", stat: "trust", set: 0, src: "manual" }]], s);
    s = play(r, s, ["wait"]).s;
    expect(knownWithWard(r, s)).toContain("student died");
  });

  test("reveal opens the next stage whatever its condition", () => {
    const r = rules();
    const s = play(r, initialState(r), ["confront"]).s;
    expect(s.secrets.ward).toBe(1);
    expect(knownWithWard(r, s)).toContain("student died");
  });

  test("a person's secret stays out while they aren't here", () => {
    const r = rules();
    const s = initialState(r);
    s.scene.ward = { here: false, loc: s.location, at: s.minutes };
    expect(narratorKnowledge(r, s) ?? "").not.toContain("Ward");
  });
});

describe("notices", () => {
  test("time the story covers after a reply runs the rules too, and what they say is told next turn", () => {
    const r = rules();
    let s = initialState(r);
    const events = applyProposal(r, s, { minutes: 26 * 60 });
    s = foldEvents(r, [events], s);
    expect(s.notices.join(" ")).toContain("A new day dawns");
    const next = resolveTurn(r, s, { actionId: "wait", via: "choice" }, { seed: "n" });
    expect(next.hints.join("\n")).toContain("A new day dawns");
    s = foldEvents(r, [next.events], s);
    expect(s.notices).toEqual([]);
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
      { label: "Leap the fence", tag: "bold", difficulty: "fair" },
      { label: "Hug Ward", tag: "kind", target: "ward", difficulty: "none" },
    ]);
  });

  test("lint knows the story sections", () => {
    const bad = normalizeRuleset({ ...(RULES as object), actions: { x: { label: "X", effects: { reveal: ["nope"] } } } } as never);
    const issues = lintRuleset(bad.ruleset!).map((i) => i.message).join("\n");
    expect(issues).toContain('secret "nope"');
  });
});
