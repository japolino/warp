<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo-white.svg">
    <img src="docs/logo-dark.svg" alt="Warp logo" width="160">
  </picture>
</p>

# Warp

A game engine under your roleplay. Warp owns stats, dice, time, inventory and relationships; the model only narrates outcomes the engine has already decided.

- **Choices** appear under the latest reply (hotkeys 1–9, odds on each button). You can also just type — a quick referee call maps risky attempts to an action (or, when nothing listed fits, rolls it on your closest ability), and the dice decide.
- **Status panel** floats over the chat (drag it to any screen edge to attach it as a sidebar or strip). Drag a section's header out to give it a window of its own (up to 3); drop one window near another's side to sit beside it as a second column; resize any window from its corner grip (double-click the grip to fit again). Plus a **Warp** drawer tab: Sheet · Journal · Ruleset · Settings.
- **Dice & change chips** on every reply. Changes read from the story are dashed and can be undone with ×.
- **Swipes reroll** (Casual) by default; turn off for Ironman. State always follows the active swipe.

## What a ruleset can do

| System | |
|---|---|
| Stats | Meters described in words (bands), graded skills, attributes, money, hidden stats, drift over time, caps by formula. Limit what the story may change after a reply: a cap per reply, and optionally only while a formula holds (`narrator_when`), only when the exchange mentions certain words (`narrator_words`), or only after certain actions (`narrator_actions`). The bookkeeper is told what the dice already applied, so nothing counts twice |
| Checks | d100 chance, d20 vs difficulty, 2d6 PbtA; crits and partial successes; odds shown on buttons |
| Time & world | Clock and calendar, seasons, and named places. The story says where {{user}} goes; there is no map or travel graph |
| People | Relationship stats, who is in the scene (read from the story), per-person actions ("Talk to Jo"), and what each person remembers about you |
| Encounters | Turn-based scenes: foe stats, your moves, the foe's moves (weighted or model-weighed), win/lose/escape outcomes. Optional momentum: every check and foe move swings a tug-of-war gauge and only a full swing ends the fight; each round reaches the narrator as ordered beats, and a long move you typed is kept as written while only how it lands is rolled |
| Rules | Triggers by formula or in plain language (`when_scene`), uncertain reactions (`decide`) rolled on model odds |
| Secrets | Ladders of stages that open by condition. Only opened stages ever reach the narrator's prompt, so they can't leak; a stage-0 cue lets it play someone hiding something without knowing what |
| Live choices | Choices written for the moment. The writer must tag each one from a fixed list, and the tag decides the check and effects; with Jev, the model weighs which kinds of move fit. Each choice can show its goal, risk and payoff in words — story stakes only; the tag still decides the odds and effects |
| Your moves, told | A clicked move with a roll is settled on the click, and your message says how it went in your character's voice ("*I slip the lock on the second try…*") instead of "Pick the lock"; the narrator continues from there. Swipes keep that result; ↻ **Reroll** (Casual) rolls again and rewrites the line. Typed messages are left as you wrote them. Settings › **Say how my move went** |
| Romance only | The **Romance** template is just the love story: affection, trust and attraction that can only move a few points per reply (a slow burn the narrator can't rush), people who remember what you did, a clock and calendar, and choices written for each moment (tender, playful, honest, bold, give space) with no dice. No meters, money or skills, and typed messages are never rolled. Places come from the story, so it fits any card |

## Typing freely

Most roleplay is typed, so the core systems follow the story rather than waiting for a button:

- **Fewer grind loops.** Repeating the same check gives diminishing rewards that recover with in-game time; new approaches keep full value. See [docs/DEPTH_PASS.md](docs/DEPTH_PASS.md).
- **Improvised attempts.** A risky thing you type that no action covers (talking your way past a bouncer, vaulting a bar, shoving someone) still rolls: d20 plus your closest skill or attribute's share of a bonus, against a difficulty the decision model reads from the scene. The narrator keeps what you wrote you do; the dice decide only how it turns out. In a fight it's a move like any other. Tune or turn off with `improvise:`.
- **Skills grow with use.** Every check practises the skills and attributes it reads — harder checks teach more, failures teach a little less, and progress slows near the top. Training the story describes (an hour at the gym, a night of study) counts too. A thin green line under each skill shows progress to the next point. Tune with `growth:` or `growth: 0` on a stat.
- **Who's in the scene.** After each reply the story is read for who is actually there — people it introduces, people who leave, who came along after a move. The sheet shows the people here and folds the rest under **Elsewhere**; the narrator only gets relationship details for the people here, so absent characters don't drift back in.
- **Fights from the story.** When a fight (or any encounter) breaks out in the prose or in what you type, it starts — against whoever it's with — and it ends when the story ends it. `from_story: false` keeps an encounter to the rules.
- **Things you use.** Items can have uses (`uses: 5`): each use the story shows spends one, and the last spends the item. For anything the reply mentions, the bookkeeper asks what happened to it — used, used up, or given away.

## Visual novel mode

With the Cue visual-novel extension open, Warp's choices appear in Cue's view as buttons with their odds, a live status card can be pinned from **Panels**, and the moods Warp's rules decide are passed to Cue so its portraits match.

## ✨ Build with AI

**Warp → Ruleset → Build with AI** reads the character card, asks a few questions (tone, which systems, difficulty, relationship depth, plus follow-ups about the card and anything you want to add in your own words), then drafts the ruleset section by section in one pass. It suggests only the systems that fit the card; quests stay optional. Every section passes Warp's checker — problems are sent back to the model and fixed automatically — and you get a review before anything is saved: a live preview of the sidebar and choices, a summary, and **Redo** per section. **Refine with AI** changes an existing ruleset from an instruction ("make it harder", "add a cooking skill"). A rulebook written elsewhere can be imported (checked and previewed first), and the installed one exported as one file.

## Decision model (System 1)

Warp asks small, typed questions — *which action does this message attempt?*, *how does Robin react?*, *is {{user}} in danger?*, *did trust go up?* — and gets back **probabilities**, never outcomes. When something is uncertain the engine rolls on those odds with its own seeded dice, so swipes and Ironman stay honest.

Pick the provider in **Warp → Settings → Decision model**:

| Provider | What it is | Cost / speed |
|---|---|---|
| **Helper LLM** (default) | Your helper connection imitates typed answers in one batched call | One small call per question batch |
| **Jev** | [TypeSafe's](https://typesafe.ai) System-1 model: typed answers with calibrated probabilities in ~70–500 ms. Paste your API key (stored encrypted). Your roleplay text is sent to TypeSafe. | Very cheap, fast; bookkeeping becomes many atomic questions in parallel |
| **Rules only** | Keyword matching, no network | Free; never rolls what you type |

Confidence sets the friction when you type instead of clicking:

- **≥ auto threshold** (default 75%) → rolled automatically. The dice chip says how sure it was, with a **Not an action?** button to redo the turn without a roll.
- **below** → treated as plain roleplay.

**Why?** — every change chip on a reply can be opened to see what caused it: the roll, the rule and its condition, the time that passed, or what was read from the story.

## Where rules live

In the character's lorebook, so they travel with the card:

- any lorebook named `warp-ruleset`, or
- any entry whose title starts with `warp-ruleset` (e.g. `warp-ruleset · stats`).

Each entry is YAML; entries merge. Warp keeps them out of the prompt automatically. Command palette → **Warp: Add a ruleset to this character** installs a starter (Universal, or Romance with no dice), or opens **Build with AI**.

## Ruleset reference

The complete format — including encounters and quests — is in [`src/engine/reference.ts`](src/engine/reference.ts) (the same reference the AI builder writes against). The starter templates in [`src/engine/templates/`](src/engine/templates/) are full worked examples. The basics:

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
  home: { name: Your Flat, desc: "..." }   # the story (or a move: effect) takes {{user}} to a place
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

The Ruleset tab lists problems in plain language, with "did you mean" suggestions for typos. Keys of parts that were taken out of Warp (`dungeons:`, `dating:`, `look:`, minigame `game:` and `gamble:`, encounter `sim:`, `lineage:`, `observers:`, `mind:`, `obligations:`, `jobs:`, `discovery:`, `companions:`, `fronts:`, `random_events:`, `checkpoints:`, `endings:`, `perks:`, `feats:`, `codex:`, `abilities:`, `weather:`, `wardrobe:`, `body:`, stat `allocate:`, person `schedule:`/`traits:`, place `exits:`/`travel:`/`requires:`/`temp:`, item `slot:`/`warmth:`/`integrity:`/`reveal:`/`traits:`, action `errand:`, effects `unlock:`/`learn:`/`wear:`/`undress:`/`damage:`/`body:`/`transform:`) are ignored with a plain warning; the old version is on the `legacy` branch.

## Develop

```bash
bun install
bun run verify   # tests + typecheck
bun run build    # dist/backend.js, dist/frontend.js
```
