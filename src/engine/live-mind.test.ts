import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "./ruleset.js";
import { initialState } from "./state.js";
import { resolveTurn, type LiveChoice } from "./resolve.js";
import { buildChoices } from "./view.js";
import { renderChoices } from "../frontend/render.js";
import { intentFor } from "../backend/intents.js";
import type { Msg } from "../backend/ledger.js";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";

function book(o: { mode?: "hard" | "soft"; cost?: number | string; resist?: Record<string, unknown> | null; mind?: boolean } = {}) {
  return normalizeRuleset({
    stats: { control: { kind: "meter", start: 20, max: 20 }, bruises: { start: 0 } },
    locations: { home: { name: "Home" } }, start: { location: "home" },
    actions: { flee: { label: "Flee", effects: { bruises: 2 } } },
    live_choices: { tags: {
      brawl: { label: "Brawl", tags: ["violence"], cost: { control: o.cost ?? 0 }, check: { chance: 60, label: "Grit" }, success: { bruises: 1 }, fail: { bruises: 5 } },
      plead: { label: "Plead", tags: ["talk"], check: { chance: 70 } },
      calm: { label: "Calm", desc: "Breathe" },
    } },
    ...(o.mind === false ? {} : { mind: {
      overrides_mode: o.mode ?? "hard",
      overrides: {
        freeze: { on: ["violence"], do: "fail", cause: "Panic", ...(o.resist === null ? {} : { resist_cost: o.resist ?? { control: 10 } }) },
        urge: { on: ["talk"], do: "flee", cause: "Fear", resist_cost: { control: 5 } },
      },
    } }),
  }).ruleset!;
}
const live: LiveChoice[] = [
  { label: "Swing at the guard", tag: "brawl", forecast: { goal: "Get past", risk: "Hurt", payoff: "Freedom" } },
  { label: "Beg for time", tag: "plead" },
  { label: "Steady yourself", tag: "calm" },
];
const msg = (l: unknown): Msg => ({ role: "assistant", is_user: false, swipe_id: 0, metadata: { warp: { live: { "0": l } } } } as unknown as Msg);
const view = (r: ReturnType<typeof book>) => buildChoices(r, initialState(r), { lines: [], veils: [], live, minigames: "off" });
const click = (r: ReturnType<typeof book>, id: string, params?: Record<string, string>) => {
  const ci = intentFor(r, initialState(r), DEFAULT_SETTINGS, [msg(live)], id, params);
  if (!("intent" in ci)) throw Error("no intent");
  return ci.intent;
};
const paid = (rec: ReturnType<typeof resolveTurn>, n: number) => rec.events.filter((e) => e.t === "stat" && e.id === "control" && e.d === -n && e.src === "cost");

describe("live choices show mind warnings and explicit resistance", () => {
  test("hard override on a live tag warns and offers an affordable Resist button", () => {
    const r = book();
    const c = view(r).find((x) => x.id === "live:0")!;
    expect(c.desc).toContain("Panic: may fail without a roll");
    expect(c.desc).toContain("Resist freeze: 10 ");
    expect(c.params.find((p) => p.id === "mind_resist")?.options).toEqual(["none", "freeze"]);
    const redirect = view(r).find((x) => x.id === "live:1")!;
    expect(redirect.desc).toContain("Fear: may replace your chosen action");
    expect(redirect.params.find((p) => p.id === "mind_resist")?.options).toEqual(["none", "urge"]);
    const html = renderChoices(view(r), { minigames: "off", showOdds: true, hotkeys: false, busy: false });
    expect(html).toContain('data-resist-action="live:0"');
    expect(html).toContain('data-resist-id="freeze"');
  });
  test("displayed odds are identical with or without the override", () => {
    const withMind = view(book()), without = view(book({ mind: false }));
    for (const id of ["live:0", "live:1", "live:2"]) {
      const a = withMind.find((x) => x.id === id)!, b = without.find((x) => x.id === id)!;
      expect([a.odds, a.partialOdds, a.checkLabel]).toEqual([b.odds, b.partialOdds, b.checkLabel]);
    }
  });
  test("live choices without matching overrides, and books without mind, are unchanged", () => {
    const calm = view(book()).find((x) => x.id === "live:2")!;
    expect(calm.desc).toBe("Breathe");
    expect(calm.params).toEqual([]);
    for (const c of view(book({ mind: false })).filter((x) => x.id.startsWith("live:"))) expect(c.params).toEqual([]);
    expect(click(book({ mind: false }), "live:0").params).toBeUndefined();
  });
  test("click passes mind_resist through, keeps the forecast, drops unknown params", () => {
    const intent = click(book(), "live:0", { mind_resist: "freeze", chance: "100" });
    expect(intent).toMatchObject({ actionId: "live:brawl", via: "choice", params: { mind_resist: "freeze" } });
    expect(intent.params).toEqual({ mind_resist: "freeze" });
    expect(intent.forecast).toEqual(live[0].forecast);
  });
  test("explicit resistance keeps the live action and pays once; plain click is still vetoed", () => {
    const r = book();
    const plain = resolveTurn(r, initialState(r), click(r, "live:0"), { seed: "live-mind" });
    expect(plain.mind?.kind).toBe("fail");
    expect(plain.check).toBeUndefined();
    expect(paid(plain, 10)).toHaveLength(0);
    const resisted = resolveTurn(r, initialState(r), click(r, "live:0", { mind_resist: "freeze" }), { seed: "live-mind" });
    expect(resisted.mind?.kind).toBe("alter");
    expect(resisted.check).toBeDefined();
    expect(paid(resisted, 10)).toHaveLength(1);
    const kept = resolveTurn(r, initialState(r), click(r, "live:1", { mind_resist: "urge" }), { seed: "live-mind" });
    expect(kept.action?.id).toBe("live:plead");
    expect(resolveTurn(r, initialState(r), click(r, "live:1"), { seed: "live-mind" }).action?.id).toBe("flee");
  });
  test("resistance is explicit-choice only and needs the matching override id", () => {
    const r = book();
    const auto = resolveTurn(r, initialState(r), { actionId: "live:brawl", via: "adjudicator", params: { mind_resist: "freeze" } }, { seed: "live-mind" });
    expect(auto.mind?.kind).toBe("fail");
    expect(resolveTurn(r, initialState(r), click(r, "live:0", { mind_resist: "urge" }), { seed: "live-mind" }).mind?.kind).toBe("fail");
  });
  test("combined action and resistance cost must be affordable (flat and percent costs)", () => {
    for (const cost of [-15, "-60%"]) {
      const r = book({ cost });
      const c = view(r).find((x) => x.id === "live:0")!;
      expect(c.desc).toContain("Not enough resources to resist.");
      expect(c.params.some((p) => p.id === "mind_resist")).toBe(false);
      const rec = resolveTurn(r, initialState(r), click(r, "live:0", { mind_resist: "freeze" }), { seed: "live-mind" });
      expect(rec.mind?.kind).toBe("fail");
      expect(paid(rec, 10)).toHaveLength(0);
    }
    const ok = book({ cost: "-50%" });
    expect(view(ok).find((x) => x.id === "live:0")!.params.find((p) => p.id === "mind_resist")?.options).toContain("freeze");
  });
  test("soft mode and overrides without resist_cost warn but offer no Resist", () => {
    const soft = view(book({ mode: "soft" })).find((x) => x.id === "live:0")!;
    expect(soft.desc).toContain("narration pressure only");
    expect(soft.params).toEqual([]);
    const bare = view(book({ resist: null })).find((x) => x.id === "live:0")!;
    expect(bare.desc).toContain("may fail without a roll");
    expect(bare.params).toEqual([]);
  });
});
