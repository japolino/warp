import { describe, expect, test } from "bun:test";
import { loadRuleset } from "./loader.js";
import { foldEvents, initialState, makeEnv, type GameState } from "./state.js";
import { resolveTurnFull } from "./resolve.js";
import { evaluate } from "./expr.js";
import { stateDigest } from "./view.js";

const YAML = `
name: Seen
clock: { start: "Mon 12:00" }
start: { location: street }
locations: { street: { name: The High Street } }
items: { shirt: { name: Shirt, slot: top }, jeans: { name: Jeans, slot: bottom } }
wardrobe: { slots: [top, bottom], cover: [top, bottom], start: [shirt, jeans] }
relationships:
  stats: { lust: { start: 0 } }
  people:
    jo: { name: Jo, age: 30, schedule: [ { at: street } ] }
    dex: { name: Dex, age: 35 }
    sam: { name: Sam, schedule: [ { at: street } ] }
    kid: { name: Kid, age: 12, schedule: [ { at: street } ] }
companions:
  jo: { bonds: { dex: 40 } }
observers:
  crowd: 2
  reactions:
    interested: { rel: { target: { lust: +5 } } }
actions:
  strip_top: { label: Take off your shirt, effects: { undress: [top] } }
  wait: { label: Wait, time: 1440 }
`;
const r = loadRuleset([{ label: "t", content: YAML, order: 0 }]).ruleset!;
const act = (s: GameState, id: string, odds?: Record<string, Record<string, number>>) => {
  const res = resolveTurnFull(r, s, { actionId: id, via: "choice" }, { seed: "s", odds });
  return { s: foldEvents(r, [res.record.events], s), rec: res.record, needs: res.needs };
};

describe("being seen", () => {
  test("nobody reacts while nothing is exposed", () => {
    expect(act(initialState(r), "wait").rec.hints.join(" ")).not.toContain("How people react");
  });

  test("each adult present reacts individually; children and unknown ages are never asked", () => {
    const t = act(initialState(r), "strip_top", { "seen:jo": { interested: 1 }, "seen:dex": { disapproving: 1 } });
    const asked = act(initialState(r), "strip_top").needs.map((n) => n.id);
    expect(asked).toContain("seen:jo");
    expect(asked).toContain("seen:dex");
    expect(asked).not.toContain("seen:kid");
    expect(asked).not.toContain("seen:sam");
    expect(t.s.rel.jo.lust).toBe(5);
    expect(t.s.seen.jo.what).toContain("exposed: top");
    expect(t.s.seen.kid).toBeUndefined();
    const hint = t.rec.hints.find((h) => h.startsWith("How people react"))!;
    expect(hint).toContain("Jo: is interested");
    expect(hint).toContain("Dex: disapproves");
    expect(evaluate("seen_by('jo') and fame() == 2", makeEnv(r, t.s))).toBe(true);
  });

  test("word spreads to those close to a witness, once a day", () => {
    let s = act(initialState(r), "strip_top", { "seen:jo": { interested: 1 }, "seen:dex": { unnoticed: 1 } }).s;
    expect(s.seen.dex).toBeUndefined();
    s = foldEvents(r, [[{ t: "wear", slot: "top", item: "shirt", src: "manual" }]], s);
    const t = act(s, "wait");
    expect(t.s.seen.dex).toMatchObject({ heard: true });
    expect(t.rec.hints.join(" ")).toContain("Jo told Dex");
    expect(stateDigest(r, t.s)).toContain("Dex heard about it");
  });
});
