# Real-card acceptance playtest

The user explicitly requested testing their existing Lumiverse cards after the implementation work, across fantasy, romance, science fiction and other tones. This is a required completion gate. Synthetic scenes and passing engine tests do not replace it.

## Selection and isolation

Select a varied sample from the existing card library when the implementation reaches its acceptance pass. Include ordinary cards without numeric stats, an established high-power character, a companion scene, quiet romance, modern or science-fiction equipment, an unfamiliar power, and a less conventional setting. Include an existing long-history scenario through an isolated copy where the host supports that safely. Do not choose only cards that already resemble the test fixtures or require an authored Warp ruleset.

Create clearly identified disposable test chats or isolated branches. Preserve the user's ongoing stories, original cards, persona definitions, lorebooks and connection settings. Use the real installed extension and the normal Lumiverse generation path, with the actual card, relevant persona, activated lore and configured helper/decision/narrator profiles. A shortened synthetic card description or direct helper call alone is insufficient evidence for this gate.

Private card text, prompts and conversation excerpts remain local. Public commits can contain anonymized findings and general regressions, not copies of the user's cards or private stories. Do not publish test chats or send reports to other people.

## Sessions

Run enough turns to observe a consequence, return to it, and test an alternative. Start some sessions without opening Inspect, Ideas or Settings. In others, inspect the saved state to compare it with the scene. Use ordinary player language. Do not prepare a rulebook, add missing statistics, select a genre preset or manually initialize an inventory to make the card pass.

Cover the relevant choices naturally:

- A quiet or affectionate exchange can stay quiet. Character boundaries and independent interests persist without a compulsory crisis or relationship score.
- Established capability, preparation and equipment affect what is possible. A strong character does not become an ordinary person merely to produce a roll, and an unfamiliar power retains its source limitations.
- A consequential uncertain action produces a visible saved result that matches the narrated outcome. Ordinary interactions do not acquire unnecessary dice checks.
- A character remembers a promise or discovery, while someone absent remains uninformed until an actual disclosure. Returning to a place preserves its established changes.
- A sourced ability retains its cost and effect. A multi-part agreement does not complete or pay early, and an actual reward cannot pay twice.
- Declining, changing approach, stopping a scene, cancelling a generation, choosing another swipe and reloading do not trap the player, duplicate costs or silently replace recorded outcomes.

Do not discard an awkward card as soon as it fails. Record the failure and its source, distinguish a host/provider problem from an extension problem, fix reproducible extension faults, and rerun the relevant interaction. Keep unsupported source mechanics explicit rather than silently weakening the card to fit the engine.

## Evidence and judgment

For each session record the card's broad setting, relevant connection configuration, time to first meaningful action, required setup interactions, pre-reply and background latency, outcome/cost consistency, corrections, prompt-prefix stability, and meaningful alternatives. Inspect actual saved receipts and source links. Use provider cache telemetry when available; stable prompt bytes alone do not prove a cache hit.

Also assess the experience: whether the strip interrupts reading, whether a consequence creates an interesting next choice, whether an NPC can refuse without becoming arbitrarily obstructive, whether quiet scenes remain satisfying, and whether the next turn is inviting. Agent playtesting supplies observations, not proof of human enjoyment. Report unresolved friction honestly and leave the full goal active if this gate or another design requirement remains unverified.

## Status

Pending. The earlier synthetic model runs, captured-response regressions, sandbox worker checks and UI previews are documented in `LIVE_PLAYTEST.md` and `SYSTEMS_PROGRESS.md`. They do not establish that the user's real cards have passed.

An early pilot has now used one existing adult character card through the running app and its normal generation path, with the actual selected profiles and existing writing preset. It used a fresh memory-isolated chat; the original card and other stories were preserved. The player opened no Warp setup or inspector. Greeting extraction started automatically, a spoken promise was recorded, and an ordinary quiet approach produced no dice check or invented player scores. The pilot also exposed an unnecessary no-roll status line, now removed in source and covered by the existing UI regression.

The reply grew into a long chapter and supplied additional player actions/dialogue. The app's actual prompt preview confirmed that the existing narrator preset explicitly requests long chapters and authorizes player narration. Its scenario instructions also steer events. These observations cannot establish a neutral quiet-scene failure or success. The generation was stopped, and the separate test chat was labelled as a Warp pilot. The actual draft, prompt preview and saved metadata remain in local ignored artifacts; no private card, chat ID or transcript is committed here. Follow-up should use a suitable existing chat-scoped writing configuration for the quiet baseline, retain a comparison under the user's current writing mode, and continue the required fantasy/science-fiction/other-card sessions. The full acceptance gate remains open.
