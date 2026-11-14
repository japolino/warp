# Aid before the first scene read

A player can ask an NPC for help immediately after opening a card. Waiting for Warp's first background read or opening a setup menu should not be necessary. The native aid path can now prepare the missing scene and capability from actual supplied sources during that reply.

## Behavior

When no story-sourced NPC scene has been recorded, a direct self-aid request can publish a `needsScene` invitation. A profile alone does not prove presence, range, injury or willingness. The helper must recover those facts from actual story messages or explicit OOC corrections, preserve other present people and the selected NPC's constraints, and prepare one supported beneficial capability. Recorded absence remains absence. An ordinary player request does not supply a completed event.

The narrator still chooses whether the NPC helps. Free requested aid needs no second acceptance. Existing prices, work and other restrictions keep their ordinary offer-and-acceptance flow. An additional conservative English source check prevents an omitted quoted fee or prerequisite from becoming free aid on this or a later request. This check is a bounded heuristic, not a general semantic guarantee.

Natural addresses such as "Hey Jo, could you treat my arm?" can select Jo while another NPC remains present. OOC labels, action clauses, informational questions and ambiguous recipients retain their existing interpretation. Recognition remains conservative and English-oriented.

`npc_aid` now takes only `actor` and `ability`. A real test showed the narrator mistyping a turn UUID. Code now binds the call to the authenticated user's current invitation and the exact saved Warp block in the host-supplied context. Stale, altered, foreign or revoked contexts still fail. An optional legacy token cannot override this binding. The internal token remains in the current chronological message, and the schema remains static across ordinary turns.

## Preparation and saved state

First-use preparation has one absolute budget of at most twelve seconds, also bounded by the host tool deadline. One structurally incomplete definition may receive one schema repair within that same budget. An intentionally empty unsupported definition is not retried. Repair can fill missing fields but cannot change supplied ownership, name, approach, targets, range, cooldown, costs, effects, requirements or unsupported terms. Missing facts never receive silent mechanical defaults.

Validated original scene observations survive a structural repair. Definition citations normalize whitespace so an actual multi-line profile quote can bind to its source. Words and punctuation must still match, and ambiguous or absent citations fail. Raw model responses and historical readers remain unchanged.

Preparation saves sourced knowledge before action validation. Only a ready receipt permits narration of the mechanical effect. A successful reply commits once; stops, stale branches and failed preparation do not spend anything. A failed extraction cannot erase a completed receipt. Existing resolver versions remain unchanged.

## Evidence

931 tests pass with 22,000 assertions across 106 files. TypeScript, the production build and nine worker modes pass: native warm/cold, paid/unpriced aid, barter, agreement recall, agreement compilation/local collection and rendered story sources.

The deterministic suite covers cold preparation, cancellation of a stalled initial read, profiles that cannot supply scene facts, multiple present actors, explicit addresses, quoted terms, special injuries, single structural repair and rejection of altered repair terms. The production worker check supports `--cold`, holding the initial background transport until Warp cancels it, then checking native RPC, duplicate reservation, commit and reload. This is controlled scheduling evidence, not a measured real-provider cold-read delay.

Two original cards were tested with real configured models through the Lumiverse worker, using private isolated histories. The narrator was `gemini-4-hydrogen`; the helper was `gemini-3.8-flash`. Profiles and greetings were unchanged. Controlled OOC premises established an adult patient's small injury and current distance, without supplying an ability, numeric health, price or inventory. These runs did not use the live chat's writing preset and activated lore.

On the medical/romance card, one tool call prepared and committed source-backed ongoing Medical Care. The burn remained alongside the care effect; this was not an instant cure. Replay matched exactly. The sequence took 22.8 seconds including the controlled 3.5-second initial-read cancellation and post-reply extraction. Earlier failures exposed the UUID-copy and incomplete-schema problems. They remain in private evidence.

On the fantasy healer card, original chains and other scene facts remained intact. One run exposed rejection of a genuine line-wrapped source quote, which the citation fix addresses. A subsequent real run returned no supported definition. It committed no aid, retained the injury and replayed exactly, but it does not count as successful aid gameplay or evidence of voluntary NPC refusal. Capability preparation and narrator handling of unresolved mechanics still need work.

Private profiles, replies and failures remain outside Git. Full live-app preset/lore checks, broader cards, other providers, long-session consistency and whether players want to continue remain open. This checkpoint adds no setup screens or rulebook authoring.
