// End-to-end tests of the backend against a fake Spindle host: the greeting read, one-click fixes, the contest
// buttons, the one reroll rule, no button lock, "Not an action?", template installs. Inline rulesets only.

import { beforeAll, expect, test } from "bun:test";
import { ADVENTURE_YAML, defaultHelper, defaultJev, GREETING, makeHost, settle, STORY_YAML, type FakeHost, type HelperCall } from "./backend/test-host.js";
import { GREETING_HINT } from "./backend/greeting.js";

const h: FakeHost = makeHost("backend-user");
let n = 0;

beforeAll(async () => {
  (globalThis as any).spindle = h.fake;
  h.helper = defaultHelper;
  h.jev = defaultJev;
  await import("./backend.js");
});

/** A fresh chat on a fixture, opened (the greeting read runs in the background). */
async function open(yaml = ADVENTURE_YAML, greeting: string | null = GREETING) {
  const chatId = `be-${++n}`;
  h.chat(chatId, yaml, greeting);
  await h.frontend({ type: "hello", chatId });
  await settle();
  return chatId;
}
const live = (st: any) => st.choices.filter((c: any) => c.id.startsWith("live:"));

test("T-S1, T-CH5: the turn-0 time, place, people and choices come from the greeting", async () => {
  const chatId = await open();
  const st = h.lastState(chatId);
  expect(st.hud.clock.minutes).toBe(23 * 60 + 40);
  expect(st.hud.location.name).toBe("The Rusty Anchor");
  expect(st.hud.people.find((p: any) => p.name === "Mira").present).toBe(true);
  expect(st.sceneHint).toBeNull();
  expect(live(st)).toHaveLength(3);
  const g = h.messages(chatId)[0];
  expect(h.record(g).events.every((e: any) => e.src === "start")).toBe(true);
  expect(h.record(g).calls).toEqual({ helper: 1, jev: 0 });
  // The first <warp> block opens with the greeting's time, and Mira is here.
  await h.say(chatId, "\"Evening,\" I say.");
  const { injected } = await h.generate(chatId, "Mira nods.");
  expect(injected.split("\n").find((l) => /\d\d:\d\d/.test(l))).toMatch(/23:4\d/);
  expect(injected).toContain("Mira");
  // The read runs once: another hello does not read again.
  h.resetCounts();
  await h.frontend({ type: "hello", chatId });
  await settle();
  expect(h.counts.helper).toBe(0);
});

test("T-CH5: a story gets its three turn-0 choices too", async () => {
  const chatId = await open(STORY_YAML);
  expect(live(h.lastState(chatId))).toHaveLength(3);
});

test("T-S2: the greeting read fails → the fallback clock and a fix hint; a time fix clears the hint", async () => {
  h.helper = (c: HelperCall) => (c.kind === "greeting" ? "sorry, I can't" : defaultHelper(c));
  try {
    const chatId = await open();
    let st = h.lastState(chatId);
    expect(st.hud.clock.minutes).toBe(9 * 60);
    expect(st.sceneHint).toBe(GREETING_HINT);
    // Not retried on every open.
    h.resetCounts();
    await h.frontend({ type: "refresh", chatId });
    await settle();
    expect(h.counts.helper).toBe(0);
    await h.frontend({ type: "fix", chatId, field: "time", value: "21:30" });
    st = h.lastState(chatId);
    expect(st.hud.clock.minutes).toBe(21 * 60 + 30);
    expect(st.sceneHint).toBeNull();
  } finally { h.helper = defaultHelper; }
});

test("T-S6: each greeting swipe gets its own time and place", async () => {
  const chatId = await open();
  const g = h.messages(chatId)[0];
  g.swipes.push("Dawn breaks over the harbour wall; gulls cry overhead."); g.swipe_dates.push(0); g.swipe_id = 1; g.content = g.swipes[1];
  await h.emit("MESSAGE_SWIPED", { chatId, message: g, action: "right", swipeId: 1, previousSwipeId: 0 });
  await settle();
  await h.frontend({ type: "refresh", chatId });
  let st = h.lastState(chatId);
  expect(st.hud.clock.minutes).toBe(6 * 60);
  expect(st.hud.location.name).toBe("The harbour wall");
  g.swipe_id = 0; g.content = g.swipes[0];
  await h.frontend({ type: "refresh", chatId });
  st = h.lastState(chatId);
  expect(st.hud.clock.minutes).toBe(23 * 60 + 40);
});

test("the greeting read with Jev: Jev classifies, the helper writes only texts and choices", async () => {
  await h.settings({ decider: "jev", jevUrl: "https://jev.test/v1/systemone" });
  try {
    h.resetCounts();
    const chatId = await open();
    expect(h.counts).toEqual({ helper: 1, jev: 1 });
    expect(Object.keys(h.jevBatches[0].questions)).toEqual(expect.arrayContaining(["start_phase", "here:mira", "place"]));
    expect(h.helperCalls[0].kind).toBe("writer");
    const st = h.lastState(chatId);
    expect(st.hud.clock.minutes).toBe(22 * 60);
    expect(st.hud.location.name).toBe("Rusty Anchor");
    expect(live(st)).toHaveLength(3);
  } finally { await h.settings({ decider: "llm" }); }
});

test("T-S4: one-click fixes write manual events on the latest message, and the next <warp> block uses them", async () => {
  const chatId = await open();
  await h.frontend({ type: "fix", chatId, field: "place", value: "The fish market" });
  await h.frontend({ type: "fix", chatId, field: "outfit", who: "mira", value: "a yellow oilskin" });
  await h.frontend({ type: "fix", chatId, field: "present", who: "mira", value: false });
  const st = h.lastState(chatId);
  expect(st.hud.location.name).toBe("The fish market");
  expect(st.hud.people.find((p: any) => p.name === "Mira").present).toBe(false);
  const rec = h.record(h.messages(chatId)[0]);
  expect(rec.events.filter((e: any) => e.src === "manual").map((e: any) => e.t)).toEqual(["move", "look", "scene"]);
  await h.say(chatId, "I look around.");
  const { injected } = await h.generate(chatId, "Fish scales glitter on the stones.");
  expect(injected).toContain("The fish market");
  // A bad value says why and changes nothing.
  await h.frontend({ type: "fix", chatId, field: "time", value: "soon" });
  expect(h.lastState(chatId).hud.location.name).toBe("The fish market");
});

test("contest buttons post a move to the chat (Give in / Break off); without a contest nothing is posted", async () => {
  const chatId = await open();
  const before = h.appended.length;
  await h.frontend({ type: "contest", chatId, op: "give_in" });
  expect(h.appended.length).toBe(before);
  const fight = { t: "contest", kind: "fight", opponent: "the bouncer", threat: "hard", dc: 16, src: "narrator" };
  h.record(h.messages(chatId)[0]).events.push({ ...fight });
  await h.frontend({ type: "contest", chatId, op: "break_off" });
  expect(h.appended.at(-1).msg.metadata.warp.intent).toMatchObject({ actionId: "contest:break_off", via: "choice" });
  expect(h.appended.at(-1).opts).toEqual({ triggerGeneration: true });
  // Break off may end the contest (a success gets away), so a fresh one is on before Give in.
  const { record } = await h.generate(chatId, "You try to slip away.");
  record.events.push({ ...fight });
  await h.frontend({ type: "contest", chatId, op: "give_in" });
  expect(h.appended.at(-1).msg.metadata.warp.intent).toMatchObject({ actionId: "contest:give_in", via: "choice" });
});

test("T-C4: one reroll rule — Casual swipes reroll clicked and typed moves; Ironman keeps the roll", async () => {
  for (const casual of [true, false]) {
    await h.settings({ swipesReroll: casual });
    const chatId = await open();
    await h.frontend({ type: "act", chatId, actionId: "live:0" }); // "Vault the bar for the keys" (bold, hard)
    expect(h.appended.at(-1).msg.metadata.warp.intent).toMatchObject({ actionId: "live:bold", params: { difficulty: "hard" } });
    const first = await h.generate(chatId, "You go for it.");
    const second = await h.generate(chatId, "You try again.", "swipe");
    expect(first.record.check).toBeDefined();
    if (casual) expect(second.record.check.seed).not.toBe(first.record.check.seed);
    else { expect(second.record.check.seed).toBe(first.record.check.seed); expect(second.record.check.tier).toBe(first.record.check.tier); }
    // A typed attempt follows the same rule.
    await h.say(chatId, "I try to climb onto the roof.");
    const t1 = await h.generate(chatId, "You reach for the gutter.");
    const t2 = await h.generate(chatId, "You reach again.", "swipe");
    expect(t1.record.check).toBeDefined();
    if (casual) expect(t2.record.check.seed).not.toBe(t1.record.check.seed);
    else expect(t2.record.check.seed).toBe(t1.record.check.seed);
  }
  await h.settings({ swipesReroll: true });
});

test("T-C2: quoted dialogue is never read or rolled", async () => {
  const chatId = await open();
  for (const line of ["\"Hello there.\"", "\"Can I get a drink?\" I ask quietly.", "*smiles* \"Hi, Mira.\"", "“Do you trust me?”"]) {
    h.resetCounts();
    await h.say(chatId, line);
    const { record } = await h.generate(chatId, "Mira answers.");
    expect(h.helperCalls.map((c) => c.kind)).toEqual(["writer"]);
    expect(record.check).toBeUndefined();
  }
});

test("T-CH3: no button lock — a click while the choices are written is posted; the next turn waits for the commit", async () => {
  const chatId = await open();
  await h.say(chatId, "\"Evening,\" I say.");
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((r) => { entered = r; });
  const gate = new Promise<void>((r) => { release = r; });
  h.helper = (c: HelperCall) => {
    if (c.kind !== "writer") return defaultHelper(c);
    entered();
    return gate.then(() => ({ answers: { "stat:health": { choice: "down", confidence: 0.9 } }, choices: [{ label: "Rest by the fire", tag: "careful", difficulty: "none" }] }));
  };
  // Turn 1: the reply lands; its post-reply call hangs.
  const list = h.messages(chatId);
  const t1 = h.msg(chatId, `${chatId}-t1`, false, "");
  await h.emit("GENERATION_STARTED", { generationId: "g1", chatId, targetMessageId: t1.id, generationType: "normal" });
  await h.interceptor([{ role: "user", content: "x" }], { chatId, userId: h.userId, generationType: "normal" });
  t1.content = "Mira pours you a drink.";
  const ending1 = h.emit("GENERATION_ENDED", { generationId: "g1", chatId, messageId: t1.id, content: t1.content, generationType: "normal" });
  await waiting;
  // The player clicks "Rest a while" now: it is posted, not refused.
  const before = h.appended.length;
  await h.frontend({ type: "act", chatId, actionId: "rest" });
  expect(h.appended.length).toBe(before + 1);
  // Turn 2 starts while turn 1 still writes: its interceptor waits for turn 1's commit.
  const t2 = h.msg(chatId, `${chatId}-t2`, false, "");
  await h.emit("GENERATION_STARTED", { generationId: "g2", chatId, targetMessageId: t2.id, generationType: "normal" });
  const intercept2 = h.interceptor([{ role: "user", content: "x" }], { chatId, userId: h.userId, generationType: "normal" });
  await settle();
  release();
  await ending1;
  const out2 = await intercept2;
  // Turn 1 committed its changes (health down) before turn 2 was decided.
  expect(h.record(t1).events.some((e: any) => e.src === "narrator" && e.id === "health")).toBe(true);
  expect(String(out2.messages[out2.breakdown[0].messageIndex].content)).toContain("chose: Rest a while");
  h.helper = defaultHelper;
  t2.content = "You rest.";
  await h.emit("GENERATION_ENDED", { generationId: "g2", chatId, messageId: t2.id, content: t2.content, generationType: "normal" });
  expect(h.record(t2).action.id).toBe("rest");
  expect(h.lastState(chatId).historyConflict).toBeNull();
  void list;
});

test("Not an action?: the latest typed roll is resent as plain roleplay (no roll, never read again)", async () => {
  const chatId = await open();
  await h.say(chatId, "I try to climb the mast.");
  await h.generate(chatId, "You climb.");
  const user = h.messages(chatId).find((m) => m.is_user)!;
  expect(h.meta(user).intent.actionId).toBe("try:body");
  expect(h.lastState(chatId).records.find((r: any) => r.redoFrom === user.id)).toBeDefined();
  await h.frontend({ type: "redo", chatId, userMessageId: user.id, actionId: null });
  const again = h.appended.at(-1);
  expect(again.msg.content).toBe("I try to climb the mast.");
  expect(again.msg.metadata.warp.intent).toBeUndefined();
  expect(again.msg.metadata.warp.judged).toBe(true);
  h.resetCounts();
  const { record } = await h.generate(chatId, "You stay on deck.");
  expect(record.check).toBeUndefined();
  expect(h.helperCalls.map((c) => c.kind)).toEqual(["writer"]);
});

test("templates: install records the template id; switching style replaces that book and keeps its people", async () => {
  const chatId = `be-${++n}`;
  h.chat(chatId, ADVENTURE_YAML, GREETING);
  const charId = `char-${chatId}`;
  h.characters[charId].world_book_ids = [];
  await h.frontend({ type: "hello", chatId });
  const templates = [...h.sent].reverse().find((m) => m.type === "settings").templates as { id: string }[];
  expect(templates.length).toBeGreaterThanOrEqual(2);
  await h.frontend({ type: "install_template", chatId, templateId: templates[0].id });
  // Both templates read the greeting after an install; its push comes last.
  await settle();
  let st = h.lastState(chatId);
  expect(st.status.state).toBe("ok");
  expect(st.status.template).toBe(templates[0].id);
  const firstBook = h.characters[charId].world_book_ids[0];
  // The player's game tracks someone else too (kept across the switch).
  h.books[firstBook].entries.push({ id: "extra", world_book_id: firstBook, comment: "warp-ruleset · people extra", content: "relationships:\n  people:\n    jo: { name: Jo }\n", disabled: true, key: [] });
  await h.frontend({ type: "install_template", chatId, templateId: templates[1].id, replace: true });
  await settle();
  st = h.lastState(chatId);
  expect(st.status.template).toBe(templates[1].id);
  expect(h.characters[charId].world_book_ids).not.toContain(firstBook);
  expect(h.characters[charId].world_book_ids).toHaveLength(1);
  expect(st.hud.people.map((p: any) => p.name)).toContain("Jo");
  // A custom book is not a template install: no switch.
  const custom = `be-${++n}`;
  h.chat(custom, ADVENTURE_YAML, GREETING);
  await h.frontend({ type: "hello", chatId: custom });
  expect(h.lastState(custom).status.template).toBeNull();
  const count = h.characters[`char-${custom}`].world_book_ids.length;
  await h.frontend({ type: "install_template", chatId: custom, templateId: templates[1].id, replace: true });
  expect(h.characters[`char-${custom}`].world_book_ids).toHaveLength(count);
});

test("with the engine: a contest the story starts runs round by round; written moves are contest moves", async () => {
  const chatId = await open();
  h.helper = (c: HelperCall) => (c.kind === "writer" && c.user.includes("pulls a knife")
    ? { answers: { "here:mira": { p: 0.9 }, contest: { choice: "fight", confidence: 0.9 }, threat: { level: 1 } }, choices: [], texts: { foe: "the drunk" } }
    : defaultHelper(c));
  try {
    await h.say(chatId, "\"Easy there,\" I say.");
    await h.generate(chatId, "A drunk at the end of the bar pulls a knife and lunges.");
    let st = h.lastState(chatId);
    expect(st.hud.conflict).toMatchObject({ opponent: "the drunk", round: 0 });
    // The next message is round 1 (no read without Jev: the message is the move), and the writer writes contest moves.
    await h.say(chatId, "I grab his wrist and twist.");
    const { record } = await h.generate(chatId, "You twist; the knife clatters.");
    st = h.lastState(chatId);
    // Rounds 1–2 can never end it.
    expect(st.hud.conflict.round).toBe(1);
    expect(record.check).toBeDefined();
    expect(live(st).map((c: any) => c.label)).toEqual(["Feint left and sweep his legs", "Bait him into over-reaching"]);
    expect(st.choices.some((c: any) => c.id === "contest:break_off")).toBe(true);
  } finally { h.helper = defaultHelper; }
});

test("with the engine: the odds on written choices follow their difficulty words", async () => {
  const chatId = await open();
  const odds = Object.fromEntries(live(h.lastState(chatId)).map((c: any) => [c.label, c.odds]));
  // "Vault the bar" is bold/hard, "Study the lock" clever/fair, both on a stat of 3.
  expect(odds["Vault the bar for the keys"]).toBeLessThan(odds["Study the lock"]);
});

test("a legacy ruleset still plays: its d100 checks and removed keys are warnings, and the move runs without a roll", async () => {
  const legacy = `${ADVENTURE_YAML}
weather: { start: rain }
locations: { docks: { name: The docks } }
`.replace("actions:\n", "actions:\n  study: { label: Study, check: { chance: 50 + mind * 3, label: Mind }, time: 60, effects: { energy: -5 } }\n");
  const chatId = await open(legacy);
  const st = h.lastState(chatId);
  expect(st.status.state).toBe("ok");
  expect(st.status.issues.every((i: any) => i.level === "warning")).toBe(true);
  expect(st.status.issues.find((i: any) => i.where === "Actions › study › check").message).toContain("`legacy` branch");
  await h.frontend({ type: "act", chatId, actionId: "study" });
  const { record } = await h.generate(chatId, "You read until your eyes ache.");
  expect(record.action.id).toBe("study");
  expect(record.check).toBeUndefined();
});

test("without Jev, the call that starts a contest from the story also writes its first moves (not the plain Press on)", async () => {
  const chatId = await open();
  h.helper = (c: HelperCall) => {
    if (c.kind !== "writer" || !c.user.includes("pulls a knife")) return defaultHelper(c);
    expect(c.system).toContain("contest:body (Body)");
    return { answers: { "here:mira": { p: 0.9 }, contest: { choice: "fight", confidence: 0.9 }, threat: { level: 1 } }, choices: [{ label: "Grab the knife arm", tag: "contest:body" }, { label: "Talk him down while backing off", tag: "contest:mind" }], texts: { foe: "the drunk" } };
  };
  try {
    await h.say(chatId, "\"Easy there,\" I say.");
    const { injected } = await h.generate(chatId, "A drunk at the end of the bar pulls a knife and lunges.");
    void injected;
    const st = h.lastState(chatId);
    expect(st.hud.conflict).toMatchObject({ opponent: "the drunk", round: 0 });
    expect(live(st).map((c: any) => c.label)).toEqual(["Grab the knife arm", "Talk him down while backing off"]);
  } finally { h.helper = defaultHelper; }
});
