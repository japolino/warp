import { expect, test } from "bun:test";
import { getSettings, normalizeSettings, patchSettings } from "./settings.js";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";

test("legacy or malformed settings normalize before any runtime consumer reads them", () => {
  expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  const s = normalizeSettings({ enabled: "false", lines: "wrong", veils: [null, 7, " Fear ", "fear"], drafts: Infinity,
    prewrite: 999, autoConfidence: 0.2, askConfidence: 0.9, decider: "unknown", jevUrl: "file:///key" });
  expect(s).toMatchObject({ enabled: false, lines: [], veils: ["fear"], drafts: 1, prewrite: 4,
    autoConfidence: 0.2, askConfidence: 0.2, decider: "llm", jevUrl: DEFAULT_SETTINGS.jevUrl });
});

test("settings of removed parts (minigames, looks, sound, dating) are dropped when read and on the next save", async () => {
  const old = { minigames: "always", minigameLook: "scifi", look: "medieval", sfx: "all", sfxVolume: 0.2, fx: "off", themeDating: true, dateImages: true, sceneLines: "scripted" };
  expect(Object.keys(normalizeSettings(old)).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  const id = "removed-settings";
  let stored: any = { ...old, drafts: 2 };
  (globalThis as any).spindle = { userStorage: {
    getJson: async () => structuredClone(stored),
    setJson: async (_: string, value: any) => { stored = structuredClone(value); },
  } };
  expect((await getSettings(id)).drafts).toBe(2);
  await patchSettings({ prewrite: 1 }, id);
  expect(Object.keys(stored).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  expect(stored).toMatchObject({ drafts: 2, prewrite: 1 });
});

test("failed durable saves do not change runtime settings and concurrent patches merge", async () => {
  const id = "settings-durability";
  let stored: any = {}, fail = true;
  (globalThis as any).spindle = { userStorage: {
    getJson: async () => structuredClone(stored),
    setJson: async (_: string, value: any) => { if (fail) { fail = false; throw new Error("disk unavailable"); } stored = structuredClone(value); },
  } };
  await expect(patchSettings({ drafts: 3 }, id)).rejects.toThrow("disk unavailable");
  expect((await getSettings(id)).drafts).toBe(1);
  await Promise.all([patchSettings({ drafts: 2 }, id), patchSettings({ prewrite: 3 }, id)]);
  expect(stored).toMatchObject({ drafts: 2, prewrite: 3 });
  expect(await getSettings(id)).toEqual(stored);
});
