import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { makeHost, type HelperCall } from "../backend/test-host.js";
import { getMessages } from "../backend/ledger.js";
import { foldMechanics } from "./mechanical-history.js";
import { syncLiving } from "./runtime.js";

const h = makeHost("ability-runtime-owner", false);
const initialPersona = "Sam has 10 of 10 Focus and 2 of 10 Composure. Grounding costs 2 Focus and restores 3 Composure.";
let previous: unknown, serial = 0, persona = initialPersona, bootstrap = true, drift = false, reads = 0;
beforeAll(async () => {
  previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake;
  await import("../backend.ts" + "?ability-runtime-test"); (globalThis as any).spindle = previous;
});
beforeEach(() => {
  previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake;
  persona = initialPersona; bootstrap = true; drift = false; reads = 0; h.helper = helper;
  h.fake.macros.resolve = async (text: string) => ({ text: text === "{{user}}" ? "Sam" : text === "{{persona}}" ? persona : text });
  h.fake.world_books.getActivated = async () => [];
  h.fake.world_books.entries.get = async () => null;
});
afterEach(() => { (globalThis as any).spindle = previous; });
const state = async (id: string) => foldMechanics(await getMessages(id));
const latest = (id: string) => [...h.sent].reverse().find(m => m.type === "living" && m.chatId === id);
async function chat() {
  const id = `ability-runtime-${++serial}`; h.chat(id, "", "Jo waits in the café."); h.characters[`char-${id}`].world_book_ids = [];
  await syncLiving(id, h.userId); return id;
}
function helper(c: HelperCall): unknown {
  const isAttempt = c.system.includes("Determine whether");
  if (!isAttempt && !bootstrap) return { changes: [] };
  const source = (JSON.parse(c.user.split("\n").find(line => line.startsWith('[{"id":"warp-source:')) ?? "[]") as any[]).find(s => s.kind === "persona");
  if (!source) throw new Error("Missing persona definition source");
  const cost = persona.includes("costs 1") ? 1 : 2;
  const data = {
    mechanicalObservations: [
      { kind: "resource", id: "focus", owner: "you", name: "Focus", current: 10, max: 10, message: source.id, quote: "10 of 10 Focus" },
      { kind: "resource", id: "composure", owner: "you", name: "Composure", current: 2, max: 10, message: source.id, quote: "2 of 10 Composure" },
    ],
    abilityDefinitions: [{ owner: "you", name: "Grounding", description: "Regain composure", approach: "concentration", target: "self", costs: [{ kind: "resource", id: "focus", amount: drift ? 3 : cost }], effects: [{ kind: "restore", target: "self", resource: "Composure", amount: 3 }], requires: [], unsupported: [], message: source.id, quote: `Grounding costs ${cost} Focus and restores 3 Composure.` }],
  };
  if (!isAttempt) return { changes: [], ...data };
  reads++;
  const action = JSON.parse(c.user.split("Scene:\n")[1]).at(-1).content;
  return { risky: false, contested: false, approach: "concentration", ...data, mechanicalActions: [{ kind: "ability", ability: "Grounding", quote: action }] };
}

test("opening a normal card automatically prepares a persona ability with stable costs and positive effects", async () => {
  const id = await chat(), before = await state(id);
  expect(before.abilities?.[0].name).toBe("Grounding");
  expect(latest(id).notes).toContain("Grounding · 2 Focus");
  expect(h.characters[`char-${id}`].world_book_ids).toEqual([]);
  await h.say(id, "I perform Grounding.");
  await h.generate(id, async prompt => {
    expect((await state(id)).resources[0].current).toBe(10);
    expect(JSON.stringify(prompt)).toContain('after');
    return "You collect your thoughts.";
  });
  const after = await state(id);
  expect(after.resources.find(r => r.id === "focus")?.current).toBe(8);
  expect(after.resources.find(r => r.id === "composure")?.current).toBe(5);
  expect(after.abilities?.[0].costs[0].amount).toBe(2);
  await h.generate(id, "You steady your breathing.", "swipe");
  expect((await state(id)).resources[0].current).toBe(8);
  expect(reads).toBe(1);
});

test("an ability can be prepared on first use without setup or a successful prior scene read", async () => {
  bootstrap = false; const id = await chat();
  expect((await state(id)).abilities).toBeUndefined();
  await h.say(id, "I use Grounding.");
  await h.generate(id, "You take a deliberate breath.");
  const after = await state(id);
  expect(after.abilities?.[0].version).toBe(1);
  expect(after.resources[0].current).toBe(8);
  expect(after.resources[1].current).toBe(5);
  expect(reads).toBe(1);
});

test("the helper cannot change a saved cost on subsequent uses", async () => {
  const id = await chat(); drift = true;
  await h.say(id, "I perform Grounding."); await h.generate(id, "You regain your composure.");
  await h.say(id, "I perform Grounding."); await h.generate(id, "You continue the exercise.");
  const after = await state(id);
  expect(after.resources[0].current).toBe(6);
  expect(after.resources[1].current).toBe(8);
  expect(after.abilities?.[0].version).toBe(1);
});

test("edited persona mechanics create a new version while preserving prior costs and balances", async () => {
  const id = await chat(); await h.say(id, "I perform Grounding."); await h.generate(id, "You focus.");
  persona = initialPersona.replace("costs 2", "costs 1");
  await h.say(id, "I perform Grounding."); await h.generate(id, "You use the improved technique.");
  const after = await state(id);
  expect(after.resources[0].current).toBe(7);
  expect(after.abilities?.[0].version).toBe(2);
  const prefix = (await getMessages(id)).slice(0, 3);
  expect(foldMechanics(prefix).resources[0].current).toBe(8);
  expect(foldMechanics(prefix).abilities?.[0].version).toBe(1);
});

test("asking about a stored ability does not invoke it or trigger an interpretation call", async () => {
  const id = await chat(); await h.say(id, "How much Focus does Grounding use, and what does it restore?");
  await h.generate(id, "Grounding uses 2 Focus and restores 3 Composure.");
  expect(reads).toBe(0);
  expect((await state(id)).resources[0].current).toBe(10);
});

test("removing an ability from the persona does not leave its old mechanics executable", async () => {
  const id = await chat(); persona = "Sam has 10 of 10 Focus and 2 of 10 Composure. Sam no longer knows Grounding.";
  h.helper = c => {
    if (!c.system.includes("Determine whether")) return { changes: [] };
    return { risky: false, contested: false, mechanicalActions: [{ kind: "ability", ability: "Grounding", quote: "I perform Grounding." }] };
  };
  await h.say(id, "I perform Grounding."); await h.generate(id, "This technique is no longer available.");
  expect((await state(id)).resources[0].current).toBe(10);
  expect(latest(id).notice).toContain("source changed");
});

test("activated lore IDs are resolved to source text within the owning user's scope", async () => {
  const requested: string[] = [];
  h.fake.macros.resolve = async (text: string) => ({ text: text === "{{user}}" ? "Sam" : "" });
  h.fake.world_books.getActivated = async (_id: string, userId: string) => { expect(userId).toBe(h.userId); return [{ id: "active-entry", comment: "Grounding", keys: ["grounding"] }]; };
  h.fake.world_books.entries.get = async (id: string, userId: string) => { requested.push(id); expect(userId).toBe(h.userId); return { id, content: initialPersona, disabled: false }; };
  h.helper = c => helper({ ...c, user: c.user.replace('"kind":"lore"', '"kind":"persona"') });
  const id = await chat();
  expect(requested).toEqual(["active-entry"]);
  expect((await state(id)).abilities?.[0].sourceKind).toBe("lore");
});
