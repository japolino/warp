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
  const e = { message: "p", quote: "I lend Dex my jacket." };
  const result = readChanges({ changes: [
    { op: "transfer", id: "jacket", from: "you", to: "Dex", ...e },
    { op: "transfer", id: "jacket", from: "you", to: "Jo", ...e },
    { op: "transfer", id: "missing-key", from: "you", to: "Dex", ...e },
  ] }, owned(), [player]);
  const after = applyEvents(owned(), result.events);
  expect(result.events).toHaveLength(1);
  expect(after.facts).toHaveLength(1);
  expect(after.facts[0].holder).toBe("Dex");
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
