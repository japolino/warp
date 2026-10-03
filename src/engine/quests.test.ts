// Quests: offered by someone who's there or posted on a board, goals the rules can
// see, deadlines, handing in, rewards, a price for failing that the person who
// asked remembers — and favours the story hands out on its own.

import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { applyEvent, cloneState, initialState, makeEnv, type GameState } from "./state.js";
import { applyProposal, resolveTurn, type TurnRecord } from "./resolve.js";
import { buildChoices, buildHud, stateDigest } from "./view.js";
import { evalBool } from "./expr.js";
import { lintRuleset } from "./lint.js";

const rules = (extra: Record<string, unknown> = {}) => {
  const { ruleset, issues } = normalizeRuleset({
    clock: { start: "Mon 07:00" },
    stats: {
      gold: { kind: "money", start: 10 },
      renown: { kind: "meter", start: 0, good: "high" },
      cooking: { kind: "skill", max: 100, start: 50 },
    },
    relationships: {
      stats: { trust: { start: 20, narrator: 5 }, mood: { start: 50, narrator: 5 } },
      people: {
        hesk: { name: "Hesk" },
        mia: { name: "Mia" },
        king: { name: "The King" },
      },
    },
    locations: {
      home: { name: "Home" },
      square: { name: "Village Square", board: true },
      guild: { name: "Guild Hall" },
      castle: { name: "Castle" },
    },
    start: { location: "home" },
    items: { pelt: "Wolf pelt" },
    quests: {
      wolves: {
        name: "Thin the wolf pack", kind: "bounty", giver: "hesk", board: true, days: 3,
        desc: "Wolves are taking travellers on the forest road.",
        goals: [{ id: "kills", text: "Kill wolves", count: 3 }, { id: "pelt", text: "Bring back a pelt", when: "has('pelt')" }],
        reward: { gold: 30, rel: { hesk: { trust: 5 } } },
        failure: { renown: -5 },
        stakes: "Hesk stops trusting you with work.",
      },
      breakfast: {
        name: "Breakfast in bed", giver: "mia", when: "hour < 10",
        goals: [{ text: "Cook Mia the best breakfast" }],
        reward: { rel: { mia: { mood: 15 } } },
        failure: { rel: { mia: { mood: -10 } } },
        remember: { failed: "{{user}} burned her birthday breakfast." },
      },
      dragon: {
        name: "The great dragon of the plains", giver: "king", kind: "main", auto: true, when: "renown >= 10", report: true,
        goals: [{ text: "Slay the dragon", when: "flag('dragon_dead')" }],
        reward: { gold: 50000, renown: 40 },
      },
      chores: { name: "Muck out the stables", board: true, repeat: 1, goals: [{ text: "Muck out", count: 1 }], reward: { gold: 2 } },
    },
    actions: {
      cook: { label: "Cook breakfast", at: ["home"], check: { chance: "cooking" }, success: { quest: { breakfast: "done" } }, fail: { quest: { breakfast: "fail" } } },
      hunt: { label: "Hunt a wolf", effects: { progress: { wolves: 1 } } },
      skin: { label: "Skin it", effects: { give: "pelt" } },
      slay: { label: "Slay the dragon", effects: { flags: { dragon_dead: true } } },
      muck: { label: "Muck out", effects: { progress: { chores: 1 } } },
      gate: { label: "Enter the lair", requires: { quest: "dragon" }, effects: {} },
    },
    flags: { dragon_dead: false },
    ...extra,
  });
  if (!ruleset) throw new Error(issues.map((i) => `${i.where}: ${i.message}`).join("\n"));
  return { r: ruleset, issues };
};
type R = ReturnType<typeof rules>["r"];
const fold = (r: R, s: GameState, rec: TurnRecord) => { const n = cloneState(s); rec.events.forEach((e) => applyEvent(n, e, r)); return n; };
const act = (r: R, s: GameState, actionId: string, seed = "a") => { const rec = resolveTurn(r, s, { actionId, via: "choice" }, { seed }); return { rec, s: fold(r, s, rec) }; };
/** Where each giver is found: the story puts them in the scene when {{user}} is there. */
const HOMES: Record<string, string> = { hesk: "guild", mia: "home", king: "castle" };
const meet = (r: R, s: GameState) => { for (const [who, place] of Object.entries(HOMES)) if (place === s.location) applyEvent(s, { t: "scene", who, here: true, src: "manual" }, r); return s; };
const at = (r: R, loc: string) => { const s = initialState(r); applyEvent(s, { t: "move", to: loc, src: "manual" }, r); return meet(r, s); };
const choices = (r: R, s: GameState) => buildChoices(r, s, { lines: [], veils: [] });

describe("being offered work", () => {
  test("the giver offers it while they're there; the board posts it; elsewhere it isn't offered", () => {
    const { r } = rules();
    expect(choices(r, at(r, "guild")).find((c) => c.id === "quest:take:wolves")?.label).toBe('Hesk asks: "Thin the wolf pack"');
    expect(choices(r, at(r, "square")).find((c) => c.id === "quest:take:wolves")?.label).toBe('Notice: "Thin the wolf pack"');
    expect(choices(r, at(r, "castle")).some((c) => c.id === "quest:take:wolves")).toBe(false);
    const hud = buildHud(r, at(r, "guild"));
    const q = hud.quests.find((x) => x.id === "wolves")!;
    expect(q.status).toBe("offered");
    expect(q.reward).toBe("$30, +5 Trust with Hesk");
    expect(q.due).toBe("3 days to do it");
    expect(stateDigest(r, at(r, "guild"))).toContain('Has something to ask of {{user}}');
  });

  test("taking it: due date, goals in the log, a direction for the narrator", () => {
    const { r } = rules();
    const { s, rec } = act(r, at(r, "guild"), "quest:take:wolves");
    expect(s.quests.wolves.st).toBe("active");
    expect(s.quests.wolves.due).toBe(s.quests.wolves.at + 3 * 1440);
    expect(rec.hints.join(" ")).toMatch(/NEW QUEST — "Thin the wolf pack", for Hesk/);
    const q = buildHud(r, s).quests.find((x) => x.id === "wolves")!;
    expect(q.goals.map((g) => g.progress)).toEqual(["0/3", null]);
    expect(q.drop).toBe("quest:drop:wolves");
    expect(stateDigest(r, s)).toMatch(/Quests under way.*"Thin the wolf pack" for Hesk — ☐ Kill wolves \(0\/3\)/);
  });
});

describe("doing it", () => {
  test("progress counts up; when every goal is met it waits for Hesk, who pays and remembers", () => {
    const { r } = rules();
    let { s } = act(r, at(r, "guild"), "quest:take:wolves");
    for (const seed of ["1", "2", "3"]) s = act(r, s, "hunt", seed).s;
    expect(s.quests.wolves.prog.kills).toBe(3);
    expect(s.quests.wolves.st).toBe("active");
    s = act(r, s, "skin").s;
    expect(s.quests.wolves.st).toBe("ready");
    expect(choices(r, s).find((c) => c.id === "quest:report:wolves")?.label).toBe('Tell Hesk: "Thin the wolf pack" is done');
    const done = act(r, s, "quest:report:wolves");
    expect(done.s.quests.wolves.st).toBe("done");
    expect(done.s.stats.gold).toBe(40);
    expect(done.s.rel.hesk.trust).toBe(25);
    expect(done.s.memories.hesk[0].text).toContain("came through");
    expect(done.rec.hints.join(" ")).toMatch(/QUEST COMPLETE — "Thin the wolf pack". Reward: \$30/);
  });

  test("running out of time fails it: the price is paid and Hesk remembers", () => {
    const { r } = rules({ actions: { sleep: { label: "Sleep for days", time: 5 * 1440, effects: {} } } });
    let { s } = act(r, at(r, "guild"), "quest:take:wolves");
    const f = act(r, s, "sleep");
    s = f.s;
    expect(s.quests.wolves.st).toBe("failed");
    expect(s.stats.renown).toBe(0); // clamped: was 0, −5
    expect(s.memories.hesk[0].text).toMatch(/let them down.*time ran out/);
    expect(f.rec.hints.join(" ")).toMatch(/QUEST FAILED — "Thin the wolf pack" \(time ran out\). Hesk stops trusting you with work./);
  });

  test("a failed roll can fail a quest: the burnt breakfast, and Mia remembers it in her own words", () => {
    const { r } = rules({ stats: { gold: { kind: "money", start: 10 }, renown: { kind: "meter", start: 0, good: "high" }, cooking: { kind: "skill", max: 100, start: 1 } } });
    let { s } = act(r, at(r, "home"), "quest:take:breakfast");
    s = act(r, s, "cook", "x").s;
    expect(s.quests.breakfast.st).toBe("failed");
    expect(s.rel.mia.mood).toBe(40);
    expect(s.memories.mia[0].text).toBe("{{user}} burned her birthday breakfast.");
    expect(stateDigest(r, s)).toContain("Mia remembers: {{user}} burned her birthday breakfast.");
  });

  test("a quest can start itself; requirements can name a quest; the king pays out on handing in", () => {
    const { r } = rules();
    let s = at(r, "castle");
    expect(choices(r, s).find((c) => c.id === "gate")?.locked).toBe('Needs the quest "The great dragon of the plains"');
    s.stats.renown = 10;
    s = act(r, s, "slay").s; // the dragon dies the same turn the quest starts: nothing to hand in yet — it's taken first
    expect(s.quests.dragon.st).toBe("ready");
    s = act(r, s, "quest:report:dragon").s;
    expect(s.stats.gold).toBe(50010);
    expect(s.stats.renown).toBe(50);
    expect(evalBool("quest_done('dragon') and quests_done() == 1", makeEnv(r, s), false)).toBe(true);
  });

  test("giving up counts as failing, and a repeatable job comes back on the board", () => {
    const { r } = rules({ actions: { muck: { label: "Muck out", effects: { progress: { chores: 1 } } }, wait: { label: "Wait a day", time: 1440, effects: {} } } });
    let { s } = act(r, at(r, "square"), "quest:take:chores");
    s = act(r, s, "muck").s;
    expect(s.quests.chores.st).toBe("ready");
    s = act(r, s, "quest:report:chores").s;
    expect(s.stats.gold).toBe(12);
    expect(choices(r, s).some((c) => c.id === "quest:take:chores")).toBe(false);
    s = act(r, s, "wait").s;
    s = act(r, s, "wait", "b").s;
    expect(choices(r, s).some((c) => c.id === "quest:take:chores")).toBe(true);
    s = act(r, s, "quest:take:chores").s;
    s = act(r, s, "quest:drop:chores").s;
    expect(s.quests.chores.st).toBe("failed");
  });
});

describe("favours the story hands out", () => {
  test("a request in the prose becomes a quest; the story's word finishes it and the giver warms to {{user}}", () => {
    const { r } = rules();
    const s = at(r, "home");
    const ev = applyProposal(r, s, { quests: { new: [{ name: "Fix the leaky tap", giver: "Mia", goal: "Fix the kitchen tap before her parents visit", hours: 30 }] } });
    const a = cloneState(s);
    ev.forEach((e) => applyEvent(a, e, r));
    const id = Object.keys(a.quests)[0];
    expect(id).toBe("story_fix_the_leaky_tap");
    expect(a.quests[id].due).toBe(a.minutes + 30 * 60);
    expect(buildHud(r, a).quests.find((q) => q.id === id)!.story).toBe(true);
    // Told twice, it's still one quest.
    expect(applyProposal(r, a, { quests: { new: [{ name: "Fix the leaky tap", goal: "again" }] } }).filter((e) => e.t === "quest")).toEqual([]);
    const done = cloneState(a);
    applyProposal(r, a, { quests: { done: [id] }, memories: { Mia: "{{user}} fixed the tap without being asked twice." } }).forEach((e) => applyEvent(done, e, r));
    expect(done.quests[id].st).toBe("done");
    expect(done.rel.mia.trust).toBe(25);
    expect(done.memories.mia.map((m) => m.text)).toEqual(['{{user}} came through on "Fix the leaky tap".', "{{user}} fixed the tap without being asked twice."]);
  });

  test("story quests are capped and can be switched off", () => {
    const { r } = rules({ quests: { from_story: false } });
    const ev = applyProposal(r, at(r, "home"), { quests: { new: [{ name: "Anything", goal: "Do it" }] } });
    expect(ev.some((e) => e.t === "quest")).toBe(false);
  });

  test("the new keys lint clean", () => {
    expect(lintRuleset(rules().r)).toEqual([]);
  });
});
