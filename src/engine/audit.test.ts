import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { auditRuleset } from "./audit.js";

const ids = (raw: Record<string, unknown>) => auditRuleset(normalizeRuleset(raw).ruleset!).gaps.map((g) => g.id);

describe("the depth audit", () => {
  test("items that do nothing, can't be had, or matter are told apart", () => {
    const found = ids({
      start: { items: { spray: 1 } },
      items: { spray: { name: "Spray" }, charm: { name: "Charm", use: { label: "Rub it" } }, map: { name: "Map" } },
      actions: { read: { label: "Read the map", when: "has('map')" } },
    });
    expect(found).toContain("item-dead:spray");
    expect(found).not.toContain("item-dead:charm");
    expect(found).toContain("item-unobtainable:map");
    expect(found).toContain("item-unobtainable:charm");
  });

  test("stats nothing moves or nothing reads, skills no check uses, money one way only", () => {
    const found = ids({
      stats: {
        stress: { kind: "meter", start: 0 }, mood: { kind: "meter", start: 50, per_hour: -1 },
        charm: { kind: "skill", max: 100, start: 10 }, coins: { kind: "money", start: 10 },
      },
      actions: { shop: { label: "Shop", effects: { coins: -5, stress: -1 } } },
    });
    expect(found).not.toContain("stat-static:stress");
    expect(found).toContain("stat-unread:stress");
    expect(found).not.toContain("stat-static:mood");
    expect(found).toContain("skill-unused:charm");
    expect(found).toContain("money-no-income");
    expect(found).not.toContain("money-no-spending");
  });

  test("conditions nobody causes or cures; flags set but never read", () => {
    const found = ids({
      conditions: { soaked: {}, cursed: {} },
      flags: { met: { start: false } },
      actions: { swim: { label: "Swim", effects: { add_condition: ["soaked"], flags: { met: true } } } },
    });
    expect(found).toContain("cond-never:cursed");
    expect(found).toContain("cond-uncured:soaked");
    expect(found).toContain("flag-unread:met");
  });

  test("an encounter with one route, no escape and no items is thin; a readable, escapable one isn't", () => {
    const thin = ids({
      stats: { pain: { kind: "meter", start: 0 } }, items: { rope: { name: "Rope", use: { label: "Tie" } } }, start: { items: { rope: 1 } },
      encounters: { brawl: { foe: { stats: { hp: { start: 10 } } }, actions: { hit: { check: { chance: 50 }, success: { foe: { hp: -5 } }, fail: { pain: 10 } } }, end_when: { won: "foe.hp <= 0", beaten: "pain >= 80" } } },
    });
    expect(thin).toEqual(expect.arrayContaining(["enc-no-escape:brawl", "enc-one-route:brawl", "enc-no-items:brawl", "enc-passive:brawl"]));
    expect(thin).not.toContain("enc-no-goal:brawl");
    const good = ids({
      stats: { pain: { kind: "meter", start: 0 } }, start: { items: { bat: 1 } }, items: { bat: { name: "Bat", bonus: { pain: -5 } } },
      encounters: { brawl: {
        foe: { stats: { hp: { start: 10 } } },
        actions: {
          hit: { check: { chance: "50 - pain / 2" }, success: { foe: { hp: -5 } }, fail: { pain: 10 } },
          shove: { check: { chance: 60 }, success: { foe: { hp: -2 } } },
          run: { check: { chance: 40 }, success: { end: "escaped" } },
        },
        foe_moves: { punch: { desc: "Punches", weight: 1, pain: 5 } },
        end_when: { won: "foe.hp <= 0", beaten: "pain >= 80" },
      } },
    });
    expect(good.filter((g) => g.endsWith(":brawl"))).toEqual([]);
    expect(ids({ stats: { pain: { kind: "meter", start: 0, max: 50 } }, encounters: { x: { actions: { a: { effects: { end: "won" } } }, end_when: { beaten: "pain >= 80" } } } })).toContain("enc-unreachable:x:pain");
  });

  test("places that can't be reached or have nothing in them", () => {
    const found = ids({ start: { location: "home" }, locations: { home: { name: "Home", exits: ["park"] }, park: { name: "Park" }, island: { name: "Island" } }, actions: { nap: { at: ["home"] } } });
    expect(found).toContain("place-unreachable:island");
    expect(found).toContain("place-empty:park");
    expect(found).not.toContain("place-empty:home");
  });
});
