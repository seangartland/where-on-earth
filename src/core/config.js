// ---------------------------------------------------------------------------
// Constants shared across the app (refactor Phase 5): globe view and input
// tuning, storage keys, round weights, and the accuracy tiers that drive the
// flyover and postcard earning. Moved out of main.js unchanged.
// ---------------------------------------------------------------------------
export const DEG = Math.PI / 180;
export const FOV = 36;
export const ATMO_RADIUS = 1.17;
// Player zoom floor: ~190 km above the surface, ~0.17 km per css px on a
// 390 px phone, enough to see Robben Island or Alcatraz as a shape.
export const MIN_DIST = 1.24;
// Scripted cameras (bullseye snap, flight, reveal framing) keep the closest
// framing they were tuned at; only the player's own zoom goes deeper.
export const SCENE_MIN_DIST = 1.32;
export const PITCH_LIMIT = 75 * DEG; // look down at the poles, never flip north-down
export const FRICTION = 2.1; // velocity decay per second (exponential)
export const MAX_SPIN = 7; // rad/s
export const TAP_MAX_MS = 350;
export const GUESS_TAP_MAX_MS = 700; // a careful placement tap may linger longer than a review tap
export const LOCK_ARM_MS = 350; // the Lock in button ignores taps this soon after it appears
export const TAP_MAX_MOVE = 8; // css px
export const AUTO_SPIN = 0.045; // rad/s idle drift

// Storage keys. Names and saved-data shapes are a contract with players' phones.
export const STORAGE_VERSION = 1;
export const GAME_KEY = 'where-on-earth-v1';
export const STREAK_KEY = 'where-on-earth-streak-v1';
export const HISTORY_KEY = 'where-on-earth-history-v1';
export const PASSPORT_KEY = 'where-on-earth-passport-v1';
export const MUTE_KEY = 'where-on-earth-muted';
export const EXPEDITION_KEY = 'where-on-earth-expedition-v1';
export const REVEAL_VIEW_KEY = 'where-on-earth-reveal-view';
export const VERSIONED_KEYS = new Set([GAME_KEY, STREAK_KEY, HISTORY_KEY, PASSPORT_KEY, MUTE_KEY, EXPEDITION_KEY]);
export const WEIGHTS = [1, 1, 2, 3, 3];

// Flyover accuracy tiers (exact, unrounded km).
export const PINPOINT_KM = 5;
export const BULLSEYE_KM = 25;
export const NEAR_KM = 150;
export const BLOWOUT_KM = 8000;

export function flyoverTier(km) {
  if (km < PINPOINT_KM) return 'pinpoint';
  if (km < BULLSEYE_KM) return 'bullseye';
  if (km < NEAR_KM) return 'near';
  if (km > BLOWOUT_KM) return 'blowout';
  return 'normal';
}

// Passport earn tiers, stored per location as meta.e.
export const EARN_NEAR = 1; // < NEAR_KM: full-colour postcard
export const EARN_BULLSEYE = 2; // < BULLSEYE_KM: gold Bullseye badge
export const EARN_PINPOINT = 3; // < PINPOINT_KM: gold Pinpoint badge
export const EARN_NAMES = ['seen', 'near', 'bullseye', 'pinpoint'];
