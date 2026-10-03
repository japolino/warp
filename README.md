<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo-white.svg">
    <img src="docs/logo-dark.svg" alt="Warp logo" width="160">
  </picture>
</p>

# Warp

**Your roleplay keeps score.** Warp is a Lumiverse extension that decides risky moments with dice the narrator can't fudge, and remembers the time, the place, who is here and how they feel about you.

The model still writes every reply. Warp owns the numbers: before a reply it settles what happened, and after it, it reads what the story changed and keeps it within the rules.

> The old, bigger Warp (dungeons, dating, minigames, maps, perks, quests, the Doll and more) is on the `legacy` branch.

## How it plays

- **Choices under the reply.** Three choices written for the moment, each with a difficulty word and its real odds, plus a small **More** row for the ruleset's own actions (number keys 1–9 pick them in order). Clicks are never locked while the next choices are written. Typing is first class: quoted dialogue is never rolled, and only risky, contested attempts roll.
- **One status panel.** It floats over the chat and docks to any screen edge (it fits a phone). Sections: **Conflict** (only during a fight, chase or argument), **Scene** (time, place, who is here), **You**, **People**, **Goals**. Tap ✎ on any line to fix it with one click. The **Warp** drawer tab has **Sheet · Journal · Ruleset · Settings**.
- **Under each reply.** One dice chip when the turn rolled (tap it for the roll and the odds), and one "what changed" line: story lines first, then the changes. On the latest reply, what was read from the story or set by you can be undone with ×.
- **Swipes.** In Casual mode a swipe rolls the dice again, for typed and clicked moves alike. In Ironman mode a swipe gives the same roll. The state always follows the active swipe.
- **The greeting sets the scene.** When a chat opens, Warp reads the greeting once for the start time, the place, who is there and what they look like, and writes the first three choices. If it can't, the Scene section asks you to set the time.

## The six core systems

| System | What it does |
|---|---|
| **Scene** | Time and date (the start time comes from the greeting), the place in words (from the story; there is no map), who is here, looks and clothes as one short line per person, items with uses, and money. Nothing drifts, and every line can be fixed with one click. The narrator gets one short line per field, only for what matters now. |
| **People** | Two or three relationship stats with bands. A slow-burn cap per reply, with one big-moment exception (a rescue, a betrayal, a confession: up to 3× the cap, one band at most, then a cooldown). Crossing a band gives one story line in the same reply and a voice that changes how the person speaks. People remember what you did, and secrets open by band. |
| **Checks** | One style: d20 + a modifier against a difficulty (easy 8, fair 12, hard 16, extreme 20). A natural 20 is a critical success, a natural 1 a critical failure, and missing by 3 or less a partial success. The % on a button is the real chance. Every result gives the narrator a direction ("fail forward"). |
| **Choices** | The writer phrases each choice, but it must pick a tag from the ruleset, and the tag decides the check and the effects. Each choice's difficulty word sets its target, so the odds follow the words. The same tag on the same person soon again gives less. |
| **Conflict** | One contest system for fights, chases and arguments: a momentum gauge from −100 to +100. Every message is a round, each check swings the gauge, and the stakes rise. Only a full swing, **Break off** or **Give in** ends it, never the narrator. Each round reaches the narrator as ordered beats, in the chat. |
| **Growth and goals** | Meters described in words (health, energy, mood), conditions, and skills and attributes that grow with use. Up to 3 open story goals: promises, favours and plans the story makes, plus the author's own. |

## Story or Adventure

Every ruleset is one of two styles. The first install shows both cards side by side; pick one, or **Build with AI**.

- **📖 Story (no dice).** Time, place, who is here and how they feel about you, with slow-burn relationships (affection and trust), secrets and goals. Nothing is rolled, and typed messages are never read for actions. For a romance card, the builder adds attraction.
- **🎲 Adventure (dice).** Everything in Story, plus d20 checks at risky moments, health, energy and mood, attributes that grow with use, and contests (fights, chases, arguments) on one momentum gauge.

Both templates fit any card: the time and place come from the greeting, and later places come from the story. After a template install you can switch between them in **Settings → Style** (your people are kept); a ruleset written for the card sets `style:` itself.

## Decision model: Helper or Jev

Warp asks small, typed questions (*does this message try something risky?*, *is Mira still here?*, *did trust go up?*) and gets back **probabilities**, never outcomes. When something is uncertain, the engine rolls on those odds with its own seeded dice. Both providers get exactly the same questions.

| Provider | What answers the questions |
|---|---|
| **Helper** (default) | Your helper connection answers them inside its one call after the reply, together with the choices and any new text (an outfit line, a memory, a newcomer's name). |
| **Jev** | [TypeSafe's](https://typesafe.ai) Jev classifier (or any service with the same API, e.g. Jev on OpenRouter) answers them in about 70–500 ms with calibrated odds. The helper only writes the choices and new text. Your API key is stored encrypted, and your roleplay text is sent to that service. **Jev makes typed play faster and cheaper.** |

Model calls per turn, besides the narrator's reply (measured by the pipeline tests):

| Turn | Helper only | With Jev |
|---|---|---|
| Typed dialogue or an ordinary action | 1 helper | 1 helper + up to 3 Jev |
| Typed risky attempt (Adventure) | 2 helper (the read must come before the dice) | 1 helper + up to 3 Jev |
| Clicked choice | 1 helper | 1 helper + up to 2 Jev |
| Contest round | 1 helper | 1 helper + 1–2 Jev |
| Story ruleset, any turn | 1 helper | 1 helper + 1 Jev |

The greeting read costs 1 more helper call (and 1 Jev call with Jev) once per greeting swipe. Every turn records what it cost (`calls` on the turn record).

Without Jev, a typed message is read only when it has a risky verb (fight, sneak, climb, steal, lie, try…), so ordinary turns keep to one helper call; Jev reads every message that does something. A typed message rolls only when the read is at least 75% sure it attempts something risky and contested. The dice chip says how sure it was, with a **Not an action?** button that redoes the turn without a roll.

## Settings

**Warp → Settings** has nine controls:

1. **Warp is on**
2. **Style**: Story (no dice) or Adventure (dice)
3. **Helper connection** (a fast, cheap model works best)
4. **Decision model**: Helper or Jev (API key; endpoint and model under Advanced; **Test decision model**)
5. **Show choices** (off: you just type, and no choices are written)
6. **Show odds**
7. **Dice on a swipe**: Casual (a swipe rolls again) or Ironman (the same roll)
8. **Show what changed**
9. **Lines & Veils**: tap a content tag to cycle it: on → veil (it happens off-screen) → line (removed)

## ✨ Build with AI

**Warp → Ruleset → Build with AI** works in one pass:

1. It reads the card in one call (with Jev set, Jev picks Story or Adventure and whether the card is one character or a scenario; the helper writes the summary and the cast).
2. You confirm Story or Adventure and answer three questions (tone, how hard risky moves are, how fast relationships move), plus up to three about the card.
3. It fits the chosen template to the card: names and band words, the cast with their starting feelings and looks, up to two secrets that open as trust grows, goals the card promises, contest labels.
4. Warp's checker repairs what doesn't fit (at most two rounds), and you see a preview of the panel and the choices before anything is saved.

**Refine with AI** changes an installed ruleset from an instruction ("make it harder", "relationships should move slower"): one call, then the same repair.

Deep passes, checks, playtest and import/export: Warp Studio (https://github.com/japolino/warp-studio).

## Where rules live

In the character's lorebook, so they travel with the card:

- any lorebook named `warp-ruleset`, or
- any entry whose title starts with `warp-ruleset` (e.g. `warp-ruleset · stats`).

Each entry is YAML and the entries merge. Warp keeps them out of the prompt automatically. Command palette → **Warp: Add rules to this character** shows the Story / Adventure picker. The Ruleset tab lists problems in plain language, with "did you mean" suggestions.

## Ruleset basics (format 2)

A ruleset has seven parts: **core, stats, people, world, actions, story, conflict**. The complete format is in [`src/engine/reference.ts`](src/engine/reference.ts) (the text the builder writes against), and the two templates in [`src/engine/templates/`](src/engine/templates/) are full worked examples.

```yaml
--- # core
name: Harbour Nights
style: adventure                 # story = no dice anywhere
clock: { start: greeting, fallback: "Day 1 09:00", minutes_per_action: 10, narrator_max: 480 }
start: { place: greeting, money: 50 }
hud: { currency: "$", bars: [health, mood] }

--- # stats
stats:
  health: { kind: meter, narrator: 20, bands: { 0: Near collapse., 25: { text: Badly hurt., say_down: "You're badly hurt." }, 80: Healthy. } }
  mood: { kind: meter, start: 60, narrator: 10, bands: { 25: Low., 75: In good spirits. } }
  money: { kind: money, narrator: 100 }
  body: { kind: attribute, max: 10, start: 3 }
  charm: { kind: attribute, max: 10, start: 3 }
checks: { stats: [body, charm], outcomes: { fail: { mood: -3 } } }   # typed attempts: d20 + the stat's share of 10

--- # people
relationships:
  big_moment: { factor: 3, cooldown: 10 }
  stats:
    trust:
      start: 20
      narrator: 4                # slow burn: at most 4 per reply
      bands:
        0: { text: Wary, voice: "{name} gives nothing personal away." }
        40: { text: Open, say: "{name} is starting to open up.", voice: "{name} shares small personal things." }
  people:
    jo: { name: Jo, age: 31, outfit: "a flour-dusted apron", start: { trust: 30 } }

--- # world
items:
  medkit: { name: Medkit, uses: 3, use: { label: Patch yourself up, health: +20 } }
conditions:
  shaken: { label: Shaken, tone: bad, bonus: { charm: -2 }, lasts: 2h }

--- # actions
actions:
  rest: { label: Rest a while, say: "*I rest for an hour.*", time: 60, effects: { health: +5 } }

--- # story
goals: { from_story: true, max: 3 }
secrets:
  past:
    person: jo
    tell: exists
    cue: "Jo changes the subject when her hometown comes up."
    stages: [ { band: { trust: Open }, text: "Jo left home after a fire she blames herself for." } ]
live_choices:
  tags:
    bold: { desc: "A daring move", check: { add: body, label: Body }, success: { mood: +3 }, fail: { health: -5 } }
    charm: { desc: "Persuading someone here", per_person: true, check: { add: charm, label: Charm }, success: { rel: { target: { trust: +3 } } } }
    kind: { desc: "Something kind (no roll)", per_person: true, effects: { rel: { target: { trust: +2 } } } }

--- # conflict
conflict:
  kinds:
    fight: { label: Fight, stats: [body], escape: body, cost: { fail: { health: -8 } }, won: { hint: "{opponent} backs off." }, lost: { health: -10 } }
```

**Effects:** stat shorthand (`mood: +5`), `set`, `flags`, `give` / `take`, `rel: { jo: { trust: +3 } }` (`target` / `opponent` too), `place: "The docks"`, `look: { you: { outfit: "..." } }`, `time`, `add_condition`, `remove_condition`, `hint`, `decide`, `remember`, `reveal`, `goal: { id: done }`, `contest: { kind: fight, with: "the guard", threat: hard }`, `swing: +20`.

**Formulas** read stats, flags, `hour`, `day`, `weekday`, `turn`, `place`, `round`, `momentum`, `in_contest`, and `has()`, `count()`, `flag()`, `cond()`, `rel()`, `met()`, `present()`, `between()`, `goal()`, `secret()`, `eff()`, `gear()`, `min`, `max`, `clamp`, `floor`, `ceil`, `round`, `abs`.

`player:` and `improvise:` are still read as `you:` and `checks:`. Keys of systems that were taken out (`encounters:`, `quests:`, `locations:`, `weather:`, `perks:`, `dungeons:`, `dating:` and the like) are ignored with one plain warning that says what to use instead.

The whole-loop simulator ([`src/engine/loop-sim.ts`](src/engine/loop-sim.ts)) plays a ruleset with a scripted player and checks the quality bar: the clock never drifts, the shown odds are the real odds, at most one typed message in three rolls in a dialogue-heavy chat, every failure has a direction, contests last 3–6 rounds, and no single choice dominates. Both templates pass it in the tests.

## Other extensions

**Warp Studio** ([japolino/warp-studio](https://github.com/japolino/warp-studio)) is the creator tool: deep builder passes, checks, the loop-sim playtest and whole-rulebook import/export. It uses Warp's own engine.

**LumiDoll** ([japolino/LumiDoll](https://github.com/japolino/LumiDoll)) draws a doll for your persona and the characters, and dresses it from Warp's looks and outfits.

**Cue** (visual novel mode): with Cue open, Warp's choices appear in Cue's view with their odds, a live status card (scene, meters, who is here, the contest gauge) can be pinned from **Panels**, and the moods Warp decides are passed to Cue so its portraits match.

Warp publishes the scene of the open chat as a window event, so other extensions can follow it without reading the story:

- `warp-state-v1` (Warp → any), sent whenever Warp's state for the open chat changes: `{ version: 1, provider: "warp", rulesetFormat, chatId, messageId, time?: { label, day, hour, minute }, place?, you: { name, appearance?, outfit?, items? }, people: [{ id, name, present, appearance?, outfit?, bands? }], meters?: [{ id, label, band }] }`. When Warp is off or the chat has no rules, an empty state (`people: []`) is sent so listeners can clear.
- `warp-state-request-v1` (any → Warp), `detail: { version: 1 }`: Warp answers at once with `warp-state-v1`.

Both are `window.dispatchEvent(new CustomEvent(name, { detail }))`. Listeners must work without Warp: then no event ever arrives.

## Develop

```bash
bun install
bun run verify   # tests + typecheck
bun run build    # dist/backend.js, dist/frontend.js
```

The tests run offline against fake hosts and scripted models; see [docs/TESTING.md](docs/TESTING.md).
