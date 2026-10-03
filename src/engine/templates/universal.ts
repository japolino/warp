import type { Template } from "./index.js";

export const universal: Template = {
  id: "universal",
  name: "Universal",
  blurb: "Light mechanics for any card: time, place, health, energy, mood, money, relationships, and d20 checks the narrator can't fudge.",
  parts: [
    {
      label: "core",
      yaml: `# Warp ruleset — core settings.
# This lorebook is never sent to the model; Warp reads it directly.
name: Universal
description: Light mechanics that fit any card.

clock:
  start: Mon 09:00
  minutes_per_action: 10   # time an action takes unless it says otherwise
  narrator_max: 480        # the narrator may skip at most 8 hours per reply

hud:
  currency: "$"

narration:
  notes: Keep narration consistent with the state block. Never invent dice results.
`,
    },
    {
      label: "stats",
      yaml: `stats:
  health:
    kind: meter
    narrator: 20          # the narrator may move this by at most 20 per reply
    bands:
      0: Near collapse.
      25: Badly hurt.
      50: Bruised and sore.
      80: Healthy.
  energy:
    kind: meter
    per_hour: -4          # drains slowly while awake
    narrator: 15
    bands:
      0: Exhausted.
      30: Tired.
      60: Alert.
  mood:
    kind: meter
    start: 60
    narrator: 10
    bands:
      0: Miserable.
      25: Low.
      50: Steady.
      75: In good spirits.
  money:
    kind: money
    start: 50
    narrator: 100

  body:
    kind: attribute
    max: 10
    start: 3
    desc: Strength, speed, endurance.
  mind:
    kind: attribute
    max: 10
    start: 3
    desc: Wits, knowledge, perception.
  charm:
    kind: attribute
    max: 10
    start: 3
    desc: Persuasion, presence, deceit.
`,
    },
    {
      label: "people",
      yaml: `relationships:
  open: true              # new people the story introduces are tracked automatically
  stats:
    affection:
      start: 20
      narrator: 5
      bands:
        0: Hostile
        15: Cool
        35: Friendly
        60: Close
        85: Devoted
    trust:
      start: 20
      narrator: 5
      bands:
        0: Suspicious
        25: Wary
        50: Trusting
        80: Unshakeable
`,
    },
    {
      label: "actions",
      yaml: `actions:
  look_around:
    label: Look around
    group: Explore
    say: "*I take a careful look around.*"
    time: 5
    check: { vs: 12, add: mind, label: Mind }
    success: { hint: "Reveal something useful or hidden that a careless person would miss." }
    fail: { hint: "The careful search yields no useful discovery. Show what this failed approach rules out, or a new lead that requires a different approach; do not invite an identical retry or invent a successful discovery." }

  rest:
    label: Rest a while
    group: Rest
    say: "*I take some time to rest.*"
    time: 60
    effects: { energy: +25, health: +5 }

  sleep:
    label: Sleep
    group: Rest
    say: "*I turn in for the night.*"
    when: between(hour, 21, 5)
    time: 480
    effects: { energy: +100, health: +20, mood: +5 }

  wait:
    label: Wait an hour
    group: Rest
    say: "*I let some time pass.*"
    time: 60

  # Hidden actions never show as buttons. When you type something risky,
  # Warp's adjudicator picks one of these and a difficulty, and the dice decide.
  physical_feat:
    label: Physical feat
    hidden: true
    desc: Climbing, forcing, running, fighting, enduring pain — anything that tests the body.
    params:
      difficulty: { easy: 8, normal: 12, hard: 16, extreme: 20 }
    check: { vs: difficulty, add: "body - (health < 25 ? 2 : 0) - (cond('exhausted') ? 2 : 0)", label: Body, partial: 3 }   # hurt or exhausted: harder
    success: { body: +0.2, hint: "It works." }
    fail: { energy: -10, hint: "It doesn't work, and it takes something out of {{user}}." }
    crit_fail: { health: -15, energy: -10, hint: "It goes badly wrong — a real setback or injury." }

  mental_feat:
    label: Mental feat
    hidden: true
    desc: Recalling facts, solving puzzles, spotting lies or danger, working something out.
    params:
      difficulty: { easy: 8, normal: 12, hard: 16, extreme: 20 }
    check: { vs: difficulty, add: "mind - (cond('exhausted') ? 2 : 0)", label: Mind, partial: 3 }
    success: { mind: +0.2, hint: "The answer or insight comes clearly." }
    fail: { hint: "The attempt fails. Show a concrete obstacle or a lost opportunity and a different next approach; do not grant the answer or repeat the same dead end." }

  social_feat:
    label: Social feat
    hidden: true
    desc: Persuading, lying, seducing, intimidating, calming someone down, haggling.
    params:
      difficulty: { easy: 8, normal: 12, hard: 16, extreme: 20 }
    check: { vs: difficulty, add: "charm + (mood >= 75 ? 1 : 0) - (mood < 25 ? 1 : 0)", label: Charm, partial: 3 }   # good spirits help, a low mood shows
    success: { charm: +0.2, hint: "They're swayed." }
    fail: { mood: -5, hint: "It doesn't land. They're unconvinced, or put off." }
    crit_fail: { mood: -10, hint: "It backfires embarrassingly and they react badly." }
`,
    },
    {
      label: "rules",
      yaml: `triggers:
  exhausted:
    when: energy <= 0
    do:
      add_condition: [exhausted]
      hint: "{{user}} is exhausted and struggling to stay upright."
  recovered:
    when: energy >= 30
    do:
      remove_condition: [exhausted]

conditions:
  exhausted:
    label: Exhausted
    tone: bad
    desc: Running on empty.
`,
    },
    {
      label: "story",
      yaml: `# Choices written for each moment. A writer phrases them from the story; each must
# carry one of these tags, and the tag decides the roll — the writer can't.
# Add secrets: here for what people hide.
live_choices:
  label: Right now
  count: 3
  when: not in_encounter
  tags:
    bold:
      desc: "A daring, physical or risky move"
      check: { vs: 12, add: body, label: Body, partial: 3 }
      success: { mood: +3 }
      fail: { health: -5, mood: -3 }
    clever:
      desc: "Noticing, working something out, or a clever trick"
      check: { vs: 12, add: mind, label: Mind, partial: 3 }
      success: { mood: +2 }
      fail: { mood: -2 }
    charm:
      desc: "Persuading, charming or flirting with someone here"
      per_person: true
      check: { vs: 12, add: charm, label: Charm, partial: 3 }
      success: { rel: { target: { affection: +3, trust: +2 } } }
      fail: { mood: -3, rel: { target: { trust: -2 } } }
    kind:
      desc: "Something kind or supportive toward someone here"
      per_person: true
      effects: { mood: +2, rel: { target: { trust: +3 } } }
    careful:
      desc: "The cautious option: waiting, watching, backing off"
      effects: { energy: +2 }
`,
    },
  ],
};
