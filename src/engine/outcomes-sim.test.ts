// Encounter endings: one classifier (won / escaped / conceded / lost) for the simulator, the checker,
// quests and the encounter view; and simulating from a chosen point in the game.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeRuleset, type Ruleset } from "./ruleset.js";
import { isLoss, outcomeKind } from "./encounter-view.js";
import { patchedState, simulateEncounter } from "./simulate.js";
import { reviewBalance, simulateEncounter as checkerSim } from "./balance.js";
import { applyEvent, cloneState, initialState } from "./state.js";
import { resolveTurn } from "./resolve.js";
import { readPatch, simulateText } from "../tools/rulebook-tools.js";
import yaml from "js-yaml";

const Y = (raw: unknown) => yaml.dump(raw, { lineWidth: -1 });

const load = (raw: Record<string, unknown>) => normalizeRuleset(raw);
const rules = (raw: Record<string, unknown>): Ruleset => load(raw).ruleset!;

describe("how an ending counts", () => {
  test("an end_when on the foe heading the player's way is a win, whatever its name (slain)", () => {
    const r = rules({
      stats: { hp: { kind: "meter", start: 50 } },
      encounters: { e: { foe: { stats: { hp: { start: 30, max: 30 } } }, actions: { hit: { label: "Hit", effects: { foe: { hp: -10 } } } }, end_when: { slain: "foe.hp <= 0", beaten: "hp <= 0" } } },
    });
    const e = r.encounters.e;
    expect(e.outcomeKinds).toMatchObject({ slain: "won", beaten: "lost", lost: "lost" });
    expect(isLoss(e, "slain")).toBe(false);
    const sim = simulateEncounter(r, "e", { runs: 20 })!;
    expect(sim.policies.find((p) => p.policy === "always Hit")!.kinds).toEqual({ won: 20, escaped: 0, conceded: 0, lost: 0 });
    expect(simulateText([Y({ stats: { hp: { kind: "meter", start: 50 } }, encounters: { e: { foe: { stats: { hp: { start: 30, max: 30 } } }, actions: { hit: { label: "Hit", effects: { foe: { hp: -10 } } } }, end_when: { slain: "foe.hp <= 0", beaten: "hp <= 0" } } } })], "e", 20))
      .toMatch(/ends well 100% \(won 100% · escaped 0% · conceded 0% · lost 0%\)[\s\S]*Slain  \(won\)/);
  });

  test("a player stat pushed toward its bad end is a loss, whatever its name (dragged_down)", () => {
    const r = rules({
      stats: { dread: { kind: "meter", good: "low", start: 0 }, focus: { kind: "meter", start: 50 } },
      encounters: { e: { foe: { stats: { will: 10 } }, actions: { a: { effects: { dread: 10 } } }, end_when: { dragged_down: "dread >= 100", banished: "foe.will <= 0", focused: "focus >= 100" } } },
    });
    expect(r.encounters.e.outcomeKinds).toMatchObject({ dragged_down: "lost", banished: "won", focused: "won" });
  });

  test("the casefile template: catching the lie is a win, losing your nerve a loss", () => {
    const r = rules({
      stats: { nerve: { kind: "meter", start: 50 } },
      encounters: { interrogation: {
        foe: { stats: { composure: 12, lie: { start: 0, max: 10, good: "high" } } },
        actions: { press: { effects: { foe: { lie: 5 } } }, walk: { effects: { end: "walked" } } },
        end_when: { cracked: "foe.composure <= 0", caught: "foe.lie >= 10", rattled: "nerve <= 0" },
      } },
    });
    expect(r.encounters.interrogation.outcomeKinds).toMatchObject({ cracked: "won", caught: "won", rattled: "lost", walked: "conceded" });
  });

  test("a move that ends it only on a failure is a loss; only on a success, not one; names sort the rest", () => {
    const r = rules({
      stats: { hp: { kind: "meter", start: 50 } },
      encounters: { e: {
        foe: { stats: { hp: 10 } },
        actions: {
          grab: { label: "Grab the relic", check: { chance: 50 }, success: { end: "snatched" }, fail: { end: "spotted" } },
          run: { label: "Run", check: { chance: 50 }, success: { end: "got_away" }, fail: { hp: -5 } },
          pay: { label: "Pay", effects: { end: "paid_off" } },
          finish: { label: "Finish", check: { chance: 50 }, success: { end: "killed" } },
        },
        end_when: { won: "foe.hp <= 0" },
        timeout_outcome: "stalemate",
      } },
    });
    expect(r.encounters.e.outcomeKinds).toEqual({ won: "won", snatched: "won", spotted: "lost", got_away: "escaped", paid_off: "conceded", killed: "won", stalemate: "escaped" });
  });

  test("the author has the last word: losses: and outcome_kinds:, with readable warnings", () => {
    const { ruleset: r, issues } = load({
      stats: { hp: { kind: "meter", start: 50 } },
      encounters: { e: {
        foe: { stats: { hp: 10 } }, actions: { a: { effects: { foe: { hp: -1 } } } },
        end_when: { slain: "foe.hp <= 0", fled: "hp <= 10", purse: "hp <= 20" },
        losses: ["purse", "nope"],
        outcome_kinds: { fled: "escape", slain: "victory", purse: "lost", bogus: "sideways", lost: "conceded" },
      } },
    });
    expect(r!.encounters.e.outcomeKinds).toMatchObject({ slain: "won", fled: "escaped", purse: "lost", lost: "conceded" });
    const msgs = issues.map((i) => `${i.where}: ${i.message}`);
    expect(msgs.some((m) => m.includes("losses") && m.includes('"nope" isn\'t one of this encounter\'s endings'))).toBe(true);
    expect(msgs.some((m) => m.includes("outcome_kinds › bogus") && m.includes("use won, escaped, conceded or lost"))).toBe(true);
    const bad = load({ encounters: { e: { actions: { a: {} }, losses: 3, outcome_kinds: "x" } } }).issues.map((i) => i.message);
    expect(bad).toContain("expected a list of ending ids, like [beaten, captured]");
    expect(bad).toContain("expected a map of ending id → won, escaped, conceded or lost");
  });

  test("without the author's word, old rulebooks read as before: momentum and the name list", () => {
    const r = rules({ stats: { stress: { kind: "meter", start: 0 } }, encounters: { e: { actions: { a: {} }, momentum: { win: "routed", lose: "broken_line" }, end_when: { beaten: "stress >= 80" } } } });
    const e = r.encounters.e;
    expect([outcomeKind(e, "routed"), outcomeKind(e, "broken_line"), outcomeKind(e, "beaten"), outcomeKind(e, "captured"), outcomeKind(e, "ended")]).toEqual(["won", "lost", "lost", "lost", "won"]);
    expect(outcomeKind(undefined, "slain")).toBe("lost");
  });
});

// A toll: paying is always on offer; fighting is hard.
const TOLL = {
  stats: { hp: { kind: "meter", start: 30 }, gold: { kind: "money", start: 50 } },
  encounters: { toll: {
    name: "Toll",
    foe: { stats: { nerve: 30 } },
    actions: {
      fight: { label: "Fight", check: { chance: 30 }, success: { foe: { nerve: -10 } }, fail: { hp: -8 } },
      pay: { label: "Pay", effects: { gold: -10, end: "paid" } },
      run: { label: "Run", check: { chance: 40 }, success: { end: "escaped" }, fail: { hp: -4 } },
    },
    foe_moves: { hit: { desc: "Hits", weight: 1, hp: -6 } },
    end_when: { won: "foe.nerve <= 0", beaten: "hp <= 0" },
  } },
};

describe("the checker and the simulator agree", () => {
  test("both count the same runs into the same four kinds", () => {
    const r = rules(TOLL);
    const a = checkerSim(r, initialState(r), "toll", 80)!;
    const b = simulateEncounter(r, "toll", { runs: 80, maxRounds: 25 })!.policies.find((p) => p.policy === "a random mix")!;
    expect(a.kinds).toEqual(b.kinds);
    expect(a.kinds.conceded).toBeGreaterThan(0);
    const text = simulateText([Y(TOLL)], "toll", 80);
    const k = a.kinds, pct = (n: number) => `${Math.round((n / 80) * 100)}%`;
    expect(text).toContain(`ends well ${pct(k.won + k.escaped + k.conceded)} (won ${pct(k.won)} · escaped ${pct(k.escaped)} · conceded ${pct(k.conceded)} · lost ${pct(k.lost)})`);
    expect(text).toContain("Paid  (conceded)");
    expect(text).toContain("By strategy");
    expect(text).toMatch(/always Pay: won 0% · escaped 0% · conceded 100% · lost 0%/);
  });

  test("a concession isn't getting through: the checker says how it split", () => {
    const r = rules({ ...TOLL, encounters: { toll: { ...TOLL.encounters.toll, actions: { pay: TOLL.encounters.toll.actions.pay, fight: { label: "Fight", check: { chance: 5 }, success: { foe: { nerve: -1 } } } } } } });
    const w = reviewBalance(r).find((x) => x.id === "enc-hard:toll");
    expect(w?.text).toMatch(/won or escaped only \d+% of the time with random play \(won \d+% · escaped \d+% · conceded \d+% · lost \d+%/);
  });

  test("random play that mostly flees from a winnable fight is called out", () => {
    const flee = { ...TOLL, encounters: { toll: { ...TOLL.encounters.toll, actions: {
      fight: { label: "Fight", check: { chance: 5 }, success: { foe: { nerve: -10 } } },
      run: { label: "Run", check: { chance: 90 }, success: { end: "escaped" } },
    } } } };
    const text = simulateText([Y(flee)], "toll", 60);
    expect(text).toContain("mostly gets out");
    expect(text).toContain("fleeing isn't beating it");
  });
});

// A fight that only makes sense later: damage scales with level, which a trigger turns into power.
const LATE = {
  stats: {
    level: { kind: "attribute", start: 1, max: 99 },
    power: { kind: "hidden", start: 0, max: 999 },
    hp: { kind: "meter", max: "100 + level * 10", start: 100 },
  },
  relationships: { stats: { trust: { start: 0 } }, people: { maud: { name: "Maud" } } },
  locations: { gate: { name: "Gate" }, inn: { name: "Inn" } },
  start: { location: "inn" },
  items: { sword: { name: "Sword" } },
  conditions: { blessed: { label: "Blessed" } },
  triggers: { power_up: { when: "power != level * 3", repeat: true, do: { set: { power: "level * 3" } } } },
  encounters: { boss: {
    name: "Boss", foe: { stats: { hp: 60 } },
    actions: {
      hit: { label: "Hit", check: { chance: 60 }, success: { foe: { hp: "-power" } }, fail: { hp: -10 } },
      run: { label: "Run", check: { chance: 30 }, success: { end: "escaped" } },
    },
    foe_moves: { claw: { desc: "Claws", weight: 1, hp: -15 } },
    end_when: { slain: "foe.hp <= 0", fallen: "hp <= 0" },
  } },
};

describe("simulating from a chosen point in the game", () => {
  test("a patch sets stats (formula caps included), flags, items, place, statuses and feelings; triggers then run", () => {
    const r = rules(LATE);
    const { state, notes } = patchedState(r, { stats: { level: 10, hp: "max" }, flags: { met: true }, items: { sword: 2 }, location: "gate", conditions: ["blessed"], rel: { maud: { trust: 60 } } });
    expect(notes).toEqual([]);
    expect(state.stats.level).toBe(10);
    expect(state.stats.hp).toBe(200);
    expect(state.stats.power).toBe(30);
    expect(state.flags.met).toBe(true);
    expect(state.items.sword).toBe(2);
    expect(state.location).toBe("gate");
    expect(state.conditions.blessed).toBeTruthy();
    expect(state.rel.maud.trust).toBe(60);
    expect(patchedState(r, { stats: { level: 10 }, triggers: false }).state.stats.power).toBe(0);
  });

  test("unknown names come back as notes, not failures", () => {
    const r = rules(LATE);
    const { notes } = patchedState(r, { stats: { lvl: 3, hp: "lots" }, location: "moon", conditions: ["cursed"], rel: { bob: { trust: 1 }, maud: { fear: 2 } }, perks: ["x"], wear: ["sword"] });
    expect(notes).toEqual([
      'stats: "lvl" isn\'t a stat', 'stats: hp = "lots" — use a number, "max" or "min"', 'location: "moon" isn\'t a place',
      'conditions: "cursed" isn\'t a status', 'rel: "bob" isn\'t a person', 'rel: "fear" isn\'t a relationship stat',
      'perks: "x" isn\'t a perk', 'wear: "sword" isn\'t clothing with a slot',
    ]);
  });

  test("the tools simulate from the patch, and show every strategy", () => {
    const text = Y(LATE);
    const atStart = simulateText([text], "boss", 60);
    const later = simulateText([text], "boss", 60, { set: { stats: { level: 12, hp: "max" } } });
    const won = (t: string) => Number(/ends well \d+% \(won (\d+)%/.exec(t)![1]);
    expect(won(later)).toBeGreaterThan(won(atStart));
    expect(later).toContain("From the start with: level 12, hp max (then triggers ran).");
    expect(later).toMatch(/always Hit: won \d+%/);
    expect(later).toMatch(/always Run: won 0% · escaped \d+%/);
    expect(simulateText([text], "boss", 60, { strategies: false })).not.toContain("By strategy");
    expect(simulateText([text], "boss", 20, { set: { stats: { nope: 1 } } })).toContain('! stats: "nope" isn\'t a stat');
  });

  test("patches read from JSON or --stat id=value", () => {
    expect(readPatch('{"stats":{"level":12},"flags":{"met":true}}', ["hp=max", "level=14"])).toEqual({ stats: { level: 14, hp: "max" }, flags: { met: true } });
    expect(readPatch({ location: "gate" })).toEqual({ location: "gate" });
    expect(readPatch(undefined)).toBeUndefined();
    expect(() => readPatch("{oops")).toThrow(/needs JSON/);
    expect(() => readPatch(undefined, ["level"])).toThrow(/id=value/);
  });

  test("the command line takes --set, --stat and --no-strategies", async () => {
    const dir = mkdtempSync(join(tmpdir(), "warp-sim-"));
    const file = join(dir, "late.yaml");
    writeFileSync(file, Y(LATE));
    const cli = new URL("../tools/cli.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
    const run = (...args: string[]) => Bun.spawnSync(["bun", cli, "simulate", file, "--runs", "20", ...args]).stdout.toString();
    expect(run("--stat", "level=12", "--set", '{"stats":{"hp":"max"}}')).toContain("From the start with: hp max, level 12");
    expect(run("--no-strategies")).not.toContain("By strategy");
  });
});

describe("everywhere the same", () => {
  test("the checker warns when a winnable fight is mostly fled from (escapes don't inflate success)", () => {
    const r = rules({ ...TOLL, encounters: { toll: { ...TOLL.encounters.toll, actions: {
      fight: { label: "Fight", check: { chance: 5 }, success: { foe: { nerve: -10 } } },
      run: { label: "Run", check: { chance: 90 }, success: { end: "escaped" } },
    } } } });
    const w = reviewBalance(r).find((x) => x.id === "enc-flee:toll");
    expect(w?.text).toMatch(/is won only \d+% of the time with random play; it mostly ends by getting away \(won \d+% · escaped \d+%/);
    expect(reviewBalance(r).some((x) => x.id === "enc-easy:toll" || x.id === "enc-hard:toll")).toBe(false);
  });

  test("quest goals count an encounter 'slain' as a win (the quest hook uses the classifier)", () => {
    const r = rules({
      stats: { hp: { kind: "meter", start: 50 } },
      encounters: { wolves: { foe: { stats: { hp: 5 } }, actions: { hit: { label: "Hit", effects: { foe: { hp: -10 } } } }, end_when: { slain: "foe.hp <= 0", beaten: "hp <= 0" } } },
      quests: { cull: { name: "Cull", goals: [{ id: "kills", text: "Kill wolves", count: 1, on: "wolves" }], reward: { hp: 1 } } },
      actions: { take: { label: "Take", effects: { quest: { cull: "start" }, start_encounter: "wolves" } } },
    });
    let s = initialState(r);
    const step = (id: string) => { const rec = resolveTurn(r, s, { actionId: id, via: "choice" }, { seed: `t:${id}:${s.turn}` }); const n = cloneState(s); for (const e of rec.events) applyEvent(n, e, r); s = n; };
    step("take");
    expect(s.encounter?.id).toBe("wolves");
    step("hit");
    expect(s.encounter).toBeNull();
    expect(s.quests.cull).toMatchObject({ st: "done", prog: { kills: 1 } });
  });
});

describe("an encounter's own sim: state", () => {
  const withSim = (sim: unknown) => ({ ...LATE, encounters: { boss: { ...LATE.encounters.boss, sim } } });

  test("is normalized, with readable warnings for bad names and values", () => {
    const { ruleset: r, issues } = load(withSim({ stats: { level: 12, hp: "max", nope: 3, power: "lots" }, flags: { met: true }, items: { sword: "x" }, location: 4, bogus: 1 }));
    expect(r!.encounters.boss.sim).toEqual({ stats: { level: 12, hp: "max" }, flags: { met: true }, items: {} });
    const msgs = issues.map((i) => `${i.where}: ${i.message}`);
    expect(msgs).toContain('Encounters › boss › sim › stats › nope: "nope" isn\'t a declared stat');
    expect(msgs).toContain('Encounters › boss › sim › stats › power: "lots" — use a number, max or min');
    expect(msgs).toContain("Encounters › boss › sim › items › sword: expected a count");
    expect(msgs).toContain("Encounters › boss › sim › location: expected a place id");
    expect(msgs.some((m) => m.startsWith("Encounters › boss › sim › bogus: isn't a sim: key"))).toBe(true);
    expect(load(withSim("level 12")).issues.some((i) => i.where === "Encounters › boss › sim")).toBe(true);
    expect(rules(LATE).encounters.boss.sim).toBeUndefined();
  });

  test("the checker and the simulator judge it from there; an explicit patch overrides it", () => {
    const at = (t: string) => Number(/ends well \d+% \(won (\d+)%/.exec(t)![1]);
    const plain = simulateText([Y(LATE)], "boss", 60);
    const late = simulateText([Y(withSim({ stats: { level: 12, hp: "max" } }))], "boss", 60);
    expect(late).toContain("Boss: judged from its sim: level 12, hp max");
    expect(at(late)).toBeGreaterThan(at(plain));
    const overridden = simulateText([Y(withSim({ stats: { level: 12, hp: "max" } }))], "boss", 60, { set: { stats: { level: 1 } } });
    expect(overridden).not.toContain("judged from its sim");
    expect(at(overridden)).toBe(at(plain));
    const r0 = rules(LATE), r1 = rules(withSim({ stats: { level: 12, hp: "max" } }));
    const verdict = (r: Ruleset) => reviewBalance(r).filter((w) => w.id.endsWith(":boss")).map((w) => w.id);
    expect(verdict(r1)).not.toEqual(verdict(r0));
    expect(reviewBalance(rules(withSim({ location: "moon" }))).find((w) => w.id === "enc-sim:boss")?.text).toBe('“Boss” sim: location: "moon" isn\'t a place.');
  });

  test("a designed toll is not called fleeing: enc-flee counts escapes only", () => {
    const r = rules({ ...TOLL, encounters: { toll: { ...TOLL.encounters.toll, actions: {
      fight: { label: "Fight", check: { chance: 5 }, success: { foe: { nerve: -10 } } },
      pay: TOLL.encounters.toll.actions.pay,
    } } } });
    expect(reviewBalance(r).some((w) => w.id === "enc-flee:toll")).toBe(false);
  });
});
