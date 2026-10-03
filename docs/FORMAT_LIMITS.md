# Format limits pass

Follow-up to two stress-test rulebooks (a LitRPG and a low-fantasy game). They pushed the rulebook format until it resisted. This pass fixes the bugs they hit and adds what they couldn't express. Rulebooks without the new keys behave as before; deliberate exceptions are listed under Compatibility.

## Bugs fixed

- A percentage cost on an ability (`cost: { hp: "-15%" }`) no longer crashes. Every cost path reads costs the way effects do. `warp_check` now evaluates costs instead of reporting a broken book as clean.
- A meter with a formula max can start above 100: `start: 500`, `start: full`, `start: "50%"` or a formula, clamped to the evaluated max.
- Action costs gate. A drop the player can't pay locks the choice with a reason ("Needs 80 Mana") in display, click and execution. Drops on good: low stats are relief and never lock. The price follows the chosen params. In a fight where every move is priced out, only the cheapest stay open and take what's left.
- Win or loss no longer depends on the ending's name. Authors can declare `losses:` or `outcome_kinds:`; otherwise Warp infers from the rules (a foe stat heading your way is a win) before falling back to names. One classifier serves the simulator, the checker, quest hooks and the encounter view.
- Check and simulate report the same categories: won / escaped / conceded / lost. The checker wants random play to win sometimes; escapes don't count as beating a fight.
- A trigger can't restart the encounter that just ended in the same turn (no instant re-ambush after an escape).
- Lint warns about writes to a foe stat that doesn't exist, unknown keys in action-shaped blocks (live-choice tags, encounter moves, item uses, abilities), and buttons that only spend points on a stat. It no longer claims a cured condition "never wears off". The audit counts armor-only clothing.
- The narrator can't move the player into a locked or hidden place.
- `eff()` inside a check formula doesn't count gear twice.

## New in the format

- **Monsters that scale:** foe stats and armor may be formulas, worked out once when the encounter starts.
- **Boss phases:** `when:` on foe moves (and any decide option); `in_encounter('id')`, `encounter`, `encounter_round` in formulas.
- **Simulation:** `warp_simulate` takes `set` (start from a patched state) and shows per-strategy results; an encounter's `sim:` sets the state the checker and simulator judge it from.
- **Gear and formulas:** `eff(stat)` (stat with gear, perks and statuses), `gear(stat)`, `integrity(item)`; formula gear/condition armor and bonus; `per_hour` as a formula or a percentage; check `crit:` chance.
- **Statuses:** `every: [round, hour]` ticks per round in a fight and hourly outside.
- **Resources:** `per_encounter` / `per_day` on encounter moves; `effects:` next to a check always apply; signed `resist_cost`.
- **Sheet, not story:** stat `allocate:` gives +/− in the sidebar with no story turn; perk `offer: always` and `points:` for class choices; `show:` controls words, numbers or both; currency templates (`"{n}d"`).
- **World:** location `requires:` / `when:` / `temp:`; per-exit travel minutes; schedule `at: away`; action `targets:`; front stage `if:` / `else:`.

## Compatibility

- Engine-derived data stays out of the rules revision, so existing chats aren't flagged as "rules changed" by this update. Shipped templates hash the same as before for identical YAML.
- Deliberate behavior changes, all bug fixes: costs that can't be paid now lock; an explicit meter `start` above 100 with a formula max is honoured; a mislabelled ending such as `slain` now counts as won; three template encounters were retuned (Starfarer ambush, Casefile shakedown) or given `sim:` (Questbound Barrow-Wight) so random play can win.
- A meter with a formula max and no `start:` keeps its old start of 100; write `start: full` for a full pool.
- Banded skills and money keep their numbers in the sidebar unless `show:` is written.

## Remaining limits

- Allocation is add-only; refunds aren't tracked.
- Story `move:` effects in authored rules still ignore place gates (only player travel and the narrator's free moves are gated).
- `resist_cost` takes plain numbers only; perk `bonus:` and edges stay numeric.
- Structural win/loss inference is conservative; unusual endings fall back to the name.
- Tests are offline engine and scripted-host checks; live Lumiverse layout is not verified here.
