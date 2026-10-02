import { describe, expect, test } from "bun:test";
import { loadRuleset } from "../loader.js";
import { foldEvents, initialState, makeEnv, type GameState } from "../state.js";
import { resolveTurnFull, type Intent } from "../resolve.js";
import { evaluate } from "../expr.js";
import { buildChoices, stateDigest } from "../view.js";
import { activeSession, dateMoves, romanceOk } from "./talk.js";
import { stageIndex } from "./stage.js";
import { recentCount, SOCIAL_KEYS_KEPT } from "./memory.js";
import type { Ruleset } from "../ruleset.js";

const YAML = `
name: Date test
clock: { start: "Mon 10:00" }
stats: { cash: { kind: money, start: 100 } }
hud: { money: cash }
locations:
  cafe: { name: The Café, exits: [street] }
  street: { name: The Street, exits: [cafe] }
start: { location: cafe }
relationships:
  people:
    robin: { name: Robin, age: 25 }
    kid: { name: Kid, age: 15 }
    sam: { name: Sam }
dating:
  people:
    robin: { loves: [music, tag:nature], hates: [gossip], likes: [food] }
`;

function load(extra = ""): Ruleset {
  const out = loadRuleset([{ label: "t", content: YAML + extra, order: 0 }]);
  if (!out.ruleset) throw new Error(JSON.stringify(out.issues));
  return out.ruleset;
}

function turn(r: Ruleset, s: GameState, actionId: string | null, seed = "s1", odds?: Record<string, Record<string, number>>) {
  const intent: Intent | null = actionId ? { actionId, via: "choice" } : null;
  const res = resolveTurnFull(r, s, intent, { seed, odds });
  return { s: foldEvents(r, [res.record.events], s), rec: res.record, needs: res.needs };
}

const adult = { adult: 0.95, minor: 0.02, unclear: 0.03 };

describe("date mode", () => {
  test("dating: adds love and fear, and `Talk with` choices for people around", () => {
    const r = load();
    expect(r.dating.enabled).toBe(true);
    expect(r.relStats.love).toBeDefined();
    expect(r.relStats.fear).toBeDefined();
    const choices = buildChoices(r, initialState(r), { lines: [], veils: [] });
    expect(choices.filter((c) => c.id.startsWith("date:talk@")).map((c) => c.label)).toContain("Talk with Robin");
  });

  test("starting a conversation learns tastes (asking the model) and takes over the choices", () => {
    const r = load();
    const first = turn(r, initialState(r), "date:talk@sam");
    expect(first.needs.some((n) => n.id === "date:adult:sam")).toBe(true);
    expect(first.needs.some((n) => n.id.startsWith("date:pref:sam:"))).toBe(true);
    // Robin's age is declared and some tastes authored: those aren't asked.
    const robin = turn(r, initialState(r), "date:talk@robin");
    const asked = robin.needs.map((n) => n.id);
    expect(asked).not.toContain("date:adult:robin");
    expect(asked).not.toContain("date:pref:robin:music");
    expect(asked).toContain("date:pref:robin:travel");
    const s = robin.s;
    expect(activeSession(r, s)?.who).toBe("robin");
    const choices = buildChoices(r, s, { lines: [], veils: [] });
    expect(choices.some((c) => c.id.startsWith("date:topic:"))).toBe(true);
    expect(choices.find((c) => c.id === "date:open")).toBeDefined();
    expect(choices.filter((c) => c.id.startsWith("date:topic:")).length).toBeLessThanOrEqual(6);
    expect(stateDigest(r, s)).toContain("IN CONVERSATION with Robin");
  });

  test("tastes decide reactions: a loved topic warms them, a hated one sours them", () => {
    const r = load();
    let s = turn(r, initialState(r), "date:talk@robin").s;
    s = foldEvents(r, [[{ t: "rel", who: "robin", stat: "love", set: 30, src: "manual" }]], s);
    const love0 = s.rel.robin.love;
    let loved = 0, hated = 0;
    for (let i = 0; i < 20; i++) {
      const a = turn(r, s, "date:topic:music", `m${i}`);
      const b = turn(r, s, "date:topic:gossip", `g${i}`);
      if (a.s.rel.robin.love > love0) loved++;
      if (b.s.rel.robin.love < love0) hated++;
    }
    expect(loved).toBeGreaterThanOrEqual(15);
    expect(hated).toBeGreaterThanOrEqual(15);
    const after = turn(r, s, "date:topic:music").s;
    expect(after.dating.known.robin.music).toBeDefined();
    expect(after.date!.used.music).toBe(1);
    // Once seen, the topic shows odds; untried ones don't reveal them.
    const moves = dateMoves(r, after);
    expect(moves.find((m) => m.id === "date:topic:music")!.odds).not.toBeNull();
    expect(moves.find((m) => m.id === "date:topic:travel")!.odds).toBeNull();
    s = after;
  });

  test("romance is only for known adults: minors and unknown ages get friendship", () => {
    const r = load();
    const s0 = initialState(r);
    expect(romanceOk(r, s0, "robin")).toBe(true);
    expect(romanceOk(r, s0, "kid")).toBe(false);
    expect(romanceOk(r, s0, "sam")).toBe(false);
    // Kid is never offered a romantic topic, however close they get.
    let k = turn(r, s0, "date:talk@kid").s;
    k = foldEvents(r, [[{ t: "rel", who: "kid", stat: "love", set: 95, src: "manual" }]], k);
    const kidMoves = dateMoves(r, k);
    expect(kidMoves.some((m) => m.romantic)).toBe(false);
    expect(kidMoves.some((m) => m.id === "date:confess" || m.id === "date:kiss")).toBe(false);
    expect(turn(r, k, "date:topic:flirt").rec.action).toBeUndefined();
    // Sam becomes eligible once the model is sure Sam is an adult.
    const sam = turn(r, s0, "date:talk@sam", "x", { "date:adult:sam": adult }).s;
    expect(romanceOk(r, sam, "sam")).toBe(true);
    const unsure = turn(r, s0, "date:talk@sam", "x", { "date:adult:sam": { adult: 0.6, minor: 0.2, unclear: 0.2 } }).s;
    expect(romanceOk(r, unsure, "sam")).toBe(false);
  });

  test("typed lines: the model reads topic, leaving and how the words land", () => {
    const r = load();
    const s = turn(r, initialState(r), "date:talk@robin").s;
    const plain = turn(r, s, null);
    expect(plain.needs.map((n) => n.id)).toEqual(expect.arrayContaining(["date:topic", "date:leave", "date:reception"]));
    const kind = turn(r, s, null, "t", { "date:topic": { none: 1 }, "date:leave": { stay: 1, leave: 0 }, "date:reception": { love: 1, like: 0, neutral: 0, dislike: 0, hate: 0 } });
    expect(kind.s.rel.robin.love).toBeGreaterThan(s.rel.robin.love);
    expect(kind.rec.decisions?.[0]?.source).toBe("model");
    const bye = turn(r, s, null, "t", { "date:topic": { none: 1 }, "date:leave": { stay: 0.1, leave: 0.9 }, "date:reception": { neutral: 1 } });
    expect(bye.s.date).toBeNull();
  });

  test("walking away ends the conversation; too much talk tires them out", () => {
    const r = load();
    let s = turn(r, initialState(r), "date:talk@robin").s;
    const walked = foldEvents(r, [[{ t: "move", to: "street", src: "action" }]], s);
    expect(activeSession(r, walked)).toBeNull();
    expect(turn(r, walked, "go:cafe").s.date).toBeNull();
    for (let i = 0; i < 12 && s.date; i++) s = turn(r, s, "date:topic:weather", `w${i}`).s;
    expect(s.date).toBeNull();
  });

  test("asking out, an outing and its ending", () => {
    const r = load();
    let s = turn(r, initialState(r), "date:talk@robin").s;
    s = foldEvents(r, [[{ t: "rel", who: "robin", stat: "love", set: 60, src: "manual" }]], s);
    expect(stageIndex(r, s, "robin")).toBe(3);
    const asked = turn(r, s, "date:ask_out", "a", { "date:ask_out": { yes: 1, later: 0, no: 0 } });
    expect(asked.s.date?.kind).toBe("plan");
    s = asked.s;
    const venues = dateMoves(r, s).filter((m) => m.kind === "venue");
    expect(venues.length).toBeGreaterThan(3);
    s = turn(r, s, "date:venue:park").s;
    expect(s.date?.kind).toBe("outing");
    expect(s.stats.cash).toBe(100); // the park is free
    let guard = 0;
    while (s.date && !s.date.closing && guard++ < 10) {
      const act = dateMoves(r, s).find((m) => m.kind === "activity")!;
      s = turn(r, s, act.id, `o${guard}`).s;
    }
    expect(s.date?.closing).toBe(true);
    expect(s.dating.dates.robin?.count).toBe(1);
    const closing = dateMoves(r, s);
    expect(closing.some((m) => m.id === "date:kiss")).toBe(true);
    const kissed = turn(r, s, "date:kiss", "k", { "date:kiss": { welcome: 1, hesitant: 0, refuse: 0 } });
    expect(kissed.s.date).toBeNull();
    expect(evaluate("dates('robin')", makeEnv(r, kissed.s))).toBe(1);
  });

  test("a confession that's returned makes them partners", () => {
    const r = load();
    let s = turn(r, initialState(r), "date:talk@robin").s;
    s = foldEvents(r, [[{ t: "rel", who: "robin", stat: "love", set: 70, src: "manual" }]], s);
    expect(dateMoves(r, s).some((m) => m.id === "date:confess")).toBe(true);
    s = turn(r, s, "date:confess", "c", { "date:confess": { returns: 1, unsure: 0, rejects: 0 } }).s;
    expect(s.dating.partners.robin).toBe(true);
    expect(stageIndex(r, s, "robin")).toBe(4);
    expect(evaluate("partner('robin') and stage('robin') == 4", makeEnv(r, s))).toBe(true);
  });

  test("fear turns someone hostile; only an apology opens things up again", () => {
    const r = load();
    let s = turn(r, initialState(r), "date:talk@robin").s;
    s = foldEvents(r, [[{ t: "rel", who: "robin", stat: "fear", set: 70, src: "manual" }]], s);
    expect(stageIndex(r, s, "robin")).toBe(-1);
    const moves = dateMoves(r, s);
    expect(moves.some((m) => m.id === "date:apologize")).toBe(true);
    expect(moves.some((m) => m.id === "date:topic:family")).toBe(false);
    s = turn(r, s, "date:apologize").s;
    s = turn(r, s, "date:apologize", "b").s;
    expect(s.rel.robin.fear).toBeLessThan(70);
  });

  test("Lines & Veils: a line removes romance, a veil narrates it off-screen", () => {
    const r = load();
    let s = turn(r, initialState(r), "date:talk@robin").s;
    s = foldEvents(r, [[{ t: "rel", who: "robin", stat: "love", set: 70, src: "manual" }]], s);
    expect(dateMoves(r, s, ["romance"]).some((m) => m.romantic)).toBe(false);
    const veiled = resolveTurnFull(r, s, { actionId: "date:confess", via: "choice" }, { seed: "v", veils: ["romance"], odds: { "date:confess": { returns: 1 } } });
    expect(veiled.record.veiled).toBe(true);
  });
});


const lovedWords = (topic = "none") => ({
  "date:topic": { [topic]: 1 }, "date:leave": { stay: 1 },
  "date:reception": { love: 1, like: 0, neutral: 0, dislike: 0, hate: 0 },
});

describe("persistent social repetition", () => {
  test("reopening cannot reset typed-topic or generic-chat affection rewards", () => {
    const r = load();
    for (const topic of ["none", "music"]) {
      let s = turn(r, initialState(r), "date:talk@robin").s;
      const first = turn(r, s, null, "warm", lovedWords(topic));
      const gain = first.s.rel.robin.love - s.rel.robin.love;
      expect(gain).toBeGreaterThan(0);
      s = turn(r, first.s, "date:goodbye").s;
      s = turn(r, s, "date:talk@robin").s;
      const second = turn(r, s, null, "warm", lovedWords(topic));
      expect(second.s.rel.robin.love - s.rel.robin.love).toBeLessThan(gain / 2);
      expect(recentCount(second.s, "robin", topic === "none" ? "chat" : topic)).toBeGreaterThan(1);
    }
  });

  test("empty warm hello/goodbye loops earn nothing", () => {
    const r = load();
    let s = initialState(r);
    s.rel.robin.love = 40;
    for (let i = 0; i < 5; i++) {
      s = turn(r, s, "date:talk@robin").s;
      s = turn(r, s, "date:goodbye").s;
    }
    expect(s.rel.robin.love).toBe(40);
  });

  test("elapsed game time restores rewards and fatigue, not wall-clock or reopen", () => {
    const r = load();
    let s = turn(r, initialState(r), "date:talk@robin").s;
    s = turn(r, s, null, "warm", lovedWords("music")).s;
    s = foldEvents(r, [[{ t: "dt_recent", who: "robin", key: "music", at: s.minutes, count: 1, fatigue: 70, src: "action" }]], s);
    const quick = turn(r, s, "date:talk@robin").s;
    expect(quick.date!.fatigue).toBe(70);
    const rested = foldEvents(r, [[{ t: "time", min: 240, src: "action" }]], s);
    const reopened = turn(r, rested, "date:talk@robin").s;
    expect(reopened.date!.fatigue).toBe(0);
    expect(recentCount(reopened, "robin", "music")).toBe(0);
    const next = turn(r, reopened, null, "warm", lovedWords("music"));
    expect(next.s.rel.robin.love - reopened.rel.robin.love).toBe(6);
  });

  test("novel topics maintain warm flow and authored weight remains meaningful", () => {
    const r = load();
    let s = turn(r, initialState(r), "date:talk@robin").s;
    s.rel.robin.love = 35;
    const music = turn(r, s, null, "warm", lovedWords("music")).s;
    expect(music.date!.fatigue).toBe(2);
    const dreams = turn(r, music, null, "warm", lovedWords("dreams")).s;
    expect(dreams.rel.robin.love - music.rel.robin.love).toBeGreaterThanOrEqual(6);
    expect(dreams.date!.fatigue).toBe(4);
    const worries = turn(r, dreams, null, "warm", lovedWords("worries")).s;
    expect(worries.rel.robin.love - dreams.rel.robin.love).toBeGreaterThan(8);
    expect(worries.date!.fatigue).toBe(6);
    expect(worries.date).not.toBeNull();
  });

  test("new shared activities are not penalized by conversation history", () => {
    const r = load();
    let s = turn(r, initialState(r), "date:talk@robin").s;
    s.rel.robin.love = 40;
    s = turn(r, s, "date:ask_out", "yes", { "date:ask_out": { yes: 1 } }).s;
    s = turn(r, s, "date:venue:park").s;
    const baseline = structuredClone(s);
    s = foldEvents(r, [[{ t: "dt_recent", who: "robin", key: "chat", at: s.minutes, count: 20, fatigue: 0, src: "action" }]], s);
    const id = dateMoves(r, s).find((m) => m.kind === "activity")!.id;
    const a = turn(r, s, id, "act");
    const b = turn(r, baseline, id, "act");
    expect(a.s.rel.robin.love).toBe(b.s.rel.robin.love);
    expect(a.s.date!.last).toEqual(b.s.date!.last);
    expect(recentCount(a.s, "robin", id.slice(5))).toBeGreaterThan(0);
  });

  test("old saves work and concrete social events replay without new rolls", () => {
    const r = load();
    const old = initialState(r);
    delete old.dating.recent;
    const started = turn(r, old, "date:talk@robin");
    const talked = turn(r, started.s, null, "warm", lovedWords("music"));
    const batches = [started.rec.events, talked.rec.events];
    const replayed = foldEvents(r, batches, old);
    expect(replayed).toEqual(talked.s);
    expect(old.dating.recent).toBeUndefined();
    expect(replayed.dating.recent!.robin.topics.music.count).toBe(1);
    const edited = load();
    edited.dating.fatiguePerTopic = 50;
    edited.dating.topics.music.weight = 10;
    expect(foldEvents(edited, batches, old).dating.recent).toEqual(replayed.dating.recent);
    expect(foldEvents(edited, batches, old).rel).toEqual(replayed.rel);
  });

  test("apology fear recovery also tapers across reopened sessions", () => {
    const r = load();
    let s = turn(r, initialState(r), "date:talk@robin").s;
    s.rel.robin.fear = 50;
    const first = turn(r, s, "date:apologize").s;
    expect(s.rel.robin.fear - first.rel.robin.fear).toBe(6);
    const reopened = turn(r, first, "date:talk@robin").s;
    const second = turn(r, reopened, "date:apologize").s;
    expect(reopened.rel.robin.fear - second.rel.robin.fear).toBeLessThan(4);
  });

  test("recent memory is bounded and expired keys are removed", () => {
    const r = load();
    let s = initialState(r);
    for (let i = 0; i < 100; i++) s = foldEvents(r, [[{ t: "dt_recent", who: "robin", key: `key${i}`, at: s.minutes, count: 1, fatigue: 0, src: "action" }]], s);
    expect(Object.keys(s.dating.recent!.robin.topics)).toHaveLength(SOCIAL_KEYS_KEPT);
    s = foldEvents(r, [[{ t: "time", min: 240, src: "action" }, { t: "dt_recent", who: "robin", key: "fresh", at: s.minutes + 240, count: 1, fatigue: 0, src: "action" }]], s);
    expect(Object.keys(s.dating.recent!.robin.topics)).toEqual(["fresh"]);
  });
});
