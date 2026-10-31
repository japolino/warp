# Build evidence

The goal remains active. This file records implemented behavior and outstanding verification; it is not a completion claim.

The default now uses the living-play runtime for existing and new chats. The old rulebook engine remains behind an explicit `authoredRules` compatibility setting. Existing books, old turn records, and unrelated message metadata are preserved. No template install or generated YAML is required.

Implemented in `src/living/`:

- Quoted evidence for committed facts, knowledge, agreements, possessions, abilities, tentative motives, and up to three developing situations.
- Ownership transfers with existing-holder checks; interpretation confidence is separate from outcome probabilities.
- Seeded attempt outcomes prepared on the player's message and reused across swipes. Routine dialogue skips the attempt read. Preparations and circumstances are included in interpretation.
- A narrator packet preserving the current style, character interests and knowledge, proportionate consequences, quiet scenes, successful solutions, and the player's control of their actions and feelings.
- Extraction after narration with shared metadata serialization, cancellation ownership, late-response rejection, content and path checks, and an explicit retry state.
- A compact inline scene, optional editable Ideas, sourced remembered events, corrections, Pause and Resume. No default numeric sheet, relationship ladder, or conflict gauge.
- Invalid records are excluded after edits and swipe changes. The next scene read reconstructs supported facts from current prose. This does not yet guarantee complete reconstruction of old facts outside the bounded text window.
- Existing connection pin support and optional helper connection. Cancellation and interceptor deadlines bound pre-reply work.

Evidence gathered:

- `bun run typecheck` passes.
- `bun run build` produces both production bundles.
- The full offline suite passes, including dedicated world, runtime, and DOM UI tests. Check the latest command output for the exact count.
- `bun scripts/host-smoke.ts D:\Lumiverse` loads the built backend in that checkout's actual sandboxed Spindle worker, opens a synthetic unconfigured chat, and commits a sourced possession. Host data and model responses in this smoke test are fixtures, not a live account or live model.
- The DOM test fixture now matches the host's injection-wrapper contract, discovered by inspecting `frontend/src/lib/spindle/dom-helper.ts`. Tests cover optional editable suggestions, stale suggestions, escaping, inline resume, and host message replacement.
- A development package is staged at `D:\Lumiverse\.artifacts\warp-living-play-20261031-195523.zip`. This is a built artifact, not an installed or published release. Old installed files have not been replaced.

Still required before declaring the project finished:

- Production browser rendering and interactions in the running Lumiverse, including scoped styling and the actual frontend bridge. Computer Use currently reports both browser access and native pipe unavailable. An HTTP response from port 7860 does not prove browser behavior.
- Real model play with several unmodified cards, including quiet dialogue, refusal, preparation, an improvised solution, a remembered promise, a correction, and declining involvement.
- Observe whether the narrator honors outcomes and whether extraction preserves their actual meaning. Quote validation proves that text exists; it cannot prove that an arbitrary semantic interpretation is correct.
- Measure real added latency, call costs, and long-session correction frequency.
- Improve and verify repair after deep history changes, and verify chat forks and deleted swipe reindexing against the live host.
- Complete install/update packaging, rollback instructions, and the user documentation. The working implementation has not replaced the installed extension or been published.
- Playtest the intended pleasure. Automated checks of state handling cannot establish that people want another turn.

The user's `D:\Lumiverse\warp` checkout contains older code and a local skill edit. The running installation is separately under `D:\Lumiverse\data\extensions\warp\repo`. Neither is overwritten by this work. The implementation branch is `codex/warp-living-play` in `C:\Users\eme4\warp-core`.
