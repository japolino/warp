import { busyChats } from "./state-push.js";
const owners = new Map<string, symbol>();
export function takeOperation(chatId: string): symbol | null {
  if (busyChats.has(chatId)) return null;
  const token = Symbol(chatId);
  owners.set(chatId, token); busyChats.add(chatId);
  return token;
}
export const operationCurrent = (chatId: string, token: symbol) => owners.get(chatId) === token;
export const hasOperation = (chatId: string) => owners.has(chatId);
export function releaseOperation(chatId: string, token: symbol): boolean {
  if (!operationCurrent(chatId, token)) return false;
  owners.delete(chatId); busyChats.delete(chatId); return true;
}
/** A host generation supersedes any local operation still awaiting a model. */
export function supersedeOperation(chatId: string) { owners.delete(chatId); }
