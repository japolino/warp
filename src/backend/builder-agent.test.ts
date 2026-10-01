// The designer's loop with a scripted model: it can't finish with gaps open,
// writing a section reports what the audit says now, and plain-text tool calls work.

import { describe, expect, test } from "bun:test";
import type { BuilderSession } from "../shared/protocol.js";
import { evaluate, runAgent, runTool, textCalls, type AgentCall } from "./builder-agent.js";

const WORLD = `items:
  spray: { name: Blocker Spray, desc: Hides your scent. }
start: { items: { spray: 1 } }
stats:
  stress: { kind: meter, start: 10, per_hour: -1 }
conditions: { scented: { label: Scented } }
triggers:
  smell: { when: "stress >= 50", do: { add_condition: [scented] } }
  calm: { when: "stress < 5", do: { remove_condition: [scented] } }
`;
const FIXED = WORLD.replace("spray: { name: Blocker Spray, desc: Hides your scent. }", "spray: { name: Blocker Spray, desc: Hides your scent., use: { label: Spray yourself, remove_condition: [scented], stress: -5 } }");

const session = (): BuilderSession => ({
  characterId: "c", characterName: "Test", mode: "deepen", step: "review", connectionId: "", creative: false, base: "",
  analysis: null, rounds: [], additions: [], parts: [{ label: "world", yaml: WORLD, status: "ok", issues: [] }], preview: null,
  request: null, changeSummary: null, busy: null, error: null, updatedAt: 0, waived: {},
});

describe("the designer's tools", () => {
  test("finish is refused while an audit gap is open; fixing it through write_section reports the change", () => {
    const s = session();
    expect(evaluate(s.parts).gaps.map((g) => g.id)).toContain("item-dead:spray");
    const refused = runTool(s, "finish", { summary: "done" }, false);
    expect(refused.finished).toBeUndefined();
    expect(refused.text).toContain("item-dead:spray");
    const wrote = runTool(s, "write_section", { label: "world", yaml: FIXED }, false);
    expect(wrote.text).toContain("Fixed: item-dead:spray");
    expect(runTool(s, "finish", { summary: "Gave the spray a use." }, false).finished).toBe("Gave the spray a use.");
  });

  test("a waiver needs a reason; strict mode counts thin spots too", () => {
    const s = session();
    expect(runTool(s, "waive", { id: "item-dead:spray", reason: "meh" }, false).text).toContain("real reason");
    runTool(s, "waive", { id: "item-dead:spray", reason: "It's flavour; the story uses it." }, false);
    expect(runTool(s, "finish", { summary: "ok" }, false).finished).toBe("ok");
    const strict = runTool(s, "finish", { summary: "ok" }, true);
    expect(strict.finished).toBeUndefined();
  });

  test("audit, preview, reference and simulation answer in plain words", () => {
    const s = session();
    expect(runTool(s, "audit", {}, false).text).toMatch(/Depth \d+\/100/);
    expect(runTool(s, "preview", {}, false).text).toContain("Inventory: Blocker Spray");
    expect(runTool(s, "read_reference", { topic: "items" }, false).text).toContain("Every item should DO something");
    expect(runTool(s, "simulate_encounter", { id: "nope" }, false).text).toContain('No encounter "nope"');
  });

  test("JSON tool calls in plain text are understood", () => {
    expect(textCalls('Sure.\n```json\n{"tool": "audit", "args": {}}\n```')).toEqual([{ name: "audit", args: {} }]);
    expect(textCalls('[{"tool":"check","args":{}},{"name":"read_section","arguments":{"label":"world"}}]')).toEqual([{ name: "check", args: {} }, { name: "read_section", args: { label: "world" } }]);
    expect(textCalls("no tools here")).toEqual([]);
  });
});

describe("the designer's loop", () => {
  test("works until finish is accepted — a premature finish sends it back to work", async () => {
    const s = session();
    const script: AgentCall[] = [
      { content: "", calls: [{ name: "finish", args: { summary: "too early" } }] },
      { content: "", calls: [{ name: "audit", args: {} }] },
      { content: '{"tool": "write_section", "args": {"label": "world", "yaml": ' + JSON.stringify(FIXED) + "}}", calls: [] },
      { content: "", calls: [{ name: "finish", args: { summary: "The spray now clears your scent." } }] },
    ];
    const seen: string[] = [];
    const log: string[] = [];
    const res = await runAgent(s, {
      brief: "A test card.", task: "Close the audit.", maxSteps: 10, strict: false,
      hooks: {
        llm: async (messages) => { seen.push(String(messages[messages.length - 1].content)); return script.shift()!; },
        progress: async (_label, line) => { if (line) log.push(line); },
      },
    });
    expect(res).toEqual({ finished: true, summary: "The spray now clears your scent.", steps: 4 });
    expect(seen[1]).toContain("Not finished");
    expect(log).toContain("write_section(world, " + FIXED.length + " chars)");
    expect(s.parts[0].changed).toBe(true);
  });

  test("stops after its step budget, or when the model stops using tools", async () => {
    const s = session();
    const idle = await runAgent(s, { brief: "", task: "x", maxSteps: 10, strict: false, hooks: { llm: async () => ({ content: "I think it's fine.", calls: [] }), progress: async () => {} } });
    expect(idle.finished).toBe(false);
    let n = 0;
    const busy = await runAgent(s, { brief: "", task: "x", maxSteps: 3, strict: false, hooks: { llm: async () => { n++; return { content: "", calls: [{ name: "check", args: {} }] }; }, progress: async () => {} } });
    expect(busy).toEqual({ finished: false, summary: "", steps: 3 });
    expect(n).toBe(3);
  });
});
