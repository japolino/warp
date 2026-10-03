<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo-white.svg">
    <img src="docs/logo-dark.svg" alt="Warp logo" width="160">
  </picture>
</p>

# Warp

A game engine under your roleplay. Warp owns stats, dice, time, inventory and relationships; the model only narrates outcomes the engine has already decided.

- **Choices** appear under the latest reply: three written for the moment, each with a difficulty word and its real odds (hotkeys 1–9), so the odds follow the words, plus a small **More** row for the ruleset's own actions. Clicks are never locked while Warp writes the next choices. You can also just type: quoted dialogue is never rolled, and a quick read rolls only risky, contested attempts (on a listed action, or on your closest ability), and the dice decide.
- **Status panel** floats over the chat (drag it to any screen edge to attach it as a sidebar or strip; it fits a phone screen). Sections: **Conflict** (only during a fight, chase or argument: one momentum gauge, Break off, Give in), **Scene** (time, place, who is here), **You**, **People**, **Goals**. Tap ✎ on any line to fix it: time, place, who is here, looks, clothes, items, money, goals, any stat. Plus a **Warp** drawer tab: Sheet · Journal · Ruleset · Settings.
- **Under each reply**: one dice chip when the turn rolled (tap it for the roll and its odds) and one "what changed" line (story lines first; the tooltip on each item says what caused it). On the latest reply, what was read from the story or set by you can be undone with ×.
- **Swipes reroll** (Casual) by default, for typed and clicked moves alike; turn off for Ironman (the same roll on every swipe). State always follows the active swipe.
- **The greeting sets the scene.** When a chat opens, Warp reads the greeting once for the start time, the place, who is there and what they look like, and writes the first three choices. If it can't, the Scene section asks you to set the time.

## What a ruleset can do

| System | |
|---|---|
| Stats | Meters described in words (bands), graded skills, attributes, money, hidden stats, drift over time, caps by formula. Limit what the story may change after a reply: a cap per reply, and optionally only while a formula holds (`narrator_when`), only when the exchange mentions certain words (`narrator_words`), or only after certain actions (`narrator_actions`). The bookkeeper is told what the dice already applied, so nothing counts twice |
| Style | `style: story` (no dice anywhere) or `style: adventure` (d20 checks, typed attempts, contests) |
| Checks | One style: d20 + a modifier vs a difficulty word (easy 8, fair 12, hard 16, extreme 20), a number or a formula. A natural 20 is a critical success, a natural 1 a critical failure, missing by 3 or less a partial success. The odds on a button are the real odds, exactly. Every result gives the narrator a direction ("fail forward") |
| Scene | Time and date (the start time is read from the greeting), the place in words (from the story; no map or travel graph), who is here (the story's word holds until the story or a move changes it), and looks and clothes as one line of text per person. Every line can be fixed with one click |
| People | Two or three relationship stats with bands. A slow-burn cap per reply, with a big-moment exception (a rescue, a betrayal: up to 3× the cap, one band at most, then a cooldown). Entering a band gives one story line (`say:` / `say_down:`) and a `voice:` that changes how the person acts. Per-person actions ("Talk to Jo"), what each person remembers, and one adults-only check |
| Conflict | One contest for fights, chases and arguments: a momentum gauge from −100 to +100. Every message is a round; the check swings the gauge, the stakes rise each round, nothing ends before round 3 and round 8 is the last. Only a full swing, Break off or Give in ends it — never the narrator. Each round reaches the narrator as ordered beats |
| Goals | Up to 3 open story goals: promises, favours and plans the story makes, plus the author's own (`done_when:`, `judge:`, `stakes:`, `reward:`). Only the rules close a goal |
| Rules | Triggers by formula or in plain language (`when_scene`), uncertain reactions (`decide`) rolled on model odds |
| Secrets | Ladders of stages that open by condition. Only opened stages ever reach the narrator's prompt, so they can't leak; a stage-0 cue lets it play someone hiding something without knowing what |
| Live choices | Three choices written for the moment, in the same call as the bookkeeping. The writer must tag each one from a fixed list, and the tag decides the check and effects; each choice also gets a difficulty word (none, easy, fair, hard, extreme) that sets its target, so "vault the bar" and "shove past him" show different odds. The same tag on the same person soon again gives less (taper). With Jev, Jev weighs which kinds of move fit and rates each written choice's difficulty |
| Romance only | The **Romance** template is just the love story: affection, trust and attraction that can only move a few points per reply (a slow burn the narrator can't rush), people who remember what you did, a clock and calendar, and choices written for each moment (tender, playful, honest, bold, give space) with no dice. No meters, money or skills, and typed messages are never rolled. Places come from the story, so it fits any card |

## Typing freely

Most roleplay is typed, so the core systems follow the story rather than waiting for a button:

- **Fewer grind loops.** Repeating the same check gives diminishing rewards that recover with in-game time; new approaches keep full value. See [docs/DEPTH_PASS.md](docs/DEPTH_PASS.md).
- **Typed attempts.** A risky thing you type that no action covers (talking your way past a bouncer, vaulting a bar, shoving someone) still rolls, but only when it can fail and someone or something works against it: d20 plus your closest skill or attribute's share of a bonus, against a difficulty the decision model reads from the scene. Quoted dialogue and everyday acts are never rolled. The narrator keeps what you wrote you do; the dice decide only how it turns out. In a contest every message is a move. Tune or turn off with `checks:` (Story rulesets never roll).
- **Skills grow with use.** Every check practises the skills and attributes it reads — harder checks teach more, failures teach a little less, and progress slows near the top. Training the story describes (an hour at the gym, a night of study) counts too. A thin green line under each skill shows progress to the next point. Tune with `growth:` or `growth: 0` on a stat.
- **Who's in the scene.** After each reply the story is read for who is actually there — people it introduces, people who leave, who came along after a move. The sheet shows the people here and folds the rest under **Elsewhere**; the narrator only gets relationship details for the people here, so absent characters don't drift back in.
- **Contests from the story.** When a fight, chase or argument breaks out in the prose or in what you type, a contest starts against whoever it's with. The story can start one but never end it: only the rules do (a full swing of the momentum gauge), or Break off / Give in. `conflict: { from_story: false }` keeps contests to the rules.
- **Things you use.** Items can have uses (`uses: 5`): each use the story shows spends one, and the last spends the item. For anything the reply mentions, the bookkeeper asks what happened to it — used, used up, or given away.

## Visual novel mode

With the Cue visual-novel extension open, Warp's choices appear in Cue's view as buttons with their odds, a live status card (scene, meters, who is here and the contest gauge) can be pinned from **Panels**, and the moods Warp's rules decide are passed to Cue so its portraits match.

## For other extensions: `warp-state-v1`

Warp publishes the scene of the open chat as a window event, so other extensions can follow it without reading the story themselves. [LumiDoll](https://github.com/japolino/LumiDoll) uses it to dress the doll.

- `warp-state-v1` (Warp → any), sent whenever Warp's state for the open chat changes: `{ version: 1, provider: "warp", rulesetFormat, chatId, messageId, time?: { label, day, hour, minute }, place?, you: { name, appearance?, outfit?, items? }, people: [{ id, name, present, appearance?, outfit?, bands? }], meters?: [{ id, label, band }] }`. When Warp is off or the chat has no rules, an empty state (`people: []`) is sent so listeners can clear.
- `warp-state-request-v1` (any → Warp), `detail: { version: 1 }`: Warp answers at once with `warp-state-v1`.

Both are `window.dispatchEvent(new CustomEvent(name, { detail }))`. Listeners must work without Warp: then no event ever arrives.

## ✨ Build with AI

**Warp → Ruleset → Build with AI** reads the character card, asks a few questions (tone, which systems, difficulty, relationship depth, plus follow-ups about the card and anything you want to add in your own words), then drafts the ruleset section by section in one pass. It suggests only the systems that fit the card; quests stay optional. Every section passes Warp's checker — problems are sent back to the model and fixed automatically — and you get a review before anything is saved: a live preview of the sidebar and choices, a summary, and **Redo** per section. **Refine with AI** changes an existing ruleset from an instruction ("make it harder", "add a cooking skill"). A rulebook written elsewhere can be imported (checked and previewed first), and the installed one exported as one file.

## Decision model (System 1)

Warp asks small, typed questions — *which action does this message attempt?*, *is it risky?*, *is Mira still here?*, *did trust go up?* — and gets back **probabilities**, never outcomes. When something is uncertain the engine rolls on those odds with its own seeded dice, so swipes and Ironman stay honest. Both providers get exactly the same questions.

Pick the provider in **Warp → Settings → Decision model**:

| Provider | What it does | Calls per turn |
|---|---|---|
| **Helper** (default) | Your helper connection answers the questions inside its one call after the reply, together with the choices and any new text (a new outfit line, a memory, a newcomer's name) | 1 helper call per turn. A typed risky attempt in an Adventure ruleset costs 1 more, before the reply (the read must come before the dice) |
| **Jev** | [TypeSafe's](https://typesafe.ai) System-1 classifier (or any service with the same API, e.g. Jev on OpenRouter) answers every question, with calibrated probabilities in ~70–500 ms. Paste your API key (stored encrypted). Your roleplay text is sent to TypeSafe. The helper only writes the choices and new text | Always 1 helper call per turn, plus 1–3 fast, cheap Jev calls. **Jev makes typed play faster and cheaper** |

A typed message rolls only when the read is at least 75% sure it attempts something risky and contested (or a listed action with a check). The dice chip says how sure it was, with a **Not an action?** button to redo the turn without a roll. Everything else is plain roleplay. Plain-language triggers (`when_scene`) are judged in the same call after the reply and fire on the next turn.

Every turn records what it cost (`calls` on the turn record), so the budget can be checked.

**What caused it?** Hover or long-press an item of the "what changed" line under a reply: it names the roll, the rule, the time that passed, or what was read from the story.

## Where rules live

In the character's lorebook, so they travel with the card:

- any lorebook named `warp-ruleset`, or
- any entry whose title starts with `warp-ruleset` (e.g. `warp-ruleset · stats`).

Each entry is YAML; entries merge. Warp keeps them out of the prompt automatically. Command palette → **Warp: Add a ruleset to this character** installs a starter (Universal, or Romance with no dice), or opens **Build with AI**.

## Ruleset reference

The complete format (ruleset format 2) is in [`src/engine/reference.ts`](src/engine/reference.ts) (the same reference the AI builder writes against). The starter templates in [`src/engine/templates/`](src/engine/templates/) are full worked examples. The basics:

```yaml
name: My Game
style: adventure           # story = no dice anywhere
clock: { start: greeting, fallback: "Day 1 09:00", minutes_per_action: 10, narrator_max: 480 }
start: { place: greeting, items: { phone: 1 } }
hud: { currency: "£", bars: [health, stress] }
narration: { notes: "Extra guidance for the narrator." }
you: { appearance: "tall, freckles", outfit: "grey hoodie" }   # or empty: read from the persona and the greeting

stats:
  stress:
    kind: meter            # meter | attribute | skill | money | hidden
    good: low              # high | low | none — colours bars and chips
    per_hour: -4           # drift over in-game time
    narrator: 15           # max change the story may make per reply (0 = engine only)
    bands: { 0: You are calm., 30: { text: You are stressed., say: "Your shoulders tighten." }, 80: You are distressed. }
  dex: { kind: attribute, max: 10, start: 3 }

checks: { partial: 3, stats: [dex], bonus: 10, outcomes: { fail: { stress: +5 } } }   # typed attempts

relationships:
  open: true               # track new people the story introduces
  big_moment: { factor: 3, cooldown: 10 }
  stats:
    trust: { start: 10, narrator: 4, bands: { 0: Wary, 45: { text: Trusting, say: "{name} trusts you.", voice: "{name} tells {{user}} the truth." } } }
  people:
    robin: { name: Robin, age: 30, outfit: "a paint-stained apron" }

items: { lockpick: Lockpick }
conditions: { exhausted: { label: Exhausted, tone: bad, bonus: { dex: -2 }, lasts: 4h } }
flags: { door_open: { start: false, narrator: true } }

actions:
  pick_lock:
    label: Pick the lock
    say: "*I kneel and work the lock.*"     # posted as your message
    when: has('lockpick') and between(hour, 20, 6)
    time: 10
    cost: { stress: +2 }
    tags: [crime]                            # for Lines & Veils
    check: { vs: hard, add: dex, label: Dex } # d20 + dex vs 16; or vs: 15, or a formula
    success: { flags: { door_open: true } }
    fail: { stress: +15, hint: "The pick snaps. Someone may have heard." }
    # also: crit_success, partial, crit_fail (fall back to success/fail)

goals:
  list:
    find_sister: { text: Find out what happened to your sister, done_when: "flag('sister_found')", stakes: "She may not survive the winter" }

conflict:
  kinds:
    fight: { label: Fight, stats: [dex], cost: { fail: { stress: +8 } }, won: { hint: "{opponent} backs off." }, lost: { stress: +20 } }

triggers:
  breakdown:
    when: stress >= 100                       # fires once when it becomes true (repeat: true = every turn)
    do: { set: { stress: 60 }, add_condition: [exhausted], hint: "They break down." }
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

**Plain-language triggers — `when_scene:`** (alone or combined with `when:`), judged after each reply (it fires on the next turn):

```yaml
triggers:
  fight_starts:
    when_scene: "A fight has broken out and {{user}} is in it"
    do: { flags: { in_combat: true } }
```

**Effects:** stat shorthand (`fatigue: +20`), `set`, `flags`, `give`/`take`, `rel: { robin: { trust: +5 } }` (`target` / `opponent` too), `place: "The docks"`, `look: { you: { outfit: "..." } }`, `time`, `add_condition`, `remove_condition`, `hint`, `decide`, `remember`, `reveal`, `goal: { id: done }`, `contest: { kind: fight, with: "the guard", threat: hard }`, `swing: +20`. Values can be formulas, including `roll('2d10')`.

**Formula names:** stats, flags, `hour`, `minute`, `day`, `weekday`, `turn`, `place` (the words), `round` and `momentum` (0 without a contest), `in_contest`, and `has()`, `count()`, `flag()`, `cond()`, `rel(person, stat)`, `met()`, `present()`, `between(v, lo, hi)`, `goal(id)` ('' / open / done / failed), `secret(id)`, `eff()`, `gear()`, `min`, `max`, `clamp`, `floor`, `ceil`, `round`, `abs`.

The Ruleset tab lists problems in plain language, with "did you mean" suggestions for typos (also for an unknown top-level key). `player:` and `improvise:` are read as `you:` and `checks:`. Old check styles (`chance:`, PbtA, other dice) are errors: the check is dropped and the action runs its effects. Keys of parts that were taken out of Warp (`encounters:` → `conflict:`, `quests:` → `goals:`, `locations:` → `start.place`, `item_uses:`, item `armor:`, ticking condition fields, `dungeons:`, `dating:`, `look:`, minigame `game:` and `gamble:`, `lineage:`, `observers:`, `mind:`, `obligations:`, `jobs:`, `discovery:`, `companions:`, `fronts:`, `random_events:`, `checkpoints:`, `endings:`, `perks:`, `feats:`, `codex:`, `abilities:`, `weather:`, `wardrobe:`, `body:`, stat `allocate:`, person `schedule:`/`traits:`, place `exits:`/`travel:`/`requires:`/`temp:`, item `slot:`/`warmth:`/`integrity:`/`reveal:`/`traits:`, action `errand:`/`at:`/`per_day:`, effects `foe:`/`end:`/`start_encounter:`/`harm:`/`inflict:`/`quest:`/`progress:`/`unlock:`/`learn:`/`wear:`/`undress:`/`damage:`/`body:`/`transform:`) are ignored with a plain warning that says what to use instead; the old version is on the `legacy` branch. The whole-loop simulator (`src/engine/loop-sim.ts`) plays a ruleset with a scripted player and checks the quality bar.

## Develop

```bash
bun install
bun run verify   # tests + typecheck
bun run build    # dist/backend.js, dist/frontend.js
```
