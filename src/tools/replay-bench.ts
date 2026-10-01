// Offline: bun src/tools/replay-bench.ts. No model, host, credentials or production data.
import { foldPath, recordPath, type Msg } from "../backend/ledger.js";
import { normalizeRuleset } from "../engine/ruleset.js";
import { revision } from "../shared/revision.js";
const r = normalizeRuleset({ stats: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`s${i}`, { start: 50 }])),
  relationships: { stats: { trust: { start: 50 } }, people: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`p${i}`, { name: `Person ${i}` }])) },
  items: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`item${i}`, { name: `Item ${i}` }])),
  start: { items: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`item${i}`, 2])) },
}).ruleset!;
const quantile = (samples: number[], q: number) => [...samples].sort((a, b) => a - b)[Math.min(samples.length - 1, Math.floor(q * samples.length))];
for (const n of [100, 1000, 10000]) {
  const messages = Array.from({ length: n }, (_, i) => ({ id: `m${i}`, index_in_chat: i, is_user: false, swipe_id: 0, content: "The story continues. ".repeat(40), metadata: { warp: { swipes: { "0": {
    v: 1, hints: [], at: i, events: [{ t: "stat", id: `s${i % 20}`, d: i % 2 ? 1 : -1, src: "action" }, ...(i % 100 === 0 ? [{ t: "save", slot: "1", label: "Checkpoint", src: "manual" }] : [])],
  } } } } } as unknown as Msg));
  const results: Record<string, unknown> = {};
  let expected = "";
  for (const [label, limit] of [["all snapshots", Infinity], ["HUD 60 snapshots", 60], ["state only", 0]] as const) {
    const times: number[] = [], heaps: number[] = [];
    for (let i = 0; i < 3; i++) {
      Bun.gc(true);
      const heap = process.memoryUsage().heapUsed, start = performance.now();
      const folded = foldPath(r, messages, limit);
      times.push(performance.now() - start); heaps.push(Math.max(0, process.memoryUsage().heapUsed - heap));
      const actual = revision(folded.state);
      if (expected && actual !== expected) throw new Error("Replay parity failed");
      expected = actual;
    }
    results[label] = { medianMs: +quantile(times, .5).toFixed(2), p95Ms: +quantile(times, .95).toFixed(2), medianHeapMB: +(quantile(heaps, .5) / 1048576).toFixed(2) };
  }
  console.log(JSON.stringify({ turns: n, ...results, pathRevisionLength: recordPath(r, messages).length }));
}
