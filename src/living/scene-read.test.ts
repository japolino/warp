import { expect, test } from "bun:test";
import { sceneReadSummary } from "./scene-read.js";

test("read diagnostics distinguish offered/accepted rows while bounding private spatial evidence", () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ kind: "route", from: "a".repeat(1000), to: "b", via: String(i), message: "reply", quote: "q".repeat(1000), unexpected: "must not be retained" }));
  const summary = sceneReadSummary(rows, []);
  expect(summary.offered.route).toBe(24); expect(summary.accepted.route).toBeUndefined();
  expect(summary.spatial).toHaveLength(8);
  expect(summary.spatial![0].from).toHaveLength(160); expect(summary.spatial![0].quote).toHaveLength(400);
  expect(JSON.stringify(summary)).not.toContain("must not be retained");
});

test("malformed model kinds cannot alter diagnostic object prototypes", () => {
  const summary = sceneReadSummary([{ kind: "__proto__" }, { kind: "constructor" }, null, "route"], []);
  expect(summary.offered["__proto__"]).toBe(1); expect(summary.offered.constructor as unknown).toBe(1);
  expect(Object.getPrototypeOf(summary.offered)).toBeNull();
  expect(sceneReadSummary(null, []).spatial).toBeUndefined();
});

test("private companion diagnostics retain bounded binding fields without arbitrary model data", () => {
  const rows = Array.from({ length: 30 }, () => ({ kind: "companion", actor: "a".repeat(300), controller: "b", companionKind: "companion", quote: "q".repeat(900), surprise: "private spill" }));
  const summary = sceneReadSummary(rows, []);
  expect(summary.companions).toHaveLength(8); expect(summary.companions![0].actor).toHaveLength(160);
  expect(summary.companions![0].quote).toHaveLength(400); expect(JSON.stringify(summary)).not.toContain("private spill");
});
