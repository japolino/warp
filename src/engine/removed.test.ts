// Parts of Warp that were taken out (minigames, gambling, dungeons, dating, the stage's looks)
// leave old rulesets and old chats working: the keys are ignored with a plain warning, and
// the events they recorded are skipped. The old version is on the `legacy` branch.

import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { lintRuleset } from "./lint.js";
import { foldEvents, initialState, type WarpEvent } from "./state.js";
import { buildChoices, buildHud } from "./view.js";
import { resolveTurnFull } from "./resolve.js";

const OLD = `
name: Old rulebook
look: medieval
minigames: { style: scifi }
start: { location: town }
locations: { town: { name: Town } }
stats:
  coin: { kind: money, start: 50 }
  luck: { kind: skill, start: 10 }
relationships:
  stats: { trust: { start: 10 } }
  people: { robin: { name: Robin, age: 30, schedule: [ { at: town } ] } }
dating:
  love: trust
  venues: { park: { name: The park } }
dungeons:
  mines: { name: The Mines, at: [town] }
perks:
  lucky: { name: Lucky, rule: { game: { lives: 1 } } }
checkpoints: { keep: [codex, dating, deepest] }
actions:
  cards:
    label: Play cards
    gamble: { game: blackjack, stakes: [5, 10] }
  dance:
    label: Dance
    check: { chance: 50, label: Luck, game: keys }
    success: { coin: +5 }
triggers:
  deep: { when: "in_dungeon or stage('robin') > 1", do: { coin: +1 } }
`;

const load = () => loadRuleset([{ label: "t", content: OLD, order: 0 }]);

describe("removed parts of Warp", () => {
  test("an old ruleset still loads; each removed key gets one plain warning and is ignored", () => {
    const { ruleset: r, issues } = load();
    expect(r).not.toBeNull();
    const removed = issues.filter((i) => i.message.includes("was removed from Warp"));
    const where = removed.map((i) => i.where).sort();
    expect(where).toEqual([
      "Actions › cards › gamble", "Actions › dance › check › game", "Checkpoints",
      "Dating", "Dungeons", "Look", "Minigames", "Perks › lucky › rule › game", "Relationships › people › robin › schedule",
    ].sort());
    for (const i of removed) {
      expect(i.level).toBe("warning");
      expect(i.message).toContain("`legacy` branch");
    }
    // Nothing of them is left in the rules: no fear stat, no dungeon entrance, no gambling table, no game on the check.
    expect(r!.relStats.fear).toBeUndefined();
    expect(Object.keys(r!)).not.toContain("dating");
    expect(Object.keys(r!)).not.toContain("dungeons");
    expect(Object.keys(r!)).not.toContain("look");
    expect(r!.actions.cards).toBeDefined();
    expect(JSON.stringify(r!.actions)).not.toContain("blackjack");
    expect(JSON.stringify(r!.actions.dance.check)).not.toContain("keys");
    expect(r!.perks.lucky.rules).toEqual([]);
  });

  test("formulas naming removed parts read as 0, and the lint says why", () => {
    const r = load().ruleset!;
    const msgs = lintRuleset(r).map((i) => i.message);
    expect(msgs.some((m) => m.includes('"in_dungeon" (dungeons) was removed from Warp'))).toBe(true);
    expect(msgs.some((m) => m.includes('"stage()" (dating) was removed from Warp'))).toBe(true);
    const s = initialState(r);
    const out = resolveTurnFull(r, s, { actionId: "dance", via: "choice" }, { seed: "x" });
    expect(out.record.check?.label).toBe("Luck");
  });

  test("the choices have no dungeon, date or gambling moves", () => {
    const r = load().ruleset!;
    const ids = buildChoices(r, initialState(r), { lines: [], veils: [] }).map((c) => c.id);
    expect(ids.some((id) => id.startsWith("dungeon:") || id.startsWith("date:"))).toBe(false);
    expect(buildHud(r, initialState(r))).toBeTruthy();
  });

  test("an old chat with dungeon and date events folds without them", () => {
    const r = load().ruleset!;
    const old = [
      { t: "dg_enter", run: { id: "mines", depth: 1 }, src: "action" },
      { t: "dg_xp", d: 5, src: "action" },
      { t: "dt_start", session: { who: "robin" }, src: "action" },
      { t: "dt_recent", who: "robin", key: "music", at: 0, count: 1, fatigue: 10, src: "action" },
      { t: "dt_pref", who: "robin", key: "tag:music", v: 2, src: "action" },
      { t: "stat", id: "coin", d: 5, src: "action" },
    ] as unknown as WarpEvent[];
    const s = foldEvents(r, [old]);
    expect(s.stats.coin).toBe(55);
    expect(Object.keys(s)).not.toContain("dungeon");
    expect(Object.keys(s)).not.toContain("dating");
    expect(s.adults).toEqual({});
  });
});
