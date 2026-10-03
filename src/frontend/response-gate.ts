import type { BackendToFrontend } from "../shared/protocol.js";
/** Async responses may outlive navigation or another refresh of the same chat. */
export function acceptsResponse(message: BackendToFrontend, activeChat: string | null, current?: { chatId: string | null; revision?: number } | null): boolean {
  if (message.type === "state") return message.chatId === activeChat && (current?.chatId !== message.chatId || (message.revision ?? 0) >= (current.revision ?? 0));
  if (message.type === "busy") return message.chatId === activeChat;
  if (message.type === "builder") return message.chatId === undefined || message.chatId === activeChat;
  return true;
}

/** A click on a choice is not repeated until the backend answers (or this long passes). */
export const ACT_GUARD_MS = 4000;

/**
 * May a choice be sent now? Never refused because the backend is busy (writing the next choices, or the
 * reply): the backend waits for its own commit. Only a second click right after the first, in the same chat,
 * waits for the backend's answer.
 */
export function mayAct(pending: { chatId: string; at: number } | null, chatId: string, now: number): boolean {
  return !pending || pending.chatId !== chatId || now - pending.at >= ACT_GUARD_MS;
}
