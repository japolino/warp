import { expect, test } from "bun:test";
import legacy from "./fixtures/resolver10-receipts.json";
import helperScene from "./fixtures/paid-helper-scene.json";
import workerScenes from "./fixtures/paid-worker-receipts.json";
import { readAbilityDefinitions } from "./abilities.js";
import { firstJson } from "../backend/helpers.js";
import { applyObservations, commitMechanical, emptyMechanics, prepareMechanical, readMechanicalObservations, type MechanicalState, type MechanicalReceipt } from "./mechanics.js";
import { readAidFee, unresolvedServiceTerms } from "./service-payment.js";
import { aidOfferText } from "./aid.js";
import { actionCount } from "./encounters.js";
import { foldMechanics } from "./mechanical-history.js";
import { pathOf } from "./world.js";
import { storyRevision } from "./story-text.js";
import type { Msg } from "../backend/ledger.js";

const money = { kind: "resource" as const, id: "coins", amount: 5 };
function setup(quote = "Jo offers Mend for five coins.", fee: unknown = money) {
  const state = structuredClone(legacy.cases[0].before) as MechanicalState;
  state.aidOffers = [];
  const stock = { id: "stock", is_user: false, content: "You have 12 coins and 3 bandages." };
  const initial = readMechanicalObservations([
    { kind: "resource", id: "coins", owner: "you", name: "Coins", unit: "coin", role: "money", current: 12, message: stock.id, quote: stock.content },
    { kind: "item", id: "bandages", owner: "you", name: "Bandage", quantity: 3, message: stock.id, quote: stock.content },
  ], state, [stock]);
  const stocked = applyObservations(state, initial), opening = { id: "priced", is_user: false, content: quote };
  const observations = readMechanicalObservations([{ kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [], ...(fee === undefined ? {} : { fee }), message: opening.id, quote }], stocked, [opening]);
  expect(observations).toHaveLength(1);
  return { state: applyObservations(stocked, observations), stocked, stock, opening, observations, initial };
}
const op = (s: MechanicalState, kind: "accept_aid" | "decline_aid" = "accept_aid") => ({ kind, offer: s.aidOffers![0].id, version: s.aidOffers![0].version });

test("paid aid debits the exact fee and caster cost once, without inventing the payee's wallet", () => {
  const { state } = setup(), original = structuredClone(state);
  expect(aidOfferText(state.aidOffers![0], state)).toBe("Jo offers Mend · fee 5 Coins · uses 2 Focus");
  const receipt = prepareMechanical(state, "paid", "you", [op(state)]);
  expect(receipt.status).toBe("ready"); expect(receipt.engine).toBe(11); expect(state).toEqual(original);
  const after = commitMechanical(state, receipt);
  expect(after.resources.find(r => r.id === "coins")!.current).toBe(7);
  expect(after.resources.find(r => r.id === "focus")!.current).toBe(8);
  expect(after.resources.filter(r => r.owner === "Jo" && r.role === "money")).toEqual([]);
  expect(after.aidOffers![0].paid).toEqual({ ...money, from: "you", to: "Jo", asset: "Coins", unit: "coin" });
  expect(after.conditions).toEqual([]); expect(actionCount(after, "you")).toBe(0); expect(actionCount(after, "Jo")).toBe(1);
  expect(receipt.beats?.find(b => b.kind === "payment")).toEqual({ kind: "payment", actor: "you", target: "Jo", name: "Coins", amount: 5 });
  expect(commitMechanical(after, receipt)).toBe(after);
  expect(prepareMechanical(after, "again", "you", [op(after)]).status).toBe("blocked");
});

test("actual helper asset names bind, while its incomplete injury row still prevents payment", () => {
  const { messages, result } = helperScene;
  const initial = readMechanicalObservations(result.mechanicalObservations.filter(o => o.kind !== "aid_offer"), emptyMechanics(), messages);
  let state = applyObservations(emptyMechanics(), initial);
  const definitions = readAbilityDefinitions(result.abilityDefinitions, state, messages, []);
  expect(definitions).toHaveLength(1);
  state = applyObservations(state, definitions.map(value => ({ kind: "ability", value })));
  state = applyObservations(state, readMechanicalObservations(result.mechanicalObservations.filter(o => o.kind === "aid_offer"), state, messages));
  expect(state.aidOffers).toHaveLength(1); expect(state.aidOffers![0].unsupported).toEqual([]);
  const wallet = state.resources.find(r => r.owner === "you" && r.role === "money")!;
  expect(wallet.id).not.toBe("coins"); expect(state.aidOffers![0].fee?.id).toBe(wallet.id);
  const receipt = prepareMechanical(state, "actual-helper-price", "you", [op(state)]);
  expect(receipt.engine).toBe(11); expect(receipt.status).toBe("blocked"); expect(receipt.changes).toEqual([]);
  // This first standalone probe omitted the runtime's base condition schema.
  // Retain its actual malformed row as evidence, never repair it into a passing cast.
  expect(state.conditions).toEqual([]); expect(wallet.current).toBe(12); expect(state.aidOffers![0].paid).toBeUndefined();
});

test("fee names must resolve uniquely and cannot shadow someone else's exact asset ID", () => {
  const { stocked } = setup();
  const wallet = stocked.resources.find(r => r.id === "coins")!; wallet.id = "your-wallet";
  expect(readAidFee(money, stocked, "Jo offers Mend for five coins.")?.id).toBe("your-wallet");
  stocked.resources.push({ ...structuredClone(wallet), id: "other-coins", owner: "Other" });
  expect(readAidFee({ ...money, id: "other-coins" }, stocked, "Jo offers Mend for five coins.")).toBeUndefined();
  stocked.resources.push({ ...structuredClone(wallet), id: "duplicate" });
  expect(readAidFee(money, stocked, "Jo offers Mend for five coins.")).toBeUndefined();
});

test("actual fantasy and sci-fi worker records replay their money, item payment, treatment and NPC costs exactly", () => {
  for (const fixture of workerScenes.cases) {
    const messages = fixture.messages as unknown as Msg[], expected = fixture.after as MechanicalState;
    expect(foldMechanics(messages)).toEqual(expected);
    expect(foldMechanics(messages)).toEqual(expected);
    const before = foldMechanics(messages.slice(0, 1));
    const receipt = messages.at(-1)!.metadata!.warpMechanics as any;
    const saved = receipt["0"].receipt as MechanicalReceipt;
    expect(saved.engine).toBe(11);
    const paid = commitMechanical(before, saved);
    expect(paid.aidOffers![0].paid).toEqual(expected.aidOffers![0].paid);
    expect(paid.conditions).toEqual([]); expect(paid.resources).toEqual(expected.resources); expect(paid.items).toEqual(expected.items);
  }
});

test("a helper cannot waive literal touch range by omitting the optional ability field", () => {
  for (const fixture of workerScenes.cases) {
    const messages = fixture.messages.slice(0, 1), raw = firstJson(fixture.bootstrapReply)!;
    const rows = raw.mechanicalObservations as any[];
    let state = applyObservations(emptyMechanics(), readMechanicalObservations(rows.filter(o => o.kind !== "aid_offer"), emptyMechanics(), messages));
    const definitions = readAbilityDefinitions(raw.abilityDefinitions, state, messages, []);
    expect(definitions).toHaveLength(1); expect(definitions[0].range).toBeUndefined();
    state = applyObservations(state, definitions.map(value => ({ kind: "ability", value })));
    state = applyObservations(state, readMechanicalObservations(rows.filter(o => o.kind === "aid_offer"), state, messages));
    expect(state.aidOffers![0].sourceRange).toBe("touch");
    const receipt = prepareMechanical(state, "actual-restricted", "you", [op(state)]);
    expect(receipt.status).toBe("ready"); expect(receipt.engine).toBe(11);
    state.distances!.forEach(d => { d.band = "far"; });
    const before = structuredClone(state), distant = prepareMechanical(state, "too-far", "you", [op(state)]);
    expect(distant.status).toBe("blocked"); expect(distant.changes).toEqual([]); expect(state).toEqual(before);
    state.distances = [];
    expect(prepareMechanical(state, "unknown-distance", "you", [op(state)]).unresolved).toBe(true);
  }
});

test("an established same-unit payee balance receives the fee, and ambiguity or capacity cannot discard money", () => {
  const { state } = setup(); state.resources.push({ ...structuredClone(state.resources.find(r => r.id === "coins")!), id: "jo-coins", owner: "Jo", current: 4 });
  const receipt = prepareMechanical(state, "two-wallets", "you", [op(state)]);
  expect(receipt.status).toBe("ready"); const after = commitMechanical(state, receipt);
  expect(after.resources.find(r => r.id === "jo-coins")!.current).toBe(9); expect(after.resources.find(r => r.id === "coins")!.current).toBe(7);
  state.resources.at(-1)!.max = 5;
  expect(prepareMechanical(state, "full-wallet", "you", [op(state)]).status).toBe("blocked");
  delete state.resources.at(-1)!.max;
  state.resources.push({ ...structuredClone(state.resources.at(-1)!), id: "ambiguous" });
  expect(prepareMechanical(state, "ambiguous-wallet", "you", [op(state)]).unresolved).toBe(true);
});

test("item fees transfer a real stack instead of consuming or duplicating it", () => {
  const { state } = setup("Jo offers Mend for two bandages.", { kind: "item", id: "bandages", amount: 2 });
  const receipt = prepareMechanical(state, "item-fee", "you", [op(state)]); expect(receipt.status).toBe("ready");
  const after = commitMechanical(state, receipt);
  expect(after.items.find(i => i.id === "bandages")!.quantity).toBe(1);
  expect(after.items.filter(i => i.owner === "Jo").map(i => [i.name, i.quantity])).toEqual([["Bandage", 2]]);
  expect(after.items.reduce((n, i) => n + i.quantity, 0)).toBe(3);
  const whole = setup("Jo offers Mend for three bandages.", { kind: "item", id: "bandages", amount: 3 }).state;
  const full = commitMechanical(whole, prepareMechanical(whole, "whole-stack", "you", [op(whole)]));
  expect(full.items).toHaveLength(1); expect(full.items[0].owner).toBe("Jo"); expect(full.items[0].id).toBe("bandages");
});

test("failed payment, range, prerequisites or treatment leave every fee, clock and offer unchanged", () => {
  const mutations: ((s: MechanicalState) => void)[] = [
    s => { s.resources.find(r => r.id === "coins")!.current = 4; },
    s => { s.resources.find(r => r.id === "coins")!.owner = "Other"; },
    s => { s.resources.find(r => r.id === "focus")!.current = 1; },
    s => { s.distances = []; }, s => { s.conditions[0].recovery = "special"; },
    s => { s.abilities![0].requires = [{ item: "absent", equipped: true }]; },
    s => { s.entities![0].present = false; }, s => { s.aidOffers![0].unsupported = ["Also sweep the chapel steps"]; },
  ];
  for (const mutate of mutations) {
    const { state } = setup(); mutate(state); const before = structuredClone(state);
    const receipt = prepareMechanical(state, "failed", "you", [op(state)]);
    expect(receipt.status).toBe("blocked"); expect(receipt.changes).toEqual([]); expect(state).toEqual(before);
  }
  const equipped = setup("Jo offers Mend for two bandages.", { kind: "item", id: "bandages", amount: 2 }).state;
  equipped.items[0].equipped = true;
  expect(prepareMechanical(equipped, "equipped-fee", "you", [op(equipped)]).status).toBe("blocked");
});

test("declining paid aid needs no funds and spends neither fee nor caster resources", () => {
  const { state } = setup(); state.resources.find(r => r.id === "coins")!.current = 0;
  state.resources.find(r => r.id === "focus")!.current = 0;
  const after = commitMechanical(state, prepareMechanical(state, "decline-paid", "you", [op(state, "decline_aid")]));
  expect(after.resources).toEqual(state.resources); expect(after.clocks).toEqual(state.clocks); expect(after.conditions).toEqual(state.conditions);
  expect(after.aidOffers![0].status).toBe("withdrawn"); expect(after.aidOffers![0].paid).toBeUndefined();
});

test("unknown balances, forged prices, alternative currencies and extra work cannot become free treatment", () => {
  const cases: [string, unknown][] = [
    ["Jo offers Mend for five coins.", { ...money, id: "unknown" }],
    ["Jo offers Mend for five coins.", { ...money, amount: 2 }],
    ["Jo offers Mend for five coins or three silver.", money],
    ["Jo offers Mend for five coins and sweeping the chapel steps.", money],
    ["Jo offers Mend in exchange for sweeping the chapel steps.", undefined],
    ["Jo offers Mend for five coins.", undefined],
    ["Jo offers Mend for two Focus.", { kind: "resource", id: "focus", amount: 2 }],
    ["Jo offers Mend for five coins.", { ...money, amount: -5 }],
  ];
  for (const [quote, fee] of cases) {
    // Passing null suppresses the default fee while still exercising invalid input.
    const { state } = setup(quote, fee === undefined ? null : fee);
    expect(state.aidOffers![0].unsupported.length).toBeGreaterThan(0);
    expect(prepareMechanical(state, "unresolved", "you", [op(state)]).unresolved).toBe(true);
  }
});

test("explicit free terms replay with their new reader while historical no-fee observations retain old semantics", () => {
  const { stocked } = setup();
  for (const phrase of ["at no fee", "free of charge", "and it will cost you nothing", "and you pay nothing"]) {
    const opening = { id: "free", is_user: false, content: `Jo offers Mend ${phrase}.` };
    const row = { kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [], message: opening.id, quote: opening.content };
    const observations = readMechanicalObservations([row], stocked, [opening]);
    expect(observations).toHaveLength(1); const value = (observations[0] as any).value;
    expect(value.unsupported).toEqual([]); expect(value.termsVersion).toBe(1);
    expect(readMechanicalObservations([{ kind: "aid_offer", ...value, ...value.source }], stocked, [opening], undefined, true)).toEqual(observations);
    if (phrase === "at no fee") {
      const { termsVersion, ...old } = value;
      expect((readMechanicalObservations([{ kind: "aid_offer", ...old, ...old.source }], stocked, [opening], undefined, true)[0] as any).value.unsupported).toHaveLength(1);
    }
  }
  expect(unresolvedServiceTerms("Jo offers Mend, but it is not free.", stocked)).toBe(true);
  expect(readAidFee({ ...money, amount: Infinity }, stocked, "Jo offers Mend for five coins.")).toBeUndefined();
});

test("original installed resolver 10 receipts and observations keep their exact results", () => {
  for (const fixture of legacy.cases) {
    expect(commitMechanical(fixture.before as MechanicalState, fixture.receipt as MechanicalReceipt)).toEqual(fixture.after as MechanicalState);
  }
  const old = legacy.observations.find(o => o.kind === "aid_offer")! as any;
  const before = structuredClone(legacy.cases[0].before) as MechanicalState; before.aidOffers = [];
  expect(readMechanicalObservations([{ kind: "aid_offer", ...old.value, ...old.value.source }], before, [legacy.opening], undefined, true)).toEqual([old]);
});

test("saved paid offers and receipts survive replay without repeating payment or minting a wallet", () => {
  const { state, stock, opening, observations, initial } = setup();
  const base = { ...legacy.opening, index_in_chat: 0, metadata: { warpMechanics: { "0": { version: 1, path: pathOf([]), text: storyRevision(legacy.opening.content), observations: legacy.observations.filter(o => o.kind !== "aid_offer"), sources: [legacy.profile] } } } } as unknown as Msg;
  const stocked = { ...stock, index_in_chat: 1, metadata: { warpMechanics: { "0": { version: 1, path: pathOf([base]), text: storyRevision(stock.content), observations: initial } } } } as unknown as Msg;
  const offered = { ...opening, index_in_chat: 2, metadata: { warpMechanics: { "0": { version: 1, path: pathOf([base, stocked]), text: storyRevision(opening.content), observations } } } } as unknown as Msg;
  const before = foldMechanics([base, stocked, offered]); expect(before).toEqual(state);
  const player = { id: "yes", is_user: true, content: "Yes, please.", index_in_chat: 3 } as Msg;
  const receipt = prepareMechanical(before, "paid-replay", "you", [op(before)]), after = commitMechanical(before, receipt);
  const content = "Jo receives five coins and treats your burn with Mend.";
  const reply = { id: "paid", is_user: false, content, index_in_chat: 4, metadata: { warpMechanics: { "0": { version: 1, path: pathOf([base, stocked, offered, player]), text: storyRevision(content), observations: [], receipt } } } } as unknown as Msg;
  expect(foldMechanics([base, stocked, offered, player, reply])).toEqual(after);
  expect(foldMechanics([base, stocked, offered, player, reply])).toEqual(after);
  expect(foldMechanics([base, stocked, offered, { ...player, content: "No, thanks." }, reply]).applied).toEqual([]);
});
