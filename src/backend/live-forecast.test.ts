import { describe, expect, test } from "bun:test";
import { normalizeRuleset } from "../engine/ruleset.js";
import { initialState } from "../engine/state.js";
import { buildChoices } from "../engine/view.js";
import { cleanLiveForecast, resolveTurn } from "../engine/resolve.js";
import { renderChoices } from "../frontend/render.js";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";
import { cleanChoices, usableTags } from "./live.js";
import { intentFor } from "./intents.js";
import type { Msg } from "./ledger.js";

const r = normalizeRuleset({
  stats: { stress: { kind: "meter", start: 10, max: 100 } },
  locations: { home: { name: "Home" } }, start: { location: "home" },
  live_choices: { tags: { bold: { label: "Bold", desc: "Take a risk", check: { chance: 55, label: "Nerve" }, success: { stress: -2 }, fail: { stress: 3 } } } },
}).ruleset!;
const s = initialState(r);
const tags = usableTags(r, DEFAULT_SETTINGS, s);
const forecast = { goal: "Learn why Jo left", risk: "Jo might withdraw", payoff: "Jo could share the truth" };
const opts = { lines: [], veils: [] };
const msg = (live: unknown): Msg => ({ role: "assistant", is_user: false, swipe_id: 0, metadata: { warp: { live: { "0": live } } } } as unknown as Msg);

describe("bounded, nonbinding live-choice forecasts", () => {
  test("cleans whitespace/controls, caps every field, drops extra mechanics", () => {
    expect(cleanLiveForecast({ ...forecast, goal: " a\n\t\u0000 b ", chance: 100 })).toEqual({ ...forecast, goal: "a b" });
    expect(cleanLiveForecast({ goal: "x".repeat(900), risk: "r".repeat(900), payoff: "p".repeat(900) })).toEqual({ goal: "x".repeat(180), risk: "r".repeat(180), payoff: "p".repeat(180) });
    for (const raw of [null, [], "bad", {}, { ...forecast, risk: 7 }, { ...forecast, payoff: " " }]) expect(cleanLiveForecast(raw)).toBeUndefined();
  });
  test("invalid optional payload never drops an otherwise valid choice; legacy choices work", () => {
    const old = cleanChoices(r, s, tags, [{ label: "Ask Jo", tag: "bold" }], 3);
    expect(old).toEqual([{ label: "Ask Jo", tag: "bold" }]);
    expect(cleanChoices(r, s, tags, [{ label: "Ask Jo", tag: "bold", forecast: { goal: 7 } }], 3)).toEqual(old);
    expect(cleanChoices(r, s, tags, [{ label: "Ask Jo", tag: "bold" }], 0)).toEqual([]);
    expect(buildChoices(r, s, { ...opts, live: old })[0].forecast).toBeUndefined();
    const clicked = intentFor(r, s, DEFAULT_SETTINGS, [msg(old)], "live:0");
    expect(clicked).toMatchObject({ intent: { actionId: "live:bold", label: "Ask Jo" } });
  });
});
