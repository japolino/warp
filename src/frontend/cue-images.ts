import { CUE_IMAGE_REQUEST, CUE_IMAGE_RESULT, CUE_IMAGE_CANCEL, CUE_IMAGE_FIT, IMAGE_FITS, parseImageResult,
  type ImageFit, type CueImageRequest, type CueImageResult } from "../shared/cue-images.js";

export function connectCueImages(target: EventTarget, receive: (r: CueImageResult) => void,
  timings = { acknowledgement: 2000, completion: 305_000 }, fitChanged?: (chatId: string, fit: ImageFit) => void) {
  let pending: CueImageRequest | null = null;
  let lastId: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dead = false;
  let accepted = false;
  const emit = (name: string, detail: unknown) => target.dispatchEvent(new CustomEvent(name, { detail }));
  function finish(r: CueImageResult) {
    clearTimeout(timer); timer = undefined; pending = null;
    receive(r);
  }
  function fail(error: string) {
    if (!pending) return;
    const r = pending;
    emit(CUE_IMAGE_CANCEL, r);
    finish({ version: 1, provider: "warp", chatId: r.chatId, requestId: r.requestId, status: "error", error });
  }
  const onResult = (event: Event) => {
    const r = parseImageResult((event as CustomEvent).detail);
    if (dead || !r || !pending || r.chatId !== pending.chatId || r.requestId !== pending.requestId) return;
    if (r.status === "accepted") {
      // Repeated acknowledgements must not extend the provider deadline.
      if (accepted) return;
      clearTimeout(timer);
      accepted = true;
      timer = setTimeout(() => fail("Cue did not finish the picture. You can retry it."), timings.completion);
    } else finish(r);
  };
  target.addEventListener(CUE_IMAGE_RESULT, onResult);
  const onFit = (event: Event) => {
    const d = (event as CustomEvent).detail;
    if (!dead && d?.version === 1 && typeof d.chatId === "string" && IMAGE_FITS.includes(d.fit)) fitChanged?.(d.chatId, d.fit);
  };
  target.addEventListener(CUE_IMAGE_FIT, onFit);
  return {
    update(request: CueImageRequest | null, chatId: string | null) {
      if (dead) return;
      const next = request?.chatId === chatId ? request : null;
      if (pending && (!next || pending.requestId !== next.requestId)) fail("The date image request was cancelled.");
      if (!next) { lastId = null; return; }
      if (next.requestId === lastId) return;
      lastId = next.requestId; pending = next; accepted = false;
      timer = setTimeout(() => fail("Cue is unavailable or needs an update. Enable Cue, then retry the picture."), timings.acknowledgement);
      emit(CUE_IMAGE_REQUEST, next);
    },
    destroy() {
      if (dead) return;
      fail("The date image request was cancelled.");
      dead = true;
      target.removeEventListener(CUE_IMAGE_RESULT, onResult);
      target.removeEventListener(CUE_IMAGE_FIT, onFit);
      clearTimeout(timer);
    },
  };
}
