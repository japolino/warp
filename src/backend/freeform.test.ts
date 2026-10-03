import { describe, expect, test } from "bun:test";
import type { Answers, Decider, Questions } from "../engine/decide.js";
import { loadRuleset } from "../engine/loader.js";
import { applyProposal } from "../engine/resolve.js";
import { foldEvents, initialState } from "../engine/state.js";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";
import { bookkeeping, mentions, nameCandidates, newNames, readTurn } from "./decisions.js";

class Scripted implements Decider {
  readonly id = "jev" as const;
  readonly canWrite = false;
  asked: Questions[] = [];
  constructor(private fn: (q: Questions) => Answers) {}
  async ask(_state: unknown, q: Questions) { this.asked.push(q); return this.fn(q); }
}
const choice = (c: string, conf: number, keys: string[]) => ({
  type: "choice" as const, choice: c, confidence: conf,
  probabilities: Object.fromEntries(keys.map((k) => [k, k === c ? conf : (1 - conf) / Math.max(1, keys.length - 1)])),
});
const keysOf = (q: Questions, k: string) => Object.keys((q[k] as { criteria: Record<string, string> }).criteria);

const r = loadRuleset([{ label: "t", content: `
name: Freeform
start: { location: bar, items: { spray: 2, hoodie: 1 } }
locations: { bar: { name: The Bar } }
stats:
  charm: { kind: attribute, max: 10, start: 3, desc: Persuasion and presence }
  athletics: { kind: skill, max: 100, start: 10 }
items:
  spray: { name: Pheromone Blocker Spray, uses: 3 }
  hoodie: { name: Oversized Slouch Hoodie }
  phone: Phone
relationships: { stats: { trust: { start: 20, narrator: 5 } } }
encounters:
  brawl: { name: Brawl, foe: { name: Thug, stats: {} }, actions: { swing: { label: Swing } }, outcomes: { won: {}, lost: {} } }
`, order: 0 }]).ruleset!;
const base = { settings: DEFAULT_SETTINGS, sceneText: "The bar is loud.", player: "Sam", timeoutMs: 5000 };

describe("reading typed roleplay", () => {
  test("a risky attempt nothing lists becomes an improvised roll on the closest ability", async () => {
    const s = initialState(r);
    const d = new Scripted((q) => ({
      action: choice("attempt", 0.9, keysOf(q, "action")),
      approach: choice("charm", 0.8, keysOf(q, "approach")),
      difficulty: { type: "score", score: 2, confidence: 0.8, probabilities: {} },
    }));
    const rd = await readTurn({ ...base, decider: d, r, s, playerText: "I talk the bouncer into letting us through the back." });
    expect(rd.intent).toMatchObject({ actionId: "try:charm", params: { difficulty: "hard" } });
    // Unsure → offered as a one-tap roll instead.
    const unsure = new Scripted((q) => ({ action: choice("attempt", 0.5, keysOf(q, "action")), approach: choice("athletics", 0.7, keysOf(q, "approach")) }));
    const sug = await readTurn({ ...base, decider: unsure, r, s, playerText: "I vault the bar." });
    expect(sug.intent).toBeNull();
    expect(sug.suggestion).toMatchObject({ actionId: "try:athletics", label: "Athletics check (fair)" });
  });

  test("a fight breaking out in the exchange is read, with who it's against", async () => {
    let s = initialState(r);
    s = foldEvents(r, [applyProposal(r, s, { people: [{ name: "Dex" }] })], s);
    const d = new Scripted((q) => ({
      encounter: choice("enc:brawl", 0.8, keysOf(q, "encounter")),
      opponent: choice("p:dex", 0.9, keysOf(q, "opponent")),
    }));
    const rd = await readTurn({ ...base, decider: d, r, s, playerText: null });
    expect(rd.encounter).toEqual({ id: "brawl", foe: "Dex" });
    // Only threatened: not sure enough.
    const maybe = new Scripted((q) => ({ encounter: choice("enc:brawl", 0.45, keysOf(q, "encounter")) }));
    expect((await readTurn({ ...base, decider: maybe, r, s, playerText: null })).encounter).toBeUndefined();
  });
});

describe("reading the reply", () => {
  test("who's here, what happened to the things the reply mentions, and practice", async () => {
    let s = initialState(r);
    s = foldEvents(r, [applyProposal(r, s, { people: [{ name: "Miu" }, { name: "Clarice" }] })], s);
    const reply = "Miu slips out the side door. His thumb flicked the safety off the blocker spray and he pulled the hoodie over his head, then spent an hour drilling footwork.";
    const d = new Scripted((q) => {
      const a: Answers = {};
      for (const [k, v] of Object.entries(q)) {
        if (k === "here:miu") a[k] = { type: "noul", noul: 0.1 };
        else if (k === "here:clarice") a[k] = { type: "noul", noul: 0.5 };
        else if (k === "item:spray") a[k] = choice("used", 0.8, keysOf(q, k));
        else if (k === "item:hoodie") a[k] = choice("same", 0.8, keysOf(q, k));
        else if (k === "train") a[k] = choice("athletics", 0.7, keysOf(q, k));
        else if (v.type === "noul") a[k] = { type: "noul", noul: 0.1 };
      }
      return a;
    });
    const out = await bookkeeping({ decider: d, r, s, playerText: "…", reply, player: "Sam" });
    const asked = Object.keys(d.asked[0]);
    // Only items the reply mentions are asked about.
    expect(asked).toContain("item:spray");
    expect(asked).not.toContain("item:phone");
    expect(keysOf(d.asked[0], "item:hoodie")).not.toContain("worn");
    expect(out.proposal.scene).toEqual({ miu: false }); // Clarice: too unsure either way → unchanged
    expect(out.proposal.used).toEqual({ spray: 1 });
    expect(out.proposal.train).toEqual(["athletics"]);
    const after = foldEvents(r, [applyProposal(r, s, out.proposal)], s);
    expect(after.uses.spray).toBe(2);
    expect(after.items.hoodie).toBe(1);
  });

  test("an encounter in progress can be read as over", async () => {
    let s = initialState(r);
    s = foldEvents(r, [applyProposal(r, s, { encounter: "brawl" })], s);
    const d = new Scripted((q): Answers => (q.encounter_end ? { encounter_end: choice("end:won", 0.85, keysOf(q, "encounter_end")) } : {}));
    const out = await bookkeeping({ decider: d, r, s, playerText: "…", reply: "The thug stumbles out into the rain.", player: "Sam" });
    expect(out.proposal.encounterEnd).toBe("won");
  });
});

describe("text helpers", () => {
  test("items are recognised by their head noun or most of their words", () => {
    expect(mentions("his thumb on the blocker spray", "Pheromone Blocker Spray")).toBe(true);
    expect(mentions("the fleece of his hoodie", "Oversized Slouch Hoodie")).toBe(true);
    expect(mentions("pulled the brim of the low-profile cap down", "Low-Profile Cap")).toBe(true);
    expect(mentions("he captures the moment", "Low-Profile Cap")).toBe(false);
    expect(mentions("nothing here", "Phone")).toBe(false);
  });

  test("new names are capitalised words mid-sentence that nobody knows", () => {
    const text = "The door opens. Miu looks up as Jonah walks in with Clarice. \"Hey,\" says Jonah.";
    expect(newNames(text, ["Miu", "Clarice"])).toEqual(["Jonah"]);
  });
});

describe("new names picked, not written (classifier)", () => {
  test("candidates: runs of capitalised words the game doesn't know, most frequent first", () => {
    const text = "Captain Rhea Vos stepped in. Then Rhea laughed. \"Welcome to the Rusty Anchor,\" she said to Sam. The Bar was loud. Later, Miu waved.";
    const c = nameCandidates(text, ["Sam", "Miu", "The Bar"]);
    expect(c).toContain("Captain Rhea Vos");
    expect(c).toContain("Rusty Anchor");
    expect(c).not.toContain("Miu");
    // A lone word that only starts a sentence is kept (it can be a name: "Marcus, the barkeep, …") but asked last.
    expect(c.indexOf("Later")).toBeGreaterThan(c.indexOf("Rusty Anchor"));
    expect(c).not.toContain("Bar");
  });

  test("a new person the classifier picks is added with first feelings and presence; no writing call", async () => {
    const s = initialState(r);
    const reply = "A woman in a long coat sat beside Sam. \"Name's Rhea,\" she said, sliding over a drink. Rhea smiled warmly.";
    const d = new Scripted((q) => {
      const a: Answers = {};
      for (const [k, v] of Object.entries(q)) {
        if (k.startsWith("newp:")) a[k] = { type: "noul", noul: (v as { instructions: string }).instructions.startsWith('"Rhea"') ? 0.95 : 0.05 };
        else if (k.startsWith("newhere:")) a[k] = { type: "noul", noul: 0.9 };
        else if (k.startsWith("newfeel:")) a[k] = { type: "score", score: 3, confidence: 0.8, probabilities: {} };
        else if (k === "gate:people") a[k] = { type: "noul", noul: 0.9 };
        else if (v.type === "noul") a[k] = { type: "noul", noul: 0.05 };
      }
      return a;
    });
    const out = await bookkeeping({ decider: d, r, s, playerText: "…", reply, player: "Sam" });
    expect(out.proposal.people?.map((p) => p.name)).toEqual(["Rhea"]);
    expect(out.proposal.people?.[0].feelings?.trust).toBeDefined();
    expect(out.proposal.scene).toMatchObject({ Rhea: true });
    expect(out.needsWriting.has("people")).toBe(false);
  });

  test("someone new and unnamed, with no name in the reply to pick, still goes to the writer", async () => {
    const s = initialState(r);
    const d = new Scripted((q) => Object.fromEntries(Object.entries(q).map(([k, v]) => [k, k === "gate:people" ? { type: "noul", noul: 0.9 } : v.type === "noul" ? { type: "noul", noul: 0.05 } : { type: "score", score: 0, confidence: 0, probabilities: {} }])) as Answers);
    const out = await bookkeeping({ decider: d, r, s, playerText: "…", reply: "the bartender nods at you.", player: "Sam" });
    expect(out.needsWriting.has("people")).toBe(true);
  });

  test("open places: a named place in the reply is picked as where Sam ends up", async () => {
    const open = loadRuleset([{ label: "t", content: "name: Open\nlocations_open: true\nrelationships: { stats: { trust: { start: 20, narrator: 5 } } }\n", order: 0 }]).ruleset!;
    const s = initialState(open);
    const reply = "Sam pushed through the doors of the Rusty Anchor, out of the rain.";
    const d = new Scripted((q) => {
      const keys = keysOf(q, "place");
      const i = keys.findIndex((k) => k.startsWith("cand:") && (q.place as { criteria: Record<string, string> }).criteria[k].includes("Rusty Anchor"));
      return { place: choice(keys[i], 0.9, keys), "gate:move": { type: "noul", noul: 0.95 } };
    });
    const out = await bookkeeping({ decider: d, r: open, s, playerText: "…", reply, player: "Sam" });
    expect(out.proposal.move).toBe("Rusty Anchor");
    expect(out.needsWriting.has("move")).toBe(false);
  });
});

test("names were all judged and none is a person: no writing call for people", async () => {
  const s = initialState(r);
  const d = new Scripted((q) => Object.fromEntries(Object.entries(q).map(([k, v]) => [k, k === "gate:people" ? { type: "noul", noul: 0.9 } : v.type === "noul" ? { type: "noul", noul: 0.05 } : { type: "score", score: 0, confidence: 0, probabilities: {} }])) as Answers);
  const out = await bookkeeping({ decider: d, r, s, playerText: "…", reply: "You remember what Old Tom said about the Duke of Harrow.", player: "Sam" });
  expect(out.proposal.people).toBeUndefined();
  expect(out.needsWriting.has("people")).toBe(false);
});
