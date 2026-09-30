import type { Template } from "./index.js";

// Sci-fi RPG: six core stats capped by level, shield/HP/lust/energy pools,
// credits, a ship, turn-based combat encounters, perks and a codex.
export const starfarer: Template = {
  id: "starfarer",
  name: "Starfarer (sci-fi RPG)",
  blurb: "Sci-fi RPG: Physique, Reflexes, Aim, Intelligence, Willpower and Libido capped at 5× level; Shields/HP/Lust/Energy pools; credits; XP, levels and perks; a ship and a frontier world; turn-based combat you can win by force or by seduction; a codex that fills in as you explore.",
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
  perk_points:
    kind: attribute
    label: Perk points
    start: 1
    max: 20
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
  people:
    vex:
      name: Vex
      desc: Bartender at the Dry Dock. Sells rumours by the glass.
      schedule:
        - { when: "hour >= 16 or hour < 4", at: bar }
    kade:
      name: Kade
      desc: Gear merchant. Haggles like it's a blood sport.
      schedule:
        - { when: "between(hour, 8, 20)", at: merchant }
`,
    },
    {
      label: "world",
      yaml: `locations:
  bridge:
    name: Ship — Bridge
    desc: Your ship's cramped cockpit and nav console.
    indoors: true
    exits: [quarters, cargo_bay]
    travel: 2
  quarters:
    name: Ship — Quarters
    desc: A bunk, a shower, a locker.
    indoors: true
    exits: [bridge]
    travel: 2
  cargo_bay:
    name: Ship — Cargo Bay
    desc: The loading ramp opens onto whatever dock you're berthed at.
    indoors: true
    exits: [bridge, concourse, jungle_edge]
    travel: 2
  concourse:
    name: Station Concourse
    desc: Merchants, a bar, and a notice board full of bounties.
    indoors: true
    exits: [cargo_bay, bar, merchant]
    travel: 10
  bar:
    name: The Dry Dock (bar)
    desc: Spacers, mercs, and rumours.
    indoors: true
    exits: [concourse]
  merchant:
    name: Gear Merchant
    desc: Guns, armour, gadgets — for a price.
    indoors: true
    exits: [concourse]
  jungle_edge:
    name: Frontier Jungle
    desc: Hot, wet, and full of things that bite. Or worse.
    exits: [cargo_bay, jungle_deep]
    travel: 30
  jungle_deep:
    name: Deep Jungle
    desc: The canopy closes overhead. Old ruins, older predators.
    exits: [jungle_edge]
    travel: 45

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
  rest_quarters:
    label: Rest in your bunk
    group: Ship
    at: quarters
    say: "*I crash in my bunk for a few hours.*"
    time: 240
    effects: { hp: +40, shields: +100, energy: +100, lust: -20 }
  scan:
    label: Scan the area
    group: Explore
    say: "*I sweep the area with my codex scanner.*"
    time: 5
    check: { vs: 12, add: floor(intelligence / 2), label: Intelligence }
    success: { hint: "The scan reveals something valuable: a hidden route, loot, or a threat before it strikes." }
    fail: { hint: "Interference. Nothing useful." }
  explore:
    label: Explore
    group: Explore
    at: [jungle_edge, jungle_deep]
    say: "*I push deeper into the jungle.*"
    time: 45
    check: { vs: 11, add: floor(reflexes / 3), label: Reflexes }
    success: { xp: +15, credits: roll('3d20'), hint: "A discovery: salvage or something worth selling." }
    fail: { start_encounter: ambush }
  use_booster:
    label: Use a shield booster
    group: Gear
    when: has('shield_booster')
    say: "*I pop a shield booster.*"
    time: 1
    effects: { take: shield_booster, shields: +30 }
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
  talk:
    label: Talk to {target}
    group: Social
    per_person: true
    say: "*I strike up a conversation with {target}.*"
    time: 15
    effects: { rel: { target: { affinity: +2 } } }
  flirt:
    label: Flirt with {target}
    group: Social
    per_person: true
    say: "*I flirt with {target}.*"
    time: 15
    check: { vs: 12, add: floor(libido / 10) + floor(target.affinity / 20), label: Libido }
    success: { rel: { target: { attraction: +5 } }, lust: +5 }
    fail: { rel: { target: { affinity: -2 } } }

  # Free-text only
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
      label: "encounters",
      yaml: `# Turn-based combat. Shields soak damage first; win by knocking the foe out
# or by driving their lust to the limit — and lose the same two ways.
encounters:
  ambush:
    name: Ambush
    desc: A hostile scavenger jumps {{user}}.
    foe:
      name: Scavenger
      stats:
        shields: { label: Shields, start: 12, max: 12 }
        hp: { label: HP, start: 30, max: 30 }
        lust: { label: Lust, start: 0, max: 100, good: low }
    actions:
      shoot:
        label: Shoot
        cost: { energy: -5 }
        check: { vs: 12, add: floor(aim / 2), label: Aim }
        crit_success: { foe: { shields: -14, hp: "foe.shields <= 0 ? -12 : 0" }, hint: "A perfect shot." }
        success: { foe: { shields: -8, hp: "foe.shields <= 0 ? -7 : 0" }, hint: "The shot lands." }
        fail: { hint: "Missed." }
      melee:
        label: Melee
        cost: { energy: -8 }
        check: { vs: 12, add: floor(physique / 2), label: Physique }
        success: { foe: { hp: "-(6 + floor(physique / 2))" }, hint: "A heavy blow gets past their shields." }
        fail: { hint: "Blocked." }
      tease:
        label: Tease
        check: { vs: 11, add: floor(libido / 10), label: Libido }
        success: { foe: { lust: "+(12 + floor(libido / 5))" }, hint: "They're visibly flustered." }
        fail: { lust: +5, hint: "They don't bite — and it leaves {{user}} a little hot and bothered." }
      medkit:
        label: Use a medkit
        when: has('medkit')
        effects: { take: medkit, hp: +25 }
      flee:
        label: Flee
        check: { vs: 13, add: floor(reflexes / 2), label: Reflexes }
        success: { energy: -10, end: fled }
        fail: { hint: "Cut off — the fight goes on." }
    foe_moves:
      blast: { desc: "Fires a blaster", weight: 3, shields: -8, hp: "shields <= 0 ? -6 : 0" }
      grapple: { desc: "Tries to grapple", weight: 1, hp: -4, add_condition: { grappled: 2 } }
      taunt: { desc: "Puts on a lewd display", weight: 1, lust: "+(8 + floor(libido / 10))" }
    end_when:
      won: foe.hp <= 0
      seduced: foe.lust >= 100
      downed: hp <= 0
      overwhelmed: lust >= 100
    outcomes:
      won: { xp: +40, credits: roll('4d20'), hint: "The scavenger goes down." }
      seduced: { xp: +40, lust: +10, hint: "The scavenger gives up the fight, overcome with desire." }
      fled: { hint: "{{user}} gets away." }
      downed: { set: { hp: 1 }, credits: -100, hint: "{{user}} is knocked out and wakes later, robbed." }
      overwhelmed: { set: { lust: 40 }, hint: "{{user}} is overwhelmed by lust and can't keep fighting — the scavenger has their way." }

# Roguelike diving in the pre-colonial ruins. Leave whenever you like and keep the
# salvage; get wiped out and you lose it.
dungeons:
  ruins:
    name: The Deep Ruins
    desc: Pre-colonial vaults under the jungle, still humming with power and full of things that don't like visitors.
    at: [jungle_deep]
    theme: ruins
    floors: 20
    party: { max: 3 }
    player: { class: fighter, hp: "40 + physique * 6 + level * 8", atk: "6 + aim * 1.5", def: "6 + physique", mat: "6 + intelligence * 1.5", agi: "6 + reflexes * 1.2" }
    currency: credits
    loot: { shield_booster: 3, medkit: 2 }
    on_leave: { energy: -20 }
    on_defeat: { hp: -20, credits: "-min(credits, 150)" }
`,
    },
    {
      label: "journal",
      yaml: `# Perks cost points (one per level). Codex entries unlock as you explore.
perks:
  points: perk_points
  sharpshooter: { name: Sharpshooter, desc: "+2 Aim.", cost: 1, effects: { aim: +2 } }
  bruiser: { name: Bruiser, desc: "+2 Physique.", cost: 1, effects: { physique: +2 } }
  iron_will: { name: Iron Will, desc: "+2 Willpower.", cost: 1, effects: { willpower: +2 } }
  silver_tongue: { name: Silver Tongue, desc: "+10 Libido.", cost: 1, effects: { libido: +10 } }
  tactician: { name: Tactician, desc: "+2 Intelligence and Reflexes.", cost: 2, requires: "level >= 3", effects: { intelligence: +2, reflexes: +2 } }

codex:
  station: { title: The Station, category: Places, text: "A trade hub bolted onto an asteroid. Everything's for sale.", unlock: "location == 'concourse'" }
  jungle: { title: The Frontier Jungle, category: Places, text: "Humid, hostile, and dotted with pre-colonial ruins.", unlock: "location == 'jungle_edge'" }
  ruins: { title: The Ruins, category: Places, text: "Whoever built them left in a hurry — and left things behind.", unlock: "location == 'jungle_deep'" }
  scavengers: { title: Scavengers, category: Threats, text: "Desperate, armed, and occasionally persuadable.", unlock: "turn > 0 and in_encounter" }

feats:
  first_blood: { name: First blood, desc: "Win a fight.", unlock: "xp >= 40 or level >= 2" }
  explorer: { name: Explorer, desc: "Reach the deep jungle.", unlock: "location == 'jungle_deep'", reward: { xp: +20 } }
`,
    },
    {
      label: "rules",
      yaml: `triggers:
  # Fights can also start from the story itself, judged each turn by the decision model.
  fight_starts:
    when_scene: "A fight has broken out and {{user}} is in it"
    do: { start_encounter: ambush }
  level_up:
    when: xp >= level * 100
    do:
      set: { xp: 0 }
      level: +1
      perk_points: +1
      physique: +1
      reflexes: +1
      aim: +1
      intelligence: +1
      willpower: +1
      hint: "Level up! {{user}} feels stronger, faster, sharper."
  shields_down:
    when: shields <= 0 and in_encounter
    do:
      hint: "{{user}}'s shields are down — hits now land on flesh."
`,
    },
    {
      label: "story",
      yaml: `# Secrets reach the narrator one stage at a time; fronts are hidden clocks that fill
# with game time; random events come from a hidden gauge with an omen first; live
# choices are written for each moment, and their tag decides the roll.
secrets:
  vex_informant:
    about: Vex
    cue: "Vex always seems to know which ships are carrying what, and goes quiet when anyone mentions the Red Veil."
    tell: exists
    stages:
      - when: "rel('vex', 'affinity') >= 50"
        text: "Vex sells shipping manifests to the Red Veil syndicate. It's how Vex pays off an old debt to them."
      - when: "rel('vex', 'affinity') >= 80"
        text: "Vex passed the Red Veil {{user}}'s ship registry weeks ago, before they ever became friends."

fronts:
  red_veil:
    label: The Red Veil syndicate
    per_day: 8
    story:
      "{{user}} makes enemies of pirates or the Red Veil": 15
      "{{user}} lies low or covers their tracks": -10
    stages:
      - at: 35
        hint: "The same unmarked shuttle has docked near {{user}}'s ship two days running."
        backstage: "The Red Veil has marked {{user}}'s ship as a target worth taking."
        surface: "Someone has been aboard {{user}}'s ship: the cargo bay lock is scorched and a crate is missing."
        news: "Someone broke into the cargo bay."
        do: { credits: -150 }
      - at: 70
        hint: "Station security keeps finding reasons to walk past {{user}}'s berth."
        backstage: "The Red Veil paid a station security officer to look the other way."
        surface: "A Red Veil scavenger crew makes its move against {{user}}."
        news: "The Red Veil made its move."
        do: { start_encounter: ambush }

random_events:
  pace: { per_day: 20, jitter: 0.3, rest_days: 2, omen_at: 80 }
  events:
    distress_call:
      label: Distress call
      omen: "The comm panel keeps catching fragments of a looping signal."
      text: "A distress beacon pings {{user}}'s comm — a small ship in trouble on the jungle edge."
      cooldown: 10
    customs:
      label: Customs inspection
      when: "location == 'concourse' or location == 'bar' or location == 'merchant'"
      omen: "Customs officers are working their way along the docking ring."
      text: "Station customs flag {{user}} for a random inspection."
      cooldown: 8
      do: { energy: -10 }
    ion_storm:
      label: Ion storm
      omen: "Static crawls across every screen on the station."
      text: "An ion storm rolls over the station; shields and comms flicker."
      cooldown: 12
      do: { shields: -10 }

live_choices:
  label: Right now
  count: 3
  when: not in_encounter
  tags:
    daring:
      desc: "A fast, daring or reckless move"
      check: { vs: 12, add: floor(reflexes / 2), label: Reflexes }
      success: { xp: +10 }
      fail: { hp: -6 }
    charm:
      desc: "Charming, flirting with or winning over someone here"
      per_person: true
      check: { vs: 11, add: floor(libido / 10), label: Libido }
      success: { rel: { target: { affinity: +4, attraction: +3 } } }
      fail: { lust: +5 }
    tech:
      desc: "Hacking, scanning or working a piece of tech"
      check: { vs: 12, add: floor(intelligence / 2), label: Intelligence }
      success: { xp: +10 }
      fail: { energy: -8 }
    careful:
      desc: "The cautious option: holding back, waiting, walking away"
      effects: { energy: +5 }
`,
    },
    {
      label: "dating",
      yaml: `# Date mode: talk topic by topic, learn what people like, ask them out.
# Affinity is love; a "fear" relationship stat is added automatically.
dating:
  love: affinity
  stages: { stranger: 0, contact: 12, friend: 35, close: 65, partner: { at: 85, partner: true } }
  people:
    vex: { loves: [the_frontier, gossip], likes: [tag:drink, tag:music, joke], dislikes: [work], hates: [family] }
    kade: { loves: [ships, work], likes: [tag:food, tag:competition], dislikes: [compliment_looks, weather], hates: [tease] }
  topics:
    ships: { label: "Ships and engines", category: interests }
    the_frontier: { label: "Life on the frontier", category: small_talk }
    old_wars: { label: "The old wars", category: personal, stage: close }
    fashion: false
    sport: false
  builtin_venues: false
  venues:
    cantina:
      name: The Dry Dock bar
      at: bar
      cost: 25
      activities:
        synth_shots: { label: "Do synth-shots", tags: [drink, thrill] }
        holo_darts: { label: "Play holo-darts", tags: [games, competition] }
        band: { label: "Dance to the house band", tags: [dance, music] }
        booth: { label: "Share a back booth", tags: [conversation, romance], romantic: true }
      events:
        brawl: { text: "A brawl breaks out two tables over.", enjoy: -6 }
        round: { text: "A stranger buys the table a round.", enjoy: 6 }
    observation:
      name: The observation deck
      cost: 0
      activities:
        stars: { label: "Name the constellations", tags: [calm, observation] }
        ships_pass: { label: "Watch the ships come in", tags: [observation, ships] }
        close: { label: "Sit close in the starlight", tags: [romance, calm], romantic: true }
        story: { label: "Trade stories", tags: [conversation, humor] }
      events:
        aurora: { text: "An ion storm lights up the dark outside.", enjoy: 10 }
        patrol: { text: "Station security moves everyone along for a while.", enjoy: -5 }
    market:
      name: A stroll through the concourse market
      at: concourse
      cost: 10
      activities:
        street_food: { label: "Try alien street food", tags: [food, thrill] }
        trinket: { label: "Buy them a trinket", tags: [gift, fun] }
        haggle: { label: "Haggle together", tags: [competition, humor] }
        fortune: { label: "Visit a fortune-reading drone", tags: [fun, observation] }
      events:
        pickpocket: { text: "Someone tries to lift a credit chip.", enjoy: -6 }
        festival: { text: "A dockworkers' festival spills into the market.", enjoy: 8 }

items:
  star_lily: { name: A star lily, tags: [gift] }

actions:
  buy_star_lily:
    label: Buy a star lily (30 cr)
    group: Trade
    at: [merchant]
    when: credits >= 30
    time: 5
    effects: { credits: -30, give: star_lily }
`,
    },
  ],
};
