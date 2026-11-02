import { expect, test } from "bun:test";
import { revision } from "../shared/revision.js";
import { emptyMechanics, applyObservations, readMechanicalObservations, prepareMechanical, commitMechanical, readMechanicalPlan, receiptPacket, type MechanicalState, type MechanicalOperation } from "./mechanics.js";
import { agreementDone } from "./agreements.js";
import { foldMechanics, MECHANICS_KEY } from "./mechanical-history.js";
import { pathOf, type Message } from "./world.js";
import type { Msg } from "../backend/ledger.js";

const opening: Message = { id: "offer", is_user: false, content: "Jo waits beside you in the café. Jo has 20 Coins and 3 Pastry. You have 3 Coins. Jo says, 'If you cover the counter and clean the cups, I will give you 10 Coins and one Pastry.'" };
const acceptance: Message = { id: "acceptance", is_user: true, content: "I accept. I will cover the counter and clean the cups." };
const terms = "Jo says, 'If you cover the counter and clean the cups, I will give you 10 Coins and one Pastry.'";
const root = { kind: "agreement", owner: "you", name: "Help at the café", from: "Jo", offer: { message: opening.id, quote: terms }, requirements: ["cover the counter", "clean the cups"].map(quote => ({ message: opening.id, quote })), rewards: [
  { kind: "resource", asset: "Coins", amount: 10, message: opening.id, quote: "10 Coins" },
  { kind: "item", asset: "Pastry", amount: 1, message: opening.id, quote: "one Pastry" },
], message: acceptance.id, quote: acceptance.content };
const shift: Message = { id: "shift", is_user: false, content: "You cover the counter until the end of your shift." };
const cups: Message = { id: "cups", is_user: false, content: "You finish cleaning all the cups. Jo holds out your 10 Coins and one Pastry as promised." };
const observe = (s: MechanicalState, raw: unknown[], messages: Message[]) => applyObservations(s, readMechanicalObservations(raw, s, messages, "Sam"));
function setup() {
  const rows = [
    { kind: "entity", name: "Jo", entityKind: "person", present: true, message: opening.id, quote: "Jo waits beside you in the café." },
    { kind: "resource", owner: "Jo", name: "Coins", role: "money", current: 20, message: opening.id, quote: "Jo has 20 Coins" },
    { kind: "resource", owner: "you", name: "Coins", role: "money", current: 3, message: opening.id, quote: "You have 3 Coins." },
    { kind: "item", owner: "Jo", name: "Pastry", quantity: 3, message: opening.id, quote: "Jo has 20 Coins and 3 Pastry." },
  ];
  const observations = readMechanicalObservations([...rows, root], emptyMechanics(), [opening, acceptance], "Sam");
  return { state: applyObservations(emptyMechanics(), observations), observations };
}
function progress(state: MechanicalState, index: number, message: Message) {
  return { kind: "agreement_progress", agreement: state.agreements![0].id, requirement: state.agreements![0].requirements[index].id, message: message.id, quote: message.content };
}
function ready(state: MechanicalState, index: number, allowed = true, source = cups) {
  return { kind: "reward_ready", agreement: state.agreements![0].id, reward: state.agreements![0].rewards[index].id, ready: allowed, message: source.id, quote: source.content };
}
function earned() {
  let { state } = setup(); const messages = [opening, acceptance, shift, cups];
  state = observe(state, [progress(state, 0, shift), progress(state, 1, cups)], messages);
  state = observe(state, [ready(state, 0), ready(state, 1)], messages); return state;
}
const claim = (state: MechanicalState, index = 0): MechanicalOperation => ({ kind: "claim", agreement: state.agreements![0].id, reward: state.agreements![0].rewards[index].id });

test("an actual accepted agreement needs every sourced clause before its reward is collectible", () => {
  let { state } = setup(); expect(state.agreements).toHaveLength(1);
  expect(state.agreements![0].requirements.map(r => r.text)).toEqual(["cover the counter", "clean the cups"]);
  expect(readMechanicalObservations([ready(state, 0)], state, [opening, acceptance, cups])).toEqual([]);
  state = observe(state, [progress(state, 0, shift)], [opening, acceptance, shift]);
  expect(agreementDone(state.agreements![0])).toBe(false);
  expect(prepareMechanical(state, "early", "you", [claim(state)]).status).toBe("blocked");
  state = observe(state, [progress(state, 1, cups)], [opening, acceptance, shift, cups]);
  expect(agreementDone(state.agreements![0])).toBe(true);
  expect(prepareMechanical(state, "not-offered", "you", [claim(state)]).status).toBe("blocked");
  expect(state.resources.map(r => r.current)).toEqual([20, 3]);
});

test("collection transfers both balances and its paid marker once; preparation spends nothing", () => {
  const state = earned(), receipt = prepareMechanical(state, "collect-coins", "you", [claim(state)]);
  expect(receipt.status).toBe("ready"); expect(receipt.engine).toBe(5);
  expect(state.resources.map(r => r.current)).toEqual([20, 3]);
  const after = commitMechanical(state, JSON.parse(JSON.stringify(receipt)));
  expect(after.resources.map(r => r.current)).toEqual([10, 13]);
  expect(after.agreements![0].rewards[0].paid?.action).toBe("collect-coins");
  expect(commitMechanical(after, receipt)).toBe(after);
  expect(prepareMechanical(after, "collect-again", "you", [claim(after)]).status).toBe("blocked");
  expect(after.clocks).toBeUndefined(); // Receiving a promised payment is not another combat turn.
});

test("an item reward conserves actual inventory and a failed combined plan commits neither claim", () => {
  const state = earned();
  const blocked = prepareMechanical(state, "too-much", "you", [claim(state), claim(state), claim(state, 1)]);
  expect(blocked.status).toBe("blocked"); expect(blocked.changes).toEqual([]);
  expect(state.agreements![0].rewards.some(r => r.paid)).toBe(false);
  const after = commitMechanical(state, prepareMechanical(state, "receive-both", "you", [claim(state), claim(state, 1)]));
  expect(after.items.reduce((n, i) => n + i.quantity, 0)).toBe(3);
  expect(after.items.find(i => i.owner === "you")?.quantity).toBe(1);
  expect(after.items.find(i => i.owner === "Jo")?.quantity).toBe(2);
  expect(after.agreements![0].rewards.every(r => r.paid)).toBe(true);
});

test("unknown funds, wrong units, missing items and equipped rewards never create or destroy value", () => {
  const state = earned();
  for (const owner of ["you", "Jo"]) {
    const unknown = structuredClone(state); unknown.resources = unknown.resources.filter(r => r.owner !== owner);
    expect(prepareMechanical(unknown, `unknown-${owner}`, "you", [claim(unknown)]).status).toBe("blocked");
    expect(unknown.resources).toHaveLength(1);
  }
  const wrong = structuredClone(state); wrong.resources[1].unit = "different currency";
  expect(prepareMechanical(wrong, "wrong-unit", "you", [claim(wrong)]).status).toBe("blocked");
  const empty = structuredClone(state); empty.resources[0].current = 5;
  expect(prepareMechanical(empty, "short", "you", [claim(empty)]).status).toBe("blocked");
  const equipped = structuredClone(state); equipped.items[0].equipped = true;
  expect(prepareMechanical(equipped, "equipped", "you", [claim(equipped, 1)]).status).toBe("blocked");
  const optionalRole = structuredClone(state); delete optionalRole.resources[0].role;
  expect(prepareMechanical(optionalRole, "same-currency", "you", [claim(optionalRole)]).status).toBe("ready");
  const health = structuredClone(state); health.resources.forEach(r => { r.name = "Health"; delete r.role; }); health.agreements![0].rewards[0].asset = "Health";
  expect(prepareMechanical(health, "health-as-pay", "you", [claim(health)]).status).toBe("blocked");
});

test("a request, player-invented NPC offer, unsupported clause, or attempted completion cannot rewrite accepted terms", () => {
  const { state } = setup();
  expect(readMechanicalObservations([{ ...root, message: opening.id, quote: terms }], emptyMechanics(), [opening])).toEqual([]);
  expect(readMechanicalObservations([{ ...root, offer: { message: acceptance.id, quote: acceptance.content } }], emptyMechanics(), [opening, acceptance])).toEqual([]);
  expect(readMechanicalObservations([{ ...root, requirements: [...root.requirements, { message: opening.id, quote: "Save the world" }] }], emptyMechanics(), [opening, acceptance])).toEqual([]);
  const attempt = { id: "attempt", is_user: true, content: "I clean the cups." };
  expect(readMechanicalObservations([progress(state, 1, attempt)], state, [opening, acceptance, attempt])).toEqual([]);
  expect(readMechanicalObservations([{ ...root, name: "A different description", rewards: [] }], state, [opening, acceptance])).toEqual([]);
  const corrected = { id: "correction", is_user: true, content: "(OOC correction: The cups were already cleaned.)" };
  expect(readMechanicalObservations([progress(state, 1, corrected)], state, [opening, acceptance, corrected])).toHaveLength(1);
  expect(readMechanicalObservations([{ ...root, requirements: root.requirements.map(r => ({ ...r, done: true })) }], emptyMechanics(), [opening, acceptance])).toEqual([]);
});

test("payer refusal revokes readiness and only the actual owner can withdraw their agreement", () => {
  let state = earned(); const refusal = { id: "refusal", is_user: false, content: "Jo pulls back the reward and refuses to hand it over." };
  state = observe(state, [ready(state, 0, false, refusal)], [opening, acceptance, shift, cups, refusal]);
  expect(prepareMechanical(state, "refused", "you", [claim(state)]).status).toBe("blocked");
  expect(readMechanicalObservations([ready(state, 0, true, cups)], state, [opening, acceptance, shift, cups, refusal])).toEqual([]);
  expect(readMechanicalObservations([{ kind: "agreement_cancel", agreement: state.agreements![0].id, message: refusal.id, quote: refusal.content }], state, [opening, acceptance, shift, cups, refusal])).toEqual([]);
  const withdraw = { id: "withdraw", is_user: true, content: "I withdraw from the agreement and decline the rewards." };
  state = observe(state, [{ kind: "agreement_cancel", agreement: state.agreements![0].id, message: withdraw.id, quote: withdraw.content }], [opening, acceptance, shift, cups, refusal, withdraw]);
  expect(state.agreements![0].cancelled).toBeDefined();
  expect(prepareMechanical(state, "cancelled", "you", [claim(state, 1)]).status).toBe("blocked");
});

test("normal chat claim parsing uses saved amounts and rejects an injected larger payment", () => {
  const state = earned(), raw = { kind: "claim", agreement: "Help at the café", reward: "Coins", quote: "I collect my pay." };
  expect(readMechanicalPlan([raw], state, raw.quote)).toEqual([claim(state)]);
  expect(() => readMechanicalPlan([{ ...raw, amount: 100 }], state, raw.quote)).toThrow();
});

test("a counted physical gift needs no wallet and missing bookkeeping never becomes a fictional refusal or extra job", () => {
  const state = earned(); state.resources = [];
  const after = commitMechanical(state, prepareMechanical(state, "gift", "you", [claim(state, 1)]));
  expect(after.items.find(i => i.owner === "you")?.quantity).toBe(1); expect(after.resources).toEqual([]);
  const missing = prepareMechanical(state, "unknown-wallet", "you", [claim(state)]);
  expect(missing.unresolved).toBe(true);
  expect(receiptPacket(missing).boundary).toContain("Do not invent an NPC refusal");
  expect(receiptPacket(missing).boundary).toContain("leave the action pending");
});

test("a fresh actual offer can create another agreement, but accepting the same old offer again cannot repeat its reward", () => {
  let state = earned(); state = commitMechanical(state, prepareMechanical(state, "done", "you", [claim(state), claim(state, 1)]));
  const again = { ...acceptance, id: "accept-again" };
  expect(readMechanicalObservations([{ ...root, message: again.id, quote: again.content }], state, [opening, acceptance, shift, cups, again])).toEqual([]);
  const nextOffer = { ...opening, id: "next-day-offer" }, nextAcceptance = { ...acceptance, id: "next-day-acceptance" };
  const second = { ...root, offer: { message: nextOffer.id, quote: terms }, requirements: root.requirements.map(r => ({ ...r, message: nextOffer.id })), rewards: root.rewards.map(r => ({ ...r, message: nextOffer.id })), message: nextAcceptance.id, quote: nextAcceptance.content };
  const after = observe(state, [second], [opening, acceptance, shift, cups, nextOffer, nextAcceptance]);
  expect(after.agreements).toHaveLength(2);
  expect(after.agreements![1].requirements.every(r => !r.done)).toBe(true);
  const newWork = { ...cups, id: "next-day-work" }, history = [opening, acceptance, shift, cups, nextOffer, nextAcceptance, newWork];
  const rows = after.agreements![1].requirements.map(r => ({ kind: "agreement_progress", agreement: "Help at the café", requirement: r.text, message: newWork.id, quote: newWork.content }));
  const progressed = observe(after, [...rows, { kind: "reward_ready", agreement: "Help at the café", reward: "Coins", ready: true, message: newWork.id, quote: newWork.content }], history);
  expect(progressed.agreements![1].requirements.every(r => r.done)).toBe(true);
  expect(readMechanicalPlan([{ kind: "claim", agreement: "Help at the café", reward: "Coins", quote: "I collect my pay." }], progressed, "I collect my pay.")[0]).toEqual({ kind: "claim", agreement: progressed.agreements![1].id, reward: progressed.agreements![1].rewards[0].id });
});

test("an NPC can fulfill the player's offered job, but cannot automatically take the player's promised payment", () => {
  const { state: initial } = setup(); initial.agreements = []; initial.resources.find(r => r.owner === "you")!.current = 30;
  const offer = { id: "player-offer", is_user: true, content: "Jo, clean the cups and I will pay you 10 Coins." };
  const accept = { id: "npc-accept", is_user: false, content: "Jo agrees to clean the cups for the offered pay." };
  let state = observe(initial, [{ kind: "agreement", owner: "Jo", name: "Cup washing", from: "you", offer: { message: offer.id, quote: offer.content }, requirements: [{ message: offer.id, quote: "clean the cups" }], rewards: [{ kind: "resource", asset: "Coins", amount: 10, message: offer.id, quote: "10 Coins" }], message: accept.id, quote: accept.content }], [opening, offer, accept]);
  expect(state.agreements).toHaveLength(1);
  const done = { id: "npc-done", is_user: false, content: "Jo finishes cleaning the cups and holds out a hand to receive the agreed pay." };
  state = observe(state, [progress(state, 0, done), ready(state, 0, true, done)], [opening, offer, accept, done]);
  expect(prepareMechanical(state, "automatic-npc-collection", "Jo", [claim(state)]).status).toBe("blocked");
  const op = readMechanicalPlan([{ kind: "claim", agreement: "Cup washing", reward: "Coins", quote: "I pay Jo the promised Coins." }], state, "I pay Jo the promised Coins.");
  const after = commitMechanical(state, prepareMechanical(state, "explicit-payment", "you", op));
  expect(after.resources.find(r => r.owner === "you")!.current).toBe(20);
  expect(after.resources.find(r => r.owner === "Jo")!.current).toBe(30);
});

test("agreement clauses, progress, authorization and the paid receipt replay only on their causal branch", () => {
  const { state: initial, observations } = setup();
  const messages = [opening, acceptance, shift, cups].map((m, i) => ({ ...m, role: m.is_user ? "user" : "assistant", swipe_id: 0, index_in_chat: i } as Msg));
  let state = initial;
  const save = (i: number, obs: ReturnType<typeof readMechanicalObservations>) => {
    messages[i].metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf(messages.slice(0, i)), text: revision(messages[i].content), observations: obs } } };
  };
  // Definitions are saved on the reply carrying the extraction, not the acceptance's author.
  save(1, observations);
  const first = readMechanicalObservations([progress(state, 0, shift)], state, messages.slice(0, 3)); state = applyObservations(state, first); save(2, first);
  const second = readMechanicalObservations([progress(state, 1, cups), ready(state, 0), ready(state, 1)], state, messages); state = applyObservations(state, second); save(3, second);
  expect(foldMechanics(messages)).toEqual(state);
  const player = { id: "claim", is_user: true, role: "user", content: "I collect my pay.", swipe_id: 0, index_in_chat: 4 } as Msg;
  const reply = { id: "paid", is_user: false, role: "assistant", content: "Jo hands you the promised coins.", swipe_id: 0, index_in_chat: 5 } as Msg;
  const receipt = prepareMechanical(state, "paid-once", "you", [claim(state)]);
  reply.metadata = { [MECHANICS_KEY]: { "0": { version: 1, path: pathOf([...messages, player]), text: revision(reply.content), observations: [], receipt } } };
  expect(foldMechanics([...messages, player, reply])).toEqual(commitMechanical(state, receipt));
  reply.swipe_id = 1; expect(foldMechanics([...messages, player, reply])).toEqual(state);
  messages[2].content = "The shift has not finished yet.";
  expect(foldMechanics([...messages, player, reply]).agreements).toBeUndefined();
});
