import type { Ruleset } from "./ruleset.js";
import type { GameState } from "./state.js";

export const loreTitle = (title: string) => title.replace(/^\s*\[[^\]]*\]\s*/, "").trim().toLowerCase();
/** Shared entries must satisfy every gate that owns them. */
export function loreAccess(r: Ruleset, s: GameState, title: string): { gated: boolean; open: boolean } {
  const key = loreTitle(title), gates: boolean[] = [];
  for (const c of Object.values(r.codex)) if (c.lore.some((l) => loreTitle(l) === key)) gates.push(!!s.codex[c.id]);
  for (const secret of Object.values(r.secrets)) secret.stages.forEach((stage, i) => {
    if (stage.lore.some((l) => loreTitle(l) === key)) gates.push((s.secrets[secret.id] ?? -1) >= i);
  });
  return { gated: gates.length > 0, open: gates.every(Boolean) };
}
