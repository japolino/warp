import { expect, test } from "bun:test";
import { revision } from "../shared/revision.js";
import { applyEvents, emptyWorld, foldWorld, pathOf, readChanges, resolveAttempt, worldPacket, type Fact, type Message, type Record } from "./world.js";

const player: Message = { id: "p", is_user: true, content: "I promise Jo I will cover the counter. I lend Dex my jacket." };
const reply: Message = { id: "r", is_user: false, content: "Jo says, 'I will cover for you.' Dex takes the jacket and leaves." };
const jacket: Fact = { id: "jacket", kind: "possession", subject: "jacket", holder: "you", text: "Your distinctive jacket", message: "old", quote: "I own a distinctive jacket", status: "open" };
const owned = () => ({ ...emptyWorld(), facts: [jacket] });

test("promises need actual player agreement; quoted evidence is mandatory", () => {
  const result = readChanges({ changes: [
    { op: "put", id: "counter", kind: "commitment", subject: "you", text: "Cover Jo's counter", message: "p", quote: "I promise Jo I will cover the counter." },
    { op: "put", id: "debt", kind: "commitment", subject: "you", text: "Pay Jo a debt", message: "r", quote: "Jo says, 'I will cover for you.'" },
    { op: "put", id: "madeup", kind: "fact", subject: "Jo", text: "Jo owns the café", message: "r", quote: "Jo owns the café" },
  ] }, emptyWorld(), [player, reply]);
  expect(result.events.map(e => e.id)).toEqual(["counter"]);
});

test("a transfer preserves the item identity and rejects spending it twice", () => {
  const e = { message: "r", quote: "Dex takes the jacket and leaves." };
  const result = readChanges({ changes: [
    { op: "transfer", id: "jacket", from: "you", to: "Dex", ...e },
    { op: "transfer", id: "jacket", from: "you", to: "Jo", ...e },
    { op: "transfer", id: "missing-key", from: "you", to: "Dex", ...e },
  ] }, owned(), [player, reply]);
  const after = applyEvents(owned(), result.events);
  expect(result.events).toHaveLength(1);
  expect(after.facts).toHaveLength(1);
  expect(after.facts[0].holder).toBe("Dex");
});

test("a proposed transfer is not ownership until the narrator establishes it", () => {
  const result = readChanges({ changes: [{ op: "transfer", id: "jacket", from: "you", to: "Dex", message: "p", quote: "I lend Dex my jacket." }] }, owned(), [player, { ...reply, content: "Dex refuses the jacket." }]);
  expect(result.events).toEqual([]);
});

test("a narrator cannot assign player promises or motives through a name alias", () => {
  const source = { ...player, name: "Sam" };
  const result = readChanges({ changes: [
    { op: "put", id: "promise", kind: "commitment", subject: "Sam", text: "Sam will help", message: "r", quote: "Jo says, 'I will cover for you.'" },
    { op: "put", id: "want", kind: "motive", subject: "You", text: "Wants to stay", message: "r", quote: "Dex takes the jacket and leaves." },
  ] }, emptyWorld(), [source, reply]);
  expect(result.events).toEqual([]);
});

test("a generic update cannot bypass the ownership transition", () => {
  const result = readChanges({ changes: [{ op: "put", id: "jacket", kind: "possession", subject: "jacket", text: "The jacket", holder: "Dex", message: "r", quote: "Dex takes the jacket and leaves." }] }, owned(), [reply]);
  expect(result.events).toEqual([]);
});

test("three situations is a ceiling, and no unsupported scene is invented", () => {
  const result = readChanges({ scene: { place: "The moon", present: ["Jo"], message: "r", quote: "The moon" }, changes: Array.from({ length: 5 }, (_, i) => ({ op: "put", id: `s${i}`, kind: "situation", subject: "Jo", text: `Situation ${i}`, message: "r", quote: "Jo says, 'I will cover for you.'" })) }, emptyWorld(), [reply]);
  expect(result.events).toHaveLength(3);
  expect(result.scene).toBeUndefined();
});

test("editing a cause or changing its active swipe invalidates descendant outcomes", () => {
  const record: Record = { version: 1, path: pathOf([player]), text: revision(reply.content), notes: [], events: [{ op: "put", id: "jacket", fact: jacket, evidence: jacket }] };
  expect(foldWorld([player, { ...reply, record }]).facts).toHaveLength(1);
  expect(foldWorld([{ ...player, content: "I keep my jacket." }, { ...reply, record }]).facts).toHaveLength(0);
  expect(foldWorld([{ ...player, swipe_id: 1 }, { ...reply, record }]).facts).toHaveLength(0);
  expect(foldWorld([player, { ...reply, content: "Dex refuses.", record }]).facts).toHaveLength(0);
});

test("quiet conversation cannot roll; favorable circumstances change the outcome distribution", () => {
  expect(resolveAttempt({ risky: false, contested: true }, "seed")).toBeNull();
  expect(resolveAttempt({ risky: true, contested: true, confidence: 1 }, "seed")).toBeNull();
  let good = 0, bad = 0;
  for (let i = 0; i < 2000; i++) {
    const data = { risky: true, contested: true, intent: "Get Dex clear", stakes: "The observer may recognize the jacket", reasons: ["A prepared distraction"] };
    const favored = resolveAttempt({ ...data, tier: "favorable" }, String(i));
    const outmatched = resolveAttempt({ ...data, tier: "outmatched" }, String(i));
    expect(resolveAttempt({ ...data, tier: "favorable" }, String(i))).toEqual(favored);
    if (favored?.result === "clean") good++;
    if (outmatched?.result === "clean") bad++;
  }
  expect(good).toBeGreaterThan(1000);
  expect(bad).toBeLessThan(300);
});

test("inferred motives stay distinct from established facts", () => {
  const possible = { ...jacket, kind: "motive" as const, text: "Jo may want an explanation" };
  const packet = JSON.parse(worldPacket({ ...emptyWorld(), facts: [possible] }));
  expect(packet.established).toEqual([]);
  expect(packet.possibleMotives[0].text).toContain("may");
});

test("an unrelated deep edit preserves still-supported history, and removed evidence does not survive", () => {
  const intro: Message = { id: "intro", content: "The evening is quiet.", is_user: false };
  const source: Message = { id: "source", content: "You own a distinctive jacket.", is_user: false };
  const fact = { ...jacket, message: source.id, quote: source.content };
  const record: Record = { version: 1, path: pathOf([intro]), text: revision(source.content), events: [{ op: "put", id: fact.id, fact, evidence: fact }], notes: [] };
  const filler = Array.from({ length: 30 }, (_, i) => ({ id: `f${i}`, content: "They chat quietly.", is_user: false }));
  const changed = { ...intro, content: "The evening is rainy." };
  expect(foldWorld([changed, { ...source, record }, ...filler]).facts[0].id).toBe("jacket");
  expect(foldWorld([changed, { ...source, content: "You leave without a jacket.", record }, ...filler]).facts).toEqual([]);
});

test("a fork can rebind unique quoted sources without retaining obsolete message ids", () => {
  const source: Message = { id: "old-source", content: "You own a distinctive jacket.", is_user: false };
  const fact = { ...jacket, message: source.id, quote: source.content };
  const record: Record = { version: 1, path: pathOf([]), text: revision(source.content), events: [{ op: "put", id: fact.id, fact, evidence: fact }], notes: [] };
  const world = foldWorld([{ id: "fork-intro", content: "Same story, new chat.", is_user: false }, { ...source, id: "new-source", record }]);
  expect(world.facts[0].message).toBe("new-source");
  expect(world.facts[0].id).toBe("jacket");
});

test("canonical memory retains old possessions while the relevant prompt remains bounded", () => {
  const facts = Array.from({ length: 200 }, (_, i) => ({ ...jacket, id: i === 0 ? "silver-ring" : `item-${i}`, subject: i === 0 ? "ring" : `item-${i}`, text: i === 0 ? "Silver ring found at the docks" : `Ordinary item ${i}` }));
  const world = applyEvents({ ...emptyWorld(), facts }, []);
  expect(world.facts).toHaveLength(200);
  const packet = JSON.parse(worldPacket(world, "Who has the silver ring?"));
  expect(packet.established.length).toBeLessThanOrEqual(80);
  expect(packet.established.some((f: any) => f.id === "silver-ring")).toBe(true);
});

test("changing the meaning around an unchanged quote invalidates its old interpretation", () => {
  const promise = { id: "p", is_user: true, content: "I will cover Jo's counter." };
  const acknowledgement = { id: "r", is_user: false, content: "Jo thanks you." };
  const changes = readChanges({ changes: [{ op: "put", id: "promise", kind: "commitment", subject: "you", text: "Cover Jo's counter", message: "p", quote: "I will cover Jo's counter." }] }, emptyWorld(), [promise, acknowledgement]);
  const record: Record = { version: 1, path: pathOf([promise]), text: revision(acknowledgement.content), ...changes };
  const edited = { ...promise, content: 'I never said "I will cover Jo\'s counter."' };
  expect(foldWorld([edited, { ...acknowledgement, record }]).facts).toEqual([]);
});

test("the persona is not duplicated as an NPC in the present cast", () => {
  const message = { id: "p", is_user: true, name: "Sam", content: "Sam is alone; Mira is in the next room." };
  const result = readChanges({ scene: { place: "archive", present: ["Sam", "You"], message: "p", quote: "Sam is alone" } }, emptyWorld(), [message], "Sam");
  expect(result.scene?.present).toEqual([]);
});

test("fulfillment closes an agreement without rewriting its terms", () => {
  const promise = { ...jacket, id: "cover", kind: "commitment" as const, subject: "you", text: "Cover the counter until closing" };
  const source = { id: "done", is_user: false, content: "Jo thanks you for covering the counter until the last customer leaves." };
  const changes = readChanges({ changes: [{ op: "resolve", id: "cover", message: "done", quote: source.content }] }, { ...emptyWorld(), facts: [promise] }, [source]);
  const after = applyEvents({ ...emptyWorld(), facts: [promise] }, changes.events);
  expect(after.facts[0].text).toBe(promise.text);
  expect(after.facts[0].status).toBe("done");
});

test("a new player intention cannot mark an old agreement fulfilled", () => {
  const promise = { ...jacket, id: "cover", kind: "commitment" as const, subject: "you", text: "Cover the counter until closing" };
  const source = { id: "wish", is_user: true, content: "I will cover the counter later." };
  const changes = readChanges({ changes: [{ op: "resolve", id: "cover", message: "wish", quote: source.content }] }, { ...emptyWorld(), facts: [promise] }, [source]);
  expect(changes.events).toEqual([]);
});
