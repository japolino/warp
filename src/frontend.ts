import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { connectLiving } from "./living/ui.js";
import { connectPublicEvents, type WarpStateV1 } from "./frontend/public-events.js";

const CLEANUP = "__warpCleanup";

/** Default startup uses only the chat surface. Legacy panels are explicitly lazy. */
export function setup(ctx: SpindleFrontendContext) {
  const previous = (globalThis as any)[CLEANUP];
  if (typeof previous === "function") previous();
  let dead = false, authored = false, legacy: (() => void) | null = null, loading = false;
  const living = connectLiving(ctx);
  const active = () => ctx.getActiveChat().chatId ?? null;
  const empty = (): WarpStateV1 => ({ version: 1, provider: "warp", chatId: active(), messageId: null, you: { name: "You" }, people: [] });
  let publicEvents = connectPublicEvents({ getState: () => living.publicState() ?? empty() });
  const unlisten = ctx.onBackendMessage(raw => {
    if (!raw || typeof raw !== "object" || dead) return;
    const m = raw as { type: string; chatId?: string; settings?: { authoredRules?: boolean }; command?: string };
    if (typeof m.type !== "string") return;
    if (m.type === "settings") {
      authored = m.settings?.authoredRules === true;
      if (!authored && legacy) { legacy(); legacy = null; publicEvents = connectPublicEvents({ getState: () => living.publicState() ?? empty() }); }
    }
    if (m.type.startsWith("living") && m.chatId !== active()) return;
    if (!authored) {
      living.accept(raw);
      if (m.type === "command" && m.command === "open") living.openSettings();
      return;
    }
    if (!legacy && !loading && m.type === "state" && m.chatId === active()) {
      loading = true;
      void import("./frontend/legacy.js").then(module => {
        loading = false;
        if (dead || !authored) return;
        publicEvents.destroy();
        legacy = module.setupLegacy(ctx);
      });
    }
  });
  ctx.sendToBackend({ type: "hello", chatId: active() });
  let last = active();
  const timer = setInterval(() => {
    if (active() !== last) { last = active(); publicEvents.publish(true); ctx.sendToBackend({ type: "refresh", chatId: last }); }
  }, 750);
  const cleanup = () => { if (dead) return; dead = true; clearInterval(timer); unlisten(); publicEvents.destroy(); living.destroy(); legacy?.(); };
  (globalThis as any)[CLEANUP] = cleanup;
  return cleanup;
}
