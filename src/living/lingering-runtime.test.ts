import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import type { InterceptorContextDTO } from "lumiverse-spindle-types";
import { makeHost, type HelperCall } from "../backend/test-host.js";
import { getMessages } from "../backend/ledger.js";
import { foldMechanics, MECHANICS_KEY } from "./mechanical-history.js";
import { syncLiving, livingStarted, livingStopped, livingIntercept } from "./runtime.js";
import helperScenes from "./fixtures/lingering-helper-scenes.json";

const h = makeHost("lingering-runtime-owner", false);
const opening = "You have 40 of 50 Health and 20 Energy. Jo stands in the clinic and has 40 of 50 Health. Jo already has 3 Venom accumulated.";
const description = "Burn costs 2 Energy and applies Burning for 3 subsequent affected-owner actions, dealing 5 fire Health damage after each action. Salve costs 1 Energy and clears Burning. Venom adds 2 Venom toward threshold 5 and then applies Slowed for 2 owner actions.";
let previous: unknown, serial = 0, preparations = 0;
beforeAll(async () => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; await import("../backend.ts" + "?lingering-runtime"); (globalThis as any).spindle = previous; });
beforeEach(() => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; preparations = 0; h.helper = helper; });
afterEach(() => { (globalThis as any).spindle = previous; });
const state = async (id: string) => foldMechanics(await getMessages(id));
function helper(c: HelperCall) {
  const attempt = c.system.includes("Determine whether"), entries = JSON.parse(c.user.split(attempt ? "Scene:\n" : "Messages:\n")[1]);
  const greeting = entries.find((m: any) => m.content === opening), id = greeting?.id;
  const source = JSON.parse(c.user.split("\n").find(l => l.startsWith('[{"id":"warp-source:')) ?? "[]").find((s: any) => s.kind === "card");
  const cite = (row: object) => ({ ...row, message: id, quote: opening });
  const def = (name: string, effects: object[], amount = 0) => ({ owner: "you", name, approach: "concentration", target: "either", costs: amount ? [{ kind: "resource", id: "energy", amount }] : [], effects, requires: [], unsupported: [], message: source?.id, quote: description });
  const data = { mechanicalObservations: id ? [
    cite({ kind: "entity", name: "Jo", entityKind: "person", present: true }),
    cite({ kind: "resource", id: "hp", owner: "you", name: "Health", current: 40, max: 50, role: "vital" }),
    cite({ kind: "resource", id: "energy", owner: "you", name: "Energy", current: 20, role: "effort" }),
    cite({ kind: "resource", id: "jo-hp", owner: "Jo", name: "Health", current: 40, max: 50, role: "vital" }),
    cite({ kind: "buildup", owner: "Jo", name: "Venom", current: 3, caster: "you", ability: "Venom" }),
  ] : [], abilityDefinitions: id && source ? [
    def("Burn", [{ kind: "periodic", target: "target", name: "Burning", ending: "After 3 affected-owner actions", duration: 3, cadence: "owner_action", pulse: { kind: "damage", resource: "Health", amount: 5, damageType: "fire" } }], 2),
    def("Salve", [{ kind: "clear_condition", target: "target", name: "Burning" }], 1),
    def("Venom", [{ kind: "buildup", target: "target", name: "Venom", amount: 2, threshold: 5, trigger: { kind: "condition", name: "Slowed", ending: "After 2 owner actions", duration: 2, helps: [], hinders: ["movement"], blocks: [] } }]),
  ] : [] };
  if (!attempt) return { changes: [], ...data, ...(id ? { scene: { place: "clinic", present: ["Jo"], message: id, quote: opening } } : {}) };
  preparations++;
  const action = entries.at(-1).content, name = action.includes("Salve") ? "Salve" : action.includes("Venom") ? "Venom" : "Burn";
  return { risky: false, contested: false, ...data, mechanicalActions: /\bwait\b/.test(action) ? [{ kind: "wait", quote: action }] : [{ kind: "ability", ability: name, target: action.includes("myself") ? "you" : "Jo", quote: action }] };
}
async function chat() {
  const id = `lingering-runtime-${++serial}`; h.chat(id, "", opening);
  Object.assign(h.characters[`char-${id}`], { description, world_book_ids: [] });
  await syncLiving(id, h.userId); return id;
}

test("first-use schedules, pulses and cures use normal chat, saved receipts and one existing preparation pass", async () => {
  const id = await chat();
  expect((await state(id)).buildups![0].current).toBe(3);
  await h.say(id, "I cast Burn on myself.");
  await h.generate(id, async prompt => {
    const before = await state(id);
    expect(before.resources.find(r => r.id === "energy")!.current).toBe(20);
    expect(before.conditions).toEqual([]);
    expect(JSON.stringify(prompt)).toContain("Burning"); return "The recorded burn settles onto you.";
  });
  let saved = await state(id);
  expect(saved.conditions[0].periodic?.remaining).toBe(3); expect(saved.resources.find(r => r.id === "energy")!.current).toBe(18);
  expect(saved.resources.find(r => r.id === "hp")!.current).toBe(40); expect(preparations).toBe(1);
  await h.say(id, '"How many burning pulses remain?"'); await h.generate(id, "Three affected-owner actions remain.");
  expect((await state(id)).conditions).toEqual(saved.conditions); expect(preparations).toBe(1);
  await h.say(id, "I wait."); const waited = await h.generate(id, "The saved burn pulse lands once.");
  saved = await state(id);
  expect(saved.resources.find(r => r.id === "hp")!.current).toBe(35); expect(saved.conditions[0].periodic?.remaining).toBe(2);
  const receipt = (waited.target.extra.spindle_metadata as any)[MECHANICS_KEY]["0"].receipt;
  expect(receipt.engine).toBe(9); expect(receipt.beats.filter((b: any) => b.kind === "pulse")).toHaveLength(1);
  const reads = preparations; await h.generate(id, "The same recorded burn pulse is described differently.", "swipe");
  expect(preparations).toBe(reads); expect(await state(id)).toEqual(saved);
  await syncLiving(id, h.userId); expect(await state(id)).toEqual(saved);
  await h.say(id, "I cast Salve on myself."); await h.generate(id, "The supported salve clears Burning before the next pulse.");
  const cured = await state(id);
  expect(cured.resources.find(r => r.id === "hp")!.current).toBe(35); expect(cured.conditions).toEqual([]);
  expect(cured.resources.find(r => r.id === "energy")!.current).toBe(17);
  expect(h.characters[`char-${id}`].world_book_ids).toEqual([]);
});

test("a stopped refresh cannot debit, pulse or replace the already saved schedule", async () => {
  const id = await chat(); await h.say(id, "I cast Burn on myself."); await h.generate(id, "Burning is applied.");
  const before = await state(id);
  await h.say(id, "I cast Burn on myself."); const target = h.msg(id, `${id}-stopped`, false, "");
  livingStarted({ chatId: id, generationId: "stopped-lingering", targetMessageId: target.id });
  await livingIntercept([{ role: "user", content: "I cast Burn on myself." }], { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO);
  livingStopped({ chatId: id, generationId: "stopped-lingering" });
  expect(await state(id)).toEqual(before);
});

test("initial accumulation is reconstructed after definitions and cannot refill itself after a threshold receipt", async () => {
  const id = await chat(); const before = await state(id);
  expect(before.buildups![0].current).toBe(3);
  await h.say(id, "I cast Venom at Jo."); await h.generate(id, "The recorded exposure reaches the threshold and Jo is Slowed.");
  const after = await state(id);
  expect(after.buildups![0].current).toBe(0); expect(after.conditions.find(c => c.name === "Slowed")?.hinders).toEqual(["movement"]);
  expect(after.growth).toBeUndefined();
  await syncLiving(id, h.userId); expect(await state(id)).toEqual(after);
  await h.say(id, "I cast Venom at Jo."); await h.generate(id, "A new exposure adds only its recorded accumulation.");
  expect((await state(id)).buildups![0].current).toBe(2);
});

test("presently narrated NPC afflictions enter ordinary play without creating a player-owned power or HP pool", async () => {
  const id = `lingering-runtime-${++serial}`, content = "Jo waits in the clinic. Jo is Burning from the flames, until extinguished.";
  h.chat(id, "", content); Object.assign(h.characters[`char-${id}`], { description: "Jo is an adult patient.", world_book_ids: [] });
  h.helper = c => {
    if (c.system.includes("Determine whether")) return { risky: false, contested: false, exchange: true, mechanicalActions: [{ kind: "wait", quote: "I wait." }], responses: [{ actor: "Jo", action: { kind: "wait" }, assessment: { contested: false }, quote: content }] };
    return { changes: [], scene: { place: "clinic", present: ["Jo"], message: `${id}-g`, quote: content }, mechanicalObservations: [{ kind: "periodic", owner: "Jo", name: "Burning", message: `${id}-g`, quote: content, effect: { kind: "periodic", target: "self", name: "Burning", ending: "until extinguished", untilCleared: true, cadence: "owner_action", pulse: { kind: "harm", impact: "minor", damageType: "fire" } } }] };
  };
  await syncLiving(id, h.userId);
  const initial = await state(id);
  expect(initial.entities?.find(e => e.name === "Jo")?.present).toBe(true); expect(initial.conditions[0].periodic?.timingBasis).toBe("warp");
  expect(initial.resources).toEqual([]); expect(initial.abilities).toBeUndefined(); expect(initial.applied).toEqual([]);
  await h.say(id, "I wait."); await h.generate(id, "Jo's recorded ongoing burn pulses once as she waits.");
  const after = await state(id);
  expect(after.conditions.find(c => c.owner === "Jo" && c.injury)?.injury?.load).toBe(1);
  expect(after.resources).toEqual([]); expect(after.abilities).toBeUndefined();
});

test("direct effects retain their actual cause on replay and a later environmental ending preserves damage already taken", async () => {
  const id = `lingering-runtime-${++serial}`, content = "Jo is here. You are Burning from Jo's flames, until extinguished.";
  h.chat(id, "", content); Object.assign(h.characters[`char-${id}`], { description: "Jo is an adult visitor.", world_book_ids: [] });
  h.helper = c => {
    if (c.system.includes("Determine whether")) return { risky: false, contested: false, mechanicalActions: [{ kind: "wait", quote: "I wait." }] };
    const latest = h.messages(id).at(-1)!;
    if (latest.content.includes("stream")) {
      const burning = h.messages(id)[0].extra.spindle_metadata as any;
      const saved = burning.warpMechanics["0"].observations.find((o: any) => o.kind === "periodic");
      return { changes: [], mechanicalObservations: [{ kind: "condition_end", id: saved.value.id, natural: true, ending: "until extinguished", message: latest.id, quote: latest.content }] };
    }
    return { changes: [], scene: { place: "stream bank", present: ["Jo"], message: `${id}-g`, quote: content }, mechanicalObservations: [{ kind: "periodic", owner: "you", caster: "Jo", name: "Burning", message: `${id}-g`, quote: content, effect: { kind: "periodic", target: "self", name: "Burning", ending: "until extinguished", untilCleared: true, cadence: "owner_action", pulse: { kind: "harm", impact: "minor", damageType: "fire" } } }] };
  };
  await syncLiving(id, h.userId);
  const initial = await state(id);
  expect(initial.conditions[0].periodic?.caster).toBe("Jo");
  await syncLiving(id, h.userId); expect(await state(id)).toEqual(initial);
  await h.say(id, "I wait."); await h.generate(id, "The stream puts the flames out; Burning is extinguished.");
  const after = await state(id);
  expect(after.conditions.some(c => c.periodic)).toBe(false);
  expect(after.conditions.find(c => c.injury)?.injury?.load).toBe(1);
  expect(after.resources).toEqual([]); expect(after.abilities).toBeUndefined();
  await syncLiving(id, h.userId); expect(await state(id)).toEqual(after);
});

test("captured helper reads distinguish active effects, confirmed inactive skills, metaphors and past flames", async () => {
  for (const fixture of helperScenes) {
    const id = `lingering-runtime-${++serial}`;
    h.chat(id, "", fixture.message.content);
    h.helper = () => JSON.parse(JSON.stringify(fixture.raw).replaceAll(fixture.message.id, `${id}-g`));
    await syncLiving(id, h.userId);
    const saved = await state(id), effects = saved.conditions.filter(c => c.periodic);
    expect(saved.resources).toEqual([]);
    if (fixture.name !== "inactive-skill") expect(saved.abilities).toBeUndefined();
    if (fixture.name === "fire") {
      expect(effects).toHaveLength(1); expect(effects[0].periodic?.endingRule).toBe("extinguish");
    } else if (fixture.name === "recovery") {
      expect(effects).toHaveLength(1); expect(effects[0].periodic?.endingRule).toBe("recover");
      expect(saved.conditions.find(c => c.category === "physical_injury")?.severity).toBe("minor");
    } else if (fixture.name === "inactive-skill") {
      expect(saved.abilities).toHaveLength(1); expect(effects).toEqual([]);
      expect(saved.applied).toEqual([]); expect(saved.clocks).toBeUndefined();
      const ability = saved.abilities![0];
      h.helper = c => c.system.includes("Determine whether") ? { risky: false, contested: false, mechanicalActions: c.user.includes('"content":"I wait."') ? [{ kind: "wait", quote: "I wait." }] : [{ kind: "ability", ability: ability.id, target: "you", quote: "I activate Spring Tide." }] } : { changes: [] };
      await h.say(id, "I activate Spring Tide."); await h.generate(id, "Spring Tide begins its gentle continuous recovery.");
      const active = await state(id);
      expect(active.conditions.filter(c => c.periodic)).toHaveLength(1);
      expect(active.conditions.find(c => c.category === "physical_injury")?.severity).toBe("minor");
      await h.say(id, "How does my arm look?"); await h.generate(id, "The small burn still needs the next supported recovery pulse.");
      expect((await state(id)).conditions).toEqual(active.conditions);
      await h.say(id, "I wait."); const healed = await h.generate(id, "The recorded recovery pulse completes; your routine burn has healed.");
      expect((healed.target.extra.spindle_metadata as any)[MECHANICS_KEY]["0"].receipt.engine).toBe(9);
      expect((await state(id)).conditions).toEqual([]);
      expect((await state(id)).resources).toEqual([]);
      const completed = await state(id); await syncLiving(id, h.userId); expect(await state(id)).toEqual(completed);
      continue;
    } else expect(saved.conditions).toEqual([]);
    await syncLiving(id, h.userId); expect(await state(id)).toEqual(saved);
  }
});

test("a later scene read cannot turn unresolved activation prose into a free ongoing effect", async () => {
  const id = `lingering-runtime-${++serial}`, opening = "You sit on a shaded bench. You have a small cooking burn.";
  h.chat(id, "", opening);
  h.helper = c => {
    if (c.system.includes("Determine whether")) return { risky: false, contested: false, mechanicalActions: [{ kind: "ability", ability: "Spring Tide", target: "you", quote: "I activate Spring Tide." }] };
    const latest = h.messages(id).at(-1)!;
    return { changes: [], mechanicalObservations: latest.content.includes("invocation") ? [{ kind: "periodic", owner: "you", name: "Spring Tide", message: latest.id, quote: latest.content, effect: { kind: "periodic", target: "self", name: "Spring Tide", endingRule: "recover", cadence: "owner_action", pulse: { kind: "mend", impact: "minor" } } }] : [] };
  };
  await syncLiving(id, h.userId); await h.say(id, "I activate Spring Tide.");
  const target = h.msg(id, `${id}-reply`, false, ""), generationId = `${id}-generation`;
  await h.emit("GENERATION_STARTED", { chatId: id, generationId, targetMessageId: target.id, generationType: "normal" });
  const prompt = await livingIntercept((await getMessages(id)).filter(m => m.content).map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id })), { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO);
  expect(prompt.map(m => m.content).join("\n")).toContain('"status":"blocked"');
  target.content = "You focus inward toward the invocation of Spring Tide."; target.swipes[0] = target.content;
  await h.emit("GENERATION_ENDED", { chatId: id, generationId, messageId: target.id });
  const after = await state(id);
  expect(after.conditions).toEqual([]); expect(after.resources).toEqual([]); expect(after.applied).toEqual([]);
  expect(h.helperCalls.at(-1)!.user).toContain('"status":"blocked"');
  expect(h.helperCalls.at(-1)!.user).toContain("Preparation for this reply");
  await syncLiving(id, h.userId); expect(await state(id)).toEqual(after);
});
