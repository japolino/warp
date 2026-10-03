// The errands window: tabs for what there is, rows that do things off the page,
// steppers within reach, locked rows that say why, and every text escaped.

import { describe, expect, test } from "bun:test";
import type { ErrandsView } from "../shared/protocol.js";
import { errandDuration, errandTabs, renderErrandEntries, renderErrands } from "./errands-ui.js";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const view: ErrandsView = {
  board: [{ id: "rats", name: "Rats in the <cellar>", desc: "The inn's cellar is overrun.", goals: ["Clear the cellar", "Report to Mara"], reward: "E40", days: 5, stakes: "The inn closes", kind: "job", take: "quest:take:rats" }],
  shop: [
    { id: "potion", label: "Buy a potion", item: "Soothing potion", itemDesc: "Heals a little.", price: "E12", max: 3, why: null, story: "buy:potion" },
    { id: "sword", label: "Buy a sword", item: "Sword", itemDesc: null, price: "E300", max: 0, why: "You can't afford it", story: "buy:sword" },
  ],
  bills: [{ id: "rent", label: "Rent", amount: "E80", due: "in 2 days", story: "pay:rent" }],
  train: [{ id: "sword", label: "Sword drills", desc: "At the yard.", odds: 0.62, minutes: 90, cost: "E5", max: 4, why: null, story: "train:sword" }],
  rest: [
    { id: "nap", label: "Nap", desc: null, minutes: 45, effects: "+10 Energy", why: null, story: "rest:nap" },
    { id: "sleep", label: "Sleep", desc: "In your bed.", minutes: 480, effects: null, why: "Not tired enough", story: "rest:sleep" },
  ],
  money: "E160",
};

describe("errands window", () => {
  test("tabs only for non-empty categories, in order, with counts", () => {
    const html = renderErrands({ ...view, bills: [] }, "board", {}, false);
    const tabs = [...html.matchAll(/data-errand-tab="(\w+)"/g)].map((m) => m[1]);
    expect(tabs).toEqual(["board", "shop", "train", "rest"]);
    expect(text(html)).toContain("Shop 2");
    expect(errandTabs(view)).toEqual(["board", "shop", "bills", "train", "rest"]);
    expect(errandTabs(null)).toEqual([]);
  });

  test("an empty or unknown tab falls back to the first with rows", () => {
    const html = renderErrands({ ...view, board: [] }, "board", {}, false);
    expect(html).toContain('data-errand-view="shop"');
    expect(html).toContain('data-errand-tab="shop" aria-selected="true"');
    const none = renderErrands({ board: [], shop: [], bills: [], train: [], rest: [], money: null }, "shop", {}, false);
    expect(text(none)).toContain("Nothing to do here");
  });

  test("board: goals, reward, days, stakes, and a quiet take", () => {
    const html = renderErrands(view, "board", {}, false);
    const t = text(html);
    expect(t).toContain("Rats in the <cellar>".replace("<", "&lt;").replace(">", "&gt;"));
    expect(html).not.toContain("<cellar>");
    expect(t).toContain("Clear the cellar");
    expect(t).toContain("Reward: E40");
    expect(t).toContain("5 days to do it");
    expect(t).toContain("⚠ The inn closes");
    expect(html).toContain('data-errand-quiet="quest:take:rats"');
    expect(t).toContain("Take it on");
    expect(html).not.toContain("data-errand-story");
  });

  test("shop: money, stepper from the draft, buy times, and a locked row with why", () => {
    const html = renderErrands(view, "shop", { "shop:potion": 2 }, false);
    const t = text(html);
    expect(t).toContain("You have E160");
    expect(html).toContain('data-errand-quiet="buy:potion" data-errand-times="2"');
    expect(html).toContain('data-errand-story="buy:potion"');
    expect(html).toContain('data-errand-qty="shop:potion" data-errand-step="1" data-errand-max="3"');
    // the sword can't be bought: Buy disabled, the reason shown
    expect(html).toMatch(/data-errand-quiet="buy:sword"[^>]*disabled/);
    expect(t).toContain("You can&#39;t afford it");
  });

  test("sell rows sit under a Sell heading after the buy rows", () => {
    const v: ErrandsView = { ...view, shop: [{ id: "pelt", label: "Sell a pelt", item: "Pelt", itemDesc: null, price: "E8", max: 2, why: null, story: "sell:pelt", sell: true }, ...view.shop] };
    const html = renderErrands(v, "shop", { "sell:pelt": 2 }, false);
    expect(html.indexOf("Sell</div>")).toBeGreaterThan(html.indexOf('data-errand-quiet="buy:sword"'));
    expect(html.indexOf('data-errand-quiet="sell:pelt"')).toBeGreaterThan(html.indexOf("Sell</div>"));
    expect(html).toMatch(/data-errand-quiet="sell:pelt" data-errand-times="2"[^>]*>Sell</);
    expect(html).toContain('data-errand-qty="sell:pelt"');
    expect(text(html)).toContain("you have 2");
  });

  test("the stepper stays within 1..max", () => {
    const html = renderErrands(view, "shop", { "shop:potion": 9 }, false);
    expect(html).toContain('data-errand-quiet="buy:potion" data-errand-times="3"');
    expect(html).toMatch(/data-errand-qty="shop:potion" data-errand-step="1"[^>]*disabled/);
    expect(html).toMatch(/data-errand-qty="shop:potion" data-errand-step="-1"[^>]*>/);
  });

  test("bills, training and rest", () => {
    const bills = text(renderErrands(view, "bills", {}, false));
    expect(bills).toContain("Rent E80");
    expect(bills).toContain("Due in 2 days");
    expect(bills).toContain("Pay");
    const trainHtml = renderErrands(view, "train", { "train:sword": 4 }, false);
    expect(text(trainHtml)).toContain("62%");
    expect(text(trainHtml)).toContain("1h 30 min each");
    expect(text(trainHtml)).toContain("E5 each");
    expect(trainHtml).toContain('data-errand-quiet="train:sword" data-errand-times="4"');
    const restHtml = renderErrands(view, "rest", {}, false);
    expect(text(restHtml)).toContain("45 min");
    expect(text(restHtml)).toContain("8h");
    expect(text(restHtml)).toContain("+10 Energy");
    expect(restHtml).toMatch(/data-errand-quiet="rest:sleep"[^>]*disabled/);
    expect(restHtml).not.toMatch(/data-errand-quiet="rest:nap"[^>]*disabled/);
    expect(text(restHtml)).toContain("Not tired enough");
  });

  test("busy disables every action", () => {
    const html = renderErrands(view, "shop", {}, true);
    for (const m of html.matchAll(/<button[^>]*data-errand-(quiet|story)="[^"]*"[^>]*>/g)) expect(m[0]).toContain("disabled");
    expect(html).toContain("warp-busy");
  });

  test("entry buttons for the choices row", () => {
    const html = renderErrandEntries({ ...view, bills: [] });
    expect([...html.matchAll(/data-errand-open="(\w+)"/g)].map((m) => m[1])).toEqual(["board", "shop", "train", "rest"]);
    expect(text(html)).toContain("📋 Notice board · 1");
    expect(text(html)).toContain("🛍 Shop · 2");
    expect(renderErrandEntries(null)).toBe("");
  });

  test("durations", () => {
    expect(errandDuration(45)).toBe("45 min");
    expect(errandDuration(60)).toBe("1h");
    expect(errandDuration(480)).toBe("8h");
    expect(errandDuration(90)).toBe("1h 30 min");
  });
});
