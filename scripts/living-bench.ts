import { foldWorld, type Message, type Record, type Fact, worldPacket } from "../src/living/world.js";
import { revision } from "../src/shared/revision.js";

const messages: (Message & { record?: Record })[] = Array.from({ length: 10000 }, (_, i) => {
  const m: Message = { id: `m${i}`, is_user: false, content: `At the café they discuss the weather, visit ${i}.` };
  if (i % 50) return m;
  const fact: Fact = { id: `item${i}`, kind: "possession", subject: `item${i}`, holder: "you", text: `A keepsake from visit ${i}`, status: "open", message: m.id, quote: m.content };
  return { ...m, record: { version: 1, path: "changed-history", text: revision(m.content), events: [{ op: "put", id: fact.id, fact, evidence: fact }], notes: [] } };
});
const samples = [];
for (let i = 0; i < 3; i++) {
  const start = performance.now(), world = foldWorld(messages), packet = worldPacket(world, "keepsake from visit 0");
  if (world.facts.length !== 200 || JSON.parse(packet).established.length > 80) throw new Error("Replay or prompt bound failed");
  samples.push(Math.round((performance.now() - start) * 100) / 100);
}
console.log(JSON.stringify({ messages: messages.length, preservedFacts: 200, maxPromptFacts: 80, replayAndPacketMilliseconds: samples, synthetic: true }));
