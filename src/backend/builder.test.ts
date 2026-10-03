// The AI builder end to end against a fake host and a scripted model.

import { beforeAll, describe, expect, test } from "bun:test";
import { TEMPLATES } from "../engine/templates/index.js";

const ADVENTURE = TEMPLATES.find((t) => t.id === "adventure")!;
const partYaml = (label: string) => ADVENTURE.parts.find((p) => p.label === label)?.yaml ?? "";

const sent: any[] = [];
const prompts: string[] = [];
let repairCalls = 0;
const books: Record<string, { id: string; name: string; entries: any[] }> = {};
const character = { id: "ch1", name: "Chono Aina", description: "A catgirl roommate with a sharp tongue.", personality: "tsundere", scenario: "University dorm.", first_mes: "Hmph. You're late.\n[Status: Mood 5/10 | Affection 20]", creator_notes: "", world_book_ids: [] as string[], extensions: {} };
const storage: Record<string, unknown> = {};

function reply(user: string): string {
  if (user.includes('"suggestedTemplate"')) {
    return JSON.stringify({
      summary: "Chono Aina, a sharp-tongued catgirl roommate at university. Slice of life with romance.",
      suggestedTemplate: "adventure", reason: "Light mechanics fit a slice-of-life card.",
      systems: ["needs", "relationships", "money", "clothing"],
      statusBlock: { found: true, fields: ["Mood", "Affection"] },
      followUps: [{ text: "Aina gets jealous easily. Track jealousy?", kind: "single", options: ["Yes", "No"], why: "The card mentions it." }],
    });
  }
  if (user.includes("Ask up to 4 more")) return JSON.stringify({ followUps: [{ text: "Should she have a part-time job?", kind: "single", options: ["Yes", "No"] }] });
  if (user.includes("has problems reported by the checker")) { repairCalls++; return "```yaml\n" + partYaml("people") + "```"; }
  if (user.includes("The player wants:")) {
    return JSON.stringify({ summary: "Added a cooking skill.", parts: { stats: partYaml("stats").replace("stats:\n", "stats:\n  cooking: { kind: skill, max: 100, start: 5, grades: [F, D, C, B, A, S] }\n") } });
  }
  const m = /Write the "(\w+)" section/.exec(user);
  if (m) {
    // The first draft of "people" is broken on purpose; the repair loop must fix it.
    if (m[1] === "people") return "Here you go:\n```yaml\nrelationships:\n  stats: [\n```";
    return "```yaml\n" + partYaml(m[1]) + "```";
  }
  return "{}";
}

beforeAll(() => {
  (globalThis as any).spindle = {
    sendToFrontend: (m: unknown) => sent.push(m),
    log: { info: () => {}, error: () => {}, warn: () => {} },
    toast: { info: () => {}, success: () => {}, warning: () => {}, error: () => {} },
    userStorage: {
      getJson: async (p: string, o: any) => (p in storage ? structuredClone(storage[p]) : o?.fallback),
      setJson: async (p: string, v: unknown) => { storage[p] = structuredClone(v); },
      delete: async (p: string) => { delete storage[p]; },
    },
    chats: { get: async () => ({ id: "c1", character_id: "ch1" }) },
    characters: { get: async () => character, update: async (_: string, i: any) => Object.assign(character, i) },
    world_books: {
      get: async (id: string) => books[id] ?? null,
      create: async (input: any) => { const id = `wb${Object.keys(books).length + 1}`; books[id] = { id, name: input.name, entries: [] }; return { id, ...input }; },
      entries: {
        list: async (bookId: string) => ({ data: books[bookId].entries, total: books[bookId].entries.length }),
        create: async (bookId: string, input: any) => { const e = { id: `e${Math.random()}`, world_book_id: bookId, key: [], ...input }; books[bookId].entries.push(e); return e; },
        update: async (id: string, input: any) => { for (const b of Object.values(books)) for (const e of b.entries) if (e.id === id) Object.assign(e, input); },
      },
    },
    generate: {
      quiet: async (req: any) => {
        const user = req.messages[1].content as string;
        prompts.push(user);
        return { content: reply(user) };
      },
    },
  };
});

const lastSession = () => [...sent].reverse().find((m) => m.type === "builder")?.session;

describe("AI builder", () => {
  test("read → ask → more → build → repair → review → refine → install", async () => {
    const b = await import("./builder.js");

    await b.builderOpen("c1", "build", undefined);
    expect(lastSession().step).toBe("start");

    await b.builderStart("c1", { connectionId: "", creative: false }, undefined);
    let s = lastSession();
    expect(s.step).toBe("questions");
    expect(s.base).toBe("adventure");
    expect(s.analysis.statusBlock).toEqual({ found: true, fields: ["Mood", "Affection"] });
    const ids = s.rounds[0].questions.map((q: any) => q.id);
    expect(ids).toEqual(["tone", "systems", "difficulty", "relationship_depth", "f1_0"]);
    // The card's text reached the model.
    expect(prompts[0]).toContain("sharp tongue");

    await b.builderAnswer("c1", { tone: "romantic", f1_0: "o0" }, [{ name: "Cooking", kind: "skill", note: "She's bad at it" }], true, undefined);
    s = lastSession();
    expect(s.rounds.length).toBe(2);
    expect(s.rounds[0].answers.tone).toBe("romantic");

    await b.builderAnswer("c1", { f2_0: "o1" }, [{ name: "Cooking", kind: "skill", note: "She's bad at it" }], false, undefined);
    s = lastSession();
    expect(s.error).toBeNull();
    expect(s.step).toBe("review");
    // Encounters weren't picked, so there's no encounters section.
    expect(s.parts.map((p: any) => p.label)).not.toContain("encounters");
    expect(repairCalls).toBeGreaterThan(0);
    expect(s.parts.every((p: any) => p.status !== "error")).toBe(true);
    expect(s.preview.summary).toMatch(/Adventure: \d+ meters/);
    expect(s.preview.hud.bars.length).toBeGreaterThan(0);
    // One pass: no designer, depth audit or balance review in the draft.
    for (const k of ["log", "depth", "designPass", "effort", "waived"]) expect(s[k]).toBeUndefined();
    expect(s.preview.warnings).toBeUndefined();
    // Drafting prompts carried the answers, the additions and the status block.
    const draftPrompt = prompts.find((p) => p.includes('Write the "stats" section'))!;
    expect(draftPrompt).toContain("Romantic");
    expect(draftPrompt).toContain("Cooking");
    expect(draftPrompt).toContain("status block");

    await b.builderRefine("c1", "Add a cooking skill", undefined);
    s = lastSession();
    expect(s.changeSummary).toBe("Added a cooking skill.");
    expect(s.parts.find((p: any) => p.label === "stats").changed).toBe(true);
    expect(s.preview.counts.skills).toBe(4); // body, mind, charm and the new cooking

    await b.builderInstall("c1", undefined);
    s = lastSession();
    expect(s.step).toBe("done");
    const book = Object.values(books)[0];
    expect(book.name).toBe("warp-ruleset");
    expect(character.world_book_ids).toContain(book.id);
    expect(book.entries.map((e) => e.comment).sort()).toEqual(s.parts.map((p: any) => `warp-ruleset · ${p.label}`).sort());
    expect(book.entries.every((e) => e.disabled)).toBe(true);
    expect(book.entries.find((e) => e.comment.endsWith("stats")).content).toContain("cooking:");

    // Refine mode loads what's installed and saves back into the same entries.
    await b.builderClose("c1", undefined);
    await b.builderOpen("c1", "refine", undefined);
    s = lastSession();
    expect(s.mode).toBe("refine");
    expect(s.step).toBe("review");
    expect(s.parts.length).toBe(book.entries.length);
    await b.builderInstall("c1", undefined);
    expect(Object.values(books)[0].entries.length).toBe(s.parts.length); // updated in place, nothing duplicated
  });
});
