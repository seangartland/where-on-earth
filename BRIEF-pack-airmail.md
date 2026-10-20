# Brief: Airmail restyle of the sealed postcard pack (wrapper only)

Sean picked Option A (Airmail) from the wrapper mockups on 2026-10-19 and
ordered the build. The visual spec is Option A in
~/workspace/map-game/shots/pack-wrapper-mock.html (rendered at 390px,
screenshot pack-wrapper-mock.png beside it). Translate that art
faithfully into the live pack code. This brief covers the sealed pack
ONLY; the postcard surfaces (grid, peek, modal) are a separate later
decision and are out of scope here.

## What changes

Files: src/modes/pack.js (initPack markup) and src/styles/game.css
(.pack-sealed* rules). Art direction, from the mockup:

- The packet becomes cream airmail paper: a red/blue diagonal airmail
  stripe frame around the edge, cream inner panel (#faf3e1 to #f1e6cb).
- Top strip stays the tear strip, as a paper seal: cream crimp texture,
  RED dashed tear line at its bottom (rgba(200,67,60,.65)).
- Face gains, over the cream panel: a small postage stamp top-right
  (perforated dashed edge, tiny landscape scene: sky, sun, mountains,
  sea, drawn as inline SVG), a circular postmark overlapping it
  ("DAILY MAIL", slate ink, slightly rotated), and a "PAR AVION · BY AIR
  MAIL" chip (PAR AVION in red, rest in navy #2c4a7c).
- Label texts are byte-identical to today: "Daily postcard pack",
  "3 postcards inside", "Swipe all the way across to tear it open".
  Name in navy #22355c; sub and hint in the mockup's slate and warm
  gray tones.
- Bottom crimp stays, in the paper tones from the mockup.

## Hard constraints (mechanics are not part of this restyle)

- Geometry unchanged: width min(200px, 62vw), aspect-ratio 3 / 4.1,
  strip 30px, crimp 26px, face inset 30px/26px.
- Tear system untouched in behavior: the --tear clip on the strip, the
  flap, the cut line, completion at maxProgress >= 0.85 with >= 40px
  travel, spring-back, whole-screen swipe tracking, tap does nothing,
  Enter/Space tears, audio.tear(), the 12ms vibrate, session-scoped
  tornDate, reduced-motion behavior, the .tearing transitions.
- No other surfaces, no copy changes anywhere else, no new localStorage
  keys, no data changes. Do not touch the cards, slots, or opening
  choreography; only how the sealed packet looks.
- Keep the stacked-pack offset shadow idea if it still reads on paper;
  in paper tones (the mockup shows pale stacked edges). If it fights the
  airmail frame, simplify to a single soft drop shadow and note it.

## Verify before you finish

- node --check --input-type=module on src/modes/pack.js.
- The existing harness ~/workspace/map-game/shots/pack-ritual-check.mjs
  passes (it drives the real tear, including the off-pack swipe start
  and the clue hold).
- Screenshot the sealed pack at 390px and eyeball it against the mockup:
  stripe frame even, stamp and postmark placed as mocked, tear line red
  dashed at the strip's bottom, no text overflow.
- Leave everything uncommitted. Write a short report to
  docs/pack-airmail-report.md: what changed, the harness result, and any
  deliberate deviation from the mockup (expected: at most the stacked
  shadow simplification above).
