import { expect, test } from "bun:test";
import { getSettings, normalizeSettings, patchSettings } from "./settings.js";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";

test("legacy or malformed settings normalize before any runtime consumer reads them", () => {
  expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  const s = normalizeSettings({ enabled: "false", lines: "wrong", veils: [null, 7, " Fear ", "fear"], drafts: Infinity,
    prewrite: 999, autoConfidence: 1.5, askConfidence: 0.9, decider: "unknown", jevUrl: "file:///key", jevModel: "  " });
  expect(s).toMatchObject({ enabled: false, lines: [], veils: ["fear"], decider: "llm", jevUrl: DEFAULT_SETTINGS.jevUrl, jevModel: DEFAULT_SETTINGS.jevModel });
  for (const gone of ["drafts", "prewrite", "askConfidence"]) expect(s).not.toHaveProperty(gone);
});

test("two providers: Helper and Jev; the old rules provider reads as the helper", () => {
  expect(normalizeSettings({ decider: "jev" }).decider).toBe("jev");
  expect(normalizeSettings({ decider: "rules" }).decider).toBe("llm");
});

test("settings the UI stopped showing are dropped from old saves", () => {
  const s = normalizeSettings({ freeTextChecks: false, narratorUpdates: false, storyQuests: false, sayOutcome: true, showDiceChips: false, autoConfidence: 0.4, jevFormat: "openai", showOdds: false });
  for (const k of ["freeTextChecks", "narratorUpdates", "storyQuests", "sayOutcome", "showDiceChips", "autoConfidence", "jevFormat"]) expect(s).not.toHaveProperty(k);
  expect(s.showOdds).toBe(false);
  expect(Object.keys(s).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
});

test("settings of removed parts (minigames, looks, sound, dating, drafts, consistency check) are dropped when read and on the next save", async () => {
  const old = { minigames: "always", minigameLook: "scifi", look: "medieval", sfx: "all", sfxVolume: 0.2, fx: "off", themeDating: true, dateImages: true, sceneLines: "scripted", drafts: 3, prewrite: 2, consistencyCheck: true };
  expect(Object.keys(normalizeSettings(old)).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  const id = "removed-settings";
  let stored: any = { ...old, showOdds: false };
  (globalThis as any).spindle = { userStorage: {
    getJson: async () => structuredClone(stored),
    setJson: async (_: string, value: any) => { stored = structuredClone(value); },
  } };
  expect((await getSettings(id)).showOdds).toBe(false);
  await patchSettings({ showChanges: false }, id);
  expect(Object.keys(stored).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  expect(stored).toMatchObject({ showOdds: false, showChanges: false });
});

test("failed durable saves do not change runtime settings and concurrent patches merge", async () => {
  const id = "settings-durability";
  let stored: any = {}, fail = true;
  (globalThis as any).spindle = { userStorage: {
    getJson: async () => structuredClone(stored),
    setJson: async (_: string, value: any) => { if (fail) { fail = false; throw new Error("disk unavailable"); } stored = structuredClone(value); },
  } };
  await expect(patchSettings({ showOdds: false }, id)).rejects.toThrow("disk unavailable");
  expect((await getSettings(id)).showOdds).toBe(true);
  await Promise.all([patchSettings({ showOdds: false }, id), patchSettings({ showChanges: false }, id)]);
  expect(stored).toMatchObject({ showOdds: false, showChanges: false });
  expect(await getSettings(id)).toEqual(stored);
});

test("number keys can't be switched off any more: an old saved hotkeys: false reads as on", () => {
  expect(normalizeSettings({ hotkeys: false }).hotkeys).toBe(true);
  expect(normalizeSettings({ hotkeys: "false" }).hotkeys).toBe(true);
});
