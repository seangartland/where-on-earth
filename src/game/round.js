// ---------------------------------------------------------------------------
// The shared round screen (refactor Phase 5): the clue card, placing a guess
// and Lock in, the reveal card, Next, and the PvP timeout reveal. Every mode
// plays its rounds through here. initRound(host) wires the listeners; the
// host supplies the globe, the modes, the Daily screens and the passport
// store, which sit outside the game layer.
// ---------------------------------------------------------------------------
import { ACCOUNTS_ENABLED, LOCK_ARM_MS, WEIGHTS, flyoverTier, EARN_BULLSEYE, EARN_PINPOINT } from '../core/config.js';
import { state } from '../core/state.js';
import { setThumb, gameEls } from '../core/dom.js';

export { gameEls };
import { formatKm, formatDailyDate, countryKey } from '../core/format.js';
import { distanceScore, scoreGuess, scoringDistanceKm } from './scoring.js';

let host = null;
let pins, correctPin, answerLine, peekSlot, latLngToVec3, buildAnswerPath, placeRevealVisual;
let frameRevealPoints, frameNorthUpRevealPoints, showCountryOutline, showExtentOutline, showLineLabel, showRevealSheet;
let startRevealBeat, beginBullseyeReveal, beginTravelReveal;
let whenPostcardDone, clearReveal, survival, borders, expeditionRun, endless, expeditionRoundHeader;
let bordersRoundHeader, survivalRoundHeader, endlessRoundHeader, bordersClue, survivalRecordGuess;
let completeExpeditionRound, expeditionRevealCard, survivalRevealCard, bordersNext, survivalNext;
let expeditionNext, endlessNext, revealBorders, pvpRenderVs, pvpNext, pvpSubmit, saveDaily, runHaul;
let showPostcardSummary, recordVisit, applyCardTier, isVisited;
let trivia, triviaRoundHeader, triviaRecordGuess, triviaNext;
let pack, packRoundHeader, packRecordGuess, packIsLastCard, packNext;

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
  for (const el of document.querySelectorAll('.home-nav, .round-header')) {
    if (el.offsetParent === null) continue; // hidden
    const r = el.getBoundingClientRect();
    if (x > r.left - TOP_UI_SLOP && x < r.right + TOP_UI_SLOP
      && y > r.top - TOP_UI_SLOP && y < r.bottom + TOP_UI_SLOP) {
      return true;
    }
  }
  return false;
}


export const pvpScreenEls = []; // set once the PvP screens are built

export function hideScreens() {
  gameEls.start.hidden = gameEls.round.hidden = gameEls.postcardSummaryScreen.hidden = gameEls.results.hidden = true;
  gameEls.survivalResults.hidden = true;
  gameEls.runBreakdown.hidden = true;
  gameEls.survivalHub.hidden = true;
  host.reviewEls.screen.hidden = true;
  if (state.statsScreenEl) state.statsScreenEl.hidden = true;
  if (state.settingsScreenEl) state.settingsScreenEl.hidden = true;
  if (state.passportScreenEl) state.passportScreenEl.hidden = true;
  if (state.collectionsScreenEl) state.collectionsScreenEl.hidden = true;
  if (state.packScreenEl) state.packScreenEl.hidden = true;
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
  } else if (pack.active) {
    packRoundHeader();
  } else {
    document.body.classList.add('daily');
    gameEls.number.textContent = `Round ${state.daily.round + 1} of 5`;
    gameEls.weight.style.display = 'none';
    gameEls.dailyDate.textContent = formatDailyDate(state.daily.date);
    gameEls.dailyDate.hidden = false;
  }
  if (borders.active) bordersClue();
  else gameEls.clue.textContent = item.clue;
  // The Daily is the fall-through branch above (no mode active). It drops the
  // standalone tap-to-place line and folds the instruction into the bottom
  // gesture line instead; every other mode keeps both exactly as they were.
  const dailyRound = !pvp.active && !expeditionRun.active && !borders.active
    && !survival.active && !endless.active && !trivia.active && !pack.active;
  setGuessHint(borders.active || survival.active || trivia.active || dailyRound ? '' : 'Tap the globe to place your pin');
  document.getElementById('hud').textContent = dailyRound
    ? 'Tap to place · Drag to spin · Pinch to zoom'
    : 'Drag to spin · Pinch to zoom';
}

// Compact earn toast: appears after the flyover completes, doesn't block the globe.
// The postcard is the payoff of the flight, not a competing modal.
// Tier 0 is the pack's first-visit variant: the grey card (spec 2d).
export function showEarnToast(answer, tier) {
  document.querySelector('.earn-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = `earn-toast${tier ? '' : ' seen'}`;
  const tierLabel = !tier ? 'Visited · added to your Passport' : tier === EARN_PINPOINT ? '📍 Pinpoint!' : tier === EARN_BULLSEYE ? '🎯 Bullseye!' : 'New postcard earned!';
  toast.innerHTML = `
    <img src="${answer.image || ''}" alt="">
    <div class="earn-toast-text">${tierLabel}<small>${tier ? answer.clue || answer.short || '' : 'Land within 150 km anywhere to colour it'}</small></div>
  `;
  document.body.appendChild(toast);
  // Animate in
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));
  // Auto-dismiss after 3s
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.remove(); }, 300);
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
  const oneOff = survival.active || endless.active || expeditionRun.active || pvp.active || trivia.active || pack.active; // outside the daily
  const score = oneOff ? 0 : scoreGuess(kmExact, state.daily.round);
  if (!restoring && survival.active) survivalRecordGuess(answer, km, kmExact);
  if (!restoring && trivia.active) triviaRecordGuess(km, base);
  state.gameMode = 'reveal';
  window.__canGuess = false;
  document.body.className = pvp.active ? 'game-reveal pvp'
    : expeditionRun.active ? 'game-reveal expedition-mode'
    : survival.active
    ? `game-reveal survival${survival.missed ? ' survival-miss' : ''}`
    : endless.active ? 'game-reveal endless'
    : trivia.active ? 'game-reveal trivia'
    : pack.active ? 'game-reveal pack' : 'game-reveal';
  gameEls.hint.textContent = '';
  gameEls.distance.textContent = window.__travelAnim && !restoring ? '0 km' : formatKm(km);
  // Capture the passport state before this guess changes it. The reveal starts
  // with the thumbnail the player already had, then a new unlock can land in it.
  const wasVisited = Object.hasOwn(state.passport.visits, answer.id);
  const previousEarn = state.passport.meta[answer.id]?.e || 0;
  // Endless, PvP and Survival earn visits only (Survival is Practice since the
  // 2026-10-18 pacing change); postcards come from the Daily, the pack and
  // Expeditions. PvP records each accepted round once (pvp.recordVisit), never
  // on a replay. Trivia is score-only: it never records.
  const record = pvp.active ? pvp.recordVisit : !restoring && !trivia.active;
  const newlyEarned = record ? recordVisit(answer.id, base, pvpScored ? pvpScored.distanceKm : kmExact, !endless.active && !pvp.active && !survival.active) : 0; // exact, so earning matches the flyover tier
  const packCard = !restoring && pack.active ? packRecordGuess(guess, km, kmExact, base, wasVisited, previousEarn, newlyEarned) : null;
  if (!restoring && !oneOff) {
    const slot = state.daily.round;
    const result = {
      guess,
      distance: km,
      score,
      base,
      distanceExact: kmExact,
      postcard: postcardRoundOutcome(previousEarn, newlyEarned),
    };
    state.daily.results[slot] = result;
    saveDaily();
    if (ACCOUNTS_ENABLED) {
      import('../account/session.js').then(({ isSignedIn }) => {
        if (!isSignedIn()) return;
        return import('../account/friends.js').then(({ submitDailyGuess }) => submitDailyGuess(result, slot));
      }).catch(() => {});
    }
  }
  if (!restoring && (survival.active || expeditionRun.active)) {
    const postcard = postcardRoundOutcome(previousEarn, newlyEarned);
    if (postcard.kind !== 'miss') runHaul.push({ result: { distance: km, distanceExact: kmExact, postcard }, item: answer });
  }
  if (!restoring && expeditionRun.active) completeExpeditionRound();
  gameEls.baseScore.textContent = base;
  // A trivia entry's clue is the riddle; the reveal names the place.
  const placeName = trivia.active ? answer.short : answer.clue || answer.short;
  gameEls.revealName.textContent = placeName;
  // A pack repeat with nothing new is labelled, never rerolled.
  if (packCard?.kind === 'repeat') gameEls.revealName.append(Object.assign(document.createElement('small'), { className: 'reveal-repeat', textContent: 'Already in your Passport' }));
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
  } else if (pack.active) {
    gameEls.score.textContent = `+${base}`;
    pill.textContent = `+${base}`;
    gameEls.next.textContent = packIsLastCard() ? 'Done' : 'Next card';
  } else {
    // Endless is unscored: no pill, and the peek bar shows just the distance.
    gameEls.score.textContent = endless.active ? '' : `+${score}`;
    pill.textContent = endless.active ? '' : `+${score}`;
    gameEls.next.textContent = endless.active ? 'Next' : state.daily.round === 4 ? 'Results' : 'Next';
  }
  const tier = flyoverTier(kmExact);
  const animate = window.__travelAnim !== false && !restoring;
  // Queue the earn celebration for after the flyover completes.
  // The earn toast is non-blocking, but holds off until the postcard has settled.
  // Friends' pins (signed-in Daily only) drop at that same moment.
  const earn = newlyEarned || packCard?.kind === 'visited';
  const friends = ACCOUNTS_ENABLED && !oneOff ? friendReveal(answer, guess, restoring) : null;
  if (earn || friends) {
    setTimeout(() => {
      const settled = () => {
        if (earn) showEarnToast(answer, newlyEarned);
        friends?.();
      };
      if (animate) whenPostcardDone(settled);
      else settled();
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
      showExtentOutline(answer, false);
    } else {
      ({ a, b } = placeRevealVisual(guess, answer));
    }
    gameEls.distance.textContent = answer.kind === 'extent' ? `${formatKm(km)} from nearest point` : formatKm(km);
    if (restoring) {
      // Coming back to a finished round: no beat to replay.
      showLineLabel(a, b);
      showRevealSheet(false);
    } else startRevealBeat(a, b, tier !== 'bullseye');
  }
}

// Friends' pins for a Daily round, from the lazily loaded overlay (signed in
// only). Returns the settle callback; nothing here delays the reveal.
function friendReveal(answer, guess, restoring) {
  const round = { date: state.daily.date, slot: state.daily.round, answer, guess, restoring };
  const ready = import('../account/session.js')
    .then(({ isSignedIn }) => (isSignedIn() ? import('../modes/daily-friends.js') : null))
    .then((overlay) => overlay?.beginFriendReveal(round))
    .catch(() => null);
  return () => ready.then((reveal) => reveal?.settle());
}

// Centralized thumbnail state update: applies earn tier and grayscale in one place.
// All modes must use this (via setRevealThumbState or revealThumbCurrent) to avoid drift.
export function applyThumbState(thumb, item, earned, visited) {
  const showGrayscale = visited && !earned;
  thumb.classList.toggle('seen-no-postcard', showGrayscale);
  thumb.classList.toggle('no-postcard', showGrayscale);
  applyCardTier(thumb, item, earned);
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
  else if (pack.active) packNext();
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
  if (pack.active) return pack.item;
  return expeditionRun.active ? expeditionRun.item : survival.active ? survival.item : endless.active ? endless.item : state.selected[state.daily.round];
}

// The server resolved the round as a timeout: the answer, no guess, zero.
export function pvpRevealTimeout(answer) {
  state.gameMode = 'reveal';
  window.__canGuess = false;
  clearPendingGuess();
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
  gameEls.score.textContent = '0';
  gameEls.distance.textContent = 'Out of time';
  gameEls.revealPill.classList.remove('safe', 'miss');
  gameEls.revealPill.classList.add('miss');
  gameEls.revealPill.textContent = 'Out of time · 0';
  gameEls.next.textContent = pvp.result || pvp.round >= 5 ? 'Results' : 'Next';
  pvpRenderVs();
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
    frameRevealPoints, frameNorthUpRevealPoints, showCountryOutline, showExtentOutline, showLineLabel, showRevealSheet,
    startRevealBeat, beginBullseyeReveal, beginTravelReveal,
    whenPostcardDone, clearReveal, survival, borders, expeditionRun, endless, expeditionRoundHeader,
    bordersRoundHeader, survivalRoundHeader, endlessRoundHeader, bordersClue, survivalRecordGuess,
    completeExpeditionRound, expeditionRevealCard, survivalRevealCard, bordersNext, survivalNext,
    expeditionNext, endlessNext, revealBorders, pvpRenderVs, pvpNext, pvpSubmit, saveDaily, runHaul,
    showPostcardSummary, recordVisit, applyCardTier, isVisited, trivia, triviaRoundHeader, triviaRecordGuess,
    triviaNext, pack, packRoundHeader, packRecordGuess, packIsLastCard, packNext } = main);
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
