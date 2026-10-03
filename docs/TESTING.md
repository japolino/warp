# Testing Warp offline

Every test runs without Lumiverse, a model connection or an API key. The backend tests use a fake Spindle host
(`src/backend/test-host.ts`) and scripted model replies; the engine tests run the engine directly.

From the repository root:

```bash
bun install --frozen-lockfile
bun run verify   # all tests + typecheck
bun run build    # dist/backend.js, dist/frontend.js
```

## What proves the quality bar

| Claim | Where it is checked |
|---|---|
| Both templates load with no errors and no warnings, and pass every loop-simulator gate | `src/engine/templates/templates.test.ts` |
| The loop simulator's gates: the clock never drifts (time: effects included), the scene holds, shown odds = real odds, at most 1 in 3 typed messages roll in a dialogue-heavy chat, every failure has a direction, choice odds spread by their words, no tag dominates, "always kind" ≤ 1.5× a mixed player, contests last 3–6 rounds and the story can't end them | `src/engine/loop-sim.test.ts` |
| The shown % is the real %; every tier carries a direction; old check styles are refused | `src/engine/checks.test.ts` |
| Band crossings give a line in the same reply; voices; big moments; taper | `src/engine/people.test.ts` |
| Contests: length, nobody ends them early, every round is in the chat | `src/engine/contest.test.ts` |
| Calls per turn for Story / Adventure × Helper / Jev × typed / clicked / contest | `src/backend/pipeline.test.ts` |
| Quoted dialogue is never read or rolled; question limits and safe defaults | `src/backend/questions.test.ts` |
| The one-pass builder: one card-read call (Jev classifies when set, with a helper fallback), the themed template, repair, preview, Refine, install | `src/backend/builder.test.ts`, `src/backend/card-read.test.ts` |
| Saved builder drafts from older versions reopen without losing their sections | `src/backend/builder-recovery.test.ts` |
| Installing a ruleset never breaks the running game, even when a write fails half way | `src/backend/rulebook-install.test.ts` |
| Old saved settings and old chats still load | `src/backend/settings.test.ts`, `src/engine/format.test.ts` |
| The format reference teaches every key the engine reads and no removed system; its example loads cleanly | `src/engine/reference.test.ts` |
| A Jev setup that can't work falls back to the helper, so play goes on | `src/backend/classifier-config.test.ts`, `src/backend/transaction.test.ts` |
| The panel, the reply line, settings and `warp-state-v1` render from hand-built states | `src/frontend/*.test.ts` |

`bun scripts/replay-bench.ts` measures how long folding a long chat takes (full snapshots, the panel's 60, state only).

## Limits

These are offline engine and scripted-host checks. They do not measure live model accuracy, real latency, browser
layout or whether players enjoy it. A manual pass in a disposable Lumiverse instance is still needed before a release.
