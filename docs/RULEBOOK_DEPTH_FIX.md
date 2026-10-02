# Rulebook depth and Deepen progress

Depth measures static connections between rulebook mechanics. There is no 84-point ceiling. Optional thin spots and deliberate exceptions still lower the score; a valid, playable book does not have to score 100.

Previously, review counted only severe gaps while the score also included thin spots. A draft could therefore display "every piece connects" and lose its continuation button at 84 or 95. Retained waivers could make later passes finish immediately at the same score. Three consecutive helper replies without tools also reported the entire 40-call budget as used.

Review now lists gaps, thin spots and exceptions separately, with suggested fixes or waiver reasons. Unresolved findings keep **Keep deepening** available. **Fix exceptions** reopens current waivers and prevents the helper from waiving those findings again during that pass. Both buttons retain the draft's selected helper connection and effort.

Each designer call receives the current audit findings. Review records the actual number of designer calls, why the pass stopped, whether the rules changed and how many findings were resolved. Saved drafts are audited again when opened, so legacy counts and obsolete waivers cannot hide current findings. The scoring formula and installation requirements are unchanged.

## Offline regression harness

Run from the repository with Bun and installed dependencies:

```powershell
bun test src/backend/builder-depth.test.ts src/backend/builder-agent.test.ts src/backend/builder-recovery.test.ts
bun run verify
bun run build
```

`builder-depth.test.ts` exercises the complete builder API, provider adapter, persistence, checker and review renderer through a fake Spindle host. It makes no network calls and does not use production characters, provider credentials or storage.

The fixture has four meters and one rest action. Stress and mood have no mechanical readers, producing two thin spots and a score of 84. Scripted responses reproduce Quick completion, retained waivers, idle replies, actual budget exhaustion and provider failure. Assertions verify accurate status and available continuation. A protected exception pass then gives mood a rest threshold and stress a stamina consequence: the real audit reaches 100, with no scoring changes or waivers.

The harness also covers fresh AI builds, recovery of old drafts, manual refinement, retained helper settings and findings that remain despite a rounded score of 100. Live providers can still stop before completing a book; the UI exposes that outcome and preserves the draft for another pass.
