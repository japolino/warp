# Pause and resume belong to the conversation

The inline Pause and Resume buttons now affect the current automatic-play chat. Previously they changed the user's global `enabled` preference, so resuming a test chat also resumed unrelated conversations.

Untouched chats inherit the existing global preference. The shipped default remains enabled, so a new installation needs no activation step. Existing globally paused users stay paused. An explicit inline choice persists for that chat and takes precedence over the default. Changing the default later affects chats without an explicit choice. Legacy authored-rule engine behavior is unchanged.

Choices live in the user's private `chat-activation.json`, separately from story messages, card content, model profiles and shared chat metadata. The versioned file stores chat IDs and boolean choices. Per-user serialized writes preserve concurrent choices and update the in-memory value only after persistence succeeds. Worker replacement reloads the choices. Reading a saved choice needs no model call.

Pause cancels the current chat's background read and pending action. A prepared native action cannot subsequently commit its reserved effects or costs. Other chats retain their own state and activation. Resume uses the ordinary scene synchronization path; it adds no setup menu or alternative test runtime.

The interceptor, extraction, inline view, frontend actions and native aid handler use the same effective chat setting. Native tools remain registered while any known user has an enabled default or an explicitly enabled chat. They unregister when neither remains. Ordinary navigation does not repeatedly change the schema. A paused chat still rejects native calls on a host where another chat keeps the schema registered.

Earlier chronological Warp blocks and saved receipts do not change when a chat is paused or resumed. These are user preferences, not in-fiction events, time advancement or a reason to reroll.

938 tests pass with 22,049 assertions across 107 files. TypeScript and the production build pass. The first full run hit an existing simulation test's five-second timeout; the unchanged simulation passed on rerun. A test-only TypeScript role annotation then needed correction, after which typechecking passed.

Unit and runtime checks cover inherited defaults, global-pause preservation, two-chat isolation, restart persistence, user isolation, concurrent writes, failed writes, malformed values and cancellation of a prepared native receipt. Eleven production worker modes pass, including warm/cold native aid with a globally paused user. The scoped worker checks use real frontend Resume/Pause messages, persist the actual user-storage RPC, restart the worker and reject any attempted write to global settings. Other modes retain coverage for ordinary aid, paid aid, barter, agreement recall and rendered sources. Full application evidence is recorded separately after native installation and actual preset/lore playtests.
