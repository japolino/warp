import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { foldEvents, initialState, makeEnv, type GameState } from "./state.js";
import { applyProposal, resolveTurn } from "./resolve.js";
import { evaluate } from "./expr.js";
import { buildHud, stateDigest } from "./view.js";

const r = loadRuleset([{ label: "t", content: `
name: Body
body:
  parts:
    hair: { color: brown, length: long }
    ears: human
    chest: { size: average }
  hidden_by: { chest: [top] }
  transforms:
    fox_charm:
      label: Fox charm
      chance: 100
      stages:
        - { set: { ears: { type: fox } }, text: "Fox ears push up through {{user}}'s hair." }
        - { set: { tail: { type: fox } } }
items:
  shirt: { name: Shirt, slot: top }
  charm: Fox charm
wardrobe: { slots: [top, bottom], cover: [top, bottom] }
actions:
  wear_charm: { label: Wear the charm, effects: { transform: { fox_charm: 1 } } }
  dye: { label: Dye your hair, effects: { body: { hair: { color: blue } } } }
`, order: 0 }]).ruleset!;

const act = (s: GameState, id: string) => {
  const rec = resolveTurn(r, s, { actionId: id, via: "choice" }, { seed: "b" });
  return { s: foldEvents(r, [rec.events], s), rec };
};

describe("the open body", () => {
  test("parts and traits start from the ruleset and show to the narrator", () => {
    const s = initialState(r);
    expect(s.body.ears).toEqual({ type: "human" });
    expect(stateDigest(r, s)).toContain("hair — color brown, length long");
    expect(evaluate("body('hair', 'color') == 'brown'", makeEnv(r, s))).toBe(true);
  });

  test("transformations advance a stage per use, and stop at the end", () => {
    let t = act(initialState(r), "wear_charm");
    expect(t.s.body.ears.type).toBe("fox");
    expect(t.rec.hints.join(" ")).toContain("Fox ears");
    t = act(t.s, "wear_charm");
    expect(t.s.body.tail).toEqual({ type: "fox" });
    t = act(t.s, "wear_charm");
    expect(t.s.tf.fox_charm).toBe(2);
    expect(evaluate("transformed('fox_charm')", makeEnv(r, t.s))).toBe(2);
    expect(buildHud(r, t.s).transforms).toEqual([{ label: "Fox charm", stage: 2, of: 2 }]);
  });

  test("clothing decides what others can see", () => {
    let s = foldEvents(r, [[{ t: "wear", slot: "top", item: "shirt", src: "manual" }]], initialState(r));
    expect(stateDigest(r, s)).toContain("not visible to others: chest");
    s = foldEvents(r, [[{ t: "wear", slot: "top", item: null, src: "manual" }]], s);
    expect(stateDigest(r, s)).not.toContain("not visible");
  });

  test("the story can change the body within limits", () => {
    const s = initialState(r);
    const events = applyProposal(r, s, { body: { Hair: { color: "silver" }, horns: { type: "small ram horns" }, ears: { type: null as unknown as string } } });
    const after = foldEvents(r, [events], s);
    expect(after.body.hair.color).toBe("silver");
    expect(after.body.horns.type).toBe("small ram horns");
    expect(after.body.ears).toBeUndefined();
    const closed = { ...r, body: { ...r.body, open: false } };
    expect(foldEvents(closed, [applyProposal(closed, s, { body: { wings: { type: "bat" } } })], s).body.wings).toBeUndefined();
  });
});
