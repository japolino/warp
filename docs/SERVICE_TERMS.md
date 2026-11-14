# Paid NPC aid

Implementation, 2026-11-13. A service fee belongs to the offer. It is separate from the NPC's ability costs. An ordinary "Yes, please" can accept one fresh, unambiguous offer using the existing conversation path. No setup page, rulebook, genre preset or additional model call is introduced.

For example, Jo offers Mend for five coins. The player has twelve coins, and Jo's established Mend costs two of Jo's Focus. Accepting prepares one receipt containing both the five-coin payment and Jo's treatment. Committing it leaves the player with seven coins and charges Jo's Focus once. A question or refusal changes neither balance. Missing range, insufficient funds, unavailable treatment or another unmet prerequisite prevents the entire transaction.

## Supported fees

The helper may attach `fee:{kind:"resource|item",id,amount}` to an actual aid offer. Code requires a positive exact price in that same quoted offer and a known player-owned asset. Resource payments require a money resource. Item payments transfer the actual quantity, splitting a stack when necessary. Equipped items cannot be handed over. No currency conversion or choice between alternative prices is inferred.

If the NPC has a unique established same-name, same-unit money balance, the payment increases it. If their total is unknown, the consumed offer records exactly who paid whom, which asset and how much, without creating a fictional zero-based wallet. A paid receipt is evidence of that transfer, not evidence of the NPC's total wealth. Item fees remain actual owned stacks in the recipient's inventory.

Ability costs retain their original owner and existing shared-payer rules. They are never replaced by the service fee, omitted because a payment exists, or charged again through an extra spend operation. Payment, one beneficial NPC ability use, offer consumption and the NPC's action/effects commit together. Granting permission still takes no player action.

The source reader distinguishes explicit free help from a price. A fee, alternative payment, labor condition or other unsupported restriction cannot silently become free treatment. Labor-for-treatment and alternative currencies still need further implementation. The current simple-price recognizer is conservative and English-oriented; an unrecognized fee remains unresolved. Dialogue can continue without inventing an NPC refusal to explain missing bookkeeping.

## Replay and caching

Resolver 11 handles offers with a saved fee. Resolver 10 remains the path for unpriced aid. Original resolver-10 acceptance and refusal receipts were captured from the installed `1a18867` source before these edits; both retain their exact results. Older observation records retain their former term-reader semantics. New observations carry a term-reader witness so the explicit-free correction replays consistently.

The fee and its paid record travel inside the existing aid-offer collection. Existing narrator instructions and historical Warp blocks are not rewritten. The production-worker paid-aid check retains every previous Warp block byte-for-byte through offer, question, refusal and acceptance. This is prompt-prefix evidence, not provider cache-hit telemetry.

## Verification

874 tests pass, with 21,334 assertions across 100 files. TypeScript and the production build pass. Both unpriced and paid aid pass in the actual Lumiverse worker, along with the rendered-story worker check. Focused checks cover known and unknown NPC wallets, item-stack conservation, insufficient funds, missing range/prerequisites, special injuries, refusals, old resolver receipts, reload, source/branch edits, cancellation and alternate reply swipes.

These deterministic and worker checks do not close the original-card paid-aid or broader seamless-first-session gates. The earlier original-card failures remain documented in [VOLUNTARY_AID.md](VOLUNTARY_AID.md).
