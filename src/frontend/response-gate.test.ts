import { expect, test } from "bun:test";
import { ACT_GUARD_MS, acceptsResponse, mayAct } from "./response-gate.js";
import type { BackendToFrontend } from "../shared/protocol.js";
const state = (chatId: string | null, revision: number) => ({ type: "state", chatId, revision } as BackendToFrontend);
test("responses from a previous chat or home screen cannot replace the active view", () => {
  expect(acceptsResponse(state("a", 5), "b")).toBe(false);
  expect(acceptsResponse(state(null, 5), "b")).toBe(false);
  expect(acceptsResponse(state("a", 5), null)).toBe(false);
  expect(acceptsResponse({ type: "busy", chatId: "a", busy: true }, "b")).toBe(false);
  expect(acceptsResponse({ type: "builder", chatId: "a", session: null }, "b")).toBe(false);
  expect(acceptsResponse(state(null, 5), null)).toBe(true);
});
test("a slow earlier refresh cannot roll back the same chat", () => {
  const newer = { chatId: "a", revision: 9 };
  expect(acceptsResponse(state("a", 8), "a", newer)).toBe(false);
  expect(acceptsResponse(state("a", 10), "a", newer)).toBe(true);
});
test("a choice is never refused because the backend is busy; only a double click waits for its answer", () => {
  expect(mayAct(null, "a", 1000)).toBe(true);
  const sent = { chatId: "a", at: 1000 };
  expect(mayAct(sent, "a", 1200)).toBe(false);
  expect(mayAct(sent, "b", 1200)).toBe(true);
  expect(mayAct(sent, "a", 1000 + ACT_GUARD_MS)).toBe(true);
});
