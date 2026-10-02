// Run-local level-up boons (opt-in with `boons: true` on a dungeon). Each new party
// level offers three seeded choices; the pick lasts until the run ends. Boons live
// on the run, so leaving or defeat drops them with it.

import { seededRng } from "../dice.js";
import { CLASSES, SKILLS } from "./content.js";
import type { BoonOffer, ClassId, DungeonRun, Stats } from "./types.js";

export interface BoonDef {
  id: string;
  name: string;
  desc: string;
  /** Most times one run can take it. */
  max: number;
  weight: number;
  /** Party-wide stat multipliers per stack. */
  stats?: Partial<Record<keyof Stats, number>>;
}

export const BOONS: Record<string, BoonDef> = Object.fromEntries(([
  { id: "might", name: "Might", desc: "+15% attack for the party", max: 3, weight: 1, stats: { atk: 0.15 } },
  { id: "bulwark", name: "Bulwark", desc: "+15% defense and magic defense for the party", max: 3, weight: 1, stats: { def: 0.15, mdf: 0.15 } },
  { id: "arcana", name: "Arcana", desc: "+15% magic for the party", max: 3, weight: 1, stats: { mat: 0.15 } },
  { id: "vigor", name: "Vigor", desc: "+15% max HP and MP for the party", max: 3, weight: 1, stats: { hp: 0.15, mp: 0.15 } },
  { id: "swift", name: "Swiftness", desc: "+15% agility for the party", max: 2, weight: 0.8, stats: { agi: 0.15 } },
  { id: "keen", name: "Keen Edge", desc: "+10% critical chance on physical hits", max: 3, weight: 0.8 },
  { id: "supplies", name: "Field Supplies", desc: "+2 potions now", max: 99, weight: 1 },
  { id: "focus", name: "Focus", desc: "+2 ethers now", max: 99, weight: 0.7 },
  { id: "second_wind", name: "Second Wind", desc: "Heal 20% more HP and MP on each new floor", max: 1, weight: 0.8 },
] as BoonDef[]).map((b) => [b.id, b]));

/** Skills the player can learn: other classes' skills they don't have yet. */
export function learnable(cls: ClassId, taken: string[]): string[] {
  const own = new Set(CLASSES[cls].skills);
  const all = [...new Set(Object.values(CLASSES).flatMap((c) => c.skills))];
  return all.filter((id) => !own.has(id) && SKILLS[id] && !taken.includes(`learn:${id}`));
}

export function boonInfo(id: string): { name: string; desc: string } | null {
  if (id.startsWith("learn:")) {
    const sk = SKILLS[id.slice(6)];
    return sk ? { name: `Learn ${sk.name}`, desc: `{{user}} learns ${sk.name} for this run` } : null;
  }
  const b = BOONS[id];
  return b ? { name: b.name, desc: b.desc } : null;
}

export const boonCount = (run: Pick<DungeonRun, "boons">, id: string) => (run.boons ?? []).filter((b) => b === id).length;

/** Multiplier on a party stat from the run's boons. */
export function boonScale(run: Pick<DungeonRun, "boons">, k: keyof Stats): number {
  let m = 1;
  for (const id of run.boons ?? []) m += BOONS[id]?.stats?.[k] ?? 0;
  return m;
}

/** Skills the player has learned this run. */
export const learnedSkills = (run: Pick<DungeonRun, "boons">) => (run.boons ?? []).filter((b) => b.startsWith("learn:")).map((b) => b.slice(6)).filter((id) => SKILLS[id]);

/** Three distinct boons for a level, the same every time for the same run, level and picks so far. */
export function rollBoonOffer(run: Pick<DungeonRun, "seed" | "boons">, level: number, playerClass: ClassId): BoonOffer {
  const taken = run.boons ?? [];
  const rng = seededRng(`${run.seed}:boon:${level}:${taken.join(",")}`);
  const pool: { id: string; w: number }[] = Object.values(BOONS)
    .filter((b) => boonCount(run, b.id) < b.max)
    .map((b) => ({ id: b.id, w: b.weight }));
  const learn = learnable(playerClass, taken);
  for (const id of learn) pool.push({ id: `learn:${id}`, w: 1.5 / learn.length });
  const options: string[] = [];
  while (options.length < 3 && pool.length) {
    const total = pool.reduce((n, p) => n + p.w, 0);
    let x = rng() * total, i = 0;
    for (; i < pool.length - 1; i++) { x -= pool[i].w; if (x <= 0) break; }
    const [pick] = pool.splice(i, 1);
    options.push(pick.id);
    // At most one skill to learn per offer.
    if (pick.id.startsWith("learn:")) for (let j = pool.length - 1; j >= 0; j--) if (pool[j].id.startsWith("learn:")) pool.splice(j, 1);
  }
  return { level, options };
}
