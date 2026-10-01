# Core UX review fixes

This change addresses the 22 finding groups in the October 1 core review. All reproduction tests use local rulesets, seeded engine runs and scripted host responses. They do not need a running Lumiverse server, a model connection, API keys or production chat data.

## Changed contracts

- A generation stays busy through bookkeeping. Stop closes its identity; an old Stop, End or helper response cannot reopen or overwrite a newer turn.
- Warp message writers share one queue and merge against fresh metadata. Draft alternatives inherit the latest recorded mechanics, including adjustments made while they were being written.
- Publication stages a new, unattached book, validates its read-back, then attaches the complete snapshot. Earlier books remain intact as backups. The latest installed snapshot is authoritative; legacy books still merge until a snapshot is installed.
- Checks use the state before action costs. Displayed odds, gear and perk eligibility use that same context. The action still pays its costs. Daily charges belong to the day the attempt began.
- Encounters default to a visible 20-round budget. Authors can set `round_limit` from 1 to 200 and `timeout_outcome`. Normal endings take precedence on the final round. The default timeout is the momentum loss outcome or `lost`; any effects authored for that outcome apply normally.
- Quiet encounter text below the automatic confidence threshold offers a confirmation. It spends no round. Confirming uses the quiet round handler, without invoking the narrator or its preset.
- A successful check is one round's result. Encounter victory, escape, concession and loss come from the encounter's terminal outcome.
- Continuing an ending acknowledges it until its predicate becomes false. It can trigger again after that reset.
- Continue extracts newly appended prose without rerolling the original action. Both concatenated and suffix-only host responses are supported.
- New records carry a bounded revision of the preceding active path and rules. Editing, deleting or swiping an earlier cause, or changing the rules, pauses dependent mechanics. The sheet offers **Keep recorded outcomes** or **Discard affected results**. Keeping rebases recorded outcomes without rerolling them. Discarding removes affected active-swipe mechanics and choices while retaining chat text and inactive alternatives.
- Legacy records without provenance are accepted as the upgrade baseline. Their original historical prerequisites cannot be reconstructed. They gain provenance when written, and new descendants detect later edits to them.
- Additive map discovery preserves existing outcome provenance under the extended map. It only emits arrival events after the map entry is saved.

## Reproductions and regression tests

The names below are searchable test names or behaviors in the listed files. These are fix assertions, unlike the original review's characterization tests that expected the bugs.

| Finding | Reproduce before the fix | Fix assertion and permanent coverage |
| --- | --- | --- |
| UX-20 | Stop a generation without End, then click another action | Busy clears; late and duplicate callbacks are rejected. `backend/transaction.test.ts` |
| UX-01 | Interleave record, hint and companion-metadata writes | Every swipe and unrelated key survives; a failed queued write does not block the next. `backend/transaction.test.ts` |
| UX-02 | Hold extraction, adjust a stat, then release extraction | Adjustment survives; extraction commits only to the unchanged path and target. Alternative drafts preserve adjustments too. `backend/transaction.test.ts` |
| UX-05 | Fail book creation, either entry write, read-back or attachment | The previous active game and shared lore survive. Retry publishes a complete snapshot. `backend/rulebook-install.test.ts` |
| UX-08 | Present an already committed dungeon step while poisoned | Presentation changes no mechanics and causes no extra tick. `backend/transaction.test.ts` |
| UX-06 | Reject the discovered-location entry write | Location remains unchanged; successful retry creates both routes before arrival. `backend/transaction.test.ts` |
| UX-03 | Execute an unowned item, gated saved intent, invalid target or unreachable travel intent | No effects, elapsed turn or resources; generated choices use the same eligibility checks. `engine/ux-regressions.test.ts`, `engine/story.test.ts` |
| UX-07 | Click a charged item and report the same use in prose | One charge is consumed. Genuine additional uses remain counted, bounded by available charges. `engine/ux-regressions.test.ts` |
| UX-21 | Cache revealed lore, swipe away its reveal and immediately assemble a prompt | The registered lore gate uses the active generation path; regeneration excludes its target, Continue includes it. `backend/transaction.test.ts` |
| UX-19 | Configure an incompatible classifier, then click a game action | Visible rules fallback still records the action. `backend/transaction.test.ts`, `backend/classifier-config.test.ts` |
| UX-04 | Import valid sections beside an error-level section and install | The draft stays editable; publication and runtime loading reject the partial game. `backend/rulebook-install.test.ts` |
| UX-12 | Preview d100 odds with an additive modifier or a cost affecting the check stat | Odds match the committed pre-cost check. Seeded runs check the probability calculation. `engine/ux-regressions.test.ts`, existing perk tests |
| UX-09 | Lose a dungeon with a 37-gold haul or leave while the wallet is capped | Defeat reports lost haul; exit reports only the actual retained wallet delta. `backend/transaction.test.ts` |
| UX-14 | Continue a reply with newly narrated healing, then deliver duplicate End | Only new prose is extracted; healing applies once and the old action remains. `backend/transaction.test.ts` |
| UX-13 | Delete the first, middle or last swipe | Records and generated choices reindex together. Encounter logs belong to their active swipe. `backend/transaction.test.ts` |
| UX-11 | Interpret an encounter line at confidence 0.55 | No round is spent until the actual frontend confirmation handler is invoked; narrator dispatch remains zero. `backend/transaction.test.ts` |
| UX-10 | Keep playing while an ending condition remains true | The next turn continues; the ending rearms only after the predicate becomes false. `engine/ux-regressions.test.ts` |
| UX-16 | Simulate an encounter whose start effects enable an action or initialize momentum | Shared live startup and resolution are used by both simulators. Hidden moves are excluded. `engine/ux-regressions.test.ts`, `engine/simulate.test.ts` |
| UX-15 | Complete an automatic repeating quest and wait through its cooldown | It restarts and rewards once per cycle. `engine/ux-regressions.test.ts` |
| UX-22 | Prepare a reply, then edit the prose without changing its message ID | The prepared reply is unavailable. Rules, settings and narrative history are part of the fingerprint. `backend/transaction.test.ts`, `backend/drafts.test.ts` |
| UX-17 | Repeatedly choose a no-progress action with an unreachable winning predicate | A visible finite budget ends it; the configured consequence applies. A normal final-round win takes precedence. `engine/ux-regressions.test.ts` |
| UX-18 | Delete an acquisition before a dependent result, or edit/switch the earlier path | Descendant results pause. Explicit keep rebases; discard removes only affected active results. `backend/transaction.test.ts` |

## Additional module hardening

- Frontend state rejects other chats, home-screen responses and older revisions. Busy and builder responses are scoped to their originating chat. Switching chats clears the old view. `frontend/response-gate.test.ts` tests response acceptance; this is not a complete browser-layout test.
- Closed or replaced builder sessions are retired and their model signals canceled. Late progress cannot resurrect a discarded draft.
- Settings normalize malformed or legacy values before use. Writes serialize, and runtime cache updates only after durable storage succeeds. `backend/settings.test.ts` injects a failure and overlapping patches.
- Classifier transport consumes cancellation and shares one deadline across transport and retries. `backend/transport.test.ts` verifies timeout during backoff and no fallback after a late canceled proxy failure.
- Character edits invalidate profiles; chat rebinding invalidates cached ownership. Full names isolate profile passages, and live-choice first-name aliases require an unambiguous match. `backend/profile.test.ts` and the registered lifecycle handlers in `backend/transaction.test.ts` cover this.
- Undo, checkpoint load, restart and history changes clear stage presentation history. Superseded local operations cannot commit late results or unlock a newer host generation. `backend/transaction.test.ts` covers registered undo and overlapping ownership.
- Billing processes up to 1,024 overdue periods and reports any remaining backlog. A 30-day jump matches equivalent daily billing. Trigger propagation scales with the rule count, up to 256 passes, and reports unresolved predicates at its safety cap.
- Live choices are offered only for eligible tags and present targets. Choices produced before a state-changing extraction are discarded; ordinary rule choices remain available for the committed state.
- Prepared and alternate narrator drafts use the chat's pinned connection ID when present. Helpers keep their configured helper connection.
- The interrogation template's successful moves now make stronger progress. The corrected shared simulation exposed a 9% favorable result rate under random play before that adjustment. Template balance checks still require all shipped templates to pass.

## Offline commands

```powershell
bun run verify
bun run build
bun test src/backend/transaction.test.ts src/backend/rulebook-install.test.ts src/backend/settings.test.ts src/backend/transport.test.ts src/engine/ux-regressions.test.ts src/frontend/response-gate.test.ts
bun src/tools/replay-bench.ts
```

The replay benchmark compares full snapshots, the 60 snapshots retained by the HUD, and state-only replay. It includes 20 stats, 20 people, 40 inventory entries and recurring checkpoints, and checks identical final state. Three local samples on October 1 produced these medians:

| Turns | Full snapshots | HUD 60 snapshots | State only |
| --- | ---: | ---: | ---: |
| 100 | 17.23 ms | 9.73 ms | 0.63 ms |
| 1,000 | 173.85 ms | 15.70 ms | 7.04 ms |
| 10,000 | 1,683.03 ms | 58.17 ms | 47.11 ms |

These are synthetic engine measurements, not production edit-to-interactive latency. The script also prints sample p95 and heap deltas; three samples and Bun's heap reporting are too coarse to claim precise allocation or tail-latency bounds. Trimming is tested for state and retained-step parity through checkpoints, swipe changes and deletion.

## Integration limits

The host replaces whole metadata objects and has no compare-and-swap API. Warp's queue coordinates Warp writers; another extension writing the same message independently can still race. Character attachment publication also lacks host-side compare-and-swap, so it re-reads attachments immediately before publishing and preserves them.

The host proxy may continue an HTTP request after the local deadline if it does not forward AbortSignal. Warp stops waiting, retries and late commits; direct fetch receives the signal. Server-side cancellation needs host support.

Ruleset replacement requires explicit reconciliation of an existing chat. It does not guess semantic renames of stats or items. A checkpoint is replayed under the explicitly accepted current rules. Backup books permit recovery of the previous configuration.

The provider's reported authentication failure remains outside this change, as requested. Offline tests do not establish that a production provider accepts a particular key, nor that helper prose always states every mechanical fact correctly. Scripted fallbacks remain available for missing or unfinished prose.
