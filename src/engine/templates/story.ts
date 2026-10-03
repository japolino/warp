import type { Template } from "./index.js";

// Story (no dice): CORE-DESIGN §3.1, the Romance template generalised. Feelings move at the story's pace
// (caps per reply, one big-moment exception), band crossings become story lines and change how people speak,
// goals come from the story. Nothing is rolled and typed messages are never read for actions. The time and the
// place come from the greeting, later places from the story, so it fits any card. Attraction is off by default:
// the builder adds it for romance cards.

export const story: Template = {
  id: "story",
  name: "Story",
  blurb: "Time, place, who is here and how they feel about you, with slow-burn relationships and goals from the story. Nothing is rolled. Fits any card.",
  parts: [
    {
      label: "core",
      yaml: `# Warp ruleset. This lorebook is never sent to the model; Warp reads it directly.
name: Story
description: A story that keeps score of feelings, time and place. No dice.
style: story                 # no rolls anywhere; typed messages are never read for actions

clock:
  start: greeting            # read the time (and day, if given) from the greeting
  fallback: "Day 1 18:00"    # used when the greeting gives no time at all
  minutes_per_action: 15
  narrator_max: 720          # the story may skip up to 12 hours per reply

start:
  place: greeting            # read the place from the greeting; later places come from the story

narration:
  notes: >-
    Let feelings grow or cool only as fast as the relationship lines say: a slow burn,
    shown through behaviour (what they notice, remember, choose to say or leave unsaid).
    Never decide {{user}}'s feelings, words or actions. Each person has their own life,
    moods and limits. Intimacy is mutual and only between adults.
`,
    },
    {
      label: "people",
      yaml: `relationships:
  open: true                 # anyone the story introduces is tracked; first feelings are read from the story
  big_moment: { factor: 3, cooldown: 10 }   # a rescue, betrayal or confession may move up to 3x the cap, once per 10 turns per person
  stats:
    affection:
      start: 10
      narrator: 4            # at most 4 per reply: no "strangers to in love" in two messages
      bands:
        0:  { text: Cold,    say_down: "{name} has gone cold on you.", voice: "{name} is curt with {{user}}: short answers, no warmth." }
        10: { text: Neutral, say: "{name} has thawed a little.", say_down: "{name} has cooled toward you.", voice: "{name} is polite with {{user}}, no more." }
        25: { text: Warm,    say: "{name} is warming to you.", say_down: "{name} has pulled back a little.", voice: "{name} relaxes around {{user}}: small jokes, first names." }
        45: { text: Fond,    say: "{name} is fond of you now.", say_down: "{name} is still fond of you, but more careful.", voice: "{name} seeks {{user}} out and remembers small things they said." }
        65: { text: Smitten, say: "{name} can't hide how much they like you.", say_down: "{name}'s feelings for you have cooled a little.", voice: "{name} gets flustered near {{user}} and finds reasons to stay close." }
        85: { text: In love, say: "{name} has fallen for you.", voice: "{name} is openly tender with {{user}} and puts them first." }
    trust:
      start: 15
      narrator: 4
      bands:
        0:  { text: Guarded,  say_down: "{name} doesn't trust you any more.", voice: "{name} gives nothing personal away and watches {{user}} closely." }
        20: { text: Wary,     say: "{name} lets their guard down a little.", say_down: "{name} is wary of you again.", voice: "{name} answers {{user}} but keeps personal things back." }
        40: { text: Open,     say: "{name} is starting to open up.", say_down: "{name} is more careful with you now.", voice: "{name} shares small personal things when asked." }
        65: { text: Trusting, say: "{name} trusts you.", say_down: "{name}'s faith in you has been shaken.", voice: "{name} asks {{user}} for help and tells the truth even when it costs." }
        85: { text: Devoted,  say: "{name} would trust you with anything.", voice: "{name} confides fears and secrets without being asked." }
  # For a romance, the builder adds a third stat:
  # attraction: { start: 0, narrator: 6, good: none, bands: { 0: { text: No spark, say_down: "The spark between you and {name} has gone out." }, 15: { text: Curious, say: "{name} is curious about you.", say_down: "{name}'s interest in you has cooled.", voice: "{name} notices {{user}} more than they let on." }, 35: { text: Drawn, say: "{name} is drawn to you.", say_down: "{name} is less drawn to you now.", voice: "{name} lingers near {{user}} and finds small reasons to touch." }, 60: { text: Wanting, say: "{name} wants you, and it shows.", say_down: "{name} has reined in what they feel for you.", voice: "{name} flirts openly with {{user}} when the moment allows." }, 85: { text: Consumed, say: "{name} can't stop thinking about you.", voice: "{name} can barely hide their desire for {{user}}." } } }
  people: {}                 # the card's character is added here on install (name, appearance, outfit)

you: {}                      # name, appearance and outfit are read from the persona and the greeting
`,
    },
    {
      label: "story",
      yaml: `goals:
  from_story: true           # promises, favours and plans the story makes are tracked
  max: 3

# secrets:                   # the builder fills these from the card; example:
#   past:
#     person: mira
#     tell: exists           # the narrator knows there is more, and deflects instead of inventing
#     cue: "Mira changes the subject whenever her hometown comes up."
#     stages:
#       - { band: { trust: Open },     text: "Mira left her hometown after a fire she blames herself for." }
#       - { band: { trust: Trusting }, text: "Her brother died in that fire; she has never told anyone." }

live_choices:
  count: 3
  guide: "Three different moves in the story's own words: one warm, one honest or bold, one that gives space or moves on."
  tags:
    tender:   { desc: "Something warm, gentle or caring toward someone here", per_person: true }
    playful:  { desc: "Teasing or joking with someone here", per_person: true }
    honest:   { desc: "Saying something true or vulnerable to someone here", per_person: true }
    bold:     { desc: "A bold romantic move with someone here (flirting, getting closer, a confession) only when the moment invites it", per_person: true, tags: [romance] }
    space:    { desc: "Giving room: pulling back, changing the subject, letting a silence sit" }
    onward:   { desc: "Moving the story along: leaving, suggesting somewhere else, ending the day" }
`,
    },
    {
      label: "actions",
      yaml: `actions:                     # small authored moves, shown in the "More" row
  sleep:     { label: Sleep, say: "*I turn in for the night.*", when: "between(hour, 21, 5)", time: 480 }
  pass_time: { label: Let a few hours pass, say: "*I let a few hours drift by.*", time: 180 }
`,
    },
  ],
};
