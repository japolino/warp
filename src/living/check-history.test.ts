import { expect, test } from "bun:test";
import type { Msg } from "../backend/ledger.js";
import { savedChecks } from "./check-history.js";
import { pathOf, resolveAttempt, type Record as LivingRecord } from "./world.js";
import { storyRevision } from "./story-text.js";

const msg = (id: string, is_user: boolean, content: string, index: number): Msg => ({ id, content, is_user, index_in_chat: index, swipe_id: 0, role: is_user ? "user" : "assistant" } as Msg);
const recordOf = (m: Msg) => (m.metadata?.warpLiving as any)?.[String(m.swipe_id ?? 0)] as LivingRecord | undefined;
const decision = resolveAttempt({ risky: true, contested: true, tier: "uncertain", intent: "Cross the guarded doorway", stakes: "Exposure", reasons: ["The guard watches the doorway"] }, "history-check")!;

test("a saved prepared check stays associated with its reply after quiet turns and illustrations", () => {
  const player = msg("u", true, "Run!", 0), reply = msg("r", false, "The guard reacts.", 1), quiet = msg("q", true, '"Hello."', 2), next = msg("n", false, "Jo says hello.", 3);
  player.metadata = { warpLivingAttempt: { path: pathOf([player]), decision } };
  const history = [player, reply, quiet, next];
  expect(savedChecks(history, recordOf)).toEqual([{ messageId: reply.id, decision, responses: [] }]);
  reply.content += '<div data-inlay-illustrator="true"><img src="one"></div>\n\n';
  expect(savedChecks(history, recordOf)).toEqual([{ messageId: reply.id, decision, responses: [] }]);
  player.content = "I stay here."; expect(savedChecks(history, recordOf)).toEqual([]);
  player.content = "Run!"; player.swipe_id = 1; expect(savedChecks(history, recordOf)).toEqual([]);
});

test("a reply's saved outcome needs its own selected causal record", () => {
  const opening = msg("g", false, "An opening", 0), reply = msg("r", false, "The guard reacts.", 1);
  reply.metadata = { warpLiving: { "0": { version: 1, path: pathOf([opening]), text: storyRevision(reply.content), decision, events: [], notes: [] } } };
  expect(savedChecks([opening, reply], recordOf)[0].decision).toEqual(decision);
  opening.content = "A different opening"; expect(savedChecks([opening, reply], recordOf)).toEqual([]);
});

test("historical NPC checks use names known then, without leaking a later or card-only identity", () => {
  const opening = msg("g", false, "A masked figure waits by the door.", 0), player = msg("u", true, "I defend.", 1), reply = msg("r", false, "The masked figure strikes.", 2), reveal = msg("v", false, "The figure introduces herself as Captain Vale.", 3);
  const entity = { id: "guard", name: "vale", displayName: "masked figure", aliases: [], entityKind: "person", present: true, status: "active", source: { message: opening.id, quote: "A masked figure waits by the door.", sourceRevision: storyRevision(opening.content) } };
  opening.metadata = { warpMechanics: { "0": { version: 1, path: pathOf([]), text: storyRevision(opening.content), observations: [{ kind: "entity", value: entity }] } } };
  reply.metadata = { warpMechanics: { "0": { version: 1, path: pathOf([opening, player]), text: storyRevision(reply.content), observations: [], receipt: { status: "ready", beats: [{ kind: "response", actor: "vale", target: "you", name: "strike", decision }] } } } };
  reveal.metadata = { warpMechanics: { "0": { version: 1, path: pathOf([opening, player, reply]), text: storyRevision(reveal.content), observations: [{ kind: "entity", value: { ...entity, displayName: "Captain Vale", source: { message: reveal.id, quote: reveal.content, sourceRevision: storyRevision(reveal.content) } } }] } } };
  expect(savedChecks([opening, player, reply, reveal], recordOf)[0].responses[0].actor).toBe("masked figure");
  const record = (opening.metadata.warpMechanics as any)["0"];
  record.observations[0].value = { ...entity, displayName: "Captain Vale", source: { ...entity.source, message: "warp-source:card:secret" } };
  expect(savedChecks([opening, player, reply, reveal], recordOf)[0].responses[0].actor).toBe("Someone");
});
