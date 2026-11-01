# Prompt caching

The default living-play runtime saves its narrator prompt observations on the player message, per active swipe and narrative path. Later requests replay those historical observations at the same source messages, rather than letting the previous turn's temporary block disappear. Source message ids supplied by Lumiverse identify the correct messages even after macros or regex transform their text.

The first retained observation carries the director instructions and full current projection. Later observations carry only changed facts, removals from that projection, changed place/cast/preferences, and any independently resolved outcome for that player turn. Unchanged state without a roll adds no block. The full projection is stored in metadata for rebuilding the prompt, not repeated to the model every turn. Outcomes are explicitly limited to their attached player turn.

If history clipping removes the earlier baseline, the first remaining snapshot renders a complete baseline. That rendering remains stable while the retained window stays the same. Narrative edits, deleted sources, and alternate swipes invalidate snapshots from affected paths. They are not replayed as current facts. A new or edited player turn receives a new snapshot; matching retries reuse it. New content preferences can replace the latest snapshot. Dry runs preview without writing snapshots or making model calls.

Snapshots live in `warpLivingPrompt` message metadata and never change visible story text. Provider cache controls, reasoning signatures, names and multimodal parts are preserved. Hosts without source message ids retain the former terminal injection fallback; the extension does not guess source identity from transformed prose. The old authored-rulebook compatibility engine retains its existing injection behavior.

This preserves Warp's contribution to the longest reusable prompt prefix. It does not guarantee a provider cache hit: provider expiry/routing/thresholds, other extensions, dynamic preset or lore content, context-window movement, and edits can independently change reuse. Helper and decision requests are separate calls. Their changing task inputs are not made append-only conversation histories by this change; their stable instructions remain first.

Verification, 2026-11-01:

- The full suite passed 509 tests and typecheck. Targeted tests and the production build passed again after omitting empty updates.
- Prompt tests prove that the next request preserves the previous request and assistant reply, sends changed facts as deltas, bootstraps trimmed history, excludes snapshots invalidated by edits/swipes, and preserves multimodal parts and provider cache/signature fields.
- The real interceptor test proves metadata persistence, exact prompt extension, identical repeated requests and no dry-run writes. These checks require no model.
- The production bundle passed Lumiverse's sandboxed worker smoke check. The installed update was backed up at `.artifacts/warp-backup-1793545862239`, deployed and restarted through Lumiverse's extension manager.
- Lumiverse's actual Prompt Dry Run in the connected browser contained the new chronological-observation instructions and Warp block. The preview was closed afterward. This confirms the new code executed in the running host; provider cached-token billing was not measured or claimed.
