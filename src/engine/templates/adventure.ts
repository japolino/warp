import type { Template } from "./index.js";

// Adventure (dice): CORE-DESIGN §3.2, Universal without dating, plus Conflict. d20 checks only at risky,
// contested moments (typed or clicked), live choices whose odds follow their difficulty word, contests (fights,
// chases, arguments) on one momentum gauge, attributes that grow with use. The time and the place come from the
// greeting, later places from the story, so it fits any card.

export const adventure: Template = {
  id: "adventure",
  name: "Adventure",
  blurb: "Everything in Story, plus d20 checks at risky moments, health, energy and mood, attributes that grow with use, and contests (fights, chases, arguments) on one momentum gauge. Fits any card.",
  parts: [
    {
      label: "core",
      yaml: `# Warp ruleset. This lorebook is never sent to the model; Warp reads it directly.
name: Adventure
description: Risky moments are rolled, fights and arguments swing, people remember. Fits any card.
style: adventure             # d20 checks on risky, contested moves; contests (fights, chases, arguments)

clock:
  start: greeting            # read the time (and day, if given) from the greeting
  fallback: "Day 1 09:00"
  minutes_per_action: 10
  narrator_max: 480          # the story may skip up to 8 hours per reply

start:
  place: greeting
  money: 50

hud:
  currency: "$"              # the builder changes this to fit the setting (gold, credits, ¥…)
  bars: [health, energy, mood]

narration:
  notes: Keep narration consistent with the state block. Never invent dice results.
`,
    },
    {
      label: "stats",
      yaml: `stats:
  health:
    kind: meter
    narrator: 20             # the story may move it by at most 20 per reply
    bands:
      0:  { text: Near collapse., say_down: "You can barely stand." }
      25: { text: Badly hurt.,    say_down: "You're badly hurt." }
      50: { text: Bruised and sore. }
      80: { text: Healthy.,       say: "You feel like yourself again." }
  energy:
    kind: meter
    per_hour: -4             # drains slowly while awake
    narrator: 15
    bands:
      0:  { text: Exhausted., say_down: "You're running on empty." }
      30: { text: Tired. }
      60: { text: Alert. }
  mood:
    kind: meter
    start: 60
    narrator: 10
    bands:
      0:  { text: Miserable. }
      25: { text: Low.,             say_down: "Your spirits sink." }
      50: { text: Steady. }
      75: { text: In good spirits., say: "Things are looking up." }
  money:
    kind: money
    narrator: 100
  body:  { kind: attribute, max: 10, start: 3, desc: "Strength, speed, endurance." }
  mind:  { kind: attribute, max: 10, start: 3, desc: "Wits, knowledge, perception." }
  charm: { kind: attribute, max: 10, start: 3, desc: "Persuasion, presence, nerve." }

growth: { rate: 1 }          # attributes grow a little each time a check leans on them

checks:
  dc: { easy: 8, fair: 12, hard: 16, extreme: 20 }   # difficulty words -> d20 target
  partial: 3                 # missing by 3 or less is a success with a cost
  typed: true                # risky things you type are rolled (never quoted dialogue)
  stats: [body, mind, charm] # what a typed attempt can lean on
  bonus: 10                  # a maxed stat adds +10 (body 3/10 adds +3)
  outcomes:
    fail:      { energy: -5 }
    crit_fail: { health: -10, energy: -5 }
`,
    },
    {
      label: "world",
      yaml: `conditions:
  exhausted: { label: Exhausted,   tone: bad, desc: "Running on empty: -2 to every check.", bonus: { body: -2, mind: -2, charm: -2 } }
  hurt:      { label: Badly hurt,  tone: bad, desc: "Wounds slow you down: -2 to Body.", bonus: { body: -2 } }
  low:       { label: Low spirits, tone: bad, desc: "Hard to put on a brave face: -1 to Charm.", bonus: { charm: -1 } }
`,
    },
    {
      label: "people",
      yaml: `relationships:
  open: true
  big_moment: { factor: 3, cooldown: 10 }
  stats:
    affection:
      start: 20
      narrator: 5
      bands:
        0:  { text: Hostile,  say_down: "{name} has turned against you.", voice: "{name} is openly hostile to {{user}}." }
        15: { text: Cool,     say: "{name} isn't hostile any more.", say_down: "{name} has cooled on you.", voice: "{name} is polite but distant with {{user}}." }
        35: { text: Friendly, say: "{name} likes you.", say_down: "{name} has cooled a little, but still likes you.", voice: "{name} is easy and friendly with {{user}}." }
        60: { text: Close,    say: "{name} counts you as a friend now.", say_down: "{name} is less sure of you than before.", voice: "{name} jokes with {{user}}, takes their side, shares plans." }
        85: { text: Devoted,  say: "{name} would do anything for you.", voice: "{name} puts {{user}} first, even at a cost." }
    trust:
      start: 20
      narrator: 5
      bands:
        0:  { text: Suspicious,  say_down: "{name} doesn't believe a word you say.", voice: "{name} doubts what {{user}} says and checks it." }
        25: { text: Wary,        say: "{name} is starting to give you the benefit of the doubt.", say_down: "{name} is wary of you again.", voice: "{name} listens to {{user}} but checks what matters." }
        50: { text: Trusting,    say: "{name} trusts you.", say_down: "{name} trusts you, but not blindly any more.", voice: "{name} tells {{user}} the truth and asks for help." }
        80: { text: Unshakeable, say: "{name}'s trust in you is unshakeable.", voice: "{name} backs {{user}} without asking why." }
  people: {}                 # the card's character is added here on install

you: {}
`,
    },
    {
      label: "story",
      yaml: `goals:
  from_story: true
  max: 3

triggers:
  exhausted: { when: "energy <= 0", do: { add_condition: [exhausted], hint: "{{user}} is exhausted and struggling to stay upright." } }
  recovered: { when: "energy >= 30", do: { remove_condition: [exhausted] } }
  hurt:      { when: "health < 25",  do: { add_condition: [hurt], hint: "{{user}} is badly hurt: every physical move costs." } }
  mended:    { when: "health >= 50", do: { remove_condition: [hurt] } }
  low:       { when: "mood < 25",    do: { add_condition: [low], hint: "{{user}} is in low spirits and it shows." } }
  lifted:    { when: "mood >= 50",   do: { remove_condition: [low] } }

live_choices:
  count: 3
  guide: "Three moves that differ in risk: one safe, one fair, one hard or extreme. Give each an honest difficulty word."
  taper: { step: 0.75, floor: 0.1 }   # the same tag again soon gives less: 57% the second time, 40% the third, never below 10%
  tags:
    bold:
      desc: "A daring, physical or risky move"
      check: { add: body, label: Body }          # the difficulty word of the written choice sets the target
      success: { mood: +3 }
      fail:    { health: -5, mood: -3, hint: "It goes wrong in a way that changes the situation; no identical retry." }
    clever:
      desc: "Noticing, working something out, or a clever trick"
      check: { add: mind, label: Mind }
      success: { mood: +2 }
      fail:    { mood: -2, hint: "Show what this approach rules out, or a new lead that needs a different approach." }
    charm:
      desc: "Persuading, charming or pressing someone here"
      per_person: true
      check: { add: charm, label: Charm }
      success: { rel: { target: { affection: +3, trust: +2 } } }   # pays more than kind, but has to be rolled
      fail:    { mood: -3, rel: { target: { trust: -2 } }, hint: "It doesn't land; they are put off or unconvinced." }
    kind:
      desc: "Something kind or supportive toward someone here (no roll)"
      per_person: true
      effects: { rel: { target: { trust: +2 } } }
    careful:
      desc: "The cautious option: waiting, watching, backing off (no roll)"
      effects: { energy: +2 }
`,
    },
    {
      label: "actions",
      yaml: `actions:
  rest:  { label: Rest a while, say: "*I take some time to rest.*", time: 60, effects: { energy: +25, health: +5 } }
  sleep: { label: Sleep, say: "*I turn in for the night.*", when: "between(hour, 21, 5)", time: 480, effects: { energy: +100, health: +20, mood: +5 } }
  wait:  { label: Wait an hour, say: "*I let some time pass.*", time: 60 }
`,
    },
    {
      label: "conflict",
      yaml: `conflict:
  from_story: true           # a fight, chase or argument in the story starts a contest
  kinds:
    fight:
      label: Fight
      stats: [body, mind]    # approaches a move may lean on: force, or reading the opponent
      escape: body           # stat for Break off
      cost:                  # what the opponent's pressure costs you this round
        partial:   { health: -3 }
        fail:      { health: -8 }
        crit_fail: { health: -15 }
      won:     { mood: +5, hint: "{opponent} is beaten or yields." }
      lost:    { health: -10, mood: -5, hint: "{{user}} is beaten. {opponent} gets what they wanted; {{user}} is hurt but alive." }
      escaped: { energy: -10, hint: "{{user}} gets away." }
    chase:
      label: Chase
      stats: [body, mind]
      escape: body
      cost:
        fail:      { energy: -8 }
        crit_fail: { energy: -12, health: -5 }
      won:     { hint: "{{user}} wins the chase: catches {opponent} or loses them for good." }
      lost:    { energy: -10, hint: "{opponent} wins the chase." }
      escaped: { hint: "The chase breaks off." }
    argument:
      label: Argument
      stats: [charm, mind]
      escape: charm
      cost:
        fail:      { mood: -4 }
        crit_fail: { mood: -8 }
      won:     { mood: +4, hint: "{opponent} gives in, or is won over." }
      lost:    { mood: -6, hint: "{opponent} wins the argument; {{user}} has to give ground." }
      escaped: { hint: "{{user}} walks away from it." }
`,
    },
  ],
};
