import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { connectCue, cueChoices, renderCueCard } from "./cue-bridge.js";
import { loadRuleset } from "../engine/loader.js";
import { TEMPLATES } from "../engine/templates/index.js";
import { initialState } from "../engine/state.js";
import { buildChoices, buildHud } from "../engine/view.js";
import type { BackendToFrontend } from "../shared/protocol.js";

type StateMsg = Extract<BackendToFrontend, { type: "state" }>;

const t = TEMPLATES.find((x) => x.id === "universal")!;
const r = loadRuleset(t.parts.map((p, i) => ({ label: p.label, content: p.yaml, order: i }))).ruleset!;
const s = initialState(r);
const msg = (): StateMsg => ({
  type: "state", chatId: "c1", status: { state: "ok", name: r.name, source: null, issues: [], characterName: null, cardKind: "character", tags: [] },
  hud: buildHud(r, s), choices: buildChoices(r, s, { lines: [], veils: [] }), records: [],
  latestMessageId: "m2", choicesAnchor: "m2", busy: false, player: "Sam",
});

type Sent = { type: string; detail: any };
const last = (list: Sent[], type: string): Sent => [...list].reverse().find((e) => e.type === type)!;

describe("Cue bridge", () => {
  let bus: EventTarget;
  let sent: Sent[];
  const prev = (globalThis as any).window;
  beforeEach(() => {
    bus = new EventTarget();
    sent = [];
    const dispatch = bus.dispatchEvent.bind(bus);
    bus.dispatchEvent = (e: Event) => { sent.push({ type: e.type, detail: (e as CustomEvent).detail }); return dispatch(e); };
    (globalThis as any).window = bus;
  });
  afterEach(() => { (globalThis as any).window = prev; });

  test("choices keep ids and odds; locked moves stay in Warp", () => {
    const out = cueChoices([
      { id: "a", label: "A", group: "G", desc: "d", odds: 0.5, partialOdds: null, checkLabel: "Wits", veiled: false, params: [], difficulty: null },
      { id: "b", label: "Pick the lock", group: null, desc: null, odds: null, partialOdds: null, checkLabel: null, veiled: false, params: [], locked: "Needs a lockpick", difficulty: null },
    ], false);
    expect(out).toEqual([{ id: "a", label: "A", group: "G", detail: "d\nCheck: Wits", odds: null }]);
  });

  test("the status card is self-contained markup", () => {
    const html = renderCueCard(buildHud(r, s));
    expect(html).toContain("<style>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("var(--");
  });

  test("publishes choices, acts on picks and answers panel requests", () => {
    const acted: string[] = [];
    const cue = connectCue({ act: (id) => acted.push(id), chatId: () => "c1" });
    const state = msg();
    cue.update({ state, enabled: true, showOdds: true, busy: false, busyLabel: "" });
    const game = last(sent, "vn-game-state-v1");
    expect(game.detail.provider).toBe("warp");
    expect(game.detail.choices.length).toBeGreaterThan(0);

    const pick = game.detail.choices[0].id;
    bus.dispatchEvent(new CustomEvent("vn-game-pick-v1", { detail: { version: 1, provider: "warp", chatId: "c1", id: pick } }));
    bus.dispatchEvent(new CustomEvent("vn-game-pick-v1", { detail: { version: 1, provider: "warp", chatId: "c1", id: "not-a-choice" } }));
    bus.dispatchEvent(new CustomEvent("vn-game-pick-v1", { detail: { version: 1, provider: "other", chatId: "c1", id: pick } }));
    expect(acted).toEqual([pick]);

    const req = { version: 1, chatId: "c1", messageId: "m2", swipeId: 0, sourceFingerprint: "f" };
    bus.dispatchEvent(new CustomEvent("vn-panel-request-v1", { detail: req }));
    const card = last(sent, "vn-panel-export-v1");
    expect(card.detail).toMatchObject({ ...req, provider: "warp", cardId: "status", status: "ready" });

    // Turning Warp off removes the card and the choices.
    cue.update({ state, enabled: false, showOdds: true, busy: false, busyLabel: "" });
    expect(last(sent, "vn-panel-export-v1").detail.status).toBe("removed");
    expect(last(sent, "vn-game-state-v1").detail.choices).toEqual([]);
    cue.destroy();
  });
});
