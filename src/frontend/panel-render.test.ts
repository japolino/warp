// The status panel: Scene, You, People, Goals, each line fixable with one click.

import { describe, expect, test } from "bun:test";
import { clockParts, hudParts, renderHud } from "./render-panel.js";
import { renderJournal } from "./render.js";
import { hud, person, record, check, text } from "./fixtures.js";

const panel = (editing: string | null = null, o: Parameters<typeof hud>[0] = {}, drafts?: Record<string, string>) =>
  renderHud(hud(o), { editing, compact: true, drafts });

describe("sections", () => {
  test("Scene, You, People, Goals in that order; Conflict only during a contest", () => {
    const { head, parts } = hudParts(hud(), { editing: null, compact: true });
    expect(parts.map((p) => p.title)).toEqual(["Scene", "You", "People", "Goals"]);
    expect(head).toBe("");
  });

  test("Scene: time, day and phase; place; who is here", () => {
    const t = text(panel());
    expect(t).toContain("23:40 Day 2 · night");
    expect(t).toContain("📍 The Rusty Anchor");
    expect(t).toContain("Here: Mira");
    expect(t).not.toContain("Here: Mira, Jo");
  });

  test("You: meters in words, money, looks and clothes, what you carry, skills", () => {
    const t = text(panel());
    for (const s of ["Health Fine", "💰 $50", "Looks: short, scar over one eye", "Wears: rain-soaked coat", "Carrying · 1", "Rope", "×2", "Skills & attributes · 1"]) expect(t).toContain(s);
  });

  test("nothing carried: no Carrying fold", () => {
    expect(text(panel(null, { items: [] }))).not.toContain("Carrying");
  });

  test("People: here first, the rest under Elsewhere; looks, bands, memories and their own actions", () => {
    const html = panel();
    const t = text(html);
    expect(t.indexOf("Mira")).toBeLessThan(t.indexOf("Elsewhere · 1"));
    expect(t.indexOf("Elsewhere · 1")).toBeLessThan(t.indexOf("Jo"));
    expect(t).toContain("Trust: Open");
    expect(t).toContain("👤 tall, red braid, freckles; wears green apron over a black shirt");
    expect(t).toContain("💭 Remembers · 1");
    expect(html).toContain('data-use="talk:mira"');
    expect(t).toContain("Talk to Mira 60%");
    expect(html).not.toContain("data-forget");
    expect(renderHud(hud(), { editing: null, compact: false })).toContain('data-forget="mira"');
  });

  test("Goals: open goals with who and what's at stake; finished ones folded; no section without an open goal", () => {
    const t = text(panel());
    expect(t).toContain("Get Mira's brother out of jail for Mira");
    expect(t).toContain("At stake: He hangs at dawn");
    expect(t).toContain("Finished · 1");
    expect(hudParts(hud({ goals: [] }), { editing: null, compact: true }).parts.map((p) => p.id)).not.toContain("goals");
  });

  test("text from the story is escaped", () => {
    const html = panel(null, { people: [person({ id: "x", name: "<b>Eve</b>", present: true, outfit: '"><script>' })] });
    expect(html).not.toContain("<b>Eve</b>");
    expect(html).not.toContain("<script>");
  });

  test("a hint from the greeting read shows in Scene", () => {
    expect(text(renderHud(hud(), { editing: null, compact: true, sceneHint: "Warp couldn't read the greeting — set the time." }))).toContain("set the time");
  });
});

describe("one-click fixes", () => {
  test("every line has its ✎", () => {
    const html = panel();
    for (const key of ["time", "place", "here", "money", "look:you:appearance", "look:you:outfit", "item:rope", "look:mira:outfit", "goal:g1"]) expect(html).toContain(`data-edit="${key}"`);
    expect(html).toContain('data-edit="bar:health"');
    expect(html).toContain('data-edit="skill:body"');
    expect(html).toContain('data-edit="rel:mira:trust"');
  });

  test("time: day and HH:MM from the clock", () => {
    expect(clockParts(1440 + 23 * 60 + 40)).toEqual({ day: 2, time: "23:40" });
    const html = panel("time");
    expect(html).toContain('data-fix="time"');
    expect(html).toMatch(/data-fix-input="time:day" value="2"/);
    expect(html).toMatch(/type="time" data-fix-input="time" value="23:40"/);
  });

  test("text fixes start from the current words; typed drafts survive a re-render", () => {
    expect(panel("look:you:outfit")).toMatch(/data-fix-input="look:you:outfit" value="rain-soaked coat"/);
    expect(panel("look:you:outfit")).toContain('data-fix="outfit" data-who="you"');
    expect(panel("look:you:outfit", {}, { "look:you:outfit": "dry clothes" })).toMatch(/value="dry clothes"/);
    expect(panel("place")).toMatch(/data-fix-input="place" value="The Rusty Anchor"/);
    expect(panel("look:mira:appearance")).toContain('data-fix="appearance" data-who="mira"');
  });

  test("numbers: money, an item's count, a skill; meters and feelings have a slider", () => {
    expect(panel("money")).toMatch(/data-fix-input="money" value="50"/);
    expect(panel("item:rope")).toContain('data-fix="item" data-who="rope"');
    expect(panel("item:rope")).toMatch(/data-fix-input="item:rope" value="2"/);
    expect(panel("skill:body")).toContain('data-save-skill="body"');
    expect(panel("bar:health")).toContain('data-save-bar="health"');
    expect(panel("rel:mira:trust")).toContain('data-save-rel="mira:trust"');
  });

  test("who is here: a toggle per person", () => {
    const html = panel("here");
    expect(html).toContain('data-fix-present="mira" data-value="false" aria-pressed="true"');
    expect(html).toContain('data-fix-present="jo" data-value="true" aria-pressed="false"');
  });

  test("a goal: done, failed or drop; a finished one can be reopened", () => {
    const html = panel("goal:g1");
    expect(html.match(/data-fix-goal="g1" data-value="(\w+)"/g)).toEqual(['data-fix-goal="g1" data-value="done"', 'data-fix-goal="g1" data-value="failed"', 'data-fix-goal="g1" data-value="drop"']);
    expect(panel("goal:g0")).toContain('data-fix-goal="g0" data-value="open"');
  });
});

describe("the journal", () => {
  test("goals, then the timeline newest first with the dice and what changed", () => {
    const h = hud();
    const html = renderJournal(h, [
      record({ messageId: "m1", changes: [{ text: "⏱ +40m", tone: "neutral", src: "narrator" }] }),
      record({ messageId: "m2", check: check(), lines: ["Mira is warming to you."] }),
    ]);
    const t = text(html);
    expect(t.indexOf("Goals")).toBeLessThan(t.indexOf("Timeline"));
    expect(t.indexOf("🎲 Body · Success")).toBeLessThan(t.indexOf("⏱ +40m"));
    expect(t).toContain("Mira is warming to you.");
    expect(html).toContain('data-jump="m2"');
  });
});
