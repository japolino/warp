// In-chat systems taken out of Warp (family, being seen, the mind, money pressure, errands,
// the living world, companion lives, checkpoints, perks, the map, the wardrobe and body…) leave
// old rulesets and old chats working: each removed key gets one plain warning and is ignored,
// formula names of removed parts read as 0, and the events they recorded are skipped.
// The old version is on the `legacy` branch.

import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { lintRuleset } from "./lint.js";
import { foldEvents, initialState, type WarpEvent } from "./state.js";
import { buildChoices, buildHud, stateDigest } from "./view.js";
import { resolveTurn } from "./resolve.js";

const OLD = `
name: Old life sim
stats:
  coin: { kind: money, start: 50 }
  mood: { kind: meter, start: 50 }
relationships:
  stats: { trust: { start: 10 } }
  people: { robin: { name: Robin, age: 30 } }
lineage:
  pregnancy: { weeks: 36 }
observers:
  when: "exposed > 0"
  reactions: { interested: { rel: { target: { trust: +4 } } } }
actions:
  night:
    label: A night with Robin
    effects: { conceive: { with: robin, chance: 100 }, mood: +1 }
triggers:
  family: { when: "pregnant or children() > 0 or pregnancy_weeks > 2", do: { coin: +1 } }
  famous: { when: "seen_by('robin') or fame() > 2", do: { coin: +1 } }
`;

const load = () => loadRuleset([{ label: "t", content: OLD, order: 0 }]);
const removedWhere = () => load().issues.filter((i) => i.message.includes("was removed from Warp")).map((i) => i.where).sort();

describe("removed in-chat systems", () => {
  test("each removed key or effect gets one plain warning and is ignored", () => {
    const { ruleset: r, issues } = load();
    expect(r).not.toBeNull();
    expect(removedWhere()).toEqual(["Actions › night › effects › conceive", "Lineage", "Observers"].sort());
    for (const i of issues.filter((x) => x.message.includes("was removed from Warp"))) {
      expect(i.level).toBe("warning");
      expect(i.message).toContain("`legacy` branch");
    }
    for (const k of ["lineage", "observers"]) expect(Object.keys(r!)).not.toContain(k);
    expect(JSON.stringify(r!.actions.night)).not.toContain("conceive");
  });

  test("formula names of removed parts read as 0, and the lint says why", () => {
    const r = load().ruleset!;
    const msgs = lintRuleset(r).map((i) => i.message);
    const gone = (name: string, what: string) => msgs.some((m) => m.includes(`"${name}" (${what}) was removed from Warp`));
    for (const name of ["pregnant", "children()", "pregnancy_weeks"]) expect(gone(name, "family and pregnancy")).toBe(true);
    for (const name of ["seen_by()", "fame()"]) expect(gone(name, "being seen")).toBe(true);
    const rec = resolveTurn(r, initialState(r), { actionId: "night", via: "choice" }, { seed: "x" });
    expect(rec.events.some((e) => (e.t as string) === "conceive")).toBe(false);
    expect(rec.events.some((e) => e.t === "stat" && e.id === "mood")).toBe(true);
  });

  test("an old chat with events of removed systems still folds", () => {
    const r = load().ruleset!;
    const old = [
      { t: "conceive", carrier: "player", with: "robin", src: "action" },
      { t: "preg_stage", n: 1, src: "world" },
      { t: "birth", id: "child_1", kin: { name: "Ada", sex: "girl", born: 0, parents: ["player", "robin"], body: {}, joined: false }, src: "world" },
      { t: "kin_join", id: "child_1", src: "world" },
      { t: "seen", who: "robin", what: "exposed: top", where: "Park", src: "world" },
      { t: "stat", id: "coin", d: 5, src: "action" },
    ] as unknown as WarpEvent[];
    const s = foldEvents(r, [old]);
    expect(s.stats.coin).toBe(55);
    expect(Object.keys(s)).not.toContain("pregnancy");
    for (const k of ["kin", "seen"]) expect(Object.keys(s)).not.toContain(k);
    expect(s.people.child_1).toBeUndefined();
    expect(buildHud(r, s)).toBeTruthy();
    expect(buildChoices(r, s, { lines: [], veils: [] }).length).toBeGreaterThan(0);
    expect(stateDigest(r, s)).not.toContain("pregnant");
  });
});
