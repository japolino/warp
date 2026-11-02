import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { createDiceReveal, percentileDice } from "./dice-reveal.js";

let w: Window, previous: unknown, reduced = false;
let notify: (entries: any[]) => void, disconnects: number, frames: Map<number, FrameRequestCallback>, serial: number;
beforeEach(() => {
  previous = (globalThis as any).window; w = new Window(); (globalThis as any).window = w;
  reduced = false; disconnects = 0; serial = 0; frames = new Map();
  (w as any).matchMedia = () => ({ matches: reduced });
  (w as any).IntersectionObserver = class {
    constructor(callback: typeof notify) { notify = callback; }
    observe() {} disconnect() { disconnects++; }
  };
  (w as any).requestAnimationFrame = (fn: FrameRequestCallback) => { frames.set(++serial, fn); return serial; };
  (w as any).cancelAnimationFrame = (id: number) => frames.delete(id);
});
afterEach(() => { w.happyDOM.cancelAsync(); (globalThis as any).window = previous; });
function target(roll = 52): HTMLElement {
  const el = w.document.createElement("section"); el.innerHTML = percentileDice(roll); return el as unknown as HTMLElement;
}
function advance(now: number) { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(now)); }

test("first visibility starts one animation, lands on the saved value, and cannot replay", () => {
  const reveal = createDiceReveal(), el = target();
  reveal.observe(el, "visibility-test");
  notify([{ target: el, isIntersecting: false, intersectionRatio: 0 }]);
  expect(frames.size).toBe(0);
  notify([{ target: el, isIntersecting: true, intersectionRatio: 0.3 }]);
  expect(frames.size).toBe(0);
  notify([{ target: el, isIntersecting: true, intersectionRatio: 0.8 }]);
  expect(el.classList.contains("warp-dice-rolling")).toBe(true);
  advance(0); advance(140);
  reveal.observe(el, "visibility-test"); // ordinary state repaint preserves progress
  expect(frames.size).toBe(1);
  advance(1300);
  expect(el.classList.contains("warp-dice-rolling")).toBe(false);
  expect([...el.querySelectorAll("[data-die-final]")].map(e => e.textContent)).toEqual(["50", "2"]);
  reveal.observe(target(), "visibility-test");
  expect(frames.size).toBe(0);
  expect(disconnects).toBeGreaterThan(0);
  reveal.destroy();
});

test("cleanup cancels frames and reduced motion skips rolling", () => {
  const reveal = createDiceReveal(), el = target(100);
  reveal.observe(el, "cancel-test"); notify([{ target: el, isIntersecting: true, intersectionRatio: 1 }]);
  advance(0); reveal.destroy();
  expect(frames.size).toBe(0);
  expect([...el.querySelectorAll("[data-die-final]")].map(e => e.textContent)).toEqual(["00", "0"]);
  reduced = true; reveal.observe(target(), "reduced-test");
  expect(frames.size).toBe(0);
  reveal.destroy();
});

test("old checks have no made-up roll or animation", () => {
  const reveal = createDiceReveal(), el = target(NaN);
  reveal.observe(el, "unknown-test");
  expect(frames.size).toBe(0);
  expect(el.textContent).toContain("?");
  reveal.destroy();
});
