# Inline checks

Default play shows the reply's Warp check above Remembered. It contains a pair of faceted percentile dice, the outcome and the attempted action. The explanatory disclosure has been removed. Lower rolls are better. The table below documents the resolver, rather than appearing in the chat UI.

The dice tumble for 1.25 seconds when at least 40% of the check first enters the viewport. The tens die and units die land on the saved d100 value; 00 and 0 represent 100. Animation is presentation only. Scrolling away and back, repainting the strip and restoring its DOM do not reroll or replay a seen check during the frontend session. Reduced-motion preferences skip the animation. Missing die values remain unknown and do not animate. Observers and animation frames are cleaned up on removal.

| Circumstances | Clean success | Success with a cost | Setback |
| --- | --- | --- | --- |
| Favorable | 1–60 | 61–90 | 91–100 |
| Even footing | 1–30 | 31–75 | 76–100 |
| Outmatched | 1–10 | 11–45 | 46–100 |

The classifier chooses circumstances; Warp's seeded local RNG chooses the result. The d100 representation preserves the previous probability bands and seeded outcomes. The saved roll is reused on regeneration and swipes. Editing the source action invalidates its saved check.

Older records retain their outcome and show that the die value was not saved. They are never rerolled to fill the display. Replies without a recorded check say so explicitly. That means Warp has no roll to attribute the narration to; it does not certify that every negative event was appropriate.

The receipt uses the outcome saved before narration even if the later scene extraction fails. Displaying it requires no model call, MCP service or extra permission. Existing prompt snapshots keep their content; new checks include their roll alongside the outcome already sent to the narrator.

The user-supplied dnd-dice-mcp v2.2.0 file was inspected as a reference. It is a RisuAI plugin that exposes D&D tools through RisuAI.registerMCP and includes animated dice and forced-result settings. Its faceted dice, contrasting body/edge colors and tumbling reveal informed this implementation. It was not executed or imported. Warp uses its existing resolver and native chat UI.

The original receipt passed 513 tests. Animation adds lifecycle tests for first visibility, settling, repaint, replay prevention, cleanup, reduced motion and unknown rolls. An interactive browser preview verified the off-screen check stayed still, scrolling started the animation, and the dice landed on the saved value. No paid narrator generation was needed for these checks.
