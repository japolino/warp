import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";
import { OPENROUTER_JEV } from "../shared/classifier-config.js";
import { renderSettings } from "../frontend/render.js";
import { ChatEndpointDecider, getDecider, JevDecider } from "./deciders.js";
import { patchSettings } from "./settings.js";
import type { Questions } from "../engine/decide.js";

let previousHost: unknown;
let calls: {url: string; body: any}[];
let keyReads: number;
let settingsWrites: any[];
const questions: Questions = {action: {type: "choice", instructions: "What?", criteria: {climb: "Climbing", none: "Nothing"}}};
beforeEach(() => {
  previousHost = (globalThis as any).spindle;
  calls = []; keyReads = 0; settingsWrites = [];
  (globalThis as any).spindle = {
    enclave: {get: async () => {keyReads++; return "offline-dummy";}},
    cors: async (url: string, request: any) => {
      const body = JSON.parse(request.body);
      calls.push({url, body});
      return {status: 200, body: JSON.stringify(body.questions
        ? {answers: {action: {type: "choice", choice: "climb", confidence: .9, probabilities: {climb: .9, none: .1}}}}
        : {choices: [{message: {content: JSON.stringify({action: {choice: "climb", confidence: .9}})}}]})};
    },
    userStorage: {getJson: async () => ({helperConnectionId: "keep-helper"}), setJson: async (_: string, s: any) => settingsWrites.push(s)},
  };
});
afterEach(() => {(globalThis as any).spindle = previousHost;});

describe("classifier protocol configuration", () => {
  test("Jev chat settings fail locally with instructions and never access a key or provider", async () => {
    await expect(getDecider({...DEFAULT_SETTINGS, ...OPENROUTER_JEV, jevFormat: "openai"})).rejects.toThrow("Typed questions");
    expect(keyReads).toBe(0);
    expect(calls).toEqual([]);
  });

  test("direct chat adapter rejects Jev model IDs before sending", async () => {
    for (const model of ["typesafe/jev-1.13", "~typesafe/jev-latest", "jev-latest"]) {
      await expect(new ChatEndpointDecider("offline-dummy", model, "https://openrouter.ai/api/v1").ask({}, questions)).rejects.toThrow("Typed questions");
    }
    expect(calls).toEqual([]);
  });

  test("changing only the URL to a decisions endpoint cannot append chat/completions", async () => {
    for (const url of [OPENROUTER_JEV.jevUrl, `${OPENROUTER_JEV.jevUrl}/`, "https://openrouter.ai/api/v1/systemone", `${OPENROUTER_JEV.jevUrl}/chat/completions`]) {
      await expect(new ChatEndpointDecider("offline-dummy", "some-model", url).ask({}, questions)).rejects.toThrow("Typed questions");
    }
    expect(calls).toEqual([]);
  });

  test("typed adapter rejects a pasted chat URL", async () => {
    await expect(new JevDecider("offline-dummy", "typesafe/jev-1.13", "https://openrouter.ai/api/v1/chat/completions/").ask({}, questions)).rejects.toThrow("chat endpoint");
    expect(calls).toEqual([]);
  });

  test("OpenRouter preset persists the working typed configuration and uses the exact endpoint", async () => {
    const settings = await patchSettings(OPENROUTER_JEV, "classifier-preset");
    expect(settingsWrites[0].helperConnectionId).toBe("keep-helper");
    const decider = await getDecider(settings);
    const result = await decider.ask({player_message: "I climb"}, questions);
    expect(result.action).toMatchObject({type: "choice", choice: "climb"});
    expect(calls[0]).toEqual({url: OPENROUTER_JEV.jevUrl, body: {model: OPENROUTER_JEV.jevModel, state: {player_message: "I climb"}, questions}});
  });

  test("ordinary text classifiers still use OpenAI chat requests", async () => {
    const decider = await getDecider({...DEFAULT_SETTINGS, decider: "jev", jevFormat: "openai", jevUrl: "http://localhost:8080/v1", jevModel: "local-model"});
    expect((await decider.ask({}, questions)).action).toMatchObject({type: "choice", choice: "climb"});
    expect(calls[0].url).toBe("http://localhost:8080/v1/chat/completions");
    expect(calls[0].body.messages).toHaveLength(2);
    expect(calls[0].body.questions).toBeUndefined();
  });

  test("settings show incompatible choices and offer the OpenRouter preset", () => {
    const bad = renderSettings({...DEFAULT_SETTINGS, ...OPENROUTER_JEV, jevFormat: "openai"}, null, [], false);
    expect(bad).toContain('role="alert"');
    expect(bad).toContain("Typed questions");
    expect(bad).toContain("data-jev-openrouter");
    const good = renderSettings({...DEFAULT_SETTINGS, ...OPENROUTER_JEV}, null, [], false);
    expect(good).not.toContain('role="alert"');
  });
});
