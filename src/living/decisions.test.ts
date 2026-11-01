import { expect, test } from "bun:test";
import { readDecision } from "./decisions.js";
import { resolveAttempt } from "./world.js";

test("native profile is scoped and supplies circumstances, never the random result", async () => {
  const previous = (globalThis as any).spindle;
  let input: any;
  (globalThis as any).spindle = { decisions: { evaluate: async (value: any) => { input = value; return { answers: {
    roll: { type: "choice", choice: "contested" }, tier: { type: "choice", choice: "outmatched" }, cost: { type: "choice", choice: "injury" },
  } }; } } };
  try {
    const read = await readDecision("saved-profile", "An armed guard blocks the door", "I wrestle the guard", new AbortController().signal, "owner");
    expect(input.connection_id).toBe("saved-profile"); expect(input.userId).toBe("owner");
    expect(read).not.toHaveProperty("result");
    const outcomes = new Set(Array.from({ length: 100 }, (_, i) => resolveAttempt(read, `seed-${i}`)?.result));
    expect(outcomes).toEqual(new Set(["clean", "mixed", "setback"]));
    expect(resolveAttempt(read, "repeat")).toEqual(resolveAttempt(read, "repeat"));
  } finally { (globalThis as any).spindle = previous; }
});

test("native ordinary action skips a roll and malformed results permit helper fallback", async () => {
  const previous = (globalThis as any).spindle;
  let answers: any = { roll: { type: "choice", choice: "none" } };
  (globalThis as any).spindle = { decisions: { evaluate: async () => ({ answers }) } };
  try {
    expect(await readDecision("p", "scene", "I say hello", new AbortController().signal)).toEqual({ risky: false, contested: false });
    answers = {};
    await expect(readDecision("p", "scene", "attempt", new AbortController().signal)).rejects.toThrow("incomplete");
  } finally { (globalThis as any).spindle = previous; }
});

test("native provider ignoring cancellation cannot hold the narrator indefinitely", async () => {
  const previous = (globalThis as any).spindle;
  (globalThis as any).spindle = { decisions: { evaluate: () => new Promise(() => {}) } };
  try { await expect(readDecision("p", "scene", "attempt", new AbortController().signal, "owner", 10)).rejects.toThrow("cancelled"); }
  finally { (globalThis as any).spindle = previous; }
});
