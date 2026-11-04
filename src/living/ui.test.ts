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
      listMessageElements: () => [...window.document.querySelectorAll("article[data-test-message]")].map(element => ({ messageId: element.getAttribute("data-test-message")!, element })),
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

test("past checks remain under their reply, keep their DOM on updates, and follow mounted rows and active swipes", () => {
  const oldRow = window.document.createElement("article"); oldRow.dataset.testMessage = "old";
  oldRow.innerHTML = '<div data-message-id="old">An earlier attempt.</div>'; window.document.body.prepend(oldRow);
  const decision = { tier: "uncertain", result: "mixed", roll: 47, intent: "Cross the guarded doorway", stakes: "Exposure", reasons: [] };
  const checks = [{ messageId: "old", decision, responses: [] }];
  ui.accept(view({ checks }));
  expect(oldRow.querySelectorAll(".warp-check")).toHaveLength(1);
  expect(oldRow.querySelectorAll("button")).toHaveLength(0);
  expect(window.document.querySelectorAll(".warp-scene")).toHaveLength(1);
  const die = oldRow.querySelector(".warp-check-die");
  ui.accept(view({ checks, revision: 2, busy: true })); expect(oldRow.querySelector(".warp-check-die")).toBe(die);
  oldRow.remove(); ui.accept(view({ checks, revision: 3 }));
  expect(window.document.querySelectorAll(".warp-roll-history")).toHaveLength(0);
  oldRow.innerHTML = '<div data-message-id="old">Remounted reply.</div>'; window.document.body.prepend(oldRow);
  ui.accept(view({ checks, revision: 4 })); expect(oldRow.querySelector(".warp-check-die")?.getAttribute("aria-label")).toBe("Rolled 47 on a d100");
  ui.accept(view({ checks: [{ ...checks[0], decision: { ...decision, roll: 18, result: "clean" } }], revision: 5 }));
  expect(oldRow.querySelector(".warp-check-die")?.getAttribute("aria-label")).toBe("Rolled 18 on a d100");
  ui.accept(view({ checks: [], revision: 6 })); expect(oldRow.querySelector(".warp-roll-history")).toBeNull();
  ui.accept(view({ checks, revision: 7, enabled: false })); expect(oldRow.querySelector(".warp-roll-history")).toBeNull();
  expect(sent).toEqual([]);
});

test("a latest check becomes a historical check without replaying its visibility animation", () => {
  const instances: any[] = [];
  (window as any).IntersectionObserver = class { cb: any; constructor(cb: any) { this.cb = cb; instances.push(this); } observe(target: Element) { this.target = target; } target?: Element; disconnect() {} };
  (window as any).matchMedia = () => ({ matches: false });
  const decision = { tier: "uncertain", result: "setback", roll: 82, intent: "History animation test", stakes: "Exposure", reasons: [] };
  ui.accept(view({ decision }));
  const observer = instances.at(-1); observer.cb([{ target: observer.target, isIntersecting: true, intersectionRatio: 1 }]);
  expect(window.document.querySelector(".warp-dice-rolling")).not.toBeNull();
  const old = window.document.querySelector("#row")! as any; old.dataset.testMessage = "reply";
  old.id = "old-row"; const next = window.document.createElement("article"); next.id = "row"; next.innerHTML = '<div data-message-id="next">A quiet next reply.</div>'; window.document.body.append(next);
  const before = instances.length;
  ui.accept(view({ anchor: "next", checks: [{ messageId: "reply", decision, responses: [] }], revision: 2 }));
  expect(old.querySelector(".warp-check-die")?.getAttribute("aria-label")).toBe("Rolled 82 on a d100");
  expect(next.querySelectorAll(".warp-check")).toHaveLength(0);
  expect(instances.length).toBe(before); expect(old.querySelector(".warp-dice-rolling")).toBeNull();
});

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
  expect(window.document.querySelector(".warp-check-none")).toBeNull();
  expect(window.document.body.textContent).not.toContain("No recorded Warp roll");
});

test("inspection explains saved shield capacity and cooldown without advancing either", () => {
  const source = { message: "persona", quote: "Pulse costs 2 Battery and requires 1 action to recharge." };
  const mechanics = { version: 1, resources: [], items: [], conditions: [{ id: "ward", name: "Ward", owner: "you", hinders: [], helps: [], blocks: [], ending: "Until depleted", defenses: [{ kind: "shield", damageType: "all", amount: 6 }], source }], applied: [],
    clocks: [{ id: "you", actor: "you", actions: 1 }], cooldowns: [{ id: "pulse", actor: "you", readyAt: 3 }],
    abilities: [{ id: "pulse", version: 1, name: "Pulse", owner: "you", description: "A pulse", approach: "precision", target: "other", range: "near", cooldown: 1, costs: [], effects: [{ kind: "damage", target: "target", resource: "Health", amount: 20, damageType: "physical" }], requires: [], unsupported: [], source, sourceKind: "persona", fingerprint: "saved" }] };
  const before = structuredClone(mechanics);
  ui.accept(view({ world: { place: "Corridor", present: ["Jo"], facts: [], mechanics } }));
  click('[data-living="inspect"]');
  const panel = window.document.querySelector(".warp-inspector")!;
  expect(panel.textContent).toContain("6 shield remaining against all damage");
  expect(panel.textContent).toContain("Ready after 1 more action");
  expect(panel.textContent).toContain("Range: near");
  expect(mechanics).toEqual(before);
  expect(sent).toEqual([]);
});

test("tracking people or NPC-only mechanics never adds an empty player inspector to a quiet scene", () => {
  const source = { message: "scene", quote: "Jo waits in the café." };
  const mechanics = { version: 1, resources: [{ id: "npc-focus", owner: "Jo", name: "Focus", current: 2, source }], items: [], conditions: [], applied: [],
    entities: [{ id: "jo", name: "Jo", displayName: "Jo", aliases: [], entityKind: "person", present: true, status: "active", source }] };
  ui.accept(view({ world: { place: "Cafe", present: ["Jo"], facts: [], mechanics } }));
  expect(window.document.querySelector('[data-living="inspect"]')).toBeNull();
  expect(window.document.querySelector(".warp-inspector")).toBeNull();
});

test("qualitative harm, treatment limits and resilience are readable without exposing hidden injury loads or NPC traits", () => {
  const source = { message: "persona", quote: "A tough body and first aid for minor injuries." };
  const mechanics = { version: 1, resources: [], items: [], conditions: [], applied: [], resilience: [
    { id: "you", owner: "you", band: "tough", version: 1, basis: "warp", source },
    { id: "jo", owner: "Jo", band: "exceptional", version: 1, basis: "warp", source: { ...source, quote: "Secret regeneration" } },
  ], abilities: [{ id: "aid", version: 1, name: "First aid", owner: "you", description: "Treat a cut", approach: "precision", target: "either", costs: [], effects: [{ kind: "mend", target: "target", impact: "minor", maxInjury: "minor" }, { kind: "harm", target: "target", impact: "minor", damageType: "physical" }], requires: [], unsupported: [], source, sourceKind: "persona", fingerprint: "saved" }] };
  ui.accept(view({ world: { place: "Clinic", present: ["Jo"], facts: [], mechanics } }));
  click('[data-living="inspect"]');
  const panel = window.document.querySelector(".warp-inspector")!;
  expect(panel.textContent).toContain("Physical resilience: tough");
  expect(panel.textContent).toContain("treats at most minor injuries");
  expect(panel.textContent).toContain("minor physical harm");
  expect(panel.textContent).toContain("Warp interpretation");
  expect(panel.textContent).not.toContain("undefined"); expect(panel.textContent).not.toContain("Secret regeneration");
  expect(sent).toEqual([]);
});

test("agreement inspection distinguishes progress, offered and received rewards without collecting or exposing unrelated NPC promises", () => {
  const source = { message: "offer", quote: "Cover the counter and clean the cups for 10 Coins." };
  const agreement = { id: "cafe", owner: "you", from: "Jo", name: "Help at the café", source, offer: source, requirements: [{ id: "counter", text: "cover the counter", source, done: source }, { id: "cups", text: "clean the cups", source }], rewards: [{ id: "pay", kind: "resource", asset: "Coins", amount: 10, source, ready: { allowed: true, source } }], unsupported: [] };
  const mechanics = { version: 1, resources: [], items: [], conditions: [], applied: [], agreements: [agreement, { ...agreement, id: "npc", owner: "Dex", from: "Mira", name: "Private deal" }] };
  const before = structuredClone(mechanics);
  ui.accept(view({ world: { place: "Café", present: ["Jo"], facts: [], mechanics } }));
  click('[data-living="inspect"]');
  const panel = window.document.querySelector(".warp-inspector")!;
  expect(panel.textContent).toContain("1/2 done"); expect(panel.textContent).toContain("Pending · clean the cups");
  expect(panel.textContent).toContain("Offered · 10 Coins"); expect(panel.textContent).not.toContain("Private deal");
  panel.querySelector("details")!.open = true;
  click('[data-living="settings"]');
  expect(window.document.querySelector("[data-inspect-agreement]")?.hasAttribute("open")).toBe(true);
  expect(mechanics).toEqual(before); expect(sent).toEqual([]);
});

test("old checks show their outcome without inventing a die value", () => {
  ui.accept(view({ decision: { tier: "outmatched", result: "setback", intent: "Escape", stakes: "Exposure", reasons: ["Guards surround you"] } }));
  expect(window.document.querySelector(".warp-check-die")?.getAttribute("aria-label")).toContain("not saved");
  expect(window.document.querySelector(".warp-check-die")?.textContent).toContain("?");
});

test("NPC rolls are attributed, compact, escaped and preserved individually through repaint", () => {
  const responses = [{ actor: "Jo", decision: { tier: "uncertain", result: "setback", roll: 87, intent: "Jab · you" } }];
  ui.accept(view({ decision: { tier: "uncertain", result: "mixed", roll: 32, intent: "Push through", stakes: "An opening", reasons: [] }, responses }));
  const checks = [...window.document.querySelectorAll(".warp-check")];
  expect(checks).toHaveLength(2); expect(checks[1].classList.contains("warp-check-response")).toBe(true);
  expect(checks[1].textContent).toContain("Jo falters");
  expect(checks[1].querySelector('[role="img"]')?.getAttribute("aria-label")).toContain("87");
  click('[data-living="settings"]');
  expect([...window.document.querySelectorAll(".warp-check")]).toEqual(checks);
  ui.accept(view({ revision: 2, responses: [{ ...responses[0], actor: '<img src=x onerror="boom">' }] }));
  expect(window.document.querySelector(".warp-check-none")).toBeNull();
  expect(window.document.querySelector(".warp-check img")).toBeNull();
  expect(window.document.querySelectorAll(".warp-check")).toHaveLength(1);
});

test("each actor's dice start when that row first becomes visible and retain their own saved value", () => {
  const observed = new Map<HTMLElement, (entries: any[]) => void>(), frames = new Map<number, FrameRequestCallback>(); let serial = 0;
  (window as any).matchMedia = () => ({ matches: false });
  (window as any).IntersectionObserver = class { constructor(private cb: (entries: any[]) => void) {} observe(el: HTMLElement) { observed.set(el, this.cb); } disconnect() {} };
  (window as any).requestAnimationFrame = (fn: FrameRequestCallback) => { frames.set(++serial, fn); return serial; };
  (window as any).cancelAnimationFrame = (id: number) => frames.delete(id);
  ui.accept(view({ decision: { tier: "uncertain", result: "mixed", roll: 43, intent: "Advance", stakes: "Noise", reasons: [] }, responses: [{ actor: "Dex", decision: { tier: "uncertain", result: "setback", roll: 96, intent: "Strike · you" } }] }));
  const checks = [...window.document.querySelectorAll(".warp-check")] as unknown as HTMLElement[];
  expect(observed.size).toBe(2);
  observed.get(checks[0])!([{ target: checks[0], isIntersecting: true, intersectionRatio: 1 }]);
  expect(checks[0].classList.contains("warp-dice-rolling")).toBe(true);
  expect(checks[1].classList.contains("warp-dice-rolling")).toBe(false);
  observed.get(checks[1])!([{ target: checks[1], isIntersecting: true, intersectionRatio: 1 }]);
  expect(frames.size).toBe(2);
  const advance = (now: number) => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(now)); };
  advance(0); click('[data-living="settings"]'); expect(frames.size).toBe(2); advance(1300);
  expect([...checks[0].querySelectorAll("[data-die-final]")].map(e => e.textContent)).toEqual(["40", "3"]);
  expect([...checks[1].querySelectorAll("[data-die-final]")].map(e => e.textContent)).toEqual(["90", "6"]);
  expect(frames.size).toBe(0);
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
