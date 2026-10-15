import { expect, test } from "bun:test";
import { JevDecider } from "./deciders.js";
const q = { check: { type: "noul" as const, instructions: "Yes?" } };

test("classifier cancellation returns promptly and sends the proxy only cloneable options", async () => {
  let reject!: (e: Error) => void;
  (globalThis as any).spindle = { cors: (_url: string, init: unknown) => { structuredClone(init); return new Promise((_, no) => { reject = no; }); } };
  const controller = new AbortController();
  const promise = new JevDecider("test", "test", "https://classifier.invalid").ask({}, q, { signal: controller.signal, timeoutMs: 1000 });
  controller.abort(new Error("player stopped"));
  await expect(promise).rejects.toThrow("player stopped");
  reject(new Error("late proxy failure"));
});

test("retry backoff and transport share one total deadline", async () => {
  let calls = 0;
  (globalThis as any).spindle = { cors: async () => { calls++; return { status: 503, body: "busy" }; } };
  const start = performance.now();
  await expect(new JevDecider("test", "test", "https://classifier.invalid").ask({}, q, { timeoutMs: 25 })).rejects.toThrow("timed out");
  expect(calls).toBe(1);
  expect(performance.now() - start).toBeLessThan(250);
});
