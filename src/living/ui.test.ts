import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { connectLiving } from "./ui.js";

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
