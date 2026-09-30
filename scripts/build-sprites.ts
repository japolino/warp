// Packs the chosen Dungeon Crawl Stone Soup tiles (CC0) into src/frontend/sprites.gen.ts
// as data URLs, so the extension ships with its art and needs no network.
//
//   bun scripts/build-sprites.ts "<path to 'Dungeon Crawl Stone Soup Full'>"
//
// Source: https://opengameart.org/content/dungeon-crawl-32x32-tiles (CC0). See CREDITS.md.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SPRITES: Record<string, string> = {
  // ── monsters: tier 1 (floors 1–3)
  rat: "monster/animals/rat.png",
  bat: "monster/animals/giant_bat.png",
  jackal: "monster/animals/jackal_new.png",
  kobold: "monster/kobold_new.png",
  goblin: "monster/goblin_new.png",
  ooze: "monster/amorphous/ooze_new.png",
  spider: "monster/animals/spider.png",
  frog: "monster/animals/giant_frog.png",
  // tier 2 (4–6)
  hobgoblin: "monster/hobgoblin_new.png",
  gnoll: "monster/gnoll_new.png",
  orc: "monster/orc_new.png",
  orc_warrior: "monster/orc_warrior_new.png",
  orc_priest: "monster/orc_priest_new.png",
  wolf: "monster/animals/wolf.png",
  ghoul: "monster/undead/ghoul.png",
  scorpion: "monster/animals/giant_scorpion.png",
  wolf_spider: "monster/animals/wolf_spider_new.png",
  big_kobold: "monster/big_kobold_new.png",
  // tier 3 (7–9)
  ogre: "monster/ogre_new.png",
  orc_knight: "monster/orc_knight_new.png",
  orc_wizard: "monster/orc_wizard_new.png",
  mummy: "monster/undead/mummy.png",
  wraith: "monster/undead/wraith.png",
  troll: "monster/deep_troll.png",
  harpy: "monster/harpy.png",
  naga: "monster/naga.png",
  basilisk: "monster/animals/basilisk.png",
  bear: "monster/animals/black_bear_new.png",
  clay_golem: "monster/nonliving/clay_golem.png",
  // tier 4 (10+)
  minotaur: "monster/minotaur.png",
  cyclops: "monster/cyclops_new.png",
  hill_giant: "monster/hill_giant_new.png",
  death_knight: "monster/death_knight.png",
  lich: "monster/undead/lich.png",
  iron_golem: "monster/nonliving/iron_golem.png",
  greater_naga: "monster/greater_naga.png",
  executioner: "monster/demons/executioner.png",
  fire_giant: "monster/fire_giant_new.png",
  elf_knight: "monster/deep_elf_knight_new.png",
  // bosses
  orc_warlord: "monster/orc_warlord.png",
  hydra: "monster/dragons/hydra_5_new.png",
  bone_dragon: "monster/undead/bone_dragon_new.png",
  golden_dragon: "monster/dragons/golden_dragon.png",
  ancient_lich: "monster/undead/ancient_lich_new.png",
  dragon: "monster/dragons/dragon.png",
  mimic: "dungeon/chest.png",

  // ── party figures, by class
  pc_adventurer_1: "monster/human_new.png",
  pc_adventurer_2: "monster/elf_new.png",
  pc_adventurer_3: "monster/unique/erica_new.png",
  pc_adventurer_4: "monster/unique/edmund_new.png",
  pc_fighter_1: "monster/deep_elf_knight_new.png",
  pc_fighter_2: "monster/dwarf_new.png",
  pc_fighter_3: "monster/deep_elf_blademaster.png",
  pc_fighter_4: "monster/merfolk_fighter.png",
  pc_mage_1: "monster/wizard.png",
  pc_mage_2: "monster/deep_elf_mage.png",
  pc_mage_3: "monster/deep_elf_sorcerer.png",
  pc_mage_4: "monster/necromancer_new.png",
  pc_healer_1: "monster/deep_elf_priest.png",
  pc_healer_2: "monster/deep_elf_high_priest.png",
  pc_healer_3: "monster/enchantress_human.png",
  pc_rogue_1: "monster/halfling_new.png",
  pc_rogue_2: "monster/deep_elf_master_archer.png",
  pc_rogue_3: "monster/gnome.png",

  // ── tiles
  unseen: "dungeon/unseen.png",
  stairs: "dungeon/gateways/stone_stairs_down.png",
  exit: "dungeon/gateways/stone_stairs_up.png",
  chest: "dungeon/chest_2_closed.png",
  chest_open: "dungeon/chest_2_open.png",
  gold: "item/gold/gold_pile_10.png",
  trap: "dungeon/traps/trap_arrow.png",
  fountain: "dungeon/sparkling_fountain.png",
  shop: "dungeon/shops/shop_general.png",
  altar: "dungeon/altars/unknown.png",
  romance: "monster/animals/butterfly_1_new.png",
  surprise: "misc/unseen_item_new.png",
  blood: "misc/blood/blood_puddle_red.png",
  skull: "monster/undead/flying_skull.png",
  potion: "item/potion/ruby_new.png",
  ether: "item/potion/brilliant_blue_new.png",
  bomb: "item/misc/misc_orb.png",
  ration: "item/food/bread_ration_new.png",
  key: "item/misc/key.png",

  // ── themes: floor + wall
  floor_cave: "dungeon/floor/grey_dirt_0_new.png",
  wall_cave: "dungeon/wall/cobalt_rock_1.png",
  floor_crypt: "dungeon/floor/crypt_10.png",
  wall_crypt: "dungeon/wall/catacombs_0.png",
  floor_ruins: "dungeon/floor/floor_sand_stone_0.png",
  wall_ruins: "dungeon/wall/brick_gray_0.png",
  floor_hell: "dungeon/floor/infernal_1.png",
  wall_hell: "dungeon/wall/hell_1.png",
  floor_lair: "dungeon/floor/lair0b.png",
  wall_lair: "dungeon/wall/brick_dark_0.png",
};

const root = process.argv[2];
if (!root || !existsSync(root)) {
  console.error("Usage: bun scripts/build-sprites.ts \"<path to 'Dungeon Crawl Stone Soup Full'>\"");
  process.exit(1);
}
const missing: string[] = [];
const lines: string[] = [];
let bytes = 0;
for (const [key, rel] of Object.entries(SPRITES)) {
  const file = join(root, rel);
  if (!existsSync(file)) { missing.push(`${key}: ${rel}`); continue; }
  const data = readFileSync(file);
  bytes += data.length;
  lines.push(`  ${key}: "data:image/png;base64,${data.toString("base64")}",`);
}
if (missing.length) {
  console.error(`Missing:\n${missing.join("\n")}`);
  process.exit(1);
}
const out = `// Generated by scripts/build-sprites.ts — do not edit.
// Dungeon Crawl Stone Soup tiles, CC0 (public domain). See CREDITS.md.
/* eslint-disable */
export const SPRITES: Record<string, string> = {
${lines.join("\n")}
};
`;
writeFileSync(join(import.meta.dir, "..", "src", "frontend", "sprites.gen.ts"), out);
console.log(`${lines.length} sprites, ${(bytes / 1024).toFixed(0)} KB of PNG`);
