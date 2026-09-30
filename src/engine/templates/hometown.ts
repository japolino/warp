import type { Template } from "./index.js";

// Survival life-sim: pressure meters described in
// words, letter-graded skills, a clock that matters, and meters that feed
// into each other.
export const hometown: Template = {
  id: "hometown",
  name: "Hometown (life-sim)",
  blurb: "Survival life-sim: Pain, Arousal, Fatigue, Stress, Trauma, Control and Allure described in words, graded skills, a clock, a small town map, and meters that feed into each other.",
  parts: [
    {
      label: "core",
      yaml: `name: Hometown
description: A survival life-sim in a small coastal university town.

player:
  age: 20                 # a university student

clock:
  start: Mon 07:00
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
  pain:
    kind: meter
    max: 200
    good: low
    per_hour: -12
    narrator: 40
    bands:
      0: You feel okay.
      30: You're a little sore.
      80: You're in pain.
      130: You're in agony!
  arousal:
    kind: meter
    max: 10000
    good: none
    start: 0
    per_hour: -300
    narrator: 2500
    color: "#e0569b"
    bands:
      0: You feel cold.
      2000: You feel warm.
      5000: You feel aroused.
      8000: You're shaking with arousal.
  fatigue:
    kind: meter
    max: 2000
    good: low
    start: 150
    per_hour: 60            # a point a minute while awake
    narrator: 300
    bands:
      0: You are wide awake.
      600: You are alert.
      1200: You are tired.
      1700: You are exhausted.
  stress:
    kind: meter
    max: 10000
    good: low
    per_hour: -40
    narrator: 1500
    bands:
      0: You are calm.
      3000: You are stressed.
      6000: You are strained.
      8000: You are distressed.
  trauma:
    kind: meter
    max: 5000
    good: low
    narrator: 400
    bands:
      0: You feel fine.
      1000: You are uneasy.
      2500: You are nervous.
      4000: You feel numb.
  control:
    kind: meter
    max: 1000
    good: high
    start: 1000
    narrator: 250
    bands:
      0: You are terrified.
      200: You are scared.
      400: You are insecure.
      700: You are confident.
  allure:
    kind: meter
    max: 10000
    good: none
    start: 800
    narrator: 1500
    bands:
      0: You don't stand out.
      1000: You attract glances.
      3000: You stand out.
      6000: You look like you want trouble.
  money:
    kind: money
    start: 60
    narrator: 200

  athletics:   { kind: skill, max: 1000, start: 100, grades: [F, F+, D, D+, C, C+, B, B+, A, A+, S] }
  swimming:    { kind: skill, max: 1000, start: 50,  grades: [F, F+, D, D+, C, C+, B, B+, A, A+, S] }
  dancing:     { kind: skill, max: 1000, start: 0,   grades: [F, F+, D, D+, C, C+, B, B+, A, A+, S] }
  skulduggery: { kind: skill, max: 1000, start: 0,   grades: [F, F+, D, D+, C, C+, B, B+, A, A+, S] }
  tending:     { kind: skill, max: 1000, start: 50,  grades: [F, F+, D, D+, C, C+, B, B+, A, A+, S] }
  studies:     { kind: skill, max: 1000, start: 200, grades: [F, E, D, C, B, A, "A*"] }
  crime:
    kind: hidden
    max: 5000
    good: low
    per_hour: -2
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
`,
    },
    {
      label: "world",
      yaml: `locations:
  apartment:
    name: Your Apartment
    desc: A cramped one-bedroom above a chip shop. Thin walls, a lock that sticks.
    exits: [high_street]
  high_street:
    name: High Street
    desc: Shops, a café, a busy bus stop. Crowded by day, emptier at night.
    exits: [apartment, campus, park, docks, the_strip]
  campus:
    name: University Campus
    desc: Lecture halls, a library, a gym with a pool.
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
  phone: Phone
  keys: Apartment keys
  coffee: Coffee

conditions:
  exhausted: { label: Exhausted, tone: bad, desc: Stress builds fast while this tired. }
  scared: { label: Scared, tone: bad, desc: Low control — trauma comes to the surface. }
  shaken: { label: Shaken, tone: warn, desc: Recently overwhelmed. }
  wanted: { label: Wanted, tone: bad, desc: The police are looking for you. }
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
    effects: { fatigue: -2000, stress: -1500, pain: -60, control: +100 }
  shower:
    label: Shower
    group: Home
    at: apartment
    say: "*I take a long shower.*"
    time: 20
    effects: { stress: -300, arousal: -500 }

  attend_lecture:
    label: Attend lecture
    group: Campus
    at: campus
    when: between(hour, 9, 16) and weekday != 'Sat' and weekday != 'Sun'
    say: "*I head into a lecture and try to focus.*"
    time: 90
    effects: { studies: +15, fatigue: +100 }
  study:
    label: Study in the library
    group: Campus
    at: campus
    say: "*I find a quiet corner in the library and study.*"
    time: 60
    check: { chance: 50 + studies / 20 - fatigue / 40, label: Studies }
    success: { studies: +12, hint: "The material clicks." }
    fail: { studies: +3, stress: +200, hint: "The words swim; very little sticks." }
  swim:
    label: Swim laps
    group: Campus
    at: campus
    say: "*I swim laps in the university pool.*"
    time: 45
    effects: { swimming: +10, athletics: +4, fatigue: +250, stress: -300 }

  jog:
    label: Go for a jog
    group: Park
    at: park
    say: "*I go for a jog around the park.*"
    time: 40
    check: { chance: 60 + athletics / 20 - fatigue / 30, label: Athletics }
    success: { athletics: +10, fatigue: +200, stress: -400 }
    fail: { athletics: +4, fatigue: +350, pain: +20, hint: "{{user}} pushes too hard and ends up aching and winded." }

  cafe_shift:
    label: Work a café shift
    group: Work
    at: high_street
    when: between(hour, 7, 18)
    say: "*I put on an apron and work a shift at the café.*"
    time: 240
    check: { chance: 55 + tending / 15, label: Tending }
    success: { money: 45 + tending / 20, tending: +12, fatigue: +400, hint: "A smooth shift — good tips." }
    fail: { money: 30, tending: +6, fatigue: +450, stress: +600, hint: "A rough shift: rude customers and a smashed tray." }
  buy_coffee:
    label: Buy a coffee (£3)
    group: Shops
    at: high_street
    when: money >= 3
    say: "*I grab a coffee.*"
    time: 10
    effects: { money: -3, fatigue: -80 }

  pickpocket:
    label: Pick a pocket
    group: Crime
    at: [high_street, the_strip]
    say: "*I pick out a distracted mark and go for their wallet.*"
    tags: [crime]
    time: 10
    check: { chance: 15 + skulduggery / 12 - allure / 800, label: Skulduggery }
    crit_success: { money: roll('4d10') + 20, skulduggery: +15, hint: "A fat wallet, and nobody noticed a thing." }
    success: { money: roll('2d10') + 5, skulduggery: +10, hint: "Clean lift. Nobody noticed." }
    fail: { crime: +300, stress: +800, skulduggery: +3, hint: "The mark catches {{user}}'s wrist and starts shouting." }
    crit_fail: { crime: +800, stress: +1500, pain: +40, hint: "Caught red-handed by someone who doesn't wait for the police." }

  dance:
    label: Dance at a club
    group: Nightlife
    at: the_strip
    when: hour >= 20 or hour < 4
    say: "*I hit the dance floor.*"
    time: 60
    check: { chance: 40 + dancing / 12, label: Dancing }
    success: { dancing: +12, stress: -600, allure: +300, fatigue: +200, hint: "{{user}} moves well and draws eyes." }
    fail: { dancing: +5, stress: +200, fatigue: +200, hint: "Awkward, off the beat, and a little embarrassing." }
  drink:
    label: Have a drink (£6)
    group: Nightlife
    at: the_strip
    when: money >= 6
    say: "*I order a drink.*"
    time: 30
    effects: { money: -6, stress: -500, control: -20 }

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
          friendly: { desc: "A friendly face", weight: 3, stress: -300, hint: "Someone friendly strikes up a conversation." }
          quiet: { desc: "Nothing much happens", weight: 3, stress: -100, hint: "A quiet, uneventful walk." }
          trouble: { desc: "Someone unpleasant takes an interest", weight: 2, stress: +400, hint: "Trouble finds {{user}}: someone unpleasant takes an interest." }

  endure:
    label: Endure
    hidden: true
    desc: Resisting pain, fear, temptation or pressure; keeping composure.
    params:
      difficulty: { easy: 75, normal: 50, hard: 30, extreme: 15 }
    check: { chance: difficulty + control / 40 - stress / 400, label: Control }
    success: { hint: "{{user}} holds it together." }
    fail: { stress: +500, control: -40, hint: "{{user}} cracks under it." }
  escape:
    label: Escape
    hidden: true
    desc: Running away, struggling free, slipping out of a bad situation.
    params:
      difficulty: { easy: 75, normal: 50, hard: 30, extreme: 15 }
    check: { chance: difficulty + athletics / 25 - fatigue / 60 - pain / 5, label: Athletics }
    success: { fatigue: +150, hint: "{{user}} gets away." }
    fail: { fatigue: +200, pain: +20, hint: "{{user}} doesn't get away." }
  sneak:
    label: Sneak
    hidden: true
    desc: Staying unseen, lockpicking, shoplifting, anything sly.
    tags: [crime]
    params:
      difficulty: { easy: 70, normal: 45, hard: 25, extreme: 10 }
    check: { chance: difficulty + skulduggery / 15, label: Skulduggery }
    success: { skulduggery: +8 }
    fail: { crime: +150, stress: +300, skulduggery: +2, hint: "{{user}} is noticed." }
`,
    },
    {
      label: "rules",
      yaml: `# Meters that feed into each other.
triggers:
  exhaustion:
    when: fatigue >= 1700
    do:
      add_condition: [exhausted]
      hint: "{{user}} is swaying on their feet from exhaustion."
  exhaustion_stress:
    when: fatigue >= 1700
    repeat: true
    do: { stress: +250 }
  rested:
    when: fatigue < 1200
    do: { remove_condition: [exhausted] }

  breakdown:
    when: stress >= 10000
    do:
      set: { stress: 6000 }
      trauma: +600
      control: -200
      add_condition: { shaken: 240 }
      hint: "The pressure finally overwhelms {{user}} — they break down."

  scared:
    when: control < 400
    do:
      add_condition: [scared]
      hint: "{{user}}'s nerve is gone; old fears are surfacing."
  steady:
    when: control >= 400
    do: { remove_condition: [scared] }
  trauma_eats_control:
    when: trauma >= 2500
    repeat: true
    do: { control: -10 }

  # Judged by the decision model each turn, in plain language.
  threatened:
    when_scene: "{{user}} is being threatened, cornered or attacked"
    do:
      stress: +400
      control: -30
  wanted:
    when: crime >= 1500
    do:
      add_condition: [wanted]
      hint: "Word is out: the police are asking about {{user}}."
  cleared:
    when: crime < 800
    do: { remove_condition: [wanted] }
`,
    },
  ],
};
