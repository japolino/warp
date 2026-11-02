import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { connectLiving } from "./ui.js";
import { setup } from "../frontend.js";

let window: Window, ui: ReturnType<typeof connectLiving>, sent: any[], active: string;
const globals = ["window", "document", "HTMLElement", "HTMLTextAreaElement", "CSS", "CustomEvent"] as const;
let previous: PropertyDescriptor[];
const view = (patch: any = {}) => ({ type: "living", chatId: "test", signature: "first", revision: 1, enabled: true, busy: false, retry: false, anchor: "reply",
  world: { place: "Jo's café", present: ["Jo", "Dex"], facts: [] }, notes: [], ...patch });
beforeEach(() => {
  window = new Window(); sent = []; active = "test";
  previous = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key)!);
  globals.forEach(key => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: (window as any)[key] }));
  window.document.body.innerHTML = '<article id="row"><div data-message-id="reply">The scene continues.</div></article>';
  const ctx = {
    getActiveChat: () => ({ chatId: active }), sendToBackend: (value: unknown) => sent.push(value),
    dom: {
      addStyle: () => () => {}, findMessageElement: () => window.document.getElementById("row"),
      inject: (target: Element, html: string, position: InsertPosition) => { const wrapper = window.document.createElement("div"); wrapper.setAttribute("data-spindle-ext", "warp"); wrapper.innerHTML = html; target.insertAdjacentElement(position, wrapper as unknown as Element); return wrapper; },
      uninject: (element: Element) => element.remove(),
    },
  } as unknown as SpindleFrontendContext;
  ui = connectLiving(ctx);
});
afterEach(() => {
  ui.destroy(); window.happyDOM.cancelAsync();
  globals.forEach((key, i) => { if (previous[i]) Object.defineProperty(globalThis, key, previous[i]); else delete (globalThis as any)[key]; });
});
const click = (selector: string) => (window.document.querySelector(selector) as unknown as HTMLButtonElement).click();

test("optional inspection reads saved player mechanics without calls, actions, or NPC spoilers", () => {
  const source = { message: "card", quote: '<img src=x onerror="boom"> Grounding costs 2 Focus.' };
  const ability = { id: "grounding", version: 1, owner: "you", name: "Grounding", description: "A breathing exercise", approach: "concentration", target: "self", costs: [{ kind: "resource", id: "focus", amount: 2 }], effects: [{ kind: "restore", target: "self", resource: "Composure", amount: 3, basis: "source" }], requires: [], unsupported: [], source, sourceKind: "persona", fingerprint: "saved" };
  const mechanics = { version: 1, resources: [{ id: "focus", owner: "you", name: "Focus", current: 8, max: 10, source }], items: [], conditions: [], applied: [], abilities: [ability, { ...ability, id: "secret", owner: "Guard", name: "Secret identity" }] };
  const before = structuredClone(mechanics);
  ui.accept(view({ world: { place: "Cafe", present: ["Guard"], facts: [], mechanics } }));
  expect(window.document.querySelector(".warp-inspector")).toBeNull();
  click('[data-living="inspect"]');
  const panel = window.document.querySelector(".warp-inspector")!;
  expect(panel.textContent).toContain("8 / 10");
  expect(panel.textContent).toContain("2 Focus");
  expect(panel.textContent).not.toContain("Secret identity");
  expect(panel.querySelector("img")).toBeNull();
  expect(sent).toEqual([]);
  expect(mechanics).toEqual(before);
  const details = panel.querySelector("details")!; details.open = true;
  click('[data-living="settings"]');
  expect(window.document.querySelector("[data-inspect-ability]")?.hasAttribute("open")).toBe(true);
  click('[data-living="inspect"]');
  expect(window.document.querySelector(".warp-inspector")).toBeNull();
});

test("dice receipts stay compact and keep the same dice DOM on repaint", () => {
  ui.accept(view({ decision: { tier: "uncertain", result: "mixed", roll: 52, intent: 'Vault <the wall>', stakes: "A lost opportunity", reasons: ["The wall is slippery"] } }));
  const check = window.document.querySelector(".warp-check")!;
  expect(check.closest("[data-memory]")).toBeNull();
  expect(check.querySelector(".warp-check-die")?.getAttribute("aria-label")).toContain("52");
  expect(check.querySelectorAll("svg")).toHaveLength(2);
  expect(check.textContent).toContain("Success with a cost");
  expect(check.textContent).not.toContain("The wall is slippery");
  expect(check.querySelector("details")).toBeNull();
  expect(check.querySelector("the")).toBeNull();
  click('[data-living="settings"]');
  expect(window.document.querySelector(".warp-check")).toBe(check);
  expect(window.document.querySelector("[data-memory]")?.hasAttribute("open")).toBe(false);
  ui.accept(view({ revision: 2 }));
  expect(window.document.querySelector(".warp-check")).toBeNull();
  expect(window.document.querySelector(".warp-check-none")?.textContent).toContain("No recorded Warp roll");
});

test("old checks show their outcome without inventing a die value", () => {
  ui.accept(view({ decision: { tier: "outmatched", result: "setback", intent: "Escape", stakes: "Exposure", reasons: ["Guards surround you"] } }));
  expect(window.document.querySelector(".warp-check-die")?.getAttribute("aria-label")).toContain("not saved");
  expect(window.document.querySelector(".warp-check-die")?.textContent).toContain("?");
});

test("a chat opens with a small inline scene and no action menu or stat panel", () => {
  ui.accept(view());
  expect(window.document.querySelector(".warp-scene-place")?.textContent).toBe("Jo's café");
  expect(window.document.querySelector(".warp-scene-people")?.textContent).toContain("Dex");
  expect(window.document.querySelector("[data-idea]")).toBeNull();
  expect(window.document.querySelector("textarea")).toBeNull();
  expect(window.document.querySelector("details")?.open).toBe(false);
  expect(window.document.querySelector("[data-message-id]")?.nextElementSibling?.querySelector(".warp-scene")).not.toBeNull();
});

test("suggestions are requested, editable, and sent as the player's own message", () => {
  ui.accept(view()); click('[data-living="ideas"]');
  expect(sent.at(-1).action).toBe("ideas");
  ui.accept({ type: "living_ideas", chatId: "test", signature: "first", ideas: ["I offer Jo a hand."] });
  click('[data-idea="0"]');
  const input = window.document.querySelector("textarea")!;
  input.value = "I offer Jo a hand, then ask about Dex.";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  click('[data-living="submit"]');
  expect(sent.at(-1)).toEqual({ type: "living_action", chatId: "test", action: "say", text: "I offer Jo a hand, then ask about Dex." });
});

test("stale suggestions and other chats cannot replace the current scene", () => {
  ui.accept(view({ revision: 5 }));
  ui.accept(view({ revision: 4, world: { place: "Wrong", present: [], facts: [] } }));
  ui.accept({ type: "living_ideas", chatId: "test", signature: "obsolete", ideas: ["Wrong branch"] });
  ui.accept(view({ chatId: "elsewhere", revision: 9 }));
  expect(window.document.querySelector(".warp-scene-place")?.textContent).toBe("Jo's café");
  expect(window.document.querySelector("[data-idea]")).toBeNull();
});

test("generated facts are escaped and pause has an inline way back", () => {
  ui.accept(view({ notes: ['<img src=x onerror="alert(1)">'] }));
  expect(window.document.querySelector(".warp-scene img")).toBeNull();
  click('[data-living="pause"]'); expect(sent.at(-1).action).toBe("pause");
  ui.accept(view({ revision: 2, enabled: false }));
  expect(window.document.querySelector(".warp-scene")?.textContent).toContain("Warp paused");
  click('[data-living="resume"]'); expect(sent.at(-1).action).toBe("resume");
});

test("the scene is restored if the host replaces the message DOM", async () => {
  ui.accept(view()); window.document.querySelector(".warp-scene")!.remove();
  await new Promise(r => setTimeout(r, 650));
  expect(window.document.querySelector(".warp-scene-place")?.textContent).toBe("Jo's café");
});

test("old memory stays searchable without rendering an unbounded list", () => {
  const facts = Array.from({ length: 200 }, (_, i) => ({ id: `f${i}`, subject: "you", text: i ? `A remembered event ${i}` : "The silver ring", quote: i ? `Quote ${i}` : "You found a silver ring.", kind: "fact", status: "open" }));
  ui.accept(view({ world: { place: "Here", present: [], facts } }));
  expect(window.document.querySelectorAll(".warp-scene-fact")).toHaveLength(80);
  const search = window.document.querySelector("[data-memory-query]")! as any;
  search.value = "silver ring"; search.dispatchEvent(new window.Event("input", { bubbles: true }));
  expect(window.document.querySelectorAll(".warp-scene-fact")).toHaveLength(1);
  expect(window.document.querySelector(".warp-scene-fact")?.textContent).toContain("silver ring");
});

test("default production startup does not create a drawer or floating widget", () => {
  ui.destroy();
  let receive!: (raw: unknown) => void;
  const ctx = {
    getActiveChat: () => ({ chatId: active }), sendToBackend: (value: unknown) => sent.push(value),
    onBackendMessage: (fn: (raw: unknown) => void) => { receive = fn; return () => {}; },
    ui: { registerDrawerTab: () => { throw new Error("Default startup must not use panels"); }, createFloatWidget: () => { throw new Error("Default startup must not use widgets"); } },
    dom: {
      addStyle: () => () => {}, findMessageElement: () => window.document.getElementById("row"),
      inject: (target: Element, html: string, position: InsertPosition) => { const wrapper = window.document.createElement("div"); wrapper.innerHTML = html; target.insertAdjacentElement(position, wrapper as unknown as Element); return wrapper; },
      uninject: (element: Element) => element.remove(),
    },
  } as unknown as SpindleFrontendContext;
  const cleanup = setup(ctx);
  try {
    expect(sent.at(-1)).toEqual({ type: "hello", chatId: "test" });
    receive({ type: "settings", settings: { authoredRules: false }, connections: [] });
    receive(view());
    expect(window.document.querySelector(".warp-scene-place")?.textContent).toBe("Jo's café");
    receive({ type: "command", command: "open" });
    expect(window.document.querySelector("[data-helper-connection]")).not.toBeNull();
  } finally { cleanup(); }
});
