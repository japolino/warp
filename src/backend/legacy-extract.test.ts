// The old free-text bookkeeper is kept test-only for QA's accuracy comparison; this keeps it from rotting.

import { expect, test } from "bun:test";
import { loadRuleset } from "../engine/loader.js";
import { applyEvent, cloneState, initialState } from "../engine/state.js";
import { legacyExtractParse, legacyExtractPrompt } from "./legacy-extract.js";
import { ADVENTURE_YAML } from "./test-host.js";

test("legacy extract: the prompt still lists what may change, and its JSON still becomes a Proposal", () => {
  const r = loadRuleset([{ label: "t", content: ADVENTURE_YAML, order: 0 }]).ruleset!;
  const s = cloneState(initialState(r));
  applyEvent(s, { t: "scene", who: "mira", here: true, src: "start" }, r);
  const p = legacyExtractPrompt(r, s, "I pay.", "Mira leaves. You hand over the coins.", "⏱ +10m")!;
  expect(p.system).toContain('"stats"');
  expect(p.system).toContain('"present"');
  expect(p.user).toContain("Already applied");
  const out = legacyExtractParse(r, s, { minutes: 20, present: [], trained: ["body"], place: "The quay" })!;
  expect(out).toEqual({ minutes: 20, scene: { mira: false }, train: ["body"], place: "The quay" });
});
