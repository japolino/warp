# Deep systems without a setup wizard

Design revision, 2026-11-02. This is a plan, not implemented behavior. It supersedes the earlier assumption in PLAY_DESIGN.md that the default runtime should remain mechanically small. The constraint is low setup and learning effort, not a low system count.

## Product decision

Install Warp, open an existing chat, use the normal composer. Inherit the chat connection; optionally select helper and decision profiles. No genre selection, rulebook generation screen, source checklist, initial character-sheet approval, required drawer, external relay, or second application.

Ship one versioned mechanical engine. Generate character and world content as needed, within that engine's typed operations. The player does not author rules; the engine does not ask an AI to invent its mathematics every turn. All numbers and restrictions that can affect a decision must be available to the player before that decision, even when the player never opens an inspector.

The ordinary interface is prose, inline dice and short consequential changes. Metagaming is supported through optional inline inspection and normal-language questions. Reading detailed mechanics is never the entry requirement for using them.

## What the reference actually establishes

Read the supplied NyoruRPG 0.40.0 bundle and the saved introduction post. The bundle contains 306 bundled module entries. This was a targeted source review of the runtime, effect model, combat, resources, equipment, missions, summons, social systems, map, review and persistence paths; it was not an exhaustive audit or a live playtest.

The post describes eight rulebooks with genuinely different mechanics. Tactical combat, D100 fantasy, cultivation and social play are not merely visual themes. Its example of cold buildup crossing a threshold faster after an equipment modifier is the clearest explanation of its depth: different systems alter one another's results.

Relevant source modules:

| Area | Source modules | Useful mechanism |
| --- | --- | --- |
| Authority and actions | narrative-flow, tool-runtime, result-record, repository | Code resolves operations; the narrator receives receipts. Action IDs prevent replaying costs and rewards. Changes are staged and committed against the expected branch. |
| Effects and combat | effect-model, effect-system, skill-casting, skill-cooldown, combat-resolution | Typed effects, target eligibility, resistances, shields, damage sharing, buildup, casting, reactions and cooldowns compose. |
| Items | equipment-presence, durability, ammunition, item-stacking | Ownership, being carried, being equipped, attachments and working condition are distinct. |
| Summons | summon-system, actor-links | Persistent entity identity, explicit lifetime, shared resource payers and growth links. Resummoning does not automatically heal or resurrect. |
| Goals and patrons | mission-links, mission-rewards, observer-system | One activity can meet several separately accepted promises. Each condition and reward retains its own identity and settlement status. |
| Exploration | adventure, spatial-map | Generated topology and remaining resources persist. Movement, inspection and reading a map are distinct operations. |
| Social play | social-engine, social-events | Winning a negotiation and improving trust are separate outcomes. Relations can be directional. |
| Reconciliation | turn-review, scene-reconciliation, generation-rollback | Review compares prose with state and receipts, with branch checks and constrained repairs. |

The setup burden comes partly from transporting tools into Risu and partly from asking the user to select and build a rulebook. Lumiverse already exposes extension tool registration and inline tool availability in its SDK and generation service. Warp does not need Nyoru's personal MCP relay to obtain a native tool path. Provider compatibility and actual invocation still require host testing.

## Automatic preparation, not automatic rulebook authoring

Split the implementation into three responsibilities:

1. **Engine-owned rules.** Effect ordering, hit resolution, costs, equipment requirements, action timing, growth, reward settlement and duplicate prevention ship with Warp. They are versioned and tested together.
2. **Source-backed content.** The card, persona, currently activated lore and established chat identify people, abilities, equipment, explicit stats, prohibitions and world-specific constraints. They are inputs, not executable code or permission to override the extension.
3. **Bounded mechanical interpretation.** A helper maps a described ability onto supported effects and, where numbers are absent, an engine-defined balance category. Code supplies the actual parameters. Definitions are saved and reused. The model cannot submit arbitrary executable formulas or create an unrestricted effect hook.

This does include automatic preparation behind the scenes. It does not eliminate the interpretation problem by renaming it. The difference from a wizard is that it is incremental, bounded, nonblocking for ordinary conversation, and does not require user review before play.

On first chat entry, prepare only the player, people present and immediately relevant abilities or items. Do not compile an entire lorebook or reconstruct thousands of old messages. Reuse existing host retrieval/activated lore and bring older material in when relevant.

An ability becomes mechanically defined before its first consequential use. Repeated uses reference the same definition, cost, effect and limits. Explicit source numbers take precedence over generated balance values within the supported engine model. Generated values are identified as Warp values when inspected, rather than presented as facts found in the card.

Unknown values stay unknown. Unknown money is not zero money; missing ammunition is not an empty gun; an unmentioned power limit is not permission to invent a severe drawback. Resolve a missing consequential definition through focused preparation. If the evidence remains ambiguous, ask one local question in context, or leave that particular mechanic unresolved. Never send the user through a setup flow to resolve an unrelated scene.

Hard fictional constraints are evaluated before odds. Established immunity, the wrong key, unavailable equipment, or a power that cannot affect this target cannot be overcome by a favorable random roll. Established overwhelming ability cannot be reduced to a coin flip against an ordinary obstacle.

## Systems become relevant through events

Every system is available; only relevant state is materialized. Activation is scoped to entities, activities and scenes, not a hidden genre preset. A pistol can use ammunition in a fantasy scene, and an ordinary negotiation can occur during a dungeon expedition.

| System | First relevant event | Automatic behavior | What the player sees |
| --- | --- | --- | --- |
| Resources and conditions | A consequential injury, exertion or ability cost | Track the applicable resource or condition, with engine-owned effects and explicit recovery triggers. | The immediate cost and changed condition. A resource count appears when needed. |
| Abilities | An established ability is attempted or learned | Reuse or prepare its effect, target rules, cost, range and any supported source restriction. | Name and result; a brief cost or restriction before commitment when it matters. |
| Combat | Credible opposing actions begin | Build a participant set and resolve an exchange with reactions, effects and costs. | The relevant enemy intention, roll and consequences. No mandatory turn-table study. |
| Equipment and inventory | An item is obtained, equipped, used, handed over or lost | Store stable instance identity, holder, quantity, equipped state and applicable effects. | Changes such as "Bandage used · 2 left" or "Ward broken." |
| Ammunition, weight and wear | The card establishes the constraint or the player adopts it | Track supported quantities and enforce known limits consistently. | Remaining capacity before it blocks the next choice. Never a surprise inventory tax. |
| Growth | Meaningful practice, challenge, instruction or discovery | Accumulate eligible growth and apply stable milestones; repeated trivial actions do not farm unlimited gains. | A new option or occasional milestone, rather than XP spam after every sentence. |
| Goals and rewards | An actual request or agreement is accepted | Separate conditions, beneficiaries and promised rewards. Settle each once. | What remains to be done or what was received. No automatic acceptance of every request. |
| Summons and companions | An established summoning or companion action occurs | Preserve entity identity and apply known lifetime, resource links, autonomy and growth. | Relevant condition or shared cost. No pre-registration form. |
| Social relations | A witnessed act, disclosure, agreement or betrayal matters | Record who knows it, directional expectations, obligations and concrete leverage. | Behavior and access change. Optional inspection explains the remembered cause. |
| Exploration | The player actually enters or investigates a place | Reuse established layout; prepare only new space; retain exits, discovered clues and depleted resources. | Description and discoverable routes. An optional inline map shows known space. |
| Patrons and audiences | A patron/audience exists in the premise or is intentionally introduced | Track individual requests, trust/devotion, assistance costs and reward budgets. | A contextual reaction or offer. No gods or broadcast economy spawned because the system exists. |
| Survival and economy | The premise makes resource pressure meaningful, or the player requests it | Track actual fictional time, supplies, prices and obligations using supported values. | Useful forecasts and consequences. Ordinary dinner does not silently activate lethal hunger. |

Theme-changing systems need stronger activation evidence than bookkeeping. Seeing the word "watching" is not evidence of a streaming audience. An NPC saying "you owe me" is not evidence that the player accepted a monetary debt. A character drinking tea does not activate a bladder simulator.

Explicit restrictions such as four equipped skills or seven body-part health pools are honored when established or requested. They are not silently assigned to every card. A player can introduce an elective challenge in normal language; Warp states the operative change once in the conversation and saves it.

## A first-session example

The player opens a card where an ice mage has a familiar and enters a ruined watchtower. No setup panel appears.

"I send the familiar through the window while I keep the guard talking."

Warp recognizes an established companion, a scouting intention, the guard's knowledge and separate opportunities for action. It prepares only the relevant companion/scouting and social operations. Looking through an open window may need no roll; an alert guard opposing entry may create uncertainty. Neither action grants the familiar a new teleport ability.

The scout discovers a grate and a side passage. Those facts persist. The player says, "I freeze the grate and have the familiar strike it."

The cold effect can change the grate's material condition, which changes the familiar's next attempt. If there is an established mana cost, it is paid through the recorded payer exactly once. A mixed result might break the grate while making a noise, rather than arbitrarily injuring the mage. The guard can react only if the noise reaches them.

On returning later, the grate remains broken and the same familiar retains its condition. Practice may contribute toward a relevant milestone. A witness who noticed the intrusion remembers it. These are interacting systems with no need for an inventory screen, effect editor or named quest.

For metagaming, the player can ask "How much mana would that cost?", "What can my familiar do?", "Can I combine these spells?", or "Show our current state." Warp answers from saved definitions and state. A read-only question does not roll, advance time or spend a resource.

## Teach through the next decision

Keep the dice row compact, as requested. Do not restore the long explanation underneath each roll.

When a new rule matters, expose its practical implication in the scene: "Another cast will exhaust your ward" or "The shield blocks the doorway, but leaves your flank open." This can appear in prose or a single short inline notice. Do not claim the player understood a resource constraint merely because a hidden inspector contains it.

An optional inline inspector opens from an ability, item or a normal-language request. It shows current values, exact effects, costs and sources. The player can inspect deeply, compare options and edit through the existing correction path. No feature requires visiting a sequence of tabs.

Maintain separate meanings for ordinary speech, an attempted action and an explicit out-of-character edit. "I take the king's gold" is an attempt, not authority to create it in inventory. "OOC: we established I have 20 coins" is a correction, recorded as such. Metagaming questions provide information rather than resolving the action being discussed.

## Mechanical core

Use shared primitives so features combine instead of accumulating independent trackers:

- Entities with stable identity, ownership, presence, knowledge and source references.
- Resources with current/max values, units, payer and recovery policy; values may be absent.
- Abilities with prerequisites, target selectors, range, timing, costs and typed effects.
- Effect primitives for damage, recovery, resistance, shields, temporary modifiers, buildup, conditions, movement and resource links.
- Conditions with an explicit ending trigger. Cooldowns tick on the relevant actor's actions or established fictional time, never on messages or API waiting.
- Places and objects with persistent links, access, discovery and remaining resources.
- Goals composed of conditions and separate reward claims.
- Prepared action receipts and committed events with causal links, branch and definition versions.

Reject cyclic resource/stat links, repeated reward claims, invalid ownership, negative quantities and unsupported effect combinations. Bound automatic reactions and follow-up effects so a reflect/counter/summon loop cannot run forever. Distinguish one multi-hit ability's cost from several separately cast abilities.

Resolve in a fixed documented order: validate action and authority; verify prerequisites and targets; reserve applicable costs; resolve uncertainty; apply defenses and effects; run bounded dependent effects; record growth and goal progress; stage the complete receipt. Failed executed attempts may spend their advertised costs. Rejected or cancelled actions do not masquerade as paid, successful executions.

A story's exact numerical mechanics may conflict with the generic engine. Prefer a supported explicit mapping, and expose any approximation when relevant. Do not promise flawless implementation of arbitrary published systems or every fictional power. Keep a qualitative constraint if precise mapping is unavailable rather than silently changing the source rule.

Do not bolt new arithmetic onto the existing outcome bands and call the result balanced. Keep current records readable and preserve saved rolls. Introduce a versioned resolver when the new effect/resource core is ready, with simulations for equal and unequal opponents, progression, resource starvation, and common combinations. The current favorable/uncertain/outmatched distributions are a prototype baseline, not a completed tactical balance model.

## Turn execution and narrator integration

The current default path is an interceptor plus post-reply extraction. Extend it with a mechanical transaction, without requiring the narrator to support function calling.

1. Read the active branch and reuse its compiled definitions and previous state.
2. A focused helper interprets an unrecognized consequential intention into typed operations, citing relevant evidence. Known definitions need no regeneration. JEV can route supported classifications; it cannot author an arbitrary ability or prove a whole plan correct.
3. Validate operations and resolve their known dependencies locally. Save the prepared receipt before narration, including deterministic random draws, definition version and reserved changes.
4. Give the narrator the receipt, relevant state and open choice boundaries. It describes what occurred; it does not choose replacement damage, secretly grant items or repeat automatic reactions.
5. On successful reply completion, commit mechanical changes once against the expected branch. Extract only new supported narrative facts afterward. A later extraction failure must not erase a completed mechanical receipt.
6. On stop/error, keep a resumable preparation or discard the transaction according to explicit policy. Never double-charge on retry. Selecting another swipe projects that branch's effects, rather than accumulating both.

Several dependent intentions in one message are handled as a small action plan. Resolve the next step only when its prerequisite is met and the player authorized it. "If the window is open, send the familiar inside" does not require a second user confirmation. Discovering an unexpected person inside does not authorize choosing the player's next attack. Stop at a meaningful new decision, not after an arbitrary fixed number of combat turns.

Lumiverse's native inline tools can later use exactly the same operation handler and action IDs for models that support tool use. Both paths must enforce the same semantics. Only one path owns a given action, so the interceptor and narrator tool call cannot both execute it. No external MCP transport is required for default play.

Do not repair missing combat receipts by rolling after the prose has already promised victory. Distinguish harmless bookkeeping omissions from a contradiction with an authoritative result. Preserve the recorded result, issue one local correction/notice where needed, and avoid silently rewriting history. A bounded contradiction check can share the existing extraction pass; the same model reviewing its work is not a correctness guarantee.

## Model cost and caching

Reuse the current persisted chronological prompt snapshots. Committed old snapshots remain byte-stable. New turns append relevant mechanical changes and the new receipt. Compiled ability definitions are versioned; a definition edit produces a new version and affects future actions, not old prompt blocks or saved outcomes.

Keep model instructions/tool schemas stable. Inspecting a saved ability or inventory should normally be a local lookup. Batch first-use preparation with the necessary action interpretation; batch bookkeeping with extraction. Do not add one model call per effect, resource, combatant or system. The default remains roughly one bounded interpretation before a consequential reply and one extraction after it; occasional genuinely new content may need a separately bounded preparation, with measured latency and clear failure behavior.

If a critical preparation times out, ordinary chat remains usable but that mechanical action is visibly unresolved. Do not silently report a fair rolled outcome, assume zero costs or commit partial rewards. Preserve deterministic state and allow a retry.

## Implementation sequence and acceptance gates

| Stage | Deliverable | Must prove before expanding |
| --- | --- | --- |
| 1. Causal state and transactions | Stable entities, counted items, resource/condition state, prepared/committed receipts and dependency links in default play. | Repeated actions/corrections/swipes cannot duplicate spending or rewards; an actual condition changes later eligibility or odds. |
| 2. First-use definitions | Source reader, bounded ability/item compiler, definition cache and read-only inline inspector. | A fresh card works without setup; the same ability retains its cost/effect; explicit lore beats generated defaults; ambiguous content stays unresolved locally. |
| 3. Interacting encounters | Shared effects, range bands, reactions, equipment, companions and resource links, plus meaningful growth. | Ordinary-language tactics produce different outcomes; defenses and combinations follow fixed ordering; loops terminate; power differences remain credible. |
| 4. Persistent activities | Exploration graph, discovery, remaining resources, linked promises and once-only rewards; relationships use witnessed causal events. | Returning to a place preserves changes; a multi-condition promise cannot pay early or twice; information does not teleport between NPCs. |
| 5. Specialized depth | Maps, patrons/audiences, advanced equipment, source-backed survival, detailed builds and optional native narrator tools. | Each system introduces itself through relevant play, without a new setup checklist or repeated UI explanation. |

Stage boundaries are engineering order, not five selectable player modes. Do not ship every rulebook's independent engine or create eight hidden presets and infer the closest one.

Reuse existing Warp components selectively: dice and seeds, expression parser where a safe engine-owned formula is useful, state/event concepts, item requirements, growth anti-grind work, branch metadata, cancellation and caching. The old resolve path is tightly coupled to authored Ruleset, d20 checks, template stats and momentum contests. Calling it with an AI-generated YAML file would restore the architecture the user rejected. Extract pure tested primitives, not the old onboarding or global rulebook dependency.

Playtest both users: someone who never inspects a sheet, and someone who examines every mechanic. Include a quiet romance card, an existing high-power character, a fantasy companion encounter, modern equipment, a long existing chat, and an unfamiliar source power. Measure time to first meaningful action, forced setup interactions, consistency of costs, corrections per session, model latency, prompt stability, tactical alternatives and desire to continue. Passing schema tests is not evidence that a game is fun.

## Current status

Warp currently provides sourced memory, ownership transfer, simple contested outcomes, saved rolls, inline presentation and cache-preserving observations. It does not implement the full mechanical core described here. This revision is the implementation target; the installed extension is unchanged by this design document.
