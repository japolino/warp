import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { makeHost, type HelperCall } from "../backend/test-host.js";
import { getMessages } from "../backend/ledger.js";
import { foldMechanics } from "./mechanical-history.js";
import { livingNarratorAid, livingIntercept, livingStarted, livingStopped, syncLiving, registerNarratorAid } from "./runtime.js";
import { patchSettings } from "../backend/settings.js";
import { PROMPT_KEY } from "./prompt-cache.js";
import { revision } from "../shared/revision.js";
import type { InterceptorContextDTO, ToolRegistrationDTO } from "lumiverse-spindle-types";

const h = makeHost("native-aid-owner", false), tools: ToolRegistrationDTO[] = [], removed: string[] = [];
const opening = "Jo stands within arm's reach in the clinic. Jo has 10 Focus. You have a small routine cooking burn.";
const profile = "Jo's Mend gently treats routine physical injury at touch range and costs 2 Focus.";
let previous: unknown, serial = 0, active = "", granted = true, currentWire: any[] = [], lateDefinition = false;
h.fake.permissions = { has: (name: string) => granted && name === "tools", getGranted: async () => ["tools"] };
h.fake.registerTool = (tool: ToolRegistrationDTO) => tools.push(tool);
h.fake.unregisterTool = (name: string) => removed.push(name);
beforeAll(async () => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; await import("../backend.ts" + "?native-aid-runtime"); (globalThis as any).spindle = previous; });
beforeEach(() => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; granted = true; lateDefinition = false; h.helper = helper; });
afterEach(() => { livingStopped({ chatId: active }); (globalThis as any).spindle = previous; });
function helper(call: HelperCall) {
  if (call.system.includes("Determine whether")) return { risky: false, contested: false, mechanicalActions: [] };
  const all = h.messages(active), latest = [...all].reverse().find(m => !m.is_user && m.content)!;
  const source = JSON.parse(call.user.split("\n").find(l => l.startsWith('[{"id":"warp-source:')) ?? "[]").find((s: any) => s.kind === "card");
  const cite = (row: object) => ({ ...row, message: all[0].id, quote: opening });
  return { changes: [], scene: { place: "clinic", present: ["Jo"], message: latest.id, quote: latest.content }, mechanicalObservations: [
    cite({ kind: "entity", name: "Jo", entityKind: "person", present: true }), cite({ kind: "distance", from: "you", to: "Jo", band: "touch" }), cite({ kind: "resource", id: "focus", owner: "Jo", name: "Focus", current: 10, role: "effort" }), cite({ kind: "condition", id: "burn", owner: "you", name: "Cooking burn", category: "physical_injury", severity: "minor", recovery: "routine", helps: [], hinders: ["movement"], blocks: [], ending: "Treatment" }),
  ], abilityDefinitions: lateDefinition && !call.system.startsWith("Prepare only") ? [] : [{ owner: "Jo", name: "Mend", approach: "concentration", target: "other", range: "touch", costs: [{ kind: "resource", id: "focus", amount: 2 }], effects: [{ kind: "mend", target: "target", impact: "minor" }], requires: [], unsupported: [], message: lateDefinition ? all.find(m => m.is_user)!.id : source.id, quote: profile }] };
}
async function clinic() {
  active = `native-aid-${++serial}`; h.chat(active, "", opening); h.characters[`char-${active}`].description = profile;
  await syncLiving(active, h.userId); return active;
}
async function invoke(turn: string | undefined, actor = "Jo", ability?: string, owner = h.userId) {
  return JSON.parse((await livingNarratorAid({ toolName: "npc_aid", requestId: crypto.randomUUID(), args: { ...(turn === undefined ? {} : { turn }), actor, ability: ability ?? foldMechanics(await getMessages(active)).abilities![0].id }, contextMessages: currentWire }, owner))!);
}
async function invitation() {
  const player = [...await getMessages(active)].reverse().find(m => m.is_user)!;
  return (player.metadata![PROMPT_KEY] as any)["0"].packet.narratorAid;
}
async function generate(id: string, reply: (wire: any[]) => Promise<string>) {
  const target = h.msg(id, `${id}-reply-${h.messages(id).length}`, false, ""), generationId = crypto.randomUUID();
  await h.emit("GENERATION_STARTED", { chatId: id, generationId, targetMessageId: target.id, generationType: "normal" });
  const input = (await getMessages(id)).filter(m => m.content).map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id }));
  const output = await h.interceptor(input, { chatId: id, userId: h.userId, generationType: "normal" }); currentWire = output;
  target.content = await reply(output); target.swipes[target.swipe_id] = target.content;
  await h.emit("GENERATION_ENDED", { chatId: id, generationId, messageId: target.id, generationType: "normal" });
}

test("the real runtime exposes a static tool, stages the narrator's chosen aid before prose, and commits once after successful narration", async () => {
  const id = await clinic(), original = foldMechanics(await getMessages(id));
  expect(tools).toHaveLength(1); expect(tools[0].inline_available).toBe(true);
  await h.say(id, '"Could you treat my arm?"');
  let priorWire: any[] = [], token = "";
  await generate(id, async wire => {
    priorWire = structuredClone(wire); const offered = await invitation(); token = offered.turn;
    expect(offered.choices).toHaveLength(1);
    expect((await invoke(token, "Jo", undefined, "another-user")).status).toBe("blocked");
    const originalWire = currentWire; currentWire = [{ role: "user", content: "A different chat" }];
    expect((await invoke(token)).status).toBe("blocked"); currentWire = originalWire;
    currentWire = structuredClone(originalWire); currentWire.at(-1)!.content = currentWire.at(-1)!.content.replace('"tool":"npc_aid"', '"tool":"forged_tool"');
    expect((await invoke(undefined)).status).toBe("blocked"); currentWire = originalWire;
    const results = await Promise.all([invoke(token), invoke(undefined)]);
    expect(results[0].status).toBe("ready"); expect(results[1]).toEqual(results[0]);
    expect(results[0].receipt.events.find((e: any) => e.kind === "mend").actor).toBe("Jo");
    expect(foldMechanics(await getMessages(id))).toEqual(original);
    return "Jo chooses to help and uses Mend to treat your cooking burn.";
  });
  const after = foldMechanics(await getMessages(id));
  expect(after.resources[0].current).toBe(8); expect(after.conditions).toEqual([]); expect(after.applied).toHaveLength(1);
  expect((await invoke(token)).status).toBe("blocked");
  expect(h.helperCalls.at(-1)!.user).toContain('"status":"ready"');
  const saved = revision(after); await syncLiving(id, h.userId); expect(revision(foldMechanics(await getMessages(id)))).toBe(saved);
  await h.say(id, '"Thank you."');
  await generate(id, async wire => {
    // Tool results never rewrite a previously published prompt block.
    const old = priorWire.filter(m => typeof m.content === "string" && m.content.includes("<warp>"));
    expect(old.every(m => wire.some(n => JSON.stringify(m) === JSON.stringify(n)))).toBe(true);
    expect(wire.at(-1).content).toContain('"narratorAid":null');
    return "Jo nods and goes back to the desk.";
  });
  expect(foldMechanics(await getMessages(id)).resources[0].current).toBe(8);
});

test("refusal and ignored tools execute nothing; revoked access and edited requests cannot reuse a live token", async () => {
  const id = await clinic(); await h.say(id, '"Could you treat my arm?"');
  await generate(id, async () => {
    const { turn } = await invitation(); granted = false;
    expect((await invoke(turn)).status).toBe("blocked"); granted = true;
    const player = h.messages(id).find(m => m.is_user)!; player.content = "Actually, I withdraw that request.";
    expect((await invoke(turn)).status).toBe("blocked");
    return "Jo respects the withdrawn request and offers no treatment.";
  });
  expect(foldMechanics(await getMessages(id)).resources[0].current).toBe(10);
  expect(foldMechanics(await getMessages(id)).conditions).toHaveLength(1);
});

test("stopping a prepared narrator action spends nothing and a replacement generation rejects the old token", async () => {
  const id = await clinic(); await h.say(id, '"Could you treat my arm?"');
  const target = h.msg(id, `${id}-target`, false, "");
  livingStarted({ chatId: id, generationId: "stopped", targetMessageId: target.id, generationType: "normal" });
  const input = (await getMessages(id)).filter(m => m.content).map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id }));
  currentWire = await livingIntercept(input, { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO);
  const first = await invitation(), oldWire = currentWire; expect((await invoke(first.turn)).status).toBe("ready");
  livingStopped({ chatId: id, generationId: "stopped" });
  expect(foldMechanics(await getMessages(id)).resources[0].current).toBe(10);
  livingStarted({ chatId: id, generationId: "replacement", targetMessageId: target.id, generationType: "normal" });
  currentWire = await livingIntercept(input, { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO);
  const second = await invitation(); expect(second.turn).not.toBe(first.turn);
  expect((await invoke(first.turn)).status).toBe("blocked");
  const newWire = currentWire; currentWire = oldWire; expect((await invoke(undefined)).status).toBe("blocked"); currentWire = newWire;
  expect((await invoke(undefined)).status).toBe("ready");
  expect(foldMechanics(await getMessages(id)).resources[0].current).toBe(10);
});

test("first-use preparation compiles only the source-backed NPC capability once and replays its saved definition and action", async () => {
  lateDefinition = true;
  const id = await clinic(); expect(foldMechanics(await getMessages(id)).abilities ?? []).toEqual([]);
  const calls = h.helperCalls.length;
  await h.say(id, '"Could you treat my arm?"');
  await generate(id, async () => {
    const offered = await invitation(); expect(offered.actors).toEqual(["Jo"]); expect(offered.choices).toEqual([]);
    const result = await Promise.all([invoke(offered.turn, "Jo", "Mend"), invoke(offered.turn, "Jo", "Mend")]);
    expect(result[0].status).toBe("ready"); expect(result[1]).toEqual(result[0]);
    const staged = foldMechanics(await getMessages(id));
    expect(staged.abilities).toHaveLength(1); expect(staged.resources[0].current).toBe(10); expect(staged.conditions).toHaveLength(1);
    return "Jo chooses to help and uses Mend to treat your cooking burn.";
  });
  expect(h.helperCalls.slice(calls).filter(c => c.system.startsWith("Prepare only"))).toHaveLength(1);
  const after = foldMechanics(await getMessages(id)); expect(after.resources[0].current).toBe(8); expect(after.conditions).toEqual([]);
  const replay = revision(after); await syncLiving(id, h.userId); expect(revision(foldMechanics(await getMessages(id)))).toBe(replay);
});

test("unsupported first-use powers and ordinary NPC refusal spend nothing", async () => {
  lateDefinition = true; const id = await clinic(); await h.say(id, '"Could you treat my arm?"');
  await generate(id, async () => {
    expect((await invoke((await invitation()).turn, "Jo", "Miracle regeneration")).status).toBe("blocked");
    return "Jo discusses what ordinary treatment could help. No treatment has happened yet.";
  });
  const after = foldMechanics(await getMessages(id)); expect(after.resources[0].current).toBe(10); expect(after.conditions).toHaveLength(1); expect(after.abilities ?? []).toEqual([]);
  await h.say(id, '"Could you treat my arm?"');
  const calls = h.helperCalls.length;
  await generate(id, async () => "Jo declines to help right now.");
  expect(h.helperCalls.slice(calls).some(c => c.system.startsWith("Prepare only"))).toBe(false);
  expect(foldMechanics(await getMessages(id)).resources[0].current).toBe(10);
});

test("a generic first-aid source cannot compile a cure tied to the current wound's name", async () => {
  lateDefinition = true; const id = await clinic();
  h.helper = call => {
    const result = helper(call);
    if (call.system.startsWith("Prepare only")) result.abilityDefinitions![0].effects = [{ kind: "clear_condition", target: "target", name: "cooking burn" }] as any;
    return result;
  };
  await h.say(id, '"Could you treat my arm?"');
  await generate(id, async () => {
    expect((await invoke((await invitation()).turn, "Jo", "Mend")).status).toBe("blocked");
    return "Jo discusses appropriate care. No treatment has happened yet.";
  });
  const after = foldMechanics(await getMessages(id)); expect(after.abilities ?? []).toEqual([]); expect(after.resources[0].current).toBe(10); expect(after.conditions).toHaveLength(1);
});

test("stopping during first-use preparation cannot publish definitions, reserve a use or spend costs", async () => {
  lateDefinition = true; const id = await clinic(); await h.say(id, '"Could you treat my arm?"');
  const target = h.msg(id, `${id}-target`, false, ""), generationId = "cancel-first-use";
  livingStarted({ chatId: id, generationId, targetMessageId: target.id, generationType: "normal" });
  currentWire = await livingIntercept((await getMessages(id)).filter(m => m.content).map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id })), { chatId: id, userId: h.userId, generationType: "normal" } as InterceptorContextDTO);
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(r => { entered = r; }), held = new Promise<void>(r => { release = r; });
  h.helper = async call => { if (call.system.startsWith("Prepare only")) { entered(); await held; } return helper(call); };
  const result = invoke((await invitation()).turn, "Jo", "Mend");
  await started; livingStopped({ chatId: id, generationId });
  expect((await result).status).toBe("blocked"); release();
  const after = foldMechanics(await getMessages(id)); expect(after.abilities ?? []).toEqual([]); expect(after.applied).toEqual([]); expect(after.resources[0].current).toBe(10);
});

test("pausing the last enabled user removes the schema; resuming restores the identical schema", async () => {
  await clinic(); const count = tools.length;
  await patchSettings({ enabled: false }, h.userId); await registerNarratorAid(h.userId);
  expect(removed.at(-1)).toBe("npc_aid"); expect(tools).toHaveLength(count);
  await patchSettings({ enabled: true }, h.userId); await registerNarratorAid(h.userId);
  expect(tools).toHaveLength(count + 1); expect(tools.at(-1)).toEqual(tools[0]);
});
