import { afterEach, beforeEach, expect, test } from "bun:test";
import { builderAnswer, builderOpen, builderStart } from "./builder.js";
import { afterReply } from "./turn.js";
import { initialState } from "../engine/state.js";
import { loadRuleset } from "../engine/loader.js";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";
import { renderDepthCard, renderSettings } from "../frontend/render.js";

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

test("builder does not blanket-add quests or games; both remain available", async () => {
  await builderOpen(id, "build", id);
  await builderStart(id, { connectionId: "", creative: false }, id);
  const systems = session().rounds[0].questions.find((q: any) => q.id === "systems");
  expect(systems.default).toEqual(["relationships"]);
  expect(systems.options.map((o: any) => o.id)).toContain("quests");
  expect(systems.options.map((o: any) => o.id)).toContain("minigames");
  await builderAnswer(id, { systems: ["quests", "minigames"] }, [], true, id);
  expect(session().rounds[0].answers.systems).toEqual(["quests", "minigames"]);
});

test("builder preserves card-specific game and quest suggestions", async () => {
  suggestions = ["quests", "minigames", "quests"];
  await builderOpen(id, "build", id);
  await builderStart(id, { connectionId: "", creative: false }, id);
  expect(session().rounds[0].questions.find((q: any) => q.id === "systems").default).toEqual(["quests", "minigames"]);
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

test("settings keep basics and every game, with advanced cost controls collapsed by default", () => {
  const html = renderSettings(DEFAULT_SETTINGS, null, []);
  expect(html).toContain('data-setting="enabled"');
  expect(html).toContain('data-setting="minigames"');
  for (const name of ["Aim", "Keys", "Mines", "Stack", "Snake", "Pinball", "Blackjack", "Roulette", "Slots", "three-legged race"]) expect(html).toContain(name);
  expect(html).toContain('<details data-section="advanced-generation"><summary>');
  expect(html).toContain("even when you never choose them");
  expect(html).toContain("stays selected");
});

test("connectivity is not presented as a fun score or perfection requirement", () => {
  const html = renderDepthCard({ state: "ok", depth: { score: 70, gaps: [], drafted: [] } } as any);
  expect(html).toContain("Rules connectivity");
  expect(html).toContain("not a rating of fun");
  expect(html).toContain("without reaching 100");
});
