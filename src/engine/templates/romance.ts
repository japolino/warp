import type { Template } from "./index.js";

// Romance, nothing else: feelings that move at the story's pace (never faster),
// people who remember, time and the calendar, and choices written for the moment
// with no dice. No meters, money, skills or rolls — and your typed messages are
// never turned into checks. Places come from the story, so it fits any card.
export const romance: Template = {
  id: "romance",
  name: "Romance",
  blurb: "Just the romance: slow-burn feelings (affection, trust, attraction) that can't jump faster than the story earns, people who remember what you did, a clock and calendar, and choices written for each moment — no dice, no meters, no money. Typed messages are never rolled. Fits any card or setting.",
  parts: [
    {
      label: "core",
      yaml: `# Warp ruleset — core settings.
# This lorebook is never sent to the model; Warp reads it directly.
name: Romance
description: A love story told at its own pace.

clock:
  start: Fri 18:00
  date: Jun 6               # a calendar, so "next Saturday" and anniversaries mean something
  minutes_per_action: 15
  narrator_max: 720         # the story may skip up to half a day per reply (the next morning, after work…)

weather:
  temps: { spring: 14, summer: 23, autumn: 12, winter: 3 }

# What you type is roleplay, never a dice roll.
improvise: false

narration:
  notes: >-
    This is a romance. Let feelings grow (or cool) only as fast as the relationship lines in the state say —
    a slow burn, shown through behaviour: glances, what they remember, what they choose to say or leave unsaid.
    Never decide {{user}}'s feelings, words or actions. Each person has their own life, moods and boundaries;
    closeness is earned in the story, and intimacy is mutual and only between adults.
`,
    },
    {
      label: "people",
      yaml: `relationships:
  open: true                # everyone the story introduces is tracked; their first feelings are read from the story
  stats:
    affection:
      start: 10
      narrator: 4           # a reply can move it by at most 4: no "strangers to in love" in two messages
      bands: { 0: Cold, 10: Neutral, 25: Warm, 45: Fond, 65: Smitten, 85: In love }
    trust:
      start: 15
      narrator: 4
      bands: { 0: Guarded, 20: Wary, 40: Open, 65: Trusting, 85: Devoted }
    attraction:
      start: 0
      narrator: 6
      good: none
      bands: { 0: No spark, 15: Curious, 35: Drawn, 60: Wanting, 85: Consumed }
`,
    },
    {
      label: "actions",
      yaml: `# Passing time, as a story choice.
actions:
  sleep:
    label: Sleep
    say: "*I turn in for the night.*"
    time: 480
  pass_time:
    label: Let a few hours pass
    say: "*I let the afternoon drift by.*"
    time: 180
`,
    },
    {
      label: "story",
      yaml: `# Choices written for each moment, in the story's own words. No dice: the tag only says
# what kind of move it is; how they react — and how their feelings move — comes from the story.
live_choices:
  label: Right now
  count: 3
  tags:
    tender:
      desc: "Something warm, gentle or affectionate toward someone here"
      per_person: true
    playful:
      desc: "Teasing, flirting or joking with someone here"
      per_person: true
    honest:
      desc: "Opening up to someone here: saying something true, or vulnerable"
      per_person: true
    bold:
      desc: "A bold romantic move with someone here (closer, a confession, a kiss) — only when the moment invites it"
      per_person: true
    space:
      desc: "Giving someone room: pulling back, changing the subject, or letting a silence sit"
    elsewhere:
      desc: "Moving the story along: leaving, suggesting somewhere else, or ending the day"
`,
    },
  ],
};
