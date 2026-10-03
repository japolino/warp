import { afterEach, beforeEach, expect, test } from "bun:test";
import { builderAnswer, builderOpen, builderStart } from "./builder.js";
import { afterReply } from "./turn.js";
import { initialState } from "../engine/state.js";
import { loadRuleset } from "../engine/loader.js";
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
        ...DEFAULT_SETTINGS, drafts: 3, prewrite: 0, decider: "llm", narratorUpdates: false, consistencyCheck: false,
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

test("extra drafts never switch an already visible reply, including a nonzero swipe", async () => {
  const r = loadRuleset([{ label: "t", content: "name: Test\nstats: { health: { start: 50 } }", order: 0 }]).ruleset!;
  const rec = { v: 1 as const, hints: [], events: [], at: 0 };
  const reply = "The reply the player is reading.";
  const m = { id: "reply", index_in_chat: 0, role: "assistant", is_user: false, content: reply,
    swipe_id: 1, swipes: ["Older swipe", reply], metadata: { warp: { swipes: { "1": rec } } } };
  messages = [m];
  await afterReply({ chatId: id, rec, ruleset: r, after: initialState(r), playerText: "Hello", at: 0,
    outcome: null, player: "Sam", prompt: [{ role: "user", content: "Hello" }] }, structuredClone(m) as any, reply, id);
  expect(m.swipe_id).toBe(1);
  expect(m.content).toBe(reply);
  expect(m.swipes).toEqual(["Older swipe", reply, "Alternative 1", "Alternative 2"]);
  expect(m.metadata.warp.swipes).toHaveProperty("2");
  expect(m.metadata.warp.swipes).toHaveProperty("3");
  expect(calls).toBe(2); // No hidden judge call to select another reply.
  expect(patches.every(p => p.swipe_id === undefined || p.swipe_id === 1)).toBe(true);
});

test("settings keep basics, with advanced cost controls collapsed by default and no removed parts", () => {
  const html = renderSettings(DEFAULT_SETTINGS, null, []);
  expect(html).toContain('data-setting="enabled"');
  for (const gone of ['data-setting="minigames"', 'data-setting="look"', 'data-setting="sfx"', 'data-setting="fx"', "themeDating", "dateImages"]) expect(html).not.toContain(gone);
  expect(html).toContain('<details data-section="advanced-generation"><summary>');
  expect(html).toContain("even when you never choose them");
  expect(html).toContain("stays selected");
});
