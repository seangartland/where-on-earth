# Airmail pack wrapper report

Changed only the sealed-pack markup and `.pack-sealed*` styling. The wrapper
now has the cream airmail stripe frame and paper panel, paper tear strip and
bottom crimp, plus the stamp landscape, postmark, and airmail chip. The three
existing player-facing pack strings are unchanged. Tear mechanics and opening
choreography were not changed.

Verification:

- `node --check --input-type=module < src/modes/pack.js` passed.
- `git diff --check` passed.
- The requested `pack-ritual-check.mjs` could not run in this environment:
  Chromium exited before page creation because sandbox policy denied crashpad's
  socket setup (`setsockopt: Operation not permitted`). Retrying with crashpad
  disabled produced the same launcher failure, so no fresh 390px live-pack
  screenshot could be captured here.

There are no deliberate visual deviations from the Airmail mockup. The pale
stacked paper-edge shadow was retained. The required 30px tear strip, 26px
crimp, and 30px/26px face geometry remain unchanged.
