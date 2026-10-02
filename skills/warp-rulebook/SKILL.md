---
name: warp-rulebook
description: Write or improve a Warp rulebook — the YAML game rules (stats, encounters, quests, statuses, abilities, perks, places, people) that the Warp extension runs underneath a Lumiverse roleplay chat. Use when asked to make a game, RPG system, ruleset or rulebook for a character card or setting for Warp/Lumiverse.
---

# Writing a Warp rulebook

Warp is a game engine under a roleplay chat: the rules decide outcomes (dice, stats, time, quests, fights) and the narrator model only writes them. A rulebook is one YAML file. Your job is to make it a **game worth playing** for the card or setting you're given — not just valid YAML.

## Tools

Use whichever is available:

- **MCP** (if the `warp` server is connected; the repo's `.mcp.json` declares it): `warp_guide`, `warp_templates`, `warp_template`, `warp_check`, `warp_simulate` (takes `set` to start from a patched state, and `strategies`), `warp_preview`.
- **Shell**: `npx -y github:japolino/warp <command>` — or `node dist/warp-rulebook.js <command>` from a clone of the Warp repository. Commands: `guide`, `templates`, `template <id>`, `check <file>`, `simulate <file>`, `preview <file>`.

## Steps

1. **Read the guide first** (`warp_guide` / `guide`). It is the format reference and the design guide; don't write keys it doesn't describe.
2. **Read the card or brief.** Name the core loop before writing YAML: what the player does most days, what pushes back, what they work toward. Note the cast, places, tone, and anything the card tracks (a status block → proper stats).
3. **Pick a starting template** (`templates`), get it (`template <id>`) and adapt it: rename, retune, trim and extend. Questbound is a fantasy RPG, Starfarer a space opera, Casefile a noir mystery, Hometown a slice-of-life survival sim, Universal a light frame for anything.
4. **Write the file** (e.g. `rulebook.yaml`). Plain YAML with top-level keys is fine. Wire everything in: every stat has a source, a sink and a consequence; every item does something; every encounter has readable routes, an escape, and a danger; quests have goals the rules can see, a reward and a price for failing. Add a notice board only for quest-driven adventures, not relationship drama or a freeform sandbox. A meter may intentionally only colour the prose.
5. **Check after every meaningful change** (`check`). Fix every error and lint warning. Work the balance list and the depth audit: fix every `[gap]`, and fix or knowingly accept each `[thin]`. Depth measures static wiring, not fun — don't chase 100 by adding systems the game doesn't need.
6. **Simulate the encounters** (`simulate`). Results split into won / escaped / conceded / lost. Random play should sometimes WIN (escapes don't count as beating it); no route should be pointless or a sure win; escaping should cost something. Judge late fights at their intended state with an encounter `sim:` patch (or `set` / `--stat level=12`). Read the per-strategy lines. Tune and re-check.
7. **Preview** (`preview`): the sidebar, choices and the narrator's view at the start. Bands should read as words, odds should be sensible, something should be on offer.
8. **Hand it over**: tell the user to import it in Lumiverse — **Warp → Ruleset → Import a rulebook** (paste it or choose the file), review, then **Install**. Summarise what the game is, its loop, and anything you deliberately left thin.

## Rules

- snake_case ids; meters 0–100 unless there's a reason; quote formulas that contain commas; refer to the player as `{{user}}`; in-world text in the card's voice.
- Every action is a story turn: a click posts a line and costs a narrator reply. Never model sheet changes as actions. Stat points are spent with `allocate:` on the stats (+/− in the sidebar), classes and talents are perks (their own panel), clothes go through the wardrobe. `warp_check` warns about point-spending buttons.
- Long sheets need headings: give stats `group:` (Level, Attributes, Combat, Skills) and perks `group:` (Classes, Advanced classes, Talents). Perks the player can't have yet fold under "Not yet" with what they need; mark secret ones `hidden: true` so they stay off the list until earned.
- Prefer fewer stats that all matter over many idle ones, and fewer systems with stronger interactions over many loose ones. Quests, minigames, dungeons and dating are optional — add them when they serve the card.
- Make different approaches carry different risks or payoffs, and make failures change the situation rather than invite an identical retry.
- Name endings freely, but declare `losses:` / `outcome_kinds:` when a name could mislead.
- Newer optional keys (see the guide): stat `allocate:`, `show:`, `start: full`, formula `per_hour`; `eff()` / `gear()` / `integrity()` in formulas; check `crit:`; formula gear/condition armor and bonus; foe formula stats and armor, foe-move `when:`; encounter-move `per_encounter`; location `requires:` / `when:` / `temp:`, per-exit travel, schedule `at: away`, action `targets:`; perk `offer: always`, `points:`, `group:` and `hidden:`; stat `group:`; front stage `if:`/`else:`; `dating.fear: false`; currency templates; `growth.repeat`, `dating.memory`, `mind.overrides_mode` and `resist_cost`, companion `knows_full`, `discovery.people`, and dungeon `boons`, `party.stats`, `supplies`, `exit_rewards`, `exit_practice`.
- Make moves differ in kind, not only in which stat they roll: armor and piercing, multi-hit, statuses that tick or cost turns, heals, blood-price moves, percentage damage on big foes.
- Gate the best actions with `requires:` (a skill level, a companion present, an item, a quest) — a locked choice that says what's missing is a goal.
- Never anything sexual involving anyone under 18. Warp refuses to run a rulebook that declares minors alongside sexual actions.
