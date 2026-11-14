# Native narrator aid

The interceptor can prepare a player's existing action, but it cannot decide whether an NPC wants to help. Earlier original-card tests also showed that prompt boundaries alone could not reliably prevent the narrator from describing an unrecorded cure.

Lumiverse's native function path now lets the narrator choose one requested beneficial NPC action before describing its effects. For a direct request such as “Could you treat my arm?”, the current prompt advertises the addressed present NPC and their saved beneficial capabilities. The narrator can call `npc_aid`, talk, offer terms or refuse. A tool call represents the narrator's voluntary NPC decision; the player's request alone never executes it.

Free requested aid can happen within that reply, without asking the player to say yes again. Prices, work agreements and unsupported service terms retain the existing offer-and-acceptance flow. The native action cannot waive them, spend a linked player's resources, add an attack or force feelings. Informational questions, requests to treat someone else and ambiguously addressed groups are excluded. Request recognition is conservative and English-oriented.

## First use and transactions

If the addressed present NPC has no prepared beneficial definition, the narrator can name an actual source-supported capability. One bounded helper read prepares that capability from the real card, persona, lore and prior story. It can establish explicitly sourced missing counts and range, but cannot invent quantities, supplies, costs, presence or powers. An ordinary medical profession may support first aid; it does not establish magical regeneration. Once prepared, the same definition is reused.

Routine physical treatment uses a reusable `mend` effect and supported impact. A generic first-aid source cannot become a `clear_condition` spell named after the patient's first wound. Special injuries retain their recovery restrictions, and established benefits cannot be removed as aid. Unknown first-use powers remain unresolved without spending anything.

The helper sometimes supplies an exact card quote with the wrong message ID. First-use citation binding resolves that quote only when it has one unique actual supplied definition source. It changes neither the quote nor the raw response. Missing or ambiguous quotes remain invalid. Historical readers are unchanged.

Existing free aid offers use their usual receipt and are consumed once. A direct NPC action uses resolver 13, which delegates costs, eligibility, timing and effects to the shared engine and attributes recovery to the actual NPC. It permits one NPC-owned beneficial use, with no extra responses or player action. Resolvers 2–12 retain their existing behavior.

The prepared receipt is saved before returning the tool result. Successful narration commits it once; stop/error and stale branches do not. The completed receipt is also supplied to post-reply extraction. A failed extraction cannot erase the action. Previously unknown definitions can remain as sourced knowledge after a stopped action; they do not spend a cost or count as execution. Stopping during preparation cannot publish even that definition.

## Invocation and caching

Registration uses Lumiverse's `tools` permission and `inline_available`; no Council or external MCP setup is needed. It registers when an enabled user's chat is synchronized. When the last enabled user pauses Warp it unregisters, restoring the prior tool set. Missing permission or function calling disabled in the host preset leaves the ordinary interceptor/offer path available. Other-provider compatibility remains unverified. The tool never executes for a paused user.

A fresh generation token appears only in the current chronological state block. The handler also checks authenticated host user context, the active reply, the actual request and its causal path, and the exact saved Warp block in the host-supplied narrator context. Foreign users, other prompts, expired generations, edited requests and revoked access are rejected. Concurrent identical calls share one reservation; another action cannot replace it.

The schema stays fixed across ordinary turns. Registration changes the provider's tool set and can invalidate a previously cached tool prefix; installation, permission changes and explicit pause/resume are configuration boundaries. Tokens and receipts belong in chronological messages rather than per-turn schema changes. Earlier published Warp blocks remain byte-stable; regeneration changes only the current turn's token. The next ordinary turn explicitly clears the invitation. The current host advertises registered inline tools globally: on a multi-user host, an enabled user can keep the registration present for others, but a paused user's calls remain rejected. Without a matching live invitation the handler rejects calls. There is no cache-hit telemetry claim: the model responses inspected here expose token usage but no cache-read counters.

## Evidence and remaining gates

917 tests pass, with 21,909 assertions across 105 files. TypeScript, the production build and eight worker modes pass. One earlier check run, concurrent with the build, hit the pre-existing simulation test's five-second timeout; the unchanged suite passed when rerun without the concurrent build.

The production worker check (`scripts/narrator-aid-host-smoke.ts`) exercises real registration, authenticated tool RPC, duplicate preparation, pre-narration reservation, successful commit and reload without another model call. Runtime tests additionally cover refusal, unsupported powers, first-use preparation and cancellation, altered requests, foreign prompts, pause/resume registration and stable previous blocks. Ordinary paid aid, barter, agreement recall and rendered-source worker checks remain regressions.

A private original medical/romance card was tested through the actual Lumiverse worker using the configured `gemini-4-hydrogen` narrator and `gemini-3.8-flash` helper. The profile and greeting were unchanged; a controlled OOC premise established an adult patient's minor hand burn and current distance. No ability, price, numerical health or inventory was supplied by that premise.

The initial real run called the native tool but failed citation validation; the narrator stopped at preparing care and no treatment committed. After unique-source citation binding, a run committed treatment but revealed a definition tied to that particular condition name. The reusable injury-effect guard addressed that flaw. The subsequent run prepared a source-backed minor `mend`, called the tool once, described routine care and committed one NPC action. Its saved history replayed exactly. That sequence took 20.2 seconds including initial extraction and post-reply bookkeeping; the first-use helper took 3.1 seconds. A preceding run's initial extraction alone took 24.5 seconds, so low-latency first-session behavior is not established.

The original-card runs used private virtual histories and real model calls, rather than the live chat's writing preset and activated lore. Private profiles, replies and failed samples remain outside Git. They do not prove every card, provider, immediate cold start or long-session experience. The path currently needs a sourced present actor; an immediate request before the first scene read is still an open first-session gate. General spontaneous NPC actions, full tactical narrator tooling and the wider enjoyment gates remain unfinished.
