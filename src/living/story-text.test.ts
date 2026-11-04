import { expect, test } from "bun:test";
import type { Msg } from "../backend/ledger.js";
import { revision } from "../shared/revision.js";
import { pathOf, rawPathOf } from "./world.js";
import { storyContent, cardStoryContent, imageStoryContent, storyExcerpt, storyRevision, STORY_BINDINGS } from "./story-text.js";
import { legacyStoryBindings } from "./story-history.js";
import { foldMechanics, MECHANICS_KEY } from "./mechanical-history.js";
import { applyObservations, emptyMechanics, prepareMechanical, readMechanicalObservations, commitMechanical, readMechanicalPlan } from "./mechanics.js";
import { replayPrompt, PROMPT_KEY } from "./prompt-cache.js";

const image = (id: string) => `<!-- inlay_illustrator -->\n<div data-inlay-illustrator="true" data-image="${id}" title="a > b"><div><img src="${id}"></div></div>\n\n`;
const msg = (id: string, is_user: boolean, content: string, index: number): Msg => ({ id, is_user, content, role: is_user ? "user" : "assistant", index_in_chat: index, swipe_id: 0 } as Msg);

test("a SEED-owned terminal card UI trigger can move without changing the story or prompt path", () => {
  const base = "Echo waits beside Norma.\n\n[STATUS_PANEL: Workshop | calm]\n\n<!--[SEED|aBcD0123456789]-->", marked = `${base}\n★▲3★`;
  expect(storyContent(marked)).toBe("Echo waits beside Norma."); expect(storyRevision(marked)).toBe(storyRevision(base));
  expect(storyRevision(marked)).toBe(storyRevision("Echo waits beside Norma.\n\n"));
  expect(pathOf([msg("reply", false, marked, 0)])).toBe(pathOf([msg("reply", false, base, 0)]));
  for (const text of ["The code is ★▲3★", "★▲3★", "Story\n<!--[SEED|short]-->\n★▲3★", `${base}\n★▲3★\nActual next sentence.`, `${base}\n★▲not-a-number★`]) expect(storyContent(text)).toBe(text);
  expect(storyRevision(marked.replace("Echo waits", "Echo leaves"))).not.toBe(storyRevision(base));
});

test("a paired card footer is omitted from extraction while unpaired status data and ordinary HTML remain", () => {
  const body = "Echo waits beside Norma.", status = "[STATUS_PANEL: Workshop | calm | private thought]", seed = "<!--[SEED|aBcD0123456789]-->";
  expect(storyContent(`${body}\n\n${status}\n\n${seed}`)).toBe(body);
  expect(storyContent(`${body}\n\n\n\n${seed}\n★▲4★`)).toBe(body);
  expect(storyContent(`${body}\n\n${status}`)).toContain(status);
  expect(storyContent(`${body}\n<details>Actual authored status</details>`)).toContain("<details>");
  expect(storyExcerpt(`${body}\n\n${status}\n\n${seed}`, 4800)).not.toContain("private thought");
});

test("legacy evidence can bind before its verified terminal UI trigger disappears without rewriting receipts", () => {
  for (const previous of ["raw", "card"] as const) {
  const prose = "You have 5 coins.", content = `${prose}\n\n[STATUS_PANEL: Workshop | calm]\n\n<!--[SEED|aBcD0123456789]-->`, marked = `${content}\n★▲3★`;
  const oldText = revision(previous === "raw" ? marked : cardStoryContent(marked));
  const opening = msg("opening", false, marked, 0), evidence = { message: opening.id, quote: "You have 5 coins.", sourceRevision: oldText };
  const state = emptyMechanics(); state.resources = [{ id: "coins", owner: "you", name: "Coins", current: 5, source: evidence }];
  opening.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf([]), text: oldText, observations: [{ kind: "resource", value: state.resources[0] }] } } };
  const player = msg("player", true, "I spend 2 coins.", 1), receipt = prepareMechanical(state, "spend", "you", [{ kind: "spend", resource: "coins", amount: 2 }]);
  const reply = msg("reply", false, "You pay two coins.", 2);
  const oldPath = rawPathOf([opening, player].map(m => ({ ...m, content: previous === "card" ? cardStoryContent(m.content) : m.content })));
  reply.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: oldPath, text: revision(reply.content), receipt, observations: [] } } };
  const snapshot = { version: 1, path: oldPath, packet: { established: [], possibleMotives: [], mechanics: {} }, receipt };
  player.metadata = { [PROMPT_KEY]: { "0": snapshot }, warpLivingAttempt: { path: oldPath, receipt } };
  const messages = [opening, player, reply];
  for (const { message, binding } of legacyStoryBindings(messages)) message.metadata = { ...message.metadata, [STORY_BINDINGS]: { "0": binding } };
  const prompt = [{ role: "user" as const, content: player.content, sourceMessageId: player.id }], before = replayPrompt(prompt, messages, "Director"), frozen = JSON.stringify(receipt);
  opening.content = prose;
  const after = foldMechanics(messages); expect(after.resources[0].current).toBe(3); expect(after.applied[0].id).toBe("spend");
  expect(receipt.base).toBe(revision(state)); expect(receipt.changes[0].before).toEqual(state.resources[0]);
  expect(replayPrompt(prompt, messages, "Director")).toEqual(before); expect(JSON.stringify(receipt)).toBe(frozen);
  opening.content = prose.replace("5 coins", "50 coins");
  expect(foldMechanics(messages).resources).toEqual([]);
  }
});
function carrier(markup: string) {
  let hash = 2166136261;
  for (let i = 0; i < markup.length; i++) hash = Math.imul(hash ^ markup.charCodeAt(i), 16777619) >>> 0;
  return `<span class="am-native-asset-suppression" data-inlay-illustrator-suppressed="NAS1${hash.toString(16).padStart(8, "0").toUpperCase()}${markup.length.toString(36).toUpperCase()}" data-inlay-illustrator-suppressed-payload="${encodeURIComponent(markup)}" aria-hidden="true" hidden></span>`;
}

test("verified native asset carriers restore authored tokens without discarding malformed or visible content", () => {
  const token = '<img="Mira_미소 🌙">', hidden = carrier(token);
  expect(storyContent(`Before\n\n${image("picture")}${hidden}\n\nAfter`)).toBe(`Before\n\n${token}\n\nAfter`);
  expect(storyRevision(token)).toBe(storyRevision(hidden));
  for (const invalid of [hidden.replace("NAS1", "NAS2"), hidden.replace("%3C", "%ZZ"), hidden.replace("</span>", "Visible story</span>"), hidden.replace("-suppressed=", "-unrelated=")]) expect(storyContent(invalid)).toBe(invalid);
});

test("native asset conversion preserves a prepared payment and byte-identical historical prompt", () => {
  const token = '<img="Mira_미소">', opening = msg("g", false, `You have 20 Coins.\n\n${token}`, 0), player = msg("u", true, "I pay 5 Coins.", 1), reply = msg("r", false, "Jo receives the payment.", 2);
  const observations = readMechanicalObservations([{ kind: "resource", id: "cash", owner: "you", name: "Coins", current: 20, message: opening.id, quote: "You have 20 Coins." }], emptyMechanics(), [opening]);
  const state = applyObservations(emptyMechanics(), observations), receipt = prepareMechanical(state, "native-payment", "you", [{ kind: "spend", resource: "cash", amount: 5 }]);
  opening.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf([]), text: storyRevision(opening.content), observations } } };
  reply.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf([opening, player]), text: storyRevision(reply.content), observations: [], receipt } } };
  const snapshot = { version: 1, path: pathOf([opening, player]), packet: { established: [], possibleMotives: [], mechanics: {} }, receipt };
  player.metadata = { [PROMPT_KEY]: { "0": snapshot } };
  const history = [opening, player, reply], frozen = JSON.stringify(receipt), prompt = [{ role: "user" as const, content: player.content, sourceMessageId: player.id }];
  const before = replayPrompt(prompt, history, "Director");
  opening.content = opening.content.replace(token, `${image("generated")}${carrier(token)}`);
  expect(foldMechanics(history).resources[0].current).toBe(15);
  expect(replayPrompt(prompt, history, "Director")).toEqual(before);
  expect(JSON.stringify(receipt)).toBe(frozen);
});

test("pre-carrier-normalization records migrate without rewriting paid receipts or blessing later prose edits", () => {
  const token = '<img="Mira_미소">', opening = msg("g", false, `You have 20 Coins.\n\n${image("old")}${carrier(token)}`, 0), player = msg("u", true, "I pay 5 Coins.", 1), reply = msg("r", false, "Jo receives the payment.", 2);
  const history = [opening, player, reply], oldPath = (rows: Msg[]) => rawPathOf(rows.map(m => ({ ...m, content: imageStoryContent(m.content) })));
  const observations = readMechanicalObservations([{ kind: "resource", id: "cash", owner: "you", name: "Coins", current: 20, message: opening.id, quote: "You have 20 Coins." }], emptyMechanics(), [opening]);
  if (observations[0].kind !== "resource") throw new Error("Missing fixture balance");
  observations[0].value.source.sourceRevision = revision(imageStoryContent(opening.content));
  const state = applyObservations(emptyMechanics(), observations), receipt = prepareMechanical(state, "old-carrier-payment", "you", [{ kind: "spend", resource: "cash", amount: 5 }]);
  opening.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: oldPath([]), text: revision(imageStoryContent(opening.content)), observations } } };
  reply.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: oldPath([opening, player]), text: revision(reply.content), observations: [], receipt } } };
  const snapshot = { version: 1, path: oldPath([opening, player]), packet: { established: [], possibleMotives: [], mechanics: {} }, receipt };
  player.metadata = { [PROMPT_KEY]: { "0": snapshot } };
  const frozen = JSON.stringify(receipt), oldSnapshot = JSON.stringify(snapshot);
  for (const { message, binding } of legacyStoryBindings(history)) message.metadata = { ...message.metadata, [STORY_BINDINGS]: { "0": binding } };
  expect(foldMechanics(history)).toEqual(commitMechanical(state, receipt));
  const prompt = [{ role: "user" as const, content: player.content, sourceMessageId: player.id }], before = replayPrompt(prompt, history, "Director");
  opening.content = opening.content.replace("data-image=\"old\"", "data-image=\"new\"").replace(carrier(token), token);
  expect(foldMechanics(history).resources[0].current).toBe(15);
  expect(replayPrompt(prompt, history, "Director")).toEqual(before);
  expect(JSON.stringify(receipt)).toBe(frozen); expect(JSON.stringify(snapshot)).toBe(oldSnapshot);
  opening.content = opening.content.replace("20 Coins", "200 Coins");
  for (const { message, binding } of legacyStoryBindings(history)) message.metadata = { ...message.metadata, [STORY_BINDINGS]: { "0": binding } };
  expect(foldMechanics(history).resources).toEqual([]);
});

test("owned nested image blocks disappear without swallowing prose or authored HTML", () => {
  const prose = 'A guard watches the wagon.\n\n<details><summary>Status</summary>Coins: 3</details>\n\nThe exit is guarded.';
  const decorated = `A guard watches the wagon.\n\n${image("one")}<details><summary>Status</summary>Coins: 3</details>\n\n${image("two")}The exit is guarded.${image("three")}`;
  expect(storyContent(decorated)).toBe(prose);
  expect(storyRevision(decorated)).toBe(storyRevision(prose));
  expect(storyRevision(decorated.replaceAll("one", "regenerated"))).toBe(storyRevision(prose));
  expect(storyRevision(decorated.replace("guard watches", "guard ignores"))).not.toBe(storyRevision(prose));
  const authored = '<svg><path d="M1 2"/></svg><div data-inlay-illustrator="false">Story</div><img src="card.png">';
  expect(storyContent(authored)).toBe(authored);
  const incomplete = 'Story <div data-inlay-illustrator="true"><div>unfinished';
  expect(storyContent(incomplete)).toBe(incomplete);
});

test("the bounded current excerpt contains actual opposition instead of large image attributes", () => {
  const prose = 'A guard watches the wagon.\n\nYou take a bundle. The guards draw their weapons and block the exit.';
  const decorated = prose.replace("\n\n", `\n\n${image("x".repeat(20000))}`);
  expect(storyExcerpt(decorated, 4800)).toBe(prose);
  expect(storyExcerpt("x".repeat(20000), 4800).length).toBeLessThan(4850);
});

test("a verified legacy payment and prompt keep their exact receipt bytes across image regeneration", () => {
  const opening = msg("g", false, `You have 20 Coins.\n\n${image("old")}`, 0), player = msg("u", true, "I pay 5 Coins.", 1), reply = msg("r", false, "Jo receives the payment.", 2);
  const state = applyObservations(emptyMechanics(), readMechanicalObservations([{ kind: "resource", id: "cash", owner: "you", name: "Coins", current: 20, message: opening.id, quote: "You have 20 Coins." }], emptyMechanics(), [opening]));
  // Simulate a pre-upgrade source hash, not a newly canonical observation.
  state.resources[0].source.sourceRevision = revision(opening.content);
  opening.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: rawPathOf([]), text: revision(opening.content), observations: [{ kind: "resource", value: state.resources[0] }] } } };
  const receipt = prepareMechanical(state, "old-payment", "you", [{ kind: "spend", resource: "cash", amount: 5 }], "old-seed");
  reply.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: rawPathOf([opening, player]), text: revision(reply.content), observations: [], receipt } } };
  const snapshot = { version: 1, path: rawPathOf([opening, player]), packet: { established: [], possibleMotives: [], mechanics: {} }, receipt };
  player.metadata = { [PROMPT_KEY]: { "0": snapshot }, warpLivingAttempt: { path: rawPathOf([opening, player]), receipt } };
  const history = [opening, player, reply], frozen = JSON.stringify(receipt);
  expect(foldMechanics(history).resources[0].current).toBe(15);
  for (const { message, binding } of legacyStoryBindings(history)) message.metadata = { ...message.metadata, [STORY_BINDINGS]: { "0": binding } };
  const before = replayPrompt([{ role: "user", content: player.content, sourceMessageId: player.id }], history, "Director");
  opening.content = opening.content.replace("old", "new-image"); reply.content += image("new-reply");
  expect(foldMechanics(history).resources[0].current).toBe(15);
  expect(JSON.stringify(receipt)).toBe(frozen);
  expect(player.metadata?.[PROMPT_KEY]).toEqual({ "0": snapshot });
  expect(replayPrompt([{ role: "user", content: player.content, sourceMessageId: player.id }], history, "Director")).toEqual(before);
  expect(legacyStoryBindings(history)).toEqual([]);
  opening.content = opening.content.replace("20 Coins", "200 Coins");
  expect(foldMechanics(history).resources).toEqual([]);
});

test("migration does not bless an already edited legacy path", () => {
  const opening = msg("g", false, "Original story", 0), reply = msg("r", false, "A response", 1);
  reply.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: rawPathOf([opening]), text: revision(reply.content), observations: [] } } };
  opening.content = `Changed story${image("added")}`;
  expect(legacyStoryBindings([opening, reply])).toEqual([]);
  expect(pathOf([opening])).not.toBe(rawPathOf([opening]));
});

test("legacy agreement IDs, fulfilled clauses and a paid reward survive presentation-only changes", () => {
  const opening = msg("g", false, `Jo waits here. Jo has 20 Coins. You have 3 Coins. Jo says, 'Cover the counter and I will pay 10 Coins.'\n\n${image("old")}`, 0);
  const player = msg("u", true, "I accept and will cover the counter.", 1), done = msg("d", false, "You finish covering the counter. Jo holds out the promised 10 Coins.", 2), reply = msg("r", false, "Jo gives you the agreed payment.", 3);
  const history = [opening, player, done, reply];
  const source = (m: Msg, quote: string) => ({ message: m.id, quote, sourceRevision: revision(m.content) });
  const offer = source(opening, "Jo says, 'Cover the counter and I will pay 10 Coins.'");
  const rows: any[][] = [
    [{ kind: "entity", name: "Jo", entityKind: "person", present: true, ...source(opening, "Jo waits here.") }, { kind: "resource", id: "jo", owner: "Jo", name: "Coins", current: 20, ...source(opening, "Jo has 20 Coins.") }, { kind: "resource", id: "cash", owner: "you", name: "Coins", current: 3, ...source(opening, "You have 3 Coins.") }],
    [{ kind: "agreement", owner: "you", from: "Jo", name: "Counter", offer, requirements: [source(opening, "Cover the counter")], rewards: [{ kind: "resource", asset: "Coins", amount: 10, ...source(opening, "10 Coins") }], ...source(player, player.content) }],
    [{ kind: "agreement_progress", agreement: "Counter", requirement: "Cover the counter", ...source(done, done.content) }, { kind: "reward_ready", agreement: "Counter", reward: "Coins", ready: true, uncontested: true, ...source(done, done.content) }],
  ];
  let state = emptyMechanics();
  for (const [i, raw] of rows.entries()) {
    const observations = readMechanicalObservations(raw, state, history.slice(0, i + 1), undefined, true);
    state = applyObservations(state, observations);
    history[i].metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: rawPathOf(history.slice(0, i)), text: revision(history[i].content), observations } } };
  }
  const agreement = state.agreements![0];
  expect(agreement.requirements[0].done).toBeDefined(); expect(agreement.rewards[0].ready?.allowed).toBe(true);
  const receipt = prepareMechanical(state, "legacy-reward", "you", [{ kind: "claim", agreement: agreement.id, reward: agreement.rewards[0].id }], "seed");
  expect(receipt.status).toBe("ready");
  reply.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: rawPathOf(history.slice(0, -1)), text: revision(reply.content), observations: [], receipt } } };
  const paid = commitMechanical(state, receipt);
  expect(foldMechanics(history)).toEqual(paid);
  for (const { message, binding } of legacyStoryBindings(history)) message.metadata = { ...message.metadata, [STORY_BINDINGS]: { "0": binding } };
  opening.content = opening.content.replace("old", "new"); done.content += image("completion");
  expect(foldMechanics(history)).toEqual(paid);
  expect(foldMechanics(history).resources.map(r => r.current)).toEqual([10, 13]);
});

test("native action classification cannot authorize another action, operation, amount or duplicate", () => {
  const state = emptyMechanics(); state.items.push({ id: "tonic", owner: "you", name: "Tonic", quantity: 3, equipped: false, source: { message: "g", quote: "3 Tonics" } });
  const action = "약 1개를 마신다.", row = { kind: "consume", item: "tonic", amount: 1, quote: action }, native = { action, kind: "consume" };
  expect(readMechanicalPlan([row], state, action, native)).toEqual([{ kind: "consume", item: "tonic", amount: 1 }]);
  expect(() => readMechanicalPlan([row], state, action, { ...native, action: "Different action" })).toThrow();
  expect(() => readMechanicalPlan([row], state, action, { ...native, kind: "transfer" })).toThrow();
  expect(() => readMechanicalPlan([{ ...row, amount: 2 }], state, action, native)).toThrow();
  expect(() => readMechanicalPlan([row, row], state, action, native)).toThrow();
});
