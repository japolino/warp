import type { Template } from "./index.js";

// Sci-fi RPG: six core stats capped by level, shield/HP/lust/energy pools,
// credits, a ship, turn-based combat encounters, perks and a codex.
export const starfarer: Template = {
  id: "starfarer",
  name: "Starfarer (sci-fi RPG)",
  blurb: "Sci-fi RPG / space opera: Physique, Reflexes, Aim, Intelligence, Willpower and Libido capped at 5× level; Shields/HP/Lust/Energy pools; credits; XP and levels with a pick-one-of-three perk; tech abilities (Stim Shot, Overcharge, Target Lock, Smoke Screen, Flamer); burst fire, EMP stuns, armor and armor-piercing rounds; contracts from the concourse board and favours from the locals; a ship and a frontier world; turn-based combat you can win by force or by seduction; a codex that fills in as you explore.",
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
      0%: Down.
      10%: Critical.
      40%: Wounded.
      75%: Healthy.
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
      yaml: `# The frontier is barely charted: exploring the jungle can find new sites.
discovery:
  at: [jungle_edge, jungle_deep]
  chance: 25
  max: 10
  guide: "Frontier-world sites: a crashed survey drone, a hunter's blind, ancient ruins, a smugglers' landing pad, a strange grove."

# {{user}}'s body. Gene-splices change it in stages; the story can change it too.
body:
  parts:
    hair: { color: dark, length: short }
    eyes: { color: brown }
    ears: human
    skin: { tone: tanned }
  transforms:
    feline_splice:
      label: Feline gene-splice
      chance: 75
      stages:
        - { set: { eyes: { color: gold, pupils: slit } }, text: "{{user}}'s eyes sting, then clear: gold, with slit pupils." }
        - { set: { ears: { type: feline } }, text: "Tufted feline ears push up through {{user}}'s hair." }
        - { set: { tail: { type: feline, length: long } }, text: "A long feline tail finishes growing in." }

locations:
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
    board: true
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
  holdout_pistol: { name: Holdout pistol, bonus: { aim: 1 } }
  medkit: Medkit
  codex: { name: Codex, bonus: { intelligence: 1 } }
  shield_booster: Shield booster
  armored_vest: { name: Armored vest, desc: "Ceramic plates: every blow to the body lands 3 lighter.", armor: { hp: 3 } }
  emp_grenade:
    name: EMP grenade
    tags: [consumable]
    use: { label: Throw an EMP grenade, when: in_encounter, foe: { shields: "-50%" }, inflict: { stunned: 1 }, hint: "A white crack — their shields gutter and their gear locks up." }
  ap_rounds:
    name: Armor-piercing rounds
    uses: 3
    use: { label: Load an AP clip and fire, when: in_encounter, check: { vs: 12, add: floor(aim / 2), label: Aim }, success: { foe: { hp: -9 }, pierce: all }, fail: { hint: "The round sparks off a bulkhead." } }

# Statuses: rounds = how long in a fight; skip = a chance to lose the turn; dot = damage each round.
conditions:
  stunned: { label: Stunned, tone: bad, narrator: true, rounds: 1, skip: true, bonus: { reflexes: -3, aim: -2 } }
  grappled: { label: Grappled, tone: bad, narrator: true, rounds: 2, skip: 30, bonus: { reflexes: -4 } }
  burning: { label: Burning, tone: bad, narrator: true, rounds: 3, dot: 4, stat: hp }
  stimmed: { label: Stimmed, tone: good, bonus: { reflexes: 2, physique: 1 } }
  locked_on: { label: Target lock, tone: good, bonus: { aim: 3 } }
`,
    },
    {
      label: "actions",
      yaml: `actions:
  plot_course:
    label: Check the nav charts
    group: Ship
    at: bridge
    say: "*I pull up the nav charts and scan for traffic and signals.*"
    time: 20
    check: { vs: 11, add: floor(intelligence / 2), label: Intelligence }
    success: { xp: +5, hint: "Something on the charts is worth a look: a derelict, a beacon, a smuggler's lane." }
    fail: { hint: "Static and freighter chatter." }
  salvage:
    label: Strip salvage for parts
    group: Ship
    at: cargo_bay
    say: "*I sort through the cargo bay for anything worth selling.*"
    time: 60
    cost: { energy: -10 }
    check: { vs: 11, add: floor(intelligence / 3) + floor(physique / 3), label: Tech }
    success: { credits: roll('2d20') }
    fail: { energy: -5 }
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
  gene_splice:
    label: Buy a feline gene-splice (₡250)
    group: Trade
    at: merchant
    when: credits >= 250 and transformed('feline_splice') < 3
    say: "*I pay for a feline gene-splice and take the injector.*"
    effects: { credits: -250, transform: { feline_splice: 1 } }
  buy_vest:
    label: Buy an armored vest (₡300)
    group: Trade
    at: merchant
    when: credits >= 300 and not has('armored_vest')
    say: "*I buy the armored vest.*"
    effects: { credits: -300, give: armored_vest }
  buy_emp:
    label: Buy an EMP grenade (₡80)
    group: Trade
    at: merchant
    when: credits >= 80
    say: "*I buy an EMP grenade.*"
    effects: { credits: -80, give: emp_grenade }
  buy_ap:
    label: Buy armor-piercing rounds (₡120)
    group: Trade
    at: merchant
    when: credits >= 120
    say: "*I buy a box of AP rounds.*"
    effects: { credits: -120, give: ap_rounds }
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
      armor: { hp: 2 }            # scavenged plating: blows to the body land 2 lighter
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
      burst:
        label: Burst fire
        cost: { energy: -8 }
        check: { vs: 11, add: floor(aim / 2), label: Aim }
        success: { foe: { shields: -4 }, hits: 3, hint: "Three rounds rake their shields." }
        fail: { hint: "The burst goes wide." }
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
      grapple: { desc: "Tries to grapple", weight: 1, hp: -4, add_condition: [grappled] }
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
      label: "quests",
      yaml: `# Contracts off the concourse board, favours from the locals, and the Red Veil — which
# comes for {{user}} whether they're ready or not.
quests:
  scav_bounty:
    name: "Bounty: jungle scavengers"
    kind: contract
    board: true
    repeat: 4
    desc: Station security pays per scavenger crew put down on the jungle edge.
    days: 5
    goals:
      - { text: Win fights against scavengers, count: 2, on: { encounter: ambush, outcome: [won, seduced] } }
    reward: { credits: 200, xp: 30 }
    failure: { xp: -10 }
    stakes: Security stops posting your name on the good jobs.
  kade_parts:
    name: Salvage run for Kade
    kind: favour
    giver: kade
    desc: Kade needs reactor couplings — any salvage will do, as long as it's today's.
    days: 2
    goals:
      - { text: Strip salvage in your cargo bay, count: 2, on: salvage }
    reward: { credits: 120, rel: { kade: { affinity: 6 } } }
    failure: { rel: { kade: { affinity: -6 } } }
    remember: { failed: "{{user}} promised Kade couplings and never delivered." }
  vex_relic:
    name: A relic for Vex
    kind: favour
    giver: vex
    when: "rel('vex', 'affinity') >= 20"
    desc: Vex wants something old from the ruins under the jungle, and pays in secrets.
    days: 6
    goals:
      - { text: Reach the third floor of the Deep Ruins, when: "deepest('ruins') >= 3" }
    reward: { credits: 100, reveal: [vex_informant], rel: { vex: { affinity: 8 } } }
    failure: { rel: { vex: { affinity: -6 } } }
    stakes: Vex stops pouring for you — and stops talking.
  red_veil_hunt:
    name: The Red Veil
    kind: main
    auto: true
    when: "front_stage('red_veil') >= 1"
    desc: Someone broke into {{user}}'s ship. The Red Veil syndicate has marked them — find out why before they come back.
    goals:
      - { text: "Learn who's selling {{user}} out", when: "secret('vex_informant') >= 2" }
      - { text: Survive the Red Veil's move, when: "front_stage('red_veil') >= 2 and not in_encounter" }
    fail: "hp <= 1 and front_stage('red_veil') >= 2"
    reward: { xp: 120, credits: 300, perk_points: 1 }
    failure: { credits: -200 }
    stakes: The Red Veil takes the ship, or worse.
`,
    },
    {
      label: "journal",
      yaml: `# The player's own tech and tricks. Stim Shot everyone has; the rest come with perks.
abilities:
  stim_shot:
    name: Stim Shot
    desc: A combat stim straight into the neck
    cost: { energy: -15 }
    add_condition: { stimmed: 3 }
    per_encounter: 1
  overcharge:
    name: Overcharge Shields
    desc: Dump reactor power into the shield emitter
    cost: { energy: -20 }
    shields: "+(10 + intelligence * 2)"
    per_encounter: 1
  target_lock:
    name: Target Lock
    desc: The visor paints the target
    where: encounter
    cost: { energy: -8 }
    add_condition: { locked_on: 3 }
  flamer:
    name: Flamer
    desc: A wrist-mounted burst of burning gel that keeps on burning
    where: encounter
    known: false
    cost: { energy: -12 }
    check: { vs: 11, add: floor(aim / 2), label: Aim }
    success: { harm: 4, inflict: { burning: 3 } }
    fail: { hint: "The gel sputters onto the deck." }
    per_encounter: 1
  smoke_screen:
    name: Smoke Screen
    desc: A grenade of thick, sensor-blinding smoke
    where: encounter
    cost: { energy: -12 }
    per_day: 1
    check: { vs: 10, add: floor(reflexes / 2), label: Reflexes }
    success: { end: fled }
    fail: { hint: "The smoke billows the wrong way." }

# One point per level; each point offers three perks to choose from.
perks:
  points: perk_points
  pick: 3
  sharpshooter:
    name: Sharpshooter
    desc: Every shot counts — more so with a lock.
    tags: [aim]
    bonus: { aim: 1 }
    edge: { aim: 2, when: "cond('locked_on')" }
    abilities: [target_lock]
  bruiser:
    name: Bruiser
    desc: Built to take hits.
    tags: [physique]
    bonus: { physique: 1 }
    rule: { losses: { hp: "-20%" } }
    narrator: "{{user}} is built like a cargo loader and takes a hit like one."
  shield_tech:
    name: Shield Tech
    desc: Knows emitters inside out.
    abilities: [overcharge]
    rule: { losses: { shields: "-15%" } }
  iron_will:
    name: Iron Will
    desc: Hard to tempt, harder to break.
    bonus: { willpower: 2 }
    rule: { gains: { lust: "-30%" } }
  silver_tongue:
    name: Silver Tongue
    desc: Even a bad line half-lands.
    tags: [libido]
    bonus: { libido: 10 }
    rule: { soften: { stats: [libido], per_day: 2 } }
    excludes: [iron_will]
  spacer_luck:
    name: Spacer's Luck
    desc: Once a day the universe blinks first.
    rule: { reroll: { per_day: 1 } }
  ghost:
    name: Ghost
    desc: Gone before they look up.
    abilities: [smoke_screen]
    bonus: { reflexes: 1 }
  pyro:
    name: Pyro
    desc: Likes it hot.
    abilities: [flamer]
    narrator: "{{user}} smells faintly of accelerant and doesn't mind at all."
  hollow_point:
    name: Hollow Point
    desc: Knows where armor is thin.
    tags: [aim]
    rule: { pierce: { amount: 3, stats: [aim, physique] } }
  tactician:
    name: Tactician
    desc: Reads a fight three moves ahead.
    requires: "level >= 3"
    bonus: { intelligence: 1, reflexes: 1 }
    edge: { aim: 2, when: "shields > 0" }

codex:
  station: { title: The Station, category: Places, text: "A trade hub bolted onto an asteroid. Everything's for sale.", unlock: "location == 'concourse'" }
  jungle: { title: The Frontier Jungle, category: Places, text: "Humid, hostile, and dotted with pre-colonial ruins.", unlock: "location == 'jungle_edge'" }
  ruins: { title: The Ruins, category: Places, text: "Whoever built them left in a hurry — and left things behind.", unlock: "location == 'jungle_deep'" }
  scavengers: { title: Scavengers, category: Threats, text: "Desperate, armed, and occasionally persuadable.", unlock: "turn > 0 and in_encounter" }

feats:
  first_blood: { name: First blood, desc: "Win a fight.", unlock: "xp >= 40 or level >= 2" }
  explorer: { name: Explorer, desc: "Reach the deep jungle.", unlock: "location == 'jungle_deep'", reward: { xp: +20 } }
  contractor: { name: Contractor, desc: "Finish three contracts or favours.", unlock: "quests_done() >= 3", reward: { xp: +40, perk_points: +1 } }
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
