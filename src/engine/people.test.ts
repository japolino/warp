// People (CORE-DESIGN §2.2): band crossings become one story line (in the same reply), bands carry a voice, slow-burn
// caps with a big-moment exception, repeated tags taper, secrets open by band, and the one adults-only check.

import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { foldEvents, initialState, type GameState } from "./state.js";
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
    expect(tagTaper(r, s, "tender", "mira")).toBe(0.25);
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
