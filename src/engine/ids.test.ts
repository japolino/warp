// Ids from names the story writes: letters and digits of any script (ADVENTURE-1).

import { describe, expect, test } from "bun:test";
import { idFrom } from "./ids.js";
import { normalizeRuleset, slug } from "./ruleset.js";
import { foldEvents, initialState, placeId, type GameState } from "./state.js";
import { applyProposal, type Proposal } from "./resolve.js";
import { stateDigest } from "./view.js";

/** The id rule before Unicode: ASCII letters and digits only. */
const oldId = (s: string) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x";

describe("ids from names", () => {
  test("an ASCII name gives exactly the id it always did", () => {
    const names = ["The Rusty Anchor", "Miu Tanaka", "  x--Y  ", "!!!", "", "R2-D2", "dr. o'neil", "A_B", "__x__", "Room 101", "#1 fan", "tab\there"];
    for (const n of names) expect(idFrom(n)).toBe(oldId(n));
    for (let i = 0; i < 500; i++) {
      const n = Array.from({ length: 1 + (i % 17) }, (_, k) => String.fromCharCode(32 + ((i * 31 + k * 7) % 95))).join("");
      expect(idFrom(n)).toBe(oldId(n));
    }
  });
  test("letters of any script are kept, and two names stay two ids", () => {
    expect(idFrom("아린")).toBe("아린");
    expect(idFrom("바크")).toBe("바크");
    expect(idFrom("시작 마을")).toBe("시작_마을");
    expect(idFrom("がっこう")).toBe("がっこう");
    expect(idFrom("が")).not.toBe(idFrom("か"));
    expect(idFrom("北京 饭店")).toBe("北京_饭店");
    expect(idFrom("Мария")).toBe("мария");
    expect(new Set(["빵", "물통", "회복약", "パン", "水筒", "面包"].map(idFrom)).size).toBe(6);
  });
  test("Latin accents fold away", () => {
    expect(idFrom("José")).toBe("jose");
    expect(idFrom("Café Noir")).toBe("cafe_noir");
    expect(idFrom("Zoë")).toBe(idFrom("Zoe"));
  });
  test("an emoji-only name is its own id, not x", () => {
    expect(idFrom("🍞")).not.toBe("x");
    expect(idFrom("🍞")).not.toBe(idFrom("🗡️"));
  });
  test("slug and placeId use the same rule", () => {
    expect(slug("감시탑")).toBe("감시탑");
    expect(placeId("감시탑")).toBe("감시탑");
  });
});

describe("non-Latin names in play", () => {
  const r = normalizeRuleset({
    style: "story",
    relationships: { open: true, stats: { trust: { start: 20, narrator: 5 } } },
    inventory: { open: true },
    goals: { from_story: true, max: 3 },
  }).ruleset!;
  const read = (s: GameState, p: Proposal) => foldEvents(r, [applyProposal(r, s, p)], s);

  test("Korean items, people, goals and places stay apart", () => {
    let s = initialState(r);
    s = read(s, { items: { 빵: 1 } });
    s = read(s, { items: { 물통: 1 } });
    s = read(s, { items: { 회복약: 2 } });
    expect(s.items).toEqual({ 빵: 1, 물통: 1, 회복약: 2 });
    s = read(s, { people: [{ name: "아린", feelings: { trust: 60 } }] });
    s = read(s, { people: [{ name: "바크", feelings: { trust: 5 } }] });
    s = read(s, { rel: { 아린: { trust: 5 } } });
    expect(Object.keys(s.people).sort()).toEqual(["바크", "아린"].sort());
    expect(s.rel["아린"].trust).toBe(65);
    expect(s.rel["바크"].trust).toBe(5);
    s = read(s, { goals: { new: [{ text: "봉인을 조사한다" }] } });
    s = read(s, { goals: { new: [{ text: "아린의 동생을 찾는다" }] } });
    expect(Object.values(s.goals).map((g) => g.text)).toEqual(["봉인을 조사한다", "아린의 동생을 찾는다"]);
    s = read(s, { goals: { done: ["아린의 동생을 찾는다"] } });
    expect(Object.values(s.goals).map((g) => g.st)).toEqual(["open", "done"]);
    s = read(s, { place: "시작 마을", scene: { 아린: true } });
    s = read(s, { place: "감시탑" });
    expect(s.location).toBe("감시탑");
    expect(stateDigest(r, s)).not.toMatch(/Here: 아린/);
  });

  test("a chat that already holds the old id x keeps finding its person by name", () => {
    let s = initialState(r);
    s = foldEvents(r, [[{ t: "person", id: "x", name: "아린", src: "narrator" }]], s);
    s = read(s, { rel: { 아린: { trust: 3 } } });
    expect(Object.keys(s.people)).toEqual(["x"]);
    expect(s.rel.x.trust).toBe(23);
  });
});
