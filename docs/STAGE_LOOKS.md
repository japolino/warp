# Dungeon and dating UI checks

The stage shares the arcade's medieval, modern and sci-fi looks. A rulebook sets
`look: medieval`, `look: modern` or `look: scifi`. Settings → Effects & sound can
override it for dungeons, dates and minigames together. Existing
`minigames: { style: ... }` rulebooks and saved `minigameLook` preferences still
work.

## Run the preview outside Lumiverse

```sh
bun run bench
```

Open `http://localhost:5177/stage.html`. If that port is occupied, set `PORT` to a
free port before running the command. `bun run arcade` remains an alias.

The bench uses the real engine and stage renderer with isolated template state.
It does not read chats, save rulebooks, call a helper or generate images. Fonts
use their existing web source, with system fallbacks. The picture fixture is
local.

- Try Entrance, Exploring and Battle in each look. Select companions, move to
  tiles, pick a skill and its target, use an item, and run an automatic round.
- Use Hometown or Starfarer for Date, Topics, Plans and Outing. Questbound has no
  dating. Plans and Outing set a fixture relationship and an accepted invitation
  before using the real engine transitions.
- Turn on photo and try each fit value. Check that cover crops, contain preserves
  the full frame and fill stretches. None and scale-down also pass through.
- Choose Generating or Failed. Check that the chat exit stays usable and Retry
  picture returns to the fixture. The dialogue box should remain readable.
- Test desktop and phone widths, including 320 × 568. Scroll a tall entrance to
  its bottom, and check that its heading is reachable at the top. Send must fit
  beside the text box. The relationship stages should wrap within the header.
- Fold the story box and switch looks. Check that the scene still leaves room
  for the dialogue box and that keyboard focus remains visible.

## Live frontend integration checks

Use a mock Spindle frontend context or a development Lumiverse instance with a
test chat. Supply a state message containing a date session, a rulebook `look`
and a scene with two lines. Disable date image generation for this check.

1. Select Interests, scroll the topics down, and send the same state again with
   a newer revision. The menu should keep its position. Repeat for a scrollable
   battle command pane and the date's status pane.
2. Send settings with each `look` override. The stage should change immediately;
   `rulebook` should restore the state message's look.
3. Focus a topic and press Enter or Space while another dialogue line is
   available. The frontend should send the topic action. The story should not
   consume that keypress. Clicking the story still advances its lines.
4. Type a line and press Enter. Supply a new scene from the mock backend. The
   reply should appear in the persistent story box without reloading the page.
5. Supply a picture and each `imageFit` value from Cue. The rendered image should
   retain that fit after a state push or a look change.

The tall entrance previously centered overflowing content above the scroll
area. The footer's text box kept its intrinsic width and displaced Send. A
later relationship stage exposed a header that could not wrap. These scenarios
exercise the fixes directly. Scroll restoration previously named removed panes,
and the global story hotkey intercepted focused buttons.

## Automated checks

```sh
bun test src/backend/settings.test.ts src/engine/games.test.ts src/frontend/stage.test.ts
bun run verify
bun run build
```

Settings tests cover migration, precedence, an unrelated durable save and
returning to the rulebook's look. Engine tests cover the old rulebook spelling
and the new field's precedence. Stage tests exercise entrances, battle and
dating controls, safe narration and Cue image alignment. The build refreshes
the distributable extension bundles.
