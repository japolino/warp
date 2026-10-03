import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { connectCue, cueChoices, renderCueCard } from "./cue-bridge.js";
import { choice, hud, stateMsg, text } from "./fixtures.js";

type Sent = { type: string; detail: any };
const last = (list: Sent[], type: string): Sent => [...list].reverse().find((e) => e.type === type)!;

const msg = () => stateMsg({
  choices: [
    choice({ id: "live:0", label: "Shove past him", odds: 0.6, checkLabel: "Body", difficulty: "fair" }),
    choice({ id: "live:1", label: "Ask Mira what happened" }),
  ],
});

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
      choice({ id: "a", label: "A", group: "G", desc: "d", odds: 0.5, checkLabel: "Wits" }),
      choice({ id: "b", label: "Pick the lock", locked: "Needs a lockpick" }),
    ], false);
    expect(out).toEqual([{ id: "a", label: "A", group: "G", detail: "d\nCheck: Wits", odds: null }]);
  });

  test("the status card is self-contained markup with the scene and who is here", () => {
    const html = renderCueCard(hud());
    expect(html).toContain("<style>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("var(--");
    const t = text(html);
    expect(t).toContain("23:40");
    expect(t).toContain("📍 The Rusty Anchor");
    expect(t).toContain("Mira — Open");
    expect(t).not.toContain("Jo");
  });

  test("publishes choices, acts on picks and answers panel requests", () => {
    const acted: string[] = [];
    const cue = connectCue({ act: (id) => acted.push(id), chatId: () => "c1" });
    const state = msg();
    cue.update({ state, enabled: true, showOdds: true, busy: false, busyLabel: "" });
    const game = last(sent, "vn-game-state-v1");
    expect(game.detail.provider).toBe("warp");
    expect(game.detail.choices.map((c: any) => [c.id, c.odds])).toEqual([["live:0", 0.6], ["live:1", null]]);

    const pick = game.detail.choices[0].id;
    bus.dispatchEvent(new CustomEvent("vn-game-pick-v1", { detail: { version: 1, provider: "warp", chatId: "c1", id: pick } }));
    bus.dispatchEvent(new CustomEvent("vn-game-pick-v1", { detail: { version: 1, provider: "warp", chatId: "c1", id: "not-a-choice" } }));
    bus.dispatchEvent(new CustomEvent("vn-game-pick-v1", { detail: { version: 1, provider: "other", chatId: "c1", id: pick } }));
    expect(acted).toEqual([pick]);

    const req = { version: 1, chatId: "c1", messageId: "m2", swipeId: 0, sourceFingerprint: "f" };
    bus.dispatchEvent(new CustomEvent("vn-panel-request-v1", { detail: req }));
    const card = last(sent, "vn-panel-export-v1");
    expect(card.detail).toMatchObject({ ...req, provider: "warp", cardId: "status", status: "ready" });

    // While the next choices are written, Cue hears the label; the choices stay pickable.
    cue.update({ state, enabled: true, showOdds: true, busy: true, busyLabel: "Writing choices…" });
    expect(last(sent, "vn-game-state-v1").detail).toMatchObject({ busy: true, busyLabel: "Writing choices…" });

    // Turning Warp off removes the card and the choices.
    cue.update({ state, enabled: false, showOdds: true, busy: false, busyLabel: "" });
    expect(last(sent, "vn-panel-export-v1").detail.status).toBe("removed");
    expect(last(sent, "vn-game-state-v1").detail.choices).toEqual([]);
    cue.destroy();
  });
});
