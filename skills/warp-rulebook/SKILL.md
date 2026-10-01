---
name: warp-rulebook
description: Write or improve a Warp rulebook — the YAML game rules (stats, encounters, quests, statuses, abilities, perks, places, people) that the Warp extension runs underneath a Lumiverse roleplay chat. Use when asked to make a game, RPG system, ruleset or rulebook for a character card or setting for Warp/Lumiverse.
---

# Writing a Warp rulebook

Warp is a game engine under a roleplay chat: the rules decide outcomes (dice, stats, time, quests, fights) and the narrator model only writes them. A rulebook is one YAML file. Your job is to make it a **game worth playing** for the card or setting you're given — not just valid YAML.

## Tools

Use whichever is available:

- **MCP** (if the `warp` server is connected): `warp_guide`, `warp_templates`, `warp_template`, `warp_check`, `warp_simulate`, `warp_preview`.
- **Shell**: `npx -y github:japolino/warp <command>` — or `node dist/warp-rulebook.js <command>` from a clone of the Warp repository. Commands: `guide`, `templates`, `template <id>`, `check <file>`, `simulate <file>`, `preview <file>`.

## Steps

1. **Read the guide first** (`warp_guide` / `guide`). It is the format reference and the design guide; don't write keys it doesn't describe.
2. **Read the card or brief.** Name the core loop before writing YAML: what the player does most days, what pushes back, what they work toward. Note the cast, places, tone, and anything the card tracks (a status block → proper stats).
3. **Pick a starting template** (`templates`), get it (`template <id>`) and adapt it: rename, retune, trim and extend. Questbound is a fantasy RPG, Starfarer a space opera, Casefile a noir mystery, Hometown a slice-of-life survival sim, Universal a light frame for anything.
4. **Write the file** (e.g. `rulebook.yaml`). Plain YAML with top-level keys is fine. Wire everything in: every stat has a source, a sink and a consequence; every item does something; every encounter has readable routes, an escape, and a danger; quests have goals the rules can see, a reward and a price for failing; there's a notice board somewhere central.
5. **Check after every meaningful change** (`check`). Fix every error and lint warning. Work the balance list and the depth audit: fix every `[gap]`, and fix or knowingly accept each `[thin]`. Aim for depth 90+.
6. **Simulate the encounters** (`simulate`). Random play should end well roughly 30–70% of the time; no route should be pointless or a sure win; escaping should cost something. Tune and re-check.
7. **Preview** (`preview`): the sidebar, choices and the narrator's view at the start. Bands should read as words, odds should be sensible, something should be on offer.
8. **Hand it over**: tell the user to import it in Lumiverse — **Warp → Ruleset → Import a rulebook** (paste it or choose the file), review, then **Install**. Summarise what the game is, its loop, and anything you deliberately left thin.

## Rules

- snake_case ids; meters 0–100 unless there's a reason; quote formulas that contain commas; refer to the player as `{{user}}`; in-world text in the card's voice.
- Prefer fewer stats that all matter over many idle ones.
- Make moves differ in kind, not only in which stat they roll: armor and piercing, multi-hit, statuses that tick or cost turns, heals, blood-price moves, percentage damage on big foes.
- Gate the best actions with `requires:` (a skill level, a companion present, an item, a quest) — a locked choice that says what's missing is a goal.
- Never anything sexual involving anyone under 18. Warp refuses to run a rulebook that declares minors alongside sexual actions.
