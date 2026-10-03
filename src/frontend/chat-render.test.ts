// Under each reply: one dice chip and one "what changed" line. Under the latest: 3 choices with honest odds.

import { describe, expect, test } from "bun:test";
import { checkOdds, choiceOrder, d20Odds, renderChoices, renderReply, SHOWN_CHANGES } from "./render-chat.js";
import type { ChangeView, ChoiceView, RecordView } from "../shared/protocol.js";
import { check, choice, record, text } from "./fixtures.js";

const ch = (t: string, o: Partial<ChangeView> = {}): ChangeView => ({ text: t, tone: "neutral", src: "action", ...o });

describe("the dice chip", () => {
  test("only when the turn rolled: label and tier, toned by tier; tap shows the roll and its real odds", () => {
    const html = renderReply(record({ messageId: "m2", check: check() }), { showChanges: true, latest: true });
    expect(html).toContain("warp-dice warp-tone-good");
    expect(text(html)).toContain("🎲 Body · Success");
    expect(text(html)).toContain("d20 14 + 3 = 17 vs 12 (fair) · 60% odds");
    expect(renderReply(record({ messageId: "m2" }), { showChanges: true, latest: true })).toBe("");
    expect(renderReply(record({ messageId: "m2", check: check({ tier: "crit_fail", tierLabel: "Critical failure" }) }), { showChanges: true, latest: true })).toContain("warp-tone-bad");
  });

  test("the odds shown are the d20's real odds (a natural 20 always succeeds, a natural 1 always fails)", () => {
    for (let add = -2; add <= 10; add++) for (let dc = 6; dc <= 22; dc++) {
      let n = 0;
      for (let f = 1; f <= 20; f++) if (f === 20 || (f !== 1 && f + add >= dc)) n++;
      expect(d20Odds(add, dc)).toBe(n / 20);
    }
    expect(checkOdds(check({ target: null }))).toBeNull();
    expect(checkOdds(check({ faces: [{ sides: 6, value: 3, kept: true }, { sides: 6, value: 4, kept: true }] }))).toBeNull();
  });

  test("a contest round adds the swing; a typed roll says it was read and offers Not an action?", () => {
    const round = record({ messageId: "m2", check: check(), changes: [ch("Momentum +49 · You have the upper hand", { tone: "good" })] });
    expect(text(renderReply(round, { showChanges: true, latest: true }))).toContain("🎲 Body · Success · Momentum +49");
    const typed = record({ messageId: "m2", check: check(), via: "adjudicator", confidence: 0.86, redoFrom: "m1" });
    const html = renderReply(typed, { showChanges: true, latest: true });
    expect(text(html)).toContain("read from your message (86% sure)");
    expect(html).toContain('data-redo="m1"');
  });

  test("no Reroll, no Why?, no game chips", () => {
    // An old record that still names a reroll: nothing offers it.
    const old = { ...record({ messageId: "m2", check: check(), changes: [ch("Trust +3", { why: ["Read from the story"] })] }), rerollFrom: "m1" } as RecordView;
    const html = renderReply(old, { showChanges: true, latest: true });
    for (const gone of ["data-reroll", "Reroll", "data-why", "Why?"]) expect(html).not.toContain(gone);
  });
});

describe('the "what changed" line', () => {
  const rec = record({
    messageId: "m2",
    lines: ["Mira is warming to you."],
    decisions: [{ ask: "Does the guard let you pass?", picked: "He waves you through", p: 0.7, source: "model", odds: [{ desc: "He waves you through", p: 0.7 }, { desc: "He stops you", p: 0.3 }] }],
    changes: [
      ch("A fight with the bouncer starts", { tone: "warn" }),
      ch("⏱ +40m", { src: "narrator", undo: [0] }),
      ch("→ The docks", { src: "narrator", undo: [1] }),
      ch("Health −8", { tone: "bad", band: "Badly hurt.", why: ["The bouncer's answer"] }),
      ch("Trust +3", { tone: "good", src: "manual", undo: [2] }),
      ch("+ Rope", { src: "action" }),
      ch("💭 Mira will remember that", { src: "narrator", undo: [3] }),
    ],
  });

  test("story lines first, then rolled reactions, then the changes in the engine's order", () => {
    const t = text(renderReply(rec, { showChanges: true, latest: true }));
    const order = ["Mira is warming to you.", "🎭 He waves you through", "A fight with the bouncer starts", "⏱ +40m", "→ The docks", "Health −8 (Badly hurt.)", "Trust +3"];
    for (let i = 1; i < order.length; i++) expect(t.indexOf(order[i - 1])).toBeLessThan(t.indexOf(order[i]));
  });

  test(`the first ${SHOWN_CHANGES} items, then +N more`, () => {
    const html = renderReply(rec, { showChanges: true, latest: true });
    expect((html.match(/warp-ch-extra/g) ?? []).length).toBe(9 - SHOWN_CHANGES);
    expect(text(html)).toContain(`+${9 - SHOWN_CHANGES} more`);
    expect(html).toContain("data-more");
    const short = renderReply(record({ messageId: "m2", changes: [ch("Trust +3")] }), { showChanges: true, latest: true });
    expect(short).not.toContain("data-more");
  });

  test("× only on the latest reply, and only for what the story read or you set", () => {
    const latest = renderReply(rec, { showChanges: true, latest: true });
    expect(latest.match(/data-undo="([\d,]+)"/g)).toEqual(['data-undo="0"', 'data-undo="1"', 'data-undo="2"', 'data-undo="3"']);
    expect(renderReply(rec, { showChanges: true, latest: false })).not.toContain("data-undo");
  });

  test("each item's tooltip is its cause", () => {
    const html = renderReply(rec, { showChanges: true, latest: true });
    expect(html).toContain('title="The bouncer&#39;s answer"');
    expect(html).toContain('title="You set this"');
    expect(html).toContain('title="Read from the story"');
    expect(html).toContain("He stops you 30%");
  });

  test("Show what changed off: the dice chip still shows, the line doesn't", () => {
    const html = renderReply(record({ ...rec, check: check() }), { showChanges: false, latest: true });
    expect(html).toContain("warp-dice");
    expect(html).not.toContain("warp-changed");
    expect(renderReply(rec, { showChanges: false, latest: true })).toBe("");
  });

  test("story text is escaped", () => {
    const html = renderReply(record({ messageId: "m2", lines: ['<img src=x onerror="alert(1)">'] }), { showChanges: true, latest: true });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("the choices row", () => {
  const live = [
    choice({ id: "live:0", label: "Vault the bar", odds: 0.4, partialOdds: 0.15, checkLabel: "Body", difficulty: "hard" }),
    choice({ id: "live:1", label: "Shove past him", odds: 0.6, checkLabel: "Body", difficulty: "fair" }),
    choice({ id: "live:2", label: "Ask Mira what happened", difficulty: "none" }),
  ];
  const authored = ["Sleep", "Wait", "Rest", "Eat", "Read"].map((l, i) => choice({ id: `act${i}`, label: l }));

  test("3 choices with their odds, numbered for hotkeys; the difficulty and partial odds in the tooltip", () => {
    const html = renderChoices(live, { showOdds: true, hotkeys: true, busy: false });
    const t = text(html);
    expect(t).toContain("1 Vault the bar 40%");
    expect(t).toContain("2 Shove past him 60%");
    expect(t).toContain("3 Ask Mira what happened");
    expect(html).toContain('title="Body · hard: 40% success, 15% partial"');
    expect(renderChoices(live, { showOdds: false, hotkeys: false, busy: false })).not.toContain("40%");
  });

  test("authored actions go to a compact More row (4, the rest folded), after the written choices", () => {
    const html = renderChoices([...authored, ...live], { showOdds: true, hotkeys: true, busy: false });
    expect(choiceOrder([...authored, ...live]).map((c) => c.id)).toEqual(["live:0", "live:1", "live:2", "act0", "act1", "act2", "act3", "act4"]);
    expect(html.indexOf("Vault the bar")).toBeLessThan(html.indexOf("Sleep"));
    expect((html.match(/warp-choice-small/g) ?? []).length).toBe(5);
    expect(html).toContain("warp-more-fold");
    expect(text(html)).toContain("4 Sleep");
  });

  test("while the next choices are written: a quiet line, and the buttons stay usable", () => {
    const html = renderChoices(live, { showOdds: true, hotkeys: true, busy: true });
    expect(text(html)).toContain("Writing choices…");
    expect(html).not.toContain("disabled");
    expect(text(renderChoices([], { showOdds: true, hotkeys: true, busy: true, busyLabel: "The story continues…" }))).toBe("The story continues…");
    expect(renderChoices([], { showOdds: true, hotkeys: true, busy: false })).toBe("");
  });

  test("no forecast text, locked moves say why, veiled moves are marked", () => {
    const html = renderChoices([
      { ...choice({ id: "live:0", label: "Ask Jo" }), forecast: { goal: "Learn why Jo left", risk: "r", payoff: "p" } } as ChoiceView,
      choice({ id: "pick", label: "Pick the lock", locked: "Needs a lockpick" }),
      choice({ id: "live:1", label: "Kiss her", veiled: true }),
    ], { showOdds: true, hotkeys: true, busy: false });
    expect(html).not.toContain("Learn why Jo left");
    expect(html).not.toContain("forecast");
    expect(text(html)).toContain("🔒 Needs a lockpick");
    expect(html).toContain("◐");
  });
});
