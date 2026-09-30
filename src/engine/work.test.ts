import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { foldEvents, initialState, type GameState } from "./state.js";
import { resolveTurnFull } from "./resolve.js";
import { buildChoices, buildHud, stateDigest } from "./view.js";

const r = loadRuleset([{ label: "t", content: `
name: Work
clock: { start: "Mon 08:00" }
start: { location: cafe }
locations: { cafe: { name: The Café }, flat: { name: Your Flat } }
stats:
  money: { kind: money, start: 50 }
  tending: { kind: skill, max: 100, start: 0 }
hud: { money: money, currency: "£" }
relationships:
  stats: { trust: { start: 50 } }
  people: { landlord: { name: Mr Pike } }
obligations:
  rent:
    amount: 100
    every: 7
    first: 2
    creditor: landlord
    grace: 1
    late:
      ask: "The rent is late. What does {creditor} do?"
      options:
        warn: { desc: "A stern warning", weight: 1 }
        fee: { desc: "Adds a late fee", weight: 1, money: -10 }
jobs:
  cafe:
    label: Work a shift at the café
    at: [cafe]
    customers: 2
    pay: 30
    tip: 5
    skill: tending
    gain: { tending: +2 }
    patrons: [ { who: "A nurse off a night shift", want: quick } ]
    styles: { quick: Serve them quickly, chat: Chat them up }
actions:
  day: { label: A day passes, time: 1440 }
`, order: 0 }]).ruleset!;

const act = (s: GameState, id: string | null, odds?: Record<string, Record<string, number>>, seed = "w") => {
  const res = resolveTurnFull(r, s, id ? { actionId: id, via: "choice" } : null, { seed, odds });
  return { s: foldEvents(r, [res.record.events], s), rec: res.record, needs: res.needs };
};

describe("bills", () => {
  test("a payment falls due; paying clears it; the next period follows", () => {
    let s = initialState(r);
    expect(s.dues.rent).toMatchObject({ owed: 100, missed: 0 });
    expect(stateDigest(r, s)).toContain("Rent: £100 due in 2 days");
    const pay = buildChoices(r, s, { lines: [], veils: [] }).find((c) => c.id === "pay:rent")!;
    expect(pay.label).toContain("£50 of £100");
    s = foldEvents(r, [[{ t: "stat", id: "money", d: 60, src: "manual" }]], s);
    s = act(s, "pay:rent").s;
    expect(s.dues.rent.owed).toBe(0);
    expect(s.stats.money).toBe(10);
    s = act(act(s, "day").s, "day").s;
    expect(s.dues.rent.owed).toBe(100);
    expect(buildHud(r, s).dues[0].text).toContain("Due in");
  });

  test("missing one lets the creditor decide, and arrears pile up", () => {
    let s = initialState(r);
    let t = act(s, "day");
    t = act(t.s, "day");
    t = act(t.s, "day", { due_rent_late: { warn: 0, fee: 1 } });
    s = t.s;
    expect(s.dues.rent).toMatchObject({ owed: 200, missed: 1 });
    expect(s.stats.money).toBe(40);
    expect(t.rec.hints.join(" ")).toContain("Mr Pike's response: Adds a late fee");
    expect(stateDigest(r, s)).toContain("OVERDUE: Rent");
  });
});

describe("shifts", () => {
  test("each customer judges the approach; the right one pays better; the shift pays at the end", () => {
    let s = act(initialState(r), "job:start:cafe").s;
    expect(s.job?.n).toBe(0);
    const ids = buildChoices(r, s, { lines: [], veils: [] }).map((c) => c.id);
    expect(ids).toEqual(["job:style:quick", "job:style:chat", "job:quit"]);
    let t = act(s, "job:style:quick");
    expect(t.rec.hints.join(" ")).toContain("A nurse off a night shift");
    t = act(t.s, "job:style:quick", undefined, "w2");
    expect(t.s.job).toBeNull();
    expect(t.s.stats.money).toBeGreaterThanOrEqual(80);
    expect(t.s.stats.tending).toBe(2);
    expect(t.rec.hints.join(" ")).toContain("The shift is over");
  });

  test("typed lines are served in the player's own words, read by the model", () => {
    const s = act(initialState(r), "job:start:cafe").s;
    const first = act(s, null);
    expect(first.needs.some((n) => n.id === "job:reception")).toBe(true);
    const great = act(s, null, { "job:reception": { love: 1, like: 0, neutral: 0, dislike: 0, hate: 0 } });
    expect(great.s.job?.tips).toBe(7.5);
    expect(great.rec.decisions?.[0]?.source).toBe("model");
  });

  test("walking out pays nothing", () => {
    const s = act(act(initialState(r), "job:start:cafe").s, "job:quit").s;
    expect(s.job).toBeNull();
    expect(s.stats.money).toBe(50);
  });
});
