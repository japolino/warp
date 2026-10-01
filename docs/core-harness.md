# Core reliability changes and offline evaluation

For the narrow encounter-loop fix and separate future design research, see [encounter notes](encounter-research.md).

Warp's core contract is that the engine decides outcomes, a provider supplies uncertain inputs and prose, and message metadata records the concrete events needed to replay a branch. The priorities below follow the consequences of breaking that contract: incorrect or duplicated state first, disclosure and authority boundaries next, then responsiveness and evaluation.

## Improvements, in impact order

| Priority | Concept and improvement | How to test it outside production |
|---|---|---|
| 1 | **Turn transactions.** Serialize mutations per chat, serialize metadata merges per message, deduplicate command IDs, capture the destination message/swipe, and keep busy through bookkeeping. Empty stops abort; retained partial prose commits once. Superseded callbacks cannot finish a replacement generation. Durable preparation supports recovery when the host later delivers the completion callback. | Fake-host tests use programmable barriers to interleave metadata writes and generation callbacks. Assert one committed outcome, preserved metadata, correct swipe, and busy state. Exercise duplicate end/stop, continuation, provider failure, history edits, and supersession. |
| 2 | **Replay and branch identity.** Pin normalized definitions and initial state, save the parent-state/context hash and accepted decision inputs, reject obsolete descendants, and retain discovered locations on their branch. Ironman swipes reuse probabilities as well as the seed. | JSON-round-trip the metadata; edit old prose, change a swipe, change author rules, and corrupt a record. Assert unchanged pinned replay, explicit stale-path detection, and no extra provider calls for an Ironman reroll. |
| 3 | **Knowledge gates.** Load rules before filtering world info and use the same gate policy for character profiles. A lore entry shared by multiple gates requires all owners to permit access. Closed companion stages no longer copy their plaintext into narrator knowledge. | Put a unique canary in locked lore and companion secrets. Assert it is absent from cold-start world info, profiles, and narrator knowledge, then present after the appropriate gate opens. |
| 4 | **Mechanical authority.** Validate action availability again when executing; decode helper proposals defensively; protect mechanically decided flags, moves, and conditions. For observations described as total changes, subtract the actual engine-applied change, including clamps, before accepting a residual. | Try unavailable actions, absent targets, malformed proposals and contradictory narration. Assert no unauthorized event, no exception, and no duplicate stat/item/time/practice application. Test near a stat cap, where requested and actual deltas differ. |
| 5 | **Rules and numerical integrity.** Gameplay compilation rejects lint errors, non-finite values, unsafe object keys, and cyclic stat caps. Static expression inspection sees references hidden behind short-circuit branches. Initial and subsequent state reconcile dependent caps. Trigger propagation is bounded and allows each rising trigger once per turn. | Compile invalid YAML fixtures; create a reverse-ordered trigger chain and dependent caps; resolve seeded turns and assert finite values, valid bounds, bounded trigger completion and reproducible event digests. |
| 6 | **Decision budgets and speculative work.** Provider retries and nested decision discovery share one deadline. Answers are checked against the question schema. Prewriting binds to the full context and has a global concurrency limit of two; invalidation aborts queued work. | Script providers to time out, retry, return unknown labels, or reveal another question. Assert bounded rounds/deadlines, normalized accepted probabilities, recorded fallback reasons, no stale drafts and at most two background requests. |
| 7 | **Odds and replay cost.** Exact distributions cover bounded non-exploding dice, including kept dice and modifiers. Odds use the state after costs. Large/exploding distributions and stochastic costs remain marked approximations. Replay caches unchanged prefixes and bounds retained UI snapshots. | Compare small distributions with enumerated outcomes and cost-sensitive checks. Benchmark a cold, warm and appended replay over 10,000 messages and 50 people; inspect retained steps and verify defensive copies. |
| 8 | **Measurable quality.** Seeded policy simulations expose invariants and balance proxies; labelled answer evaluation measures coverage, probability error and false automatic actions. | Run the commands below on both a baseline and a candidate. Compare deterministic digests for equivalent behavior, and deliberately changed metrics for balance changes. Use independently labelled, redacted data to evaluate actual provider quality. |

## Run the harness

From this checkout, with Bun installed:

```powershell
bun install --frozen-lockfile
bun run verify
bun run build
bun run harness --json .cache/harness.json
bun run calibrate fixtures/decisions.synthetic.jsonl
```

The tests use `src/testing/fake-host.ts`, an in-memory Spindle boundary. Metadata crosses a JSON serialization boundary, provider replies are scripted, and unscripted requests fail. Deferred promises create race conditions without depending on arbitrary sleep durations. These tests do not launch the extension in a real chat.

`scripts/harness.ts` blocks network access and runs five policies (random, earn, survive, train, repeat) over the three bundled templates. The default is four seeds and 240 turns per run: 60 runs and 14,400 turn attempts. It checks finite state, stat minima and dynamic caps, ownership of worn clothing, encounter identity, advancing time, event validity and rejected selected actions. Policy selection uses the state and advertised odds, without inspecting a future dice draw. Actual date/work sessions supply their own available choices.

The JSON report includes per-run event digests, ending hits, money, skill growth, common actions, fallback counts and replay timings. Repeat the same command and compare `summaries` to check determinism; timing values naturally vary. For a shorter development pass:

```powershell
bun run harness --turns 80 --seeds 2 --json .cache/harness-short.json
```

Simulations test invariants and supply balance evidence, not a claim that every ending is reachable or every strategy is fair. A policy that gets stuck travelling is a useful finding to inspect, not automatically an engine defect. Before changing a template, state a measurable objective such as time to an ending, survival rate or income per game day, add an appropriate policy, and compare multiple seeds. An intended exploit should have a specific fixture and regression assertion rather than rely on broad random coverage.

## Evaluate captured decision answers

Each line of a dataset is a JSON object with `id`, `questions`, `answers` and `expected`. Questions use Warp's existing choice, score or noul schema. Expected labels are option IDs for choice, zero-based criterion indices for score, and booleans for noul. See `fixtures/decisions.synthetic.jsonl` for the format.

```powershell
bun run calibrate ./redacted-labelled.jsonl --min-precision 0.95
```

The evaluator reports accepted-answer coverage, mean Brier error, automatic-action precision, false automatic actions and rejected IDs. The automatic-action threshold is 0.75. The optional precision gate fails when there are no automatic actions or precision is below the supplied minimum. Include ambiguous attempts, negation, quoted dialogue, unavailable actions, multilingual names and adversarial instructions in a real labelled set. Hold out some scenarios before tuning prompts or thresholds.

The bundled four-row synthetic fixture only verifies the evaluator. Its precision is not evidence of provider quality. No live provider is contacted by the evaluator.

## Existing chats and rules changes

The first new committed outcome pins the rules and initial state in the chat. Editing the author lorebook or reloading definitions then affects new playthroughs rather than silently rebasing that game. Use the command palette entry **Warp: Start a playthrough with edited rules** to append an explicit fresh-state anchor using the edited definitions. This keeps the chat history while starting a new game; it is not a state-preserving migration.

Existing legacy records without ancestry remain readable. Pinning cannot reconstruct defaults from an old ruleset that was never stored. New records reject incompatible descendants after a history edit or swipe switch; regenerate the affected continuation or start an explicit playthrough rather than carrying stale outcomes into the new path. Rule snapshots pin definitions, not every future version of engine semantics.

## Limits and next measurements

- Metadata writes are serialized within Warp. The host replaces whole metadata objects and offers no cross-extension compare-and-swap contract; another extension can still race that boundary.
- Prepared-turn recovery requires a matching completion callback and retained target message. This is not a general crash-recovery scheduler. Abandoned preparations are ignored by replay and expire for recovery after 15 minutes.
- Direct fetch requests support abort; the host's CORS/quiet-generation bridge may continue remote work after a local deadline. Late results are ignored.
- The event decoder validates primitive fields, bounded JSON and selected compound shapes. It is not a complete versioned schema for every nested dungeon/date object.
- Character card descriptions and scenarios remain author-trusted. Secret canaries in gated lore do not make arbitrary author text safe.
- Replay still checks message signatures linearly and copies the bounded UI tail. Measure on representative chats before adding persistent checkpoints or hash indexes.
- Runtime tests use a fake host. A separate development-host integration pass should verify actual stop/swipe callback ordering, metadata round trips and command delivery before a release.

The next high-value work is a complete versioned event schema, development-host integration fixtures, and a substantial human-labelled decision dataset. Those provide stronger correctness and quality evidence than changing prompts or template balance without a stated metric.
