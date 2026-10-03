import { beforeAll, expect, test } from "bun:test";
import { DEFAULT_SETTINGS } from "../shared/protocol.js";
import { labelOf, publishRulebook, rulesetEntries } from "./rulebook-install.js";
import { getRuleset, knownRulesetEntryIds, statusOf } from "./source.js";
import { builderInstall } from "./builder.js";

let seq = 0;
const fixtures = new Map<string, any>();
const candidate = (health = 70) => [
  { label: "stats", content: `stats: { health: { start: ${health}, max: 100 } }`, order: 10 },
  { label: "actions", content: "actions: { wave: { effects: { health: 1 } } }", order: 20 },
];
function fixture(failure = "") {
  const id = `install-${++seq}`;
  const old = `${id}-old`, shared = `${id}-shared`;
  const f: any = { id, failure, writes: 0, entryWrites: 0, sent: [], storage: {}, books: new Map(),
    character: { id, name: "Robin", world_book_ids: [shared, old] },
  };
  f.books.set(shared, { id: shared, name: "World lore", entries: [
    { id: `${shared}-lore`, comment: "World", content: "The world is old." },
    { id: `${shared}-rules`, comment: "warp-ruleset · stats", content: "stats: { health: { start: 10 } }" },
  ] });
  f.books.set(old, { id: old, name: "warp-ruleset", entries: [
    { id: `${old}-rules`, comment: "warp-ruleset · actions", content: "actions: { obsolete: { effects: {} } }" },
  ] });
  f.original = structuredClone([...f.books]);
  f.attachments = [...f.character.world_book_ids];
  fixtures.set(id, f);
  return f;
}
const get = (id: string) => fixtures.get(id)!;
const owner = (bookId: string) => [...fixtures.values()].find((f) => f.books.has(bookId))!;
beforeAll(() => { (globalThis as any).spindle = {
  sendToFrontend: (msg: any, userId: string) => get(userId).sent.push(structuredClone(msg)),
  log: { error() {}, info() {} }, toast: { info() {}, warning() {}, error() {} },
  chats: { get: async (id: string) => ({ id, character_id: id }) },
  characters: {
    get: async (id: string) => structuredClone(get(id).character),
    update: async (id: string, patch: any) => {
      const f = get(id); f.writes++;
      if (f.failure === "attach") throw new Error("scripted attachment failure");
      Object.assign(f.character, structuredClone(patch));
      if (f.failure === "attachment-response") throw new Error("lost response after commit");
      return structuredClone(f.character);
    },
  },
  world_books: {
    get: async (id: string) => structuredClone(owner(id).books.get(id)),
    create: async (input: any, userId: string) => {
      const f = get(userId); f.writes++;
      if (f.failure === "book-create") throw new Error("scripted book failure");
      const book = { id: `${userId}-new-${f.books.size}`, ...structuredClone(input), entries: [] };
      f.books.set(book.id, book); return structuredClone(book);
    },
    delete: async (id: string) => { owner(id).books.delete(id); },
    entries: {
      create: async (id: string, input: any) => {
        const f = owner(id); f.writes++; f.entryWrites++;
        if (f.failure === `entry-${f.entryWrites}`) throw new Error("scripted entry failure");
        const entry = { id: `${id}-e${f.entryWrites}`, ...structuredClone(input) };
        f.books.get(id).entries.push(entry);
        if (f.onEntry) f.onEntry();
        return entry;
      },
      list: async (id: string) => {
        const f = owner(id);
        if (id.includes("-new-") && f.failure === "read-back") throw new Error("scripted read failure");
        const entries = structuredClone(f.books.get(id).entries);
        if (id.includes("-new-") && f.failure === "corrupt") entries[0].content = "stats: { health: { start: 1 } }";
        return { data: entries, total: entries.length };
      },
    },
  },
  userStorage: {
    getJson: async (path: string, opts: any) => path === "settings.json" ? { ...DEFAULT_SETTINGS, decider: "rules" }
      : structuredClone(get(opts.userId).storage[path] ?? opts.fallback),
    setJson: async (path: string, value: any, opts: any) => { get(opts.userId).storage[path] = structuredClone(value); },
  },
  generate: { quiet: async () => ({ content: "{}" }) },
}; });

for (const failure of ["book-create", "entry-1", "entry-2", "read-back", "corrupt", "attach"]) test(`installation preserves the old active game after ${failure}`, async () => {
  const f = fixture(failure);
  await expect(publishRulebook(f.id, candidate(), f.id)).rejects.toThrow();
  expect(f.character.world_book_ids).toEqual(f.attachments);
  for (const [id, old] of f.original) expect(f.books.get(id)).toEqual(old);
  const loaded = await getRuleset(f.id, f.id, true);
  expect(loaded!.ruleset!.stats.health.start).toBe(10);
  expect(loaded!.ruleset!.actions.obsolete).toBeDefined();
});

test("publication supersedes old rules, preserves shared lore and keeps old books intact", async () => {
  const f = fixture(); const id = await publishRulebook(f.id, candidate(), f.id);
  const loaded = await getRuleset(f.id, f.id, true);
  expect(loaded!.ruleset!.stats.health.start).toBe(70);
  expect(loaded!.ruleset!.actions.obsolete).toBeUndefined();
  expect(loaded!.ruleset!.actions.wave).toBeDefined();
  expect(loaded!.bookIds).toEqual([id]);
  for (const [oldId, old] of f.original) expect(f.books.get(oldId)).toEqual(old);
  expect(knownRulesetEntryIds.has(`${f.id}-old-rules`)).toBe(true);
  expect(knownRulesetEntryIds.has(`${f.id}-shared-rules`)).toBe(true);
  const editing = await rulesetEntries(f.id, f.id);
  expect(editing.entries.every((e) => e.bookId === id)).toBe(true);
  expect(editing.entries.map((e) => e.label)).toEqual(["stats", "actions"]);
});

test("the read half is exported for Warp Studio: entry titles to part labels", () => {
  expect(labelOf("warp-ruleset · stats")).toBe("stats");
  expect(labelOf("[Game] warp_ruleset: People")).toBe("people");
  expect(labelOf("warp-ruleset")).toBe("core");
});

test("a lost publication response does not delete the verified active snapshot", async () => {
  const f = fixture("attachment-response");
  const id = await publishRulebook(f.id, candidate(), f.id);
  expect(f.character.world_book_ids).toContain(id);
  expect((await getRuleset(f.id, f.id, true))!.ruleset!.stats.health.start).toBe(70);
});

test("attachment changes made while staging survive publication", async () => {
  const f = fixture(); const extra = `${f.id}-extra`;
  f.books.set(extra, { id: extra, name: "New lore", entries: [] });
  f.onEntry = () => { if (!f.character.world_book_ids.includes(extra)) f.character.world_book_ids.push(extra); };
  const id = await publishRulebook(f.id, candidate(), f.id);
  expect(f.character.world_book_ids).toEqual([...f.attachments, extra, id]);
});

test("overlapping installs serialize and publish complete snapshots", async () => {
  const f = fixture();
  const [first, second] = await Promise.all([publishRulebook(f.id, candidate(70), f.id), publishRulebook(f.id, candidate(80), f.id)]);
  expect(f.character.world_book_ids.slice(-2)).toEqual([first, second]);
  expect((await getRuleset(f.id, f.id, true))!.ruleset!.stats.health.start).toBe(80);
});

test("error-level drafts are editable but cannot publish or run as a healthy partial game", async () => {
  const f = fixture();
  // A saved draft with an error-level section (a check with other dice).
  f.storage[`builder/${f.id}.json`] = {
    characterId: f.id, characterName: "Robin", mode: "refine", step: "review", connectionId: "", creative: false, base: "", analysis: null,
    rounds: [], additions: [], parts: [{ label: "stats", yaml: "stats: { health: { start: 70 } }" }, { label: "actions", yaml: "actions: { broken: { check: { dice: nope } } }" }],
    preview: null, request: null, changeSummary: null, busy: null, error: null, updatedAt: 1,
  };
  await builderInstall(f.id, f.id);
  expect(f.writes).toBe(0);
  const session = f.sent.filter((m: any) => m.type === "builder").at(-1).session;
  expect(session.step).toBe("review");
  expect(session.error).toContain("red");
  f.books.get(`${f.id}-old`).entries[0].content = "actions: [";
  const loaded = await getRuleset(f.id, f.id, true);
  expect(loaded!.ruleset).toBeNull();
  expect(statusOf(loaded).state).toBe("broken");
});
