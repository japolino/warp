import type { Template } from "./index.js";

// Survival life-sim: pressure meters described in
// words, letter-graded skills, a clock that matters, and meters that feed
// into each other.
export const hometown: Template = {
  id: "hometown",
  name: "Hometown (life-sim)",
  blurb: "Survival life-sim: Pain, Arousal, Fatigue, Stress, Trauma, Control and Allure described in words, graded skills, a calendar with weather and temperature, clothing that matters, townsfolk on schedules with favours to ask (and long memories), odd jobs on the café corkboard, a mugging encounter, and meters that feed into each other.",
  parts: [
    {
      label: "core",
      yaml: `name: Hometown
description: A survival life-sim in a small coastal university town.

player:
  age: 20                 # a university student

clock:
  start: Mon 07:00
  date: Sep 4
  minutes_per_action: 15
  narrator_max: 240

start:
  location: apartment
  items: { phone: 1, keys: 1 }

hud:
  currency: "£"
  bars: [pain, arousal, fatigue, stress, trauma, control, allure]

narration:
  notes: >-
    Describe {{user}}'s condition through the state lines, not numbers.
    High fatigue, stress or trauma should visibly colour their behaviour.
`,
    },
    {
      label: "stats",
      yaml: `stats:
  # Every meter runs 0–100, so hand edits and author formulas stay readable.
  pain:
    kind: meter
    good: low
    per_hour: -6
    narrator: 20
    bands:
      0: You feel okay.
      15: You're a little sore.
      40: You're in pain.
      65: You're in agony!
  arousal:
    kind: meter
    good: none
    start: 0
    per_hour: -3
    narrator: 25
    color: "#e0569b"
    bands:
      0: You feel cold.
      20: You feel warm.
      50: You feel aroused.
      80: You're shaking with arousal.
  fatigue:
    kind: meter
    good: low
    start: 8
    per_hour: 3             # about a point every 20 minutes awake
    narrator: 15
    bands:
      0: You are wide awake.
      30: You are alert.
      60: You are tired.
      85: You are exhausted.
  stress:
    kind: meter
    good: low
    start: 0
    per_hour: -0.4
    narrator: 15
    bands:
      0: You are calm.
      30: You are stressed.
      60: You are strained.
      80: You are distressed.
  trauma:
    kind: meter
    good: low
    start: 0
    narrator: 8
    bands:
      0: You feel fine.
      20: You are uneasy.
      50: You are nervous.
      80: You feel numb.
  control:
    kind: meter
    good: high
    start: 100
    narrator: 25
    bands:
      0: You are terrified.
      20: You are scared.
      40: You are insecure.
      70: You are confident.
  allure:
    kind: meter
    good: none
    start: 8
    narrator: 15
    bands:
      0: You don't stand out.
      10: You attract glances.
      30: You stand out.
      60: You look like you want trouble.
  money:
    kind: money
    start: 60
    narrator: 200

  athletics:   { kind: skill, max: 100, start: 10, grades: [F, F+, D, D+, C, C+, B, B+, A, A+, S] }
  swimming:    { kind: skill, max: 100, start: 5,   grades: [F, F+, D, D+, C, C+, B, B+, A, A+, S] }
  dancing:     { kind: skill, max: 100, start: 0,   grades: [F, F+, D, D+, C, C+, B, B+, A, A+, S] }
  skulduggery: { kind: skill, max: 100, start: 0,   grades: [F, F+, D, D+, C, C+, B, B+, A, A+, S] }
  tending:     { kind: skill, max: 100, start: 5,   grades: [F, F+, D, D+, C, C+, B, B+, A, A+, S] }
  studies:     { kind: skill, max: 100, start: 20,  grades: [F, E, D, C, B, A, "A*"] }
  crime:
    kind: hidden
    good: low
    per_hour: -0.04
`,
    },
    {
      label: "people",
      yaml: `relationships:
  open: true
  stats:
    love:
      start: 0
      narrator: 5
      bands: { 0: Indifferent, 10: Fond, 40: Smitten, 75: In love }
    lust:
      start: 0
      narrator: 8
      good: none
      bands: { 0: Uninterested, 20: Curious, 50: Wanting, 80: Obsessed }
    trust:
      start: 10
      narrator: 5
      bands: { 0: Distrustful, 15: Wary, 45: Trusting, 80: Devoted }
    dominance:
      start: 0
      min: -100
      max: 100
      good: none
      narrator: 5
      bands: { -100: Submissive, -30: Deferential, -10: Even, 10: Assertive, 40: Domineering }
  # Townsfolk keep their own hours; they show up as "here" when you share a place.
  people:
    jo:
      name: Jo
      desc: Runs the café on the High Street. Brisk, fair, secretly kind.
      schedule:
        - { when: "between(hour, 7, 18) and weekday != 'Sun'", at: high_street }
        - { when: "(weekday == 'Fri' or weekday == 'Sat') and (hour >= 21 or hour < 2)", at: the_strip }
    professor_ward:
      name: Professor Ward
      desc: Your tutor. Exacting, dry, notices everything.
      schedule:
        - { when: "between(hour, 9, 17) and weekday != 'Sat' and weekday != 'Sun'", at: campus }
    dex:
      name: Dex
      desc: Works the docks at night. Knows people who know people.
      schedule:
        - { when: "hour >= 19 or hour < 4", at: docks }
`,
    },
    {
      label: "world",
      yaml: `# Exploring the rougher edges of town can turn up places that aren't on the map yet.
discovery:
  at: [docks, park, the_strip]
  chance: 20
  max: 8
  guide: "Small, grounded places in a run-down seaside town: a back-alley bar, a bait shop, an abandoned pier, a late-night launderette."

# {{user}}'s body, as the story changes it (haircuts, tattoos, lasting marks…).
body:
  parts:
    hair: { color: brown, length: shoulder-length }
    eyes: { color: hazel }
    skin: { marks: none }
  hidden_by: { chest: [top, under_top], hips: [bottom, under_bottom] }

weather:
  temps: { spring: 12, summer: 21, autumn: 11, winter: 3 }

locations:
  apartment:
    name: Your Apartment
    desc: A cramped one-bedroom above a chip shop. Thin walls, a lock that sticks.
    indoors: true
    exits: [high_street]
  high_street:
    name: High Street
    desc: Shops, a café with a corkboard of odd jobs in the window, a busy bus stop. Crowded by day, emptier at night.
    exits: [apartment, campus, park, docks, the_strip]
    board: true
  campus:
    name: University Campus
    desc: Lecture halls, a library, a gym with a pool.
    indoors: true
    exits: [high_street]
    travel: 15
  park:
    name: Seaview Park
    desc: Lawns, a duck pond, dense woods at the far end.
    exits: [high_street]
  docks:
    name: The Docks
    desc: Warehouses and cargo ships. Rough, and rougher after dark.
    exits: [high_street]
    travel: 20
  the_strip:
    name: The Strip
    desc: Bars and clubs, neon and noise until dawn.
    exits: [high_street]

items:
  phone:
    name: Phone
    keep: true
    use: { label: Call a cab home (£12), when: "money >= 12 and not at('apartment')", time: 20, money: -12, stress: -3, move: apartment, hint: "{{user}} calls a cab and rides home." }
  keys:
    name: Apartment keys
    keep: true
    use: { label: Lock yourself in, when: "at('apartment')", time: 5, stress: -4, hint: "The sticky lock finally catches. {{user}} feels a little safer." }
  coffee:
    name: Coffee
    tags: [consumable]
    use: { label: Drink the coffee, time: 10, fatigue: -8, stress: -1 }
  # Clothing: slot, warmth, how revealing, traits.
  t_shirt: { name: T-shirt, slot: top, warmth: 2 }
  hoodie: { name: Hoodie, slot: top, warmth: 6 }
  jeans: { name: Jeans, slot: bottom, warmth: 4 }
  skirt: { name: Short skirt, slot: bottom, warmth: 1, reveal: 3 }
  undershirt: { name: Undershirt, slot: under_top, warmth: 1 }
  underwear: { name: Underwear, slot: under_bottom, warmth: 1 }
  trainers: { name: Trainers, slot: feet, warmth: 1 }
  raincoat: { name: Raincoat, slot: outer, warmth: 4, traits: [rainproof] }
  winter_coat: { name: Winter coat, slot: outer, warmth: 12 }
  swimsuit: { name: Swimsuit, slot: under_bottom, warmth: 0, reveal: 5, traits: [swimwear] }

wardrobe:
  slots: [outer, top, bottom, under_top, under_bottom, feet]
  cover: [top, bottom]
  start: [t_shirt, jeans, undershirt, underwear, trainers]

start:
  items: { hoodie: 1, skirt: 1 }

conditions:
  # bonus: counts in every check that reads those stats while it lasts (negative = a penalty).
  exhausted: { label: Exhausted, tone: bad, desc: Stress builds fast while this tired., bonus: { athletics: -10, studies: -10, dancing: -10 } }
  scared: { label: Scared, tone: bad, desc: Low control — trauma comes to the surface. }
  shaken: { label: Shaken, tone: warn, desc: Recently overwhelmed., bonus: { athletics: -5, skulduggery: -10 } }
  wanted: { label: Wanted, tone: bad, desc: "The police are looking for you — every pickpocket is a bigger risk.", bonus: { skulduggery: -15 } }
  cold: { label: Cold, tone: bad, desc: Underdressed for the weather., bonus: { athletics: -5, dancing: -5 } }
  overheating: { label: Overheating, tone: warn, desc: Overdressed for the weather., bonus: { athletics: -5 } }
  soaked: { label: Soaked, tone: warn, desc: Caught in the rain without a coat., bonus: { allure: -10 } }
  exposed: { label: Exposed, tone: bad, desc: Not decently covered in public — nobody's slipping past unnoticed like this., bonus: { skulduggery: -20 } }
`,
    },
    {
      label: "actions",
      yaml: `actions:
  sleep:
    label: Sleep
    group: Home
    at: apartment
    say: "*I get into bed and sleep.*"
    time: 480
    effects: { fatigue: -100, stress: -15, pain: -30, control: +10 }
  shower:
    label: Shower
    group: Home
    at: apartment
    say: "*I take a long shower.*"
    time: 20
    effects: { stress: -3, arousal: -5 }

  attend_lecture:
    label: Attend lecture
    group: Campus
    at: campus
    when: between(hour, 9, 16) and weekday != 'Sat' and weekday != 'Sun'
    say: "*I head into a lecture and try to focus.*"
    time: 90
    effects: { studies: +1.5, fatigue: +5 }
  study:
    label: Study in the library
    group: Campus
    at: campus
    say: "*I find a quiet corner in the library and study.*"
    time: 60
    check: { chance: 50 + studies / 2 - fatigue / 2 - arousal / 5, label: Studies }
    success: { studies: +1.2, hint: "The material clicks." }
    fail: { studies: +0.3, stress: +2, hint: "The words swim; very little sticks." }
  swim:
    label: Swim laps
    group: Campus
    at: campus
    say: "*I swim laps in the university pool.*"
    time: 45
    check: { chance: 55 + swimming / 2 - fatigue / 3, label: Swimming }
    success: { athletics: +0.4, fatigue: +12, stress: -4, hint: "Smooth, steady laps." }
    fail: { fatigue: +16, stress: +1, hint: "{{user}} swallows half the pool and climbs out spluttering." }

  jog:
    label: Go for a jog
    group: Park
    at: park
    say: "*I go for a jog around the park.*"
    time: 40
    check: { chance: 60 + athletics / 2 - fatigue * 2 / 3, label: Athletics }
    success: { athletics: +1, fatigue: +10, stress: -4 }
    fail: { athletics: +0.4, fatigue: +17, pain: +10, hint: "{{user}} pushes too hard and ends up aching and winded." }

  cafe_shift:
    label: Work a café shift
    group: Work
    at: high_street
    when: between(hour, 7, 18)
    say: "*I put on an apron and work a shift at the café.*"
    time: 240
    check: { chance: 55 + tending / 1.5, label: Tending }
    success: { money: 45 + tending / 2, tending: +1.2, fatigue: +20, flags: { worked: true }, hint: "A smooth shift — good tips." }
    fail: { money: 30, tending: +0.6, fatigue: +22, stress: +6, flags: { worked: true }, hint: "A rough shift: rude customers and a smashed tray." }
  buy_raincoat:
    label: Buy a raincoat (£30)
    group: Shops
    at: high_street
    when: money >= 30 and not has('raincoat')
    say: "*I buy a raincoat.*"
    time: 15
    effects: { money: -30, give: raincoat }
  buy_coat:
    label: Buy a winter coat (£60)
    group: Shops
    at: high_street
    when: money >= 60 and not has('winter_coat')
    say: "*I buy a proper winter coat.*"
    time: 15
    effects: { money: -60, give: winter_coat }
  buy_swimsuit:
    label: Buy a swimsuit (£20)
    group: Shops
    at: high_street
    when: money >= 20 and not has('swimsuit')
    say: "*I pick up a swimsuit.*"
    time: 15
    effects: { money: -20, give: swimsuit }
  buy_coffee:
    label: Buy a coffee to go (£3)
    group: Shops
    at: high_street
    when: money >= 3
    say: "*I grab a coffee to go.*"
    time: 10
    effects: { money: -3, give: coffee }

  # Quest work: only offered while the job is taken.
  hand_out_flyers:
    label: Hand out club flyers
    group: Work
    at: [high_street, the_strip]
    requires: { quest: flyers }
    say: "*I stand on the corner pushing flyers into people's hands.*"
    time: 60
    check: { chance: 45 + allure / 2, label: Allure }
    success: { progress: { flyers: 1 }, fatigue: +6, hint: "The stack goes down fast." }
    fail: { fatigue: +8, stress: +3, hint: "Everyone walks straight past {{user}}." }
  search_lawns:
    label: Search the lawns for the lost ring
    group: Park
    at: park
    requires: { quest: lost_ring }
    say: "*I comb the grass by the duck pond, looking for a glint of gold.*"
    time: 45
    check: { chance: "30 + (between(hour, 8, 18) ? 15 : 0) - fatigue / 4", label: Luck }
    success: { progress: { lost_ring: 1 }, hint: "Something glints in the grass — the ring." }
    fail: { fatigue: +6, hint: "Bottle caps and a lot of mud." }

  pickpocket:
    label: Pick a pocket
    group: Crime
    at: [high_street, the_strip]
    say: "*I pick out a distracted mark and go for their wallet.*"
    tags: [crime]
    time: 10
    check: { chance: 15 + skulduggery / 1.2 - allure / 8, label: Skulduggery }
    crit_success: { money: roll('4d10') + 20, skulduggery: +1.5, hint: "A fat wallet, and nobody noticed a thing." }
    success: { money: roll('2d10') + 5, skulduggery: +1, hint: "Clean lift. Nobody noticed." }
    fail: { crime: +6, stress: +8, skulduggery: +0.3, hint: "The mark catches {{user}}'s wrist and starts shouting." }
    crit_fail: { crime: +16, stress: +15, pain: +20, hint: "Caught red-handed by someone who doesn't wait for the police." }

  dance:
    label: Dance at a club
    group: Nightlife
    at: the_strip
    when: hour >= 20 or hour < 4
    say: "*I hit the dance floor.*"
    time: 60
    check: { chance: 40 + dancing / 1.2, label: Dancing }
    success: { dancing: +1.2, stress: -6, allure: +3, fatigue: +10, hint: "{{user}} moves well and draws eyes." }
    fail: { dancing: +0.5, stress: +2, fatigue: +10, hint: "Awkward, off the beat, and a little embarrassing." }
  drink:
    label: Have a drink (£6)
    group: Nightlife
    at: the_strip
    when: money >= 6
    say: "*I order a drink.*"
    time: 30
    effects: { money: -6, stress: -5, control: -2 }

  wander:
    label: Wander around
    group: Explore
    say: "*I wander and see what's going on.*"
    time: 30
    effects:
      # The decision model weighs these against the scene (time, place, allure…); the engine rolls.
      decide:
        ask: What does the town throw at {{user}} while they wander?
        options:
          windfall: { desc: "A small windfall", weight: 2, money: roll('2d6'), hint: "{{user}} stumbles on a little luck — some dropped cash." }
          friendly: { desc: "A friendly face", weight: 3, stress: -3, hint: "Someone friendly strikes up a conversation." }
          quiet: { desc: "Nothing much happens", weight: 3, stress: -1, hint: "A quiet, uneventful walk." }
          trouble: { desc: "Someone unpleasant takes an interest", weight: 2, stress: +4, hint: "Trouble finds {{user}}: someone unpleasant takes an interest." }
          mugged: { desc: "A mugger corners them", weight: 1, start_encounter: mugging }

  # One button per person here. {target} is their name; rel: { target: … } changes how they feel.
  chat:
    label: Chat with {target}
    group: People
    per_person: true
    say: "*I strike up a conversation with {target}.*"
    time: 20
    effects: { rel: { target: { trust: +2, love: +1 } }, stress: -2 }
  flirt:
    label: Flirt with {target}
    group: People
    per_person: true
    say: "*I flirt with {target}.*"
    time: 15
    check: { chance: 30 + allure / 2 + target.love / 2 + target.trust / 4, label: Allure }
    success: { rel: { target: { love: +3, lust: +4 } }, arousal: +3, hint: "{target} is charmed." }
    fail: { rel: { target: { trust: -2 } }, stress: +3, hint: "It lands badly; {target} is put off." }
    crit_fail: { rel: { target: { trust: -4, love: -2 } }, stress: +6, hint: "Mortifying. {target} makes it clear they're not interested." }
  ask_favour:
    label: Ask {target} for help
    group: People
    per_person: true
    when: target.trust >= 30
    say: "*I ask {target} for a favour.*"
    time: 20
    effects:
      decide:
        ask: Does {target} agree to help {{user}}?
        options:
          yes: { desc: "Helps gladly", weight: 3, stress: -5, rel: { target: { love: +1 } } }
          grudging: { desc: "Helps, but grudgingly", weight: 2, rel: { target: { trust: -1 } } }
          no: { desc: "Refuses", weight: 1, stress: +3 }

  endure:
    label: Endure
    hidden: true
    desc: Resisting pain, fear, temptation or pressure; keeping composure.
    params:
      difficulty: { easy: 75, normal: 50, hard: 30, extreme: 15 }
    check: { chance: difficulty + control / 4 - stress / 4, label: Control }
    success: { hint: "{{user}} holds it together." }
    fail: { stress: +5, control: -4, hint: "{{user}} cracks under it." }
  escape:
    label: Escape
    hidden: true
    desc: Running away, struggling free, slipping out of a bad situation.
    params:
      difficulty: { easy: 75, normal: 50, hard: 30, extreme: 15 }
    check: { chance: difficulty + athletics / 2.5 - fatigue / 3 - pain * 0.8, label: Athletics }
    success: { fatigue: +7, hint: "{{user}} gets away." }
    fail: { fatigue: +10, pain: +10, hint: "{{user}} doesn't get away." }
  sneak:
    label: Sneak
    hidden: true
    desc: Staying unseen, lockpicking, shoplifting, anything sly.
    tags: [crime]
    params:
      difficulty: { easy: 70, normal: 45, hard: 25, extreme: 10 }
    check: { chance: difficulty + skulduggery / 1.5, label: Skulduggery }
    success: { skulduggery: +0.8 }
    fail: { crime: +3, stress: +3, skulduggery: +0.2, hint: "{{user}} is noticed." }
`,
    },
    {
      label: "rules",
      yaml: `# At low control, {{user}}'s mind can overrule the player. Each override rolls its chance per action.
mind:
  overrides:
    freeze:
      when: "control < 25"
      chance: "60 - control * 2"
      on: [violence, crime]
      cause: Panic
      text: "their body locks up and won't obey."
    flight:
      when: "control < 15 and cond('scared')"
      chance: 35
      do: alter
      cause: Fear
      text: "every instinct is screaming at them to get out."
  perception:
    - { when: "trauma >= 60", text: "Reminders of what happened hit hard. Show intrusive thoughts and flinches; safe things can feel unsafe." }
    - { when: "control < 25", text: "{{user}} is barely holding together: narrow focus, racing heart, sounds too loud." }

# Save slots, a daily autosave, and a bad end. What you've learned survives a rewind.
checkpoints:
  slots: 3
  auto: day
  keep: [codex, feats, secrets]
endings:
  burned_out:
    when: "trauma >= 100"
    title: Burned out
    kind: bad
    text: "{{user}} can't carry it any more. They pack a bag and take the night bus out of town."

# Meters that feed into each other.
triggers:
  exhaustion:
    when: fatigue >= 85
    do:
      add_condition: [exhausted]
      hint: "{{user}} is swaying on their feet from exhaustion."
  exhaustion_stress:
    when: fatigue >= 85
    repeat: true
    do: { stress: +2.5 }
  rested:
    when: fatigue < 60
    do: { remove_condition: [exhausted] }

  breakdown:
    when: stress >= 100
    do:
      set: { stress: 60 }
      trauma: +12
      control: -20
      add_condition: { shaken: 240 }
      hint: "The pressure finally overwhelms {{user}} — they break down."

  scared:
    when: control < 40
    do:
      add_condition: [scared]
      hint: "{{user}}'s nerve is gone; old fears are surfacing."
  steady:
    when: control >= 40
    do: { remove_condition: [scared] }
  trauma_eats_control:
    when: trauma >= 50
    repeat: true
    do: { control: -1 }

  # Judged by the decision model each turn, in plain language.
  threatened:
    when_scene: "{{user}} is being threatened, cornered or attacked"
    do:
      stress: +4
      control: -3
  wanted:
    when: crime >= 30
    do:
      add_condition: [wanted]
      hint: "Word is out: the police are asking about {{user}}."
  cleared:
    when: crime < 16
    do: { remove_condition: [wanted] }

  # Weather and clothing.
  cold:
    when: too_cold and outside
    do:
      add_condition: [cold]
      hint: "{{user}} is shivering — badly underdressed for the weather."
  cold_bites:
    when: too_cold and outside
    repeat: true
    do: { stress: +1, fatigue: +1 }
  warmed_up:
    when: not too_cold or indoors
    do: { remove_condition: [cold] }
  overheating:
    when: too_hot
    do: { add_condition: [overheating] }
  cooled_down:
    when: not too_hot
    do: { remove_condition: [overheating] }
  soaked:
    when: (weather == 'rain' or weather == 'storm') and outside and not trait('rainproof')
    do:
      add_condition: { soaked: 120 }
      hint: "The rain soaks {{user}} through."
  exposed:
    when: exposed > 0 and outside
    do:
      add_condition: [exposed]
      hint: "{{user}} is out in public without being decently covered, and people notice."
  exposed_stress:
    when: exposed > 0 and outside
    repeat: true
    do: { stress: +3, allure: +2 }
  covered:
    when: exposed == 0 or indoors
    do: { remove_condition: [exposed] }
`,
    },
    {
      label: "encounters",
      yaml: `# Turn-based encounters. Your moves replace the normal choices until it ends;
# the mugger's move each round is rolled (odds weighed by the decision model if you use one).
encounters:
  mugging:
    name: Mugging
    desc: Someone blocks {{user}}'s way and wants their money.
    tags: [violence]
    foe:
      name: Mugger
      stats:
        nerve: { label: Nerve, start: 10, max: 10 }
    actions:
      fight_back:
        label: Fight back
        check: { chance: 30 + athletics / 2 - fatigue / 3 - pain / 3, label: Athletics }
        success: { foe: { nerve: -6 }, hint: "{{user}} lands a solid hit." }
        fail: { pain: +10, hint: "{{user}}'s swing misses and they take a blow." }
      shout:
        label: Shout for help
        check: { chance: 35 + control / 4, label: Control }
        success: { foe: { nerve: -4 }, hint: "Heads turn at the shouting." }
        fail: { stress: +4, hint: "Nobody comes." }
      hand_over:
        label: Hand over your money
        effects: { money: "-min(money, 20)", end: robbed }
      run:
        label: Run
        check: { chance: 35 + athletics / 2 - fatigue / 3 - pain / 2, label: Athletics }
        success: { fatigue: +5, end: escaped }
        fail: { pain: +5, hint: "{{user}} is caught before getting far." }
      jump_in:
        label: Jump into the harbour
        when: "at('docks')"
        check: { chance: 30 + swimming / 2 - pain / 3, label: Swimming }
        success: { end: swam_off }
        fail: { pain: +8, fatigue: +10, hint: "The cold knocks the wind out of {{user}}, and they have to haul themselves back out." }
    foe_moves:
      grab: { desc: "Grabs and shoves {{user}}", weight: 2, pain: +8, stress: +4, damage: { top: 20 } }
      threaten: { desc: "Makes an ugly threat", weight: 2, stress: +6, control: -3 }
      snatch: { desc: "Snatches at their pockets", weight: 1, money: "-min(money, 10)" }
    end_when:
      won: foe.nerve <= 0
      beaten: pain >= 80
    outcomes:
      won: { stress: -5, control: +5, flags: { fought_off_mugger: true }, hint: "The mugger loses their nerve and bolts." }
      swam_off: { stress: +2, fatigue: +10, hint: "{{user}} comes up spluttering by the far ladder; the mugger is long gone." }
      robbed: { stress: +8, control: -8, hint: "They take the money and vanish." }
      escaped: { stress: +3, hint: "{{user}} gets clear." }
      beaten: { trauma: +5, money: "-min(money, 30)", hint: "{{user}} is left hurt on the pavement, pockets emptied." }

# Roguelike diving: floors of face-down tiles with one way down. Leave whenever you
# like and keep what you found; get wiped out and you lose it.
dungeons:
  old_mines:
    name: The Old Mines
    desc: Flooded tunnels under the docks, abandoned when the seam ran dry. People say things live down there now.
    at: [docks]
    theme: cave
    floors: 15
    party: { max: 3 }
    player: { atk: "12 + athletics / 10", agi: "10 + athletics / 12" }
    on_leave: { fatigue: +15 }
    on_defeat: { pain: +40, trauma: +8, control: -10 }
`,
    },
    {
      label: "quests",
      yaml: `# Quests: favours the townsfolk ask (they remember how it went) and odd jobs pinned to the
# café corkboard. Favours people ask for in the story itself are tracked too (from_story).
quests:
  jo_cover:
    name: Cover Jo's shift
    kind: favour
    giver: jo
    desc: Jo's other server quit. She needs someone behind the counter this week.
    when: "rel('jo', 'trust') >= 15"
    days: 3
    goals:
      - { text: Work a shift at the café, on: { action: cafe_shift, tier: [crit_success, success, partial, fail] } }
    reward: { money: 20, rel: { jo: { trust: 8, love: 3 } } }
    failure: { rel: { jo: { trust: -8 } } }
    stakes: Jo has nobody else to ask.
    remember: { done: "{{user}} covered for her when the café was short-staffed.", failed: "{{user}} said they'd cover her shift and never showed." }
  ward_essay:
    name: The overdue essay
    kind: coursework
    giver: professor_ward
    desc: Professor Ward wants the essay on her desk by Friday — no extensions.
    days: 4
    goals:
      - { text: Put in proper study sessions, count: 3, on: study }
    reward: { studies: 3, stress: -5, rel: { professor_ward: { trust: 10 } } }
    failure: { stress: 10, rel: { professor_ward: { trust: -12 } } }
    stakes: A fail goes on {{user}}'s record, and Ward doesn't forget.
  dex_package:
    name: Hold a package for Dex
    kind: favour
    giver: dex
    desc: A taped-up box. Keep it safe for a couple of days. Don't open it.
    when: "rel('dex', 'trust') >= 20"
    days: 2
    goals:
      - { text: Keep it safe and give it back unopened }
    judge: { done: "{{user}} gives Dex his package back, unopened", fail: "{{user}} opens, loses or hands over Dex's package" }
    start: { crime: +4 }
    reward: { money: 40, rel: { dex: { trust: 10 } } }
    failure: { stress: 8, rel: { dex: { trust: -20 } } }
    stakes: Dex doesn't forgive, and the people he works for forgive less.
  lost_ring:
    name: Lost engagement ring
    kind: errand
    board: true
    desc: "REWARD £50 — gold ring with a small stone, lost near the duck pond in Seaview Park."
    days: 3
    goals:
      - { text: Find the ring in Seaview Park }
    reward: { money: 50, stress: -3 }
    stakes: Someone else will find it first.
  flyers:
    name: Hand out club flyers
    kind: odd job
    board: true
    repeat: 3
    desc: The new club on the Strip pays cash to get its name around.
    days: 2
    goals:
      - { text: Hand out stacks of flyers, count: 2 }
    reward: { money: 25 }
    failure: { stress: 2 }
`,
    },
    {
      label: "journal",
      yaml: `# Codex entries unlock as you play. Add "lore: [Lorebook entry title]" to one and that
# lorebook entry stays off until the codex entry unlocks.
codex:
  apartment: { title: Your Apartment, category: Places, text: "Above the chip shop. The landlord never fixes anything.", unlock: "turn >= 1" }
  campus: { title: University Campus, category: Places, text: "Sprawling and old; the pool is open late on weekdays.", unlock: "location == 'campus'" }
  docks: { title: The Docks, category: Places, text: "Cargo, cranes and people who don't ask questions.", unlock: "location == 'docks'" }
  the_strip: { title: The Strip, category: Places, text: "Where the town goes to forget itself.", unlock: "location == 'the_strip'" }
  jo: { title: Jo, category: People, text: "Runs the café. Pays fairly, expects the same.", unlock: "met('jo') and rel('jo', 'trust') >= 15" }

feats:
  first_pay: { name: First paycheque, desc: "Finish a shift at the café.", unlock: "flag('worked')", reward: { stress: -5 } }
  night_owl: { name: Night owl, desc: "Be out on the Strip after 2am.", unlock: "location == 'the_strip' and between(hour, 2, 5)" }
  stood_ground: { name: Stood your ground, desc: "Fight off a mugger.", unlock: "flag('fought_off_mugger')", reward: { control: +10 } }
  good_neighbour: { name: Good neighbour, desc: "Come through on three favours or jobs.", unlock: "quests_done() >= 3", reward: { stress: -10, control: +5 } }
  well_dressed: { name: Dressed for it, desc: "Own a raincoat and a winter coat.", unlock: "has('raincoat') and has('winter_coat')" }
`,
    },
    {
      label: "story",
      yaml: `# Secrets reach the narrator one stage at a time — a stage that isn't open is never
# in its prompt, so it can't leak. Fronts are hidden clocks that fill with game time
# and surface in the story. Random events come from a hidden gauge, with an omen first.
# Live choices are written for each moment; their tag, not the writer, decides the roll.
secrets:
  ward_observatory:
    about: Professor Ward
    cue: "Ward goes very still whenever the old observatory on campus comes up, and changes the subject."
    tell: exists
    stages:
      - when: "rel('professor_ward', 'trust') >= 45"
        text: "Years ago a student fell from the observatory roof during a night session Ward supervised. Ward has never forgiven themself."
      - when: "rel('professor_ward', 'trust') >= 70"
        text: "Ward signed the safety report saying the roof hatch was locked. It wasn't, and nobody else knows."
  dex_debt:
    about: Dex
    cue: "Dex checks the street whenever a black car passes, and never stays in one spot for long."
    tell: exists
    stages:
      - when: "rel('dex', 'trust') >= 40"
        text: "Dex owes a lot of money to the people who run the docks, and is running out of time to pay."

fronts:
  dock_crew:
    label: The dock crew
    per_day: 5
    story:
      "{{user}} draws the attention of the people who run the docks": 12
      "{{user}} helps Dex stay out of trouble": -8
    stages:
      - at: 30
        hint: "More people than usual loiter by the docks after dark, watching who comes and goes."
        backstage: "The dock crew has started collecting protection money from the High Street shops."
        surface: "Jo's café window is smashed overnight. Jo is sweeping up glass and won't say who did it."
        news: "Jo's café window was smashed overnight."
        do: { flags: { cafe_hit: true } }
      - at: 65
        hint: "Dex hasn't been seen at the docks for a couple of nights."
        backstage: "The crew gave Dex one week to pay what they owe."
        surface: "Word on the street: the dock crew is looking for Dex, and for anyone who knows where Dex is."
        news: "The dock crew is looking for Dex."
        do: { flags: { dex_hunted: true } }
      - at: 100
        backstage: "The crew caught up with Dex."
        surface: "Dex turns up badly beaten. The docks go quiet and nobody is talking."
        news: "Dex was found badly beaten."
        do: { flags: { dex_beaten: true } }

random_events:
  pace: { per_day: 30, jitter: 0.35, rest_days: 1, omen_at: 80 }
  events:
    landlord:
      label: The landlord
      omen: "An unopened letter from the landlord is waiting by the door."
      text: "The landlord turns up unannounced, wants to inspect the flat, and hints that the rent is going up."
      cooldown: 14
      do: { stress: +6 }
    power_cut:
      label: Power cut
      omen: "The lights in the building keep flickering."
      text: "The power cuts out across the whole block."
      cooldown: 10
    found_wallet:
      label: A dropped wallet
      when: outside
      text: "{{user}} spots a wallet lying on the pavement, stuffed with cash."
      cooldown: 20
    party:
      label: A party invite
      when: "weekday == 'Fri' or weekday == 'Sat'"
      omen: "People on campus keep talking about a party this weekend."
      text: "Someone from {{user}}'s course invites them to a house party tonight."
      weight: 2
      cooldown: 6
    old_friend:
      label: An old friend
      text: "An old school friend of {{user}}'s calls out to them from across the street, delighted."
      cooldown: 21

live_choices:
  label: Right now
  count: 3
  when: not in_encounter
  guide: "Grounded, everyday options. Include one that's a little risky."
  tags:
    bold:
      desc: "A daring, risky or impulsive move"
      check: { chance: 45 + control / 4 - stress / 5, label: Nerve }
      success: { control: +3, stress: -2 }
      fail: { stress: +6, control: -2 }
    charm:
      desc: "Charming, flirting with or winning over someone here"
      per_person: true
      check: { chance: 35 + allure / 2 + target.trust / 4, label: Allure }
      success: { rel: { target: { love: +3, trust: +2 } } }
      fail: { stress: +3, rel: { target: { trust: -1 } } }
    kind:
      desc: "Something kind, generous or supportive toward someone here"
      per_person: true
      effects: { stress: -2, rel: { target: { trust: +3 } } }
    sly:
      desc: "Something sneaky, dishonest or against the rules"
      tags: [crime]
      check: { chance: 30 + skulduggery / 1.5, label: Skulduggery }
      success: { skulduggery: +0.5 }
      fail: { crime: +4, stress: +4 }
    careful:
      desc: "The cautious, sensible option: stepping back, waiting, leaving"
      effects: { stress: -1 }
`,
    },
    {
      label: "dating",
      yaml: `# When {{user}} is exposed, everyone present reacts in their own way, and word gets around.
observers:
  when: "exposed > 0"
  crowd: 2
  reactions:
    interested: { rel: { target: { lust: +4 } } }
    disapproving: { rel: { target: { trust: -3 } }, stress: +3 }
    predatory: { stress: +6, hint: "{target} starts paying the wrong kind of attention." }

# Rent is due every Monday. Miss it and the landlord decides what that costs.
obligations:
  rent:
    label: Rent
    amount: 120
    every: 7
    first: 7
    grace: 1
    late:
      ask: "{{user}}'s rent is late. What does the landlord do?"
      options:
        warning: { desc: "Slips a stern note under the door", weight: 3, stress: +8 }
        late_fee: { desc: "Adds a £25 late fee", weight: 2, stress: +10, money: "-min(money, 25)" }
        lockout: { desc: "Changes the lock until it's paid", weight: 1, stress: +25, flags: { locked_out: true } }

# A busy shift at Jo's café: every customer wants something different.
jobs:
  rush_hour:
    label: Cover the lunch rush at the café
    at: [high_street]
    when: "between(hour, 11, 14) and weekday != 'Sun'"
    customers: 3
    pay: 25
    tip: 4
    skill: tending
    minutes: 30
    gain: { tending: +1, fatigue: +15 }
    styles: { quick: "Get their order out fast", friendly: "Be warm and chatty", careful: "Get every detail exactly right" }
    patrons:
      - { who: "A nurse coming off a night shift, swaying on her feet", want: quick }
      - { who: "A student with a laptop and nowhere to be", want: friendly }
      - { who: "A regular who orders the same thing, very precisely, every day", want: careful }
      - { who: "Two builders on a twenty-minute break", want: quick }
      - { who: "An elderly man who's lonely and wants someone to talk to", want: friendly }
      - { who: "A woman with a long list of allergies", want: careful }

# Companions live between replies: goals, arcs they push by their own choices, feelings about each other.
companions:
  jo:
    goal: Buy the café outright before the landlord sells it
    arc:
      per_day: 1
      stages:
        - { at: 30, hint: "Jo has been doing sums at closing time.", surface: "Jo tells people she's trying to buy the café." }
        - { at: 70, hint: "Jo looks exhausted; she's taken on extra shifts.", surface: "Jo makes the landlord an offer on the café.", do: { flags: { jo_offer: true } } }
      story: { "{{user}} helps Jo at the café": 8 }
    daily:
      ask: How does Jo spend her evening?
      options:
        extra_shift: { desc: Works a late extra shift, weight: 3, arc: +4 }
        the_strip: { desc: Goes out on the Strip and runs into Dex, weight: 1, arc: -2, bond: { dex: +4 } }
        night_in: { desc: Stays in and rests, weight: 2 }
    jealous_of: [dex]
    bonds: { dex: 10, professor_ward: 20 }
  dex:
    goal: Clear a debt to people you don't owe money to
    daily:
      ask: What does Dex get up to tonight?
      options:
        job: { desc: Takes a job for the wrong people, weight: 2 }
        café: { desc: Hangs around Jo's café until closing, weight: 1, bond: { jo: +5 } }
    bonds: { jo: 25, professor_ward: -30 }

# Date mode: talk topic by topic, learn what people like, ask them out.
# Love is the "love" relationship stat; "fear" is added automatically.
dating:
  love: love
  people:
    jo: { loves: [food, their_day], likes: [music, tag:food, tag:calm], dislikes: [gossip, tease], hates: [fashion] }
    professor_ward: { loves: [books_films, dreams], likes: [compliment_mind, tag:conversation], dislikes: [joke, flirt], hates: [gossip] }
    dex: { loves: [local_news, gossip], likes: [games, tag:drink, tag:thrill], dislikes: [work, family], hates: [compliment_looks] }
  topics:
    the_docks: { label: "What goes on at the docks", category: small_talk, when: "hour >= 18 or hour < 4" }
  venues:
    park: { name: The park, at: park }
    bar: { name: The Strip, at: the_strip }

items:
  flowers: { name: A bunch of flowers, tags: [gift] }
  chocolates: { name: Box of chocolates, tags: [gift] }

actions:
  buy_flowers:
    label: Buy flowers (£12)
    group: Shops
    at: [high_street]
    when: money >= 12
    time: 5
    effects: { money: -12, give: flowers }
  buy_chocolates:
    label: Buy chocolates (£8)
    group: Shops
    at: [high_street]
    when: money >= 8
    time: 5
    effects: { money: -8, give: chocolates }
`,
    },
  ],
};
