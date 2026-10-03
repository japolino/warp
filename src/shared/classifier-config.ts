import type { Settings } from "./protocol.js";

/** Jev through OpenRouter's decisions endpoint (an OpenRouter key goes in the Jev key field). */
export const OPENROUTER_JEV: Pick<Settings, "decider" | "jevModel" | "jevUrl"> = {
  decider: "jev", jevModel: "typesafe/jev-1.13", jevUrl: "https://openrouter.ai/api/alpha/decisions",
};

/**
 * Why a classifier setting cannot work, or null. Jev speaks TypeSafe's typed-question API only, so a pasted
 * chat endpoint is refused before anything is sent. `_format` is ignored (the old OpenAI-chat format is cut);
 * it stays in the signature until the settings UI stops passing it.
 */
export function classifierIssue(_format: string | undefined, _model: string, url: string): string | null {
  const path = (() => { try { return new URL(url).pathname.replace(/\/+$/, ""); } catch { return ""; } })();
  if (/\/chat\/completions$/.test(path)) return `This URL is a chat endpoint. Jev needs a typed-question endpoint: TypeSafe's (the default), or for Jev on OpenRouter ${OPENROUTER_JEV.jevUrl} with model ${OPENROUTER_JEV.jevModel}. To use a chat model, pick Helper and set the helper connection.`;
  return null;
}
