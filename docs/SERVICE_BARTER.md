# Work for NPC aid

Implementation, 2026-11-13. A source-backed NPC proposal can connect ordinary work, an accepted agreement and one beneficial treatment. The player uses the normal composer. No rulebook, preset, task board, setup form or drawer is required.

Jo offers Mend if the player sweeps the chapel steps and washes the basin. "Yes, please" accepts those two clauses, without casting Mend, charging money or advancing the healer's action. A question leaves the agreement unchanged. Actual narration can establish that the steps are clean while the basin remains unfinished. After both clauses are fulfilled, a current voluntary offer makes the promised treatment available. A subsequent acceptance resolves one NPC-owned use through the existing engine.

This makes an actual NPC bargain usable. It does not make every request a quest or generate chores because a field is missing. The player can decline, negotiate or seek another solution through ordinary conversation. Completed work is remembered even if the NPC subsequently refuses treatment. Earning help is separate from forcing cooperation.

## Saved terms and settlement

- `aid_offer.work` contains exact distinct clauses from the actual conditional offer. Code requires full coverage of the recognized work region. Dropping a second clause, choosing an alternative or inventing a clause cannot make the proposal executable.
- An ordinary agreement records the player's actual acceptance, the original NPC offer and every work clause. Its optional `service` binds the exact aid offer/version, owner, ability/version and any original fee. Questions, tentative replies and counteroffers do not accept the original bargain. A recovered new offer can be referenced by its unique ability name; code saves canonical IDs and versions.
- Each requirement needs actual narrator completion. A player's attempt, a repeated promise or mere acceptance does not fulfill it. The service remains unsettled after work completion until it is actually received or the agreement is withdrawn.
- A current offer can reference the earned agreement by ID or unique name. An unambiguous matching service can also bind automatically. Presence, source restrictions, capability, range, funds and treatment eligibility still apply. The initial conditional proposal can never execute the cure by itself.
- Resolver 12 commits one beneficial NPC use, its costs, any player service fee and the consumed service together. A failed or cancelled action consumes none of them. Refusing treatment spends nothing and preserves completed work. Already received services cannot be collected again from the same promise.

Paid work-for-aid offers retain their original fee when a renewal omits the price. A helper repeating that fee may cite the original accepted offer as its price evidence; the renewed narration supplies current willingness. A changed unproven fee cannot replace it. Explicitly free treatment is different: a source-backed waiver can remove the fee for that current offer, and the used service retains that waiver evidence. The NPC's own casting/item costs still apply. Omission, an empty field, "not for free" and "no fee waiver" cannot fabricate a waiver.

Unknown balances stay unknown. Fees retain the conserved money/item path in [SERVICE_TERMS.md](SERVICE_TERMS.md). Monetary payment clauses cannot be disguised as completed work. Counted handovers retain their own receipt boundary.

## Recovery and presentation

An earlier conditional promise can be recovered without executing it. After ordinary observations and definitions are prepared, a bounded dependency pass reads service proposals, acceptance, fulfillment and renewed willingness in story order. A second idempotent pass covers dependencies received together. The same path revalidates saved evidence on reload, including selected rendered-source witnesses. Newer source events prevent an old proposal from reopening a consumed offer.

Existing resolvers 2 through 11 retain their receipt paths. New term-reader version 2 carries the barter rules; old observations retain their earlier semantics. No canonical story-path change, new permission or additional provider call is introduced by the dependency pass.

The narrator director and historical Warp blocks remain frozen. `serviceBoundary` and agreement/offer changes append through the existing prompt delta. A production-worker check preserves every earlier block through proposal, acceptance, questions, partial work, refusal, renewal, payment and reload. This is prefix evidence, not provider cache-hit telemetry.

The normal interface uses the NPC's offer and short changes. A received paid treatment can show `Mend: received · paid 5 Coins`, without adding an opaque agreement-name notification. Optional inline inspection shows the actual clauses, their progress, the promised treatment, its status and the source quote.

## Verification

898 tests pass, with 21,756 assertions across 102 files. TypeScript, the production build and all four worker checks pass: barter, paid aid, unpriced aid and rendered story sources. Earlier test counts in the linked implementation notes describe their own checkpoints.

Unit and runtime checks cover all-clause acceptance, questions and counteroffers, partial work, player attempts, ambiguity, actor identity, a missing or changed ability, unavailable funds/range, special injuries, refusal, inherited fees, explicit fee waivers, cancellation, alternate swipes, branch edits and replay. Original installed resolver-10 receipts and earlier real-helper resolver-11 records remain regression fixtures.

The actual Lumiverse worker also completes a seven-exchange public fixture: accept work, ask about it, complete each clause, decline treatment, request a renewed offer, and accept it. It restarts the worker and reloads the same result without a model call or another payment. Bare work/treatment acceptance and refusal require no extra foreground interpretation.

The configured `gemini-3.8-flash` helper ran two further production-worker scenarios with fixed narrator replies:

| Scene | Actual work | Saved result |
| --- | --- | --- |
| Fantasy clinic | Sweep the chapel steps and wash the basin | Both clauses completed; Mend received once; five coins paid; Jo's Focus charged once. |
| Ship clinic | File an incident report and sterilize the bench | Both clauses completed; Dermal Seal received once; twenty credits paid; one of Dr Imani's medical patches used. |

Both runs preserve prior Warp prompt blocks, and both saved histories replay exactly. Fantasy took 22.8 seconds across the complete controlled sequence; science fiction took 24.7 seconds. Each used four scene reads and one routine-work assessment. Neither bare yes required another foreground interpretation. The initial failed runs are retained privately: the helper correctly repeated the original fee, but the old validator incorrectly demanded the price in the renewed quote. That bug was fixed against the original accepted evidence, without changing the helper's source text or relaxing payment requirements.

These are real helper/worker checks with fixed narration. They do not prove narrator compliance, ordinary original-card play or enjoyment. Task completion remains a sourced semantic classification, not a general labor simulator. The work-region parser is conservative and English-oriented; arbitrary negotiations, deadlines and unsupported conditions can remain unresolved. The broader seamless-first-session gates remain open.
