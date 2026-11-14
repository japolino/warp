import { expect, test } from "bun:test";
import legacy from "./fixtures/resolver10-receipts.json";
import realWorkers from "./fixtures/barter-worker-receipts.json";
import { firstJson } from "../backend/helpers.js";
import { emptyMechanics, readMechanicalObservations, readServiceObservations, applyObservations, prepareMechanical, commitMechanical, mechanicalPacket, type MechanicalState, type Observation } from "./mechanics.js";
import { agreementDone, agreementSettled } from "./agreements.js";
import { readAidWork, explicitServiceWaiver } from "./service-barter.js";
import { aidOfferText } from "./aid.js";
import { readLocalAid } from "./local-actions.js";
import { foldMechanics } from "./mechanical-history.js";
import { actionCount } from "./encounters.js";
import { pathOf, type Message } from "./world.js";
import { storyRevision } from "./story-text.js";
import type { Msg } from "../backend/ledger.js";

const clauses = ["sweep the chapel steps", "wash the basin"];
const accept: Message = { id: "agreed", is_user: true, content: "Yes, please." };
const ack: Message = { id: "ack", is_user: false, content: "Jo acknowledges your agreement. The work and treatment have not happened yet." };
const swept: Message = { id: "swept", is_user: false, content: "You sweep the chapel steps completely. Jo waits in the clinic." };
const washed: Message = { id: "washed", is_user: false, content: "You wash the basin completely. Jo checks the completed work and offers Mend as promised." };
function setup(paid = false) {
  let state = structuredClone(legacy.cases[0].before) as MechanicalState; state.aidOffers = [];
  const initial = legacy.observations.filter(o => o.kind !== "aid_offer") as Observation[];
  const messages: Message[] = [legacy.opening];
  if (paid) {
    const stock = { id: "stock", is_user: false, content: "You have 12 coins." }; messages.push(stock);
    const obs = readMechanicalObservations([{ kind: "resource", owner: "you", id: "coins", name: "Coins", unit: "coin", role: "money", current: 12, message: stock.id, quote: stock.content }], state, messages);
    state = applyObservations(state, obs); initial.push(...obs);
  }
  const offer = { id: "work-offer", is_user: false, content: `Jo offers Mend${paid ? " for five coins" : ""} if you sweep the chapel steps and wash the basin.` };
  messages.push(offer);
  const row = { kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, work: clauses, unsupported: [], ...(paid ? { fee: { kind: "resource", id: "coins", amount: 5 } } : {}), message: offer.id, quote: offer.content };
  const observations = readMechanicalObservations([row], state, messages);
  expect(observations).toHaveLength(1); state = applyObservations(state, observations);
  expect(state.aidOffers![0].unsupported).toEqual([]);
  return { state, messages, offer, row, observations, initial };
}
const operation = (s: MechanicalState, kind: "accept_aid" | "decline_aid" = "accept_aid") => ({ kind, offer: s.aidOffers![0].id, version: s.aidOffers![0].version });
function agreementRow(state: MechanicalState, offer: Message, acceptance = accept) {
  const aid = state.aidOffers![0];
  return { kind: "agreement", owner: "you", from: "Jo", name: "Clinic work", offer: { message: offer.id, quote: offer.content },
    requirements: clauses.map(quote => ({ message: offer.id, quote })), rewards: [], service: { offer: aid.id, version: aid.version }, unsupported: [], message: acceptance.id, quote: acceptance.content };
}
function agreed(paid = false) {
  const context = setup(paid); context.messages.push(accept, ack);
  const row = agreementRow(context.state, context.offer), observations = readMechanicalObservations([row], context.state, context.messages);
  expect(observations).toHaveLength(1); context.state = applyObservations(context.state, observations);
  return { ...context, agreement: row, accepted: observations };
}
function progress(state: MechanicalState, clause: number, source: Message) {
  return { kind: "agreement_progress", agreement: state.agreements![0].id, requirement: state.agreements![0].requirements[clause].id, message: source.id, quote: source.content };
}
function earned(paid = false) {
  const context = agreed(paid); context.messages.push(swept, washed);
  const rows = [progress(context.state, 0, swept), progress(context.state, 1, washed)];
  const observations = readMechanicalObservations(rows, context.state, context.messages); expect(observations).toHaveLength(2);
  context.state = applyObservations(context.state, observations);
  return { ...context, completed: observations, progressRows: rows };
}
function offered(paid = false) {
  const context = earned(paid);
  const row = { kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [], agreement: "Clinic work", message: washed.id, quote: "Jo checks the completed work and offers Mend as promised." };
  const observations = readMechanicalObservations([row], context.state, context.messages); expect(observations).toHaveLength(1);
  context.state = applyObservations(context.state, observations);
  return { ...context, ready: observations, readyRow: row };
}

test("focused prompts retain the full conditional offer and the earned treatment's saved terms", () => {
  const pending = setup(true);
  const proposal = mechanicalPacket(pending.state).aidOffers![0];
  if (!("source" in proposal)) throw Error("Conditional proposal lost its source");
  expect(proposal.source).toEqual(pending.state.aidOffers![0].source);
  expect(proposal.source.quote).toContain("five coins if you sweep");
  const context = offered(true), service = context.state.agreements![0].service!;
  const projected = mechanicalPacket(context.state).agreements![0].service!;
  expect(projected).toMatchObject({ name: "Mend", offer: service.offer, version: service.version, actor: "Jo", ability: service.ability, abilityVersion: service.abilityVersion, fee: { kind: "resource", id: "coins", amount: 5 }, used: false });
  const after = commitMechanical(context.state, prepareMechanical(context.state, "receive", "you", [operation(context.state)]));
  expect(mechanicalPacket(after, "What happened to Clinic work?").agreements![0].service).toMatchObject({ used: true, fee: { amount: 5 } });
});

test("a conditional proposal stores every clause, but neither accepts the work nor cures or charges anything", () => {
  const { state, messages, offer } = setup();
  expect(state.agreements).toBeUndefined(); expect(state.aidOffers![0].work?.map(w => w.quote)).toEqual(clauses);
  expect(state.aidOffers![0].termsVersion).toBe(2);
  expect(aidOfferText(state.aidOffers![0], state)).toContain("in exchange for work");
  const before = structuredClone(state), receipt = prepareMechanical(state, "too-early", "you", [operation(state)]);
  expect(receipt.engine).toBe(12); expect(receipt.status).toBe("blocked"); expect(receipt.changes).toEqual([]); expect(state).toEqual(before);
  const world = { place: "clinic", present: ["Jo"], mechanics: state } as any;
  expect(readLocalAid("Yes, please.", world, [...messages, accept])?.mechanicalActions).toEqual([]);
  expect(readLocalAid("No, thanks.", world, [...messages, { ...accept, content: "No, thanks." }])?.mechanicalActions[0].kind).toBe("decline_aid");
  expect(offer.content).toContain("wash the basin");
});

test("only an actual acceptance of all quoted clauses creates the service agreement", () => {
  const { state, messages, offer } = setup();
  const question = { ...accept, content: "Could I do just the sweeping?" };
  expect(readMechanicalObservations([agreementRow(state, offer, question)], state, [...messages, question, ack])).toEqual([]);
  for (const content of ["If I agreed, would you do it?", "I might agree later.", "No, thanks.", "Yes, but only if you also treat my dog."]) {
    const conditional = { ...accept, content };
    expect(readMechanicalObservations([agreementRow(state, offer, conditional)], state, [...messages, conditional, ack])).toEqual([]);
  }
  for (const content of ["I would like to accept your offer.", "No problem; I'll do both."]) {
    const polite = { ...accept, content };
    expect(readMechanicalObservations([agreementRow(state, offer, polite)], state, [...messages, polite, ack])).toHaveLength(1);
  }
  const row = agreementRow(state, offer);
  expect(readMechanicalObservations([{ ...row, requirements: row.requirements.slice(0, 1) }], state, [...messages, accept, ack])).toEqual([]);
  expect(readMechanicalObservations([{ ...row, service: { offer: "unknown", version: 1 } }], state, [...messages, accept, ack])).toEqual([]);
  const accepted = agreed().state;
  expect(accepted.agreements![0].service?.offer).toBe(accepted.aidOffers![0].id);
  expect(accepted.agreements![0].requirements.map(r => r.text)).toEqual(clauses);
  expect(agreementDone(accepted.agreements![0])).toBe(false); expect(agreementSettled(accepted.agreements![0])).toBe(false);
  expect(accepted.resources.find(r => r.id === "focus")!.current).toBe(10); expect(accepted.conditions).toHaveLength(1); expect(accepted.applied).toEqual([]);
});

test("partial work and a player's attempt cannot earn treatment or create a current NPC offer", () => {
  const { state, messages } = agreed();
  const attempt = { ...swept, is_user: true };
  expect(readMechanicalObservations([progress(state, 0, attempt)], state, [...messages, attempt])).toEqual([]);
  const partial = applyObservations(state, readMechanicalObservations([progress(state, 0, swept)], state, [...messages, swept]));
  expect(agreementDone(partial.agreements![0])).toBe(false);
  const premature = { id: "premature", is_user: false, content: "Jo offers Mend as promised." };
  expect(readMechanicalObservations([{ kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [], agreement: "Clinic work", message: premature.id, quote: premature.content }], partial, [...messages, swept, premature])).toEqual([]);
  expect(prepareMechanical(partial, "unearned", "you", [operation(partial)]).status).toBe("blocked");
});

test("completed work preserves an earned service but does not force the NPC to provide it", () => {
  const { state } = earned(); expect(agreementDone(state.agreements![0])).toBe(true); expect(agreementSettled(state.agreements![0])).toBe(false);
  expect(prepareMechanical(state, "no-current-offer", "you", [operation(state)]).status).toBe("blocked");
  state.entities![0].present = false;
  expect(prepareMechanical(state, "absent", "you", [operation(state)]).status).toBe("blocked");
  expect(state.agreements![0].service!.used).toBeUndefined(); expect(state.resources[0].current).toBe(10);
});

test("a current offer and acceptance execute one earned service with the NPC's costs and clock", () => {
  const { state, messages } = offered(), before = structuredClone(state);
  const yes = { id: "receive", is_user: true, content: "Yes, please." };
  expect(readLocalAid(yes.content, { place: "clinic", present: ["Jo"], mechanics: state } as any, [...messages, yes])?.mechanicalActions[0].kind).toBe("accept_aid");
  const receipt = prepareMechanical(state, "received-service", "you", [operation(state)]); expect(receipt.status).toBe("ready"); expect(receipt.engine).toBe(12);
  expect(state).toEqual(before); const after = commitMechanical(state, receipt);
  expect(after.conditions).toEqual([]); expect(after.resources.find(r => r.id === "focus")!.current).toBe(8);
  expect(after.agreements![0].service!.used).toEqual({ action: "received-service" }); expect(agreementSettled(after.agreements![0])).toBe(true);
  expect(actionCount(after, "Jo")).toBe(1); expect(actionCount(after, "you")).toBe(0);
  expect(commitMechanical(after, receipt)).toBe(after); expect(prepareMechanical(after, "duplicate", "you", [operation(after)]).status).toBe("blocked");
  const repeated = { id: "repeated", is_user: false, content: "Jo offers Mend as promised." };
  expect(readMechanicalObservations([{ kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [], message: repeated.id, quote: repeated.content }], after, [...messages, yes, repeated])).toEqual([]);
});

test("a fee accompanying work is retained through a renewal that omits its price, and charged only with treatment", () => {
  const { state } = offered(true);
  expect(state.resources.find(r => r.id === "coins")!.current).toBe(12); expect(state.aidOffers![0].fee?.amount).toBe(5);
  expect(state.agreements![0].service!.fee?.amount).toBe(5);
  const receipt = prepareMechanical(state, "fee-and-work", "you", [operation(state)]); expect(receipt.status).toBe("ready");
  const after = commitMechanical(state, receipt);
  expect(after.resources.find(r => r.id === "coins")!.current).toBe(7); expect(after.resources.find(r => r.id === "focus")!.current).toBe(8);
  expect(after.agreements![0].service!.used?.action).toBe("fee-and-work"); expect(after.aidOffers![0].paid?.amount).toBe(5);
  expect(after.resources.filter(r => r.owner === "Jo" && r.role === "money")).toEqual([]);
});

test("a renewed offer may repeat the accepted fee using the original quote as its price evidence", () => {
  const context = earned(true), row = { kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [], agreement: "Clinic work", fee: { kind: "resource", id: "coins", amount: 5 }, message: washed.id, quote: "Jo checks the completed work and offers Mend as promised." };
  const observed = readMechanicalObservations([row], context.state, context.messages); expect(observed).toHaveLength(1);
  const state = applyObservations(context.state, observed); expect(state.aidOffers![0].fee?.amount).toBe(5);
  expect(prepareMechanical(state, "fee-proven-by-contract", "you", [operation(state)]).status).toBe("ready");
  expect(readMechanicalObservations([{ ...row, fee: { ...row.fee, amount: 10 } }], context.state, context.messages)).toEqual([]);
});

test("an explicit NPC waiver can remove the fee, while omitted or negated waivers cannot", () => {
  for (const phrase of ["at no fee", "with no fees", "free of charge", "for free", "and it will cost you nothing", "and you pay nothing"]) {
    const context = earned(true), current = { id: "waiver", is_user: false, content: `Jo offers Mend as promised ${phrase}.` };
    const row = { kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [], agreement: "Clinic work", message: current.id, quote: current.content };
    const observations = readMechanicalObservations([row], context.state, [...context.messages, current]); expect(observations).toHaveLength(1);
    const state = applyObservations(context.state, observations); expect(state.aidOffers![0].fee).toBeUndefined(); expect(state.aidOffers![0].feeWaived?.message).toBe(current.id);
    const receipt = prepareMechanical(state, "waived-fee", "you", [operation(state)]); expect(receipt.status).toBe("ready");
    const after = commitMechanical(state, receipt); expect(after.resources.find(r => r.id === "coins")!.current).toBe(12);
    expect(after.resources.find(r => r.id === "focus")!.current).toBe(8); expect(after.conditions).toEqual([]); expect(after.aidOffers![0].paid).toBeUndefined();
    expect(after.agreements![0].service!.used?.feeWaived?.message).toBe(current.id); expect(after.agreements![0].service!.fee?.amount).toBe(5);
  }
  for (const text of ["Jo offers Mend, but not for free.", "Jo says there is no fee waiver.", "Jo offers Mend, but not free of charge."]) expect(explicitServiceWaiver(text)).toBe(false);
  const inherited = offered(true).state; expect(inherited.aidOffers![0].fee?.amount).toBe(5); expect(inherited.aidOffers![0].feeWaived).toBeUndefined();
});

test("empty optional helper fields do not waive quoted obligations or break an ordinary earned offer", () => {
  const context = earned(true), row = { kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [], work: [], fee: null, agreement: null, message: washed.id, quote: "Jo checks the completed work and offers Mend as promised." };
  const observations = readMechanicalObservations([row], context.state, context.messages); expect(observations).toHaveLength(1);
  const state = applyObservations(context.state, observations); expect(state.aidOffers![0].agreement).toBe(state.agreements![0].id); expect(state.aidOffers![0].fee?.amount).toBe(5);
  const proposed = setup(); proposed.state.aidOffers = [];
  const missingWork = readMechanicalObservations([{ ...proposed.row, work: [] }], proposed.state, proposed.messages);
  expect((missingWork[0] as any).value.unsupported.length).toBeGreaterThan(0);
});

test("a failed service or refusal does not erase work, spend fees or mark the service used", () => {
  const mutations: ((s: MechanicalState) => void)[] = [
    s => { s.resources.find(r => r.id === "coins")!.current = 4; }, s => { s.resources.find(r => r.id === "focus")!.current = 1; },
    s => { s.distances = []; }, s => { s.conditions[0].recovery = "special"; }, s => { s.agreements![0].requirements[1].done = undefined; },
    s => { s.agreements![0].cancelled = { message: "cancel", quote: "I withdraw from our agreement." }; },
    s => { s.abilities![0].version++; },
  ];
  for (const mutate of mutations) {
    const { state } = offered(true); mutate(state); const before = structuredClone(state);
    const receipt = prepareMechanical(state, "failed-service", "you", [operation(state)]);
    expect(receipt.status).toBe("blocked"); expect(receipt.changes).toEqual([]); expect(state).toEqual(before);
  }
  const { state } = offered(true);
  const after = commitMechanical(state, prepareMechanical(state, "declined-service", "you", [operation(state, "decline_aid")]));
  expect(after.agreements).toEqual(state.agreements); expect(after.resources).toEqual(state.resources); expect(after.conditions).toEqual(state.conditions);
  expect(agreementDone(after.agreements![0])).toBe(true); expect(agreementSettled(after.agreements![0])).toBe(false);
});

test("work regions cannot omit a second clause, choose an alternative, or add an invented clause", () => {
  const { state, messages, offer } = setup();
  const source = state.aidOffers![0].source;
  expect(readAidWork([clauses[0]], source)).toBeUndefined();
  expect(readAidWork([...clauses, "paint the wall"], source)).toBeUndefined();
  expect(readAidWork(clauses, { ...source, quote: source.quote.replace(" and ", " or ") })).toBeUndefined();
  const leading = "Jo says, 'If you sweep the chapel steps and wash the basin, I'll use Mend to treat your burn.'";
  expect(readAidWork(clauses, { ...source, quote: leading })?.work.map(w => w.quote)).toEqual(clauses);
  expect(readAidWork(clauses, { ...source, quote: "Jo says, 'sweep the chapel steps and wash the basin and I'll use Mend to treat your burn.'" })?.work.map(w => w.quote)).toEqual(clauses);
  expect(readAidWork(["sweeping the steps"], { ...source, quote: "Jo offers Mend for sweeping the steps." })?.work[0].quote).toBe("sweeping the steps");
  expect(readAidWork(["pay five coins"], { ...source, quote: "Jo offers Mend if you pay five coins." })).toBeUndefined();
  const rows = [{ kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, work: [clauses[0]], unsupported: [], message: offer.id, quote: offer.content }];
  const clean = structuredClone(state); clean.aidOffers = [];
  const invalid = applyObservations(clean, readMechanicalObservations(rows, clean, messages));
  expect(invalid.aidOffers![0].unsupported.length).toBeGreaterThan(0);
});

test("a different person's name containing Jo cannot authorize Jo's service", () => {
  const { state, messages, offer, row } = setup(); state.aidOffers = [];
  const wrong = { ...offer, content: offer.content.replace("Jo", "Major") };
  expect(readMechanicalObservations([{ ...row, quote: wrong.content }], state, [...messages.slice(0, -1), wrong])).toEqual([]);
});

test("one delayed read recovers proposal, acceptance, every fulfillment and renewed willingness in dependency order", () => {
  const context = setup(); const base = structuredClone(context.state); base.aidOffers = [];
  const messages = [...context.messages, accept, ack, swept, washed];
  const agreement = { ...agreementRow(context.state, context.offer), service: { offer: "Mend" } };
  const rows = [
    { kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [], agreement: "Clinic work", message: washed.id, quote: "Jo checks the completed work and offers Mend as promised." },
    { kind: "agreement_progress", agreement: "Clinic work", requirement: clauses[1], message: washed.id, quote: washed.content },
    agreement, context.row,
    { kind: "agreement_progress", agreement: "Clinic work", requirement: clauses[0], message: swept.id, quote: swept.content },
  ];
  const observations = readServiceObservations(rows, base, messages), state = applyObservations(base, observations);
  expect(observations.map(o => o.kind)).toEqual(["aid_offer", "agreement", "agreement_progress", "agreement_progress", "aid_offer"]);
  expect(state.aidOffers![0].agreement).toBe(state.agreements![0].id); expect(agreementDone(state.agreements![0])).toBe(true);
  expect(state.conditions).toHaveLength(1); expect(state.applied).toEqual([]);
  expect(readServiceObservations(rows, state, messages)).toEqual([]);
  expect(prepareMechanical(state, "recovered", "you", [operation(state)]).status).toBe("ready");
});

test("barter observations, inherited fees and the consumed service replay on their exact branch", () => {
  const context = offered(true), all = context.messages.map((m, i) => ({ ...m, index_in_chat: i, swipe_id: 0, metadata: {} } as Msg));
  // The stock, base mechanics and definition sources may share the extraction's later record.
  const save = (id: string, observations: Observation[]) => {
    const index = all.findIndex(m => m.id === id), m = all[index];
    m.metadata = { warpMechanics: { "0": { version: 1, path: pathOf(all.slice(0, index)), text: storyRevision(m.content), observations, sources: [legacy.profile] } } };
  };
  save(context.offer.id, [...context.initial, ...context.observations]); save(ack.id, context.accepted);
  save(washed.id, [...context.completed, ...context.ready]);
  expect(foldMechanics(all)).toEqual(context.state);
  const player = { id: "collect", is_user: true, content: "Yes, please.", index_in_chat: all.length } as Msg;
  const receipt = prepareMechanical(context.state, "saved-service", "you", [operation(context.state)]), after = commitMechanical(context.state, receipt);
  const content = "Jo receives five coins and uses Mend to treat your burn.";
  const reply = { id: "received", is_user: false, content, index_in_chat: all.length + 1, swipe_id: 0, metadata: { warpMechanics: { "0": { version: 1, path: pathOf([...all, player]), text: storyRevision(content), observations: [], receipt } } } } as unknown as Msg;
  expect(foldMechanics([...all, player, reply])).toEqual(after); expect(foldMechanics([...all, player, reply])).toEqual(after);
  expect(foldMechanics([...all, { ...player, content: "No, thanks." }, reply]).applied).toEqual([]);
});

test("an explicitly waived fee and its original promise both survive replay without charging or refunding money", () => {
  const context = earned(true), waiver = { id: "waiver", is_user: false, content: "Jo offers Mend as promised for free." };
  context.messages.push(waiver);
  const rows = readMechanicalObservations([{ kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [], agreement: "Clinic work", message: waiver.id, quote: waiver.content }], context.state, context.messages);
  const state = applyObservations(context.state, rows), all = context.messages.map((m, i) => ({ ...m, index_in_chat: i, swipe_id: 0, metadata: {} } as Msg));
  const save = (id: string, observations: Observation[]) => {
    const index = all.findIndex(m => m.id === id), m = all[index];
    m.metadata = { warpMechanics: { "0": { version: 1, path: pathOf(all.slice(0, index)), text: storyRevision(m.content), observations, sources: [legacy.profile] } } };
  };
  save(context.offer.id, [...context.initial, ...context.observations]); save(ack.id, context.accepted); save(washed.id, context.completed); save(waiver.id, rows);
  expect(foldMechanics(all)).toEqual(state);
  const player = { id: "yes-free", is_user: true, content: "Yes, please.", index_in_chat: all.length } as Msg;
  const receipt = prepareMechanical(state, "free-earned-service", "you", [operation(state)]), after = commitMechanical(state, receipt), content = "Jo uses Mend, waiving the service fee.";
  const reply = { id: "free-received", is_user: false, content, index_in_chat: all.length + 1, swipe_id: 0, metadata: { warpMechanics: { "0": { version: 1, path: pathOf([...all, player]), text: storyRevision(content), observations: [], receipt } } } } as unknown as Msg;
  expect(foldMechanics([...all, player, reply])).toEqual(after); expect(after.resources.find(r => r.id === "coins")!.current).toBe(12);
});

test("actual fantasy and sci-fi helper/worker histories replay the completed work and paid service exactly", () => {
  for (const fixture of realWorkers.cases) {
    const messages = fixture.messages as unknown as Msg[], expected = fixture.after as MechanicalState;
    expect(foldMechanics(messages)).toEqual(expected); expect(foldMechanics(messages)).toEqual(expected);
    const receipt = (messages.at(-1)!.metadata!.warpMechanics as any)["0"].receipt;
    expect(receipt.engine).toBe(12);
    const before = foldMechanics(messages.slice(0, -1)), committed = commitMechanical(before, receipt);
    expect(committed.resources).toEqual(expected.resources); expect(committed.items).toEqual(expected.items);
    expect(committed.agreements).toEqual(expected.agreements); expect(committed.aidOffers).toEqual(expected.aidOffers);
    expect(committed.conditions).toEqual([]);
  }
});

test("the actual helper's repeated fee is proven by the original contract when the current quote omits it", () => {
  for (const fixture of realWorkers.cases) {
    const messages = fixture.messages.slice(0, 5) as unknown as Msg[];
    const before = foldMechanics(messages.slice(0, 4));
    const raw = firstJson(fixture.completionReply)!;
    const observations = readServiceObservations(raw.mechanicalObservations, before, messages);
    const ready = applyObservations(before, observations), offer = ready.aidOffers![0];
    expect(offer.agreement).toBe(ready.agreements![0].id); expect(offer.work).toBeUndefined(); expect(offer.fee).toBeDefined();
    expect(offer.source.quote).not.toMatch(/\b(?:coins|credits)\b/i);
    expect(ready.agreements![0].requirements.every(r => r.done)).toBe(true);
    expect(prepareMechanical(ready, `actual-${fixture.scene}`, "you", [operation(ready)]).status).toBe("ready");
  }
});
