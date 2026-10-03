// One quiet call on the helper connection, and reading JSON out of a model's reply.

import type { GenerationResponseDTO } from "lumiverse-spindle-types";
import type { Settings } from "../shared/protocol.js";
import { host } from "./host.js";

/** The first balanced JSON object in a model's reply (code fences and chatter around it are ignored). */
export function firstJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

/**
 * One quiet call on the helper connection (or the chat's own). Length comes from the instructions, not a
 * token cap: with no `maxTokens` the connection's own limit applies, so a helper that thinks before it
 * writes isn't cut off.
 */
export async function ask(
  system: string, user: string, settings: Settings, userId: string | undefined, timeoutMs: number,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const res = (await host().generate.quiet({
    type: "quiet",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    connection_id: settings.helperConnectionId || undefined,
    reasoning: { source: "off" },
    parameters: { temperature: opts.temperature ?? 0.1, ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}) },
    userId,
    signal: AbortSignal.timeout(Math.max(3000, timeoutMs)),
  })) as GenerationResponseDTO | string;
  return typeof res === "string" ? res : res?.content ?? "";
}
