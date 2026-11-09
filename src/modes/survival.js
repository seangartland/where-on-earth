// ---------------------------------------------------------------------------
// Survival mode: each round draws a new target; one miss over 150 km ends the
// run
//
// Moved out of main.js in refactor Phase 4, with the run-over screen and the
// Survival hub that the three Survival modes share. Tap the Country
// (tap-country.js) and Country Blackout (blackout.js) build on this module;
// it reaches them, and main.js, only through the host passed to
// initSurvival() at the spot the section used to run.
// ---------------------------------------------------------------------------
import { isLandmark, isPlayableLocation } from '../daily.js';
import { SHARE_URL } from '../core/format.js';
import { landmarkPool, LANDMARKS_BEST_KEY } from './landmarks.js';
// triviaHubLine comes through the host, not an import: trivia.js imports this
// module, and a back-import would form a cycle the deploy versioning rejects.

let host = null;
const SURVIVAL_BEST_KEY = 'where-on-earth-survival-best-v1';
const SURVIVAL_RUN_KEY = 'where-on-earth-survival-run-v1';
const SURVIVAL_LIMIT_KM = 150;

// The merged Survival pool (pacing doc, 2026-10-18): every playable city plus
// the Landmark pool. If the landmarks file failed to load, landmarkPool() is
// empty and the pool falls back to cities only.
export function mergedSurvivalPool() {
  return [
    ...host.locations.filter((item) => isPlayableLocation(item) && !isLandmark(item)),
    ...landmarkPool(),
  ];
}

// A Survival run's source: label (results heading), pool (what rounds draw
// from), resultsId (runResultsMode) and bestKey. Optional shareText() gives a
// mode its own share text.
const CLASSIC = {
  label: 'Survival',
  pool: mergedSurvivalPool,
  resultsId: 'survival',
  bestKey: SURVIVAL_BEST_KEY,
};
let source = CLASSIC;
export const survival = {
  active: false,
  item: null,
  forced: null,
  round: 0,
  survived: 0,
  lastDistance: null,
  missed: false,
  results: [],
};

// With no key, the merged Survival best: the max of the legacy Classic and
// Landmark keys, so bests set under the old separate modes are honored and
// neither stored key is rewritten or deleted.
export function survivalBest(key) {
  if (!key) return Math.max(survivalBest(SURVIVAL_BEST_KEY), survivalBest(LANDMARKS_BEST_KEY));
  try {
    return Math.max(0, Number.parseInt(localStorage.getItem(key), 10) || 0);
  } catch {
    return 0;
  }
}

function saveSurvivalBest(value) {
  const best = Math.max(survivalBest(), value);
  host.safeSetItem(source.bestKey, String(best));
  return best;
}

// The run in progress, saved at every draw and every survived guess so a
// refresh or crash resumes it (Daily's saveDaily pattern). Items are stored
// by id; the haul is the run-over screen's postcards.
function saveSurvivalRun() {
  host.safeSetItem(SURVIVAL_RUN_KEY, JSON.stringify({
    round: survival.round,
    survived: survival.survived,
    item: survival.item.id,
    results: survival.results.map((r) => ({ id: r.item.id, distance: r.distance })),
    haul: host.runHaul.map((h) => ({ id: h.item.id, result: h.result })),
  }));
}

export function clearSurvivalRun() {
  try { localStorage.removeItem(SURVIVAL_RUN_KEY); } catch { /* unavailable */ }
}

// The saved run with its ids resolved, or null. A save that fails to parse or
// names an unknown item is dropped, and the mode starts fresh.
function savedSurvivalRun() {
  try {
    const raw = JSON.parse(localStorage.getItem(SURVIVAL_RUN_KEY));
    if (!raw) return null;
    const byId = new Map([...host.locations, ...(host.landmarks || [])].map((item) => [item.id, item]));
    const find = (id) => { const item = byId.get(id); if (!item) throw new Error(`unknown id ${id}`); return item; };
    const results = raw.results.map((r) => {
      if (!Number.isFinite(r.distance)) throw new Error('bad distance');
      return { item: find(r.id), distance: r.distance };
    });
    const haul = raw.haul.map((h) => {
      if (!h.result || typeof h.result !== 'object' || !h.result.postcard) throw new Error('bad haul entry');
      return { item: find(h.id), result: h.result };
    });
    const item = find(raw.item);
    const resolved = results.at(-1)?.item === item;
    if (!Number.isInteger(raw.round) || raw.round !== results.length + (resolved ? 0 : 1)
      || !Number.isInteger(raw.survived) || raw.survived !== results.length) throw new Error('inconsistent run');
    return { round: raw.round, survived: raw.survived, item, results, haul, resolved };
  } catch {
    clearSurvivalRun();
    return null;
  }
}

export function randomDifficultyBand() {
  return Math.floor(Math.random() * 10) + 1;
}

// Independent uniform draw from targets not already used in this run.
export function survivalPick() {
  const used = new Set(survival.results.map((result) => result.item.id));
  const choices = source.pool().filter((item) => !used.has(item.id));
  if (!choices.length) return null;
  return choices[Math.floor(Math.random() * choices.length)];
}

function survivalGo() {
  survival.round += 1;
  survival.item = survival.forced || survivalPick();
  if (survival.forced) survival.forced = null;
  survival.lastDistance = null;
  survival.missed = false;
  if (!survival.item) {
    survival.round -= 1;
    clearSurvivalRun();
    host.showRunHaul(showSurvivalGameOver, 'See run');
    return;
  }
  saveSurvivalRun();
  host.showRound();
}

// saved: a savedSurvivalRun() to resume; without one the run starts fresh.
export function startSurvival(from = CLASSIC, saved = null) {
  if (!host.locations.length) return;
  source = from;
  host.expeditionRun.active = false;
  host.endless.active = false;
  host.borders.active = false;
  survival.active = true;
  runResultsMode = source.resultsId;
  survival.item = null;
  survival.round = 0;
  survival.survived = 0;
  survival.lastDistance = null;
  survival.missed = false;
  survival.results.length = 0;
  host.runHaul.length = 0;
  if (saved) {
    survival.round = saved.round - (saved.resolved ? 0 : 1);
    survival.survived = saved.survived;
    survival.results.push(...saved.results);
    host.runHaul.push(...saved.haul);
    if (!saved.resolved) survival.forced = saved.item; // the round it was on
  }
  survivalGo();
}

// The Survival entry: resume the saved run if there is one.
export function enterSurvival() {
  if (!host.locations.length) return;
  startSurvival(CLASSIC, savedSurvivalRun());
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

// Practice hub: the one home entry for the practice modes. Survival is a
// family with three styles (Cities & places, Tap the Country, Trivia clues)
// behind one hub row; Country Blackout stays a peer row. Each style keeps
// its own click handler; hideScreens closes the hub on the way out.

// The hub has two views: the main list and the Survival styles list.
function setHubView(view) {
  const styles = view === 'styles';
  document.getElementById('hub-main-list').hidden = styles;
  document.getElementById('hub-survival-view').hidden = !styles;
  document.getElementById('survival-hub-heading').textContent = styles ? 'Survival' : 'Practice';
  document.getElementById('hub-intro').textContent = styles
    ? 'Three styles, one rule: a miss ends the run.'
    : 'Play freely. Practice records visits and bests, but postcards are earned in the Daily, the pack and Expeditions.';
}

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
  hub.querySelector('[data-hub-best="trivia"]').textContent = host.triviaHubLine();
  setHubView('main');
  hub.hidden = false;
}

// The round screen's Survival variant (main.js showRound, revealGuess and
// nextRound call these in the Survival branch).
export function survivalRoundHeader() {
  const { gameEls } = host;
  document.body.classList.add('survival');
  gameEls.number.textContent = `Streak ${survival.survived}`;
  gameEls.weight.style.display = 'none';
  // Directions live in the Practice hub subtitle; this line is reveal text.
  gameEls.survivalStreak.textContent = '';
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
  // revealGuess has recorded the guess and its haul entry by now.
  if (survival.missed) clearSurvivalRun();
  else saveSurvivalRun();
}

export function survivalNext() {
  if (survival.missed) host.showRunHaul(showSurvivalGameOver, 'See run');
  else survivalGo();
}

// Section setup, run from main.js where the Survival section used to start.
export function initSurvival(main) {
  host = main;
  const { gameEls } = host;
  gameEls.survivalEntry.addEventListener('click', enterSurvival);
  globalThis.document?.getElementById('survival-styles-entry')?.addEventListener('click', () => setHubView('styles'));
  globalThis.document?.getElementById('survival-styles-back')?.addEventListener('click', () => setHubView('main'));
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
