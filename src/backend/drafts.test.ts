import { describe, expect, test } from "bun:test";
import type { Answers, Decider, Questions } from "../engine/decide.js";
import { judgeDrafts, momentKey } from "./drafts.js";
import { nextPrompt } from "./inject.js";
import { initialState } from "../engine/state.js";
import { loadRuleset } from "../engine/loader.js";

const fake = (probabilities: Record<string, number>): Decider => ({
  id: "jev", canWrite: false,
  async ask(_s: unknown, q: Questions): Promise<Answers> {
    const best = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0];
    return Object.fromEntries(Object.keys(q).map((k) => [k, { type: "choice", choice: best, probabilities, confidence: probabilities[best] }]));
  },
});

describe("best of several drafts", () => {
  test("keeps the reply already shown unless another is clearly better", async () => {
    expect(await judgeDrafts(fake({ d0: 0.4, d1: 0.5 }), ["a", "b"], null, "")).toBe(0);
    expect(await judgeDrafts(fake({ d0: 0.2, d1: 0.1, d2: 0.7 }), ["a", "b", "c"], "Check: success", "")).toBe(2);
    expect(await judgeDrafts(fake({ d0: 1 }), ["only"], null, "")).toBe(0);
  });
});

describe("pre-written replies", () => {
  test("the next turn's prompt: last prompt without its Warp block, the reply, the new message and block — post-history stays last", () => {
    const prompt = [
      { role: "system" as const, content: "You are the narrator." },
      { role: "user" as const, content: "I open the door.\n\n<warp>\nold state\n</warp>" },
      { role: "system" as const, content: "Post-history instructions." },
    ];
    const out = nextPrompt(prompt, "The door creaks open.", "*I step inside.*", "new state");
    expect(out.map((m) => m.role)).toEqual(["system", "user", "assistant", "user", "system"]);
    expect(out[1].content).toBe("I open the door.");
    expect(out[2].content).toBe("The door creaks open.");
    expect(out[3].content).toContain("<warp>\nnew state\n</warp>");
    expect(out[4].content).toBe("Post-history instructions.");
  });

  test("a reply is only reused for exactly the moment it was written for", () => {
    const r = loadRuleset([{ label: "t", content: "name: X\nstats: { a: { start: 1 } }", order: 0 }]).ruleset!;
    const s = initialState(r);
    const msgs = [{ id: "m1", swipe_id: 0 }];
    const k = momentKey(msgs, s);
    expect(momentKey(msgs, s)).toBe(k);
    expect(momentKey([{ id: "m1", swipe_id: 1 }], s)).not.toBe(k);
    expect(momentKey(msgs, { ...s, stats: { a: 2 } })).not.toBe(k);
  });
});
