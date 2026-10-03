import { afterEach, beforeEach, expect, test } from "bun:test";
import { builderAnswer, builderOpen, builderStart } from "./builder.js";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";
import { renderSettings } from "../frontend/render.js";

let oldHost: unknown;
let seq = 0;
let id: string;
let stored: any;
let sent: any[];
let read: Record<string, unknown>;
let prompts: string[];
beforeEach(() => {
  oldHost = (globalThis as any).spindle;
  id = `onboarding-policy-${++seq}`;
  stored = null; sent = []; prompts = [];
  read = { summary: "A narrator for a haunted academy.", style: "adventure", cardType: "scenario", cast: [{ name: "Headmistress Vale", relation: "suspicious of {{user}}" }], followUps: [] };
  (globalThis as any).spindle = {
    chats: { get: async () => ({ character_id: id }) },
    characters: { get: async () => ({ id, name: "Hollow Academy", description: "{{char}} is the narrator of a haunted school.", world_book_ids: [] }) },
    userStorage: {
      getJson: async (path: string, opts: any) => path.startsWith("builder/") ? stored ?? opts.fallback : { ...DEFAULT_SETTINGS },
      setJson: async (_: string, value: unknown) => { stored = structuredClone(value); },
    },
    sendToFrontend: (value: unknown) => sent.push(structuredClone(value)),
    log: { error() {}, info() {} },
    generate: { quiet: async (req: any) => {
      const user = req.messages[1].content as string;
      prompts.push(user);
      if (user.includes('"followUps"')) return { content: JSON.stringify(read) };
      const start = user.indexOf("The template part (the starting point):\n");
      const ends = ["\n\nIds in the other parts", "\n\nThe current version"].map((m) => user.indexOf(m, start)).filter((i) => i > 0);
      return { content: start < 0 ? "{}" : user.slice(start + 40, ends.length ? Math.min(...ends) : undefined) };
    } },
  };
});
afterEach(() => { (globalThis as any).spindle = oldHost; });
const session = () => [...sent].reverse().find(m => m.type === "builder").session;

test("the builder asks Story or Adventure and three questions: no systems list, no removed parts, no extra rounds", async () => {
  await builderOpen(id, "build", id);
  await builderStart(id, { connectionId: "" }, id);
  const qs = session().rounds[0].questions;
  expect(qs.map((q: any) => q.id)).toEqual(["style", "tone", "difficulty", "pace"]);
  expect(qs[0].options.map((o: any) => o.id)).toEqual(["story", "adventure"]);
  const all = JSON.stringify(qs);
  for (const gone of ["systems", "quests", "minigames", "dungeon", "dating", "encounters", "relationship_depth"]) expect(all).not.toContain(gone);
  // The prompt offers only the two styles.
  expect(prompts[0]).not.toContain("universal");
  expect(prompts[0]).not.toContain("blank");
});

test("a scenario card is never added as a person; its cast is", async () => {
  await builderOpen(id, "build", id);
  await builderStart(id, { connectionId: "" }, id);
  await builderAnswer(id, {}, [], id);
  const s = session();
  expect(s.analysis.cardType).toBe("scenario");
  const people = s.parts.find((p: any) => p.label === "people").yaml;
  expect(people).not.toContain("Hollow Academy");
  const themed = prompts.find((p) => p.includes('Theme the "people" part'))!;
  expect(themed).toContain('"Hollow Academy" is the setting, NOT a person');
  expect(themed).toContain("Headmistress Vale: suspicious of {{user}}");
});

test("the player's pick on the start screen wins over the card read", async () => {
  await builderOpen(id, "build", id);
  await builderStart(id, { connectionId: "", base: "story" }, id);
  expect(session().base).toBe("story");
  expect(session().rounds[0].questions[0].default).toBe("story");
});

test("settings keep basics, with no removed parts", () => {
  const html = renderSettings(DEFAULT_SETTINGS, null, []);
  expect(html).toContain('data-setting="enabled"');
  for (const gone of ['data-setting="minigames"', 'data-setting="look"', 'data-setting="sfx"', 'data-setting="fx"', "themeDating", "dateImages",
    'data-setting="drafts"', 'data-setting="prewrite"', "advanced-generation", 'data-setting="consistencyCheck"']) expect(html).not.toContain(gone);
});
