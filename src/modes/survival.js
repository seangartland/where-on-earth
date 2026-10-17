// ---------------------------------------------------------------------------
// Survival mode: each round draws a random difficulty band; one miss over 150
// km ends the run
//
// Moved out of main.js in refactor Phase 4, with the run-over screen and the
// Survival hub that the three Survival modes share. Tap the Country
// (tap-country.js) and Country Blackout (blackout.js) build on this module;
// it reaches them, and main.js, only through the host passed to
// initSurvival() at the spot the section used to run.
// ---------------------------------------------------------------------------
import { isLandmark, isPlayableLocation } from '../daily.js';
import { SHARE_URL } from '../core/format.js';

let host = null;
const SURVIVAL_BEST_KEY = 'where-on-earth-survival-best-v1';
const SURVIVAL_LIMIT_KM = 150;

// A Survival run's source: label (results heading), pool (what rounds draw
// from), resultsId (runResultsMode) and bestKey. Optional bands(round) gives
// the round's [lo, hi] band range and shareText() a mode's own share text.
// Classic Survival is the cities pool with a uniform 1 to 10 band draw.
const CLASSIC = {
  label: 'Survival',
  pool: () => host.locations.filter((item) => isPlayableLocation(item) && !isLandmark(item)),
  resultsId: 'survival',
  bestKey: SURVIVAL_BEST_KEY,
};
let source = CLASSIC;
export const survival = {
  active: false,
  item: null,
  band: null,
  round: 0,
  survived: 0,
  lastDistance: null,
  missed: false,
  results: [],
};

export function survivalBest(key = SURVIVAL_BEST_KEY) {
  try {
    return Math.max(0, Number.parseInt(localStorage.getItem(key), 10) || 0);
  } catch {
    return 0;
  }
}

function saveSurvivalBest(value) {
  const best = Math.max(survivalBest(source.bestKey), value);
  host.safeSetItem(source.bestKey, String(best));
  return best;
}

export function randomDifficultyBand() {
  return Math.floor(Math.random() * 10) + 1;
}

// Independent uniform draw from the requested band. There is intentionally no
// bag, collection weighting, or repeat prevention in Survival.
function survivalPick() {
  if (source.bands) {
    const [lo, hi] = source.bands(survival.round);
    survival.band = lo + Math.floor(Math.random() * (hi - lo + 1));
  } else {
    survival.band = randomDifficultyBand();
  }
  const playable = source.pool();
  const bandChoices = playable.filter((item) => Number(item.difficulty) === survival.band);
  const choices = bandChoices.length ? bandChoices : playable;
  if (!choices.length) return null;
  return choices[Math.floor(Math.random() * choices.length)];
}

function survivalGo() {
  survival.round += 1;
  survival.item = survivalPick();
  survival.lastDistance = null;
  survival.missed = false;
  if (!survival.item) {
    survival.round -= 1;
    host.showRunHaul(showSurvivalGameOver, 'See run');
    return;
  }
  host.showRound();
}

export function startSurvival(from = CLASSIC) {
  if (!host.locations.length) return;
  source = from;
  host.expeditionRun.active = false;
  host.endless.active = false;
  host.borders.active = false;
  survival.active = true;
  runResultsMode = source.resultsId;
  survival.item = null;
  survival.band = null;
  survival.round = 0;
  survival.survived = 0;
  survival.lastDistance = null;
  survival.missed = false;
  survival.results.length = 0;
  host.runHaul.length = 0;
  survivalGo();
}

function showSurvivalGameOver() {
  const { gameEls } = host;
  host.clearReveal();
  host.hideScreens();
  host.gameMode = 'survival-results';
  window.__canGuess = false;
  gameEls.survivalResults.hidden = false;
  document.body.className = 'game-results survival';
  const count = survival.survived;
  const best = saveSurvivalBest(count);
  setRunResultsCopy(`${source.label} run over`, 'One miss over 150 km ends the run.', 'Survived');
  gameEls.survivalResultTitle.textContent = `${count} ${count === 1 ? 'round' : 'rounds'} survived`;
  gameEls.survivalFinalStreak.textContent = count.toLocaleString();
  gameEls.survivalBestStreak.textContent = best.toLocaleString();
  gameEls.survivalShare.textContent = 'Share result';
  gameEls.survivalShareStatus.textContent = '';
}

function survivalShareText() {
  if (runResultsMode === 'blackout') return host.blackoutShareText();
  if (runResultsMode === 'borders') return host.bordersShareText();
  if (runResultsMode === 'trivia') return host.triviaShareText();
  if (source.shareText) return source.shareText();
  const count = survival.survived;
  const survivedResults = survival.results.slice(0, count);
  return host.formatGameShare({
    title: 'Survival',
    headline: `${count.toLocaleString()} ${count === 1 ? 'round' : 'rounds'} survived`,
    streak: survivalBest(),
    guesses: host.closestGuessLines(survivedResults, survivedResults.map((entry) => entry.item)),
    visited: count,
    url: `${SHARE_URL}?mode=survival`,
  });
}

// Survival, Borders and Trivia share the run-over screen.
export let runResultsMode = 'survival';
export function setRunResultsMode(mode) { runResultsMode = mode; }
export function setRunResultsCopy(eyebrow, summary, label, bestLabel = 'Best streak') {
  document.getElementById('survival-result-eyebrow').textContent = eyebrow;
  document.getElementById('survival-result-summary').textContent = summary;
  document.getElementById('survival-final-label').textContent = label;
  document.getElementById('survival-best-label').textContent = bestLabel;
}

// Survival hub: the one home entry for the three Survival modes. Its rows are
// the mode entries above (survival, borders, blackout buttons), so each keeps
// its own click handler; hideScreens closes the hub on the way out.

function showSurvivalHub() {
  const { gameEls } = host;
  host.clearReveal();
  host.hideScreens();
  host.gameMode = 'survival-hub';
  window.__canGuess = false;
  const streak = (best) => (best ? `Best streak ${best.toLocaleString()}` : '');
  const hub = gameEls.survivalHub;
  hub.querySelector('[data-hub-best="survival"]').textContent = streak(survivalBest());
  hub.querySelector('[data-hub-best="borders"]').textContent = streak(host.bordersBest());
  hub.querySelector('[data-hub-best="blackout"]').textContent = host.blackoutBestSummary();
  hub.hidden = false;
}

// The round screen's Survival variant (main.js showRound, revealGuess and
// nextRound call these in the Survival branch).
export function survivalRoundHeader() {
  const { gameEls } = host;
  document.body.classList.add('survival');
  gameEls.number.textContent = `Streak ${survival.survived}`;
  gameEls.weight.style.display = 'none';
  gameEls.survivalStreak.textContent = survival.round === 1
    ? 'One miss over 150 km ends the run · Tap the globe to place your pin'
    : '';
  gameEls.dailyDate.hidden = true;
}

export function survivalRecordGuess(answer, km, kmExact) {
  survival.lastDistance = km;
  survival.missed = kmExact > SURVIVAL_LIMIT_KM;
  survival.results.push({ item: answer, distance: km });
  if (!survival.missed) {
    survival.survived += 1;
    saveSurvivalBest(survival.survived);
  }
  host.gameEls.number.textContent = `Streak ${survival.survived}`;
}

export function survivalRevealCard(pill) {
  const { gameEls } = host;
  gameEls.survivalStreak.textContent = survival.missed
    ? `Run ended · ${survival.survived} survived`
    : `${survival.survived} survived`;
  gameEls.score.textContent = survival.missed ? '✗ Run over' : `${survival.survived}`;
  pill.textContent = survival.missed ? '✗ Over 150 km' : '✓ Survived';
  pill.classList.add(survival.missed ? 'miss' : 'safe');
  gameEls.next.textContent = survival.missed ? 'See run' : 'Keep going';
}

export function survivalNext() {
  if (survival.missed) host.showRunHaul(showSurvivalGameOver, 'See run');
  else survivalGo();
}

// Section setup, run from main.js where the Survival section used to start.
export function initSurvival(main) {
  host = main;
  const { gameEls } = host;
  gameEls.survivalEntry.addEventListener('click', () => startSurvival());
  gameEls.survivalAgain.addEventListener('click', () => {
    if (runResultsMode === 'blackout') host.startBorders(host.borders.scope);
    else if (runResultsMode === 'borders') host.startBorders();
    else if (runResultsMode === 'trivia') host.startTrivia();
    else startSurvival(source);
  });

  gameEls.survivalShare.addEventListener('click', () => host.shareResult(
    survivalShareText(),
    gameEls.survivalShare,
    gameEls.survivalShareStatus,
  ));

  gameEls.survivalHubEntry.addEventListener('click', showSurvivalHub);
  gameEls.survivalHub.addEventListener('click', (event) => { if (event.target === gameEls.survivalHub) host.goHome(); });
}
