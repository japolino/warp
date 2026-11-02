# Build evidence

This file records implemented behavior and outstanding verification; it is not a completion claim.

The 2026-11-02 systems expansion is tracked in [SYSTEMS_PROGRESS.md](SYSTEMS_PROGRESS.md). Its transaction, ability-definition, initial encounter and bounded NPC-exchange checkpoints are implemented on the branch but have not replaced the running local animated-dice build. The evidence below describes the earlier living-play baseline; the progress file records current checks and the full remaining scope.

The default now uses the living-play runtime for existing and new chats. The old rulebook engine remains behind an explicit `authoredRules` compatibility setting. Existing books, old turn records, and unrelated message metadata are preserved. No template install or generated YAML is required.

Implemented in `src/living/`:

- Quoted evidence for committed facts, knowledge, agreements, possessions, abilities, tentative motives, and up to three developing situations.
- Ownership transfers with existing-holder checks; interpretation confidence is separate from outcome probabilities.
- Seeded attempt outcomes prepared on the player's message and reused across swipes. Routine dialogue skips the attempt read. Preparations and circumstances are included in interpretation.
- A narrator packet preserving the current style, character interests and knowledge, proportionate consequences, quiet scenes, successful solutions, and the player's control of their actions and feelings.
- Extraction after narration with shared metadata serialization, cancellation ownership, late-response rejection, content and path checks, and an explicit retry state.
- A compact inline scene, optional editable Ideas, sourced remembered events, corrections, Pause and Resume. No default numeric sheet, relationship ladder, or conflict gauge.
- Facts carry a revision of their quoted source. Unrelated edits preserve still-supported facts; altered or deleted evidence is excluded. Old edited messages can be read in place rather than only through the latest scene window. Unique quotes can be rebound after a fork changes message ids. Ambiguous or semantically contradictory history still needs a correction.
- Existing connection pin support and optional helper connection. Cancellation and interceptor deadlines bound pre-reply work.

Evidence gathered:

- `bun run typecheck` passes.
- `bun run build` produces both production bundles.
- The latest full offline suite passes: 500 tests, including dedicated world, runtime, DOM UI, and local deployment/rollback checks.
- `bun scripts/host-smoke.ts D:\Lumiverse` loads the built backend in that checkout's actual sandboxed Spindle worker, opens a synthetic unconfigured chat, and commits a sourced possession. Host data and model responses in this smoke test are fixtures, not a live account or live model.
- The DOM test fixture now matches the host's injection-wrapper contract, discovered by inspecting `frontend/src/lib/spindle/dom-helper.ts`. Tests cover optional editable suggestions, stale suggestions, escaping, inline resume, and host message replacement.
- `bun scripts/frontend-host-smoke.ts D:\Lumiverse` passes against that checkout's real DOM helper with the production frontend. It verifies scoped owned roots and Ideas/edit interactions in an isolated DOM, not production browser pixels or sandbox transport.
- Fixed synthetic social, quiet, adventure, contested-action, correction and Ideas scenes have been exercised through the existing configured model connection. The tests exposed timeouts and stale reads that were corrected; timing, limitations and reproducing commands are in `docs/LIVE_PLAYTEST.md`.
- Default frontend startup no longer creates the compatibility drawer or floating widget. A dedicated startup test rejects any access to those panel APIs. Helper selection is inline.
- A local deploy/rollback script previews changes by default. Its backup, replacement, unrelated-file preservation and restoration behavior pass a disposable-directory test. It has deployed version `0.3.0-dev` to the installed extension directory. The extension has now been enabled through Lumiverse's normal manager, and its frontend refreshed in the actual browser.
- The actual browser session verifies the production frontend bridge, rendered inline controls under the user's existing skin, sourced memory, Pause/Resume, correction, agreement, message editing, and reload. See `docs/BROWSER_PLAYTEST.md` for observations and limits. A duplicate reminder found during that session was removed; the inline UI suite and production build pass after the fix.
- The previous installed `0.2.0` manifest and bundles are saved at `C:\Users\eme4\warp-core\.artifacts\warp-backup-1793489881232`. Development packages are also staged under `D:\Lumiverse\.artifacts\warp-living-play-*`. Nothing has been published.

Still required before declaring the project finished:

- Verify real user cards and presets beyond the fixed synthetic cases. The live samples show coherent behavior and one honored seeded setback; they do not establish general semantic accuracy.
- Measure broader real latency, usage and long-session correction frequency. Current samples show some slow or timed-out reads, now exposed through Retry or the no-roll notice.
- Verify forks and deleted swipe handling through the actual running app. Message editing, selecting alternate swipes, restoring the prior swipe, and reload have now passed through the production UI; offline branch coverage and the engine benchmark also pass.
- Playtest the intended pleasure. Automated checks of state handling cannot establish that people want another turn.

The user's `D:\Lumiverse\warp` checkout contains older code and a local skill edit and is untouched. The installation is separately under `D:\Lumiverse\data\extensions\warp\repo`; only its manifest and two production bundles were replaced. Its source and Git history are preserved. The implementation branch is `codex/warp-living-play` in `C:\Users\eme4\warp-core`.
