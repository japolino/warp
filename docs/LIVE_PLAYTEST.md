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

Later baseline browser/install evidence is recorded in [BROWSER_PLAYTEST.md](BROWSER_PLAYTEST.md). The systems checkpoint through `e7ec33c` has since been installed and started locally, as recorded in [SYSTEMS_PROGRESS.md](SYSTEMS_PROGRESS.md). Real-card first use, long-session model accuracy, the expanded mechanics in actual chats and sustained enjoyment still need verification.

## 2026-11-02: NPC exchange checks

The `exchange` case in `scripts/live-playtest.ts` exercises a disposable sparring scene through the existing Lumiverse account's configured model connection. It uses explicit numerical resources to test the arithmetic contract, not a private card or a claim that arbitrary unknown health has been solved. The host/chat side is a fixture; the helper and narrator calls use the real generation service. No test chat is written into the account.

```powershell
bun C:/Users/eme4/warp-core/scripts/live-model-check.ts D:/Lumiverse --playtest --case=exchange
bun C:/Users/eme4/warp-core/scripts/live-model-check.ts D:/Lumiverse --playtest --case=exchange --turn-limit=1
```

Run these from `D:/Lumiverse`, as above, to resolve the existing installation's configuration. They incur normal model usage. The checked connection reported `google_vertex` / `gemini-4-argon`; this identifies the tested configuration, not a speed or availability guarantee.

The ignored reports retain these observations:

- `.artifacts/live-playtest-1793637991389.json`: the helper selected a plausible NPC action and supplied a correct current quote, but drafted future prose in the message-ID field. The validator rejected the exchange, displayed an unresolved notice and spent nothing. Responses now omit that ID field; code binds a quote to the single allowed latest narrator message and pins its revision. An absent/nonmatching quote still rejects.
- `.artifacts/live-playtest-1793638127169.json`: a complete three-turn run. Jo's saved d100 roll was 1, a clean response. Jab spent 2 Focus, reducing Jo from 10 to 8; the player's explicit guard reduced ten damage to five, leaving 35/40 Health. Both clocks advanced once. Retreat moved touch to near, ended the guard and caused no extra NPC attack. Stopping sparring caused no roll, cost or additional attack. No extraction retry was needed. The two pre-action reads took 5.210 and 6.595 seconds; narration took 5.455, 3.292 and 4.970 seconds. Bootstrap took 10.982 seconds and the later reads took 5.269–7.303 seconds. These are small samples, not latency guarantees.
- `.artifacts/live-playtest-1793638360548.json`: bootstrap reached the 16-second read deadline. The first-use fallback returned actual resource values but omitted their IDs and used `Focus` as a cost reference. That originally prevented compilation. Deterministic local IDs and unique owned-name references now cover this captured response shape, including replay and non-refilling balances, in runtime tests. The live run itself remained unresolved and did not charge either side.
- `.artifacts/live-playtest-1793638634250.json`: a later attempt hit all three deadlines: bootstrap at 16 seconds, interpretation at 12 seconds and the synthetic narrator at 30 seconds. This is a failed live run, not a successful fallback or semantic-accuracy sample. No live completion is claimed for that run.

The successful narration honored the actual damage, resource cost, range and stopping boundary, but recited too much arithmetic. Resolver 3 now carries a turn-local presentation instruction to describe the physical consequences and leave counts to the inline display. Subsequent provider timeouts prevented a successful live check of that prose policy. The compact-prose browser screenshot is a production-frontend rendering preview with a hand-written example paragraph and the actual saved NPC check, not proof that the narrator generated that paragraph.

Provider usage contained prompt/completion totals but no explicit cache-hit fields. No live cache-hit claim follows from those totals. Prompt tests separately prove old message bytes stay stable, including a frozen receipt-presentation packet. More live repetitions, broader cards, unknown numerical premises, fast decision routing and sustained player sessions remain open.

## 2026-11-02: private information in a modern café

The new `mystery` case has no powers, numerical stats, game preset or setup book. Sam privately reads a donor letter, tells Mira while Dex is outside, then lets Dex in and asks Mira for discretion. It uses the same configured `google_vertex` / `gemini-4-argon` connection and disposable host fixtures as the earlier checks.

```powershell
bun C:/Users/eme4/warp-core/scripts/live-model-check.ts D:/Lumiverse --playtest --case=mystery
bun C:/Users/eme4/warp-core/scripts/live-model-check.ts D:/Lumiverse --playtest --case=mystery --turn-limit=1
```

- `.artifacts/live-playtest-1793643406176.json`: the three narrator replies kept Dex outside the donor secret, let Mira ask to see the letter and give a conditional promise, and made no dice checks. The helper correctly recorded Sam reading the letter but cited the player's attempted disclosure when proposing Mira's knowledge. Code rejected that grant. It repeated the same invalid citation on turn two. Turn three ended with the scene read unavailable and an unsettled helper call in the report; no success is claimed for that extraction. Coherent prose did not prove complete memory.
- `.artifacts/live-playtest-1793643494840.json`: after adding a concrete narrator-citation example and permitting a longer acknowledgement quote, the one-turn rerun recorded Sam's discovery and Mira's actual hearing from her narrator response. Dex received no knowledge grant. The helper copied the existing proposition and linked Mira's record to Sam's knowledge. No ruleset, meter, NPC response roll or player roll was created. The greeting read took 6.746 seconds, the existing pre-read 3.298 seconds, narration 7.229 seconds and post-reply extraction 4.303 seconds. The pre-read judged the disclosure non-risky; avoiding such unnecessary reads remains work.

Both synthetic helper samples are pinned in `src/living/fixtures/mystery-learning.json` and replayed in tests, including rejection of the original player citation. This is one successful live learning sample, not an accuracy rate or proof of long-session privacy. The helper still interprets whether a passage establishes hearing, discovery, a claim or a fact. Structural validation checks references, named participants, chronology, the sender's prior knowledge and proposition versions; it cannot independently understand every passage. Narrator compliance with information boundaries also needs broader testing.

No real chat was created or modified. The test harness retains ordinary usage data but still supplies no verified provider cache-hit telemetry. The new information boundary travels in future state deltas; the stable director and historical prompt snapshots are unchanged.
