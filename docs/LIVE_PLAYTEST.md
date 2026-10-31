# Live-model and host checks

These are development observations, not proof of player enjoyment or production browser behavior.

The checks use Lumiverse's existing account and configured model connection through its own generation service. Credentials remain inside that service. The prompts contain synthetic adult characters and scenes, with no private cards or conversation history. Calls incur normal model usage.

The checked scenes have ordinary character descriptions and no custom Warp rulebooks:

- Social: Jo asks for help at a café while Dex wants to borrow the player's jacket. After shortening the scene-read output, the player promise was recorded on the first turn. The jacket remained with the player while merely offered; the record did not claim a handoff that the narrator had not established.
- Quiet companionship: Mira repairs a book. The player declines discussion of family and later leaves. The model maintained a quiet scene, did not introduce a crisis, and made no random checks.
- Adventure: examining and preparing a rope changed the described crossing. This exercised preparation and continued consequences but did not prove uncertain-outcome adjudication.
- Contested action: an unarmed attempt to wrest a spear from an alert trained guard was classified as outmatched. Warp recorded a setback, and the narrator kept the weapon with the guard and described the failed attempt. The player then stopped fighting; this was not rolled as another combat round.
- Correction and suggestions: a visible out-of-character correction moved the scene back to the archive worktable and placed Mira in the next room. The model-generated scene changed accordingly. A follow-up Ideas request offered three editable first-person possibilities grounded in that scene. This check revealed the player appearing in the NPC cast; the validator now excludes the persona and has a regression test for that case.

The live runs exposed actual failures that offline fixtures had not:

- Some scene reads timed out without showing Retry. The failure path now distinguishes a still-owned timed-out read from an explicitly cancelled one and exposes Retry.
- Short attempt-read deadlines dropped risky attempts. The runtime now uses the available interceptor budget, a compact referee prompt, and enough output allowance for a complete answer. If it still cannot adjudicate, it explicitly reports that the scene continued without a roll.
- The original world packet omitted fact IDs, making stable updates harder. IDs now accompany selected facts.
- Long descriptions could be cut mid-word. Text limits now use a word boundary when available.

In one successful contested-action sample, the referee call took 2.907 seconds and the narrator call took 6.190 seconds. The subsequent scene read took 10.608 seconds. Scene-read calls in the checked social sample took 7.429–8.952 seconds, with a 6.976-second greeting read. These are small samples on the current connection, not speed guarantees. Other calls reached the read deadline, and the correction test needed one explicit retry. A faster helper can be selected from the inline Settings control.

Canonical memory is no longer evicted at 80 open facts. The narrator receives a bounded, relevance-selected packet with stable IDs; older events remain searchable in Remembered. A synthetic 10,000-message replay retained 200 facts and built the bounded packet in roughly 10–15 ms in three local samples. That is an engine-only benchmark, not full conversation latency.

The production backend loads in the checkout's actual sandboxed worker. The production frontend also passes a separate isolated check against Lumiverse's real DOM helper, including owned roots, scoped styling, Ideas dispatch, and editable suggestion creation. Default frontend startup does not access drawer or floating-widget APIs. The compatibility UI is initialized only when explicitly selected.

Reproduce from the Warp worktree:

```powershell
bun run verify
bun run build
bun scripts/host-smoke.ts D:/Lumiverse
bun scripts/frontend-host-smoke.ts D:/Lumiverse
bun scripts/living-bench.ts
bun scripts/live-model-check.ts D:/Lumiverse --inspect
```

Run live calls from the Lumiverse checkout so it resolves its own existing configuration:

```powershell
bun C:/Users/eme4/warp-core/scripts/live-model-check.ts D:/Lumiverse --playtest --case=social
bun C:/Users/eme4/warp-core/scripts/live-model-check.ts D:/Lumiverse --playtest --case=contest
bun C:/Users/eme4/warp-core/scripts/live-model-check.ts D:/Lumiverse --playtest --case=quiet --extras
```

Reports are written under the Warp worktree's ignored `.artifacts/` directory. A report may retain an unsettled provider call after the local read was cancelled; this is not counted as a successful response.

Still unproven: browser layout, actual frontend sandbox transport, end-to-end install/restart in the running app, interaction with real user presets and cards, long-session model recall accuracy, and whether people want to keep playing. Browser and Windows automation currently both report an unavailable connection. The goal remains active pending those checks.
