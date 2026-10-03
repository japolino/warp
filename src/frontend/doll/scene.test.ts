import { beforeEach, describe, expect, test } from "bun:test";
import type { DollRequest, HudView } from "../../shared/protocol.js";
import { createDollLab } from "./lab.js";
import { defaultLook, outfitFor } from "./outfits.js";
import { castKey, cleanChat, focusFrom, MAX_CAST, mentionScore, putCast, sceneFocus, touchChat } from "./scene.js";

class MemStore {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}

describe("who the 'With you' doll shows", () => {
  test("the reply's focus: most mentions (full or first name), then the latest", () => {
    const text = "Rhea leaned on the bar. Marcus polished a glass. \"Again?\" Rhea Vos asked, and Marcus shrugged.";
    expect(mentionScore(text, "Rhea Vos")).toBeGreaterThan(0);
    expect(focusFrom(text, ["Marcus", "Rhea Vos"])).toBe("Rhea Vos");
    expect(focusFrom("Marcus waved.", ["Rhea Vos"])).toBe("");
    // Whole words only: "Al" isn't in "Always".
    expect(focusFrom("Always the same.", ["Al"])).toBe("");
  });

  test("a pin wins while they're here; then the story's focus; then whoever is first", () => {
    expect(sceneFocus(["Rhea", "Marcus"], "marcus", "Rhea")).toBe("Marcus");
    expect(sceneFocus(["Rhea"], "Marcus", "Rhea")).toBe("Rhea");
    expect(sceneFocus(["Rhea", "Marcus"], "", "Juniper")).toBe("Rhea");
    expect(sceneFocus([], "Rhea", "Rhea")).toBeNull();
  });

  test("saved dolls are cleaned, the cast is capped, and old chats are forgotten", () => {
    const c = cleanChat({ cast: { x: { name: "__proto__", look: {} }, y: { name: "Rhea", look: { outfit: "nope" } } }, who: "evil" }, { you: defaultLook("f"), them: defaultLook("m") });
    expect(Object.keys(c.cast)).toEqual(["rhea"]);
    expect(c.who).toBe("you");
    for (let i = 0; i < MAX_CAST + 4; i++) putCast(c, `P${i}`, defaultLook("f"), "", i);
    expect(Object.keys(c.cast).length).toBe(MAX_CAST);
    expect(c.cast[castKey(`P${MAX_CAST + 3}`)]).toBeDefined();
    const { list, drop } = touchChat(["a", "b", "c"], "d", 3);
    expect(list).toEqual(["d", "a", "b"]);
    expect(drop).toEqual(["c"]);
  });
});

describe("dolls follow the story", () => {
  let store: MemStore;
  let sent: DollRequest[];
  let chat: string;
  let decider: string;
  let hud: HudView | null;
  let text: Record<string, string>;
  const person = (name: string, present: boolean) => ({ id: castKey(name), name, present, stats: [], whereabouts: null, goal: null, bonds: [], conditions: [], memories: [] });
  const make = () => createDollLab({ send: (m) => { sent.push(m); }, chatId: () => chat, hud: () => hud, changed: () => {}, decider: () => decider, messageText: (id) => text[id] ?? "" });
  const stateOf = (reply: string) => ({ chatId: chat, latestMessageId: reply, choicesAnchor: reply, busy: false, hud });

  beforeEach(() => {
    store = new MemStore();
    (globalThis as { localStorage?: unknown }).localStorage = store;
    sent = []; chat = "c1"; decider = "jev"; text = {};
    hud = { people: [person("Rhea Vos", true), person("Marcus", true), person("Jo", false)] } as unknown as HudView;
  });

  test("opening a chat dresses whoever is here once, but doesn't re-read an old reply", () => {
    const lab = make();
    text.m1 = "Marcus slid a mug over. Marcus grinned.";
    lab.onState(stateOf("m1"));
    expect(sent.map((m) => [m.who, m.source, m.auto])).toEqual([["Marcus", "profile", true]]);
    expect(lab.sceneSection()!.body).toContain("Dressing Marcus");
    lab.onState(stateOf("m1"));
    expect(sent.length).toBe(1);
  });

  test("after each new reply: a story check for both dolls; the look lands in the chat's cast", () => {
    const lab = make();
    text.m1 = "Marcus slid a mug over.";
    lab.onState(stateOf("m1"));
    const first = sent[0];
    expect(first.who).toBe("Marcus");
    lab.onLook({ who: first.who, look: { ...defaultLook("m"), outfit: outfitFor("street", "m") }, note: "", name: first.who, chatId: "c1", auto: true });
    expect(lab.sceneSection()!.body).toContain("<svg");
    sent = [];
    text.m2 = "Rhea Vos took off her coat. Rhea laughed.";
    lab.onState(stateOf("m2"));
    // The reply is about Rhea now; she has no look yet, so she's dressed from her card instead.
    expect(sent.map((m) => [m.who, m.source])).toEqual([["you", "story"], ["Rhea Vos", "profile"]]);
    expect(lab.sceneSection()!.title).toContain("Rhea Vos");
    // Pin Marcus: the next reply checks his look, not Rhea's.
    const fake = { type: "click", target: { closest: (s: string) => (s === ".warp-doll-scene" ? {} : s.includes("data-doll-focus") ? { dataset: { dollFocus: "Marcus" } } : null) }, preventDefault() {} } as unknown as Event;
    expect(lab.handle(fake, {} as HTMLElement)).toBe(true);
    for (const m of sent) lab.onLook({ who: m.who, look: null, note: "", chatId: "c1", auto: true });
    sent = [];
    text.m3 = "Rhea Vos sighed.";
    lab.onState(stateOf("m3"));
    expect(sent.map((m) => [m.who, m.source])).toEqual([["you", "story"], ["Marcus", "story"]]);
    expect(lab.sceneSection()!.title).toContain("Marcus");
  });

  test("without the classifier, nothing runs on its own unless set to always", () => {
    decider = "llm";
    const lab = make();
    lab.onState(stateOf("m1"));
    lab.onState(stateOf("m2"));
    expect(sent).toEqual([]);
    expect(lab.sceneSection()!.body).toContain("data-doll-scene-ask");
  });

  test("each chat keeps its own dolls; a late answer goes to the chat that asked", () => {
    const lab = make();
    lab.onState(stateOf("m1"));
    const asked = sent[0];
    chat = "c2";
    expect(lab.sceneSection()!.body).toContain("No look for"); // c2 has its own (empty) cast
    lab.onState(stateOf("m9"));
    expect(sent.length).toBe(2); // and dresses them for itself
    lab.onLook({ who: asked.who, look: defaultLook("m"), note: "", name: asked.who, chatId: "c1", auto: true });
    expect(JSON.parse(store.getItem("warp:doll:chat:c1")!).cast[castKey(asked.who)]).toBeDefined();
    expect(JSON.parse(store.getItem("warp:doll:chat:c2") ?? "{}").cast?.[castKey(asked.who)]).toBeUndefined();
  });

  test("nobody here: the section says so", () => {
    hud = { people: [person("Jo", false)] } as unknown as HudView;
    expect(make().sceneSection()!.body).toContain("No one's with you");
  });
});
