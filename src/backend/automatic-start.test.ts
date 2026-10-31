import { expect, test } from "bun:test";
import { getRuleset, invalidateCharacter, invalidateChat } from "./source.js";

test("a character without a ruleset starts automatically without creating a lorebook", async () => {
  const previous = (globalThis as any).spindle;
  let writes = 0;
  (globalThis as any).spindle = {
    chats: { get: async () => ({ character_id: "automatic-character" }) },
    characters: { get: async () => ({ name: "Jo", world_book_ids: [] }), update: async () => { writes++; } },
    world_books: { create: async () => { writes++; }, get: async () => null },
    log: { error() {} },
  };
  try {
    const loaded = await getRuleset("automatic-chat", "automatic-user", true);
    expect(loaded?.source).toBe("Automatic");
    expect(loaded?.ruleset?.style).toBe("story");
    expect(Object.keys(loaded?.ruleset?.relStats ?? {})).toEqual([]);
    expect(loaded?.ruleset?.goals.fromStory).toBe(true);
    expect(writes).toBe(0);
  } finally {
    invalidateChat("automatic-chat");
    invalidateCharacter("automatic-character");
    (globalThis as any).spindle = previous;
  }
});
