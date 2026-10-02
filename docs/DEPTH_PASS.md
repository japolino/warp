# Depth pass: choices, progression, social memory and onboarding

Second implementation pass after the product audit at `92f1557`. It builds on `SESSION_AGENCY_FIXES.md`. No minigame, table, song or dungeon grid was removed.

## Changed behavior

- **Live-choice forecasts.** Contextual choices may carry `forecast: { goal, risk, payoff }`. These are short, nonbinding story stakes. The writer sees each tag's authored check, cost, effects and outcomes. The tag still decides mechanics. Forecasts never change odds or grant effects. Malformed forecasts are dropped; legacy records still work.
- **Practice repetition.** Repeating the same checked opportunity teaches less: `1 / (1 + 0.5 × repeats)`, never below 10%. A two-hour in-game break or eight intervening turns restores full learning. A different action, place, scene participants, target, encounter or dungeon position is fresh. Failures still teach. Narrated training and authored rewards are unchanged.
- **Failure guidance.** Improvised failures and Universal search/mental failures direct the narrator toward a changed situation or new lead, not an identical retry.
- **Social memory.** Recent topics and social actions persist per person across reopened conversations, decaying with in-game time. Repeats taper positive affection, apology recovery, invitations and similar bonuses. New topics keep full first-use rewards. Warm, fresh conversation tires people less. Empty hello/goodbye loops earn nothing.
- **Builder defaults.** The builder no longer adds quests and minigames to every card. They remain available and selectable. The rules guide favors fewer, stronger systems and treats the connectivity audit as a wiring check, not a fun score.
- **Drafts.** Extra drafts are stored as optional swipes and never replace the reply being read. Settings note that each extra draft or prewrite costs a generation. Classifier and confidence controls sit under Advanced.
- **Minigames.** In **Ask** mode, action buttons and hotkeys roll immediately; a separate **Play challenge** or **Play table** button opens the briefing. **Always** keeps direct play. **Off** hides Play buttons. All ten games remain.
- **Secrets.** A companion's `knows:` secret now gives the narrator a knowledgeable-portrayal cue plus opened stages only. `knows_full: true` restores the old full-stage disclosure for that companion.
- **Discovery.** A discovered place now includes one safe, zero-time, no-roll local observation action. The helper output uses a strict schema and is validated before saving. Saving and reloading still happen before the move. With `discovery: { people: true }` (default off), a found place may also include one generated resident with a name, short description and a schedule there. The model never sets an age, so romance stays blocked until the person is known to be an adult. A malformed resident is dropped and the place is kept; resident ids never collide with existing people or engine-reserved ids (player, you, user, target). A resident with no established age is never picked for dungeon romance scenes. Generated text containing host macros (`{{`/`}}`) is rejected.
- **Dungeons.** Optional `party.stats` formulas, a `supplies` loadout, and `exit_rewards` / `exit_practice` mappings with per-exit caps. Rewards require earned run XP and a successful exit, never defeat. XP and levels stay run-local by default. Existing dungeons behave as before. Optional `boons: true` offers three seeded level-up boons per new party level (stat boosts, crit, supplies, stair healing, or one skill from another class for the player). Picks last for the current run only; leaving or defeat clears them. A waiting offer blocks movement and stairs like an event.
- **Mind counterplay.** Optional `mind.overrides_mode: soft` turns fail/redirect into narrative pressure while keeping the chosen action. Optional `resist_cost` adds a separate **Resist** button for an authored hard override. Resistance is paid only if the override triggers, must be affordable together with the action cost, and does not change displayed odds. Legacy hard overrides are unchanged. Live choices get the same warnings and Resist button when an override applies to their authored tag; resistance rides on the clicked live intent with its forecast.

## Compatibility

Old saves need no migration. New memory (`dt_recent`, `practice_use`) is stored as bounded, replayable events. Rulebooks without the new keys keep prior behavior, except two deliberate default changes: companion secret isolation (`knows_full` restores it) and builder default system selection.

## Known limits

- Forecasts are model-written prose. The engine ignores them mechanically and the UI escapes them, but their accuracy cannot be guaranteed.
- Repetition and social memory are rulebook-tunable: `growth.repeat: { step, floor, recover_minutes, recover_turns }` (or `false`) and `dating.memory: { recovery_minutes, keys, rest_per_minute }`. Defaults match the earlier fixed values; out-of-range values are clamped with a warning. The affection taper curve and the 64-context practice history stay fixed. Changing `dating.memory` changes how existing histories replay.
- Social significance comes from authored topics and categories. There is no promise or commitment tracker.
- Discovered places get one observation action and, with `discovery.people`, at most one generated resident. Residents have no authored topics, stats or secrets, and always stay at that place. Rulebooks that declare people without relationship stats get no residents.
- Dungeon classes keep fixed base skills; opt-in `boons` give run-only choices, but there is no equipment or permanent talent tree. Boons are fixed (not authorable) and only smoke-tested for balance. Per-exit caps are not lifetime caps, so authors must balance repeatable shallow runs.
- Tests are offline engine and scripted-host checks. Live model behavior, browser layout and player enjoyment are not measured.
