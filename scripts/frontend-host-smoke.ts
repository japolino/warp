// Test the production frontend against the checkout's real DOM helper in an
// isolated DOM. This is a host-contract test, not a browser-rendering claim.
import { mock } from "bun:test";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const checkout = resolve(process.argv[2] ?? "D:/Lumiverse");
const requireTest = createRequire(resolve(import.meta.dir, "../package.json"));
const { JSDOM } = requireTest("jsdom");
const window = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost/" }).window;
for (const key of ["window", "document", "Element", "HTMLElement", "HTMLStyleElement", "HTMLTextAreaElement", "MutationObserver", "Node", "navigator", "localStorage", "CSS", "CustomEvent"])
  Object.defineProperty(globalThis, key, { configurable: true, value: (window as any)[key] });
Object.defineProperty(globalThis, "CSSScopeRule", { configurable: true, value: undefined });
// This fixture uses the literal message id reply; jsdom has no CSS.escape API.
if (!(globalThis as any).CSS) Object.defineProperty(globalThis, "CSS", { configurable: true, value: { escape: (s: string) => s } });
mock.module("@/store", () => ({ useStore: { getState: () => ({ messages: [] }), subscribe: () => () => {} } }));
const load = (path: string) => import(pathToFileURL(join(checkout, path)).href);
const { createDOMHelper } = await load("frontend/src/lib/spindle/dom-helper.ts");
const { registerExtensionIdentity } = await load("frontend/src/lib/spindle/extension-root-stamp.ts");
const id = "00000000-0000-0000-0000-000000000001";
registerExtensionIdentity(id, "warp");
const dom = createDOMHelper(id, "warp");
window.document.body.innerHTML = '<article data-message-id="reply"><p>The scene continues.</p></article>';
let receive!: (raw: unknown) => void;
const sent: any[] = [];
const { setup } = await import(pathToFileURL(resolve(import.meta.dir, "../dist/frontend.js")).href);
const cleanup = setup({
  dom, getActiveChat: () => ({ chatId: "fixture" }), sendToBackend: (payload: unknown) => sent.push(payload),
  onBackendMessage: (fn: typeof receive) => { receive = fn; return () => {}; },
  ui: new Proxy({}, { get() { throw new Error("Default frontend attempted to create a panel"); } }),
});
try {
  receive({ type: "settings", settings: { authoredRules: false, enabled: true }, connections: [] });
  receive({ type: "living", chatId: "fixture", signature: "path", revision: 1, enabled: true, busy: false, retry: false, anchor: "reply", world: { place: "The café", present: ["Jo"], facts: [] }, notes: [] });
  const strip = window.document.querySelector(".warp-scene");
  if (!strip || !strip.closest('[data-spindle-ext-id="warp"]')) throw new Error("Scene was not injected into a host-owned extension root");
  if (!window.document.head.querySelector("style")?.textContent?.includes("warp-scene")) throw new Error("Scoped styles missing");
  (strip.querySelector('[data-living="ideas"]') as any).click();
  if (sent.at(-1)?.action !== "ideas") throw new Error("Injected event handler did not dispatch Ideas");
  receive({ type: "living_ideas", chatId: "fixture", signature: "path", ideas: ["I offer Jo a hand."] });
  (strip.querySelector('[data-idea="0"]') as any).click();
  if (!strip.querySelector("textarea")) throw new Error("Editable suggestion missing");
  console.log("PASS: production frontend uses Lumiverse's real scoped DOM helper, injects owned roots, dispatches Ideas, and opens an editable suggestion without a panel.");
} finally { cleanup(); dom.cleanup(); window.close(); }
process.exit(0);
