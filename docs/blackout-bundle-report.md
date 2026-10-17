# Blackout bundle report

## Slice 1: United States scope

Status: complete in commit `d3db876`.

- `assets/us-states.topo.json`: 107,056 bytes, 50 state keys, District of Columbia excluded.
- Shared country geometry decoding, name resolution, hit testing, framing, and mask filling also resolve state keys without adding states to Passport country data.
- The picker places United States immediately after Full World.
- The 390px harness `shots/passport/bo-us-shot.mjs` verified the picker order, state prompt and hit, state fill, miss outline, results, and an unaffected Full World start.
- Screenshots: `shots/blackout/us-1-home.png` through `shots/blackout/us-7-world.png`.

## Slice 2: percent of land cleared

Status: complete.

Commit note: the slice 2 commit could not be created because this sandbox exposes `.git` as read-only and Git could not create `.git/index.lock`. The complete slice remains in the working tree for the orchestrator to bank.

- `assets/land-areas.json`: 7,354 bytes, with exactly 202 country keys and 50 state keys.
- `build/make-land-areas.mjs` computes spherical Chamberlain-Duquette polygon areas from the two shipped topology assets. Rebuilding produced an identical asset hash.
- The area asset loads on the same lazy path as the outline assets. Blackout remains disabled until state geometry and land areas are ready, which prevents an early correct tap from being omitted from the running total.
- The Blackout HUD and results title show one-decimal land-cleared progress. Other mode text and Blackout share text are unchanged.

| place | measured km2 | reference km2 | delta |
|---|---:|---:|---:|
| Russia | 16,858,259 | 17,098,242 | -1.4% |
| France, including overseas regions and collectivities | 657,302 | 643,801 | 2.1% |
| Texas | 685,892 | 695,662 | -1.4% |
| California | 409,240 | 423,967 | -3.5% |

Verification:

- All 252 topology keys have a finite positive area, with no missing or extra area keys.
- `node --check` passed for the build script and every touched JavaScript module.
- The 390px harness `shots/passport/blackout-bundle-shot.mjs` contains assertions for picker order, Texas at 99.8% versus Rhode Island at 0.2% in a two-state harness-only scope, and results-screen continuity.
- The new headless run could not launch Chromium in this sandbox. Chromium exited in crashpad startup after `setsockopt: Operation not permitted`. No slice 2 screenshots were produced here. This is recorded as unverified rather than inferred from the older slice 1 run.

## Slice 3: best clear time per scope

Status: complete in the working tree.

- Timing starts immediately before the first prompt and is captured on the final correct tap, so time spent on the reveal or results transition is excluded.
- Only the completion path calls the timer recorder. It writes one JSON object at the exact key `where-on-earth-blackout-times-v1`, mapping scope IDs to integer seconds through `safeSetItem`.
- Picker rows retain the best-count copy and append `Best clear m:ss` or `Best clear h:mm:ss` when a local time exists.
- A completed results screen shows `Cleared in m:ss - new best` or `Cleared in m:ss - Best m:ss`. Incomplete results do not show timing.
- The picker now uses each scope's unit label, so the United States row correctly says states rather than countries.

Verification:

- `node --check` passed for all touched JavaScript files.
- The 390px harness seeds a 9:41 World best and asserts the picker copy, then completes a harness-only two-state scope, asserts the stored numeric seconds, and asserts the new-best results copy. This headless check remains unexecuted because Chromium cannot start under the current sandbox restriction recorded in slice 2.
- Planned screenshot: `shots/blackout/bundle-3-clear-time-result.png`. It was not produced in this sandbox.

Commit note: a slice 3 commit was attempted after verification, but `.git` remains read-only in this sandbox. The orchestrator must bank this slice from the working tree.

## Slice 4: found-area fill tone

Status: complete in the working tree.

- Ported only the approved prototype's Blackout tone behavior into the current shader: reuse the mask value, blend the classic land fill 0.55 toward the sampled satellite ocean tone, and keep the prototype's atmospheric-rim balance across the masked area.
- The coast-2 `uLegFadeOn` and `uOceanFlat` uniforms and all of their current calculations remain in place.
- With `uBlackoutMix` at zero, non-Blackout modes follow the same shader math as before. With `uSatMix` at zero, classic mode also follows the same output as before.

Prototype comparison at 390 by 844, Europe with 18 of 49 countries found:

Before, found countries use the brighter classic land fill:

![Before found-area tone](../../shots/blackout-ocean/globe-current.png)

After, found countries sit beside the satellite ocean at the approved darker tone:

![After found-area tone](../../shots/blackout-ocean/globe-between2.png)

The source images are the approved prototype renders at `/home/hatch/workspace/map-game/shots/blackout-ocean/globe-current.png` and `globe-between2.png`. Both are 390 by 844 PNGs. I visually inspected both. A fresh post-port render of this clone was not possible because Chromium cannot launch in the current sandbox, so the final current-tree render remains explicitly unverified.

Verification:

- The shader diff against slice 3 contains only the Blackout mask reuse, ocean-tone blend, and corresponding atmospheric-rim expression.
- `node --check src/globe/surface.js` passed.
- `git diff --check` passed.

Commit note: `.git` remains read-only in this sandbox, so the orchestrator must bank slice 4 from the completed working tree.

## Orchestrator verification and banking notes (2026-10-17)

- All bundle harness assertions pass in the orchestrator's environment
  (shots/passport/blackout-bundle-shot.mjs run 2026-10-17). Three of the
  harness's own expectations were wrong, not the product: it waited for
  the Blackout button to be visible before opening the Survival hub
  (fixed to an attached-state wait; the click still asserts enabled and
  visible), and its Rhode Island arithmetic assumed a wrong area.
  Against the shipped land-areas.json (Texas 685,892 km2, Rhode Island
  2,816 km2) the correct expectations are Texas 99.6% and Rhode Island
  0.4%, which is exactly what the product displays in the HUD and on the
  results screen. The report text above quoting 99.8% and 0.2% is
  superseded by this note. The run's only browser error was the known
  benign 404 for /assets/version.txt, a file deploy.sh generates.
- Slice 4 was verified visually from this tree (Europe scope, 10 countries
  filled, 390 by 844): found countries render in the darker ocean-matched
  tone, visibly darker than the pre-bundle classic fill in the control
  render of the same view, matching the approved prototype's direction.
- Slices 2 and 3 are banked together in one commit because they share
  src/modes/blackout.js; slice 4 is banked separately (src/globe/surface.js).
