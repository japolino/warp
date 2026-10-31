# Warp

Keep roleplaying. Warp remembers consequential events and gives the people in your story reasons to respond to what you do.

Open a chat after installing the extension. Warp reads the current scene automatically. There is no ruleset to build or preset to pick. Existing chats use this play loop too; their old rulebooks and recorded outcomes are preserved.

A small strip beside the latest reply shows the place, people present, and a couple of immediately relevant reminders. Keep using the ordinary composer. Request **Ideas** when you want suggestions; edit one before sending it. Open **Remembered** to inspect the events and quotes Warp is using. **Correct** records a visible out-of-character correction. **Pause** and **Resume** are in the same strip.

People can remember an agreement, disagree with your plan, or pursue something of their own. Established preparation, possessions, knowledge and abilities are included when a consequential attempt is judged. Routine conversation needs no roll. A risky contested attempt has one recorded outcome that survives swipes. Consequences become facts only after the story actually establishes them.

Warp uses the chat's connection, including a pinned connection, unless you select a helper in the inline Settings control. Reading a scene uses an additional model call. Some risky actions use a bounded call before narration. Failed scene reads offer Retry while ordinary chat remains usable. If an attempt cannot be assessed, Warp reports that it continued without a roll.

This is a development build. Real-model play quality, production browser behavior and long-session repair are still under verification. [Build evidence](docs/BUILD_STATUS.md) records the remaining gates; [the design](docs/PLAY_DESIGN.md) defines the target experience.

The implementation is in `src/living/`. Existing rulebook functionality remains available for compatibility through the explicit `authoredRules` setting. It is off by default. [Authored rulebook documentation](docs/AUTHORED_RULESETS.md) describes that engine. Existing books and old records are not deleted or converted into invented motives.

Develop with Bun:

```sh
bun install --frozen-lockfile
bun run verify
bun run build
bun scripts/host-smoke.ts D:/Lumiverse
bun scripts/frontend-host-smoke.ts D:/Lumiverse
bun scripts/living-bench.ts
```

The host smoke check runs the built backend inside that checkout's sandboxed Spindle worker with disposable fixture data. It does not use your chats, credentials, or a live model. Unit and DOM tests cover ownership, sourced changes, prepared outcomes, cancellation, stale responses, editable suggestions and host message replacement.

[Live-model observations](docs/LIVE_PLAYTEST.md) describe the separate synthetic model checks and their limitations. [Local deployment and rollback](docs/LOCAL_DEPLOYMENT.md) describe the reversible development update.

Warp publishes established scene information through `warp-state-v1` for integrations. Automatic illustration is not required for play.
