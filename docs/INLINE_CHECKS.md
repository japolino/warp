# Inline checks

Default play shows each reply's Warp check above Remembered. A check displays its saved d100 value, outcome and attempted action. Expand "Why this result?" for the circumstances, stakes and exact result bands. Lower rolls are better.

| Circumstances | Clean success | Success with a cost | Setback |
| --- | --- | --- | --- |
| Favorable | 1–60 | 61–90 | 91–100 |
| Even footing | 1–30 | 31–75 | 76–100 |
| Outmatched | 1–10 | 11–45 | 46–100 |

The classifier chooses circumstances; Warp's seeded local RNG chooses the result. The d100 representation preserves the previous probability bands and seeded outcomes. The saved roll is reused on regeneration and swipes. Editing the source action invalidates its saved check.

Older records retain their outcome and show that the die value was not saved. They are never rerolled to fill the display. Replies without a recorded check say so explicitly. That means Warp has no roll to attribute the narration to; it does not certify that every negative event was appropriate.

The receipt uses the outcome saved before narration even if the later scene extraction fails. Displaying it requires no model call, MCP service or extra permission. Existing prompt snapshots keep their content; new checks include their roll alongside the outcome already sent to the narrator.

The user-supplied dnd-dice-mcp v2.2.0 file was inspected as a reference. It is a RisuAI plugin that exposes D&D tools through RisuAI.registerMCP and includes animated dice and forced-result settings. It was not executed or imported. Warp uses its existing resolver and native chat UI.

Verified with 513 passing tests, TypeScript checking, a production build and the Lumiverse sandbox worker smoke check. A browser preview exercised the actual receipt markup and native disclosure. No paid narrator generation was needed for these checks.
