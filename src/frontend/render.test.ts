import { expect, test } from "bun:test";
import { normalizeRuleset } from "../engine/ruleset.js";
import { applyEvent, initialState } from "../engine/state.js";
import { buildChoices, buildHud } from "../engine/view.js";
import { renderChoices } from "./render.js";

test("encounter progress appears beside choices and disappears when it ends", () => {
  const r = normalizeRuleset({ encounters: { cornered: { name: "<Pack>", foe: { stats: { fervor: { label: "Fervor", start: 14, max: 14 } } }, actions: { talk: { label: "Talk" } } } } }).ruleset!;
  const s = initialState(r);
  applyEvent(s, { t: "enc", id: "cornered", foe: { fervor: 4 }, src: "manual" }, r);
  const options = { showOdds: true, hotkeys: true, busy: false };
  const html = renderChoices(buildChoices(r, s, { lines: [], veils: [] }), { ...options, encounter: buildHud(r, s).encounter });
  expect(html).toContain("Fervor"); expect(html).toContain("4 / 14"); expect(html).toContain("Round 1");
  expect(html).toContain("&lt;Pack&gt;"); expect(html).not.toContain("<Pack>");
  applyEvent(s, { t: "enc", id: null, outcome: "won", src: "action" }, r);
  expect(renderChoices([], { ...options, encounter: buildHud(r, s).encounter })).toBe("");
});
