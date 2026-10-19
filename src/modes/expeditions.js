// ---------------------------------------------------------------------------
// Expeditions: player-selected, ordered seven-stop challenges. Progress is
// independent for every theme and only advances while that expedition is active.
//
// Moved out of main.js in refactor Phase 4. The picker's styles (shared with
// the Blackout picker and the Survival hub) stay injected from main.js where
// they always were. main.js reaches this module, and it reaches main.js, only
// through initExpeditions(host) at the spot the section used to run.
//
// Weekly Expeditions (free tier) share the picker and the round variant: a
// "This week" card above the classics starts a session over the stops open
// today (weekly.js holds the calendar rules), and past weeks list below.
// ---------------------------------------------------------------------------
import { isPlayableLocation } from '../daily.js';
import { WEEKLY_KEY } from '../core/config.js';
import { localDateKey } from '../core/format.js';
import { weekOf, stopStates, WEEK_STOPS } from './weekly.js';

let host = null;
let expeditions = [];
let expeditionState = { progress: {} };
// weekly is null for a classic run; for a weekly session it holds
// { week, stops: [stop indices to play, in route order], pos, completedWeek }.
export const expeditionRun = { active: false, expedition: null, item: null, index: 0, weekly: null };

export let expeditionPicker = null;
let expeditionList = null;
let weeklySlot = null;
let weeklyArchive = null;
let weeklyRoutes = [];
// where-on-earth-weekly-v1: { weeks: { [Monday YYYY-MM-DD]: { route, played: { [stop]: dateKey }, badge } } }.
// The current week is the entry for this week's Monday; earlier entries are the archive.
let weeklyState = { weeks: {} };

function loadExpeditionState() {
  const saved = host.readJSON(host.EXPEDITION_KEY);
  expeditionState = saved && saved.progress && typeof saved.progress === 'object' ? saved : { progress: {} };
}

function expeditionProgress(expedition) {
  const saved = expeditionState.progress[expedition.id] || {};
  const total = expeditionLocations(expedition).length;
  const completed = host.clamp(Number(saved.completed) || 0, 0, total);
  return { completed, complete: completed >= total };
}

function expeditionLocations(expedition) {
  return expedition.locationIds
    .map((id) => host.findLocation(id))
    .filter(isPlayableLocation);
}

function expeditionLocation(expedition, index) {
  return expeditionLocations(expedition)[index];
}

// Stops resolve against both the cities and the landmarks file, so the entry
// stays disabled until both have loaded (a half-loaded list would skew progress).
export function updateExpeditionEntry() {
  const ready = Boolean(host.locations.length && host.landmarks
    && expeditions.some((expedition) => expeditionLocations(expedition).length));
  // The button starts hidden in the markup so it never shows before it can be
  // played; readiness is also what reveals it (previously nothing un-hid it,
  // so the mode was unreachable from the home screen).
  host.gameEls.expeditionsEntry.hidden = !ready;
  host.gameEls.expeditionsEntry.disabled = !ready;
  // The label names the live week, the time-bound content in the picker.
  const route = thisWeek().route;
  host.gameEls.expeditionsEntry.querySelector('.mode-desc').textContent = route ? `This week: ${route.name}` : 'Themed journeys';
}

export function completeExpeditionRound() {
  if (expeditionRun.weekly) {
    completeWeeklyStop();
    return;
  }
  const expedition = expeditionRun.expedition;
  const progress = expeditionProgress(expedition);
  progress.completed = Math.max(progress.completed, expeditionRun.index + 1);
  progress.complete = progress.completed >= expeditionLocations(expedition).length;
  expeditionState.progress[expedition.id] = progress;
  host.writeJSON(host.EXPEDITION_KEY, expeditionState);
}

function loadWeeklyState() {
  const saved = host.readJSON(WEEKLY_KEY);
  weeklyState = saved && saved.weeks && typeof saved.weeks === 'object' ? saved : { weeks: {} };
}

const thisWeek = () => weekOf(new Date(), weeklyRoutes);
const weeklyPlayed = (week) => weeklyState.weeks[week.start]?.played || {};
const playedCount = (record) => Object.keys(record?.played || {}).length;

function weeklyStop(route, index) {
  const item = host.findLocation(route.locationIds[index]);
  return isPlayableLocation(item) ? item : null;
}

// Stops playable right now, in route order: open by the calendar, not yet
// played this week, and resolvable to a playable location.
function weeklyPlayable(week) {
  if (!week.route) return [];
  return stopStates(week, weeklyPlayed(week)).flatMap((stopState, index) => (stopState === 'open' && weeklyStop(week.route, index) ? [index] : []));
}

function completeWeeklyStop() {
  const session = expeditionRun.weekly;
  const { week } = session;
  const record = weeklyState.weeks[week.start] ||= { route: week.route.id, played: {}, badge: false };
  record.played[expeditionRun.index] ??= localDateKey();
  if (playedCount(record) >= WEEK_STOPS && !record.badge) {
    record.badge = true;
    session.completedWeek = true;
  }
  host.writeJSON(WEEKLY_KEY, weeklyState);
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function renderWeeklyCard() {
  const week = thisWeek();
  if (!week.route) {
    weeklySlot.replaceChildren();
    return;
  }
  const states = stopStates(week, weeklyPlayed(week));
  const playable = weeklyPlayable(week);
  const done = playedCount(weeklyState.weeks[week.start]);
  const complete = done >= WEEK_STOPS;
  const missed = states.some((stopState, index) => stopState === 'locked' && index < week.weekday);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'expedition-choice expedition-weekly-card';
  button.dataset.weekly = week.start;
  button.disabled = !playable.length;
  button.innerHTML = `<span><small class="weekly-eyebrow">This week</small><strong></strong><small class="weekly-sub"></small><span class="weekly-dots"></span><small class="weekly-progress"></small></span><span class="badge"></span>`;
  button.querySelector('strong').textContent = week.route.name;
  button.querySelector('.weekly-sub').textContent = week.route.sub;
  const dots = button.querySelector('.weekly-dots');
  dots.setAttribute('aria-label', states.map((stopState, index) => `${DAY_NAMES[index]} ${stopState}`).join(', '));
  dots.replaceChildren(...states.map((stopState, index) => {
    const dot = document.createElement('span');
    dot.className = 'weekly-dot';
    dot.dataset.state = stopState;
    if (index === week.weekday) dot.dataset.today = 'true';
    dot.textContent = DAY_NAMES[index][0];
    return dot;
  }));
  const status = complete ? 'Week complete'
    : playable.length > 1 ? `${playable.length} stops open today`
    : playable.length ? `Stop ${playable[0] + 1} open today`
    : 'Next stop opens tomorrow';
  button.querySelector('.weekly-progress').textContent = `${done} of ${WEEK_STOPS} stops · ${status}${missed && !complete ? ' · Missed stops open Sunday' : ''}`;
  button.querySelector('.badge').textContent = complete ? '🏅' : playable.length ? '›' : '';
  weeklySlot.replaceChildren(button);
}

function weekRangeText(start) {
  const from = new Date(`${start}T12:00:00`);
  const to = new Date(from);
  to.setDate(to.getDate() + 6);
  const fmt = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(from)} to ${fmt(to)}`;
}

// Past weeks, newest first. Not replayable: plain rows, not buttons.
function renderWeeklyArchive() {
  const current = thisWeek().start;
  const past = Object.entries(weeklyState.weeks).filter(([start]) => start < current).sort(([a], [b]) => (a < b ? 1 : -1));
  weeklyArchive.hidden = !past.length;
  weeklyArchive.querySelector('summary').textContent = `Past weeks (${past.length})`;
  weeklyArchive.querySelector('.expedition-list').replaceChildren(...past.map(([start, record]) => {
    const row = document.createElement('div');
    row.className = 'expedition-choice expedition-archive-row';
    row.dataset.weeklyArchive = start;
    row.innerHTML = `<span><strong></strong><small></small></span><span class="badge"></span>`;
    row.querySelector('strong').textContent = weeklyRoutes.find((route) => route.id === record.route)?.name || record.route;
    row.querySelector('small').textContent = `${weekRangeText(start)} · ${playedCount(record)} of ${WEEK_STOPS} stops`;
    row.querySelector('.badge').textContent = record.badge ? '🏅' : '';
    return row;
  }));
}

function renderExpeditionPicker(highlightId = '') {
  renderWeeklyCard();
  renderWeeklyArchive();
  expeditionList.replaceChildren(...expeditions.filter((expedition) => expeditionLocations(expedition).length).map((expedition) => {
    const progress = expeditionProgress(expedition);
    const total = expeditionLocations(expedition).length;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'expedition-choice';
    button.dataset.expeditionId = expedition.id;
    if (expedition.id === highlightId) button.dataset.justCompleted = 'true';
    button.innerHTML = `<span class="emoji"></span><span><strong></strong><small></small></span><span class="badge"></span>`;
    button.querySelector('.emoji').textContent = expedition.emoji || '🧭';
    button.querySelector('strong').textContent = expedition.theme;
    button.querySelector('small').textContent = progress.complete ? `${total}/${total} completed · Replay` : `${progress.completed}/${total} completed`;
    button.querySelector('.badge').textContent = progress.complete ? '🏅' : '›';
    return button;
  }));
}

function showExpeditionPicker(highlightId = '') {
  expeditionRun.active = false;
  host.clearReveal();
  host.hideScreens();
  host.gameMode = 'expeditions';
  window.__canGuess = false;
  renderExpeditionPicker(highlightId);
  expeditionPicker.hidden = false;
}

function beginRun(expedition, weekly, index, item) {
  expeditionPicker.hidden = true;
  host.survival.active = false;
  host.endless.active = false;
  host.borders.active = false;
  expeditionRun.active = true;
  expeditionRun.expedition = expedition;
  expeditionRun.weekly = weekly;
  expeditionRun.index = index;
  expeditionRun.item = item;
  host.runHaul.length = 0;
  host.showRound();
}

function startExpedition(id) {
  const expedition = expeditions.find((item) => item.id === id);
  if (!expedition) return;
  const progress = expeditionProgress(expedition);
  const index = progress.complete ? 0 : progress.completed;
  const item = expeditionLocation(expedition, index);
  if (!item) return;
  beginRun(expedition, null, index, item);
}

// One session over every stop open right now: usually today's single stop,
// up to all seven on a catch-up Sunday.
function startWeekly() {
  const week = thisWeek();
  const stops = weeklyPlayable(week);
  if (!stops.length) return;
  beginRun(null, { week, stops, pos: 0, completedWeek: false }, stops[0], weeklyStop(week.route, stops[0]));
}

// assets/expeditions.json arrived (main.js starts the fetch with the other loads).
export function expeditionsLoaded(data) {
  expeditions = Array.isArray(data) ? data : [];
  loadExpeditionState();
  updateExpeditionEntry();
}

// assets/weekly-expeditions.json arrived. A failed load only hides the weekly card.
export function weeklyRoutesLoaded(data) {
  weeklyRoutes = Array.isArray(data) ? data : [];
  loadWeeklyState();
  updateExpeditionEntry();
}

// The round screen's Expeditions variant (main.js showRound, revealGuess and
// nextRound call these while expeditionRun.active).
export function expeditionRoundHeader() {
  const { gameEls } = host;
  document.body.classList.add('expedition-mode');
  gameEls.weight.style.display = 'none';
  gameEls.dailyDate.hidden = true;
  if (expeditionRun.weekly) {
    gameEls.number.textContent = `🧭 ${expeditionRun.weekly.week.route.name} · ${expeditionRun.index + 1}/${WEEK_STOPS}`;
    return;
  }
  const total = expeditionLocations(expeditionRun.expedition).length;
  gameEls.number.textContent = `${expeditionRun.expedition.emoji || '🧭'} ${expeditionRun.expedition.theme} · ${expeditionRun.index + 1}/${total}`;
}

export function expeditionRevealCard(pill) {
  const { gameEls } = host;
  const session = expeditionRun.weekly;
  if (session) {
    const done = playedCount(weeklyState.weeks[session.week.start]);
    gameEls.score.textContent = `${done}/${WEEK_STOPS}`;
    pill.textContent = session.completedWeek ? '🏅 Week complete!' : `${done}/${WEEK_STOPS} this week`;
    pill.classList.add('safe');
    gameEls.next.textContent = session.pos + 1 < session.stops.length ? 'Next stop' : session.completedWeek ? 'See badge' : 'Done';
    return;
  }
  const total = expeditionLocations(expeditionRun.expedition).length;
  const finished = expeditionRun.index + 1 >= total;
  gameEls.score.textContent = `${expeditionRun.index + 1}/${total}`;
  pill.textContent = finished ? '🏅 Expedition complete!' : `${expeditionRun.index + 1}/${total} complete`;
  pill.classList.add('safe');
  gameEls.next.textContent = finished ? 'See badge' : 'Next stop';
}

export function expeditionNext() {
  const session = expeditionRun.weekly;
  if (session) {
    if (session.pos + 1 < session.stops.length) {
      session.pos += 1;
      expeditionRun.index = session.stops[session.pos];
      expeditionRun.item = weeklyStop(session.week.route, expeditionRun.index);
      host.showRound();
    } else if (session.completedWeek) {
      host.showRunHaul(() => showExpeditionPicker(), 'See badge', "🏅 Week complete! This week's badge is yours.");
    } else {
      host.showRunHaul(() => showExpeditionPicker(), 'Back to expeditions');
    }
    return;
  }
  if (expeditionRun.index + 1 >= expeditionLocations(expeditionRun.expedition).length) {
    const { id } = expeditionRun.expedition;
    host.showRunHaul(() => showExpeditionPicker(id), 'See badge');
  }
  else {
    expeditionRun.index += 1;
    expeditionRun.item = expeditionLocation(expeditionRun.expedition, expeditionRun.index);
    host.showRound();
  }
}

// Section setup, run from main.js right after the picker styles are injected.
export function initExpeditions(main) {
  host = main;
  expeditionPicker = document.createElement('section');
  expeditionPicker.className = 'expedition-picker';
  expeditionPicker.hidden = true;
  expeditionPicker.innerHTML = `<div class="expedition-panel" role="dialog" aria-modal="true" aria-labelledby="expedition-heading">
  <h2 id="expedition-heading">Choose an expedition</h2>
  <p>Hand-picked stops, played in order.</p>
  <div class="expedition-weekly"></div>
  <h3 class="expedition-section">Classic expeditions</h3>
  <div class="expedition-list"></div>
  <details class="expedition-archive" hidden><summary class="expedition-section">Past weeks</summary><div class="expedition-list"></div></details>
</div>`;
  document.body.appendChild(expeditionPicker);
  expeditionPicker.querySelector('.expedition-panel').prepend(host.createHomeButton());
  expeditionList = expeditionPicker.querySelector('.expedition-list');
  weeklySlot = expeditionPicker.querySelector('.expedition-weekly');
  weeklyArchive = expeditionPicker.querySelector('.expedition-archive');

  host.gameEls.expeditionsEntry.addEventListener('click', () => showExpeditionPicker());
  expeditionPicker.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-expedition-id]');
    if (choice) startExpedition(choice.dataset.expeditionId);
    else if (event.target.closest('[data-weekly]')) startWeekly();
    else if (event.target === expeditionPicker) host.goHome();
  });
}
