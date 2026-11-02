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

## Requirements still open

| Target area | Current evidence | Remaining work |
| --- | --- | --- |
| Immediate use, inherited models, no wizard | Existing default startup remains; new mechanics join its interceptor/extraction flow. | Real-card first-use tests with compiled abilities and the eventual inspector. |
| Shared entities and causal state | Resources/items/conditions have stable IDs, owners, sources and transactional changes. | Unify these identities with people, possessions, places and ability targets; resolve aliases without duplicate entities. |
| Actions and branch safety | Preparation, cancellation, exactly-once commit and selected-swipe projection are exercised. | Extend the same semantics to dependent plans, abilities, positive effects, trading, growth and rewards. Edited histories currently conservatively drop affected mechanical projections; rich repair remains open. |
| First-use definitions | No rulebook dependency was introduced. | Source-backed ability/item compiler, immutable versions, supported approximation policy, cached definitions and first-use cost visibility. |
| Interacting encounters | Approach-specific condition influence is active; typed state and recovery primitives exist. | Shared effect ordering, defenses, damage, range, reaction limits, timing, companions, links and balance simulations. |
| Growth and builds | Existing authored-engine primitives are available for selective reuse. | Default-runtime meaningful-use growth, milestones, combinations and anti-grind integration. |
| Goals, social consequences and activities | Existing sourced knowledge, agreements and narrative situations remain. | Explicit condition/reward claims, distinct witnesses, leverage, activity progression, persistent exploration graph and resource depletion. |
| Optional depth | No additional setup process or relay was added. | Inline read-only inspector, natural-language mechanical queries, maps, patrons/audiences, detailed equipment and premise-backed survival/economy. |
| Native tool path | Lumiverse exposes extension inline tools. | Shared handler, per-action ownership, provider testing, no double execution alongside the interceptor. |
| Model cost and cache | Existing historical prompts remain stable across mechanical deltas in tests; ordinary affectionate gestures do not invoke a mechanical read. | Profile real helper behavior/latency, bound large-state retrieval, verify live provider cache telemetry where available. The current intent hints remain English-oriented. |
| Reliability and enjoyment | Engine and fake-host invariants have direct tests. | Multi-card live play, long histories, unfamiliar abilities, first-session learning, tactical alternatives and sustained fun. |

The new transaction foundation has not been deployed to the running local installation at this checkpoint. The installed build remains the previously verified animated-dice build while the next mechanical layers are developed.
