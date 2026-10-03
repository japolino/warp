import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { loadRuleset } from "../engine/loader.js";
import { initialState } from "../engine/state.js";
import { TEMPLATES, withCharacter } from "../engine/templates/index.js";
import { buildChoices, buildHud } from "../engine/view.js";
import { emptyDraft, renderBuilder } from "../frontend/builder-ui.js";
import { builderCurrent, builderOpen } from "./builder.js";
import { BUILDER_SESSION_VERSION, restoreBuilderSession } from "./builder-session.js";

// The builder adds the card's character to the people section, so the preview has someone in it.
const template = TEMPLATES.find(t => t.id === "adventure")!;
const templateParts = template.parts.map(p => ({...p, yaml: p.label === "people" ? withCharacter(p.yaml, "Aina") : p.yaml}));
const r = loadRuleset(templateParts.map((p, order) => ({label: p.label, content: p.yaml, order}))).ruleset!;
let sequence = 0;
let previousHost: unknown;
let characterId: string;
let chatId: string;
let stored: any;
let sent: any[];
let writes: number;
let modelCalls: number;

beforeEach(() => {
  previousHost = (globalThis as any).spindle;
  characterId = `recovery-character-${++sequence}`;
  chatId = `recovery-chat-${sequence}`;
  writes = modelCalls = 0;
  sent = [];
  stored = {
    characterId, characterName: "Aina", mode: "build", step: "review",
    connectionId: "saved-builder-model", creative: true, base: "adventure",
    analysis: null,
    rounds: [{questions: [{id: "systems", text: "Systems?", kind: "multi", options: [{id: "skills", label: "Skills"}]}], answers: {systems: ["skills"], difficulty: 3}}],
    additions: [{name: "Cooking", kind: "skill", note: "Keep this custom skill"}],
    parts: templateParts.map(p => ({...p, status: "ok", issues: []})),
    preview: {summary: "Old preview", counts: {}, hud: buildHud(r, initialState(r)), choices: buildChoices(r, initialState(r), {lines: [], veils: []}), warnings: []},
    request: null, changeSummary: "Saved edit", busy: "Writing before restart", error: null, updatedAt: 1,
  };
  // Exact fields added since the previous release; persisted views are stale.
  delete stored.preview.hud.goals;
  for (const person of stored.preview.hud.people) {delete person.conditions; delete person.memories;}
  (globalThis as any).spindle = {
    chats: {get: async () => ({character_id: characterId})},
    userStorage: {
      getJson: async () => structuredClone(stored),
      setJson: async (_: string, value: unknown) => {writes++; stored = structuredClone(value);},
    },
    sendToFrontend: (message: unknown) => sent.push(structuredClone(message)),
    log: {error: () => {}},
    generate: {quiet: async () => {modelCalls++; throw new Error("Recovery must not call a model");}},
  };
});
afterEach(() => {(globalThis as any).spindle = previousHost;});
const emitted = () => sent.at(-1).session;

describe("saved builder draft recovery", () => {
  test("rebuilds a legacy review preview without changing YAML, answers, additions or connection", async () => {
    const yaml = stored.parts.map((p: any) => p.yaml);
    const answers = structuredClone(stored.rounds[0].answers);
    const additions = structuredClone(stored.additions);
    await builderCurrent(chatId, "recovery");
    const s = emitted();
    expect(s.schemaVersion).toBe(BUILDER_SESSION_VERSION);
    expect(s.busy).toBeNull();
    expect(s.parts.map((p: any) => p.yaml)).toEqual(yaml);
    expect(s.rounds[0].answers).toEqual(answers);
    expect(s.additions).toEqual(additions);
    expect(s.connectionId).toBe("saved-builder-model");
    expect(s.preview.hud.goals).toEqual([]);
    expect(s.preview.hud.people.length).toBeGreaterThan(0);
    for (const p of s.preview.hud.people) {expect(p.conditions).toEqual([]); expect(p.memories).toEqual([]);}
    expect(renderBuilder(s, emptyDraft(), [], [], false)).toContain("warp-preview");
    expect(writes).toBe(1);
    expect(stored.preview.hud.goals).toEqual([]);
    expect(modelCalls).toBe(0);
    await builderOpen(chatId, "build", "recovery");
    expect(renderBuilder(emitted(), emptyDraft(), [], [], false)).toContain("warp-preview");
    expect(writes).toBe(1);
  });

  test("discards stale derived views even when a saved format version exists", async () => {
    stored.schemaVersion = BUILDER_SESSION_VERSION;
    await builderCurrent(chatId, "recovery");
    expect(emitted().preview.hud.goals).toEqual([]);
    expect(modelCalls).toBe(0);
  });

  test("old questions receive missing display defaults and preserve answers", async () => {
    stored.step = "questions";
    stored.parts = [];
    stored.analysis = {summary: "Old card analysis", statusBlock: {found: true}};
    delete stored.additions;
    const q = stored.rounds[0].questions[0];
    q.kind = "text";
    delete q.options;
    await builderCurrent(chatId, "recovery");
    expect(emitted().analysis.statusBlock.fields).toEqual([]);
    expect(emitted().analysis.cast).toEqual([]);
    expect(emitted().rounds[0].answers.systems).toEqual(["skills"]);
    expect(renderBuilder(emitted(), emptyDraft(), [], [], false)).toContain("Old card analysis");
    expect(emitted().preview).toBeNull();
  });

  test("broken authored YAML remains visible and repairable", async () => {
    stored.parts = [{label: "core", yaml: "stats: [", status: "ok", issues: []}];
    await builderCurrent(chatId, "recovery");
    expect(emitted().preview).not.toBeNull();
    expect(emitted().parts[0].status).toBe("error");
    expect(emitted().parts[0].issues[0].message).toContain("YAML couldn't be read");
    expect(emitted().parts[0].yaml).toBe("stats: [");
    const html = renderBuilder(emitted(), emptyDraft(), [], [], false);
    expect(html).toContain("stats: [");
    expect(html).toContain('data-b="redo"');
    expect(html).not.toContain("couldn't be displayed");
  });

  test("rejects malformed primary data without overwriting the stored draft", async () => {
    stored.parts[0].yaml = {unexpected: "object"};
    const original = structuredClone(stored);
    await expect(builderCurrent(chatId, "recovery")).rejects.toThrow("stored data has been kept");
    expect(stored).toEqual(original);
    expect(writes).toBe(0);
  });

  test("refuses another character's or a newer format's draft", () => {
    expect(() => restoreBuilderSession(stored, "another-character")).toThrow("doesn't match");
    stored.schemaVersion = BUILDER_SESSION_VERSION + 1;
    expect(() => restoreBuilderSession(stored, characterId)).toThrow("newer Warp version");
    expect(writes).toBe(0);
  });

  test("a render failure produces a recovery view instead of throwing through navigation", () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
      const html = renderBuilder(stored, emptyDraft(), [], [], false);
      expect(html).toContain("Your saved draft is kept");
      expect(html).toContain("other tabs");
      expect(log).toHaveBeenCalledTimes(1);
      expect(writes).toBe(0);
    } finally {log.mockRestore();}
  });

  test("a draft from before the designer moved out drops its fields; a deepen draft reopens as a refine", () => {
    Object.assign(stored, {mode: "deepen", effort: "quick", log: ["a step"], waived: {x: "why"}, depth: {before: 1, after: 2, open: 0}, designPass: {reason: "no_tools", steps: 3, changed: false, resolved: 0}});
    const s = restoreBuilderSession(stored, characterId) as unknown as Record<string, unknown>;
    expect(s.mode).toBe("refine");
    for (const k of ["effort", "log", "waived", "depth", "designPass"]) expect(k in s).toBe(false);
    expect(renderBuilder(s as never, emptyDraft(), [], [], false)).toContain("Refine with AI");
  });
});
