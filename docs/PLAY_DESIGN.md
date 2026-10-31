# Warp play design

Design specification, 2026-10-31. Implementation is on `codex/warp-living-play`. This document defines the intended end state; implementation and verification must be checked against it before release.

Warp makes an ongoing roleplay into a world the player can act on. People want things, opportunities change, and the particulars of the player's actions have lasting consequences. A new user installs Warp, opens a chat, and plays through the normal composer. No rulebook, template, genre selector, character sheet, or drawer visit is required.

1. The product must earn its presence during play.

   A player should notice that someone remembers a promise, a prepared distraction works, a person pursues a plan, or a missed opportunity changes what is possible. They should not have to appreciate Warp's tracking to enjoy its results.

   The target pleasure is anticipation: understanding enough about a situation to form an intention, trying something personal, then wanting to discover how others respond. Expressive dialogue, discovery, affection, humor, and quiet companionship remain valid play. Challenges must suit the ongoing fiction. Warp must not turn every conversation into a crisis or require an objective to justify an ordinary scene.

   Every added rule must change a meaningful decision or preserve its consequence. A rule that only creates maintenance work does not belong in the default product.

   Progress means gaining specific possibilities: someone offers access to their workshop, the player learns a reliable technique, a solved problem changes a place, or a relationship permits a kind of honesty that was previously unwelcome. Demonstrated ability and established access persist and affect future attempts. Do not substitute a new flattering description for an actual change in what the player can do.

2. Installation leads directly to the existing chat.

   Warp uses the chat's configured model connection by default. It does not silently select a different provider or require a second API key. A helper connection may be configured later through the host's extension settings. Model work has a small, explicit budget, and the settings explain that Warp uses additional calls through the existing connection.

   On first activation, read the card, persona, relevant available lore, and current scene. Establish only supported facts. Missing time stays unspecified; missing money stays unspecified. Do not invent a calendar, wallet, cast, personality, or campaign premise to fill a schema.

   For an existing long chat, start with the current scene and available established context. Do not claim to have reconstructed the entire history. Older information is incorporated when it becomes available or relevant. Initial preparation runs without a wizard or blocking chat. Until it finishes, normal RP continues.

   State belongs to the chat and its active branch. The card and lorebooks remain author inputs; Warp does not write generated YAML into them. There is one behavior, with no Story/Adventure or genre presets. Different behavior follows evidence in the fiction, rather than assigning a hidden preset.

3. The visible interface stays inside the conversation.

   The normal composer is the complete control scheme. Dialogue, emotes, attempts, plans, and ordinary out-of-character instructions work without commands.

   A compact, two-line scene strip appears beside the latest reply when useful. It can show the established place and people present, followed by at most two immediately relevant reminders. Examples: "Jo's café · Jo, Dex" and "Closing soon · You promised to cover the counter."

   Do not show empty fields, invented precision, health or affection bars, inventories of irrelevant possessions, or a permanent task list. A quiet scene may have only the first line. Completed reminders disappear without a celebration screen.

   A small Ideas control requests up to three specific possibilities. Suggestions are off the screen until requested. Choosing one sends the displayed text and uses exactly the same interpretation path as typing it. Suggestions do not have special action tags, bonuses, or privileged access to mechanics. The player can edit the text or ignore all suggestions.

   Show one short consequence note only when a consequential fact changes: "Jo is covering for you", "The spare key is gone", or "You owe Dex an explanation." These statements must report committed events, not speculative evaluations. Clicking a note exposes its source and a local correction. Corrections can also be given naturally in chat.

   The extension's small menu provides Pause, a compact recap, and Settings. It is not a play surface. There is no required drawer. Recaps are on demand, draw on recorded evidence, and may say that something is unknown. Settings cover enabled state, model connection, suggestion visibility if later demanded by testing, and inherited content preferences. No system selection or tuning sliders in the first release.

4. Each turn changes the situation when the fiction calls for it.

   The player expresses an intention. Warp identifies the target, method, relevant facts, and likely stakes. It determines what is already settled, what another character can decide, and what genuinely requires an uncertain outcome. The narrator then writes the resulting scene, using the chat's normal voice and connection. A bounded extraction pass records new supported facts.

   Routine actions simply happen when possible. Examining something can reveal available information without a perception roll. A sincere line of dialogue is not rolled for warmth or attraction. A character's refusal can follow a motive or commitment without needing a random failure.

   Resolve consequential uncertainty at the scale of the player's intention. Getting Dex out of the café may be one attempt, followed by an interesting complication. It must not automatically become six rounds of a generic conflict gauge. Several exchanges remain appropriate when the situation actually changes between them.

   Success gives the intended result within established limits. A mixed result gives the result with a concrete cost, exposure, compromise, or obligation. A setback changes the situation and leaves another approach possible. Costs must follow the circumstances. No universal stress penalty, fatigue charge, or relationship deduction.

   Preparations, evidence, witnesses, leverage, ability already demonstrated, and environment must affect resolution. Extra adjectives and longer messages are not advantages. A safe, supported plan can remove the need for a roll entirely. Impossible actions are explained through the fiction and available alternatives, without fake odds.

   Where a roll is needed, use one seeded outcome and save it with its evidence. For the initial prototype, the internal distributions for clean result / mixed result / setback are favorable 60/30/10, uncertain 30/45/25, and outmatched 10/35/55. These are provisional design constants, not calibrated real-world probabilities. Assign the tier from cited circumstances. The UI uses plain language; details are available in the local explanation. Classification confidence is never interpreted as a character's success chance.

   Before an action with a severe foreseeable cost, the narration or requested suggestions should make the relevant danger legible. An unexpected setback should be an interpretable development, not an unrelated punishment. Do not turn an ambiguous gesture into a binding promise or dangerous attempt. If the player clearly intended a high-stakes attempt, resolve it without a confirmation modal.

5. People have reasons to act that survive individual replies.

   For relevant characters, maintain their established characterization, immediate desire, a constraint or concern, relevant knowledge, and unresolved interactions. Keep these small and update them from evidence. A tentative interpretation remains tentative and must not become a retroactive biographical fact.

   Relationships are histories and expectations. Someone may enjoy the player's company while refusing a request, trust their honesty while doubting their competence, or forgive a betrayal while retaining a boundary. No universal affection score, relationship ladder, topic reward, conversation combo, or fixed per-reply growth cap drives those responses.

   Remember concrete interpersonal facts: the player kept a confidence, missed an agreed meeting, knows the character's fear, or took a risk for them. Such facts matter in contexts where they are relevant. They are not permanent modifiers to every future interaction.

   Characters can ask, offer, disagree, initiate a pleasant interaction, or take a step toward their own goals. Their initiative must fit their motives, knowledge, physical opportunity, and the current tone. They do not exist to deliver quests. The player's feelings, words, intentions, and consent are never assigned by Warp.

6. Keep a few situations developing, with causes and opportunities to respond.

   Track at most three active situations in the current narrative focus, with at most one new unsolicited development in a reply. These are ceilings, not quotas. Do not generate trouble just because a slot is empty. Resolved situations can remain as history without being immediately replaced.

   A situation records who wants something, what is changing, what would move it forward, and how the player can encounter its signs. It may be an invitation, an unresolved disagreement, an approaching visitor, a business problem, or a discovery. New material must be compatible with the card and the player's expressed direction.

   Advance situations when supported time passes, someone has an opportunity to act, or an event changes their options. Typing more dialogue is not an automatic countdown. Pausing the real-world application does not advance the world. Skipping to tomorrow can advance relevant plans, but does not fabricate agreement to duties.

   Introduce proportionate signs before major preventable consequences. Allow intervention, avoidance, negotiation, and choosing not to help. Do not move deadlines or invent another obstacle merely because the player has solved a problem. Let successful preparations work and let scenes end.

   Persistent player obligations require an explicit agreement or an established premise. Never infer a debt from an ordinary favor or turn every interaction into an item on a checklist.

7. Generative freedom has persistent facts underneath it.

   Use one compact internal representation: entities, attributed facts, possessions where consequential, knowledge and beliefs, commitments, active situations, and dated or ordered events. Every committed change records its source and relevant branch. Model suggestions and speculative readings are stored separately from facts.

   The model proposes actions and changes through a bounded set of operations: establish a fact, move an entity, transfer an existing item, make or fulfill an agreement, change access, reveal information to someone, and advance or resolve a situation. It does not generate executable rules or arbitrary formulas.

   Code validates references, item ownership, branch identity, allowed operation shapes, duplicate events, and applicable mechanical constraints. Semantic checks can reject obvious contradictions but cannot prove all generated fiction correct. Give unsupported proposals less authority, preserve uncertainty, and provide quick corrections rather than claiming perfect adjudication.

   A novel player plan can combine these operations. Forging an invitation changes an object's claimed meaning; showing it changes someone's information; admitting the deception changes what that person knows about the player. There is no need for a predefined "forge invitation" button, but the particular claim, audience, and evidence must be retained.

   A hidden fact generated by Warp is fixed when introduced into the private world state, before the player investigates it. It cannot change to evade a good solution. Do not claim existing card secrets are isolated from a narrator that already receives that card. Strong secret isolation requires verified host support for filtering the relevant input, and is not a first-release promise.

8. Technical flow should support play without depending on a swarm of calls.

   Bootstrap once. On a consequential attempt, use a short pre-reply interpretation only when necessary to settle stakes or an uncertain result. On routine dialogue, reuse committed context and skip that read. After a reply, batch extraction, situation updates, and any explicitly requested suggestions into one bounded helper pass. The next turn consumes committed state.

   Small classifiers and embeddings are optional later optimizations. The default must work with the existing chat connection. Use exact state lookup for identities, ownership, agreements, and established knowledge; retrieval supplements that state for older narrative details.

   Pass a short relevant state packet to the narrator: important facts, character intentions and constraints, any resolved outcome, and at most one warranted development. Keep unrelated history out. The narrator retains the user's writing style and chat configuration.

   Separate preparation, resolution, narration, and commitment. A failed narration must not spend an item or advance a situation invisibly. Save prepared outcomes so retries do not reroll them accidentally. Swipes follow the host's active branch and never accumulate consequences across alternatives.

   Editing or deleting an earlier message invalidates dependent interpretations. Rebuild affected records from the active text and surviving evidence; do not reroll old recorded outcomes as a side effect of opening a chat. If downstream text conflicts, hold the disputed fact as uncertain and offer a local correction. Do not block the entire conversation behind a provenance-reconciliation screen.

   Stop, model failures, and timeouts must leave the ordinary chat usable. Drop stale proposals, keep the last valid committed state, and show one unobtrusive retry indication if needed. Failed extraction does not authorize new unseen world events. Production latency and provider behavior must be measured in the host; engine tests cannot establish them.

9. The initial release deliberately has a small scope.

   Keep useful implementation infrastructure: seeded randomness, event recording, branch handling, cancellation, prompt integration, host transport, and correction UI. Reuse components after checking that their existing contracts fit this design.

   Replace the rulebook requirement, automatic template installation, builder-led onboarding, relationship-value model, tag-priced choices, and universal momentum contests. Move old rulebook authoring and engines out of the default runtime. Do not present a new product as a cosmetic change to the old templates.

   No default stat sheet, XP, needs maintenance, equipment slots, shopping catalogue, authored action menu, dungeons, arcade, schedule editor, maps, automatic images, or campaign-generation wizard. Relevant injuries, possessions, prices, and time still exist as facts when established by the story.

   Keep the existing state event for Cue and LumiDoll where the facts are actually known. Native UI should use clear typography and restrained icons. Optional illustration integrations can follow real scene changes later; generated art must not be required for the play loop.

   Existing chats and rulebooks remain recoverable. Do not silently reinterpret old numeric values as new motives or erase their records. Development uses a new branch. Before replacement release, retain a versioned legacy installation path and export existing Warp state. The new system can begin from the latest established fiction without requiring the player to map old mechanics manually. Compatibility work is bounded and must not keep the old systems in the new default UI.

10. Build and test the intended pleasure before broadening the extension.

    First, use one private test fixture based on the existing café, Jo, and Dex material. This is a development test, never a user-selected preset. Establish a small set of motives and connected facts. Play it with a human facilitator or scripted prototype to find out whether the choices remain interesting without numbers, a drawer, or minigames. This validates a scenario and interaction hypothesis, not the whole product.

    Second, implement automatic scene initialization, the compact strip, sourced facts, and local corrections. The gate is a first-time player completing a short session without setup help or opening extension settings. Do not stop here: this milestone alone would recreate a tracker.

    Third, implement consequential attempts, persistent social expectations, and bounded character initiative. Give the player genuinely different ways to address the same problem. Test a quiet conversation, an improvised solution, a refusal, a successful preparation, an accepted promise, and declining involvement. Progress only if the system respects those differences across subsequent scenes.

    Fourth, try unmodified cards with very different premises: a single-character relationship, a social setting, and an adventure. No hand-written rules, hidden per-card patches, or prescribed genre selection. Record failure cases separately from fixture success. If general behavior fails, narrow unsupported inference rather than adding another configuration wizard.

    Fifth, harden host lifecycle, edits, swipes, reconnects, timeout handling, prompt compatibility, and long conversations. Measure added latency and calls per turn. Keep only calls whose demonstrated contribution justifies their cost and delay.

    Automated checks must prove ownership conservation, no duplicate commitments or transfers, motive and knowledge provenance, no event accumulation across swipes, causal preparation affecting resolution, no unsupported deadline advancement, and safe fallback on failed calls. Snapshot or schema validity alone is insufficient.

    Human sessions must test whether players can explain the stakes, attempt something unsuggested, see that method change later possibilities, understand setbacks, and want another turn. Record correction frequency, avoidable interruptions, abandoned attempts, desire to disable Warp, and actual return to play. Include the author and new users. No simulated greedy-policy score is called a fun score.

    The release gate is repeatable enjoyable play without setup, across several unmodified cards, plus trustworthy event handling in the real host. The main unresolved risk is consistent semantic adjudication under arbitrary cards and prompts. A larger collection of mechanics will not resolve that risk.

11. The representative interaction must demonstrate the design.

    Existing fiction establishes that Jo needs cover at the café and Dex wants to leave unseen. The scene strip says "Jo's café · Jo, Dex" and "Closing soon." The narrator shows Dex watching someone outside and Jo expecting the player to stay. Neither request has become an accepted obligation yet.

    The player types: "I ask Jo to send me out with the rubbish, then lend Dex my jacket and take him through the back."

    Warp recognizes a proposed cover story, a transfer of an owned jacket, another person's cooperation, an established or uncertain exit, and possible observation. It uses available facts instead of treating the sentence as a generic clever move. It must not invent a convenient back exit if the scene established there is none.

    Jo may cooperate if the request fits what she knows and wants; the player does not control her by declaring her cooperation. If she agrees and the plan is sufficiently supported, it works. If observation remains uncertain, settle that once. A fitting mixed result could be getting Dex clear while the observer sees the player's distinctive jacket. That consequence is available only if someone could actually observe it.

    Later, the jacket, Jo's choice to cover, and the observer's knowledge remain consequential. Jo might ask for the truth privately. Dex might return the jacket with an invitation or new information. The development can be pleasant, difficult, or both. It grows from this player's solution.

    The desired player response is "I want to find out what Jo says when we are alone." If the response is "I need to open Warp and repair three fields," the design has failed its central test.
