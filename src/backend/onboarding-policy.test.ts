import { afterEach, beforeEach, expect, test } from "bun:test";
import { builderAnswer, builderOpen, builderStart } from "./builder.js";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";
import { renderSettings } from "../frontend/render.js";

let oldHost: unknown;
let seq = 0;
let id: string;
let stored: any;
let sent: any[];
let suggestions: string[];
let messages: any[];
let calls: number;
let patches: any[];
beforeEach(() => {
  oldHost = (globalThis as any).spindle;
  id = `onboarding-policy-${++seq}`;
  stored = null; sent = []; suggestions = ["relationships"]; messages = []; calls = 0; patches = [];
  (globalThis as any).spindle = {
    chats: { get: async () => ({ character_id: id }) },
    characters: { get: async () => ({ id, name: "Aina", description: "A roommate", world_book_ids: [] }) },
    macros: { resolve: async () => ({ text: "Sam" }) },
    userStorage: {
      getJson: async (path: string, opts: any) => path.startsWith("builder/") ? stored ?? opts.fallback : {
        ...DEFAULT_SETTINGS, decider: "llm", narratorUpdates: false,
      },
      setJson: async (_: string, value: unknown) => { stored = structuredClone(value); },
    },
    sendToFrontend: (value: unknown) => sent.push(structuredClone(value)),
    log: { error() {}, info() {} },
    generate: { quiet: async () => {
      calls++;
      return { content: messages.length ? `Alternative ${calls}` : JSON.stringify({ suggestedTemplate: "blank", systems: suggestions }) };
    } },
    chat: {
      getMessages: async () => structuredClone(messages),
      updateMessage: async (_: string, mid: string, patch: any) => {
        patches.push(structuredClone(patch));
        Object.assign(messages.find(m => m.id === mid), structuredClone(patch));
      },
    },
  };
});
afterEach(() => { (globalThis as any).spindle = oldHost; });
const session = () => [...sent].reverse().find(m => m.type === "builder").session;

test("builder does not blanket-add quests; they remain available, and removed systems aren't offered", async () => {
  await builderOpen(id, "build", id);
  await builderStart(id, { connectionId: "", creative: false }, id);
  const systems = session().rounds[0].questions.find((q: any) => q.id === "systems");
  expect(systems.default).toEqual(["relationships"]);
  expect(systems.options.map((o: any) => o.id)).toContain("quests");
  for (const gone of ["minigames", "dungeon", "dating"]) expect(systems.options.map((o: any) => o.id)).not.toContain(gone);
  await builderAnswer(id, { systems: ["quests"] }, [], true, id);
  expect(session().rounds[0].answers.systems).toEqual(["quests"]);
});

test("builder preserves card-specific quest suggestions and drops removed systems", async () => {
  suggestions = ["quests", "minigames", "quests", "dating"];
  await builderOpen(id, "build", id);
  await builderStart(id, { connectionId: "", creative: false }, id);
  expect(session().rounds[0].questions.find((q: any) => q.id === "systems").default).toEqual(["quests"]);
});

test("settings keep basics, with no removed parts", () => {
  const html = renderSettings(DEFAULT_SETTINGS, null, []);
  expect(html).toContain('data-setting="enabled"');
  for (const gone of ['data-setting="minigames"', 'data-setting="look"', 'data-setting="sfx"', 'data-setting="fx"', "themeDating", "dateImages",
    'data-setting="drafts"', 'data-setting="prewrite"', "advanced-generation", 'data-setting="consistencyCheck"']) expect(html).not.toContain(gone);
});
