// The typed questions as pure functions (JEV-ROUTING §7): the quoted-dialogue rule, the safe-default order,
// the Jev limits, the roll rule, and how answers become the engine's Proposal and the helper's text tasks.

import { describe, expect, test } from "bun:test";
import type { Answers, Questions } from "../engine/decide.js";
import { loadRuleset } from "../engine/loader.js";
import { applyEvent, cloneState, initialState, type GameState } from "../engine/state.js";
import type { Ruleset } from "../engine/ruleset.js";
import {
  applyTexts, bookkeepingFromAnswers, bookkeepingQuestions, choiceDifficulty, choiceQuestions, clockTimes, contestReadQuestions,
  contestReadVerdict, decideQuestions, difficultyOf, greetingFromAnswers, greetingQuestions, moneyAmounts, nameCandidates,
  needsRead, newNames, oddsFromAnswers, readQuestions, readVerdict, splitTyped, stepDelta, taskKey, textChecks, THRESHOLDS, TIME_MINUTES,
} from "./questions.js";
import { rankKinds } from "./live.js";
import { ADVENTURE_YAML, defaultAnswer, pick, STORY_YAML } from "./test-host.js";

const load = (yaml: string): Ruleset => loadRuleset([{ label: "t", content: yaml, order: 0 }]).ruleset!;
const adv = load(ADVENTURE_YAML);
const story = load(STORY_YAML);
const T = THRESHOLDS.jev;

/** A state with Mira here (and a held item). */
function withMira(r: Ruleset, extra: (s: GameState) => void = () => {}): GameState {
  const s = cloneState(initialState(r));
  applyEvent(s, { t: "scene", who: "mira", here: true, src: "start" }, r);
  extra(s);
  return s;
}
const answer = (q: Questions, over: Record<string, (q: Questions[string]) => Answers[string]>): Answers =>
  Object.fromEntries(Object.entries(q).map(([id, x]) => [id, over[id] ? over[id](x) : defaultAnswer(x)]));

describe("quoted dialogue never reaches a model as an action", () => {
  test("splitTyped removes quotes in every style and out-of-character parts; apostrophes and *actions* stay", () => {
    expect(splitTyped('"Hello," I say.')).toEqual({ action: "I say.", said: ["Hello,"] });
    expect(splitTyped("“Hi” „Hallo“ «Salut» 「やあ」 『よ』").said).toEqual(["Hi", "Hallo", "Salut", "やあ", "よ"]);
    expect(splitTyped("“Hi” „Hallo“ «Salut» 「やあ」 『よ』").action).toBe("");
    expect(splitTyped("*I don't move.* I'm waiting.").action).toBe("*I don't move.* I'm waiting.");
    expect(splitTyped("I nod. ((OOC: brb)) [OOC: sorry] \"Fine.\"")).toEqual({ action: "I nod.", said: ["Fine."] });
    expect(splitTyped('"Wait, I never said').said).toEqual(["Wait, I never said"]);
  });

  const DIALOGUE = [
    '"Hello there."', '"How long have you run this place?" I ask.', '*smiles* "Hi, Mira."', '"I missed you," I whisper softly.',
    '“Do you trust me?”', '"Okay." I nod.', '"Fine," Sam says.', '"Really?" she asks quietly.', '"Let\'s go," I reply.',
    '"Two ales, please."', '«Merci.»', '"No way," I laugh.', '"I could kill for a drink," I mutter.', '"Can you pick a lock?" I ask her.',
    '((OOC: be gentle)) "Hi."', '"Sure," I answer, smiling.', '"We should run," I say.', '"Stab him!" I shout.', '"Thanks."', '"Sorry," I add.',
  ];
  test("T-C2: 20 dialogue lines → no read for either provider", () => {
    for (const line of DIALOGUE) {
      expect({ line, jev: needsRead(adv, splitTyped(line), "jev"), llm: needsRead(adv, splitTyped(line), "llm") }).toEqual({ line, jev: false, llm: false });
    }
  });

  test("a story never reads typed text; the helper skips everyday and short messages, Jev does not", () => {
    expect(needsRead(story, splitTyped("I try to climb the wall before the guard sees me."), "jev")).toBe(false);
    expect(needsRead(adv, splitTyped("I sit down, sigh and wait."), "llm")).toBe(false);
    expect(needsRead(adv, splitTyped("I sit down, sigh and wait."), "jev")).toBe(true);
    expect(needsRead(adv, splitTyped("*I nod and smile at her.*"), "jev")).toBe(false);
    expect(needsRead(adv, splitTyped("I punch him."), "llm")).toBe(true);
    expect(needsRead(adv, splitTyped("I try to slip past the guard into the vault."), "llm")).toBe(true);
  });
});

describe("question limits and safe defaults", () => {
  const s = withMira(adv, (x) => { x.items.rope = 1; });
  const reply = "Mira glances at the door as a stranger named Captain Rhea Vos walks in. You hand over 20 gold and your rope.";
  const batches: Questions[] = [
    readQuestions({ r: adv, s, split: splitTyped("I try to vault the bar."), scene: reply, player: "Sam", lines: [] }).questions,
    bookkeepingQuestions({ r: adv, s, playerText: "I pay.", reply, player: "Sam", applied: null, tags: Object.values(adv.liveChoices.tags) }).questions,
    greetingQuestions(adv, initialState(adv), { greeting: reply, persona: "", card: "", player: "Sam" }).questions,
    contestReadQuestions(adv, s, { split: splitTyped("I swing."), text: "I swing.", scene: reply, player: "Sam" }).questions,
  ];
  const SAFE = new Set(["none", "same", "ongoing", "stay", "unclear", "unknown", "other"]);
  test("first option of every choice is the safe default; 2..255 options; 2..10 levels; under 100K chars", () => {
    for (const q of batches) {
      for (const [id, x] of Object.entries(q)) {
        if (x.type === "choice") {
          const keys = Object.keys(x.criteria);
          expect({ id, n: keys.length >= 2 && keys.length <= 255 }).toEqual({ id, n: true });
          if (!["approach", "kinds", "train"].includes(id) && !id.startsWith("decide:")) expect({ id, first: SAFE.has(keys[0]) }).toEqual({ id, first: true });
        }
        if (x.type === "score") expect(x.criteria.length >= 2 && x.criteria.length <= 10).toBe(true);
      }
      expect(JSON.stringify(q).length).toBeLessThan(100_000);
    }
  });

  test("stat steps put `same` first and no question hides two judgments (risky and contested are separate)", () => {
    const q = bookkeepingQuestions({ r: adv, s, playerText: "", reply, player: "Sam", applied: null }).questions;
    expect(Object.keys((q["stat:health"] as any).criteria)[0]).toBe("same");
    const rq = readQuestions({ r: adv, s, split: splitTyped("I try to vault the bar."), scene: "", player: "Sam", lines: [] }).questions;
    expect(rq.risky.type).toBe("noul");
    expect(rq.contested.type).toBe("noul");
  });
});

describe("no numbers from Jev", () => {
  test("difficultyOf rounds, never interpolates", () => {
    expect(difficultyOf({ type: "score", score: 2.6, confidence: 1, probabilities: {} })).toBe("extreme");
    expect(difficultyOf({ type: "score", score: 1.4, confidence: 1, probabilities: {} })).toBe("fair");
    expect(difficultyOf(undefined)).toBeNull();
  });
  test("time: score 2.6 → the rounded level's minutes (60), not an interpolated 48", () => {
    const s = withMira(adv);
    const A = bookkeepingQuestions({ r: adv, s, playerText: "", reply: "Time passes.", player: "Sam", applied: null });
    const out = bookkeepingFromAnswers(adv, s, { time: { type: "score", score: 2.6, confidence: 0.9, probabilities: {} } }, A.meta, T);
    expect(out.proposal.minutes).toBe(TIME_MINUTES[3]);
  });
  test("steps are half the per-reply cap (min 1); a lot is the whole cap", () => {
    expect(stepDelta("up", 4)).toBe(2);
    expect(stepDelta("down", 5)).toBe(-3);
    expect(stepDelta("up", 1)).toBe(1);
    expect(stepDelta("up_lot", 20)).toBe(20);
    expect(stepDelta("same", 20)).toBe(0);
  });
  test("money amounts are picked from the reply's numbers, never read by Jev", () => {
    expect(moneyAmounts("You pay $20 and get twenty coins back, plus 5 gold.", "$")).toEqual([20, 5]);
    const r = load(ADVENTURE_YAML.replace("  charm:", "  coin: { kind: money, narrator: 100 }\n  charm:"));
    expect(r.hud.money).toBe("coin");
    const s = withMira(r);
    const A = bookkeepingQuestions({ r, s, playerText: "", reply: "You slide $20 across the bar.", player: "Sam", applied: null });
    expect(Object.keys(A.questions)).not.toContain("stat:coin");
    const out = bookkeepingFromAnswers(r, s, answer(A.questions, { money: (q) => pick(q, "paid"), money_amt: (q) => pick(q, "a0") }), A.meta, T);
    expect(out.proposal.stats).toEqual({ coin: -20 });
  });
});

describe("R: the roll rule", () => {
  const s = withMira(adv);
  const rq = readQuestions({ r: adv, s, split: splitTyped("I try to vault the bar."), scene: "A bar.", player: "Sam", lines: [] });
  const verdict = (over: Record<string, (q: Questions[string]) => Answers[string]>) => readVerdict(adv, s, answer(rq.questions, over), rq.meta, T);
  test("attempt + risky but not contested → no roll; contested → a roll at the read difficulty on the read ability", () => {
    const base = { action: (q: Questions[string]) => pick(q, "attempt", 0.9), risky: () => ({ type: "noul" as const, noul: 0.9 }), difficulty: () => ({ type: "score" as const, score: 2, confidence: 0.8, probabilities: {} }), approach: (q: Questions[string]) => pick(q, "mind") };
    expect(verdict({ ...base, contested: () => ({ type: "noul", noul: 0.2 }) }).intent).toBeNull();
    expect(verdict({ ...base, contested: () => ({ type: "noul", noul: 0.8 }) }).intent).toEqual({ actionId: "try:mind", via: "adjudicator", params: { difficulty: "hard" } });
  });
  test("unsure (below 0.75) or none → roleplay; no 40–75 % band", () => {
    expect(verdict({ action: (q) => pick(q, "attempt", 0.6), risky: () => ({ type: "noul", noul: 0.9 }), contested: () => ({ type: "noul", noul: 0.9 }) }).intent).toBeNull();
    expect(verdict({}).intent).toBeNull();
  });
  test("a contest that starts in the typed message: kind, the opponent here, and the threat", () => {
    const v = verdict({ contest: (q) => pick(q, "fight", 0.8), opponent: (q) => pick(q, "p:mira", 0.9), threat: () => ({ type: "score", score: 3, confidence: 0.8, probabilities: {} }) });
    expect(v.contest).toEqual({ kind: "fight", opponent: "Mira", threat: "extreme" });
  });
  test("in a contest (Jev): the approach, or Break off / Give in", () => {
    const sc = cloneState(s);
    applyEvent(sc, { t: "contest", kind: "fight", opponent: "the bouncer", threat: "fair", dc: 12, src: "narrator" }, adv);
    const q = contestReadQuestions(adv, sc, { split: splitTyped("I run."), text: "I run.", scene: "", player: "Sam" }).questions;
    expect(contestReadVerdict(adv, sc, answer(q, { exit: (x) => pick(x, "break_off", 0.8) }), T).intent?.actionId).toBe("contest:break_off");
    expect(contestReadVerdict(adv, sc, answer(q, { approach: (x) => pick(x, "mind", 0.8) }), T).intent?.actionId).toBe("contest:mind");
  });
  test("D: decide odds are asked as choices and normalised", () => {
    const spec = { id: "x", ask: "Does {{user}} get in?", options: [{ id: "yes", desc: "Yes", weight: 1, effect: {} as never }, { id: "no", desc: "No", weight: 1, effect: {} as never }] };
    const q = decideQuestions([spec], "Sam");
    expect((q["decide:x"] as any).instructions).toBe("Does Sam get in?");
    expect(oddsFromAnswers([spec], { "decide:x": { type: "choice", choice: "yes", confidence: 0.8, probabilities: { yes: 0.8, no: 0.4 } } }).x.yes).toBeCloseTo(2 / 3);
  });
});

describe("A: bookkeeping answers", () => {
  const s = withMira(adv, (x) => { x.calibrated.mira = true; });
  const reply = "Mira pulls you out of the water and wraps you in her coat. Her apron is soaked through.";
  const A = bookkeepingQuestions({ r: adv, s, playerText: "", reply, player: "Sam", applied: null });
  test("a big moment (≥ 0.7) is proposed and asks for a memory line; 0.5 is not", () => {
    const yes = bookkeepingFromAnswers(adv, s, answer(A.questions, { "moment:mira": () => ({ type: "noul", noul: 0.9 }) }), A.meta, T);
    expect(yes.proposal.moments).toEqual(["Mira"]);
    expect(yes.tasks.map(taskKey)).toContain("memory:mira");
    const no = bookkeepingFromAnswers(adv, s, answer(A.questions, { "moment:mira": () => ({ type: "noul", noul: 0.5 }) }), A.meta, T);
    expect(no.proposal.moments).toBeUndefined();
  });
  test("outfit:mira 0.8 → a text task with the old line; 0.5 → none", () => {
    const yes = bookkeepingFromAnswers(adv, s, answer(A.questions, { "outfit:mira": () => ({ type: "noul", noul: 0.8 }) }), A.meta, T);
    expect(yes.tasks).toContainEqual({ kind: "outfit", who: "mira", name: "Mira", old: "" });
    const no = bookkeepingFromAnswers(adv, s, answer(A.questions, { "outfit:mira": () => ({ type: "noul", noul: 0.5 }) }), A.meta, T);
    expect(no.tasks.filter((t) => t.kind === "outfit")).toEqual([]);
  });
  test("when_scene answers go to sceneRead (for the next turn), not into this proposal", () => {
    const r = load(ADVENTURE_YAML + "\ntriggers:\n  danger: { when_scene: \"{{user}} is in danger\", do: { energy: -5 } }\n");
    const q = bookkeepingQuestions({ r, s: withMira(r), playerText: "", reply, player: "Sam", applied: null });
    expect((q.questions["scene:danger"] as any).instructions).toBe("Sam is in danger");
    const out = bookkeepingFromAnswers(r, withMira(r), answer(q.questions, { "scene:danger": () => ({ type: "noul", noul: 0.9 }) }), q.meta, T);
    expect(out.sceneRead).toEqual({ danger: true });
    expect(out.proposal.stats).toBeUndefined();
  });
  test("in a contest: no question can end it, and none starts another", () => {
    const sc = cloneState(s);
    applyEvent(sc, { t: "contest", kind: "fight", opponent: "the bouncer", threat: "fair", dc: 12, src: "narrator" }, adv);
    const q = bookkeepingQuestions({ r: adv, s: sc, playerText: "", reply: "He staggers back.", player: "Sam", applied: null }).questions;
    expect(Object.keys(q).some((k) => /contest|encounter|end/.test(k))).toBe(false);
  });
  test("a contest the prose starts: kind, opponent, threat; an unnamed opponent asks the writer for a label", () => {
    const out = bookkeepingFromAnswers(adv, s, answer(A.questions, { contest: (q) => pick(q, "fight", 0.8), threat: () => ({ type: "score", score: 2, confidence: 0.8, probabilities: {} }) }), A.meta, T);
    expect(out.proposal.contest).toEqual({ kind: "fight", opponent: "the opponent", threat: "hard" });
    expect(out.tasks.map(taskKey)).toContain("foe");
  });
  test("new people are picked from the reply's names with first feelings, presence and a first-look task", () => {
    const r2 = "A woman in a long coat sits down. \"Name's Rhea,\" she says. Rhea smiles.";
    const q = bookkeepingQuestions({ r: adv, s, playerText: "", reply: r2, player: "Sam", applied: null });
    const i = q.meta.cands.indexOf("Rhea");
    const out = bookkeepingFromAnswers(adv, s, answer(q.questions, {
      [`newp:${i}`]: () => ({ type: "noul", noul: 0.95 }), [`newhere:${i}`]: () => ({ type: "noul", noul: 0.9 }),
      [`newfeel:${i}:trust`]: () => ({ type: "score", score: 2, confidence: 0.8, probabilities: {} }),
    }), q.meta, T);
    expect(out.proposal.people?.map((p) => p.name)).toEqual(["Rhea"]);
    expect(out.proposal.people?.[0].feelings?.trust).toBeGreaterThan(40);
    expect(out.proposal.scene).toMatchObject({ Rhea: true });
    expect(out.tasks.map(taskKey)).toContain("first:Rhea");
  });
  test("goals: where open ones stand, and a new one asks the writer for a title", () => {
    const sg = cloneState(s);
    applyEvent(sg, { t: "goal", id: "story_1", st: "open", text: "Get Jonas out of jail", src: "narrator" }, adv);
    const q = bookkeepingQuestions({ r: adv, s: sg, playerText: "", reply: "The guard unlocks the cell.", player: "Sam", applied: null });
    const out = bookkeepingFromAnswers(adv, sg, answer(q.questions, { "goal:story_1": (x) => pick(x, "done", 0.8), "gate:goal": () => ({ type: "noul", noul: 0.9 }) }), q.meta, T);
    expect(out.proposal.goals?.done).toEqual(["story_1"]);
    expect(out.tasks.map(taskKey)).toContain("goal:new");
  });
  test("the writer's texts land only where a task asked for them, bounded", () => {
    const tasks = [{ kind: "outfit" as const, who: "mira", name: "Mira", old: "" }, { kind: "memory" as const, who: "mira", name: "Mira" }, { kind: "goal" as const }, { kind: "place" as const }];
    const p = applyTexts(adv, s, {}, tasks, { "outfit:mira": "a soaked green apron", "memory:mira": "Sam jumped in after me.", "goal:new": { title: "Find the boat", done: "The boat is found" }, place: "The quay", "looks:you": "not asked" }, new Set());
    expect(p.looks).toEqual({ Mira: { outfit: "a soaked green apron" } });
    expect(p.memories).toEqual({ Mira: "Sam jumped in after me." });
    expect(p.goals?.new).toEqual([{ text: "Find the boat", done: "The boat is found" }]);
    expect(p.place).toBe("The quay");
    expect(applyTexts(adv, s, {}, tasks, { "outfit:mira": "x" }, new Set(["outfit:mira"])).looks).toBeUndefined();
  });
  test("Jev's kinds ranking is damped by recent use: one tag never wins three turns running in a 20-turn script", () => {
    const recent: Record<string, number> = {};
    const picks: string[] = [];
    for (let turn = 0; turn < 20; turn++) {
      const [top] = rankKinds({ kind: 0.45, bold: 0.3, clever: 0.25 }, recent, 1);
      picks.push(top);
      for (const k of Object.keys(recent)) recent[k] = Math.max(0, recent[k] - 0.5);
      recent[top] = (recent[top] ?? 0) + 1;
    }
    for (let i = 2; i < picks.length; i++) expect(picks[i] === picks[i - 1] && picks[i] === picks[i - 2]).toBe(false);
  });
});

describe("B: after the writer (Jev)", () => {
  const s = withMira(adv);
  const choices = [{ label: "Vault the bar", tag: "bold", difficulty: "fair" as const }, { label: "Thank Mira", tag: "kind", target: "mira", difficulty: "none" as const }];
  test("only choices whose words decide the target are rated; Jev's level replaces the writer's word", () => {
    const B = choiceQuestions(adv, s, choices, { "outfit:mira": "a wet apron" }, "reply", "Sam");
    expect(Object.keys(B.questions).sort()).toEqual(["diff:0", "ok:outfit:mira"]);
    const rated = choiceDifficulty(adv, choices, { "diff:0": { type: "score", score: 2.6, confidence: 0.9, probabilities: {} } });
    expect(rated.map((c) => c.difficulty)).toEqual(["extreme", "none"]);
    expect([...textChecks({ "ok:outfit:mira": { type: "noul", noul: 0.2 } })]).toEqual(["outfit:mira"]);
  });
});

describe("G: the greeting (Jev)", () => {
  test("clock times are picked, not read; the phase is the fallback; names are picked for who is here", () => {
    expect(clockTimes("At 9:30 pm the bar is full; it opened at 21:00 and closes at 2am.").map((c) => [c.hour, c.minute])).toEqual([[21, 30], [21, 0], [2, 0]]);
    const s = initialState(adv);
    const g = greetingQuestions(adv, s, { greeting: "It is 9:30 pm. Captain Rhea Vos waits at the Rusty Anchor with Mira.", persona: "", card: "", player: "Sam" });
    const rhea = g.meta.cands.indexOf("Captain Rhea Vos");
    const anchor = g.meta.cands.indexOf("Rusty Anchor");
    const out = greetingFromAnswers(adv, s, answer(g.questions, {
      start_clock: (q) => pick(q, "t0"), "here:mira": () => ({ type: "noul", noul: 0.9 }), [`newp:${rhea}`]: () => ({ type: "noul", noul: 0.9 }),
      place: (q) => pick(q, `cand:${anchor}`),
    }), g.meta, T);
    expect(out.read.time).toEqual({ hour: 21, minute: 30, weekday: null });
    expect(out.read.present).toEqual(["Mira", "Captain Rhea Vos"]);
    expect(out.read.place).toBe("Rusty Anchor");
    expect(out.needPlace).toBe(false);
  });
});

describe("names", () => {
  test("candidates are runs of capitalised words the game doesn't know, most frequent first", () => {
    const c = nameCandidates("Captain Rhea Vos stepped in. Then Rhea laughed. \"Welcome to the Rusty Anchor,\" she said to Sam. Later, Miu waved.", ["Sam", "Miu"]);
    expect(c).toContain("Captain Rhea Vos");
    expect(c).toContain("Rusty Anchor");
    expect(c).not.toContain("Miu");
    expect(newNames("The door opens. Miu looks up as Jonah walks in.", ["Miu"])).toEqual(["Jonah"]);
  });
});
