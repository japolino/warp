// The contest shows one gauge with one direction everywhere: You (+100) on the left, the opponent on the right.

import { describe, expect, test } from "bun:test";
import { gaugeLeft, hudParts, renderConflict, roundText } from "./render-panel.js";
import { renderChoices } from "./render-chat.js";
import { renderCueCard } from "./cue-bridge.js";
import type { ConflictView } from "../shared/protocol.js";
import { choice, hud, text } from "./fixtures.js";

const fight = (o: Partial<ConflictView> = {}): ConflictView => ({
  kind: "fight", label: "Fight", opponent: "the bouncer", round: 1, maxRounds: 8, momentum: 40,
  words: "You have the upper hand", next: { odds: 0.55, stat: "Body" }, ...o,
});
const markAt = (html: string) => Number(/warp-momentum-mark" style="left:([\d.]+)%/.exec(html)?.[1]);

describe("the Conflict box", () => {
  test("the marker moves toward You (left) as you win, toward the opponent (right) as they do", () => {
    expect(gaugeLeft(100)).toBe(0);
    expect(gaugeLeft(-100)).toBe(100);
    expect(gaugeLeft(0)).toBe(50);
    expect(gaugeLeft(250)).toBe(0);
    expect(markAt(renderConflict(fight({ momentum: 40 })))).toBe(30);
    expect(markAt(renderConflict(fight({ momentum: -60 })))).toBe(80);
  });

  test("You on the left, the opponent on the right, then the words", () => {
    const t = text(renderConflict(fight()));
    expect(t.indexOf("You")).toBeLessThan(t.indexOf("the bouncer You have"));
    expect(t).toContain("⚔ Fight · the bouncer round 2/8");
    expect(t).toContain("You have the upper hand");
    expect(t).toContain("Next move: 55% (Body)");
  });

  test("Break off and Give in", () => {
    const html = renderConflict(fight());
    expect(html).toContain('data-contest="break_off"');
    expect(html).toContain('data-contest="give_in"');
    expect(renderConflict(fight({ next: null }))).not.toContain("Next move");
  });

  test("the round shown is the one the next move plays, never past the last", () => {
    expect(roundText(fight({ round: 0 }))).toBe("round 1/8");
    expect(roundText(fight({ round: 8 }))).toBe("round 8/8");
  });

  test("at the top of the panel only while a contest runs", () => {
    expect(hudParts(hud({ conflict: fight() }), { editing: null, compact: true }).head).toContain("warp-conflict");
    expect(hudParts(hud(), { editing: null, compact: true }).head).toBe("");
  });
});

describe("the same gauge above the moves and in Cue", () => {
  test("the slim gauge above the choices points the same way (the legacy guide drew it reversed)", () => {
    const html = renderChoices([choice({ id: "live:0", label: "Feint left and sweep his legs", odds: 0.55 }), choice({ id: "contest:break_off", label: "Break off", odds: 0.4 })],
      { showOdds: true, hotkeys: true, busy: false, conflict: fight({ momentum: 40 }) });
    expect(markAt(html)).toBe(30);
    expect(html).toContain("warp-conflict-slim");
    expect(html).not.toContain('data-contest="give_in"');
    expect(text(html)).toContain("1 Feint left and sweep his legs 55%");
    expect(text(html)).toContain("2 Break off 40%");
  });

  test("Cue's status card has the contest line and the gauge, still self-contained", () => {
    const html = renderCueCard(hud({ conflict: fight({ momentum: 40 }) }));
    expect(text(html)).toContain("⚔ Fight · the bouncer · round 2/8");
    expect(html).toContain('class="mark" style="left:30.0%"');
    expect(html).not.toContain("var(--");
  });
});
