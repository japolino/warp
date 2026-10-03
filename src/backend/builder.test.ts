// The one-pass AI builder end to end against a fake host and a scripted model (CORE-DESIGN §5.3 step 4):
// read the card (1 call; Jev classifies when set) → Story / Adventure → 3 questions + ≤ 3 about the card →
// the template themed part by part → checker repair → preview → install. Refine = 1 call + repair.

import { beforeAll, describe, expect, test } from "bun:test";
import { getTemplate, withCharacter } from "../engine/templates/index.js";
import { loadRuleset } from "../engine/loader.js";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";
import { withAttraction, withDifficulty, withPace } from "./builder.js";
import { emptyDraft, renderBuilder } from "../frontend/builder-ui.js";

const sent: any[] = [];
const prompts: { user: string; system: string; userId?: string }[] = [];
const jevCalls: any[] = [];
const books: Record<string, { id: string; name: string; entries: any[]; metadata?: any }> = {};
const character = { id: "ch1", name: "Chono Aina", description: "A catgirl roommate with a sharp tongue. She hides why she left home.", personality: "tsundere", scenario: "University dorm.", first_mes: "Hmph. You're late.\n[Status: Mood 5/10 | Affection 20]", creator_notes: "", world_book_ids: [] as string[], extensions: {} };
const storage: Record<string, unknown> = {};
const settings: Record<string, any> = {};
const secrets: Record<string, string> = {};
let jevFails = false;
let brokenPeople = true;

const CARD_READ = {
  summary: "Chono Aina, a sharp-tongued catgirl roommate at university. Slice of life with romance.",
  style: "story", reason: "It is about living together and feelings, not danger.", cardType: "character", romance: true,
  statusBlock: { found: true, fields: ["Mood", "Affection"] }, statusFields: ["Mood", "Affection"],
  cast: [{ name: "Chono Aina", relation: "acts annoyed but secretly likes {{user}}", age: 20, outfit: "an oversized hoodie" }],
  followUps: [
    { text: "Aina hides why she left home. Make it a secret?", kind: "single", options: ["Yes", "No"], why: "The description hints at it" },
    { text: "Q2?", kind: "text" }, { text: "Q3?", kind: "text" }, { text: "Q4 is one too many", kind: "text" },
  ],
};

/** The starting point the builder sent for a part. */
function baseIn(user: string): string {
  const start = user.indexOf("The template part (the starting point):\n") + "The template part (the starting point):\n".length;
  const ends = ["\n\nThe current version", "\n\nIds in the other parts", "\n\nThe player asked"].map((m) => user.indexOf(m, start)).filter((i) => i > 0);
  return user.slice(start, ends.length ? Math.min(...ends) : undefined);
}

function reply(user: string, system: string): string {
  if (system.startsWith("You answer typed questions")) {
    // The helper standing in for Jev (Jev failed).
    return JSON.stringify({ template: { choice: "story", confidence: 0.8 }, card_type: { choice: "character", confidence: 0.9 }, status_block: { p: 0.9 }, romance: { p: 0.2 } });
  }
  if (user.includes('"followUps"')) return JSON.stringify(CARD_READ);
  const fix = /This "(\w+)" part has problems/.exec(user);
  if (fix) return "```yaml\n" + withAttraction(withCharacter(getTemplate("story")!.parts.find((p) => p.label === fix[1])!.yaml, "Chono Aina")) + "```";
  if (user.includes("The player wants:")) {
    const people = getTemplate("story")!.parts.find((p) => p.label === "people")!.yaml.replace("narrator: 4            # at most 4", "narrator: 3            # at most 3");
    return JSON.stringify({ summary: "Slowed the relationships down.", parts: { people: withCharacter(people, "Chono Aina") } });
  }
  const m = /Theme the "(\w+)" part/.exec(user);
  if (m) {
    if (m[1] === "people" && brokenPeople) return "Here you go:\n```yaml\nrelationships:\n  stats: [\n```";
    const base = baseIn(user);
    return "```yaml\n" + (m[1] === "core" ? base.replace(/^name: \w+/m, "name: Dorm Days") : base) + "```";
  }
  return "{}";
}

beforeAll(() => {
  (globalThis as any).spindle = {
    sendToFrontend: (m: unknown) => sent.push(structuredClone(m)),
    log: { info: () => {}, error: () => {}, warn: () => {} },
    toast: { info: () => {}, success: () => {}, warning: () => {}, error: () => {} },
    userStorage: {
      getJson: async (p: string, o: any) => (p === "settings.json" ? settings[o?.userId ?? "_"] ?? {} : p in storage ? structuredClone(storage[p]) : o?.fallback),
      setJson: async (p: string, v: unknown) => { storage[p] = structuredClone(v); },
      delete: async (p: string) => { delete storage[p]; },
    },
    enclave: { get: async (k: string) => secrets[k] ?? null, has: async (k: string) => k in secrets },
    cors: async (url: string, init: any) => {
      jevCalls.push({ url, body: JSON.parse(init.body) });
      if (jevFails) return { status: 500, body: "down" };
      return { status: 200, body: JSON.stringify({ answers: {
        template: { type: "choice", choice: "adventure", confidence: 0.85, probabilities: { adventure: 0.85, story: 0.15 } },
        card_type: { type: "choice", choice: "character", confidence: 0.9, probabilities: { character: 0.9, scenario: 0.1 } },
        status_block: { type: "noul", noul: 0.95 },
        romance: { type: "noul", noul: 0.8 },
      } }) };
    },
    chats: { get: async () => ({ id: "c1", character_id: "ch1" }) },
    characters: { get: async () => structuredClone(character), update: async (_: string, i: any) => Object.assign(character, i) },
    world_books: {
      get: async (id: string) => books[id] ?? null,
      create: async (input: any) => { const id = `wb${Object.keys(books).length + 1}`; books[id] = { id, name: input.name, entries: [], metadata: input.metadata }; return { id, ...input }; },
      delete: async (id: string) => { delete books[id]; },
      entries: {
        list: async (bookId: string) => ({ data: books[bookId].entries, total: books[bookId].entries.length }),
        create: async (bookId: string, input: any) => { const e = { id: `e${Math.random()}`, world_book_id: bookId, key: [], ...input }; books[bookId].entries.push(e); return e; },
      },
    },
    generate: {
      quiet: async (req: any) => {
        const system = req.messages[0].content as string, user = req.messages[1].content as string;
        prompts.push({ user, system, userId: req.userId });
        return { content: reply(user, system) };
      },
    },
  };
});

const lastSession = () => [...sent].reverse().find((m) => m.type === "builder")?.session;
const reset = () => { prompts.length = 0; jevCalls.length = 0; };
const kinds = () => prompts.map((p) => p.system.startsWith("You answer typed questions") ? "classify"
  : p.user.includes('"followUps"') ? "read" : /Theme the "(\w+)" part/.exec(p.user)?.[1] ?? (p.user.includes("problems reported by the checker") ? "repair" : p.user.includes("The player wants:") ? "refine" : "other"));

describe("the template, adjusted before theming", () => {
  const story = getTemplate("story")!.parts, adventure = getTemplate("adventure")!.parts;
  const part = (parts: typeof story, l: string) => parts.find((p) => p.label === l)!.yaml;

  test("a romance adds attraction as the last relationship stat, once", () => {
    for (const parts of [story, adventure]) {
      const y = withAttraction(part(parts, "people"));
      expect(y).toMatch(/^ {4}attraction: \{/m);
      expect(withAttraction(y)).toBe(y);
      expect(y).not.toContain("# attraction:");
      expect(y.indexOf("attraction:")).toBeLessThan(y.indexOf("  people:"));
      // Its bands speak both ways, like the template's own stats.
      const bands = (loadRuleset([{ label: "people", content: y, order: 0 }]).ruleset!).relStats.attraction.bands;
      expect(bands.map((b, i) => [i > 0 ? !!b.say : true, i < bands.length - 1 ? !!b.sayDown : true])).toEqual(bands.map(() => [true, true]));
    }
  });

  test("difficulty moves every target by 2 per step; pace raises the caps per reply", () => {
    expect(withDifficulty(part(adventure, "stats"), 5)).toContain("dc: { easy: 12, fair: 16, hard: 20, extreme: 24 }");
    expect(withDifficulty(part(adventure, "stats"), 1)).toContain("dc: { easy: 4, fair: 8, hard: 12, extreme: 16 }");
    expect(withDifficulty(part(adventure, "stats"), 3)).toBe(part(adventure, "stats"));
    expect(withPace(part(story, "people"), "slow")).toBe(part(story, "people"));
    expect([...withPace(part(story, "people"), "fast").matchAll(/^ +narrator: (\d+)/gm)].map((m) => m[1])).toEqual(["8", "8"]);
    // Inline caps too (attraction), never comments.
    expect(withPace(withAttraction(part(story, "people")), "steady")).toMatch(/attraction: \{ start: 0, narrator: 8,/);
    expect(withPace(part(story, "people"), "steady")).toContain("# attraction: { start: 0, narrator: 6,");
  });
});

describe("one-pass builder", () => {
  test("read (1 call) → questions → the Story template themed → repair → preview → refine (1 call + repair) → install", async () => {
    const b = await import("./builder.js");
    reset();
    await b.builderOpen("c1", "build", "u1");
    expect(lastSession().step).toBe("start");

    await b.builderStart("c1", { connectionId: "builder-model" }, "u1");
    let s = lastSession();
    expect(s.step).toBe("questions");
    // One helper call read the card and classified it (no Jev set).
    expect(kinds()).toEqual(["read"]);
    expect(prompts[0].user).toContain("sharp tongue");
    expect(prompts[0].user).toContain('"style"');
    expect(s.base).toBe("story");
    expect(s.analysis).toMatchObject({ suggestedTemplate: "story", cardType: "character", romance: true, statusBlock: { found: true, fields: ["Mood", "Affection"] } });
    expect(s.analysis.cast[0]).toMatchObject({ name: "Chono Aina", age: 20, outfit: "an oversized hoodie" });
    // The Story / Adventure switch, 3 questions, and at most 3 about the card.
    expect(s.rounds.length).toBe(1);
    expect(s.rounds[0].questions.map((q: any) => q.id)).toEqual(["style", "tone", "difficulty", "pace", "f1_0", "f1_1", "f1_2"]);
    expect(s.rounds[0].questions[0].default).toBe("story");
    // No designer leftovers.
    for (const k of ["plan", "creative", "persona", "log", "depth", "designPass", "effort"]) expect(s[k]).toBeUndefined();
    const askHtml = renderBuilder(s, emptyDraft(), [], [], false);
    expect(askHtml).toContain('data-bq="style" data-bq-kind="single" data-bq-opt="story" aria-pressed="true"');
    expect(askHtml).toContain("attraction");
    for (const gone of ['data-b="more"', "Ask me more", "Get creative", "design plan"]) expect(askHtml).not.toContain(gone);

    reset();
    await b.builderAnswer("c1", { tone: "romantic", difficulty: 5, f1_0: "o0" }, [{ name: "Cooking", kind: "skill", note: "She's bad at it" }], "u1");
    s = lastSession();
    expect(s.error).toBeNull();
    expect(s.step).toBe("review");
    expect(s.parts.map((p: any) => p.label)).toEqual(["core", "people", "story", "actions"]);
    // One call per part (foundations first), then the repair of the part that came back broken.
    expect(kinds()).toEqual(["core", "people", "story", "actions", "repair"]);
    expect(prompts.every((p) => p.userId === "u1")).toBe(true);
    const people = prompts.find((p) => p.user.includes('Theme the "people" part'))!.user;
    expect(people).toContain("Romantic");
    expect(people).toContain("Cooking");
    expect(people).toContain("status block");
    expect(people).toContain("oversized hoodie");
    // The template was adjusted before theming: the card's character, attraction (a romance).
    expect(baseIn(people)).toContain('chono_aina:\n      name: "Chono Aina"');
    expect(baseIn(people)).toMatch(/^ {4}attraction:/m);
    // Story never asks about dice: the difficulty answer stays out of the brief.
    expect(people).not.toContain("How hard should risky moves be?");
    // Parts drafted second know the relationship stats and their band names (for secrets).
    expect(prompts.find((p) => p.user.includes('Theme the "story" part'))!.user).toContain("trust (bands: Guarded, Wary, Open, Trusting, Devoted)");
    expect(s.parts.every((p: any) => p.status === "ok")).toBe(true);
    expect(s.preview.summary).toMatch(/^Dorm Days \(Story, no dice\): 3 feelings, 1 person/);
    expect(s.preview.hud.people.map((p: any) => p.name)).toEqual(["Chono Aina"]);
    const reviewHtml = renderBuilder(s, emptyDraft(), [], [], false);
    expect(reviewHtml).toContain("warp-preview");
    expect(reviewHtml).toContain("Draft &amp; check");
    expect(reviewHtml).not.toContain("design plan");

    reset();
    await b.builderRefine("c1", "Make relationships move slower", "u1");
    s = lastSession();
    expect(kinds()).toEqual(["refine"]);
    expect(s.changeSummary).toBe("Slowed the relationships down.");
    expect(s.parts.find((p: any) => p.label === "people").changed).toBe(true);
    expect(s.parts.find((p: any) => p.label === "people").yaml).toContain("narrator: 3");

    await b.builderInstall("c1", "u1");
    s = lastSession();
    expect(s.step).toBe("done");
    const book = Object.values(books)[0];
    expect(book.name).toBe("warp-ruleset");
    expect(character.world_book_ids).toContain(book.id);
    expect(book.entries.map((e) => e.comment)).toEqual(s.parts.map((p: any) => `warp-ruleset · ${p.label}`));
    expect(book.entries.every((e) => e.disabled)).toBe(true);
    // Written for the card: no template id, so the Story / Adventure switch leaves it alone.
    expect(book.metadata.warp.template).toBeUndefined();

    // Refine mode loads what's installed and saves a new snapshot of the same parts.
    await b.builderClose("c1", "u1");
    await b.builderOpen("c1", "refine", "u1");
    s = lastSession();
    expect(s.mode).toBe("refine");
    expect(s.step).toBe("review");
    expect(s.parts.map((p: any) => p.label)).toEqual(["core", "people", "story", "actions"]);
    await b.builderClose("c1", "u1");
  });

  test("switching to Adventure drafts the Adventure template, with the difficulty answer in its checks", async () => {
    const b = await import("./builder.js");
    brokenPeople = false;
    await b.builderOpen("c1", "build", "u2");
    await b.builderStart("c1", { connectionId: "" }, "u2");
    reset();
    await b.builderAnswer("c1", { style: "adventure", difficulty: 1, pace: "steady" }, [], "u2");
    const s = lastSession();
    expect(s.base).toBe("adventure");
    expect(s.parts.map((p: any) => p.label)).toEqual(["core", "stats", "world", "people", "story", "actions", "conflict"]);
    expect(kinds()).toEqual(["core", "stats", "people", "world", "story", "actions", "conflict"]);
    expect(s.parts.find((p: any) => p.label === "stats").yaml).toContain("dc: { easy: 4, fair: 8, hard: 12, extreme: 16 }");
    expect(s.parts.find((p: any) => p.label === "people").yaml).toContain("narrator: 7");
    expect(prompts.find((p) => p.user.includes('Theme the "stats" part'))!.user).toContain("How hard should risky moves be?");
    expect(s.preview.summary).toContain("(Adventure, dice)");
    expect(s.preview.counts.contests).toBe(3);
    await b.builderClose("c1", "u2");
    brokenPeople = true;
  });

  test("with Jev set, Jev classifies the card and the helper only writes", async () => {
    const b = await import("./builder.js");
    settings.u3 = { ...DEFAULT_SETTINGS, decider: "jev" };
    secrets.jev_api_key = "test-key";
    await b.builderOpen("c1", "build", "u3");
    reset();
    await b.builderStart("c1", { connectionId: "" }, "u3");
    const s = lastSession();
    expect(kinds()).toEqual(["read"]);
    expect(jevCalls.length).toBe(1);
    expect(Object.keys(jevCalls[0].body.questions)).toEqual(["template", "card_type", "status_block", "romance"]);
    expect(Object.keys(jevCalls[0].body.questions.template.criteria)[0]).toBe("adventure");
    expect(jevCalls[0].body.state.card).toContain("sharp tongue");
    // The helper wasn't asked to classify; Jev's picks win over anything it wrote.
    expect(prompts[0].user).not.toContain('"style"');
    expect(prompts[0].user).not.toContain('"cardType"');
    expect(prompts[0].user).toContain('"statusFields"');
    expect(s.base).toBe("adventure");
    expect(s.analysis).toMatchObject({ suggestedTemplate: "adventure", romance: true, statusBlock: { found: true, fields: ["Mood", "Affection"] }, reason: "" });
    await b.builderClose("c1", "u3");
  });

  test("a failing Jev falls back to the helper for the same questions (one more call, only then)", async () => {
    const b = await import("./builder.js");
    settings.u4 = { ...DEFAULT_SETTINGS, decider: "jev" };
    jevFails = true;
    await b.builderOpen("c1", "build", "u4");
    reset();
    await b.builderStart("c1", { connectionId: "" }, "u4");
    const s = lastSession();
    expect(jevCalls.length).toBeGreaterThan(0);
    expect(kinds().sort()).toEqual(["classify", "read"]);
    expect(s.error).toBeNull();
    expect(s.base).toBe("story");
    expect(s.analysis.romance).toBe(false);
    jevFails = false;
    await b.builderClose("c1", "u4");
  });
});
