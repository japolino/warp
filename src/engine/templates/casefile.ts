import type { Template } from "./index.js";

// Noir mystery: a private eye, a city that lies, and a case with a hidden truth.
// Encounters here are mostly not fights: interrogations you win by breaking
// composure, tails you win by keeping up, and a shakedown you can talk down.
export const casefile: Template = {
  id: "casefile",
  name: "Casefile (noir mystery)",
  blurb: "Noir mystery: a private eye in a city that lies. Grit, Nerve and Heat; cash and rent; Deduction, Streetwise, Charm, Intimidation, Stealth and Shooting that grow; a hidden truth revealed one clue at a time; interrogations you win by breaking a suspect's composure (or catching a lie), a tail through the rain, a shakedown in an alley; detective abilities (Cold Read, Lean On Them, Hunch); perks picked from three; a killer who covers their tracks while you're slow.",
  parts: [
    {
      label: "core",
      yaml: `name: Casefile
description: A private eye, a dead councilman, and a city where everyone's lying about something.

clock:
  start: Mon 09:00
  minutes_per_action: 15
  narrator_max: 480

start:
  location: office
  items: { revolver: 1, notebook: 1, cigarettes: 2 }

hud:
  currency: "$"
  bars: [grit, nerve, heat, clues]

narration:
  notes: Hardboiled, rain-slick, first-person-friendly. People lie; the narrator never reveals the truth beyond what the secrets say is known.
`,
    },
    {
      label: "stats",
      yaml: `stats:
  grit:
    kind: meter
    start: 80
    per_hour: 2
    narrator: 15
    bands: { 0: Out cold., 20: Hurting bad., 50: Bruised., 80: Holding up. }
  nerve:
    kind: meter
    start: 70
    per_hour: 1
    narrator: 15
    bands: { 0: Shaking., 30: Rattled., 60: Steady., 85: Ice-cold. }
  heat:
    kind: meter
    label: Heat
    good: low
    start: 10
    per_hour: -0.5
    narrator: 10
    bands: { 0: Nobody's looking., 40: The cops know your name., 70: Wanted for questions., 90: Every cop in town. }
  clues:
    kind: meter
    label: Clues
    start: 0
    max: 10
    good: high
    narrator: 1
  cash:
    kind: money
    start: 60
    narrator: 30

  deduction:    { kind: skill, start: 25, max: 100, grades: [F, D, C, B, A, S] }
  streetwise:   { kind: skill, start: 20, max: 100, grades: [F, D, C, B, A, S] }
  charm:        { kind: skill, start: 15, max: 100, grades: [F, D, C, B, A, S] }
  intimidation: { kind: skill, start: 15, max: 100, grades: [F, D, C, B, A, S] }
  stealth:      { kind: skill, start: 15, max: 100, grades: [F, D, C, B, A, S] }
  shooting:     { kind: skill, start: 20, max: 100, grades: [F, D, C, B, A, S] }
  perk_points:  { kind: attribute, label: Perk points, start: 1, max: 20 }
`,
    },
    {
      label: "people",
      yaml: `relationships:
  open: true
  stats:
    trust:
      start: 10
      narrator: 5
      bands: { 0: Hostile, 15: Guarded, 40: Talking, 70: Confiding, 90: Loyal }
  people:
    vera:
      name: Vera Lyle
      desc: The councilman's widow. Hired you. Grieves on schedule.
      schedule:
        - { when: "between(hour, 10, 22)", at: uptown }
    sal:
      name: Sal
      desc: Runs the Blue Note. Knows every debt in the Narrows.
      schedule:
        - { when: "hour >= 18 or hour < 3", at: jazz_club }
    okafor:
      name: Detective Okafor
      desc: Homicide. Honest, tired, and not a fan of private eyes.
      schedule:
        - { when: "between(hour, 8, 20)", at: precinct }
    finch:
      name: Finch
      desc: The councilman's aide. Nervous hands, expensive shoes.
      schedule:
        - { when: "between(hour, 9, 18)", at: city_hall }
        - { at: jazz_club }
`,
    },
    {
      label: "world",
      yaml: `locations:
  office:
    name: Your Office
    desc: Frosted glass, a dead fern, a bottle in the drawer and a cot behind the filing cabinet.
    indoors: true
    exits: [the_narrows]
    travel: 5
  the_narrows:
    name: The Narrows
    desc: Wet alleys, pawn shops, a newsstand that hears everything.
    exits: [office, jazz_club, docks, precinct, uptown, city_hall]
    travel: 10
  jazz_club:
    name: The Blue Note
    desc: Smoke, a tired trumpet, and booths where deals get made.
    indoors: true
    exits: [the_narrows]
  precinct:
    name: 9th Precinct
    desc: Green walls, bad coffee, and files you aren't supposed to see.
    indoors: true
    exits: [the_narrows]
  uptown:
    name: The Lyle House
    desc: A big house on the hill with the curtains drawn.
    indoors: true
    exits: [the_narrows]
    travel: 25
  city_hall:
    name: City Hall
    desc: Marble, money and the councilman's empty office.
    indoors: true
    exits: [the_narrows]
    travel: 15
  docks:
    name: The Docks
    desc: Fog, cranes, and warehouses with no names on them.
    exits: [the_narrows]
    travel: 20

items:
  revolver: { name: Revolver, keep: true, bonus: { shooting: 10, intimidation: 5 } }
  notebook: { name: Notebook, keep: true, bonus: { deduction: 5 } }
  cigarettes: { name: Cigarettes, uses: 1, use: { label: Light a cigarette, nerve: +10 } }
  bottle: { name: Bottle of rye, uses: 3, use: { label: Take a pull from the bottle, nerve: +15, grit: +5, add_condition: { hungover: 240 } } }
  press_pass: { name: Forged press pass, keep: true, bonus: { charm: 10 } }
  ledger: { name: The councilman's ledger }

conditions:
  read_them: { label: Read them, tone: good, bonus: { deduction: 15, charm: 10 } }
  leaned_on: { label: Leaned on, tone: good, bonus: { intimidation: 15 } }
  hungover: { label: Hungover, tone: bad, narrator: true, bonus: { deduction: -10, shooting: -10 } }
  shot: { label: Shot, tone: bad, narrator: true, bonus: { shooting: -10, stealth: -10 } }
`,
    },
    {
      label: "actions",
      yaml: `actions:
  sleep:
    label: Sleep it off on the cot
    group: Office
    at: office
    say: "*I kick off my shoes and sleep on the cot.*"
    time: 420
    effects: { grit: +40, nerve: +30, remove_condition: [hungover, shot] }
  case_board:
    label: Work the case board
    group: Office
    at: office
    say: "*I pin what I've got to the wall and stare at it.*"
    time: 60
    check: { chance: "25 + deduction / 2 + clues * 3", label: Deduction }
    success: { clues: +1, hint: "Two loose threads tie together." }
    fail: { nerve: -5, hint: "The pieces won't fit tonight." }
  buy_bottle:
    label: Buy a bottle of rye ($12)
    group: Shopping
    at: the_narrows
    when: cash >= 12
    say: "*I buy a bottle at the corner liquor store.*"
    effects: { cash: -12, give: bottle }
  newsstand:
    label: Work the newsstand for gossip
    group: Legwork
    at: the_narrows
    say: "*I buy a paper and ask the kid what he's heard.*"
    time: 20
    check: { chance: "30 + streetwise / 2", label: Streetwise }
    success: { cash: -2, clues: +1, hint: "The kid saw something on the night of the murder." }
    fail: { cash: -2, hint: "The kid's just selling papers today." }
  pass:
    label: Buy a forged press pass ($40)
    group: Shopping
    at: the_narrows
    when: cash >= 40 and not has('press_pass')
    say: "*I pay the forger in the pawn shop's back room.*"
    effects: { cash: -40, give: press_pass, heat: +3 }
  files:
    label: Sneak a look at the case files
    group: Legwork
    at: precinct
    say: "*I wait for the desk sergeant to look away and slip into records.*"
    time: 30
    check: { chance: "25 + stealth / 2", label: Stealth }
    success: { clues: +2, hint: "The autopsy says the councilman was dead before the fall." }
    fail: { heat: +15, hint: "Okafor catches {{user}} in records and isn't amused." }
  search_office:
    label: Search the councilman's office
    group: Legwork
    at: city_hall
    when: not has('ledger')
    say: "*I let myself into the dead man's office.*"
    time: 45
    check: { chance: "30 + stealth / 2 + deduction / 4", label: Stealth }
    success: { give: ledger, clues: +2, hint: "A ledger taped under the drawer: payments to a shell company on the docks." }
    fail: { heat: +10, start_encounter: tail }
  stake_out:
    label: Stake out the warehouses
    group: Legwork
    at: docks
    say: "*I find a dark doorway and watch the warehouses.*"
    time: 120
    cost: { nerve: -10 }
    check: { chance: "30 + stealth / 2 + streetwise / 4", label: Stealth }
    success: { clues: +2, hint: "A car from City Hall pulls up at midnight. Finch gets out." }
    fail: { start_encounter: shakedown }
  odd_case:
    label: Take a small-time case ($)
    group: Work
    at: office
    say: "*I take a walk-in job: a cheating husband, a missing dog.*"
    time: 240
    check: { chance: "45 + streetwise / 3", label: Streetwise }
    success: { cash: +40 }
    fail: { cash: +15 }
  rent:
    label: Pay the office rent ($50)
    group: Office
    at: office
    when: cash >= 50
    say: "*I pay the landlord before he changes the locks.*"
    effects: { cash: -50, nerve: +5 }
  question:
    label: Question {target}
    group: Legwork
    per_person: true
    say: "*I sit down across from {target} and start asking questions.*"
    time: 20
    effects: { start_encounter: interrogation }
  chat:
    label: Talk with {target}
    group: Social
    per_person: true
    say: "*I talk with {target}, off the record.*"
    time: 15
    check: { chance: "30 + charm / 2 + target.trust / 4", label: Charm }
    success: { rel: { target: { trust: +4 } } }
    fail: { rel: { target: { trust: -1 } } }
`,
    },
    {
      label: "encounters",
      yaml: `# Not every encounter is a fight. An interrogation is won by breaking the
# suspect's composure or catching their lie before your own nerve goes.
encounters:
  interrogation:
    name: Interrogation
    desc: "{{user}} questions someone who'd rather not answer."
    goal: Break their composure, or catch the lie, before your nerve gives out
    foe:
      name: The suspect
      stats:
        composure: { label: Composure, start: 12, max: 12 }
        lie: { label: Lie exposed, start: 0, max: 10, good: high }
    actions:
      press:
        label: Press the story
        check: { chance: "30 + deduction / 2 + clues * 3", label: Deduction }
        success: { foe: { lie: +6, composure: -4 } }
        fail: { nerve: -4, hint: "The story holds — for now." }
      charm:
        label: Get them comfortable
        check: { chance: "30 + charm / 2", label: Charm }
        success: { foe: { composure: -8 } }
        fail: { hint: "They don't warm up." }
      threaten:
        label: Lean on them
        check: { chance: "25 + intimidation / 2", label: Intimidation }
        success: { foe: { composure: -10 }, heat: +3 }
        fail: { heat: +5, nerve: -4, hint: "They call your bluff." }
      evidence:
        label: Lay the ledger on the table
        when: has('ledger')
        why_not: "Needs hard evidence"
        effects: { foe: { lie: +5, composure: -4 } }
      walk:
        label: Walk away
        when: round >= 2
        why_not: "Give it a round first"
        effects: { end: walked }
    foe_moves:
      deflect: { desc: "Changes the subject", weight: 3, nerve: -3 }
      lawyer: { desc: "Threatens to call a lawyer", weight: 1, heat: +4 }
      tears: { desc: "Breaks down, or pretends to", weight: 1, foe: { composure: +3 } }
    end_when:
      cracked: foe.composure <= 0
      caught: foe.lie >= 10
      rattled: nerve <= 0
    labels: { cracked: They cracked, caught: You caught the lie, walked: You walked away, rattled: You lost your nerve first }
    outcomes:
      cracked: { clues: +2, perk_points: +1, hint: "They talk — part of it true, part of it what they think {{user}} wants to hear." }
      caught: { clues: +3, perk_points: +1, hint: "The lie comes apart in their hands, and the real story starts to leak out." }
      walked: { nerve: +5 }
      rattled: { heat: +5, hint: "{{user}} leaves with nothing but a headache." }

  tail:
    name: The Tail
    desc: Someone's following {{user}} through the rain — or {{user}} is following them.
    goal: Lose them in the crowd, or turn it round and catch them
    foe:
      name: Man in a grey coat
      stats:
        distance: { label: Distance, start: 10, max: 20, good: high }
        cornered: { label: Cornered, start: 0, max: 10, good: high }
    actions:
      lose:
        label: Duck through the crowd
        check: { chance: "30 + stealth / 2 + streetwise / 4", label: Stealth }
        success: { foe: { distance: +5 } }
        fail: { foe: { distance: -2 } }
      corner:
        label: Double back and corner him
        check: { chance: "25 + streetwise / 2", label: Streetwise }
        success: { foe: { cornered: +4 } }
        fail: { grit: -6, hint: "He sees it coming." }
      draw:
        label: Draw the revolver
        when: has('revolver')
        check: { chance: "30 + shooting / 2", label: Shooting }
        success: { foe: { cornered: +6 }, heat: +5 }
        fail: { heat: +8, nerve: -6 }
      streetcar:
        label: Jump on a passing streetcar
        cost: { nerve: -5 }
        check: { chance: "15 + stealth / 3", label: Stealth }
        success: { end: escaped }
        fail: { grit: -4, hint: "The streetcar pulls away without {{user}}." }
    foe_moves:
      close_in: { desc: "Closes the distance", weight: 3, foe: { distance: -3 } }
      vanish: { desc: "Slips out of sight", weight: 1, nerve: -4 }
    end_when:
      lost_him: foe.distance >= 20
      caught_him: foe.cornered >= 10
      beaten: foe.distance <= 0
    labels: { lost_him: You lost him, caught_him: You caught him, escaped: You got away on a streetcar, beaten: He caught you first }
    outcomes:
      lost_him: { nerve: +5 }
      caught_him: { clues: +2, hint: "Under the coat: a City Hall badge." }
      escaped: { cash: -1 }
      beaten: { grit: -20, cash: "-min(cash, 20)", hint: "A sap to the back of the head. {{user}} wakes in the gutter." }

  shakedown:
    name: Shakedown
    desc: Two of Sal's boys corner {{user}} by the warehouses.
    tags: [violence]
    goal: Talk them down, fight your way out, or run
    foe:
      name: Sal's boys
      stats:
        patience: { label: Patience, start: 12, max: 12 }
        hp: { label: Grit, start: 20, max: 20 }
    actions:
      talk:
        label: Talk them down
        check: { chance: "30 + charm / 2 + streetwise / 4", label: Charm }
        success: { foe: { patience: -6 } }
        fail: { grit: -4 }
      name_drop:
        label: Mention you know Sal
        when: "rel('sal', 'trust') >= 40"
        why_not: "Sal would have to trust you first"
        effects: { foe: { patience: -10 } }
      fight:
        label: Fight
        check: { chance: "30 + intimidation / 4 + shooting / 4", label: Intimidation }
        success: { foe: { hp: -10 } }
        fail: { grit: -10 }
      run:
        label: Run for it
        check: { chance: "35 + stealth / 2", label: Stealth }
        success: { end: got_away }
        fail: { grit: -5 }
    foe_moves:
      punch: { desc: "Throws a punch", weight: 3, grit: -8 }
      threaten: { desc: "Shows a knife", weight: 1, nerve: -8 }
    end_when:
      talked_down: foe.patience <= 0
      won: foe.hp <= 0
      beaten: grit <= 0
    labels: { talked_down: They let you walk, won: You put them down, got_away: You got away, beaten: They worked you over }
    outcomes:
      talked_down: { rel: { sal: { trust: +3 } } }
      won: { heat: +10, rel: { sal: { trust: -10 } } }
      got_away: { nerve: -5 }
      beaten: { set: { grit: 10 }, cash: "-min(cash, 30)" }
`,
    },
    {
      label: "journal",
      yaml: `abilities:
  cold_read:
    name: Cold Read
    desc: Watch the hands, the eyes, the swallow
    cost: { nerve: -8 }
    add_condition: { read_them: 30 }
    per_day: 2
  lean_on:
    name: Lean On Them
    desc: The voice that makes people remember they're alone with you
    where: encounter
    cost: { nerve: -6 }
    add_condition: { leaned_on: 3 }
    per_encounter: 1
  hunch:
    name: Play a Hunch
    desc: Say the thing nobody told you
    known: false
    where: encounter
    cost: { nerve: -10 }
    per_day: 1
    check: { chance: "20 + deduction / 2 + clues * 4", label: Deduction }
    success: { harm: 8 }
    fail: { nerve: -6, hint: "The hunch lands wrong, and they know it." }

perks:
  points: perk_points
  pick: 3
  poker_face:
    name: Poker Face
    desc: You read a dealer the way you read a suspect.
    tags: [charm]
    bonus: { charm: 5 }
  bloodhound:
    name: Bloodhound
    desc: Once a day, a dead end turns out not to be.
    tags: [deduction]
    rule: { reroll: { stats: [deduction], per_day: 1 } }
    abilities: [hunch]
  silver_tongue:
    name: Silver Tongue
    desc: Even a bad line half-works.
    bonus: { charm: 5 }
    rule: { soften: { stats: [charm], per_day: 2 } }
  hard_case:
    name: Hard Case
    desc: Takes a beating and keeps asking questions.
    rule: { losses: { grit: "-25%" } }
    narrator: "{{user}} has a face that's been hit before and a way of standing that says they'll take it again."
  nightcrawler:
    name: Nightcrawler
    desc: The city after dark is theirs.
    edge: { stealth: 15, streetwise: 10, when: "hour >= 20 or hour < 5" }
  steady:
    name: Steady Hands
    desc: Nerves of iron.
    rule: { losses: { nerve: "-30%" } }
    bonus: { shooting: 5 }
  lone_wolf:
    name: Lone Wolf
    desc: Doesn't need anyone — and it shows.
    bonus: { intimidation: 10 }
    drawback: { desc: "People trust you slower", bonus: { charm: -5 } }
    excludes: [silver_tongue]
  low_profile:
    name: Low Profile
    desc: The cops forget your face.
    rule: { gains: { heat: "-40%" } }

codex:
  narrows: { title: The Narrows, category: Places, text: "Where the city keeps the people it doesn't talk about.", unlock: "location == 'the_narrows'" }
  lyle: { title: Councilman Lyle, category: The case, text: "Fell from his own window. The papers say suicide. His widow doesn't.", unlock: "clues >= 1" }
  shell: { title: Harbor Holdings, category: The case, text: "A company with an address on the docks and no employees, paid by the councilman every month.", unlock: "has('ledger')" }

feats:
  first_crack: { name: First crack, desc: "Break a suspect in an interrogation.", unlock: "clues >= 4", reward: { perk_points: +1 } }
  paper_trail: { name: Paper trail, desc: "Find the councilman's ledger.", unlock: "has('ledger')", reward: { perk_points: +1 } }
`,
    },
    {
      label: "rules",
      yaml: `triggers:
  broke:
    when: cash <= 0
    do: { nerve: -10, hint: "{{user}} is flat broke; the landlord has opinions." }
  heat_on:
    when: heat >= 70
    repeat: true
    do: { nerve: -2 }
  wounded:
    when: grit <= 20
    do: { add_condition: { shot: 480 }, hint: "{{user}} is hurt worse than they're letting on." }
`,
    },
    {
      label: "story",
      yaml: `secrets:
  the_truth:
    about: The Lyle case
    cue: "Everyone close to the councilman flinches when the docks come up."
    tell: exists
    stages:
      - when: "clues >= 3"
        text: "Councilman Lyle was skimming city money through Harbor Holdings, a shell company on the docks."
      - when: "clues >= 6"
        text: "Finch, the aide, ran the shell company for him — and Lyle was about to confess to the papers."
      - when: "clues >= 9"
        text: "Vera Lyle paid Finch to make it look like a suicide. She hired {{user}} to find out how much anyone else knew."

fronts:
  cover_up:
    label: The cover-up
    per_day: 12
    story:
      "{{user}} asks loud questions or shows their hand": 10
      "{{user}} works quietly": -5
    stages:
      - at: 40
        hint: "Someone has been in {{user}}'s office: the files are a little too neat."
        backstage: "Finch has started burning Harbor Holdings paperwork."
        surface: "A man in a grey coat is waiting across the street from the office."
        news: "Someone is watching the office."
        do: { start_encounter: tail }
      - at: 80
        hint: "Sal's boys have stopped saying hello."
        backstage: "Vera has paid Sal to make {{user}} lose interest."
        surface: "Sal's boys come to make {{user}} lose interest in the case."
        news: "Sal's boys came calling."
        do: { start_encounter: shakedown }

random_events:
  pace: { per_day: 18, jitter: 0.3, rest_days: 2, omen_at: 80 }
  events:
    walk_in:
      label: A walk-in client
      omen: "Footsteps hesitate outside the frosted glass."
      text: "A nervous client knocks with a small job and cash up front."
      cooldown: 6
      do: { cash: +25 }
    raid:
      label: A police raid in the Narrows
      when: "location == 'the_narrows'"
      omen: "Too many patrol cars cruising slow."
      text: "The cops sweep the Narrows; everyone's papers get checked."
      cooldown: 8
      do: { heat: +5 }

live_choices:
  label: Right now
  count: 3
  when: not in_encounter
  tags:
    notice:
      desc: "Noticing something others missed"
      check: { chance: "30 + deduction / 2", label: Deduction }
      success: { clues: +1 }
      fail: { nerve: -3 }
    smooth:
      desc: "Talking someone here round, buying a drink, a favour"
      per_person: true
      check: { chance: "30 + charm / 2", label: Charm }
      success: { rel: { target: { trust: +3 } } }
      fail: { rel: { target: { trust: -1 } } }
    rough:
      desc: "Getting rough, making a threat, breaking something"
      check: { chance: "30 + intimidation / 2", label: Intimidation }
      success: { nerve: +5, heat: +3 }
      fail: { grit: -5, heat: +5 }
    lay_low:
      desc: "Laying low, watching, waiting"
      effects: { heat: -2, nerve: +3 }
`,
    },
  ],
};
