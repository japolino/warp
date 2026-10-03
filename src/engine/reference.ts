// The ruleset format (format 2, CORE-DESIGN §1), condensed for a model to write against, plus how to use it well.
// Kept in code so the builder, Warp Studio and the engine can't drift apart.

/** The lorebook entries ("parts") of a ruleset, in order: "warp-ruleset · <label>". */
export const PART_LABELS = ["core", "stats", "people", "world", "actions", "story", "conflict"] as const;
export type PartLabel = (typeof PART_LABELS)[number];

/** Which part each top-level key belongs in (aliases included). Anything else goes to core, where the checker flags it. */
export const PART_OF_KEY: Record<string, PartLabel> = {
  name: "core", description: "core", style: "core", clock: "core", start: "core", hud: "core", narration: "core",
  stats: "stats", growth: "stats", practice: "stats", checks: "stats", improvise: "stats", improvised: "stats",
  relationships: "people", people: "people", you: "people", player: "people",
  items: "world", inventory: "world", conditions: "world", flags: "world",
  actions: "actions",
  secrets: "story", live_choices: "story", goals: "story", triggers: "story", rules: "story",
  conflict: "conflict",
};

/** What each part holds. */
export const PART_CONTENTS: Record<PartLabel, string> = {
  core: "name, description, style, clock, start, hud, narration",
  stats: "stats, growth, checks",
  people: "relationships (stats, big_moment, people), you",
  world: "items, inventory, conditions, flags",
  actions: "actions",
  story: "goals, secrets, live_choices, triggers",
  conflict: "conflict",
};

/** Which part an issue's "where" belongs to ("Live choices › tags › charm" → story; "warp-ruleset · people, line 3" → people). */
export function partForIssue(where: string): PartLabel {
  const w = where.replace(/^warp-ruleset\s*·\s*/i, "");
  const head = w.split(/[›,]/)[0].trim().toLowerCase();
  if ((PART_LABELS as readonly string[]).includes(head)) return head as PartLabel;
  return PART_OF_KEY[head.replace(/\s+/g, "_")] ?? "core";
}

export const REFERENCE = `WARP RULESET FORMAT 2 (YAML). One file, or one lorebook entry per part ("warp-ruleset · core", "· stats", …).
Ids are snake_case. Numbers may be formulas in quotes ("10 + body"). Quote any formula that contains a comma. {{user}} is the player.

--- # core
name: Harbour Nights                  # shown on the panel; description: one line about it
description: A fishing town where the tide brings secrets.
style: adventure                      # story = no dice anywhere (no check:, no typed rolls, no conflict:) | adventure = d20 checks at risky moments, contests
clock:
  start: greeting                     # read the time (and the day) from the greeting; or a fixed start: "Day 1 07:30", "Mon 07:30"
  fallback: "Day 1 09:00"             # used when the greeting gives no time
  date: "Sep 4"                       # optional calendar date of day 1 (or greeting)
  minutes_per_action: 10              # what a move takes unless it says time:
  narrator_max: 480                   # the most minutes the story may skip in one reply
  # weekdays: [Mon, Tue, …]; enabled: false turns the clock off
start: { place: greeting, items: { phone: 1 }, money: 50, stats: { mood: 70 } }   # place: greeting or words ("The Rusty Anchor"); later places come from the story
hud: { currency: "$", bars: [health, energy, mood, stress] }   # currency: "$" (before), "{n}d" / "£{n}" (template) or { symbol: d, after: true }; bars: the meters on the panel (default: every meter; a meter left out is shown nowhere)
narration: { notes: "Guidance for the narrator, in a line or two.", numbers: false }   # numbers: true shows numbers next to band words

--- # stats
stats:                                # kinds: meter (a bar) | attribute | skill | money | hidden
  health: { kind: meter, narrator: 20, bands: { 0: Near collapse., 25: Badly hurt., 80: Healthy. } }
  energy: { kind: meter, per_hour: -4, narrator: 15 }      # per_hour: drift (a number, a formula or "+2%" of the max)
  stress: { kind: meter, good: low, start: 0, narrator: 10, narrator_words: [panic, scared] }
  mood:
    kind: meter
    start: 60                         # a number, full, "50%" of the max, or a formula
    bands:                            # short form "25: Low." or the long form:
      25: { text: Low., say_down: "Your spirits sink." }   # say: a story line when the value enters this band from below; say_down: from above
      # no say: = the line is "Mood — Low."; say: "" = no line (for label-like bands)
      75: { text: In good spirits., say: "Things are looking up." }
  money: { kind: money, narrator: 100 }
  body: { kind: attribute, max: 10, start: 3, desc: "Strength, speed, endurance." }
  mind: { kind: attribute, max: 10, start: 3 }
  charm: { kind: attribute, max: 10, start: 3 }
  cooking: { kind: skill, max: 100, start: 5, grades: [F, D, C, B, A, S], group: Skills }   # group: the panel heading
  # good: high | low | none (colours); min/max (max may be a formula, "20 + body * 5"); label:, desc:, color:
  # narrator: the most the story may move it per reply (0 = only the rules move it); gates on what the story may change:
  #   narrator_when: "not in_contest", narrator_words: [panic] (the exchange must mention one), narrator_actions: [fight] (action ids or tags)
  # show: text | number | both | hidden; bands: { 0%: Down., 40%: Wounded. } compare against the current max
  # skills and attributes grow with use: every check that leans on them adds progress; growth: 0 on a stat stops it, growth: 2 doubles it
growth: { rate: 1, attributes: 0.5, train: true }   # or growth: false; repeat: { step: 0.5, floor: 0.1, recover_minutes: 120, recover_turns: 8 } tapers repeated practice
checks:                               # adventure only: the one check style, d20 + a modifier vs a difficulty
  dc: { easy: 8, fair: 12, hard: 16, extreme: 20 }   # difficulty words → d20 target (normal = fair)
  partial: 3                          # missing by 3 or less is a partial success (it works, at a cost)
  typed: true                         # risky, contested things the player types are rolled (never quoted dialogue)
  stats: [body, mind, charm]          # what a typed attempt may lean on (default: every attribute and skill)
  bonus: 10                           # what a maxed stat adds (body 3/10 adds +3)
  time: 10                            # minutes a typed attempt takes (default minutes_per_action)
  directions: { fail: "It doesn't work, and the situation changes." }   # the narrator's direction per tier (defaults exist: fail forward)
  outcomes: { fail: { energy: -5 }, crit_fail: { health: -10 } }       # effects of typed attempts per tier
  # checks: false = typed messages are never rolled

--- # people
relationships:
  open: true                          # track anyone the story introduces (their first feelings are read from the story)
  big_moment: { factor: 3, cooldown: 10 }   # a rescue, betrayal or confession may move one person past the cap (× factor, one band at most), once per cooldown turns; or false
  stats:
    trust:
      start: 20
      narrator: 4                     # slow burn: at most 4 per reply
      bands:
        0: { text: Wary, say_down: "{name} is wary of you again.", voice: "{name} gives nothing personal away." }
        40: { text: Open, say: "{name} is starting to open up.", voice: "{name} shares small personal things when asked." }
        # voice: how this person speaks and acts toward {{user}} while in this band; {name} = the person
  people:
    jo:
      name: Jo
      age: 31                         # declare adult ages (an unknown age is asked once, never assumed)
      desc: Runs the café.
      appearance: "tall, grey braid"  # looks and clothes as short text (≤160 chars); empty = read from the greeting and the story
      outfit: "flour-dusted apron"
      start: { trust: 35 }            # starting feelings (absent = read from the story the first time they appear)
you: { name: Sam, age: 24, appearance: "short, freckles", outfit: "grey hoodie" }   # all optional: empty = read from the persona and the greeting

--- # world
items:
  phone: Phone
  rope: { name: Rope, desc: "Thirty feet of it.", tags: [tool], keep: true }   # keep: using it doesn't spend it
  medkit:
    name: Medkit
    uses: 3                           # uses per item; the last use spends it (tags: [consumable] = 1 use)
    use: { label: Patch yourself up, time: 15, health: +20 }   # what using it does: an action like any other (check:, success:, when:, why_not: …)
  lucky_charm: { name: Lucky Charm, bonus: { charm: 1 } }      # gear: added to every check on that stat while carried (a number or a formula)
inventory: { open: true }             # open: false = the story can't hand out items the ruleset doesn't list
conditions:
  exhausted: { label: Exhausted, tone: bad, desc: "-2 to every check.", bonus: { body: -2, mind: -2 }, lasts: 8h }   # tone: good | warn | bad | neutral; lasts: absent = until removed; narrator: true lets the story add or remove it
flags:
  met_boss: { start: false, narrator: true }   # narrator: true = the story may set it (true/false flags only)
  sister_found: false                 # a flag only the rules set (flags: { sister_found: true } in an effect)
  saw_photo: { start: false, narrator: true }

--- # actions
actions:                              # the small authored moves, shown in one "More" row and in a person's row
  rest: { label: Rest a while, say: "*I take some time to rest.*", time: 60, effects: { energy: +25 } }
  sleep: { label: Sleep, when: "between(hour, 21, 5)", why_not: "Not tired yet", time: 480, effects: { energy: +100 } }
  pick_lock:
    label: Pick the lock
    say: "*I kneel and work the lock.*"   # the line posted as the player's message
    when: "has('lockpick')"           # shown only while it holds (why_not: "…" shows it locked instead)
    cost: { energy: -5 }              # paid first, whatever happens; a cost it can't pay locks the choice
    check: { vs: hard, add: body, label: Body }   # vs: easy | fair | hard | extreme | a number | a formula; add: the modifier (a formula); partial: 2
    success: { flags: { door_open: true } }
    fail: { hint: "The pick snaps; someone heard." }
    # tiers: crit_success, success, partial, fail, crit_fail (or outcomes: { … }); a natural 20 is a critical success, a natural 1 a critical failure
    # effects: next to a check always apply; without a check, effects: is what the action does
    tags: [crime]                     # content tags for Lines & Veils; romance / romantic / sexual also mean adults only: such a move toward someone is offered only when they are known to be an adult (tag every romantic move)
  talk:
    label: Talk with {target}
    per_person: true                  # one button per person here, in their row; {target} / target = that person
    effects: { rel: { target: { trust: +2 } } }
  # targets: [jo] (per person, only these); hidden: true (never a button); params: { difficulty: { easy: 8, hard: 16 } }
  # requires: { body: 5, with: jo, has: rope, rel: { jo: { trust: 40 } }, goal: find_sister, flag: door_open, when: { "hour >= 20": "After dark" } }
  #   shown locked with what's missing ("Needs Body 5, Jo with you"); show_locked: false hides it instead
  # Story rulesets: no check: (an action runs its effects:)

--- # story
goals:
  from_story: true                    # promises, favours and plans the story makes are tracked (judged after each reply)
  max: 3                              # open at once
  list:                               # optional authored goals; they start open
    find_sister: { text: "Find out what happened to your sister", done_when: "flag('sister_found')", judge: "{{user}} learns where their sister is", stakes: "She may not survive the winter", reward: { mood: +10 } }
    # fail_when: a formula; judge_fail: plain words judged by the story
secrets:                              # only opened stages reach the narrator: what isn't in the prompt can't leak
  past:
    person: jo                        # who it is about (an id in relationships.people); about: "The old mill" for a place or thing
    tell: exists                      # the narrator knows there is more, and deflects instead of inventing
    cue: "Jo changes the subject when her hometown comes up."   # known from the start: behaviour, never the reason
    stages:                           # a ladder: each opens in order, never closes
      - { band: { trust: Open }, text: "Jo left her hometown after a fire she blames herself for." }   # band: opens when the person reaches that band
      - { when: "rel('jo', 'trust') >= 65 and flag('saw_photo')", text: "Her brother died in that fire.", lore: [Lorebook entry title] }
live_choices:                         # 3 choices written for each reply; each carries one of these tags, and the TAG decides what happens
  count: 3
  guide: "Three moves that differ in risk: one safe, one fair, one hard."
  taper: { step: 0.75, floor: 0.1 }   # the same tag on the same person again soon gives less (× 1 / (1 + step × repeats), never below floor); or false
  # label: Right now; when: "not in_contest"
  tags:
    bold: { desc: "A daring, physical or risky move", check: { add: body, label: Body }, success: { mood: +3 }, fail: { health: -5, hint: "It goes wrong in a new way." } }
    # a tag check without vs: takes the difficulty word the writer gives the choice (none = no roll), so the odds follow the words
    charm: { desc: "Persuading someone here", per_person: true, check: { add: charm, label: Charm }, success: { rel: { target: { trust: +3 } } } }
    kind: { desc: "Something kind toward someone here (no roll)", per_person: true, effects: { rel: { target: { trust: +2 } } } }
    careful: { desc: "The cautious option (no roll)" }
triggers:
  exhausted: { when: "energy <= 0", do: { add_condition: [exhausted], hint: "{{user}} is running on empty." } }   # fires once when it becomes true
  drain: { when: "stress >= 80", repeat: true, do: { energy: -2 } }   # every turn while true
  danger: { when_scene: "{{user}} is in immediate danger", do: { stress: +5 } }   # plain words, judged after the reply (only while its when:, if any, holds); fires on the next turn
  # WHEN RULES RUN: in declaration order, in passes until nothing changes, in every batch of changes: the turn's own resolve (before
  #   the reply), the post-reply read (turn is already the next turn there), the greeting read and a hand edit.
  #   An edge rule fires each time its condition turns true (in any batch). A repeat: rule runs once per player turn, in the turn's own
  #   resolve only; its hint: is dropped if a later rule makes it false that turn. turn counts up at the end of the resolve, so a
  #   "turn - at >= 2" timeout fires in the read after the next reply (one message later); use ">= 3" for two messages.
  #   roll() in a when: is one number per batch, and rolls again in the next batch: for a random event, roll in a repeat rule and
  #   stamp the turn (do: { set: { rnd: "roll('1d100')", rnd_turn: "turn" } }), then require "rnd_turn == turn and rnd <= 30".

--- # conflict
conflict:                             # adventure only: fights, chases and arguments on one momentum gauge (−100 … +100)
  from_story: true                    # a fight, chase or argument in the story starts a contest (or the effect contest:)
  rounds: { min: 3, max: 8 }          # each check swings the gauge; only a full swing (or Break off / Give in) ends it
  escalate: 0.4                       # the stakes rise each round
  swing: { crit_success: 50, success: 35, partial: 15, fail: -35, crit_fail: -50 }
  kinds:
    fight:
      label: Fight
      stats: [body, mind]             # what a move may lean on
      escape: body                    # the stat Break off rolls
      cost: { partial: { health: -3 }, fail: { health: -8 }, crit_fail: { health: -15 } }   # what the opponent's pressure costs per round
      won: { mood: +5, hint: "{opponent} is beaten or yields." }
      lost: { health: -10, hint: "{{user}} is beaten, hurt but alive." }
      escaped: { energy: -10, hint: "{{user}} gets away." }
    argument: { label: Argument, stats: [charm, mind], escape: charm, cost: { fail: { mood: -4 } }, won: { hint: "{opponent} gives in." }, lost: { hint: "{{user}} has to give ground." }, escaped: { hint: "{{user}} walks away." } }

EFFECTS (any effects / success / fail / cost / do / reward / won block):
  stat shorthand: energy: -5 (or a quoted formula: money: "-min(money, 20)"); stats: { energy: -5 }; set: { stress: 50 }
  flags: { door_open: true }; give: rope / take: rope; items: { rope: 2 }
  rel: { jo: { trust: +3 } } (rel: { target: … } in a per-person move; rel: { opponent: … } in a contest)
  place: "The docks" (where {{user}} is now, in words); time: 30 (minutes pass)
  look: { you: { outfit: "a borrowed coat" }, jo: { appearance: "a bruise on her cheek" } }
  add_condition: [exhausted] or { exhausted: 120 }; remove_condition: [exhausted]
  hint: "a direction for the narrator"; remember: { jo: "{{user}} paid for her drink." } (something a person remembers)
  reveal: [past] (opens a secret's next stage); goal: { find_sister: done } (start | done | fail)
  contest: { kind: fight, with: "the bouncer", threat: hard } (starts a contest); swing: +20 (moves a running contest's gauge like a check: it stops at ±90 before rounds.min; a full swing ends the contest)
  decide: { ask: "How does Jo react?", options: { agrees: { desc: "She agrees", weight: 2, rel: { jo: { trust: +2 } } }, refuses: { desc: "She refuses", weight: 1 } } }
    (an uncertain reaction the engine rolls on the decision model's odds; options may have when:)

FORMULA NAMES: every stat id, every flag id, minutes, hour, minute, day, weekday, turn, place (the words), round, momentum, in_contest,
target (the person of a per-person move), target.<rel stat>, <person>.<rel stat>, items.<id>, flags.<id>.
FUNCTIONS: has(item[, n]), count(item), flag(x), cond(x), rel(person, stat), met(person) (has been in a scene with {{user}}), present(person) (in the scene now),
between(v, lo, hi) (wraps: between(hour, 21, 5)), roll('2d6') (in effects), goal(id) ('' | 'open' | 'done' | 'failed'), secret(id) (stages known),
in_contest() / in_contest('fight'), eff(stat) (with gear and conditions), gear(stat) (gear alone), min, max, clamp, floor, ceil, round, abs.
Operators: + - * / % < <= > >= == != and or not, a ? b : c. Strings in single quotes.

NOT IN WARP ANY MORE (ignored with a warning; the old version is on the legacy branch): encounters (use conflict:), quests (use goals:),
locations and travel (places come from the story), weather, wardrobe slots and body parts (use appearance / outfit text), perks, feats, codex,
abilities, fronts and random events (use triggers with when_scene:), bills and jobs, companions and schedules, checkpoints and endings,
dungeons, dating, minigames, d100 and PbtA checks (every check is d20 vs a difficulty).
`;

/**
 * How to use the format well: what each piece is FOR, what good looks like, and the usual mistakes. The syntax
 * above says what's possible; this says what's worth doing.
 */
export const DESIGN_GUIDE = `WARP DESIGN GUIDE: what makes a ruleset worth playing.
Warp keeps score under a roleplay chat: time and place, who is here and how they feel about {{user}}, risky moments the narrator can't
fudge. A good ruleset is small. Every piece changes what the player decides, how the people act, or what a roll means.

## the core loop
Two styles. Story (no dice): feelings, time, place, goals and secrets; nothing is rolled. Adventure (dice): everything in Story, plus d20
checks at risky, contested moments and contests on one momentum gauge. Pick one; never mix in systems the format doesn't have.

## stats
Few stats, each wired: a source (what raises it), a sink (what lowers it) and a consequence (a check, a trigger or a band line that reads it).
Meters in words: give bands, so the narrator and the panel speak in words ("Badly hurt."), and a say:/say_down: line on the bands that matter.
Attributes and skills grow when checks lean on them; never build "+1 Body" buttons.
Mistake: ten meters that only the narrator touches.

## people
Two or three relationship stats with bands. Slow burn: narrator: 4 or 5 per reply, and big_moment for rescues, betrayals and confessions.
Every band past the start gets a say: line (shown when it is crossed) and the bands that matter get a voice: (how the person speaks then),
so a crossing changes the next reply. Give the card's people starting feelings that match the card, and appearance/outfit if the card says.
For a romance, add a third stat (attraction, good: none). Keep everyone an adult, and say so with age:.

## checks
Roll only what is risky and contested; plain talk and ordinary actions never roll. The difficulty word sets the target (easy 8, fair 12,
hard 16, extreme 20); a stat adds its share of checks.bonus. Every failure needs a direction that changes the situation (a hint: or the
default): no identical retry, no wasted turn. Partial = it works, at a cost.

## choices
Live-choice tags differ in risk and payoff: one safe, one fair, one hard. Tag checks have no vs: so the odds follow the written words.
A no-roll tag that improves a relationship stays small (+2) and the taper makes repeating it pay less; a rolled tag pays more.
Mistake: a "kind" tag that beats every other choice, so the player clicks it forever.

## conflict
Contest kinds for what the card actually has: a fight, a chase, an argument, a duel, a debate. Each kind leans on two stats, names an
escape stat, and costs something real per round (cost:), with won/lost/escaped outcomes that change the story. No foe stats: the
opponent is whoever the story brings.

## goals
Let the story make goals (from_story: true). Author at most one or two that the card promises, with stakes: and a way to finish them
(done_when: a formula, or judge: plain words). A reward: makes finishing matter.

## secrets
For each person who hides something: a cue: (behaviour, never the reason), tell: exists, then two stages opened by band (band: { trust: Open },
then a deeper band). The narrator only learns what is opened, so the reveal is earned.

## items
Every item does something: a use: (an action), a bonus: (gear for the checks on a stat), or a move that needs it (when: "has('rope')").
Consumables get uses:, tools get keep: true. Give the player a way to get each item that matters.

## conditions
A condition changes play: a bonus: (or a penalty) on checks, a trigger that reads it, or an action it opens or closes. Each needs a cause
(add_condition) and a cure or lasts:.

## money
Money needs income (paid work, rewards, the story) and spending (actions that cost it). If either is missing it is just a number.
Set hud.currency to fit the setting (gold, credits, ¥).

## finishing
Prefer fewer pieces with stronger links. Done when every stat, item and condition does something, the choices differ in risk, a failure
always changes the next decision, and nothing names a system Warp doesn't have.
`;
