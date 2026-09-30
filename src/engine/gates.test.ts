import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { initialState } from "./state.js";
import { actionTags, applyProposal } from "./resolve.js";

const r = loadRuleset([{ label: "t", content: `
name: Gates
stats:
  stress: { narrator: 10, narrator_words: [panic, scared] }
  wounds: { narrator: 10, narrator_actions: [fight, violence] }
  mood: { narrator: 10, narrator_when: "not in_encounter and hour >= 8" }
  plain: { narrator: 10 }
flags:
  engaged: { narrator: true, narrator_words: [ring, propose] }
actions:
  brawl: { label: Brawl, tags: [violence] }
  fight: { label: Fight }
  chat: { label: Chat }
clock: { start: "Mon 09:00" }
`, order: 0 }]).ruleset!;
const s = initialState(r);
const changed = (events: ReturnType<typeof applyProposal>) => events.filter((e) => e.t === "stat").map((e) => (e as { id: string }).id).sort();

describe("limits on what the story may change", () => {
  test("words: only when the exchange mentions them", () => {
    expect(changed(applyProposal(r, s, { stats: { stress: 5, plain: 5 } }, { text: "A calm walk." }))).toEqual(["plain"]);
    expect(changed(applyProposal(r, s, { stats: { stress: 5 } }, { text: "I start to PANIC." }))).toEqual(["stress"]);
    expect(changed(applyProposal(r, s, { stats: { stress: 5 } }))).toEqual([]);
  });

  test("actions: only after a matching action id or tag", () => {
    expect(changed(applyProposal(r, s, { stats: { wounds: 5 } }, { text: "", action: { id: "chat", tags: [] } }))).toEqual([]);
    expect(changed(applyProposal(r, s, { stats: { wounds: 5 } }, { text: "", action: { id: "fight", tags: [] } }))).toEqual(["wounds"]);
    expect(changed(applyProposal(r, s, { stats: { wounds: 5 } }, { text: "", action: { id: "brawl", tags: actionTags(r, "brawl") } }))).toEqual(["wounds"]);
  });

  test("when: only while the formula holds", () => {
    expect(changed(applyProposal(r, s, { stats: { mood: 3 } }, { text: "" }))).toEqual(["mood"]);
    const early = { ...s, minutes: 6 * 60 };
    expect(changed(applyProposal(r, early, { stats: { mood: 3 } }, { text: "" }))).toEqual([]);
  });

  test("flags and conditions take the same limits", () => {
    expect(applyProposal(r, s, { flags: { engaged: true } }, { text: "We had dinner." }).some((e) => e.t === "flag")).toBe(false);
    expect(applyProposal(r, s, { flags: { engaged: true } }, { text: "I propose over dinner." }).some((e) => e.t === "flag")).toBe(true);
  });
});
