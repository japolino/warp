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
    check: { chance: 50 + studies / 2 - fatigue / 2, label: Studies }
    success: { studies: +1.2, hint: "The material clicks." }
    fail: { studies: +0.3, stress: +2, hint: "The words swim; very little sticks." }
  swim:
    label: Swim laps
    group: Campus
    at: campus
    say: "*I swim laps in the university pool.*"
    time: 45
    effects: { swimming: +1, athletics: +0.4, fatigue: +12, stress: -3 }

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
    success: { money: 45 + tending / 2, tending: +1.2, fatigue: +20, hint: "A smooth shift — good tips." }
    fail: { money: 30, tending: +0.6, fatigue: +22, stress: +6, hint: "A rough shift: rude customers and a smashed tray." }
  buy_coffee:
    label: Buy a coffee (£3)
    group: Shops
    at: high_street
    when: money >= 3
    say: "*I grab a coffee.*"
    time: 10
    effects: { money: -3, fatigue: -4 }

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
      yaml: `# Meters that feed into each other.
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
`,
    },
  ],
};
