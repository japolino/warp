// The encounter's on-screen pieces stay short: one panel while it's on, one
// line per round, changes as changes, and each fact shown once.

import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "../engine/ruleset.js";
import { applyEvent, cloneState, initialState } from "../engine/state.js";
import { encounterGuide } from "../engine/encounter-view.js";
import { summarizeEvents } from "../engine/view.js";
import { renderEncounterGuide, renderEncounterLog, renderRoundCard } from "./render.js";
import type { RoundCardView } from "../shared/protocol.js";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const round: RoundCardView = {
  move: "Exploit biological tell", check: { label: "Lore", tier: "failed", odds: 0.45, gear: [] },
  foe: "Deeply inhales the air", round: 1, ended: null,
  changes: [
    { label: "Prowling Monster Girl: Aggression", from: 50, to: 70, of: 100, good: false },
    { label: "Stamina", from: 89, to: 84, of: 0, good: false },
  ],
};

describe("a round, short", () => {
  test("the move and how it went, the other side's answer, and what moved as changes", () => {
    const t = text(renderRoundCard(round, "Prowling Monster Girl"));
    expect(t).toContain("Exploit biological tell ✕ Failed Lore 45%");
    expect(t).toContain("Prowling Monster Girl: Deeply inhales the air");
    expect(t).toContain("⚔ Aggression +20");
    expect(t).toContain("Stamina −5");
    expect(t).not.toContain("→");
  });

  test("while it's on, the panel carries the last round; every round and the Why? fold away", () => {
    const e = {
      name: "Predatory Pursuit", foe: "Prowling Monster Girl", round: 1, stats: [], momentum: null, goal: "Lose her", quiet: true,
      progress: [{ label: "Aggression", value: 70, target: 0, max: 100 }],
      danger: [{ label: "Stamina", value: 84, at: 0, text: "Stamina 84, out at 0", close: false }], dangerText: "Run out of stamina",
      foeConds: [], foeArmor: null, yourArmor: null,
    };
    const html = renderEncounterGuide(e, false, { foe: "Prowling Monster Girl", rounds: [round, { ...round, round: 2 }], why: "<details class=\"warp-enc-why\"></details>" });
    expect(html).toContain("Last round");
    expect(html).toContain("All 2 rounds");
    expect(html).toContain("warp-round-latest");
    expect(html).toContain("warp-enc-why");
    expect(text(html)).toContain("Danger Stamina 84, out at 0");
  });

  test("after it ends, the message keeps one line for how it ended", () => {
    const html = renderEncounterLog({ messageId: "m6", name: "Predatory Pursuit", foe: "Prowling Monster Girl", status: "ended", rounds: [round], from: 0, ended: { label: "You slipped away", loss: false } });
    expect(text(html)).toContain("⚔ Predatory Pursuit: You slipped away after 1 round");
    expect(html).toContain("Show the round");
  });
});

describe("each fact once", () => {
  const r = normalizeRuleset({
    stats: { stamina: { kind: "meter", start: 80 } },
    encounters: { chase: { name: "Chase", foe: { name: "Hunter", stats: { aggression: { start: 50, max: 100 } } }, end_when: { lost: "stamina <= 0", calmed: "foe.aggression <= 0" } } },
  }).ruleset!;

  test("your move and their answer pushing the same stat make one chip, with both causes behind Why?", () => {
    const before = initialState(r);
    applyEvent(before, { t: "enc", id: "chase", foe: { aggression: 50 }, src: "manual" }, r);
    const after = cloneState(before);
    const events = [
      { t: "foe" as const, stat: "aggression", d: 5, src: "check" as const, why: "Lore failed" },
      { t: "foe" as const, stat: "aggression", d: 15, src: "action" as const, why: "Hunter sniffs the air" },
    ];
    events.forEach((e) => applyEvent(after, e, r));
    const chips = summarizeEvents(r, before, after, events).filter((c) => c.text.includes("Aggression"));
    expect(chips.map((c) => c.text)).toEqual(["Hunter · Aggression +20"]);
    expect(chips[0].why).toEqual(["Lore failed", "Hunter sniffs the air"]);
  });

  test("danger reads as where you stand and where it ends", () => {
    const s = initialState(r);
    applyEvent(s, { t: "enc", id: "chase", foe: { aggression: 50 }, src: "manual" }, r);
    expect(encounterGuide(r, s)!.danger[0].text).toBe("Stamina 80, out at 0");
  });
});
