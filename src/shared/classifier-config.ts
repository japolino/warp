import type { Settings } from "./protocol.js";

export const OPENROUTER_JEV: Pick<Settings, "decider" | "jevFormat" | "jevModel" | "jevUrl"> = {
  decider: "jev", jevFormat: "typesafe", jevModel: "typesafe/jev-1.13", jevUrl: "https://openrouter.ai/api/alpha/decisions",
};

export function classifierIssue(format: Settings["jevFormat"], model: string, url: string): string | null {
  const path = (() => { try { return new URL(url).pathname.replace(/\/+$/, ""); } catch { return ""; } })();
  const jev = /^(?:~?typesafe\/)?jev(?:[-./]|$)/i.test(model.trim());
  if (format === "openai" && (jev || /\/(?:alpha\/decisions|systemone)(?:\/chat\/completions)?$/.test(path))) return `Jev and decisions endpoints require Typed questions (TypeSafe API). For Jev on OpenRouter, use ${OPENROUTER_JEV.jevUrl} with model ${OPENROUTER_JEV.jevModel}, or choose the Jev on OpenRouter preset.`;
  if (format === "typesafe" && /\/chat\/completions$/.test(path)) return `This URL is a chat endpoint. For Jev on OpenRouter, use ${OPENROUTER_JEV.jevUrl} with Typed questions (TypeSafe API). For a text model, select OpenAI-compatible chat.`;
  return null;
}
