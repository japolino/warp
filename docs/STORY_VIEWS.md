# Rendered story evidence

Implementation, 2026-11-05. Imported cards may store every language and route inside one raw greeting. Those alternatives are templates, not events that all happened. Reading the last part of that raw message caused an inactive Japanese examination scene to enter a custom English medical-station pilot.

Warp now takes the rendered history supplied by Lumiverse to its generation interceptor, matched by an exact assistant sourceMessageId. It stores one bounded text view against the original source revision and swipe. No card script is evaluated by Warp, no additional model call or permission is added, and the original message is unchanged. Ambiguous IDs, unresolved conditionals, cancelled captures and stale source revisions do not produce a view. Sources are captured incrementally within the existing interceptor budget.

Before a templated narrator message has a usable view, fresh extraction does not read its hidden branches. A greeting containing only decorative markers does not start an extraction call. Ordinary untemplated prose and player text keep their existing path. The next actual narrative reply remains readable even when a template cannot be projected.

Fresh fact, scene, resource, ability, response, companion and agreement evidence can cite the resolved text, including substituted player names and explicit numbers. The evidence retains both the raw source revision and the view revision. Replay checks the same saved view, rather than re-evaluating old variables. A later live variable value cannot rewrite a historical starting balance or refresh a used offer. A real source edit or swipe still invalidates the corresponding view.

## History and caching

Source-view metadata does not change the canonical story path. Existing prompt renderings stay frozen; a newly corrected remembered projection is appended as a new delta. This preserves Warp-owned historical bytes, not changes made by the host or another extension to its own history.

New projected mechanical observations require their view witness during replay. Old mechanical observations and resolvers retain their existing raw-source validation, including old paid receipts. This avoids turning a source-reader upgrade into restored inventory or lost payments. It is not a claim that every legacy conditional observation was correct.

Narrative events and scenes quoted from raw templated branches no longer pass solely because their record has a matching path; the selected view must support them. Facts already restated in later ordinary narration may need further reconciliation. The change cannot undo prose that was already shown or safely reconstruct every old script-variable state. A frozen view represents the source used for that story, not a live status widget.

## Verification

864 tests pass with 21,198 assertions across 99 files; TypeScript, the production build and both worker smokes pass. Tests cover unknown/empty views, exact source IDs, duplicate IDs, cancellation, source edits, swipes, tampering, resolved names/numbers, ability preparation, one-time NPC aid payment and reload, legacy mechanical semantics and frozen prompt bytes. The production Lumiverse worker smoke checks template deferral, real source-view capture, hidden-branch exclusion, aid execution and prefix preservation. Installed original-card verification is still required; a passing fixture is not a complete first-session gate.
