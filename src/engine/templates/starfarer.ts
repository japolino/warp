import type { Template } from "./index.js";

// Sci-fi RPG: six core stats capped by
// level, shield/HP/lust/energy pools, credits, a ship, and combat actions that
// only appear while a fight is on.
export const starfarer: Template = {
  id: "starfarer",
  name: "Starfarer (sci-fi RPG)",
  blurb: "Sci-fi RPG: Physique, Reflexes, Aim, Intelligence, Willpower and Libido capped at 5× level; Shields/HP/Lust/Energy pools; credits; XP and levels; a ship; combat moves that appear during fights.",
  parts: [
    {
      label: "core",
      yaml: `name: Starfarer
description: A frontier sci-fi RPG aboard your own ship.

clock:
  start: Day 1 08:00
  minutes_per_action: 10
  narrator_max: 720

start:
  location: bridge
  items: { holdout_pistol: 1, medkit: 2, codex: 1 }

hud:
  currency: "₡"
  bars: [shields, hp, lust, energy, xp]

flags:
  in_combat: { narrator: true }     # the narrator starts/ends fights
  enemy_defense: { start: 12, narrator: true }
`,
    },
    {
      label: "stats",
      yaml: `stats:
  level:
    kind: attribute
    start: 1
    max: 20
  xp:
    kind: meter
    label: XP
    start: 0
    max: level * 100
    good: none
    narrator: 60
  shields:
    kind: meter
    max: 10 + level * 8
    start: 18
    per_hour: 30
    narrator: 15
  hp:
    kind: meter
    label: HP
    max: 20 + physique * 2 + level * 10
    start: 36
    per_hour: 4
    narrator: 20
    bands:
      0: Down.
      10: Critical.
      40: Wounded.
      75: Healthy.
  lust:
    kind: meter
    good: low
    start: 10
    per_hour: -5
    narrator: 20
    bands:
      0: Cool-headed.
      30: Warm.
      60: Flushed.
      90: Can barely think.
  energy:
    kind: meter
    start: 100
    per_hour: 15
    narrator: 20
  credits:
    kind: money
    start: 500
    narrator: 300

  physique:     { kind: attribute, start: 3, max: level * 5, desc: Melee power and HP. }
  reflexes:     { kind: attribute, start: 3, max: level * 5, desc: Evasion, speed, flight. }
  aim:          { kind: attribute, start: 3, max: level * 5, desc: Ranged accuracy and damage. }
  intelligence: { kind: attribute, start: 3, max: level * 5, desc: Tech, sensing, knowledge. }
  willpower:    { kind: attribute, start: 3, max: level * 5, desc: Resisting physical, mental and sexual pressure. }
  libido:       { kind: attribute, start: 15, max: 100, good: none, desc: Tease power and how quickly lust rises. }
`,
    },
    {
      label: "people",
      yaml: `relationships:
  open: true
  stats:
    affinity:
      start: 10
      narrator: 5
      bands: { 0: Hostile, 10: Neutral, 35: Friendly, 65: Close, 90: Devoted }
    attraction:
      start: 0
      narrator: 8
      good: none
      bands: { 0: None, 25: Curious, 55: Interested, 85: Infatuated }
`,
    },
    {
      label: "world",
      yaml: `locations:
  bridge:
    name: Ship — Bridge
    desc: Your ship's cramped cockpit and nav console.
    exits: [quarters, cargo_bay]
    travel: 2
  quarters:
    name: Ship — Quarters
    desc: A bunk, a shower, a locker.
    exits: [bridge]
    travel: 2
  cargo_bay:
    name: Ship — Cargo Bay
    desc: The loading ramp opens onto whatever dock you're berthed at.
    exits: [bridge, concourse, jungle_edge]
    travel: 2
  concourse:
    name: Station Concourse
    desc: Merchants, a bar, and a notice board full of bounties.
    exits: [cargo_bay, bar, merchant]
    travel: 10
  bar:
    name: The Dry Dock (bar)
    desc: Spacers, mercs, and rumours.
    exits: [concourse]
  merchant:
    name: Gear Merchant
    desc: Guns, armour, gadgets — for a price.
    exits: [concourse]
  jungle_edge:
    name: Frontier Jungle
    desc: Hot, wet, and full of things that bite. Or worse.
    exits: [cargo_bay]
    travel: 30

items:
  holdout_pistol: Holdout pistol
  medkit: Medkit
  codex: Codex
  shield_booster: Shield booster

conditions:
  stunned: { label: Stunned, tone: bad, narrator: true }
  grappled: { label: Grappled, tone: bad, narrator: true }
  burning: { label: Burning, tone: bad, narrator: true }
`,
    },
    {
      label: "actions",
      yaml: `actions:
  # ── Combat (only while in_combat is true) ──
  shoot:
    label: Shoot
    group: Combat
    when: in_combat
    say: "*I draw and fire.*"
    time: 1
    cost: { energy: -5 }
    check: { vs: enemy_defense, add: floor(aim / 2), label: Aim }
    crit_success: { hint: "A perfect shot — devastating damage, the enemy reels." }
    success: { hint: "The shot lands solidly." }
    fail: { shields: -6, hint: "Missed — and the enemy answers with a hit of their own." }
    crit_fail: { shields: -6, hp: -8, hint: "A bad miss that leaves {{user}} wide open to a painful counter." }
  melee:
    label: Melee
    group: Combat
    when: in_combat
    say: "*I close in and strike.*"
    time: 1
    cost: { energy: -8 }
    check: { vs: enemy_defense, add: floor(physique / 2), label: Physique }
    success: { hint: "A heavy blow connects." }
    fail: { shields: -8, hint: "Blocked, and the counterattack hurts." }
    crit_fail: { hp: -10, hint: "Overextended — {{user}} takes a brutal hit." }
  tease:
    label: Tease
    group: Combat
    when: in_combat
    say: "*I put on a show to throw them off.*"
    time: 1
    check: { vs: enemy_defense, add: floor(libido / 10), label: Libido }
    success: { hint: "The enemy is visibly flustered and distracted." }
    fail: { lust: +8, hint: "They don't bite — and the attempt leaves {{user}} a little hot and bothered." }
  sense:
    label: Sense
    group: Combat
    when: in_combat
    say: "*I study my opponent for weaknesses.*"
    time: 1
    check: { vs: 12, add: floor(intelligence / 2), label: Intelligence }
    success: { flags: { enemy_defense: enemy_defense - 3 }, hint: "Reveal the enemy's weak point and what they like and dislike." }
    fail: { hint: "Nothing useful gleaned." }
  flee:
    label: Flee
    group: Combat
    when: in_combat
    say: "*I try to break away and run.*"
    time: 1
    check: { vs: 13, add: floor(reflexes / 2), label: Reflexes }
    success: { flags: { in_combat: false }, energy: -10, hint: "{{user}} escapes." }
    fail: { shields: -6, hint: "Cut off — the fight goes on." }
  use_medkit:
    label: Use a medkit
    group: Combat
    when: has('medkit')
    say: "*I slap a medkit on.*"
    time: 2
    effects: { take: medkit, hp: +25 }

  # ── Out of combat ──
  rest_quarters:
    label: Rest in your bunk
    group: Ship
    at: quarters
    when: not in_combat
    say: "*I crash in my bunk for a few hours.*"
    time: 240
    effects: { hp: +40, shields: +100, energy: +100, lust: -20 }
  scan:
    label: Scan the area
    group: Explore
    when: not in_combat
    say: "*I sweep the area with my codex scanner.*"
    time: 5
    check: { vs: 12, add: floor(intelligence / 2), label: Intelligence }
    success: { hint: "The scan reveals something valuable: a hidden route, loot, or a threat before it strikes." }
    fail: { hint: "Interference. Nothing useful." }
  explore:
    label: Explore
    group: Explore
    at: jungle_edge
    when: not in_combat
    say: "*I push deeper into the jungle.*"
    time: 45
    check: { vs: 11, add: floor(reflexes / 3), label: Reflexes }
    success: { xp: +15, credits: roll('3d20'), hint: "A discovery: salvage or something worth selling." }
    fail: { flags: { in_combat: true }, hint: "Something hostile ambushes {{user}} — a fight begins." }
  buy_booster:
    label: Buy shield booster (₡150)
    group: Trade
    at: merchant
    when: credits >= 150
    say: "*I buy a shield booster.*"
    effects: { credits: -150, give: shield_booster }
  drink:
    label: Have a drink (₡20)
    group: Social
    at: bar
    when: credits >= 20
    say: "*I order a drink and listen for rumours.*"
    time: 30
    check: { vs: 10, add: floor(intelligence / 3), label: Intelligence }
    success: { credits: -20, lust: +5, hint: "A useful rumour: a job, a lead, or a warning." }
    fail: { credits: -20, lust: +5, hint: "Just noise tonight." }

  # ── Free-text only ──
  resist:
    label: Resist
    hidden: true
    desc: Resisting seduction, grapples, mind games, drugs or pain.
    params:
      difficulty: { easy: 8, normal: 12, hard: 16, extreme: 20 }
    check: { vs: difficulty, add: floor(willpower / 2), label: Willpower }
    success: { hint: "{{user}} holds firm." }
    fail: { lust: +10, hint: "{{user}}'s resolve slips." }
  tech:
    label: Tech
    hidden: true
    desc: Hacking, repairs, piloting tricks, anything technical.
    params:
      difficulty: { easy: 8, normal: 12, hard: 16, extreme: 20 }
    check: { vs: difficulty, add: floor(intelligence / 2), label: Intelligence, partial: 3 }
    success: { xp: +5, hint: "It works." }
    fail: { hint: "It doesn't work." }
`,
    },
    {
      label: "rules",
      yaml: `triggers:
  # Fights start and end from the story itself, judged each turn by the decision model.
  fight_starts:
    when_scene: "A fight has broken out and {{user}} is in it"
    do:
      flags: { in_combat: true }
      hint: "Combat! {{user}} squares up."
  fight_over:
    when: in_combat
    when_scene: "The fight is over — enemies fled, surrendered, or are down"
    do:
      flags: { in_combat: false }
  level_up:
    when: xp >= level * 100
    do:
      set: { xp: 0 }
      level: +1
      physique: +1
      reflexes: +1
      aim: +1
      intelligence: +1
      willpower: +1
      hint: "Level up! {{user}} feels stronger, faster, sharper."
  shields_down:
    when: shields <= 0 and in_combat
    do:
      hint: "{{user}}'s shields are down — hits now land on flesh."
  defeated_hp:
    when: hp <= 0
    do:
      flags: { in_combat: false }
      set: { hp: 1 }
      credits: -100
      hint: "{{user}} is knocked out. They wake later, robbed of some credits."
  defeated_lust:
    when: lust >= 100
    do:
      flags: { in_combat: false }
      set: { lust: 40 }
      hint: "{{user}} is overwhelmed by lust and can't keep fighting — the enemy has their way."
`,
    },
  ],
};
