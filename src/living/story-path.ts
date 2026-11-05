import { revision } from "../shared/revision.js";
import { storyContent } from "./story-text.js";
import type { Message } from "./world.js";

export const ROOT = "warp-living-v1";
export const nextPath = (path: string, m: Message) => revision([path, m.id, m.swipe_id ?? 0, storyContent(m.content)]);
export function rawPathOf(messages: Message[]): string { return messages.reduce((path, m) => revision([path, m.id, m.swipe_id ?? 0, m.content]), ROOT); }
export function rawPathsOf(messages: Message[]): Map<string, string> {
  let path = ROOT;
  return new Map(messages.map(m => { path = revision([path, m.id, m.swipe_id ?? 0, m.content]); return [m.id, path]; }));
}
export function pathOf(messages: Message[]): string { return messages.reduce(nextPath, ROOT); }
export function pathsOf(messages: Message[]): Map<string, string> {
  let path = ROOT;
  return new Map(messages.map(m => { path = nextPath(path, m); return [m.id, path]; }));
}
