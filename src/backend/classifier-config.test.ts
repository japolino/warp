import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";
import { OPENROUTER_JEV } from "../shared/classifier-config.js";
import { renderSettings } from "../frontend/render.js";
import { getDecider, getTurnDecider, JevDecider, LlmDecider } from "./deciders.js";
import { patchSettings } from "./settings.js";
import type { Questions } from "../engine/decide.js";

let previousHost: unknown;
let calls: {url: string; body: any}[];
let keyReads: number;
let settingsWrites: any[];
let key: string | null;
const questions: Questions = {action: {type: "choice", instructions: "What?", criteria: {climb: "Climbing", none: "Nothing"}}};
const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
beforeEach(() => {
  previousHost = (globalThis as any).spindle;
  calls = []; keyReads = 0; settingsWrites = []; key = "offline-dummy";
  (globalThis as any).spindle = {
    enclave: {get: async () => {keyReads++; return key;}},
    cors: async (url: string, request: any) => {
      const body = JSON.parse(request.body);
      calls.push({url, body});
      return {status: 200, body: JSON.stringify({answers: {action: {type: "choice", choice: "climb", confidence: .9, probabilities: {climb: .9, none: .1}}}})};
    },
    log: {error() {}, info() {}}, toast: {warning() {}, info() {}},
    userStorage: {getJson: async () => ({helperConnectionId: "keep-helper"}), setJson: async (_: string, s: any) => settingsWrites.push(s)},
  };
});
afterEach(() => {(globalThis as any).spindle = previousHost;});

describe("classifier configuration (Jev speaks typed questions only)", () => {
  test("a pasted chat URL is refused locally, before any key or provider is touched", async () => {
    await expect(getDecider({...DEFAULT_SETTINGS, decider: "jev", jevUrl: CHAT_URL})).rejects.toThrow("chat endpoint");
    await expect(new JevDecider("offline-dummy", "typesafe/jev-1.13", `${CHAT_URL}/`).ask({}, questions)).rejects.toThrow("chat endpoint");
    expect(keyReads).toBe(0);
    expect(calls).toEqual([]);
  });

  test("a broken Jev setup falls back to the helper LLM, so play goes on", async () => {
    const d = await getTurnDecider({...DEFAULT_SETTINGS, decider: "jev", jevUrl: CHAT_URL});
    expect(d).toBeInstanceOf(LlmDecider);
    expect(d.id).toBe("llm");
  });

  test("Jev without a key on TypeSafe's endpoint uses the helper; a self-hosted URL needs no key", async () => {
    key = null;
    expect((await getDecider({...DEFAULT_SETTINGS, decider: "jev"})).id).toBe("llm");
    expect((await getDecider({...DEFAULT_SETTINGS, decider: "jev", jevUrl: "http://localhost:9000/v1/systemone"})).id).toBe("jev");
  });

  test("OpenRouter preset persists the working typed configuration and uses the exact endpoint", async () => {
    const settings = await patchSettings(OPENROUTER_JEV, "classifier-preset");
    expect(settingsWrites[0].helperConnectionId).toBe("keep-helper");
    const decider = await getDecider(settings);
    const result = await decider.ask({player_message: "I climb"}, questions);
    expect(result.action).toMatchObject({type: "choice", choice: "climb"});
    expect(calls[0]).toEqual({url: OPENROUTER_JEV.jevUrl, body: {model: OPENROUTER_JEV.jevModel, state: {player_message: "I climb"}, questions}});
  });

  test("settings show an incompatible endpoint and offer the OpenRouter preset", () => {
    const bad = renderSettings({...DEFAULT_SETTINGS, ...OPENROUTER_JEV, jevUrl: CHAT_URL}, null, [], false);
    expect(bad).toContain('role="alert"');
    expect(bad).toContain("data-jev-openrouter");
    const good = renderSettings({...DEFAULT_SETTINGS, ...OPENROUTER_JEV}, null, [], false);
    expect(good).not.toContain('role="alert"');
  });
});
