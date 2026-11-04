import { afterEach, beforeEach, expect, test } from "bun:test";
import { helperReasoning } from "./helpers.js";
import { makeHost } from "./test-host.js";

const h = makeHost("helper-policy-test", false);
let previous: unknown;
beforeEach(() => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; });
afterEach(() => { (globalThis as any).spindle = previous; });

test("the selected Google Flash 3 helper gets an explicit low request without mutating profiles", async () => {
  const profiles = Object.freeze([
    Object.freeze({ id: "default", provider: "google_vertex", model: "gemini-3-pro", is_default: true }),
    Object.freeze({ id: "helper", provider: "google_vertex", model: "gemini-3.8-flash", is_default: false }),
  ]);
  h.fake.connections.list = async () => profiles;
  expect(await helperReasoning("helper", h.userId)).toEqual({ reasoning: { source: "custom", apiReasoning: true, effort: "low" }, parameters: { thinkingConfig: { thinkingLevel: "low" } } });
  expect(await helperReasoning(undefined, h.userId)).toEqual({ reasoning: { source: "off" }, parameters: {} });
  expect(profiles[1].model).toBe("gemini-3.8-flash");
});

test("unrecognized providers/models and missing selections retain the portable off policy", async () => {
  for (const [provider, model] of [["custom", "gemini-3.8-flash"], ["google", "gemini-2.5-flash"], ["google_vertex", "gemini-3-pro"], ["google", "gemini-4-flash"]]) {
    h.fake.connections.list = async () => [{ id: "helper", provider, model, is_default: true }];
    expect((await helperReasoning("helper", h.userId)).reasoning.source).toBe("off");
    expect((await helperReasoning("missing", h.userId)).parameters).toEqual({});
  }
});

test("an unavailable profile metadata API neither disables the helper nor requests new access", async () => {
  h.fake.connections.list = async () => { throw new Error("Denied"); };
  expect(await helperReasoning("helper", h.userId)).toEqual({ reasoning: { source: "off" }, parameters: {} });
  expect(h.counts.helper).toBe(0);
});
