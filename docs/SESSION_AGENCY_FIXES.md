# Session agency and contextual choices

First implementation pass following the product audit at `92f1557`.

## Changed contracts

- The referee can classify ordinary actions, items, abilities, travel, quests and improvised attempts during conversations and work shifts. Dialogue remains a session turn. Existing availability and confidence gates still apply.
- An action suggestion awaiting confirmation does not spend an engine turn or process an implicit conversation/customer response. Stored suggestions retain this behavior on regeneration.
- Compatible same-place actions preserve sessions. World actions that leave or start an encounter end the existing conversation/outing or shift. Explicit combat/fight/violence/disruptive action tags also interrupt work. Interrupted shifts do not pay.
- Date-owned venue transitions are not departures from the date. Session cleanup runs before checkpoint/loop restoration so restored sessions survive.
- After-reply contextual choices are written from the committed bookkeeping state. Old active-swipe choices are cleared before replacement. Empty or failed output leaves ordinary rule choices available.
- Model work stays outside metadata write callbacks. Publication checks generation ownership, content, active swipe, surrounding history and the full target record. Conflicting replay paths and late results are rejected.

## Validation

Use `bun run verify` and `bun run build`. Focused coverage is in `src/backend/session-agency.test.ts` and `src/backend/transaction.test.ts`, including delayed-host-read cancellation and target-record conflicts.

These are offline engine and scripted-host tests. They do not establish live model intent accuracy, browser layout, production latency or provider cancellation. Choice generation now follows bookkeeping instead of running in parallel, which can increase time until contextual choices appear. A manual state change during writing rejects that choice result; this pass does not retry it indefinitely.
