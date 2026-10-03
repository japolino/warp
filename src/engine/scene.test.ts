// Scene state (CORE-DESIGN §2.1): time from the greeting, place as words, who is here, looks as text; no drift; one
// line per field for the narrator; the player can fix any line with one click.

import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { foldEvents, initialState, type GameState, type WarpEvent } from "./state.js";
import { applyProposal, resolveTurn, type Proposal } from "./resolve.js";
import { buildHud, buildRecordView, stateDigest } from "./view.js";
import { applyGreeting, greetingMinutes, manualFix } from "./scene.js";
import { presentPeople } from "./world.js";

const r = normalizeRuleset({
  clock: { start: "greeting", fallback: "Day 1 18:00", minutes_per_action: 15, narrator_max: 720 },
  stats: { money: { kind: "money", start: 20, narrator: 100 } },
  relationships: { stats: { trust: { narrator: 4 } }, people: { mira: { name: "Mira" } } },
  start: { place: "greeting", items: { key: 1 } },
  actions: { wait: { label: "Wait", time: 60 } },
}).ruleset!;
const read = (s: GameState, p: Proposal) => foldEvents(r, [applyProposal(r, s, p)], s);
const fold = (s: GameState, ev: WarpEvent[] | string) => { if (typeof ev === "string") throw new Error(ev); return foldEvents(r, [ev], s); };

describe("the greeting sets turn 0", () => {
  test("time, place, who is here and first looks come from the greeting read", () => {
    const s0 = initialState(r);
    expect(s0.minutes).toBe(18 * 60); // the fallback until the greeting is read
    const s = fold(s0, applyGreeting(r, s0, {
      time: { hour: 23, minute: 40, word: "late night" }, place: "The Rusty Anchor, a harbour bar", present: ["Mira", "the bouncer"],
      you: { outfit: "rain-soaked coat" }, people: { Mira: { appearance: "tall, red braid, freckles", outfit: "green apron over a black shirt" } }, adults: { Mira: true },
    }));
    expect(s.minutes).toBe(23 * 60 + 40);
    expect(s.locationName).toBe("The Rusty Anchor, a harbour bar");
    expect(presentPeople(r, s).sort()).toEqual(["mira", "the_bouncer"]);
    expect(s.look.mira).toMatchObject({ appearance: "tall, red braid, freckles", outfit: "green apron over a black shirt" });
    expect(s.adults.mira).toBe(true);
    const block = stateDigest(r, s, { text: "" });
    expect(block.split("\n")[0]).toBe("Day 1, 23:40 (night) · The Rusty Anchor, a harbour bar");
    expect(block).toContain("Here: Mira, the bouncer.");
    expect(block).toContain("{{user}}: wears rain-soaked coat.");
    expect(block).toContain("Mira: tall, red braid, freckles; wears green apron over a black shirt.");
  });

  test("time words, weekdays, and a greeting with no time keeps the fallback", () => {
    expect(greetingMinutes(r, { word: "evening" })).toBe(19 * 60);
    expect(greetingMinutes(r, { word: "late night" })).toBe(60);
    expect(greetingMinutes(r, { hour: 8, minute: 5, weekday: "Wednesday" })).toBe(2 * 1440 + 8 * 60 + 5);
    expect(greetingMinutes(r, {})).toBeNull();
    const s0 = initialState(r);
    const s = fold(s0, applyGreeting(r, s0, { time: null, place: null, present: [] }));
    expect(s.minutes).toBe(18 * 60);
    // A weekday the greeting names shows from then on.
    const wed = fold(s0, applyGreeting(r, s0, { time: { hour: 8, weekday: "Wed" } }));
    expect(buildHud(r, wed).clock?.day).toBe("Wed · Day 3");
    expect(buildHud(r, s).clock?.day).toBe("Day 1");
  });

  test("a fixed start skips the read for the clock; the ruleset's own looks win", () => {
    const fixed = normalizeRuleset({ clock: { start: "Mon 07:00" }, you: { outfit: "a suit" } }).ruleset!;
    const s0 = initialState(fixed);
    const s = foldEvents(fixed, [applyGreeting(fixed, s0, { time: { hour: 23 }, you: { outfit: "pyjamas", appearance: "tired" } })], s0);
    expect(s.minutes).toBe(7 * 60);
    expect(s.look.you).toMatchObject({ outfit: "a suit", appearance: "tired" });
  });
});

describe("T-S3 no drift", () => {
  test("50 turns: the clock is the start plus every action and capped story minute; place and presence hold", () => {
    let s = fold(initialState(r), applyGreeting(r, initialState(r), { time: { hour: 20 }, place: "The Bar", present: ["Mira"], people: { Mira: { outfit: "an apron" } } }));
    const start = s.minutes;
    let expected = start;
    for (let i = 0; i < 50; i++) {
      const clicked = i % 3 === 0;
      const rec = resolveTurn(r, s, clicked ? { actionId: "wait", via: "choice" } : null, { seed: `d${i}` });
      s = foldEvents(r, [rec.events], s);
      if (clicked) expected += 60;
      const story = (i * 97) % 900; // sometimes past narrator_max (720)
      s = read(s, { minutes: story });
      expected += Math.min(story, 720);
    }
    expect(s.minutes).toBe(expected);
    expect(s.locationName).toBe("The Bar");
    expect(presentPeople(r, s)).toEqual(["mira"]); // nobody leaves after 6 in-game hours
    expect(s.look.mira?.outfit).toBe("an apron");
  });
});

describe("T-S4 one-click fixes", () => {
  test("each field writes one manual event that later turns use", () => {
    let s = fold(initialState(r), applyGreeting(r, initialState(r), { time: { hour: 20 }, place: "The Bar", present: ["Mira"] }));
    s = fold(s, manualFix(r, s, { field: "time", value: "21:15" }));
    expect(s.minutes).toBe(21 * 60 + 15);
    s = fold(s, manualFix(r, s, { field: "time", value: "Day 2 08:00" }));
    expect(s.minutes).toBe(1440 + 8 * 60);
    s = fold(s, manualFix(r, s, { field: "place", value: "The docks" }));
    expect(s.locationName).toBe("The docks");
    s = fold(s, manualFix(r, s, { field: "present", who: "mira", value: true }));
    expect(presentPeople(r, s)).toEqual(["mira"]);
    s = fold(s, manualFix(r, s, { field: "outfit", who: "you", value: "a borrowed jacket" }));
    s = fold(s, manualFix(r, s, { field: "appearance", who: "mira", value: "soaked" }));
    s = fold(s, manualFix(r, s, { field: "item", who: "key", value: 3 }));
    s = fold(s, manualFix(r, s, { field: "money", value: 75 }));
    expect([s.look.you?.outfit, s.look.mira?.appearance, s.items.key, s.stats.money]).toEqual(["a borrowed jacket", "soaked", 3, 75]);
    const next = foldEvents(r, [resolveTurn(r, s, null, { seed: "n" }).events], s);
    expect(stateDigest(r, next)).toContain("{{user}}: wears a borrowed jacket.");
    // Bad values are refused in words.
    expect(manualFix(r, s, { field: "time", value: "soon" })).toBe("Write a time like 23:40 or Day 2 08:00.");
    expect(manualFix(r, s, { field: "present", who: "nobody", value: true })).toBe("Unknown person.");
    // A fix is a manual change in the "what changed" line, with undo indexes.
    const ev = manualFix(r, s, { field: "place", value: "Home" }) as WarpEvent[];
    const view = buildRecordView(r, "m", 0, { v: 1, hints: [], events: ev, at: 0 }, s, foldEvents(r, [ev], s));
    expect(view.changes[0]).toMatchObject({ text: "→ Home", src: "manual", undo: [0] });
  });
});

describe("T-S5 one line per field", () => {
  test("no field twice; looks only when they matter now", () => {
    let s = fold(initialState(r), applyGreeting(r, initialState(r), { time: { hour: 20 }, place: "The Bar", present: ["Mira"], people: { Mira: { outfit: "an apron" } }, you: { outfit: "a coat" } }));
    for (let i = 0; i < 4; i++) s = foldEvents(r, [resolveTurn(r, s, null, { seed: `x${i}` }).events], s);
    const quiet = stateDigest(r, s, { text: "I ask about the weather." });
    const lines = quiet.split("\n");
    expect(new Set(lines).size).toBe(lines.length);
    expect(quiet).not.toContain("wears");
    // The turn names her clothes: her look comes in.
    expect(stateDigest(r, s, { text: "I compliment Mira's apron, the clothes suit her." })).toContain("Mira: wears an apron.");
    // A changed line comes in for two turns.
    const changed = read(s, { looks: { Mira: { outfit: "a raincoat" } } });
    expect(stateDigest(r, changed, { text: "" })).toContain("Mira: wears a raincoat.");
    // Before the first read the block never says nobody is here.
    expect(stateDigest(r, initialState(r), { text: "" })).not.toContain("none of the people");
  });
});
