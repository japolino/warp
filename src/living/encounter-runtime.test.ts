import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { makeHost, type HelperCall } from "../backend/test-host.js";
import { getMessages } from "../backend/ledger.js";
import { foldMechanics } from "./mechanical-history.js";
import { actionCount, distance } from "./encounters.js";
import { syncLiving, needsMechanicalRead } from "./runtime.js";

const h = makeHost("encounter-runtime-owner", false);
const greeting = "Jo stands near you. You have 20 of 20 Battery and 40 of 40 Health. Jo has 40 of 40 Health and a shield of 5.";
const persona = "Sam can use Pulse. Pulse costs 2 Battery and deals 20 physical Health damage at near range. Pulse has a cooldown of 1 action.";
let previous: unknown, serial = 0, bootstrap = true, reads = 0, immunity = false;
beforeAll(async () => {
  previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake;
  await import("../backend.ts" + "?encounter-runtime-test"); (globalThis as any).spindle = previous;
});
beforeEach(() => {
  previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake;
  bootstrap = true; reads = 0; immunity = false; h.helper = helper;
  h.fake.macros.resolve = async (text: string) => ({ text: text === "{{user}}" ? "Sam" : text === "{{persona}}" ? persona : text });
  h.fake.world_books.getActivated = async () => [];
});
afterEach(() => { (globalThis as any).spindle = previous; });
const state = async (id: string) => foldMechanics(await getMessages(id));
const latest = (id: string) => [...h.sent].reverse().find(m => m.type === "living" && m.chatId === id);
async function chat() {
  const id = `encounter-${++serial}`; h.chat(id, "", greeting + (immunity ? " Jo is immune to physical damage until the ward is removed." : "")); h.characters[`char-${id}`].world_book_ids = [];
  await syncLiving(id, h.userId); return id;
}
function helper(c: HelperCall): unknown {
  const attempt = c.system.includes("Determine whether");
  if (!attempt && !bootstrap) return { changes: [] };
  const sources = JSON.parse(c.user.split("\n").find(line => line.startsWith('[{"id":"warp-source:')) ?? "[]");
  const source = sources.find((s: any) => s.kind === "persona");
  const messages = JSON.parse(c.user.split(attempt ? "Scene:\n" : "Messages:\n")[1]);
  const scene = messages.find((m: any) => m.content.startsWith(greeting));
  const data = {
    mechanicalObservations: scene ? [
      { kind: "entity", name: "Jo", entityKind: "person", present: true, message: scene.id, quote: "Jo stands near you." },
      { kind: "distance", from: "you", to: "Jo", band: "near", message: scene.id, quote: "Jo stands near you." },
      { kind: "resource", id: "battery", owner: "you", name: "Battery", current: 20, max: 20, role: "effort", message: scene.id, quote: "You have 20 of 20 Battery and 40 of 40 Health." },
      { kind: "resource", id: "hp", owner: "you", name: "Health", current: 40, max: 40, role: "vital", message: scene.id, quote: "You have 20 of 20 Battery and 40 of 40 Health." },
      { kind: "resource", id: "jo-hp", owner: "Jo", name: "Health", current: 40, max: 40, role: "vital", message: scene.id, quote: "Jo has 40 of 40 Health and a shield of 5." },
      { kind: "resource", id: "shield", owner: "Jo", name: "Shield", current: 5, role: "shield", message: scene.id, quote: "Jo has 40 of 40 Health and a shield of 5." },
    ] : [],
    abilityDefinitions: [{ owner: "you", name: "Pulse", approach: "precision", target: "other", range: "near", cooldown: 1, costs: [{ kind: "resource", id: "battery", amount: 2 }], effects: [{ kind: "damage", target: "target", resource: "Health", amount: 20, damageType: "physical" }], requires: [], unsupported: [], message: source.id, quote: source.text }],
  };
  if (immunity && scene) data.mechanicalObservations.push({ kind: "condition", id: "immune", owner: "Jo", name: "Physical immunity", ending: "When removed", defenses: [{ kind: "immunity", amount: 0, damageType: "physical" }], message: scene.id, quote: "Jo is immune to physical damage until the ward is removed." } as any);
  if (!attempt) return { changes: [], ...data };
  reads++;
  const action = messages.at(-1).content;
  if (action.includes("vault")) return { risky: true, contested: true, tier: "uncertain", intent: "Vault the barrier", stakes: "Lose the opening", reasons: ["The barrier is watched"], approach: "movement", ...data };
  const mechanicalActions = action.includes("wait") ? [{ kind: "wait", quote: action }]
    : action.includes("step") ? [{ kind: "move", target: "Jo", direction: "away", quote: action }]
    : [{ kind: "ability", ability: "Pulse", target: "Jo", quote: action }];
  return { risky: immunity, contested: immunity, tier: "favorable", intent: "Strike Jo", stakes: "Lose an opening", reasons: ["A clear shot"], approach: "precision", target: "Jo", ...data, mechanicalActions };
}

test("first use can establish a modern encounter from actual scene evidence in the same helper call", async () => {
  bootstrap = false; const id = await chat();
  expect((await state(id)).entities).toBeUndefined();
  await h.say(id, "I use Pulse on Jo.");
  await h.generate(id, async prompt => {
    const reserved = await state(id);
    expect(reserved.resources.find(r => r.id === "battery")?.current).toBe(20);
    expect(actionCount(reserved, "you")).toBe(0);
    expect(prompt.map(m => m.content).join("\n")).toContain('"absorbed":5');
    return "The pulse breaks Jo's shield and strikes home.";
  });
  const after = await state(id);
  expect(after.resources.find(r => r.id === "battery")?.current).toBe(18);
  expect(after.resources.find(r => r.id === "jo-hp")?.current).toBe(25);
  expect(after.resources.find(r => r.id === "shield")?.current).toBe(0);
  expect(actionCount(after, "you")).toBe(1);
  expect(reads).toBe(1);
  await h.generate(id, "Jo reels from the impact.", "swipe");
  expect(await state(id)).toEqual(after);
  expect(reads).toBe(1);
});

test("cooldown waits and range moves use the normal composer, while questions never tick them", async () => {
  const id = await chat();
  await h.say(id, "I use Pulse on Jo."); await h.generate(id, "The pulse connects.");
  await h.say(id, "I use Pulse on Jo."); await h.generate(id, "The device is still recharging.");
  expect(latest(id).notice).toContain("cooling down");
  expect(actionCount(await state(id), "you")).toBe(1);
  const beforeQuestion = reads;
  await h.say(id, "How long until Pulse is ready?"); await h.generate(id, "One more action.");
  expect(reads).toBe(beforeQuestion);
  expect(actionCount(await state(id), "you")).toBe(1);
  await h.say(id, "I wait."); await h.generate(id, "The device finishes recharging.");
  expect(actionCount(await state(id), "you")).toBe(2);
  await h.say(id, "I step away from Jo."); await h.generate(id, "You put more distance between you.");
  expect(distance(await state(id), "you", "Jo")).toBe("far");
  await h.say(id, "I use Pulse on Jo."); await h.generate(id, "Jo is outside its range.");
  expect(latest(id).notice).toContain("outside near range");
  expect((await state(id)).resources.find(r => r.id === "battery")?.current).toBe(18);
  expect(actionCount(await state(id), "you")).toBe(3);
});

test("a favorable model classification cannot roll past a hard defense or charge a rejected action", async () => {
  immunity = true; const id = await chat();
  await h.say(id, "I use Pulse on Jo."); await h.generate(id, "The known immunity prevents that effect.");
  expect(latest(id).notice).toContain("immunity");
  expect(latest(id).decision).toBeFalsy();
  expect(actionCount(await state(id), "you")).toBe(0);
  expect((await state(id)).resources[0].current).toBe(20);
});

test("a normal contested action also advances an established cooldown without spending a second ability cost", async () => {
  const id = await chat();
  await h.say(id, "I use Pulse on Jo."); await h.generate(id, "The pulse connects.");
  await h.say(id, "I try to vault the barrier."); await h.generate(id, "You make your attempt at the barrier.");
  expect(actionCount(await state(id), "you")).toBe(2);
  expect((await state(id)).resources[0].current).toBe(18);
  await h.say(id, "I use Pulse on Jo."); await h.generate(id, "You use the recharged device.");
  expect(actionCount(await state(id), "you")).toBe(3);
  expect((await state(id)).resources[0].current).toBe(16);
});

test("mentioning a guard during affection does not become a defensive action or an extra mechanical read", async () => {
  const id = await chat(), s = await state(id);
  expect(needsMechanicalRead("I smile at the guard.", s)).toBe(false);
  expect(needsMechanicalRead("I guard my flank.", s)).toBe(true);
  expect(needsMechanicalRead("I brace behind cover.", s)).toBe(true);
});
