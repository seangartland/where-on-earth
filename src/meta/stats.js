// ---------------------------------------------------------------------------
// Stats: streaks, averages and the score histogram
//
// GAME_KEY only ever holds the current day (loadDaily discards it once the date
// rolls) and STREAK_KEY only the live run, so history lives in its own
// append-only key written once per finished daily. Both existing keys keep
// their exact format, so the daily game, endless mode and review are unaffected.
// History starts collecting from the first game played after this shipped.
//
// Moved out of main.js in refactor Phase 3. main.js reaches it through
// initStats(statsHost) at the spot the section used to run, so the Stats
// button and overlay are built in the same order as before.
// ---------------------------------------------------------------------------
import { formatKm } from '../core/format.js';

let host = null;
const HISTORY_LIMIT = 365;
const BAND_EDGES = [1000, 2000, 3000, 4000]; // /5000 total, five rounds at flat weight 1
const BAND_LOW_RGB = [103, 232, 255]; // cyan
const BAND_HIGH_RGB = [255, 199, 106]; // amber

function readHistory() {
  const raw = host.readJSON(host.HISTORY_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date))
    .map((entry) => ({
      date: entry.date,
      total: Number(entry.total) || 0,
      rounds: (Array.isArray(entry.rounds) ? entry.rounds : [])
        .filter((round) => round && Number.isFinite(Number(round.distance)))
        .map((round) => ({
          base: Math.round(Number(round.base) || 0),
          score: Number(round.score) || 0,
          distance: Math.round(Number(round.distance) || 0),
        })),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(-HISTORY_LIMIT);
}

export function recordHistory() {
  if (!host.daily || host.daily.results.length !== 5) return;
  const entry = {
    date: host.daily.date,
    total: host.daily.results.reduce((sum, result) => sum + result.score, 0),
    rounds: host.daily.results.map((result, i) => ({
      base: result.base ?? Math.round((result.score * 10) / host.WEIGHTS[i]),
      score: result.score,
      distance: result.distance,
    })),
  };
  const history = readHistory().filter((saved) => saved.date !== entry.date);
  history.push(entry);
  history.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  host.writeJSON(host.HISTORY_KEY, history.slice(-HISTORY_LIMIT));
}

// Whole days between two YYYY-MM-DD keys; the noon anchor dodges DST edges.
function dayGap(from, to) {
  return Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86400000);
}

function longestRun(dates) {
  let best = 0;
  let run = 0;
  let prev = null;
  for (const date of dates) {
    run = prev !== null && dayGap(prev, date) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = date;
  }
  return best;
}

export function currentStreak() {
  const streak = host.readJSON(host.STREAK_KEY);
  return streak && Number(streak.count) ? streak.count : 0;
}

function bandIndex(total) {
  const i = BAND_EDGES.findIndex((edge) => total < edge);
  return i === -1 ? BAND_EDGES.length : i;
}

function bandLabel(index) {
  const start = index === 0 ? 0 : BAND_EDGES[index - 1];
  const end = index === BAND_EDGES.length ? 5000 : BAND_EDGES[index] - 1;
  return `${start}–${end}`;
}

function bandColor(index, alpha) {
  const t = index / (BAND_EDGES.length);
  const rgb = BAND_LOW_RGB.map((v, k) => Math.round(v + (BAND_HIGH_RGB[k] - v) * t));
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function shortDate(date) {
  const value = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T12:00:00`)
    : new Date(date);
  return Number.isNaN(value.getTime()) ? '' : value.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function statsSummary() {
  const history = readHistory();
  const counts = new Array(BAND_EDGES.length + 1).fill(0);
  let totalPoints = 0;
  let best = null;
  let distanceSum = 0;
  let rounds = 0;
  for (const game of history) {
    totalPoints += game.total;
    counts[bandIndex(game.total)] += 1;
    game.rounds.forEach((round, i) => {
      rounds += 1;
      distanceSum += round.distance;
      if (!best || round.base > best.base) best = { ...round, date: game.date, round: i + 1 };
    });
  }
  const streak = currentStreak();
  return {
    history,
    games: history.length,
    streak,
    longest: Math.max(longestRun(history.map((game) => game.date)), streak),
    average: history.length ? Math.round(totalPoints / history.length) : 0,
    bestTotal: history.reduce((max, game) => Math.max(max, game.total), 0),
    averageDistance: rounds ? Math.round(distanceSum / rounds) : 0,
    counts,
    peak: Math.max(...counts, 1),
    bestRound: best,
    first: history.length ? history[0].date : null,
  };
}
export let statsEntry;
let statsScreen;
let statsEls;

const setStat = (name, value) => { statsScreen.querySelector(`[data-stats="${name}"]`).textContent = value; };

function renderStats() {
  const stats = statsSummary();
  setStat('streak', stats.streak);
  setStat('longest', stats.longest);
  setStat('games', stats.games.toLocaleString());
  setStat('average', stats.games ? stats.average.toLocaleString() : '');
  setStat('best', stats.games ? stats.bestTotal.toLocaleString() : '');
  setStat('distance', stats.games ? formatKm(stats.averageDistance) : '');
  const sub = statsScreen.querySelector('[data-stats="games-sub"]');
  sub.textContent = stats.games ? `since ${shortDate(stats.first)}` : 'no games logged yet';

  statsEls.hist.hidden = !stats.games;
  if (stats.games) {
    const counts = new Array(6).fill(0); // 0k-5k buckets: a daily total can't exceed the 5000 flat-scoring max
    stats.history.forEach((game) => {
      counts[Math.min(5, Math.floor(game.total / 1000))] += 1;
    });
    const peak = Math.max(...counts);
    statsEls.histBars.replaceChildren(...counts.map((count, i) => {
      const li = document.createElement('li');
      const height = count ? (count / peak) * 100 : 0;
      li.innerHTML = `<span class="stats-hist-bar"><span class="stats-hist-fill"></span><span class="stats-hist-count">${count || ''}</span></span><span class="stats-hist-label">${i ? `${i}k` : '0'}</span>`;
      li.querySelector('.stats-hist-fill').style.height = `${height}%`;
      li.querySelector('.stats-hist-count').style.bottom = `calc(${height}% + 3px)`;
      return li;
    }));
  }

  if (stats.bestRound) {
    const round = stats.bestRound;
    statsEls.bestRound.hidden = false;
    statsEls.bestRound.innerHTML = `Closest guess <b>${round.base}/1000</b> · ${round.distance.toLocaleString()} km away<br>Round ${round.round} of 5 · ${shortDate(round.date)}`;
  } else {
    statsEls.bestRound.hidden = true;
  }

  const notes = ['Endless games are unscored, so they aren’t counted here.'];
  if (!stats.games) notes.unshift('Play today’s five places and these tiles start filling in.');
  else if (stats.games < 3) notes.unshift(`Averages and your longest streak settle in after a few games. ${stats.games} logged so far.`);
  statsEls.note.innerHTML = notes.join(' ');
}

function openStats() {
  renderStats();
  host.gameEls.start.hidden = true;
  statsScreen.hidden = false;
  document.body.className = 'game-stats';
  window.__canGuess = false;
  statsScreen.scrollTop = 0;
  statsEls.close.focus();
}

function closeStats() {
  statsScreen.hidden = true;
  host.gameEls.start.hidden = false;
  document.body.className = 'game-start';
  host.syncPassport();
  statsEntry.focus();
}

export function initStats(main) {
  host = main;

  statsEntry = document.createElement('button');
  statsEntry.className = 'stats-entry';
  statsEntry.textContent = 'Stats';
  statsEntry.setAttribute('aria-haspopup', 'dialog');
  host.gameEls.startStreak.after(statsEntry);

  statsScreen = document.createElement('section');
  statsScreen.className = 'screen stats-screen';
  statsScreen.hidden = true;
  statsScreen.innerHTML = `
  <div class="stats-card glass" role="dialog" aria-modal="true" aria-labelledby="stats-title">
    <button class="icon-close" aria-label="Close stats">×</button>
    <h2 id="stats-title">Your stats</h2>
    <div class="stats-hero">
      <div class="stat"><b data-stats="streak">0</b><span>Day streak</span></div>
      <div class="stat cool"><b data-stats="longest">0</b><span>Longest streak</span></div>
    </div>
    <div class="stats-grid">
      <div class="stat cool"><b data-stats="games">0</b><span>Games played</span><small data-stats="games-sub"></small></div>
      <div class="stat"><b data-stats="average">0</b><span>Average score</span><small>/5000 per game</small></div>
      <div class="stat"><b data-stats="best">0</b><span>Best score</span><small>/5000 in one game</small></div>
      <div class="stat cool"><b data-stats="distance">0</b><span>Avg distance</span><small>km off the mark</small></div>
    </div>
    <section class="stats-hist" data-stats="hist" hidden>
      <p class="stats-head">Score distribution</p>
      <ol class="stats-hist-bars" data-stats="hist-bars"></ol>
    </section>
    <p class="stats-best" data-stats="best-round" hidden></p>
    <p class="stats-note" data-stats="note"></p>
  </div>`;
  document.getElementById('game').appendChild(statsScreen);
  host.statsScreenEl = statsScreen;

  statsEls = {
    screen: statsScreen,
    card: statsScreen.querySelector('.stats-card'),
    close: statsScreen.querySelector('.icon-close'),
    hist: statsScreen.querySelector('[data-stats="hist"]'),
    histBars: statsScreen.querySelector('[data-stats="hist-bars"]'),
    bestRound: statsScreen.querySelector('[data-stats="best-round"]'),
    note: statsScreen.querySelector('[data-stats="note"]'),
  };

  statsEntry.addEventListener('click', openStats);
  statsEls.close.addEventListener('click', closeStats);
  statsScreen.addEventListener('click', (e) => {
    if (e.target === statsScreen) closeStats();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !statsScreen.hidden) closeStats();
  });
}
