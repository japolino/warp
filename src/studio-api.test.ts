// Warp Studio's surface: importable without the Lumiverse host, and the engine reaches nothing outside it.

import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import * as api from "./studio-api.js";

test("the Studio surface loads without the host and names the format", () => {
  expect(api.RULESET_FORMAT).toBe(2);
  const { ruleset } = api.loadRuleset([{ label: "t", content: "stats: { body: { kind: attribute, max: 10, start: 3 } }", order: 0 }]);
  expect(api.lintRuleset(ruleset!)).toEqual([]);
  expect(api.simulateContest(ruleset!, "fight", 3, "fair", 200).runs).toBe(200);
  expect(typeof api.createLoopSim).toBe("function");
  expect(api.REMOVED_KEYS.encounters.hint).toContain("conflict:");
});

test("engine modules import only each other, the shared protocol types and js-yaml", () => {
  const dir = new URL("./engine/", import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
    const src = readFileSync(new URL(f, dir), "utf8");
    for (const m of src.matchAll(/from\s+"([^"]+)"/g)) expect(m[1].startsWith("./") || m[1] === "../shared/protocol.js" || m[1] === "js-yaml").toBe(true);
    expect(src).not.toMatch(/\bspindle\.|\bwindow\.|\bdocument\.|\bfetch\(/);
  }
});
