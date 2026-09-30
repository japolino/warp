// The ruleset format, condensed for a model to write against. Kept in code so
// the AI builder and the engine can't drift apart.

export const PART_LABELS = ["core", "stats", "people", "world", "actions", "encounters", "journal", "rules", "story", "dating"] as const;
export type PartLabel = (typeof PART_LABELS)[number];

/** What each lorebook entry ("part") holds. */
export const PART_CONTENTS: Record<PartLabel, string> = {
  core: "name, description, player, clock, start, hud, narration",
  stats: "stats",
  people: "relationships (stats + people with schedules)",
  world: "weather, locations, items (incl. clothing), wardrobe, conditions, flags, start.items",
  actions: "actions",
  encounters: "encounters, dungeons",
  journal: "codex, feats, perks",
  rules: "triggers",
  story: "secrets, fronts, random_events, live_choices",
  dating: "dating (tastes, topics, venues), plus gift items and actions to get them",
};

/** Which part an issue's "where" belongs to. */
export function partForIssue(where: string): PartLabel {
  const w = where.replace(/^warp-ruleset\s*·\s*/i, "");
  const head = w.split(/[›,]/)[0].trim().toLowerCase();
  if ((PART_LABELS as readonly string[]).includes(head)) return head as PartLabel;
  if (head.startsWith("stats")) return "stats";
  if (head.startsWith("relationships") || head.startsWith("people")) return "people";
  if (["locations", "items", "wardrobe", "weather", "conditions", "flags"].some((k) => head.startsWith(k))) return "world";
  if (head.startsWith("actions")) return "actions";
  if (head.startsWith("encounters") || head.startsWith("dungeons")) return "encounters";
  if (["codex", "feats", "perks"].some((k) => head.startsWith(k))) return "journal";
  if (head.startsWith("triggers") || head.startsWith("rules")) return "rules";
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

relationships:
  open: true                       # track new people the story introduces
  stats: { trust: { start: 10, narrator: 5, bands: { 0: Wary, 40: Trusting } } }
  people:
    jo:
      name: Jo
      desc: Runs the café.
      schedule:                    # first matching entry wins; entry without when = default; no match = not around
        - { when: "between(hour, 7, 18) and weekday != 'Sun'", at: high_street }

clock: { start: "Mon 07:00", date: "Sep 4", minutes_per_action: 15, narrator_max: 240 }
start: { location: home, items: { phone: 1 } }
hud: { currency: "$", bars: [health, stress] }
narration: { notes: "Guidance for the narrator." }
player: { age: 20 }

weather: { temps: { spring: 12, summer: 22, autumn: 11, winter: 3 } }     # enables weather + temperature
locations:
  home: { name: Home, desc: "...", indoors: true, exits: [street], travel: 10 }   # exits become travel buttons
items:
  phone: Phone
  raincoat: { name: Raincoat, slot: outer, warmth: 5, reveal: 0, traits: [rainproof] }   # clothing = item with a slot
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
    end_when: { won: "foe.nerve <= 0", beaten: "pain >= 80" }
    outcomes: { won: { hint: "They flee." }, escaped: { stress: +3 }, beaten: { money: "-min(money, 30)" } }

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

codex: { docks: { title: The Docks, category: Places, text: "...", unlock: "location == 'docks'", lore: [Lorebook entry title] } }
feats: { night_owl: { name: Night owl, desc: "...", unlock: "hour >= 2 and hour < 5", reward: { stress: -5 } } }
perks: { points: perk_points, sharp: { name: Sharpshooter, desc: "+2 Aim", cost: 1, requires: "level >= 2", effects: { aim: +2 } } }

triggers:
  exhausted: { when: "fatigue >= 85", do: { add_condition: [exhausted], hint: "..." } }         # fires once when it becomes true
  drain: { when: "fatigue >= 85", repeat: true, do: { stress: +2 } }                           # every turn while true
  danger: { when_scene: "{{user}} is in immediate danger", do: { stress: +5 } }                # judged in plain language

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
