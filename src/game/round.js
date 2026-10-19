// ---------------------------------------------------------------------------
// The shared round screen (refactor Phase 5): the clue card, placing a guess
// and Lock in, the reveal card, Next, and the PvP timeout reveal. Every mode
// plays its rounds through here. initRound(host) wires the listeners; the
// host supplies the globe, the modes, the Daily screens and the passport
// store, which sit outside the game layer.
// ---------------------------------------------------------------------------
import { LOCK_ARM_MS, WEIGHTS, flyoverTier, EARN_BULLSEYE, EARN_PINPOINT } from '../core/config.js';
import { state } from '../core/state.js';
import { setThumb } from '../core/dom.js';
import { formatKm, formatDailyDate, countryKey } from '../core/format.js';
import { distanceScore, scoreGuess, scoringDistanceKm } from './scoring.js';

let host = null;
let pins, correctPin, answerLine, peekSlot, latLngToVec3, buildAnswerPath, placeRevealVisual;
let frameRevealPoints, frameNorthUpRevealPoints, showCountryOutline, showLineLabel, showRevealSheet;
let startRevealBeat, collapseRoundHeader, REVEAL_HEADER_H, beginBullseyeReveal, beginTravelReveal;
let whenPostcardDone, clearReveal, survival, borders, expeditionRun, endless, expeditionRoundHeader;
let bordersRoundHeader, survivalRoundHeader, endlessRoundHeader, bordersClue, survivalRecordGuess;
let completeExpeditionRound, expeditionRevealCard, survivalRevealCard, bordersNext, survivalNext;
let expeditionNext, endlessNext, revealBorders, pvpRenderVs, pvpNext, pvpSubmit, saveDaily, runHaul;
let showPostcardSummary, recordVisit, applyCardTier, isVisited;
let trivia, triviaRoundHeader, triviaRecordGuess, triviaNext;

// Guessing is two steps: tap the globe to place (or move) the pin, then press
// Lock in. The button sits in a fixed spot in the thumb zone, away from the
// pin, so the finger never hides the placement and a stray tap can't confirm.
const lockButton = document.getElementById('lock-button');
let lockArmedAt = 0;

export function setGuessHint(text, nudge = false) {
  const hint = document.getElementById('guess-hint');
  if (!hint) return;
  hint.textContent = text;
  hint.style.color = nudge ? '#ffc76a' : '';
}

export function showLockButton() {
  if (lockButton.hidden) lockArmedAt = performance.now() + LOCK_ARM_MS;
  lockButton.hidden = false;
  document.body.classList.add('has-guess');
}

export function clearPendingGuess() {
  state.pendingGuess = null;
  lockButton.hidden = true;
  document.body.classList.remove('has-guess');
}

// The canvas is a sibling of the HUD, not an ancestor, so stopping propagation
// on the button can't shield it. A tap that misses the button by a few px (its
// glow reads as part of it) hit-tests to the globe and would move the pin to
// the button's spot, so the canvas ignores placement taps on or near it.
const LOCK_TAP_SLOP = 16; // css px
export function nearLockButton(x, y) {
  if (lockButton.hidden) return false;
  const r = lockButton.getBoundingClientRect();
  return x > r.left - LOCK_TAP_SLOP && x < r.right + LOCK_TAP_SLOP
    && y > r.top - LOCK_TAP_SLOP && y < r.bottom + LOCK_TAP_SLOP;
}

// Skip pin placement when tapping on/near top UI (X buttons, header).
// Prevents pins dropping behind the X when zoomed in.
const TOP_UI_SLOP = 8; // css px
export function nearTopUI(x, y) {
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

// The round screen and its reveal card.
export const gameEls = {
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
  moreModesHub: document.getElementById('more-modes-hub'),
  moreModesEntry: document.getElementById('more-modes-button'),
  landmarksEntry: document.getElementById('landmarks-button'),
  triviaEntry: document.getElementById('trivia-button'),
  survivalStreak: document.getElementById('survival-streak'),
  survivalResults: document.getElementById('survival-results-screen'),
  survivalResultTitle: document.getElementById('survival-result-title'),
  survivalFinalStreak: document.getElementById('survival-final-streak'),
  survivalBestStreak: document.getElementById('survival-best-streak'),
  survivalShare: document.getElementById('survival-share'),
  survivalShareStatus: document.getElementById('survival-share-status'),
  survivalAgain: document.getElementById('survival-again'),
  survivalHome: document.getElementById('survival-home'),
  runBreakdown: document.getElementById('run-breakdown'),
  runBreakdownList: document.getElementById('run-results-breakdown'),
  expeditionsEntry: document.getElementById('expeditions-button'),
};

export const pvpScreenEls = []; // set once the PvP screens are built

export function hideScreens() {
  gameEls.start.hidden = gameEls.round.hidden = gameEls.postcardSummaryScreen.hidden = gameEls.results.hidden = true;
  gameEls.survivalResults.hidden = true;
  gameEls.runBreakdown.hidden = true;
  gameEls.survivalHub.hidden = true;
  gameEls.moreModesHub.hidden = true;
  host.reviewEls.screen.hidden = true;
  if (state.statsScreenEl) state.statsScreenEl.hidden = true;
  if (state.settingsScreenEl) state.settingsScreenEl.hidden = true;
  if (state.passportScreenEl) state.passportScreenEl.hidden = true;
  if (state.collectionsScreenEl) state.collectionsScreenEl.hidden = true;
  for (const el of pvpScreenEls) el.hidden = true;
  document.body.className = '';
}

export function showRound() {
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
  } else if (trivia.active) {
    triviaRoundHeader();
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
export function showEarnToast(answer, tier) {
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
export function postcardRoundOutcome(previousEarn, newlyEarned) {
  if (!newlyEarned) return { kind: 'miss' };
  return {
    kind: previousEarn ? 'upgrade' : 'new',
    tier: newlyEarned,
  };
}

export function revealGuess(guess, restoring = false) {
  if (state.gameMode !== 'guess' && !restoring) return;
  const answer = currentItem();
  const kmExact = scoringDistanceKm(guess, answer);
  // PvP shows the server's accepted distance and score; the local exact
  // distance only picks the flyover tier.
  const pvpScored = pvp.active ? pvp.reveal : null;
  const km = pvpScored ? pvpScored.distanceKm : Math.round(kmExact);
  const base = pvpScored ? pvpScored.score : Math.round(distanceScore(kmExact));
  const oneOff = survival.active || endless.active || expeditionRun.active || pvp.active || trivia.active; // outside the daily
  const score = oneOff ? 0 : scoreGuess(kmExact, state.daily.round);
  if (!restoring && survival.active) survivalRecordGuess(answer, km, kmExact);
  if (!restoring && trivia.active) triviaRecordGuess(km, base);
  state.gameMode = 'reveal';
  window.__canGuess = false;
  const headerFrom = gameEls.header.offsetHeight;
  document.body.className = pvp.active ? 'game-reveal pvp'
    : expeditionRun.active ? 'game-reveal expedition-mode'
    : survival.active
    ? `game-reveal survival${survival.missed ? ' survival-miss' : ''}`
    : endless.active ? 'game-reveal endless'
    : trivia.active ? 'game-reveal trivia' : 'game-reveal';
  gameEls.hint.textContent = '';
  gameEls.distance.textContent = window.__travelAnim && !restoring ? '0 km' : formatKm(km);
  // Capture the passport state before this guess changes it. The reveal starts
  // with the thumbnail the player already had, then a new unlock can land in it.
  const wasVisited = Object.hasOwn(state.passport.visits, answer.id);
  const previousEarn = state.passport.meta[answer.id]?.e || 0;
  // Endless and PvP earn visits only; postcards come from daily and survival.
  // PvP records each accepted round once (pvp.recordVisit), never on a replay.
  // Trivia is score-only: it never records.
  const record = pvp.active ? pvp.recordVisit : !restoring && !trivia.active;
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
  gameEls.mult.textContent = `×${weight}`;
  gameEls.mult.style.display = oneOff ? 'none' : '';
  // A trivia entry's clue is the riddle; the reveal names the place.
  const placeName = trivia.active ? answer.short : answer.clue || answer.short;
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
  } else if (trivia.active) {
    gameEls.score.textContent = `+${base}`;
    pill.textContent = `+${base}`;
    gameEls.next.textContent = trivia.round >= 5 ? 'Results' : 'Next';
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
    beginBullseyeReveal(guess, answer, km, newlyEarned, tier, { plain: trivia.active });
  } else if (animate) beginTravelReveal(guess, answer, km, newlyEarned, tier, { plain: trivia.active });
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
export function applyThumbState(thumb, item, earned, visited) {
  const showGrayscale = visited && !earned;
  thumb.classList.toggle('seen-no-postcard', showGrayscale);
  thumb.classList.toggle('no-postcard', showGrayscale);
  applyCardTier(thumb, item, earned);
  thumb.parentElement.querySelector(':scope > .prox-badge')?.remove();
}

export function setRevealThumbState(item, visited, earned) {
  peekSlot.classList.toggle('mystery', !visited);
  for (const thumb of [gameEls.thumb, gameEls.peekThumb]) {
    applyThumbState(thumb, item, earned, visited);
  }
}

// Centralized thumbnail earn state: single source of truth for all modes.
// Returns the earn tier (0-3) that the thumbnail should display.
export function getThumbEarn(item) {
  if (!item) return 0;
  // Endless never earns postcards (visits only, by design)
  if (endless.active) return 0;
  return state.passport.meta[item.id]?.e || 0;
}

export function revealThumbCurrent() {
  const item = currentItem();
  const earned = getThumbEarn(item);
  const visited = Object.hasOwn(state.passport.visits, item.id);
  peekSlot.classList.remove('mystery');
  for (const thumb of [gameEls.thumb, gameEls.peekThumb]) {
    applyThumbState(thumb, item, earned, visited);
  }
}

export function nextRound() {
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
  else if (trivia.active) triviaNext();
  else if (state.daily.round >= 4) showPostcardSummary();
  else {
    state.daily.round += 1;
    saveDaily();
    showRound();
  }
}

// PvP challenge play (section below). item is the server-issued prompt until the
// guess is accepted, then the server answer.
export const pvp = { active: false, matchId: null, challengeId: null, group: false, round: 0, item: null, result: null };

export function currentItem() {
  if (borders.active) return null; // Borders asks for a country, not a location
  if (pvp.active) return pvp.item;
  if (trivia.active) return trivia.item;
  return expeditionRun.active ? expeditionRun.item : survival.active ? survival.item : endless.active ? endless.item : state.selected[state.daily.round];
}

// The server resolved the round as a timeout: the answer, no guess, zero.
export function pvpRevealTimeout(answer) {
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

// Lock in, the confirmed pin, and Next.
export function initRound(main) {
  host = main;
  ({ pins, correctPin, answerLine, peekSlot, latLngToVec3, buildAnswerPath, placeRevealVisual,
    frameRevealPoints, frameNorthUpRevealPoints, showCountryOutline, showLineLabel, showRevealSheet,
    startRevealBeat, collapseRoundHeader, REVEAL_HEADER_H, beginBullseyeReveal, beginTravelReveal,
    whenPostcardDone, clearReveal, survival, borders, expeditionRun, endless, expeditionRoundHeader,
    bordersRoundHeader, survivalRoundHeader, endlessRoundHeader, bordersClue, survivalRecordGuess,
    completeExpeditionRound, expeditionRevealCard, survivalRevealCard, bordersNext, survivalNext,
    expeditionNext, endlessNext, revealBorders, pvpRenderVs, pvpNext, pvpSubmit, saveDaily, runHaul,
    showPostcardSummary, recordVisit, applyCardTier, isVisited, trivia, triviaRoundHeader, triviaRecordGuess,
    triviaNext } = main);
  lockButton.addEventListener('click', () => {
    if (!state.pendingGuess || !window.__canGuess || state.gameMode !== 'guess') return;
    if (performance.now() < lockArmedAt) return; // the tail of a double tap on the globe
    const guess = state.pendingGuess;
    clearPendingGuess();
    if (navigator.vibrate) navigator.vibrate(20);
    window.dispatchEvent(new CustomEvent('pin', { detail: { ...guess, confirmed: true } }));
  });
  window.addEventListener('pin', (event) => (borders.active ? revealBorders(event.detail) : pvp.active ? pvpSubmit(event.detail) : revealGuess(event.detail)));
  gameEls.next.addEventListener('click', nextRound);
}
