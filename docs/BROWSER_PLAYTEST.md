# Browser playtest, 2026-11-01

Verified in the user's running Lumiverse at localhost:7860 using the connected Brave browser. This complements the isolated host smoke checks. It is not a human enjoyment study.

Warp was disabled at the start. Enabling it through Lumiverse's extension manager loaded the locally deployed `0.3.0-dev` manifest and worker. Existing permissions remained 8/8. No other extension was enabled or disabled. The existing Fanfic Skins presentation remained active.

Tests used Lumiverse's disposable Temporary Chat with the existing Vertex connection, without a preset. No messages were added to an existing roleplay. The synthetic scene established adult Sam, Jo's cafe, a request to cover the counter, and Sam's jacket.

Observed through the actual rendered UI and frontend bridge:

- The scene strip appeared below the latest reply, inherited the current skin, and remained readable beside the normal composer. No Warp drawer or floating widget appeared.
- The initial read recorded Jo's request as an unresolved situation, not Sam's accepted commitment. The jacket remained with Sam, with the player's exact source quote visible under Remembered.
- Pause replaced the strip with an inline Resume button. Resume restored the scene. The enabled state was restored before continuing.
- Inline Settings exposed the existing connection list and the additional-call explanation. The helper selection was inspected but left unchanged.
- The first Ideas request failed within its bounded call and displayed its fallback. A second request returned three grounded alternatives, including covering the counter, setting a boundary about the espresso machine, and offering to carry the delivery instead. These alternatives did not alter the world merely by appearing.
- Correct opened an editable text field. Saving a blue-jacket correction appended a visible OOC correction without a narrator generation. Remembered then contained one updated blue jacket with the correction as evidence.
- A normal typed agreement caused the narrator to let Jo leave and use the corrected blue jacket. The next committed state removed Jo from the present cast, recorded the player's explicit five-minute promise, and retained the jacket with the player.
- Editing that narrator reply through Lumiverse's normal editor to say Jo stayed and released the player from covering rebuilt the scene. Jo returned to the present cast; the obsolete departure, held-key description, and active counter reminder disappeared. The revised keys and closed bakery had quotes from the edited reply.
- Reloading the browser restored the corrected scene and inline controls from saved state.
- Generated a second swipe through Lumiverse's regeneration feedback shortcut, then selected it. Its completed scene read showed Jo absent and the counter promise active. Returning to the first swipe restored Jo as present with no counter reminder. Consequences did not accumulate across the alternatives. A background-swipe read first showed Retry; selecting the new swipe completed a fresh read and cleared it.

The rendered promise reminder appeared twice because it was both an active reminder and a change note. The frontend now omits change notes already displayed as reminders. The seven existing inline UI tests and production build passed after that adjustment, and the updated frontend was deployed and refreshed in the browser.

Other installed extensions showed an asset-generation failure and voice-analysis status during the session. These were not Warp controls and were left unchanged. No image or speech generation was required for Warp's checks.

Still outside this evidence: arbitrary unmodified cards, broad prompt compatibility, long-session correction rates, mobile browser layout, and whether people want to keep playing. Real model latency remains variable; a failed Ideas request followed by a successful retry is a limitation, not an unconditional success claim.
