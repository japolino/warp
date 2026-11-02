// Synthetic router + transaction preflight benchmark. Not narrator or end-to-end latency.
import { readLocalClaim } from "../src/living/local-actions.js";
import { emptyMechanics, applyObservations, readMechanicalObservations } from "../src/living/mechanics.js";
import type { Message, World } from "../src/living/world.js";
const data = await Bun.file(new URL("../src/living/fixtures/cafe-agreement.json", import.meta.url)).json();
const messages: Message[] = [{ id: "live-agreement-g", is_user: false, content: data.greeting }];
let state = applyObservations(emptyMechanics(), readMechanicalObservations(data.bootstrap.mechanicalObservations, emptyMechanics(), messages));
for (const [i, turn] of data.turns.entries()) {
  messages.push({ id: `live-agreement-u${i * 2 + 1}`, is_user: true, content: turn.player }, { id: `live-agreement-r${i * 2 + 2}`, is_user: false, content: turn.reply });
  const rows = turn.extraction.mechanicalObservations.map((r: any) => r.kind === "reward_ready" ? { ...r, uncontested: true } : r);
  state = applyObservations(state, readMechanicalObservations(rows, state, messages));
}
const narrator = messages.at(-1)!;
state = applyObservations(state, readMechanicalObservations([{ kind: "entity", name: "Jo", entityKind: "person", present: true, message: narrator.id, quote: state.agreements![0].rewards[0].ready!.source.quote }], state, messages));
messages.push({ id: "claim", is_user: true, content: "I collect my pay." });
const world: World = { place: "Café", present: ["Jo"], facts: [], mechanics: state };
for (let n = 0; n < 100; n++) if (!readLocalClaim(messages.at(-1)!.content, world, messages)) throw new Error("Fixture did not route locally");
const times: number[] = [];
for (let n = 0; n < 1000; n++) {
  const start = performance.now(), result = readLocalClaim(messages.at(-1)!.content, world, messages);
  if (!result) throw new Error("Local route failed"); times.push(performance.now() - start);
}
times.sort((a, b) => a - b);
console.log(JSON.stringify({ mode: "synthetic-router-and-preflight-only", iterations: times.length, medianMs: times[500], p95Ms: times[950], modelCalls: 0, paidDuringRouting: !!state.agreements![0].rewards[0].paid }));
