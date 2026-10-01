import type { BackendToFrontend } from "../shared/protocol.js";
/** Async responses may outlive navigation or another refresh of the same chat. */
export function acceptsResponse(message: BackendToFrontend, activeChat: string | null, current?: { chatId: string | null; revision?: number } | null): boolean {
  if (message.type === "state") return message.chatId === activeChat && (current?.chatId !== message.chatId || (message.revision ?? 0) >= (current.revision ?? 0));
  if (message.type === "busy") return message.chatId === activeChat;
  if (message.type === "builder") return message.chatId === undefined || message.chatId === activeChat;
  return true;
}
