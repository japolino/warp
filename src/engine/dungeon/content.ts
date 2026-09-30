// Built-in dungeon content: a bestiary, skills, party classes, events and romance
// scenes. A bare `dungeons:` entry plays with all of this; authors add or override.

import { emptyEffect } from "../ruleset.js";
import type { ClassId, DgChoice, DgEventDef, DgOutcome, MonsterDef, SkillDef, Stats } from "./types.js";

const m = (id: string, name: string, tier: number, s: Stats, skills: string[], xp: number, gold: number, sprite = id): MonsterDef =>
  ({ id, name, sprite, tier, ...s, skills, xp, gold });

/** Stats are for the monster's own depth band; they grow with depth. */
export const BESTIARY: Record<string, MonsterDef> = Object.fromEntries([
  // tier 1 — floors 1–3
  m("rat", "Giant Rat", 1, { hp: 26, mp: 0, atk: 8, def: 3, mat: 2, mdf: 2, agi: 12 }, ["bite"], 6, 3),
  m("bat", "Cave Bat", 1, { hp: 22, mp: 0, atk: 7, def: 2, mat: 2, mdf: 3, agi: 16 }, ["bite"], 6, 2),
  m("jackal", "Jackal", 1, { hp: 28, mp: 0, atk: 9, def: 3, mat: 2, mdf: 2, agi: 13 }, ["bite"], 7, 3),
  m("kobold", "Kobold", 1, { hp: 32, mp: 0, atk: 9, def: 5, mat: 3, mdf: 3, agi: 10 }, ["attack", "smash"], 8, 6),
  m("goblin", "Goblin", 1, { hp: 34, mp: 0, atk: 10, def: 5, mat: 4, mdf: 4, agi: 11 }, ["attack", "smash"], 9, 8),
  m("ooze", "Ooze", 1, { hp: 44, mp: 0, atk: 8, def: 7, mat: 6, mdf: 8, agi: 5 }, ["attack", "acid"], 9, 4),
  m("spider", "Cave Spider", 1, { hp: 28, mp: 0, atk: 10, def: 4, mat: 4, mdf: 3, agi: 14 }, ["bite", "venom"], 8, 3),
  m("frog", "Giant Frog", 1, { hp: 36, mp: 0, atk: 9, def: 4, mat: 2, mdf: 3, agi: 12 }, ["bite"], 7, 3),
  // tier 2 — floors 4–6
  m("hobgoblin", "Hobgoblin", 2, { hp: 55, mp: 0, atk: 13, def: 9, mat: 5, mdf: 6, agi: 10 }, ["attack", "smash"], 18, 14),
  m("gnoll", "Gnoll", 2, { hp: 51, mp: 0, atk: 14, def: 8, mat: 5, mdf: 6, agi: 12 }, ["attack", "smash"], 18, 12),
  m("orc", "Orc", 2, { hp: 58, mp: 0, atk: 13, def: 10, mat: 5, mdf: 6, agi: 9 }, ["attack", "smash"], 19, 14),
  m("orc_warrior", "Orc Warrior", 2, { hp: 65, mp: 0, atk: 15, def: 11, mat: 5, mdf: 6, agi: 9 }, ["attack", "smash"], 22, 16),
  m("orc_priest", "Orc Priest", 2, { hp: 48, mp: 0, atk: 9, def: 8, mat: 14, mdf: 11, agi: 10 }, ["attack", "curse", "mend"], 21, 16),
  m("wolf", "Wolf", 2, { hp: 49, mp: 0, atk: 14, def: 7, mat: 4, mdf: 5, agi: 16 }, ["bite"], 17, 6),
  m("ghoul", "Ghoul", 2, { hp: 62, mp: 0, atk: 13, def: 9, mat: 8, mdf: 10, agi: 8 }, ["bite", "drain"], 21, 10),
  m("scorpion", "Giant Scorpion", 2, { hp: 56, mp: 0, atk: 15, def: 12, mat: 4, mdf: 6, agi: 11 }, ["attack", "venom"], 20, 8),
  m("wolf_spider", "Wolf Spider", 2, { hp: 46, mp: 0, atk: 14, def: 8, mat: 6, mdf: 6, agi: 15 }, ["bite", "venom"], 18, 6),
  m("big_kobold", "Big Kobold", 2, { hp: 60, mp: 0, atk: 13, def: 10, mat: 4, mdf: 5, agi: 10 }, ["attack", "smash"], 18, 14),
  // tier 3 — floors 7–9
  m("ogre", "Ogre", 3, { hp: 121, mp: 0, atk: 23, def: 14, mat: 6, mdf: 8, agi: 8 }, ["attack", "smash"], 38, 26),
  m("orc_knight", "Orc Knight", 3, { hp: 104, mp: 0, atk: 21, def: 17, mat: 8, mdf: 10, agi: 10 }, ["attack", "smash"], 36, 28),
  m("orc_wizard", "Orc Wizard", 3, { hp: 77, mp: 0, atk: 12, def: 11, mat: 22, mdf: 16, agi: 11 }, ["attack", "firebolt", "curse"], 36, 30),
  m("mummy", "Mummy", 3, { hp: 109, mp: 0, atk: 19, def: 15, mat: 14, mdf: 14, agi: 7 }, ["attack", "curse"], 35, 24),
  m("wraith", "Wraith", 3, { hp: 84, mp: 0, atk: 18, def: 12, mat: 20, mdf: 18, agi: 14 }, ["attack", "drain"], 37, 22),
  m("troll", "Deep Troll", 3, { hp: 132, mp: 0, atk: 24, def: 13, mat: 6, mdf: 8, agi: 9 }, ["attack", "smash"], 40, 24),
  m("harpy", "Harpy", 3, { hp: 79, mp: 0, atk: 19, def: 11, mat: 10, mdf: 11, agi: 18 }, ["attack", "rend"], 34, 20),
  m("naga", "Naga", 3, { hp: 99, mp: 0, atk: 18, def: 13, mat: 18, mdf: 16, agi: 11 }, ["attack", "venom", "firebolt"], 37, 28),
  m("basilisk", "Basilisk", 3, { hp: 106, mp: 0, atk: 20, def: 16, mat: 16, mdf: 14, agi: 10 }, ["bite", "gaze"], 38, 22),
  m("bear", "Cave Bear", 3, { hp: 125, mp: 0, atk: 23, def: 13, mat: 4, mdf: 8, agi: 11 }, ["attack", "rend"], 36, 10),
  m("clay_golem", "Clay Golem", 3, { hp: 150, mp: 0, atk: 20, def: 20, mat: 4, mdf: 14, agi: 5 }, ["attack", "smash"], 40, 20),
  // tier 4 — floors 10+
  m("minotaur", "Minotaur", 4, { hp: 202, mp: 0, atk: 32, def: 19, mat: 8, mdf: 12, agi: 12 }, ["attack", "smash", "rend"], 66, 44),
  m("cyclops", "Cyclops", 4, { hp: 229, mp: 0, atk: 33, def: 20, mat: 8, mdf: 12, agi: 8 }, ["attack", "smash"], 68, 46),
  m("hill_giant", "Hill Giant", 4, { hp: 246, mp: 0, atk: 31, def: 18, mat: 6, mdf: 10, agi: 7 }, ["attack", "smash"], 66, 50),
  m("death_knight", "Death Knight", 4, { hp: 194, mp: 0, atk: 30, def: 24, mat: 22, mdf: 20, agi: 11 }, ["attack", "smash", "drain"], 72, 56),
  m("lich", "Lich", 4, { hp: 158, mp: 0, atk: 16, def: 16, mat: 34, mdf: 28, agi: 12 }, ["curse", "firebolt", "frost"], 74, 60),
  m("iron_golem", "Iron Golem", 4, { hp: 264, mp: 0, atk: 30, def: 30, mat: 6, mdf: 18, agi: 6 }, ["attack", "smash"], 70, 40),
  m("greater_naga", "Greater Naga", 4, { hp: 185, mp: 0, atk: 26, def: 20, mat: 28, mdf: 22, agi: 12 }, ["attack", "venom", "frost"], 70, 54),
  m("executioner", "Executioner", 4, { hp: 211, mp: 0, atk: 36, def: 18, mat: 14, mdf: 16, agi: 13 }, ["attack", "rend"], 72, 50),
  m("fire_giant", "Fire Giant", 4, { hp: 255, mp: 0, atk: 32, def: 21, mat: 26, mdf: 18, agi: 8 }, ["attack", "firebolt", "breath"], 76, 58),
  m("elf_knight", "Deep Elf Knight", 4, { hp: 176, mp: 0, atk: 29, def: 22, mat: 24, mdf: 22, agi: 15 }, ["attack", "rend", "frost"], 70, 60),
  // bosses
  m("orc_warlord", "Orc Warlord", 5, { hp: 340, mp: 0, atk: 19, def: 12, mat: 10, mdf: 10, agi: 11 }, ["attack", "smash", "rally"], 150, 120),
  m("hydra", "Five-Headed Hydra", 5, { hp: 900, mp: 0, atk: 30, def: 18, mat: 22, mdf: 16, agi: 10 }, ["bite", "rend", "breath"], 320, 240),
  m("bone_dragon", "Bone Dragon", 5, { hp: 1400, mp: 0, atk: 38, def: 24, mat: 32, mdf: 24, agi: 11 }, ["rend", "breath", "curse"], 520, 380),
  m("golden_dragon", "Golden Dragon", 5, { hp: 2100, mp: 0, atk: 46, def: 30, mat: 42, mdf: 32, agi: 13 }, ["rend", "breath", "smash"], 800, 600),
  m("ancient_lich", "Ancient Lich", 5, { hp: 2400, mp: 0, atk: 30, def: 28, mat: 56, mdf: 44, agi: 14 }, ["curse", "frost", "breath", "drain"], 1000, 800),
  // surprise
  m("mimic", "Mimic", 1, { hp: 40, mp: 0, atk: 11, def: 8, mat: 4, mdf: 6, agi: 9 }, ["bite", "smash"], 16, 30),
].map((x) => [x.id, x]));

export const DEFAULT_BOSSES = ["orc_warlord", "hydra", "bone_dragon", "golden_dragon", "ancient_lich"];

const sk = (id: string, name: string, target: SkillDef["target"], kind: SkillDef["kind"], power: number, mp = 0, tp = 0, extra: Partial<SkillDef> = {}): SkillDef =>
  ({ id, name, target, kind, power, mp, tp, ...extra });

export const SKILLS: Record<string, SkillDef> = Object.fromEntries([
  // party
  sk("attack", "Attack", "foe", "phys", 1),
  sk("guard", "Guard", "self", "guard", 0),
  sk("strike", "Power Strike", "foe", "phys", 1.9, 0, 35),
  sk("cleave", "Cleave", "foes", "phys", 1.1, 0, 60),
  sk("stab", "Backstab", "foe", "phys", 1.4, 4, 0, { crit: 0.3 }),
  sk("fire", "Fire", "foe", "magic", 1.8, 5),
  sk("blizzard", "Blizzard", "foes", "magic", 1.2, 12),
  sk("smite", "Smite", "foe", "magic", 1.3, 4),
  sk("heal", "Heal", "ally", "heal", 1, 6),
  sk("holy", "Holy Light", "allies", "heal", 0.6, 12),
  // monsters (they don't pay costs)
  sk("bite", "Bite", "foe", "phys", 1.1),
  sk("smash", "Smash", "foe", "phys", 1.6),
  sk("rend", "Rend", "foe", "phys", 1.35, 0, 0, { crit: 0.15 }),
  sk("acid", "Acid Splash", "foe", "magic", 1.2),
  sk("venom", "Venom", "foe", "magic", 1.3),
  sk("curse", "Curse", "foe", "magic", 1.4),
  sk("firebolt", "Firebolt", "foe", "magic", 1.6),
  sk("frost", "Frost Wave", "foes", "magic", 1.0),
  sk("breath", "Breath", "foes", "magic", 1.2),
  sk("gaze", "Petrifying Gaze", "foe", "magic", 1.5),
  sk("drain", "Drain", "foe", "magic", 1.1, 0, 0, { drain: 0.5 }),
  sk("mend", "Mend", "ally", "heal", 0.8),
  sk("rally", "War Cry", "allies", "heal", 0.35),
].map((x) => [x.id, x]));

/** Level-1 stats and skills for each party class. */
export const CLASSES: Record<ClassId, Stats & { skills: string[] }> = {
  adventurer: { hp: 72, mp: 22, atk: 13, def: 9, mat: 11, mdf: 9, agi: 11, skills: ["strike", "fire", "heal"] },
  fighter: { hp: 84, mp: 10, atk: 14, def: 11, mat: 5, mdf: 7, agi: 9, skills: ["strike", "cleave"] },
  mage: { hp: 52, mp: 42, atk: 7, def: 6, mat: 16, mdf: 12, agi: 10, skills: ["fire", "blizzard"] },
  healer: { hp: 60, mp: 38, atk: 8, def: 8, mat: 13, mdf: 13, agi: 9, skills: ["heal", "holy", "smite"] },
  rogue: { hp: 60, mp: 18, atk: 13, def: 8, mat: 8, mdf: 8, agi: 15, skills: ["stab", "strike"] },
};
export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];

/** Party figures per class (sprite keys). */
export const PARTY_SPRITES: Record<ClassId, string[]> = {
  adventurer: ["pc_adventurer_1", "pc_adventurer_2", "pc_adventurer_3", "pc_adventurer_4"],
  fighter: ["pc_fighter_1", "pc_fighter_2", "pc_fighter_3", "pc_fighter_4"],
  mage: ["pc_mage_1", "pc_mage_2", "pc_mage_3", "pc_mage_4"],
  healer: ["pc_healer_1", "pc_healer_2", "pc_healer_3"],
  rogue: ["pc_rogue_1", "pc_rogue_2", "pc_rogue_3"],
};

// ───────────────────────── events ─────────────────────────

const out = (o: Omit<DgOutcome, "effect"> = {}): DgOutcome => ({ ...o, effect: emptyEffect() });
const ch = (id: string, label: string, success: DgOutcome, extra: Partial<DgChoice> = {}): DgChoice => ({ id, label, success, ...extra });
const ev = (id: string, text: string, choices: DgChoice[], minDepth = 1, weight = 1): DgEventDef => ({ id, text, choices, minDepth, weight });

export const BUILTIN_EVENTS: Record<string, DgEventDef> = Object.fromEntries([
  ev("shrine", "A crumbling shrine glows faintly in an alcove.", [
    ch("pray", "Pray at the shrine", out({ heal: 40, mana: 30, text: "A gentle warmth washes over the party; wounds close." }),
      { chance: 65, fail: out({ hurt: 10, text: "The glow turns cold and bites at them." }) }),
    ch("leave", "Leave it be", out({ text: "The party leaves the shrine undisturbed." })),
  ]),
  ev("wounded_stranger", "A wounded adventurer sits slumped against the wall, clutching their side.", [
    ch("help", "Give them a potion", out({ bag: { potion: -1 }, gold: "15 + depth * 6", xp: 12, text: "The stranger thanks them and presses a pouch of coins into their hand." }), { when: "bag('potion') >= 1" }),
    ch("ask", "Ask what happened", out({ xp: 6, text: "The stranger warns them about what waits deeper down before limping away." })),
    ch("leave", "Walk past", out({ text: "They leave the stranger to fend for themselves." })),
  ]),
  ev("pool", "A still, dark pool shimmers with a faint blue light.", [
    ch("drink", "Drink from it", out({ mana: 100, heal: 15, text: "The water is cold and sweet; strength and focus return." }),
      { chance: 55, fail: out({ hurt: 14, text: "The water burns going down." }) }),
    ch("leave", "Don't risk it", out({ text: "They leave the pool alone." })),
  ]),
  ev("locked_chest", "An iron-bound chest sits in the middle of the room, its lock rusted shut.", [
    ch("force", "Force it open", out({ gold: "25 + depth * 12", bag: { potion: 1 }, text: "The lock gives; the chest is full of coin." }),
      { chance: 60, fail: out({ hurt: 12, text: "A hidden needle snaps out of the lock." }) }),
    ch("leave", "Leave it", out({ text: "They decide the chest isn't worth it." })),
  ]),
  ev("statue", "A statue of a forgotten hero stands here. Something seems to whisper from it.", [
    ch("listen", "Listen closely", out({ xp: "10 + depth * 4", text: "The whispers tell of old battles; the party learns from them." })),
    ch("leave", "Move on", out({ text: "They move on, unsettled." })),
  ]),
  ev("collapsed", "The tunnel ahead has partly collapsed; something glints under the rubble.", [
    ch("dig", "Dig through", out({ gold: "20 + depth * 10", text: "Under the rubble: a dead explorer's purse." }),
      { chance: 70, fail: out({ hurt: 10, text: "Loose rock tumbles down on them." }) }),
    ch("around", "Find a way around", out({ text: "They find another way through." })),
  ]),
  ev("ghost_merchant", "A translucent merchant beckons from behind a floating counter.", [
    ch("trade", "Buy two potions (30 gold)", out({ gold: -30, bag: { potion: 2 }, text: "The ghost hands over two potions with a hollow laugh." }), { cost: 30 }),
    ch("leave", "Decline", out({ text: "The merchant fades away." })),
  ], 2),
  ev("gambler", "A goblin with a crooked grin shakes a cup of dice. 'Twenty gold says you lose.'", [
    ch("bet", "Bet 20 gold", out({ gold: 40, text: "The dice fall their way; the goblin pays up, grumbling." }),
      { chance: 45, cost: 20, fail: out({ gold: -20, text: "The goblin cackles and pockets their coins." }) }),
    ch("leave", "Refuse", out({ text: "They ignore the goblin's jeers." })),
  ]),
  ev("ambush", "Voices ahead — a band of monsters is resting around the next corner.", [
    ch("sneak", "Sneak past", out({ xp: "8 + depth * 3", text: "They slip past unseen." }),
      { chance: 60, fail: out({ fight: "enemy", text: "A twig snaps. The monsters leap to their feet." }) }),
    ch("charge", "Charge them", out({ fight: "enemy", text: "They charge before the monsters can react." })),
  ]),
  ev("blood_altar", "A stone altar is stained dark. An inscription promises knowledge for blood.", [
    ch("offer", "Offer blood", out({ hurt: 15, xp: "20 + depth * 6", text: "Pain, then sudden clarity." })),
    ch("leave", "Step away", out({ text: "They back away from the altar." })),
  ], 3),
].map((x) => [x.id, x]));

/** A quiet moment with a companion. Narrated in chat; the story's bookkeeping follows the feelings from there. */
export const BUILTIN_ROMANCE: Record<string, DgEventDef> = Object.fromEntries([
  ev("campfire", "The party makes a small fire in a quiet side chamber. {target} sits down close beside {{user}}.", [
    ch("talk", "Talk with {target}", out({ bond: 3, heal: 10, text: "They talk quietly by the fire; {target} opens up a little." })),
    ch("close", "Pull {target} closer", out({ bond: 2, desire: 4, text: "{target} doesn't pull away." }),
      { chance: "40 + rel_bond(target) / 2", fail: out({ bond: -1, text: "{target} stiffens and shifts away, awkward." }) }),
    ch("watch", "Keep watch so {target} can rest", out({ bond: 2, text: "{target} sleeps a while, trusting {{user}} to keep watch." })),
  ]),
  ev("close_call", "A ledge crumbles under {{user}}'s feet — {target} grabs their hand and hauls them back.", [
    ch("thank", "Thank {target}", out({ bond: 3, text: "{target} brushes it off, but holds on a moment longer than needed." })),
    ch("tease", "Tease {target} about it", out({ bond: 1, desire: 3, text: "{target} laughs, flustered." }),
      { chance: "50 + rel_bond(target) / 3", fail: out({ bond: -1, text: "{target} isn't in the mood for jokes." }) }),
  ]),
  ev("wounds", "{target} is quietly nursing a cut from the last fight.", [
    ch("tend", "Tend {target}'s wound", out({ bond: 3, heal: 20, text: "{{user}} cleans and binds the cut; {target} watches them the whole time." })),
    ch("potion", "Give {target} a potion", out({ bond: 2, heal: 50, bag: { potion: -1 }, text: "{target} is touched by the gesture." }), { when: "bag('potion') >= 1" }),
  ]),
  ev("confession", "In the dark between torches, {target} stops and says there's something they want to tell {{user}}.", [
    ch("listen", "Listen", out({ bond: 4, text: "{target} shares something they've never told anyone." })),
    ch("kiss", "Kiss {target}", out({ bond: 3, desire: 5, text: "{target} kisses back." }),
      { chance: "20 + rel_bond(target) * 0.8", fail: out({ bond: -2, text: "{target} turns away — it wasn't that." }) }),
  ], 3),
].map((x) => [x.id, x]));

export const SHOP: Record<string, { name: string; price: (depth: number) => number; sprite: string; desc: string }> = {
  potion: { name: "Potion", price: (d) => 12 + d * 3, sprite: "potion", desc: "Restores half of one ally's HP." },
  ether: { name: "Ether", price: (d) => 16 + d * 3, sprite: "ether", desc: "Restores half of one ally's MP." },
  bomb: { name: "Bomb", price: (d) => 20 + d * 4, sprite: "bomb", desc: "Hits every enemy." },
};
