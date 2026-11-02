# Seamless systems implementation progress

Target: [Deep systems without a setup wizard](SEAMLESS_SYSTEMS.md). The complete target remains active. This checkpoint does not complete the new game engine.

## Checkpoint 1: mechanical state and action receipts

Implemented in `src/living/mechanics.ts`, `mechanical-history.ts`, and the default runtime:

- Explicit source-backed resource values, counted items, equipment state and conditions. Unknown values do not become zero, and ordinary scenes do not acquire health, mana or survival meters.
- Pure, atomic preparation/commit for resource spending/recovery, item consumption, equipment changes and quantity-conserving transfers. Failed prerequisites reject the whole operation set. Receipt IDs, base-state hashes and recomputed changes guard against duplicates and stale/tampered receipts.
- The helper can interpret explicit known item uses, handovers, equipment changes and numeric spends from the player's action. It cannot invent healing, damage, rewards or ability costs through this path. Generic recovery is an internal primitive pending the ability/effect layer.
- A prepared receipt is saved before narration. The completed reply commits it independently of scene extraction. Cancellation spends nothing; retries and alternate swipes reuse the preparation and project only the selected branch. Deleting a swipe shifts its mechanical record with the narrative record.
- Bootstrap observations cannot refill spent stacks or reset balances to match fresh prose. Explicit OOC corrections can replace values. Edited causal paths invalidate the mechanical projection instead of reusing stale costs or inventing replacement balances.
- Conditions affect a classified approach, not every check. Effects can be scoped to a particular target and place. Blocking conditions send an unresolved/blocked receipt to the narrator and do not roll or spend. Native decision profiles classify method and, when people are present, target in the same evaluation call.
- Mechanical state is included in chronological prompt snapshots as resource/item/condition deltas. Receipts are turn-local. Public prompt packets omit historical evidence and transaction bookkeeping; full provenance stays in metadata. Prompt previews preserve already prepared receipts without model calls or mutation.
- Existing inline notes show the immediate resource/item change. No new drawer, setup wizard, genre selector or required sheet was introduced. The dice presentation is unchanged.

The runtime and engine fixtures cover a café wallet and bandages, oxygen recovery, location-limited terrain, person-limited suspicion, movement injury, interrupted spending, unavailable interpretation, failed extraction, swipe projection/deletion, edited history and cache stability. These are deterministic fixtures, not a live-model accuracy claim.

Verification at this checkpoint: `bun run verify` passes 537 tests with 19,168 assertions and passes TypeScript checking. `bun run build` succeeds. Both `bun scripts/host-smoke.ts D:/Lumiverse` and `bun scripts/mechanical-host-smoke.ts D:/Lumiverse` pass. The latter exercises the production bundle inside the real Lumiverse sandbox worker: bootstrap counted inventory, prepare consumption without spending during narration, then commit it and emit the inline change note. Host chat data and model responses remain disposable fixtures.

## Checkpoint 2: persistent ability content and optional inspection

`abilities.ts` now maps relevant established abilities into a bounded effect vocabulary. Sources are captured card/persona text and at most six activated lore entries fetched by ID in the owning user's scope. Hashed source snapshots travel with their definition records so later card edits cannot rewrite the mechanics used by past receipts. Preparation runs with the existing extraction call, or with the existing pre-action interpretation on first use; no rulebook or setup UI is created.

Definitions have stable owner/name IDs, versions, explicit costs, target policy, prerequisites, effects and source evidence. Repeated helper output cannot change a saved cost. Edited source mechanics or an explicit correction can create a subsequent version. A removed card/persona ability is not executable merely because its old definition remains in history. Invocation arguments cannot override a saved cost, and overlapping explicit charges cannot charge that cost twice.

The current effect subset supports restoring or damaging an established resource, applying a condition, and clearing a named condition. It validates targets, equipment and effect resources before spending, resolves costs/effects atomically, caps recovery, and skips success effects on an executed setback. Unsupported fields, formulas and restrictions are rejected or retained as explicit blockers, never silently dropped. Non-numerical effect amounts can use the small fixed 5/15/30 magnitude catalogue; these values are labelled Warp values and are not a claim of calibrated tactical balance. The broader encounter/effect system remains open.

The normal strip offers an optional Inspect button only when mechanical state exists. It opens a read-only inline view of player resources, counted items, conditions, and abilities. Individual abilities expand to costs, effects, prerequisites, source text and version. It does not expose card-derived NPC ability details, perform actions, advance time or invoke models. Newly prepared player abilities can show a short cost summary. The public extension state projects counted inventory instead of duplicating matching older prose facts.

Verified: 556 tests and 19,246 assertions pass, including automatic preparation, first use without an earlier scene read, cost stability, source version history, activated-lore fetching, unsourced numbers, malformed restrictions, duplicate-cost prevention, positive effects and read-only inspection. TypeScript and production build pass. Both existing sandbox worker checks pass, and `bun scripts/mechanical-host-smoke.ts D:/Lumiverse --abilities` exercises the production bundle's source-backed preparation and atomic cost/recovery path in the actual Lumiverse worker with disposable model/chat fixtures. A browser preview verified Inspect open/close and expanded ability details. This remains separate from live-model semantic accuracy and sustained human playtesting.

Helper source text now precedes changing state in requests to retain a larger stable prefix. Main narrator packets continue to use persisted chronological state and definition deltas. No model call per effect or per ability was added.

## Requirements still open

| Target area | Current evidence | Remaining work |
| --- | --- | --- |
| Immediate use, inherited models, no wizard | Existing default startup remains; new mechanics join its interceptor/extraction flow. | Real-card first-use tests with compiled abilities and the eventual inspector. |
| Shared entities and causal state | Resources/items/conditions have stable IDs, owners, sources and transactional changes. | Unify these identities with people, possessions, places and ability targets; resolve aliases without duplicate entities. |
| Actions and branch safety | Preparation, cancellation, exactly-once commit and selected-swipe projection are exercised. | Extend the same semantics to dependent plans, abilities, positive effects, trading, growth and rewards. Edited histories currently conservatively drop affected mechanical projections; rich repair remains open. |
| First-use definitions | Source-backed preparation, cached versions, explicit costs, labelled magnitude defaults and optional inspection are implemented. | Richer field-level grounding, item/capability identity unification, complex source restrictions, timely cost visibility under live model behavior and unfamiliar-power tests. |
| Interacting encounters | Scoped condition influence and atomic ability costs/resource effects/conditions are active. | Broader effect ordering, defenses, damage types, range, reaction limits, timing, companions, links and balance simulations. |
| Growth and builds | Existing authored-engine primitives are available for selective reuse. | Default-runtime meaningful-use growth, milestones, combinations and anti-grind integration. |
| Goals, social consequences and activities | Existing sourced knowledge, agreements and narrative situations remain. | Explicit condition/reward claims, distinct witnesses, leverage, activity progression, persistent exploration graph and resource depletion. |
| Optional depth | An inline read-only player inspector is implemented; ordinary mechanical questions do not invoke an ability. No additional process or relay was added. | Broader local natural-language queries, maps, patrons/audiences, detailed equipment and premise-backed survival/economy. |
| Native tool path | Lumiverse exposes extension inline tools. | Shared handler, per-action ownership, provider testing, no double execution alongside the interceptor. |
| Model cost and cache | Existing historical prompts remain stable across mechanical deltas in tests; ordinary affectionate gestures do not invoke a mechanical read. | Profile real helper behavior/latency, bound large-state retrieval, verify live provider cache telemetry where available. The current intent hints remain English-oriented. |
| Reliability and enjoyment | Engine and fake-host invariants have direct tests. | Multi-card live play, long histories, unfamiliar abilities, first-session learning, tactical alternatives and sustained fun. |

The new transaction foundation has not been deployed to the running local installation at this checkpoint. The installed build remains the previously verified animated-dice build while the next mechanical layers are developed.
