// Imagery-ownership state machine for the production page lifecycle
// (BRIEF-page-lifecycle.md requirement 1: exclusive imagery ownership).
// Pure, dependency-free module: no DOM, no network, no THREE. page-render.js
// drives the state transitions; surface.js reads pageLifecycleBusy() to
// decide whether the legacy inset driver may run this frame, and registers
// its own abort routine via registerLegacyAbort() so this module never has
// to import surface.js back (the same import-cycle constraint page-render.js
// already documents).
//
// States: 'idle' (legacy owns imagery, exactly current behavior) ->
// 'preparing' (a page round is resolving/fetching; legacy must not issue new
// work, and whatever it had in flight is abandoned right away) -> 'active'
// (a page round is resident and rendering) -> back to 'idle' on fallback,
// release, or failure.
let state = 'idle';
let legacyAbort = null;

export function registerLegacyAbort(fn) {
  legacyAbort = fn;
}

// Called once, synchronously, at the moment a round commits to the page
// path (before any fetch/decode/upload for that round begins): abandons any
// legacy inset work already in flight so it can never land as visible tile
// work once the page round is ready, then claims ownership.
export function beginPagePreparation() {
  legacyAbort?.();
  state = 'preparing';
}

export function markPageRoundActive() {
  state = 'active';
}

// Round-boundary fallback, release, or flag-off: ownership returns to the
// legacy driver.
export function endPageLifecycle() {
  state = 'idle';
}

export function pageLifecycleState() {
  return state;
}

export function pageLifecycleBusy() {
  return state !== 'idle';
}
