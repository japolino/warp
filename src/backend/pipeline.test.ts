// The turn budget (CORE-DESIGN §2.0.3, JEV-ROUTING §5.2, §7): narrator + at most 1 helper call per ordinary
// turn; the one exception is a typed risky attempt without Jev (2). With Jev, Jev answers every
// classification question and the helper only writes. Counted with a fake host; no real model calls.

import { beforeAll, expect, test } from "bun:test";
import { ADVENTURE_YAML, defaultHelper, defaultJev, GREETING, JEV_TEST_URL, makeHost, settle, STORY_YAML, type FakeHost } from "./test-host.js";

const h: FakeHost = makeHost("pipeline-user");

beforeAll(async () => {
  (globalThis as any).spindle = h.fake;
  h.helper = defaultHelper;
  h.jev = defaultJev;
  await import("../backend.ts" + "?pipeline");
});

type Style = "story" | "adventure";
type Provider = "helper" | "jev";
type Kind = "typed dialogue" | "typed action" | "typed attempt" | "clicked choice" | "contest round (typed)" | "contest round (clicked)";
interface Row { style: Style; provider: Provider; kind: Kind; helper: number; jev: number; calls: { helper: number; jev: number } | undefined; asked: string[][]; helperKinds: string[]; rolled: boolean }

const REPLY = "Mira sets a glass down and studies you. \"Rough night out there?\"";
let n = 0;

/** Open a chat (greeting read in the background), play one ordinary turn, then measure the turn of `kind`. */
async function measure(style: Style, provider: Provider, kind: Kind): Promise<Row> {
  const chatId = `pipe-${++n}`;
  h.chat(chatId, style === "story" ? STORY_YAML : ADVENTURE_YAML, GREETING);
  await h.settings(provider === "jev" ? { decider: "jev", jevUrl: JEV_TEST_URL } : { decider: "llm" });
  await h.frontend({ type: "hello", chatId });
  await settle();
  await h.say(chatId, "\"Evening,\" I say, shaking off the rain.");
  const first = await h.generate(chatId, REPLY);
  if (kind.startsWith("contest")) {
    // A fight is on (as the story would start it); one typed round makes the writer write contest moves.
    first.record.events.push({ t: "contest", kind: "fight", opponent: "the bouncer", threat: "fair", dc: 12, src: "narrator" });
    if (kind === "contest round (clicked)") { await h.say(chatId, "I raise my fists."); await h.generate(chatId, "The bouncer squares up."); }
  }
  h.resetCounts();
  if (kind === "typed dialogue") await h.say(chatId, "\"How long have you run this place?\" I ask.");
  else if (kind === "typed action") await h.say(chatId, "I sit down at the bar and look around the room for an empty table.");
  else if (kind === "typed attempt") await h.say(chatId, "I try to vault over the bar and grab the keys before the guard turns around.");
  else if (kind === "contest round (typed)") await h.say(chatId, "I swing at him with everything I have.");
  else await h.frontend({ type: "act", chatId, actionId: "live:0" });
  const { record } = await h.generate(chatId, "The rain keeps falling as the moment passes.");
  return {
    style, provider, kind, helper: h.counts.helper, jev: h.counts.jev, calls: record?.calls,
    asked: h.jevBatches.map((b) => Object.keys(b.questions)), helperKinds: h.helperCalls.map((c) => c.kind),
    rolled: !!record?.check,
  };
}

const rows: Row[] = [];

test("calls per turn: Story/Adventure × helper/Jev × typed dialogue / typed attempt / clicked choice / contest round", async () => {
  for (const style of ["story", "adventure"] as const) for (const provider of ["helper", "jev"] as const) {
    const kinds: Kind[] = ["typed dialogue", "typed action", "typed attempt", "clicked choice", ...(style === "adventure" ? ["contest round (typed)", "contest round (clicked)"] as Kind[] : [])];
    for (const kind of kinds) rows.push(await measure(style, provider, kind));
  }
  console.log(["style | provider | turn | helper | jev", ...rows.map((r) => `${r.style} | ${r.provider} | ${r.kind} | ${r.helper} | ${r.jev}`)].join("\n"));
  for (const r of rows) {
    const where = `${r.style}/${r.provider}/${r.kind}`;
    // The meter on the record matches the host's counters.
    expect({ where, calls: r.calls }).toEqual({ where, calls: { helper: r.helper, jev: r.jev } });
    // The budget: one helper call, except a typed risky attempt in Adventure without Jev (the read + the writer).
    const exception = r.style === "adventure" && r.provider === "helper" && r.kind === "typed attempt";
    expect({ where, helper: r.helper }).toEqual({ where, helper: exception ? 2 : 1 });
    if (r.provider === "helper") expect({ where, jev: r.jev }).toEqual({ where, jev: 0 });
    else {
      // Jev answers every classification: the helper only writes (no typed questions in its prompt).
      expect({ where, helperKinds: r.helperKinds }).toEqual({ where, helperKinds: ["writer"] });
      expect(r.asked.some((q) => q.includes("time"))).toBe(true);
      expect(r.jev).toBeLessThanOrEqual(4);
    }
  }
  const row = (style: Style, provider: Provider, kind: Kind) => rows.find((r) => r.style === style && r.provider === provider && r.kind === kind)!;
  // Quoted dialogue never reaches a model as an action; a story never reads typed text.
  for (const provider of ["helper", "jev"] as const) for (const style of ["story", "adventure"] as const) {
    expect(row(style, provider, "typed dialogue").asked.some((q) => q.includes("action"))).toBe(false);
    expect(row(style, provider, "typed dialogue").helperKinds).not.toContain("read");
  }
  expect(row("story", "jev", "typed attempt").asked.some((q) => q.includes("action"))).toBe(false);
  expect(row("story", "helper", "typed attempt").helperKinds).toEqual(["writer"]);
  // The typed attempt is read before the reply (by Jev, or by the helper) and rolled.
  expect(row("adventure", "jev", "typed attempt").asked[0]).toContain("action");
  expect(row("adventure", "jev", "typed attempt").rolled).toBe(true);
  expect(row("adventure", "helper", "typed attempt").helperKinds).toEqual(["read", "writer"]);
  expect(row("adventure", "helper", "typed attempt").rolled).toBe(true);
  // In a contest without Jev there is no read: the message is the move (never two helper calls).
  expect(row("adventure", "helper", "contest round (typed)").helperKinds).toEqual(["writer"]);
  // With Jev the contest read asks only the approach and the exit.
  const contestRead = row("adventure", "jev", "contest round (typed)").asked[0];
  expect(contestRead).toContain("exit");
  expect(contestRead).not.toContain("action");
  // Jev order after the reply: A (bookkeeping) before the writer, then B (difficulty of the written choices).
  const click = row("adventure", "jev", "clicked choice").asked;
  expect(click[0]).toContain("time");
  expect(click.at(-1)!.some((k) => k.startsWith("diff:"))).toBe(true);
});

test("Jev's bookkeeping fails: the helper answers the same questions in its one call (still 1 helper call)", async () => {
  const chatId = `pipe-${++n}`;
  h.chat(chatId, ADVENTURE_YAML, GREETING);
  await h.settings({ decider: "jev", jevUrl: JEV_TEST_URL });
  await h.frontend({ type: "hello", chatId });
  await settle();
  await h.say(chatId, "\"Evening,\" I say.");
  h.resetCounts();
  h.jevDown = true;
  try {
    const { record } = await h.generate(chatId, REPLY);
    expect(h.counts.helper).toBe(1);
    expect(h.helperCalls[0].system).toContain('"answers"');
    expect(record.calls).toEqual({ helper: 1, jev: 1 });
  } finally { h.jevDown = false; }
});

test("a swipe of a typed turn reuses the saved verdict: no typed read, no odds call", async () => {
  const chatId = `pipe-${++n}`;
  h.chat(chatId, ADVENTURE_YAML, GREETING);
  await h.settings({ decider: "jev", jevUrl: JEV_TEST_URL });
  await h.frontend({ type: "hello", chatId });
  await settle();
  await h.say(chatId, "I try to climb the drainpipe to the window.");
  const first = await h.generate(chatId, "You haul yourself up.");
  expect(first.record.action?.id).toBe("try:body");
  h.resetCounts();
  const again = await h.generate(chatId, "Your hand slips on the wet metal.", "swipe");
  expect(h.jevBatches.some((b) => "action" in b.questions)).toBe(false);
  expect(again.record.action?.id).toBe("try:body");
  expect(again.record.calls.jev).toBeLessThanOrEqual(2);
});

test("decide blocks: Jev gives odds just in time (and the swipe reuses them); without Jev the author's weights, no extra call", async () => {
  const yaml = ADVENTURE_YAML.replace("actions:\n", "actions:\n  ask_out: { label: Ask Mira to dance, effects: { decide: { ask: \"Does Mira say yes to {{user}}?\", options: { yes: { desc: \"Says yes\", weight: 1 }, no: { desc: \"Says no\", weight: 1 } } } } }\n");
  for (const provider of ["jev", "helper"] as const) {
    const chatId = `pipe-${++n}`;
    h.chat(chatId, yaml, GREETING);
    await h.settings(provider === "jev" ? { decider: "jev", jevUrl: JEV_TEST_URL } : { decider: "llm" });
    await h.frontend({ type: "hello", chatId });
    await settle();
    h.resetCounts();
    await h.frontend({ type: "act", chatId, actionId: "ask_out" });
    const { record } = await h.generate(chatId, "Mira laughs.");
    expect(record.decisions?.[0].source).toBe(provider === "jev" ? "model" : "weights");
    expect(h.counts.helper).toBe(1);
    if (provider === "jev") {
      expect(Object.keys(h.jevBatches[0].questions)[0]).toMatch(/^decide:/);
      expect(record.calls.jev).toBe(h.counts.jev);
      h.resetCounts();
      const again = await h.generate(chatId, "Mira smiles.", "swipe");
      expect(h.jevBatches.some((b) => Object.keys(b.questions).some((k) => k.startsWith("decide:")))).toBe(false);
      expect(again.record.decisions?.[0].source).toBe("model");
    } else expect(h.counts.jev).toBe(0);
  }
  await h.settings({ decider: "llm" });
});
