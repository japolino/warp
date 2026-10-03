import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { initialState } from "./state.js";
import { resolveTurn } from "./resolve.js";
import { buildChoices } from "./view.js";
import { renderChoices } from "../frontend/render.js";

function book(mode = "hard", cost = 0, resistance = "{ control: 10 }") {
  return loadRuleset([{ label: "mind counterplay", order: 0, content: `
name: Counterplay
stats:
  control: { kind: meter, start: 20 }
  bruises: { start: 0 }
actions:
  punch: { label: Punch, tags: [violence], cost: { control: -${cost} }, check: { chance: 100 }, success: { bruises: +1 }, fail: { bruises: +5 } }
  talk: { label: Talk }
  flee: { label: Flee, effects: { bruises: +2 } }
mind:
  overrides_mode: ${mode}
  overrides:
    freeze: { on: [violence], do: fail, cause: Panic, resist_cost: ${resistance} }
    urge: { on: [talk], do: flee, cause: Fear, resist_cost: ${resistance} }
` }]).ruleset!;
}
const turn = (r: ReturnType<typeof book>, id: string, resist?: string, via: "choice" | "adjudicator" = "choice") => resolveTurn(r, initialState(r), { actionId: id, via, ...(resist ? { params: { mind_resist: resist } } : {}) }, { seed: "counter" });

describe("opt-in mind counterplay", () => {
  test("legacy hard veto and redirect unchanged without opt-in", () => {
    const r = book();
    expect(turn(r, "punch").mind?.kind).toBe("fail");
    expect(turn(r, "punch").check).toBeUndefined();
    expect(turn(r, "talk").action?.id).toBe("flee");
  });
  test("soft mode preserves checks and the chosen action without charging resistance", () => {
    const r = book("soft");
    expect(turn(r, "punch", "freeze").check).toBeDefined();
    expect(turn(r, "talk").action?.id).toBe("talk");
    expect(turn(r, "punch", "freeze").events.some((e) => e.t === "stat" && e.id === "control" && e.d === -10)).toBe(false);
  });
  test("explicit resistance preserves vetoed/redirected action and pays once", () => {
    const r = book();
    const rec = turn(r, "punch", "freeze");
    expect(rec.mind?.kind).toBe("alter");
    expect(rec.check).toBeDefined();
    expect(rec.events.filter((e) => e.t === "stat" && e.id === "control" && e.d === -10)).toHaveLength(1);
    expect(turn(r, "talk", "urge").action?.id).toBe("talk");
  });
  test("adjudicator cannot silently consent; wrong id and combined unaffordable cost cannot resist", () => {
    expect(turn(book(), "punch", "freeze", "adjudicator").mind?.kind).toBe("fail");
    expect(turn(book(), "punch", "urge").mind?.kind).toBe("fail");
    const rec = turn(book("hard", 15), "punch", "freeze");
    expect(rec.mind?.kind).toBe("fail");
    expect(rec.events.some((e) => e.t === "stat" && e.id === "control" && e.d === -10)).toBe(false);
  });
  test("invalid costs and non-meter costs cannot grant free resistance", () => {
    expect(turn(book("hard", 0, "{ control: -1 }"), "punch", "freeze").mind?.kind).toBe("fail");
    const r = book(); r.stats.control.kind = "skill";
    expect(turn(r, "punch", "freeze").mind?.kind).toBe("fail");
  });
  test("choices warn before commitment and expose an actual resistance button", () => {
    const r = book();
    const choices = buildChoices(r, initialState(r), { lines: [], veils: [] });
    const punch = choices.find((c) => c.id === "punch")!;
    expect(punch.desc).toContain("may fail without a roll");
    expect(punch.params.find((p) => p.id === "mind_resist")?.options).toContain("freeze");
    const html = renderChoices(choices, { showOdds: true, hotkeys: false, busy: false });
    expect(html).toContain('data-resist-action="punch"');
    expect(html).toContain('data-resist-id="freeze"');
  });
});
