// A small town for tests that need a ready-made ruleset: a few places, meters, skills,
// relationships, a shift, a pickpocket, a hidden escape and a breakdown rule. It was cut
// down from the old Hometown template (kept on the `legacy` branch); it isn't offered to players.

import { loadRuleset } from "./loader.js";
import type { Ruleset } from "./ruleset.js";

export const TOWN_YAML = `name: Town
description: A small coastal university town.
player: { age: 20 }
clock: { start: Mon 07:00, minutes_per_action: 15, narrator_max: 240 }
start: { location: apartment, items: { phone: 1, keys: 1 } }
hud: { currency: "£", bars: [pain, arousal, fatigue, stress, trauma, control, allure] }

stats:
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

relationships:
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
  # Townsfolk: the story says when they're in the scene.
  people:
    jo:
      name: Jo
      desc: Runs the café on the High Street. Brisk, fair, secretly kind.
    professor_ward:
      name: Professor Ward
      desc: Your tutor. Exacting, dry, notices everything.
    dex:
      name: Dex
      desc: Works the docks at night. Knows people who know people.

locations:
  apartment:
    name: Your Apartment
    desc: A cramped one-bedroom above a chip shop. Thin walls, a lock that sticks.
    indoors: true
  high_street:
    name: High Street
    desc: Shops, a café with a corkboard of odd jobs in the window, a busy bus stop. Crowded by day, emptier at night.
  campus:
    name: University Campus
    desc: Lecture halls, a library, a gym with a pool.
    indoors: true
  park:
    name: Seaview Park
    desc: Lawns, a duck pond, dense woods at the far end.
  docks:
    name: The Docks
    desc: Warehouses and cargo ships. Rough, and rougher after dark.
  the_strip:
    name: The Strip
    desc: Bars and clubs, neon and noise until dawn.

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

conditions:
  shaken: { label: Shaken, tone: warn, desc: Recently overwhelmed., bonus: { athletics: -5, skulduggery: -10 } }

actions:
  head_out:
    label: Head out to the High Street
    group: Travel
    at: apartment
    say: "*I head out to the High Street.*"
    time: 10
    effects: { move: high_street }
  shower:
    label: Shower
    group: Home
    at: apartment
    say: "*I take a long shower.*"
    time: 20
    effects: { stress: -3, arousal: -5 }
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
  escape:
    label: Escape
    hidden: true
    desc: Running away, struggling free, slipping out of a bad situation.
    params:
      difficulty: { easy: 75, normal: 50, hard: 30, extreme: 15 }
    check: { chance: difficulty + athletics / 2.5 - fatigue / 3 - pain * 0.8, label: Athletics }
    success: { fatigue: +7, hint: "{{user}} gets away." }
    fail: { fatigue: +10, pain: +10, hint: "{{user}} doesn't get away." }

triggers:
  breakdown:
    when: stress >= 100
    do:
      set: { stress: 60 }
      trauma: +12
      control: -20
      add_condition: { shaken: 240 }
      hint: "The pressure finally overwhelms {{user}} — they break down."
`;

/** The test town, loaded. */
export function town(): Ruleset {
  return loadRuleset([{ label: "warp-ruleset · town", content: TOWN_YAML, order: 0 }]).ruleset!;
}
