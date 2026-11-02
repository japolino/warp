import { expect, test } from "bun:test";
import { readLocalClaim } from "./local-actions.js";
import { emptyMechanics, applyObservations, readMechanicalObservations } from "./mechanics.js";
import type { Message, World } from "./world.js";

const fixture = await Bun.file(new URL("./fixtures/cafe-agreement.json", import.meta.url)).json();
function setup(content = "I collect my pay.") {
  const messages: Message[] = [{ id: "live-agreement-g", is_user: false, content: fixture.greeting }];
  let state = applyObservations(emptyMechanics(), readMechanicalObservations(fixture.bootstrap.mechanicalObservations, emptyMechanics(), messages));
  for (const [i, turn] of fixture.turns.entries()) {
    messages.push({ id: `live-agreement-u${i * 2 + 1}`, is_user: true, content: turn.player }, { id: `live-agreement-r${i * 2 + 2}`, is_user: false, content: turn.reply });
    // This added classification is a controlled fixture, not a claim the original live model emitted it.
    const rows = turn.extraction.mechanicalObservations.map((r: any) => r.kind === "reward_ready" ? { ...r, uncontested: true } : r);
    state = applyObservations(state, readMechanicalObservations(rows, state, messages));
  }
  const narrator = messages.at(-1)!;
  state = applyObservations(state, readMechanicalObservations([{ kind: "entity", name: "Jo", entityKind: "person", present: true, message: narrator.id, quote: state.agreements![0].rewards[0].ready!.source.quote }], state, messages));
  messages.push({ id: "claim", is_user: true, content });
  return { world: { place: "Café", present: ["Jo"], facts: [], mechanics: state } as World, messages };
}

test("direct collection of one fresh uncontested reward is a local read, without changing state", () => {
  for (const text of ["I collect my pay.", "I collect the promised Coins from Jo.", "*I accept the 10 Coins.*", "I take my reward", "collect Coins", "I receive the offered Coins."]) {
    const { world, messages } = setup(text), before = structuredClone(world);
    const result = readLocalClaim(text, world, messages);
    expect(result?.mechanicalActions).toEqual([{ kind: "claim", agreement: world.mechanics!.agreements![0].id, reward: world.mechanics!.agreements![0].rewards[0].id, quote: text.replace(/^\*|\*$/g, "") }]);
    expect(result?.risky).toBe(false); expect(world).toEqual(before);
  }
});

test("questions, hypotheticals, speech, compound actions, stealth and a changed amount keep ordinary interpretation", () => {
  for (const text of ["Can I collect my pay?", '"I collect my pay."', '"Wait." I collect my pay.', "I collect my pay if Jo agrees.", "I try to collect my pay.", "I collect my pay and leave.", "I collect my pay while hiding it from the guard.", "I collect the 15 Coins.", "I take Jo's wallet.", "(OOC correction: I already collected my pay.)", "I collect my pay. [OOC: Wait before acting]"]) {
    const { world, messages } = setup(text); expect(readLocalClaim(text, world, messages)).toBeUndefined();
  }
});

test("a willingness observation alone, old or edited evidence, and an intervening event cannot grant the local route", () => {
  const { world, messages } = setup(), claim = messages.at(-1)!.content, reward = world.mechanics!.agreements![0].rewards[0];
  delete reward.ready!.uncontested; expect(readLocalClaim(claim, world, messages)).toBeUndefined(); reward.ready!.uncontested = true;
  messages.at(-2)!.content += " A new obstacle appears."; expect(readLocalClaim(claim, world, messages)).toBeUndefined();
  const fresh = setup(); fresh.messages.splice(-1, 0, { id: "later", is_user: false, content: "Jo turns away to another customer." });
  expect(readLocalClaim(claim, fresh.world, fresh.messages)).toBeUndefined();
});

test("a third participant, an active impediment, missing funds and multiple matching rewards fall back", () => {
  const content = "I collect my pay.";
  const scenarios = [
    (w: World) => w.present.push("Guard"),
    (w: World) => w.mechanics!.conditions.push({ id: "held", owner: "you", name: "Held wrist", hinders: [], helps: [], blocks: ["movement"], ending: "When released", source: { message: "fixture", quote: "A guard holds your wrist" } }),
    (w: World) => w.mechanics!.resources.splice(0, 1),
    (w: World) => { const a = w.mechanics!.agreements![0]; a.rewards.push({ ...structuredClone(a.rewards[0]), id: "ambiguous-second" }); },
  ];
  for (const mutate of scenarios) { const { world, messages } = setup(); mutate(world); expect(readLocalClaim(content, world, messages)).toBeUndefined(); }
});

test("paying a willing NPC still needs an explicit targeted player payment", () => {
  for (const text of ["I pay Jo the promised Coins.", "I pay the agreed payment to Jo."]) {
    const { world, messages } = setup(text), a = world.mechanics!.agreements![0];
    a.owner = "Jo"; a.from = "you";
    world.mechanics!.resources.find(r => r.owner === "you")!.current = 30;
    expect(readLocalClaim(text, world, messages)?.mechanicalActions[0]?.agreement).toBe(a.id);
    expect(readLocalClaim("I collect my pay.", world, [...messages.slice(0, -1), { ...messages.at(-1)!, content: "I collect my pay." }])).toBeUndefined();
  }
});

test("a malformed optimization hint preserves willingness but cannot authorize a local collection", () => {
  const { world, messages } = setup(), state = world.mechanics!, a = state.agreements![0], ready = a.rewards[0].ready!;
  expect(ready.uncontested).toBe(true);
  const later = { id: "later-offer", is_user: false, content: "Jo holds out the Coins again." };
  const raw = { kind: "reward_ready", agreement: a.id, reward: a.rewards[0].id, ready: true, uncontested: "true", message: later.id, quote: later.content };
  expect(readMechanicalObservations([raw], state, [...messages, later])).toEqual([]);
  delete a.rewards[0].ready;
  const after = applyObservations(state, readMechanicalObservations([raw], state, [...messages, later]));
  expect(after.agreements![0].rewards[0].ready?.allowed).toBe(true);
  expect(after.agreements![0].rewards[0].ready?.uncontested).toBeUndefined();
});
