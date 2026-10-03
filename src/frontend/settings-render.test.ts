// Settings: 9 visible controls (CORE-DESIGN §4.7); everything else keeps a fixed default.

import { describe, expect, test } from "bun:test";
import { renderSettings, renderStyleSwitch, templateFor } from "./render-settings.js";
import { renderTemplatePicker, renderWritingRules } from "./render.js";
import { renderBuilderCta } from "./builder-ui.js";
import { TEMPLATES } from "../engine/templates/index.js";
import { DEFAULT_SETTINGS, type RulesetStatus } from "../shared/protocol.js";

const templates = [{ id: "story", name: "Story", blurb: "" }, { id: "adventure", name: "Adventure", blurb: "" }];
const status = (o: Partial<RulesetStatus> = {}): RulesetStatus => ({ state: "ok", name: "Adventure", source: "warp-ruleset", issues: [], characterName: "Mira", cardKind: "character", tags: ["romance"], style: "adventure", template: "adventure", ...o });
const all = (html: string, re: RegExp) => [...html.matchAll(re)].map((m) => m[1]);

describe("the 9 settings", () => {
  const html = renderSettings(DEFAULT_SETTINGS, status(), [{ id: "fast", name: "Fast <helper>" }], false, templates);

  test("each control is there, once", () => {
    // 1 on/off, 3 helper, 4 decision model, 5-6 choices and odds, 8 what changed (checkbox / select fields)
    expect(all(html, /data-setting="(\w+)"/g)).toEqual(["enabled", "helperConnectionId", "decider", "showChoices", "showOdds", "showChanges"]);
    // 2 Story / Adventure
    expect(all(html, /data-style="(\w+)"/g)).toEqual(["story", "adventure"]);
    // 7 Casual / Ironman
    expect(all(html, /data-setting-bool="(\w+)"/g)).toEqual(["swipesReroll", "swipesReroll"]);
    // 9 Lines & Veils
    expect(html).toContain('data-tag="romance"');
    expect(html).toContain("data-newtag");
  });

  test("the decision model is Helper or Jev; the rest is gone", () => {
    expect(all(html, /<option value="(\w*)"/g)).toEqual(["", "fast", "llm", "jev"]);
    for (const gone of ["freeTextChecks", "narratorUpdates", "storyQuests", "storyGoals", "sayOutcome", "showDiceChips", "hotkeys", "autoConfidence", "jevFormat", 'value="rules"', "minigames", "drafts"]) {
      expect(html).not.toContain(gone);
    }
    expect(html).toContain("Jev makes typed play faster and cheaper");
    expect(html).toContain("Fast &lt;helper&gt;");
  });

  test("Jev's key and the Advanced fold show only with Jev", () => {
    expect(html).not.toContain("data-jevkey");
    const jev = renderSettings({ ...DEFAULT_SETTINGS, decider: "jev" }, status(), [], true, templates);
    expect(jev).toContain("data-jevkey");
    expect(jev).toContain("Key stored encrypted");
    expect(jev).toContain('data-setting="jevUrl"');
    expect(jev).toContain('data-setting="jevModel"');
    expect(jev).toContain("data-jev-openrouter");
    expect(jev).not.toContain('role="alert"');
    const chatUrl = renderSettings({ ...DEFAULT_SETTINGS, decider: "jev", jevUrl: "https://openrouter.ai/api/v1/chat/completions" }, status(), [], false, templates);
    expect(chatUrl).toContain('role="alert"');
  });

  test("Casual / Ironman shows which one is on", () => {
    expect(html).toMatch(/data-v="1" role="radio" aria-pressed="true"[^>]*>Casual/);
    const iron = renderSettings({ ...DEFAULT_SETTINGS, swipesReroll: false }, status(), [], false, templates);
    expect(iron).toMatch(/data-v="0" role="radio" aria-pressed="true"[^>]*>Ironman/);
    expect(iron).toContain("a swipe gives the same roll");
  });
});

describe("Story / Adventure", () => {
  test("no rules yet: both install their template", () => {
    const html = renderStyleSwitch(status({ state: "none", style: undefined, template: undefined }), templates);
    expect(all(html, /data-style-mode="(\w+)" data-template="(\w+)"/g)).toEqual(["install", "install"]);
    expect(html).not.toContain('aria-pressed="true"');
  });

  test("a template install: the current one is on, the other switches after a confirm", () => {
    const html = renderStyleSwitch(status(), templates);
    expect(html).toMatch(/data-style="story" data-style-mode="switch" data-template="story"/);
    expect(html).toMatch(/data-style="adventure" role="radio" aria-pressed="true"/);
    expect(html).toContain("keeps your people");
  });

  test("a ruleset written for the card can't be switched here", () => {
    const html = renderStyleSwitch(status({ template: null }), templates);
    expect(html).not.toContain("data-style-mode");
    expect(html).toContain("set `style:` in the ruleset");
    expect(renderStyleSwitch(null, templates)).not.toContain("data-style-mode");
  });

  test("the template ids are the style names", () => {
    expect(templateFor("story", templates)?.id).toBe("story");
    expect(templateFor("adventure", templates)?.id).toBe("adventure");
    expect(TEMPLATES.map((t) => t.id)).toEqual(["story", "adventure"]);
  });

  test("first install: always the two cards Story and Adventure, none highlighted, then Build with AI", () => {
    const html = renderTemplatePicker(TEMPLATES.map(({ id, name, blurb }) => ({ id, name, blurb })), { name: "Mira", track: true });
    expect(all(html, /data-template="([\w_]+)"/g)).toEqual(["story", "adventure", "__ai"]);
    expect(html).toContain("Story (no dice)");
    expect(html).toContain("Adventure (dice)");
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).not.toMatch(/warp-template[^"]*(?:selected|primary)/);
  });
});

describe("the Ruleset tab", () => {
  test("Build and Refine with AI stay; whole-rulebook import and export moved to Warp Studio, and the tab says so", () => {
    const cta = renderBuilderCta(true, true);
    expect(cta).toContain('data-b="open-build"');
    expect(cta).toContain('data-b="open-refine"');
    for (const gone of ["data-import-text", "data-import-file", 'data-b="import"', 'data-b="export"', "Export this rulebook"]) expect(cta).not.toContain(gone);
    const help = renderWritingRules();
    expect(help).toContain("Deep passes, checks, playtest and import/export: ");
    expect(help).toContain("Warp Studio");
    expect(help).toContain("https://github.com/japolino/warp-studio");
  });
});
