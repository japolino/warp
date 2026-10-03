// People (CORE-DESIGN §2.2): band crossings become one story line (in the same reply), bands carry a voice, slow-burn
// caps with a big-moment exception, repeated tags taper, secrets open by band, and the one adults-only check.

import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { foldEvents, initialState, makeEnv, type GameState } from "./state.js";
import { evalBool } from "./expr.js";
import { applyProposal, resolveTurn, type Proposal } from "./resolve.js";
import { buildChoices, buildRecordView, narratorKnowledge, outcomePacket, stateDigest } from "./view.js";
import { bandCrossings, crossingLines, recentTags, tagTaper, voiceLine } from "./people.js";

const STORY = {
  style: "story",
  clock: { start: "Day 1 18:00" },
  relationships: {
    big_moment: { factor: 3, cooldown: 10 },
    stats: {
      affection: { start: 10, narrator: 4, bands: {
        0: { text: "Cold", say_down: "{name} has gone cold on you." },
        10: { text: "Neutral", say_down: "{name} has cooled toward you." },
        25: { text: "Warm", say: "{name} is warming to you.", voice: "{name} relaxes around {{user}}: small jokes, first names." },
        45: { text: "Fond", say: "{name} is fond of you now." },
      } },
      trust: { start: 15, narrator: 4, bands: {
        0: { text: "Guarded", voice: "{name} gives nothing personal away." },
        20: { text: "Wary" },
        40: { text: "Open", say: "{name} is starting to open up.", voice: "{name} shares small personal things when asked." },
        65: { text: "Trusting", say: "{name} trusts you." },
      } },
    },
    people: { mira: { name: "Mira", age: 27 }, jo: { name: "Jo", age: 30 }, kit: { name: "Kit", age: 16 } },
  },
  secrets: {
    past: {
      person: "mira", tell: "exists", cue: "Mira changes the subject when her hometown comes up.",
      stages: [{ band: { trust: "Open" }, text: "Mira left her hometown after a fire." }, { band: { trust: "Trusting" }, text: "Her brother died in it." }],
    },
  },
  live_choices: { tags: {
    tender: { desc: "Something warm", per_person: true, effects: { rel: { target: { trust: +2 } } } },
    flirt: { desc: "Flirting", per_person: true, tags: ["romantic"], effects: { rel: { target: { affection: +2 } } } },
  } },
};
const r = normalizeRuleset(STORY).ruleset!;
const here = (s: GameState, ...who: string[]) => foldEvents(r, [applyProposal(r, s, { scene: Object.fromEntries(who.map((w) => [w, true])) })], s);
const read = (s: GameState, p: Proposal) => { const events = applyProposal(r, s, p); return { events, s: foldEvents(r, [events], s) }; };

describe("first feelings", () => {
  test("feelings nobody has read yet stay out of the narrator block; the first read (or any change) brings them in", () => {
    const s = here(initialState(r), "Mira");
    expect(s.calibrated.mira).toBeUndefined();
    const first = stateDigest(r, s, { text: "" });
    expect(first).toContain("Here: Mira.");
    expect(first).not.toContain("Relationships (here)");
    expect(first).not.toContain("acts now");
    const known = foldEvents(r, [applyProposal(r, s, { people: [{ name: "Mira", feelings: { trust: 5 } }] })], s);
    expect(known.calibrated.mira).toBe(true);
    expect(stateDigest(r, known, { text: "" })).toContain("How Mira acts now: gives nothing personal away.");
  });
});

describe("T-P1 a crossing shows in the same reply; the next block says it and the voice", () => {
  test("a post-reply crossing: first in that reply's lines, opening the next narrator block", () => {
    let s = here(initialState(r), "Mira");
    s.rel.mira.trust = 38;
    const { events, s: after } = read(s, { rel: { Mira: { trust: +4 } } });
    expect(after.rel.mira.trust).toBe(42);
    const view = buildRecordView(r, "m1", 0, { v: 1, hints: [], events, at: 0 }, s, after);
    expect(view.lines).toEqual(["Mira is starting to open up."]);
    const next = resolveTurn(r, after, null, { seed: "n" });
    expect(next.hints[0]).toBe("Since the last reply: Mira is starting to open up.");
    const block = stateDigest(r, after, { text: "" });
    expect(block).toContain("How Mira acts now:");
    expect(voiceLine(r, after, "mira")).toBe("How Mira acts now: shares small personal things when asked.");
  });

  test("going down uses say_down; a missing line falls back to the band; one line per person, at most three", () => {
    const s = here(initialState(r), "Mira", "Jo");
    s.rel.mira.affection = 26;
    s.rel.mira.trust = 18;
    const after = read(s, { rel: { Mira: { affection: -4, trust: +4 } } }).s;
    const c = bandCrossings(r, s, after);
    expect(c.find((x) => x.stat === "affection")?.line).toBe("Mira has cooled toward you.");
    expect(c.find((x) => x.stat === "trust")?.line).toBe("Mira: Trust — Wary.");
    expect(crossingLines(c)).toHaveLength(1);
  });

  test("when one person crosses two bands at once, the author's own line wins over a bigger generated one", () => {
    const s = here(initialState(r), "Mira");
    s.rel.mira.affection = 20;
    s.rel.mira.trust = 15;
    // Rules move both at once: affection 20 -> 26 enters Warm (authored line); trust 15 -> 30 enters Wary (no line of its own), the bigger move.
    const after = structuredClone(s);
    after.rel.mira.affection = 26;
    after.rel.mira.trust = 30;
    expect(crossingLines(bandCrossings(r, s, after))).toEqual(["Mira is warming to you."]);
  });

  test("moves compare by their stat's range: a step on a 0-4 ladder beats a bigger number on a 0-100 meter", () => {
    const rr = normalizeRuleset({
      style: "story",
      clock: { start: "Day 1 18:00" },
      relationships: {
        stats: {
          stage: { start: 0, max: 4, narrator: 0, bands: { 0: "Strangers", 1: { text: "Friends", say: "{name} and you are friends now." } } },
          tension: { start: 0, narrator: 20, bands: { 0: "Calm", 10: { text: "Charged", say: "The air between you and {name} is charged." } } },
        },
        people: { mira: { name: "Mira", age: 27 } },
      },
    }).ruleset!;
    const s0 = foldEvents(rr, [applyProposal(rr, initialState(rr), { scene: { Mira: true } })], initialState(rr));
    const s1 = foldEvents(rr, [applyProposal(rr, s0, { rel: { Mira: { tension: +20 } } })], s0);
    s1.rel.mira.stage = 1;
    expect(crossingLines(bandCrossings(rr, s0, s1))).toEqual(["Mira and you are friends now."]);
  });
});

describe("T-P2 a crossing before the reply goes into the outcome packet", () => {
  test("a clicked tag that crosses a band: Show in this reply", () => {
    const s = here(initialState(r), "Mira");
    s.rel.mira.trust = 39;
    const rec = resolveTurn(r, s, { actionId: "live:tender@mira", via: "choice", label: "Pour her a coffee" }, { seed: "x" });
    expect(rec.lines).toEqual(["Mira is starting to open up."]);
    expect(outcomePacket(r, rec, s, foldEvents(r, [rec.events], s), "Sam")).toContain("Show in this reply: Mira is starting to open up.");
  });
});

describe("T-P3 slow-burn caps and the big moment", () => {
  test("+20 → +4; a big moment → +12 (one band at most); not again within 10 turns; another person still can", () => {
    const s = here(initialState(r), "Mira", "Jo");
    expect(read(s, { rel: { Mira: { trust: +20 } } }).s.rel.mira.trust).toBe(19);
    const big = read(s, { rel: { Mira: { trust: +20 } }, moments: ["Mira"] });
    expect(big.s.rel.mira.trust).toBe(27);
    expect(big.events.some((e) => e.t === "big" && e.who === "mira")).toBe(true);
    // Within the cooldown: capped again.
    const later = { ...big.s, turn: big.s.turn + 5 };
    expect(read(later, { rel: { Mira: { trust: +20 } }, moments: ["Mira"] }).s.rel.mira.trust).toBe(31);
    // Someone else's moment works.
    expect(read(later, { rel: { Jo: { trust: +20 } }, moments: ["Jo"] }).s.rel.jo.trust).toBe(27);
    // After the cooldown, again.
    const much = { ...big.s, turn: big.s.turn + 10 };
    expect(read(much, { rel: { Mira: { trust: +20 } }, moments: ["Mira"] }).s.rel.mira.trust).toBe(39);
    // Never more than one band: with a big factor, from Guarded it may reach Wary (20) but not Open (40).
    const wide = normalizeRuleset({ ...STORY, relationships: { ...STORY.relationships, big_moment: { factor: 10, cooldown: 10 } } }).ruleset!;
    const near = foldEvents(wide, [applyProposal(wide, initialState(wide), { scene: { Mira: true } })], initialState(wide));
    near.rel.mira.trust = 10;
    const capped = foldEvents(wide, [applyProposal(wide, near, { rel: { Mira: { trust: +40 } }, moments: ["Mira"] })], near);
    expect(capped.rel.mira.trust).toBe(39);
  });
});

describe("T-P4 repeated tags taper; no dominant kind", () => {
  test("8 clicks of the same tag on the same person give far less than 8 fresh ones; switching restores it", () => {
    let s = here(initialState(r), "Mira", "Jo");
    const start = s.rel.mira.trust;
    for (let i = 0; i < 8; i++) {
      s = foldEvents(r, [resolveTurn(r, s, { actionId: "live:tender@mira", via: "choice" }, { seed: `t${i}` }).events], s);
    }
    const gain = s.rel.mira.trust - start;
    expect(gain).toBeLessThanOrEqual(12);
    expect(gain).toBeLessThan(8 * 2 * 0.5);
    expect(tagTaper(r, s, "tender", "mira")).toBeCloseTo(1 / (1 + 0.75 * 8));
    expect(recentTags(r, s).tender).toBeGreaterThanOrEqual(8);
    // Another target is fresh.
    expect(tagTaper(r, s, "tender", "jo")).toBe(1);
    const jo = foldEvents(r, [resolveTurn(r, s, { actionId: "live:tender@jo", via: "choice" }, { seed: "j" }).events], s);
    expect(jo.rel.jo.trust - s.rel.jo.trust).toBe(2);
    // Eight turns later it recovers.
    expect(tagTaper(r, { ...s, turn: s.turn + 8 }, "tender", "mira")).toBe(1);
  });
});

describe("T-P5 secrets open by band", () => {
  test("stage 1 stays out of every prompt until trust reaches Open; stage 2 never before stage 1", () => {
    let s = here(initialState(r), "Mira");
    expect(r.secrets.past.stages[1].when).toBe("rel('mira', 'trust') >= 40");
    expect(narratorKnowledge(r, s)).toContain("changes the subject");
    expect(narratorKnowledge(r, s)).not.toContain("fire");
    s.rel.mira.trust = 70; // jumps past both bands at once
    s = foldEvents(r, [resolveTurn(r, s, null, { seed: "x" }).events], s);
    expect(s.secrets.past).toBe(2);
    expect(narratorKnowledge(r, s)).toContain("fire");
    const unknown = normalizeRuleset({ ...STORY, secrets: { x: { person: "mira", stages: [{ band: { trust: "Opne" }, text: "t" }] } } });
    expect(unknown.issues.find((i) => i.where.startsWith("Secrets › x"))?.message).toContain('did you mean "Open"');
  });
});

describe("T-P6 adults only", () => {
  test("a romantic tag is never offered toward someone under 18; unknown age only after the adult answer", () => {
    let s = here(initialState(r), "Mira", "Kit");
    const live = [{ label: "Tease Kit", tag: "flirt", target: "kit" }, { label: "Tease Mira", tag: "flirt", target: "mira" }];
    expect(buildChoices(r, s, { lines: [], veils: [], live }).map((c) => c.label)).toEqual(["Tease Mira"]);
    expect(stateDigest(r, s, { text: "" })).toContain("Kit is not known to be an adult: nothing romantic or sexual.");
    // Someone new, age unknown: not until the read says they're an adult.
    s = read(s, { people: [{ name: "Ren" }] }).s;
    const ren = [{ label: "Tease Ren", tag: "flirt", target: "ren" }];
    expect(buildChoices(r, s, { lines: [], veils: [], live: ren })).toEqual([]);
    s = read(s, { people: [{ name: "Ren", adult: true }] }).s;
    expect(buildChoices(r, s, { lines: [], veils: [], live: ren }).map((c) => c.label)).toEqual(["Tease Ren"]);
    // A declared minor can't be made an adult by the story.
    expect(read(s, { people: [{ name: "Kit", adult: true }] }).events.some((e) => e.t === "adult")).toBe(false);
  });
});

describe("a band crossing without say: (ADVENTURE-8, PRESSURE-3, LONG-8)", () => {
  const m = normalizeRuleset({
    style: "story",
    stats: {
      furnace: { kind: "meter", max: 3, start: 0, bands: { 0: "Off", 2: "Half", 3: "Max" } },
      job: { kind: "meter", good: "none", max: 3, start: 0, bands: { 0: { text: "No job booked", say: "", say_down: "" }, 2: { text: "Local radio", say: "", say_down: "" } } },
    },
    relationships: { stats: { trust: { start: 10, narrator: 50, bands: { 0: "Wary", 40: "Open" } } }, people: { jo: { name: "Jo", start: { trust: 10 } } } },
  }).ruleset!;
  test("{{user}}'s stat names itself, as a person's does, and ends with a full stop", () => {
    const a = initialState(m);
    const b = { ...a, stats: { ...a.stats, furnace: 3 }, rel: { ...a.rel, jo: { trust: 45 } } };
    expect(crossingLines(bandCrossings(m, a, b))).toEqual(["Jo: Trust — Open.", "Furnace — Max."]);
  });
  test('say: "" turns the line off', () => {
    const a = initialState(m);
    const b = { ...a, stats: { ...a.stats, job: 2 } };
    expect(bandCrossings(m, a, b)).toHaveLength(1);
    expect(crossingLines(bandCrossings(m, a, b))).toEqual([]);
    expect(crossingLines(bandCrossings(m, b, a))).toEqual([]);
  });
});

describe("met() (ADVENTURE-11)", () => {
  const m = normalizeRuleset({
    style: "story",
    relationships: { open: true, stats: { trust: { start: 20, narrator: 5 } }, people: { bark: { name: "Bark" } } },
    flags: { introduced: { start: false } },
    triggers: { first_meeting: { when: "met('bark')", do: { flags: { introduced: true } } } },
  }).ruleset!;
  const read = (s: GameState, p: Proposal) => foldEvents(m, [applyProposal(m, s, p)], s);
  test("a declared person is met once the story brings them into a scene", () => {
    let s = read(initialState(m), { place: "The Square" });
    expect(s.flags.introduced).toBe(false);
    s = read(s, { scene: { Bark: true } });
    expect(s.flags.introduced).toBe(true);
  });
  test("someone the story introduces is met at once", () => {
    const s = read(initialState(m), { rel: { Selene: { trust: 2 } } });
    expect(evalBool("met('selene')", makeEnv(m, s), false)).toBe(true);
  });
});
