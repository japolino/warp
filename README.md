# Warp

A game engine under your roleplay. Warp owns stats, dice, time, inventory and relationships; the model only narrates outcomes the engine has already decided.

- **Choices** appear under the latest reply (hotkeys 1–9, odds on each button). You can also just type — a quick referee call maps risky attempts to an action, and the dice decide.
- **Status sidebar** (left dock) and a **Warp** drawer tab with the full sheet, ruleset health, and settings.
- **Dice & change chips** on every reply. Changes read from the story are dashed and can be undone with ×.
- **Swipes reroll** (Casual) by default; turn off for Ironman. State always follows the active swipe.

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
