// Play each template for a few hundred random turns and check invariants.

import { describe, expect, test } from "bun:test";
import { seededRng } from "./dice.js";
import { loadRuleset } from "./loader.js";
import { applyProposal, availableChoices, resolveTurnFull, TRAVEL_PREFIX, travelTargets } from "./resolve.js";
import { applyEvent, cloneState, initialState, statMax } from "./state.js";
import { TEMPLATES } from "./templates/index.js";
import { buildChoices, buildHud, buildMap, stateDigest } from "./view.js";

for (const t of TEMPLATES) {
  describe(`fuzz: ${t.id}`, () => {
    test("300 random turns keep the game consistent", () => {
      const r = loadRuleset(t.parts.map((p, i) => ({ label: p.label, content: p.yaml, order: i }))).ruleset!;
      let s = initialState(r);
      const rng = seededRng(`fuzz:${t.id}`);
      let encounters = 0;
      for (let turn = 0; turn < 300; turn++) {
        const choices = [
          ...availableChoices(r, s).map((c) => c.id),
          ...travelTargets(r, s).map((x) => `${TRAVEL_PREFIX}${x}`),
        ];
        const pick = choices.length && rng() < 0.9 ? choices[Math.floor(rng() * choices.length)] : null;
        const { record } = resolveTurnFull(r, s, pick ? { actionId: pick, via: "choice" } : null, { seed: `${t.id}:${turn}` });
        const next = cloneState(s);
        for (const e of record.events) applyEvent(next, e, r);
        // Occasionally the narrator nudges things.
        if (rng() < 0.3) for (const e of applyProposal(r, next, { minutes: Math.floor(rng() * 90), stats: { stress: 5 } })) applyEvent(next, e, r);
        if (!s.encounter && next.encounter) encounters++;
        s = next;

        for (const id of r.statOrder) {
          const def = r.stats[id];
          const v = s.stats[id];
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(def.min - 1e-9);
          expect(v).toBeLessThanOrEqual(statMax(r, def, s) + 1e-9);
        }
        for (const id of Object.values(s.worn)) expect(s.items[id] ?? 0).toBeGreaterThan(0);
        if (s.encounter) expect(r.encounters[s.encounter.id]).toBeDefined();
        // Views never throw.
        buildHud(r, s);
        buildChoices(r, s, { lines: [], veils: [] });
        buildMap(r, s);
        expect(stateDigest(r, s).length).toBeGreaterThan(0);
      }
      expect(s.turn).toBe(300);
      void encounters;
    });
  });
}
