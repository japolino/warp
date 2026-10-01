import { universal } from "./universal.js";
import { hometown } from "./hometown.js";
import { starfarer } from "./starfarer.js";
import { questbound } from "./questbound.js";

export interface Template {
  id: string;
  name: string;
  blurb: string;
  /** Each part becomes one lorebook entry titled "warp-ruleset · <label>". */
  parts: { label: string; yaml: string }[];
}

export const TEMPLATES: Template[] = [universal, hometown, starfarer, questbound];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export interface CardLike {
  name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  tags?: string[];
}

/**
 * Is this a scenario / narrator / world card rather than one character? Those
 * shouldn't be tracked as a person ("The Academy" isn't an NPC). A guess —
 * the UI lets the player override it.
 */
export function looksLikeScenario(c: CardLike): boolean {
  const tags = (c.tags ?? []).map((t) => t.toLowerCase());
  if (tags.some((t) => /scenario|\brpg\b|narrator|simulator|multiple characters|multi-?char|multi-?character|\bgroup\b|text adventure|\bworld\b|setting|dungeon|sandbox/.test(t))) return true;
  const text = `${c.description ?? ""}\n${c.personality ?? ""}\n${c.scenario ?? ""}`.toLowerCase();
  const narratorPhrases = [
    /\b(?:the )?narrator\b/, /\bgame ?master\b/, /\bdungeon master\b/, /\bstoryteller\b/,
    /\{\{char\}\} (?:is|will be) (?:not a (?:single |specific )?character|the (?:narrator|world|setting|game))/,
    /\{\{char\}\} (?:will )?(?:play|voice|control)s? (?:all |every |each )?(?:of )?(?:the )?(?:other )?(?:characters|npcs|side characters|cast)/,
    /\bmultiple characters\b/, /\bvarious characters\b/, /\ball (?:the )?npcs\b/,
  ];
  if (narratorPhrases.some((re) => re.test(text))) return true;
  const settingName = /\b(simulator|scenario|rpg|academy|world|kingdom|empire|city|town|village|school|university|dungeon|adventure|quest|game|isekai|apocalypse|station)\b/i;
  return settingName.test(c.name) && !(c.personality ?? "").trim();
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
