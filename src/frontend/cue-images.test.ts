import { expect, test } from "bun:test";
import { connectCueImages } from "./cue-images.js";
import { CUE_IMAGE_REQUEST, CUE_IMAGE_RESULT, CUE_IMAGE_CANCEL, type CueImageRequest } from "../shared/cue-images.js";
const request: CueImageRequest = { version: 1, provider: "warp", chatId: "c", requestId: "r", characterName: "Mira", venue: "Cafe", timeOfDay: "evening", mood: "happy" };
const emit = (bus: EventTarget, detail: unknown) => bus.dispatchEvent(new CustomEvent(CUE_IMAGE_RESULT, { detail }));
const pause = () => new Promise((resolve) => setTimeout(resolve, 25));

test("requests emit once, acceptance waits, and only the matching result is delivered once", async () => {
  const bus = new EventTarget(), results: any[] = [], requests: any[] = [];
  bus.addEventListener(CUE_IMAGE_REQUEST, (e) => requests.push((e as CustomEvent).detail));
  const bridge = connectCueImages(bus, (r) => results.push(r), { acknowledgement: 10, completion: 1000 });
  bridge.update(request, "c"); bridge.update(request, "c");
  expect(requests).toEqual([request]);
  emit(bus, { ...request, status: "accepted" });
  await pause(); expect(results).toEqual([]);
  emit(bus, { ...request, requestId: "old", status: "ready", imageUrl: "/api/v1/images/a", fit: "contain" });
  emit(bus, { ...request, chatId: "other", status: "error", error: "Wrong chat" });
  expect(results).toEqual([]);
  const ready = { ...request, status: "ready", imageUrl: "/api/v1/images/a", fit: "contain" };
  emit(bus, ready); emit(bus, ready); bridge.update(request, "c");
  expect(results).toEqual([ready]); expect(requests).toHaveLength(1);
  bridge.destroy();
});

test("a missing Cue reports an actionable error instead of invoking an image provider", async () => {
  const bus = new EventTarget(), results: any[] = [];
  const bridge = connectCueImages(bus, (r) => results.push(r), { acknowledgement: 5, completion: 1000 });
  bridge.update(request, "c"); await pause();
  expect(results[0].status).toBe("error"); expect(results[0].error).toContain("Cue is unavailable");
  bridge.destroy();
});

test("chat changes cancel the old request and ignore late images, including a return to the chat", () => {
  const bus = new EventTarget(), cancels: any[] = [], results: any[] = [];
  bus.addEventListener(CUE_IMAGE_CANCEL, (e) => cancels.push((e as CustomEvent).detail));
  const bridge = connectCueImages(bus, (r) => results.push(r));
  bridge.update(request, "c"); bridge.update(request, "other");
  emit(bus, { ...request, status: "ready", imageUrl: "/api/v1/images/a", fit: "cover" });
  expect(cancels).toHaveLength(1); expect(results).toHaveLength(1); expect(results[0].status).toBe("error");
  bridge.destroy();
});

test("completion has a fixed deadline despite repeated acknowledgements", async () => {
  const bus = new EventTarget(), results: any[] = [];
  const bridge = connectCueImages(bus, (r) => results.push(r), { acknowledgement: 1000, completion: 5 });
  bridge.update(request, "c"); emit(bus, { ...request, status: "accepted" });
  await pause(); emit(bus, { ...request, status: "accepted" });
  expect(results).toHaveLength(1); expect(results[0].error).toContain("did not finish");
  bridge.destroy();
});
