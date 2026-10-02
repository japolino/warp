import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { LlmMessageDTO } from "lumiverse-spindle-types";
import type { BuilderSession } from "../shared/protocol.js";
import { emptyDraft, renderBuilder } from "../frontend/builder-ui.js";
import { evaluate } from "./builder-agent.js";
import { builderAnswer, builderCurrent, builderDeepen, builderImport, builderOpen, builderRefine, builderStart } from "./builder.js";

const STATS = `stats:
  stress: { kind: meter, start: 10, per_hour: -1 }
  mood: { kind: meter, start: 50, per_hour: -1 }
  stamina: { kind: meter, start: 50, per_hour: -1 }
  hunger: { kind: meter, start: 50, per_hour: 1 }
`;
const ACTIONS = `actions:
  rest: { label: Rest, when: "stamina >= 0 and hunger >= 0" }
`;
const FIXED_ACTIONS = ACTIONS.replace("stamina >= 0 and hunger >= 0", "stamina >= 0 and hunger >= 0 and mood >= 20");
const FIXED_RULES = `triggers:
  overwhelmed: { when: "stress >= 80", do: { stamina: -10 } }
`;
const FIX = [{ name: "write_section", args: { label: "actions", yaml: FIXED_ACTIONS } }, { name: "write_section", args: { label: "rules", yaml: FIXED_RULES } }];
const FINISH = [{ name: "finish", args: { summary: "Ready to play." } }];
const WAIVE = ["stress", "mood"].map(id => ({ name: "waive", args: { id: `stat-unread:${id}`, reason: `${id} is deliberately a narrative meter.` } }));

let sequence = 0;
let chatId: string;
let previousHost: unknown;
let stored: Record<string, any>;
let sent: any[];
let modelCalls: number;
let requests: LlmMessageDTO[][];
let connections: string[];
let reply: (request: any) => any;
const USER = "depth-tests";
const characterId = () => `depth-character-${chatId}`;
const last = (): BuilderSession => sent.filter(m => m.type === "builder" && m.session).at(-1).session;
const html = () => renderBuilder(last(), emptyDraft(), [], [], false);
const scripted = (calls: any[][]) => { reply = () => ({ content: "", tool_calls: calls.shift() ?? [] }); };

beforeEach(() => {
  previousHost = (globalThis as any).spindle;
  chatId = `depth-${++sequence}`;
  stored = {}; sent = []; requests = []; connections = []; modelCalls = 0;
  reply = () => ({ content: "The draft is fine." });
  (globalThis as any).spindle = {
    chats: { get: async () => ({ character_id: characterId() }) },
    characters: { get: async () => ({ id: characterId(), name: "Courier", description: "An adult courier managing workload, morale, stamina and hunger.", world_book_ids: [] }) },
    userStorage: { getJson: async (path: string, opts: any) => path in stored ? structuredClone(stored[path]) : opts?.fallback,
      setJson: async (path: string, value: unknown) => { stored[path] = structuredClone(value); } },
    sendToFrontend: (message: unknown) => sent.push(structuredClone(message)),
    generate: { quiet: async (request: any) => { modelCalls++; connections.push(request.connection_id); requests.push(structuredClone(request.messages)); return reply(request); } },
    log: { info: () => {}, error: () => {}, warn: () => {} },
  };
});
afterEach(() => { (globalThis as any).spindle = previousHost; });
const imported = async () => { await builderImport(chatId, STATS + ACTIONS, USER); };

describe("rulebook depth completion", () => {
  test("an 84-point import exposes both thin spots and a continuation button", async () => {
    await imported();
    expect(last().depth).toMatchObject({ before: 84, after: 84, open: 2 });
    expect(last().depth?.findings?.map(g => g.id)).toEqual(["stat-unread:stress", "stat-unread:mood"]);
    expect(html()).toContain("0 gaps · 2 thin spots · 0 deliberate exceptions");
    expect(html()).toContain('data-b="deepen"');
    expect(html()).not.toContain("every piece connects");
    expect(modelCalls).toBe(0);
  });

  test("Quick finishing does not hide remaining thin spots or imply completion", async () => {
    await imported(); scripted([FINISH]);
    await builderDeepen(chatId, { effort: "quick" }, USER);
    expect(last().designPass).toEqual({ reason: "finished", steps: 1, changed: false, resolved: 0 });
    expect(last().depth?.open).toBe(2);
    expect(html()).toContain('data-b="deepen"');
    expect(html()).toContain("No rules changed. No audit findings were resolved.");
    expect(html()).not.toContain("No audit findings remain.");
  });

  test("Thorough reports three idle calls accurately and keeps unresolved findings actionable", async () => {
    await imported();
    await builderDeepen(chatId, { effort: "thorough" }, USER);
    expect(modelCalls).toBe(3);
    expect(last().designPass).toEqual({ reason: "no_tools", steps: 3, changed: false, resolved: 0 });
    expect(last().log?.join("\n")).toContain("Stopped after 3 designer calls");
    expect(last().log?.join("\n")).not.toContain("40 steps");
    expect(html()).toContain('data-b="deepen"');
    expect(html()).toContain("No audit findings were resolved.");
    expect(stored[`builder/${characterId()}.json`].designPass).toEqual(last().designPass);
  });

  test("exhausting the real budget reports its limit and no progress", async () => {
    await imported(); reply = () => ({ tool_calls: [{ name: "check", args: {} }] });
    await builderDeepen(chatId, { effort: "thorough" }, USER);
    expect(modelCalls).toBe(40);
    expect(last().designPass?.reason).toBe("budget");
    expect(html()).toContain("40-call limit");
    expect(html()).toContain('data-b="deepen"');
    expect(html()).toContain("No audit findings were resolved.");
  });

  test("waivers remain visible as exceptions and keep their score penalties", async () => {
    await imported(); scripted([[...WAIVE, ...FINISH]]);
    await builderDeepen(chatId, { effort: "thorough" }, USER);
    expect(last().depth).toMatchObject({ after: 84, open: 0 });
    expect(html()).toContain("2 deliberate exceptions");
    expect(html()).toContain("They still lower depth.");
    expect(html()).toContain("stress is deliberately a narrative meter.");
    expect(html()).toContain('data-b="revisit-waivers"');
    expect(html()).not.toContain("No audit findings remain.");
  });

  test("reopening exceptions prevents immediately waiving them again, even with Quick selected", async () => {
    await imported(); scripted([[...WAIVE, ...FINISH]]);
    await builderDeepen(chatId, { effort: "thorough" }, USER);
    scripted([[...WAIVE, ...FINISH], FIX, FINISH]);
    await builderDeepen(chatId, { effort: "quick", revisitWaivers: true }, USER);
    const transcript = requests.flat().map(m => String(m.content)).join("\n");
    expect(transcript).toContain("cannot be waived again during this pass");
    expect(transcript).toContain("Not finished");
    expect(last().depth).toMatchObject({ before: 84, after: 100, open: 0, findings: [] });
    expect(last().waived).toEqual({});
    expect(last().designPass).toEqual({ reason: "finished", steps: 3, changed: true, resolved: 2 });
    expect(html()).toContain("No audit findings remain.");
    expect(html()).not.toContain('data-b="revisit-waivers"');
    expect(evaluate(last().parts).depth).toBe(100);
  });

  test("reopened exceptions stay actionable if the helper fails to fix them", async () => {
    await imported(); scripted([[...WAIVE, ...FINISH]]);
    await builderDeepen(chatId, { effort: "thorough" }, USER);
    scripted([[...WAIVE, ...FINISH]]);
    await builderDeepen(chatId, { effort: "quick", revisitWaivers: true }, USER);
    expect(last().depth).toMatchObject({ after: 84, open: 2 });
    expect(last().waived).toEqual({});
    expect(last().designPass?.reason).toBe("no_tools");
    expect(last().changeSummary).toBeNull();
    expect(html()).toContain('data-b="deepen"');
  });

  test("a provider failure keeps the draft and reports the attempted call", async () => {
    await imported(); reply = () => { throw new Error("Provider unavailable"); };
    await builderDeepen(chatId, { effort: "thorough" }, USER);
    expect(last().designPass).toEqual({ reason: "error", steps: 1, changed: false, resolved: 0 });
    expect(last().parts.map(p => p.yaml).join("\n")).toContain("stress:");
    expect(html()).toContain("The helper stopped with an error. Your draft is kept.");
    expect(html()).toContain('data-b="deepen"');
  });

  test("a fresh Thorough build also exposes unresolved findings after idle replies", async () => {
    reply = request => {
      if (request.tools) return { content: "The draft is fine." };
      const user = String(request.messages[1].content);
      if (user.includes('"suggestedTemplate"')) return { content: JSON.stringify({ suggestedTemplate: "blank", systems: ["needs"], followUps: [] }) };
      const part = /Write the "([^"]+)" section/.exec(user)?.[1];
      return { content: part === "stats" ? STATS : part === "actions" ? ACTIONS : "{}" };
    };
    await builderOpen(chatId, "build", USER);
    await builderStart(chatId, { connectionId: "test", creative: false, base: "blank", effort: "thorough" }, USER);
    await builderAnswer(chatId, { systems: ["needs"] }, [], false, USER);
    expect(last().step).toBe("review");
    expect(last().depth).toMatchObject({ after: 84, open: 2 });
    expect(last().designPass?.steps).toBe(3);
    expect(html()).toContain('data-b="deepen"');
  });

  test("recovery recalculates a legacy zero-open count and discards stale findings", async () => {
    stored[`builder/${characterId()}.json`] = {
      characterId: characterId(), characterName: "Courier", mode: "build", step: "review", parts: [{ label: "stats", yaml: STATS + ACTIONS }],
      depth: { before: 84, after: 100, open: 0, findings: [{ id: "obsolete", text: "Stale" }] }, waived: { obsolete: "A former exception." },
    };
    await builderCurrent(chatId, USER);
    expect(last().depth).toMatchObject({ before: 84, after: 84, open: 2 });
    expect(last().depth?.findings?.map(g => g.id)).toEqual(["stat-unread:stress", "stat-unread:mood"]);
    expect(last().waived).toEqual({});
    expect(html()).toContain('data-b="deepen"');
  });

  test("manual refinement refreshes depth and removes stale pass status and waivers", async () => {
    await imported(); scripted([[...WAIVE, ...FINISH]]);
    await builderDeepen(chatId, { effort: "thorough" }, USER);
    reply = () => ({ content: JSON.stringify({ summary: "Connected both meters.", parts: { actions: FIXED_ACTIONS, rules: FIXED_RULES } }) });
    await builderRefine(chatId, "Connect both meters", USER);
    expect(last().depth).toMatchObject({ after: 100, open: 0, findings: [] });
    expect(last().waived).toEqual({});
    expect(last().designPass).toBeNull();
    expect(html()).toContain("No audit findings remain.");
  });

  test("continuation retains the draft's chosen helper and effort", async () => {
    await imported(); scripted([FINISH]);
    await builderDeepen(chatId, { connectionId: "selected-helper", effort: "quick" }, USER);
    scripted([FINISH]);
    await builderDeepen(chatId, {}, USER);
    expect(connections).toEqual(["selected-helper", "selected-helper"]);
    expect(last().effort).toBe("quick");
  });

  test("findings remain actionable even when rounding displays 100, and busy buttons are disabled", async () => {
    await imported();
    const s = structuredClone(last());
    s.depth!.after = 100;
    s.busy = "Working";
    const view = renderBuilder(s, emptyDraft(), [], [], false);
    expect(view).toContain('data-b="deepen" disabled');
    expect(view).toContain("2 thin spots");
    expect(view).not.toContain("No audit findings remain.");
  });
});
