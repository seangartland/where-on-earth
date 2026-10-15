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
import { DEG, MIN_DIST, GAME_KEY, STREAK_KEY, WEIGHTS, EARN_PINPOINT } from '../core/config.js';
import { clamp, damp } from '../core/math.js';
import { state } from '../core/state.js';
import { readJSON, writeJSON } from '../core/storage.js';
import { setThumb } from '../core/dom.js';
import { formatKm, localDateKey, flagForLocation } from '../core/format.js';
import { gameEls, hideScreens, showRound, revealGuess } from '../game/round.js';
import { shareResult } from '../game/share.js';
import { survival } from './survival.js';
import { borders } from './tap-country.js';
import { expeditionRun } from './expeditions.js';
import { endless } from './endless.js';

let applyCardTier, passportEntryFor, openPostcard, recordHistory, syncPassport, clearReveal, Pin;
let makeBadgeTexture, ANSWER_COLOR, latLngToVec3, routeAxis, routeRadius, globe, camera, frameRevealPoints;
let safeStrip, travelView, nearAngle;
let nextGame;
let nextGameTime;
let nextGameSub;
let countdownDay;
export let reviewEls;
let reviewRounds;

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
}

export function streakText() {
  const streak = readJSON(STREAK_KEY);
  const count = streak && Number(streak.count) ? streak.count : 0;
  return count ? `🔥 ${count} day streak` : '';
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

export function scoreEmoji(base) {
  if (base >= 1000) return '🎯';
  if (base >= 900) return '🔥';
  if (base >= 700) return '🏆';
  if (base >= 400) return '🙂';
  if (base >= 1) return '😅';
  return '🥶';
}

export function postcardDistance(result, outcome) {
  const distance = Number.isFinite(result.distanceExact) ? result.distanceExact : result.distance;
  const precision = outcome?.tier === EARN_PINPOINT ? 1 : 0;
  return `${distance.toLocaleString(undefined, { maximumFractionDigits: precision, minimumFractionDigits: precision })} km`;
}

export function postcardSummaryCard(result, item) {
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

export function shareText() {
  const dateStr = new Date(`${state.daily.date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const total = state.daily.results.reduce((sum, result) => sum + result.score, 0);
  const lines = state.daily.results.map((result, index) => {
    const base = result.base ?? Math.round((result.score * 10) / WEIGHTS[index]);
    return WEIGHTS[index] > 1 ? `${base.toLocaleString()} (x${WEIGHTS[index]})` : `${base.toLocaleString()}`;
  });
  return `I scored ${total.toLocaleString()} on www.where-on.earth\n${dateStr}\n${lines.join('\n')}`;
}

export function postcardSummaryOutcomes() {
  return state.daily.results
    .map((result, index) => ({ result, item: state.selected[index] }))
    .filter(({ result }) => ['new', 'upgrade'].includes(result.postcard?.kind));
}

// Survival and Expeditions are unscored, so they have no daily.results to read
// back. Their new and upgraded postcards are collected here as rounds are played.
export const runHaul = [];

// Show the run's haul before moving on, then forget it so it can't show twice.
export function showRunHaul(next, nextLabel) {
  showPostcardSummary(runHaul.splice(0), next, nextLabel);
}

export function postcardSummaryCounts(outcomes) {
  return outcomes.reduce((counts, { result }) => {
    counts[result.postcard.kind] += 1;
    return counts;
  }, { new: 0, upgrade: 0 });
}

export let postcardSummaryNext = showResults;

export function showPostcardSummary(outcomes = postcardSummaryOutcomes(), next = showResults, nextLabel = 'Continue to results') {
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

export function showResults() {
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

export function syncDailyButton() {
  const played = state.daily && state.daily.complete && state.daily.date === localDateKey();
  gameEls.play.querySelector('.mode-desc').textContent = played ? '✓ See results' : '5 places daily';
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
// Post-game review: all five rounds on the globe, tap one to reopen its recap
// ---------------------------------------------------------------------------
const REVIEW_PIN_SCALE = 0.78; // ten pins at once: a little smaller than in play
const REVIEW_DIM = 0.22; // unselected rounds while a recap is open
const REVIEW_PIN_HIT = 34; // css px, generous for fingers
const REVIEW_LINE_HIT = 20;

let reviewOpen = -1;

export function showReviewVisuals() {
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

export function hideReviewVisuals() {
  reviewOpen = -1;
  for (const r of reviewRounds) {
    r.guess.release();
    r.answer.release();
    r.line.visible = false;
  }
}

export function setReviewDim(r, dim) {
  r.dim = r.guess.dim = r.answer.dim = dim;
}

export function enterReview(focus = -1) {
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

export function openRecap(i) {
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

export function closeRecap() {
  reviewOpen = -1;
  reviewEls.card.hidden = true;
  reviewRounds.forEach((r) => setReviewDim(r, 1));
}

// Facing factor of a globe-local surface point: > 0 in front of the limb.
export const _rv = new THREE.Vector3();
export function reviewFacing(local) {
  _rv.copy(local).applyQuaternion(globe.quaternion);
  return (_rv.z * state.dist - 1) / Math.hypot(_rv.x, _rv.y, state.dist - _rv.z);
}

export function updateReview(dt, scale) {
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

export const _rp = new THREE.Vector3();
export function screenOf(world) {
  _rp.copy(world).project(camera);
  return [((_rp.x + 1) / 2) * state.viewW, ((1 - _rp.y) / 2) * state.viewH];
}

export function segmentDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / Math.max(dx * dx + dy * dy, 1e-6), 0, 1);
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// Nearest round under a tap: pin heads, badges and bases first, then the
// route. A miss closes any open recap.
export function pickReviewRound(x, y) {
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

// The play and share buttons. The share button passes the Daily text that
// used to be shareResult's default.
export function initDailyGame(main) {
  ({ applyCardTier, passportEntryFor, openPostcard, recordHistory, syncPassport, clearReveal, Pin,
    makeBadgeTexture, ANSWER_COLOR, latLngToVec3, routeAxis, routeRadius, globe, camera, frameRevealPoints,
    safeStrip, travelView, nearAngle } = main);
  gameEls.play.addEventListener('click', startGame);
  gameEls.share.addEventListener('click', () => shareResult(shareText()));
}

// The next-game panel and its one-second tick.
export function initDailyCountdown() {
  nextGame = document.createElement('div');
  nextGame.className = 'next-game';
  nextGame.innerHTML = '<p class="eyebrow">Next game in</p><span class="next-game-time" role="timer">--:--:--</span><p class="next-game-sub">Five new places at midnight</p>';
  gameEls.status.after(nextGame);
  nextGameTime = nextGame.querySelector('.next-game-time');
  nextGameSub = nextGame.querySelector('.next-game-sub');
  countdownDay = localDateKey();
  setInterval(tickCountdown, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tickCountdown(); });
  nextGame.addEventListener('click', () => { if (nextGame.classList.contains('ready')) openNewDaily(); });
}

// The results header, the review screen, its pins and routes, and listeners.
export function initReview() {
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
  reviewEls = {
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
    return { guess, answer, line, points: [], dim: 1 };
  });
  window.addEventListener('resize', () => reviewRounds.forEach((r) => r.line.material.resolution.set(state.viewW, state.viewH)));
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

}
