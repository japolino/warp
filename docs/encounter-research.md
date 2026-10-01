# Encounter fixes and future design notes

## Implemented scope

These changes preserve the current encounter model. They prevent after-reply bookkeeping from restarting an encounter that the recorded exchange has already ended, including a continuation of that reply. A new encounter in a later exchange remains possible. Rejected starts are recorded in the turn's rejection trace.

The existing encounter HUD, including foe meters and momentum, now also appears beside the in-chat choices. This makes progress visible without opening the status panel. A check succeeding is still distinct from an encounter ending.

Validation now warns when `end:` is put in the unused `effects:` of a checked action. That field no longer counts as a usable exit. Momentum encounters retain their existing automatic endpoints.

The supplied rulebook's corrected local copy adds `remove_condition: [cornered, spotted]` to the `overwhelmed` outcome and caps visibility at 25 using `set: { visibility: "min(visibility, 25)" }`. Removing the condition alone was insufficient: public visibility triggers could re-add it during the same ending. The copy retains the remaining consequences, other outcomes and all original action probabilities. No custom story text is included in this repository.

In the reported encounter, opponents start with 14 fervor. A persuasion success removes 5, so three successes end it. A diversion success removes 6. A successful escape ends it directly. Defeat happens when arousal reaches 80, stress reaches 80, or fatigue reaches 85. The labels and the fixed `say:` sentences still repeat while those actions remain available; changing that presentation or the combat model is future work.

Existing games that have pinned rule definitions keep those definitions. Importing edited author rules does not rewrite historical snapshots. Test the corrected book in a separate chat, or use **Warp: Start a playthrough with edited rules** if a fresh game in the current chat is intended. That command resets game state while retaining messages.

## What the Degrees of Lewdity sources support

The official project's [stalking-action change](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/merge_requests/3508) shows actions gated by current situation and character capability. It describes a skill-versus-skill check whose success terminates a chase, and consequences applied after escape. The useful lesson is that an action has a defined transition and an explicit endpoint. This is evidence from a particular subsystem, not a claim that every encounter follows the same rules.

The official [combat-end update](https://gitgud.io/Vrelnir/degrees-of-lewdity/-/commit/01148a09aed0e32be2eca140d28cb374fbc9d678) places post-combat state updates in a dedicated end path. Warp should likewise treat an ending as a completed transition and apply consequences once, instead of letting narrative extraction recreate the same active state.

The official [0.5.7.9 release commit](https://www.gitgud.io/Vrelnir/degrees-of-lewdity/-/commit/79e0fe22a226d925b87808c61594146f8257b045) describes combining repetitive action text to improve its flow. That supports improving how resolved actions are presented. It does not establish that all mechanics or responses are deterministic.

Direct browsing of the complete combat source was blocked by the host. These notes rely on accessible official project changes and their descriptions; they are not a full audit of the current game. No source code or authored scenes were copied.

## Options to investigate, not implemented

| Direction | Benefit | Cost or risk | Offline evaluation |
|---|---|---|---|
| Publish progress and loss thresholds | Players can distinguish progress from a complete victory and understand danger. | Some hidden information may need to stay hidden; author-visible goals should be explicit. | Test that the view matches state after every round and never shows gated information. |
| Change choices as the scene changes | Opening, pressure, advantage and escape can offer different decisions. | More authored states and more transitions to validate. | Enumerate reachable states; assert every nonterminal state has a legal action and a route to an outcome. |
| Short authored response fragments | Results remain concise and consistent with mechanics, with different fragments for each stage or outcome. | Less freedom and more authoring work. | Snapshot each fragment, count repeated output, enforce length limits and assert that no fragment contradicts its event record. |
| Bounded narrator retelling | Retain prose variation while constraining a reply to one resolved round. | A prompt alone cannot guarantee compliance; enforcement needs a defined host contract. | Feed contradictory and overlong replies through a fake host and measure rejection, retry cost and outcome preservation. |
| Explicit stalemate or time-limit outcome | Long stretches without progress eventually resolve. | A generic cutoff can penalize legitimate defensive strategies and requires an authored consequence. | Compare encounter-length distributions, timeout frequency, win/loss rates and consequences under multiple seeded policies. |

Warp's seeded dice already reproduce an outcome when the state, intent and accepted probabilities are held fixed. The unresolved design question is how much of each round's wording and decision input should remain model-generated. Reproducible mechanics do not require removing chance, and concise authored text does not require changing the check system.

Before a redesign, define target encounter length and acceptable repeated-action frequency. Test one small fixture with victory, defeat, escape and stalemate routes, then compare it with the current system. The regression suite added here covers progress through three checks, defeat, narrative restart rejection, continuation bookkeeping and inline progress rendering. It does not impose a new round limit, scripted narration or action-selection policy.
