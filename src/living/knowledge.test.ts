import { expect, test } from "bun:test";
import { revision } from "../shared/revision.js";
import { applyEvents, emptyWorld, foldWorld, pathOf, readChanges, worldPacket, type Message, type Record, type World } from "./world.js";
import { propositionVersion } from "./knowledge.js";
import { emptyMechanics } from "./mechanics.js";

const opening: Message = { id: "opening", is_user: false, content: "You discover a signed letter naming Vale as the anonymous donor. Jo and Dex wait in the café." };
const topic = { op: "put", id: "donor", kind: "fact", subject: "Vale", text: "The letter names Vale as the anonymous donor", message: opening.id, quote: "a signed letter naming Vale as the anonymous donor" };
const learn = (subject: string, message: Message, via = "discovered", extra: object = {}) => ({ op: "learn", about: "donor", subject, via, message: message.id, quote: message.content, ...extra });
const known = (world: World) => world.facts.filter(f => f.kind === "knowledge");
function initial() {
  const result = readChanges({ changes: [topic, learn("you", opening)] }, emptyWorld(), [opening], "Sam");
  return { ...result, world: applyEvents(emptyWorld(), result.events) };
}

test("an established secret has specific learners; presence alone never creates an audience", () => {
  const { world } = initial();
  expect(world.facts.find(f => f.id === "donor")?.subject).toBe("Vale");
  expect(known(world).map(f => f.subject)).toEqual(["you"]);
  const whisper: Message = { id: "whisper", is_user: false, content: "You quietly tell Jo what the letter says. Dex is outside and cannot hear." };
  const result = readChanges({ changes: [learn("Jo", whisper, "told", { from: "Sam" })] }, { ...world, present: ["Jo", "Dex"] }, [opening, whisper], "Sam");
  const after = applyEvents(world, result.events);
  expect(known(after).map(f => f.subject)).toEqual(["you", "Jo"]);
  expect(known(after).at(-1)?.access).toMatchObject({ about: "donor", via: "told", from: "you", version: propositionVersion(world.facts[0]) });
  expect(known(after).at(-1)?.text).toBe(topic.text);
  expect(worldPacket(after)).toContain("Unrecorded access is unknown");
});

test("a source quote needs the actual learner and completed access; player intentions and retroactive witnessing cannot grant knowledge", () => {
  const { world } = initial();
  const player = { id: "p", is_user: true, content: "I tell Jo who the donor is." };
  const arrived = { id: "arrived", is_user: false, content: "Jo arrives at the café." };
  const result = readChanges({ changes: [
    learn("Jo", player, "told", { from: "you" }),
    learn("Jo", arrived, "witnessed"),
    learn("Dex", opening, "discovered", { quote: "You discover a signed letter naming Vale as the anonymous donor." }),
    { ...learn("Jo", opening), quote: "a signed letter naming Vale as the anonymous donor" },
    { op: "put", id: "bypass", kind: "knowledge", subject: "Jo", text: topic.text, message: arrived.id, quote: arrived.content },
  ] }, world, [opening, player, arrived]);
  expect(result.events).toEqual([]);
});

test("a disclosure needs a sender's same-version knowledge, and repeated accounts retain the first cause", () => {
  let { world } = initial();
  const reply: Message = { id: "reply", is_user: false, content: "Jo tells Dex about the donor." };
  expect(readChanges({ changes: [learn("Dex", reply, "told", { from: "Jo" })] }, world, [opening, reply]).events).toEqual([]);
  const whisper: Message = { id: "whisper", is_user: false, content: "You tell Jo what you learned from the letter." };
  world = applyEvents(world, readChanges({ changes: [learn("Jo", whisper, "told", { from: "you" })] }, world, [opening, whisper]).events);
  const result = readChanges({ changes: [learn("Dex", reply, "told", { from: "Jo" })] }, world, [opening, whisper, reply]);
  world = applyEvents(world, result.events);
  expect(known(world).map(f => f.subject)).toEqual(["you", "Jo", "Dex"]);
  expect(readChanges({ changes: [learn("Dex", reply, "told", { from: "Jo", id: "new-id" })] }, world, [opening, whisper, reply]).events).toEqual([]);
  expect(known(world).at(-1)?.message).toBe("reply");
});

test("learning an allegation preserves its uncertainty and neither agrees nor awards a social score", () => {
  const claim: Message = { id: "claim", is_user: false, content: "Jo alleges Vale forged the letter. You hear the allegation but do not agree." };
  const result = readChanges({ changes: [{ ...topic, id: "allegation", text: "Jo alleges Vale forged the letter; unverified", message: claim.id, quote: claim.content }, { ...learn("you", claim, "witnessed"), about: "allegation" }] }, emptyWorld(), [claim]);
  const after = applyEvents(emptyWorld(), result.events);
  expect(known(after)[0].text).toBe("Jo alleges Vale forged the letter; unverified");
  expect(after.facts.some(f => f.kind === "commitment")).toBe(false);
  expect(after.mechanics).toBeUndefined();
});

test("new facts do not rewrite old knowledge; a person can pass on the historical proposition they actually learned", () => {
  let { world } = initial();
  const update: Message = { id: "update", is_user: false, content: "A newer receipt names someone else as the donor. You do not see it." };
  world = applyEvents(world, readChanges({ changes: [{ ...topic, text: "A newer receipt names Ash as the anonymous donor", message: update.id, quote: update.content }] }, world, [opening, update]).events);
  expect(known(world)[0].text).toBe(topic.text);
  const whisper: Message = { id: "whisper", is_user: false, content: "You tell Jo the donor was Vale, as the old letter said." };
  const wrong = readChanges({ changes: [learn("Jo", whisper, "told", { from: "you" })] }, world, [opening, update, whisper]);
  expect(wrong.events).toEqual([]); // The player does not know the newer proposition.
  const oldKnowledge = known(world)[0];
  const correct = readChanges({ changes: [{ ...learn("Jo", whisper, "told", { from: "you" }), about: oldKnowledge.id }] }, world, [opening, update, whisper]);
  const after = applyEvents(world, correct.events);
  expect(known(after).at(-1)?.subject).toBe("Jo"); expect(known(after).at(-1)?.text).toBe(topic.text);
});

test("editing the original evidence invalidates dependent learning even if the later disclosure quote survives", () => {
  const { world, events } = initial(), whisper: Message = { id: "whisper", is_user: false, content: "You tell Jo the donor's identity." };
  const next = readChanges({ changes: [learn("Jo", whisper, "told", { from: "you" })] }, world, [opening, whisper]);
  const firstRecord: Record = { version: 1, path: pathOf([]), text: revision(opening.content), events, notes: [] };
  const nextRecord: Record = { version: 1, path: pathOf([opening]), text: revision(whisper.content), ...next };
  const saved = [{ ...opening, record: firstRecord }, { ...whisper, record: nextRecord }];
  expect(known(foldWorld(saved))).toHaveLength(2);
  const edited = [{ ...saved[0], content: "The letter is blank. Nobody learns a donor's identity." }, saved[1]];
  expect(known(foldWorld(edited))).toEqual([]);
  expect(known(foldWorld([{ ...saved[0], swipe_id: 1, content: "You put away the unread letter." }, saved[1]]))).toEqual([]);
});

test("learning uses the established person behind an alias without confusing similarly named people", () => {
  const { world } = initial(), mechanics = emptyMechanics();
  mechanics.entities = [{ id: "jo", name: "Jo", displayName: "Jo", aliases: ["the barista"], entityKind: "person", present: true, status: "active", source: { message: opening.id, quote: opening.content } }];
  const whisper = { id: "alias", is_user: false, content: "You whisper the letter's contents to the barista." };
  const result = readChanges({ changes: [learn("the barista", whisper, "told", { from: "you" })] }, { ...world, mechanics }, [opening, whisper]);
  expect(result.events[0].fact?.subject).toBe("Jo");
  const similar = { id: "similar", is_user: false, content: "You tell Joanna about the letter." };
  expect(readChanges({ changes: [learn("Jo", similar, "told", { from: "you" })] }, world, [opening, similar]).events).toEqual([]);
  const npcVoice = { id: "voice", is_user: false, content: 'Jo says, "I found the letter on the counter."' };
  const topicOnly = { ...world, facts: world.facts.filter(f => f.kind !== "knowledge") };
  expect(readChanges({ changes: [learn("you", npcVoice)] }, topicOnly, [opening, npcVoice]).events).toEqual([]);
});

const live = await Bun.file(new URL("./fixtures/mystery-learning.json", import.meta.url)).json() as { cases: {
  report: string; opening: Message; player: Message; reply: Message; bootstrap: unknown; extraction: unknown; expectedLearners: string[];
}[] };
for (const sample of live.cases) test(`captured synthetic model sample ${sample.report} keeps only causally supported learners`, () => {
  const initial = applyEvents(emptyWorld(), readChanges(sample.bootstrap, emptyWorld(), [sample.opening], "Sam").events);
  const result = readChanges(sample.extraction, initial, [sample.opening, sample.player, sample.reply], "Sam");
  const after = applyEvents(initial, result.events);
  expect(known(after).map(f => f.subject)).toEqual(sample.expectedLearners);
  expect(known(after).some(f => f.subject === "Dex")).toBe(false);
  expect(after.mechanics).toBeUndefined();
});
