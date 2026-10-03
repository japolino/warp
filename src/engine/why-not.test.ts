import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { foldEvents, initialState } from "./state.js";
import { applyProposal } from "./resolve.js";
import { buildChoices, buildHud } from "./view.js";

// The reference: `when:` shows a move only while it holds; `why_not: "…"` shows it locked, with why, instead.
const r = normalizeRuleset({
  style: "story",
  clock: { start: "Day 1 09:00" },
  stats: { last_gift: { kind: "hidden", start: 0, min: -10, max: 1000 } },
  relationships: {
    stats: { affection: { start: 10, narrator: 4, bands: { 0: "Cold", 50: "Warm" } } },
    people: { mira: { name: "Mira", age: 27 }, jo: { name: "Jo", age: 30 } },
  },
  actions: {
    sleep: { label: "Sleep", when: "between(hour, 21, 5)", why_not: "Not tired yet", time: 480 },
    nap: { label: "Nap", when: "between(hour, 13, 15)", time: 30 },
    gift: { label: "Give a gift", per_person: true, targets: ["mira"], when: "turn - last_gift >= 3", why_not: "Too soon for another gift" },
    hug: { label: "Hug {target}", per_person: true, when: "target.affection >= 50" },
  },
}).ruleset!;
const s0 = initialState(r);
const s = foldEvents(r, [applyProposal(r, s0, { scene: { Mira: true, Jo: true } })], s0);
s.stats.last_gift = 0;

describe("why_not shows a move locked, with why, instead of hiding it", () => {
  test("in the choices: a move with why_not is locked with its reason; one without stays hidden", () => {
    const choices = buildChoices(r, s, { showChoices: true, veils: [], lines: [] } as any);
    expect(choices.find((c) => c.label === "Sleep")?.locked).toBe("Not tired yet");
    expect(choices.find((c) => c.label === "Nap")).toBeUndefined();
  });

  test("in a person's row: locked with its reason; only for the people in targets:; no why_not = hidden", () => {
    const people = buildHud(r, s).people;
    const mira = people.find((p) => p.id === "mira")!.actions;
    const jo = people.find((p) => p.id === "jo")!.actions;
    expect(mira.find((a) => a.label === "Give a gift")?.locked).toBe("Too soon for another gift");
    expect(jo.find((a) => a.label === "Give a gift")).toBeUndefined();
    expect(mira.find((a) => a.label.startsWith("Hug"))).toBeUndefined();
  });

  test("once the condition holds, the same move is offered unlocked", () => {
    const later = structuredClone(s);
    later.stats.last_gift = -10;
    const gift = buildHud(r, later).people.find((p) => p.id === "mira")!.actions.find((a) => a.label === "Give a gift");
    expect(gift).toBeDefined();
    expect(gift?.locked).toBeUndefined();
  });
});
