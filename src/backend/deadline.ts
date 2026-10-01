import type { DecideOptions } from "../engine/decide.js";

/** One deadline spans transport, retries and backoff; always remove timers/listeners. */
export async function withDeadline<T>(opts: DecideOptions, fallbackMs: number, work: (signal: AbortSignal, remaining: () => number) => Promise<T>): Promise<T> {
  const deadline = Math.min(opts.deadlineAt ?? Infinity, Date.now() + (opts.timeoutMs ?? fallbackMs));
  const controller = new AbortController();
  const abort = () => controller.abort(opts.signal?.reason ?? new Error("Operation cancelled"));
  if (opts.signal?.aborted) abort(); else opts.signal?.addEventListener("abort", abort, { once: true });
  const remaining = () => Math.max(0, deadline - Date.now());
  const timer = setTimeout(() => controller.abort(new Error("Decision deadline exceeded")), remaining());
  let onAbort: () => void = () => {};
  try {
    if (remaining() <= 0) controller.abort(new Error("Decision deadline exceeded"));
    controller.signal.throwIfAborted();
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    return await Promise.race([work(controller.signal, remaining), cancelled]);
  } finally {
    clearTimeout(timer); opts.signal?.removeEventListener("abort", abort); controller.signal.removeEventListener("abort", onAbort);
  }
}
export async function backoff(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
