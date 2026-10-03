// The builder's card read: Jev's typed questions (or the helper's) and how their answers become the classification.

import { describe, expect, test } from "bun:test";
import { cardPrompt, cardQuestions, cardVerdict, coreQuestions, normQuestions, readCard } from "./card-read.js";

describe("card read", () => {
  test("typed questions put the safe default first, and missing answers mean it", () => {
    const q = cardQuestions();
    expect(Object.keys(q)).toEqual(["template", "card_type", "status_block", "romance"]);
    expect(q.template.type === "choice" && Object.keys(q.template.criteria)).toEqual(["adventure", "story"]);
    expect(q.card_type.type === "choice" && Object.keys(q.card_type.criteria)).toEqual(["character", "scenario"]);
    expect(cardVerdict({})).toEqual({ style: "adventure", cardType: "character", statusBlock: false, romance: false });
    expect(cardVerdict({
      template: { type: "choice", choice: "story", confidence: 0.7, probabilities: {} },
      card_type: { type: "choice", choice: "scenario", confidence: 0.7, probabilities: {} },
      status_block: { type: "noul", noul: 0.5 }, romance: { type: "noul", noul: 0.49 },
    })).toEqual({ style: "story", cardType: "scenario", statusBlock: true, romance: false });
  });

  test("with Jev the helper only writes; without, it also classifies", () => {
    const writes = cardPrompt("Name: Aina", false).user, both = cardPrompt("Name: Aina", true).user;
    for (const k of ['"style"', '"cardType"', '"romance"', '"statusBlock"']) { expect(writes).not.toContain(k); expect(both).toContain(k); }
    expect(writes).toContain('"statusFields"');
    for (const p of [writes, both]) for (const k of ['"summary"', '"cast"', '"followUps"', "up to 3"]) expect(p).toContain(k);
  });

  test("the read: Jev's classification wins, the helper's text stays, at most 3 follow-ups", () => {
    const out = { summary: "A pirate.", style: "story", cardType: "scenario", romance: true, reason: "x", statusBlock: { found: true, fields: ["HP"] }, statusFields: ["Gold"],
      cast: [{ name: "Red", relation: "rival", age: "33", appearance: "scarred" }, { relation: "nameless" }],
      followUps: [{ text: "a" }, { text: "b", options: ["Yes", "No"] }, { text: "c" }, { text: "d" }] };
    const helper = readCard(out, null, "Red");
    expect(helper).toMatchObject({ style: "story", cardType: "scenario", romance: true, statusBlock: true, statusFields: ["HP"], reason: "x" });
    expect(helper.cast).toEqual([{ name: "Red", relation: "rival", age: 33, appearance: "scarred" }]);
    expect(helper.followUps.map((q) => [q.id, q.kind])).toEqual([["f1_0", "text"], ["f1_1", "single"], ["f1_2", "text"]]);
    const jev = readCard(out, { style: "adventure", cardType: "character", statusBlock: true, romance: false }, "Red");
    expect(jev).toMatchObject({ style: "adventure", cardType: "character", romance: false, statusFields: ["Gold"], reason: "" });
    expect(normQuestions([{ text: "x", kind: "multi" }], "f")).toEqual([{ id: "f0", text: "x", kind: "text" }]);
  });

  test("the core questions: the style switch, tone, difficulty (Adventure only) and relationship pace", () => {
    const q = coreQuestions("story", "It is a slice of life.");
    expect(q.map((x) => x.id)).toEqual(["style", "tone", "difficulty", "pace"]);
    expect(q[0]).toMatchObject({ default: "story", why: "It is a slice of life." });
    expect(q[2].why).toContain("Adventure only");
  });
});
