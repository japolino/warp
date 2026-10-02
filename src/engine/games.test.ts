// Minigames instead of dice: the odds set the score to beat, the score lands on the
// same tiers, stats and perks become aids, and the story hears how it went. Tables
// that take real money settle what was won or lost — played, or dealt without you.

import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { applyEvent, cloneState, initialState, type GameState } from "./state.js";
import { resolveTurn, type TurnRecord } from "./resolve.js";
import { buildChoices } from "./view.js";
import { lintRuleset } from "./lint.js";
import { aidTotal, aidsFor, clampNet, cleanResult, gameBar, gameFor, simulateGamble, tierFromScore, gambleRng } from "./games.js";

const rules = (extra: Record<string, unknown> = {}) => {
  const { ruleset, issues } = normalizeRuleset({
    clock: { start: "Mon 12:00" },
    hud: { currency: "£" },
    stats: {
      money: { kind: "money", start: 100 },
      stress: { kind: "meter", start: 20, max: 100, good: "low" },
      lockpicking: { kind: "skill", max: 100, start: 70 },
      athletics: { kind: "skill", max: 100, start: 5 },
    },
    relationships: { stats: { trust: { start: 10, max: 100 } }, people: { jo: { name: "Jo", schedule: [{ at: "home" }] } } },
    locations: { home: { name: "Home" } },
    start: { location: "home" },
    perks: {
      steady: { name: "Steady Hands", rule: { game: { window: "20%", lives: 1, games: ["mines"] } } },
      lucky: { name: "Lucky", rule: { reroll: { stats: ["lockpicking"], per_day: 1 } } },
    },
    actions: {
      pick: { label: "Pick the lock", check: { chance: "lockpicking / 2 + 20", label: "Lockpicking", game: "minesweeper" }, success: { flags: { open: true } }, fail: { stress: 5 } },
      jog: { label: "Jog", check: { chance: "40 + athletics / 2", label: "Athletics" }, success: { stress: -3 } },
      dice_only: { label: "Pray", check: { chance: 50, game: false }, success: { stress: -1 } },
      race: { label: "Race with {target}", per_person: true, check: { chance: 50, game: "three-legged race" }, success: { stress: -5 } },
      cards: { label: "Play cards", gamble: { game: "blackjack", stakes: [10, 40], rounds: 4, win: { stress: -4 }, broke: { flags: { broke: true } } } },
    },
    ...extra,
  });
  expect(issues.filter((i) => i.level === "error")).toEqual([]);
  return ruleset!;
};

const after = (r: ReturnType<typeof rules>, s: GameState, rec: TurnRecord) => { const n = cloneState(s); for (const e of rec.events) applyEvent(n, e, r); return n; };

describe("the bar", () => {
  test("easy checks pass on a sloppy run, long shots need nearly everything", () => {
    const easy = gameBar(0.9), hard = gameBar(0.1);
    expect(easy.success).toBeLessThan(0.4);
    expect(hard.success).toBeGreaterThan(0.85);
    for (const b of [easy, gameBar(0.5), hard]) {
      expect(b.partial).toBeLessThan(b.success);
      expect(b.success).toBeLessThan(b.crit);
    }
    expect(tierFromScore(gameBar(0.5), 0.62)).toBe("success");
    expect(tierFromScore(gameBar(0.5), 0.55)).toBe("partial");
    expect(tierFromScore(gameBar(0.5), 0.99)).toBe("crit_success");
    expect(tierFromScore(gameBar(0.5), 0.01)).toBe("crit_fail");
    expect(gameBar(0.5, { crits: false }).critFail).toBeNull();
  });

  test("a check without a named game gets one that fits its skill", () => {
    expect(gameFor("Marksmanship", "x")).toBe("aim");
    expect(gameFor("Lockpicking", "x")).toBe("mines");
    expect(gameFor("Charm", "x")).toBe("blackjack");
    expect(gameFor("Dancing", "x")).toBe("tiles");
    expect(["aim", "tiles", "mines", "snake", "stack", "pinball"]).toContain(gameFor("Wibble", "seed"));
  });
});

describe("rulebooks", () => {
  test("games, tables and game perks parse; a made-up game is flagged", () => {
    const r = rules();
    expect(r.actions.pick.check!.game).toEqual(["mines"]);
    expect(r.actions.dice_only.check!.game).toBe(false);
    expect(r.actions.race.check!.game).toEqual(["race"]);
    expect(r.actions.cards.gamble).toMatchObject({ game: "blackjack", stakes: [10, 40], rounds: 4 });
    expect(r.actions.cards.params.find((p) => p.id === "stake")?.options).toEqual({ 10: 10, 40: 40 });
    expect(r.perks.steady.rules[0]).toEqual({ kind: "game", games: ["mines"], aids: { window: 20, lives: 1 } });
    const bad = normalizeRuleset({ stats: { x: { kind: "skill" } }, actions: { a: { check: { chance: 50, game: "chess" } } } });
    expect(bad.issues.some((i) => i.message.includes('"chess" isn\'t a minigame'))).toBe(true);
    expect(lintRuleset(r).filter((i) => i.where.includes("gamble"))).toEqual([]);
  });
});

describe("the look", () => {
  test("a rulebook names its look; offers carry it; nonsense falls back to modern with a warning", () => {
    expect(rules().look).toBe("modern");
    const fantasy = normalizeRuleset({ look: "Fantasy", stats: { x: { kind: "skill" } }, actions: { a: { label: "A", check: { chance: 50, game: "aim" } } } });
    expect(fantasy.ruleset!.look).toBe("medieval");
    expect(buildChoices(fantasy.ruleset!, initialState(fantasy.ruleset!), { lines: [], veils: [], minigames: "ask" }).find((c) => c.id === "a")?.game?.style).toBe("medieval");
    expect(normalizeRuleset({ look: "sci-fi" }).ruleset!.look).toBe("scifi");
    // The older spelling, from when the look only dressed the arcade.
    expect(normalizeRuleset({ minigames: { style: "space" } }).ruleset!.look).toBe("scifi");
    expect(normalizeRuleset({ minigames: { style: "medieval" } }).ruleset!.look).toBe("medieval");
    expect(normalizeRuleset({ look: "modern", minigames: { style: "medieval" } }).ruleset!.look).toBe("modern");
    const bad = normalizeRuleset({ look: "baroque" });
    expect(bad.ruleset!.look).toBe("modern");
    expect(bad.issues.some((i) => i.where === "Look")).toBe(true);
  });
});

describe("offers on choices", () => {
  test("rulebook games are offered; every check when asked; never with minigames off or game: false", () => {
    const r = rules();
    const s = initialState(r);
    const on = buildChoices(r, s, { lines: [], veils: [], minigames: "ask", minigameScope: "rulebook" });
    expect(on.find((c) => c.id === "pick")?.game?.game).toBe("mines");
    expect(on.find((c) => c.id === "jog")?.game).toBeUndefined();
    const all = buildChoices(r, s, { lines: [], veils: [], minigames: "ask", minigameScope: "all" });
    expect(all.find((c) => c.id === "jog")?.game?.game).toBe("snake");
    expect(all.find((c) => c.id === "dice_only")?.game).toBeUndefined();
    const off = buildChoices(r, s, { lines: [], veils: [], minigames: "off" });
    expect(off.some((c) => c.game || c.gamble)).toBe(false);
    const cards = on.find((c) => c.id === "cards")!;
    expect(cards.gamble).toMatchObject({ game: "blackjack", stakes: [10, 40], money: { stat: "money", have: 100, currency: "£" } });
  });

  test("the bar follows the dice's odds; skill and perks become aids", () => {
    const r = rules();
    const s = initialState(r);
    s.perks.steady = { at: 0 } as never;
    s.perks.lucky = { at: 0 } as never;
    const g = buildChoices(r, s, { lines: [], veils: [], minigames: "ask" }).find((c) => c.id === "pick")!.game!;
    expect(g.chance).toBeCloseTo(0.55, 2);
    expect(g.bar).toEqual(gameBar(0.55, { crits: true }));
    // Lockpicking 70 of 100 → wider timing … mines uses time; the perk adds a window (not a mines aid) and a life; the reroll perk a life.
    expect(aidTotal(g.aids, "time")).toBeGreaterThan(20);
    expect(aidTotal(g.aids, "hint")).toBe(1);
    expect(g.aids.filter((a) => a.kind === "lives").map((a) => a.from).sort()).toEqual(["★ Lucky", "★ Steady Hands"]);
    expect(aidsFor(r, s, r.actions.jog, "snake", ["athletics"]).length).toBe(0);
  });

  test("the race ties {{user}} to the person it's with, as steady as they're close", () => {
    const r = rules();
    const s = initialState(r);
    s.people.jo = { name: "Jo" } as never;
    s.rel.jo = { trust: 80 };
    const c = buildChoices(r, s, { lines: [], veils: [], minigames: "ask" }).find((x) => x.id.startsWith("race"))!;
    expect(c.game?.partner).toEqual({ name: "Jo", sync: 0.8 });
  });
});

describe("playing it instead of rolling", () => {
  const play = (score: number, extra: Record<string, unknown> = {}) => {
    const r = rules();
    const s = initialState(r);
    const rec = resolveTurn(r, s, { actionId: "pick", via: "choice", game: { game: "mines", score, beats: ["a shaky start", "cleared it with seconds left"], detail: "80 of 91 squares", ...extra } }, { seed: "x" });
    return { r, s, rec };
  };

  test("the score decides the tier, and the outcome follows", () => {
    const { r, s, rec } = play(0.97);
    expect(rec.check?.game?.id).toBe("mines");
    expect(rec.check?.tier).toBe("crit_success");
    expect(after(r, s, rec).flags.open).toBe(true);
    const low = play(0.05).rec;
    expect(low.check?.tier).toMatch(/fail/);
  });

  test("the story hears how it went, in its own terms", () => {
    const hint = play(0.8).rec.hints.join(" ");
    expect(hint).toContain("own hands rather than dice");
    expect(hint).toContain("a shaky start; cleared it with seconds left");
    expect(hint).toContain("not as a game");
  });

  test("a harder song eases the bar, within limits; no reroll on top of lives", () => {
    const base = play(0.6).rec.check!;
    const eased = play(0.6, { ease: -0.5 }).rec.check!;
    expect(eased.game!.bar.success).toBeCloseTo(base.game!.bar.success - 0.12, 5);
  });

  test("a perk's life spent in the game counts as its reroll for the day", () => {
    const r = rules();
    const s = initialState(r);
    s.perks.lucky = { at: 0 } as never;
    const rec = resolveTurn(r, s, { actionId: "pick", via: "choice", game: { game: "mines", score: 0.1, beats: [], livesUsed: 1, perk: "Lucky" } }, { seed: "x" });
    expect(rec.events.some((e) => e.t === "charge" && e.key === "perk:lucky:reroll")).toBe(true);
  });

  test("results from the page are clamped", () => {
    expect(cleanResult({ game: "mines", score: 7, beats: ["x".repeat(500), 3], ease: -9 }, [])).toEqual({ game: "mines", score: 1, beats: ["x".repeat(120)], ease: -0.12 });
    expect(cleanResult({ game: "chess", score: 1 }, [])).toBeNull();
    expect(cleanResult({ game: "aim", score: 1 }, ["mines"])).toBeNull();
  });
});

describe("gambling", () => {
  test("a played sitting pays what it won, never more than the table could", () => {
    const r = rules();
    const s = initialState(r);
    const rec = resolveTurn(r, s, { actionId: "cards", via: "choice", game: { game: "blackjack", stake: 40, net: 35, beats: ["the cards ran their way"] } }, { seed: "g" });
    expect(rec.gamble).toEqual({ game: "blackjack", stake: 40, net: 35, played: true });
    const n = after(r, s, rec);
    expect(n.stats.money).toBe(135);
    expect(n.stats.stress).toBe(16);
    expect(rec.hints.join(" ")).toContain("walks away £35 up");
    expect(clampNet("blackjack", 40, -999, 4)).toBe(-40);
    expect(clampNet("blackjack", 40, 99999, 4)).toBe(400);
  });

  test("losing everything sets off the table's broke: effects", () => {
    const r = rules();
    const s = initialState(r);
    s.stats.money = 40;
    const rec = resolveTurn(r, s, { actionId: "cards", via: "choice", game: { game: "blackjack", stake: 40, net: -40, beats: [] } }, { seed: "g" });
    const n = after(r, s, rec);
    expect(n.stats.money).toBe(0);
    expect(n.flags.broke).toBe(true);
  });

  test("dealt without the player, a sitting is simulated at the table's odds", () => {
    const r = rules();
    const s = initialState(r);
    const rec = resolveTurn(r, s, { actionId: "cards", via: "choice", params: { stake: "10" } }, { seed: "sim" });
    expect(rec.gamble?.played).toBe(false);
    expect(rec.gamble?.stake).toBe(10);
    // Over many sittings the house keeps a little.
    let total = 0;
    for (let i = 0; i < 4000; i++) total += simulateGamble("roulette", 100, 5, 0.027, gambleRng(String(i))).net;
    expect(total / 4000).toBeLessThan(2);
    expect(total / 4000).toBeGreaterThan(-15);
  });
});
