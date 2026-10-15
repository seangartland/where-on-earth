import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { dailyIds, isLandmark, isPlayableLocation, resolvePinnedIds } from './daily.js';
import { initPvpApi } from './pvp/api.js';
import { initPvpHome, pvpLinkInvite, pvpLinkIsGroup } from './pvp/home.js';
import { initPvpH2h, openPvpJoin } from './pvp/h2h.js';
import { initPvpGroup, openPvpGroupJoin } from './pvp/group.js';
import { initPvpPlay, pvpLeave, pvpSubmit, pvpNext, pvpRenderVs } from './pvp/play.js';
import {
  DEG, MIN_DIST, SCENE_MIN_DIST, PITCH_LIMIT, FRICTION, LOCK_ARM_MS, AUTO_SPIN, RESET_DAILY, GAME_KEY, STREAK_KEY, HISTORY_KEY, PASSPORT_KEY, EXPEDITION_KEY, REVEAL_VIEW_KEY, WEIGHTS,
  flyoverTier, EARN_NEAR, EARN_BULLSEYE, EARN_PINPOINT, EARN_NAMES,
} from './core/config.js';
import { clamp, damp, smoothstep, distanceKm } from './core/math.js';
import { storageError, safeSetItem, migrateStorage, readJSON, writeJSON } from './core/storage.js';
import { audio, initAudio } from './core/audio.js';
import { setThumb, createHomeButton, showConfirmModal, initConfirmModal } from './core/dom.js';
import {
  formatKm, localDateKey, formatDailyDate, COUNTRY_FLAGS, flagForLocation, closestGuessLines, formatGameShare, countryKey,
} from './core/format.js';
import { state } from './core/state.js';
import {
  ANSWER_COLOR, latLngToVec3, setGlobeQuaternion, canvas, hud, renderer, scene, camera, globe, stars, initScene, initAtmosphere,
} from './globe/scene.js';
import {
  globeMat, initGlobeSurface, initImagery, initAssets, updateSatellite, updateLandReveal, outlineMaterials, outlineMeshes,
  locationsP, pinsP, loadJobDone, renderLoad, getJSON, unwrap, addToPath, ISLAND_BLOB_TEXELS,
} from './globe/surface.js';
import {
  initOutlines, countryData, countryBands, countriesP, countryBandsP, countryGeom, bordersHit, showCountryOutline,
  updateCountryOutline,
} from './globe/outlines.js';
import {
  initPin, Pin, makeBadgeTexture, pins, correctPin, pointers, pinch, applyDrag, radPerPx, sphereHit, nearAngle,
} from './globe/pin.js';
import {
  initReveal, answerLine, peekSlot, timeScale, clearReveal, buildAnswerPath, placeRevealVisual, frameRevealPoints,
  frameNorthUpRevealPoints, showRevealSheet, showLineLabel, startRevealBeat, collapseRoundHeader, REVEAL_HEADER_H,
  beginBullseyeReveal, beginTravelReveal, whenPostcardDone, travelView, routeAxis, routeRadius, safeStrip, applyCameraNear,
  updateTravelAnimation, travelPinScale, updateLineLabel,
} from './globe/reveal.js';
import {
  survival, initSurvival, startSurvival, survivalRoundHeader, survivalRecordGuess, survivalRevealCard, survivalNext,
} from './modes/survival.js';
import {
  borders, bordersEntry, initTapCountry, startBorders, revealBorders, bordersBest, bordersShareText, syncBordersEntry,
  bordersRoundHeader, bordersClue, bordersNext,
} from './modes/tap-country.js';
import {
  blackoutEntry, blackoutPicker, initBlackout, syncBlackoutMask, resetBlackout, saveBlackoutBest, blackoutFill, blackoutComplete,
  blackoutProgressText, blackoutBestSummary, showBlackoutGameOver, blackoutShareText,
} from './modes/blackout.js';
import {
  expeditionRun, expeditionPicker, initExpeditions, expeditionsLoaded, updateExpeditionEntry, completeExpeditionRound,
  expeditionRoundHeader, expeditionRevealCard, expeditionNext,
} from './modes/expeditions.js';
import { endless, endlessEls, initEndless, endlessNext, endlessRoundHeader } from './modes/endless.js';
import { AUDIT_MODE, initAudit, auditFlagsLocationsLoaded, addAuditFlagButton, mountAuditBanner } from './modes/audit.js';
import { initStats, recordHistory } from './meta/stats.js';
import {
  initPassportHome, initPassport, syncPassport, passportEntryFor, countryIndex, buildCountryIndex,
  passportEntry, collectionsEntry, openPostcard, postcardShareText,
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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Guessing is two steps: tap the globe to place (or move) the pin, then press
// Lock in. The button sits in a fixed spot in the thumb zone, away from the
// pin, so the finger never hides the placement and a stray tap can't confirm.
const lockButton = document.getElementById('lock-button');
let lockArmedAt = 0;

function setGuessHint(text, nudge = false) {
  const hint = document.getElementById('guess-hint');
  if (!hint) return;
  hint.textContent = text;
  hint.style.color = nudge ? '#ffc76a' : '';
}

function showLockButton() {
  if (lockButton.hidden) lockArmedAt = performance.now() + LOCK_ARM_MS;
  lockButton.hidden = false;
  document.body.classList.add('has-guess');
}

function clearPendingGuess() {
  state.pendingGuess = null;
  lockButton.hidden = true;
  document.body.classList.remove('has-guess');
}

// The canvas is a sibling of the HUD, not an ancestor, so stopping propagation
// on the button can't shield it. A tap that misses the button by a few px (its
// glow reads as part of it) hit-tests to the globe and would move the pin to
// the button's spot, so the canvas ignores placement taps on or near it.
const LOCK_TAP_SLOP = 16; // css px
function nearLockButton(x, y) {
  if (lockButton.hidden) return false;
  const r = lockButton.getBoundingClientRect();
  return x > r.left - LOCK_TAP_SLOP && x < r.right + LOCK_TAP_SLOP
    && y > r.top - LOCK_TAP_SLOP && y < r.bottom + LOCK_TAP_SLOP;
}

// Skip pin placement when tapping on/near top UI (X buttons, header).
// Prevents pins dropping behind the X when zoomed in.
const TOP_UI_SLOP = 8; // css px
function nearTopUI(x, y) {
  for (const el of document.querySelectorAll('.home-nav-btn, .round-header')) {
    if (el.offsetParent === null) continue; // hidden
    const r = el.getBoundingClientRect();
    if (x > r.left - TOP_UI_SLOP && x < r.right + TOP_UI_SLOP
      && y > r.top - TOP_UI_SLOP && y < r.bottom + TOP_UI_SLOP) {
      return true;
    }
  }
  return false;
}

lockButton.addEventListener('click', () => {
  if (!state.pendingGuess || !window.__canGuess || state.gameMode !== 'guess') return;
  if (performance.now() < lockArmedAt) return; // the tail of a double tap on the globe
  const guess = state.pendingGuess;
  clearPendingGuess();
  if (navigator.vibrate) navigator.vibrate(20);
  window.dispatchEvent(new CustomEvent('pin', { detail: { ...guess, confirmed: true } }));
});

initScene();
initGlobeSurface();
initAtmosphere();
initImagery();
initAssets();

initOutlines();

// Pins and the view's input. The Lock in button and the review's tap target
// live above the globe, so pin.js reaches them through this host.
const pinHost = { showLockButton, setGuessHint, nearLockButton, nearTopUI, pickReviewRound };
initPin(pinHost);

// ---------------------------------------------------------------------------
// Daily game
// ---------------------------------------------------------------------------
const gameEls = {
  start: document.getElementById('start-screen'),
  round: document.getElementById('round-screen'),
  postcardSummaryScreen: document.getElementById('postcard-summary-screen'),
  results: document.getElementById('results-screen'),
  play: document.getElementById('play-button'),
  number: document.getElementById('round-number'),
  weight: document.getElementById('round-weight'),
  dailyDate: document.getElementById('daily-date'),
  clue: document.getElementById('clue'),
  hint: document.getElementById('guess-hint'),
  header: document.querySelector('.round-header'),
  revealName: document.getElementById('reveal-name'),
  revealPill: document.getElementById('reveal-pill'),
  reveal: document.getElementById('reveal-card'),
  peekBar: document.getElementById('peek-bar'),
  peekName: document.getElementById('peek-name'),
  peekThumb: document.getElementById('peek-thumb'),
  sheetContent: document.getElementById('sheet-content'),
  lineDistance: document.getElementById('line-distance'),
  distance: document.getElementById('distance'),
  baseScore: document.getElementById('base-score'),
  mult: document.getElementById('score-mult'),
  score: document.getElementById('round-score'),
  fact: document.getElementById('fact'),
  thumb: document.getElementById('place-thumb'),
  next: document.getElementById('next-button'),
  total: document.getElementById('total-score'),
  breakdown: document.getElementById('breakdown'),
  resultsBreakdown: document.getElementById('results-breakdown'),
  postcardSummaryLede: document.getElementById('postcard-summary-lede'),
  postcardSummaryCounts: document.getElementById('postcard-summary-counts'),
  postcardSummaryContinue: document.getElementById('postcard-summary-continue'),
  share: document.getElementById('share-button'),
  status: document.getElementById('share-status'),
  startStreak: document.getElementById('start-streak'),
  resultStreak: document.getElementById('result-streak'),
  travelDistance: document.getElementById('travel-distance'),
  survivalEntry: document.getElementById('survival-button'),
  survivalHub: document.getElementById('survival-hub'),
  survivalHubEntry: document.getElementById('survival-hub-button'),
  survivalStreak: document.getElementById('survival-streak'),
  survivalResults: document.getElementById('survival-results-screen'),
  survivalResultTitle: document.getElementById('survival-result-title'),
  survivalFinalStreak: document.getElementById('survival-final-streak'),
  survivalBestStreak: document.getElementById('survival-best-streak'),
  survivalShare: document.getElementById('survival-share'),
  survivalShareStatus: document.getElementById('survival-share-status'),
  survivalAgain: document.getElementById('survival-again'),
  survivalHome: document.getElementById('survival-home'),
  expeditionsEntry: document.getElementById('expeditions-button'),
};

// The reveal reaches the round screen only through this host.
const revealHost = { gameEls, currentItem, revealThumbCurrent, clearPendingGuess, hideReviewVisuals };
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
const muteButtons = [gameEls.start, gameEls.round.querySelector('.round-meta')].map((parent) => {
  const button = document.createElement('button');
  button.className = 'mute-toggle';
  button.innerHTML = MUTE_ICON;
  if (parent === gameEls.start) parent.prepend(button);
  else parent.firstElementChild.after(button); // centred between round and weight
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

function saveDaily() {
  writeJSON(GAME_KEY, state.daily);
}

// A pinned date plays its pin (with any dropped location substituted, see
// resolvePinnedIds); every other date is computed from today's pool.
function dailyGame(date) {
  const pinned = state.dailyPins[date];
  const ids = Array.isArray(pinned) ? resolvePinnedIds(date, pinned, state.locations) : null;
  return ids || dailyIds(date, state.locations);
}

function loadDaily() {
  const date = localDateKey();
  const saved = readJSON(GAME_KEY);
  state.daily = saved && saved.date === date && Array.isArray(saved.ids)
    ? saved
    : { date, ids: dailyGame(date), round: 0, results: [], complete: false };
  state.daily.round = clamp(Number(state.daily.round) || 0, 0, 4);
  state.daily.results = Array.isArray(state.daily.results) ? state.daily.results.slice(0, 5) : [];
  state.selected = state.daily.ids.map((id) => state.locations.find((item) => item.id === id)).filter((item) => isPlayableLocation(item) && !isLandmark(item));
  if (state.selected.length !== 5) {
    state.daily = { date, ids: dailyGame(date), round: 0, results: [], complete: false };
    state.selected = state.daily.ids.map((id) => state.locations.find((item) => item.id === id));
  }
  saveDaily();
}

// Stretched-exponential: near-perfect under ~10km, matches MapTap's generous
// mid-range (~980 @ 112km, ~940 @ 301km), and decays gradually toward 0 at
// antipodal distances instead of collapsing by a few hundred km.
function distanceScore(km) {
  return 1000 * Math.exp(-((km / 3500) ** 1.13));
}

function scoreGuess(km, round) {
  const base = Math.round(distanceScore(km));
  return Math.round(base * WEIGHTS[round]);
}

function streakText() {
  const streak = readJSON(STREAK_KEY);
  const count = streak && Number(streak.count) ? streak.count : 0;
  return count ? `🔥 ${count} day streak` : '';
}

function finishStreak() {
  const existing = readJSON(STREAK_KEY);
  if (existing && existing.last === state.daily.date) return existing.count || 1;
  const today = new Date(`${state.daily.date}T12:00:00`);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const count = existing && existing.last === localDateKey(yesterday) ? (existing.count || 0) + 1 : 1;
  writeJSON(STREAK_KEY, { last: state.daily.date, count });
  return count;
}

var pvpScreenEls = []; // set once the PvP screens are built

function hideScreens() {
  gameEls.start.hidden = gameEls.round.hidden = gameEls.postcardSummaryScreen.hidden = gameEls.results.hidden = true;
  gameEls.survivalResults.hidden = true;
  gameEls.survivalHub.hidden = true;
  reviewEls.screen.hidden = true;
  if (state.statsScreenEl) state.statsScreenEl.hidden = true;
  if (state.settingsScreenEl) state.settingsScreenEl.hidden = true;
  if (state.passportScreenEl) state.passportScreenEl.hidden = true;
  if (state.collectionsScreenEl) state.collectionsScreenEl.hidden = true;
  for (const el of pvpScreenEls) el.hidden = true;
  document.body.className = '';
}

function showRound() {
  clearReveal();
  hideScreens();
  state.gameMode = 'guess';
  window.__canGuess = true;
  gameEls.round.hidden = false;
  document.body.classList.add('game-round');
  const item = currentItem();
  if (pvp.active) {
    document.body.classList.add('pvp');
    gameEls.number.textContent = `Round ${pvp.round} of 5`;
    gameEls.weight.style.display = ''; // the countdown, see pvpTick
    gameEls.dailyDate.hidden = true;
  } else if (expeditionRun.active) {
    expeditionRoundHeader();
  } else if (borders.active) {
    bordersRoundHeader();
  } else if (survival.active) {
    survivalRoundHeader();
  } else if (endless.active) {
    endlessRoundHeader();
  } else {
    gameEls.number.textContent = `Round ${state.daily.round + 1} of 5`;
    gameEls.weight.textContent = `${WEIGHTS[state.daily.round]}× points`;
    gameEls.weight.style.display = WEIGHTS[state.daily.round] > 1 ? '' : 'none';
    gameEls.dailyDate.textContent = formatDailyDate(state.daily.date);
    gameEls.dailyDate.hidden = false;
  }
  if (borders.active) bordersClue();
  else gameEls.clue.textContent = item.clue;
  setGuessHint(borders.active || survival.active ? '' : 'Tap the globe to place your pin');
}

// Compact earn toast: appears after the flyover completes, doesn't block the globe.
// The postcard is the payoff of the flight, not a competing modal.
function showEarnToast(answer, tier) {
  document.querySelector('.earn-toast')?.remove();
  const style = document.createElement('style');
  style.textContent = `
    .earn-toast { position: fixed; left: 50%; bottom: calc(env(safe-area-inset-bottom, 0px) + 112px); transform: translateX(-50%) translateY(20px); z-index: 50; display: flex; align-items: center; gap: 10px; padding: 10px 16px 10px 10px; border-radius: 999px; background: rgba(20,28,52,.92); border: 1px solid rgba(255,199,106,.4); box-shadow: 0 8px 32px rgba(0,0,0,.5); opacity: 0; transition: opacity .3s, transform .3s; pointer-events: none; max-width: 90vw; }
    .earn-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .earn-toast img { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; object-position: center 20%; flex: none; }
    .earn-toast .earn-toast-text { color: #f3f9ff; font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .earn-toast .earn-toast-text small { display: block; color: #ffc76a; font-size: 11px; font-weight: 600; }
  `;
  document.head.appendChild(style);
  const toast = document.createElement('div');
  toast.className = 'earn-toast';
  const tierLabel = tier === EARN_PINPOINT ? '📍 Pinpoint!' : tier === EARN_BULLSEYE ? '🎯 Bullseye!' : 'New postcard earned!';
  toast.innerHTML = `
    <img src="${answer.image || ''}" alt="">
    <div class="earn-toast-text">${tierLabel}<small>${answer.clue || answer.short || ''}</small></div>
  `;
  document.body.appendChild(toast);
  // Animate in
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));
  // Auto-dismiss after 3s
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.remove(); style.remove(); }, 300);
  }, 3000);
}

// Save the outcome with the round rather than trying to reconstruct it from the
// passport later. A postcard can only be new or upgraded at the instant the
// guess is made; opening an already-finished daily must not change that story.
function postcardRoundOutcome(previousEarn, newlyEarned) {
  if (!newlyEarned) return { kind: 'miss' };
  return {
    kind: previousEarn ? 'upgrade' : 'new',
    tier: newlyEarned,
  };
}

function revealGuess(guess, restoring = false) {
  if (state.gameMode !== 'guess' && !restoring) return;
  const answer = currentItem();
  const kmExact = distanceKm(guess, answer);
  // PvP shows the server's accepted distance and score; the local exact
  // distance only picks the flyover tier.
  const pvpScored = pvp.active ? pvp.reveal : null;
  const km = pvpScored ? pvpScored.distanceKm : Math.round(kmExact);
  const base = pvpScored ? pvpScored.score : Math.round(distanceScore(kmExact));
  const oneOff = survival.active || endless.active || expeditionRun.active || pvp.active; // outside the daily
  const score = oneOff ? 0 : scoreGuess(kmExact, state.daily.round);
  if (!restoring && survival.active) survivalRecordGuess(answer, km, kmExact);
  state.gameMode = 'reveal';
  window.__canGuess = false;
  const headerFrom = gameEls.header.offsetHeight;
  document.body.className = pvp.active ? 'game-reveal pvp'
    : expeditionRun.active ? 'game-reveal expedition-mode'
    : survival.active
    ? `game-reveal survival${survival.missed ? ' survival-miss' : ''}`
    : endless.active ? 'game-reveal endless' : 'game-reveal';
  gameEls.hint.textContent = '';
  gameEls.distance.textContent = window.__travelAnim && !restoring ? '0 km' : formatKm(km);
  // Capture the passport state before this guess changes it. The reveal starts
  // with the thumbnail the player already had, then a new unlock can land in it.
  const wasVisited = Object.hasOwn(state.passport.visits, answer.id);
  const previousEarn = state.passport.meta[answer.id]?.e || 0;
  // Endless and PvP earn visits only; postcards come from daily and survival.
  // PvP records each accepted round once (pvp.recordVisit), never on a replay.
  const record = pvp.active ? pvp.recordVisit : !restoring;
  const newlyEarned = record ? recordVisit(answer.id, base, pvpScored ? pvpScored.distanceKm : kmExact, !endless.active && !pvp.active) : 0; // exact, so earning matches the flyover tier
  if (!restoring && !oneOff) {
    state.daily.results[state.daily.round] = {
      guess,
      distance: km,
      score,
      base,
      distanceExact: kmExact,
      postcard: postcardRoundOutcome(previousEarn, newlyEarned),
    };
    saveDaily();
  }
  if (!restoring && (survival.active || expeditionRun.active)) {
    const postcard = postcardRoundOutcome(previousEarn, newlyEarned);
    if (postcard.kind !== 'miss') runHaul.push({ result: { distance: km, distanceExact: kmExact, postcard }, item: answer });
  }
  if (!restoring && expeditionRun.active) completeExpeditionRound();
  const weight = oneOff ? 1 : WEIGHTS[state.daily.round];
  gameEls.baseScore.textContent = base;
  gameEls.mult.textContent = `×${weight.toFixed(1)}`;
  gameEls.mult.style.display = oneOff ? 'none' : '';
  const placeName = answer.clue || answer.short;
  gameEls.revealName.textContent = placeName;
  gameEls.peekName.textContent = placeName;
  gameEls.fact.textContent = answer.fact;
  setThumb(gameEls.thumb, answer.image);
  setThumb(gameEls.peekThumb, answer.image);
  peekSlot.hidden = !answer.image;
  setRevealThumbState(answer, wasVisited, previousEarn);
  const pill = gameEls.revealPill;
  pill.classList.remove('safe', 'miss');
  if (expeditionRun.active) {
    expeditionRevealCard(pill);
  } else if (survival.active) {
    survivalRevealCard(pill);
  } else if (pvp.active) {
    gameEls.score.textContent = `+${base}`;
    pill.textContent = `+${base}`;
    gameEls.next.textContent = pvp.result || pvp.round >= 5 ? 'Results' : 'Next';
    pvpRenderVs();
  } else {
    // Endless is unscored: no pill, and the peek bar shows just the distance.
    gameEls.score.textContent = endless.active ? '' : `+${score}`;
    pill.textContent = endless.active ? '' : `+${score}`;
    gameEls.next.textContent = endless.active ? 'Next' : state.daily.round === 4 ? 'Results' : 'Next';
  }
  if (!restoring && headerFrom > REVEAL_HEADER_H) collapseRoundHeader(headerFrom);
  const tier = flyoverTier(kmExact);
  const animate = window.__travelAnim !== false && !restoring;
  // Queue the earn celebration for after the flyover completes.
  // The earn toast is non-blocking, but holds off until the postcard has settled.
  if (newlyEarned) {
    setTimeout(() => {
      if (animate) whenPostcardDone(() => showEarnToast(answer, newlyEarned));
      else showEarnToast(answer, newlyEarned);
    }, animate ? 800 : 100);
  }
  if (animate && (tier === 'bullseye' || tier === 'pinpoint')) {
    document.body.classList.add('bullseye');
    gameEls.hint.textContent = tier === 'pinpoint' ? 'Pinpoint! Incredible accuracy' : 'Bullseye! The gold marker shows the answer';
    beginBullseyeReveal(guess, answer, km, newlyEarned, tier);
  } else if (animate) beginTravelReveal(guess, answer, km, newlyEarned, tier);
  else {
    revealThumbCurrent();
    let a;
    let b;
    if (state.revealViewPreference === 'north-up') {
      ({ a, b } = buildAnswerPath(guess, answer));
      if (state.activePin >= 0) pins[state.activePin].drop(a);
      correctPin.drop(b);
      answerLine.visible = true;
      frameNorthUpRevealPoints(a, b);
      showCountryOutline(countryKey(answer), answer, false);
    } else {
      ({ a, b } = placeRevealVisual(guess, answer));
    }
    gameEls.distance.textContent = formatKm(km);
    if (restoring) {
      // Coming back to a finished round: no beat to replay.
      showLineLabel(a, b);
      showRevealSheet(false);
    } else startRevealBeat(a, b, tier !== 'bullseye');
  }
}

// Centralized thumbnail state update: applies earn tier and grayscale in one place.
// All modes must use this (via setRevealThumbState or revealThumbCurrent) to avoid drift.
function applyThumbState(thumb, item, earned, visited) {
  const showGrayscale = visited && !earned;
  thumb.classList.toggle('seen-no-postcard', showGrayscale);
  thumb.classList.toggle('no-postcard', showGrayscale);
  applyCardTier(thumb, item, earned);
  thumb.parentElement.querySelector(':scope > .prox-badge')?.remove();
}

function setRevealThumbState(item, visited, earned) {
  peekSlot.classList.toggle('mystery', !visited);
  for (const thumb of [gameEls.thumb, gameEls.peekThumb]) {
    applyThumbState(thumb, item, earned, visited);
  }
}

// Centralized thumbnail earn state: single source of truth for all modes.
// Returns the earn tier (0-3) that the thumbnail should display.
function getThumbEarn(item) {
  if (!item) return 0;
  // Endless never earns postcards (visits only, by design)
  if (endless.active) return 0;
  return state.passport.meta[item.id]?.e || 0;
}

function revealThumbCurrent() {
  const item = currentItem();
  const earned = getThumbEarn(item);
  const visited = Object.hasOwn(state.passport.visits, item.id);
  peekSlot.classList.remove('mystery');
  for (const thumb of [gameEls.thumb, gameEls.peekThumb]) {
    applyThumbState(thumb, item, earned, visited);
  }
}

function scoreEmoji(base) {
  if (base >= 1000) return '🎯';
  if (base >= 900) return '🔥';
  if (base >= 700) return '🏆';
  if (base >= 400) return '🙂';
  if (base >= 1) return '😅';
  return '🥶';
}

function postcardDistance(result, outcome) {
  const distance = Number.isFinite(result.distanceExact) ? result.distanceExact : result.distance;
  const precision = outcome?.tier === EARN_PINPOINT ? 1 : 0;
  return `${distance.toLocaleString(undefined, { maximumFractionDigits: precision, minimumFractionDigits: precision })} km`;
}

function postcardSummaryCard(result, item) {
  const outcome = result.postcard;
  if (!outcome || !['new', 'upgrade'].includes(outcome.kind)) return null;
  const card = document.createElement('article');
  card.className = 'pp-post';
  applyCardTier(card, item, outcome.tier);
  const photo = document.createElement('div');
  photo.className = 'pp-photo';
  if (item.image) {
    const img = document.createElement('img');
    img.src = item.image;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => img.remove(), { once: true });
    photo.append(img);
  }
  const flag = flagForLocation(item);
  const name = document.createElement('p');
  name.className = 'pp-name';
  name.textContent = `${item.short || item.clue}${flag ? ` ${flag}` : ''}`;
  const meta = document.createElement('p');
  meta.className = 'pp-meta';
  const distanceText = postcardDistance(result, outcome);
  if (outcome.kind === 'upgrade') {
    meta.textContent = `Upgraded • ${distanceText}`;
  } else {
    meta.textContent = `New • ${distanceText}`;
  }
  card.append(photo, name, meta);
  const entry = passportEntryFor(item);
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-haspopup', 'dialog');
  card.setAttribute('aria-label', `Open postcard: ${name.textContent}`);
  card.addEventListener('click', () => openPostcard(entry, card));
  card.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    openPostcard(entry, card);
  });
  return card;
}

function shareText() {
  const dateStr = new Date(`${state.daily.date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const total = state.daily.results.reduce((sum, result) => sum + result.score, 0);
  const lines = state.daily.results.map((result, index) => {
    const base = result.base ?? Math.round((result.score * 10) / WEIGHTS[index]);
    return `${base} ${scoreEmoji(base)}`;
  });
  return `https://where-on.earth\n${dateStr}\n\nFinal Score: ${total}\n\n${lines.join('\n')}`;
}

function postcardSummaryOutcomes() {
  return state.daily.results
    .map((result, index) => ({ result, item: state.selected[index] }))
    .filter(({ result }) => ['new', 'upgrade'].includes(result.postcard?.kind));
}

// Survival and Expeditions are unscored, so they have no daily.results to read
// back. Their new and upgraded postcards are collected here as rounds are played.
const runHaul = [];

// Show the run's haul before moving on, then forget it so it can't show twice.
function showRunHaul(next, nextLabel) {
  showPostcardSummary(runHaul.splice(0), next, nextLabel);
}

function postcardSummaryCounts(outcomes) {
  return outcomes.reduce((counts, { result }) => {
    counts[result.postcard.kind] += 1;
    return counts;
  }, { new: 0, upgrade: 0 });
}

let postcardSummaryNext = showResults;

function showPostcardSummary(outcomes = postcardSummaryOutcomes(), next = showResults, nextLabel = 'Continue to results') {
  if (!outcomes.length) return next();
  postcardSummaryNext = next;
  gameEls.postcardSummaryContinue.textContent = nextLabel;
  clearReveal();
  hideScreens();
  state.gameMode = 'postcard-summary';
  window.__canGuess = false;
  gameEls.postcardSummaryScreen.hidden = false;
  document.body.classList.add('game-results');
  const { new: newCount, upgrade: upgradeCount } = postcardSummaryCounts(outcomes);
  gameEls.postcardSummaryLede.textContent = `${newCount ? `${newCount} new postcard${newCount === 1 ? '' : 's'}` : 'No new postcards'}${newCount && upgradeCount ? ' and ' : ''}${upgradeCount ? `${upgradeCount} upgraded` : ''}.`;
  gameEls.breakdown.replaceChildren(...outcomes.map(({ result, item }) => postcardSummaryCard(result, item)));
  const countLabel = (count, label) => {
    const el = document.createElement('span');
    const number = document.createElement('b');
    number.textContent = count;
    el.append(number, ` ${label}`);
    return el;
  };
  gameEls.postcardSummaryCounts.replaceChildren(
    countLabel(newCount, 'new'),
    Object.assign(document.createElement('span'), { className: 'postcard-summary-separator', textContent: '·' }),
    countLabel(upgradeCount, 'upgraded'),
  );
}

function showResults() {
  clearReveal();
  hideScreens();
  state.gameMode = 'results';
  window.__canGuess = false;
  gameEls.results.hidden = false;
  document.body.classList.add('game-results');
  state.daily.complete = true;
  saveDaily();
  const streak = finishStreak();
  recordHistory();
  const total = state.daily.results.reduce((sum, result) => sum + result.score, 0);
  gameEls.total.textContent = total.toLocaleString();
  gameEls.resultStreak.textContent = `🔥 ${streak} day streak`;
  gameEls.resultsBreakdown.replaceChildren(...state.daily.results.map((result, i) => {
    const round = document.createElement('li');
    const number = document.createElement('b');
    const place = document.createElement('span');
    const metrics = document.createElement('span');
    const points = document.createElement('span');
    const distance = document.createElement('span');

    const item = state.selected[i];
    const city = item?.short || item?.clue || 'Unknown location';
    const country = item?.country || '';
    const flag = item ? flagForLocation(item) : '🌍';
    const rawScore = result.base ?? Math.round(result.score / WEIGHTS[i]);

    number.textContent = i + 1;
    place.className = 'place';
    const hasCountry = country && city.toLocaleLowerCase().includes(country.toLocaleLowerCase());
    place.textContent = `${city}${country && !hasCountry ? `, ${country}` : ''} ${flag}`;
    metrics.className = 'result-metrics';
    points.className = 'points';
    points.textContent = rawScore.toLocaleString();
    distance.className = 'distance';
    distance.textContent = formatKm(result.distance);
    metrics.append(points, distance);
    round.append(number, place, metrics);
    return round;
  }));
  tickCountdown();
}

function syncDailyButton() {
  const played = state.daily && state.daily.complete && state.daily.date === localDateKey();
  gameEls.play.querySelector('.mode-desc').textContent = played ? '✓ See results' : '5 places daily';
  gameEls.play.classList.toggle('played', Boolean(played));
}

function startGame() {
  borders.active = false;
  expeditionRun.active = false;
  survival.active = false;
  endless.active = false;
  if (state.daily.date !== localDateKey()) loadDaily(); // page left open past midnight
  if (state.daily.complete && state.daily.results.length === 5) showResults();
  else if (state.daily.results[state.daily.round]) {
    showRound();
    revealGuess(state.daily.results[state.daily.round].guess, true);
  } else showRound();
}

function nextRound() {
  if (state.gameMode !== 'reveal') return;
  // Clear any pending earn toast from the previous round; if the user moved on
  // before the flyover finished, the toast should not appear in the new round.
  window.__pendingEarn = null;
  document.querySelector('.earn-toast')?.remove();
  if (borders.active) bordersNext();
  else if (survival.active) survivalNext();
  else if (expeditionRun.active) expeditionNext();
  else if (pvp.active) pvpNext();
  else if (endless.active) endlessNext();
  else if (state.daily.round >= 4) showPostcardSummary();
  else {
    state.daily.round += 1;
    saveDaily();
    showRound();
  }
}

async function shareResult(text = shareText(), button = gameEls.share, status = gameEls.status) {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
    status.textContent = 'Result copied to clipboard';
  } catch {
    status.textContent = 'Could not copy this result';
  }
}

window.addEventListener('pin', (event) => (borders.active ? revealBorders(event.detail) : pvp.active ? pvpSubmit(event.detail) : revealGuess(event.detail)));
gameEls.play.addEventListener('click', startGame);
gameEls.next.addEventListener('click', nextRound);
gameEls.share.addEventListener('click', () => shareResult());
// Finished-game close controls are wired via the .home-nav-btn delegation below.

// ---------------------------------------------------------------------------
// Next-daily countdown: one game per day, shown on the results and review
// screens in place of a replay
// ---------------------------------------------------------------------------
const nextGame = document.createElement('div');
nextGame.className = 'next-game';
nextGame.innerHTML = '<p class="eyebrow">Next game in</p><span class="next-game-time" role="timer">--:--:--</span><p class="next-game-sub">Five new places at midnight</p>';
gameEls.status.after(nextGame);
const nextGameTime = nextGame.querySelector('.next-game-time');
const nextGameSub = nextGame.querySelector('.next-game-sub');
let reviewCountdown = null; // set once the review bar exists

function msToMidnight(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
}

function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

// Back to the start screen with today's fresh daily loaded.
function openNewDaily() {
  borders.active = false;
  survival.active = false;
  endless.active = false;
  loadDaily();
  clearReveal();
  hideScreens();
  state.gameMode = 'start';
  gameEls.start.hidden = false;
  gameEls.startStreak.textContent = streakText();
  syncPassport();
  document.body.className = 'game-start';
  window.__canGuess = false;
}

let countdownDay = localDateKey();
function tickCountdown() {
  const today = localDateKey();
  const rolled = today !== countdownDay;
  countdownDay = today;
  if (!state.daily) return;
  // Midnight passed while idle on a finished or not-yet-started daily: refresh.
  // Mid-round and endless play are left alone; startGame() catches up later.
  if (rolled && !endless.active && ['start', 'results', 'review'].includes(state.gameMode)) {
    openNewDaily();
    return;
  }
  // Finished yesterday's game after midnight: today's is already waiting.
  const ready = state.daily.date !== today;
  const time = ready ? 'New game ready' : formatCountdown(msToMidnight());
  nextGame.classList.toggle('ready', ready);
  nextGame.firstElementChild.hidden = ready;
  nextGameTime.textContent = ready ? 'Play today’s game →' : time;
  nextGameSub.textContent = ready ? 'Five new places are waiting' : 'Five new places at midnight';
  if (reviewCountdown) {
    reviewCountdown.classList.toggle('ready', ready);
    reviewCountdown.textContent = ready ? 'Play today →' : `Next ${time}`;
  }
}
setInterval(tickCountdown, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tickCountdown(); });
nextGame.addEventListener('click', () => { if (nextGame.classList.contains('ready')) openNewDaily(); });
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
  get countryData() { return countryData; },
  get countryBands() { return countryBands; },
  get countryIndex() { return countryIndex; },
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
  saveBlackoutBest,
  blackoutFill,
  blackoutComplete,
  blackoutProgressText,
  blackoutBestSummary,
  showBlackoutGameOver,
  blackoutShareText,
};

// ---------------------------------------------------------------------------
// Endless mode (QUARANTINED: disabled, kept intact) lives in
// src/modes/endless.js.
// ---------------------------------------------------------------------------
initEndless(modeHost);
// PvP challenge play (section below). item is the server-issued prompt until the
// guess is accepted, then the server answer.
const pvp = { active: false, matchId: null, challengeId: null, group: false, round: 0, item: null, result: null };

function currentItem() {
  if (borders.active) return null; // Borders asks for a country, not a location
  if (pvp.active) return pvp.item;
  return expeditionRun.active ? expeditionRun.item : survival.active ? survival.item : endless.active ? endless.item : state.selected[state.daily.round];
}

function goHome() {
  borders.active = false;
  survival.active = false;
  endless.active = false;
  expeditionRun.active = false;
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
  const isDailyGame = !endless.active && !survival.active && !expeditionRun.active && !borders.active;
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
// Post-game review: all five rounds on the globe, tap one to reopen its recap
// ---------------------------------------------------------------------------
const REVIEW_PIN_SCALE = 0.78; // ten pins at once: a little smaller than in play
const REVIEW_DIM = 0.22; // unselected rounds while a recap is open
const REVIEW_PIN_HIT = 34; // css px, generous for fingers
const REVIEW_LINE_HIT = 20;

const reviewStyle = document.createElement('style');
reviewStyle.textContent = `
.results-card { position: relative; }
.results-title { margin: 2px 48px 3px; color: rgba(198,226,250,.58); font-size: 11px; font-weight: 850; letter-spacing: .14em; text-align: center; text-transform: uppercase; }
.results-card .result-score { display: flex; align-items: baseline; justify-content: center; gap: 5px; margin: 0 0 4px; }
.results-card .result-score b { color: #ffc76a; font-size: clamp(42px, 14vw, 58px); font-weight: 850; line-height: 1; letter-spacing: -.055em; }
.results-card .result-score span { color: rgba(198,226,250,.58); font-size: 14px; font-weight: 700; }
.results-card .streak { margin-bottom: 10px; }
.results-card .round-breakdown { margin-top: 10px; }
.results-card .round-breakdown h2 { display: none; }
#results-breakdown li { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 10px 0; }
#results-breakdown li > b { font-size: 13px; }
#results-breakdown .place { min-width: 0; overflow: visible; color: rgba(225,240,255,.92); font-weight: 650; line-height: 1.25; overflow-wrap: anywhere; white-space: normal; }
#results-breakdown .result-metrics { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; min-width: 62px; white-space: nowrap; }
#results-breakdown .points { color: #ffc76a; font-size: 17px; font-weight: 850; line-height: 1.1; }
#results-breakdown .distance { color: rgba(193,224,250,.58); font-size: 11px; font-weight: 600; }
.results-globe { margin: 8px auto 0; }
.next-game { margin: 12px 0 0; padding: 10px 16px 8px; }
.next-game-time { font-size: 28px; }
.next-game-sub { font-size: 11px; }
.results-globe { display: block; margin: 0 auto; }
.review-screen { pointer-events: none; }
.review-bar { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 14px); left: 14px; right: 14px; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 16px; border-radius: 18px; pointer-events: auto; }
.review-bar .review-title { flex: 1; min-width: 0; }
.review-bar .eyebrow { margin: 0 0 3px; }
.review-hint { margin: 0; overflow: hidden; color: rgba(193,224,250,.62); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.review-pill { min-height: 40px; padding: 0 14px; border: 1px solid rgba(157,211,255,.28); border-radius: 999px; background: rgba(236,247,255,.08); color: #ecf7ff; font-size: 13px; font-weight: 700; white-space: nowrap; cursor: pointer; touch-action: manipulation; }
.recap-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.recap-tag { margin: 0 0 4px; color: rgba(193,224,250,.67); font-size: 11px; font-weight: 750; letter-spacing: .1em; text-transform: uppercase; }
.recap-head h3 { margin: 0; color: #f3f9ff; font-size: 18px; line-height: 1.2; letter-spacing: -.02em; }
.recap-close { flex: none; width: 44px; height: 44px; margin: -10px -10px 0 0; padding: 0; border: 0; border-radius: 50%; background: none; color: rgba(198,226,250,.7); font-size: 26px; line-height: 1; cursor: pointer; touch-action: manipulation; }
.recap-card .recap-score { color: #ffc76a; font-size: 28px; }
.recap-thumb { display: block; width: 100%; height: 130px; margin: 12px 0 0; border-radius: 10px; object-fit: cover; object-position: center 20%; }
.recap-thumb[hidden] { display: none; }
.recap-fact { margin: 12px 0 14px; color: rgba(224,240,255,.8); font-size: 13px; line-height: 1.45; }
body.game-review #hud { opacity: 0; }
@media (max-height: 700px) {
  .recap-thumb { height: 92px; }
  .recap-fact { margin: 9px 0 11px; }
}`;
document.head.appendChild(reviewStyle);

const resultScore = gameEls.total.closest('.result-score');
const resultsTitle = document.createElement('p');
resultsTitle.className = 'results-title';
resultsTitle.textContent = state.daily ? "TODAY'S RESULT" : 'SCORE';
resultScore.firstChild.textContent = '';
resultScore.before(resultsTitle);

const resultsGlobe = document.createElement('button');
resultsGlobe.className = 'text-button results-globe';
resultsGlobe.textContent = 'See your rounds on the globe';
(gameEls.share.closest('.results-actions') || gameEls.share).before(resultsGlobe);

const reviewScreen = document.createElement('section');
reviewScreen.className = 'screen review-screen';
reviewScreen.hidden = true;
reviewScreen.innerHTML = `
  <header class="review-bar glass">
    <div class="review-title"><p class="eyebrow">Today's rounds</p><p class="review-hint"></p></div>
    <button class="review-pill" data-act="results">Results</button>
    <span class="review-countdown" data-act="next-daily" role="timer"></span>
  </header>
  <article class="reveal-card recap-card glass" hidden>
    <div class="recap-head"><div><p class="recap-tag"></p><h3></h3></div><button class="recap-close" aria-label="Close round recap">×</button></div>
    <div class="score-line"><div><span class="recap-distance"></span><small>away</small></div><div class="score-math"><span class="base"><b class="recap-base"></b>/1000</span><span class="mult recap-mult"></span><strong class="recap-score"></strong></div></div>
    <img class="recap-thumb" alt="" loading="lazy" hidden onerror="this.hidden=true">
    <p class="recap-fact"></p>
    <button class="primary" data-act="back">Back to globe</button>
  </article>`;
document.getElementById('game').append(reviewScreen);
const reviewEls = {
  screen: reviewScreen,
  bar: reviewScreen.querySelector('.review-bar'),
  hint: reviewScreen.querySelector('.review-hint'),
  countdown: reviewScreen.querySelector('.review-countdown'),
  card: reviewScreen.querySelector('.recap-card'),
  tag: reviewScreen.querySelector('.recap-tag'),
  name: reviewScreen.querySelector('.recap-head h3'),
  distance: reviewScreen.querySelector('.recap-distance'),
  base: reviewScreen.querySelector('.recap-base'),
  mult: reviewScreen.querySelector('.recap-mult'),
  score: reviewScreen.querySelector('.recap-score'),
  thumb: reviewScreen.querySelector('.recap-thumb'),
  fact: reviewScreen.querySelector('.recap-fact'),
};
reviewCountdown = reviewEls.countdown;

// One guess pin, answer pin and route per round, built once and re-dropped
// each time the review opens.
const reviewRounds = Array.from({ length: 5 }, (_, i) => {
  const guess = new Pin({ badge: makeBadgeTexture('guess', i + 1) });
  const answer = new Pin({ color: ANSWER_COLOR, badge: makeBadgeTexture('answer', i + 1), answer: true });
  guess.capMat.uniforms.uPulse.value = answer.capMat.uniforms.uPulse.value = 0; // ten pulsing pins is noise
  const material = new LineMaterial({
    color: '#b9f7ff',
    linewidth: 2,
    transparent: true,
    opacity: 0.75,
    depthWrite: false, // depth-tested (unlike the reveal line) so far-side routes hide behind the globe
  });
  material.resolution.set(state.viewW, state.viewH);
  const line = new LineSegments2(new LineGeometry(), material);
  line.visible = false;
  line.renderOrder = 6;
  globe.add(guess.root, answer.root, line);
  return { guess, answer, line, points: [], dim: 1 };
});
window.addEventListener('resize', () => reviewRounds.forEach((r) => r.line.material.resolution.set(state.viewW, state.viewH)));
let reviewOpen = -1;

function showReviewVisuals() {
  reviewRounds.forEach((r, i) => {
    const result = state.daily.results[i];
    const a = latLngToVec3(result.guess.lat, result.guess.lng);
    const b = latLngToVec3(state.selected[i].lat, state.selected[i].lng);
    const angle = a.angleTo(b);
    const axis = routeAxis(a, b);
    const count = Math.max(16, Math.ceil(angle / DEG));
    r.points = [];
    for (let k = 0; k <= count; k++) {
      // a hair above the surface at the ends so the depth test can't eat them
      const lift = Math.max(routeRadius(angle, k / count), 1.002);
      r.points.push(a.clone().applyAxisAngle(axis, (k / count) * angle).multiplyScalar(lift));
    }
    r.line.geometry.dispose();
    r.line.geometry = new LineGeometry().setPositions(r.points.flatMap((p) => p.toArray()));
    r.line.computeLineDistances();
    r.line.visible = true;
    r.a = a;
    r.b = b;
    r.guess.drop(a);
    r.answer.drop(b);
    // staggered landing, round 1 first (negative t stays invisible until 0)
    r.guess.t = -i * 0.12;
    r.answer.t = -i * 0.12 - 0.06;
    setReviewDim(r, 1);
  });
}

function hideReviewVisuals() {
  reviewOpen = -1;
  for (const r of reviewRounds) {
    r.guess.release();
    r.answer.release();
    r.line.visible = false;
  }
}

function setReviewDim(r, dim) {
  r.dim = r.guess.dim = r.answer.dim = dim;
}

function enterReview(focus = -1) {
  if (state.daily.results.length !== 5) return;
  clearReveal();
  hideScreens();
  state.gameMode = 'review';
  window.__canGuess = false;
  document.body.classList.add('game-review');
  reviewEls.screen.hidden = false;
  reviewEls.card.hidden = true;
  const total = state.daily.results.reduce((sum, result) => sum + result.score, 0);
  reviewEls.hint.textContent = `${total} pts · tap pins`;
  tickCountdown();
  showReviewVisuals();
  state.vYaw = state.vPitch = state.autoSpin = 0;
  if (focus >= 0) {
    openRecap(focus);
    return;
  }
  // centre on the spread of all ten points, at the whole-disc distance
  const centre = new THREE.Vector3();
  for (const r of reviewRounds) centre.add(r.a).add(r.b);
  if (centre.lengthSq() > 1e-4) {
    const view = travelView(centre);
    state.revealView = { yaw: nearAngle(view.yaw, state.yaw), pitch: clamp(view.pitch, -60 * DEG, 60 * DEG) };
  }
  state.targetDist = clamp(state.fitDist * 1.05, MIN_DIST, state.maxDist);
}

function openRecap(i) {
  const result = state.daily.results[i];
  const item = state.selected[i];
  const r = reviewRounds[i];
  reviewOpen = i;
  reviewEls.tag.textContent = `Round ${i + 1} of 5`;
  reviewEls.name.textContent = item.clue;
  reviewEls.distance.textContent = formatKm(result.distance);
  reviewEls.base.textContent = result.base ?? Math.round((result.score * 10) / WEIGHTS[i]);
  reviewEls.mult.textContent = `×${WEIGHTS[i] / 10}`;
  reviewEls.mult.style.display = WEIGHTS[i] > 1 ? '' : 'none';
  reviewEls.score.textContent = `+${result.score.toLocaleString()}`;
  reviewEls.fact.textContent = item.fact;
  setThumb(reviewEls.thumb, item.image);
  reviewEls.card.hidden = false;
  reviewRounds.forEach((other, j) => setReviewDim(other, j === i ? 1 : REVIEW_DIM));
  // the card is laid out now, so the strip between bar and card is known
  frameRevealPoints(r.a, r.b, safeStrip(reviewEls.bar, reviewEls.card));
}

function closeRecap() {
  reviewOpen = -1;
  reviewEls.card.hidden = true;
  reviewRounds.forEach((r) => setReviewDim(r, 1));
}

// Facing factor of a globe-local surface point: > 0 in front of the limb.
const _rv = new THREE.Vector3();
function reviewFacing(local) {
  _rv.copy(local).applyQuaternion(globe.quaternion);
  return (_rv.z * state.dist - 1) / Math.hypot(_rv.x, _rv.y, state.dist - _rv.z);
}

function updateReview(dt, scale) {
  for (const r of reviewRounds) {
    for (const pin of [r.guess, r.answer]) {
      if (pin.state === 'idle') continue;
      pin.update(dt, state.elapsed, scale * REVIEW_PIN_SCALE);
      if (pin.state === 'idle') continue;
      pin.badge.scale.multiplyScalar(1 / REVIEW_PIN_SCALE); // smaller pins, but numbers stay readable
      // badge sprites ignore depth, so fade them out as their pin rounds the limb
      _rv.set(0, 1, 0).applyQuaternion(pin.root.quaternion);
      pin.badge.material.opacity *= clamp((reviewFacing(_rv) + 0.02) / 0.12, 0, 1);
    }
    if (r.line.visible) r.line.material.opacity = damp(r.line.material.opacity, 0.75 * r.dim, 10, dt);
  }
}

const _rp = new THREE.Vector3();
function screenOf(world) {
  _rp.copy(world).project(camera);
  return [((_rp.x + 1) / 2) * state.viewW, ((1 - _rp.y) / 2) * state.viewH];
}

function segmentDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / Math.max(dx * dx + dy * dy, 1e-6), 0, 1);
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// Nearest round under a tap: pin heads, badges and bases first, then the
// route. A miss closes any open recap.
function pickReviewRound(x, y) {
  let best = -1;
  let bestD = Infinity;
  const w = new THREE.Vector3();
  reviewRounds.forEach((r, i) => {
    for (const pin of [r.guess, r.answer]) {
      if (!pin.root.visible || reviewFacing(pin === r.guess ? r.a : r.b) <= 0) continue;
      for (const part of [pin.core, pin.badge, pin.root]) {
        const [sx, sy] = screenOf(part.getWorldPosition(w));
        const d = Math.hypot(sx - x, sy - y);
        if (d < REVIEW_PIN_HIT && d < bestD) { best = i; bestD = d; }
      }
    }
    if (!r.line.visible) return;
    let prev = null;
    for (const p of r.points) {
      const s = reviewFacing(p) > 0 ? screenOf(w.copy(p).applyQuaternion(globe.quaternion)) : null;
      if (s && prev) {
        const d = segmentDist(x, y, prev, s) + 8; // pins win ties
        if (d < REVIEW_LINE_HIT + 8 && d < bestD) { best = i; bestD = d; }
      }
      prev = s;
    }
  });
  if (best >= 0) {
    if (navigator.vibrate) navigator.vibrate(8);
    openRecap(best);
  } else if (reviewOpen >= 0) closeRecap();
}

resultsGlobe.addEventListener('click', () => enterReview());
if (gameEls.postcardSummaryContinue) {
  gameEls.postcardSummaryContinue.addEventListener('click', () => postcardSummaryNext());
}
gameEls.results.addEventListener('click', (e) => {
  if (e.target === gameEls.results) enterReview(); // tap outside the card
});
reviewEls.screen.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]');
  if (e.target.closest('.recap-close') || (act && act.dataset.act === 'back')) closeRecap();
  else if (act && act.dataset.act === 'results') showResults();
  else if (act && act.dataset.act === 'next-daily' && act.classList.contains('ready')) openNewDaily();
});

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
};

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

// ---------------------------------------------------------------------------
// Passport: every place found, stamped on the start-screen globe
// ---------------------------------------------------------------------------
// One entry per location, upserted on every reveal, so replaying a place moves
// it back to the recent list and recolours its dot without growing the store.
// Dots are capped at the most recent PASSPORT_DOT_LIMIT visits and the geometry
// is only rebuilt when the set changes, so the start screen pays for this once
// and never per frame.
const PASSPORT_DOT_LIMIT = 200; // rendered dots, newest first
const PASSPORT_ORDER_LIMIT = 240; // ids kept in recency order (dots draw from these)
const PASSPORT_GOLD = 700; // /1000 and up reads gold, 400+ cyan, the rest dim
const PASSPORT_CYAN = 400;
const DOT_RADIUS = 1.008; // just proud of the sphere so the far side stays hidden
const CONTINENT_ORDER = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Antarctica'];
// Coarse latitude/longitude boxes, most specific first: the game ships no country
// geometry, and a rough continent is all a completion percentage needs. The two
// Asia rows merge, so the Middle East (inside Africa's box otherwise) counts once.
const CONTINENT_BOXES = [
  ['Antarctica', -90, -55, -180, 180],
  ['Oceania', -50, -1, 120, 180],
  ['Europe', 35, 82, -25, 62],
  ['Asia', 12, 42, 34, 63],
  ['Africa', -37, 36, -20, 52],
  ['South America', -56, 13, -83, -33],
  ['North America', 7, 84, -170, -40],
  ['Asia', -55, 78, -180, 180],
];

function continentOf(item) {
  if (item.continent) return item.continent;
  for (const [name, latMin, latMax, lngMin, lngMax] of CONTINENT_BOXES) {
    if (item.lat >= latMin && item.lat <= latMax && item.lng >= lngMin && item.lng <= lngMax) return name;
  }
  return null;
}

// visits: id -> latest base score /1000 (drives dot colour). meta: id -> { b: best
// base, d: closest km, f: first-visit date key, t: last-visit ms, e: earned }; meta
// only exists for visits logged after the Passport page shipped, older ones lack it.
// e is the best flyover tier landed there. Stored best distances are also used to
// migrate newly introduced tiers upward; an earned tier is never downgraded.
const PROX_CLASSES = ['', 'prox-postcard', 'prox-bullseye', 'prox-pinpoint'];

function earnForKm(km) {
  // Passport and flyover tiers must share the exact, unrounded boundary check.
  return {
    pinpoint: EARN_PINPOINT,
    bullseye: EARN_BULLSEYE,
    near: EARN_NEAR,
  }[flyoverTier(km)] || 0;
}

// Accuracy tiers add their earned frame; location difficulty has no card visual.
function applyCardTier(el, item, earned) {
  el.classList.remove(...PROX_CLASSES.filter(Boolean));
  if (!item) return;
  if (earned) el.classList.add(PROX_CLASSES[earned]);
}

// The one accuracy badge every surface uses (styles: .prox-badge in styles/game.css).
// host must be positioned; size is '' (icon + label), 'compact' (icon) or 'large'.
const PROX_BADGES = { [EARN_BULLSEYE]: ['🎯', 'Bullseye'], [EARN_PINPOINT]: ['📍', 'Pinpoint'] };
function setProxBadge(host, earned, size = '') {
  const old = host.querySelector(':scope > .prox-badge');
  const badge = PROX_BADGES[earned];
  if (!badge) { old?.remove(); return; }
  const el = old || document.createElement('span');
  el.className = `prox-badge${size ? ` ${size}` : ''}`;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', badge[1]);
  el.innerHTML = `<i aria-hidden="true">${badge[0]}</i><b aria-hidden="true">${badge[1]}</b>`;
  if (!old) host.append(el);
}
let passportDirty = true; // dots need rebuilding before the next start screen
let locationIndex = null; // built lazily; locations arrive after this section runs

function passportLocation(id) {
  if (!locationIndex) locationIndex = new Map(state.locations.map((item) => [item.id, item]));
  return locationIndex.get(id);
}

// The one "have we been here" predicate (passport, dex grid and collections all
// share it). Older visits recorded before passport.meta shipped still count.
function isVisited(id) { return Object.hasOwn(state.passport.visits, id); }

function tierOf(base) {
  if (base >= PASSPORT_GOLD) return 'gold';
  if (base >= PASSPORT_CYAN) return 'cyan';
  return 'dim';
}

function readPassport() {
  const raw = readJSON(PASSPORT_KEY);
  const visits = {};
  const order = [];
  const migrateScores = raw && raw.v !== 2;
  let migrated = migrateScores;
  if (raw && raw.visits && typeof raw.visits === 'object') {
    for (const [id, base] of Object.entries(raw.visits)) {
      const score = Number(base) * (migrateScores ? 10 : 1);
      // Unicode letters: 8 ids carry accents (gorée-island-…, park-güell-…).
      if (!/^[\p{L}\p{N}_-]{1,64}$/u.test(id) || !Number.isFinite(score)) continue;
      visits[id] = clamp(Math.round(score), 0, 1000);
      if (migrateScores) raw.visits[id] = visits[id];
      order.push(id);
    }
  }
  // The stored order is oldest -> newest; re-apply it so the caps keep the newest.
  if (raw && Array.isArray(raw.order)) {
    const age = new Map(raw.order.map((id, i) => [id, i]));
    order.sort((a, b) => (age.has(a) ? age.get(a) : -1) - (age.has(b) ? age.get(b) : -1));
  }
  const meta = {};
  if (raw && raw.meta && typeof raw.meta === 'object') {
    for (const [id, m] of Object.entries(raw.meta)) {
      if (!(id in visits) || !m || typeof m !== 'object') continue;
      const entry = {};
      if (Number.isFinite(m.b)) {
        entry.b = clamp(Math.round(m.b * (migrateScores ? 10 : 1)), 0, 1000);
        if (migrateScores) m.b = entry.b;
      }
      if (Number.isFinite(m.d)) entry.d = Math.max(0, Math.round(m.d));
      if (typeof m.f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.f)) entry.f = m.f;
      if (Number.isFinite(m.t)) entry.t = m.t;
      if (m.e === EARN_NEAR || m.e === EARN_BULLSEYE || m.e === EARN_PINPOINT) entry.e = m.e;
      for (const key of ['ea', 'eb1', 'eb2', 'eb3']) {
        if (Number.isFinite(m[key])) entry[key] = m[key];
      }
      // Pinpoint was added after distances were already stored. Rebuild the tier
      // from the best distance, but retain any higher tier already awarded.
      if (Number.isFinite(entry.d)) {
        const earned = Math.max(entry.e || 0, earnForKm(entry.d));
        if (earned > (entry.e || 0)) {
          entry.e = earned;
          m.e = earned;
          migrated = true;
        }
      }
      meta[id] = entry;
    }
  }
  if (migrateScores) raw.v = 2;
  if (migrated) writeJSON(PASSPORT_KEY, raw);
  return { visits, order: order.slice(-PASSPORT_ORDER_LIMIT), meta };
}

// canEarn false (endless) logs the visit and progress but awards no postcard;
// a card earned earlier is kept either way.
function recordVisit(id, base, km, canEarn = true) {
  if (!id || !Number.isFinite(base)) return 0;
  const score = clamp(Math.round(base), 0, 1000);
  // Keep a visit logged before meta existed undated: its real first visit is unknown.
  const legacy = id in state.passport.visits && !state.passport.meta[id];
  const prev = state.passport.meta[id] || {};
  const prevEarned = prev.e || 0;
  const entry = { b: Math.max(score, prev.b ?? (legacy ? state.passport.visits[id] : 0)), t: Date.now() };
  const kms = [km, prev.d].filter(Number.isFinite);
  if (kms.length) entry.d = Math.round(Math.min(...kms));
  if (prev.f || !legacy) entry.f = prev.f || localDateKey();
  const earned = Math.max(prevEarned, Number.isFinite(km) && canEarn ? earnForKm(km) : 0);
  if (earned) entry.e = earned;
  // earnedAt: timestamp of first earn, set once and never overwritten
  if (earned && !prev.ea) entry.ea = Date.now();
  else if (prev.ea) entry.ea = prev.ea;
  // Track when each tier was first achieved for upgrade history
  if (earned >= 1 && prevEarned < 1 && !prev.eb1) entry.eb1 = Date.now();
  else if (prev.eb1) entry.eb1 = prev.eb1;
  if (earned >= 2 && prevEarned < 2 && !prev.eb2) entry.eb2 = Date.now();
  else if (prev.eb2) entry.eb2 = prev.eb2;
  if (earned >= 3 && prevEarned < 3 && !prev.eb3) entry.eb3 = Date.now();
  else if (prev.eb3) entry.eb3 = prev.eb3;
  state.passport.meta[id] = entry;
  state.passport.visits[id] = score;
  const at = state.passport.order.indexOf(id);
  if (at !== -1) state.passport.order.splice(at, 1);
  state.passport.order.push(id);
  if (state.passport.order.length > PASSPORT_ORDER_LIMIT) state.passport.order = state.passport.order.slice(-PASSPORT_ORDER_LIMIT);
  writeJSON(PASSPORT_KEY, { v: 2, visits: state.passport.visits, order: state.passport.order, meta: state.passport.meta });
  passportDirty = true;
  // Return newly earned tier (0 if not newly earned)
  return earned > prevEarned ? earned : 0;
}


// Soft round dot: one texture, per-dot colour from a vertex attribute.
const dotTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.42, 'rgba(255,255,255,.95)');
  grad.addColorStop(0.72, 'rgba(255,255,255,.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();
const DOT_TIERS = {
  gold: new THREE.Color('#ffd166'),
  cyan: new THREE.Color('#67e8ff'),
  dim: new THREE.Color('#5d84a6'),
};
const passportDots = new THREE.Points(
  new THREE.BufferGeometry(),
  new THREE.PointsMaterial({
    size: 0.085,
    map: dotTex,
    vertexColors: true,
    transparent: true,
    depthWrite: false, // the globe sphere still occludes the far side
    sizeAttenuation: true,
  }),
);
passportDots.visible = false;
passportDots.renderOrder = 2;
globe.add(passportDots);
window.__passportDots = passportDots; // test hook: the start-screen dot cloud

const _dotVec = new THREE.Vector3();
function buildPassportDots() {
  const spots = state.passport.order
    .map((id) => ({ item: passportLocation(id), base: state.passport.visits[id] }))
    .filter((spot) => spot.item)
    .slice(-PASSPORT_DOT_LIMIT);
  const positions = new Float32Array(spots.length * 3);
  const colors = new Float32Array(spots.length * 3);
  const color = new THREE.Color();
  spots.forEach((spot, i) => {
    latLngToVec3(spot.item.lat, spot.item.lng, DOT_RADIUS, _dotVec).toArray(positions, i * 3);
    color.copy(DOT_TIERS[tierOf(spot.base)]).toArray(colors, i * 3);
  });
  passportDots.geometry.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  passportDots.geometry = geometry;
  passportDirty = false;
}

// The start-screen passport summary, the Passport page, Collections and the
// postcard detail live in src/meta/passport.js. They reach main.js only
// through passportHost; the store above stays here because rounds write it.
const passportHost = {
  AUDIT_MODE,
  CONTINENT_ORDER,
  EARN_NEAR,
  EARN_BULLSEYE,
  EARN_PINPOINT,
  EARN_NAMES,
  gameEls,
  get locations() { return state.locations; },
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
body.expedition-mode .round-header, body.expedition-mode #reveal-card { border-color: rgba(255,209,102,.45); background: rgba(31,23,8,.88); }
body.expedition-mode #reveal-card .score-math { display: none; }
body.expedition-mode .round-meta span:first-child { color: #ffd166; }`;
document.head.appendChild(expeditionStyle);

initExpeditions(modeHost);

// ---------------------------------------------------------------------------
// PvP challenges live in src/pvp/ (api, home, h2h, group, play). They reach
// main.js only through pvpHost; the round screen, game state and the reveal
// (including the PvP timeout reveal below) stay here.
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

// The server resolved the round as a timeout: the answer, no guess, zero.
function pvpRevealTimeout(answer) {
  state.gameMode = 'reveal';
  window.__canGuess = false;
  clearPendingGuess();
  const headerFrom = gameEls.header.offsetHeight;
  document.body.className = 'game-reveal pvp';
  gameEls.hint.textContent = '';
  const placeName = answer.clue || answer.short;
  gameEls.revealName.textContent = placeName;
  gameEls.peekName.textContent = placeName;
  gameEls.fact.textContent = answer.fact || '';
  setThumb(gameEls.thumb, answer.image);
  setThumb(gameEls.peekThumb, answer.image);
  peekSlot.hidden = !answer.image;
  setRevealThumbState(answer, isVisited(answer.id), state.passport.meta[answer.id]?.e || 0);
  gameEls.mult.style.display = 'none';
  gameEls.score.textContent = '0';
  gameEls.distance.textContent = 'Out of time';
  gameEls.revealPill.classList.remove('safe', 'miss');
  gameEls.revealPill.classList.add('miss');
  gameEls.revealPill.textContent = 'Out of time · 0';
  gameEls.next.textContent = pvp.result || pvp.round >= 5 ? 'Results' : 'Next';
  pvpRenderVs();
  if (headerFrom > REVEAL_HEADER_H) collapseRoundHeader(headerFrom);
  if (state.activePin >= 0) pins[state.activePin].release();
  state.activePin = -1;
  const b = latLngToVec3(answer.lat, answer.lng);
  correctPin.drop(b);
  frameRevealPoints(b, b);
  showCountryOutline(countryKey(answer), answer, false);
  startRevealBeat(b, b, false);
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
  locationIndex = null;
  buildCountryIndex();
  loadDaily();
  syncPassport();
  syncDailyButton();
  gameEls.startStreak.textContent = streakText();
  gameEls.play.disabled = false;
  endlessEls.entry.disabled = false;
  gameEls.survivalEntry.disabled = false;
  syncBordersEntry();
  updateExpeditionEntry();
  passportEntry.disabled = false;
  collectionsEntry.disabled = false;
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
getJSON('assets/expeditions.json').then(expeditionsLoaded).catch((err) => {
  gameEls.expeditionsEntry.disabled = true;
  if (window.__showErr) window.__showErr('EXPEDITIONS: ' + err.message);
});
gameEls.play.disabled = true;
endlessEls.entry.disabled = true;
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
