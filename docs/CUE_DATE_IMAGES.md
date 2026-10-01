# Date pictures through Cue

Update both Warp and Cue. In Cue, choose the assistant/parser connection, image connection or workflow, prompt settings, identity/reference options and scene-image fit. In Warp, enable **Illustrate dates through Cue** under Dates & dungeons.

Warp requests a picture when a conversation/date scene starts or moves to a new venue. It sends only a display name, venue name, time of day and mood, plus chat/request identifiers. It sends no rulebook description, character profile, appearance tags, clothing, pose, image prompt or connection settings. Cue resolves the name against its own registry and explicit aliases, reads its own card/lore context and character memory, and uses its regular planner and image compiler. The existing closed pose catalogue and reference-anchor logic still apply.

Cue returns a picture to Warp's date screen without creating a chat message or replacing Cue's active reading turn. Its reading view can remain closed. All five fit modes are supported: cover, contain, fill (stretch), none and scale-down. Fit changes in Cue update the current date image without another generation. The normal Cue appearance memory is shared; date image reuse has a separate temporary cache so it does not evict the reader's active scene. Native-card mode requires a confirmed match with the card character; secondary characters need Cue image generation rather than receiving the protagonist's avatar.

The request uses Cue's settings at admission; presentation fit is read again at completion. **Refresh picture** asks Cue using its current settings and may reuse a compatible image. **Retry picture** spends no game turn. Warp never falls back to its former image generator. Existing Warp image-connection settings and date-image cache files remain stored for compatibility but are unused.

Ending the date, changing chats, disabling Warp date pictures or unloading the frontend cancels its pending bridge request. A superseding request aborts the older Cue operation. Request IDs, user ownership and the active date session guard late results. A missing/older Cue produces a visible error after two seconds; an accepted request has a five-minute deadline. Host/provider cancellation may not stop already dispatched network work, but canceled results cannot replace the date picture.

## Offline checks

Verified on October 1: 389 tests passed, type checking passed and the production bundles were rebuilt. The matching Cue change passed 1,088 tests, type checking and its production build.

The host emits `MESSAGE_EDITED` for metadata saves as well as text changes. Warp compares the scene's message IDs, active swipes and text before clearing it. Recording a dating move or saving Cue metadata therefore preserves dialogue and the pending picture. Real narrative edits, deletion, swipe changes and undo still discard stale presentation and reject late pictures.

```powershell
bun run verify
bun run build
bun test src/frontend/cue-images.test.ts src/shared/cue-images.test.ts src/frontend/stage.test.ts
bun test src/backend/transaction.test.ts -t "date pictures"
bun test src/backend/transaction.test.ts -t "host metadata edit|real narrative edits"
```

In Cue, run `bun run verify` and `bun test src/backend/runtime/external-images.test.ts`. The latter drives the real planner, pose/image compiler and workflow routing using scripted host/model responses; no production model or image service is contacted. Both repositories carry the same versioned wire contract and contract tests.

Manual integration: start a date with Cue enabled but its view closed; verify the configured image workflow is called once, the expected character appears, and changing Cue's fit changes the picture. Disable Cue and refresh the picture; verify a useful error and a functioning date. Delay a provider result, switch chats or end the date, then release it; the old picture must not appear in the new scene.

Dating regression: select Talk with someone, then Music. Each move must show its new stage dialogue. While Cue is generating, select another topic; the same picture request must remain active and its result must appear. Repeat with helper and scripted dialogue. Edit the actual chat text while the helper is waiting; stale dialogue and the old picture must be discarded. The transaction harness now emits the host's metadata edit event for every message update, and runs these paths without production providers.
