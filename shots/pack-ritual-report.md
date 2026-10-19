# Pack opening ritual: build report (2026-10-18, Wonder in-session, Sean's "at your discretion" go)

Implements review items 1-4 (shots/pack-opening-review.md §4). Item 5's
in-round stack was cut by my call: the round header already carries "Card N
of 3" and the clue as the prompt, and the stack risks the 390px header fit.

- Sealed pack (fresh packs only, session-scoped): a gold-outlined wrapper
  with a dashed tear strip. Swipe across the top drives the flap via a
  --tear progress var (threshold 65px of travel), a plain tap tears too, a
  tap mid-tear finishes instantly, Enter/Space works, and reduced motion
  skips straight to open. A synthesized paper-rip sound (audio.tear:
  bandpassed noise sweep) plus a 12ms vibration. Once torn it never
  re-seals this session; mid-pack and done states never show it.
- Flip to clue, any order: unplayed slots are face-down cards (? medallion
  back, no rarity tell of any kind). Tap flips in place (~330ms) to the
  clue face (flag, name, clue line; never the photo) with the existing
  tick sound and an 8ms vibration, then the round starts for that slot.
  The draw and per-slot saving are untouched, so order is presentation
  only. The old "Open card N" button is gone from the fresh/mid-pack
  states (cards are the controls now); it remains for the stale and done
  states.
- Stamp-in on return: packRecordGuess marks the landing slot; on return
  the resolved postcard animates in large and rotated, settling straight,
  with the landing thump for a color earn (chime on top for bullseye or
  pinpoint, 12ms vibration) and the quieter tick for a black and white
  visit. Never replays (the mark is consumed by the render).
- Safety pattern worth reusing: the deal-in and stamp-in animations run
  through element.animate with a setTimeout that cancels them back to the
  natural visible state. A CSS keyframe version froze at opacity 0 in the
  headless harness (its compositor stalls under the game's overlay
  screens); a timer cancel cannot strand a card invisible.

Eligibility posture unchanged, restated for the record: the pack earns
color inside 150 km, a farther guess is a black and white visit, upgrades
happen when an earning surface lands closer later, all through the
existing recordVisit semantics. No earning rule moved in this build.

Verification: full suite green; headless ritual run
(shots/pack-ritual-check.mjs) walks sealed -> swipe tear -> three
face-down cards -> chosen-order flip (card 2) -> perfect guess -> return
with one stamped visible postcard and two face-down cards, zero page
errors. Screenshots: pack-sealed.png, pack-facedown.png, pack-stamped.png
(the stamped card's photo is the harness placeholder image, not a data
fault).
