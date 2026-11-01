# Native decision profiles

Warp's inline Settings now lists Lumiverse decision connection profiles separately from text helper connections. Select a saved profile, such as JEV, to assess consequential contested attempts. The default remains the helper when no profile is selected. Text extraction and Ideas continue through the helper connection.

The extension requests Lumiverse's `decisions` permission. Credentials stay in Lumiverse's profile storage. Profile listing and evaluation are scoped to the acting user. On hosts without the API, or when a selected profile is unavailable, denied, malformed or exceeds its bounded request, the attempt read falls back to the text helper within the interceptor deadline. If neither read succeeds, the existing visible no-roll fallback applies.

The classifier chooses whether uncertainty is warranted, the difficulty tier and a supported category of foreseeable cost. It does not choose the outcome or supply its success probability. Warp's seeded resolver selects clean / mixed / setback using favorable 60/30/10, uncertain 30/45/25 or outmatched 10/35/55. The saved attempt is reused across swipes. Classification and narration can still be biased; an independent outcome does not establish perfect semantic fairness.

Verified on 2026-11-01:

- The existing full suite passed 500 tests before adding the new decision tests; the 13 targeted runtime and decision tests then passed, including native routing, helper fallback, malformed results, cancellation, repeatable rolls and all three possible outcomes. Typecheck and production build pass.
- The running extension manager reports 9/9 permissions enabled after Restart. The real browser shows 12px vertical / 18px horizontal scene padding and the existing JEV profile in the new selector. That profile was selected through the UI.
- A live synthetic request through Lumiverse's decision service and the existing JEV profile classified an unarmed attempt to wrestle a spear from a trained resisting guard as contested, outmatched and risking injury. No private roleplay was used for that test.
- The local installed manifest and bundles were replaced after backing up the previous files to `.artifacts/before-native-decisions-1793545023180`. The worker was restarted and frontend refreshed through the normal app workflow.
