// ---------------------------------------------------------------------------
// The Daily's screens (refactor Phase 5): today's game state and saves, the
// streak, the postcard summary, results and share text, the next-game
// countdown, and the post-game review on the globe. The daily set itself
// (dailyIds, pins) stays in src/daily.js, which the pin flow reads by path.
// initDailyGame(host) wires the play and share buttons; initDailyCountdown()
// and initReview() build their parts at the spots they always ran. The host
// supplies the globe and the passport pieces outside the modes layer.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { dailyIds, isLandmark, isPlayableLocation, resolvePinnedIds } from '../daily.js';
import { ACCOUNTS_ENABLED, DEG, GAME_KEY, STREAK_KEY, EARN_NAMES, FRIEND_MIN_DIST } from '../core/config.js';
import { cachedFriendPins } from '../account/friends.js';
import { clamp, damp } from '../core/math.js';
import { state } from '../core/state.js';
import { readJSON, writeJSON } from '../core/storage.js';
import { setThumb } from '../core/dom.js';
import { formatKm, localDateKey, flagForLocation } from '../core/format.js';
import { buildPostcardCard } from '../meta/postcard-card.js';
import { reviewEls, setReviewEls, getFriendLayer, reviewFacing, screenOf, _rv } from '../game/review-shared.js';

export { reviewEls } from '../game/review-shared.js';
import { grantDailySkips } from '../meta/pack-store.js';
import { gameEls, hideScreens, showRound, revealGuess } from '../game/round.js';
import { showAnswerOutlines } from '../globe/reveal.js';
import { prefetchDailyTiles } from '../globe/surface.js';
import { shareResult } from '../game/share.js';
import { survival } from './survival.js';
import { borders } from './tap-country.js';
import { expeditionRun } from './expeditions.js';
import { endless } from './endless.js';
import { isSignedIn } from '../account/session.js';

let applyCardTier, passportEntryFor, bindPostcard, recordHistory, syncPassport, clearReveal, Pin;
let makeBadgeTexture, ANSWER_COLOR, latLngToVec3, routeAxis, routeRadius, globe, camera, frameRevealPoints;
let safeStrip;
let nextGame;
let nextGameTime;
let nextGameSub;
let countdownDay;
let reviewRounds;

// The friends overlay, for a signed-in accounts build only; null otherwise.
function loadFriendLayer() {
  if (!ACCOUNTS_ENABLED) return Promise.resolve(null);
  return import('../account/session.js')
    .then(({ isSignedIn }) => (isSignedIn() ? import('./daily-friends.js') : null))
    .catch(() => null);
}

export function saveDaily() {
  writeJSON(GAME_KEY, state.daily);
}

// A pinned date plays its pin (with any dropped location substituted, see
// resolvePinnedIds); every other date is computed from today's pool.
export function dailyGame(date) {
  const pinned = state.dailyPins[date];
  const ids = Array.isArray(pinned) ? resolvePinnedIds(date, pinned, state.locations) : null;
  return ids || dailyIds(date, state.locations);
}

export function loadDaily() {
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
  // Loading pass part 1: warm today's reveal tiles while the player is
  // still on the home screen. Fire and forget; never blocks boot or Home.
  prefetchDailyTiles(state.selected, state.daily.date);
}

export function streakText() {
  const streak = readJSON(STREAK_KEY);
  const count = streak && Number(streak.count) ? streak.count : 0;
  return count ? `${count} day streak` : '';
}

export function finishStreak() {
  const existing = readJSON(STREAK_KEY);
  if (existing && existing.last === state.daily.date) return existing.count || 1;
  const today = new Date(`${state.daily.date}T12:00:00`);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const count = existing && existing.last === localDateKey(yesterday) ? (existing.count || 0) + 1 : 1;
  writeJSON(STREAK_KEY, { last: state.daily.date, count });
  return count;
}

export function postcardDistance(result) {
  const distance = Number.isFinite(result.distanceExact) ? result.distanceExact : result.distance;
  return formatKm(distance);
}

export function postcardSummaryCard(result, item) {
  const outcome = result.postcard;
  if (!outcome || !['new', 'upgrade', 'visited'].includes(outcome.kind)) return null;
  const distanceText = postcardDistance(result);
  const tier = outcome.tier ?? 0;
  const card = buildPostcardCard(item, {
    earned: tier,
    earnName: EARN_NAMES[tier],
    meta: `${outcome.kind === 'upgrade' ? 'Upgraded' : outcome.kind === 'visited' ? 'Visited' : 'New'} • ${distanceText}`,
  }, { flagForLocation, applyCardTier });
  card.classList.add('postcard-summary-entry');
  const scoreValue = result.base ?? result.score;
  if (scoreValue != null) {
    const score = document.createElement('span');
    score.className = 'postcard-summary-score';
    score.textContent = scoreValue.toLocaleString();
    card.append(score);
  }
  const name = card.querySelector('.pp-name');
  const entry = passportEntryFor(item);
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-haspopup', 'dialog');
  card.setAttribute('aria-label', `Open postcard: ${name.textContent}`);
  bindPostcard(card, entry);
  return card;
}

export function shareScore(base) {
  return base >= 1000 ? '1K' : String(base);
}

export function shareText() {
  const total = state.daily.results.reduce((sum, result) => sum + result.score, 0);
  const scores = state.daily.results.map((result) => shareScore(result.score));
  return `I scored ${total.toLocaleString()} on\nwww.where-on.earth\n\n${scores.join(' | ')}`;
}

export function postcardSummaryOutcomes() {
  return state.daily.results
    .map((result, index) => ({ result, item: state.selected[index] }))
    .filter(({ result }) => ['new', 'upgrade', 'visited'].includes(result.postcard?.kind));
}

// Survival and Expeditions are unscored, so they have no daily.results to read
// back. Their new and upgraded postcards are collected here as rounds are played.
export const runHaul = [];

// Show the run's haul before moving on, then forget it so it can't show twice.
// A note (a finished weekly expedition) shows the summary even with no haul.
export function showRunHaul(next, nextLabel, note = '') {
  showPostcardSummary(runHaul.splice(0), next, nextLabel, note);
}

export function postcardSummaryCounts(outcomes) {
  return outcomes.reduce((counts, { result }) => {
    counts[result.postcard.kind] += 1;
    return counts;
  }, { new: 0, upgrade: 0, visited: 0 });
}

export let postcardSummaryNext = showResults;

export function showPostcardSummary(outcomes = postcardSummaryOutcomes(), next = showResults, nextLabel = 'Continue to results', note = '') {
  if (!outcomes.length && !note) return next();
  postcardSummaryNext = next;
  gameEls.postcardSummaryContinue.textContent = nextLabel;
  clearReveal();
  hideScreens();
  state.gameMode = 'postcard-summary';
  window.__canGuess = false;
  gameEls.postcardSummaryScreen.hidden = false;
  document.body.classList.add('game-results');
  const { new: newCount, upgrade: upgradeCount, visited: visitedCount } = postcardSummaryCounts(outcomes);
  const segments = [
    newCount ? `${newCount} new postcard${newCount === 1 ? '' : 's'}` : '',
    upgradeCount ? `${upgradeCount} upgraded` : '',
    visitedCount ? `${visitedCount} first visit${visitedCount === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  const lede = segments.length > 1 ? `${segments.slice(0, -1).join(', ')} and ${segments[segments.length - 1]}` : segments[0] || 'No new postcards';
  gameEls.postcardSummaryLede.textContent = `${note ? `${note} ` : ''}${lede}.`;
  gameEls.breakdown.hidden = outcomes.length === 0;
  gameEls.breakdown.replaceChildren(...outcomes.map(({ result, item }) => postcardSummaryCard(result, item)));
  const countLabel = (count, label) => {
    if (!count) return null;
    const el = document.createElement('span');
    const number = document.createElement('b');
    number.textContent = count;
    el.append(number, ` ${label}`);
    return el;
  };
  const counts = [countLabel(newCount, 'new'), countLabel(upgradeCount, 'upgraded'), countLabel(visitedCount, 'visited')].filter(Boolean);
  gameEls.postcardSummaryCounts.replaceChildren(...counts.flatMap((count, index) => index ? [Object.assign(document.createElement('span'), { className: 'postcard-summary-separator', textContent: '·' }), count] : [count]));
  const postmark = document.createElement('span');
  postmark.className = 'postcard-summary-postmark';
  postmark.setAttribute('aria-hidden', 'true');
  postmark.textContent = new Date(`${state.daily.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  gameEls.breakdown.append(gameEls.postcardSummaryCounts, postmark);
  filePostcardsAway(outcomes);
}

// Earned cards file away into the Passport tally: a mini postcard lifts off
// each new or upgraded row and shrinks into the counts stamp, staggered.
// Settings can turn it off (state.filingAnim); reduced motion skips it too.
function filePostcardsAway(outcomes) {
  if (!state.filingAnim) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const target = gameEls.postcardSummaryCounts?.getBoundingClientRect();
  if (!target || !target.width) return;
  const entries = [...gameEls.breakdown.children];
  outcomes.forEach(({ result, item }, i) => {
    const kind = result?.postcard?.kind;
    if (kind !== 'new' && kind !== 'upgrade') return;
    const row = entries[i];
    if (!row || !item?.image) return;
    const r = row.getBoundingClientRect();
    if (!r.width) return;
    const card = document.createElement('div');
    card.className = 'filing-card';
    const img = Object.assign(document.createElement('img'), { src: item.image, alt: '' });
    const name = Object.assign(document.createElement('span'), { textContent: item.short || item.clue || '' });
    card.append(img, name);
    Object.assign(card.style, { left: `${r.left + 10}px`, top: `${r.top - 6}px` });
    document.body.append(card);
    const dx = target.left + target.width / 2 - (r.left + 70);
    const dy = target.top + target.height / 2 - (r.top + 34);
    const anim = card.animate([
      { transform: 'translate(0, 0) rotate(-3deg) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(2deg) scale(.12)`, opacity: .25 },
    ], { duration: 620, delay: 350 + i * 170, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'backwards' });
    anim.onfinish = () => card.remove();
    setTimeout(() => card.remove(), 350 + i * 170 + 900);
  });
}

export function showResults() {
  clearReveal();
  hideScreens();
  state.gameMode = 'results';
  window.__canGuess = false;
  gameEls.results.hidden = false;
  document.body.classList.add('game-results');
  const dailySkips = grantDailySkips(state.daily.date);
  gameEls.dailyReward.hidden = dailySkips === 0;
  state.daily.complete = true;
  saveDaily();
  const streak = finishStreak();
  recordHistory();
  const total = state.daily.results.reduce((sum, result) => sum + result.score, 0);
  gameEls.total.textContent = total.toLocaleString();
  gameEls.resultStreak.textContent = `${streak} day streak`;
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
    const rawScore = result.base ?? result.score;

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
  syncSignedOutNudge();
  syncFriendsToday(total);
}

// The Friends today card on the results screen: a true leaderboard of
// today's totals (rankLeaderboard ranks the player by score alongside
// friends, with rank numbers) so a player can find how friends did
// without opening the round-by-round review. Hidden unless signed in with
// at least one friend who played today.
async function syncFriendsToday(total) {
  const card = gameEls.results.querySelector('.friends-today');
  if (!card) return;
  // The card's own link replaces "See your rounds on the globe"; that link
  // comes back whenever the card does not show (signed out, or no friend
  // has played yet), since it is then the only way into the review.
  const globeLink = gameEls.results.querySelector('.results-globe');
  const setGlobe = (hidden) => { if (globeLink) globeLink.hidden = hidden; };
  if (!ACCOUNTS_ENABLED || !isSignedIn()) { card.hidden = true; setGlobe(false); return; }
  try {
    const [{ fetchFriendPins }, { friendTotals, rankLeaderboard }] = await Promise.all([
      import('../account/friends.js'),
      import('../game/friend-rows.js'),
    ]);
    const pins = await fetchFriendPins(state.daily.date);
    const rounds = (state.daily.ids || []).map((locationId, i) => ({ locationId, answer: state.selected[i] }));
    const totals = pins ? friendTotals(pins, rounds) : [];
    if (!totals.length) { card.hidden = true; setGlobe(false); return; }
    card.querySelector('.friends-today-count').textContent = totals.length === 1 ? '1 played' : `${totals.length} played`;
    const list = card.querySelector('.friends-today-list');
    const row = (entry) => {
      const li = document.createElement('li');
      li.className = `friend-total-row${entry.you ? ' you' : ''}`;
      const rk = Object.assign(document.createElement('span'), { className: 'ft-rank', textContent: `${entry.rank}.` });
      const av = Object.assign(document.createElement('span'), { className: 'ft-av', textContent: entry.initial });
      const nm = Object.assign(document.createElement('span'), { className: 'ft-name', textContent: entry.name });
      const dl = Object.assign(document.createElement('span'), { className: 'ft-delta', textContent: entry.you ? '' : `${entry.total - total > 0 ? '+' : ''}${(entry.total - total).toLocaleString()}` });
      const sc = Object.assign(document.createElement('span'), { className: 'ft-score', textContent: entry.total.toLocaleString() });
      li.append(rk, av, nm, dl, sc);
      return li;
    };
    list.replaceChildren(...rankLeaderboard(total, totals).map(row));
    if (!card.dataset.wired) {
      card.dataset.wired = '1';
      card.querySelector('.friends-today-link')?.addEventListener('click', () => enterReview());
    }
    card.hidden = false;
    setGlobe(true);
    // If the player's rank sits below the fold, open the list scrolled so
    // their row is centered with a neighbor above and below; a rank inside
    // the fold leaves the scroll alone.
    const youRow = list.querySelector('.friend-total-row.you');
    if (youRow && list.scrollHeight > list.clientHeight) {
      const lr = list.getBoundingClientRect();
      const rr = youRow.getBoundingClientRect();
      if (rr.bottom > lr.bottom || rr.top < lr.top) {
        list.scrollTop += (rr.top - lr.top) - (list.clientHeight - youRow.offsetHeight) / 2;
      }
    }
  } catch { card.hidden = true; setGlobe(false); }
}

function syncSignedOutNudge() {
  const existing = gameEls.results.querySelector('.friend-nudge-results');
  if (isSignedIn() || nudgeDismissals('woe-nudge-results-dismissed') >= 2) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const nudge = document.createElement('aside');
  nudge.className = 'friend-nudge friend-nudge-results';
  nudge.append(Object.assign(document.createElement('span'), { textContent: 'You played signed out, so these pins were not saved.' }));
  const addFriends = Object.assign(document.createElement('button'), { type: 'button', className: 'text-button', textContent: 'Add friends to compare guesses' });
  addFriends.addEventListener('click', async () => {
    const { openAccountSheet } = await import('../account/sheet.js');
    openAccountSheet(addFriends);
  });
  const dismiss = Object.assign(document.createElement('button'), { type: 'button', className: 'friend-nudge-dismiss', textContent: '×' });
  dismiss.setAttribute('aria-label', 'Dismiss account reminder');
  dismiss.addEventListener('click', () => {
    saveNudgeDismissal('woe-nudge-results-dismissed');
    nudge.remove();
  });
  nudge.append(addFriends, dismiss);
  gameEls.results.querySelector('.results-actions').after(nudge);
}

function nudgeDismissals(key) {
  try { return Math.max(0, Number.parseInt(localStorage.getItem(key), 10) || 0); } catch { return 0; }
}

function saveNudgeDismissal(key) {
  try { localStorage.setItem(key, String(nudgeDismissals(key) + 1)); } catch { /* unavailable */ }
}

export function syncDailyButton() {
  const played = state.daily && state.daily.complete && state.daily.date === localDateKey();
  const isRecsHome = document.body.classList.contains('home-recs');
  const desc = gameEls.play.querySelector('.mode-desc');
  if (isRecsHome) {
    desc.textContent = played ? '✓ See results' : '5 places · about 2 minutes';
    gameEls.play.classList.remove('daily-done');
  } else if (played) {
    // A played Daily is a slim, quiet row; the gold primary treatment moves
    // to Packs when a pack can be opened (syncPackButton drives .is-gold).
    gameEls.play.querySelector('.mode-name').textContent = '✓ Daily done';
    desc.textContent = '· See results';
    gameEls.play.classList.add('daily-done');
  } else {
    gameEls.play.querySelector('.mode-name').textContent = 'Daily';
    desc.textContent = gameEls.play.disabled ? 'Loading…' : '5 places daily';
    gameEls.play.classList.remove('daily-done');
  }
  gameEls.play.classList.toggle('played', Boolean(played));
}

export function startGame() {
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

// ---------------------------------------------------------------------------
// Next-daily countdown: one game per day, shown on the results and review
// screens in place of a replay
// ---------------------------------------------------------------------------
let reviewCountdown = null; // set once the review bar exists

export function msToMidnight(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
}

export function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

// Back to the start screen with today's fresh daily loaded.
export function openNewDaily() {
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

export function tickCountdown() {
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

// ---------------------------------------------------------------------------
// Post-game review: the selected round is complete, while the other answers
// stay as quiet geographic context for the pager.
// ---------------------------------------------------------------------------
const REVIEW_PIN_SCALE = 0.78; // a little smaller than in play, to match the reveal's framing
const REVIEW_DIM = 0.25;
const REVIEW_CONTEXT_SCALE = 0.56;
const REVIEW_PIN_HIT = 34; // css px, generous for fingers
const REVIEW_LINE_HIT = 20;

let reviewOpen = -1;

// Drops the selected round's guess/answer pins and route. The remaining
// answers stay small and quiet; their guesses and routes leave immediately.
function showRoundVisuals(i) {
  const r = reviewRounds[i];
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
  r.guess.dim = r.guess.dimNow = 1;
  r.answer.dim = r.answer.dimNow = 1;
  r.answer.badge.visible = true;
  r.guess.drop(a);
  r.answer.drop(b);
  r.answer.t = -0.06; // the answer lands a hair after the guess
  reviewRounds.forEach((other, j) => {
    if (j === i) return;
    other.b = latLngToVec3(state.selected[j].lat, state.selected[j].lng);
    other.guess.release();
    other.guess.root.visible = false;
    other.answer.drop(other.b);
    other.answer.t = 1; // context pins should already be settled
    other.answer.dim = REVIEW_DIM;
    other.answer.badge.visible = false;
    other.line.visible = false;
  });
}

export function hideReviewVisuals() {
  reviewOpen = -1;
  getFriendLayer()?.clear();
  for (const r of reviewRounds) {
    r.guess.release();
    r.answer.release();
    r.line.visible = false;
  }
}

// Per-frame review update, called from the host loop: animates the selected
// pair and keeps the other answers small, dim and quiet at the limb.
export function updateReview(dt, scale) {
  for (let i = 0; i < reviewRounds.length; i++) {
    const r = reviewRounds[i];
    const open = i === reviewOpen;
    for (const pin of [r.guess, r.answer]) {
      if (pin.state === 'idle') continue;
      pin.update(dt, state.elapsed, scale * REVIEW_PIN_SCALE * (open ? 1 : REVIEW_CONTEXT_SCALE));
      if (pin.state === 'idle') continue;
      if (!open && pin === r.answer) {
        _rv.set(0, 1, 0).applyQuaternion(pin.root.quaternion);
        const limbFade = clamp((reviewFacing(_rv) + 0.02) / 0.12, 0, 1);
        pin.capMat.uniforms.uOpacity.value *= limbFade;
        pin.stemMat.uniforms.uOpacity.value *= limbFade;
        pin.halo.material.opacity *= limbFade;
        pin.core.material.opacity *= limbFade;
        continue;
      }
      pin.badge.scale.multiplyScalar(1 / REVIEW_PIN_SCALE); // smaller pins, but numbers stay readable
      // badge sprites ignore depth, so fade them out as their pin rounds the limb
      _rv.set(0, 1, 0).applyQuaternion(pin.root.quaternion);
      pin.badge.material.opacity *= clamp((reviewFacing(_rv) + 0.02) / 0.12, 0, 1);
    }
    if (r.line.visible) r.line.material.opacity = damp(r.line.material.opacity, 0.75, 10, dt);
  }
  getFriendLayer()?.update(dt, scale); // friends' pins, on the reveal and in a recap
}

export function enterReview(focus = -1) {
  if (state.daily.results.length !== 5) return;
  clearReveal();
  hideScreens();
  state.gameMode = 'review';
  window.__canGuess = false;
  document.body.classList.add('game-review');
  reviewEls.screen.hidden = false;
  // This screen is about distance, not points (Sean, 2026-11-09): the
  // header carries the total km off across the five rounds.
  const totalKm = state.daily.results.reduce((sum, result) => sum + result.distance, 0);
  reviewEls.hint.textContent = `${formatKm(totalKm)} off today`;
  tickCountdown();
  loadFriendLayer().then((friends) => {
    if (friends && state.gameMode === 'review') friends.enterFriendReview(state.daily.date, reviewOpen);
  });
  state.vYaw = state.vPitch = state.autoSpin = 0;
  openRecap(focus >= 0 ? focus : 0);
}

// Opens round i's recap: drops its pins/line (releasing every other round's),
// fills in the card, points the pager at it, and reframes the camera.
export function openRecap(i) {
  if (i < 0 || i >= reviewRounds.length) return;
  const result = state.daily.results[i];
  const item = state.selected[i];
  const r = reviewRounds[i];
  reviewOpen = i;
  showRoundVisuals(i);
  reviewEls.tag.textContent = `Round ${i + 1} of 5`;
  reviewEls.name.textContent = item.clue;
  reviewEls.distance.textContent = formatKm(result.distance);
  reviewEls.fact.textContent = item.fact;
  setThumb(reviewEls.thumb, item.image);
  reviewEls.card.classList.remove('expanded');
  reviewEls.card.querySelector('.recap-expand')?.setAttribute('aria-expanded', 'false');
  reviewEls.card.hidden = false;
  getFriendLayer()?.recap(i);
  // The correct country's outline (plus the state outline for US cities),
  // same treatment as the in-round reveal, so friend pins read as in or
  // out of the country at a glance. Cleared by clearReveal on showResults.
  showAnswerOutlines(item, false);
  reviewEls.pagerPrev.disabled = i <= 0;
  reviewEls.pagerNext.disabled = i >= 4;
  // the card is laid out now, so the strip between bar and card is known
  frameRevealPoints(r.a, r.b, safeStrip(reviewEls.bar, reviewEls.card));
  // Friend pins on this round: hold a minimum range so a very close guess
  // does not crop the friends out. Further-out framing stays untouched.
  const friendsHere = cachedFriendPins(state.daily.date)?.locations?.[state.daily.ids[i]]?.friends;
  if (friendsHere?.length && state.targetDist < FRIEND_MIN_DIST) state.targetDist = FRIEND_MIN_DIST;
}

export function segmentDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / Math.max(dx * dx + dy * dy, 1e-6), 0, 1);
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// Nearest round under a tap: pin heads, badges and bases first, then the
// route. Only the open round's pins and line are ever visible, so a hit
// just reopens the round that's already showing; a miss does nothing.
export function pickReviewRound(x, y) {
  if (getFriendLayer()?.pick(x, y)) return; // a friend's pin in the open recap
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
  }
}

// The play and share buttons. The share button passes the Daily text that
// used to be shareResult's default.
export function initDailyGame(main) {
  ({ applyCardTier, passportEntryFor, bindPostcard, recordHistory, syncPassport, clearReveal, Pin,
    makeBadgeTexture, ANSWER_COLOR, latLngToVec3, routeAxis, routeRadius, globe, camera, frameRevealPoints,
    safeStrip } = main);
  gameEls.play.addEventListener('click', startGame);
  gameEls.share.addEventListener('click', () => shareResult(shareText()));
}

// The next-game panel and its one-second tick.
export function initDailyCountdown() {
  nextGame = document.createElement('div');
  nextGame.className = 'next-game';
  nextGame.innerHTML = '<p class="eyebrow">Next game in</p><span class="next-game-time" role="timer">--:--:--</span><p class="next-game-sub">Five new places at midnight</p>';
  // The panel closes the results card, under the round breakdown. (It used
  // to anchor on #share-status, which now sits above the breakdown.)
  (gameEls.results.querySelector('.round-breakdown') || gameEls.status).after(nextGame);
  nextGameTime = nextGame.querySelector('.next-game-time');
  nextGameSub = nextGame.querySelector('.next-game-sub');
  countdownDay = localDateKey();
  setInterval(tickCountdown, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tickCountdown(); });
  nextGame.addEventListener('click', () => { if (nextGame.classList.contains('ready')) openNewDaily(); });
}

// The results header, the review screen, its pins and routes, and listeners.
export function initReview() {

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
    <div class="recap-band">
      <img class="recap-thumb" alt="" loading="lazy" hidden onerror="this.hidden=true">
      <div class="recap-band-shade"></div>
      <div class="recap-head"><div><p class="recap-tag"></p><h3></h3></div>
      <div class="recap-nav">
        <button type="button" class="pager-arrow" data-act="prev" aria-label="Previous round">‹</button>
        <button type="button" class="pager-arrow" data-act="next" aria-label="Next round">›</button>
        <button class="icon-close" aria-label="Close review">×</button>
      </div></div>
      <div class="score-line"><div><span class="recap-distance"></span><small>away</small></div></div>
      <button type="button" class="recap-expand" data-act="expand" aria-expanded="false" aria-label="Expand photo and description"><span class="recap-grip-bar"></span></button>
    </div>
    <p class="recap-fact"></p>
  </article>`;
  document.getElementById('game').append(reviewScreen);
  setReviewEls({
    screen: reviewScreen,
    bar: reviewScreen.querySelector('.review-bar'),
    hint: reviewScreen.querySelector('.review-hint'),
    countdown: reviewScreen.querySelector('.review-countdown'),
    card: reviewScreen.querySelector('.recap-card'),
    tag: reviewScreen.querySelector('.recap-tag'),
    name: reviewScreen.querySelector('.recap-head h3'),
    distance: reviewScreen.querySelector('.recap-distance'),
    thumb: reviewScreen.querySelector('.recap-thumb'),
    fact: reviewScreen.querySelector('.recap-fact'),
    pagerPrev: reviewScreen.querySelector('[data-act="prev"]'),
    pagerNext: reviewScreen.querySelector('[data-act="next"]'),
  });
  reviewCountdown = reviewEls.countdown;

  // One guess pin, answer pin and route per round, built once and re-dropped
  // each time the review opens.
  reviewRounds = Array.from({ length: 5 }, (_, i) => {
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
    return { guess, answer, line, points: [] };
  });
  window.addEventListener('resize', () => reviewRounds.forEach((r) => r.line.material.resolution.set(state.viewW, state.viewH)));
  resultsGlobe.addEventListener('click', () => enterReview());
  if (gameEls.postcardSummaryContinue) {
    gameEls.postcardSummaryContinue.addEventListener('click', () => postcardSummaryNext());
  }
  gameEls.results.addEventListener('click', (e) => {
    if (e.target === gameEls.results) enterReview(); // tap outside the card
  });
  const setRecapExpanded = (expanded) => {
    reviewEls.card.classList.toggle('expanded', expanded);
    reviewEls.card.querySelector('.recap-expand')?.setAttribute('aria-expanded', String(expanded));
  };
  // A vertical flick on the card opens or closes it, same as the reveal
  // sheet; the click that follows the pointerup is swallowed so it does
  // not toggle straight back (Sean, 2026-11-09: tap or swipe expands).
  let recapSwipeY = null;
  let recapSwiped = false;
  reviewEls.card.addEventListener('pointerdown', (e) => {
    recapSwipeY = e.target.closest('button') ? null : e.clientY;
    recapSwiped = false;
  });
  reviewEls.card.addEventListener('pointerup', (e) => {
    if (recapSwipeY == null) return;
    const dy = e.clientY - recapSwipeY;
    recapSwipeY = null;
    if (Math.abs(dy) < 24) return;
    recapSwiped = true;
    setRecapExpanded(dy < 0);
  });
  reviewEls.card.addEventListener('pointercancel', () => { recapSwipeY = null; });
  reviewEls.screen.addEventListener('click', (e) => {
    if (recapSwiped) { recapSwiped = false; return; }
    const act = e.target.closest('[data-act]');
    if (e.target.closest('.icon-close')) showResults();
    else if (act && act.dataset.act === 'results') showResults();
    else if (act && act.dataset.act === 'next-daily' && act.classList.contains('ready')) openNewDaily();
    else if (act && act.dataset.act === 'prev') openRecap(reviewOpen - 1);
    else if (act && act.dataset.act === 'next') openRecap(reviewOpen + 1);
    else if (act && act.dataset.act === 'expand') {
      setRecapExpanded(!reviewEls.card.classList.contains('expanded'));
    }
    else if (e.target.closest('.recap-card') && !e.target.closest('button')) {
      setRecapExpanded(!reviewEls.card.classList.contains('expanded'));
    }
    else if (act && act.dataset.act === 'goto') openRecap(Number(act.dataset.round));
  });

}
