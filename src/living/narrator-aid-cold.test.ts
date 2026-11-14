import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { makeHost, type HelperCall } from "../backend/test-host.js";
import { getMessages } from "../backend/ledger.js";
import { emptyMechanics } from "./mechanics.js";
import { foldMechanics } from "./mechanical-history.js";
import { livingIntercept, livingNarratorAid, livingStopped, registerNarratorAid, syncLiving } from "./runtime.js";
import { PROMPT_KEY } from "./prompt-cache.js";

const h = makeHost("native-aid-cold-owner", false);
const opening = "Jo stands within arm's reach in the clinic. Jo has 10 Focus. You have a small routine cooking burn.";
const profile = "Jo's Mend gently treats routine physical injury at touch range and costs 2 Focus.";
let previous: unknown, active = "", serial = 0, profileScene = false, secondPerson = false, special = false, preparations = 0;
h.fake.permissions = { has: (name: string) => name === "tools" };
h.fake.registerTool = () => {}; h.fake.unregisterTool = () => {};
beforeAll(async () => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; await import("../backend.ts" + "?native-aid-cold"); (globalThis as any).spindle = previous; });
beforeEach(() => { previous = (globalThis as any).spindle; (globalThis as any).spindle = h.fake; profileScene = secondPerson = special = false; preparations = 0; h.helper = helper; });
afterEach(() => { livingStopped({ chatId: active }); (globalThis as any).spindle = previous; });
function helper(call: HelperCall) {
  if (call.system.startsWith("Prepare only")) preparations++;
  const all = h.messages(active), first = all[0], latest = [...all].reverse().find(m => !m.is_user && m.content)!;
  const card = JSON.parse(call.user.split("\n").find(l => l.startsWith('[{"id":"warp-source:')) ?? "[]").find((s: any) => s.kind === "card");
  const cite = (row: object) => ({ ...row, message: profileScene ? card.id : first.id, quote: profileScene ? card.text : first.content });
  return { changes: [], scene: { place: "clinic", present: secondPerson ? ["Jo", "Dex"] : ["Jo"], message: latest.id, quote: latest.content }, mechanicalObservations: [
    cite({ kind: "entity", name: "Jo", entityKind: "person", present: true }), cite({ kind: "distance", from: "you", to: "Jo", band: "touch" }),
    cite({ kind: "resource", id: "focus", owner: "Jo", name: "Focus", role: "effort", current: 10 }),
    cite({ kind: "condition", id: "burn", owner: "you", name: special ? "Lost hand" : "Cooking burn", category: "physical_injury", severity: special ? "major" : "minor", recovery: special ? "special" : "routine", helps: [], hinders: [], blocks: [], ending: "Treatment" }),
    ...(secondPerson ? [cite({ kind: "entity", name: "Dex", entityKind: "person", present: true })] : []),
  ], abilityDefinitions: [{ owner: "Jo", name: "Mend", approach: "concentration", target: "other", range: "touch", costs: [{ kind: "resource", id: "focus", amount: 2 }], effects: [{ kind: "mend", target: "target", impact: "minor" }], requires: [], unsupported: [], message: card.id, quote: profile }] };
}
async function clinic(extra = "") {
  active = `native-cold-${++serial}`; h.chat(active, "", opening + extra); h.characters[`char-${active}`].description = profile;
  await registerNarratorAid(h.userId); return active;
}
async function generate(request: string, narrate: (invoke: (ability?: string) => Promise<any>, invitation: any) => Promise<string>) {
  const id = active; await h.say(id, request);
  const target = h.msg(id, `${id}-reply-${h.messages(id).length}`, false, ""), generationId = `${id}-generation-${h.messages(id).length}`;
  await h.emit("GENERATION_STARTED", { chatId: id, generationId, targetMessageId: target.id, generationType: "normal" });
  const input = (await getMessages(id)).filter(m => m.content).map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id }));
  const wire = await h.interceptor(input, { chatId: id, userId: h.userId, generationType: "normal" });
  const player = [...await getMessages(id)].reverse().find(m => m.is_user)!, invitation = (player.metadata![PROMPT_KEY] as any)["0"].packet.narratorAid;
  const invoke = async (ability = "Mend") => JSON.parse(await livingNarratorAid({ toolName: "npc_aid", requestId: crypto.randomUUID(), args: { actor: "Jo", ability }, contextMessages: wire }, h.userId));
  target.content = await narrate(invoke, invitation); target.swipes[0] = target.content;
  await h.emit("GENERATION_ENDED", { chatId: id, generationId, messageId: target.id, generationType: "normal" });
}

test("an immediate first request prepares the actual scene and NPC ability without an initial scene read", async () => {
  const id = await clinic(); expect(foldMechanics(await getMessages(id))).toEqual(emptyMechanics());
  await generate('"Could you treat my arm?"', async (invoke, invitation) => {
    expect(invitation).toMatchObject({ needsScene: true, actors: [], choices: [] });
    expect((await invoke()).status).toBe("ready"); expect(preparations).toBe(1);
    const staged = foldMechanics(await getMessages(id)); expect(staged.resources[0].current).toBe(10); expect(staged.conditions).toHaveLength(1); expect(staged.applied).toEqual([]);
    return "Jo uses Mend to treat your cooking burn.";
  });
  const after = foldMechanics(await getMessages(id)); expect(after.resources[0].current).toBe(8); expect(after.conditions).toEqual([]); expect(after.applied).toHaveLength(1);
  const saved = structuredClone(after); await syncLiving(id, h.userId); expect(foldMechanics(await getMessages(id))).toEqual(saved);
});

test("a stalled background read can be canceled by the first request without losing native aid or accepting the late read", async () => {
  const id = await clinic(); let entered!: () => void, release!: () => void, hold = true;
  const began = new Promise<void>(r => { entered = r; }), held = new Promise<void>(r => { release = r; });
  h.helper = async call => { if (hold && !call.system.startsWith("Prepare only")) { hold = false; entered(); await held; } return helper(call); };
  const background = syncLiving(id, h.userId); await began;
  await generate('"Could you treat my arm?"', async (invoke, invitation) => {
    expect(invitation.needsScene).toBe(true); expect((await invoke()).status).toBe("ready"); return "Jo uses Mend to treat your cooking burn.";
  });
  release(); await background;
  expect(foldMechanics(await getMessages(id)).resources[0].current).toBe(8); expect(foldMechanics(await getMessages(id)).applied).toHaveLength(1);
}, 10000);

test("profiles cannot supply presence, range or a current injury during cold preparation", async () => {
  const id = await clinic(); profileScene = true;
  h.messages(id)[0].content = "The clinic room is empty.";
  h.characters[`char-${id}`].description = opening + " " + profile;
  await generate('"Could you treat my arm?"', async invoke => {
    expect((await invoke()).status).toBe("blocked"); return "There is no healer in the room yet.";
  });
  const after = foldMechanics(await getMessages(id)); expect(after.applied).toEqual([]); expect(after.resources.some(r => r.current < 10)).toBe(false); expect(after.entities?.some(e => e.present)).not.toBe(true); expect(after.conditions).toEqual([]);
});

test("cold preparation retains other present people and cannot turn an ambiguous request into permission", async () => {
  const id = await clinic(" Dex is standing beside Jo."); secondPerson = true;
  await generate('"Could you treat my arm?"', async invoke => { expect((await invoke()).status).toBe("blocked"); return "Jo asks who you are addressing. No treatment has happened."; });
  const after = foldMechanics(await getMessages(id)); expect(after.entities?.filter(e => e.present && e.name !== "you")).toHaveLength(2); expect(after.applied).toEqual([]); expect(after.resources[0].current).toBe(10);
});

test("addressing an NPC naturally before the question selects them without dropping another present person", async () => {
  const id = await clinic(" Dex is standing beside Jo."); secondPerson = true;
  await generate('"Hey Jo, could you treat my arm?"', async invoke => { expect((await invoke()).status).toBe("ready"); return "Jo uses Mend to treat your cooking burn while Dex watches."; });
  const after = foldMechanics(await getMessages(id)); expect(after.entities?.filter(e => e.present && e.name !== "you")).toHaveLength(2); expect(after.resources[0].current).toBe(8); expect(after.applied).toHaveLength(1);
});

test("an unread quoted price or work condition cannot become free aid even if the helper omits the offer", async () => {
  for (const terms of [" Jo offers Mend for five coins.", " Jo offers Mend if you sweep the steps."]) {
    const id = await clinic(terms);
    await generate('"Could you treat my arm?"', async invoke => { expect((await invoke()).status).toBe("blocked"); expect(preparations).toBe(0); return "Jo repeats the existing terms and waits for your answer."; });
    expect(foldMechanics(await getMessages(id)).applied).toEqual([]);
    // Even if later bookkeeping missed the offer itself, the actual earlier quote still fences a new free call.
    await generate('"Could you treat my arm?"', async invoke => { expect((await invoke()).status).toBe("blocked"); return "Jo keeps the same terms available."; });
    expect(foldMechanics(await getMessages(id)).resources[0].current).toBe(10);
  }
});

test("a sourced special injury remains special during first-use preparation", async () => {
  const id = await clinic(); special = true; h.messages(id)[0].content = "Jo stands within arm's reach in the clinic. Jo has 10 Focus. Your hand is missing after an old amputation.";
  await generate('"Could you treat my arm?"', async invoke => { expect((await invoke()).status).toBe("blocked"); return "Jo explains the limits of routine treatment."; });
  const after = foldMechanics(await getMessages(id)); expect(after.resources[0].current).toBe(10); expect(after.conditions[0].recovery).toBe("special"); expect(after.applied).toEqual([]);
});

test("a current NPC constraint blocks execution without erasing their source-owned skill", async () => {
  const id = await clinic(" Jo is unable to concentrate while a siren sounds.");
  h.helper = call => {
    const result = helper(call);
    result.mechanicalObservations.push({ kind: "condition", id: "disrupted", owner: "Jo", name: "Unable to concentrate", helps: [], hinders: [], blocks: ["concentration"], ending: "The siren stops", message: h.messages(id)[0].id, quote: "Jo is unable to concentrate while a siren sounds." } as any);
    return result;
  };
  await generate('"Could you treat my arm?"', async invoke => {
    expect((await invoke()).status).toBe("blocked");
    const known = foldMechanics(await getMessages(id));
    expect(known.abilities).toHaveLength(1); expect(known.abilities![0].owner).toBe("Jo");
    expect(known.conditions.some(c => c.owner === "Jo" && c.blocks.includes("concentration"))).toBe(true);
    expect(known.resources[0].current).toBe(10); expect(known.applied).toEqual([]);
    return "The siren prevents Jo from concentrating. No treatment has happened.";
  });
  const saved = foldMechanics(await getMessages(id));
  expect(saved.abilities).toHaveLength(1); expect(saved.applied).toEqual([]); expect(saved.resources[0].current).toBe(10);
});

test("an incomplete first-use schema gets one bounded repair and retains actual scene evidence without spending early", async () => {
  const id = await clinic(); let attempts = 0;
  h.helper = call => {
    const result = helper(call);
    if (call.system.startsWith("Prepare only")) {
      attempts++;
      if (attempts === 1) { delete (result.abilityDefinitions[0] as any).requires; delete (result.abilityDefinitions[0].effects[0] as any).target; }
      else { expect(call.user).toContain("one schema repair"); result.mechanicalObservations = []; }
    }
    return result;
  };
  await generate('"Could you treat my arm?"', async invoke => {
    expect((await invoke()).status).toBe("ready"); expect(attempts).toBe(2);
    const staged = foldMechanics(await getMessages(id)); expect(staged.resources[0].current).toBe(10); expect(staged.conditions).toHaveLength(1);
    return "Jo uses Mend to treat your cooking burn.";
  });
  const after = foldMechanics(await getMessages(id)); expect(after.resources[0].current).toBe(8); expect(after.applied).toHaveLength(1); expect(after.conditions).toEqual([]);
});

test("repeatedly incomplete definitions stop after one repair and never supply missing targeting or requirements as defaults", async () => {
  const id = await clinic(); let attempts = 0;
  h.helper = call => {
    const result = helper(call);
    if (call.system.startsWith("Prepare only")) { attempts++; delete (result.abilityDefinitions[0] as any).requires; delete (result.abilityDefinitions[0].effects[0] as any).target; }
    return result;
  };
  await generate('"Could you treat my arm?"', async invoke => {
    expect((await invoke()).status).toBe("blocked"); expect(attempts).toBe(2);
    expect(foldMechanics(await getMessages(id))).toEqual(emptyMechanics());
    return "Jo discusses routine care without performing it yet.";
  });
  expect(foldMechanics(await getMessages(id)).applied).toEqual([]);
});
