# Warp

A game engine under your roleplay. Warp owns stats, dice, time, inventory and relationships; the model only narrates outcomes the engine has already decided.

- **Choices** appear under the latest reply (hotkeys 1–9, odds on each button). You can also just type — a quick referee call maps risky attempts to an action, and the dice decide.
- **Status panel** floats over the chat (drag it to any screen edge to attach it as a sidebar or strip), plus a **Warp** drawer tab: Sheet · Map · Journal · Ruleset · Settings.
- **Dice & change chips** on every reply. Changes read from the story are dashed and can be undone with ×.
- **Swipes reroll** (Casual) by default; turn off for Ironman. State always follows the active swipe.

## What a ruleset can do

| System | |
|---|---|
| Stats | Meters described in words (bands), graded skills, attributes, money, hidden stats, drift over time, caps by formula. Limit what the story may change after a reply: a cap per reply, and optionally only while a formula holds (`narrator_when`), only when the exchange mentions certain words (`narrator_words`), or only after certain actions (`narrator_actions`). The bookkeeper is told what the dice already applied, so nothing counts twice |
| Checks | d100 chance, d20 vs difficulty, 2d6 PbtA; crits and partial successes; odds shown on buttons |
| Time & world | Clock and calendar, seasons, weather, temperature (indoors vs out), a map of places with travel |
| Clothing | Slots, warmth vs the weather, damage, how revealing, traits like rainproof; change clothes from the sheet |
| People | Relationship stats, schedules (who is where, when), per-person actions ("Talk to Jo") |
| Encounters | Turn-based scenes: foe stats, your moves, the foe's moves (weighted or model-weighed), win/lose/escape outcomes. Optional momentum: every check and foe move swings a tug-of-war gauge and only a full swing ends the fight; each round reaches the narrator as ordered beats, and a long move you typed is kept as written while only how it lands is rolled |
| Progress | Codex entries that unlock (and can switch lorebook entries on), feats, perks bought with points |
| Rules | Triggers by formula or in plain language (`when_scene`), uncertain reactions (`decide`) rolled on model odds |
| Mind | Your character's mind can overrule you: at low control an action may freeze (fails, no roll), turn into something else, or be coloured by a cause — each with a chance and a 🧠 chip saying why. Perception filters change how the narrator describes the world to your character while a condition holds |
| Secrets | Ladders of stages that open by condition. Only opened stages ever reach the narrator's prompt, so they can't leak; a stage-0 cue lets it play someone hiding something without knowing what |
| Living world | Hidden clocks (`fronts`) that fill with in-game time, show signs, and surface events; story beats judged by the decision model push them. Random events come from a hidden gauge per in-game day, with an omen before each |
| Live choices | Choices written for the moment. The writer must tag each one from a fixed list, and the tag decides the check and effects; with Jev, the model weighs which kinds of move fit |
| Checkpoints & endings | Save slots and a daily autosave; loading rewinds the game while the chat keeps its messages, and the ruleset decides what survives (the codex, secrets, chosen stats…). Time loops rewind by themselves when a condition holds. Endings fire by formula: the narrator writes an epilogue from what actually happened, then you start a new playthrough (carrying unlocks forward), load a save, or keep playing (unless hard mode) |
| Dating | Talk topic by topic: each person has hidden tastes (authored, read from the card by the decision model, or seeded) that you discover as you go. Reactions move love and fear, which set the stage (stranger → acquaintance → friend → close → partner, or hostile) that unlocks more topics. Mood, conversation fatigue and a streak bonus shape every reaction, and a line you type is judged on its own words. Ask people out, pick a venue, and play the outing moment by moment for an enjoyment score; confess, kiss, give gifts. Romance is only ever offered between adults |
| Dungeons | Roguelike diving: floors of face-down tiles (monsters, elites, guardians, treasure, traps, springs, merchants, events, surprises, romance moments) with one way down. Party battles with HP/MP/TP, skills, items, escape and auto-battle; quit any time and keep the loot, or get wiped out and lose it. Story moments are written up by the narrator. Built-in bestiary, events and art |

## Visual novel mode

With the Cue visual-novel extension open, Warp's choices appear on the stage as buttons with their odds, a live status card (and one for the conversation or date in progress) can be pinned from **Panels**, and the moods Warp's rules decide are passed to Cue so its portraits match.

## ✨ Build with AI

**Warp → Ruleset → Build with AI** reads the character card, asks a few questions (tone, which systems, difficulty, relationship depth, plus follow-ups about the card and anything you want to add in your own words), then drafts the ruleset section by section. Every section passes Warp's checker — problems are sent back to the model and fixed automatically — and you get a review before anything is saved: a live preview of the sidebar and choices, a summary, balance warnings with one-tap **Fix**, and **Redo** per section. **Refine with AI** changes an existing ruleset from an instruction ("make it harder", "add a cooking skill").

## Decision model (System 1)

Warp asks small, typed questions — *which action does this message attempt?*, *how does Robin react?*, *is {{user}} in danger?*, *did trust go up?* — and gets back **probabilities**, never outcomes. When something is uncertain the engine rolls on those odds with its own seeded dice, so swipes and Ironman stay honest.

Pick the provider in **Warp → Settings → Decision model**:

| Provider | What it is | Cost / speed |
|---|---|---|
| **Helper LLM** (default) | Your helper connection imitates typed answers in one batched call | One small call per question batch |
| **Jev** | [TypeSafe's](https://typesafe.ai) System-1 model: typed answers with calibrated probabilities in ~70–500 ms. Paste your API key (stored encrypted). Your roleplay text is sent to TypeSafe. | Very cheap, fast; bookkeeping becomes many atomic questions in parallel |
| **Rules only** | Keyword matching, no network | Free; only ever *suggests* actions |

Confidence sets the friction when you type instead of clicking:

- **≥ auto threshold** (default 75%) → rolled automatically. The dice chip says how sure it was, with a **Not an action?** button to redo the turn without a roll.
- **between thresholds** (default 40–75%) → no roll; a **🎲 Roll *Pick a pocket*? [Roll it]** chip appears on your message. Rolling redoes that turn.
- **below** → treated as plain roleplay.

Optional **consistency check** flags replies that contradict the state (⚠ chip).

## Where rules live

In the character's lorebook, so they travel with the card:

- any lorebook named `warp-ruleset`, or
- any entry whose title starts with `warp-ruleset` (e.g. `warp-ruleset · stats`).

Each entry is YAML; entries merge. Warp keeps them out of the prompt automatically. Command palette → **Warp: Add a ruleset to this character** installs a starter (Universal, Hometown life-sim, Starfarer sci-fi RPG).

## Ruleset reference

The complete format — including weather, wardrobe, schedules, encounters, codex, feats and perks — is in [`src/engine/reference.ts`](src/engine/reference.ts) (the same reference the AI builder writes against). The starter templates in [`src/engine/templates/`](src/engine/templates/) are full worked examples. The basics:

```yaml
name: My Game
clock: { start: "Mon 07:00", minutes_per_action: 10, narrator_max: 480 }
start: { location: home, items: { phone: 1 } }
hud: { currency: "£", bars: [health, stress] }
narration: { notes: "Extra guidance for the narrator." }

stats:
  stress:
    kind: meter            # meter | attribute | skill | money | hidden
    max: 10000             # numbers or formulas ("level * 5")
    good: low              # high | low | none — colours bars and chips
    per_hour: -40          # drift over in-game time
    narrator: 1500         # max change the story may make per reply (0 = engine only)
    bands: { 0: You are calm., 3000: You are stressed., 8000: You are distressed. }
  athletics: { kind: skill, max: 1000, grades: [F, D, C, B, A, S] }

relationships:
  open: true               # track new people the story introduces
  stats:
    trust: { start: 10, narrator: 5, bands: { 0: Wary, 45: Trusting } }
  people:
    robin: { name: Robin, start: { trust: 30 } }

locations:
  home: { name: Your Flat, desc: "...", exits: [street], travel: 10 }   # exits become "Go to…" choices
items: { lockpick: Lockpick }
conditions: { exhausted: { label: Exhausted, tone: bad } }
flags: { door_open: { start: false, narrator: true } }

actions:
  pick_lock:
    label: Pick the lock
    group: Explore
    say: "*I kneel and work the lock.*"     # posted as your message
    at: [street]
    when: has('lockpick') and between(hour, 20, 6)
    time: 10
    cost: { fatigue: +20 }
    tags: [crime]                            # for Lines & Veils
    check: { chance: 20 + skulduggery / 12, label: Skulduggery }
    # or  { vs: 15, add: floor(dex / 2), partial: 3 }   d20 + add vs 15
    # or  { style: pbta, add: cool }                      2d6: 10+ hit, 7–9 mixed
    success: { flags: { door_open: true }, skulduggery: +5 }
    fail: { suspicion: +15, hint: "The pick snaps. Someone may have heard." }
    # also: crit_success, partial, crit_fail (fall back to success/fail)
  sneak:
    hidden: true                              # free-text only — the referee picks it
    desc: Staying unseen, anything sly.
    params: { difficulty: { easy: 70, normal: 45, hard: 25 } }
    check: { chance: difficulty + skulduggery / 15 }

triggers:
  breakdown:
    when: stress >= 10000                     # fires once when it becomes true (repeat: true = every turn)
    do: { set: { stress: 6000 }, trauma: +600, add_condition: { shaken: 240 }, hint: "They break down." }
```

**Uncertain reactions — `decide:`** (usable in any effect). The decision model supplies odds from the scene; without one, `weight`s are used. The engine rolls either way.

```yaml
effects:
  decide:
    ask: How does Robin respond to {{user}} asking them out?
    options:
      yes:    { desc: "Says yes", weight: 1, rel: { robin: { love: +10 } } }
      maybe:  { desc: "Wants to think about it", weight: 1 }
      no:     { desc: "Turns them down", weight: 2, rel: { robin: { love: -2 } } }
```

**Plain-language triggers — `when_scene:`** (alone or combined with `when:`), judged each turn:

```yaml
triggers:
  fight_starts:
    when_scene: "A fight has broken out and {{user}} is in it"
    do: { flags: { in_combat: true } }
```

**Effects:** stat shorthand (`fatigue: +20`), `set`, `flags`, `give`/`take`, `rel: { robin: { trust: +5 } }`, `move`, `time`, `add_condition`, `remove_condition`, `hint`. Values can be formulas, including `roll('2d10')`.

**Formula names:** stats, flags, `hour`, `minute`, `day`, `weekday`, `turn`, `location`, and `has()`, `count()`, `flag()`, `cond()`, `at()`, `rel(person, stat)`, `met()`, `between(v, lo, hi)`, `min`, `max`, `clamp`, `floor`, `ceil`, `round`, `abs`.

The Ruleset tab lists problems in plain language, with "did you mean" suggestions for typos.

## Develop

```bash
bun install
bun run verify   # tests + typecheck
bun run build    # dist/backend.js, dist/frontend.js
```

## Credits

Dungeon art: *Dungeon Crawl 32x32 tiles*, CC0 (public domain). See [CREDITS.md](CREDITS.md).
