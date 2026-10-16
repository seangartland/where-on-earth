// ---------------------------------------------------------------------------
// Trivia clues (More modes hub): five rounds, each prompted by a clue from
// assets/trivia-bank.json instead of a place name, scored by distance (1,000
// per round). Targets come only from the bank, whose entries carry their own
// id, lat, lng, image and clue. Score-only like PvP: no visits, no postcards.
// The results reuse the run-over screen (survival.js).
// ---------------------------------------------------------------------------
import { setRunResultsCopy, setRunResultsMode } from './survival.js';
import { formatKm } from '../core/format.js';

let host = null;
const TRIVIA_BEST_KEY = 'where-on-earth-best-trivia';
const ROUNDS = 5;

// One draw per band, easiest first. The bands are disjoint, so a game never
// repeats a target.
const BANDS = [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]];

let bank = [];
export const trivia = { active: false, round: 0, item: null, picks: [], results: [] };

// Playable: a 1 to 10 difficulty and a photo for the reveal that was checked
// to show the entry's place (photo: 'verified').
const isPlayable = (entry) => Number.isInteger(entry.difficulty) && entry.difficulty >= 1 && entry.difficulty <= 10
  && Boolean(entry.image) && entry.photo === 'verified';
export function triviaBankLoaded(data) {
  bank = (Array.isArray(data) ? data : []).filter(isPlayable);
  host.gameEls.triviaEntry.disabled = !bank.length;
}

export function triviaBest() {
  try {
    return Math.max(0, Number.parseInt(localStorage.getItem(TRIVIA_BEST_KEY), 10) || 0);
  } catch {
    return 0;
  }
}

export function triviaHubLine() {
  const best = triviaBest();
  return bank.length ? `${bank.length.toLocaleString()} clues${best ? ` · Best ${best.toLocaleString()}` : ''}` : '';
}

function drawGame() {
  return BANDS.map(([lo, hi]) => {
    const choices = bank.filter((entry) => entry.difficulty >= lo && entry.difficulty <= hi);
    return choices[Math.floor(Math.random() * choices.length)];
  });
}

export function startTrivia() {
  if (!bank.length) return;
  host.expeditionRun.active = false;
  host.endless.active = false;
  host.borders.active = false;
  host.survival.active = false;
  setRunResultsMode('trivia');
  trivia.active = true;
  trivia.round = 0;
  trivia.picks = drawGame();
  trivia.results = [];
  triviaGo();
}

function triviaGo() {
  trivia.item = trivia.picks[trivia.round];
  trivia.round += 1;
  host.showRound();
}

// The round screen's Trivia variant (round.js showRound, revealGuess, nextRound).
export function triviaRoundHeader() {
  const { gameEls } = host;
  document.body.classList.add('trivia');
  gameEls.number.textContent = `Round ${trivia.round} of ${ROUNDS}`;
  gameEls.weight.style.display = 'none';
  gameEls.dailyDate.hidden = true;
}

export function triviaRecordGuess(distance, score) {
  trivia.results.push({ item: trivia.item, distance, score });
}

export function triviaNext() {
  if (trivia.round >= ROUNDS) showTriviaResults();
  else triviaGo();
}

function showTriviaResults() {
  const { gameEls } = host;
  trivia.active = false;
  host.clearReveal();
  host.hideScreens();
  host.gameMode = 'survival-results';
  window.__canGuess = false;
  gameEls.survivalResults.hidden = false;
  document.body.className = 'game-results survival trivia';
  const total = trivia.results.reduce((sum, result) => sum + result.score, 0);
  const best = Math.max(triviaBest(), total);
  host.safeSetItem(TRIVIA_BEST_KEY, String(best));
  setRunResultsCopy('Trivia', 'Five clues, up to 1,000 points each.', 'Score', 'Best');
  gameEls.survivalResultTitle.textContent = `${total.toLocaleString()} / ${(ROUNDS * 1000).toLocaleString()}`;
  gameEls.survivalFinalStreak.textContent = total.toLocaleString();
  gameEls.survivalBestStreak.textContent = best.toLocaleString();
  gameEls.runBreakdownList.replaceChildren(...trivia.results.map((result, i) => {
    const round = document.createElement('li');
    const number = document.createElement('b');
    const place = document.createElement('span');
    const metrics = document.createElement('span');
    const points = document.createElement('span');
    const distance = document.createElement('span');
    number.textContent = i + 1;
    place.className = 'place';
    place.textContent = result.item.short;
    metrics.className = 'result-metrics';
    points.className = 'points';
    points.textContent = result.score.toLocaleString();
    distance.className = 'distance';
    distance.textContent = formatKm(result.distance);
    metrics.append(points, distance);
    round.append(number, place, metrics);
    return round;
  }));
  gameEls.runBreakdown.hidden = false;
  gameEls.survivalShare.textContent = 'Share result';
  gameEls.survivalShareStatus.textContent = '';
}

export function triviaShareText() {
  const total = trivia.results.reduce((sum, result) => sum + result.score, 0);
  return host.formatGameShare({
    title: 'Trivia',
    titleSep: ' · ',
    headline: `${total.toLocaleString()} / ${(ROUNDS * 1000).toLocaleString()}`,
    streak: triviaBest(),
    streakLabel: 'Best',
    guesses: host.closestGuessLines(trivia.results, trivia.results.map((result) => result.item)),
  });
}

export function initTrivia(main) {
  host = main;
  host.gameEls.triviaEntry.addEventListener('click', startTrivia);
}
