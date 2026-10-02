// The ruleset format, condensed for a model to write against. Kept in code so
// the AI builder and the engine can't drift apart.

export const PART_LABELS = ["core", "stats", "people", "world", "actions", "encounters", "quests", "journal", "rules", "story", "dating"] as const;
export type PartLabel = (typeof PART_LABELS)[number];

/** What each lorebook entry ("part") holds. */
export const PART_CONTENTS: Record<PartLabel, string> = {
  core: "name, description, player, clock, start, hud, narration",
  stats: "stats, growth",
  people: "relationships (stats + people with schedules), companions, lineage",
  world: "weather, locations, items (incl. clothing, uses and gear bonuses), item_uses, wardrobe, body, conditions, flags, start.items",
  actions: "actions, improvise, obligations, jobs",
  encounters: "encounters, dungeons",
  quests: "quests (bounties on a notice board, favours people ask, story jobs: goals, deadline, reward, failure)",
  journal: "codex, feats, perks, abilities, checkpoints, endings",
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
  if (head.startsWith("quests")) return "quests";
  if (["codex", "feats", "perks", "abilities", "checkpoints", "endings"].some((k) => head.startsWith(k))) return "journal";
  if (head.startsWith("triggers") || head.startsWith("rules") || head.startsWith("mind")) return "rules";
  if (["secrets", "fronts", "random events", "live choices"].some((k) => head.startsWith(k))) return "story";
  if (head.startsWith("dating")) return "dating";
  return "core";
}

export const REFERENCE = `WARP RULESET FORMAT (YAML). Numbers may be formulas in quotes. Meters are 0–100 unless there's a reason.

stats:            # kinds: meter (bar) | attribute | skill | money | hidden
  stress: { kind: meter, good: low, start: 0, per_hour: -0.5, narrator: 10, bands: { 0: You are calm., 30: You are stressed., 70: You are distressed. } }
  hp: { kind: meter, max: "20 + level * 8", bands: { 0%: Down., 40%: Wounded., 75%: Hale. } }   # bands in % of the current max, for stats whose max grows
  mana: { kind: meter, max: "20 + wits * 5", start: full, per_hour: "+2%" }   # start: a number, full, "50%" (of the max) or a formula (without start:, a meter with a max formula begins at 100 — write start: full for a full pool); per_hour: a number, a formula ("wits / 10") or a % of the current max
  tier: { kind: attribute, start: 1, bands: { 0: Iron, 3: Bronze }, show: both }   # show: text | number | both | hidden. Unset with bands: the narrator gets the words, the sidebar words plus the number
  str: { kind: attribute, start: 5, max: 99, allocate: { with: stat_points, step: 1, cost: 1 }, group: Attributes }   # +/− in the sidebar spend points from stat_points (or allocate: stat_points); group: the sidebar heading (default Attributes / Skills by kind; the pool shows on the heading, not as a row)
  athletics: { kind: skill, max: 100, start: 10, grades: [F, D, C, B, A, S] }
  money: { kind: money, start: 50, narrator: 50 }
  # good: high|low|none (colours); per_hour: drift; narrator: max change the story may make per reply (0 = rules only); max may be a formula ("level * 5")
  # limit what the story may change (stats, relationship stats, flags, conditions): narrator_when: "not in_encounter",
  #   narrator_words: [panic, scared] (the exchange must mention one), narrator_actions: [fight, violence] (action ids or tags)
  # skills and attributes improve with use: every check that reads them (and practice the story describes) adds progress; growth: 0 on a stat stops it, growth: 2 doubles it
growth: { rate: 1, attributes: 0.5, train: true }   # optional; growth: false turns it off. Attributes move at half the skill rate by default
# Repeating the same checked opportunity teaches less (never below 10%); a two-hour break or eight intervening turns restores full practice. Training and authored milestone effects are not reduced.
#   tune it: growth: { repeat: { step: 0.5, floor: 0.1, recover_minutes: 120, recover_turns: 8 } }  (learning × 1 / (1 + step × repeats), never below floor; 0 for a recover_* turns that recovery off); growth: { repeat: false } turns the taper off

relationships:
  open: true                       # track new people the story introduces
  stats: { trust: { start: 10, narrator: 5, bands: { 0: Wary, 40: Trusting } } }
  people:
    jo:
      name: Jo
      age: 31                      # declare adult ages for anyone romance or lineage could involve (unknown ages get friendship only)
      desc: Runs the café.
      schedule:                    # first matching entry wins; entry without when = default; no match = not around
        - { when: "between(hour, 7, 18) and weekday != 'Sun'", at: high_street }
        - { when: "flag('jo_left_town')", at: away }   # at: away (or ~) = not anywhere while when holds

companions:       # people with lives of their own (ids from relationships.people)
  jo:
    goal: Buy the café outright              # shown on the sheet
    arc: { per_day: 2, stages: [ { at: 40, hint: "Jo's doing sums at closing time.", surface: "Jo makes an offer on the café." } ], story: { "{{user}} helps Jo at the café": 10 } }   # a hidden clock, same shape as a front; runs once met
    daily:                                   # a choice they make each in-game day; the decision model weighs it; arc/bond here mean Jo
      ask: How does Jo spend her evening?
      options: { shift: { desc: Works an extra shift, weight: 2, arc: +6 }, out: { desc: Goes drinking with Dex, weight: 1, bond: { dex: +5 } } }
    jealous_of: [dex]                        # or [anyone]: cools toward {{user}} (and the rival) when {{user}} grows close to them
    bonds: { dex: 30 }                       # how they feel about others, −100…100
    knows: [ward_accident]                   # portrayal cue + opened stages only; unopened truths stay out of the narrator prompt
    knows_full: false                       # explicit true exposes every stage to portray an informed NPC; weaker spoiler isolation
EFFECTS for companions: arc: { jo: +5 }, bond: { jo: { dex: -10 } }. FUNCTIONS: arc(person), bond(a, b).

lineage:          # pregnancy and children; only ever between two people known to be adults (declare ages, or the decision model is asked)
  pregnancy: { weeks: 36, stages: [ { week: 6, text: "{carrier} has been sick in the mornings." }, { week: 16, text: "It's starting to show." } ] }   # hidden until the first stage
  children: { speed: 1, join_at: 18, inherit: [hair, eyes] }   # speed = how much faster than the calendar they age; they stay off-stage family until join_at (never below 18) and are never part of romance
EFFECT: conceive: { with: target, chance: 20, carrier: player }   # carrier: player | partner. FUNCTIONS: children(), age(person); names: pregnant, pregnancy_weeks.

name: Harbour Town                 # the game's name (shown on the HUD); description: one line about it
description: A fishing town where the tide brings secrets.
look: modern                       # how dungeons, dates and minigames look: medieval (parchment, oak, gold), modern (paper and ink) or scifi (an instrument panel)
clock: { start: "Mon 07:00", date: "Sep 4", minutes_per_action: 15, narrator_max: 240 }
start: { location: home, items: { phone: 1 } }
hud: { currency: "$", bars: [health, stress] }   # currency: "$" (before the amount), "{n}d" / "£{n}" (template), or { symbol: d, after: true }
narration: { notes: "Guidance for the narrator." }
player: { age: 20 }

weather: { temps: { spring: 12, summer: 22, autumn: 11, winter: 3 }, indoors: 20 }     # enables weather + temperature; indoors: °C inside (a place's temp: wins)
locations:
  home: { name: Home, desc: "...", indoors: true, exits: [street], travel: 10 }   # exits become travel buttons
  tavern: { name: The Drowned Rat, exits: [street], board: true }   # board: a notice board — quests with board: true are posted here
  gate: { name: Hollow Gate, exits: { market: 15 }, requires: { level: 5 }, why_not: "The guild bars novices" }   # requires: travel shown LOCKED with what's missing (same keys as action requires); why_not: replaces the words
  ruin: { name: Old Ruin, exits: [market, { deep_wood: 45 }], when: "flag('ruin_found')" }   # when: off the map and travel until it holds; exits as a map (or one-key list entries) = minutes per exit, ~ = the place's travel:
  garret: { name: Garret, indoors: true, temp: 8, exits: [tavern] }   # temp: this indoor place's °C
locations_open: true             # the story may name places the ruleset doesn't list (on by default when there are none)
items:
  phone: Phone
  raincoat: { name: Raincoat, slot: outer, warmth: 5, reveal: 0, traits: [rainproof] }   # clothing = item with a slot
  pepper_spray:                    # an item that DOES something: use: is an action offered while it's held (in encounters too)
    name: Pepper Spray
    uses: 5                        # charges; each use spends one, the last spends the item (tags: [consumable] = 1 use)
    use: { label: Spray it, foe: { nerve: -6 }, hint: "{{user}} empties a burst into their face." }   # effects (or check/success/fail like any action); when:, why_not: "…" optional
  lucky_boots: { name: Lucky Boots, slot: feet, bonus: { athletics: 10 } }   # gear: added to every check that reads athletics while worn (carried, for non-clothing)
  sword: { name: Sword, bonus: { atk: "5 + level * 2" } }   # gear bonus/armor: numbers or formulas, worked out when used; eff('atk') reads it in effects
  cloak: { name: Cloak, slot: outer, integrity: 40, armor: { hp: "1 + level / 5" } }   # integrity('cloak') or integrity('outer') = current integrity
  house_keys: { name: Keys, keep: true, use: { label: Lock the door behind you, stress: -5, when: "at('home')" } }   # keep: true = using it doesn't spend it
  chainmail: { name: Chainmail, slot: outer, armor: { hp: 3 } }   # armor: blows that would lower hp in a fight are 3 smaller (per hit); armor: 2 = whatever the fight beats you on
item_uses: { phone: { label: Call a friend for a lift, check: { chance: 60 }, success: { move: home }, fail: { stress: +3 } } }   # uses/bonuses for items declared elsewhere (Warp writes drafted ones here)
wardrobe: { slots: [outer, top, bottom, under_top, under_bottom, feet], cover: [top, bottom], start: [t_shirt, jeans] }
conditions: { cold: { label: Cold, tone: bad }, hasted: { label: Hasted, tone: good, bonus: { evasion: 20 } } }   # bonus: a buff (or debuff, negative) counted in checks while it lasts
#   iron_skin: { label: Iron Skin, armor: { hp: "level / 2" }, bonus: { str: "level / 4" }, lasts: 1h }   # armor/bonus may be formulas
#   bleeding: { label: Bleeding, every: [round, hour], dot: 2, stat: hp, lasts: 3h }   # each round in a fight (full dot), each hour outside (dot scaled by time; tick: once per clock hour, max 24 per jump); lasts: times it everywhere
# statuses — the same conditions work on {{user}}, on the opponent (inflict:) and on people (inflict on a per-person action's target):
#   poisoned: { label: Poisoned, tone: bad, rounds: 3, dot: 4 }             # rounds: how long in a fight (they end with it); dot: damage each round ("1d4+1" ok; heal: 5 = negative)
#   stunned:  { label: Stunned, tone: bad, rounds: 1, skip: true }          # skip: loses its turn (true, or a chance 0–100: skip: 50 = paralysed half the time)
#   shielded: { label: Shield up, tone: good, rounds: 2, armor: 4 }         # armor while it lasts; negative = sundered (armor: -3 → blows land harder)
#   bleeding: { label: Bleeding, tone: bad, every: hour, dot: 2, stat: hp, lasts: 3h }   # every: round (default, fights) | turn | hour; lasts: minutes outside a fight ("3h", "2d")
#   drowsy:   { label: Drowsy, lasts: 2h, tick: { stress: -1 } }           # tick: any effect each round/turn/hour on {{user}}; stat: where dot lands (default: what the fight is lost on / the opponent's main meter)
flags: { met_boss: { start: false, narrator: true } }

actions:
  pick_lock:
    label: Pick the lock
    group: Explore
    say: "*I kneel and work the lock.*"
    at: [street]                   # optional location filter
    when: "has('lockpick') and between(hour, 20, 6)"
    time: 10                       # minutes
    cost: { fatigue: +2 }          # paid first, whatever happens. A drop it can't pay locks the choice ("Needs 8 Mana"; drops on good: low stats never lock). Positive amounts are allowed and never lock. "-15%" = a share of the current max
    tags: [crime]
    check: { chance: "20 + skulduggery / 2", label: Skulduggery }      # d100 roll-under percent
    # check: { …, crit: "5 + luck / 4" }  — chance in % of a critical success (default 5%); the narrator is told Critical
    # or check: { vs: 12, add: "floor(dex / 2)", partial: 3 }          # d20 + add vs 12
    # or check: { style: pbta, add: cool }                             # 2d6: 10+ hit, 7–9 mixed
    # check: { …, game: mines }  — can be PLAYED as a minigame instead of rolled (or game: [mines, snake]; game: false = dice only).
    #   games: aim (circles to a song), keys (4-lane piano tiles), mines, stack (falling blocks), snake, race (three-legged, with
    #   whoever is here), pinball, blackjack, roulette, slots. The dice's odds set the score to beat; the stat behind the check,
    #   perks and a partner's trust become aids. Played or rolled, the same tiers and outcomes apply.
    #   The arcade's look is the rulebook's: look: medieval (or modern, scifi) at the top level.
    success: { flags: { door_open: true }, skulduggery: +1 }
    fail: { stress: +5, hint: "The pick snaps." }
    # tiers: crit_success, success, partial, fail, crit_fail; without a check use effects:
    # effects: next to a check always apply, whatever the roll (then success:/fail: add theirs)
  chat:
    label: Chat with {target}
    per_person: true               # one button per person present; {target} = their name
    effects: { rel: { target: { trust: +2 } } }
  spar:
    label: Spar with {target}
    targets: [jo, dex]             # per_person, but only these people; target is also a formula name in when: ("target != 'jo'")
  crack_vault:
    label: Crack the vault
    at: [bank]
    requires: { lockpicking: 30, with: brann, has: drill, rel: { brann: { trust: 40 } }, quest: heist, flag: alarm_cut, perk: safecracker, when: { "hour >= 22": "After closing" } }
    # requires: shown LOCKED at its place with what's missing ("Needs Lockpicking 30 (you have 18), Brann with you · After closing");
    #   a stat name = at least that much; with: someone here; has: items; quest: id (taken) or { id: done }; folds into when:. show_locked: false hides it instead
    effects: { give: bearer_bonds }
  blackjack_table:
    label: Play blackjack
    at: [casino]
    gamble: { game: blackjack, stakes: [10, 50, 200], rounds: 5, win: { stress: -4 }, lose: { stress: +3 }, broke: { stress: +10, flags: { owes_the_house: true } } }
    # a table that takes real money: blackjack | roulette | slots; stakes: buy-ins; rounds: hands/spins/pulls;
    #   stat: what's staked (default the money stat); edge: house edge (default 2% / 2.7% / 8%); luck: a formula shaving the edge.
    #   Played in the arcade, or dealt by the engine when minigames are off. No check — the cards decide.
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
  harm: "6 + arcana / 5" (wears down the current encounter's main meter — HP, resolve, composure — so one ability works in any encounter),
  hits: 3 (the blow lands 3 times, each meeting armor — weak multi-hits lose to heavy armor; on a foe move it's aimed at {{user}}), pierce: 3 (ignores 3 armor; pierce: all),
  percentages: hp: "+30%" heals 30% of max hp; harm: "25%" takes a quarter of the opponent's max; foe: { hp: "-10%" }. Of what's LEFT: foe: { hp: "-foe.hp / 2" },
  inflict: { poisoned: 3 } or [stunned] or { stunned: { rounds: 1, chance: "30 + might * 2" } } (a status on the opponent; on a per-person action outside a fight, on the target, for that many minutes),
  inflict: { mia: { drowsy: 120 } } (on named people), cleanse: [poisoned] (lift it off the opponent / target),
  quest: { wolves: start } (start | done | fail | drop | report), progress: { wolves: +1 } or { "wolves.pelts": +1 } (count toward a goal),
  remember: { mia: "{{user}} burned her birthday breakfast." } (something a person remembers; the narrator sees it whenever they're around),
  learn: [ability_id] (teaches an ability),
  decide: { ask: "How does Jo react?", options: { yes: { desc: "Agrees", weight: 2, rel: { jo: { trust: +2 } } }, no: { desc: "Refuses", weight: 1 } } }
  Formulas with commas MUST be quoted: money: "-min(money, 20)".

encounters:
  mugging:
    name: Mugging
    tags: [violence]
    foe: { name: Mugger, armor: 2, stats: { nerve: { start: 10, max: 10 } } }   # armor: blows to its main meter are 2 smaller each (or { nerve: 2 }); damage over time ignores it
    # foe stats and armor can be formulas, worked out ONCE when the encounter starts, from {{user}}'s state then (monsters that scale):
    #   foe: { name: Goblin, armor: "level * 2", stats: { hp: { start: "100 * level", max: "100 * level" } } }   # no max = the start it rolled
    actions: { fight: { label: Fight back, check: { chance: "30 + athletics / 2" }, success: { foe: { nerve: -6 } }, fail: { pain: +10 } }, run: { label: Run, effects: { end: escaped } } }
    foe_moves: { grab: { desc: "Grabs you", weight: 2, pain: +8 }, threaten: { desc: "Threatens", weight: 1, stress: +6 } }
    # boss phases: a move with when: is only weighed while it holds (if none holds, all are); any decide option takes when: the same way:
    #   foe_moves: { swipe: { desc: Swipes, when: "foe.hp > foe_max('hp') / 2", hp: -5 }, rage: { desc: Rages, when: "foe.hp <= foe_max('hp') / 2", hp: -15 }, summon: { desc: Calls the dead, when: "encounter_round >= 5", stress: +10 } }
    end_when: { won: "foe.nerve <= 0", beaten: "pain >= 80" }   # simple comparisons let Warp show the goal and the danger to the player
    outcomes: { won: { hint: "They flee." }, escaped: { stress: +3 }, beaten: { money: "-min(money, 30)" } }
    labels: { won: "You see them off", escaped: "You got away", beaten: "Overpowered" }   # how each ending reads
    goal: "Break their nerve, or get away"        # optional; otherwise derived from end_when
    # round_limit: 20   # finite budget, default 20, range 1–200; normal endings take precedence
    # timeout_outcome: beaten   # default: momentum's lose outcome, otherwise lost; applies that outcome's effects
    # losses: [beaten]            # these endings count as defeats, whatever they're called
    # outcome_kinds: { won: won, escaped: escaped, paid_off: conceded }   # won | escaped | conceded | lost
    #   Without these, Warp infers: an end_when on a foe stat heading your way is a win (slain: "foe.hp <= 0"), one on your stat
    #   heading toward its bad end is a loss; an ending only a failed move reaches is a loss; then the name (beaten, captured… = lost;
    #   escaped, fled… = escaped; paid, bribe, surrender… = conceded). "Ends well" = anything but lost. The checker wants random play to WIN sometimes — escapes don't count.
    # sim: { stats: { level: 12, hp: max }, flags: { met_kael: true }, items: { sword: 1 }, location: gate }
    #   the state warp_check and warp_simulate judge it from (a late boss at its intended level); also takes conditions, rel: { maud: { trust: 60 } }, perks, wear. Triggers run after it.
    danger: "Pain at 80 and you're overpowered"   # optional; otherwise derived
    # narrate: true = every round goes to the narrator as a full reply (old style). Default: rounds are told briefly
    #   in one encounter message that grows, then replaced by a summary — far fewer tokens, no repetitive loops.
    # an action out of reach can say why: when: "has('bat')", why_not: "You'd need something to swing"
    # per_encounter: 1 / per_day: 2 on a move = limited uses, like abilities ("Used up for this encounter"). If every move is priced out of reach, they stay open and the cost takes what's left
    # from_story: false = only actions/effects start it (by default the story can: a fight breaking out in the prose starts it, against whoever it's with)
    # momentum: { win: won, lose: beaten, swing: { crit_success: 40, success: 25, partial: 10, fail: -20, crit_fail: -35 } }
    #   a fight that swings (−100…+100): each check moves it, foe moves can too (effect momentum: -15), and only a full swing ends it;
    #   each round reaches the narrator as ordered beats (a long typed move is kept as written). Formula name: momentum.

dungeons:         # roguelike diving: floors of face-down tiles, one way down, quit any time (keep the loot; get wiped out and lose it)
  old_mines:
    name: The Old Mines
    at: [docks]                    # entrance locations (empty = anywhere)
    requires: { level: 3 }         # entrance shown LOCKED with what's missing (why_not: "…" optional); when: hides it instead
    theme: cave                    # cave | crypt | ruins | hell | lair
    floors: 10                     # 0 = endless; a guardian every boss_every floors (default 5)
    tiles: { enemy: 6, elite: 1, treasure: 2.5, trap: 1.5, rest: 1, shop: 0.6, event: 2, surprise: 1.5, romance: 1.2, empty: 7 }
    loot: { lockpick: 2 }          # ruleset items that can turn up in chests
    party: { max: 3, when: "rel(target, 'trust') >= 30", classes: { jo: healer } }   # fighter | mage | healer | rogue | adventurer
    player: { class: adventurer, atk: "10 + athletics / 10" }                       # battle stats from ruleset stats (optional)
    # party.stats: { jo: { hp: "50 + rel(target, 'trust') / 2", atk: "8 + rel_bond(target) / 20" } }  # opt-in companion formulas; authored classes still choose skills
    supplies: { potion: 2, ether: 0, bomb: 0 }   # optional starting loadout, whole counts 0..99; not pulled from inventory
    # exit_rewards: { renown: { amount: "run_xp / 100", cap: 3 } }    # declared main-world stats only; bounded per earned exit
    # exit_practice: { athletics: { amount: "run_xp / 200", cap: 1 } } # skill/attribute practice; per-exit cap, repeat checks taper
    # boons: true                  # opt-in: each new party level offers 3 seeded run-only boons (+15% atk/def/magic/HP/agi, crit, potions, ethers, stair healing, or a skill from another class); choosing blocks moving like an event; gone when the run ends
    # Rewards require earned run_xp > 0 and successful exit, never defeat. XP/levels remain run-local. Balance repeatable shallow runs explicitly.
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
  people: true                     # optional (default false): a found place may come with one generated resident (name, short desc, always there). No age is set, so romance stays blocked until the story shows they are an adult. Only offered when the rulebook has relationship stats or no people yet.
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
abilities:        # the player's OWN moves (spells, techniques, tricks): offered as choices in encounters and the story, typed or clicked
  haste:
    name: Haste
    desc: Quicken body and mind
    cost: { mana: -8 }               # can't be used without enough (the choice says "Needs 8 Mana"); "-15%" = a share of the current max; positive costs (suspicion: +3) are allowed
    add_condition: { hasted: 3 }     # minutes — an encounter round is one minute; the condition's bonus: does the rest
    per_day: 2                       # and/or per_encounter: 1 (0 = unlimited)
  firebolt:
    name: Firebolt
    where: encounter                 # encounter | story | any (default)
    cost: { mana: -4 }
    check: { chance: "40 + arcana" } # scales with the stats its formulas read
    success: { harm: "6 + arcana / 5" }
    fail: { hint: "The bolt fizzles." }
    # effects: { suspicion: +3 }     # with a check: always applies, as well as success:/fail:
    known: false                     # true (default unless a perk teaches it) | false (taught by a perk or learn:) | a formula ("arcana >= 40")

perks:
  points: perk_points               # the stat that pays for them; something must raise it (level-ups, feats, milestones)
  pick: 3                           # offer 3 to choose from when there's a point (one that builds on how they've played, one new direction, one random); 0/omitted = buy from the whole list
  knight: { name: Knight, offer: always, points: class_points, excludes: [mage], group: Classes }   # offer: always = on offer beside the pick (a class choice); points: paid from this stat instead of perks: points; group: sidebar heading
  lich: { name: Lich, requires: "flag('dark_pact')", hidden: true }   # hidden: not listed until requires holds. Perks whose requires don't hold yet fold under "Not yet" with what they need; ones that clash with a perk you took (or build on one that does) drop out
  sharp: { name: Sharpshooter, desc: "+2 Aim", cost: 1, requires: "level >= 2", effects: { aim: +2 } }   # effects: once, when taken
  crowd_ghost: { name: Crowd Ghost, bonus: { stealth: 10 }, edge: { stealth: 15, when: "at('plaza')" }, tags: [stealth] }   # bonus: always counts in checks; edge: only while when holds
  silver_tongue: { name: Silver Tongue, rule: { reroll: { stats: [persuasion], per_day: 1 } } }   # rules: reroll / soften (a failure becomes partial) on these stats or tags; gains / losses: { scent: -30% } (rises or drops that much bigger/smaller)
  armor_breaker: { name: Armor Breaker, rule: { pierce: { amount: 3, tags: [melee] } } }   # pierce: your blows (from moves with these stats or tags; none = all) ignore that much armor
  steady_hands: { name: Steady Hands, rule: { game: { window: 20, lives: 1, games: [aim, keys] } } }   # game: aids in minigames (games: which; none = all): window, size, slow, time, luck (percent) · lives, hint, peek, preview, hold, wrap, saver (counts)
  mage_blood: { name: Mage Blood, abilities: [firebolt], narrator: "Sparks dance on {{user}}'s fingertips when angry.", excludes: [iron_will] }   # teaches abilities; narrator: what the story should show; excludes: can't have both
  adrenaline: { name: Adrenaline Junkie, edge: { athletics: 20, when: "stress >= 60" }, drawback: { desc: "Stress builds faster", gains: { stress: +10% } }, weight: 1 }
  cold: { name: Cold, drawback: { desc: Hard to like, gains: { fondness: "-25%" } } }   # gains/losses may name relationship stats

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
# A rule can't restart the encounter that just ended: start_encounter from a rule is skipped for 15 min after it ends (60 min in the same place); the rule stays fired until its condition goes false again.

mind:             # the character's mind can overrule the player (in the "rules" part)
  overrides_mode: hard   # legacy default; soft keeps the chosen action and treats fail/redirect as narrative pressure
  overrides:      # first one that holds and rolls under its chance wins; a 🧠 chip says why
    freeze: { when: "control < 25", chance: "60 - control * 2", on: [violence], cause: Panic, text: "their body won't obey.", resist_cost: { control: 10 } }   # do: fail (default) = fails with no roll
    urge: { when: "lust >= 70", chance: 30, on: [talk], do: flirt, cause: Desire }      # do: <action id> = that happens instead
    nerves: { when: "control < 50", chance: 50, do: alter, cause: Nerves }               # do: alter = goes ahead, coloured by the cause; on: [] = any action with a check
    # resist_cost: { control: 10 } offers an explicit Resist button (paid only if the override triggers; must be affordable with the action's own cost). Amounts are paid in the stat's bad direction: { dread: 8 } RAISES a good: low meter (must stay under its max); quoted "+8"/"-8" say the direction outright. Meters only. Applies to contextual live choices too, via their authored tag.
  perception: [ { when: "awareness < 20", text: "{{user}} is naive: describe only what they understand." } ]   # filters the narration while true

QUESTS (the "quests" part): things to do for someone or for yourself — a bounty, a favour, cooking the best breakfast, slaying the dragon.
quests:
  wolves:
    name: Thin the wolf pack
    kind: bounty                     # a word shown as a tag: bounty, favour, errand, contract, case, main…
    desc: Wolves are taking travellers on the forest road.
    giver: hesk                      # offered while they're with {{user}} ("Hesk asks: …"); they remember how it went
    board: true                      # also posted on notice boards (locations with board: true); at: [guild] = offered at a place
    when: "level >= 2"               # offered only while this holds
    days: 3                          # deadline once taken (it fails when time runs out)
    goals:
      - { id: kills, text: Kill wolves, count: 3, on: wolves }        # on: an encounter (counts each time it ends well) or an action (each success); or outcome: [won]
      - { text: Bring back a pelt, when: "has('wolf_pelt')" }          # a formula goal: done while it holds
      - { text: Find their den, count: 1, optional: true }             # ticked off by progress: { "wolves.goal_3": +1 } or the story
    reward: { gold: +30, xp: +40, rel: { hesk: { trust: +5 } } }      # any effect; it's read out on the quest card before it's taken
    failure: { renown: -5, rel: { hesk: { trust: -10 } } }            # the price of failing (time running out, fail:, a quest: fail effect, giving up)
    stakes: Hesk stops trusting you with work.                         # what's at stake, in a line (shown, and told to the narrator)
    remember: { done: "{{user}} cleared the wolves when nobody else would.", failed: "{{user}} took the wolf bounty and vanished." }   # default lines otherwise; false = forget it
    report: true                     # hand it in to the giver for the reward (default with a giver or board); false = paid the moment it's done
  breakfast:
    name: Breakfast in bed
    giver: mia
    when: "hour < 10 and not quest_done('breakfast')"
    goals: [ { text: Cook Mia the best breakfast of her life } ]
    judge: { done: "{{user}} serves Mia a breakfast she loves", fail: "Mia is let down by the breakfast" }   # the story decides (read after each reply)
    reward: { rel: { mia: { mood: +15 } } }
    failure: { rel: { mia: { mood: -10 } } }
    remember: { failed: "{{user}} burned her birthday breakfast." }
  dragon:
    name: The great dragon of the plains
    giver: king
    auto: true                       # starts by itself once when holds (a summons); hidden: true = never offered, only started by quest: { dragon: start }
    when: "renown >= 50"
    succeed: "flag('dragon_slain')"  # done when this holds (default: every non-optional goal done); fail: "front('dragon') >= 100"
    reward: { gold: +50000, renown: +40, unlock: [dragonslayer] }
    repeat: 1                        # can be taken again 1 day after it ends (repeat: true = right away)
  from_story: true                   # (default) favours people ask in the story become quests too, judged by the story; story_max: 3 at a time
CHECK ACTIONS against quests: success: { quest: { breakfast: done } }, fail: { quest: { breakfast: fail } }, requires: { quest: wolves }.

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
      - { at: 60, surface: "The watch comes for Maud.", if: "not flag('maud_fled')", do: { flags: { maud_taken: true } }, else: { flags: { empty_cell: true } } }   # if: decides whether do: happens as the stage surfaces; else: happens otherwise
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
  love: love                       # relationship stat used as love (created if missing); fear: fear likewise — fear: false = no fear stat (nobody turns hostile)
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
  memory: { recovery_minutes: 240, keys: 64, rest_per_minute: 1 }   # optional: in-game minutes for one repeat of a topic/move to fade, recent keys kept per person, conversation fatigue restored per in-game minute away
items: { flowers: { name: Flowers, tags: [gift] } }   # items tagged gift can be given during a conversation

FORMULA NAMES: stats, flags, hour, minute, day, weekday, month, date, season, weather, temperature, indoors, outside,
warmth, warmth_min, warmth_max, too_cold, too_hot, reveal, exposed, naked, in_encounter, round, encounter (current encounter id, '' if none), encounter_round, foe.<stat>, target.<relstat>, location.
FUNCTIONS: has(item[, n]), count(item), flag(x), cond(x), at(loc), rel(person, stat), met(person), between(v, lo, hi), roll('2d6'),
wearing(item), worn(slot), trait(t), present(person), where(person), codex(id), feat(id), perk(id),
secret(id) (stages the narrator knows), front(id) (clock value), front_stage(id) (stages surfaced), happened(event),
deepest(dungeon) (deepest floor reached), in_dungeon, dungeon_depth,
stage(person) (relationship rung, −1 hostile), partner(person), dates(person), in_date, on_outing,
quest(id) ('' | 'active' | 'ready' | 'done' | 'failed'), quest_active(id), quest_done(id), quest_failed(id), goal(quest, goal) (count so far), quests_done() / quests_done('bounty'),
memories(person) (how many), cond_of(person, cond), foe_cond(cond), stat_max(stat), foe_max(stat), in_encounter(id) (that encounter is on),
eff(stat) (stat + gear + perks + statuses), gear(stat) (gear alone), integrity(item or slot),
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

## actions are story turns
Every action the player clicks posts a line and gets a narrator reply. Use actions for things that happen in the story.
Sheet changes are not story turns: spending stat points (allocate: on the stats, +/− in the sidebar), buying perks and classes (perks:, their own panel), changing clothes (wardrobe). Never build a "Status Window" of +1 STR buttons.

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
Make moves DIFFER, not just in which stat they roll: armor on a tough foe (foe: { armor: 3 }) makes a heavy blow and a pierce: move worth more than a flurry (hits: 3);
a status (inflict: poisoned — damage each round; stunned — it loses its turn; sundered — negative armor) pays off over the next rounds; a heal or a shield (a condition with armor:) buys time;
percent damage (harm: "25%") cuts down big foes; a blood-price move costs hp: -5 for a big effect. The foe's moves should use the same tools on {{user}} (add_condition: [stunned], hits: 2).
Mistake: three moves that all lower the same stat by the same amount; a defeat threshold above the stat's max; no way out.

## abilities and perks
Abilities are the player's own moves — spells, techniques, tricks — not the place's. Give each a cost (mana, stamina, money), a limit (per_day / per_encounter) and a reason to use it now rather than a plain move: a buff (add_condition with a bonus:), harm: in a fight, a heal, a way out. Make power scale with a stat (check: "40 + arcana", harm: "6 + arcana / 5") so growth shows.
Perks change how the player plays, not just a number: an edge in a situation the card has (night, crowds, a weapon), a rule bent (reroll, soften), a stat that rises slower or faster, an ability taught, something true the narrator shows (narrator:). The best ones trade off (drawback:). Use pick: 3 so every point is a choice between directions, give perk_points a source, and use excludes: for exclusive paths.
Mistake: perks that are only "+2 stat" — that's a level-up, not a choice.

## conditions
A condition should change play: penalise a check (- 10 when cond('x')), open or close actions, feed an encounter, drive a trigger.
Each needs a cause (add_condition somewhere) and a cure (an item, rest, time, a place) or a duration.
Statuses do the work themselves: dot: (damage each round, or every: hour for bleeding and hunger pangs), skip: (a lost turn), armor:, bonus:, and rounds:/lasts: so they wear off.
The same condition can sit on {{user}}, on the opponent (inflict:) or on someone in the story (inflict: on a per-person action — a sleeping draught, a love charm, a cold they caught).

## places
Every place needs a reason to go there: actions at: it, people scheduled there, a job, a shop, a dungeon entrance, a venue, a quest board.
Connect them with exits so the map is walkable from the start.
For quest-driven adventures, a central notice board (board: true) offers reliable work. Do not add one automatically to relationship drama, political intrigue, or a freeform sandbox; use people and scene-specific goals instead.
Gate the best actions behind things the player can work toward, with requires: (a skill level, someone who has to come along, an item, a quest, trust) — a locked choice that says "Needs Lockpicking 30, Brann with you" is a goal, not a dead end.

## people
Give each tracked person a schedule (where they are by hour and day) so the player can find them, starting feelings that match the card, and — for companions — a goal and a daily choice so they live on their own.

## money
Money needs income (jobs, paid actions, loot) AND spending (shops, rent, bribes, fares). If either is missing it's just a number.

## quests
Quests turn the loop into a story with goals: what someone wants done, what it pays, what failing costs — and who remembers.
They fit any setting: slaying three goblins, the dragon of the plains, a delivery across town, cooking the best breakfast for someone, finding a lost cat, a case to crack, a contract to fulfil.
Give each a clear way to WIN (goals the rules can see: count + on: an encounter or action, a when: formula, or judge: for what only the story can tell) and a clear way to FAIL (days:, fail:, quest: { id: fail } on a bad roll, judge: fail).
Make both matter: reward: (money, items, xp, renown, trust, a codex entry, learn: an ability, the next quest) and failure: (money, standing, someone's mood, a door that closes), plus stakes: in a line.
Givers remember: a quest from someone leaves a memory either way (remember: for your own words). A failed favour should come back later — a colder greeting, a trigger on quest_failed('x').
Mix sizes: a few small repeatable jobs on the board (repeat: 1), favours from the people the player cares about, and one or two big quests that start by themselves when the time comes (auto: true).
Scale rewards to the economy: the king's 50,000 is a life-changing sum only if daily work pays tens.
Mistake: a quest with no way to fail; goals nothing counts toward; rewards that are only flavour text.

## dating
Recent topics and social actions persist per person across reopened conversations. One use fades per four in-game hours; fatigue recovers one point per in-game minute. Repeats taper positive affection, including typed chat, kisses, invitations, apologies, goodbye and outing bonuses. New topics and activities retain first-use rewards. Small talk/general chat earns half normal affection; authored topic weight still controls significance. Fresh warm topics cost less fatigue. Empty hello/goodbye loops earn nothing. These rules use deterministic game time, not wall time; no promise parser is implied.
The built-in topics and outings are modern (films, games, a café, an arcade). For any other setting, rewrite them under dating: — topics: { books_films: { label: Tales and songs, say: "*I ask {{target}} which ballads they know.*" }, games: false } and venues: for outings that exist there (fairs, taverns, tea houses, orbital gardens). Give people tastes (loves/likes/dislikes/hates) so conversations reward learning who they are.

## flags and story machinery
Set a flag only if something reads it (an action's when, a trigger, a codex unlock, a secret's stage). Fronts, secrets and random events make the world move without the player — use them to put pressure on the core loop.

## checks
Odds should usually sit between 25% and 85% at the start and improve with skill; show the player what helps (skills, gear bonuses, conditions as penalties).
Partial outcomes and costs make failures interesting: a fail should change something, not just waste a turn.

## minigames and gambling
Set the look to the setting with look: medieval | modern | scifi — parchment and oak for fantasy and history, paper and ink for the present day, an instrument panel for the future. It dresses the minigames, the dungeon and dates alike.
Give the checks that feel like a feat of hands or nerve a game: (aim for shooting and throwing, keys for music and performance, mines for locks, traps and investigation, stack for building and repairs, snake for chases and sneaking, race for anything done side by side with someone, pinball for brawls, blackjack for bluffs and deals, slots or roulette for pure luck). Leave quiet everyday checks on dice.
A perk or two with rule: { game: … } makes them feel different (+1 life, a wider timing window, a peek at the dealer's card).
If the setting has a casino, a card den, dice at the inn or a fruit machine in the bar, make it a gamble: table, with win:/lose:/broke: effects so a bad night has consequences — a debt flag a quest can pick up, stress, someone who saw.

## finishing
Prefer fewer systems with stronger interactions. Add a subsystem only when it serves the chosen experience; quests and minigames remain available but are not mandatory. Narrative-only meters can intentionally inform prose without changing checks.
The audit measures static mechanical connections, not fun or completeness. Fix errors, review gaps, and accept deliberate thin spots rather than chasing 100. Check that different approaches have different risks or payoffs and that setbacks change the next decision.
You're done when the intended experience is playable: run the audit and either fix each gap or say why it's deliberate. Simulate each encounter — no route should be pointless, none should be a guaranteed win, and the escape should cost something.
`;
