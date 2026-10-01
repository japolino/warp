import { describe, expect, test } from "bun:test";
import { fxEvents } from "./fx-events.js";

const base = (over: Record<string, unknown> = {}): any => ({
  type: "state", chatId: "c1", status: {}, hud: null, map: null, choices: [], records: [], suggestions: [],
  latestMessageId: null, choicesAnchor: null, busy: false, dungeon: null, dungeonEntries: [], date: null, scene: null, encounterLogs: [], ...over,
});
const rec = (id: string, tier: string) => ({ messageId: id, swipe: 0, check: { label: "Persuasion", tier, total: 12 } });
const fighter = (id: string, hp: number, side = "foe", alive = true) => ({ id, side, hp, mhp: 20, alive });
const dungeon = (over: Record<string, unknown> = {}) => ({
  id: "mines", depth: 1, gold: 10, level: 1, bag: [], loot: [], party: [fighter("you", 20, "party")], battle: null,
  tiles: [{ x: 0, y: 0, state: "here", kind: "start" }, { x: 1, y: 0, state: "hidden", kind: "treasure" }], ...over,
});

describe("what's worth a flourish", () => {
  test("nothing on the first push or a chat switch — history isn't replayed", () => {
    expect(fxEvents(null, base({ records: [rec("m1", "success")] }))).toEqual([]);
    expect(fxEvents(base(), base({ chatId: "c2", records: [rec("m1", "success")] }))).toEqual([]);
  });

  test("a new roll lands once", () => {
    const a = base({ records: [rec("m1", "fail")] });
    const b = base({ records: [rec("m1", "fail"), rec("m2", "crit_success")] });
    expect(fxEvents(a, b)).toEqual([{ kind: "roll", messageId: "m2", tier: "crit_success", crit: true, label: "Persuasion" }]);
    expect(fxEvents(b, b)).toEqual([]);
  });

  test("a date reaction and a step up the ladder", () => {
    const sess = (label: string, reaction: string) => ({ who: "jo", last: { label, reaction, text: "" }, fatigue: 0 });
    const a = base({ date: { session: sess("Music", "like"), people: [{ id: "jo", stage: "Friend", love: 30 }] } });
    const b = base({ date: { session: sess("Flirt", "love"), people: [{ id: "jo", stage: "Close", love: 56 }] } });
    expect(fxEvents(a, b)).toEqual([{ kind: "reaction", reaction: "love" }, { kind: "stage", up: true, label: "Close" }]);
  });

  test("dungeon: hits and knockouts, a tile turning over, gold, a new floor", () => {
    const a = base({ dungeon: dungeon({ battle: { kind: "enemy", fighters: [fighter("rat", 8)], log: [], over: null } }) });
    const b = base({ dungeon: dungeon({ gold: 25, party: [fighter("you", 14, "party")], battle: { kind: "enemy", fighters: [fighter("rat", 0, "foe", false)], log: ["A critical hit!"], over: null } }) });
    expect(fxEvents(a, b)).toEqual([
      { kind: "gold", amount: 15 },
      { kind: "hit", id: "rat", side: "foe", amount: 8, ko: true, crit: true },
      { kind: "hit", id: "you", side: "party", amount: 6, ko: false, crit: true },
    ]);
    const moved = base({ dungeon: dungeon({ tiles: [{ x: 0, y: 0, state: "seen", kind: "start" }, { x: 1, y: 0, state: "here", kind: "treasure" }] }) });
    expect(fxEvents(base({ dungeon: dungeon() }), moved)).toEqual([{ kind: "reveal", x: 1, y: 0, tile: "treasure" }, { kind: "step" }]);
    expect(fxEvents(base({ dungeon: dungeon() }), base({ dungeon: dungeon({ depth: 2 }) }))).toEqual([{ kind: "floor", depth: 2 }]);
  });

  test("an encounter round, and how it ended", () => {
    const log = (n: number, ended: unknown = null) => ({ messageId: "m5", rounds: Array.from({ length: n }, () => ({ check: { tier: "success" } })), status: ended ? "ended" : "on", ended });
    expect(fxEvents(base({ encounterLogs: [log(1)] }), base({ encounterLogs: [log(2)] }))).toEqual([{ kind: "round", messageId: "m5", tier: "success", ended: null }]);
    expect(fxEvents(base({ encounterLogs: [log(2)] }), base({ encounterLogs: [log(3, { label: "Won", loss: false })] }))[0]).toMatchObject({ ended: "win" });
  });
});
