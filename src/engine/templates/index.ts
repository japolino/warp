import { universal } from "./universal.js";
import { hometown } from "./hometown.js";
import { starfarer } from "./starfarer.js";

export interface Template {
  id: string;
  name: string;
  blurb: string;
  /** Each part becomes one lorebook entry titled "warp-ruleset · <label>". */
  parts: { label: string; yaml: string }[];
}

export const TEMPLATES: Template[] = [universal, hometown, starfarer];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
