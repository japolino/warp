import { describe, expect, test } from "bun:test";
import { loadRuleset } from "../engine/loader.js";
import { resolveTurnFull } from "../engine/resolve.js";
import { foldEvents, initialState } from "../engine/state.js";
import { TEMPLATES } from "../engine/templates/index.js";
import { dateMoves } from "../engine/date/talk.js";
import { clipLine, scriptedLines } from "./snippets.js";

const t = TEMPLATES.find((x) => x.id === "hometown")!;
const r = loadRuleset(t.parts.map((p, i) => ({ label: p.label, content: p.yaml, order: i }))).ruleset!;

describe("stage snippets, scripted", () => {
  test("a topic's reaction becomes a beat and a line in their voice", () => {
    let s = initialState(r);
    s.location = "high_street"; s.minutes = 10 * 60;
    s = foldEvents(r, [resolveTurnFull(r, s, { actionId: "date:talk@jo", via: "choice" }, { seed: "a" }).record.events], s);
    const topic = dateMoves(r, s, []).find((m) => m.kind === "topic")!;
    const rec = resolveTurnFull(r, s, { actionId: topic.id, via: "choice" }, { seed: "b" }).record;
    const after = foldEvents(r, [rec.events], s);
    const lines = scriptedLines({ kind: "date", r, before: s, after, rec, player: "Sam", said: topic.say, recent: [], card: "", seed: "b" });
    expect(lines).toHaveLength(2);
    expect(lines[0].speaker).toBeNull();
    expect(lines[0].text).toContain("Jo");
    expect(lines[1].speaker).toBe("Jo");
  });

  test("anything else is told as short narration, with no rule jargon", () => {
    const s = initialState(r);
    const rec = { v: 1 as const, hints: ["Dungeon (The Old Mines, floor 2) — since last time: A rat bites {{user}}. Now: *We head down the stairs.*"], events: [], at: 0 };
    const lines = scriptedLines({ kind: "dungeon", r, before: s, after: s, rec, player: "Sam", said: null, recent: [], card: "", seed: "c" });
    expect(lines[0]).toEqual({ speaker: null, text: "A rat bites Sam. We head down the stairs." });
  });
});

test("long helper lines are cut at a sentence or word, never mid-word", () => {
  const a = "She laughs. " + "word ".repeat(100);
  expect(clipLine("Short.")).toBe("Short.");
  expect(clipLine(`${"x".repeat(30)}. ${"Then more words follow here. ".repeat(20)}`, 120).endsWith(".")).toBe(true);
  const w = clipLine(a, 60);
  expect(w.endsWith("word…")).toBe(true);
});
