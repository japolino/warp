import { expect, test } from "bun:test";
import { extractionWindow, freshChanges, chronologicalObservations } from "./read-window.js";
import { emptyMechanics, readMechanicalObservations, applyObservations } from "./mechanics.js";
import { pathOf, type Message, type Record as LivingRecord } from "./world.js";
import { revision } from "../shared/revision.js";
type Saved = Message & { record?: LivingRecord };
const recordOf = (m: Saved) => m.record;
function save(messages: Saved[], reads?: string[]) {
  const last = messages.at(-1)!;
  last.record = { version: 1, path: pathOf(messages.slice(0, -1)), text: revision(last.content), events: [], notes: [], ...(reads ? { reads } : {}) };
}
function story(turns: number) {
  const messages: Saved[] = [{ id: "opening", is_user: false, content: "Jo offers payment for two tasks." }]; save(messages);
  for (let n = 0; n < turns; n++) messages.push({ id: `u${n}`, is_user: true, content: `Player action ${n}.` }, { id: `a${n}`, is_user: false, content: `Actual event ${n}.` });
  return messages;
}

test("a successful later read does not hide earlier missed exchanges; bounded passes recover their actual messages", () => {
  const messages = story(12); save(messages);
  const initial = extractionWindow(messages, recordOf)!;
  expect(initial.pending).toBe(11); expect(initial.messages.length).toBeLessThanOrEqual(14);
  expect(initial.messages.some(m => m.id === "u0")).toBe(true); expect(initial.messages.some(m => m.id === "a0")).toBe(true);
  expect(initial.messages.at(-1)?.id).toBe("a11");
  let reads: string[] = [], passes = 0;
  while (extractionWindow(messages, recordOf)) {
    const window = extractionWindow(messages, recordOf)!;
    expect(window.messages.length).toBeLessThanOrEqual(14);
    reads = [...new Set([...reads, ...window.reads])]; save(messages, reads);
    if (++passes > 5) throw new Error("Missed reads did not converge");
  }
  expect(reads).toContain("a0"); expect(reads).toContain("a10"); expect(passes).toBeLessThanOrEqual(5);
});

test("coverage survives a reload but an edited source invalidates the later coverage record", () => {
  const messages = story(3), window = extractionWindow(messages, recordOf)!; save(messages, window.reads);
  expect(extractionWindow(structuredClone(messages), recordOf)).toBeUndefined();
  messages[2].content = "The first task is actually still unfinished.";
  expect(extractionWindow(messages, recordOf)?.pending).toBe(3);
});

test("first use in an existing long chat takes one bounded snapshot; coverage cannot reference future messages", () => {
  const messages = story(30); delete messages[0].record;
  expect(extractionWindow(messages, recordOf)?.messages).toEqual(messages.slice(-14));
  save(messages, ["future"]); messages.push({ id: "future", is_user: false, content: "A new event." });
  expect(extractionWindow(messages, recordOf)?.pending).toBe(1);
});

test("delayed extraction cannot resurrect a removed fact or replace a newer change", () => {
  const messages = story(3), last = messages.at(-1)!; save(messages);
  last.record!.events.push({ op: "remove", id: "old-offer", evidence: { message: "a2", quote: "Actual event 2." } });
  const older = { op: "put", id: "old-offer", kind: "situation", message: "a0", quote: "Actual event 0." };
  const current = { op: "put", id: "new-fact", kind: "fact", message: "a2", quote: "Actual event 2." };
  expect(freshChanges({ changes: [older, current], scene: {} }, messages, recordOf)).toEqual({ changes: [current], scene: {} });
});

test("a cosmetic helper label can reference the same actual accepted offer, but cannot redirect another party or omit evidence", async () => {
  const data = await Bun.file(new URL("./fixtures/cafe-flash-citations.json", import.meta.url)).json();
  const messages = [{ id: "live-agreement-g", is_user: false, content: data.greeting }, { id: "live-agreement-u1", is_user: true, content: data.turns[0].player }, { id: "live-agreement-r2", is_user: false, content: data.turns[0].reply }];
  const state = applyObservations(emptyMechanics(), readMechanicalObservations([...data.bootstrap.mechanicalObservations, ...data.turns[0].extraction.mechanicalObservations], emptyMechanics(), messages));
  const agreement = state.agreements![0], original = data.turns[0].extraction.mechanicalObservations.find((r: any) => r.kind === "agreement");
  const renamed = { ...original, name: "Cosmetic new label" }, progress = { kind: "agreement_progress", agreement: renamed.name, requirement: agreement.requirements[0].text, message: messages[2].id, quote: messages[2].content };
  expect((chronologicalObservations([progress, renamed], messages, state) as any[]).find(r => r.kind === "agreement_progress").agreement).toBe(agreement.id);
  for (const invalid of [{ ...renamed, owner: "Dex" }, { ...renamed, offer: { ...renamed.offer, quote: "" } }, { ...renamed, quote: "An invented acceptance" }]) {
    expect((chronologicalObservations([progress, invalid], messages, state) as any[]).find(r => r.kind === "agreement_progress").agreement).toBe(renamed.name);
  }
});
