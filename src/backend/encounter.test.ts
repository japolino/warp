// Quiet encounters end to end against a fake host: clicked rounds grow one message,
// repeated moves don't repeat their words, and the end replaces the log with a summary.

import { beforeAll, describe, expect, test } from "bun:test";
import { encounterLogOf, foldPath, warpMeta, type Msg } from "./ledger.js";
import { loadRuleset } from "../engine/loader.js";
import { playRound } from "./encounter.js";
import { retell, scriptedRound, storyPov, writeRound } from "./encounter-lines.js";

const RULES = {
  clock: { start: "Mon 12:00" },
  stats: { stress: { kind: "meter", start: 10, good: "low" }, persuasion: { kind: "skill", max: 100, start: 90 } },
  locations: { street: { name: "The Street" } },
  start: { location: "street", items: { spray: 1 } },
  items: { spray: { name: "Blocker Spray", use: { label: "Spray yourself", stress: -2 } } },
  encounters: {
    cornered: {
      name: "Cornered",
      foe: { name: "The Pack", stats: { resolve: { start: 10, max: 10 } } },
      actions: {
        talk: {
          label: "Talk them down", say: "*I raise my hands and smile.*",
          check: { chance: 100 }, success: { foe: { resolve: -4 }, hint: "They hesitate, muttering among themselves." }, fail: { stress: 10 },
        },
      },
      foe_moves: { press: { desc: "Presses in close", weight: 1, stress: 3 } },
      end_when: { won: "foe.resolve <= 0", overwhelmed: "stress >= 80" },
      labels: { won: "You talked them down" },
    },
  },
};

const msgs: Msg[] = [];
let n = 0;
const sent: any[] = [];
const book = { id: "wb1", name: "warp-ruleset" };
const entries = [{ id: "e1", comment: "warp-ruleset · all", content: JSON.stringify(RULES), order_value: 10, key: [] }];
const msg = (role: "user" | "assistant", content: string, metadata?: Record<string, unknown>): Msg =>
  ({ id: `m${++n}`, chat_id: "c1", role, is_user: role === "user", content, index_in_chat: n, swipe_id: 0, swipes: [content], metadata: metadata ?? {} } as unknown as Msg);

beforeAll(() => {
  (globalThis as any).spindle = {
    sendToFrontend: (m: unknown) => sent.push(m),
    log: { info: () => {}, error: (e: string) => { throw new Error(e); }, warn: () => {} },
    toast: { info: () => {}, success: () => {}, warning: (m: string) => { throw new Error(`toast: ${m}`); }, error: () => {} },
    userStorage: { getJson: async (p: string, o: any) => (p === "settings.json" ? { decider: "rules", sceneLines: "scripted" } : o?.fallback), setJson: async () => {} },
    macros: { resolve: async () => ({ text: "Sam" }) },
    chats: { get: async () => ({ id: "c1", character_id: "ch1" }) },
    characters: { get: async () => ({ id: "ch1", name: "Narrator", description: "", world_book_ids: ["wb1"] }) },
    world_books: { get: async () => book, entries: { list: async () => ({ data: entries, total: entries.length }) } },
    chat: {
      getMessages: async () => msgs.map((m) => structuredClone(m)),
      appendMessage: async (_c: string, m: { role: "user" | "assistant"; content: string; metadata?: Record<string, unknown> }) => { const x = msg(m.role, m.content, m.metadata); msgs.push(x); return x; },
      updateMessage: async (_c: string, id: string, patch: Record<string, unknown>) => { Object.assign(msgs.find((m) => m.id === id)!, patch); },
    },
  };
  msgs.push(msg("assistant", "You turn the corner and they're everywhere — the pack has you."));
});

const ruleset = () => loadRuleset([{ label: "warp-ruleset · all", content: JSON.stringify(RULES), order: 0 }]).ruleset!;

describe("a quiet encounter", () => {
  test("rounds grow one message; the end replaces it with a summary and keeps every round", async () => {
    // The story started it: recorded on the narrator's reply.
    (msgs[0].metadata as any).warp = { swipes: { "0": { v: 1, hints: [], events: [{ t: "enc", id: "cornered", foe: { resolve: 10 }, src: "trigger" }], at: 0 } } };
    expect(await playRound({ chatId: "c1", intent: { actionId: "talk", via: "choice" } })).toBe(true);
    expect(msgs).toHaveLength(2);
    const first = msgs[1].content;
    expect(first).toContain("You raise your hands and smile.");
    expect(first).toContain("They hesitate");
    expect(first).toContain("The Pack presses in close.");
    await playRound({ chatId: "c1", intent: { actionId: "talk", via: "choice" } });
    expect(msgs).toHaveLength(2); // the same message grew
    const log = encounterLogOf(msgs[1])!;
    expect(log.rounds).toHaveLength(2);
    // The same move twice isn't told with the same words.
    expect(log.rounds[1].text).not.toBe(log.rounds[0].text);
    expect(log.rounds[1].card.ended).toBeNull();
    await playRound({ chatId: "c1", intent: { actionId: "talk", via: "choice" } });
    const done = encounterLogOf(msgs[1])!;
    expect(done.status).toBe("ended");
    expect(done.ended).toEqual({ label: "You talked them down", loss: false });
    expect(msgs[1].content).toBe(done.summary!);
    expect(msgs[1].content).toContain("you talked them down after 3 rounds");
    expect(done.rounds).toHaveLength(3);
    // The state folds from the one message: the encounter is over.
    const { state } = foldPath(ruleset(), msgs);
    expect(state.encounter).toBeNull();
    expect(state.lastEncounter?.outcome).toBe("won");
    // With no encounter on, nothing more plays quietly.
    expect(await playRound({ chatId: "c1", intent: { actionId: "talk", via: "choice" } })).toBe(false);
  });
});

describe("telling it in the story's voice", () => {
  test("second or third person, from how the story has been told", () => {
    expect(storyPov("You walk in. You look around.", "Sam")).toBe("second");
    expect(storyPov("Sam walks in. Sam looks around, and Sam sighs.", "Sam")).toBe("third");
    expect(retell("*I raise my hands and catch my breath.*", "second", "Sam")).toBe("You raise your hands and catch your breath.");
    expect(retell("*I raise my hands.*", "third", "Sam")).toBe("Sam raises their hands.");
  });

  test("scripted rounds use the ruleset's hints and the foe's move", () => {
    const r = ruleset();
    const s = foldPath(r, [msgs[0]]).state;
    const line = scriptedRound({
      r, before: s, after: s, rec: { v: 1, hints: [], events: [], at: 0, check: { label: "Talk", style: "chance", dice: "d100", faces: [], roll: 1, add: 0, total: 1, target: 100, tier: "success", seed: "a" } },
      card: { move: "Talk them down", check: { label: "Talk", tier: "success", odds: 1, gear: [] }, foe: "Presses in close", changes: [], ended: null, round: 1 },
      action: r.encounters.cornered.actions.talk, player: "Sam", typed: null, story: "Sam turns the corner. Sam freezes.", earlier: [], foeAbout: "", seed: "a",
    });
    expect(line).toBe("Sam raises their hands and smiles. They hesitate, muttering among themselves. The Pack presses in close.");
  });
});

describe("a model-written round that doesn't finish", () => {
  const roundInput = () => {
    const r = ruleset();
    const s = foldPath(r, [msgs[0]]).state;
    return {
      r, before: s, after: s, rec: { v: 1 as const, hints: [], events: [], at: 0, check: { label: "Talk", style: "chance" as const, dice: "d100", faces: [], roll: 1, add: 0, total: 1, target: 100, tier: "success" as const, seed: "a" } },
      card: { move: "Talk them down", check: { label: "Talk", tier: "success", odds: 1, gear: [] }, foe: "Sniffs the air, tracking {{user}}'s scent", changes: [], ended: null, round: 1 },
      action: r.encounters.cornered.actions.talk, player: "Sam", typed: null, story: "Sam turns the corner. Sam freezes.", earlier: [], foeAbout: "", seed: "a",
    };
  };
  const reply = (content: string, finish_reason = "stop") => {
    const asked: any[] = [];
    (globalThis as any).spindle.generate = { quiet: async (req: any) => { asked.push(req); return { content, finish_reason }; } };
    return asked;
  };
  const settings = { sceneLines: "model" } as any;
  const scripted = "Sam raises their hands and smiles. They hesitate, muttering among themselves. The Pack sniffs the air, tracking Sam's scent.";

  test("a reply cut off by the token limit falls back to the scripted round", async () => {
    reply("Sam kicked over a nearby metal trash bin to trigger her", "length");
    expect(await writeRound(roundInput(), settings)).toBe(scripted);
  });

  test("a reply that trails off mid-sentence falls back too", async () => {
    reply("Sam kicked over a nearby metal trash bin to trigger her");
    expect(await writeRound(roundInput(), settings)).toBe(scripted);
  });

  test("a finished passage is kept; no token cap is sent and the foe's move names the player", async () => {
    const passage = "Sam lifts both hands, voice low and even, and the pack's leader falters. Then she draws a long breath, nostrils flaring, and steps closer on Sam's scent.";
    const asked = reply(passage);
    expect(await writeRound(roundInput(), settings)).toBe(passage);
    expect(asked[0].parameters.max_tokens).toBeUndefined();
    const prompt = asked[0].messages.map((m: any) => m.content).join(" ");
    expect(prompt).toContain("tracking Sam's scent");
    expect(prompt).not.toContain("{{user}}");
  });
});
