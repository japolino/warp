// The one post-reply helper call (write.ts) and the cleaning of what it writes (live.ts).

import { beforeAll, describe, expect, test } from "bun:test";
import { loadRuleset } from "../engine/loader.js";
import { applyEvent, cloneState, initialState } from "../engine/state.js";
import type { Ruleset } from "../engine/ruleset.js";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";
import { newMeter } from "./decisions.js";
import { parseGreeting } from "./greeting.js";
import { cleanChoices, usableTags } from "./live.js";
import { bookkeepingQuestions, type TextTask } from "./questions.js";
import { ADVENTURE_YAML, STORY_YAML } from "./test-host.js";
import { writerPrompt, writeTurn } from "./write.js";

const load = (yaml: string): Ruleset => loadRuleset([{ label: "t", content: yaml, order: 0 }]).ruleset!;
const adv = load(ADVENTURE_YAML);
const story = load(STORY_YAML);
const here = (r: Ruleset) => { const s = cloneState(initialState(r)); applyEvent(s, { t: "scene", who: "mira", here: true, src: "start" }, r); return s; };
const s = here(adv);
const REPLY = "Mira pulls you out of the harbour. Her apron is soaked.";
let reply = "{}";
let prompts: { system: string; user: string }[] = [];
let fail = false;

beforeAll(() => {
  (globalThis as any).spindle = {
    log: { error() {}, info() {} },
    generate: { quiet: async (req: any) => { prompts.push({ system: req.messages[0].content, user: req.messages[1].content }); if (fail) throw new Error("down"); return { content: reply }; } },
  };
});

describe("the writer's prompt", () => {
  test("mode text (Jev answered): only the flagged texts, no typed questions", () => {
    const tasks: TextTask[] = [{ kind: "outfit", who: "mira", name: "Mira", old: "green apron" }, { kind: "memory", who: "mira", name: "Mira" }];
    const p = writerPrompt({ r: adv, s, reply: REPLY, playerText: "", player: "Sam", mode: "text", tasks, tags: usableTags(adv, DEFAULT_SETTINGS, s), count: 3 });
    expect(p.system).toContain('"outfit:mira"');
    expect(p.system).toContain('"memory:mira"');
    expect(p.system).not.toContain('"looks:');
    expect(p.system).not.toContain('"answers"');
    expect(p.user).not.toContain("Questions:");
  });

  test("T-CH4: an Adventure writer prompt is small: no empty mechanics, at most 3,000 characters besides state and reply", () => {
    const p = writerPrompt({ r: adv, s, reply: REPLY, playerText: "", player: "Sam", mode: "text", tasks: [{ kind: "place" }], tags: usableTags(adv, DEFAULT_SETTINGS, s), count: 3, recent: { kind: 3 } });
    expect(p.system.length).toBeLessThanOrEqual(3000);
    expect(p.system).not.toMatch(/:\s*(\{\}|\[\])/);
    expect(p.system).toContain("- bold: A daring, physical or risky move (rolls Body)");
    // The author's own "(no roll)" is said once.
    expect(p.system).toContain("- careful: The cautious option (no roll)\n");
    expect(p.system).toContain("kind ×3");
    expect(p.system).toContain("At least one is none or easy, at least one is hard or extreme");
  });

  test("a story asks for no difficulty words; a contest asks for moves on the kind's abilities", () => {
    expect(writerPrompt({ r: story, s: here(story), reply: REPLY, playerText: "", player: "Sam", mode: "text", tasks: [], tags: usableTags(story, DEFAULT_SETTINGS, here(story)), count: 3 }).system).toContain("No difficulty words");
    const sc = cloneState(s);
    applyEvent(sc, { t: "contest", kind: "fight", opponent: "the bouncer", threat: "fair", dc: 12, src: "narrator" }, adv);
    const p = writerPrompt({ r: adv, s: sc, reply: REPLY, playerText: "", player: "Sam", mode: "text", tasks: [], tags: [], count: 2 });
    expect(p.system).toContain("contest:body (Body), contest:mind (Mind)");
  });

  test("mode all (no Jev): the bookkeeping questions are in the same call, with the texts each answer calls for", () => {
    const A = bookkeepingQuestions({ r: adv, s, playerText: "", reply: REPLY, player: "Sam", applied: null });
    const p = writerPrompt({ r: adv, s, reply: REPLY, playerText: "", player: "Sam", mode: "all", questions: A.questions, tasks: [], tags: usableTags(adv, DEFAULT_SETTINGS, s), count: 3 });
    expect(p.system).toContain('"answers"');
    expect(p.system).toContain('texts["outfit:<id>"]');
    expect(p.user).toContain("Questions:");
    expect(p.user).toContain("here:mira (yes/no)");
  });
});

describe("one call", () => {
  test("mode all: sparse answers parse (a missing one is the default) and malformed choices keep the answers", async () => {
    const A = bookkeepingQuestions({ r: adv, s, playerText: "", reply: REPLY, player: "Sam", applied: null });
    reply = JSON.stringify({ answers: { "here:mira": { p: 0.9 }, "stat:health": "down", time: 2 }, choices: "garbage", texts: { "outfit:mira": "a soaked apron" } });
    prompts = [];
    const meter = newMeter();
    const w = await writeTurn({ r: adv, s, reply: REPLY, playerText: "", player: "Sam", mode: "all", questions: A.questions, tasks: [], tags: [], count: 3, settings: DEFAULT_SETTINGS, meter });
    expect(meter).toEqual({ helper: 1, jev: 0 });
    expect(prompts).toHaveLength(1);
    expect(w.answers["here:mira"]).toEqual({ type: "noul", noul: 0.9 });
    expect(w.answers["stat:health"]).toMatchObject({ type: "choice", choice: "down" });
    expect(w.answers.time).toMatchObject({ type: "score", score: 2 });
    expect(w.answers["looks:mira"]).toBeUndefined();
    expect(w.choices).toEqual([]);
    expect(w.texts).toEqual({ "outfit:mira": "a soaked apron" });
  });

  test("a failed call is counted, never throws, and returns nothing", async () => {
    fail = true;
    try {
      const meter = newMeter();
      const w = await writeTurn({ r: adv, s, reply: REPLY, playerText: "", player: "Sam", mode: "text", tasks: [{ kind: "place" }], tags: [], count: 0, settings: DEFAULT_SETTINGS, meter });
      expect(w.ok).toBe(false);
      expect(meter.helper).toBe(1);
    } finally { fail = false; }
  });

  test("nothing to write: no call at all", async () => {
    prompts = [];
    const w = await writeTurn({ r: adv, s, reply: REPLY, playerText: "", player: "Sam", mode: "text", tasks: [], tags: [], count: 0, settings: DEFAULT_SETTINGS });
    expect(w.ok).toBe(true);
    expect(prompts).toHaveLength(0);
  });
});

describe("cleaning the written choices", () => {
  test("bad tags and absent targets are dropped; difficulty words are kept (unknown = fair; no check = none)", () => {
    const out = cleanChoices(adv, s, usableTags(adv, DEFAULT_SETTINGS, s), [
      { label: "Vault the bar", tag: "Bold move", difficulty: "HARD" },
      { label: "Sneak off", tag: "sneaky" },
      { label: "Hug someone", tag: "kind" },
      { label: "Thank Mira", tag: "kind", target: "Mira", difficulty: "extreme" },
      { label: "Study the lock", tag: "clever", difficulty: "a bit tricky" },
      { label: "Hold back", tag: "careful", difficulty: "normal" },
    ], 5);
    expect(out).toEqual([
      { label: "Vault the bar", tag: "bold", difficulty: "hard" },
      { label: "Thank Mira", tag: "kind", target: "mira", difficulty: "none" },
      { label: "Study the lock", tag: "clever", difficulty: "fair" },
      { label: "Hold back", tag: "careful", difficulty: "none" },
    ]);
  });
  test("a story keeps no difficulty words; a contest keeps only moves on the kind's abilities", () => {
    expect(cleanChoices(story, here(story), usableTags(story, DEFAULT_SETTINGS, here(story)), [{ label: "Let it sit", tag: "space", difficulty: "hard" }], 3)).toEqual([{ label: "Let it sit", tag: "space" }]);
    const sc = cloneState(s);
    applyEvent(sc, { t: "contest", kind: "fight", opponent: "the bouncer", threat: "fair", dc: 12, src: "narrator" }, adv);
    expect(cleanChoices(adv, sc, [], [{ label: "Feint", tag: "contest:body" }, { label: "Charm him", tag: "contest:charm" }, { label: "Out-think him", tag: "mind" }], 2))
      .toEqual([{ label: "Feint", tag: "contest:body" }, { label: "Out-think him", tag: "contest:mind" }]);
  });
  test("a romantic move is never offered toward someone not known to be an adult", () => {
    const r = load(ADVENTURE_YAML.replace("    careful:", "    flirt: { desc: \"Flirt\", per_person: true, tags: [romance], effects: {} }\n    careful:"));
    const s2 = here(r);
    expect(cleanChoices(r, s2, usableTags(r, DEFAULT_SETTINGS, s2), [{ label: "Wink at Mira", tag: "flirt", target: "Mira" }], 3)).toEqual([]);
    applyEvent(s2, { t: "adult", who: "mira", adult: true, src: "narrator" } as never, r);
    expect(cleanChoices(r, s2, usableTags(r, DEFAULT_SETTINGS, s2), [{ label: "Wink at Mira", tag: "flirt", target: "Mira" }], 3)).toHaveLength(1);
  });
});

test("the greeting read's JSON (no Jev) becomes the engine's GreetingRead; junk is left out", () => {
  expect(parseGreeting({ time: { hour: "23", minute: 40, word: null }, place: "  The Rusty Anchor ", present: ["Mira", 7, ""], you: { outfit: "a coat" }, people: { Mira: { appearance: "tall" }, Jo: {} }, adults: { Mira: true, Jo: "yes" } }))
    .toEqual({ time: { hour: 23, minute: 40, word: null, weekday: null }, place: "The Rusty Anchor", present: ["Mira"], you: { appearance: null, outfit: "a coat" }, people: { Mira: { appearance: "tall", outfit: null } }, adults: { Mira: true } });
});
