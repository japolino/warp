import { afterEach, describe, expect, test } from "bun:test";
import { connectPublicEvents, toWarpState, WARP_STATE, WARP_STATE_REQUEST, type WarpStateV1 } from "./public-events.js";
import { RULESET_FORMAT } from "../engine/ruleset.js";
import { hud, stateMsg } from "./fixtures.js";

/** The keys of warp-state-v1 (the spec's WarpStateV1, as LumiDoll reads it, plus `rulesetFormat`). */
const KEYS = ["version", "provider", "rulesetFormat", "chatId", "messageId", "time", "place", "you", "people", "meters"];

describe("warp-state-v1: the mapping", () => {
  test("scene, you, people and meters from the state message", () => {
    const s = toWarpState(stateMsg(), { enabled: true });
    expect(s).toEqual({
      version: 1, provider: "warp", rulesetFormat: RULESET_FORMAT, chatId: "c1", messageId: "m2",
      time: { label: "Day 2 · 23:40", day: 2, hour: 23, minute: 40 },
      place: "The Rusty Anchor",
      you: { name: "Sam", appearance: "short, scar over one eye", outfit: "rain-soaked coat", items: ["Rope"] },
      people: [
        { id: "mira", name: "Mira", present: true, appearance: "tall, red braid, freckles", outfit: "green apron over a black shirt", bands: { Trust: "Open" } },
        { id: "jo", name: "Jo", present: false, bands: { Trust: "Wary" } },
      ],
      meters: [{ id: "health", label: "Health", band: "Fine" }],
    });
    for (const k of Object.keys(s)) expect(KEYS).toContain(k);
  });

  test("the shape a listener checks: version 1, provider warp, a number for the format, strings where text is", () => {
    const s = toWarpState(stateMsg(), { enabled: true });
    expect(s.version).toBe(1);
    expect(s.provider).toBe("warp");
    expect(typeof s.rulesetFormat).toBe("number");
    for (const p of s.people) {
      expect(Object.keys(p).every((k) => ["id", "name", "present", "appearance", "outfit", "bands"].includes(k))).toBe(true);
      expect(typeof p.present).toBe("boolean");
    }
    expect(Object.keys(s.you).every((k) => ["name", "appearance", "outfit", "items"].includes(k))).toBe(true);
  });

  test("a stat without bands sends its number; unknown looks are left out, not sent empty", () => {
    const h = hud({ you: { appearance: null, outfit: " " }, clock: null, location: null });
    h.people[0].stats[0].text = null;
    const s = toWarpState(stateMsg({ hud: h }), { enabled: true });
    expect(s.people[0].bands).toEqual({ Trust: "42" });
    expect(s.you).toEqual({ name: "Sam", items: ["Rope"] });
    expect(s.time).toBeUndefined();
    expect(s.place).toBeNull();
  });

  test("Warp off, no rules or no state yet: an empty state so listeners can clear (format still sent)", () => {
    const empty = (chatId: string | null, name: string): WarpStateV1 => ({ version: 1, provider: "warp", rulesetFormat: RULESET_FORMAT, chatId, messageId: null, you: { name }, people: [] });
    expect(toWarpState(stateMsg(), { enabled: false })).toEqual(empty("c1", "Sam"));
    expect(toWarpState(stateMsg({ hud: null }), { enabled: true })).toEqual(empty("c1", "Sam"));
    expect(toWarpState(null, { enabled: true, chatId: "c9" })).toEqual(empty("c9", ""));
  });
});

describe("warp-state-v1: publishing", () => {
  let bus: EventTarget;
  const sent: WarpStateV1[] = [];
  afterEach(() => { sent.length = 0; });
  const connect = (get: () => WarpStateV1) => {
    bus = new EventTarget();
    bus.addEventListener(WARP_STATE, (e) => sent.push((e as CustomEvent).detail));
    return connectPublicEvents({ getState: get, target: bus });
  };

  test("publishes on change only, and answers a request at once", () => {
    let st = stateMsg();
    const pub = connect(() => toWarpState(st, { enabled: true }));
    pub.publish();
    pub.publish();
    expect(sent.length).toBe(1);
    st = stateMsg({ hud: hud({ location: { name: "The docks" } }) });
    pub.publish();
    expect(sent.length).toBe(2);
    expect(sent[1].place).toBe("The docks");

    bus.dispatchEvent(new CustomEvent(WARP_STATE_REQUEST, { detail: { version: 1 } }));
    expect(sent.length).toBe(3);
    bus.dispatchEvent(new CustomEvent(WARP_STATE_REQUEST, { detail: { version: 2 } }));
    bus.dispatchEvent(new CustomEvent(WARP_STATE_REQUEST, { detail: null }));
    expect(sent.length).toBe(3);

    pub.destroy();
    bus.dispatchEvent(new CustomEvent(WARP_STATE_REQUEST, { detail: { version: 1 } }));
    st = stateMsg({ hud: hud({ location: { name: "Home" } }) });
    pub.publish();
    expect(sent.length).toBe(3);
  });

  test("a chat switch publishes the empty state for the new chat", () => {
    let st: ReturnType<typeof stateMsg> | null = stateMsg();
    let chat = "c1";
    const pub = connect(() => toWarpState(st, { enabled: true, chatId: chat }));
    pub.publish();
    st = null; chat = "c2";
    pub.publish();
    expect(sent.map((s) => [s.chatId, s.people.length])).toEqual([["c1", 2], ["c2", 0]]);
  });
});
