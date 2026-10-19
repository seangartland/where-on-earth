import * as THREE from 'three';
import { initPvpApi } from './pvp/api.js';
import { initPvpHome, pvpLinkInvite, pvpLinkIsGroup, showPvpHome } from './pvp/home.js';
import { initPvpH2h, openPvpJoin } from './pvp/h2h.js';
import { initPvpGroup, openPvpGroupJoin } from './pvp/group.js';
import { initPvpPlay, pvpLeave, pvpSubmit, pvpNext, pvpRenderVs } from './pvp/play.js';
import {
  SCENE_MIN_DIST, PITCH_LIMIT, FRICTION, AUTO_SPIN, RESET_DAILY, STREAK_KEY, HISTORY_KEY, EXPEDITION_KEY,
  REVEAL_VIEW_KEY, WEIGHTS, EARN_NEAR, EARN_BULLSEYE, EARN_PINPOINT, EARN_NAMES, ACCOUNTS_ENABLED,
} from './core/config.js';
import { clamp, damp, smoothstep, distanceKm } from './core/math.js';
import { storageError, safeSetItem, migrateStorage, readJSON, writeJSON } from './core/storage.js';
import { audio, initAudio } from './core/audio.js';
import { setThumb, createHomeButton, showConfirmModal, initConfirmModal } from './core/dom.js';
import { localDateKey, COUNTRY_FLAGS, flagForLocation, closestGuessLines, formatGameShare, countryKey } from './core/format.js';
import { state } from './core/state.js';
import {
  ANSWER_COLOR, latLngToVec3, setGlobeQuaternion, canvas, hud, renderer, scene, camera, globe, stars, initScene, initAtmosphere,
  pointers, radPerPx,
} from './globe/scene.js';
import {
  globeMat, initGlobeSurface, initImagery, initAssets, updateSatellite, updateLandReveal, outlineMaterials, outlineMeshes,
  locationsP, pinsP, loadJobDone, renderLoad, getJSON, unwrap, addToPath, ISLAND_BLOB_TEXELS,
} from './globe/surface.js';
import {
  initOutlines, countryData, countryBands, countriesP, countryBandsP, countryGeom, bordersHit, showCountryOutline,
  updateCountryOutline, countryOutline, regionOutline, stateData, statesP, hasKey, keyName, landAreas, landAreasP,
} from './globe/outlines.js';
import {
  initPin, Pin, makeBadgeTexture, pins, correctPin, pinch, applyDrag, sphereHit, nearAngle,
} from './globe/pin.js';
import {
  initReveal, answerLine, answerLineMaterial, peekSlot, timeScale, clearReveal, buildAnswerPath, placeRevealVisual, frameRevealPoints,
  frameNorthUpRevealPoints, showRevealSheet, showLineLabel, startRevealBeat, collapseRoundHeader, REVEAL_HEADER_H,
  beginBullseyeReveal, beginTravelReveal, whenPostcardDone, travelView, routeAxis, routeRadius, safeStrip, applyCameraNear,
  updateTravelAnimation, travelPinScale, updateLineLabel,
} from './globe/reveal.js';
import {
  gameEls, pvp, pvpScreenEls, initRound, setGuessHint, showLockButton, clearPendingGuess, nearLockButton, nearTopUI,
  hideScreens, showRound, revealGuess, nextRound, currentItem, revealThumbCurrent, pvpRevealTimeout,
} from './game/round.js';
import { scoreGuess } from './game/scoring.js';
import { shareResult } from './game/share.js';
import {
  survival, initSurvival, startSurvival, survivalRoundHeader, survivalRecordGuess, survivalRevealCard, survivalNext,
} from './modes/survival.js';
import {
  borders, bordersEntry, initTapCountry, startBorders, revealBorders, bordersBest, bordersShareText, syncBordersEntry,
  bordersRoundHeader, bordersClue, bordersNext,
} from './modes/tap-country.js';
import {
  blackoutEntry, blackoutPicker, initBlackout, syncBlackoutMask, resetBlackout, saveBlackoutBest, blackoutFill, blackoutComplete,
  blackoutProgressText, blackoutBestSummary, showBlackoutGameOver, blackoutShareText, showBlackoutPicker,
  startBlackoutTimer, completeBlackoutTimer,
} from './modes/blackout.js';
import {
  expeditionRun, expeditionPicker, initExpeditions, expeditionsLoaded, updateExpeditionEntry, completeExpeditionRound,
  expeditionRoundHeader, expeditionRevealCard, expeditionNext, weeklyRoutesLoaded,
} from './modes/expeditions.js';
import { endless, initEndless, endlessNext, endlessRoundHeader } from './modes/endless.js';
import { initLandmarks, landmarkPool } from './modes/landmarks.js';
import {
  trivia, initTrivia, startTrivia, triviaBankLoaded, triviaRoundHeader, triviaRecordGuess, triviaNext, triviaShareText, triviaHubLine,
} from './modes/trivia.js';
import { pack, initPack, syncPackButton, packRoundHeader, packRecordGuess, packIsLastCard, packNext } from './modes/pack.js';
import { AUDIT_MODE, initAudit, auditFlagsLocationsLoaded, addAuditFlagButton, mountAuditBanner } from './modes/audit.js';
import {
  initDailyGame, initDailyCountdown, initReview, loadDaily, saveDaily, streakText, syncDailyButton, startGame, runHaul,
  showRunHaul, showPostcardSummary, hideReviewVisuals, pickReviewRound, updateReview, reviewEls,
} from './modes/daily-game.js';
import { initStats, recordHistory } from './meta/stats.js';
import {
  initPassportStore, readPassport, recordVisit, applyCardTier, isVisited, tierOf, continentOf, passportLocation,
  findLocation, buildPassportDots, resetLocationIndex, passportDots, passportDirty, CONTINENT_ORDER,
} from './meta/passport-store.js';
import {
  initPassportHome, initPassport, syncPassport, passportEntryFor, countryIndex, buildCountryIndex,
  passportEntry, collectionsEntry, bindPostcard, postcardShareText, passportMysterySlot,
} from './meta/passport.js';

if (window.__boot) window.__boot('3D engine loaded');

// URL shortcut: ?reset=daily drops today's saved game (keeps passport, streak
// and history) so the daily is rebuilt from the current locations.json. Runs
// before anything reads storage; the fetch below skips the HTTP cache so a
// stale locations.json can't rebuild the old set.
// Audit mode (retired 2026-10-12, QUARANTINED) and its flag: src/modes/audit.js.
if (RESET_DAILY) {
  try { localStorage.removeItem('where-on-earth-v1'); } catch (error) { console.error('[reset] daily', error); }
  history.replaceState(null, '', location.pathname + location.hash);
}

// ---------------------------------------------------------------------------
// Version check: if the server has a newer version, show a reload banner.
// This handles iOS Safari caching the HTML despite no-cache headers.
// ---------------------------------------------------------------------------
(function checkVersion() {
  const meta = document.querySelector('meta[name="app-version"]');
  const current = meta ? meta.content : 'DEV';
  if (current === 'DEV') return;
  async function check() {
    try {
      const res = await fetch(location.pathname, { cache: 'no-store' });
      const html = await res.text();
      const m = html.match(/<meta name="app-version" content="([^"]+)"/);
      if (m && m[1] !== current) {
        let banner = document.getElementById('update-banner');
        if (!banner) {
          banner = document.createElement('button');
          banner.id = 'update-banner';
          banner.textContent = 'New version available. Tap to reload';
          banner.style.cssText = 'position:fixed;z-index:9999;top:0;left:0;right:0;padding:12px;background:#f5c451;color:#000;font-weight:700;border:0;cursor:pointer;';
          banner.onclick = () => location.reload();
          document.body.appendChild(banner);
        }
      }
    } catch (e) {}
  }
  // Check on visibility change (covers back-nav) and every 5 minutes
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(check, 5 * 60 * 1000);
})();

// The globe (src/globe/), built in the order its sections always ran.
initScene();
initGlobeSurface();
initAtmosphere();
initImagery();
initAssets();

initOutlines();

// Pins and the view's input. The Lock in button and the review's tap target
// live above the globe, so pin.js reaches them through this host, along with
// the reveal and outline line materials its resize() keeps sharp.
const pinHost = {
  showLockButton, setGuessHint, nearLockButton, nearTopUI, pickReviewRound,
  get answerLineMaterial() { return answerLineMaterial; },
  get countryOutline() { return countryOutline; },
  get regionOutline() { return regionOutline; },
};
initPin(pinHost);

// The reveal reaches the round screen only through this host.
const revealHost = { gameEls, currentItem, revealThumbCurrent, clearPendingGuess, hideReviewVisuals, applyCardTier };
initReveal(revealHost);

migrateStorage();

try {
  const savedRevealView = localStorage.getItem(REVEAL_VIEW_KEY);
  if (savedRevealView === 'flyover' || savedRevealView === 'north-up') state.revealViewPreference = savedRevealView;
} catch (error) {
  storageError('Read failed', REVEAL_VIEW_KEY, error);
}

initAudio();

const MUTE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/><path class="waves" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/><path class="slash" d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
const muteButtons = [gameEls.round.querySelector('.round-meta')].map((parent) => {
  const button = document.createElement('button');
  button.className = 'mute-toggle';
  button.innerHTML = MUTE_ICON;
  parent.firstElementChild.after(button); // centred between round and weight
  return button;
});
function syncMuteButtons() {
  for (const button of muteButtons) {
    button.classList.toggle('muted', audio.muted);
    button.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
    button.setAttribute('aria-pressed', String(audio.muted));
  }
}
muteButtons.forEach((button) => button.addEventListener('click', () => {
  audio.unlock();
  audio.setMuted(!audio.muted);
  syncMuteButtons();
}));
syncMuteButtons();

// The shared round screen. The globe, the modes, the Daily's screens and the
// passport store sit outside the game layer, so they reach it through this host.
const roundHost = {
  pins, correctPin, answerLine, peekSlot, latLngToVec3, buildAnswerPath, placeRevealVisual,
  frameRevealPoints, frameNorthUpRevealPoints, showCountryOutline, showLineLabel, showRevealSheet,
  startRevealBeat, collapseRoundHeader, REVEAL_HEADER_H, beginBullseyeReveal, beginTravelReveal,
  whenPostcardDone, clearReveal,
  survival, borders, expeditionRun, endless, expeditionRoundHeader, bordersRoundHeader,
  survivalRoundHeader, endlessRoundHeader, bordersClue, survivalRecordGuess, completeExpeditionRound,
  expeditionRevealCard, survivalRevealCard, bordersNext, survivalNext, expeditionNext, endlessNext,
  revealBorders, pvpRenderVs, pvpNext, pvpSubmit,
  saveDaily, runHaul, showPostcardSummary, recordVisit, applyCardTier, isVisited,
  trivia, triviaRoundHeader, triviaRecordGuess, triviaNext,
  pack, packRoundHeader, packRecordGuess, packIsLastCard, packNext,
  get reviewEls() { return reviewEls; },
};
initRound(roundHost);

// The Daily's screens (src/modes/daily-game.js) reach the globe and the
// passport pages through this host.
const dailyGameHost = {
  applyCardTier, passportEntryFor, bindPostcard, recordHistory, syncPassport, clearReveal, Pin,
  makeBadgeTexture, ANSWER_COLOR, latLngToVec3, routeAxis, routeRadius, globe, camera,
  frameRevealPoints, safeStrip, travelView, nearAngle,
};
initDailyGame(dailyGameHost);

// Next-daily countdown (src/modes/daily-game.js), shown on the results and
// review screens in place of a replay.
initDailyCountdown();

// ---------------------------------------------------------------------------
// Game modes live in src/modes/. They reach main.js only through modeHost:
// the round screen and reveal seams, shared game state, and each other's
// entry points, so no mode module imports main.js. Getters cover state that
// is reassigned, or declared further down this file.
// ---------------------------------------------------------------------------
const modeHost = {
  get gameMode() { return state.gameMode; },
  set gameMode(value) { state.gameMode = value; },
  get locations() { return state.locations; },
  get landmarks() { return state.landmarks; },
  findLocation,
  get countryData() { return countryData; },
  get countryBands() { return countryBands; },
  get countryIndex() { return countryIndex; },
  get stateData() { return stateData; },
  get landAreas() { return landAreas; },
  hasKey,
  keyName,
  get CONTINENT_ORDER() { return CONTINENT_ORDER; },
  get activePin() { return state.activePin; },
  get blackoutEntry() { return blackoutEntry; },
  COUNTRY_FLAGS,
  ISLAND_BLOB_TEXELS,
  REVEAL_HEADER_H,
  gameEls,
  peekSlot,
  pins,
  correctPin,
  answerLine,
  renderer,
  globeMat,
  runHaul,
  countriesP,
  countryBandsP,
  statesP,
  landAreasP,
  survival,
  borders,
  expeditionRun,
  endless,
  EXPEDITION_KEY,
  clamp,
  readJSON,
  writeJSON,
  safeSetItem,
  showRound,
  showRunHaul,
  clearReveal,
  hideScreens,
  goHome,
  createHomeButton,
  formatGameShare,
  closestGuessLines,
  shareResult,
  flagForLocation,
  radPerPx,
  bordersHit,
  setThumb,
  collapseRoundHeader,
  latLngToVec3,
  buildAnswerPath,
  frameRevealPoints,
  showCountryOutline,
  startRevealBeat,
  countryGeom,
  addToPath,
  unwrap,
  startBorders,
  bordersBest,
  bordersShareText,
  resetBlackout,
  startBlackoutTimer,
  completeBlackoutTimer,
  saveBlackoutBest,
  blackoutFill,
  blackoutComplete,
  blackoutProgressText,
  blackoutBestSummary,
  showBlackoutGameOver,
  blackoutShareText,
  startTrivia,
  triviaShareText,
  triviaHubLine,
  passportEntryFor,
  bindPostcard,
  applyCardTier,
  passportMysterySlot,
};

// ---------------------------------------------------------------------------
// Endless mode (QUARANTINED: disabled, kept intact) lives in
// src/modes/endless.js.
// ---------------------------------------------------------------------------
initEndless(modeHost);

function goHome() {
  borders.active = false;
  survival.active = false;
  endless.active = false;
  expeditionRun.active = false;
  trivia.active = false;
  pack.active = false;
  expeditionPicker.hidden = true;
  blackoutPicker.hidden = true;
  pvpLeave();
  window.__pendingEarn = null;
  document.querySelector('.earn-toast')?.remove();
  clearReveal();
  hideScreens();
  state.gameMode = 'start';
  gameEls.start.hidden = false;
  document.body.className = 'game-start';
  window.__canGuess = false;
  state.targetDist = 3;
  syncPassport();
  syncDailyButton();
  syncPackButton();
}

initConfirmModal();

async function confirmGoHome() {
  // Don't confirm if no game is in progress
  if (state.gameMode === 'start') {
    goHome();
    return;
  }
  // PvP: the server clock keeps running in a live round; a reveal is saved.
  if (pvp.active) {
    if (state.gameMode !== 'guess' || await showConfirmModal({
      title: 'Leave this round?',
      message: 'The 20 second timer keeps running. A round you do not lock in scores 0.',
      confirmLabel: 'Leave round',
      cancelLabel: 'Keep playing',
    })) goHome();
    return;
  }
  // Don't confirm if game is complete (on results page); nothing to lose
  if (state.daily.complete || (typeof endless !== 'undefined' && endless.complete)) {
    goHome();
    return;
  }
  // Daily is the default game while no alternate mode is active. Its state is
  // persisted after each round, so returning home does not discard progress.
  // The Daily postcard pack saves each card on reveal, the same way.
  const isDailyGame = pack.active || (!endless.active && !survival.active && !expeditionRun.active && !borders.active && !trivia.active);
  const message = isDailyGame
    ? 'Your progress is saved. You can continue later.'
    : 'Your current game progress will be lost.';
  if (await showConfirmModal({
    title: 'Return to home?',
    message,
    confirmLabel: 'Return home',
    cancelLabel: 'Keep playing',
  })) {
    goHome();
  }
}

// Event delegation: catches all .home-nav-btn clicks, even dynamically added ones.
// Also normalizes the button appearance.
document.addEventListener('click', (e) => {
  const target = e.target instanceof Element ? e.target : e.target?.parentElement;
  const btn = target?.closest?.('.home-nav-btn');
  if (!btn) return;
  e.preventDefault();
  // Results are terminal states: the player has no in-progress run to lose.
  if (btn.classList.contains('finished-home-nav')) {
    goHome();
    return;
  }
  confirmGoHome();
});
document.querySelectorAll('.home-nav-btn').forEach((button) => {
  button.setAttribute('aria-label', 'Go home');
  button.textContent = '×';
});

// Lives inside the clue card, so it never costs the globe a row.
gameEls.header.prepend(createHomeButton());

// ---------------------------------------------------------------------------
// Survival (classic), the shared run-over screen and the Survival hub live in
// src/modes/survival.js.
// ---------------------------------------------------------------------------
initSurvival(modeHost);

// ---------------------------------------------------------------------------
// Survival: Tap the Country (the run, its tap reveal and share text) lives in
// src/modes/tap-country.js.
// ---------------------------------------------------------------------------
initTapCountry(modeHost);

// ---------------------------------------------------------------------------
// Country Blackout (mask canvas, scope picker, results and share text) lives
// in src/modes/blackout.js; the Survival hub's listeners are in survival.js.
// ---------------------------------------------------------------------------
initBlackout(modeHost);

// ---------------------------------------------------------------------------
// The Landmark pool lives in src/modes/landmarks.js; Survival draws from it
// directly since the 2026-10-18 merge.
// ---------------------------------------------------------------------------
initLandmarks(modeHost);

// Trivia clues (the hub's second mode, score-only) lives in src/modes/trivia.js.
initTrivia(modeHost);

// The Daily postcard pack (home row, pack screen, round variant) lives in
// src/modes/pack.js; its saved record in src/meta/pack-store.js.
initPack(modeHost);

// Post-game review (src/modes/daily-game.js): all five rounds on the globe.
initReview();

// ---------------------------------------------------------------------------
// Stats (streaks, averages, the score histogram) lives in src/meta/stats.js.
// It reaches main.js only through statsHost.
// ---------------------------------------------------------------------------
const statsHost = {
  STREAK_KEY,
  HISTORY_KEY,
  WEIGHTS,
  gameEls,
  get daily() { return state.daily; },
  set statsScreenEl(value) { state.statsScreenEl = value; },
  readJSON,
  writeJSON,
  syncPassport,
};
initStats(statsHost);

const settingsEntry = document.createElement('button');
settingsEntry.className = 'settings-entry';
settingsEntry.innerHTML = '⚙️';
settingsEntry.setAttribute('aria-label', 'Settings');
settingsEntry.setAttribute('aria-haspopup', 'dialog');
gameEls.startStreak.after(settingsEntry);

const settingsScreen = document.createElement('section');
settingsScreen.className = 'screen settings-screen';
settingsScreen.hidden = true;
settingsScreen.innerHTML = `
  <div class="settings-card glass" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <button class="settings-close" aria-label="Close settings">×</button>
    <h2 id="settings-title">Settings</h2>
    <div class="settings-main">
      <fieldset class="settings-group">
        <legend>Reveal view</legend>
        <div class="settings-segmented">
          <button type="button" data-reveal-view="flyover" aria-pressed="true">Flyover</button>
          <button type="button" data-reveal-view="north-up" aria-pressed="false">North-up</button>
        </div>
      </fieldset>
      ${ACCOUNTS_ENABLED ? `<div class="settings-account">
        <div><strong>Account</strong><small class="settings-account-detail">Save your progress</small></div>
        <button class="settings-account-action" type="button">Sign in</button>
      </div>` : ''}
      <a class="settings-credits" href="./credits.html">Imagery credits</a>
      <button class="settings-reset" type="button">Reset all data</button>
    </div>
    <div class="settings-confirm" hidden>
      <p>Are you sure? This will erase all progress, postcards, collections, and stats.</p>
      <div class="settings-actions">
        <button class="settings-danger" type="button">Erase everything</button>
        <button class="settings-cancel" type="button">Cancel</button>
      </div>
    </div>
  </div>`;
document.getElementById('game').appendChild(settingsScreen);
state.settingsScreenEl = settingsScreen;

const settingsEls = {
  screen: settingsScreen,
  card: settingsScreen.querySelector('.settings-card'),
  close: settingsScreen.querySelector('.settings-close'),
  main: settingsScreen.querySelector('.settings-main'),
  confirm: settingsScreen.querySelector('.settings-confirm'),
  reset: settingsScreen.querySelector('.settings-reset'),
  danger: settingsScreen.querySelector('.settings-danger'),
  cancel: settingsScreen.querySelector('.settings-cancel'),
  revealViews: [...settingsScreen.querySelectorAll('[data-reveal-view]')],
  account: settingsScreen.querySelector('.settings-account'),
  accountDetail: settingsScreen.querySelector('.settings-account-detail'),
  accountAction: settingsScreen.querySelector('.settings-account-action'),
};

async function syncAccountSetting() {
  if (!ACCOUNTS_ENABLED) return;
  const { readAccountSession } = await import('./account/session.js');
  const session = readAccountSession();
  settingsEls.accountDetail.textContent = session?.sessionToken ? session.emailHint : 'Save your progress';
  settingsEls.accountAction.textContent = session?.sessionToken ? 'Sign out' : 'Sign in';
}

settingsEls.accountAction?.addEventListener('click', async () => {
  const { clearAccountSession, readAccountSession } = await import('./account/session.js');
  const session = readAccountSession();
  if (session?.sessionToken) {
    const { accountApi } = await import('./account/api.js');
    await accountApi('/v1/auth/signout', { method: 'POST', token: session.sessionToken }).catch(() => {});
    clearAccountSession();
    await syncAccountSetting();
    return;
  }
  const { openAccountSheet } = await import('./account/sheet.js');
  openAccountSheet(settingsEls.accountAction);
});
window.addEventListener('account-session-change', syncAccountSetting);

function syncRevealViewSetting() {
  settingsEls.revealViews.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.revealView === state.revealViewPreference));
  });
}

settingsEls.revealViews.forEach((button) => button.addEventListener('click', () => {
  state.revealViewPreference = button.dataset.revealView;
  safeSetItem(REVEAL_VIEW_KEY, state.revealViewPreference);
  syncRevealViewSetting();
}));
syncRevealViewSetting();

function openSettings() {
  settingsEls.main.hidden = false;
  settingsEls.confirm.hidden = true;
  gameEls.start.hidden = true;
  settingsScreen.hidden = false;
  document.body.className = 'game-settings';
  window.__canGuess = false;
  settingsScreen.scrollTop = 0;
  settingsEls.close.focus();
  syncAccountSetting();
}

function closeSettings() {
  settingsEls.main.hidden = false;
  settingsEls.confirm.hidden = true;
  settingsScreen.hidden = true;
  gameEls.start.hidden = false;
  document.body.className = 'game-start';
  settingsEntry.focus();
}

settingsEntry.addEventListener('click', openSettings);
settingsEls.close.addEventListener('click', closeSettings);
settingsScreen.addEventListener('click', (e) => {
  if (e.target === settingsScreen) closeSettings();
});
settingsEls.reset.addEventListener('click', () => {
  if (ACCOUNTS_ENABLED) {
    import('./account/session.js').then(({ isSignedIn }) => {
      const copy = settingsEls.confirm.querySelector('p');
      copy.textContent = `Are you sure? This will erase all progress, postcards, collections, and stats.${isSignedIn() ? ' Your account copy is kept. Sign in again to restore it.' : ''}`;
    });
  }
  settingsEls.main.hidden = true;
  settingsEls.confirm.hidden = false;
});
settingsEls.cancel.addEventListener('click', () => {
  settingsEls.confirm.hidden = true;
  settingsEls.main.hidden = false;
});
settingsEls.danger.addEventListener('click', () => {
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith('where-on-earth-')) localStorage.removeItem(key);
  });
  location.reload();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || settingsScreen.hidden) return;
  if (!settingsEls.confirm.hidden) {
    settingsEls.confirm.hidden = true;
    settingsEls.main.hidden = false;
    return;
  }
  closeSettings();
});

initPassportStore({ globe, latLngToVec3 });

// The start-screen passport summary, the Passport page, Collections and the
// postcard detail live in src/meta/passport.js. They reach main.js only
// through passportHost; the store they read is src/meta/passport-store.js.
const passportHost = {
  AUDIT_MODE,
  CONTINENT_ORDER,
  EARN_NEAR,
  EARN_BULLSEYE,
  EARN_PINPOINT,
  EARN_NAMES,
  gameEls,
  get locations() { return state.locations; },
  get landmarks() { return state.landmarks; },
  findLocation,
  get passport() { return state.passport; },
  get passportDirty() { return passportDirty; },
  set passportScreenEl(value) { state.passportScreenEl = value; },
  set collectionsScreenEl(value) { state.collectionsScreenEl = value; },
  applyCardTier,
  buildPassportDots,
  continentOf,
  countryKey,
  flagForLocation,
  isVisited,
  localDateKey,
  passportLocation,
  landmarkShelf: landmarkPool,
  safeSetItem,
  storageError,
  tierOf,
  addAuditFlagButton,
  mountAuditBanner,
};
initPassportHome(passportHost);

// ---------------------------------------------------------------------------
// Expeditions (picker, progress, the round variant) live in
// src/modes/expeditions.js. Their picker styles, shared with the Blackout
// picker and the Survival hub, stay injected here in their original order.
// ---------------------------------------------------------------------------

const expeditionStyle = document.createElement('style');
expeditionStyle.textContent = `
.expedition-picker { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 18px; background: rgba(2,4,9,.78); backdrop-filter: blur(12px); }
.expedition-picker[hidden] { display: none; }
.expedition-panel { position: relative; width: min(100%, 390px); max-height: calc(100vh - 36px); overflow: auto; box-sizing: border-box; padding: 18px; border: 1px solid rgba(103,232,255,.25); border-radius: 24px; background: rgba(8,16,34,.96); color: #f3f9ff; }
.expedition-panel .home-nav-btn { position: absolute; top: 5px; right: 5px; }
.expedition-panel h2 { margin: 0; font-size: 27px; }
.expedition-panel > p { margin: 6px 0 18px; color: rgba(193,224,250,.68); }
.expedition-list { display: grid; gap: 10px; }
.expedition-choice { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; width: 100%; padding: 13px 14px; border: 1px solid rgba(157,211,255,.18); border-radius: 16px; background: rgba(157,211,255,.07); color: inherit; text-align: left; cursor: pointer; }
.expedition-choice .emoji { font-size: 27px; }
.expedition-choice strong, .expedition-choice small { display: block; }
.expedition-choice small { margin-top: 3px; color: rgba(193,224,250,.62); }
.expedition-choice .badge { color: #ffd166; font-size: 20px; }
.expedition-section { margin: 18px 0 8px; color: rgba(193,224,250,.68); font-size: 13px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.expedition-weekly-card { grid-template-columns: 1fr auto; border-color: rgba(255,209,102,.45); background: rgba(255,209,102,.08); }
.expedition-weekly-card:disabled { cursor: default; }
.expedition-choice .weekly-eyebrow { margin: 0 0 3px; color: #ffd166; font-size: 12px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.weekly-dots { display: flex; gap: 6px; margin-top: 10px; }
.weekly-dot { display: grid; place-items: center; width: 28px; height: 28px; box-sizing: border-box; border: 1.5px dashed rgba(157,211,255,.28); border-radius: 50%; color: rgba(193,224,250,.38); font-size: 11px; font-weight: 800; }
.weekly-dot[data-state="played"] { border: 1.5px solid #ffd166; background: #ffd166; color: #1f1708; }
.weekly-dot[data-state="open"] { border: 1.5px solid #67e8ff; color: #67e8ff; }
.weekly-dot[data-today] { box-shadow: 0 0 0 2px rgba(103,232,255,.35); }
.expedition-archive summary { cursor: pointer; }
.expedition-archive-row { box-sizing: border-box; grid-template-columns: 1fr auto; cursor: default; }
body.expedition-mode .round-header, body.expedition-mode #reveal-card { border-color: rgba(255,209,102,.45); background: rgba(31,23,8,.88); }
body.expedition-mode #reveal-card .score-math { display: none; }
body.expedition-mode .round-meta span:first-child { color: #ffd166; }`;
document.head.appendChild(expeditionStyle);

initExpeditions(modeHost);

// ---------------------------------------------------------------------------
// PvP challenges live in src/pvp/ (api, home, h2h, group, play). They reach
// main.js only through pvpHost; the round screen and the PvP timeout reveal
// are src/game/round.js, the reveal itself src/globe/reveal.js.
// ---------------------------------------------------------------------------
const pvpHost = {
  get gameMode() { return state.gameMode; },
  set gameMode(value) { state.gameMode = value; },
  set pendingGuess(value) { state.pendingGuess = value; },
  get locations() { return state.locations; },
  pvp,
  gameEls,
  pvpScreenEls,
  readJSON,
  writeJSON,
  createHomeButton,
  goHome,
  clearReveal,
  hideScreens,
  showRound,
  revealGuess,
  pvpRevealTimeout,
  clearPendingGuess,
  setGuessHint,
  showLockButton,
  shareResult,
  formatGameShare,
};
initPvpApi(pvpHost);
initPvpHome(pvpHost);
initPvpH2h(pvpHost);
initPvpGroup(pvpHost);
initPvpPlay(pvpHost);

const sharedModeOpeners = {
  blackout: showBlackoutPicker,
  survival: () => startSurvival(),
  'tap-country': () => startBorders(),
  landmarks: () => startSurvival(),
  trivia: startTrivia,
  challenge: showPvpHome,
};

function openSharedMode() {
  const params = new URLSearchParams(location.search);
  const areaId = params.get('area');
  if (areaId) {
    const entry = (state.landmarks || []).find((x) => x.id === areaId && x.kind === 'area' && Number(x.extentKm) > 0);
    if (entry) { survival.forced = entry; startSurvival(); return; }
  }
  const mode = params.get('mode');
  const opener = sharedModeOpeners[mode];
  if (!opener) return;
  opener();
  const url = new URL(location.href);
  url.searchParams.delete('mode');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

// ---------------------------------------------------------------------------
// Passport page, Collections, postcard detail and shares: src/meta/passport.js
// ---------------------------------------------------------------------------
initAudit(passportHost);
initPassport(passportHost);

state.passport = readPassport();

Promise.all([locationsP, pinsP]).then(([data, pinsData]) => {
  state.locations = data;
  state.dailyPins = pinsData?.pins || {};
  auditFlagsLocationsLoaded();
  resetLocationIndex();
  buildCountryIndex();
  loadDaily();
  syncPassport();
  syncDailyButton();
  gameEls.startStreak.textContent = streakText();
  gameEls.play.disabled = false;
  gameEls.survivalEntry.disabled = false;
  syncBordersEntry();
  updateExpeditionEntry();
  passportEntry.disabled = false;
  collectionsEntry.disabled = false;
  syncPackButton();
  document.getElementById('pvp-button').disabled = false;
  if (pvpLinkInvite) (pvpLinkIsGroup ? openPvpGroupJoin : openPvpJoin)({ inviteToken: pvpLinkInvite });
  window.__renderAuditFlags?.();
  if (window.__boot) window.__boot('locations loaded');
  loadJobDone('critical', 'locations');
}).catch((err) => {
  gameEls.play.disabled = true;
  gameEls.survivalEntry.disabled = true;
  if (window.__showErr) window.__showErr('LOCATIONS: ' + err.message);
  loadJobDone('critical', 'locations');
});
// Trivia targets come only from the self-contained trivia bank.
const triviaBankP = getJSON('assets/trivia-bank.json').then(triviaBankLoaded).catch((err) => {
  if (window.__showErr) window.__showErr('TRIVIA: ' + err.message);
});
getJSON('assets/expeditions.json').then(expeditionsLoaded).catch((err) => {
  gameEls.expeditionsEntry.disabled = true;
  if (window.__showErr) window.__showErr('EXPEDITIONS: ' + err.message);
});
getJSON('assets/weekly-expeditions.json').then(weeklyRoutesLoaded).catch((err) => {
  if (window.__showErr) window.__showErr('WEEKLY: ' + err.message);
});
// Landmarks: Expeditions stops, the merged Survival pool and the Passport's Landmarks shelf (state.js).
const landmarksP = getJSON('assets/locations-landmarks-sol.json').then((data) => {
  state.landmarks = Array.isArray(data) ? data : [];
  updateExpeditionEntry();
  syncPackButton();
}).catch((err) => {
  gameEls.expeditionsEntry.disabled = true;
  if (window.__showErr) window.__showErr('LANDMARKS: ' + err.message);
});
Promise.allSettled([locationsP, pinsP, countriesP, countryBandsP, statesP, landAreasP, triviaBankP, landmarksP]).then(openSharedMode);
gameEls.play.disabled = true;
gameEls.survivalEntry.disabled = true;
bordersEntry.disabled = true;
gameEls.expeditionsEntry.disabled = true;
passportEntry.disabled = true;
collectionsEntry.disabled = true;
document.body.classList.add('game-start');
window.__canGuess = false;
window.__game = {
  start: startGame,
  next: nextRound,
  survival: startSurvival,
  survivalAgain: startSurvival,
  borders: startBorders,
  bordersHit,
  guess(lat, lng) {
    if (state.gameMode !== 'guess') throw new Error('A guess is not currently expected');
    state.activePin = (state.activePin + 1) % pins.length;
    pins[state.activePin].drop(latLngToVec3(lat, lng));
    if (borders.active) revealBorders({ lat, lng });
    else if (pvp.active) pvpSubmit({ lat, lng });
    else revealGuess({ lat, lng });
  },
  get state() {
    const item = state.gameMode === 'guess' || state.gameMode === 'reveal' ? currentItem() : null;
    return { mode: state.gameMode, daily: JSON.parse(JSON.stringify(state.daily)), selected: state.selected.map((x) => ({ ...x })), item: item && item.id, survival: { ...survival, item: survival.item && survival.item.id }, borders: { ...borders, bags: undefined } };
  },
  distanceKm,
  scoreGuess,
  postcardShareText,
};

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();

function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  state.elapsed += dt;

  if (pointers.size === 0) {
    if (state.revealView) {
      state.yaw = damp(state.yaw, state.revealView.yaw, state.revealView.lambda || 4.8, dt);
      state.pitch = damp(state.pitch, state.revealView.pitch, state.revealView.lambda || 4.8, dt);
    }
    state.yaw += state.vYaw * dt;
    state.pitch += state.vPitch * dt;
    if (Math.abs(state.pitch) > PITCH_LIMIT) {
      state.pitch = clamp(state.pitch, -PITCH_LIMIT, PITCH_LIMIT);
      state.vPitch = 0;
    }
    const decay = Math.exp(-FRICTION * dt);
    state.vYaw *= decay;
    state.vPitch *= decay;

    // gentle idle drift until a pin is placed; cut on touch, eases back in
    // after a 7 s pause (any fling has long decayed by then)
    const idle = state.lastInteraction < 0 || performance.now() - state.lastInteraction > 7000;
    state.autoSpin = damp(state.autoSpin, idle && state.activePin < 0 && state.gameMode !== 'review' ? AUTO_SPIN : 0, 0.8, dt);
    state.yaw += state.autoSpin * dt;
  }

  // Ease altitude in log space: map scale goes with altitude, so equal
  // ratios take equal time whether zooming in or out, deep or wide.
  // While pinching, fingers drive zoom directly with no damper tail.
  if (pinch) state.dist = state.targetDist;
  else state.dist = 1 + Math.exp(damp(Math.log(state.dist - 1), Math.log(state.targetDist - 1), 9, dt));
  applyCameraNear();
  // Outlines float 0.002 above the globe so they never sink into its facets.
  // Near the ground that lift shows as parallax against the fill and pins, so
  // it shrinks with altitude (floor clears the 160x100 sphere's ~0.0003 sag).
  const outlineLift = clamp((state.dist - 1) * 0.006, 0.0004, 0.002);
  for (const m of outlineMeshes) m.scale.setScalar((1 + outlineLift) / m.userData.radius);
  camera.position.set(0, 0, state.dist);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  if (pointers.size > 0) applyDrag();

  setGlobeQuaternion(globe, state.yaw, state.pitch);
  // parallax: same yaw/pitch model scaled down (a slerp toward the globe
  // quaternion takes the short way round and flips the sky at yaw = 180 deg)
  setGlobeQuaternion(stars, state.yaw * 0.12, state.pitch * 0.12);
  stars.material.uniforms.uTime.value = state.elapsed;

  updateLandReveal(dt);
  // each outline layer fades in on its own clock as it finishes loading
  for (const m of outlineMaterials) {
    if (m.userData.reveal >= 1) continue;
    m.userData.reveal = Math.min(1, m.userData.reveal + dt / 1.1);
    m.opacity = (1 - Math.pow(1 - m.userData.reveal, 3)) * (m.userData.baseOpacity ?? 1);
    if (m.userData.reveal === 1 && (m.userData.baseOpacity ?? 1) >= 1) {
      m.transparent = false; m.needsUpdate = true;
    }
  }
  updateSatellite(dt);
  syncBlackoutMask();
  updateCountryOutline(dt);

  // Keep roughly the same screen footprint, then add a restrained boost in
  // unusually wide reveal framings so the badge/checkmark do not disappear.
  const screenScale = (state.dist - 1) / Math.max(state.fitDist - 1, 0.1);
  const farT = smoothstep(clamp((state.dist - state.fitDist) / Math.max(14 - state.fitDist, 0.1), 0, 1));
  // Below SCENE_MIN_DIST the floor shrinks with altitude: pins hold the screen
  // size they had there instead of ballooning over the coast at deep zoom.
  const pinFloor = 0.22 * Math.min(1, (state.dist - 1) / (SCENE_MIN_DIST - 1));
  const pinScale = clamp(screenScale * (1 + 0.28 * farT), pinFloor, 6);
  // Runs before the pins so they can be sized for this frame's flight camera.
  updateTravelAnimation(dt, pinScale);
  const pinDt = dt * timeScale; // bullseye slow motion
  pins.forEach((p) => p.update(pinDt, state.elapsed, travelPinScale(p, pinScale)));
  correctPin.update(pinDt, state.elapsed, travelPinScale(correctPin, pinScale));
  updateReview(dt, pinScale);
  updateLineLabel();
  passportDots.visible = false; // disabled: no dots on landing page

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

window.__booted = true;
if (window.__boot) window.__boot('ready');
// the boot screen stays up until the land fill is on the globe (revealGlobe)
renderLoad();
window.__audio = audio; // test hook: context state, live whoosh
if (ACCOUNTS_ENABLED) {
  setTimeout(async () => {
    const { isSignedIn } = await import('./account/session.js');
    if (!isSignedIn()) return;
    const { syncAccountProgress } = await import('./account/sync.js');
    syncAccountProgress().catch(() => {});
  }, 0);
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const { readAccountSession } = await import('./account/session.js');
    const session = readAccountSession();
    if (!session?.sessionToken || Date.now() - (session.lastSyncAt || 0) < 300000) return;
    const { syncAccountProgress } = await import('./account/sync.js');
    syncAccountProgress().catch(() => {});
  });
}
// test hook: read the view, or pin it for screenshots
window.__view = {
  globe,
  get yaw() { return state.yaw; },
  get pitch() { return state.pitch; },
  set(y, p) { state.yaw = y; state.pitch = p; state.vYaw = state.vPitch = state.autoSpin = 0; state.lastInteraction = performance.now() + 1e9; },
  get dist() { return state.dist; },
  zoom(d) { state.dist = state.targetDist = d; },
  pick(x, y) { // globe-local point under a screen point
    const h = sphereHit(x, y, new THREE.Vector3());
    return h && h.applyQuaternion(globe.quaternion.clone().invert()).toArray();
  },
  project(l) { // screen position of a globe-local point
    const v = new THREE.Vector3().fromArray(l).applyQuaternion(globe.quaternion).project(camera);
    return [((v.x + 1) / 2) * state.viewW, ((1 - v.y) / 2) * state.viewH];
  },
};
requestAnimationFrame(() => {
  canvas.classList.add('ready');
  hud.classList.add('ready');
  frame();
});
