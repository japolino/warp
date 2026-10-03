import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";
import type { Loaded } from "./source.js";
import { loadRuleset } from "../engine/loader.js";
import { foldEvents, initialState } from "../engine/state.js";
import { EXPLORE, resolveTurn, type TurnRecord } from "../engine/resolve.js";
import { buildChoices, buildMap } from "../engine/view.js";
import { discoverPlace, inventPlace, placeYaml, residentFrom } from "./discover.js";
import { presentPeople } from "../engine/world.js";
import { makeEnv } from "../engine/state.js";
import type { Ruleset } from "../engine/ruleset.js";

const YAML = `
name: Growing
clock: { start: "Mon 10:00" }
start: { location: docks }
locations:
  docks: { name: The Docks, exits: [town] }
  town: { name: Town, exits: [docks] }
discovery: { at: [docks], chance: 0, max: 2 }
`;
const r = loadRuleset([{ label: "t", content: YAML, order: 0 }]).ruleset!;

describe("a world that grows", () => {
  test("exploring rolls; each fruitless try raises the next chance by 10", () => {
    let s = initialState(r);
    expect(buildChoices(r, s, { lines: [], veils: [] }).some((c) => c.id === EXPLORE)).toBe(true);
    let found = false;
    for (let i = 0; i < 12 && !found; i++) {
      const rec = resolveTurn(r, s, { actionId: EXPLORE, via: "choice" }, { seed: `e${i}` });
      found = !!rec.discover;
      s = foldEvents(r, [rec.events], s);
    }
    expect(found).toBe(true);
    expect(s.explored.docks).toBe(0);
  });

  test("not everywhere: only where the ruleset allows", () => {
    const s = foldEvents(r, [[{ t: "move", to: "town", src: "manual" }]], initialState(r));
    expect(buildChoices(r, s, { lines: [], veils: [] }).some((c) => c.id === EXPLORE)).toBe(false);
  });

  test("a found place merges into the ruleset with an exit each way", () => {
    const yaml = placeYaml("docks", { id: "smugglers_cove", name: "Smugglers' Cove", desc: "A hidden inlet.", indoors: false });
    const grown = loadRuleset([{ label: "t", content: YAML, order: 0 }, { label: "warp-ruleset · discovered", content: yaml, order: 900 }]).ruleset!;
    expect(grown.locations.docks.name).toBe("The Docks");
    expect(grown.locations.docks.exits).toEqual(["town", "smugglers_cove"]);
    expect(grown.locations.smugglers_cove).toMatchObject({ name: "Smugglers' Cove", exits: ["docks"] });
    expect(buildMap(grown, initialState(grown))!.nodes.map((n) => n.id)).toContain("smugglers_cove");
  });
});

// Use the actual helper/host interface, without global module mocks.
const valid = { name: "Quiet Cove", desc: "A sheltered inlet.", indoors: false,
  opportunity: { label: "Inspect the tide marks", hint: "Old tide marks show how high the water rises." } };
let fixtureSeq = 0;
function hostFixture(output: unknown = valid, base = YAML, ruleset: Ruleset = r) {
  const id = `discovery-test-${++fixtureSeq}`;
  const entries: any[] = [{ id: `${id}-base`, comment: "warp-ruleset", content: base, order_value: 0 }];
  const calls: string[] = [];
  const f = { failSave: false, failRead: false, failHelper: false, entries, calls, request: null as any };
  (globalThis as any).spindle = {
    generate: { quiet: async (req: any) => { f.request = req; if (f.failHelper) throw new Error("helper unavailable"); return { content: typeof output === "string" ? output : JSON.stringify(output) }; } },
    chats: { get: async () => ({ character_id: id }) },
    characters: { get: async () => ({ id, name: "Sailor", world_book_ids: [id] }) },
    world_books: { get: async () => ({ id, name: "warp-ruleset" }), entries: {
      create: async (_: string, input: any) => { calls.push("save"); if (f.failSave) throw new Error("save failed"); entries.push({ id: `${id}-discovered`, ...input }); },
      list: async () => { calls.push("read"); if (f.failRead) throw new Error("read failed"); return { data: entries, total: entries.length }; },
    } },
    chat: { getMessages: async () => { calls.push("provenance"); return []; } },
    log: { error() {}, info() {} }, toast: { warning() {} },
  };
  const loaded: Loaded = { characterId: id, characterName: "Sailor", cardKind: "character", ruleset, issues: [], source: "test", entryIds: [], bookIds: [id], at: 0 };
  return { f, id, loaded };
}
function discoverRecord(): TurnRecord {
  return { v: 1 as const, at: 0, events: [], hints: [], discover: { from: "docks" } };
}

describe("bounded discovery", () => {
  test("strict helper schema rejects malformed, extra mechanical keys and duplicates", async () => {
    for (const output of ["not json", {}, { ...valid, indoors: "false" }, { ...valid, effects: { health: 99 } },
      { ...valid, opportunity: { ...valid.opportunity, reward: 99 } }, { ...valid, name: "The Docks" },
      { ...valid, desc: "x".repeat(401) }, { ...valid, opportunity: { label: "", hint: "look" } }]) {
      hostFixture(output);
      expect(await inventPlace(r, initialState(r), "", DEFAULT_SETTINGS)).toBeNull();
    }
    const { f } = hostFixture(); f.failHelper = true;
    expect(await inventPlace(r, initialState(r), "", DEFAULT_SETTINGS)).toBeNull();
  });
  test("generated opportunity is one local no-roll action with only a hint", async () => {
    const { f } = hostFixture();
    const p = (await inventPlace(r, initialState(r), "", DEFAULT_SETTINGS))!;
    expect(f.request.parameters.max_tokens).toBe(500);
    const grown = loadRuleset([{ label: "base", content: YAML, order: 0 }, { label: "discovered", content: placeYaml("docks", p), order: 900 }]).ruleset!;
    const s = foldEvents(grown, [[{ t: "move", to: p.id, src: "manual" }]], initialState(grown));
    const a = Object.values(grown.actions).find((a) => a.label === valid.opportunity.label)!;
    expect(a.at).toEqual([p.id]); expect(a.check).toBeUndefined(); expect(a.time).toBe(0);
    expect(buildChoices(grown, s, { lines: [], veils: [] }).some((c) => c.id === a.id)).toBe(true);
    const rec = resolveTurn(grown, s, { actionId: a.id, via: "choice" }, { seed: "inspect" });
    expect(rec.hints).toContain(valid.opportunity.hint);
    expect(rec.events.some((e) => ["stat", "item", "flag", "secret"].includes(e.t))).toBe(false);
  });
  test("save and provenance acceptance precede move", async () => {
    const { f, id, loaded } = hostFixture(); const rec = discoverRecord();
    await discoverPlace(loaded, r, initialState(r), rec, id, DEFAULT_SETTINGS);
    expect(f.calls).toEqual(["save", "read", "provenance"]);
    expect(rec.events).toContainEqual(expect.objectContaining({ t: "move", to: "quiet_cove" }));
    expect(f.entries[1].comment).toContain("warp-ruleset · discovered");
  });
  test("helper, save and reload failures never produce move events", async () => {
    for (const mode of ["failHelper", "failSave", "failRead"] as const) {
      const { f, id, loaded } = hostFixture(); f[mode] = true; const rec = discoverRecord();
      await discoverPlace(loaded, r, initialState(r), rec, id, DEFAULT_SETTINGS);
      expect(rec.events).toEqual([]); expect(rec.hints.length).toBeGreaterThan(0);
      if (mode === "failHelper") expect(f.calls).toEqual([]);
    }
  });
});

const PEOPLE_YAML = `
name: Peopled
clock: { start: "Mon 10:00" }
start: { location: docks }
locations:
  docks: { name: The Docks, exits: [town] }
  town: { name: Town, exits: [docks] }
relationships:
  stats: { affection: { start: 0 } }
  people:
    wren: { name: Wren Stone, schedule: [{ at: town }] }
discovery: { at: [docks], chance: 0, max: 2, people: true }
`;
const rp = loadRuleset([{ label: "t", content: PEOPLE_YAML, order: 0 }]).ruleset!;
const resident = { name: "Old Hessa", desc: "Mends nets on the shingle and watches the tide." };

describe("discovered residents", () => {
  test("off by default: no resident in prompt, schema or YAML", async () => {
    expect(r.discovery.people).toBe(false);
    const { f } = hostFixture({ ...valid, resident });
    expect(await inventPlace(r, initialState(r), "", DEFAULT_SETTINGS)).toBeNull();
    expect(JSON.stringify(f.request)).not.toContain("resident");
    expect(f.request.parameters.max_tokens).toBe(500);
    expect(placeYaml("docks", { id: "x", name: "X", desc: "d", indoors: false })).not.toContain("relationships");
    const bad = loadRuleset([{ label: "t", content: YAML.replace("max: 2 }", "max: 2, people: yes }"), order: 0 }]);
    expect(bad.ruleset!.discovery.people).toBe(false);
    expect(bad.issues.some((i) => i.where === "Discovery › people")).toBe(true);
  });

  test("on: the place comes with one scheduled resident, saved before the move", async () => {
    const { f, id, loaded } = hostFixture({ ...valid, resident }, PEOPLE_YAML, rp);
    const rec = discoverRecord();
    await discoverPlace(loaded, rp, initialState(rp), rec, id, DEFAULT_SETTINGS);
    expect(JSON.stringify(f.request)).toContain("resident");
    expect(f.calls).toEqual(["save", "read", "provenance"]);
    expect(f.entries[1].content).toContain("old_hessa");
    const grown = loadRuleset(f.entries.map((e, i) => ({ label: e.comment, content: e.content, order: e.order_value ?? i }))).ruleset!;
    expect(grown.people.old_hessa).toMatchObject({ name: "Old Hessa", desc: resident.desc, schedule: [{ at: "quiet_cove" }] });
    expect(grown.people.old_hessa.age).toBeUndefined();
    expect(grown.people.wren.name).toBe("Wren Stone");
    const kinds = rec.events.map((e) => e.t);
    expect(kinds.indexOf("move")).toBeLessThan(kinds.indexOf("person"));
    const s = foldEvents(grown, [rec.events], initialState(rp));
    expect(s.location).toBe("quiet_cove");
    expect(presentPeople(grown, s, makeEnv(grown, s))).toEqual(["old_hessa"]);
    // Unknown age: not known to be an adult until the story establishes it.
    expect(s.adults.old_hessa).toBeUndefined();
    expect(rec.hints.some((h) => h.includes("Old Hessa"))).toBe(true);
  });

  test("malformed or aged residents drop only the resident; the place is kept", async () => {
    for (const bad of [null, "Hessa", [], { name: "Hessa" }, { ...resident, age: 30 }, { ...resident, start: { affection: 90 } },
      { name: "x".repeat(41), desc: "d" }, { name: "Hessa", desc: "x".repeat(241) }, { name: " ", desc: "d" },
      { name: "Wren Stone", desc: "A duplicate of a known person." }, { name: "!!!", desc: "No usable id." }]) {
      hostFixture({ ...valid, resident: bad }, PEOPLE_YAML, rp);
      const p = await inventPlace(rp, initialState(rp), "", DEFAULT_SETTINGS);
      expect(p?.id).toBe("quiet_cove");
      expect(p?.resident).toBeUndefined();
    }
    // Other extra keys still reject the whole place, and a reply without a resident is a plain place.
    hostFixture({ ...valid, resident, effects: { health: 9 } }, PEOPLE_YAML, rp);
    expect(await inventPlace(rp, initialState(rp), "", DEFAULT_SETTINGS)).toBeNull();
    hostFixture(valid, PEOPLE_YAML, rp);
    expect((await inventPlace(rp, initialState(rp), "", DEFAULT_SETTINGS))?.resident).toBeUndefined();
  });

  test("resident ids never collide with declared, met, forgotten or kin ids", () => {
    let s = initialState(rp);
    expect(residentFrom(rp, s, { name: "Wren", desc: "d" })?.id).toBe("wren_2");
    s = foldEvents(rp, [[{ t: "person", id: "hessa", name: "Someone Else", src: "narrator" }, { t: "person", id: "hessa_2", name: "Another", src: "narrator" },
      { t: "person", id: "mo", name: "Mo", src: "narrator" }, { t: "forget", who: "mo", src: "manual" } as any]], s);
    expect(residentFrom(rp, s, { name: "Hessa", desc: "d" })?.id).toBe("hessa_3");
    expect(residentFrom(rp, s, { name: "Mo", desc: "d" })?.id).toBe("mo_2");
    expect(residentFrom(rp, s, { name: "Another", desc: "d" })).toBeUndefined();
    expect(residentFrom(rp, s, { name: "ハナ", desc: "d" })?.id).toBe("resident");
  });

  test("a base whose people may use the top-level alias gets no resident", async () => {
    const alias = YAML.replace("max: 2 }", "max: 2, people: true }") + "people:\n  wren: { name: Wren }\n";
    const ra = loadRuleset([{ label: "t", content: alias, order: 0 }]).ruleset!;
    expect(ra.discovery.people).toBe(true);
    const { f } = hostFixture({ ...valid, resident }, alias, ra);
    expect(await inventPlace(ra, initialState(ra), "", DEFAULT_SETTINGS)).toBeNull();
    expect(JSON.stringify(f.request)).not.toContain("resident");
  });
});
