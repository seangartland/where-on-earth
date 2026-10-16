// ---------------------------------------------------------------------------
// More modes hub and Landmarks mode: Classic Survival rules on the curated
// landmark pool. The run itself is survival.js with this file's source; the
// pool is also the Passport's Landmarks shelf.
// ---------------------------------------------------------------------------
import { isPlayableLocation } from '../daily.js';
import { survival, survivalBest, startSurvival } from './survival.js';
import { triviaHubLine } from './trivia.js';

let host = null;

// The v2 difficultyWhy shape from scripts/validate-landmarks.mjs; its trailing
// level must equal the stored difficulty.
const V2_WHY = /^p(?:1|\.\d{2})(?:\(via [^)]+\))?·fb\d+·K[\d.]+·iso\d+ → \d+(?:\.\d)? → (\d+)$/;

// Pool rule: kind landmark, playable in the game, and a measured v2 rating.
export function isPoolLandmark(item) {
  if (item?.kind !== 'landmark' || !isPlayableLocation(item)) return false;
  const match = V2_WHY.exec(item.difficultyWhy || '');
  return Boolean(match) && Number(match[1]) === item.difficulty;
}

let poolFrom = null;
let pool = [];
export function landmarkPool() {
  if (host.landmarks !== poolFrom) {
    poolFrom = host.landmarks;
    pool = (poolFrom || []).filter(isPoolLandmark);
  }
  return pool;
}

// Band range per round: rounds 1 to 10 ramp up, then every round is [9, 10].
const BAND_RAMP = [[1, 3], [1, 4], [2, 5], [3, 6], [4, 7], [5, 8], [6, 9], [7, 10], [8, 10], [9, 10]];
const LANDMARKS_BEST_KEY = 'where-on-earth-best-landmarks-survival';

function landmarksShareText() {
  const count = survival.survived;
  const survivedResults = survival.results.slice(0, count);
  return host.formatGameShare({
    title: landmarksSource.label,
    titleSep: ' · ',
    headline: `${count.toLocaleString()} ${count === 1 ? 'round' : 'rounds'} survived`,
    streak: survivalBest(LANDMARKS_BEST_KEY),
    guesses: host.closestGuessLines(survivedResults, survivedResults.map((entry) => entry.item)),
    visited: count,
  });
}

export const landmarksSource = {
  label: 'Landmark Survival',
  pool: landmarkPool,
  resultsId: 'landmarks',
  bestKey: LANDMARKS_BEST_KEY,
  bands: (round) => BAND_RAMP[Math.min(round, BAND_RAMP.length) - 1],
  shareText: landmarksShareText,
};

function showMoreModesHub() {
  const { gameEls } = host;
  host.clearReveal();
  host.hideScreens();
  host.gameMode = 'more-modes-hub';
  window.__canGuess = false;
  const count = landmarkPool().length;
  const best = survivalBest(LANDMARKS_BEST_KEY);
  gameEls.moreModesHub.querySelector('[data-hub-best="landmarks"]').textContent = count
    ? `${count.toLocaleString()} landmarks${best ? ` · Best streak ${best.toLocaleString()}` : ''}`
    : '';
  gameEls.moreModesHub.querySelector('[data-hub-best="trivia"]').textContent = triviaHubLine();
  gameEls.moreModesHub.hidden = false;
}

// Landmarks and cities both load before the row can start a run.
export function syncLandmarksEntry() {
  host.gameEls.landmarksEntry.disabled = !(host.locations.length && landmarkPool().length);
}

export function initLandmarks(main) {
  host = main;
  const { gameEls } = host;
  gameEls.moreModesEntry.addEventListener('click', showMoreModesHub);
  gameEls.moreModesHub.addEventListener('click', (event) => { if (event.target === gameEls.moreModesHub) host.goHome(); });
  gameEls.landmarksEntry.addEventListener('click', () => startSurvival(landmarksSource));
}
