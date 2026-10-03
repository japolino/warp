import type { Template } from "./index.js";

// Fantasy adventure RPG: a frontier village, a forest road and an old barrow.
// HP / stamina / mana, skills that grow, spells and techniques with costs and
// limits, perks picked from a few at each level, fights you can win by steel,
// spell or words, a dungeon under the barrow, and a threat that grows on its own.
export const questbound: Template = {
  id: "questbound",
  name: "Questbound (fantasy RPG)",
  blurb: "Fantasy adventure RPG: HP, stamina and mana; Might, Agility, Wits and Spirit with skills that grow (blades, archery, arcana, stealth, persuasion, survival, lore); spells and techniques with costs and uses (Firebolt, Mend, Haste, Flurry, Smite, Blood Price, Vanish); levels with a pick-one-of-three perk; armor, poison, stuns and bleeding; quests from the guild board and the villagers, with rewards and a price for failing; wolves, bandits and a barrow-wight you can beat by steel, spell or words; a dungeon under the barrow; a dark threat that grows on its own.",
  parts: [
    {
      label: "core",
      yaml: `name: Questbound
description: A frontier village, a road through dark woods, and a barrow that remembers an old war.

clock:
  start: Day 1 07:00
  minutes_per_action: 10
  narrator_max: 720

start:
  location: inn
  items: { short_sword: 1, healing_draught: 2, rations: 3, torch: 1 }

hud:
  currency: "g"
  bars: [hp, stamina, mana, xp]

narration:
  notes: A grounded fantasy world. Magic is rare and costs something; steel is honest; people remember favours.
`,
    },
    {
      label: "stats",
      yaml: `stats:
  level: { kind: attribute, start: 1, max: 20 }
  xp:
    kind: meter
    label: XP
    start: 0
    max: level * 100
    good: none
    narrator: 50
  perk_points: { kind: attribute, label: Perk points, start: 1, max: 20 }
  hp:
    kind: meter
    label: HP
    max: 20 + might * 2 + level * 8
    start: 34
    per_hour: 3
    narrator: 15
    bands:
      0%: Down.
      10%: Barely standing.
      40%: Wounded.
      75%: Hale.
  stamina:
    kind: meter
    start: 100
    per_hour: 12
    narrator: 20
    bands:
      0: Spent.
      30: Winded.
      70: Fresh.
  mana:
    kind: meter
    max: 12 + wits * 2 + level * 3
    start: 21
    per_hour: 4
    narrator: 10
  gold:
    kind: money
    start: 25
    narrator: 40

  might:   { kind: attribute, start: 3, max: 10, desc: Strength — blows, carrying, forcing things. }
  agility: { kind: attribute, start: 3, max: 10, desc: Speed and balance — dodging, aiming, sneaking. }
  wits:    { kind: attribute, start: 3, max: 10, desc: Cleverness and magic. }
  spirit:  { kind: attribute, start: 3, max: 10, desc: Nerve, faith and presence. }

  blades:     { kind: skill, start: 20, max: 100, grades: [F, D, C, B, A, S] }
  archery:    { kind: skill, start: 10, max: 100, grades: [F, D, C, B, A, S] }
  arcana:     { kind: skill, start: 10, max: 100, grades: [F, D, C, B, A, S] }
  stealth:    { kind: skill, start: 15, max: 100, grades: [F, D, C, B, A, S] }
  persuasion: { kind: skill, start: 15, max: 100, grades: [F, D, C, B, A, S] }
  survival:   { kind: skill, start: 15, max: 100, grades: [F, D, C, B, A, S] }
  lore:       { kind: skill, start: 10, max: 100, grades: [F, D, C, B, A, S] }
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
      bands: { 0: Hostile, 10: Wary, 35: Friendly, 65: Close, 90: Devoted }
    trust:
      start: 10
      narrator: 5
      bands: { 0: Suspicious, 30: Willing, 60: Trusting, 90: Unshakeable }
  people:
    marta:
      name: Marta
      desc: Keeps the Crooked Lantern. Hears everything, repeats what she likes.
      schedule:
        - { at: inn }
    aldous:
      name: Brother Aldous
      desc: The village priest. Kind, tired, and afraid of what's waking in the barrow.
      schedule:
        - { when: "between(hour, 6, 20)", at: temple }
        - { at: inn }
    wren:
      name: Wren
      desc: A ranger who works the forest road. Competes for the same bounties — and keeps secrets.
      schedule:
        - { when: "between(hour, 7, 18)", at: forest_road }
        - { at: inn }
    hesk:
      name: Guildmaster Hesk
      desc: Runs the adventurers' guild. Pays well, forgives nothing.
      schedule:
        - { when: "between(hour, 8, 20)", at: guild_hall }
`,
    },
    {
      label: "world",
      yaml: `locations:
  inn:
    name: The Crooked Lantern
    desc: A smoky inn with a hearth, a notice board and rooms upstairs.
    indoors: true
    exits: [village_square]
    travel: 2
    board: true
  village_square:
    name: Village Square
    desc: A well, a market, the temple steps and the guild's iron sign.
    exits: [inn, market, temple, guild_hall, forest_road]
    travel: 5
  market:
    name: Market Stalls
    desc: Herbs, draughts, arrows and second-hand gear.
    exits: [village_square]
  temple:
    name: Temple of the Dawn
    desc: Cold stone, warm candles. Brother Aldous tends both.
    indoors: true
    exits: [village_square]
  guild_hall:
    name: Adventurers' Guild
    desc: Bounty boards, a training yard and Hesk's ledger.
    indoors: true
    exits: [village_square]
    board: true
  forest_road:
    name: The Forest Road
    desc: A rutted road under old pines. Wolves, bandits, and worse after dark.
    exits: [village_square, old_bridge, barrow_ruins]
    travel: 40
  old_bridge:
    name: The Old Bridge
    desc: A mossy stone bridge over a fast river — a natural place for a toll, or an ambush.
    exits: [forest_road]
    travel: 20
  barrow_ruins:
    name: The Barrow
    desc: A grassy mound ringed with standing stones. The air is colder near the door.
    exits: [forest_road]
    travel: 30

items:
  short_sword: { name: Short sword, bonus: { blades: 10 } }
  longbow: { name: Longbow, bonus: { archery: 15 } }
  lockpicks: { name: Lockpicks, uses: 5, bonus: { stealth: 10 } }
  holy_symbol: { name: Holy symbol, bonus: { spirit: 2 } }
  healing_draught: { name: Healing draught, uses: 1, use: { label: Drink a healing draught, hp: +20, remove_condition: [bleeding] } }
  mana_tonic: { name: Mana tonic, uses: 1, use: { label: Drink a mana tonic, mana: +15 } }
  antidote: { name: Antidote, uses: 1, use: { label: Drink the antidote, remove_condition: [poisoned] } }
  rations: { name: Rations, uses: 1, use: { label: Eat a ration, stamina: +30 } }
  torch: { name: Torch, keep: true, bonus: { survival: 5 } }
  chainmail: { name: Chainmail, desc: "Every blow to the body lands 2 lighter — but it clinks.", armor: { hp: 2 }, bonus: { stealth: -10 } }
  wolf_pelt: { name: Wolf pelt }

# Statuses work on {{user}} and on whoever they're fighting (inflict:). rounds: how long in a fight;
# lasts: how long outside one; dot: damage each round (or turn); skip: a chance to lose the turn.
conditions:
  poisoned: { label: Poisoned, tone: bad, narrator: true, rounds: 3, lasts: 2h, every: turn, dot: 2, stat: hp, bonus: { might: -1, agility: -1 } }
  bleeding: { label: Bleeding, tone: bad, narrator: true, lasts: 1h, every: turn, dot: 2, stat: hp }
  stunned: { label: Stunned, tone: bad, rounds: 1, skip: true }
  chilled: { label: Grave-chilled, tone: bad, rounds: 2, skip: 35, bonus: { agility: -2 } }
  guarded: { label: Shield up, tone: good, rounds: 2, armor: { hp: 4 } }
  hasted: { label: Hasted, tone: good, bonus: { agility: 3 } }
  blessed: { label: Blessed, tone: good, bonus: { spirit: 2, persuasion: 10 } }
  inspired: { label: Inspired, tone: good, bonus: { might: 2 } }
  exhausted: { label: Exhausted, tone: bad, narrator: true, bonus: { might: -2, agility: -2 } }
`,
    },
    {
      label: "actions",
      yaml: `actions:
  rest:
    label: Take a room for the night (5g)
    group: Rest
    at: inn
    when: gold >= 5
    say: "*I pay for a room and sleep.*"
    time: 480
    effects: { gold: -5, hp: +40, stamina: +100, mana: +30, remove_condition: [exhausted] }
  pay_guards:
    label: Settle up with the caravan guards (10g)
    group: Social
    at: inn
    when: "flag('owes_the_guards') and gold >= 10"
    say: "*I count ten gold onto the guards' table and we're square.*"
    effects: { gold: -10, flags: { owes_the_guards: false }, hint: "The guards stop watching {{user}} quite so closely." }
  fair_race:
    label: Three-legged race at the fair with {target}
    group: Social
    at: village_square
    per_person: true
    when: "weekday == 'Sat' and between(hour, 10, 16)"
    say: "*I tie my ankle to {target}'s for the fair's three-legged race.*"
    time: 30
    check: { chance: "30 + agility * 4 + target.trust / 4", label: Agility }
    success: { gold: +5, xp: +5, rel: { target: { trust: +5 } }, hint: "{{user}} and {target} win the fair's ribbon and a purse of coppers." }
    fail: { stamina: -10, rel: { target: { trust: +1 } }, hint: "A tangle of legs in the mud, and the whole square laughing." }
  rumours:
    label: Listen for rumours
    group: Social
    at: inn
    say: "*I nurse a drink and listen.*"
    time: 30
    check: { chance: "30 + persuasion / 2 + spirit * 3", label: Persuasion }
    success: { xp: +5, hint: "A useful rumour: a bounty, a lead on the barrow, or a warning about the road." }
    fail: { hint: "Nothing but gossip about the miller's goat." }
  spar:
    label: Spar in the training yard
    group: Guild
    at: guild_hall
    say: "*I pick up a practice blade and find a sparring partner.*"
    time: 60
    cost: { stamina: -20 }
    check: { chance: "35 + blades / 2 + might * 3", label: Blades }
    success: { xp: +15 }
    fail: { xp: +5, hp: -4 }
  study:
    label: Study old texts
    group: Temple
    at: temple
    say: "*I ask Brother Aldous for the old texts and read by candlelight.*"
    time: 120
    check: { chance: "35 + lore / 2 + wits * 3", label: Lore }
    success: { xp: +10, arcana: +1, hint: "The texts speak of the barrow-king's oath and the dawn-blessing that broke him once before." }
    fail: { mana: +5, hint: "Dry reading, but the quiet helps." }
  holy_symbol:
    label: Take a holy symbol (donate 25g)
    group: Temple
    at: temple
    when: gold >= 25 and not has('holy_symbol')
    say: "*I make a donation and accept a holy symbol from Brother Aldous.*"
    effects: { gold: -25, give: holy_symbol, rel: { aldous: { trust: +3 } } }
  pray:
    label: Pray for a blessing (donate 5g)
    group: Temple
    at: temple
    when: gold >= 5
    say: "*I leave a few coins and kneel.*"
    time: 20
    effects: { gold: -5, add_condition: { blessed: 240 }, remove_condition: [poisoned] }
  buy_draught:
    label: Buy a healing draught (12g)
    group: Market
    at: market
    when: gold >= 12
    say: "*I buy a healing draught.*"
    effects: { gold: -12, give: healing_draught }
  buy_tonic:
    label: Buy a mana tonic (15g)
    group: Market
    at: market
    when: gold >= 15
    say: "*I buy a mana tonic.*"
    effects: { gold: -15, give: mana_tonic }
  buy_antidote:
    label: Buy an antidote (8g)
    group: Market
    at: market
    when: gold >= 8
    say: "*I buy an antidote.*"
    effects: { gold: -8, give: antidote }
  buy_bow:
    label: Buy a longbow (40g)
    group: Market
    at: market
    when: gold >= 40 and not has('longbow')
    say: "*I buy the longbow.*"
    effects: { gold: -40, give: longbow }
  buy_mail:
    label: Buy a chainmail shirt (45g)
    group: Market
    at: market
    when: gold >= 45 and not has('chainmail')
    say: "*I haggle over a second-hand mail shirt.*"
    effects: { gold: -45, give: chainmail }
  buy_picks:
    label: Buy lockpicks (20g)
    group: Market
    at: market
    when: gold >= 20 and not has('lockpicks')
    say: "*I buy a set of lockpicks.*"
    effects: { gold: -20, give: lockpicks }
  sell_pelt:
    label: Sell a wolf pelt (10g)
    group: Market
    at: market
    when: has('wolf_pelt')
    say: "*I sell a wolf pelt.*"
    effects: { take: wolf_pelt, gold: +10 }
  odd_jobs:
    label: Do odd jobs around the square
    group: Work
    at: village_square
    say: "*I ask around for work — hauling, mending, minding stalls.*"
    time: 120
    cost: { stamina: -15 }
    check: { chance: "45 + might * 3", label: Might }
    success: { gold: +8, xp: +5 }
    fail: { gold: +3 }
  notice_board:
    label: Read the notice board
    group: Explore
    at: village_square
    say: "*I read the notices pinned by the well.*"
    time: 10
    check: { chance: "40 + lore / 2 + wits * 3", label: Lore }
    success: { xp: +5, hint: "A notice worth following: a bounty, a missing person, or a warning about the barrow." }
    fail: { hint: "Lost cats and grain prices." }
  forage:
    label: Forage along the road
    group: Explore
    at: forest_road
    say: "*I search the roadside for herbs and game.*"
    time: 45
    cost: { stamina: -10 }
    check: { chance: "35 + survival / 2 + wits * 2", label: Survival }
    success: { give: rations, xp: +5 }
    fail: { start_encounter: wolves }
  hunt_wolves:
    label: Track the wolf pack
    group: Explore
    at: forest_road
    requires: { quest: wolf_bounty }
    say: "*I follow the wolf tracks off the road.*"
    time: 30
    effects: { start_encounter: wolves }
  cross_bridge:
    label: Cross the old bridge
    group: Explore
    at: old_bridge
    say: "*I walk onto the bridge.*"
    time: 5
    effects: { start_encounter: bandits }
  talk:
    label: Talk to {target}
    group: Social
    per_person: true
    say: "*I talk with {target} for a while.*"
    time: 15
    effects: { rel: { target: { affinity: +2 } } }
  persuade:
    label: Ask {target} for a favour
    group: Social
    per_person: true
    say: "*I ask {target} for help.*"
    time: 15
    check: { chance: "20 + persuasion / 2 + spirit * 3 + target.trust / 4", label: Persuasion }
    success: { rel: { target: { trust: +4 } }, hint: "{target} agrees to help, in their own way." }
    fail: { rel: { target: { affinity: -2 } }, hint: "{target} turns it down." }
`,
    },
    {
      label: "encounters",
      yaml: `# Fights are small puzzles: each foe has more than one way to beat it, and your
# own abilities (spells, techniques) are offered alongside these moves.
encounters:
  wolves:
    name: The Wolf Pack
    desc: Grey wolves circle {{user}} on the forest road.
    tags: [violence]
    goal: Cut the pack down, or break its nerve and send it running
    foe:
      name: Grey Wolves
      stats:
        hp: { label: HP, start: 24, max: 24 }
        nerve: { label: Nerve, start: 12, max: 12 }
    actions:
      strike:
        label: Strike
        tags: [melee]
        cost: { stamina: -8 }
        check: { chance: "35 + blades / 2 + might * 3", label: Blades }
        crit_success: { foe: { hp: "-(10 + might * 2)", nerve: -3 } }
        success: { foe: { hp: "-(6 + might)" } }
        fail: { stamina: -5 }
      shoot:
        label: Loose an arrow
        when: has('longbow')
        cost: { stamina: -4 }
        check: { chance: "30 + archery / 2 + agility * 3", label: Archery }
        success: { foe: { hp: "-(5 + agility * 2)" } }
        fail: { hint: "The arrow thuds into a tree." }
      brandish:
        label: Brandish the torch
        when: has('torch')
        check: { chance: "40 + spirit * 4", label: Spirit }
        success: { foe: { nerve: -6 } }
        fail: { hint: "The wolves flinch, then close in again." }
      climb:
        label: Climb a tree
        cost: { stamina: -12 }
        check: { chance: "10 + survival / 2 + agility * 2", label: Survival }
        success: { end: escaped }
        fail: { hp: -6, hint: "A wolf catches {{user}}'s boot and drags them back down." }
    foe_moves:
      bite: { desc: "Lunges and bites", weight: 2, hp: -6 }
      pack: { desc: "Three of them snap at once", weight: 1, hp: -2, hits: 3 }
      hamstring: { desc: "Goes for the legs", weight: 1, hp: -3, add_condition: { bleeding: 30 } }
      howl: { desc: "Howls to rally the pack", weight: 1, stamina: -6 }
    end_when:
      won: foe.hp <= 0
      scattered: foe.nerve <= 0
      beaten: hp <= 0
    labels: { won: The pack is dead, scattered: The pack runs, escaped: You got up a tree, beaten: The wolves dragged you down }
    outcomes:
      won: { xp: +40, give: wolf_pelt }
      scattered: { xp: +30 }
      escaped: { stamina: -10, hint: "{{user}} waits in the branches until the pack loses interest." }
      beaten: { set: { hp: 1 }, gold: "-min(gold, 10)", hint: "{{user}} comes to on the road, mauled and lighter in the purse — a passing cart picked them up." }

  bandits:
    name: Toll at the Old Bridge
    desc: Bandits block the bridge and want gold to let {{user}} pass.
    tags: [violence]
    goal: Get across — pay, talk them out of it, slip past, or put them down
    foe:
      name: Bandit Captain
      armor: { hp: 3 }            # a mail shirt: every blow lands 3 lighter
      stats:
        resolve: { label: Resolve, start: 16, max: 16 }
        hp: { label: HP, start: 30, max: 30 }
    actions:
      pay:
        label: Pay the toll (15g)
        when: gold >= 15
        effects: { gold: -15, end: paid }
      parley:
        label: Talk them down
        check: { chance: "30 + persuasion / 2 + spirit * 3", label: Persuasion }
        success: { foe: { resolve: -6 } }
        fail: { foe: { resolve: +2 }, hint: "The captain laughs it off." }
      intimidate:
        label: Intimidate
        check: { chance: "25 + might * 4 + level * 2", label: Might }
        success: { foe: { resolve: -8 } }
        fail: { hint: "Nobody's impressed." }
      fight:
        label: Fight
        tags: [melee]
        cost: { stamina: -8 }
        check: { chance: "35 + blades / 2 + might * 3", label: Blades }
        success: { foe: { hp: "-(6 + might)", resolve: -2 } }
        fail: { hp: -5 }
      bash:
        label: Shield-bash the captain
        tags: [melee]
        cost: { stamina: -10 }
        check: { chance: "30 + might * 4", label: Might }
        success: { inflict: [stunned], foe: { resolve: -2 }, hint: "The captain staggers, ears ringing." }
        fail: { stamina: -4, hint: "{{user}} bounces off his shield." }
      sneak:
        label: Slip past in the reeds
        cost: { stamina: -6 }
        check: { chance: "25 + stealth / 2 + agility * 3", label: Stealth }
        success: { end: slipped_by }
        fail: { foe: { resolve: +3 }, hint: "A sentry spots {{user}} in the reeds." }
    foe_moves:
      threaten: { desc: "Threatens {{user}}", weight: 2, stamina: -4 }
      swing: { desc: "Swings a cudgel", weight: 2, hp: -6 }
      shield_up: { desc: "Sets his shield and waits", weight: 1, inflict: { guarded: 2 } }
      call_out: { desc: "Calls more bandits from the trees", weight: 1, foe: { resolve: +3 } }
    end_when:
      backed_down: foe.resolve <= 0
      won: foe.hp <= 0
      beaten: hp <= 0
    labels: { backed_down: The bandits let you pass, won: The bandits are beaten, paid: You paid your way across, slipped_by: You slipped past unseen, beaten: The bandits beat you and took your purse }
    outcomes:
      backed_down: { xp: +50 }
      won: { xp: +60, gold: +20 }
      paid: { xp: +5 }
      slipped_by: { xp: +30 }
      beaten: { set: { hp: 1 }, gold: "-min(gold, 20)" }

  wight:
    name: The Barrow-Wight
    desc: Something in old armour climbs out of the barrow, cold light where its eyes should be.
    tags: [violence, horror]
    goal: Destroy it, or break the oath that binds it with a dawn-blessing
    foe:
      name: Barrow-Wight
      armor: { hp: 3 }            # rusted plate: steel bites less, the rite doesn't care
      stats:
        hp: { label: HP, start: 45, max: 45 }
        oath: { label: Oath, start: 20, max: 20 }
    actions:
      strike:
        label: Strike
        tags: [melee]
        cost: { stamina: -8 }
        check: { chance: "30 + blades / 2 + might * 3", label: Blades }
        success: { foe: { hp: "-(5 + might) * (cond('blessed') ? 2 : 1)" } }
        fail: { hp: -4 }
      rite:
        label: Speak the dawn-rite
        when: has('holy_symbol') or cond('blessed')
        why_not: "Needs a holy symbol or a blessing"
        check: { chance: "25 + lore / 2 + spirit * 4", label: Lore }
        success: { foe: { oath: -8 } }
        fail: { mana: -4 }
      flee:
        label: Run for the treeline
        cost: { stamina: -15 }
        check: { chance: "35 + agility * 4", label: Agility }
        success: { end: fled }
        fail: { hp: -6 }
    foe_moves:
      grave_chill: { desc: "Breathes a grave-chill", weight: 2, stamina: -12, add_condition: [chilled] }
      blade: { desc: "Swings a rusted blade", weight: 2, hp: -8 }
      dread: { desc: "Fills the air with dread", weight: 1, mana: -5 }
    end_when:
      destroyed: foe.hp <= 0
      released: foe.oath <= 0
      beaten: hp <= 0
    labels: { destroyed: The wight falls apart, released: The oath breaks and the wight rests, fled: You ran, beaten: The wight's chill takes you }
    outcomes:
      destroyed: { xp: +100, gold: +40, flags: { barrow_quiet: true } }
      released: { xp: +140, flags: { barrow_quiet: true }, rel: { aldous: { trust: +20 } } }
      fled: { stamina: -20 }
      beaten: { set: { hp: 1 }, add_condition: { exhausted: 480 }, hint: "{{user}} wakes at the temple; Brother Aldous found them at the barrow's edge." }
`,
    },
    {
      label: "quests",
      yaml: `# Bounties on the guild board, favours from the villagers, and the barrow — which comes
# looking for {{user}} whether they take it on or not.
quests:
  wolf_bounty:
    name: Thin the wolf pack
    kind: bounty
    giver: hesk
    board: true
    desc: Wolves have been taking travellers on the forest road.
    days: 4
    goals:
      - { text: Kill the pack or send it running, on: { encounter: wolves, outcome: [won, scattered] } }
    reward: { gold: 30, xp: 20, rel: { hesk: { trust: 5 } } }
    failure: { rel: { hesk: { trust: -5 } } }
    stakes: Another traveller goes missing on the road, and Hesk marks {{user}} as unreliable.
    repeat: 7
  bridge_bounty:
    name: Open the old bridge
    kind: bounty
    giver: hesk
    board: true
    when: "level >= 2"
    desc: Bandits are charging a toll at the old bridge. Get it open again — however you like.
    days: 5
    goals:
      - { text: Make the bandits back down, or beat them, on: { encounter: bandits, outcome: [backed_down, won] } }
    reward: { gold: 40, xp: 30, rel: { hesk: { trust: 8 } } }
    failure: { rel: { hesk: { trust: -8 } } }
    stakes: Trade dries up while the toll stands.
  marta_herbs:
    name: Herbs for the stew pot
    kind: favour
    giver: marta
    desc: Marta's out of wild garlic and thyme, and the stew won't make itself.
    days: 2
    goals:
      - { text: Forage along the forest road, count: 2, on: forage }
    reward: { gold: 6, give: rations, rel: { marta: { affinity: 6, trust: 4 } } }
    failure: { rel: { marta: { affinity: -4 } } }
    remember: { failed: "{{user}} promised herbs for the stew and came back empty-handed." }
    repeat: 3
  barrow_oath:
    name: The barrow-king's oath
    kind: main
    giver: aldous
    auto: true
    when: "front_stage('barrow_wakes') >= 1"
    desc: The barrow's dead are walking. Brother Aldous begs {{user}} to end it — by steel or by rite.
    goals:
      - { text: Learn how the oath was broken before, when: "codex('wights')", optional: true }
      - { text: Lay the barrow-wight to rest, when: "flag('barrow_quiet')" }
    fail: "front('barrow_wakes') >= 100"
    reward: { xp: 100, gold: 60, perk_points: 1, rel: { aldous: { trust: 15 } } }
    failure: { rel: { aldous: { trust: -10 } } }
    stakes: If the barrow fully wakes, the wight comes for the village itself.
`,
    },
    {
      label: "journal",
      yaml: `# The player's own moves. Firebolt is known once arcana is high enough; the
# others are taught by perks. Second Wind everyone knows.
abilities:
  second_wind:
    name: Second Wind
    desc: Grit your teeth and push through
    cost: { stamina: -15 }
    hp: "+(8 + might * 2)"
    per_encounter: 1
  firebolt:
    name: Firebolt
    desc: A bolt of fire from the palm
    where: encounter
    known: "arcana >= 30"
    cost: { mana: -6 }
    check: { chance: "35 + arcana / 2 + wits * 3", label: Arcana }
    success: { harm: "8 + arcana / 5" }
    fail: { hint: "The fire gutters out in {{user}}'s hand." }
  mend:
    name: Mend
    desc: Knit flesh with a whispered word
    cost: { mana: -8 }
    hp: "+(10 + arcana / 4)"
    remove_condition: [bleeding]
  haste:
    name: Haste
    desc: The world slows; {{user}} doesn't
    cost: { mana: -5 }
    add_condition: { hasted: 3 }
    per_encounter: 1
  battle_cry:
    name: Battle Cry
    desc: A roar that steadies the arm
    where: encounter
    cost: { stamina: -8 }
    add_condition: { inspired: 3 }
    per_encounter: 1
  flurry:
    name: Flurry
    desc: Three quick cuts — deadly on the unarmored, wasted on plate
    where: encounter
    known: false
    tags: [melee]
    cost: { stamina: -10 }
    check: { chance: "40 + blades / 2 + agility * 3", label: Blades }
    success: { harm: "3 + agility / 2", hits: 3 }
    fail: { stamina: -4 }
    per_encounter: 2
  venomed_edge:
    name: Venomed Edge
    desc: A nick that keeps on hurting
    where: encounter
    known: false
    tags: [melee]
    cost: { stamina: -6 }
    check: { chance: "35 + blades / 2 + agility * 3", label: Blades }
    success: { harm: 2, inflict: { poisoned: 3 } }
    per_encounter: 1
  smite:
    name: Smite
    desc: The dawn's light through a holy symbol — a quarter of whatever stands against you, armor or not
    where: encounter
    requires: { has: holy_symbol }
    cost: { mana: -10 }
    check: { chance: "30 + spirit * 5 + lore / 4", label: Spirit }
    success: { harm: "25%", pierce: all }
    fail: { hint: "The light flickers and dies." }
    per_encounter: 1
  blood_price:
    name: Blood Price
    desc: Bleed a little, and the magic answers
    known: false
    cost: { hp: -8 }
    mana: +14
    per_day: 2
  vanish:
    name: Vanish
    desc: Step into a shadow and out of the fight
    where: encounter
    cost: { stamina: -10 }
    per_day: 1
    check: { chance: "30 + stealth / 2 + agility * 3", label: Stealth }
    success: { end: escaped }
    fail: { hint: "{{user}} steps into the shadow — and is still seen." }

# One point per level; each point offers three perks to choose from.
perks:
  points: perk_points
  pick: 3
  keen_eye:
    name: Keen Eye
    desc: Slow breath, steady arm — the arrow goes where it's looked at.
    tags: [archery]
    bonus: { archery: 5 }
  blade_dancer:
    name: Blade Dancer
    desc: Fights like a duelist while there's breath in them — and learns the Flurry.
    tags: [blades]
    abilities: [flurry]
    edge: { blades: 15, when: "stamina >= 50" }
    narrator: "{{user}} moves with a duelist's economy — no wasted motion."
  hedge_mage:
    name: Hedge Mage
    desc: A village witch's tricks.
    tags: [arcana]
    abilities: [mend, haste]
    bonus: { arcana: 5 }
  arcane_scholar:
    name: Arcane Scholar
    desc: Mana returns faster; spells come easier — and the old blood-magic opens up.
    requires: "arcana >= 25"
    abilities: [blood_price]
    bonus: { arcana: 10 }
    rule: { gains: { mana: "+50%" } }
  shadow_step:
    name: Shadow Step
    desc: The dark is a friend, and so is a poisoned blade.
    tags: [stealth]
    abilities: [vanish, venomed_edge]
    edge: { stealth: 15, when: "hour >= 20 or hour < 5" }
  battle_hardened:
    name: Battle-Hardened
    desc: Wounds land lighter.
    rule: { losses: { hp: "-20%" } }
    narrator: "{{user}} carries old scars and shrugs off blows that would fell others."
  lucky:
    name: Lucky
    desc: Once a day, fortune turns a failure around.
    rule: { reroll: { per_day: 1 } }
  silver_tongue:
    name: Silver Tongue
    desc: Even a bad pitch half-works.
    bonus: { persuasion: 5 }
    rule: { soften: { stats: [persuasion], per_day: 2 } }
  woodwise:
    name: Woodwise
    desc: At home under the pines.
    bonus: { survival: 15 }
    edge: { archery: 10, when: "at('forest_road')" }
    narrator: "Animals read {{user}} as one of their own; birds don't go quiet when they pass."
  warlord:
    name: Warlord's Voice
    desc: Commands, and people listen.
    abilities: [battle_cry]
    bonus: { persuasion: 5 }
  sunderer:
    name: Sunderer
    desc: Knows where plate is thin.
    tags: [blades]
    rule: { pierce: { amount: 3, stats: [blades] } }
    narrator: "{{user}} fights like someone who has opened armor before — at the joints."
  berserker:
    name: Berserker
    desc: Strongest when hurt.
    edge: { might: 3, when: "hp < 15" }
    drawback: { desc: "Stamina burns faster", losses: { stamina: "+25%" } }
    excludes: [battle_hardened]

codex:
  village: { title: The Village, category: Places, text: "A frontier village at the edge of the old woods, too small for a wall and too stubborn to leave.", unlock: "location == 'village_square'" }
  road: { title: The Forest Road, category: Places, text: "The only road out. Wolves by day, bandits at the bridge, worse at night.", unlock: "location == 'forest_road'" }
  barrow: { title: The Barrow, category: Places, text: "The grave of the barrow-king, who swore an oath to guard the valley and kept it past death.", unlock: "location == 'barrow_ruins'" }
  wights: { title: Barrow-Wights, category: Threats, text: "Oath-bound dead. Steel hurts them; a dawn-blessing hurts them more; breaking the oath frees them.", unlock: "flag('barrow_quiet') or level >= 3" }

feats:
  first_blood: { name: First blood, desc: "Win your first fight.", unlock: "xp >= 40 or level >= 2" }
  pack_breaker: { name: Pack-breaker, desc: "Clear the wolf bounty.", unlock: "quest_done('wolf_bounty')", reward: { perk_points: +1 } }
  sellsword: { name: Sellsword, desc: "Finish three quests.", unlock: "quests_done() >= 3", reward: { xp: +40 } }
  oathbreaker: { name: Oathbreaker, desc: "Lay the barrow-wight to rest.", unlock: "flag('barrow_quiet')", reward: { xp: +50, perk_points: +1 } }
`,
    },
    {
      label: "rules",
      yaml: `flags:
  barrow_quiet: { start: false }

triggers:
  fight_starts:
    when_scene: "A fight has broken out and {{user}} is in it"
    do: { start_encounter: wolves }
  level_up:
    when: xp >= level * 100
    repeat: true
    do:
      set: { xp: 0 }
      level: +1
      perk_points: +1
      hp: +15
      hint: "Level up! {{user}} feels stronger — and a new perk is theirs to choose."
  worn_out:
    when: stamina <= 0
    do: { add_condition: { exhausted: 240 }, hint: "{{user}} is running on nothing." }
`,
    },
    {
      label: "story",
      yaml: `secrets:
  wren_oath:
    about: Wren
    cue: "Wren never goes near the barrow and touches an old ring whenever it's mentioned."
    tell: exists
    stages:
      - when: "rel('wren', 'trust') >= 50"
        text: "Wren is the barrow-king's last descendant. The ring is his seal — and the key to breaking his oath."
      - when: "rel('wren', 'trust') >= 80"
        text: "Wren has been feeding the wight's oath with their own blood each new moon, believing it keeps the valley safe."

fronts:
  barrow_wakes:
    label: The barrow wakes
    per_day: 10
    story:
      "{{user}} disturbs the barrow or its dead": 15
      "{{user}} brings a blessing or the dawn-rite to the barrow": -10
    stages:
      - at: 30
        hint: "Livestock won't graze near the forest road anymore."
        backstage: "The wight has begun walking the barrow's edge at night."
        surface: "A traveller stumbles into the inn, pale, babbling about cold light in the trees."
        news: "Something walks near the barrow at night."
      - at: 70
        hint: "Frost on the temple steps in summer."
        backstage: "The wight's oath has turned to the village itself."
        surface: "The barrow-wight comes for whoever is nearest the road."
        news: "The barrow-wight walked."
        do: { start_encounter: wight }

random_events:
  pace: { per_day: 20, jitter: 0.3, rest_days: 2, omen_at: 80 }
  events:
    caravan:
      label: A merchant caravan
      omen: "Wheel ruts and fresh dung on the road — traders are coming."
      text: "A merchant caravan stops in the square with goods from the city."
      cooldown: 6
      do: { gold: +5 }
    storm:
      label: A storm
      omen: "The wind smells of iron and the birds have gone quiet."
      text: "A storm rolls in off the hills and the road turns to mud."
      cooldown: 8
      do: { stamina: -10 }

live_choices:
  label: Right now
  count: 3
  when: not in_encounter
  tags:
    daring:
      desc: "A bold, risky or athletic move"
      check: { chance: "35 + agility * 4", label: Agility }
      success: { xp: +10 }
      fail: { hp: -5 }
    charm:
      desc: "Winning someone here over, bargaining or talking"
      per_person: true
      check: { chance: "30 + persuasion / 2 + spirit * 3", label: Persuasion }
      success: { rel: { target: { affinity: +3, trust: +2 } } }
      fail: { rel: { target: { affinity: -2 } } }
    clever:
      desc: "Noticing, recalling lore, working something out"
      check: { chance: "30 + lore / 2 + wits * 3", label: Lore }
      success: { xp: +10 }
      fail: { stamina: -5 }
    careful:
      desc: "The cautious option: waiting, watching, backing off"
      effects: { stamina: +5 }
`,
    },
  ],
};
