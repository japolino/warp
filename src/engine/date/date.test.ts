import { describe, expect, test } from "bun:test";
import { loadRuleset } from "../loader.js";
import { foldEvents, initialState, makeEnv, type GameState } from "../state.js";
import { resolveTurnFull, type Intent } from "../resolve.js";
import { evaluate } from "../expr.js";
import { buildChoices, stateDigest } from "../view.js";
import { activeSession, dateMoves, romanceOk } from "./talk.js";
import { stageIndex } from "./stage.js";
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
