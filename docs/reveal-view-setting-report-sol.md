# Reveal view setting report

## Outcome

Added a persisted **Reveal view** setting above **Reset all data** with two options:

- **Flyover** — default; retains the existing animated reveal.
- **North-up** — keeps the current globe pitch, changes only yaw (rotation around the polar axis), adjusts viewing distance to frame the route, and shows the complete route and both pins without entering either flyover camera animation.

No deployment was performed. All visual claims below are code-inspected; this sandbox was not used to capture screenshots.

## Investigation findings

### Existing flyover camera behavior

`revealGuess` classifies the exact distance and sends bullseye/pinpoint guesses to `beginBullseyeReveal`; all other animated guesses go to `beginTravelReveal`.

The travel reveal:

1. Builds the lifted great-circle route but initially hides it and the answer pin.
2. Changes the camera near plane from `0.05` to `0.005` for the low camera.
3. Dives from the orbit camera toward the guess, interpolating camera distance to the flight altitude.
4. Travels along the great-circle arc with `placeTravelCamera`, which directly updates camera position and quaternion. The target is the route head and the route tangent is screen-up. Near the answer, the camera closes its trailing angle and descends. Blowout reveals also widen the FOV by up to 14 degrees.
5. Draws the trail progressively with `trimTravelLine`, moves the travel-head marker, and advances the traveling distance label.
6. Blends back to orbit above the answer, drops the answer pin, then calls `startPullback`.
7. `startPullback` restores the near plane and FOV, calls `frameRevealPoints`, and resolves a final view with `homeRevealView`. `updatePullback` eases yaw, pitch, and distance toward that view. `homeRevealView` tries `HOME_PITCH` first (20 degrees) and steps toward the solved pitch only when necessary to fit both endpoints.

The bullseye reveal does not travel along the arc, but it is still a camera animation: it calls `followTravelPoint`, snap-zooms to about `1.42`, slowly pushes closer, drops the gold answer pin, renders the shockwave and accuracy stamp, then uses the same pullback to the final north-up/home framing.

### Existing reveal drawing and UI behavior

- `buildAnswerPath` creates the shortest great-circle path, lifted slightly away from the surface except at its endpoints.
- The travel path progressively exposes `answerLine`; the static reveal exposes the complete line. Bullseye exposes its complete tiny line before pullback.
- The active guess pin and correct-answer pin are the two endpoint markers. Bullseye/pinpoint uses a gold correct pin.
- `showCountryOutline` reveals the answer country.
- `startRevealBeat` shows the score pill, optionally places the distance label on the route, waits 1.5 seconds, then opens the reveal sheet. It also coordinates the postcard settling time.
- The answer landing triggers tier sounds and starts the postcard animation; the final reveal sheet retains the same name, score, distance, fact, thumbnail, next action, and mode-specific status prepared by `revealGuess`.

### Reveal entry points and modes

There is one production dispatch to the two animated entry functions, both inside `revealGuess`:

- `beginBullseyeReveal(...)` for bullseye and pinpoint tiers.
- `beginTravelReveal(...)` for every other animated tier.

All non-border guess sources converge on `revealGuess`:

- Daily and **Survival: Distance** use the shared `pin` event listener.
- Expedition and Endless guesses use that same listener and `revealGuess` state dispatch.
- The test/debug `window.__game.guess` helper also calls `revealGuess` for non-border modes.
- Finished daily restoration calls `revealGuess(savedGuess, true)` from `startGame`. Because `restoring` makes `animate` false, it uses the static branch rather than either animated entry function.

**Survival: Tap the Country** is intentionally separate: the `pin` listener routes it to `revealBorders`, whose reveal was already static and never calls either flyover entry function. Its behavior is unchanged.

### Settings and persistence pattern

The settings screen is created in `src/main.js` as `.settings-screen`, with `.settings-main` previously containing only **Reset all data**. Its matching card, close, reset, confirmation, and action styles live together in `src/style.css`.

Simple player UI preferences already use raw string `localStorage` keys, validate the read against an allowed set, report read failures with `storageError`, and write through `safeSetItem` (for example passport view and collection sort). The new `where-on-earth-reveal-view` preference follows that pattern. Missing or invalid data defaults to `flyover`. **Reset all data** already removes every `where-on-earth-` key, so it also resets this preference.

## Implementation trace

### Flyover selected

Both `beginTravelReveal` and `beginBullseyeReveal` first inspect `revealViewPreference`. When it is `flyover`, execution falls through to the pre-existing function bodies. The restoration branch uses the pre-existing `placeRevealVisual` path. Thus travel, bullseye, and restoration retain their previous camera and drawing behavior.

### North-up selected

Both animated entry functions return immediately into `beginNorthUpReveal` before any of their camera setup runs. That function:

1. Reuses `buildAnswerPath` for the existing arc geometry.
2. Drops the guess and answer pins and exposes the complete `answerLine`.
3. Preserves bullseye/pinpoint’s gold answer pin.
4. Calls `frameNorthUpRevealPoints`, which computes framing distance and midpoint yaw, then sets `revealView` to `{ yaw: targetYaw, pitch }`. The `pitch` value is the current value, unchanged.
5. Shows the country outline, plays the same tier landing sounds, starts the postcard landing, and calls the same `startRevealBeat` used by the flyover end state.

The restoration branch is separately gated because it does not invoke either animated entry function. With North-up selected it builds the same path, drops both pins, shows the full line and outline, and calls the same yaw-only framing helper before immediately showing the saved reveal sheet.

### Why no flyover camera code runs in North-up

For animated reveals, the preference guard returns before creation of `travelAnimation`. Consequently `updateTravelAnimation`, `updateBullseyeAnimation`, `flightPose`, `placeTravelCamera`, `followTravelPoint`, `startPullback`, and `updatePullback` have no North-up animation state to process. The North-up helper does not call `setCameraNear`, `setCameraFov`, `frameRevealPoints`, or `homeRevealView`; it assigns no new pitch and never writes camera position or quaternion directly.

## Before/after camera behavior by path

| Reveal path | Before | After with Flyover | After with North-up |
| --- | --- | --- | --- |
| Normal / near / blowout | Dive, low first-person travel along route, arrival blend, pitch/yaw/distance pullback | Unchanged | Current pitch retained; yaw rotates toward route midpoint; distance adjusts; no dive, low camera, route travel, FOV change, or pullback |
| Bullseye / pinpoint | Snap-zoom and push-in, gold pin/shockwave/stamp, pitch/yaw/distance pullback | Unchanged | Current pitch retained; minimal midpoint yaw for near-coincident endpoints; distance adjusts; no snap-zoom, push-in, or pullback |
| Restored finished daily | Static full route and pins using `frameRevealPoints` | Unchanged | Static full route and pins using yaw-only framing; sheet appears immediately as before |
| Survival: Tap the Country | Separate static border reveal | Unchanged | Unchanged; this mode never used the first-person flyover |

## Verification

- `node --check --input-type=module < src/main.js` — passes.
- `git diff --check` — passes.
- Code inspection confirms both animated reveal entry functions are preference-gated before their former bodies.
- Code inspection confirms the non-animated/restoration branch is separately preference-gated.
- Code inspection confirms North-up creates no `travelAnimation`, preserves `pitch`, and therefore cannot enter the per-frame flyover or bullseye camera update code.
- Code-inspected styling: the new control reuses the settings card’s type scale, cyan translucent borders/backgrounds, rounded corners, touch sizing, pressed state, and focus treatment; no inline styles were added.
