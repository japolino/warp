import { expect, test } from "bun:test";
import { applyObservations, commitMechanical, emptyMechanics, mechanicalPacket, prepareMechanical, readMechanicalObservations, type MechanicalState } from "./mechanics.js";
import { focusedAgreements, visibleAgreements } from "./agreements.js";
import { foldMechanics, MECHANICS_KEY } from "./mechanical-history.js";
import { pathOf } from "./world.js";
import { storyRevision } from "./story-text.js";
import type { Msg } from "../backend/ledger.js";

function acceptedJobs() {
  let state = emptyMechanics();
  const messages: Msg[] = [];
  for (let n = 1; n <= 5; n++) {
    const offer = { id: `offer-${n}`, role: "assistant", is_user: false, content: `Jo says, 'If you clean room ${n}, I will pay 2 Coins.'`, swipe_id: 0, index_in_chat: messages.length } as Msg;
    const acceptance = { id: `accept-${n}`, role: "user", is_user: true, content: `I agree to clean room ${n}.`, swipe_id: 0, index_in_chat: messages.length + 1 } as Msg;
    messages.push(offer, acceptance);
    const observations = readMechanicalObservations([{ kind: "agreement", owner: "you", from: "Jo", name: `Clean room ${n}`, offer: { message: offer.id, quote: offer.content }, requirements: [{ message: offer.id, quote: `clean room ${n}` }], rewards: [{ kind: "resource", asset: "Coins", amount: 2, message: offer.id, quote: "2 Coins" }], message: acceptance.id, quote: acceptance.content }], state, messages);
    expect(observations).toHaveLength(1);
    state = applyObservations(state, observations);
    acceptance.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf(messages.slice(0, -1)), text: storyRevision(acceptance.content), observations } } };
  }
  return { state, messages };
}

test("five actual acceptances survive replay without creating their promised money; legacy unmarked reads retain their old cap", () => {
  const { state, messages } = acceptedJobs();
  expect(state.agreements).toHaveLength(5);
  expect(state.agreements!.every(a => a.readerVersion === 2)).toBe(true);
  expect(state.resources).toEqual([]);
  expect(foldMechanics(JSON.parse(JSON.stringify(messages)))).toEqual(state);
  const legacy = structuredClone(messages);
  for (const m of legacy) {
    const saved = m.metadata?.[MECHANICS_KEY] as any;
    for (const o of saved?.["0"].observations ?? []) if (o.kind === "agreement") delete o.value.readerVersion;
  }
  const old = foldMechanics(legacy);
  expect(old.agreements).toHaveLength(3);
  expect(old.agreements!.every(a => a.readerVersion === undefined)).toBe(true);
  expect(old.resources).toEqual([]);
});

test("ordinary focus is bounded while named work, numeric clauses and explicit overviews recall older promises", () => {
  const { state } = acceptedJobs(), before = structuredClone(state);
  expect(focusedAgreements(state.agreements).rows.map(a => a.name)).toEqual(["Clean room 5", "Clean room 4", "Clean room 3"]);
  expect(focusedAgreements(state.agreements, "I clean room 1.").rows[0].name).toBe("Clean room 1");
  expect(mechanicalPacket(state, "List all my agreements").agreements).toHaveLength(5);
  expect(mechanicalPacket(state).agreementLedger).toEqual({ retained: 5, unsettled: 5, shown: 3, overview: false });
  expect(visibleAgreements(state.agreements)).toHaveLength(5);
  expect(state).toEqual(before);
});

test("party aliases recall a whole relationship's promises without matching another person's name", () => {
  const { state } = acceptedJobs();
  state.agreements![4].from = "Major";
  const cast = [{ name: "Jo", displayName: "Josephine", aliases: ["Doctor Jo"] }];
  expect(focusedAgreements(state.agreements, "What do I owe Josephine?", cast).rows.map(a => a.name)).toEqual(["Clean room 1", "Clean room 2", "Clean room 3", "Clean room 4"]);
  expect(focusedAgreements(state.agreements, "What promises did I make to Major?", cast).rows.map(a => a.name)).toEqual(["Clean room 5"]);
  state.agreements![0].cancelled = state.agreements![0].source;
  expect(focusedAgreements(state.agreements, "What do I still owe Jo?", cast).rows).toHaveLength(3);
  expect(focusedAgreements(state.agreements, "List all my promises to Doctor Jo", cast).rows).toHaveLength(4);
});

test("an offscreen older job can be fulfilled and collected exactly once, then replayed with all five agreements intact", () => {
  const context = acceptedJobs(), messages = context.messages;
  let state = context.state;
  expect(mechanicalPacket(state).agreements!.some(a => a.id === state.agreements![0].id)).toBe(false);
  const done = { id: "done", role: "assistant", is_user: false, content: "You finish cleaning room 1. Jo stands beside you. Jo has 10 Coins. You have 0 Coins. Jo holds out 2 Coins as promised.", swipe_id: 0, index_in_chat: messages.length } as Msg;
  messages.push(done);
  const cite = (row: object) => ({ ...row, message: done.id, quote: done.content });
  const observations = readMechanicalObservations([
    cite({ kind: "entity", name: "Jo", entityKind: "person", present: true }),
    cite({ kind: "resource", owner: "Jo", name: "Coins", unit: "coin", role: "money", current: 10 }),
    cite({ kind: "resource", owner: "you", name: "Coins", unit: "coin", role: "money", current: 0 }),
    cite({ kind: "agreement_progress", agreement: state.agreements![0].id, requirement: state.agreements![0].requirements[0].id }),
    cite({ kind: "reward_ready", agreement: state.agreements![0].id, reward: state.agreements![0].rewards[0].id, ready: true }),
  ], state, messages);
  expect(observations).toHaveLength(5);
  state = applyObservations(state, observations);
  done.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf(messages.slice(0, -1)), text: storyRevision(done.content), observations } } };
  const claim = { kind: "claim" as const, agreement: state.agreements![0].id, reward: state.agreements![0].rewards[0].id };
  const receipt = prepareMechanical(state, "collect-first", "you", [claim]);
  expect(receipt.status).toBe("ready");
  const after = commitMechanical(state, receipt);
  expect(after.resources.map(r => r.current)).toEqual([8, 2]);
  expect(after.agreements).toHaveLength(5);
  expect(prepareMechanical(after, "collect-twice", "you", [claim]).status).toBe("blocked");
  const reply: Msg = { ...messages[0], id: "paid", content: "Jo hands you the two coins.", index_in_chat: messages.length, metadata: { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf(messages), text: storyRevision("Jo hands you the two coins."), observations: [], receipt } } } };
  expect(foldMechanics([...messages, reply])).toEqual(after);
  expect(mechanicalPacket(after, "What happened to Clean room 1?").agreements!.find(a => a.id === claim.agreement)?.rewards[0].paid).toBe(true);
});
