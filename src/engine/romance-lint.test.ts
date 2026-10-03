import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { lintRuleset } from "./lint.js";

const lint = (raw: object) => lintRuleset(normalizeRuleset({ style: "story", clock: { start: "Day 1 09:00" }, ...raw }).ruleset!);
const romance = (issues: { message: string; where: string }[]) => issues.filter((i) => i.message.includes("looks romantic"));

describe("romantic moves need an adults-only tag", () => {
  test("an untagged move toward someone that reads as romantic warns; tagged, it doesn't", () => {
    expect(romance(lint({ actions: { confess: { label: "💗 Confess to {target}", per_person: true } } })).map((i) => i.where)).toEqual(["Actions › confess"]);
    expect(romance(lint({ actions: { confess: { label: "💗 Confess to {target}", per_person: true, tags: ["romance"] } } }))).toEqual([]);
    expect(romance(lint({ actions: { gobaek: { label: "💗 고백", per_person: true, say: "*용기를 내어 마음을 고백한다.*" } } }))).toHaveLength(1);
  });

  test("live-choice tags toward someone are checked the same way", () => {
    const issues = romance(lint({ live_choices: { tags: { playful: { desc: "장난스럽게 플러팅하기", per_person: true }, kind: { desc: "Something kind", per_person: true } } } }));
    expect(issues.map((i) => i.where)).toEqual(["Live choices › tags › playful"]);
  });

  test("moves not aimed at a person, and ordinary ones, don't warn", () => {
    expect(romance(lint({ actions: { own_up: { label: "Confess the crime" }, talk: { label: "Talk with {target}", per_person: true }, date: { label: "Check the date" } } }))).toEqual([]);
  });
});
