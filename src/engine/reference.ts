// The ruleset format, condensed for a model to write against. Kept in code so
// the AI builder and the engine can't drift apart.

export const PART_LABELS = ["core", "stats", "people", "world", "actions", "encounters", "journal", "rules", "story", "dating"] as const;
export type PartLabel = (typeof PART_LABELS)[number];

/** What each lorebook entry ("part") holds. */
export const PART_CONTENTS: Record<PartLabel, string> = {
  core: "name, description, player, clock, start, hud, narration",
  stats: "stats, growth",
  people: "relationships (stats + people with schedules), companions, lineage",
  world: "weather, locations, items (incl. clothing, uses and gear bonuses), item_uses, wardrobe, body, conditions, flags, start.items",
  actions: "actions, improvise, obligations, jobs",
  encounters: "encounters, dungeons",
  journal: "codex, feats, perks, checkpoints, endings",
  rules: "triggers, mind",
  story: "secrets, fronts, random_events, live_choices",
  dating: "dating (tastes, topics, venues), plus gift items and actions to get them",
};

/** Which part an issue's "where" belongs to. */
export function partForIssue(where: string): PartLabel {
  const w = where.replace(/^warp-ruleset\s*·\s*/i, "");
  const head = w.split(/[›,]/)[0].trim().toLowerCase();
  if ((PART_LABELS as readonly string[]).includes(head)) return head as PartLabel;
  if (head.startsWith("stats") || head.startsWith("growth")) return "stats";
  if (["relationships", "people", "companions", "lineage"].some((k) => head.startsWith(k))) return "people";
  if (["locations", "items", "item uses", "wardrobe", "weather", "conditions", "flags", "body"].some((k) => head.startsWith(k))) return "world";
  if (["actions", "improvise", "obligations", "jobs"].some((k) => head.startsWith(k))) return "actions";
  if (head.startsWith("encounters") || head.startsWith("dungeons")) return "encounters";
  if (["codex", "feats", "perks", "checkpoints", "endings"].some((k) => head.startsWith(k))) return "journal";
  if (head.startsWith("triggers") || head.startsWith("rules") || head.startsWith("mind")) return "rules";
  if (["secrets", "fronts", "random events", "live choices"].some((k) => head.startsWith(k))) return "story";
  if (head.startsWith("dating")) return "dating";
  return "core";
}

export const REFERENCE = `WARP RULESET FORMAT (YAML). Numbers may be formulas in quotes. Meters are 0–100 unless there's a reason.

stats:            # kinds: meter (bar) | attribute | skill | money | hidden
  stress: { kind: meter, good: low, start: 0, per_hour: -0.5, narrator: 10, bands: { 0: You are calm., 30: You are stressed., 70: You are distressed. } }
  athletics: { kind: skill, max: 100, start: 10, grades: [F, D, C, B, A, S] }
  money: { kind: money, start: 50, narrator: 50 }
  # good: high|low|none (colours); per_hour: drift; narrator: max change the story may make per reply (0 = rules only); max may be a formula ("level * 5")
  # limit what the story may change (stats, relationship stats, flags, conditions): narrator_when: "not in_encounter",
  #   narrator_words: [panic, scared] (the exchange must mention one), narrator_actions: [fight, violence] (action ids or tags)
  # skills and attributes improve with use: every check that reads them (and practice the story describes) adds progress; growth: 0 on a stat stops it, growth: 2 doubles it
growth: { rate: 1, attributes: 0.5, train: true }   # optional; growth: false turns it off. Attributes move at half the skill rate by default

relationships:
  open: true                       # track new people the story introduces
  stats: { trust: { start: 10, narrator: 5, bands: { 0: Wary, 40: Trusting } } }
  people:
    jo:
      name: Jo
      desc: Runs the café.
      schedule:                    # first matching entry wins; entry without when = default; no match = not around
        - { when: "between(hour, 7, 18) and weekday != 'Sun'", at: high_street }

companions:       # people with lives of their own (ids from relationships.people)
  jo:
    goal: Buy the café outright              # shown on the sheet
    arc: { per_day: 2, stages: [ { at: 40, hint: "Jo's doing sums at closing time.", surface: "Jo makes an offer on the café." } ], story: { "{{user}} helps Jo at the café": 10 } }   # a hidden clock, same shape as a front; runs once met
    daily:                                   # a choice they make each in-game day; the decision model weighs it; arc/bond here mean Jo
      ask: How does Jo spend her evening?
      options: { shift: { desc: Works an extra shift, weight: 2, arc: +6 }, out: { desc: Goes drinking with Dex, weight: 1, bond: { dex: +5 } } }
    jealous_of: [dex]                        # or [anyone]: cools toward {{user}} (and the rival) when {{user}} grows close to them
    bonds: { dex: 30 }                       # how they feel about others, −100…100
    knows: [ward_accident]                   # secrets only they know: the narrator plays them with it, nobody else can mention it
EFFECTS for companions: arc: { jo: +5 }, bond: { jo: { dex: -10 } }. FUNCTIONS: arc(person), bond(a, b).

lineage:          # pregnancy and children; only ever between two people known to be adults (declare ages, or the decision model is asked)
  pregnancy: { weeks: 36, stages: [ { week: 6, text: "{carrier} has been sick in the mornings." }, { week: 16, text: "It's starting to show." } ] }   # hidden until the first stage
  children: { speed: 1, join_at: 18, inherit: [hair, eyes] }   # speed = how much faster than the calendar they age; they stay off-stage family until join_at (never below 18) and are never part of romance
EFFECT: conceive: { with: target, chance: 20, carrier: player }   # carrier: player | partner. FUNCTIONS: children(), age(person); names: pregnant, pregnancy_weeks.

name: Harbour Town                 # the game's name (shown on the HUD); description: one line about it
description: A fishing town where the tide brings secrets.
clock: { start: "Mon 07:00", date: "Sep 4", minutes_per_action: 15, narrator_max: 240 }
start: { location: home, items: { phone: 1 } }
hud: { currency: "$", bars: [health, stress] }
narration: { notes: "Guidance for the narrator." }
player: { age: 20 }

weather: { temps: { spring: 12, summer: 22, autumn: 11, winter: 3 } }     # enables weather + temperature
locations:
  home: { name: Home, desc: "...", indoors: true, exits: [street], travel: 10 }   # exits become travel buttons
locations_open: true             # the story may name places the ruleset doesn't list (on by default when there are none)
items:
  phone: Phone
  raincoat: { name: Raincoat, slot: outer, warmth: 5, reveal: 0, traits: [rainproof] }   # clothing = item with a slot
  pepper_spray:                    # an item that DOES something: use: is an action offered while it's held (in encounters too)
    name: Pepper Spray
    uses: 5                        # charges; each use spends one, the last spends the item (tags: [consumable] = 1 use)
    use: { label: Spray it, foe: { nerve: -6 }, hint: "{{user}} empties a burst into their face." }   # effects (or check/success/fail like any action); when:, why_not: "…" optional
  lucky_boots: { name: Lucky Boots, slot: feet, bonus: { athletics: 10 } }   # gear: added to every check that reads athletics while worn (carried, for non-clothing)
  house_keys: { name: Keys, keep: true, use: { label: Lock the door behind you, stress: -5, when: "at('home')" } }   # keep: true = using it doesn't spend it
item_uses: { phone: { label: Call a friend for a lift, check: { chance: 60 }, success: { move: home }, fail: { stress: +3 } } }   # uses/bonuses for items declared elsewhere (Warp writes drafted ones here)
wardrobe: { slots: [outer, top, bottom, under_top, under_bottom, feet], cover: [top, bottom], start: [t_shirt, jeans] }
conditions: { cold: { label: Cold, tone: bad } }
flags: { met_boss: { start: false, narrator: true } }

actions:
  pick_lock:
    label: Pick the lock
    group: Explore
    say: "*I kneel and work the lock.*"
    at: [street]                   # optional location filter
    when: "has('lockpick') and between(hour, 20, 6)"
    time: 10                       # minutes
    cost: { fatigue: +2 }
    tags: [crime]
    check: { chance: "20 + skulduggery / 2", label: Skulduggery }      # d100 roll-under percent
    # or check: { vs: 12, add: "floor(dex / 2)", partial: 3 }          # d20 + add vs 12
    # or check: { style: pbta, add: cool }                             # 2d6: 10+ hit, 7–9 mixed
    success: { flags: { door_open: true }, skulduggery: +1 }
    fail: { stress: +5, hint: "The pick snaps." }
    # tiers: crit_success, success, partial, fail, crit_fail; without a check use effects:
  chat:
    label: Chat with {target}
    per_person: true               # one button per person present; {target} = their name
    effects: { rel: { target: { trust: +2 } } }
  sneak:
    hidden: true                   # free-text only: the referee maps typed attempts to it
    desc: Staying unseen.
    params: { difficulty: { easy: 70, normal: 45, hard: 25, extreme: 10 } }   # easiest → hardest
    check: { chance: "difficulty + skulduggery / 2" }

improvise:        # optional (on by default): typed attempts no action covers still roll — d20 + the closest ability's share of bonus vs a DC by difficulty
  dc: { easy: 8, fair: 12, hard: 16, extreme: 20 }
  bonus: 10                        # what a maxed-out ability adds
  partial: 3                       # missing by this much is a partial success
  stats: [athletics, charm]        # abilities an attempt may lean on (default: every skill and attribute)
  outcomes: { crit_fail: { stress: +5 } }   # optional effects by result; the story's own reading records the rest
  # improvise: false turns it off (then only listed actions roll)

EFFECTS (any success/fail/effects/cost/do block):
  stat shorthand (fatigue: +5, may be a quoted formula), set: { stress: 50 }, flags: { x: true }, give: item / take: item,
  rel: { jo: { trust: +3 } }, move: location, time: 30, add_condition: [cold] or { cold: 120 }, remove_condition: [cold],
  hint: "direction for the narrator", wear: [raincoat], undress: [top], damage: { top: 20 },
  start_encounter: id, foe: { hp: -6 }, end: outcome_id, unlock: [codex_id],
  decide: { ask: "How does Jo react?", options: { yes: { desc: "Agrees", weight: 2, rel: { jo: { trust: +2 } } }, no: { desc: "Refuses", weight: 1 } } }
  Formulas with commas MUST be quoted: money: "-min(money, 20)".

encounters:
  mugging:
    name: Mugging
    tags: [violence]
    foe: { name: Mugger, stats: { nerve: { start: 10, max: 10 } } }
    actions: { fight: { label: Fight back, check: { chance: "30 + athletics / 2" }, success: { foe: { nerve: -6 } }, fail: { pain: +10 } }, run: { label: Run, effects: { end: escaped } } }
    foe_moves: { grab: { desc: "Grabs you", weight: 2, pain: +8 }, threaten: { desc: "Threatens", weight: 1, stress: +6 } }
    end_when: { won: "foe.nerve <= 0", beaten: "pain >= 80" }   # simple comparisons let Warp show the goal and the danger to the player
    outcomes: { won: { hint: "They flee." }, escaped: { stress: +3 }, beaten: { money: "-min(money, 30)" } }
    labels: { won: "You see them off", escaped: "You got away", beaten: "Overpowered" }   # how each ending reads
    goal: "Break their nerve, or get away"        # optional; otherwise derived from end_when
    danger: "Pain at 80 and you're overpowered"   # optional; otherwise derived
    # narrate: true = every round goes to the narrator as a full reply (old style). Default: rounds are told briefly
    #   in one encounter message that grows, then replaced by a summary — far fewer tokens, no repetitive loops.
    # an action out of reach can say why: when: "has('bat')", why_not: "You'd need something to swing"
    # from_story: false = only actions/effects start it (by default the story can: a fight breaking out in the prose starts it, against whoever it's with)
    # momentum: { win: won, lose: beaten, swing: { crit_success: 40, success: 25, partial: 10, fail: -20, crit_fail: -35 } }
    #   a fight that swings (−100…+100): each check moves it, foe moves can too (effect momentum: -15), and only a full swing ends it;
    #   each round reaches the narrator as ordered beats (a long typed move is kept as written). Formula name: momentum.

dungeons:         # roguelike diving: floors of face-down tiles, one way down, quit any time (keep the loot; get wiped out and lose it)
  old_mines:
    name: The Old Mines
    at: [docks]                    # entrance locations (empty = anywhere)
    theme: cave                    # cave | crypt | ruins | hell | lair
    floors: 10                     # 0 = endless; a guardian every boss_every floors (default 5)
    tiles: { enemy: 6, elite: 1, treasure: 2.5, trap: 1.5, rest: 1, shop: 0.6, event: 2, surprise: 1.5, romance: 1.2, empty: 7 }
    loot: { lockpick: 2 }          # ruleset items that can turn up in chests
    party: { max: 3, when: "rel(target, 'trust') >= 30", classes: { jo: healer } }   # fighter | mage | healer | rogue | adventurer
    player: { class: adventurer, atk: "10 + athletics / 10" }                       # battle stats from ruleset stats (optional)
    on_leave: { fatigue: +15 }
    on_defeat: { pain: +40, stress: +20 }
    events:                        # added to the built-ins (builtin_events: false to drop them); romance: works the same with {target}
      smugglers_cache: { text: "A smugglers' cache behind a loose stone.", choices: { take: { label: Take it, gold: "30 + depth * 10", crime: +5 }, leave: { label: Leave it } } }
    # choice outcome keys: text, heal, hurt, mana (percent), gold, xp, bag { potion: 1 }, fight (enemy|elite|monster id), bond, desire, plus any effect; chance: "60" rolls d100
    # monsters: { id: { name, like: goblin, tier: 1-4, hp, atk, def, mat, mdf, agi, skills: [attack, smash], xp, gold } }; bosses: [orc_warlord, hydra]

body:             # the player character's body; the story may change it after a reply (narrator: false to stop that; open: false = only these parts)
  parts: { hair: { color: brown, length: shoulder-length }, eyes: { color: green }, ears: human, build: { height: average } }   # any parts, any traits
  hidden_by: { chest: [top, under_top] }       # wardrobe slots covering a part: others see it when any of them is empty
  transforms:
    feline_splice: { label: Feline splice, chance: 70, stages: [ { set: { ears: { type: cat } }, text: "Soft cat ears push up through {{user}}'s hair." }, { set: { tail: { type: cat } } } ] }
EFFECTS for the body: body: { hair: { color: red } } (null removes a trait), transform: { feline_splice: 1 } (advance stages; each rolls its chance).
FUNCTIONS: body('hair', 'color') ('' when absent), transformed('feline_splice') (stages so far).

discovery:        # exploring can turn up places the ruleset never had; each is written into the ruleset lorebook and stays on the map
  at: [docks, park]                # where (empty = anywhere); found places can be explored too
  chance: 25                       # percent per try (formula); each fruitless try adds 10
  max: 12
  guide: "Small, grounded places: a back-alley bar, a hidden garden."
observers:        # being seen: while \`when\` holds, each adult present reacts individually (the decision model reads them; children never take part)
  when: "exposed > 0"
  crowd: 2                         # anonymous passers-by when outdoors
  reactions: { interested: { rel: { target: { lust: +4 } } }, disapproving: { rel: { target: { trust: -3 } } } }   # unnoticed | glance | interested | disapproving | predatory
  rumours: true                    # witnesses tell people they're close to (bonds ≥ 25), once a day. FUNCTIONS seen_by(person), fame()
obligations:      # bills on the calendar: "Pay…" choices appear while something is owed; a missed one lets the creditor decide
  rent: { amount: 120, every: 7, first: 7, grace: 1, creditor: landlord, at: [apartment], late: { ask: "The rent is late. What does {creditor} do?", options: { warn: { desc: A warning, weight: 3 }, fee: { desc: A late fee, weight: 1, money: -25 } } } }
  # arrears pile up; FUNCTIONS owed(id), missed(id), days_until(id)
jobs:             # a shift of customers, each wanting a style; your pick (or your typed words, judged by the model) sets their mood and tip
  lunch_rush:
    label: Cover the lunch rush
    at: [high_street]
    customers: 3
    pay: 25                        # for the shift (formula); tip: per customer, scaled by how happy they are
    tip: 4
    skill: tending                 # helps every customer's mood
    gain: { tending: +1 }
    styles: { quick: Get their order out fast, friendly: Be warm and chatty }
    patrons: [ { who: "A nurse off a night shift", want: quick }, { who: "A lonely old man", want: friendly } ]

codex: { docks: { title: The Docks, category: Places, text: "...", unlock: "location == 'docks'", lore: [Lorebook entry title] } }
feats: { night_owl: { name: Night owl, desc: "...", unlock: "hour >= 2 and hour < 5", reward: { stress: -5 } } }
perks: { points: perk_points, sharp: { name: Sharpshooter, desc: "+2 Aim", cost: 1, requires: "level >= 2", effects: { aim: +2 } } }

checkpoints:      # save slots in the journal; loading rewinds the game (the chat keeps its messages)
  slots: 3
  auto: day                        # autosave at the start of each in-game day (slot "auto")
  keep: [codex, feats, { stats: [insight] }, { flags: [knows_the_truth] }]   # what survives a rewind: codex, feats, perks, secrets, people, dating, deepest, stats/flags/items/rel lists
  loop: { when: "hour >= 23", to: auto, text: "Midnight. The day folds back on itself; only {{user}} remembers.", do: { stress: +5 } }   # a time loop
  hard: false                      # true = an ending is final (load or start over, never keep playing)
endings:          # when one holds, the story ends: the narrator writes an epilogue from what happened; then start over, load, or keep playing
  burned_out: { when: "trauma >= 100", title: Burned out, kind: bad, text: "{{user}} can't go on and leaves town on the night bus." }
  legacy: [codex, feats]           # carried into a new playthrough (default codex, feats, perks)
FUNCTIONS for runs: saved(slot); names: loops (rewinds so far), runs (playthrough number).

triggers:
  exhausted: { when: "fatigue >= 85", do: { add_condition: [exhausted], hint: "..." } }         # fires once when it becomes true
  drain: { when: "fatigue >= 85", repeat: true, do: { stress: +2 } }                           # every turn while true
  danger: { when_scene: "{{user}} is in immediate danger", do: { stress: +5 } }                # judged in plain language

mind:             # the character's mind can overrule the player (in the "rules" part)
  overrides:      # first one that holds and rolls under its chance wins; a 🧠 chip says why
    freeze: { when: "control < 25", chance: "60 - control * 2", on: [violence], cause: Panic, text: "their body won't obey." }   # do: fail (default) = fails with no roll
    urge: { when: "lust >= 70", chance: 30, on: [talk], do: flirt, cause: Desire }      # do: <action id> = that happens instead
    nerves: { when: "control < 50", chance: 50, do: alter, cause: Nerves }               # do: alter = goes ahead, coloured by the cause; on: [] = any action with a check
  perception: [ { when: "awareness < 20", text: "{{user}} is naive: describe only what they understand." } ]   # filters the narration while true

STORY MACHINERY (the "story" part):
secrets:          # only opened stages ever reach the narrator — what isn't in the prompt can't leak
  ward_accident:
    about: Professor Ward
    cue: "Ward goes quiet whenever the old observatory comes up."    # known from the start: behaviour, never the reason
    tell: exists                   # narrator is told there's more it doesn't know, so it deflects instead of inventing
    stages:                        # a ladder: each opens when its when holds, in order, and never closes
      - { when: "rel('ward', 'trust') >= 60", text: "A student died in an observatory accident on Ward's watch.", lore: [Lorebook entry title] }
      - { when: "flag('found_logbook')", text: "Ward falsified the safety log to protect the department." }
fronts:           # hidden world clocks that fill with in-game time; each stage surfaces once in the story
  harbour_gangs:
    label: The harbour gangs
    per_day: 6                     # clock points per in-game day (formula); per_turn also allowed; max defaults to 100
    when: "not flag('gangs_broken')"
    story: { "{{user}} stirs up trouble with the gangs": 10, "{{user}} helps the police against the gangs": -10 }   # judged each turn
    stages:
      - { at: 30, hint: "More broken windows along the harbour road.", backstage: "The Kestrels took over the fish market.", surface: "A harbour shop is torched overnight.", do: { flags: { harbour_unrest: true } } }
      # hint = a sign with no reason, shown from halfway to this stage; backstage stays hidden until the stage surfaces
random_events:    # a hidden gauge fills with in-game time, not per reply; near the top it picks the next event and shows its omen
  pace: { per_day: 25, jitter: 0.3, rest_days: 1, omen_at: 80 }     # per_day 25 ≈ one event every 4 days
  events:
    storm: { when: "season == 'autumn'", weight: 2, cooldown: 7, omen: "Gulls are flying inland.", text: "A storm rolls in off the sea.", do: { add_condition: [soaked] } }
live_choices:     # a writer phrases options for the moment; each must carry one of these tags, and the TAG decides what happens
  label: Right now
  count: 3
  when: "not in_encounter"
  tags:
    bold: { desc: "A daring or risky move", check: { vs: 12, add: "floor(nerve / 10)" }, success: { nerve: +1 }, fail: { stress: +5 } }
    kind: { desc: "Something kind toward someone here", per_person: true, effects: { rel: { target: { trust: +3 } } } }
    careful: { desc: "The cautious, safe option" }
STORY EFFECTS: front: { harbour_gangs: -20 }, reveal: [ward_accident] (opens its next stage), gauge: +30 (brings the next event closer).

DATING (the "dating" part):
dating:           # talk topic by topic (tastes stay hidden until learned), ask people out, go on outings. \`dating: true\` = all built-ins
  love: love                       # relationship stat used as love (created if missing); fear: fear likewise
  romance: true                    # false = friendship only. Romance is never offered with anyone under 18 or of unknown age
  stages: { stranger: 0, acquaintance: 10, friend: 30, close: 55, partner: { at: 80, partner: true } }   # love (0–100 of its range) per rung; partner only through a returned confession
  hostile: { at: 60, label: Hostile }        # fear (0–100) that turns someone hostile
  people:                          # authored tastes; otherwise the decision model reads them from the card (or they're seeded)
    jo: { loves: [food], likes: [music, tag:nature], dislikes: [gossip], hates: [tease] }   # topic ids, category ids, tag:<activity tag>, item:<item id>
  topics:                          # merged over the built-ins; false removes one. Built-ins: weather, their_day, local_news, gossip, hobbies, music, books_films, games, sport, food, travel, nature, fashion, work, family, dreams, past, worries, secrets, compliment_looks, compliment_mind, joke, tease, flirt, ideal_partner, love_life, the_two_of_you
    cooking: { label: Cooking, category: interests, stage: acquaintance, when: "at('kitchen')" }   # categories: small_talk, interests, personal, charm, romance
  venues:                          # outings; built-ins: cafe, park, cinema, dinner, arcade, bar (builtin_venues: false drops them)
    pier: { name: The pier, at: docks, cost: 10, activities: { fish: { label: Go fishing, tags: [nature, calm] }, sunset: { label: Watch the sunset together, tags: [romance], romantic: true } }, events: { gulls: { text: "Gulls steal the chips.", enjoy: -5 } } }
  with: "not flag('grounded')"     # who can be talked to (target = the person)
  pace: { minutes_per_topic: 5, fatigue_per_topic: 12, beats: 4, minutes_per_beat: 30 }
items: { flowers: { name: Flowers, tags: [gift] } }   # items tagged gift can be given during a conversation

FORMULA NAMES: stats, flags, hour, minute, day, weekday, month, date, season, weather, temperature, indoors, outside,
warmth, warmth_min, warmth_max, too_cold, too_hot, reveal, exposed, naked, in_encounter, round, foe.<stat>, target.<relstat>, location.
FUNCTIONS: has(item[, n]), count(item), flag(x), cond(x), at(loc), rel(person, stat), met(person), between(v, lo, hi), roll('2d6'),
wearing(item), worn(slot), trait(t), present(person), where(person), codex(id), feat(id), perk(id),
secret(id) (stages the narrator knows), front(id) (clock value), front_stage(id) (stages surfaced), happened(event),
deepest(dungeon) (deepest floor reached), in_dungeon, dungeon_depth,
stage(person) (relationship rung, −1 hostile), partner(person), dates(person), in_date, on_outing,
min, max, clamp, floor, ceil, round, abs.
Operators: + - * / % < <= > >= == != and or not, a ? b : c. Strings in single quotes.
`;

/**
 * How to use the format well — what each piece is FOR, what good looks like, and
 * the usual mistakes. The syntax above says what's possible; this says what's worth doing.
 */
export const DESIGN_GUIDE = `WARP DESIGN GUIDE — what makes a ruleset worth playing.
A ruleset is a game the player feels through the story. Every piece should either create a decision, apply pressure, or reward play.
Anything declared but connected to nothing is a broken promise: the player sees it and can't use it.

## the core loop
Name it before writing YAML: what the player does most days, what pushes back, what they're working toward.
Pressures (needs, money, threats, rivals) should pull against each other so choices cost something.

## stats
Every stat needs a SOURCE (what raises it), a SINK (what lowers it), and a CONSEQUENCE (a check, trigger, ending or encounter that reads it).
A meter nothing reads is decoration. Use per_hour drift for needs; narrator: lets the story nudge it within limits.
Skills grow when checks read them — so every skill should appear in at least two checks, in different places.
Mistake: ten meters that only the narrator touches. Fewer stats, each wired into play, beat many idle ones.

## items
Every item should DO something: a use: (an action with effects), a bonus: (gear that helps the checks that read a stat), a gift tag, or an action/encounter move that needs it (when: "has('x')").
Read the item's description and make it true mechanically: "neutralizes scent, lowering visibility" → use: { visibility: -25, remove_condition: [scented] }.
Consumables get uses: (charges); tools get keep: true. Give the player a way to GET each item that matters (start.items, shops via an action that costs money and gives it, loot, rewards).
Mistake: flavour items in the starting inventory that no option ever offers — the player will look for the button.

## encounters
An encounter is a small puzzle with a visible goal. Give it:
- a goal the player can read: end_when on a foe stat ("foe.resolve <= 0") the moves wear down, or goal: in words;
- two or three ROUTES with different stats and trade-offs (talk / trick / force), plus an ESCAPE (a move with end: escaped, at a cost);
- a danger: a player stat end_when that can actually be reached ("stress >= 80"), and foe_moves that push toward it, so waiting costs;
- items that matter in it (a use: that changes what its checks read, a bonus: on those checks, a move that needs an item);
- labels: for how each ending reads, and outcomes: with consequences (what it cost, what was won).
Rounds are told briefly by default; narrate: true only for set-pieces that deserve full prose every round.
Mistake: three moves that all lower the same stat by the same amount; a defeat threshold above the stat's max; no way out.

## conditions
A condition should change play: penalise a check (- 10 when cond('x')), open or close actions, feed an encounter, drive a trigger.
Each needs a cause (add_condition somewhere) and a cure (an item, rest, time, a place) or a duration.

## places
Every place needs a reason to go there: actions at: it, people scheduled there, a job, a shop, a dungeon entrance, a venue.
Connect them with exits so the map is walkable from the start.

## people
Give each tracked person a schedule (where they are by hour and day) so the player can find them, starting feelings that match the card, and — for companions — a goal and a daily choice so they live on their own.

## money
Money needs income (jobs, paid actions, loot) AND spending (shops, rent, bribes, fares). If either is missing it's just a number.

## dating
The built-in topics and outings are modern (films, games, a café, an arcade). For any other setting, rewrite them under dating: — topics: { books_films: { label: Tales and songs, say: "*I ask {{target}} which ballads they know.*" }, games: false } and venues: for outings that exist there (fairs, taverns, tea houses, orbital gardens). Give people tastes (loves/likes/dislikes/hates) so conversations reward learning who they are.

## flags and story machinery
Set a flag only if something reads it (an action's when, a trigger, a codex unlock, a secret's stage). Fronts, secrets and random events make the world move without the player — use them to put pressure on the core loop.

## checks
Odds should usually sit between 25% and 85% at the start and improve with skill; show the player what helps (skills, gear bonuses, conditions as penalties).
Partial outcomes and costs make failures interesting: a fail should change something, not just waste a turn.

## finishing
You're done when every piece connects: run the audit and either fix each gap or say why it's deliberate. Simulate each encounter — no route should be pointless, none should be a guaranteed win, and the escape should cost something.
`;
