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

/**
 * Add the card's character to a template's `relationships.people` (keeping the
 * author's comments), so relationships track them from turn one.
 */
export function withCharacter(yaml: string, name: string): string {
  if (!/^relationships:/m.test(yaml)) return yaml;
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "companion";
  if (new RegExp(`^    ${id}:`, "m").test(yaml)) return yaml;
  const entry = `    ${id}:\n      name: ${JSON.stringify(name)}\n`;
  const m = /^  people:[^\n]*\n/m.exec(yaml);
  if (m) return yaml.slice(0, m.index + m[0].length) + entry + yaml.slice(m.index + m[0].length);
  return `${yaml.replace(/\n*$/, "\n")}  people:\n${entry}`;
}
