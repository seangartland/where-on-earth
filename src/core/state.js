// ---------------------------------------------------------------------------
// Cross-cutting game state (refactor Phase 5). Every value here used to be a
// module-scope variable in main.js that several sections read and wrote; now
// the globe, the round screen, the modes' hosts and main.js all share this one
// object. State that only one module uses stays in that module.
// ---------------------------------------------------------------------------
import { AUTO_SPIN } from './config.js';

export const state = {
  // View: desktop-globe orientation (yaw/pitch), spin, and camera distance.
  // yaw and pitch are set at boot by the view section (globe/pin.js).
  yaw: 0,
  pitch: 0,
  vYaw: 0.75,
  vPitch: 0,
  dist: 6,
  targetDist: 3,
  revealView: null,
  autoSpin: AUTO_SPIN,
  fitDist: 3,
  maxDist: 4.5,
  viewW: 1,
  viewH: 1,
  lastInteraction: -1,
  elapsed: 0,

  // Game: the current screen or phase, the location list, today's daily.
  gameMode: 'start',
  locations: [],
  dailyPins: {},
  daily: null,
  selected: [],
  pendingGuess: null, // { lat, lng } of the placed, unconfirmed pin
  activePin: -1,
  revealViewPreference: 'flyover',
  passport: { visits: {}, order: [], meta: {} },

  // Overlay screens built after boot; hideScreens() hides whichever exist.
  statsScreenEl: null, // set once the stats overlay is built
  settingsScreenEl: null, // set once the settings overlay is built
  passportScreenEl: null, // set once the passport page is built
  collectionsScreenEl: null, // set once the collections page is built
};
