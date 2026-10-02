import { describe, expect, test } from "bun:test";
import { GAME_IDS, GAMES, gameBar } from "../../engine/game-ids.js";
import { GAME_DEFS } from "./games/index.js";
import { renderChoices } from "../render.js";
import { acceptsArcadeResult, automaticChallenge, playableChoice } from "./choice-flow.js";
import type { ChoiceView } from "../../shared/protocol.js";

const choice = (id = 'action:"test"'): ChoiceView => ({
  id, label: "Open <lock>", group: null, desc: null, odds: 0.5, partialOdds: null,
  checkLabel: "Dexterity", veiled: false, params: [],
  game: { game: "mines", options: ["mines"], action: "Open", label: "Dexterity", chance: 0.5,
    level: 0.5, bar: gameBar(0.5), aids: [], seed: "test" },
});
const options = { showOdds: true, hotkeys: true, busy: false };

describe("explicit arcade choices", () => {
  test("ask rolls by default, always retains opt-in autoplay, off hides play", () => {
    const c = choice();
    expect(automaticChallenge("ask", c)).toBe(false);
    expect(automaticChallenge("always", c)).toBe(true);
    expect(automaticChallenge("off", c)).toBe(false);
    expect(automaticChallenge("always", undefined)).toBe(false);
    expect(renderChoices([c], { ...options, minigames: "ask" })).toContain("data-play-challenge");
    expect(renderChoices([c], { ...options, minigames: "always" })).toContain("data-play-challenge");
    expect(renderChoices([c], { ...options, minigames: "off" })).not.toContain("data-play-challenge");
    c.locked = "No key";
    expect(automaticChallenge("always", c)).toBe(false);
  });
  test("all ten games remain available as separate named native buttons", () => {
    expect(GAME_IDS.length).toBe(10);
    for (const game of GAME_IDS) {
      expect(GAME_DEFS[game].id).toBe(game);
      const c = choice(); c.game!.game = game;
      const html = renderChoices([c], options);
      expect(html).toContain('data-act="action:&quot;test&quot;"');
      expect(html).toContain('type="button"');
      expect(html).toContain('data-play-challenge="action:&quot;test&quot;"');
      expect(html).toContain(`Play challenge: ${GAMES[game].name}`);
      expect(html).toContain("instead of rolling");
      expect(html).toContain("Open &lt;lock&gt;");
      // A play button is a sibling, never nested in the roll button.
      expect(html).toContain('</button><button type="button"');
    }
  });
  test("locked or ordinary choices do not offer play; busy play is disabled", () => {
    const c = choice(); c.locked = "Need key";
    expect(renderChoices([c], options)).not.toContain("data-play-challenge");
    delete c.locked; delete c.game;
    expect(renderChoices([c], options)).not.toContain("data-play-challenge");
    expect(renderChoices([choice()], { ...options, busy: true })).toMatch(/data-play-challenge[^>]+disabled/);
  });
  test("tables remain explicit and describe in-game wagers, not skill checks", () => {
    const c = choice(); delete c.game;
    c.gamble = { game: "blackjack", action: "Cards", stakes: [10, 20], rounds: 3,
      money: { stat: "gold", have: 50, currency: "$" }, edge: 0.05, aids: [], seed: "table" };
    const html = renderChoices([c], options);
    expect(html).toContain("Play table: Blackjack");
    expect(html).toContain("wagers use in-game money");
    expect(html).not.toContain("instead of rolling");
    expect(playableChoice([c], c.id)).toBe(c);
  });
  test("play resolves the action id, not the game id, and rejects locked choices", () => {
    const c = choice("open-door");
    expect(playableChoice([c], "mines")).toBeUndefined();
    expect(playableChoice([c], "open-door")).toBe(c);
    c.locked = "Unavailable";
    expect(playableChoice([c], "open-door")).toBeUndefined();
  });
  test("late game results cannot submit after chat/choice changes or another turn", () => {
    const snapshot = {};
    expect(acceptsArcadeResult(snapshot, snapshot, "a", "a", false)).toBe(true);
    expect(acceptsArcadeResult(snapshot, {}, "a", "a", false)).toBe(false);
    expect(acceptsArcadeResult(snapshot, snapshot, "a", "b", false)).toBe(false);
    expect(acceptsArcadeResult(snapshot, snapshot, "a", null, false)).toBe(false);
    expect(acceptsArcadeResult(snapshot, snapshot, "a", "a", true)).toBe(false);
  });
});
