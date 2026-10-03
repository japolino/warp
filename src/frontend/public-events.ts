// Warp's public state for other extensions (LumiDoll and others), as a window event:
//
//   warp-state-v1          Warp → any   the scene for the open chat, whenever it changes and when asked
//   warp-state-request-v1  any → Warp   detail { version: 1 }: send it again now
//
// Listeners must work without Warp (no event ever arrives). When Warp is off or the chat has no rules,
// an empty state is sent so they can clear.

import type { BackendToFrontend } from "../shared/protocol.js";
import { RULESET_FORMAT } from "../engine/format-version.js";
import { revision } from "../shared/revision.js";

type StateMsg = Extract<BackendToFrontend, { type: "state" }>;

export const WARP_STATE = "warp-state-v1";
export const WARP_STATE_REQUEST = "warp-state-request-v1";

export interface WarpPersonV1 { id: string; name: string; present: boolean; appearance?: string; outfit?: string; bands?: Record<string, string> }

export interface WarpStateV1 {
  version: 1;
  provider: "warp";
  /** The ruleset format this Warp reads (Warp Studio checks it). Always sent. */
  rulesetFormat?: number;
  chatId: string | null;
  /** The latest message the state belongs to. */
  messageId: string | null;
  time?: { label: string; day: number; hour: number; minute: number };
  /** Where the player is, in words. */
  place?: string | null;
  you: { name: string; appearance?: string; outfit?: string; items?: string[] };
  people: WarpPersonV1[];
  meters?: Array<{ id: string; label: string; band: string }>;
}

/** Only text that says something (optional fields are left out rather than sent empty). */
const some = (v: string | null | undefined): string | undefined => (v && v.trim() ? v : undefined);

/** The public snapshot of a `state` message. `chatId` is used when there is no state yet (chat just opened). */
export function toWarpState(state: StateMsg | null, opts: { enabled: boolean; chatId?: string | null }): WarpStateV1 {
  const name = state?.player ?? "";
  const h = opts.enabled ? state?.hud ?? null : null;
  if (!state || !h) {
    return { version: 1, provider: "warp", rulesetFormat: RULESET_FORMAT, chatId: state?.chatId ?? opts.chatId ?? null, messageId: null, you: { name }, people: [] };
  }
  const out: WarpStateV1 = { version: 1, provider: "warp", rulesetFormat: RULESET_FORMAT, chatId: state.chatId, messageId: state.latestMessageId, you: { name }, people: [] };
  if (h.clock) {
    const m = Math.max(0, Math.round(h.clock.minutes));
    out.time = { label: h.clock.label, day: Math.floor(m / 1440) + 1, hour: Math.floor((m % 1440) / 60), minute: m % 60 };
  }
  out.place = h.location?.name ?? null;
  const appearance = some(h.you.appearance), outfit = some(h.you.outfit);
  out.you = { name, ...(appearance ? { appearance } : {}), ...(outfit ? { outfit } : {}), items: h.items.map((i) => i.name) };
  out.people = h.people.map((p) => {
    const a = some(p.appearance), o = some(p.outfit);
    const bands: Record<string, string> = {};
    for (const s of p.stats) bands[s.label] = s.text ?? s.display;
    return { id: p.id, name: p.name, present: p.present, ...(a ? { appearance: a } : {}), ...(o ? { outfit: o } : {}), bands };
  });
  out.meters = h.bars.map((b) => ({ id: b.id, label: b.label, band: b.text ?? b.display }));
  return out;
}

export interface PublicEvents {
  /** Send the state if it changed since the last send (or always, with `force`). */
  publish(force?: boolean): void;
  destroy(): void;
}

/** Publish `warp-state-v1` on change and answer `warp-state-request-v1`. */
export function connectPublicEvents(opts: { getState(): WarpStateV1; target?: EventTarget }): PublicEvents {
  const target = opts.target ?? window;
  let last: string | null = null;
  let dead = false;
  const publish = (force = false) => {
    if (dead) return;
    const snap = opts.getState();
    const rev = revision(snap);
    if (!force && rev === last) return;
    last = rev;
    try { target.dispatchEvent(new CustomEvent(WARP_STATE, { detail: snap })); } catch { /* no listeners can break Warp */ }
  };
  const onRequest = (e: Event) => {
    const d = (e as CustomEvent).detail as { version?: number } | null;
    if (d?.version === 1) publish(true);
  };
  target.addEventListener(WARP_STATE_REQUEST, onRequest);
  return {
    publish,
    destroy() {
      dead = true;
      target.removeEventListener(WARP_STATE_REQUEST, onRequest);
    },
  };
}
